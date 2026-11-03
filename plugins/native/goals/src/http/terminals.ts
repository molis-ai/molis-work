import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsFailure, goalsRoute } from "./failure.js";
import type { GoalsRoutePorts } from "./types.js";
import { goalsTerminalActions } from "../terminal-actions.js";

/** A Goal's work terminals and the prompt that advances it, each one Goals action called as the person on the page. */
export function goalTerminalRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [
    goalsRoute("goals.terminal-list", ports, async context =>
      ({ status: 200, body: await context.actions.invoke(goalsTerminalActions.list, { goal_id: context.params.goalId! }) })),
    // The body goes to the action as it is (the Goal from the path): a key the action does not know is refused by its schema, not dropped.
    goalsRoute("goals.terminal-open", ports, async context =>
      ({ status: 200, body: await context.actions.invoke(goalsTerminalActions.open, { ...context.body, goal_id: context.params.goalId! }) })),
    goalsRoute("goals.terminal-close", ports, async context =>
      ({ status: 200, body: await context.actions.invoke(goalsTerminalActions.close, { goal_id: context.params.goalId!, key: context.params.key! }) })),
    goalsRoute("goals.advance-prompt", ports, async context => {
      // The Feed item chain (`feed_item_id`) is not served here: the prompt binds only the Feed text still linked to the Goal.
      if (Object.keys(context.query).some(name => name !== "onboarding")) return goalsFailure(new ActionError("actions.input_invalid", "推进提示只接受 onboarding 参数"));
      return { status: 200, body: await context.actions.invoke(goalsTerminalActions.prompt, { goal_id: context.params.goalId!, onboarding: context.query.onboarding === "1" }) };
    }),
  ];
}
