import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Menu, Search, Plus } from "lucide-react";
import { SidebarNav } from "./AppSidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";

export function AppShell({
  children,
  header,
}: {
  children: ReactNode;
  header?: ReactNode;
}) {
  const navigate = useNavigate();
  const init = useStore((s) => s.init);
  const reset = useStore((s) => s.reset);
  const initialized = useStore((s) => s.initialized);
  const loading = useStore((s) => s.loading);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        navigate({ to: "/auth" });
      } else if (!useStore.getState().initialized && !useStore.getState().loading) {
        init();
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT" || !session) {
        reset();
        navigate({ to: "/auth" });
      } else if (event === "SIGNED_IN") {
        if (!useStore.getState().initialized && !useStore.getState().loading) {
          init();
        }
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [init, reset, navigate]);

  if (!initialized || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border md:block">
        <SidebarNav />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="md:pl-64">
        <TopBar onMenu={() => setDrawerOpen(true)} />
        <main className="mx-auto max-w-5xl px-5 py-8 md:px-10">
          {header}
          {children}
        </main>
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-5 py-3 backdrop-blur md:px-10">
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <button
        onClick={() => navigate({ to: "/assistant" })}
        className="flex flex-1 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/20 md:max-w-xs"
      >
        <Search className="h-4 w-4" />
        <span>Ask StudyOS…</span>
      </button>

      <div className="flex-1" />

      <button
        onClick={() => navigate({ to: "/materials" })}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> New
      </button>
    </header>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

/** Back-compat alias used by older pages. */
export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return <PageHeader title={title} subtitle={subtitle} action={action} />;
}
