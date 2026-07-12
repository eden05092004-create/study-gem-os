import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, Plus, Trash2, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useStore,
  type NewQuestion,
  type QuestionType,
  type Blank,
} from "@/lib/store";

export const Route = createFileRoute("/create-exam/$courseId/$topicId")({
  component: CreateExam,
});

type ClozeBlank = { token: string; options: string; correct: string };
type Pair = { item: string; desc: string };
type Statement = { text: string; correct: string };

type Draft = {
  id: string;
  type: QuestionType;
  text: string;
  mcqOptions: string;
  mcqCorrect: number;
  clozePassage: string;
  clozeBlanks: ClozeBlank[];
  matchPrompt: string;
  matchPairs: Pair[];
  tfPrompt: string;
  tfStatements: Statement[];
  shortAnswer: string;
};

const uid = () => Math.random().toString(36).slice(2, 9);

function emptyDraft(type: QuestionType): Draft {
  return {
    id: uid(),
    type,
    text: "",
    mcqOptions: "",
    mcqCorrect: 0,
    clozePassage: "",
    clozeBlanks: [],
    matchPrompt: "Match each item to its description.",
    matchPairs: [
      { item: "", desc: "" },
      { item: "", desc: "" },
    ],
    tfPrompt: "Mark each statement as True or False.",
    tfStatements: [
      { text: "", correct: "True" },
      { text: "", correct: "True" },
    ],
    shortAnswer: "",
  };
}

const TYPES: { value: QuestionType; label: string }[] = [
  { value: "mcq", label: "Multiple choice" },
  { value: "cloze", label: "Cloze (blanks)" },
  { value: "matching", label: "Matching" },
  { value: "truefalse", label: "True / False" },
  { value: "short", label: "Short answer" },
];

const fieldClass =
  "w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function draftToQuestion(d: Draft): NewQuestion | string {
  if (d.type === "mcq") {
    const options = d.mcqOptions.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!d.text.trim()) return "A multiple-choice question needs question text.";
    if (options.length < 2) return "A multiple-choice question needs at least 2 options.";
    const correct = options[Math.min(d.mcqCorrect, options.length - 1)];
    const blanks: Blank[] = [{ id: "b1", options, correct }];
    return { type: "mcq", text: d.text.trim(), blanks };
  }
  if (d.type === "cloze") {
    if (!d.clozePassage.trim()) return "A cloze question needs a passage.";
    if (d.clozeBlanks.length === 0)
      return "Add [[1]] tokens to the passage and press Sync blanks.";
    const blanks: Blank[] = d.clozeBlanks.map((b) => ({
      id: b.token,
      options: b.options.split(",").map((s) => s.trim()).filter(Boolean),
      correct: b.correct.trim(),
    }));
    for (const b of blanks) {
      if (b.options.length < 2 || !b.correct)
        return "Each cloze blank needs options and a correct answer.";
      if (!b.options.includes(b.correct))
        return `Correct answer "${b.correct}" must be one of the options.`;
    }
    return { type: "cloze", text: d.clozePassage, blanks };
  }
  if (d.type === "matching") {
    const pairs = d.matchPairs.filter((p) => p.item.trim() && p.desc.trim());
    if (pairs.length < 2) return "A matching question needs at least 2 complete pairs.";
    const options = [...new Set(pairs.map((p) => p.desc.trim()))];
    const blanks: Blank[] = pairs.map((p, i) => ({
      id: String(i + 1),
      label: p.item.trim(),
      options,
      correct: p.desc.trim(),
    }));
    return { type: "matching", text: d.matchPrompt.trim(), blanks };
  }
  if (d.type === "truefalse") {
    const statements = d.tfStatements.filter((s) => s.text.trim());
    if (statements.length < 1) return "Add at least one statement.";
    const blanks: Blank[] = statements.map((s, i) => ({
      id: String(i + 1),
      label: s.text.trim(),
      options: ["True", "False"],
      correct: s.correct,
    }));
    return { type: "truefalse", text: d.tfPrompt.trim(), blanks };
  }
  // short
  if (!d.text.trim()) return "A short-answer question needs question text.";
  if (!d.shortAnswer.trim()) return "A short-answer question needs a correct answer.";
  const blanks: Blank[] = [{ id: "1", options: [], correct: d.shortAnswer.trim() }];
  return { type: "short", text: d.text.trim(), blanks };
}

function CreateExam() {
  const { courseId, topicId } = Route.useParams();
  const navigate = useNavigate();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const createExam = useStore((s) => s.createExam);

  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(20);
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft("cloze")]);
  const [saving, setSaving] = useState(false);

  if (!course || !topic) {
    return (
      <AppShell>
        <p className="py-10 text-center text-sm text-muted-foreground">Topic not found</p>
      </AppShell>
    );
  }

  const update = (id: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const syncCloze = (d: Draft) => {
    const tokens = [...d.clozePassage.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) =>
      m[1].trim(),
    );
    const unique = [...new Set(tokens)];
    const next: ClozeBlank[] = unique.map((token) => {
      const existing = d.clozeBlanks.find((b) => b.token === token);
      return existing ?? { token, options: "", correct: "" };
    });
    update(d.id, { clozeBlanks: next });
    if (next.length === 0) toast("Add tokens like [[1]] to the passage first");
  };

  const save = async () => {
    if (!title.trim()) return toast.error("Give the exam a title");
    const questions: NewQuestion[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const res = draftToQuestion(drafts[i]);
      if (typeof res === "string") return toast.error(`Question ${i + 1}: ${res}`);
      questions.push(res);
    }
    if (questions.length === 0) return toast.error("Add at least one question");
    setSaving(true);
    await createExam(courseId, topicId, title.trim(), duration, questions);
    setSaving(false);
    toast.success("Exam saved");
    navigate({ to: "/courses/$courseId/$topicId", params: { courseId, topicId } });
  };

  return (
    <AppShell>
      <Link
        to="/courses/$courseId/$topicId"
        params={{ courseId, topicId }}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {topic.name}
      </Link>
      <h1 className="mb-4 text-xl font-extrabold text-foreground">Create exam manually</h1>

      <Card className="mb-5 space-y-3 border-none p-4">
        <div>
          <Label className="mb-1 block text-xs">Exam title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Glycolysis midterm"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Duration (minutes)</Label>
          <Input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 1)}
          />
        </div>
      </Card>

      <div className="space-y-4">
        {drafts.map((d, i) => (
          <Card key={d.id} className="space-y-3 border-none p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">Question {i + 1}</span>
              <button
                onClick={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove question"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => update(d.id, { ...emptyDraft(t.value), id: d.id })}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    d.type === t.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {d.type === "mcq" && (
              <>
                <Textarea
                  placeholder="Question text"
                  value={d.text}
                  onChange={(e) => update(d.id, { text: e.target.value })}
                />
                <Label className="block text-xs text-muted-foreground">
                  Options (one per line). Select the correct one.
                </Label>
                <Textarea
                  placeholder={"Option A\nOption B\nOption C"}
                  value={d.mcqOptions}
                  onChange={(e) => update(d.id, { mcqOptions: e.target.value })}
                />
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Correct option #</Label>
                  <select
                    className={cn(fieldClass, "w-20")}
                    value={d.mcqCorrect}
                    onChange={(e) => update(d.id, { mcqCorrect: Number(e.target.value) })}
                  >
                    {d.mcqOptions
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((_, oi) => (
                        <option key={oi} value={oi}>
                          {oi + 1}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            )}

            {d.type === "cloze" && (
              <>
                <Label className="block text-xs text-muted-foreground">
                  Passage — insert blanks as [[1]], [[2]], … then press Sync blanks.
                </Label>
                <Textarea
                  rows={4}
                  placeholder="Glucose is phosphorylated by [[1]] to form [[2]]."
                  value={d.clozePassage}
                  onChange={(e) => update(d.id, { clozePassage: e.target.value })}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => syncCloze(d)}
                >
                  <Wand2 className="h-3.5 w-3.5" /> Sync blanks
                </Button>
                {d.clozeBlanks.map((b, bi) => (
                  <div key={b.token} className="rounded-xl border border-border p-3">
                    <div className="mb-1.5 text-xs font-semibold text-foreground">
                      Blank [[{b.token}]]
                    </div>
                    <Input
                      className="mb-2"
                      placeholder="Options, comma separated"
                      value={b.options}
                      onChange={(e) => {
                        const next = [...d.clozeBlanks];
                        next[bi] = { ...b, options: e.target.value };
                        update(d.id, { clozeBlanks: next });
                      }}
                    />
                    <Input
                      placeholder="Correct answer (must match one option)"
                      value={b.correct}
                      onChange={(e) => {
                        const next = [...d.clozeBlanks];
                        next[bi] = { ...b, correct: e.target.value };
                        update(d.id, { clozeBlanks: next });
                      }}
                    />
                  </div>
                ))}
              </>
            )}

            {d.type === "matching" && (
              <>
                <Input
                  placeholder="Prompt"
                  value={d.matchPrompt}
                  onChange={(e) => update(d.id, { matchPrompt: e.target.value })}
                />
                <Label className="block text-xs text-muted-foreground">
                  Item ↔ correct description. Descriptions become the dropdown options.
                </Label>
                {d.matchPairs.map((p, pi) => (
                  <div key={pi} className="flex gap-2">
                    <Input
                      placeholder="Item"
                      value={p.item}
                      onChange={(e) => {
                        const next = [...d.matchPairs];
                        next[pi] = { ...p, item: e.target.value };
                        update(d.id, { matchPairs: next });
                      }}
                    />
                    <Input
                      placeholder="Description"
                      value={p.desc}
                      onChange={(e) => {
                        const next = [...d.matchPairs];
                        next[pi] = { ...p, desc: e.target.value };
                        update(d.id, { matchPairs: next });
                      }}
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() =>
                    update(d.id, { matchPairs: [...d.matchPairs, { item: "", desc: "" }] })
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add pair
                </Button>
              </>
            )}

            {d.type === "truefalse" && (
              <>
                <Input
                  placeholder="Prompt"
                  value={d.tfPrompt}
                  onChange={(e) => update(d.id, { tfPrompt: e.target.value })}
                />
                {d.tfStatements.map((s, si) => (
                  <div key={si} className="flex gap-2">
                    <Input
                      placeholder="Statement"
                      value={s.text}
                      onChange={(e) => {
                        const next = [...d.tfStatements];
                        next[si] = { ...s, text: e.target.value };
                        update(d.id, { tfStatements: next });
                      }}
                    />
                    <select
                      className={cn(fieldClass, "w-24")}
                      value={s.correct}
                      onChange={(e) => {
                        const next = [...d.tfStatements];
                        next[si] = { ...s, correct: e.target.value };
                        update(d.id, { tfStatements: next });
                      }}
                    >
                      <option value="True">True</option>
                      <option value="False">False</option>
                    </select>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() =>
                    update(d.id, {
                      tfStatements: [...d.tfStatements, { text: "", correct: "True" }],
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add statement
                </Button>
              </>
            )}

            {d.type === "short" && (
              <>
                <Textarea
                  placeholder="Question text"
                  value={d.text}
                  onChange={(e) => update(d.id, { text: e.target.value })}
                />
                <Input
                  placeholder="Correct answer"
                  value={d.shortAnswer}
                  onChange={(e) => update(d.id, { shortAnswer: e.target.value })}
                />
              </>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <Button
          variant="outline"
          className="w-full rounded-full"
          onClick={() => setDrafts((ds) => [...ds, emptyDraft("cloze")])}
        >
          <Plus className="h-4 w-4" /> Add question
        </Button>
        <Button className="w-full rounded-full" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save exam"}
        </Button>
      </div>
    </AppShell>
  );
}
