import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from './_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data: agents, error } = await supabase
    .from('agents')
    .select('status');

  if (error) return res.status(500).json({ error: error.message });

  const total = agents.length;
  const running = agents.filter(a => a.status === 'running').length;
  const idle = agents.filter(a => a.status === 'idle').length;
  const errored = agents.filter(a => a.status === 'error').length;
  const offline = agents.filter(a => a.status === 'offline').length;

  return res.json({ total, running, idle, errored, offline });
}
