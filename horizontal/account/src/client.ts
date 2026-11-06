import type { AccountCallControl, AccountCredentialReference, AccountEnvelope, AccountEnvironmentConfig, AccountOperationInput, AccountService, AccountView, SessionView, UserView } from "@molis-ai/molis-work-contracts/services/account";
import { parseAccountEnvironment } from "./config.js";
import { accountErrors } from "./errors.js";
import { accountOperation, isRecord, prepareOperation } from "./operations.js";
import { sendOperation } from "./transport.js";
import { validateNamed } from "./upstream/validate.js";

export interface AccountServicePorts {
  readonly currentCredential: () => AccountCredentialReference | null | Promise<AccountCredentialReference | null>;
  /** Resolve only the current Host's credential store; never delegate this port to plugins. */
  readonly resolveSecret: (reference: string) => Promise<string | null>;
  readonly fetch?: typeof fetch;
}

function checkpoint(control: AccountCallControl): void {
  if (control.signal?.aborted) throw accountErrors.cancelled("Account call was cancelled");
  control.assertCurrent();
}
function sameReference(left: AccountCredentialReference | null, right: AccountCredentialReference | null): boolean {
  return left === null || right === null ? left === right
    : left.secretRef === right.secretRef && left.issuer === right.issuer && left.environmentId === right.environmentId
      && left.applicationId === right.applicationId && left.clientId === right.clientId && left.userId === right.userId && left.sessionId === right.sessionId;
}

/** This service is owned by a Host instance. It contains no session persistence or module-global identity. */
export function createAccountService(config: AccountEnvironmentConfig, ports: AccountServicePorts): AccountService {
  return new CentralAccountService(parseAccountEnvironment(config), {
    currentCredential: ports.currentCredential.bind(ports), resolveSecret: ports.resolveSecret.bind(ports), fetch: ports.fetch ?? globalThis.fetch,
  });
}

class CentralAccountService implements AccountService {
  constructor(private readonly config: AccountEnvironmentConfig, private readonly ports: Required<AccountServicePorts>) {}

  private async credential(control: AccountCallControl): Promise<AccountCredentialReference | null> {
    checkpoint(control);
    let original: AccountCredentialReference | null;
    try { original = await this.ports.currentCredential(); }
    catch { throw accountErrors.unavailable("Account credential store is unavailable"); }
    checkpoint(control);
    if (original === null) return null;
    const value = Object.freeze({ secretRef: original.secretRef, issuer: original.issuer, environmentId: original.environmentId,
      applicationId: original.applicationId, clientId: original.clientId, userId: original.userId, sessionId: original.sessionId });
    if (value.issuer !== this.config.authOrigin || value.environmentId !== this.config.environmentId
      || value.clientId !== this.config.clientId || value.applicationId !== this.config.applicationId
      || !validateNamed("Id", value.userId) || !validateNamed("Id", value.sessionId)
      || typeof value.secretRef !== "string" || !value.secretRef || value.secretRef.length > 2048) throw accountErrors.forbidden("Account credential belongs to another context");
    return value;
  }

  private async recheck(reference: AccountCredentialReference | null, control: AccountCallControl): Promise<void> {
    checkpoint(control);
    if (!sameReference(reference, await this.credential(control))) throw accountErrors.conflict("Current account changed during the operation");
    checkpoint(control);
  }

  private async secret(reference: string, control: AccountCallControl): Promise<string> {
    checkpoint(control);
    let value: string | null;
    try { value = await this.ports.resolveSecret(reference); }
    catch { throw accountErrors.unavailable("Account credential store is unavailable"); }
    checkpoint(control);
    if (!validateNamed("OpaqueSecret", value)) throw accountErrors.login_required("Account credential is unavailable");
    return String(value);
  }

  async invoke(operationId: string, input: AccountOperationInput, control: AccountCallControl): Promise<AccountEnvelope> {
    return this.execute(operationId, input, control, await this.credential(control));
  }

  private async execute(operationId: string, input: AccountOperationInput, control: AccountCallControl, credential: AccountCredentialReference | null): Promise<AccountEnvelope> {
    checkpoint(control);
    const operation = accountOperation(operationId);
    let snapshot: AccountOperationInput;
    try { snapshot = structuredClone(input); }
    catch { throw accountErrors.invalid_request("Invalid account operation input"); }
    const prepared = prepareOperation(this.config, operation, snapshot);
    if (prepared.requiresSession && !credential) throw accountErrors.login_required("Account login is required");
    const headers: Record<string, string> = { Accept: "application/json", Origin: this.config.productOrigin };
    if (snapshot.body !== undefined) headers["Content-Type"] = "application/json";
    if (credential) headers.Authorization = `Bearer ${await this.secret(credential.secretRef, control)}`;
    if (snapshot.idempotencyKey) headers["Idempotency-Key"] = snapshot.idempotencyKey;
    if (prepared.requiresInitiator) {
      if (!control.initiatorProofRef) throw accountErrors.forbidden("Account initiator proof is required");
      headers["X-Auth-Initiator-Proof"] = await this.secret(control.initiatorProofRef, control);
    } else if (control.initiatorProofRef !== undefined) throw accountErrors.invalid_request("Unexpected account initiator proof");
    await control.beforeEffect?.();
    await this.recheck(credential, control);
    const timeout = AbortSignal.timeout(15_000), signal = control.signal ? AbortSignal.any([control.signal, timeout]) : timeout;
    let result: AccountEnvelope;
    try {
      result = await sendOperation(this.ports.fetch, prepared.url, operation, { method: operation.method, headers, signal,
        ...(snapshot.body === undefined ? {} : { body: JSON.stringify(snapshot.body) }) });
    } finally {
      await this.recheck(credential, control);
      if (timeout.aborted) throw accountErrors.timeout("Account service timed out");
    }
    this.validateIdentity(result.data, credential);
    return result;
  }

  private validateIdentity(data: unknown, credential: AccountCredentialReference | null): void {
    if (!isRecord(data)) return;
    if (typeof data.loginSessionId === "string" && credential && data.loginSessionId !== credential.sessionId)
      throw accountErrors.forbidden("Account session does not match this Host");
    const session = validateNamed("SessionView", data) ? data : data.session;
    if (isRecord(session) && (session.clientId !== this.config.clientId || session.applicationId !== this.config.applicationId
      || (credential && session.loginSessionId !== credential.sessionId))) throw accountErrors.forbidden("Account session does not match this Host");
    if (isRecord(session) && (Date.parse(String(session.idleExpiresAt)) <= Date.now() || Date.parse(String(session.absoluteExpiresAt)) <= Date.now())) throw accountErrors.login_required("Account session has expired");
    const user = "userId" in data && "issuer" in data ? data : data.user;
    if (isRecord(user) && (user.issuer !== this.config.authOrigin || (credential && user.userId !== credential.userId))) throw accountErrors.forbidden("Account user does not match the current session");
    if (typeof data.browserStartUrl === "string") {
      const url = new URL(data.browserStartUrl);
      if (url.origin !== this.config.authOrigin || !/^\/api\/v2\/auth\/external\/(google|github)\/browser-start$/u.test(url.pathname)
        || url.username || url.password || url.hash) throw accountErrors.upstream_invalid("Account provider start URL is not trusted");
    }
  }

  async readSession(control: AccountCallControl): Promise<AccountView> {
    const credential = await this.credential(control);
    if (!credential) { await this.recheck(null, control); return { state: "ANONYMOUS" }; }
    await this.execute("getCurrentSession", {}, control, credential);
    const result = await this.execute("getMe", {}, control, credential);
    if (!isRecord(result.data)) throw accountErrors.upstream_invalid("Invalid account profile");
    const view = { state: "AUTHENTICATED", user: result.data.user, session: result.data.session, capabilities: result.data.platformCapabilities };
    if (!validateNamed("AccountView", view)) throw accountErrors.upstream_invalid("Invalid account view");
    return { state: "AUTHENTICATED", user: view.user as UserView, session: view.session as SessionView,
      capabilities: view.capabilities as Extract<AccountView, { state: "AUTHENTICATED" }>["capabilities"] };
  }
}
