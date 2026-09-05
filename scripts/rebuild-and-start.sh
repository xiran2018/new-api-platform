#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 [--help]

Builds the web UI, starts new-api using core/new-api/.env, then starts gateway.
Environment:
  PLATFORM_GATEWAY_PORT   Public gateway port (default: 11115)
  --help                  Show this help without building or starting
EOF
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) usage >&2; exit 1 ;;
esac
echo "Options: PLATFORM_GATEWAY_PORT=public port (default 11115); --help=show help"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
core_dir="$repo_root/core/new-api"
gateway_dir="$repo_root/extensions/gateway"
internal_port="$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*\([^#[:space:]]*\).*/\1/p' "$core_dir/.env" | head -n 1)"

if [[ -z "$internal_port" ]]; then
  echo "PORT must be configured in $core_dir/.env" >&2
  exit 1
fi

"$repo_root/scripts/assemble-extensions.sh"

cd "$core_dir/web"
bun install --frozen-lockfile
bun run build

cd "$core_dir"
go run . &
new_api_pid=$!

cleanup() {
  kill "$new_api_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$gateway_dir"
PLATFORM_GATEWAY_UPSTREAM="http://127.0.0.1:${internal_port}" \
  PLATFORM_GATEWAY_PORT="${PLATFORM_GATEWAY_PORT:-11115}" \
  go run .
