import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Page } from "./page.js";

const sectionLabel = (section: HTMLElement): string => {
  const own = section.getAttribute("aria-label");
  if (own) return own;
  const by = section.getAttribute("aria-labelledby"), named = by ? document.getElementById(by) : null;
  return (named || section.querySelector(":scope > h3, :scope > header h3, :scope > details > summary"))?.textContent?.trim() || "";
};

/** The sections of the results panel the person can jump to: those on show, when the panel is open and the companion is not. */
function sectionsOnShow(page: Page, nav: HTMLElement, tools: HTMLElement): HTMLElement[] {
  const { codingResults, companionOpen } = page.root.dataset;
  if (codingResults !== "true" || companionOpen === "true") return [];
  return [...tools.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== nav && !node.classList.contains("coding-tool-tabs") && !node.hidden && Boolean(sectionLabel(node)) && getComputedStyle(node).display !== "none");
}

/**
 * The results panel's index: one segment per section on show, to jump to it (the design system's segmented control,
 * screen-polish §6.5). It is rebuilt only when the set of sections changes; the segment last jumped to stays pressed.
 */
function resultsIndex(page: Page) {
  const { q } = page, { s } = page;
  const nav = q("[data-coding-results-index]"), tools = q("[data-coding-tools]");
  const sections = sectionsOnShow(page, nav, tools), signature = sections.map(sectionLabel).join("|");
  if (signature === s.indexSignature) return;
  s.indexSignature = signature;
  s.indexed = sections;
  nav.replaceChildren();
  sections.forEach((section, at) => {
    const chip = document.createElement("button"), text = sectionLabel(section);
    chip.type = "button";
    chip.className = at === 0 ? "mw-toggle is-current" : "mw-toggle";
    chip.setAttribute("aria-pressed", String(at === 0));
    chip.textContent = s.SECTION_SHORT[text] || text;
    chip.title = uiText.text("coding.results.jump", { section: text });
    chip.dataset.codingResultsJump = String(at);
    nav.append(chip);
  });
  nav.hidden = sections.length < 2;
}

/** Writes to the index are scheduled, so they never loop back through the observer that schedules them. */
function scheduleResultsIndex(page: Page) {
  const { lifetime } = page, { s } = page;
  lifetime.clearTimeout(s.indexTimer);
  s.indexTimer = lifetime.timeout(() => resultsIndex(page), 80);
}

function resultVisibility(page: Page) {
  page.q("[data-coding-results-open]").setAttribute("aria-expanded", String(page.root.dataset.codingResults === "true"));
  scheduleResultsIndex(page);
}

/** Wires the results panel's index and its open mark. */
export function mountResultsIndex(page: Page) {
  const { lifetime, q, root } = page, { s } = page;
  s.SECTION_SHORT = {
    [uiText.text("coding.results.cooperation")]: uiText.text("coding.short.cooperation"), [uiText.text("coding.checkpoints.title")]: uiText.text("coding.short.checkpoints"), [uiText.text("coding.results.recovery")]: uiText.text("coding.short.recovery"),
    [uiText.text("coding.outcomes.title")]: uiText.text("coding.short.outcomes"), [uiText.text("coding.change.title")]: uiText.text("coding.short.change"),
    [uiText.text("coding.commands.title")]: uiText.text("coding.short.commands"), [uiText.text("coding.results.background")]: uiText.text("coding.short.background"),
  };
  lifetime.listen(q("[data-coding-results-index]"), "click", event => {
    const chip = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-coding-results-jump]") : null, tools = q("[data-coding-tools]");
    const section = chip && s.indexed[Number(chip.dataset.codingResultsJump)];
    if (!section) return;
    for (const other of q("[data-coding-results-index]").querySelectorAll("[data-coding-results-jump]")) {
      other.classList.toggle("is-current", other === chip);
      other.setAttribute("aria-pressed", String(other === chip));
    }
    tools.scrollTo({ top: section.getBoundingClientRect().top - tools.getBoundingClientRect().top + tools.scrollTop - 8, behavior: "smooth" });
    section.tabIndex = -1;
    section.focus({ preventScroll: true });
  });
  lifetime.observe(new MutationObserver(() => scheduleResultsIndex(page)), q("[data-coding-tools]"), { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  lifetime.observe(new MutationObserver(() => resultVisibility(page)), root, { attributes: true, attributeFilter: ["data-coding-results", "data-companion-open"] });
  resultVisibility(page);
}
