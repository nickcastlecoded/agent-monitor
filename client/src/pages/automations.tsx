import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Zap,
  Plus,
  Power,
  Calendar,
  Clock,
  Bot,
  FolderInput,
  FolderOutput,
  UsersRound,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Workflow,
  CircleDot,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AutomationAgent {
  id: number;
  name: string;
  title: string | null;
  agentType: string | null;
  role: string | null;
  linkId: number;
}

interface Automation {
  id: number;
  name: string;
  description: string | null;
  category: string;
  status: string;
  schedule: string | null;
  teamId: number | null;
  teamName: string | null;
  process: string | null;
  inputLocation: string | null;
  outputLocation: string | null;
  enabled: boolean;
  startedAt: string;
  createdAt: string;
  updatedAt: string;
  agents: AutomationAgent[];
}

interface TeamOption {
  id: number;
  name: string;
}

interface AgentOption {
  id: number;
  name: string;
  title: string | null;
}

const categories = [
  { value: "data-pipeline", label: "Data Pipeline" },
  { value: "reporting", label: "Reporting" },
  { value: "monitoring", label: "Monitoring" },
  { value: "communication", label: "Communication" },
  { value: "content", label: "Content" },
  { value: "research", label: "Research" },
  { value: "operations", label: "Operations" },
  { value: "general", label: "General" },
];

const categoryColors: Record<string, string> = {
  "data-pipeline": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  reporting: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  monitoring: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  communication: "bg-green-500/10 text-green-400 border-green-500/20",
  content: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  research: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  operations: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  general: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
};

const statusConfig: Record<string, { color: string; dot: string }> = {
  active: { color: "text-emerald-400", dot: "bg-emerald-400" },
  paused: { color: "text-neutral-400", dot: "bg-neutral-400" },
  error: { color: "text-red-400", dot: "bg-red-400" },
  completed: { color: "text-blue-400", dot: "bg-blue-400" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AutomationsPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editAutomation, setEditAutomation] = useState<Automation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCategory, setFormCategory] = useState("general");
  const [formSchedule, setFormSchedule] = useState("");
  const [formTeamId, setFormTeamId] = useState<string>("");
  const [formProcess, setFormProcess] = useState("");
  const [formInput, setFormInput] = useState("");
  const [formOutput, setFormOutput] = useState("");
  const [formAgentIds, setFormAgentIds] = useState<number[]>([]);

  const { data: automations, isLoading } = useQuery<Automation[]>({
    queryKey: ["/api/automations"],
  });

  const { data: teams } = useQuery<TeamOption[]>({
    queryKey: ["/api/teams"],
    select: (data: any[]) => data.map((t) => ({ id: t.id, name: t.name })),
  });

  const { data: agents } = useQuery<AgentOption[]>({
    queryKey: ["/api/agents"],
    select: (data: any[]) =>
      data.map((a) => ({ id: a.id, name: a.name, title: a.title })),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/automations", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      resetForm();
      setCreateOpen(false);
      toast({ title: "Automation created" });
    },
    onError: () =>
      toast({ title: "Failed to create automation", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("PATCH", `/api/automations/${data.id}`, data).then((r) =>
        r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      setEditAutomation(null);
      toast({ title: "Automation updated" });
    },
    onError: () =>
      toast({ title: "Failed to update automation", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/automations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      setDeleteTarget(null);
      if (expandedId === deleteTarget?.id) setExpandedId(null);
      toast({ title: "Automation deleted" });
    },
    onError: () =>
      toast({ title: "Failed to delete automation", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/automations/${id}/toggle`).then((r) =>
        r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
    },
    onError: () =>
      toast({
        title: "Failed to toggle automation",
        variant: "destructive",
      }),
  });

  function resetForm() {
    setFormName("");
    setFormDesc("");
    setFormCategory("general");
    setFormSchedule("");
    setFormTeamId("");
    setFormProcess("");
    setFormInput("");
    setFormOutput("");
    setFormAgentIds([]);
  }

  function openEdit(auto: Automation, e: React.MouseEvent) {
    e.stopPropagation();
    setFormName(auto.name);
    setFormDesc(auto.description || "");
    setFormCategory(auto.category);
    setFormSchedule(auto.schedule || "");
    setFormTeamId(auto.teamId ? String(auto.teamId) : "");
    setFormProcess(auto.process || "");
    setFormInput(auto.inputLocation || "");
    setFormOutput(auto.outputLocation || "");
    setFormAgentIds(auto.agents.map((a) => a.id));
    setEditAutomation(auto);
  }

  function handleCreate() {
    createMutation.mutate({
      name: formName.trim(),
      description: formDesc.trim() || null,
      category: formCategory,
      schedule: formSchedule.trim() || null,
      teamId: formTeamId ? Number(formTeamId) : null,
      process: formProcess.trim() || null,
      inputLocation: formInput.trim() || null,
      outputLocation: formOutput.trim() || null,
      agentIds: formAgentIds,
    });
  }

  function handleEdit() {
    if (!editAutomation) return;
    editMutation.mutate({
      id: editAutomation.id,
      name: formName.trim(),
      description: formDesc.trim() || null,
      category: formCategory,
      schedule: formSchedule.trim() || null,
      teamId: formTeamId ? Number(formTeamId) : null,
      process: formProcess.trim() || null,
      inputLocation: formInput.trim() || null,
      outputLocation: formOutput.trim() || null,
    });
  }

  // Group automations by category
  const filteredAutomations =
    automations?.filter(
      (a) => filterCategory === "all" || a.category === filterCategory
    ) || [];

  const grouped: Record<string, Automation[]> = {};
  for (const auto of filteredAutomations) {
    const cat = auto.category || "general";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(auto);
  }

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const aLabel =
      categories.find((c) => c.value === a)?.label || a;
    const bLabel =
      categories.find((c) => c.value === b)?.label || b;
    return aLabel.localeCompare(bLabel);
  });

  const activeCount = automations?.filter((a) => a.enabled).length || 0;
  const pausedCount = automations?.filter((a) => !a.enabled).length || 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Automations
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Ongoing processes, schedules, and workflows
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={filterCategory}
              onValueChange={setFilterCategory}
            >
              <SelectTrigger
                className="w-[140px] h-8 text-xs"
                data-testid="select-filter-category"
              >
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setCreateOpen(true);
              }}
              data-testid="button-create-automation"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New Automation
            </Button>
          </div>
        </div>

        {/* Summary pills */}
        {automations && automations.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>
                {activeCount} active
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-neutral-400" />
              <span>
                {pausedCount} paused
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {automations.length} total
            </div>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-md" />
            ))}
          </div>
        ) : filteredAutomations.length > 0 ? (
          <div className="space-y-6">
            {sortedCategories.map((cat) => {
              const catLabel =
                categories.find((c) => c.value === cat)?.label || cat;
              const items = grouped[cat];

              return (
                <div key={cat} className="space-y-2">
                  {/* Category header */}
                  <div className="flex items-center gap-2 px-1">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${categoryColors[cat] || categoryColors.general}`}
                    >
                      {catLabel}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {items.length}
                    </span>
                  </div>

                  {/* Automation cards */}
                  <div className="space-y-2">
                    {items.map((auto) => {
                      const isExpanded = expandedId === auto.id;
                      const st = statusConfig[auto.status] || statusConfig.active;

                      return (
                        <Card
                          key={auto.id}
                          className={`border-card-border transition-all cursor-pointer ${
                            isExpanded
                              ? "border-muted-foreground/20"
                              : "hover-elevate"
                          } ${!auto.enabled ? "opacity-60" : ""}`}
                          data-testid={`card-automation-${auto.id}`}
                          onClick={() =>
                            setExpandedId(isExpanded ? null : auto.id)
                          }
                        >
                          <CardContent className="p-4">
                            {/* Top row */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div className="p-2 rounded-md bg-muted shrink-0 mt-0.5">
                                  <Zap
                                    className={`w-4 h-4 ${auto.enabled ? "text-amber-400" : "text-muted-foreground"}`}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-medium text-sm">
                                      {auto.name}
                                    </p>
                                    <div className="flex items-center gap-1">
                                      <div
                                        className={`w-1.5 h-1.5 rounded-full ${st.dot}`}
                                      />
                                      <span
                                        className={`text-[10px] font-medium ${st.color}`}
                                      >
                                        {auto.status}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Metadata row */}
                                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                    {auto.teamName && (
                                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <UsersRound className="w-3 h-3" />
                                        {auto.teamName}
                                      </span>
                                    )}
                                    {auto.schedule && (
                                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        {auto.schedule}
                                      </span>
                                    )}
                                    {auto.agents.length > 0 && (
                                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Bot className="w-3 h-3" />
                                        {auto.agents.length} agent
                                        {auto.agents.length !== 1 ? "s" : ""}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Calendar className="w-3 h-3" />
                                      Started {formatDate(auto.startedAt)}
                                    </span>
                                  </div>

                                  {/* Description preview */}
                                  {auto.description && !isExpanded && (
                                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                                      {auto.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Right side controls */}
                              <div className="flex items-center gap-2 shrink-0">
                                <Switch
                                  checked={auto.enabled}
                                  onCheckedChange={(e) => {
                                    e; // prevent bubbling via stopPropagation not needed for Switch
                                    toggleMutation.mutate(auto.id);
                                  }}
                                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                  data-testid={`switch-automation-${auto.id}`}
                                  aria-label={`Toggle ${auto.name}`}
                                />
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <div className="mt-4 pt-3 border-t border-border space-y-4">
                                {/* Purpose / Description */}
                                {auto.description && (
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                      Purpose
                                    </p>
                                    <p className="text-xs text-foreground leading-relaxed">
                                      {auto.description}
                                    </p>
                                  </div>
                                )}

                                {/* Process */}
                                {auto.process && (
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                      <Workflow className="w-3 h-3" />
                                      Process
                                    </p>
                                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-mono bg-muted/50 rounded-md p-2.5">
                                      {auto.process}
                                    </p>
                                  </div>
                                )}

                                {/* I/O Locations */}
                                {(auto.inputLocation || auto.outputLocation) && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {auto.inputLocation && (
                                      <div className="space-y-1">
                                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                          <FolderInput className="w-3 h-3" />
                                          Input
                                        </p>
                                        <p className="text-xs text-foreground font-mono bg-muted/50 rounded-md p-2 break-all">
                                          {auto.inputLocation}
                                        </p>
                                      </div>
                                    )}
                                    {auto.outputLocation && (
                                      <div className="space-y-1">
                                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                          <FolderOutput className="w-3 h-3" />
                                          Output
                                        </p>
                                        <p className="text-xs text-foreground font-mono bg-muted/50 rounded-md p-2 break-all">
                                          {auto.outputLocation}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Assigned Agents */}
                                {auto.agents.length > 0 && (
                                  <div className="space-y-1.5">
                                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                      <Bot className="w-3 h-3" />
                                      Assigned Agents
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {auto.agents.map((agent) => (
                                        <div
                                          key={agent.id}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted/50 text-xs"
                                          data-testid={`agent-pill-auto-${auto.id}-${agent.id}`}
                                        >
                                          <Bot className="w-3 h-3 text-muted-foreground" />
                                          <span className="font-medium">
                                            {agent.name}
                                          </span>
                                          {agent.role && (
                                            <span className="text-muted-foreground">
                                              · {agent.role}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Meta row */}
                                <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
                                  <span>Created {formatDate(auto.createdAt)}</span>
                                  <span>Updated {formatDate(auto.updatedAt)}</span>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 pt-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={(e) => openEdit(auto, e)}
                                    data-testid={`button-edit-automation-${auto.id}`}
                                  >
                                    <Pencil className="w-3 h-3 mr-1" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs text-red-400 hover:text-red-300 hover:border-red-500/30"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteTarget(auto);
                                    }}
                                    data-testid={`button-delete-automation-${auto.id}`}
                                  >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Card className="border-card-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-3 rounded-full bg-muted mb-4">
                <Zap className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-sm mb-1">No automations yet</h3>
              <p className="text-xs text-muted-foreground mb-4 max-w-[32ch]">
                Create automations to define recurring processes, schedules, and
                workflows.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  resetForm();
                  setCreateOpen(true);
                }}
                data-testid="button-empty-create-automation"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Create Automation
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setCreateOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">New Automation</DialogTitle>
            <DialogDescription className="text-xs">
              Define a recurring process or workflow
            </DialogDescription>
          </DialogHeader>
          <AutomationForm
            formName={formName}
            setFormName={setFormName}
            formDesc={formDesc}
            setFormDesc={setFormDesc}
            formCategory={formCategory}
            setFormCategory={setFormCategory}
            formSchedule={formSchedule}
            setFormSchedule={setFormSchedule}
            formTeamId={formTeamId}
            setFormTeamId={setFormTeamId}
            formProcess={formProcess}
            setFormProcess={setFormProcess}
            formInput={formInput}
            setFormInput={setFormInput}
            formOutput={formOutput}
            setFormOutput={setFormOutput}
            formAgentIds={formAgentIds}
            setFormAgentIds={setFormAgentIds}
            teams={teams || []}
            agents={agents || []}
            showAgentSelect={true}
          />
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              disabled={!formName.trim() || createMutation.isPending}
              onClick={handleCreate}
              data-testid="button-submit-automation"
            >
              {createMutation.isPending ? "Creating..." : "Create Automation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editAutomation}
        onOpenChange={(open) => {
          if (!open) {
            setEditAutomation(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Automation</DialogTitle>
            <DialogDescription className="text-xs">
              Update automation configuration
            </DialogDescription>
          </DialogHeader>
          <AutomationForm
            formName={formName}
            setFormName={setFormName}
            formDesc={formDesc}
            setFormDesc={setFormDesc}
            formCategory={formCategory}
            setFormCategory={setFormCategory}
            formSchedule={formSchedule}
            setFormSchedule={setFormSchedule}
            formTeamId={formTeamId}
            setFormTeamId={setFormTeamId}
            formProcess={formProcess}
            setFormProcess={setFormProcess}
            formInput={formInput}
            setFormInput={setFormInput}
            formOutput={formOutput}
            setFormOutput={setFormOutput}
            formAgentIds={formAgentIds}
            setFormAgentIds={setFormAgentIds}
            teams={teams || []}
            agents={agents || []}
            showAgentSelect={false}
          />
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              disabled={!formName.trim() || editMutation.isPending}
              onClick={handleEdit}
              data-testid="button-save-automation"
            >
              {editMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Delete automation
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Are you sure you want to delete "{deleteTarget?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-8 text-xs bg-red-600 hover:bg-red-700"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Shared form component for create + edit
function AutomationForm({
  formName,
  setFormName,
  formDesc,
  setFormDesc,
  formCategory,
  setFormCategory,
  formSchedule,
  setFormSchedule,
  formTeamId,
  setFormTeamId,
  formProcess,
  setFormProcess,
  formInput,
  setFormInput,
  formOutput,
  setFormOutput,
  formAgentIds,
  setFormAgentIds,
  teams,
  agents,
  showAgentSelect,
}: {
  formName: string;
  setFormName: (v: string) => void;
  formDesc: string;
  setFormDesc: (v: string) => void;
  formCategory: string;
  setFormCategory: (v: string) => void;
  formSchedule: string;
  setFormSchedule: (v: string) => void;
  formTeamId: string;
  setFormTeamId: (v: string) => void;
  formProcess: string;
  setFormProcess: (v: string) => void;
  formInput: string;
  setFormInput: (v: string) => void;
  formOutput: string;
  setFormOutput: (v: string) => void;
  formAgentIds: number[];
  setFormAgentIds: (v: number[]) => void;
  teams: TeamOption[];
  agents: AgentOption[];
  showAgentSelect: boolean;
}) {
  return (
    <div className="space-y-4 pt-2">
      {/* Identity */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Daily Sales Report Pipeline"
            data-testid="input-automation-name"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Purpose / Description
          </label>
          <Textarea
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            placeholder="What does this automation do and why?"
            className="resize-none min-h-[60px] text-xs"
            data-testid="input-automation-description"
          />
        </div>
      </div>

      {/* Classification */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Category
          </label>
          <Select value={formCategory} onValueChange={setFormCategory}>
            <SelectTrigger
              className="text-xs"
              data-testid="select-automation-category"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Team
          </label>
          <Select value={formTeamId} onValueChange={setFormTeamId}>
            <SelectTrigger
              className="text-xs"
              data-testid="select-automation-team"
            >
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No team</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Schedule */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Schedule
        </label>
        <Input
          value={formSchedule}
          onChange={(e) => setFormSchedule(e.target.value)}
          placeholder="e.g. Every day at 9am, Hourly, Mon-Fri 8am"
          data-testid="input-automation-schedule"
        />
      </div>

      {/* Process */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Process
        </label>
        <Textarea
          value={formProcess}
          onChange={(e) => setFormProcess(e.target.value)}
          placeholder="Describe the workflow steps..."
          className="resize-none min-h-[80px] text-xs font-mono"
          data-testid="input-automation-process"
        />
      </div>

      {/* I/O Locations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Input Location
          </label>
          <Input
            value={formInput}
            onChange={(e) => setFormInput(e.target.value)}
            placeholder="e.g. Google Drive folder URL"
            data-testid="input-automation-input"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Output Location
          </label>
          <Input
            value={formOutput}
            onChange={(e) => setFormOutput(e.target.value)}
            placeholder="e.g. Slack channel, Drive folder"
            data-testid="input-automation-output"
          />
        </div>
      </div>

      {/* Agent Assignment (create only) */}
      {showAgentSelect && agents.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Assign Agents
          </label>
          <div className="flex flex-wrap gap-1.5">
            {agents.map((agent) => {
              const selected = formAgentIds.includes(agent.id);
              return (
                <button
                  key={agent.id}
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors ${
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() =>
                    setFormAgentIds(
                      selected
                        ? formAgentIds.filter((id) => id !== agent.id)
                        : [...formAgentIds, agent.id]
                    )
                  }
                  data-testid={`toggle-agent-${agent.id}`}
                >
                  <Bot className="w-3 h-3" />
                  {agent.name}
                  {agent.title && (
                    <span className="opacity-60">· {agent.title}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
