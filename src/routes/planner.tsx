import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Circle,
  Trash2,
  Plus,
  GraduationCap,
  CheckCheck,
  AlertTriangle,
} from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/planner")({
  component: Planner,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const REVIEW_GAP_DAYS = 3;
const LECTURE_MINUTES = 45; // estimated time per lecture

type PlanItem = {
  id: string;
  lectureId: string;
  number: string;
  name: string;
  type: "study" | "review";
  done: boolean;
};

type PlanSession = {
  courseId: string;
  courseName: string;
  emoji: string;
  items: PlanItem[];
};

type PlanDay = {
  date: string; // YYYY-MM-DD
  sessions: PlanSession[];
};

type LectureRef = {
  lectureId: string;
  number: string;
  name: string;
  courseId: string;
  courseName: string;
  emoji: string;
  topicName: string;
};

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

/** Insert plan items into a day, grouping them into per-course sessions. */
function mergeItems(
  days: PlanDay[],
  date: string,
  course: { id: string; name: string; emoji: string },
  items: PlanItem[],
): PlanDay[] {
  const next = days.map((d) => ({ ...d, sessions: d.sessions.map((s) => ({ ...s })) }));
  let day = next.find((d) => d.date === date);
  if (!day) {
    day = { date, sessions: [] };
    next.push(day);
  }
  let session = day.sessions.find((s) => s.courseId === course.id);
  if (!session) {
    session = { courseId: course.id, courseName: course.name, emoji: course.emoji, items: [] };
    day.sessions.push(session);
  }
  // avoid duplicate study items for the same lecture
  for (const it of items) {
    const exists = session.items.some(
      (x) => x.lectureId === it.lectureId && x.type === it.type,
    );
    if (!exists) session.items.push(it);
  }
  next.sort((a, b) => a.date.localeCompare(b.date));
  return next.filter((d) => d.sessions.some((s) => s.items.length > 0));
}

function newItem(l: LectureRef, type: "study" | "review"): PlanItem {
  return {
    id: `${l.lectureId}-${type}-${Math.random().toString(36).slice(2, 8)}`,
    lectureId: l.lectureId,
    number: l.number,
    name: l.name,
    type,
    done: false,
  };
}

/** Auto-generate a plan. Returns days + how many selected lectures got scheduled. */
function generatePlan(
  examDateKey: string,
  lectures: LectureRef[],
  weeklyHours: Record<number, number>,
): { days: PlanDay[]; scheduled: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = parseKey(examDateKey);

  const dayCapacity = new Map<string, number>(); // remaining minutes
  const dayKeys: string[] = [];
  for (let d = new Date(today); d <= exam; d.setDate(d.getDate() + 1)) {
    const mins = (weeklyHours[d.getDay()] ?? 0) * 60;
    if (mins > 0) {
      const k = toKey(d);
      dayKeys.push(k);
      dayCapacity.set(k, mins);
    }
  }
  if (dayKeys.length === 0) return { days: [], scheduled: 0 };

  let days: PlanDay[] = [];
  let scheduled = 0;

  const findDay = (minKey?: string) =>
    dayKeys.find(
      (k) =>
        (dayCapacity.get(k) ?? 0) >= LECTURE_MINUTES &&
        (!minKey || k >= minKey),
    );

  const courseOf = (l: LectureRef) => ({ id: l.courseId, name: l.courseName, emoji: l.emoji });

  for (const l of lectures) {
    const key = findDay();
    if (!key) continue; // no capacity — remains unscheduled (reported)
    scheduled++;
    dayCapacity.set(key, (dayCapacity.get(key) ?? 0) - LECTURE_MINUTES);
    days = mergeItems(days, key, courseOf(l), [newItem(l, "study")]);

    // schedule a review REVIEW_GAP_DAYS later, if capacity allows
    const target = new Date(parseKey(key));
    target.setDate(target.getDate() + REVIEW_GAP_DAYS);
    const reviewKey = findDay(toKey(target));
    if (reviewKey) {
      dayCapacity.set(reviewKey, (dayCapacity.get(reviewKey) ?? 0) - LECTURE_MINUTES);
      days = mergeItems(days, reviewKey, courseOf(l), [newItem(l, "review")]);
    }
  }

  return { days, scheduled };
}

function Planner() {
  const courses = useStore((s) => s.courses);

  const lectureRefs = useMemo<LectureRef[]>(
    () =>
      courses.flatMap((c) =>
        c.topics.flatMap((t) =>
          t.lectures.map((l) => ({
            lectureId: l.id,
            number: l.number,
            name: l.name,
            courseId: c.id,
            courseName: c.name,
            emoji: c.emoji,
            topicName: t.name,
          })),
        ),
      ),
    [courses],
  );

  const [days, setDays] = useState<PlanDay[]>([]);
  const [loading, setLoading] = useState(true);

  // auto form
  const [examDate, setExamDate] = useState("");
  const [selectedLectures, setSelectedLectures] = useState<string[]>([]);
  const [weeklyHours, setWeeklyHours] = useState<Record<number, number>>({
    0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 0, 6: 0,
  });
  const [autoOpen, setAutoOpen] = useState(false);

  // manual form
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualCourse, setManualCourse] = useState("");
  const [manualLectures, setManualLectures] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("study_plans").select("*").maybeSingle();
      if (!active) return;
      if (data) {
        setExamDate((data.exam_date as string) ?? "");
        setSelectedLectures((data.topic_ids as string[]) ?? []);
        setWeeklyHours((data.weekly_hours as Record<number, number>) ?? weeklyHours);
        setDays((data.days as PlanDay[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = async (nextDays: PlanDay[], lectureIds = selectedLectures) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;
    await supabase.from("study_plans").upsert(
      {
        user_id: user.id,
        exam_date: examDate || null,
        topic_ids: lectureIds,
        weekly_hours: weeklyHours,
        days: nextDays,
      },
      { onConflict: "user_id" },
    );
  };

  const toggleLecture = (id: string) =>
    setSelectedLectures((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const toggleManualLecture = (id: string) =>
    setManualLectures((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const handleAuto = async () => {
    if (!examDate) return toast.error("Choose an exam date");
    if (selectedLectures.length === 0) return toast.error("Select at least one lecture");
    const chosen = lectureRefs.filter((l) => selectedLectures.includes(l.lectureId));
    const { days: generated, scheduled } = generatePlan(examDate, chosen, weeklyHours);
    if (generated.length === 0) {
      return toast.error("No study days available — increase hours or move the exam date");
    }
    setDays(generated);
    await persist(generated);
    setAutoOpen(false);
    if (scheduled < chosen.length) {
      toast.warning(
        `Only ${scheduled} of ${chosen.length} lectures fit — add more hours or an earlier start`,
        { duration: 6000 },
      );
    } else {
      toast.success(`Plan created — all ${chosen.length} lectures scheduled 🎉`);
    }
  };

  const handleManualAdd = async () => {
    if (!manualDate) return toast.error("Pick a date");
    if (!manualCourse) return toast.error("Pick a course");
    if (manualLectures.length === 0) return toast.error("Pick at least one lecture");
    const course = courses.find((c) => c.id === manualCourse)!;
    const refs = lectureRefs.filter(
      (l) => l.courseId === manualCourse && manualLectures.includes(l.lectureId),
    );
    const next = mergeItems(
      days,
      manualDate,
      { id: course.id, name: course.name, emoji: course.emoji },
      refs.map((l) => newItem(l, "study")),
    );
    setDays(next);
    await persist(next);
    setManualLectures([]);
    setManualOpen(false);
    toast.success("Session added");
  };

  const toggleItem = async (date: string, itemId: string) => {
    const next = days.map((d) =>
      d.date === date
        ? {
            ...d,
            sessions: d.sessions.map((s) => ({
              ...s,
              items: s.items.map((it) =>
                it.id === itemId ? { ...it, done: !it.done } : it,
              ),
            })),
          }
        : d,
    );
    setDays(next);
    await persist(next);
  };

  const deleteSession = async (date: string, courseId: string) => {
    let next = days.map((d) =>
      d.date === date
        ? { ...d, sessions: d.sessions.filter((s) => s.courseId !== courseId) }
        : d,
    );
    next = next.filter((d) => d.sessions.length > 0);
    setDays(next);
    await persist(next);
  };

  const handleReset = async () => {
    setDays([]);
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase.from("study_plans").delete().eq("user_id", userData.user.id);
    }
    toast.success("Plan cleared");
  };

  const allItems = days.flatMap((d) => d.sessions.flatMap((s) => s.items));
  const totalItems = allItems.length;
  const doneItems = allItems.filter((i) => i.done).length;
  const progress = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  const manualCourseLectures = lectureRefs.filter((l) => l.courseId === manualCourse);

  return (
    <AppShell>
      <PageTitle
        title="Study planner"
        subtitle="Build your schedule by date and lecture — manually or automatically"
        action={
          <div className="flex gap-2">
            {/* Manual session dialog */}
            <Dialog open={manualOpen} onOpenChange={setManualOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-full">
                  <Plus className="h-4 w-4" /> Session
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add a study session</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="mb-1.5 block text-sm">Date</Label>
                    <Input
                      type="date"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-sm">Course / subject</Label>
                    <select
                      value={manualCourse}
                      onChange={(e) => {
                        setManualCourse(e.target.value);
                        setManualLectures([]);
                      }}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Choose a course…</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.emoji} {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {manualCourse && (
                    <div>
                      <Label className="mb-1.5 block text-sm">Lectures</Label>
                      {manualCourseLectures.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No lectures in this course yet.
                        </p>
                      ) : (
                        <div className="max-h-56 space-y-1.5 overflow-y-auto">
                          {manualCourseLectures.map((l) => (
                            <label
                              key={l.lectureId}
                              className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2"
                            >
                              <Checkbox
                                checked={manualLectures.includes(l.lectureId)}
                                onCheckedChange={() => toggleManualLecture(l.lectureId)}
                              />
                              <span className="text-sm text-foreground">
                                {l.number && (
                                  <span className="font-mono font-semibold">
                                    {l.number}
                                  </span>
                                )}{" "}
                                {l.name}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button className="rounded-full" onClick={handleManualAdd}>
                    Add session
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Auto plan dialog */}
            <Dialog open={autoOpen} onOpenChange={setAutoOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full">
                  <Sparkles className="h-4 w-4" /> Auto plan
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Generate a study plan</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="mb-1.5 flex items-center gap-2 text-sm font-bold">
                      <CalendarRange className="h-4 w-4 text-primary" /> Exam date
                    </Label>
                    <Input
                      type="date"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>

                  <div>
                    <Label className="mb-2 flex items-center gap-2 text-sm font-bold">
                      <GraduationCap className="h-4 w-4 text-primary" /> Lectures to
                      cover ({selectedLectures.length})
                    </Label>
                    {lectureRefs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No lectures yet — add lectures inside a topic first.
                      </p>
                    ) : (
                      <div className="max-h-64 space-y-3 overflow-y-auto">
                        {courses.map((c) =>
                          c.topics.some((t) => t.lectures.length) ? (
                            <div key={c.id}>
                              <p className="mb-1 text-xs font-bold text-muted-foreground">
                                {c.emoji} {c.name}
                              </p>
                              {c.topics.map((t) =>
                                t.lectures.length ? (
                                  <div key={t.id} className="mb-1 pl-1">
                                    <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                                      {t.name}
                                    </p>
                                    <div className="space-y-1">
                                      {t.lectures.map((l) => (
                                        <label
                                          key={l.id}
                                          className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-1.5"
                                        >
                                          <Checkbox
                                            checked={selectedLectures.includes(l.id)}
                                            onCheckedChange={() => toggleLecture(l.id)}
                                          />
                                          <span className="text-sm text-foreground">
                                            {l.number && (
                                              <span className="font-mono font-semibold">
                                                {l.number}
                                              </span>
                                            )}{" "}
                                            {l.name}
                                          </span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                ) : null,
                              )}
                            </div>
                          ) : null,
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="mb-2 block text-sm font-bold">
                      Available hours per weekday
                    </Label>
                    <div className="space-y-2">
                      {WEEKDAYS.map((name, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-foreground">{name}</span>
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
                    <p className="mt-2 text-xs text-muted-foreground">
                      Estimated {LECTURE_MINUTES} min per lecture.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button className="rounded-full" onClick={handleAuto}>
                    <Sparkles className="h-4 w-4" /> Generate plan
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {loading ? null : days.length === 0 ? (
        <Card className="border-none p-10 text-center">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="font-semibold text-foreground">No study plan yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Add a session manually, or use Auto plan to schedule your selected
            lectures with automatic reviews.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card className="border-none p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">
                Progress — {doneItems}/{totalItems}
              </p>
              <span className="text-sm font-bold text-primary">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full rounded-full text-destructive"
              onClick={handleReset}
            >
              <Trash2 className="h-4 w-4" /> Clear plan
            </Button>
          </Card>

          <div className="space-y-3">
            {days.map((day) => {
              const dayItems = day.sessions.flatMap((s) => s.items);
              const allDone = dayItems.length > 0 && dayItems.every((i) => i.done);
              return (
                <Card
                  key={day.date}
                  className={`border-none p-4 ${allDone ? "opacity-70" : ""}`}
                >
                  <h3 className="mb-3 text-sm font-bold text-foreground">
                    {formatPlanDate(day.date)}
                  </h3>
                  <div className="space-y-4">
                    {day.sessions.map((s) => (
                      <div key={s.courseId}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-xs font-bold text-muted-foreground">
                            {s.emoji} {s.courseName}
                          </p>
                          <button
                            onClick={() => deleteSession(day.date, s.courseId)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove session"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          {s.items.map((it) => (
                            <button
                              key={it.id}
                              onClick={() => toggleItem(day.date, it.id)}
                              className="flex w-full items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5 text-left"
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
                                  {it.number && (
                                    <span className="font-mono">{it.number} – </span>
                                  )}
                                  {it.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {it.type === "review" ? "🔁 Review" : "📖 Study"}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
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
