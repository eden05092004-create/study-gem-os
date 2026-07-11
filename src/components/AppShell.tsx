import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({
  children,
  header,
}: {
  children: ReactNode;
  header?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg px-4 pt-6">
        {header}
        {children}
      </div>
      <BottomNav />
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
