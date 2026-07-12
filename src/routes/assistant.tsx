import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Send, Plus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/assistant")({
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; text: string };

function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [
      ...m,
      { role: "user", text },
      {
        role: "assistant",
        text: "The AI Assistant needs an API key. Add one in Settings to start chatting about your materials.",
      },
    ]);
    setInput("");
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Practice"
        title="AI Assistant"
        subtitle="Ask anything about your courses, notes and materials."
        action={
          <button
            onClick={() => setMessages([])}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> New chat
          </button>
        }
      />

      <div className="flex min-h-[55vh] flex-col rounded-2xl border border-border bg-card">
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {messages.length === 0 ? (
            <div className="grid h-full place-items-center py-16 text-center">
              <div>
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent/15">
                  <Sparkles className="h-6 w-6 text-accent" />
                </div>
                <p className="font-display text-lg font-semibold text-foreground">
                  Start a conversation
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Set up your API key in{" "}
                  <Link to="/settings" className="text-accent underline">
                    Settings
                  </Link>{" "}
                  to unlock the assistant.
                </p>
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))
          )}
        </div>

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
              placeholder="Ask StudyOS…"
              className="max-h-32 flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/30"
            />
            <button
              onClick={send}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
