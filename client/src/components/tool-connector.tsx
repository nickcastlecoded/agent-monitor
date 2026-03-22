import { useState, useMemo } from "react";
import { Search, X, Check, Plug, MessageSquare, CircleDollarSign, HardDrive } from "lucide-react";
import {
  SiSlack,
  SiGmail,
  SiTwilio,
  SiDiscord,
  SiHubspot,
  SiSalesforce,
  SiGooglecalendar,
  SiCalendly,
  SiNotion,
  SiAsana,
  SiJira,
  SiLinear,
  SiTrello,
  SiGooglesheets,
  SiAirtable,
  SiGoogledrive,
  SiDropbox,
  SiGithub,
  SiZapier,
  SiGoogleanalytics,
  SiOpenai,
} from "react-icons/si";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface ConnectedTool {
  id: string;
  name: string;
  config: Record<string, string>;
}

interface ToolConnectorProps {
  value: string;
  onChange: (val: string) => void;
}

interface ToolDefinition {
  id: string;
  name: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
}

const MakeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" />
  </svg>
);
const PerplexityIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);
const AnthropicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L2 22h6l4-8 4 8h6L12 2z" />
  </svg>
);
const OutlookIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="18" height="18" rx="3" />
  </svg>
);

const TOOL_CATALOG: ToolDefinition[] = [
  // Communication
  {
    id: "slack",
    name: "Slack",
    category: "Communication",
    icon: SiSlack,
    iconBg: "bg-purple-500/10",
    iconColor: "text-purple-400",
    description: "Send messages and alerts to Slack channels",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/...", secret: true },
      { key: "channel", label: "Channel", placeholder: "#alerts" },
    ],
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Communication",
    icon: SiGmail,
    iconBg: "bg-red-500/10",
    iconColor: "text-red-400",
    description: "Send and read emails via Gmail",
    fields: [
      { key: "email", label: "Connected Account", placeholder: "user@gmail.com" },
    ],
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    category: "Communication",
    icon: MessageSquare,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    description: "Post messages to Teams channels",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://outlook.office.com/webhook/...", secret: true },
    ],
  },
  {
    id: "twilio",
    name: "Twilio / SMS",
    category: "Communication",
    icon: SiTwilio,
    iconBg: "bg-red-500/10",
    iconColor: "text-red-400",
    description: "Send SMS messages via Twilio",
    fields: [
      { key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxx", secret: true },
      { key: "authToken", label: "Auth Token", placeholder: "Token", secret: true },
      { key: "phoneNumber", label: "Phone Number", placeholder: "+1234567890" },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    category: "Communication",
    icon: SiDiscord,
    iconBg: "bg-indigo-500/10",
    iconColor: "text-indigo-400",
    description: "Send messages to Discord channels",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/...", secret: true },
      { key: "channel", label: "Channel", placeholder: "#general" },
    ],
  },
  // CRM & Sales
  {
    id: "hubspot",
    name: "HubSpot",
    category: "CRM & Sales",
    icon: SiHubspot,
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-400",
    description: "Manage contacts, deals, and CRM data",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "pat-na1-xxxxxxxx", secret: true },
    ],
  },
  {
    id: "salesforce",
    name: "Salesforce",
    category: "CRM & Sales",
    icon: SiSalesforce,
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-400",
    description: "Access Salesforce CRM data and automation",
    fields: [
      { key: "instanceUrl", label: "Instance URL", placeholder: "https://yourorg.salesforce.com" },
      { key: "accessToken", label: "Access Token", placeholder: "Token", secret: true },
    ],
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    category: "CRM & Sales",
    icon: CircleDollarSign,
    iconBg: "bg-green-500/10",
    iconColor: "text-green-400",
    description: "Manage sales pipeline and deals",
    fields: [
      { key: "apiToken", label: "API Token", placeholder: "Token", secret: true },
    ],
  },
  // Calendars & Scheduling
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "Calendars & Scheduling",
    icon: SiGooglecalendar,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    description: "Read and create calendar events",
    fields: [
      { key: "calendarId", label: "Calendar ID", placeholder: "primary or calendar@group.calendar.google.com" },
    ],
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    category: "Calendars & Scheduling",
    icon: OutlookIcon,
    iconBg: "bg-blue-600/10",
    iconColor: "text-blue-500",
    description: "Access Outlook calendar events",
    fields: [
      { key: "email", label: "Connected Account", placeholder: "user@outlook.com" },
    ],
  },
  {
    id: "calendly",
    name: "Calendly",
    category: "Calendars & Scheduling",
    icon: SiCalendly,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    description: "Manage scheduling and appointments",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Key", secret: true },
    ],
  },
  // Project Management
  {
    id: "notion",
    name: "Notion",
    category: "Project Management",
    icon: SiNotion,
    iconBg: "bg-neutral-500/10",
    iconColor: "text-neutral-300",
    description: "Read and write to Notion databases and pages",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "secret_xxxxxxxx", secret: true },
      { key: "databaseId", label: "Database ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
    ],
  },
  {
    id: "asana",
    name: "Asana",
    category: "Project Management",
    icon: SiAsana,
    iconBg: "bg-pink-500/10",
    iconColor: "text-pink-400",
    description: "Manage tasks and projects in Asana",
    fields: [
      { key: "accessToken", label: "Access Token", placeholder: "Token", secret: true },
      { key: "workspace", label: "Workspace", placeholder: "Workspace name or ID" },
    ],
  },
  {
    id: "jira",
    name: "Jira",
    category: "Project Management",
    icon: SiJira,
    iconBg: "bg-blue-600/10",
    iconColor: "text-blue-400",
    description: "Track issues and manage sprints",
    fields: [
      { key: "domain", label: "Domain", placeholder: "yourorg.atlassian.net" },
      { key: "apiToken", label: "API Token", placeholder: "Token", secret: true },
      { key: "email", label: "Email", placeholder: "user@company.com" },
    ],
  },
  {
    id: "linear",
    name: "Linear",
    category: "Project Management",
    icon: SiLinear,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    description: "Manage issues and project tracking",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "lin_api_xxxxxxxx", secret: true },
    ],
  },
  {
    id: "trello",
    name: "Trello",
    category: "Project Management",
    icon: SiTrello,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    description: "Manage boards, lists, and cards",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Key", secret: true },
      { key: "boardId", label: "Board ID", placeholder: "Board ID" },
    ],
  },
  // Data & Storage
  {
    id: "google-sheets",
    name: "Google Sheets",
    category: "Data & Storage",
    icon: SiGooglesheets,
    iconBg: "bg-green-500/10",
    iconColor: "text-green-400",
    description: "Read and write spreadsheet data",
    fields: [
      { key: "spreadsheetId", label: "Spreadsheet ID", placeholder: "ID from the sheet URL" },
    ],
  },
  {
    id: "airtable",
    name: "Airtable",
    category: "Data & Storage",
    icon: SiAirtable,
    iconBg: "bg-yellow-500/10",
    iconColor: "text-yellow-400",
    description: "Access Airtable bases and records",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "patxxxxxxxx", secret: true },
      { key: "baseId", label: "Base ID", placeholder: "appxxxxxxxx" },
    ],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    category: "Data & Storage",
    icon: SiGoogledrive,
    iconBg: "bg-yellow-500/10",
    iconColor: "text-yellow-400",
    description: "Access files and folders in Google Drive",
    fields: [
      { key: "folderId", label: "Folder ID", placeholder: "Folder ID from Drive URL" },
    ],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    category: "Data & Storage",
    icon: SiDropbox,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    description: "Access files stored in Dropbox",
    fields: [
      { key: "accessToken", label: "Access Token", placeholder: "Token", secret: true },
    ],
  },
  {
    id: "aws-s3",
    name: "AWS S3",
    category: "Data & Storage",
    icon: HardDrive,
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-400",
    description: "Read and write objects in S3 buckets",
    fields: [
      { key: "accessKey", label: "Access Key", placeholder: "AKIAXXXXXXXX", secret: true },
      { key: "secretKey", label: "Secret Key", placeholder: "Secret", secret: true },
      { key: "bucket", label: "Bucket", placeholder: "my-bucket" },
    ],
  },
  // Developer & Analytics
  {
    id: "github",
    name: "GitHub",
    category: "Developer & Analytics",
    icon: SiGithub,
    iconBg: "bg-neutral-500/10",
    iconColor: "text-neutral-300",
    description: "Access repos, issues, and pull requests",
    fields: [
      { key: "pat", label: "Personal Access Token", placeholder: "ghp_xxxxxxxx", secret: true },
      { key: "repo", label: "Repository", placeholder: "owner/repo" },
    ],
  },
  {
    id: "zapier",
    name: "Zapier",
    category: "Developer & Analytics",
    icon: SiZapier,
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-400",
    description: "Trigger Zapier webhooks and automations",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://hooks.zapier.com/...", secret: true },
    ],
  },
  {
    id: "make",
    name: "Make / Integromat",
    category: "Developer & Analytics",
    icon: MakeIcon,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    description: "Trigger Make scenarios via webhook",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://hook.make.com/...", secret: true },
    ],
  },
  {
    id: "google-analytics",
    name: "Google Analytics",
    category: "Developer & Analytics",
    icon: SiGoogleanalytics,
    iconBg: "bg-yellow-500/10",
    iconColor: "text-yellow-400",
    description: "Access website analytics data",
    fields: [
      { key: "propertyId", label: "Property ID", placeholder: "UA-XXXXXXXX or G-XXXXXXXX" },
    ],
  },
  // AI & Search
  {
    id: "openai",
    name: "OpenAI",
    category: "AI & Search",
    icon: SiOpenai,
    iconBg: "bg-green-500/10",
    iconColor: "text-green-400",
    description: "Use OpenAI models for generation and embeddings",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sk-xxxxxxxx", secret: true },
    ],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    category: "AI & Search",
    icon: PerplexityIcon,
    iconBg: "bg-teal-500/10",
    iconColor: "text-teal-400",
    description: "AI-powered search and research",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "pplx-xxxxxxxx", secret: true },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "AI & Search",
    icon: AnthropicIcon,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    description: "Use Claude models for analysis and generation",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sk-ant-xxxxxxxx", secret: true },
    ],
  },
];

const CATEGORIES = [
  "Communication",
  "CRM & Sales",
  "Calendars & Scheduling",
  "Project Management",
  "Data & Storage",
  "Developer & Analytics",
  "AI & Search",
];

export function ToolConnector({ value, onChange }: ToolConnectorProps) {
  const [search, setSearch] = useState("");
  const [configTool, setConfigTool] = useState<ToolDefinition | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});

  const connectedTools: ConnectedTool[] = useMemo(() => {
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }, [value]);

  const connectedIds = new Set(connectedTools.map((t) => t.id));

  const filteredTools = useMemo(() => {
    if (!search.trim()) return TOOL_CATALOG;
    const q = search.toLowerCase();
    return TOOL_CATALOG.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [search]);

  const groupedTools = useMemo(() => {
    const groups: Record<string, ToolDefinition[]> = {};
    for (const cat of CATEGORIES) {
      const tools = filteredTools.filter((t) => t.category === cat);
      if (tools.length > 0) groups[cat] = tools;
    }
    return groups;
  }, [filteredTools]);

  function openConfig(tool: ToolDefinition) {
    const existing = connectedTools.find((t) => t.id === tool.id);
    if (existing) {
      setConfigValues(existing.config);
    } else {
      setConfigValues({});
    }
    setConfigTool(tool);
  }

  function saveConfig() {
    if (!configTool) return;
    const hasValues = Object.values(configValues).some((v) => v.trim());
    if (!hasValues) return;

    const newTool: ConnectedTool = {
      id: configTool.id,
      name: configTool.name,
      config: { ...configValues },
    };

    const updated = connectedTools.filter((t) => t.id !== configTool.id);
    updated.push(newTool);
    onChange(JSON.stringify(updated));
    setConfigTool(null);
    setConfigValues({});
  }

  function removeTool(toolId: string) {
    const updated = connectedTools.filter((t) => t.id !== toolId);
    onChange(updated.length > 0 ? JSON.stringify(updated) : "");
    if (configTool?.id === toolId) {
      setConfigTool(null);
      setConfigValues({});
    }
  }

  return (
    <div className="space-y-4">
      {/* Connected tools pills */}
      {connectedTools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {connectedTools.map((ct) => {
            const def = TOOL_CATALOG.find((t) => t.id === ct.id);
            if (!def) return null;
            const Icon = def.icon;
            return (
              <div
                key={ct.id}
                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full border border-border bg-muted/50 text-xs group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <Icon className={`w-3 h-3 ${def.iconColor} shrink-0`} />
                <span className="text-foreground font-medium">{ct.name}</span>
                <button
                  type="button"
                  onClick={() => removeTool(ct.id)}
                  className="ml-0.5 p-0.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools..."
          className="pl-8 text-xs h-8"
        />
      </div>

      {/* Tool catalog grid */}
      <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
        {Object.entries(groupedTools).map(([category, tools]) => (
          <div key={category}>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">
              {category}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {tools.map((tool) => {
                const isConnected = connectedIds.has(tool.id);
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => openConfig(tool)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-left transition-all text-xs ${
                      isConnected
                        ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                        : "border-border bg-muted/30 hover:bg-muted/60 hover:border-muted-foreground/20"
                    }`}
                  >
                    <div className={`p-1 rounded ${tool.iconBg} shrink-0`}>
                      <Icon className={`w-3.5 h-3.5 ${tool.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-foreground truncate">{tool.name}</span>
                        {isConnected && (
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {Object.keys(groupedTools).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No tools match "{search}"
          </p>
        )}
      </div>

      {/* Configuration dialog */}
      <Dialog open={!!configTool} onOpenChange={(open) => !open && setConfigTool(null)}>
        <DialogContent className="sm:max-w-md">
          {configTool && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${configTool.iconBg}`}>
                    <configTool.icon className={`w-5 h-5 ${configTool.iconColor}`} />
                  </div>
                  <div>
                    <DialogTitle className="text-sm">{configTool.name}</DialogTitle>
                    <DialogDescription className="text-xs">
                      {configTool.description}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                {configTool.fields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </label>
                    <Input
                      type={field.secret ? "password" : "text"}
                      value={configValues[field.key] || ""}
                      onChange={(e) =>
                        setConfigValues({ ...configValues, [field.key]: e.target.value })
                      }
                      placeholder={field.placeholder}
                      className="font-mono text-xs"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3">
                {connectedIds.has(configTool.id) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
                    onClick={() => removeTool(configTool.id)}
                  >
                    Remove
                  </Button>
                ) : (
                  <div />
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={saveConfig}
                  className="text-xs"
                >
                  <Plug className="w-3.5 h-3.5 mr-1.5" />
                  {connectedIds.has(configTool.id) ? "Update" : "Connect"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
