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

  const id = Number(req.query.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid task ID' });

  if (req.method === 'GET') {
    const { data: task, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !task) return res.status(404).json({ error: 'Task not found' });
    return res.json(snakeToCamel(task));
  }

  if (req.method === 'PATCH') {
    const { data: existing } = await supabase
      .from('project_tasks')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const updates: Record<string, any> = {};
    const keyMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      status: 'status',
      assignedAgentId: 'assigned_agent_id',
      priority: 'priority',
      dueDate: 'due_date',
      completedAt: 'completed_at',
    };

    for (const [camelKey, snakeKey] of Object.entries(keyMap)) {
      if (req.body[camelKey] !== undefined) {
        updates[snakeKey] = req.body[camelKey];
      }
    }

    const { data: updated, error } = await supabase
      .from('project_tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(updated));
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('project_tasks')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const { error } = await supabase
      .from('project_tasks')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
