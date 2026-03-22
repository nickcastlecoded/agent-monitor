-- Agent Monitor Dashboard - Supabase Schema
-- Run this in the Supabase SQL Editor

-- Agents table
CREATE TABLE agents (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  task TEXT NOT NULL,
  schedule TEXT NOT NULL,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Heartbeats table
CREATE TABLE heartbeats (
  id BIGSERIAL PRIMARY KEY,
  agent_id BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  message TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Status events table
CREATE TABLE status_events (
  id BIGSERIAL PRIMARY KEY,
  agent_id BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_heartbeats_agent_id ON heartbeats(agent_id);
CREATE INDEX idx_heartbeats_timestamp ON heartbeats(timestamp DESC);
CREATE INDEX idx_status_events_agent_id ON status_events(agent_id);
CREATE INDEX idx_status_events_changed_at ON status_events(changed_at DESC);

-- Enable Row Level Security (but allow all for now via anon key)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_events ENABLE ROW LEVEL SECURITY;

-- Policies: allow full access for authenticated and anon users (single-user dashboard)
CREATE POLICY "Allow all on agents" ON agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on heartbeats" ON heartbeats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on status_events" ON status_events FOR ALL USING (true) WITH CHECK (true);
