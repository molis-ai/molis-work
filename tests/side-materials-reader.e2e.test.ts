import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";

// Files retirement S4 (specs/batch-06-shared-tools/materials-ui-contract §4, design A「就地预览」): a file of the project's folders
// opens in the side panel with what the person can take from it. A dragged selection is fixed exactly; without one the person
// chooses a passage with the keyboard; a long file is read on in windows and a selection in a later window is fixed from that
// window; a file changed since it was shown is refused; 「加入任务」 puts what is held in the Assistant's input as a reference.
test("BSH-08 the side panel reads a project-folder file in place: quote, choose a passage, read on, add to the task", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { web, origin, projectId, homeDirectory, command, sessionId, navigate, evaluate, waitFor, click } = browser;
  const prefix = `/projects/${projectId}`;
  const directory = join(homeDirectory, "reader");
  await mkdir(directory, { recursive: true });
  const notes = "第一段：背景\n\n第二段：要引用的话\n\n第三段：结论\n";
  const line = "资料 🙂 abc\n", long = line.repeat(Math.ceil((600 * 1024) / Buffer.byteLength(line)));
  await writeFile(join(directory, "notes.txt"), notes);
  await writeFile(join(directory, "long.txt"), long);
  const workspaceId = (await setProjectOutputFolder(web, projectId, directory)).workspace_id;
  const row = (name: string) => `[data-side-file][data-kind="workspace_file"][data-id=${JSON.stringify(`${workspaceId}:${name}`)}]`;
  const readBack = async (ref: unknown) => (await web.post<{ text: string }>(`${prefix}/api/materials/read`, { ref, mode: "text" })).text;
  const key = async (name: string, code: number) => { for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: name, code: name, windowsVirtualKeyCode: code }, sessionId); };
  // Select `words` inside the n-th window block, as a drag would.
  const select = (words: string, block = 0) => evaluate(`(() => { const pre = document.querySelectorAll('[data-side-materials-window]')[${block}], node = pre.firstChild, at = node.data.indexOf(${JSON.stringify(words)});
    const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + ${words.length}); getSelection().removeAllRanges(); getSelection().addRange(range); })()`);
  const held = () => evaluate<string>("document.querySelector('[data-side-materials-held]:not([hidden]) span')?.textContent ?? ''");

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/" }, sessionId));
  await evaluate("window.__handed = []; document.addEventListener('molis:assistant-open', event => window.__handed.push(event.detail))");
  await click("[data-side-tabs] [data-side-tab][aria-selected=true]");
  await click("[data-side-tab=files]");
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(row("notes.txt"))}))`, 15_000);
  await click(row("notes.txt"));
  await waitFor("!document.querySelector('[data-side-materials-tools]').hidden && document.querySelector('[data-side-materials-window]')?.textContent === " + JSON.stringify(notes));
  assert.equal(await evaluate("document.querySelector('[data-side-materials=\"pin\"]').disabled"), false, "a whole file can be fixed as a snapshot");

  // A dragged selection: exactly those words, labelled by the line they are on.
  await select("要引用的话");
  await click('[data-side-materials="quote"]');
  await waitFor("(document.querySelector('[data-side-materials-held]:not([hidden]) span')?.textContent ?? '').includes('第 3 行')");
  await click('[data-side-materials="add"]');
  await waitFor("window.__handed.length === 1");
  const quoted = await evaluate<{ source: { surface: string }; materials: { title: string; ref: { pin: { mode: string } } }[] }>("window.__handed[0]");
  assert.equal(quoted.source.surface, "materials");
  assert.equal(quoted.materials[0]!.ref.pin.mode, "snapshot", "a quote goes in as the version the service fixed");
  assert.equal(quoted.materials[0]!.title, "notes.txt · 第 3 行");
  assert.equal(await readBack(quoted.materials[0]!.ref), "要引用的话", "the quote reads back as exactly the selected words");
  await waitFor("(document.querySelector('[data-assistant-context-strip]:not([hidden]) .assistant-strip-row')?.textContent ?? '').includes('notes.txt · 第 3 行')", 10_000);

  // No selection: the passages are listed; arrow keys and Enter choose one.
  await evaluate("getSelection().removeAllRanges()");
  await click('[data-side-materials="drop"]');
  assert.equal(await held(), "", "dropping what is held");
  await click('[data-side-materials="quote"]');
  await waitFor("document.activeElement?.matches('[data-side-materials-passages]') && document.querySelectorAll('[data-side-materials-passages] [role=option]').length === 3");
  await key("ArrowDown", 40); await key("ArrowDown", 40);
  assert.equal(await evaluate("document.querySelector('[data-side-materials-passages] [aria-selected=true]').textContent"), "第三段：结论");
  await key("Enter", 13);
  await waitFor("!document.querySelector('[data-side-materials-passages]') && (document.querySelector('[data-side-materials-held]:not([hidden]) span')?.textContent ?? '').includes('第 5 行')");
  await click('[data-side-materials="add"]');
  await waitFor("window.__handed.length === 2");
  assert.equal(await readBack(await evaluate("window.__handed[1].materials[0].ref")), "第三段：结论");

  // 固定快照 asks how: only this version, or as Diff's version before or after (one commit with the port; materials-ui-contract §2).
  await click('[data-side-materials="drop"]');
  const menuOpen = "Boolean(document.querySelector('[data-side-materials-menu]')?.matches(':popover-open'))";
  await click('[data-side-materials="pin"]');
  await waitFor(`${menuOpen} && document.activeElement?.dataset.port === '' && document.querySelector('[data-side-materials=pin]').getAttribute('aria-expanded') === 'true'`);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-side-materials-menu] [role=menuitem]')].map(item => item.textContent)"),
    ["只固定这一版", "作为对比前（Diff）", "作为对比后（Diff）"]);
  await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))");
  assert.equal(await evaluate("document.activeElement?.dataset.port"), "before", "arrow keys move through the menu");
  await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor(`!${menuOpen} && document.activeElement?.matches('[data-side-materials=pin]') && document.querySelector('[data-side-materials=pin]').getAttribute('aria-expanded') === 'false'`);
  assert.equal(await held(), "", "closing the menu fixes nothing");
  await click('[data-side-materials="pin"]');
  await click('[data-side-materials-menu] [data-port="before"]');
  await waitFor("(document.querySelector('[data-side-materials-held]:not([hidden]) span')?.textContent ?? '').includes('固定快照 · 对比前')", 10_000);
  await click('[data-side-materials="drop"]');

  // The whole file as it is now; a file changed since it was shown is refused, and nothing is held.
  await writeFile(join(directory, "notes.txt"), notes + "后来加的一行\n");
  await click('[data-side-materials="pin"]');
  await click('[data-side-materials-menu] [data-port=""]');
  await waitFor("(document.querySelector('[data-side-materials-problem]:not([hidden])')?.textContent ?? '').includes('文件已改变')", 10_000);
  assert.equal(await held(), "", "a refused snapshot holds nothing");

  // A long file: read in windows; it cannot be fixed whole, and a selection in the second window is fixed from that window.
  await click('[data-side-files-action="back"]');
  await click(row("long.txt"));
  await waitFor("document.querySelectorAll('[data-side-materials-window]').length === 1 && Boolean(document.querySelector('[data-side-materials=\"next\"]'))", 15_000);
  assert.equal(await evaluate("document.querySelector('[data-side-materials=\"pin\"]').disabled"), true, "a long file is fixed by selection only");
  await click('[data-side-materials="next"]');
  await waitFor("document.querySelectorAll('[data-side-materials-window]').length === 2", 15_000);
  const second = await evaluate<{ offset: number; words: string }>(`(() => { const blocks = document.querySelectorAll('[data-side-materials-window]');
    const before = blocks[0].textContent.length, text = blocks[1].textContent, at = text.indexOf('abc');
    return { offset: before + at, words: text.slice(at, at + 7) }; })()`);
  await evaluate(`(() => { const pre = document.querySelectorAll('[data-side-materials-window]')[1], node = pre.firstChild, at = node.data.indexOf('abc');
    const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + 7); getSelection().removeAllRanges(); getSelection().addRange(range); })()`);
  await click('[data-side-materials="quote"]');
  await waitFor("(document.querySelector('[data-side-materials-held]:not([hidden]) span')?.textContent ?? '').includes('7')");
  await click('[data-side-materials="add"]');
  await waitFor("window.__handed.length === 3");
  const windowed = await readBack(await evaluate("window.__handed[2].materials[0].ref"));
  assert.equal(windowed, long.slice(second.offset, second.offset + 7), "the selection in the second window is the file's own text at that place");
  assert.equal(windowed, second.words);
});
