import type { AccountEnvironmentConfig, AccountEnvelope, AccountOperationInput, UserView, SessionView } from "@molis-ai/molis-work-contracts/services/account";
import { accountErrors } from "./errors.js";
import { accountOperation, isRecord, prepareOperation } from "./operations.js";
import { sendOperation } from "./transport.js";
import { sessionTokens, validSession, validUser } from "./session-state.js";
import type { SessionTokens } from "./session-types.js";

export type PrivateAccountOperation = "exchangeToken" | "getMe" | "logoutCurrent" | "logoutAll";
/** Separate from mutable current credentials: bootstrap and revocation must not borrow a later login. */
export async function privateAccountRequest(config: AccountEnvironmentConfig, fetcher: typeof fetch, id: PrivateAccountOperation,
  input: AccountOperationInput, signal: AbortSignal, accessToken?: string): Promise<AccountEnvelope> {
  const operation = accountOperation(id), prepared = prepareOperation(config, operation, input);
  if (prepared.requiresSession && !accessToken) throw accountErrors.login_required("Account login is required");
  if (accessToken && isRecord(input.body) && "refreshProof" in input.body) throw accountErrors.invalid_request("Conflicting account credentials");
  const headers: Record<string, string> = { Accept: "application/json", Origin: config.productOrigin };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (input.body !== undefined) headers["Content-Type"] = "application/json";
  if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey;
  return sendOperation(fetcher, prepared.url, operation, { method: operation.method, headers,
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }) });
}
export async function identifyAccountTokens(config: AccountEnvironmentConfig, fetcher: typeof fetch, input: unknown, signal: AbortSignal): Promise<{ tokens: SessionTokens; user: UserView; capabilities: readonly string[] }> {
  const tokens = sessionTokens(config, input);
  const result = await privateAccountRequest(config, fetcher, "getMe", {}, signal, tokens.accessToken);
  const value = result.data;
  if (!isRecord(value) || !validUser(config, value.user) || !validSession(config, value.session)
    || value.session.loginSessionId !== tokens.session.loginSessionId || value.session.authenticatedAt !== tokens.session.authenticatedAt
    || value.session.absoluteExpiresAt !== tokens.session.absoluteExpiresAt || !Array.isArray(value.platformCapabilities))
    throw accountErrors.forbidden("Account identity does not match the issued session");
  return { tokens: { ...tokens, session: value.session }, user: value.user, capabilities: value.platformCapabilities };
}
export function sameLogin(left: SessionView, right: SessionView): boolean {
  return left.loginSessionId === right.loginSessionId && left.applicationId === right.applicationId && left.clientId === right.clientId
    && left.authenticatedAt === right.authenticatedAt && left.absoluteExpiresAt === right.absoluteExpiresAt;
}

/** Activity does not advance the revocation revision; lastActiveAt orders responses within that revision. */
export function latestAccountSession(current: SessionView, incoming: SessionView): SessionView {
  return incoming.sessionRevision > current.sessionRevision
    || (incoming.sessionRevision === current.sessionRevision && Date.parse(incoming.lastActiveAt) > Date.parse(current.lastActiveAt))
    ? incoming : current;
}
