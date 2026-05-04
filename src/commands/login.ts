import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { AddressInfo } from 'node:net';
import open from 'open';
import { c } from '../lib/colors.js';
import { readConfig, writeConfig } from '../lib/config.js';
import { verifyToken } from '../lib/api.js';

interface LoginPayload {
  token: string;
  tokenName?: string;
  tokenPrefix?: string;
  tokenId?: string;
  scopeClientIds?: string[];
  scopeProjectIds?: string[];
}

interface LoginOptions {
  webUrl?: string;
  apiUrl?: string;
  /** Bind to an explicit port instead of an OS-chosen one. */
  port?: number;
  /** Open the browser automatically. Default true. */
  openBrowser?: boolean;
}

const SUCCESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Timebook CLI — connected</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#0b0b0c; color:#e7e7ea; display:grid; place-items:center; height:100vh; margin:0; }
  .card { background:#16161a; border:1px solid #2a2a31; padding:32px 40px; border-radius:12px; max-width:480px; }
  h1 { margin:0 0 8px; font-size:20px; }
  p  { margin:0; color:#a8a8b3; }
</style></head>
<body><div class="card">
  <h1>You can close this tab.</h1>
  <p>Timebook CLI is now authorized on this machine.</p>
</div></body></html>`;

const FAILURE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Timebook CLI — error</title></head>
<body style="font-family:-apple-system,sans-serif;padding:40px;">
<h1>Couldn't complete login.</h1>
<p>Return to your terminal for details.</p>
</body></html>`;

function readBody(req: IncomingMessage, limitBytes = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function loginCommand(opts: LoginOptions = {}): Promise<void> {
  const existingConfig = await readConfig();
  const webUrl = opts.webUrl ?? existingConfig.webUrl;
  const apiUrl = opts.apiUrl ?? existingConfig.apiUrl;
  const state = randomBytes(16).toString('hex');

  // Wait for either the loopback callback to deliver the token, or the user to
  // give up (Ctrl-C). The local server is short-lived and only listens on
  // 127.0.0.1, so the token never crosses the network.
  const result = await new Promise<LoginPayload>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`);

      // Permissive CORS for the browser POST from usetimebook.com — the
      // localhost server is only up for the duration of one login.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }

      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, state }));
        return;
      }

      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
        return;
      }

      try {
        const payload = await extractPayload(req, url);
        if (!payload || payload.state !== state) {
          fail(res, 'Invalid or missing state');
          reject(new Error('State mismatch — login was cancelled or replayed'));
          server.close();
          return;
        }
        if (!payload.token || typeof payload.token !== 'string') {
          fail(res, 'Missing token');
          reject(new Error('No token in callback payload'));
          server.close();
          return;
        }
        succeed(res);
        resolve({
          token: payload.token,
          tokenName: payload.tokenName,
          tokenPrefix: payload.tokenPrefix,
          tokenId: payload.tokenId,
          scopeClientIds: payload.scopeClientIds,
          scopeProjectIds: payload.scopeProjectIds,
        });
        // Give the browser a moment to receive the response before closing.
        setTimeout(() => server.close(), 100);
      } catch (err) {
        fail(res, (err as Error).message);
        reject(err);
        server.close();
      }
    });

    server.on('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      const callback = `http://127.0.0.1:${port}/callback`;
      const authUrl = `${webUrl}/cli-auth?callback=${encodeURIComponent(callback)}&state=${state}`;

      console.log(c.bold('Timebook login'));
      console.log('');
      console.log('Opening your browser to authorize this machine.');
      console.log('If it does not open, paste this URL:');
      console.log('  ' + c.cyan(authUrl));
      console.log('');
      console.log(c.dim(`Listening on ${callback}`));

      if (opts.openBrowser !== false) {
        open(authUrl).catch(() => {
          /* user can copy the URL manually */
        });
      }
    });
  });

  // Confirm the token actually works against the API before persisting it,
  // so a copy/paste error shows up immediately rather than on the next call.
  const user = await verifyToken({ ...existingConfig, apiUrl }, result.token);

  await writeConfig({
    ...existingConfig,
    apiUrl,
    webUrl,
    token: result.token,
    tokenName: result.tokenName,
    tokenPrefix: result.tokenPrefix,
    tokenId: result.tokenId,
    scopeClientIds: result.scopeClientIds,
    scopeProjectIds: result.scopeProjectIds,
    user: { id: user.id, email: user.email, name: user.name },
    createdAt: new Date().toISOString(),
  });

  console.log('');
  console.log(c.green('✓ ') + `Logged in as ${c.bold(user.email)}`);
  if (result.tokenName) {
    console.log(
      c.dim(`  Token: ${result.tokenName}${result.tokenPrefix ? ` (${result.tokenPrefix}…)` : ''}`),
    );
  }
  const scopeNote = describeScope(result.scopeClientIds, result.scopeProjectIds);
  if (scopeNote) console.log(c.dim(`  Scope: ${scopeNote}`));
}

interface CallbackPayload {
  state?: string;
  token?: string;
  tokenName?: string;
  tokenPrefix?: string;
  tokenId?: string;
  scopeClientIds?: string[];
  scopeProjectIds?: string[];
}

async function extractPayload(req: IncomingMessage, url: URL): Promise<CallbackPayload | null> {
  if (req.method === 'POST') {
    const body = await readBody(req);
    if (!body) return null;
    return JSON.parse(body) as CallbackPayload;
  }
  if (req.method === 'GET') {
    // Fallback for GET-style redirects (e.g. ?token=...&state=...).
    const params = url.searchParams;
    const token = params.get('token');
    const state = params.get('state');
    if (!token || !state) return null;
    return {
      token,
      state,
      tokenName: params.get('tokenName') ?? undefined,
      tokenPrefix: params.get('tokenPrefix') ?? undefined,
      tokenId: params.get('tokenId') ?? undefined,
    };
  }
  return null;
}

function succeed(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(SUCCESS_HTML);
}

function fail(res: ServerResponse, _reason: string): void {
  res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(FAILURE_HTML);
}

function describeScope(
  clients: string[] | undefined,
  projects: string[] | undefined,
): string | null {
  const cl = clients?.length ?? 0;
  const pr = projects?.length ?? 0;
  if (cl === 0 && pr === 0) return 'all clients & projects';
  const parts: string[] = [];
  if (cl > 0) parts.push(`${cl} client${cl === 1 ? '' : 's'}`);
  if (pr > 0) parts.push(`${pr} project${pr === 1 ? '' : 's'}`);
  return parts.join(', ');
}
