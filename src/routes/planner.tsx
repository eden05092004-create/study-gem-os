import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Sparkles,
  CheckCircle2,
  Circle,
  Trash2,
  Plus,
  GraduationCap,
  Flame,
  Play,
  Sun,
  Zap,
  AlarmClock,
  X,
} from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { parseLectures } from "@/lib/lectures";
import { toast } from "sonner";

export const Route = createFileRoute("/planner")({
  component: Planner,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const REVIEW_GAP_DAYS = 3;
const REVIEW_GAP_DAYS_2 = 7;
const LECTURE_MINUTES = 45; // estimated time per lecture
const PREEXAM_WINDOW = 3;

type PlanItem = {
  id: string;
  number: string;
  name: string;
  topicName?: string;
  type: "study" | "review";
  done: boolean;
  hard?: boolean;
  /** id of the study item that spawned this review (avoids duplicates) */
  sourceId?: string;
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

function todayKey() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toKey(d);
}

function addDaysKey(k: string, n: number) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

function formatPlanDate(k: string) {
  const d = parseKey(k);
  return `${WEEKDAYS[d.getDay()]} · ${d.getMonth() + 1}/${d.getDate()}`;
}

function rid() {
  return Math.random().toString(36).slice(2, 10);
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
  for (const it of items) session.items.push(it);
  next.sort((a, b) => a.date.localeCompare(b.date));
  return next.filter((d) => d.sessions.some((s) => s.items.length > 0));
}

function newItem(l: LectureRef, type: "study" | "review"): PlanItem {
  return {
    id: rid(),
    number: l.number,
    name: l.name,
    topicName: l.topicName,
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

  const dayCapacity = new Map<string, number>();
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
      (k) => (dayCapacity.get(k) ?? 0) >= LECTURE_MINUTES && (!minKey || k >= minKey),
    );

  const courseOf = (l: LectureRef) => ({ id: l.courseId, name: l.courseName, emoji: l.emoji });

  for (const l of lectures) {
    const key = findDay();
    if (!key) continue;
    scheduled++;
    dayCapacity.set(key, (dayCapacity.get(key) ?? 0) - LECTURE_MINUTES);
    days = mergeItems(days, key, courseOf(l), [newItem(l, "study")]);

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

type ManualCourseRow = {
  key: string;
  courseId: string;
  topicName: string;
  lecturesText: string;
};

function Planner() {
  const courses = useStore((s) => s.courses);
  const mistakes = useStore((s) => s.mistakes);
  const navigate = useNavigate();

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

  // manual form (free text)
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualRows, setManualRows] = useState<ManualCourseRow[]>([
    { key: rid(), courseId: "", topicName: "", lecturesText: "" },
  ]);

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

  const persist = async (nextDays: PlanDay[], lectureIds = selectedLectures, exam = examDate) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;
    await supabase.from("study_plans").upsert(
      {
        user_id: user.id,
        exam_date: exam || new Date().toISOString().slice(0, 10),
        topic_ids: lectureIds,
        weekly_hours: weeklyHours,
        days: nextDays,
      },
      { onConflict: "user_id" },
    );
  };

  const toggleLecture = (id: string) =>
    setSelectedLectures((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

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

  // ---- manual (free text) ----
  const updateRow = (key: string, patch: Partial<ManualCourseRow>) =>
    setManualRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () =>
    setManualRows((rows) => [
      ...rows,
      { key: rid(), courseId: "", topicName: "", lecturesText: "" },
    ]);

  const removeRow = (key: string) =>
    setManualRows((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));

  const resetManual = () => {
    setManualRows([{ key: rid(), courseId: "", topicName: "", lecturesText: "" }]);
    setManualDate("");
  };

  const handleManualAdd = async () => {
    if (!manualDate) return toast.error("Pick a date");
    const filled = manualRows.filter((r) => r.courseId && r.lecturesText.trim());
    if (filled.length === 0)
      return toast.error("Add at least one course with lectures");

    let next = days;
    let total = 0;
    for (const row of filled) {
      const course = courses.find((c) => c.id === row.courseId);
      if (!course) continue;
      const parsed = parseLectures(row.lecturesText);
      if (parsed.length === 0) continue;
      const items: PlanItem[] = parsed.map((p) => ({
        id: rid(),
        number: p.number,
        name: p.name,
        topicName: row.topicName.trim() || undefined,
        type: "study",
        done: false,
      }));
      total += items.length;
      next = mergeItems(
        next,
        manualDate,
        { id: course.id, name: course.name, emoji: course.emoji },
        items,
      );
    }
    if (total === 0) return toast.error("No lectures found in the text");
    setDays(next);
    await persist(next);
    resetManual();
    setManualOpen(false);
    toast.success(`${total} lecture${total > 1 ? "s" : ""} added`);
  };

  // ---- spaced review on completion ----
  const addSpacedReviews = (
    base: PlanDay[],
    date: string,
    session: PlanSession,
    item: PlanItem,
  ): PlanDay[] => {
    let next = base;
    for (const gap of [REVIEW_GAP_DAYS, REVIEW_GAP_DAYS_2]) {
      const reviewDate = addDaysKey(date, gap);
      const already = next
        .find((d) => d.date === reviewDate)
        ?.sessions.find((s) => s.courseId === session.courseId)
        ?.items.some((x) => x.sourceId === item.id);
      if (already) continue;
      next = mergeItems(
        next,
        reviewDate,
        { id: session.courseId, name: session.courseName, emoji: session.emoji },
        [
          {
            id: rid(),
            number: item.number,
            name: item.name,
            topicName: item.topicName,
            type: "review",
            done: false,
            hard: item.hard,
            sourceId: item.id,
          },
        ],
      );
    }
    return next;
  };

  const toggleItem = async (date: string, itemId: string) => {
    const reviewTargets: { session: PlanSession; item: PlanItem }[] = [];
    let next = days.map((d) =>
      d.date === date
        ? {
            ...d,
            sessions: d.sessions.map((s) => ({
              ...s,
              items: s.items.map((it) => {
                if (it.id !== itemId) return it;
                const updated = { ...it, done: !it.done };
                if (updated.done && it.type === "study") {
                  reviewTargets.push({ session: s, item: updated });
                }
                return updated;
              }),
            })),
          }
        : d,
    );
    for (const t of reviewTargets) {
      next = addSpacedReviews(next, date, t.session, t.item);
    }
    setDays(next);
    await persist(next);
  };


  const toggleHard = async (date: string, itemId: string) => {
    const next = days.map((d) =>
      d.date === date
        ? {
            ...d,
            sessions: d.sessions.map((s) => ({
              ...s,
              items: s.items.map((it) =>
                it.id === itemId ? { ...it, hard: !it.hard } : it,
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

  // ---- auto reschedule missed ----
  const tKey = todayKey();

  const missedEntries = useMemo(() => {
    const out: { course: { id: string; name: string; emoji: string }; item: PlanItem }[] = [];
    for (const d of days) {
      if (d.date >= tKey) continue;
      for (const s of d.sessions) {
        for (const it of s.items) {
          if (!it.done) {
            out.push({
              course: { id: s.courseId, name: s.courseName, emoji: s.emoji },
              item: it,
            });
          }
        }
      }
    }
    return out;
  }, [days, tKey]);

  const redistributeMissed = async () => {
    if (missedEntries.length === 0) return;
    // remove missed (undone, past) items
    let next = days.map((d) =>
      d.date < tKey
        ? {
            ...d,
            sessions: d.sessions.map((s) => ({
              ...s,
              items: s.items.filter((it) => it.done),
            })),
          }
        : d,
    );
    next = next
      .map((d) => ({ ...d, sessions: d.sessions.filter((s) => s.items.length > 0) }))
      .filter((d) => d.sessions.length > 0);

    // target days: today..exam (or next N days if no exam)
    const targets: string[] = [];
    if (examDate && examDate >= tKey) {
      for (let k = tKey; k <= examDate; k = addDaysKey(k, 1)) targets.push(k);
    } else {
      for (let i = 0; i < missedEntries.length; i++) targets.push(addDaysKey(tKey, i));
    }

    missedEntries.forEach((entry, i) => {
      const date = targets[i % targets.length];
      next = mergeItems(next, date, entry.course, [{ ...entry.item, id: rid() }]);
    });

    setDays(next);
    await persist(next);
    toast.success(`Rescheduled ${missedEntries.length} missed lecture${missedEntries.length > 1 ? "s" : ""}`);
  };

  // ---- progress ----
  const allItems = days.flatMap((d) => d.sessions.flatMap((s) => s.items));
  const totalItems = allItems.length;
  const doneItems = allItems.filter((i) => i.done).length;
  const progress = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  const daysLeft = examDate
    ? Math.max(0, Math.round((parseKey(examDate).getTime() - parseKey(tKey).getTime()) / 86400000))
    : null;
  const perDayNeeded =
    daysLeft && daysLeft > 0 ? Math.ceil((totalItems - doneItems) / daysLeft) : totalItems - doneItems;

  const preExam = daysLeft !== null && daysLeft <= PREEXAM_WINDOW && daysLeft >= 0 && totalItems > 0;

  const todayDay = days.find((d) => d.date === tKey);
  const todayItems = todayDay?.sessions.flatMap((s) => s.items) ?? [];

  const hardItems = allItems.filter((i) => i.hard);

  // ---- reusable item row ----
  const ItemRow = ({ date, session, it }: { date: string; session: PlanSession; it: PlanItem }) => (
    <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5">
      <button
        onClick={() => toggleItem(date, it.id)}
        className="flex flex-1 items-center gap-3 text-left"
      >
        {it.done ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
        ) : (
          <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1">
          <span
            className={`block text-sm font-medium ${
              it.done ? "text-muted-foreground line-through" : "text-foreground"
            }`}
          >
            {it.number && <span className="font-mono">{it.number} – </span>}
            {it.name}
            {it.topicName && (
              <span className="ml-1 text-xs text-muted-foreground">· {it.topicName}</span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {it.type === "review" ? "🔁 Review" : "📖 Study"}
          </span>
        </span>
      </button>
      <button
        onClick={() => toggleHard(date, it.id)}
        aria-label="Mark as hard"
        title="Hard for me"
        className={it.hard ? "text-destructive" : "text-muted-foreground hover:text-destructive"}
      >
        <Flame className="h-4 w-4" fill={it.hard ? "currentColor" : "none"} />
      </button>
      <button
        onClick={() => navigate({ to: "/quiz" })}
        aria-label="Practice"
        title="Practice this"
        className="text-muted-foreground hover:text-primary"
      >
        <Play className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <AppShell>
      <PageTitle
        title="Study planner"
        subtitle="Build your schedule by date and lecture — write, track, and review"
        action={
          <div className="flex gap-2">
            {/* Manual free-text session dialog */}
            <Dialog
              open={manualOpen}
              onOpenChange={(o) => {
                setManualOpen(o);
                if (!o) resetManual();
              }}
            >
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

                  {manualRows.map((row, idx) => (
                    <div key={row.key} className="space-y-2 rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-bold">Course {idx + 1}</Label>
                        {manualRows.length > 1 && (
                          <button
                            onClick={() => removeRow(row.key)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove course"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <select
                        value={row.courseId}
                        onChange={(e) => updateRow(row.key, { courseId: e.target.value })}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Choose a course…</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.emoji} {c.name}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={row.topicName}
                        onChange={(e) => updateRow(row.key, { topicName: e.target.value })}
                        placeholder="Topic (optional)"
                        className="rounded-xl"
                      />
                      <Textarea
                        value={row.lecturesText}
                        onChange={(e) => updateRow(row.key, { lecturesText: e.target.value })}
                        placeholder={"Type or paste lectures, one per line:\n1010 – Protein Functions\n1039 – Methods of Protein Analysis I"}
                        className="min-h-28 rounded-xl font-mono text-sm"
                      />
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full rounded-full"
                    onClick={addRow}
                  >
                    <Plus className="h-4 w-4" /> Add another course
                  </Button>
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
                      <GraduationCap className="h-4 w-4 text-primary" /> Lectures to cover (
                      {selectedLectures.length})
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
            Add a session and write your lectures, or use Auto plan to schedule them with
            automatic reviews.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Today view */}
          <Card className="border-none bg-primary/5 p-5 ring-1 ring-primary/20">
            <div className="mb-3 flex items-center gap-2">
              <Sun className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Today · {formatPlanDate(tKey)}</h3>
            </div>
            {todayItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled for today 🎉</p>
            ) : (
              <>
                <div className="space-y-4">
                  {todayDay!.sessions.map((s) => (
                    <div key={s.courseId}>
                      <p className="mb-1.5 text-xs font-bold text-muted-foreground">
                        {s.emoji} {s.courseName}
                      </p>
                      <div className="space-y-2">
                        {s.items.map((it) => (
                          <ItemRow key={it.id} date={tKey} session={s} it={it} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  className="mt-4 w-full rounded-full"
                  onClick={() => navigate({ to: "/quiz" })}
                >
                  <Play className="h-4 w-4" /> Start studying
                </Button>
              </>
            )}
          </Card>

          {/* Pre-exam mode */}
          {preExam && (
            <Card className="border-none bg-accent/10 p-5 ring-1 ring-accent/40">
              <div className="mb-2 flex items-center gap-2">
                <Zap className="h-5 w-5 text-accent" />
                <h3 className="text-sm font-bold text-foreground">
                  ⚡ Pre-exam mode — final review
                </h3>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                {daysLeft === 0 ? "Exam is today" : `${daysLeft} day${daysLeft! > 1 ? "s" : ""} left`}{" "}
                — no new lectures. Focus on hard topics, past mistakes, and a full practice exam.
              </p>
              <div className="space-y-1.5 text-sm text-foreground">
                <p>🔥 {hardItems.length} lecture{hardItems.length !== 1 ? "s" : ""} flagged hard</p>
                <p>❌ {mistakes.length} mistake{mistakes.length !== 1 ? "s" : ""} to review</p>
              </div>
              <div className="mt-4 flex gap-2">
                <Button className="flex-1 rounded-full" onClick={() => navigate({ to: "/quiz" })}>
                  <Play className="h-4 w-4" /> Practice exam
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 rounded-full"
                  onClick={() => navigate({ to: "/mistakes" })}
                >
                  Review mistakes
                </Button>
              </div>
            </Card>
          )}

          {/* Missed / reschedule */}
          {missedEntries.length > 0 && (
            <Card className="border-none bg-destructive/5 p-4 ring-1 ring-destructive/20">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <AlarmClock className="h-4 w-4 text-destructive" />
                {missedEntries.length} lecture{missedEntries.length > 1 ? "s" : ""} missed
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Redistribute them across the remaining days before your exam.
              </p>
              <Button
                size="sm"
                className="mt-3 w-full rounded-full"
                onClick={redistributeMissed}
              >
                Reschedule missed lectures
              </Button>
            </Card>
          )}

          {/* Progress */}
          <Card className="border-none p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">
                {doneItems} of {totalItems} lectures done ({progress}%)
              </p>
              <span className="text-sm font-bold text-primary">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              {daysLeft !== null && (
                <span>📅 {daysLeft} day{daysLeft !== 1 ? "s" : ""} until exam</span>
              )}
              {totalItems - doneItems > 0 && daysLeft && daysLeft > 0 && (
                <span>🎯 {perDayNeeded}/day to keep up</span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full rounded-full text-destructive"
              onClick={handleReset}
            >
              <Trash2 className="h-4 w-4" /> Clear plan
            </Button>
          </Card>

          {/* Full plan by date */}
          <div className="space-y-3">
            {days.map((day) => {
              const dayItems = day.sessions.flatMap((s) => s.items);
              const allDone = dayItems.length > 0 && dayItems.every((i) => i.done);
              return (
                <Card
                  key={day.date}
                  className={`border-none p-4 ${allDone ? "opacity-70" : ""} ${
                    day.date === tKey ? "ring-1 ring-primary/30" : ""
                  }`}
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
                            <ItemRow key={it.id} date={day.date} session={s} it={it} />
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
