import { itemField } from "./item.js";
import { addDays, civil, dayDate, esc, dateLabel, mondayIndex, monthLabel } from "./util.js";
import type { JellyPage } from "./types.js";

const PICKER = ".jelly-date-picker";

function paintDatePicker(page: JellyPage, picker: HTMLElement, date: string): void {
  const calendar = page.$(".mw-calendar", picker);
  const first = dayDate(date);
  first.setDate(1);
  const month = first.getMonth();
  const start = addDays(civil(first), -mondayIndex(first));
  calendar.dataset.calendarYear = String(first.getFullYear());
  calendar.dataset.calendarMonth = String(month);
  page.$("[data-calendar-title]", calendar).textContent = monthLabel(civil(first));
  const chosen = page.$<HTMLInputElement>("[data-date-picker-input]", picker).value;
  let html = "";
  for (let row = 0; row < 6; row++) {
    html += "<tr>";
    for (let col = 0; col < 7; col++) {
      const day = addDays(start, row * 7 + col);
      html += `<td data-date="${day}" class="${dayDate(day).getMonth() !== month ? "mw-calendar__outside " : ""}${day === chosen ? "is-selected" : ""}"><button type="button" class="mw-calendar__day" aria-label="${esc(dateLabel(day))}">${Number(day.slice(8))}</button></td>`;
    }
    html += "</tr>";
  }
  page.$("tbody", calendar).innerHTML = html;
}

function openDatePicker(page: JellyPage, picker: HTMLElement): void {
  const input = page.$<HTMLInputElement>("[data-date-picker-input]", picker);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : civil();
  page.$$(`${PICKER} .mw-calendar`).forEach((node) => node.classList.remove("is-open"));
  paintDatePicker(page, picker, date);
  page.$(".mw-calendar", picker).classList.add("is-open");
}

/** The three clicks a picker answers (open, choose a day, step a month); false when the click is not on a picker. */
export function handleDatePickerClick(page: JellyPage, target: HTMLElement): boolean {
  const picker = target.closest<HTMLElement>(PICKER);
  if (target.hasAttribute("data-date-picker-open") && picker) { openDatePicker(page, picker); return true; }
  if (!picker) return false;
  if (target.matches(".mw-calendar__day")) {
    const input = page.$<HTMLInputElement>("[data-date-picker-input]", picker);
    input.value = target.closest<HTMLElement>("[data-date]")?.dataset.date ?? "";
    page.$(".mw-calendar", picker).classList.remove("is-open");
    if (input.dataset.jellyField === "start_date" && itemField(page, "end_date").value < input.value) itemField(page, "end_date").value = input.value;
    return true;
  }
  if (target.hasAttribute("data-calendar-step")) {
    const calendar = page.$(".mw-calendar", picker);
    const date = new Date(Number(calendar.dataset.calendarYear), Number(calendar.dataset.calendarMonth) + Number(target.dataset.calendarStep), 1, 12);
    paintDatePicker(page, picker, civil(date));
    return true;
  }
  return false;
}

export function installDatePickers(page: JellyPage): void {
  page.root.addEventListener("focusin", (event) => {
    const input = event.target as HTMLElement | null;
    if (input?.matches("[data-date-picker-input]")) {
      const picker = input.closest<HTMLElement>(PICKER);
      if (picker) openDatePicker(page, picker);
    }
  });
  page.root.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest(PICKER)) page.$$(`${PICKER} .mw-calendar`).forEach((node) => node.classList.remove("is-open"));
  });
}
