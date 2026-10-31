import assert from "node:assert/strict";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCodingCodePaint } from "@molis-ai/molis-work-plugin-coding";
import { codeTokens, growCodeTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assistantTextModel } from "./fixtures/assistant-text-model.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { codeColouringProjection } from "./fixtures/code-colouring.js";
import { assistantTextHtml } from "@molis-ai/molis-work-app-workbench";

// specs/visual-ui-experience VUX-33 and VUX-36 (§code-diff): a large block reads at once, and each slice
// limits both DOM work and its inline layout. The tokenizer stays shared; no Worker owns another rendering path. Measured first: on a product page a 180,000-character block took 13 s to
// put in, because the shared roving focus looked through the block's parent once for every text piece added; it is now
// linear. A slice job takes a growing text, starts over for a changed one, and stops when its block leaves the page.

const LINE = (index: number) => index % 7 === 0 ? `/** step ${index}: a note */` : `  const value${index} = compute(${index}, "text-${index}"); // ${index}`;
const textOf = (size: number) => { let text = "", index = 0; while (text.length < size) text += LINE(index++) + "\n"; return text; };
const FIRST_LAYOUT_MS = 150;
const WHOLE = `(text) => { const code = document.createElement('code'); for (const [kind, value] of tokensOf(text, 'ts')) { if (!kind) code.append(value); else { const span = document.createElement('span'); span.className = 'tok-' + kind; span.textContent = value; code.append(span); } } return code.innerHTML; }`;

test("VUX-36: putting a large coloured block into a product page costs in step with its size", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("typeof window.molisStreamText === 'function' && document.readyState === 'complete'", 20_000);
  await evaluate(`window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()};`);
  const put = (size: number) => evaluate<number>(`(() => { const text = ${JSON.stringify(textOf(size))};
    const nodes = tokensOf(text, 'ts').map(([kind, value]) => { if (!kind) return document.createTextNode(value); const span = document.createElement('span'); span.className = 'tok-' + kind; span.textContent = value; return span; });
    document.querySelector('#scale')?.remove(); const pre = document.body.appendChild(document.createElement('pre')); pre.id = 'scale'; const code = pre.appendChild(document.createElement('code'));
    return new Promise((resolve) => { const start = performance.now(); for (let at = 0; at < nodes.length; at += 4096) code.append(...nodes.slice(at, at + 4096)); code.offsetHeight;
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(Math.round(performance.now() - start)))); }); })()`);
  const small = await put(60_000), large = await put(180_000);
  // Linear is three times the small block; looking through the parent per piece was nine (1.6 s and 13.4 s here).
  assert.ok(large < 1_500 && large < Math.max(small, 40) * 6, `60,000 characters: ${small} ms; 180,000: ${large} ms`);
  const evidence = reviewEvidenceUrl("visual-ui-experience/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("code-scale-cost.json", evidence), JSON.stringify({ small, large }, null, 2));
});

test("SYS-49/VUX-33: a large block reads at once and is coloured a slice a frame, to exactly the whole colouring", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("document.readyState === 'complete'");
  // SYS-49: scope the timer to the painter's callbacks; catalog animations keep the native scheduler.
  // Each timed slice still includes its forced layout and the page's observers of what it put in, in the original product page and with the same text.
  // The block's first layout is measured on its own (user 2026-10-29, T-281): putting 300,000 characters in and laying them out once is
  // what reading at once costs, and no colouring shares that frame.
  await evaluate(`window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()}; window.colourParts = ${codeColouringProjection};
    const expected = new Map(); window.matchesColour = (code, text) => {
      if (!expected.has(text)) expected.set(text, JSON.stringify(tokensOf(text, "ts")));
      return JSON.stringify(colourParts(code)) === expected.get(text); };
    window.steps = []; window.stamps = []; window.sliceCosts = []; const frame = window.requestAnimationFrame.bind(window); window.nativeFrame = frame;
    window.grown = 0; const grow = ${growCodeTokens.toString()};
    window.paint = (() => {
      const requestAnimationFrame = (step) => frame((stamp) => { const start = performance.now(); step(stamp); const painted = performance.now(); window.code?.getBoundingClientRect(); const laid = performance.now();
        queueMicrotask(() => { const end = performance.now(); window.stamps.push(stamp); window.steps.push(end - start); window.sliceCosts.push({ js: painted - start, layout: laid - painted, observers: end - laid, total: end - start }); }); });
      return (${createCodingCodePaint.toString()})(tokensOf, (last, text, language, tokens) => { const next = grow(last, text, language, tokens); window.grown += text.length - (next.starts[next.from] ?? text.length); return next; }, (hint) => hint); })();
    window.block = () => { document.querySelector('#scale')?.remove(); const pre = document.body.appendChild(document.createElement('pre')); pre.id = 'scale'; return pre.appendChild(document.createElement('code')); };`);
  const text = textOf(300_000);
  const first = await evaluate<{ coloured: boolean; reads: boolean; ms: number; laidOut: number; spans: number; frame: number }>(`(async () => { window.text = ${JSON.stringify(text)}; window.code = block(); steps.length = 0; stamps.length = 0;
    const start = performance.now(), coloured = paint.paintInto(code, text, 'ts'), ms = performance.now() - start, spans = code.querySelectorAll('[class^=tok-]').length;
    const firstFrame = new Promise((resolve) => nativeFrame(resolve)); await Promise.resolve(); code.getBoundingClientRect();
    return { coloured, reads: code.textContent === text, ms, laidOut: performance.now() - start, spans, frame: await firstFrame }; })()`);
  t.diagnostic("code-scale initial: " + JSON.stringify(first));
  assert.deepEqual([first.coloured, first.reads], [true, true], "past the old 40,000-character cap it is coloured, and reads whole from the start");
  assert.ok(first.ms < 50, `putting the text in is a frame's work: ${first.ms} ms`);
  assert.equal(first.spans, 0, "SYS-49: large text reads immediately; the first colouring slice waits for its own frame");
  // RAC-2071: the first layout of the whole text (put in, the page's observers, laid out once; no idle time) has its own bound. Measured
  // (T-281, Chrome on an Apple-silicon dev machine): 16–20 ms; 55–57 ms at 4× CPU throttling, 74–95 ms at 6×. CI's Linux runners run the
  // colouring frames 4–5 times slower than here, so about 55–75 ms there; 150 ms leaves twice that. A block put in or laid out in a way that
  // grows faster than its size passes it many times over.
  // If this goes red once on a machine throttled 6×, look at GC before the product: the 6× first layout is 74–95 ms here, and a MajorGC
  // seen once in the probes took about 60 ms, which gets close to 150 ms. The bound is not to be raised for that (T-281 二审 建议 5).
  assert.ok(first.laidOut < FIRST_LAYOUT_MS, `putting the whole text in and laying it out once: ${first.laidOut.toFixed(1)} ms`);
  // Done when the slices end on what colouring it whole gives.
  await waitFor("matchesColour(code, text)", 30_000);
  const steps = await evaluate<number[]>("steps.slice()");
  const slices = await evaluate<Array<{ js: number; layout: number; observers: number; total: number }>>("sliceCosts.slice()");
  // RAC-2070: the frame that lays the whole text out first carries no colouring; the first slice comes in a later frame.
  assert.ok((await evaluate<number[]>("stamps.slice()"))[0]! > first.frame, "SYS-49: no colouring slice shares the frame that first lays the block out");
  t.diagnostic("code-scale slices: " + JSON.stringify(slices));
  const evidence = reviewEvidenceUrl("visual-ui-experience/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("code-scale-slices.json", evidence), JSON.stringify({ first, steps, slices }, null, 2));
  // RAC-2072: every colouring frame, with its forced layout and the observers of what it put in, stays a frame's work.
  assert.ok(steps.length >= 15 && Math.max(...steps) < 50, `${steps.length} frames, the longest ${Math.max(...steps).toFixed(1)} ms`);

  // Growing while it is coloured: the job takes the longer text and goes on; nothing starts over.
  await evaluate("window.code = block(); window.grown = 0; paint.paintInto(code, text, 'ts')");
  await waitFor("grown >= 32000");
  await evaluate("window.longer = text + text.slice(0, 50000); paint.paintInto(code, longer, 'ts')");
  assert.equal(await evaluate<boolean>("code.textContent === longer"), true, "the longer text reads at once");
  await waitFor("matchesColour(code, longer)", 30_000);
  const coloured = await evaluate<number>("grown");
  assert.ok(coloured < 350_000 * 1.05, `the growth went on from where the slices were: ${coloured} characters coloured for 350,000`);

  // A text changed in what is already coloured starts the slices over, from that text.
  await evaluate("window.code = block(); paint.paintInto(code, text, 'ts')");
  await waitFor("code.querySelectorAll('[class^=tok-]').length > 100");
  await evaluate("window.changed = '/* opened' + text; paint.paintInto(code, changed, 'ts')");
  await waitFor("matchesColour(code, changed)", 30_000);

  // A block that leaves the page is not coloured any further.
  await evaluate("window.code = block(); window.grown = 0; paint.paintInto(code, text, 'ts')");
  await waitFor("grown > 0");
  const left = await evaluate<number>("document.querySelector('#scale').remove(), grown");
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.ok(await evaluate<number>("grown") <= left + 17_000, "the slices stop with the block gone");
  // Past the new cap the block stays text.
  assert.equal(await evaluate<boolean>(`(() => { const code = block(), big = text + text; code.textContent = big; return paint.paintInto(code, big, 'ts') === false && code.childNodes.length === 1; })()`), true);
  assert.equal(await evaluate<boolean>(`(() => { const code = block(); return paint.paintInto(code, 'const value = 1;', 'ts') && !!code.querySelector('.tok-keyword'); })()`), true, "small blocks still colour synchronously");
});

test("VUX-33: Coding reopens a turn with a large code block as text at once and coloured whole", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "coding");
  let active: Pick<typeof browser,"evaluate"|"waitFor"|"click"> = browser;
  const evaluate: typeof browser.evaluate = (...args) => active.evaluate(...args);
  const waitFor: typeof browser.waitFor = (...args) => active.waitFor(...args);
  const click: typeof browser.click = (...args) => active.click(...args);
  const code = textOf(90_000).replace(/\n$/, "");
  const model = await assistantTextModel(t, homeDirectory, "下面是代码：\n\n```ts\n" + code + "\n```\n\n写完了。", { pieces: 4, pause: 100 });
  const workspace = join(homeDirectory, "code-scale");
  await mkdir(workspace, { recursive: true }); await writeFile(join(workspace, "note.txt"), "x\n");
  const fill = (selector: string, value: string) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click(".navigator-project-settings");
  await waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await fill("[data-project-workspaces-add] [name=path]", workspace);
  await click("[data-project-workspaces-add] [type=submit]");
  await waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('code-scale')");
  const coding = "[data-coding-workbench]";
  await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
  active = child;
  await click(`${coding} [data-coding-new]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-task]').disabled && document.querySelector('${coding} [data-coding-model]').options.length >= 1`);
  await fill(`${coding} [data-coding-model]`, JSON.stringify(["local-only", "fixture-model"]));
  await fill(`${coding} [data-coding-intent]`, "discuss");
  await fill(`${coding} [data-coding-task]`, "写一大段代码");
  await waitFor(`!document.querySelector('${coding} [data-coding-send]').disabled`);
  await click(`${coding} [data-coding-send]`);
  await waitFor(`[...document.querySelectorAll('${coding} [data-coding-turns] [data-kind="assistant"]')].some(node => node.textContent.includes('第一段'))`, 60_000);
  model.finish();
  await waitFor(`[...document.querySelectorAll('${coding} [data-coding-turns] [data-kind="assistant"]')].some(node => node.textContent.includes('写完了'))`, 60_000);
  const session = await evaluate<string>(`document.querySelector('${coding} [data-coding-session][aria-current=true]').dataset.codingSession`);
  // Reopened: the turn is read back from history and its block coloured afresh.
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor(`document.querySelector('${coding} [data-coding-session="${session}"]')`, 30_000);
  if (!await evaluate<boolean>(`document.querySelector('${coding} [data-coding-session="${session}"]').getAttribute('aria-current') === 'true'`)) await click(`${coding} [data-coding-session="${session}"]`);
  const block = `document.querySelector('${coding} [data-coding-turns] [data-kind="assistant"] pre[data-enriched] code')`;
  await waitFor(`${block}?.textContent.includes('value100 ')`, 60_000);
  assert.equal((await evaluate<string>(`${block}.textContent`)).replace(/\n$/, ""), code, "the reopened block reads the whole code");
  // And is coloured exactly as colouring it whole gives, past the old cap.
  await evaluate(`window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()}; window.colourParts = ${codeColouringProjection}; window.want = JSON.stringify(tokensOf(${block}.textContent, "ts"))`);
  await waitFor(`JSON.stringify(colourParts(${block})) === want`, 30_000);
});

test("VUX-33: the Assistant sends a large block as its text and a map of its pieces, a small one coloured", () => {
  const large = assistantTextHtml("```ts\n" + textOf(90_000) + "```", [], (text) => text), small = assistantTextHtml("```ts\n" + textOf(9_000) + "```", [], (text) => text);
  assert.match(large, /data-paint="[a-z ]+\|[0-9a-z.-]+"/);
  assert.equal(/<span class="tok-/.test(large), false, "no coloured markup goes out for the large block");
  assert.match(small, /<span class="tok-keyword">/); assert.equal(small.includes("data-paint"), false);
});

test("VUX-33: the Assistant's large block streams in place, reopens as text at once and is coloured a slice a frame to the whole colouring", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const code = textOf(90_000).replace(/\n$/, "");
  const model = await assistantTextModel(t, homeDirectory, "下面是代码：\n\n```ts\n" + code + "\n```\n\n写完了。", { pieces: 8, pause: 300 });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-assistant-input]");
  await command("Input.insertText", { text: "写一大段代码" }, sessionId);
  await click("[data-assistant-send]");
  await waitFor("document.querySelector('.assistant-msg--assistant .assistant-rich strong')?.textContent === '第一段'", 30_000);
  model.finish();
  const figure = "document.querySelector('.assistant-msg--assistant .assistant-code')";
  await waitFor(`${figure}?.querySelector('code .tok-keyword')`, 30_000);
  await evaluate(`window.block = ${figure}; window.piece = window.block.querySelector('code').firstChild`);
  await waitFor("document.querySelector('.assistant-msg--assistant .assistant-rich')?.textContent.includes('写完了')", 60_000);
  await evaluate(`window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()}; window.want = (${WHOLE})(${JSON.stringify(code)})`);
  await waitFor(`${figure}.querySelector('code').innerHTML === want`, 30_000);
  const written = await evaluate<{ same: boolean; piece: boolean; code: string }>(`(() => { const block = ${figure};
    return { same: block === window.block, piece: block.querySelector('code').firstChild === window.piece, code: block.dataset.code }; })()`);
  assert.deepEqual([written.same, written.piece], [true, true], "past a slice the block is still the same figure, with the same first piece, from its first lines to its last");
  assert.equal(written.code, code, "copy gives the code as written");
  await waitFor(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/works`)}).then(r=>r.json()).then(b=>b.works[0]?.state==='completed')`, 30_000);

  // Reopened: each frame, before the page's own work, notes how much of the block reads and how much is coloured.
  const { identifier } = await command<{ identifier: string }>("Page.addScriptToEvaluateOnNewDocument", { source: `window.samples = []; const tick = () => {
    const code = document.querySelector('.assistant-msg--assistant .assistant-code code');
    if (code) samples.push([performance.now(), code.textContent.length, code.querySelectorAll('[class^="tok-"]').length]);
    if (samples.length < 3000) requestAnimationFrame(tick); }; requestAnimationFrame(tick);` }, sessionId);
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor(`${figure}?.querySelector('code')`, 30_000);
  await evaluate(`window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()}; window.want = (${WHOLE})(${JSON.stringify(code)})`);
  await waitFor(`${figure}.querySelector('code').innerHTML === want`, 30_000);
  await command("Page.removeScriptToEvaluateOnNewDocument", { identifier }, sessionId);
  const samples = await evaluate<Array<[number, number, number]>>("samples.slice()");
  const total = await evaluate<number>(`${figure}.querySelectorAll('code [class^="tok-"]').length`);
  const painting = samples.filter(([, , spans]) => spans < total);
  assert.ok(painting.length >= 3, `coloured over ${painting.length} frames`);
  assert.ok(painting.every(([, length]) => length === code.length), "every frame while it is coloured reads the whole code");
  assert.ok(painting.every(([, , spans], index) => !index || spans > painting[index - 1]![2]), "each frame colours more of it");
  const gaps = painting.slice(1).map(([at], index) => at - painting[index]![0]), longest = Math.max(0, ...gaps);
  assert.ok(longest < 100, `the longest frame while it is coloured: ${longest.toFixed(1)} ms`);
  const evidence = reviewEvidenceUrl("visual-ui-experience/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("assistant-code-scale.json", evidence), JSON.stringify({ characters: code.length, frames: painting.length, longest: Math.round(longest) }, null, 2));
});

// RAC-2422/RAC-2423: T-281's ResizeObserver makes a large block wait for its first layout, so a block that has none yet is not coloured.
// Two layout situations it changes, measured in the product page: attached inside a display:none subtree (coloured after it is shown), and
// inside a content-visibility:auto subtree the browser skips until it is scrolled near (coloured then). Both keep SYS-49's per-frame bound:
// every colouring frame, with its forced layout and the page's observers of what it put in, stays a frame's work (50 ms).
const OBSERVER_SETUP = `window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()}; window.colourParts = ${codeColouringProjection};
  const expected = new Map(); window.matchesColour = (code, text) => {
    if (!expected.has(text)) expected.set(text, JSON.stringify(tokensOf(text, "ts")));
    return JSON.stringify(colourParts(code)) === expected.get(text); };
  window.steps = []; window.stamps = []; window.sliceCosts = []; const frame = window.requestAnimationFrame.bind(window); window.nativeFrame = frame;
  window.grown = 0; const grow = ${growCodeTokens.toString()};
  window.paint = (() => {
    const requestAnimationFrame = (step) => frame((stamp) => { const start = performance.now(); step(stamp); const painted = performance.now(); window.code?.getBoundingClientRect(); const laid = performance.now();
      queueMicrotask(() => { const end = performance.now(); window.stamps.push(stamp); window.steps.push(end - start); window.sliceCosts.push({ js: painted - start, layout: laid - painted, observers: end - laid, total: end - start }); }); });
    return (${createCodingCodePaint.toString()})(tokensOf, (last, text, language, tokens) => { const next = grow(last, text, language, tokens); window.grown += text.length - (next.starts[next.from] ?? text.length); return next; }, (hint) => hint); })();
  window.makeBlock = (host, styles = {}) => { document.querySelector('#scale')?.remove(); const pre = host.appendChild(document.createElement('pre')); pre.id = 'scale'; Object.assign(pre.style, styles); const code = pre.appendChild(document.createElement('code')); window.code = code; return code; };
  window.waitFrames = (count) => new Promise((resolve) => { let left = count; const tick = () => (--left <= 0 ? resolve() : nativeFrame(tick)); nativeFrame(tick); });`;

test("SYS-49 RAC-2422: a large block attached while display:none is coloured only after it is shown, a slice a frame", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("document.readyState === 'complete'");
  await evaluate(OBSERVER_SETUP);
  const text = textOf(120_000);
  const hidden = await evaluate<{ started: boolean; coloured: number; frames: number }>(`(async () => {
    window.text = ${JSON.stringify(text)};
    const box = document.body.appendChild(document.createElement('div')); box.id = 'scale-box'; box.style.display = 'none'; window.scaleBox = box;
    const code = makeBlock(box); steps.length = 0;
    const started = paint.paintInto(code, text, 'ts'); await waitFrames(5);
    return { started, coloured: code.querySelectorAll('[class^=tok-]').length, frames: steps.length }; })()`);
  t.diagnostic("RAC-2422 hidden: " + JSON.stringify(hidden));
  assert.equal(hidden.started, true, "the job starts while the block is attached but display:none");
  assert.equal(hidden.coloured, 0, "attached inside display:none: it is not coloured before it has a layout");
  assert.equal(hidden.frames, 0, "no colouring frame runs while it is hidden");
  await evaluate("window.scaleBox.style.display = '';");
  await waitFor("matchesColour(code, text)", 30_000);
  const shown = await evaluate<{ steps: number[]; same: boolean }>("({ steps: steps.slice(), same: code.textContent === text })");
  t.diagnostic("RAC-2422 shown: " + JSON.stringify({ frames: shown.steps.length, longest: Math.max(...shown.steps) }));
  assert.equal(shown.same, true, "shown: it reads whole from the start");
  assert.ok(shown.steps.length >= 8, `shown over ${shown.steps.length} colouring frames`);
  assert.ok(Math.max(...shown.steps) < 50, `each colouring frame after it is shown stays a frame's work: the longest ${Math.max(...shown.steps).toFixed(1)} ms`);
});

test("SYS-49 RAC-2423: a large block in a content-visibility:auto subtree is coloured only once scrolled near, a slice a frame", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("document.readyState === 'complete'");
  await evaluate(OBSERVER_SETUP);
  const text = textOf(120_000);
  const skipped = await evaluate<{ started: boolean; coloured: number; frames: number; top: number; viewport: number }>(`(async () => {
    window.text = ${JSON.stringify(text)};
    const spacer = document.body.appendChild(document.createElement('div')); spacer.style.height = '3000px';
    const section = document.body.appendChild(document.createElement('section')); section.id = 'scale-section';
    section.style.contentVisibility = 'auto'; section.style.containIntrinsicSize = '0 800px'; window.scaleSection = section;
    const code = makeBlock(section); steps.length = 0;
    const started = paint.paintInto(code, text, 'ts'); await waitFrames(5);
    return { started, coloured: code.querySelectorAll('[class^=tok-]').length, frames: steps.length, top: Math.round(section.getBoundingClientRect().top), viewport: innerHeight }; })()`);
  t.diagnostic("RAC-2423 skipped: " + JSON.stringify(skipped));
  assert.equal(skipped.started, true, "the job starts while its subtree is render-skipped");
  assert.ok(skipped.top > skipped.viewport, `the block starts below the viewport: top ${skipped.top}, viewport ${skipped.viewport}`);
  assert.equal(skipped.coloured, 0, "content-visibility:auto off the viewport: it is not coloured before it is scrolled near");
  assert.equal(skipped.frames, 0, "no colouring frame runs while the browser skips the subtree");
  await evaluate("window.scaleSection.scrollIntoView({ block: 'center' });");
  await waitFor("matchesColour(code, text)", 30_000);
  const shown = await evaluate<{ steps: number[]; spans: number; same: boolean }>("({ steps: steps.slice(), spans: code.querySelectorAll('[class^=tok-]').length, same: code.textContent === text })");
  t.diagnostic("RAC-2423 shown: " + JSON.stringify({ frames: shown.steps.length, longest: Math.max(...shown.steps) }));
  assert.equal(shown.same, true, "scrolled near: it reads whole from the start");
  assert.ok(shown.spans > 0, "scrolled near: it is coloured");
  assert.ok(shown.steps.length >= 8, `coloured over ${shown.steps.length} frames after scrolled near`);
  assert.ok(Math.max(...shown.steps) < 50, `each colouring frame after it is scrolled near stays a frame's work: the longest ${Math.max(...shown.steps).toFixed(1)} ms`);
});

// RAC-2729 (T-354) ②: a block that was already laid out and grows past the slice is coloured in the next frame, without asking a layout
// observer; its colouring frames stay a frame's work (the 50 ms bound the other large-block cases use).
test("SYS-49 RAC-2729: a laid-out block grown past the slice colours the next frame without a layout observer", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("document.readyState === 'complete'");
  await evaluate(`window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()}; window.colourParts = ${codeColouringProjection};
    const expected = new Map(); window.matchesColour = (code, text) => {
      if (!expected.has(text)) expected.set(text, JSON.stringify(tokensOf(text, 'ts')));
      return JSON.stringify(colourParts(code)) === expected.get(text); };
    window.observerRefs = []; const Native = window.ResizeObserver;
    window.ResizeObserver = class Tracking extends Native { constructor(changed) { super(changed); observerRefs.push(new WeakRef(this)); } };
    window.frames = []; const nativeFrame = window.requestAnimationFrame.bind(window);
    window.paint = (() => { const requestAnimationFrame = (step) => nativeFrame((stamp) => { const start = performance.now(); step(stamp); window.code?.getBoundingClientRect(); queueMicrotask(() => frames.push(performance.now() - start)); });
      return (${createCodingCodePaint.toString()})(tokensOf, ${growCodeTokens.toString()}, hint => hint); })();
    window.small = ${JSON.stringify("const stable = 1;\nconst value = compute(1);\n")};
    window.big = small + ${JSON.stringify(textOf(60_000))};`);
  const grown = await evaluate<{ observers: number; reads: boolean }>(`(() => {
    const pre = document.body.appendChild(document.createElement('pre')), code = pre.appendChild(document.createElement('code')); window.code = code;
    paint.paintInto(code, small, 'ts'); const before = observerRefs.length; paint.paintInto(code, big, 'ts');
    return { observers: observerRefs.length - before, reads: code.textContent === big }; })()`);
  t.diagnostic("RAC-2729 grown: " + JSON.stringify(grown));
  assert.equal(grown.observers, 0, "a block that was already laid out needs no layout observer for its longer text");
  assert.equal(grown.reads, true, "the longer text reads at once");
  await waitFor("matchesColour(code, big)", 30_000);
  const frames = await evaluate<number[]>("frames.slice()");
  t.diagnostic("RAC-2729 grown frames: " + JSON.stringify({ frames: frames.length, longest: Math.max(...frames) }));
  assert.ok(frames.length >= 2, `coloured over ${frames.length} frames`);
  assert.ok(Math.max(...frames) < 50, `each colouring frame stays a frame's work: the longest ${Math.max(...frames).toFixed(1)} ms`);
});
