import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-39 (§render-lifecycle 同源标本): the component board's 条件与状态 section is the shipped
// Assistant reply (Host renderer, Coding's tokenizer, the code figure's copy and fold, molisStreamText, molisFollow, molisCopy,
// molisShowMore with the Assistant's keep-failures rule) in the workbench's own context, one parameter changed at a time:
// interface language, body language and mixed text, programming and not, fallback fonts, copy success and failure, the
// container's width, the page's theme and density; zoom, touch and reduced motion are read from the browser, not simulated.

const CJK = /[㐀-鿿]/;

test("VUX-39 the board's conditions section drives production parts through language, text, fonts, copy, width, theme, density, streaming, cancel and show-more", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#conditions` }, sessionId));
  await evaluate("document.querySelector('#conditions').scrollIntoView()");
  const inFrame = <T>(body: string) => evaluate<T>(`(() => { const d = document.querySelector('[data-cond-frame]').contentDocument, w = d.defaultView; ${body} })()`);
  const ready = "(() => { const d = document.querySelector('[data-cond-frame]').contentDocument; return d?.readyState === 'complete' && !!d.querySelector('[data-cond-state][data-cond-state=done]'); })()";
  await waitFor(ready, 20_000);
  const choose = async (name: string, value: string) => {
    await evaluate(`document.querySelector('[data-cond-param="${name}"][data-cond-value="${value}"]').click()`);
    if (name !== "width") await waitFor(`document.querySelector('[data-cond-frame]').contentWindow.location.search.includes('${name}=${value}') && ${ready}`, 20_000);
  };

  // The strip: six parameters, each starting at its first value, and the page's own theme and density choices.
  const strip = await evaluate<{ params: string[]; current: string[]; preferences: number }>(`(() => {
    const groups = [...document.querySelectorAll('[data-cond-params] [data-slot=toggle-group]')];
    return { params: groups.map((g) => g.querySelector('[data-cond-param]').dataset.condParam),
      current: groups.map((g) => g.querySelector('.is-current').dataset.condValue),
      preferences: document.querySelectorAll('[data-cond-params] [data-theme-option], [data-cond-params] [data-density-option]').length }; })()`);
  assert.deepEqual(strip.params, ["lang", "text", "kind", "font", "copy", "width"]);
  assert.deepEqual(strip.current, ["zh", "zh", "code", "system", "ok", "760"]);
  assert.equal(strip.preferences, 4, "light, dark, standard and compact are the page's own preference controls");

  // The frame is the workbench's context and the reply is the Host's renderer: a TypeScript figure folded past 18 lines, a Diff figure, both coloured.
  const drawn = await inFrame<{ body: boolean; sheet: boolean; figures: string[]; lines: string[]; folded: boolean; more: string; tokens: number[]; table: boolean; link: boolean }>(`
    const figures = [...d.querySelectorAll('[data-cond-reply] .assistant-code')];
    return { body: d.body.classList.contains('immersive-workbench'), sheet: !!d.querySelector('link[href="/assets/molis-work-workbench.css"]'),
      figures: figures.map((f) => f.querySelector('.assistant-code-lang').textContent), lines: figures.map((f) => f.querySelector('.assistant-code-lines').textContent),
      folded: figures[0].hasAttribute('data-folded'), more: figures[0].querySelector('.assistant-code-more').textContent,
      tokens: figures.map((f) => f.querySelectorAll('[class^="tok-"]').length), table: !!d.querySelector('[data-cond-reply] .assistant-table table'),
      link: !!d.querySelector('[data-cond-reply] a[href^="https://example.com/docs/"]') };`);
  assert.deepEqual([drawn.body, drawn.sheet], [true, true]);
  assert.deepEqual(drawn.figures, ["TypeScript", "Diff"]);
  assert.deepEqual(drawn.lines, ["22 行", "8 行"]);
  assert.deepEqual([drawn.folded, drawn.more], [true, "展开全部 22 行"]);
  assert.ok(drawn.tokens.every((n) => n > 0), "both figures are coloured by the shipped tokenizer");
  assert.deepEqual([drawn.table, drawn.link], [true, true], "the sample has a table and a long URL");
  // The fold is the shipped figure's: it opens, says 收起, and folds again.
  assert.equal(await inFrame<string>("const more = d.querySelector('.assistant-code-more'); more.click(); return more.textContent + '|' + more.closest('figure').hasAttribute('data-folded');"), "收起|false");

  // Show more: twelve tool calls, five tucked away; the failure and the unknown outcome past the limit stay in sight; one over the limit is not tucked.
  const tools = await inFrame<{ rows: number; tucked: number; kept: boolean; button: string; edgeRows: number; edgeTucked: number; edgeButton: boolean }>(`
    const list = d.querySelector('[data-cond-tools]'), edge = d.querySelector('[data-cond-tools-edge]');
    return { rows: list.querySelectorAll('[data-slot=directory-row]').length, tucked: list.querySelectorAll('[data-mw-tucked]').length,
      kept: [...list.querySelectorAll('[data-cond-kept]')].every((row) => !row.hasAttribute('data-mw-tucked') && row.getClientRects().length > 0),
      button: list.querySelector('.mw-show-more')?.textContent ?? '', edgeRows: edge.querySelectorAll('[data-slot=directory-row]').length,
      edgeTucked: edge.querySelectorAll('[data-mw-tucked]').length, edgeButton: !!edge.querySelector('.mw-show-more') };`);
  assert.deepEqual(tools, { rows: 12, tucked: 5, kept: true, button: "再显示 5 项", edgeRows: 6, edgeTucked: 0, edgeButton: false });
  assert.equal(await inFrame<boolean>("const list = d.querySelector('[data-cond-tools]'), first = list.querySelectorAll('[data-slot=directory-row]')[5]; list.querySelector('.mw-show-more').click(); return d.activeElement === first && !list.querySelector('[data-mw-tucked]');"), true,
    "revealing shows every row and hands focus to the first one it revealed");

  // Copy: the clipboard really takes the code's own text; a refusal (simulated) answers on the same button with its failure.
  await command("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await inFrame("w.focus(); d.querySelector('.assistant-code-copy').click(); return null;");
  await waitFor("document.querySelector('[data-cond-frame]').contentDocument.querySelector('.assistant-code-copy').dataset.copy === 'done'");
  assert.equal(await inFrame<boolean>("return w.navigator.clipboard.readText().then((text) => text === d.querySelector('.assistant-code').dataset.code);"), true);
  await choose("copy", "fail");
  await inFrame("d.querySelector('.assistant-code-copy').click(); return null;");
  await waitFor("document.querySelector('[data-cond-frame]').contentDocument.querySelector('.assistant-code-copy').dataset.copy === 'failed'");
  assert.equal(await inFrame<string>("return d.querySelector('.assistant-code-copy [data-copy-face=failed]').textContent;"), "复制失败");
  await choose("copy", "ok");

  // Interface language: the same figure and lists in English, counts agreeing with their numbers.
  await choose("lang", "en");
  const english = await inFrame<{ lang: string; lines: string[]; more: string; state: string; button: string; env: string }>(`
    return { lang: d.documentElement.lang, lines: [...d.querySelectorAll('.assistant-code-lines')].map((n) => n.textContent),
      more: d.querySelector('.assistant-code-more').textContent, state: d.querySelector('[data-cond-state]').textContent,
      button: d.querySelector('[data-cond-tools] .mw-show-more').textContent, env: d.querySelector('[data-cond-env]').textContent };`);
  assert.deepEqual(english, { lang: "en", lines: ["22 lines", "8 lines"], more: "Show all 22 lines", state: "Finished", button: "Show 5 more",
    env: "Zoom ×1Pointer FineMotion FullSet by the browser; not simulated on the board" });

  // Body language and content: English has no Chinese in the reply, mixed has both, the non-programming reply has no code but a list, a quote and a table.
  await choose("text", "en");
  assert.equal(await inFrame<boolean>("return /[\\u3400-\\u9fff]/.test(d.querySelector('[data-cond-reply]').textContent);"), false);
  await choose("text", "mixed");
  const mixed = await inFrame<string>("return d.querySelector('[data-cond-reply]').textContent;");
  assert.ok(CJK.test(mixed) && /rotation window/.test(mixed), "mixed text holds Chinese and English in one reply");
  await choose("kind", "prose");
  assert.deepEqual(await inFrame("const r = d.querySelector('[data-cond-reply]'); return [r.querySelectorAll('.assistant-code').length, !!r.querySelector('ol'), !!r.querySelector('blockquote'), !!r.querySelector('table')];"), [0, true, true, true]);

  // Fallback fonts (simulated): only the bundled faces the product falls back to are left, and code is generic monospace.
  await choose("font", "fallback");
  assert.deepEqual(await inFrame("return [w.getComputedStyle(d.body).fontFamily.split(',')[0].trim(), w.getComputedStyle(d.documentElement).getPropertyValue('--font-mono').trim()];"), ['"Inter Variable"', "monospace"]);
  await choose("kind", "code");

  // Container: the frame is the viewport, so a split pane's and a phone's widths are real; nothing runs out sideways.
  for (const width of ["420", "360"]) {
    await choose("width", width);
    await waitFor(`document.querySelector('[data-cond-frame]').contentWindow.innerWidth === ${width}`);
    assert.deepEqual(await inFrame("return [d.scrollingElement.scrollWidth <= d.scrollingElement.clientWidth, w.matchMedia('(max-width: 600px)').matches];"), [true, true], `nothing runs out sideways at ${width}px`);
  }
  await choose("width", "760");

  // Theme and density are the page's preferences: the frame follows them as every page does.
  await evaluate("document.querySelector('[data-cond-params] [data-theme-option=dark]').click(); document.querySelector('[data-cond-params] [data-density-option=compact]').click()");
  await waitFor("(() => { const e = document.querySelector('[data-cond-frame]').contentDocument.documentElement; return e.dataset.resolvedTheme === 'dark' && e.dataset.density === 'compact'; })()");
  await evaluate("document.querySelector('[data-cond-params] [data-theme-option=light]').click(); document.querySelector('[data-cond-params] [data-density-option=standard]').click()");
  await waitFor("(() => { const e = document.querySelector('[data-cond-frame]').contentDocument.documentElement; return e.dataset.resolvedTheme === 'light' && e.dataset.density === 'standard'; })()");

  // Streaming interleaved with scrolling, then a cancel: scrolled up, the place is kept while the reply grows and new text waits behind 回到最新; 停止 keeps what was written.
  const final = await inFrame<string>("return d.querySelector('[data-cond-reply]').textContent;");
  await inFrame("d.querySelector('[data-cond-replay]').click(); return null;");
  await waitFor("(() => { const d = document.querySelector('[data-cond-frame]').contentDocument; return d.querySelector('[data-cond-state]').dataset.condState === 'writing' && d.querySelector('[data-cond-reply]').textContent.length > 0; })()");
  await inFrame("const t = d.querySelector('[data-cond-thread]'); t.dispatchEvent(new w.WheelEvent('wheel', { deltaY: -600, bubbles: true })); t.scrollTop = 0; return null;");
  await waitFor("document.querySelector('[data-cond-frame]').contentDocument.querySelector('[data-cond-thread]').dataset.follow === 'detached'");
  const before = await inFrame<number>("return d.querySelector('[data-cond-reply]').textContent.length;");
  await waitFor(`(() => { const d = document.querySelector('[data-cond-frame]').contentDocument; return d.querySelector('[data-cond-reply]').textContent.length > ${before} && !d.querySelector('[data-cond-latest]').hidden; })()`);
  assert.equal(await inFrame<number>("return d.querySelector('[data-cond-thread]').scrollTop;"), 0, "the place the person scrolled to is kept while the reply grows");
  await inFrame("d.querySelector('[data-cond-stop]').click(); return null;");
  const stopped = await inFrame<{ state: string; text: string; length: number; disabled: boolean }>("const s = d.querySelector('[data-cond-state]'); return { state: s.dataset.condState, text: s.textContent, length: d.querySelector('[data-cond-reply]').textContent.length, disabled: d.querySelector('[data-cond-stop]').disabled };");
  assert.deepEqual([stopped.state, stopped.text, stopped.disabled], ["stopped", "Stopped; what was written stays", true]);
  assert.ok(stopped.length > 0 && stopped.length < final.length, "a cancel keeps what was already written, and only that");
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(await inFrame<number>("return d.querySelector('[data-cond-reply]').textContent.length;"), stopped.length, "nothing is written after the cancel");
  await inFrame("d.querySelector('[data-cond-latest]').click(); d.querySelector('[data-cond-replay]').click(); return null;");
  await waitFor(ready, 20_000);
  assert.equal(await inFrame<string>("return d.querySelector('[data-cond-reply]').textContent;"), final, "a whole replay ends with the renderer's reply");

  // What the browser gives is read out, not set: reduced motion, touch and a zoomed screen, and the streamed text then shows at once.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await command("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 2, mobile: true }, sessionId);
  await choose("text", "en");
  assert.equal(await inFrame<string>("return d.querySelector('[data-cond-env]').textContent;"), "Zoom ×2Pointer TouchMotion ReducedSet by the browser; not simulated on the board");
  await inFrame("d.querySelector('[data-cond-replay]').click(); return null;");
  await waitFor("document.querySelector('[data-cond-frame]').contentDocument.querySelector('[data-cond-reply]').textContent.length > 0");
  assert.equal(await inFrame<number>("return d.querySelectorAll('[data-cond-reply] .mw-fresh').length;"), 0, "under reduced motion new text is not shown arriving");
  await waitFor(ready, 20_000);
});
