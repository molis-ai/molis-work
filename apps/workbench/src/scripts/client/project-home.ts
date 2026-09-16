import { HOME_SHORTCUTS_FACTORY_SCRIPT } from "./project-home-shortcuts.js";

/** Daily context and presentation only; the disabled Agent never receives input. */
export const PROJECT_HOME_FACTORY_SCRIPT = `(host) => {
  const { getState, translate: L } = host;
  (${HOME_SHORTCUTS_FACTORY_SCRIPT})({ root: document.querySelector("[data-directory-shortcuts]"), translate: L,
    projectKey: getState().project?.project_id || getState().snapshot.board.board_id });
  const home = document.querySelector('[data-work-surface="home"]');
  if (!home) return null;
  const locale = document.documentElement.lang || "zh-CN";
  const date = home.querySelector("[data-home-date]");
  const table = home.querySelector(".home-calendar table");
  const calendar = new Date(); calendar.setDate(1);
  let dayKey = "", previousToday = null;
  const civilKey = day => [day.getFullYear(), day.getMonth(), day.getDate()].join("-");
  const renderCalendar = (now = new Date()) => {
    const year = calendar.getFullYear(), month = calendar.getMonth();
    const title = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(calendar);
    home.querySelector("[data-home-month]").textContent = title;
    table.setAttribute("aria-label", title);
    const start = new Date(year, month, 1);
    const offset = (start.getDay() + 6) % 7;
    start.setDate(1 - offset);
    const rows = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7);
    const fragment = document.createDocumentFragment();
    for (let row = 0; row < rows; row++) {
      const tr = document.createElement("tr");
      for (let column = 0; column < 7; column++) {
        const day = new Date(start); day.setDate(start.getDate() + row * 7 + column);
        const td = document.createElement("td"), number = document.createElement("span");
        number.textContent = new Intl.NumberFormat(locale).format(day.getDate());
        td.dataset.date = civilKey(day);
        if (day.getMonth() !== month) td.className = "home-calendar-outside";
        if (civilKey(day) === civilKey(now)) td.setAttribute("aria-current", "date");
        td.append(number); tr.append(td);
      }
      fragment.append(tr);
    }
    home.querySelector("[data-home-calendar]").replaceChildren(fragment);
  };
  for (let day = 1; day <= 7; day++) {
    const th = document.createElement("th"); th.scope = "col";
    const weekday = new Date(2024, 0, day);
    th.textContent = new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(weekday);
    th.setAttribute("aria-label", new Intl.DateTimeFormat(locale, { weekday: "long" }).format(weekday));
    home.querySelector("[data-home-weekdays]").append(th);
  }
  home.querySelectorAll("[data-home-month-step]").forEach(button => button.addEventListener("click", () => {
    calendar.setMonth(calendar.getMonth() + Number(button.dataset.homeMonthStep)); renderCalendar();
  }));
  const sync = () => {
    const now = new Date(), nextKey = civilKey(now);
    if (nextKey === dayKey) return;
    if (!previousToday || (calendar.getFullYear() === previousToday.getFullYear() && calendar.getMonth() === previousToday.getMonth())) {
      calendar.setFullYear(now.getFullYear(), now.getMonth(), 1);
    }
    previousToday = now; dayKey = nextKey;
    date.dateTime = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    date.textContent = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(now);
    home.querySelector("[data-home-year]").textContent = new Intl.DateTimeFormat(locale, { year: "numeric" }).format(now);
    home.querySelector("[data-home-weekday]").textContent = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(now);
    renderCalendar(now);
  };
  const quotes = [...home.querySelectorAll("[data-home-quote]")];
  const pages = home.querySelector(".home-quote-pages");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let index = 0, fading = false;
  const rotate = () => {
    if (fading) return;
    const change = () => {
        quotes[index].setAttribute("aria-hidden", "true"); quotes[index].inert = true;
        index = (index + 1) % quotes.length;
        quotes[index].setAttribute("aria-hidden", "false"); quotes[index].inert = false;
      pages.classList.remove("is-changing"); fading = false;
    };
    if (motion.matches) { change(); return; }
    fading = true; pages.classList.add("is-changing"); setTimeout(change, 160);
  };
  sync();
  home.querySelector("[data-home-quote-next]")?.addEventListener("click", rotate);
  setInterval(() => { if (!document.hidden && document.body.dataset.desktopSurface === "home" && !home.hidden) sync(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
  return { sync };
}`;
