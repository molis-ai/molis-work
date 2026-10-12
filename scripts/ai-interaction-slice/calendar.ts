/**
 * The date fields' popover over the design system's own calendar (two months rendered by the server). It writes the
 * chosen day into the field as if typed, so the one input handler keeps the draft; Escape and a click outside close it
 * and focus returns to the button that opened it.
 */
export function mountCalendars(root: HTMLElement, onPick: (input: HTMLInputElement) => void): { close: () => void } {
  let open: { popup: HTMLElement; trigger: HTMLButtonElement; input: HTMLInputElement } | null = null;
  const pages = (popup: HTMLElement) => [...popup.querySelectorAll<HTMLElement>("[data-calendar-page]")];
  function page(popup: HTMLElement, index: number): void {
    pages(popup).forEach((calendar, at) => {
      calendar.hidden = at !== index;
      calendar.querySelector<HTMLButtonElement>('[data-calendar-step="-1"]')!.disabled = at === 0;
      calendar.querySelector<HTMLButtonElement>('[data-calendar-step="1"]')!.disabled = at === pages(popup).length - 1;
    });
  }
  function mark(popup: HTMLElement, value: string): void {
    popup.querySelectorAll<HTMLElement>("td[data-date]").forEach(cell => {
      const day = cell.querySelector<HTMLButtonElement>(".mw-calendar__day")!;
      const [, month, date] = (cell.dataset.date ?? "").split("-");
      day.setAttribute("aria-label", `${Number(month)}月${Number(date)}日`);
      day.setAttribute("aria-pressed", String(cell.dataset.date === value));
      cell.classList.toggle("is-selected", cell.dataset.date === value);
    });
  }
  function close(returnFocus = false): void {
    if (!open) return;
    open.popup.hidden = true;
    open.trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) open.trigger.focus();
    open = null;
  }
  function show(trigger: HTMLButtonElement): void {
    const field = trigger.closest<HTMLElement>("[data-date-field]")!;
    const popup = field.querySelector<HTMLElement>("[data-calendar]")!;
    const input = field.querySelector<HTMLInputElement>("input")!;
    close();
    mark(popup, input.value);
    const at = pages(popup).findIndex(calendar => calendar.querySelector(`td[data-date="${input.value}"]`));
    page(popup, Math.max(0, at));
    popup.hidden = false;
    const scroller = field.closest<HTMLElement>("[data-thread]");
    const below = scroller ? scroller.getBoundingClientRect().bottom - field.getBoundingClientRect().bottom : Infinity;
    popup.dataset.place = below < popup.offsetHeight + 12 && field.getBoundingClientRect().top - (scroller?.getBoundingClientRect().top ?? 0) > popup.offsetHeight ? "top" : "bottom";
    trigger.setAttribute("aria-expanded", "true");
    open = { popup, trigger, input };
    (popup.querySelector<HTMLButtonElement>(".mw-calendar__day[aria-pressed=true]") ?? popup.querySelector<HTMLButtonElement>("[aria-current=date] .mw-calendar__day"))?.focus();
  }
  root.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest<HTMLButtonElement>("[data-calendar-open]");
    if (trigger) {
      if (open?.trigger === trigger) close(true); else show(trigger);
      return;
    }
    if (!open) return;
    const step = target?.closest<HTMLButtonElement>("[data-calendar-step]");
    if (step && open.popup.contains(step)) {
      const current = pages(open.popup).findIndex(calendar => !calendar.hidden);
      page(open.popup, current + Number(step.dataset.calendarStep));
      pages(open.popup)[current + Number(step.dataset.calendarStep)]?.querySelector<HTMLButtonElement>(".mw-calendar__day")?.focus();
      return;
    }
    const day = target?.closest<HTMLElement>("td[data-date]");
    if (day && open.popup.contains(day)) {
      const { input } = open;
      input.value = day.dataset.date ?? "";
      close(true);
      onPick(input);
      return;
    }
    if (!open.popup.contains(target)) close();
  });
  const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  root.addEventListener("keydown", event => {
    if (!open) return;
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    const step = moves[event.key];
    const day = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>(".mw-calendar__day") : null;
    if (step === undefined || !day || !open.popup.contains(day)) return;
    event.preventDefault();
    const days = [...open.popup.querySelectorAll<HTMLButtonElement>("[data-calendar-page]:not([hidden]) .mw-calendar__day")];
    days[Math.min(days.length - 1, Math.max(0, days.indexOf(day) + step))]?.focus();
  });
  root.addEventListener("focusout", event => {
    const next = (event as FocusEvent).relatedTarget;
    if (open && next instanceof Node && !open.popup.closest("[data-date-field]")!.contains(next)) close();
  });
  return { close: () => close() };
}
