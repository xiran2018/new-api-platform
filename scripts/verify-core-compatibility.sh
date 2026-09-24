#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
editor="$repo_root/core/new-api/web/src/features/system-settings/models/tiered-pricing-editor.tsx"
sheet="$repo_root/core/new-api/web/src/features/system-settings/models/model-pricing-sheet.tsx"
price_inputs="$repo_root/core/new-api/web/src/features/system-settings/models/model-pricing-inputs.tsx"
tier_price_fields="$repo_root/core/new-api/web/src/features/system-settings/models/tier-price-fields.tsx"
visual_billing_editor="$repo_root/core/new-api/web/src/features/system-settings/models/visual-billing-document-editor.tsx"
pricing_amount_input="$repo_root/core/new-api/web/src/features/model-pricing/pricing-amount-input.tsx"
pricing_format="$repo_root/core/new-api/web/src/features/system-settings/models/pricing-format.ts"
addon_context="$repo_root/extensions/frontend/model-prices/pricing-field-addon.tsx"
adapter="$repo_root/extensions/frontend/admin-pages/model-prices/runtime-pricing-editor.tsx"
usage_rule_builder="$repo_root/extensions/frontend/admin-pages/model-prices/usage-rule-builder.tsx"
runtime_pricing_test="$repo_root/extensions/frontend/admin-pages/model-prices/runtime-pricing-editor.test.ts"
usage_rule_test="$repo_root/extensions/frontend/admin-pages/model-prices/usage-rule-builder.test.ts"
presets="$repo_root/extensions/frontend/model-prices/expression-presets.ts"
renderer_test="$repo_root/extensions/frontend/model-prices/price-renderer.test.tsx"
capability_contract="$repo_root/extensions/frontend/model-prices/billing-capability-contract.ts"
template_registry="$repo_root/extensions/frontend/model-prices/billing-template-registry.ts"
template_registry_doc="$repo_root/docs/billing-template-registry.md"
platform_backend="$repo_root/extensions/backend/model_prices.go"
model_table="$repo_root/core/new-api/web/src/features/models/components/models-table.tsx"
model_pricing_api="$repo_root/core/new-api/web/src/features/model-pricing/api.ts"

usage() {
  cat <<EOF
Usage: $0 [--help]

Checks the contract between the upstream pricing editor and platform pricing
extensions. It does not modify files.

  --help   Show this help
EOF
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) usage >&2; exit 1 ;;
esac

require_text() {
  local file="$1" text="$2" message="$3"
  if ! grep -Fq "$text" "$file"; then
    echo "Compatibility check failed: $message" >&2
    echo "Expected '$text' in ${file#"$repo_root/"}." >&2
    exit 1
  fi
}

for key in \
  input-length-tiers \
  qwen-thinking-output \
  shared-input-thinking-output \
  two-range-thinking-output \
  three-range-shared-input-thinking-output \
  text-image-audio-split \
  unified-multimodal-input-audio-output \
  omni-output-modes \
  omni-shared-media-input-output-modes \
  live-translation-multimodal \
  audio-transcription-per-second
do
  require_text "$presets" "key: '$key'" "a platform expression preset was lost during upstream synchronization"
done

require_text "$template_registry" "EXPRESSION_TEMPLATE_REGISTRY" \
  "the machine-readable expression-template registry was lost"
require_text "$template_registry" "ADVANCED_MEDIA_TEMPLATE_REGISTRY" \
  "the machine-readable advanced-media registry was lost"
require_text "$template_registry_doc" "登记与检查制度" \
  "the human-readable billing-template maintenance contract was lost"
while IFS= read -r key; do
  require_text "$template_registry_doc" "\`$key\`" \
    "billing template '$key' is not documented in the registry"
done < <(sed -n "s/^[[:space:]]*key: '\([^']*\)'.*/\1/p" "$template_registry" | sort -u)
require_text "$renderer_test" "EXPRESSION_TEMPLATE_REGISTRY" \
  "expression presets are no longer checked against the billing-template registry"
require_text "$usage_rule_test" \
  "ADVANCED_MEDIA_TEMPLATE_REGISTRY" \
  "advanced-media templates are no longer checked against the billing-template registry"
require_text "$usage_rule_builder" "fractionDigits={fractionDigits}" \
  "advanced audio-duration price inputs no longer preserve six-decimal precision"
require_text "$adapter" "resolveVendorComparisonCandidate" \
  "vendor price comparison no longer scans and safely resolves all price blocks"
require_text "$addon_context" "scopeId?: string" \
  "the stable vendor-price field identity was lost from the platform addon seam"
require_text "$tier_price_fields" "scopeId={props.scopeId}" \
  "the upstream visual pricing fields no longer pass the stable comparison identity"
require_text "$visual_billing_editor" "scopeId={props.number}" \
  "visual pricing tiers no longer expose their stable structural path"
require_text "$adapter" "candidate.scopeId === scopeId" \
  "vendor price comparison no longer prioritizes the stable structural path"
require_text "$adapter" "Parse blocks independently" \
  "multiple vendor expression blocks may be concatenated and lost again"
require_text "$usage_rule_builder" "findComparisonUsageCharge" \
  "advanced-media vendor prices are no longer matched by rule semantics"
require_text "$runtime_pricing_test" "reads normalized vendor prices from blocks after the first block" \
  "the non-first-block vendor-price regression test was lost"
require_text "$runtime_pricing_test" "does not guess after a tier is renamed when vendor prices differ" \
  "the ambiguous vendor-price safety regression test was lost"
require_text "$runtime_pricing_test" "uses the stable visual rule path when tier names are duplicated" \
  "the duplicate-tier-name vendor-price regression test was lost"
require_text "$usage_rule_test" "matches the vendor tier by semantics after rules are reordered" \
  "the reordered advanced-rule vendor-price regression test was lost"
require_text "$template_registry_doc" "原厂价格比较的稳定性合同" \
  "the vendor-price comparison maintenance contract was lost"

# The input-length-thinking-tiers preset was intentionally removed from the
# picker.  Keep the historical expression format compatible instead: prices
# saved with that preset remain in the database and must still render as paired
# thinking/non-thinking tiers after an upstream sync.
require_text "$renderer_test" "keeps legacy input-range thinking prices paired after the preset is removed" \
  "legacy input-range thinking pricing compatibility was lost during upstream synchronization"

for capability in \
  token-pricing request-pricing expression-pricing advanced-media-pricing \
  shared-input-output-branches input-length-tiers thinking-parameter-branches \
  audio-duration-pricing video-output-pricing
do
  require_text "$capability_contract" "'$capability'" "a stable billing capability was removed"
done
require_text "$presets" 'text+audio output (audio only)' "the shared-input output branch capability was removed"

for key in image boolean volume video videoAudio videoMode imageVideo audioSeconds ttsCharacters voiceCount taskMatrix blank
do
  require_text "$usage_rule_builder" "$key" "a screenshot-derived visual billing template was lost during upstream synchronization"
done

require_text "$editor" "PLATFORM_BILLING_PRESET_GROUPS" "the platform expression preset seam was lost during upstream synchronization"
require_text "$sheet" "Per-token (deprecated)" "the upstream per-token lifecycle label changed"
require_text "$sheet" "Per-request (deprecated)" "the upstream per-request lifecycle label changed"
require_text "$adapter" "ModelPricingEditorPanel" "the platform page no longer reuses the upstream pricing editor"
require_text "$adapter" "scrollHeader=" "the platform pricing controls need adaptation to the current upstream editor API"
require_text "$sheet" "additionalPricingTab" "the advanced media pricing tab seam was lost during upstream synchronization"
require_text "$adapter" "additionalPricingTab={{" "advanced media pricing is no longer a peer pricing mode"
require_text "$adapter" "previewModelPricingConversion" "legacy platform prices are no longer migrated through the upstream conversion API"
require_text "$adapter" "applyPricingDiscount" "platform discounts are no longer applied through the validated pricing helper"
require_text "$adapter" "serializeVisualBillingDocument" "expression discounts may produce invalid fixed-price expressions"
require_text "$sheet" "renderPriceAddon" "the generic pricing-field extension slot was lost from the upstream editor"
require_text "$sheet" "PricingFieldAddonProvider" "the generic pricing-field provider was lost from the upstream editor"
require_text "$addon_context" "createContext" "the isolated pricing-field extension context is missing"
require_text "$price_inputs" "<PricingFieldAddon" "legacy price fields no longer mount the generic extension slot"
require_text "$tier_price_fields" "<PricingFieldAddon" "visual expression fields no longer mount the generic extension slot"
require_text "$tier_price_fields" "fractionDigits={variable.key === 'aud_s' ? 6 : undefined}" \
  "audio-duration price inputs no longer request six-decimal precision"
require_text "$pricing_amount_input" "fractionDigits?: number" \
  "the generic pricing input lost configurable display precision"
require_text "$pricing_format" "decimals = PRICE_DISPLAY_DECIMALS" \
  "the pricing formatter lost configurable display precision"
require_text "$repo_root/core/new-api/web/src/features/pricing/lib/billing-expression/types.ts" "vid_o" "visual video-output pricing variable was lost"
require_text "$repo_root/core/new-api/web/src/features/pricing/lib/billing-expression/types.ts" "aud_s" "visual audio-duration pricing variable was lost"
require_text "$repo_root/core/new-api/web/src/features/pricing/lib/billing-expression/visual.ts" "request-comparison" "visual request-parameter pricing conditions were lost"
require_text "$repo_root/core/new-api/web/src/features/pricing/lib/billing-expression/visual.ts" "sharedPrices?: VisualPrice[]" "tier-local shared input pricing support was lost"
require_text "$repo_root/core/new-api/web/src/features/system-settings/models/visual-billing-document-editor.tsx" "SharedInputThinkingRangesEditor" "the shared-input thinking-range editor was lost"
require_text "$repo_root/core/new-api/web/src/features/system-settings/models/visual-billing-document-editor.tsx" "supportsPlatformVisualBillingDocumentEditor" "the platform visual billing editor seam was lost"
require_text "$repo_root/extensions/frontend/model-prices/visual-billing-document-editor.tsx" "PlatformVisualBillingDocumentEditor" "the shared-media Omni editor was lost"
require_text "$renderer_test" "renders %s as one grouped input/output row" "the grouped Omni price table was lost"
require_text "$repo_root/core/new-api/pkg/billingexpr/types.go" "AS    float64" "backend audio-duration pricing parameter was lost"
require_text "$repo_root/core/new-api/pkg/billingexpr/compile.go" '"vid"' "backend video-input pricing compile binding was lost"
require_text "$repo_root/core/new-api/pkg/billingexpr/compile.go" '"vid_o"' "backend video-output pricing compile binding was lost"
require_text "$repo_root/core/new-api/pkg/billingexpr/compile.go" '"aud_s"' "backend audio-duration pricing compile binding was lost"
require_text "$repo_root/core/new-api/pkg/billingexpr/run.go" '"vid_o"' "backend video-output pricing binding was lost"
require_text "$repo_root/core/new-api/service/tiered_settle.go" 'usedVars["aud_s"]' "audio-duration settlement mapping was lost"
require_text "$adapter" "renderPriceAddon={renderPriceAddon}" "the platform vendor comparison UI is no longer connected to the generic slot"
require_text "$model_table" "include_channel_models: true" "model management no longer includes channel models"
require_text "$platform_backend" "model.GetModelConnections()" "platform price management no longer includes enabled channel abilities"
require_text "$adapter" "saveModelPricing([" "platform actual-price edits no longer use the upstream runtime-pricing API"
require_text "$adapter" "getModelPricing([modelKey])" "platform actual-price edits no longer read back runtime pricing after save"
require_text "$model_pricing_api" "api.patch('/api/option/model_pricing'" "the upstream runtime-pricing save endpoint changed"
require_text "$model_table" "useModelPricing(" "model management no longer reads the shared runtime-pricing configuration"
require_text "$platform_backend" "model.GetPricing()" "platform display prices are no longer refreshed from runtime pricing"
require_text "$platform_backend" "visibleInModelSquare" "public model prices no longer use the model-square visibility set"
require_text "$platform_backend" '"display_name", "vendor", "tags"' "public model metadata may become stale after model synchronization"

echo "Core pricing compatibility: ok"
