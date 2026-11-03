import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { HostTextRequestOptions } from "@molis-ai/molis-work-app-local-host";
import { HomePluginHost, LocalMcpServer, MolisWorkLocalHost, projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { currentPluginAction } from "@molis-ai/molis-work-plugin-runtime";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { backgroundProbe } from "./fixtures/plugin-background.js";
import { deferred, grantHomeProbe, person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { openTestHome } from "./fixtures/test-home.js";

for (const scope of ["home", "project"] as const) {
  test(`S-18 RAC-51 ${scope} HTTP finishes while accepted work continues, but old handler and route controls expire`, { timeout: 30_000 }, async t => {
    const probe = backgroundProbe(`background-${scope}`, scope), entered = deferred(), release = deferred();
    probe.behavior.work = async () => { entered.resolve(); await release.promise; return "after HTTP response"; };
    const f = await serveHomeRuntime(t, { pluginFixtures: { [scope]: [probe.definition] } });
    const project = scope === "project" ? await f.project("Background project") : undefined;
    const path = `${project ? `/projects/${project.project_id}` : ""}/api/plugins/${probe.id}/background`;
    try {
      const response = await f.request(path, { method: "POST", body: { id: "first" } });
      assert.equal(response.status, 200, await response.clone().text()); assert.deepEqual(await response.json(), { id: "first", state: "running" });
      await entered.promise;
      await assert.rejects(probe.callers[0]!.beforeEffect());
      await assert.rejects(probe.requests[0]!.execution!.beforeEffect());
      assert.equal(probe.controls[0]!.signal!.aborted, false); assert.equal(probe.controls[0]!.project_id, project?.project_id);
      release.resolve(); assert.equal(await probe.handles[0]!.result, "after HTTP response");
      assert.equal(probe.stored("result.first"), "after HTTP response");
      await assert.rejects(probe.controls[0]!.beforeEffect());
      await assert.rejects(probe.contexts.at(-1)!.services!.background!.start(async () => "outside"), { code: "plugin.background_action_required" });
    } finally { release.resolve(); }
  });
}

test("S-18 RAC-50 only a declared concurrent command in this installation may accept work", async t => {
  const probe = backgroundProbe(), other = backgroundProbe("backgroundother");
  const { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition, other.definition] } });
  await grantHomeProbe(host, probe); await grantHomeProbe(host, other);
  for (const definition of [probe.serial, probe.undeclared, probe.query]) {
    await assert.rejects(host.homeActionClient().invoke(person(probe.permissions), definition, { id: "denied" }), { code: "plugin.background_undeclared" });
  }
  probe.behavior.beforeStart = async () => { await other.contexts.at(-1)!.services!.background!.start(async () => "foreign"); };
  await assert.rejects(host.homeActionClient().invoke(person(probe.permissions), probe.start, { id: "foreign" }), { code: "plugin.background_action_required" });
  assert.equal(probe.handles.length, 0); assert.equal(other.handles.length, 0);
});

for (const mode of ["caller-cancel", "caller-revoke", "handle-cancel", "request-cancel", "stop", "revoke", "restart", "close"] as const) {
  test(`S-18 RAC-52 RAC-54 ${mode} stops waiting before a non-cooperative provider returns and refuses both late result and failure`, { timeout: 30_000 }, async t => {
    const probe = backgroundProbe(), entered = deferred(), release = deferred(), finished = deferred(), controller = new AbortController();
    let permitted = true;
    probe.behavior.work = async () => { entered.resolve(); try { await release.promise; return "late"; } finally { finished.resolve(); } };
    if (mode === "request-cancel") probe.behavior.signal = controller.signal;
    const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
    const { platform, install } = await grantHomeProbe(host, probe);
    await host.homeActionClient().invoke({ ...person(probe.permissions), ...(mode === "caller-cancel" ? { signal: controller.signal } : {}),
      assert_authority_current: () => { if (!permitted) throw new ActionError("actions.forbidden", "caller revoked"); } }, probe.start, { id: mode });
    await entered.promise;
    const rejected = assert.rejects(probe.handles[0]!.result);
    try {
      if (mode === "caller-cancel" || mode === "request-cancel") controller.abort();
      else if (mode === "caller-revoke") permitted = false;
      else if (mode === "handle-cancel") probe.handles[0]!.cancel();
      else if (mode === "close") await host.close();
      else if (mode === "revoke") platform.supervisor.revoke(probe.id);
      else { await platform.runtime.stop(install.install_id); if (mode === "restart") await platform.supervisor.restart(probe.id); }
      await rejected;
      assert.equal(probe.controls[0]!.signal!.aborted, true, "waiting ended while provider is still held");
      release.resolve(); await finished.promise;
      await assert.rejects(probe.controls[0]!.beforeEffect());
      if (mode === "stop") await platform.supervisor.restart(probe.id);
      if (mode === "revoke") await platform.supervisor.enable(probe.id);
      if (mode !== "close") { assert.equal(probe.stored(`result.${mode}`), null); assert.equal(probe.stored(`failure.${mode}`), null); }
      await host.close();
      const reopened = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [probe.definition] } });
      try {
        await reopened.homePlugins!.ready();
        assert.equal(probe.stored(`result.${mode}`), null); assert.equal(probe.stored(`failure.${mode}`), null);
        assert.equal(probe.handles.length, 1, "restart does not replay accepted work");
      } finally { await reopened.close(); }
    } finally { release.resolve(); }
  });
}

for (const revoke of [false, true]) {
  test(`S-18 RAC-51 RAC-52 actual MCP gateway ${revoke ? "grant revocation stops" : "normal response preserves"} accepted work`, { timeout: 30_000 }, async t => {
    const probe = backgroundProbe(), entered = deferred(), release = deferred();
    probe.behavior.work = async () => { entered.resolve(); await release.promise; return "MCP result"; };
    const f = await openTestHome(t, { host: { pluginFixtures: { home: [probe.definition] } } });
    await grantHomeProbe(f.host, probe);
    const actor = "runtime:background-client";
    await f.grant(actor, null, [probe.start]);
    const { client, caller } = await f.mcp(actor, null);
    try {
      assert.deepEqual(await client.invoke(caller, probe.start, { id: "mcp" }), { id: "mcp", state: "running" });
      await entered.promise;
      assert.equal(probe.callers[0]!.actor_id, actor);
      if (revoke) {
        const rejected = assert.rejects(probe.handles[0]!.result, { code: "mcp.action_revoked" });
        await f.revoke(actor, null, [probe.start]); await rejected;
        assert.equal(probe.controls[0]!.signal!.aborted, true);
      }
      release.resolve();
      if (revoke) { await assert.rejects(probe.controls[0]!.beforeEffect()); assert.equal(probe.stored("result.mcp"), null); assert.equal(probe.stored("failure.mcp"), null); }
      else { assert.equal(await probe.handles[0]!.result, "MCP result"); assert.equal(probe.stored("result.mcp"), "MCP result"); }
    } finally { release.resolve(); }
  });
}

test("S-18 RAC-53 background model work retains its caller and ends progress/control when its own result settles", async t => {
  const probe = backgroundProbe(), entered = deferred(), release = deferred();
  let dispatch!: HostTextRequestOptions, seenActor = "", nested: unknown, backgroundOriginal: unknown = "not entered";
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] }, completeText: async (_prompt, options = {}) => {
    dispatch = options; await options.beforeDispatch?.(); entered.resolve(); await release.promise; return "model result";
  } });
  probe.behavior.work = async context => {
    seenActor = currentPluginAction()!.caller.actor_id;
    backgroundOriginal = currentPluginAction()!.caller.original_input;
    try { await context.services!.background!.start(async () => "nested"); } catch (error) { nested = error; }
    return (await context.services!.model!.complete(instructed(probe.instruction, "body"), { onText: () => {} })).text;
  };
  const { install } = await grantHomeProbe(f.host, probe);
  const original: HostOfferedOriginalInput = { input_id: "one-operation", text: "Only this operation's words", written_by: "person",
    occurred_at: "2026-10-24T00:00:00.000Z", install_id: install.install_id,
    action: { capability_id: probe.start.capability_id, version: probe.start.version, provider_id: install.install_id } };
  const caller = { ...person(probe.permissions), actor_id: "original-user", original_input: original };
  try {
    await f.host.homeActionClient().invoke(caller, probe.start, { id: "model" }); await entered.promise;
    assert.deepEqual(probe.callers[0]!.original_input, original, "the original action receives the Host's proof for this operation");
    assert.equal(backgroundOriginal, undefined, "accepted background work keeps its caller identity, never the original operation's personal-input proof");
    assert.equal(seenActor, "original-user"); assert.ok(nested instanceof Error && "code" in nested && nested.code === "plugin.background_action_required");
    await dispatch.beforeDispatch?.(); release.resolve(); assert.equal(await probe.handles[0]!.result, "model result");
    assert.equal(probe.stored("result.model"), "model result");
    assert.throws(() => dispatch.onProgress?.({ type: "text-delta", text: "late" }));
    await assert.rejects(probe.controls[0]!.beforeEffect());
  } finally { release.resolve(); await probe.handles[0]?.result; }
});

test("S-18 RAC-50 a timer inherited from an expired action cannot accept a second background execution", async t => {
  const probe = backgroundProbe(), release = deferred(), expired = deferred();
  let late: Promise<unknown> | undefined;
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  probe.behavior.beforeStart = async () => {
    late = (async () => { await release.promise; try { await probe.contexts.at(-1)!.services!.background!.start(async () => "late"); } finally { expired.resolve(); } })();
    void late.catch(() => undefined);
  };
  try {
    await f.host.homeActionClient().invoke(person(probe.permissions), probe.start, { id: "original" });
    await probe.handles[0]!.result;
    const rejected = assert.rejects(late!, { code: "actions.expired" }); release.resolve(); await rejected; await expired.promise;
    assert.equal(probe.handles.length, 1);
  } finally { release.resolve(); }
});

for (const hidden of [false, true]) {
  test(`S-18 S-31 RAC-51 RAC-52 a Home background route keeps its trusted project and ${hidden ? "refuses writes after hiding" : "continues after the response"}`, { timeout: 30_000 }, async t => {
    const probe = backgroundProbe(), entered = deferred(), release = deferred();
    const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.project_plugin_id === "issues")!;
    // Give an actual catalog entry a background probe; the real Home supervisor, project-path admission and controls stay in place.
    probe.definition.manifest = { ...probe.definition.manifest, plugin_id: entry.manifest.plugin_id,
      permissions: [...probe.definition.manifest.permissions, ...entry.manifest.permissions.filter(item => !probe.permissions.includes(item.permission))] };
    delete probe.definition.instructions;
    assert.ok(entry.runtime);
    t.mock.method(entry.runtime, "create", () => probe.definition);
    probe.behavior.work = async () => { entered.resolve(); await release.promise; return "in original project"; };
    const f = await serveHomeRuntime(t), project = await f.project("Background in this project");
    try {
      const response = await f.request(`/projects/${project.project_id}/api/plugins/${entry.manifest.plugin_id}/background`, { method: "POST", body: { id: "project" } });
      assert.equal(response.status, 200, await response.clone().text()); await entered.promise;
      assert.equal(probe.controls[0]!.project_id, project.project_id); await assert.rejects(probe.requests[0]!.execution!.beforeEffect());
      if (hidden) {
        const hide = await f.request(`/api/settings/projects/${project.project_id}/plugins`, { method: "DELETE", body: { plugin_id: "issues" } });
        assert.equal(hide.status, 200); await assert.rejects(probe.controls[0]!.beforeEffect(), { code: "actions.plugin_disabled" });
        const rejected = assert.rejects(probe.handles[0]!.result, { code: "actions.plugin_disabled" }); release.resolve(); await rejected;
        assert.equal(probe.stored("result.project"), null); assert.equal(probe.stored("failure.project"), null);
      } else {
        release.resolve(); assert.equal(await probe.handles[0]!.result, "in original project");
        assert.equal(probe.stored("result.project"), "in original project");
      }
    } finally { release.resolve(); }
  });
}

for (const revoked of [false, true]) {
  test(`S-18 RAC-51 RAC-52 direct MCP closes after acceptance; ${revoked ? "revoked authority still cancels" : "the shared Host completes"}`, { timeout: 30_000 }, async t => {
    const probe = backgroundProbe(), entered = deferred(), release = deferred();
    probe.behavior.work = async () => { entered.resolve(); await release.promise; return "after MCP close"; };
    const f = await openTestHome(t, { host: { pluginFixtures: { home: [probe.definition] } } });
    await grantHomeProbe(f.host, probe); await f.grant("runtime:background-direct", null, [probe.start]);
    const server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, { homeDirectory: f.home,
      runtimeContext: { runtime_id: "background-direct", stable_work_context_id: null, host_declares_stable: false } }, f.host);
    try {
      const response = await server.callTool(molisWorkActionToolName(probe.start), { id: "direct" });
      assert.equal(typeof response, "string"); assert.deepEqual(JSON.parse(response as string), { id: "direct", state: "running" }); await entered.promise;
      await server.close(); assert.equal(f.host.lifecycle(), "running"); assert.equal(probe.controls[0]!.signal!.aborted, false);
      if (revoked) {
        const rejected = assert.rejects(probe.handles[0]!.result, { code: "mcp.action_revoked" });
        await f.revoke("runtime:background-direct", null, [probe.start]); await rejected;
        release.resolve(); await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(probe.stored("result.direct"), null); assert.equal(probe.stored("failure.direct"), null);
      } else { release.resolve(); assert.equal(await probe.handles[0]!.result, "after MCP close"); assert.equal(probe.stored("result.direct"), "after MCP close"); }
    } finally { release.resolve(); await server.close(); }
  });
}

for (const cancelled of [false, true]) {
  test(`S-18 RAC-51 RAC-52 accepted file work ${cancelled ? "cannot persist after explicit cancellation" : "persists with its bounded control after HTTP ends"}`, async t => {
    const name = "backgroundfiles", probe = backgroundProbe(name), entered = deferred(), release = deferred(), finished = deferred();
    probe.definition.manifest = { ...probe.definition.manifest, owner_files: { store_name: name, entries: [{ name: "assets", kind: "directory" }],
      read_permission: `${name}:read`, write_permission: `${name}:write` } };
    const fixture = { definition: probe.definition };
    const f = await serveHomeRuntime(t, { pluginFixtures: { home: [fixture] } });
    probe.behavior.work = async (context, control) => {
      entered.resolve(); await release.promise;
      try { await context.services!.ownerFiles!.write(writer => writer.writeFile("assets/result.bin", Buffer.from("durable bytes"), "create")); return "durable result"; }
      finally { finished.resolve(); }
    };
    try {
      const response = await f.request(`/api/plugins/${probe.id}/background`, { method: "POST", body: { id: "file" } });
      assert.equal(response.status, 200); await response.json(); await entered.promise;
      if (cancelled) {
        const rejected = assert.rejects(probe.handles[0]!.result);
        probe.handles[0]!.cancel(); await rejected;
      }
      release.resolve(); await finished.promise;
      if (!cancelled) assert.equal(await probe.handles[0]!.result, "durable result");
      await f.host.close();
      const reopened = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null, pluginFixtures: { home: [fixture] } });
      try {
        await reopened.homePlugins!.ready();
        const stored = probe.contexts.at(-1)!.services!.ownerFiles!.read("assets/result.bin");
        assert.equal(stored === null ? null : Buffer.from(stored).toString("utf8"), cancelled ? null : "durable bytes");
        assert.equal(probe.stored("result.file"), cancelled ? null : "durable result");
        assert.equal(probe.stored("failure.file"), null);
      } finally { await reopened.close(); }
    } finally { release.resolve(); }
  });
}

test("SYS-22 S-18 PG-038 deleting a project stops the background work a Home plugin accepted there, though it keeps no data of the project", async t => {
  const probe = backgroundProbe("backgroundprojects", "project"), entered = deferred(), release = deferred();
  probe.definition.stop = async context => { await probe.lifecycle.stop(context); };
  let running = 0;
  probe.behavior.work = async () => { if (++running === 2) entered.resolve(); await release.promise; return "after"; };
  const home = mkdtempSync(join(tmpdir(), "background-project-deletion-")), actions = new ActionService();
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [probe.definition] });
  t.after(async () => { try { release.resolve(); await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  const platform = await host.ready(), install = host.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, probe.permissions);
  await platform.supervisor.restart(probe.id);
  for (const project of ["p1", "p2"]) await actions.invoke(person(probe.permissions, project), probe.start, { id: project });
  await entered.promise;
  const hooks = projectDeletedHooksFor(home), owner = `plugin-background:${probe.id}`;
  assert.deepEqual(hooks.owners().filter(item => item.id === owner).map(item => ({ id: item.id, label: item.label })), [{ id: owner, label: "{name} 的后台工作（将停止）" }],
    "the confirmation lists the work that stops even without project data");
  const accepted = (projectId: string) => probe.controls.find(control => control.project_id === projectId)!;
  const stopped = assert.rejects(probe.handles[0]!.result, { code: "actions.cancelled" });
  assert.equal(await hooks.clear(owner, "p1"), true);
  assert.equal(accepted("p1").signal!.aborted, true); assert.equal(accepted("p2").signal!.aborted, false, "another project's work runs on");
  await stopped;
  release.resolve();
  assert.equal(await probe.handles[1]!.result, "after");
  assert.equal(probe.stored("result.p1"), null, "the stopped work wrote neither its result"); assert.equal(probe.stored("failure.p1"), null, "nor its failure");
  assert.equal(probe.stored("result.p2"), "after");
});

test("S-18 PG-038 deleting a project also stops a background execution still being accepted there: its work never begins", async t => {
  const probe = backgroundProbe("backgroundaccepting", "project"), release = deferred();
  probe.definition.stop = async context => { await probe.lifecycle.stop(context); };
  // Each project's call is held in its acceptance: the handler marks it right before `background.start`, whose first wait is the
  // caller's own authority check, and that check waits here.
  const held = new Set<string>(), waiting = new Map([["p1", deferred()], ["p2", deferred()]]);
  probe.behavior.beforeStart = async caller => { held.add(caller.project_id!); };
  probe.behavior.work = async () => "after";
  const caller = (projectId: string) => ({ ...person(probe.permissions, projectId), validate_authority: async () => {
    if (!held.delete(projectId)) return;
    waiting.get(projectId)!.resolve(); await release.promise;
  } });
  const home = mkdtempSync(join(tmpdir(), "background-project-accepting-")), actions = new ActionService();
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [probe.definition] });
  t.after(async () => { try { release.resolve(); await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  const platform = await host.ready(), install = host.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, probe.permissions);
  await platform.supervisor.restart(probe.id);
  const deleted = actions.invoke(caller("p1"), probe.start, { id: "p1" }), kept = actions.invoke(caller("p2"), probe.start, { id: "p2" });
  const refused = assert.rejects(deleted, { code: "actions.cancelled" });
  await waiting.get("p1")!.promise; await waiting.get("p2")!.promise;
  assert.equal(probe.handles.length, 0, "both are still being accepted");
  assert.equal(await projectDeletedHooksFor(home).clear(`plugin-background:${probe.id}`, "p1"), true);
  release.resolve();
  await refused;
  assert.deepEqual(await kept, { id: "p2", state: "running" }, "another project's acceptance goes on");
  assert.equal(await probe.handles[0]!.result, "after");
  assert.deepEqual(probe.controls.map(control => control.project_id), ["p2"], "the work accepted in the deleted project never began");
  assert.equal(probe.stored("result.p1"), null); assert.equal(probe.stored("failure.p1"), null);
  assert.equal(probe.stored("result.p2"), "after");
});


// SYS-22: the real deletion preview translates the stopping notice and names the declaring plugin.
test("SYS-22 deletion preview lists background-only plugins in both languages", async t => {
  const probe = backgroundProbe("previewbackground", "project");
  probe.definition.stop = async context => { await probe.lifecycle.stop(context); };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const project = await f.project("Background preview");
  for (const [language, expected] of [["zh", `${probe.definition.manifest.name} 的后台工作（将停止）`], ["en", `Background work for ${probe.definition.manifest.name} (will stop)`]]) {
    const response = await f.request(`/api/settings/projects/${project.project_id}/delete-scope`, { headers: { "accept-language": language! } });
    assert.equal(response.status, 200);
    const body = await response.json() as { owners: Array<{ owner_id: string; label: string }> };
    assert.equal(body.owners.find(owner => owner.owner_id === `plugin-background:${probe.id}`)?.label, expected);
  }
});
