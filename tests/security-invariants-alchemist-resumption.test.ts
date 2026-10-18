import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { createAlchemistSearchPort } from "@molis-ai/molis-work-app-local-host";
import { holdSearchNetwork, searchMemorySecrets } from "./fixtures/alchemist-search-network.js";
import assert from "node:assert/strict";
import test from "node:test";
import { alchemistActions as a, ALCHEMIST_ACTION_PERMISSIONS, type AlchemistStudioRuntime } from "@molis-ai/molis-work-plugin-alchemist";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { controlledAlchemistAi } from "./fixtures/alchemist-actions.js";
import { openTestHome } from "./fixtures/test-home.js";

async function setup(t: test.TestContext) {
  const controlled = controlledAlchemistAi();
  const f = await openTestHome(t, { host: { alchemist: { ai: () => controlled.ai, pulseSourceMode: "fixture" } } });
  const project = await f.createProject("Alchemist continuation", ["alchemist"]);
  const caller: ActionCallContext = { actor_id: "fixture-person", project_id: project.project_id, audience: "user", permissions: ALCHEMIST_ACTION_PERMISSIONS };
  const client = f.host.actionClient(project.reference);
  const { direction } = await client.invoke(caller, a.directionCreate, { description: "Retain accepted work using its original authority" }) as { direction: { id: string } };
  const owner = Reflect.get(f.host, "alchemist") as { get(caller: ActionCallContext): AlchemistStudioRuntime };
  const studio = owner.get(caller), base = `/projects/${project.project_id}/api/alchemist/studio/api/v1`;
  return { ...f, ...controlled, project, caller, client, direction, studio, base };
}
async function until(check: () => boolean) {
  const end = Date.now() + 5000;
  while (!check()) { assert.ok(Date.now() < end, "Expected production state did not settle"); await new Promise(resolve => setTimeout(resolve, 20)); }
}
function facts(studio: AlchemistStudioRuntime) {
  return ["jobs", "job_events", "exploration_runs", "idea_cards", "activity_events"].map(table => studio.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
}

test("S-18 W5-01-ALC-RES03: normal production HTTP close preserves accepted model work", { timeout: 30_000 }, async t => {
  const f = await setup(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const generate = f.ai.generate;
  f.ai.generate = async input => { entered.resolve(); await release.promise; return generate(input); };
  try {
    const receipt = await f.web.post<{ jobId: string; runId: string }>(`${f.base}/directions/${f.direction.id}/explorations`, {});
    await entered.promise; assert.equal(f.studio.worker.isAccepted(receipt.jobId), true);
    release.resolve(); await f.studio.worker.whenIdle();
    const result = await f.web.get<{ exploration: { status: string; cards: unknown[] } }>(`${f.base}/explorations/${receipt.runId}`);
    assert.equal(result.exploration.status, "completed"); assert.equal(result.exploration.cards.length, 2);
    assert.equal(f.requests.length, 1);
  } finally { release.resolve(); }
});

test("S-18 W5-01-ALC-RES03: production HTTP disconnect before acceptance creates no job", { timeout: 30_000 }, async t => {
  const f = await setup(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), abort = new AbortController();
  const models = f.ai.listModels;
  f.ai.listModels = async () => { entered.resolve(); await release.promise; return models(); };
  const before = facts(f.studio);
  try {
    const response = fetch(f.origin + `${f.base}/directions/${f.direction.id}/explorations`, { method: "POST", body: "{}", signal: abort.signal,
      headers: { origin: f.origin, "content-type": "application/json", "x-molis-work-control-token": f.controlToken, "x-molis-work-idempotency-key": crypto.randomUUID() } });
    const rejected = assert.rejects(response);
    await entered.promise; abort.abort(); await rejected;
    // Let the real socket close reach the server before the non-cooperative metadata provider returns.
    await new Promise(resolve => setTimeout(resolve, 40)); release.resolve();
    await until(() => f.studio.idle());
    assert.deepEqual(facts(f.studio), before); assert.equal(f.requests.length, 0);
  } finally { release.resolve(); }
});

for (const revoke of [false, true]) test(`S-18 W5-01-ALC-RES03/06: production MCP continuation ${revoke ? "cannot replace its revoked permission source" : "survives its response and retains the current actor"}`, { timeout: 30_000 }, async t => {
  const f = await setup(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const started = await f.client.invoke(f.caller, a.explorationStart, { id: f.direction.id }) as { jobId: string; runId: string };
  f.studio.worker.cancel(started.jobId);
  const actor = "runtime:alchemist-continuation";
  await f.grant(actor, f.project.project_id, [a.runContinue, a.explorationStart]);
  const gateway = await f.mcp(actor, f.project.project_id);
  const view = await f.client.invoke(f.caller, a.runResume, { id: started.jobId }) as { confirmation?: string };
  let signal: AbortSignal | undefined;
  const generate = f.ai.generate;
  f.ai.generate = async input => { signal = input.signal; entered.resolve(); await release.promise; return generate(input); };
  try {
    const receipt = await gateway.client.invoke(gateway.caller, a.runContinue, { id: started.jobId, confirmation: view.confirmation }) as { accepted: boolean };
    assert.equal(receipt.accepted, true); await entered.promise;
    if (revoke) {
      await f.revoke(actor, f.project.project_id, [a.explorationStart]);
      await f.grant(actor, f.project.project_id, [a.conversationSend]);
      await until(() => signal?.aborted === true);
      const before = facts(f.studio);
      release.resolve(); await f.studio.worker.whenIdle();
      assert.deepEqual(facts(f.studio), before, "late success/failure, checkpoints, lease renewal and events leave the revoked job untouched");
      assert.equal((f.studio.database.prepare("SELECT status FROM exploration_runs WHERE id = ?").get(started.runId) as { status: string }).status, "running");
    } else {
      assert.equal(signal?.aborted, false); release.resolve(); await f.studio.worker.whenIdle();
      assert.equal((f.studio.database.prepare("SELECT status FROM exploration_runs WHERE id = ?").get(started.runId) as { status: string }).status, "completed");
      assert.equal(f.requests[0]?.actorId, actor);
    }
  } finally { release.resolve(); }
});

for (const stage of ["dns", "tls", "response", "extract"] as const) test(`S-18 W5-01-ALC-RES03: MCP revocation at search ${stage} stops actual final effects`, { timeout: 30_000 }, async t => {
  const f = await setup(t);
  const started = await f.client.invoke(f.caller, a.explorationStart, { id: f.direction.id }) as { runId: string };
  await until(() => (f.studio.database.prepare("SELECT status FROM exploration_runs WHERE id = ?").get(started.runId) as { status: string }).status === "completed");
  const explored = await f.client.invoke(f.caller, a.explorationGet, { id: started.runId }) as { exploration: { cards: { id: string }[] } };
  const kept = await f.client.invoke(f.caller, a.cardKeep, { id: explored.exploration.cards[0]!.id }) as { idea: { id: string } };
  const search = createAlchemistSearchPort({ homeDirectory: f.home, projectId: f.project.project_id, secretStore: searchMemorySecrets() });
  const storage = new LocalSqliteStorage(join(f.home, "alchemist/projects", f.project.project_id, "search.sqlite"));
  const contentRoot = join(f.home, "alchemist/projects", f.project.project_id, "search-content");
  const contentFiles = () => existsSync(contentRoot) ? readdirSync(contentRoot, { recursive: true }).map(String).sort() : [];
  const searchFacts = () => storage.db.prepare("SELECT * FROM feed_runtime_blobs ORDER BY namespace, key").all();
  f.ai.search = search.search;
  const network = holdSearchNetwork(t, stage), actor = `runtime:search-${stage}`;
  await f.grant(actor, f.project.project_id, [a.researchPlan, a.researchStart]);
  const gateway = await f.mcp(actor, f.project.project_id);
  const planned = await gateway.client.invoke(gateway.caller, a.researchPlan, { id: kept.idea.id, lens: "market_space", ideaVersion: 1, modelPolicy: "auto", budget: { kind: "calls", limit: 6 } }) as { plan: { id: string } };
  try {
    await gateway.client.invoke(gateway.caller, a.researchStart, { id: kept.idea.id, lens: "market_space", planId: planned.plan.id });
    await network.entered;
    await f.revoke(actor, f.project.project_id, [a.researchStart]);
    // No worker timer wait: the real final guard must detect revocation when this boundary resumes.
    const before = { studio: facts(f.studio), search: searchFacts(), files: contentFiles() };
    network.release(); await f.studio.worker.whenIdle();
    assert.deepEqual({ studio: facts(f.studio), search: searchFacts(), files: contentFiles() }, before,
      "no late result/failure/checkpoint, SEL ledger or encrypted content write after revocation");
    assert.equal(network.seen.connections, stage === "dns" ? 0 : stage === "response" ? 2 : 1);
    assert.deepEqual(network.seen.bodies, stage === "dns" || stage === "tls" ? [] : stage === "extract" ? ["search"] : ["search", "extract"]);
  } finally { network.release(); await f.studio.worker.whenIdle(); await search.shutdown(); storage.close(); }
});
