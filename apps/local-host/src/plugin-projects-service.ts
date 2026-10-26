import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_PROJECTS_EXIST_PERMISSION, type PluginDefinition, type PluginProjectsClient, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginProjectsClient, type PluginProjectsPort } from "@molis-ai/molis-work-plugin-runtime";
import { pluginCatalogFor } from "./home-side.js";

/**
 * `services.projects` (BL-680, S-92; 用户 2026-10-26 弹窗决定): a plugin that declares `projects:exist` and holds the person's grant is told,
 * for the project ids it passes in, whether each is still a project of this Home. It is read from the Home's project catalog on every
 * call and kept nowhere; a plugin the Host runs outside its own process is not given it (the sandbox refuses the declaration, S-60).
 * `port` stands in for the catalog in a test that has no Home.
 */
export function pluginProjectsFor(definition: PluginDefinition, context: PluginStartContext, home: string | null | undefined, assertActive: () => void,
  port?: PluginProjectsPort): PluginProjectsClient | undefined {
  const manifest = definition.manifest;
  if (definition.execution === "sandbox" || !manifest.permissions.some(entry => entry.permission === PLUGIN_PROJECTS_EXIST_PERMISSION)) return undefined;
  const source = port ?? (home ? catalogPort(home) : undefined);
  if (!source) return undefined;
  return createPluginProjectsClient(manifest, source, { assertActive, requireGrant: permission => context.requireGrant(permission) });
}

/** A catalog that cannot be read says nothing: an id is never reported gone because the Host could not look. */
function catalogPort(home: string): PluginProjectsPort {
  return {
    async existing(ids) {
      const catalog = pluginCatalogFor(home);
      if (!catalog) throw new ActionError("actions.unavailable", "项目目录暂时读不到");
      const present = await catalog({ homeDirectory: home }, projects => new Set(projects.listProjects().map(project => project.project_id)));
      return new Set(ids.filter(id => present.has(id)));
    },
  };
}
