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
    const { data: initiatives, error } = await supabase
      .from('initiatives')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Join owner agent names
    const ownerIds = [...new Set((initiatives || []).map((i: any) => i.owner_agent_id).filter(Boolean))];
    let agentMap: Record<number, string> = {};
    if (ownerIds.length > 0) {
      const { data: agents } = await supabase
        .from('agents')
        .select('id, name')
        .in('id', ownerIds);
      if (agents) {
        for (const a of agents) {
          agentMap[a.id] = a.name;
        }
      }
    }

    const result = (initiatives || []).map((i: any) => ({
      ...snakeToCamel(i),
      ownerAgentName: i.owner_agent_id ? agentMap[i.owner_agent_id] || null : null,
    }));

    return res.json(result);
  }

  if (req.method === 'POST') {
    const { name, description, status, ownerAgentId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const { data: initiative, error } = await supabase
      .from('initiatives')
      .insert({
        name,
        description: description || null,
        status: status || 'planning',
        owner_agent_id: ownerAgentId || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(snakeToCamel(initiative));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
