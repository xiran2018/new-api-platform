#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy_dir="$(cd "$script_dir/.." && pwd)"
env_file="${ENV_FILE:-$deploy_dir/.env.docker}"
compose_file="${COMPOSE_FILE:-$deploy_dir/docker-compose.prod.yml}"
pull_images=true
host_db_mode=false
compose_file_explicit=false
[[ -n "${COMPOSE_FILE:-}" ]] && compose_file_explicit=true

die() { echo "Error: $*" >&2; exit 1; }
container_id() { "${compose[@]}" ps --all --quiet "$1" 2>/dev/null || "${compose[@]}" ps -q "$1" 2>/dev/null || true; }

usage() {
  cat <<EOF
Usage: $0 [--NoPull] [--HostDB]

  $0          Pull configured images, then recreate new-api and gateway (default)
  $0 --NoPull Use existing local images without pulling, then recreate both
  $0 --HostDB Use docker-compose.host-db.yml and existing PostgreSQL/Redis services
  $0 --help   Show this help without changing containers
EOF
}

while (($#)); do
  case "$1" in
    --NoPull) pull_images=false; shift ;;
    --HostDB) host_db_mode=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

if [[ "$host_db_mode" == false && "$compose_file_explicit" == false ]] && \
   docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'host-db-new-api'; then
  host_db_mode=true
  echo "==> Detected an existing host-db deployment"
fi
if [[ "$host_db_mode" == true ]]; then
  compose_file="$deploy_dir/docker-compose.host-db.yml"
fi

echo "Options: default=pull images; --NoPull=use local images; --HostDB=use existing database services; --help=show help"

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
app_service="new-api"
gateway_service="gateway"
postgres_before=""
redis_before=""
if [[ "$host_db_mode" == true ]]; then
  app_service="host-db-new-api"
  gateway_service="host-db-gateway"
  echo "==> Host-db mode: database availability will be verified by the application health check"
else
  postgres_before="$(container_id postgres)"
  redis_before="$(container_id redis)"
  [[ -n "$postgres_before" ]] || die "PostgreSQL container does not exist"
  [[ -n "$redis_before" ]] || die "Redis container does not exist"
  [[ "$(docker inspect -f '{{.State.Running}}' "$postgres_before")" == true ]] || die "PostgreSQL container is not running"
  [[ "$(docker inspect -f '{{.State.Running}}' "$redis_before")" == true ]] || die "Redis container is not running"
fi

if [[ "$pull_images" == true ]]; then
  echo "==> Pulling application images only"
  "${compose[@]}" pull "$app_service" "$gateway_service"
else
  echo "==> Using existing local application images (omit --NoPull next time to update them)"
fi

echo "==> Recreating new-api without its dependencies"
"${compose[@]}" up -d --no-deps --force-recreate "$app_service"

echo "==> Waiting for new-api health check"
new_api_id="$(container_id "$app_service")"
[[ -n "$new_api_id" ]] || die "new-api container was not created"
for _ in $(seq 1 60); do
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$new_api_id")"
  [[ "$health" == healthy ]] && break
  [[ "$health" == unhealthy || "$health" == exited || "$health" == dead ]] && die "new-api failed with state: $health"
  sleep 2
done
[[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$new_api_id")" == healthy ]] || die "new-api did not become healthy within 120 seconds"

echo "==> Recreating gateway without its dependencies"
"${compose[@]}" up -d --no-deps --force-recreate "$gateway_service"
gateway_id="$(container_id "$gateway_service")"
[[ -n "$gateway_id" ]] || die "gateway container was not created"
[[ "$(docker inspect -f '{{.State.Running}}' "$gateway_id")" == true ]] || die "gateway container is not running"

if [[ "$host_db_mode" == false ]]; then
  [[ "$(container_id postgres)" == "$postgres_before" ]] || die "PostgreSQL container changed unexpectedly"
  [[ "$(container_id redis)" == "$redis_before" ]] || die "Redis container changed unexpectedly"
fi

echo "==> Application containers recreated; PostgreSQL and Redis were not recreated"
"${compose[@]}" ps
