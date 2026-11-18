import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { homeSqlitePath, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ActionError, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { blueprintActions } from "@molis-ai/molis-work-contracts/services/blueprints";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkHostProjectReference, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("ONB-21/22/28/30: review actual setting values one by one, resume from the project and undo", { timeout: 95_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const { projectId, databasePath, localHost, origin, sessionId, command, evaluate, waitFor, click, navigate } = b;
  assert.ok(projectId && localHost);
  const reference = molisWorkHostProjectReference({ projectId, databasePath });
  const caller = await localHost.localPersonContext(reference), user = bindActionClient(localHost.actionClient(reference), () => caller);
  const title = { literal: "Weekly review" };
  const { draft } = await user.invoke(blueprintActions.draftSave, { expected_revision: null,
    blueprint: { title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
      parts: [{ part_id: "engine", layer: "project", required: true, proposal: { kind: "setting", key: "projects.runtime", value: "prologue" } },
        { part_id: "outline", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
      steps: [{ step_id: "prepare", title, part_ids: ["engine", "outline"] }],
      example_task: { title, input: title, step_ids: ["prepare"], result: { part_id: "outline", location: title } } } });
  const address = origin + "/projects/" + projectId + "/onboarding?scene";
  await navigate(() => command("Page.navigate", { url: address }, sessionId));
  const draftLink = '[data-scene-main] a[href*="' + draft.source.draft_id + '"]';
  await waitFor("document.querySelector('[data-scene-main] h2, [data-scene-error]:not([hidden])')");
  assert.ok(await evaluate<boolean>('Boolean(document.querySelector(' + JSON.stringify(draftLink) + '))'),
    await evaluate<string>("document.querySelector('[data-scene-workspace]').innerText"));
  await navigate(() => click(draftLink));
  await waitFor("document.querySelector('[name=scene-target]:checked')?.value === 'current_project'");
  await click(".arrival-bar .bar-end .mw-btn--primary");
  await waitFor("document.querySelector('[data-scene-main] dd') && document.querySelector('[data-scene-main] input[type=checkbox]')?.checked");
  assert.match(await evaluate<string>("document.querySelector('[data-scene-main]').textContent"), /prologue/);
  assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), null);
  const selected = "[data-scene-main] input[type=checkbox]";
  await click(selected);
  await click("[data-scene-aside] button:nth-of-type(2)");
  await waitFor("document.activeElement === document.querySelector('[data-scene-main] h2') && location.search.includes('preview=')");
  await b.reloadPage();
  await waitFor("document.querySelector('[data-scene-aside] button:nth-of-type(2)')?.disabled");
  await evaluate("document.querySelector('[data-scene-aside] button').focus()");
  const enter = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 };
  await command("Input.dispatchKeyEvent", { type: "keyDown", ...enter, text: "\r" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", ...enter }, sessionId);
  await waitFor("document.querySelector('[data-scene-main] input[type=checkbox]') && document.activeElement === document.querySelector('[data-scene-main] h2')");
  assert.equal(await evaluate<boolean>("document.querySelector('[data-scene-main] input').checked"), false, "reload keeps an explicit exclusion");
  await click(selected);
  await click("[data-scene-main] details summary");
  await evaluate("document.querySelector('[data-scene-main] textarea').value = ''");
  await click("[data-scene-main] details button");
  await waitFor("!document.querySelector('[data-scene-error]').hidden");
  assert.ok(await evaluate<boolean>("document.querySelector('[data-scene-main] details').open && document.querySelector('[data-scene-main] textarea').value === ''"),
    "the rejected edit stays on screen for correction");
  await evaluate("document.querySelector('[data-scene-main] textarea').value = 'prologue'");
  await click("[data-scene-main] details button");
  await waitFor("document.querySelector('[data-scene-workspace]').getAttribute('aria-busy') === 'false' && document.querySelector('[data-scene-error]').hidden");
  const reviewDir = join(process.cwd(), ".impeccable", "qa", "review", "batch-38");
  await mkdir(reviewDir, { recursive: true });
  for (const width of [1440, 1024, 390]) {
    await b.setViewport(width, width === 390 ? 844 : 950, width === 390);
    const mode = width === 1024 ? "dark" : "light";
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: mode }] }, sessionId);
    if (width === 1024) {
      await command("Network.setCookie", { name: "molis_work_locale", value: "en", url: origin }, sessionId);
    }
    await b.reloadPage();
    await waitFor("document.querySelector('[data-scene-main] input')?.checked");
    if (width !== 1440) assert.match(await evaluate<string>("document.documentElement.lang"), /^en/);
    await waitFor("document.documentElement.dataset.resolvedTheme === " + JSON.stringify(mode));
    assert.ok(await evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth + 1"));
    const shot = await command<{data: string}>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(reviewDir, "review-" + width + "-" + mode + ".png"), Buffer.from(shot.data, "base64"));
  }
  await click("[data-scene-aside] details summary");
  await waitFor("document.querySelector('[data-scene-aside] details')?.open");
  assert.equal(await evaluate<number>("document.querySelectorAll('[data-scene-aside] input:disabled').length"), 1);
  await click(".arrival-bar .bar-end .mw-btn--primary");
  await waitFor("location.search.includes('adoption=') && document.querySelectorAll('[data-scene-main] details').length === 2");
  assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), "prologue");
  await navigate(() => command("Page.navigate", { url: address }, sessionId));
  await waitFor("document.querySelector('[data-scene-aside] a[href*=adoption]')");
  await navigate(() => click("[data-scene-aside] a[href*=adoption]"));
  await waitFor("document.querySelector('[data-scene-aside] button') && document.querySelectorAll('[data-scene-main] details:not([open])').length === 2");
  // SPC-12: a second window reads its baseline once and receives the other window's undo from the progress stream.
  const { targetId } = await command<{ targetId: string }>("Target.createTarget", { url: "about:blank", background: true });
  const observer = await b.openPage(targetId);
  await observer.command("Page.navigate", { url: await evaluate<string>("location.href") });
  await observer.wait("document.querySelectorAll('[data-scene-main] details:not([open])').length === 2");
  await click("[data-scene-aside] button");
  const restored = "document.querySelector('[data-scene-main]').textContent.match(/已恢复原设置|Previous setting restored/)";
  await waitFor(restored);
  await observer.wait(restored);
  assert.equal(await observer.evaluate("performance.getEntriesByType('resource').filter(r => new URL(r.name).pathname.endsWith('/api/blueprints/library')).length"), 1);
  assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), null);
});

test("ONB-29: reopening a new-project adoption interrupted before project creation continues from its origin", async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const { localHost, homeDirectory, navigate, command, origin, sessionId, waitFor, click } = b;
  assert.ok(localHost);
  const caller = await localHost.localPersonContext(), client = localHost.homeActionClient(), user = bindActionClient(client, () => caller);
  const title = { literal: "Recovered project" };
  const { draft } = await user.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [{ part_id: "engine", layer: "project", required: true, proposal: { kind: "setting", key: "projects.runtime", value: "prologue" } },
      { part_id: "outline", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
    steps: [{ step_id: "prepare", title, part_ids: ["engine", "outline"] }],
    example_task: { title, input: title, step_ids: ["prepare"], result: { part_id: "outline", location: title } },
  } });
  const part_ids = ["engine"];
  const { preview_id } = await user.invoke(blueprintActions.preview, { source: draft.source, target: { kind: "new_project", display_name: "Recovered project" }, part_ids });
  const db = new DatabaseSync(homeSqlitePath(homeDirectory, "blueprints"), { readOnly: true });
  try {
    const committed = db.prepare("SELECT adoption_id FROM adoptions WHERE preview_id=?");
    const interrupted = bindActionClient(client, () => ({ ...caller, assert_authority_current(ref, permissions) {
      caller.assert_authority_current?.(ref, permissions);
      if (committed.get(preview_id)?.adoption_id) throw new ActionError("actions.cancelled", "Interrupted after acceptance");
    } }));
    await assert.rejects(interrupted.invoke(blueprintActions.apply, { preview_id, part_ids, request_id: "create-recovered" }), { code: "actions.cancelled" });
  } finally { db.close(); }
  const record = await user.invoke(blueprintActions.library, { preview_id });
  assert.equal(record.target_created, false);
  const accepted = record.adoptions[0]!;
  assert.ok(accepted.target.kind === "project");
  await navigate(() => command("Page.navigate", { url: origin + "/onboarding?scene&adoption=" + accepted.adoption_id }, sessionId));
  await waitFor("document.querySelector('.arrival-bar .bar-end button.mw-btn--primary')");
  await click(".arrival-bar .bar-end button.mw-btn--primary");
  await waitFor("document.querySelector('.arrival-bar .bar-end a[href*=adoption]')");
  assert.equal((await user.invoke(blueprintActions.library, { preview_id })).target_created, true);
  await navigate(() => click(".arrival-bar .bar-end a[href*=adoption]"));
  await waitFor("location.pathname.includes(" + JSON.stringify(accepted.target.project_id) + ") && document.querySelector('.arrival-bar .bar-end button.mw-btn--primary')");
  await click(".arrival-bar .bar-end button.mw-btn--primary");
  await waitFor("document.querySelector('[data-scene-main] details:not([open])') && !document.querySelector('.arrival-bar .bar-end .mw-btn--primary')");
});

test("ONB-22/30: change an unavailable Jelly model in the review and read the replacement from Jelly", { timeout: 90_000 }, async t => {
  const originalBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => {
    if (originalBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = originalBackend;
    resetSecretStoreCache();
  });
  const before = { provider_id: "scene-before", model_id: "before" };
  const after = { provider_id: "scene-after", model_id: "after" };
  let originalConnection = "";
  const prepareHome = (home: string) => runWithMolisWorkHome(home, () => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => {
    for (const choice of [before, after]) {
      const base = "http://127.0.0.1:9/" + choice.model_id;
      const connection = withConnectorConnections(home, store => {
        const row = store.createToken({ serviceId: "model-api", displayName: choice.model_id, token: "local-model-fixture" });
        store.assertTarget(row.connection_id, "model-api", base);
        return row;
      });
      if (choice === before) originalConnection = connection.connection_id;
      catalog.models.upsert({ provider_id: choice.provider_id, display_name: choice.model_id, base_url: base, credential_ref: connection.credential_ref!,
        api_format: "openai-chat-completions", models: [{ model_id: choice.model_id, enabled: true }] });
    }
  }));
  const b = await openGoalBrowser(t, "user", undefined, null, undefined, undefined, { prepareHome });
  if (!b) return;
  const { localHost, homeDirectory, command, navigate, origin, sessionId, click, waitFor, evaluate, web } = b;
  assert.ok(localHost);
  const jelly = "/api/plugins/io.molis.work.jelly/model-settings";
  await web.post(jelly, before);
  withConnectorConnections(homeDirectory, store => store.setEnabled(originalConnection, false));
  const caller = await localHost.localPersonContext();
  const user = bindActionClient(localHost.homeActionClient(), () => caller);
  const title = { literal: "会议准备" };
  const { draft } = await user.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [{ part_id: "model", layer: "personal", required: true, proposal: { kind: "setting", key: "jelly.model_selection", value: before } },
      { part_id: "wheel", layer: "personal", required: false, proposal: { kind: "setting", key: "shelf.drop_wheel", value: false } },
      { part_id: "note", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
    steps: [{ step_id: "prepare", title, part_ids: ["model", "wheel", "note"] }],
    example_task: { title, input: title, step_ids: ["prepare"], result: { part_id: "note", location: title } },
  } });
  await navigate(() => command("Page.navigate", { url: origin + "/onboarding?scene&draft=" + draft.source.draft_id }, sessionId));
  await waitFor("document.querySelector('[name=scene-target]')");
  await click("[name=scene-target][value=personal]");
  await click(".arrival-bar .bar-end .mw-btn--primary");
  await waitFor("document.querySelector('[data-scene-main] details summary')");
  assert.equal(await evaluate("document.querySelector('[data-scene-main] input[type=checkbox]')===null"), true);
  await click("[data-scene-aside] button:nth-of-type(2)");
  await waitFor("document.querySelector('[data-scene-main]').innerText.match(/仅此设备|This device only/i)");
  assert.match(await evaluate<string>("document.querySelector('[data-scene-main] h2').textContent"), /拖放轮盘|Drop wheel/i);
  assert.match(await evaluate<string>("document.querySelector('[data-scene-main] dl').innerText"), /开启|\bOn\b/i);
  assert.match(await evaluate<string>("document.querySelector('[data-scene-main] dl').innerText"), /关闭|\bOff\b/i);
  await click("[data-scene-main] details summary");
  assert.equal(await evaluate("document.querySelector('[name=scene-boolean]:checked').value"), "false");
  await click("[data-scene-aside] button");
  const choicesRead = "performance.getEntriesByType('resource').filter(r => r.name.endsWith('/api/settings/models?choices=1')).length";
  assert.equal(await evaluate(choicesRead), 0);
  await click("[data-scene-main] details summary");
  await waitFor("document.querySelector('[name=scene-model]')");
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('[name=scene-model]'), input => input.closest('label').innerText)"), ["after · after"]);
  assert.equal(await evaluate(choicesRead), 1);
  await click("[name=scene-model]");
  await click("[data-scene-main] details button[data-focus]");
  const checkbox = "[data-scene-main] input[type=checkbox]";
  await waitFor("document.querySelector('[data-scene-main] input[type=checkbox]') && !document.querySelector('[data-scene-main] input[type=checkbox]').checked");
  await click(checkbox);
  await click(".arrival-bar .bar-end .mw-btn--primary");
  await waitFor("location.search.includes('adoption=') && document.querySelector('[data-scene-main] details:not([open])')");
  assert.deepEqual((await web.get<{selection: typeof after}>(jelly)).selection, after);
  await click("[data-scene-aside] button");
  await waitFor("document.querySelector('[data-scene-main]').innerText.match(/已恢复原设置|Previous setting restored/)");
  assert.deepEqual((await web.get<{selection: typeof before}>(jelly)).selection, before);
  assert.equal(withConnectorConnections(homeDirectory, store => store.get(originalConnection)?.enabled), false);
});
