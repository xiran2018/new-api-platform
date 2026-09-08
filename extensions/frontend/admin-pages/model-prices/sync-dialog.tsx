import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { PriceBlock, PriceSpec } from "../../model-prices/types";
type Channel = { id: number; name: string; base_url: string };
type UpstreamPrice = Record<string, unknown>;

const numeric = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

function sourceLabel(source: string, values: UpstreamPrice) {
  const provider =
    typeof values._source_provider === "string"
      ? values._source_provider
      : "";
  return provider ? `${source} / ${provider}` : source;
}

function upstreamPriceSpec(
  upstreams: Record<string, UpstreamPrice>,
): PriceSpec {
  const blocks: PriceBlock[] = [];
  let mode: PriceSpec["mode"] = "token";
  for (const [source, values] of Object.entries(upstreams)) {
    const label = sourceLabel(source, values);
    const sourceURL =
      typeof values._source_url === "string" ? values._source_url : undefined;
    const table = {
      headers: ["Price field", "Upstream value"],
      rows: Object.entries(values)
        .filter(([field]) => !field.startsWith("_source_"))
        .map(([field, value]) => [
          field,
          typeof value === "string" ? value : JSON.stringify(value),
        ]),
    };
    const requestPrice = numeric(values.model_price);
    if (requestPrice != null) {
      mode = "request";
      blocks.push({
        label,
        price: requestPrice,
        unit: "request",
        table,
        note: sourceURL,
      });
      continue;
    }
    const ratio = numeric(values.model_ratio);
    if (ratio != null) {
      const input = ratio * 2;
      const completion = numeric(values.completion_ratio);
      const scaled = (field: string) => {
        const ratio = numeric(values[field]);
        return ratio == null ? undefined : input * ratio;
      };
      const audioInput = scaled("audio_ratio");
      const audioOutputRatio = numeric(values.audio_completion_ratio);
      blocks.push({
        label,
        input,
        output: completion == null ? undefined : input * completion,
        cache: scaled("cache_ratio"),
        createCache: scaled("create_cache_ratio"),
        image: scaled("image_ratio"),
        audioInput,
        audioOutput:
          audioInput == null || audioOutputRatio == null
            ? undefined
            : audioInput * audioOutputRatio,
        unit: "1M tokens",
        table,
        note: sourceURL,
      });
      continue;
    }
    if (typeof values.billing_expr === "string" && values.billing_expr) {
      mode = "expression";
      blocks.push({
        label,
        unit: "1M tokens",
        note: [sourceURL, values.billing_expr].filter(Boolean).join("\n"),
        table,
      });
    }
  }
  return { mode, blocks };
}

export function ModelPriceSyncDialog({
  open,
  onClose,
  onDone,
  modelKey,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  modelKey?: string;
}) {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (open)
      void api
        .get("/api/ratio_sync/channels")
        .then((r) => setChannels(r.data.data || []))
        .catch(() =>
          toast.error(
            t("Only super administrators can synchronize upstream prices."),
          ),
        );
  }, [open, t]);
  if (!open) return null;
  const sync = async () => {
    setLoading(true);
    try {
      const chosen = channels.filter((c) => selected.includes(c.id));
      const result = await api.post("/api/ratio_sync/fetch", {
        upstreams: chosen.map((c) => ({
          id: c.id,
          name: c.name,
          base_url: c.base_url,
          endpoint:
            c.id === -101 ? "https://models.dev/api.json" : "/api/pricing",
        })),
        timeout: 15,
      });
      const prices = (result.data?.data?.prices || {}) as Record<
        string,
        { upstreams?: Record<string, UpstreamPrice> }
      >;
      const modelsDevChannel = chosen.find((channel) => channel.id === -101);
      if (modelsDevChannel) {
        const matched = await api.post(
          "/api/platform/admin/model-prices/models-dev-preview",
        );
        for (const [model, values] of Object.entries(
          (matched.data?.data || {}) as Record<string, UpstreamPrice>,
        )) {
          const row = prices[model] || { upstreams: {} };
          row.upstreams ||= {};
          for (const source of Object.keys(row.upstreams)) {
            if (source.toLowerCase().includes("models.dev")) {
              delete row.upstreams[source];
            }
          }
          row.upstreams[modelsDevChannel.name] = values;
          prices[model] = row;
        }
      }
      const items = Object.entries(prices)
        .filter(([model]) => !modelKey || model === modelKey)
        .map(([model, price]) => ({
          modelKey: model,
          spec: upstreamPriceSpec(price.upstreams || {}),
          source: Object.entries(price.upstreams || {})
            .map(([source, values]) => sourceLabel(source, values))
            .join(", "),
        }))
        .filter((item) => item.spec.blocks?.length);
      await api.post("/api/platform/admin/model-prices/sync-preview", {
        source: chosen.map((x) => x.name).join(", "),
        items,
      });
      toast.success(t("Sync completed"));
      onDone();
      onClose();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("Failed to fetch upstream prices"),
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[60] overflow-auto bg-black/55 p-5">
      <div className="mx-auto mt-16 max-w-xl rounded-lg bg-background p-5 shadow-xl">
        <h2 className="text-lg font-semibold">
          {t("Select upstream channel")}
        </h2>
        <div className="my-4 max-h-80 space-y-2 overflow-auto">
          {channels.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-3 rounded border p-3 hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, c.id]
                      : selected.filter((id) => id !== c.id),
                  )
                }
              />
              <span>{c.name}</span>
              <span className="ml-auto max-w-60 truncate text-xs text-muted-foreground">
                {c.base_url}
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button disabled={!selected.length || loading} onClick={sync}>
            {loading ? t("Loading...") : t("Confirm selection")}
          </Button>
        </div>
      </div>
    </div>
  );
}
