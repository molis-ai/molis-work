import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pluginErrors, type PluginDefinition, type PluginOwnerFilesClient, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginOwnerFilesClient } from "@molis-ai/molis-work-plugin-runtime";
import { openPluginOwnerFiles } from "./plugin-owner-files.js";

// The declared files of a sandboxed plugin (`owner_files`, PG-017 P2c, S-65). A shipped plugin's root is a directory of the Home its store registry holds
// for it. A sandboxed package is installed into a project and has no registry entry, so its root is the project's, and one installation's:
// <Home>/projects/<project>/plugin-files/<installation>/<store_name>/. Another project's activation of the same package has another root, another
// installation has another, and deleting the project deletes the files with it. The client is the same one the Host's own plugins get, over the
// same port; the sandbox's broker reduces it to what a channel can carry.

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const plain = (value: string, what: string) => {
  if (!SEGMENT.test(value) || value.includes("..")) throw pluginErrors.declaration_invalid(`沙箱插件的主人文件根需要${what}是一个普通目录名`);
  return value;
};

/** The directory that holds one installation's files in one project; `store_name` (the Manifest's) is a directory inside it. */
export function sandboxOwnerFilesBase(homeDirectory: string, projectId: string, installId: string): string {
  return join(realpathSync(homeDirectory), "projects", plain(projectId, "项目 ID"), "plugin-files", plain(installId, "安装 ID"));
}

export function sandboxOwnerFilesFor(options: { readonly home?: { readonly directory: string } | null; readonly project_id: string }, definition: PluginDefinition,
  context: Pick<PluginStartContext, "install_id" | "installation_generation" | "requireGrant">, assertActive: () => void): { readonly client: PluginOwnerFilesClient } | undefined {
  const declaration = definition.manifest.owner_files;
  if (definition.execution !== "sandbox" || declaration === undefined) return undefined;
  if (!options.home) throw pluginErrors.declaration_invalid(`沙箱插件 ${definition.manifest.plugin_id} 声明了主人文件，但这个插件平台没有 Home`);
  const base = sandboxOwnerFilesBase(options.home.directory, options.project_id, context.install_id);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  // No location is passed: `rootPath()` answers "unavailable", and the sandbox's broker has no method for it either way.
  return createPluginOwnerFilesClient(definition.manifest, declaration, openPluginOwnerFiles(base, declaration),
    { install_id: context.install_id, installation_generation: context.installation_generation, assertActive, requireGrant: permission => context.requireGrant(permission) });
}
