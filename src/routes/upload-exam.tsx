import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, UploadCloud, CheckCircle2, FileUp } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useStore, type QuestionType } from "@/lib/store";
import { getAiKeyStatus, parseOldExam } from "@/lib/ai.functions";
import { extractImages, stripDataUrl } from "@/lib/extract-images";
import { fileToBase64 } from "@/lib/files";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/upload-exam")({
  component: UploadOldExamPage,
});

const DURATIONS = [30, 60, 90, 120] as const;

function UploadOldExamPage() {
  const navigate = useNavigate();
  const courses = useStore((s) => s.courses);
  const createExam = useStore((s) => s.createExam);
  const checkStatus = useServerFn(getAiKeyStatus);
  const runParse = useServerFn(parseOldExam);
  const inputRef = useRef<HTMLInputElement>(null);

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const course = courses.find((c) => c.id === courseId);
  const [topicId, setTopicId] = useState(course?.topics[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<{ detected: number; converted: number } | null>(null);
  const [duration, setDuration] = useState<number>(60);
  const [customDuration, setCustomDuration] = useState("");
  const [customDurationOn, setCustomDurationOn] = useState(false);
  const finalDuration = customDurationOn ? Math.min(Math.max(Number(customDuration) || 0, 5), 300) : duration;

  useEffect(() => {
    checkStatus().then((r) => setHasKey(r.hasKey)).catch(() => setHasKey(false));
  }, [checkStatus]);

  useEffect(() => {
    if (course && !course.topics.some((t) => t.id === topicId)) {
      setTopicId(course.topics[0]?.id ?? "");
    }
  }, [course, topicId]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }
    setFile(f);
    setReport(null);
  };

  const onProcess = async () => {
    if (!hasKey) {
      toast.error("AI features require an API key.");
      return;
    }
    if (!course || !topicId) {
      toast.error("Choose a course and topic to save the exam into");
      return;
    }
    if (!file) {
      toast.error("Choose a PDF first");
      return;
    }
    const topic = course.topics.find((t) => t.id === topicId);
    setLoading(true);
    setReport(null);
    try {
      const pdfBase64 = await fileToBase64(file);
      // render pages so the AI can see the yellow-highlighted answers and keep original figures
      const pageImages = await extractImages([file]).catch(() => []);
      const res = await runParse({
        data: {
          pdfBase64,
          mediaType: "application/pdf",
          images: pageImages.map((im) => ({
            data: stripDataUrl(im.dataUrl),
            mediaType: im.mediaType,
          })),
        },
      });
      setReport({ detected: res.detected, converted: res.converted });
      if (!res.questions.length) {
        toast.error("No questions could be extracted from this PDF.");
        return;
      }
      await createExam(
        courseId,
        topicId,
        file.name.replace(/\.pdf$/i, "") || `${topic?.name ?? "Past"} — past exam`,
        finalDuration,
        res.questions.map((q) => {
          const hasImg = q.imageIndex !== undefined && pageImages[q.imageIndex];
          return {
            type: q.type as QuestionType,
            text: q.text,
            blanks: q.blanks,
            explanations: q.explanations ?? [],
            imageUrl: hasImg ? pageImages[q.imageIndex!].dataUrl : undefined,
            imageLabels: hasImg ? q.imageLabels ?? [] : undefined,
          };
        }),
      );
      toast.success(`Saved exam with ${res.questions.length} questions`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not process the exam");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Practice"
        title="Upload Old Exam"
        subtitle="Convert a past exam PDF into an interactive exam — reproduced exactly, ready to take."
      />

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-14 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted">
            <FileUp className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-display text-lg font-semibold text-foreground">
            No courses yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a course and topic first, then upload a past exam into it.
          </p>
          <Link
            to="/courses"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Go to Courses
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {hasKey === false && (
            <div className="rounded-2xl border border-border bg-muted p-4 text-sm text-muted-foreground">
              AI features require an API key.{" "}
              <Link to="/settings" className="font-semibold text-primary underline">
                Add it in Settings
              </Link>
              .
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="eyebrow mb-2">Course</p>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground/30"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="eyebrow mb-2">Topic</p>
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                disabled={!course || course.topics.length === 0}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground/30 disabled:opacity-50"
              >
                {course?.topics.length ? (
                  course.topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                ) : (
                  <option value="">No topics — add one first</option>
                )}
              </select>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border bg-card/50",
            )}
          >
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-9 w-9 text-primary" />
                <div className="font-semibold text-foreground">{file.name}</div>
                <div className="text-xs text-muted-foreground">Tap to choose a different file</div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <UploadCloud className="h-9 w-9" />
                <div className="font-semibold text-foreground">Drop a past exam PDF here</div>
                <div className="text-xs">or tap to browse</div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
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
            <p className="mt-2 text-xs text-muted-foreground">
              Just a starting default — you'll choose the timer again when you start the exam.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-muted/60 p-4 text-xs leading-relaxed text-muted-foreground">
            Your exam is reproduced exactly as written — wording and fill-in-the-blank passages
            are never rewritten. Each missing word/phrase gets 4–8 shuffled answer choices, with
            the correct one read from the <strong>yellow-highlighted answer</strong> in your PDF —
            never from a student's circled or checked answer.
          </div>

          {report && (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-success/10 p-4 text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
              <span className="font-medium text-foreground">
                Detected {report.detected} questions, converted {report.converted}
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onProcess}
              disabled={loading || !file || hasKey !== true || !topicId}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                </>
              ) : (
                "Convert & save exam"
              )}
            </button>
            {report && report.converted > 0 && course && topicId && (
              <button
                onClick={() =>
                  navigate({
                    to: "/courses/$courseId/$topicId",
                    params: { courseId, topicId },
                  })
                }
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground"
              >
                View topic
              </button>
            )}
          </div>
          {loading && (
            <p className="text-xs text-muted-foreground">
              This can take up to a minute for large exams.
            </p>
          )}
        </div>
      )}
    </AppShell>
  );
}
