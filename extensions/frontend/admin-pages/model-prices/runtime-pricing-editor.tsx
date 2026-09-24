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
import { compileBillingExpression } from "@/features/pricing/lib/billing-expression/parser";
import type { ExpressionNode } from "@/features/pricing/lib/billing-expression/types";
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
import type {
  PriceBlock,
  PriceSpec,
  UsageRuleSet,
} from "../../model-prices/types";
import {
  matchingUsageRuleSet,
  usageRuleSetExpression,
} from "../../model-prices/usage-rule-expression";
import {
  AUDIO_DURATION_PRICE_FRACTION_DIGITS,
  isAudioDurationPriceField,
} from "../../model-prices/price-precision";
import {
  createUsageRuleTemplate,
  UsageRuleBuilder,
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

type ComparisonDisplayField = Extract<
  keyof PriceBlock,
  | "input"
  | "output"
  | "cache"
  | "createCache"
  | "createCache1h"
  | "image"
  | "imageOutput"
  | "audioInput"
  | "audioOutput"
  | "audioDuration"
  | "videoInput"
  | "videoOutput"
  | "price"
>;

const COMPARISON_FIELD_BY_VARIABLE: Record<string, ComparisonDisplayField> = {
  p: "input",
  c: "output",
  cr: "cache",
  cc: "createCache",
  cc1h: "createCache1h",
  img: "image",
  img_o: "imageOutput",
  ai: "audioInput",
  ao: "audioOutput",
  aud_s: "audioDuration",
  vid: "videoInput",
  vid_o: "videoOutput",
  fixed: "price",
};

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

function priceSpecExpressionSource(spec?: PriceSpec): string {
  return (spec?.blocks || [])
    .map((block) => block.baseExpression || block.note || "")
    .filter(Boolean)
    .join("\n");
}

type VendorComparisonCandidate = {
  value: number;
  scope?: string;
  scopeId?: string;
};

function normalizedComparisonScope(scope?: string) {
  const normalized = scope?.trim().replace(/\s+/g, " ");
  return normalized || undefined;
}

function addVendorComparisonCandidate(
  candidates: VendorComparisonCandidate[],
  value: unknown,
  scope?: string,
  scopeId?: string,
) {
  if (value == null || value === "") return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  candidates.push({
    value: numeric,
    scope: normalizedComparisonScope(scope),
    scopeId,
  });
}

function collectTierComparisonCandidates(
  node: Extract<VisualPricingNode, { kind: "tier" }>,
  key: string,
  candidates: VendorComparisonCandidate[],
  scopeId: string,
) {
  if (key === "fixed" && node.billingUnit === "request") {
    addVendorComparisonCandidate(candidates, node.fixedPrice, node.label, scopeId);
  }
  for (const price of [...(node.sharedPrices || []), ...node.prices]) {
    if (price.variable === key) {
      addVendorComparisonCandidate(candidates, price.value, node.label, scopeId);
    }
  }
}

function collectVisualComparisonCandidates(
  node: VisualPricingNode,
  key: string,
  candidates: VendorComparisonCandidate[],
  prefix = "",
) {
  // Mirror VisualBillingDocumentEditor's numbered rule layout. Unlike parser
  // source offsets and editable tier labels, this path remains stable when a
  // user changes a price or renames a tier and later reopens the editor.
  const rules: VisualPricingNode[] = [];
  let current = node;
  while (current.kind === "branch") {
    rules.push(current);
    current = current.no;
  }
  rules.push(current);
  rules.forEach((rule, index) => {
    const scopeId = `${prefix}${index + 1}`;
    const tier = rule.kind === "tier" ? rule : rule.yes;
    if (tier.kind === "tier") {
      collectTierComparisonCandidates(tier, key, candidates, scopeId);
    } else {
      collectVisualComparisonCandidates(tier, key, candidates, `${scopeId}.`);
    }
  });
}

function uniqueCandidateValue(candidates: VendorComparisonCandidate[]) {
  const values = [...new Set(candidates.map(({ value }) => value))];
  return values.length === 1 ? values[0] : undefined;
}

function resolveVendorComparisonCandidate(
  candidates: VendorComparisonCandidate[],
  scope?: string,
  scopeId?: string,
) {
  if (scopeId) {
    const structural = candidates.filter((candidate) => candidate.scopeId === scopeId);
    if (structural.length) return uniqueCandidateValue(structural);
  }
  const normalizedScope = normalizedComparisonScope(scope);
  if (normalizedScope) {
    const exact = candidates.filter((candidate) => candidate.scope === normalizedScope);
    if (exact.length) return uniqueCandidateValue(exact);
  }
  // A renamed tier is still safe to compare when this variable has exactly one
  // vendor price. Never guess when several distinct prices are available.
  return uniqueCandidateValue(candidates);
}

/**
 * Resolve a vendor comparison price for both storage shapes:
 * normalized display blocks (input/output/cache/...) and visual expression
 * variables (p/c/cc/...). The latter is what ModelPricingEditorPanel passes
 * to renderPriceAddon for every expression-based template.
 */
export function vendorComparisonValue(
  spec: PriceSpec | undefined,
  key: string,
  scope?: string,
  scopeId?: string,
): number | undefined {
  const candidates: VendorComparisonCandidate[] = [];
  const displayField = COMPARISON_FIELD_BY_VARIABLE[key];
  const legacyKey = ({
    p: "input",
    input: "input",
    c: "completion",
    completion: "completion",
    cr: "cache",
    cache: "cache",
    cc: "createCache",
    createCache: "createCache",
    img: "image",
    image: "image",
    ai: "audioInput",
    audioInput: "audioInput",
    ao: "audioOutput",
    audioOutput: "audioOutput",
    fixed: "request",
    request: "request",
  } as Record<string, keyof PriceComparison>)[key];

  for (const block of spec?.blocks || []) {
    const expressionSource = block.baseExpression || block.note || "";
    if (expressionSource) {
      // Parse blocks independently. Concatenating multiple complete expressions
      // produces invalid syntax and previously hid otherwise valid vendor prices.
      const expression = splitBillingExprAndRequestRules(expressionSource).billingExpr;
      const document = parseVisualBillingDocument(expression);
      if (document) {
        for (const price of document.shared?.prices || []) {
          if (price.variable === key) {
            addVendorComparisonCandidate(candidates, price.value, block.label, "shared");
          }
        }
        collectVisualComparisonCandidates(document.root, key, candidates);
      }
      // baseExpression is authoritative for expression blocks; normalized legacy
      // fields in the same block may be stale remnants from an older template.
      continue;
    }
    if (displayField) {
      addVendorComparisonCandidate(candidates, block[displayField], block.label);
    }
    if (legacyKey) {
      const legacy = vendorComparison({ ...spec, blocks: [block] });
      addVendorComparisonCandidate(candidates, legacy[legacyKey], block.label);
    }
  }

  return resolveVendorComparisonCandidate(candidates, scope, scopeId);
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

export function vendorEditorData(modelKey: string, spec?: PriceSpec): ModelRatioData | null {
  const expressionSource = priceSpecExpressionSource(spec);
  if (expressionSource) {
    const expression = splitBillingExprAndRequestRules(expressionSource);
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

const BILLING_PRICE_VARIABLES = new Set([
  "p",
  "c",
  "cr",
  "cc",
  "cc1h",
  "img",
  "img_cr",
  "img_o",
  "ai",
  "ao",
  "vid",
  "vid_o",
  "aud_s",
]);

function expressionChildren(node: ExpressionNode): ExpressionNode[] {
  switch (node.kind) {
    case "call":
      return node.args;
    case "unary":
      return [node.operand];
    case "binary":
      return [node.left, node.right];
    case "conditional":
      return [node.condition, node.yes, node.no];
    default:
      return [];
  }
}

function isUsagePriceMeter(node: ExpressionNode): boolean {
  return (
    (node.kind === "variable" && BILLING_PRICE_VARIABLES.has(node.name)) ||
    (node.kind === "call" && node.name === "u" && node.args.length === 1)
  );
}

function scaledLiteral(value: number, factor: number): string {
  return String(Number((value * factor).toPrecision(15)));
}

/**
 * Scale price literals without changing the billing-expression structure.
 *
 * Fixed pricing has a deliberately strict grammar: `tier(name, fixed(price))`
 * may be multiplied by a request quantity such as `image_count`, but the
 * complete expression cannot be wrapped in another numeric multiplier. Only
 * the literal prices are therefore patched; tier bounds, request conditions
 * and quantity multipliers remain untouched.
 */
function scaleBillingExpressionPrices(source: string, factor: number): string | null {
  const compiled = compileBillingExpression(source);
  if (compiled.status !== "ready") return null;

  const patches = new Map<number, { start: number; end: number; text: string }>();
  const addNumericLiteral = (node: ExpressionNode) => {
    if (node.kind !== "literal" || typeof node.value !== "number") return;
    patches.set(node.start, {
      start: node.start,
      end: node.end,
      text: scaledLiteral(node.value, factor),
    });
  };

  const visit = (node: ExpressionNode) => {
    if (node.kind === "call" && node.name === "fixed" && node.args.length === 1) {
      addNumericLiteral(node.args[0]);
    } else if (node.kind === "binary" && node.operator === "*") {
      if (isUsagePriceMeter(node.left)) addNumericLiteral(node.right);
      if (isUsagePriceMeter(node.right)) addNumericLiteral(node.left);
    }
    expressionChildren(node).forEach(visit);
  };
  visit(compiled.ast);

  if (patches.size === 0) return null;
  let result = source;
  for (const patch of [...patches.values()].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, patch.start) + patch.text + result.slice(patch.end);
  }
  return compileBillingExpression(result).status === "ready" ? result : null;
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
          fixedPrice:
            node.fixedPrice === ""
              ? ""
              : scaledLiteral(Number(node.fixedPrice), factor),
          sharedPrices: node.sharedPrices?.map((price) => ({
            ...price,
            value: scaledLiteral(Number(price.value), factor),
          })),
          prices: node.prices.map((price) => ({
            ...price,
            value: scaledLiteral(Number(price.value), factor),
          })),
        };
      };
      const serialized = serializeVisualBillingDocument({
        ...document,
        root: scaleNode(document.root),
      });
      if (serialized.ok) return { ...data, billingExpr: serialized.source };
    }
    const billingExpr = scaleBillingExpressionPrices(
      data.billingExpr || 'tier("base", p * 0 + c * 0)',
      factor,
    );
    if (!billingExpr) {
      throw new Error("Unable to safely apply the price adjustment to this billing expression");
    }
    return { ...data, billingExpr };
  }
  return data.billingMode === "per-request"
    ? { ...data, price: scaled(data.price) }
    : { ...data, ratio: scaled(data.ratio) };
}

export function runtimeDisplaySpec(
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

export function activeUsageRuleSetForDraft(
  advancedPricingActive: boolean,
  usageRuleSet: UsageRuleSet | undefined,
  draft: ModelRatioData,
): UsageRuleSet | undefined {
  if (
    !advancedPricingActive ||
    !usageRuleSet ||
    draft.billingMode !== "tiered_expr"
  ) {
    return undefined;
  }
  return draft.billingExpr?.trim() === usageRuleSetExpression(usageRuleSet).trim()
    ? usageRuleSet
    : undefined;
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
    matchingUsageRuleSet(currentPriceSpec),
  );
  const [advancedPricingActive, setAdvancedPricingActive] = useState(
    Boolean(matchingUsageRuleSet(currentPriceSpec)),
  );
  const currentPriceSpecSignature = JSON.stringify(currentPriceSpec ?? null);
  const comparisonValue = (key: string, scope?: string, scopeId?: string) => {
    return vendorComparisonValue(vendorPriceSpec, key, scope, scopeId);
  };
  const renderPriceAddon = ({ key, scope, scopeId, value }: { key: string; scope?: string; scopeId?: string; value: string }) => {
    const vendorPrice = comparisonValue(key, scope, scopeId);
    if (vendorPrice == null || !Number.isFinite(vendorPrice)) {
      return <div className="shrink-0 text-xs text-muted-foreground">{t("Vendor price is not set")}</div>;
    }
    const entered = Number(value);
    const difference = Number.isFinite(entered)
      ? entered * (1 - discount / 100) - vendorPrice
      : undefined;
    const audioDurationFormatOptions = isAudioDurationPriceField(key)
      ? {
          digitsLarge: AUDIO_DURATION_PRICE_FRACTION_DIGITS,
          digitsSmall: AUDIO_DURATION_PRICE_FRACTION_DIGITS,
          abbreviate: false,
        }
      : undefined;
    return (
      <div className="shrink-0 text-xs text-muted-foreground">
        {t("Vendor price")}: {formatBillingCurrencyFromUSD(vendorPrice, audioDurationFormatOptions)}
        {difference != null && (
          <span className={cn("ml-2 font-medium", difference > 0 ? "text-rose-500" : difference < 0 ? "text-emerald-500" : "text-muted-foreground")}>
            {t("Difference")}: {difference > 0 ? "+" : ""}{formatBillingCurrencyFromUSD(difference, audioDurationFormatOptions)}
          </span>
        )}
      </div>
    );
  };
  useEffect(() => {
    setEntry(null);
    setEditorOverride(null);
    const currentRuleSet = matchingUsageRuleSet(currentPriceSpec);
    setUsageRuleSet(currentRuleSet);
    setAdvancedPricingActive(Boolean(currentRuleSet));
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
  }, [modelKey, currentPriceSpecSignature, t]);
  const handleAdditionalPricingActiveChange = (active: boolean) => {
    if (!active) {
      setAdvancedPricingActive(false);
      return;
    }

    const execution: UsageRuleSet["execution"] =
      entry?.usage_schema && Object.keys(entry.usage_schema).length
        ? "task"
        : "request";
    const nextRuleSet = usageRuleSet?.rules?.length
      ? usageRuleSet
      : createUsageRuleTemplate(execution === "task" ? "blank" : "image", execution);
    setUsageRuleSet(nextRuleSet);
    setAdvancedPricingActive(true);
  };
  const save = async () => {
    if (!entry) return;
    if (advancedPricingActive) {
      const validationError = validateUsageRuleSet(usageRuleSet);
      if (validationError) {
        toast.error(t(validationError));
        return;
      }
    }
    const draft = advancedPricingActive && usageRuleSet
      ? {
          name: modelKey,
          billingMode: "tiered_expr" as const,
          billingExpr: usageRuleSetExpression(usageRuleSet),
          requestRuleExpr: "",
        }
      : await ref.current?.commitDraft();
    if (!draft) return;
    draft.name = modelKey;
    const activeRuleSet = activeUsageRuleSetForDraft(
      advancedPricingActive,
      usageRuleSet,
      draft,
    );
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
      await onSaved(runtimeDisplaySpec(
        billedDraft,
        discount || undefined,
        draft,
        activeRuleSet,
      ));
      setUsageRuleSet(activeRuleSet);
      setAdvancedPricingActive(Boolean(activeRuleSet));
      setEditorOverride({ ...draft, name: modelKey });
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
    const vendorRuleSet = matchingUsageRuleSet(vendorPriceSpec);
    const vendor = vendorEditorData(modelKey, vendorPriceSpec);
    if (!vendor) {
      toast.error(t("No vendor price is available for the selected pricing mode"));
      return;
    }
    if (vendorRuleSet?.rules?.length) {
      setPricingCurrency(vendorPriceSpec?.pricingCurrency || pricingCurrency);
      setUsageRuleSet(vendorRuleSet);
      setAdvancedPricingActive(true);
      toast.success(t("Vendor pricing template and prices synchronized"));
      return;
    }
    setPricingCurrency(vendorPriceSpec?.pricingCurrency || pricingCurrency);
    setUsageRuleSet(vendorRuleSet);
    setAdvancedPricingActive(Boolean(vendorRuleSet));
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
          onAdditionalPricingActiveChange={handleAdditionalPricingActiveChange}
          additionalPricingTab={{
            label: t("Advanced media pricing rules"),
            content: (
                <UsageRuleBuilder
                  value={usageRuleSet}
                  comparisonValue={matchingUsageRuleSet(vendorPriceSpec)}
                  priceMultiplier={1 - discount / 100}
                  usageSchema={entry.usage_schema}
                  exchangeRate={exchangeRate}
                  currencySymbol={currencySymbol}
                  onApply={(nextRuleSet) => {
                    setUsageRuleSet(nextRuleSet);
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
