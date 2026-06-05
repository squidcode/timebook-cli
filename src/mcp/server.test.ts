// Cold-start hints + create tools — mirror of the hosted MCP server's
// behavior (timebook repo backend/src/mcp/tools-coldstart.test.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/api.js', () => ({
  api: {
    me: vi.fn(),
    listProjects: vi.fn(),
    listClients: vi.fn(),
    listEntries: vi.fn(),
    listRates: vi.fn(),
    createClient: vi.fn(),
    createProject: vi.fn(),
    activeTimer: vi.fn(),
    startTimer: vi.fn(),
    stopTimer: vi.fn(),
    logTime: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('../lib/config.js', () => ({
  readConfig: vi.fn(async () => ({ token: 'tbk_test' })),
}));

import { handleTool, COLD_START_HINTS } from './server.js';
import { api } from '../lib/api.js';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const textOf = (result: any): string =>
  (result.content ?? []).map((c: any) => c.text ?? '').join('\n');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cold-start hints', () => {
  it('list_clients empty → create_client hint', async () => {
    mocked.listClients.mockResolvedValue({ clients: [] });
    const res = await handleTool('list_clients', {});
    expect(res.isError).not.toBe(true);
    expect(textOf(res)).toContain(COLD_START_HINTS.noClients);
  });

  it('list_clients with data → no hint', async () => {
    mocked.listClients.mockResolvedValue({ clients: [{ id: 'c1', name: 'Acme' }] });
    const res = await handleTool('list_clients', {});
    expect(textOf(res)).not.toContain('create_client (just a name');
  });

  it('list_projects empty + no clients → client-first hint', async () => {
    mocked.listProjects.mockResolvedValue({ projects: [] });
    mocked.listClients.mockResolvedValue({ clients: [] });
    const res = await handleTool('list_projects', {});
    expect(textOf(res)).toContain(COLD_START_HINTS.noClients);
  });

  it('list_projects empty + clients exist → project hint', async () => {
    mocked.listProjects.mockResolvedValue({ projects: [] });
    mocked.listClients.mockResolvedValue({ clients: [{ id: 'c1', name: 'Acme' }] });
    const res = await handleTool('list_projects', {});
    expect(textOf(res)).toContain(COLD_START_HINTS.noProjects);
  });

  it('list_entries empty on a set-up account → entries hint', async () => {
    mocked.listEntries.mockResolvedValue({ entries: [] });
    mocked.listClients.mockResolvedValue({ clients: [{ id: 'c1' }] });
    mocked.listProjects.mockResolvedValue({ projects: [{ id: 'p1', name: 'X' }] });
    const res = await handleTool('list_entries', {});
    expect(textOf(res)).toContain(COLD_START_HINTS.noEntries);
  });

  it('list_entries empty on an EMPTY account → client-first hint', async () => {
    mocked.listEntries.mockResolvedValue({ entries: [] });
    mocked.listClients.mockResolvedValue({ clients: [] });
    mocked.listProjects.mockResolvedValue({ projects: [] });
    const res = await handleTool('list_entries', {});
    expect(textOf(res)).toContain(COLD_START_HINTS.noClients);
  });

  it('start_timer project-not-found on empty account → setup guidance', async () => {
    mocked.listProjects.mockResolvedValue({ projects: [] });
    mocked.listClients.mockResolvedValue({ clients: [] });
    const res = await handleTool('start_timer', { project: 'Website' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Project not found: Website');
    expect(textOf(res)).toContain(COLD_START_HINTS.noClients);
  });

  it('project-not-found on a populated account stays a plain error', async () => {
    mocked.listProjects.mockResolvedValue({ projects: [{ id: 'p1', name: 'Other' }] });
    mocked.listClients.mockResolvedValue({ clients: [{ id: 'c1', name: 'Acme' }] });
    const res = await handleTool('start_timer', { project: 'Website' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).not.toContain('create_client');
  });
});

describe('create_client', () => {
  it('creates and returns the next-step hint', async () => {
    mocked.createClient.mockResolvedValue({ client: { id: 'c9', name: 'Acme' } });
    const res = await handleTool('create_client', { name: 'Acme' });
    expect(res.isError).not.toBe(true);
    expect(mocked.createClient).toHaveBeenCalledWith({ name: 'Acme' });
    expect(textOf(res)).toContain('create_project');
  });

  it('passes the optional email through', async () => {
    mocked.createClient.mockResolvedValue({ client: { id: 'c9' } });
    await handleTool('create_client', { name: 'Acme', email: 'a@acme.com' });
    expect(mocked.createClient).toHaveBeenCalledWith({ name: 'Acme', email: 'a@acme.com' });
  });

  it('rejects a missing name via zod', async () => {
    const res = await handleTool('create_client', {});
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Invalid arguments');
  });
});

describe('create_project', () => {
  it('resolves the client by exact name', async () => {
    mocked.listClients.mockResolvedValue({ clients: [{ id: 'c1', name: 'Acme' }] });
    mocked.createProject.mockResolvedValue({ project: { id: 'p9', name: 'Website' } });
    const res = await handleTool('create_project', { name: 'Website', client: 'Acme' });
    expect(res.isError).not.toBe(true);
    expect(mocked.createProject).toHaveBeenCalledWith({ name: 'Website', clientId: 'c1' });
    expect(textOf(res)).toContain('start_timer');
  });

  it('unknown client on an empty account → client-first guidance', async () => {
    mocked.listClients.mockResolvedValue({ clients: [] });
    const res = await handleTool('create_project', { name: 'Website', client: 'Acme' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain(COLD_START_HINTS.noClients);
  });

  it('rejects missing fields via zod', async () => {
    expect((await handleTool('create_project', { name: 'X' })).isError).toBe(true);
    expect((await handleTool('create_project', { client: 'X' })).isError).toBe(true);
  });
});
