#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy_dir="$(cd "$script_dir/.." && pwd)"
env_file="${ENV_FILE:-$deploy_dir/.env.docker}"
compose_file="${COMPOSE_FILE:-$deploy_dir/docker-compose.prod.yml}"

die() { echo "Error: $*" >&2; exit 1; }
container_id() { "${compose[@]}" ps --all --quiet "$1" 2>/dev/null || "${compose[@]}" ps -q "$1" 2>/dev/null || true; }

command -v docker >/dev/null 2>&1 || die "Docker is not installed"
docker info >/dev/null 2>&1 || die "Docker daemon is unavailable to the current user"
[[ -f "$env_file" ]] || die "environment file not found: $env_file"
[[ -f "$compose_file" ]] || die "Compose file not found: $compose_file"

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose --env-file "$env_file" -f "$compose_file")
elif command -v docker-compose >/dev/null 2>&1; then
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
  compose=(docker-compose -f "$compose_file")
else
  die "Docker Compose is not installed"
fi

"${compose[@]}" config -q
postgres_before="$(container_id postgres)"
redis_before="$(container_id redis)"
[[ -n "$postgres_before" ]] || die "PostgreSQL container does not exist"
[[ -n "$redis_before" ]] || die "Redis container does not exist"
[[ "$(docker inspect -f '{{.State.Running}}' "$postgres_before")" == true ]] || die "PostgreSQL container is not running"
[[ "$(docker inspect -f '{{.State.Running}}' "$redis_before")" == true ]] || die "Redis container is not running"

echo "==> Pulling application images only"
"${compose[@]}" pull new-api gateway

echo "==> Recreating new-api without its dependencies"
"${compose[@]}" up -d --no-deps --force-recreate new-api

echo "==> Waiting for new-api health check"
new_api_id="$(container_id new-api)"
[[ -n "$new_api_id" ]] || die "new-api container was not created"
for _ in $(seq 1 60); do
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$new_api_id")"
  [[ "$health" == healthy ]] && break
  [[ "$health" == unhealthy || "$health" == exited || "$health" == dead ]] && die "new-api failed with state: $health"
  sleep 2
done
[[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$new_api_id")" == healthy ]] || die "new-api did not become healthy within 120 seconds"

echo "==> Recreating gateway without its dependencies"
"${compose[@]}" up -d --no-deps --force-recreate gateway

[[ "$(container_id postgres)" == "$postgres_before" ]] || die "PostgreSQL container changed unexpectedly"
[[ "$(container_id redis)" == "$redis_before" ]] || die "Redis container changed unexpectedly"

echo "==> Application update complete; PostgreSQL and Redis were not recreated"
"${compose[@]}" ps
