import { useQuery } from "@tanstack/react-query";
import { Activity as ActivityIcon, Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { apiRequest } from "@/lib/queryClient";
import type { Agent, Heartbeat } from "@shared/schema";
import { format } from "date-fns";

function formatTime(dateStr: string) {
  return format(new Date(dateStr), "MMM d, h:mm a");
}

interface AgentHeartbeat extends Heartbeat {
  agentName: string;
}

export default function ActivityPage() {
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  // We'll fetch all heartbeats for all agents and merge them
  const { data: allHeartbeats, isLoading } = useQuery<AgentHeartbeat[]>({
    queryKey: ["/api/activity"],
    queryFn: async () => {
      if (!agents || agents.length === 0) return [];
      const results: AgentHeartbeat[] = [];
      for (const agent of agents) {
        const res = await apiRequest("GET", `/api/agents/${agent.id}/heartbeats`);
        const hbs: Heartbeat[] = await res.json();
        for (const hb of hbs) {
          results.push({ ...hb, agentName: agent.name });
        }
      }
      results.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      return results.slice(0, 100);
    },
    enabled: !!agents,
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Recent heartbeats across all agents
          </p>
        </div>

        <Card className="border-card-border">
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-md" />
                ))}
              </div>
            ) : allHeartbeats && allHeartbeats.length > 0 ? (
              <div className="space-y-1">
                {allHeartbeats.map((hb) => (
                  <div
                    key={hb.id}
                    className="flex items-center gap-3 py-2 px-2 rounded-md text-sm hover:bg-muted/50 transition-colors"
                    data-testid={`activity-${hb.id}`}
                  >
                    <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm min-w-[120px] truncate">
                      {hb.agentName}
                    </span>
                    <StatusBadge status={hb.status} />
                    {hb.message && (
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {hb.message}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground font-mono shrink-0">
                      {formatTime(hb.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-3 rounded-full bg-muted mb-4">
                  <ActivityIcon className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-sm mb-1">No activity yet</h3>
                <p className="text-xs text-muted-foreground max-w-[28ch]">
                  Heartbeats from your agents will appear here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
