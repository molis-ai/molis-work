import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkHostProjectReference, runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import type { VersionedProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import { SCHEDULE_PLUGIN_ID } from "@molis-ai/molis-work-plugin-schedule";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { openAuditBrowser, type AuditBrowser } from "./fixtures/workbench-audit-browser.js";

const index = "/api/settings/project-plugins";
const settings = (projectId: string) => `/api/settings/projects/${encodeURIComponent(projectId)}/plugins`;

async function membership(browser: AuditBrowser, projectId: string): Promise<VersionedProjectPluginMembership> {
  const { projects } = await browser.web.get<{ projects: Array<VersionedProjectPluginMembership & { project_id: string }> }>(index);
  const row = projects.find(row => row.project_id === projectId);
  assert.ok(row?.revision);
  return row;
}

async function writes(browser: AuditBrowser, projectId: string) {
  return browser.evaluate<Array<{ method: string; body: { plugin_id: string; expected_revision: string } }>>(`window.__auditRequests.filter(request => request.path === ${JSON.stringify(settings(projectId))}).map(request => ({ method: request.method, body: JSON.parse(request.body) }))`);
}

const marketButton = (id: string) => `[data-market-add="${id}"]`;
const ready = (id: string) => `!document.querySelector(${JSON.stringify(marketButton(id))}).disabled`;
const marketState = (id: string) => `document.querySelector(${JSON.stringify(marketButton(id))}).dataset.marketMembership`;
const pickerState = (id: string) => `document.querySelector('[data-plugin-toggle=${id}]').dataset.state`;

const retry = "[data-market-retry]";
const status = "document.querySelector('[data-market-status]').textContent";
const retryVisible = `(() => { const button = document.querySelector('${retry}'), box = button.getBoundingClientRect();
  return !button.hidden && box.width > 0 && box.top >= 0 && box.bottom <= innerHeight; })()`;

function failScheduleStop(db: SqliteDatabase): () => void {
  db.exec(`CREATE TEMP TRIGGER refuse_schedule_stop BEFORE UPDATE ON plugin_runtime_installs
    WHEN json_extract(NEW.record_json, '$.plugin_id') = '${SCHEDULE_PLUGIN_ID}' AND json_extract(NEW.record_json, '$.state') = 'disabled'
    BEGIN SELECT RAISE(ABORT, 'fixture Schedule stop failed'); END`);
  return () => db.exec("DROP TRIGGER refuse_schedule_stop");
}

async function capture(browser: AuditBrowser, name: string) {
  const directory = ".impeccable/qa/review/batch20-project-membership";
  await mkdir(directory, { recursive: true });
  const shot = await browser.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, browser.sessionId);
  await writeFile(join(directory, name + ".png"), Buffer.from(shot.data, "base64"));
}

test("SPC-C08 picker and market save from their own observations, report committed failures, and read again on conflict", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t);
  if (!browser) return;
  const { localHost, projectId } = browser;
  assert.ok(localHost && projectId);
  const reference = molisWorkHostProjectReference({ projectId, databasePath: browser.databasePath });
  const { platform, db } = await localHost.withProject(reference, async runtime => ({
    platform: await runningProjectPlatform(runtime.store, projectId), db: runtime.store.db,
  }));
  assert.ok(platform);
  const installation = platform.supervisor.state(SCHEDULE_PLUGIN_ID)?.install_id;
  assert.ok(installation);
  const other = await createProject(browser.web, "Another project for membership");
  const pageObservation = await membership(browser, projectId);
  assert.equal(await browser.evaluate("document.body.dataset.projectPluginRevision"), pageObservation.revision);
  assert.equal(await browser.evaluate(pickerState("schedule")), "added");
  await browser.evaluate("window.__membershipPage = document.body");

  await browser.setViewport(390, 844);
  const ordinaryToastLayer = await browser.evaluate("getComputedStyle(document.querySelector('[data-toast]')).zIndex");
  const allowStop = failScheduleStop(db);
  try {
    await browser.click("[data-plugin-picker-toggle]");
    await browser.click("[data-plugin-toggle=schedule]");
    await browser.click("[data-plugin-toggle=schedule]");
    await browser.waitFor("document.querySelector('[data-toast]').textContent.includes('插件选择已保存')");
    assert.equal(await browser.evaluate(pickerState("schedule")), "available");
    assert.equal(await browser.evaluate("document.querySelector('[data-plugin-tile=schedule]').classList.contains('is-available')"), true);
    assert.equal(await browser.evaluate("document.querySelector('[data-plugin-tile=schedule] .dock-keep').disabled"), true);
    assert.deepEqual(await writes(browser, projectId), [{ method: "DELETE", body: { plugin_id: "schedule", expected_revision: pageObservation.revision } }]);
    assert.equal((await membership(browser, projectId)).plugins.includes("schedule"), false);
    assert.equal(platform.runtime.get(installation).state, "running", "the real stop still awaits recovery");
    assert.equal(await browser.evaluate("window.__membershipPage === document.body"), true);
    const toast = await browser.evaluate(`(() => {
      const toast = document.querySelector('[data-toast]');
      const hits = node => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(x + width / 2, y + height / 2));
      };
      return { abovePicker: hits(toast), diagnosticAvailable: hits(toast.querySelector('[data-molis-call-id]')),
        pickerButtonAvailable: hits(document.querySelector('[data-plugin-toggle=schedule]')),
        transitionDuration: getComputedStyle(toast).transitionDuration, focusedPlugin: document.activeElement.dataset.pluginToggle };
    })()`);
    assert.deepEqual(toast, { abovePicker: true, diagnosticAvailable: true, pickerButtonAvailable: true,
      transitionDuration: "0s", focusedPlugin: "schedule" });
    await capture(browser, "picker-committed");
    for (const type of ["rawKeyDown", "keyUp"]) {
      await browser.command("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, browser.sessionId);
    }
    assert.equal(await browser.evaluate("document.querySelector('[data-plugin-picker-popover]').hidden && document.activeElement.matches('[data-plugin-picker-toggle]')"), true);
    assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('[data-toast]')).zIndex"), ordinaryToastLayer);
  } finally { allowStop(); }

  await browser.setViewport(1440, 1000);
  // Reopen the same project to reconcile the Runtime. A separate browser request changes the Catalog again before the market draws it.
  const currentPath = `/projects/${encodeURIComponent(projectId)}/`;
  const recovered = await fetch(browser.origin + currentPath);
  assert.equal(recovered.status, 200);
  await recovered.arrayBuffer();
  assert.equal(platform.runtime.get(installation).state, "disabled");
  const disabled = await membership(browser, projectId);
  await browser.web.post(settings(projectId), { plugin_id: "schedule", expected_revision: disabled.revision });
  const marketObservation = await membership(browser, projectId);
  assert.notEqual(marketObservation.revision, disabled.revision);
  await browser.click('[data-global-menu] [data-plugin-id="market"]');
  await browser.waitFor(`${ready("schedule")} && ${marketState("schedule")} === 'added'`);
  await browser.waitFor("!document.querySelector('[data-toast]').classList.contains('is-visible')");
  await browser.click(marketButton("schedule"));
  await browser.waitFor(`${ready("schedule")} && ${marketState("schedule")} === 'available'`);
  assert.deepEqual((await writes(browser, projectId)).at(-1), { method: "DELETE", body: { plugin_id: "schedule", expected_revision: marketObservation.revision } });
  assert.equal(await browser.evaluate("window.__membershipPage === document.body"), true);

  const before = await membership(browser, other.project_id);
  await browser.click("[data-market-project-trigger]");
  await browser.click(`[data-market-project-option="${other.project_id}"]`);
  await browser.waitFor(`${ready("files")} && ${marketState("files")} === 'available'`);
  await browser.web.delete(settings(other.project_id), { plugin_id: "form", expected_revision: before.revision });
  const changed = await membership(browser, other.project_id);
  assert.notEqual(changed.revision, before.revision);
  await browser.click(marketButton("files"));
  await browser.waitFor(retryVisible);
  assert.match(await browser.evaluate<string>(status), /添加 .+Another project for membership/u);
  assert.equal(await browser.evaluate("document.querySelector('[data-market-project]').value"), other.project_id);
  assert.equal(await browser.evaluate(marketState("files")), "available");
  assert.deepEqual(await writes(browser, other.project_id), [{ method: "POST", body: { plugin_id: "files", expected_revision: before.revision } }]);
  assert.equal((await membership(browser, other.project_id)).revision, changed.revision);
  await capture(browser, "market-conflict");
  await browser.click(retry);
  await browser.waitFor(`${ready("files")} && document.querySelector('${retry}').hidden`);
  assert.match(await browser.evaluate<string>(status), /核对.+添加 .+Another project for membership/u);
  assert.equal((await writes(browser, other.project_id)).length, 1, "retry only reads the project list");
  await browser.click(marketButton("files"));
  await browser.waitFor(`${ready("files")} && ${marketState("files")} === 'added'`);
  assert.deepEqual((await writes(browser, other.project_id)).at(-1), { method: "POST", body: { plugin_id: "files", expected_revision: changed.revision } });
  assert.ok((await membership(browser, other.project_id)).plugins.includes("files"));
  assert.equal((await membership(browser, projectId)).plugins.includes("files"), false);

  // A committed-only observation updates this other project's selection, but cannot authorize a second write until the index is read.
  const otherPath = `/projects/${encodeURIComponent(other.project_id)}/`;
  const openOther = async () => {
    const response = await fetch(browser.origin + otherPath);
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  };
  await openOther();
  const otherRef = molisWorkHostProjectReference({ projectId: other.project_id, databasePath: other.database_path });
  const { platform: otherPlatform, db: otherDb } = await localHost.withProject(otherRef, async runtime => ({
    platform: await runningProjectPlatform(runtime.store, other.project_id), db: runtime.store.db,
  }));
  const otherInstall = otherPlatform?.supervisor.state(SCHEDULE_PLUGIN_ID)?.install_id;
  assert.ok(otherPlatform && otherInstall);
  const beforeStop = await membership(browser, other.project_id);
  const catalog = await localHost.ensureWebCatalog(browser.homeDirectory, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: browser.homeDirectory }, value => value);
  let failReadback = false;
  const read = catalog.projectPluginMembershipWithRevision.bind(catalog), stop = otherPlatform.runtime.stop.bind(otherPlatform.runtime);
  t.mock.method(catalog, "projectPluginMembershipWithRevision", (...args: Parameters<typeof read>) => {
    if (failReadback && args[0] === other.project_id) throw new Error("fixture membership readback failed");
    return read(...args);
  });
  t.mock.method(otherPlatform.runtime, "stop", async (...args: Parameters<typeof stop>) => {
    try { return await stop(...args); }
    catch (error) { if (args[0] === otherInstall) failReadback = true; throw error; }
  });
  await browser.setViewport(390, 844);
  const allowOtherStop = failScheduleStop(otherDb);
  try {
    await browser.click(marketButton("schedule"));
    await browser.waitFor(retryVisible);
    assert.match(await browser.evaluate<string>(status), /插件选择已保存/u);
    assert.equal(await browser.evaluate(marketState("schedule")), "available");
    assert.equal(await browser.evaluate(ready("schedule")), false);
    assert.deepEqual((await writes(browser, other.project_id)).at(-1), { method: "DELETE", body: { plugin_id: "schedule", expected_revision: beforeStop.revision } });
    await capture(browser, "market-committed-retry-phone");
  } finally { failReadback = false; allowOtherStop(); }
  const saved = await membership(browser, other.project_id), writeCount = (await writes(browser, other.project_id)).length;
  assert.equal(saved.plugins.includes("schedule"), false);
  assert.notEqual(saved.revision, beforeStop.revision);
  await browser.click(retry);
  await browser.waitFor(`${ready("schedule")} && document.querySelector('${retry}').hidden`);
  assert.equal((await writes(browser, other.project_id)).length, writeCount);
  assert.equal(otherPlatform.runtime.get(otherInstall).state, "running", "index retry leaves runtime recovery to the existing project page");
  await openOther();
  assert.equal(otherPlatform.runtime.get(otherInstall).state, "disabled");
});
