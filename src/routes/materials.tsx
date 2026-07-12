import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  FileText,
  Image,
  Type,
  LinkIcon,
  Presentation,
  Upload,
  NotebookPen,
  ClipboardList,
  FileImage,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { toast } from "sonner";
import { useStore } from "@/lib/store";


export const Route = createFileRoute("/materials")({
  component: MaterialsPage,
});

const TABS = [
  { id: "all", label: "All", icon: FileText },
  { id: "pdf", label: "PDF", icon: FileText },
  { id: "ppt", label: "Slides", icon: Presentation },
  { id: "image", label: "Image", icon: Image },
  { id: "text", label: "Text", icon: Type },
  { id: "link", label: "Link", icon: LinkIcon },
] as const;

function MaterialsPage() {
  const [tab, setTab] = useState<string>("all");
  const courses = useStore((s) => s.courses);

  const files = courses.flatMap((c) =>
    c.topics.flatMap((t) =>
      (t.files ?? []).map((f) => ({ ...f, course: c.name, topic: t.name })),
    ),
  );

  const filtered =
    tab === "all"
      ? files
      : files.filter((f) => (f.kind ?? "pdf").toLowerCase().includes(tab));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Library"
        title="Materials"
        subtitle="Every file, slide and note across your courses."
        action={
          <Link
            to="/upload"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Upload className="h-4 w-4" /> Upload
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-14 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-display text-lg font-semibold text-foreground">
            Your library is empty
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Upload PDFs, slides, images or notes to a topic and they'll appear here.
          </p>
          <Link
            to="/upload"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Upload className="h-4 w-4" /> Upload material
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((f) => (
            <div
              key={f.id}
              className="card-hover rounded-2xl border border-border bg-card p-4"
            >
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="truncate font-semibold text-foreground">{f.name}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {f.course} · {f.topic}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
