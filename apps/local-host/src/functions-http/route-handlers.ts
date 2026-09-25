import { functionsActions, functionAuthoringActions } from "@molis-ai/molis-work-module-functions";
import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { assembleFunctionAuthoringCatalog, type FunctionAuthoringCatalog } from "@molis-ai/molis-work-contracts/modules/functions";
import type { FunctionsHttpRouteContext, FunctionsHttpRouteHandler } from "./routes.js";

/** HTTP names remain stable; all rule business calls enter the registered service. */
export function createFunctionsRouteHandlers(
  options: { actions: BoundActionClient; catalog?: () => FunctionAuthoringCatalog },
): Record<string, FunctionsHttpRouteHandler> {
  const call = (definition: ActionDefinition, args: (context: FunctionsHttpRouteContext) => unknown): FunctionsHttpRouteHandler =>
    async context => ({ status: 200, body: await options.actions.invoke(definition, args(context)) });
  const revision = ({ params, request }: FunctionsHttpRouteContext) => ({ ...request.body, id: params.id });
  return {
    "functions.list": call(functionAuthoringActions.list, () => ({})),
    "functions.create": call(functionAuthoringActions.create, ({ request }) => request.body),
    "functions.catalog": () => ({ status: 200, body: { catalog: (options.catalog ?? assembleFunctionAuthoringCatalog)() } }),
    "functions.published": call(functionsActions.list, () => ({})),
    "functions.describe": call(functionsActions.describe, ({ params }) => ({ function_key: params.function_key })),
    "functions.invoke": call(functionsActions.invoke, ({ params, request }) => ({ ...request.body, function_key: params.function_key })),
    "functions.get": call(functionAuthoringActions.get, ({ params }) => ({ id: params.id })),
    "functions.update": call(functionAuthoringActions.update, ({ params, request }) => {
      const { updated_at, ...patch } = request.body;
      return { id: params.id, ...(updated_at === undefined ? {} : { updated_at }), patch };
    }),
    "functions.preview": call(functionAuthoringActions.preview, revision),
    "functions.publish": call(functionAuthoringActions.publish, revision),
    "functions.delete": call(functionAuthoringActions.delete, revision),
    "functions.sample.add": call(functionAuthoringActions.addSample, revision),
    "functions.sample.delete": call(functionAuthoringActions.removeSample, revision),
    "functions.usages": call(functionAuthoringActions.usages, ({ params }) => ({ id: params.id })),
  };
}
