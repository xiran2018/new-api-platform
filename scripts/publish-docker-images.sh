#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
registry_user="${DOCKERHUB_USERNAME:-jingquanliang}"
version="${IMAGE_VERSION:-$(git -C "$repo_root" rev-parse --short HEAD)}"
token="${DOCKERHUB_TOKEN:-}"
pull_base=false

token_looks_valid() {
  local candidate="$1"
  [[ ${#candidate} -ge 20 ]] || return 1
  [[ "$candidate" =~ ^[A-Za-z0-9._-]+$ ]] || return 1
  case "${candidate,,}" in
    *your*token*|*dockerhub*token*|*docker_hub*token*|*access*token*|*你的*|*令牌*) return 1 ;;
  esac
}

usage() {
  cat >&2 <<EOF
Usage: $0 [--token TOKEN] [--username USERNAME] [--version VERSION] [--pull]

Without --token (or DOCKERHUB_TOKEN), images are built locally but not pushed.
Use --pull to refresh base images before building.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)
      [[ $# -ge 2 ]] || { usage; exit 1; }
      token="$2"
      shift 2
      ;;
    --username)
      [[ $# -ge 2 ]] || { usage; exit 1; }
      registry_user="$2"
      shift 2
      ;;
    --version)
      [[ $# -ge 2 ]] || { usage; exit 1; }
      version="$2"
      shift 2
      ;;
    --pull)
      pull_base=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

echo "Options: --version=tag, --username=registry user, --pull=refresh base images, --token=enable push, --help=show help"

app_image="${registry_user}/new-api-platform"
gateway_image="${registry_user}/new-api-platform-gateway"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not available to the current user." >&2
  exit 1
fi
build_options=()
[[ "$pull_base" == false ]] || build_options+=(--pull)

echo "==> Building application image"
echo "    ${app_image}:${version}"
echo "    ${app_image}:latest"
docker build "${build_options[@]}" -t "${app_image}:${version}" -t "${app_image}:latest" -f "$repo_root/Dockerfile" "$repo_root"

echo "==> Building gateway image"
echo "    ${gateway_image}:${version}"
echo "    ${gateway_image}:latest"
docker build "${build_options[@]}" -t "${gateway_image}:${version}" -t "${gateway_image}:latest" -f "$repo_root/Dockerfile.gateway" "$repo_root"

echo "==> Local images built successfully"
docker image inspect \
  --format '{{.Id}}  {{index .RepoTags 0}}  {{.Size}} bytes' \
  "${app_image}:${version}" "${gateway_image}:${version}"

if [[ -z "$token" ]]; then
  echo "==> Push skipped: no --token or DOCKERHUB_TOKEN was provided"
  echo "Run this script again with --token to build and push the images."
  exit 0
fi

if ! token_looks_valid "$token"; then
  echo "==> Push skipped: the supplied token does not look like a Docker Hub Access Token" >&2
  echo "    Local images were built successfully. Use an ASCII token of at least 20 characters." >&2
  exit 0
fi

echo "==> Checking Docker Hub connectivity"
if ! getent hosts registry-1.docker.io >/dev/null 2>&1; then
  echo "Cannot resolve registry-1.docker.io. Local images were built, but push was skipped." >&2
  exit 1
fi

echo "==> Logging in to Docker Hub"
printf '%s' "$token" | docker login --username "$registry_user" --password-stdin
token=""

echo "==> Pushing application and gateway images"
docker push "${app_image}:${version}"
docker push "${app_image}:latest"
docker push "${gateway_image}:${version}"
docker push "${gateway_image}:latest"

echo
echo "Published successfully:"
echo "  ${app_image}:${version}"
echo "  ${app_image}:latest"
echo "  ${gateway_image}:${version}"
echo "  ${gateway_image}:latest"
