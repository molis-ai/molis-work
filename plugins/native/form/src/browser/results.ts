import type { FormQuestion, FormSubmissionRecord } from "@molis-ai/molis-work-contracts/modules/form";
import { make } from "./dom.js";
import { collectAnswers, missingRequired } from "./fields.js";
import type { FormPage } from "./page.js";
import { setBusy, setTab, showNote } from "./status.js";
import type { Translate } from "./types.js";

export type Results = { analysis?: { submission_count?: number }; submissions?: FormSubmissionRecord[] };
type Imported = { imported: number; skipped: number; rejected: Array<{ name: string; reason: string }> };

const SOURCE: Record<string, string> = { preview: "试填", fill: "本机填写页", file: "答卷文件", agent: "助理提交", mcp: "外部工具提交", workflow: "工作流提交", plugin: "插件提交" };

/** One question's counts for choices and ratings (with the average), or its recent answers for text. */
const questionStat = (L: Translate, question: FormQuestion, index: number, submissions: readonly FormSubmissionRecord[]) => {
  const card = make("article", "form-stat");
  const head = make("strong", "", (index + 1) + ". " + (question.title || L("未命名题目")));
  card.append(head);
  const values = submissions.map((submission) => String(submission.answers?.[question.id] ?? "")).filter(Boolean);
  const meta = make("small", "", L("{count} 人回答", { count: values.length }));
  card.append(meta);
  if (["singleChoice", "multiChoice", "dropdown", "rating"].includes(question.type)) {
    const counts = new Map<string, number>();
    const labels = question.type === "rating" ? ["5", "4", "3", "2", "1"] : (question.options || []).map((option) => option.label);
    labels.forEach((label) => counts.set(label, 0));
    values.forEach((value) => (question.type === "multiChoice" ? value.split("\n") : [value]).forEach((item) => counts.set(item, (counts.get(item) || 0) + 1)));
    const bars = make("div", "form-stat-bars");
    counts.forEach((count, label) => {
      const row = document.createElement("div");
      const name = make("span", "", question.type === "rating" ? L("{score} 分", { score: label }) : label);
      const track = make("span", "form-stat-track");
      const fill = document.createElement("i"); fill.style.width = (values.length ? Math.round(count / values.length * 100) : 0) + "%"; track.append(fill);
      const value = make("span", "form-stat-count"); value.textContent = String(count);
      row.append(name, track, value); bars.append(row);
    });
    card.append(bars);
    if (question.type === "rating" && values.length) {
      const average = values.reduce((sum, value) => sum + Number(value), 0) / values.length;
      meta.textContent += " · " + L("平均 {score} / 5", { score: average.toFixed(1) });
    }
  } else if (values.length) {
    const texts = make("ul", "form-stat-texts");
    values.slice(-3).reverse().forEach((value) => { const item = make("li", "", value); texts.append(item); });
    card.append(texts);
  }
  return card;
};

/** Each question at a glance, under a line that says where the answers came from. */
const renderStats = (page: FormPage, questions: readonly FormQuestion[], submissions: readonly FormSubmissionRecord[]) => {
  const { L, statsEl } = page;
  statsEl.replaceChildren();
  if (!submissions.length) return;
  const sources: Record<string, number> = {};
  submissions.forEach((submission) => { const key = submission.source || "preview"; sources[key] = (sources[key] || 0) + 1; });
  const origin = make("p", "form-stats-origin");
  origin.textContent = Object.entries(sources).map(([key, count]) => L(SOURCE[key] || key) + " " + count).join(" · ");
  statsEl.append(origin);
  questions.forEach((question, index) => statsEl.append(questionStat(L, question, index, submissions)));
};

const submissionCard = (L: Translate, submission: FormSubmissionRecord, index: number) => {
  const card = make("article", "form-result");
  const head = document.createElement("strong");
  const when = submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : "";
  head.textContent = L("答卷") + " " + (index + 1) + (when ? " · " + when : "");
  card.append(head);
  const labels = new Map(submission.questions.map(question => [question.id, question.title]));
  Object.entries(submission.answers || {}).forEach(([questionId, answer]) => {
    const row = document.createElement("p");
    const label = make("span", "", labels.get(questionId) || questionId);
    const value = document.createElement("span");
    value.textContent = answer ? String(answer).replace(/\n/g, "、") : "—";
    row.append(label, value);
    card.append(row);
  });
  return card;
};

export const loadResults = async (page: FormPage) => {
  const { L, sel, summaryEl, resultListEl } = page;
  if (!sel) return;
  const id = sel.id;
  const seq = ++page.resultsSeq;
  summaryEl.textContent = L("载入中…");
  resultListEl.replaceChildren();
  page.statsEl.replaceChildren();
  const payload = await page.request<Results>("GET", "/" + encodeURIComponent(id) + "/results");
  // Only the newest request for the form still open paints.
  if (seq !== page.resultsSeq || page.sel?.id !== id) return;
  const current = page.sel;
  const count = payload.analysis?.submission_count || 0;
  summaryEl.textContent = count ? count + " " + L("份答卷") : L("还没有答卷");
  resultListEl.replaceChildren();
  (payload.submissions || []).forEach((submission, index) => resultListEl.append(submissionCard(L, submission, index)));
  renderStats(page, current.questions || [], payload.submissions || []);
};

/** The preview's 提交: a trial answer, sent once per distinct set of answers. */
export const submitPreview = async (page: FormPage) => {
  const { L, sel } = page;
  if (!sel || page.busy) return;
  setBusy(page, true);
  try {
    const answers = collectAnswers(page.previewEl);
    if (missingRequired(page.previewQuestions, answers)) { showNote(page, L("还有必填题没填"), true, "required"); return; }
    const input = { id: sel.id, expected_version: page.previewVersion, answers };
    const fingerprint = JSON.stringify(input);
    if (!page.submitCall || page.submitCall.fingerprint !== fingerprint) page.submitCall = { fingerprint, request_id: crypto.randomUUID() };
    await page.request("POST", "/" + encodeURIComponent(sel.id) + "/submit", { answers, expected_version: page.previewVersion, request_id: page.submitCall.request_id, source: "preview" });
    page.dirty = false;
    await loadResults(page);
    setTab(page, "results");
    showNote(page, L("已提交"), false);
  } catch (error) { showNote(page, (error as Error).message, true); }
  finally { setBusy(page, false); }
};

/** Answer files picked in 「导入答卷」: what was taken, skipped as already in, or refused, said in one note. */
export const importAnswers = async (page: FormPage, input: HTMLInputElement) => {
  const { L, sel } = page;
  const files = [...input.files || []];
  if (!files.length || !sel) return;
  setBusy(page, true);
  try {
    const contents = await Promise.all(files.map(async (file) => ({ name: file.name, content: file.size > 400000 ? "" : await file.text() })));
    const result = await page.request<Imported>("POST", "/" + encodeURIComponent(sel.id) + "/answers", { files: contents });
    const parts = [L("导入 {count} 份", { count: result.imported })];
    if (result.skipped) parts.push(L("{count} 份已导入过，跳过", { count: result.skipped }));
    if (result.rejected.length) parts.push(L("{count} 份没有导入", { count: result.rejected.length }) + "：" + result.rejected.map((item) => item.name + "（" + item.reason + "）").join("；"));
    showNote(page, parts.join(" · "), result.rejected.length > 0);
    await loadResults(page);
  } catch (error) { showNote(page, (error as Error).message || L("导入失败"), true); }
  finally { setBusy(page, false); input.value = ""; }
};
