import type { AccountCallControl, AccountEnvironmentConfig, SessionView, UserView } from "@molis-ai/molis-work-contracts/services/account";
import { accountErrors } from "./errors.js";
import { isRecord } from "./operations.js";
import { validateNamed } from "./upstream/validate.js";
import type { AccountSessionStorage, SavedAccount, SavedContents, SessionTokens } from "./session-types.js";

const exact = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).every(key => fields.includes(key));
export function checkAccountControl(control: AccountCallControl): void {
  if (control.signal?.aborted) throw accountErrors.cancelled("Account request was cancelled");
  control.assertCurrent();
}
export function validSession(config: AccountEnvironmentConfig, value: unknown): value is SessionView {
  return validateNamed("SessionView", value) && isRecord(value) && value.clientId === config.clientId && value.applicationId === config.applicationId
    && Date.parse(String(value.authenticatedAt)) <= Date.parse(String(value.lastActiveAt))
    && Date.parse(String(value.lastActiveAt)) < Date.parse(String(value.idleExpiresAt))
    && Date.parse(String(value.authenticatedAt)) < Date.parse(String(value.absoluteExpiresAt));
}
export function validUser(config: AccountEnvironmentConfig, value: unknown): value is UserView {
  return validateNamed("UserView", value) && isRecord(value) && value.issuer === config.authOrigin;
}
export function sessionTokens(config: AccountEnvironmentConfig, value: unknown): SessionTokens {
  if (!validateNamed("TokenSet", value) || !isRecord(value) || !validSession(config, value.session)
    || Date.parse(String(value.accessExpiresAt)) > Math.min(Date.parse(value.session.idleExpiresAt), Date.parse(value.session.absoluteExpiresAt)))
    throw accountErrors.upstream_invalid("Account tokens do not match this Host");
  return { accessToken: String(value.accessToken), refreshToken: String(value.refreshToken), tokenType: "Bearer",
    accessExpiresAt: String(value.accessExpiresAt), session: structuredClone(value.session) };
}
function isSaved(config: AccountEnvironmentConfig, binding: string, raw: unknown): raw is SavedAccount {
  const base = ["version", "binding", "epoch", "state"];
  if (!isRecord(raw) || raw.version !== /* @version format.account.session */ 1 || raw.binding !== binding || !Number.isSafeInteger(raw.epoch) || Number(raw.epoch) < 0)
    throw accountErrors.unavailable("Account session storage is invalid");
  let valid = false;
  if (raw.state === "EMPTY") valid = exact(raw, [...base, "receipt"]) && (raw.receipt === undefined || (isRecord(raw.receipt)
    && exact(raw.receipt, ["scope", "keyDigest", "remoteRevocation"]) && ["CURRENT_LOGIN", "ALL_MOLIS_PRODUCTS"].includes(String(raw.receipt.scope))
    && typeof raw.receipt.keyDigest === "string" && /^[a-f0-9]{64}$/u.test(raw.receipt.keyDigest)
    && ["CONFIRMED", "UNCONFIRMED"].includes(String(raw.receipt.remoteRevocation))));
  if (raw.state === "EXPIRED") valid = exact(raw, base);
  if (raw.state === "OFFLINE") valid = exact(raw, [...base, "user"]) && validUser(config, raw.user);
  if (raw.state === "REFRESHING") valid = exact(raw, [...base, "user", "session"]) && validUser(config, raw.user) && validSession(config, raw.session);
  if (raw.state === "ACTIVE") {
    try { sessionTokens(config, raw.tokens); valid = exact(raw, [...base, "tokens", "user"]) && validUser(config, raw.user); }
    catch { valid = false; }
  }
  return valid;
}
function parseSaved(config: AccountEnvironmentConfig, binding: string, raw: unknown): SavedAccount {
  if (!isSaved(config, binding, raw)) throw accountErrors.unavailable("Account session storage is invalid");
  return structuredClone(raw);
}

/** The only persistent record owner. Host's exclusive Home lease makes writes single-owner. */
export class AccountSessionState {
  private saved: SavedAccount | undefined;
  private loaded = false;
  readonly binding: string;
  epoch = 0;
  closed = false;
  controller = new AbortController();
  constructor(readonly config: AccountEnvironmentConfig, private readonly storage: AccountSessionStorage) {
    this.binding = JSON.stringify([config.environmentId, config.authOrigin, config.applicationId, config.clientId, config.productOrigin, config.policyProfile]);
  }
  load(): SavedAccount {
    this.assertOpen();
    if (!this.loaded) {
      let raw: unknown;
      try { raw = this.storage.read(); } catch { throw accountErrors.unavailable("Account session storage is unavailable"); }
      this.saved = raw === null ? { version: /* @version format.account.session */ 1, binding: this.binding, epoch: 0, state: "EMPTY" } : parseSaved(this.config, this.binding, raw);
      this.epoch = this.saved.epoch; this.loaded = true;
      if (this.saved.state === "REFRESHING") this.write({ state: "OFFLINE", user: this.saved.user });
    }
    return this.saved!;
  }
  write(contents: SavedContents): SavedAccount {
    this.assertOpen();
    const record = { version: /* @version format.account.session */ 1 as const, binding: this.binding, epoch: this.epoch, ...contents } as SavedAccount;
    try { this.storage.write(structuredClone(record)); } catch { throw accountErrors.unavailable("Account session storage could not be saved"); }
    this.saved = record; this.loaded = true;
    return record;
  }
  invalidate(): void {
    if (!Number.isSafeInteger(this.epoch + 1)) throw accountErrors.unavailable("Account session generation is exhausted");
    this.epoch += 1; this.controller.abort(); this.controller = new AbortController();
  }
  assertOpen(): void { if (this.closed) throw accountErrors.cancelled("Account Host is closing"); }
  assertEpoch(epoch: number): void {
    this.assertOpen();
    if (epoch !== this.epoch) throw accountErrors.conflict("Current account changed during the operation");
  }
  close(): void { this.invalidate(); this.closed = true; this.controller.abort(); }
}
