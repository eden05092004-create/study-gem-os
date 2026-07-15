import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronLeft,
  FileText,
  FileImage,
  Presentation,
  File as FileIcon,
  NotebookPen,
  ClipboardList,
  Layers,
  GraduationCap,
  Plus,
  Upload as UploadIcon,
  Sparkles,
  Play,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { toast } from "sonner";
import { useStore, type FileItem } from "@/lib/store";
import { parseLectures } from "@/lib/lectures";

export const Route = createFileRoute("/courses/$courseId/$topicId")({
  component: TopicDetail,
});

const kindIcon: Record<FileItem["kind"], typeof FileText> = {
  pdf: FileText,
  ppt: Presentation,
  word: FileIcon,
  image: FileImage,
};

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>
  );
}

function TopicDetail() {
  const { courseId, topicId } = Route.useParams();
  const navigate = useNavigate();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const deleteFile = useStore((s) => s.deleteFile);
  const deleteExam = useStore((s) => s.deleteExam);
  const deleteNote = useStore((s) => s.deleteNote);
  const addLectures = useStore((s) => s.addLectures);
  const deleteLecture = useStore((s) => s.deleteLecture);
  const [lectureInput, setLectureInput] = useState("");

  if (!course || !topic) {
    return (
      <AppShell>
        <EmptyState text="Topic not found" />
      </AppShell>
    );
  }

  const params = { courseId, topicId };

  return (
    <AppShell>
      <Link
        to="/courses"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {course.name}
      </Link>
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-extrabold text-foreground">
        <span className="text-2xl">{course.emoji}</span> {topic.name}
      </h1>

      <Tabs defaultValue="lectures">
        <TabsList className="mb-4 grid w-full grid-cols-5 rounded-full">
          <TabsTrigger value="lectures" className="rounded-full text-xs">
            <GraduationCap className="mr-1 h-3.5 w-3.5" /> Lectures
          </TabsTrigger>
          <TabsTrigger value="files" className="rounded-full text-xs">
            <FileText className="mr-1 h-3.5 w-3.5" /> Files
          </TabsTrigger>
          <TabsTrigger value="notes" className="rounded-full text-xs">
            <NotebookPen className="mr-1 h-3.5 w-3.5" /> Notes
          </TabsTrigger>
          <TabsTrigger value="exams" className="rounded-full text-xs">
            <ClipboardList className="mr-1 h-3.5 w-3.5" /> Exams
          </TabsTrigger>
          <TabsTrigger value="cards" className="rounded-full text-xs">
            <Layers className="mr-1 h-3.5 w-3.5" /> Flashcards
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lectures" className="space-y-3">
          <Card className="border-none p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
              <GraduationCap className="h-4 w-4 text-primary" /> Add lectures
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              Type or paste a list — one lecture per line, e.g.
              <br />
              <span className="font-mono">1002 – History of Life on Earth</span>
            </p>
            <Textarea
              value={lectureInput}
              onChange={(e) => setLectureInput(e.target.value)}
              placeholder={"1002 – History of Life on Earth\n1003 – Structure of Prokaryotic Cell"}
              className="min-h-24 rounded-xl font-mono text-sm"
            />
            <Button
              className="mt-3 w-full rounded-full"
              onClick={async () => {
                const parsed = parseLectures(lectureInput);
                if (parsed.length === 0) {
                  toast.error("Nothing to add");
                  return;
                }
                await addLectures(courseId, topicId, parsed);
                setLectureInput("");
                toast.success(
                  `${parsed.length} lecture${parsed.length > 1 ? "s" : ""} added`,
                );
              }}
            >
              <Plus className="h-4 w-4" /> Add lectures
            </Button>
          </Card>

          {topic.lectures.length === 0 ? (
            <EmptyState text="No lectures yet — add some above" />
          ) : (
            <>
              <p className="px-1 text-xs font-semibold text-muted-foreground">
                {topic.lectures.length} lecture
                {topic.lectures.length > 1 ? "s" : ""}
              </p>
              {topic.lectures.map((l) => (
                <Card key={l.id} className="border-none p-3">
                  <div className="flex items-center gap-3">
                    {l.number && (
                      <span className="shrink-0 rounded-lg bg-primary/10 px-2 py-1 font-mono text-xs font-bold text-primary">
                        {l.number}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {l.name || "Untitled"}
                    </span>
                    <ConfirmDelete
                      title="Delete lecture?"
                      description="This removes the lecture from this topic."
                      onConfirm={() => {
                        deleteLecture(courseId, topicId, l.id);
                        toast.success("Lecture deleted");
                      }}
                    />
                  </div>
                </Card>
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="files" className="space-y-3">
          {topic.files.length === 0 && <EmptyState text="No files in this topic yet" />}
          {topic.files.map((f) => {
            const Icon = kindIcon[f.kind];
            return (
              <Card key={f.id} className="border-none p-3.5">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {f.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {f.size} · added {f.addedAt}
                    </div>
                  </div>
                  <ConfirmDelete
                    title={`Delete "${f.name}"?`}
                    description="This permanently removes the file from this topic."
                    onConfirm={() => {
                      deleteFile(courseId, topicId, f.id);
                      toast.success("File deleted");
                    }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full text-xs"
                    onClick={() => navigate({ to: "/generate-notes/$courseId/$topicId", params })}
                  >
                    <NotebookPen className="h-3.5 w-3.5" /> Generate Notes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full text-xs"
                    onClick={() => navigate({ to: "/generate-exam/$courseId/$topicId", params })}
                  >
                    <ClipboardList className="h-3.5 w-3.5" /> Generate Exam
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full text-xs"
                    onClick={() =>
                      navigate({ to: "/generate-image-exam/$courseId/$topicId", params })
                    }
                  >
                    <FileImage className="h-3.5 w-3.5" /> Image Questions
                  </Button>
                  {f.storagePath && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full text-xs"
                      onClick={() =>
                        navigate({
                          to: "/teach/$courseId/$topicId/$fileId",
                          params: { courseId, topicId, fileId: f.id },
                        })
                      }
                    >
                      <GraduationCap className="h-3.5 w-3.5" /> Teach me
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
          <Button asChild variant="outline" className="w-full rounded-full">
            <Link to="/upload">
              <UploadIcon className="h-4 w-4" /> Upload a file to this topic
            </Link>
          </Button>
        </TabsContent>

        <TabsContent value="notes" className="space-y-3">
          {topic.notes.length === 0 && (
            <EmptyState text="No notes yet — generate one from a file" />
          )}
          {topic.notes.map((n) => (
            <div key={n.id} className="flex items-center gap-2">
              <Link
                to="/notes/$courseId/$topicId/$noteId"
                params={{ courseId, topicId, noteId: n.id }}
                className="min-w-0 flex-1"
              >
                <Card className="card-hover flex items-center gap-3 border-none p-4">
                  <NotebookPen className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-foreground">{n.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {n.sections.length} sections · updated {n.updatedAt}
                    </div>
                  </div>
                </Card>
              </Link>
              <ConfirmDelete
                title={`Delete "${n.title}"?`}
                description="This permanently deletes this note."
                onConfirm={() => {
                  deleteNote(courseId, topicId, n.id);
                  toast.success("Note deleted");
                }}
              />
            </div>
          ))}
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() => navigate({ to: "/generate-notes/$courseId/$topicId", params })}
          >
            <Sparkles className="h-4 w-4" /> Generate notes (AI)
          </Button>
          <Button
            className="w-full rounded-full"
            onClick={() => navigate({ to: "/write-note/$courseId/$topicId", params })}
          >
            <NotebookPen className="h-4 w-4" /> Write notes myself
          </Button>
        </TabsContent>

        <TabsContent value="exams" className="space-y-3">
          {topic.exams.length === 0 && <EmptyState text="No exams in this topic" />}
          {topic.exams.map((e) => (
            <Card key={e.id} className="border-none p-4">
              <div className="mb-3 flex items-center gap-3">
                <ClipboardList className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-foreground">{e.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.questions.length} questions · {e.durationMin} min
                  </div>
                </div>
                <ConfirmDelete
                  title={`Delete "${e.title}"?`}
                  description="This exam will be moved to Trash and permanently deleted after 30 days unless you restore it."
                  label="Move to Trash"
                  onConfirm={async () => {
                    try {
                      await deleteExam(courseId, topicId, e.id);
                      toast.success("Exam moved to Trash");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not delete the exam");
                    }
                  }}
                />
              </div>
              <Button
                className="w-full rounded-full"
                onClick={() =>
                  navigate({
                    to: "/exam/$courseId/$topicId/$examId",
                    params: { courseId, topicId, examId: e.id },
                  })
                }
              >
                <Play className="h-4 w-4" /> Start exam
              </Button>
            </Card>
          ))}
          <Button
            className="w-full rounded-full"
            onClick={() => navigate({ to: "/create-exam/$courseId/$topicId", params })}
          >
            <ClipboardList className="h-4 w-4" /> Create exam manually
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() => navigate({ to: "/generate-exam/$courseId/$topicId", params })}
          >
            <Sparkles className="h-4 w-4" /> Generate exam (AI)
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() => navigate({ to: "/upload-exam/$courseId/$topicId", params })}
          >
            <UploadIcon className="h-4 w-4" /> Upload old exam (AI)
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() => navigate({ to: "/generate-image-exam/$courseId/$topicId", params })}
          >
            <FileImage className="h-4 w-4" /> Image questions (AI)
          </Button>
        </TabsContent>

        <TabsContent value="cards">
          <div className="py-10 text-center">
            <Layers className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Flashcards are coming soon</p>
            <Button
              variant="outline"
              className="mt-4 rounded-full"
              onClick={() => toast("Coming soon: generate flashcards from your notes ✨")}
            >
              <Sparkles className="h-4 w-4" /> Generate flashcards (AI)
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
