import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { builderRoutes } from "../../plugins/native/plugin-builder/src/routes.js";
import { BUILDER_ACTIONS } from "../../plugins/native/plugin-builder/src/actions.js";
import type { BuilderWorkflow } from "../../plugins/native/plugin-builder/src/workflow.js";

/**
 * Builder routes forward to the builder's registered actions, as in a running Host: the returned actions are
 * registered in a real ActionService and the context's action client calls them as the context's own person.
 */
export function builderRoutesWithActions(context: PluginStartContext, workflow: BuilderWorkflow, actorId = "actor"): PluginRouteBinding[] {
  const bound = context as PluginStartContext & { actor_id?: string };
  bound.actor_id ??= actorId;
  const { routes, actions } = builderRoutes(context, workflow);
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: context.install_id, plugin_id: context.plugin_id, title: "插件创作工作台", kind: "plugin", project_id: "builder-test" },
    definitions: BUILDER_ACTIONS, handlers: actions });
  const services = (context.services ?? {}) as NonNullable<PluginStartContext["services"]>;
  (context as { services: unknown }).services = { ...services, actions: bindActionClient(service, () => ({ actor_id: bound.actor_id!, project_id: "builder-test", audience: "user", permissions: ["storage:private"] })) };
  return routes;
}
