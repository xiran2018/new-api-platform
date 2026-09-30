#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
editor="$repo_root/core/new-api/web/src/features/system-settings/models/tiered-pricing-editor.tsx"
sheet="$repo_root/core/new-api/web/src/features/system-settings/models/model-pricing-sheet.tsx"
price_inputs="$repo_root/core/new-api/web/src/features/system-settings/models/model-pricing-inputs.tsx"
tier_price_fields="$repo_root/core/new-api/web/src/features/system-settings/models/tier-price-fields.tsx"
visual_billing_editor="$repo_root/core/new-api/web/src/features/system-settings/models/visual-billing-document-editor.tsx"
visual_billing_test="$repo_root/core/new-api/web/src/features/system-settings/models/__tests__/visual-billing-editor.test.tsx"
pricing_amount_input="$repo_root/core/new-api/web/src/features/model-pricing/pricing-amount-input.tsx"
pricing_format="$repo_root/core/new-api/web/src/features/system-settings/models/pricing-format.ts"
addon_context="$repo_root/extensions/frontend/model-prices/pricing-field-addon.tsx"
platform_visual_billing_editor="$repo_root/extensions/frontend/model-prices/visual-billing-document-editor.tsx"
adapter="$repo_root/extensions/frontend/admin-pages/model-prices/runtime-pricing-editor.tsx"
usage_rule_builder="$repo_root/extensions/frontend/admin-pages/model-prices/usage-rule-builder.tsx"
runtime_pricing_test="$repo_root/extensions/frontend/admin-pages/model-prices/runtime-pricing-editor.test.ts"
usage_rule_test="$repo_root/extensions/frontend/admin-pages/model-prices/usage-rule-builder.test.ts"
usage_rule_expression="$repo_root/extensions/frontend/model-prices/usage-rule-expression.ts"
billingexpr_run="$repo_root/core/new-api/pkg/billingexpr/run.go"
presets="$repo_root/extensions/frontend/model-prices/expression-presets.ts"
renderer="$repo_root/extensions/frontend/model-prices/price-renderer.tsx"
renderer_test="$repo_root/extensions/frontend/model-prices/price-renderer.test.tsx"
public_price_page_test="$repo_root/extensions/frontend/public-pages/model-prices/index.test.ts"
capability_contract="$repo_root/extensions/frontend/model-prices/billing-capability-contract.ts"
template_registry="$repo_root/extensions/frontend/model-prices/billing-template-registry.ts"
template_registry_doc="$repo_root/docs/billing-template-registry.md"
compatibility_contract_doc="$repo_root/docs/billing-mode-compatibility.md"
vendor_price_regression_doc="$repo_root/docs/vendor-price-sync-regression.md"
model_price_translations="$repo_root/extensions/frontend/i18n/model-price-translations.ts"
sync_upstream_script="$repo_root/scripts/sync-upstream.sh"
compatibility_workflow="$repo_root/.github/workflows/verify-upstream-compatibility.yml"
platform_backend="$repo_root/extensions/backend/model_prices.go"
model_table="$repo_root/core/new-api/web/src/features/models/components/models-table.tsx"
model_pricing_api="$repo_root/core/new-api/web/src/features/model-pricing/api.ts"
tiered_billing_backend="$repo_root/core/new-api/setting/billing_setting/tiered_billing.go"
realtime_price_helper="$repo_root/core/new-api/relay/helper/price.go"
realtime_quota_service="$repo_root/core/new-api/service/quota.go"
realtime_pricing_controller_test="$repo_root/core/new-api/controller/model_pricing_config_test.go"
tiered_settle_test="$repo_root/core/new-api/service/tiered_settle_test.go"

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

reject_text() {
  local file="$1" text="$2" message="$3"
  if grep -Fq "$text" "$file"; then
    echo "Compatibility check failed: $message" >&2
    echo "Unexpected '$text' in ${file#"$repo_root/"}." >&2
    exit 1
  fi
}

for key in \
  input-length-tiers \
  batch-multimodal-token-tiers \
  qwen-thinking-output \
  shared-input-thinking-output \
  two-range-thinking-output \
  three-range-shared-input-thinking-output \
  text-image-audio-split \
  audio-image-input-text-audio-output \
  unified-multimodal-input-audio-output \
  shared-text-image-input-audio-output-modes \
  shared-text-image-audio-output-modes \
  shared-text-image-video-audio-output-simple \
  shared-text-image-audio-output-simple \
  audio-image-input-text-audio-output-simple \
  text-audio-input-text-audio-output-simple \
  gemini-omni-shared-input-text-video-output-simple \
  gemini-image-shared-input-text-image-output-simple \
  gemini-image-text-image-video-input-output-simple \
  gemini-native-audio-text-media-input-output-simple \
  gemini-robotics-unified-cache-pricing-simple \
  gemini-tts-text-cache-audio-output-simple \
  gemini-multimodal-embedding-input-simple \
  omni-output-modes \
  omni-shared-media-input-output-modes \
  live-translation-multimodal \
  audio-input-audio-output-token-pricing \
  audio-input-text-output-token-pricing \
  audio-transcription-per-second
do
  require_text "$presets" "key: '$key'" "a platform expression preset was lost during upstream synchronization"
done

require_text "$template_registry" "EXPRESSION_TEMPLATE_REGISTRY" \
  "the machine-readable expression-template registry was lost"
require_text "$template_registry" "ADVANCED_MEDIA_TEMPLATE_REGISTRY" \
  "the machine-readable advanced-media registry was lost"
require_text "$compatibility_contract_doc" "永久上游同步规则" \
  "the permanent upstream synchronization contract was lost"
require_text "$compatibility_contract_doc" "价格编辑与展示回归规则（2026-09-29）" \
  "the pricing editor and renderer regression contract was lost"
require_text "$usage_rule_test" \
  "promotes the preceding video tier to a condition-free fallback" \
  "deleting the final advanced-media fallback no longer promotes the preceding tier"
require_text "$usage_rule_test" \
  "charges Seedance from resolution, reference-video state and actual billing tokens" \
  "Seedance resolution/reference-video billing execution coverage was lost"
require_text "$usage_rule_test" \
  "charges Seed3D and Hyper3D from one administrator-friendly completion-token price" \
  "Seed3D/Hyper3D completion-token billing coverage was lost"
require_text "$usage_rule_builder" "unmatchedPolicy" "Seedance unmatched-policy compatibility was lost"
require_text "$usage_rule_expression" "__pricing_unmatched__" "Seedance unmatched sentinel expression support was lost"
require_text "$billingexpr_run" "ErrUnmatchedPricingTier" "backend unmatched pricing rejection was lost"
require_text "$usage_rule_builder" 'unsupportedTaskUsageKeys(createUsageRuleTemplate(key, execution), usageSchema)' "task usage-schema template guard was lost"
require_text "$repo_root/core/new-api/plugins/tasks/doubao/plugin.js" 'image_count: imageCount' "Doubao Seedream output-image-count reservation was lost"
require_text "$repo_root/core/new-api/plugins/tasks/doubao/plugin.js" 'const facts = { image_count: payloads.length }' "Doubao Seedream output-image-count settlement was lost"
require_text "$repo_root/core/new-api/plugins/tasks/doubao/plugin.js" '"doubao-seedream-4-0-20260415"' "Doubao Seedream 4.0 alternate deployment billing support was lost"
require_text "$repo_root/core/new-api/plugins/tasks/doubao/plugin.js" 'const THREE_D_MODELS' "Doubao Seed3D/Hyper3D model profiles were lost"
require_text "$repo_root/core/new-api/plugins/tasks/doubao/plugin.js" 'const THREE_D_USAGE_SCHEMA' "Doubao 3D completion-token usage schema was lost"
require_text "$repo_root/core/new-api/plugins/tasks/doubao/plugin.js" '"doubao-seed3d-2-0-260328"' "Doubao Seed3D 2.0 official model ID support was lost"
require_text "$repo_root/core/new-api/plugins/tasks/doubao/plugin.js" '"hyper3d-gen-2-0-260112"' "Doubao Hyper3D Gen2 official model ID support was lost"
require_text "$repo_root/core/new-api/plugins/tasks/doubao/plugin.js" 'const THREE_D_ESTIMATED_TOKENS = 30000' "Doubao 3D submit-time token reservation was lost"
require_text "$repo_root/core/new-api/plugins/tasks/doubao/plugin.js" 'usage.completion_tokens' "Doubao 3D completion-token settlement was lost"
require_text "$usage_rule_builder" "showVendorComparison" "vendor-price comparison visibility control was lost"
require_text "$usage_rule_test" \
  "charges Seedream input images and the real 2.61M-pixel output buckets" \
  "Seedream input/output pixel-bucket billing coverage was lost"
require_text "$usage_rule_test" \
  "charges 3D generation from the persisted output specification" \
  "3D output-specification billing execution coverage was lost"
require_text "$renderer_test" \
  "hides a single base tier and does not reserve an empty summary row" \
  "single-tier base suppression or top-alignment regression coverage was lost"
require_text "$renderer_test" \
  "does not reserve an empty summary row above a single advanced-media price" \
  "single-tier advanced-media prices reserve an empty summary row again"
require_text "$renderer_test" \
  "hides discount and match-condition columns from advanced pricing tables" \
  "advanced pricing tables expose discount or internal match-condition columns again"
require_text "$renderer_test" \
  "renders batch multimodal token tiers as one compact row per token range" \
  "batch multimodal token-tier compact rendering coverage was lost"
require_text "$renderer_test" \
  "groups Seedance reference-video prices by output resolution" \
  "Seedance grouped resolution/reference-video rendering coverage was lost"
require_text "$renderer_test" \
  "renders Seedream and 3D advanced rules as semantic compact tables" \
  "Seedream or 3D semantic compact rendering coverage was lost"
require_text "$runtime_pricing_test" \
  "keeps an output-video usage rule as advanced pricing and copies all rule data" \
  "advanced-media vendor synchronization no longer preserves the mode or complete rule data"
require_text "$public_price_page_test" \
  "prints all five columns on an unclipped A4 landscape page" \
  "the public model-price PDF export regression coverage was lost"
require_text "$model_price_translations" \
  '"Cache write (1h) price": "1 小时缓存写入价格"' \
  "the simplified-Chinese one-hour cache-write price translation was lost"
require_text "$compatibility_contract_doc" "是平台功能的归属目录" \
  "the rule protecting platform extensions from upstream deletion was lost"
require_text "$template_registry_doc" "登记与检查制度" \
  "the human-readable billing-template maintenance contract was lost"
while IFS= read -r key; do
  require_text "$template_registry_doc" "\`$key\`" \
    "billing template '$key' is not documented in the registry"
done < <(sed -n "s/^[[:space:]]*key: '\([^']*\)'.*/\1/p" "$template_registry" | sort -u)
require_text "$renderer_test" "EXPRESSION_TEMPLATE_REGISTRY" \
  "expression presets are no longer checked against the billing-template registry"
require_text "$renderer_test" "renders Gemini easy templates with modality-specific horizontal headers" \
  "Gemini easy-template modality headers and audio cached-input rendering regression coverage was lost"
require_text "$renderer_test" "Audio cached input" \
  "Gemini audio cached-input display regression coverage was lost"
require_text "$renderer_test" "Text/image/video/audio input" \
  "Gemini unified-input modality-specific display regression coverage was lost"
require_text "$renderer_test" "Text/image/video input" \
  "Gemini shared-input modality-specific display regression coverage was lost"
require_text "$renderer_test" "renders %s as one administrator-friendly row" \
  "the new Gemini administrator-friendly price tables lost regression coverage"
require_text "$visual_billing_test" "updates all input modalities" \
  "the Gemini shared-input editor no longer verifies all modality prices are updated"
require_text "$renderer" "audioCache" \
  "Gemini audio cached-input prices are no longer rendered from the ai_cr/audioCache field"
require_text "$renderer" "Text/image/video/audio input" \
  "Gemini unified-input prices no longer show their concrete modalities"
require_text "$renderer" "Text/image/video input" \
  "Gemini shared-input prices no longer show their concrete modalities"
require_text "$usage_rule_test" \
  "ADVANCED_MEDIA_TEMPLATE_REGISTRY" \
  "advanced-media templates are no longer checked against the billing-template registry"
require_text "$usage_rule_builder" "fractionDigits={fractionDigits}" \
  "advanced audio-duration price inputs no longer preserve six-decimal precision"
require_text "$adapter" "resolveVendorComparisonCandidate" \
  "vendor price comparison no longer scans and safely resolves all price blocks"
require_text "$addon_context" "scopeId?: string" \
  "the stable vendor-price field identity was lost from the platform addon seam"
require_text "$addon_context" "fieldKey: string" \
  "the pricing addon may be using React's reserved key prop again"
require_text "$addon_context" "render?.({ key: fieldKey" \
  "the pricing addon no longer forwards the real billing variable to the comparison renderer"
require_text "$tier_price_fields" "addonScopeId={props.scopeId}" \
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
require_text "$runtime_pricing_test" "does not let a stale visual rule path override the matching tier name" \
  "the stale-visual-path vendor-price safety regression test was lost"
require_text "$runtime_pricing_test" "resolves the vendor price beside every field loaded by vendor sync" \
  "the sync-to-field vendor-price regression test was lost"
require_text "$runtime_pricing_test" "treats a source URL note as metadata and falls back to structured prices" \
  "source URLs may be treated as billing expressions and hide synchronized vendor prices again"
require_text "$runtime_pricing_test" "normalizes legacy token prices into a baseline" \
  "the synchronized legacy-price comparison baseline regression test was lost"
require_text "$usage_rule_test" "matches the vendor tier by semantics after rules are reordered" \
  "the reordered advanced-rule vendor-price regression test was lost"
require_text "$template_registry_doc" "原厂价格比较的稳定性合同" \
  "the vendor-price comparison maintenance contract was lost"
require_text "$vendor_price_regression_doc" "原厂价格同步与比较回归记录" \
  "the detailed vendor-price synchronization regression record was lost"
require_text "$vendor_price_regression_doc" "结构路径和档位名称必须共同校验" \
  "the stable-path vendor-price safety rule was lost"
require_text "$vendor_price_regression_doc" "一键同步载入的每一个价格字段都能找到原厂价格" \
  "the sync-to-field vendor-price acceptance rule was lost"
require_text "$vendor_price_regression_doc" "React 保留属性" \
  "the reserved React key vendor-price regression is no longer documented"
for verification_entry in \
  "src/platform/model-prices/price-renderer.test.tsx" \
  "src/platform/public-pages/model-prices/index.test.ts" \
  "src/platform/admin-pages/model-prices/runtime-pricing-editor.test.ts" \
  "src/platform/admin-pages/model-prices/usage-rule-builder.test.ts" \
  "src/features/system-settings/models/__tests__/visual-billing-editor.test.tsx"
do
  require_text "$sync_upstream_script" "$verification_entry" \
    "upstream synchronization no longer runs the complete pricing regression suite"
  require_text "$compatibility_workflow" "$verification_entry" \
    "GitHub compatibility verification no longer runs the complete pricing regression suite"
done

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
for key in image outputImageCount seedreamPixelScene musicPerSong boolean volume video videoAudio seedanceVideoTokens threeDOutputTokens videoMode imageVideo audioSeconds ttsCharacters voiceCount taskMatrix threeDArtifact blank
do
  require_text "$usage_rule_builder" "$key" "a screenshot-derived visual billing template was lost during upstream synchronization"
done
require_text "$usage_rule_builder" "liveSessionSeconds" \
  "the GPT-Live session-duration pricing template was lost during upstream synchronization"
require_text "$template_registry" "liveSessionSeconds" \
  "the GPT-Live session-duration template registry entry was lost"
require_text "$template_registry_doc" '`liveSessionSeconds`' \
  "the GPT-Live session-duration billing contract is no longer documented"

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
require_text "$adapter" "vendorEditorDataForCurrentDraft" \
  "current visual templates can no longer synchronize structured vendor prices"
require_text "$runtime_pricing_test" "synchronizes structured audio-input/audio-output prices into the current expression template" \
  "the audio input/output vendor synchronization regression test was lost"
require_text "$runtime_pricing_test" "synchronizes structured audio-input/text-output prices into the current expression template" \
  "the audio input/text-output vendor synchronization regression test was lost"
require_text "$sheet" "renderPriceAddon" "the generic pricing-field extension slot was lost from the upstream editor"
require_text "$sheet" "PricingFieldAddonProvider" "the generic pricing-field provider was lost from the upstream editor"
require_text "$sheet" "loadPublicPricingCatalog" \
  "the administrator editor can no longer avoid the client pricing navigation gate"
require_text "$adapter" "loadPublicPricingCatalog={false}" \
  "opening the administrator price editor may request a disabled client pricing page again"
require_text "$addon_context" "createContext" "the isolated pricing-field extension context is missing"
require_text "$price_inputs" "<PricingFieldAddon" "legacy price fields no longer mount the generic extension slot"
require_text "$tier_price_fields" "<PricingFieldAddon" "visual expression fields no longer mount the generic extension slot"
require_text "$visual_billing_editor" "collectVisualTierScopeIds" \
  "specialized shared-input thinking templates lost stable vendor-price paths"
require_text "$visual_billing_editor" "<PricingFieldAddon" \
  "specialized shared-input thinking templates bypass the vendor-price addon"
require_text "$platform_visual_billing_editor" "<PricingFieldAddon" \
  "the specialized Omni template bypasses the vendor-price addon"
require_text "$platform_visual_billing_editor" "addonScopeId" \
  "the specialized Omni template lost stable vendor-price paths"
require_text "$visual_billing_test" "passes all Qwen3 Omni specialized price fields" \
  "the specialized-template vendor-price addon regression test was lost"
reject_text "$price_inputs" "key={props.addonKey}" \
  "a pricing addon call uses React's reserved key prop"
reject_text "$tier_price_fields" "key={addonKey}" \
  "a pricing addon call uses React's reserved key prop"
reject_text "$platform_visual_billing_editor" "key={addonKey}" \
  "the specialized Omni pricing addon uses React's reserved key prop"
reject_text "$visual_billing_editor" "<PricingFieldAddon key=" \
  "a specialized visual pricing addon uses React's reserved key prop"
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
require_text "$repo_root/core/new-api/pkg/billingexpr/compile.go" '"ai_cr"' "backend audio cached-input pricing compile binding was lost"
require_text "$repo_root/core/new-api/pkg/billingexpr/run.go" '"vid_o"' "backend video-output pricing binding was lost"
require_text "$repo_root/core/new-api/pkg/billingexpr/run.go" '"ai_cr"' "backend audio cached-input pricing runtime binding was lost"
require_text "$repo_root/core/new-api/service/tiered_settle.go" 'usedVars["aud_s"]' "audio-duration settlement mapping was lost"
require_text "$repo_root/core/new-api/service/tiered_settle.go" 'usedVars["ai_cr"]' "audio cached-input settlement mapping was lost"
require_text "$presets" 'ai_cr * 0.5' "the Realtime audio cached-input template field was lost"
require_text "$template_registry" "'ai_cr'" "the Realtime audio cached-input template contract was lost"
require_text "$template_registry_doc" '`ai/ai_cr/ao`' "the Realtime three-modality cache contract is no longer documented"
require_text "$repo_root/core/new-api/web/src/features/system-settings/models/tiered-pricing-editor.tsx" "'Platform multimodal'," \
  "the Platform multimodal preset group is no longer visible by default"
require_text "$repo_root/extensions/frontend/i18n/model-price-translations.ts" '"Platform multimodal": "平台多模态"' \
  "the visible Chinese entry for the Platform multimodal preset group was lost"
require_text "$renderer_test" "renders cached input prices for text image and audio Realtime modalities" \
  "the Realtime three-modality cached-input display regression test was lost"
require_text "$presets" 'ai * 3.5 + ao * 21' \
  "the audio-input/audio-output per-1M-token expression template was lost"
require_text "$presets" 'ai * 3.5 + c * 21' \
  "the audio-input/text-output per-1M-token expression template was lost"
require_text "$template_registry" "key: 'audio-input-audio-output-token-pricing'" \
  "the audio-input/audio-output template contract was lost"
require_text "$template_registry" "key: 'audio-input-text-output-token-pricing'" \
  "the audio-input/text-output template contract was lost"
require_text "$platform_visual_billing_editor" 'AUDIO_INPUT_AUDIO_OUTPUT_TOKEN_MARKER' \
  "the administrator-friendly audio-input/audio-output editor was lost"
require_text "$platform_visual_billing_editor" 'AUDIO_INPUT_TEXT_OUTPUT_TOKEN_MARKER' \
  "the administrator-friendly audio-input/text-output editor was lost"
require_text "$renderer_test" 'renders $key as one administrator-friendly input/output row' \
  "the audio token price display regression test was lost"
require_text "$tiered_settle_test" 'TestBuildTieredTokenParams_AudioInputAudioOutputTokenPricing' \
  "the real audio-input/audio-output settlement regression test was lost"
require_text "$tiered_settle_test" 'TestBuildTieredTokenParams_AudioInputTextOutputTokenPricing' \
  "the real audio-input/text-output settlement regression test was lost"
require_text "$tiered_billing_backend" '"live_session_seconds": {Type: "number", Unit: "second"}' \
  "the GPT-Live server-observed usage schema was lost"
require_text "$tiered_billing_backend" 'billingexpr.UsedUsageKeys(exprStr)["live_session_seconds"]' \
  "generic expression validation can reject GPT-Live session-duration pricing again"
require_text "$realtime_price_helper" 'requestInput.Usage["live_session_seconds"] = 60.0' \
  "GPT-Live session-duration balance reservation was lost"
require_text "$realtime_quota_service" 'time.Since(relayInfo.StartTime).Seconds()' \
  "GPT-Live final billing no longer measures the server-observed connection duration"
require_text "$realtime_quota_service" 'map[string]any{"live_session_seconds": liveSessionSeconds}' \
  "GPT-Live final settlement no longer receives the measured connection duration"
require_text "$realtime_pricing_controller_test" 'TestUpdateModelPricingConfigAcceptsRealtimeSessionDuration' \
  "the real GPT-Live model-pricing save regression test was lost"
require_text "$adapter" "renderPriceAddon={renderPriceAddon}" "the platform vendor comparison UI is no longer connected to the generic slot"
require_text "$model_table" "include_channel_models: true" "model management no longer includes channel models"
require_text "$platform_backend" "model.GetModelConnections()" "platform price management no longer includes enabled channel abilities"
require_text "$adapter" "saveModelPricing([" "platform actual-price edits no longer use the upstream runtime-pricing API"
require_text "$adapter" "getModelPricing([modelKey])" "platform actual-price edits no longer read back runtime pricing after save"
require_text "$model_pricing_api" "api.patch('/api/option/model_pricing'" "the upstream runtime-pricing save endpoint changed"
require_text "$model_table" "useModelPricing(" "model management no longer reads the shared runtime-pricing configuration"
require_text "$platform_backend" "model.GetPricing()" "platform display prices are no longer refreshed from runtime pricing"
require_text "$platform_backend" "visibleInModelSquare" "public model prices no longer use the model-square visibility set"
require_text "$platform_backend" "storedVendors" "manual vendor selections must survive model synchronization"
require_text "$platform_backend" '"display_name", "tags"' "public model metadata fields must refresh without overwriting the saved vendor"

echo "Core pricing compatibility: ok"
