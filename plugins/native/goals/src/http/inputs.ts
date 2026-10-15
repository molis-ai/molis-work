import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { respondGoalsFailure } from "./failure.js";
import type { GoalsHttpContext } from "./types.js";
import { goalsActions } from "../actions.js";

/**
 * A Goal's input the person has yet to decide (an assistant, an Agent, a workflow or an MCP client only proposed it): accept it, or take it off.
 * The page asks for one or the other; Goals' own actions do it (`goals.inputs.accept` is the person's alone, `goals.inputs.release` is the removal).
 */
export async function handleGoalInputsHttp(context: GoalsHttpContext): Promise<boolean> {
  const match = context.pathname.match(/^\/api\/goals\/([^/]+)\/inputs$/);
  if (!match || context.method !== "POST") return false;
  const goalId = decodeURIComponent(match[1]!);
  try {
    const body = await context.readBody();
    if (typeof body.binding_id !== "string" || !body.binding_id || (body.action !== "accept" && body.action !== "remove")) {
      respondGoalsFailure(context, new ActionError("actions.input_invalid", "binding_id 必须是输入的编号，action 必须是 accept 或 remove"));
      return true;
    }
    const result = body.action === "accept"
      ? await context.actions.invoke(goalsActions.inputsAccept, { goal_id: goalId, binding_id: body.binding_id })
      : await context.actions.invoke(goalsActions.inputsRelease, { goal_id: goalId, binding_id: body.binding_id });
    context.changed();
    context.respond(200, result);
  } catch (error) { return respondGoalsFailure(context, error); }
  return true;
}
