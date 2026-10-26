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
  // Each timed slice still includes its forced layout, in the original product page and with the same text.
  await evaluate(`window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()}; window.colourParts = ${codeColouringProjection};
    const expected = new Map(); window.matchesColour = (code, text) => {
      if (!expected.has(text)) expected.set(text, JSON.stringify(tokensOf(text, "ts")));
      return JSON.stringify(colourParts(code)) === expected.get(text); };
    window.steps = []; window.sliceCosts = []; const frame = window.requestAnimationFrame.bind(window);
    window.grown = 0; const grow = ${growCodeTokens.toString()};
    window.paint = (() => {
      const requestAnimationFrame = (step) => frame((stamp) => { const start = performance.now(); step(stamp); const painted = performance.now(); window.code?.getBoundingClientRect(); const end = performance.now(); window.steps.push(end - start); window.sliceCosts.push({ js: painted - start, layout: end - painted, total: end - start }); });
      return (${createCodingCodePaint.toString()})(tokensOf, (last, text, language, tokens) => { const next = grow(last, text, language, tokens); window.grown += text.length - (next.starts[next.from] ?? text.length); return next; }, (hint) => hint); })();
    window.block = () => { document.querySelector('#scale')?.remove(); const pre = document.body.appendChild(document.createElement('pre')); pre.id = 'scale'; return pre.appendChild(document.createElement('code')); };`);
  const text = textOf(300_000);
  const first = await evaluate<{ coloured: boolean; reads: boolean; ms: number; spans: number }>(`(() => { window.text = ${JSON.stringify(text)}; window.code = block(); steps.length = 0;
    const start = performance.now(), coloured = paint.paintInto(code, text, 'ts'); return { coloured, reads: code.textContent === text, ms: performance.now() - start, spans:code.querySelectorAll('[class^=tok-]').length }; })()`);
  t.diagnostic("code-scale initial: " + JSON.stringify(first));
  assert.deepEqual([first.coloured, first.reads], [true, true], "past the old 40,000-character cap it is coloured, and reads whole from the start");
  assert.ok(first.ms < 50, `the first slice is a frame's work: ${first.ms} ms`);
  assert.equal(first.spans, 0, "SYS-49: large text reads immediately; the first colouring slice waits for its own frame");
  // Done when the slices end on what colouring it whole gives.
  await waitFor("matchesColour(code, text)", 30_000);
  const steps = await evaluate<number[]>("steps.slice()");
  const slices = await evaluate<Array<{ js: number; layout: number; total: number }>>("sliceCosts.slice()");
  t.diagnostic("code-scale slices: " + JSON.stringify(slices));
  const evidence = reviewEvidenceUrl("visual-ui-experience/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("code-scale-slices.json", evidence), JSON.stringify({ first, steps, slices }, null, 2));
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
