import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Flag,
  ChevronRight,
  ChevronLeft,
  Timer,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Rows3,
  FileStack,
} from "lucide-react";
import {
  gradeQuestion,
  type Question,
  type Blank,
  type ImageLabel,
} from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Phase = "quiz" | "results";
type Layout = "single" | "all";

export type TimerConfig =
  | { mode: "none" }
  | { mode: "total"; totalMinutes: number }
  | { mode: "perQuestion"; secondsPerQuestion: number };

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function readDeadline(storageKey: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeDeadline(storageKey: string, deadline: number) {
  try {
    localStorage.setItem(storageKey, String(deadline));
  } catch {
    // storage unavailable — timer still works in-memory, just won't survive a refresh
  }
}

function clearDeadline(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

function readJSONRecord<T>(storageKey: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeJSONRecord<T>(storageKey: string, map: Record<string, T>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // storage unavailable — state still works in-memory, just won't survive a refresh
  }
}

function clearJSONRecord(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

/** Full per-blank review: every option shown, marking the correct one and the student's
 *  choice (if wrong), each with its own explanation — "why the other options are wrong".
 *  Used for any blank that has a real option set (mcq's blank, or each blank inside a
 *  multi-blank cloze passage) — not just mcq-type questions. */
function OptionsBreakdown({
  blank,
  chosen,
  explanations,
}: {
  blank: Blank;
  chosen: string | undefined;
  explanations: string[];
}) {
  return (
    <div className="space-y-2">
      {blank.options.map((opt, oi) => {
        const isCorrect = opt === blank.correct;
        const isChosen = opt === chosen;
        return (
          <div
            key={oi}
            className={cn(
              "rounded-xl border p-3 text-sm",
              isCorrect
                ? "border-success/40 bg-success/10"
                : isChosen
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-border",
            )}
          >
            <div className="flex items-center gap-2 font-medium text-foreground">
              {isCorrect ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              ) : isChosen ? (
                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <span className="h-4 w-4 shrink-0" />
              )}
              <span>{opt}</span>
              {isChosen && !isCorrect && (
                <span className="text-xs font-normal text-muted-foreground">(your answer)</span>
              )}
              {isCorrect && <span className="text-xs font-normal text-muted-foreground">(correct answer)</span>}
            </div>
            {explanations[oi] && <div className="mt-1 pl-6 text-xs text-muted-foreground">{explanations[oi]}</div>}
          </div>
        );
      })}
      {chosen === undefined && <p className="text-xs italic text-muted-foreground">You left this question blank.</p>}
    </div>
  );
}

/** Per-option explanations for a blank, aligned with blank.options[]. Prefers the
 *  blank's own `explanations[]` (new convention — works for any number of blanks,
 *  e.g. every blank in a multi-blank cloze passage). Falls back to the legacy
 *  question-level `explanations[]` for older exams that only ever had one blank. */
function resolveOptionExplanations(question: Question, blank: Blank): string[] {
  if (blank.explanations && blank.explanations.length === blank.options.length) return blank.explanations;
  if (question.blanks.length === 1 && question.explanations.length === blank.options.length) {
    return question.explanations;
  }
  return [];
}

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
    // Combines both fixes for the squeezed-dropdown bug: the root cause (the
    // shared Select's viewport height being locked to the trigger's height) is
    // fixed once in ui/select.tsx; the classes here add a sensible explicit
    // max-height/width cap and readability tweaks on top of that.
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="inline-flex h-auto min-h-9 w-auto min-w-[8rem] max-w-full items-start whitespace-normal rounded-lg border border-input bg-background px-2.5 py-1.5 text-left text-sm font-medium text-foreground [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:break-words">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="max-h-[60vh] w-[min(92vw,28rem)] max-w-[92vw] overflow-y-auto"
      >
        {blank.options.map((opt, i) => (
          <SelectItem key={i} value={opt} className="whitespace-normal break-words py-2 pr-8 text-sm leading-snug">
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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

/** an image with numbered markers overlaid at normalized coordinates */
function ImageBlock({ url, labels }: { url: string; labels?: ImageLabel[] }) {
  return (
    <div className="relative mb-4 overflow-hidden rounded-xl border border-border bg-muted">
      <img src={url} alt="Question figure" className="w-full object-contain" />
      {labels?.map((l) => (
        <span
          key={l.id}
          className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground ring-2 ring-background"
          style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }}
        >
          {l.id}
        </span>
      ))}
    </div>
  );
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

  // image-based questions: show the figure, then answer rows/inputs
  if (q.type.startsWith("image")) {
    const clinicalSingle = q.type === "image_clinical" && q.blanks.length === 1;
    const single = clinicalSingle ? q.blanks[0] : null;
    return (
      <div>
        {q.imageUrl && <ImageBlock url={q.imageUrl} labels={q.imageLabels} />}
        {single && single.options.length > 0 ? (
          <RadioGroup
            value={answers[key(single.id)] ?? ""}
            onValueChange={(v) => setAnswer(single.id, v)}
            className="space-y-2"
          >
            {single.options.map((opt, oi) => (
              <label
                key={oi}
                htmlFor={`${q.id}-${oi}`}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors",
                  answers[key(single.id)] === opt
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <RadioGroupItem id={`${q.id}-${oi}`} value={opt} />
                <span className="text-sm font-medium text-foreground">{opt}</span>
              </label>
            ))}
          </RadioGroup>
        ) : single ? (
          <Input
            placeholder="Type your answer…"
            value={answers[key(single.id)] ?? ""}
            onChange={(e) => setAnswer(single.id, e.target.value)}
          />
        ) : (
          <div className="space-y-2.5">
            {q.blanks.map((blank) => (
              <div
                key={blank.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                  {blank.label || blank.id}
                </span>
                {blank.options.length > 0 ? (
                  <BlankSelect
                    blank={blank}
                    value={answers[key(blank.id)]}
                    onChange={(v) => setAnswer(blank.id, v)}
                  />
                ) : (
                  <Input
                    className="max-w-[12rem]"
                    placeholder="Answer…"
                    value={answers[key(blank.id)] ?? ""}
                    onChange={(e) => setAnswer(blank.id, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }


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
  timer,
}: {
  title: string;
  questions: Question[];
  onFinish?: (answers: Record<string, string>) => void;
  /** No timer, a single overall countdown, or a fresh countdown per question. */
  timer?: TimerConfig;
}) {
  const [phase, setPhase] = useState<Phase>("quiz");
  const [current, setCurrent] = useState(0);
  const [layout, setLayout] = useState<Layout>("single");

  const timerMode = timer?.mode ?? "none";
  const timed = timerMode !== "none";
  // Stable per-attempt key (survives refresh/close) — derived from the question set itself
  // rather than a prop, so every caller (generated, converted, or practice exams) gets a
  // working, persistent timer with no extra wiring.
  const storageKey = useMemo(
    () => `examTimer:${hashString([...questions.map((q) => q.id)].sort().join(","))}`,
    [questions],
  );
  const pqStorageKey = `${storageKey}:pq`;
  const answersStorageKey = `${storageKey}:answers`;
  const flagsStorageKey = `${storageKey}:flags`;

  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    readJSONRecord<string>(answersStorageKey),
  );
  const [flags, setFlags] = useState<Record<string, boolean>>(() =>
    readJSONRecord<boolean>(flagsStorageKey),
  );

  // Persist answers/flags as they change so a refresh or accidental close doesn't
  // lose progress — same pattern as the timer deadline below, just keyed separately
  // so a fresh attempt (or a submitted one, see submit()) starts from a clean slate.
  useEffect(() => {
    if (phase !== "quiz") return;
    writeJSONRecord(answersStorageKey, answers);
  }, [answers, answersStorageKey, phase]);
  useEffect(() => {
    if (phase !== "quiz") return;
    writeJSONRecord(flagsStorageKey, flags);
  }, [flags, flagsStorageKey, phase]);

  const [remainingSec, setRemainingSec] = useState(() => {
    if (timer?.mode === "total") {
      const totalSec = Math.round(timer.totalMinutes * 60);
      const existing = readDeadline(storageKey);
      if (existing !== null) return Math.max(0, Math.round((existing - Date.now()) / 1000));
      const deadline = Date.now() + totalSec * 1000;
      writeDeadline(storageKey, deadline);
      return totalSec;
    }
    return 0;
  });
  const [pqDeadlines, setPqDeadlines] = useState<Record<string, number>>(() =>
    timerMode === "perQuestion" ? readJSONRecord<number>(pqStorageKey) : {},
  );
  const submittedRef = useRef(false);
  // Auto-submit (from the timer's interval closure) must always see the latest
  // answers, not whatever was current when the interval was set up.
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

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
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (timerMode === "total") clearDeadline(storageKey);
    if (timerMode === "perQuestion") clearDeadline(pqStorageKey);
    clearJSONRecord(answersStorageKey);
    clearJSONRecord(flagsStorageKey);
    onFinish?.(answersRef.current);
    setPhase("results");
  };

  // Overall countdown for "total" mode.
  useEffect(() => {
    if (timer?.mode !== "total" || phase !== "quiz") return;
    const totalMinutes = timer.totalMinutes;
    const tick = () => {
      // Re-read the deadline (rather than trusting a captured start time) so the
      // countdown is correct even after a refresh remounts this component.
      let deadline = readDeadline(storageKey);
      if (deadline === null) {
        deadline = Date.now() + Math.round(totalMinutes * 60) * 1000;
        writeDeadline(storageKey, deadline);
      }
      const left = Math.round((deadline - Date.now()) / 1000);
      setRemainingSec(left);
      if (left <= 0) submit();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerMode, phase, storageKey]);

  // Ensure the current question has its own deadline in "perQuestion" mode.
  useEffect(() => {
    if (timer?.mode !== "perQuestion" || phase !== "quiz") return;
    if (pqDeadlines[q.id] !== undefined) return;
    const deadline = Date.now() + Math.round(timer.secondsPerQuestion) * 1000;
    setPqDeadlines((prev) => {
      const next = { ...prev, [q.id]: deadline };
      writeJSONRecord(pqStorageKey, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerMode, phase, q.id]);

  // Countdown for the CURRENT question in "perQuestion" mode — expiry auto-advances
  // (or submits, on the last question). Going back is disabled in the UI below, so a
  // question's clock only ever runs once.
  useEffect(() => {
    if (timerMode !== "perQuestion" || phase !== "quiz") return;
    const deadline = pqDeadlines[q.id];
    if (deadline === undefined) return;
    const tick = () => {
      const left = Math.round((deadline - Date.now()) / 1000);
      setRemainingSec(left);
      if (left <= 0) {
        if (current < questions.length - 1) setCurrent((c) => c + 1);
        else submit();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerMode, phase, q.id, pqDeadlines[q.id]]);

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

              {question.imageUrl && (
                <ImageBlock url={question.imageUrl} labels={question.imageLabels} />
              )}



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

              <div className="space-y-3">
                {question.blanks.map((blank, bi) => {
                  const pb = g.perBlank[bi];
                  if (blank.options.length > 0) {
                    return (
                      <div key={blank.id}>
                        {blank.label && question.blanks.length > 1 && (
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">{blank.label}</p>
                        )}
                        {isCloze && question.blanks.length > 1 && (
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">Blank {bi + 1}</p>
                        )}
                        <OptionsBreakdown
                          blank={blank}
                          chosen={pb.value}
                          explanations={resolveOptionExplanations(question, blank)}
                        />
                      </div>
                    );
                  }
                  // no option set (e.g. "short" answer) — simple correct/incorrect display
                  return (
                    <div
                      key={blank.id}
                      className={cn(
                        "rounded-xl border p-3 text-sm",
                        pb.correct ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10",
                      )}
                    >
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        {pb.correct ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                        )}
                        {blank.label && <span className="text-muted-foreground">{blank.label}:</span>}
                        <span>{pb.value || "— (blank)"}</span>
                      </div>
                      {!pb.correct && (
                        <div className="mt-1 pl-6 text-xs text-success">Correct answer: {blank.correct}</div>
                      )}
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

  const answeredQuestions = questions.filter((question) =>
    question.blanks.some((b) => answers[`${question.id}:${b.id}`] !== undefined),
  ).length;
  const flaggedIds = questions.filter((question) => flags[question.id]).map((question) => question.id);
  const isAnswered = (question: Question) =>
    question.blanks.some((b) => answers[`${question.id}:${b.id}`] !== undefined);

  const QuestionCard = ({ question, index }: { question: Question; index: number }) => (
    <Card className="soft-shadow mb-5 border-none p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <p className="text-lg font-bold leading-snug text-foreground">
          {layout === "all" && <span className="mr-1 text-muted-foreground">{index + 1}.</span>}
          {question.type === "cloze"
            ? "Fill in the blanks"
            : question.type === "matching"
              ? question.text || "Match each item"
              : question.type === "truefalse"
                ? question.text || "Mark each statement True or False"
                : question.text}
        </p>
        <button
          onClick={() => setFlags((f) => ({ ...f, [question.id]: !f[question.id] }))}
          className={cn(
            "shrink-0 rounded-full p-2 transition-colors",
            flags[question.id] ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground",
          )}
          aria-label="Flag question for review"
        >
          <Flag className="h-4 w-4" />
        </button>
      </div>

      <QuestionBody
        q={question}
        answers={answers}
        setAnswer={(blankId, v) => setAnswers((a) => ({ ...a, [`${question.id}:${blankId}`]: v }))}
      />
    </Card>
  );

  return (
    <div className="pt-1">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          Question {current + 1} of {questions.length}
          {flaggedIds.length > 0 && (
            <span className="ml-2 text-xs font-medium text-warning-foreground">
              · {flaggedIds.length} flagged
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {timed && (
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium",
                remainingSec < (timerMode === "perQuestion" ? 10 : 300)
                  ? "bg-destructive/15 text-destructive animate-pulse"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Timer className="h-4 w-4" /> {formatClock(remainingSec)}
            </span>
          )}
          {timerMode !== "perQuestion" && (
            <ToggleGroup type="single" value={layout} onValueChange={(v) => v && setLayout(v as Layout)}>
              <ToggleGroupItem value="single" aria-label="One question per page" title="One question per page">
                <FileStack className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="all" aria-label="All questions on one page" title="All questions on one page">
                <Rows3 className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      </div>
      <Progress value={(answeredQuestions / questions.length) * 100} className="mb-3 h-2" />

      {timerMode === "perQuestion" && (
        <p className="mb-3 text-xs text-muted-foreground">
          Time per question — once it advances you can't go back.
        </p>
      )}

      {flaggedIds.length > 0 && layout === "single" && timerMode !== "perQuestion" && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {flaggedIds.map((id) => {
            const idx = questions.findIndex((question) => question.id === id);
            return (
              <button
                key={id}
                onClick={() => setCurrent(idx)}
                className="flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning-foreground"
              >
                <Flag className="h-3 w-3" /> Q{idx + 1}
              </button>
            );
          })}
        </div>
      )}

      {layout === "single" && timerMode !== "perQuestion" && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {questions.map((question, i) => (
            <button
              key={question.id}
              onClick={() => setCurrent(i)}
              aria-label={`Jump to question ${i + 1}`}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition-colors",
                i === current
                  ? "bg-primary text-primary-foreground"
                  : flags[question.id]
                    ? "bg-warning/20 text-warning-foreground"
                    : isAnswered(question)
                      ? "bg-success/15 text-success"
                      : "bg-muted text-muted-foreground",
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {layout === "single" ? (
        <QuestionCard question={q} index={current} />
      ) : (
        questions.map((question, i) => <QuestionCard key={question.id} question={question} index={i} />)
      )}

      {layout === "single" ? (
        <>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-full"
              disabled={current === 0 || timerMode === "perQuestion"}
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
          {current === questions.length - 1 && timerMode !== "perQuestion" && (
            <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <RotateCcw className="h-3 w-3" /> You can go back and edit answers before submitting
            </p>
          )}
        </>
      ) : (
        <Button className="w-full rounded-full" onClick={submit}>
          Submit exam
        </Button>
      )}
    </div>
  );
}
