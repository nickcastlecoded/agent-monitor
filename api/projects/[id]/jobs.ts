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

  const id = Number(req.query.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project ID' });

  if (req.method === 'GET') {
    const { data: jobs, error } = await supabase
      .from('agent_jobs')
      .select('*')
      .eq('project_id', id)
      .order('assigned_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Join agent names
    const agentIds = [...new Set((jobs || []).map((j: any) => j.agent_id).filter(Boolean))];
    let jobsWithNames = jobs || [];
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
      jobsWithNames = jobsWithNames.map((j: any) => ({
        ...j,
        agent_name: agentMap[j.agent_id] || null,
      }));
    }

    return res.json(snakeToCamel(jobsWithNames));
  }

  if (req.method === 'POST') {
    const { agentId, role } = req.body;

    if (!agentId || !role) {
      return res.status(400).json({ error: 'agentId and role are required' });
    }

    const { data: job, error } = await supabase
      .from('agent_jobs')
      .insert({
        agent_id: agentId,
        project_id: id,
        role,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(snakeToCamel(job));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
