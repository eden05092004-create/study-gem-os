import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const nextExamDate = useStore((s) => s.nextExamDate);

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

  const exam = new Date(nextExamDate);
  const isExam = (d: number) =>
    exam.getFullYear() === cursor.y &&
    exam.getMonth() === cursor.m &&
    exam.getDate() === d;

  const shift = (delta: number) => {
    let m = cursor.m + delta;
    let y = cursor.y;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCursor({ y, m });
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        subtitle="See your exams and study days at a glance."
        action={
          <Link
            to="/planner"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <CalendarDays className="h-4 w-4" /> Study Planner
          </Link>
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
          {cells.map((d, i) => (
            <div
              key={i}
              className={`aspect-square rounded-xl p-2 text-sm ${
                d === null
                  ? ""
                  : isExam(d)
                    ? "bg-accent/15 font-semibold text-accent ring-1 ring-accent/40"
                    : isToday(d)
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "border border-border/60 text-foreground hover:bg-muted"
              }`}
            >
              {d && (
                <div className="flex h-full flex-col">
                  <span>{d}</span>
                  {isExam(d) && (
                    <span className="mt-auto text-[10px] font-medium">Exam</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
