import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HelpCircle, Sparkles } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import { MaterialPicker, EMPTY_SELECTION, type MaterialSelection } from "@/components/MaterialPicker";

type GeneratorSearch = { courseId?: string; topicId?: string };

export const Route = createFileRoute("/generator")({
  validateSearch: (search: Record<string, unknown>): GeneratorSearch => ({
    courseId: typeof search.courseId === "string" ? search.courseId : undefined,
    topicId: typeof search.topicId === "string" ? search.topicId : undefined,
  }),
  component: GeneratorPage,
});

function GeneratorPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const courses = useStore((s) => s.courses);
  const [courseId, setCourseId] = useState(search.courseId ?? courses[0]?.id ?? "");
  const course = courses.find((c) => c.id === courseId);
  const [topicId, setTopicId] = useState(search.topicId ?? course?.topics[0]?.id ?? "");
  const topic = course?.topics.find((t) => t.id === topicId);
  const [material, setMaterial] = useState<MaterialSelection>(EMPTY_SELECTION);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Practice"
        title="Question Generator"
        subtitle="Choose exactly what material the AI should generate from."
      />

      {courses.length === 0 ? (
        <EmptyGen />
      ) : (
        <div className="space-y-6">
          <Field label="Course">
            <select
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                const c = courses.find((x) => x.id === e.target.value);
                setTopicId(c?.topics[0]?.id ?? "");
                setMaterial(EMPTY_SELECTION);
              }}
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground/30"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Topic">
            <select
              value={topicId}
              onChange={(e) => {
                setTopicId(e.target.value);
                setMaterial(EMPTY_SELECTION);
              }}
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground/30"
            >
              {course?.topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>

          {course && (
            <Field label="Material to include">
              <MaterialPicker topics={course.topics} value={material} onChange={setMaterial} />
            </Field>
          )}

          <button
            disabled={!topicId}
            onClick={() =>
              course &&
              topicId &&
              navigate({
                to: "/generate-exam/$courseId/$topicId",
                params: { courseId: course.id, topicId },
                search: { lectureIds: material.lectureIds, fileIds: material.fileIds },
              })
            }
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> Continue
          </button>
          {topic && material.lectureIds.length === 0 && material.fileIds.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nothing selected — the exam will be generated from general knowledge of "{topic.name}" only,
              not grounded in specific material.
            </p>
          )}
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
