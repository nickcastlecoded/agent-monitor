import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import {
  ArrowLeft,
  Save,
  Bot,
  FolderOpen,
  FileInput,
  Clock,
  Brain,
  Crosshair,
  Plus,
  X,
  ExternalLink,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Agent } from "@shared/schema";
import { useState, useEffect } from "react";

const editAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  task: z.string().min(1, "Task description is required").max(1000),
  schedule: z.string().min(1, "Schedule is required"),
  instructions: z.string().max(5000).optional().or(z.literal("")),
  scope: z.string().max(2000).optional().or(z.literal("")),
  outputDriveFolder: z.string().max(500).optional().or(z.literal("")),
  inputDriveFiles: z.string().max(2000).optional().or(z.literal("")),
  frequency: z.string().optional().or(z.literal("")),
  memoryDriveFolder: z.string().max(500).optional().or(z.literal("")),
});

type EditAgentForm = z.infer<typeof editAgentSchema>;

const schedulePresets = [
  { value: "Every 15 minutes", label: "Every 15 minutes" },
  { value: "Every 30 minutes", label: "Every 30 minutes" },
  { value: "Every hour", label: "Every hour" },
  { value: "Every 2 hours", label: "Every 2 hours" },
  { value: "Every 6 hours", label: "Every 6 hours" },
  { value: "Every 12 hours", label: "Every 12 hours" },
  { value: "Daily", label: "Daily" },
  { value: "Weekdays", label: "Weekdays (Mon–Fri)" },
  { value: "Weekly", label: "Weekly" },
  { value: "Monthly", label: "Monthly" },
];

function DriveFileInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  // Store files as JSON array of {name, url} objects
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [newUrl, setNewUrl] = useState("");

  useEffect(() => {
    if (value) {
      try {
        setFiles(JSON.parse(value));
      } catch {
        // Legacy: if it's a plain string, treat as single entry
        if (value.trim()) {
          setFiles([{ name: "File", url: value.trim() }]);
        }
      }
    }
  }, []);

  function addFile() {
    if (!newUrl.trim()) return;
    const nameMatch = newUrl.match(/\/d\/([^/]+)/);
    const name = nameMatch ? `File (${nameMatch[1].slice(0, 8)}...)` : "Drive File";
    const updated = [...files, { name, url: newUrl.trim() }];
    setFiles(updated);
    onChange(JSON.stringify(updated));
    setNewUrl("");
  }

  function removeFile(index: number) {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    onChange(JSON.stringify(updated.length > 0 ? updated : []));
  }

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/50 border border-border rounded-md text-xs group"
            >
              <FileInput className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1 font-mono">{file.url}</span>
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="Paste Google Drive file URL..."
          className="text-xs font-mono flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFile();
            }
          }}
          data-testid="input-drive-file-url"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addFile}
          disabled={!newUrl.trim()}
          data-testid="button-add-drive-file"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function EditAgent() {
  const [, params] = useRoute("/agents/:id/edit");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", id],
    queryFn: () => apiRequest("GET", `/api/agents/${id}`).then((r) => r.json()),
    enabled: !!id,
  });

  const form = useForm<EditAgentForm>({
    resolver: zodResolver(editAgentSchema),
    defaultValues: {
      name: "",
      description: "",
      task: "",
      schedule: "",
      instructions: "",
      scope: "",
      outputDriveFolder: "",
      inputDriveFiles: "",
      frequency: "",
      memoryDriveFolder: "",
    },
  });

  // Populate form when agent data loads
  useEffect(() => {
    if (agent) {
      form.reset({
        name: agent.name || "",
        description: agent.description || "",
        task: agent.task || "",
        schedule: agent.schedule || "",
        instructions: agent.instructions || "",
        scope: (agent as any).scope || "",
        outputDriveFolder: (agent as any).outputDriveFolder || "",
        inputDriveFiles: (agent as any).inputDriveFiles || "",
        frequency: (agent as any).frequency || "",
        memoryDriveFolder: (agent as any).memoryDriveFolder || "",
      });
    }
  }, [agent, form]);

  const saveMutation = useMutation({
    mutationFn: (data: EditAgentForm) =>
      apiRequest("PATCH", `/api/agents/${id}`, data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent updated", description: "Configuration saved." });
      navigate(`/agents/${id}`);
    },
    onError: () => {
      toast({ title: "Failed to save changes", variant: "destructive" });
    },
  });

  function onSubmit(data: EditAgentForm) {
    saveMutation.mutate(data);
  }

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[400px] rounded-md" />
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6">
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
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <Link href={`/agents/${id}`}>
            <Button variant="ghost" size="sm" className="mb-3 -ml-2" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back to Agent
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-md bg-muted">
              <Bot className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Edit Agent</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{agent.name}</p>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <Card className="border-card-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Bot className="w-4 h-4 text-muted-foreground" />
                  Identity
                </CardTitle>
                <CardDescription className="text-xs">
                  Name, description, and core task definition
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Description</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Short description of what this agent does"
                          {...field}
                          data-testid="input-edit-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="task"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Task</FormLabel>
                      <FormDescription className="text-xs">
                        What this agent does each time it runs
                      </FormDescription>
                      <FormControl>
                        <Textarea
                          className="resize-none min-h-[80px]"
                          {...field}
                          data-testid="input-edit-task"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Instructions</FormLabel>
                      <FormDescription className="text-xs">
                        System prompt or additional context the agent should follow
                      </FormDescription>
                      <FormControl>
                        <Textarea
                          className="resize-none min-h-[100px] font-mono text-xs"
                          placeholder="e.g. Focus on AI and startups. Write concisely."
                          {...field}
                          data-testid="input-edit-instructions"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Scope of Work */}
            <Card className="border-card-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-muted-foreground" />
                  Scope of Work
                </CardTitle>
                <CardDescription className="text-xs">
                  Define the boundaries and focus areas for this agent
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="scope"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          className="resize-none min-h-[120px] font-mono text-xs"
                          placeholder={`Define what this agent should and shouldn't do:\n\n• Topics to cover\n• Data sources to use\n• Output format expectations\n• Boundaries and constraints`}
                          {...field}
                          data-testid="input-edit-scope"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Schedule & Frequency */}
            <Card className="border-card-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Schedule & Frequency
                </CardTitle>
                <CardDescription className="text-xs">
                  How often and when this agent runs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="schedule"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Schedule</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-schedule">
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {schedulePresets.map((preset) => (
                            <SelectItem key={preset.value} value={preset.value}>
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Custom Frequency</FormLabel>
                      <FormDescription className="text-xs">
                        Override with a specific cron expression or custom schedule
                      </FormDescription>
                      <FormControl>
                        <Input
                          placeholder="e.g. 0 9 * * 1-5 (weekdays at 9am) or custom schedule"
                          className="font-mono text-xs"
                          {...field}
                          data-testid="input-edit-frequency"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Google Drive - Output */}
            <Card className="border-card-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                  File Output
                </CardTitle>
                <CardDescription className="text-xs">
                  Where the agent should save its work output in Google Drive
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="outputDriveFolder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Output Folder</FormLabel>
                      <FormDescription className="text-xs">
                        Paste a Google Drive folder URL where the agent saves files
                      </FormDescription>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                          <Input
                            placeholder="https://drive.google.com/drive/folders/..."
                            className="font-mono text-xs"
                            {...field}
                            data-testid="input-edit-output-folder"
                          />
                          {field.value && (
                            <a
                              href={field.value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground shrink-0"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Google Drive - Input Files */}
            <Card className="border-card-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileInput className="w-4 h-4 text-muted-foreground" />
                  File Access
                </CardTitle>
                <CardDescription className="text-xs">
                  Google Drive files the agent can read and reference
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="inputDriveFiles"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Input Files</FormLabel>
                      <FormDescription className="text-xs">
                        Add Google Drive file URLs the agent should have access to
                      </FormDescription>
                      <FormControl>
                        <DriveFileInput
                          value={field.value || ""}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Memory */}
            <Card className="border-card-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Brain className="w-4 h-4 text-muted-foreground" />
                  Memory
                </CardTitle>
                <CardDescription className="text-xs">
                  Where the agent stores persistent memory and context between runs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="memoryDriveFolder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Memory Folder</FormLabel>
                      <FormDescription className="text-xs">
                        A Google Drive folder where the agent reads/writes its memory files
                      </FormDescription>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Brain className="w-4 h-4 text-muted-foreground shrink-0" />
                          <Input
                            placeholder="https://drive.google.com/drive/folders/..."
                            className="font-mono text-xs"
                            {...field}
                            data-testid="input-edit-memory-folder"
                          />
                          {field.value && (
                            <a
                              href={field.value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground shrink-0"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Save */}
            <div className="flex items-center justify-between pt-2 pb-8">
              <Link href={`/agents/${id}`}>
                <Button type="button" variant="ghost" size="sm" data-testid="button-cancel-edit">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-agent"
              >
                {saveMutation.isPending ? (
                  "Saving..."
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1.5" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
