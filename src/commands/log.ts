import { c } from '../lib/colors.js';
import { api } from '../lib/api.js';
import { parseDuration, formatDuration } from '../lib/format.js';
import { resolveProject } from '../lib/resolve.js';

interface LogOptions {
  project?: string;
  duration?: string;
  description?: string;
  start?: string;
  end?: string;
  rate?: string;
}

export async function logCommand(opts: LogOptions): Promise<void> {
  if (!opts.project) throw new Error('Project is required. Use --project <id|name>.');
  if (!opts.duration && !(opts.start && opts.end)) {
    throw new Error('Specify --duration <e.g. 1h30m>, OR both --start and --end.');
  }

  const project = await resolveProject(opts.project);

  let rateId: string | undefined;
  if (opts.rate) {
    const { rates } = await api.listRates();
    const found = rates.find((r) => r.id === opts.rate || r.name === opts.rate);
    if (!found) throw new Error(`Rate not found: ${opts.rate}`);
    rateId = found.id;
  }

  // If only --duration is given, anchor the entry at "now - duration" so the
  // entry's startTime/endTime are sensible (some reports filter by date).
  const now = new Date();
  const startTime = opts.start ? new Date(opts.start) : undefined;
  const endTime = opts.end ? new Date(opts.end) : undefined;
  const duration = opts.duration ? parseDuration(opts.duration) : undefined;

  const finalStart = startTime ?? (duration ? new Date(now.getTime() - duration * 60_000) : now);
  const payload = {
    projectId: project.id,
    description: opts.description,
    startTime: finalStart.toISOString(),
    ...(endTime ? { endTime: endTime.toISOString() } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(rateId ? { rateId } : {}),
  };

  const { entry } = await api.createEntry(payload);
  const minutes = entry.duration ?? duration ?? 0;
  const projectName = entry.project?.name ?? project.name;
  console.log(c.green('+ ') + `Logged ${formatDuration(minutes)} on ${c.bold(projectName)}`);
  if (opts.description) console.log(c.dim(`  Note: ${opts.description}`));
}
