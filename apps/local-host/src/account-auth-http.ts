import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { accountErrors, validateAccountContract } from "@molis-ai/molis-work-service-account";
import type { AccountHostBinding } from "./account-host.js";
import { readLocalWebBody, requestHost, sendLocalWebJson } from "./web-http.js";

/** Narrow credential routes; the outer local-entry guard supplies control Token, Origin and one-time key. */
export async function handleAccountAuthenticationHttp(request: IncomingMessage, response: ServerResponse, url: URL, account: AccountHostBinding): Promise<boolean> {
  const create = url.pathname === "/api/account/auth/transactions" && request.method === "POST";
  const reset = url.pathname === "/api/account/password/reset" && request.method === "POST";
  const reauth = url.pathname === "/api/account/reauthentications";
  const sensitive = /^\/api\/account\/(password\/change|login-methods\/(bind|([a-zA-Z0-9_-]+)\/(replace|unlink)))$/u.exec(url.pathname);
  const match = /^\/api\/account\/auth\/transactions\/([a-zA-Z0-9_-]+)(?:\/(submit|resend|cancel))?$/u.exec(url.pathname);
  if (!create && !reset && !reauth && !sensitive && !match) return false;
  if (["cross-site", "same-site"].includes(String(request.headers["sec-fetch-site"] ?? ""))) throw accountErrors.forbidden("Authentication requires a same-origin request");
  const operation = create ? "create" : reset ? "reset" : reauth ? "reauthenticate" : sensitive ? "mutate" : match![2] ?? "get", handle = match?.[1] ?? "";
  if (request.method !== (operation === "get" ? "GET" : "POST")) throw accountErrors.invalid_request("Invalid authentication method");
  const stop = new AbortController();
  const disconnected = () => { if (!response.writableEnded) stop.abort(); };
  response.once("close", disconnected);
  try {
    const body = operation === "get" ? undefined : await readLocalWebBody(request, 4096);
    if (operation === "get" && (request.headers["transfer-encoding"] || Number(request.headers["content-length"] ?? 0) !== 0)) throw accountErrors.invalid_request("Authentication reads do not accept a body");
    if ((operation === "resend" || operation === "cancel") && !validateAccountContract("Empty", body)) throw accountErrors.invalid_request("Unexpected authentication fields");
    const data = await account.authenticate(`http://${requestHost(request)}`, stop.signal, async (auth, control) => {
      if (operation === "reauthenticate") return auth.reauthenticate(body, control);
      if (operation === "mutate") {
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string") throw accountErrors.invalid_request("Idempotency key required");
        const action = sensitive![1] === "password/change" ? "password" : sensitive![2] === "bind" ? "bind" : sensitive![4] as "replace" | "unlink";
        return auth.mutate(action, body, key, control, sensitive![3]);
      }
      if (operation === "create") return auth.create(body, control);
      if (operation === "reset") return auth.reset(body, control);
      if (operation === "submit") return auth.submit(handle, body, control);
      if (operation === "resend") return auth.resend(handle, control);
      if (operation === "cancel") return auth.cancel(handle, control);
      return auth.get(handle, control);
    });
    if (stop.signal.aborted) throw accountErrors.cancelled("Authentication request cancelled");
    sendLocalWebJson(response, 200, { data, requestId: randomUUID() });
  } finally { response.off("close", disconnected); }
  return true;
}
