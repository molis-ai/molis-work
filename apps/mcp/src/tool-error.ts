import { actionErrorBody } from "@molis-ai/molis-work-plugin-sdk";

/** One wire error for ordinary actions, context tools and management tools. The Host supplies only a recorded diagnostic id. */
export function formatMcpToolError(error: unknown, callId?: string): string {
  const { details: original, ...body } = actionErrorBody(error);
  const details = { ...original };
  delete details.code;
  delete details.call_id;
  return JSON.stringify({ ...body, ...(Object.keys(details).length ? { details } : {}), ...(callId ? { call_id: callId } : {}) });
}
