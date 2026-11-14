import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { goalsFailure, goalsRoute } from "./failure.js";
import type { GoalsRoutePorts } from "./types.js";
import { goalsActions } from "../actions.js";

/**
 * A Goal's input the person has yet to decide (an assistant, an Agent, a workflow or an MCP client only proposed it): accept it, or take it off;
 * and a version of a project-folder file the person fixed, bound by its exact reference. The page asks for one of these; Goals' own actions do it (`goals.inputs.accept` is the person's alone, `goals.inputs.release` is the removal).
 */
export function goalInputRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [goalsRoute("goals.inputs", ports, async (context) => {
    const goalId = context.params.goalId!;
    const body = context.body;
    // A version the platform's materials service fixed for the person (「加输入」 → 固定一版): bound by its exact reference, checked by Goals.
    if (body.action === "bind") {
      const title = typeof body.title === "string" && body.title ? { title: body.title } : {};
      return { status: 200, body: await context.actions.invoke(goalsActions.inputsBind, { goal_id: goalId, ref: body.ref as MaterialRef, ...title }) };
    }
    if (typeof body.binding_id !== "string" || !body.binding_id || (body.action !== "accept" && body.action !== "remove")) {
      return goalsFailure(new ActionError("actions.input_invalid", "binding_id 必须是输入的编号，action 必须是 accept 或 remove"));
    }
    const result = body.action === "accept"
      ? await context.actions.invoke(goalsActions.inputsAccept, { goal_id: goalId, binding_id: body.binding_id })
      : await context.actions.invoke(goalsActions.inputsRelease, { goal_id: goalId, binding_id: body.binding_id });
    return { status: 200, body: result };
  })];
}
