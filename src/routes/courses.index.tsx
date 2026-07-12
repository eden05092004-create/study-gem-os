import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, FolderClosed, Plus, FileText } from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/courses/")({
  component: Courses,
});

function Courses() {
  const { courses, addCourse, addTopic, deleteCourse, deleteTopic } = useStore();
  const [open, setOpen] = useState<string | null>(courses[0]?.id ?? null);
  const [courseName, setCourseName] = useState("");
  const [courseEmoji, setCourseEmoji] = useState("");
  const [newCourseOpen, setNewCourseOpen] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [topicFor, setTopicFor] = useState<string | null>(null);

  return (
    <AppShell>
      <PageTitle
        title="My Courses"
        subtitle="Organize your materials by course and topic"
        action={
          <Dialog open={newCourseOpen} onOpenChange={setNewCourseOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full">
                <Plus className="h-4 w-4" /> Course
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New course</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="Course name (e.g. Anatomy)"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                />
                <Input
                  placeholder="Emoji (optional) 🧠"
                  value={courseEmoji}
                  onChange={(e) => setCourseEmoji(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  className="rounded-full"
                  onClick={() => {
                    if (!courseName.trim()) return;
                    addCourse(courseName.trim(), courseEmoji.trim());
                    setCourseName("");
                    setCourseEmoji("");
                    setNewCourseOpen(false);
                  }}
                >
                  Create course
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {courses.length === 0 && (
        <Card className="border-none p-8 text-center">
          <p className="font-semibold text-foreground">No courses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first course to get started.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {courses.map((c) => {
          const expanded = open === c.id;
          return (
            <Card key={c.id} className="overflow-hidden border-none p-0">
              <div className="flex w-full items-center gap-3 p-4">
                <button
                  onClick={() => setOpen(expanded ? null : c.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-muted text-xl">
                    {c.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.topics.length} topics
                    </div>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                </button>
                <ConfirmDelete
                  title={`Delete "${c.name}"?`}
                  description="This permanently deletes the course and all its topics, files, notes and exams."
                  onConfirm={() => {
                    deleteCourse(c.id);
                    toast.success("Course deleted");
                  }}
                />
              </div>

              {expanded && (
                <div className="space-y-2 border-t border-border bg-muted/30 p-3">
                  {c.topics.map((t) => (
                    <div key={t.id} className="flex items-center gap-2">
                      <Link
                        to="/courses/$courseId/$topicId"
                        params={{ courseId: c.id, topicId: t.id }}
                        className="min-w-0 flex-1"
                      >
                        <Card className="card-hover flex items-center gap-3 border-none bg-card p-3">
                          <FolderClosed className="h-5 w-5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {t.name}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <FileText className="h-3 w-3" /> {t.files.length} files ·{" "}
                              {t.exams.length} exams
                            </div>
                          </div>
                        </Card>
                      </Link>
                      <ConfirmDelete
                        title={`Delete topic "${t.name}"?`}
                        description="This permanently deletes the topic and all its files, notes and exams."
                        onConfirm={() => {
                          deleteTopic(c.id, t.id);
                          toast.success("Topic deleted");
                        }}
                      />
                    </div>
                  ))}
                  {c.topics.length === 0 && (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      No topics yet — add your first topic.
                    </p>
                  )}

                  <Dialog
                    open={topicFor === c.id}
                    onOpenChange={(o) => setTopicFor(o ? c.id : null)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center rounded-xl text-primary"
                      >
                        <Plus className="h-4 w-4" /> Add topic
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>New topic in {c.name}</DialogTitle>
                      </DialogHeader>
                      <Input
                        placeholder="Topic name (e.g. Krebs cycle)"
                        value={topicName}
                        onChange={(e) => setTopicName(e.target.value)}
                      />
                      <DialogFooter>
                        <Button
                          className="rounded-full"
                          onClick={() => {
                            if (!topicName.trim()) return;
                            addTopic(c.id, topicName.trim());
                            setTopicName("");
                            setTopicFor(null);
                          }}
                        >
                          Create topic
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
