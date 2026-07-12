import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { NoteEditor } from "@/components/NoteEditor";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/write-note/$courseId/$topicId")({
  component: WriteNotePage,
});

function WriteNotePage() {
  const { courseId, topicId } = Route.useParams();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);

  if (!course || !topic) {
    return (
      <AppShell>
        <p className="py-10 text-center text-sm text-muted-foreground">Topic not found</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/courses/$courseId/$topicId"
        params={{ courseId, topicId }}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {topic.name}
      </Link>
      <PageTitle title="Write notes" subtitle="Create your own notes for this topic" />
      <NoteEditor courseId={courseId} topicId={topicId} />
    </AppShell>
  );
}
