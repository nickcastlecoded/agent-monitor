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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fetch all data in parallel
  const [agentsRes, teamsRes, initiativesRes, projectsRes, messagesRes] = await Promise.all([
    supabase.from('agents').select('*').order('name', { ascending: true }),
    supabase.from('teams').select('*').order('name', { ascending: true }),
    supabase.from('initiatives').select('*').order('created_at', { ascending: false }),
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('exec_messages').select('*').order('created_at', { ascending: true }).limit(50),
  ]);

  if (agentsRes.error) return res.status(500).json({ error: agentsRes.error.message });
  if (teamsRes.error) return res.status(500).json({ error: teamsRes.error.message });
  if (initiativesRes.error) return res.status(500).json({ error: initiativesRes.error.message });
  if (projectsRes.error) return res.status(500).json({ error: projectsRes.error.message });
  if (messagesRes.error) return res.status(500).json({ error: messagesRes.error.message });

  // Build team name map
  const teamMap: Record<number, string> = {};
  for (const t of teamsRes.data || []) {
    teamMap[t.id] = t.name;
  }

  // Attach team name to agents
  const agents = (agentsRes.data || []).map((a: any) => ({
    ...a,
    team_name: a.team_id ? teamMap[a.team_id] || null : null,
  }));

  // Attach projects to initiatives
  const projectsByInitiative: Record<number, any[]> = {};
  for (const p of projectsRes.data || []) {
    if (!projectsByInitiative[p.initiative_id]) {
      projectsByInitiative[p.initiative_id] = [];
    }
    projectsByInitiative[p.initiative_id].push(p);
  }

  const initiatives = (initiativesRes.data || []).map((i: any) => ({
    ...i,
    projects: projectsByInitiative[i.id] || [],
  }));

  return res.json(snakeToCamel({
    agents,
    teams: teamsRes.data || [],
    initiatives,
    recentMessages: messagesRes.data || [],
  }));
}
