import { readConfig, requireToken, type StoredConfig } from './config.js';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { token, config } = await requireToken();
  return rawRequest<T>(config, token, path, opts);
}

async function rawRequest<T>(
  config: StoredConfig,
  token: string | undefined,
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : `${config.apiUrl}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    // Node's undici throws a bare `TypeError: fetch failed` and stashes the
    // real reason (DNS, ECONNREFUSED, cert errors, …) on `cause`. Surface
    // both so users can tell a misconfigured API URL from a real outage.
    const cause = (err as { cause?: unknown }).cause;
    const reason =
      cause && typeof cause === 'object'
        ? ((cause as { code?: string }).code ?? (cause as Error).message ?? '')
        : '';
    throw new Error(
      `Network error reaching ${url.origin}${reason ? ` (${reason})` : ''}. ` +
        `Check TIMEBOOK_API_URL or your connection.`,
      { cause: err },
    );
  }

  const text = await res.text();
  let data: unknown = undefined;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : null) ?? `HTTP ${res.status} ${res.statusText}`;
    throw new ApiError(res.status, data, message);
  }
  return data as T;
}

// Domain types — kept intentionally loose; backend evolves and we don't want to
// pin every field here. Only the fields the CLI actually reads are listed.
export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  theme?: string;
}

export interface Client {
  id: string;
  name: string;
  email?: string;
  archived?: boolean;
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  archived?: boolean;
  client?: { id: string; name: string };
}

export interface Rate {
  id: string;
  name: string;
  hourlyRate: number;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  description?: string | null;
  startTime: string;
  endTime?: string | null;
  duration?: number | null;
  isRunning: boolean;
  hourlyRate?: number | null;
  project?: Project;
}

export const api = {
  me: () => request<{ user: User }>('/api/auth/me'),
  listClients: () => request<{ clients: Client[] }>('/api/clients'),
  listProjects: () => request<{ projects: Project[] }>('/api/projects'),
  listRates: () => request<{ rates: Rate[] }>('/api/rates'),
  activeTimer: () => request<{ entry: TimeEntry | null }>('/api/time-entries/active'),
  startTimer: (input: { projectId: string; description?: string; rateId?: string }) =>
    request<{ entry: TimeEntry; stoppedEntry: { id: string } | null }>('/api/time-entries/start', {
      method: 'POST',
      body: input,
    }),
  stopTimer: () =>
    request<{ entry: TimeEntry }>('/api/time-entries/stop', { method: 'POST', body: {} }),
  createEntry: (input: {
    projectId: string;
    description?: string;
    startTime: string;
    endTime?: string;
    duration?: number;
    rateId?: string;
  }) => request<{ entry: TimeEntry }>('/api/time-entries', { method: 'POST', body: input }),
  listEntries: (
    query: {
      projectId?: string;
      clientId?: string;
      startDate?: string;
      endDate?: string;
      invoiced?: boolean;
    } = {},
  ) => request<{ entries: TimeEntry[] }>('/api/time-entries', { query }),
  updateEntry: (
    id: string,
    input: Partial<{
      projectId: string;
      description: string | null;
      startTime: string;
      endTime: string;
      duration: number;
      rateId: string | null;
    }>,
  ) =>
    request<{ entry: TimeEntry }>(`/api/time-entries/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
    }),
  deleteEntry: (id: string) =>
    request<{ message: string }>(`/api/time-entries/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};

// For login flow: validate a freshly-obtained token before storing it.
export async function verifyToken(config: StoredConfig, token: string): Promise<User> {
  const result = await rawRequest<{ user: User }>(config, token, '/api/auth/me');
  return result.user;
}

export async function getApiUrl(): Promise<string> {
  const config = await readConfig();
  return config.apiUrl;
}
