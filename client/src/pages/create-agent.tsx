import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Rocket, Crosshair, FolderOpen, Brain, Clock } from "lucide-react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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

const createAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  task: z.string().min(1, "Task description is required").max(1000),
  schedule: z.string().min(1, "Schedule is required"),
  instructions: z.string().max(5000).optional().or(z.literal("")),
  status: z.string().default("idle"),
  scope: z.string().max(2000).optional().or(z.literal("")),
  outputDriveFolder: z.string().max(500).optional().or(z.literal("")),
  frequency: z.string().optional().or(z.literal("")),
  memoryDriveFolder: z.string().max(500).optional().or(z.literal("")),
});

type CreateAgentForm = z.infer<typeof createAgentSchema>;

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

export default function CreateAgent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const form = useForm<CreateAgentForm>({
    resolver: zodResolver(createAgentSchema),
    defaultValues: {
      name: "",
      description: "",
      task: "",
      schedule: "",
      instructions: "",
      status: "idle",
      scope: "",
      outputDriveFolder: "",
      frequency: "",
      memoryDriveFolder: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateAgentForm) =>
      apiRequest("POST", "/api/agents", data).then((r) => r.json()),
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Agent created", description: `${agent.name} is ready.` });
      navigate(`/agents/${agent.id}`);
    },
    onError: () => {
      toast({ title: "Failed to create agent", variant: "destructive" });
    },
  });

  function onSubmit(data: CreateAgentForm) {
    createMutation.mutate(data);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-3 -ml-2" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Create Agent</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define a new agent to monitor
          </p>
        </div>

        <Card className="border-card-border">
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. News Digest Agent"
                          {...field}
                          data-testid="input-name"
                        />
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
                      <FormLabel className="text-sm">Description</FormLabel>
                      <FormDescription className="text-xs">
                        Optional short description
                      </FormDescription>
                      <FormControl>
                        <Input
                          placeholder="e.g. Sends daily news summaries"
                          {...field}
                          data-testid="input-description"
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
                      <FormLabel className="text-sm">Task</FormLabel>
                      <FormDescription className="text-xs">
                        What this agent does each run
                      </FormDescription>
                      <FormControl>
                        <Textarea
                          placeholder="e.g. Search for the top 5 tech news stories and email me a summary"
                          className="resize-none min-h-[80px]"
                          {...field}
                          data-testid="input-task"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="schedule"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Schedule</FormLabel>
                      <FormDescription className="text-xs">
                        How often the agent runs
                      </FormDescription>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-schedule">
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
                  name="instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Instructions</FormLabel>
                      <FormDescription className="text-xs">
                        Optional system prompt or additional context
                      </FormDescription>
                      <FormControl>
                        <Textarea
                          placeholder="e.g. Focus on AI and startups. Write in a concise, professional tone."
                          className="resize-none min-h-[100px] font-mono text-xs"
                          {...field}
                          data-testid="input-instructions"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator className="my-2" />

                <div className="space-y-1 pt-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Crosshair className="w-4 h-4 text-muted-foreground" />
                    Scope & Configuration
                  </div>
                  <p className="text-xs text-muted-foreground">Optional — can also be configured after creation</p>
                </div>

                <FormField
                  control={form.control}
                  name="scope"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Scope of Work</FormLabel>
                      <FormDescription className="text-xs">
                        Boundaries and focus areas for this agent
                      </FormDescription>
                      <FormControl>
                        <Textarea
                          placeholder={"e.g. Topics to cover, data sources, output format, constraints"}
                          className="resize-none min-h-[80px] font-mono text-xs"
                          {...field}
                          data-testid="input-scope"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Custom Frequency</FormLabel>
                      <FormDescription className="text-xs">
                        Cron expression or custom schedule override
                      </FormDescription>
                      <FormControl>
                        <Input
                          placeholder="e.g. 0 9 * * 1-5"
                          className="font-mono text-xs"
                          {...field}
                          data-testid="input-frequency"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="outputDriveFolder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Output Folder (Google Drive)</FormLabel>
                      <FormDescription className="text-xs">
                        Where the agent saves its output files
                      </FormDescription>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                          <Input
                            placeholder="https://drive.google.com/drive/folders/..."
                            className="font-mono text-xs"
                            {...field}
                            data-testid="input-output-folder"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="memoryDriveFolder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Memory Folder (Google Drive)</FormLabel>
                      <FormDescription className="text-xs">
                        Where the agent stores persistent memory between runs
                      </FormDescription>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Brain className="w-4 h-4 text-muted-foreground shrink-0" />
                          <Input
                            placeholder="https://drive.google.com/drive/folders/..."
                            className="font-mono text-xs"
                            {...field}
                            data-testid="input-memory-folder"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    data-testid="button-submit-agent"
                  >
                    {createMutation.isPending ? (
                      "Creating..."
                    ) : (
                      <>
                        <Rocket className="w-4 h-4 mr-1.5" />
                        Launch Agent
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
