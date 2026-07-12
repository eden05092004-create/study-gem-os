import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  UploadCloud,
  CheckCircle2,
  X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useStore, type QuestionType } from "@/lib/store";
import { getAiKeyStatus, generateImageExam } from "@/lib/ai.functions";
import { extractImages, stripDataUrl, type ExtractedImage } from "@/lib/extract-images";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/generate-image-exam/$courseId/$topicId")({
  component: GenerateImageExamPage,
});

function GenerateImageExamPage() {
  const { courseId, topicId } = Route.useParams();
  const navigate = useNavigate();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const createExam = useStore((s) => s.createExam);
  const checkStatus = useServerFn(getAiKeyStatus);
  const runGenerate = useServerFn(generateImageExam);
  const inputRef = useRef<HTMLInputElement>(null);

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

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

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter(
      (f) => f.type === "application/pdf" || f.type.startsWith("image/"),
    );
    if (picked.length === 0) {
      toast.error("Upload a PDF, PPT-exported image, or image file");
      return;
    }
    setFiles((prev) => [...prev, ...picked]);
    setSaved(false);
    setExtracting(true);
    try {
      const imgs = await extractImages(picked);
      setImages((prev) => [...prev, ...imgs].slice(0, 20));
    } catch {
      toast.error("Could not read images from that file");
    } finally {
      setExtracting(false);
    }
  };

  const removeAll = () => {
    setFiles([]);
    setImages([]);
    setSaved(false);
  };

  const onGenerate = async () => {
    if (!hasKey) {
      toast.error("AI features require an API key.");
      return;
    }
    if (images.length === 0) {
      toast.error("Add at least one image or a PDF page first");
      return;
    }
    setLoading(true);
    setSaved(false);
    try {
      const res = await runGenerate({
        data: {
          subject: topic.name,
          count: Math.min(40, images.length * 3),
          images: images.map((im) => ({
            data: stripDataUrl(im.dataUrl),
            mediaType: im.mediaType,
          })),
        },
      });
      if (!res.questions.length) {
        toast.error("No image questions could be generated.");
        return;
      }
      await createExam(
        courseId,
        topicId,
        `${topic.name} — image questions`,
        Math.max(10, Math.round(res.questions.length * 1.5)),
        res.questions.map((q) => {
          const idx = q.imageIndex ?? 0;
          const img = images[idx] ?? images[0];
          const isImage = q.type.startsWith("image");
          return {
            type: q.type as QuestionType,
            text: q.text,
            blanks: q.blanks,
            explanations: q.explanations ?? [],
            imageUrl: isImage ? img?.dataUrl : undefined,
            imageLabels: isImage ? q.imageLabels ?? [] : undefined,
          };
        }),
      );
      setSaved(true);
      toast.success(`Saved exam with ${res.questions.length} image questions`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate the exam");
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
      <PageTitle
        title="Image-based questions"
        subtitle="Turn diagrams, histology slides and structures into interactive questions"
      />

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
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
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
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "mb-4 cursor-pointer border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <UploadCloud className="h-9 w-9" />
          <div className="font-semibold text-foreground">
            Drop PDFs or images with diagrams
          </div>
          <div className="text-xs">or tap to browse — images stay from your own material</div>
        </div>
      </Card>

      {extracting && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading images…
        </p>
      )}

      {images.length > 0 && (
        <Card className="mb-4 border-none p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              {images.length} image{images.length > 1 ? "s" : ""} ready
              {files.length > 0 && ` · ${files.length} file${files.length > 1 ? "s" : ""}`}
            </span>
            <button
              onClick={removeAll}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((im, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-lg border border-border bg-muted"
              >
                <img src={im.dataUrl} alt={`Figure ${i + 1}`} className="h-24 w-full object-cover" />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-4 border-none bg-muted/60 p-4 text-xs leading-relaxed text-muted-foreground">
        The AI creates <strong>Identify structure</strong>, <strong>Image matching</strong> and{" "}
        <strong>Clinical from image</strong> questions using only your uploaded figures. Each
        labeled structure is worth 1 point.
      </Card>

      {saved && (
        <Card className="mb-4 flex items-center gap-3 border-none bg-success/10 p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <span className="font-medium text-foreground">Exam saved to this topic</span>
        </Card>
      )}

      <Button
        className="w-full rounded-full"
        onClick={onGenerate}
        disabled={loading || extracting || images.length === 0 || hasKey !== true}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Generating…
          </>
        ) : (
          "Generate image exam"
        )}
      </Button>
      {saved && (
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
