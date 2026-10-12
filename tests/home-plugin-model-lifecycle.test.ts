import assert from "node:assert/strict";
import test from "node:test";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { HostCompleteText, HostTextRequestOptions } from "@molis-ai/molis-work-app-local-host";
import { deferred, grantHomeProbe, homeProbe, person, serveHomeRuntime } from "./fixtures/home-runtime.js";

test("W3-06-F-03 Home model actions use the shared instruction registry and local model binding, and refuse serial or finished calls", { timeout: 60_000 }, async t => {
  const probe = homeProbe(), calls: Array<{ prompt: string; options: HostTextRequestOptions }> = [];
  const completeText: HostCompleteText = async (prompt, options = {}) => { calls.push({ prompt, options }); await options.beforeDispatch?.(); return "Home answer"; };
  const { host, request } = await serveHomeRuntime(t, { completeText, pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(host, probe);
  const caller = person(probe.permissions), key = `${probe.id}/${probe.instruction.prompt_id}`;
  const saved = await request("/api/agent-definitions/prompt", { method: "POST", body: { key, body: "本人修改后的指令。", expected_revision: null } });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal(await host.homeActionClient().invoke(caller, probe.ask, {}), "Home answer");
  assert.equal(calls[0]!.prompt, "本人修改后的指令。\n\n  原始材料\n");
  assert.ok(calls[0]!.options.signal instanceof AbortSignal);
  assert.equal(typeof calls[0]!.options.beforeDispatch, "function");
  assert.equal(Object.hasOwn(calls[0]!.options, "call_id"), false, "the model binding receives no Host diagnostic number");
  await assert.rejects(host.homeActionClient().invoke(caller, probe.serial, {}), { code: "plugin.model_action_not_concurrent" });
  await assert.rejects(probe.contexts.at(-1)!.services!.model!.complete(instructed(probe.instruction, "outside action")), { code: "plugin.model_action_required" });
  const finished = deferred();
  let later: Promise<unknown> | undefined;
  probe.behavior.ask = async context => { later = finished.promise.then(() => context.services!.model!.complete(instructed(probe.instruction, "after return"))); return "returned"; };
  assert.equal(await host.homeActionClient().invoke(caller, probe.ask, {}), "returned");
  finished.resolve();
  await assert.rejects(later!, { code: "actions.expired" });
  assert.equal(calls.length, 1, "all refusal paths leave the model untouched");
});

test("W3-06-F-03 an explicitly unconfigured Home model is refused through the real Home action", async t => {
  const probe = homeProbe(), { host } = await serveHomeRuntime(t, { completeText: null, pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(host, probe);
  await assert.rejects(host.homeActionClient().invoke(person(probe.permissions), probe.ask, {}), { code: "actions.connection_required" });
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("draft"), null);
});

for (const invalidation of ["cancel", "disable", "revoke"] as const) {
  test(`W3-06-F-03 Home ${invalidation} during a model wait prevents result delivery and business writes`, { timeout: 60_000 }, async t => {
    const entered = deferred(), release = deferred(), over = deferred(), probe = homeProbe();
    let handed = false, rejected: unknown;
    const completeText: HostCompleteText = async () => { entered.resolve(); await release.promise; return "late result"; };
    const { host, request } = await serveHomeRuntime(t, { completeText, pluginFixtures: { home: [probe.definition] } });
    const { platform, install } = await grantHomeProbe(host, probe), abort = new AbortController();
    probe.behavior.ask = async context => {
      try {
        const result = await context.services!.model!.complete(instructed(probe.instruction, "original input"));
        handed = true; context.services!.storage!.set("late", result.text); return result.text;
      } catch (error) { rejected = error; throw error; }
      finally { over.resolve(); }
    };
    const pending = host.homeActionClient().invoke({ ...person(probe.permissions), signal: abort.signal }, probe.ask, {});
    const refused = assert.rejects(pending);
    try {
      await Promise.race([entered.promise, pending]);
      if (invalidation === "cancel") abort.abort();
      else if (invalidation === "disable") assert.equal((await request(`/api/plugins/${probe.id}/disable`, { method: "POST", body: {} })).status, 200);
      else { await platform.runtime.stop(install.install_id); platform.runtime.grant(install.install_id, ["storage:private"]); }
    } finally { release.resolve(); }
    await over.promise; await refused;
    assert.equal(handed, false); assert.ok(rejected instanceof Error);
    if (invalidation === "disable") await platform.supervisor.enable(probe.id);
    if (invalidation === "revoke") await platform.supervisor.restart(probe.id);
    assert.equal(probe.contexts.at(-1)!.services!.storage!.get("late"), null, "the late model result produced no business row");
  });
}

test("W3-06-F-06 stopping revokes old storage/model/actions before its hook awaits; reinstall changes generation and does not inherit grants", { timeout: 60_000 }, async t => {
  const probe = homeProbe(), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const { platform, install } = await grantHomeProbe(host, probe);
  const old = probe.contexts.at(-1)!, entered = deferred(), release = deferred();
  old.services!.storage!.set("draft", "keep on reinstall");
  probe.behavior.stop = async () => { entered.resolve(); await release.promise; };
  const stopping = platform.runtime.stop(install.install_id);
  try {
    await entered.promise;
    assert.throws(() => old.services!.storage!.set("draft", "stop hook write"), { code: "actions.forbidden" });
    await assert.rejects(old.services!.model!.complete(instructed(probe.instruction, "old model")), { code: "actions.forbidden" });
    await assert.rejects(old.services!.actions!.invoke(probe.save, { text: "old action" }), { code: "actions.forbidden" });
    assert.ok(probe.stopped.some(error => error instanceof Error && "code" in error && error.code === "actions.forbidden"));
  } finally { release.resolve(); }
  await stopping;
  await platform.runtime.uninstall(install.install_id, { retain_private_data: true });
  const replacement = platform.runtime.install({ definition: probe.definition, deployment: "local", grants: ["storage:private"] }).install;
  assert.equal(replacement.install_id, install.install_id);
  assert.notEqual(replacement.installation_generation, install.installation_generation);
  assert.deepEqual(replacement.grants, ["storage:private"]);
  await platform.runtime.start(replacement.install_id);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("draft"), "keep on reinstall");
  assert.throws(() => old.services!.storage!.set("draft", "resurrected"), { code: "actions.forbidden" });
  await assert.rejects(old.services!.actions!.invoke(probe.save, { text: "resurrected" }), { code: "actions.forbidden" });
  const fresh = person(probe.permissions);
  await assert.rejects(host.homeActionClient().invoke(fresh, probe.save, { text: "missing new install grant" }), { code: "actions.plugin_permission" });
});

test("W3-06-F-07 a disconnected real Home HTTP request cancels the model and cannot commit its late answer", { timeout: 60_000 }, async t => {
  const entered = deferred(), cancelled = deferred(), release = deferred(), over = deferred(), probe = homeProbe();
  let handed = false;
  const completeText: HostCompleteText = async (_prompt, options = {}) => {
    assert.ok(options.signal);
    if (options.signal.aborted) cancelled.resolve(); else options.signal.addEventListener("abort", cancelled.resolve, { once: true });
    entered.resolve(); await release.promise; return "late HTTP answer";
  };
  const { host, request } = await serveHomeRuntime(t, { completeText, pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(host, probe);
  probe.behavior.ask = async context => {
    try {
      const result = await context.services!.model!.complete(instructed(probe.instruction, "original HTTP input"));
      handed = true; context.services!.storage!.set("late-http", result.text); return result.text;
    } finally { over.resolve(); }
  };
  const abort = new AbortController(), pending = request(`/api/plugins/${probe.id}/ask`, { method: "POST", body: {}, signal: abort.signal });
  const refused = assert.rejects(pending);
  try { await Promise.race([entered.promise, pending]); abort.abort(); await cancelled.promise; }
  finally { release.resolve(); }
  await refused; await over.promise;
  assert.equal(handed, false);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("late-http"), null);
});

test("W3-06-F-06 Home close revokes every installation before awaiting the first plugin's cleanup", { timeout: 60_000 }, async t => {
  const first = homeProbe("first-close"), next = homeProbe("next-close"), entered = deferred(), release = deferred();
  const { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [first.definition, next.definition] } });
  await host.homePlugins!.ready();
  const held = next.contexts.at(-1)!.services!;
  first.behavior.stop = async () => { entered.resolve(); await release.promise; };
  const closing = host.homePlugins!.close();
  try {
    await entered.promise;
    assert.throws(() => held.storage!.set("late", "other installation"), { code: "actions.forbidden" });
    await assert.rejects(held.actions!.invoke(next.state, {}), { code: "actions.forbidden" });
    await assert.rejects(held.model!.complete(instructed(next.instruction, "other installation")), { code: "actions.forbidden" });
  } finally { release.resolve(); }
  await closing;
  await assert.rejects(host.homePlugins!.retry(), { code: "actions.plugin_unavailable" });
});
