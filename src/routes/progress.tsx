import { createFileRoute } from "@tanstack/react-router";
import { Clock, BookOpen, CheckCircle2, AlertOctagon, TrendingUp } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/progress")({
  component: ProgressPage,
});

function ProgressPage() {
  const { studyHoursToday, questionsSolved, courses, mistakes } = useStore();
  const topicCount = courses.reduce((n, c) => n + c.topics.length, 0);

  const stats = [
    { label: "Study time today", value: `${studyHoursToday}h`, icon: Clock },
    { label: "Courses", value: courses.length.toString(), icon: BookOpen },
    { label: "Topics", value: topicCount.toString(), icon: TrendingUp },
    { label: "Questions solved", value: questionsSolved.toString(), icon: CheckCircle2 },
    { label: "Open mistakes", value: mistakes.length.toString(), icon: AlertOctagon },
  ];

  const byCourse = courses.map((c) => ({
    name: c.name,
    emoji: c.emoji,
    count: mistakes.filter((m) => m.courseId === c.id).length,
  }));
  const maxMistakes = Math.max(1, ...byCourse.map((b) => b.count));

  return (
    <AppShell>
      <PageHeader
        eyebrow="You"
        title="Progress"
        subtitle="Track your study effort and where to focus next."
      />

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="soft-shadow rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">{s.label}</span>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="font-display text-3xl font-semibold text-foreground">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <p className="eyebrow mb-1">Focus areas</p>
        <h2 className="font-display text-xl font-semibold text-foreground">
          Mistakes by course
        </h2>
      </div>

      {byCourse.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center text-sm text-muted-foreground">
          No data yet — add courses and take a quiz to see your progress.
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
          {byCourse.map((b) => (
            <div key={b.name} className="flex items-center gap-4">
              <div className="w-40 shrink-0 truncate text-sm font-medium text-foreground">
                {b.emoji} {b.name}
              </div>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(b.count / maxMistakes) * 100}%` }}
                />
              </div>
              <div className="w-8 shrink-0 text-right text-sm text-muted-foreground">
                {b.count}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
