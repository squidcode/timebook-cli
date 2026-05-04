import { c } from '../lib/colors.js';
import { api, ApiError } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';

export async function stopCommand(): Promise<void> {
  try {
    const { entry } = await api.stopTimer();
    const minutes = entry.duration ?? 0;
    const projectName = entry.project?.name ?? entry.projectId;
    console.log(c.green('■ ') + `Stopped ${c.bold(projectName)} — ${formatDuration(minutes)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      console.log('No active timer.');
      return;
    }
    throw err;
  }
}
