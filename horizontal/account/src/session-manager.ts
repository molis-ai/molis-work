import { createHash, randomUUID } from "node:crypto";
import type { AccountCallControl, AccountCredentialReference, AccountEnvelope, AccountEnvironmentConfig, AccountOperationInput, AccountService, AccountView, SessionView } from "@molis-ai/molis-work-contracts/services/account";
import { createAccountService } from "./client.js";
import { parseAccountEnvironment } from "./config.js";
import { accountErrors } from "./errors.js";
import { centralAccountOperationForProduct, isRecord } from "./operations.js";
import { AccountSessionState, checkAccountControl, sessionTokens, validSession } from "./session-state.js";
import { identifyAccountTokens, latestAccountSession, privateAccountRequest, sameLogin } from "./session-protocol.js";
import { AccountRefreshJob } from "./session-refresh.js";
import { validateNamed } from "./upstream/validate.js";
import type { AccountLoginAttempt, AccountLogoutResult, AccountLogoutScope, AccountSessionManager, AccountSessionManagerPorts, ActiveAccount, LogoutReceipt, SessionTokens } from "./session-types.js";

interface PendingLogin { readonly attempt: AccountLoginAttempt; readonly controller: AbortController; readonly epoch: number; used: boolean }
interface EndingLogin { readonly scope: AccountLogoutScope; readonly keyDigest: string; readonly snapshot?: ActiveAccount; readonly rotation?: AccountRefreshJob; promise?: Promise<AccountLogoutResult> }
const code = (error: unknown) => isRecord(error) ? error.code : undefined;
const offline = (error: unknown) => ["account.unavailable", "account.timeout"].includes(String(code(error)));
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function createAccountSessionManager(config: AccountEnvironmentConfig, ports: AccountSessionManagerPorts): AccountSessionManager {
  return new HostAccountSessions(parseAccountEnvironment(config), ports);
}

class HostAccountSessions implements AccountSessionManager {
  private readonly state: AccountSessionState;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly lifetime = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly attempts = new WeakMap<AccountLoginAttempt, PendingLogin>();
  private login?: PendingLogin;
  private rotation?: AccountRefreshJob;
  private ending?: EndingLogin;
  private readonly client: AccountService;
  constructor(private readonly config: AccountEnvironmentConfig, ports: AccountSessionManagerPorts) {
    this.state = new AccountSessionState(config, ports.storage); this.fetcher = ports.fetch ?? fetch; this.now = ports.now ?? Date.now;
    this.client = createAccountService(config, {
      currentCredential: () => {
        const current = this.state.load(), saved = current.state === "ACTIVE" ? current : this.rotation?.base;
        if (this.ending || !saved) return null;
        return { secretRef: "current-access", issuer: config.authOrigin, environmentId: config.environmentId, applicationId: config.applicationId,
          clientId: config.clientId, userId: saved.user.userId, sessionId: saved.tokens.session.loginSessionId } satisfies AccountCredentialReference;
      },
      resolveSecret: async reference => {
        const current = this.state.load(), saved = current.state === "ACTIVE" ? current : this.rotation?.base;
        return reference === "current-access" && !this.ending && saved ? saved.tokens.accessToken : null;
      }, fetch: this.fetcher,
    });
  }
  async accessToken(control: AccountCallControl): Promise<string> {
    const guarded = this.guard(control);
    await this.verified(guarded);
    checkAccountControl(guarded);
    return this.active().tokens.accessToken;
  }
  private track<T>(operation: () => Promise<T>): Promise<T> {
    const pending = operation(); this.pending.add(pending);
    void pending.finally(() => this.pending.delete(pending)).catch(() => { /* The original caller observes the rejection. */ });
    return pending;
  }
  private guard(control: AccountCallControl, epoch = this.state.epoch): AccountCallControl {
    const signal = AbortSignal.any([this.state.controller.signal, this.lifetime.signal, ...(control.signal ? [control.signal] : [])]);
    return { signal, beforeEffect: control.beforeEffect, assertCurrent: () => { checkAccountControl(control); this.state.assertEpoch(epoch); } };
  }
  private expire(): void { this.state.invalidate(); this.state.write({ state: "EXPIRED" }); }
  private active(): ActiveAccount {
    const saved = this.state.load();
    if (this.ending || saved.state !== "ACTIVE") throw accountErrors.login_required("Account login is required");
    if (Math.min(Date.parse(saved.tokens.session.idleExpiresAt), Date.parse(saved.tokens.session.absoluteExpiresAt)) <= this.now()) {
      this.expire(); throw accountErrors.login_required("Account session has expired");
    }
    return saved;
  }
  private async refresh(control: AccountCallControl): Promise<void> {
    if (this.rotation) return this.rotation.wait(control);
    const base = this.active(), job = new AccountRefreshJob(base), epoch = this.state.epoch;
    job.participants.add(control); this.rotation = job;
    job.promise = this.rotate(job, epoch).finally(() => { if (this.rotation === job) this.rotation = undefined; });
    void job.promise.catch(() => { /* Every waiter and close() separately observe this owned task. */ });
    this.pending.add(job.promise); void job.promise.finally(() => this.pending.delete(job.promise)).catch(() => undefined);
    return job.wait(control);
  }
  private async rotate(job: AccountRefreshJob, epoch: number): Promise<void> {
    job.assertParticipant(); this.state.assertEpoch(epoch);
    this.state.write({ state: "REFRESHING", user: job.base.user, session: job.base.tokens.session });
    try {
      const result = await privateAccountRequest(this.config, this.fetcher, "exchangeToken", {
        body: { grantType: "refresh_token", clientId: this.config.clientId, refreshToken: job.base.tokens.refreshToken },
      }, this.state.controller.signal);
      job.produced = sessionTokens(this.config, result.data);
      if (!sameLogin(job.base.tokens.session, job.produced.session)) throw accountErrors.forbidden("Account refresh changed its login");
      this.state.assertEpoch(epoch); job.assertParticipant();
      this.state.write({ state: "ACTIVE", user: job.base.user, tokens: job.produced });
    } catch (error) {
      if (!this.state.closed && this.state.epoch === epoch && code(error) === "account.login_required") this.expire();
      throw error;
    }
  }
  private async fresh(control: AccountCallControl): Promise<void> {
    checkAccountControl(control); this.state.load();
    if (this.rotation) await this.rotation.wait(control);
    const active = this.active();
    if (Date.parse(active.tokens.accessExpiresAt) <= this.now() + 30_000) await this.refresh(control);
    checkAccountControl(control);
  }
  private async verified(control: AccountCallControl): Promise<Extract<AccountView, { state: "AUTHENTICATED" }>> {
    await this.fresh(control);
    const accessBeforeRead = this.active().tokens.accessToken;
    let view: AccountView;
    try { view = await this.client.readSession(control); }
    catch (error) {
      if (code(error) !== "account.login_required") throw error;
      // A delayed 401 may refer to the previous token after another reader already rotated it.
      if (!this.rotation && this.state.load().state !== "ACTIVE") throw accountErrors.unavailable("Account refresh did not complete");
      if (this.rotation || this.active().tokens.accessToken === accessBeforeRead) await this.refresh(control);
      view = await this.client.readSession(control); // Exactly one read-only recovery; writes are never replayed.
    }
    checkAccountControl(control);
    if (view.state !== "AUTHENTICATED") throw accountErrors.login_required("Account login is required");
    if (this.rotation) await this.rotation.wait(control);
    const active = this.active();
    if (!sameLogin(active.tokens.session, view.session)) throw accountErrors.forbidden("Account verification changed its login");
    const user = active.user.version > view.user.version ? active.user : view.user;
    const session = latestAccountSession(active.tokens.session, view.session);
    if (JSON.stringify(active.user) !== JSON.stringify(user) || JSON.stringify(active.tokens.session) !== JSON.stringify(session))
      this.state.write({ state: "ACTIVE", user, tokens: { ...active.tokens, session } });
    return view;
  }
  readSession(control: AccountCallControl): Promise<AccountView> {
    return this.track(async () => {
      checkAccountControl(control); const saved = this.state.load();
      if (this.ending || saved.state === "EMPTY") return { state: "ANONYMOUS" };
      if (saved.state === "EXPIRED") return { state: "EXPIRED" };
      if (saved.state === "OFFLINE" || (saved.state === "REFRESHING" && !this.rotation)) return { state: "OFFLINE_CACHED", user: saved.user };
      const epoch = this.state.epoch, guarded = this.guard(control, epoch);
      try { return await this.verified(guarded); }
      catch (error) {
        checkAccountControl(control); this.state.assertOpen();
        if (this.state.epoch !== epoch) {
          if (this.state.load().state === "EXPIRED") return { state: "EXPIRED" };
          throw accountErrors.conflict("Current account changed during the operation");
        }
        if (code(error) === "account.login_required") { this.expire(); return { state: "EXPIRED" }; }
        if (offline(error)) return { state: "OFFLINE_CACHED", user: saved.user };
        throw error;
      }
    });
  }
  invoke(operationId: string, input: AccountOperationInput, control: AccountCallControl): Promise<AccountEnvelope> {
    return this.track(async () => {
      const product = operationId === "updateProfile" ? "productUpdateProfile" : operationId === "listLoginMethods" ? "productListLoginMethods" : `product_${operationId}`;
      if (centralAccountOperationForProduct(product) !== operationId) throw accountErrors.invalid_request("Unknown account management operation");
      checkAccountControl(control); this.state.load(); const guarded = this.guard(control);
      await this.verified(guarded);
      return this.client.invoke(operationId, input, guarded);
    });
  }
  async authentication(control: AccountCallControl) {
    checkAccountControl(control); this.state.load(); const bound = this.guard(control);
    await this.verified(bound);
    return { signal: bound.signal!, assertCurrent: bound.assertCurrent, invoke: (id: string, input: AccountOperationInput, request: AccountCallControl, proof?: { reference: string; value: string }) => this.track(async () => {
      if (!["createTransaction", "createReauthentication", "getTransaction", "createChallenge", "verifyChallenge", "verifyPassword", "completeTransaction", "startGoogle", "startGitHub", "bindMethod", "replaceMethod", "unlinkMethod", "changePassword"].includes(id)) throw accountErrors.invalid_request("Unknown sensitive account operation");
      const guarded = this.guard({ ...request, assertCurrent: () => { bound.assertCurrent(); request.assertCurrent(); } });
      await this.verified(guarded);
      const client = createAccountService(this.config, {
        currentCredential: () => { const saved = this.rotation?.base ?? this.active(); return { secretRef: "current-access", issuer: this.config.authOrigin, environmentId: this.config.environmentId, applicationId: this.config.applicationId, clientId: this.config.clientId, userId: saved.user.userId, sessionId: saved.tokens.session.loginSessionId }; },
        resolveSecret: async ref => ref === "current-access" ? (this.rotation?.base ?? this.active()).tokens.accessToken : proof?.reference === ref ? proof.value : null, fetch: this.fetcher,
      });
      return client.invoke(id, input, { ...guarded, ...(proof ? { initiatorProofRef: proof.reference } : {}) });
    }) };
  }
  activity(input: unknown, control: AccountCallControl): Promise<SessionView> {
    return this.track(async () => {
      if (!validateNamed("ActivityRequest", input)) throw accountErrors.invalid_request("Invalid account activity");
      checkAccountControl(control); this.state.load(); const guarded = this.guard(control);
      await this.verified(guarded);
      const response = await this.client.invoke("recordActivity", { body: input }, guarded);
      checkAccountControl(guarded);
      if (!validSession(this.config, response.data)) throw accountErrors.upstream_invalid("Invalid account activity result");
      const active = this.active();
      if (!sameLogin(active.tokens.session, response.data)) throw accountErrors.forbidden("Account activity changed its login");
      const session = latestAccountSession(active.tokens.session, response.data);
      if (session !== active.tokens.session)
        this.state.write({ state: "ACTIVE", user: active.user, tokens: { ...active.tokens, session } });
      return response.data;
    });
  }
  beginLogin(control: AccountCallControl): AccountLoginAttempt {
    checkAccountControl(control); const saved = this.state.load();
    if (this.ending || this.rotation || saved.state === "ACTIVE") throw accountErrors.conflict("End the current login before starting another");
    this.login?.controller.abort(); this.state.invalidate();
    const epoch = this.state.epoch, controller = new AbortController();
    const attempt: AccountLoginAttempt = Object.freeze({ id: randomUUID(), signal: AbortSignal.any([controller.signal, this.state.controller.signal, ...(control.signal ? [control.signal] : [])]),
      assertCurrent: () => { checkAccountControl(control); this.state.assertEpoch(epoch); if (this.login?.attempt !== attempt || controller.signal.aborted) throw accountErrors.cancelled("Account login attempt ended"); } });
    this.login = { attempt, controller, epoch, used: false }; this.attempts.set(attempt, this.login); return attempt;
  }
  completeLogin(attempt: AccountLoginAttempt, tokenSet: unknown, control: AccountCallControl): Promise<AccountView> {
    return this.track(async () => {
      // Only a real attempt may claim issued material, once. Keep this identity after cancellation for cleanup.
      const login = this.attempts.get(attempt);
      if (!login || login.used) throw accountErrors.invalid_request("Account login attempt is not available");
      login.used = true;
      const issued = sessionTokens(this.config, tokenSet);
      try {
        checkAccountControl(control);
        if (this.login !== login) throw accountErrors.invalid_request("Account login attempt is not available");
        attempt.assertCurrent();
        const identity = await identifyAccountTokens(this.config, this.fetcher, issued, AbortSignal.any([attempt.signal, ...(control.signal ? [control.signal] : [])]));
        checkAccountControl(control); attempt.assertCurrent();
        if (Math.min(Date.parse(identity.tokens.session.idleExpiresAt), Date.parse(identity.tokens.session.absoluteExpiresAt), Date.parse(identity.tokens.accessExpiresAt)) <= this.now())
          throw accountErrors.login_required("Account session has expired");
        const view = { state: "AUTHENTICATED" as const, user: identity.user, session: identity.tokens.session, capabilities: identity.capabilities };
        if (!validateNamed("AccountView", view)) throw accountErrors.upstream_invalid("Invalid account view");
        this.state.write({ state: "ACTIVE", tokens: identity.tokens, user: identity.user }); this.login = undefined;
        return view as Extract<AccountView, { state: "AUTHENTICATED" }>;
      } catch (error) {
        // Revoke only this issued login. A newer attempt that adopted the same login must remain untouched.
        const current = this.state.closed ? undefined : this.state.load();
        const adoptedSession = current?.state === "ACTIVE" ? current.tokens.session : current?.state === "REFRESHING" ? current.session : undefined;
        if (adoptedSession?.loginSessionId !== issued.session.loginSessionId) await this.revoke("CURRENT_LOGIN", randomUUID(), issued);
        throw error;
      }
    });
  }
  cancelLogin(attempt: AccountLoginAttempt): void {
    this.state.assertOpen();
    if (this.login?.attempt !== attempt) throw accountErrors.invalid_request("Account login attempt is not available");
    this.login.controller.abort(); this.login = undefined; this.state.invalidate();
  }
  logout(scope: AccountLogoutScope, idempotencyKey: string, control: AccountCallControl): Promise<AccountLogoutResult> {
    return this.track(async () => {
      if (!validateNamed("ProductLogoutRequest", { scope }) || !/^[\x20-\x7e]{16,128}$/u.test(idempotencyKey)) throw accountErrors.invalid_request("Invalid account logout request");
      checkAccountControl(control); const saved = this.state.load(), keyDigest = digest(idempotencyKey);
      if (!this.ending && saved.state === "EMPTY" && saved.receipt?.scope === scope && saved.receipt.keyDigest === keyDigest) return { localCleared: true, remoteRevocation: saved.receipt.remoteRevocation };
      if (this.ending) {
        if (this.ending.scope !== scope || this.ending.keyDigest !== keyDigest) throw accountErrors.conflict("Account logout is already in progress");
      } else {
        this.ending = { scope, keyDigest, snapshot: saved.state === "ACTIVE" ? saved : this.rotation?.base, rotation: this.rotation };
        this.login?.controller.abort(); this.login = undefined; this.state.invalidate();
      }
      const ending = this.ending;
      if (!ending.promise) ending.promise = this.finishLogout(ending, idempotencyKey).catch(error => { ending.promise = undefined; throw error; });
      return ending.promise;
    });
  }
  private async finishLogout(ending: EndingLogin, key: string): Promise<AccountLogoutResult> {
    const epoch = this.state.epoch;
    const receipt: LogoutReceipt = { scope: ending.scope, keyDigest: ending.keyDigest, remoteRevocation: "UNCONFIRMED" };
    this.state.write({ state: "EMPTY", receipt });
    let confirmed = false;
    if (ending.snapshot) confirmed = await this.revoke(ending.scope, key, ending.snapshot.tokens);
    if (!confirmed && ending.rotation) {
      await ending.rotation.promise.catch(() => undefined);
      if (ending.rotation.produced) confirmed = await this.revoke(ending.scope, key, ending.rotation.produced);
    }
    this.state.assertEpoch(epoch);
    const remoteRevocation = confirmed ? "CONFIRMED" : "UNCONFIRMED";
    this.state.write({ state: "EMPTY", receipt: { ...receipt, remoteRevocation } });
    if (this.ending === ending) this.ending = undefined;
    return { localCleared: true, remoteRevocation };
  }
  private async revoke(scope: AccountLogoutScope, key: string, tokens: SessionTokens): Promise<boolean> {
    const operation = scope === "CURRENT_LOGIN" ? "logoutCurrent" : "logoutAll";
    const access = Date.parse(tokens.accessExpiresAt) > this.now() ? tokens.accessToken : undefined;
    try {
      const result = await privateAccountRequest(this.config, this.fetcher, operation, { idempotencyKey: key,
        body: access ? {} : { refreshProof: { clientId: this.config.clientId, refreshToken: tokens.refreshToken } } }, this.lifetime.signal, access);
      return isRecord(result.data) && (scope === "ALL_MOLIS_PRODUCTS" || result.data.loginSessionId === tokens.session.loginSessionId);
    } catch (error) {
      if (!access || code(error) !== "account.login_required") return false;
      try {
        const result = await privateAccountRequest(this.config, this.fetcher, operation, { idempotencyKey: key,
          body: { refreshProof: { clientId: this.config.clientId, refreshToken: tokens.refreshToken } } }, this.lifetime.signal);
        return isRecord(result.data) && (scope === "ALL_MOLIS_PRODUCTS" || result.data.loginSessionId === tokens.session.loginSessionId);
      } catch { return false; }
    }
  }
  async close(): Promise<void> {
    if (!this.state.closed) { this.login?.controller.abort(); this.login = undefined; this.state.close(); this.lifetime.abort(); }
    await Promise.allSettled([...this.pending]);
  }
}
