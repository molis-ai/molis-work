import type { Page } from "./page.js";

const sectionLabel = (section: HTMLElement): string => {
  const own = section.getAttribute("aria-label");
  if (own) return own;
  const by = section.getAttribute("aria-labelledby"), named = by ? document.getElementById(by) : null;
  return (named || section.querySelector(":scope > h3, :scope > header h3, :scope > details > summary"))?.textContent?.trim() || "";
};

/** The sections of the results panel the person can jump to: those on show, when the panel is open and the companion is not. */
function sectionsOnShow(page: Page, nav: HTMLElement, tools: HTMLElement): HTMLElement[] {
  if (page.root.dataset.codingResults !== "true" || tools.dataset.companionOpen === "true") return [];
  return [...tools.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== nav && !node.classList.contains("coding-tool-tabs") && !node.hidden && Boolean(sectionLabel(node)) && getComputedStyle(node).display !== "none");
}

/** The results panel's index: one chip per section on show, to jump to it. It is rebuilt only when the set of sections changes. */
function resultsIndex(page: Page) {
  const { L, q } = page, { s } = page;
  const nav = q("[data-coding-results-index]"), tools = q("[data-coding-tools]");
  const sections = sectionsOnShow(page, nav, tools), signature = sections.map(sectionLabel).join("|");
  if (signature === s.indexSignature) return;
  s.indexSignature = signature;
  s.indexed = sections;
  nav.replaceChildren();
  sections.forEach((section, at) => {
    const chip = document.createElement("button"), text = sectionLabel(section);
    chip.type = "button";
    chip.className = "mw-btn mw-btn--ghost";
    chip.textContent = s.SECTION_SHORT[text] || text;
    chip.title = L("coding.results.jump", { section: text });
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
  const { L, lifetime, q, root } = page, { s } = page;
  s.SECTION_SHORT = {
    [L("coding.results.cooperation")]: L("coding.short.cooperation"), [L("coding.checkpoints.title")]: L("coding.short.checkpoints"), [L("coding.results.recovery")]: L("coding.short.recovery"),
    [L("coding.results.facts")]: L("coding.short.facts"), [L("coding.outcomes.title")]: L("coding.short.outcomes"), [L("coding.change.title")]: L("coding.short.change"),
    [L("coding.commands.title")]: L("coding.short.commands"), [L("coding.results.background")]: L("coding.short.background"),
  };
  lifetime.listen(q("[data-coding-results-index]"), "click", event => {
    const chip = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-coding-results-jump]") : null, tools = q("[data-coding-tools]");
    const section = chip && s.indexed[Number(chip.dataset.codingResultsJump)];
    if (!section) return;
    tools.scrollTo({ top: section.getBoundingClientRect().top - tools.getBoundingClientRect().top + tools.scrollTop - 8, behavior: "smooth" });
    section.tabIndex = -1;
    section.focus({ preventScroll: true });
  });
  lifetime.observe(new MutationObserver(() => scheduleResultsIndex(page)), q("[data-coding-tools]"), { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-companion-open"] });
  lifetime.observe(new MutationObserver(() => resultVisibility(page)), root, { attributes: true, attributeFilter: ["data-coding-results"] });
  resultVisibility(page);
}
