import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, XCircle, CheckCircle2, Trash2 } from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExamRunner } from "@/components/ExamRunner";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { useStore } from "@/lib/store";
import type { Question } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/mistakes")({
  component: Mistakes,
});


function Mistakes() {
  const mistakes = useStore((s) => s.mistakes);
  const clearMistakes = useStore((s) => s.clearMistakes);
  const deleteMistake = useStore((s) => s.deleteMistake);
  const [retry, setRetry] = useState(false);


  const grouped = useMemo(() => {
    const map = new Map<string, typeof mistakes>();
    for (const m of mistakes) {
      const arr = map.get(m.courseName) ?? [];
      arr.push(m);
      map.set(m.courseName, arr);
    }
    return [...map.entries()];
  }, [mistakes]);

  // one entry per unique question for retry practice
  const retryQuestions = useMemo(() => {
    const map = new Map<string, Question>();
    for (const m of mistakes) map.set(m.question.id, m.question);
    return [...map.values()];
  }, [mistakes]);

  if (retry) {
    return (
      <AppShell>
        <h1 className="mb-4 text-xl font-extrabold text-foreground">Practice mistakes</h1>
        <ExamRunner title="Practice mistakes" questions={retryQuestions} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageTitle title="Mistake notebook" subtitle="Every blank you got wrong, in one place" />

      {mistakes.length === 0 ? (
        <Card className="border-none p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
          <p className="font-semibold text-foreground">No mistakes yet 🎉</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Take an exam — wrong answers will show up here for focused review.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-5 flex gap-2">
            <Button className="flex-1 rounded-full" onClick={() => setRetry(true)}>
              <RotateCcw className="h-4 w-4" /> Retry mistakes only ({retryQuestions.length})
            </Button>
            <ConfirmDelete
              title="Clear all mistakes?"
              description="This permanently removes every mistake from your notebook."
              label="Clear all"
              onConfirm={() => {
                clearMistakes();
                toast.success("Mistakes cleared");
              }}
              trigger={
                <Button variant="outline" className="rounded-full">
                  <Trash2 className="h-4 w-4" /> Clear all
                </Button>
              }
            />
          </div>


          <div className="space-y-5">
            {grouped.map(([courseName, items]) => (
              <div key={courseName}>
                <h2 className="mb-2 text-sm font-bold text-muted-foreground">
                  {courseName} · {items.length} mistakes
                </h2>
                <div className="space-y-3">
                  {items.map((m) => (
                    <Card key={m.id} className="border-none p-4">
                      <div className="mb-2 flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {m.questionText}
                          </p>
                          {m.blankLabel && (
                            <p className="text-xs text-muted-foreground">{m.blankLabel}</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1.5 pl-6 text-xs">
                        <div className="flex items-center gap-1.5 text-destructive">
                          <XCircle className="h-3.5 w-3.5 shrink-0" />
                          Your answer: {m.chosenValue || "— (blank)"}
                        </div>
                        <div className="flex items-center gap-1.5 text-success">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          Correct: {m.correctValue}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
