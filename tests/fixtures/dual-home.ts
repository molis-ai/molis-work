import type { TestContext } from "node:test";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { dualPlugin } from "./dual-plugin.js";
import { openTestHome } from "./test-home.js";

type Dual = ReturnType<typeof dualPlugin>;

/**
 * A Test Home whose Host starts `dualPlugin()` as the Home's marked half and, in each project, its project half (or what
 * `projectHalf` makes of it), with one project created. Every action is available (no catalog policy): a fixture has no catalog entry.
 * `dual` is the plugin: `dualPlugin()` unless the test gives its own.
 *
 * A plugin that ships with the Host registers its actions under its `plugin_id`; a fixture does not ship with it, so under its
 * installation id (`plugin-entry-identity.ts`). Both halves hold the same `install_id`, so either way they share one provider: `provider()`.
 */
export async function openDualHome(t: TestContext, projectHalf: (dual: Dual) => PluginDefinition = dual => dual.project, dual: Dual = dualPlugin()) {
  const home = await openTestHome(t, { catalogPolicy: false,
    host: { pluginFixtures: { home: [{ definition: dual.home, dual_instance: true }], project: [projectHalf(dual)] } } });
  await home.host.homePlugins!.ready();
  const project = await home.createProject("双实例"), projectId = project.project_id;
  /** The local person's call context in the project; reading it starts the project's plugins, and with them the project half. */
  const page = () => home.host.localPersonContext(project.reference);
  /** Each half's installation record, from its own database. */
  const records = async () => ({ home: home.host.homePlugins!.installation(dual.id),
    project: await home.host.withProject(project.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list()
      .find(record => record.plugin_id === dual.id)) });
  /** A page's GET of a plugin route, with the Home's control token. */
  const get = async (path: string) => {
    const response = await fetch(home.origin + path, { headers: { origin: home.origin, "x-molis-work-control-token": home.controlToken } });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  const provider = () => home.host.homePlugins!.installation(dual.id)!.install_id;
  return { dual, home, project, projectId, page, records, get, provider, client: home.host.actionClient(project.reference) };
}
