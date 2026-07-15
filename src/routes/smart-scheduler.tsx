import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  AlertTriangle,
  CheckCircle2,
  Circle,
  TriangleAlert,
  CalendarClock,
  Trash2,
  Dna,
  Microscope,
  FlaskConical,
  HeartPulse,
  Shield,
  Pill,
  Stethoscope,
  Bone,
  BookOpen,
  RefreshCw,
  X,
} from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { parseLectures } from "@/lib/lectures";
import {
  checkFeasibility,
  detectBottlenecks,
  hasSpareCapacity,
  type Lecture as SchedulerLecture,
  type PlanDay,
  type FeasibilityResult,
} from "@/lib/scheduler";

export const Route = createFileRoute("/smart-scheduler")({
  component: SmartScheduler,
});

const STORAGE_KEY = "studyos.smartScheduler.v2";

const COURSE_ICONS = [Dna, Microscope, FlaskConical, HeartPulse, Shield, Pill, Stethoscope, Bone];

function iconFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return COURSE_ICONS[hash % COURSE_ICONS.length];
}

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromDateInput(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDay(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/* ---------------- data model: everything the user writes by hand ---------------- */

type CourseBlock = {
  id: string;
  courseName: string;
  lecturesText: string;
};

type DayEntry = {
  id: string;
  date: string; // YYYY-MM-DD, "" until chosen
  courses: CourseBlock[];
};

function newCourseBlock(): CourseBlock {
  return { id: rid(), courseName: "", lecturesText: "" };
}

function newDay(): DayEntry {
  return { id: rid(), date: "", courses: [newCourseBlock()] };
}

function parsedLecturesOf(block: CourseBlock) {
  return parseLectures(block.lecturesText).map((l, i) => ({ ...l, key: `${block.id}:${i}` }));
}

type StoredState = {
  startDate: string;
  deadline: string;
  hoursPerDay: number;
  minutesPerLecture: number;
  includeReviewTime: boolean;
  unavailableDays: string[];
  days: DayEntry[];
  completed: string[];
};

function loadStored(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredState;
  } catch {
    return null;
  }
}

function SmartScheduler() {
  const stored = useMemo(loadStored, []);

  const [startDate, setStartDate] = useState(stored?.startDate ?? toDateInput(new Date()));
  const [deadline, setDeadline] = useState(stored?.deadline ?? toDateInput(new Date(Date.now() + 13 * 86400000)));
  const [hoursPerDay, setHoursPerDay] = useState(stored?.hoursPerDay ?? 3);
  const [minutesPerLecture, setMinutesPerLecture] = useState(stored?.minutesPerLecture ?? 45);
  const [includeReviewTime, setIncludeReviewTime] = useState(stored?.includeReviewTime ?? true);
  const [unavailableDays, setUnavailableDays] = useState<string[]>(stored?.unavailableDays ?? []);
  const [newUnavailable, setNewUnavailable] = useState("");
  const [days, setDays] = useState<DayEntry[]>(stored?.days ?? [newDay()]);
  const [completed, setCompleted] = useState<Set<string>>(new Set(stored?.completed ?? []));

  useEffect(() => {
    const payload: StoredState = {
      startDate,
      deadline,
      hoursPerDay,
      minutesPerLecture,
      includeReviewTime,
      unavailableDays,
      days,
      completed: Array.from(completed),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [startDate, deadline, hoursPerDay, minutesPerLecture, includeReviewTime, unavailableDays, days, completed]);

  /* ---------------- editing the day / course / lecture-text tree ---------------- */

  const addDay = () => setDays((d) => [...d, newDay()]);
  const removeDay = (dayId: string) => setDays((d) => d.filter((x) => x.id !== dayId));
  const updateDayDate = (dayId: string, date: string) =>
    setDays((d) => d.map((x) => (x.id === dayId ? { ...x, date } : x)));

  const addCourseBlock = (dayId: string) =>
    setDays((d) => d.map((x) => (x.id === dayId ? { ...x, courses: [...x.courses, newCourseBlock()] } : x)));
  const removeCourseBlock = (dayId: string, blockId: string) =>
    setDays((d) =>
      d.map((x) => (x.id === dayId ? { ...x, courses: x.courses.filter((c) => c.id !== blockId) } : x)),
    );
  const updateCourseName = (dayId: string, blockId: string, courseName: string) =>
    setDays((d) =>
      d.map((x) =>
        x.id === dayId
          ? { ...x, courses: x.courses.map((c) => (c.id === blockId ? { ...c, courseName } : c)) }
          : x,
      ),
    );
  const updateLecturesText = (dayId: string, blockId: string, lecturesText: string) =>
    setDays((d) =>
      d.map((x) =>
        x.id === dayId
          ? { ...x, courses: x.courses.map((c) => (c.id === blockId ? { ...c, lecturesText } : c)) }
          : x,
      ),
    );

  const toggleDone = (key: string) =>
    setCompleted((p) => {
      const next = new Set(p);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addUnavailable = () => {
    if (!newUnavailable) return;
    setUnavailableDays((p) => (p.includes(newUnavailable) ? p : [...p, newUnavailable].sort()));
    setNewUnavailable("");
  };
  const removeUnavailable = (d: string) => setUnavailableDays((p) => p.filter((x) => x !== d));

  const clearAll = () => {
    setDays([newDay()]);
    setCompleted(new Set());
    localStorage.removeItem(STORAGE_KEY);
  };

  /* ---------------- run the scheduling engine's analysis on what's been written ---------------- */

  const totalLectures = useMemo(
    () => days.reduce((s, d) => s + d.courses.reduce((s2, c) => s2 + parsedLecturesOf(c).length, 0), 0),
    [days],
  );

  const feasibility: FeasibilityResult | null = useMemo(() => {
    if (totalLectures === 0) return null;
    let i = 0;
    const schedulerLectures: SchedulerLecture[] = days.flatMap((d) =>
      d.courses.flatMap((c) =>
        parsedLecturesOf(c).map((p) => ({
          id: p.key,
          title: p.name || p.number,
          course: c.courseName || "Untitled",
          discipline: c.courseName || "Untitled",
          originalOrder: i++,
        })),
      ),
    );
    return checkFeasibility({
      lectures: schedulerLectures,
      startDate: fromDateInput(startDate),
      deadline: fromDateInput(deadline),
      hoursPerDay,
      minutesPerLecture,
      includeReviewTime,
      unavailableDays: unavailableDays.map(fromDateInput),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, startDate, deadline, hoursPerDay, minutesPerLecture, includeReviewTime, unavailableDays, totalLectures]);

  const reviewIsEmbedded = useMemo(() => {
    if (totalLectures === 0) return false;
    let i = 0;
    const schedulerLectures: SchedulerLecture[] = days.flatMap((d) =>
      d.courses.flatMap((c) =>
        parsedLecturesOf(c).map((p) => ({
          id: p.key,
          title: p.name || p.number,
          course: c.courseName || "Untitled",
          discipline: c.courseName || "Untitled",
          originalOrder: i++,
        })),
      ),
    );
    return (
      includeReviewTime &&
      !hasSpareCapacity({
        lectures: schedulerLectures,
        startDate: fromDateInput(startDate),
        deadline: fromDateInput(deadline),
        hoursPerDay,
        minutesPerLecture,
        includeReviewTime,
        unavailableDays: unavailableDays.map(fromDateInput),
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, startDate, deadline, hoursPerDay, minutesPerLecture, includeReviewTime, unavailableDays, totalLectures]);

  const bottlenecks = useMemo(() => {
    const planDays: PlanDay[] = days
      .filter((d) => d.date && d.courses.some((c) => parsedLecturesOf(c).length > 0))
      .map((d) => {
        const courseNames = Array.from(new Set(d.courses.map((c) => c.courseName.trim()).filter(Boolean)));
        const label = courseNames.length > 0 ? courseNames.join(" + ") : "Untitled";
        const items: SchedulerLecture[] = d.courses.flatMap((c, ci) =>
          parsedLecturesOf(c).map((p, i) => ({
            id: p.key,
            title: p.name || p.number,
            course: c.courseName || "Untitled",
            discipline: c.courseName || "Untitled",
            originalOrder: ci * 1000 + i,
          })),
        );
        const date = fromDateInput(d.date);
        return {
          date,
          dateKey: d.date,
          course: label,
          discipline: label,
          review: [],
          items,
          estimatedHours: (items.length * minutesPerLecture) / 60,
          totalWeight: items.length,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return detectBottlenecks(planDays);
  }, [days, minutesPerLecture]);

  const missedCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let count = 0;
    for (const d of days) {
      if (!d.date || fromDateInput(d.date) >= today) continue;
      for (const c of d.courses) {
        for (const p of parsedLecturesOf(c)) {
          if (!completed.has(p.key)) count++;
        }
      }
    }
    return count;
  }, [days, completed]);

  return (
    <AppShell>
      <PageTitle
        title="Smart scheduler"
        subtitle="Write your own day-by-day plan — the engine checks feasibility and flags trouble spots as you go."
        action={
          <Button size="sm" className="rounded-full" onClick={addDay}>
            <Plus className="h-4 w-4" /> Add day
          </Button>
        }
      />

      <div className="space-y-5">
        {/* Study parameters */}
        <Card className="border-none p-5">
          <h3 className="mb-4 text-sm font-bold text-foreground">Study parameters</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <Label className="mb-1.5 block text-xs">Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Deadline</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Hours / day</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(Number(e.target.value))}
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Min / lecture</Label>
              <Input
                type="number"
                min={1}
                value={minutesPerLecture}
                onChange={(e) => setMinutesPerLecture(Number(e.target.value))}
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <Checkbox checked={includeReviewTime} onCheckedChange={(v) => setIncludeReviewTime(!!v)} />
              Include review time
            </label>
          </div>

          <div className="mt-4">
            <Label className="mb-1.5 block text-xs">Unavailable days</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={newUnavailable}
                onChange={(e) => setNewUnavailable(e.target.value)}
                className="w-40 rounded-xl"
              />
              <Button size="sm" variant="outline" className="rounded-full" onClick={addUnavailable}>
                Add
              </Button>
              {unavailableDays.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1">
                  {d}
                  <button onClick={() => removeUnavailable(d)} aria-label="Remove">
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </Card>

        {/* Feasibility — persistent, dismissible only by choice is unnecessary here since it's
            always a live read-out of what's currently written, not a one-time generation event. */}
        {feasibility && (
          <>
            {!feasibility.feasible ? (
              <Alert variant="destructive" className="border-none ring-1 ring-destructive/30">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>This plan doesn't fit your committed hours</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{feasibility.message}</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {feasibility.resolutions.map((r, i) => (
                      <div key={i} className="rounded-lg bg-background/60 p-2.5 text-xs text-foreground">
                        {r.description}
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-none ring-1 ring-primary/20">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertTitle>Feasible</AlertTitle>
                <AlertDescription>
                  {totalLectures} lecture{totalLectures === 1 ? "" : "s"} written so far over{" "}
                  {feasibility.availableDays} available day{feasibility.availableDays === 1 ? "" : "s"} — about{" "}
                  {feasibility.requiredPerDay}/day, {round1(feasibility.hoursRequiredPerDay)}h/day of your{" "}
                  {feasibility.hoursCommitted}h committed.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {bottlenecks.length > 0 && (
          <Card className="border-none bg-accent/10 p-4 ring-1 ring-accent/40">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-bold text-foreground">Where this plan will break</h3>
            </div>
            <ul className="space-y-1.5 text-sm text-foreground">
              {bottlenecks.map((b, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {b.message}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {totalLectures > 0 && (
          <Card className="border-none p-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Review protocol</h3>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {!includeReviewTime
                ? "Review is turned off for this plan."
                : reviewIsEmbedded
                  ? "No spare days — do a 15–20 min active-recall pass over yesterday's lectures first thing each day, plus a 30 min weekly sweep."
                  : "You have spare days — use them as dedicated review days at the end of each course block rather than padding daily hours."}
            </p>
          </Card>
        )}

        {missedCount > 0 && (
          <Card className="border-none bg-destructive/5 p-4 ring-1 ring-destructive/20">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <CalendarClock className="h-4 w-4 text-destructive" />
              {missedCount} lecture{missedCount === 1 ? "" : "s"} from past days aren't checked off yet
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Tick them off if they're done, or move them to a later day below.
            </p>
          </Card>
        )}

        {/* The plan itself — write it day by day */}
        <div className="space-y-4">
          {days.map((day) => {
            const dayTotal = day.courses.reduce((s, c) => s + parsedLecturesOf(c).length, 0);
            const dayHours = round1((dayTotal * minutesPerLecture) / 60);
            return (
              <Card key={day.id} className="border-none p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Input
                    type="date"
                    value={day.date}
                    onChange={(e) => updateDayDate(day.id, e.target.value)}
                    className="w-44 rounded-xl"
                  />
                  <div className="flex items-center gap-3">
                    {dayTotal > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {dayTotal} lecture{dayTotal === 1 ? "" : "s"} · {dayHours}h
                      </span>
                    )}
                    <button
                      onClick={() => removeDay(day.id)}
                      aria-label="Remove day"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {day.courses.map((block) => {
                    const parsed = parsedLecturesOf(block);
                    const Icon = block.courseName ? iconFor(block.courseName) : BookOpen;
                    return (
                      <div key={block.id} className="rounded-xl border border-border p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-primary" />
                          <Input
                            value={block.courseName}
                            onChange={(e) => updateCourseName(day.id, block.id, e.target.value)}
                            placeholder="Course name"
                            className="rounded-lg text-sm font-semibold"
                          />
                          {day.courses.length > 1 && (
                            <button
                              onClick={() => removeCourseBlock(day.id, block.id)}
                              aria-label="Remove course"
                              className="shrink-0 text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <Textarea
                          value={block.lecturesText}
                          onChange={(e) => updateLecturesText(day.id, block.id, e.target.value)}
                          placeholder={
                            "Type or paste lectures, one per line:\n1010 – Protein Functions\n1039 – Methods of Protein Analysis I"
                          }
                          className="min-h-24 rounded-xl font-mono text-sm"
                        />
                        {parsed.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {parsed.map((l) => (
                              <button
                                key={l.key}
                                onClick={() => toggleDone(l.key)}
                                className="flex w-full items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2 text-left"
                              >
                                {completed.has(l.key) ? (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                                ) : (
                                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                                )}
                                <span
                                  className={`text-sm ${
                                    completed.has(l.key) ? "text-muted-foreground line-through" : "text-foreground"
                                  }`}
                                >
                                  {l.number && <span className="font-mono font-semibold">{l.number} – </span>}
                                  {l.name}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full rounded-full"
                  onClick={() => addCourseBlock(day.id)}
                >
                  <Plus className="h-4 w-4" /> Add another course to this day
                </Button>
              </Card>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-full" onClick={addDay}>
            <Plus className="h-4 w-4" /> Add day
          </Button>
          <Button variant="outline" className="flex-1 rounded-full text-destructive" onClick={clearAll}>
            <Trash2 className="h-4 w-4" /> Clear everything
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
