import { proposeChildGoal } from "./fixtures/project-review-entry.js";
import { managementGoals } from "./goal-management-caller.js";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
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
  const env = await residentManagement(t);
  // A review the person can read, made before the facts below are taken.
  const draft = await proposeChildGoal(managementGoals(env.host.actionClient(env.reference), env.project.project_id), "gate"), original = await env.facts();
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
  // Past the gate, the person's read of the review is answered; it writes nothing, and its key then belongs to that body.
  const key = randomUUID(), body = env.body(draft);
  const reached = await env.post(body, { "x-molis-work-idempotency-key": key });
  assert.equal(reached.status, 200, JSON.stringify(reached.body));
  const accepted = await env.facts(), other = env.body();
  assert.deepEqual(accepted, original, "a read adds no event");
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
    // Only the platform's review operations at their current version (44B: no plugin declares management actions).
    [{ ...base, capability: { ...base.capability, version: 2 } }, "actions.missing"],
    [{ ...base, capability: { ...base.capability, version: 3 } }, "actions.missing"],
    [{ ...base, capability: { capability_id: "goals.progress.record", version: 1 } }, "actions.missing"],
  ];
  for (const [body, code] of cases) {
    const reply = await env.post(body); assert.ok(reply.status >= 400); assert.equal(reply.body.code, code);
    assert.equal("call_id" in reply.body, false); assert.deepEqual(await env.facts(), original);
  }
  assert.deepEqual(env.host.callLog!.find(base.call_id), []);
  const identity = env.body({ ...base.input as object, actor_id: "other-user" });
  const refused = await env.post(identity); assert.equal(refused.status, 400); assert.equal(refused.body.code, "actions.input_invalid");
  assert.equal(refused.body.call_id, identity.call_id, "an action schema refusal has its original findable operation number");
  const diagnostic = env.host.callLog!.find(identity.call_id);
  assert.equal(diagnostic.length, 1);
  assert.deepEqual([diagnostic[0]!.capability_id, diagnostic[0]!.actor_id, diagnostic[0]!.ok, diagnostic[0]!.code], ["project.approvals.request.read", LOCAL_PERSON_ACTOR_ID, false, "actions.input_invalid"]);
  assert.deepEqual(await env.facts(), original);
  const alias = join(env.home, "same-owner.db"); await symlink(env.project.database_path, alias);
  // An alias of the catalog's database is the same project: the call reaches the platform instead of being refused as another one.
  assert.equal((await env.post({ ...env.body(), database_path: alias })).body.code, "actions.missing");
});

for (const mode of ["cancel", "disconnect"] as const) {
  test(`S-07 W3-07-7-01/02 ${mode} while the real Host waits does not commit a late management action or fall back`, { timeout: 15_000 }, async t => {
    let armed = false, release!: () => void, reached!: () => void, signal: AbortSignal | undefined;
    const held = new Promise<void>(done => { release = done; }), entered = new Promise<void>(done => { reached = done; });
    const env = await residentManagement(t, { actionAvailability: (caller, action) => {
      if (armed && action.capability_id === "goals.tree.decide") {
        armed = false; signal = caller.signal; reached(); return held.then(() => ({ available: true as const }));
      }
      return { available: true };
    } });
    // A review of a Goals proposal, read first; the decision on it is what waits (the CLI's Goals commands were removed, PEQ-15).
    const draft = await proposeChildGoal(managementGoals(env.host.actionClient(env.reference), env.project.project_id), mode);
    const lines: string[] = []; const printing = t.mock.method(console, "log", (line: string) => { lines.push(line); });
    await runV1Cli(["review-request", "--db", env.project.database_path, "--json", JSON.stringify({ project_id: env.project.project_id, ...draft })],
      { homeDirectory: env.home, actionServiceUrl: env.origin });
    printing.mock.restore();
    const reference = (JSON.parse(lines.at(-1)!) as ReviewRequest).reference;
    const original = await env.facts(), opened: string[] = [];
    const fallbackHost = createMolisWorkLocalHost({ onRuntimeOpen: ref => opened.push(ref.storage_key) });
    t.after(async () => { release(); await fallbackHost.close(); });
    const controller = new AbortController(); armed = true;
    const operation = runV1Cli(["review-decide", "--db", env.project.database_path, "--json", JSON.stringify({ project_id: env.project.project_id,
      reference, choice_id: "apply", request_key: draft.draft.idempotency_key })],
      { homeDirectory: env.home, actionServiceUrl: env.origin, localHost: fallbackHost, signal: controller.signal });
    const rejected = assert.rejects(operation, { code: mode === "cancel" ? "actions.cancelled" : "actions.delivery_unknown" });
    await entered; assert.ok(signal);
    const aborted = new Promise<void>(done => { if (signal!.aborted) done(); else signal!.addEventListener("abort", () => done(), { once: true }); });
    if (mode === "cancel") controller.abort(new ActionError("actions.cancelled", "用户取消管理调用"));
    else env.server.closeAllConnections();
    await rejected; await aborted; release();
    for (let attempt = 0; attempt < 100 && !env.host.callLog!.list(env.project.project_id).some(row => row.code === "actions.cancelled"); attempt++) await delay(10);
    // The person's decision is settled as the platform's review action (S-07, batch 44): cancelled before the owner's command ran, it leaves
    // its diagnostic row; the owner's command, never dispatched, leaves none and changes nothing.
    const cancelled = env.host.callLog!.list(env.project.project_id).filter(row => row.code === "actions.cancelled");
    assert.deepEqual(cancelled.map(row => [row.capability_id, row.actor_id, row.ok]), [["project.approvals.request.decide", LOCAL_PERSON_ACTOR_ID, false]],
      "the Host settled the actual cancelled operation");
    assert.equal(env.host.callLog!.list(env.project.project_id).some(row => row.capability_id === "goals.tree.decide"), false, "the owner's command never ran");
    assert.deepEqual(await env.facts(), original); assert.deepEqual(opened, []);
  });
}
