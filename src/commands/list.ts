import { c } from '../lib/colors.js';
import { api } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';

export async function listProjectsCommand(): Promise<void> {
  const { projects } = await api.listProjects();
  if (projects.length === 0) {
    console.log('No projects.');
    return;
  }
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  for (const p of sorted) {
    const tag = p.archived ? c.dim(' [archived]') : '';
    const client = p.client?.name ? c.dim(` — ${p.client.name}`) : '';
    console.log(`${c.bold(p.name)}${client}${tag}`);
    console.log(c.dim(`  ${p.id}`));
  }
}

export async function listClientsCommand(): Promise<void> {
  const { clients } = await api.listClients();
  if (clients.length === 0) {
    console.log('No clients.');
    return;
  }
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
  for (const cl of sorted) {
    const tag = cl.archived ? c.dim(' [archived]') : '';
    const email = cl.email ? c.dim(` — ${cl.email}`) : '';
    console.log(`${c.bold(cl.name)}${email}${tag}`);
    console.log(c.dim(`  ${cl.id}`));
  }
}

interface EntriesOptions {
  project?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export async function listEntriesCommand(opts: EntriesOptions): Promise<void> {
  const { entries } = await api.listEntries({
    projectId: opts.project,
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
  const limited = typeof opts.limit === 'number' ? entries.slice(0, opts.limit) : entries;
  if (limited.length === 0) {
    console.log('No entries.');
    return;
  }
  for (const e of limited) {
    const date = new Date(e.startTime).toLocaleString();
    const dur = formatDuration(e.duration ?? 0);
    const project = e.project?.name ?? e.projectId;
    const client = e.project?.client?.name ? c.dim(` — ${e.project.client.name}`) : '';
    const running = e.isRunning ? c.green(' [running]') : '';
    console.log(`${c.dim(date)}  ${dur.padEnd(8)}  ${c.bold(project)}${client}${running}`);
    if (e.description) console.log(c.dim(`    ${e.description}`));
  }
}
