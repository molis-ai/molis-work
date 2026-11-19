/**
 * The 工作台导航 frame's behaviour (apps/workbench/src/navigation-specimens.ts), only as far as a specimen needs to be tried:
 * tabs answer ←→ Home End and a click; a glyph-only tab widens after resting on it about 0.14s, and moving along the row hands
 * the width over at once; a menu button opens and closes its menu, ↑↓ move in it, Esc closes it and gives the focus back to its
 * button; a menu's search field narrows its rows; the side's switch and the undo chip answer; the side's tab drops its list of
 * views, where ↑↓ move and a press chooses. The product's own behaviour is side-panel.ts and the strip's scripts.
 */
import { installWorkLineLayout } from "../work-line-layout.js";

const board = document.querySelector<HTMLElement>("[data-nav-board]");
const REST_MS = 140;
const GLYPH = ".tab-item[data-glyph-only]";
const UNDO_MS = 6000;

const target = (event: Event) => (event.target instanceof Element ? event.target : null);
const tabsOf = (list: Element) => [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
const menuOf = (button: Element) => document.getElementById(button.getAttribute("aria-controls") ?? "");
const opensFrom = (menu: Element | null) => Boolean(menu?.closest(".mw-navs__anchor, [data-nav-titlebar]"));
const itemsOf = (menu: Element) => [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemcheckbox"]')].filter((item) => !item.disabled && !item.closest("[hidden]"));

function choose(trigger: HTMLElement): void {
  const list = trigger.closest('[role="tablist"]');
  if (!list) return;
  for (const other of tabsOf(list)) {
    const on = other === trigger, item = other.closest(".tab-item");
    other.setAttribute("aria-selected", String(on)); other.tabIndex = on ? 0 : -1;
    item?.classList.toggle("is-active", on);
    if (on) item?.setAttribute("aria-current", "page"); else item?.removeAttribute("aria-current");
  }
}

function setMenu(button: Element, open: boolean): void {
  const menu = menuOf(button);
  if (!menu) return;
  menu.hidden = !open; button.setAttribute("aria-expanded", String(open));
  if (open) (menu.querySelector<HTMLElement>("[data-nav-find]") ?? menu.querySelector<HTMLElement>('[aria-selected="true"]') ?? itemsOf(menu)[0])?.focus();
}

/** Close the menus that open from a button, in an anchor or in the strip's specimen (the ones drawn open as specimens stay). */
function closeAll(scope: Element, except?: Element): void {
  for (const button of scope.querySelectorAll('[data-nav-menu-for][aria-expanded="true"]')) {
    if (button !== except && opensFrom(menuOf(button))) setMenu(button, false);
  }
}

function undo(chip: HTMLElement): void {
  const live = chip.closest(".mw-navs__stage")?.querySelector("[data-nav-live]");
  chip.hidden = true;
  if (live) live.textContent = chip.dataset.reopened ?? "";
  // The product's chip stays 6 s after a group closes; the board brings it back after as long, to be tried again.
  setTimeout(() => { chip.hidden = false; if (live) live.textContent = ""; }, UNDO_MS);
}

function step(event: KeyboardEvent, list: HTMLElement[], at: number, forward: boolean): void {
  const next = at < 0 ? (forward ? 0 : list.length - 1) : (at + (forward ? 1 : -1) + list.length) % list.length;
  list[next]?.focus(); event.preventDefault();
}

/** A glyph-only tab widens after a short rest; once one is wide, the next one along the row takes the width at once. */
function watchGlyphs(row: Element): void {
  let timer = 0;
  const grown = () => [...row.querySelectorAll(`${GLYPH}.is-grown`)];
  const grow = (item: Element) => { for (const other of grown()) if (other !== item) other.classList.remove("is-grown"); item.classList.add("is-grown"); };
  row.addEventListener("pointerover", (event) => {
    const item = target(event)?.closest(GLYPH);
    if (!item || item.classList.contains("is-grown")) return;
    clearTimeout(timer);
    if (grown().length) grow(item); else timer = window.setTimeout(() => grow(item), REST_MS);
  });
  row.addEventListener("pointerleave", () => { clearTimeout(timer); for (const item of grown()) item.classList.remove("is-grown"); });
  // Keyboard focus widens at once (the sheet keys the width on the class alone, so the product sets it the same way).
  row.addEventListener("focusin", (event) => {
    const node = target(event), item = node?.closest(GLYPH);
    if (item && node?.matches(":focus-visible")) { clearTimeout(timer); grow(item); }
  });
  row.addEventListener("focusout", (event) => { target(event)?.closest(GLYPH)?.classList.remove("is-grown"); });
}

if (board) {
  board.addEventListener("click", (event) => {
    const node = target(event);
    if (!node) return;
    const toggle = node.closest("[data-nav-menu-for]");
    if (toggle) { closeAll(board, toggle); setMenu(toggle, toggle.getAttribute("aria-expanded") !== "true"); return; }
    const chip = node.closest<HTMLElement>("[data-nav-undo]");
    if (chip) { undo(chip); return; }
    const sideSwitch = node.closest("[data-nav-side-switch]");
    if (sideSwitch) { sideSwitch.setAttribute("aria-pressed", String(sideSwitch.getAttribute("aria-pressed") !== "true")); return; }
    const trigger = node.closest<HTMLElement>('[role="tab"]');
    if (trigger) {
      choose(trigger);
      // Chosen from the side's list: the list closes and the side's tab names the view, as side-panel.ts does.
      const list = trigger.closest<HTMLElement>("[data-side-menu]"), ear = list && board.querySelector<HTMLElement>(`[aria-controls="${list.id}"]`);
      if (list && ear && opensFrom(list)) {
        const name = ear.querySelector(".side-ear-name"), glyph = ear.querySelector(".side-ear-glyph"), svg = trigger.querySelector("svg");
        if (name) name.textContent = trigger.querySelector(".tab-item-name")?.textContent ?? "";
        if (glyph && svg) glyph.replaceChildren(svg.cloneNode(true));
        setMenu(ear, false); ear.focus();
      }
      return;
    }
    if (!node.closest("[data-nav-popover]")) closeAll(board);
  });

  board.addEventListener("keydown", (event) => {
    const node = target(event);
    const trigger = node?.closest<HTMLElement>('[role="tab"]');
    const list = trigger?.closest('[role="tablist"]');
    // A vertical list (the side's views) takes ↑↓, a strip ←→.
    const vertical = list?.getAttribute("aria-orientation") === "vertical";
    if (trigger && list && [vertical ? "ArrowUp" : "ArrowLeft", vertical ? "ArrowDown" : "ArrowRight", "Home", "End"].includes(event.key)) {
      const all = tabsOf(list);
      if (event.key === "Home" || event.key === "End") { all[event.key === "Home" ? 0 : all.length - 1]?.focus(); event.preventDefault(); return; }
      step(event, all, all.indexOf(trigger), event.key === "ArrowRight" || event.key === "ArrowDown");
      return;
    }
    const menu = node?.closest<HTMLElement>("[data-nav-popover]");
    if (!menu) { if (event.key === "Escape") closeAll(board); return; }
    if (event.key === "Escape") {
      const button = board.querySelector<HTMLElement>(`[aria-controls="${menu.id}"]`);
      if (button && opensFrom(menu)) { setMenu(button, false); button.focus(); }
      event.preventDefault(); return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = itemsOf(menu);
      step(event, items, items.indexOf(document.activeElement as HTMLButtonElement), event.key === "ArrowDown");
    }
  });

  board.addEventListener("input", (event) => {
    const field = target(event)?.closest<HTMLInputElement>("[data-nav-find]");
    const menu = field?.closest("[data-nav-popover]");
    if (!field || !menu) return;
    const query = field.value.trim().toLowerCase();
    for (const row of menu.querySelectorAll<HTMLElement>('.tab-menu-row, [role="menuitem"]')) {
      const holder = row.closest<HTMLElement>(".tab-menu-row") ?? row;
      holder.hidden = Boolean(query) && !(holder.textContent ?? "").toLowerCase().includes(query);
    }
  });

  for (const row of board.querySelectorAll("[data-nav-glyph-row], .tab-strip")) watchGlyphs(row);
  // 全部标签 shows when its strip cannot hold its tabs (a phone always shows it, in the sheet): the board measures as the product will.
  for (const button of board.querySelectorAll<HTMLElement>("[data-nav-when-full]")) {
    const scroll = button.closest(".tab-strip")?.querySelector(".tab-scroll");
    if (!scroll) continue;
    const measure = () => button.toggleAttribute("data-nav-fits", scroll.scrollWidth <= scroll.clientWidth);
    new ResizeObserver(measure).observe(scroll);
  }
  // The 事项线 sheet (sheet=work-line): the line and the task panel sit as they do in the product.
  installWorkLineLayout(board);
}
