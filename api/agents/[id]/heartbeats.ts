import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';
import { snakeToCamel } from '../../_lib/transform';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = Number(req.query.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });

  // Verify agent exists
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', id)
    .single();

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { data, error } = await supabase
    .from('heartbeats')
    .select('*')
    .eq('agent_id', id)
    .order('timestamp', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(snakeToCamel(data));
}
