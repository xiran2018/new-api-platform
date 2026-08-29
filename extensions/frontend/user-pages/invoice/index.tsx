import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AuthenticatedFilePreview } from "../../components/authenticated-file-preview";
import {
  BadgeCheck,
  BookOpen,
  Download,
  Eye,
  FileBarChart,
  FileText,
  Headphones,
  Loader2,
  ReceiptText,
  Save,
  Send,
  X,
} from "lucide-react";

type Section =
  "profile" | "orders" | "reimbursements" | "billing" | "samples" | "support";
type Profile = {
  title: string;
  taxNumber: string;
  invoiceType: string;
  emails: string;
};
type Order = {
  id: number;
  tradeNo: string;
  type: string;
  amount: number;
  createTime: number;
  completeTime: number;
  status: string;
  invoiceStatus: string;
  invoiceRequestId?: number;
  requestedAt?: string;
  invoiceCompletedAt?: string;
  downloadable: boolean;
};
type Reimbursement = {
  id: number;
  title: string;
  amount: number;
  email: string;
  note: string;
  status: string;
  requestedAt: string;
  completedAt?: string;
  fileId?: number;
};
type BillingRow = {
  key: string;
  requestCount: number;
  tokens: number;
  cost: number;
};
type Content = {
  sampleInstructions: string;
  customerService: string;
  samples: Array<{
    id: number;
    title: string;
    description: string;
    fileId?: number;
  }>;
};

const emptyProfile: Profile = {
  title: "",
  taxNumber: "",
  invoiceType: "normal",
  emails: "",
};
const card =
  "rounded-lg border border-border/70 bg-card text-card-foreground shadow-sm";
const field =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function download(path: string, fallback: string) {
  void api.get(path, { responseType: "blob" }).then((r) => {
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fallback;
    a.click();
    URL.revokeObjectURL(url);
  });
}
function money(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(value || 0);
}
function yuan(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
  }).format(value || 0);
}
function date(value?: string | number) {
  if (!value) return "-";
  const parsed =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return parsed.toLocaleString();
}

export function InvoiceCenterPage() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>("profile");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [orderType, setOrderType] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [reimbursement, setReimbursement] = useState({
    title: "",
    amount: "",
    email: "",
    note: "",
  });
  const [billing, setBilling] = useState<{
    summary: BillingRow;
    models: BillingRow[];
    days: BillingRow[];
  } | null>(null);
  const [billingError, setBillingError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [dates, setDates] = useState({
    start: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  });
  const [content, setContent] = useState<Content>({
    sampleInstructions: "",
    customerService: "",
    samples: [],
  });
  const [preview, setPreview] = useState<{
    url: string;
    mimeType: string;
    title: string;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, o, r, c] = await Promise.all([
        api.get("/api/platform/user/invoice/profile"),
        api.get("/api/platform/user/invoice/orders"),
        api.get("/api/platform/user/invoice/reimbursements"),
        api.get("/api/platform/user/invoice/content"),
      ]);
      const loadedProfile = p.data.data ?? emptyProfile;
      setProfile(loadedProfile);
      setReimbursement((current) => ({
        ...current,
        title: current.title || loadedProfile.title || "",
      }));
      setOrders(o.data.data ?? []);
      setReimbursements(r.data.data ?? []);
      setContent(
        c.data.data ?? {
          sampleInstructions: "",
          customerService: "",
          samples: [],
        },
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const previewSample = async (sample: Content["samples"][number]) => {
    const response = await api.get(
      `/api/platform/user/invoice/samples/${sample.id}/file`,
      { responseType: "blob" },
    );
    setPreview({
      url: URL.createObjectURL(response.data),
      mimeType: response.data.type,
      title: sample.title,
    });
  };
  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };
  const filteredOrders = useMemo(
    () =>
      orders.filter(
        (x) =>
          (!orderType || x.type === orderType) &&
          (!orderStatus || x.invoiceStatus === orderStatus),
      ),
    [orders, orderType, orderStatus],
  );
  const sections = [
    ["profile", "Invoice information", ReceiptText],
    ["orders", "Recharge orders", BadgeCheck],
    ["reimbursements", "Reimbursement statements", FileText],
    ["billing", "Billing", FileBarChart],
    ["samples", "Invoice samples", BookOpen],
    ["support", "Online customer service", Headphones],
  ] as const;
  const queryBilling = async () => {
    setBillingLoading(true);
    setBillingError("");
    try {
      const response = await api.get("/api/platform/user/invoice/billing", {
        params: dates,
        skipErrorHandler: true,
      });
      const data = response.data.data ?? {};
      setBilling({
        summary: data.summary ?? {
          key: "",
          requestCount: 0,
          tokens: 0,
          cost: 0,
        },
        models: Array.isArray(data.models) ? data.models : [],
        days: Array.isArray(data.days) ? data.days : [],
      });
    } catch (error: unknown) {
      const responseMessage = (
        error as { response?: { data?: { message?: string } } }
      ).response?.data?.message;
      setBillingError(responseMessage || t("Billing query failed"));
    } finally {
      setBillingLoading(false);
    }
  };

  return (
    <div className="mx-auto max-h-[calc(100dvh-4rem)] w-full max-w-[1500px] overflow-y-auto p-4 [scrollbar-gutter:stable] md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("Invoice center")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Manage invoice applications, reimbursement statements and billing records",
          )}
        </p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav
          className={cn(
            card,
            "sticky top-20 flex gap-1 overflow-x-auto p-2 lg:flex-col",
          )}
          aria-label={t("Invoice center")}
        >
          {sections.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={cn(
                "flex min-w-max items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition",
                section === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {t(label)}
            </button>
          ))}
        </nav>
        <main className="min-w-0 max-h-[calc(100dvh-12rem)] overflow-y-scroll pr-2 [scrollbar-gutter:stable] lg:max-h-[calc(100dvh-7rem)]">
          {loading ? (
            <div className={cn(card, "grid min-h-72 place-items-center")}>
              <Loader2 className="size-7 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {section === "profile" && (
                <section className={cn(card, "p-5 md:p-7")}>
                  <SectionTitle
                    title={t("Invoice information")}
                    detail={t(
                      "This information is used when submitting an invoice application",
                    )}
                  />
                  <div className="grid max-w-3xl gap-5 md:grid-cols-2">
                    <Field label={t("Invoice title")}>
                      <input
                        className={field}
                        value={profile.title}
                        onChange={(e) =>
                          setProfile({ ...profile, title: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={t("Tax number")}>
                      <input
                        className={field}
                        value={profile.taxNumber}
                        onChange={(e) =>
                          setProfile({ ...profile, taxNumber: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={t("Invoice type")}>
                      <select
                        className={field}
                        value={profile.invoiceType}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            invoiceType: e.target.value,
                          })
                        }
                      >
                        <option value="normal">{t("General invoice")}</option>
                        <option value="vat">{t("VAT special invoice")}</option>
                      </select>
                    </Field>
                    <Field label={t("Recipient emails")}>
                      <input
                        className={field}
                        type="email"
                        value={profile.emails}
                        placeholder="billing@example.com"
                        onChange={(e) =>
                          setProfile({ ...profile, emails: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <button
                    className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    onClick={async () => {
                      await api.put(
                        "/api/platform/user/invoice/profile",
                        profile,
                      );
                      await load();
                      toast.success(t("Saved successfully"));
                    }}
                  >
                    <Save className="size-4" />
                    {t("Save")}
                  </button>
                </section>
              )}
              {section === "orders" && (
                <section className={cn(card, "overflow-hidden")}>
                  <div className="p-5">
                    <SectionTitle
                      title={t("Recharge orders")}
                      detail={t(
                        "Select completed, uninvoiced orders to submit one invoice application",
                      )}
                    />
                    <div className="flex flex-wrap gap-3">
                      <select
                        className={cn(field, "w-44")}
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value)}
                      >
                        <option value="">{t("All types")}</option>
                        {[...new Set(orders.map((x) => x.type))].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                      <select
                        className={cn(field, "w-44")}
                        value={orderStatus}
                        onChange={(e) => setOrderStatus(e.target.value)}
                      >
                        <option value="">{t("All statuses")}</option>
                        <option value="not_requested">
                          {t("Not requested")}
                        </option>
                        <option value="pending">{t("Pending")}</option>
                        <option value="completed">{t("Completed")}</option>
                      </select>
                      <button
                        disabled={!selected.length}
                        className="ml-auto inline-flex items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                        onClick={async () => {
                          await api.post(
                            "/api/platform/user/invoice/requests",
                            { orderIds: selected },
                          );
                          setSelected([]);
                          await load();
                        }}
                      >
                        <Send className="size-4" />
                        {t("Submit invoice application")} ({selected.length})
                      </button>
                    </div>
                  </div>
                  <DataTable
                    headers={[
                      "",
                      "Order number",
                      "Type",
                      "Amount",
                      "Recharge time",
                      "Order status",
                      "Invoice status",
                      "Application time",
                      "Completion time",
                      "Actions",
                    ]}
                    rows={filteredOrders.map((x) => [
                      <input
                        type="checkbox"
                        aria-label={t("Select order")}
                        disabled={
                          x.status !== "success" ||
                          x.invoiceStatus !== "not_requested"
                        }
                        checked={selected.includes(x.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, x.id]
                              : selected.filter((id) => id !== x.id),
                          )
                        }
                      />,
                      x.tradeNo,
                      x.type,
                      money(x.amount),
                      date(x.createTime),
                      t(x.status),
                      t(x.invoiceStatus),
                      date(x.requestedAt),
                      date(x.invoiceCompletedAt),
                      x.downloadable && x.invoiceRequestId ? (
                        <button
                          className="inline-flex items-center gap-1 text-primary"
                          onClick={() =>
                            download(
                              `/api/platform/user/invoice/requests/${x.invoiceRequestId}/file`,
                              `invoice-${x.invoiceRequestId}.pdf`,
                            )
                          }
                        >
                          <Download className="size-4" />
                          {t("Download")}
                        </button>
                      ) : (
                        "-"
                      ),
                    ])}
                  />
                </section>
              )}
              {section === "reimbursements" && (
                <div className="space-y-5">
                  <section className={cn(card, "p-5")}>
                    <SectionTitle title={t("Instructions")} />
                    <div
                      className="prose prose-sm max-w-none text-card-foreground dark:prose-invert"
                      dangerouslySetInnerHTML={{
                        __html: t(
                          "After submitting an application, the administrator will prepare and upload the reimbursement statement.",
                        ),
                      }}
                    />
                  </section>
                  <section className={cn(card, "p-5")}>
                    <SectionTitle
                      title={t("Apply for reimbursement statement")}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label={t("Applicant company")}>
                        <input
                          className={field}
                          value={reimbursement.title}
                          onChange={(e) =>
                            setReimbursement({
                              ...reimbursement,
                              title: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label={t("Amount")}>
                        <div className="flex h-10 overflow-hidden rounded-md border border-input bg-background transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                          <span className="grid w-10 shrink-0 place-items-center border-r bg-muted/50 text-sm font-medium text-foreground">
                            ¥
                          </span>
                          <input
                            className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                            type="number"
                            min="0"
                            step="0.01"
                            value={reimbursement.amount}
                            onChange={(e) =>
                              setReimbursement({
                                ...reimbursement,
                                amount: e.target.value,
                              })
                            }
                          />
                          <span className="grid w-12 shrink-0 place-items-center border-l bg-muted/50 text-sm text-muted-foreground">
                            {t("Yuan")}
                          </span>
                        </div>
                      </Field>
                      <Field label={t("Recipient email")}>
                        <input
                          className={field}
                          type="email"
                          value={reimbursement.email}
                          onChange={(e) =>
                            setReimbursement({
                              ...reimbursement,
                              email: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label={t("Note")}>
                        <input
                          className={field}
                          value={reimbursement.note}
                          onChange={(e) =>
                            setReimbursement({
                              ...reimbursement,
                              note: e.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <button
                      className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      onClick={async () => {
                        await api.post(
                          "/api/platform/user/invoice/reimbursements",
                          {
                            ...reimbursement,
                            amount: Number(reimbursement.amount),
                          },
                        );
                        setReimbursement({
                          title: profile.title,
                          amount: "",
                          email: "",
                          note: "",
                        });
                        await load();
                      }}
                    >
                      <Send className="size-4" />
                      {t("Submit application")}
                    </button>
                  </section>
                  <section className={cn(card, "overflow-hidden")}>
                    <div className="p-5">
                      <SectionTitle title={t("My reimbursement statements")} />
                    </div>
                    <DataTable
                      headers={[
                        "Applicant company",
                        "Amount",
                        "Status",
                        "Application time",
                        "Completion time",
                        "Actions",
                      ]}
                      rows={reimbursements.map((x) => [
                        x.title,
                        yuan(x.amount),
                        t(x.status),
                        date(x.requestedAt),
                        date(x.completedAt),
                        x.fileId ? (
                          <button
                            className="text-primary"
                            onClick={() =>
                              download(
                                `/api/platform/user/invoice/reimbursements/${x.id}/file`,
                                `statement-${x.id}.pdf`,
                              )
                            }
                          >
                            {t("Download")}
                          </button>
                        ) : (
                          "-"
                        ),
                      ])}
                    />
                  </section>
                </div>
              )}
              {section === "billing" && (
                <div className="space-y-5">
                  <section className={cn(card, "p-5")}>
                    <SectionTitle title={t("Billing query")} />
                    <div className="flex flex-wrap items-end gap-4">
                      <Field label={t("Start date")}>
                        <input
                          className={field}
                          type="date"
                          value={dates.start}
                          onChange={(e) =>
                            setDates({ ...dates, start: e.target.value })
                          }
                        />
                      </Field>
                      <Field label={t("End date")}>
                        <input
                          className={field}
                          type="date"
                          value={dates.end}
                          onChange={(e) =>
                            setDates({ ...dates, end: e.target.value })
                          }
                        />
                      </Field>
                      <button
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
                        onClick={queryBilling}
                        disabled={billingLoading}
                      >
                        {billingLoading && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        {t("Query")}
                      </button>
                    </div>
                    {billingError && (
                      <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {billingError}
                      </p>
                    )}
                    {billing && (
                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <Metric
                          label={t("Requests")}
                          value={billing.summary.requestCount.toLocaleString()}
                        />
                        <Metric
                          label={t("Tokens")}
                          value={billing.summary.tokens.toLocaleString()}
                        />
                        <Metric
                          label={t("Cost")}
                          value={money(billing.summary.cost)}
                        />
                      </div>
                    )}
                  </section>
                  {billing && (
                    <>
                      <section className={cn(card, "overflow-hidden")}>
                        <div className="p-5">
                          <SectionTitle title={t("Model statistics")} />
                        </div>
                        <DataTable
                          headers={["Model", "Requests", "Tokens", "Cost"]}
                          rows={billing.models.map((x) => [
                            x.key || "-",
                            x.requestCount.toLocaleString(),
                            x.tokens.toLocaleString(),
                            money(x.cost),
                          ])}
                        />
                      </section>
                      <section className={cn(card, "overflow-hidden")}>
                        <div className="p-5">
                          <SectionTitle title={t("Date distribution")} />
                        </div>
                        <DataTable
                          headers={["Date", "Requests", "Tokens", "Cost"]}
                          rows={billing.days.map((x) => [
                            x.key,
                            x.requestCount.toLocaleString(),
                            x.tokens.toLocaleString(),
                            money(x.cost),
                          ])}
                        />
                      </section>
                    </>
                  )}
                </div>
              )}
              {section === "samples" && (
                <section className={cn(card, "p-5")}>
                  <SectionTitle
                    title={t("Invoice samples")}
                    detail={t(
                      "We are a general VAT taxpayer and support general and VAT special invoices. Electronic invoice samples are shown below.",
                    )}
                  />
                  {content.sampleInstructions && (
                    <div
                      className="prose prose-sm mb-6 max-w-none border-b pb-5 text-card-foreground dark:prose-invert [&_figure]:my-4 [&_img]:max-w-full"
                      dangerouslySetInnerHTML={{
                        __html: content.sampleInstructions,
                      }}
                    />
                  )}
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {content.samples.length ? (
                      content.samples.map((x) => (
                        <article
                          key={x.id}
                          className="rounded-md border bg-muted/20 p-4"
                        >
                          <h3 className="mb-4 text-center font-medium">
                            {x.title}
                          </h3>
                          {x.fileId ? (
                            <AuthenticatedFilePreview
                              endpoint={`/api/platform/user/invoice/samples/${x.id}/file`}
                              alt={x.title}
                              fallback={
                                <FileText className="mb-4 size-8 text-primary" />
                              }
                            />
                          ) : (
                            <FileText className="mb-4 size-8 text-primary" />
                          )}
                          <p className="mt-2 min-h-10 text-sm text-muted-foreground">
                            {x.description}
                          </p>
                          {x.fileId && (
                            <button
                              className="mt-4 inline-flex items-center gap-2 text-sm text-primary"
                              onClick={() => void previewSample(x)}
                            >
                              <Eye className="size-4" />
                              {t("View sample")}
                            </button>
                          )}
                        </article>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("No invoice samples")}
                      </p>
                    )}
                  </div>
                </section>
              )}
              {section === "support" && (
                <section className={cn(card, "p-5")}>
                  <SectionTitle title={t("Online customer service")} />
                  <div
                    className="prose max-w-none text-card-foreground dark:prose-invert"
                    dangerouslySetInnerHTML={{
                      __html:
                        content.customerService ||
                        t("No customer service information"),
                    }}
                  />
                </section>
              )}
            </>
          )}
        </main>
      </div>
      {preview && (
        <SamplePreviewDialog preview={preview} onClose={closePreview} />
      )}
    </div>
  );
}

function SamplePreviewDialog({
  preview,
  onClose,
}: {
  preview: { url: string; mimeType: string; title: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isImage = preview.mimeType.startsWith("image/");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4"
      onMouseDown={onClose}
    >
      <div
        className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <h2 className="truncate font-semibold">{preview.title}</h2>
          <button
            className="rounded-md p-2 hover:bg-muted"
            title={t("Close")}
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
          {isImage ? (
            <img
              src={preview.url}
              alt={preview.title}
              className="mx-auto max-h-full max-w-full object-contain"
            />
          ) : (
            <iframe
              src={preview.url}
              title={preview.title}
              className="h-full min-h-[70vh] w-full rounded-md bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="mb-5 border-b pb-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-[180px] text-sm font-medium">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-y bg-muted/50">
          <tr>
            {headers.map((x, i) => (
              <th
                key={`${x}-${i}`}
                className="whitespace-nowrap px-4 py-3 font-medium"
              >
                {t(x)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                {row.map((cell, j) => (
                  <td key={j} className="whitespace-nowrap px-4 py-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={headers.length}
                className="px-4 py-10 text-center text-muted-foreground"
              >
                {t("No data")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
