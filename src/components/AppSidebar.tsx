import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutGrid,
  BookOpen,
  CalendarRange,
  CalendarDays,
  FolderOpen,
  StickyNote,
  Sparkles,
  HelpCircle,
  ClipboardCheck,
  FileUp,
  Layers,
  AlertOctagon,
  BarChart3,
  Settings,
  LogOut,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean };
type NavGroup = { label?: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { to: "/", label: "Dashboard", icon: LayoutGrid, exact: true },
      { to: "/courses", label: "Courses", icon: BookOpen },
      { to: "/planner", label: "Study Planner", icon: CalendarRange },
      { to: "/smart-scheduler", label: "Smart Scheduler", icon: Wand2 },
      { to: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/materials", label: "Materials", icon: FolderOpen },
      { to: "/notes", label: "Notes", icon: StickyNote },
    ],
  },
  {
    label: "Practice",
    items: [
      { to: "/assistant", label: "AI Assistant", icon: Sparkles },
      { to: "/generator", label: "Question Generator", icon: HelpCircle },
      { to: "/quiz", label: "Quiz & Exam", icon: ClipboardCheck },
      { to: "/upload-exam", label: "Upload Old Exam", icon: FileUp },
      { to: "/flashcards", label: "Flashcards", icon: Layers },
      { to: "/mistakes", label: "Mistake Notebook", icon: AlertOctagon },
    ],
  },
  {
    label: "You",
    items: [
      { to: "/progress", label: "Progress", icon: BarChart3 },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-3 py-1">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Sparkles className="h-4 w-4" />
      </span>
      <span className="font-display text-xl font-semibold tracking-tight text-foreground">
        StudyOS
      </span>
    </Link>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const userName = useStore((s) => s.userName);
  const userEmail = useStore((s) => s.userEmail);

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="px-3 pb-2 pt-5">
        <Brand />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="eyebrow px-3 pb-1.5">{group.label}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/20 text-sm font-semibold text-accent">
            {(userName || "S").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {userName || "Student"}
            </div>
            {userEmail && (
              <div className="truncate text-xs text-muted-foreground">{userEmail}</div>
            )}
          </div>
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
