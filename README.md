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
