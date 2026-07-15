import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ClipboardList, Play, Clock, Search, Trash2 } from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { toast } from "sonner";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/exams")({
  component: Exams,
});

function Exams() {
  const courses = useStore((s) => s.courses);
  const trash = useStore((s) => s.trash);
  const deleteExam = useStore((s) => s.deleteExam);
  const deleteExams = useStore((s) => s.deleteExams);
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const all = useMemo(
    () =>
      courses.flatMap((c) =>
        c.topics.flatMap((t) => t.exams.map((e) => ({ course: c, topic: t, exam: e }))),
      ),
    [courses],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      ({ course, topic, exam }) =>
        exam.title.toLowerCase().includes(q) ||
        course.name.toLowerCase().includes(q) ||
        topic.name.toLowerCase().includes(q),
    );
  }, [all, search]);

  const toggleSelect = (examId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(examId)) next.delete(examId);
      else next.add(examId);
      return next;
    });

  const allFilteredSelected = filtered.length > 0 && filtered.every(({ exam }) => selected.has(exam.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach(({ exam }) => next.delete(exam.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach(({ exam }) => next.add(exam.id));
        return next;
      });
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    try {
      await deleteExams(ids);
      setSelected(new Set());
      toast.success(`${ids.length} exam${ids.length === 1 ? "" : "s"} deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the selected exams");
    }
  };

  return (
    <AppShell>
      <PageTitle
        title="Exams"
        subtitle="Practice in real exam style"
        action={
          <Link
            to="/trash"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-4 w-4" /> Trash{trash.length > 0 ? ` (${trash.length})` : ""}
          </Link>
        }
      />

      {all.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No exams yet — create an exam inside a topic
        </p>
      ) : (
        <>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exams by title, course, or topic…"
              className="rounded-full pl-10"
            />
          </div>

          <div className="mb-4 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
              Select all{search ? " (filtered)" : ""}
            </label>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs font-medium text-muted-foreground underline underline-offset-2"
                >
                  Clear
                </button>
                <ConfirmDelete
                  title={`Delete ${selected.size} exam${selected.size === 1 ? "" : "s"}?`}
                  description="This permanently deletes the exam(s) and their questions right away. This cannot be undone."
                  label="Delete"
                  onConfirm={bulkDelete}
                  trigger={
                    <Button size="sm" variant="destructive" className="rounded-full">
                      <Trash2 className="h-4 w-4" /> Delete selected
                    </Button>
                  }
                />
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No exams match "{search}"
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map(({ course, topic, exam }) => (
                <Card key={exam.id} className="border-none p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(exam.id)}
                      onCheckedChange={() => toggleSelect(exam.id)}
                      className="mt-1"
                    />
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-foreground">{exam.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="rounded-full text-[11px]">
                          {course.emoji} {course.name}
                        </Badge>
                        <Badge variant="outline" className="rounded-full text-[11px]">
                          {topic.name}
                        </Badge>
                      </div>
                    </div>
                    <ConfirmDelete
                      title={`Delete "${exam.title}"?`}
                      description="This permanently deletes the exam and its questions right away. This cannot be undone."
                      label="Delete"
                      onConfirm={async () => {
                        try {
                          await deleteExam(course.id, topic.id, exam.id);
                          toast.success("Exam deleted");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Could not delete the exam");
                        }
                      }}
                    />
                  </div>
                  <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{exam.questions.length} questions</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {exam.durationMin} min
                    </span>
                  </div>
                  <Button
                    className="w-full rounded-full"
                    onClick={() =>
                      navigate({
                        to: "/exam/$courseId/$topicId/$examId",
                        params: {
                          courseId: course.id,
                          topicId: topic.id,
                          examId: exam.id,
                        },
                      })
                    }
                  >
                    <Play className="h-4 w-4" /> Start exam
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
