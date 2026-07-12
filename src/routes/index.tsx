import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Clock,
  BookOpen,
  Layers,
  AlertOctagon,
  ArrowRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({
  component: Home,
});

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

type Stat = { label: string; value: string; hint: string; icon: LucideIcon };

function Home() {
  const { userName, studyHoursToday, questionsSolved, nextExamDate, courses, mistakes } =
    useStore();

  const topicCount = courses.reduce((n, c) => n + c.topics.length, 0);

  const stats: Stat[] = [
    {
      label: "Study time",
      value: `${studyHoursToday}h`,
      hint: "logged today",
      icon: Clock,
    },
    {
      label: "Courses",
      value: courses.length.toString(),
      hint: `${topicCount} topics`,
      icon: BookOpen,
    },
    {
      label: "Questions",
      value: questionsSolved.toString(),
      hint: "solved",
      icon: Layers,
    },
    {
      label: "Mistakes",
      value: mistakes.length.toString(),
      hint: "to review",
      icon: AlertOctagon,
    },
  ];

  const recent = courses.slice(0, 4);
  const firstTopic = courses[0]?.topics[0];

  return (
    <AppShell>
      <header className="mb-8">
        <p className="eyebrow mb-2">{greeting()}</p>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
          {userName || "Welcome"}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {courses.length
            ? `You have ${topicCount} topics across ${courses.length} courses. Keep going.`
            : "Create your first course to start building your workspace."}
        </p>
      </header>

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="soft-shadow rounded-2xl border border-border bg-card p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="eyebrow">{s.label}</span>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="font-display text-3xl font-semibold text-foreground">
              {s.value}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>
          </div>
        ))}
      </div>

      <div className="mb-10 overflow-hidden rounded-3xl border border-border bg-primary p-8 text-primary-foreground">
        <div className="mb-2 flex items-center gap-2 opacity-80">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            What to study now
          </span>
        </div>
        <h2 className="font-display text-2xl font-semibold">
          {firstTopic
            ? `${courses[0].name} · ${firstTopic.name}`
            : "Start a new course"}
        </h2>
        <p className="mt-2 max-w-lg text-sm opacity-80">
          {firstTopic
            ? `Your next exam is in ${daysLeft(nextExamDate)} days — a good moment to review this topic.`
            : "Add courses, upload materials, and let StudyOS help you prepare."}
        </p>
        <Link
          to={firstTopic ? "/quiz" : "/courses"}
          className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-primary-foreground px-5 py-2.5 text-sm font-semibold text-primary transition-opacity hover:opacity-90"
        >
          {firstTopic ? "Start practicing" : "Create a course"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Library</p>
          <h2 className="font-display text-xl font-semibold text-foreground">
            Recent courses
          </h2>
        </div>
        <Link
          to="/courses"
          className="flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="font-display text-lg font-semibold text-foreground">
            No courses yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first course to get started.
          </p>
          <Link
            to="/courses"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Create a course
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {recent.map((c) => (
            <Link
              key={c.id}
              to="/courses"
              className="card-hover flex items-center gap-4 rounded-2xl border border-border bg-card p-5"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-muted text-2xl">
                {c.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-lg font-semibold text-foreground">
                  {c.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.topics.length} topics
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
