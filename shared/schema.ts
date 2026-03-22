import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  task: text("task").notNull(),
  schedule: text("schedule").notNull(),
  instructions: text("instructions"),
  status: text("status").notNull().default("idle"),
  lastHeartbeat: text("last_heartbeat"),
  createdAt: text("created_at").notNull(),
  // Agent configuration fields
  scope: text("scope"),
  outputDriveFolder: text("output_drive_folder"),
  inputDriveFiles: text("input_drive_files"),
  frequency: text("frequency"),
  memoryDriveFolder: text("memory_drive_folder"),
  connectedTools: text("connected_tools"),
  // Organizational fields
  teamId: integer("team_id"),
  title: text("title"),
  agentType: text("agent_type"),
});

export const heartbeats = sqliteTable("heartbeats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  timestamp: text("timestamp").notNull(),
});

export const statusEvents = sqliteTable("status_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(),
  oldStatus: text("old_status").notNull(),
  newStatus: text("new_status").notNull(),
  changedAt: text("changed_at").notNull(),
});

export const workItems = sqliteTable("work_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("in_progress"),
  result: text("result"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
});

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
});

export const initiatives = sqliteTable("initiatives", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("planning"),
  ownerAgentId: integer("owner_agent_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  initiativeId: integer("initiative_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("planning"),
  ownerAgentId: integer("owner_agent_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projectTasks = sqliteTable("project_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  assignedAgentId: integer("assigned_agent_id"),
  priority: text("priority").notNull().default("medium"),
  dueDate: text("due_date"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
});

export const agentJobs = sqliteTable("agent_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(),
  projectId: integer("project_id").notNull(),
  role: text("role").notNull(),
  assignedAt: text("assigned_at").notNull(),
});

export const execMessages = sqliteTable("exec_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
});

export const execAssignments = sqliteTable("exec_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("medium"),
  assignedAgentId: integer("assigned_agent_id"),
  initiativeId: integer("initiative_id"),
  projectId: integer("project_id"),
  dueDate: text("due_date"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
});

export const execReports = sqliteTable("exec_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull().default("general"),
  status: text("status").notNull().default("draft"),
  createdByAgentId: integer("created_by_agent_id"),
  initiativeId: integer("initiative_id"),
  projectId: integer("project_id"),
  createdAt: text("created_at").notNull(),
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  lastHeartbeat: true,
  createdAt: true,
});

export const insertHeartbeatSchema = createInsertSchema(heartbeats).omit({
  id: true,
  timestamp: true,
});

export const insertStatusEventSchema = createInsertSchema(statusEvents).omit({
  id: true,
});

export const insertWorkItemSchema = createInsertSchema(workItems).omit({
  id: true,
  createdAt: true,
});

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;
export type InsertHeartbeat = z.infer<typeof insertHeartbeatSchema>;
export type Heartbeat = typeof heartbeats.$inferSelect;
export type InsertStatusEvent = z.infer<typeof insertStatusEventSchema>;
export type StatusEvent = typeof statusEvents.$inferSelect;
export type InsertWorkItem = z.infer<typeof insertWorkItemSchema>;
export type WorkItem = typeof workItems.$inferSelect;

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
});
export const insertInitiativeSchema = createInsertSchema(initiatives).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({
  id: true,
  createdAt: true,
});
export const insertAgentJobSchema = createInsertSchema(agentJobs).omit({
  id: true,
  assignedAt: true,
});

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertInitiative = z.infer<typeof insertInitiativeSchema>;
export type Initiative = typeof initiatives.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type InsertAgentJob = z.infer<typeof insertAgentJobSchema>;
export type AgentJob = typeof agentJobs.$inferSelect;

export const automations = sqliteTable("automations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  status: text("status").notNull().default("active"),
  schedule: text("schedule"),
  teamId: integer("team_id"),
  process: text("process"),
  inputLocation: text("input_location"),
  outputLocation: text("output_location"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  startedAt: text("started_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const automationAgents = sqliteTable("automation_agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  automationId: integer("automation_id").notNull(),
  agentId: integer("agent_id").notNull(),
  role: text("role"),
  assignedAt: text("assigned_at").notNull(),
});

export const insertExecMessageSchema = createInsertSchema(execMessages).omit({
  id: true,
  createdAt: true,
});
export const insertExecAssignmentSchema = createInsertSchema(execAssignments).omit({
  id: true,
  createdAt: true,
});
export const insertExecReportSchema = createInsertSchema(execReports).omit({
  id: true,
  createdAt: true,
});

export type InsertExecMessage = z.infer<typeof insertExecMessageSchema>;
export type ExecMessage = typeof execMessages.$inferSelect;
export type InsertExecAssignment = z.infer<typeof insertExecAssignmentSchema>;
export type ExecAssignment = typeof execAssignments.$inferSelect;
export type InsertExecReport = z.infer<typeof insertExecReportSchema>;
export type ExecReport = typeof execReports.$inferSelect;

export const insertAutomationSchema = createInsertSchema(automations).omit({
  id: true,
  startedAt: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAutomationAgentSchema = createInsertSchema(automationAgents).omit({
  id: true,
  assignedAt: true,
});

export type InsertAutomation = z.infer<typeof insertAutomationSchema>;
export type Automation = typeof automations.$inferSelect;
export type InsertAutomationAgent = z.infer<typeof insertAutomationAgentSchema>;
export type AutomationAgent = typeof automationAgents.$inferSelect;
