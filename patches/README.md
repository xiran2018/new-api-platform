# Core seam patches

Each patch changes one designated extension seam only. They are concrete patch
records for the current integration; refresh their context after an upstream
upgrade changes the target file:

- `frontend-public-navigation.patch`
- `frontend-admin-navigation.patch`
- `frontend-route-mount.patch`
- `backend-plugin-loader.patch`

`frontend-route-mount.patch` intentionally excludes the generated
`routeTree.gen.ts`; run the official frontend build after applying it.

Do not keep broad feature changes here. If a patch grows beyond its seam, move the feature code back into `extensions/`.
