import type { AccountCallControl, AccountEnvironmentConfig } from "@molis-ai/molis-work-contracts/services/account";
import type { AccountSessionManager } from "./session-types.js";
import { accountErrors } from "./errors.js";
import { isRecord } from "./operations.js";
import { assertAuthentication, authenticationDigest, authenticationView, newAuthentication, validAuthentication, type AuthenticationTransaction } from "./authentication-protocol.js";
export interface AuthenticationStore {
  get(handle: string, control: AccountCallControl): AuthenticationTransaction;
  keep(t: AuthenticationTransaction): void;
  discard(t: AuthenticationTransaction): void;
}
export function createAuthenticationManagement(config: AccountEnvironmentConfig, sessions: AccountSessionManager, store: AuthenticationStore) {
  return {
    async create(input: Record<string, unknown>, control: AccountCallControl, reauth = false) {
      const parent = reauth ? undefined : store.get(String(input.reauthHandle), control);
      if (parent) {
        assertAuthentication(parent);
        const type = input.method === "EMAIL_CODE" ? "EMAIL" : input.method === "PHONE_OTP" ? "PHONE" : input.method;
        if (!parent.operationProof || parent.purpose !== "REAUTH" || (input.purpose === "BIND"
          ? parent.operation !== "BIND_METHOD" || parent.target?.method !== type
          : parent.operation !== "REPLACE_METHOD" || parent.target?.bindingId !== input.bindingId)) throw accountErrors.forbidden("Verification does not match this operation");
      }
      const binding = await sessions.authentication(control), t = newAuthentication(reauth ? "REAUTH" : String(input.purpose), String(input.method));
      Object.assign(t, { binding, parent, ...(reauth ? { operation: input.operation, target: input.target } : { bindingId: input.bindingId }) });
      store.keep(t);
      try {
        const data = (await binding.invoke(reauth ? "createReauthentication" : "createTransaction", { body: {
          clientId: config.clientId, redirectUri: config.redirectAllowlist[0], state: t.state, method: t.method,
          codeChallenge: authenticationDigest(t.verifier), codeChallengeMethod: "S256", initiatorChallenge: authenticationDigest(t.proof),
          ...(reauth ? { operation: input.operation, target: input.target } : { purpose: input.purpose, ...(input.purpose === "REPLACE" ? { bindingId: input.bindingId } : {}) }),
        } }, { ...control, assertCurrent: () => { control.assertCurrent(); assertAuthentication(t); } })).data;
        if (!isRecord(data)) throw accountErrors.upstream_invalid("Invalid authentication result");
        t.id = String(data.transactionId); t.expiresAt = String(data.expiresAt); t.nextStep = String(data.nextStep); return authenticationView(t);
      } catch (error) { store.discard(t); throw error; } finally { t.busy = false; }
    },
    async mutate(action: "bind" | "replace" | "unlink" | "password", input: unknown, key: string, control: AccountCallControl, bindingId?: string) {
      validAuthentication(action === "password" ? "ProductPasswordChangeRequest" : action === "unlink" ? "ProductUnlinkRequest" : "ProductBindRequest", input);
      if (!/^[\x20-\x7e]{16,128}$/u.test(key)) throw accountErrors.invalid_request("Invalid idempotency key");
      if (bindingId !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/u.test(bindingId)) throw accountErrors.invalid_request("Invalid login method");
      const t = store.get(String(input.reauthHandle), control); assertAuthentication(t);
      const fingerprint = authenticationDigest(JSON.stringify({ action, bindingId, input }));
      if (t.busy) throw accountErrors.conflict("Authentication operation in progress");
      if (t.receipt) {
        if (t.receipt.key !== key || t.receipt.digest !== fingerprint) throw accountErrors.conflict("Authentication receipt does not match");
        return t.receipt.result;
      }
      if (!t.binding || !t.operationProof || t.purpose !== "REAUTH" || t.operation !== ({ bind: "BIND_METHOD", replace: "REPLACE_METHOD", unlink: "UNLINK_METHOD", password: "CHANGE_PASSWORD" }[action]) || (bindingId && t.target?.bindingId !== bindingId)) throw accountErrors.forbidden("Verification does not match this operation");
      const identity = "identityHandle" in input ? store.get(String(input.identityHandle), control) : undefined;
      if (identity) {
        assertAuthentication(identity);
        if (identity.busy || !identity.identityProof || identity.parent !== t || identity.purpose !== (action === "bind" ? "BIND" : "REPLACE") || identity.bindingId !== bindingId) throw accountErrors.forbidden("New identity verification does not match");
      }
      t.busy = true; if (identity) identity.busy = true;
      try {
        const result = await t.binding.invoke(({ bind: "bindMethod", replace: "replaceMethod", unlink: "unlinkMethod", password: "changePassword" }[action]), {
          ...(bindingId ? { params: { bindingId } } : {}), idempotencyKey: key,
          body: { operationProof: t.operationProof, expectedVersion: input.expectedVersion, ...(identity ? { newIdentityProof: identity.identityProof } : {}), ...(action === "password" ? { newPassword: input.newPassword } : {}) },
        }, { ...control, assertCurrent: () => { control.assertCurrent(); assertAuthentication(t); if (identity) assertAuthentication(identity); } });
        t.operationProof = undefined; if (identity) identity.identityProof = undefined;
        t.receipt = { key, digest: fingerprint, result: result.data }; return result.data;
      } finally { t.busy = false; if (identity) identity.busy = false; }
    },
  };
}
