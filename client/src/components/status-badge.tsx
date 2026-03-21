import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  running: {
    label: "Running",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  idle: {
    label: "Idle",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
  },
  error: {
    label: "Error",
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    dot: "bg-red-500",
  },
  offline: {
    label: "Offline",
    className: "bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20",
    dot: "bg-gray-500",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.offline;
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-xs gap-1.5 px-2 py-0.5",
        config.className
      )}
      data-testid={`status-badge-${status}`}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {config.label}
    </Badge>
  );
}
