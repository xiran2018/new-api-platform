#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
core_dir="$repo_root/core/new-api"
upstream_url="https://github.com/QuantumNous/new-api.git"

if [[ ! -d "$core_dir/.git" ]]; then
  echo "core/new-api must be an upstream Git checkout" >&2
  exit 1
fi

if ! git -C "$core_dir" remote get-url upstream >/dev/null 2>&1; then
  echo "Missing upstream remote. Configure it once with:" >&2
  echo "  git -C \"$core_dir\" remote add upstream $upstream_url" >&2
  exit 1
fi

git -C "$core_dir" -c core.pager=cat fetch upstream

mode="${1:---check}"
if [[ "$mode" != "--check" && "$mode" != "--merge" ]]; then
  echo "Usage: $0 [--check|--merge]" >&2
  exit 1
fi

echo
echo "=== Incoming upstream commits ==="
git -C "$core_dir" --no-pager log --oneline HEAD..upstream/main

echo
echo "=== Changed files summary ==="
git -C "$core_dir" --no-pager diff --stat HEAD..upstream/main

echo
echo "=== Merge safety check ==="
merge_base="$(git -C "$core_dir" merge-base HEAD upstream/main)"
merge_preview="$(git -C "$core_dir" merge-tree "$merge_base" HEAD upstream/main)"
if ! grep -q '^<<<<<<< ' <<<"$merge_preview"; then
  echo "Clean merge: yes"
else
  echo "Clean merge: no. Resolve the reported conflicts before using --merge." >&2
  echo "$merge_preview" >&2
  exit 1
fi

if [[ "$mode" == "--check" ]]; then
  echo
  echo "No files were changed. Review the commits and summary above."
  echo "If they are acceptable, run: $0 --merge"
  exit 0
fi

if [[ -n "$(git -C "$core_dir" status --porcelain)" ]]; then
  echo "Refusing to merge: core/new-api has uncommitted changes." >&2
  echo "Save platform work first, then rerun --merge:" >&2
  echo "  git -C \"$core_dir\" add -A" >&2
  echo "  git -C \"$core_dir\" commit -m 'feat: add platform extension seams'" >&2
  echo "Alternatively, use git -C \"$core_dir\" stash -u for a temporary save." >&2
  exit 1
fi

git -C "$core_dir" merge --no-edit upstream/main

"$repo_root/scripts/assemble-extensions.sh"

(
  cd "$core_dir/web"
  bun run build
  bun run typecheck
)

(
  cd "$core_dir"
  go build ./router ./platform
)

echo "Upstream sync checks completed. Review core/new-api git status before committing."
