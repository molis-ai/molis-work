import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

// W5-10-PGF-01: exercise the public mount/view contract from the host's real bundled editor asset.

async function press(b: Browser, key: string, code: string, windowsVirtualKeyCode: number, modifiers = 0) {
  for (const type of ["keyDown", "keyUp"]) {
    await b.command("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode, modifiers }, b.sessionId);
  }
}

async function fill(b: Browser, selector: string, value: string) {
  await b.evaluate(`(() => {
    const input=document.querySelector(${JSON.stringify(selector)});
    input.focus(); input.value=${JSON.stringify(value)};
    input.dispatchEvent(new InputEvent('input',{bubbles:true}));
  })()`);
}

test("W5-10-PGF-02: find cycles, replaces and undoes through the bundled editor; closing and remounting release its bar", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  // Mount the public editor on Home, where no hidden Pages stage can capture its overlays.
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/` }, b.sessionId));
  assert.equal(await b.evaluate("document.querySelector('[data-pages-stage-workspace],[data-pages=workbench]')===null"), true);
  await b.evaluate(`new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/assets/molis-work-pages-editor.js';
    script.onload=resolve;script.onerror=()=>reject(new Error('Editor asset failed to load'));document.head.append(script);
  })`);
  await b.waitFor("typeof window.MolisWorkPagesEditor?.mount === 'function'");
  await b.evaluate(`(() => {
    const root=document.createElement('div'); root.id='find-editor-fixture'; document.body.append(root);
    window.findEditor=window.MolisWorkPagesEditor.mount(root,{doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'alpha beta alpha gamma alpha'}]}]}});
    findEditor.view.focus();
  })()`);
  const mod = await b.evaluate<number>("/Mac/.test(navigator.platform) ? 4 : 2");
  const query = ".pages-find input[type=search]";
  const replacement = ".pages-find input[type=text]";
  const text = () => b.evaluate<string>("findEditor.view.state.doc.textContent");
  const count = (value: string) => b.waitFor(`document.querySelector('.pages-find-count')?.textContent===${JSON.stringify(value)}`);
  const openFind = async () => {
    await b.evaluate("findEditor.view.focus()");
    await press(b, "f", "KeyF", 70, mod);
    await b.waitFor("document.activeElement===document.querySelector('.pages-find input[type=search]') && !document.querySelector('.pages-find').hidden");
  };
  const undo = async () => {
    await b.evaluate("findEditor.view.focus()");
    await press(b, "z", "KeyZ", 90, mod);
    assert.equal(await text(), "alpha beta alpha gamma alpha");
  };

  await openFind();
  await fill(b, query, "ALPHA");
  await count("1/3");
  assert.equal(await b.evaluate("document.querySelectorAll('#find-editor-fixture .pages-find-hit').length"), 3);
  assert.equal(await b.evaluate("document.querySelectorAll('#find-editor-fixture .pages-find-hit.is-current').length"), 1);
  await press(b, "Enter", "Enter", 13);
  await count("2/3");
  await press(b, "Enter", "Enter", 13, 8);
  await count("1/3");
  await press(b, "Enter", "Enter", 13, 8);
  await count("3/3");
  await press(b, "Enter", "Enter", 13);
  await count("1/3");
  await fill(b, replacement, "delta");
  await b.click(".pages-find button:first-of-type");
  assert.equal(await text(), "delta beta alpha gamma alpha");
  await count("1/2");
  await undo();

  await openFind();
  assert.equal(await b.evaluate("document.querySelector('.pages-find input[type=text]').value"), "delta");
  await b.click(".pages-find button:last-of-type");
  assert.equal(await text(), "delta beta delta gamma delta");
  await count("0");
  assert.equal(await b.evaluate("document.querySelectorAll('#find-editor-fixture .pages-find-hit').length"), 0);
  await undo();

  await openFind();
  await fill(b, replacement, "");
  await press(b, "Enter", "Enter", 13, mod);
  assert.equal(await text(), " beta  gamma ", "an empty replacement deletes each current match once");
  await undo();
  await openFind();
  await press(b, "Escape", "Escape", 27);
  assert.equal(await b.evaluate("document.querySelector('.pages-find').hidden && document.activeElement===findEditor.view.dom"), true);
  await openFind();
  await count("1/3");
  await b.evaluate("window.MolisWorkPagesEditor.destroy(findEditor)");
  assert.equal(await b.evaluate("document.querySelectorAll('.pages-find').length"), 0);
  await b.evaluate(`(() => {
    findEditor=window.MolisWorkPagesEditor.mount(document.querySelector('#find-editor-fixture'),{doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'beta only'}]}]}});
  })()`);
  await openFind();
  assert.equal(await b.evaluate("document.querySelector('.pages-find input[type=search]').value"), "");
  await fill(b, query, "beta");
  await count("1/1");
  assert.equal(await text(), "beta only");
  await b.evaluate("window.MolisWorkPagesEditor.destroy(findEditor);document.querySelector('#find-editor-fixture').remove()");
  assert.equal(await b.evaluate("document.querySelectorAll('.pages-find').length"), 0);
});

test("QA-033: Pages find remains usable under the real workbench tabs and after reload", { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null);
  assert.ok(b?.projectId);
  const { command, sessionId, projectId } = b;
  const frame = await pluginFrameBrowser(t, b, "pages");
  const paragraph = (text: string) => ({ type: "paragraph", attrs: { note: "" }, content: [{ type: "text", text }] });
  const content = [paragraph("Find target at the start"),
    ...Array.from({ length: 54 }, (_, index) => paragraph(`Paragraph ${index + 1} in a long document.`)),
    paragraph("Find target at the end")];
  const store = openPagesStore(b.homeDirectory);
  const record = (() => {
    try { return store.create({ project_id: projectId, title: "Find and replace journey", body: { type: "doc", content } }); }
    finally { store.close(); }
  })();
  const url = `${b.origin}/projects/${projectId}/?openPlugin=pages`;
  const editor = "[data-pages-editor] .ProseMirror";
  const query = ".pages-find input[type=search]";
  const replacement = ".pages-find input[type=text]";
  const one = ".pages-find button:first-of-type";
  const count = (value: string) => frame.waitFor(`document.querySelector('.pages-find-count')?.textContent === ${JSON.stringify(value)}`);
  const shots = new URL("../.impeccable/qa/review/batch27-pages-find/", import.meta.url);
  await mkdir(shots, { recursive: true });
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await b.navigate(() => command("Page.navigate", { url }, sessionId));
  const mod = await b.evaluate<number>("/Mac/.test(navigator.platform) ? 4 : 2");
  const openFind = async () => {
    await press(b, "f", "KeyF", 70, mod);
    await frame.waitFor(`document.activeElement === document.querySelector('${query}') && !document.querySelector('.pages-find').hidden`);
  };
  const closeFind = async () => {
    await press(b, "Escape", "Escape", 27);
    await frame.waitFor(`document.querySelector('.pages-find')?.hidden && document.activeElement === document.querySelector('${editor}')`);
  };
  const openedRecord = () => frame.waitFor(`document.querySelector('${editor}')?.textContent.includes('Paragraph 54')`);
  await frame.click(`button[data-page-id="${record.id}"]`);
  await openedRecord();
  for (const locale of ["zh", "en"]) {
    await command("Network.setCookie", { name: "molis_work_locale", value: locale, url: b.origin, path: "/" }, sessionId);
    for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
      await b.setViewport(width, height);
      for (const theme of ["light", "dark"]) {
        const variant = `${width}-${locale}-${theme}`;
        await t.test(variant, async () => {
          await b.evaluate(`localStorage.setItem('molis-work:theme', '${theme}')`);
          await b.reloadPage();
          await openedRecord();
          assert.equal(await b.evaluate("document.documentElement.dataset.resolvedTheme"), theme);
          await frame.click(`${editor} p:first-of-type`);
          await openFind();
          assert.equal(await frame.evaluate(`document.querySelector('${query}').placeholder`), locale === "en" ? "Find in the text" : "在文中查找");
          await command("Input.insertText", { text: "Find target" }, sessionId);
          await count("1/2");
          await press(b, "Enter", "Enter", 13);
          await count("2/2");
          const point = await frame.point(`${editor} p:nth-of-type(7)`);
          const textTop = `document.querySelector('${editor} p:first-of-type').getBoundingClientRect().top`;
          const beforeScroll = await frame.evaluate<number>(textTop);
          await command("Input.dispatchMouseEvent", { type: "mouseWheel", ...point, deltaX: 0, deltaY: 440 }, sessionId);
          await frame.waitFor(`${textTop} < ${beforeScroll - 80}`);

          const capture = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
          await writeFile(new URL(`${variant}.png`, shots), Buffer.from(capture.data, "base64"));
          const bar = await frame.evaluate<{ left: number; top: number; right: number; bottom: number; controlsHit: boolean }>(`(() => {
            const bar = document.querySelector('.pages-find');
            const {left, top, right, bottom} = bar.getBoundingClientRect();
            const controlsHit = [...bar.querySelectorAll('input,button')].every(control => {
              const box = control.getBoundingClientRect();
              const x = (box.left + box.right) / 2;
              return box.width > 0 && box.height > 0 && [box.top + 2, box.bottom - 2].every(y => control.contains(document.elementFromPoint(x, y)));
            });
            return {left, top, right, bottom, controlsHit};
          })()`);
          assert.ok(bar.controlsHit, "find and replace controls hit throughout the row inside the Pages frame");
          const shell = await b.evaluate<{ belowTabs: boolean; insideFrame: boolean; frameHit: boolean; twoRows: boolean }>(`(() => {
            const frame = document.querySelector('iframe[data-plugin-frame=pages]');
            const bounds = frame.getBoundingClientRect();
            const strip = document.querySelector('[data-titlebar-tabs]').getBoundingClientRect();
            const history = document.querySelector('.workspace-history').getBoundingClientRect();
            const bar = ${JSON.stringify(bar)};
            const x = bounds.left + (bar.left + bar.right) / 2;
            const y = bounds.top + (bar.top + bar.bottom) / 2;
            return {
              belowTabs: bounds.top + bar.top >= strip.bottom,
              insideFrame: bar.left >= 0 && bar.top >= 0 && bar.right <= bounds.width && bar.bottom <= bounds.height,
              frameHit: document.elementFromPoint(x, y) === frame,
              twoRows: strip.top >= history.bottom - 1 && strip.height > 0 && history.height > 0,
            };
          })()`);
          assert.ok(shell.insideFrame && shell.belowTabs && shell.frameHit, JSON.stringify({ shell, bar }));
          if (width === 390) assert.ok(shell.twoRows, "reproduces the workbench's two actual titlebar rows");
          await frame.click(replacement);
          assert.equal(await frame.evaluate(`document.activeElement === document.querySelector('${replacement}')`), true);
          await closeFind();
          await openFind();
          await count("2/2");
          await closeFind();
        });
      }
    }
  }

  // A real replace goes through the same document save as an edit, and the workbench restores it on reload.
  await b.reloadPage();
  await openedRecord();
  await frame.click(`${editor} p:first-of-type`);
  await openFind();
  await command("Input.insertText", { text: "Find target" }, sessionId);
  await count("1/2");
  await frame.click(replacement);
  await command("Input.insertText", { text: "Saved replacement" }, sessionId);
  await frame.click(one);
  await frame.waitFor("document.querySelector('[data-pages-editor-status]')?.dataset.mwState === 'saved'");
  const after = openPagesStore(b.homeDirectory);
  try {
    assert.deepEqual(after.get(record.id, projectId).body.content, [paragraph("Saved replacement at the start"), ...content.slice(1)]);
  } finally { after.close(); }
  await closeFind();
  await b.reloadPage();
  await openedRecord();
  assert.match(await frame.evaluate<string>(`document.querySelector('${editor} p:first-of-type').textContent`), /^Saved replacement at the start$/);
  await frame.click(`${editor} p:first-of-type`);
  await openFind();
  await command("Input.insertText", { text: "Saved replacement" }, sessionId);
  await count("1/1");
  await closeFind();
});
