import { c } from '../lib/colors.js';
import { api } from '../lib/api.js';
import { readConfig } from '../lib/config.js';

export async function whoamiCommand(): Promise<void> {
  const config = await readConfig();
  if (!config.token) {
    console.log('Not logged in. Run `timebook login`.');
    process.exitCode = 1;
    return;
  }
  const { user } = await api.me();
  console.log(c.bold(user.name) + c.dim(` <${user.email}>`));
  console.log(c.dim(`API: ${config.apiUrl}`));
  if (config.tokenName) {
    console.log(
      c.dim(`Token: ${config.tokenName}${config.tokenPrefix ? ` (${config.tokenPrefix}…)` : ''}`),
    );
  }
}
