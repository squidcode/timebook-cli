import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { api, ApiError } from '../lib/api.js';
import { readConfig } from '../lib/config.js';
import { resolveClient, resolveProject } from '../lib/resolve.js';
import { parseDuration } from '../lib/format.js';

const pkg = createRequire(import.meta.url)('../../package.json') as { version: string };

const DEFAULT_ENTRY_LIMIT = 50;

// Each tool's input schema is described twice: once as a Zod schema for runtime
// validation (parse the args before calling the API), once as JSON Schema for
// the MCP `tools/list` response (clients show this to the model).

const startTimerInput = z.object({
  project: z.string().describe('Project id or exact name'),
  description: z.string().optional(),
  rate: z.string().optional().describe('Rate id or exact name'),
});

const logTimeInput = z.object({
  project: z.string().describe('Project id or exact name'),
  description: z.string().optional(),
  duration: z
    .string()
    .optional()
    .describe('Length, e.g. "1h", "45m", "1h30m", "1.5h", "1:30", or "90" (minutes)'),
  startTime: z.string().optional().describe('ISO-8601 start time'),
  endTime: z.string().optional().describe('ISO-8601 end time'),
  rate: z.string().optional(),
});

const listEntriesInput = z.object({
  project: z.string().optional(),
  startDate: z.string().optional().describe('ISO-8601 earliest start time'),
  endDate: z.string().optional().describe('ISO-8601 latest start time'),
  limit: z.number().int().min(1).max(500).optional(),
});

const updateEntryInput = z.object({
  id: z.string().describe('Entry id (uuid) returned by list_entries.'),
  description: z
    .string()
    .nullable()
    .optional()
    .describe('Set the entry note. Pass an empty string or null to clear.'),
  duration: z
    .string()
    .optional()
    .describe(
      'New duration, e.g. "1h30m" or "45m". If set without start/end, only duration moves.',
    ),
  startTime: z.string().optional().describe('New start time (ISO-8601).'),
  endTime: z.string().optional().describe('New end time (ISO-8601).'),
  project: z.string().optional().describe('Reassign the entry to another project (id or name).'),
  rate: z.string().optional().describe('Switch billable rate (id or name).'),
});

const createClientInput = z.object({
  name: z.string().min(1, '`name` is required'),
  email: z.string().optional(),
});

const createProjectInput = z.object({
  name: z.string().min(1, '`name` is required'),
  client: z.string().min(1, '`client` is required (id or exact name)'),
  description: z.string().optional(),
});

const deleteEntryInput = z.object({
  id: z.string().describe('Entry id (uuid) to delete.'),
});

const TOOLS: Tool[] = [
  {
    name: 'whoami',
    description: 'Return the currently authenticated Timebook user (id, email, name).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'list_projects',
    description:
      'List all projects available to the current token. Returns id, name, and client for each project.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'list_clients',
    description: 'List all clients available to the current token.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'get_active_timer',
    description:
      'Return the currently running timer (project, description, started_at), or null if no timer is running.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'start_timer',
    description:
      'Start a timer on a project. Stops any other running timer first — Timebook allows only one active timer at a time.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project id (UUID) or exact project name. Use list_projects to discover.',
        },
        description: {
          type: 'string',
          description: 'What the user is working on (visible in the time entry).',
        },
        rate: {
          type: 'string',
          description: 'Optional rate id (UUID) or exact rate name (e.g. "Software Development").',
        },
      },
      required: ['project'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'stop_timer',
    description:
      'Stop the currently running timer. Returns { stopped: false } if no timer was running.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'log_time',
    description:
      'Log a manual (past) time entry. Provide either `duration` (relative to now), or both `startTime` and `endTime` (absolute ISO-8601 timestamps).',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project id (UUID) or exact project name.',
        },
        description: {
          type: 'string',
          description: 'What the user worked on.',
        },
        duration: {
          type: 'string',
          description:
            'How long the work took. Accepts "1h", "45m", "1h30m", "1.5h", "1:30", or "90" (interpreted as minutes).',
        },
        startTime: {
          type: 'string',
          description:
            'ISO-8601 start time (e.g. "2026-05-04T09:00:00Z"). Required if duration is omitted.',
        },
        endTime: {
          type: 'string',
          description: 'ISO-8601 end time. Required if duration is omitted.',
        },
        rate: {
          type: 'string',
          description: 'Optional rate id or exact rate name (e.g. "Software Development").',
        },
      },
      required: ['project'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'list_entries',
    description: `List recent time entries, optionally filtered by project and/or date range. Returns at most ${DEFAULT_ENTRY_LIMIT} entries by default; pass a higher \`limit\` to see more.`,
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Optional project id or exact name. Omit to list across all projects.',
        },
        startDate: {
          type: 'string',
          description: 'ISO-8601 — only entries whose start time is on or after this.',
        },
        endDate: {
          type: 'string',
          description: 'ISO-8601 — only entries whose start time is on or before this.',
        },
        limit: {
          type: 'integer',
          description: `Maximum number of entries to return. Defaults to ${DEFAULT_ENTRY_LIMIT}.`,
          minimum: 1,
          maximum: 500,
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'update_entry',
    description:
      'Edit one or more fields on an existing time entry. Any combination is valid; unset fields are left as-is. Server-enforced authorship rule: this token can only edit entries it created itself (sessions and admins bypass).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry id (uuid).' },
        description: {
          type: ['string', 'null'],
          description: 'New description / note. Pass empty string or null to clear.',
        },
        duration: {
          type: 'string',
          description: 'New duration, e.g. "1h30m" or "45m".',
        },
        startTime: { type: 'string', description: 'ISO-8601 start time.' },
        endTime: { type: 'string', description: 'ISO-8601 end time.' },
        project: { type: 'string', description: 'Reassign — project id or name.' },
        rate: { type: 'string', description: 'New rate — id or name.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'delete_entry',
    description:
      'Delete a time entry. Server enforces: not invoiced, and either this token created it or the caller is an admin / web session.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry id (uuid).' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  // Cold-start tools: mirror of the hosted MCP server (backend
  // src/mcp/tools.ts) so agent-first setup works over stdio too.
  {
    name: 'create_client',
    description:
      'Create a client (the person/company you bill). Needed before any project or time entry can exist. Typical first step on a fresh account.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Client name, e.g. 'Acme Corp'." },
        email: { type: 'string', description: 'Optional billing/contact email.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'create_project',
    description:
      'Create a project under a client. Time entries are always tracked against a project. Typical second step on a fresh account, after create_client.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Project name, e.g. 'Website redesign'." },
        client: { type: 'string', description: 'Client - id or exact name.' },
        description: { type: 'string', description: 'Optional project description.' },
      },
      required: ['name', 'client'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
];

type ToolResult = CallToolResult;

const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

const err = (message: string): ToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

// Like ok(), plus a guidance line the agent can act on (mirrors the hosted
// MCP server's cold-start behavior — keep the wording in sync with
// backend/src/mcp/tools.ts in the timebook repo).
const okWithHint = (data: unknown, hint: string): ToolResult => ({
  content: [
    { type: 'text', text: JSON.stringify(data, null, 2) },
    { type: 'text', text: hint },
  ],
});

export const COLD_START_HINTS = {
  noClients:
    'This account has no clients yet. Create one with create_client (just a name is enough), then add a project with create_project — after that you can start timers and log time.',
  noProjects:
    'There are clients but no projects yet. Create one with create_project (name + client), then you can start timers and log time against it.',
  noEntries:
    'No time entries yet. Start a timer with start_timer or log past work with log_time (both need a project).',
} as const;

async function coldStartHintFor(emptyWhat: 'projects' | 'entries'): Promise<string> {
  try {
    const [{ clients }, { projects }] = await Promise.all([api.listClients(), api.listProjects()]);
    if (clients.length === 0) return COLD_START_HINTS.noClients;
    if (projects.length === 0) return COLD_START_HINTS.noProjects;
  } catch {
    // Counting failed — fall through to the generic hint for the surface.
  }
  return emptyWhat === 'entries' ? COLD_START_HINTS.noEntries : COLD_START_HINTS.noProjects;
}

async function ensureLoggedIn(): Promise<void> {
  const config = await readConfig();
  if (!config.token) {
    throw new Error(
      'Timebook CLI is not authenticated on this machine. Run `timebook login` in a terminal first.',
    );
  }
}

export async function handleTool(name: string, args: unknown): Promise<ToolResult> {
  try {
    await ensureLoggedIn();

    switch (name) {
      case 'whoami': {
        const { user } = await api.me();
        return ok(user);
      }
      case 'list_projects': {
        const { projects } = await api.listProjects();
        if (projects.length === 0) return okWithHint(projects, await coldStartHintFor('projects'));
        return ok(projects);
      }
      case 'list_clients': {
        const { clients } = await api.listClients();
        if (clients.length === 0) return okWithHint(clients, COLD_START_HINTS.noClients);
        return ok(clients);
      }
      case 'get_active_timer': {
        const { entry } = await api.activeTimer();
        return ok(entry);
      }
      case 'start_timer': {
        const input = startTimerInput.parse(args ?? {});
        const project = await resolveProject(input.project);
        let rateId: string | undefined;
        if (input.rate) {
          const { rates } = await api.listRates();
          const found = rates.find((r) => r.id === input.rate || r.name === input.rate);
          if (!found) return err(`Rate not found: ${input.rate}`);
          rateId = found.id;
        }
        const result = await api.startTimer({
          projectId: project.id,
          description: input.description,
          rateId,
        });
        return ok(result);
      }
      case 'stop_timer': {
        try {
          const result = await api.stopTimer();
          return ok(result);
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            return ok({ stopped: false, reason: 'No active timer' });
          }
          throw e;
        }
      }
      case 'log_time': {
        const input = logTimeInput.parse(args ?? {});
        if (!input.duration && !(input.startTime && input.endTime)) {
          return err('Provide either `duration`, or both `startTime` and `endTime`.');
        }
        const project = await resolveProject(input.project);
        let rateId: string | undefined;
        if (input.rate) {
          const { rates } = await api.listRates();
          const found = rates.find((r) => r.id === input.rate || r.name === input.rate);
          if (!found) return err(`Rate not found: ${input.rate}`);
          rateId = found.id;
        }
        const duration = input.duration ? parseDuration(input.duration) : undefined;
        const startTime = input.startTime
          ? new Date(input.startTime)
          : duration
            ? new Date(Date.now() - duration * 60_000)
            : new Date();
        const result = await api.createEntry({
          projectId: project.id,
          description: input.description,
          startTime: startTime.toISOString(),
          ...(input.endTime ? { endTime: new Date(input.endTime).toISOString() } : {}),
          ...(duration !== undefined ? { duration } : {}),
          ...(rateId ? { rateId } : {}),
        });
        return ok(result);
      }
      case 'list_entries': {
        const input = listEntriesInput.parse(args ?? {});
        let projectId: string | undefined;
        if (input.project) {
          const project = await resolveProject(input.project);
          projectId = project.id;
        }
        const { entries } = await api.listEntries({
          projectId,
          startDate: input.startDate,
          endDate: input.endDate,
        });
        const limit = input.limit ?? DEFAULT_ENTRY_LIMIT;
        if (entries.length === 0) return okWithHint(entries, await coldStartHintFor('entries'));
        return ok(entries.slice(0, limit));
      }
      case 'update_entry': {
        const input = updateEntryInput.parse(args ?? {});
        const payload: Record<string, unknown> = {};
        if (input.description !== undefined) payload.description = input.description;
        if (input.duration) payload.duration = parseDuration(input.duration);
        if (input.startTime) payload.startTime = new Date(input.startTime).toISOString();
        if (input.endTime) payload.endTime = new Date(input.endTime).toISOString();
        if (input.project) {
          const project = await resolveProject(input.project);
          payload.projectId = project.id;
        }
        if (input.rate) {
          const { rates } = await api.listRates();
          const found = rates.find((r) => r.id === input.rate || r.name === input.rate);
          if (!found) return err(`Rate not found: ${input.rate}`);
          payload.rateId = found.id;
        }
        if (Object.keys(payload).length === 0) {
          return err(
            'Nothing to update. Pass at least one of description, duration, startTime, endTime, project, rate.',
          );
        }
        const result = await api.updateEntry(input.id, payload);
        return ok(result);
      }
      case 'delete_entry': {
        const input = deleteEntryInput.parse(args ?? {});
        const result = await api.deleteEntry(input.id);
        return ok(result);
      }
      case 'create_client': {
        const input = createClientInput.parse(args ?? {});
        const { client } = await api.createClient({
          name: input.name,
          ...(input.email ? { email: input.email } : {}),
        });
        return okWithHint(
          client,
          'Client created. Next: create_project (name + this client), then start_timer or log_time.',
        );
      }
      case 'create_project': {
        const input = createProjectInput.parse(args ?? {});
        const client = await resolveClient(input.client);
        const { project } = await api.createProject({
          name: input.name,
          clientId: client.id,
          ...(input.description ? { description: input.description } : {}),
        });
        return okWithHint(
          project,
          'Project created. You can now start_timer or log_time against it.',
        );
      }
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return err(`Invalid arguments: ${e.errors.map((x) => x.message).join('; ')}`);
    }
    if (e instanceof ApiError) {
      return err(`API error (${e.status}): ${e.message}`);
    }
    const message = e instanceof Error ? e.message : String(e);
    // Cold-start enrichment: "not found" on a fresh account usually means
    // nothing exists yet — tell the agent how to fix that instead of
    // leaving it to guess.
    if (/^Project not found:/.test(message) || /^Client not found:/.test(message)) {
      try {
        const { clients } = await api.listClients();
        if (clients.length === 0) return err(`${message}. ${COLD_START_HINTS.noClients}`);
        if (/^Project not found:/.test(message)) {
          const { projects } = await api.listProjects();
          if (projects.length === 0) return err(`${message}. ${COLD_START_HINTS.noProjects}`);
        }
      } catch {
        // fall through to the plain error
      }
    }
    return err(message);
  }
}

export async function runMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'timebook', version: pkg.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const result = await handleTool(req.params.name, req.params.arguments);
    return result;
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // The transport keeps the process alive on stdin; nothing to await here.
}
