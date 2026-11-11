import { accountErrors } from "./errors.js";
import { isRecord, validateOperationResponse, type AccountOperation } from "./operations.js";
import type { AccountEnvelope } from "@molis-ai/molis-work-contracts/services/account";

const MAX_BYTES = 4 * 1024 * 1024;
async function readBody(response: Response): Promise<unknown> {
  if (response.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !response.body) throw accountErrors.upstream_invalid("Invalid account service response");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw accountErrors.upstream_invalid("Account service response exceeds its limit");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw accountErrors.upstream_invalid("Invalid account service response"); }
}

function upstreamFailure(status: number, body: Record<string, unknown>): Error {
  const error = body.error as Record<string, unknown>;
  const details = { authCode: error.code, requestId: body.requestId,
    ...(error.fields === undefined ? {} : { fields: error.fields }),
    ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }) };
  const raiser = status === 400 ? accountErrors.invalid_request : status === 401 ? accountErrors.login_required
    : status === 403 ? accountErrors.forbidden : status === 404 ? accountErrors.not_found
    : status === 409 ? accountErrors.conflict : status === 429 ? accountErrors.rate_limited : accountErrors.unavailable;
  return raiser("Account service rejected the operation", details);
}

export async function sendOperation(fetcher: typeof fetch, url: URL, operation: AccountOperation, request: RequestInit): Promise<AccountEnvelope> {
  const encoded = request.body;
  if (typeof encoded === "string" && new TextEncoder().encode(encoded).length > MAX_BYTES) throw accountErrors.invalid_request("Account request exceeds its limit");
  let response: Response;
  const headers = new Headers(request.headers);
  headers.set("Cache-Control", "no-store");
  try { response = await fetcher(url, { ...request, headers, redirect: "manual", credentials: "omit" }); }
  catch { throw accountErrors.unavailable("Account service is unavailable"); }
  if (response.redirected || (response.url && response.url !== url.href) || (response.status >= 300 && response.status < 400)) throw accountErrors.upstream_invalid("Account service redirect rejected");
  let body: unknown;
  try { body = await readBody(response); }
  catch (error) {
    if (isRecord(error) && error.code === "account.upstream_invalid") throw error;
    throw accountErrors.unavailable("Account service response could not be read");
  }
  if (!validateOperationResponse(operation, response.status, body) || !isRecord(body)) throw accountErrors.upstream_invalid("Account response does not match the contract");
  if (response.status !== 200) throw upstreamFailure(response.status, body);
  return { requestId: String(body.requestId), data: body.data };
}
