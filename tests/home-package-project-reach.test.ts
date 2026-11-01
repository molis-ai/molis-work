import assert from "node:assert/strict";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { HomeConsentLedger, MolisWorkLocalHost, SandboxPackageStore, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalPluginActions, type GoalEventWorkStateView } from "@molis-ai/molis-work-plugin-goals/contract";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { projectReachPackage, REACH_PLUGIN_ID, REACH_GOAL_ID } from "./fixtures/home-project-reach-package.js";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { person, ref, operate, operationsOf } from "./fixtures/home-sandbox.js";
import { initializeBoard } from "./fixtures/goals-board.js";
import { goalApplicationOf } from "./fixtures/goal-application.js";

const mac = { skip: process.platform !== "darwin", timeout: 150_000 };
const rejected = (error: unknown) => error instanceof Error && /同意|授权|声明|停止|拒绝|项目|没有启用|失效|不可用|execution|capability/iu.test(error.message);
const projected = (state: GoalEventWorkStateView) => ({ cursor: state.goal_event_cursor, summary: state.progress_summary?.summary ?? "", title: state.intent.title });

async function setup(t: TestContext) {
  const f = await serveHomeRuntime(t), a = await f.project("Reach A"), b = await f.project("Reach B"), publisher = newPublisher();
  for (const project of [a, b]) {
    await initializeBoard(f.host, project.reference);
    await f.host.withProject(project.reference, runtime => goalApplicationOf(runtime).goalEvents.createIntent({ project_id: project.project_id,
      goal_id: REACH_GOAL_ID, title: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", idempotency_key: "create-reach-goal" }));
  }
  let host = f.host;
  const install = async (bundle: PluginPackageBundle) => {
    const client = host.actionClient(a.reference), caller = person(a.project_id);
    const preview = await client.invoke(caller, ref(pluginInstallActions.preview), { bundle }) as { preview_id: string };
    await client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Reach publisher" });
  };
  await install(projectReachPackage(publisher));
  const ledger = new HomeConsentLedger(f.home);
  const caller = (project: typeof a | null, audience: "user" | "agent" = "agent"): ActionCallContext => ({ actor_id: audience === "user" ? LOCAL_PERSON_ACTOR_ID : "reach-agent",
    audience, project_id: project?.project_id ?? null, permissions: [] });
  const call = async (project: typeof a | null, operation: string, input: unknown, pluginId = REACH_PLUGIN_ID, audience: "user" | "agent" = "agent") => {
    const client = project ? host.actionClient(project.reference) : host.homeActionClient(), context = caller(project, audience);
    return operate(client, context, await operationsOf(client, context, pluginId), operation, input);
  };
  const state = (project: typeof a) => host.actionClient(project.reference).invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: ["goals:read"] },
    ref(goalPluginActions.state), { goal_id: REACH_GOAL_ID }) as Promise<GoalEventWorkStateView>;
  const owner = async () => { const value = await host.homePlugins!.projectReachConsents(); assert.ok(value); return value; };
  // This is approval-owner setup for sandbox tests. The companion browser file proves the actual settings entrance.
  const agree = async (project: typeof a, pluginId = REACH_PLUGIN_ID) => {
    const service = await owner(), selection = service.list(project.project_id).find(row => row.plugin_id === pluginId)!;
    return service.grant(project.project_id, selection, async () => {});
  };
  const revoke = async (project: typeof a) => {
    const service = await owner(); return service.revoke(project.project_id, service.list(project.project_id).find(row => row.plugin_id === REACH_PLUGIN_ID)!, async () => {});
  };
  return { ...f, a, b, publisher, install, ledger, call, state, owner, agree, revoke,
    get activeHost() { return host; },
    async reopen() {
      await host.close(); host = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
      host.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
      await host.homePlugins!.ready();
    },
    async close() { if (host !== f.host) await host.close(); },
  };
}

test("RAC-2644 RAC-2645 RAC-2647 real Home sandbox uses only the invoking project's consent and keeps its Home storage identity", mac, async t => {
  const f = await setup(t), read = { goal_id: REACH_GOAL_ID }, a0 = await f.state(f.a), b0 = await f.state(f.b);
  for (const audience of ["user", "agent"] as const) await assert.rejects(f.call(f.a, "reach.read", read, REACH_PLUGIN_ID, audience), rejected);
  await assert.rejects(f.call(f.a, "reach.submit", { text: "not-approved" }), rejected);
  assert.deepEqual(await f.state(f.a), a0); assert.deepEqual(await f.state(f.b), b0);
  assert.equal(await f.call(null, "notes.add", { text: "Home data" }), true);
  const approved = await f.agree(f.a);
  assert.equal(approved.state, "approved"); assert.equal(approved.consent!.granted_by, "user");
  assert.equal(approved.consent!.subject, JSON.stringify([f.a.project_id, f.activeHost.homePlugins!.installation(REACH_PLUGIN_ID)!.install_id]));
  assert.deepEqual(approved.capability_ids, [goalPluginActions.state.capability_id, goalPluginActions.progress.capability_id].sort());
  assert.deepEqual(await f.call(f.a, "reach.read", read), projected(a0));
  const written = { goal_id: REACH_GOAL_ID, based_on_cursor: a0.goal_event_cursor, summary: "A through the real sandbox", idempotency_key: "a-progress", project_id: f.b.project_id, subject: "B" };
  const first = await f.call(f.a, "reach.write", written) as { replayed: boolean; event_id: string };
  assert.equal(first.replayed, false);
  const replay = await f.call(f.a, "reach.write", written) as typeof first;
  assert.equal(replay.replayed, true); assert.equal(replay.event_id, first.event_id);
  const a1 = await f.state(f.a);
  assert.equal(a1.goal_event_cursor, a0.goal_event_cursor + 1); assert.equal(a1.progress_summary!.summary, written.summary);
  assert.deepEqual(await f.state(f.b), b0, "the worker's forged project value cannot select B");
  await assert.rejects(f.call(f.b, "reach.submit", { text: "B without consent" }), rejected);
  await assert.rejects(f.call(null, "reach.write", { ...written, project_id: f.a.project_id }), rejected);
  assert.deepEqual(await f.call(f.b, "notes.list", {}), [{ id: "1", text: "Home data" }]);
  const other = "io.molis.work.example.otherreach";
  await f.install(projectReachPackage(newPublisher(), { pluginId: other }));
  await assert.rejects(f.call(f.a, "reach.read", read, other), rejected);
  const history = f.ledger.consents(REACH_PLUGIN_ID);
  try {
    await f.reopen();
    assert.deepEqual(await f.call(f.a, "reach.read", read), projected(a1));
    assert.deepEqual(f.ledger.consents(REACH_PLUGIN_ID), history);
    assert.deepEqual(await f.call(null, "notes.list", {}), [{ id: "1", text: "Home data" }]);
    await assert.rejects(f.call(f.b, "reach.read", read), rejected);
  } finally { await f.close(); }
});

/** Pause only the production client's boundary; the unchanged real gateway and Goals still own every result and write. */
function holdTarget(host: MolisWorkLocalHost, capabilityId: string, phase: "before" | "after") {
  const original = host.actionClient, entered = deferred(), release = deferred();
  let held = false, seen: ActionCallContext | undefined;
  host.actionClient = function (...args: Parameters<typeof original>) {
    const client = original.apply(this, args);
    return { ...client, invoke: async (caller, reference, input) => {
      if (!held && caller.audience === "plugin" && caller.host_plugin?.plugin_id === REACH_PLUGIN_ID && reference.capability_id === capabilityId) {
        held = true; seen = caller;
        if (phase === "before") { entered.resolve(); await release.promise; }
        const result = await client.invoke(caller, reference, input);
        if (phase === "after") { entered.resolve(); await release.promise; }
        return result;
      }
      return client.invoke(caller, reference, input);
    } };
  };
  return { entered: entered.promise, release: release.resolve, caller: () => seen,
    close() { release.resolve(); host.actionClient = original; } };
}

/** The shared sandbox serializes a lane. Interleave at its real project-directory await, before entering that lane. */
function holdCatalog(host: MolisWorkLocalHost, projectId: string) {
  const original = host.inspectActions, entered = deferred(), release = deferred(); let held = false;
  host.inspectActions = async function (...args: Parameters<typeof original>) {
    if (!held && args[0].project_id === projectId && args[0].audience === "plugin") { held = true; entered.resolve(); await release.promise; }
    return original.apply(this, args);
  };
  return { entered: entered.promise, release: release.resolve, close() { release.resolve(); host.inspectActions = original; } };
}

test("RAC-2646 S-107 withdrawal before a real Goal effect blocks old calls even after regrant; late reads and committed commands are distinguished", mac, async t => {
  const f = await setup(t); await f.agree(f.a);
  for (const regrant of [false, true]) {
    const before = await f.state(f.a), hold = holdTarget(f.activeHost, goalPluginActions.progress.capability_id, "before");
    const pending = f.call(f.a, "reach.write", { goal_id: REACH_GOAL_ID, based_on_cursor: before.goal_event_cursor, summary: "must not write", idempotency_key: "withdraw-" + regrant });
    const rejectedCall = assert.rejects(pending, rejected);
    try {
      await Promise.race([hold.entered, pending]);
      const old = (await f.owner()).list(f.a.project_id)[0]!.consent!.consent_id;
      await f.revoke(f.a);
      if (regrant) assert.notEqual((await f.agree(f.a)).consent!.consent_id, old);
      assert.throws(() => hold.caller()!.host_plugin!.assertActive(), rejected, "the gateway's synchronous final authority check rejects without another await");
      hold.release(); await rejectedCall;
      assert.deepEqual(await f.state(f.a), before, "the actual Goals owner recorded nothing before its effect");
    } finally { hold.close(); }
    await f.agree(f.a);
  }
  const readHold = holdTarget(f.activeHost, goalPluginActions.state.capability_id, "after"), read = f.call(f.a, "reach.read", { goal_id: REACH_GOAL_ID });
  const rejectedRead = assert.rejects(read, rejected);
  try { await Promise.race([readHold.entered, read]); await f.revoke(f.a); readHold.release(); await rejectedRead; }
  finally { readHold.close(); }
  await f.agree(f.a);
  const before = await f.state(f.a), committed = holdTarget(f.activeHost, goalPluginActions.progress.capability_id, "after");
  const write = f.call(f.a, "reach.write", { goal_id: REACH_GOAL_ID, based_on_cursor: before.goal_event_cursor, summary: "already committed", idempotency_key: "committed" });
  const unknown = assert.rejects(write, (error: { code?: string; message?: string }) => error.code === "actions.outcome_unknown" || /unknown|可能已|不确定|未知/u.test(error.message ?? ""));
  try {
    await Promise.race([committed.entered, write]); await f.revoke(f.a); committed.release(); await unknown;
    assert.equal((await f.state(f.a)).progress_summary!.summary, "already committed", "a completed business write is never claimed to have rolled back");
  } finally { committed.close(); }
  await f.agree(f.a); assert.equal(await f.call(f.a, "reach.submit", { text: "fresh call" }), true);
});

test("RAC-2647 real A/B calls interleave without sharing a last-project variable or changing the Home storage namespace", mac, async t => {
  const f = await setup(t); await f.agree(f.a); await f.agree(f.b);
  const a0 = await f.state(f.a), b0 = await f.state(f.b), hold = holdCatalog(f.activeHost, f.a.project_id);
  const a = f.call(f.a, "reach.write", { goal_id: REACH_GOAL_ID, based_on_cursor: a0.goal_event_cursor, summary: "only A", idempotency_key: "a-interleave" });
  try {
    await Promise.race([hold.entered, a]);
    await f.call(f.b, "reach.write", { goal_id: REACH_GOAL_ID, based_on_cursor: b0.goal_event_cursor, summary: "only B", idempotency_key: "b-interleave" });
    hold.release(); await a;
    assert.equal((await f.state(f.a)).progress_summary!.summary, "only A"); assert.equal((await f.state(f.b)).progress_summary!.summary, "only B");
  } finally { hold.close(); }
  await f.call(f.a, "notes.add", { text: "A into Home" }); await f.call(f.b, "notes.add", { text: "B into Home" });
  assert.deepEqual(await f.call(null, "notes.list", {}), [{ id: "1", text: "A into Home" }, { id: "2", text: "B into Home" }]);
  await assert.rejects(f.call(null, "reach.read", { goal_id: REACH_GOAL_ID }), rejected, "a later Home/background call cannot borrow the last project");
});

test("RAC-2649 real signed upgrades keep historical approval for the same or smaller declarations and require a new row for additions", mac, async t => {
  const f = await setup(t), first = await f.agree(f.a), original = first.consent!;
  const oldInstall = f.activeHost.homePlugins!.installation(REACH_PLUGIN_ID)!;
  await f.install(projectReachPackage(f.publisher, { version: "1.1.0" }));
  const nextInstall = f.activeHost.homePlugins!.installation(REACH_PLUGIN_ID)!;
  assert.equal(nextInstall.install_id, oldInstall.install_id); assert.notEqual(nextInstall.manifest_digest, oldInstall.manifest_digest);
  const packages = new SandboxPackageStore(f.home);
  const historical = join(packages.load(REACH_PLUGIN_ID, oldInstall.publisher_signature, "1.0.0").packagePath!, "bundle.json");
  renameSync(historical, historical + ".unavailable");
  assert.deepEqual((await f.agree(f.a)).consent, original, "same declarations do not rewrite the original digest or row");
  assert.equal(await f.call(f.a, "reach.submit", { text: "same declarations" }), true);
  await f.install(projectReachPackage(f.publisher, { version: "1.2.0", extraCapability: "model.generate" }));
  const expanded = (await f.owner()).list(f.a.project_id).find(row => row.plugin_id === REACH_PLUGIN_ID)!;
  assert.equal(expanded.state, "expanded"); assert.deepEqual(expanded.added_capability_ids, ["model.generate"], "even a Home-only added declaration requires fresh project agreement");
  await assert.rejects(f.call(f.a, "reach.read", { goal_id: REACH_GOAL_ID }), rejected);
  await assert.rejects(f.call(f.b, "reach.read", { goal_id: REACH_GOAL_ID }), rejected);
  const before = await f.state(f.a), agreed = await f.agree(f.a);
  assert.notEqual(agreed.consent!.consent_id, original.consent_id); assert.equal(agreed.consent!.manifest_digest, f.activeHost.homePlugins!.installation(REACH_PLUGIN_ID)!.manifest_digest);
  assert.equal(f.ledger.consent(original.consent_id)!.manifest_digest, original.manifest_digest); assert.ok(f.ledger.consent(original.consent_id)!.revoked_at);
  assert.deepEqual(await f.call(f.a, "reach.read", { goal_id: REACH_GOAL_ID }), projected(before));
  await f.install(projectReachPackage(f.publisher, { version: "1.3.0" }));
  assert.deepEqual((await f.agree(f.a)).consent, agreed.consent, "shrinking the declaration preserves the larger historical agreement");
  const current = join(packages.load(REACH_PLUGIN_ID, oldInstall.publisher_signature, "1.3.0").packagePath!, "bundle.json");
  let tampered = false;
  try {
    await f.reopen();
    assert.deepEqual(await f.call(f.a, "reach.read", { goal_id: REACH_GOAL_ID }), projected(before), "historical package bytes are not needed to recover its saved approval set");
    const bundle = JSON.parse(readFileSync(current, "utf8")) as PluginPackageBundle;
    renameSync(current, current + ".original"); tampered = true;
    writeFileSync(current, JSON.stringify({ ...bundle, payload: { ...bundle.payload, manifest: { ...bundle.payload.manifest, name: "changed without signing" } } }), { mode: 0o600 });
    await f.reopen();
    const unavailable = (await f.owner()).list(f.a.project_id).find(row => row.plugin_id === REACH_PLUGIN_ID)!;
    assert.equal(unavailable.state, "unavailable");
    await assert.rejects(f.call(f.a, "reach.submit", { text: "invalid current signature" }));
    assert.deepEqual(await f.state(f.a), before, "a saved approval never bypasses verification of the current signed package");
    assert.deepEqual(f.ledger.consent(agreed.consent!.consent_id), agreed.consent);
  } finally {
    await f.close();
    if (tampered) { rmSync(current); renameSync(current + ".original", current); }
  }
});

for (const keepData of [true, false]) test(`RAC-2648 uninstall keep_data=${keepData} revokes every project's agreement before reinstalling`, mac, async t => {
  const f = await setup(t); await f.agree(f.a); await f.agree(f.b);
  await f.call(null, "notes.add", { text: "retained only by data choice" });
  const before = f.ledger.consents(REACH_PLUGIN_ID).filter(row => row.kind === "project_reach" && !row.revoked_at);
  const installId = f.activeHost.homePlugins!.installation(REACH_PLUGIN_ID)!.install_id;
  assert.equal(before.length, 2);
  const response = await f.request("/api/settings/plugin-permissions/uninstall", { method: "POST", body: { plugin_id: REACH_PLUGIN_ID, keep_data: keepData } });
  assert.equal(response.status, 200, await response.text());
  for (const row of before) assert.ok(f.ledger.consent(row.consent_id)!.revoked_at);
  await f.install(projectReachPackage(f.publisher));
  if (keepData) assert.equal(f.activeHost.homePlugins!.installation(REACH_PLUGIN_ID)!.install_id, installId, "reusing the retained installation cannot restore its revoked project agreements");
  await assert.rejects(f.call(f.a, "reach.read", { goal_id: REACH_GOAL_ID }), rejected);
  await assert.rejects(f.call(f.b, "reach.read", { goal_id: REACH_GOAL_ID }), rejected);
  assert.deepEqual(await f.call(null, "notes.list", {}), keepData ? [{ id: "1", text: "retained only by data choice" }] : []);
});

test("RAC-2648 the actual ProjectDeletionService clears the deleted project's agreements and leaves the Home instance and B usable", mac, async t => {
  const f = await setup(t); await f.agree(f.a); await f.agree(f.b);
  const install = f.activeHost.homePlugins!.installation(REACH_PLUGIN_ID)!;
  const rows = f.ledger.consents(REACH_PLUGIN_ID).filter(row => row.kind === "project_reach" && !row.revoked_at);
  const response = await f.request(`/api/settings/projects/${f.a.project_id}/delete`, { method: "POST", body: { delete_confirmed: true, idempotency_key: "reach-delete-a" } });
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json() as { deletion: { cleanup_state: string; owner_steps: Array<{ owner_id: string; state: string }> } };
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.equal(result.deletion.owner_steps.find(step => step.owner_id === "plugin-project-reach")?.state, "complete");
  for (const row of rows) assert.equal(Boolean(f.ledger.consent(row.consent_id)!.revoked_at), JSON.parse(row.subject)[0] === f.a.project_id);
  assert.equal(f.activeHost.homePlugins!.installation(REACH_PLUGIN_ID)!.install_id, install.install_id);
  assert.equal(f.activeHost.homePlugins!.installation(REACH_PLUGIN_ID)!.state, "running");
  assert.equal(await f.call(f.b, "reach.submit", { text: "B after deleting A" }), true);
  assert.equal((await f.state(f.b)).progress_summary!.summary, "B after deleting A");
});
