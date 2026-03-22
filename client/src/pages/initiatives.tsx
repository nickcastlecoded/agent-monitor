import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Target,
  Plus,
  ChevronRight,
  ChevronDown,
  FolderKanban,
  CheckSquare,
  Bot,
  Calendar,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Agent } from "@shared/schema";

interface InitiativeListItem {
  id: number;
  name: string;
  description: string | null;
  status: string;
  ownerAgentId: number | null;
  ownerAgentName: string | null;
  createdAt: string;
}

interface ProjectItem {
  id: number;
  name: string;
  description: string | null;
  status: string;
  ownerAgentId: number | null;
  createdAt: string;
}

interface TaskItem {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedAgentId: number | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface ProjectDetail extends ProjectItem {
  tasks: TaskItem[];
  jobs: Array<{ id: number; agentId: number; agentName: string | null; role: string }>;
}

interface InitiativeDetail {
  id: number;
  name: string;
  description: string | null;
  status: string;
  ownerAgentId: number | null;
  ownerAgentName: string | null;
  projects: ProjectItem[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  planning: { label: "Planning", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  completed: { label: "Completed", className: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20" },
  on_hold: { label: "On Hold", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
};

const taskStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20" },
  in_progress: { label: "In Progress", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  completed: { label: "Completed", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  blocked: { label: "Blocked", className: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  high: { label: "High", className: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  medium: { label: "Medium", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  low: { label: "Low", className: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20" },
};

function StatusBadge({ status, config }: { status: string; config: Record<string, { label: string; className: string }> }) {
  const c = config[status] || { label: status, className: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20" };
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-mono", c.className)}>
      {c.label}
    </Badge>
  );
}

// Task row component
function TaskRow({
  task,
  agents,
  onStatusChange,
}: {
  task: TaskItem;
  agents: Agent[];
  onStatusChange: (taskId: number, status: string) => void;
}) {
  const assignedAgent = agents.find((a) => a.id === task.assignedAgentId);
  const nextStatus: Record<string, string> = {
    pending: "in_progress",
    in_progress: "completed",
    blocked: "in_progress",
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/30 border border-border/50 group">
      <button
        type="button"
        className="shrink-0"
        onClick={() => {
          const next = nextStatus[task.status];
          if (next) onStatusChange(task.id, next);
        }}
        data-testid={`task-toggle-${task.id}`}
      >
        <CheckSquare
          className={cn(
            "w-4 h-4 transition-colors",
            task.status === "completed"
              ? "text-emerald-400"
              : "text-muted-foreground hover:text-foreground"
          )}
        />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-xs font-medium", task.status === "completed" && "line-through text-muted-foreground")}>
            {task.title}
          </span>
          <StatusBadge status={task.status} config={taskStatusConfig} />
          <StatusBadge status={task.priority} config={priorityConfig} />
        </div>
        {task.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {assignedAgent && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Bot className="w-3 h-3" />
            {assignedAgent.name}
          </span>
        )}
        {task.dueDate && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {format(new Date(task.dueDate), "MMM d")}
          </span>
        )}
      </div>
    </div>
  );
}

// Project section (expandable)
function ProjectSection({
  project,
  agents,
}: {
  project: ProjectItem;
  agents: Agent[];
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: detail } = useQuery<ProjectDetail>({
    queryKey: ["/api/projects", project.id],
    queryFn: () => apiRequest("GET", `/api/projects/${project.id}`).then((r) => r.json()),
    enabled: expanded,
  });

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskAgentId, setTaskAgentId] = useState("");
  const { toast } = useToast();

  const createTaskMutation = useMutation({
    mutationFn: (data: { title: string; description: string; priority: string; assignedAgentId: number | null }) =>
      apiRequest("POST", `/api/projects/${project.id}/tasks`, data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      setTaskDialogOpen(false);
      setTaskTitle("");
      setTaskDesc("");
      setTaskPriority("medium");
      setTaskAgentId("");
      toast({ title: "Task created" });
    },
    onError: () => toast({ title: "Failed to create task", variant: "destructive" }),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) =>
      apiRequest("PATCH", `/api/tasks/${taskId}`, {
        status,
        ...(status === "completed" ? { completedAt: new Date().toISOString() } : {}),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
    },
  });

  const tasks = detail?.tasks || [];
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const completionPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
        data-testid={`project-toggle-${project.id}`}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <FolderKanban className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium flex-1">{project.name}</span>
        <StatusBadge status={project.status} config={statusConfig} />
        {expanded && tasks.length > 0 && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {completedCount}/{tasks.length} ({completionPct}%)
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {project.description && (
            <p className="text-[11px] text-muted-foreground pl-7">{project.description}</p>
          )}

          {detail ? (
            <>
              {tasks.length > 0 ? (
                <div className="space-y-1 pl-3">
                  {tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      agents={agents}
                      onStatusChange={(taskId, status) => updateTaskMutation.mutate({ taskId, status })}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground pl-7">No tasks yet</p>
              )}

              <div className="pl-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground"
                  onClick={() => setTaskDialogOpen(true)}
                  data-testid={`button-add-task-${project.id}`}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Task
                </Button>
              </div>
            </>
          ) : (
            <div className="pl-7 space-y-1">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          )}
        </div>
      )}

      {/* Create task dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">New Task</DialogTitle>
            <DialogDescription className="text-xs">
              Add a task to {project.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Task title"
                data-testid="input-task-title"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                placeholder="Optional description"
                className="resize-none min-h-[60px] text-xs"
                data-testid="input-task-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Priority</label>
                <Select value={taskPriority} onValueChange={setTaskPriority}>
                  <SelectTrigger className="text-xs" data-testid="select-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Assign Agent</label>
                <Select value={taskAgentId} onValueChange={setTaskAgentId}>
                  <SelectTrigger className="text-xs" data-testid="select-task-agent">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              disabled={!taskTitle.trim() || createTaskMutation.isPending}
              onClick={() =>
                createTaskMutation.mutate({
                  title: taskTitle.trim(),
                  description: taskDesc.trim(),
                  priority: taskPriority,
                  assignedAgentId: taskAgentId ? Number(taskAgentId) : null,
                })
              }
              data-testid="button-submit-task"
            >
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Initiative section (expandable)
function InitiativeSection({
  initiative,
  agents,
}: {
  initiative: InitiativeListItem;
  agents: Agent[];
}) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");

  const { data: detail } = useQuery<InitiativeDetail>({
    queryKey: ["/api/initiatives", initiative.id],
    queryFn: () => apiRequest("GET", `/api/initiatives/${initiative.id}`).then((r) => r.json()),
    enabled: expanded,
  });

  const createProjectMutation = useMutation({
    mutationFn: (data: { name: string; description: string; initiativeId: number }) =>
      apiRequest("POST", "/api/projects", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives", initiative.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives"] });
      setProjectDialogOpen(false);
      setProjectName("");
      setProjectDesc("");
      toast({ title: "Project created" });
    },
    onError: () => toast({ title: "Failed to create project", variant: "destructive" }),
  });

  const projects = detail?.projects || [];

  return (
    <Card className="border-card-border" data-testid={`card-initiative-${initiative.id}`}>
      <CardContent className="p-0">
        <button
          type="button"
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
          onClick={() => setExpanded(!expanded)}
          data-testid={`initiative-toggle-${initiative.id}`}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <div className="p-1.5 rounded-md bg-muted shrink-0">
            <Target className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{initiative.name}</span>
              <StatusBadge status={initiative.status} config={statusConfig} />
            </div>
            {initiative.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{initiative.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {initiative.ownerAgentName && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Bot className="w-3 h-3" />
                {initiative.ownerAgentName}
              </span>
            )}
          </div>
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex items-center justify-between pl-8">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Projects ({projects.length})
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground"
                onClick={() => setProjectDialogOpen(true)}
                data-testid={`button-add-project-${initiative.id}`}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Project
              </Button>
            </div>

            {detail ? (
              projects.length > 0 ? (
                <div className="space-y-2 pl-4">
                  {projects.map((project) => (
                    <ProjectSection key={project.id} project={project} agents={agents} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pl-8">No projects yet</p>
              )
            ) : (
              <div className="pl-8 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Create project dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">New Project</DialogTitle>
            <DialogDescription className="text-xs">
              Add a project to {initiative.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Project name"
                data-testid="input-project-name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                placeholder="Optional description"
                className="resize-none min-h-[60px] text-xs"
                data-testid="input-project-description"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              disabled={!projectName.trim() || createProjectMutation.isPending}
              onClick={() =>
                createProjectMutation.mutate({
                  name: projectName.trim(),
                  description: projectDesc.trim(),
                  initiativeId: initiative.id,
                })
              }
              data-testid="button-submit-project"
            >
              {createProjectMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function InitiativesPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: initiatives, isLoading } = useQuery<InitiativeListItem[]>({
    queryKey: ["/api/initiatives"],
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      apiRequest("POST", "/api/initiatives", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives"] });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      toast({ title: "Initiative created" });
    },
    onError: () => toast({ title: "Failed to create initiative", variant: "destructive" }),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Initiatives</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Strategic initiatives, projects, and tasks
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-initiative">
            <Plus className="w-4 h-4 mr-1.5" />
            New Initiative
          </Button>
        </div>

        {/* Initiative list */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-md" />
            ))}
          </div>
        ) : initiatives && initiatives.length > 0 ? (
          <div className="space-y-3">
            {initiatives.map((initiative) => (
              <InitiativeSection
                key={initiative.id}
                initiative={initiative}
                agents={agents || []}
              />
            ))}
          </div>
        ) : (
          <Card className="border-card-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-3 rounded-full bg-muted mb-4">
                <Target className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-sm mb-1">No initiatives yet</h3>
              <p className="text-xs text-muted-foreground mb-4 max-w-[28ch]">
                Create your first strategic initiative.
              </p>
              <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-empty-create-initiative">
                <Plus className="w-4 h-4 mr-1.5" />
                Create Initiative
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create initiative dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">New Initiative</DialogTitle>
            <DialogDescription className="text-xs">
              Create a strategic initiative to organize projects and tasks
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Q1 Content Strategy"
                data-testid="input-initiative-name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What is this initiative about?"
                className="resize-none min-h-[60px] text-xs"
                data-testid="input-initiative-description"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newName.trim(), description: newDesc.trim() })}
              data-testid="button-submit-initiative"
            >
              {createMutation.isPending ? "Creating..." : "Create Initiative"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
