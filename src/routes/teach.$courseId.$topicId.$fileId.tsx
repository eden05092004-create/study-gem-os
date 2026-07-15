import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, GraduationCap, Loader2, PartyPopper, Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import {
  continueLectureTutor,
  getAiKeyStatus,
  startLectureTutor,
  type TutorSession,
} from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teach/$courseId/$topicId/$fileId")({
  component: TeachPage,
});

function TeachPage() {
  const { courseId, topicId, fileId } = Route.useParams();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const topic = course?.topics.find((t) => t.id === topicId);
  const file = topic?.files.find((f) => f.id === fileId);

  const checkStatus = useServerFn(getAiKeyStatus);
  const runStart = useServerFn(startLectureTutor);
  const runContinue = useServerFn(continueLectureTutor);

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [session, setSession] = useState<TutorSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkStatus()
      .then((r) => setHasKey(r.hasKey))
      .catch(() => setHasKey(false));
  }, [checkStatus]);

  useEffect(() => {
    if (hasKey !== true || !file?.storagePath) {
      setLoadingSession(false);
      return;
    }
    setLoadingSession(true);
    runStart({ data: { fileId } })
      .then(setSession)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not start the tutor"))
      .finally(() => setLoadingSession(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKey, fileId, file?.storagePath]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || !session || sending) return;
    setInput("");
    setSending(true);
    try {
      const updated = await runContinue({ data: { sessionId: session.id, message: text } });
      setSession(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reach the tutor");
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  if (!course || !topic || !file) {
    return (
      <AppShell>
        <p className="py-10 text-center text-sm text-muted-foreground">File not found</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/courses/$courseId/$topicId"
        params={{ courseId, topicId }}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {topic.name}
      </Link>
      <PageTitle title="Teach me" subtitle={file.name} />

      {!file.storagePath ? (
        <Card className="border-none bg-muted p-4 text-sm text-muted-foreground">
          This file has no saved content — re-upload it to use Teach Me.
        </Card>
      ) : hasKey === false ? (
        <Card className="border-none bg-muted p-4 text-sm text-muted-foreground">
          AI features require an API key.{" "}
          <Link to="/settings" className="font-semibold text-primary underline">
            Add it in Settings
          </Link>
          .
        </Card>
      ) : hasKey === null || loadingSession ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : session ? (
        <div className="flex min-h-[65vh] flex-col rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-4">
            {session.completed ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <PartyPopper className="h-4 w-4 text-primary" /> Lecture complete
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold text-foreground">
                  <span>
                    Section {Math.min(session.currentSection + 1, session.sections.length)} of{" "}
                    {session.sections.length}
                  </span>
                  {session.sections[session.currentSection] && (
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {session.sections[session.currentSection].title}
                    </span>
                  )}
                </div>
                <Progress
                  value={
                    session.sections.length
                      ? (session.currentSection / session.sections.length) * 100
                      : 0
                  }
                  className="h-2"
                />
              </>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {session.messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={cn(
                    "whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    m.role === "user"
                      ? "max-w-[80%] bg-primary text-primary-foreground"
                      : "w-full max-w-[95%] bg-muted text-foreground sm:max-w-[90%]",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {session.completed && session.recap && session.recap.length > 0 && (
              <Card className="soft-shadow border-none bg-success/10 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
                  <GraduationCap className="h-4 w-4 text-success" /> What to remember
                </p>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground">
                  {session.recap.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          {!session.completed && (
            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  disabled={sending}
                  placeholder="Answer, or ask 'explain again' / 'why?' / 'another example'…"
                  className="max-h-32 flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/30 disabled:opacity-60"
                />
                <button
                  onClick={send}
                  disabled={sending || !input.trim()}
                  aria-label="Send"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </AppShell>
  );
}
