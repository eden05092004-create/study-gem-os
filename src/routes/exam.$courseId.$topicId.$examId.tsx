import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ExamRunner } from "@/components/ExamRunner";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/exam/$courseId/$topicId/$examId")({
  component: ExamPage,
});

function ExamPage() {
  const { courseId, topicId, examId } = Route.useParams();
  const recordExamResult = useStore((s) => s.recordExamResult);
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const exam = topic?.exams.find((e) => e.id === examId);

  if (!exam) {
    return (
      <AppShell>
        <p className="py-10 text-center text-sm text-muted-foreground">המבחן לא נמצא</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/exams"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronRight className="h-4 w-4" /> מבחנים
      </Link>
      <h1 className="mb-4 text-xl font-extrabold text-foreground">{exam.title}</h1>
      <ExamRunner
        title={exam.title}
        questions={exam.questions}
        onFinish={(answers) => recordExamResult(courseId, topicId, examId, answers)}
      />
    </AppShell>
  );
}
