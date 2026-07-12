import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { NoteEditor } from "@/components/NoteEditor";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/edit-note/$courseId/$topicId/$noteId")({
  component: EditNotePage,
});

function EditNotePage() {
  const { courseId, topicId, noteId } = Route.useParams();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const note = topic?.notes.find((n) => n.id === noteId);

  if (!course || !topic || !note) {
    return (
      <AppShell>
        <p className="py-10 text-center text-sm text-muted-foreground">Note not found</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/notes/$courseId/$topicId/$noteId"
        params={{ courseId, topicId, noteId }}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {note.title}
      </Link>
      <PageTitle title="Edit notes" subtitle="Update your notes for this topic" />
      <NoteEditor
        courseId={courseId}
        topicId={topicId}
        noteId={noteId}
        initialTitle={note.title}
        initialSections={note.sections}
      />
    </AppShell>
  );
}
