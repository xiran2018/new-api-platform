import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { combineBillingExpr } from "@/features/pricing/lib/billing-expr";
import {
  getSystemOptions,
  updateSystemOption,
} from "@/features/system-settings/api";
import {
  ModelPricingEditorPanel,
  type ModelPricingEditorPanelHandle,
  type ModelRatioData,
} from "@/features/system-settings/models/model-pricing-sheet";
import type { PriceSpec } from "../../model-prices/types";

const fields = [
  "ModelPrice",
  "ModelRatio",
  "CacheRatio",
  "CreateCacheRatio",
  "CompletionRatio",
  "ImageRatio",
  "AudioRatio",
  "AudioCompletionRatio",
  "billing_setting.billing_mode",
  "billing_setting.billing_expr",
] as const;
type Field = (typeof fields)[number];
type Maps = Record<Field, Record<string, number | string>>;
const parse = (raw?: string) => {
  try {
    return JSON.parse(raw || "{}") as Record<string, number | string>;
  } catch {
    return {};
  }
};
const editData = (name: string, m: Maps): ModelRatioData => ({
  name,
  price: String(m.ModelPrice[name] ?? ""),
  ratio: String(m.ModelRatio[name] ?? ""),
  cacheRatio: String(m.CacheRatio[name] ?? ""),
  createCacheRatio: String(m.CreateCacheRatio[name] ?? ""),
  completionRatio: String(m.CompletionRatio[name] ?? ""),
  imageRatio: String(m.ImageRatio[name] ?? ""),
  audioRatio: String(m.AudioRatio[name] ?? ""),
  audioCompletionRatio: String(m.AudioCompletionRatio[name] ?? ""),
  billingMode:
    (m["billing_setting.billing_mode"][
      name
    ] as ModelRatioData["billingMode"]) || "per-token",
  billingExpr: String(m["billing_setting.billing_expr"][name] ?? ""),
});
function displaySpec(d: ModelRatioData): PriceSpec {
  if (d.billingMode === "tiered_expr")
    return {
      mode: "expression",
      blocks: [
        {
          label: "Expression",
          note: combineBillingExpr(
            d.billingExpr || "",
            d.requestRuleExpr || "",
          ),
        },
      ],
    };
  if (d.price)
    return {
      mode: "request",
      blocks: [{ price: Number(d.price), unit: "request" }],
    };
  const base = Number(d.ratio || 0) * 2;
  return {
    mode: "token",
    blocks: [
      {
        input: base,
        output: d.completionRatio ? base * Number(d.completionRatio) : null,
        unit: "1M tokens",
      },
    ],
  };
}

export function RuntimePricingEditor({
  modelKey,
  onSaved,
}: {
  modelKey: string;
  onSaved: (spec: PriceSpec) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const ref = useRef<ModelPricingEditorPanelHandle>(null);
  const [maps, setMaps] = useState<Maps | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void getSystemOptions().then((r) => {
      const options = Object.fromEntries(
        (r.data || []).map((x) => [x.key, x.value]),
      );
      setMaps(
        Object.fromEntries(fields.map((k) => [k, parse(options[k])])) as Maps,
      );
    });
  }, [modelKey]);
  if (!maps)
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
      const next = structuredClone(maps);
      for (const k of fields) delete next[k][modelKey];
      const put = (k: Field, v?: string) => {
        if (v !== "" && v != null && Number.isFinite(Number(v)))
          next[k][modelKey] = Number(v);
      };
      if (draft.billingMode === "tiered_expr") {
        next["billing_setting.billing_mode"][modelKey] = "tiered_expr";
        next["billing_setting.billing_expr"][modelKey] = combineBillingExpr(
          draft.billingExpr || "",
          draft.requestRuleExpr || "",
        );
        put("ModelPrice", draft.price);
        put("ModelRatio", draft.ratio);
        put("CacheRatio", draft.cacheRatio);
        put("CreateCacheRatio", draft.createCacheRatio);
        put("CompletionRatio", draft.completionRatio);
        put("ImageRatio", draft.imageRatio);
        put("AudioRatio", draft.audioRatio);
        put("AudioCompletionRatio", draft.audioCompletionRatio);
      } else if (draft.price) put("ModelPrice", draft.price);
      else {
        put("ModelRatio", draft.ratio);
        put("CacheRatio", draft.cacheRatio);
        put("CreateCacheRatio", draft.createCacheRatio);
        put("CompletionRatio", draft.completionRatio);
        put("ImageRatio", draft.imageRatio);
        put("AudioRatio", draft.audioRatio);
        put("AudioCompletionRatio", draft.audioCompletionRatio);
      }
      for (const k of fields)
        await updateSystemOption({ key: k, value: JSON.stringify(next[k]) });
      setMaps(next);
      await onSaved(displaySpec(draft));
      toast.success(t("Runtime pricing saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Save failed"));
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
          editData={editData(modelKey, maps)}
          isSaving={saving}
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
