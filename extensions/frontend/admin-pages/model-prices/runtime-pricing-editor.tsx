import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getModelPricing,
  previewModelPricingConversion,
  saveModelPricing,
  type ModelPricingEntry,
} from "@/features/model-pricing/api";
import { pricingFromDraft, pricingRow } from "@/features/model-pricing/pricing";
import {
  combineBillingExpr,
  splitBillingExprAndRequestRules,
} from "@/features/pricing/lib/billing-expr";
import {
  parseVisualBillingDocument,
  serializeVisualBillingDocument,
  type VisualPricingNode,
} from "@/features/pricing/lib/billing-expression/visual";
import type { ModelRatioData } from "@/features/system-settings/models/model-pricing-core";
import { usePricingPreferencesStore } from "@/stores/pricing-preferences-store";
import { useSystemConfigStore } from "@/stores/system-config-store";
import { formatBillingCurrencyFromUSD } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  ModelPricingEditorPanel,
  type ModelPricingEditorPanelHandle,
} from "@/features/system-settings/models/model-pricing-sheet";
import type { PriceSpec, UsageRuleSet } from "../../model-prices/types";
import {
  UsageRuleBuilder,
  usageRuleSetExpression,
  validateUsageRuleSet,
} from "./usage-rule-builder";

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
    cache: block.cache ?? ratioPrice("cache_ratio"),
    createCache: block.createCache ?? ratioPrice("create_cache_ratio"),
    image: block.image ?? ratioPrice("image_ratio"),
    audioInput: block.audioInput ?? audioInput,
    audioOutput:
      block.audioOutput ?? (audioInput == null || audioOutputRatio == null
        ? undefined
        : audioInput * audioOutputRatio),
  };
}

function editorData(
  entry: ModelPricingEntry,
  savedDiscount = 0,
  currentPriceSpec?: PriceSpec,
): ModelRatioData {
  const values = { ...entry.configured };
  if (entry.effective["billing_setting.billing_mode"] === "tiered_expr") {
    values["billing_setting.billing_mode"] = "tiered_expr";
    values["billing_setting.billing_expr"] =
      entry.effective["billing_setting.billing_expr"];
  }
  const data = pricingRow(entry.model_name, values);
  const savedBaseExpression = currentPriceSpec?.blocks?.[0]?.baseExpression;
  if (data.billingMode === "tiered_expr" && savedBaseExpression) {
    const expression = splitBillingExprAndRequestRules(savedBaseExpression);
    data.billingExpr = expression.billingExpr;
    data.requestRuleExpr = expression.requestRuleExpr;
  }
  const factor = 1 - savedDiscount / 100;
  if (savedDiscount !== 0 && factor > 0) {
    if (data.billingMode === "per-request" && data.price) {
      data.price = String(Number(data.price) / factor);
    } else if (data.billingMode === "per-token" && data.ratio) {
      data.ratio = String(Number(data.ratio) / factor);
    }
  }
  return data;
}

function vendorEditorData(modelKey: string, spec?: PriceSpec): ModelRatioData | null {
  if (spec?.mode === "expression" && spec.blocks?.[0]?.note) {
    const expression = splitBillingExprAndRequestRules(spec.blocks[0].note);
    return {
      name: modelKey,
      billingMode: "tiered_expr",
      billingExpr: expression.billingExpr,
      requestRuleExpr: expression.requestRuleExpr,
    };
  }
  const price = vendorComparison(spec);
  if (price.request != null) {
    return { name: modelKey, billingMode: "per-request", price: String(price.request) };
  }
  if (price.input == null || price.input <= 0) return null;
  const ratio = (value: number | undefined, base: number) =>
    value == null ? undefined : String(value / base);
  return {
    name: modelKey,
    billingMode: "per-token",
    ratio: String(price.input / 2),
    completionRatio: ratio(price.completion, price.input),
    cacheRatio: ratio(price.cache, price.input),
    createCacheRatio: ratio(price.createCache, price.input),
    imageRatio: ratio(price.image, price.input),
    audioRatio: ratio(price.audioInput, price.input),
    audioCompletionRatio:
      price.audioInput && price.audioOutput != null
        ? String(price.audioOutput / price.audioInput)
        : undefined,
  };
}

function hasConfiguredPrice(entry: ModelPricingEntry) {
  return Object.keys(entry.configured).some((key) =>
    ["ModelPrice", "ModelRatio", "billing_setting.billing_expr"].includes(key),
  );
}

export function applyPricingDiscount(data: ModelRatioData, discount: number): ModelRatioData {
  const factor = 1 - discount / 100;
  const scaled = (value?: string) =>
    value === undefined || value === "" ? value : String(Number(value) * factor);
  if (data.billingMode === "tiered_expr") {
    if (discount === 0) return data;
    const document = parseVisualBillingDocument(
      data.billingExpr || 'tier("base", p * 0 + c * 0)',
    );
    if (document) {
      const scaleNode = (node: VisualPricingNode): VisualPricingNode => {
        if (node.kind === "branch") {
          return { ...node, yes: scaleNode(node.yes), no: scaleNode(node.no) };
        }
        return {
          ...node,
          fixedPrice: node.fixedPrice === "" ? "" : String(Number(node.fixedPrice) * factor),
          prices: node.prices.map((price) => ({
            ...price,
            value: String(Number(price.value) * factor),
          })),
        };
      };
      const serialized = serializeVisualBillingDocument({
        ...document,
        root: scaleNode(document.root),
      });
      if (serialized.ok) return { ...data, billingExpr: serialized.source };
    }
    return { ...data, billingExpr: `(${data.billingExpr || "p * 0 + c * 0"}) * ${factor}` };
  }
  return data.billingMode === "per-request"
    ? { ...data, price: scaled(data.price) }
    : { ...data, ratio: scaled(data.ratio) };
}

function displaySpec(
  data: ModelRatioData,
  discount?: number,
  baseData?: ModelRatioData,
  usageRuleSet?: UsageRuleSet,
): PriceSpec {
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
          baseExpression: baseData
            ? combineBillingExpr(
                baseData.billingExpr || "",
                baseData.requestRuleExpr || "",
              )
            : undefined,
          discount,
          usageRuleSet,
        },
      ],
    };
  if (data.price)
    return {
      mode: "request",
      blocks: [{ price: Number(data.price), unit: "request", discount }],
    };
  const base = Number(data.ratio || 0) * 2;
  const scaled = (value?: string) =>
    value === undefined || value === "" ? null : base * Number(value);
  const audioInput = scaled(data.audioRatio);
  return {
    mode: "token",
    blocks: [
        {
          input: base,
          output: data.completionRatio
          ? base * Number(data.completionRatio)
          : null,
          cache: scaled(data.cacheRatio),
          createCache: scaled(data.createCacheRatio),
          image: scaled(data.imageRatio),
          audioInput,
          audioOutput:
            audioInput == null || !data.audioCompletionRatio
              ? null
              : audioInput * Number(data.audioCompletionRatio),
          unit: "1M tokens",
          discount,
      },
    ],
  };
}

export type RuntimePricingEditorHandle = {
  save: () => Promise<void>;
};

export const RuntimePricingEditor = forwardRef<RuntimePricingEditorHandle, {
  modelKey: string;
  vendorPriceSpec?: PriceSpec;
  currentPriceSpec?: PriceSpec;
  onSaved: (spec: PriceSpec) => Promise<void> | void;
}>(function RuntimePricingEditor({
  modelKey,
  vendorPriceSpec,
  currentPriceSpec,
  onSaved,
}, forwardedRef) {
  const { t } = useTranslation();
  const ref = useRef<ModelPricingEditorPanelHandle>(null);
  const [entry, setEntry] = useState<ModelPricingEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [editorOverride, setEditorOverride] = useState<ModelRatioData | null>(null);
  const pricingCurrency = usePricingPreferencesStore((state) => state.currency);
  const setPricingCurrency = usePricingPreferencesStore((state) => state.setCurrency);
  const currencyConfig = useSystemConfigStore((state) => state.config.currency);
  const exchangeRate = pricingCurrency === "site" && currencyConfig.usdExchangeRate > 0
    ? currencyConfig.usdExchangeRate
    : 1;
  const currencySymbol = pricingCurrency === "site" ? "¥" : "$";
  const [usageRuleSet, setUsageRuleSet] = useState<UsageRuleSet | undefined>(
    currentPriceSpec?.blocks?.[0]?.usageRuleSet,
  );
  const [advancedPricingActive, setAdvancedPricingActive] = useState(
    Boolean(currentPriceSpec?.blocks?.[0]?.usageRuleSet),
  );
  const legacyComparison = vendorComparison(vendorPriceSpec);
  const vendorExpressionDocument = vendorPriceSpec?.mode === "expression"
    ? parseVisualBillingDocument(
        splitBillingExprAndRequestRules(vendorPriceSpec.blocks?.[0]?.note || "").billingExpr,
      )
    : null;
  const findVendorTier = (node: VisualPricingNode | undefined, label?: string): Extract<VisualPricingNode, { kind: "tier" }> | undefined => {
    if (!node) return undefined;
    if (node.kind === "tier") return !label || node.label === label ? node : undefined;
    return findVendorTier(node.yes, label) || findVendorTier(node.no, label);
  };
  const comparisonValue = (key: string, scope?: string) => {
    const legacyKey = ({
      input: "input",
      completion: "completion",
      cache: "cache",
      createCache: "createCache",
      image: "image",
      audioInput: "audioInput",
      audioOutput: "audioOutput",
      request: "request",
    } as Record<string, keyof PriceComparison>)[key];
    if (legacyKey) return legacyComparison[legacyKey];
    const tier = findVendorTier(vendorExpressionDocument?.root, scope);
    if (!tier) return undefined;
    if (key === "fixed") return tier.billingUnit === "request" ? Number(tier.fixedPrice) : undefined;
    const price = tier.prices.find((item) => item.variable === key);
    return price ? Number(price.value) : undefined;
  };
  const renderPriceAddon = ({ key, scope, value }: { key: string; scope?: string; value: string }) => {
    const vendorPrice = comparisonValue(key, scope);
    if (vendorPrice == null || !Number.isFinite(vendorPrice)) {
      return <div className="shrink-0 text-xs text-muted-foreground">{t("Vendor price is not set")}</div>;
    }
    const entered = Number(value);
    const difference = Number.isFinite(entered)
      ? entered * (1 - discount / 100) - vendorPrice
      : undefined;
    return (
      <div className="shrink-0 text-xs text-muted-foreground">
        {t("Vendor price")}: {formatBillingCurrencyFromUSD(vendorPrice)}
        {difference != null && (
          <span className={cn("ml-2 font-medium", difference > 0 ? "text-rose-500" : difference < 0 ? "text-emerald-500" : "text-muted-foreground")}>
            {t("Difference")}: {difference > 0 ? "+" : ""}{formatBillingCurrencyFromUSD(difference)}
          </span>
        )}
      </div>
    );
  };
  useEffect(() => {
    setEntry(null);
    setEditorOverride(null);
    setUsageRuleSet(currentPriceSpec?.blocks?.[0]?.usageRuleSet);
    setAdvancedPricingActive(Boolean(currentPriceSpec?.blocks?.[0]?.usageRuleSet));
    setDiscount(currentPriceSpec?.blocks?.[0]?.discount ?? 0);
    if (modelKey)
      void getModelPricing([modelKey])
        .then(async (data) => {
          const nextEntry = data.entries.find((item) => item.model_name === modelKey) || null;
          setEntry(nextEntry);
          if (!nextEntry || nextEntry.effective["billing_setting.billing_mode"] === "tiered_expr" || !hasConfiguredPrice(nextEntry)) return;
          // The platform catalogue stores the pre-discount display price while
          // new-api stores the discounted runtime price. Undo the saved
          // discount before conversion so Save applies it exactly once.
          const legacyDraft = editorData(
            nextEntry,
            currentPriceSpec?.blocks?.[0]?.discount ?? 0,
            currentPriceSpec,
          );
          const result = await previewModelPricingConversion({
            model_name: modelKey,
            pricing: pricingFromDraft(legacyDraft),
          });
          if (result.expression) {
            const expression = splitBillingExprAndRequestRules(result.expression);
            setEditorOverride({
              name: modelKey,
              billingMode: "tiered_expr",
              billingExpr: expression.billingExpr,
              requestRuleExpr: expression.requestRuleExpr,
            });
          } else if (result.unsupported_reason) {
            toast.warning(t(result.unsupported_reason));
          }
        })
        .catch((error) => toast.error(error.message));
  }, [modelKey, currentPriceSpec?.blocks?.[0]?.discount, t]);
  const save = async () => {
    if (!entry) return;
    if (advancedPricingActive) {
      const validationError = validateUsageRuleSet(usageRuleSet);
      if (validationError) {
        toast.error(t(validationError));
        return;
      }
    }
    const draft = await ref.current?.commitDraft();
    if (!draft) return;
    draft.name = modelKey;
    const activeRuleSet = usageRuleSet && draft.billingMode === "tiered_expr" &&
      draft.billingExpr?.trim() === usageRuleSetExpression(usageRuleSet).trim()
      ? usageRuleSet
      : undefined;
    const billedDraft = applyPricingDiscount(draft, discount);
    setSaving(true);
    try {
      await saveModelPricing([
        {
          model_name: modelKey,
          expected_version: entry.version,
          pricing: pricingFromDraft(billedDraft),
        },
      ]);
      const refreshed = await getModelPricing([modelKey]);
      setEntry(refreshed.entries[0] || null);
      await onSaved(displaySpec(billedDraft, discount || undefined, draft, activeRuleSet));
      toast.success(t("Runtime pricing saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Save failed"));
    } finally {
      setSaving(false);
    }
  };
  const syncVendorPrice = async () => {
    const current = await ref.current?.commitDraft();
    if (!current) return;
    const vendorRuleSet = vendorPriceSpec?.blocks?.[0]?.usageRuleSet;
    const vendor = vendorEditorData(modelKey, vendorPriceSpec);
    if (!vendor) {
      toast.error(t("No vendor price is available for the selected pricing mode"));
      return;
    }
    if (vendorRuleSet?.rules?.length) {
      const expression = usageRuleSetExpression(vendorRuleSet);
      setPricingCurrency(vendorPriceSpec?.pricingCurrency || pricingCurrency);
      setUsageRuleSet(vendorRuleSet);
      setAdvancedPricingActive(true);
      setEditorOverride({
        name: modelKey,
        billingMode: "tiered_expr",
        billingExpr: expression,
        requestRuleExpr: "",
      });
      toast.success(t("Vendor pricing template and prices synchronized"));
      return;
    }
    if (vendor.billingMode !== current.billingMode) {
      toast.error(t("No vendor price is available for the selected pricing mode"));
      return;
    }
    setPricingCurrency(vendorPriceSpec?.pricingCurrency || pricingCurrency);
    setUsageRuleSet(vendorPriceSpec?.blocks?.[0]?.usageRuleSet);
    setAdvancedPricingActive(Boolean(vendorPriceSpec?.blocks?.[0]?.usageRuleSet));
    setEditorOverride(vendor);
    toast.success(t("Vendor price synchronized"));
  };
  useImperativeHandle(forwardedRef, () => ({ save }));
  if (!entry)
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t("Loading...")}
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm text-muted-foreground">
        {t("The Save button above immediately writes the selected pricing mode to actual billing.")}
      </div>
      <label className="block max-w-sm space-y-1 text-sm">
        <span className="font-medium">{t("Discount percentage")}</span>
        <Input
          type="number"
          min={-1000}
          max={99.99}
          step="any"
          value={discount || ""}
          placeholder="0"
          onChange={(event) => {
            const value = Number(event.target.value);
            setDiscount(Number.isFinite(value) ? Math.min(99.99, Math.max(-1000, value)) : 0);
          }}
        />
        <span className="block text-xs text-muted-foreground">
          {t("Enter 10 for 10% off; enter -5 to add 5%. The adjusted price is saved as the actual billing price.")}
        </span>
      </label>
      <div className="min-w-0 rounded-lg border">
        <ModelPricingEditorPanel
          className="!overflow-visible [&_[role=region]]:!overflow-visible [&_[role=region]]:!overscroll-auto [&_aside]:!static"
          ref={ref}
          editData={
            editorOverride || (hasConfiguredPrice(entry)
              ? editorData(
                  entry,
                  currentPriceSpec?.blocks?.[0]?.discount ?? 0,
                  currentPriceSpec,
                )
              : editorData(entry))
          }
          scrollHeader={
            <Button
              type="button"
              variant="outline"
              onClick={() => void syncVendorPrice()}
            >
              <RefreshCcw className="mr-2 size-4" />
              {t("Sync vendor price")}
            </Button>
          }
          additionalPricingActive={advancedPricingActive}
          onAdditionalPricingActiveChange={setAdvancedPricingActive}
          additionalPricingTab={{
            label: t("Advanced media pricing rules"),
            content: (
                <UsageRuleBuilder
                  value={usageRuleSet}
                  comparisonValue={vendorPriceSpec?.blocks?.[0]?.usageRuleSet}
                  priceMultiplier={1 - discount / 100}
                  usageSchema={entry.usage_schema}
                  exchangeRate={exchangeRate}
                  currencySymbol={currencySymbol}
                  onApply={(nextRuleSet, expression) => {
                    setUsageRuleSet(nextRuleSet);
                    setEditorOverride({
                      name: modelKey,
                      billingMode: "tiered_expr",
                      billingExpr: expression,
                      requestRuleExpr: "",
                    });
                  }}
                />
            ),
          }}
          renderPriceAddon={renderPriceAddon}
          usageSchema={entry.usage_schema}
          isSaving={saving}
        />
      </div>
    </div>
  );
});
