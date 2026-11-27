// @requires-platform darwin
import assert from "node:assert/strict";
import test from "node:test";
import { molisWorkHostProjectReference, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { SqlitePluginPrivateStorage, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { person, ref } from "./fixtures/home-sandbox.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { PACKAGE_PLUGIN_ID } from "./fixtures/sandbox-package.js";
import { presentingPackage } from "./fixtures/surface-home-sandbox.js";

test("SCS-11: an ordinary signed plugin opens its original form and exact original record from the real homepage", { skip: process.platform !== "darwin", timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null);
  if (!b) return;
  const project = await createProject(b.web, "Signed home form"), path = "/projects/" + project.project_id + "/";
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const host = b.localHost!, caller = person(project.project_id), client = host.actionClient(reference);
  const go = () => b.navigate(() => b.command("Page.navigate", { url: b.origin + path }, b.sessionId));
  await go();
  const bundle = presentingPackage("project", [], { editorDialog: true });
  const preview = await client.invoke(caller, ref(pluginInstallActions.preview), { bundle }) as { preview_id: string };
  await client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Homepage dialog" });
  const writes = () => host.withProject(reference, runtime => {
    const installed = new SqlitePluginRuntimeRepository(runtime.store.db).list().find(entry => entry.plugin_id === PACKAGE_PLUGIN_ID);
    assert.ok(installed);
    const storage = new SqlitePluginPrivateStorage(runtime.store.db);
    return storage.snapshotInstallationData(installed.install_id);
  });
  // The first page does not start work: the package's own "start" is on its row of the start page under ＋ (POLISH-83).
  const start = '[data-plugin-picker-popover] [data-rail-start="' + PACKAGE_PLUGIN_ID + ':start:0"]';
  const stage = '[data-work-surface][data-installed-plugin=' + JSON.stringify(PACKAGE_PLUGIN_ID) + ']';
  const dialog = 'document.querySelector(\'[data-component-id="editor"] dialog\')';
  await go();
  await b.waitFor(`!!document.querySelector(${JSON.stringify(stage)})`);
  // The installed stage mounts the package's opaque frame itself, named by the stage's surface.
  const child = await pluginFrameBrowser(t, b, await b.evaluate<string>(`document.querySelector('[data-work-surface][data-installed-plugin=${JSON.stringify(PACKAGE_PLUGIN_ID)}]').dataset.workSurface`));
  const open = async () => {
    if (await b.evaluate<boolean>("document.querySelector('[data-plugin-picker-popover]').hidden")) await b.click('[data-plugin-picker-toggle]');
    await b.waitFor(`!!document.querySelector(${JSON.stringify(start)})?.checkVisibility()`);
    await b.click(start);
    await child.waitFor(`${dialog}?.open && ${dialog}.contains(document.activeElement)`, 15_000);
  };
  const backHome = async () => { await b.click('[data-corner-home]'); await b.waitFor("!!document.querySelector('[data-work-surface=home]:not([hidden]) [data-home-sources]')"); };
  const submit = async (text: string) => {
    await child.evaluate(`(() => { const field=${dialog}.querySelector('[name="text"]');
      field.value=${JSON.stringify(text)}; field.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await child.click('[data-component-id="editor"] dialog [type=submit]');
    await child.waitFor(`!${dialog}?.open`);
  };
  await open();
  await child.click('[data-component-id="editor"] dialog .mw-form__footer button[type=button]');
  await child.waitFor(`!${dialog}?.open`);
  assert.deepEqual(await writes(), [], "original signed dialog opens and cancels without writing");
  await child.evaluate(`parent.postMessage({type:"workbench-view",panel:"editor",intent:"open"},"*");
    new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  assert.equal(await child.evaluate(`Boolean(${dialog}?.open)`), false, "an opaque child cannot act as the carrier's owning workbench");
  await backHome();
  await open();
  await submit("one original signed submission");
  const stored = await writes();
  assert.deepEqual(stored.map(row => row.item_key), ["sandbox:entries"]);
  assert.deepEqual(JSON.parse(stored[0]!.item_value), [["notes", JSON.stringify([{ id: "1", text: "one original signed submission" }])]]);
  await backHome();
  await open();
  await submit("a distinct second record");
  const two = await writes();
  assert.deepEqual(JSON.parse(two[0]!.item_value), [["notes", JSON.stringify([{ id: "1", text: "one original signed submission" }, { id: "2", text: "a distinct second record" }])]]);
  await backHome();
  const row = '[data-home-subject-kind="sandbox-home-note"][data-home-subject-id="2"]';
  // A row of the first page has no button of its own: its name opens it, through its peek when it has one.
  const openRecord = row + ' .mw-presentation__row-title', peekOpen = '[data-home-peek] [data-presentation-action$=":peek-open"]';
  await b.waitFor(`document.querySelector(${JSON.stringify(row)})?.textContent.includes("a distinct second record")`);
  await b.click(openRecord);
  await b.waitFor(`!!document.querySelector(${JSON.stringify(peekOpen)})?.checkVisibility() || !document.querySelector(${JSON.stringify(row)})?.checkVisibility()`);
  if (await b.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(peekOpen)})?.checkVisibility()`)) await b.click(peekOpen);
  await child.waitFor(`document.activeElement.matches('[data-record-id="2"][aria-current=true]') && document.activeElement.textContent.includes("a distinct second record")`);
  assert.deepEqual(await writes(), two, "opening the exact signed record does not write");
});
