#!/usr/bin/env node
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { c } from './lib/colors.js';

import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { statusCommand } from './commands/status.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { logCommand } from './commands/log.js';
import { listClientsCommand, listEntriesCommand, listProjectsCommand } from './commands/list.js';
import { runMcpServer } from './mcp/server.js';

async function readVersion(): Promise<string> {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(here, '../package.json');
    const raw = await readFile(pkgPath, 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(c.red('error: ') + msg);
  process.exit(1);
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('timebook')
    .description('Timebook command-line client and MCP server.')
    .version(await readVersion());

  program
    .command('login')
    .description('Authenticate this machine via your browser.')
    .option('--port <port>', 'Bind the local callback to a specific port', (v) =>
      Number.parseInt(v, 10),
    )
    .option('--no-open', 'Do not auto-open the browser; print the URL instead')
    .option('--web-url <url>', 'Override the Timebook web URL')
    .option('--api-url <url>', 'Override the Timebook API URL')
    .option('--debug', 'Print every loopback request hitting /callback (diagnostic)')
    .action(
      async (opts: {
        port?: number;
        open: boolean;
        webUrl?: string;
        apiUrl?: string;
        debug?: boolean;
      }) => {
        try {
          await loginCommand({
            port: opts.port,
            openBrowser: opts.open,
            webUrl: opts.webUrl,
            apiUrl: opts.apiUrl,
            debug: opts.debug,
          });
        } catch (err) {
          fail(err);
        }
      },
    );

  program
    .command('logout')
    .description('Remove the saved token from this machine.')
    .action(async () => {
      try {
        await logoutCommand();
      } catch (err) {
        fail(err);
      }
    });

  program
    .command('whoami')
    .description('Show the current user.')
    .action(async () => {
      try {
        await whoamiCommand();
      } catch (err) {
        fail(err);
      }
    });

  program
    .command('status')
    .description('Show the active timer (if any).')
    .action(async () => {
      try {
        await statusCommand();
      } catch (err) {
        fail(err);
      }
    });

  program
    .command('start')
    .description('Start a timer on a project.')
    .requiredOption('-p, --project <idOrName>', 'Project id or exact name')
    .option('-d, --description <text>', 'What you are working on')
    .option('-r, --rate <idOrName>', 'Hourly rate to attach')
    .action(async (opts: { project: string; description?: string; rate?: string }) => {
      try {
        await startCommand(opts);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command('stop')
    .description('Stop the currently running timer.')
    .action(async () => {
      try {
        await stopCommand();
      } catch (err) {
        fail(err);
      }
    });

  program
    .command('log')
    .description('Log a manual time entry. Use --duration, OR --start and --end.')
    .requiredOption('-p, --project <idOrName>', 'Project id or exact name')
    .option('-d, --description <text>', 'What you worked on')
    .option('-t, --duration <length>', 'Length, e.g. 1h, 45m, 1h30m, 1.5h, 1:30, or 90 (minutes)')
    .option('--start <iso>', 'Start time (ISO-8601)')
    .option('--end <iso>', 'End time (ISO-8601)')
    .option('-r, --rate <idOrName>', 'Hourly rate to attach')
    .action(
      async (opts: {
        project: string;
        description?: string;
        duration?: string;
        start?: string;
        end?: string;
        rate?: string;
      }) => {
        try {
          await logCommand(opts);
        } catch (err) {
          fail(err);
        }
      },
    );

  const projects = program.command('projects').description('Project operations.');
  projects
    .command('list', { isDefault: true })
    .description('List all projects.')
    .action(async () => {
      try {
        await listProjectsCommand();
      } catch (err) {
        fail(err);
      }
    });

  const clients = program.command('clients').description('Client operations.');
  clients
    .command('list', { isDefault: true })
    .description('List all clients.')
    .action(async () => {
      try {
        await listClientsCommand();
      } catch (err) {
        fail(err);
      }
    });

  const entries = program.command('entries').description('Time entry operations.');
  entries
    .command('list', { isDefault: true })
    .description('List recent time entries.')
    .option('-p, --project <idOrName>', 'Filter by project')
    .option('--start-date <iso>', 'Earliest start time (inclusive)')
    .option('--end-date <iso>', 'Latest start time (inclusive)')
    .option('-n, --limit <count>', 'Cap the number of rows', (v) => Number.parseInt(v, 10))
    .action(
      async (opts: { project?: string; startDate?: string; endDate?: string; limit?: number }) => {
        try {
          await listEntriesCommand(opts);
        } catch (err) {
          fail(err);
        }
      },
    );

  program
    .command('mcp')
    .description('Run as an MCP server (stdio) for AI agents like Claude or Codex.')
    .action(async () => {
      try {
        await runMcpServer();
      } catch (err) {
        fail(err);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch(fail);
