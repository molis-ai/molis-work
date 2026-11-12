import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

interface Picked { request_id: string; outcome: string; items: Array<{ ref: { subject: { kind: string; id: string }; pin: { mode: string; read_revision?: string }; range?: unknown }; title: string; hint?: string }> }

// Files retirement S5 (specs/batch-06-shared-tools/materials-ui-contract §3): the one picker of project materials answers each request
// once — confirmed with exact references, cancelled when closed or replaced, unavailable where there is no project. A folder file is
// taken as it is now (its read revision); one opens beside the list on a wide screen and in its own step on a narrow one, in the same
// reader as the side panel, where a quote is added to the choice. An empty confirm only clears what the asking input had.
test("WMD-05 BSH-08 the materials picker answers once with exact references, previews beside or stepwise, and quotes into the choice", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { web, origin, projectId, homeDirectory, command, sessionId, navigate, evaluate, waitFor, click } = browser;
  const prefix = `/projects/${projectId}`;
  const directory = join(homeDirectory, "picker");
  await mkdir(directory, { recursive: true });
  const notes = "第一段：背景\n\n第二段：要引用的话\n\n第三段：结论\n";
  await writeFile(join(directory, "notes.txt"), notes);
  const workspaceId = (await setProjectOutputFolder(web, projectId, directory)).workspace_id;
  const fileId = `${workspaceId}:notes.txt`;
  const readBack = async (ref: unknown) => (await web.post<{ text: string }>(`${prefix}/api/materials/read`, { ref, mode: "text" })).text;
  const ask = (detail: Record<string, unknown>) => evaluate(`document.dispatchEvent(new CustomEvent("molis-work:knowledge-pick", { detail: ${JSON.stringify(detail)} }))`);
  const answers = () => evaluate<Picked[]>("window.__picked");
  const dialog = ".knowledge-picker";
  const filesRow = `[data-knowledge-picker-open=${JSON.stringify(fileId)}]`;
  const listFiles = async () => {
    await evaluate(`(() => { const kind = document.querySelector('[data-knowledge-picker-kind]'); kind.value = 'files'; kind.dispatchEvent(new Event('change')); })()`);
    // Every row a file and the search settled: the list is this request's, not what the dialog showed before.
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(filesRow)})) && document.querySelector('[data-knowledge-picker-status]').textContent === ''
      && [...document.querySelectorAll('[data-knowledge-picker-list] > li')].every(row => row.querySelector('[data-knowledge-picker-open]'))`, 15_000);
  };
  const shown = (selector: string) => evaluate<boolean>(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); return Boolean(node) && getComputedStyle(node).display !== 'none' && !node.closest('[hidden]'); })()`);

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/" }, sessionId));
  await waitFor("document.documentElement.dataset.knowledgePicker === '1'", 15_000);
  await evaluate(`window.__picked = []; window.__handed = [];
    document.addEventListener('molis-work:knowledge-picked', event => window.__picked.push(event.detail));
    document.addEventListener('molis:assistant-open', event => window.__handed.push(event.detail));`);

  // A request replaced by another is told it was cancelled; the second is the one open.
  await ask({ request_id: "test:first" });
  await waitFor(`document.querySelector(${JSON.stringify(dialog)})?.open === true`);
  await ask({ request_id: "test:second" });
  assert.deepEqual((await answers()).map(answer => [answer.request_id, answer.outcome]), [["test:first", "cancelled"]]);
  assert.equal(await evaluate("document.querySelector('[data-knowledge-picker-confirm]').disabled"), true, "nothing chosen and nothing to clear: 添加 waits");

  // A folder file ticked in the list is taken as it is now, by its read revision.
  await listFiles();
  await evaluate(`document.querySelector(${JSON.stringify(filesRow)}).closest('li').querySelector('input[type=checkbox]').click()`);
  await waitFor("document.querySelectorAll('[data-knowledge-picker-chosen] li').length === 1");

  // Wide: the file opens beside the list; a dragged selection is quoted and added to the choice.
  await click(filesRow);
  await waitFor("document.querySelector('[data-picker-materials-window]')?.textContent === " + JSON.stringify(notes), 15_000);
  assert.equal(await shown("[data-knowledge-picker-list]"), true, "the list stays beside the preview on a wide screen");
  assert.equal(await shown("[data-knowledge-picker-back]"), false, "no step back on a wide screen");
  await evaluate(`(() => { const node = document.querySelector('[data-picker-materials-window]').firstChild, at = node.data.indexOf('要引用的话');
    const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + 5); getSelection().removeAllRanges(); getSelection().addRange(range); })()`);
  await click('[data-picker-materials="quote"]');
  await waitFor("(document.querySelector('[data-picker-materials-held]:not([hidden]) span')?.textContent ?? '').includes('第 3 行')");
  await click('[data-picker-materials="add"]');
  await waitFor("document.querySelectorAll('[data-knowledge-picker-chosen] li').length === 2");
  assert.deepEqual(await answers(), [{ request_id: "test:first", outcome: "cancelled", items: [] }], "opening, reading and quoting answer nothing yet");

  await click("[data-knowledge-picker-confirm]");
  await waitFor("window.__picked.length === 2");
  const confirmed = (await answers())[1]!;
  assert.equal(confirmed.request_id, "test:second");
  assert.equal(confirmed.outcome, "confirmed");
  const [whole, quote] = confirmed.items;
  assert.deepEqual([whole!.ref.subject, whole!.ref.pin.mode, whole!.title], [{ kind: "workspace_file", id: fileId }, "current", "notes.txt"]);
  assert.match(whole!.ref.pin.read_revision ?? "", /^[0-9a-f]{64}$/u, "the file is taken by the revision it had when ticked");
  assert.equal(await readBack(whole!.ref), notes);
  assert.equal(quote!.ref.pin.mode, "snapshot", "a quote goes in as the version the service fixed");
  assert.equal(quote!.title, "notes.txt · 第 3 行");
  assert.equal(await readBack(quote!.ref), "要引用的话");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(dialog)}).open`), false);

  // Picks handed back in `selected` are shown; dropping them all and confirming clears the input's choice.
  await ask({ request_id: "test:clear", selected: [{ ref: whole!.ref, title: whole!.title }] });
  await waitFor("document.querySelectorAll('[data-knowledge-picker-chosen] li').length === 1");
  await click("[data-knowledge-picker-chosen] li button");
  await waitFor("document.querySelectorAll('[data-knowledge-picker-chosen] li').length === 0");
  assert.equal(await evaluate("document.querySelector('[data-knowledge-picker-confirm]').disabled"), false, "an empty confirm clears what the input had");
  await click("[data-knowledge-picker-confirm]");
  await waitFor("window.__picked.length === 3");
  assert.deepEqual((await answers())[2], { request_id: "test:clear", outcome: "confirmed", items: [] });

  // The Assistant's request: what is confirmed goes into its input by exact reference.
  await ask({ request_id: "assistant:one", max: 10 });
  await listFiles();
  await evaluate(`document.querySelector(${JSON.stringify(filesRow)}).closest('li').querySelector('input[type=checkbox]').click()`);
  await waitFor("document.querySelectorAll('[data-knowledge-picker-chosen] li').length === 1");
  await click("[data-knowledge-picker-confirm]");
  await waitFor("window.__handed.length === 1");
  const handed = await evaluate<{ source: { surface: string }; materials: Array<{ title: string; ref?: { subject: { kind: string; id: string } } }> }>("window.__handed[0]");
  assert.equal(handed.source.surface, "knowledge");
  assert.deepEqual(handed.materials.map(material => [material.title, material.ref?.subject.id]), [["notes.txt", fileId]]);

  // Narrow: the preview is its own step, with a way back to the list. Closing answers cancelled and keeps nothing.
  await command("Emulation.setDeviceMetricsOverride", { width: 700, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await ask({ request_id: "test:narrow" });
  await listFiles();
  await click(filesRow);
  await waitFor("document.querySelector('[data-picker-materials-window]')?.textContent === " + JSON.stringify(notes), 15_000);
  assert.equal(await shown("[data-knowledge-picker-list]"), false, "on a narrow screen the preview takes the list's place");
  assert.equal(await shown("[data-knowledge-picker-back]"), true);
  await click("[data-knowledge-picker-back]");
  await waitFor("document.querySelector('[data-knowledge-picker-preview]').hidden");
  assert.equal(await shown("[data-knowledge-picker-list]"), true);
  assert.equal(await evaluate(`document.activeElement?.matches(${JSON.stringify(filesRow)})`), true, "focus returns to the file it opened");
  await evaluate(`document.querySelector(${JSON.stringify(dialog)}).close()`);
  await waitFor("window.__picked.length === 5");
  assert.deepEqual((await answers()).slice(3).map(answer => [answer.request_id, answer.outcome, answer.items.length]), [["assistant:one", "confirmed", 1], ["test:narrow", "cancelled", 0]]);

  // Where there is no project to pick from, the request is answered unavailable and nothing opens.
  await evaluate("document.body.dataset.savedPrefix = document.body.dataset.routePrefix; delete document.body.dataset.routePrefix");
  await ask({ request_id: "test:nowhere" });
  await evaluate("document.body.dataset.routePrefix = document.body.dataset.savedPrefix");
  assert.deepEqual((await answers()).at(-1), { request_id: "test:nowhere", outcome: "unavailable", items: [] });
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(dialog)}).open`), false);
});

// The same picker for a plugin page (materials-ui-contract §3): Coding asks from its frame as it would on any page. The page opens the
// picker only for a press the person just made in a view they can see, hands back only what that plugin page can read, answers a close
// as cancelled with the input's choice kept, and ends the request without an answer when the view goes away.
test("WMD-05 BSH-08 a plugin frame (Coding) shares the page's picker: a real press, exact references, cancel keeps the choice, leaving ends it", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { web, origin, projectId, homeDirectory, command, sessionId, navigate, evaluate: hostEvaluate, waitFor: hostWaitFor, click: hostClick } = browser;
  const directory = join(homeDirectory, "picker");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "notes.txt"), "给 Coding 的材料\n");
  const workspaceId = (await setProjectOutputFolder(web, projectId, directory)).workspace_id;
  const fileId = `${workspaceId}:notes.txt`, filesRow = `[data-knowledge-picker-open=${JSON.stringify(fileId)}]`;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "coding");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await hostClick('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor("document.querySelector('[data-coding-model] option')");
  await click("[data-coding-new]");
  await waitFor("document.querySelector('[data-coding-session]') && !document.querySelector('[data-coding-task]').disabled");
  const id = await evaluate<string>("document.querySelector('[data-coding-session]').dataset.codingSession");
  const saved = async () => (await web.get<{ materials: Picked["items"] }>(`/projects/${projectId}/api/plugins/io.molis.work.coding/sessions/${id}`)).materials;
  await evaluate("window.__picked = []; document.addEventListener('molis-work:knowledge-picked', event => window.__picked.push(event.detail))");
  const heard = () => evaluate<Picked[]>("window.__picked");
  const pickerOpen = "document.querySelector('.knowledge-picker')?.open === true";

  // Without a press the person just made, the frame cannot put a dialog over the page.
  await new Promise(resolve => setTimeout(resolve, 5_500));
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:knowledge-pick', { detail: { request_id: 'coding:forged:1' } }))");
  await waitFor("window.__picked.length === 1");
  assert.deepEqual(await heard(), [{ request_id: "coding:forged:1", outcome: "unavailable", items: [] }]);
  assert.equal(await hostEvaluate(pickerOpen), false);

  // Coding's 材料: the page's picker opens; the confirmed file reaches Coding by its exact reference and is saved for the next round.
  await click("[data-coding-attach-toggle]"); await click("[data-coding-material-open]");
  await hostWaitFor(pickerOpen, 10_000);
  await hostEvaluate("(() => { const kind = document.querySelector('[data-knowledge-picker-kind]'); kind.value = 'files'; kind.dispatchEvent(new Event('change')); })()");
  await hostWaitFor(`Boolean(document.querySelector(${JSON.stringify(filesRow)})) && document.querySelector('[data-knowledge-picker-status]').textContent === ''`, 15_000);
  await hostEvaluate(`document.querySelector(${JSON.stringify(filesRow)}).closest('li').querySelector('input[type=checkbox]').click()`);
  await hostWaitFor("document.querySelectorAll('[data-knowledge-picker-chosen] li').length === 1");
  await hostClick("[data-knowledge-picker-confirm]");
  await waitFor("window.__picked.length === 2");
  const [confirmed] = (await heard()).slice(1);
  assert.equal(confirmed!.outcome, "confirmed");
  assert.match(confirmed!.request_id, /^coding:/u, "the frame hears the answer under its own request id");
  assert.deepEqual(confirmed!.items.map(item => [item.ref.subject.id, item.ref.pin.mode, item.title]), [[fileId, "current", "notes.txt"]]);
  const deadline = Date.now() + 10_000;
  while ((await saved()).length !== 1 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual((await saved()).map(item => [item.ref.subject.id, item.ref.pin.read_revision]), [[fileId, confirmed!.items[0]!.ref.pin.read_revision]]);

  // Closed without 添加: cancelled, and the choice Coding had stays.
  await click("[data-coding-attach-toggle]"); await click("[data-coding-material-open]");
  await hostWaitFor(pickerOpen, 10_000);
  assert.equal(await hostEvaluate("document.querySelectorAll('[data-knowledge-picker-chosen] li').length"), 1, "the picker opens with what Coding had chosen");
  await hostEvaluate("document.querySelector('.knowledge-picker').close()");
  await waitFor("window.__picked.length === 3");
  assert.deepEqual((await heard())[2]!.outcome, "cancelled");
  assert.equal((await saved()).length, 1);

  // The view goes away while the picker is open: the request ends, the picker closes, and the frame hears nothing late.
  await click("[data-coding-attach-toggle]"); await click("[data-coding-material-open]");
  await hostWaitFor(pickerOpen, 10_000);
  await hostEvaluate(`document.querySelector('[data-plugin-strip] [data-plugin-id]:not([data-plugin-id="coding"])').click()`);
  await hostWaitFor("document.querySelector('.knowledge-picker')?.open === false", 10_000);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal((await heard()).length, 3, "no answer reaches a view that went away");
  assert.equal((await saved()).length, 1);
});
