#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
editor="$repo_root/core/new-api/web/src/features/system-settings/models/tiered-pricing-editor.tsx"
sheet="$repo_root/core/new-api/web/src/features/system-settings/models/model-pricing-sheet.tsx"
price_inputs="$repo_root/core/new-api/web/src/features/system-settings/models/model-pricing-inputs.tsx"
visual_editor="$repo_root/core/new-api/web/src/features/system-settings/models/visual-billing-document-editor.tsx"
adapter="$repo_root/extensions/frontend/admin-pages/model-prices/runtime-pricing-editor.tsx"
presets="$repo_root/extensions/frontend/model-prices/expression-presets.ts"
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
  input-length-thinking-tiers \
  text-image-audio-split \
  unified-multimodal-input-audio-output \
  live-translation-multimodal \
  audio-transcription-per-second
do
  require_text "$presets" "key: '$key'" "a platform expression preset was lost during upstream synchronization"
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
require_text "$price_inputs" "addon={props.addon}" "legacy price fields no longer mount the generic extension slot"
require_text "$visual_editor" "renderPriceAddon" "visual expression fields no longer mount the generic extension slot"
require_text "$adapter" "renderPriceAddon={renderPriceAddon}" "the platform vendor comparison UI is no longer connected to the generic slot"
require_text "$model_table" "include_channel_models: true" "model management no longer includes channel models"
require_text "$platform_backend" "model.GetModelConnections()" "platform price management no longer includes enabled channel abilities"
require_text "$adapter" "saveModelPricing([" "platform actual-price edits no longer use the upstream runtime-pricing API"
require_text "$adapter" "getModelPricing([modelKey])" "platform actual-price edits no longer read back runtime pricing after save"
require_text "$model_pricing_api" "api.patch('/api/option/model_pricing'" "the upstream runtime-pricing save endpoint changed"
require_text "$model_table" "useModelPricing(" "model management no longer reads the shared runtime-pricing configuration"
require_text "$platform_backend" "model.GetPricing()" "platform display prices are no longer refreshed from runtime pricing"

echo "Core pricing compatibility: ok"
