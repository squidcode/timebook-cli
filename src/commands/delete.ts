import { c } from '../lib/colors.js';
import { api, ApiError } from '../lib/api.js';

/**
 * Delete a single time entry. Server enforces:
 *   - entry isn't locked (i.e., not on a sent invoice)
 *   - the API token created this entry (or session/admin)
 */
export async function deleteCommand(id: string): Promise<void> {
  try {
    await api.deleteEntry(id);
    console.log(c.green('✓ ') + `Deleted entry ${c.bold(id)}.`);
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
