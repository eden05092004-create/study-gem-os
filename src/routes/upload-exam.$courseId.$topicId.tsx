import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, FileText, Loader2, UploadCloud, CheckCircle2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useStore, type QuestionType } from "@/lib/store";
import { getAiKeyStatus, parseOldExam } from "@/lib/ai.functions";
import { extractImages, stripDataUrl } from "@/lib/extract-images";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/upload-exam/$courseId/$topicId")({
  component: UploadExamPage,
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function UploadExamPage() {
  const { courseId, topicId } = Route.useParams();
  const navigate = useNavigate();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const createExam = useStore((s) => s.createExam);
  const checkStatus = useServerFn(getAiKeyStatus);
  const runParse = useServerFn(parseOldExam);
  const inputRef = useRef<HTMLInputElement>(null);

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<{ detected: number; converted: number } | null>(null);

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
    if (!file) {
      toast.error("Choose a PDF first");
      return;
    }
    setLoading(true);
    setReport(null);
    try {
      const pdfBase64 = await fileToBase64(file);
      const res = await runParse({ data: { pdfBase64, mediaType: "application/pdf" } });
      setReport({ detected: res.detected, converted: res.converted });
      if (!res.questions.length) {
        toast.error("No questions could be extracted from this PDF.");
        return;
      }
      await createExam(
        courseId,
        topicId,
        file.name.replace(/\.pdf$/i, "") || `${topic.name} — past exam`,
        Math.max(10, Math.round(res.questions.length * 1.2)),
        res.questions.map((q) => ({
          type: q.type as QuestionType,
          text: q.text,
          blanks: q.blanks,
          explanations: q.explanations ?? [],
        })),
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
      <Link
        to="/courses/$courseId/$topicId"
        params={{ courseId, topicId }}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {topic.name}
      </Link>
      <PageTitle title="Upload old exam" subtitle="Reproduce a past exam exactly as written" />

      {hasKey === false && (
        <Card className="mb-4 border-none bg-muted p-4 text-sm text-muted-foreground">
          AI features require an API key.{" "}
          <Link to="/settings" className="font-semibold text-primary underline">
            Add it in Settings
          </Link>
          .
        </Card>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      <Card
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
          "mb-4 cursor-pointer border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
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
      </Card>

      <Card className="mb-4 border-none bg-muted/60 p-4 text-xs leading-relaxed text-muted-foreground">
        Questions are reproduced <strong>exactly</strong> as written — no rewording, no fixes,
        original typos kept. Correct answers are read only from the{" "}
        <code>The correct answer is: [ ]</code> lines, never from student selections.
      </Card>

      {report && (
        <Card className="mb-4 flex items-center gap-3 border-none bg-success/10 p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <span className="font-medium text-foreground">
            Detected {report.detected} questions, converted {report.converted}
          </span>
        </Card>
      )}

      <Button
        className="w-full rounded-full"
        onClick={onProcess}
        disabled={loading || !file || hasKey !== true}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Processing…
          </>
        ) : (
          "Convert & save exam"
        )}
      </Button>
      {report && report.converted > 0 && (
        <Button
          variant="outline"
          className="mt-3 w-full rounded-full"
          onClick={() =>
            navigate({ to: "/courses/$courseId/$topicId", params: { courseId, topicId } })
          }
        >
          Back to topic
        </Button>
      )}
    </AppShell>
  );
}
