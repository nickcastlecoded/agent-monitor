import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Bot, Clock, Trash2, Calendar, FileText } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Agent, Heartbeat, StatusEvent } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "Never";
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

function formatTime(dateStr: string) {
  return format(new Date(dateStr), "MMM d, h:mm a");
}

export default function AgentDetail() {
  const [, params] = useRoute("/agents/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

  const { data: agent, isLoading: agentLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", id],
    queryFn: () => apiRequest("GET", `/api/agents/${id}`).then((r) => r.json()),
    enabled: !!id,
  });

  const { data: heartbeats } = useQuery<Heartbeat[]>({
    queryKey: ["/api/agents", id, "heartbeats"],
    queryFn: () => apiRequest("GET", `/api/agents/${id}/heartbeats`).then((r) => r.json()),
    enabled: !!id,
  });

  const { data: events } = useQuery<StatusEvent[]>({
    queryKey: ["/api/agents", id, "events"],
    queryFn: () => apiRequest("GET", `/api/agents/${id}/events`).then((r) => r.json()),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/agents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Agent deleted" });
      navigate("/");
    },
  });

  if (agentLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[200px] rounded-md" />
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          <p className="text-muted-foreground text-sm">Agent not found.</p>
          <Link href="/">
            <Button variant="ghost" size="sm" className="mt-2">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-3 -ml-2" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-md bg-muted">
                <Bot className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">{agent.name}</h1>
                {agent.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{agent.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={agent.status} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="text-destructive hover:text-destructive"
                data-testid="button-delete-agent"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Info cards */}
        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="border-card-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="w-3.5 h-3.5" />
                <p className="text-xs font-medium uppercase tracking-wider">Schedule</p>
              </div>
              <p className="text-sm font-mono">{agent.schedule}</p>
            </CardContent>
          </Card>
          <Card className="border-card-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="w-3.5 h-3.5" />
                <p className="text-xs font-medium uppercase tracking-wider">Last Heartbeat</p>
              </div>
              <p className="text-sm">{timeAgo(agent.lastHeartbeat)}</p>
            </CardContent>
          </Card>
          <Card className="border-card-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileText className="w-3.5 h-3.5" />
                <p className="text-xs font-medium uppercase tracking-wider">Task</p>
              </div>
              <p className="text-sm truncate">{agent.task}</p>
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        {agent.instructions && (
          <Card className="border-card-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {agent.instructions}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Status Timeline */}
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {events && events.length > 0 ? (
              <div className="space-y-3">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 text-sm"
                    data-testid={`event-${event.id}`}
                  >
                    <span className="text-xs text-muted-foreground font-mono w-[140px] shrink-0">
                      {formatTime(event.changedAt)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={event.oldStatus} />
                      <span className="text-muted-foreground text-xs">to</span>
                      <StatusBadge status={event.newStatus} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No status changes recorded.</p>
            )}
          </CardContent>
        </Card>

        {/* Heartbeat Log */}
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Heartbeat Log</CardTitle>
          </CardHeader>
          <CardContent>
            {heartbeats && heartbeats.length > 0 ? (
              <div className="space-y-2">
                {heartbeats.map((hb) => (
                  <div
                    key={hb.id}
                    className="flex items-start gap-3 text-sm py-1.5 border-b border-border last:border-0"
                    data-testid={`heartbeat-${hb.id}`}
                  >
                    <span className="text-xs text-muted-foreground font-mono w-[140px] shrink-0 pt-0.5">
                      {formatTime(hb.timestamp)}
                    </span>
                    <StatusBadge status={hb.status} />
                    {hb.message && (
                      <span className="text-xs text-muted-foreground truncate">
                        {hb.message}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No heartbeats received yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
