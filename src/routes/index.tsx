import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Clock,
  CalendarClock,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  LogOut,
  Settings,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({
  component: Home,
});

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function Home() {
  const { userName, studyHoursToday, questionsSolved, nextExamDate, courses } =
    useStore();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };


  const stats = [
    {
      label: "Study hours today",
      value: studyHoursToday.toString(),
      icon: Clock,
      tint: "bg-primary/10 text-primary",
    },
    {
      label: "Days until next exam",
      value: daysLeft(nextExamDate).toString(),
      icon: CalendarClock,
      tint: "bg-accent/40 text-accent-foreground",
    },
    {
      label: "Questions solved",
      value: questionsSolved.toString(),
      icon: CheckCircle2,
      tint: "bg-success/15 text-success",
    },
  ];

  const recent = courses.slice(0, 3);
  const firstTopic = courses[0]?.topics[0];

  return (
    <AppShell>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back 👋</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            {userName}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="rounded-full text-muted-foreground"
            aria-label="Settings"
          >
            <Link to="/settings">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full text-muted-foreground"
            onClick={signOut}
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>


      <div className="mb-6 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="soft-shadow border-none p-3 text-center">
            <div
              className={`mx-auto mb-2 grid h-9 w-9 place-items-center rounded-xl ${s.tint}`}
            >
              <s.icon className="h-4.5 w-4.5" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">{s.value}</div>
            <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
              {s.label}
            </div>
          </Card>
        ))}
      </div>

      <Card className="soft-shadow mb-6 overflow-hidden border-none bg-gradient-to-l from-primary to-secondary p-5 text-primary-foreground">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-semibold opacity-90">What to study now</span>
        </div>
        <h3 className="text-xl font-extrabold">
          {firstTopic ? `${courses[0].name} · ${firstTopic.name}` : "Start a new course"}
        </h3>
        <p className="mt-1 text-sm opacity-90">
          {firstTopic
            ? `Your next exam is in ${daysLeft(nextExamDate)} days — a good time to review this topic.`
            : "Create your first course to get started."}
        </p>
        {firstTopic && (
          <Button
            asChild
            variant="secondary"
            className="mt-4 rounded-full font-semibold"
          >
            <Link to="/exams">Start practicing</Link>
          </Button>
        )}
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Recent courses</h2>
        <Link
          to="/courses"
          className="flex items-center gap-1 text-sm font-medium text-primary"
        >
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      {recent.length === 0 ? (
        <Card className="border-none p-8 text-center">
          <p className="font-semibold text-foreground">No courses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first course to get started.
          </p>
          <Button asChild className="mt-4 rounded-full">
            <Link to="/courses">Create a course</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {recent.map((c) => (
            <Link key={c.id} to="/courses">
              <Card className="card-hover flex items-center gap-3 border-none bg-card p-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-muted text-xl">
                  {c.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.topics.length} topics
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
