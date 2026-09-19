import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";
import { renderButton } from "./button.js";
import { renderInput } from "./field.js";

const DEFAULT_WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function civilKey(year: number, month: number, date: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

export function renderCalendar(options: {
  year: number;
  month: number;
  selected?: string;
  today?: string;
  compact?: boolean;
  labelledBy?: string;
  title?: string;
  weekdays?: ReadonlyArray<string>;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  const weekdays = options.weekdays ?? DEFAULT_WEEKDAYS;
  const start = new Date(options.year, options.month, 1);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(1 - offset);
  const daysInMonth = new Date(options.year, options.month + 1, 0).getDate();
  const rows = Math.ceil((offset + daysInMonth) / 7);
  const cells: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = "<tr>";
    for (let column = 0; column < 7; column++) {
      const day = new Date(start);
      day.setDate(start.getDate() + row * 7 + column);
      const key = civilKey(day.getFullYear(), day.getMonth(), day.getDate());
      const outside = day.getMonth() !== options.month;
      const current = options.today === key;
      const selected = options.selected === key;
      line += `<td class="${cx(outside && "mw-calendar__outside", selected && "is-selected")}" data-date="${key}"${
        current ? ' aria-current="date"' : ""
      }><button type="button" class="mw-calendar__day">${day.getDate()}</button></td>`;
    }
    line += "</tr>";
    cells.push(line);
  }
  const title = options.title ?? `${options.year}年${options.month + 1}月`;
  const prev = renderButton({
    variant: "ghost",
    size: "icon",
    icon: "back",
    iconOnly: true,
    label: "上个月",
    attrs: { "data-calendar-step": "-1" },
  });
  const next = renderButton({
    variant: "ghost",
    size: "icon",
    icon: "chevron-right",
    iconOnly: true,
    label: "下个月",
    attrs: { "data-calendar-step": "1" },
  });
  return `<section class="${cx("mw-calendar", options.compact && "mw-calendar--compact", options.className)}" data-slot="calendar" data-calendar-year="${options.year}" data-calendar-month="${options.month}"${
    options.labelledBy ? ` aria-labelledby="${escapeHtml(options.labelledBy)}"` : ` aria-label="${escapeHtml(title)}"`
  }${renderAttrs(options.attrs)}>
    <header class="mw-calendar__header"><span data-calendar-title>${escapeHtml(title)}</span><div class="mw-group">${prev}${next}</div></header>
    <table class="mw-calendar__grid"><thead><tr>${weekdays.map((day) => `<th>${escapeHtml(day)}</th>`).join("")}</tr></thead><tbody>${cells.join("")}</tbody></table>
  </section>`;
}

export function renderDatePicker(options: {
  name?: string;
  value?: string;
  placeholder?: string;
  className?: string;
  calendar: Parameters<typeof renderCalendar>[0];
}): string {
  return `<div class="${cx("mw-date-picker", options.className)}" data-slot="date-picker">
    <div class="mw-input-group">${renderInput({
      name: options.name,
      value: options.value,
      placeholder: options.placeholder ?? "选择日期",
      attrs: { "data-date-picker-input": true, autocomplete: "off" },
    })}${renderButton({
      variant: "ghost",
      size: "icon",
      icon: "clock",
      iconOnly: true,
      label: "打开日历",
      attrs: { "data-date-picker-open": true },
    })}</div>
    ${renderCalendar({ ...options.calendar, className: cx("mw-date-picker__popup", options.calendar.className) })}
  </div>`;
}

export function calendarTitle(year: number, month: number): string {
  return `${year}年${month + 1}月`;
}
