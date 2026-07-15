import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  Sparkles,
  ClipboardList,
  MessageCircleQuestion,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useStore, type FileItem } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/upload")({
  component: UploadPage,
});

function detectKind(name: string): FileItem["kind"] {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".ppt") || n.endsWith(".pptx")) return "ppt";
  if (n.endsWith(".doc") || n.endsWith(".docx")) return "word";
  return "image";
}

function UploadPage() {
  const navigate = useNavigate();
  const { courses, addFile } = useStore();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const selectedCourse = courses.find((c) => c.id === courseId);
  const [topicId, setTopicId] = useState(selectedCourse?.topics[0]?.id ?? "");
  const selectedTopic = selectedCourse?.topics.find((t) => t.id === topicId);
  const [lectureId, setLectureId] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !courseId || !topicId) {
      if (!topicId) toast("Select a course and topic before uploading");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      toast.error("Sign in to upload files");
      return;
    }
    setUploading(true);
    const names: string[] = [];
    try {
      for (const f of Array.from(files)) {
        const storagePath = `${user.id}/${topicId}/${crypto.randomUUID()}-${f.name}`;
        const { error } = await supabase.storage.from("materials").upload(storagePath, f, {
          contentType: f.type || "application/octet-stream",
        });
        if (error) {
          toast.error(`Failed to upload ${f.name}: ${error.message}`);
          continue;
        }
        await addFile(courseId, topicId, {
          name: f.name,
          kind: detectKind(f.name),
          size: `${(f.size / 1024 / 1024).toFixed(1)}MB`,
          addedAt: "just now",
          storagePath,
          mimeType: f.type || "application/octet-stream",
          lectureId: lectureId || undefined,
        });
        names.push(f.name);
      }
      if (names.length) {
        setUploaded((u) => [...names, ...u]);
        toast.success(`${names.length} file(s) uploaded successfully`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppShell>
      <PageTitle title="Upload materials" subtitle="PDF · PowerPoint · Word · Images" />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Select
          value={courseId}
          onValueChange={(v) => {
            setCourseId(v);
            const c = courses.find((x) => x.id === v);
            setTopicId(c?.topics[0]?.id ?? "");
            setLectureId("");
          }}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Select course" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={topicId}
          onValueChange={(v) => {
            setTopicId(v);
            setLectureId("");
          }}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Select topic" />
          </SelectTrigger>
          <SelectContent>
            {selectedCourse?.topics.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!!selectedTopic?.lectures.length && (
        <div className="mb-4">
          <Select value={lectureId} onValueChange={setLectureId}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Attach to a lecture (optional)" />
            </SelectTrigger>
            <SelectContent>
              {selectedTopic.lectures.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.number && <span className="font-mono">{l.number} — </span>}
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading) void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-10 text-center transition-colors",
          uploading && "pointer-events-none opacity-60",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:bg-muted/40",
        )}
      >
        <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          {uploading ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : (
            <UploadCloud className="h-7 w-7" />
          )}
        </div>
        <p className="font-semibold text-foreground">Drag files here</p>
        <p className="mt-1 text-sm text-muted-foreground">or click to browse your device</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.ppt,.pptx,.doc,.docx,image/*"
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {uploaded.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" /> Just uploaded
          </h2>
          <div className="space-y-2">
            {uploaded.map((name, i) => (
              <Card key={i} className="flex items-center gap-3 border-none p-3">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                <span className="truncate text-sm font-medium text-foreground">
                  {name}
                </span>
              </Card>
            ))}
          </div>

          <div className="mt-4 grid gap-2">
            <Button
              className="rounded-full"
              onClick={() => {
                if (!courseId || !topicId) {
                  toast("Select a course and topic first");
                  return;
                }
                navigate({
                  to: "/generate-notes/$courseId/$topicId",
                  params: { courseId, topicId },
                });
              }}
            >
              <Sparkles className="h-4 w-4" /> Generate notes
            </Button>
            <Button
              variant="secondary"
              className="rounded-full"
              onClick={() => {
                if (!courseId || !topicId) {
                  toast("Select a course and topic first");
                  return;
                }
                navigate({
                  to: "/generator",
                  search: { courseId, topicId },
                });
              }}
            >
              <ClipboardList className="h-4 w-4" /> Generate exam
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => toast("Coming soon: ask anything about your material ✨")}
            >
              <MessageCircleQuestion className="h-4 w-4" /> Ask anything
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
