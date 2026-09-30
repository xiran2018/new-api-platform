import type {
  PriceSpec,
  UsagePriceRule,
  UsageRuleCondition,
  UsageRuleSet,
} from "./types";

/* A non-price branch used to make an unmatched structured rule explicit. */
export const UNMATCHED_TIER_NAME = "__pricing_unmatched__";

function unitDivisor(unit: string) {
  if (unit === "千字符") return 1_000;
  if (unit === "万字符") return 10_000;
  if (unit === "百万 Token") return 1_000_000;
  if (unit === "分钟") return 60;
  if (unit === "小时") return 3_600;
  return 1;
}

function valueLiteral(value: UsageRuleCondition["value"]) {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const trimmed = value.trim();
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return trimmed;
  if (trimmed === "true" || trimmed === "false") return trimmed;
  return JSON.stringify(value);
}

function conditionExpression(condition: UsageRuleCondition, execution: UsageRuleSet["execution"]) {
  const field = condition.field.trim();
  const probe = field === "image_count" && execution === "request"
    ? "image_count"
    : `u(${JSON.stringify(field)})`;
  const operators = { eq: "==", ne: "!=", lt: "<", lte: "<=", gt: ">", gte: ">=" } as const;
  const comparison = `${probe} ${operators[condition.operator]} ${valueLiteral(condition.value)}`;
  if (field === "image_count" && execution === "request") return comparison;
  return ["lt", "lte", "gt", "gte"].includes(condition.operator)
    ? `${probe} != nil && ${comparison}`
    : comparison;
}

export function usageRuleSetExpression(ruleSet: UsageRuleSet) {
  const scale = ruleSet.execution === "request" ? 1_000_000 : 1;
  const body = (item: UsagePriceRule) => {
    const activeCharges = item.charges.filter((entry) => entry.price > 0);
    const imageCountUnitPrice = ruleSet.execution === "request"
      ? activeCharges
          .filter((entry) => entry.meter === "image_count")
          .reduce((total, entry) => {
            const divisor = entry.divisor || (entry.priceBasis === "million" ? 1_000_000 : unitDivisor(entry.unit));
            return total + entry.price / divisor;
          }, 0)
      : 0;
    const parts = activeCharges
      .filter((entry) => ruleSet.execution !== "request" || entry.meter !== "image_count")
      .map((entry) => {
        const divisor = entry.divisor || (entry.priceBasis === "million" ? 1_000_000 : unitDivisor(entry.unit));
        const price = Number((entry.price * scale / divisor).toPrecision(15));
        if (entry.meter === "request") return String(price);
        const measured = `u(${JSON.stringify(entry.meter.trim())})`;
        return `${measured} * ${price}`;
      });
    const label = JSON.stringify(item.label.trim() || "default");
    const regular = parts.length ? `tier(${label}, ${parts.join(" + ")})` : "";
    const counted = imageCountUnitPrice > 0
      ? `tier(${label}, fixed(${Number(imageCountUnitPrice.toPrecision(15))})) * image_count`
      : "";
    return [counted, regular].filter(Boolean).join(" + ") || `tier(${label}, 0)`;
  };
  const rejectsUnmatched = ruleSet.unmatchedPolicy === "reject";
  let expression = rejectsUnmatched
    ? `tier(${JSON.stringify(UNMATCHED_TIER_NAME)}, 0)`
    : body(ruleSet.rules.at(-1)!);
  const firstConditionalIndex = rejectsUnmatched ? ruleSet.rules.length - 1 : ruleSet.rules.length - 2;
  for (let index = firstConditionalIndex; index >= 0; index -= 1) {
    const item = ruleSet.rules[index];
    const condition = item.conditions
      .map((itemCondition) => conditionExpression(itemCondition, ruleSet.execution))
      .join(" && ");
    expression = `${condition} ? ${body(item)} : ${expression}`;
  }
  return expression;
}

/**
 * Apply a catalogue discount to structured usage charges before serializing
 * them. Advanced rules can contain usage meters which the generic visual
 * expression parser does not understand; changing the structured data first
 * keeps the expression, comparison UI and persisted metadata in sync.
 */
export function scaleUsageRuleSetPrices(
  ruleSet: UsageRuleSet,
  factor: number,
): UsageRuleSet {
  return {
    ...ruleSet,
    rules: ruleSet.rules.map((rule) => ({
      ...rule,
      charges: rule.charges.map((charge) => ({
        ...charge,
        price: Number((charge.price * factor).toPrecision(15)),
      })),
    })),
  };
}

/** Ignore legacy advanced-rule metadata when it no longer describes the saved expression. */
export function matchingUsageRuleSet(spec?: PriceSpec): UsageRuleSet | undefined {
  for (const block of spec?.blocks || []) {
    const ruleSet = block.usageRuleSet;
    if (!ruleSet?.rules?.length) continue;
    const generated = usageRuleSetExpression(ruleSet).trim();
    const savedExpressions = [block.baseExpression, block.note]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    if (!savedExpressions.length || savedExpressions.includes(generated)) {
      return ruleSet;
    }
  }
  return undefined;
}
