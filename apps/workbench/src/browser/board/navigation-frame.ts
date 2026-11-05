/**
 * The 工作台导航 frame's behaviour (apps/workbench/src/navigation-specimens.ts), only as far as a specimen needs to be tried:
 * tabs answer ←→ Home End and a click; a glyph-only tab widens after resting on it about 0.14s, and moving along the row hands
 * the width over at once; a menu button opens and closes its menu, ↑↓ move in it, Esc closes it and gives the focus back to its
 * button; a menu's search field narrows its rows; the pane switch and the undo chip answer. The product's own behaviour
 * arrives with the slices that adopt the parts.
 */
const board = document.querySelector<HTMLElement>("[data-nav-board]");
const REST_MS = 140;
const GLYPH = ".tab-item[data-glyph-only]";

const target = (event: Event) => (event.target instanceof Element ? event.target : null);
const tabsOf = (list: Element) => [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
const menuOf = (button: Element) => document.getElementById(button.getAttribute("aria-controls") ?? "");
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
  if (open) (menu.querySelector<HTMLElement>("[data-nav-find]") ?? itemsOf(menu)[0])?.focus();
}

/** Close the menus that open from a button (the ones drawn open as specimens stay). */
function closeAll(scope: Element, except?: Element): void {
  for (const button of scope.querySelectorAll('[data-nav-menu-for][aria-expanded="true"]')) {
    if (button !== except && menuOf(button)?.closest(".mw-navs__anchor")) setMenu(button, false);
  }
}

function undo(chip: HTMLElement): void {
  const live = chip.closest(".mw-navs__stage")?.querySelector("[data-nav-live]");
  chip.hidden = true;
  if (live) live.textContent = chip.dataset.reopened ?? "";
  setTimeout(() => { chip.hidden = false; if (live) live.textContent = ""; }, 2400);
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
    const segment = node.closest(".tab-pane-switch .mw-toggle");
    if (segment?.parentElement) {
      for (const other of segment.parentElement.querySelectorAll(".mw-toggle")) { const on = other === segment; other.classList.toggle("is-current", on); other.setAttribute("aria-pressed", String(on)); }
      return;
    }
    const trigger = node.closest<HTMLElement>('[role="tab"]');
    if (trigger) { choose(trigger); return; }
    if (!node.closest("[data-nav-popover]")) closeAll(board);
  });

  board.addEventListener("keydown", (event) => {
    const node = target(event);
    const trigger = node?.closest<HTMLElement>('[role="tab"]');
    const list = trigger?.closest('[role="tablist"]');
    if (trigger && list && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const all = tabsOf(list);
      if (event.key === "Home" || event.key === "End") { all[event.key === "Home" ? 0 : all.length - 1]?.focus(); event.preventDefault(); return; }
      step(event, all, all.indexOf(trigger), event.key === "ArrowRight");
      return;
    }
    const menu = node?.closest<HTMLElement>("[data-nav-popover]");
    if (!menu) { if (event.key === "Escape") closeAll(board); return; }
    if (event.key === "Escape") {
      const button = board.querySelector<HTMLElement>(`[aria-controls="${menu.id}"]`);
      if (button && menu.closest(".mw-navs__anchor")) { setMenu(button, false); button.focus(); }
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
  board.querySelector("[data-nav-composer]")?.addEventListener("submit", (event) => event.preventDefault());
}
