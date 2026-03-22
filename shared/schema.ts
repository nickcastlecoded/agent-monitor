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
