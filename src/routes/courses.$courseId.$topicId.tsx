import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
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
        <EmptyState text="הנושא לא נמצא" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/courses"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronRight className="h-4 w-4" /> {course.name}
      </Link>
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-extrabold text-foreground">
        <span className="text-2xl">{course.emoji}</span> {topic.name}
      </h1>

      <Tabs defaultValue="files" dir="rtl">
        <TabsList className="mb-4 grid w-full grid-cols-4 rounded-full">
          <TabsTrigger value="files" className="rounded-full text-xs">
            <FileText className="ml-1 h-3.5 w-3.5" /> קבצים
          </TabsTrigger>
          <TabsTrigger value="notes" className="rounded-full text-xs">
            <NotebookPen className="ml-1 h-3.5 w-3.5" /> סיכומים
          </TabsTrigger>
          <TabsTrigger value="exams" className="rounded-full text-xs">
            <ClipboardList className="ml-1 h-3.5 w-3.5" /> מבחנים
          </TabsTrigger>
          <TabsTrigger value="cards" className="rounded-full text-xs">
            <Layers className="ml-1 h-3.5 w-3.5" /> כרטיסיות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="space-y-3">
          {topic.files.length === 0 && <EmptyState text="עדיין אין קבצים בנושא הזה" />}
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
                    {f.size} · נוסף {f.addedAt}
                  </div>
                </div>
              </Card>
            );
          })}
          <Button asChild variant="outline" className="w-full rounded-full">
            <Link to="/upload">
              <UploadIcon className="h-4 w-4" /> העלה קובץ לנושא
            </Link>
          </Button>
        </TabsContent>

        <TabsContent value="notes" className="space-y-3">
          {topic.notes.length === 0 && (
            <EmptyState text="אין סיכומים עדיין — צרו אחד מקובץ" />
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
                    {n.sections.length} מקטעים · עודכן {n.updatedAt}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() => toast("בקרוב: יצירת סיכום אוטומטי מקובץ ✨")}
          >
            <Sparkles className="h-4 w-4" /> צור סיכום (AI)
          </Button>
        </TabsContent>

        <TabsContent value="exams" className="space-y-3">
          {topic.exams.length === 0 && <EmptyState text="אין מבחנים בנושא הזה" />}
          {topic.exams.map((e) => (
            <Card key={e.id} className="border-none p-4">
              <div className="mb-3 flex items-center gap-3">
                <ClipboardList className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-foreground">{e.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.questions.length} שאלות · {e.durationMin} דק'
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
                <Play className="h-4 w-4" /> התחל מבחן
              </Button>
            </Card>
          ))}
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() => toast("בקרוב: יצירת מבחן אוטומטי מהחומר ✨")}
          >
            <Sparkles className="h-4 w-4" /> צור מבחן (AI)
          </Button>
        </TabsContent>

        <TabsContent value="cards">
          <div className="py-10 text-center">
            <Layers className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">כרטיסיות זיכרון יגיעו בקרוב</p>
            <Button
              variant="outline"
              className="mt-4 rounded-full"
              onClick={() => toast("בקרוב: יצירת כרטיסיות מהסיכום ✨")}
            >
              <Sparkles className="h-4 w-4" /> צור כרטיסיות (AI)
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
