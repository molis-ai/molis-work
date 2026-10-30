import assert from "node:assert/strict";
import test from "node:test";
import { createCodingCodePaint } from "@molis-ai/molis-work-plugin-coding";
import { codeTokens, growCodeTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { codeColouringProjection, codeGeometry } from "./fixtures/code-colouring.js";
import { coding, openCoding } from "./fixtures/coding-browser.js";

// VUX-33: layout boundaries may split a token, but not the text, selection, geometry or unchanged leading nodes.
const SOURCE = "\tconst stable = 1;\r\n\r\n/* " + ("一段保留空白的说明 😀 ".repeat(4) + "\n").repeat(180)
  + "*/\nconst message = `" + ("template line\n").repeat(700) + "`;\n\nconst tail = 2;\n";
const BOOT = `window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()}; window.colourParts = ${codeColouringProjection};
  window.paint = (${createCodingCodePaint.toString()})(tokensOf, ${growCodeTokens.toString()}, hint => hint);
  window.pre = document.createElement('pre'); pre.style.cssText = 'display:block;flex:none;height:280px;max-height:none;min-height:0;overflow:auto;white-space:pre;font:12px/19.2px monospace;tab-size:4;margin:0;padding:0';
  window.code = pre.appendChild(document.createElement('code')); document.body.prepend(pre);
  const expected = new Map(); window.matches = (text) => {
    if (!expected.has(text)) expected.set(text, JSON.stringify(tokensOf(text, 'ts')));
    return JSON.stringify(colourParts(code)) === expected.get(text); };`;

type Geometry = { text: string; projection: Array<[string | null, string]>; selection: boolean; range: string; size: number[]; line: number[]; tab: number[][] };
const assertGeometry = (facts: Geometry, source: string) => {
  assert.equal(facts.text, source);
  assert.deepEqual(facts.projection, codeTokens(source, "ts"), "every character keeps the whole tokenizer's kind across layout boundaries");
  assert.equal(facts.range, source, "Range retains tabs, CRLF, blank lines and the trailing newline exactly");
  assert.equal(facts.selection, true, "native selection has the same newline semantics as the flat reference");
  assert.deepEqual([facts.size[0], facts.size[2]], [facts.size[1], facts.size[3]], "scroll extents do not gain or lose lines or horizontal content");
  assert.ok(Math.abs(facts.line[0]! - facts.line[1]!) < 1, "a character after several boundaries or in a long physical line stays on the same visual row");
  if (facts.tab.length) assert.deepEqual(facts.tab[0], facts.tab[1], "a tab retains its original position and stop width");
};

test("VUX-33: layout blocks preserve complete text, cross-line token kinds, native selection and geometry", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("document.readyState === 'complete'");
  await evaluate(BOOT);
  for (const [source, parentFont] of [[SOURCE, "monospace"], ['const tail = "' + "x".repeat(9_000) + '";', "monospace"],
    [SOURCE + 'const tail = "' + "y".repeat(9_000) + '";', "monospace"], [SOURCE, "serif"]] as const) {
    await evaluate(`pre.style.fontFamily = ${JSON.stringify(parentFont)}`);
    assert.equal(await evaluate<boolean>(`window.text = ${JSON.stringify(source)}; paint.paintInto(code, text, 'ts'); code.textContent === text`), true);
    await waitFor("matches(text)", 30_000);
    const facts = await evaluate<Geometry>(codeGeometry);
    assertGeometry(facts, source);
  }
});

test("VUX-33: a small block grows past layout boundaries without replacing its selected prefix", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("document.readyState === 'complete'");
  await evaluate(BOOT);
  const prefix = "/* stable prefix */\nconst stable = 1;\n";
  await evaluate(`window.text = ${JSON.stringify(prefix)}; paint.paintInto(code, text, 'ts'); window.leading = code.querySelector('.tok-comment'); window.region = leading.parentNode;
    const range = document.createRange(); range.setStart(leading.firstChild, 3); range.setEnd(leading.firstChild, 9); getSelection().removeAllRanges(); getSelection().addRange(range); window.selected = getSelection().toString();`);
  let text = prefix;
  for (let count = 1; count <= 6; count += 1) {
    text += Array.from({ length: 140 }, (_, index) => `const value${count}_${index} = compute(${index}, "文字");\n`).join("");
    const kept = await evaluate<boolean>(`window.text = ${JSON.stringify(text)}; paint.paintInto(code, text, 'ts'); code.textContent === text && code.querySelector('.tok-comment') === leading && leading.parentNode === region && getSelection().toString() === selected`);
    assert.equal(kept, true, "each append reads immediately and leaves the same prefix nodes and native selection");
  }
  await waitFor("matches(text)", 30_000);
  assert.equal(await evaluate<boolean>("code.querySelector('.tok-comment') === leading && getSelection().toString() === selected"), true);
  text = text.replace('compute(139, "文字")', 'compute(139, "corrected")');
  await evaluate(`window.text = ${JSON.stringify(text)}; paint.paintInto(code, text, 'ts')`);
  await waitFor("matches(text)", 30_000);
  assert.equal(await evaluate<string>("code.textContent"), text);
  assert.equal(await evaluate<boolean>("code.querySelector('.tok-comment') === leading && leading.parentNode === region && getSelection().toString() === selected"), true,
    "an edit after the stable prefix recolours its affected line without resetting that prefix");

  // An open multi-line token makes grow revisit its beginning; unchanged complete blocks must still keep their nodes.
  for (const [opening, closing, selector] of [["/*\n", "*/\nconst done = 1;\n", ".tok-comment"], ["const message = `", "`;\nconst done = 1;\n", ".tok-string"]]) {
    text = opening + "a line that stays in this token\n".repeat(700);
    await evaluate(`window.text = ${JSON.stringify(text)}; paint.paintInto(code, text, 'ts')`);
    await waitFor("matches(text)", 30_000);
    await evaluate(`{ window.leading = code.querySelector(${JSON.stringify(selector)}); window.region = leading.parentNode;
      const range = document.createRange(); range.setStart(leading.firstChild, 3); range.setEnd(leading.firstChild, 9);
      getSelection().removeAllRanges(); getSelection().addRange(range); window.selected = getSelection().toString(); }`);
    for (const addition of ["more of the same token\n".repeat(500), closing]) {
      text += addition;
      assert.equal(await evaluate<boolean>(`window.text = ${JSON.stringify(text)}; paint.paintInto(code, text, 'ts'); code.textContent === text`), true);
      await waitFor("matches(text)", 30_000);
      assert.equal(await evaluate<boolean>(`code.querySelector(${JSON.stringify(selector)}) === leading && leading.parentNode === region && getSelection().toString() === selected`), true,
        "appending to or closing a token across several layout blocks preserves its complete leading block and selection");
    }
  }
});

test("VUX-33: a long physical line remains readable while its colouring advances over several frames", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("document.readyState === 'complete'");
  await evaluate(BOOT);
  const source = 'const value = compute(1, "text"); '.repeat(4_000);
  const first = await evaluate<{ text: string; inputs: number[]; frameInputs: number[] }>(`(() => {
    window.inputs = []; const grow = ${growCodeTokens.toString()};
    window.paint = (${createCodingCodePaint.toString()})(tokensOf, (last, text, language, tokens) => { inputs.push(text.length); return grow(last, text, language, tokens); }, hint => hint);
    window.text = ${JSON.stringify(source)}; paint.paintInto(code, text, 'ts'); const initial = { text: code.textContent, inputs: inputs.slice() };
    return new Promise(resolve => requestAnimationFrame(() => resolve({ ...initial, frameInputs: inputs.slice() })));
  })()`);
  assert.equal(first.text, source, "the uncoloured remainder is immediately present, without inserting newlines");
  assert.deepEqual(first.inputs, [], "SYS-49: a large block leaves colouring to a later animation frame");
  // RAC-2074 (user 2026-10-29, T-281): the frame that lays the line out first is not coloured in; the slices start after it.
  assert.deepEqual(first.frameInputs, [], "SYS-49: no colouring shares the frame that first lays the block out");
  await waitFor("matches(text)", 30_000);
  const inputs = await evaluate<number[]>("inputs.slice()");
  assert.equal(inputs[0], 16_000, "a long line keeps the first-slice work bound without colouring the whole line in one frame");
  assert.ok(inputs.length > 1 && inputs.at(-1) === source.length && inputs.every((length, index) => length - (inputs[index - 1] ?? 0) <= 16_000));
  assert.equal(await evaluate<string>("code.textContent"), source);
});

test("VUX-33: a large block put in before it is on the page reads whole and is coloured once it is laid out", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("document.readyState === 'complete'");
  await evaluate(BOOT);
  // RAC-2077 (T-281): its colouring waits for its first layout instead of being dropped because it was not on the page yet.
  await evaluate(`pre.remove(); window.text = ${JSON.stringify(SOURCE)}; paint.paintInto(code, text, 'ts')`);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  assert.deepEqual(await evaluate("[code.textContent === text, code.querySelectorAll('[class^=tok-]').length]"), [true, 0], "off the page it reads whole and is not coloured yet");
  await evaluate("document.body.prepend(pre)");
  await waitFor("matches(text)", 30_000);
  assertGeometry(await evaluate<Geometry>(codeGeometry), SOURCE);
});

test("VUX-33: Coding retains its pre and code line boxes, including text coloured before attachment", { timeout: 120_000 }, async t => {
  const browser = await openCoding(t); if (!browser) return;
  const { evaluate, waitFor, start } = browser;
  await start("保留代码的行盒和字体");
  await evaluate(BOOT);
  await evaluate(`window.turn = document.querySelector('${coding} [data-coding-turns]').appendChild(document.createElement('article'));
    turn.className = 'coding-turn';`);
  for (const [source, detached] of [[SOURCE, false], ["\tconst first = 1;\n\nconst last = 2;\n", true]] as const) {
    await evaluate(`pre.remove(); window.pre = document.createElement('pre'); pre.style.maxHeight = '280px';
      window.code = pre.appendChild(document.createElement('code')); turn.append(pre);`);
    assert.deepEqual(await evaluate("[getComputedStyle(pre).fontSize, getComputedStyle(pre).lineHeight, getComputedStyle(code).fontSize, getComputedStyle(code).lineHeight]"),
      ["13px", "20.8px", "12px", "19.2px"], "the production container and inline code have distinct line boxes");
    await evaluate(`(async () => { window.text = ${JSON.stringify(source)};
      if (${detached}) pre.remove(); paint.paintInto(code, text, 'ts');
      // RAC-2075: a large block's first coloured piece comes in a frame after its first layout.
      while (!code.querySelector('.tok-keyword')) await new Promise(requestAnimationFrame);
      window.firstToken = code.querySelector('.tok-keyword'); if (${detached}) turn.append(pre);
      const range = document.createRange(); range.selectNodeContents(firstToken);
      getSelection().removeAllRanges(); getSelection().addRange(range); window.selected = getSelection().toString();
    })()`);
    await waitFor("matches(text)", 30_000);
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    assert.equal(await evaluate("code.querySelector('.tok-keyword') === firstToken"), true, "resolving fonts keeps the first coloured node");
    assert.equal(await evaluate("getSelection().toString() === selected"), true, "resolving fonts preserves native selection");
    assertGeometry(await evaluate<Geometry>(codeGeometry), source);
  }
});
