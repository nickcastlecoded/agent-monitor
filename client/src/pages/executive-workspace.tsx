import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import {
  Crown,
  Send,
  Loader2,
  Plus,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  MessageSquare,
  Bot,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { format, formatDistanceToNow } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExecMessage {
  id: number;
  role: string;
  content: string;
  metadata: string | null;
  createdAt: string;
}

interface ExecAssignment {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedAgentId: number | null;
  assignedAgentName?: string | null;
  initiativeId: number | null;
  projectId: number | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface ExecReport {
  id: number;
  title: string;
  content: string;
  type: string;
  status: string;
  createdByAgentId: number | null;
  createdByAgentName?: string | null;
  initiativeId: number | null;
  projectId: number | null;
  createdAt: string;
}

interface ContextData {
  agents: Array<{ id: number; name: string; teamName: string | null }>;
  teams: Array<{ id: number; name: string }>;
  initiatives: Array<{ id: number; name: string; projects: Array<{ id: number; name: string }> }>;
  recentMessages: ExecMessage[];
}

// ─── Config ──────────────────────────────────────────────────────────────────

const assignmentStatusConfig: Record<string, { label: string; className: string; next: string }> = {
  pending: { label: "Pending", className: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20", next: "in_progress" },
  in_progress: { label: "In Progress", className: "bg-blue-500/10 text-blue-400 border-blue-500/20", next: "completed" },
  completed: { label: "Completed", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", next: "pending" },
  blocked: { label: "Blocked", className: "bg-red-500/10 text-red-400 border-red-500/20", next: "pending" },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  high: { label: "High", className: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  medium: { label: "Medium", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  low: { label: "Low", className: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20" },
};

const reportTypeConfig: Record<string, { label: string; className: string }> = {
  general: { label: "General", className: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20" },
  status: { label: "Status", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  incident: { label: "Incident", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  analysis: { label: "Analysis", className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
};

const reportStatusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20" },
  published: { label: "Published", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  archived: { label: "Archived", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
};

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "—";
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

// ─── Chat Tab ────────────────────────────────────────────────────────────────

function ChatTab() {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages, isLoading } = useQuery<ExecMessage[]>({
    queryKey: ["/api/executive/messages"],
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/executive/chat", { message: content });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/executive/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives"] });
      queryClient.invalidateQueries({ queryKey: ["/api/executive/assignments"] });
      setMessage("");
      if (data?.actionsTaken?.length > 0) {
        toast({ title: "Nick Castle took action", description: data.actionsTaken.join(", ") });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send message", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/executive/messages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executive/messages"] });
    },
  });

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex group",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
              data-testid={`chat-message-${msg.id}`}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-lg px-4 py-2.5 relative",
                  msg.role === "user"
                    ? "bg-amber-500/15 text-foreground border border-amber-500/20"
                    : "bg-muted border border-border"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {msg.role === "ceo" && (
                    <Crown className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <span className="text-xs font-medium text-muted-foreground">
                    {msg.role === "user" ? "Board of Directors" : "Nick Castle — CEO"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {format(new Date(msg.createdAt), "h:mm a")}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <button
                  onClick={() => deleteMutation.mutate(msg.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background/50 transition-opacity"
                  data-testid={`chat-delete-${msg.id}`}
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 rounded-full bg-amber-500/10 mb-4">
              <Crown className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="font-semibold text-base mb-1">Executive Channel</h3>
            <p className="text-sm text-muted-foreground max-w-[36ch]">
              Direct line to Nick Castle, your AI CEO. Send directives, ask for updates, or coordinate strategy.
            </p>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Nick Castle..."
            className="min-h-[44px] max-h-[120px] resize-none"
            rows={1}
            data-testid="chat-input"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            className="bg-amber-500 hover:bg-amber-600 text-white shrink-0"
            data-testid="chat-send"
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span className="sr-only">{sendMutation.isPending ? "Nick Castle is thinking..." : "Send"}</span>
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {sendMutation.isPending
            ? "Nick Castle is thinking..."
            : "Press Enter to send, Shift+Enter for new line"}
        </p>
      </div>
    </div>
  );
}

// ─── Assignments Tab ─────────────────────────────────────────────────────────

function AssignmentsTab() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    assignedAgentId: "",
    dueDate: "",
  });

  const { data: assignments, isLoading } = useQuery<ExecAssignment[]>({
    queryKey: ["/api/executive/assignments"],
  });

  const { data: context } = useQuery<ContextData>({
    queryKey: ["/api/executive/context"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      await apiRequest("POST", "/api/executive/assignments", {
        title: data.title,
        description: data.description || null,
        priority: data.priority,
        assignedAgentId: data.assignedAgentId ? Number(data.assignedAgentId) : null,
        dueDate: data.dueDate || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executive/assignments"] });
      setShowCreate(false);
      setCreateForm({ title: "", description: "", priority: "medium", assignedAgentId: "", dueDate: "" });
      toast({ title: "Assignment created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create assignment", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/executive/assignments/${id}`, {
        status,
        ...(status === "completed" ? { completedAt: new Date().toISOString() } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executive/assignments"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/executive/assignments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executive/assignments"] });
      toast({ title: "Assignment deleted" });
    },
  });

  const agents = context?.agents || [];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Assignments</h2>
          <p className="text-sm text-muted-foreground">Directives and tasks for the organization</p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white"
          data-testid="btn-create-assignment"
        >
          <Plus className="w-4 h-4 mr-1" />
          New Assignment
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : assignments && assignments.length > 0 ? (
        <div className="space-y-2">
          {assignments.map((a) => {
            const statusCfg = assignmentStatusConfig[a.status] || assignmentStatusConfig.pending;
            const priCfg = priorityConfig[a.priority] || priorityConfig.medium;
            return (
              <Card key={a.id} className="border-card-border" data-testid={`assignment-${a.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{a.title}</p>
                        <Badge
                          variant="outline"
                          className={cn("text-xs cursor-pointer", statusCfg.className)}
                          onClick={() => statusMutation.mutate({ id: a.id, status: statusCfg.next })}
                          data-testid={`assignment-status-${a.id}`}
                        >
                          {statusCfg.label}
                        </Badge>
                        <Badge variant="outline" className={cn("text-xs", priCfg.className)}>
                          {priCfg.label}
                        </Badge>
                      </div>
                      {a.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {a.assignedAgentName && (
                          <span className="flex items-center gap-1">
                            <Bot className="w-3 h-3" />
                            {a.assignedAgentName}
                          </span>
                        )}
                        {a.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(a.dueDate), "MMM d, yyyy")}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeAgo(a.createdAt)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8 text-muted-foreground hover:text-red-400"
                      onClick={() => deleteMutation.mutate(a.id)}
                      data-testid={`assignment-delete-${a.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-card-border border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-3 rounded-full bg-muted mb-4">
              <ClipboardList className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-sm mb-1">No assignments yet</h3>
            <p className="text-xs text-muted-foreground max-w-[32ch]">
              Create assignments to direct your agents and track organizational priorities.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create Assignment Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Assignment</DialogTitle>
            <DialogDescription>Create a directive for the organization</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Assignment title"
                data-testid="input-assignment-title"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe the assignment..."
                rows={3}
                data-testid="input-assignment-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Priority</label>
                <Select
                  value={createForm.priority}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, priority: v }))}
                >
                  <SelectTrigger data-testid="select-assignment-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Assign To</label>
                <Select
                  value={createForm.assignedAgentId}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, assignedAgentId: v }))}
                >
                  <SelectTrigger data-testid="select-assignment-agent">
                    <SelectValue placeholder="Select agent..." />
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
            <div>
              <label className="text-xs font-medium text-muted-foreground">Due Date</label>
              <Input
                type="date"
                value={createForm.dueDate}
                onChange={(e) => setCreateForm((f) => ({ ...f, dueDate: e.target.value }))}
                data-testid="input-assignment-due-date"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)} data-testid="btn-cancel-assignment">
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(createForm)}
                disabled={!createForm.title.trim() || createMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="btn-save-assignment"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Reports Tab ─────────────────────────────────────────────────────────────

function ReportsTab() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({
    title: "",
    content: "",
    type: "general",
  });
  const [editForm, setEditForm] = useState({
    title: "",
    content: "",
    type: "general",
    status: "draft",
  });

  const { data: reports, isLoading } = useQuery<ExecReport[]>({
    queryKey: ["/api/executive/reports"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      await apiRequest("POST", "/api/executive/reports", {
        title: data.title,
        content: data.content,
        type: data.type,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executive/reports"] });
      setShowCreate(false);
      setCreateForm({ title: "", content: "", type: "general" });
      toast({ title: "Report created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create report", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof editForm }) => {
      await apiRequest("PATCH", `/api/executive/reports/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executive/reports"] });
      setEditingId(null);
      toast({ title: "Report updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update report", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/executive/reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executive/reports"] });
      toast({ title: "Report deleted" });
    },
  });

  const startEdit = (r: ExecReport) => {
    setEditingId(r.id);
    setEditForm({ title: r.title, content: r.content, type: r.type, status: r.status });
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reports</h2>
          <p className="text-sm text-muted-foreground">Executive briefings and status updates</p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white"
          data-testid="btn-create-report"
        >
          <Plus className="w-4 h-4 mr-1" />
          New Report
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : reports && reports.length > 0 ? (
        <div className="space-y-2">
          {reports.map((r) => {
            const typeCfg = reportTypeConfig[r.type] || reportTypeConfig.general;
            const statusCfg = reportStatusConfig[r.status] || reportStatusConfig.draft;
            const isExpanded = expandedId === r.id;

            return (
              <Card key={r.id} className="border-card-border" data-testid={`report-${r.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      data-testid={`report-toggle-${r.id}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <p className="font-medium text-sm">{r.title}</p>
                        <Badge variant="outline" className={cn("text-xs", typeCfg.className)}>
                          {typeCfg.label}
                        </Badge>
                        <Badge variant="outline" className={cn("text-xs", statusCfg.className)}>
                          {statusCfg.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 ml-6 text-xs text-muted-foreground">
                        {r.createdByAgentName && (
                          <span className="flex items-center gap-1">
                            <Bot className="w-3 h-3" />
                            {r.createdByAgentName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeAgo(r.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(r)}
                        data-testid={`report-edit-${r.id}`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-400"
                        onClick={() => deleteMutation.mutate(r.id)}
                        data-testid={`report-delete-${r.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 ml-6 p-3 rounded-md bg-muted/50 border border-border/50">
                      <p className="text-sm whitespace-pre-wrap">{r.content}</p>
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
              <FileText className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-sm mb-1">No reports yet</h3>
            <p className="text-xs text-muted-foreground max-w-[32ch]">
              Create executive reports to track organizational status and share insights.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create Report Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Report</DialogTitle>
            <DialogDescription>Create an executive report or briefing</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Report title"
                data-testid="input-report-title"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select
                value={createForm.type}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger data-testid="select-report-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="incident">Incident</SelectItem>
                  <SelectItem value="analysis">Analysis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Content</label>
              <Textarea
                value={createForm.content}
                onChange={(e) => setCreateForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Write the report content..."
                rows={6}
                data-testid="input-report-content"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)} data-testid="btn-cancel-report">
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(createForm)}
                disabled={!createForm.title.trim() || !createForm.content.trim() || createMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="btn-save-report"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Report Dialog */}
      <Dialog open={editingId !== null} onOpenChange={() => setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Report</DialogTitle>
            <DialogDescription>Update the report details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                data-testid="input-edit-report-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select
                  value={editForm.type}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger data-testid="select-edit-report-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="incident">Incident</SelectItem>
                    <SelectItem value="analysis">Analysis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger data-testid="select-edit-report-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Content</label>
              <Textarea
                value={editForm.content}
                onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))}
                rows={6}
                data-testid="input-edit-report-content"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditingId(null)} data-testid="btn-cancel-edit-report">
                Cancel
              </Button>
              <Button
                onClick={() => editingId && updateMutation.mutate({ id: editingId, data: editForm })}
                disabled={!editForm.title.trim() || !editForm.content.trim() || updateMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="btn-save-edit-report"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ExecutiveWorkspace() {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Crown className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Executive Workspace</h1>
            <p className="text-sm text-muted-foreground">
              Command center — Board of Directors &harr; Nick Castle, AI CEO
            </p>
          </div>
        </div>
      </div>

      {/* Tabs take remaining height */}
      <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
        <div className="border-b border-border px-6 shrink-0">
          <TabsList className="h-10 bg-transparent p-0 gap-4" data-testid="executive-tabs">
            <TabsTrigger
              value="chat"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-amber-500 data-[state=active]:text-foreground rounded-none px-1 pb-2.5"
              data-testid="tab-chat"
            >
              <MessageSquare className="w-4 h-4 mr-1.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger
              value="assignments"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-amber-500 data-[state=active]:text-foreground rounded-none px-1 pb-2.5"
              data-testid="tab-assignments"
            >
              <ClipboardList className="w-4 h-4 mr-1.5" />
              Assignments
            </TabsTrigger>
            <TabsTrigger
              value="reports"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-amber-500 data-[state=active]:text-foreground rounded-none px-1 pb-2.5"
              data-testid="tab-reports"
            >
              <FileText className="w-4 h-4 mr-1.5" />
              Reports
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="flex-1 min-h-0 m-0">
          <ChatTab />
        </TabsContent>
        <TabsContent value="assignments" className="flex-1 min-h-0 m-0">
          <AssignmentsTab />
        </TabsContent>
        <TabsContent value="reports" className="flex-1 min-h-0 m-0">
          <ReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
