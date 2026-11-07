import assert from "node:assert/strict";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { BUILTIN_PLUGIN_REGISTRY, PROJECT_SCOPED_PLUGIN_IDS, molisWorkHostProjectReference, type MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";

/**
 * Reads echo what is stored. One historical record that an output contract no longer admits makes the whole read fail (a project page that does
 * not open), so every parameterless read in the directory runs over real data: these fixtures, and the golden Homes (specs/upgrade-continuity/
 * golden-replay-design.md §4 step 4). An unexpected error is a broken read, not an acceptable business result.
 *
 * Node runs this file directly from scripts/, so it keeps to syntax that type stripping can erase.
 */
export const needsNothing = (view: ActionView) => view.operation === "query"
  && view.action.input_schema?.type === "object" && !((view.action.input_schema.required as unknown[] | undefined)?.length);

// These fixtures deliberately contain neither model settings nor a managed workspace.
// Match the exact capability/version AND code; unknown exceptions still fail the gate.
export const unavailableInFixture: Record<string, string> = {
  "alchemist.runtime.verify@1": "alchemist.runtime_not_configured",
  "git.operations@1": "actions.dependency_missing",
  "git.pr-support@1": "actions.dependency_missing",
  "git.results@1": "actions.dependency_missing",
  "git.state@1": "actions.dependency_missing",
  "git.summary@1": "actions.dependency_missing",
};

type CatalogRunner = <T>(options: { homeDirectory: string }, body: (catalog: { databasePath: string; projectsDirectory: string; getProject(id: string): { database_path: string } }) => T | Promise<T>) => Promise<T>;

/** Put a project dump into a Home under its own id, through the catalog table's owner; neither data nor identity is rewritten. */
export function registerProjectCopy(host: MolisWorkLocalHost, home: string, withCatalog: CatalogRunner, databasePath: string, projectId: string, displayName: string): Promise<string> {
  return host.configurePersonalPlanning(home, withCatalog)({ homeDirectory: home }, catalog => {
    let copy: string;
    const storage = new LocalSqliteStorage(catalog.databasePath);
    try {
      const projects = new ProjectsModule({ db: storage.db, projects_directory: catalog.projectsDirectory, plugins: BUILTIN_PLUGIN_REGISTRY });
      const record = projects.lifecycle.prepareRecord({ project_id: projectId, display_name: displayName, data_class: "user" });
      copy = record.database_path;
      mkdirSync(dirname(copy), { recursive: true }); copyFileSync(databasePath, copy);
      projects.lifecycle.register(record, "project.created", "fixture-restore");
      for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) projects.commands.addProjectPlugin({ project_id: projectId, plugin_id, actor_id: "fixture-restore" });
    } finally { storage.close(); }
    assert.equal(catalog.getProject(projectId).database_path, copy);
    return copy;
  });
}

export interface ParameterlessReadOptions {
  /** T145: even a read of project reach needs the project's actual settings door, not an invented user_action or a forbidden allowlist. */
  readonly projectReachThroughSettings: () => Promise<void>;
  /** The capability/version → code table of what this data deliberately has no dependency for. */
  readonly unavailable?: Record<string, string>;
  /** Home-scoped reads answer the same in every project, so a caller going over several projects asks for them once. */
  readonly homeScope?: boolean;
}

export interface BrokenRead { readonly action: string; readonly code: string; readonly message: string }

/** Every parameterless read of one project, as the person. The caller decides what a broken read means; a golden replay prints its code and never its message. */
export async function readEveryParameterlessAction(host: MolisWorkLocalHost, databasePath: string, projectId: string, options: ParameterlessReadOptions) {
  const ref = molisWorkHostProjectReference({ databasePath, projectId }), unavailable = options.unavailable ?? unavailableInFixture;
  const broken: BrokenRead[] = [], read = new Set<string>();
  const base = { actor_id: "web-user", project_id: projectId, audience: "user" as const, permissions: [] };
  for (const view of (await host.inspectActions(base, ref)).filter(needsNothing)) {
    if (view.action.scope === "home" && options.homeScope === false) continue;
    const caller = { ...base, permissions: view.action.permissions };
    const client = view.action.scope === "home" ? host.homeActionClient() : host.actionClient(ref);
    try {
      if (view.capability_id === "plugins.project_reach.list" && view.version === 1) {
        await assert.rejects(client.invoke(caller, view, {}), { code: "actions.forbidden", message: "项目同意只接受本人在对应项目设置里的操作" });
        await options.projectReachThroughSettings();
      } else {
        await client.invoke(view.action.scope === "home" ? { ...caller, project_id: null } : caller, view, {});
      }
      read.add(view.capability_id);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code && unavailable[`${view.capability_id}@${view.version}`] === code) continue;
      broken.push({ action: `${view.capability_id}@${view.version}`, code: code ?? "unexpected_error", message: (error as Error).message });
    }
  }
  return { broken, read };
}
