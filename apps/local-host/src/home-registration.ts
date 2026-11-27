import path from "node:path";
import type { ProjectPluginId } from "@molis-ai/molis-work-contracts/modules/projects";

/**
 * Home plugins registered by this Host outside its build, keyed by their manifest id. The catalog and the reach
 * check use these ids to recognize an installation; visibility in a partition still requires membership.
 * Each Home's registration leaves with its Host (batch 109-3).
 */
const registrations = new Map<string, { readonly owner: object; readonly read: () => readonly ProjectPluginId[] }>();

/** Binds a Host's Home registration to its Home; the returned function unbinds it, and only while it is still this one's. */
export function bindHomeRegistration(home: string, owner: object, read: () => readonly ProjectPluginId[]): () => void {
  const directory = path.resolve(home);
  registrations.set(directory, { owner, read });
  return () => { if (registrations.get(directory)?.owner === owner) registrations.delete(directory); };
}

/** The Home plugin ids registered outside this build while the Home's Host is open. */
export function homePluginsOutsideBuild(home: string | undefined): readonly ProjectPluginId[] {
  return home === undefined ? [] : registrations.get(path.resolve(home))?.read() ?? [];
}
