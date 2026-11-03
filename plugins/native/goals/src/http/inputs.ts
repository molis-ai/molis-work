import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsFailure, goalsRoute } from "./failure.js";
import type { GoalsRoutePorts } from "./types.js";
import { goalsActions } from "../actions.js";

/**
 * A Goal's input the person has yet to decide (an assistant, an Agent, a workflow or an MCP client only proposed it): accept it, or take it off.
 * The page asks for one or the other; Goals' own actions do it (`goals.inputs.accept` is the person's alone, `goals.inputs.release` is the removal).
 */
export function goalInputRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [goalsRoute("goals.inputs", ports, async (context) => {
    const goalId = context.params.goalId!;
    const body = context.body;
    if (typeof body.binding_id !== "string" || !body.binding_id || (body.action !== "accept" && body.action !== "remove")) {
      return goalsFailure(new ActionError("actions.input_invalid", "binding_id 必须是输入的编号，action 必须是 accept 或 remove"));
    }
    const result = body.action === "accept"
      ? await context.actions.invoke(goalsActions.inputsAccept, { goal_id: goalId, binding_id: body.binding_id })
      : await context.actions.invoke(goalsActions.inputsRelease, { goal_id: goalId, binding_id: body.binding_id });
    return { status: 200, body: result };
  })];
}
