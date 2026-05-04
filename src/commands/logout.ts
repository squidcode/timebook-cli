import { c } from '../lib/colors.js';
import { readConfig, writeConfig } from '../lib/config.js';

export async function logoutCommand(): Promise<void> {
  const config = await readConfig();
  if (!config.token) {
    console.log('Already logged out.');
    return;
  }
  // Keep apiUrl/webUrl preferences but drop everything auth-related.
  await writeConfig({
    apiUrl: config.apiUrl,
    webUrl: config.webUrl,
  });
  console.log(c.green('✓ ') + 'Logged out. Local token cleared.');
  console.log(
    c.dim('  Note: this only removes the token from this machine. Revoke it server-side at'),
  );
  console.log(c.dim(`  ${config.webUrl}/settings/api-tokens to fully invalidate it.`));
}
