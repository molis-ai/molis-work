import { localWebActionContext } from "./local-web-actions.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AccountCallControl, AccountView } from "@molis-ai/molis-work-contracts/services/account";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { accountActions, ACCOUNT_PERMISSIONS, accountErrors, createAccountAuthentication, createAccountSessionManager, parseAccountEnvironment, validateAccountContract, matchAccountManagementRoute,
  type AccountSessionManager, type AccountSessionStorage } from "@molis-ai/molis-work-service-account";
import type { MolisWorkLocalHost } from "./project-host.js";
import { retainHomeStorageResources } from "./home-storage-lifetime.js";
import { createHostAccountStorage } from "./account-session-storage.js";
import { handleAccountAuthenticationHttp } from "./account-auth-http.js";
import { handleAccountCallbackHttp } from "./account-callback-http.js";
import { readLocalWebBody, requestHost, sendLocalWebJson } from "./web-http.js";

/** Trusted startup inputs, never browser request fields. Default storage is the Home's SecretStore. */
export interface AccountHostOptions {
  readonly environment: unknown;
  readonly storage?: AccountSessionStorage;
  readonly fetch?: typeof fetch;
}

export interface AccountHostBinding {
  readonly home: string;
  readonly configuration: string | undefined;
  readonly storage: AccountSessionStorage | undefined;
  readonly fetch: typeof fetch | undefined;
  session(): AccountSessionManager;
  manage(origin: string, operation: "profile" | "methods" | ActionDefinition, input: unknown, signal: AbortSignal): Promise<unknown>;
  authenticate<T>(origin: string, signal: AbortSignal, operation: (auth: ReturnType<typeof createAccountAuthentication>, control: AccountCallControl) => Promise<T>): Promise<T>;
  read(origin: string, signal: AbortSignal): Promise<AccountView>;
  run<T>(origin: string, signal: AbortSignal, operation: (manager: AccountSessionManager, control: AccountCallControl) => Promise<T>): Promise<T>;
}
const accounts = new WeakMap<MolisWorkLocalHost, AccountHostBinding>();
function encodeConfiguration(input: unknown): string | undefined {
  if (input === undefined || typeof input === "string") return input;
  try { return JSON.stringify(input) ?? ""; }
  catch { return ""; } // Refuse invalid embedding input at the account entry, not Host startup.
}

/** The trusted authentication service uses this port; HTTP never installs browser-supplied Tokens. */
export function accountSessionForHost(host: MolisWorkLocalHost): AccountSessionManager {
  const binding = accounts.get(host);
  if (!binding) throw accountErrors.invalid_configuration("Account Host is not configured");
  return binding.session();
}

/** One session authority per owning Host, shared by borrowed Web and desktop transports. */
export function bindAccountHost(host: MolisWorkLocalHost, home: string, options?: AccountHostOptions): AccountHostBinding {
  const configuration = encodeConfiguration(options ? options.environment : process.env.MOLIS_WORK_ACCOUNT_CONFIG);
  const storage = options?.storage, fetcher = options?.fetch, existing = accounts.get(host);
  if (existing) {
    if (existing.home !== home || existing.configuration !== configuration || existing.storage !== storage || existing.fetch !== fetcher)
      throw accountErrors.invalid_configuration("Account configuration must match the owning Host");
    return existing;
  }
  const stop = new AbortController(), pending = new Set<Promise<unknown>>();
  let authentication: ReturnType<typeof createAccountAuthentication> | undefined;
  let manager: AccountSessionManager | undefined, productOrigin: string | undefined;
  const assertCurrent = () => {
    if (stop.signal.aborted || host.lifecycle() !== "running") throw accountErrors.cancelled("Account Host is closing");
  };
  const session = () => {
    assertCurrent();
    if (!manager) {
      if (configuration === undefined) throw accountErrors.invalid_configuration("Account environment is not configured");
      const config = parseAccountEnvironment(configuration);
      productOrigin = config.productOrigin;
      manager = createAccountSessionManager(config, { storage: storage ?? createHostAccountStorage(home, config), ...(fetcher ? { fetch: fetcher } : {}) });
      authentication = createAccountAuthentication(config, manager, fetcher);
    }
    return manager;
  };
  const track = <T>(result: Promise<T>): Promise<T> => {
    pending.add(result);
    void result.finally(() => pending.delete(result)).catch(() => { /* The original promise carries the refusal. */ });
    return result;
  };
  const run = <T>(origin: string, signal: AbortSignal, operation: (owner: AccountSessionManager, control: AccountCallControl) => Promise<T>) => track((async () => {
    const owner = session();
    if (origin !== productOrigin) throw accountErrors.forbidden("Account request belongs to another product origin");
    return operation(owner, { assertCurrent, signal: AbortSignal.any([stop.signal, signal]) });
  })());
  const binding: AccountHostBinding = { home, configuration, storage, fetch: fetcher, session, run, manage: (origin, operation, input, signal) => run(origin, signal, async () => {
    assertCurrent();
    const caller = await localWebActionContext(host, undefined, ACCOUNT_PERMISSIONS, AbortSignal.any([stop.signal, signal]));
    return host.homeActionClient().invoke(caller, typeof operation === "string" ? accountActions[operation] : operation, input);
  }), authenticate: (origin, signal, operation) => run(origin, signal, (_owner, control) => operation(authentication!, control)), read: (origin, signal) => {
    if (configuration !== undefined) return run(origin, signal, (owner, control) => owner.readSession(control));
    return track((async () => {
      assertCurrent();
      if (signal.aborted) throw accountErrors.cancelled("Account request was cancelled");
      if (storage || fetcher) throw accountErrors.invalid_configuration("Account ports require an explicit environment");
      return { state: "ANONYMOUS" } as const;
    })());
  } };
  retainHomeStorageResources(host, async () => { stop.abort(); authentication?.close(); await manager?.close(); await Promise.allSettled([...pending]); });
  accounts.set(host, binding);
  return binding;
}

/** Credential/session protocol only. Management capabilities use the existing action gateway. */
export async function handleAccountHttp(request: IncomingMessage, response: ServerResponse, url: URL, account: AccountHostBinding): Promise<boolean> {
  if (await handleAccountCallbackHttp(request, response, url, account)) return true;
  if (url.pathname !== "/api/account" && !url.pathname.startsWith("/api/account/")) return false;
  const managementRoute = matchAccountManagementRoute(request.method ?? "", url);
  if (request.headers.authorization || request.headers["x-auth-initiator-proof"] || (url.search && !managementRoute))
    throw accountErrors.invalid_request("Unexpected account request parameters");
  if (await handleAccountAuthenticationHttp(request, response, url, account)) return true;
  const profile = url.pathname === "/api/account/profile" && request.method === "PATCH";
  const methods = url.pathname === "/api/account/login-methods" && request.method === "GET";
  const read = url.pathname === "/api/account/session" && request.method === "GET";
  const activity = url.pathname === "/api/account/activity" && request.method === "POST";
  const logout = url.pathname === "/api/account/logout" && request.method === "POST";
  if (!read && !activity && !logout && !profile && !methods && !managementRoute) throw accountErrors.not_found("Account operation is not available");
  if ((read || methods || (managementRoute && !managementRoute.write)) && (request.headers["transfer-encoding"] || (request.headers["content-length"] && request.headers["content-length"] !== "0")))
    throw accountErrors.invalid_request("Account session reads do not accept a body");
  const stop = new AbortController(), origin = `http://${requestHost(request)}`;
  const disconnected = () => { if (!response.writableEnded) stop.abort(); };
  response.once("close", disconnected);
  try {
    let data: unknown;
    if (managementRoute) {
      const key = request.headers["idempotency-key"];
      if (managementRoute.idempotency && (typeof key !== "string" || !/^[\x20-\x7e]{16,128}$/u.test(key))) throw accountErrors.invalid_request("Invalid account idempotency key");
      if (!managementRoute.idempotency && key !== undefined) throw accountErrors.invalid_request("Unexpected account idempotency key");
      const input = { ...managementRoute.input, ...(managementRoute.write ? { body: await readLocalWebBody(request, 16384), ...(managementRoute.idempotency ? { idempotencyKey: key } : {}) } : {}) };
      data = await account.manage(origin, managementRoute.action, input, stop.signal);
    } else if (profile || methods) {
      const body = profile ? await readLocalWebBody(request, 200 * 1024) : {};
      const key = request.headers["idempotency-key"];
      if (profile && (typeof key !== "string" || !/^[\x20-\x7e]{16,128}$/u.test(key))) throw accountErrors.invalid_request("Invalid account idempotency key");
      if (profile && !validateAccountContract("ProfileUpdateRequest", body)) throw accountErrors.invalid_request("Invalid profile input");
      data = await account.manage(origin, profile ? "profile" : "methods", profile ? { ...body, idempotencyKey: key } : body, stop.signal);
    }
    else if (read) data = await account.read(origin, stop.signal);
    else {
      const body = await readLocalWebBody(request, 4096);
      if (!validateAccountContract(activity ? "ActivityRequest" : "ProductLogoutRequest", body)) throw accountErrors.invalid_request("Invalid account request");
      if (activity) data = await account.run(origin, stop.signal, (owner, control) => owner.activity(body, control));
      else {
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || key.length < 16 || key.length > 128) throw accountErrors.invalid_request("Invalid account idempotency key");
        const scope = body.scope as "CURRENT_LOGIN" | "ALL_MOLIS_PRODUCTS";
        data = await account.run(origin, stop.signal, (owner, control) => owner.logout(scope, key, control));
      }
    }
    if (stop.signal.aborted) throw accountErrors.cancelled("Account request was cancelled");
    sendLocalWebJson(response, 200, { data, requestId: randomUUID() });
  } finally { response.off("close", disconnected); }
  return true;
}
