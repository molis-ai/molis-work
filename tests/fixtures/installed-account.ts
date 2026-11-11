import {completeInstallationLogin} from './installation-login.js';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NATIVE_SESSION_FILE, NATIVE_SESSION_HEADER } from "@molis-ai/molis-work-app-local-host";
import { createTrialAuthServer,trialAccountConfig } from "../../examples/personal-trial-tools/mock-auth.mjs";

/** Only remote identity is substituted; installed clients still perform real PKCE, credential storage and account selection. */
export async function installedAccountAuth(root: string, origin: string) {
  const server = createTrialAuthServer({ webOrigin: origin, stateFile: join(root, "test-auth.json") });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const environment = {
    MOLIS_WORK_ACCOUNT_CONFIG:JSON.stringify(trialAccountConfig(`http://127.0.0.1:${address.port}`,origin)),
    MOLIS_WORK_SECRET_BACKEND: "file",
    MOLIS_WORK_CLOUD_ORIGIN: "", MOLIS_WORK_SYNC_ORIGIN: "", MOLIS_WORK_SYNC_LOCAL: "",
  };
  return { environment,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
    async login(home: string, controlToken: string) {
      const proof = (await readFile(join(home, NATIVE_SESSION_FILE), "utf8")).trim();
      let sequence = 0, viewToken = controlToken;
      const request = (input: string | URL, init: RequestInit = {}) => {
        const url = new URL(String(input), origin), headers = new Headers(init.headers);
        if (url.origin === origin) {
          if (!headers.has('Origin')) headers.set('Origin',origin);
          const installation = url.pathname.startsWith('/api/personal/') || headers.has('X-Molis-Account-Login');
          if (!headers.has('x-molis-work-control-token')) headers.set('x-molis-work-control-token',installation?controlToken:viewToken);
          if (!headers.has('x-molis-work-idempotency-key')) headers.set('x-molis-work-idempotency-key','installed-request-'+(++sequence));
          headers.set(NATIVE_SESSION_HEADER, proof);
        }
        return fetch(url, { ...init, headers });
      };
      const start = await request("/api/personal/login", { method: "POST", redirect: "manual", headers: {
        Origin: origin, "content-type": "application/json", "x-molis-work-control-token": controlToken,
        "x-molis-work-idempotency-key": "installed-login-" + (++sequence),
      }, body: "{}" });
      assert.equal(start.status, 200, await start.clone().text());
      const login = await start.json() as { loginUrl: string; loginAttempt: string };
      const completed=await completeInstallationLogin(request,login.loginUrl);assert.equal(completed.status,200,await completed.clone().text());
      const status = await request("/api/personal/status?attempt=" + encodeURIComponent(login.loginAttempt));
      assert.equal(status.status, 200);
      const account = await status.json() as { identity: { userId: string } | null; ready: boolean; viewScope: string };
      assert.equal(account.identity?.userId, "local-personal-trial-user"); assert.equal(account.ready, true);
      assert.equal(typeof account.viewScope, "string");
      const spaces = await request("/api/spaces"); assert.equal(spaces.status, 200);
      const { current } = await spaces.json() as { current: { kind: string; spaceId: string; ownerUserId: string } };
      assert.equal(current.kind, "personal"); assert.equal(current.ownerUserId, account.identity?.userId);
      viewToken=(await readFile(join(home, "spaces", current.spaceId, "config/web-control-token"), "utf8")).trim();
      return { request, proof, token: viewToken, home: join(home, "spaces", current.spaceId) };
    },
  };
}
