import { recordedCallId } from "@molis-ai/molis-work-kernel";

/** The header that carries the number of the operation an answer belongs to. */
const CALL_ID_HEADER = "x-molis-work-call-id";

const isErrorBody = (body: unknown): body is Record<string, unknown> =>
  typeof body === "object" && body !== null && !Array.isArray(body) && ("error" in body || "code" in body);

/**
 * What a JSON answer says of the operation it answers: its number, but only when the call log holds a row for the operation, so the number a
 * person copies from an error can always be looked up. The header goes on every such answer; the number joins the body only of an error
 * (status 400 or more, an object with `error` or `code`), where `call_id` is the name reserved for it. An answer to an operation that left
 * no row (refused at the door, a read that worked and then a 404 the route judged) carries nothing.
 */
export function withRecordedCallId(status: number, body: unknown): { headers: Record<string, string>; body: unknown } {
  const id = recordedCallId();
  if (!id) return { headers: {}, body };
  return { headers: { [CALL_ID_HEADER]: id }, body: status >= 400 && isErrorBody(body) ? { ...body, call_id: id } : body };
}

/**
 * For an answer that is not an error but must still tell the process that asked which operation it was (the gateway to a forwarding MCP
 * process, which has no response headers to read): `{ call_id }` when the operation has a row in the call log, else nothing.
 */
export function recordedCallIdField(): { call_id?: string } {
  const id = recordedCallId();
  return id ? { call_id: id } : {};
}
