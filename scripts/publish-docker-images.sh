#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
registry_user="${DOCKERHUB_USERNAME:-jingquanliang}"
version="${IMAGE_VERSION:-$(git -C "$repo_root" rev-parse --short HEAD)}"
token="${DOCKERHUB_TOKEN:-}"

usage() {
  echo "Usage: $0 [--token TOKEN] [--username USERNAME] [--version VERSION]" >&2
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
if ! getent hosts registry-1.docker.io >/dev/null 2>&1; then
  echo "Cannot resolve registry-1.docker.io. Fix host/Docker DNS before publishing." >&2
  exit 1
fi

if [[ -n "$token" ]]; then
  printf '%s' "$token" | docker login --username "$registry_user" --password-stdin
  token=""
else
  echo "Using the existing Docker login. Pass --token or set DOCKERHUB_TOKEN to log in non-interactively."
fi

docker build --pull -t "${app_image}:${version}" -t "${app_image}:latest" -f "$repo_root/Dockerfile" "$repo_root"
docker build --pull -t "${gateway_image}:${version}" -t "${gateway_image}:latest" -f "$repo_root/Dockerfile.gateway" "$repo_root"

docker push "${app_image}:${version}"
docker push "${app_image}:latest"
docker push "${gateway_image}:${version}"
docker push "${gateway_image}:latest"

echo
echo "Published:"
echo "  ${app_image}:${version}"
echo "  ${app_image}:latest"
echo "  ${gateway_image}:${version}"
echo "  ${gateway_image}:latest"
