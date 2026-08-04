#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/extensions"
backend_target_dir="$repo_root/core/new-api/platform"
frontend_target_dir="$repo_root/core/new-api/web/src/platform"
homepage_source_dir="$source_dir/homepage"
homepage_target_dir="$repo_root/core/new-api/web/public/home"

if [[ ! -d "$source_dir" || ! -d "$repo_root/core/new-api" ]]; then
  echo "Expected extensions/ and core/new-api/ below $repo_root" >&2
  exit 1
fi

rm -rf "$backend_target_dir" "$frontend_target_dir"
mkdir -p "$backend_target_dir" "$frontend_target_dir"
cp -R "$source_dir/backend/." "$backend_target_dir"
cp -R "$source_dir/frontend/." "$frontend_target_dir"

# Publish the independently maintained marketing home page as a same-origin
# static asset. Rsbuild copies web/public into web/dist, which the Go binary
# then embeds and serves at /home/.
rm -rf "$homepage_target_dir"
mkdir -p "$homepage_target_dir"
cp -R "$homepage_source_dir/." "$homepage_target_dir"

echo "Assembled platform extensions and published homepage at /home/"
