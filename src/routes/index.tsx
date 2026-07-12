import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Clock,
  CalendarClock,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  LogOut,
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

  const stats = [
    {
      label: "שעות לימוד היום",
      value: studyHoursToday.toString(),
      icon: Clock,
      tint: "bg-primary/10 text-primary",
    },
    {
      label: "ימים למבחן הבא",
      value: daysLeft(nextExamDate).toString(),
      icon: CalendarClock,
      tint: "bg-accent/40 text-accent-foreground",
    },
    {
      label: "שאלות שנפתרו",
      value: questionsSolved.toString(),
      icon: CheckCircle2,
      tint: "bg-success/15 text-success",
    },
  ];

  const recent = courses.slice(0, 3);
  const firstTopic = courses[0]?.topics[0];

  return (
    <AppShell>
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">שלום וברוך שובך 👋</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {userName}
        </h1>
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
          <span className="text-sm font-semibold opacity-90">מה ללמוד עכשיו</span>
        </div>
        <h3 className="text-xl font-extrabold">
          {firstTopic ? `${courses[0].name} · ${firstTopic.name}` : "התחילו קורס חדש"}
        </h3>
        <p className="mt-1 text-sm opacity-90">
          המבחן הקרוב בעוד {daysLeft(nextExamDate)} ימים — כדאי לחזור על הנושא הזה.
        </p>
        {firstTopic && (
          <Button
            asChild
            variant="secondary"
            className="mt-4 rounded-full font-semibold"
          >
            <Link to="/exams">התחל תרגול</Link>
          </Button>
        )}
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">קורסים אחרונים</h2>
        <Link
          to="/courses"
          className="flex items-center gap-1 text-sm font-medium text-primary"
        >
          הצג הכל <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
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
                  {c.topics.length} נושאים
                </div>
              </div>
              <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
