#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
core_dir="$repo_root/core/new-api"
core_message="chore: update platform core"
platform_message="chore: publish platform updates"
skip_checks=false
dry_run=false

usage() {
  cat <<EOF
Usage: $0 [options]

Commit and push both repositories in the required order:
  1. assemble platform extensions
  2. verify and commit core/new-api, then push its origin/main
  3. commit the outer repository, including the new submodule pointer
  4. push the outer origin/main

Options:
  --core-message MESSAGE      Core commit message (default: $core_message)
  --platform-message MESSAGE  Outer commit message (default: $platform_message)
  --skip-checks               Skip typecheck, frontend build, and Go tests
  --dry-run                   Show repository and remote status; change nothing
  -h, --help                  Show this help

The script only performs normal fast-forward pushes. It never force-pushes.
EOF
}

die() { echo "Error: $*" >&2; exit 1; }

while (($#)); do
  case "$1" in
    --core-message)
      [[ $# -ge 2 ]] || die "--core-message requires a value"
      core_message="$2"
      shift 2
      ;;
    --platform-message)
      [[ $# -ge 2 ]] || die "--platform-message requires a value"
      platform_message="$2"
      shift 2
      ;;
    --skip-checks) skip_checks=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

echo "Options: --core-message=core commit; --platform-message=outer commit; --skip-checks=skip builds/tests; --dry-run=inspect only; --help=show help"

command -v git >/dev/null 2>&1 || die "Git is not installed"
[[ -e "$core_dir/.git" ]] || die "core/new-api is not initialized; run git submodule update --init --recursive"

assert_main_branch() {
  local directory="$1" label="$2" branch
  branch="$(git -C "$directory" branch --show-current)"
  [[ "$branch" == "main" ]] || die "$label must be on main (current: ${branch:-detached HEAD})"
  git -C "$directory" diff --quiet --diff-filter=U || die "$label has unresolved merge conflicts"
}

reject_sensitive_changes() {
  local directory="$1" label="$2" paths
  paths="$(git -C "$directory" status --porcelain=v1 | sed -E 's/^.. //' | sed -E 's/.* -> //' || true)"
  if grep -E '(^|/)(\.env($|\.)|.*\.pem$|.*\.key$|id_rsa$|id_ed25519$|credentials?($|\.)|secrets?($|\.))' <<<"$paths" >/dev/null; then
    echo "$paths" >&2
    die "$label contains a potentially sensitive changed file; review and stage it manually"
  fi
}

assert_remote_is_safe() {
  local directory="$1" label="$2"
  git -C "$directory" fetch origin
  git -C "$directory" show-ref --verify --quiet refs/remotes/origin/main || die "$label origin/main does not exist"
  git -C "$directory" merge-base --is-ancestor origin/main HEAD ||
    die "$label main has diverged from or is behind origin/main; synchronize it before publishing"
}

show_state() {
  local directory="$1" label="$2"
  echo
  echo "=== $label ==="
  echo "Remote: $(git -C "$directory" remote get-url origin)"
  echo "Branch: $(git -C "$directory" branch --show-current)"
  git -C "$directory" status --short
}

assert_main_branch "$core_dir" "core/new-api"
assert_main_branch "$repo_root" "new-api-platform"
reject_sensitive_changes "$core_dir" "core/new-api"
reject_sensitive_changes "$repo_root" "new-api-platform"

if [[ "$dry_run" == true ]]; then
  show_state "$core_dir" "core/new-api"
  show_state "$repo_root" "new-api-platform"
  echo
  echo "Dry run complete. No files, commits, or remotes were changed."
  exit 0
fi

echo "==> Assembling platform extensions"
"$repo_root/scripts/assemble-extensions.sh"

echo "==> Checking patches"
git -C "$core_dir" diff --check
git -C "$repo_root" diff --check

if [[ "$skip_checks" == false ]]; then
  echo "==> Running frontend typecheck"
  (cd "$core_dir/web" && bun run typecheck)
  echo "==> Building frontend"
  (cd "$core_dir/web" && bun run build)
  echo "==> Testing core integration seams"
  (cd "$core_dir" && GOCACHE=/tmp/new-api-platform-go-cache go test ./router ./platform)
else
  echo "==> Build and test checks skipped by --skip-checks"
fi

assert_remote_is_safe "$core_dir" "core/new-api"
if [[ -n "$(git -C "$core_dir" status --porcelain)" ]]; then
  echo "==> Committing core/new-api"
  git -C "$core_dir" add -A
  git -C "$core_dir" commit -m "$core_message"
else
  echo "==> core/new-api has no uncommitted changes"
fi

if [[ "$(git -C "$core_dir" rev-list --count origin/main..HEAD)" -eq 0 ]]; then
  echo "==> core/new-api origin/main is already current"
else
  echo "==> Pushing core/new-api origin/main"
  git -C "$core_dir" push origin main
fi

assert_remote_is_safe "$repo_root" "new-api-platform"
if [[ -n "$(git -C "$repo_root" status --porcelain)" ]]; then
  echo "==> Committing new-api-platform"
  git -C "$repo_root" add -A
  git -C "$repo_root" commit -m "$platform_message"
else
  echo "==> new-api-platform has no uncommitted changes"
fi

if [[ "$(git -C "$repo_root" rev-list --count origin/main..HEAD)" -eq 0 ]]; then
  echo "==> new-api-platform origin/main is already current"
else
  echo "==> Pushing new-api-platform origin/main"
  git -C "$repo_root" push origin main
fi

echo
echo "Published successfully."
echo "  core/new-api:      $(git -C "$core_dir" rev-parse --short HEAD)"
echo "  new-api-platform:  $(git -C "$repo_root" rev-parse --short HEAD)"
