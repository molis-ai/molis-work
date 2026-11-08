import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { createDesktopWebHost } from "@molis-ai/molis-work-app-desktop";
import { ensureStorageSpace, personalStorageSpace } from "@molis-ai/molis-work-storage";
import { NATIVE_SESSION_FILE, NATIVE_SESSION_HEADER, WEB_CONTROL_TOKEN_RELATIVE_PATH } from "@molis-ai/molis-work-app-local-host";

/** Real launcher account admission; only its remote Auth peer is synthetic. No local identity or credential store is patched. */
export async function desktopEntryAccount(t: TestContext) {
  const userId = "desktop-shutdown-person", applicationId = "shutdown-work", clientId = "shutdown-entry";
  let origin = "", state = "";
  const auth = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/v1/auth/transactions") {
      state = JSON.parse(body).state;
      response.end(JSON.stringify({ data: { loginUrl: origin + "/login" } }));
    } else if (request.url === "/oauth2/token") {
      response.end(JSON.stringify({ access_token: "synthetic-shutdown-access", refresh_token: "synthetic-shutdown-refresh", expires_in: 3600 }));
    } else if (request.url === "/api/v1/users/me" && request.headers.authorization === "Bearer synthetic-shutdown-access") {
      response.end(JSON.stringify({ data: { userId, displayName: userId, emails: [], applicationId, clientId } }));
    } else response.writeHead(404).end("{}");
  });
  t.after(() => new Promise<void>((resolve, reject) => auth.close(error => error ? reject(error) : resolve())));
  await new Promise<void>((resolve, reject) => { auth.once("error", reject); auth.listen(0, "127.0.0.1", resolve); });
  const address = auth.address(); assert.ok(address && typeof address === "object");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    environment: { MOLIS_WORK_AUTH_ORIGIN: origin, MOLIS_WORK_AUTH_CLIENT_ID: clientId, MOLIS_WORK_AUTH_DESKTOP_CLIENT_ID: clientId, MOLIS_WORK_SECRET_BACKEND: "file", MOLIS_WORK_SYNC_ORIGIN: "", MOLIS_WORK_SYNC_LOCAL: "" },
    async prepareHome(installation: string) {
      // Initialize the installation before adding child-space data; a nonempty root without its ledger must remain refused.
      const entry = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: installation });
      await new Promise<void>((resolve, reject) => entry.close(error => error ? reject(error) : resolve()));
      const space = personalStorageSpace(origin, applicationId, userId), home = join(installation, "spaces", space.spaceId);
      ensureStorageSpace(home, space);
      return home;
    },
    async login(installation: string, webOrigin: string) {
      const identityHeaders = { [NATIVE_SESSION_HEADER]: readFileSync(join(installation, NATIVE_SESSION_FILE), "utf8").trim() };
      const token = readFileSync(join(installation, WEB_CONTROL_TOKEN_RELATIVE_PATH), "utf8").trim();
      let sequence = 0;
      const request = (path: string, method = "GET") => fetch(webOrigin + path, { method, redirect: "manual",
        headers: { ...identityHeaders, Origin: webOrigin, "content-type": "application/json", "x-molis-work-control-token": token,
          "x-molis-work-idempotency-key": "entry-account-" + (++sequence) }, ...(method === "GET" ? {} : { body: "{}" }) });
      const started = await request("/api/personal/login?returnTo=%2F", "POST");
      assert.equal(started.status, 200, await started.clone().text());
      assert.ok(state, "the real launcher started an Auth transaction");
      const completed = await request("/account/callback?code=synthetic-shutdown-code&state=" + encodeURIComponent(state));
      assert.equal(completed.status, 303, await completed.clone().text());
      const status = await request("/api/personal/status");
      assert.equal(status.status, 200);
      const account = await status.json();
      assert.equal(account.identity?.userId, userId); assert.equal(account.ready, true);
      return identityHeaders;
    },
  };
}
