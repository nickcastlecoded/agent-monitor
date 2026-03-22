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
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(data));
  }

  if (req.method === 'POST') {
    const { name, description, task, schedule, instructions, status, scope, outputDriveFolder, inputDriveFiles, frequency, memoryDriveFolder } = req.body;

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
        scope: scope || null,
        output_drive_folder: outputDriveFolder || null,
        input_drive_files: inputDriveFiles || null,
        frequency: frequency || null,
        memory_drive_folder: memoryDriveFolder || null,
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
