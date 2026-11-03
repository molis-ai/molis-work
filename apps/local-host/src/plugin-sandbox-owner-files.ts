import { lstatSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { pluginErrors, type PluginDefinition, type PluginOwnerFilesClient, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginOwnerFilesClient } from "@molis-ai/molis-work-plugin-runtime";
import { openPluginOwnerFiles } from "./plugin-owner-files.js";

// The declared files of a sandboxed plugin (`owner_files`, PG-017 P2c, S-64). A shipped plugin's root is a directory of the Home its store registry holds
// for it. A sandboxed package is installed, not registered, so it has no registry entry and its root is one installation's: in a project,
// <Home>/projects/<project>/plugin-files/<installation>/<store_name>/ (another project's activation of the same package has another root, and deleting the
// project deletes the files with it); on the Home Runtime, <Home>/plugin-files/<installation>/<store_name>/ (a registered Home store, so a purge takes it).
// Another installation has another root. The client is the same one the Host's own plugins get, over the same port; the sandbox's broker reduces it to
// what a channel can carry. An uninstall that keeps no data removes the installation's folder (`removeSandboxOwnerFiles`, called from the executors'
// `uninstalled`); one that keeps it leaves the folder to the same installation id, which a reinstall reuses, as it does the private data.

/** Where a sandboxed installation runs: a project's platform, or the Home Runtime (`project_id: null`). */
export interface SandboxOwnerFilesScope {
  readonly home?: { readonly directory: string } | null;
  readonly project_id: string | null;
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const plain = (value: string, what: string) => {
  if (!SEGMENT.test(value) || value.includes("..")) throw pluginErrors.declaration_invalid(`沙箱插件的主人文件根需要${what}是一个普通目录名`);
  return value;
};

/** The directory that holds one installation's files; `store_name` (the Manifest's) is a directory inside it. */
export function sandboxOwnerFilesBase(homeDirectory: string, projectId: string | null, installId: string): string {
  const home = realpathSync(homeDirectory), installation = plain(installId, "安装 ID");
  return projectId === null ? join(home, "plugin-files", installation) : join(home, "projects", plain(projectId, "项目 ID"), "plugin-files", installation);
}

export function sandboxOwnerFilesFor(scope: SandboxOwnerFilesScope, definition: PluginDefinition,
  context: Pick<PluginStartContext, "install_id" | "installation_generation" | "requireGrant">, assertActive: () => void): { readonly client: PluginOwnerFilesClient } | undefined {
  const declaration = definition.manifest.owner_files;
  if (definition.execution !== "sandbox" || declaration === undefined) return undefined;
  if (!scope.home) throw pluginErrors.declaration_invalid(`沙箱插件 ${definition.manifest.plugin_id} 声明了主人文件，但这个插件平台没有 Home`);
  const base = sandboxOwnerFilesBase(scope.home.directory, scope.project_id, context.install_id);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  // No location is passed: `rootPath()` answers "unavailable", and the sandbox's broker has no method for it either way.
  return createPluginOwnerFilesClient(definition.manifest, declaration, openPluginOwnerFiles(base, declaration),
    { install_id: context.install_id, installation_generation: context.installation_generation, assertActive, requireGrant: permission => context.requireGrant(permission) });
}

/**
 * The platform's cleanup when a sandboxed installation is uninstalled and keeps no private data: its folder goes, and nothing else (S-64). The instance has
 * stopped by then. A name that is not a plain directory name, a folder that is not where the Host made it (the parent resolves outside the Home), and a link
 * are never followed: a link is unlinked, never what it points at.
 */
export function removeSandboxOwnerFiles(scope: SandboxOwnerFilesScope, installId: string): void {
  if (!scope.home) return;
  const base = sandboxOwnerFilesBase(scope.home.directory, scope.project_id, installId);
  try { lstatSync(base); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  if (!(realpathSync(dirname(base)) + sep).startsWith(realpathSync(scope.home.directory) + sep)) throw pluginErrors.declaration_invalid("沙箱插件的主人文件根不在 Home 里");
  rmSync(base, { recursive: true, force: true });
}
