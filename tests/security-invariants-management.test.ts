import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkLocalHost, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { residentManagement } from "./fixtures/resident-management.js";

test("S-03/S-07 W3-07-7-02 management HTTP refuses missing Origin, foreign Origin, token and key before any business write", async t => {
  const env = await residentManagement(t), original = await env.facts();
  const refusals: Array<[Record<string, string | undefined>, number]> = [
    [{ origin: undefined }, 403], [{ origin: "http://evil.example" }, 403],
    [{ "x-molis-work-control-token": undefined }, 403], [{ "x-molis-work-control-token": "x".repeat(env.token.length) }, 403],
    [{ "x-molis-work-idempotency-key": undefined }, 400],
  ];
  for (const [headers, status] of refusals) {
    const body = env.body(), reply = await env.post(body, headers);
    assert.equal(reply.status, status); assert.equal("call_id" in reply.body, false);
    assert.deepEqual(env.host.callLog!.find(body.call_id), []);
    assert.deepEqual(await env.facts(), original);
  }
  const replayInput = { title: env.project.display_name, idempotency_key: `project-catalog-create-${env.project.project_id}` };
  const key = randomUUID(), body = env.body(replayInput);
  const replay = await env.post(body, { "x-molis-work-idempotency-key": key });
  assert.equal(replay.status, 200); assert.equal((replay.body.result as { replayed: boolean }).replayed, true);
  const accepted = await env.facts(), other = env.body();
  assert.deepEqual(accepted, original, "a replay adds no second Board or event");
  assert.equal((await env.post(other, { "x-molis-work-idempotency-key": key })).status, 409);
  assert.deepEqual(env.host.callLog!.find(other.call_id), []);
  assert.deepEqual(await env.facts(), accepted);
});

test("S-07 W3-07-7-02 management HTTP keeps its body closed, trusts the catalog project and rejects an unknown action or version", async t => {
  const env = await residentManagement(t), original = await env.facts();
  const other = await env.catalog.createProject({ display_name: "另一个项目", actor_id: "test-user" });
  const base = env.body();
  const cases: Array<[unknown, string]> = [
    [[], "actions.input_invalid"], [null, "actions.input_invalid"],
    [{ ...base, actor_id: "other-user" }, "actions.input_invalid"],
    [{ ...base, call_id: "not-a-uuid" }, "actions.input_invalid"],
    [{ ...base, home_id: "different-home" }, "actions.home_mismatch"],
    [{ ...base, database_path: other.database_path }, "actions.scope_mismatch"],
    [{ ...base, project_id: other.project_id }, "actions.scope_mismatch"],
    [{ ...base, capability: { ...base.capability, provider_id: "forged" } }, "actions.input_invalid"],
    [{ ...base, capability: { ...base.capability, version: 2 } }, "actions.dependency_missing"],
    [{ ...base, capability: { capability_id: "goals.progress.record", version: 1 } }, "actions.dependency_missing"],
  ];
  for (const [body, code] of cases) {
    const reply = await env.post(body); assert.ok(reply.status >= 400); assert.equal(reply.body.code, code);
    assert.equal("call_id" in reply.body, false); assert.deepEqual(await env.facts(), original);
  }
  assert.deepEqual(env.host.callLog!.find(base.call_id), []);
  const identity = env.body({ title: "伪造身份", idempotency_key: "forged", actor_id: "other-user" });
  const refused = await env.post(identity); assert.equal(refused.status, 400); assert.equal(refused.body.code, "actions.input_invalid");
  assert.equal(refused.body.call_id, identity.call_id, "an action schema refusal has its original findable operation number");
  const diagnostic = env.host.callLog!.find(identity.call_id);
  assert.equal(diagnostic.length, 1);
  assert.deepEqual([diagnostic[0]!.capability_id, diagnostic[0]!.actor_id, diagnostic[0]!.ok, diagnostic[0]!.code], ["goals.board.initialize", LOCAL_PERSON_ACTOR_ID, false, "actions.input_invalid"]);
  assert.deepEqual(await env.facts(), original);
  const alias = join(env.home, "same-owner.db"); await symlink(env.project.database_path, alias);
  assert.equal((await env.post({ ...env.body({ title: env.project.display_name, idempotency_key: `project-catalog-create-${env.project.project_id}` }), database_path: alias })).status, 200);
});

for (const mode of ["cancel", "disconnect"] as const) {
  test(`S-07 W3-07-7-01/02 ${mode} while the real Host waits does not commit a late management action or fall back`, { timeout: 15_000 }, async t => {
    let armed = false, release!: () => void, reached!: () => void, signal: AbortSignal | undefined;
    const held = new Promise<void>(done => { release = done; }), entered = new Promise<void>(done => { reached = done; });
    const env = await residentManagement(t, { actionAvailability: (caller, action) => {
      if (armed && action.capability_id === "goals.board.initialize") {
        armed = false; signal = caller.signal; reached(); return held.then(() => ({ available: true as const }));
      }
      return { available: true };
    } });
    const original = await env.facts(), opened: string[] = [];
    const fallbackHost = createMolisWorkLocalHost({ onRuntimeOpen: ref => opened.push(ref.storage_key) });
    t.after(async () => { release(); await fallbackHost.close(); });
    const controller = new AbortController(); armed = true;
    const operation = runV1Cli(["init", "--db", env.project.database_path, "--json", JSON.stringify({
      project_id: env.project.project_id, title: "不能迟到写入", idempotency_key: mode })],
      { homeDirectory: env.home, actionServiceUrl: env.origin, localHost: fallbackHost, signal: controller.signal });
    const rejected = assert.rejects(operation, { code: mode === "cancel" ? "actions.cancelled" : "actions.delivery_unknown" });
    await entered; assert.ok(signal);
    const aborted = new Promise<void>(done => { if (signal!.aborted) done(); else signal!.addEventListener("abort", () => done(), { once: true }); });
    if (mode === "cancel") controller.abort(new ActionError("actions.cancelled", "用户取消管理调用"));
    else env.server.closeAllConnections();
    await rejected; await aborted; release();
    for (let attempt = 0; attempt < 100 && !env.host.callLog!.list(env.project.project_id).some(row => row.code === "actions.cancelled"); attempt++) await delay(10);
    assert.ok(env.host.callLog!.list(env.project.project_id).some(row => row.code === "actions.cancelled"), "the Host settled the actual cancelled operation");
    assert.deepEqual(await env.facts(), original); assert.deepEqual(opened, []);
  });
}
