import type { FormRecord } from "../contract.js";
import { make } from "./dom.js";
import { buildFields, collectAnswers, missingRequired } from "./fields.js";
import type { FormPage } from "./page.js";
import { loadResults, type Results } from "./results.js";

/** Full-screen fill page on this computer: one person after another, each submission counted as a response. */
export const openFillPage = (page: FormPage, record: FormRecord) => {
  const { L, request } = page;
  const stage = make("div", "form-fill-page");
  stage.setAttribute("role", "dialog");
  stage.setAttribute("aria-label", L("form.fill.title") + " · " + record.title);
  const sheet = make("form", "form-fill-sheet");
  const leave = () => { document.removeEventListener("keydown", onKey, true); stage.remove(); if (page.tab === "results") void loadResults(page); };
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); leave(); } };
  const thanks = async () => {
    const results = await request<Results>("GET", "/" + encodeURIComponent(record.id) + "/results");
    sheet.replaceChildren();
    const done = make("h1", "", L("form.fill.done-title"));
    const count = make("p", "form-fill-lede"); count.textContent = L("form.fill.done-count", { count: results.analysis?.submission_count || 0 });
    const next = make("button", "mw-btn mw-btn--primary", L("form.fill.next")); next.type = "button"; next.onclick = draw;
    const quit = make("button", "mw-btn mw-btn--secondary", L("form.fill.exit")); quit.type = "button"; quit.onclick = leave;
    const row = make("div", "form-fill-actions"); row.append(quit, next);
    sheet.append(done, count, row);
    next.focus();
  };
  const draw = () => {
    sheet.replaceChildren();
    const kicker = make("p", "form-fill-kicker", L("form.fill.kicker"));
    const heading = make("h1", "", record.title);
    sheet.append(kicker, heading);
    if (record.description) { const lede = make("p", "form-fill-lede", record.description); sheet.append(lede); }
    const fields = make("div", "form-fill-fields");
    buildFields(L, fields, record.questions || []);
    const error = make("p", "form-fill-error"); error.setAttribute("role", "alert");
    const actions = make("div", "form-fill-actions");
    const exit = make("button", "mw-btn mw-btn--secondary", L("form.fill.exit")); exit.type = "button"; exit.onclick = leave;
    const submit = make("button", "mw-btn mw-btn--primary", L("form.fill.submit")); submit.type = "submit";
    actions.append(exit, submit);
    sheet.append(fields, error, actions);
    let attempt: string | null = null;
    sheet.onsubmit = async (event) => {
      event.preventDefault();
      const answers = collectAnswers(fields);
      const missing = missingRequired(record.questions || [], answers);
      if (missing) { error.textContent = L("form.fill.missing-required") + "：" + missing.title; return; }
      attempt ||= crypto.randomUUID();
      submit.disabled = true; error.textContent = "";
      try {
        await request("POST", "/" + encodeURIComponent(record.id) + "/submit", { answers, expected_version: record.version, request_id: attempt, source: "fill" });
        await thanks();
      } catch (failure) { error.textContent = (failure as Error).message || L("form.fill.failed"); submit.disabled = false; }
    };
    requestAnimationFrame(() => sheet.querySelector<HTMLElement>("input, select, textarea")?.focus());
  };
  draw();
  stage.append(sheet);
  document.addEventListener("keydown", onKey, true);
  document.body.append(stage);
};
