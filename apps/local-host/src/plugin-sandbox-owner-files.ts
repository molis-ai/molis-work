import { lstatSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type PluginDefinition, type PluginOwnerFilesClient, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginOwnerFilesClient } from "@molis-ai/molis-work-plugin-runtime";
import { partitionRoot } from "@molis-ai/molis-work-module-projects";
import { openPluginOwnerFiles } from "./plugin-owner-files.js";

// The declared files of a sandboxed plugin (`owner_files`, PG-017 P2c, S-64). A shipped plugin's root is a directory of the Home its store registry holds
// for it. A sandboxed package is installed, not registered, so it has no registry entry and its root is one installation's: in a project,
// <partition root>/plugin-files/<installation>/<store_name>/ (`partitionRoot`: personal-space/ or projects/<project>/; another project's activation of the same package has another root, and deleting the
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
export const isSandboxOwnerSegment = (value: string) => SEGMENT.test(value) && !value.includes("..");
const plain = (value: string, what: string) => {
  if (!isSandboxOwnerSegment(value)) throw pluginErrors.declaration_invalid(`沙箱插件的主人文件根需要${what}是一个普通目录名`);
  return value;
};

/** The confinement root for one sandboxed installation's files: the partition root (`partitionRoot`), or the Home for Home Runtime (`project_id: null`). */
function sandboxOwnerFilesRoot(homeDirectory: string, projectId: string | null): string {
  const home = realpathSync(homeDirectory);
  return projectId === null ? home : partitionRoot(home, plain(projectId, "项目 ID"));
}

/** The real location of a path through its deepest existing ancestor: a link inside one partition pointing elsewhere resolves outside it. */
function resolveExisting(candidate: string): string {
  const absolute = resolve(candidate);
  const rest: string[] = [];
  let at = absolute;
  for (;;) {
    try {
      return join(realpathSync(at), ...rest.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(at);
      if (parent === at) return absolute;
      rest.push(basename(at));
      at = parent;
    }
  }
}

/** Refuses any symlink escape before creating or opening a sandboxed installation's owner-files folder (S-partition-isolation, S-64). */
function assertOwnSandboxFilesPath(root: string, base: string): void {
  const expectedParent = join(root, "plugin-files");
  const resolvedParent = resolveExisting(dirname(base));
  const resolvedBase = resolveExisting(base);
  const baseStat = lstatSync(base, { throwIfNoEntry: false });
  if (
    resolvedParent !== expectedParent
    || !(resolvedParent + sep).startsWith(root + sep)
    || resolvedBase !== base
    || !(resolvedBase + sep).startsWith(root + sep)
    || baseStat?.isSymbolicLink()
  ) {
    throw new ActionError("actions.forbidden", "插件只能读写它所在分区的库和文件");
  }
}

/** The directory that holds one installation's files; `store_name` (the Manifest's) is a directory inside it. */
export function sandboxOwnerFilesBase(homeDirectory: string, projectId: string | null, installId: string): string {
  const installation = plain(installId, "安装 ID");
  return join(sandboxOwnerFilesRoot(homeDirectory, projectId), "plugin-files", installation);
}

/** Hold the previous installation's files out of reach until the signed replacement finishes. */
export function stageSandboxOwnerFiles(home: string, projectId: string | null, installId: string) {
  const root = sandboxOwnerFilesRoot(home, projectId);
  const base = sandboxOwnerFilesBase(home, projectId, installId);
  const check = () => assertOwnSandboxFilesPath(root, base);
  check();
  let backup: string | undefined;
  if (lstatSync(base, { throwIfNoEntry: false })) {
    backup = mkdtempSync(join(dirname(base), ".discard-"));
    try { renameSync(base, join(backup, "files")); }
    catch (error) {
      rmSync(backup, { recursive: true, force: true });
      throw error;
    }
  }
  return {
    restore() {
      check();
      removeSandboxOwnerFiles({ home: { directory: home }, project_id: projectId }, installId);
      if (backup) {
        assertOwnSandboxFilesPath(root, backup);
        renameSync(join(backup, "files"), base);
      }
    },
    close() {
      if (!backup) return;
      assertOwnSandboxFilesPath(root, backup);
      rmSync(backup, { recursive: true, force: true });
    },
  };
}

export function sandboxOwnerFilesFor(scope: SandboxOwnerFilesScope, definition: PluginDefinition,
  context: Pick<PluginStartContext, "install_id" | "installation_generation" | "requireGrant">, assertActive: () => void): { readonly client: PluginOwnerFilesClient } | undefined {
  const declaration = definition.manifest.owner_files;
  if (definition.execution !== "sandbox" || declaration === undefined) return undefined;
  if (!scope.home) throw pluginErrors.declaration_invalid(`沙箱插件 ${definition.manifest.plugin_id} 声明了主人文件，但这个插件平台没有 Home`);
  const root = sandboxOwnerFilesRoot(scope.home.directory, scope.project_id);
  const base = sandboxOwnerFilesBase(scope.home.directory, scope.project_id, context.install_id);
  // Checked before mkdirSync (so a swapped link cannot create directories in another partition) and again after.
  assertOwnSandboxFilesPath(root, base);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  assertOwnSandboxFilesPath(root, base);
  // No location is passed: `rootPath()` answers "unavailable", and the sandbox's broker has no method for it either way.
  return createPluginOwnerFilesClient(definition.manifest, declaration, openPluginOwnerFiles(base, declaration),
    { install_id: context.install_id, installation_generation: context.installation_generation, assertActive, requireGrant: permission => context.requireGrant(permission) });
}

/**
 * The platform's cleanup when a sandboxed installation is uninstalled and keeps no private data: its folder goes, and nothing else (S-64). The instance has
 * stopped by then. A name that is not a plain directory name, a folder that is not where the Host made it (the parent resolves outside its partition/Home), and a link
 * are never followed: a link is unlinked, never what it points at.
 */
export function removeSandboxOwnerFiles(scope: SandboxOwnerFilesScope, installId: string): void {
  if (!scope.home) return;
  const root = sandboxOwnerFilesRoot(scope.home.directory, scope.project_id);
  const base = sandboxOwnerFilesBase(scope.home.directory, scope.project_id, installId);
  try { lstatSync(base); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  const parentReal = realpathSync(dirname(base));
  const expectedParent = join(root, "plugin-files");
  if (parentReal !== expectedParent || !(parentReal + sep).startsWith(root + sep)) {
    throw pluginErrors.declaration_invalid("存它文件的文件夹指向这个空间之外，为稳妥没有动；处理好后可以重试");
  }
  rmSync(base, { recursive: true, force: true });
}
