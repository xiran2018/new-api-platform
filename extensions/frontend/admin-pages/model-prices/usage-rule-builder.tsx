import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CopyPlus, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BillingUsageSchema } from "@/features/pricing/types";
import type {
  UsagePriceCharge,
  UsagePriceRule,
  UsageRuleCondition,
  UsageRuleSet,
} from "../../model-prices/types";

type TemplateKey = "image" | "boolean" | "volume" | "video" | "blank";

const requestFields = [
  "resolution",
  "resolution_tier",
  "quality",
  "mode",
  "prompt_extend",
  "audio",
  "input_images",
  "output_images",
  "seconds",
  "characters",
  "count",
];

const fieldLabels: Record<string, string> = {
  resolution: "Resolution",
  resolution_tier: "Resolution tier",
  quality: "Quality",
  mode: "Mode",
  prompt_extend: "Prompt rewriting",
  audio: "Audio enabled",
  input_images: "Input image count",
  output_images: "Output image count",
  seconds: "Duration in seconds",
  characters: "Character count",
  count: "Quantity",
};

const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const charge = (meter = "request", unit = "次", price = 0): UsagePriceCharge => ({
  meter,
  unit,
  price,
});

function defaultUnit(meter: string, usageSchema?: BillingUsageSchema) {
  if (meter === "request") return "次";
  const unit = usageSchema?.[meter]?.unit;
  if (unit === "second" || meter === "seconds") return "秒";
  if (unit === "token") return "百万 Token";
  if (unit === "credit") return "计费点";
  if (meter.includes("image")) return "张";
  if (meter === "characters") return "字符";
  return "个";
}

function defaultConditionValue(field: string, usageSchema?: BillingUsageSchema) {
  const definition = usageSchema?.[field];
  if (definition?.enum?.length) return definition.enum[0];
  if (definition?.type === "boolean" || ["prompt_extend", "audio"].includes(field)) return true;
  if (["resolution", "resolution_tier"].includes(field)) return "1080P";
  if (field === "quality") return "standard";
  return "";
}

function unitDivisor(unit: string) {
  if (unit === "千字符") return 1_000;
  if (unit === "万字符") return 10_000;
  if (unit === "百万 Token") return 1_000_000;
  if (unit === "分钟") return 60;
  if (unit === "小时") return 3_600;
  return 1;
}

function unitOptions(meter: string, usageSchema?: BillingUsageSchema) {
  if (meter === "request") return ["次"];
  if (meter === "seconds" || usageSchema?.[meter]?.unit === "second") return ["秒", "分钟", "小时"];
  if (meter === "characters") return ["字符", "千字符", "万字符"];
  if (meter.includes("image")) return ["张"];
  if (usageSchema?.[meter]?.unit === "token") return ["百万 Token"];
  if (usageSchema?.[meter]?.unit === "credit") return ["计费点"];
  return ["个", "张", "音色"];
}

const rule = (
  label: string,
  conditions: UsageRuleCondition[] = [],
  charges: UsagePriceCharge[] = [charge()],
): UsagePriceRule => ({ id: id(), label, conditions, charges });

function template(key: TemplateKey, execution: UsageRuleSet["execution"]): UsageRuleSet {
  const wrap = (rules: UsagePriceRule[]): UsageRuleSet => ({ version: 1, execution, rules });
  if (key === "image") {
    return wrap([
      rule("1K", [{ field: "resolution_tier", operator: "eq", value: "1K" }], [
        charge("input_images", "张"), charge("output_images", "张"),
      ]),
      rule("2K 及以上", [], [charge("input_images", "张"), charge("output_images", "张")]),
    ]);
  }
  if (key === "boolean") {
    return wrap([
      rule("开启", [{ field: "prompt_extend", operator: "eq", value: true }]),
      rule("关闭", []),
    ]);
  }
  if (key === "volume") {
    return wrap([
      rule("第一档", [{ field: "count", operator: "lte", value: 25 }], [charge("count", "张")]),
      rule("第二档", [{ field: "count", operator: "lte", value: 125 }], [charge("count", "张")]),
      rule("第三档", [], [charge("count", "张")]),
    ]);
  }
  if (key === "video") {
    return wrap([
      rule("720P", [{ field: "resolution", operator: "eq", value: "720P" }], [charge("seconds", "秒")]),
      rule("1080P", [], [charge("seconds", "秒")]),
    ]);
  }
  return wrap([rule("默认")]);
}

function valueLiteral(value: UsageRuleCondition["value"]) {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const trimmed = value.trim();
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return trimmed;
  if (trimmed === "true" || trimmed === "false") return trimmed;
  return JSON.stringify(value);
}

function conditionExpression(condition: UsageRuleCondition) {
  const probe = `u(${JSON.stringify(condition.field.trim())})`;
  const operators = { eq: "==", ne: "!=", lt: "<", lte: "<=", gt: ">", gte: ">=" } as const;
  const comparison = `${probe} ${operators[condition.operator]} ${valueLiteral(condition.value)}`;
  return ["lt", "lte", "gt", "gte"].includes(condition.operator)
    ? `${probe} != nil && ${comparison}`
    : comparison;
}

export function usageRuleSetExpression(ruleSet: UsageRuleSet) {
  const scale = ruleSet.execution === "request" ? 1_000_000 : 1;
  const body = (item: UsagePriceRule) => {
    const parts = item.charges
      .filter((entry) => entry.price > 0)
      .map((entry) => {
        const divisor = entry.divisor || (entry.priceBasis === "million" ? 1_000_000 : unitDivisor(entry.unit));
        const price = Number((entry.price * scale / divisor).toPrecision(15));
        if (entry.meter === "request") return String(price);
        const measured = `u(${JSON.stringify(entry.meter.trim())})`;
        return `${measured} * ${price}`;
      });
    return `tier(${JSON.stringify(item.label.trim() || "default")}, ${parts.join(" + ") || "0"})`;
  };
  let expression = body(ruleSet.rules.at(-1)!);
  for (let index = ruleSet.rules.length - 2; index >= 0; index -= 1) {
    const item = ruleSet.rules[index];
    const condition = item.conditions.map(conditionExpression).join(" && ");
    expression = `${condition} ? ${body(item)} : ${expression}`;
  }
  return expression;
}

export function validateUsageRuleSet(ruleSet?: UsageRuleSet) {
  const rules = ruleSet?.rules || [];
  if (!rules.length || rules.at(-1)!.conditions.length || rules.slice(0, -1).some((item) => !item.conditions.length)) {
    return "The last pricing tier must be the condition-free fallback";
  }
  if (rules.some((item) => !item.label.trim() || !item.charges.length || item.conditions.some((condition) => !condition.field.trim()) || item.charges.some((entry) => !entry.meter.trim() || !Number.isFinite(entry.price) || entry.price < 0))) {
    return "Complete every tier, condition, meter and non-negative price";
  }
  return "";
}

function parseInputValue(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : value;
}

function ConditionValueEditor({
  condition,
  schema,
  onChange,
}: {
  condition: UsageRuleCondition;
  schema?: BillingUsageSchema;
  onChange: (value: string | number | boolean) => void;
}) {
  const { t } = useTranslation();
  const definition = schema?.[condition.field];
  if (definition?.enum?.length) {
    return (
      <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={String(condition.value)} onChange={(event) => onChange(event.target.value)}>
        {definition.enum.map((value) => <option value={value} key={value}>{value}</option>)}
      </select>
    );
  }
  if (definition?.type === "boolean" || ["prompt_extend", "audio"].includes(condition.field)) {
    return (
      <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={String(condition.value)} onChange={(event) => onChange(event.target.value === "true")}>
        <option value="true">{t("Enabled")}</option>
        <option value="false">{t("Disabled")}</option>
      </select>
    );
  }
  if (["resolution", "resolution_tier"].includes(condition.field)) {
    const matched = String(condition.value).trim().match(/^(\d+(?:\.\d+)?)\s*(DPI|K|P)$/i);
    const amount = matched?.[1] || "";
    const unit = (matched?.[2]?.toUpperCase() || "P") as "DPI" | "K" | "P";
    return (
      <div className="grid grid-cols-[minmax(80px,1fr)_76px] gap-2">
        <Input type="number" min={0} step="any" value={amount} placeholder="1080" onChange={(event) => onChange(event.target.value ? `${event.target.value}${unit}` : "")} />
        <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={unit} onChange={(event) => onChange(amount ? `${amount}${event.target.value}` : "")}>
          <option value="DPI">dpi</option><option value="K">K</option><option value="P">P</option>
        </select>
      </div>
    );
  }
  if (condition.field === "quality") {
    return (
      <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={String(condition.value)} onChange={(event) => onChange(event.target.value)}>
        <option value="standard">standard</option><option value="hd">hd</option>
      </select>
    );
  }
  return <Input value={String(condition.value)} placeholder={t("Condition value")} onChange={(event) => onChange(parseInputValue(event.target.value))} />;
}

export function UsageRuleBuilder({
  value,
  usageSchema,
  exchangeRate,
  currencySymbol,
  headerAction,
  onApply,
}: {
  value?: UsageRuleSet;
  usageSchema?: BillingUsageSchema;
  exchangeRate: number;
  currencySymbol: string;
  headerAction?: ReactNode;
  onApply: (ruleSet: UsageRuleSet, expression: string) => void;
}) {
  const { t } = useTranslation();
  const execution: UsageRuleSet["execution"] = usageSchema && Object.keys(usageSchema).length ? "task" : "request";
  const defaultTemplate: TemplateKey = execution === "task" ? "blank" : "image";
  const [rules, setRules] = useState<UsagePriceRule[]>(() => value?.rules || template(defaultTemplate, execution).rules);
  const [templateKey, setTemplateKey] = useState<TemplateKey>(defaultTemplate);
  useEffect(() => {
    setRules(value?.rules?.length ? value.rules : template(defaultTemplate, execution).rules);
  }, [value, execution, defaultTemplate]);
  useEffect(() => setTemplateKey(defaultTemplate), [defaultTemplate]);
  const fields = useMemo(
    () => execution === "task" ? Object.keys(usageSchema || {}) : requestFields,
    [usageSchema],
  );
  const meters = useMemo(
    () => ["request", ...fields.filter((field) => execution === "request"
      ? ["input_images", "output_images", "count", "characters", "seconds"].includes(field)
      : usageSchema?.[field]?.type === "number")],
    [execution, fields, usageSchema],
  );
  const commitRules = (nextRules: UsagePriceRule[]) => {
    setRules(nextRules);
    const next = {
      version: 1 as const,
      execution,
      rules: nextRules.map((item) => ({
        ...item,
        charges: item.charges.map((part) => ({
          ...part,
          priceBasis: execution === "task" && usageSchema?.[part.meter]?.unit === "token"
            ? "million" as const
            : "unit" as const,
          divisor: unitDivisor(part.unit),
        })),
      })),
    };
    onApply(next, usageRuleSetExpression(next));
  };
  const updateRule = (index: number, next: UsagePriceRule) => {
    const copy = [...rules]; copy[index] = next; commitRules(copy);
  };
  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{t("Advanced media pricing rules")}</div>
          <p className="mt-1 text-sm text-muted-foreground">{t("Build dynamic prices from request attributes and measured usage. Rules are checked from top to bottom; the final tier is the fallback.")}</p>
        </div>
        {headerAction}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("Pricing template")}</span>
          <select className="flex h-9 min-w-52 rounded-md border bg-background px-3 text-sm" value={templateKey} onChange={(event) => {
            const nextTemplate = event.target.value as TemplateKey;
            setTemplateKey(nextTemplate);
            commitRules(template(nextTemplate, execution).rules);
          }}>
            {execution === "request" && <option value="image">{t("Image resolution (1K/2K)")}</option>}
            {(execution === "request" || fields.includes("prompt_extend")) && <option value="boolean">{t("Boolean request option")}</option>}
            {(execution === "request" || fields.includes("count")) && <option value="volume">{t("Per-request quantity tiers")}</option>}
            {(execution === "request" || (fields.includes("resolution") && fields.includes("seconds"))) && <option value="video">{t("Video resolution per second")}</option>}
            <option value="blank">{t("Blank rule")}</option>
          </select>
        </label>
        <span className="text-xs text-muted-foreground">{execution === "task" ? t("Task usage settlement") : t("Synchronous request settlement")}</span>
      </div>
      <div className="space-y-3">
        {rules.map((item, ruleIndex) => (
          <div className="space-y-3 rounded-md border bg-background p-3" key={item.id}>
            <div className="flex items-center gap-2">
              <Input className="max-w-xs font-medium" value={item.label} placeholder={t("Tier name")} onChange={(event) => updateRule(ruleIndex, { ...item, label: event.target.value })} />
              <span className="text-xs text-muted-foreground">{ruleIndex === rules.length - 1 ? t("Fallback tier") : t("Tier {{number}}", { number: ruleIndex + 1 })}</span>
              <Button className="ml-auto" type="button" variant="ghost" size="icon" title={t("Delete tier")} disabled={rules.length === 1} onClick={() => commitRules(rules.filter((_, index) => index !== ruleIndex))}><Trash2 className="size-4" /></Button>
            </div>
            {ruleIndex < rules.length - 1 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">{t("Match all conditions")}</div>
                {item.conditions.map((condition, conditionIndex) => (
                  <div className="grid gap-2 sm:grid-cols-[minmax(120px,1fr)_110px_minmax(120px,1fr)_36px]" key={conditionIndex}>
                    <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={condition.field} onChange={(event) => { const field = event.target.value; const conditions = [...item.conditions]; conditions[conditionIndex] = { field, operator: "eq", value: defaultConditionValue(field, usageSchema) }; updateRule(ruleIndex, { ...item, conditions }); }}>{fields.map((field) => <option value={field} key={field}>{fieldLabels[field] ? `${t(fieldLabels[field])} (${field})` : field}</option>)}</select>
                    <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={condition.operator} onChange={(event) => { const conditions = [...item.conditions]; conditions[conditionIndex] = { ...condition, operator: event.target.value as UsageRuleCondition["operator"] }; updateRule(ruleIndex, { ...item, conditions }); }}>
                      <option value="eq">=</option><option value="ne">!=</option>
                      {(usageSchema?.[condition.field]?.type === "number" || ["input_images", "output_images", "count", "characters", "seconds"].includes(condition.field)) && <><option value="lte">≤</option><option value="lt">&lt;</option><option value="gte">≥</option><option value="gt">&gt;</option></>}
                    </select>
                    <ConditionValueEditor condition={condition} schema={usageSchema} onChange={(value) => { const conditions = [...item.conditions]; conditions[conditionIndex] = { ...condition, value }; updateRule(ruleIndex, { ...item, conditions }); }} />
                    <Button type="button" variant="ghost" size="icon" title={t("Delete condition")} onClick={() => updateRule(ruleIndex, { ...item, conditions: item.conditions.filter((_, index) => index !== conditionIndex) })}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="ghost" disabled={!fields.length} onClick={() => updateRule(ruleIndex, { ...item, conditions: [...item.conditions, { field: fields[0] || "", operator: "eq", value: defaultConditionValue(fields[0] || "", usageSchema) }] })}><Plus className="mr-1 size-4" />{t("Add condition")}</Button>
              </div>
            )}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{t("Charges in this tier")}</div>
              {item.charges.map((part, chargeIndex) => (
                <div className="grid gap-2 sm:grid-cols-[minmax(130px,1fr)_minmax(100px,1fr)_minmax(120px,1fr)_36px]" key={chargeIndex}>
                  <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={part.meter} onChange={(event) => { const meter = event.target.value; const charges = [...item.charges]; charges[chargeIndex] = { ...part, meter, unit: defaultUnit(meter, usageSchema) }; updateRule(ruleIndex, { ...item, charges }); }}>{meters.map((meter) => <option value={meter} key={meter}>{meter === "request" ? t("Per request") : fieldLabels[meter] ? `${t(fieldLabels[meter])} (${meter})` : meter}</option>)}</select>
                  <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={part.unit} onChange={(event) => { const charges = [...item.charges]; charges[chargeIndex] = { ...part, unit: event.target.value }; updateRule(ruleIndex, { ...item, charges }); }}>
                    {unitOptions(part.meter, usageSchema).map((unit) => <option value={unit} key={unit}>{unit}</option>)}
                  </select>
                  <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{currencySymbol}</span><Input className="pl-7" type="number" min={0} step="any" value={Number((part.price * exchangeRate).toPrecision(15))} onFocus={(event) => Number(event.currentTarget.value) === 0 && event.currentTarget.select()} onChange={(event) => { const charges = [...item.charges]; charges[chargeIndex] = { ...part, price: Math.max(0, Number(event.target.value) || 0) / exchangeRate }; updateRule(ruleIndex, { ...item, charges }); }} /></div>
                  <Button type="button" variant="ghost" size="icon" title={t("Delete charge")} disabled={item.charges.length === 1} onClick={() => updateRule(ruleIndex, { ...item, charges: item.charges.filter((_, index) => index !== chargeIndex) })}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => updateRule(ruleIndex, { ...item, charges: [...item.charges, charge()] })}><Plus className="mr-1 size-4" />{t("Add charge")}</Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!fields.length} onClick={() => {
          const next = rule(t("New pricing tier"), [{ field: fields[0] || "", operator: "eq", value: defaultConditionValue(fields[0] || "", usageSchema) }]);
          commitRules([...rules.slice(0, -1), next, rules.at(-1)!]);
        }}><CopyPlus className="mr-2 size-4" />{t("Add pricing tier")}</Button>
      </div>
    </div>
  );
}
