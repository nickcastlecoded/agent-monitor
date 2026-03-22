import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  FolderOpen,
  Bot,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronRight,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

interface WorkItem {
  id: number;
  agentId: number;
  agentName: string;
  title: string;
  description: string | null;
  status: string;
  result: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

const workStatusConfig: Record<
  string,
  { label: string; icon: typeof CheckCircle2; className: string; dotClass: string }
> = {
  in_progress: {
    label: "In Progress",
    icon: Loader2,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    dotClass: "bg-blue-500",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    dotClass: "bg-emerald-500",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    dotClass: "bg-red-500",
  },
};

function WorkStatusBadge({ status }: { status: string }) {
  const config = workStatusConfig[status] || workStatusConfig.in_progress;
  return (
    <Badge
      variant="outline"
      className={cn("font-mono text-xs gap-1.5 px-2 py-0.5", config.className)}
      data-testid={`work-status-${status}`}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dotClass)} />
      {config.label}
    </Badge>
  );
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "—";
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

function formatDate(dateStr: string) {
  return format(new Date(dateStr), "MMM d, h:mm a");
}

function WorkItemCard({ item }: { item: WorkItem }) {
  const isActive = item.status === "in_progress";

  return (
    <Card
      className={cn(
        "border-card-border transition-colors",
        isActive && "border-blue-500/30 bg-blue-500/[0.02]"
      )}
      data-testid={`work-item-${item.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={cn(
                "p-2 rounded-md shrink-0 mt-0.5",
                isActive ? "bg-blue-500/10" : "bg-muted"
              )}
            >
              {isActive ? (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{item.title}</p>
                <WorkStatusBadge status={item.status} />
              </div>
              {item.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {item.description}
                </p>
              )}
              {item.result && item.status === "completed" && (
                <div className="mt-2 p-2 rounded-md bg-muted/50 border border-border/50">
                  <p className="text-xs text-muted-foreground font-mono line-clamp-3">
                    {item.result}
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3 mt-2">
                <Link
                  href={`/agents/${item.agentId}`}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`work-item-agent-link-${item.id}`}
                >
                  <Bot className="w-3 h-3" />
                  <span>{item.agentName}</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
                <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {isActive ? `Started ${timeAgo(item.startedAt)}` : timeAgo(item.completedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Group work items by agent
function groupByAgent(items: WorkItem[]): Map<string, WorkItem[]> {
  const map = new Map<string, WorkItem[]>();
  for (const item of items) {
    const key = `${item.agentId}:${item.agentName}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

export default function WorkspacePage() {
  const { data: workItems, isLoading } = useQuery<WorkItem[]>({
    queryKey: ["/api/workspace"],
  });

  const activeItems = workItems?.filter((w) => w.status === "in_progress") || [];
  const completedItems = workItems?.filter((w) => w.status === "completed") || [];
  const failedItems = workItems?.filter((w) => w.status === "failed") || [];
  const agentGroups = workItems ? groupByAgent(workItems) : new Map();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Workspace</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor what your agents are working on and review completed work
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-card-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Active
                  </p>
                  <p className="text-2xl font-semibold mt-1 tabular-nums" data-testid="text-active-count">
                    {isLoading ? "—" : activeItems.length}
                  </p>
                </div>
                <div className="p-2 rounded-md bg-blue-500/10">
                  <Loader2 className={cn("w-4 h-4 text-blue-500", activeItems.length > 0 && "animate-spin")} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-card-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Completed
                  </p>
                  <p className="text-2xl font-semibold mt-1 tabular-nums" data-testid="text-completed-count">
                    {isLoading ? "—" : completedItems.length}
                  </p>
                </div>
                <div className="p-2 rounded-md bg-emerald-500/10">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-card-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Failed
                  </p>
                  <p className="text-2xl font-semibold mt-1 tabular-nums" data-testid="text-failed-count">
                    {isLoading ? "—" : failedItems.length}
                  </p>
                </div>
                <div className="p-2 rounded-md bg-red-500/10">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList data-testid="workspace-tabs">
            <TabsTrigger value="all" data-testid="tab-all">
              All
              {workItems && (
                <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                  {workItems.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-active">
              Active
              {activeItems.length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                  {activeItems.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">
              Completed
            </TabsTrigger>
            <TabsTrigger value="by-agent" data-testid="tab-by-agent">
              By Agent
            </TabsTrigger>
          </TabsList>

          {/* All items */}
          <TabsContent value="all" className="space-y-2">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-[80px] rounded-md" />
                ))}
              </div>
            ) : workItems && workItems.length > 0 ? (
              workItems.map((item) => <WorkItemCard key={item.id} item={item} />)
            ) : (
              <EmptyState />
            )}
          </TabsContent>

          {/* Active items */}
          <TabsContent value="active" className="space-y-2">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <Skeleton key={i} className="h-[80px] rounded-md" />
                ))}
              </div>
            ) : activeItems.length > 0 ? (
              activeItems.map((item) => <WorkItemCard key={item.id} item={item} />)
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-3 rounded-full bg-muted mb-4">
                  <CheckCircle2 className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-sm mb-1">No active work</h3>
                <p className="text-xs text-muted-foreground max-w-[28ch]">
                  All agents are idle. Active tasks will appear here when agents start working.
                </p>
              </div>
            )}
          </TabsContent>

          {/* Completed items */}
          <TabsContent value="completed" className="space-y-2">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-[80px] rounded-md" />
                ))}
              </div>
            ) : completedItems.length > 0 ? (
              completedItems.map((item) => <WorkItemCard key={item.id} item={item} />)
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-3 rounded-full bg-muted mb-4">
                  <FolderOpen className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-sm mb-1">No completed work yet</h3>
                <p className="text-xs text-muted-foreground max-w-[28ch]">
                  Finished tasks from your agents will show up here.
                </p>
              </div>
            )}
          </TabsContent>

          {/* By Agent */}
          <TabsContent value="by-agent" className="space-y-6">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <Skeleton key={i} className="h-[120px] rounded-md" />
                ))}
              </div>
            ) : agentGroups.size > 0 ? (
              Array.from(agentGroups.entries()).map(([key, items]) => {
                const [agentId, agentName] = key.split(":");
                const agentActive = items.filter((i) => i.status === "in_progress");
                const agentCompleted = items.filter((i) => i.status === "completed");

                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/agents/${agentId}`}
                        className="flex items-center gap-2 hover:text-foreground transition-colors group"
                        data-testid={`agent-group-${agentId}`}
                      >
                        <div className="p-1.5 rounded-md bg-muted">
                          <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="font-medium text-sm">{agentName}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {agentActive.length > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            {agentActive.length} active
                          </span>
                        )}
                        <span>
                          {agentCompleted.length} completed
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2 pl-1">
                      {items.map((item) => (
                        <WorkItemCard key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-card-border border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-3 rounded-full bg-muted mb-4">
          <FolderOpen className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-sm mb-1">Workspace is empty</h3>
        <p className="text-xs text-muted-foreground max-w-[32ch]">
          When your agents begin working, their tasks and outputs will appear here.
        </p>
      </CardContent>
    </Card>
  );
}
