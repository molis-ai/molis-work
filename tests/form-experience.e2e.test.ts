import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openFormStore } from "./fixtures/plugin-home-stores.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
type FormFrame = Awaited<ReturnType<typeof pluginFrameBrowser>>;
const menu = ".form-share-menu";
const summary = `${menu} > summary`;
const htmlItem = `${menu} [data-form-export-fill]`;
const csvItem = `${menu} [data-form-export-csv]`;
const formTitle = "[data-form-title]";
const question = (n: number) => `[data-form-question]:nth-child(${n})`;
const node = (selector: string) => `document.querySelector(${JSON.stringify(selector)})`;
const title = "Workshop follow-up for contributors across the workspace and release team";
const questions = ["Required feedback", "Optional comment", "Workshop focus"];

const keys = { Tab: 9, Enter: 13, Escape: 27, " ": 32, ArrowRight: 39 };
const words = {
  zh: { title: "标题", back: "返回问卷列表", up: "上移", down: "下移", remove: "删题", removeOption: "删选项",
    required: "必填", empty: "还有必填题没填", done: "已提交，谢谢", export: "导出" },
  en: { title: "Title", back: "Back to form list", up: "Move up", down: "Move down", remove: "Remove question", removeOption: "Remove option",
    required: "Required", empty: "A required question is still empty", done: "Submitted — thank you", export: "Export" },
};

async function keyboard(b: Browser, key: keyof typeof keys) {
  const event = { key, code: key === " " ? "Space" : key, windowsVirtualKeyCode: keys[key], nativeVirtualKeyCode: keys[key] };
  await b.command("Input.dispatchKeyEvent", key === "Enter"
    ? { ...event, type: "keyDown", text: "\r", unmodifiedText: "\r" }
    : { ...event, type: "rawKeyDown" }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { ...event, type: "keyUp" }, b.sessionId);
}

async function screenshot(b: Browser, name: string) {
  const evidence = process.env.MOLIS_FORM_EXPERIENCE_EVIDENCE;
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  const { data } = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
  await writeFile(join(evidence, name + ".png"), Buffer.from(data, "base64"));
}

// Keep Chrome's real download path and read the bytes it actually saved. Use GUIDs because the same files are exported at every width.
async function downloads(t: TestContext, b: Browser) {
  const folder = join(b.homeDirectory, "form-exports");
  await mkdir(folder);
  await b.command("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: folder, eventsEnabled: true });
  const started = new Map<string, string>();
  const finished = new Map<string, string>();
  t.after(b.on("Browser.downloadWillBegin", e => { started.set(String(e.guid), String(e.suggestedFilename)); }));
  t.after(b.on("Browser.downloadProgress", e => { if (e.state !== "inProgress") finished.set(String(e.guid), String(e.state)); }));
  return async (action: () => Promise<void>, extension: string, content: string) => {
    const before = new Set(started.keys());
    await action();
    const deadline = Date.now() + 8000;
    let added: string[];
    do {
      added = [...started.keys()].filter(guid => !before.has(guid));
      if (added.length && added.every(guid => finished.has(guid))) break;
      await new Promise(resolve => setTimeout(resolve, 40));
    } while (Date.now() < deadline);
    assert.equal(added.length, 1, "one activation starts one Chrome download");
    const [guid] = added as [string];
    assert.equal(finished.get(guid), "completed", "Chrome completed the transfer");
    assert.ok(started.get(guid)?.endsWith(extension), started.get(guid));
    assert.ok((await readFile(join(folder, guid), "utf8")).includes(content), `downloaded ${extension} contains ${content}`);
  };
}

async function name(frame: FormFrame, selector: string) {
  const { result } = await frame.frameCommand<{ result: { objectId?: string } }>(
    "Runtime.evaluate", { expression: node(selector), returnByValue: false });
  assert.ok(result.objectId, selector);
  try {
    const { nodes } = await frame.frameCommand<{ nodes: { ignored: boolean; role?: { value: string }; name?: { value: string } }[] }>(
      "Accessibility.getPartialAXTree", { objectId: result.objectId, fetchRelatives: false });
    const control = nodes.find(entry => !entry.ignored);
    return [control?.role?.value, control?.name?.value];
  } finally {
    await frame.frameCommand("Runtime.releaseObject", { objectId: result.objectId });
  }
}

const menuPlacement = `(() => {
  const panel = ${node(`${menu} > .plugin-stage-more-actions`)};
  const bounds = el => {
    const { left, top, right, bottom } = el.getBoundingClientRect();
    return [left, top, right, bottom];
  };
  return { panel: bounds(panel), workspace: bounds(${node("[data-form-stage-workspace]")}),
    trigger: bounds(${node(summary)}), anchored: CSS.supports('right', 'anchor(--form-export right)'),
    items: [...panel.querySelectorAll('button')].map(button => {
      const { left, right, top, bottom } = button.getBoundingClientRect();
      const y = (top + bottom) / 2;
      const label = document.createRange(); label.selectNodeContents(button);
      return { text: button.innerText, bounds: bounds(button),
        labelFits: [...label.getClientRects()].every(rect => rect.left >= left && rect.right <= right && rect.top >= top && rect.bottom <= bottom),
        hits: [left + 3, (left + right) / 2, right - 3].map(x => button.contains(document.elementFromPoint(x, y))) };
    }) };
})()`;

const checkboxPaint = `(() => {
  const context = document.createElement('canvas').getContext('2d');
  const luminance = color => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    return [0.2126, 0.7152, 0.0722].reduce((sum, weight, i) => {
      const channel = pixel[i] / 255;
      return sum + weight * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    }, 0);
  };
  const contrast = (a, b) => {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  return [...document.querySelectorAll('[data-question-required]')].slice(0, 2).map(input => {
    const box = getComputedStyle(input), mark = getComputedStyle(input, '::after');
    const rect = input.getBoundingClientRect();
    return { checked: input.checked, visible: input === document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
      mark: mark.content !== 'none' && parseFloat(mark.borderBottomWidth) > 0,
      contrast: contrast(input.checked ? mark.borderBottomColor : box.borderBottomColor, box.backgroundColor) };
  });
})()`;

const showRequiredStates = `(async () => {
  const pane = ${node("[data-form-pane=editor]")}, bounds = pane.getBoundingClientRect();
  const [first, second] = [...pane.querySelectorAll('[data-question-required]')].map(input => input.getBoundingClientRect());
  // At phone width each row is tall. Put the two states together in the visible part of the scroller.
  pane.scrollTo({ top: pane.scrollTop + (first.top + second.bottom - bounds.top - bounds.bottom) / 2, behavior: 'instant' });
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
})()`;

test("Form: author, fill and export through the real Host in both languages and themes", { timeout: 240_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  const frame = await pluginFrameBrowser(t, b, "form");
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = b;
  const { click, evaluate, waitFor } = frame;
  const read = <T>(operation: (store: ReturnType<typeof openFormStore>) => T): T => {
    const store = openFormStore(homeDirectory);
    try { return operation(store); }
    finally { store.close(); }
  };
  const press = (key: keyof typeof keys) => keyboard(b, key);
  const focus = (selector: string) => evaluate(`${node(selector)}.focus()`);
  const focused = (selector: string) => waitFor(`document.activeElement === ${node(selector)}`);
  const type = (text: string) => command("Input.insertText", { text }, sessionId);
  const input = async (selector: string, text: string) => {
    await click(selector);
    await evaluate(`${node(selector)}.select()`);
    await type(text);
  };
  const idle = () => waitFor(`${node("[data-form=workbench]")}.getAttribute('aria-busy') === 'false'`);
  const saved = () => waitFor(`['已保存','Saved'].includes(${node("[data-form-editor-status]")}.textContent)`);
  const open = async (id?: string) => {
    const url = `${origin}/projects/${projectId}/?openPlugin=form${id ? "&openRecord=" + encodeURIComponent(id) : ""}`;
    await navigate(() => command("Page.navigate", { url }, sessionId));
    await b.waitFor("document.body.dataset.desktopSurface === 'form'");
    await frame.clientReady();
    if (id) await waitFor(`${node(formTitle)}.value === ${JSON.stringify(title)}`);
  };
  const file = await downloads(t, b);
  await b.setViewport(1440, 900);
  await open();
  await click("[data-form-new]"); await idle();
  await input(formTitle, title);
  for (const [i, text] of questions.entries()) {
    await click(`[data-form-add-question=${i === 2 ? "singleChoice" : "text"}]`);
    await input(`${question(i + 1)} [data-question-title]`, text);
  }
  await input(`${question(3)} .form-option-row:nth-child(1) [data-option-label]`, "Design");
  await input(`${question(3)} .form-option-row:nth-child(2) [data-option-label]`, "Reliability");
  for (const n of [1, 3]) await click(`${question(n)} [data-question-required]`);
  await saved();
  await click("[data-form-publish]"); await idle();
  const record = read(store => store.list(projectId!)[0]!);
  assert.equal(record.status, "published");
  assert.equal(record.title, title);
  assert.deepEqual(record.questions.map(q => [q.title, q.required]), questions.map((q, i) => [q, i !== 1]));
  const [first, optional, choice] = record.questions;
  assert.ok(first && optional && choice);
  const stored = () => read(store => store.get(record.id, projectId!));
  const answers = () => read(store => store.listSubmissions(record.id, projectId!));

  for (const [locale, expected] of Object.entries(words)) {
    await command("Network.setCookie", { name: "molis_work_locale", value: locale, url: origin }, sessionId);
    await open(record.id);
    for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
      await b.setViewport(width, height);
      for (const theme of ["light", "dark"]) {
        const variant = `${width}-${locale}-${theme}`;
        await b.evaluate(`localStorage.setItem('molis-work:theme','${theme}'); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${theme}'}))`);
        await waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
        await t.test(`B27-FORM-03 · named controls and keyboard editing · ${variant}`, async () => {
          for (const [selector, role, label] of [
            [formTitle, "textbox", expected.title], ["[data-form-back]", "button", expected.back],
            [`${question(1)} [data-question-move="-1"]`, "button", expected.up],
            [`${question(1)} [data-question-move="1"]`, "button", expected.down],
            [`${question(1)} [data-question-remove]`, "button", expected.remove],
            [`${question(3)} [data-option-remove]`, "button", expected.removeOption],
            [`${question(1)} [data-question-required]`, "checkbox", expected.required],
          ] as const) assert.deepEqual(await name(frame, selector), [role, label], selector);
          await focus(".plugin-stage-more:not(.form-share-menu) > summary");
          await press("Tab"); await focused(formTitle);
          await focus(`${question(3)} [data-option-label]`);
          await press("Tab"); await focused(`${question(3)} [data-option-remove]`);
          await focus(`${question(1)} [data-question-required]`);
          await press("Tab"); await focused(`${question(1)} [data-question-move="-1"]`);
          await press("Tab"); await focused(`${question(1)} [data-question-move="1"]`);
          await press("Tab"); await focused(`${question(1)} [data-question-remove]`);
          await focus(`${question(1)} [data-question-move="1"]`); await press("Enter");
          await focused(`${question(2)} [data-question-move="1"]`);
          await saved(); assert.equal(stored().questions[1]?.id, first.id);
          await focus(`${question(2)} [data-question-required]`);
          await press("Tab"); await focused(`${question(2)} [data-question-move="-1"]`); await press("Enter");
          await saved(); assert.equal(stored().questions[0]?.id, first.id);
        });
        const response = `Keyboard response ${variant}`;
        await t.test(`B27-FORM-02 · contrast, required state and owner responses · ${variant}`, async () => {
          const required = `${question(1)} [data-question-required]`;
          await evaluate(showRequiredStates);
          await screenshot(b, `checkboxes-${variant}`);
          const paint = await evaluate<{ checked: boolean; visible: boolean; mark: boolean; contrast: number }[]>(checkboxPaint);
          await focus(required);
          await press(" "); await saved(); assert.equal(stored().questions[0]?.required, false);
          await press(" "); await saved(); assert.equal(stored().questions[0]?.required, true);
          const count = answers().length;
          const fill = "[data-form-fill]";
          await focus(fill); await press("Enter");
          await focused(`.form-fill-page input[data-answer-id="${first.id}"]`);
          await press("Enter");
          await waitFor(`${node(".form-fill-error")}.textContent.startsWith(${JSON.stringify(expected.empty)})`);
          assert.match(await evaluate<string>(`${node(".form-fill-error")}.textContent`), /Required feedback/);
          assert.equal(answers().length, count, "empty answer did not reach the owner");
          await type(response);
          await press("Tab"); await focused(`.form-fill-page input[data-answer-id="${optional.id}"]`);
          await press("Tab"); await focused(`.form-fill-page [data-answer-id="${choice.id}"] input[value="Design"]`);
          await press("ArrowRight"); await focused(`.form-fill-page [data-answer-id="${choice.id}"] input[value="Reliability"]`);
          await press("Tab"); await press("Tab"); await focused(".form-fill-page button[type=submit]");
          await press("Enter");
          await waitFor(`${node(".form-fill-sheet h1")}.textContent === ${JSON.stringify(expected.done)}`);
          assert.equal(answers().length, count + 1);
          const entry = answers().find(answer => answer.answers[first.id] === response);
          assert.ok(entry);
          assert.equal(entry.source, "fill");
          assert.equal(entry.answers[choice.id], "Reliability");
          assert.equal(entry.answers[optional.id] ?? "", "");
          await press("Escape");
          await click("[data-form-tab=results]");
          await waitFor(`${node("[data-form-result-list]")}.textContent.includes(${JSON.stringify(response)})`);
          await click("[data-form-tab=editor]"); await idle();
          assert.deepEqual(paint.map(({ checked, visible, mark }) => [checked, visible, mark]), [[true, true, true], [false, true, false]]);
          assert.ok(paint.every(state => state.contrast >= 3), `visible tick and empty border need 3:1 contrast: ${JSON.stringify(paint)}`);
        });
        await t.test(`B27-FORM-01 · both export actions are reachable and download · ${variant}`, async () => {
          const pane = node("[data-form-pane=editor]");
          await evaluate(`${pane}.scrollTop = ${pane}.scrollHeight`);
          await focus("[data-form-fill]"); await press("Tab"); await focused(summary);
          assert.equal((await name(frame, summary))[1], expected.export);
          await press("Enter"); await press("Tab"); await focused(htmlItem);
          await press("Escape"); await focused(summary);
          assert.equal(await evaluate(`${node(menu)}.open`), false);
          await press("Enter"); await press("Tab"); await focused(htmlItem);
          await file(() => press("Enter"), ".html", questions[0]!);
          await focus(summary); await press("Enter"); await press("Tab"); await press("Tab"); await focused(csvItem);
          await file(() => press("Enter"), ".csv", response);
          await click(summary);
          await waitFor(`${node(menu)}.open`);
          const placement = await evaluate<{ panel: number[]; workspace: number[]; trigger: number[]; anchored: boolean;
            items: { text: string; labelFits: boolean; hits: boolean[] }[] }>(menuPlacement);
          await screenshot(b, `export-${variant}`);
          await click("[data-form-editor-status]");
          assert.equal(await evaluate(`${node(menu)}.open`), false, "outside press closes the disclosure");
          const [left, top, right, bottom] = placement.panel;
          const [minX, minY, maxX, maxY] = placement.workspace;
          assert.ok(left! >= minX! - 1 && right! <= maxX! + 1 && top! >= minY! - 1 && bottom! <= maxY! + 1, JSON.stringify(placement));
          const [triggerLeft, , triggerRight, triggerBottom] = placement.trigger;
          if (placement.anchored) assert.ok(left! <= triggerRight! && right! >= triggerLeft! && top! >= triggerBottom!, JSON.stringify(placement));
          assert.equal(placement.items.length, 2);
          assert.ok(placement.items.every(item => item.labelFits && item.hits.every(Boolean)), JSON.stringify(placement));
          await click(summary); await file(() => click(htmlItem), ".html", title);
          await click(summary); await file(() => click(csvItem), ".csv", response);
        });
      }
    }
  }
});
