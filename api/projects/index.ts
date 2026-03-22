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
    let query = supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    const initiativeId = req.query.initiativeId;
    if (initiativeId) {
      query = query.eq('initiative_id', Number(initiativeId));
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(data));
  }

  if (req.method === 'POST') {
    const { name, description, status, ownerAgentId, initiativeId } = req.body;

    if (!name || !initiativeId) {
      return res.status(400).json({ error: 'name and initiativeId are required' });
    }

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        name,
        description: description || null,
        status: status || 'planning',
        owner_agent_id: ownerAgentId || null,
        initiative_id: initiativeId,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(snakeToCamel(project));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
