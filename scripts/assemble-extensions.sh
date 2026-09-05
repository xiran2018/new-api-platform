#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/extensions"
backend_target_dir="$repo_root/core/new-api/platform"
frontend_target_dir="$repo_root/core/new-api/web/src/platform"
frontend_routes_source_dir="$repo_root/extensions/frontend-routes"
frontend_routes_target_dir="$repo_root/core/new-api/web/src/routes"

if [[ ! -d "$source_dir" || ! -d "$repo_root/core/new-api" ]]; then
  echo "Expected extensions/ and core/new-api/ below $repo_root" >&2
  exit 1
fi

rm -rf "$backend_target_dir" "$frontend_target_dir"
mkdir -p "$backend_target_dir" "$frontend_target_dir"
cp -R "$source_dir/backend/." "$backend_target_dir"
cp -R "$source_dir/frontend/." "$frontend_target_dir"
cp -R "$frontend_routes_source_dir/." "$frontend_routes_target_dir/"

echo "Assembled platform extensions and route mounts"
