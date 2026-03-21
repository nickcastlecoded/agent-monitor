import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertAgentSchema, insertHeartbeatSchema } from "@shared/schema";

export async function registerRoutes(server: Server, app: Express) {
  // Get all agents
  app.get("/api/agents", (_req, res) => {
    const agents = storage.getAgents();
    res.json(agents);
  });

  // Get single agent
  app.get("/api/agents/:id", (req, res) => {
    const agent = storage.getAgent(Number(req.params.id));
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  });

  // Create agent
  app.post("/api/agents", (req, res) => {
    const parsed = insertAgentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const agent = storage.createAgent(parsed.data);
    // Create initial status event
    storage.createStatusEvent({
      agentId: agent.id,
      oldStatus: "none",
      newStatus: agent.status,
      changedAt: new Date().toISOString(),
    });
    res.status(201).json(agent);
  });

  // Update agent
  app.patch("/api/agents/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = storage.getAgent(id);
    if (!existing) return res.status(404).json({ error: "Agent not found" });
    const updated = storage.updateAgent(id, req.body);
    res.json(updated);
  });

  // Delete agent
  app.delete("/api/agents/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = storage.getAgent(id);
    if (!existing) return res.status(404).json({ error: "Agent not found" });
    storage.deleteAgent(id);
    res.status(204).send();
  });

  // Heartbeat endpoint — agents POST here to report status
  app.post("/api/heartbeat", (req, res) => {
    const parsed = insertHeartbeatSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const agent = storage.getAgent(parsed.data.agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const heartbeat = storage.createHeartbeat(parsed.data);
    const now = new Date().toISOString();

    // If status changed, create a status event
    if (parsed.data.status !== agent.status) {
      storage.createStatusEvent({
        agentId: agent.id,
        oldStatus: agent.status,
        newStatus: parsed.data.status,
        changedAt: now,
      });
    }

    storage.updateAgentStatus(agent.id, parsed.data.status, now);
    res.status(201).json(heartbeat);
  });

  // Get heartbeats for an agent
  app.get("/api/agents/:id/heartbeats", (req, res) => {
    const id = Number(req.params.id);
    const agent = storage.getAgent(id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    const hbs = storage.getHeartbeats(id);
    res.json(hbs);
  });

  // Get status events for an agent
  app.get("/api/agents/:id/events", (req, res) => {
    const id = Number(req.params.id);
    const agent = storage.getAgent(id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    const events = storage.getStatusEvents(id);
    res.json(events);
  });

  // Dashboard stats
  app.get("/api/stats", (_req, res) => {
    const allAgents = storage.getAgents();
    const total = allAgents.length;
    const running = allAgents.filter(a => a.status === "running").length;
    const idle = allAgents.filter(a => a.status === "idle").length;
    const errored = allAgents.filter(a => a.status === "error").length;
    const offline = allAgents.filter(a => a.status === "offline").length;
    res.json({ total, running, idle, errored, offline });
  });
}
