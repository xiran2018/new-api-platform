import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
type Channel = { id: number; name: string; base_url: string };
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
      const differences = result.data?.data?.differences || {};
      const items = Object.entries(differences)
        .filter(([model]) => !modelKey || model === modelKey)
        .map(([model, fields]) => ({
          modelKey: model,
          spec: {
            mode: "table",
            blocks: [
              {
                label: chosen.map((x) => x.name).join(", "),
                table: {
                  headers: ["Price field", "Upstream value"],
                  rows: Object.entries(
                    fields as Record<
                      string,
                      { upstreams: Record<string, unknown> }
                    >,
                  ).map(([field, d]) => [
                    field,
                    String(
                      Object.values(d.upstreams || {}).find(
                        (v) => v !== "same",
                      ) ?? "-",
                    ),
                  ]),
                },
              },
            ],
          },
        }));
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
                      : selected.filter((x) => x !== c.id),
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
