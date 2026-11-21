import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SidePanelPrimitives } from "./side-panel.js";

/**
 * Right-side reading view for Scheme A on-demand help ("在右栏继续看", Batch 03 / Batch 40 VUX-55).
 * Hidden until requested via `molis:side-open { tab: "help", target }`. Accepts only bounded plain-text
 * structured sections (zero raw HTML from iframes) and renders exclusively via DOM `textContent`.
 */
export function renderSideHelp(primitives: SidePanelPrimitives): string {
  const { icon } = primitives;
  return `<div class="mw-help-side" data-side-help tabindex="-1" role="region" aria-label="${uiText("workbench.side-panel-tab.help")}">
    <div class="mw-help-side__head">
      ${icon("question")}
      <strong class="mw-help-side__title" data-side-help-title>${uiText("workbench.side-panel-tab.help")}</strong>
      <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm mw-btn--icon-only" data-slot="button" data-side-help-close aria-label="${uiText("common.help.close")}">${icon("x")}</button>
    </div>
    <div class="mw-help-side__ctx" data-side-help-ctx hidden></div>
    <div class="mw-help-side__body" data-side-help-body></div>
  </div>`;
}

export const SIDE_HELP_SCRIPT = String.raw`(() => {
  const root = document.querySelector("[data-side-help]");
  if (!root) return;
  const titleEl = root.querySelector("[data-side-help-title]");
  const ctxEl = root.querySelector("[data-side-help-ctx]");
  const bodyEl = root.querySelector("[data-side-help-body]");
  const closeBtn = root.querySelector("[data-side-help-close]");
  const helpTab = () => document.querySelector('[data-side-tab="help"]');
  let openedSideForHelp = false;
  let previousTab = null;

  const str = (v, max) => typeof v === "string" ? v.slice(0, max) : "";
  const mk = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  function paint(target) {
    if (!target || typeof target !== "object") return;
    const baseTitle = globalThis.t?.text("workbench.side-panel-tab.help") || "帮助";
    const topicTitle = str(target.title, 160);
    if (titleEl) titleEl.textContent = topicTitle ? baseTitle + " · " + topicTitle : baseTitle;
    const ctx = str(target.context, 240);
    if (ctxEl) { ctxEl.textContent = ctx; ctxEl.hidden = !ctx; }
    if (!bodyEl) return;
    bodyEl.replaceChildren();
    const wrap = mk("div", "mw-help-content");
    wrap.dataset.slot = "help-content";
    const sections = Array.isArray(target.sections) ? target.sections.slice(0, 12) : [];
    const focusId = str(target.focusId, 64);
    for (const raw of sections) {
      if (!raw || typeof raw !== "object") continue;
      const id = str(raw.id, 64);
      const sec = mk("section", "mw-help-section" + (focusId && id === focusId ? " is-highlighted" : ""));
      if (id) sec.dataset.helpSection = id;
      sec.append(mk("h4", "mw-help-section__heading", str(raw.heading, 160)));
      const fill = (parent) => {
        const body = str(raw.body, 2000);
        if (body) parent.append(mk("p", "mw-help-section__body", body));
        const items = Array.isArray(raw.items) ? raw.items.slice(0, 12).map((item) => str(item, 600)).filter(Boolean) : [];
        if (items.length) {
          const ul = mk("ul", "mw-help-section__list");
          for (const item of items) ul.append(mk("li", "", item));
          parent.append(ul);
        }
      };
      if (raw.collapsible === true) {
        const det = mk("details", "mw-collapsible"); det.dataset.slot = "collapsible";
        det.append(mk("summary", "", str(raw.summary, 160) || str(raw.heading, 160)));
        const box = mk("div", "mw-collapsible__body");
        fill(box);
        det.append(box);
        sec.append(det);
      } else {
        fill(sec);
      }
      wrap.append(sec);
    }
    bodyEl.append(wrap);
    if (focusId) {
      const targetSec = bodyEl.querySelector('[data-help-section="' + CSS.escape(focusId) + '"]');
      targetSec?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }

  function closeHelpSide() {
    const tab = helpTab();
    if (tab) tab.hidden = true;
    if (openedSideForHelp) {
      openedSideForHelp = false;
      previousTab = null;
      document.dispatchEvent(new CustomEvent("molis:side-open", { detail: { tab: "help", close: true } }));
    } else if (previousTab) {
      const back = previousTab;
      previousTab = null;
      document.dispatchEvent(new CustomEvent("molis:side-open", { detail: { tab: back, focus: false } }));
    } else {
      document.dispatchEvent(new CustomEvent("molis:side-open", { detail: { tab: "help", close: true } }));
    }
  }

  document.addEventListener("molis:side-open", (event) => {
    const detail = event.detail;
    if (!detail || detail.tab !== "help" || detail.close === true) return;
    const wasOpen = document.body.dataset.sideOpen === "true";
    if (!wasOpen) {
      openedSideForHelp = true;
      previousTab = null;
    } else {
      const active = document.querySelector('[data-side-tab][aria-selected="true"]');
      if (active && active.dataset.sideTab !== "help") previousTab = active.dataset.sideTab;
    }
    const tab = helpTab();
    if (tab) tab.hidden = false;
  }, true);

  document.addEventListener("molis:side-shown", (event) => {
    const detail = event.detail;
    if (!detail) return;
    if (detail.open && detail.tab === "help") {
      if (detail.target) paint(detail.target);
      root.focus({ preventScroll: true });
    } else if (!detail.open) {
      const tab = helpTab();
      if (tab) tab.hidden = true;
      openedSideForHelp = false;
      previousTab = null;
    }
  });

  closeBtn?.addEventListener("click", (event) => { event.stopPropagation(); closeHelpSide(); });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeHelpSide(); }
  });
})();`.replace(/^[ \t]*\/\/.*\n/gm, "");
