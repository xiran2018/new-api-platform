# new-api upstream conflict playbook

Use this document when `./scripts/sync-upstream.sh --merge` reports a conflict.

## Before resolving

1. Do not resolve conflicts in `relay/`, core `controller/`, `model/`, or core database migrations for platform features.
2. Keep all SaaS business logic in `extensions/`.
3. Re-run `./scripts/assemble-extensions.sh` before testing; generated platform directories are ignored.
4. Do not hand-edit `web/src/routeTree.gen.ts`; regenerate it with `cd core/new-api/web && bun run build`.
5. Before `--merge`, commit the current platform seam changes or save them with `git -C core/new-api stash -u`. Git cannot safely merge upstream into a dirty worktree that changes the same files.

## Approved core seams

| Core file | Platform requirement | Keep during a conflict |
|---|---|---|
| `router/main.go` | Registers platform APIs | Import `github.com/QuantumNous/new-api/platform` and call `platform.RegisterRoutes(router.Group("/api"))` immediately after `SetApiRouter(router)`. Preserve upstream router ordering otherwise. |
| `web/src/hooks/use-top-nav-links.ts` | Public Changelog and FAQ navigation | Import and call `usePlatformPublicTopNavLinks()`, then append the result after upstream official links. Preserve all upstream `HeaderNavModules` behavior. |
| `web/src/hooks/use-sidebar-data.ts` | Admin Content management entry | Import `platformAdminNav` and append its mapped admin-only items to the existing `admin` group. Do not duplicate or replace upstream menu items. |
| `web/src/routes/faq/index.tsx` | FAQ route adapter | Keep the thin route adapter that imports `FaqPage` from `@/platform/public-pages/faq`. |
| `web/src/routes/updates/index.tsx` | Changelog route adapter | Keep the thin route adapter that imports `UpdatesPage` from `@/platform/public-pages/updates`. |
| `web/package.json`, `web/bun.lock` | Tiptap editor | Keep `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-color`, and `@tiptap/extension-text-style`; regenerate lock data with Bun if upstream changed dependencies. |
| `web/src/i18n/locales/*.json` | Platform UI translation keys | Keep platform translation keys and retain any upstream translations. Never overwrite either side wholesale. |

## Deployment configuration

Keep existing new-api configuration unchanged:

```text
SQL_DSN=postgresql://root:POSTGRES_PASSWORD@localhost:5432/new-api
```

Platform-only features use:

```text
PLATFORM_DATABASE_URL=postgresql://root:POSTGRES_PASSWORD@localhost:5432/platform_db?sslmode=disable
```

Do not replace `POSTGRES_DB: new-api` with `platform_db`. The Compose `platform-db-init` service creates the second database in the same PostgreSQL instance.

## Resolution sequence

```bash
cd /home/jing/new-api-platform
./scripts/sync-upstream.sh
./scripts/sync-upstream.sh --merge

# Resolve only the files listed above, then:
./scripts/assemble-extensions.sh
cd core/new-api/web && bun run build && bun run typecheck
cd .. && go build ./router ./platform
```

Finally verify:

- public `/updates` and `/faq` share the normal public header;
- the update visibility switch hides the Changelog navigation item;
- `/platform/content` requires an administrator session;
- `platform_db` is used only for platform data.
