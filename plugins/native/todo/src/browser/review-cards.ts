import type { TodoBatch, TodoCandidate } from "@molis-ai/molis-work-contracts/modules/todo";
import { make } from "./dom.js";
import { actionFor, applyLabel, choiceFor } from "./review-choices.js";
import type { CandidateChoice, TodoPage } from "./types.js";

type CandidateKind = TodoCandidate["kind"];
type FieldName = "title" | "due_date" | "due_time" | "planned_date" | "notes";

const fieldNames = (L: TodoPage["L"]): Record<FieldName, string> => ({
  title: L("todo.field.title-name"), due_date: L("todo.field.due-date"), due_time: L("todo.field.due-time"), planned_date: L("todo.field.planned-date"), notes: L("todo.field.notes"),
});

function fieldValue(page: TodoPage, field: string, value: string | null | undefined): string {
  return value === null || value === undefined || value === "" ? page.L("todo.review.empty-value") : field.endsWith("date") ? page.dayLabel(value) : String(value);
}

function existingText(page: TodoPage, candidate: TodoCandidate): string {
  const { L } = page;
  const existing = candidate.existing;
  if (!existing) return "";
  const names = fieldNames(L);
  const changes = Object.entries(existing.changes).map(([field, value]) => `${names[field as FieldName]} ${fieldValue(page, field, value)}`).join("，");
  if (existing.relation === "same") return L("todo.review.existing-same", { title: existing.title });
  if (existing.relation === "update") return L("todo.review.existing-update", { title: existing.title, changes });
  if (existing.relation === "conflict") return L("todo.review.existing-conflict", { title: existing.title });
  if (existing.relation === "maybe_done") return L("todo.review.existing-maybe-done", { title: existing.title }) + (existing.reason ? `：${existing.reason}` : "");
  return L("todo.review.existing-reopen", { title: existing.title }) + (changes ? `：${changes}` : "");
}

function editorField(candidate: TodoCandidate, label: string, field: string, type: string, value: string): HTMLElement {
  const wrap = make("label", "todo-field");
  wrap.append(make("span", "", label));
  const node = make("input", "mw-input");
  node.type = type;
  node.value = value;
  node.dataset.todoCandidateField = field;
  node.dataset.candidate = candidate.candidate_id;
  wrap.append(node);
  return wrap;
}

function renderEditor(page: TodoPage, candidate: TodoCandidate, choice: CandidateChoice, due: string | null | undefined, planned: string | null | undefined): HTMLElement {
  const { L } = page;
  const editor = make("div", "todo-candidate-editor");
  editor.append(
    editorField(candidate, L("todo.field.what"), "title", "text", choice.edits.title || candidate.title),
    editorField(candidate, L("todo.field.due-date"), "due_date", "date", due || ""),
    editorField(candidate, L("todo.field.planned-date-long"), "planned_date", "date", planned || ""),
  );
  const place = make("div", "mw-toggle-group");
  place.setAttribute("role", "radiogroup");
  place.setAttribute("aria-label", L("todo.field.place"));
  page.paintPlaces(place, choice.edits.placement || candidate.placement, "data-todo-candidate-placement");
  place.querySelectorAll<HTMLElement>("button").forEach((button) => { button.dataset.candidate = candidate.candidate_id; });
  editor.append(place);
  return editor;
}

function renderCandidate(page: TodoPage, batch: TodoBatch, candidate: TodoCandidate): HTMLElement {
  const { L } = page;
  const names = fieldNames(L);
  const kindNames: Record<CandidateKind, string> = {
    request: L("todo.review.kind-request"), commitment: L("todo.review.kind-commitment"), waiting: L("todo.review.kind-waiting"), suggestion: L("todo.review.kind-suggestion"),
  };
  const decidedAs: Record<string, string> = {
    added: L("todo.review.done-added"), merged: L("todo.review.done-merged"), updated: L("todo.review.done-updated"), ignored: L("todo.review.done-ignored"),
  };
  const choice = choiceFor(page, candidate);
  const row = make("article", `todo-candidate${candidate.decision ? " is-decided" : ""}`);
  row.dataset.todoCandidate = candidate.candidate_id;
  const pick = make("input", "mw-check");
  pick.type = "checkbox";
  pick.dataset.todoPickCandidate = candidate.candidate_id;
  pick.checked = !candidate.decision && choice.picked;
  pick.disabled = Boolean(candidate.decision);
  pick.setAttribute("aria-label", L("todo.row.select", { title: candidate.title }));
  const body = make("div", "todo-candidate-body");
  const head = make("div", "todo-candidate-head");
  head.append(make("span", `todo-candidate-kind todo-candidate-kind--${candidate.kind}`, kindNames[candidate.kind]), make("strong", "", choice.edits.title || candidate.title));
  body.append(head);
  const facts = make("div", "todo-meta");
  const due = choice.edits.due_date !== undefined ? choice.edits.due_date : candidate.due_date;
  if (due) facts.append(make("span", "todo-meta-part todo-meta-part--due", `${L("todo.quick.due")} ${page.dayLabel(due)}${candidate.due_phrase && due === candidate.due_date ? L("todo.review.due-phrase", { phrase: candidate.due_phrase }) : ""}`));
  facts.append(make("span", "todo-meta-part", candidate.kind === "waiting"
    ? L("todo.review.waiting-who", { who: (candidate.waiting && candidate.waiting.who) || L("todo.review.someone") })
    : L("todo.review.owner", { who: candidate.owner.value || L("todo.actor.you") }) + (candidate.owner.stated ? "" : L("todo.review.unsure"))));
  if (candidate.topic) facts.append(make("span", "todo-meta-part", candidate.topic));
  const planned = choice.edits.planned_date;
  if (planned) facts.append(make("span", "todo-meta-part", `${L("todo.quick.planned")} ${page.dayLabel(planned)}`));
  else if (candidate.suggested_date && candidate.suggested_date !== due && !candidate.decision) {
    const suggest = make("button", "mw-btn mw-btn--link todo-candidate-suggest", L("todo.review.suggest-day", { day: page.dayLabel(candidate.suggested_date) }));
    suggest.type = "button";
    suggest.dataset.todoCandidateSuggest = candidate.candidate_id;
    facts.append(suggest);
  }
  body.append(facts);
  if (candidate.why) body.append(make("p", "todo-candidate-why", candidate.why));
  if (candidate.existing) {
    body.append(make("p", `todo-candidate-existing todo-candidate-existing--${candidate.existing.relation}`, existingText(page, candidate)));
    for (const entry of candidate.existing.protected) {
      const label = make("label", "mw-check-row todo-candidate-protected");
      const box = make("input", "mw-check");
      box.type = "checkbox";
      box.dataset.todoAcceptProtected = candidate.candidate_id;
      box.dataset.field = entry.field;
      box.checked = choice.accept.has(entry.field);
      box.disabled = Boolean(candidate.decision);
      label.append(box, make("span", "", L("todo.review.protected", { field: names[entry.field], value: fieldValue(page, entry.field, entry.value) })));
      body.append(label);
    }
  }
  for (const entry of candidate.evidence) {
    const quote = make("blockquote", "todo-candidate-evidence", `“${entry.excerpt}”`);
    const material = batch.materials[entry.material - 1];
    quote.append(make("small", "", ` — ${material ? material.title : L("todo.source.material")}`));
    body.append(quote);
  }
  if (candidate.uncertain.length) body.append(make("p", "todo-candidate-uncertain", L("todo.review.uncertain") + candidate.uncertain.join("；")));
  if (choice.editing && !candidate.decision) body.append(renderEditor(page, candidate, choice, due, planned));
  const actions = make("div", "todo-candidate-actions");
  if (candidate.decision) actions.append(make("span", `mw-status mw-status--${candidate.decision.action === "ignored" ? "quiet" : "done"}`, decidedAs[candidate.decision.action]));
  else {
    if (actionFor(candidate) === "add") {
      const edit = make("button", "mw-btn mw-btn--ghost", choice.editing ? L("todo.review.collapse") : L("todo.review.edit"));
      edit.type = "button";
      edit.dataset.todoCandidateEditToggle = candidate.candidate_id;
      actions.append(edit);
    }
    const ignore = make("button", "mw-btn mw-btn--ghost", L("todo.review.ignore"));
    ignore.type = "button";
    ignore.dataset.todoCandidateIgnore = candidate.candidate_id;
    actions.append(ignore);
  }
  row.append(pick, body, actions);
  return row;
}

/** One organizing batch: what was read, each candidate, and the foot that applies the kept ones. */
export function renderBatchSection(page: TodoPage, batch: TodoBatch): HTMLElement {
  const { L } = page;
  const section = make("section", "todo-batch-review");
  section.dataset.todoBatchReview = batch.batch_id;
  const open = batch.candidates.filter((candidate) => !candidate.decision).length;
  const head = make("header", "todo-batch-head");
  head.append(make("h2", "", batch.title), make("small", "", `${L("todo.review.open-count", { count: open })} · ${page.timeLabel(batch.created_at)}`));
  section.append(head);
  for (const line of batch.notes) section.append(make("p", "todo-muted", line));
  const read = make("details", "todo-batch-materials");
  read.append(make("summary", "", L("todo.review.read-count", { count: batch.materials.length })));
  for (const material of batch.materials) {
    read.append(make("p", "todo-muted", material.title + (material.read === "read" ? "" : material.read === "failed" ? L("todo.review.not-read") : L("todo.review.partly-read"))));
  }
  section.append(read);
  for (const candidate of batch.candidates) section.append(renderCandidate(page, batch, candidate));
  if (batch.reference_only.length) {
    const reference = make("details", "todo-batch-reference");
    reference.append(make("summary", "", L("todo.review.reference-count", { count: batch.reference_only.length })));
    for (const entry of batch.reference_only) reference.append(make("p", "todo-muted", `${entry.summary} — ${batch.materials[entry.material - 1]?.title ?? ""}`));
    section.append(reference);
  }
  const foot = make("footer", "todo-batch-foot");
  const label = applyLabel(page, batch);
  const apply = make("button", "mw-btn mw-btn--primary", label || L("todo.review.pick-first"));
  apply.type = "button";
  apply.dataset.todoApply = batch.batch_id;
  apply.disabled = !label;
  const rest = batch.candidates.filter((candidate) => !candidate.decision && !choiceFor(page, candidate).picked).length;
  const ignoreRest = make("button", "mw-btn mw-btn--ghost", L("todo.review.ignore-rest", { count: rest }));
  ignoreRest.type = "button";
  ignoreRest.dataset.todoIgnoreRest = batch.batch_id;
  ignoreRest.hidden = rest === 0;
  const close = make("button", "mw-btn mw-btn--ghost", L("todo.review.put-away"));
  close.type = "button";
  close.dataset.todoCloseBatch = batch.batch_id;
  foot.append(apply, ignoreRest, close);
  section.append(foot);
  return section;
}
