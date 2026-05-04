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
import { resolveProject } from '../lib/resolve.js';
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
];

type ToolResult = CallToolResult;

const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

const err = (message: string): ToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

async function ensureLoggedIn(): Promise<void> {
  const config = await readConfig();
  if (!config.token) {
    throw new Error(
      'Timebook CLI is not authenticated on this machine. Run `timebook login` in a terminal first.',
    );
  }
}

async function handleTool(name: string, args: unknown): Promise<ToolResult> {
  try {
    await ensureLoggedIn();

    switch (name) {
      case 'whoami': {
        const { user } = await api.me();
        return ok(user);
      }
      case 'list_projects': {
        const { projects } = await api.listProjects();
        return ok(projects);
      }
      case 'list_clients': {
        const { clients } = await api.listClients();
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
        return ok(entries.slice(0, limit));
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
    return err(e instanceof Error ? e.message : String(e));
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
