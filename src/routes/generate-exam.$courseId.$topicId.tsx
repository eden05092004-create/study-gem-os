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
import { supabase } from "@/integrations/supabase/client";
import { fileToBase64 } from "@/lib/files";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/generate-exam/$courseId/$topicId")({
  validateSearch: (search: Record<string, unknown>): { lectureIds?: string[]; fileIds?: string[] } => ({
    lectureIds: Array.isArray(search.lectureIds) ? search.lectureIds.filter((x) => typeof x === "string") : [],
    fileIds: Array.isArray(search.fileIds) ? search.fileIds.filter((x) => typeof x === "string") : [],
  }),
  component: GenerateExamPage,
});

const TYPE_OPTIONS = [
  { value: "mcq", label: "Multiple choice" },
  { value: "cloze", label: "Cloze" },
  { value: "matching", label: "Matching" },
  { value: "truefalse", label: "True / False" },
  { value: "short", label: "Short answer" },
  { value: "mixed", label: "Mixed" },
] as const;

const COUNTS = [20, 50, 100] as const;
const DURATIONS = [30, 60, 90, 120] as const;

/** ~20MB combined / 12 files — enough for a solid batch of lecture PDFs without
 *  risking an oversized Anthropic request. No chunking — just a clear stop. */
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENTS = 12;

function GenerateExamPage() {
  const { courseId, topicId } = Route.useParams();
  const searchParams = Route.useSearch();
  const lectureIds = searchParams.lectureIds ?? [];
  const fileIds = searchParams.fileIds ?? [];
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
  const [duration, setDuration] = useState<number>(60);
  const [customDuration, setCustomDuration] = useState("");
  const [customDurationOn, setCustomDurationOn] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedLectures = (course?.topics ?? []).flatMap((t) => t.lectures).filter((l) => lectureIds.includes(l.id));
  const selectedFiles = (course?.topics ?? []).flatMap((t) => t.files).filter((f) => fileIds.includes(f.id));
  const involvedTopics = (course?.topics ?? []).filter(
    (t) => t.lectures.some((l) => lectureIds.includes(l.id)) || t.files.some((f) => fileIds.includes(f.id)),
  );

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
  const finalDuration = customDurationOn
    ? Math.min(Math.max(Number(customDuration) || 0, 5), 300)
    : duration;

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
    if (customDurationOn && (!customDuration || finalDuration < 5)) {
      toast.error("Enter a valid exam duration");
      return;
    }
    setLoading(true);
    try {
      const downloadable = selectedFiles.filter((f) => f.storagePath);
      const skipped = selectedFiles.filter((f) => !f.storagePath);
      if (skipped.length) {
        toast.warning(
          `${skipped.length} selected file(s) have no saved content and will be skipped: ${skipped
            .map((f) => f.name)
            .join(", ")}`,
        );
      }
      if (downloadable.length > MAX_DOCUMENTS) {
        toast.error(`Select at most ${MAX_DOCUMENTS} files per exam.`);
        setLoading(false);
        return;
      }

      const documents: { data: string; mediaType: string }[] = [];
      let totalBytes = 0;
      for (const f of downloadable) {
        const { data: blob, error } = await supabase.storage.from("materials").download(f.storagePath!);
        if (error || !blob) {
          toast.error(`Could not read ${f.name}: ${error?.message ?? "unknown error"}`);
          continue;
        }
        totalBytes += blob.size;
        if (totalBytes > MAX_DOCUMENT_BYTES) {
          toast.error(`Selected files exceed the ${(MAX_DOCUMENT_BYTES / 1024 / 1024).toFixed(0)}MB combined limit.`);
          setLoading(false);
          return;
        }
        documents.push({ data: await fileToBase64(blob), mediaType: f.mimeType || "application/pdf" });
      }

      const noteText = involvedTopics
        .flatMap((t) => t.notes.flatMap((n) => n.sections.map((s) => `## ${s.title}\n${s.body}`)))
        .join("\n\n")
        .slice(0, 60000);

      const subject = [
        `Course: ${course.name}. Topic: ${topic.name}.`,
        selectedLectures.length
          ? `Focus specifically on these lectures: ${selectedLectures
              .map((l) => `${l.number ? l.number + " " : ""}${l.name}`)
              .join("; ")}.`
          : "",
        documents.length ? `${documents.length} source document(s) are attached below — use them as primary grounding.` : "",
        noteText ? "Relevant study notes are attached below — use them as primary grounding." : "",
        !documents.length && !noteText
          ? "No specific material was selected — rely on general medical curriculum knowledge for this topic."
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      const res = await runGenerate({
        data: { subject, types, count: finalCount, noteText: noteText || undefined, documents },
      });
      if (!res.questions.length) {
        toast.error("The AI returned no questions. Try again.");
        return;
      }
      await createExam(
        courseId,
        topicId,
        `${topic.name} — AI exam (${res.questions.length}Q)`,
        finalDuration,
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

      <Card className="mb-4 border-none bg-muted/50 p-4 text-xs text-muted-foreground">
        {selectedLectures.length === 0 && selectedFiles.length === 0 ? (
          <>No material selected — questions will rely on general knowledge of this topic.</>
        ) : (
          <>
            Grounded in: {selectedLectures.length} lecture{selectedLectures.length === 1 ? "" : "s"},{" "}
            {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"}.
          </>
        )}
      </Card>

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

      <Card className="mb-5 border-none p-5">
        <Label className="mb-2 block">Exam duration (minutes)</Label>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <Button
              key={d}
              variant={!customDurationOn && duration === d ? "default" : "outline"}
              className="rounded-full"
              onClick={() => {
                setCustomDurationOn(false);
                setDuration(d);
              }}
            >
              {d}
            </Button>
          ))}
          <Button
            variant={customDurationOn ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setCustomDurationOn(true)}
          >
            Custom
          </Button>
        </div>
        {customDurationOn && (
          <Input
            type="number"
            min={5}
            max={300}
            placeholder="e.g. 45"
            className="mt-3"
            value={customDuration}
            onChange={(e) => setCustomDuration(e.target.value)}
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
