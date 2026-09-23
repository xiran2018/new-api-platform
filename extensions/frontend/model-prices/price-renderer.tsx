import { Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PricingCurrency } from "@/features/model-pricing/currency";
import { useSystemConfigStore } from "@/stores/system-config-store";
import { splitBillingExprAndRequestRules } from "@/features/pricing/lib/billing-expr";
import {
  parseVisualBillingDocument,
  type VisualCondition,
  type VisualPricingNode,
} from "@/features/pricing/lib/billing-expression/visual";
import { tryParseVisualConfig } from "@/features/pricing/lib/tier-expr";
import type { PriceBlock, PriceSpec, UsageRuleSet } from "./types";

const money = (
  value: number | null | undefined,
  currency: PricingCurrency,
) => {
  if (value == null) return "-";
  const converted = value * currency.exchangeRate;
  if (!Number.isFinite(converted)) return "-";
  const rounded = Math.abs(converted) < 0.0005 ? 0 : converted;
  return `${currency.symbol}${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(rounded)}`;
};

const hasNonZeroPrice = (
  value: number | null | undefined,
): value is number =>
  typeof value === "number" && Number.isFinite(value) && value !== 0;

const blockHasVisiblePrice = (block: PriceBlock, requestMode: boolean) =>
  requestMode
    ? hasNonZeroPrice(block.price)
    : [
        block.input,
        block.output,
        block.cache,
        block.createCache,
        block.createCache1h,
        block.image,
        block.imageOutput,
        block.audioInput,
        block.audioOutput,
        block.audioDuration,
        block.videoInput,
        block.videoOutput,
        block.multimodalOutput,
    ].some(hasNonZeroPrice);

export type PublicPriceRowField =
  | "price"
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
  | "multimodalOutput";

export type PublicPriceRow = {
  field: PublicPriceRowField;
  label: string;
  value: number;
};

const PRICE_ROW_FIELDS: ReadonlyArray<{
  field: PublicPriceRowField;
  label: string;
}> = [
  { field: "input", label: "Input price" },
  { field: "output", label: "Output price" },
  { field: "cache", label: "Cache read price" },
  { field: "createCache", label: "Cache write price" },
  { field: "createCache1h", label: "Cache write (1h) price" },
  { field: "image", label: "Image input price" },
  { field: "imageOutput", label: "Image output price" },
  { field: "audioInput", label: "Audio input price" },
  { field: "audioOutput", label: "Audio output price" },
  { field: "audioDuration", label: "Audio duration price" },
  { field: "videoInput", label: "Video input price" },
  { field: "videoOutput", label: "Video output price" },
  { field: "multimodalOutput", label: "Multimodal text output price" },
];

/**
 * Build the price rows used by the public page. The public page never renders
 * expression source, match conditions, or notes; tier labels remain human
 * readable.
 */
export function publicPriceRows(
  block: PriceBlock,
  requestMode: boolean,
): PublicPriceRow[] {
  if (requestMode) {
    return hasNonZeroPrice(block.price)
      ? [{ field: "price", label: "Per request", value: block.price }]
      : [];
  }
  return PRICE_ROW_FIELDS.flatMap(({ field, label }) => {
    const value: number | null | undefined = block[field];
    return hasNonZeroPrice(value)
      ? [{ field, label, value }]
      : [];
  });
}

type ThinkingPriceVariant = "thinking" | "non-thinking";

export type PublicPriceBlockGroup = {
  key: string;
  label: string;
  blocks: PriceBlock[];
  thinkingBlock?: PriceBlock;
  nonThinkingBlock?: PriceBlock;
};

type OmniOutputPriceSet = {
  pure: PriceBlock;
  multimodal: PriceBlock;
  audio: PriceBlock;
};

const omniOutputKind = (block: PriceBlock): keyof OmniOutputPriceSet | null => {
  const label = (block.label || "").toLowerCase();
  if (label.startsWith("pure text output")) return "pure";
  if (label.startsWith("multimodal text output")) return "multimodal";
  if (label.startsWith("text+audio output")) return "audio";
  return null;
};

function omniOutputPriceSet(blocks: PriceBlock[]): OmniOutputPriceSet | null {
  const found: Partial<OmniOutputPriceSet> = {};
  for (const block of blocks) {
    const kind = omniOutputKind(block);
    if (kind && !found[kind]) found[kind] = block;
  }
  return found.pure && found.multimodal && found.audio
    ? found as OmniOutputPriceSet
    : null;
}

const thinkingVariant = (block: PriceBlock): ThinkingPriceVariant | undefined => {
  const label = block.label || "";
  const note = block.note || "";
  if (/\bnon[-\s]?thinking\b/i.test(label)) return "non-thinking";
  if (/\bthinking\b/i.test(label)) return "thinking";

  // Some presets omit the non-thinking suffix, but the parsed branch note can
  // still identify whether it came from the false side of enable_thinking.
  const parameter = /param\(\s*["']?enable_thinking["']?\s*\)\s*==\s*true/;
  if (parameter.test(note)) {
    return /!\s*\(?\s*param\(\s*["']?enable_thinking["']?\s*\)/.test(note)
      ? "non-thinking"
      : "thinking";
  }
  return undefined;
};

const baseTierLabel = (label: string) => {
  const base = label
    .replace(/\s*\(shared\s+input\)\s*/i, " ")
    .replace(/\s*(?:non[-\s]?thinking|thinking)\b\s*/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base.toLowerCase() === "output" ? "" : base;
};

/**
 * Group thinking/non-thinking branches that belong to the same pricing tier.
 * The public page then renders one tier row with two output columns instead of
 * two separate cards that repeat the same input price.
 */
export function publicPriceBlockGroups(
  blocks: PriceBlock[],
): PublicPriceBlockGroup[] {
  type WorkingGroup = PublicPriceBlockGroup & { order: number };
  const groups = new Map<string, WorkingGroup>();

  const upsert = (
    key: string,
    order: number,
    label: string,
    block: PriceBlock,
    variant?: ThinkingPriceVariant,
  ) => {
    const existing = groups.get(key);
    if (!existing) {
      const group: WorkingGroup = {
        key,
        label,
        blocks: [block],
        order,
      };
      if (variant === "thinking") group.thinkingBlock = block;
      if (variant === "non-thinking") group.nonThinkingBlock = block;
      groups.set(key, group);
      return;
    }

    if (variant === "thinking" && !existing.thinkingBlock) {
      existing.thinkingBlock = block;
      existing.blocks.push(block);
    } else if (variant === "non-thinking" && !existing.nonThinkingBlock) {
      existing.nonThinkingBlock = block;
      existing.blocks.push(block);
    }
  };

  blocks.forEach((block, index) => {
    const variant = thinkingVariant(block);
    if (!variant) {
      upsert(`single:${block.label || index}`, index, block.label || "", block);
      return;
    }
    const label = baseTierLabel(block.label || "");
    upsert(`pair:${label || "default"}`, index, label, block, variant);
  });

  return Array.from(groups.values())
    .sort((left, right) => left.order - right.order)
    .map(({ order: _order, ...group }) => group);
}

function visualConditionText(condition: VisualCondition): string {
  if (condition.kind === "request-comparison") {
    return `${condition.source}(${condition.path}) ${condition.operator} ${JSON.stringify(condition.value)}`;
  }
  if (condition.kind === "comparison") {
    return `${condition.probe} ${condition.operator} ${condition.value}`;
  }
  if (condition.kind === "not") return `!(${visualConditionText(condition.child)})`;
  return condition.children.map(visualConditionText).join(
    condition.kind === "all" ? " && " : " || ",
  );
}

function visualNodeToPriceBlocks(
  node: VisualPricingNode,
  sharedPrices: Array<{ variable: string; value: string }> = [],
  multiplier = 1,
  inheritedCondition = "",
): PriceBlock[] {
  if (node.kind === "branch") {
    const condition = visualConditionText(node.condition);
    const yesCondition = inheritedCondition
      ? `${inheritedCondition} && ${condition}`
      : condition;
    const noCondition = inheritedCondition
      ? `${inheritedCondition} && !(${condition})`
      : `!(${condition})`;
    return [
      ...visualNodeToPriceBlocks(node.yes, sharedPrices, multiplier, yesCondition),
      ...visualNodeToPriceBlocks(node.no, sharedPrices, multiplier, noCondition),
    ];
  }
  if (node.billingUnit === "request") {
    return [{ label: node.label, price: Number(node.fixedPrice) * multiplier, unit: "request", note: inheritedCondition }];
  }
  const values = new Map<string, number>();
  for (const price of sharedPrices) values.set(price.variable, Number(price.value));
  for (const price of node.sharedPrices || []) values.set(price.variable, Number(price.value));
  for (const price of node.prices) values.set(price.variable, Number(price.value));
  const block: PriceBlock = { label: node.label, unit: "1M tokens", note: inheritedCondition };
  for (const [variable, value] of values) {
    const amount = value * multiplier;
    switch (variable) {
      case "p": block.input = amount; break;
      case "c": block.output = amount; break;
      case "cr": block.cache = amount; break;
      case "cc": block.createCache = amount; break;
      case "cc1h": block.createCache1h = amount; break;
      case "img": block.image = amount; break;
      case "img_o": block.imageOutput = amount; break;
      case "ai": block.audioInput = amount; break;
      case "ao": block.audioOutput = amount; break;
      case "aud_s": block.audioDuration = amount; break;
      case "vid": block.videoInput = amount; break;
      case "vid_o": block.videoOutput = amount; break;
    }
  }
  return [block];
}

/** Converts any visually parseable expression into list-friendly price blocks. */
export function expressionPriceBlocks(source: string, multiplier = 1): PriceBlock[] | null {
  const document = parseVisualBillingDocument(source);
  return document ? visualNodeToPriceBlocks(document.root, document.shared?.prices, multiplier) : null;
}

function withDerivedPrices(spec?: PriceSpec): PriceSpec | undefined {
  if (!spec?.blocks?.length) return spec;
  if (spec.mode === "expression") {
    const source = spec.blocks[0];
    const baseExpression = source.baseExpression || source.note || "";
    const config = tryParseVisualConfig(
      splitBillingExprAndRequestRules(baseExpression).billingExpr,
    );
    const multiplier = source.baseExpression && source.discount
      ? 1 - source.discount / 100
      : 1;
    if (!config) {
      const blocks = expressionPriceBlocks(
        splitBillingExprAndRequestRules(baseExpression).billingExpr,
        multiplier,
      );
      return blocks?.length ? { ...spec, blocks } : spec;
    }
    return {
      ...spec,
      blocks: config.tiers.map((tier) => ({
        label: tier.label,
        input: tier.input_unit_cost * multiplier,
        output: tier.output_unit_cost * multiplier,
        cache: tier.cache_read_unit_cost == null ? null : tier.cache_read_unit_cost * multiplier,
        createCache: tier.cache_create_unit_cost == null ? null : tier.cache_create_unit_cost * multiplier,
        createCache1h: tier.cache_create_1h_unit_cost == null ? null : Number(tier.cache_create_1h_unit_cost) * multiplier,
        image: tier.image_unit_cost == null ? null : tier.image_unit_cost * multiplier,
        imageOutput: tier.image_output_unit_cost == null ? null : tier.image_output_unit_cost * multiplier,
        audioInput: tier.audio_input_unit_cost == null ? null : tier.audio_input_unit_cost * multiplier,
        audioOutput: tier.audio_output_unit_cost == null ? null : tier.audio_output_unit_cost * multiplier,
        audioDuration: tier.audio_duration_unit_cost == null ? null : Number(tier.audio_duration_unit_cost) * multiplier,
        videoInput: tier.video_input_unit_cost == null ? null : Number(tier.video_input_unit_cost) * multiplier,
        videoOutput: tier.video_output_unit_cost == null ? null : Number(tier.video_output_unit_cost) * multiplier,
        multimodalOutput: tier.multimodal_output_enabled
          ? Number(tier.multimodal_output_unit_cost ?? 0) * multiplier
          : null,
        unit: "1M tokens",
        discount: source.discount,
        note: pricesOnlyExpressionNote(tier.conditions),
      })),
    };
  }
  return {
    ...spec,
    blocks: spec.blocks.map((block) => {
      if (
        block.input != null ||
        block.output != null ||
        block.price != null ||
        !block.table?.rows?.length
      ) {
        return block;
      }
      const fields = Object.fromEntries(block.table.rows);
      const finite = (key: string) => {
        const value = Number(fields[key]);
        return Number.isFinite(value) ? value : undefined;
      };
      const requestPrice = finite("model_price");
      if (requestPrice != null) return { ...block, price: requestPrice };
      const ratio = finite("model_ratio");
      if (ratio == null) return block;
      const input = ratio * 2;
      const completion = finite("completion_ratio");
      return {
        ...block,
        input,
        output: completion == null ? undefined : input * completion,
        unit: block.unit || "1M tokens",
      };
    }),
  };
}

function pricesOnlyExpressionNote(
  conditions: Array<{ var: string; op: string; value: string | number }>,
) {
  return conditions.map((condition) => `${condition.var} ${condition.op} ${condition.value}`).join(" && ");
}
const activeWindow = (b: PriceBlock, timezone: string) => {
  if (!b.start || !b.end) return false;
  const now = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return b.start <= b.end
    ? now >= b.start && now < b.end
    : now >= b.start || now < b.end;
};

function UsageRuleSetRenderer({
  ruleSet,
  currency,
  discount = 0,
  showMarkup = false,
  compact = false,
}: {
  ruleSet: UsageRuleSet;
  currency: PricingCurrency;
  discount?: number;
  showMarkup?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const operator = { eq: "=", ne: "!=", lt: "<", lte: "≤", gt: ">", gte: "≥" } as const;
  const factor = 1 - discount / 100;
  const showRuleDetails = ruleSet.rules.length > 1 || ruleSet.rules.some((rule) => rule.conditions.length > 0);
  const baseUnitPrice = ruleSet.rules
    .flatMap((rule) => rule.charges)
    .find((charge) => charge.price > 0)?.price || 0;
  const conditionLabel = (condition: UsageRuleSet["rules"][number]["conditions"][number]) => {
    const field = t(({
      output_images: "Generated image quantity",
      input_images: "Input image count",
      seconds: "Output video duration",
      characters: "Character count",
      tts_input_characters: "TTS input price",
      tts_output_characters: "TTS output price",
    } as Record<string, string>)[condition.field] || condition.field);
    return `${field} ${operator[condition.operator]} ${String(condition.value)}`;
  };
  const meterLabel = (meter: string) => {
    if (["request", "count"].includes(meter)) return "";
    return t(({
      input_images: "Input image count",
      output_images: "Output image count",
      seconds: "Output video duration",
      characters: "Character count",
      tts_input_characters: "TTS input price",
      tts_output_characters: "TTS output price",
    } as Record<string, string>)[meter] || meter);
  };
  const charges = (rule: UsageRuleSet["rules"][number]) => (
    <div className="space-y-1">
      {rule.charges.filter((charge) => charge.price !== 0).map((charge, chargeIndex) => {
        const label = meterLabel(charge.meter);
        return (
          <div className="break-words" key={`${charge.meter}-${chargeIndex}`}>
            {label && <span className="mr-1 text-muted-foreground">{label}:</span>}
            <b>{money(charge.price * factor, currency)}</b>
            <span className="ml-1 text-muted-foreground">/ {charge.unit}</span>
          </div>
        );
      })}
      {rule.charges.some((charge) => charge.meter === "tts_output_characters" && charge.price === 0) && (
        <div className="break-words">
          <span className="mr-1 text-muted-foreground">{t("Output price")}:</span>
          <b>{t("Free")}</b>
        </div>
      )}
      {!rule.charges.some((charge) => charge.price !== 0) && <span className="text-muted-foreground">{t("Free")}</span>}
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="flex min-h-6 flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{t("Pricing mode")}: {t("Usage rule pricing")}</span>
        {discount > 0 && <span className="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">{t("Discount")} {discount}%</span>}
        {showMarkup && discount < 0 && <span className="inline-flex items-center rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">{t("Markup")} {Math.abs(discount)}%</span>}
      </div>
      {!showRuleDetails ? (
        <div className="rounded-md border bg-muted/25 p-3 text-sm">
          {charges(ruleSet.rules[0])}
        </div>
      ) : compact ? (
        <div className="space-y-2">
          {ruleSet.rules.map((rule, index) => (
            <div className="min-w-0 rounded-md border bg-muted/25 p-2.5" key={rule.id || index}>
              <div className="mb-1 break-words text-xs font-medium">{rule.label}</div>
              {charges(rule)}
              {rule.conditions.length > 0 && (
                <div className="mt-1 break-words text-xs text-muted-foreground">
                  {rule.conditions.map(conditionLabel).join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] table-fixed text-sm">
          <colgroup><col className="w-[24%]" /><col className="w-[18%]" /><col className="w-[18%]" /><col className="w-[40%]" /></colgroup>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr><th className="p-2 text-left">{t("Pricing tier")}</th><th className="p-2 text-left">{t("Unit price")}</th><th className="p-2 text-left">{t("Tier discount")}</th><th className="p-2 text-left">{t("Match conditions")}</th></tr>
          </thead>
          <tbody>
            {ruleSet.rules.map((rule, index) => (
              <tr className="border-t align-top" key={rule.id || index}>
                <td className="p-2 font-medium">{rule.label}</td>
                <td className="p-2">{charges(rule)}</td>
                <td className="p-2 text-xs text-muted-foreground">
                  {baseUnitPrice > 0 && rule.charges[0]?.price > 0 && rule.charges[0].price < baseUnitPrice
                    ? `${(rule.charges[0].price / baseUnitPrice * 10).toFixed(1)} ${t("Chinese discount unit")}`
                    : t("None")}
                </td>
                <td className="p-2 text-xs text-muted-foreground">
                  {rule.conditions.length ? rule.conditions.map(conditionLabel).join(" · ") : rule.label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  );
}
export function PriceRenderer({
  spec,
  timezone,
  compareSpec,
  pricesOnly = false,
  displayCurrency = "CNY",
  showMarkup = false,
  compact = false,
  tableLayout = false,
}: {
  spec?: PriceSpec;
  timezone: string;
  compareSpec?: PriceSpec;
  pricesOnly?: boolean;
  displayCurrency?: string;
  showMarkup?: boolean;
  compact?: boolean;
  /** Public page layout: one compact table per pricing tier, without raw expression text. */
  tableLayout?: boolean;
}) {
  const { t } = useTranslation();
  const currencyConfig = useSystemConfigStore((state) => state.config.currency);
  const currency: PricingCurrency = displayCurrency.toUpperCase() === "USD"
    ? { label: "USD", symbol: "$", exchangeRate: 1 }
    : {
        label: "CNY",
        symbol: "¥",
        exchangeRate:
          Number.isFinite(currencyConfig.usdExchangeRate) &&
          currencyConfig.usdExchangeRate > 0
            ? currencyConfig.usdExchangeRate
            : 1,
      };
  const displayedSpec = withDerivedPrices(spec);
  const displayedCompareSpec = withDerivedPrices(compareSpec);
  const requestMode = displayedSpec?.mode === "request";
  const usageRuleSet = spec?.blocks?.[0]?.usageRuleSet;
  const blocks = (displayedSpec?.blocks || []).filter(
    (block) =>
      displayedSpec?.mode === "table" ||
      blockHasVisiblePrice(block, requestMode),
  );
  const expression =
    spec?.mode === "expression"
      ? spec.blocks?.[0]?.baseExpression || spec.blocks?.[0]?.note || ""
      : "";
  const expressionUsesTime =
    /\b(?:hour|minute|weekday|month|day)\s*\(/.test(expression);
  const modeLabel = t(
    ({
      token: "Token pricing",
      request: "Per request",
      expression: expressionUsesTime ? "Time-based pricing" : "Tiered pricing",
      time: "Time windows",
      tiered: "Tiered pricing",
      table: "Custom table",
    } as Record<string, string>)[spec?.mode || "token"] || "Token pricing",
  );
  const comparisonDelta = (
    value: number | null | undefined,
    other: number | null | undefined,
  ) => {
    if (value == null || other == null) return null;
    const difference = value - other;
    if (Math.abs(difference * currency.exchangeRate) < 0.0005) return null;
    return (
      <small
        className={`ml-1 text-[11px] font-medium ${difference > 0 ? "text-rose-500" : "text-emerald-500"}`}
      >
        {difference > 0 ? "+" : ""}
        {money(difference, currency)}
      </small>
    );
  };
  if (usageRuleSet?.rules?.length) {
    return <UsageRuleSetRenderer ruleSet={usageRuleSet} currency={currency} discount={spec?.blocks?.[0]?.discount ?? 0} showMarkup={showMarkup} compact={compact} />;
  }
  if (!blocks.length) return <span className="text-muted-foreground">-</span>;
  if (tableLayout) {
    return (
      <div className="min-w-0 space-y-2">
        <div className="flex min-h-6 flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{t("Pricing mode")}: {modeLabel}</span>
          {(blocks[0]?.discount ?? 0) > 0 && (
            <span className="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
              {t("Discount")} {blocks[0].discount}%
            </span>
          )}
          {showMarkup && (blocks[0]?.discount ?? 0) < 0 && (
            <span className="inline-flex items-center rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">
              {t("Markup")} {Math.abs(blocks[0].discount!)}%
            </span>
          )}
        </div>
        {(() => {
          const omniPrices = omniOutputPriceSet(blocks);
          const comparedOmniPrices = omniOutputPriceSet(displayedCompareSpec?.blocks || []);
          const omniBlocks = new Set(omniPrices ? Object.values(omniPrices) : []);
          const groups = publicPriceBlockGroups(
            blocks.filter((block) => !omniBlocks.has(block)),
          );
          const comparedOmniBlocks = new Set(
            comparedOmniPrices ? Object.values(comparedOmniPrices) : [],
          );
          const compareGroups = publicPriceBlockGroups(
            (displayedCompareSpec?.blocks || []).filter(
              (block) => !comparedOmniBlocks.has(block),
            ),
          );
          const compareGroupFor = (group: PublicPriceBlockGroup) =>
            compareGroups.find((candidate) => candidate.key === group.key) ||
            compareGroups.find((candidate) => candidate.label === group.label);
          const pairedGroups = groups.filter(
            (group) => group.thinkingBlock && group.nonThinkingBlock,
          );
          const regularGroups = groups.filter(
            (group) => !(group.thinkingBlock && group.nonThinkingBlock),
          );
          const priceValue = (
            block: PriceBlock | undefined,
            field: PublicPriceRowField,
          ) => block
            ? publicPriceRows(block, requestMode).find((row) => row.field === field)?.value
            : undefined;
          const renderPrice = (
            value: number | undefined,
            unit: string,
            comparedValue?: number,
          ) => value == null ? (
            <span className="text-muted-foreground">-</span>
          ) : (
            <>
              <b>{money(value, currency)}</b>
              {showMarkup && comparisonDelta(value, comparedValue)}
              {unit && <span className="ml-1 text-xs text-muted-foreground">/ {unit}</span>}
            </>
          );
          return (
            <>
              {omniPrices && (() => {
                const unit = omniPrices.pure.unit || omniPrices.multimodal.unit || omniPrices.audio.unit || "";
                const inputBlock = omniPrices.pure;
                const comparedInputBlock = comparedOmniPrices?.pure;
                const imagePrice = priceValue(inputBlock, "image");
                const videoPrice = priceValue(inputBlock, "videoInput");
                const comparedImagePrice = priceValue(comparedInputBlock, "image");
                const comparedVideoPrice = priceValue(comparedInputBlock, "videoInput");
                const sameMediaPrice = imagePrice === videoPrice;
                return (
                  <div className="overflow-x-auto rounded-md border bg-muted/25">
                    <table className="min-w-[900px] table-fixed text-left text-xs">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th colSpan={3} className="border-b border-r p-2 text-center font-medium">
                            {t("Input unit price")}
                          </th>
                          <th colSpan={3} className="border-b p-2 text-center font-medium">
                            {t("Output unit price")}
                          </th>
                        </tr>
                        <tr>
                          <th className="border-r p-2 font-medium">{t("Text input")}</th>
                          <th className="border-r p-2 font-medium">{t("Audio input")}</th>
                          <th className="border-r p-2 font-medium">{t("Image / video input")}</th>
                          <th className="border-r p-2 font-medium">{t("Pure text output")}</th>
                          <th className="border-r p-2 font-medium">{t("Multimodal text output")}</th>
                          <th className="p-2 font-medium">
                            {t("Text + audio output")}
                            <span className="ml-1 font-normal">({t("Audio only billed")})</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t align-top">
                          <td className="break-words border-r p-2.5">
                            {renderPrice(
                              priceValue(inputBlock, "input"),
                              unit,
                              priceValue(comparedInputBlock, "input"),
                            )}
                          </td>
                          <td className="break-words border-r p-2.5">
                            {renderPrice(
                              priceValue(inputBlock, "audioInput"),
                              unit,
                              priceValue(comparedInputBlock, "audioInput"),
                            )}
                          </td>
                          <td className="break-words border-r p-2.5">
                            {sameMediaPrice ? renderPrice(
                              imagePrice ?? videoPrice,
                              unit,
                              comparedImagePrice ?? comparedVideoPrice,
                            ) : (
                              <div className="space-y-1">
                                <div>
                                  <span className="mr-1 text-muted-foreground">{t("Image input")}:</span>
                                  {renderPrice(imagePrice, unit, comparedImagePrice)}
                                </div>
                                <div>
                                  <span className="mr-1 text-muted-foreground">{t("Video input")}:</span>
                                  {renderPrice(videoPrice, unit, comparedVideoPrice)}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="break-words border-r p-2.5">
                            {renderPrice(
                              priceValue(omniPrices.pure, "output"),
                              unit,
                              priceValue(comparedOmniPrices?.pure, "output"),
                            )}
                          </td>
                          <td className="break-words border-r p-2.5">
                            {renderPrice(
                              priceValue(omniPrices.multimodal, "output"),
                              unit,
                              priceValue(comparedOmniPrices?.multimodal, "output"),
                            )}
                          </td>
                          <td className="break-words p-2.5">
                            {renderPrice(
                              priceValue(omniPrices.audio, "audioOutput"),
                              unit,
                              priceValue(comparedOmniPrices?.audio, "audioOutput"),
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              {pairedGroups.length > 0 && (
                <div className="overflow-x-auto rounded-md border bg-muted/25">
                  <table className={`w-full ${compact ? "min-w-0 text-xs" : "min-w-[720px] text-sm"} table-fixed text-left`}>
                    <colgroup>
                      <col className="w-[28%]" />
                      <col className="w-[24%]" />
                      <col className="w-[24%]" />
                      <col className="w-[24%]" />
                    </colgroup>
                    <thead className="bg-muted/60 text-xs text-muted-foreground">
                      <tr>
                        <th rowSpan={2} className="border-r p-2 text-left font-medium">
                          {t("Token range")}
                        </th>
                        <th rowSpan={2} className="border-r p-2 text-left font-medium">
                          {t("Input price")}
                        </th>
                        <th colSpan={2} className="p-2 text-center font-medium">
                          {t("Output price")}
                        </th>
                      </tr>
                      <tr className="border-t">
                        <th className="border-r p-2 text-left font-medium">
                          {t("Non-thinking mode")}
                        </th>
                        <th className="p-2 text-left font-medium">
                          {t("Thinking mode")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairedGroups.map((group, groupIndex) => {
                        const primary = group.nonThinkingBlock || group.thinkingBlock || group.blocks[0];
                        const comparedGroup = compareGroupFor(group);
                        const unit = primary.unit === "request" ? t("Per request") : primary.unit || "";
                        const current = displayedSpec?.mode === "time" && group.blocks.some((block) => activeWindow(block, timezone));
                        const fallbackRange = primary.min != null || primary.max != null
                          ? `${primary.min ?? 0} - ${primary.max ?? "∞"}`
                          : t("Default tier");
                        return (
                          <tr className="border-t align-top" key={group.key || groupIndex}>
                            <td className="break-words border-r p-2.5 font-medium">
                              <div>{group.label || fallbackRange}</div>
                              {primary.start && (
                                <div className="mt-1 flex items-center gap-1 text-xs font-normal text-muted-foreground">
                                  <Clock3 className="size-3" />
                                  {primary.start}-{primary.end}
                                </div>
                              )}
                              {current && (
                                <span className="mt-1 inline-flex rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-normal text-white">
                                  {t("Current")}
                                </span>
                              )}
                            </td>
                            <td className="break-words border-r p-2.5">
                              {renderPrice(
                                priceValue(group.thinkingBlock, "input") ?? priceValue(group.nonThinkingBlock, "input"),
                                unit,
                                priceValue(comparedGroup?.thinkingBlock, "input") ?? priceValue(comparedGroup?.nonThinkingBlock, "input"),
                              )}
                            </td>
                            <td className="break-words border-r p-2.5">
                              {renderPrice(
                                priceValue(group.nonThinkingBlock, "output"),
                                unit,
                                priceValue(comparedGroup?.nonThinkingBlock, "output"),
                              )}
                            </td>
                            <td className="break-words p-2.5">
                              {renderPrice(
                                priceValue(group.thinkingBlock, "output"),
                                unit,
                                priceValue(comparedGroup?.thinkingBlock, "output"),
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {regularGroups.map((group, groupIndex) => {
                const primary = group.blocks[0];
                const rows = publicPriceRows(primary, requestMode);
                if (!rows.length) return null;
                const comparedRows = publicPriceRows(compareGroupFor(group)?.blocks[0] || {}, requestMode);
                const current = displayedSpec?.mode === "time" && group.blocks.some((block) => activeWindow(block, timezone));
                const unit = primary.unit === "request" ? t("Per request") : primary.unit || "";
                return (
                  <div
                    key={group.key || groupIndex}
                    className={`overflow-hidden rounded-md border ${current ? "border-emerald-500/50 bg-emerald-500/10" : "bg-muted/25"}`}
                  >
                    {(group.label || primary.start || primary.end || primary.min != null || primary.max != null || current) && (
                      <div className="flex flex-wrap items-center gap-1.5 border-b bg-background/60 px-3 py-2 text-xs font-medium">
                        {group.label && <span>{group.label}</span>}
                        {primary.start && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Clock3 className="size-3" />
                            {primary.start}-{primary.end}
                          </span>
                        )}
                        {(primary.min != null || primary.max != null) && (
                          <span className="text-muted-foreground">
                            {primary.min ?? 0} - {primary.max ?? "∞"}
                          </span>
                        )}
                        {current && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-white">{t("Current")}</span>}
                      </div>
                    )}
                    <table className="w-full table-fixed text-left text-sm">
                      <tbody>
                        {rows.map((row) => (
                          <tr className="border-b last:border-b-0" key={row.field}>
                            <td className="break-words p-2.5 text-xs text-muted-foreground">{t(row.label)}</td>
                            <td className="break-words p-2.5">
                              <b>{money(row.value, currency)}</b>
                              {showMarkup && comparisonDelta(
                                row.value,
                                comparedRows.find((candidate) => candidate.field === row.field)?.value,
                              )}
                              {unit && <span className="ml-1 text-xs text-muted-foreground">/ {unit}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex min-h-6 flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{t("Pricing mode")}: {modeLabel}</span>
        {(blocks[0]?.discount ?? 0) > 0 && (
          <span className="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
            {t("Discount")} {blocks[0].discount}%
          </span>
        )}
        {showMarkup && (blocks[0]?.discount ?? 0) < 0 && (
          <span className="inline-flex items-center rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">
            {t("Markup")} {Math.abs(blocks[0].discount!)}%
          </span>
        )}
      </div>
      {blocks.map((b, i) => {
        const showRequestPrice = displayedSpec?.mode === "request";
        const showTokenPrices = !showRequestPrice && displayedSpec?.mode !== "table";
        const compared = displayedCompareSpec?.blocks?.[i];
        const current =
          displayedSpec?.mode === "time" && activeWindow(b, timezone);
        const unit = b.unit === "request" ? t("Per request") : b.unit;
        return (
          <div
            key={i}
            className={`rounded-md border p-2.5 ${current ? "border-emerald-500/50 bg-emerald-500/10" : "bg-muted/25"}`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium">
              {(!pricesOnly || spec?.mode === "expression") && b.label && <span>{b.label}</span>}
              {b.start && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Clock3 className="size-3" />
                  {b.start}-{b.end}
                </span>
              )}
              {(b.min != null || b.max != null) && (
                <span className="text-muted-foreground">
                  {b.min ?? 0} - {b.max ?? "∞"}
                </span>
              )}
              {current && (
                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-white">
                  {t("Current")}
                </span>
              )}
            </div>
            {((showTokenPrices && (b.input != null || b.output != null || b.cache != null || b.createCache != null || b.createCache1h != null || b.image != null || b.imageOutput != null || b.audioInput != null || b.audioOutput != null || b.audioDuration != null || b.videoInput != null || b.videoOutput != null || b.multimodalOutput != null)) || (showRequestPrice && b.price != null)) && (
              <div className="space-y-1.5 text-sm">
                {showTokenPrices && hasNonZeroPrice(b.input) && (
                  <div>
                    {t("Input price")}: <b>{money(b.input, currency)}</b>
                    {comparisonDelta(b.input, compared?.input)}
                    {unit && <span className="ml-1 text-muted-foreground">/ {unit}</span>}
                  </div>
                )}
                {showTokenPrices && hasNonZeroPrice(b.output) && (
                  <div>
                    {t(b.multimodalOutput != null ? "Pure text output price" : "Output price")}: <b>{money(b.output, currency)}</b>
                    {comparisonDelta(b.output, compared?.output)}
                    {unit && <span className="ml-1 text-muted-foreground">/ {unit}</span>}
                  </div>
                )}
                {showRequestPrice && hasNonZeroPrice(b.price) && (
                  <div>
                    <b>{money(b.price, currency)}</b>
                    {comparisonDelta(b.price, compared?.price)}
                    <span className="ml-1 text-muted-foreground">/ {unit || t("Per request")}</span>
                  </div>
                )}
                {showTokenPrices && ([
                  ["cache", "Cache read price"],
                  ["createCache", "Cache write price"],
                  ["createCache1h", "Cache write (1h) price"],
                  ["image", "Image input price"],
                  ["imageOutput", "Image output price"],
                  ["audioInput", "Audio input price"],
                  ["audioOutput", "Audio output price"],
                  ["audioDuration", "Audio duration price"],
                  ["videoInput", "Video input price"],
                  ["videoOutput", "Video output price"],
                  ["multimodalOutput", "Multimodal text output price"],
                ] as const).map(([field, label]) =>
                  hasNonZeroPrice(b[field]) ? <div key={field}>{t(label)}: <b>{money(b[field], currency)}</b>{comparisonDelta(b[field], compared?.[field])}{unit && <span className="ml-1 text-muted-foreground">/ {unit}</span>}</div> : null,
                )}
              </div>
            )}
            {!pricesOnly && displayedSpec?.mode === "table" && b.table?.headers?.length && (
              <div className={compact ? "min-w-0" : "overflow-x-auto"}>
                <table className={`w-full text-xs ${compact ? "table-fixed" : ""}`}>
                  <thead>
                    <tr>
                      {b.table.headers.map((h, j) => (
                        <th className="break-words border-b p-1 text-left" key={j}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(b.table.rows || []).map((r, j) => (
                      <tr key={j}>
                        {r.map((v, k) => (
                          <td className="break-words border-b/50 p-1" key={k}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(!pricesOnly || spec?.mode === "expression") && b.note && (
              <div className="mt-1 text-xs text-muted-foreground">{b.note}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function numericDifference(v?: PriceSpec, o?: PriceSpec) {
  const a = v?.blocks?.[0],
    b = o?.blocks?.[0];
  const av = a?.price ?? a?.input,
    bv = b?.price ?? b?.input;
  return typeof av === "number" && typeof bv === "number" ? bv - av : null;
}
