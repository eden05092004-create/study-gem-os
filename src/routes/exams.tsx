import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClipboardList, Play, Clock } from "lucide-react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/exams")({
  component: Exams,
});

function Exams() {
  const courses = useStore((s) => s.courses);
  const navigate = useNavigate();

  const all = courses.flatMap((c) =>
    c.topics.flatMap((t) =>
      t.exams.map((e) => ({ course: c, topic: t, exam: e })),
    ),
  );

  return (
    <AppShell>
      <PageTitle title="Exams" subtitle="Practice in real exam style" />
      {all.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No exams yet — create an exam inside a topic
        </p>
      )}
      <div className="space-y-3">
        {all.map(({ course, topic, exam }) => (
          <Card key={exam.id} className="border-none p-4">
            <div className="mb-3 flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-foreground">{exam.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="rounded-full text-[11px]">
                    {course.emoji} {course.name}
                  </Badge>
                  <Badge variant="outline" className="rounded-full text-[11px]">
                    {topic.name}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{exam.questions.length} questions</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {exam.durationMin} min
              </span>
            </div>
            <Button
              className="w-full rounded-full"
              onClick={() =>
                navigate({
                  to: "/exam/$courseId/$topicId/$examId",
                  params: {
                    courseId: course.id,
                    topicId: topic.id,
                    examId: exam.id,
                  },
                })
              }
            >
              <Play className="h-4 w-4" /> Start exam
            </Button>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
