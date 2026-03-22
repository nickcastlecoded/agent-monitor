import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Anthropic from '@anthropic-ai/sdk';

const supabaseUrl = process.env.SUPABASE_URL || 'https://sytheuetkcowikrhunng.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5dGhldWV0a2Nvd2lrcmh1bm5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDczMjIsImV4cCI6MjA4OTY4MzMyMn0.14gighgJB_hpGysaG32bWlVDVNrjVJS8ordvhKnJKg0';
const JWT_SECRET = process.env.JWT_SECRET || 'agent-monitor-secret-key-change-in-production';
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

function verifyAdmin(req: VercelRequest): { userId: number; role: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as any;
    if (decoded.role !== 'admin') return null;
    return decoded;
  } catch {
    return null;
  }
}

const priorityOrder: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── Agents ────────────────────────────────────────────────────────────────

async function handleAgents(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(data));
  }

  if (req.method === 'POST') {
    const { name, description, task, schedule, instructions, status, scope, outputDriveFolder, inputDriveFiles, frequency, memoryDriveFolder, connectedTools, teamId, title, agentType } = req.body;

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
        connected_tools: connectedTools || null,
        team_id: teamId || null,
        title: title || null,
        agent_type: agentType || 'worker',
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

async function handleAgentById(req: VercelRequest, res: VercelResponse, id: number) {
  if (req.method === 'GET') {
    const { data: agent, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !agent) return res.status(404).json({ error: 'Agent not found' });
    return res.json(snakeToCamel(agent));
  }

  if (req.method === 'PATCH') {
    const { data: existing } = await supabase
      .from('agents')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Agent not found' });

    const updates: Record<string, any> = {};
    const keyMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      task: 'task',
      schedule: 'schedule',
      instructions: 'instructions',
      status: 'status',
      lastHeartbeat: 'last_heartbeat',
      scope: 'scope',
      outputDriveFolder: 'output_drive_folder',
      inputDriveFiles: 'input_drive_files',
      frequency: 'frequency',
      memoryDriveFolder: 'memory_drive_folder',
      connectedTools: 'connected_tools',
      teamId: 'team_id',
      title: 'title',
      agentType: 'agent_type',
    };

    for (const [camelKey, snakeKey] of Object.entries(keyMap)) {
      if (req.body[camelKey] !== undefined) {
        updates[snakeKey] = req.body[camelKey];
      }
    }

    const { data: updated, error } = await supabase
      .from('agents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(updated));
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('agents')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Agent not found' });

    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleAgentHeartbeats(req: VercelRequest, res: VercelResponse, agentId: number) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .single();

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { data, error } = await supabase
    .from('heartbeats')
    .select('*')
    .eq('agent_id', agentId)
    .order('timestamp', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(snakeToCamel(data));
}

async function handleAgentEvents(req: VercelRequest, res: VercelResponse, agentId: number) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .single();

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { data, error } = await supabase
    .from('status_events')
    .select('*')
    .eq('agent_id', agentId)
    .order('changed_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(snakeToCamel(data));
}

// ─── Auth ──────────────────────────────────────────────────────────────────

async function handleAuthLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  const { password_hash, ...safeUser } = user;
  return res.json({ user: snakeToCamel(safeUser), token });
}

async function handleAuthMe(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string; role: string };

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role, created_at')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'User not found' });
    }

    return res.json(snakeToCamel(user));
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Heartbeat ─────────────────────────────────────────────────────────────

async function handleHeartbeat(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { agentId, status, message } = req.body;

  if (!agentId || !status) {
    return res.status(400).json({ error: 'agentId and status are required' });
  }

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const { data: heartbeat, error: hbError } = await supabase
    .from('heartbeats')
    .insert({
      agent_id: agentId,
      status,
      message: message || null,
    })
    .select()
    .single();

  if (hbError) return res.status(500).json({ error: hbError.message });

  if (status !== agent.status) {
    await supabase.from('status_events').insert({
      agent_id: agent.id,
      old_status: agent.status,
      new_status: status,
    });
  }

  await supabase
    .from('agents')
    .update({
      status,
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', agent.id);

  return res.status(201).json(snakeToCamel(heartbeat));
}

// ─── Stats ─────────────────────────────────────────────────────────────────

async function handleStats(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data: agents, error } = await supabase
    .from('agents')
    .select('status');

  if (error) return res.status(500).json({ error: error.message });

  const total = agents.length;
  const running = agents.filter(a => a.status === 'running').length;
  const idle = agents.filter(a => a.status === 'idle').length;
  const errored = agents.filter(a => a.status === 'error').length;
  const offline = agents.filter(a => a.status === 'offline').length;

  return res.json({ total, running, idle, errored, offline });
}

// ─── Executive Messages ────────────────────────────────────────────────────

async function handleExecMessages(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    let query = supabase
      .from('exec_messages')
      .select('*')
      .order('created_at', { ascending: true });

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const before = req.query.before as string | undefined;

    if (before) {
      query = query.lt('created_at', before);
    }
    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(data));
  }

  if (req.method === 'POST') {
    const { role, content, metadata } = req.body;

    if (!role || !content) {
      return res.status(400).json({ error: 'role and content are required' });
    }

    const { data: message, error } = await supabase
      .from('exec_messages')
      .insert({
        role,
        content,
        metadata: metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(snakeToCamel(message));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleExecMessageById(req: VercelRequest, res: VercelResponse, id: number) {
  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('exec_messages')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Message not found' });

    const { error } = await supabase
      .from('exec_messages')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── Executive Context ─────────────────────────────────────────────────────

async function handleExecContext(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const teamMap: Record<number, string> = {};
  for (const t of teamsRes.data || []) {
    teamMap[t.id] = t.name;
  }

  const agents = (agentsRes.data || []).map((a: any) => ({
    ...a,
    team_name: a.team_id ? teamMap[a.team_id] || null : null,
  }));

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

// ─── Executive Assignments ─────────────────────────────────────────────────

async function handleExecAssignments(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const { data: assignments, error } = await supabase
      .from('exec_assignments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

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

async function handleExecAssignmentById(req: VercelRequest, res: VercelResponse, id: number) {
  if (req.method === 'GET') {
    const { data: assignment, error } = await supabase
      .from('exec_assignments')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !assignment) return res.status(404).json({ error: 'Assignment not found' });
    return res.json(snakeToCamel(assignment));
  }

  if (req.method === 'PATCH') {
    const { data: existing } = await supabase
      .from('exec_assignments')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Assignment not found' });

    const updates: Record<string, any> = {};
    const keyMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      status: 'status',
      priority: 'priority',
      assignedAgentId: 'assigned_agent_id',
      initiativeId: 'initiative_id',
      projectId: 'project_id',
      dueDate: 'due_date',
      completedAt: 'completed_at',
    };

    for (const [camelKey, snakeKey] of Object.entries(keyMap)) {
      if (req.body[camelKey] !== undefined) {
        updates[snakeKey] = req.body[camelKey];
      }
    }

    const { data: updated, error } = await supabase
      .from('exec_assignments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(updated));
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('exec_assignments')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Assignment not found' });

    const { error } = await supabase
      .from('exec_assignments')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── Executive Reports ─────────────────────────────────────────────────────

async function handleExecReports(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const { data: reports, error } = await supabase
      .from('exec_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

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

async function handleExecReportById(req: VercelRequest, res: VercelResponse, id: number) {
  if (req.method === 'GET') {
    const { data: report, error } = await supabase
      .from('exec_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !report) return res.status(404).json({ error: 'Report not found' });
    return res.json(snakeToCamel(report));
  }

  if (req.method === 'PATCH') {
    const { data: existing } = await supabase
      .from('exec_reports')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Report not found' });

    const updates: Record<string, any> = {};
    const keyMap: Record<string, string> = {
      title: 'title',
      content: 'content',
      type: 'type',
      status: 'status',
    };

    for (const [camelKey, snakeKey] of Object.entries(keyMap)) {
      if (req.body[camelKey] !== undefined) {
        updates[snakeKey] = req.body[camelKey];
      }
    }

    const { data: updated, error } = await supabase
      .from('exec_reports')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(updated));
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('exec_reports')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Report not found' });

    const { error } = await supabase
      .from('exec_reports')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── Initiatives ───────────────────────────────────────────────────────────

async function handleInitiatives(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const { data: initiatives, error } = await supabase
      .from('initiatives')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

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

async function handleInitiativeById(req: VercelRequest, res: VercelResponse, id: number) {
  if (req.method === 'GET') {
    const { data: initiative, error } = await supabase
      .from('initiatives')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !initiative) return res.status(404).json({ error: 'Initiative not found' });

    const { data: projects } = await supabase
      .from('projects')
      .select('*')
      .eq('initiative_id', id)
      .order('created_at', { ascending: false });

    let ownerAgentName = null;
    if (initiative.owner_agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('name')
        .eq('id', initiative.owner_agent_id)
        .single();
      if (agent) ownerAgentName = agent.name;
    }

    return res.json({
      ...snakeToCamel(initiative),
      ownerAgentName,
      projects: snakeToCamel(projects || []),
    });
  }

  if (req.method === 'PATCH') {
    const { data: existing } = await supabase
      .from('initiatives')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Initiative not found' });

    const updates: Record<string, any> = {};
    const keyMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      status: 'status',
      ownerAgentId: 'owner_agent_id',
    };

    for (const [camelKey, snakeKey] of Object.entries(keyMap)) {
      if (req.body[camelKey] !== undefined) {
        updates[snakeKey] = req.body[camelKey];
      }
    }

    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('initiatives')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(updated));
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('initiatives')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Initiative not found' });

    const { error } = await supabase
      .from('initiatives')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── Projects ──────────────────────────────────────────────────────────────

async function handleProjects(req: VercelRequest, res: VercelResponse) {
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

async function handleProjectById(req: VercelRequest, res: VercelResponse, id: number) {
  if (req.method === 'GET') {
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !project) return res.status(404).json({ error: 'Project not found' });

    const { data: tasks } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false });

    const { data: jobs } = await supabase
      .from('agent_jobs')
      .select('*')
      .eq('project_id', id)
      .order('assigned_at', { ascending: false });

    let jobsWithAgentNames = jobs || [];
    if (jobsWithAgentNames.length > 0) {
      const agentIds = [...new Set(jobsWithAgentNames.map((j: any) => j.agent_id).filter(Boolean))];
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
        jobsWithAgentNames = jobsWithAgentNames.map((j: any) => ({
          ...j,
          agent_name: agentMap[j.agent_id] || null,
        }));
      }
    }

    return res.json({
      ...snakeToCamel(project),
      tasks: snakeToCamel(tasks || []),
      jobs: snakeToCamel(jobsWithAgentNames),
    });
  }

  if (req.method === 'PATCH') {
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const updates: Record<string, any> = {};
    const keyMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      status: 'status',
      ownerAgentId: 'owner_agent_id',
      initiativeId: 'initiative_id',
    };

    for (const [camelKey, snakeKey] of Object.entries(keyMap)) {
      if (req.body[camelKey] !== undefined) {
        updates[snakeKey] = req.body[camelKey];
      }
    }

    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(updated));
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleProjectTasks(req: VercelRequest, res: VercelResponse, projectId: number) {
  if (req.method === 'GET') {
    const { data: tasks, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const sorted = (tasks || []).sort((a: any, b: any) => {
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return res.json(snakeToCamel(sorted));
  }

  if (req.method === 'POST') {
    const { title, description, status, assignedAgentId, priority, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const { data: task, error } = await supabase
      .from('project_tasks')
      .insert({
        project_id: projectId,
        title,
        description: description || null,
        status: status || 'pending',
        assigned_agent_id: assignedAgentId || null,
        priority: priority || 'medium',
        due_date: dueDate || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(snakeToCamel(task));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleProjectJobs(req: VercelRequest, res: VercelResponse, projectId: number) {
  if (req.method === 'GET') {
    const { data: jobs, error } = await supabase
      .from('agent_jobs')
      .select('*')
      .eq('project_id', projectId)
      .order('assigned_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

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
        project_id: projectId,
        role,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(snakeToCamel(job));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── Jobs ──────────────────────────────────────────────────────────────────

async function handleJobById(req: VercelRequest, res: VercelResponse, id: number) {
  if (req.method === 'PATCH') {
    const { data: existing } = await supabase
      .from('agent_jobs')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Job not found' });

    const updates: Record<string, any> = {};
    if (req.body.role !== undefined) {
      updates.role = req.body.role;
    }

    const { data: updated, error } = await supabase
      .from('agent_jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(updated));
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('agent_jobs')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Job not found' });

    const { error } = await supabase
      .from('agent_jobs')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── Tasks ─────────────────────────────────────────────────────────────────

async function handleTaskById(req: VercelRequest, res: VercelResponse, id: number) {
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

// ─── Teams ─────────────────────────────────────────────────────────────────

async function handleTeams(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const { data: teams, error } = await supabase
      .from('teams')
      .select('*')
      .order('name', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const { data: agents } = await supabase
      .from('agents')
      .select('team_id');

    const countMap: Record<number, number> = {};
    if (agents) {
      for (const a of agents) {
        if (a.team_id) {
          countMap[a.team_id] = (countMap[a.team_id] || 0) + 1;
        }
      }
    }

    const teamsWithCount = (teams || []).map((t: any) => ({
      ...snakeToCamel(t),
      agentCount: countMap[t.id] || 0,
    }));

    return res.json(teamsWithCount);
  }

  if (req.method === 'POST') {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const { data: team, error } = await supabase
      .from('teams')
      .insert({
        name,
        description: description || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(snakeToCamel(team));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleTeamById(req: VercelRequest, res: VercelResponse, id: number) {
  if (req.method === 'GET') {
    const { data: team, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !team) return res.status(404).json({ error: 'Team not found' });

    const { data: agents } = await supabase
      .from('agents')
      .select('*')
      .eq('team_id', id)
      .order('name', { ascending: true });

    return res.json({
      ...snakeToCamel(team),
      agents: snakeToCamel(agents || []),
    });
  }

  if (req.method === 'PATCH') {
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Team not found' });

    const updates: Record<string, any> = {};
    const keyMap: Record<string, string> = {
      name: 'name',
      description: 'description',
    };

    for (const [camelKey, snakeKey] of Object.entries(keyMap)) {
      if (req.body[camelKey] !== undefined) {
        updates[snakeKey] = req.body[camelKey];
      }
    }

    const { data: updated, error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(updated));
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Team not found' });

    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── Users ─────────────────────────────────────────────────────────────────

async function handleUsers(req: VercelRequest, res: VercelResponse) {
  const admin = verifyAdmin(req);
  if (!admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, created_at')
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(data));
  }

  if (req.method === 'POST') {
    const { email, password, name, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        name: name || email.split('@')[0],
        role: role || 'member',
      })
      .select('id, email, name, role, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(snakeToCamel(user));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUserById(req: VercelRequest, res: VercelResponse, id: number) {
  const admin = verifyAdmin(req);
  if (!admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (req.method === 'PATCH') {
    const updates: Record<string, any> = {};
    const { name, email, role, password } = req.body;

    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email.toLowerCase().trim();
    if (role !== undefined) updates.role = role;
    if (password) {
      updates.password_hash = await bcrypt.hash(password, 10);
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, email, name, role, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(data));
  }

  if (req.method === 'DELETE') {
    if (id === admin.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── Workspace ─────────────────────────────────────────────────────────────

async function handleWorkspace(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const { data: workItems, error } = await supabase
      .from('work_items')
      .select('*, agents(name)')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

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

async function handleWorkspaceById(req: VercelRequest, res: VercelResponse, id: string) {
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

// ─── Automations ─────────────────────────────────────────────────────────

async function handleAutomations(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const { data: automations, error } = await supabase
      .from('automations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Get team names and assigned agents for each automation
    const teamIds = [...new Set((automations || []).map((a: any) => a.team_id).filter(Boolean))];
    let teamMap: Record<number, string> = {};
    if (teamIds.length > 0) {
      const { data: teams } = await supabase.from('teams').select('id, name').in('id', teamIds);
      if (teams) for (const t of teams) teamMap[t.id] = t.name;
    }

    const autoIds = (automations || []).map((a: any) => a.id);
    let agentsByAutomation: Record<number, any[]> = {};
    if (autoIds.length > 0) {
      const { data: links } = await supabase
        .from('automation_agents')
        .select('*')
        .in('automation_id', autoIds);
      if (links && links.length > 0) {
        const agentIds = [...new Set(links.map((l: any) => l.agent_id))];
        const { data: agents } = await supabase.from('agents').select('id, name, title, agent_type').in('id', agentIds);
        const agentMap: Record<number, any> = {};
        if (agents) for (const a of agents) agentMap[a.id] = a;
        for (const l of links) {
          if (!agentsByAutomation[l.automation_id]) agentsByAutomation[l.automation_id] = [];
          agentsByAutomation[l.automation_id].push({
            ...agentMap[l.agent_id],
            role: l.role,
            linkId: l.id,
          });
        }
      }
    }

    const result = (automations || []).map((a: any) => ({
      ...a,
      team_name: a.team_id ? teamMap[a.team_id] || null : null,
      agents: agentsByAutomation[a.id] || [],
    }));

    return res.json(snakeToCamel(result));
  }

  if (req.method === 'POST') {
    const { name, description, category, schedule, teamId, process: proc, inputLocation, outputLocation, agentIds } = req.body;

    if (!name) return res.status(400).json({ error: 'name is required' });

    const { data: automation, error } = await supabase
      .from('automations')
      .insert({
        name,
        description: description || null,
        category: category || 'general',
        schedule: schedule || null,
        team_id: teamId || null,
        process: proc || null,
        input_location: inputLocation || null,
        output_location: outputLocation || null,
        enabled: true,
        status: 'active',
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Link agents if provided
    if (agentIds && Array.isArray(agentIds) && agentIds.length > 0) {
      const links = agentIds.map((entry: any) => ({
        automation_id: automation.id,
        agent_id: typeof entry === 'object' ? entry.agentId : entry,
        role: typeof entry === 'object' ? entry.role || null : null,
      }));
      await supabase.from('automation_agents').insert(links);
    }

    return res.status(201).json(snakeToCamel(automation));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleAutomationById(req: VercelRequest, res: VercelResponse, id: number) {
  if (req.method === 'GET') {
    const { data: automation, error } = await supabase
      .from('automations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !automation) return res.status(404).json({ error: 'Automation not found' });

    let teamName = null;
    if (automation.team_id) {
      const { data: team } = await supabase.from('teams').select('name').eq('id', automation.team_id).single();
      if (team) teamName = team.name;
    }

    const { data: links } = await supabase
      .from('automation_agents')
      .select('*')
      .eq('automation_id', id);

    let agents: any[] = [];
    if (links && links.length > 0) {
      const agentIds = links.map((l: any) => l.agent_id);
      const { data: agentData } = await supabase.from('agents').select('id, name, title, agent_type').in('id', agentIds);
      const agentMap: Record<number, any> = {};
      if (agentData) for (const a of agentData) agentMap[a.id] = a;
      agents = links.map((l: any) => ({ ...agentMap[l.agent_id], role: l.role, linkId: l.id }));
    }

    return res.json(snakeToCamel({ ...automation, team_name: teamName, agents }));
  }

  if (req.method === 'PATCH') {
    const { data: existing } = await supabase.from('automations').select('id').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Automation not found' });

    const updates: Record<string, any> = {};
    const keyMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      category: 'category',
      status: 'status',
      schedule: 'schedule',
      teamId: 'team_id',
      process: 'process',
      inputLocation: 'input_location',
      outputLocation: 'output_location',
      enabled: 'enabled',
    };

    for (const [camelKey, snakeKey] of Object.entries(keyMap)) {
      if (req.body[camelKey] !== undefined) {
        updates[snakeKey] = req.body[camelKey];
      }
    }
    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('automations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(snakeToCamel(updated));
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase.from('automations').select('id').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Automation not found' });

    const { error } = await supabase.from('automations').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleAutomationAgents(req: VercelRequest, res: VercelResponse, automationId: number) {
  if (req.method === 'POST') {
    const { agentId, role } = req.body;
    if (!agentId) return res.status(400).json({ error: 'agentId is required' });

    const { data: link, error } = await supabase
      .from('automation_agents')
      .insert({ automation_id: automationId, agent_id: agentId, role: role || null })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(snakeToCamel(link));
  }

  if (req.method === 'DELETE') {
    const { agentId } = req.body;
    if (!agentId) return res.status(400).json({ error: 'agentId is required' });

    const { error } = await supabase
      .from('automation_agents')
      .delete()
      .eq('automation_id', automationId)
      .eq('agent_id', agentId);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleAutomationToggle(req: VercelRequest, res: VercelResponse, id: number) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { data: automation, error: fetchError } = await supabase
    .from('automations')
    .select('id, enabled')
    .eq('id', id)
    .single();

  if (fetchError || !automation) return res.status(404).json({ error: 'Automation not found' });

  const newEnabled = !automation.enabled;
  const { data: updated, error } = await supabase
    .from('automations')
    .update({ enabled: newEnabled, status: newEnabled ? 'active' : 'paused', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(snakeToCamel(updated));
}

// ─── CEO Chat (AI) ─────────────────────────────────────────────────────────

async function handleExecChat(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });

  // Save user message first
  await supabase.from('exec_messages').insert({ role: 'user', content: message });

  // Fetch recent conversation history
  const { data: history } = await supabase
    .from('exec_messages')
    .select('role, content')
    .order('created_at', { ascending: true })
    .limit(30);

  // Fetch agents and initiatives for CEO context
  const [{ data: agents }, { data: initiatives }] = await Promise.all([
    supabase.from('agents').select('id, name, title, agent_type, status, task'),
    supabase.from('initiatives').select('id, name, status'),
  ]);

  // Build Claude messages array from history (already includes the just-saved user message)
  const claudeMessages: Anthropic.MessageParam[] = (history || []).map((msg: any) => ({
    role: msg.role === 'ceo' ? 'assistant' : 'user',
    content: msg.content,
  }));

  const systemPrompt = `You are Nick Castle, the AI CEO of this company. You are strategic, decisive, and results-oriented. You lead with clarity and act with purpose.

You have visibility into the entire organization:
- Team Agents: ${JSON.stringify(agents?.map((a: any) => ({ id: a.id, name: a.name, title: a.title, type: a.agent_type, status: a.status, role: a.task })) || [])}
- Active Initiatives: ${JSON.stringify(initiatives?.map((i: any) => ({ id: i.id, name: i.name, status: i.status })) || [])}

When given direction or asked questions, think strategically. When action is needed, use your tools to create initiatives, projects, tasks, or assignments. Be concise and direct. When you take an action, briefly mention what you did. Address the user respectfully as the Board of Directors.`;

  const tools: Anthropic.Tool[] = [
    {
      name: 'get_company_status',
      description: 'Get a live overview of all agents, active initiatives, and pending tasks',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_initiative',
      description: 'Create a new strategic initiative for the company',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Initiative name' },
          description: { type: 'string', description: 'What this initiative aims to achieve' },
          ownerAgentId: { type: 'number', description: 'Optional agent ID to own this initiative' },
        },
        required: ['name', 'description'],
      },
    },
    {
      name: 'create_project',
      description: 'Create a project under an existing initiative',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          initiativeId: { type: 'number', description: 'ID of the parent initiative' },
          ownerAgentId: { type: 'number', description: 'Optional agent ID to own this project' },
        },
        required: ['name', 'description', 'initiativeId'],
      },
    },
    {
      name: 'create_task',
      description: 'Create an actionable task within a project and optionally assign it to an agent',
      input_schema: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          projectId: { type: 'number', description: 'ID of the parent project' },
          assignedAgentId: { type: 'number', description: 'Optional agent ID to assign this task to' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          dueDate: { type: 'string', description: 'Optional ISO date string (e.g. 2025-12-31)' },
        },
        required: ['title', 'description', 'projectId'],
      },
    },
    {
      name: 'create_assignment',
      description: 'Create a direct executive assignment for an agent',
      input_schema: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          assignedAgentId: { type: 'number', description: 'Optional agent ID' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        },
        required: ['title', 'description'],
      },
    },
  ];

  const anthropic = new Anthropic({ apiKey });
  const actionsTaken: string[] = [];

  let response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    tools,
    messages: claudeMessages,
  });

  // Agentic loop: process tool calls until end_turn
  while (response.stop_reason === 'tool_use') {
    const assistantContent = response.content;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantContent) {
      if (block.type !== 'tool_use') continue;

      const input = block.input as Record<string, any>;
      let result: string;

      if (block.name === 'get_company_status') {
        const [{ data: allAgents }, { data: allInitiatives }, { data: pendingTasks }] = await Promise.all([
          supabase.from('agents').select('id, name, title, status, agent_type'),
          supabase.from('initiatives').select('id, name, status'),
          supabase.from('project_tasks').select('id, title, status, assigned_agent_id').neq('status', 'completed').limit(20),
        ]);
        result = JSON.stringify({ agents: allAgents, initiatives: allInitiatives, pendingTasks });

      } else if (block.name === 'create_initiative') {
        const { data: initiative, error } = await supabase
          .from('initiatives')
          .insert({ name: input.name, description: input.description, status: 'active', owner_agent_id: input.ownerAgentId || null })
          .select().single();
        result = error ? `Error: ${error.message}` : `Initiative created: "${initiative.name}" (ID: ${initiative.id})`;
        if (!error) actionsTaken.push(`Created initiative: ${initiative.name}`);

      } else if (block.name === 'create_project') {
        const { data: project, error } = await supabase
          .from('projects')
          .insert({ initiative_id: input.initiativeId, name: input.name, description: input.description, status: 'planning', owner_agent_id: input.ownerAgentId || null })
          .select().single();
        result = error ? `Error: ${error.message}` : `Project created: "${project.name}" (ID: ${project.id})`;
        if (!error) actionsTaken.push(`Created project: ${project.name}`);

      } else if (block.name === 'create_task') {
        const { data: task, error } = await supabase
          .from('project_tasks')
          .insert({ project_id: input.projectId, title: input.title, description: input.description, status: 'todo', assigned_agent_id: input.assignedAgentId || null, priority: input.priority || 'medium', due_date: input.dueDate || null })
          .select().single();
        result = error ? `Error: ${error.message}` : `Task created: "${task.title}" (ID: ${task.id})`;
        if (!error) actionsTaken.push(`Created task: ${task.title}`);

      } else if (block.name === 'create_assignment') {
        const { data: assignment, error } = await supabase
          .from('exec_assignments')
          .insert({ title: input.title, description: input.description, status: 'pending', priority: input.priority || 'medium', assigned_agent_id: input.assignedAgentId || null })
          .select().single();
        result = error ? `Error: ${error.message}` : `Assignment created: "${assignment.title}" (ID: ${assignment.id})`;
        if (!error) actionsTaken.push(`Created assignment: ${assignment.title}`);

      } else {
        result = `Unknown tool: ${block.name}`;
      }

      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }

    claudeMessages.push({ role: 'assistant', content: assistantContent });
    claudeMessages.push({ role: 'user', content: toolResults });

    response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages: claudeMessages,
    });
  }

  const responseText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  // Save CEO response
  await supabase.from('exec_messages').insert({
    role: 'ceo',
    content: responseText,
    metadata: actionsTaken.length > 0 ? JSON.stringify({ actionsTaken }) : null,
  });

  return res.json({ response: responseText, actionsTaken });
}

// ─── Agent Run (AI) ─────────────────────────────────────────────────────────

async function handleAgentRun(req: VercelRequest, res: VercelResponse, agentId: number) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });

  const { data: agent, error: agentError } = await supabase
    .from('agents').select('*').eq('id', agentId).single();

  if (agentError || !agent) return res.status(404).json({ error: 'Agent not found' });

  const { data: tasks } = await supabase
    .from('project_tasks')
    .select('id, title, description, status, priority')
    .eq('assigned_agent_id', agentId)
    .neq('status', 'completed')
    .limit(10);

  const taskList = tasks && tasks.length > 0
    ? tasks.map((t: any) => `- [${t.status}] ${t.title}: ${t.description || 'No description'} (Priority: ${t.priority})`).join('\n')
    : 'No tasks currently assigned.';

  const systemPrompt = `You are ${agent.name}${agent.title ? `, ${agent.title}` : ''}. Your role: ${agent.task}.${agent.instructions ? `\n\nInstructions: ${agent.instructions}` : ''}

Current assigned tasks:
${taskList}

Provide a brief status update on your work. Be specific about what you are doing to move your tasks forward and identify any blockers.`;

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Provide your current status update.' }],
  });

  const responseText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  // Update agent to running, record heartbeat, then set back to idle
  await supabase.from('agents').update({ status: 'running', last_heartbeat: new Date().toISOString() }).eq('id', agentId);

  const { data: heartbeat } = await supabase
    .from('heartbeats')
    .insert({ agent_id: agentId, status: 'idle', message: responseText })
    .select().single();

  await supabase.from('status_events').insert({ agent_id: agentId, old_status: agent.status, new_status: 'idle' });
  await supabase.from('agents').update({ status: 'idle' }).eq('id', agentId);

  return res.json({ response: responseText, heartbeat: snakeToCamel(heartbeat) });
}

// ─── Main Router ───────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Parse the path from the URL (most reliable method)
  const urlPath = (req.url || '').split('?')[0];
  const path = urlPath.replace(/^\/api/, '') || '/';

  try {
    // ── Agents ───────────────────────────────────────────
    if (path === '/agents') {
      return handleAgents(req, res);
    }
    const agentMatch = path.match(/^\/agents\/(\d+)$/);
    if (agentMatch) {
      return handleAgentById(req, res, Number(agentMatch[1]));
    }
    const agentHeartbeatsMatch = path.match(/^\/agents\/(\d+)\/heartbeats$/);
    if (agentHeartbeatsMatch) {
      return handleAgentHeartbeats(req, res, Number(agentHeartbeatsMatch[1]));
    }
    const agentRunMatch = path.match(/^\/agents\/(\d+)\/run$/);
    if (agentRunMatch) {
      return handleAgentRun(req, res, Number(agentRunMatch[1]));
    }
    const agentEventsMatch = path.match(/^\/agents\/(\d+)\/events$/);
    if (agentEventsMatch) {
      return handleAgentEvents(req, res, Number(agentEventsMatch[1]));
    }

    // ── Auth ─────────────────────────────────────────────
    if (path === '/auth/login') {
      return handleAuthLogin(req, res);
    }
    if (path === '/auth/me') {
      return handleAuthMe(req, res);
    }

    // ── Heartbeat ────────────────────────────────────────
    if (path === '/heartbeat') {
      return handleHeartbeat(req, res);
    }

    // ── Stats ────────────────────────────────────────────
    if (path === '/stats') {
      return handleStats(req, res);
    }

    // ── Executive ────────────────────────────────────────
    if (path === '/executive/chat') {
      return handleExecChat(req, res);
    }
    if (path === '/executive/messages') {
      return handleExecMessages(req, res);
    }
    const execMessageMatch = path.match(/^\/executive\/messages\/(\d+)$/);
    if (execMessageMatch) {
      return handleExecMessageById(req, res, Number(execMessageMatch[1]));
    }
    if (path === '/executive/context') {
      return handleExecContext(req, res);
    }
    if (path === '/executive/assignments') {
      return handleExecAssignments(req, res);
    }
    const execAssignmentMatch = path.match(/^\/executive\/assignments\/(\d+)$/);
    if (execAssignmentMatch) {
      return handleExecAssignmentById(req, res, Number(execAssignmentMatch[1]));
    }
    if (path === '/executive/reports') {
      return handleExecReports(req, res);
    }
    const execReportMatch = path.match(/^\/executive\/reports\/(\d+)$/);
    if (execReportMatch) {
      return handleExecReportById(req, res, Number(execReportMatch[1]));
    }

    // ── Initiatives ──────────────────────────────────────
    if (path === '/initiatives') {
      return handleInitiatives(req, res);
    }
    const initiativeMatch = path.match(/^\/initiatives\/(\d+)$/);
    if (initiativeMatch) {
      return handleInitiativeById(req, res, Number(initiativeMatch[1]));
    }

    // ── Projects ─────────────────────────────────────────
    if (path === '/projects') {
      return handleProjects(req, res);
    }
    const projectTasksMatch = path.match(/^\/projects\/(\d+)\/tasks$/);
    if (projectTasksMatch) {
      return handleProjectTasks(req, res, Number(projectTasksMatch[1]));
    }
    const projectJobsMatch = path.match(/^\/projects\/(\d+)\/jobs$/);
    if (projectJobsMatch) {
      return handleProjectJobs(req, res, Number(projectJobsMatch[1]));
    }
    const projectMatch = path.match(/^\/projects\/(\d+)$/);
    if (projectMatch) {
      return handleProjectById(req, res, Number(projectMatch[1]));
    }

    // ── Jobs ─────────────────────────────────────────────
    const jobMatch = path.match(/^\/jobs\/(\d+)$/);
    if (jobMatch) {
      return handleJobById(req, res, Number(jobMatch[1]));
    }

    // ── Tasks ────────────────────────────────────────────
    const taskMatch = path.match(/^\/tasks\/(\d+)$/);
    if (taskMatch) {
      return handleTaskById(req, res, Number(taskMatch[1]));
    }

    // ── Teams ────────────────────────────────────────────
    if (path === '/teams') {
      return handleTeams(req, res);
    }
    const teamMatch = path.match(/^\/teams\/(\d+)$/);
    if (teamMatch) {
      return handleTeamById(req, res, Number(teamMatch[1]));
    }

    // ── Users ────────────────────────────────────────────
    if (path === '/users') {
      return handleUsers(req, res);
    }
    const userMatch = path.match(/^\/users\/(\d+)$/);
    if (userMatch) {
      return handleUserById(req, res, Number(userMatch[1]));
    }

    // ── Automations ─────────────────────────────────────
    if (path === '/automations') {
      return handleAutomations(req, res);
    }
    const automationToggleMatch = path.match(/^\/automations\/(\d+)\/toggle$/);
    if (automationToggleMatch) {
      return handleAutomationToggle(req, res, Number(automationToggleMatch[1]));
    }
    const automationAgentsMatch = path.match(/^\/automations\/(\d+)\/agents$/);
    if (automationAgentsMatch) {
      return handleAutomationAgents(req, res, Number(automationAgentsMatch[1]));
    }
    const automationMatch = path.match(/^\/automations\/(\d+)$/);
    if (automationMatch) {
      return handleAutomationById(req, res, Number(automationMatch[1]));
    }

    // ── Workspace ────────────────────────────────────────
    if (path === '/workspace') {
      return handleWorkspace(req, res);
    }
    const workspaceMatch = path.match(/^\/workspace\/(.+)$/);
    if (workspaceMatch) {
      return handleWorkspaceById(req, res, workspaceMatch[1]);
    }

    // ── 404 ──────────────────────────────────────────────
    return res.status(404).json({ error: `Route not found: /api${path}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
