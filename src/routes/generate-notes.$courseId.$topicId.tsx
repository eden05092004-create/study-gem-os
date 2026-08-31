import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Sparkles, Loader2, NotebookPen, Languages } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { getAiKeyStatus, generateNotesChunk } from "@/lib/ai.functions";
import type { AiNoteSection } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { fileToBase64 } from "@/lib/files";
import { MaterialPicker, type MaterialSelection } from "@/components/MaterialPicker";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/generate-notes/$courseId/$topicId")({
  validateSearch: (search: Record<string, unknown>): { lectureIds?: string[]; fileIds?: string[] } => ({
    lectureIds: Array.isArray(search.lectureIds) ? search.lectureIds.filter((x) => typeof x === "string") : [],
    fileIds: Array.isArray(search.fileIds) ? search.fileIds.filter((x) => typeof x === "string") : [],
  }),
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

/** ~20MB combined / 12 files — enough for a solid batch of PDFs/slide decks
 *  without risking an oversized Anthropic request. No chunking — just a clear stop. */
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENTS = 12;

function GenerateNotesPage() {
  const { courseId, topicId } = Route.useParams();
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const addNote = useStore((s) => s.addNote);
  const checkStatus = useServerFn(getAiKeyStatus);
  const runChunk = useServerFn(generateNotesChunk);

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [detail, setDetail] = useState<string>("balanced");
  const [material, setMaterial] = useState<MaterialSelection>({
    lectureIds: searchParams.lectureIds ?? [],
    fileIds: searchParams.fileIds ?? [],
  });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const defaultApplied = useRef(false);

  useEffect(() => {
    checkStatus().then((r) => setHasKey(r.hasKey)).catch(() => setHasKey(false));
  }, [checkStatus]);

  // First-run convenience: if the link here didn't already specify material
  // (e.g. from "Generate Notes" on a topic page), default to everything in
  // this topic so a single file still "just works" with one click. Runs once.
  useEffect(() => {
    if (defaultApplied.current || !topic) return;
    const hasPreselection = (searchParams.lectureIds?.length ?? 0) > 0 || (searchParams.fileIds?.length ?? 0) > 0;
    if (!hasPreselection && (topic.files.length > 0 || topic.lectures.length > 0)) {
      setMaterial({
        lectureIds: topic.lectures.map((l) => l.id),
        fileIds: topic.files.map((f) => f.id),
      });
    }
    defaultApplied.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

  if (!course || !topic) {
    return (
      <AppShell>
        <p className="py-10 text-center text-sm text-muted-foreground">Topic not found</p>
      </AppShell>
    );
  }

  const selectedFiles = course.topics.flatMap((t) => t.files).filter((f) => material.fileIds.includes(f.id));
  const selectedLectures = course.topics
    .flatMap((t) => t.lectures)
    .filter((l) => material.lectureIds.includes(l.id));
  const involvedTopics = course.topics.filter(
    (t) => t.lectures.some((l) => material.lectureIds.includes(l.id)) || t.files.some((f) => material.fileIds.includes(f.id)),
  );

  const onGenerate = async () => {
    if (!hasKey) {
      toast.error("AI features require an API key.");
      return;
    }
    if (selectedFiles.length === 0) {
      toast.error("Select at least one PDF or slide deck to summarize");
      return;
    }
    setLoading(true);
    setProgress("Reading source files…");
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
      if (downloadable.length === 0) {
        toast.error("None of the selected files have saved content to read.");
        setLoading(false);
        setProgress("");
        return;
      }
      if (downloadable.length > MAX_DOCUMENTS) {
        toast.error(`Select at most ${MAX_DOCUMENTS} files per summary.`);
        setLoading(false);
        setProgress("");
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
          setProgress("");
          return;
        }
        documents.push({ data: await fileToBase64(blob), mediaType: f.mimeType || "application/pdf" });
      }
      if (!documents.length) {
        toast.error("Could not read any of the selected files.");
        setLoading(false);
        setProgress("");
        return;
      }

      const topicNames = involvedTopics.map((t) => t.name).join(", ") || topic.name;
      const fileList = downloadable.map((f, i) => `${i + 1}. ${f.name}`).join("\n");
      const subject = [
        `Course: ${course.name}.`,
        `Topics covered by the selected material: ${topicNames}.`,
        selectedLectures.length
          ? `Selected lectures: ${selectedLectures.map((l) => `${l.number ? l.number + " " : ""}${l.name}`).join("; ")}.`
          : "",
        `${documents.length} source document(s) are attached, in this order:\n${fileList}`,
      ]
        .filter(Boolean)
        .join(" ");

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
                documents,
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
        subtitle="Pick every PDF or slide deck you want summarized together, by topic"
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
        <Label className="mb-2 block">Material to summarize</Label>
        <p className="mb-3 text-xs text-muted-foreground">
          Select any files or lectures from anywhere in this course — everything you check is combined
          into one set of notes, clearly organized by topic.
        </p>
        <MaterialPicker topics={course.topics} value={material} onChange={setMaterial} />
      </Card>

      <Card className="mb-4 border-none bg-muted/50 p-4 text-xs text-muted-foreground">
        {selectedFiles.length === 0 ? (
          <>Nothing selected yet — pick at least one file above to ground the summary in your real material.</>
        ) : (
          <>
            Summarizing {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"}
            {involvedTopics.length > 1 ? ` across ${involvedTopics.length} topics` : ""}: {involvedTopics.map((t) => t.name).join(", ")}.
          </>
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
        disabled={loading || hasKey !== true || selectedFiles.length === 0}
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
          {progress || "Generating notes in parts to avoid timeouts…"}
        </p>
      )}
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        Notes cover every slide/page with zero omission, split cleanly by topic when multiple
        files are combined, and expand bullet points into full explanations — not a summary.
      </div>
      <div className="mt-2 flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
        <Languages className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        Always written in clear, professional English — no matter what language the source
        material is in.
      </div>
    </AppShell>
  );
}
