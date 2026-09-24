import type {
  PriceSpec,
  UsagePriceRule,
  UsageRuleCondition,
  UsageRuleSet,
} from "./types";

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

function conditionExpression(condition: UsageRuleCondition) {
  const field = condition.field.trim();
  const probe = field === "image_count" ? "image_count" : `u(${JSON.stringify(field)})`;
  const operators = { eq: "==", ne: "!=", lt: "<", lte: "<=", gt: ">", gte: ">=" } as const;
  const comparison = `${probe} ${operators[condition.operator]} ${valueLiteral(condition.value)}`;
  if (field === "image_count") return comparison;
  return ["lt", "lte", "gt", "gte"].includes(condition.operator)
    ? `${probe} != nil && ${comparison}`
    : comparison;
}

export function usageRuleSetExpression(ruleSet: UsageRuleSet) {
  const scale = ruleSet.execution === "request" ? 1_000_000 : 1;
  const body = (item: UsagePriceRule) => {
    const activeCharges = item.charges.filter((entry) => entry.price > 0);
    const imageCountUnitPrice = activeCharges
      .filter((entry) => entry.meter === "image_count")
      .reduce((total, entry) => {
        const divisor = entry.divisor || (entry.priceBasis === "million" ? 1_000_000 : unitDivisor(entry.unit));
        return total + entry.price / divisor;
      }, 0);
    const parts = activeCharges
      .filter((entry) => entry.meter !== "image_count")
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
  let expression = body(ruleSet.rules.at(-1)!);
  for (let index = ruleSet.rules.length - 2; index >= 0; index -= 1) {
    const item = ruleSet.rules[index];
    const condition = item.conditions.map(conditionExpression).join(" && ");
    expression = `${condition} ? ${body(item)} : ${expression}`;
  }
  return expression;
}

/** Ignore legacy advanced-rule metadata when it no longer describes the saved expression. */
export function matchingUsageRuleSet(spec?: PriceSpec): UsageRuleSet | undefined {
  for (const block of spec?.blocks || []) {
    const ruleSet = block.usageRuleSet;
    if (!ruleSet?.rules?.length) continue;
    const savedExpression = (block.baseExpression || block.note || "").trim();
    if (!savedExpression || usageRuleSetExpression(ruleSet).trim() === savedExpression) {
      return ruleSet;
    }
  }
  return undefined;
}
