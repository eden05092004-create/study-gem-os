import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ClipboardList, Clock, RotateCcw, Trash2 } from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { toast } from "sonner";
import { useStore, TRASH_RETENTION_DAYS } from "@/lib/store";

export const Route = createFileRoute("/trash")({
  component: TrashPage,
});

function daysLeft(deletedAt: string): number {
  const ageDays = (Date.now() - new Date(deletedAt).getTime()) / 86400000;
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - ageDays));
}

function TrashPage() {
  const trash = useStore((s) => s.trash);
  const restoreExam = useStore((s) => s.restoreExam);
  const permanentlyDeleteExam = useStore((s) => s.permanentlyDeleteExam);
  const emptyTrash = useStore((s) => s.emptyTrash);

  return (
    <AppShell>
      <Link
        to="/exams"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Exams
      </Link>
      <PageTitle
        title="Trash"
        subtitle="Exams deleted from here are gone for good. This only shows items from before deletion became instant."
        action={
          trash.length > 0 ? (
            <ConfirmDelete
              title="Empty Trash?"
              description={`This permanently deletes all ${trash.length} exam${trash.length === 1 ? "" : "s"} in Trash. This cannot be undone.`}
              label="Empty Trash"
              onConfirm={async () => {
                try {
                  await emptyTrash();
                  toast.success("Trash emptied");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not empty Trash");
                }
              }}
              trigger={
                <Button variant="outline" size="sm" className="rounded-full text-destructive">
                  <Trash2 className="h-4 w-4" /> Empty Trash
                </Button>
              }
            />
          ) : undefined
        }
      />

      {trash.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Trash is empty</p>
      ) : (
        <div className="space-y-3">
          {trash.map(({ exam, courseName, topicName, deletedAt }) => {
            const left = daysLeft(deletedAt);
            return (
              <Card key={exam.id} className="border-none p-4">
                <div className="mb-3 flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-foreground">{exam.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="rounded-full text-[11px]">
                        {courseName || "Unknown course"}
                      </Badge>
                      <Badge variant="outline" className="rounded-full text-[11px]">
                        {topicName || "Unknown topic"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{exam.questions.length} questions</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />{" "}
                    {left === 0 ? "Deleted today" : `${left} day${left === 1 ? "" : "s"} left`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-full"
                    onClick={async () => {
                      try {
                        await restoreExam(exam.id);
                        toast.success(`"${exam.title}" restored`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Could not restore the exam");
                      }
                    }}
                  >
                    <RotateCcw className="h-4 w-4" /> Restore
                  </Button>
                  <ConfirmDelete
                    title={`Permanently delete "${exam.title}"?`}
                    description="This cannot be undone — the exam and its questions will be gone for good."
                    label="Delete forever"
                    onConfirm={async () => {
                      try {
                        await permanentlyDeleteExam(exam.id);
                        toast.success("Exam permanently deleted");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Could not permanently delete the exam");
                      }
                    }}
                    trigger={
                      <Button variant="outline" className="flex-1 rounded-full text-destructive">
                        <Trash2 className="h-4 w-4" /> Delete forever
                      </Button>
                    }
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
