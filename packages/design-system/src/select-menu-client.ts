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
    position: fixed; margin: 0; inset: unset; box-sizing: border-box;
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
    display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; flex-shrink: 0;
    padding: 0 10px; border: 0; border-radius: 8px; background: transparent;
    color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; overflow-wrap: anywhere;
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
  @media (max-width: 760px), (pointer: coarse) {
    .mw-select-picker > .mw-select-picker__trigger,
    .mw-menu.mw-select-picker__menu .mw-select-picker__item { min-height: 44px; }
    .mw-menu.mw-select-picker__menu .mw-select-picker__item { font-size: 14px; }
  }
`;

export const SELECT_MENU_CLIENT_SCRIPT = `
(() => {
  const controls = new WeakMap();
  let activeSelect = null;
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
  const optionDisabled = (option) => option.disabled || (option.parentElement?.tagName === "OPTGROUP" && option.parentElement.disabled);
  const copyAttribute = (source, target, name) => {
    const value = source.getAttribute(name);
    if (value != null) target.setAttribute(name, value);
    else target.removeAttribute(name);
  };
  const sync = (select) => {
    const control = controls.get(select);
    if (!control) return;
    const { trigger, menu, text, labelIds } = control;
    text.textContent = optionText(select.selectedOptions[0]) || "\u00a0";
    menu.querySelectorAll("[data-mw-select-option]").forEach((item) => {
      const option = select.options[Number(item.dataset.mwSelectOption)];
      const on = option?.index === select.selectedIndex;
      item.classList.toggle("is-current", on);
      item.setAttribute("aria-selected", on ? "true" : "false");
      item.disabled = !option || optionDisabled(option);
    });
    trigger.disabled = select.matches(":disabled");
    trigger.setAttribute("aria-required", String(select.required));
    for (const name of ["aria-describedby", "aria-errormessage", "title"]) copyAttribute(select, trigger, name);
    const invalid = select.getAttribute("aria-invalid") || (control.validationFailed && !select.validity.valid ? "true" : null);
    if (invalid != null) trigger.setAttribute("aria-invalid", invalid);
    else trigger.removeAttribute("aria-invalid");
    const labelledBy = select.getAttribute("aria-labelledby") || labelIds.join(" ");
    const ariaLabel = select.getAttribute("aria-label");
    if (select.hasAttribute("aria-labelledby") || (!ariaLabel && labelledBy)) {
      trigger.setAttribute("aria-labelledby", labelledBy + " " + text.id);
      menu.setAttribute("aria-labelledby", labelledBy);
      trigger.removeAttribute("aria-label");
      menu.removeAttribute("aria-label");
    } else {
      trigger.removeAttribute("aria-labelledby");
      menu.removeAttribute("aria-labelledby");
      if (ariaLabel) {
        trigger.setAttribute("aria-label", ariaLabel + ": " + text.textContent);
        menu.setAttribute("aria-label", ariaLabel);
      } else {
        trigger.removeAttribute("aria-label");
        menu.removeAttribute("aria-label");
      }
    }
    if (trigger.disabled && menuOpen(menu)) closeMenu(select, menu);
  };
  const focusOption = (menu, value) => {
    const items = [...menu.querySelectorAll("[data-mw-select-option]:not(:disabled)")];
    const current = items.find((item) => value != null && item.dataset.value === value)
      || items.find((item) => item.classList.contains("is-current")) || items[0];
    current?.focus({ preventScroll: true });
    current?.scrollIntoView({ block: "nearest" });
  };
  const fillMenu = (select, menu) => {
    const focused = menu.contains(document.activeElement) ? document.activeElement.dataset.value : null;
    menu.replaceChildren();
    const addOption = (option) => {
      if (option.hidden) return;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "mw-menu__item mw-select-picker__item";
      item.dataset.mwSelectOption = String(option.index);
      item.dataset.value = option.value;
      item.setAttribute("role", "option");
      item.tabIndex = -1;
      item.disabled = optionDisabled(option);
      const check = document.createElement("span");
      check.className = "mw-select-picker__check";
      check.setAttribute("aria-hidden", "true");
      check.innerHTML = '<svg aria-hidden="true" width="14" height="14"><use href="#icon-check"></use></svg>';
      const text = document.createElement("span");
      text.textContent = optionText(option);
      item.append(check, text);
      item.addEventListener("click", () => {
        if (select.matches(":disabled") || optionDisabled(option)) return;
        select.selectedIndex = option.index;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closeMenu(select, menu, true);
      });
      menu.append(item);
    };
    [...select.children].forEach((child) => {
      if (child.tagName === "OPTGROUP") {
        if (child.hidden) return;
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
    if (focused != null && menuOpen(menu)) focusOption(menu, focused);
  };
  const placeMenu = (trigger, menu) => {
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft || 0) + 8;
    const topEdge = (viewport?.offsetTop || 0) + 8;
    const availableWidth = Math.max(0, (viewport?.width || innerWidth) - 16);
    const bottomEdge = topEdge + Math.max(0, (viewport?.height || innerHeight) - 16);
    const minWidth = Math.min(Math.max(rect.width, 160), availableWidth);
    menu.style.minWidth = minWidth + "px";
    menu.style.maxWidth = Math.max(minWidth, Math.min(360, availableWidth)) + "px";
    menu.style.maxHeight = Math.min(280, bottomEdge - topEdge) + "px";
    const below = Math.max(0, bottomEdge - rect.bottom - 4);
    const above = Math.max(0, rect.top - topEdge - 4);
    const opensBelow = menu.offsetHeight <= below || below >= above;
    menu.style.maxHeight = Math.min(280, opensBelow ? below : above, bottomEdge - topEdge) + "px";
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.max(leftEdge, Math.min(rect.left, leftEdge + availableWidth - width));
    const top = Math.max(topEdge, Math.min(opensBelow ? rect.bottom + 4 : rect.top - 4 - height, bottomEdge - height));
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  };
  const closeMenu = (select, menu, restoreFocus = false) => {
    const trigger = controls.get(select)?.trigger;
    if (canPopover(menu) && menuOpen(menu)) menu.hidePopover();
    menu.classList.remove("is-open");
    trigger?.setAttribute("aria-expanded", "false");
    if (activeSelect === select) activeSelect = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  };
  const openMenu = (select, trigger, menu) => {
    if (select.matches(":disabled")) return;
    if (activeSelect && activeSelect !== select) closeMenu(activeSelect, controls.get(activeSelect).menu);
    fillMenu(select, menu);
    if (canPopover(menu)) {
      if (!menuOpen(menu)) menu.showPopover();
    } else {
      menu.classList.add("is-open");
    }
    activeSelect = select;
    trigger.setAttribute("aria-expanded", "true");
    placeMenu(trigger, menu);
    focusOption(menu);
  };
  const enhance = (select) => {
    if (skip(select)) return;
    const id = "mw-select-menu-" + Math.random().toString(36).slice(2, 10);
    const labels = [...select.labels];
    const picker = document.createElement("div");
    picker.className = "mw-select-picker";
    picker.dataset.mwSelectPicker = "";
    select.classList.forEach((name) => {
      if (name === "mw-select" || name === "mw-input" || name === "mw-textarea") return;
      picker.classList.add(name);
    });
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = id + "-trigger";
    trigger.tabIndex = select.tabIndex;
    trigger.setAttribute("role", "combobox");
    trigger.className = select.classList.contains("mw-select") || !select.className.trim()
      ? "mw-select mw-select-picker__trigger"
      : (select.className + " mw-select-picker__trigger");
    trigger.dataset.mwSelectTrigger = "";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", id);
    const text = document.createElement("span");
    text.id = id + "-value";
    text.dataset.mwSelectLabel = "";
    trigger.append(text);
    const menu = document.createElement("div");
    menu.id = id;
    menu.className = "mw-menu mw-select-picker__menu";
    menu.dataset.slot = "menu";
    menu.setAttribute("role", "listbox");
    if (canPopover(menu)) {
      menu.setAttribute("popover", "auto");
      trigger.setAttribute("popovertarget", id);
    }
    const labelIds = [];
    labels.forEach((label, labelIndex) => {
      // Wrapping labels must name the field, without including the open menu's options.
      const parts = [];
      if (!label.contains(select)) parts.push(label);
      else {
        for (const node of [...label.childNodes]) {
          if (node === select || node.contains?.(select)) break;
          if (node.nodeType === 3 && node.textContent.trim()) {
            const span = document.createElement("span");
            node.replaceWith(span); span.append(node); parts.push(span);
          } else if (node.nodeType === 1) parts.push(node);
        }
      }
      parts.forEach((part, partIndex) => {
        part.id ||= id + "-label-" + labelIndex + "-" + partIndex;
        labelIds.push(part.id);
      });
      label.htmlFor = trigger.id;
    });
    select.before(picker);
    picker.append(select, trigger, menu);
    controls.set(select, { trigger, menu, text, labelIds, validationFailed: false });
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    select.focus = (options) => trigger.focus(options);
    fillMenu(select, menu);
    menu.addEventListener("toggle", () => {
      const open = menuOpen(menu);
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      if (!open && activeSelect === select) activeSelect = null;
    });
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (select.disabled) return;
      if (menuOpen(menu)) closeMenu(select, menu);
      else openMenu(select, trigger, menu);
    });
    trigger.addEventListener("keydown", (event) => {
      if (menuOpen(menu) && event.key === "Tab") closeMenu(select, menu);
      if (menuOpen(menu) && event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); closeMenu(select, menu, true); return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      if (!menuOpen(menu)) openMenu(select, trigger, menu);
      else focusOption(menu);
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
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeMenu(select, menu, true); }
      if (event.key === "Tab") closeMenu(select, menu, true);
    });
    select.addEventListener("invalid", (event) => {
      event.preventDefault();
      controls.get(select).validationFailed = true;
      sync(select);
      trigger.focus();
    });
    select.addEventListener("change", () => sync(select));
    select.addEventListener("input", () => sync(select));
    try {
      for (const property of ["value", "selectedIndex"]) {
        const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, property);
        if (!desc?.get || !desc?.set) continue;
        Object.defineProperty(select, property, {
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
    let optionsChanged = false;
    const scheduleFill = (records) => {
      optionsChanged ||= records.some((record) => record.type !== "attributes" || record.target !== select);
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (optionsChanged) fillMenu(select, menu);
        else sync(select);
        optionsChanged = false;
        if (menuOpen(menu)) placeMenu(trigger, menu);
      });
    };
    new MutationObserver(scheduleFill).observe(select, {
      childList: true, subtree: true, characterData: true, attributes: true,
    });
  };
  document.addEventListener("pointerdown", (event) => {
    if (!activeSelect) return;
    const { menu, trigger } = controls.get(activeSelect);
    if (!canPopover(menu) && !menu.contains(event.target) && !trigger.contains(event.target)) closeMenu(activeSelect, menu);
  });
  const reposition = (event) => {
    if (!activeSelect) return;
    const { trigger, menu } = controls.get(activeSelect);
    if (!trigger.isConnected) { closeMenu(activeSelect, menu); return; }
    if (event?.target instanceof Node && menu.contains(event.target)) return;
    placeMenu(trigger, menu);
  };
  document.addEventListener("scroll", reposition, true);
  addEventListener("resize", reposition);
  window.visualViewport?.addEventListener("resize", reposition);
  window.visualViewport?.addEventListener("scroll", reposition);
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
      requestAnimationFrame(() => {
        if (event.defaultPrevented) return;
        form.querySelectorAll?.("[data-mw-select-picker] select")?.forEach((select) => {
          controls.get(select).validationFailed = false;
          closeMenu(select, controls.get(select).menu);
          sync(select);
        });
      });
    }, true);
  };
  start();
  document.addEventListener("DOMContentLoaded", start);
  addEventListener("load", () => scan(document));
})();
`;
