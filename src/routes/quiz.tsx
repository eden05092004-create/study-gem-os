import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ClipboardCheck,
  GraduationCap,
  Timer,
  Target,
  Play,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/quiz")({
  component: QuizPage,
});

const MODES: { id: string; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "practice", label: "Practice", desc: "No timer, instant feedback", icon: ClipboardCheck },
  { id: "exam", label: "Exam", desc: "Full exam simulation", icon: GraduationCap },
  { id: "timed", label: "Timed", desc: "Beat the clock", icon: Timer },
  { id: "weak", label: "Weak spots", desc: "Focus on your mistakes", icon: Target },
];

function QuizPage() {
  const courses = useStore((s) => s.courses);
  const mistakes = useStore((s) => s.mistakes);
  const deleteExam = useStore((s) => s.deleteExam);
  const navigate = useNavigate();
  const [mode, setMode] = useState("practice");

  const all = courses.flatMap((c) =>
    c.topics.flatMap((t) => t.exams.map((e) => ({ course: c, topic: t, exam: e }))),
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Practice"
        title="Quiz & Exam"
        subtitle="Choose a mode and start practicing in real exam style."
      />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-2xl border p-5 text-left transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-foreground/20"
              }`}
            >
              <m.icon className="mb-3 h-5 w-5" />
              <div className="font-display text-lg font-semibold">{m.label}</div>
              <div
                className={`mt-0.5 text-xs ${active ? "opacity-80" : "text-muted-foreground"}`}
              >
                {m.desc}
              </div>
            </button>
          );
        })}
      </div>

      {mode === "weak" ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="font-display text-lg font-semibold text-foreground">
            {mistakes.length} mistakes to review
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Retry only the blanks you previously got wrong.
          </p>
          <button
            disabled={mistakes.length === 0}
            onClick={() => navigate({ to: "/mistakes" })}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Play className="h-4 w-4" /> Retry mistakes
          </button>
        </div>
      ) : all.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-14 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted">
            <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-display text-lg font-semibold text-foreground">
            No exams yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create or generate an exam inside a topic to start practicing.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {all.map(({ course, topic, exam }) => (
            <div
              key={exam.id}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="eyebrow">
                  {course.name} · {topic.name}
                </span>
                <ConfirmDelete
                  title={`Delete "${exam.title}"?`}
                  description="This exam will be moved to Trash and permanently deleted after 30 days unless you restore it."
                  label="Move to Trash"
                  onConfirm={async () => {
                    try {
                      await deleteExam(course.id, topic.id, exam.id);
                      toast.success("Exam moved to Trash");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not delete the exam");
                    }
                  }}
                />
              </div>
              <h3 className="mt-1 font-display text-lg font-semibold text-foreground">
                {exam.title}
              </h3>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{exam.questions.length} questions</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {exam.durationMin} min
                </span>
              </div>
              <button
                onClick={() =>
                  navigate({
                    to: "/exam/$courseId/$topicId/$examId",
                    params: { courseId: course.id, topicId: topic.id, examId: exam.id },
                  })
                }
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                <Play className="h-4 w-4" /> Start {mode}
              </button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
