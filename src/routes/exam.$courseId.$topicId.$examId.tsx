import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, Play, Clock, ClipboardList } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ExamRunner, type TimerConfig } from "@/components/ExamRunner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/exam/$courseId/$topicId/$examId")({
  component: ExamPage,
});

type TimerChoice = "none" | "total" | "perQuestion";
const TIMER_CHOICES: { value: TimerChoice; label: string }[] = [
  { value: "none", label: "No timer" },
  { value: "total", label: "Countdown timer" },
  { value: "perQuestion", label: "Time per question" },
];
const TOTAL_DURATIONS = [15, 30, 45, 60, 90, 120] as const;
const PER_QUESTION_SECONDS = [15, 30, 45, 60, 90, 120] as const;

function ExamPage() {
  const { courseId, topicId, examId } = Route.useParams();
  const recordExamResult = useStore((s) => s.recordExamResult);
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const exam = topic?.exams.find((e) => e.id === examId);

  const [started, setStarted] = useState(false);
  const [timerChoice, setTimerChoice] = useState<TimerChoice>("total");

  const [totalMinutes, setTotalMinutes] = useState<number>(exam?.durationMin ?? 60);
  const [customTotal, setCustomTotal] = useState(false);
  const [customTotalValue, setCustomTotalValue] = useState("");

  const [perQSeconds, setPerQSeconds] = useState<number>(60);
  const [customPerQ, setCustomPerQ] = useState(false);
  const [customPerQValue, setCustomPerQValue] = useState("");

  if (!exam) {
    return (
      <AppShell>
        <p className="py-10 text-center text-sm text-muted-foreground">Exam not found</p>
      </AppShell>
    );
  }

  const finalTotalMinutes = customTotal
    ? Math.min(Math.max(Number(customTotalValue) || 0, 1), 300)
    : totalMinutes;
  const finalPerQSeconds = customPerQ
    ? Math.min(Math.max(Number(customPerQValue) || 0, 5), 1800)
    : perQSeconds;

  const timer: TimerConfig =
    timerChoice === "none"
      ? { mode: "none" }
      : timerChoice === "total"
        ? { mode: "total", totalMinutes: finalTotalMinutes }
        : { mode: "perQuestion", secondsPerQuestion: finalPerQSeconds };

  const invalidCustom =
    (timerChoice === "total" && customTotal && (!customTotalValue || finalTotalMinutes < 1)) ||
    (timerChoice === "perQuestion" && customPerQ && (!customPerQValue || finalPerQSeconds < 5));

  if (!started) {
    return (
      <AppShell>
        <Link
          to="/exams"
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Exams
        </Link>
        <h1 className="mb-4 text-xl font-extrabold text-foreground">{exam.title}</h1>

        <Card className="mb-5 border-none p-5">
          <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
            <ClipboardList className="h-4 w-4" /> {exam.questions.length} questions
          </div>

          <Label className="mb-2 block">Timer</Label>
          <div className="mb-4 flex flex-wrap gap-2">
            {TIMER_CHOICES.map((c) => (
              <Button
                key={c.value}
                variant={timerChoice === c.value ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setTimerChoice(c.value)}
              >
                {c.label}
              </Button>
            ))}
          </div>

          {timerChoice === "total" && (
            <>
              <Label className="mb-2 block text-xs text-muted-foreground">Total minutes</Label>
              <div className="flex flex-wrap gap-2">
                {TOTAL_DURATIONS.map((d) => (
                  <Button
                    key={d}
                    variant={!customTotal && totalMinutes === d ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => {
                      setCustomTotal(false);
                      setTotalMinutes(d);
                    }}
                  >
                    {d}
                  </Button>
                ))}
                <Button
                  variant={customTotal ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setCustomTotal(true)}
                >
                  Custom
                </Button>
              </div>
              {customTotal && (
                <Input
                  type="number"
                  min={1}
                  max={300}
                  placeholder="Minutes"
                  className="mt-3"
                  value={customTotalValue}
                  onChange={(e) => setCustomTotalValue(e.target.value)}
                />
              )}
            </>
          )}

          {timerChoice === "perQuestion" && (
            <>
              <Label className="mb-2 block text-xs text-muted-foreground">Seconds per question</Label>
              <div className="flex flex-wrap gap-2">
                {PER_QUESTION_SECONDS.map((s) => (
                  <Button
                    key={s}
                    variant={!customPerQ && perQSeconds === s ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => {
                      setCustomPerQ(false);
                      setPerQSeconds(s);
                    }}
                  >
                    {s}
                  </Button>
                ))}
                <Button
                  variant={customPerQ ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setCustomPerQ(true)}
                >
                  Custom
                </Button>
              </div>
              {customPerQ && (
                <Input
                  type="number"
                  min={5}
                  max={1800}
                  placeholder="Seconds"
                  className="mt-3"
                  value={customPerQValue}
                  onChange={(e) => setCustomPerQValue(e.target.value)}
                />
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Each question gets its own countdown — once it expires (or you move on), you can't go back.
              </p>
            </>
          )}
        </Card>

        <Button className="w-full rounded-full" disabled={invalidCustom} onClick={() => setStarted(true)}>
          <Play className="h-4 w-4" /> Start exam
          {timerChoice === "total" && (
            <span className="ml-1 flex items-center gap-1 opacity-80">
              <Clock className="h-3.5 w-3.5" /> {finalTotalMinutes} min
            </span>
          )}
          {timerChoice === "perQuestion" && (
            <span className="ml-1 flex items-center gap-1 opacity-80">
              <Clock className="h-3.5 w-3.5" /> {finalPerQSeconds}s/question
            </span>
          )}
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/exams"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Exams
      </Link>
      <h1 className="mb-4 text-xl font-extrabold text-foreground">{exam.title}</h1>
      <ExamRunner
        title={exam.title}
        questions={exam.questions}
        timer={timer}
        onFinish={(answers) => recordExamResult(courseId, topicId, examId, answers)}
      />
    </AppShell>
  );
}
