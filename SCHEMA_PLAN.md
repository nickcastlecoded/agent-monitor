# Organizational Structure Schema Plan

## Hierarchy
- **Initiatives** → consist of **Projects** → consist of **Tasks**
- **Teams** → have **Agents** assigned to them
- **Agents** → are assigned **Jobs** (a job = a role on a specific project)
- **Roles** → define what an agent does within a project

## Tables

### teams
- id BIGSERIAL PRIMARY KEY
- name TEXT NOT NULL UNIQUE
- description TEXT
- created_at TIMESTAMPTZ DEFAULT now()

### initiatives
- id BIGSERIAL PRIMARY KEY
- name TEXT NOT NULL
- description TEXT
- status TEXT DEFAULT 'planning' (planning, active, completed, on_hold)
- owner_agent_id BIGINT REFERENCES agents(id) — which agent owns this initiative
- created_at TIMESTAMPTZ DEFAULT now()
- updated_at TIMESTAMPTZ DEFAULT now()

### projects
- id BIGSERIAL PRIMARY KEY
- initiative_id BIGINT REFERENCES initiatives(id) ON DELETE CASCADE
- name TEXT NOT NULL
- description TEXT
- status TEXT DEFAULT 'planning' (planning, active, completed, on_hold)
- owner_agent_id BIGINT REFERENCES agents(id) — project lead agent
- created_at TIMESTAMPTZ DEFAULT now()
- updated_at TIMESTAMPTZ DEFAULT now()

### project_tasks
- id BIGSERIAL PRIMARY KEY
- project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE
- title TEXT NOT NULL
- description TEXT
- status TEXT DEFAULT 'pending' (pending, in_progress, completed, blocked)
- assigned_agent_id BIGINT REFERENCES agents(id)
- priority TEXT DEFAULT 'medium' (low, medium, high, urgent)
- due_date TIMESTAMPTZ
- completed_at TIMESTAMPTZ
- created_at TIMESTAMPTZ DEFAULT now()

### agent_jobs (assigns agents to roles on projects)
- id BIGSERIAL PRIMARY KEY
- agent_id BIGINT REFERENCES agents(id) ON DELETE CASCADE
- project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE
- role TEXT NOT NULL (e.g., "Lead Researcher", "Content Writer", "Data Analyst")
- assigned_at TIMESTAMPTZ DEFAULT now()

### ALTER agents table
- ADD team_id BIGINT REFERENCES teams(id)
- ADD title TEXT (e.g., "AI CEO", "Research Analyst")
- ADD agent_type TEXT DEFAULT 'worker' (master, manager, worker)

## Default Teams
1. Executive
2. Operations
3. Finance
4. Communications
5. Marketing
6. Sales
7. Research
8. Support
9. Inventory Management

## Master Agent: "Nick Castle"
- name: "Nick Castle"
- title: "AI CEO"
- agent_type: "master"
- team_id: (Executive team id)
- description: "Chief Executive Officer — master orchestrator of all agents. Plans initiatives, recruits agent teams, and executes the board's directives."
- task: "Receive directives from the Board of Directors. Plan initiatives by asking clarifying questions until requirements are crystal clear. Determine what agents and teams are needed. Define what success looks like. Execute through delegation to sub-agents and team leads."
- instructions: "Order of operations: 1) Listen to Board directive. 2) Ask clarifying questions until you deeply understand the request. 3) Ask how the Board would like it done. 4) Ask what success looks like. 5) Plan the initiative/project/task hierarchy. 6) Recruit or assign agents to teams and roles. 7) Execute and report progress."
- status: "idle"
- schedule: "Always"
