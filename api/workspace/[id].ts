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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing work item id' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('work_items')
      .select('*, agents(name)')
      .eq('id', id)
      .single();

    if (error) return res.status(404).json({ error: 'Work item not found' });

    const { agents: agentData, ...rest } = data as any;
    const item = { ...rest, agent_name: agentData?.name || 'Unknown Agent' };

    return res.json(snakeToCamel(item));
  }

  if (req.method === 'PATCH') {
    const updates: any = {};
    const { title, description, status, result, completedAt } = req.body;

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    if (result !== undefined) updates.result = result;
    if (completedAt !== undefined) updates.completed_at = completedAt;

    // Auto-set completedAt when marking completed
    if (status === 'completed' && !completedAt) {
      updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('work_items')
      .update(updates)
      .eq('id', id)
      .select('*, agents(name)')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const { agents: agentData, ...rest } = data as any;
    const item = { ...rest, agent_name: agentData?.name || 'Unknown Agent' };

    return res.json(snakeToCamel(item));
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('work_items')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
