import { api, type Project, type Client } from './api.js';

// Accept either an id or a (case-insensitive) exact name. We don't fuzzy-match
// because picking the wrong project silently logs time to the wrong client —
// preferring an explicit "not found" error over a guess.
export async function resolveProject(idOrName: string): Promise<Project> {
  const { projects } = await api.listProjects();
  const byId = projects.find((p) => p.id === idOrName);
  if (byId) return byId;
  const lc = idOrName.toLowerCase();
  const byName = projects.filter((p) => p.name.toLowerCase() === lc);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new Error(
      `Multiple projects named "${idOrName}". Use the project id instead. Candidates: ${byName.map((p) => p.id).join(', ')}`,
    );
  }
  throw new Error(`Project not found: ${idOrName}`);
}

export async function resolveClient(idOrName: string): Promise<Client> {
  const { clients } = await api.listClients();
  const byId = clients.find((c) => c.id === idOrName);
  if (byId) return byId;
  const lc = idOrName.toLowerCase();
  const byName = clients.filter((c) => c.name.toLowerCase() === lc);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new Error(`Multiple clients named "${idOrName}". Use the client id instead.`);
  }
  throw new Error(`Client not found: ${idOrName}`);
}
