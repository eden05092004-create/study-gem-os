import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Flag,
  ChevronRight,
  ChevronLeft,
  Timer,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RotateCcw,
} from "lucide-react";
import type { Question } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Phase = "quiz" | "results" | "review";

export function ExamRunner({
  title,
  questions,
  onFinish,
}: {
  title: string;
  questions: Question[];
  onFinish?: (answers: Record<string, number>) => void;
}) {
  const [phase, setPhase] = useState<Phase>("quiz");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  const q = questions[current];

  const result = useMemo(() => {
    let correct = 0,
      wrong = 0,
      skipped = 0;
    for (const question of questions) {
      const a = answers[question.id];
      if (a === undefined) skipped++;
      else if (a === question.correctIndex) correct++;
      else wrong++;
    }
    const pct = Math.round((correct / questions.length) * 100);
    return { correct, wrong, skipped, pct };
  }, [answers, questions]);

  const submit = () => {
    onFinish?.(answers);
    setPhase("results");
  };

  if (phase === "results") {
    return (
      <div className="pt-2">
        <Card className="soft-shadow mb-5 border-none p-6 text-center">
          <p className="text-sm text-muted-foreground">Your score</p>
          <div className="my-2 text-5xl font-extrabold text-primary">{result.pct}%</div>
          <p className="text-sm text-muted-foreground">{title}</p>
        </Card>
        <div className="mb-5 grid grid-cols-3 gap-3">
          <Card className="border-none bg-success/10 p-4 text-center">
            <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-success" />
            <div className="text-xl font-bold text-foreground">{result.correct}</div>
            <div className="text-[11px] text-muted-foreground">Correct</div>
          </Card>
          <Card className="border-none bg-destructive/10 p-4 text-center">
            <XCircle className="mx-auto mb-1 h-5 w-5 text-destructive" />
            <div className="text-xl font-bold text-foreground">{result.wrong}</div>
            <div className="text-[11px] text-muted-foreground">Wrong</div>
          </Card>
          <Card className="border-none bg-muted p-4 text-center">
            <MinusCircle className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
            <div className="text-xl font-bold text-foreground">{result.skipped}</div>
            <div className="text-[11px] text-muted-foreground">Skipped</div>
          </Card>
        </div>
        <div className="space-y-3">
          <Button className="w-full rounded-full" onClick={() => setPhase("review")}>
            Review answers
          </Button>
          <Button asChild variant="outline" className="w-full rounded-full">
            <Link to="/exams">Back to exams</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="space-y-4 pt-2">
        {questions.map((question, qi) => {
          const chosen = answers[question.id];
          return (
            <Card key={question.id} className="border-none p-4">
              <div className="mb-3 flex gap-2">
                <span className="shrink-0 font-bold text-primary">{qi + 1}.</span>
                <p className="font-semibold text-foreground">{question.text}</p>
              </div>
              <div className="space-y-2">
                {question.options.map((opt, oi) => {
                  const isCorrect = oi === question.correctIndex;
                  const isChosen = oi === chosen;
                  return (
                    <div
                      key={oi}
                      className={cn(
                        "rounded-xl border p-3 text-sm",
                        isCorrect && "border-success/40 bg-success/10",
                        isChosen && !isCorrect && "border-destructive/40 bg-destructive/10",
                        !isCorrect && !isChosen && "border-border",
                      )}
                    >
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        {isCorrect && <CheckCircle2 className="h-4 w-4 text-success" />}
                        {isChosen && !isCorrect && (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        {opt}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {question.explanations[oi]}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
        <Button asChild className="w-full rounded-full">
          <Link to="/exams">Finish</Link>
        </Button>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="pt-1">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          Question {current + 1} of {questions.length}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
          <Timer className="h-4 w-4" /> {String(Math.floor((current + 1) * 0.5)).padStart(2, "0")}:00
        </span>
      </div>
      <Progress value={(answeredCount / questions.length) * 100} className="mb-5 h-2" />

      <Card className="soft-shadow mb-5 border-none p-5">
        <div className="mb-4 flex items-start justify-between gap-2">
          <p className="text-lg font-bold leading-snug text-foreground">{q.text}</p>
          <button
            onClick={() => setFlags((f) => ({ ...f, [q.id]: !f[q.id] }))}
            className={cn(
              "shrink-0 rounded-full p-2 transition-colors",
              flags[q.id]
                ? "bg-warning/20 text-warning-foreground"
                : "bg-muted text-muted-foreground",
            )}
            aria-label="Flag question"
          >
            <Flag className="h-4 w-4" />
          </button>
        </div>
        <RadioGroup
          value={answers[q.id]?.toString() ?? ""}
          onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: Number(v) }))}
          className="space-y-2"
        >
          {q.options.map((opt, oi) => (
            <label
              key={oi}
              htmlFor={`${q.id}-${oi}`}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors",
                answers[q.id] === oi
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
              )}
            >
              <RadioGroupItem id={`${q.id}-${oi}`} value={oi.toString()} />
              <span className="text-sm font-medium text-foreground">{opt}</span>
            </label>
          ))}
        </RadioGroup>
      </Card>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="flex-1 rounded-full"
          disabled={current === 0}
          onClick={() => setCurrent((c) => c - 1)}
        >
          <ChevronRight className="h-4 w-4" /> הקודם
        </Button>
        {current < questions.length - 1 ? (
          <Button
            className="flex-1 rounded-full"
            onClick={() => setCurrent((c) => c + 1)}
          >
            הבא <ChevronLeft className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="flex-1 rounded-full" onClick={submit}>
            הגש מבחן
          </Button>
        )}
      </div>
      {current === questions.length - 1 && (
        <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <RotateCcw className="h-3 w-3" /> ניתן לחזור אחורה ולערוך תשובות לפני ההגשה
        </p>
      )}
    </div>
  );
}
