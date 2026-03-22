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
    const { data: reports, error } = await supabase
      .from('exec_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Join agent names for created_by_agent_id
    const agentIds = [...new Set((reports || []).map((r: any) => r.created_by_agent_id).filter(Boolean))];
    let result = reports || [];
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
      result = result.map((r: any) => ({
        ...r,
        created_by_agent_name: r.created_by_agent_id ? agentMap[r.created_by_agent_id] || null : null,
      }));
    }

    return res.json(snakeToCamel(result));
  }

  if (req.method === 'POST') {
    const { title, content, type, createdByAgentId, initiativeId, projectId } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    const { data: report, error } = await supabase
      .from('exec_reports')
      .insert({
        title,
        content,
        type: type || 'general',
        created_by_agent_id: createdByAgentId || null,
        initiative_id: initiativeId || null,
        project_id: projectId || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(snakeToCamel(report));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
