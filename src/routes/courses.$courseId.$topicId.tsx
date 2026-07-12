import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  FileText,
  FileImage,
  Presentation,
  File as FileIcon,
  NotebookPen,
  ClipboardList,
  Layers,
  Upload as UploadIcon,
  Sparkles,
  Play,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useStore, type FileItem } from "@/lib/store";

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

  if (!course || !topic) {
    return (
      <AppShell>
        <EmptyState text="Topic not found" />
      </AppShell>
    );
  }

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

      <Tabs defaultValue="files">
        <TabsList className="mb-4 grid w-full grid-cols-4 rounded-full">
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

        <TabsContent value="files" className="space-y-3">
          {topic.files.length === 0 && <EmptyState text="No files in this topic yet" />}
          {topic.files.map((f) => {
            const Icon = kindIcon[f.kind];
            return (
              <Card key={f.id} className="flex items-center gap-3 border-none p-3.5">
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
            <Link
              key={n.id}
              to="/notes/$courseId/$topicId/$noteId"
              params={{ courseId, topicId, noteId: n.id }}
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
          ))}
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() =>
              navigate({
                to: "/generate-notes/$courseId/$topicId",
                params: { courseId, topicId },
              })
            }
          >
            <Sparkles className="h-4 w-4" /> Generate notes (AI)
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
            onClick={() =>
              navigate({
                to: "/create-exam/$courseId/$topicId",
                params: { courseId, topicId },
              })
            }
          >
            <ClipboardList className="h-4 w-4" /> Create exam manually
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() =>
              navigate({
                to: "/generate-exam/$courseId/$topicId",
                params: { courseId, topicId },
              })
            }
          >
            <Sparkles className="h-4 w-4" /> Generate exam (AI)
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() =>
              navigate({
                to: "/upload-exam/$courseId/$topicId",
                params: { courseId, topicId },
              })
            }
          >
            <UploadIcon className="h-4 w-4" /> Upload old exam (AI)
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() =>
              navigate({
                to: "/generate-image-exam/$courseId/$topicId",
                params: { courseId, topicId },
              })
            }
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
