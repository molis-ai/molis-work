/** Progressive enhancement: visible native <select> opens mw-menu instead of the OS picker. */

export const SELECT_MENU_STYLES = `
  .mw-select-picker { display: block; position: relative; width: 100%; min-width: 0; }
  .mw-input-group .mw-select-picker { width: auto; flex: none; }
  .mw-input-group .mw-select-picker__trigger { width: auto; min-width: 8rem; }
  .mw-select-picker > select[hidden],
  .mw-select-picker > select {
    display: none !important;
  }
  .mw-select-picker__trigger {
    display: flex; align-items: center; justify-content: flex-start;
    width: 100%; text-align: left; cursor: pointer; appearance: none; -webkit-appearance: none;
  }
  .mw-select-picker__trigger:not(.mw-select) {
    padding-right: 22px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236d6d76' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 4px center;
    background-size: 12px 12px;
  }
  .mw-select-picker__trigger [data-mw-select-label] {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .mw-select-picker__menu {
    position: fixed; margin: 0; inset: unset;
    min-width: 160px; max-height: min(280px, 45dvh); overflow: auto;
    padding: 6px; border: 1px solid var(--hairline, var(--line, var(--control-border)));
    border-radius: var(--radius-surface, 12px); background: var(--paper);
    box-shadow: var(--control-shadow, 0 16px 40px color-mix(in srgb, var(--ink) 18%, transparent));
    color: var(--ink); z-index: 80;
  }
  .mw-select-picker__menu:not(:popover-open):not(.is-open) { display: none; }
  .mw-select-picker__menu.is-open { display: flex; flex-direction: column; }
  .mw-select-picker__menu:popover-open,
  .mw-select-picker__menu.is-open {
    animation: creative-arrive var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)) both;
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-select-picker__menu:popover-open, .mw-select-picker__menu.is-open { animation: none; }
  }
  .mw-select-picker__item {
    display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px;
    padding: 0 10px; border: 0; border-radius: 8px; background: transparent;
    color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
  }
  .mw-select-picker__item:hover, .mw-select-picker__item:focus-visible {
    background: var(--nav-hover, color-mix(in srgb, var(--ink) 6%, transparent)); outline: none;
  }
  .mw-select-picker__item:disabled { color: var(--faint); cursor: default; }
  .mw-select-picker__check {
    width: 14px; flex: none; color: var(--muted); visibility: hidden; font-size: 12px;
  }
  .mw-select-picker__item.is-current .mw-select-picker__check { visibility: visible; }
  .mw-select-picker__group {
    padding: 8px 10px 4px; color: var(--muted); font-size: 11px; line-height: 1.3;
  }
`;

export const SELECT_MENU_CLIENT_SCRIPT = `
(() => {
  const skip = (select) => {
    if (!select || select.tagName !== "SELECT") return true;
    if (select.multiple || Number(select.size) > 1) return true;
    if (select.hidden || select.getAttribute("aria-hidden") === "true") return true;
    if (select.closest("[data-mw-select-picker]")) return true;
    if (select.dataset.mwSelectSkip === "true") return true;
    return false;
  };
  const optionText = (option) => ((option && (option.label || option.textContent)) || "").trim();
  const canPopover = (menu) => typeof menu.showPopover === "function";
  const menuOpen = (menu) => canPopover(menu)
    ? (typeof menu.matches === "function" && menu.matches(":popover-open"))
    : menu.classList.contains("is-open");
  const sync = (select) => {
    const picker = select.closest("[data-mw-select-picker]");
    if (!picker) return;
    const label = picker.querySelector("[data-mw-select-label]");
    if (label) label.textContent = optionText(select.selectedOptions[0]) || "\\u00a0";
    picker.querySelectorAll("[data-mw-select-option]").forEach((item) => {
      const on = (item.dataset.value || "") === select.value;
      item.classList.toggle("is-current", on);
      item.setAttribute("aria-selected", on ? "true" : "false");
    });
    const trigger = picker.querySelector("[data-mw-select-trigger]");
    if (trigger) {
      trigger.disabled = select.disabled;
      const invalid = select.getAttribute("aria-invalid");
      if (invalid) trigger.setAttribute("aria-invalid", invalid);
      else trigger.removeAttribute("aria-invalid");
    }
  };
  const fillMenu = (select, menu) => {
    menu.replaceChildren();
    const addOption = (option) => {
      if (option.hidden) return;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "mw-menu__item mw-select-picker__item";
      item.dataset.mwSelectOption = "";
      item.dataset.value = option.value;
      item.setAttribute("role", "option");
      item.disabled = option.disabled;
      const check = document.createElement("span");
      check.className = "mw-select-picker__check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "\\u2713";
      const text = document.createElement("span");
      text.textContent = optionText(option);
      item.append(check, text);
      item.addEventListener("click", () => {
        if (select.disabled || option.disabled) return;
        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closeMenu(select, menu);
      });
      menu.append(item);
    };
    [...select.children].forEach((child) => {
      if (child.tagName === "OPTGROUP") {
        const head = document.createElement("div");
        head.className = "mw-select-picker__group";
        head.textContent = child.label;
        menu.append(head);
        [...child.children].forEach((option) => { if (option.tagName === "OPTION") addOption(option); });
        return;
      }
      if (child.tagName === "OPTION") addOption(child);
    });
    sync(select);
  };
  const placeMenu = (trigger, menu) => {
    const rect = trigger.getBoundingClientRect();
    menu.style.minWidth = Math.max(rect.width, 160) + "px";
    menu.style.maxWidth = Math.min(360, Math.max(8, innerWidth - 16)) + "px";
    const width = Math.max(menu.offsetWidth, rect.width);
    const height = menu.offsetHeight;
    let left = rect.left;
    if (left + width > innerWidth - 8) left = Math.max(8, innerWidth - width - 8);
    let top = rect.bottom + 4;
    if (top + height > innerHeight - 8) top = Math.max(8, rect.top - 4 - height);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  };
  const closeMenu = (select, menu) => {
    const picker = select.closest("[data-mw-select-picker]");
    const trigger = picker?.querySelector("[data-mw-select-trigger]");
    if (canPopover(menu) && menuOpen(menu)) menu.hidePopover();
    menu.classList.remove("is-open");
    trigger?.setAttribute("aria-expanded", "false");
  };
  const openMenu = (select, trigger, menu) => {
    fillMenu(select, menu);
    if (canPopover(menu)) {
      if (!menuOpen(menu)) menu.showPopover();
    } else {
      menu.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      placeMenu(trigger, menu);
      const current = menu.querySelector("[data-mw-select-option].is-current") || menu.querySelector("[data-mw-select-option]");
      current?.focus();
    }
  };
  const enhance = (select) => {
    if (skip(select)) return;
    const id = "mw-select-menu-" + Math.random().toString(36).slice(2, 10);
    const picker = document.createElement("div");
    picker.className = "mw-select-picker";
    picker.dataset.mwSelectPicker = "";
    select.classList.forEach((name) => { if (name !== "mw-select") picker.classList.add(name); });
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = select.classList.contains("mw-select") || !select.className.trim()
      ? "mw-select mw-select-picker__trigger"
      : (select.className + " mw-select-picker__trigger");
    trigger.dataset.mwSelectTrigger = "";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", id);
    const ariaLabel = select.getAttribute("aria-label");
    if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);
    const labelledBy = select.getAttribute("aria-labelledby");
    if (labelledBy) trigger.setAttribute("aria-labelledby", labelledBy);
    const text = document.createElement("span");
    text.dataset.mwSelectLabel = "";
    trigger.append(text);
    const menu = document.createElement("div");
    menu.id = id;
    menu.className = "mw-menu mw-select-picker__menu";
    menu.dataset.slot = "menu";
    menu.setAttribute("role", "listbox");
    if (ariaLabel) menu.setAttribute("aria-label", ariaLabel);
    if (canPopover(menu)) {
      menu.setAttribute("popover", "auto");
      trigger.setAttribute("popovertarget", id);
    }
    select.before(picker);
    picker.append(select, trigger, menu);
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    fillMenu(select, menu);
    menu.addEventListener("toggle", () => {
      const open = menuOpen(menu);
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        fillMenu(select, menu);
        placeMenu(trigger, menu);
        const current = menu.querySelector("[data-mw-select-option].is-current") || menu.querySelector("[data-mw-select-option]");
        current?.focus();
      }
    });
    trigger.addEventListener("click", (event) => {
      if (canPopover(menu)) return;
      event.preventDefault();
      if (select.disabled) return;
      if (menuOpen(menu)) closeMenu(select, menu);
      else openMenu(select, trigger, menu);
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      if (!menuOpen(menu)) openMenu(select, trigger, menu);
    });
    menu.addEventListener("keydown", (event) => {
      const items = [...menu.querySelectorAll("[data-mw-select-option]:not(:disabled)")];
      const index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        items[Math.max(0, Math.min(items.length - 1, next < 0 ? 0 : next))]?.focus();
      }
      if (event.key === "Home") { event.preventDefault(); items[0]?.focus(); }
      if (event.key === "End") { event.preventDefault(); items[items.length - 1]?.focus(); }
      if (event.key === "Escape") { event.preventDefault(); closeMenu(select, menu); trigger.focus(); }
    });
    document.addEventListener("pointerdown", (event) => {
      if (canPopover(menu) || !menuOpen(menu)) return;
      if (picker.contains(event.target)) return;
      closeMenu(select, menu);
    });
    select.addEventListener("change", () => sync(select));
    select.addEventListener("input", () => sync(select));
    try {
      const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
      if (desc?.get && desc?.set) {
        Object.defineProperty(select, "value", {
          configurable: true,
          enumerable: true,
          get() { return desc.get.call(this); },
          set(value) {
            desc.set.call(this, value);
            sync(select);
          },
        });
      }
    } catch {}
    let scheduled = false;
    const scheduleFill = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        fillMenu(select, menu);
      });
    };
    new MutationObserver(scheduleFill).observe(select, {
      childList: true, subtree: true, characterData: true, attributes: true,
    });
  };
  const scan = (root) => {
    if (!root || typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll("select").forEach((select) => {
      try { enhance(select); } catch {}
    });
  };
  let observing = false;
  const start = () => {
    scan(document);
    if (observing) return;
    observing = true;
    new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          try {
            if (node.matches?.("select")) enhance(node);
            else scan(node);
          } catch {}
        });
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("reset", (event) => {
      const form = event.target;
      requestAnimationFrame(() => form.querySelectorAll?.("[data-mw-select-picker] select")?.forEach(sync));
    }, true);
  };
  start();
  document.addEventListener("DOMContentLoaded", start);
  addEventListener("load", () => scan(document));
})();
`;
