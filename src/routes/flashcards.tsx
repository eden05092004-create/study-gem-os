import { createFileRoute, Link } from "@tanstack/react-router";
import { Layers, Sparkles } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/flashcards")({
  component: FlashcardsPage,
});

function FlashcardsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Practice"
        title="Flashcards"
        subtitle="Spaced-repetition cards generated from your notes."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: "Due today", value: "0" },
          { label: "Learning", value: "0" },
          { label: "Mastered", value: "0" },
        ].map((s) => (
          <div key={s.label} className="soft-shadow rounded-2xl border border-border bg-card p-5">
            <span className="eyebrow">{s.label}</span>
            <div className="mt-2 font-display text-3xl font-semibold text-foreground">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-14 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted">
          <Layers className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-display text-lg font-semibold text-foreground">
          No cards due
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Generate flashcards from a note to start reviewing.
        </p>
        <Link
          to="/notes"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <Sparkles className="h-4 w-4" /> AI generate cards
        </Link>
      </div>
    </AppShell>
  );
}
