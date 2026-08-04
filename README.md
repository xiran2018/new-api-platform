# new-api Platform Extension Layer

This repository keeps `core/new-api` as the upstream gateway and places product-specific code in `extensions/`.

Run `./scripts/assemble-extensions.sh` before frontend or backend builds. The script creates only ignored generated extension files under `core/new-api/platform/` and `core/new-api/web/src/platform/`; the four stable core seams are tracked as patches.

See `docs/extension-architecture.md` for the stable integration seams and upgrade procedure.

For a local rebuild and startup, run `./scripts/rebuild-and-start.sh`. It uses
`core/new-api/.env`, including `PORT=7000`.

## Databases

Keep new-api and platform data separate:

```bash
SQL_DSN=postgresql://root:123456@localhost:5432/new-api
PLATFORM_DATABASE_URL=postgresql://root:123456@localhost:5432/platform_db?sslmode=disable
```

## Updating new-api upstream

The upstream sync helper fetches the official repository, assembles extensions,
regenerates frontend routes and runs the affected build checks.

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
