import DOMPurify from "dompurify";
import { ChevronDown, Menu, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "@/lib/api";
import { PublicHeader } from "@/components/layout";
import { useTranslation } from "react-i18next";

type Category = { id: number; name: string };
type FAQItem = {
  id: number;
  categoryId: number;
  title: string;
  bodyHtml: string;
};

// Old entries may have been saved while the editor was displayed in dark mode.
// Treat pure black/white as the document's default text colour so it follows
// the active application theme. Deliberately selected accent colours remain.
function renderFaqHtml(html: string) {
  return DOMPurify.sanitize(html)
    .replace(
      /(color\s*:\s*)(?:#(?:fff(?:fff)?|000(?:000)?|ffffff|000000)|rgb\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\s*\))/gi,
      "$1var(--faq-content-fg)",
    )
    .replace(/\btext-(?:white|black)\b/g, "faq-theme-text");
}

export function FaqPage() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<FAQItem[]>([]);
  const [query, setQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<number[]>([]);
  const [openItems, setOpenItems] = useState<number[]>([]);
  const [mobileMenu, setMobileMenu] = useState(false);
  useEffect(() => {
    void api.get("/api/platform/public/faq").then((r) => {
      const nextCategories = r.data.data.categories ?? [];
      setCategories(nextCategories);
      setItems(r.data.data.items ?? []);
      setOpenCategories(
        nextCategories.map((category: Category) => category.id),
      );
    });
  }, []);
  const filtered = useMemo(
    () =>
      items.filter((item) =>
        `${item.title} ${item.bodyHtml}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [items, query],
  );
  const toggle = (
    id: number,
    values: number[],
    setter: (next: number[]) => void,
  ) =>
    setter(
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    );
  const focusItem = (id: number) => {
    setOpenItems((current) =>
      current.includes(id) ? current : [...current, id],
    );
    setMobileMenu(false);
    window.setTimeout(
      () =>
        document
          .getElementById(`faq-${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );
  };
  const navContent = (
    <>
      {categories.map((category) => {
        const categoryItems = filtered.filter(
          (item) => item.categoryId === category.id,
        );
        if (!categoryItems.length) return null;
        const open = openCategories.includes(category.id);
        return (
          <div key={category.id} className="mb-3">
            <button
              className="flex w-full items-center justify-between rounded-lg bg-muted px-3 py-3 text-left text-base font-bold text-foreground transition-colors hover:bg-cyan-500 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              onClick={() =>
                toggle(category.id, openCategories, setOpenCategories)
              }
            >
              {category.name}
              <ChevronDown
                className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
            {open && (
              <div className="ml-3 mt-2">
                {categoryItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => focusItem(item.id)}
                    className="block w-full border-l-2 border-transparent px-3 py-2 text-left text-sm font-medium leading-6 text-muted-foreground hover:border-primary hover:bg-muted hover:text-foreground"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <div className="pt-16">
        <header
          style={{
            background: "linear-gradient(135deg, #20252d 0%, #323b48 100%)",
          }}
          className="border-b border-white/10 px-5 py-5 shadow-md"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "32px",
              maxWidth: "1000px",
              margin: "0 auto",
            }}
          >
            <button
              className="text-white md:hidden"
              onClick={() => setMobileMenu(true)}
            >
              <Menu />
            </button>
            <strong
              style={{
                color: "#fff",
                fontSize: "2rem",
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              LLMAPI
            </strong>
            <div style={{ position: "relative", flex: 1, maxWidth: "750px" }}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search FAQ...")}
                className="w-full rounded-full border border-white/10 bg-background py-4 pl-7 text-lg text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:ring-4 focus:ring-cyan-300/20"
                style={{ paddingRight: "4rem" }}
              />
              {query ? (
                <button
                  aria-label={t("Clear search")}
                  className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                  style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)" }}
                  onClick={() => setQuery("")}
                >
                  <X className="size-5" />
                </button>
              ) : (
                <Search className="pointer-events-none size-5 text-muted-foreground" style={{ position: "absolute", right: "1.25rem", top: "50%", transform: "translateY(-50%)" }} />
              )}
            </div>
          </div>
        </header>
        <div className="mx-auto flex max-w-7xl gap-12 px-6 py-16">
          <aside
            style={{ marginTop: "2rem", height: "calc(100vh - 15rem)" }}
            className="hidden w-72 shrink-0 overflow-y-auto rounded-2xl bg-card p-7 text-card-foreground shadow-md md:block"
          >
            <h2 className="mb-6 text-lg font-bold">{t("FAQ")}</h2>
            {navContent}
          </aside>
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-card p-6 text-card-foreground shadow-xl transition-transform md:hidden ${mobileMenu ? "translate-x-0" : "-translate-x-full"}`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">{t("FAQ")}</h2>
              <button onClick={() => setMobileMenu(false)}>
                <X />
              </button>
            </div>
            {navContent}
          </aside>
          <main className="min-w-0 flex-1 rounded-[2rem] bg-card/35 p-5 shadow-[0_16px_40px_-24px_rgba(0,0,0,.55)] sm:p-8">
            <header
              style={{
                background: "linear-gradient(135deg, #26313e 0%, #3a485a 100%)",
                minHeight: "160px",
              }}
              className="mb-14 flex items-center justify-center rounded-[1.5rem] border border-white/10 px-8 py-14 text-center shadow-lg"
            >
              <h1 className="text-4xl font-bold text-white">
                LLMAPI {t("FAQ")}
              </h1>
            </header>
            {categories.map((category) => {
              const categoryItems = filtered.filter(
                (item) => item.categoryId === category.id,
              );
              if (!categoryItems.length) return null;
              return (
                <section key={category.id} className="mb-12">
                  <h2 className="mb-6 border-b border-border pb-4 text-2xl font-bold text-foreground">
                    {category.name}
                  </h2>
                  {categoryItems.map((item) => {
                    const open = openItems.includes(item.id);
                    return (
                      <article
                        id={`faq-${item.id}`}
                        key={item.id}
                        className="mb-4 rounded-[1.25rem] border border-border bg-card px-9 py-6 text-card-foreground shadow-sm"
                      >
                        <button
                          className="flex w-full items-center justify-between gap-6 text-left text-xl font-semibold text-card-foreground"
                          onClick={() =>
                            toggle(item.id, openItems, setOpenItems)
                          }
                        >
                          <span>{item.title}</span>
                          <span
                            className={`flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xl text-foreground transition-transform ${open ? "rotate-45 bg-cyan-500 text-slate-950" : ""}`}
                          >
                            +
                          </span>
                        </button>
                        {open && (
                          <div
                            style={
                              {
                                "--faq-content-fg":
                                  "hsl(var(--card-foreground))",
                              } as CSSProperties
                            }
                            className="mt-5 border-t border-border pt-5 text-card-foreground [&_.faq-theme-text]:!text-inherit [&_a]:!text-cyan-500 [&_ol]:list-decimal [&_ol]:pl-7 [&_ul]:list-disc [&_ul]:pl-7"
                            dangerouslySetInnerHTML={{
                              __html: renderFaqHtml(item.bodyHtml),
                            }}
                          />
                        )}
                      </article>
                    );
                  })}
                </section>
              );
            })}
            {!filtered.length && (
              <div className="rounded-2xl bg-card p-10 text-center text-card-foreground">
                {t("No FAQ results found.")}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
