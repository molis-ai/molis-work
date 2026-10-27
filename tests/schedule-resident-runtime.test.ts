import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, LocalActionGatewayClient, scheduleServiceFor } from "@molis-ai/molis-work-app-local-host";
import { reminderActions, scheduledOperationActions, getScheduledOperation } from "@molis-ai/molis-work-plugin-schedule";
import { currentCallId } from "@molis-ai/molis-work-kernel";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { serveTestHost } from "./fixtures/test-home.js";
import { scheduledOwnerPlugin } from "./fixtures/schedule-runtime.js";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";

const automaticSchedule: ActionDefinition<{ text: string; at: string }, { reminderId: string }> = {
  capability_id: "fixture.periodic.register", version: 1, operation: "command", action: {
    title: "Register reminder", description: "The plugin consumes the public Schedule action", kind: "operation", scope: "project", scheduling: "concurrent",
    audiences: ["mcp"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { text: { type: "string" }, at: { type: "string" } }, required: ["text", "at"], additionalProperties: false },
    output_schema: { type: "object", properties: { reminderId: { type: "string" } }, required: ["reminderId"], additionalProperties: false },
  },
};
function residentOwner() {
  const owner = scheduledOwnerPlugin(), start = owner.definition.start;
  owner.definition.manifest.actions = [...owner.definition.manifest.actions!, automaticSchedule];
  owner.definition.start = async context => {
    const contribution = await start(context);
    return { ...contribution, actions: [...contribution.actions!, { ...automaticSchedule, handle: async (_caller, raw) =>
      context.services!.actions!.invoke(reminderActions.add, raw as { at: string; text: string }) }] };
  };
  return owner;
}
async function waitAutomatic(check: () => boolean | Promise<boolean>) {
  const end = Date.now() + 10000;
  while (!await check()) { assert.ok(Date.now() < end, "automatic service effect did not settle"); await new Promise(resolve => setTimeout(resolve, 10)); }
}

// Only the production setInterval is advanced: no manual schedule.tick and no project page.
test("W2-18-SCHEDULE-01: persistent and gateway-created public jobs execute without any project page", { timeout: 60000 }, async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const home = await mkdtemp(join(tmpdir(), "schedule-resident-")), previous = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const owner = residentOwner(), options = { homeDirectory: home, completeText: null, pluginFixtures: { project: [owner.definition] } };
  let host = new MolisWorkLocalHost(options), served = await serveTestHost(null, { home, host });
  try {
    const project = await served.createProject("Resident public jobs"), actor = "runtime:periodic";
    await served.grant(actor, project.project_id, [automaticSchedule]);
    const caller = { actor_id: actor, project_id: project.project_id, audience: "mcp" as const, permissions: [] };
    const gateway = () => new LocalActionGatewayClient({ url: served.origin, homeDirectory: home, clientId: actor, projectId: project.project_id, controlToken: served.controlToken });
    let client = gateway(); await client.discover(caller);
    const at = new Date(Date.now() + 300).toISOString();
    await client.invoke(caller, automaticSchedule, { text: "Persisted automatic reminder", at });
    await served.close(); await host.close();
    host = new MolisWorkLocalHost(options); served = await serveTestHost(null, { home, host });
    assert.equal(host.status().projects.length, 0, "launch leaves projects unopened until the first round");
    await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(at) - Date.now() + 20)));
    t.mock.timers.tick(30000);
    await waitAutomatic(() => host.status().projects.some(row => row.project_id === project.project_id && row.state === "ready"));
    const items = () => host.withProject(project.reference, runtime => createLocalFeedApplication(runtime.store.db).snapshot(project.project_id).feed_items);
    await waitAutomatic(async () => (await items()).some(item => item.summary === "Persisted automatic reminder"));
    client = gateway(); await client.discover(caller);
    const freshAt = new Date(Date.now() + 100).toISOString();
    await client.invoke(caller, automaticSchedule, { text: "Gateway automatic reminder", at: freshAt });
    await new Promise(resolve => setTimeout(resolve, 120)); t.mock.timers.tick(30000);
    await waitAutomatic(async () => (await items()).some(item => item.summary === "Gateway automatic reminder"));
    t.mock.timers.tick(30000); await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual((await items()).map(item => item.summary).sort(), ["Gateway automatic reminder", "Persisted automatic reminder"]);
    await host.withProject(project.reference, runtime => assert.ok(scheduleServiceFor(runtime.store.db).list().every(job => !job.enabled && job.last_wakeup?.status === "ok")));
  } finally {
    await served.close(); await host.close();
    if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous;
    resetSecretStoreCache(); await rm(home, { recursive: true, force: true });
  }
});

for (const disposition of ["service", "project", "delete"] as const) test(`W2-18-SCHEDULE-02: ${disposition} close revokes a real waiting scheduled dependency`, { timeout: 60000 }, async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const home = await mkdtemp(join(tmpdir(), "schedule-resident-stop-"));
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), late = Promise.withResolvers<void>(), aborted = Promise.withResolvers<void>();
  let revoked = false, effects = 0;
  const owner = residentOwner();
  owner.execute(async caller => {
    caller.signal?.addEventListener("abort", () => aborted.resolve(), { once: true });
    entered.resolve(); await release.promise;
    try { await caller.beforeEffect(); effects++; return { text: "Forbidden late result" }; }
    catch (error) { revoked = caller.signal?.aborted === true; throw error; }
    finally { late.resolve(); }
  });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [owner.definition] } });
  let served = await serveTestHost(null, { home, host });
  try {
    const project = await served.createProject("Waiting public job");
    await host.inspectActions({ actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [] }, project.reference);
    const at = new Date(Date.now() + 100).toISOString();
    const created = await owner.actions(project.project_id).invoke(scheduledOperationActions.add, { at, operation: "summarize", input: { text: "waiting" }, inbox: true });
    await new Promise(resolve => setTimeout(resolve, 120)); t.mock.timers.tick(30000);
    await Promise.race([entered.promise, new Promise((_, reject) => setTimeout(() => reject(new Error("scheduled dependency did not start")), 10000))]);
    const closing = disposition === "service" ? served.close() : disposition === "project" ? host.closeProject(project.reference)
      : served.web.post(`/api/settings/projects/${project.project_id}/delete`, { delete_confirmed: true, idempotency_key: "schedule-resident-delete" });
    await Promise.race([aborted.promise, new Promise((_, reject) => setTimeout(() => reject(new Error("close did not cancel dependency")), 10000))]);
    release.resolve(); await late.promise;
    const closed = await closing;
    if (disposition === "delete") assert.equal((closed as { deletion: { project_id: string } }).deletion.project_id, project.project_id);
    assert.equal(revoked, true); assert.equal(effects, 0);
    if (disposition === "service") {
      served = await serveTestHost(null, { home, host });
      await host.withProject(project.reference, runtime => {
        const clock = scheduleServiceFor(runtime.store.db);
        assert.equal(clock.active, true); assert.equal(clock.list().length, 1);
        assert.equal(clock.list()[0]!.last_wakeup, null, "cancelled run has no late technical receipt");
        assert.equal(createLocalFeedApplication(runtime.store.db).snapshot(project.project_id).feed_items.length, 0);
      });
      t.mock.timers.tick(30000); await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(owner.calls(), 1, "prepared operation is never dispatched again after cancellation");
      await waitAutomatic(() => host.withProject(project.reference, runtime => getScheduledOperation(runtime.store.db, project.project_id, created.scheduleId)?.state === "needs_review"));
    } else assert.equal(host.status().projects.some(row => row.project_id === project.project_id), false);
  } finally { release.resolve(); await served.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("W2-18-SCHEDULE-02: a source tick waiting inside Home preparation cannot reopen a project after close", { timeout: 60_000 }, async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const home = await mkdtemp(join(tmpdir(), "schedule-prepare-stop-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const served = await serveTestHost(null, { home, host });
  const project = await served.createProject("Prepare wait");
  await host.withProject(project.reference, () => undefined);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(host.status().projects.map(row => row.project_id), [project.project_id], "only the target runtime was opened");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let operation: string | undefined;
  const plugins = host.homePlugins; assert.ok(plugins);
  await plugins.ready();
  const original = plugins.ready.bind(plugins); let waiting = true;
  t.mock.method(plugins, "ready", async () => { if (waiting && currentCallId()) { operation = currentCallId(); entered.resolve(); await release.promise; } return original(); });
  try {
    t.mock.timers.tick(30_000);
    await Promise.race([entered.promise, new Promise((_, reject) => setTimeout(() => reject(new Error("target tick did not reach Home preparation")), 5_000))]);
    assert.equal(typeof operation, "string", "the barrier is the target timer operation");
    assert.equal(await host.closeProject(project.reference), true, "close released the actual target runtime");
    waiting = false; release.resolve();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(host.status().projects.some(row => row.project_id === project.project_id), false, "the cancelled tick never opens a replacement instance");
    assert.equal(host.callLog!.find(operation!).filter(row => row.project_id === project.project_id && row.capability_id === "feed.sources.tick").length, 0, "cancelled preparation wrote no source effect receipt");
  } finally { waiting = false; release.resolve(); await served.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});
