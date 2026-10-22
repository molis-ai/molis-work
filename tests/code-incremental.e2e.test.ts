import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { codeTokens, growCodeTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assistantTextModel } from "./fixtures/assistant-text-model.js";
import { codeColouringProjection } from "./fixtures/code-colouring.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// specs/visual-ui-experience VUX-33 (§code-diff, incremental feed): a code block being streamed grows where it is. Its owner
// colours it from its last line on (`molisStreamText`'s `grow`), so the block, its copy button and its leading coloured pieces
// stay the same nodes, a fold the person opened stays open, copy gives the code as it now reads, and the page ends on what
// colouring the whole block gives. The cost of the two ways is measured on the same block.

const LINES = Array.from({ length: 1000 }, (_, index) => index % 7 === 0 ? `/** step ${index}: a note */` : `  const value${index} = compute(${index}, "text-${index}"); // ${index}`);

test("VUX-33: a streamed code block grows in place through its owner, and what it costs either way", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("typeof window.molisStreamText === 'function'");
  // The tokenizer and its growth go to the page as source, as Coding's script carries them.
  await evaluate(`window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()}; window.growTokens = ${growCodeTokens.toString()};`);
  const cost = await evaluate<{ updates: number; before: number; after: number; beforeLast: number; afterLast: number; madeBefore: number; madeAfter: number; same: boolean; kept: boolean; grown: number }>(`(() => {
    const lines = ${JSON.stringify(LINES)}, esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const node = ([kind, value]) => { if (!kind) return document.createTextNode(value); const span = document.createElement('span'); span.className = 'tok-' + kind; span.textContent = value; return span; };
    const html = (text) => '<p>intro</p><pre><code class="language-ts">' + esc(text) + '</code></pre>';
    const steps = []; for (let count = 50; count <= lines.length; count += 50) steps.push(lines.slice(0, count).join('\\n'));
    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    // Before: the block is put in whole and coloured whole on every update.
    const whole = document.body.appendChild(document.createElement('div')), before = []; let madeBefore = 0;
    for (const text of steps) {
      const start = performance.now(); window.molisStreamText(whole, html(text));
      const code = whole.querySelector('code'), pieces = tokensOf(code.textContent, 'ts'); code.replaceChildren(...pieces.map(node)); madeBefore += pieces.length;
      whole.offsetHeight; before.push(performance.now() - start);
    }
    // After: the owner grows the block from its last line.
    const grown = document.body.appendChild(document.createElement('div')), after = []; let madeAfter = 0, total = 0, state = null;
    const paint = (code, text) => { const next = growTokens(state && code.childNodes.length === state.pieces.length ? state : null, text, 'ts', tokensOf);
      const fresh = next.pieces.slice(next.from).map(node); [...code.childNodes].slice(next.from).forEach((child) => child.remove()); code.append(...fresh); madeAfter += fresh.length; state = next; };
    const grow = (kept, next) => { if (!kept.matches('pre') || !next.matches('pre')) return false; paint(kept.firstChild, next.textContent); return true; };
    let first = null, firstPiece = null;
    for (const text of steps) {
      const start = performance.now(); const result = window.molisStreamText(grown, html(text), { grow }); total += result.grown;
      const code = grown.querySelector('code'); if (!state) paint(code, code.textContent);
      grown.offsetHeight; after.push(performance.now() - start);
      first ??= grown.querySelector('pre'); firstPiece ??= code.firstChild;
    }
    const same = grown.querySelector('code').innerHTML === whole.querySelector('code').innerHTML;
    const kept = first === grown.querySelector('pre') && firstPiece === grown.querySelector('code').firstChild;
    whole.remove(); grown.remove();
    return { updates: steps.length, before: median(before), after: median(after), beforeLast: before.at(-1), afterLast: after.at(-1), madeBefore, madeAfter, same, kept, grown: total };
  })()`);
  assert.equal(cost.same, true, "growing from the last line ends on what colouring the whole block gives");
  assert.equal(cost.kept, true, "the block and its first coloured piece stayed the same nodes");
  assert.equal(cost.grown, cost.updates - 1, "every update after the first was a growth its owner took");
  assert.ok(cost.madeAfter * 5 < cost.madeBefore, `pieces put in: ${cost.madeAfter} growing, ${cost.madeBefore} whole`);
  const evidence = reviewEvidenceUrl("visual-ui-experience/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("code-grow-cost.json", evidence), JSON.stringify(cost, null, 2));
});

test("VUX-33: the Assistant's streamed code block grows in place, keeps an opened fold and copies what it now reads", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const code = LINES.slice(0, 40).join("\n");
  const model = await assistantTextModel(t, homeDirectory, "下面是代码：\n\n```ts\n" + code + "\n```\n\n写完了。", { pieces: 16, pause: 200 });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-assistant-input]");
  await command("Input.insertText", { text: "写一段代码" }, sessionId);
  await click("[data-assistant-send]");
  await waitFor("document.querySelector('.assistant-msg--assistant .assistant-rich strong')?.textContent === '第一段'", 30_000);
  model.finish();
  const figure = "document.querySelector('.assistant-msg--assistant .assistant-code')";
  await waitFor(`${figure} && ${figure}.querySelector('code .tok-keyword')`, 30_000);
  await evaluate(`window.block = ${figure}; window.piece = window.block.querySelector('code').firstChild`);
  // Past 18 lines the block folds; the person opens it while it is still being written.
  await waitFor(`window.block.hasAttribute('data-folded') && window.block.isConnected`, 30_000);
  assert.equal(await evaluate<boolean>("window.block === document.querySelector('.assistant-msg--assistant .assistant-code')"), true, "the block grew in place");
  await evaluate("window.block.querySelector('.assistant-code-more').click()");
  await waitFor("document.querySelector('.assistant-msg--assistant .assistant-rich')?.textContent.includes('写完了')", 30_000);
  const written = await evaluate<{ same: boolean; piece: boolean; folded: boolean; code: string; copies: number; mores: number; lines: string }>(`(() => { const block = ${figure};
    return { same: block === window.block, piece: block.querySelector('code').firstChild === window.piece, folded: block.hasAttribute('data-folded'), code: block.dataset.code,
      copies: block.querySelectorAll('.assistant-code-copy').length, mores: block.querySelectorAll('.assistant-code-more').length, lines: block.querySelector('.assistant-code-lines').textContent }; })()`);
  assert.equal(written.same, true, "the block is the same node from its first lines to its last");
  assert.equal(written.piece, true, "and so is its first coloured piece");
  assert.equal(written.folded, false, "the fold the person opened stayed open as the block grew");
  assert.equal(written.code, code, "copy gives the code as written");
  assert.deepEqual([written.copies, written.mores], [1, 1], "one copy button and one fold button");
  assert.match(written.lines, /40/);
  await waitFor(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/works`)}).then(r=>r.json()).then(b=>b.works[0]?.state==='completed')`, 30_000);
  const html = await evaluate<string>(`${figure}.querySelector('code').innerHTML`);
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor(`${figure}?.querySelector('code .tok-keyword')`, 30_000);
  assert.equal(await evaluate<string>(`${figure}.querySelector('code').innerHTML`), html, "reopened, the block is coloured exactly as it was while written");
});

test("VUX-33: Coding's streamed code block grows in place, coloured from its last line, and copies what it now reads", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const code = LINES.slice(0, 60).join("\n");
  const model = await assistantTextModel(t, homeDirectory, "下面是代码：\n\n```ts\n" + code + "\n```\n\n写完了。", { pieces: 16, pause: 250 });
  const workspace = join(homeDirectory, "code-grow");
  await mkdir(workspace, { recursive: true });
  await writeFile(join(workspace, "note.txt"), "x\n");
  const fill = (selector: string, value: string) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click(".navigator-project-settings");
  await waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await fill("[data-project-workspaces-add] [name=path]", workspace);
  await click("[data-project-workspaces-add] [type=submit]");
  await waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('code-grow')");
  const coding = "[data-coding-workbench]";
  await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
  await click(`${coding} [data-coding-new]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-task]').disabled && document.querySelector('${coding} [data-coding-model]').options.length >= 1`);
  await fill(`${coding} [data-coding-model]`, JSON.stringify(["local-only", "fixture-model"]));
  await fill(`${coding} [data-coding-intent]`, "discuss");
  await fill(`${coding} [data-coding-task]`, "写一段代码");
  await waitFor(`!document.querySelector('${coding} [data-coding-send]').disabled`);
  await click(`${coding} [data-coding-send]`);
  await waitFor(`[...document.querySelectorAll('${coding} [data-turns] [data-kind="assistant"], ${coding} [data-coding-turns] [data-kind="assistant"]')].some(node => node.textContent.includes('第一段'))`, 60_000);
  model.finish();
  const block = `document.querySelector('${coding} [data-coding-turns] [data-kind="assistant"] pre[data-enriched]')`;
  await waitFor(`${block}?.querySelector('code .tok-keyword')`, 60_000);
  await evaluate(`window.block = ${block}; window.piece = window.block.querySelector('code .tok-comment'); window.copyButton = window.block.querySelector('.coding-code-copy')`);
  await waitFor(`[...document.querySelectorAll('${coding} [data-coding-turns] [data-kind="assistant"]')].some(node => node.textContent.includes('写完了'))`, 60_000);
  const written = await evaluate<{ same: boolean; piece: boolean; button: boolean; copies: number; text: string }>(`(() => { const pre = ${block};
    return { same: pre === window.block, piece: pre.querySelector('code .tok-comment') === window.piece, button: pre.querySelector('.coding-code-copy') === window.copyButton,
      copies: pre.querySelectorAll('.coding-code-copy').length, text: pre.querySelector('code').textContent }; })()`);
  assert.equal(written.same, true, "the block is the same node from its first coloured line to its last");
  assert.equal(written.piece, true, "and so is its first coloured piece");
  assert.deepEqual([written.button, written.copies], [true, 1], "its one copy button is the one it had");
  assert.equal(written.text.replace(/\n$/, ""), code, "the block reads the whole code");
  // Copy gives the code as it now reads, not what the block held when its button was added.
  await evaluate("window.copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copied = text; } } }); window.copyButton.click()");
  await waitFor("window.copied !== null", 5_000);
  assert.equal((await evaluate<string>("window.copied")).replace(/\n$/, ""), code);
  const coloured = await evaluate<Array<[string | null, string]>>(`(${codeColouringProjection})(${block}.querySelector('code'))`);
  const whole = codeTokens(written.text, "ts");
  assert.deepEqual(coloured, whole, "grown from its last line, every character has the same token kind as colouring it whole");
});
