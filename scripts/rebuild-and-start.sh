#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
core_dir="$repo_root/core/new-api"

"$repo_root/scripts/assemble-extensions.sh"

cd "$core_dir/web"
bun run build

cd "$core_dir"
exec go run .
