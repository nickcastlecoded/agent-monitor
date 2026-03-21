import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bot, Activity, AlertTriangle, WifiOff, Plus, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { apiRequest } from "@/lib/queryClient";
import type { Agent } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "Never";
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<{
    total: number;
    running: number;
    idle: number;
    errored: number;
    offline: number;
  }>({
    queryKey: ["/api/stats"],
  });

  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Monitor your agents at a glance
            </p>
          </div>
          <Link href="/create">
            <Button size="sm" data-testid="button-new-agent">
              <Plus className="w-4 h-4 mr-1.5" />
              New Agent
            </Button>
          </Link>
        </div>

        {/* Stats */}
        {statsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-[88px] rounded-md" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total"
              value={stats.total}
              icon={Bot}
              color="bg-primary/10 text-primary"
            />
            <StatCard
              label="Running"
              value={stats.running}
              icon={Activity}
              color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            />
            <StatCard
              label="Errored"
              value={stats.errored}
              icon={AlertTriangle}
              color="bg-red-500/10 text-red-600 dark:text-red-400"
            />
            <StatCard
              label="Offline"
              value={stats.offline}
              icon={WifiOff}
              color="bg-gray-500/10 text-gray-500 dark:text-gray-400"
            />
          </div>
        ) : null}

        {/* Agent list */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            All Agents
          </h2>

          {agentsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-[72px] rounded-md" />
              ))}
            </div>
          ) : agents && agents.length > 0 ? (
            <div className="space-y-2">
              {agents.map((agent) => (
                <Link key={agent.id} href={`/agents/${agent.id}`}>
                  <Card
                    className="border-card-border hover-elevate cursor-pointer transition-colors"
                    data-testid={`card-agent-${agent.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-md bg-muted shrink-0">
                            <Bot className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {agent.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {agent.description || agent.task}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right hidden sm:block">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {timeAgo(agent.lastHeartbeat)}
                            </div>
                          </div>
                          <StatusBadge status={agent.status} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="border-card-border border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-3 rounded-full bg-muted mb-4">
                  <Bot className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-sm mb-1">No agents yet</h3>
                <p className="text-xs text-muted-foreground mb-4 max-w-[28ch]">
                  Create your first agent to start monitoring.
                </p>
                <Link href="/create">
                  <Button size="sm" data-testid="button-empty-create">
                    <Plus className="w-4 h-4 mr-1.5" />
                    Create Agent
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
