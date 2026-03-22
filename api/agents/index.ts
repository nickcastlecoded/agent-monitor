import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { snakeToCamel, camelToSnake } from '../_lib/transform';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(data));
  }

  if (req.method === 'POST') {
    const { name, description, task, schedule, instructions, status } = req.body;

    if (!name || !task || !schedule) {
      return res.status(400).json({ error: 'name, task, and schedule are required' });
    }

    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        name,
        description: description || null,
        task,
        schedule,
        instructions: instructions || null,
        status: status || 'idle',
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Create initial status event
    await supabase.from('status_events').insert({
      agent_id: agent.id,
      old_status: 'none',
      new_status: agent.status,
    });

    return res.status(201).json(snakeToCamel(agent));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
