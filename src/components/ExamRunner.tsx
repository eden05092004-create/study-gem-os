import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Flag,
  ChevronRight,
  ChevronLeft,
  Timer,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react";
import {
  gradeQuestion,
  type Question,
  type Blank,
} from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Phase = "quiz" | "results";

const selectClass =
  "inline-block min-w-[7rem] rounded-lg border border-input bg-background px-2.5 py-1 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function BlankSelect({
  blank,
  value,
  onChange,
}: {
  blank: Blank;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className={selectClass}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        —
      </option>
      {blank.options.map((opt, i) => (
        <option key={i} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

/** split a cloze passage into text + [[id]] token segments */
function parseCloze(text: string): { type: "text" | "blank"; value: string }[] {
  const parts: { type: "text" | "blank"; value: string }[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "blank", value: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

function QuestionBody({
  q,
  answers,
  setAnswer,
}: {
  q: Question;
  answers: Record<string, string>;
  setAnswer: (blankId: string, v: string) => void;
}) {
  const key = (b: string) => `${q.id}:${b}`;

  if (q.type === "mcq") {
    const blank = q.blanks[0];
    return (
      <RadioGroup
        value={answers[key(blank.id)] ?? ""}
        onValueChange={(v) => setAnswer(blank.id, v)}
        className="space-y-2"
      >
        {blank.options.map((opt, oi) => (
          <label
            key={oi}
            htmlFor={`${q.id}-${oi}`}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors",
              answers[key(blank.id)] === opt
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
            )}
          >
            <RadioGroupItem id={`${q.id}-${oi}`} value={opt} />
            <span className="text-sm font-medium text-foreground">{opt}</span>
          </label>
        ))}
      </RadioGroup>
    );
  }

  if (q.type === "cloze") {
    const parts = parseCloze(q.text);
    return (
      <p className="text-[15px] leading-8 text-foreground">
        {parts.map((p, i) => {
          if (p.type === "text") return <span key={i}>{p.value}</span>;
          const blank = q.blanks.find((b) => b.id === p.value);
          if (!blank) return <span key={i}>[[{p.value}]]</span>;
          return (
            <span key={i} className="mx-1 align-middle">
              <BlankSelect
                blank={blank}
                value={answers[key(blank.id)]}
                onChange={(v) => setAnswer(blank.id, v)}
              />
            </span>
          );
        })}
      </p>
    );
  }

  if (q.type === "short") {
    const blank = q.blanks[0];
    return (
      <Input
        placeholder="Type your answer…"
        value={answers[key(blank.id)] ?? ""}
        onChange={(e) => setAnswer(blank.id, e.target.value)}
      />
    );
  }

  // matching + truefalse: rows of label + dropdown
  return (
    <div className="space-y-2.5">
      {q.blanks.map((blank) => (
        <div
          key={blank.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
        >
          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
            {blank.label}
          </span>
          <BlankSelect
            blank={blank}
            value={answers[key(blank.id)]}
            onChange={(v) => setAnswer(blank.id, v)}
          />
        </div>
      ))}
    </div>
  );
}

export function ExamRunner({
  title,
  questions,
  onFinish,
}: {
  title: string;
  questions: Question[];
  onFinish?: (answers: Record<string, string>) => void;
}) {
  const [phase, setPhase] = useState<Phase>("quiz");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  const q = questions[current];

  const setAnswer = (blankId: string, v: string) =>
    setAnswers((a) => ({ ...a, [`${q.id}:${blankId}`]: v }));

  const totals = useMemo(() => {
    let earned = 0;
    let total = 0;
    for (const question of questions) {
      const g = gradeQuestion(question, answers);
      earned += g.earned;
      total += g.total;
    }
    const pct = total ? Math.round((earned / total) * 100) : 0;
    return { earned, total, pct };
  }, [answers, questions]);

  const submit = () => {
    onFinish?.(answers);
    setPhase("results");
  };

  if (phase === "results") {
    return (
      <div className="space-y-4 pt-2">
        <Card className="soft-shadow border-none p-6 text-center">
          <p className="text-sm text-muted-foreground">Your score</p>
          <div className="my-2 text-5xl font-extrabold text-primary">{totals.pct}%</div>
          <p className="text-sm font-medium text-foreground">
            Mark {totals.earned.toFixed(1)} out of {totals.total.toFixed(1)}
          </p>
          <p className="text-xs text-muted-foreground">{title}</p>
        </Card>

        {questions.map((question, qi) => {
          const g = gradeQuestion(question, answers);
          const isCloze = question.type === "cloze";
          const clozeParts = isCloze ? parseCloze(question.text) : [];
          return (
            <Card key={question.id} className="border-none p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex gap-2">
                  <span className="shrink-0 font-bold text-primary">{qi + 1}.</span>
                  {!isCloze && question.type !== "matching" && question.type !== "truefalse" && (
                    <p className="font-semibold text-foreground">{question.text}</p>
                  )}
                  {(question.type === "matching" || question.type === "truefalse") &&
                    question.text && (
                      <p className="font-semibold text-foreground">{question.text}</p>
                    )}
                </div>
              </div>

              <div className="mb-3 flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-full text-[11px]",
                    g.status === "correct" && "bg-success/15 text-success",
                    g.status === "partial" && "bg-warning/20 text-warning-foreground",
                    g.status === "incorrect" && "bg-destructive/15 text-destructive",
                  )}
                >
                  {g.status === "correct"
                    ? "Correct"
                    : g.status === "partial"
                      ? "Partially correct"
                      : "Incorrect"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Mark {g.earned.toFixed(1)} out of {g.total.toFixed(1)}
                </span>
              </div>

              {isCloze && (
                <p className="mb-3 text-[15px] leading-7 text-muted-foreground">
                  {clozeParts.map((p, i) =>
                    p.type === "text" ? (
                      <span key={i}>{p.value}</span>
                    ) : (
                      <span key={i} className="font-semibold text-foreground">
                        ____
                      </span>
                    ),
                  )}
                </p>
              )}

              <div className="space-y-2">
                {g.perBlank.map((pb) => (
                  <div
                    key={pb.blank.id}
                    className={cn(
                      "rounded-xl border p-3 text-sm",
                      pb.correct
                        ? "border-success/40 bg-success/10"
                        : "border-destructive/40 bg-destructive/10",
                    )}
                  >
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      {pb.correct ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                      )}
                      {pb.blank.label && (
                        <span className="text-muted-foreground">{pb.blank.label}:</span>
                      )}
                      <span>{pb.value || "— (blank)"}</span>
                    </div>
                    {!pb.correct && (
                      <div className="mt-1 pl-6 text-xs text-success">
                        Correct answer: {pb.blank.correct}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {question.type === "mcq" && question.explanations.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {question.explanations[
                    Math.max(0, question.blanks[0].options.indexOf(question.blanks[0].correct))
                  ]}
                </p>
              )}
            </Card>
          );
        })}

        <Button asChild className="w-full rounded-full">
          <Link to="/exams">Finish</Link>
        </Button>
      </div>
    );
  }

  const answeredQuestions = questions.filter((question) =>
    question.blanks.some((b) => answers[`${question.id}:${b.id}`] !== undefined),
  ).length;

  return (
    <div className="pt-1">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          Question {current + 1} of {questions.length}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
          <Timer className="h-4 w-4" />{" "}
          {String(Math.floor((current + 1) * 0.5)).padStart(2, "0")}:00
        </span>
      </div>
      <Progress value={(answeredQuestions / questions.length) * 100} className="mb-5 h-2" />

      <Card className="soft-shadow mb-5 border-none p-5">
        <div className="mb-4 flex items-start justify-between gap-2">
          <p className="text-lg font-bold leading-snug text-foreground">
            {q.type === "cloze"
              ? "Fill in the blanks"
              : q.type === "matching"
                ? q.text || "Match each item"
                : q.type === "truefalse"
                  ? q.text || "Mark each statement True or False"
                  : q.text}
          </p>
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

        <QuestionBody q={q} answers={answers} setAnswer={setAnswer} />
      </Card>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="flex-1 rounded-full"
          disabled={current === 0}
          onClick={() => setCurrent((c) => c - 1)}
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        {current < questions.length - 1 ? (
          <Button className="flex-1 rounded-full" onClick={() => setCurrent((c) => c + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="flex-1 rounded-full" onClick={submit}>
            Submit exam
          </Button>
        )}
      </div>
      {current === questions.length - 1 && (
        <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <RotateCcw className="h-3 w-3" /> You can go back and edit answers before submitting
        </p>
      )}
    </div>
  );
}
