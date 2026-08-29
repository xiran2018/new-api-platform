import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import {
  Download,
  Eye,
  FileText,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "../../components/rich-text-editor";
import { AuthenticatedFilePreview } from "../../components/authenticated-file-preview";

type Request = {
  id: number;
  userId: number;
  profileTitle?: string;
  title?: string;
  taxNumber?: string;
  invoiceType?: string;
  emails?: string;
  email?: string;
  amount: number;
  status: string;
  requestedAt: string;
  completedAt?: string;
  fileId?: number;
  orders?: Array<{ tradeNo: string }>;
};
type Sample = {
  id: number;
  title: string;
  description: string;
  published: boolean;
  sortOrder: number;
  fileId?: number;
};
type InvoiceRequestDetail = {
  request: Request;
  username: string;
  orders: Array<{
    id: number;
    tradeNo: string;
    type: string;
    paymentProvider: string;
    amount: number;
    createTime: number;
    completeTime: number;
    status: string;
  }>;
};
const box = "rounded-lg border bg-card text-card-foreground shadow-sm";
const input = "h-10 rounded-md border bg-background px-3 text-sm";

function yuan(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
  }).format(value || 0);
}

export function InvoiceManagementPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<
    "invoice" | "reimbursement" | "samples" | "support"
  >("invoice");
  const [invoices, setInvoices] = useState<Request[]>([]);
  const [reimbursements, setReimbursements] = useState<Request[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [sampleInstructions, setSampleInstructions] = useState("");
  const [service, setService] = useState("");
  const [preview, setPreview] = useState<{
    url: string;
    mimeType: string;
    title: string;
  } | null>(null);
  const sampleListRef = useRef<HTMLDivElement>(null);
  const load = async () => {
    const [i, r, c] = await Promise.all([
      api.get("/api/platform/admin/invoice/requests"),
      api.get("/api/platform/admin/invoice/reimbursements"),
      api.get("/api/platform/admin/invoice/content"),
    ]);
    setInvoices(i.data.data ?? []);
    setReimbursements(r.data.data ?? []);
    setSamples(c.data.data?.samples ?? []);
    setSampleInstructions(
      c.data.data?.sampleInstructions ??
        c.data.data?.reimbursementInstructions ??
        "",
    );
    setService(c.data.data?.customerService ?? "");
  };
  useEffect(() => {
    void load();
  }, []);
  const upload = async (
    kind: "requests" | "reimbursements" | "samples",
    id: number,
    file: File,
  ) => {
    const body = new FormData();
    body.append("file", file);
    await api.post(`/api/platform/admin/invoice/${kind}/${id}/upload`, body);
    await load();
  };
  const previewSample = async (sample: Sample) => {
    const response = await api.get(
      `/api/platform/admin/invoice/samples/${sample.id}/file`,
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
  return (
    <div className="max-h-[calc(100dvh-4rem)] space-y-5 overflow-y-auto p-4 [scrollbar-gutter:stable] md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Invoice management")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Process invoice and reimbursement applications")}
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {[
          ["invoice", "Invoice applications"],
          ["reimbursement", "Reimbursement applications"],
          ["samples", "Invoice samples"],
          ["support", "Online customer service"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`border-b-2 px-4 py-3 text-sm ${tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
            onClick={() => setTab(id as typeof tab)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {tab === "invoice" && (
        <RequestTable rows={invoices} kind="requests" onUpload={upload} />
      )}
      {tab === "reimbursement" && (
        <RequestTable
          rows={reimbursements}
          kind="reimbursements"
          onUpload={upload}
        />
      )}
      {tab === "samples" && (
        <div className="space-y-5">
          <section className={`${box} p-5`}>
            <h2 className="mb-4 font-semibold">{t("Sample instructions")}</h2>
            <RichTextEditor
              value={sampleInstructions}
              onChange={setSampleInstructions}
            />
            <button
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
              onClick={async () => {
                await api.put("/api/platform/admin/invoice/content", {
                  sampleInstructions,
                  customerService: service,
                });
                toast.success(t("Saved successfully"));
              }}
            >
              <Save className="size-4" />
              {t("Save")}
            </button>
          </section>
          <section className={`${box} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{t("Invoice samples")}</h2>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                onClick={async () => {
                  await api.post("/api/platform/admin/invoice/samples", {
                    title: t("New sample"),
                    description: "",
                    published: true,
                    sortOrder: samples.length,
                  });
                  await load();
                  requestAnimationFrame(() => {
                    sampleListRef.current?.scrollTo({
                      top: sampleListRef.current.scrollHeight,
                      behavior: "smooth",
                    });
                  });
                }}
              >
                <Plus className="size-4" />
                {t("Add sample")}
              </button>
            </div>
            <div
              ref={sampleListRef}
              className="grid max-h-[60vh] gap-4 overflow-y-scroll pr-3 [scrollbar-gutter:stable] md:grid-cols-2 xl:grid-cols-3"
            >
              {samples.map((sample) => (
                <SampleEditor
                  key={sample.id}
                  sample={sample}
                  onSave={async (value) => {
                    await api.put(
                      `/api/platform/admin/invoice/samples/${sample.id}`,
                      value,
                    );
                    await load();
                    toast.success(t("Saved successfully"));
                  }}
                  onUpload={(file) => upload("samples", sample.id, file)}
                  onPreview={() => previewSample(sample)}
                  onDelete={async () => {
                    await api.delete(
                      `/api/platform/admin/invoice/samples/${sample.id}`,
                    );
                    await load();
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      )}
      {tab === "support" && (
        <section
          className={`${box} max-h-[calc(100dvh-12rem)] overflow-y-auto p-5 [scrollbar-gutter:stable]`}
        >
          <h2 className="mb-4 font-semibold">{t("Online customer service")}</h2>
          <RichTextEditor value={service} onChange={setService} />
          <button
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={async () => {
              await api.put("/api/platform/admin/invoice/content", {
                sampleInstructions,
                customerService: service,
              });
              toast.success(t("Saved successfully"));
            }}
          >
            <Save className="size-4" />
            {t("Save")}
          </button>
        </section>
      )}
      {preview && (
        <FilePreviewDialog preview={preview} onClose={closePreview} />
      )}
    </div>
  );
}

function RequestTable({
  rows,
  kind,
  onUpload,
  onPreview,
}: {
  rows: Request[];
  kind: "requests" | "reimbursements";
  onUpload: (
    kind: "requests" | "reimbursements" | "samples",
    id: number,
    file: File,
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const isReimbursement = kind === "reimbursements";
  const [detail, setDetail] = useState<InvoiceRequestDetail | null>(null);
  const headers = [
    "ID",
    "User ID",
    "Title",
    ...(!isReimbursement ? ["Order number"] : []),
    "Tax number / Email",
    "Amount",
    "Status",
    "Application time",
    "Completion time",
    "Actions",
  ];
  const downloadFile = (id: number) => {
    void api
      .get(`/api/platform/admin/invoice/${kind}/${id}/file`, {
        responseType: "blob",
      })
      .then((response) => {
        const url = URL.createObjectURL(response.data);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${kind}-${id}`;
        anchor.click();
        URL.revokeObjectURL(url);
      });
  };
  const showDetails = async (id: number) => {
    const response = await api.get(
      `/api/platform/admin/invoice/requests/${id}`,
    );
    setDetail(response.data.data);
  };
  return (
    <div
      className={`${box} max-h-[calc(100dvh-12rem)] overflow-auto [scrollbar-gutter:stable]`}
    >
      <table
        className={`w-full text-left text-sm ${isReimbursement ? "min-w-[950px]" : "min-w-[1100px]"}`}
      >
        <thead className="sticky top-0 z-10 border-b bg-muted">
          <tr>
            {headers.map((x) => (
              <th key={x} className="px-4 py-3">
                {t(x)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id} className="border-b last:border-0">
              <td className="px-4 py-3">{x.id}</td>
              <td className="px-4">{x.userId}</td>
              <td className="px-4">{x.profileTitle || x.title}</td>
              {!isReimbursement && (
                <td className="w-56 max-w-56 px-4">
                  <span
                    className="block truncate"
                    title={
                      x.orders?.map((order) => order.tradeNo).join(", ") || "-"
                    }
                  >
                    {x.orders?.map((order) => order.tradeNo).join(", ") || "-"}
                  </span>
                </td>
              )}
              <td className="px-4">{x.taxNumber || x.email}</td>
              <td className="px-4">
                {isReimbursement ? yuan(x.amount) : x.amount.toFixed(2)}
              </td>
              <td className="px-4">{t(x.status)}</td>
              <td className="px-4">
                {new Date(x.requestedAt).toLocaleString()}
              </td>
              <td className="px-4">
                {x.completedAt ? new Date(x.completedAt).toLocaleString() : "-"}
              </td>
              <td className="px-4">
                <div className="flex gap-3">
                  {!isReimbursement && (
                    <button
                      className="inline-flex items-center gap-1 whitespace-nowrap text-primary"
                      onClick={() => void showDetails(x.id)}
                    >
                      <Eye className="size-4" />
                      {t("View details")}
                    </button>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-1 text-primary">
                    <Upload className="size-4" />
                    {t(x.fileId ? "Replace" : "Upload")}
                    <input
                      className="hidden"
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onUpload(kind, x.id, f);
                      }}
                    />
                  </label>
                  {x.fileId && (
                    <button
                      className="inline-flex items-center gap-1 text-primary"
                      onClick={() => downloadFile(x.id)}
                    >
                      <Download className="size-4" />
                      {t("Download")}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {detail && (
        <InvoiceRequestDetailDialog
          detail={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function InvoiceRequestDetailDialog({
  detail,
  onClose,
}: {
  detail: InvoiceRequestDetail;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-5">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">
              {t("Invoice application details")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {detail.username || "-"} (ID: {detail.request.userId})
            </p>
          </div>
          <button
            className="rounded-md p-2 hover:bg-muted"
            title={t("Close")}
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-auto [scrollbar-gutter:stable]">
          <div className="grid gap-3 border-b bg-muted/20 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <DetailMetric
              label={t("Invoice title")}
              value={detail.request.profileTitle || "-"}
            />
            <DetailMetric
              label={t("Tax number")}
              value={detail.request.taxNumber || "-"}
            />
            <DetailMetric
              label={t("Total amount")}
              value={yuan(detail.request.amount)}
            />
            <DetailMetric
              label={t("Status")}
              value={t(detail.request.status)}
            />
          </div>
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {[
                  "Order number",
                  "Type",
                  "Payment provider",
                  "Amount",
                  "Recharge time",
                  "Completion time",
                  "Order status",
                  "User",
                ].map((header) => (
                  <th key={header} className="px-4 py-3 font-medium">
                    {t(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.orders.map((order) => (
                <tr key={order.id} className="border-t">
                  <td className="px-4 py-3">{order.tradeNo}</td>
                  <td className="px-4">{order.type || "-"}</td>
                  <td className="px-4">{order.paymentProvider || "-"}</td>
                  <td className="px-4">{yuan(order.amount)}</td>
                  <td className="px-4">
                    {new Date(order.createTime * 1000).toLocaleString()}
                  </td>
                  <td className="px-4">
                    {order.completeTime
                      ? new Date(order.completeTime * 1000).toLocaleString()
                      : "-"}
                  </td>
                  <td className="px-4">{t(order.status)}</td>
                  <td className="px-4">
                    {detail.username || "-"} (ID: {detail.request.userId})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}
function SampleEditor({
  sample,
  onSave,
  onUpload,
  onPreview,
  onDelete,
}: {
  sample: Sample;
  onSave: (x: Sample) => Promise<void>;
  onUpload: (f: File) => Promise<void>;
  onPreview: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(sample);
  return (
    <article className="flex min-w-0 flex-col rounded-md border bg-muted/20 p-4">
      <input
        className={`${input} mb-4 w-full text-center font-medium`}
        value={value.title}
        aria-label={t("Title")}
        onChange={(e) => setValue({ ...value, title: e.target.value })}
      />
      {sample.fileId ? (
        <AuthenticatedFilePreview
          endpoint={`/api/platform/admin/invoice/samples/${sample.id}/file`}
          alt={sample.title}
          className="mx-auto max-w-[15rem]"
          fallback={
            <div className="mx-auto mb-4 grid aspect-[16/10] w-full max-w-[15rem] place-items-center rounded-md border bg-background">
              <FileText className="size-8 text-primary" />
            </div>
          }
        />
      ) : (
        <div className="mx-auto mb-4 grid aspect-[16/10] w-full max-w-[15rem] place-items-center rounded-md border bg-background">
          <FileText className="size-8 text-muted-foreground" />
        </div>
      )}
      <textarea
        className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
        value={value.description}
        onChange={(e) => setValue({ ...value, description: e.target.value })}
      />
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.published}
          onChange={(e) => setValue({ ...value, published: e.target.checked })}
        />
        {t("Published")}
      </label>
      <div className="mt-4 flex items-center justify-center gap-2 border-t pt-4">
        <button
          className="rounded-md border p-2"
          title={t("Save")}
          onClick={() => void onSave(value)}
        >
          <Save className="size-4" />
        </button>
        <label
          className="cursor-pointer rounded-md border p-2"
          title={t("Upload")}
        >
          <Upload className="size-4" />
          <input
            className="hidden"
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
        </label>
        {sample.fileId && (
          <button
            className="rounded-md border p-2"
            title={t("Preview")}
            onClick={() => void onPreview()}
          >
            <Eye className="size-4" />
          </button>
        )}
        <button
          className="rounded-md p-2 text-destructive"
          title={t("Delete")}
          onClick={() => void onDelete()}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </article>
  );
}

function FilePreviewDialog({
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
