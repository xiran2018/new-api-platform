import { Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PricingCurrency } from "@/features/model-pricing/currency";
import { useSystemConfigStore } from "@/stores/system-config-store";
import { splitBillingExprAndRequestRules } from "@/features/pricing/lib/billing-expr";
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

const hasNonZeroPrice = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value !== 0;

const blockHasVisiblePrice = (block: PriceBlock, requestMode: boolean) =>
  requestMode
    ? hasNonZeroPrice(block.price)
    : [
        block.input,
        block.output,
        block.cache,
        block.createCache,
        block.image,
        block.audioInput,
        block.audioOutput,
      ].some(hasNonZeroPrice);

function withDerivedPrices(spec?: PriceSpec): PriceSpec | undefined {
  if (!spec?.blocks?.length) return spec;
  if (spec.mode === "expression") {
    const source = spec.blocks[0];
    const baseExpression = source.baseExpression || source.note || "";
    const config = tryParseVisualConfig(
      splitBillingExprAndRequestRules(baseExpression).billingExpr,
    );
    if (!config) return spec;
    const multiplier = source.baseExpression && source.discount
      ? 1 - source.discount / 100
      : 1;
    return {
      ...spec,
      blocks: config.tiers.map((tier) => ({
        label: tier.label,
        input: tier.input_unit_cost * multiplier,
        output: tier.output_unit_cost * multiplier,
        cache: tier.cache_read_unit_cost == null ? null : tier.cache_read_unit_cost * multiplier,
        createCache: tier.cache_create_unit_cost == null ? null : tier.cache_create_unit_cost * multiplier,
        image: tier.image_unit_cost == null ? null : tier.image_unit_cost * multiplier,
        audioInput: tier.audio_input_unit_cost == null ? null : tier.audio_input_unit_cost * multiplier,
        audioOutput: tier.audio_output_unit_cost == null ? null : tier.audio_output_unit_cost * multiplier,
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
}: {
  ruleSet: UsageRuleSet;
  currency: PricingCurrency;
  discount?: number;
  showMarkup?: boolean;
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
          <div className="whitespace-nowrap" key={`${charge.meter}-${chargeIndex}`}>
            {label && <span className="mr-1 text-muted-foreground">{label}:</span>}
            <b>{money(charge.price * factor, currency)}</b>
            <span className="ml-1 text-muted-foreground">/ {charge.unit}</span>
          </div>
        );
      })}
      {rule.charges.some((charge) => charge.meter === "tts_output_characters" && charge.price === 0) && (
        <div className="whitespace-nowrap">
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
}: {
  spec?: PriceSpec;
  timezone: string;
  compareSpec?: PriceSpec;
  pricesOnly?: boolean;
  displayCurrency?: string;
  showMarkup?: boolean;
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
  if (usageRuleSet?.rules?.length) {
    return <UsageRuleSetRenderer ruleSet={usageRuleSet} currency={currency} discount={spec?.blocks?.[0]?.discount ?? 0} showMarkup={showMarkup} />;
  }
  if (!blocks.length) return <span className="text-muted-foreground">-</span>;
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
        const delta = (
          value: number | null | undefined,
          other: number | null | undefined,
        ) => {
          if (value == null || other == null) return null;
          const difference = value - other;
          if (Math.abs(difference * currency.exchangeRate) < 0.0005) return null;
          return (
            <small
              className={`ml-1 text-[11px] font-medium ${difference > 0 ? "text-rose-500" : difference < 0 ? "text-emerald-500" : "text-muted-foreground"}`}
            >
              {difference > 0 ? "+" : ""}
              {money(difference, currency)}
            </small>
          );
        };
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
            {((showTokenPrices && (b.input != null || b.output != null || b.cache != null || b.createCache != null || b.image != null || b.audioInput != null || b.audioOutput != null)) || (showRequestPrice && b.price != null)) && (
              <div className="space-y-1.5 text-sm">
                {showTokenPrices && hasNonZeroPrice(b.input) && (
                  <div>
                    {t("Input price")}: <b>{money(b.input, currency)}</b>
                    {delta(b.input, compared?.input)}
                    {unit && <span className="ml-1 text-muted-foreground">/ {unit}</span>}
                  </div>
                )}
                {showTokenPrices && hasNonZeroPrice(b.output) && (
                  <div>
                    {t("Output price")}: <b>{money(b.output, currency)}</b>
                    {delta(b.output, compared?.output)}
                    {unit && <span className="ml-1 text-muted-foreground">/ {unit}</span>}
                  </div>
                )}
                {showRequestPrice && hasNonZeroPrice(b.price) && (
                  <div>
                    <b>{money(b.price, currency)}</b>
                    {delta(b.price, compared?.price)}
                    <span className="ml-1 text-muted-foreground">/ {unit || t("Per request")}</span>
                  </div>
                )}
                {showTokenPrices && ([
                  ["cache", "Cache read price"],
                  ["createCache", "Cache write price"],
                  ["image", "Image input price"],
                  ["audioInput", "Audio input price"],
                  ["audioOutput", "Audio output price"],
                ] as const).map(([field, label]) =>
                  hasNonZeroPrice(b[field]) ? <div key={field}>{t(label)}: <b>{money(b[field], currency)}</b>{delta(b[field], compared?.[field])}{unit && <span className="ml-1 text-muted-foreground">/ {unit}</span>}</div> : null,
                )}
              </div>
            )}
            {!pricesOnly && displayedSpec?.mode === "table" && b.table?.headers?.length && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {b.table.headers.map((h, j) => (
                        <th className="border-b p-1 text-left" key={j}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(b.table.rows || []).map((r, j) => (
                      <tr key={j}>
                        {r.map((v, k) => (
                          <td className="border-b/50 p-1" key={k}>
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
