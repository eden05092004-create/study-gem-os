import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/notes/$courseId/$topicId/$noteId")({
  component: NoteViewer,
});

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
        <p className="py-10 text-center text-sm text-muted-foreground">הסיכום לא נמצא</p>
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
        <ChevronRight className="h-4 w-4" /> {topic.name}
      </Link>
      <h1 className="mb-1 text-2xl font-extrabold leading-tight text-foreground">
        {note.title}
      </h1>
      <p className="mb-5 text-sm text-muted-foreground">עודכן {note.updatedAt}</p>

      <div className="space-y-3">
        {note.sections.map((sec) => {
          const open = !!openKeys[sec.key];
          return (
            <Card key={sec.key} className="overflow-hidden border-none p-0">
              <button
                onClick={() =>
                  setOpenKeys((k) => ({ ...k, [sec.key]: !k[sec.key] }))
                }
                className="flex w-full items-center gap-3 p-4 text-right"
              >
                <span className="text-xl">{sec.icon}</span>
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
                  <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
                    {sec.body}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
