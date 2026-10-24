import { defineErrorCodes, type ActionCallContext, type ActionDefinition, type ActionUserAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { runningHandlerContext } from "./action-settlement.js";

const authorshipErrors = defineErrorCodes("kernel", { runtime_identity_missing: "invalid", user_action_untrusted: "forbidden" });

/** What every dispatch asks of the caller's own claims before anything runs: the Session authorship below, and the person's operation (PG-029). */
export function assertCallerProvenance(action: ActionDefinition["action"], context: ActionCallContext): void {
  assertSessionAuthorship(action, context);
  assertUserActionFromEntry(context);
}

/**
 * Only a protected entry gives `user_action`. A call dispatched inside a running handler (its own code, a plugin's, anything that handler
 * started) carries the one that handler was given, or none: one it wrote or changed is not the person's, and the call is refused before
 * its handler runs. This holds after the handler returned too, for work it left behind.
 */
function assertUserActionFromEntry(context: ActionCallContext): void {
  const handler = runningHandlerContext();
  if (!handler || !context.user_action || sameUserAction(context.user_action, handler.user_action)) return;
  throw authorshipErrors.user_action_untrusted("用户操作的出处只能由宿主入口给；动作里发起的调用只能沿用原调用的出处");
}

function sameUserAction(left: ActionUserAction, right: ActionUserAction | undefined): boolean {
  const fields = ["source", "conversation_ref", "message_ref", "whole_confirmation_prompted", "prompted_subject_id"];
  return !!right && Reflect.ownKeys(left).every(key => fields.some(field => field === key)) && left.source === right.source && left.conversation_ref === right.conversation_ref && left.message_ref === right.message_ref
    && left.whole_confirmation_prompted === right.whole_confirmation_prompted && left.prompted_subject_id === right.prompted_subject_id;
}

/**
 * The one place `authorship: "session"` is enforced. The trusted MCP adapter marks the call context of an external Runtime that
 * has no stable Session; every dispatch passes through here with its own context, so a call a wrapper action makes on that
 * client's behalf (an offer the Home runs, a workflow step) is refused like the client's own.
 */
export function assertSessionAuthorship(action: ActionDefinition["action"], context: Pick<ActionCallContext, "runtime_session_missing">): void {
  if (action.authorship !== "session" || !context.runtime_session_missing) return;
  throw authorshipErrors.runtime_identity_missing(
    "MCP 宿主没有稳定 Session 身份。请重新连接 Molis Work MCP，由宿主提供 runtime_id 以及稳定 Session（会话元数据、nativeRuntimeSessionId 或已声明的 stable_work_context_id）；不要在工具参数里填用户身份。");
}
