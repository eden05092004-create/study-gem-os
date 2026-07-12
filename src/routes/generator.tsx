import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HelpCircle, Sparkles } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/generator")({
  component: GeneratorPage,
});

const COUNTS = [20, 50, 100];
const TYPES = [
  { id: "cloze", label: "Cloze" },
  { id: "matching", label: "Matching" },
  { id: "truefalse", label: "True / False" },
  { id: "short", label: "Short answer" },
  { id: "mcq", label: "Multiple choice" },
];

function GeneratorPage() {
  const navigate = useNavigate();
  const courses = useStore((s) => s.courses);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [count, setCount] = useState(50);
  const [types, setTypes] = useState<string[]>(["mcq"]);

  const course = courses.find((c) => c.id === courseId);
  const topicId = course?.topics[0]?.id;

  const toggle = (id: string) =>
    setTypes((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Practice"
        title="Question Generator"
        subtitle="Turn your materials into practice questions."
      />

      {courses.length === 0 ? (
        <EmptyGen />
      ) : (
        <div className="space-y-6">
          <Field label="Course">
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground/30"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Number of questions">
            <div className="flex flex-wrap gap-2">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`rounded-full border px-5 py-2 text-sm font-medium ${
                    count === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Question types">
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${
                    types.includes(t.id)
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          <button
            disabled={!topicId || types.length === 0}
            onClick={() =>
              course &&
              topicId &&
              navigate({
                to: "/generate-exam/$courseId/$topicId",
                params: { courseId: course.id, topicId },
              })
            }
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> Generate {count} questions
          </button>
        </div>
      )}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      {children}
    </div>
  );
}

function EmptyGen() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-14 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted">
        <HelpCircle className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-display text-lg font-semibold text-foreground">
        No courses to generate from
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a course and add materials first.
      </p>
    </div>
  );
}
