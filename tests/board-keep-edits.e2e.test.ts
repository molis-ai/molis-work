import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// N14's four parts on the component board (docs/design/rule-stale-reload/README.md「组件板新增」, decided 2026-11-06, plan A): buttons
// inside an alert, the kept row, the dot on a step and a field's arrival wash, in Chinese and English, light and dark, inside the
// window at 1440, 1024, 390 and 320, with the longest words they meet. Keyboard: the kept row's button keeps the focus when it swaps, a
// blocked press sends the focus to the alert's primary. Motion: only on the tokens, and quiet under reduced motion.
// MOLIS_WORK_BOARD_SHOTS=1 also writes shots into the ignored review folder.

const SECTIONS = ["alert-actions", "kept", "step-dot", "field-wash"];
const WIDTHS = [1440, 1024, 390, 320] as const;
const SCOPE = SECTIONS.map((id) => `#${id}`).join(", ");

const SEEN = `(() => {
  const sections = [...document.querySelectorAll('${SCOPE}')];
  const visible = (el) => { const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
  const W = document.documentElement.clientWidth;
  const spills = sections.flatMap((section) => { const edge = section.getBoundingClientRect().right;
    return [...section.querySelectorAll('*')].filter((el) => visible(el) && el.getBoundingClientRect().right > Math.min(edge, W) + 1).slice(0, 3)
      .map((el) => section.id + ' ' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(el.getBoundingClientRect().right) + '>' + Math.round(edge)); });
  const buttons = sections.flatMap((s) => [...s.querySelectorAll('.mw-alert .mw-btn, .mw-kept .mw-btn')]).filter(visible);
  return {
    sections: sections.map((s) => s.id),
    words: sections.map((s) => [...s.querySelectorAll('*')].filter((n) => !['STYLE', 'SCRIPT'].includes(n.tagName)).map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('') + (n.getAttribute('aria-label') ?? '') + (n.getAttribute('title') ?? '') + (n.value ?? '')).join(' ')).join(' '),
    unnamed: sections.flatMap((s) => [...s.querySelectorAll('button, nav, [role=img]')].filter((el) => !name(el))).length,
    pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    spills,
    // Nothing runs past the alert or kept row it belongs to, and the crowded alert is as wide as the plain ones.
    escaped: buttons.filter((b) => b.getBoundingClientRect().right > b.closest('.mw-alert, .mw-kept').getBoundingClientRect().right).map((b) => b.textContent.trim().slice(0, 24)),
    alertWidths: [...new Set([...document.querySelectorAll('#alert-actions .mw-alert')].map((a) => Math.round(a.getBoundingClientRect().width)))],
    // A button's words wrap only when they cannot fit the row, and are never cut.
    wrapped: buttons.filter((b) => { if (b.classList.contains('mw-kept__more')) return false;
      const words = document.createRange(); words.selectNodeContents(b.querySelector('[data-slot=button-label]'));
      const lines = new Set([...words.getClientRects()].map((r) => Math.round(r.top))).size, row = b.parentElement.getBoundingClientRect().width;
      return lines > 1 && b.getBoundingClientRect().width < row - 1; }).map((b) => b.textContent.trim().slice(0, 24)),
    cut: buttons.filter((b) => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1 || getComputedStyle(b.querySelector('[data-slot=button-label]')).textOverflow === 'ellipsis').map((b) => b.textContent.trim().slice(0, 24)),
    // Nothing in an alert runs past its padding: words, the row or its buttons.
    outOfAlert: [...document.querySelectorAll('#alert-actions .mw-alert')].flatMap((alert) => { const edge = alert.getBoundingClientRect().right - parseFloat(getComputedStyle(alert).paddingRight);
      return [...alert.querySelectorAll('*')].filter((el) => visible(el) && el.getBoundingClientRect().right > edge + 1).slice(0, 2).map((el) => el.tagName.toLowerCase() + ' ' + Math.round(el.getBoundingClientRect().right - edge)); }),
    longLabel: (() => { const b = document.querySelector('[data-keep-long-label]'); return { length: b.textContent.trim().length, height: b.getBoundingClientRect().height, peer: b.previousElementSibling.getBoundingClientRect().height }; })(),
    // A loading button is as wide as the same button at rest.
    loadingWidth: (() => { const [idle, busy] = [...document.querySelectorAll('#alert-actions .mw-alert')].slice(0, 3).filter((a, i) => i !== 1).map((a) => a.querySelector('.mw-btn--primary').getBoundingClientRect().width); return Math.abs(idle - busy); })(),
    smallTargets: buttons.filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim().slice(0, 24) + ' ' + Math.round(b.getBoundingClientRect().height)),
    stepDots: [...document.querySelectorAll('#step-dot .mw-step-dot')].filter(visible).map((dot) => { const d = dot.getBoundingClientRect(), n = dot.parentElement.getBoundingClientRect();
      return { off: Math.max(Math.abs((d.left + d.right) / 2 - n.right), Math.abs((d.top + d.bottom) / 2 - n.top)), name: dot.getAttribute('aria-label'), inName: dot.closest('button').querySelector('.mw-step-dot') === dot }; }),
  };
})()`;

test("N14: the board's four parts are named, in both languages and themes, inside the window at three widths", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  const shots = process.env.MOLIS_WORK_BOARD_SHOTS === "1" ? join(REVIEW_EVIDENCE, "05-n14-board-specimens") : "";
  if (shots) await mkdir(shots, { recursive: true });
  const open = async (lang: string, width: number, theme = "light") => {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=${lang}` }, sessionId));
    await waitFor("document.readyState === 'complete' && !!document.querySelector('#field-wash')", 20_000);
  };
  const press = async (key: string, code = key, vk = 13) => { for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: vk, ...(type === "keyDown" && key === "Enter" ? { text: "\r" } : {}) }, sessionId); };

  for (const lang of ["zh", "en"] as const) for (const width of WIDTHS) for (const theme of ["light", "dark"] as const) {
    await open(lang, width, theme);
    const seen = await evaluate<{ sections: string[]; words: string; unnamed: number; pageScroll: number; spills: string[]; escaped: string[]; alertWidths: number[]; wrapped: string[]; cut: string[]; outOfAlert: string[]; longLabel: { length: number; height: number; peer: number }; loadingWidth: number; smallTargets: string[]; stepDots: Array<{ off: number; name: string; inName: boolean }> }>(SEEN);
    const at = `${lang} ${width}px ${theme}`;
    assert.deepEqual(seen.sections, SECTIONS, "every part has its section, in order");
    if (lang === "en") assert.equal(seen.words.match(/[㐀-鿿]+/g)?.join(" ") ?? "", "", `${at}: no Chinese is left in English`);
    assert.equal(seen.unnamed, 0, `${at}: every button, step bar and dot has a name`);
    assert.equal(seen.pageScroll, 0, `${at}: the page does not scroll sideways`);
    assert.deepEqual(seen.spills, [], `${at}: nothing runs past its section`);
    assert.deepEqual(seen.escaped, [], `${at}: a button stays inside its alert or row`);
    assert.equal(seen.alertWidths.length, 1, `${at}: every alert has the same width (${seen.alertWidths})`);
    assert.deepEqual(seen.wrapped, [], `${at}: a button's words wrap only when they cannot fit the row`);
    assert.deepEqual(seen.cut, [], `${at}: a button's words are never cut`);
    assert.deepEqual(seen.outOfAlert, [], `${at}: nothing runs past an alert's padding`);
    assert.ok(seen.longLabel.length > 40, "the long label is really long");
    assert.ok(seen.longLabel.height > seen.longLabel.peer, `${at}: only the button that cannot fit grows (${seen.longLabel.height} vs ${seen.longLabel.peer})`);
    assert.ok(seen.loadingWidth <= 0.5, `${at}: a loading button keeps its width (${seen.loadingWidth}px)`);
    if (width <= 390) assert.deepEqual(seen.smallTargets, [], `${at}: the alerts' and kept rows' buttons are 44px targets on a phone`);
    assert.ok(seen.stepDots.length >= 3, "the dots on the other steps show");
    for (const dot of seen.stepDots) {
      assert.ok(dot.off <= 6, `${at}: the dot sits on the number's corner (${dot.off}px off)`);
      assert.match(dot.name, lang === "zh" ? /有改动/ : /changed/, "the dot says what it means");
    }
    // Each theme really drew its own surface and tones: the kept row is the amber wash, once put back the neutral one.
    const tones = await evaluate<{ kept: string; swapped: string; dot: string; theme: string }>(`(() => { const css = (s, p) => getComputedStyle(document.querySelector(s))[p];
      return { kept: css('#kept .mw-kept:not(.is-swapped)', 'backgroundColor'), swapped: css('#kept .mw-kept.is-swapped', 'backgroundColor'), dot: css('#step-dot .mw-step-dot', 'backgroundColor'), theme: getComputedStyle(document.body).colorScheme + '|' + getComputedStyle(document.documentElement).getPropertyValue('--amber-soft').trim() }; })()`);
    assert.notEqual(tones.kept, tones.swapped, `${at}: yours and the latest differ`);
    assert.match(tones.theme, theme === "dark" ? /#30291a/i : /#f6efdf/i, `${at}: the theme's own amber`);
    if (shots) {
      await evaluate(`(() => { let s = document.querySelector('#shot-only'); if (!s) { s = document.createElement('style'); s.id = 'shot-only'; document.head.append(s); }
        s.textContent = '.mw-catalog > .mw-catalog__section:not(${SCOPE}) { display: none !important; }'; document.querySelector('.mw-catalog').scrollTop = 0; })()`);
      const height = await evaluate<number>("Math.ceil(document.querySelector('.mw-catalog').scrollHeight + document.querySelector('.mw-catalog').getBoundingClientRect().top + 12)");
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate("new Promise((resolve) => setTimeout(resolve, 500))");
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(shots, `keep-edits-${width}-${lang}-${theme}.png`), Buffer.from(shot.data, "base64"));
    }
  }

  // The kept row: put back and swap back in the same slot. The field and the slot trade places, the row says whose words these are in
  // words as well as colour, and the keyboard's focus stays on the button.
  await open("zh", 1440);
  const pair = "document.querySelector('#kept [data-keep-pair]')";
  const pairState = () => evaluate<{ value: string; who: string; text: string; swapped: boolean; label: string; name: string; focus: boolean }>(`(() => { const pair = ${pair}, kept = pair.querySelector('.mw-kept'), b = kept.querySelector('[data-keep-swap]');
    return { value: pair.querySelector('textarea').value, who: kept.querySelector('.mw-kept__who').textContent, text: kept.querySelector('.mw-kept__text').textContent, swapped: kept.classList.contains('is-swapped'), label: b.textContent.trim(), name: b.getAttribute('aria-label'), focus: document.activeElement === b }; })()`);
  await evaluate(`${pair}.querySelector('[data-keep-swap]').focus()`);
  const before = await pairState();
  assert.deepEqual([before.who, before.label, before.swapped, before.focus], ["你写的", "放回", false, true]);
  await press("Enter");
  const after = await pairState();
  assert.deepEqual([after.who, after.label, after.swapped, after.focus, after.value, after.text], ["最新版", "换回", true, true, before.text, before.value], "put back: the field takes what you wrote, the focus stays");
  assert.equal(after.name, "换回最新版：判断说明");
  assert.equal(await evaluate<string>(`${pair}.querySelector('[data-keep-box]').getAttribute('data-craft-new') ?? ''`), "field", "the field that changed glows");
  await press("Enter");
  const again = await pairState();
  assert.deepEqual([again.who, again.value, again.focus], ["你写的", before.value, true], "swap back returns to where it was");

  // The fold shows only for text that is really cut, and opening it reports its state.
  const fold = await evaluate<Array<{ hidden: boolean; expanded: string | null; label: string }>>(`[...document.querySelectorAll('#kept .mw-kept__more')].map((more) => ({ hidden: more.hidden, expanded: more.getAttribute('aria-expanded'), label: more.textContent.trim() }))`);
  assert.deepEqual(fold, [{ hidden: false, expanded: "false", label: "看全部" }]);
  // No way to the rest when nothing is cut. Put back while folded: the short text needs none, and swapping back brings it again.
  const longKept = "document.querySelector('#kept .mw-kept__more').closest('.mw-kept')";
  const foldState = () => evaluate<{ hidden: boolean; label: string; focus: string }>(`(() => { const kept = ${longKept}, more = kept.querySelector('.mw-kept__more');
    return { hidden: more.hidden, label: more.textContent.trim(), focus: document.activeElement.textContent.trim() }; })()`);
  const swapLong = () => evaluate(`${longKept}.querySelector('[data-keep-swap]').click()`);
  await swapLong();
  assert.equal((await foldState()).hidden, true, "put back while folded: the short text has no way to more");
  await swapLong();
  assert.equal((await foldState()).hidden, false, "swapped back: the long text has it again");
  // Open, put back, fold: the text fits, so the way to the rest goes, and the keyboard's focus moves to the row's other button.
  await evaluate(`${longKept}.querySelector('.mw-kept__more').click()`);
  await swapLong();
  assert.deepEqual([(await foldState()).hidden, (await foldState()).label], [false, "收起"], "still open after putting back, with the way to fold it");
  await evaluate(`${longKept}.querySelector('.mw-kept__more').focus()`);
  await press("Enter");
  assert.deepEqual(await foldState(), { hidden: true, label: "看全部", focus: "换回" }, "folded: nothing is cut, no way to more, the focus on the row's button");
  await swapLong();
  assert.equal((await foldState()).hidden, false);

  const opened = await evaluate<{ expanded: string | null; label: string; cut: boolean }>(`(() => { const more = document.querySelector('#kept .mw-kept__more'); more.click(); const text = more.parentElement.querySelector('.mw-kept__text');
    return { expanded: more.getAttribute('aria-expanded'), label: more.textContent.trim(), cut: text.scrollHeight > text.clientHeight + 1 }; })()`);
  assert.deepEqual(opened, { expanded: "true", label: "收起", cut: false });

  // The dot goes when you reach its step: on the current step the thing is in view.
  const dots = await evaluate<{ before: boolean; after: boolean }>(`(() => { const nav = document.querySelector('#step-dot nav'), step = nav.querySelectorAll('button')[2], dot = step.querySelector('.mw-step-dot'); const before = !!dot.getBoundingClientRect().width; step.click(); return { before, after: !!dot.getBoundingClientRect().width }; })()`);
  assert.deepEqual(dots, { before: true, after: false });

  // The board holds still under automation (html[data-craft-still]); the motion below is what a person sees.
  await evaluate("document.documentElement.removeAttribute('data-craft-still')");

  // A blocked press: the alert hops once, and the focus goes to its primary.
  const blocked = await evaluate<{ animation: string; duration: number; dur: number; focus: string }>(`(() => { document.querySelector('[data-keep-press]').click(); const alert = document.querySelector('[data-keep-nudge] .mw-alert'), animation = alert.getAnimations()[0];
    const token = getComputedStyle(alert).getPropertyValue('--dur-move').trim();
    return { animation: animation?.animationName ?? '', duration: Number(animation?.effect.getTiming().duration ?? 0), dur: token.endsWith('ms') ? parseFloat(token) : parseFloat(token) * 1000, focus: document.activeElement.textContent.trim() }; })()`);
  assert.deepEqual(blocked, { animation: "mw-alert-nudge", duration: blocked.dur, dur: blocked.dur, focus: "载入最新版" });

  // Arrival: the alert rises, its mark settles on the spring; a kept group staggers; the field's wash is translucent, reaches past the
  // field and runs on the moment clock. The specimen's held frame shows what the running wash reaches.
  const moving = await evaluate<{ alert: string; mark: string; markEase: string; delays: number[]; wash: { background: string; left: string; animation: string } }>(`(() => { document.querySelector('[data-keep-replay-rise]').click(); document.querySelector('[data-keep-replay-group]').click(); document.querySelector('[data-keep-replay-wash]').click();
    const alert = document.querySelector('[data-keep-rise] .mw-alert'), mark = alert.querySelector('.mw-alert__mark'), box = document.querySelector('[data-keep-wash]');
    const after = getComputedStyle(box, '::after');
    return { alert: alert.getAnimations()[0]?.animationName ?? '', mark: mark.getAnimations()[0]?.animationName ?? '', markEase: mark.getAnimations()[0]?.effect.getTiming().easing ?? '',
      delays: [...document.querySelectorAll('[data-keep-group] .mw-kept')].map((k) => k.getAnimations()[0]?.effect.getTiming().delay ?? -1),
      wash: { background: after.backgroundColor, left: after.left, animation: after.animationName } }; })()`);
  assert.equal(moving.alert, "craft-rise");
  assert.equal(moving.mark, "mw-alert-land");
  assert.deepEqual(moving.delays, [0, 65, 130], "a group arrives one after another, half a hover apart");
  assert.equal(moving.wash.animation, "craft-landed");
  assert.equal(moving.wash.left, "-8px", "the wash reaches a little past the field");
  assert.match(moving.wash.background, /\/ 0\.1\)$/, `the wash is a tenth of the accent, so the words stay readable (${moving.wash.background})`);

  // Reduced motion: everything quiet, and the state is the same.
  await open("zh", 1440);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await evaluate("document.documentElement.removeAttribute('data-craft-still')");
  const quiet = await evaluate<{ running: string[]; focus: string; box: string | null; who: string }>(`(() => { document.querySelector('[data-keep-replay-rise]').click(); document.querySelector('[data-keep-replay-group]').click(); document.querySelector('[data-keep-press]').click(); document.querySelector('[data-keep-replay-wash]').click();
    const focus = document.activeElement.textContent.trim(); const pair = ${pair}; pair.querySelector('[data-keep-swap]').click();
    const running = [...document.querySelectorAll('${SCOPE}')].flatMap((s) => [s, ...s.querySelectorAll('*')]).flatMap((el) => el.getAnimations({ subtree: false })).filter((a) => a.playState === 'running' && !/ring|state/i.test(a.animationName ?? '')).map((a) => a.effect.target.tagName + '.' + a.effect.target.getAttribute('class') + ' ' + (a.animationName ?? a.transitionProperty));
    return { running, focus, box: pair.querySelector('[data-keep-box]').getAttribute('data-craft-new'), who: pair.querySelector('.mw-kept__who').textContent }; })()`);
  assert.deepEqual(quiet, { running: [], focus: "载入最新版", box: null, who: "最新版" }, "with reduced motion nothing moves and the state still changes");
  await command("Emulation.setEmulatedMedia", { features: [] }, sessionId);
});
