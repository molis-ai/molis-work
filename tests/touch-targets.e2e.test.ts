import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { layoutFindings } from "./fixtures/layout-audit.js";

// DESIGN.md → Focus and accessibility: every target is 44px wherever the pointer is coarse (a phone, a phone held sideways, a
// tablet) or the window is a phone's width, and the desktop window's chrome (the title bar's tab strip and the bottom bar) keeps
// one written, scoped exception for fine-pointer windows. This measures both sides on the real shell. Touch windows, 390×844,
// 852×393 and 1024×768: every control of the strip and of the bar is 44px on its short side, the bar and the strip lay out
// cleanly with them. The Assistant line stays inside its pill in the states the seeded project does not start in (a current
// work with its chip and the chip's mark, the chips that come and go beside the input, and the crowd of them all) at the widths
// where it is tight: 320, 360 and 390px phones and the 640, 667, 740 and 852px sideways phones. A line that cannot hold them at
// 44px folds in steps (the choosers, then the work chip's mark, then the materials and the notice into the "+" menu); each
// step is taken only when the one before it still overflowed, and nothing it folds is lost. The states are the ones the island can
// show (a Character belongs to a work that is not Coding and the mode to one that is), the page object behind the materials chip is
// a real one, and a tap into the input and away again (the phone hides the chips while typing) leaves the steps where they were.
// A fine-pointer window of 1280px keeps the sizes the exception names and does not sink below its floor, also in a short window
// and at 700px, where a crowded line squeezes its chips narrower but never shorter.

type Control = { kind: string; area: "strip" | "bar"; label: string; w: number; h: number };
type Part = { name: string; left: number; right: number };
type LineFit = { overflow: number; left: number; right: number; vw: number; stage: string; fit: string; input: number; touchRules: boolean; parts: Part[] };

const KINDS: Record<string, string> = {
  "[data-assistant-input]": "assistant input",
  "[data-assistant-attach]": "assistant attach",
  "[data-assistant-send]": "assistant send",
  "[data-plugin-picker-toggle]": "plugin switcher",
  ".dock-pin": "dock",
  ".bar-resident": "resident",
  ".bar-chat": "discussion",
  ".navigator-project-selector": "project",
  ".immersive-show-directory, .navigator-directory-toggle": "directory toggle",
  ".workspace-history-button": "history",
  ".tab-item-trigger": "tab",
  ".tab-item-close": "tab close",
  ".tab-add-button": "open plugin",
  ".tab-split-button": "layout",
  ".tab-view-chip": "location chip",
  ".tab-view-chip-close": "cover close",
  ".assistant-target-main": "work chip",
  ".assistant-target-clear": "work chip clear",
  ".assistant-materials-button": "materials chip",
  ".assistant-attention": "attention chip",
  "[data-assistant-executor]": "executor chip",
  "[data-assistant-character]": "character chip",
  "[data-assistant-mode]": "mode chip",
};
/** The chips of the Assistant line that exist only in some states; the base screens do not show them. */
const LINE_KINDS = ["work chip", "work chip clear", "materials chip", "attention chip", "executor chip", "character chip", "mode chip"];

/** What each step of the island's fold takes off a line that is still over its pill's edge, in order; a step includes the ones before it. */
const FOLD_STEPS: Array<[string, string[]]> = [
  ["choosers", ["executor chip", "character chip", "mode chip"]],
  ["mark", ["work chip clear"]],
  ["chips", ["materials chip", "attention chip"]],
];
const foldedAt = (stage: string) => {
  const reached = FOLD_STEPS.findIndex(([name]) => name === stage);
  return reached < 0 ? [] : FOLD_STEPS.slice(0, reached + 1).flatMap(([, kinds]) => kinds);
};

/** Shows chips of the Assistant line as the island paints them when they have something to say (it hides them otherwise). */
const OPTIONAL_CHIPS = ["[data-assistant-materials]", "[data-assistant-attention]", "[data-assistant-executor]", "[data-assistant-character]", "[data-assistant-mode]"];
const showChips = (selectors: string[]) => `(() => {
  for (const selector of ${JSON.stringify(OPTIONAL_CHIPS)}) { const chip = document.querySelector(selector); chip.hidden = true; chip.removeAttribute("data-chosen"); }
  const words = { "[data-assistant-materials-label]": "正在看：需求说明", "[data-assistant-materials-count]": "1", "[data-assistant-attention-count]": "3", "[data-assistant-mode-label]": "方式：执行", "[data-assistant-character-label]": "角色：评审" };
  for (const selector of ${JSON.stringify(selectors)}) {
    const chip = document.querySelector(selector);
    chip.hidden = false;
    if (/executor|character/.test(selector)) chip.setAttribute("data-chosen", "");
  }
  const paged = !!document.querySelector("[data-test-page-object]");
  for (const [selector, text] of Object.entries(words)) { const span = document.querySelector(selector); if (span && !span.closest("[hidden]") && !(paged && /materials/.test(selector))) span.textContent = text; }
})()`;
/** The page object behind the materials chip: the island names it on the chip itself (and repaints the chip from it whenever the input
 * takes focus), so a state with materials has one and a state without has none. Its title is as long as the chip's words were forced to be. */
const PAGE_TITLE = "本周需求说明文档";
const lookAtPage = (on: boolean) => `(() => {
  document.querySelectorAll("[data-test-page-object]").forEach(el => el.remove());
  if (!${on}) return;
  const page = document.createElement("div");
  page.setAttribute("data-test-page-object", "");
  page.style.cssText = "position:fixed;top:60px;left:10px;width:50px;height:20px";
  document.body.append(page);
  page.setAttribute("data-assistant-context", JSON.stringify({ plugin_id: "todo", object: { kind: "todo_item", id: "touch-targets-page", title: ${JSON.stringify(PAGE_TITLE)} } }));
})()`;
const chipsShown = (selectors: string[]) => `${JSON.stringify(selectors)}.every(selector => document.querySelector(selector)?.hidden === false)`;

/** Every shown control of the strip and of the bar (not what opens from them), with its kind and box. */
const SHELL_CONTROLS = `(() => {
  const kinds = ${JSON.stringify(KINDS)};
  const out = [];
  const roots = [["bar", ".workbench-bar"], ["strip", "nav.tab-strip"], ["strip", ".immersive-titlebar"]];
  for (const [area, root] of roots) {
    for (const el of document.querySelectorAll(root + " :is(button, summary, input, [role=tab])")) {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || el.closest("[hidden], [inert], .assistant-panel, .assistant-popover, .plugin-picker-popover, [data-dock-overflow], .navigator-project-menu-popover")) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const kind = Object.entries(kinds).find(([selector]) => el.matches(selector))?.[1];
      out.push({ kind: kind ?? "unlisted " + el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0], area, label: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20), w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10 });
    }
  }
  return out;
})()`;

/** Where the parts of the Assistant line sit against its pill and the window: nothing may run past either. */
const LINE_FIT = `(() => {
  const composer = document.querySelector("[data-assistant-composer]");
  const pill = composer.getBoundingClientRect();
  const parts = [];
  for (const el of composer.children) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    parts.push({ name: String(el.className).split(" ")[0] || el.tagName.toLowerCase(), left: Math.round(box.left * 10) / 10, right: Math.round(box.right * 10) / 10 });
  }
  return { overflow: composer.scrollWidth - composer.clientWidth, left: Math.round(pill.left * 10) / 10, right: Math.round(pill.right * 10) / 10, vw: document.documentElement.clientWidth,
    stage: composer.dataset.crowded ?? "", fit: composer.dataset.fit ?? "", touchRules: matchMedia("(max-width: 600px), (pointer: coarse)").matches,
    input: Math.round(document.querySelector("[data-assistant-input]").getBoundingClientRect().width * 10) / 10, parts };
})()`;

/** The mark on the "+" that points to what the island folded into its menu. */
const DOT = `(() => { const style = getComputedStyle(document.querySelector("[data-assistant-attach]"), "::after"); return { content: style.content, background: style.backgroundColor, size: style.width + " " + style.height }; })()`;

/** The line as a person sees it around typing: whether the chips the phone hides while the input has focus are on it, and where it ends. */
const TYPING = `(() => {
  const composer = document.querySelector("[data-assistant-composer]"), pill = composer.getBoundingClientRect(), send = document.querySelector("[data-assistant-send]").getBoundingClientRect();
  return { stage: composer.dataset.crowded ?? "", fit: composer.dataset.fit ?? "", overflow: composer.scrollWidth - composer.clientWidth, sendRight: Math.round(send.right), pillRight: Math.round(pill.right),
    focused: document.activeElement?.matches("[data-assistant-input]") === true,
    chips: [...composer.querySelectorAll(".assistant-target, .assistant-executor, .assistant-materials-button, .assistant-attention")].filter(el => el.checkVisibility()).map(el => String(el.className).split(" ")[0]) };
})()`;

/** A finding that is about the strip or the bar (the page behind them has its own audits). */
const IN_SHELL = /bar-composer|assistant-composer|dock-pin|bar-resident|bar-chat|plugin-picker|navigator-project|navigator-directory|immersive-show|workbench-bar|bar-start|bar-end|tab-view-chip|tab-item|tab-strip|tab-add|tab-split|workspace-history/;

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

/** The windows of one test: open a size on a path, measure the shell, and put the Assistant line in a state. */
function windowsOf(browser: Browser, scheme: "light" | "dark", touch: boolean) {
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  const short = (control: Control) => Math.min(control.w, control.h);
  const settle = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))))");
  const start = async () => {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    if (touch) await command("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
    // A page nobody has focused answers `:focus` to nothing: the phone's typing rule needs a focused page to be seen at all.
    await command("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId);
  };
  const open = async (width: number, height: number, path: string, ready: string) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: touch }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/${path}` }, sessionId));
    await waitFor(`${ready} && !!document.querySelector('[data-dock-pins] [data-dock-pin]')`, 20_000);
    // Text widths feed the Dock's fold; wait for the fonts, but a slow machine's font load is not what is under test.
    await waitFor("document.fonts.status === 'loaded'", 10_000).catch(() => undefined);
    assert.equal(await evaluate("document.documentElement.dataset.resolvedTheme"), scheme, "the page follows the emulated scheme");
    assert.equal(await evaluate(`matchMedia('(pointer: coarse)').matches`), touch, `the window is a ${touch ? "coarse" : "fine"}-pointer one`);
    // The Dock folds what does not fit after its first paint; let it settle before measuring.
    await settle();
    return evaluate<Control[]>(SHELL_CONTROLS);
  };
  // The directory's resize grip runs the full height of the window's grid and crosses the bar between 601 and about 900px wide
  // whatever the control sizes are; it is not what is measured here.
  const shellFindings = async () => (await layoutFindings(evaluate)).filter(finding => IN_SHELL.test(`${finding.a ?? ""} ${finding.b ?? ""}`) && !/tree-resizer/.test(`${finding.a ?? ""} ${finding.b ?? ""}`));

  /** Whether the line, one step less folded than the island left it, would run over its pill: a step is taken only when it must be. */
  const FOLD_ORDER = JSON.stringify(["", ...FOLD_STEPS.map(([name]) => name)]);
  const stepBefore = `(() => {
    const composer = document.querySelector("[data-assistant-composer]");
    const order = ${FOLD_ORDER}, here = composer.dataset.crowded ?? "", before = order[order.indexOf(here) - 1];
    if (before === undefined) return null;
    if (before) composer.dataset.crowded = before; else delete composer.dataset.crowded;
    const over = composer.scrollWidth > composer.clientWidth + 1;
    if (here) composer.dataset.crowded = here;
    return over;
  })()`;

  /** The "+" menu with the chips a crowded line folded into it: what it lists, how tall its rows are, whether each row opens the list its chip
   * would, and whether Escape and a click elsewhere put that list away (focus then goes to the "+", the chip is not there to take it). */
  const MORE_MENU = `(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const attach = document.querySelector("[data-assistant-attach]"), more = document.querySelector("[data-assistant-more]");
    attach.click(); await wait(120);
    const first = [...more.querySelectorAll(".assistant-more-item")];
    const out = { open: !more.hidden, labels: first.map((row) => row.querySelector(".assistant-more-label").textContent), heights: first.map((row) => Math.round(row.getBoundingClientRect().height)), opens: {}, closes: {} };
    for (const [key, label, list, how] of [["notices", "需要你看看", "[data-assistant-notices]", "Escape"], ["materials", "本次发送带上的材料", "[data-assistant-materials-list]", "click elsewhere"]]) {
      if (more.hidden) { attach.click(); await wait(120); }
      const row = [...more.querySelectorAll(".assistant-more-item")].find((candidate) => candidate.querySelector(".assistant-more-label").textContent === label);
      if (!row) continue;
      row.click(); await wait(120);
      const pop = document.querySelector(list);
      out.opens[key] = !pop.hidden && more.hidden;
      if (how === "Escape") pop.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      else document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await wait(60);
      out.closes[key] = pop.hidden && (how !== "Escape" || document.activeElement === attach);
    }
    if (!more.hidden) attach.click();
    return out;
  })()`;

  /** The Assistant line with some chips shown: they are the ones the island shows beside the input in that state. A crowded line takes
   * chips off in steps (the island marks which), so what must be on it is `present` less what that step folds; what is folded is not lost:
   * the work chip's mark is the panel's own "new work", the choosers are in the side pane, the materials and the notice are in the "+" menu. */
  const line = async (name: string, chips: string[], present: string[], floor: number, chipWidthFree = false, insidePill = true) => {
    if (present.includes("work chip")) await waitFor("document.querySelector('[data-assistant-target-wrap]')?.getClientRects().length > 0", 10_000);
    await evaluate(lookAtPage(chips.includes("[data-assistant-materials]")));
    // The island repaints its chips when its first answers come back and would hide what was shown; show them again until they stay.
    let bar: Control[] = [];
    let kinds = new Set<string>();
    let fit = await evaluate<LineFit>(LINE_FIT);
    let expected = present;
    for (let attempt = 0; attempt < 5; attempt++) {
      await evaluate(showChips(chips));
      await settle();
      bar = (await evaluate<Control[]>(SHELL_CONTROLS)).filter(control => control.area === "bar");
      kinds = new Set(bar.map(control => control.kind));
      fit = await evaluate<LineFit>(LINE_FIT);
      expected = fit.touchRules ? present.filter(kind => !foldedAt(fit.stage).includes(kind)) : present;
      if (expected.every(kind => kinds.has(kind)) && (!chips.length || await evaluate<boolean>(chipsShown(chips)))) break;
    }
    assert.deepEqual(expected.filter(kind => !kinds.has(kind)), [], `${name}: every chip of the state that the line keeps is there to measure (stage "${fit.stage}")`);
    assert.deepEqual(present.filter(kind => !expected.includes(kind) && kinds.has(kind)), [], `${name}: the chips that step aside from a crowded line are not on it (stage "${fit.stage}")`);
    const small = (control: Control) => (chipWidthFree && LINE_KINDS.includes(control.kind) ? control.h : short(control)) < floor;
    assert.deepEqual(bar.filter(small).map(control => `${control.kind} 「${control.label}」 ${control.w}×${control.h}`), [], `${name}: no control of the bar is under ${floor}px`);
    assert.deepEqual(bar.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name}: every control is a known one`);
    if (insidePill) {
      assert.ok(fit.overflow <= 1, `${name}: the line does not overflow its pill (by ${fit.overflow}px; ${JSON.stringify(fit)})`);
      assert.deepEqual(fit.parts.filter(part => part.left < fit.left - 1 || part.right > fit.right + 1 || part.right > fit.vw).map(part => `${part.name} ${part.left}–${part.right}`), [],
        `${name}: every part of the line is inside its pill (${fit.left}–${fit.right}) and the window (${fit.vw})`);
    }
    assert.ok(fit.input >= (floor >= 44 ? 44 : 28), `${name}: the input keeps its box (${fit.input}px)`);
    // Taking chips off is the last resort: the step the island took was needed, and with none taken the line fits as it is.
    if (fit.stage) assert.equal(await evaluate<boolean | null>(stepBefore), true, `${name}: one step less folded than "${fit.stage}" would run over the pill, so the fold was needed`);
    // A dot on the "+" says the materials or the notice are in its menu: it is there when they are folded into it, and not otherwise.
    const dot = await evaluate<{ content: string; background: string; size: string }>(DOT);
    if (fit.stage === "chips" && fit.touchRules) {
      assert.notEqual(dot.content, "none", `${name}: the "+" carries a dot while its menu holds the folded chips`);
      assert.equal(dot.size, "8px 8px", `${name}: an 8px dot`);
      assert.notEqual(dot.background, "rgba(0, 0, 0, 0)", `${name}: and it is painted, not an empty box`);
    } else assert.equal(dot.content, "none", `${name}: the "+" has no dot while nothing is folded into it (stage "${fit.stage}")`);
    // What a crowded line folded into the "+" menu is there, as tall as a touch target, and opens the same list the chip did.
    const aside = present.filter(kind => ["materials chip", "attention chip"].includes(kind) && !expected.includes(kind));
    if (aside.length) {
      const menu = await evaluate<{ open: boolean; labels: string[]; heights: number[]; opens: Record<string, boolean>; closes: Record<string, boolean> }>(MORE_MENU);
      assert.equal(menu.open, true, `${name}: the "+" button opens its menu`);
      if (aside.includes("materials chip")) { assert.ok(menu.labels.includes("本次发送带上的材料"), `${name}: the "+" menu lists the folded materials (${menu.labels})`); assert.equal(menu.opens.materials, true, `${name}: and opens their list`); assert.equal(menu.closes.materials, true, `${name}: which a click elsewhere puts away`); }
      if (aside.includes("attention chip")) { assert.ok(menu.labels.includes("需要你看看"), `${name}: the "+" menu lists the folded notice (${menu.labels})`); assert.equal(menu.opens.notices, true, `${name}: and opens the notices`); assert.equal(menu.closes.notices, true, `${name}: which Escape puts away, focus going back to the "+"`); }
      assert.deepEqual(menu.heights.filter(height => height < 44), [], `${name}: and its rows are 44px on touch (${menu.heights})`);
    }
    return { fit, expected };
  };

  /** A tap into the input and away again, as a person does to type and dismiss the keyboard. The phone hides the chips while the input has
   * focus and the focus repaints the materials chip; the line must come back as it was, the same steps and inside its pill (it is measured
   * with its chips on it, whether or not typing hides them). */
  const typeAndLeave = async (name: string, before: LineFit, phoneWidth: boolean) => {
    type Typing = { stage: string; fit: string; overflow: number; sendRight: number; pillRight: number; focused: boolean; chips: string[] };
    await evaluate(`document.querySelector("[data-assistant-input]").focus()`);
    await settle();
    const typing = await evaluate<Typing>(TYPING);
    await evaluate(`document.querySelector("[data-assistant-input]").blur()`);
    await settle();
    const after = await evaluate<Typing>(TYPING);
    assert.equal(typing.focused, true, `${name}: the input has focus while typing`);
    if (phoneWidth) assert.deepEqual(typing.chips, [], `${name}: the phone hides the chips while the input has focus, so this is the case that used to lose the steps`);
    assert.deepEqual([typing.stage, typing.fit], [before.stage, before.fit], `${name}: the steps do not depend on the input's focus (typing: ${JSON.stringify(typing)})`);
    assert.deepEqual([after.stage, after.fit], [before.stage, before.fit], `${name}: after the input lets go the line has the steps it had (${JSON.stringify(after)})`);
    assert.ok(after.overflow <= 1, `${name}: and it does not overflow its pill (by ${after.overflow}px)`);
    assert.ok(after.sendRight <= after.pillRight + 1, `${name}: send ends inside the pill (${after.sendRight} of ${after.pillRight})`);
  };

  /** Opens what a button of the Assistant line opens, presses Escape in it, and says whether it closed and where focus went: back to the
   * button, or to the "+" when the island has taken that chip off the line (the chip is not there to take focus back). */
  const escapeReturns = (button: string, popover: string) => evaluate<{ opened: boolean; closed: boolean; focus: boolean; onButton: boolean }>(`(async () => {
    const button = document.querySelector(${JSON.stringify(button)}), popover = document.querySelector(${JSON.stringify(popover)}), attach = document.querySelector("[data-assistant-attach]");
    button.click(); await new Promise((resolve) => setTimeout(resolve, 250));
    const opened = !popover.hidden;
    popover.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { opened, closed: popover.hidden, focus: document.activeElement === (button.checkVisibility() ? button : attach), onButton: document.activeElement === button };
  })()`);

  /** A send without a model keeps the work, which is all the chip needs; the island remembers it as this viewer's current work. */
  const makeCurrentWork = () => evaluate(`(async () => {
    const api = ${JSON.stringify(`/projects/${projectId}/api/assistant`)};
    await fetch(api + "/send", { method: "POST", headers: { ...(globalThis.molisWorkControlHeaders?.() || {}), "content-type": "application/json" },
      body: JSON.stringify({ text: "整理一下本周的待办", request_id: "touch-targets-1" }) });
    const { works } = await fetch(api + "/works").then(response => response.json());
    localStorage.setItem("molis.assistant.current", works[0].work_id);
  })()`);

  /** The rows of the "+" menu, as a person who opens it sees them. */
  const moreLabels = () => evaluate<string[]>(`(async () => {
    const attach = document.querySelector("[data-assistant-attach]"), more = document.querySelector("[data-assistant-more]");
    attach.click(); await new Promise((resolve) => setTimeout(resolve, 120));
    const labels = [...more.querySelectorAll(".assistant-more-item")].map((row) => row.querySelector(".assistant-more-label").textContent);
    attach.click();
    return labels;
  })()`);

  return { start, open, short, settle, shellFindings, line, typeAndLeave, moreLabels, makeCurrentWork, escapeReturns, evaluate, waitFor };
}

const NEW_WORK = ["[data-assistant-executor]", "[data-assistant-materials]", "[data-assistant-attention]", "[data-assistant-mode]"];
const NEW_WORK_KINDS = ["executor chip", "materials chip", "attention chip", "mode chip"];
/** What a work's line can show at most: the island shows a Character only on a work that is not Coding and the mode only on a Coding one. */
const WITH_CHARACTER = ["[data-assistant-materials]", "[data-assistant-attention]", "[data-assistant-character]"];
const WITH_MODE = ["[data-assistant-materials]", "[data-assistant-attention]", "[data-assistant-mode]"];
const BASE = ["work chip", "work chip clear", "materials chip", "attention chip"];
/** The windows where a phone's Assistant line is tight: 320 and 360 are the narrow phones, 390 the common one, and 640, 667 and
 * 740 are phones held sideways (the Dock and residents trays leave the line 214, 241 and 314px), 852 the one that has room. */
const LINE_WINDOWS = [[320, 568], [360, 740], [390, 844], [640, 360], [667, 375], [740, 360], [852, 393]] as const;
const LINE_STATES = [
  ["a current work", [], ["work chip", "work chip clear"]],
  ["a current work with its materials and a notice", ["[data-assistant-materials]", "[data-assistant-attention]"], BASE],
  ["a Coding work", ["[data-assistant-mode]"], ["work chip", "work chip clear", "mode chip"]],
  ["a work with materials, a notice and a Character", WITH_CHARACTER, [...BASE, "character chip"]],
  ["a Coding work with its materials and a notice", WITH_MODE, [...BASE, "mode chip"]],
] as const;

for (const scheme of ["light", "dark"] as const) {
  test(`touch windows: the shell's controls are 44px and the Assistant line stays inside its pill · ${scheme}`, { timeout: 420_000 }, async t => {
    const browser = await openGoalBrowser(t, "seeded");
    if (!browser) return;
    const w = windowsOf(browser, scheme, true);
    await w.start();

    // A phone. Three screens carry every control: the project's home, a plugin's page (its location chip), and the project's
    // settings (a cover chip with its close mark, and the directory toggle: the widest the bar gets, eight 44px targets in its
    // second row). 390 and 375px hold all three; 350px, the narrowest the second row holds, holds the two without a directory.
    const seen = new Set<string>();
    const HOME = ["home", "", "true"] as const, PLUGIN = ["a plugin's page", "?openPlugin=todo", "!!document.querySelector('.tab-view-chip')"] as const;
    const SETTINGS = ["the project's settings", "settings", "!!document.querySelector('.tab-view-chip-close')"] as const;
    for (const [width, height, screens] of [[390, 844, [HOME, PLUGIN, SETTINGS]], [375, 667, [HOME, PLUGIN, SETTINGS]], [350, 640, [HOME, PLUGIN]]] as const) {
      for (const [name, path, ready] of screens) {
        const controls = await w.open(width, height, path, ready);
        for (const control of controls) seen.add(control.kind);
        assert.deepEqual(controls.filter(control => w.short(control) < 44).map(control => `${control.kind} 「${control.label}」 ${control.w}×${control.h}`), [],
          `${name} · ${width}: every control of the strip and the bar is a 44px target`);
        assert.deepEqual(controls.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name} · ${width}: a control this test does not know is a control nobody measured`);
        assert.deepEqual(await w.shellFindings(), [], `${name} · ${width}: the bar and the strip lay out cleanly with 44px targets`);
      }
    }
    assert.deepEqual(Object.values(KINDS).filter(kind => !LINE_KINDS.includes(kind) && !seen.has(kind)), [], "the three screens showed every kind of control, so none went unmeasured");

    // The Assistant line stays a 44px input with room to type, and its attach and send keep their size while typing.
    await w.evaluate(`(() => { const input = document.querySelector('[data-assistant-input]'); input.focus(); input.value = '整理一下本周的待办'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const typing = (await w.evaluate<Control[]>(SHELL_CONTROLS)).filter(control => control.kind.startsWith("assistant"));
    assert.equal(typing.length, 3, "input, attach and send are all there while typing");
    assert.deepEqual(typing.filter(control => w.short(control) < 44), [], "and are still 44px");
    assert.ok(typing.find(control => control.kind === "assistant input")!.w >= 120, "the input keeps room to type");

    // A phone held sideways (852×393) and a tablet (1024×768) are wider than 600px but their pointer is coarse: the strip and
    // the bar are 44px there too, and a short window does not take the desktop's 34px Dock buttons.
    for (const [name, width, height] of [["a phone held sideways", 852, 393], ["a tablet", 1024, 768]] as const) {
      for (const [screen, path, ready] of [["home", "", "true"], ["the project's settings", "settings", "!!document.querySelector('.tab-view-chip-close')"]] as const) {
        const controls = await w.open(width, height, path, ready);
        assert.deepEqual(controls.filter(control => w.short(control) < 44).map(control => `${control.kind} 「${control.label}」 ${control.w}×${control.h}`), [],
          `${name} · ${screen} · ${width}×${height}: every control of the strip and the bar is a 44px target`);
        assert.deepEqual(controls.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name} · ${screen}: every control is a known one`);
        assert.deepEqual(await w.shellFindings(), [], `${name} · ${screen} · ${width}×${height}: the bar and the strip lay out cleanly with 44px targets`);
      }
    }

    // The Assistant line in the states the seeded project does not start in. The chips of a state are the ones the island shows
    // beside the input then (it hides them otherwise); what is measured is their box on the real bar. A new work whose carrier
    // was chosen, with the chips that wait beside the input, comes first; then a current work, whose chip stands in front of the
    // input with a mark to start a new work instead. Phones of 360 and 390px and sideways phones of 640, 667, 740 and 852px.
    for (const [width, height] of [[390, 844], [852, 393]] as const) {
      await w.open(width, height, "", "true");
      await w.line(`a new work · ${width}`, NEW_WORK, NEW_WORK_KINDS, 44);
      assert.deepEqual(await w.shellFindings(), [], `a new work · ${width}: the bar lays out cleanly with 44px chips`);
    }
    await w.makeCurrentWork();
    const stages: Record<string, string> = {};
    for (const [width, height] of LINE_WINDOWS) {
      await w.open(width, height, "", "true");
      for (const [name, chips, kinds] of LINE_STATES) {
        const { fit } = await w.line(`${name} · ${width}`, [...chips], [...kinds], 44);
        stages[`${width} ${name}`] = fit.stage;
        await w.typeAndLeave(`${name} · ${width}`, fit, width <= 600);
        // The bar's second row holds seven 44px targets (nine with a plugin's directory); that needs 350px, so the 320px window
        // is measured for the Assistant line only.
        if (width >= 350) assert.deepEqual(await w.shellFindings(), [], `${name} · ${width}: the bar lays out cleanly with 44px chips`);
        assert.ok(fit.input >= (width <= 600 ? 64 : 44), `${name} · ${width}: the input keeps its floor beside the chips (${fit.input}px)`);
      }
    }
    // The steps, window by window: a line that fits folds nothing, and the narrower the window the more it folds, never a chip it
    // could keep. These are the stages the island reaches at 44px targets; a change here is a change in what a phone's line shows.
    assert.deepEqual(Object.fromEntries(Object.entries(stages).filter(([key]) => /^(390|360|667) /.test(key))), {
      "390 a current work": "", "390 a current work with its materials and a notice": "", "390 a Coding work": "",
      "390 a work with materials, a notice and a Character": "choosers", "390 a Coding work with its materials and a notice": "choosers",
      "360 a current work": "", "360 a current work with its materials and a notice": "mark", "360 a Coding work": "",
      "360 a work with materials, a notice and a Character": "mark", "360 a Coding work with its materials and a notice": "mark",
      "667 a current work": "", "667 a current work with its materials and a notice": "chips", "667 a Coding work": "choosers",
      "667 a work with materials, a notice and a Character": "chips", "667 a Coding work with its materials and a notice": "chips",
    }, "the steps the island takes at 390, 360 and 667px");
    assert.equal(stages["640 a current work"], "mark", "a bare current work in a 640×360 window folds the mark and nothing else");

    // A tablet's line, with every chip a work can show.
    await w.open(1024, 768, "", "true");
    await w.line("a work with a Coding mode and every chip · 1024", WITH_MODE, [...BASE, "mode chip"], 44);
    await w.line("a work with a Character and every chip · 1024", WITH_CHARACTER, [...BASE, "character chip"], 44);
    assert.deepEqual(await w.shellFindings(), [], "a work with every chip · 1024: the bar lays out cleanly");
  });

  test(`a fine-pointer window keeps the desktop bar's written sizes and its floor · ${scheme}`, { timeout: 300_000 }, async t => {
    const browser = await openGoalBrowser(t, "seeded");
    if (!browser) return;
    const w = windowsOf(browser, scheme, false);
    await w.start();

    // A desktop window: the exception is the sizes DESIGN.md names, and its floor holds.
    const floors = { strip: 20, bar: 28 };
    for (const [name, path, ready] of [
      ["home", "", "true"],
      ["the project's settings", "settings", "!!document.querySelector('.tab-view-chip-close')"],
    ] as const) {
      const controls = await w.open(1280, 800, path, ready);
      assert.deepEqual(controls.filter(control => w.short(control) < floors[control.area]).map(control => `${control.kind} ${control.w}×${control.h}`), [],
        `${name} · 1280: nothing in the strip is under ${floors.strip}px or in the bar under ${floors.bar}px`);
      assert.deepEqual(controls.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name} · 1280: every control is a known one`);
      const input = controls.find(control => control.kind === "assistant input");
      assert.ok(input && input.h <= 32, "the desktop Assistant line stays the 28px line the exception describes, not a phone's 44px");
      assert.ok(controls.some(control => w.short(control) < 44), `${name} · 1280: the desktop chrome is denser than 44px, as the exception says`);
    }

    // A short window: DESIGN.md writes the Dock, resident and switcher buttons as 34px there, and the floors still hold.
    const shortWindow = await w.open(1280, 500, "", "true");
    assert.deepEqual(shortWindow.filter(control => w.short(control) < floors[control.area]).map(control => `${control.kind} ${control.w}×${control.h}`), [],
      "a short window · 1280×500: nothing in the strip is under 20px or in the bar under 28px");
    assert.deepEqual(shortWindow.filter(control => ["dock", "resident", "plugin switcher"].includes(control.kind) && control.area === "bar").map(control => control.h).filter(h => h !== 34), [],
      "a short window · 1280×500: the Dock, resident and switcher buttons are the 34px DESIGN.md writes");

    // The Assistant line in the states the seeded project does not start in, on the desktop bar's 28px floor.
    await w.open(1280, 800, "", "true");
    await w.line("a new work · 1280", NEW_WORK, NEW_WORK_KINDS, floors.bar);
    // Escape puts away what a button of the line opened and gives it focus back: the "+" menu and the choosers' lists.
    for (const [name, button, popover] of [["the + menu", "[data-assistant-attach]", "[data-assistant-more]"], ["who does it", "[data-assistant-executor]", "[data-assistant-executors]"],
      ["the mode", "[data-assistant-mode]", "[data-assistant-modes]"], ["the notices", "[data-assistant-attention]", "[data-assistant-notices]"]] as const) {
      assert.deepEqual(await w.escapeReturns(button, popover), { opened: true, closed: true, focus: true, onButton: true }, `${name} · 1280: Escape closes it and focus goes back to its button`);
    }
    await w.makeCurrentWork();
    await w.open(1280, 800, "", "true");
    await w.line("a current work · 1280", [], ["work chip", "work chip clear"], floors.bar);
    await w.line("a Coding work with every chip · 1280", WITH_MODE, [...BASE, "mode chip"], floors.bar);
    await w.line("a work with a Character and every chip · 1280", WITH_CHARACTER, [...BASE, "character chip"], floors.bar);
    const character = await w.escapeReturns("[data-assistant-character]", "[data-assistant-characters]");
    assert.deepEqual([character.opened, character.closed, character.focus], [true, true, true], `the Character · 1280: Escape closes its list and focus goes to the control that opened it, or the "+" (${JSON.stringify(character)})`);
    await w.open(1280, 500, "", "true");
    await w.line("a current work · short window 1280×500", [], ["work chip", "work chip clear"], floors.bar);

    // A narrow desktop window (700px, where the Assistant's column is 302px): a crowded line squeezes its chips narrower than 28px
    // but never shorter, stays inside its pill, and keeps its input, attach and send at their sizes. Nothing is folded away here.
    await w.open(700, 800, "", "true");
    for (const [name, chips, kinds] of LINE_STATES) {
      const { fit } = await w.line(`${name} · 700`, [...chips], [...kinds], floors.bar, true);
      assert.equal(fit.touchRules, false, "a fine-pointer window of 700px does not take the phone's rules");
    }

    // Just wider than a phone (620px, fine pointer) the line is not a touch window either: the island's steps are made for 44px targets
    // and the stylesheet applies them only there, so the island takes none and puts nothing into the "+" menu while the chips are on the
    // line, however crowded it is. (A crowded line this narrow still runs past its pill, as it did before this branch; not measured here.)
    await w.open(620, 800, "", "true");
    for (const [name, chips, kinds] of LINE_STATES) {
      const { fit } = await w.line(`${name} · 620`, [...chips], [...kinds], floors.bar, true, false);
      assert.equal(fit.touchRules, false, "a fine-pointer window of 620px does not take the phone's rules");
      assert.equal(fit.stage, "", `${name} · 620: so the island marks no step`);
      assert.deepEqual(await w.moreLabels(), ["添加文件或图片…", "引用项目里的内容", "用一个能力或方法"], `${name} · 620: and the "+" menu lists its usual rows, not the chips that are still on the line`);
    }
  });
}
