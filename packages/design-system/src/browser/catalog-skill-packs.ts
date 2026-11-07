/// <reference lib="dom" />
// The board's list-and-detail specimen (`primitives/catalog-skill-packs.ts`) made to feel real: choosing an entry shows its
// detail, which rises in only when the choice changed (never on the first view or a reload); where the room is narrow the list
// gives way to the detail, the focus moves to the detail's title, and 全部技能 goes back to the entry it came from.
// Presentation only; nothing here is a product control.

/** Called once by the board script, after the board is on the page. */
export function wireCatalogSplit(): void {
  document.querySelectorAll<HTMLElement>(".mw-catalog [data-list-detail]").forEach((root) => {
    const picks = () => [...root.querySelectorAll<HTMLButtonElement>("[data-list-pick]")];
    const details = () => [...root.querySelectorAll<HTMLElement>("[data-list-panel]")];
    const list = root.querySelector<HTMLElement>(".mw-list-detail__list");
    root.addEventListener("click", (event) => {
      const origin = event.target as Element;
      if (origin.closest("[data-list-back]")) {
        root.removeAttribute("data-detail");
        picks().find((button) => button.getAttribute("aria-current") === "true")?.focus();
        return;
      }
      const chosen = origin.closest<HTMLButtonElement>("[data-list-pick]");
      if (!chosen) return;
      const key = chosen.dataset.listPick;
      const changed = chosen.getAttribute("aria-current") !== "true";
      picks().forEach((button) => {
        if (button === chosen) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
      details().forEach((detail) => {
        const shown = detail.dataset.listPanel === key;
        detail.hidden = !shown;
        detail.classList.remove("is-entering");
        if (shown && changed) { void detail.offsetWidth; detail.classList.add("is-entering"); }
      });
      root.setAttribute("data-detail", "");
      // One side at a time: the list has gone, so the focus follows to where the person is now reading.
      if (list && getComputedStyle(list).display === "none") details().find((detail) => !detail.hidden)?.querySelector<HTMLElement>("h3")?.focus();
    });
    root.addEventListener("animationend", (event) => {
      if ((event.target as Element).matches("[data-list-panel]")) (event.target as Element).classList.remove("is-entering");
    });
  });
}
