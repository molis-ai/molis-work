// The board binds only its own controls. The one rendered peek moves to the chosen container.
export function wireCatalogPresentation(): void {
  const board = document.querySelector<HTMLElement>(".mw-presentation-board");
  if (!board) return;
  const trigger = board.querySelector<HTMLButtonElement>("[data-presentation-peek]");
  const popover = board.querySelector<HTMLElement>("#presentation-popover");
  const sheet = board.querySelector<HTMLDialogElement>("#presentation-sheet");
  const card = board.querySelector<HTMLElement>("[data-presentation-card]");
  const content = board.querySelector<HTMLTemplateElement>("[data-presentation-peek-template]")?.content.firstElementChild;
  if (!trigger || !popover || !sheet || !card || !(content instanceof HTMLElement)) return;
  const narrow = matchMedia("(max-width: 650px), (pointer: coarse)");
  const opened = () => popover.matches(":popover-open") || sheet.open;
  let anchor: HTMLElement | null = null;
  let returning = false;
  let hover: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (opened()) return;
    anchor?.classList.remove("mw-presentation-board__anchor");
    anchor = null;
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-controls");
  };
  const close = (focus: boolean) => {
    clearTimeout(hover);
    const previous = anchor;
    returning = true;
    if (sheet.open) sheet.close();
    if (popover.matches(":popover-open")) popover.hidePopover();
    clear();
    if (focus) previous?.focus({ preventScroll: true });
    returning = false;
  };
  const open = (from: HTMLElement, focus: boolean) => {
    const layer = narrow.matches ? sheet : popover;
    if (!opened()) {
      const mount = layer.querySelector("[data-presentation-peek-body]");
      if (!mount) return;
      clear();
      anchor = from;
      anchor.classList.add("mw-presentation-board__anchor");
      mount.append(content);
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("aria-controls", layer.id);
      if (narrow.matches) sheet.showModal();
      else popover.showPopover();
    }
    if (focus) content.querySelector<HTMLElement>("[data-presentation-action]")?.focus();
  };
  trigger.addEventListener("focus", () => { if (!returning && !narrow.matches) open(trigger, false); });
  trigger.addEventListener("pointerenter", event => {
    if (event.pointerType === "mouse" && !narrow.matches) hover = setTimeout(() => open(trigger, false), 250);
  });
  trigger.addEventListener("pointerleave", () => clearTimeout(hover));
  trigger.addEventListener("click", () => open(trigger, true));
  popover.addEventListener("toggle", clear);
  sheet.addEventListener("cancel", event => { event.preventDefault(); close(true); });
  narrow.addEventListener("change", () => close(false));
  board.addEventListener("click", event => {
    const control = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-presentation-action], [data-dialog-close]") : null;
    if (!control) return;
    const key = control.dataset.presentationAction;
    if (key === "review-message" || key === "review-retry") open(control, true);
    if (key === "close-peek" || control.hasAttribute("data-dialog-close")) {
      event.preventDefault();
      close(true);
    }
    if (key === "show-card") {
      close(false);
      card.focus();
    }
  });
  board.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.isComposing || event.defaultPrevented || !opened()) return;
    if (event.target instanceof Element && event.target.closest("details[open]")) return;
    event.preventDefault();
    close(true);
  });
}
