import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Bot, Clock, Trash2, Calendar, FileText, Settings, FolderOpen, FileInput, Brain, Crosshair, ExternalLink, Play, Loader2 } from "lucide-react";
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

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/agents/${id}/run`).then((r) => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", id, "heartbeats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", id] });
      toast({ title: "Agent ran successfully", description: data?.response?.slice(0, 100) + (data?.response?.length > 100 ? "..." : "") });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to run agent", description: err.message, variant: "destructive" });
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
                variant="outline"
                size="sm"
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
                data-testid="button-run-agent"
              >
                {runMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-1.5" />
                )}
                {runMutation.isPending ? "Running..." : "Run Agent"}
              </Button>
              <Link href={`/agents/${id}/edit`}>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-edit-agent"
                >
                  <Settings className="w-4 h-4 mr-1.5" />
                  Configure
                </Button>
              </Link>
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

        {/* Configuration Summary */}
        {((agent as any).scope || (agent as any).outputDriveFolder || (agent as any).inputDriveFiles || (agent as any).memoryDriveFolder || (agent as any).frequency) && (
          <Card className="border-card-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Configuration</CardTitle>
                <Link href={`/agents/${id}/edit`}>
                  <Button variant="ghost" size="sm" className="text-xs h-7" data-testid="button-edit-config">
                    <Settings className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(agent as any).scope && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Crosshair className="w-3 h-3" />
                    <span className="font-medium uppercase tracking-wider">Scope</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap pl-5">
                    {(agent as any).scope}
                  </p>
                </div>
              )}
              {(agent as any).frequency && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span className="font-medium uppercase tracking-wider">Custom Frequency</span>
                  </div>
                  <p className="text-xs font-mono pl-5">{(agent as any).frequency}</p>
                </div>
              )}
              {(agent as any).outputDriveFolder && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FolderOpen className="w-3 h-3" />
                    <span className="font-medium uppercase tracking-wider">Output Folder</span>
                  </div>
                  <a
                    href={(agent as any).outputDriveFolder}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono pl-5 text-blue-500 hover:underline flex items-center gap-1"
                  >
                    {(agent as any).outputDriveFolder}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {(agent as any).inputDriveFiles && (agent as any).inputDriveFiles !== '[]' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileInput className="w-3 h-3" />
                    <span className="font-medium uppercase tracking-wider">Input Files</span>
                  </div>
                  <div className="pl-5 space-y-1">
                    {(() => {
                      try {
                        const files = JSON.parse((agent as any).inputDriveFiles);
                        return files.map((f: {name: string; url: string}, i: number) => (
                          <a
                            key={i}
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-blue-500 hover:underline flex items-center gap-1"
                          >
                            {f.url}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ));
                      } catch {
                        return <p className="text-xs font-mono">{(agent as any).inputDriveFiles}</p>;
                      }
                    })()}
                  </div>
                </div>
              )}
              {(agent as any).memoryDriveFolder && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Brain className="w-3 h-3" />
                    <span className="font-medium uppercase tracking-wider">Memory Folder</span>
                  </div>
                  <a
                    href={(agent as any).memoryDriveFolder}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono pl-5 text-blue-500 hover:underline flex items-center gap-1"
                  >
                    {(agent as any).memoryDriveFolder}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
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
