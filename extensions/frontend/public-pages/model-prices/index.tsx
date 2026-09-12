import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PublicLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { PriceRenderer } from "../../model-prices/price-renderer";
import type { ModelPrice } from "../../model-prices/types";

export function ModelPricesPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ModelPrice[]>([]);
  const [q, setQ] = useState("");
  const [vendor, setVendor] = useState("");
  useEffect(() => {
    void api
      .get("/api/platform/public/model-prices")
      .then((r) => setRows(r.data.data || []));
  }, []);
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!vendor || r.vendor === vendor) &&
          `${r.modelKey} ${r.displayName} ${r.description || ""} ${r.vendor} ${(r.tags || []).join(" ")}`
            .toLowerCase()
            .includes(q.toLowerCase()),
      ),
    [rows, q, vendor],
  );
  const vendors = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.vendor))).map((name) => ({
        name,
        count: rows.filter((r) => r.vendor === name).length,
      })),
    [rows],
  );
  return (
    <PublicLayout showMainContainer={false}>
      <main className="w-full min-w-0 max-w-full overflow-x-hidden px-4 pb-12 pt-24 text-foreground sm:px-6">
        <div className="mb-5 text-center">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">
              LLMAPI {t("Model prices")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              LLMAPI · {t("Actual price")}
            </p>
          </div>
        </div>
        <div className="mx-auto mb-6 max-w-4xl rounded-full border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-card to-fuchsia-500/10 px-5 py-2 text-center text-sm text-muted-foreground">
          {t(
            "Product prices may change. Please check this page regularly for the latest pricing.",
          )}
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 print:hidden">
          <button
            onClick={() => setVendor("")}
            className={`rounded-lg border p-3 text-left ${!vendor ? "border-primary bg-primary/10" : "bg-card hover:bg-muted"}`}
          >
            <div className="font-semibold">{t("All vendors")}</div>
            <div className="text-xs text-muted-foreground">
              {rows.length} {t("models")}
            </div>
          </button>
          {vendors.map((item) => (
            <button
              key={item.name}
              onClick={() => setVendor(item.name)}
              className={`rounded-lg border p-3 text-left ${vendor === item.name ? "border-primary bg-primary/10" : "bg-card hover:bg-muted"}`}
            >
              <div className="truncate font-semibold">{item.name}</div>
              <div className="text-xs text-muted-foreground">
                {item.count} {t("models")}
              </div>
            </button>
          ))}
        </div>
        <div className="mb-5 rounded-lg border bg-card p-3 shadow-sm print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-xl">
              <Input
                className="pr-10"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("Search models")}
              />
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <Button variant="outline" onClick={() => window.print()}>
              <Download className="mr-2 size-4" />
              {t("Export PDF")}
            </Button>
          </div>
        </div>
        <div className="max-w-full overflow-x-auto rounded-lg border bg-card shadow-sm [scrollbar-gutter:stable]">
          <table className="w-full min-w-[1080px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[30%]" />
              <col className="w-[30%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="p-4">{t("Model name")}</th>
                <th className="p-4">{t("Vendor")}</th>
                <th className="p-4">{t("Tags")}</th>
                <th className="p-4">{t("Vendor original price")}</th>
                <th className="p-4">
                  {t("Actual price")}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t align-top hover:bg-muted/20">
                  <td className="break-words p-4">
                    <div className="font-semibold">{r.displayName}</div>
                    {!r.llmapiPriceSpec?.blocks?.length && (
                      <div className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                        {t("Temporarily unavailable. Coming soon, please stay tuned.")}
                      </div>
                    )}
                    {r.description && (
                      <div className="mt-1 text-xs font-medium text-rose-500">
                        {r.description}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.modelKey}
                    </div>
                  </td>
                  <td className="break-words p-4">{r.vendor}</td>
                  <td className="p-4">
                    <div className="flex max-w-32 flex-wrap gap-1">
                      {(r.tags || []).map((x) => (
                        <span
                          key={x}
                          className="rounded bg-secondary px-2 py-1 text-xs"
                        >
                          {x}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-4">
                    <PriceRenderer
                      spec={r.vendorPriceSpec}
                      timezone={r.timezone}
                      pricesOnly
                      displayCurrency={r.currency}
                    />
                  </td>
                  <td className="p-4">
                    <PriceRenderer
                      spec={r.llmapiPriceSpec}
                      timezone={r.timezone}
                      pricesOnly
                      displayCurrency={r.currency}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <div className="p-12 text-center text-muted-foreground">
              {t("No price records")}
            </div>
          )}
        </div>
      </main>
    </PublicLayout>
  );
}
