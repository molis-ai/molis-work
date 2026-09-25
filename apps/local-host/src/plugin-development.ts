import type { PluginDevelopmentInput, PluginDevelopmentResult } from "@molis-ai/molis-work-contracts/platform/tooling";
import type { PluginRuntimeRepository } from "@molis-ai/molis-work-contracts/platform/plugin";
import { loadDevelopmentPlugin, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { PluginHostExecutor, type PluginHostExecutorOptions } from "./plugin-executor.js";

/** Public developer fixture, with the same real owner ports used by the application Host. */
export async function runPluginDevelopment(input: PluginDevelopmentInput, options: PluginHostExecutorOptions & {
  repository: PluginRuntimeRepository;
}): Promise<PluginDevelopmentResult> {
  if (input.allow_unsigned_development !== true) throw new Error("需要明确授权运行未签名本地开发代码");
  const definition = await loadDevelopmentPlugin(input.directory);
  const runtime = new PluginRuntime(options.repository, new PluginHostExecutor(options), { actions: options.actions });
  const installed = runtime.install({ definition, deployment: "local", grants: input.grants, retain_private_data: true });
  const id = installed.install.install_id;
  let result: Omit<PluginDevelopmentResult, "installation">;
  try {
    await runtime.start(id);
    const contribution = runtime.contribution(id);
    if (!contribution) throw new Error("Plugin 启动后没有返回 contribution");
    if (contribution.kind !== "integration") {
      throw new Error("本开发入口只运行 Integration Plugin，app Plugin 请用项目 Host 装配");
    }
    const health = await contribution.connector_driver.health();
    const poll = await contribution.connector_driver.poll({ cursor: null });
    const rendered_ui = options.ui.list().filter(value => value.plugin_id === definition.manifest.plugin_id)
      .flatMap(value => (value.surfaces ?? []).map(surface => ({ contribution_id: value.contribution_id,
        surface: surface.surface_id, html: options.ui.render({ contribution_id: value.contribution_id, surface: surface.surface_id, model: null }) })));
    result = { health, poll, rendered_ui, artifacts: options.artifacts.query.listArtifacts(options.board_id)
      .filter(value => value.producer_plugin_id === definition.manifest.plugin_id
        && value.producer_binding_signature === definition.manifest.publisher.signature && value.owner_actor_id === options.actor_id) };
  } finally {
    await runtime.uninstall(id, { retain_private_data: true });
  }
  return { ...result, installation: runtime.get(id) };
}
