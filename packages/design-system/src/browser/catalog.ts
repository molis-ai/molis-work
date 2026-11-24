/// <reference lib="dom" />
// The component board's own behaviour (`/__ui/catalog`): opening the overlay specimens, the motion and craft demos, the
// composition menus, and the small toggles that make a specimen feel real. Presentation only; nothing here is a product control.
import { wireCatalogKeepEdits } from "./catalog-keep-edits.js";
import { wireCatalogAppearance } from "./catalog-appearance.js";
import { wireCatalogPatterns } from "./catalog-patterns.js";
import { wireCatalogPresentation } from "./catalog-presentation.js";
import { wireCatalogSplit } from "./catalog-skill-packs.js";
import { wireCatalogCapabilityPacks } from "./catalog-capability-packs.js";
import { wireCatalogLanguage } from "./catalog-language.js";
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
    const done = status.classList.toggle("mw-object-status--completed");
    status.classList.toggle("mw-object-status--in_progress", !done);
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
  if (menu === except || menu.hasAttribute("data-menu-held")) return; // a held menu is a specimen of the open state: only its own button closes it
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
  const open = all("[data-compose-menu]").find((menu) => !menu.hidden && !menu.hasAttribute("data-menu-held"));
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
wireCatalogPatterns();
wireCatalogPresentation();
wireCatalogKeepEdits();
wireCatalogAppearance();
wireCatalogSplit();
wireCatalogCapabilityPacks();
wireCatalogLanguage();
wireCatalogOnDemandHelp();
wireCatalogPlatformFeedback();

function wireCatalogPlatformFeedback(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as Element;
    const insetToggle = target.closest<HTMLButtonElement>("[data-catalog-inset-toggle]");
    if (insetToggle) {
      const row = insetToggle.closest<HTMLElement>("[data-catalog-inset-row]");
      if (row) {
        const nextOpen = row.dataset.open !== "true";
        row.dataset.open = String(nextOpen);
        insetToggle.textContent = nextOpen ? "收起" : "展开";
      }
      return;
    }
    const busyBtn = target.closest<HTMLButtonElement>("[data-fb-busy]");
    if (busyBtn) {
      const fast = busyBtn.dataset.fbBusy === "fast";
      const status = one<HTMLElement>("[data-fb-busy-status]");
      const run = () => new Promise<void>((resolve) => {
        window.setTimeout(resolve, fast ? 120 : 950);
      });
      void (window.molisBusy ? window.molisBusy(busyBtn, run) : run()).then(() => {
        if (status) {
          status.textContent = fast ? "120ms 完成（零转圈闪烁）" : "950ms 完成（250ms 后仅锁定本按钮）";
        }
      });
      return;
    }
    const toastBtn = target.closest<HTMLButtonElement>("[data-fb-toast]");
    if (toastBtn) {
      const kind = toastBtn.dataset.fbToast;
      if (kind === "short") {
        window.molisToast?.("已保存更改", { tone: "success", duration: "short" });
      } else if (kind === "warning") {
        window.molisToast?.("连接较慢，正在后台重试", { tone: "warning", duration: "normal" });
      } else if (kind === "error") {
        window.molisToast?.("未能写入本地文件，请检查权限", { tone: "error", duration: "long" });
      } else if (kind === "undo") {
        window.molisToast?.("已归档 1 条记录", {
          tone: "default",
          undoLabel: "撤销",
          undo: () => window.molisToast?.("已恢复该记录", { tone: "success", duration: "short" }),
        });
      }
      return;
    }
    const ringNext = target.closest<HTMLButtonElement>("[data-fb-ring-next]");
    if (ringNext) {
      const ring = one<SVGElement>("[data-fb-ring-demo]");
      const label = one<HTMLElement>("[data-fb-ring-label]");
      const states = ["running", "waiting", "done", "failed"] as const;
      if (ring) {
        const cur = ring.dataset.mwState ?? "running";
        const idx = (states.indexOf(cur as (typeof states)[number]) + 1) % states.length;
        const next = states[idx]!;
        ring.dataset.mwState = next;
        if (label) {
          label.textContent = next;
        }
      }
      return;
    }
    const dangerBtn = target.closest<HTMLButtonElement>("[data-fb-confirm-danger]");
    if (dangerBtn) {
      one<HTMLDialogElement>("[data-fb-danger-dialog]")?.showModal();
    }
  });
  const autosaveBox = one<HTMLElement>("[data-fb-autosave-box]");
  const autosaveInput = one<HTMLInputElement>("[data-fb-autosave-input]");
  const autosaveFail = one<HTMLInputElement>("[data-fb-autosave-fail]");
  const autosaveStatus = one<HTMLElement>("[data-fb-autosave-status]");
  const autosaveRetry = one<HTMLButtonElement>("[data-fb-autosave-retry]");
  if (autosaveBox && autosaveInput && window.molisAutosave) {
    const controller = window.molisAutosave(
      autosaveBox,
      () => new Promise<void>((resolve, reject) => {
        window.setTimeout(() => {
          if (autosaveFail?.checked) {
            reject(new Error("保存失败"));
          } else {
            resolve();
          }
        }, 420);
      }),
      {
        statusEl: autosaveStatus,
        labels: { idle: "已同步", dirty: "有未保存修改", saving: "正在保存…", saved: "已保存", error: "保存失败" },
        onStateChange: (state) => {
          if (autosaveRetry) {
            autosaveRetry.hidden = state !== "error";
          }
        },
      },
    );
    autosaveInput.addEventListener("input", () => controller.markDirty());
    autosaveRetry?.addEventListener("click", () => {
      void controller.retry();
    });
  }
  const optOk = one<HTMLInputElement>("[data-fb-opt-ok]");
  optOk?.addEventListener("click", (event) => {
    event.preventDefault();
    void window.molisOptimisticToggle?.(optOk, () => new Promise<void>((resolve) => {
      window.setTimeout(resolve, 200);
    }));
  });
  const optFail = one<HTMLInputElement>("[data-fb-opt-fail]");
  optFail?.addEventListener("click", (event) => {
    event.preventDefault();
    void window.molisOptimisticToggle?.(
      optFail,
      () => new Promise<void>((_, reject) => {
        window.setTimeout(() => reject(new Error("网络断开，开关已自动回滚")), 220);
      }),
    );
  });
  window.molisEnhanceDateInputs?.(document);
}

function wireCatalogOnDemandHelp(): void {
  const host = document.querySelector<HTMLElement>("[data-help-specimen]");
  if (!host) return;
  let failMode = false;
  const sidePreview = host.querySelector<HTMLElement>("[data-help-specimen-side]");
  const failToggle = host.querySelector<HTMLButtonElement>("[data-help-specimen-fail]");
  const resetTip = host.querySelector<HTMLButtonElement>("[data-help-specimen-reset-tip]");
  failToggle?.addEventListener("click", () => {
    failMode = !failMode;
    failToggle.setAttribute("aria-pressed", String(failMode));
    if (failMode) {
      globalThis.molisOnDemandHelp?.register("specimen-page", () => {
        throw new Error("simulated");
      });
    } else {
      globalThis.molisOnDemandHelp?.unregister("specimen-page");
    }
  });
  document.addEventListener("molis:help-retry", (event) => {
    const detail = (event as CustomEvent<{ topic?: string }>).detail;
    if (detail?.topic !== "specimen-page") return;
    failMode = false;
    failToggle?.setAttribute("aria-pressed", "false");
    globalThis.molisOnDemandHelp?.unregister("specimen-page");
  });
  resetTip?.addEventListener("click", () => {
    try {
      localStorage.removeItem("molis-work:help-tip-skipped:catalog-help-demo");
    } catch {
      // Ignore storage restriction.
    }
    const tip = host.querySelector<HTMLElement>('[data-mw-help-tip="catalog-help-demo"]');
    if (tip) tip.hidden = false;
  });
  document.addEventListener("molis:side-open", (event) => {
    const detail = (event as CustomEvent<{
      tab?: string;
      target?: {
        context?: string;
        focusId?: string | null;
        sections?: Array<{ id: string; heading: string; body?: string; items?: string[]; collapsible?: boolean; summary?: string }>;
      };
    }>).detail;
    if (detail?.tab !== "help" || !sidePreview || !detail.target) return;
    const payload = detail.target;
    const body = sidePreview.querySelector<HTMLElement>("[data-help-specimen-side-body]");
    const ctx = sidePreview.querySelector<HTMLElement>("[data-help-specimen-side-ctx]");
    if (ctx) ctx.textContent = payload.context || "";
    if (body) {
      body.replaceChildren();
      const wrap = document.createElement("div");
      wrap.className = "mw-help-content";
      for (const section of payload.sections || []) {
        const sec = document.createElement("section");
        sec.className = `mw-help-section${payload.focusId && section.id === payload.focusId ? " is-highlighted" : ""}`;
        const h4 = document.createElement("h4");
        h4.className = "mw-help-section__heading";
        h4.textContent = section.heading;
        sec.append(h4);
        const fill = (parent: HTMLElement) => {
          if (section.body) {
            const p = document.createElement("p");
            p.className = "mw-help-section__body";
            p.textContent = section.body;
            parent.append(p);
          }
          if (Array.isArray(section.items) && section.items.length) {
            const ul = document.createElement("ul");
            ul.className = "mw-help-section__list";
            for (const item of section.items) {
              const li = document.createElement("li");
              li.textContent = item;
              ul.append(li);
            }
            parent.append(ul);
          }
        };
        if (section.collapsible) {
          const det = document.createElement("details");
          det.className = "mw-collapsible";
          det.dataset.slot = "collapsible";
          const sum = document.createElement("summary");
          sum.textContent = section.summary || section.heading;
          const inner = document.createElement("div");
          inner.className = "mw-collapsible__body";
          fill(inner);
          det.append(sum, inner);
          sec.append(det);
        } else {
          fill(sec);
        }
        wrap.append(sec);
      }
      body.append(wrap);
    }
    sidePreview.hidden = false;
  });
}

// Batch 37-1 check-summary popover toggle on the catalog board.
document.addEventListener("click", (event) => {
  const trigger = (event.target as Element).closest<HTMLButtonElement>("[data-check-summary-toggle]");
  if (trigger) {
    const id = trigger.getAttribute("data-check-summary-toggle");
    const pop = id ? document.getElementById(id) : null;
    if (!pop) return;
    const open = pop.hidden;
    all<HTMLElement>("[data-check-summary-popover]").forEach((node) => {
      if (node !== pop) {
        node.hidden = true;
        node.parentElement?.querySelector<HTMLElement>("[data-check-summary-toggle]")?.setAttribute("aria-expanded", "false");
      }
    });
    pop.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    return;
  }
  if (!(event.target as Element).closest("[data-check-summary-popover]")) {
    all<HTMLElement>("[data-check-summary-popover]").forEach((node) => {
      if (node.closest("[data-check-open-stage]")) return;
      node.hidden = true;
      node.parentElement?.querySelector<HTMLElement>("[data-check-summary-toggle]")?.setAttribute("aria-expanded", "false");
    });
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const openPop = all<HTMLElement>("[data-check-summary-popover]").find((node) => !node.hidden && !node.closest("[data-check-open-stage]"));
  if (!openPop) return;
  openPop.hidden = true;
  const trigger = openPop.parentElement?.querySelector<HTMLElement>("[data-check-summary-toggle]");
  trigger?.setAttribute("aria-expanded", "false");
  trigger?.focus();
});
