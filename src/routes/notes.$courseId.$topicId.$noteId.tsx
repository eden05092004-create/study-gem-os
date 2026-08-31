import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronDown, Pencil } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { NoteMarkdown } from "@/lib/note-markdown";

export const Route = createFileRoute("/notes/$courseId/$topicId/$noteId")({
  component: NoteViewer,
});

/** Accent tint per canonical section key (see NOTE_SECTION_SPECS) — falls back to
 *  the neutral primary tint for custom, user-written section keys. */
const SECTION_ACCENTS: Record<string, string> = {
  overview: "text-primary",
  full: "text-primary",
  tables: "text-chart-3",
  highyield: "text-warning",
  clinical: "text-success",
  mistakes: "text-destructive",
  details: "text-chart-5",
  quickcheck: "text-chart-3",
  coverage: "text-success",
};

function NoteViewer() {
  const { courseId, topicId, noteId } = Route.useParams();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const note = topic?.notes.find((n) => n.id === noteId);
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>(
    note ? { [note.sections[0]?.key]: true } : {},
  );

  if (!note || !course || !topic) {
    return (
      <AppShell>
        <p className="py-10 text-center text-sm text-muted-foreground">Note not found</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/courses/$courseId/$topicId"
        params={{ courseId, topicId }}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {topic.name}
      </Link>

      <div className="mb-5 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/8 via-card to-accent/8 p-5 soft-shadow">
        <p className="eyebrow mb-1.5">{course.name}</p>
        <h1 className="font-display mb-2 text-2xl font-extrabold leading-tight text-foreground">
          {note.title}
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {note.sections.length} section{note.sections.length === 1 ? "" : "s"} · updated {note.updatedAt}
          </p>
          <Button asChild size="sm" variant="outline" className="rounded-full bg-card">
            <Link
              to="/edit-note/$courseId/$topicId/$noteId"
              params={{ courseId, topicId, noteId }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          </Button>
        </div>
      </div>

      {note.sections.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {note.sections.map((sec) => (
            <button
              key={sec.key}
              onClick={() => setOpenKeys((k) => ({ ...k, [sec.key]: true }))}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <span>{sec.icon}</span> {sec.title}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {note.sections.map((sec) => {
          const open = !!openKeys[sec.key];
          const accent = SECTION_ACCENTS[sec.key] ?? "text-primary";
          return (
            <Card key={sec.key} className="overflow-hidden border-none p-0 card-hover">
              <button
                onClick={() =>
                  setOpenKeys((k) => ({ ...k, [sec.key]: !k[sec.key] }))
                }
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-xl", accent)}>
                  {sec.icon}
                </span>
                <span className="min-w-0 flex-1 font-bold text-foreground">
                  {sec.title}
                </span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                    open && "rotate-180",
                  )}
                />
              </button>
              {open && (
                <div className="border-t border-border px-4 pb-4 pt-3">
                  <NoteMarkdown text={sec.body} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
