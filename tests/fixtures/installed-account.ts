import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NATIVE_SESSION_FILE, NATIVE_SESSION_HEADER } from "@molis-ai/molis-work-app-local-host";
import { createTrialAuthServer } from "../../examples/personal-trial-tools/mock-auth.mjs";

/** Only remote identity is substituted; installed clients still perform real PKCE, credential storage and account selection. */
export async function installedAccountAuth(root: string, origin: string) {
  const server = createTrialAuthServer({ webOrigin: origin, stateFile: join(root, "test-auth.json") });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const environment = {
    MOLIS_WORK_AUTH_ORIGIN: `http://127.0.0.1:${address.port}`,
    MOLIS_WORK_AUTH_CLIENT_ID: "molis-work-personal-trial",
    MOLIS_WORK_AUTH_DESKTOP_CLIENT_ID: "molis-work-personal-trial-desktop",
    MOLIS_WORK_SECRET_BACKEND: "file",
    MOLIS_WORK_CLOUD_ORIGIN: "", MOLIS_WORK_SYNC_ORIGIN: "", MOLIS_WORK_SYNC_LOCAL: "",
  };
  return { environment,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
    async login(home: string, controlToken: string) {
      const proof = (await readFile(join(home, NATIVE_SESSION_FILE), "utf8")).trim();
      let sequence = 0;
      const request = (input: string | URL, init: RequestInit = {}) => {
        const url = new URL(String(input), origin), headers = new Headers(init.headers);
        if (url.origin === origin) headers.set(NATIVE_SESSION_HEADER, proof);
        return fetch(url, { ...init, headers });
      };
      const start = await request("/api/personal/login", { method: "POST", redirect: "manual", headers: {
        Origin: origin, "content-type": "application/json", "x-molis-work-control-token": controlToken,
        "x-molis-work-idempotency-key": "installed-login-" + (++sequence),
      }, body: "{}" });
      assert.equal(start.status, 200, await start.clone().text());
      const login = await start.json() as { loginUrl: string; loginAttempt: string };
      const redirect = await fetch(login.loginUrl, { redirect: "manual" }); assert.equal(redirect.status, 303);
      const callback = redirect.headers.get("location"); assert.ok(callback);
      const completed = await fetch(callback, { redirect: "manual" }); assert.equal(completed.status, 303, await completed.clone().text());
      const status = await request("/api/personal/status?attempt=" + encodeURIComponent(login.loginAttempt));
      assert.equal(status.status, 200);
      const account = await status.json() as { identity: { userId: string } | null; ready: boolean; viewScope: string };
      assert.equal(account.identity?.userId, "local-personal-trial-user"); assert.equal(account.ready, true);
      assert.equal(typeof account.viewScope, "string");
      const spaces = await request("/api/spaces"); assert.equal(spaces.status, 200);
      const { current } = await spaces.json() as { current: { kind: string; spaceId: string; ownerUserId: string } };
      assert.equal(current.kind, "personal"); assert.equal(current.ownerUserId, account.identity?.userId);
      return { request, proof, token: (await readFile(join(home, "spaces", current.spaceId, "config/web-control-token"), "utf8")).trim(), home: join(home, "spaces", current.spaceId) };
    },
  };
}
