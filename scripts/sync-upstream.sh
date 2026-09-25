#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
core_dir="$repo_root/core/new-api"
# SSH is the default because this repository already uses SSH for the
# upstream checkout and it avoids the intermittent HTTPS/GnuTLS failures seen
# on the deployment network. Existing remotes are never overwritten.
upstream_url="git@github.com:QuantumNous/new-api.git"
tmp_root="${PLATFORM_TMP_DIR:-/data/new-api-tmp}"
mkdir -p "$tmp_root"

# Core files that carry stable platform extension seams. If an upstream
# refactor removes one of these seams, restore the last local version after
# the merge; the upstream change can then be ported deliberately instead of
# silently deleting platform functionality.
protected_core_seams=(
  "web/src/features/system-settings/models/model-pricing-sheet.tsx|PricingFieldAddonProvider"
  "web/src/features/system-settings/models/model-pricing-inputs.tsx|PricingFieldAddon"
  "web/src/features/system-settings/models/tier-price-fields.tsx|PricingFieldAddon"
  "web/src/features/system-settings/models/tiered-pricing-editor.tsx|PLATFORM_BILLING_PRESET_GROUPS"
  "web/src/features/system-settings/models/visual-billing-document-editor.tsx|supportsPlatformVisualBillingDocumentEditor"
)

restore_removed_platform_seams() {
  local before_commit="$1"
  local entry path marker
  for entry in "${protected_core_seams[@]}"; do
    path="${entry%%|*}"
    marker="${entry#*|}"
    if git -C "$core_dir" show "$before_commit:$path" 2>/dev/null | grep -Fq "$marker" \
      && ! grep -Fq "$marker" "$core_dir/$path" 2>/dev/null; then
      git -C "$core_dir" checkout "$before_commit" -- "$path"
      echo "Preserved platform seam in core/$path (upstream removed $marker)."
    fi
  done
}

# The platform extensions are intentionally outside core/new-api. Keep a
# manifest of files that were already missing before this run so a future
# sync/assembly change cannot silently delete an existing extension file.
declare -A extension_files_missing_before=()
while IFS= read -r extension_file; do
  [[ -z "$extension_file" ]] && continue
  if [[ ! -e "$repo_root/$extension_file" ]]; then
    extension_files_missing_before["$extension_file"]=1
  fi
done < <(git -C "$repo_root" ls-files -- extensions)

verify_extensions_preserved() {
  local missing=()
  while IFS= read -r extension_file; do
    [[ -z "$extension_file" ]] && continue
    if [[ ! -e "$repo_root/$extension_file" ]] && [[ -z "${extension_files_missing_before[$extension_file]+x}" ]]; then
      missing+=("$extension_file")
    fi
  done < <(git -C "$repo_root" ls-files -- extensions)

  if ((${#missing[@]} > 0)); then
    echo "Refusing to continue: an existing platform extension file disappeared during sync:" >&2
    printf '  %s\n' "${missing[@]}" >&2
    echo "Restore the extension and resolve the change explicitly before retrying." >&2
    exit 1
  fi
}

usage() {
  cat <<EOF
Usage: $0 [--check|--merge|--sync|--help]

  --check   Fetch and report merge safety without changing files (default)
  --merge   Merge upstream/main and run builds, without pushing
  --sync    Merge, verify, push the core fork, and commit/push submodule pointer
  --help    Show this help without fetching or changing files
EOF
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

if [[ ! -e "$core_dir/.git" ]]; then
  echo "core/new-api must be a Git checkout or submodule" >&2
  exit 1
fi

if ! git -C "$core_dir" remote get-url upstream >/dev/null 2>&1; then
  echo "Missing upstream remote. Configure it once with:" >&2
  echo "  git -C \"$core_dir\" remote add upstream $upstream_url" >&2
  exit 1
fi

mode="${1:---check}"
if [[ "$mode" != "--check" && "$mode" != "--merge" && "$mode" != "--sync" ]]; then
  usage >&2
  exit 1
fi
echo "Mode: $mode. Available: --check --merge --sync; use --help for details."

if [[ -n "$(git -C "$core_dir" status --porcelain)" ]]; then
  echo "Refusing to sync: core/new-api has uncommitted changes." >&2
  echo "Commit or stash them before running this script." >&2
  exit 1
fi

verify_extensions_preserved

git -C "$core_dir" switch main
git -C "$core_dir" config rerere.enabled true
git -C "$core_dir" config rerere.autoupdate true
git -C "$core_dir" -c core.pager=cat fetch origin
git -C "$core_dir" -c core.pager=cat fetch upstream

if git -C "$core_dir" merge-base --is-ancestor origin/main HEAD; then
  echo "Local main already contains origin/main; keeping local commits."
elif git -C "$core_dir" merge-base --is-ancestor HEAD origin/main; then
  git -C "$core_dir" merge --ff-only origin/main
else
  echo "Refusing to sync: local main and origin/main have diverged." >&2
  echo "Review both sides in core/new-api before merging upstream." >&2
  exit 1
fi

echo
echo "=== Incoming upstream commits ==="
incoming_count="$(git -C "$core_dir" rev-list --count HEAD..upstream/main)"
if [[ "$incoming_count" -eq 0 ]]; then
  echo "(none)"
else
  git -C "$core_dir" --no-pager log --oneline HEAD..upstream/main
fi

echo
echo "=== Changed files summary ==="
if [[ "$incoming_count" -eq 0 ]]; then
  echo "(none)"
else
  git -C "$core_dir" --no-pager diff --stat HEAD..upstream/main
fi

echo
echo "=== Merge safety check ==="
if [[ "$incoming_count" -eq 0 ]]; then
  echo "Clean merge: yes"
else
  merge_base="$(git -C "$core_dir" merge-base HEAD upstream/main)"
  merge_preview="$(git -C "$core_dir" merge-tree "$merge_base" HEAD upstream/main)"
  if ! grep -q '^<<<<<<< ' <<<"$merge_preview"; then
    echo "Clean merge: yes"
  else
    echo "Clean merge: no. Git rerere may reuse a previously recorded resolution."
    if [[ "$mode" == "--check" ]]; then
      echo "Run $0 --merge to attempt the merge, or inspect the conflict preview below." >&2
      echo "$merge_preview" >&2
      exit 1
    fi
  fi
fi

if [[ "$mode" == "--check" ]]; then
  echo
  echo "No files were changed. Review the commits and summary above."
  echo "If they are acceptable, run: $0 --merge"
  exit 0
fi

core_before_commit="$(git -C "$core_dir" rev-parse HEAD)"
if ! git -C "$core_dir" merge --no-edit upstream/main; then
  git -C "$core_dir" rerere
  if ! git -C "$core_dir" diff --quiet --diff-filter=U; then
    echo "Merge still has unresolved conflicts. Resolve them in core/new-api," >&2
    echo "run the compatibility checks, then commit. Git rerere will remember the resolution." >&2
    git -C "$core_dir" status --short >&2
    exit 1
  fi
  git -C "$core_dir" commit --no-edit
  echo "All merge conflicts were resolved from recorded rerere resolutions."
fi

restore_removed_platform_seams "$core_before_commit"

# Restoring a protected seam changes the merge result after Git has created
# the merge commit. Include that restoration in the same merge commit so
# --sync can never push an upstream-only result accidentally.
if [[ -n "$(git -C "$core_dir" status --porcelain)" ]]; then
  git -C "$core_dir" add -A
  git -C "$core_dir" commit --amend --no-edit
fi

"$repo_root/scripts/assemble-extensions.sh"
verify_extensions_preserved
"$repo_root/scripts/verify-core-compatibility.sh"

(
  cd "$core_dir/web"
  BUN_TMPDIR="$tmp_root" bun install --frozen-lockfile
  BUN_TMPDIR="$tmp_root" bun run build
  BUN_TMPDIR="$tmp_root" bun run typecheck
  BUN_TMPDIR="$tmp_root" bunx vitest run \
    src/features/pricing/lib/__tests__/billing-expression.test.ts \
    src/platform/model-prices/price-renderer.test.tsx \
    src/platform/admin-pages/model-prices/runtime-pricing-editor.test.ts \
    src/platform/admin-pages/model-prices/usage-rule-builder.test.ts \
    src/features/system-settings/models/__tests__/visual-billing-editor.test.tsx
)

(
  cd "$core_dir"
  GOCACHE="$tmp_root/go-cache" go build ./router ./platform
  GOCACHE="$tmp_root/go-cache" go test ./pkg/billingexpr
  GOCACHE="$tmp_root/go-cache" go test ./service -run 'TestBuildTieredTokenParams'
)

# assemble-extensions.sh intentionally refreshes a small set of tracked core
# seams (for example web/index.html). Commit those generated seam updates
# before any push; otherwise --sync could push the merge commit while silently
# leaving the platform integration only in the local working tree.
if [[ -n "$(git -C "$core_dir" status --porcelain)" ]]; then
  git -C "$core_dir" add -A
  git -C "$core_dir" commit -m "chore: preserve platform extension seams after upstream sync"
fi

if [[ "$mode" == "--sync" ]]; then
  git -C "$core_dir" push origin main

  git -C "$repo_root" add core/new-api
  if git -C "$repo_root" diff --cached --quiet -- core/new-api; then
    echo
    echo "Core sync complete. The outer repository already records this submodule commit."
  else
    git -C "$repo_root" commit -m "chore: sync new-api upstream" -- core/new-api
    git -C "$repo_root" push
    echo
    echo "Core sync complete. The Fork and outer submodule pointer were pushed."
  fi
else
  echo "Upstream merge and checks completed. Push core with:"
  echo "  git -C \"$core_dir\" push origin main"
fi
