import assert from "node:assert/strict";
import { Script } from "node:vm";
import test from "node:test";
import { openBoardBrowser as openGoalBrowser } from "./fixtures/board-browser.js";
import { layoutFindings } from "./fixtures/layout-audit.js";
import { renderInteractionNextSteps } from "@molis-ai/molis-work-design-system";
import { CLIENT_SCRIPT, assistantTextHtml } from "@molis-ai/molis-work-app-workbench";
import { agentQuestionHtml } from "@molis-ai/molis-work-app-local-host";

// DESIGN.md → Focus and accessibility: every target is 44px wherever the pointer is coarse (a phone, a phone held sideways, a
// tablet) or the window is a phone's width, and the desktop window's chrome (the title bar's tab strip and the bottom bar) keeps
// one written, scoped exception for fine-pointer windows. This measures both sides on the real shell. Touch windows, 390×844,
// 852×393 and 1024×768: every control of the strip and of the bar is 44px on its short side, the bar and the strip lay out
// cleanly with them. The Assistant's input is the platform's unified composer (unified-input K3): its receiver row (「发给：…」,
// with the mark that starts a new work instead), its bottom row (＋, the scene controls, send) and the bell stay 44px targets and
// inside the composer in the states the seeded project does not start in (a current work, with a notice; a new work a plugin
// carries, with who does it and its mode) at the widths where it is tight: 320, 360 and 390px phones and the 640, 667, 740 and
// 852px sideways phones. A narrow composer folds its scene controls behind 更多 (its own sheet); nothing is taken off the line
// otherwise, and a tap into the input and away leaves it as it was. What the next Send carries is the strip above the composer
// (context-program §21.2 point 1), measured with what the bar opens.
// A fine-pointer window of 1280px keeps the sizes the exception names and does not sink below its floor, also in a short window
// and at 700px and 620px.

type Control = { kind: string; area: "strip" | "bar"; label: string; w: number; h: number };
type Part = { name: string; left: number; right: number };
type LineFit = { overflow: number; left: number; right: number; vw: number; folded: boolean; input: number; touchRules: boolean; parts: Part[] };

const KINDS: Record<string, string> = {
  "[data-assistant-composer] .mw-composer__input": "assistant input",
  "[data-assistant-composer] [data-composer-add]": "assistant attach",
  "[data-assistant-composer] [data-composer-send]": "assistant send",
  "[data-assistant-composer] [data-composer-receiver]": "assistant receiver",
  "[data-plugin-picker-toggle]": "plugin switcher",
  // §4「底栏第十三版」第 1 条: ⌂ is in the first place, 「项目 › 项目主页」, and its list holds the projects and their pages.
  ".top-corner-cell": "first place",
  // 07-1 S4b: the bar's side button and the titlebar's Home tools are gone; the side's glyphs (Issue's among them) are tabs.
  ".navigator-project-selector": "project",
  ".immersive-show-directory, .navigator-directory-toggle": "directory toggle",
  ".workspace-history-button": "history",
  ".tab-item-trigger": "tab",
  ".tab-item-close": "tab close",
  // specs/screen-polish §3 方案 C (POLISH-05, POLISH-07): the side's switch at the right end takes the place of 主区｜右侧 and of
  // the side's row of glyphs; at 760px and under the strip is one row.
  "[data-side-toggle]": "side switch",
  "[data-tab-all]": "all tabs",
  "[data-layout-open]": "layout", // 07-S2: the titlebar's one layout button replaces each strip's
  ".tab-view-chip-close": "cover close",
  "[data-assistant-composer] .mw-composer__to [data-tag-remove]": "work chip clear",
  ".assistant-strip-act, .assistant-strip-chip.is-work": "strip chip",
  ".assistant-attention": "attention chip",
  "[data-assistant-composer] [data-composer-more]": "composer more",
  // A select control is drawn by the platform's select picker: the native select is hidden and its trigger is what is pressed.
  "[data-assistant-composer] .mw-composer__controls :is([data-composer-control], .mw-select-picker__trigger)": "composer control",
  "[data-assistant-composer] [data-compose-menu-toggle]": "delivery toggle",
  "[data-assistant-composer] [data-composer-stop]": "stop",
  // The foot (specs/screen-polish §4「底栏第十三版」第 2、3、5 条; the line's head, wings and paging are gone): the account bar's
  // name and its keys; inside the input's top right while the dialog is closed, 办完 · 在办 · 接下来 (and 该你 N under 960px), an
  // event a reply belongs to, the task mark and the button that opens the conversation; the answers on the card in front.
  ".bar-account-me": "account",
  ".bar-account-key": "account key",
  ".work-count": "line count",
  ".work-event": "line event",
  ".work-task-mark": "task mark",
  "[data-dialog-open]": "open conversation",
  "[data-work-stack] button": "stack card",
};
/** The parts of the Assistant's composer that exist only in some states; the base screens do not show them. */
const LINE_KINDS = ["work chip clear", "strip chip", "attention chip", "composer more", "composer control", "delivery toggle", "stop", "line event", "stack card"];

/** Shows the bell of the Assistant's composer as the island paints it when a notice waits (it hides it otherwise). */
const OPTIONAL_CHIPS = ["[data-assistant-attention]"];
const showChips = (selectors: string[]) => `(() => {
  for (const selector of ${JSON.stringify(OPTIONAL_CHIPS)}) document.querySelector(selector).hidden = true;
  for (const selector of ${JSON.stringify(selectors)}) document.querySelector(selector).hidden = false;
  const count = document.querySelector("[data-assistant-attention-count]"); if (count && !count.closest("[hidden]")) count.textContent = "3";
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
    for (const el of document.querySelectorAll(root + " :is(button, summary, input, textarea, select, [role=tab], a[href])")) {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || el.closest("[hidden], [inert], .assistant-panel, .assistant-popover, .plugin-picker-popover, .top-corner-list, .navigator-project-menu-popover, [data-compose-menu], [data-work-lists]")) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const kind = Object.entries(kinds).find(([selector]) => el.matches(selector))?.[1];
      // What a finger can press: the box, or the empty, absolutely placed ::after a target reaches past its drawn line with (the bell).
      const after = getComputedStyle(el, "::after"), px = (value) => parseFloat(value) || 0, reach = after.content === '""' && after.position === "absolute" && after.pointerEvents !== "none";
      const w = reach ? Math.max(box.width, box.width - px(after.left) - px(after.right)) : box.width, h = reach ? Math.max(box.height, box.height - px(after.top) - px(after.bottom)) : box.height;
      out.push({ kind: kind ?? "unlisted " + el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0], area, label: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20), w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 });
    }
  }
  return out;
})()`;

/** Where the parts of the Assistant's composer sit against its box and the window: nothing may run past either. Folded is whether its
 * scene controls are behind 更多 (the composer's own sheet, on a box narrower than 480px). */
const LINE_FIT = `(() => {
  const composer = document.querySelector("[data-assistant-composer]"), box = composer.querySelector(".mw-composer__box"), pill = box.getBoundingClientRect();
  const parts = [];
  for (const el of composer.querySelectorAll(".mw-composer__to > *, .mw-composer__foot :is(button, select), .assistant-attention")) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || el.closest("[data-compose-menu], .mw-composer__controls:not(:has(> *:first-child:not([hidden])))")) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) continue;
    parts.push({ name: el.getAttribute("data-composer-control") || el.closest(".mw-select-picker")?.querySelector("select")?.dataset.composerControl || String(el.className).split(" ")[0] || el.tagName.toLowerCase(), left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10 });
  }
  const more = composer.querySelector("[data-composer-more]");
  return { overflow: Math.max(box.scrollWidth - box.clientWidth, composer.scrollWidth - composer.clientWidth), left: Math.round(pill.left * 10) / 10, right: Math.round(pill.right * 10) / 10, vw: document.documentElement.clientWidth,
    folded: Boolean(more && more.checkVisibility()), touchRules: matchMedia("(max-width: 600px), (pointer: coarse)").matches,
    input: Math.round(composer.querySelector(".mw-composer__input").getBoundingClientRect().width * 10) / 10, parts };
})()`;

/** The phone bar's second row (the switcher and the Dock at the start; the residents, a directory button and the project at the end),
 * as boxes in a line: no target may sit on its neighbour and none may leave the window. It is the row of 44px targets that touch
 * one another, so the room it needs is an exact sum of them. */
const ROW_FIT = `(() => {
  const vw = document.documentElement.clientWidth;
  // The strip's targets (specs/screen-polish §3 方案 C): 项目主页, ＋, the side's switch, the layout button and the project. The tab strip and the side's glyph row scroll inside their own boxes and are measured by the
  // layout audit, so they are left out here.
  const boxes = [...document.querySelectorAll(".workbench-header[data-dock] :is(button, summary, input, textarea, [role=tab], a[href])")]
    .filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.closest("[hidden], [inert], .plugin-picker-popover, .top-corner-list, .navigator-project-menu-popover, [data-titlebar-tabs], .side-strip"))
    .map(el => ({ name: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 12), box: el.getBoundingClientRect() }))
    .filter(item => item.box.width >= 2)
    .sort((a, b) => Math.round(a.box.top / 20) - Math.round(b.box.top / 20) || a.box.left - b.box.left);
  let overlap = 0, where = "";
  for (let index = 1; index < boxes.length; index++) {
    if (Math.round(boxes[index - 1].box.top / 20) !== Math.round(boxes[index].box.top / 20)) continue;
    const over = boxes[index - 1].box.right - boxes[index].box.left;
    if (over > overlap) { overlap = over; where = boxes[index - 1].name + " / " + boxes[index].name; }
  }
  const outside = Math.max(0, ...boxes.map(item => Math.max(-item.box.left, item.box.right - vw)));
  return { count: boxes.length, vw, overlap: Math.round(overlap * 10) / 10, where, outside: Math.round(outside * 10) / 10, width: boxes.reduce((sum, item) => sum + item.box.width, 0) };
})()`;

/** What is fixed at the top's start: the first place alone (§4「底栏第十三版」第 1 条, ⌂ inside it; no plugin is kept there since
 * the user's 2026-11-18「按最新设计为准」), every plugin reached from ＋. */
const TOP_PINS = `(() => { const pins = [...document.querySelectorAll("[data-dock-pins] > *")];
  return { all: pins.map(pin => pin.className), shown: pins.filter(pin => pin.querySelector("[data-top-corner-toggle]")?.getClientRects().length).map(pin => pin.className) }; })()`;

/** Every popover the bar opens, with the controls inside it that are shorter or narrower than 44px. The notices are the island's own rows,
 * fed by an answer to its read of them; the strip has a page object to offer. `present` names what must be in the list, so a
 * list that did not open (or lost its buttons) cannot pass by having nothing to measure. */
const POPOVER_CONTENTS: Array<[string, string, string, string[]]> = [
  // K3: who does it, the mode and the Character are the composer's selects now (measured on the bar); the ＋ menu lists files and the `/` commands.
  ["the + menu", "[data-assistant-composer] [data-composer-add]", "[data-assistant-composer] .mw-composer__start [data-compose-menu]", ["[data-composer-files]", "[data-composer-command]"]],
  ["the strip", "[data-assistant-composer] .mw-composer__input", "[data-assistant-context-strip]", [".assistant-strip-act[aria-label^='加入']", ".assistant-strip-act[aria-label^='不带上']"]],
  ["the notices", "[data-assistant-attention]", "[data-assistant-notices]", ["[data-notice-action=open]", "[data-notice-action=dismiss]", "summary"]],
  ["the plugin switcher", "[data-plugin-picker-toggle]", "[data-plugin-picker-popover]", ["[data-plugin-toggle]"]],
  ["the first place's list", "[data-top-corner-toggle]", "[data-top-corner-list]", ["[data-corner-project]", "[data-corner-home]", ".top-corner-manage"]],
  // Under 960px the project's mark ends the strip and its menu holds the projects; from 960px the mark is not shown (POLISH-05 as
  // rewritten, POLISH-71): the projects are in the first place's list and who you are opens from the foot's account bar.
  ["the project menu", ".navigator-project-selector", ".navigator-project-menu-popover", [".navigator-project-option", ".navigator-project-manage"]],
  ["the account menu", ".bar-account [data-account-link]", "#mw-account-menu", ["[data-personal-action]", "[data-unified-account-link]"]],
  ["a suggestion", "", "[data-assistant-next-row]", ["[data-step-offer]"]],
];
/** What a list holds for a touch pointer that a fine pointer shows only under the cursor or on focus. */
const HOVER_ONLY = ["[data-plugin-toggle]"];
/** The lists a window of this width opens: the project's menu under 960px, the account menu from 960px. */
const listsAt = (width: number) => POPOVER_CONTENTS.filter(([name]) => name !== (width >= 960 ? "the project menu" : "the account menu"));
/** A new work a plugin carries, chosen the way a person chooses it: in the opened panel's 「谁来做」 (a new work's who and mode are
 * chosen there), Coding. The composer then shows who does it and the mode beside ＋; the panel is closed again, so the bar is what
 * is measured. */
const CARRIED_BY_CODING = `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail: { new: true } }));
  let group = null;
  for (let i = 0; i < 50 && !group; i++) { await wait(100); group = document.querySelector('[data-assistant-panel] .assistant-segmented[aria-label="由谁来做"]'); }
  [...(group?.querySelectorAll(".assistant-segment") || [])].find((one) => /Coding/.test(one.textContent))?.click();
  await wait(300);
  const close = document.querySelector("[data-assistant-panel-close]"); if (close && close.checkVisibility()) close.click();
  await wait(300);
})()`;
const popoversScript = (floor: number) => `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const notices = [
    { notice_id: "t1", kind: "needs-decision", text: { original: "需要你决定发布时间" }, work_id: "w1" },
    { notice_id: "t2", kind: "reminder", text: { original: "下午三点的评审" }, work_id: "w2", open: { surface: "todo", id: "x", title: "评审" } },
    { notice_id: "t3", kind: "finished", text: { original: "整理待办已完成" }, work_id: "w3" },
    { notice_id: "t4", kind: "finished", text: { original: "一条被规则压下的结果" }, work_id: "w4", held: { reason: "安静时段" } },
  ];
  const real = window.fetch;
  // The notices come with the page's one attention read (W4-10): the test's notices replace the Assistant's in its answer.
  window.fetch = (input, init) => /\\/api\\/attention\\b/.test(String(input?.url ?? input)) && !(init && init.method && init.method !== "GET")
    ? real(input, init).then(response => response.json()).then(body => new Response(JSON.stringify({ ...body, notices }), { status: 200, headers: { "content-type": "application/json" } }))
    : real(input, init);
  await new Promise((resolve, reject) => {
    const listen = event => {
      if (!event.detail?.notices?.some(notice => notice.notice_id === "t1")) return;
      clearTimeout(timer); document.removeEventListener("molis-work:attention", listen); resolve();
    };
    const timer = setTimeout(() => { document.removeEventListener("molis-work:attention", listen); reject(new Error("Test notices did not reach the bell")); }, 10000);
    document.addEventListener("molis-work:attention", listen);
    document.dispatchEvent(new CustomEvent("molis-work:attention-refresh"));
  });
  const out = {};
  for (const [name, button, popover, present] of ${JSON.stringify(POPOVER_CONTENTS)}) {
    // A suggestion has no button: a plugin's page hands one over and it waits above the bar.
    const opener = button ? document.querySelector(button) : { isConnected: true, click() {}, hidden: false };
    if (!opener || !opener.isConnected) { out[name] = null; continue; }
    // The project's menu and the account menu are each drawn at one side of 960px only (listsAt).
    if ((name === "the project menu" || name === "the account menu") && !opener.checkVisibility()) { out[name] = null; continue; }
    opener.hidden = false;
    // The strip shows while the input has focus.
    if (button) { if (opener.matches("input, textarea")) opener.focus(); else opener.click(); }
    else window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: { message_id: "touch-offer", purpose: "suggest", source: { surface: "todo", title: "待办" }, text: "整理本周的待办" } }));
    await wait(300);
    const pop = document.querySelector(popover);
    const shown = !!pop && !pop.hidden && pop.checkVisibility();
    const controls = shown ? [...pop.querySelectorAll("button, summary, a[href], input, select, textarea, [role=menuitem], [role=option]")].filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) : [];
    out[name] = {
      shown, missing: present.filter(selector => !controls.some(el => el.matches(selector))),
      small: controls.map(el => { const box = el.getBoundingClientRect(); return { cls: String(el.className).split(" ")[0] || el.tagName.toLowerCase(), label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 16), w: Math.round(box.width), h: Math.round(box.height) }; }).filter(item => Math.min(item.w, item.h) < ${floor}),
    };
    if (!pop.hidden && button) { if (opener.matches("input, textarea")) opener.blur(); else opener.click(); }
    await wait(120);
  }
  window.fetch = real;
  return out;
})()`;

/** The composer as a person sees it around typing: where it ends, and whether its controls are folded. */
const TYPING = `(() => {
  const composer = document.querySelector("[data-assistant-composer]"), pill = composer.querySelector(".mw-composer__box").getBoundingClientRect(), send = composer.querySelector("[data-composer-send]").getBoundingClientRect();
  const more = composer.querySelector("[data-composer-more]");
  return { folded: Boolean(more && more.checkVisibility()), overflow: composer.scrollWidth - composer.clientWidth, sendRight: Math.round(send.right), pillRight: Math.round(pill.right),
    focused: document.activeElement?.matches("[data-assistant-composer] .mw-composer__input") === true };
})()`;

/** The menus the strip opens, as a person opens them: the "+" of the strip (open a plugin), the layout button, a right-click on a tab (it makes
 * a group, so that the group's own menu has a label to open from). `rows` are the menu's rows (their size is the menu's), the rest are what sits
 * in them: the name input and the colour swatches of a group. */
type SwitcherOps = { floor: number; tileHeight: number; textRoom: number; buttons: Array<{ label: string; w: number; h: number; shown: boolean; inside: boolean }> };
type StripMenu = { shown: boolean; missing: string[]; rows: number[]; parts: Array<{ label: string; w: number; h: number; dot?: number }> };
const STRIP_MENUS = `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const tabMenu = document.querySelector("[data-workspace-tab-menu]"), layout = document.querySelector("[data-workspace-layout]"), plus = document.querySelector("[data-workspace-open-menu]");
  const close = async () => { for (const menu of [tabMenu, layout, plus]) if (menu.matches(":popover-open")) menu.hidePopover(); await wait(100); };
  const read = (menu, present) => {
    const shown = menu.matches(":popover-open");
    const controls = shown ? [...menu.querySelectorAll("button, summary, a[href], input")].filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) : [];
    // A colour swatch is a target with a dot drawn inside it (::before): the dot is what a person sees, the box is what answers to a finger.
    // A field in a group (＋'s search, 07-S2) answers to the whole group, its label: that box is its target.
    const size = (el) => { const box = (el.closest(".mw-input-group") || el).getBoundingClientRect(), swatch = (el.dataset.tabMenuAction || "").startsWith("color-");
      return { label: el.dataset.tabMenuAction || el.dataset.layoutSplit || el.dataset.layoutAction || el.tagName.toLowerCase(), w: Math.round(box.width), h: Math.round(box.height),
        dot: swatch ? Math.round(parseFloat(getComputedStyle(el, "::before").width)) : undefined }; };
    const isRow = (el) => el.matches("[data-layout-split], [data-layout-action], [data-tab-menu-action]:not([data-tab-menu-action^=color-])");
    return { shown, missing: present.filter(selector => !controls.some(el => el.matches(selector))), rows: controls.filter(isRow).map(el => Math.round(el.getBoundingClientRect().height)), parts: controls.filter(el => !isRow(el)).map(size) };
  };
  const out = {};
  document.querySelector(".tab-add-button").click(); await wait(300);
  // 07-S2: ＋ has a menu of its own that only opens plugins; the project home is the Dock's, not one of its rows.
  out["the open-plugin menu"] = read(plus, ["[data-tab-menu-action^=open-]", "input"]); await close();
  document.querySelector("[data-layout-open]").click(); await wait(300);
  out["the layout menu"] = read(layout, ["[data-layout-split=right]", "[data-layout-action=equal]"]); await close();
  document.querySelector(".tab-item-trigger").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })); await wait(300);
  out["a tab's menu"] = read(tabMenu, ["[data-tab-menu-action=pin]", "[data-tab-menu-action=new-group]", "[data-tab-menu-action=close]"]);
  tabMenu.querySelector("[data-tab-menu-action=new-group]")?.click(); await wait(300); await close();
  document.querySelector("[data-tab-group-toggle]")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })); await wait(300);
  out["a tab group's menu"] = read(tabMenu, ["input", "[data-tab-menu-action^=color-]", "[data-tab-menu-action=ungroup]"]); await close();
  return out;
})()`;

/** The tab bar of the opened Assistant panel, opened from the receiver's name on the composer (a current work is the state that has one). */
type PanelHeader = { shown: boolean; height: number; title: number; whole: boolean; controls: Array<{ label: string; w: number; h: number; inside: boolean }> };
const PANEL_HEADER = `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  document.querySelector("[data-reply-mini] [data-dialog-open]")?.click(); await wait(800);
  const panel = document.querySelector("[data-assistant-panel]"), bar = panel.querySelector(".assistant-tabbar"), box = panel.getBoundingClientRect();
  const controls = [...bar.querySelectorAll("button, [role=tab]")].filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).map(el => {
    // The tabs slide in their own box (specs/work-line §4.4): one that is slid out of view is cut by that box, which is what must stay inside.
    const b = el.getBoundingClientRect(), at = (el.closest("[data-assistant-tabs]") ?? el).getBoundingClientRect();
    return { label: el.getAttribute("aria-label") || String(el.className).split(" ")[0], w: Math.round(b.width), h: Math.round(b.height), inside: at.left >= box.left - 1 && at.right <= box.right + 1 };
  });
  const title = panel.querySelector(".assistant-tab[data-current] .assistant-tab-title");
  const out = { shown: !panel.hidden, height: Math.round(bar.getBoundingClientRect().height), title: title ? Math.round(title.clientWidth) : 0, whole: !!title && title.scrollWidth <= title.clientWidth + 1, controls };
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
// Minification may rename el and pool its strings. Enumerate the canonical public program and the real Host renderers;
// the served program is still fetched and parsed below, and every discovered control is measured in the real browser.
const PANEL_CLIENT_KINDS = [...CLIENT_SCRIPT.matchAll(/\bel\(\s*(["'])(button|summary|a|input|select|textarea|label)\1\s*,\s*(["'])((?:assistant|mw)-[^"']*)\3/g)]
  .map(match => [match[2]!, match[4]!] as const);
const PANEL_HOST_CONTROLS = assistantTextHtml('[link](https://example.test) 「固定资料」\n\n```ts\n' + 'const value = 1;\n'.repeat(20) + '```', [
  { title: '固定资料', subject: { kind: 'page', id: 'fixed-page' }, relation: 'material', state: 'current',
    open: { surface: 'pages', id: 'fixed-page' }, recorded_revision: null, current_revision: null, recorded_at: '' },
], text => text) + agentQuestionHtml({ pending_id: 'touch-question', kind: 'clarify', prompt: '怎么继续？',
  options: [{ value: 'one', label: '继续整理' }], allows_free_text: true }, text => text);
const PANEL_BODY = `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  document.querySelector("[data-reply-mini] [data-dialog-open]")?.click(); await wait(800);
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
  if (!source) throw new Error('The actual workbench client must be present');
  const response = await fetch(source.src); if (!response.ok) throw new Error('The workbench client must load');
  const text = await response.text(); if (!text.trim()) throw new Error('The workbench client must not be empty');
  const kinds = new Map(${JSON.stringify(PANEL_CLIENT_KINDS)}.map(([tag, classes]) => [tag + '.' + classes, [tag, classes]]));
  const rendered = document.createElement('template'); rendered.innerHTML = ${JSON.stringify(PANEL_HOST_CONTROLS)};
  for (const element of rendered.content.querySelectorAll('button, summary, a[href], input, select, textarea, label')) {
    if (!element.className) continue;
    const tag = element.tagName.toLowerCase(), classes = element.className;
    kinds.set(tag + '.' + classes, [tag, classes]);
  }
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
  const result = { real, made: out, kinds: kinds.size, overflow: thread.scrollWidth - thread.clientWidth, script: text };
  holder.remove();
  panel.querySelector("[data-assistant-panel-close]").click(); await wait(200);
  return result;
})()`;

/** A finding that is about the strip or the bar (the page behind them has its own audits). */
const IN_SHELL = /bar-composer|assistant-composer|dock-pin|top-corner|bar-side|bar-chat|plugin-picker|navigator-project|navigator-directory|immersive-show|workbench-bar|bar-start|bar-end|tab-view-chip|tab-item|tab-strip|tab-add|tab-split|workspace-history/;

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

/** What a phone's list of side views was asked about a Home tool (see assertHomeToolsReachable). */
type HomeToolPhone = {
  count: number;
  left: boolean;
  right: boolean;
  sideways: boolean;
  inList: boolean;
  stayed: boolean;
};

/**
 * ISSUE-30 / 07-AUDIT: a declared Home tool (Issue, a side view with a chord) can be reached and pressed: once the list is open
 * it is inside the window (the list itself scrolls down to it when it holds more views than fit, as any list does). Until specs/screen-polish §3 方案 C it was a glyph in the row at the right end of the titlebar (07-1 S4b), the
 * always-there entry of 10-12. 方案 C leaves three controls there (POLISH-05: the side's switch, layout, project) and puts every
 * side view, the Home tool among them, in the list that opens from the side sheet's own tab; its chord still opens it from
 * anywhere. So this opens the side and that list, and requires the Home tool to be inside the window and to take the press at
 * its top, middle and bottom with nothing above it.
 *
 * BL-phone-home-tools-stay-visible was about a phone's glyph row scrolling the Home tool out of sight. There is no such row any
 * more: on a phone the list runs the window's width and must not scroll sideways, the Home tool is inside it, and the arrow keys
 * walk the views in the order they are drawn, moving the focus only: the view that shows stays until one is chosen (Enter, Space
 * or a press), so passing over a view that loads a page does not open it. The side is put back as it was (closed) before the
 * shell is measured.
 */
async function assertHomeToolsReachable(browser: Browser, width: number): Promise<void> {
  const report = await browser.evaluate<{ count: number; blocked: string[]; phone: HomeToolPhone | null; restored: boolean }>(`(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const strip = document.querySelector('[data-side-tabs]'), toggle = document.querySelector('[data-side-toggle]'), ear = document.querySelector('[data-side-ear]');
    const nodes = [...document.querySelectorAll('[data-side-tabs] [data-side-keys]')];
    const wasOpen = document.body.dataset.sideOpen === 'true';
    if (!wasOpen) toggle.click();
    await frame();
    if (strip.hidden) ear.click();
    await frame();
    const shown = strip.querySelector('[data-side-tab][aria-selected="true"]');
    const blocked = nodes.flatMap(el => {
      el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, style = getComputedStyle(el);
      const inside = r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      const over = [r.top + 2, r.top + r.height / 2, r.bottom - 2].map(y => document.elementFromPoint(x, y)).filter(at => !el.contains(at));
      if (inside && !el.disabled && style.pointerEvents !== 'none' && !over.length) return [];
      const name = el.textContent.trim() || el.getAttribute('aria-label') || el.parentElement.title;
      // What is in the way, for whoever reads the failure.
      return [name + ' ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + '×' + Math.round(r.height) + ' in ' + innerWidth + '×' + innerHeight
        + (over.length ? ' under ' + over.map(at => at ? at.tagName.toLowerCase() + '.' + String(at.className).split(' ')[0] : 'nothing').join(' / ') : '')];
    });
    let phone = null;
    const button = nodes[0] ?? null;
    if (button && matchMedia('(max-width: 600px)').matches) {
      // The views the list draws, as its own arrow keys take them (side-panel.ts): a hidden context tab is not one.
      const ordered = [...strip.querySelectorAll('[data-side-tab]')].filter((tab) => !tab.hidden && tab.getClientRects().length).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const box = button.getBoundingClientRect(), listBox = strip.getBoundingClientRect();
      // The keys are cancelable, as a real press is: the list takes them (preventDefault), so the page's roving focus does not
      // move the focus a second time.
      let left = true, right = true;
      const at = ordered.indexOf(button);
      if (ordered.length > 1) {
        const from = ordered[(at + 1) % ordered.length];
        from.focus({ preventScroll: true });
        from.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
        left = document.activeElement === button;
        button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        right = document.activeElement === from;
      }
      phone = { count: ordered.length, left, right, sideways: strip.scrollWidth > strip.clientWidth + 1, stayed: !shown || shown.getAttribute('aria-selected') === 'true',
        inList: box.left >= listBox.left - 0.5 && box.right <= listBox.right + 0.5 && listBox.left >= 0 && listBox.right <= innerWidth };
    }
    // Back as it was: the view that showed, the list closed, the side closed, nothing focused in the
    // strip; then a moment for the strip to fit itself again (the Dock folds after its ResizeObserver).
    if (shown && shown.getAttribute('aria-selected') !== 'true') shown.click();
    if (!strip.hidden) ear.click();
    if (!wasOpen && document.body.dataset.sideOpen === 'true') toggle.click();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    await frame();
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { count: nodes.length, blocked, phone, restored: (document.body.dataset.sideOpen === 'true') === wasOpen && strip.hidden && (!shown || shown.getAttribute('aria-selected') === 'true') };
  })()`);
  assert.ok(report.count > 0, "the current Home tools are present");
  assert.deepEqual(report.blocked, [], "Home tools, in the side's list, are neither clipped nor covered, including their target's top and bottom");
  assert.equal(report.restored, true, "the side and its list are back as they were before the shell is measured");
  const phone = report.phone;
  if (!phone) return;
  assert.equal(phone.sideways, false, `ISSUE-30 / BL-phone-home-tools-stay-visible: a phone's list of side views does not scroll sideways (${width}px)`);
  assert.equal(phone.inList, true, `ISSUE-30 / BL-phone-home-tools-stay-visible: the Home tool is inside the list, and the list inside the window (${width}px)`);
  if (phone.count > 1) {
    assert.equal(phone.left, true, `ISSUE-30 07-AUDIT: ↑ from the view drawn after the Home tool reaches it (${width}px)`);
    assert.equal(phone.right, true, `ISSUE-30 07-AUDIT: ↓ from the Home tool goes to the view drawn after it (${width}px)`);
    assert.equal(phone.stayed, true, `POLISH-05: the arrow keys in the list move the focus only; the side still shows the view it showed (${width}px)`);
  }
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
    await waitFor(`${ready} && !!document.querySelector('[data-dock-pins] [data-top-corner-toggle]')`, 20_000);
    // Text widths feed the Dock's fold; wait for the fonts, but a slow machine's font load is not what is under test.
    await waitFor("document.fonts.status === 'loaded'", 10_000).catch(() => undefined);
    assert.equal(await evaluate("document.documentElement.dataset.resolvedTheme"), scheme, "the page follows the emulated scheme");
    assert.equal(await evaluate(`matchMedia('(pointer: coarse)').matches`), touch, `the window is a ${touch ? "coarse" : "fine"}-pointer one`);
    // The Dock folds what does not fit after its first paint; let it settle before measuring.
    await settle();
    await assertHomeToolsReachable(browser, width);
    return evaluate<Control[]>(SHELL_CONTROLS);
  };
  // The directory's resize grip runs the full height of the window's grid and crosses the bar between 601 and about 900px wide
  // whatever the control sizes are; it is not what is measured here.
  const shellFindings = async () => (await layoutFindings(evaluate)).filter(finding => IN_SHELL.test(`${finding.a ?? ""} ${finding.b ?? ""}`) && !/tree-resizer/.test(`${finding.a ?? ""} ${finding.b ?? ""}`));

  /** The Assistant's composer with the bell shown or not: what must be on the bar is `present`, except that a narrow composer folds its
   * scene controls behind 更多 (then 更多 is there instead, and what it opens is measured too). Nothing runs past the composer's box or the window. */
  const line = async (name: string, chips: string[], present: string[], floor: number, chipWidthFree = false, insidePill = true) => {
    if (present.includes("work chip clear")) await waitFor("Boolean(document.querySelector('[data-assistant-composer] .mw-composer__to [data-tag-remove]'))", 10_000);
    if (present.includes("composer control")) await waitFor("Boolean(document.querySelector('[data-assistant-composer] [data-composer-control]'))", 10_000);
    await evaluate(lookAtPage(false));
    // The island repaints the bell when its first answers come back and would hide what was shown; show it again until it stays.
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
      expected = fit.folded ? [...present.filter(kind => kind !== "composer control"), ...(present.includes("composer control") ? ["composer more"] : [])] : present;
      if (expected.every(kind => kinds.has(kind)) && (!chips.length || await evaluate<boolean>(chipsShown(chips)))) break;
    }
    assert.deepEqual(expected.filter(kind => !kinds.has(kind)), [], `${name}: every part of the state is there to measure (folded: ${fit.folded})`);
    const small = (control: Control) => (chipWidthFree && LINE_KINDS.includes(control.kind) ? control.h : short(control)) < floor;
    assert.deepEqual(bar.filter(small).map(control => `${control.kind} 「${control.label}」 ${control.w}×${control.h}`), [], `${name}: no control of the bar is under ${floor}px`);
    assert.deepEqual(bar.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name}: every control is a known one`);
    if (insidePill) {
      assert.ok(fit.overflow <= 1, `${name}: the composer does not overflow (by ${fit.overflow}px; ${JSON.stringify(fit)})`);
      assert.deepEqual(fit.parts.filter(part => part.left < fit.left - 1 || part.right > fit.right + 1 || part.right > fit.vw).map(part => `${part.name} ${part.left}–${part.right}`), [],
        `${name}: every part of the composer is inside its box (${fit.left}–${fit.right}) and the window (${fit.vw})`);
    }
    assert.ok(fit.input >= (floor >= 44 ? 44 : 28), `${name}: the input keeps its box (${fit.input}px)`);
    // Folded controls are not lost: 更多 opens them, each as tall as a target, inside the window.
    if (fit.folded && present.includes("composer control")) {
      const opened = await evaluate<{ shown: boolean; small: string[]; outside: string[] }>(`(async () => {
        const more = document.querySelector("[data-assistant-composer] [data-composer-more]"); more.click(); await new Promise((resolve) => setTimeout(resolve, 150));
        const controls = [...document.querySelectorAll("[data-assistant-composer] .mw-composer__controls :is([data-composer-control], .mw-select-picker__trigger)")].filter((el) => el.checkVisibility());
        const name = (el) => el.dataset.composerControl || el.closest(".mw-select-picker")?.querySelector("select")?.dataset.composerControl || "?";
        const out = { shown: controls.length > 0, small: controls.filter((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height) < ${floor}).map(name),
          outside: controls.filter((el) => { const b = el.getBoundingClientRect(); return b.left < 0 || b.right > document.documentElement.clientWidth + 1 || b.top < 0; }).map(name) };
        more.click(); await new Promise((resolve) => setTimeout(resolve, 100));
        return out;
      })()`);
      assert.equal(opened.shown, true, `${name}: 更多 opens the folded controls`);
      assert.deepEqual(opened.small, [], `${name}: and they are ${floor}px targets`);
      assert.deepEqual(opened.outside, [], `${name}: inside the window`);
    }
    return { fit, expected };
  };

  /** A tap into the input and away again, as a person does to type and dismiss the keyboard: the composer comes back as it was,
   * folded or not as before and inside its box. */
  const typeAndLeave = async (name: string, before: LineFit) => {
    type Typing = { folded: boolean; overflow: number; sendRight: number; pillRight: number; focused: boolean };
    await evaluate(`document.querySelector("[data-assistant-composer] .mw-composer__input").focus()`);
    await settle();
    const typing = await evaluate<Typing>(TYPING);
    await evaluate(`document.querySelector("[data-assistant-composer] .mw-composer__input").blur()`);
    await settle();
    const after = await evaluate<Typing>(TYPING);
    assert.equal(typing.focused, true, `${name}: the input has focus while typing`);
    assert.deepEqual([typing.folded, after.folded], [before.folded, before.folded], `${name}: the fold does not depend on the input's focus (typing: ${JSON.stringify(typing)})`);
    assert.ok(after.overflow <= 1, `${name}: and it does not overflow (by ${after.overflow}px)`);
    assert.ok(after.sendRight <= after.pillRight + 1, `${name}: send ends inside the box (${after.sendRight} of ${after.pillRight})`);
  };

  /** Opens what a button of the Assistant's composer opens, presses Escape in it, and says whether it closed and where focus went: back to the button. */
  const escapeReturns = (button: string, popover: string) => evaluate<{ opened: boolean; closed: boolean; focus: boolean; onButton: boolean }>(`(async () => {
    const button = document.querySelector(${JSON.stringify(button)}), popover = document.querySelector(${JSON.stringify(popover)}), attach = document.querySelector("[data-assistant-composer] [data-composer-add]");
    button.click(); await new Promise((resolve) => setTimeout(resolve, 250));
    const opened = !popover.hidden;
    popover.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { opened, closed: popover.hidden, focus: document.activeElement === (button.checkVisibility() ? button : attach), onButton: document.activeElement === button };
  })()`);

  const carriedByCoding = () => evaluate(CARRIED_BY_CODING);

  /** A send without a model keeps the work, which is all the chip needs; the island remembers it as this viewer's current work. */
  const makeCurrentWork = () => evaluate(`(async () => {
    const api = ${JSON.stringify(`/projects/${projectId}/api/assistant`)};
    await fetch(api + "/send", { method: "POST", headers: { ...(globalThis.molisWorkControlHeaders?.() || {}), "content-type": "application/json" },
      body: JSON.stringify({ text: "整理一下本周的待办", request_id: "touch-targets-1" }) });
    const { works } = await fetch(api + "/works").then(response => response.json());
    localStorage.setItem(${JSON.stringify(`molis.assistant.current:${projectId}`)}, works[0].work_id);
  })()`);

  /** The rows of the "+" menu, as a person who opens it sees them. */
  const moreLabels = () => evaluate<string[]>(`(async () => {
    const attach = document.querySelector("[data-assistant-composer] [data-composer-add]"), more = document.querySelector("[data-assistant-composer] .mw-composer__start [data-compose-menu]");
    attach.click(); await new Promise((resolve) => setTimeout(resolve, 300));
    const labels = [...more.querySelectorAll("[role=menuitem]")].map((row) => [(row.querySelector("[id$='-label']") || row.querySelector("[data-slot=menu-item-label]")).textContent, row.querySelector(".mw-menu__shortcut")?.textContent].filter(Boolean).join(" "));
    attach.click();
    return labels;
  })()`);

  /** The bar's second row against the window, and the Dock's fold against its list: what a window of this width shows must fit and be reachable. */
  const rowFit = () => evaluate<{ count: number; vw: number; overlap: number; where: string; outside: number; width: number }>(ROW_FIT);
  const topPins = () => evaluate<{ all: string[]; shown: string[] }>(TOP_PINS);
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
            return { label: button.hasAttribute("data-rail-beside") ? "open beside" : "add or remove", w: Math.round(b.width), h: Math.round(b.height), shown: parseFloat(getComputedStyle(button).opacity) > 0 && getComputedStyle(button).transform === "none",
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
  const panelBody = async () => {
    const {script,...body} = await evaluate<PanelBody & {script:string}>(PANEL_BODY);
    // Parse the exact bytes fetched by this browser without bypassing or relaxing its CSP.
    new Script(script);
    return body;
  };

  /**
   * The heights of the visible `mw-menu` items on the specimen board, which shows the menu as the plugin pages use it, in two lists:
   * `plain` rows (a name only) and `described` rows (`mw-menu__item--described`: a 12px description under the name, the "Menu
   * Description" specimen added by K1 #1850). A described row grows with its description and has its own rule in DESIGN.md's `mw-menu` paragraph.
   */
  const menuRows = async (width: number, height: number) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: touch }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog` }, sessionId));
    await waitFor("document.querySelectorAll('.mw-menu__item').length > 0", 20_000);
    await settle();
    return evaluate<Array<{ h: number; described: boolean; descriptionFits: boolean }>>(`[...document.querySelectorAll(".mw-menu .mw-menu__item")].filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).map(el => {
      const box = el.getBoundingClientRect(), description = el.querySelector(".mw-menu__desc"), desc = description?.getBoundingClientRect();
      return { h: Math.round(box.height), described: el.classList.contains("mw-menu__item--described"),
        descriptionFits: !!desc && desc.height > 0 && desc.top >= box.top && desc.bottom <= box.bottom && desc.left >= box.left && desc.right <= box.right
          && description.scrollWidth <= description.clientWidth && description.scrollHeight <= description.clientHeight };
    })`);
  };

  return { start, open, short, settle, shellFindings, rowFit, topPins, popovers, switcherOps, stripMenus, panelHeader, panelBody, menuRows, line, typeAndLeave, moreLabels, makeCurrentWork, carriedByCoding, escapeReturns, evaluate, waitFor };
}

/** A new work a plugin carries: who does it and its mode are the composer's controls (K3, UIV-12). */
const NEW_WORK_KINDS = ["composer control"];
const CURRENT_WORK_KINDS = ["work chip clear", "composer control"];
const WITH_NOTICE = [...CURRENT_WORK_KINDS, "attention chip"];
/** The windows where a phone's Assistant composer is tight: 320 and 360 are the narrow phones, 390 the common one, and 640, 667 and
 * 740 are phones held sideways (the Dock and residents trays leave the composer 214, 241 and 314px), 852 the one that has room. */
const LINE_WINDOWS = [[320, 568], [360, 740], [390, 844], [640, 360], [667, 375], [740, 360], [852, 393]] as const;
const LINE_STATES = [
  ["a current work", [], CURRENT_WORK_KINDS],
  ["a current work with a notice", ["[data-assistant-attention]"], WITH_NOTICE],
] as const;

for (const scheme of ["light", "dark"] as const) {
  test(`touch windows: the shell's controls are 44px and the Assistant line stays inside its pill · ${scheme}`, { timeout: 600_000 }, async t => {
    const browser = await openGoalBrowser(t, "seeded");
    if (!browser) return;
    const w = windowsOf(browser, scheme, true);
    await w.start();

    // A phone. Three screens carry every control: the project's home, a plugin's page (its plugin tab), and the project's
    // settings (a cover chip with its close mark, and the directory toggle: the widest the row gets). Since specs/screen-polish §3
    // 方案 C (POLISH-07) the strip is one row of 44px targets that touch one another — the way back, 项目主页, the tabs' own box
    // (which scrolls inside itself), ＋, the side's switch, the directory button and the project — and no window overlaps the
    // targets, shrinks one or pushes one off the edge. The Dock keeps 项目主页 alone there, and the switcher lists the rest.
    const seen = new Set<string>();
    const HOME = ["home", "", "true"] as const, PLUGIN = ["a plugin's page", "?openPlugin=todo", "!!document.querySelector('[data-tab-kind=\"plugin\"]')"] as const;
    const SETTINGS = ["the project's settings", "settings", "!!document.querySelector('.tab-view-chip-close')"] as const;
    await w.open(390, 844, HOME[1], HOME[2]);
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
        // POLISH-07: the first place is all that is fixed at the top, no plugin is kept there, and a phone's one row always
        // holds it (§4「底栏第十三版」第 1 条: it is how the project is changed).
        assert.deepEqual(await w.topPins(), { all: ["top-corner"], shown: ["top-corner"] }, `${name} · ${width}: the first place is the top's only fixed piece`);
      }
    }
    // A phone's one row has no layout button (specs/screen-polish §3 方案 C, POLISH-07: one column shows, and the row has no room
    // for it beside a 98px tab); it is measured in the touch windows wider than a phone, below.
    assert.equal(seen.has("layout"), false, "a phone's row draws no layout button");
    // Nor, at 540px and under, the way back (it gives its place to the tab), nor the account bar, which is a foot block from 960px;
    // all three are measured in the touch windows wider than a phone, below.
    const WIDER = ["layout", "history", "account", "account key"];
    assert.deepEqual(WIDER.filter(kind => seen.has(kind)), [], "a phone draws no layout button, way back or account bar");
    assert.deepEqual(Object.values(KINDS).filter(kind => !LINE_KINDS.includes(kind) && !WIDER.includes(kind) && !seen.has(kind)), [], "the three screens showed every other kind of control, so none went unmeasured");

    // The Assistant's composer stays a 44px input with room to type, and its ＋ and send keep their size while typing.
    await w.evaluate(`(() => { const input = document.querySelector('[data-assistant-composer] .mw-composer__input'); input.focus(); input.value = '整理一下本周的待办'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const typing = (await w.evaluate<Control[]>(SHELL_CONTROLS)).filter(control => control.kind.startsWith("assistant"));
    assert.deepEqual(typing.map(control => control.kind).sort(), ["assistant attach", "assistant input", "assistant receiver", "assistant send"], "B10-R6: input, attach, receiver and send are all there while typing");
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
        assert.ok(controls.some(control => control.kind === "layout"), `${name} · ${screen}: the layout button is on the strip, so it is among the 44px targets measured`);
        assert.ok(controls.some(control => control.kind === "history"), `${name} · ${screen}: the way back is on the strip, so it is among the 44px targets measured`);
        if (width >= 960) assert.deepEqual(["account", "account key"].filter(kind => !controls.some(control => control.kind === kind)), [], `${name} · ${screen}: the account bar's name and keys are among the 44px targets measured`);
        assert.deepEqual(await w.topPins(), { all: ["top-corner"], shown: ["top-corner"] }, `${name} · ${screen}: the first place is the top's only fixed piece`);
        assert.deepEqual(await w.shellFindings(), [], `${name} · ${screen} · ${width}×${height}: the bar and the strip lay out cleanly with 44px targets`);
      }
    }

    // What the bar opens is a 44px target too: the lists of the Assistant's composer (the "+" menu, the notices with their buttons,
    // the strip's add and remove buttons), the plugin switcher with its add buttons and the project menu.
    for (const [name, width, height] of [["a phone", 390, 844], ["a narrow phone", 360, 740], ["a tablet", 1024, 768]] as const) {
      await w.open(width, height, "", "true");
      const lists = await w.popovers(44);
      for (const [list] of listsAt(width)) {
        const report = lists[list];
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
      const plainRows = rows.filter(row => !row.described);
      assert.ok(plainRows.length > 0, `plain menu items are present at ${width}`);
      assert.deepEqual(plainRows.filter(row => row.h !== 44), [], `plain mw-menu items are exactly 44px tall at ${width}`);
      assert.deepEqual(rows.filter(row => row.h < 44), [], `mw-menu items are 44px tall at ${width} (${rows})`);
      const describedRows = rows.filter(row => row.described);
      assert.ok(describedRows.length > 0, `T01-MENU-01: described menu items are present at ${width}`);
      assert.deepEqual(describedRows.filter(row => !row.descriptionFits), [], `descriptions fit their touch targets at ${width}`);
    }

    // The Assistant's composer in the states the seeded project does not start in, measured on the real bar: first a new work a plugin
    // carries (who does it and its mode beside ＋, folded behind 更多 where the composer is narrow), then a current work, whose receiver
    // row has a mark to start a new work instead.
    for (const [width, height] of [[390, 844], [852, 393]] as const) {
      await w.open(width, height, "", "true");
      await w.carriedByCoding();
      await w.line(`a new work Coding carries · ${width}`, [], NEW_WORK_KINDS, 44);
      assert.deepEqual(await w.shellFindings(), [], `a new work · ${width}: the bar lays out cleanly with 44px controls`);
    }
    await w.makeCurrentWork();
    // The opened Assistant panel's tab bar (the work's tab and its close mark, new work, all works, details, minimize) is a row of 44px
    // targets that stays inside the panel and leaves the tab a title, at the phones' widths, held sideways and on a tablet.
    for (const [width, height] of [[320, 568], [360, 740], [390, 844], [852, 393], [1024, 768]] as const) {
      await w.open(width, height, "", "true");
      const header = await w.panelHeader();
      assert.equal(header.shown, true, `the panel opens from 展开对话, above the input, at ${width}`);
      assert.ok(header.controls.length >= 5, `the panel's tab bar has its tab, close mark and four buttons at ${width} (${JSON.stringify(header.controls)})`);
      assert.deepEqual(header.controls.filter(control => Math.min(control.w, control.h) < 44).map(control => `${control.label} ${control.w}×${control.h}`), [], `panel header · ${width}: every control is a 44px target`);
      assert.deepEqual(header.controls.filter(control => !control.inside).map(control => control.label), [], `panel header · ${width}: and none leaves the panel`);
      // The main conversation's tab is named by who is spoken to (specs/work-line §4.4): a short name shown whole is room enough.
      assert.ok(header.title >= 40 || header.whole, `panel header · ${width}: the current tab keeps room for a title (${header.title}px)`);
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
    for (const [width, height] of LINE_WINDOWS) {
      await w.open(width, height, "", "true");
      for (const [name, chips, kinds] of LINE_STATES) {
        const { fit } = await w.line(`${name} · ${width}`, [...chips], [...kinds], 44);
        // B36F-04: the current work's role picker is the control measured by line(), also when it folds into More.
        assert.equal(await w.evaluate("!!document.querySelector('[data-assistant-composer] [data-composer-control=character]')"), true);
        assert.equal(fit.folded, width < 480, `${name} · ${width}: the role picker folds on a narrow phone`);
        await w.typeAndLeave(`${name} · ${width}`, fit);
        assert.deepEqual(await w.shellFindings(), [], `${name} · ${width}: the bar lays out cleanly with 44px targets`);
        assert.ok(fit.input >= (width <= 600 ? 64 : 44), `${name} · ${width}: the input keeps its floor (${fit.input}px)`);
      }
    }
    // A tablet's composer, with every part a current work shows.
    await w.open(1024, 768, "", "true");
    await w.line("a current work with a notice · 1024", ["[data-assistant-attention]"], WITH_NOTICE, 44);
    assert.deepEqual(await w.shellFindings(), [], "a current work with a notice · 1024: the bar lays out cleanly");
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
      assert.ok(input && input.h <= 46, "the desktop Assistant input is the composer's two lines (44px) to start, not grown");
      assert.ok(controls.some(control => w.short(control) < 44), `${name} · 1280: the desktop chrome is denser than 44px, as the exception says`);
    }

    // Ordinary plugin menu rows are 34px on a desktop window, as DESIGN.md writes it.
    // T01-MENU-01 / UIC-04: ordinary rows stay compact; descriptions added by the composer board wrap without clipping.
    const menuRows = await w.menuRows(1280, 800);
    assert.deepEqual([...new Set(menuRows.filter(row => !row.described).map(row => row.h))], [34], "ordinary mw-menu items keep their 34px with a fine pointer");
    const describedRows = menuRows.filter(row => row.described);
    assert.ok(describedRows.length > 0, "the specimen board includes described menu items");
    assert.deepEqual(describedRows.filter(row => ![56, 74].includes(row.h)), [], "described desktop items keep their one-line or two-line description heights");
    assert.deepEqual(describedRows.filter(row => row.h <= 34 || !row.descriptionFits), [], "described menu items expand to show their complete description");

    // What the bar opens keeps the desktop floor too (32px, 28px compact): nothing in its lists is smaller.
    await w.open(1280, 800, "", "true");
    const lists = await w.popovers(32);
    for (const [list] of listsAt(1280)) {
      const report = lists[list];
      assert.ok(report, `1280: ${list} has a button that opens it`);
      assert.equal(report.shown, true, `1280: ${list} opens`);
      // A fine pointer shows the switcher's add buttons on hover and focus only, so a list at rest does not hold them.
      assert.deepEqual(report.missing.filter(selector => !HOVER_ONLY.includes(selector)), [], `1280: ${list} holds the controls this test measures`);
      assert.deepEqual(report.small.map(item => `${item.cls} 「${item.label}」 ${item.w}×${item.h}`), [], `1280: every control in ${list} is at least 32px`);
    }

    // The switcher's open-beside and add buttons are there only while a tile is looked at, so the lists above did not measure them: put the mouse on a
    // tile. They are the floor's size (--control-h: 32px), fit inside the row, and the row's text leaves them their room.
    await w.open(1280, 800, "", "true");
    const ops = await w.switcherOps();
    for (const [kind, report] of Object.entries(ops)) {
      assert.ok(report, `1280: the switcher lists ${kind}`);
      assert.equal(report.floor, 32, "1280: standard density, whose floor is 32px");
      assert.equal(report.buttons.length, 2, `1280: ${kind} shows open beside and an add or remove button`);
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

    // A short window (1280×500): v13 strip and foot controls stay present and above their floors.
    const shortWindow = await w.open(1280, 500, "", "true");
    assert.deepEqual(shortWindow.filter(control => w.short(control) < floors[control.area]).map(control => `${control.kind} ${control.w}×${control.h}`), [],
      "a short window · 1280×500: nothing in the strip is under 20px or in the bar under 28px");
    for (const [area, kind] of [["strip", "first place"], ["strip", "plugin switcher"], ["strip", "side switch"], ["bar", "account"], ["bar", "account key"], ["bar", "assistant input"], ["bar", "assistant send"], ["bar", "line count"]] as const) {
      assert.ok(shortWindow.some(control => control.area === area && control.kind === kind), `a short window · 1280×500: ${area} renders ${kind} so the floor check covers live controls`);
    }

    // The Assistant's composer in the states the seeded project does not start in, on the desktop bar's 28px floor.
    await w.open(1280, 800, "", "true");
    await w.carriedByCoding();
    await w.line("a new work Coding carries · 1280", [], NEW_WORK_KINDS, floors.bar);
    // Escape puts away what a button of the composer or foot opened and gives it focus back: the "+" menu, the notices, and the work list.
    for (const [name, button, popover] of [["the + menu", "[data-assistant-composer] [data-composer-add]", "[data-assistant-composer] .mw-composer__start [data-compose-menu]"],
      ["the notices", "[data-assistant-attention]", "[data-assistant-notices]"],
      ["the work list", "[data-work-list='done']", "[data-work-lists]"]] as const) {
      if (name === "the notices") await w.evaluate(showChips(["[data-assistant-attention]"]));
      assert.deepEqual(await w.escapeReturns(button, popover), { opened: true, closed: true, focus: true, onButton: true }, `${name} · 1280: Escape closes it and focus goes back to its button`);
    }
    await w.makeCurrentWork();
    await w.open(1280, 800, "", "true");
    await w.line("a current work · 1280", [], ["work chip clear"], floors.bar);
    await w.line("a current work with a notice · 1280", ["[data-assistant-attention]"], WITH_NOTICE, floors.bar);
    // The opened panel's body is where the touch rules end: with a fine pointer its details and conversation controls keep the denser
    // sizes they have on a desktop (the 22–28px ones are the known gap BL-127), and what is long or wide enough to read is not stretched.
    const panel = await w.panelBody();
    assert.deepEqual(panel.real["the details"].filter(item => /assistant-side-action/.test(item.cls) && item.h >= 44).map(item => `${item.cls} ${item.w}×${item.h}`), [], "1280: the panel's details keep their desktop sizes with a fine pointer");
    assert.deepEqual(panel.made.filter(item => /assistant-(copy|segment|side-action|code-copy)\b/.test(item.cls) && item.h >= 44).map(item => `${item.cls} ${item.w}×${item.h}`), [], "1280: and so do the conversation's own small buttons");
    assert.ok(panel.real["all works"].filter(item => /assistant-works-new/.test(item.cls)).every(item => item.h < 44), "1280: the list of all works keeps its desktop rows (the one-line row is not 44px)");
    await w.open(1280, 500, "", "true");
    await w.line("a current work · short window 1280×500", [], CURRENT_WORK_KINDS, floors.bar);

    // A narrow desktop window (700px, where the Assistant's column is 302px): the composer stays inside its box and keeps its input,
    // ＋ and send at their sizes; its scene controls fold behind 更多 by its own sheet, as everywhere.
    await w.open(700, 800, "", "true");
    for (const [name, chips, kinds] of LINE_STATES) {
      const { fit } = await w.line(`${name} · 700`, [...chips], [...kinds], floors.bar, true);
      assert.equal(fit.touchRules, false, "a fine-pointer window of 700px does not take the phone's rules");
    }

    // Just wider than a phone (620px, fine pointer) the bar is not a touch window either, and the "+" menu lists its usual rows.
    await w.open(620, 800, "", "true");
    for (const [name, chips, kinds] of LINE_STATES) {
      const { fit } = await w.line(`${name} · 620`, [...chips], [...kinds], floors.bar, true, false);
      assert.equal(fit.touchRules, false, "a fine-pointer window of 620px does not take the phone's rules");
      // In a project the menu also offers the project-knowledge picker (PMAT-17; specs/project-knowledge/spec.md §9 and §14), as a `/` command.
      const labels = await w.moreLabels();
      assert.equal(labels[0], "添加文件或图片…", `${name} · 620: the "+" menu starts with files (${labels})`);
      // Since batch 11 a command's row is its name, with the `/word` that finds it where a shortcut stands (composer-parts.ts).
      assert.ok(labels.includes("选择项目资料… /资料"), `${name} · 620: and offers the project's material (${labels})`);
    }
  });
}
