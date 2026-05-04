import { mkdir, readFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import envPaths from 'env-paths';

const paths = envPaths('timebook', { suffix: '' });

export const CONFIG_DIR = paths.config;
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface StoredConfig {
  apiUrl: string;
  webUrl: string;
  token?: string;
  tokenName?: string;
  tokenPrefix?: string;
  tokenId?: string;
  scopeClientIds?: string[];
  scopeProjectIds?: string[];
  user?: { id: string; email: string; name: string };
  createdAt?: string;
}

// Production serves both the React app and the JSON API from the same
// origin (`usetimebook.com/api/*`). There is no `api.usetimebook.com`
// subdomain, so the API URL defaults to the same host as the web URL.
const DEFAULT_CONFIG: StoredConfig = {
  apiUrl: process.env.TIMEBOOK_API_URL ?? 'https://usetimebook.com',
  webUrl: process.env.TIMEBOOK_WEB_URL ?? 'https://usetimebook.com',
};

export async function readConfig(): Promise<StoredConfig> {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(config: StoredConfig): Promise<void> {
  await mkdir(dirname(CONFIG_FILE), { recursive: true, mode: 0o700 });
  // Write with restrictive perms BEFORE the data lands on disk.
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  // chmod again in case the file already existed with looser perms.
  await chmod(CONFIG_FILE, 0o600);
}

export async function clearConfig(): Promise<void> {
  if (existsSync(CONFIG_FILE)) {
    await unlink(CONFIG_FILE);
  }
}

export async function requireToken(): Promise<{ token: string; config: StoredConfig }> {
  const config = await readConfig();
  if (!config.token) {
    throw new Error('Not logged in. Run `timebook login` first.');
  }
  return { token: config.token, config };
}
