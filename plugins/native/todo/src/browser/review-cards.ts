import type { TodoBatch, TodoCandidate } from "../contract.js";
import { make } from "./dom.js";
import { actionFor, applyLabel, choiceFor } from "./review-choices.js";
import type { CandidateChoice, TodoPage } from "./types.js";

const uiText = globalThis.t;

type CandidateKind = TodoCandidate["kind"];
type FieldName = "title" | "due_date" | "due_time" | "planned_date" | "notes";

const fieldNames = (): Record<FieldName, string> => ({
  title: uiText.text("todo.field.title-name"), due_date: uiText.text("todo.field.due-date"), due_time: uiText.text("todo.field.due-time"), planned_date: uiText.text("todo.field.planned-date"), notes: uiText.text("todo.field.notes"),
});

function fieldValue(page: TodoPage, field: string, value: string | null | undefined): string {
  return value === null || value === undefined || value === "" ? uiText.text("todo.review.empty-value") : field.endsWith("date") ? page.dayLabel(value) : String(value);
}

function existingText(page: TodoPage, candidate: TodoCandidate): string {
  const existing = candidate.existing;
  if (!existing) return "";
  const names = fieldNames();
  const changes = Object.entries(existing.changes).map(([field, value]) => `${names[field as FieldName]} ${fieldValue(page, field, value)}`).join(uiText.text("common.punctuation.clause-separator"));
  if (existing.relation === "same") return uiText.text("todo.review.existing-same", { title: existing.title });
  if (existing.relation === "update") return uiText.text("todo.review.existing-update", { title: existing.title, changes });
  if (existing.relation === "conflict") return uiText.text("todo.review.existing-conflict", { title: existing.title });
  if (existing.relation === "maybe_done") return uiText.text("todo.review.existing-maybe-done", { title: existing.title }) + (existing.reason ? uiText.text("common.punctuation.label-separator") + existing.reason : "");
  return uiText.text("todo.review.existing-reopen", { title: existing.title }) + (changes ? uiText.text("common.punctuation.label-separator") + changes : "");
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
  const editor = make("div", "todo-candidate-editor");
  editor.append(
    editorField(candidate, uiText.text("todo.field.what"), "title", "text", choice.edits.title || candidate.title),
    editorField(candidate, uiText.text("todo.field.due-date"), "due_date", "date", due || ""),
    editorField(candidate, uiText.text("todo.field.planned-date-long"), "planned_date", "date", planned || ""),
  );
  const place = make("div", "mw-toggle-group");
  place.setAttribute("role", "radiogroup");
  place.setAttribute("aria-label", uiText.text("todo.field.place"));
  page.paintPlaces(place, choice.edits.placement || candidate.placement, "data-todo-candidate-placement");
  place.querySelectorAll<HTMLElement>("button").forEach((button) => { button.dataset.candidate = candidate.candidate_id; });
  editor.append(place);
  return editor;
}

function renderCandidate(page: TodoPage, batch: TodoBatch, candidate: TodoCandidate): HTMLElement {
  const names = fieldNames();
  const kindNames: Record<CandidateKind, string> = {
    request: uiText.text("todo.review.kind-request"), commitment: uiText.text("todo.review.kind-commitment"), waiting: uiText.text("todo.review.kind-waiting"), suggestion: uiText.text("todo.review.kind-suggestion"),
  };
  const decidedAs: Record<string, string> = {
    added: uiText.text("todo.review.done-added"), merged: uiText.text("todo.review.done-merged"), updated: uiText.text("todo.review.done-updated"), ignored: uiText.text("todo.review.done-ignored"),
  };
  const choice = choiceFor(page, candidate);
  const row = make("article", `todo-candidate${candidate.decision ? " is-decided" : ""}`);
  row.dataset.todoCandidate = candidate.candidate_id;
  const pick = make("input", "mw-check");
  pick.type = "checkbox";
  pick.dataset.todoPickCandidate = candidate.candidate_id;
  pick.checked = !candidate.decision && choice.picked;
  pick.disabled = Boolean(candidate.decision);
  pick.setAttribute("aria-label", uiText.text("todo.row.select", { title: candidate.title }));
  const body = make("div", "todo-candidate-body");
  const head = make("div", "todo-candidate-head");
  head.append(make("span", `todo-candidate-kind todo-candidate-kind--${candidate.kind}`, kindNames[candidate.kind]), make("strong", "", choice.edits.title || candidate.title));
  body.append(head);
  const facts = make("div", "todo-meta");
  const due = choice.edits.due_date !== undefined ? choice.edits.due_date : candidate.due_date;
  if (due) facts.append(make("span", "todo-meta-part todo-meta-part--due", `${uiText.text("todo.quick.due")} ${page.dayLabel(due)}${candidate.due_phrase && due === candidate.due_date ? uiText.text("todo.review.due-phrase", { phrase: candidate.due_phrase }) : ""}`));
  facts.append(make("span", "todo-meta-part", candidate.kind === "waiting"
    ? uiText.text("todo.review.waiting-who", { who: (candidate.waiting && candidate.waiting.who) || uiText.text("todo.review.someone") })
    : uiText.text("todo.review.owner", { who: candidate.owner.value || uiText.text("todo.actor.you") }) + (candidate.owner.stated ? "" : uiText.text("todo.review.unsure"))));
  if (candidate.topic) facts.append(make("span", "todo-meta-part", candidate.topic));
  const planned = choice.edits.planned_date;
  if (planned) facts.append(make("span", "todo-meta-part", `${uiText.text("todo.quick.planned")} ${page.dayLabel(planned)}`));
  else if (candidate.suggested_date && candidate.suggested_date !== due && !candidate.decision) {
    const suggest = make("button", "mw-btn mw-btn--link todo-candidate-suggest", uiText.text("todo.review.suggest-day", { day: page.dayLabel(candidate.suggested_date) }));
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
      label.append(box, make("span", "", uiText.text("todo.review.protected", { field: names[entry.field], value: fieldValue(page, entry.field, entry.value) })));
      body.append(label);
    }
  }
  for (const entry of candidate.evidence) {
    const quote = make("blockquote", "todo-candidate-evidence", `“${entry.excerpt}”`);
    const material = batch.materials[entry.material - 1];
    quote.append(make("small", "", ` — ${material ? material.title : uiText.text("todo.source.material")}`));
    body.append(quote);
  }
  if (candidate.uncertain.length) body.append(make("p", "todo-candidate-uncertain", uiText.text("todo.review.uncertain") + candidate.uncertain.join(uiText.text("common.punctuation.semicolon"))));
  if (choice.editing && !candidate.decision) body.append(renderEditor(page, candidate, choice, due, planned));
  const actions = make("div", "todo-candidate-actions");
  if (candidate.decision) actions.append(make("span", `mw-status mw-status--${candidate.decision.action === "ignored" ? "quiet" : "done"}`, decidedAs[candidate.decision.action]));
  else {
    if (actionFor(candidate) === "add") {
      const edit = make("button", "mw-btn mw-btn--ghost", choice.editing ? uiText.text("todo.review.collapse") : uiText.text("todo.review.edit"));
      edit.type = "button";
      edit.dataset.todoCandidateEditToggle = candidate.candidate_id;
      actions.append(edit);
    }
    const ignore = make("button", "mw-btn mw-btn--ghost", uiText.text("todo.review.ignore"));
    ignore.type = "button";
    ignore.dataset.todoCandidateIgnore = candidate.candidate_id;
    actions.append(ignore);
  }
  row.append(pick, body, actions);
  return row;
}

/** One organizing batch: what was read, each candidate, and the foot that applies the kept ones. */
export function renderBatchSection(page: TodoPage, batch: TodoBatch): HTMLElement {
  const section = make("section", "todo-batch-review");
  section.dataset.todoBatchReview = batch.batch_id;
  const open = batch.candidates.filter((candidate) => !candidate.decision).length;
  const head = make("header", "todo-batch-head");
  head.append(make("h2", "", batch.title), make("small", "", `${uiText.text("todo.review.open-count", { count: open })} · ${page.timeLabel(batch.created_at)}`));
  section.append(head);
  for (const line of batch.notes) section.append(make("p", "todo-muted", line));
  const read = make("details", "todo-batch-materials");
  read.append(make("summary", "", uiText.text("todo.review.read-count", { count: batch.materials.length })));
  for (const material of batch.materials) {
    read.append(make("p", "todo-muted", material.title + (material.read === "read" ? "" : material.read === "failed" ? uiText.text("todo.review.not-read") : uiText.text("todo.review.partly-read"))));
  }
  section.append(read);
  for (const candidate of batch.candidates) section.append(renderCandidate(page, batch, candidate));
  if (batch.reference_only.length) {
    const reference = make("details", "todo-batch-reference");
    reference.append(make("summary", "", uiText.text("todo.review.reference-count", { count: batch.reference_only.length })));
    for (const entry of batch.reference_only) reference.append(make("p", "todo-muted", `${entry.summary} — ${batch.materials[entry.material - 1]?.title ?? ""}`));
    section.append(reference);
  }
  const foot = make("footer", "todo-batch-foot");
  const label = applyLabel(page, batch);
  const apply = make("button", "mw-btn mw-btn--primary", label || uiText.text("todo.review.pick-first"));
  apply.type = "button";
  apply.dataset.todoApply = batch.batch_id;
  apply.disabled = !label;
  const rest = batch.candidates.filter((candidate) => !candidate.decision && !choiceFor(page, candidate).picked).length;
  const ignoreRest = make("button", "mw-btn mw-btn--ghost", uiText.text("todo.review.ignore-rest", { count: rest }));
  ignoreRest.type = "button";
  ignoreRest.dataset.todoIgnoreRest = batch.batch_id;
  ignoreRest.hidden = rest === 0;
  const close = make("button", "mw-btn mw-btn--ghost", uiText.text("todo.review.put-away"));
  close.type = "button";
  close.dataset.todoCloseBatch = batch.batch_id;
  foot.append(apply, ignoreRest, close);
  section.append(foot);
  return section;
}
