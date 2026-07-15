import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, XCircle, CheckCircle2, Trash2, Play, Clock } from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExamRunner, type TimerConfig } from "@/components/ExamRunner";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { useStore } from "@/lib/store";
import type { Question } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/mistakes")({
  component: Mistakes,
});

type TimerChoice = "none" | "total" | "perQuestion";
const TIMER_CHOICES: { value: TimerChoice; label: string }[] = [
  { value: "none", label: "No timer" },
  { value: "total", label: "Countdown timer" },
  { value: "perQuestion", label: "Time per question" },
];
const DURATIONS = [10, 15, 30, 45, 60] as const;
const PER_QUESTION_SECONDS = [15, 30, 45, 60, 90, 120] as const;

function Mistakes() {
  const mistakes = useStore((s) => s.mistakes);
  const clearMistakes = useStore((s) => s.clearMistakes);
  const deleteMistake = useStore((s) => s.deleteMistake);
  const [phase, setPhase] = useState<"list" | "setup" | "running">("list");
  const [timerChoice, setTimerChoice] = useState<TimerChoice>("total");
  const [duration, setDuration] = useState<number>(15);
  const [custom, setCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [perQSeconds, setPerQSeconds] = useState<number>(60);
  const [customPerQ, setCustomPerQ] = useState(false);
  const [customPerQValue, setCustomPerQValue] = useState("");


  const grouped = useMemo(() => {
    const map = new Map<string, typeof mistakes>();
    for (const m of mistakes) {
      const arr = map.get(m.courseName) ?? [];
      arr.push(m);
      map.set(m.courseName, arr);
    }
    return [...map.entries()];
  }, [mistakes]);

  // one entry per unique question for retry practice
  const retryQuestions = useMemo(() => {
    const map = new Map<string, Question>();
    for (const m of mistakes) map.set(m.question.id, m.question);
    return [...map.values()];
  }, [mistakes]);

  const finalDuration = custom ? Math.min(Math.max(Number(customValue) || 0, 1), 300) : duration;
  const finalPerQSeconds = customPerQ
    ? Math.min(Math.max(Number(customPerQValue) || 0, 5), 1800)
    : perQSeconds;
  const timer: TimerConfig =
    timerChoice === "none"
      ? { mode: "none" }
      : timerChoice === "total"
        ? { mode: "total", totalMinutes: finalDuration }
        : { mode: "perQuestion", secondsPerQuestion: finalPerQSeconds };
  const invalidCustom =
    (timerChoice === "total" && custom && (!customValue || finalDuration < 1)) ||
    (timerChoice === "perQuestion" && customPerQ && (!customPerQValue || finalPerQSeconds < 5));

  if (phase === "setup") {
    return (
      <AppShell>
        <h1 className="mb-4 text-xl font-extrabold text-foreground">Practice mistakes</h1>
        <Card className="mb-5 border-none p-5">
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
                {DURATIONS.map((d) => (
                  <Button
                    key={d}
                    variant={!custom && duration === d ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => {
                      setCustom(false);
                      setDuration(d);
                    }}
                  >
                    {d}
                  </Button>
                ))}
                <Button
                  variant={custom ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setCustom(true)}
                >
                  Custom
                </Button>
              </div>
              {custom && (
                <Input
                  type="number"
                  min={1}
                  max={300}
                  placeholder="Minutes"
                  className="mt-3"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
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
            </>
          )}
        </Card>
        <Button className="w-full rounded-full" disabled={invalidCustom} onClick={() => setPhase("running")}>
          <Play className="h-4 w-4" /> Start practice
          {timerChoice === "total" && (
            <span className="ml-1 flex items-center gap-1 opacity-80">
              <Clock className="h-3.5 w-3.5" /> {finalDuration} min
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

  if (phase === "running") {
    return (
      <AppShell>
        <h1 className="mb-4 text-xl font-extrabold text-foreground">Practice mistakes</h1>
        <ExamRunner title="Practice mistakes" questions={retryQuestions} timer={timer} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageTitle title="Mistake notebook" subtitle="Every blank you got wrong, in one place" />

      {mistakes.length === 0 ? (
        <Card className="border-none p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
          <p className="font-semibold text-foreground">No mistakes yet 🎉</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Take an exam — wrong answers will show up here for focused review.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-5 flex gap-2">
            <Button className="flex-1 rounded-full" onClick={() => setPhase("setup")}>
              <RotateCcw className="h-4 w-4" /> Retry mistakes only ({retryQuestions.length})
            </Button>
            <ConfirmDelete
              title="Clear all mistakes?"
              description="This permanently removes every mistake from your notebook."
              label="Clear all"
              onConfirm={() => {
                clearMistakes();
                toast.success("Mistakes cleared");
              }}
              trigger={
                <Button variant="outline" className="rounded-full">
                  <Trash2 className="h-4 w-4" /> Clear all
                </Button>
              }
            />
          </div>


          <div className="space-y-5">
            {grouped.map(([courseName, items]) => (
              <div key={courseName}>
                <h2 className="mb-2 text-sm font-bold text-muted-foreground">
                  {courseName} · {items.length} mistakes
                </h2>
                <div className="space-y-3">
                  {items.map((m) => (
                    <Card key={m.id} className="border-none p-4">
                      <div className="mb-2 flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">
                            {m.questionText}
                          </p>
                          {m.blankLabel && (
                            <p className="text-xs text-muted-foreground">{m.blankLabel}</p>
                          )}
                        </div>
                        <ConfirmDelete
                          title="Delete this mistake?"
                          description="This removes this entry from your mistake notebook."
                          onConfirm={() => {
                            deleteMistake(m.id);
                            toast.success("Mistake removed");
                          }}
                        />
                      </div>

                      <div className="space-y-1.5 pl-6 text-xs">
                        <div className="flex items-center gap-1.5 text-destructive">
                          <XCircle className="h-3.5 w-3.5 shrink-0" />
                          Your answer: {m.chosenValue || "— (blank)"}
                        </div>
                        <div className="flex items-center gap-1.5 text-success">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          Correct: {m.correctValue}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
