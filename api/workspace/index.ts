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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    // Fetch all work items joined with agent name
    const { data: workItems, error } = await supabase
      .from('work_items')
      .select('*, agents(name)')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Flatten agent name into each work item
    const items = (workItems || []).map((item: any) => {
      const { agents: agentData, ...rest } = item;
      return {
        ...rest,
        agent_name: agentData?.name || 'Unknown Agent',
      };
    });

    return res.json(snakeToCamel(items));
  }

  if (req.method === 'POST') {
    const { agentId, title, description, status, result, startedAt, completedAt } = req.body;

    if (!agentId || !title) {
      return res.status(400).json({ error: 'agentId and title are required' });
    }

    const { data: workItem, error } = await supabase
      .from('work_items')
      .insert({
        agent_id: agentId,
        title,
        description: description || null,
        status: status || 'in_progress',
        result: result || null,
        started_at: startedAt || new Date().toISOString(),
        completed_at: completedAt || null,
      })
      .select('*, agents(name)')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const { agents: agentData, ...rest } = workItem as any;
    const item = {
      ...rest,
      agent_name: agentData?.name || 'Unknown Agent',
    };

    return res.status(201).json(snakeToCamel(item));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
