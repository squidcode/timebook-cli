import { c } from '../lib/colors.js';
import { api } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';

export async function statusCommand(): Promise<void> {
  const { entry } = await api.activeTimer();
  if (!entry) {
    console.log('No active timer.');
    return;
  }
  const elapsedMs = Date.now() - new Date(entry.startTime).getTime();
  const elapsedMin = Math.round(elapsedMs / 60000);
  const projectName = entry.project?.name ?? entry.projectId;
  const clientName = entry.project?.client?.name;
  console.log(c.green('● ') + c.bold(projectName) + (clientName ? c.dim(` — ${clientName}`) : ''));
  console.log(c.dim(`  Started ${new Date(entry.startTime).toLocaleString()}`));
  console.log(c.dim(`  Elapsed ${formatDuration(elapsedMin)}`));
  if (entry.description) console.log(c.dim(`  Note: ${entry.description}`));
}
