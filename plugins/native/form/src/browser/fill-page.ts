import type { FormRecord } from "@molis-ai/molis-work-contracts/modules/form";
import { make } from "./dom.js";
import { buildFields, collectAnswers, missingRequired } from "./fields.js";
import type { FormPage } from "./page.js";
import { loadResults, type Results } from "./results.js";

/** Full-screen fill page on this computer: one person after another, each submission counted as a response. */
export const openFillPage = (page: FormPage, record: FormRecord) => {
  const { L, request } = page;
  const stage = make("div", "form-fill-page");
  stage.setAttribute("role", "dialog");
  stage.setAttribute("aria-label", L("填写页") + " · " + record.title);
  const sheet = make("form", "form-fill-sheet");
  const leave = () => { document.removeEventListener("keydown", onKey, true); stage.remove(); if (page.tab === "results") void loadResults(page); };
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); leave(); } };
  const thanks = async () => {
    const results = await request<Results>("GET", "/" + encodeURIComponent(record.id) + "/results");
    sheet.replaceChildren();
    const done = make("h1", "", L("已提交，谢谢"));
    const count = make("p", "form-fill-lede"); count.textContent = L("这是第 {count} 份答卷。可以把电脑交给下一位。", { count: results.analysis?.submission_count || 0 });
    const next = make("button", "mw-btn mw-btn--primary", L("下一位填写")); next.type = "button"; next.onclick = draw;
    const quit = make("button", "mw-btn mw-btn--secondary", L("退出填写页")); quit.type = "button"; quit.onclick = leave;
    const row = make("div", "form-fill-actions"); row.append(quit, next);
    sheet.append(done, count, row);
    next.focus();
  };
  const draw = () => {
    sheet.replaceChildren();
    const kicker = make("p", "form-fill-kicker", L("在这台电脑上填写 · 回答只保存在这台电脑"));
    const heading = make("h1", "", record.title);
    sheet.append(kicker, heading);
    if (record.description) { const lede = make("p", "form-fill-lede", record.description); sheet.append(lede); }
    const fields = make("div", "form-fill-fields");
    buildFields(L, fields, record.questions || []);
    const error = make("p", "form-fill-error"); error.setAttribute("role", "alert");
    const actions = make("div", "form-fill-actions");
    const exit = make("button", "mw-btn mw-btn--secondary", L("退出填写页")); exit.type = "button"; exit.onclick = leave;
    const submit = make("button", "mw-btn mw-btn--primary", L("提交")); submit.type = "submit";
    actions.append(exit, submit);
    sheet.append(fields, error, actions);
    let attempt: string | null = null;
    sheet.onsubmit = async (event) => {
      event.preventDefault();
      const answers = collectAnswers(fields);
      const missing = missingRequired(record.questions || [], answers);
      if (missing) { error.textContent = L("还有必填题没填") + "：" + missing.title; return; }
      attempt ||= crypto.randomUUID();
      submit.disabled = true; error.textContent = "";
      try {
        await request("POST", "/" + encodeURIComponent(record.id) + "/submit", { answers, expected_version: record.version, request_id: attempt, source: "fill" });
        await thanks();
      } catch (failure) { error.textContent = (failure as Error).message || L("提交失败"); submit.disabled = false; }
    };
    requestAnimationFrame(() => sheet.querySelector<HTMLElement>("input, select, textarea")?.focus());
  };
  draw();
  stage.append(sheet);
  document.addEventListener("keydown", onKey, true);
  document.body.append(stage);
};
