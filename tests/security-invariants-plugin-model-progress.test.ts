import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { HostCompleteText, HostTextRequestOptions } from "@molis-ai/molis-work-app-local-host";
import { deferred, grantHomeProbe, homeProbe, person, serveHomeRuntime } from "./fixtures/home-runtime.js";

for (const outcome of ["answer", "failure"] as const) {
  test(`RAC-20 RAC-23 model text stays ordered and closes on ${outcome} before the action ends`, { timeout: 60_000 }, async t => {
    const probe = homeProbe(), settled = deferred(), release = deferred(), chunks: string[] = [];
    let progress: HostTextRequestOptions["onProgress"], result: string | undefined, refusal: unknown;
    const failure = new Error("provider failed after text");
    const completeText: HostCompleteText = async (_prompt, options = {}) => {
      await options.beforeDispatch?.(); progress = options.onProgress;
      assert.ok(progress, "the Host forwards the Runtime callback to its model path");
      progress({ type: "model-reported", model: "reported-name" });
      progress({ type: "text-delta", text: "第一句，" });
      progress({ type: "text-delta", text: "第二句。" });
      assert.deepEqual(chunks, ["第一句，", "第二句。"], "text reaches the plugin before the model returns");
      if (outcome === "failure") throw failure;
      return "第一句，第二句。";
    };
    const { host } = await serveHomeRuntime(t, { completeText, pluginFixtures: { home: [probe.definition] } });
    await grantHomeProbe(host, probe);
    probe.behavior.ask = async context => {
      try { result = (await context.services!.model!.complete(instructed(probe.instruction, "材料"), { onText: delta => chunks.push(delta) })).text; }
      catch (error) { refusal = error; }
      settled.resolve(); await release.promise; return "action finished";
    };
    const pending = host.homeActionClient().invoke(person(probe.permissions), probe.ask, {});
    try {
      await Promise.race([settled.promise, pending]);
      assert.throws(() => progress!({ type: "text-delta", text: "late" }), { code: "actions.expired" });
      assert.deepEqual(chunks, ["第一句，", "第二句。"]);
      assert.equal(result, outcome === "answer" ? "第一句，第二句。" : undefined);
      assert.equal(refusal, outcome === "failure" ? failure : undefined);
    } finally { release.resolve(); }
    assert.equal(await pending, "action finished");
  });
}

for (const invalidation of ["action-cancel", "request-cancel", "disable", "install-revoke", "caller-revoke"] as const) {
  test(`RAC-23 ${invalidation} refuses new model text, the late answer, and business writes`, { timeout: 60_000 }, async t => {
    const probe = homeProbe(), entered = deferred(), release = deferred(), over = deferred(), chunks: string[] = [];
    const actionAbort = new AbortController(), requestAbort = new AbortController();
    let progress: HostTextRequestOptions["onProgress"], handed = false, allowed = true;
    const completeText: HostCompleteText = async (_prompt, options = {}) => {
      progress = options.onProgress; assert.ok(progress);
      progress({ type: "text-delta", text: "before" }); entered.resolve();
      await release.promise; return "late answer";
    };
    const { host, request } = await serveHomeRuntime(t, { completeText, pluginFixtures: { home: [probe.definition] } });
    const { platform, install } = await grantHomeProbe(host, probe);
    probe.behavior.ask = async context => {
      try {
        const result = await context.services!.model!.complete(instructed(probe.instruction, "材料"), {
          signal: requestAbort.signal, onText: delta => chunks.push(delta),
        });
        handed = true; context.services!.storage!.set("late", result.text); return result.text;
      } finally { over.resolve(); }
    };
    const pending = host.homeActionClient().invoke({ ...person(probe.permissions), signal: actionAbort.signal,
      assert_authority_current: () => { if (!allowed) throw new ActionError("actions.forbidden", "caller permission withdrawn"); },
    }, probe.ask, {});
    const refused = assert.rejects(pending);
    try {
      await Promise.race([entered.promise, pending]);
      assert.deepEqual(chunks, ["before"]);
      if (invalidation === "action-cancel") actionAbort.abort();
      else if (invalidation === "request-cancel") requestAbort.abort();
      else if (invalidation === "caller-revoke") allowed = false;
      else if (invalidation === "disable") assert.equal((await request(`/api/plugins/${probe.id}/disable`, { method: "POST", body: {} })).status, 200);
      else { await platform.runtime.stop(install.install_id); platform.runtime.grant(install.install_id, ["storage:private"]); }
      assert.throws(() => progress!({ type: "text-delta", text: "after" }));
      assert.deepEqual(chunks, ["before"], "no text is delivered after authority ends, even if the model ignores cancellation");
    } finally { release.resolve(); }
    await over.promise; await refused;
    assert.equal(handed, false);
    if (invalidation === "disable") await platform.supervisor.enable(probe.id);
    if (invalidation === "install-revoke") await platform.supervisor.restart(probe.id);
    assert.equal(probe.contexts.at(-1)!.services!.storage!.get("late"), null);
  });
}

test("RAC-23 an action that returns before its model refuses subsequent text and the answer", { timeout: 60_000 }, async t => {
  const probe = homeProbe(), entered = deferred(), release = deferred(), chunks: string[] = [];
  let progress: HostTextRequestOptions["onProgress"], refused: Promise<void> | undefined;
  const completeText: HostCompleteText = async (_prompt, options = {}) => {
    progress = options.onProgress; assert.ok(progress);
    progress({ type: "text-delta", text: "before" }); entered.resolve();
    await release.promise; return "late";
  };
  const { host } = await serveHomeRuntime(t, { completeText, pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(host, probe);
  probe.behavior.ask = async context => {
    const pending = context.services!.model!.complete(instructed(probe.instruction, "材料"), { onText: delta => chunks.push(delta) });
    refused = assert.rejects(pending, { code: "actions.expired" });
    await entered.promise; return "action returned";
  };
  try {
    assert.equal(await host.homeActionClient().invoke(person(probe.permissions), probe.ask, {}), "action returned");
    assert.throws(() => progress!({ type: "text-delta", text: "after" }), { code: "actions.expired" });
    assert.deepEqual(chunks, ["before"]);
  } finally { release.resolve(); }
  await refused;
});
