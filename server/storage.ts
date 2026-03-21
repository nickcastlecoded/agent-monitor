import { agents, heartbeats, statusEvents, type Agent, type InsertAgent, type Heartbeat, type InsertHeartbeat, type StatusEvent, type InsertStatusEvent } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

export interface IStorage {
  getAgents(): Agent[];
  getAgent(id: number): Agent | undefined;
  createAgent(agent: InsertAgent): Agent;
  updateAgent(id: number, updates: Partial<InsertAgent>): Agent | undefined;
  deleteAgent(id: number): void;
  updateAgentStatus(id: number, status: string, heartbeatTime: string): void;

  getHeartbeats(agentId: number, limit?: number): Heartbeat[];
  createHeartbeat(heartbeat: InsertHeartbeat): Heartbeat;

  getStatusEvents(agentId: number, limit?: number): StatusEvent[];
  createStatusEvent(event: InsertStatusEvent): StatusEvent;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Create tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        task TEXT NOT NULL,
        schedule TEXT NOT NULL,
        instructions TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        last_heartbeat TEXT,
        created_at TEXT NOT NULL
      )
    `);
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS heartbeats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        timestamp TEXT NOT NULL
      )
    `);
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS status_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        old_status TEXT NOT NULL,
        new_status TEXT NOT NULL,
        changed_at TEXT NOT NULL
      )
    `);
  }

  getAgents(): Agent[] {
    return db.select().from(agents).all();
  }

  getAgent(id: number): Agent | undefined {
    return db.select().from(agents).where(eq(agents.id, id)).get();
  }

  createAgent(agent: InsertAgent): Agent {
    return db.insert(agents).values({
      ...agent,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  updateAgent(id: number, updates: Partial<InsertAgent>): Agent | undefined {
    return db.update(agents).set(updates).where(eq(agents.id, id)).returning().get();
  }

  deleteAgent(id: number): void {
    db.delete(heartbeats).where(eq(heartbeats.agentId, id)).run();
    db.delete(statusEvents).where(eq(statusEvents.agentId, id)).run();
    db.delete(agents).where(eq(agents.id, id)).run();
  }

  updateAgentStatus(id: number, status: string, heartbeatTime: string): void {
    db.update(agents).set({ status, lastHeartbeat: heartbeatTime }).where(eq(agents.id, id)).run();
  }

  getHeartbeats(agentId: number, limit: number = 50): Heartbeat[] {
    return db.select().from(heartbeats).where(eq(heartbeats.agentId, agentId)).orderBy(desc(heartbeats.timestamp)).limit(limit).all();
  }

  createHeartbeat(heartbeat: InsertHeartbeat): Heartbeat {
    return db.insert(heartbeats).values({
      ...heartbeat,
      timestamp: new Date().toISOString(),
    }).returning().get();
  }

  getStatusEvents(agentId: number, limit: number = 50): StatusEvent[] {
    return db.select().from(statusEvents).where(eq(statusEvents.agentId, agentId)).orderBy(desc(statusEvents.changedAt)).limit(limit).all();
  }

  createStatusEvent(event: InsertStatusEvent): StatusEvent {
    return db.insert(statusEvents).values(event).returning().get();
  }
}

export const storage = new DatabaseStorage();
