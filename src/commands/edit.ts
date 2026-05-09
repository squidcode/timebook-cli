import { c } from '../lib/colors.js';
import { api, ApiError } from '../lib/api.js';
import { parseDuration, formatDuration } from '../lib/format.js';
import { resolveProject } from '../lib/resolve.js';

interface EditOptions {
  description?: string;
  duration?: string;
  start?: string;
  end?: string;
  project?: string;
  rate?: string;
}

/**
 * Edit one or more fields on an existing entry. Any combination of flags is
 * accepted — fields you don't pass are left as-is by the backend.
 *
 * Authorship rule (server-enforced): the API token must have created the
 * entry, OR the caller is an admin, OR the request is JWT-session (web UI).
 * If denied, the backend returns 403 with a helpful hint.
 */
export async function editCommand(id: string, opts: EditOptions): Promise<void> {
  if (
    opts.description === undefined &&
    !opts.duration &&
    !opts.start &&
    !opts.end &&
    !opts.project &&
    !opts.rate
  ) {
    throw new Error(
      'Nothing to update. Pass at least one of --description, --duration, --start, --end, --project, --rate.',
    );
  }

  const payload: Record<string, unknown> = {};
  if (opts.description !== undefined) payload.description = opts.description;
  if (opts.duration) payload.duration = parseDuration(opts.duration);
  if (opts.start) payload.startTime = new Date(opts.start).toISOString();
  if (opts.end) payload.endTime = new Date(opts.end).toISOString();
  if (opts.project) {
    const project = await resolveProject(opts.project);
    payload.projectId = project.id;
  }
  if (opts.rate) {
    const { rates } = await api.listRates();
    const found = rates.find((r) => r.id === opts.rate || r.name === opts.rate);
    if (!found) throw new Error(`Rate not found: ${opts.rate}`);
    payload.rateId = found.id;
  }

  try {
    const { entry } = await api.updateEntry(id, payload);
    const minutes = entry.duration ?? 0;
    const projectName = entry.project?.name ?? entry.projectId;
    console.log(c.green('✓ ') + `Updated ${c.bold(projectName)} — ${formatDuration(minutes)}`);
    if (entry.description) console.log(c.dim(`  Note: ${entry.description}`));
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      console.error(c.red('✗ ') + err.message);
      process.exitCode = 1;
      return;
    }
    if (err instanceof ApiError && err.status === 404) {
      console.error(c.red('✗ ') + `Entry ${id} not found.`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}
