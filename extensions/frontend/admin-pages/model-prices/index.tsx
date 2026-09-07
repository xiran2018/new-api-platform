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
import { api } from "@/lib/api";
import {
  numericDifference,
  PriceRenderer,
} from "../../model-prices/price-renderer";
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
}: {
  value: PriceSpec;
  onChange: (v: PriceSpec) => void;
}) {
  const { t } = useTranslation();
  const blocks = value.blocks || [];
  const mode = value.mode || "token";
  const set = (i: number, key: string, v: unknown) =>
    onChange({
      ...value,
      blocks: blocks.map((b, j) => (j === i ? { ...b, [key]: v } : b)),
    });
  return (
    <div className="space-y-3">
      <select
        className="h-10 rounded-md border bg-background px-3"
        value={mode}
        onChange={(e) =>
          onChange({ mode: e.target.value as PriceSpec["mode"], blocks })
        }
      >
        {["token", "request", "time", "tiered", "table"].map((m) => (
          <option key={m} value={m}>
            {t(
              (
                {
                  token: "Token pricing",
                  request: "Per request",
                  time: "Time windows",
                  tiered: "Tiered pricing",
                  table: "Custom table",
                } as Record<string, string>
              )[m],
            )}
          </option>
        ))}
      </select>
      {blocks.map((b, i) => (
        <div
          className="grid gap-2 rounded-md border bg-muted/20 p-3 md:grid-cols-4"
          key={i}
        >
          <Input
            placeholder={t("Label")}
            value={b.label || ""}
            onChange={(e) => set(i, "label", e.target.value)}
          />
          {mode === "time" && (
            <>
              <Input
                type="time"
                value={b.start || ""}
                onChange={(e) => set(i, "start", e.target.value)}
              />
              <Input
                type="time"
                value={b.end || ""}
                onChange={(e) => set(i, "end", e.target.value)}
              />
            </>
          )}
          {mode === "tiered" && (
            <>
              <Input
                type="number"
                placeholder={t("Minimum")}
                value={b.min ?? ""}
                onChange={(e) => set(i, "min", Number(e.target.value))}
              />
              <Input
                type="number"
                placeholder={t("Maximum")}
                value={b.max ?? ""}
                onChange={(e) => set(i, "max", Number(e.target.value))}
              />
            </>
          )}
          {mode === "token" && (
            <>
              <Input
                type="number"
                step="any"
                placeholder={t("Input price")}
                value={b.input ?? ""}
                onChange={(e) => set(i, "input", Number(e.target.value))}
              />
              <Input
                type="number"
                step="any"
                placeholder={t("Output price")}
                value={b.output ?? ""}
                onChange={(e) => set(i, "output", Number(e.target.value))}
              />
            </>
          )}
          {mode !== "token" && mode !== "table" && (
            <Input
              type="number"
              step="any"
              placeholder={t("Price")}
              value={b.price ?? ""}
              onChange={(e) => set(i, "price", Number(e.target.value))}
            />
          )}
          <Input
            placeholder={t("Unit")}
            value={b.unit || ""}
            onChange={(e) => set(i, "unit", e.target.value)}
          />
          <Input
            type="number"
            step="any"
            placeholder={t("Discount")}
            value={b.discount ?? ""}
            onChange={(e) => set(i, "discount", Number(e.target.value))}
          />
          {mode === "table" && (
            <textarea
              className="min-h-24 rounded-md border bg-background p-2 md:col-span-4"
              placeholder={t("One line per item, separated by |")}
              value={[
                b.table?.headers?.join("|"),
                ...(b.table?.rows || []).map((r) => r.join("|")),
              ]
                .filter(Boolean)
                .join("\n")}
              onChange={(e) => {
                const lines = e.target.value
                  .split("\n")
                  .map((x) => x.split("|"));
                set(i, "table", {
                  headers: lines[0] || [],
                  rows: lines.slice(1),
                });
              }}
            />
          )}
          <Input
            className="md:col-span-3"
            placeholder={t("Note")}
            value={b.note || ""}
            onChange={(e) => set(i, "note", e.target.value)}
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() =>
              onChange({ ...value, blocks: blocks.filter((_, j) => j !== i) })
            }
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange({ ...value, blocks: [...blocks, {}] })}
      >
        <Plus className="mr-2 size-4" />
        {t("Add model")}
      </Button>
    </div>
  );
}

export function ModelPriceManagementPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ModelPrice[]>([]),
    [q, setQ] = useState(""),
    [edit, setEdit] = useState<ModelPrice | null>(null),
    [tab, setTab] = useState<"vendor" | "ours">("vendor"),
    [syncOpen, setSyncOpen] = useState(false),
    [syncModel, setSyncModel] = useState<string | undefined>();
  const load = () =>
    void api
      .get("/api/platform/admin/model-prices", { params: { q } })
      .then((r) => setRows(r.data.data || []));
  useEffect(load, [q]);
  const shown = useMemo(() => rows, [rows]);
  const save = async () => {
    if (!edit) return;
    if (edit.id)
      await api.put(`/api/platform/admin/model-prices/${edit.id}`, edit);
    else await api.post("/api/platform/admin/model-prices", edit);
    toast.success(t("Save"));
    setEdit(null);
    load();
  };
  return (
    <div className="h-[calc(100vh-4rem)] overflow-auto p-5">
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
      <div className="relative mb-4 max-w-lg">
        <Input
          className="pr-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Search models")}
        />
        <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left">{t("Model name")}</th>
              <th className="p-3 text-left">{t("Vendor")}</th>
              <th className="p-3 text-left">{t("Vendor original price")}</th>
              <th className="p-3 text-left">
                {t("LLMAPI price (tax included 6%)")}
              </th>
              <th className="p-3">{t("Difference")}</th>
              <th className="p-3">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const d = numericDifference(r.vendorPriceSpec, r.llmapiPriceSpec);
              return (
                <tr
                  key={r.id}
                  onClick={() => setEdit(r)}
                  className="cursor-pointer border-t align-top hover:bg-muted/30"
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
                  <td className="max-w-sm p-3">
                    <PriceRenderer
                      spec={r.vendorPriceSpec}
                      currency={r.currency}
                      timezone={r.timezone}
                    />
                  </td>
                  <td className="max-w-sm p-3">
                    <PriceRenderer
                      spec={r.llmapiPriceSpec}
                      currency={r.currency}
                      timezone={r.timezone}
                    />
                  </td>
                  <td
                    className={`p-3 text-center font-semibold ${d == null ? "" : d >= 0 ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {d == null ? "-" : `${d >= 0 ? "+" : ""}${d}`}
                  </td>
                  <td className="p-3 text-center">
                    <Button size="icon" variant="ghost">
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
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background p-5">
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
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  placeholder={t("Model key")}
                  value={edit.modelKey}
                  onChange={(e) =>
                    setEdit({ ...edit, modelKey: e.target.value })
                  }
                />
                <Input
                  placeholder={t("Display name")}
                  value={edit.displayName}
                  onChange={(e) =>
                    setEdit({ ...edit, displayName: e.target.value })
                  }
                />
                <Input
                  placeholder={t("Vendor")}
                  value={edit.vendor}
                  onChange={(e) => setEdit({ ...edit, vendor: e.target.value })}
                />
                <Input
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
                />
                <Input
                  placeholder={t("Currency")}
                  value={edit.currency}
                  onChange={(e) =>
                    setEdit({ ...edit, currency: e.target.value })
                  }
                />
                <Input
                  placeholder={t("Timezone")}
                  value={edit.timezone}
                  onChange={(e) =>
                    setEdit({ ...edit, timezone: e.target.value })
                  }
                />
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={edit.published}
                    onChange={(e) =>
                      setEdit({ ...edit, published: e.target.checked })
                    }
                  />
                  {t("Published")}
                </label>
              </div>
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                {t(
                  "Vendor pricing is for comparison. LLMAPI pricing writes to the active runtime billing configuration.",
                )}
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
                  {t("LLMAPI price (tax included 6%)")}
                </Button>
              </div>
              {tab === "vendor" ? (
                <SpecEditor
                  value={edit.vendorPriceSpec}
                  onChange={(v) => setEdit({ ...edit, vendorPriceSpec: v })}
                />
              ) : (
                <RuntimePricingEditor
                  modelKey={edit.modelKey}
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
                  <PriceRenderer
                    spec={edit.pendingVendorSpec}
                    currency={edit.currency}
                    timezone={edit.timezone}
                  />
                  <Button
                    className="mt-3"
                    onClick={async () => {
                      await api.post(
                        `/api/platform/admin/model-prices/${edit.id}/apply-sync`,
                      );
                      toast.success(t("Save"));
                      setEdit(null);
                      load();
                    }}
                  >
                    {t("Apply new vendor price")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
