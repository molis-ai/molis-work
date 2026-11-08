import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AccountCallControl, AccountEnvironmentConfig, AccountOperationInput } from "@molis-ai/molis-work-contracts/services/account";
import type { AccountAuthenticationSession, AccountLoginAttempt, AccountSessionManager } from "./session-types.js";
import { createAccountService } from "./client.js";
import { accountProviderStartUrl } from "./provider.js";
import { accountErrors } from "./errors.js";
import { isRecord } from "./operations.js";
import { validateNamed } from "./upstream/validate.js";
export interface AuthenticationTransaction {
  handle: string; id: string; purpose: string; method: string; state: string; proof: string; verifier: string;
  expiresAt: string; status: string; nextStep: string; busy: boolean; finished?: boolean; address?: string;
  attempt?: AccountLoginAttempt; binding?: AccountAuthenticationSession; parent?: AuthenticationTransaction;
  operation?: string; target?: Record<string, unknown>; bindingId?: string;
  challenge?: { handle: string; id: string }; verification?: string; reset?: string; operationProof?: string; identityProof?: string;
  receipt?: { digest: string; key: string; result: unknown };
}
const secret = () => randomBytes(32).toString("base64url");
export const authenticationDigest = (value: string) => createHash("sha256").update(value).digest("base64url");
export const authenticationView = (t: AuthenticationTransaction) => ({ handle: t.handle, status: t.status === "CONSUMED" && t.purpose === "LOGIN" && !t.finished ? "PENDING" : t.status,
  nextStep: t.status === "CONSUMED" && t.purpose === "LOGIN" && !t.finished ? "WAIT_PROVIDER" : t.nextStep, expiresAt: t.expiresAt });
export function validAuthentication(name: string, value: unknown): asserts value is Record<string, unknown> {
  if (!validateNamed(name, value) || !isRecord(value)) throw accountErrors.invalid_request("Invalid authentication input");
}
export function newAuthentication(purpose: string, method: string): AuthenticationTransaction {
  return { handle: randomUUID(), id: "", purpose, method, state: secret(), proof: secret(), verifier: secret(), expiresAt: new Date(Date.now() + 600_000).toISOString(), status: "PENDING", nextStep: "NONE", busy: true };
}
export function assertAuthentication(t: AuthenticationTransaction): void {
  t.binding?.assertCurrent(); t.attempt?.assertCurrent();
  if (["CANCELLED", "EXPIRED"].includes(t.status) || Date.parse(t.expiresAt) <= Date.now()) throw accountErrors.conflict("Authentication transaction has ended");
  if (t.parent) assertAuthentication(t.parent);
}
/** Shared central verification steps; only opaque handles cross the Host boundary. */
export class AuthenticationProtocol {
  constructor(private readonly config: AccountEnvironmentConfig, private readonly sessions: AccountSessionManager, private readonly fetcher?: typeof fetch) {}
  service(t: AuthenticationTransaction) {
    return createAccountService(this.config, { currentCredential: () => null, resolveSecret: async ref => ref === t.handle ? t.proof : null, ...(this.fetcher ? { fetch: this.fetcher } : {}) });
  }
  async call(t: AuthenticationTransaction, operation: string, body: unknown, control: AccountCallControl, challengeId?: string) {
    assertAuthentication(t);
    if (!["PENDING", "VERIFIED"].includes(t.status)) throw accountErrors.conflict("Authentication transaction has ended");
    const input: AccountOperationInput = { params: { transactionId: t.id, ...(challengeId ? { challengeId } : {}) }, ...(body === undefined ? {} : { body }) };
    const guarded = { ...control, assertCurrent: () => { control.assertCurrent(); assertAuthentication(t); } };
    const reply = t.binding ? await t.binding.invoke(operation, input, guarded, { reference: t.handle, value: t.proof }) : await this.service(t).invoke(operation, input, { ...guarded, initiatorProofRef: t.handle });
    if (!isRecord(reply.data)) throw accountErrors.upstream_invalid("Invalid authentication result");
    return reply.data;
  }
  async sync(t: AuthenticationTransaction, control: AccountCallControl) {
    const data = await this.call(t, "getTransaction", undefined, control);
    t.status = String(data.status); t.nextStep = String(data.nextStep); return authenticationView(t);
  }
  async send(t: AuthenticationTransaction, control: AccountCallControl) {
    if (!t.address || t.status !== "PENDING" || t.verification) throw accountErrors.invalid_request("Challenge cannot be sent");
    const data = await this.call(t, "createChallenge", { channel: t.method === "PHONE_OTP" ? "SMS" : "EMAIL", address: t.address }, control);
    t.challenge = { handle: t.challenge?.handle ?? randomUUID(), id: String(data.challengeId) }; t.nextStep = "VERIFY_CHALLENGE";
    return { challengeHandle: t.challenge.handle, expiresAt: data.expiresAt, retryAfterSeconds: data.retryAfterSeconds, nextStep: "VERIFY_CHALLENGE" };
  }
  async complete(t: AuthenticationTransaction, control: AccountCallControl) {
    const data = await this.call(t, "completeTransaction", {}, control);
    if (t.binding || t.purpose === "PASSWORD_RESET") {
      const kind = t.purpose === "REAUTH" ? "OPERATION_PROOF" : t.purpose === "PASSWORD_RESET" ? "RESET_PROOF" : "NEW_IDENTITY_PROOF";
      if (data.kind !== kind) throw accountErrors.upstream_invalid("Invalid verification result");
      if (kind === "OPERATION_PROOF") t.operationProof = String(data.operationProof);
      else if (kind === "RESET_PROOF") t.reset = String(data.resetProof);
      else t.identityProof = String(data.newIdentityProof);
      t.expiresAt = new Date(Math.min(Date.parse(t.expiresAt), Date.parse(String(data.expiresAt)))).toISOString();
      t.nextStep = "NONE"; t.status = "CONSUMED"; return { operationReady: true };
    }
    if (data.kind !== "LOGIN_CODE" || data.state !== t.state || !t.attempt) throw accountErrors.upstream_invalid("Invalid login result");
    t.status = "CONSUMED"; t.nextStep = "NONE";
    const tokens = await this.service(t).invoke("exchangeToken", { body: { grantType: "authorization_code", clientId: this.config.clientId, code: data.code, redirectUri: this.config.redirectAllowlist[0], codeVerifier: t.verifier } }, control);
    const account = await this.sessions.completeLogin(t.attempt, tokens.data, control);
    t.finished = true; return { account };
  }
  async submit(t: AuthenticationTransaction, input: Record<string, unknown>, control: AccountCallControl): Promise<unknown> {
    const step = input.step;
    if (step !== t.nextStep) throw accountErrors.invalid_request("Unexpected authentication step");
    if (step === "REQUEST_CHALLENGE") {
      if (!["PHONE_OTP", "EMAIL_CODE"].includes(t.method)) throw accountErrors.invalid_request("Unexpected authentication method");
      validAuthentication("ChallengeRequest", { channel: t.method === "PHONE_OTP" ? "SMS" : "EMAIL", address: input.address });
      t.address = String(input.address); return this.send(t, control);
    }
    if (step === "START_PROVIDER") {
      if (!["GOOGLE", "GITHUB"].includes(t.method)) throw accountErrors.invalid_request("Invalid provider");
      const result = await this.call(t, t.method === "GOOGLE" ? "startGoogle" : "startGitHub", {}, control);
      const browserStartUrl = accountProviderStartUrl(this.config, t.method, result.browserStartUrl);
      t.nextStep = "WAIT_PROVIDER"; return { browserStartUrl };
    }
    if (step === "VERIFY_CHALLENGE") {
      if (!t.challenge || input.challengeHandle !== t.challenge.handle) throw accountErrors.forbidden("Challenge does not belong to this transaction");
      const result = await this.call(t, "verifyChallenge", { credential: input.credential }, control, t.challenge.id);
      t.verification = String(result.verificationProof); return this.sync(t, control);
    }
    if (step === "PASSWORD_LOGIN") await this.call(t, "verifyPassword", { email: input.email, password: input.password }, control);
    else if (step === "EMAIL_SIGNUP") {
      if (!t.verification || String(input.email).trim().toLowerCase() !== t.address?.trim().toLowerCase()) throw accountErrors.forbidden("Email does not match the verified address");
      await this.call(t, "signUpEmail", { email: input.email, password: input.password, verificationProof: t.verification }, control); t.verification = undefined;
    } else if (step === "PHONE_LOGIN") {
      if (!t.verification) throw accountErrors.forbidden("Phone verification is required");
      await this.call(t, "signInPhone", { verificationProof: t.verification }, control); t.verification = undefined;
    } else if (step === "COMPLETE") return this.complete(t, control);
    else throw accountErrors.invalid_request("Authentication step not supported");
    return this.sync(t, control);
  }
}
