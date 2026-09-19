#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
env_file="${ENV_FILE:-$repo_root/.env.docker}"
compose_file="${COMPOSE_FILE:-$repo_root/docker-compose.prod.yml}"

usage() {
  cat <<EOF
Usage: $0 [--help] [--services <service-list>]

Restarts the four long-running services in dependency order:
  postgres, redis, new-api, gateway

Examples:
  $0
      Restart postgres, redis, new-api, and gateway.
  $0 --services postgres,redis
      Recreate only the PostgreSQL and Redis containers.

The script recreates containers while preserving Docker volumes. It does not
pull new images and does not run the one-off platform-db-init service.

Environment overrides:
  ENV_FILE     Path to the environment file (default: .env.docker)
  COMPOSE_FILE Path to the Compose file (default: docker-compose.prod.yml)

Options:
  --services <service-list>
      Comma-separated services to restart. Supported values are:
      postgres, redis, new-api, gateway, all. Defaults to all.
  --help       Show this help and exit
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  "")
    requested_services="all"
    ;;
  --services)
    [[ $# -ge 2 ]] || die "--services requires a comma-separated service list"
    requested_services="$2"
    shift
    ;;
  --services=*)
    requested_services="${1#*=}"
    ;;
  *)
    usage >&2
    die "unknown option: $1"
    ;;
esac

case "$requested_services" in
  "")
    die "--services cannot be empty"
    ;;
  all)
    services=(postgres redis new-api gateway)
    ;;
  *)
    services=()
    IFS=',' read -r -a requested_values <<< "$requested_services"
    for service in "${requested_values[@]}"; do
      case "$service" in
        postgres|redis|new-api|gateway)
          # Skip duplicate values while preserving the restart order.
          found=false
          for existing in "${services[@]}"; do
            [[ "$existing" == "$service" ]] && found=true
          done
          [[ "$found" == true ]] || services+=("$service")
          ;;
        *)
          die "unsupported service: $service"
          ;;
      esac
    done
    [[ ${#services[@]} -gt 0 ]] || die "--services did not contain any valid service"
    ;;
esac

echo "Options: ENV_FILE=$env_file; COMPOSE_FILE=$compose_file; services=${services[*]}; --help=show help"

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

container_id() {
  "${compose[@]}" ps --all --quiet "$1" 2>/dev/null || true
}

wait_for_health() {
  local service="$1" timeout_seconds="${2:-120}" interval_seconds=2
  local id health
  id="$(container_id "$service")"
  [[ -n "$id" ]] || die "$service container was not created"

  for _ in $(seq 1 $((timeout_seconds / interval_seconds))); do
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
    case "$health" in
      healthy|running)
        echo "==> $service is $health"
        return 0
        ;;
      unhealthy|exited|dead)
        die "$service failed with state: $health"
        ;;
    esac
    sleep "$interval_seconds"
  done

  die "$service did not become healthy within ${timeout_seconds}s"
}

restart_service() {
  local service="$1"
  local timeout_seconds=60
  [[ "$service" == "new-api" ]] && timeout_seconds=180

  echo "==> Recreating $service"
  "${compose[@]}" up -d --no-deps --force-recreate "$service"
  wait_for_health "$service" "$timeout_seconds"
}

for service in "${services[@]}"; do
  restart_service "$service"
done

echo "==> Restarted ${#services[@]} service(s): ${services[*]}"
"${compose[@]}" ps "${services[@]}"
