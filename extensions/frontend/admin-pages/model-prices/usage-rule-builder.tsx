import { useEffect, useMemo, useState } from "react";
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
import { usageRuleSetExpression } from "../../model-prices/usage-rule-expression";
import {
  formatPriceDecimal,
  priceFractionDigits,
} from "../../model-prices/price-precision";

export { usageRuleSetExpression } from "../../model-prices/usage-rule-expression";

export type TemplateKey = "image" | "outputImageCount" | "boolean" | "volume" | "video" | "videoAudio" | "videoMode" | "imageVideo" | "audioSeconds" | "ttsCharacters" | "voiceCount" | "taskMatrix" | "blank";
export const BILLING_TEMPLATE_KEYS: TemplateKey[] = ["image", "outputImageCount", "boolean", "volume", "video", "videoAudio", "videoMode", "imageVideo", "audioSeconds", "ttsCharacters", "voiceCount", "taskMatrix", "blank"];

const requestFields = [
  "resolution",
  "resolution_tier",
  "quality",
  "mode",
  "prompt_extend",
  "audio",
  "input_images",
  "output_images",
  "image_count",
  "seconds",
  "characters",
  "tts_input_characters",
  "tts_output_characters",
  "count",
  "task_type",
  "output_spec",
];

const fieldLabels: Record<string, string> = {
  resolution: "Output resolution",
  resolution_tier: "Output resolution tier",
  quality: "Quality",
  mode: "Mode",
  prompt_extend: "Prompt rewriting",
  audio: "Audio enabled",
  input_images: "Input image count",
  output_images: "Output image count",
  image_count: "Generated output image count",
  seconds: "Output video duration",
  characters: "Character count",
  tts_input_characters: "TTS input price",
  tts_output_characters: "TTS output price",
  count: "Quantity",
  task_type: "Task type",
  output_spec: "Output specification",
};

export function usageFieldLabel(field: string, templateKey: TemplateKey) {
  if (field === "seconds" && templateKey === "audioSeconds") {
    return "Audio duration";
  }
  return fieldLabels[field] || field;
}

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
  if (["characters", "tts_input_characters", "tts_output_characters"].includes(meter)) return "字符";
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
  if (["characters", "tts_input_characters", "tts_output_characters"].includes(meter)) return ["字符", "千字符", "万字符"];
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

export function syncExampleTierNames(rules: UsagePriceRule[], oldValue: UsageRuleCondition['value'], newValue: UsageRuleCondition['value']): UsagePriceRule[] {
  if (String(oldValue) === String(newValue) || String(newValue).trim() === "") return rules;
  const oldText = String(oldValue);
  const newText = String(newValue);
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return rules.map((item) => {
    if (typeof oldValue === "number" && typeof newValue === "number" &&
        item.label.startsWith(`${oldValue + 1} - `)) {
      return { ...item, label: `${newValue + 1}${item.label.slice(String(oldValue + 1).length)}` };
    }
    // Keep the displayed resolution when a numeric input is cleared mid-edit.
    // On the next keystroke, its label provides the previous complete value.
    const displayedResolution = item.label.match(/^\d+(?:\.\d+)?(?:DPI|K|P)(?=\s|$)/i)?.[0];
    const prior = displayedResolution && /^\d+(?:\.\d+)?(?:DPI|K|P)$/i.test(newText)
      ? displayedResolution : oldText;
    // A custom name does not start with a price-template threshold.
    if (!prior || !new RegExp(`^(?:[≤>\\s]*${escape(prior)}(?:\\b|\\s|$)|\\d+(?:\\.\\d+)?\\s*-\\s*${escape(prior)}(?:\\b|\\s|$))`, 'i').test(item.label)) return item;
    const oldBound = new RegExp(`(^|[^\\w.])${escape(prior)}(?![\\w.])`, 'gi');
    return { ...item, label: item.label.replace(oldBound, `$1${newText}`) };
  });
}

export function createUsageRuleTemplate(key: TemplateKey, execution: UsageRuleSet["execution"]): UsageRuleSet {
  const wrap = (rules: UsagePriceRule[]): UsageRuleSet => ({ version: 1, execution, rules });
  const generatedImageMeter = execution === "request" ? "image_count" : "output_images";
  if (key === "image") {
    return wrap([
      rule("1K", [{ field: "resolution_tier", operator: "eq", value: "1K" }], [
        charge("input_images", "张"), charge("output_images", "张"),
      ]),
      rule("其他图片分辨率", [], [charge("input_images", "张"), charge("output_images", "张")]),
    ]);
  }
  if (key === "outputImageCount") {
    return wrap([
      rule("按输出图片张数", [], [charge(generatedImageMeter, "张")]),
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
      rule("≤ 25 张", [{ field: generatedImageMeter, operator: "lte", value: 25 }], [charge(generatedImageMeter, "张", 0.3)]),
      rule("26 - 125 张", [{ field: generatedImageMeter, operator: "lte", value: 125 }], [charge(generatedImageMeter, "张", 0.275)]),
      rule("126 - 250 张", [{ field: generatedImageMeter, operator: "lte", value: 250 }], [charge(generatedImageMeter, "张", 0.25)]),
      rule("251 - 1250 张", [{ field: generatedImageMeter, operator: "lte", value: 1250 }], [charge(generatedImageMeter, "张", 0.225)]),
      rule("> 1250 张", [], [charge(generatedImageMeter, "张", 0.2)]),
    ]);
  }
  if (key === "video") {
    return wrap([
      rule("720P", [{ field: "resolution", operator: "eq", value: "720P" }], [charge("seconds", "秒")]),
      rule("其他视频分辨率", [], [charge("seconds", "秒")]),
    ]);
  }
  if (key === "videoAudio") {
    return wrap([
      rule("720P with audio", [{ field: "resolution", operator: "eq", value: "720P" }, { field: "audio", operator: "eq", value: true }], [charge("seconds", "秒")]),
      rule("1080P with audio", [{ field: "resolution", operator: "eq", value: "1080P" }, { field: "audio", operator: "eq", value: true }], [charge("seconds", "秒")]),
      rule("720P without audio", [{ field: "resolution", operator: "eq", value: "720P" }], [charge("seconds", "秒")]),
      rule("其他无声视频分辨率", [], [charge("seconds", "秒")]),
    ]);
  }
  if (key === "videoMode") return wrap([rule("Standard mode", [{ field: "mode", operator: "eq", value: "wan-std" }], [charge("seconds", "秒")]), rule("Professional mode", [], [charge("seconds", "秒")])]);
  if (key === "imageVideo") return wrap([rule("Input image", [{ field: "mode", operator: "eq", value: "image-input" }], [charge("input_images", "张")]), rule("480P output video", [{ field: "resolution", operator: "eq", value: "480P" }], [charge("seconds", "秒")]), rule("其他视频分辨率", [], [charge("seconds", "秒")])]);
  if (key === "audioSeconds") return wrap([rule("Audio duration", [], [charge("seconds", "秒")])]);
  if (key === "ttsCharacters") {
    return wrap([
      rule("按字符计费", [], [
        charge("tts_input_characters", "万字符", 0.8),
        charge("tts_output_characters", "万字符", 0),
      ]),
    ]);
  }
  if (key === "voiceCount") return wrap([rule("Voice enrollment", [], [charge("count", "音色")])]);
  if (key === "taskMatrix") {
    return wrap([
      rule("Text-to-3D / standard / no texture", [{ field: "task_type", operator: "eq", value: "text-to-3d" }, { field: "output_spec", operator: "eq", value: "standard-no-texture" }]),
      rule("Text-to-3D / standard / standard texture", [{ field: "task_type", operator: "eq", value: "text-to-3d" }, { field: "output_spec", operator: "eq", value: "standard-standard-texture" }]),
      rule("Text-to-3D / HD / HD texture", [{ field: "task_type", operator: "eq", value: "text-to-3d" }, { field: "output_spec", operator: "eq", value: "hd-hd-texture" }]),
      rule("Other task specification", []),
    ]);
  }
  return wrap([rule("默认")]);
}

function detectTemplateKey(value: UsageRuleSet | undefined, fallback: TemplateKey): TemplateKey {
  const rules = value?.rules || [];
  if (!rules.length) return fallback;
  const fields = new Set(rules.flatMap((item) => item.conditions.map((condition) => condition.field)));
  const meters = new Set(rules.flatMap((item) => item.charges.map((part) => part.meter)));
  if (meters.has("image_count") && !fields.has("image_count")) return "outputImageCount";
  if (meters.has("tts_input_characters") || meters.has("tts_output_characters")) return "ttsCharacters";
  if (fields.has("task_type") || fields.has("output_spec")) return "taskMatrix";
  if (meters.has("count") && !fields.has("output_images")) return "voiceCount";
  if (meters.has("seconds") && !fields.has("resolution") && !fields.has("mode")) return "audioSeconds";
  if (fields.has("resolution") && fields.has("audio")) return "videoAudio";
  if (fields.has("mode") && meters.has("input_images")) return "imageVideo";
  if (fields.has("mode") && meters.has("seconds")) return "videoMode";
  if (fields.has("resolution_tier") || (fields.has("resolution") && !meters.has("seconds"))) return "image";
  if (fields.has("resolution") && meters.has("seconds")) return "video";
  if (fields.has("output_images") || fields.has("image_count") || fields.has("count")) return "volume";
  if (fields.has("prompt_extend") || fields.has("audio")) return "boolean";
  return "blank";
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
  comparisonValue,
  priceMultiplier = 1,
  usageSchema,
  exchangeRate,
  currencySymbol,
  onApply,
}: {
  value?: UsageRuleSet;
  comparisonValue?: UsageRuleSet;
  priceMultiplier?: number;
  usageSchema?: BillingUsageSchema;
  exchangeRate: number;
  currencySymbol: string;
  onApply: (ruleSet: UsageRuleSet, expression: string) => void;
}) {
  const { t } = useTranslation();
  const execution: UsageRuleSet["execution"] = usageSchema && Object.keys(usageSchema).length ? "task" : "request";
  const defaultTemplate: TemplateKey = execution === "task" ? "blank" : "image";
  const [rules, setRules] = useState<UsagePriceRule[]>(() => value?.rules || createUsageRuleTemplate(defaultTemplate, execution).rules);
  const [templateKey, setTemplateKey] = useState<TemplateKey>(() => detectTemplateKey(value, defaultTemplate));
  const templateHelp: Record<TemplateKey, string> = {
    image: "Prices generated images by output resolution; input image count refers only to uploaded reference images.",
    outputImageCount: "Prices every generated output image at one configurable unit price.",
    boolean: "Prices the request according to whether the selected request option is enabled.",
    volume: "Prices each generated output image according to the output quantity tier.",
    video: "Prices generated video by output resolution and output duration.",
    videoAudio: "Prices generated video by output resolution, output duration and whether audio is enabled.",
    videoMode: "Prices generated video by output mode and duration.",
    imageVideo: "Prices uploaded images and generated video separately.",
    audioSeconds: "Use for generated audio or media tasks that provide seconds. For uploaded ASR or transcription audio, choose Uploaded audio transcription per second instead.",
    ttsCharacters: "Prices text-to-speech input per ten thousand Unicode characters; generated audio output is free.",
    voiceCount: "Prices voice enrollment by the number of voices.",
    taskMatrix: "Prices combinations of task type and output specification.",
    blank: "Build a custom rule from request attributes and measured output usage.",
  };
  useEffect(() => {
    setRules(value?.rules?.length ? value.rules : createUsageRuleTemplate(defaultTemplate, execution).rules);
    setTemplateKey(detectTemplateKey(value, defaultTemplate));
  }, [value, execution, defaultTemplate]);
  const fields = useMemo(
    () => execution === "task" ? Object.keys(usageSchema || {}) : requestFields,
    [usageSchema],
  );
  const meters = useMemo(
    () => ["request", ...fields.filter((field) => execution === "request"
      ? ["input_images", "output_images", "image_count", "count", "characters", "tts_input_characters", "tts_output_characters", "seconds"].includes(field)
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
      <div>
        <div>
          <div className="font-semibold">{t("Advanced media pricing rules")}</div>
          <p className="mt-1 text-sm text-muted-foreground">{t("Build dynamic prices from request attributes and measured usage. Rules are checked from top to bottom; the final tier is the fallback.")}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("Pricing template")}</span>
          <select className="flex h-9 min-w-52 rounded-md border bg-background px-3 text-sm" value={templateKey} onChange={(event) => {
            const nextTemplate = event.target.value as TemplateKey;
            setTemplateKey(nextTemplate);
            commitRules(createUsageRuleTemplate(nextTemplate, execution).rules);
          }}>
            {(execution === "request" || fields.includes("resolution_tier") || (fields.includes("resolution") && fields.includes("output_images"))) && <option value="image">{t("Output image resolution (1K/2K)")}</option>}
            {(execution === "request" || fields.includes("output_images") || fields.includes("image_count")) && <option value="outputImageCount">{t("Generated output images per image")}</option>}
            {(execution === "request" || fields.includes("prompt_extend")) && <option value="boolean">{t("Boolean request option")}</option>}
            {(execution === "request" || fields.includes("output_images") || fields.includes("count")) && <option value="volume">{t("Generated image quantity tiers")}</option>}
            {(execution === "request" || (fields.includes("resolution") && fields.includes("seconds"))) && <option value="video">{t("Output video resolution and duration")}</option>}
            {(execution === "request" || (fields.includes("resolution") && fields.includes("seconds") && fields.includes("audio"))) && <option value="videoAudio">{t("Video resolution, duration and audio switch")}</option>}
            {(execution === "request" || (fields.includes("mode") && fields.includes("seconds"))) && <option value="videoMode">{t("Video output mode and duration")}</option>}
            {(execution === "request" || (fields.includes("input_images") && fields.includes("resolution") && fields.includes("seconds"))) && <option value="imageVideo">{t("Input image and output video")}</option>}
            {(execution === "request" || fields.includes("seconds")) && <option value="audioSeconds">{t("Generated audio/media task duration pricing")}</option>}
            {(execution === "request" || fields.includes("tts_input_characters")) && <option value="ttsCharacters">{t("Text-to-speech per 10K characters")}</option>}
            {(execution === "request" || fields.includes("count")) && <option value="voiceCount">{t("Voice enrollment count")}</option>}
            {(execution === "request" || (fields.includes("task_type") && fields.includes("output_spec"))) && <option value="taskMatrix">{t("Task type and output specification matrix")}</option>}
            <option value="blank">{t("Blank rule")}</option>
          </select>
        </label>
        <span className="text-xs text-muted-foreground">{execution === "task" ? t("Task usage settlement") : t("Synchronous request settlement")}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t(templateHelp[templateKey])}</p>
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
                    <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={condition.field} onChange={(event) => { const field = event.target.value; const conditions = [...item.conditions]; conditions[conditionIndex] = { field, operator: "eq", value: defaultConditionValue(field, usageSchema) }; updateRule(ruleIndex, { ...item, conditions }); }}>{fields.map((field) => <option value={field} key={field}>{fieldLabels[field] ? `${t(usageFieldLabel(field, templateKey))} (${field})` : field}</option>)}</select>
                    <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={condition.operator} onChange={(event) => { const conditions = [...item.conditions]; conditions[conditionIndex] = { ...condition, operator: event.target.value as UsageRuleCondition["operator"] }; updateRule(ruleIndex, { ...item, conditions }); }}>
                      <option value="eq">=</option><option value="ne">!=</option>
                      {(usageSchema?.[condition.field]?.type === "number" || ["input_images", "output_images", "count", "characters", "tts_input_characters", "tts_output_characters", "seconds"].includes(condition.field)) && <><option value="lte">≤</option><option value="lt">&lt;</option><option value="gte">≥</option><option value="gt">&gt;</option></>}
                    </select>
                    <ConditionValueEditor condition={condition} schema={usageSchema} onChange={(value) => {
                      const conditions = [...item.conditions];
                      conditions[conditionIndex] = { ...condition, value };
                      const nextRules = [...rules];
                      nextRules[ruleIndex] = { ...item, conditions };
                      commitRules(syncExampleTierNames(nextRules, condition.value, value));
                    }} />
                    <Button type="button" variant="ghost" size="icon" title={t("Delete condition")} onClick={() => updateRule(ruleIndex, { ...item, conditions: item.conditions.filter((_, index) => index !== conditionIndex) })}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="ghost" disabled={!fields.length} onClick={() => updateRule(ruleIndex, { ...item, conditions: [...item.conditions, { field: fields[0] || "", operator: "eq", value: defaultConditionValue(fields[0] || "", usageSchema) }] })}><Plus className="mr-1 size-4" />{t("Add condition")}</Button>
              </div>
            )}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{t("Charges in this tier")}</div>
              {item.charges.map((part, chargeIndex) => {
                const vendorPart = comparisonValue?.rules[ruleIndex]?.charges.find(
                  (candidate) => candidate.meter === part.meter && candidate.unit === part.unit,
                );
                const actualPrice = part.price * priceMultiplier;
                const difference = vendorPart == null ? undefined : actualPrice - vendorPart.price;
                const fractionDigits = priceFractionDigits(
                  templateKey === "audioSeconds" && part.meter === "seconds",
                );
                return (
                <div className="grid gap-2 sm:grid-cols-[minmax(130px,1fr)_minmax(100px,1fr)_minmax(120px,1fr)_36px]" key={chargeIndex}>
                  <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={part.meter} onChange={(event) => { const meter = event.target.value; const charges = [...item.charges]; charges[chargeIndex] = { ...part, meter, unit: defaultUnit(meter, usageSchema) }; updateRule(ruleIndex, { ...item, charges }); }}>{meters.map((meter) => <option value={meter} key={meter}>{meter === "request" ? t("Per request") : t(usageFieldLabel(meter, templateKey))}</option>)}</select>
                  <select className="flex h-9 rounded-md border bg-background px-2 text-sm" value={part.unit} onChange={(event) => { const charges = [...item.charges]; charges[chargeIndex] = { ...part, unit: event.target.value }; updateRule(ruleIndex, { ...item, charges }); }}>
                    {unitOptions(part.meter, usageSchema).map((unit) => <option value={unit} key={unit}>{unit}</option>)}
                  </select>
                  <div className="space-y-1">
                    <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{currencySymbol}</span><Input className="pl-7" type="number" min={0} step="any" value={Number((part.price * exchangeRate).toPrecision(15))} onFocus={(event) => Number(event.currentTarget.value) === 0 && event.currentTarget.select()} onChange={(event) => { const charges = [...item.charges]; charges[chargeIndex] = { ...part, price: Math.max(0, Number(event.target.value) || 0) / exchangeRate }; updateRule(ruleIndex, { ...item, charges }); }} /></div>
                    {vendorPart ? (
                      <div className="text-xs text-muted-foreground">
                        {t("Vendor price")}: {currencySymbol}{formatPriceDecimal(vendorPart.price * exchangeRate, fractionDigits)}
                        <span className={difference! > 0 ? "ml-2 text-rose-500" : difference! < 0 ? "ml-2 text-emerald-500" : "ml-2"}>
                          {t("Difference")}: {difference! > 0 ? "+" : ""}{currencySymbol}{formatPriceDecimal(difference! * exchangeRate, fractionDigits)}
                        </span>
                      </div>
                    ) : <div className="text-xs text-muted-foreground">{t("Vendor price is not set")}</div>}
                  </div>
                  <Button type="button" variant="ghost" size="icon" title={t("Delete charge")} disabled={item.charges.length === 1} onClick={() => updateRule(ruleIndex, { ...item, charges: item.charges.filter((_, index) => index !== chargeIndex) })}><Trash2 className="size-4" /></Button>
                </div>
                );
              })}
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
