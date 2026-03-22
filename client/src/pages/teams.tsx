import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { UsersRound, Bot, Plus, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface TeamWithCount {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  agentCount: number;
}

interface TeamDetail extends TeamWithCount {
  agents: Array<{
    id: number;
    name: string;
    status: string;
    title: string | null;
    agentType: string | null;
  }>;
}

const agentTypeColors: Record<string, string> = {
  master: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  manager: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  worker: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
};

export default function TeamsPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<TeamWithCount | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const { data: teams, isLoading } = useQuery<TeamWithCount[]>({
    queryKey: ["/api/teams"],
  });

  const { data: teamDetail } = useQuery<TeamDetail>({
    queryKey: ["/api/teams", expandedId],
    queryFn: () => apiRequest("GET", `/api/teams/${expandedId}`).then((r) => r.json()),
    enabled: !!expandedId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      apiRequest("POST", "/api/teams", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      toast({ title: "Team created" });
    },
    onError: () => toast({ title: "Failed to create team", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: number; name: string; description: string }) =>
      apiRequest("PATCH", `/api/teams/${data.id}`, { name: data.name, description: data.description }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      if (expandedId) queryClient.invalidateQueries({ queryKey: ["/api/teams", expandedId] });
      setEditTeam(null);
      toast({ title: "Team updated" });
    },
    onError: () => toast({ title: "Failed to update team", variant: "destructive" }),
  });

  function openEdit(team: TeamWithCount, e: React.MouseEvent) {
    e.stopPropagation();
    setEditName(team.name);
    setEditDesc(team.description || "");
    setEditTeam(team);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Teams</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Organizational groups and their assigned agents
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-team">
            <Plus className="w-4 h-4 mr-1.5" />
            New Team
          </Button>
        </div>

        {/* Team grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-[140px] rounded-md" />
            ))}
          </div>
        ) : teams && teams.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {teams.map((team) => {
              const isExpanded = expandedId === team.id;
              const detail = isExpanded ? teamDetail : null;

              return (
                <Card
                  key={team.id}
                  className={`border-card-border transition-all cursor-pointer ${
                    isExpanded ? "col-span-1 md:col-span-2 lg:col-span-3 border-muted-foreground/20" : "hover-elevate"
                  }`}
                  data-testid={`card-team-${team.id}`}
                  onClick={() => setExpandedId(isExpanded ? null : team.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="p-2 rounded-md bg-muted shrink-0">
                          <UsersRound className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{team.name}</p>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                              {team.agentCount}
                            </Badge>
                          </div>
                          {team.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {team.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={(e) => openEdit(team, e)}
                        data-testid={`button-edit-team-${team.id}`}
                      >
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </div>

                    {/* Expanded view with agents */}
                    {isExpanded && detail && detail.agents && (
                      <div className="mt-4 pt-3 border-t border-border space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Members ({detail.agents.length})
                        </p>
                        {detail.agents.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {detail.agents.map((agent) => (
                              <Link
                                key={agent.id}
                                href={`/agents/${agent.id}`}
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                              >
                                <div
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted/50 text-xs hover:bg-muted transition-colors cursor-pointer"
                                  data-testid={`agent-pill-${agent.id}`}
                                >
                                  <Bot className="w-3 h-3 text-muted-foreground" />
                                  <span className="font-medium">{agent.name}</span>
                                  {agent.title && (
                                    <span className="text-muted-foreground">· {agent.title}</span>
                                  )}
                                  {agent.agentType && agent.agentType !== "worker" && (
                                    <Badge
                                      variant="outline"
                                      className={`text-[9px] px-1 py-0 ${agentTypeColors[agent.agentType] || ""}`}
                                    >
                                      {agent.agentType}
                                    </Badge>
                                  )}
                                </div>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No agents assigned to this team</p>
                        )}
                      </div>
                    )}

                    {isExpanded && !detail && (
                      <div className="mt-4 pt-3 border-t border-border">
                        <Skeleton className="h-8 w-full" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-card-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-3 rounded-full bg-muted mb-4">
                <UsersRound className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-sm mb-1">No teams yet</h3>
              <p className="text-xs text-muted-foreground mb-4 max-w-[28ch]">
                Create teams to organize your agents.
              </p>
              <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-empty-create-team">
                <Plus className="w-4 h-4 mr-1.5" />
                Create Team
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">New Team</DialogTitle>
            <DialogDescription className="text-xs">
              Create a new team to group agents together
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Research"
                data-testid="input-team-name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What does this team do?"
                className="resize-none min-h-[60px] text-xs"
                data-testid="input-team-description"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newName.trim(), description: newDesc.trim() })}
              data-testid="button-submit-team"
            >
              {createMutation.isPending ? "Creating..." : "Create Team"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTeam} onOpenChange={(open) => !open && setEditTeam(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Team</DialogTitle>
            <DialogDescription className="text-xs">
              Update team details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                data-testid="input-edit-team-name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="resize-none min-h-[60px] text-xs"
                data-testid="input-edit-team-description"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              disabled={!editName.trim() || editMutation.isPending}
              onClick={() => editTeam && editMutation.mutate({ id: editTeam.id, name: editName.trim(), description: editDesc.trim() })}
              data-testid="button-save-team"
            >
              {editMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
