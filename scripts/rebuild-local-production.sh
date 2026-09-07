#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
version="latest"
go_proxy="https://goproxy.cn,direct"
build_network="host"
host_db=false

usage() {
  cat <<EOF
Usage: $0 [--version VERSION] [--goproxy URLS] [--build-network NETWORK] [--HostDB] [--help]

Build both application images locally, then recreate the application and
gateway with those local images. PostgreSQL and Redis are not rebuilt.

  --version VERSION        Image tag to build (default: latest)
  --goproxy URLS           Go module proxy (default: https://goproxy.cn,direct)
  --build-network NETWORK  Docker build network (default: host)
  --HostDB                 Explicitly use docker-compose.host-db.yml
  --help                   Show this help without building or restarting
EOF
}

while (($#)); do
  case "$1" in
    --version)
      [[ $# -ge 2 ]] || { usage >&2; exit 1; }
      version="$2"
      shift 2
      ;;
    --goproxy)
      [[ $# -ge 2 ]] || { usage >&2; exit 1; }
      go_proxy="$2"
      shift 2
      ;;
    --build-network)
      [[ $# -ge 2 ]] || { usage >&2; exit 1; }
      build_network="$2"
      shift 2
      ;;
    --HostDB)
      host_db=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      echo "Error: unknown option: $1" >&2
      exit 1
      ;;
  esac
done

echo "Options: --version=$version; --goproxy=$go_proxy; --build-network=$build_network; --HostDB=$host_db; --help=show help"
echo "==> Building local application and gateway images"
"$script_dir/publish-docker-images.sh" \
  --version "$version" \
  --build-network "$build_network" \
  --goproxy "$go_proxy"

echo "==> Recreating application and gateway from local images"
update_args=(--NoPull)
[[ "$host_db" == false ]] || update_args+=(--HostDB)
"$script_dir/update-production-app.sh" "${update_args[@]}"

echo "==> Local image rebuild and application recreation completed"
