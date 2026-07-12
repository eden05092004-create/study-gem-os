import { createFileRoute, Link } from "@tanstack/react-router";
import { StickyNote, Sparkles, ArrowRight } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/notes")({
  component: NotesPage,
});

function NotesPage() {
  const courses = useStore((s) => s.courses);

  const notes = courses.flatMap((c) =>
    c.topics.flatMap((t) =>
      t.notes.map((n) => ({
        note: n,
        courseId: c.id,
        courseName: c.name,
        topicId: t.id,
        topicName: t.name,
      })),
    ),
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Library"
        title="Notes"
        subtitle="AI-generated, textbook-style notes from your materials."
      />

      {notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-14 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted">
            <StickyNote className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-display text-lg font-semibold text-foreground">
            No notes yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Open a topic and generate notes from a file — they'll be collected here.
          </p>
          <Link
            to="/courses"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Sparkles className="h-4 w-4" /> Go to a topic
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {notes.map(({ note, courseId, courseName, topicId, topicName }) => (
            <Link
              key={note.id}
              to="/notes/$courseId/$topicId/$noteId"
              params={{ courseId, topicId, noteId: note.id }}
              className="card-hover rounded-2xl border border-border bg-card p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="eyebrow">{courseName} · {topicName}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">
                {note.title || "Untitled note"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {note.sections.length} sections · updated{" "}
                {new Date(note.updatedAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
