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
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/courses")({
  component: Courses,
});

function Courses() {
  const { courses, addCourse, addTopic } = useStore();
  const [open, setOpen] = useState<string | null>(courses[0]?.id ?? null);
  const [courseName, setCourseName] = useState("");
  const [courseEmoji, setCourseEmoji] = useState("");
  const [newCourseOpen, setNewCourseOpen] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [topicFor, setTopicFor] = useState<string | null>(null);

  return (
    <AppShell>
      <PageTitle
        title="הקורסים שלי"
        subtitle="ארגנו חומרים לפי קורסים ונושאים"
        action={
          <Dialog open={newCourseOpen} onOpenChange={setNewCourseOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full">
                <Plus className="h-4 w-4" /> קורס
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>קורס חדש</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="שם הקורס (למשל אנטומיה)"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                />
                <Input
                  placeholder="אימוג'י (אופציונלי) 🧠"
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
                  צור קורס
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-3">
        {courses.map((c) => {
          const expanded = open === c.id;
          return (
            <Card key={c.id} className="overflow-hidden border-none p-0">
              <button
                onClick={() => setOpen(expanded ? null : c.id)}
                className="flex w-full items-center gap-3 p-4 text-right"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-muted text-xl">
                  {c.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.topics.length} נושאים
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                    expanded && "rotate-180",
                  )}
                />
              </button>

              {expanded && (
                <div className="space-y-2 border-t border-border bg-muted/30 p-3">
                  {c.topics.map((t) => (
                    <Link
                      key={t.id}
                      to="/courses/$courseId/$topicId"
                      params={{ courseId: c.id, topicId: t.id }}
                    >
                      <Card className="card-hover flex items-center gap-3 border-none bg-card p-3">
                        <FolderClosed className="h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-foreground">
                            {t.name}
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <FileText className="h-3 w-3" /> {t.files.length} קבצים ·{" "}
                            {t.exams.length} מבחנים
                          </div>
                        </div>
                      </Card>
                    </Link>
                  ))}

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
                        <Plus className="h-4 w-4" /> הוסף נושא
                      </Button>
                    </DialogTrigger>
                    <DialogContent dir="rtl">
                      <DialogHeader>
                        <DialogTitle>נושא חדש ב{c.name}</DialogTitle>
                      </DialogHeader>
                      <Input
                        placeholder="שם הנושא (למשל מעגל קרבס)"
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
                          צור נושא
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
