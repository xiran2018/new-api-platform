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
Vendor comparison text and calculations live entirely in the platform adapter.
Core pricing controls expose only a generic `renderPriceAddon` slot carrying a
field key, optional tier scope, and current value. The compatibility check guards
that slot across legacy and visual expression fields without coupling platform
UI to upstream internals. Do not replace expression discounts with `(expression) * factor`:
that is invalid for `tier(name, fixed(amount))` request-price leaves.

Model list compatibility is intentional: upstream model management requests
`include_channel_models=true`, and platform price management refreshes its own
catalogue from `models` plus enabled abilities on enabled channels. This keeps
both management pages aligned while `model_price_catalogs` remains the storage
table for platform-only presentation fields.

Actual prices have one source of truth. Platform edits call new-api's
`/api/option/model_pricing` endpoint, which transactionally updates the pricing
maps in `new-api.options` and refreshes the runtime billing cache. Model
management reads that same endpoint. The platform catalogue keeps a display
snapshot only, and refreshes it from `model.GetPricing()` whenever its list is
loaded. The compatibility script guards all three links in this chain.

`frontend-route-mount.patch` intentionally excludes the generated
`routeTree.gen.ts`; run the official frontend build after applying it.

Do not keep broad feature changes here. If a patch grows beyond its seam, move the feature code back into `extensions/`.
