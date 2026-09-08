import {
  ExternalLink,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { combineBillingExpr, splitBillingExprAndRequestRules } from "@/features/pricing/lib/billing-expr";
import { TieredPricingEditor } from "@/features/system-settings/models/tiered-pricing-editor";
import { api } from "@/lib/api";
import { useSystemConfigStore } from "@/stores/system-config-store";
import { PriceRenderer } from "../../model-prices/price-renderer";
import type { ModelPrice, PriceSpec } from "../../model-prices/types";
import { ModelPriceSyncDialog } from "./sync-dialog";
import { RuntimePricingEditor } from "./runtime-pricing-editor";

const empty: ModelPrice = {
  id: 0,
  modelKey: "",
  displayName: "",
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
}: {
  value: PriceSpec;
  onChange: (v: PriceSpec) => void;
  source?: string;
}) {
  const { t } = useTranslation();
  const cnyExchangeRate = useSystemConfigStore(
    (state) => state.config.currency.usdExchangeRate,
  );
  const cnyHint = (usd: number | null | undefined) => {
    const amount = Number(usd);
    const rate = Number(cnyExchangeRate);
    if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) {
      return t("CNY conversion unavailable");
    }
    return `${t("Approximate CNY")}: ${new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
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
  const mode =
    value.mode === "request"
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
      <Tabs
        value={mode}
        onValueChange={(next) =>
          onChange({ mode: next as PriceSpec["mode"], blocks })
        }
      >
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="token">{t("Per-token")}</TabsTrigger>
          <TabsTrigger value="request">{t("Per-request")}</TabsTrigger>
          <TabsTrigger value="expression">{t("Expression")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {blocks.map((b, i) => (
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
                <Input
                  className="min-w-56 flex-1"
                  type="number"
                  step="any"
                  placeholder={t("Input price")}
                  value={b.input ?? ""}
                  onChange={(e) => set(i, "input", Number(e.target.value))}
                />
                <span className="shrink-0 text-xs font-medium text-foreground/75">{cnyHint(b.input)}</span>
              </span>
              <span className="block text-xs text-muted-foreground">USD / 1M tokens</span>
            </label>
          )}
          {mode === "request" && (
            <label className="space-y-1 text-sm md:col-span-2">
              <span>{t("Price")}</span>
              <span className="flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-56 flex-1"
                  type="number"
                  step="any"
                  placeholder={t("Price")}
                  value={b.price ?? ""}
                  onChange={(e) => set(i, "price", Number(e.target.value))}
                />
                <span className="shrink-0 text-xs font-medium text-foreground/75">{cnyHint(b.price)}</span>
              </span>
              <span className="block text-xs text-muted-foreground">USD / request</span>
            </label>
          )}
          {mode === "expression" && (
            <div className="space-y-2 md:col-span-2">
              <div className="text-sm font-medium">{t("Pricing expression")}</div>
              {(() => {
                const expression = splitBillingExprAndRequestRules(b.note || "");
                return (
                  <TieredPricingEditor
                    modelName={value.blocks?.[i]?.label}
                    billingExpr={expression.billingExpr}
                    requestRuleExpr={expression.requestRuleExpr}
                    onBillingExprChange={(next) =>
                      set(i, "note", combineBillingExpr(next, expression.requestRuleExpr))
                    }
                    onRequestRuleExprChange={(next) =>
                      set(i, "note", combineBillingExpr(expression.billingExpr, next))
                    }
                    cnyExchangeRate={cnyExchangeRate}
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
                  <Input className="min-w-40 flex-1" type="number" step="any" disabled={!enabled} value={b[field] ?? ""} onChange={(e) => set(i, field, Number(e.target.value))} />
                  {enabled && <span className="shrink-0 text-xs font-medium text-foreground/75">{cnyHint(b[field])}</span>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">USD / 1M tokens</div>
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
  const [rows, setRows] = useState<ModelPrice[]>([]),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState<"all" | "local" | "unset">("all"),
    [edit, setEdit] = useState<ModelPrice | null>(null),
    [tab, setTab] = useState<"vendor" | "ours">("vendor"),
    [syncOpen, setSyncOpen] = useState(false),
    [syncModel, setSyncModel] = useState<string | undefined>();
  const load = () =>
    void api
      .get("/api/platform/admin/model-prices", { params: { q } })
      .then((r) => setRows(r.data.data || []));
  useEffect(load, [q]);
  const shown = useMemo(
    () =>
      rows.filter((row) => {
        const local = row.runtimePricingRef?.source === "new-api";
        const unset = !row.llmapiPriceSpec?.blocks?.length;
        return (
          filter === "all" ||
          (filter === "local" && local) ||
          (filter === "unset" && local && unset)
        );
      }),
    [rows, filter],
  );
  const save = async () => {
    if (!edit) return;
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
        <span className="self-center text-sm text-muted-foreground">
          {shown.length} {t("models")}
        </span>
      </div>
      <div className="w-max min-w-full rounded-lg border">
        <table className="w-max min-w-full table-auto text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="p-3 text-left">{t("Model name")}</th>
              <th className="p-3 text-left">{t("Vendor")}</th>
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
                  <td className="p-3 font-medium">
                    {r.displayName}
                    <div className="text-xs text-muted-foreground">
                      {r.modelKey}
                    </div>
                    {r.syncStatus === "changed" && (
                      <span className="text-xs text-amber-600">
                        {t("Upstream price changed")}
                      </span>
                    )}
                  </td>
                  <td className="p-3">{r.vendor}</td>
                  <td className="whitespace-nowrap p-3">
                    <PriceRenderer
                      spec={r.vendorPriceSpec}
                      timezone={r.timezone}
                      pricesOnly
                    />
                  </td>
                  <td className="whitespace-nowrap p-3">
                    <PriceRenderer
                      spec={r.llmapiPriceSpec}
                      timezone={r.timezone}
                      compareSpec={r.vendorPriceSpec}
                    />
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
                        if (confirm(t("Delete"))) {
                          await api.delete(
                            `/api/platform/admin/model-prices/${r.id}`,
                          );
                          load();
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
        <div className="fixed inset-0 z-50 overflow-auto bg-black/55 p-4 md:p-8">
          <div className="mx-auto max-w-6xl rounded-lg bg-background shadow-xl">
            <div className="flex items-center justify-between border-b bg-background p-5">
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
                <Button onClick={save}>{t("Save")}</Button>
              </div>
            </div>
            <div className="space-y-6 p-5">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1 text-sm"><span>{t("Model key")}</span><Input
                  placeholder={t("Model key")}
                  value={edit.modelKey}
                  onChange={(e) =>
                    setEdit({ ...edit, modelKey: e.target.value })
                  }
                /></label>
                <label className="space-y-1 text-sm"><span>{t("Display name")}</span><Input
                  placeholder={t("Display name")}
                  value={edit.displayName}
                  onChange={(e) =>
                    setEdit({ ...edit, displayName: e.target.value })
                  }
                /></label>
                <label className="space-y-1 text-sm"><span>{t("Vendor")}</span><Input
                  placeholder={t("Vendor")}
                  value={edit.vendor}
                  onChange={(e) => setEdit({ ...edit, vendor: e.target.value })}
                /></label>
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
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm"><div className="text-xs text-muted-foreground">{t("Base currency")}</div><div className="mt-1 font-medium">USD</div></div>
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
                />
              ) : (
                <RuntimePricingEditor
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
                        <PriceRenderer spec={{ mode: edit.pendingVendorSpec?.mode, blocks: [block] }} timezone={edit.timezone} />
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
