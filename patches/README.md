# Core seam patches

Each patch changes one designated extension seam only. They are concrete patch
records for the current integration; refresh their context after an upstream
upgrade changes the target file:

- `frontend-public-navigation.patch`
- `frontend-admin-navigation.patch`
- `frontend-route-mount.patch`
- `backend-plugin-loader.patch`

Model-pricing compatibility is additionally guarded by
`scripts/verify-core-compatibility.sh`. The model-price page reuses upstream's
`ModelPricingEditorPanel`, while six platform expression presets and one generic
additional-pricing-tab slot remain small core customizations. The platform uses
that slot to keep advanced media pricing beside Expression, Per-token, and
Per-request instead of rendering it as a separate panel. Legacy platform prices
are converted through upstream's model-pricing conversion API before editing;
unsupported conversions remain in the legacy editor rather than being changed
silently. Both sync and publish workflows stop if upstream lifecycle labels,
conversion support, presets, or the additional-tab adapter contract disappear.
The complete screenshot-derived pricing contract and runtime field mapping are
recorded in `docs/billing-mode-compatibility.md`. Sync also runs the visual
template and expression settlement regression suites, so a template that still
exists in source but no longer parses or bills cannot pass verification.
Vendor comparison text and calculations live entirely in the platform adapter.
Core exposes one generic `renderPriceAddon` renderer through an isolated React
context carrying a field key, optional tier scope, and current value. Intermediate
editors do not forward platform props; only the outer provider and final price
inputs know about the extension point. The compatibility check guards those
mounts without coupling platform UI to upstream editor structure. Do not replace
expression discounts with `(expression) * factor`:
that is invalid for `tier(name, fixed(amount))` request-price leaves.

`scripts/sync-upstream.sh` enables Git `rerere` for the core checkout. The first
time an upstream refactor conflicts with a seam, resolve and commit it normally;
Git records the before/after conflict. Later merges with the same conflict shape
can reuse that resolution automatically. `--check` never changes the worktree,
while `--merge` may attempt recorded resolutions and leaves genuinely new
conflicts visible for review.

Model list compatibility is intentional: upstream model management requests
`include_channel_models=true`, and platform price management refreshes its own
catalogue from `models` plus enabled abilities on enabled channels. This keeps
both management pages aligned while `model_price_catalogs` remains the storage
table for platform-only presentation fields.

The public model-price page uses the exact model-name set published by
`model.GetPricing()`, the same runtime source as the model square. During each
catalogue refresh it also updates model name, vendor, tags, visibility, and sort
order from new-api, while preserving platform-only descriptions, administrator
notes, vendor comparison prices, and discount metadata.

Actual prices have one source of truth. Platform edits call new-api's
`/api/option/model_pricing` endpoint, which transactionally updates the pricing
maps in `new-api.options` and refreshes the runtime billing cache. Model
management reads that same endpoint. The platform catalogue keeps a display
snapshot only, and refreshes it from `model.GetPricing()` whenever its list is
loaded. The compatibility script guards all three links in this chain.

`frontend-route-mount.patch` intentionally excludes the generated
`routeTree.gen.ts`; run the official frontend build after applying it.

Do not keep broad feature changes here. If a patch grows beyond its seam, move the feature code back into `extensions/`.
