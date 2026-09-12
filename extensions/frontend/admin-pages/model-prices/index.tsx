import {
  ExternalLink,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getSitePricingCurrency,
  isValidPricingCurrency,
  USD_PRICING_CURRENCY,
} from "@/features/model-pricing/currency";
import { PricingAmountInput } from "@/features/model-pricing/pricing-amount-input";
import { PricingCurrencySelector } from "@/features/model-pricing/pricing-currency-selector";
import { getModelPricing } from "@/features/model-pricing/api";
import { getVendors } from "@/features/models/api";
import { combineBillingExpr, splitBillingExprAndRequestRules } from "@/features/pricing/lib/billing-expr";
import type { BillingUsageSchema } from "@/features/pricing/types";
import { TieredPricingEditor } from "@/features/system-settings/models/tiered-pricing-editor";
import { api } from "@/lib/api";
import { useSystemConfigStore } from "@/stores/system-config-store";
import { usePricingPreferencesStore } from "@/stores/pricing-preferences-store";
import { PriceRenderer } from "../../model-prices/price-renderer";
import type { ModelPrice, PriceSpec } from "../../model-prices/types";
import { ModelPriceSyncDialog } from "./sync-dialog";
import {
  RuntimePricingEditor,
  type RuntimePricingEditorHandle,
} from "./runtime-pricing-editor";
import { UsageRuleBuilder, validateUsageRuleSet } from "./usage-rule-builder";

const empty: ModelPrice = {
  id: 0,
  modelKey: "",
  displayName: "",
  description: "",
  vendor: "",
  tags: [],
  currency: "CNY",
  timezone: "Asia/Shanghai",
  vendorPriceSpec: {
    mode: "token",
    blocks: [{ input: 0, output: 0, unit: "1M tokens" }],
  },
  llmapiPriceSpec: {
    mode: "token",
    blocks: [{ input: 0, output: 0, unit: "1M tokens" }],
  },
  runtimePricingRef: {},
  syncStatus: "idle",
  published: false,
  sortOrder: 0,
};
function SpecEditor({
  value,
  onChange,
  source,
  modelKey,
}: {
  value: PriceSpec;
  onChange: (v: PriceSpec) => void;
  source?: string;
  modelKey: string;
}) {
  const { t } = useTranslation();
  const [usageSchema, setUsageSchema] = useState<BillingUsageSchema | undefined>();
  useEffect(() => {
    if (!modelKey) {
      setUsageSchema(undefined);
      return;
    }
    void getModelPricing([modelKey])
      .then((data) => setUsageSchema(data.entries.find((entry) => entry.model_name === modelKey)?.usage_schema))
      .catch(() => setUsageSchema(undefined));
  }, [modelKey]);
  const currencyConfig = useSystemConfigStore(
    (state) => state.config.currency,
  );
  const currencyPreference = usePricingPreferencesStore(
    (state) => state.currency,
  );
  const siteCurrency = useMemo(
    () => getSitePricingCurrency(currencyConfig),
    [currencyConfig],
  );
  const pricingCurrency =
    currencyPreference === "site" && isValidPricingCurrency(siteCurrency)
      ? siteCurrency
      : USD_PRICING_CURRENCY;
  const cnyExchangeRate = currencyConfig.usdExchangeRate;
  const showCnyHint = pricingCurrency.label === "USD";
  const cnyHint = (usd: number | null | undefined) => {
    const amount = Number(usd);
    const rate = Number(cnyExchangeRate);
    if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) {
      return t("CNY conversion unavailable");
    }
    return `${t("Approximate CNY")}: ${new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount * rate)}`;
  };
  const blocks = (value.blocks?.length ? value.blocks : [{}]).map((block) => {
    if (block.input != null || !block.table?.rows?.length) return block;
    const fields = Object.fromEntries(block.table.rows);
    const number = (key: string) => {
      const parsed = Number(fields[key]);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const input = (number("model_ratio") ?? 0) * 2 || undefined;
    if (input == null) return block;
    const scaled = (key: string) => {
      const ratio = number(key);
      return ratio == null ? null : input * ratio;
    };
    const audioInput = scaled("audio_ratio");
    const audioOutputRatio = number("audio_completion_ratio");
    return {
      ...block,
      input,
      output: scaled("completion_ratio"),
      cache: scaled("cache_ratio"),
      createCache: scaled("create_cache_ratio"),
      image: scaled("image_ratio"),
      audioInput,
      audioOutput:
        audioInput == null || audioOutputRatio == null
          ? null
          : audioInput * audioOutputRatio,
    };
  });
  const mode = value.blocks?.[0]?.usageRuleSet
    ? "media"
    : value.mode === "request"
      ? "request"
      : value.mode === "expression"
        ? "expression"
        : "token";
  const lanes = [
    ["output", "Completion price"],
    ["cache", "Cache read price"],
    ["createCache", "Cache write price"],
    ["image", "Image input price"],
    ["audioInput", "Audio input price"],
    ["audioOutput", "Audio output price"],
  ] as const;
  const set = (i: number, key: string, v: unknown) =>
    onChange({
      ...value,
      blocks: blocks.map((b, j) => (j === i ? { ...b, [key]: v } : b)),
    });
  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/20 p-3 text-sm">
        <div className="font-medium">{t("Upstream source")}</div>
        <div className="mt-1 text-muted-foreground">
          {source || t("Manually maintained")}
        </div>
        {Array.from(new Set(blocks.map((block) => block.note?.startsWith("http") ? block.note.split("\n")[0] : "").filter(Boolean))).map((url) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-primary underline">{url}</a>
        ))}
      </div>
      <PricingCurrencySelector
        siteCurrency={siteCurrency}
        onValueChange={(pricingCurrency) =>
          onChange({ ...value, pricingCurrency })
        }
      />
      <Tabs
        value={mode}
        onValueChange={(next) => {
          if (next === "media") {
            onChange({
              ...value,
              mode: "expression",
              blocks: [{
                label: "Expression",
                usageRuleSet: { version: 1, execution: usageSchema ? "task" : "request", rules: [] },
              }],
            });
            return;
          }
          const cleanBlocks = blocks.map(({ usageRuleSet: _usageRuleSet, ...block }) => block);
          onChange({ ...value, mode: next as PriceSpec["mode"], blocks: cleanBlocks });
        }}
      >
        <TabsList className="grid h-auto w-full max-w-3xl grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="token">{t("Per-token")}</TabsTrigger>
          <TabsTrigger value="request">{t("Per-request")}</TabsTrigger>
          <TabsTrigger value="expression">{t("Expression")}</TabsTrigger>
          <TabsTrigger value="media">{t("Advanced media pricing rules")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === "media" && (
        <UsageRuleBuilder
          value={value.blocks?.[0]?.usageRuleSet}
          usageSchema={usageSchema}
          exchangeRate={pricingCurrency.exchangeRate}
          currencySymbol={pricingCurrency.symbol}
          onApply={(usageRuleSet, expression) => onChange({
            ...value,
            mode: "expression",
            blocks: [{ label: "Expression", note: expression, baseExpression: expression, usageRuleSet }],
          })}
        />
      )}
      {mode !== "media" && blocks.map((b, i) => (
        <div
          className="grid gap-3 rounded-md border bg-muted/20 p-4 md:grid-cols-2"
          key={i}
        >
          {blocks.length > 1 && b.label && (
            <div className="rounded-md border bg-muted px-3 py-2 text-sm md:col-span-2">
              <div className="text-xs text-muted-foreground">{t("Price source")}</div>
              <div className="mt-1 font-medium">{b.label}</div>
            </div>
          )}
          {mode === "token" && (
            <label className="space-y-1 text-sm md:col-span-2">
              <span>{t("Input price")}</span>
              <span className="flex flex-wrap items-center gap-2">
                <PricingAmountInput
                  className="min-w-56 flex-1"
                  currency={pricingCurrency}
                  placeholder={t("Input price")}
                  value={b.input ?? ""}
                  onChange={(next) => set(i, "input", Number(next))}
                />
                {showCnyHint && <span className="shrink-0 text-xs font-medium text-foreground/75">{cnyHint(b.input)}</span>}
              </span>
              <span className="block text-xs text-muted-foreground">{pricingCurrency.label} / 1M tokens</span>
            </label>
          )}
          {mode === "request" && (
            <label className="space-y-1 text-sm md:col-span-2">
              <span>{t("Price")}</span>
              <span className="flex flex-wrap items-center gap-2">
                <PricingAmountInput
                  className="min-w-56 flex-1"
                  currency={pricingCurrency}
                  placeholder={t("Price")}
                  value={b.price ?? ""}
                  onChange={(next) => set(i, "price", Number(next))}
                />
                {showCnyHint && <span className="shrink-0 text-xs font-medium text-foreground/75">{cnyHint(b.price)}</span>}
              </span>
              <span className="block text-xs text-muted-foreground">{pricingCurrency.label} / request</span>
            </label>
          )}
          {mode === "expression" && (
            <div className="space-y-2 overflow-visible md:col-span-2 [&_[role=region]]:!overflow-visible [&_[role=region]]:!overscroll-auto [&_aside]:!static">
              <div className="text-sm font-medium">{t("Pricing expression")}</div>
              {(() => {
                const expression = splitBillingExprAndRequestRules(b.note || "");
                return (
                  <TieredPricingEditor
                    currency={pricingCurrency}
                    modelName={value.blocks?.[i]?.label}
                    billingExpr={expression.billingExpr}
                    requestRuleExpr={expression.requestRuleExpr}
                    onBillingExprChange={(next) =>
                      set(i, "note", combineBillingExpr(next, expression.requestRuleExpr))
                    }
                    onRequestRuleExprChange={(next) =>
                      set(i, "note", combineBillingExpr(expression.billingExpr, next))
                    }
                    cnyExchangeRate={showCnyHint ? cnyExchangeRate : undefined}
                  />
                );
              })()}
              <div className="text-xs text-muted-foreground">
                {t("Use the same billing expression syntax as actual pricing.")}
              </div>
            </div>
          )}
          {mode === "token" && lanes.map(([field, title]) => {
            const enabled = b[field] != null;
            return (
              <div className="rounded-md border bg-background p-3" key={field}>
                <label className="mb-3 flex items-center justify-between gap-2 font-medium">
                  {t(title)}
                  <Switch checked={enabled} onCheckedChange={(checked) => set(i, field, checked ? 0 : null)} />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <PricingAmountInput className="min-w-40 flex-1" currency={pricingCurrency} disabled={!enabled} value={b[field] ?? ""} onChange={(next) => set(i, field, Number(next))} />
                  {enabled && showCnyHint && <span className="shrink-0 text-xs font-medium text-foreground/75">{cnyHint(b[field])}</span>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{pricingCurrency.label} / 1M tokens</div>
              </div>
            );
          })}
          {b.table?.rows?.length ? (
            <textarea
              className="min-h-24 rounded-md border bg-muted p-2 md:col-span-2"
              placeholder={t("One line per item, separated by |")}
              value={[
                b.table?.headers?.join("|"),
                ...(b.table?.rows || []).map((r) => r.join("|")),
              ]
                .filter(Boolean)
                .join("\n")}
              readOnly
            />
          ) : null}
          {mode !== "expression" && <label className="space-y-1 text-sm md:col-span-2">
            <span>{t("Notes")}</span>
            <Input
            placeholder={t("Note")}
            value={b.note || ""}
            onChange={(e) => set(i, "note", e.target.value)}
          />
          </label>}
          <Button
            type="button"
            variant="destructive"
            size="sm" className="md:col-span-2"
            onClick={() =>
              onChange({ ...value, blocks: blocks.filter((_, j) => j !== i) })
            }
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function ModelPriceManagementPage() {
  const { t } = useTranslation();
  const runtimePricingEditorRef = useRef<RuntimePricingEditorHandle>(null);
  const [rows, setRows] = useState<ModelPrice[]>([]),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState<"all" | "local" | "unset">("all"),
    [vendorFilter, setVendorFilter] = useState("all"),
    [edit, setEdit] = useState<ModelPrice | null>(null),
    [vendorNames, setVendorNames] = useState<string[]>([]),
    [tab, setTab] = useState<"vendor" | "ours">("vendor"),
    [syncOpen, setSyncOpen] = useState(false),
    [syncModel, setSyncModel] = useState<string | undefined>();
  const load = () =>
    void api
      .get("/api/platform/admin/model-prices", { params: { q } })
      .then((r) => setRows(r.data.data || []));
  useEffect(load, [q]);
  useEffect(() => {
    void getVendors({ page_size: 1000 })
      .then((response) => {
        if (!response.success) throw new Error(response.message || t("Failed to load vendors"));
        setVendorNames(
          [...new Set((response.data?.items || []).map((vendor) => vendor.name.trim()).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right)),
        );
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : t("Failed to load vendors")));
  }, [t]);
  const shown = useMemo(
    () =>
      rows.filter((row) => {
        const local = row.runtimePricingRef?.source === "new-api";
        const unset = !row.llmapiPriceSpec?.blocks?.length;
        return (
          (vendorFilter === "all" || row.vendor === vendorFilter) &&
          (filter === "all" ||
            (filter === "local" && local) ||
            (filter === "unset" && local && unset))
        );
      }),
    [rows, filter, vendorFilter],
  );
  const save = async () => {
    if (!edit) return;
    const vendorRules = edit.vendorPriceSpec?.blocks?.[0]?.usageRuleSet;
    if (vendorRules) {
      const validationError = validateUsageRuleSet(vendorRules);
      if (validationError) {
        toast.error(t(validationError));
        return;
      }
    }
    if (edit.id) {
      await api.put(`/api/platform/admin/model-prices/${edit.id}`, edit);
      setEdit({ ...edit });
    } else {
      const response = await api.post("/api/platform/admin/model-prices", edit);
      setEdit({ ...edit, id: response.data?.data?.id || 0 });
    }
    toast.success(t("Save"));
    load();
  };
  return (
    <div className="min-h-0 w-full min-w-0 flex-1 overflow-auto p-5 [scrollbar-gutter:stable]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {t("Model price management")}
        </h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              window.location.assign("/system-settings/billing/model-pricing")
            }
          >
            <ExternalLink className="mr-2 size-4" />
            {t("Open runtime pricing")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSyncModel(undefined);
              setSyncOpen(true);
            }}
          >
            <RefreshCcw className="mr-2 size-4" />
            {t("Upstream price sync")}
          </Button>
          <Button onClick={() => setEdit({ ...empty })}>
            <Plus className="mr-2 size-4" />
            {t("Add model")}
          </Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative w-full max-w-lg">
          <Input
            className="pr-10"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Search models")}
          />
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <select
          className="h-10 rounded-md border bg-background px-3"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="all">{t("All models")}</option>
          <option value="local">{t("Existing local models")}</option>
          <option value="unset">{t("Models without pricing")}</option>
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3"
          value={vendorFilter}
          onChange={(event) => setVendorFilter(event.target.value)}
        >
          <option value="all">{t("All vendors")}</option>
          {[...new Set([...vendorNames, ...rows.map((row) => row.vendor)].filter(Boolean))]
            .sort((left, right) => left.localeCompare(right))
            .map((vendor) => <option value={vendor} key={vendor}>{vendor}</option>)}
        </select>
        <span className="self-center text-sm text-muted-foreground">
          {shown.length} {t("models")}
        </span>
      </div>
      <div className="w-full min-w-0 rounded-lg border">
        <table className="w-full min-w-[1180px] table-fixed text-sm">
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="p-3 text-left">{t("Model name")}</th>
              <th className="p-3 text-left">{t("Vendor")}</th>
              <th className="p-3 text-left">{t("Display currency")}</th>
              <th className="p-3 text-left">{t("Vendor original price")}</th>
              <th className="p-3 text-left">
                {t("Actual price")}
              </th>
              <th className="p-3">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              return (
                <tr
                  key={r.id}
                  className="border-t align-top hover:bg-muted/30"
                >
                  <td className="min-w-0 overflow-hidden p-3 font-medium">
                    <HoverCard>
                      <HoverCardTrigger
                        delay={150}
                        closeDelay={600}
                        render={<div className="min-w-0 cursor-text" />}
                      >
                        <div className="truncate">{r.displayName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {r.modelKey}
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent
                        align="start"
                        side="right"
                        className="w-auto max-w-md select-text break-words"
                      >
                        <div className="font-medium">{r.displayName}</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          {r.modelKey}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                    {r.syncStatus === "changed" && (
                      <span className="text-xs text-amber-600">
                        {t("Upstream price changed")}
                      </span>
                    )}
                  </td>
                  <td className="p-3">{r.vendor}</td>
                  <td className="p-3">
                    <span className="inline-flex rounded border bg-muted px-2 py-1 text-xs font-medium">
                      {r.currency === "USD" ? "USD ($)" : "CNY (¥)"}
                    </span>
                  </td>
                  <td className="min-w-0 overflow-hidden p-3 align-top">
                    <div className="min-w-0 max-w-full overflow-hidden">
                      <PriceRenderer
                        spec={r.vendorPriceSpec}
                        timezone={r.timezone}
                        pricesOnly
                        displayCurrency={r.currency}
                        showMarkup
                        compact
                      />
                    </div>
                  </td>
                  <td className="min-w-0 overflow-hidden p-3 align-top">
                    <div className="min-w-0 max-w-full overflow-hidden">
                      <PriceRenderer
                        spec={r.llmapiPriceSpec}
                        timezone={r.timezone}
                        compareSpec={r.vendorPriceSpec}
                        displayCurrency={r.currency}
                        showMarkup
                        compact
                      />
                    </div>
                  </td>
                  <td className="whitespace-nowrap p-3 text-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEdit(r)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (r.runtimePricingRef?.source === "new-api") {
                          toast.error(t("Synchronized models cannot be deleted here. Remove the model in model management, or turn off public visibility."));
                          return;
                        }
                        if (confirm(t("Delete"))) {
                          try {
                            const response = await api.delete(
                              `/api/platform/admin/model-prices/${r.id}`,
                            );
                            if (!response.data?.success) throw new Error(response.data?.message || t("Delete failed"));
                            toast.success(t("Deleted successfully"));
                            load();
                          } catch (error) {
                            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
                            toast.error(message || (error instanceof Error ? error.message : t("Delete failed")));
                          }
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ModelPriceSyncDialog
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        onDone={load}
        modelKey={syncModel}
      />
      {edit && (
        <div className="fixed inset-0 z-50 flex min-h-0 justify-center overflow-hidden bg-black/55 p-4 md:p-8">
          <div className="flex max-h-full w-full max-w-6xl min-h-0 flex-col overflow-hidden rounded-lg bg-background shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b bg-background p-5">
              <h2 className="text-xl font-semibold">
                {edit.id ? edit.displayName : t("Add model")}
              </h2>
              <div className="flex gap-2">
                {edit.id > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSyncModel(edit.modelKey);
                      setSyncOpen(true);
                    }}
                  >
                    <RefreshCcw className="mr-2 size-4" />
                    {t("Upstream price sync")}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setEdit(null)}>
                  {t("Cancel")}
                </Button>
                <Button
                  onClick={() => {
                    if (tab !== "ours") {
                      void save();
                      return;
                    }
                    if (!runtimePricingEditorRef.current) {
                      toast.error(t("Pricing editor is still loading"));
                      return;
                    }
                    void runtimePricingEditorRef.current.save();
                  }}
                >
                  {t("Save")}
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 [scrollbar-gutter:stable]">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1 text-sm"><span>{t("Model key")}</span><Input
                  placeholder={t("Model key")}
                  value={edit.modelKey}
                  disabled={edit.id > 0}
                  onChange={(e) =>
                    setEdit({ ...edit, modelKey: e.target.value })
                  }
                /><span className="block text-xs text-muted-foreground">{t("The model key is used for API requests and cannot be changed after creation.")}</span></label>
                <label className="space-y-1 text-sm"><span>{t("Display name")}</span><Input
                  placeholder={t("Display name")}
                  value={edit.displayName}
                  onChange={(e) =>
                    setEdit({ ...edit, displayName: e.target.value })
                  }
                /></label>
                <label className="space-y-1 text-sm md:col-span-2"><span>{t("Model description")}</span><Input
                  placeholder={t("Displayed below the model name on the public price page")}
                  value={edit.description || ""}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                /></label>
                <label className="space-y-1 text-sm">
                  <span>{t("Vendor")}</span>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={edit.vendor}
                    onChange={(event) => setEdit({ ...edit, vendor: event.target.value })}
                  >
                    <option value="" disabled>{t("Select vendor")}</option>
                    {edit.vendor && !vendorNames.includes(edit.vendor) && (
                      <option value={edit.vendor}>{edit.vendor} ({t("Historical value")})</option>
                    )}
                    {vendorNames.map((vendor) => <option value={vendor} key={vendor}>{vendor}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm"><span>{t("Tags")}</span><Input
                  placeholder={t("Tags")}
                  value={(edit.tags || []).join(",")}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      tags: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                /></label>
                <label className="space-y-1 text-sm">
                  <span>{t("Display currency")}</span>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={edit.currency || "CNY"}
                    onChange={(event) =>
                      setEdit({ ...edit, currency: event.target.value })
                    }
                  >
                    <option value="CNY">{t("Chinese yuan (CNY)")}</option>
                    <option value="USD">{t("US dollar (USD)")}</option>
                  </select>
                  <span className="block text-xs text-muted-foreground">
                    {t("Controls the currency shown on the public model price page.")}
                  </span>
                </label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm"><div className="text-xs text-muted-foreground">{t("Pricing timezone")}</div><div className="mt-1 font-medium">{edit.timezone}</div></div>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <input
                    type="checkbox"
                    checked={edit.published}
                    onChange={(e) =>
                      setEdit({ ...edit, published: e.target.checked })
                    }
                  />
                  {t("Published")}
                  <span className="text-xs text-muted-foreground">{t("Controls public price page visibility only")}</span>
                </label>
              </div>
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                {t(
                  "Vendor pricing is for comparison. LLMAPI pricing writes to the active runtime billing configuration.",
                )}
                <div className="mt-1">{t("USD is the storage currency; displayed amounts follow the system exchange rate. The timezone is used only for active time-window pricing.")}</div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={tab === "vendor" ? "default" : "outline"}
                  onClick={() => setTab("vendor")}
                >
                  {t("Vendor original price")}
                </Button>
                <Button
                  variant={tab === "ours" ? "default" : "outline"}
                  onClick={() => setTab("ours")}
                >
                  {t("Actual price")}
                </Button>
              </div>
              {tab === "vendor" ? (
                <SpecEditor
                  value={edit.vendorPriceSpec}
                  onChange={(v) => setEdit({ ...edit, vendorPriceSpec: v })}
                  source={edit.upstreamSource}
                  modelKey={edit.modelKey}
                />
              ) : (
                <RuntimePricingEditor
                  ref={runtimePricingEditorRef}
                  modelKey={edit.modelKey}
                  vendorPriceSpec={edit.vendorPriceSpec}
                  currentPriceSpec={edit.llmapiPriceSpec}
                  onSaved={async (spec) => {
                    const next = { ...edit, llmapiPriceSpec: spec };
                    if (edit.id) {
                      await api.put(
                        `/api/platform/admin/model-prices/${edit.id}`,
                        next,
                      );
                      setEdit(next);
                    } else {
                      const response = await api.post(
                        "/api/platform/admin/model-prices",
                        next,
                      );
                      setEdit({ ...next, id: response.data?.data?.id || 0 });
                    }
                    load();
                  }}
                />
              )}
              {edit.pendingVendorSpec && (
                <div className="rounded-md border border-amber-500 p-4">
                  <div className="mb-3 font-medium">
                    {t("Upstream price changed")}
                  </div>
                  <div className="space-y-3">
                    {(edit.pendingVendorSpec.blocks || []).map((block, blockIndex) => (
                      <div className="rounded-md border bg-background p-3" key={`${block.label || "source"}-${blockIndex}`}>
                        <PriceRenderer
                          spec={{ mode: edit.pendingVendorSpec?.mode, blocks: [block] }}
                          timezone={edit.timezone}
                          displayCurrency={edit.currency}
                        />
                        <Button className="mt-3" onClick={async () => {
                          await api.post(`/api/platform/admin/model-prices/${edit.id}/apply-sync`, { blockIndex });
                          toast.success(t("Save"));
                          const mode = block.price != null
                            ? "request"
                            : block.input != null
                              ? "token"
                              : edit.pendingVendorSpec?.mode;
                          setEdit({
                            ...edit,
                            vendorPriceSpec: { mode, blocks: [block] },
                            pendingVendorSpec: null,
                            upstreamSource: block.label?.trim() || edit.upstreamSource,
                            syncStatus: "applied",
                          });
                          load();
                        }}>
                          {t("Apply this vendor price")}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
