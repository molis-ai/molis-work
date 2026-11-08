/// <reference lib="dom" />
// The board's keep-edits specimens (`primitives/catalog-keep-edits.ts`) made to feel real: putting back and swapping back in the
// same slot with the focus staying on the button, the fold that appears only when the text is really cut, the dot that goes once
// you reach its step, the alert's hop and the moments played again. Presentation only; nothing here is a product control.

type KeptLabels = { yours: string; latest: string; put: string; back: string; putName: string; backName: string };

/** Starts a class's animation again, from the beginning. */
function replay(element: Element, name: string): void {
  element.classList.remove(name);
  void (element as HTMLElement).offsetWidth;
  element.classList.add(name);
}

function wash(box: Element): void {
  box.setAttribute("data-craft-new", "field");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) box.removeAttribute("data-craft-new");
}

function swapKept(kept: HTMLElement, button: HTMLElement): void {
  const labels = JSON.parse(kept.dataset.keepLabels ?? "{}") as KeptLabels;
  const pair = kept.closest("[data-keep-pair]");
  const field = pair?.querySelector<HTMLTextAreaElement>("[data-keep-field]");
  const text = kept.querySelector<HTMLElement>(".mw-kept__text");
  if (!field || !text) return;
  const swapped = kept.classList.toggle("is-swapped");
  [field.value, text.textContent] = [text.textContent ?? "", field.value];
  kept.querySelector(".mw-kept__who")!.textContent = swapped ? labels.latest : labels.yours;
  button.querySelector("[data-slot=button-label]")!.textContent = swapped ? labels.back : labels.put;
  button.setAttribute("aria-label", swapped ? labels.backName : labels.putName);
  fitFolds();
  const box = pair?.querySelector("[data-keep-box]");
  if (box) wash(box);
}

/** The way to the rest appears only when the text is really cut, which depends on the width as much as on its length. */
function fitFolds(): void {
  document.querySelectorAll<HTMLElement>(".mw-catalog .mw-kept__more").forEach((more) => {
    const text = more.parentElement?.querySelector<HTMLElement>(".mw-kept__text");
    if (text) more.hidden = !text.classList.contains("is-open") && text.scrollHeight <= text.clientHeight + 1;
  });
}

function foldKept(more: HTMLElement): void {
  const open = more.parentElement?.querySelector(".mw-kept__text")?.classList.toggle("is-open") ?? false;
  more.setAttribute("aria-expanded", String(open));
  more.querySelector("[data-slot=button-label]")!.textContent = (open ? more.dataset.keepClose : more.dataset.keepOpen) ?? "";
  fitFolds();
  // Folding a text that fits takes the way to the rest away, and the focus was on it: it moves to the row's other button.
  if (more.hidden) more.closest(".mw-kept")?.querySelector<HTMLElement>("[data-keep-swap]")?.focus();
}

function moveStep(button: HTMLElement): void {
  button.closest("[data-keep-steps]")?.querySelectorAll("button").forEach((step) => {
    if (step === button) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });
}

function nudge(press: HTMLElement): void {
  const alert = press.closest(".mw-catalog__specimen")?.querySelector<HTMLElement>("[data-keep-nudge] .mw-alert");
  if (!alert) return;
  replay(alert, "is-nudged");
  alert.querySelector<HTMLElement>(".mw-btn--primary")?.focus();
}

/** Called once by the board script, after the board is on the page. */
export function wireCatalogKeepEdits(): void {
  const board = document.querySelector<HTMLElement>(".mw-catalog");
  if (!board) return;
  board.addEventListener("click", (event) => {
    const origin = event.target as Element;
    const swap = origin.closest<HTMLElement>("[data-keep-swap]");
    if (swap) { const kept = swap.closest<HTMLElement>(".mw-kept"); if (kept) swapKept(kept, swap); return; }
    const more = origin.closest<HTMLElement>("[data-keep-more]");
    if (more) { foldKept(more); return; }
    const step = origin.closest<HTMLElement>("[data-keep-steps] button");
    if (step) { moveStep(step); return; }
    const press = origin.closest<HTMLElement>("[data-keep-press]");
    if (press) { nudge(press); return; }
    const specimen = origin.closest(".mw-catalog__specimen");
    if (origin.closest("[data-keep-replay-rise]")) {
      const alert = specimen?.querySelector("[data-keep-rise] .mw-alert");
      if (alert) { replay(alert, "mw-alert--rise"); }
    } else if (origin.closest("[data-keep-replay-group]")) {
      specimen?.querySelectorAll("[data-keep-group] .mw-kept").forEach((kept) => replay(kept, "mw-kept--rise"));
    } else if (origin.closest("[data-keep-replay-wash]")) {
      const box = specimen?.querySelector("[data-keep-wash]");
      if (box) { box.removeAttribute("data-craft-new"); void (box as HTMLElement).offsetWidth; wash(box); }
    }
  });
  // The wash has played; the attribute comes off so the next one starts clean.
  board.addEventListener("animationend", (event) => {
    if (event.pseudoElement === "::after" && (event.target as Element).getAttribute("data-craft-new") === "field") (event.target as Element).removeAttribute("data-craft-new");
  });
  fitFolds();
  addEventListener("resize", fitFolds);
}
