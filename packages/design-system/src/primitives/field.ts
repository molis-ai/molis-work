import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";
import { renderButton } from "./button.js";

export type MwControlSize = "sm" | "md" | "lg";

export interface MwInputOptions {
  name?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  describedBy?: string;
  size?: MwControlSize;
  className?: string;
  attrs?: Record<string, AttrValue>;
}

export function renderInput(options: MwInputOptions = {}): string {
  return `<input class="${cx("mw-input", options.size && `mw-input--${options.size}`, options.className)}" data-slot="input"${
    options.invalid ? " aria-invalid=\"true\"" : ""
  }${renderAttrs({
    id: options.id,
    name: options.name,
    type: options.type ?? "text",
    value: options.value,
    placeholder: options.placeholder,
    required: options.required,
    disabled: options.disabled,
    "aria-describedby": options.describedBy,
    ...options.attrs,
  })}>`;
}

export function renderTextarea(options: MwInputOptions & { rows?: number } = {}): string {
  return `<textarea class="${cx("mw-textarea", options.size && `mw-textarea--${options.size}`, options.className)}" data-slot="textarea" rows="${options.rows ?? 3}"${
    options.invalid ? " aria-invalid=\"true\"" : ""
  }${renderAttrs({
    id: options.id,
    name: options.name,
    placeholder: options.placeholder,
    required: options.required,
    disabled: options.disabled,
    "aria-describedby": options.describedBy,
    ...options.attrs,
  })}>${escapeHtml(options.value ?? "")}</textarea>`;
}

export function renderSelect(options: MwInputOptions & { optionsHtml?: string } = {}): string {
  return `<select class="${cx("mw-select", options.size && `mw-select--${options.size}`, options.className)}" data-slot="select"${
    options.invalid ? " aria-invalid=\"true\"" : ""
  }${renderAttrs({
    id: options.id,
    name: options.name,
    required: options.required,
    disabled: options.disabled,
    "aria-describedby": options.describedBy,
    ...options.attrs,
  })}>${options.optionsHtml ?? ""}</select>`;
}

export function renderCheckbox(options: {
  name?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  const control = `<input class="mw-check" data-slot="checkbox" type="checkbox"${renderAttrs({
    name: options.name,
    value: options.value,
    checked: options.checked,
    disabled: options.disabled,
    ...options.attrs,
  })}>`;
  if (!options.label) return control;
  return `<label class="${cx("mw-check-row", options.className)}">${control}<span>${escapeHtml(options.label)}</span></label>`;
}

export function renderRadio(options: {
  name: string;
  value: string;
  checked?: boolean;
  disabled?: boolean;
  label: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  return `<label class="${cx("mw-check-row", options.className)}"><input class="mw-radio" data-slot="radio" type="radio"${renderAttrs({
    name: options.name,
    value: options.value,
    checked: options.checked,
    disabled: options.disabled,
    ...options.attrs,
  })}><span>${escapeHtml(options.label)}</span></label>`;
}

export function renderSwitch(options: {
  name?: string;
  checked?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  const control = `<span class="${cx("mw-switch", options.className)}" data-slot="switch"><input type="checkbox" role="switch"${renderAttrs({
    name: options.name,
    checked: options.checked,
    disabled: options.disabled,
    ...options.attrs,
  })}><span class="mw-switch__track" aria-hidden="true"></span></span>`;
  if (!options.label) return control;
  return `<label class="mw-check-row">${control}<span>${escapeHtml(options.label)}</span></label>`;
}

export function renderField(options: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  control: string;
  className?: string;
}): string {
  return `<label class="${cx("mw-field", options.className)}" data-slot="field"><span class="mw-field__label">${escapeHtml(options.label)}${
    options.required ? `<small>${escapeHtml("必填")}</small>` : ""
  }</span>${options.control}${
    options.hint ? `<small class="mw-field__hint">${escapeHtml(options.hint)}</small>` : ""
  }${options.error ? `<p class="mw-field__error" role="alert">${escapeHtml(options.error)}</p>` : ""}</label>`;
}

export function renderFieldset(options: { legend: string; hint?: string; body: string; className?: string }): string {
  return `<fieldset class="${cx("mw-fieldset", options.className)}" data-slot="fieldset"><legend>${escapeHtml(options.legend)}</legend>${
    options.hint ? `<p class="mw-field__hint">${escapeHtml(options.hint)}</p>` : ""
  }${options.body}</fieldset>`;
}

export function renderInputGroup(options: { start?: string; control: string; end?: string; className?: string }): string {
  return `<div class="${cx("mw-input-group", options.className)}" data-slot="input-group">${options.start ?? ""}${options.control}${options.end ?? ""}</div>`;
}

export function renderForm(options: {
  header: string;
  body: string;
  footer: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  return `<form class="${cx("mw-form", options.className)}" data-slot="form"${renderAttrs(options.attrs)}><header class="mw-form__header">${options.header}</header><div class="mw-form__body">${options.body}</div><footer class="mw-form__footer">${options.footer}</footer></form>`;
}

export function renderLabel(options: { text: string; forId?: string; className?: string }): string {
  return `<label class="${cx("mw-label", options.className)}" data-slot="label"${
    options.forId ? ` for="${escapeHtml(options.forId)}"` : ""
  }>${escapeHtml(options.text)}</label>`;
}

export function renderCheckboxGroup(options: {
  legend: string;
  body: string;
  className?: string;
}): string {
  return `<fieldset class="${cx("mw-check-group", options.className)}" data-slot="checkbox-group"><legend>${escapeHtml(options.legend)}</legend>${options.body}</fieldset>`;
}

export function renderRadioGroup(options: {
  legend: string;
  name: string;
  items: ReadonlyArray<{ value: string; label: string; checked?: boolean }>;
  className?: string;
}): string {
  return `<fieldset class="${cx("mw-radio-group", options.className)}" data-slot="radio-group" role="radiogroup"><legend>${escapeHtml(options.legend)}</legend>${
    options.items.map((item) => renderRadio({ name: options.name, value: item.value, label: item.label, checked: item.checked })).join("")
  }</fieldset>`;
}

export function renderNumberField(options: {
  name?: string;
  value?: number | string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  const decrement = renderButton({
    variant: "ghost",
    size: "icon",
    icon: "minus",
    iconOnly: true,
    label: "减少",
    attrs: { "data-number-step": "-1" },
  });
  const increment = renderButton({
    variant: "ghost",
    size: "icon",
    icon: "plus",
    iconOnly: true,
    label: "增加",
    attrs: { "data-number-step": "1" },
  });
  return `<div class="${cx("mw-number", options.className)}" data-slot="number-field">${decrement}${renderInput({
    name: options.name,
    type: "number",
    value: options.value == null ? undefined : String(options.value),
    attrs: { min: options.min, max: options.max, step: options.step ?? 1, ...options.attrs },
  })}${increment}</div>`;
}

export function renderOtpField(options: { length?: number; name?: string; className?: string } = {}): string {
  const length = options.length ?? 6;
  const cells = Array.from({ length }, (_, index) =>
    `<input class="mw-otp__cell" data-slot="otp-cell" type="text" inputmode="numeric" maxlength="1" autocomplete="${index === 0 ? "one-time-code" : "off"}"${
      options.name ? ` name="${escapeHtml(options.name)}-${index}"` : ""
    } aria-label="第 ${index + 1} 位">`,
  ).join("");
  return `<div class="${cx("mw-otp", options.className)}" data-slot="otp-field">${cells}</div>`;
}

const SLIDER_PROGRESS_SCRIPT =
  "this.style.setProperty('--slider-progress',((Number(this.value)-Number(this.min))/(Number(this.max)-Number(this.min)||1)*100)+'%');const o=this.closest('.mw-slider-field')?.querySelector('output');if(o)o.value=this.value;";

export function renderSlider(options: {
  name?: string;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  disabled?: boolean;
  className?: string;
}): string {
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  const value = options.value ?? 40;
  const span = max - min;
  const progress = span === 0 ? 0 : ((value - min) / span) * 100;
  const input = `<input class="${cx("mw-slider", options.className)}" data-slot="slider" type="range" min="${min}" max="${max}" value="${value}"${renderAttrs({
    name: options.name,
    step: options.step,
    disabled: options.disabled,
    style: `--slider-progress: ${progress}%`,
    oninput: SLIDER_PROGRESS_SCRIPT,
  })}>`;
  if (!options.label) return input;
  return `<div class="mw-slider-field" data-slot="slider-field">
    <div class="mw-slider-field__meta"><span>${escapeHtml(options.label)}</span><output>${value}</output></div>
    ${input}
  </div>`;
}

export function renderMeter(options: { value: number; max?: number; label?: string; className?: string }): string {
  const max = options.max ?? 100;
  return `<meter class="${cx("mw-meter", options.className)}" data-slot="meter" min="0" max="${max}" value="${options.value}"${
    options.label ? ` aria-label="${escapeHtml(options.label)}"` : ""
  }>${options.value}/${max}</meter>`;
}

export function renderAutocomplete(options: {
  placeholder?: string;
  items: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  return `<div class="${cx("mw-autocomplete", options.className)}" data-slot="autocomplete"${renderAttrs(options.attrs)}>
    <input class="mw-input" role="combobox" aria-expanded="true" aria-autocomplete="list" placeholder="${escapeHtml(options.placeholder ?? "")}">
    <div class="mw-autocomplete__list" role="listbox">${options.items}</div>
  </div>`;
}

export function renderToggle(options: {
  label: string;
  pressed?: boolean;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  return `<button type="button" class="${cx("mw-toggle", options.pressed && "is-current", options.className)}" data-slot="toggle" aria-pressed="${options.pressed ? "true" : "false"}"${renderAttrs(options.attrs)}>${escapeHtml(options.label)}</button>`;
}
