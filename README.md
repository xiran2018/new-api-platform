# new-api Platform Extension Layer

This repository keeps `core/new-api` as the upstream gateway and places product-specific code in `extensions/`.

Run `./scripts/assemble-extensions.sh` before frontend or backend builds. The script creates only ignored generated extension files under `core/new-api/platform/` and `core/new-api/web/src/platform/`; the four stable core seams are tracked as patches.

See `docs/extension-architecture.md` for the stable integration seams and upgrade procedure.

For a complete Docker deployment with the application, portal gateway,
PostgreSQL and Redis, see [docs/docker-production-deployment.md](docs/docker-production-deployment.md).
Use `./scripts/publish-docker-images.sh` to build and publish both project
images to Docker Hub with `latest` and immutable version tags.

## 五种运行方式

下面五种方式相互独立。新机器部署前先确定使用哪一种，不要同时执行
`docker-compose.prod.yml` 和 `docker-compose.host-db.yml`，除非明确需要两套应用。

| 方式 | 应用 | PostgreSQL/Redis | 对外端口 | 主要配置文件 |
| --- | --- | --- | --- | --- |
| 1. 源码启动 | 宿主机源码 | 宿主机已有服务或方式 3 | `11115` | `core/new-api/.env` |
| 2. 全部 Docker | Docker 镜像 | Compose 内部容器 | `11115` | `.env.docker`、`docker-compose.prod.yml` |
| 3. Docker 只启动数据库 | 后续用源码启动 | Docker 容器并映射到宿主机 | `5432`、`6379` | `core/new-api/.env`、`core/new-api/docker-compose-mydev.yml` |
| 4. Docker 只启动应用 | Docker 镜像 | 已存在并映射到宿主机的容器 | `11116` | `.env.docker`、`docker-compose.host-db.yml` |
| 5. 生成 Docker 镜像 | 构建但不启动 | 不需要 | 无 | `Dockerfile`、`Dockerfile.gateway` |

### 公共准备工作

拉取完整代码。源码运行、数据库开发栈和本地镜像构建都必须包含 core 子模块：

```bash
git clone --recurse-submodules \
  https://github.com/xiran2018/new-api-platform.git
cd new-api-platform
git submodule update --init --recursive
```

只通过 Docker Hub 镜像运行方式 2 或方式 4 时，core 子模块不参与运行，但保留递归
拉取可以确保后续仍能构建和更新源码。

本文命令默认使用 Docker Compose v2（`docker compose`）。如果服务器只有旧版
`docker-compose`，手工命令中的 `docker compose` 可直接替换为 `docker-compose`；
`scripts/docker-prod.sh` 会自动识别两种版本。新机器建议安装 Compose v2。

方式 2、3、4、5 都需要 Docker。Ubuntu/Debian 新机器可执行：

```bash
sudo apt update
sudo apt install -y git curl ca-certificates openssl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

执行 `usermod` 后退出并重新登录，再确认：

```bash
docker version
docker compose version
```

### 方式 1：源码启动程序

适用场景：开发和调试 Go/React/平台扩展源码。安装：

```bash
# Ubuntu/Debian 基础工具和 Docker（数据库使用 Docker 时需要）
sudo apt update
sudo apt install -y git curl ca-certificates build-essential openssl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"

# 安装当前稳定版 Go
sudo snap install go --classic

# 安装 Bun；安装完成后重新加载 shell
curl -fsSL https://bun.sh/install | bash
source "$HOME/.bashrc"

# 当前 core/new-api/go.mod 要求 Go 1.25.1 或更高版本
go version
bun --version
docker compose version
```

全新 clone 不包含私有 `.env`。创建并编辑：

```bash
cd core/new-api
cp .env.example .env
chmod 600 .env
nano .env
```

在 `core/new-api/.env` 中取消注释或新增以下字段。URL 中的密码必须与上方
密码字段完全相同：

```dotenv
PORT=7000
POSTGRES_PASSWORD=YOUR_POSTGRES_PASSWORD
REDIS_PASSWORD=YOUR_REDIS_PASSWORD
SQL_DSN=postgresql://root:YOUR_POSTGRES_PASSWORD@127.0.0.1:5432/new-api
PLATFORM_DATABASE_URL=postgresql://root:YOUR_POSTGRES_PASSWORD@127.0.0.1:5432/platform_db?sslmode=disable
REDIS_CONN_STRING=redis://:YOUR_REDIS_PASSWORD@127.0.0.1:6379/0
SESSION_SECRET=YOUR_32_BYTE_OR_LONGER_RANDOM_SECRET
```

生成会话密钥：

```bash
openssl rand -hex 32
```

先保证 PostgreSQL、Redis 和 `platform_db` 已存在。可以执行方式 3，或者启动已经
存在的共享容器：

```bash
docker start postgres redis
```

验证连接配置和服务：

```bash
cd /path/to/new-api-platform/core/new-api
set -a; source .env; set +a
docker exec postgres pg_isready -U root -d new-api
docker exec redis redis-cli -a "$REDIS_PASSWORD" ping
unset POSTGRES_PASSWORD REDIS_PASSWORD SQL_DSN PLATFORM_DATABASE_URL REDIS_CONN_STRING SESSION_SECRET
```

从项目根目录启动源码应用和门户：

```bash
cd /path/to/new-api-platform
./scripts/rebuild-and-start.sh
```

浏览器访问 `http://SERVER_IP:11115/`。该脚本会装配 `extensions/`、按锁文件安装
前端依赖、构建前端，然后运行 new-api 和门户代理。使用 `Ctrl+C` 同时停止两者。

### 方式 2：应用、PostgreSQL 和 Redis 全部由 Docker 启动

适用场景：独立服务器部署。只需安装 Git、Docker Engine 和 Docker Compose，
不需要安装 Go 或 Bun。

创建根目录 Docker 环境文件：

```bash
cp .env.docker.example .env.docker
chmod 600 .env.docker
nano .env.docker
```

至少设置以下字段：

```dotenv
POSTGRES_USER=root
POSTGRES_PASSWORD=YOUR_URL_SAFE_POSTGRES_PASSWORD
REDIS_PASSWORD=YOUR_REDIS_PASSWORD
SESSION_SECRET=YOUR_32_BYTE_OR_LONGER_RANDOM_SECRET
PUBLIC_PORT=11115
TZ=Asia/Shanghai
NODE_NAME=new-api-node-1
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_TRUSTED_URL=
TRUSTED_PROXIES=
APP_IMAGE=jingquanliang/new-api-platform:latest
GATEWAY_IMAGE=jingquanliang/new-api-platform-gateway:latest
```

生产 HTTPS 环境应改为：

```dotenv
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_TRUSTED_URL=https://YOUR_DOMAIN
TRUSTED_PROXIES=YOUR_LOAD_BALANCER_CIDR
```

下载两个项目镜像以及官方 PostgreSQL、Redis 镜像并启动：

```bash
./scripts/docker-prod.sh pull
./scripts/docker-prod.sh start
./scripts/docker-prod.sh ps
```

`ps` 中 `postgres`、`redis`、`new-api` 应为 healthy，`gateway` 应为 running。
如需先检查 Compose 展开结果而不启动：

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml config -q
```

访问 `http://SERVER_IP:11115/`。查看日志或停止：

```bash
./scripts/docker-prod.sh logs
./scripts/docker-prod.sh down
```

数据保存在 Compose volumes：`postgres_data`、`redis_data`、`app_data`、
`app_logs`。不要执行 `docker compose down -v`，它会删除数据卷。`new-api` 和
`platform_db` 都位于同一个 PostgreSQL 容器，但仍是两个独立数据库。

`POSTGRES_PASSWORD` 只在 PostgreSQL 数据卷首次初始化时设置数据库密码。已有
数据卷不能只靠修改 `.env.docker` 改密码；必须先在 PostgreSQL 中执行密码变更，
再同步修改 `.env.docker`。Redis 密码也必须与实际启动参数一致。

### 方式 3：Docker 只启动 PostgreSQL 和 Redis，对外提供服务

适用场景：数据库机只运行 PostgreSQL 和 Redis 容器，通过 `5432`、`6379` 提供给
同机或另一台机器上的主程序。此 Compose 不会启动 new-api 或门户。
先按方式 1 创建 `core/new-api/.env`，其中必须包含：

```dotenv
POSTGRES_PASSWORD=YOUR_POSTGRES_PASSWORD
REDIS_PASSWORD=YOUR_REDIS_PASSWORD
```

然后从 core 目录启动。Compose 会自动读取同目录的 `.env`：

```bash
cd /path/to/new-api-platform/core/new-api
docker compose -p new-api -f docker-compose-mydev.yml \
  up -d postgres redis platform-db-init
```

首次启动前可以检查变量是否已正确展开：

```bash
docker compose -p new-api -f docker-compose-mydev.yml config -q
```

该文件的 `ports` 字段映射：

```text
数据库机所有网卡:5432 -> PostgreSQL 容器:5432
数据库机所有网卡:6379 -> Redis 容器:6379
```

`platform-db-init` 会创建 `platform_db`。检查：

```bash
docker exec postgres pg_isready -U root -d new-api
set -a; source .env; set +a
docker exec redis redis-cli -a "$REDIS_PASSWORD" ping
unset REDIS_PASSWORD
```

预期返回 `accepting connections` 和 `PONG`。随后按方式 1 从项目根目录运行
`./scripts/rebuild-and-start.sh`。停止/恢复数据库容器：

```bash
docker stop postgres redis
docker start postgres redis
```

使用上面的 `-p new-api` 后，PostgreSQL 数据卷名为 `new-api_pg_data`。可用
`docker volume inspect new-api_pg_data` 确认。禁止使用 `down -v`，也不要让两个
PostgreSQL 容器同时挂载同一个数据目录。若容器已经存在但停止，只运行
`docker start postgres redis`；若容器被删除，重新执行本节的 `docker compose up`。

主程序与数据库容器在同一台机器时，`core/new-api/.env` 使用方式 1 所示的
`127.0.0.1`。主程序在另一台机器时，把三条连接地址中的 `127.0.0.1` 改为数据库机
的内网 IP 或可解析域名，例如：

```dotenv
SQL_DSN=postgresql://root:YOUR_POSTGRES_PASSWORD@DB_PRIVATE_IP:5432/new-api
PLATFORM_DATABASE_URL=postgresql://root:YOUR_POSTGRES_PASSWORD@DB_PRIVATE_IP:5432/platform_db?sslmode=disable
REDIS_CONN_STRING=redis://:YOUR_REDIS_PASSWORD@DB_PRIVATE_IP:6379/0
```

跨机器使用时不要向公网开放 `5432`、`6379`。数据库机防火墙只允许主程序服务器的
内网 IP 访问这两个端口；同时确认云安全组也采用相同限制。密码仍填写在主程序机的
`core/new-api/.env`，且必须与数据库机 `core/new-api/.env` 中创建容器所用密码一致。

### 方式 4：Docker 只启动主程序，使用已有 PostgreSQL 和 Redis

适用场景：只启动 new-api 应用容器和门户容器，不创建 PostgreSQL、Redis。已有
服务可以是宿主机安装的服务，也可以是已对外映射端口的 Docker 容器；服务既可以
与主程序同机，也可以在另一台内网机器。

创建根目录 `.env.docker`：

```bash
cp .env.docker.example .env.docker
chmod 600 .env.docker
nano .env.docker
```

设置：

```dotenv
POSTGRES_USER=root
POSTGRES_PASSWORD=与已有PostgreSQL实际密码一致
REDIS_PASSWORD=与已有Redis实际密码一致
SESSION_SECRET=与源码core/new-api/.env一致
HOST_DB_PUBLIC_PORT=11116
EXISTING_SERVICES_HOST=host.docker.internal
HOST_POSTGRES_PORT=5432
HOST_REDIS_PORT=6379
HOST_DB_NODE_NAME=docker-host-db-node
APP_IMAGE=jingquanliang/new-api-platform:latest
GATEWAY_IMAGE=jingquanliang/new-api-platform-gateway:latest
```

字段含义：

| 文件 | 字段 | 设置方法 |
| --- | --- | --- |
| `.env.docker` | `EXISTING_SERVICES_HOST` | 数据库与应用 Docker 同机时填 `host.docker.internal`；数据库在另一台机器时填其内网 IP 或域名 |
| `.env.docker` | `HOST_POSTGRES_PORT` | PostgreSQL 对外端口，默认 `5432` |
| `.env.docker` | `HOST_REDIS_PORT` | Redis 对外端口，默认 `6379` |
| `.env.docker` | `HOST_DB_PUBLIC_PORT` | 门户在应用机发布的端口，默认 `11116` |
| `.env.docker` | `POSTGRES_USER`、`POSTGRES_PASSWORD` | 必须与已有 PostgreSQL 的实际凭据一致 |
| `.env.docker` | `REDIS_PASSWORD` | 必须与已有 Redis 的实际密码一致 |

已有 PostgreSQL 必须同时包含 `new-api` 和 `platform_db`。启动应用和门户，不会
创建新的数据库或 Redis 容器：

```bash
docker compose --env-file .env.docker -f docker-compose.host-db.yml pull
docker compose --env-file .env.docker -f docker-compose.host-db.yml config -q
docker compose --env-file .env.docker -f docker-compose.host-db.yml up -d
docker compose --env-file .env.docker -f docker-compose.host-db.yml ps
```

Docker 应用访问 `http://SERVER_IP:11116/`，源码应用继续使用 `11115`。两者的修改
会立即写入同一数据库。停止只会删除应用/门户容器，不影响 PostgreSQL 和 Redis：

```bash
docker compose --env-file .env.docker -f docker-compose.host-db.yml down
```

查看日志：

```bash
docker compose --env-file .env.docker -f docker-compose.host-db.yml logs -f
```

同机模式通过 `extra_hosts: host.docker.internal:host-gateway` 访问宿主机。远程模式
直接访问 `EXISTING_SERVICES_HOST`。若数据库没有监听/映射所填端口、凭据不一致，
或数据库机防火墙拒绝应用机 IP，此方式无法连接。

### 方式 5：生成并发布 Docker 镜像

本地构建需要 Docker、可访问 Docker Hub/Go/Bun 依赖网络，以及完整 core 子模块。
只生成本地镜像、不上传 Docker Hub：

```bash
cd /path/to/new-api-platform
docker build --pull -t new-api-platform:local -f Dockerfile .
docker build --pull -t new-api-platform-gateway:local -f Dockerfile.gateway .
docker image ls new-api-platform new-api-platform-gateway
```

构建并上传时，创建具有 Read/Write 权限的 Docker Hub Access Token 后运行：

```bash
cd /path/to/new-api-platform
./scripts/publish-docker-images.sh \
  --token 'YOUR_DOCKER_HUB_ACCESS_TOKEN' \
  --username jingquanliang \
  --version v1.0.0
```

脚本使用根目录 `Dockerfile` 构建应用镜像，使用 `Dockerfile.gateway` 构建门户镜像，
并推送版本标签和 `latest`：

```text
jingquanliang/new-api-platform:v1.0.0
jingquanliang/new-api-platform:latest
jingquanliang/new-api-platform-gateway:v1.0.0
jingquanliang/new-api-platform-gateway:latest
```

若本机无法访问 Docker Hub，在 GitHub 仓库的 Actions Repository secrets 添加
`DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN`，再运行 `Publish Docker images`
workflow。Token 必须是具有 Read/Write 权限的 Access Token，不能提交到 Git。

## Updating new-api upstream

The upstream sync helper fetches the official repository, assembles extensions,
installs the exact dependencies recorded in `bun.lock`, regenerates frontend
routes and runs the affected build checks.

```bash
./scripts/sync-upstream.sh
```

The first run prints the command needed to configure the `upstream` remote.
The default command only fetches and verifies a clean merge. It prints incoming
commits and a changed-file summary without modifying the working tree:

```bash
./scripts/sync-upstream.sh --merge
```

Before `--merge`, `core/new-api` must have no uncommitted changes. Commit the
platform seam changes first (recommended), or temporarily save them with
`git -C core/new-api stash -u`. After merging, reapply the stash if one was
used and resolve only the documented seams.

Resolve conflicts only in the four documented extension seams, then rerun the
script. Do not edit generated `web/src/routeTree.gen.ts` manually.

See [the upstream conflict playbook](docs/upstream-conflict-playbook.md) for
the exact code that must be retained at each seam and the required checks.
