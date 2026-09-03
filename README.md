# new-api Platform Extension Layer

This repository keeps `core/new-api` as the upstream gateway and places product-specific code in `extensions/`.

Run `./scripts/assemble-extensions.sh` before frontend or backend builds. The script creates only ignored generated extension files under `core/new-api/platform/` and `core/new-api/web/src/platform/`; the four stable core seams are tracked as patches.

See `docs/extension-architecture.md` for the stable integration seams and upgrade procedure.

For a complete Docker deployment with the application, portal gateway,
PostgreSQL and Redis, see [docs/docker-production-deployment.md](docs/docker-production-deployment.md).
Use `./scripts/publish-docker-images.sh` to build and publish both project
images to Docker Hub with `latest` and immutable version tags.

## Publishing Docker images

Prerequisites:

- Docker Engine is installed and the current user can run `docker`.
- The machine can access `registry-1.docker.io` and `proxy.golang.org`.
- A Docker Hub access token has been created. Do not use the account password.

Build and publish both images using the default Docker Hub username
`jingquanliang` and the current Git commit as the immutable version:

```bash
cd /home/jing/new-api-platform
./scripts/publish-docker-images.sh --token 'YOUR_DOCKER_HUB_ACCESS_TOKEN'
```

Specify a different Docker Hub username or version when needed:

```bash
./scripts/publish-docker-images.sh \
  --token 'YOUR_DOCKER_HUB_ACCESS_TOKEN' \
  --username jingquanliang \
  --version v1.0.0
```

Available arguments:

| Argument | Meaning | Default |
| --- | --- | --- |
| `--token TOKEN` | Docker Hub access token | Existing Docker login or `DOCKERHUB_TOKEN` |
| `--username USERNAME` | Docker Hub namespace | `jingquanliang` |
| `--version VERSION` | Immutable image tag | Current short Git commit |
| `--help` | Display command usage | - |

The script builds and pushes four tags:

```text
jingquanliang/new-api-platform:<version>
jingquanliang/new-api-platform:latest
jingquanliang/new-api-platform-gateway:<version>
jingquanliang/new-api-platform-gateway:latest
```

### Publish with GitHub Actions

If the local network cannot resolve or reach Docker Hub, use the included
`Publish Docker images` GitHub Actions workflow. In the GitHub repository open
`Settings -> Secrets and variables -> Actions` and create:

| Secret | Value |
| --- | --- |
| `DOCKERHUB_USERNAME` | `jingquanliang` |
| `DOCKERHUB_TOKEN` | A Docker Hub access token with read/write permission |

These must be **Repository secrets**, not Actions variables. The username
secret is optional because the workflow defaults to `jingquanliang`; the
`DOCKERHUB_TOKEN` repository secret is required. Environment secrets are not
used unless the workflow job is explicitly assigned to that environment.

Then open `Actions -> Publish Docker images -> Run workflow`. The optional
version input accepts values such as `v1.0.0`. With no version input, the
workflow publishes `sha-<commit>` and `latest`. Pushing a Git tag beginning
with `v` also triggers the workflow automatically:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow runs on GitHub infrastructure, so it does not depend on the local
machine's DNS or proxy configuration.

Passing a token as an argument may record it in shell history or expose it
briefly in the process list. On a shared machine, prefer:

```bash
export DOCKERHUB_TOKEN='YOUR_DOCKER_HUB_ACCESS_TOKEN'
./scripts/publish-docker-images.sh
unset DOCKERHUB_TOKEN
```

On the deployment machine, download both project images plus the official
PostgreSQL and Redis images, then start the stack:

```bash
cp .env.docker.example .env.docker
# Edit .env.docker and replace all placeholder secrets.
./scripts/docker-prod.sh pull
./scripts/docker-prod.sh start
```

The full database migration and Docker deployment procedure is documented in
`docs/docker-production-deployment.md`.

## Starting on another server

The target server runs the application, portal gateway, PostgreSQL and Redis
entirely with Docker. It does not need Go, Bun or a local source build.

### 1. Install Docker

On Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Log out and back in, then verify:

```bash
docker version
docker compose version
```

### 2. Download the deployment files

```bash
cd /opt
sudo git clone https://github.com/xiran2018/new-api-platform.git
sudo chown -R "$USER":"$USER" /opt/new-api-platform
cd /opt/new-api-platform
```

The core submodule is not required when the server only pulls and runs the
prebuilt images.

### 3. Configure the environment

```bash
cp .env.docker.example .env.docker
chmod 600 .env.docker
nano .env.docker
```

Replace `POSTGRES_PASSWORD`, `REDIS_PASSWORD` and `SESSION_SECRET` with strong,
unique values. Generate a session secret with:

```bash
openssl rand -hex 32
```

For internal HTTP access, keep `SESSION_COOKIE_SECURE=false`. For production
HTTPS, set it to `true` and configure the exact public URL in
`SESSION_COOKIE_TRUSTED_URL`.

If the Docker Hub repositories are private, log in with an access token:

```bash
docker login --username jingquanliang
```

### 4. Pull and start all services

```bash
./scripts/docker-prod.sh pull
./scripts/docker-prod.sh start
```

This downloads and starts:

```text
jingquanliang/new-api-platform:latest
jingquanliang/new-api-platform-gateway:latest
postgres:15-alpine
redis:7-alpine
```

### 5. Verify the deployment

```bash
./scripts/docker-prod.sh ps
curl -I http://127.0.0.1:11115/
curl http://127.0.0.1:11115/api/status
```

Follow application and gateway logs with:

```bash
./scripts/docker-prod.sh logs
```

The public address is `http://SERVER_IP:11115/`. If a host firewall is enabled:

```bash
sudo ufw allow 11115/tcp
```

Only the gateway publishes a host port. new-api port `7000`, PostgreSQL and
Redis remain inside the Docker network.

### 6. Persistent data

The Compose stack uses persistent Docker volumes:

| Volume | Data |
| --- | --- |
| `postgres_data` | Both `new-api` and `platform_db` databases |
| `redis_data` | Redis AOF data |
| `app_data` | new-api runtime data |
| `app_logs` | Application logs |

Normal stop/start operations retain these volumes:

```bash
./scripts/docker-prod.sh down
./scripts/docker-prod.sh start
```

Never run `docker compose down -v` in production because `-v` deletes the
database and Redis volumes. Existing server data must be migrated with
`pg_dump` and `pg_restore`; do not copy a live PostgreSQL data directory. See
`docs/docker-production-deployment.md` for the complete migration commands.

For a local rebuild and startup, run `./scripts/rebuild-and-start.sh`. It uses
`core/new-api/.env`, including `PORT=7000`. Before building, the script runs
`bun install --frozen-lockfile`, so dependencies added by an upstream update are
installed without modifying `bun.lock`.

## Databases

Keep new-api and platform data separate:

```bash
SQL_DSN=postgresql://root:123456@localhost:5432/new-api
PLATFORM_DATABASE_URL=postgresql://root:123456@localhost:5432/platform_db?sslmode=disable
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
