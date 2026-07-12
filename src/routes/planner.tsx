import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Sparkles,
  BookOpen,
  RefreshCw,
  CheckCircle2,
  Circle,
  Trash2,
} from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/planner")({
  component: Planner,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const REVIEW_GAP_DAYS = 3;

type PlanItem = {
  id: string;
  topicName: string;
  type: "study" | "review";
  minutes: number;
  done: boolean;
};

type PlanDay = {
  date: string; // YYYY-MM-DD
  weekday: number;
  items: PlanItem[];
};

type TopicOption = { id: string; name: string; courseName: string; emoji: string };

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function parseKey(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatPlanDate(k: string) {
  const d = parseKey(k);
  return `${WEEKDAYS[d.getDay()]} · ${d.getMonth() + 1}/${d.getDate()}`;
}

function generatePlan(
  examDateKey: string,
  topics: TopicOption[],
  weeklyHours: Record<number, number>,
): PlanDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = parseKey(examDateKey);

  // collect study days (from today up to exam date) that have available hours
  const dayKeys: string[] = [];
  for (
    let d = new Date(today);
    d <= exam;
    d.setDate(d.getDate() + 1)
  ) {
    if ((weeklyHours[d.getDay()] ?? 0) > 0) dayKeys.push(toKey(d));
  }
  if (dayKeys.length === 0) return [];

  // sessions bucketed by day key
  const buckets = new Map<string, { topicName: string; type: "study" | "review" }[]>();
  for (const k of dayKeys) buckets.set(k, []);

  // 1) assign an initial study session for each topic, round-robin across days
  topics.forEach((t, i) => {
    const key = dayKeys[i % dayKeys.length];
    buckets.get(key)!.push({ topicName: t.name, type: "study" });

    // 2) schedule a review REVIEW_GAP_DAYS later
    const studyDate = parseKey(key);
    const target = new Date(studyDate);
    target.setDate(target.getDate() + REVIEW_GAP_DAYS);
    const reviewKey = dayKeys.find((dk) => parseKey(dk) >= target);
    if (reviewKey) {
      buckets.get(reviewKey)!.push({ topicName: t.name, type: "review" });
    }
  });

  // 3) build days, splitting each day's hours evenly across its sessions
  const days: PlanDay[] = [];
  for (const key of dayKeys) {
    const sessions = buckets.get(key)!;
    if (sessions.length === 0) continue;
    const totalMinutes = (weeklyHours[parseKey(key).getDay()] ?? 0) * 60;
    const per = Math.round(totalMinutes / sessions.length);
    days.push({
      date: key,
      weekday: parseKey(key).getDay(),
      items: sessions.map((s, idx) => ({
        id: `${key}-${idx}`,
        topicName: s.topicName,
        type: s.type,
        minutes: per,
        done: false,
      })),
    });
  }
  return days;
}

function Planner() {
  const courses = useStore((s) => s.courses);

  const topicOptions = useMemo<TopicOption[]>(
    () =>
      courses.flatMap((c) =>
        c.topics.map((t) => ({
          id: t.id,
          name: t.name,
          courseName: c.name,
          emoji: c.emoji,
        })),
      ),
    [courses],
  );

  const [examDate, setExamDate] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [weeklyHours, setWeeklyHours] = useState<Record<number, number>>({
    0: 2,
    1: 2,
    2: 2,
    3: 2,
    4: 2,
    5: 0,
    6: 0,
  });
  const [days, setDays] = useState<PlanDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(true);

  // load saved plan
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("study_plans")
        .select("*")
        .maybeSingle();
      if (!active) return;
      if (data) {
        setExamDate(data.exam_date as string);
        setSelectedTopics((data.topic_ids as string[]) ?? []);
        setWeeklyHours((data.weekly_hours as Record<number, number>) ?? {});
        const savedDays = (data.days as PlanDay[]) ?? [];
        setDays(savedDays);
        setShowForm(savedDays.length === 0);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const toggleTopic = (id: string) =>
    setSelectedTopics((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  const persist = async (nextDays: PlanDay[]) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;
    await supabase.from("study_plans").upsert(
      {
        user_id: user.id,
        exam_date: examDate,
        topic_ids: selectedTopics,
        weekly_hours: weeklyHours,
        days: nextDays,
      },
      { onConflict: "user_id" },
    );
  };

  const handleGenerate = async () => {
    if (!examDate) {
      toast.error("Choose an exam date");
      return;
    }
    if (selectedTopics.length === 0) {
      toast.error("Select at least one topic");
      return;
    }
    const chosen = topicOptions.filter((t) => selectedTopics.includes(t.id));
    const generated = generatePlan(examDate, chosen, weeklyHours);
    if (generated.length === 0) {
      toast.error("No study days available before the exam — update your hours or date");
      return;
    }
    setDays(generated);
    setShowForm(false);
    await persist(generated);
    toast.success("Study plan created 🎉");
  };

  const toggleItem = async (dayDate: string, itemId: string) => {
    const next = days.map((d) =>
      d.date === dayDate
        ? {
            ...d,
            items: d.items.map((it) =>
              it.id === itemId ? { ...it, done: !it.done } : it,
            ),
          }
        : d,
    );
    setDays(next);
    await persist(next);
  };

  const handleReset = async () => {
    setDays([]);
    setShowForm(true);
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase.from("study_plans").delete().eq("user_id", userData.user.id);
    }
  };

  const totalItems = days.reduce((n, d) => n + d.items.length, 0);
  const doneItems = days.reduce(
    (n, d) => n + d.items.filter((i) => i.done).length,
    0,
  );
  const progress = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  return (
    <AppShell>
      <PageTitle
        title="Study planner"
        subtitle="Build a smart schedule until your exam, with automatic reviews"
      />

      {loading ? null : showForm ? (
        <div className="space-y-5">
          {/* exam date */}
          <Card className="border-none p-4">
            <Label className="mb-2 flex items-center gap-2 text-sm font-bold">
              <CalendarRange className="h-4 w-4 text-primary" /> Exam date
            </Label>
            <Input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="rounded-xl"
            />
          </Card>

          {/* topics */}
          <Card className="border-none p-4">
            <Label className="mb-3 flex items-center gap-2 text-sm font-bold">
              <BookOpen className="h-4 w-4 text-primary" /> Topics to cover
            </Label>
            {topicOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No topics yet — create courses and topics first.
              </p>
            ) : (
              <div className="space-y-3">
                {courses.map((c) =>
                  c.topics.length ? (
                    <div key={c.id}>
                      <p className="mb-1.5 text-xs font-bold text-muted-foreground">
                        {c.emoji} {c.name}
                      </p>
                      <div className="space-y-2">
                        {c.topics.map((t) => (
                          <label
                            key={t.id}
                            className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2"
                          >
                            <Checkbox
                              checked={selectedTopics.includes(t.id)}
                              onCheckedChange={() => toggleTopic(t.id)}
                            />
                            <span className="text-sm text-foreground">{t.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </Card>

          {/* weekly hours */}
          <Card className="border-none p-4">
            <Label className="mb-3 block text-sm font-bold">
              שעות לימוד זמינות בכל יום בשבוע
            </Label>
            <div className="space-y-2">
              {WEEKDAYS.map((name, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground">יום {name}</span>
                  <Input
                    type="number"
                    min={0}
                    max={16}
                    step={0.5}
                    value={weeklyHours[idx] ?? 0}
                    onChange={(e) =>
                      setWeeklyHours((prev) => ({
                        ...prev,
                        [idx]: Number(e.target.value),
                      }))
                    }
                    className="w-20 rounded-xl text-center"
                  />
                </div>
              ))}
            </div>
          </Card>

          <Button className="w-full rounded-full" onClick={handleGenerate}>
            <Sparkles className="h-4 w-4" /> בנה תוכנית לימודים
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* progress + actions */}
          <Card className="border-none p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">
                התקדמות — {doneItems}/{totalItems}
              </p>
              <span className="text-sm font-bold text-primary">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 rounded-full"
                onClick={() => setShowForm(true)}
              >
                <RefreshCw className="h-4 w-4" /> ערוך
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 rounded-full text-destructive"
                onClick={handleReset}
              >
                <Trash2 className="h-4 w-4" /> אפס
              </Button>
            </div>
          </Card>

          {/* days */}
          <div className="space-y-3">
            {days.map((day) => {
              const allDone = day.items.every((i) => i.done);
              return (
                <Card
                  key={day.date}
                  className={`border-none p-4 ${allDone ? "opacity-70" : ""}`}
                >
                  <h3 className="mb-3 text-sm font-bold text-foreground">
                    {formatPlanDate(day.date)}
                  </h3>
                  <div className="space-y-2">
                    {day.items.map((it) => (
                      <button
                        key={it.id}
                        onClick={() => toggleItem(day.date, it.id)}
                        className="flex w-full items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5 text-right"
                      >
                        {it.done ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                        ) : (
                          <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="flex-1">
                          <span
                            className={`block text-sm font-medium ${
                              it.done
                                ? "text-muted-foreground line-through"
                                : "text-foreground"
                            }`}
                          >
                            {it.topicName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {it.type === "review" ? "🔁 חזרה" : "📖 לימוד"} ·{" "}
                            {it.minutes} דק׳
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </AppShell>
  );
}
