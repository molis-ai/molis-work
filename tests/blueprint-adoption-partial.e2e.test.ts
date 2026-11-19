import { mkdtemp, readFile, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import test from "node:test";
import { bindActionClient, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { blueprintActions as actions } from "@molis-ai/molis-work-contracts/services/blueprints";
import type { Blueprint, BlueprintPart } from "@molis-ai/molis-work-contracts/platform/blueprints";
import type { SettingsValues } from "@molis-ai/molis-work-contracts/platform/settings";
import type { SandboxJson } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { jellyManifest } from "@molis-ai/molis-work-plugin-jelly";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

const primary = ".arrival-bar .bar-end .mw-btn--primary";
const choosePersonal = 'input[name=scene-target][value=personal]';
const part = (part_id: string, key: string, value: SandboxJson, layer: "personal" | "project" = "personal"): BlueprintPart =>
  ({ part_id, layer, required: true, proposal: { kind: "setting", key, value } });

function blueprint(name: string, ...parts: BlueprintPart[]): Blueprint {
  const title = { literal: name };
  return {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [...parts, { part_id: "example", layer: "project", required: false,
      proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
    steps: [{ step_id: "review", title, part_ids: [...parts.map(item => item.part_id), "example"] }],
    example_task: { title, input: title, step_ids: ["review"], result: { part_id: "example", location: title } },
  };
}

test("ONB-21/SPC-02: review, repair, or skip one malformed suggestion while adopting a valid sibling", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  assert.ok(b.localHost);
  const who = await b.localHost.localPersonContext();
  const raw = b.localHost.homeActionClient();
  const { draft } = await bindActionClient(raw, () => ({ ...who, actor_kind: "runtime", audience: "agent" })).invoke(actions.draftSave, {
    expected_revision: null, blueprint: blueprint("B38 mixed proposal", part("bad", "shelf.drop_wheel", "off"),
      part("good", "assistant.lookback", { count: 4, unit: "days" })),
  });
  const open = async () => {
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/onboarding?scene&draft=" + draft.source.draft_id }, b.sessionId));
    await b.waitFor(`document.querySelector(${JSON.stringify(choosePersonal)})`);
    await b.click(choosePersonal); await b.click(primary);
    await b.waitFor("document.querySelector('[data-scene-main] dl') && !document.querySelector('[data-scene-main] input[type=checkbox]')");
  };
  const result = "location.search.includes('adoption=') && document.querySelector('[data-scene-aside] button')";
  const wheel = async () => (await b.web.post<SettingsValues>("/api/plugins/io.molis.work.shelf/preferences/read", { keys: ["shelf.drop_wheel"] })).values[0]!;
  const original = await wheel();
  await open();
  assert.match(await b.evaluate<string>("document.querySelector('[data-scene-main]').innerText"), /格式|wrong format/i);
  await b.click("[data-scene-aside] button:nth-of-type(2)");
  await b.waitFor("document.querySelector('[data-scene-main] input[type=checkbox]')?.checked");
  await b.click(primary); await b.waitFor(result);
  assert.deepEqual(await wheel(), original, "the bad suggestion is never sent to Shelf");
  const lookback = (await b.web.get<SettingsValues>("/api/assistant/preferences")).values.find(item => item.key === "assistant.lookback");
  assert.deepEqual(lookback?.state === "ok" && lookback.value, { count: 4, unit: "days" });
  await open();
  await b.click("[data-scene-main] details summary");
  await b.click("[name=scene-boolean][value=false]");
  await b.click("[data-scene-main] details button");
  await b.waitFor("document.querySelector('[data-scene-main] input[type=checkbox]')?.checked === false");
  await b.click("[data-scene-main] input[type=checkbox]");
  await b.click(primary); await b.waitFor(result);
  const corrected = await wheel();
  assert.ok(corrected.state === "ok" && corrected.value === false && corrected.revision !== original.revision);
});

for (const outcome of ["replacement", "resumed", "manually changed"] as const)
test("ONB-28/SPC-07/16: undo restores confirmed siblings after an uncertain write, plugin " + outcome, { timeout: 90_000 }, async t => {
  const env = await openTestHome(t);
  const one = await env.createProject("A"), two = await env.createProject("B");
  const base = "http://127.0.0.1:9/review";
  const { withCatalog } = env.host.ensureWebCatalog(env.home, openMolisWorkProjectCatalog);
  await runWithMolisWorkHome(env.home, () => withCatalog({ homeDirectory: env.home }, catalog => {
    const connection = withConnectorConnections(env.home, store => {
      const row = store.createToken({ serviceId: "model-api", displayName: "local review fixture", token: "offline-review-fixture" });
      store.assertTarget(row.connection_id, "model-api", base);
      return row;
    });
    catalog.models.upsert({ provider_id: "b38-jelly", display_name: "Review fixture", base_url: base, credential_ref: connection.credential_ref!,
      api_format: "openai-chat-completions", models: ["before", "after"].map(model_id => ({ model_id, enabled: true })) });
  }));
  const callerA = await env.host.localPersonContext(one.reference), callerB = await env.host.localPersonContext(two.reference);
  const a = bindActionClient(env.host.actionClient(one.reference), () => callerA);
  const b = bindActionClient(env.host.actionClient(two.reference), () => callerB);
  const selected = { provider_id: "b38-jelly", model_id: "after" };
  const stale = { provider_id: "b38-jelly", model_id: "before" };
  const key = jellyManifest.settings_entries!.model_configuration!.key;
  const { draft } = await a.invoke(actions.draftSave, { expected_revision: null,
    blueprint: blueprint("Replacement review", part("engine", "projects.runtime", "prologue", "project"), part("model", key, selected), part("stale", key, stale)) });
  const preview = await a.invoke(actions.preview, { source: draft.source, target: { kind: "current_project" }, part_ids: ["engine", "model"] });
  const oldPreview = await a.invoke(actions.preview, { source: draft.source, target: { kind: "current_project" }, part_ids: ["stale"] });
  assert.equal(preview.parts[1]?.decision, "update", JSON.stringify(preview.parts[1]));
  assert.equal(oldPreview.parts[0]?.decision, "update");
  const request = { preview_id: preview.preview_id, part_ids: ["engine", "model"], request_id: "project-fence" };
  await assert.rejects(b.invoke(actions.apply, request), { code: "actions.missing" });
  assert.equal(await b.invoke(projectSettingsCapabilities.runtime, []), null);
  const normal = env.host.actionClient.bind(env.host);
  let lost = false;
  const probe = t.mock.method(env.host, "actionClient", (...args: Parameters<typeof env.host.actionClient>) => {
    const client = normal(...args);
    return { ...client, async invoke(caller: ActionCallContext, ref: ActionReference, input: unknown) {
      const reply = await client.invoke(caller, ref, input);
      if (!lost && ref.capability_id === jellyManifest.settings_entries!.write.capability_id) {
        lost = true;
        throw new Error("Fault injection: owner finished; transport lost the reply");
      }
      return reply;
    } };
  });
  const initial = await a.invoke(actions.apply, request);
  probe.mock.restore();
  assert.ok(lost);
  assert.deepEqual(initial.steps.map(step => step.state), ["applied", "pending_verification"]);
  const unknown = initial.steps[1]!;
  assert.deepEqual(unknown, { part_id: "model", state: "pending_verification", request_id: initial.adoption_id + ":model" });
  const pendingRow = "(document.querySelector('[data-scene-main] details[open]')?.textContent ?? '')";
  const awaiting = `/待核对|Awaiting verification/i.test(${pendingRow})`;
  const unavailableHint = `/原设置提供方当前不可用|original settings provider is unavailable/i.test(${pendingRow})`;
  const executable = outcome === "manually changed" ? undefined : locateTestChrome();
  const profile = executable ? await mkdtemp(join(tmpdir(), "molis-work-scene-status-")) : undefined;
  let browser: ChromeHarness | undefined;
  if (profile && executable) {
    t.after(async () => {
      try { await browser?.close(); }
      finally { await rm(profile, { recursive: true, force: true }); }
    });
    browser = await ChromeHarness.start(profile, { executable });
  }
  const page = await browser?.page();
  const resultPath = `/projects/${one.project_id}/onboarding?scene&adoption=${initial.adoption_id}`;
  if (page && browser) {
    await page.command("Page.enable");
    await page.command("Network.setCookie", { name: "molis_work_locale", value: outcome === "replacement" ? "en" : "zh", url: env.origin });
    await Promise.all([browser.event("Page.domContentEventFired"), page.command("Page.navigate", { url: env.origin + resultPath })]);
    await page.wait(awaiting);
    assert.equal(await page.evaluate(unavailableHint), false);
  }
  const preference = join(env.home, "jelly", "preferences.json");
  const saved = JSON.parse(await readFile(preference, "utf8"));
  assert.deepEqual(saved.selection, selected);
  assert.equal(Object.keys(saved.receipts).length, 1);
  const platform = await env.host.homePlugins!.ready();
  const old = env.host.homePlugins!.installation(jellyManifest.plugin_id);
  assert.ok(old?.installation_generation);
  platform.supervisor.revoke(jellyManifest.plugin_id);
  await platform.runtime.stop(old.install_id);
  const stopped = await a.invoke(actions.preview, { source: draft.source, target: { kind: "current_project" }, part_ids: ["model"] });
  assert.ok(stopped.parts[0]?.decision === "skip" && stopped.parts[0].reason === "owner_disabled");
  const blocked = await a.invoke(actions.apply, { preview_id: oldPreview.preview_id, part_ids: ["stale"], request_id: "stale-preview" });
  assert.deepEqual(blocked.steps[0], { part_id: "stale", state: "skipped", reason: "owner_unavailable" });
  const resumed = await a.invoke(actions.apply, request);
  assert.deepEqual(resumed.steps.map(step => step.state), ["applied", "pending_verification"]);
  const unavailable = { ...unknown, current: "owner_unavailable" };
  assert.deepEqual(resumed.steps[1], unavailable);
  const undoRequest = { adoption_id: initial.adoption_id, request_id: "undo-with-missing-owner" };
  const undone = await a.invoke(actions.revert, undoRequest);
  assert.deepEqual(undone.undo.steps.map(step => step.state), ["restored", "pending_verification"]);
  assert.deepEqual(undone.undo.steps[1], unavailable, "the unknown apply retains its original request and reports the unavailable owner");
  const stoppedStatus = await a.invoke(actions.read, { adoption_id: initial.adoption_id });
  assert.deepEqual(stoppedStatus.apply_steps[1], unavailable);
  assert.deepEqual(stoppedStatus.latest_undo?.steps[1], unavailable);
  await page?.wait(`${awaiting} && ${unavailableHint}`);
  assert.equal(await a.invoke(projectSettingsCapabilities.runtime, []), null);
  assert.deepEqual(JSON.parse(await readFile(preference, "utf8")), saved);
  if (outcome !== "replacement") {
    const enabled = await platform.supervisor.enable(jellyManifest.plugin_id);
    assert.equal(enabled.status, "running");
    assert.equal(env.host.homePlugins!.installation(jellyManifest.plugin_id)?.installation_generation, old.installation_generation);
    const reenabledStatus = await a.invoke(actions.read, { adoption_id: initial.adoption_id });
    assert.deepEqual(reenabledStatus.apply_steps[1], unknown);
    assert.deepEqual(reenabledStatus.latest_undo?.steps[1], unknown);
    if (page && browser) {
      await Promise.all([browser.event("Page.domContentEventFired"), page.command("Page.reload")]);
      await page.wait(`${awaiting} && !(${unavailableHint})`);
    }
    const prefs = "/api/plugins/io.molis.work.jelly/preferences/";
    if (outcome === "manually changed") {
      const value = (await env.web.post<SettingsValues>(prefs + "read", { keys: [key] })).values[0]!;
      await env.web.post(prefs + "write", { key, layer: "personal", expected_revision: value.revision,
        request_id: "choose-another-model", change: { set: stale } });
    }
    const continued = await a.invoke(actions.revert, undoRequest);
    if (outcome === "manually changed") assert.deepEqual(continued.undo.steps[1], { part_id: "model", state: "skipped", reason: "revision_changed" });
    else assert.equal(continued.undo.steps[1]?.state, "restored");
    const after = JSON.parse(await readFile(preference, "utf8"));
    assert.deepEqual(after.selection, outcome === "manually changed" ? stale : null);
    assert.equal(Object.keys(after.receipts).length, 2);
    const repeated = await a.invoke(actions.remove, { ...undoRequest, request_id: "remove-finished" });
    assert.deepEqual(repeated.undo.steps, continued.undo.steps);
    assert.deepEqual(JSON.parse(await readFile(preference, "utf8")), after);
    return;
  }
  await platform.runtime.uninstall(old.install_id, { retain_private_data: true });
  await env.close();
  await env.host.close();

  const successor = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null });
  try {
    successor.configurePersonalPlanning(env.home, successor.ensureWebCatalog(env.home, openMolisWorkProjectCatalog).withCatalog);
    const served = await serveTestHost(null, { home: env.home, host: successor });
    try {
      const ready = await successor.homePlugins!.ready();
      const enabled = await ready.supervisor.enable(jellyManifest.plugin_id);
      assert.equal(enabled.status, "running", JSON.stringify(enabled));
      const replacement = successor.homePlugins!.installation(jellyManifest.plugin_id);
      assert.ok(replacement?.installation_generation);
      assert.equal(replacement.state, "running");
      assert.notEqual(replacement.installation_generation, old.installation_generation);
      const current = await successor.localPersonContext(one.reference);
      const restarted = bindActionClient(successor.actionClient(one.reference), () => current);
      const result = await restarted.invoke(actions.remove, { ...undoRequest, request_id: "remove-after-restart" });
      const replaced = { ...unknown, current: "owner_replaced" };
      assert.deepEqual(result.undo.steps, [undone.undo.steps[0], replaced]);
      assert.equal(await restarted.invoke(projectSettingsCapabilities.runtime, []), null);
      const status = await restarted.invoke(actions.read, { adoption_id: initial.adoption_id });
      assert.deepEqual(status.apply_steps[1], replaced);
      assert.deepEqual(status.latest_undo?.steps[1], replaced);
      if (page && browser) {
        await Promise.all([browser.event("Page.domContentEventFired"), page.command("Page.navigate", { url: served.origin + resultPath })]);
        await page.wait(`${awaiting} && /installation has changed/i.test(${pendingRow})`);
      }
      assert.deepEqual(JSON.parse(await readFile(preference, "utf8")), saved, "the replacement never receives an old request");
    } finally { await served.close(); }
  } finally { await successor.close(); }
});

test("ONB-33: catalog availability agrees with owner-only Assistant and Shelf reads", async t => {
  const { host } = await openTestHome(t);
  const person = await host.localPersonContext();
  const agent: ActionCallContext = { actor_id: person.actor_id, actor_kind: "runtime", project_id: null, audience: "agent",
    permissions: ["shelf:read", "memory:configure"] };
  const raw = host.homeActionClient();
  const views = await raw.discover(agent);
  for (const [id, key, code] of [
    ["assistant.preferences.read", "assistant.lookback", "assistant.scope"],
    ["shelf.preferences.read", "shelf.drop_wheel", "actions.forbidden"],
  ]) {
    const offered = views.find(view => view.capability_id === id);
    assert.ok(offered && !offered.availability.available);
    assert.equal(offered.availability.code, code);
    await assert.rejects(raw.invoke(agent, { capability_id: id!, version: 1, provider_id: offered.provider.provider_id }, { keys: [key] }), { code });
    const read = await raw.invoke<{keys: string[]}, SettingsValues>(person, { capability_id: id!, version: 1, provider_id: offered.provider.provider_id }, { keys: [key!] });
    assert.equal(read.values[0]?.state, "ok");
  }
  const memory = views.find(view => view.capability_id === "memory.preferences.read");
  assert.equal(memory?.availability.available, false);
});
