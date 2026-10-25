import path from "node:path";
import type { ProjectPluginId } from "@molis-ai/molis-work-contracts/modules/projects";

/**
 * The Home plugins each Home's open Host registered that its build does not ship and that have no project half (#679, W5-02 B3). They are
 * personal plugins: shown in every project unless it hides them, keyed by their plugin id. The catalog's hidden list and the shared reach
 * judgement (`projectReachablePlugins`) read them here, from the Host's own Home registration on each call, never from a page or a request.
 * One entry per Home, by resolved path; it leaves with its Host.
 */
const registrations = new Map<string, { readonly owner: object; readonly read: () => readonly ProjectPluginId[] }>();

/** Binds a Host's Home registration to its Home; the returned function unbinds it, and only while it is still this one's. */
export function bindHomeRegistration(home: string, owner: object, read: () => readonly ProjectPluginId[]): () => void {
  const directory = path.resolve(home);
  registrations.set(directory, { owner, read });
  return () => { if (registrations.get(directory)?.owner === owner) registrations.delete(directory); };
}

/** The keys of this Home's personal plugins outside the Host's build; none when no Host is open on it. */
export function homePluginsOutsideBuild(home: string | undefined): readonly ProjectPluginId[] {
  return home === undefined ? [] : registrations.get(path.resolve(home))?.read() ?? [];
}
