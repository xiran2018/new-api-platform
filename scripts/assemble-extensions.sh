#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 [--help]

Copies backend, frontend, route, and frontend override sources into core/new-api.
  --help   Show this help without assembling files
EOF
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) usage >&2; exit 1 ;;
esac
echo "Options: --help=show help; no options=assemble all platform extensions"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/extensions"
backend_target_dir="$repo_root/core/new-api/platform"
frontend_target_dir="$repo_root/core/new-api/web/src/platform"
frontend_routes_source_dir="$repo_root/extensions/frontend-routes"
frontend_routes_target_dir="$repo_root/core/new-api/web/src/routes"
frontend_overrides_source_dir="$repo_root/extensions/frontend-overrides"
frontend_root_dir="$repo_root/core/new-api/web"

if [[ ! -d "$source_dir" || ! -d "$repo_root/core/new-api" ]]; then
  echo "Expected extensions/ and core/new-api/ below $repo_root" >&2
  exit 1
fi

rm -rf "$backend_target_dir" "$frontend_target_dir"
mkdir -p "$backend_target_dir" "$frontend_target_dir"
cp -R "$source_dir/backend/." "$backend_target_dir"
cp -R "$source_dir/frontend/." "$frontend_target_dir"
cp -R "$frontend_routes_source_dir/." "$frontend_routes_target_dir/"
cp -R "$frontend_overrides_source_dir/." "$frontend_root_dir/"

echo "Assembled platform extensions and route mounts"
