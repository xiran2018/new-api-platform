#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${ENV_FILE:-$repo_root/.env.docker}"
compose_file="$repo_root/docker-compose.prod.yml"

usage() {
  cat <<EOF
Usage: $0 [COMMAND]

Commands:
  config   Validate Compose configuration
  build    Build new-api and gateway locally
  pull     Pull PostgreSQL, Redis, new-api, and gateway images
  up       Build and start the complete stack (default)
  start    Start the complete stack without building
  down     Stop and remove containers, preserving volumes
  logs     Follow new-api and gateway logs
  ps       Show service status
  --help   Show this help without changing services
EOF
}

case "${1:-up}" in
  -h|--help) usage; exit 0 ;;
esac
echo "Command: ${1:-up}. Available: config build pull up start down logs ps; use --help for details."

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file. Create it from .env.docker.example and set strong secrets." >&2
  exit 1
fi

for name in POSTGRES_PASSWORD REDIS_PASSWORD SESSION_SECRET; do
  value="$(sed -n "s/^${name}=//p" "$env_file" | tail -n 1)"
  if [[ -z "$value" || "$value" == replace_with_* ]]; then
    echo "$name must be configured in $env_file" >&2
    exit 1
  fi
done

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose --env-file "$env_file" -f "$compose_file")
elif command -v docker-compose >/dev/null 2>&1; then
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
  compose=(docker-compose -f "$compose_file")
else
  echo "Docker Compose is not installed." >&2
  exit 1
fi

case "${1:-up}" in
  config) "${compose[@]}" config -q ;;
  build) "${compose[@]}" build new-api gateway ;;
  pull) "${compose[@]}" pull postgres redis new-api gateway ;;
  up) "${compose[@]}" up -d --build ;;
  start) "${compose[@]}" up -d --no-build ;;
  down) "${compose[@]}" down ;;
  logs) "${compose[@]}" logs -f new-api gateway ;;
  ps) "${compose[@]}" ps ;;
  *) usage >&2; exit 1 ;;
esac
