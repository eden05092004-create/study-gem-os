import { Link } from "@tanstack/react-router";
import { Home, FolderClosed, Upload, CalendarRange, ClipboardList, AlertTriangle } from "lucide-react";

const items = [
  { to: "/", label: "בית", icon: Home },
  { to: "/courses", label: "קורסים", icon: FolderClosed },
  { to: "/upload", label: "העלאה", icon: Upload },
  { to: "/planner", label: "תכנון", icon: CalendarRange },
  { to: "/exams", label: "מבחנים", icon: ClipboardList },
  { to: "/mistakes", label: "טעויות", icon: AlertTriangle },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 py-1.5">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="group flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-muted-foreground transition-colors data-[status=active]:text-primary"
          >
            <Icon className="h-5 w-5" />
            <span className="text-[11px] font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
