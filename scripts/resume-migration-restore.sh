#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 ARCHIVE [DEPLOY_DIR]

Arguments:
  ARCHIVE      Migration .tar.gz whose PostgreSQL restore already completed
  DEPLOY_DIR   Production deployment directory (default: /opt/llmapi-deploy)
  --help       Show this help without restoring data

Resumes only Redis and application /data restore, then starts the full stack.
EOF
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

archive="${1:-}"
deploy_dir="${2:-/opt/llmapi-deploy}"

if [[ -z "$archive" || ! -f "$archive" ]]; then
  usage >&2
  exit 1
fi
[[ $# -le 2 ]] || { usage >&2; exit 1; }
echo "Arguments: ARCHIVE=$archive; DEPLOY_DIR=$deploy_dir; use --help for details."

env_file="$deploy_dir/.env.docker"
compose_file="$deploy_dir/docker-compose.prod.yml"
[[ -f "$env_file" ]] || { echo "Missing $env_file" >&2; exit 1; }
[[ -f "$compose_file" ]] || { echo "Missing $compose_file" >&2; exit 1; }

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose --env-file "$env_file" -f "$compose_file")
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose --env-file "$env_file" -f "$compose_file")
else
  echo "Docker Compose is not installed." >&2
  exit 1
fi

echo "==> Checking completed prerequisites"
docker info >/dev/null 2>&1 || { echo "Docker daemon is unavailable" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a
for name in POSTGRES_PASSWORD REDIS_PASSWORD SESSION_SECRET; do
  value="${!name:-}"
  [[ -n "$value" && "$value" != replace_with_* && "$value" != *YOUR_* ]] || {
    echo "$name is not configured in $env_file" >&2
    exit 1
  }
done
[[ "${PUBLIC_PORT:-}" == 443 ]] || { echo "PUBLIC_PORT must be 443" >&2; exit 1; }
[[ "${SESSION_COOKIE_SECURE:-}" == true ]] || { echo "SESSION_COOKIE_SECURE must be true" >&2; exit 1; }
[[ "${SESSION_COOKIE_TRUSTED_URL:-}" == https://* ]] || { echo "SESSION_COOKIE_TRUSTED_URL must use https://" >&2; exit 1; }
cert_dir="${GATEWAY_TLS_CERT_DIR:-$deploy_dir/certs}"
[[ "$cert_dir" == /* ]] || cert_dir="$deploy_dir/${cert_dir#./}"
cert_file="$cert_dir/$(basename "${GATEWAY_TLS_CERT_FILE:-/certs/fullchain.pem}")"
key_file="$cert_dir/$(basename "${GATEWAY_TLS_KEY_FILE:-/certs/privkey.pem}")"
[[ -s "$cert_file" && -s "$key_file" ]] || { echo "TLS certificate or private key is missing in $cert_dir" >&2; exit 1; }
openssl x509 -in "$cert_file" -noout -checkend 86400 >/dev/null || { echo "TLS certificate is invalid or expires within 24 hours" >&2; exit 1; }
cert_key="$(openssl x509 -in "$cert_file" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | cut -d' ' -f1)"
private_key="$(openssl pkey -in "$key_file" -pubout -outform DER 2>/dev/null | sha256sum | cut -d' ' -f1)"
[[ "$cert_key" == "$private_key" ]] || { echo "TLS certificate and private key do not match" >&2; exit 1; }
for image in "${APP_IMAGE:-jingquanliang/new-api-platform:latest}" "${GATEWAY_IMAGE:-jingquanliang/new-api-platform-gateway:latest}" redis:latest; do
  docker image inspect "$image" >/dev/null 2>&1 || { echo "Required image is missing: $image" >&2; exit 1; }
done
"${compose[@]}" config -q
postgres_id="$("${compose[@]}" ps --all --quiet postgres 2>/dev/null || true)"
[[ -n "$postgres_id" && "$(docker inspect -f '{{.State.Running}}' "$postgres_id")" == true ]] || {
  echo "The restored PostgreSQL container is not running" >&2
  exit 1
}
docker exec "$postgres_id" psql -U "${POSTGRES_USER:-root}" -d new-api -tAc 'SELECT 1' | grep -qx 1
docker exec "$postgres_id" psql -U "${POSTGRES_USER:-root}" -d platform_db -tAc 'SELECT 1' | grep -qx 1
for database in new-api platform_db; do
  table_count="$(docker exec "$postgres_id" psql -U "${POSTGRES_USER:-root}" -d "$database" -tAc \
    "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
  [[ "$table_count" =~ ^[0-9]+$ && "$table_count" -gt 0 ]] || {
    echo "Database $database has no public tables; the PostgreSQL restore is not complete." >&2
    exit 1
  }
done
checksum="$archive.sha256"
[[ -s "$checksum" ]] || { echo "Missing checksum: $checksum" >&2; exit 1; }
(cd "$(dirname "$archive")" && sha256sum -c "$(basename "$checksum")")
echo "==> Prerequisites passed: configuration, TLS, archive, and both restored PostgreSQL databases are ready"

work_dir="$(mktemp -d /tmp/llmapi-resume.XXXXXX)"
cleanup() { rm -rf -- "$work_dir"; }
trap cleanup EXIT

echo "==> Extracting migration archive"
tar -C "$work_dir" -xzf "$archive"
payload="$work_dir/payload"
[[ -d "$payload" ]] || { echo "Invalid archive: payload directory is missing" >&2; exit 1; }

if [[ -s "$payload/redis.rdb" ]]; then
  echo "==> Restoring Redis"
  redis_id="$("${compose[@]}" ps --all --quiet redis 2>/dev/null || true)"
  if [[ -z "$redis_id" ]]; then
    "${compose[@]}" create redis
    redis_id="$("${compose[@]}" ps --all --quiet redis)"
  else
    echo "==> Detected the stopped Redis container left by the interrupted restore"
  fi
  [[ -n "$redis_id" ]] || { echo "Cannot find Redis container" >&2; exit 1; }
  if [[ "$(docker inspect -f '{{.State.Running}}' "$redis_id")" == true ]]; then
    echo "Redis is already running; refusing to overwrite its data." >&2
    exit 1
  fi
  docker cp "$payload/redis.rdb" "$redis_id":/data/dump.rdb >/dev/null
  "${compose[@]}" start redis
else
  echo "==> No Redis snapshot in archive; skipping"
fi

if [[ -d "$payload/app-data" && -n "$(find "$payload/app-data" -mindepth 1 -print -quit)" ]]; then
  echo "==> Restoring application /data"
  app_id="$("${compose[@]}" ps --all --quiet new-api 2>/dev/null || true)"
  if [[ -z "$app_id" ]]; then
    "${compose[@]}" create --no-deps new-api
    app_id="$("${compose[@]}" ps --all --quiet new-api)"
  fi
  [[ -n "$app_id" ]] || { echo "Cannot find new-api container" >&2; exit 1; }
  if [[ "$(docker inspect -f '{{.State.Running}}' "$app_id")" == true ]]; then
    echo "new-api is already running; refusing to overwrite its /data." >&2
    exit 1
  fi
  docker cp "$payload/app-data/." "$app_id":/data/ >/dev/null
else
  echo "==> No application data in archive; skipping"
fi

echo "==> Starting complete Docker stack"
"${compose[@]}" up -d --no-build
"${compose[@]}" ps

echo
echo "Restore resumed successfully. Check logs with:"
echo "  cd $deploy_dir && ./scripts/docker-prod.sh logs"
