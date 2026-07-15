import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Pencil } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { supabase } from "@/integrations/supabase/client";
import { useStore, type CalendarEvent, type CalendarEventType } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TYPE_OPTIONS: { value: CalendarEventType; label: string }[] = [
  { value: "exam", label: "Exam" },
  { value: "lecture", label: "Lecture" },
  { value: "task", label: "Task" },
  { value: "other", label: "Other" },
];

const TYPE_DOT: Record<CalendarEventType, string> = {
  exam: "bg-accent",
  lecture: "bg-primary",
  task: "bg-success",
  other: "bg-muted-foreground",
};

const TYPE_CELL: Record<CalendarEventType, string> = {
  exam: "bg-accent/15 ring-1 ring-accent/40",
  lecture: "bg-primary/10 ring-1 ring-primary/30",
  task: "bg-success/10 ring-1 ring-success/30",
  other: "bg-muted ring-1 ring-border",
};

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Minimal shape read from the Study Planner's saved plan — just enough to show sessions on their dates. */
type StudyPlanDay = {
  date: string;
  sessions: { courseName: string; items: { name: string; type: string }[] }[];
};

function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const calendarEvents = useStore((s) => s.calendarEvents);
  const addCalendarEvent = useStore((s) => s.addCalendarEvent);
  const updateCalendarEvent = useStore((s) => s.updateCalendarEvent);
  const deleteCalendarEvent = useStore((s) => s.deleteCalendarEvent);

  const [studyDays, setStudyDays] = useState<StudyPlanDay[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("study_plans").select("days").maybeSingle();
      if (!active) return;
      setStudyDays((data?.days as StudyPlanDay[]) ?? []);
    })();
    return () => {
      active = false;
    };
  }, []);
  const studyDaysByDate = new Map(studyDays.map((d) => [d.date, d]));

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formType, setFormType] = useState<CalendarEventType>("other");
  const [formNotes, setFormNotes] = useState("");

  const first = new Date(cursor.y, cursor.m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === cursor.y &&
    today.getMonth() === cursor.m &&
    today.getDate() === d;

  const shift = (delta: number) => {
    let m = cursor.m + delta;
    let y = cursor.y;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCursor({ y, m });
  };

  const resetForm = (date: string) => {
    setEditingId(null);
    setFormTitle("");
    setFormDate(date);
    setFormType("other");
    setFormNotes("");
  };

  const openDay = (date: string) => {
    setSelectedDate(date);
    resetForm(date);
  };

  const startEdit = (event: CalendarEvent) => {
    setEditingId(event.id);
    setFormTitle(event.title);
    setFormDate(event.date);
    setFormType(event.type);
    setFormNotes(event.notes ?? "");
  };

  const submitForm = async () => {
    if (!formTitle.trim()) {
      toast.error("Give the event a title");
      return;
    }
    if (!formDate) {
      toast.error("Choose a date");
      return;
    }
    const payload = {
      title: formTitle.trim(),
      date: formDate,
      type: formType,
      notes: formNotes.trim() || undefined,
    };
    if (editingId) {
      await updateCalendarEvent(editingId, payload);
      toast.success("Event updated");
    } else {
      await addCalendarEvent(payload);
      toast.success("Event added");
    }
    resetForm(selectedDate ?? formDate);
  };

  const selectedEvents = selectedDate
    ? calendarEvents.filter((e) => e.date === selectedDate)
    : [];
  const selectedStudyDay = selectedDate ? studyDaysByDate.get(selectedDate) : undefined;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        subtitle="See your exams and study days at a glance."
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => {
                const n = new Date();
                openDay(dateKey(n.getFullYear(), n.getMonth(), n.getDate()));
              }}
            >
              <Plus className="h-4 w-4" /> Add event
            </Button>
            <Link
              to="/planner"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground"
            >
              <CalendarDays className="h-4 w-4" /> Study Planner
            </Link>
          </div>
        }
      />

      <div className="soft-shadow rounded-2xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold text-foreground">
            {MONTHS[cursor.m]} {cursor.y}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => shift(-1)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => shift(1)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={i} className="aspect-square" />;
            const key = dateKey(cursor.y, cursor.m, d);
            const dayEvents = calendarEvents.filter((e) => e.date === key);
            const hasStudySession = studyDaysByDate.has(key);
            const primaryType = dayEvents[0]?.type;

            return (
              <button
                key={i}
                onClick={() => openDay(key)}
                className={cn(
                  "flex aspect-square flex-col rounded-xl p-2 text-left text-sm transition-colors",
                  primaryType
                    ? cn(TYPE_CELL[primaryType], "font-semibold text-foreground")
                    : isToday(d)
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "border border-border/60 text-foreground hover:bg-muted",
                )}
              >
                <span>{d}</span>
                <div className="mt-auto flex flex-wrap items-center gap-1">
                  {dayEvents.slice(0, 4).map((e) => (
                    <span key={e.id} className={cn("h-1.5 w-1.5 rounded-full", TYPE_DOT[e.type])} />
                  ))}
                  {hasStudySession && (
                    <span className="h-1.5 w-1.5 rounded-full border border-current opacity-60" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {TYPE_OPTIONS.map((t) => (
            <span key={t.value} className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", TYPE_DOT[t.value])} /> {t.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-muted-foreground opacity-60" /> Study session
          </span>
        </div>
      </div>

      <Dialog open={selectedDate !== null} onOpenChange={(o) => !o && setSelectedDate(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedDate}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {selectedStudyDay && selectedStudyDay.sessions.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="mb-2 text-xs font-bold text-muted-foreground">Study plan sessions</p>
                <div className="space-y-2">
                  {selectedStudyDay.sessions.map((s, si) => (
                    <div key={si} className="text-sm">
                      <p className="font-semibold text-foreground">{s.courseName}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.items.map((it) => it.name).join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedEvents.length > 0 && (
              <div className="space-y-2">
                {selectedEvents.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start gap-2 rounded-xl border border-border p-3"
                  >
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TYPE_DOT[e.type])} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{e.title}</p>
                      <p className="text-xs capitalize text-muted-foreground">{e.type}</p>
                      {e.notes && <p className="mt-1 text-xs text-muted-foreground">{e.notes}</p>}
                    </div>
                    <button
                      onClick={() => startEdit(e)}
                      aria-label="Edit event"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <ConfirmDelete
                      title={`Delete "${e.title}"?`}
                      description="This permanently removes the event from your calendar."
                      onConfirm={async () => {
                        await deleteCalendarEvent(e.id);
                        if (editingId === e.id) resetForm(selectedDate ?? e.date);
                        toast.success("Event deleted");
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="text-xs font-bold text-muted-foreground">
                {editingId ? "Edit event" : "Add event"}
              </p>
              <div>
                <Label className="mb-1.5 block text-xs">Title</Label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Biochemistry final"
                  className="rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5 block text-xs">Date</Label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">Type</Label>
                  <Select value={formType} onValueChange={(v) => setFormType(v as CalendarEventType)}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Notes (optional)</Label>
                <Textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Anything worth remembering…"
                  className="rounded-xl"
                />
              </div>
              <div className="flex gap-2">
                {editingId && (
                  <Button
                    variant="outline"
                    className="flex-1 rounded-full"
                    onClick={() => resetForm(selectedDate ?? formDate)}
                  >
                    Cancel
                  </Button>
                )}
                <Button className="flex-1 rounded-full" onClick={submitForm}>
                  {editingId ? "Save changes" : "Add event"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
