import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Bot, Clock, Trash2, Calendar, FileText, Settings, FolderOpen, FileInput, Brain, Crosshair, ExternalLink, Play, Loader2, Send, MessageSquare, ChevronDown, ChevronRight, ArrowRightLeft } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

interface AgentMessage {
  id: number;
  fromAgentId: number | null;
  toAgentId: number;
  prompt: string;
  response: string | null;
  status: string;
  parentMessageId: number | null;
  metadata: string | null;
  createdAt: string;
  completedAt: string | null;
}

export default function AgentDetail() {
  const [, params] = useRoute("/agents/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id;
  const [promptText, setPromptText] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const promptResponseRef = useRef<HTMLDivElement>(null);

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
      queryClient.invalidateQueries({ queryKey: ["/api/agents", id, "messages"] });
      toast({ title: "Agent ran successfully", description: data?.response?.slice(0, 100) + (data?.response?.length > 100 ? "..." : "") });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to run agent", description: err.message, variant: "destructive" });
    },
  });

  const promptMutation = useMutation({
    mutationFn: (prompt: string) => apiRequest("POST", `/api/agents/${id}/prompt`, { prompt }).then((r) => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", id, "heartbeats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", id, "messages"] });
      setPromptText("");
      toast({
        title: "Agent executed prompt",
        description: data?.actionsTaken?.length > 0
          ? `${data.actionsTaken.length} action(s) taken`
          : "Response received",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to prompt agent", description: err.message, variant: "destructive" });
    },
  });

  const { data: agentMessages } = useQuery<AgentMessage[]>({
    queryKey: ["/api/agents", id, "messages"],
    queryFn: () => apiRequest("GET", `/api/agents/${id}/messages`).then((r) => r.json()),
    enabled: !!id,
  });

  const { data: allAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    queryFn: () => apiRequest("GET", "/api/agents").then((r) => r.json()),
  });

  const agentNameMap = (allAgents || []).reduce((acc, a) => {
    acc[a.id] = a.name;
    return acc;
  }, {} as Record<number, string>);

  const handlePromptSubmit = () => {
    if (!promptText.trim()) return;
    promptMutation.mutate(promptText.trim());
  };

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

        {/* Prompt Agent */}
        <Card className="border-card-border">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setPromptOpen(!promptOpen)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Prompt Agent</CardTitle>
              </div>
              {promptOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          </CardHeader>
          {promptOpen && (
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Send a directive to {agent.name}. The agent will execute autonomously and can delegate to other agents.
              </p>
              <div className="flex gap-2">
                <Textarea
                  placeholder={`e.g. "Draft a content calendar for Q1" or "Research competitor pricing and report back"`}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  className="min-h-[80px] text-sm font-mono resize-none"
                  data-testid="input-agent-prompt"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handlePromptSubmit();
                    }
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {promptMutation.isPending ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {agent.name} is executing...
                    </span>
                  ) : (
                    "Cmd+Enter to send"
                  )}
                </span>
                <Button
                  size="sm"
                  onClick={handlePromptSubmit}
                  disabled={!promptText.trim() || promptMutation.isPending}
                  data-testid="button-send-prompt"
                >
                  {promptMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-1.5" />
                  )}
                  {promptMutation.isPending ? "Executing..." : "Send Prompt"}
                </Button>
              </div>

              {/* Latest prompt response */}
              {promptMutation.data && (
                <div ref={promptResponseRef} className="mt-3 border border-border rounded-md p-3 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{agent.name} responded</span>
                    {promptMutation.data.actionsTaken?.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {promptMutation.data.actionsTaken.length} action(s)
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                    {promptMutation.data.response}
                  </p>
                  {promptMutation.data.actionsTaken?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Actions Taken</p>
                      {promptMutation.data.actionsTaken.map((action: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground font-mono">• {action}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Communication History */}
        <Card className="border-card-border">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setHistoryOpen(!historyOpen)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Communication History</CardTitle>
                {agentMessages && agentMessages.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {agentMessages.length}
                  </Badge>
                )}
              </div>
              {historyOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          </CardHeader>
          {historyOpen && (
            <CardContent>
              {agentMessages && agentMessages.length > 0 ? (
                <div className="space-y-3">
                  {agentMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="border border-border rounded-md p-3 space-y-2"
                      data-testid={`message-${msg.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">
                            {msg.fromAgentId
                              ? `${agentNameMap[msg.fromAgentId] || `Agent #${msg.fromAgentId}`} → ${agentNameMap[msg.toAgentId] || `Agent #${msg.toAgentId}`}`
                              : `Board → ${agentNameMap[msg.toAgentId] || `Agent #${msg.toAgentId}`}`}
                          </span>
                          <Badge
                            variant={msg.status === "completed" ? "secondary" : msg.status === "running" ? "default" : "destructive"}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {msg.status}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>
                      <div className="pl-2 border-l-2 border-muted">
                        <p className="text-xs text-muted-foreground font-mono">
                          <span className="font-medium text-foreground">Prompt:</span> {msg.prompt.slice(0, 200)}{msg.prompt.length > 200 ? "..." : ""}
                        </p>
                        {msg.response && (
                          <p className="text-xs text-muted-foreground font-mono mt-1">
                            <span className="font-medium text-foreground">Response:</span> {msg.response.slice(0, 300)}{msg.response.length > 300 ? "..." : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No communication history yet.</p>
              )}
            </CardContent>
          )}
        </Card>

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
