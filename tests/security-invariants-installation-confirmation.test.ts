import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleLocalRuntimeSettingsHttp, MolisWorkWebServiceManager, RuntimeIntegrationService, type SpaceWebSurface } from "@molis-ai/molis-work-app-local-host";
import { accountRefreshFixture } from "./fixtures/account-refresh.js";

for (const kind of ["runtime", "service"] as const) {
  test(`ASR ${kind} confirmation delayed before routing cannot borrow a later A login`, async t => {
    const area = await mkdtemp(join(tmpdir(), "installation-call-authority-"));
    const installation = join(area, "installation"), userHome = join(area, "user");
    const runtime = new RuntimeIntegrationService({ homeDirectory: installation, userHomeDirectory: userHome, pathEnvironment: "" });
    const service = new MolisWorkWebServiceManager({ homeDirectory: installation, userHomeDirectory: userHome, platform: "linux" });
    const plan = kind === "runtime" ? await runtime.prepare("codex", "connect") : await service.prepare("stop");
    const path = kind === "runtime" ? "/api/settings/runtimes/codex/confirm" : "/api/settings/web-service/confirm";
    const input = { plan_id: plan.plan_id, decision: "declined" as const };
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), oldHandler = Promise.withResolvers<unknown>();
    const cores: Array<{ home: string; current: () => void }> = [];
    let holdNext = true;
    const f = await accountRefreshFixture(t, (home, options) => {
      assert.equal(typeof options.assertAccountCurrent, "function", "the real installation factory must supply this personal core's original lease");
      const current = options.assertAccountCurrent!;
      cores.push({ home, current });
      return createServer((request, response) => {
        const held = request.url === path && holdNext;
        if (held) holdNext = false;
        void (async () => {
          if (held) { entered.resolve(); await release.promise; }
          await handleLocalRuntimeSettingsHttp(request, response, new URL(request.url!, "http://localhost"), runtime, service, current);
        })().catch(error => {
          if (held) oldHandler.resolve(error);
          if (!response.destroyed) {
            response.writeHead(409, { "content-type": "application/json" });
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : "unexpected" }));
          }
        }).finally(() => { if (held) oldHandler.resolve(undefined); });
      }) as SpaceWebSurface;
    });
    t.after(async () => { release.resolve(); try { await f.close(); } finally { await rm(area, { recursive: true, force: true }); } });
    const first = await f.login("alice"); assert.equal(first.identity.userId, "alice"); assert.equal(first.ready, true);
    const confirm = () => fetch(f.origin + path, { method: "POST", headers: {
      Cookie: f.cookie, Origin: f.origin, "content-type": "application/json", "x-molis-work-control-token": f.control,
      "x-molis-work-idempotency-key": randomUUID(),
    }, body: JSON.stringify(input) });
    // Observe the old handler itself: switch destroys its socket before this deferred owner work resumes.
    const oldTransport = confirm().then(response => ({ status: response.status }), error => ({ error }));
    await entered.promise;
    assert.equal((await f.login("bob")).identity.userId, "bob");
    const back = await f.login("alice"); assert.equal(back.identity.userId, "alice"); assert.equal(back.ready, true);
    assert.equal(cores.length, 3); assert.equal(cores[0]!.home, cores[2]!.home);
    assert.notEqual(cores[0]!.current, cores[2]!.current, "returning A gets a new core lease, not the old callback");
    assert.ok("error" in await oldTransport, "the real wrapper hard-disconnects the old account request");
    release.resolve();
    const refused = await oldHandler.promise;
    assert.ok(refused instanceof Error); assert.equal(refused.message, "REPLICA_ACCOUNT_MISMATCH");
    assert.equal(existsSync(installation), false, "the old handler creates no config, Skill, receipt, backup or attempt");
    const accepted = await confirm();
    assert.equal(accepted.status, 200); assert.equal((await accepted.json()).status, "declined", "the new core can confirm the same unconsumed installation plan");
    assert.equal(existsSync(installation), false);
  });
}
