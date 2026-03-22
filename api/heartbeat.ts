import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from './_lib/supabase';
import { snakeToCamel } from './_lib/transform';

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
