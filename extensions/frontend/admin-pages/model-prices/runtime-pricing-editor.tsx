import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getModelPricing,
  saveModelPricing,
  type ModelPricingEntry,
} from "@/features/model-pricing/api";
import { pricingFromDraft, pricingRow } from "@/features/model-pricing/pricing";
import { combineBillingExpr } from "@/features/pricing/lib/billing-expr";
import type { ModelRatioData } from "@/features/system-settings/models/model-pricing-core";
import {
  ModelPricingEditorPanel,
  type ModelPricingEditorPanelHandle,
} from "@/features/system-settings/models/model-pricing-sheet";
import type { PriceSpec } from "../../model-prices/types";

type PriceComparison = Partial<
  Record<
    | "input"
    | "completion"
    | "cache"
    | "createCache"
    | "image"
    | "audioInput"
    | "audioOutput"
    | "request",
    number
  >
>;

function vendorComparison(spec?: PriceSpec): PriceComparison {
  const block = spec?.blocks?.find(
    (item) =>
      item.input != null || item.price != null || item.table?.rows?.length,
  );
  if (!block) return {};
  const fields = Object.fromEntries(block.table?.rows || []);
  const numeric = (key: string) => {
    const value = Number(fields[key]);
    return Number.isFinite(value) ? value : undefined;
  };
  const request = block.price ?? numeric("model_price");
  if (request != null) return { request };
  const input = block.input ?? ((numeric("model_ratio") ?? 0) * 2 || undefined);
  if (input == null) return {};
  const ratioPrice = (key: string) => {
    const ratio = numeric(key);
    return ratio == null ? undefined : input * ratio;
  };
  const audioInput = ratioPrice("audio_ratio");
  const audioOutputRatio = numeric("audio_completion_ratio");
  return {
    input,
    completion: block.output ?? ratioPrice("completion_ratio"),
    cache: ratioPrice("cache_ratio"),
    createCache: ratioPrice("create_cache_ratio"),
    image: ratioPrice("image_ratio"),
    audioInput,
    audioOutput:
      audioInput == null || audioOutputRatio == null
        ? undefined
        : audioInput * audioOutputRatio,
  };
}

function editorData(entry: ModelPricingEntry): ModelRatioData {
  const values = { ...entry.configured };
  if (entry.effective["billing_setting.billing_mode"] === "tiered_expr") {
    values["billing_setting.billing_mode"] = "tiered_expr";
    values["billing_setting.billing_expr"] =
      entry.effective["billing_setting.billing_expr"];
  }
  return pricingRow(entry.model_name, values);
}

function displaySpec(data: ModelRatioData): PriceSpec {
  if (data.billingMode === "tiered_expr")
    return {
      mode: "expression",
      blocks: [
        {
          label: "Expression",
          note: combineBillingExpr(
            data.billingExpr || "",
            data.requestRuleExpr || "",
          ),
        },
      ],
    };
  if (data.price)
    return {
      mode: "request",
      blocks: [{ price: Number(data.price), unit: "request" }],
    };
  const base = Number(data.ratio || 0) * 2;
  return {
    mode: "token",
    blocks: [
      {
        input: base,
        output: data.completionRatio
          ? base * Number(data.completionRatio)
          : null,
        unit: "1M tokens",
      },
    ],
  };
}

export function RuntimePricingEditor({
  modelKey,
  vendorPriceSpec,
  onSaved,
}: {
  modelKey: string;
  vendorPriceSpec?: PriceSpec;
  onSaved: (spec: PriceSpec) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const ref = useRef<ModelPricingEditorPanelHandle>(null);
  const [entry, setEntry] = useState<ModelPricingEntry | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setEntry(null);
    if (modelKey)
      void getModelPricing([modelKey])
        .then((data) =>
          setEntry(
            data.entries.find((item) => item.model_name === modelKey) || null,
          ),
        )
        .catch((error) => toast.error(error.message));
  }, [modelKey]);
  if (!entry)
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t("Loading...")}
      </div>
    );
  const save = async () => {
    const draft = await ref.current?.commitDraft();
    if (!draft) return;
    draft.name = modelKey;
    setSaving(true);
    try {
      await saveModelPricing([
        {
          model_name: modelKey,
          expected_version: entry.version,
          pricing: pricingFromDraft(draft),
        },
      ]);
      const refreshed = await getModelPricing([modelKey]);
      setEntry(refreshed.entries[0] || null);
      await onSaved(displaySpec(draft));
      toast.success(t("Runtime pricing saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Save failed"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        {t("Saving here immediately changes actual billing for this model.")}
      </div>
      <div className="h-[620px] overflow-auto rounded-lg border">
        <ModelPricingEditorPanel
          ref={ref}
          editData={editorData(entry)}
          usageSchema={entry.usage_schema}
          isSaving={saving}
          priceComparison={vendorComparison(vendorPriceSpec)}
        />
      </div>
      <div className="flex justify-end">
        <Button disabled={saving || !modelKey} onClick={save}>
          {t("Save runtime pricing")}
        </Button>
      </div>
    </div>
  );
}
