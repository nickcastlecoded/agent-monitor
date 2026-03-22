-- Agent Messages: communication log for agent-to-agent and user-to-agent prompting
CREATE TABLE agent_messages (
  id SERIAL PRIMARY KEY,
  from_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,   -- NULL = from user/board
  to_agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,                    -- the directive/prompt sent to the agent
  response TEXT,                           -- the agent's response after execution
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed
  parent_message_id INTEGER REFERENCES agent_messages(id) ON DELETE SET NULL,  -- for agent-to-agent chains
  metadata JSONB,                          -- actions taken, tools used, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes for efficient querying
CREATE INDEX idx_agent_messages_to_agent ON agent_messages(to_agent_id);
CREATE INDEX idx_agent_messages_from_agent ON agent_messages(from_agent_id);
CREATE INDEX idx_agent_messages_status ON agent_messages(status);
CREATE INDEX idx_agent_messages_parent ON agent_messages(parent_message_id);
