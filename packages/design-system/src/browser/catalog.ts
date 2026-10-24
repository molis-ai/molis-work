/// <reference lib="dom" />
// The component board's own behaviour (`/__ui/catalog`): opening the overlay specimens, the motion and craft demos, the
// composition menus, and the small toggles that make a specimen feel real. Presentation only; nothing here is a product control.
type Craft = { land(element: Element): void; celebrate(element: Element): void };
const craft = () => (globalThis as typeof globalThis & { molisCraft?: Craft }).molisCraft;
const all = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) => [...scope.querySelectorAll<T>(selector)];
const one = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) => scope.querySelector<T>(selector);
const restart = (element: Element | null | undefined, className: string) => {
  element?.classList.remove(className); void (element as HTMLElement | null | undefined)?.offsetWidth; element?.classList.add(className);
};
const select = (items: Element[], chosen: Element) => items.forEach((item) => {
  item.classList.toggle("is-selected", item === chosen);
  if (item === chosen) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
});

document.addEventListener("click", (event) => {
  const origin = event.target as Element;
  const motion = origin.closest<HTMLElement>("[data-motion-demo], [data-motion-close], [data-motion-tab]");
  if (motion) {
    const kind = motion.dataset.motionDemo;
    if (motion.hasAttribute("data-motion-close")) motion.closest("dialog")?.close();
    if (motion.hasAttribute("data-motion-tab")) all("[data-motion-tab]", motion.parentElement!).forEach((tab) => tab.setAttribute("aria-selected", String(tab === motion)));
    if (kind === "dialog") one<HTMLDialogElement>("[data-motion-dialog]")?.showModal();
    if (kind === "sheet") one<HTMLDialogElement>("[data-motion-sheet]")?.showModal();
    if (kind === "arrive") restart(one("[data-motion-list]"), "is-arriving");
    if (kind === "switch") all("[data-motion-page]").forEach((page) => { page.hidden = !page.hidden; });
    if (kind === "toast") { const toast = one(".toast") || Object.assign(document.body.appendChild(document.createElement("div")), { className: "mw-toast toast" }); toast.textContent = "已保存"; toast.classList.add("is-visible"); setTimeout(() => toast.classList.remove("is-visible"), 1600); }
    return;
  }
  const demo = origin.closest<HTMLElement>("[data-craft-demo]");
  if (!demo) return;
  const target = one("[data-craft-demo-target]");
  const status = one("[data-craft-demo-status]");
  if (!target || !status) return;
  if (demo.dataset.craftDemo === "rise") restart(target, "is-rising");
  if (demo.dataset.craftDemo === "land") craft()?.land(target);
  if (demo.dataset.craftDemo === "celebrate") {
    const done = status.classList.toggle("goal-status--completed");
    status.classList.toggle("goal-status--in_progress", !done);
    status.querySelector("span")!.textContent = done ? "已完成" : "正在推进";
    if (done) craft()?.celebrate(target);
  }
});

// The index follows the section nearest the top of the board.
(() => {
  const scroller = one(".mw-catalog");
  const links = new Map(all("[data-catalog-index] a").map((link) => [link.getAttribute("href")!.slice(1), link]));
  if (!scroller || !links.size || !("IntersectionObserver" in window)) return;
  const mark = (id: string | undefined) => links.forEach((link, key) => {
    if (key === id) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (visible) mark(visible.target.id);
  }, { root: scroller, rootMargin: "0px 0px -72% 0px" });
  all(".mw-catalog__section[id]").forEach((section) => observer.observe(section));
  mark(links.keys().next().value);
})();

all("[data-catalog-open]").forEach((button) => {
  button.addEventListener("click", () => {
    const kind = button.getAttribute("data-catalog-open");
    one<HTMLDialogElement>("[data-catalog-demo='" + kind + "']")?.showModal();
  });
});
all("dialog[data-catalog-demo] [data-dialog-close]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog")?.close());
});
all("[data-catalog-choice-group]").forEach((group) => {
  group.addEventListener("click", (event) => {
    const chosen = (event.target as Element).closest(".mw-choice");
    if (!chosen) return;
    all(".mw-choice", group).forEach((item) => item.setAttribute("aria-pressed", String(item === chosen)));
  });
});
all("[data-compose-split]").forEach((split) => {
  split.addEventListener("click", (event) => {
    const row = (event.target as Element).closest("[data-compose-item]");
    if (!row) return;
    select(all("[data-compose-item]", split), row);
    const frame = one(".mw-compose__detail .mw-frame", split);
    const heading = frame?.querySelector("h2");
    const caption = frame?.querySelector(".mw-frame__heading p");
    if (heading) heading.textContent = row.getAttribute("data-compose-item");
    if (caption) caption.textContent = row.getAttribute("data-compose-caption");
    restart(frame, "is-rising");
  });
});
const closeMenus = (except: Element | null) => all("[data-compose-menu]").forEach((menu) => {
  if (menu === except) return;
  menu.hidden = true;
  menu.parentElement?.querySelector("[data-compose-menu-toggle]")?.setAttribute("aria-expanded", "false");
});
document.addEventListener("click", (event) => {
  const toggle = (event.target as Element).closest("[data-compose-menu-toggle]");
  if (toggle) {
    const menu = toggle.parentElement?.querySelector<HTMLElement>("[data-compose-menu]");
    if (!menu) return;
    const open = menu.hidden;
    closeMenus(menu);
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) menu.querySelector<HTMLElement>("[role=menuitem], button")?.focus();
    return;
  }
  if (!(event.target as Element).closest("[data-compose-menu]")) closeMenus(null);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const open = all("[data-compose-menu]").find((menu) => !menu.hidden);
  if (!open) return;
  event.preventDefault();
  closeMenus(null);
  open.parentElement?.querySelector<HTMLElement>("[data-compose-menu-toggle]")?.focus();
});
all(".mw-otp").forEach((root) => {
  const cells = all<HTMLInputElement>("input", root);
  cells.forEach((input, index) => {
    input.addEventListener("input", () => { if (input.value) cells[index + 1]?.focus(); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value) cells[index - 1]?.focus();
    });
  });
});
all(".mw-number").forEach((root) => {
  const input = one<HTMLInputElement>("input", root)!;
  all("[data-number-step]", root).forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.getAttribute("data-number-step"));
      const min = input.min === "" ? -Infinity : Number(input.min);
      const max = input.max === "" ? Infinity : Number(input.max);
      const next = Math.min(max, Math.max(min, Number(input.value || 0) + step));
      input.value = String(next);
    });
  });
});
all(".mw-calendar").forEach((root) => {
  if (root.closest(".mw-date-picker")) return;
  all("[data-calendar-step]", root).forEach((button) => {
    button.addEventListener("click", () => {
      const delta = Number(button.getAttribute("data-calendar-step"));
      let year = Number(root.getAttribute("data-calendar-year"));
      let month = Number(root.getAttribute("data-calendar-month")) + delta;
      if (month < 0) { year -= 1; month = 11; }
      if (month > 11) { year += 1; month = 0; }
      root.setAttribute("data-calendar-year", String(year));
      root.setAttribute("data-calendar-month", String(month));
      const title = root.querySelector("[data-calendar-title]");
      if (title) title.textContent = year + "年" + (month + 1) + "月";
    });
  });
});
all(".mw-date-picker").forEach((root) => {
  const popup = one(".mw-calendar", root);
  const input = one<HTMLInputElement>("[data-date-picker-input]", root);
  const open = () => popup?.classList.add("is-open");
  one("[data-date-picker-open]", root)?.addEventListener("click", open);
  input?.addEventListener("focus", open);
  if (popup) all(".mw-calendar__day", popup).forEach((day) => {
    day.addEventListener("click", () => {
      const cell = day.closest("td");
      if (input && cell) input.value = cell.getAttribute("data-date") || "";
      popup.classList.remove("is-open");
    });
  });
});
all(".mw-catalog [data-slot=toggle-group]").forEach((group) => {
  all(":scope > button", group).forEach((button) => {
    button.addEventListener("click", () => {
      all(":scope > button", group).forEach((item) => {
        const on = item === button;
        item.classList.toggle("is-current", on);
        item.setAttribute("aria-pressed", String(on));
      });
    });
  });
});
all(".mw-catalog .is-yield [data-slot=directory-row]").forEach((row) => {
  row.addEventListener("click", () => {
    const list = row.closest(".mw-dir");
    if (list) select(all("[data-slot=directory-row]", list), row);
  });
});
