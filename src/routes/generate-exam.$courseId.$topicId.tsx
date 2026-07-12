import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Sparkles, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useStore, type QuestionType } from "@/lib/store";
import { getAiKeyStatus, generateExam } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/generate-exam/$courseId/$topicId")({
  component: GenerateExamPage,
});

const TYPE_OPTIONS = [
  { value: "cloze", label: "Cloze" },
  { value: "matching", label: "Matching" },
  { value: "truefalse", label: "True / False" },
  { value: "short", label: "Short answer" },
  { value: "mixed", label: "Mixed" },
] as const;

const COUNTS = [20, 50, 100] as const;

function GenerateExamPage() {
  const { courseId, topicId } = Route.useParams();
  const navigate = useNavigate();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const createExam = useStore((s) => s.createExam);
  const checkStatus = useServerFn(getAiKeyStatus);
  const runGenerate = useServerFn(generateExam);

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [types, setTypes] = useState<string[]>(["mixed"]);
  const [count, setCount] = useState<number>(20);
  const [customCount, setCustomCount] = useState("");
  const [custom, setCustom] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkStatus().then((r) => setHasKey(r.hasKey)).catch(() => setHasKey(false));
  }, [checkStatus]);

  if (!course || !topic) {
    return (
      <AppShell>
        <p className="py-10 text-center text-sm text-muted-foreground">Topic not found</p>
      </AppShell>
    );
  }

  const toggleType = (v: string) => {
    setTypes((prev) => {
      if (v === "mixed") return prev.includes("mixed") ? [] : ["mixed"];
      const next = prev.filter((t) => t !== "mixed");
      return next.includes(v) ? next.filter((t) => t !== v) : [...next, v];
    });
  };

  const finalCount = custom ? Math.min(Math.max(Number(customCount) || 0, 1), 100) : count;

  const onGenerate = async () => {
    if (!hasKey) {
      toast.error("AI features require an API key.");
      return;
    }
    if (types.length === 0) {
      toast.error("Choose at least one question type");
      return;
    }
    if (custom && (!customCount || finalCount < 1)) {
      toast.error("Enter a valid number of questions");
      return;
    }
    setLoading(true);
    try {
      const subject = `Course: ${course.name}. Topic: ${topic.name}. Source material files: ${
        topic.files.map((f) => f.name).join(", ") || "(none provided)"
      }.`;
      const res = await runGenerate({
        data: { subject, types, count: finalCount },
      });
      if (!res.questions.length) {
        toast.error("The AI returned no questions. Try again.");
        return;
      }
      await createExam(
        courseId,
        topicId,
        `${topic.name} — AI exam (${res.questions.length}Q)`,
        Math.max(10, Math.round(res.questions.length * 1.2)),
        res.questions.map((q) => ({
          type: q.type as QuestionType,
          text: q.text,
          blanks: q.blanks,
          explanations: q.explanations ?? [],
        })),
      );
      toast.success(`Generated ${res.questions.length} questions`);
      navigate({ to: "/courses/$courseId/$topicId", params: { courseId, topicId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
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
      <PageTitle title="Generate exam (AI)" subtitle="Create questions from this topic's material" />

      {hasKey === false && (
        <Card className="mb-4 border-none bg-muted p-4 text-sm text-muted-foreground">
          AI features require an API key.{" "}
          <Link to="/settings" className="font-semibold text-primary underline">
            Add it in Settings
          </Link>
          .
        </Card>
      )}

      <Card className="mb-4 border-none p-5">
        <Label className="mb-2 block">Question types</Label>
        <div className="grid grid-cols-2 gap-2">
          {TYPE_OPTIONS.map((opt) => {
            const active = types.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition-colors",
                  active ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <Checkbox checked={active} onCheckedChange={() => toggleType(opt.value)} />
                <span className="font-medium text-foreground">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </Card>

      <Card className="mb-5 border-none p-5">
        <Label className="mb-2 block">Number of questions</Label>
        <div className="flex flex-wrap gap-2">
          {COUNTS.map((c) => (
            <Button
              key={c}
              variant={!custom && count === c ? "default" : "outline"}
              className="rounded-full"
              onClick={() => {
                setCustom(false);
                setCount(c);
              }}
            >
              {c}
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
            max={100}
            placeholder="e.g. 30"
            className="mt-3"
            value={customCount}
            onChange={(e) => setCustomCount(e.target.value)}
          />
        )}
      </Card>

      <Button
        className="w-full rounded-full"
        onClick={onGenerate}
        disabled={loading || hasKey !== true}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" /> Generate exam
          </>
        )}
      </Button>
      {loading && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          This can take up to a minute for large exams.
        </p>
      )}
    </AppShell>
  );
}
