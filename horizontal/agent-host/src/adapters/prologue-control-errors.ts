import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { isPrologueError, type PrologueErrorCode } from "@prologue/sdk";
import { agentErrors } from "../errors.js";

/**
 * The Agent codes a refused control reaches the caller with, for the SDK's own codes. Typed by the SDK's code union, so a code the
 * SDK renames or drops fails to compile here. Every SDK code not listed becomes `agent.control_failed`.
 */
const SDK_CONTROL_CODES: Partial<Record<PrologueErrorCode, () => ActionError>> = {
  // The question is no longer open: another answer settled it first, or it expired.
  PENDING_ALREADY_SETTLED: () => agentErrors.pending_not_open("这条问题已经回答过或已经结束，不能再提交答案"),
  PENDING_EXPIRED: () => agentErrors.pending_not_open("这条问题已过期，不能再提交答案"),
};

/**
 * The one place a run control's failure is turned into what the caller sees (stop, cancel, pause, resume, switch-model, answer).
 * A Molis `ActionError` (`agent.*` and the platform's own) passes through unchanged; an SDK error takes its Agent code from the
 * table above, and anything else is `agent.control_failed` with the original as `cause` (a plain error keeps its message). `details.runtime_code` carries the SDK
 * code for diagnostics only: callers branch on `code` and `kind`, never on `runtime_code`.
 */
export function controlFailure(error: unknown): ActionError {
  if (error instanceof ActionError) return error;
  const runtimeCode = isPrologueError(error) ? error.code : undefined;
  // A plain failure keeps its own words (Molis code writes them for the person); an unlisted SDK one gets the generic sentence.
  const words = !runtimeCode && error instanceof Error && error.message ? error.message : "执行器没能完成这次操作，请刷新后按当前状态再试";
  const raised = (runtimeCode && SDK_CONTROL_CODES[runtimeCode]?.()) || agentErrors.control_failed(words);
  return new ActionError(raised.code, raised.message, { kind: raised.kind, cause: error, ...(runtimeCode ? { details: { runtime_code: runtimeCode } } : {}) });
}
