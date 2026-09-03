# Docker production deployment

The production stack is defined by `docker-compose.prod.yml`. It builds only
the project-specific application and portal images. PostgreSQL and Redis use
their official images and persist data in Docker volumes.

## 1. Install on the target machine

Install Git, Docker Engine and Docker Compose. On Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y git ca-certificates curl postgresql-client
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Log out and back in, then verify:

```bash
docker version
docker compose version
```

Clone all source, including the core submodule:

```bash
git clone --recurse-submodules git@github.com:xiran2018/new-api-platform.git
cd new-api-platform
git submodule update --init --recursive
```

## 2. Configure secrets

```bash
cp .env.docker.example .env.docker
chmod 600 .env.docker
openssl rand -hex 32
```

Edit `.env.docker` and replace all placeholder secrets. Use URL-safe
characters for `POSTGRES_PASSWORD` because it is embedded in PostgreSQL URLs.
For an HTTPS deployment, set `SESSION_COOKIE_SECURE=true` and set
`SESSION_COOKIE_TRUSTED_URL` to the exact public origin.

The environment file is excluded from Git and must never be committed.

## 3. Build images

On a machine with source code and Internet access:

```bash
./scripts/docker-prod.sh build
```

To build and publish both project images to Docker Hub, first create a Docker
Hub access token and pass it to the script:

```bash
./scripts/publish-docker-images.sh --token 'your-access-token'
```

The script publishes both the immutable current Git commit tag and `latest`.
It never stores the token in the repository. A command-line token can remain
in shell history or briefly appear in the process list; using the
`DOCKERHUB_TOKEN` environment variable is safer on shared machines. Optional
arguments are:

```bash
./scripts/publish-docker-images.sh \
  --token 'your-access-token' \
  --username jingquanliang \
  --version v1.0.0
```

When Docker Hub is unreachable from the build machine, configure repository
Actions secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`, then run the
`Publish Docker images` workflow from GitHub Actions. This builds and pushes on
GitHub-hosted infrastructure and avoids local DNS/proxy restrictions.

This creates:

```text
jingquanliang/new-api-platform:latest
jingquanliang/new-api-platform-gateway:latest
```

The application image contains the core application plus the backend and
frontend code from `extensions/`. The gateway image contains the portal proxy
and independent homepage.

To build and start everything on the same machine:

```bash
./scripts/docker-prod.sh up
```

To transfer prebuilt images to an offline/remote target:

```bash
docker save -o new-api-platform-images.tar \
  jingquanliang/new-api-platform:latest \
  jingquanliang/new-api-platform-gateway:latest
scp new-api-platform-images.tar user@TARGET_HOST:/tmp/
```

On the target:

```bash
docker load -i /tmp/new-api-platform-images.tar
./scripts/docker-prod.sh start
```

`start` uses the loaded images and does not rebuild them. PostgreSQL and Redis
official images must already be present or be pullable from the target.

For a normal online target, pull all published and official images, then start:

```bash
./scripts/docker-prod.sh pull
./scripts/docker-prod.sh start
```

The `pull` command downloads the two project images plus the official
`postgres:15-alpine` and `redis:7-alpine` images.

## 4. Migrate the databases

There are two required PostgreSQL databases:

- `new-api`: users, models, recharge orders and core application data.
- `platform_db`: FAQ, changelog, invoices, reimbursements, samples and uploaded
  platform files.

Database contents are not files inside this Git repository. Export them from
the old PostgreSQL server while the old application is stopped or in a quiet
maintenance window:

```bash
pg_dump -Fc --no-owner --no-acl \
  'postgresql://root:OLD_PASSWORD@127.0.0.1:5432/new-api' \
  -f new-api.dump
pg_dump -Fc --no-owner --no-acl \
  'postgresql://root:OLD_PASSWORD@127.0.0.1:5432/platform_db' \
  -f platform_db.dump
scp new-api.dump platform_db.dump user@TARGET_HOST:/tmp/
```

Start only PostgreSQL and the database initializer on the target:

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml up -d postgres
docker compose --env-file .env.docker -f docker-compose.prod.yml run --rm platform-db-init
```

Restore both dumps before starting the application:

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U root -d new-api --clean --if-exists --no-owner < /tmp/new-api.dump
docker compose --env-file .env.docker -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U root -d platform_db --clean --if-exists --no-owner < /tmp/platform_db.dump
```

If `POSTGRES_USER` is changed from `root`, use that value after `-U`.
Do not copy `/var/lib/postgresql/data` from a running database. Logical dumps
are portable and avoid PostgreSQL version and filesystem consistency problems.

## 5. Redis data

Redis is used as shared runtime/cache state and normally does not need to be
migrated. The new stack persists it in the `redis_data` volume with AOF enabled.
If preserving Redis state is essential, stop writes on the old deployment,
copy its `appendonlydir`/`dump.rdb` using a Redis-supported backup procedure,
and restore it before starting the new Redis container. Do not copy a live
Redis data directory while it is being written.

## 6. Start and verify

```bash
./scripts/docker-prod.sh start
./scripts/docker-prod.sh ps
./scripts/docker-prod.sh logs
```

The public entry is:

```text
http://TARGET_HOST:11115/
```

Only the gateway publishes a host port. new-api listens on port `7000` inside
the Docker network, PostgreSQL and Redis are not exposed to the host network.

Verify from the target host:

```bash
curl -I http://127.0.0.1:11115/
curl http://127.0.0.1:11115/api/status
```

## 7. Persistent storage and backups

List the actual Compose volume names:

```bash
docker volume ls | grep new-api-platform
docker volume inspect new-api-platform_postgres_data
```

Docker manages the physical volume paths. Back up PostgreSQL logically:

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U root -Fc new-api > new-api-$(date +%F).dump
docker compose --env-file .env.docker -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U root -Fc platform_db > platform_db-$(date +%F).dump
```

The stack uses these persistent volumes:

| Volume | Purpose |
| --- | --- |
| `postgres_data` | Both PostgreSQL databases |
| `redis_data` | Redis AOF/data |
| `app_data` | new-api runtime data |
| `app_logs` | new-api logs |

Never run `docker compose down -v` in production because `-v` deletes these
volumes.

## 8. Updating

Update source and the submodule using the repository's documented sync flow,
then rebuild and restart:

```bash
./scripts/docker-prod.sh build
./scripts/docker-prod.sh start
```

Take database dumps before every production upgrade.

If a build reports DNS failures for `proxy.golang.org`, repair Docker/host DNS
first. For systemd Docker installations, configure valid DNS servers in
`/etc/docker/daemon.json`, restart Docker, and rerun the build. Do not remove
locked dependencies or alter `go.sum` to work around a DNS failure.
