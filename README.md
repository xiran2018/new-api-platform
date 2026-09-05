# new-api Platform Extension Layer

This repository keeps `core/new-api` as the upstream gateway and places product-specific code in `extensions/`.

Run `./scripts/assemble-extensions.sh` before frontend or backend builds. The script creates only ignored generated extension files under `core/new-api/platform/` and `core/new-api/web/src/platform/`; the four stable core seams are tracked as patches.

See `docs/extension-architecture.md` for the stable integration seams and upgrade procedure.

For a complete Docker deployment with the application, portal gateway,
PostgreSQL and Redis, see [docs/docker-production-deployment.md](docs/docker-production-deployment.md).
Use `./scripts/publish-docker-images.sh` to build both project images locally.
Pass `--token` only when they should also be published to Docker Hub.

## 五种运行方式

下面五种方式相互独立。新机器部署前先确定使用哪一种，不要同时执行
`docker-compose.prod.yml` 和 `docker-compose.host-db.yml`，除非明确需要两套应用。

| 方式 | 应用 | PostgreSQL/Redis | 对外端口 | 主要配置文件 |
| --- | --- | --- | --- | --- |
| 1. 源码启动 | 宿主机源码 | 宿主机已有服务或方式 3 | `11115` | `core/new-api/.env` |
| 2. 全部 Docker | Docker 镜像 | Compose 内部容器 | `443`（HTTPS） | `.env.docker`、`docker-compose.prod.yml`、`certs/` |
| 3. Docker 只启动数据库 | 后续用源码启动 | Docker 容器并映射到宿主机 | `5432`、`6379` | `core/new-api/.env`、`core/new-api/docker-compose-mydev.yml` |
| 4. Docker 只启动应用 | Docker 镜像 | 已存在并映射到宿主机的容器 | `443`（HTTPS） | `.env.docker`、`docker-compose.host-db.yml`、`certs/` |
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

适用场景：独立服务器部署。只需安装 Docker Engine 和 Docker Compose，不需要安装
Go、Bun，也不需要下载 `core/new-api` 源码。但 Compose、环境文件和 TLS 证书必须
保存在宿主机上的持久化部署目录。本说明统一使用 `/opt/llmapi-deploy`。

只下载运行需要的 Compose、环境示例和部署脚本，不下载应用源码：

```bash
sudo mkdir -p /opt/llmapi-deploy/certs /opt/llmapi-deploy/scripts
sudo chown -R "$USER":"$USER" /opt/llmapi-deploy
cd /opt/llmapi-deploy

curl -fL \
  https://raw.githubusercontent.com/xiran2018/new-api-platform/main/docker-compose.prod.yml \
  -o docker-compose.prod.yml
curl -fL \
  https://raw.githubusercontent.com/xiran2018/new-api-platform/main/.env.docker.example \
  -o .env.docker.example
curl -fL \
  https://raw.githubusercontent.com/xiran2018/new-api-platform/main/scripts/docker-prod.sh \
  -o scripts/docker-prod.sh
curl -fL \
  https://raw.githubusercontent.com/xiran2018/new-api-platform/main/scripts/update-production-app.sh \
  -o scripts/update-production-app.sh
chmod +x scripts/docker-prod.sh scripts/update-production-app.sh

cp .env.docker.example .env.docker
chmod 600 .env.docker
nano .env.docker
```

最终部署目录只包含运行配置，不包含 Go/React 源码：

```text
/opt/llmapi-deploy/
├── .env.docker
├── .env.docker.example
├── docker-compose.prod.yml
├── scripts/
│   ├── docker-prod.sh
│   └── update-production-app.sh
└── certs/
    ├── fullchain.pem
    └── privkey.pem
```

至少设置以下字段：

```dotenv
POSTGRES_USER=root
POSTGRES_PASSWORD=YOUR_URL_SAFE_POSTGRES_PASSWORD
REDIS_PASSWORD=YOUR_REDIS_PASSWORD
SESSION_SECRET=YOUR_32_BYTE_OR_LONGER_RANDOM_SECRET
PUBLIC_PORT=443
TZ=Asia/Shanghai
NODE_NAME=new-api-node-1
GATEWAY_TLS_CERT_DIR=/opt/llmapi-deploy/certs
GATEWAY_TLS_CERT_FILE=/certs/fullchain.pem
GATEWAY_TLS_KEY_FILE=/certs/privkey.pem
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_TRUSTED_URL=https://YOUR_DOMAIN
TRUSTED_PROXIES=
APP_IMAGE=jingquanliang/new-api-platform:latest
GATEWAY_IMAGE=jingquanliang/new-api-platform-gateway:latest
```

#### 重建或更新生产应用容器

Docker Hub 已发布新镜像时，直接执行脚本。默认先拉取 `.env.docker` 中 `APP_IMAGE`、
`GATEWAY_IMAGE` 指向的镜像，再依次重建 `new-api`、`gateway`：

```bash
cd /opt/llmapi-deploy
./scripts/update-production-app.sh
```

只修改了 `.env.docker`、gateway 配置或 TLS 证书，希望使用本机已有镜像重建时，
增加 `NoPull`（也支持别名 `--no-pull`）：

```bash
./scripts/update-production-app.sh NoPull
```

脚本兼容 `docker compose` v2 和 `docker-compose` v1。它会先确认 PostgreSQL、Redis
容器正在运行，重建 `new-api` 后等待健康检查通过，再重建 `gateway`，最后核对两个
数据服务的容器 ID 没有变化。默认模式和 `NoPull` 模式除是否先拉取镜像外，后续步骤完全相同。
该脚本不会拉取、停止或重建 PostgreSQL 和 Redis，也不会删除数据卷。查看日志：

```bash
./scripts/docker-prod.sh logs
```

不要使用 `docker compose down -v` 或 `docker-compose down -v`；`-v` 会删除数据库、
Redis 和应用文件对应的数据卷。

如果前面还有负责 TLS 终止的可信负载均衡器，再设置其内网网段：

```dotenv
TRUSTED_PROXIES=YOUR_LOAD_BALANCER_CIDR
```

准备域名并将 DNS 指向服务器。证书保存在宿主机部署目录中，由 Compose 以只读方式
挂载到 gateway 容器。容器删除或升级不会删除这些证书：

```text
/opt/llmapi-deploy/certs/fullchain.pem
/opt/llmapi-deploy/certs/privkey.pem
```

#### 方法一：使用 Let's Encrypt 生成正式证书（推荐）

前提条件：拥有域名，域名的 A/AAAA 记录已经指向该服务器公网地址，并且公网、云
安全组和本机防火墙允许 TCP `80` 和 `443`。Certbot standalone 申请时会临时监听
`80`；如果该端口已被其他程序占用，需要先停止占用程序。

Ubuntu/Debian 执行：

```bash
sudo apt update
sudo apt install -y certbot
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ss -lntp | grep -E ':80|:443' || true

sudo certbot certonly --standalone \
  --domain api.example.com \
  --email admin@example.com \
  --agree-tos \
  --no-eff-email
```

将 `api.example.com` 和邮箱替换为实际值。成功后 Certbot 文件位于
`/etc/letsencrypt/live/api.example.com/`。不要直接只挂载这个 `live` 目录，因为其中
包含指向 `archive` 目录的相对符号链接。把证书内容复制到部署目录：

```bash
cd /opt/llmapi-deploy
mkdir -p /opt/llmapi-deploy/certs
sudo cp --dereference \
  /etc/letsencrypt/live/api.example.com/fullchain.pem \
  /opt/llmapi-deploy/certs/fullchain.pem
sudo cp --dereference \
  /etc/letsencrypt/live/api.example.com/privkey.pem \
  /opt/llmapi-deploy/certs/privkey.pem
sudo chmod 644 /opt/llmapi-deploy/certs/fullchain.pem
sudo chmod 600 /opt/llmapi-deploy/certs/privkey.pem
sudo openssl x509 -in /opt/llmapi-deploy/certs/fullchain.pem \
  -noout -subject -issuer -dates
```

`.env.docker` 中的域名必须与证书域名一致：

```dotenv
SESSION_COOKIE_TRUSTED_URL=https://api.example.com
HOST_DB_SESSION_COOKIE_TRUSTED_URL=https://api.example.com
```

Certbot 通常会安装自动续期定时器，可检查和模拟续期：

```bash
systemctl status certbot.timer
sudo certbot renew --dry-run
```

证书续期后必须再次执行上面的两条 `cp --dereference`，然后根据运行方式重启门户：

```bash
# 方式 2：全部 Docker
cd /opt/llmapi-deploy
docker compose --env-file .env.docker -f docker-compose.prod.yml restart gateway

# 方式 4：只启动主程序 Docker
docker compose --env-file .env.docker -f docker-compose.host-db.yml \
  restart host-db-gateway
```

#### 方法二：生成内网测试用自签名证书

自签名证书不会被浏览器自动信任，只适合开发或内网验证。将域名和 IP 替换为测试机
的实际值：

```bash
cd /opt/llmapi-deploy
mkdir -p /opt/llmapi-deploy/certs
openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 365 \
  -keyout /opt/llmapi-deploy/certs/privkey.pem \
  -out /opt/llmapi-deploy/certs/fullchain.pem \
  -subj '/CN=llmapi.example.local' \
  -addext 'subjectAltName=DNS:llmapi.example.local,IP:192.168.1.10'
chmod 644 /opt/llmapi-deploy/certs/fullchain.pem
chmod 600 /opt/llmapi-deploy/certs/privkey.pem
openssl x509 -in /opt/llmapi-deploy/certs/fullchain.pem \
  -noout -subject -dates
```

客户端需要信任该证书，或者测试时接受浏览器警告。使用 IP 访问时，IP 必须包含在
`subjectAltName` 中；仅设置 `CN` 不够。

检查证书文件并开放 HTTPS 端口：

```bash
cd /opt/llmapi-deploy
sudo chmod 644 /opt/llmapi-deploy/certs/fullchain.pem
sudo chmod 600 /opt/llmapi-deploy/certs/privkey.pem
sudo test -s /opt/llmapi-deploy/certs/fullchain.pem
sudo test -s /opt/llmapi-deploy/certs/privkey.pem
sudo ufw allow 443/tcp
sudo ss -lntp | grep ':443' || true
```

如果 `443` 已被其他服务占用，需要先停止冲突服务，或者将 `PUBLIC_PORT` 改为
`8443` 并通过 `https://YOUR_DOMAIN:8443/` 访问。只修改端口但不提供证书，门户
无法启动。

#### 使用脚本启动生产环境（推荐）

`docker-prod.sh` 会自动读取同一部署目录下的 `.env.docker` 和
`docker-compose.prod.yml`，同时兼容 `docker compose` 和旧版 `docker-compose`。
下载两个项目镜像以及官方 PostgreSQL、Redis 镜像并启动：

```bash
cd /opt/llmapi-deploy
./scripts/docker-prod.sh config
./scripts/docker-prod.sh pull
./scripts/docker-prod.sh start
./scripts/docker-prod.sh ps
```

`ps` 中 `postgres`、`redis`、`new-api` 应为 healthy，`gateway` 应为 running。

访问 `https://YOUR_DOMAIN/`，并验证 API：

```bash
curl -I https://YOUR_DOMAIN/
curl https://YOUR_DOMAIN/api/status
```

查看日志或停止：

```bash
./scripts/docker-prod.sh logs
./scripts/docker-prod.sh down
```

Docker Hub 发布新版本后，更新并重建容器：

```bash
cd /opt/llmapi-deploy
./scripts/docker-prod.sh pull
./scripts/docker-prod.sh start
./scripts/docker-prod.sh ps
```

脚本命令含义：

| 命令 | 作用 |
| --- | --- |
| `config` | 检查环境变量和 Compose 配置，不启动容器 |
| `pull` | 拉取应用、门户、PostgreSQL 和 Redis 镜像 |
| `start` | 使用已有镜像创建或更新并启动全部容器，不在生产机编译源码 |
| `ps` | 查看容器状态和健康状态 |
| `logs` | 持续查看应用和门户日志，按 `Ctrl+C` 退出查看但不停止容器 |
| `down` | 停止并删除容器和网络，保留数据卷 |

如需排查脚本问题，可以直接执行完全等价的 Compose 命令：

```bash
cd /opt/llmapi-deploy
docker compose --env-file .env.docker -f docker-compose.prod.yml pull
docker compose --env-file .env.docker -f docker-compose.prod.yml config -q
docker compose --env-file .env.docker -f docker-compose.prod.yml up -d --no-build
docker compose --env-file .env.docker -f docker-compose.prod.yml ps
```

证书续期或替换后，重启门户以重新读取证书：

```bash
cd /opt/llmapi-deploy
docker compose --env-file .env.docker -f docker-compose.prod.yml restart gateway
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
HOST_DB_PUBLIC_PORT=443
EXISTING_SERVICES_HOST=host.docker.internal
HOST_POSTGRES_PORT=5432
HOST_REDIS_PORT=6379
HOST_DB_NODE_NAME=docker-host-db-node
GATEWAY_TLS_CERT_DIR=./certs
GATEWAY_TLS_CERT_FILE=/certs/fullchain.pem
GATEWAY_TLS_KEY_FILE=/certs/privkey.pem
APP_IMAGE=jingquanliang/new-api-platform:latest
GATEWAY_IMAGE=jingquanliang/new-api-platform-gateway:latest
HOST_DB_SESSION_COOKIE_SECURE=true
HOST_DB_SESSION_COOKIE_TRUSTED_URL=https://YOUR_DOMAIN
TRUSTED_PROXIES=
```

字段含义：

| 文件 | 字段 | 设置方法 |
| --- | --- | --- |
| `.env.docker` | `EXISTING_SERVICES_HOST` | 数据库与应用 Docker 同机时填 `host.docker.internal`；数据库在另一台机器时填其内网 IP 或域名 |
| `.env.docker` | `HOST_POSTGRES_PORT` | PostgreSQL 对外端口，默认 `5432` |
| `.env.docker` | `HOST_REDIS_PORT` | Redis 对外端口，默认 `6379` |
| `.env.docker` | `HOST_DB_PUBLIC_PORT` | 门户在应用机发布的 HTTPS 端口，默认 `443` |
| `.env.docker` | `POSTGRES_USER`、`POSTGRES_PASSWORD` | 必须与已有 PostgreSQL 的实际凭据一致 |
| `.env.docker` | `REDIS_PASSWORD` | 必须与已有 Redis 的实际密码一致 |
| `.env.docker` | `GATEWAY_TLS_CERT_DIR` | 应用机上的证书目录，默认项目根目录 `./certs` |
| `.env.docker` | `GATEWAY_TLS_CERT_FILE` | 容器内证书链路径，保持 `/certs/fullchain.pem` |
| `.env.docker` | `GATEWAY_TLS_KEY_FILE` | 容器内私钥路径，保持 `/certs/privkey.pem` |
| `.env.docker` | `HOST_DB_SESSION_COOKIE_SECURE` | 使用 HTTPS 时必须为 `true` |
| `.env.docker` | `HOST_DB_SESSION_COOKIE_TRUSTED_URL` | 填完整外部地址，如 `https://api.example.com`，不要添加末尾 `/` |

#### 配置 443 和 HTTPS 证书

`443` 是标准 HTTPS 端口，不能只修改端口而仍使用明文 HTTP。准备域名，并让域名的
DNS A/AAAA 记录指向应用服务器。证书生成、复制和续期方法见方式 2 中的
“方法一：使用 Let's Encrypt 生成正式证书”和“方法二：生成内网测试用自签名证书”。
最终应存在：

```text
new-api-platform/certs/fullchain.pem
new-api-platform/certs/privkey.pem
```

设置权限并确认文件存在：

```bash
cd /path/to/new-api-platform
mkdir -p certs
# 将证书复制到上述两个路径后执行：
sudo chmod 644 certs/fullchain.pem
sudo chmod 600 certs/privkey.pem
test -s certs/fullchain.pem && test -s certs/privkey.pem
```

证书必须包含所访问的域名。生产环境应使用受信任 CA（例如 Let's Encrypt）签发的
证书；自签名证书只适合测试，浏览器会显示安全警告。服务器防火墙和云安全组需要
允许入站 TCP `443`，不要对公网开放 PostgreSQL `5432` 或 Redis `6379`：

```bash
sudo ufw allow 443/tcp
```

绑定宿主机 `443` 通常不要求容器进程拥有 root 权限，因为 Docker 负责端口映射；
但当前用户必须有运行 Docker 的权限。如果 `443` 已被其他程序占用，先用
`sudo ss -lntp | grep ':443'` 查明占用，或者临时把 `HOST_DB_PUBLIC_PORT` 改成
`8443`，此时访问地址为 `https://YOUR_DOMAIN:8443/`。

门户进程在启动时读取证书。证书续期或替换后需要重启门户容器：

```bash
docker compose --env-file .env.docker -f docker-compose.host-db.yml \
  restart host-db-gateway
```

TLS 是门户镜像中的功能。修改源码后必须先按方式 5 重新构建并推送 gateway 镜像；
部署机器再执行下方 `pull` 和 `up -d`。只修改 Compose 而继续使用旧 gateway 镜像，
无法在 `443` 上提供 HTTPS。

已有 PostgreSQL 必须同时包含 `new-api` 和 `platform_db`。启动应用和门户，不会
创建新的数据库或 Redis 容器：

```bash
docker compose --env-file .env.docker -f docker-compose.host-db.yml pull
docker compose --env-file .env.docker -f docker-compose.host-db.yml config -q
docker compose --env-file .env.docker -f docker-compose.host-db.yml up -d
docker compose --env-file .env.docker -f docker-compose.host-db.yml ps
```

Docker 应用访问 `https://YOUR_DOMAIN/`，源码应用继续使用 `11115`。两者的修改
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

本地构建需要 Docker、构建依赖网络以及完整 core 子模块。运行脚本但不传 `--token`，
只生成本地的版本标签和 `latest` 镜像，不登录或推送 Docker Hub：

```bash
cd /path/to/new-api-platform
./scripts/publish-docker-images.sh
```

脚本会在构建每张镜像前输出名称和标签，完成后输出镜像 ID 与大小。默认复用本地基础
镜像；需要主动拉取最新基础镜像时添加 `--pull`。

构建并上传时，创建具有 Read/Write 权限的 Docker Hub Access Token 后运行：

```bash
cd /path/to/new-api-platform
./scripts/publish-docker-images.sh \
  --token 'YOUR_DOCKER_HUB_ACCESS_TOKEN' \
  --username jingquanliang \
  --version v1.0.0
```

脚本总是先完成本地构建，再登录和推送。如果 Docker Hub DNS 或推送失败，本地已经
生成的镜像仍会保留，可在网络恢复后重新执行带 `--token` 的命令。

脚本使用根目录 `Dockerfile` 构建应用镜像，使用 `Dockerfile.gateway` 构建门户镜像，
并推送版本标签和 `latest`：

```text
jingquanliang/new-api-platform:v1.0.0
jingquanliang/new-api-platform:latest
jingquanliang/new-api-platform-gateway:v1.0.0
jingquanliang/new-api-platform-gateway:latest
```

未指定 `--version` 时，版本标签取外层 `new-api-platform` Git 仓库当前提交的短 SHA，
例如当前提交为 `70e421c...`，标签就是 `70e421c`。标签的优先级为：命令行
`--version`、环境变量 `IMAGE_VERSION`、当前 Git 短 SHA。`latest` 始终同时生成，
表示最近一次构建的版本；生产环境需要严格锁定版本时，应在 `.env.docker` 中填写
明确版本标签，不要使用 `latest`。

`--pull` 会要求 Docker 在构建前检查并拉取 `Dockerfile` 使用的最新基础镜像，例如
Go、Bun 和 Debian 镜像。它不会拉取或更新正在运行的 PostgreSQL、Redis 容器。
不加 `--pull` 时优先使用本机已有的基础镜像，离线构建更稳定；如果本机没有所需
基础镜像，Docker 仍会尝试下载缺失镜像。

脚本会在构建完成后检查 token。token 包含中文、空白、示例占位词、异常字符或长度
不足 20 个字符时，不会登录或推送，只保留已经生成的本地镜像。此检查只能排除明显
无效输入；Docker Hub 最终仍会验证 token 的真实性和 Read/Write 权限。

`--version` 是可选的命令行参数，不是必填项；`IMAGE_VERSION` 是作用相同的可选环境
变量。三种常用写法如下：

```bash
# 不指定版本：自动使用当前 Git 短 SHA，同时生成 latest
./scripts/publish-docker-images.sh

# 使用可选的 --version 参数指定版本，同时生成 latest
./scripts/publish-docker-images.sh --version v1.0.1

# 也可以通过可选环境变量指定版本
IMAGE_VERSION=v1.0.1 ./scripts/publish-docker-images.sh
```

需要推送时，在任意一种写法中增加 `--token`；例如指定版本并推送：

```bash
./scripts/publish-docker-images.sh \
  --version v1.0.1 \
  --token 'YOUR_DOCKER_HUB_ACCESS_TOKEN'
```

若本机无法访问 Docker Hub，在 GitHub 仓库的 Actions Repository secrets 添加
`DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN`，再运行 `Publish Docker images`
workflow。Token 必须是具有 Read/Write 权限的 Access Token，不能提交到 Git。

## 从实验服务器迁移到全 Docker 新服务器

目标：将实验服务器中的 `new-api`、`platform_db`、Redis 状态和应用 `/data` 文件
迁移到新服务器；新服务器最终使用 `docker-compose.prod.yml` 运行应用、门户、
PostgreSQL 和 Redis。数据库必须使用逻辑备份迁移，不要复制正在运行的 PostgreSQL
数据目录或 Docker volume 物理目录。

以下命令假设实验机容器名为 `postgres`、`redis`。先执行 `docker ps` 核对；如果名称
不同，只修改下面的 `POSTGRES_CONTAINER`、`REDIS_CONTAINER`。

### 使用迁移脚本（推荐）

脚本将下方手工步骤固化为 `export` 和 `restore` 两个阶段。实验服务器在完整仓库中
直接执行：

```bash
cd /home/jing/new-api-platform
chmod +x scripts/migrate-docker-data.sh
./scripts/migrate-docker-data.sh export \
  --output-dir /home/jing/new-api-platform-transfer \
  --env-file /home/jing/new-api-platform/core/new-api/.env
```

脚本会停止已知的 new-api/gateway 容器，但保留 PostgreSQL 和 Redis；随后导出两个
数据库、刷新并导出 Redis `/data/dump.rdb`、复制应用 `/data`，最后生成：

```text
llmapi-migration-YYYYMMDD-HHMMSS.tar.gz
llmapi-migration-YYYYMMDD-HHMMSS.tar.gz.sha256
```

将这两个文件传到新服务器：

```bash
scp /home/jing/new-api-platform-transfer/llmapi-migration-*.tar.gz* \
  NEW_SERVER_USER@NEW_SERVER_IP:/tmp/
```

新服务器完成“方式 2”的 `/opt/llmapi-deploy`、`.env.docker`、证书和镜像准备后，
下载迁移脚本：

```bash
curl -fL \
  https://raw.githubusercontent.com/xiran2018/new-api-platform/main/scripts/migrate-docker-data.sh \
  -o /opt/llmapi-deploy/scripts/migrate-docker-data.sh
chmod +x /opt/llmapi-deploy/scripts/migrate-docker-data.sh
```

迁移脚本不会自动申请证书。新服务器必须严格按以下顺序准备：

1. 安装 Docker Engine、Docker Compose、OpenSSL。
2. 创建 `/opt/llmapi-deploy` 并下载 Compose、`.env.docker` 和脚本。
3. 完整填写 `.env.docker` 中数据库、Redis、会话、域名和 `443` 配置。
4. 完成域名 DNS 解析，使用 Certbot 申请正式证书，或为内网测试生成自签名证书。
5. 将 `fullchain.pem`、`privkey.pem` 放入 `GATEWAY_TLS_CERT_DIR`。
6. 执行 `./scripts/docker-prod.sh pull`，提前拉取四个所需镜像。
7. 把迁移压缩包和同名 `.sha256` 文件放到新服务器同一目录。
8. 确认目标 Compose 尚未创建容器，`443` 没有被其他服务占用。
9. 最后执行迁移恢复脚本。

`restore` 在修改目标数据前会自动探测上述步骤，包括：

- Docker daemon 和 Compose 是否可用；
- `.env.docker` 必填密钥是否仍为空或占位符；
- `PUBLIC_PORT=443`、HTTPS Cookie 和可信访问地址是否正确；
- TLS 证书是否存在、是否有效、是否即将过期、是否与私钥及访问域名/IP匹配；
- 应用、gateway、PostgreSQL、Redis 四个镜像是否已经拉取；
- 迁移包和 SHA-256 是否存在且校验通过；
- 目标 Compose 是否为空；
- 宿主机 `443` 是否空闲。

任一检查失败，脚本会在创建数据库或写入数据之前退出，并明确显示需要修复的项目。
修复后重新执行同一条命令即可。

确认新服务器尚未创建这套 Compose 的容器和数据卷，然后一键恢复并启动：

```bash
/opt/llmapi-deploy/scripts/migrate-docker-data.sh restore \
  --archive /tmp/llmapi-migration-YYYYMMDD-HHMMSS.tar.gz \
  --deploy-dir /opt/llmapi-deploy \
  --confirm-empty-target
```

`--confirm-empty-target` 是必需的安全确认。脚本检测到目标 Compose 已有容器时会拒绝
恢复，避免覆盖生产数据。Redis 或应用 `/data` 不需要迁移时，可在对应命令添加
`--no-redis` 或 `--no-app-data`。查看全部参数：

```bash
./scripts/migrate-docker-data.sh --help
```

如果完整恢复已经成功完成 PostgreSQL，但在“Restoring Redis”后提示
`cannot find target Redis container`，不要删除数据库或重新恢复 PostgreSQL。下载修复
脚本并从断点一键继续：

```bash
curl -fL \
  https://raw.githubusercontent.com/xiran2018/new-api-platform/main/scripts/resume-migration-restore.sh \
  -o /opt/llmapi-deploy/scripts/resume-migration-restore.sh
chmod +x /opt/llmapi-deploy/scripts/resume-migration-restore.sh

/opt/llmapi-deploy/scripts/resume-migration-restore.sh \
  /tmp/llmapi-migration-YYYYMMDD-HHMMSS.tar.gz
```

该脚本会先自动确认 PostgreSQL 容器正在运行、`new-api` 和 `platform_db` 均可连接且
已经包含业务表，然后识别上次中断时留下的“已创建但未运行”Redis 容器。检查通过后，
它只恢复 Redis、应用 `/data` 并启动完整服务，不会再次修改 PostgreSQL。如果数据库
恢复并未完成，或 Redis/new-api 已经运行，脚本会拒绝继续，防止覆盖现有数据。

下面保留完整手工步骤，用于理解流程和出现异常时逐步排查。

### 1. 在实验服务器停止写入

先进入维护窗口，避免备份期间继续产生订单、充值、发票或配置修改。

如果实验机应用也是完整 Docker：

```bash
cd /path/to/experiment-deployment
docker compose --env-file .env.docker -f docker-compose.prod.yml \
  stop gateway new-api
```

如果应用通过 `./scripts/rebuild-and-start.sh` 从源码运行，在其终端按 `Ctrl+C` 停止。
此时不要停止 PostgreSQL 和 Redis，因为备份命令仍需连接它们。

### 2. 在实验服务器导出 PostgreSQL

```bash
mkdir -p /tmp/llmapi-migration
POSTGRES_CONTAINER=postgres
REDIS_CONTAINER=redis

docker inspect "$POSTGRES_CONTAINER" >/dev/null
docker inspect "$REDIS_CONTAINER" >/dev/null
docker exec "$POSTGRES_CONTAINER" postgres --version
docker exec "$REDIS_CONTAINER" redis-server --version

docker exec "$POSTGRES_CONTAINER" \
  pg_dump -U root -Fc --no-owner --no-acl new-api \
  > /tmp/llmapi-migration/new-api.dump

docker exec "$POSTGRES_CONTAINER" \
  pg_dump -U root -Fc --no-owner --no-acl platform_db \
  > /tmp/llmapi-migration/platform_db.dump

test -s /tmp/llmapi-migration/new-api.dump
test -s /tmp/llmapi-migration/platform_db.dump
```

如果 PostgreSQL 用户不是 `root`，将两处 `-U root` 改为实际用户。检查备份目录：

```bash
docker exec -i "$POSTGRES_CONTAINER" pg_restore -l \
  < /tmp/llmapi-migration/new-api.dump | head
docker exec -i "$POSTGRES_CONTAINER" pg_restore -l \
  < /tmp/llmapi-migration/platform_db.dump | head
```

目标 Compose 当前使用 PostgreSQL 15。如果实验机输出的 PostgreSQL 主版本高于 15，
先将 `docker-compose.prod.yml` 的 `postgres:15` 调整为相同或更高主版本，再初始化
目标数据卷。不要把高版本 PostgreSQL 的备份恢复到更低主版本后直接上线。

### 3. 在实验服务器导出 Redis

从实际环境文件读取 Redis 密码，不要把密码直接写进 README 或迁移包：

```bash
# 完整 Docker 实验环境使用根目录 .env.docker：
cd /path/to/experiment-deployment
set -a
source .env.docker
set +a

# 如果是“源码应用 + Docker 数据库”，改为：
# cd /path/to/new-api-platform/core/new-api
# set -a; source .env; set +a

docker exec "$REDIS_CONTAINER" redis-cli \
  -a "$REDIS_PASSWORD" --no-auth-warning SAVE

docker exec "$REDIS_CONTAINER" test -s /data/dump.rdb
docker cp "$REDIS_CONTAINER":/data/dump.rdb \
  /tmp/llmapi-migration/redis.rdb
test -s /tmp/llmapi-migration/redis.rdb
unset REDIS_PASSWORD POSTGRES_PASSWORD SESSION_SECRET
```

Redis 主要保存缓存和运行状态，通常可以不迁移；但执行以上步骤可保留当前键值数据。
`SAVE` 会短暂阻塞 Redis，迁移前已经停止应用写入，因此可以获得确定的完整快照；
命令返回 `OK` 后再复制标准快照 `/data/dump.rdb`。不要把 `redis-cli --rdb` 的输出
路径当作容器内路径。

### 4. 导出应用文件

用户、订单、FAQ、发票等结构化数据已包含在两个 PostgreSQL 备份中。若实验应用以
Docker 运行，还要备份应用容器 `/data`，其中可能包含上传文件或运行期文件：

```bash
cd /path/to/experiment-deployment
APP_CONTAINER="$(docker compose --env-file .env.docker \
  -f docker-compose.prod.yml ps -q new-api)"
test -n "$APP_CONTAINER"
mkdir -p /tmp/llmapi-migration/app-data
docker cp "$APP_CONTAINER":/data/. /tmp/llmapi-migration/app-data/
```

若实验应用从源码运行，检查 `core/new-api/data/`；存在且非空时复制：

```bash
mkdir -p /tmp/llmapi-migration/app-data
cp -a /path/to/new-api-platform/core/new-api/data/. \
  /tmp/llmapi-migration/app-data/
```

应用日志不影响恢复。确需留档时单独复制 `/app/logs`，不要覆盖新服务器日志卷。

### 5. 打包、校验并传输

```bash
cd /tmp
tar -czf llmapi-migration.tar.gz llmapi-migration
sha256sum llmapi-migration.tar.gz > llmapi-migration.tar.gz.sha256

scp llmapi-migration.tar.gz llmapi-migration.tar.gz.sha256 \
  NEW_SERVER_USER@NEW_SERVER_IP:/tmp/
```

在新服务器验证并解压：

```bash
cd /tmp
sha256sum -c llmapi-migration.tar.gz.sha256
tar -xzf llmapi-migration.tar.gz
```

迁移包包含业务数据，应通过可信内网或 SSH 传输，恢复完成后安全删除，不要上传 Git、
对象存储公开桶或聊天工具。

### 6. 准备新服务器的全 Docker 部署

按照“方式 2：应用、PostgreSQL 和 Redis 全部由 Docker 启动”创建：

```text
/opt/llmapi-deploy/docker-compose.prod.yml
/opt/llmapi-deploy/.env.docker
/opt/llmapi-deploy/scripts/docker-prod.sh
/opt/llmapi-deploy/certs/fullchain.pem
/opt/llmapi-deploy/certs/privkey.pem
```

新服务器 `.env.docker` 可使用新的 PostgreSQL、Redis 密码；备份文件不绑定旧密码。
域名和证书则必须与新服务器最终访问地址一致。先检查配置并拉取镜像：

```bash
cd /opt/llmapi-deploy
./scripts/docker-prod.sh config
./scripts/docker-prod.sh pull
```

以下恢复步骤要求目标数据卷为空。先确认没有旧的同名生产数据；如果目标机曾运行过
该 Compose，不要继续覆盖，应先备份原有数据并确认 Compose 项目名和 volumes。

### 7. 创建数据库并恢复 PostgreSQL

只启动 PostgreSQL，随后创建独立的 `platform_db`：

```bash
cd /opt/llmapi-deploy
docker compose --env-file .env.docker -f docker-compose.prod.yml up -d postgres
docker compose --env-file .env.docker -f docker-compose.prod.yml \
  run --rm platform-db-init
```

恢复两个数据库：

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U root -d new-api --clean --if-exists --no-owner --no-acl \
  --exit-on-error \
  < /tmp/llmapi-migration/new-api.dump

docker compose --env-file .env.docker -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U root -d platform_db --clean --if-exists --no-owner --no-acl \
  --exit-on-error \
  < /tmp/llmapi-migration/platform_db.dump
```

如果新服务器的 `POSTGRES_USER` 不是 `root`，将 `-U root` 改为对应用户。验证：

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml exec -T postgres \
  psql -U root -d new-api -c 'SELECT current_database();'
docker compose --env-file .env.docker -f docker-compose.prod.yml exec -T postgres \
  psql -U root -d platform_db -c 'SELECT current_database();'
```

### 8. 恢复 Redis 和应用文件

以下 Redis 恢复方法只适用于全新的空 Redis volume。先创建但不启动 Redis，把 RDB
放入 `/data/dump.rdb`，首次启动时 Redis 会加载它并生成新的 AOF：

```bash
cd /opt/llmapi-deploy
docker compose --env-file .env.docker -f docker-compose.prod.yml create redis
TARGET_REDIS_CONTAINER="$(docker compose --env-file .env.docker \
  -f docker-compose.prod.yml ps --all --quiet redis)"
test -n "$TARGET_REDIS_CONTAINER"
docker cp /tmp/llmapi-migration/redis.rdb \
  "$TARGET_REDIS_CONTAINER":/data/dump.rdb
docker compose --env-file .env.docker -f docker-compose.prod.yml start redis
set -a; source .env.docker; set +a
docker compose --env-file .env.docker -f docker-compose.prod.yml exec -T redis \
  redis-cli -a "$REDIS_PASSWORD" --no-auth-warning DBSIZE
unset REDIS_PASSWORD POSTGRES_PASSWORD SESSION_SECRET
```

恢复应用 `/data`（如果备份目录存在且非空）：

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml \
  create --no-deps new-api
TARGET_APP_CONTAINER="$(docker compose --env-file .env.docker \
  -f docker-compose.prod.yml ps --all --quiet new-api)"
test -n "$TARGET_APP_CONTAINER"
docker cp /tmp/llmapi-migration/app-data/. "$TARGET_APP_CONTAINER":/data/
```

### 9. 启动并验证新服务器

```bash
cd /opt/llmapi-deploy
./scripts/docker-prod.sh start
./scripts/docker-prod.sh ps
./scripts/docker-prod.sh logs
```

另开终端验证 HTTPS 和 API：

```bash
curl -I https://YOUR_DOMAIN/
curl https://YOUR_DOMAIN/api/status
```

登录后重点核对用户、余额、充值订单、FAQ、更新日志、发票申请及上传文件。确认无误
后再切换域名 DNS 或负载均衡流量。旧服务器和迁移包至少保留到验收完成；不要让新旧
应用同时向同一个数据库写入。验收完成后安全清理临时迁移文件：

```bash
rm -rf /tmp/llmapi-migration /tmp/llmapi-migration.tar.gz \
  /tmp/llmapi-migration.tar.gz.sha256
```

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
