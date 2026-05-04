import { c } from '../lib/colors.js';
import { api } from '../lib/api.js';
import { resolveProject } from '../lib/resolve.js';

interface StartOptions {
  project?: string;
  description?: string;
  rate?: string;
}

export async function startCommand(opts: StartOptions): Promise<void> {
  if (!opts.project) {
    throw new Error('Project is required. Use --project <id|name>.');
  }
  const project = await resolveProject(opts.project);

  let rateId: string | undefined;
  if (opts.rate) {
    const { rates } = await api.listRates();
    const found = rates.find((r) => r.id === opts.rate || r.name === opts.rate);
    if (!found) throw new Error(`Rate not found: ${opts.rate}`);
    rateId = found.id;
  }

  const result = await api.startTimer({
    projectId: project.id,
    description: opts.description,
    rateId,
  });

  if (result.stoppedEntry) {
    console.log(
      c.yellow('• ') + c.dim(`Stopped previously running timer (${result.stoppedEntry.id})`),
    );
  }
  const projectName = result.entry.project?.name ?? project.name;
  console.log(c.green('▶ ') + `Started timer on ${c.bold(projectName)}`);
  if (opts.description) console.log(c.dim(`  Note: ${opts.description}`));
}
