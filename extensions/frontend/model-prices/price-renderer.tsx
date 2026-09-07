import { Clock3, Percent } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatBillingCurrencyFromUSD } from "@/lib/currency";
import { useSystemConfigStore } from "@/stores/system-config-store";
import type { PriceBlock, PriceSpec } from "./types";

const money = (value: number | null | undefined) =>
  formatBillingCurrencyFromUSD(value, {
    digitsLarge: 2,
    digitsSmall: 6,
    abbreviate: false,
  });

function withDerivedPrices(spec?: PriceSpec): PriceSpec | undefined {
  if (!spec?.blocks?.length) return spec;
  return {
    ...spec,
    blocks: spec.blocks.map((block) => {
      if (
        block.input != null ||
        block.output != null ||
        block.price != null ||
        !block.table?.rows?.length
      ) {
        return block;
      }
      const fields = Object.fromEntries(block.table.rows);
      const finite = (key: string) => {
        const value = Number(fields[key]);
        return Number.isFinite(value) ? value : undefined;
      };
      const requestPrice = finite("model_price");
      if (requestPrice != null) return { ...block, price: requestPrice };
      const ratio = finite("model_ratio");
      if (ratio == null) return block;
      const input = ratio * 2;
      const completion = finite("completion_ratio");
      return {
        ...block,
        input,
        output: completion == null ? undefined : input * completion,
        unit: block.unit || "1M tokens",
      };
    }),
  };
}
const activeWindow = (b: PriceBlock, timezone: string) => {
  if (!b.start || !b.end) return false;
  const now = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return b.start <= b.end
    ? now >= b.start && now < b.end
    : now >= b.start || now < b.end;
};
export function PriceRenderer({
  spec,
  timezone,
  compareSpec,
}: {
  spec?: PriceSpec;
  timezone: string;
  compareSpec?: PriceSpec;
}) {
  const { t } = useTranslation();
  // Currency settings live in a global store; subscribing keeps prices current.
  useSystemConfigStore((state) => state.config.currency);
  const displayedSpec = withDerivedPrices(spec);
  const displayedCompareSpec = withDerivedPrices(compareSpec);
  const blocks = displayedSpec?.blocks || [];
  if (!blocks.length) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const compared = displayedCompareSpec?.blocks?.[i];
        const delta = (
          value: number | null | undefined,
          other: number | null | undefined,
        ) => {
          if (value == null || other == null) return null;
          const difference = value - other;
          return (
            <small
              className={`ml-1 text-[11px] font-medium ${difference > 0 ? "text-rose-500" : difference < 0 ? "text-emerald-500" : "text-muted-foreground"}`}
            >
              {difference > 0 ? "+" : ""}
              {money(difference)}
            </small>
          );
        };
        const current =
          displayedSpec?.mode === "time" && activeWindow(b, timezone);
        return (
          <div
            key={i}
            className={`rounded-md border p-2.5 ${current ? "border-emerald-500/50 bg-emerald-500/10" : "bg-muted/25"}`}
          >
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-medium">
              {b.label && <span>{b.label}</span>}
              {b.start && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Clock3 className="size-3" />
                  {b.start}-{b.end}
                </span>
              )}
              {(b.min != null || b.max != null) && (
                <span className="text-muted-foreground">
                  {b.min ?? 0} - {b.max ?? "∞"}
                </span>
              )}
              {current && (
                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-white">
                  {t("Current")}
                </span>
              )}
              {b.discount != null && (
                <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                  <Percent className="size-3" />
                  {b.discount}%
                </span>
              )}
            </div>
            {(b.input != null || b.output != null || b.price != null) && (
              <div className="mb-2 flex flex-wrap gap-x-3 text-sm">
                {b.input != null && (
                  <span>
                    {t("Input price")}: <b>{money(b.input)}</b>
                    {delta(b.input, compared?.input)}
                  </span>
                )}
                {b.output != null && (
                  <span>
                    {t("Output price")}: <b>{money(b.output)}</b>
                    {delta(b.output, compared?.output)}
                  </span>
                )}
                {b.price != null && (
                  <span>
                    <b>{money(b.price)}</b>
                    {delta(b.price, compared?.price)}
                  </span>
                )}
                {b.unit && (
                  <span className="text-muted-foreground">/ {b.unit}</span>
                )}
              </div>
            )}
            {b.table?.headers?.length && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {b.table.headers.map((h, j) => (
                        <th className="border-b p-1 text-left" key={j}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(b.table.rows || []).map((r, j) => (
                      <tr key={j}>
                        {r.map((v, k) => (
                          <td className="border-b/50 p-1" key={k}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {b.note && (
              <div className="mt-1 text-xs text-muted-foreground">{b.note}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function numericDifference(v?: PriceSpec, o?: PriceSpec) {
  const a = v?.blocks?.[0],
    b = o?.blocks?.[0];
  const av = a?.price ?? a?.input,
    bv = b?.price ?? b?.input;
  return typeof av === "number" && typeof bv === "number" ? bv - av : null;
}
