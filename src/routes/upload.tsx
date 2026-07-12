import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  Sparkles,
  ClipboardList,
  MessageCircleQuestion,
  CheckCircle2,
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
  const { courses, addFile } = useStore();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const selectedCourse = courses.find((c) => c.id === courseId);
  const [topicId, setTopicId] = useState(selectedCourse?.topics[0]?.id ?? "");
  const [dragging, setDragging] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || !courseId || !topicId) {
      if (!topicId) toast("Select a course and topic before uploading");
      return;
    }
    const names: string[] = [];
    Array.from(files).forEach((f) => {
      addFile(courseId, topicId, {
        name: f.name,
        kind: detectKind(f.name),
        size: `${(f.size / 1024 / 1024).toFixed(1)}MB`,
        addedAt: "just now",
      });
      names.push(f.name);
    });
    setUploaded((u) => [...names, ...u]);
    toast.success(`${names.length} file(s) uploaded successfully`);
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

        <Select value={topicId} onValueChange={setTopicId}>
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

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-10 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:bg-muted/40",
        )}
      >
        <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <UploadCloud className="h-7 w-7" />
        </div>
        <p className="font-semibold text-foreground">גררו קבצים לכאן</p>
        <p className="mt-1 text-sm text-muted-foreground">או לחצו לבחירה מהמכשיר</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.ppt,.pptx,.doc,.docx,image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {uploaded.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" /> הועלה זה עתה
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
              onClick={() => toast("בקרוב: יצירת סיכום מהקובץ ✨")}
            >
              <Sparkles className="h-4 w-4" /> צור סיכום
            </Button>
            <Button
              variant="secondary"
              className="rounded-full"
              onClick={() => toast("בקרוב: יצירת מבחן מהקובץ ✨")}
            >
              <ClipboardList className="h-4 w-4" /> צור מבחן
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => toast("בקרוב: שאלו כל שאלה על החומר ✨")}
            >
              <MessageCircleQuestion className="h-4 w-4" /> שאל כל דבר
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
