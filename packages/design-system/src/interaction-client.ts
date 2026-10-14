/// <reference lib="dom" />

/** What a questionnaire holds, read from its controls by their `data-ix-*` hooks. */
export interface InteractionValues {
  /** `choice`: the picked option values; `other` is the free "other" text if the field has that slot. */
  [fieldId: string]: string | string[] | { picked: string[]; other?: string } | { date: string; time: string };
}
export interface InteractionClientHost {
  /** The person changed something. A composition (Chinese input) reports once, when it ends. */
  onChange?(change: { field: string; part?: string; value: string | string[] | { picked: string[]; other?: string } | { date: string; time: string } }): void;
  /** A `data-ix-action` button was pressed. */
  onAction?(id: string, button: HTMLButtonElement): void;
  /** The form was submitted: its submit button, or ⌘/Ctrl+Enter. Never plain Enter in a single-line field. */
  onSubmit?(): void;
  /** The "next step" button beside a composer was pressed. */
  onStep?(index: number, button: HTMLButtonElement): void;
}
export interface InteractionClient {
  /** True while a composition is in progress inside the card. */
  readonly composing: boolean;
  /** Every field's current value. */
  read(): InteractionValues;
  /** Write values the person is not editing: a focused control, and one in the middle of a composition, are left alone. */
  write(values: InteractionValues): void;
  /** Show per-field errors (`{ fieldId: text }`); every other field's error clears. Focuses the first when asked. */
  showErrors(errors: Record<string, string>, options?: { focus?: boolean }): void;
  focusField(fieldId: string): void;
  destroy(): void;
}

/* The client is three self-contained functions (no imports, no module state), so a plugin's browser factory can embed
 * them as strings (INTERACTION_CLIENT_SCRIPT) the way the other design-system clients are; each stays under the
 * function-size gate. `createInteractionClient` is the one a TypeScript consumer calls. */

/** Reading and writing the controls of every field by their `data-ix-*` hooks. Writes never take a field from the person typing in it. */
export function interactionFields(root: HTMLElement) {
  const q = <T extends Element = HTMLElement>(scope: ParentNode, selector: string) => scope.querySelector<T>(selector);
  const all = <T extends Element = HTMLElement>(scope: ParentNode, selector: string) => [...scope.querySelectorAll<T>(selector)];
  const fieldOf = (node: Element | null) => node?.closest<HTMLElement>("[data-ix-field]") ?? null;
  const fieldId = (field: HTMLElement) => field.dataset.ixField ?? "";
  const checked = (button: HTMLElement) => button.getAttribute("aria-checked") === "true" || button.getAttribute("aria-pressed") === "true";
  const mark = (button: HTMLElement, on: boolean) => button.setAttribute(button.hasAttribute("aria-checked") ? "aria-checked" : "aria-pressed", String(on));
  const optionsOf = (field: HTMLElement) => all<HTMLButtonElement>(field, "[data-ix-option]");
  /** Radios keep one tab stop: the checked one, or the first when none is checked. */
  const roving = (group: HTMLElement) => {
    if (group.getAttribute("role") !== "radiogroup") return;
    const radios = all<HTMLButtonElement>(group, "[role=radio]").filter(radio => !radio.disabled);
    const current = radios.find(checked) ?? radios[0];
    for (const radio of radios) radio.tabIndex = radio === current ? 0 : -1;
  };
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const refreshWeekday = (dateField: HTMLElement | null) => {
    const input = dateField && q<HTMLInputElement>(dateField, "input"), label = dateField && q(dateField, "[data-ix-weekday]");
    if (!input || !label) return;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? new Date(`${input.value}T12:00:00Z`) : null;
    label.textContent = day && !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === input.value ? weekdays[day.getUTCDay()]! : "";
  };
  const read = (): InteractionValues => {
    const values: InteractionValues = {};
    for (const field of all(root, "[data-ix-field]")) {
      const id = fieldId(field), options = optionsOf(field);
      if (options.length || q(field, "[data-ix-options]")) {
        const other = q<HTMLInputElement>(field, "[data-ix-other]"), picked = options.filter(checked).map(option => option.dataset.ixOption ?? "");
        values[id] = other ? { picked, other: other.value } : picked;
      } else if (q(field, "[data-ix-references]")) values[id] = all(field, "[data-ix-reference]").filter(checked).map(ref => ref.dataset.ixReference ?? "");
      else if (q(field, '[data-ix-part="time"]')) values[id] = { date: q<HTMLInputElement>(field, '[data-ix-part="date"]')?.value ?? "", time: q<HTMLInputElement>(field, '[data-ix-part="time"]')?.value ?? "" };
      else values[id] = q<HTMLInputElement>(field, "[data-ix-value]")?.value ?? "";
    }
    return values;
  };
  const write = (values: InteractionValues, composing: boolean) => {
    const active = document.activeElement;
    for (const field of all(root, "[data-ix-field]")) {
      const value = values[fieldId(field)];
      if (value === undefined) continue;
      const put = (input: HTMLInputElement | HTMLTextAreaElement | null, text: string) => {
        if (input && input !== active && !(composing && field.contains(active)) && input.value !== text) input.value = text;
      };
      if (typeof value === "string") { put(q<HTMLInputElement>(field, "[data-ix-value]"), value); refreshWeekday(q(field, "[data-ix-date]")); }
      else if (Array.isArray(value)) {
        const refs = all(field, "[data-ix-reference]");
        for (const item of refs.length ? refs : optionsOf(field)) mark(item, value.includes(item.dataset.ixReference ?? item.dataset.ixOption ?? ""));
        const group = q(field, "[data-ix-options]");
        if (group) roving(group);
      } else if ("picked" in value) {
        for (const option of optionsOf(field)) mark(option, value.picked.includes(option.dataset.ixOption ?? ""));
        if (value.other !== undefined) put(q<HTMLInputElement>(field, "[data-ix-other]"), value.other);
        const group = q(field, "[data-ix-options]");
        if (group) roving(group);
      } else {
        put(q<HTMLInputElement>(field, '[data-ix-part="date"]'), value.date);
        put(q<HTMLInputElement>(field, '[data-ix-part="time"]'), value.time);
        refreshWeekday(q(field, "[data-ix-date]"));
      }
    }
  };
  const showErrors = (errors: Record<string, string>, options: { focus?: boolean } = {}) => {
    let first: HTMLElement | null = null;
    for (const field of all(root, "[data-ix-field]")) {
      const message = errors[fieldId(field)] ?? "", slot = q(field, "[data-ix-error]");
      if (slot) { if (slot.textContent !== message) slot.textContent = message; slot.hidden = !message; }
      for (const control of all(field, "input, textarea, [role=group], [role=radiogroup]")) control.setAttribute("aria-invalid", String(Boolean(message)));
      if (message && !first) first = q(field, "[data-ix-focus]") ?? field;
    }
    if (options.focus && first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: "nearest" }); }
  };
  const focusField = (id: string) => {
    const field = all(root, "[data-ix-field]").find(item => fieldId(item) === id);
    const target = field && (q(field, "[data-ix-focus]") ?? q(field, "input, textarea, button"));
    if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: "nearest" }); }
  };
  return { read, write, showErrors, focusField, mark, checked, optionsOf, roving, refreshWeekday, fieldOf, fieldId };
}

/** The date fields' popover over the design system's calendar: open, step months, pick, arrow keys, Escape, focus back. */
export function interactionCalendar(picked: (input: HTMLInputElement) => void) {
  const q = <T extends Element = HTMLElement>(scope: ParentNode, selector: string) => scope.querySelector<T>(selector);
  const all = <T extends Element = HTMLElement>(scope: ParentNode, selector: string) => [...scope.querySelectorAll<T>(selector)];
  let open: { popup: HTMLElement; trigger: HTMLButtonElement; input: HTMLInputElement } | null = null;
  const pages = (popup: HTMLElement) => all(popup, "[data-ix-calendar-page]");
  const showPage = (popup: HTMLElement, index: number) => {
    const list = pages(popup);
    list.forEach((calendar, at) => {
      calendar.hidden = at !== index;
      const back = q<HTMLButtonElement>(calendar, '[data-calendar-step="-1"]'), next = q<HTMLButtonElement>(calendar, '[data-calendar-step="1"]');
      if (back) back.disabled = at === 0;
      if (next) next.disabled = at === list.length - 1;
    });
  };
  const markDay = (popup: HTMLElement, value: string) => {
    for (const cell of all(popup, "td[data-date]")) {
      const day = q<HTMLButtonElement>(cell, ".mw-calendar__day"), [, month, date] = (cell.dataset.date ?? "").split("-");
      if (!day) continue;
      day.setAttribute("aria-label", `${Number(month)}月${Number(date)}日`);
      day.setAttribute("aria-pressed", String(cell.dataset.date === value));
      cell.classList.toggle("is-selected", cell.dataset.date === value);
    }
  };
  /** A press anywhere outside the date field closes the popover, wherever it lands (the card's own listeners never see it). */
  const outside = (event: Event) => {
    if (open && event.target instanceof Node && !open.popup.closest("[data-ix-date]")!.contains(event.target)) close();
  };
  const close = (returnFocus = false) => {
    if (!open) return;
    document.removeEventListener("pointerdown", outside, true);
    open.popup.hidden = true;
    open.trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) open.trigger.focus();
    open = null;
  };
  const show = (trigger: HTMLButtonElement) => {
    const field = trigger.closest<HTMLElement>("[data-ix-date]"), popup = field && q(field, "[data-ix-calendar]"), input = field && q<HTMLInputElement>(field, "input");
    if (!field || !popup || !input) return;
    close();
    markDay(popup, input.value);
    showPage(popup, Math.max(0, pages(popup).findIndex(calendar => all(calendar, "td[data-date]").some(cell => cell.dataset.date === input.value))));
    popup.hidden = false;
    // Open upward when the room below (in the nearest scroller) is too short for the popup and there is room above.
    const scroller = field.closest<HTMLElement>("[data-thread], .mw-scroll"), box = field.getBoundingClientRect();
    const bounds = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    popup.dataset.place = bounds.bottom - box.bottom < popup.offsetHeight + 12 && box.top - bounds.top > popup.offsetHeight ? "top" : "bottom";
    trigger.setAttribute("aria-expanded", "true");
    open = { popup, trigger, input };
    document.addEventListener("pointerdown", outside, true);
    (q<HTMLButtonElement>(popup, ".mw-calendar__day[aria-pressed=true]") ?? q<HTMLButtonElement>(popup, "[aria-current=date] .mw-calendar__day"))?.focus();
  };
  /** True when the click belonged to the calendar. */
  const click = (target: Element): boolean => {
    const opener = target.closest<HTMLButtonElement>("[data-ix-calendar-open]");
    if (opener) { if (open?.trigger === opener) close(true); else show(opener); return true; }
    if (!open) return false;
    const stepper = target.closest<HTMLButtonElement>("[data-calendar-step]");
    if (stepper && open.popup.contains(stepper)) {
      const list = pages(open.popup), to = list.findIndex(calendar => !calendar.hidden) + Number(stepper.dataset.calendarStep);
      if (list[to]) { showPage(open.popup, to); q<HTMLButtonElement>(list[to]!, ".mw-calendar__day")?.focus(); }
      return true;
    }
    const day = target.closest<HTMLElement>("td[data-date]");
    if (day && open.popup.contains(day)) {
      const { input } = open;
      input.value = day.dataset.date ?? "";
      close(true);
      picked(input);
      return true;
    }
    if (!open.popup.contains(target)) close();
    return false;
  };
  /** True when the key belonged to the calendar. */
  const key = (event: KeyboardEvent): boolean => {
    if (!open) return false;
    if (event.key === "Escape") { event.preventDefault(); close(true); return true; }
    const day = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".mw-calendar__day") : null;
    const move = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number | undefined>)[event.key];
    if (!day || move === undefined || !open.popup.contains(day)) return false;
    event.preventDefault();
    const days = all<HTMLButtonElement>(open.popup, "[data-ix-calendar-page]:not([hidden]) .mw-calendar__day");
    days[Math.min(days.length - 1, Math.max(0, days.indexOf(day) + move))]?.focus();
    return true;
  };
  const focusOut = (next: EventTarget | null) => {
    if (open && next instanceof Node && !open.popup.closest("[data-ix-date]")!.contains(next)) close();
  };
  return { click, key, focusOut, close };
}

/** Turns the card's events into the host's callbacks. Keeps no values: the consumer owns them. */
export function assembleInteractionClient(fieldsFactory: typeof interactionFields, calendarFactory: typeof interactionCalendar, root: HTMLElement, host: InteractionClientHost = {}): InteractionClient {
  let composing = false;
  const fields = fieldsFactory(root);
  const q = <T extends Element = HTMLElement>(scope: ParentNode, selector: string) => scope.querySelector<T>(selector);
  const all = <T extends Element = HTMLElement>(scope: ParentNode, selector: string) => [...scope.querySelectorAll<T>(selector)];
  const emit = (control: HTMLElement) => {
    const field = fields.fieldOf(control);
    if (!field) return;
    const id = fields.fieldId(field);
    host.onChange?.({ field: id, ...(control.dataset.ixPart ? { part: control.dataset.ixPart } : {}), value: fields.read()[id]! });
  };
  const calendar = calendarFactory(input => { fields.refreshWeekday(input.closest<HTMLElement>("[data-ix-date]")); emit(input); });
  const onClick = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || calendar.click(target)) return;
    const button = target.closest<HTMLButtonElement>("button");
    if (!button || button.disabled || !root.contains(button)) return;
    const step = button.closest<HTMLButtonElement>("[data-ix-step]");
    if (step) { host.onStep?.(Number(step.dataset.ixStep), step); return; }
    // A submit button is reported once, by the form's submit event, not also as an action.
    if (button.dataset.ixAction) { if (button.type !== "submit") host.onAction?.(button.dataset.ixAction, button); return; }
    const by = button.dataset.ixStepBy;
    if (by) {
      const input = q<HTMLInputElement>(button.closest<HTMLElement>(".mw-ix-number") ?? root, "input");
      if (!input) return;
      const current = Number(input.value);
      if (!input.value.trim() || !Number.isFinite(current)) { input.focus(); return; }
      const min = input.dataset.ixMin === undefined ? -Infinity : Number(input.dataset.ixMin), max = input.dataset.ixMax === undefined ? Infinity : Number(input.dataset.ixMax);
      input.value = String(Math.min(max, Math.max(min, current + Number(by))));
      emit(input);
      return;
    }
    const option = button.closest<HTMLButtonElement>("[data-ix-option]"), ref = button.closest<HTMLButtonElement>("[data-ix-reference]");
    if (option && fields.fieldOf(option)) {
      const group = option.closest<HTMLElement>("[data-ix-options]");
      if (group?.hasAttribute("data-ix-multiple")) fields.mark(option, !fields.checked(option));
      else { for (const other of fields.optionsOf(fields.fieldOf(option)!)) fields.mark(other, other === option); if (group) fields.roving(group); }
      emit(option);
    } else if (ref) { fields.mark(ref, !fields.checked(ref)); emit(ref); }
  };
  const onInput = (event: Event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    fields.refreshWeekday(input.closest<HTMLElement>("[data-ix-date]"));
    if (!composing && input.closest("[data-ix-field]")) emit(input);
  };
  const onCompositionEnd = (event: Event) => {
    composing = false;
    const input = event.target;
    if ((input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) && input.closest("[data-ix-field]")) emit(input);
  };
  const onKeyDown = (event: Event) => {
    const key = event as KeyboardEvent, target = key.target instanceof HTMLElement ? key.target : null;
    if (calendar.key(key) || !target) return;
    const radio = target.closest<HTMLButtonElement>("[role=radio]");
    if (radio && ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(key.key)) {
      const group = radio.closest<HTMLElement>("[role=radiogroup]");
      const radios = group ? all<HTMLButtonElement>(group, "[role=radio]").filter(item => !item.disabled) : [];
      if (!radios.length) return;
      key.preventDefault();
      const at = radios.indexOf(radio), forward = key.key === "ArrowDown" || key.key === "ArrowRight";
      const to = key.key === "Home" ? 0 : key.key === "End" ? radios.length - 1 : (at + (forward ? 1 : -1) + radios.length) % radios.length;
      radios[to]!.focus();
      radios[to]!.click();
      return;
    }
    const form = target.closest<HTMLFormElement>("[data-ix-form]");
    // keyCode 229 is the Enter that confirms an input-method candidate in WebKit, where isComposing is already false.
    if (key.key !== "Enter" || key.isComposing || key.keyCode === 229 || composing || !form) return;
    if (key.metaKey || key.ctrlKey) { key.preventDefault(); host.onSubmit?.(); return; }
    // Plain Enter in a single-line field moves on instead of answering early.
    if (target instanceof HTMLInputElement) {
      key.preventDefault();
      const order = all(form, "[data-ix-focus], [data-ix-part=time], [data-ix-other]");
      const next = order[order.indexOf(target) + 1];
      // A group is not itself a control: land on the pick (or the first option) inside it.
      (next?.matches("[data-ix-options], [data-ix-references]") ? q(next, "[role=radio][aria-checked=true]") ?? q(next, "button:not(:disabled)") ?? next : next)?.focus();
    }
  };
  const onSubmit = (event: Event) => {
    if (!(event.target instanceof Element) || !event.target.matches("[data-ix-form]")) return;
    event.preventDefault();
    host.onSubmit?.();
  };
  const onFocusOut = (event: Event) => calendar.focusOut((event as FocusEvent).relatedTarget);
  const listeners: Array<[string, (event: Event) => void]> = [
    ["click", onClick], ["input", onInput], ["compositionstart", () => { composing = true; }], ["compositionend", onCompositionEnd],
    ["keydown", onKeyDown], ["submit", onSubmit], ["focusout", onFocusOut],
  ];
  for (const [name, listener] of listeners) root.addEventListener(name, listener);
  all(root, "[role=radiogroup]").forEach(fields.roving);
  return {
    get composing() { return composing; },
    read: fields.read,
    write: values => fields.write(values, composing),
    showErrors: fields.showErrors,
    focusField: fields.focusField,
    destroy() {
      calendar.close();
      for (const [name, listener] of listeners) root.removeEventListener(name, listener);
    },
  };
}
/** What a TypeScript consumer calls. */
export const createInteractionClient = (root: HTMLElement, host: InteractionClientHost = {}): InteractionClient =>
  assembleInteractionClient(interactionFields, interactionCalendar, root, host);
/** The same client as a script expression, for a browser factory that cannot import: `(…)(root, host)`. */
export const INTERACTION_CLIENT_SCRIPT = `((fields, calendar, assemble) => (root, host) => assemble(fields, calendar, root, host))(${interactionFields.toString()}, ${interactionCalendar.toString()}, ${assembleInteractionClient.toString()})`;
