import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { layoutFindings } from "./fixtures/layout-audit.js";
import { renderInteractionNextSteps } from "@molis-ai/molis-work-design-system";

// DESIGN.md → Focus and accessibility: every target is 44px wherever the pointer is coarse (a phone, a phone held sideways, a
// tablet) or the window is a phone's width, and the desktop window's chrome (the title bar's tab strip and the bottom bar) keeps
// one written, scoped exception for fine-pointer windows. This measures both sides on the real shell. Touch windows, 390×844,
// 852×393 and 1024×768: every control of the strip and of the bar is 44px on its short side, the bar and the strip lay out
// cleanly with them. The Assistant line stays inside its pill in the states the seeded project does not start in (a current
// work with its chip and the chip's mark, the chips that come and go beside the input, and the crowd of them all) at the widths
// where it is tight: 320, 360 and 390px phones and the 640, 667, 740 and 852px sideways phones. A line that cannot hold them at
// 44px folds in steps (the choosers, then the work chip's mark, then the notice into the "+" menu); each step is taken only when
// the one before it still overflowed, and nothing it folds is lost. The states are the ones the island can show (a Character
// belongs to a work that is not Coding and the mode to one that is), and a tap into the input and away again (the phone hides the
// chips while typing) leaves the steps where they were. What the next Send carries is the strip above the line (context-program
// §21.2 point 1), measured with what the bar opens.
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
  ".bar-chat": "side panel",
  ".navigator-project-selector": "project",
  "[data-home-plugin-open]": "home plugin", // ISSUE-30: the declared Home tools remain visible in the titlebar.
  ".immersive-show-directory, .navigator-directory-toggle": "directory toggle",
  ".workspace-history-button": "history",
  ".tab-item-trigger": "tab",
  ".tab-item-close": "tab close",
  ".tab-add-button": "open plugin",
  ".tab-split-button": "layout",
  "[data-home-plugin-open]": "home tool",
  ".tab-view-chip-close": "cover close",
  ".assistant-target-main": "work chip",
  ".assistant-target-clear": "work chip clear",
  ".assistant-strip-act, .assistant-strip-chip.is-work": "strip chip",
  ".assistant-attention": "attention chip",
  "[data-assistant-executor]": "executor chip",
  "[data-assistant-character]": "character chip",
  "[data-assistant-mode]": "mode chip",
};
/** The chips of the Assistant line that exist only in some states; the base screens do not show them. */
const LINE_KINDS = ["work chip", "work chip clear", "strip chip", "attention chip", "executor chip", "character chip", "mode chip"];

/** What each step of the island's fold takes off a line that is still over its pill's edge, in order; a step includes the ones before it. */
const FOLD_STEPS: Array<[string, string[]]> = [
  ["choosers", ["executor chip", "character chip", "mode chip"]],
  ["mark", ["work chip clear"]],
  ["chips", ["attention chip"]],
];
const foldedAt = (stage: string) => {
  const reached = FOLD_STEPS.findIndex(([name]) => name === stage);
  return reached < 0 ? [] : FOLD_STEPS.slice(0, reached + 1).flatMap(([, kinds]) => kinds);
};

/** Shows chips of the Assistant line as the island paints them when they have something to say (it hides them otherwise). */
const OPTIONAL_CHIPS = ["[data-assistant-attention]", "[data-assistant-executor]", "[data-assistant-character]", "[data-assistant-mode]"];
const showChips = (selectors: string[]) => `(() => {
  for (const selector of ${JSON.stringify(OPTIONAL_CHIPS)}) { const chip = document.querySelector(selector); chip.hidden = true; chip.removeAttribute("data-chosen"); }
  const words = { "[data-assistant-attention-count]": "3", "[data-assistant-mode-label]": "方式：执行", "[data-assistant-character-label]": "角色：评审" };
  for (const selector of ${JSON.stringify(selectors)}) {
    const chip = document.querySelector(selector);
    chip.hidden = false;
    if (/executor|character/.test(selector)) chip.setAttribute("data-chosen", "");
  }
  for (const [selector, text] of Object.entries(words)) { const span = document.querySelector(selector); if (span && !span.closest("[hidden]")) span.textContent = text; }
})()`;
/** A page object on show, with a passage of it selected: the strip above the line offers the object as a dashed chip with + and
 * carries the passage as a chip with ×, so both of its buttons are measured. */
const PAGE_TITLE = "本周需求说明文档";
const lookAtPage = (on: boolean) => `(() => {
  document.querySelectorAll("[data-test-page-object]").forEach(el => el.remove());
  if (!${on}) return;
  const page = document.createElement("div");
  page.setAttribute("data-test-page-object", "");
  page.style.cssText = "position:fixed;top:60px;left:10px;width:50px;height:20px";
  document.body.append(page);
  page.setAttribute("data-assistant-context", JSON.stringify({ plugin_id: "todo", object: { kind: "todo_item", id: "touch-targets-page", title: ${JSON.stringify(PAGE_TITLE)} } }));
  page.textContent = "本周需求";
  const range = document.createRange(); range.selectNodeContents(page);
  getSelection().removeAllRanges(); getSelection().addRange(range);
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

/** The phone bar's second row (the switcher and the Dock at the start; the residents, a directory button and the project at the end),
 * as boxes in a line: no target may sit on its neighbour and none may leave the window. It is the row of 44px targets that touch
 * one another, so the room it needs is an exact sum of them. */
const ROW_FIT = `(() => {
  const vw = document.documentElement.clientWidth;
  const boxes = [...document.querySelectorAll(".workbench-bar :is(.bar-start, .bar-end) :is(button, summary, input, [role=tab], a[href])")]
    .filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.closest("[hidden], [inert], .plugin-picker-popover, [data-dock-overflow], .navigator-project-menu-popover"))
    .map(el => ({ name: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 12), box: el.getBoundingClientRect() }))
    .filter(item => item.box.width >= 2)
    .sort((a, b) => a.box.left - b.box.left);
  let overlap = 0, where = "";
  for (let index = 1; index < boxes.length; index++) {
    const over = boxes[index - 1].box.right - boxes[index].box.left;
    if (over > overlap) { overlap = over; where = boxes[index - 1].name + " / " + boxes[index].name; }
  }
  const outside = boxes.length ? Math.max(0, -boxes[0].box.left, boxes[boxes.length - 1].box.right - vw) : 0;
  return { count: boxes.length, vw, overlap: Math.round(overlap * 10) / 10, where, outside: Math.round(outside * 10) / 10, width: boxes.reduce((sum, item) => sum + item.box.width, 0) };
})()`;

/** What the Dock folded and where it went: into its "+N" button's list while that button has room on the row, otherwise into the switcher,
 * which lists every plugin of the project (the kept ones too). 项目首页 is on the Dock either way; nothing the Dock takes off may be lost. */
const DOCK_FOLD = `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pins = [...document.querySelectorAll("[data-dock-pins] [data-dock-pin]")];
  const hidden = pins.filter(pin => pin.hidden).map(pin => pin.dataset.dockPin).sort();
  const all = pins.map(pin => pin.dataset.dockPin).sort();
  const more = document.querySelector("[data-dock-more]");
  const shown = !!more?.isConnected && more.checkVisibility();
  let listed = [];
  if (shown) {
    more.click(); await wait(200);
    listed = [...document.querySelectorAll("[data-dock-overflow] [data-dock-pin]")].map(row => row.dataset.dockPin).sort();
    more.click(); await wait(100);
  }
  const toggle = document.querySelector("[data-plugin-picker-toggle]");
  toggle.click(); await wait(250);
  const reachable = hidden.filter(id => document.querySelector('[data-plugin-picker-popover] [data-plugin-id="' + id + '"]')).sort();
  toggle.click(); await wait(100);
  return { pins: all, hidden, listed, reachable, more: shown, home: pins.some(pin => pin.dataset.dockPin === "home" && !pin.hidden) };
})()`;

/** Every popover the bar opens, with the controls inside it that are shorter or narrower than 44px. The notices are the island's own rows,
 * fed by an answer to its read of them; the strip has a page object to offer. `present` names what must be in the list, so a
 * list that did not open (or lost its buttons) cannot pass by having nothing to measure. */
const POPOVER_CONTENTS: Array<[string, string, string, string[]]> = [
  ["the + menu", "[data-assistant-attach]", "[data-assistant-more]", [".assistant-more-item"]],
  ["who does it", "[data-assistant-executor]", "[data-assistant-executors]", [".assistant-starter"]],
  ["the mode", "[data-assistant-mode]", "[data-assistant-modes]", [".assistant-starter"]],
  ["the Character", "[data-assistant-character]", "[data-assistant-characters]", [".assistant-starter"]],
  ["the strip", "[data-assistant-input]", "[data-assistant-context-strip]", [".assistant-strip-act[aria-label^='加入']", ".assistant-strip-act[aria-label^='不带上']"]],
  ["the notices", "[data-assistant-attention]", "[data-assistant-notices]", ["[data-notice-action=open]", "[data-notice-action=dismiss]", "summary"]],
  ["the plugin switcher", "[data-plugin-picker-toggle]", "[data-plugin-picker-popover]", ["[data-dock-choice]", "[data-plugin-toggle]"]],
  ["the project menu", ".navigator-project-selector", ".navigator-project-menu-popover", [".navigator-project-option", ".navigator-project-manage"]],
  ["the Dock's list", "[data-dock-more]", "[data-dock-overflow]", [".dock-overflow-item"]],
  ["a suggestion", "", "[data-assistant-next-row]", ["[data-step-offer]"]],
];
/** What a list holds for a touch pointer that a fine pointer shows only under the cursor or on focus. */
const HOVER_ONLY = ["[data-dock-choice]", "[data-plugin-toggle]"];
/** Who carries the next new work, chosen the way a person chooses it: the plugin in the "who does it" list, or the Assistant (its first row). The mode and
 * the list itself belong to a work a plugin carries, so a list that is measured for them is measured in that state. */
const PICK_EXECUTOR = `const pickExecutor = async (plugin) => {
  const chooser = document.querySelector("[data-assistant-executor]");
  chooser.hidden = false; chooser.click(); await new Promise((resolve) => setTimeout(resolve, 300));
  const rows = [...document.querySelectorAll("[data-assistant-executors] .assistant-starter")];
  (plugin ? rows.find((row) => /Coding/.test(row.textContent)) : rows[0])?.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
};`;
const popoversScript = (floor: number) => `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  ${PICK_EXECUTOR}
  const notices = [
    { notice_id: "t1", kind: "needs-decision", text: "需要你决定发布时间", work_id: "w1" },
    { notice_id: "t2", kind: "reminder", text: "下午三点的评审", work_id: "w2", open: { surface: "todo", id: "x", title: "评审" } },
    { notice_id: "t3", kind: "finished", text: "整理待办已完成", work_id: "w3" },
    { notice_id: "t4", kind: "finished", text: "一条被规则压下的结果", work_id: "w4", held: { reason: "安静时段" } },
  ];
  const real = window.fetch;
  // The notices come with the page's one attention read (W4-10): the test's notices replace the Assistant's in its answer.
  window.fetch = (input, init) => /\\/api\\/attention\\b/.test(String(input?.url ?? input)) && !(init && init.method && init.method !== "GET")
    ? real(input, init).then(response => response.json()).then(body => new Response(JSON.stringify({ ...body, notices }), { status: 200, headers: { "content-type": "application/json" } }))
    : real(input, init);
  document.dispatchEvent(new Event("visibilitychange"));
  await wait(400);
  const out = {};
  for (const [name, button, popover, present] of ${JSON.stringify(POPOVER_CONTENTS)}) {
    // A suggestion has no button: a plugin's page hands one over and it waits above the bar.
    const opener = button ? document.querySelector(button) : { isConnected: true, click() {}, hidden: false };
    if (!opener || !opener.isConnected) { out[name] = null; continue; }
    // The mode is the plugin's: a work the Assistant carries has none. So a person first picks the plugin in "who does it", and the mode is there.
    if (name === "the mode") await pickExecutor(true);
    opener.hidden = false;
    // The strip shows while the input has focus.
    if (button) { if (opener.matches("input")) opener.focus(); else opener.click(); }
    else window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: { message_id: "touch-offer", purpose: "suggest", source: { surface: "todo", title: "待办" }, text: "整理本周的待办" } }));
    await wait(300);
    const pop = document.querySelector(popover);
    const shown = !!pop && !pop.hidden && pop.checkVisibility();
    const controls = shown ? [...pop.querySelectorAll("button, summary, a[href], input, select, textarea, [role=menuitem], [role=option]")].filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) : [];
    out[name] = {
      shown, missing: present.filter(selector => !controls.some(el => el.matches(selector))),
      items: controls.filter(el => el.matches(".dock-overflow-item")).map(el => ({ pin: el.dataset.dockPin, h: Math.round(el.getBoundingClientRect().height) })),
      small: controls.map(el => { const box = el.getBoundingClientRect(); return { cls: String(el.className).split(" ")[0] || el.tagName.toLowerCase(), label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 16), w: Math.round(box.width), h: Math.round(box.height) }; }).filter(item => Math.min(item.w, item.h) < ${floor}),
    };
    if (!pop.hidden && button) { if (opener.matches("input")) opener.blur(); else opener.click(); }
    await wait(120);
    if (name === "the mode") await pickExecutor(false);
  }
  window.fetch = real;
  return out;
})()`;

/** The mark on the "+" that points to what the island folded into its menu. */
const DOT = `(() => { const style = getComputedStyle(document.querySelector("[data-assistant-attach]"), "::after"); return { content: style.content, background: style.backgroundColor, size: style.width + " " + style.height }; })()`;

/** The line as a person sees it around typing: whether the chips the phone hides while the input has focus are on it, and where it ends. */
const TYPING = `(() => {
  const composer = document.querySelector("[data-assistant-composer]"), pill = composer.getBoundingClientRect(), send = document.querySelector("[data-assistant-send]").getBoundingClientRect();
  return { stage: composer.dataset.crowded ?? "", fit: composer.dataset.fit ?? "", overflow: composer.scrollWidth - composer.clientWidth, sendRight: Math.round(send.right), pillRight: Math.round(pill.right),
    focused: document.activeElement?.matches("[data-assistant-input]") === true,
    chips: [...composer.querySelectorAll(".assistant-target, .assistant-executor, .assistant-attention")].filter(el => el.checkVisibility()).map(el => String(el.className).split(" ")[0]) };
})()`;

/** The menus the strip opens, as a person opens them: the "+" of the strip (open a plugin), the layout button, a right-click on a tab (it makes
 * a group, so that the group's own menu has a label to open from). `rows` are the menu's rows (their size is the menu's), the rest are what sits
 * in them: the name input and the colour swatches of a group. */
type SwitcherOps = { floor: number; tileHeight: number; textRoom: number; buttons: Array<{ label: string; w: number; h: number; shown: boolean; inside: boolean }> };
type StripMenu = { shown: boolean; missing: string[]; rows: number[]; parts: Array<{ label: string; w: number; h: number; dot?: number }> };
const STRIP_MENUS = `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const tabMenu = document.querySelector("[data-workspace-tab-menu]"), layout = document.querySelector("[data-workspace-layout]");
  const close = async () => { for (const menu of [tabMenu, layout]) if (menu.matches(":popover-open")) menu.hidePopover(); await wait(100); };
  const read = (menu, present) => {
    const shown = menu.matches(":popover-open");
    const controls = shown ? [...menu.querySelectorAll("button, summary, a[href], input")].filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) : [];
    // A colour swatch is a target with a dot drawn inside it (::before): the dot is what a person sees, the box is what answers to a finger.
    const size = (el) => { const box = el.getBoundingClientRect(), swatch = (el.dataset.tabMenuAction || "").startsWith("color-");
      return { label: el.dataset.tabMenuAction || el.dataset.layoutSplit || el.dataset.layoutAction || el.tagName.toLowerCase(), w: Math.round(box.width), h: Math.round(box.height),
        dot: swatch ? Math.round(parseFloat(getComputedStyle(el, "::before").width)) : undefined }; };
    const isRow = (el) => el.matches("[data-layout-split], [data-layout-action], [data-tab-menu-action]:not([data-tab-menu-action^=color-])");
    return { shown, missing: present.filter(selector => !controls.some(el => el.matches(selector))), rows: controls.filter(isRow).map(el => Math.round(el.getBoundingClientRect().height)), parts: controls.filter(el => !isRow(el)).map(size) };
  };
  const out = {};
  document.querySelector(".tab-add-button").click(); await wait(300);
  out["the open-plugin menu"] = read(tabMenu, ["[data-tab-menu-action=open-home]"]); await close();
  document.querySelector(".tab-split-button").click(); await wait(300);
  out["the layout menu"] = read(layout, ["[data-layout-split=right]", "[data-layout-action=equal]"]); await close();
  document.querySelector(".tab-item-trigger").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })); await wait(300);
  out["a tab's menu"] = read(tabMenu, ["[data-tab-menu-action=pin]", "[data-tab-menu-action=new-group]", "[data-tab-menu-action=close]"]);
  tabMenu.querySelector("[data-tab-menu-action=new-group]")?.click(); await wait(300); await close();
  document.querySelector("[data-tab-group-toggle]")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })); await wait(300);
  out["a tab group's menu"] = read(tabMenu, ["input", "[data-tab-menu-action^=color-]", "[data-tab-menu-action=ungroup]"]); await close();
  return out;
})()`;

/** The tab bar of the opened Assistant panel, opened from the work's chip (a current work is the state that has one). */
type PanelHeader = { shown: boolean; height: number; title: number; controls: Array<{ label: string; w: number; h: number; inside: boolean }> };
const PANEL_HEADER = `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  document.querySelector(".assistant-target-main")?.click(); await wait(800);
  const panel = document.querySelector("[data-assistant-panel]"), bar = panel.querySelector(".assistant-tabbar"), box = panel.getBoundingClientRect();
  const controls = [...bar.querySelectorAll("button, [role=tab]")].filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).map(el => {
    const b = el.getBoundingClientRect();
    return { label: el.getAttribute("aria-label") || String(el.className).split(" ")[0], w: Math.round(b.width), h: Math.round(b.height), inside: b.left >= box.left - 1 && b.right <= box.right + 1 };
  });
  const title = panel.querySelector(".assistant-tab[data-current] .assistant-tab-title");
  const out = { shown: !panel.hidden, height: Math.round(bar.getBoundingClientRect().height), title: title ? Math.round(title.clientWidth) : 0, controls };
  panel.querySelector("[data-assistant-panel-close]").click(); await wait(200);
  return out;
})()`;

/** The body of the opened Assistant panel: what the panel really shows with a current work (the details pane with its blocks and the list
 * of all works), and every kind of control the island can put into a thread or the details of a work. The latter are read from the script
 * the page runs (each `el("button", "assistant-…")`) and put into the thread one each, because the states that make a person's work
 * produce them (a reply with code, a link, a question, an approval, a step list, a usage budget) need a model. A control is a target by
 * its box, except what sits inside a sentence: a link is as wide as its words and its box is 44px tall; an object chip's box is the chip,
 * and what is 44px is the area that answers to a finger (read by hit testing above and below it). */
/** The next steps above the input as the Host draws them for a work: a step that waits on the person, plain ones and the fold. */
const NEXT_STEPS_HTML = renderInteractionNextSteps([
  { id: "question:q1", label: "去回答（2 题）", source: "等你回答", primary: false, waiting: true, waitingLabel: "等你：" },
  { id: "card:c1:run", label: "记成待办：整理周报", source: "来自操作卡", primary: false },
  { id: "open:page:p1", label: "打开「周报」", source: "这一轮做出的结果", primary: false },
  { id: "retry", label: "用同样的话再试一次", source: "整理周报", primary: false },
], "下一步", { max: 3, more: count => `还有 ${count} 项` });
type BodyControl = { cls: string; w: number; h: number; hit?: boolean };
type PanelBody = { real: Record<string, BodyControl[]>; made: BodyControl[]; kinds: number; overflow: number };
const PANEL_BODY = `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  document.querySelector(".assistant-target-main")?.click(); await wait(800);
  const panel = document.querySelector("[data-assistant-panel]");
  const sizes = (root) => [...root.querySelectorAll("button, summary, a[href], input, select, textarea, [role=tab]")]
    .filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.closest("[data-test-made]"))
    .map(el => { const b = el.getBoundingClientRect(); return { cls: el.tagName.toLowerCase() + "." + String(el.className).split(" ").join("."), w: Math.round(b.width), h: Math.round(b.height) }; })
    .filter(item => item.w >= 2 && item.h >= 2);
  const real = {};
  if (panel.dataset.side !== "open") panel.querySelector("[data-assistant-side-toggle]").click();
  await wait(500);
  real["the details"] = sizes(panel.querySelector("[data-assistant-side]"));
  panel.querySelector("[data-assistant-works-toggle]").click(); await wait(300);
  real["all works"] = sizes(panel.querySelector("[data-assistant-works]"));
  panel.querySelector("[data-assistant-works-toggle]").click(); await wait(200);
  const source = [...document.scripts].find(script => /molis-work-workbench\\.js/.test(script.src));
  const text = source ? await fetch(source.src).then(response => response.text()) : "";
  const kinds = new Map();
  // RING-06: built clients remove JavaScript trivia; every control still gets measured. The bundler renames the helper where
  // a factory takes it as a parameter (\`el2\`, \`el3\`), so those calls are read too.
  for (const match of text.matchAll(/\\bel\\d*\\(\\s*"(button|summary|a|input|select|textarea|label)"\\s*,\\s*"((?:assistant|mw)-[^"]*)"/g)) kinds.set(match[1] + "." + match[2], [match[1], match[2]]);
  const thread = panel.querySelector(".assistant-thread");
  if (panel.dataset.side === "open" && panel.dataset.layout === "drawer") panel.querySelector("[data-assistant-side-toggle]").click();
  await wait(300);
  // The panel's own markup holds controls that the island shows only in some states of a work (pause, resume and stop, in the details and
  // on the strip above the thread; the jump to what waits). They are shown here, with a word in them, and put back.
  const waiting = [...panel.querySelectorAll("[data-assistant-strip], [data-assistant-control], [data-assistant-jump]")];
  const hiddenBefore = waiting.map(el => [el.hidden, el.textContent]);
  waiting.forEach(el => { el.hidden = false; if (!el.textContent.trim()) el.textContent = "文字"; });
  await wait(200);
  real["what a work shows when it runs"] = sizes(panel).filter(item => /assistant-control|assistant-jump|mw-btn/.test(item.cls));
  waiting.forEach((el, index) => { el.hidden = hiddenBefore[index][0]; el.textContent = hiddenBefore[index][1]; });
  // The next steps above the input (the suggestion there is measured with the popovers), drawn into the row and put back.
  const nextRow = document.querySelector("[data-assistant-next-row]"), rowBefore = [nextRow.hidden, nextRow.innerHTML];
  nextRow.innerHTML = ${JSON.stringify(NEXT_STEPS_HTML)}; nextRow.hidden = false; await wait(200);
  real["the next steps"] = sizes(nextRow);
  [nextRow.hidden, nextRow.innerHTML] = rowBefore;
  const holder = document.createElement("div"); holder.className = "assistant-rich"; holder.setAttribute("data-test-made", "");
  const made = [];
  for (const [tag, classes] of kinds.values()) {
    const row = document.createElement("p"); row.style.cssText = "margin:0 0 12px;position:relative";
    let control;
    if (tag === "label") { control = document.createElement("label"); control.className = classes; const box = document.createElement("input"); box.type = "radio"; control.append(box, document.createTextNode("一个选项")); }
    else { control = document.createElement(tag); control.className = classes; if (tag === "a") { control.href = "https://example.com"; control.textContent = "链接"; } else if (tag === "select") control.append(new Option("一个选项")); else if (tag !== "input" && tag !== "textarea") control.textContent = "文字"; }
    if (/assistant-link|assistant-inline-object/.test(classes)) row.append("前面的话 ", control, " 后面的话"); else row.append(control);
    holder.append(row); made.push([tag, classes, control]);
  }
  thread.append(holder); thread.scrollTop = 0; await wait(200);
  const out = made.map(([tag, classes, drawn]) => {
    // A select is drawn as a picker: the button that opens it is the target (the native select is hidden).
    const control = drawn.closest(".mw-select-picker")?.querySelector(".mw-select-picker__trigger") ?? drawn;
    control.scrollIntoView({ block: "center", behavior: "instant" }); const b = control.getBoundingClientRect();
    const seen = [];
    const hits = (y) => { const at = document.elementFromPoint(b.left + b.width / 2, y); seen.push(at ? at.tagName.toLowerCase() + "." + String(at.className).split(" ")[0] : "nothing"); return !!at && (at === control || control.contains(at)); };
    const inline = /assistant-inline-object/.test(classes);
    const hit = inline ? [hits(b.top + b.height / 2 - 21), hits(b.top + b.height / 2 + 21)].every(Boolean) : undefined;
    return { cls: tag + "." + classes.split(" ").join(".") + (hit === false ? " (hit " + seen.join(" / ") + ")" : ""), w: Math.round(b.width), h: Math.round(b.height), hit };
  });
  const result = { real, made: out, kinds: kinds.size, overflow: thread.scrollWidth - thread.clientWidth };
  holder.remove();
  panel.querySelector("[data-assistant-panel-close]").click(); await wait(200);
  return result;
})()`;

/** A finding that is about the strip or the bar (the page behind them has its own audits). */
const IN_SHELL = /bar-composer|assistant-composer|dock-pin|bar-side|bar-chat|plugin-picker|navigator-project|navigator-directory|immersive-show|workbench-bar|bar-start|bar-end|tab-view-chip|tab-item|tab-strip|tab-add|tab-split|workspace-history/;

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

/** ISSUE-30: declared Home tools stay inside the viewport, and the visible target can actually be reached. */
async function assertHomeToolsReachable(browser: Browser): Promise<void> {
  const report = await browser.evaluate<{ count: number; blocked: string[] }>(`(() => {
    const nodes = [...document.querySelectorAll('[data-home-plugin-open]')];
    const blocked = nodes.filter(el => {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2;
      const inside = r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      return !inside || ![r.top + 2, r.top + r.height / 2, r.bottom - 2].every(y => el.contains(document.elementFromPoint(x, y)));
    }).map(el => el.textContent.trim());
    return { count: nodes.length, blocked };
  })()`);
  assert.ok(report.count > 0, "the current Home tools are present");
  assert.deepEqual(report.blocked, [], "Home tools are neither clipped nor covered, including their target's top and bottom");
}

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
    await assertHomeToolsReachable(browser);
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
    for (const [key, label, list, how] of [["notices", "需要你看看", "[data-assistant-notices]", "Escape"]]) {
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
   * the work chip's mark is the panel's own "new work", the choosers are in the side pane, the notice is in the "+" menu. */
  const line = async (name: string, chips: string[], present: string[], floor: number, chipWidthFree = false, insidePill = true) => {
    if (present.includes("work chip")) await waitFor("document.querySelector('[data-assistant-target-wrap]')?.getClientRects().length > 0", 10_000);
    await evaluate(lookAtPage(false));
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
    // A dot on the "+" says the notice is in its menu: it is there when it is folded into it, and not otherwise.
    const dot = await evaluate<{ content: string; background: string; size: string }>(DOT);
    if (fit.stage === "chips" && fit.touchRules) {
      assert.notEqual(dot.content, "none", `${name}: the "+" carries a dot while its menu holds the folded chips`);
      assert.equal(dot.size, "8px 8px", `${name}: an 8px dot`);
      assert.notEqual(dot.background, "rgba(0, 0, 0, 0)", `${name}: and it is painted, not an empty box`);
    } else assert.equal(dot.content, "none", `${name}: the "+" has no dot while nothing is folded into it (stage "${fit.stage}")`);
    // What a crowded line folded into the "+" menu is there, as tall as a touch target, and opens the same list the chip did.
    const aside = present.filter(kind => kind === "attention chip" && !expected.includes(kind));
    if (aside.length) {
      const menu = await evaluate<{ open: boolean; labels: string[]; heights: number[]; opens: Record<string, boolean>; closes: Record<string, boolean> }>(MORE_MENU);
      assert.equal(menu.open, true, `${name}: the "+" button opens its menu`);
      if (aside.includes("attention chip")) { assert.ok(menu.labels.includes("需要你看看"), `${name}: the "+" menu lists the folded notice (${menu.labels})`); assert.equal(menu.opens.notices, true, `${name}: and opens the notices`); assert.equal(menu.closes.notices, true, `${name}: which Escape puts away, focus going back to the "+"`); }
      assert.deepEqual(menu.heights.filter(height => height < 44), [], `${name}: and its rows are 44px on touch (${menu.heights})`);
    }
    return { fit, expected };
  };

  /** A tap into the input and away again, as a person does to type and dismiss the keyboard. The phone hides the chips while the input has
   * focus; the line must come back as it was, the same steps and inside its pill (it is measured
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

  const chooseExecutor = (plugin: boolean) => evaluate(`(async () => { ${PICK_EXECUTOR} await pickExecutor(${plugin}); })()`);

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

  /** The bar's second row against the window, and the Dock's fold against its list: what a window of this width shows must fit and be reachable. */
  const rowFit = () => evaluate<{ count: number; vw: number; overlap: number; where: string; outside: number; width: number }>(ROW_FIT);
  const dockFold = () => evaluate<{ pins: string[]; hidden: string[]; listed: string[]; reachable: string[]; more: boolean; home: boolean }>(DOCK_FOLD);
  /** Opens every popover of the bar and the strip (the page has an object on show for it) and reports what is in each and which controls are under 44px. */
  const popovers = async (floor: number) => {
    await evaluate(lookAtPage(true));
    await settle();
    return evaluate<Record<string, { shown: boolean; missing: string[]; items: Array<{ pin: string; h: number }>; small: Array<{ cls: string; label: string; w: number; h: number }> } | null>>(popoversScript(floor));
  };
  /** The switcher's pin and add buttons, as a person with a mouse meets them: they show while a tile is looked at, so the real pointer is put on a
   * tile and what shows is measured, with the room the tile's text gives up for them. */
  const switcherOps = async () => {
    await evaluate(`(async () => { document.querySelector("[data-plugin-picker-toggle]").click(); await new Promise(resolve => setTimeout(resolve, 400)); })()`);
    const out: Record<string, SwitcherOps | null> = {};
    // The add button of a plugin the project lacks is the same element in its other state (the tile's class and the glyph shown), so one tile with a
    // usable pin and toggle stands for both; the seeded project has every plugin, and Goals' toggle is disabled and dimmed.
    for (const [kind, selector] of [["a plugin the project has", ".plugin-rail-tile:has(> .plugin-rail-ops):not([data-plugin-tile=goals])"]] as const) {
      const point = await evaluate<{ x: number; y: number } | null>(`(() => {
        const tile = document.querySelector(${JSON.stringify(".plugin-picker-popover " + selector)}); if (!tile) return null;
        tile.scrollIntoView({ block: "center", behavior: "instant" });
        const box = tile.querySelector(":scope > .plugin-rail-item").getBoundingClientRect(); return { x: box.left + box.width / 3, y: box.top + box.height / 2 };
      })()`);
      if (!point) { out[kind] = null; continue; }
      await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, sessionId);
      await evaluate(`new Promise(resolve => setTimeout(resolve, 500))`);
      out[kind] = await evaluate<SwitcherOps>(`(() => {
        const tile = document.elementFromPoint(${point.x}, ${point.y})?.closest(".plugin-rail-tile"), popover = document.querySelector(".plugin-picker-popover");
        const item = tile.querySelector(":scope > .plugin-rail-item"), ops = tile.querySelector(":scope > .plugin-rail-ops"), box = tile.getBoundingClientRect();
        const itemBox = item.getBoundingClientRect(), opsBox = ops.getBoundingClientRect();
        return { floor: parseFloat(getComputedStyle(popover).getPropertyValue("--control-h")), tileHeight: Math.round(box.height),
          buttons: [...ops.querySelectorAll(":scope > button")].map(button => { const b = button.getBoundingClientRect();
            return { label: button.hasAttribute("data-dock-choice") ? "pin" : "add or remove", w: Math.round(b.width), h: Math.round(b.height), shown: parseFloat(getComputedStyle(button).opacity) > 0 && getComputedStyle(button).transform === "none",
              inside: b.top >= box.top - 0.5 && b.bottom <= box.bottom + 0.5 && b.right <= box.right + 0.5 }; }),
          textRoom: Math.round((opsBox.left - (itemBox.right - parseFloat(getComputedStyle(item).paddingRight))) * 10) / 10 };
      })()`);
    }
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }, sessionId);
    await evaluate(`document.querySelector("[data-plugin-picker-toggle]").click()`);
    return out;
  };
  /** The menus the strip opens (open plugin, layout, a tab, a tab group) and the opened Assistant panel's tab bar. */
  const stripMenus = () => evaluate<Record<string, StripMenu>>(STRIP_MENUS);
  const panelHeader = () => evaluate<PanelHeader>(PANEL_HEADER);
  const panelBody = () => evaluate<PanelBody>(PANEL_BODY);

  /** The heights of the `mw-menu` items on the specimen board, which shows the menu as the plugin pages use it. */
  const menuRows = async (width: number, height: number) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: touch }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog` }, sessionId));
    await waitFor("document.querySelectorAll('.mw-menu__item').length > 0", 20_000);
    await settle();
    return evaluate<number[]>(`[...document.querySelectorAll(".mw-menu .mw-menu__item")].filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).map(el => Math.round(el.getBoundingClientRect().height))`);
  };

  return { start, open, short, settle, shellFindings, rowFit, dockFold, popovers, switcherOps, stripMenus, panelHeader, panelBody, menuRows, line, typeAndLeave, moreLabels, makeCurrentWork, chooseExecutor, escapeReturns, evaluate, waitFor };
}

const NEW_WORK = ["[data-assistant-executor]", "[data-assistant-attention]", "[data-assistant-mode]"];
const NEW_WORK_KINDS = ["executor chip", "attention chip", "mode chip"];
/** What a work's line can show at most: the island shows a Character only on a work that is not Coding and the mode only on a Coding one. */
const WITH_CHARACTER = ["[data-assistant-attention]", "[data-assistant-character]"];
const WITH_MODE = ["[data-assistant-attention]", "[data-assistant-mode]"];
const BASE = ["work chip", "work chip clear", "attention chip"];
/** The windows where a phone's Assistant line is tight: 320 and 360 are the narrow phones, 390 the common one, and 640, 667 and
 * 740 are phones held sideways (the Dock and residents trays leave the line 214, 241 and 314px), 852 the one that has room. */
const LINE_WINDOWS = [[320, 568], [360, 740], [390, 844], [640, 360], [667, 375], [740, 360], [852, 393]] as const;
const LINE_STATES = [
  ["a current work", [], ["work chip", "work chip clear"]],
  ["a current work with a notice", ["[data-assistant-attention]"], BASE],
  ["a Coding work", ["[data-assistant-mode]"], ["work chip", "work chip clear", "mode chip"]],
  ["a work with a notice and a Character", WITH_CHARACTER, [...BASE, "character chip"]],
  ["a Coding work with a notice", WITH_MODE, [...BASE, "mode chip"]],
] as const;

for (const scheme of ["light", "dark"] as const) {
  test(`touch windows: the shell's controls are 44px and the Assistant line stays inside its pill · ${scheme}`, { timeout: 600_000 }, async t => {
    const browser = await openGoalBrowser(t, "seeded");
    if (!browser) return;
    const w = windowsOf(browser, scheme, true);
    await w.start();

    // A phone. Three screens carry every control: the project's home, a plugin's page (its plugin tab), and the project's
    // settings (a cover chip with its close mark, and the directory toggle: the widest the bar gets, eight 44px targets in its
    // second row). The row's targets touch one another, so it is an exact sum: eight need 375px as they are. Narrower than 375px
    // the bar's column gap and side padding give way, which holds eight from 356px and seven from 312px; below that a window
    // neither overlaps the targets, shrinks one nor pushes one off the edge: the Dock drops its "+N" button and keeps 项目首页
    // (a decision of the Dock's round four), and the switcher lists what the Dock dropped. 390, 375 and 360px keep the "+N";
    // 350 and 320px are the windows that cannot.
    const seen = new Set<string>();
    const HOME = ["home", "", "true"] as const, PLUGIN = ["a plugin's page", "?openPlugin=todo", "!!document.querySelector('[data-tab-kind=\"plugin\"]')"] as const;
    const SETTINGS = ["the project's settings", "settings", "!!document.querySelector('.tab-view-chip-close')"] as const;
    const moreShown: Record<string, boolean> = {};
    // SC-4 (#1130) took the Sessions plugin, and the Dock pin it had by default, offline: the default row is one button shorter than the
    // widths below were written for, and at 390px it holds every pin, so no "+N" button would be drawn and the checks that hold it
    // next to 项目首页 on the widest row would pass over nothing. The Dock keeps what a person pinned in the page's storage, so the
    // test pins one more plugin and the row is as long as it was; the assertions below are the ones that were written for it.
    await w.open(390, 844, HOME[1], HOME[2]);
    await w.evaluate(`localStorage.setItem('molis-work:dock-pins', JSON.stringify(['goals', 'inbox', 'feed', 'todo']))`);
    for (const [width, height] of [[390, 844], [375, 667], [360, 740], [350, 640], [320, 568]] as const) {
      for (const [name, path, ready] of [HOME, PLUGIN, SETTINGS]) {
        const controls = await w.open(width, height, path, ready);
        for (const control of controls) seen.add(control.kind);
        assert.deepEqual(controls.filter(control => w.short(control) < 44).map(control => `${control.kind} 「${control.label}」 ${control.w}×${control.h}`), [],
          `${name} · ${width}: every control of the strip and the bar is a 44px target`);
        assert.deepEqual(controls.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name} · ${width}: a control this test does not know is a control nobody measured`);
        const row = await w.rowFit();
        assert.ok(row.overlap <= 0.5, `${name} · ${width}: no target of the second row sits on its neighbour (${row.overlap}px at ${row.where}; ${JSON.stringify(row)})`);
        assert.equal(row.outside, 0, `${name} · ${width}: and none leaves the window (${JSON.stringify(row)})`);
        assert.deepEqual(await w.shellFindings(), [], `${name} · ${width}: the bar and the strip lay out cleanly with 44px targets`);
        // 项目首页 never folds, and what the Dock takes off the row is not lost: it is in the "+N" list, or, when that button has no room,
        // in the switcher.
        const dock = await w.dockFold();
        assert.equal(dock.home, true, `${name} · ${width}: 项目首页 stays on the Dock`);
        if (dock.more) assert.deepEqual(dock.listed, dock.hidden, `${name} · ${width}: every Dock button the row folded is in the "+N" list (${JSON.stringify(dock)})`);
        else assert.deepEqual(dock.reachable, dock.hidden, `${name} · ${width}: with no "+N" button, every Dock button the row dropped is in the switcher's list (${JSON.stringify(dock)})`);
        moreShown[`${width} ${name}`] = dock.more;
      }
    }
    // One button at the bar's end instead of three (side-shelf §3.1) leaves every width room for 项目首页 and the "+N" button,
    // even beside the directory button at 320px. Should the row ever run short, the "+N" gives way and the check above holds
    // the dropped buttons to the switcher's list.
    for (const width of [390, 375, 360, 350, 320]) assert.equal(moreShown[`${width} the project's settings`], true, `${width}px holds the widest row with 项目首页 and the "+N" button`);
    assert.equal(moreShown["320 home"], true, "without the directory button the row holds the \"+N\" button even at 320px");

    // The Dock's "+N" list is measured where it has to exist. The popovers loops below skip it in a window that holds every pin, which is
    // right for a wide one but would let the 44px check of its items pass over nothing; the 320px home is the scene that always overflows
    // (the four pins above plus 项目首页 do not fit beside the "+N" button), so it asserts the list itself and cannot reach a skip.
    await w.open(320, 568, HOME[1], HOME[2]);
    const folded = await w.dockFold();
    assert.ok(folded.hidden.length > 0, `320px home: the Dock folds some pins (${JSON.stringify(folded)})`);
    assert.equal(folded.more, true, `320px home: and draws the "+N" button for them (${JSON.stringify(folded)})`);
    assert.deepEqual(folded.listed, folded.hidden, `320px home: the "+N" list holds exactly the pins the row folded (${JSON.stringify(folded)})`);
    assert.deepEqual([...folded.pins.filter(pin => !folded.hidden.includes(pin)), ...folded.listed].sort(), folded.pins,
      `320px home: the pins on the row plus the pins in the list are the whole set, none lost and none twice (${JSON.stringify(folded)})`);
    for (const pin of ["home", "goals", "inbox", "feed", "todo"]) assert.ok(folded.pins.includes(pin), `320px home: the Dock drew ${pin} (${JSON.stringify(folded)})`);
    const dockList = (await w.popovers(44))["the Dock's list"];
    assert.ok(dockList, "320px home: the \"+N\" button is there to open the Dock's list");
    assert.equal(dockList.shown, true, "320px home: the Dock's list opens");
    assert.deepEqual(dockList.missing, [], "320px home: the Dock's list holds its items");
    assert.ok(dockList.items.length > 0, "320px home: the Dock's report is not empty");
    assert.deepEqual(dockList.items.map(item => item.pin).sort(), folded.hidden, "320px home: the report's items are the pins the row folded");
    assert.deepEqual(dockList.items.filter(item => item.h < 44).map(item => `${item.pin} ${item.h}px`), [], "320px home: every item of the Dock's list is a 44px target");
    assert.deepEqual(dockList.small, [], "320px home: and nothing else in it is smaller");
    t.diagnostic(`the Dock's "+N" list at 320px held ${dockList.items.length} items (${dockList.items.map(item => `${item.pin} ${item.h}px`).join(", ")}) beside ${folded.pins.length - folded.hidden.length} pins on the row`);
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

    // What the bar opens is a 44px target too: the lists of the Assistant's line (the "+" menu, who does it, the mode, the Character,
    // the notices with their buttons, the strip's add and remove buttons), the plugin switcher with its pin and add buttons,
    // the Dock's "+N" list and the project menu. The folding steps above send people into these lists, so a row that is smaller
    // than a finger is a step that does not work.
    for (const [name, width, height] of [["a phone", 390, 844], ["a narrow phone", 360, 740], ["a tablet", 1024, 768]] as const) {
      await w.open(width, height, "", "true");
      const lists = await w.popovers(44);
      for (const [list] of POPOVER_CONTENTS) {
        const report = lists[list];
        if (report === null && list === "the Dock's list") continue; // a window that holds every pin has no "+N"
        assert.ok(report, `${name} · ${width}: ${list} has a button that opens it`);
        assert.equal(report.shown, true, `${name} · ${width}: ${list} opens`);
        assert.deepEqual(report.missing, [], `${name} · ${width}: ${list} holds the controls this test measures`);
        assert.deepEqual(report.small.map(item => `${item.cls} 「${item.label}」 ${item.w}×${item.h}`), [], `${name} · ${width}: every control in ${list} is a 44px target`);
      }
    }

    // The strip's own menus (open a plugin, the layout, a tab, a tab group) are lists too: their rows, the group's name input and its colour
    // swatches are 44px targets on a phone and on a tablet, the swatches drawn small inside their target.
    for (const [name, width, height] of [["a phone", 390, 844], ["a narrow phone", 360, 740], ["a tablet", 1024, 768]] as const) {
      await w.open(width, height, "?openPlugin=todo", "!!document.querySelector('[data-tab-kind=\"plugin\"]') && !!document.querySelector('.tab-item-trigger')");
      const menus = await w.stripMenus();
      for (const [menu, report] of Object.entries(menus)) {
        assert.equal(report.shown, true, `${name} · ${width}: ${menu} opens`);
        assert.deepEqual(report.missing, [], `${name} · ${width}: ${menu} holds the controls this test measures`);
        assert.deepEqual(report.rows.filter(row => row < 44), [], `${name} · ${width}: every row of ${menu} is 44px tall (${report.rows})`);
        assert.deepEqual(report.parts.filter(part => Math.min(part.w, part.h) < 44).map(part => `${part.label} ${part.w}×${part.h}`), [], `${name} · ${width}: and what sits in ${menu} is a 44px target`);
      }
      assert.ok(menus["a tab group's menu"].parts.filter(part => part.label.startsWith("color-")).length >= 8, `${name} · ${width}: the group's menu offers its colours`);
      assert.deepEqual([...new Set(menus["a tab group's menu"].parts.filter(part => part.label.startsWith("color-")).map(part => part.dot))], [18], `${name} · ${width}: and each is drawn as an 18px dot inside its target`);
    }

    // A menu a plugin page opens (the specimen board shows `mw-menu` as the pages use it) has 44px items on a phone and on a tablet.
    for (const [width, height] of [[390, 844], [1024, 768]] as const) {
      const rows = await w.menuRows(width, height);
      assert.ok(rows.length > 0, `the specimen board shows menu items at ${width}`);
      assert.deepEqual(rows.filter(row => row < 44), [], `mw-menu items are 44px tall at ${width} (${rows})`);
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
    // The opened Assistant panel's tab bar (the work's tab and its close mark, new work, all works, details, minimize) is a row of 44px
    // targets that stays inside the panel and leaves the tab a title, at the phones' widths, held sideways and on a tablet.
    for (const [width, height] of [[320, 568], [360, 740], [390, 844], [852, 393], [1024, 768]] as const) {
      await w.open(width, height, "", "true");
      const header = await w.panelHeader();
      assert.equal(header.shown, true, `the panel opens from the work's chip at ${width}`);
      assert.ok(header.controls.length >= 5, `the panel's tab bar has its tab, close mark and four buttons at ${width} (${JSON.stringify(header.controls)})`);
      assert.deepEqual(header.controls.filter(control => Math.min(control.w, control.h) < 44).map(control => `${control.label} ${control.w}×${control.h}`), [], `panel header · ${width}: every control is a 44px target`);
      assert.deepEqual(header.controls.filter(control => !control.inside).map(control => control.label), [], `panel header · ${width}: and none leaves the panel`);
      assert.ok(header.title >= 40, `panel header · ${width}: the work's tab keeps room for a title (${header.title}px)`);
    }
    // The opened panel's body is 44px too: the details of the work (its blocks, actions and the hint to add a file), the list of all works,
    // and each kind of control the island can put into a thread or into the details of a work. A kind this test has not seen the
    // island create cannot slip in: they are read from the script the page runs.
    for (const [width, height] of [[320, 568], [360, 740], [390, 844], [852, 393], [1024, 768]] as const) {
      await w.open(width, height, "", "true");
      const body = await w.panelBody();
      assert.ok(body.kinds >= 30, `panel body · ${width}: the island's controls were read from the page's script (${body.kinds} kinds)`);
      assert.ok(body.made.length === body.kinds, `panel body · ${width}: and each was put into the thread`);
      for (const [place, kinds] of [["the details", ["assistant-block-head", "assistant-side-action"]], ["all works", ["assistant-works-item"]], ["what a work shows when it runs", ["assistant-control", "assistant-jump"]], ["the next steps", ["mw-ix-step", "mw-ix-steps__more"]]] as const) {
        assert.ok(kinds.every(kind => body.real[place].some(item => item.cls.includes(kind))), `panel body · ${width}: ${place} shows what this test measures (${JSON.stringify(body.real[place])})`);
        assert.deepEqual(body.real[place].filter(item => Math.min(item.w, item.h) < 44).map(item => `${item.cls} ${item.w}×${item.h}`), [], `panel body · ${width}: every control in ${place} is a 44px target`);
      }
      const inSentence = (item: BodyControl) => /assistant-link|assistant-inline-object/.test(item.cls);
      assert.deepEqual(body.made.filter(item => !inSentence(item) && Math.min(item.w, item.h) < 44).map(item => `${item.cls} ${item.w}×${item.h}`), [], `panel body · ${width}: every kind of control the island makes is a 44px target`);
      assert.deepEqual(body.made.filter(item => /assistant-link/.test(item.cls) && item.h < 44).map(item => `${item.cls} ${item.w}×${item.h}`), [], `panel body · ${width}: a link in a sentence is 44px tall (as wide as its words)`);
      assert.deepEqual(body.made.filter(item => /assistant-inline-object/.test(item.cls) && !(item.hit && item.w >= 44)).map(item => `${item.cls} ${item.w}×${item.h}`), [], `panel body · ${width}: an object chip in a sentence answers to a finger 44px above and below it`);
      assert.ok(body.overflow <= 1, `panel body · ${width}: and they do not push the thread sideways (${body.overflow}px)`);
    }
    const stages: Record<string, string> = {};
    for (const [width, height] of LINE_WINDOWS) {
      await w.open(width, height, "", "true");
      for (const [name, chips, kinds] of LINE_STATES) {
        const { fit } = await w.line(`${name} · ${width}`, [...chips], [...kinds], 44);
        stages[`${width} ${name}`] = fit.stage;
        await w.typeAndLeave(`${name} · ${width}`, fit, width <= 600);
        assert.deepEqual(await w.shellFindings(), [], `${name} · ${width}: the bar lays out cleanly with 44px chips`);
        assert.ok(fit.input >= (width <= 600 ? 64 : 44), `${name} · ${width}: the input keeps its floor beside the chips (${fit.input}px)`);
      }
    }
    // The steps, window by window: a line that fits folds nothing, and the narrower the window the more it folds, never a chip it
    // could keep. These are the stages the island reaches at 44px targets; a change here is a change in what a phone's line shows.
    // With the materials chip gone from the line (it is the strip above it now, §21.2 point 1), 390px folds nothing and 360px
    // folds one step less than it did. With one button at the bar's end instead of three (side-shelf §3.1), 667px, where the
    // trays leave the line least room, folds nothing either.
    assert.deepEqual(Object.fromEntries(Object.entries(stages).filter(([key]) => /^(390|360|667) /.test(key))), {
      "390 a current work": "", "390 a current work with a notice": "", "390 a Coding work": "",
      "390 a work with a notice and a Character": "", "390 a Coding work with a notice": "",
      "360 a current work": "", "360 a current work with a notice": "", "360 a Coding work": "",
      "360 a work with a notice and a Character": "choosers", "360 a Coding work with a notice": "choosers",
      "667 a current work": "", "667 a current work with a notice": "", "667 a Coding work": "",
      "667 a work with a notice and a Character": "", "667 a Coding work with a notice": "",
    }, "the steps the island takes at 390, 360 and 667px");
    // A 640×360 window: with the bar's end down to one button, a bare current work folds nothing and the fullest line only the
    // choosers (it folded the mark, and the chips, while the end held three). The mark still folds first at 320px.
    assert.deepEqual(Object.fromEntries(Object.entries(stages).filter(([key]) => key.startsWith("640 "))), {
      "640 a current work": "", "640 a current work with a notice": "", "640 a Coding work": "",
      "640 a work with a notice and a Character": "choosers", "640 a Coding work with a notice": "choosers",
    }, "the steps the island takes in a 640×360 window");
    assert.equal(stages["320 a current work with a notice"], "mark", "at 320px a current work with a notice folds the mark and nothing else");

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
      assert.deepEqual(controls.filter(control => w.short(control) < (control.kind === "home plugin" ? 32 : floors[control.area])).map(control => `${control.kind} ${control.w}×${control.h}`), [],
        `${name} · 1280: nothing in the strip is under ${floors.strip}px or in the bar under ${floors.bar}px`);
      assert.deepEqual(controls.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name} · 1280: every control is a known one`);
      const input = controls.find(control => control.kind === "assistant input");
      assert.ok(input && input.h <= 32, "the desktop Assistant line stays the 28px line the exception describes, not a phone's 44px");
      assert.ok(controls.some(control => w.short(control) < 44), `${name} · 1280: the desktop chrome is denser than 44px, as the exception says`);
    }

    // What a plugin page's menu holds is 34px on a desktop window, as DESIGN.md writes it.
    assert.deepEqual([...new Set(await w.menuRows(1280, 800))], [34], "mw-menu items keep their 34px with a fine pointer");

    // What the bar opens keeps the desktop floor too (32px, 28px compact): nothing in its lists is smaller.
    await w.open(1280, 800, "", "true");
    const lists = await w.popovers(32);
    for (const [list] of POPOVER_CONTENTS) {
      const report = lists[list];
      if (report === null && list === "the Dock's list") continue; // a window that holds every pin has no "+N"
      assert.ok(report, `1280: ${list} has a button that opens it`);
      assert.equal(report.shown, true, `1280: ${list} opens`);
      // A fine pointer shows the switcher's pin and add buttons on hover and focus only, so a list at rest does not hold them.
      assert.deepEqual(report.missing.filter(selector => !HOVER_ONLY.includes(selector)), [], `1280: ${list} holds the controls this test measures`);
      assert.deepEqual(report.small.map(item => `${item.cls} 「${item.label}」 ${item.w}×${item.h}`), [], `1280: every control in ${list} is at least 32px`);
    }

    // The switcher's pin and add buttons are there only while a tile is looked at, so the lists above did not measure them: put the mouse on a
    // tile. They are the floor's size (--control-h: 32px), fit inside the row, and the row's text leaves them their room.
    await w.open(1280, 800, "", "true");
    const ops = await w.switcherOps();
    for (const [kind, report] of Object.entries(ops)) {
      assert.ok(report, `1280: the switcher lists ${kind}`);
      assert.equal(report.floor, 32, "1280: standard density, whose floor is 32px");
      assert.equal(report.buttons.length, 2, `1280: ${kind} shows a pin and an add or remove button`);
      assert.deepEqual(report.buttons.filter(button => !button.shown).map(button => button.label), [], `1280: ${kind}: both show while the mouse is on its row`);
      assert.deepEqual(report.buttons.filter(button => Math.min(button.w, button.h) < report.floor).map(button => `${button.label} ${button.w}×${button.h}`), [], `1280: ${kind}: each is at least the ${report.floor}px floor`);
      assert.deepEqual(report.buttons.filter(button => !button.inside).map(button => button.label), [], `1280: ${kind}: and sits inside its row (${report.tileHeight}px tall)`);
      assert.ok(report.textRoom >= 0, `1280: ${kind}: the row's text ends before the buttons begin (${report.textRoom}px)`);
    }

    // The strip's own menus keep the rows they have on a desktop window (34px and up, short of 44px), the name input and the swatches included.
    await w.open(1280, 800, "?openPlugin=todo", "!!document.querySelector('[data-tab-kind=\"plugin\"]') && !!document.querySelector('.tab-item-trigger')");
    for (const [menu, report] of Object.entries(await w.stripMenus())) {
      assert.equal(report.shown, true, `1280: ${menu} opens`);
      assert.deepEqual(report.rows.filter(row => row < 34 || row >= 44), [], `1280: the rows of ${menu} stay a desktop menu's rows, 34px at least and short of the 44px of touch (${report.rows})`);
      // A colour swatch is a 32px target (the desktop floor) with the same 18px dot drawn inside it: the dot is not the target.
      const swatches = report.parts.filter(part => part.label.startsWith("color-"));
      assert.deepEqual(swatches.filter(part => Math.min(part.w, part.h) < 32 || Math.max(part.w, part.h) >= 44).map(part => `${part.label} ${part.w}×${part.h}`), [], `1280: the group's swatches are 32px targets, short of the 44px of touch`);
      assert.equal(swatches.length >= 8, menu === "a tab group's menu", `1280: ${menu}: only a group's menu offers colours, and it offers them all`);
      assert.deepEqual([...new Set(swatches.map(part => part.dot))], swatches.length ? [18] : [], `1280: ${menu}: drawn as 18px dots`);
      assert.deepEqual(report.parts.filter(part => !part.label.startsWith("color-") && Math.min(part.w, part.h) < 32).map(part => `${part.label} ${part.w}×${part.h}`), [], `1280: and nothing else a strip menu holds is under 32px`);
    }

    // A short window: DESIGN.md writes the Dock, resident and switcher buttons as 34px there, and the floors still hold.
    const shortWindow = await w.open(1280, 500, "", "true");
    assert.deepEqual(shortWindow.filter(control => w.short(control) < (control.kind === "home plugin" ? 32 : floors[control.area])).map(control => `${control.kind} ${control.w}×${control.h}`), [],
      "a short window · 1280×500: nothing in the strip is under 20px or in the bar under 28px");
    assert.deepEqual(shortWindow.filter(control => ["dock", "resident", "plugin switcher"].includes(control.kind) && control.area === "bar").map(control => control.h).filter(h => h !== 34), [],
      "a short window · 1280×500: the Dock, resident and switcher buttons are the 34px DESIGN.md writes");

    // The Assistant line in the states the seeded project does not start in, on the desktop bar's 28px floor.
    await w.open(1280, 800, "", "true");
    await w.line("a new work · 1280", NEW_WORK, NEW_WORK_KINDS, floors.bar);
    // Escape puts away what a button of the line opened and gives it focus back: the "+" menu and the choosers' lists.
    // The "who does it" button and the mode are on the line once a plugin is chosen to carry the work: a person chooses it, and then they are there.
    await w.chooseExecutor(true);
    for (const [name, button, popover] of [["the + menu", "[data-assistant-attach]", "[data-assistant-more]"], ["who does it", "[data-assistant-executor]", "[data-assistant-executors]"],
      ["the mode", "[data-assistant-mode]", "[data-assistant-modes]"], ["the notices", "[data-assistant-attention]", "[data-assistant-notices]"]] as const) {
      assert.deepEqual(await w.escapeReturns(button, popover), { opened: true, closed: true, focus: true, onButton: true }, `${name} · 1280: Escape closes it and focus goes back to its button`);
    }
    await w.chooseExecutor(false);
    await w.makeCurrentWork();
    await w.open(1280, 800, "", "true");
    await w.line("a current work · 1280", [], ["work chip", "work chip clear"], floors.bar);
    await w.line("a Coding work with every chip · 1280", WITH_MODE, [...BASE, "mode chip"], floors.bar);
    await w.line("a work with a Character and every chip · 1280", WITH_CHARACTER, [...BASE, "character chip"], floors.bar);
    const character = await w.escapeReturns("[data-assistant-character]", "[data-assistant-characters]");
    assert.deepEqual([character.opened, character.closed, character.focus], [true, true, true], `the Character · 1280: Escape closes its list and focus goes to the control that opened it, or the "+" (${JSON.stringify(character)})`);
    // The opened panel's body is where the touch rules end: with a fine pointer its details and conversation controls keep the denser
    // sizes they have on a desktop (the 22–28px ones are the known gap BL-127), and what is long or wide enough to read is not stretched.
    const panel = await w.panelBody();
    assert.deepEqual(panel.real["the details"].filter(item => /assistant-side-action/.test(item.cls) && item.h >= 44).map(item => `${item.cls} ${item.w}×${item.h}`), [], "1280: the panel's details keep their desktop sizes with a fine pointer");
    assert.deepEqual(panel.made.filter(item => /assistant-(copy|segment|side-action|code-copy)\b/.test(item.cls) && item.h >= 44).map(item => `${item.cls} ${item.w}×${item.h}`), [], "1280: and so do the conversation's own small buttons");
    assert.ok(panel.real["all works"].filter(item => /assistant-works-new/.test(item.cls)).every(item => item.h < 44), "1280: the list of all works keeps its desktop rows (the one-line row is not 44px)");
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
      // In a project the menu also offers the project-knowledge picker (PMAT-17; specs/project-knowledge/spec.md §9 and §14).
      assert.deepEqual(await w.moreLabels(), ["添加文件或图片…", "选择项目资料…", "引用项目里的内容", "用一个能力或方法"], `${name} · 620: and the "+" menu lists its usual rows, not the chips that are still on the line`);
    }
  });
}
