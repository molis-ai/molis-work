import type { AccountCallControl, AccountEnvironmentConfig } from "@molis-ai/molis-work-contracts/services/account";
import type { AccountSessionManager } from "./session-types.js";
import { assertAccountProviderCallback } from "./provider.js";
import { accountErrors } from "./errors.js";
import { isRecord } from "./operations.js";
import { createAuthenticationManagement } from "./authentication-management.js";
import { AuthenticationProtocol, assertAuthentication, authenticationDigest, authenticationView, newAuthentication, validAuthentication, type AuthenticationTransaction } from "./authentication-protocol.js";

/** Host-only credential protocol. All pending secrets are memory-only and expire on restart. */
export function createAccountAuthentication(config: AccountEnvironmentConfig, sessions: AccountSessionManager, fetcher?: typeof fetch) {
  const pending = new Map<string, AuthenticationTransaction>(), protocol = new AuthenticationProtocol(config, sessions, fetcher);
  const nativeCallbacks = new WeakSet<AuthenticationTransaction>();
  const callbackAttempt = (url: URL) => [...pending.values()].find(item => item.id === url.searchParams.get("transactionId"));
  let current: AuthenticationTransaction | undefined;
  const discard = (t: AuthenticationTransaction) => { t.status = "CANCELLED"; t.nextStep = "NONE"; t.operationProof = undefined; t.identityProof = undefined; t.reset = undefined; t.verification = undefined; };
  const keep = (t: AuthenticationTransaction) => {
    for (const [key, old] of pending) if (Date.parse(old.expiresAt) <= Date.now() || ["CANCELLED", "EXPIRED"].includes(old.status)) { discard(old); pending.delete(key); }
    if (pending.size >= 32) throw accountErrors.conflict("Too many account verifications");
    pending.set(t.handle, t);
  };
  const lookup = (handle: string, control: AccountCallControl) => {
    control.assertCurrent(); if (control.signal?.aborted) throw accountErrors.cancelled("Authentication request cancelled");
    const t = pending.get(handle);
    if (!t) throw accountErrors.not_found("Authentication transaction not found");
    t.binding?.assertCurrent();
    if (!t.finished && !["CANCELLED", "EXPIRED"].includes(t.status) && Date.parse(t.expiresAt) <= Date.now()) {
      discard(t); t.status = "EXPIRED"; if (t.attempt) sessions.cancelLogin(t.attempt);
    }
    return t;
  };
  const management = createAuthenticationManagement(config, sessions, { get: lookup, keep, discard });
  async function exclusive<T>(handle: string, control: AccountCallControl, run: (t: AuthenticationTransaction) => Promise<T>) {
    const t = lookup(handle, control); assertAuthentication(t);
    if (t.busy) throw accountErrors.conflict("Authentication operation in progress");
    t.busy = true; try { return await run(t); } finally { t.busy = false; }
  }
  return {
    async create(input: unknown, control: AccountCallControl) {
      validAuthentication("ProductTransactionRequest", input);
      if (["BIND", "REPLACE"].includes(String(input.purpose))) return management.create(input, control);
      const attempt = sessions.beginLogin(control), t = newAuthentication(String(input.purpose), String(input.method));
      if (current) { discard(current); pending.delete(current.handle); }
      t.attempt = attempt; current = t; keep(t);
      try {
        const result = await protocol.service(t).invoke("createTransaction", { body: { clientId: config.clientId, redirectUri: config.redirectAllowlist[0], state: t.state,
          purpose: t.purpose, method: t.method, codeChallenge: authenticationDigest(t.verifier), codeChallengeMethod: "S256", initiatorChallenge: authenticationDigest(t.proof) } },
          { ...control, assertCurrent: () => { control.assertCurrent(); attempt.assertCurrent(); } });
        if (!isRecord(result.data)) throw accountErrors.upstream_invalid("Invalid authentication result");
        t.id = String(result.data.transactionId); t.expiresAt = String(result.data.expiresAt); t.nextStep = String(result.data.nextStep); return authenticationView(t);
      } catch (error) { sessions.cancelLogin(attempt); pending.delete(t.handle); throw error; } finally { t.busy = false; }
    },
    async reauthenticate(input: unknown, control: AccountCallControl) { validAuthentication("ProductReauthenticationRequest", input); return management.create(input, control, true); },
    mutate: management.mutate,
    async get(handle: string, control: AccountCallControl) { return authenticationView(lookup(handle, control)); },
    matchesNativeCallback(url: URL, origin?: string): boolean {
      const t = callbackAttempt(url);
      if (!t || !nativeCallbacks.has(t) || t.busy || t.finished) return false;
      try {
        assertAccountProviderCallback(config, url, origin, t);
        assertAuthentication(t);
        return true;
      } catch { return false; }
    },
    async callback(url: URL, origin: string | undefined, control: AccountCallControl) {
      const t = callbackAttempt(url);
      assertAccountProviderCallback(config, url, origin, t);
      return exclusive(t.handle, control, async transaction => {
        await protocol.sync(transaction, control);
        if (url.searchParams.get("result") !== "VERIFIED") {
          if (transaction.status !== "CANCELLED") throw accountErrors.forbidden("Provider cancellation not confirmed");
          if (transaction.attempt) sessions.cancelLogin(transaction.attempt); return { status: "CANCELLED" };
        }
        if (transaction.status !== "VERIFIED") throw accountErrors.forbidden("Provider verification not confirmed");
        await protocol.complete(transaction, control); return { status: "COMPLETE" };
      });
    },
    async submit(handle: string, input: unknown, control: AccountCallControl, nativeCallback = false) {
      validAuthentication("ProductSubmitRequest", input);
      return exclusive(handle, control, async t => {
        const result = await protocol.submit(t, input, control);
        if (nativeCallback && input.step === "START_PROVIDER") {
          control.assertCurrent();
          assertAuthentication(t);
          nativeCallbacks.add(t);
        }
        return result;
      });
    },
    async resend(handle: string, control: AccountCallControl) { await exclusive(handle, control, t => protocol.send(t, control)); return authenticationView(lookup(handle, control)); },
    async cancel(handle: string, control: AccountCallControl) {
      const t = lookup(handle, control);
      if (t.finished || ["CANCELLED", "EXPIRED"].includes(t.status)) return authenticationView(t);
      discard(t); if (t.attempt) sessions.cancelLogin(t.attempt); return authenticationView(t);
    },
    async reset(input: unknown, control: AccountCallControl) {
      validAuthentication("ProductPasswordResetRequest", input);
      return exclusive(String(input.resetHandle), control, async t => {
        if (t.purpose !== "PASSWORD_RESET" || !t.reset || !t.attempt) throw accountErrors.conflict("Password reset is not ready");
        const proof = t.reset; t.reset = undefined;
        const result = await protocol.service(t).invoke("resetPassword", { body: { transactionId: t.id, resetProof: proof, newPassword: input.newPassword } },
          { ...control, initiatorProofRef: t.handle, assertCurrent: () => { control.assertCurrent(); assertAuthentication(t); } });
        sessions.cancelLogin(t.attempt); t.finished = true; return result.data;
      });
    },
    close() { for (const t of pending.values()) discard(t); pending.clear(); current = undefined; },
  };
}
