import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { GoalsHttpContext } from "./types.js";

/** Owners classify their failures; the Goals transport shares the SDK's status and response body. */
export function respondGoalsFailure(context: GoalsHttpContext, error: unknown): true {
  const { status, body } = actionErrorResponse(error);
  context.respond(status, body);
  return true;
}
