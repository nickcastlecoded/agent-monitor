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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { data: assignments, error } = await supabase
      .from('exec_assignments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Join agent names
    const agentIds = [...new Set((assignments || []).map((a: any) => a.assigned_agent_id).filter(Boolean))];
    let result = assignments || [];
    if (agentIds.length > 0) {
      const { data: agents } = await supabase
        .from('agents')
        .select('id, name')
        .in('id', agentIds);
      const agentMap: Record<number, string> = {};
      if (agents) {
        for (const a of agents) {
          agentMap[a.id] = a.name;
        }
      }
      result = result.map((a: any) => ({
        ...a,
        assigned_agent_name: a.assigned_agent_id ? agentMap[a.assigned_agent_id] || null : null,
      }));
    }

    return res.json(snakeToCamel(result));
  }

  if (req.method === 'POST') {
    const { title, description, status, priority, assignedAgentId, initiativeId, projectId, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const { data: assignment, error } = await supabase
      .from('exec_assignments')
      .insert({
        title,
        description: description || null,
        status: status || 'pending',
        priority: priority || 'medium',
        assigned_agent_id: assignedAgentId || null,
        initiative_id: initiativeId || null,
        project_id: projectId || null,
        due_date: dueDate || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(snakeToCamel(assignment));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
