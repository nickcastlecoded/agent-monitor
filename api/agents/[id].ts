import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { snakeToCamel } from '../_lib/transform';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const id = Number(req.query.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });

  if (req.method === 'GET') {
    const { data: agent, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !agent) return res.status(404).json({ error: 'Agent not found' });
    return res.json(snakeToCamel(agent));
  }

  if (req.method === 'PATCH') {
    const { data: existing } = await supabase
      .from('agents')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Agent not found' });

    // Convert camelCase body keys to snake_case for Supabase
    const updates: Record<string, any> = {};
    const keyMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      task: 'task',
      schedule: 'schedule',
      instructions: 'instructions',
      status: 'status',
      lastHeartbeat: 'last_heartbeat',
    };

    for (const [camelKey, snakeKey] of Object.entries(keyMap)) {
      if (req.body[camelKey] !== undefined) {
        updates[snakeKey] = req.body[camelKey];
      }
    }

    const { data: updated, error } = await supabase
      .from('agents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(updated));
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('agents')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Agent not found' });

    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
