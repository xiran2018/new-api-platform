#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  migrate-docker-data.sh export [options]
  migrate-docker-data.sh restore --archive FILE --confirm-empty-target [options]

Export options:
  --output-dir DIR          Output directory (default: current directory)
  --env-file FILE          Source env file (default: core/new-api/.env)
  --postgres-container NAME  Source PostgreSQL container (default: postgres)
  --redis-container NAME     Source Redis container (default: redis)
  --app-container NAME       Source application container (auto-detected)
  --postgres-user USER       Source PostgreSQL user (default: root)
  --no-redis                 Do not export Redis
  --no-app-data              Do not export application /data
  --keep-app-running         Do not stop auto-detected application containers

Restore options:
  --archive FILE             Exported .tar.gz archive
  --deploy-dir DIR           Target deployment directory (default: /opt/llmapi-deploy)
  --postgres-user USER       Target PostgreSQL user (default: POSTGRES_USER or root)
  --no-redis                 Do not restore Redis
  --no-app-data              Do not restore application /data
  --confirm-empty-target     Required acknowledgement that target volumes are empty
EOF
}

die() { echo "Error: $*" >&2; exit 1; }
info() { echo "==> $*"; }
require() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

CLEANUP_DIR=""
cleanup() {
  if [[ -n "$CLEANUP_DIR" && -d "$CLEANUP_DIR" ]]; then
    rm -rf -- "$CLEANUP_DIR"
  fi
}
trap cleanup EXIT

load_env() {
  local file="$1"
  [[ -f "$file" ]] || die "environment file not found: $file"
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

compose_command() {
  local env_file="$1" compose_file="$2"
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose --env-file "$env_file" -f "$compose_file")
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose --env-file "$env_file" -f "$compose_file")
  else
    die "Docker Compose is required"
  fi
}

container_exists() { docker inspect "$1" >/dev/null 2>&1; }

compose_container_id() {
  local service="$1" id
  id="$("${COMPOSE[@]}" ps --all --quiet "$service" 2>/dev/null || true)"
  if [[ -z "$id" ]]; then
    id="$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)"
  fi
  echo "$id"
}

check_required_value() {
  local name="$1" value
  value="${!name:-}"
  [[ -n "$value" && "$value" != replace_with_* && "$value" != *YOUR_* ]] || die "$name is not configured in the target environment file"
}

restore_preflight() {
  local archive="$1" checksum="$2" deploy_dir="$3"
  info "Running restore preflight checks"
  docker info >/dev/null 2>&1 || die "Docker daemon is unavailable to the current user"
  check_required_value POSTGRES_PASSWORD
  check_required_value REDIS_PASSWORD
  check_required_value SESSION_SECRET
  [[ "${SESSION_COOKIE_SECURE:-}" == true ]] || die "SESSION_COOKIE_SECURE must be true for the HTTPS production deployment"
  [[ "${SESSION_COOKIE_TRUSTED_URL:-}" == https://* ]] || die "SESSION_COOKIE_TRUSTED_URL must be an https:// origin"
  [[ "${PUBLIC_PORT:-443}" == 443 ]] || die "PUBLIC_PORT must be 443 for this production procedure"

  local cert_dir="${GATEWAY_TLS_CERT_DIR:-$deploy_dir/certs}"
  [[ "$cert_dir" == /* ]] || cert_dir="$deploy_dir/${cert_dir#./}"
  local cert_file="$cert_dir/$(basename "${GATEWAY_TLS_CERT_FILE:-/certs/fullchain.pem}")"
  local key_file="$cert_dir/$(basename "${GATEWAY_TLS_KEY_FILE:-/certs/privkey.pem}")"
  [[ -s "$cert_file" ]] || die "TLS certificate not found: $cert_file"
  [[ -s "$key_file" ]] || die "TLS private key not found: $key_file"
  command -v openssl >/dev/null 2>&1 || die "openssl is required to validate TLS files"
  openssl x509 -in "$cert_file" -noout -checkend 86400 >/dev/null || die "TLS certificate is invalid or expires within 24 hours"
  local cert_key private_key
  cert_key="$(openssl x509 -in "$cert_file" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | cut -d' ' -f1)"
  private_key="$(openssl pkey -in "$key_file" -pubout -outform DER 2>/dev/null | sha256sum | cut -d' ' -f1)"
  [[ "$cert_key" == "$private_key" ]] || die "TLS certificate and private key do not match"
  local public_host="${SESSION_COOKIE_TRUSTED_URL#https://}"
  public_host="${public_host%%/*}"
  public_host="${public_host%%:*}"
  if [[ "$public_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    openssl x509 -in "$cert_file" -noout -checkip "$public_host" >/dev/null || die "TLS certificate does not contain IP $public_host"
  else
    openssl x509 -in "$cert_file" -noout -checkhost "$public_host" >/dev/null || die "TLS certificate does not contain host $public_host"
  fi

  local image
  for image in "${APP_IMAGE:-jingquanliang/new-api-platform:latest}" "${GATEWAY_IMAGE:-jingquanliang/new-api-platform-gateway:latest}" postgres:15 redis:latest; do
    docker image inspect "$image" >/dev/null 2>&1 || die "required image is not present; run docker-prod.sh pull: $image"
  done
  [[ -f "$archive" && -s "$archive" ]] || die "migration archive is missing or empty: $archive"
  [[ -f "$checksum" && -s "$checksum" ]] || die "checksum file is missing or empty: $checksum"
  (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$checksum")") >/dev/null
  "${COMPOSE[@]}" config -q
  local service
  for service in postgres redis new-api gateway; do
    [[ -z "$(compose_container_id "$service")" ]] || die "target service already has a container: $service"
  done
  if command -v ss >/dev/null 2>&1 && ss -lntH "sport = :443" | grep -q .; then
    die "host port 443 is already in use"
  fi
  info "Preflight passed: configuration, TLS, images, archive, empty target, and port 443 are ready"
}

stop_source_app() {
  local names=(
    new-api-platform_host-db-gateway_1
    new-api-platform_host-db-new-api_1
    new-api-platform_gateway_1
    new-api-platform_new-api_1
  )
  local running=() name
  for name in "${names[@]}"; do
    if [[ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || true)" == true ]]; then
      running+=("$name")
    fi
  done
  if ((${#running[@]})); then
    info "Stopping application containers: ${running[*]}"
    docker stop "${running[@]}" >/dev/null
  else
    info "No known running application containers found"
  fi
}

detect_source_app() {
  local candidates=(
    new-api-platform_host-db-new-api_1
    new-api-platform_new-api_1
  ) name
  for name in "${candidates[@]}"; do
    if container_exists "$name"; then echo "$name"; return; fi
  done
}

export_data() {
  local repo_root output_dir env_file postgres_container redis_container app_container
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  output_dir="$PWD"
  env_file="$repo_root/core/new-api/.env"
  postgres_container=postgres redis_container=redis app_container=""
  local postgres_user=root export_redis=true export_app=true stop_app=true

  while (($#)); do
    case "$1" in
      --output-dir) output_dir="$2"; shift 2 ;;
      --env-file) env_file="$2"; shift 2 ;;
      --postgres-container) postgres_container="$2"; shift 2 ;;
      --redis-container) redis_container="$2"; shift 2 ;;
      --app-container) app_container="$2"; shift 2 ;;
      --postgres-user) postgres_user="$2"; shift 2 ;;
      --no-redis) export_redis=false; shift ;;
      --no-app-data) export_app=false; shift ;;
      --keep-app-running) stop_app=false; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown export option: $1" ;;
    esac
  done

  require docker; require tar; require sha256sum
  load_env "$env_file"
  container_exists "$postgres_container" || die "PostgreSQL container not found: $postgres_container"
  if [[ "$export_redis" == true ]]; then
    [[ -n "${REDIS_PASSWORD:-}" ]] || die "REDIS_PASSWORD is missing in $env_file"
    container_exists "$redis_container" || die "Redis container not found: $redis_container"
  fi
  [[ "$stop_app" == false ]] || stop_source_app
  [[ -n "$app_container" ]] || app_container="$(detect_source_app || true)"

  mkdir -p "$output_dir"
  local work archive stamp
  work="$(mktemp -d "$output_dir/.llmapi-migration.XXXXXX")"
  CLEANUP_DIR="$work"
  mkdir -p "$work/payload/app-data"

  info "Exporting PostgreSQL databases"
  docker exec "$postgres_container" pg_dump -U "$postgres_user" -Fc --no-owner --no-acl new-api > "$work/payload/new-api.dump"
  docker exec "$postgres_container" pg_dump -U "$postgres_user" -Fc --no-owner --no-acl platform_db > "$work/payload/platform_db.dump"
  [[ -s "$work/payload/new-api.dump" && -s "$work/payload/platform_db.dump" ]] || die "PostgreSQL export is empty"
  docker exec -i "$postgres_container" pg_restore -l < "$work/payload/new-api.dump" >/dev/null
  docker exec -i "$postgres_container" pg_restore -l < "$work/payload/platform_db.dump" >/dev/null

  if [[ "$export_redis" == true ]]; then
    info "Creating and exporting Redis snapshot"
    docker exec "$redis_container" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE | grep -qx OK
    docker exec "$redis_container" test -s /data/dump.rdb
    docker cp "$redis_container":/data/dump.rdb "$work/payload/redis.rdb" >/dev/null
  fi

  if [[ "$export_app" == true && -n "$app_container" ]]; then
    info "Exporting /data from $app_container"
    docker cp "$app_container":/data/. "$work/payload/app-data/" >/dev/null
  elif [[ "$export_app" == true ]]; then
    info "No application container found; app-data will be empty"
  fi

  {
    echo "created_at=$(date -Is)"
    echo "postgres_container=$postgres_container"
    echo "postgres_version=$(docker exec "$postgres_container" postgres --version)"
    echo "redis_included=$export_redis"
    echo "app_data_included=$export_app"
  } > "$work/payload/manifest.txt"

  stamp="$(date +%Y%m%d-%H%M%S)"
  archive="$output_dir/llmapi-migration-$stamp.tar.gz"
  tar -C "$work" -czf "$archive" payload
  (cd "$output_dir" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
  chmod 600 "$archive" "$archive.sha256"
  info "Export complete"
  echo "Archive:  $archive"
  echo "Checksum: $archive.sha256"
  echo "Transfer both files to the new server with scp."
}

restore_data() {
  local archive="" deploy_dir=/opt/llmapi-deploy postgres_user=""
  local restore_redis=true restore_app=true confirmed=false
  while (($#)); do
    case "$1" in
      --archive) archive="$2"; shift 2 ;;
      --deploy-dir) deploy_dir="$2"; shift 2 ;;
      --postgres-user) postgres_user="$2"; shift 2 ;;
      --no-redis) restore_redis=false; shift ;;
      --no-app-data) restore_app=false; shift ;;
      --confirm-empty-target) confirmed=true; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown restore option: $1" ;;
    esac
  done
  [[ "$confirmed" == true ]] || die "restore requires --confirm-empty-target"
  [[ -n "$archive" && -f "$archive" ]] || die "archive not found: $archive"
  local checksum="$archive.sha256" env_file="$deploy_dir/.env.docker" compose_file="$deploy_dir/docker-compose.prod.yml"
  [[ -f "$checksum" ]] || die "checksum file not found: $checksum"
  [[ -f "$compose_file" ]] || die "Compose file not found: $compose_file"
  require docker; require tar; require sha256sum
  load_env "$env_file"
  postgres_user="${postgres_user:-${POSTGRES_USER:-root}}"
  compose_command "$env_file" "$compose_file"
  restore_preflight "$archive" "$checksum" "$deploy_dir"

  info "Verifying archive"
  (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$checksum")")
  local work
  work="$(mktemp -d)"
  CLEANUP_DIR="$work"
  tar -C "$work" -xzf "$archive"
  local payload="$work/payload"
  [[ -s "$payload/new-api.dump" && -s "$payload/platform_db.dump" ]] || die "database dumps are missing"

  info "Starting PostgreSQL and creating platform_db"
  "${COMPOSE[@]}" up -d postgres
  "${COMPOSE[@]}" run --rm platform-db-init
  info "Restoring PostgreSQL databases"
  "${COMPOSE[@]}" exec -T postgres pg_restore -U "$postgres_user" -d new-api --clean --if-exists --no-owner --no-acl --exit-on-error < "$payload/new-api.dump"
  "${COMPOSE[@]}" exec -T postgres pg_restore -U "$postgres_user" -d platform_db --clean --if-exists --no-owner --no-acl --exit-on-error < "$payload/platform_db.dump"

  if [[ "$restore_redis" == true && -s "$payload/redis.rdb" ]]; then
    info "Restoring Redis"
    "${COMPOSE[@]}" create redis
    local redis_id
    redis_id="$(compose_container_id redis)"
    [[ -n "$redis_id" ]] || die "cannot find target Redis container"
    docker cp "$payload/redis.rdb" "$redis_id":/data/dump.rdb >/dev/null
    "${COMPOSE[@]}" start redis
  fi

  if [[ "$restore_app" == true && -n "$(find "$payload/app-data" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
    info "Restoring application /data"
    "${COMPOSE[@]}" create --no-deps new-api
    local app_id
    app_id="$(compose_container_id new-api)"
    [[ -n "$app_id" ]] || die "cannot find target application container"
    docker cp "$payload/app-data/." "$app_id":/data/ >/dev/null
  fi

  info "Starting complete Docker stack"
  "${COMPOSE[@]}" up -d --no-build
  "${COMPOSE[@]}" ps
  info "Restore complete. Verify HTTPS, login, balances, orders, FAQ, invoices, and uploaded files."
}

case "${1:-}" in
  export) shift; export_data "$@" ;;
  restore) shift; restore_data "$@" ;;
  -h|--help) usage ;;
  *) usage; exit 1 ;;
esac
