import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Sparkles, Loader2, NotebookPen } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { getAiKeyStatus, generateNotesChunk } from "@/lib/ai.functions";
import type { AiNoteSection } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/generate-notes/$courseId/$topicId")({
  component: GenerateNotesPage,
});

// Split the 9 sections into small batches so each AI call stays fast and
// never hits the request timeout. Zero-omission is preserved because every
// batch is instructed to read the whole source; batches only limit output.
const SECTION_BATCHES: { keys: string[]; label: string }[] = [
  { keys: ["overview"], label: "Overview" },
  { keys: ["full"], label: "Full Content" },
  { keys: ["tables", "highyield", "clinical"], label: "Tables & High Yield" },
  { keys: ["mistakes", "details", "quickcheck", "coverage"], label: "Details & Review" },
];

const SECTION_ORDER = [
  "overview",
  "full",
  "tables",
  "highyield",
  "clinical",
  "mistakes",
  "details",
  "quickcheck",
  "coverage",
];


const DETAIL_OPTIONS = [
  { value: "detailed", label: "Detailed", desc: "Exhaustive, longest" },
  { value: "balanced", label: "Balanced", desc: "Textbook depth" },
  { value: "concise", label: "Concise", desc: "Tight but complete" },
] as const;

function GenerateNotesPage() {
  const { courseId, topicId } = Route.useParams();
  const navigate = useNavigate();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const addNote = useStore((s) => s.addNote);
  const checkStatus = useServerFn(getAiKeyStatus);
  const runChunk = useServerFn(generateNotesChunk);

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [detail, setDetail] = useState<string>("balanced");
  const [fileId, setFileId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");

  useEffect(() => {
    checkStatus().then((r) => setHasKey(r.hasKey)).catch(() => setHasKey(false));
  }, [checkStatus]);

  useEffect(() => {
    if (topic && !fileId && topic.files[0]) setFileId(topic.files[0].id);
  }, [topic, fileId]);

  if (!course || !topic) {
    return (
      <AppShell>
        <p className="py-10 text-center text-sm text-muted-foreground">Topic not found</p>
      </AppShell>
    );
  }

  const onGenerate = async () => {
    if (!hasKey) {
      toast.error("AI features require an API key.");
      return;
    }
    if (topic.files.length === 0) {
      toast.error("Upload a file to this topic first");
      return;
    }
    setLoading(true);
    setProgress("");
    try {
      const file = topic.files.find((f) => f.id === fileId);
      const subject = `Course: ${course.name}. Topic: ${topic.name}. Source file: ${
        file?.name ?? topic.files.map((f) => f.name).join(", ")
      }.`;

      const total = SECTION_BATCHES.length;
      const collected: AiNoteSection[] = [];
      let title = "Study notes";
      let coverage = "";

      for (let i = 0; i < total; i++) {
        const batch = SECTION_BATCHES[i];
        setProgress(`Generating ${batch.label} — part ${i + 1} of ${total}…`);

        // Retry each chunk once before failing the whole job.
        let res: Awaited<ReturnType<typeof runChunk>> | null = null;
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            res = await runChunk({
              data: {
                subject,
                detail,
                sectionKeys: batch.keys,
                part: i + 1,
                total,
              },
            });
            break;
          } catch (err) {
            lastErr = err;
            if (attempt === 0) setProgress(`Retrying ${batch.label} — part ${i + 1} of ${total}…`);
          }
        }
        if (!res) {
          throw new Error(
            `Failed on "${batch.label}" (part ${i + 1} of ${total}): ${
              lastErr instanceof Error ? lastErr.message : "unknown error"
            }`,
          );
        }

        if (res.title && res.title !== "Study notes") title = res.title;
        if (res.coverage) coverage = res.coverage;
        collected.push(...res.sections);
      }

      // Merge and order all collected sections.
      const byKey = new Map(collected.map((s) => [s.key, s]));
      const sections = SECTION_ORDER.map((k) => byKey.get(k)).filter(
        (s): s is AiNoteSection => !!s,
      );

      if (!sections.length) {
        toast.error("The AI returned no notes. Try again.");
        return;
      }

      void coverage;
      setProgress("Saving notes…");
      const noteId = await addNote(courseId, topicId, title, sections);
      toast.success("Notes generated");
      if (noteId) {
        navigate({
          to: "/notes/$courseId/$topicId/$noteId",
          params: { courseId, topicId, noteId },
        });
      } else {
        navigate({ to: "/courses/$courseId/$topicId", params: { courseId, topicId } });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
      setProgress("");
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
        title="Generate notes (AI)"
        subtitle="Textbook-style notes from a file in this topic"
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

      <Card className="mb-4 border-none p-5">
        <Label className="mb-2 block">Source file</Label>
        {topic.files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No files yet.{" "}
            <Link to="/upload" className="font-semibold text-primary underline">
              Upload one first
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-2">
            {topic.files.map((f) => (
              <label
                key={f.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition-colors",
                  fileId === f.id ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="file"
                  checked={fileId === f.id}
                  onChange={() => setFileId(f.id)}
                />
                <span className="truncate font-medium text-foreground">{f.name}</span>
              </label>
            ))}
          </div>
        )}
      </Card>

      <Card className="mb-5 border-none p-5">
        <Label className="mb-2 block">Detail level</Label>
        <div className="grid grid-cols-3 gap-2">
          {DETAIL_OPTIONS.map((opt) => {
            const active = detail === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setDetail(opt.value)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  active ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <div className="text-sm font-semibold text-foreground">{opt.label}</div>
                <div className="text-[11px] text-muted-foreground">{opt.desc}</div>
              </button>
            );
          })}
        </div>
      </Card>

      <Button
        className="w-full rounded-full"
        onClick={onGenerate}
        disabled={loading || hasKey !== true || topic.files.length === 0}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <NotebookPen className="h-4 w-4" /> Generate notes
          </>
        )}
      </Button>
      {loading && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          This can take up to a minute for detailed notes.
        </p>
      )}
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        Notes cover every slide/page with zero omission and expand bullet points into
        full explanations — not a summary.
      </div>
    </AppShell>
  );
}
