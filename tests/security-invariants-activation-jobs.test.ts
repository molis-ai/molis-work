import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HomePluginHost, projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { jobProbe } from "./fixtures/plugin-jobs.js";
import { deferred, person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { openTestHome } from "./fixtures/test-home.js";

// S-51 (PG-038): the jobs an activation keeps (`services.background.keep`) belong to the installation, not to the call that kept them.

/** The Home plugin host over the Kernel alone, as the Host composes it, with the probe running. */
async function homeJobs(t: TestContext, probe: ReturnType<typeof jobProbe>) {
  const home = mkdtempSync(join(tmpdir(), "activation-jobs-")), actions = new ActionService();
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [probe.definition] });
  t.after(async () => { try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  const platform = await host.ready();
  return { home, host, actions, platform, install_id: host.installation(probe.id)!.install_id };
}

/** Changes the installation's record over a connection of its own, as another process would. */
function changeRecord(home: string, installId: string, change: (record: PluginInstanceRecord) => PluginInstanceRecord) {
  const db = new DatabaseSync(join(home, "plugin-runtime", "plugin-runtime.db"));
  try { const records = new SqlitePluginRuntimeRepository(db); records.save(change(records.get(installId)!)); } finally { db.close(); }
}

/** A job that waits for `release`, then checks and writes `result.<id>`; `finished` settles however it ends. */
function held(probe: ReturnType<typeof jobProbe>, onEnter = () => {}) {
  const release = deferred(), finished = deferred();
  probe.behavior.work = async (context, control, id) => {
    onEnter();
    try { await release.promise; await control.beforeEffect(); context.services!.storage!.set(`result.${id}`, control.job); } finally { finished.resolve(); }
  };
  return { release, finished };
}

test("S-51 PG-038 a call that has not passed its last authority check keeps no job: before its check, after a refused one, or as a query", async t => {
  const probe = jobProbe(), { actions } = await homeJobs(t, probe);
  probe.behavior.order = "unchecked";
  await assert.rejects(actions.invoke(person(probe.permissions), probe.keep, { id: "unchecked" }), { code: "plugin.background_job_unchecked" });
  probe.behavior.order = "despite";
  for (const mode of ["cancelled", "revoked"] as const) {
    const controller = new AbortController();
    let permitted = true;
    probe.behavior.beforeCheck = async () => { if (mode === "cancelled") controller.abort(); else permitted = false; };
    await assert.rejects(actions.invoke({ ...person(probe.permissions), signal: controller.signal,
      assert_authority_current: () => { if (!permitted) throw new ActionError("actions.forbidden", "caller revoked"); } }, probe.keep, { id: mode }));
  }
  assert.equal(probe.refused.length, 2, "both calls were refused at their own check");
  probe.behavior.beforeCheck = async () => {}; probe.behavior.order = "checked";
  await assert.rejects(actions.invoke(person(probe.permissions), probe.peek, { id: "query" }), { code: "plugin.background_job_origin" });
  assert.equal(probe.kept.length, 0, "nothing was kept");
  for (const id of ["unchecked", "cancelled", "revoked", "query"]) assert.equal(probe.stored(`result.${id}`), null);
});

test("S-51 PG-038 outside every action and job a job is kept only while start() runs, not after it returned nor from a timer it set", async t => {
  const probe = jobProbe(), later = deferred(), tried = deferred();
  let late: unknown;
  probe.behavior.onStart = (_context, keep) => {
    keep("resume", "resumed");
    void later.promise.then(() => { try { keep("follow", "late"); } catch (error) { late = error; } tried.resolve(); });
  };
  await homeJobs(t, probe);
  await probe.kept[0]!.done;
  assert.equal(probe.stored("result.resumed"), "resume");
  later.resolve(); await tried.promise;
  assert.equal((late as { code?: string } | undefined)?.code, "plugin.background_job_origin");
  assert.throws(() => probe.contexts.at(-1)!.services!.background!.keep("follow", async () => {}), { code: "plugin.background_job_origin" });
  assert.equal(probe.kept.length, 1);
});

test("S-51 PG-038 only a job the Manifest declares is kept, and a declaration may only name permissions the Manifest declares", async t => {
  const probe = jobProbe(), { actions } = await homeJobs(t, probe);
  await assert.rejects(actions.invoke(person(probe.permissions), probe.keep, { id: "other", job: "undeclared" }), { code: "plugin.background_undeclared" });
  assert.equal(probe.kept.length, 0);
  const manifest = probe.definition.manifest, job = { job_id: "follow", reason: "跟到底", permissions: ["storage:private"] };
  assert.throws(() => parsePluginManifest({ ...manifest, background: { jobs: [{ ...job, permissions: ["undeclared:write"] }] } }), /未声明权限/u);
  assert.throws(() => parsePluginManifest({ ...manifest, background: { jobs: [job, job] } }), /后台作业重复/u);
  assert.throws(() => parsePluginManifest({ ...manifest, background: { jobs: [{ ...job, reason: " " }] } }), /用途/u);
});

test("S-51 PG-038 stopping the plugin stops its jobs, and the platform refuses a write after that even when the job never asks", async t => {
  const probe = jobProbe(), entered = deferred(), release = deferred(), wrote = deferred();
  let refusal: unknown;
  probe.behavior.work = async (context, _control, id) => {
    entered.resolve(); await release.promise;
    try { context.services!.storage!.set(`result.${id}`, "late"); } catch (error) { refusal = error; } finally { wrote.resolve(); }
  };
  const { actions, platform, install_id } = await homeJobs(t, probe);
  assert.equal(await actions.invoke(person(probe.permissions), probe.keep, { id: "stopped" }), "kept");
  await entered.promise;
  const stopped = assert.rejects(probe.kept[0]!.done);
  await platform.runtime.stop(install_id); await stopped;
  assert.equal(probe.controls[0]!.signal.aborted, true);
  await assert.rejects(probe.controls[0]!.beforeEffect());
  release.resolve(); await wrote.promise;
  assert.ok(refusal instanceof Error && "code" in refusal, "the platform's storage refused the stopped job's write itself");
  await platform.supervisor.restart(probe.id);
  assert.equal(probe.stored("result.stopped"), null);
});

test("S-51 PG-038 a record that no longer grants the job's permissions stops it on the shared check, and its beforeEffect refuses", async t => {
  const probe = jobProbe(), entered = deferred(), { release, finished } = held(probe, () => entered.resolve());
  const { home, actions, install_id } = await homeJobs(t, probe);
  await actions.invoke(person(probe.permissions), probe.keep, { id: "revoked" }); await entered.promise;
  const stopped = assert.rejects(probe.kept[0]!.done, { code: "actions.forbidden" }), since = Date.now();
  changeRecord(home, install_id, record => ({ ...record, grants: record.grants.filter(item => item !== "storage:private") }));
  await stopped;
  assert.ok(Date.now() - since < 2_000, "the activation's timer heard of it while the job was still waiting");
  assert.throws(() => probe.controls[0]!.assert_authority_current());
  changeRecord(home, install_id, record => ({ ...record, grants: [...record.grants, "storage:private"] }));
  release.resolve(); await finished.promise;
  assert.equal(probe.stored("result.revoked"), null, "granting it again does not bring the stopped job back");
});

test("S-51 PG-038 a job of another installation generation or an earlier activation writes nothing, and the next start() keeps its own", async t => {
  const probe = jobProbe(), entered = deferred();
  let starts = 0;
  probe.behavior.onStart = (_context, keep) => { if (starts++) keep("resume", `resumed-${starts}`); };
  const { release, finished } = held(probe, () => entered.resolve());
  const { home, actions, platform, install_id } = await homeJobs(t, probe);
  await actions.invoke(person(probe.permissions), probe.keep, { id: "replaced" }); await entered.promise;
  const generation = platform.runtime.get(install_id)!.installation_generation;
  changeRecord(home, install_id, record => ({ ...record, installation_generation: `${generation}-other` }));
  await assert.rejects(probe.kept[0]!.done, { code: "actions.forbidden" });
  changeRecord(home, install_id, record => ({ ...record, installation_generation: generation }));
  await actions.invoke(person(probe.permissions), probe.keep, { id: "earlier" });
  await platform.supervisor.restart(probe.id);
  await assert.rejects(probe.kept[1]!.done);
  await assert.rejects(probe.controls[0]!.beforeEffect()); await assert.rejects(probe.controls[1]!.beforeEffect());
  release.resolve(); await finished.promise;
  probe.behavior.work = async (context, control, id) => { await control.beforeEffect(); context.services!.storage!.set(`result.${id}`, control.job); };
  await probe.kept[2]!.done;
  assert.equal(probe.stored("result.resumed-2"), "resume", "the new activation's start() kept a job of its own");
  assert.equal(probe.stored("result.replaced"), null); assert.equal(probe.stored("result.earlier"), null);
});

test("S-51 PG-038 closing a project stops the jobs a Home plugin kept there, and its jobs in another project run on", { timeout: 60_000 }, async t => {
  const probe = jobProbe("jobprojects", "project"), entered = deferred();
  let waiting = 0;
  const { release } = held(probe, () => { if (++waiting === 2) entered.resolve(); });
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await f.host.homePlugins!.ready();
  const closed = await f.project("Closed project"), open = await f.project("Open project");
  for (const project of [closed, open]) {
    assert.equal(await f.host.actionClient(project.reference).invoke(person(probe.permissions, project.project_id), probe.keep, { id: project.project_id }), "kept");
  }
  await entered.promise;
  const control = (projectId: string) => probe.controls.find(item => item.project_id === projectId)!;
  assert.equal(await f.host.closeProject(closed.reference), true);
  assert.equal(control(closed.project_id).signal.aborted, true); assert.equal(control(open.project_id).signal.aborted, false);
  release.resolve(); await Promise.allSettled(probe.kept.map(job => job.done));
  assert.equal(probe.stored(`result.${closed.project_id}`), null); assert.equal(probe.stored(`result.${open.project_id}`), "follow");
});

test("S-51 PG-038 deleting a project stops the jobs kept there, and only those", async t => {
  const probe = jobProbe("jobdeletion", "project"), entered = deferred();
  let waiting = 0;
  const { release } = held(probe, () => { if (++waiting === 2) entered.resolve(); });
  const { home, actions } = await homeJobs(t, probe);
  for (const project of ["p1", "p2"]) await actions.invoke(person(probe.permissions, project), probe.keep, { id: project });
  await entered.promise;
  assert.equal(await projectDeletedHooksFor(home).clear(`plugin-background:${probe.id}`, "p1"), true);
  const control = (projectId: string) => probe.controls.find(item => item.project_id === projectId)!;
  assert.equal(control("p1").signal.aborted, true); assert.equal(control("p2").signal.aborted, false);
  release.resolve(); await Promise.allSettled(probe.kept.map(job => job.done));
  assert.equal(probe.stored("result.p1"), null); assert.equal(probe.stored("result.p2"), "follow");
});

test("S-51 PG-038 closing the Home stops every job, and none writes after", async t => {
  const probe = jobProbe(), entered = deferred();
  let waiting = 0;
  const { release } = held(probe, () => { if (++waiting === 2) entered.resolve(); });
  const { home, host, actions } = await homeJobs(t, probe);
  for (const id of ["one", "two"]) await actions.invoke(person(probe.permissions), probe.keep, { id });
  await entered.promise;
  await host.close();
  assert.deepEqual(probe.controls.map(control => control.signal.aborted), [true, true]);
  release.resolve(); await Promise.allSettled(probe.kept.map(job => job.done));
  const reopened = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: new ActionService(), client: new ActionService(), entries: [], fixtures: [probe.definition] });
  try { await reopened.ready(); assert.equal(probe.stored("result.one"), null); assert.equal(probe.stored("result.two"), null); }
  finally { await reopened.close(); }
});

for (const mode of ["cancelled", "revoked"] as const) {
  test(`S-51 PG-038 R-CODING-RECEIPT-02 a call ${mode} after its last authority check leaves its job to follow what it accepted to the end`, async t => {
    const probe = jobProbe(), controller = new AbortController(), { release, finished } = held(probe);
    let permitted = true;
    probe.behavior.afterKeep = async () => { if (mode === "cancelled") controller.abort(); else permitted = false; };
    const { actions } = await homeJobs(t, probe);
    await actions.invoke({ ...person(probe.permissions), signal: controller.signal,
      assert_authority_current: () => { if (!permitted) throw new ActionError("actions.forbidden", "caller revoked"); } }, probe.keep, { id: mode }).catch(() => undefined);
    assert.equal(probe.controls[0]!.signal.aborted, false, "the call's end is not the job's");
    release.resolve(); await finished.promise; await probe.kept[0]!.done;
    assert.equal(probe.stored(`result.${mode}`), "follow");
  });
}

test("S-51 PG-038 a job kept through MCP follows on after the grant is revoked, as the installation: no MCP-only action, no record of the client", { timeout: 30_000 }, async t => {
  const probe = jobProbe("jobmcp"), entered = deferred(), release = deferred(), finished = deferred();
  const outcomes: { note?: unknown; mcp?: unknown } = {};
  probe.behavior.work = async (context, control, id) => {
    entered.resolve(); await release.promise;
    try {
      await control.beforeEffect(); context.services!.storage!.set(`result.${id}`, control.job);
      outcomes.note = await context.services!.actions!.invoke(probe.note, { id });
      outcomes.mcp = await context.services!.actions!.invoke(probe.mcpOnly, { id }).catch((error: unknown) => error);
    } finally { finished.resolve(); }
  };
  const f = await openTestHome(t, { host: { pluginFixtures: { home: [probe.definition] } } });
  await f.host.homePlugins!.ready();
  const actor = "runtime:job-client";
  await f.grant(actor, null, [probe.keep]);
  const { client, caller } = await f.mcp(actor, null);
  assert.equal(await client.invoke(caller, probe.keep, { id: "mcp" }), "kept");
  await entered.promise;
  await f.revoke(actor, null, [probe.keep]);
  release.resolve(); await finished.promise; await probe.kept[0]!.done;
  assert.equal(probe.stored("result.mcp"), "follow", "the job still records what it followed");
  assert.equal(outcomes.note, "noted");
  assert.ok(outcomes.mcp instanceof Error, "an action offered only to MCP is out of the installation's reach");
  assert.deepEqual(probe.noted.map(item => [item.actor_id, item.audience]), [[LOCAL_PERSON_ACTOR_ID, "plugin"]], "the installation called, not the MCP client");
  const rows = readFileSync(join(f.home, "logs", "action-calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line) as { capability_id: string; actor_id: string; audience: string; call_id: string });
  const kept = rows.find(row => row.capability_id === probe.keep.capability_id)!, made = rows.filter(row => [probe.note.capability_id, probe.mcpOnly.capability_id].includes(row.capability_id));
  assert.equal(kept.actor_id, actor); assert.ok(made.length >= 1);
  for (const row of made) {
    assert.notEqual(row.actor_id, actor); assert.equal(row.audience, "plugin"); assert.notEqual(row.call_id, kept.call_id, "the job is an operation of its own");
  }
});
