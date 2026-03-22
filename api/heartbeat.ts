import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://sytheuetkcowikrhunng.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5dGhldWV0a2Nvd2lrcmh1bm5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDczMjIsImV4cCI6MjA4OTY4MzMyMn0.14gighgJB_hpGysaG32bWlVDVNrjVJS8ordvhKnJKg0';
const supabase = createClient(supabaseUrl, supabaseKey);

function snakeToCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase()),
        snakeToCamel(v)
      ])
    );
  }
  return obj;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { agentId, status, message } = req.body;

  if (!agentId || !status) {
    return res.status(400).json({ error: 'agentId and status are required' });
  }

  // Fetch current agent to check status change
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Insert heartbeat
  const { data: heartbeat, error: hbError } = await supabase
    .from('heartbeats')
    .insert({
      agent_id: agentId,
      status,
      message: message || null,
    })
    .select()
    .single();

  if (hbError) return res.status(500).json({ error: hbError.message });

  // If status changed, create a status event
  if (status !== agent.status) {
    await supabase.from('status_events').insert({
      agent_id: agent.id,
      old_status: agent.status,
      new_status: status,
    });
  }

  // Update agent status and last_heartbeat
  await supabase
    .from('agents')
    .update({
      status,
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', agent.id);

  return res.status(201).json(snakeToCamel(heartbeat));
}
