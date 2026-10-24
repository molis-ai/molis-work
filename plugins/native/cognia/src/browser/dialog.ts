import { button, esc } from "./dom.js";
import { ROLE_KEY, STATUS_KEY } from "./labels.js";
import { domainSelect, field, options } from "./list.js";
import { renderMarkdown, renderReferences } from "./markdown.js";
import { fail, q, tx, type CogniaPage } from "./page.js";
import type { Draft, Flow, ImportEntry } from "./types.js";

/** Opens the dialog on a step. `title` and `label` are keys; `html` is drawn by the caller. */
export function show(page: CogniaPage, title: string, kind: Flow, html: string, label: string): void {
  if (!page.dialog.open) page.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  page.flow = kind;
  page.content.innerHTML = html;
  q(page, "#cognia-dialog-title").textContent = page.L(title);
  page.submit.textContent = page.L(label);
  page.submit.hidden = false;
  q(page, "[data-cognia-step]").textContent = "";
  fail(page, "");
  if (!page.dialog.open) page.dialog.showModal();
}

export function setBusy(page: CogniaPage, on: boolean): void {
  page.busy = on;
  page.form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>("input,select,textarea,button").forEach((control) => { control.disabled = on; });
  page.form.setAttribute("aria-busy", String(on));
}

/** Closes the dialog; a preview nobody confirmed is cancelled first. A busy dialog stays. */
export async function closeDialog(page: CogniaPage): Promise<void> {
  if (page.busy) return;
  if (page.preview && !page.receipt) await page.api("/import/cancel", { preview_id: page.preview.id });
  page.dialog.close();
  page.returnFocus?.focus();
}

export function setStep(page: CogniaPage, key: string): void {
  q(page, "[data-cognia-step]").textContent = key ? page.L(key) : "";
}

/** The preview or receipt as a table: each file, its kind, and what happens to it or why it is left out. */
export function entryTable(page: CogniaPage, entries: readonly ImportEntry[]): string {
  const rows = entries.map((entry) =>
    `<tr><td>${esc(entry.path)}</td><td>${entry.role ? tx(page, ROLE_KEY[entry.role]) : "—"}</td><td>${tx(page, STATUS_KEY[entry.status])}${entry.reason ? " · " + esc(page.L(entry.reason)) : ""}</td></tr>`);
  return `<table class="cognia-preview"><thead><tr><th>${tx(page, "cognia.import.path")}</th><th>${tx(page, "cognia.import.kind")}</th><th>${tx(page, "cognia.import.status")}</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function importGuides(page: CogniaPage): string {
  return `<details><summary>${tx(page, "cognia.import.guides-title")}</summary><p class="cognia-hint">${tx(page, "cognia.import.guide-tools")}</p><p class="cognia-hint">${tx(page, "cognia.import.guide-limits")}</p></details>`;
}

export function showImport(page: CogniaPage): void {
  page.preview = null;
  page.receipt = null;
  const kinds = '<select class="mw-select" name="kind"><option value="obsidian">Obsidian</option><option value="llm-wiki">LLM Wiki</option><option value="markdown">Markdown</option></select>';
  const uploads = `<select class="mw-select" name="source_id">${options(page, page.state.sources.filter((s) => s.locator === "upload"), "cognia.import.new-source")}</select>`;
  show(page, "cognia.action.import", "import", `<p class="cognia-hint">${tx(page, "cognia.import.hint")}</p>`
    + field(page, "cognia.import.format", kinds) + field(page, "cognia.field.domain", domainSelect(page)) + field(page, "cognia.import.upload-source", uploads)
    + field(page, "cognia.import.choose-folder", '<input type="file" name="files" webkitdirectory multiple>')
    + `<p class="cognia-hint">${tx(page, "cognia.import.folder-hint")}</p>${importGuides(page)}`, "cognia.import.preview");
  setStep(page, "cognia.import.steps");
}

export function showAdd(page: CogniaPage): void {
  show(page, "cognia.action.add", "add", field(page, "cognia.field.title", '<input class="mw-input" name="title" required maxlength="500">') + field(page, "cognia.field.domain", domainSelect(page))
    + field(page, "cognia.field.body", '<textarea class="mw-textarea" name="body" rows="10"></textarea>'), "cognia.add.save");
}

export function showDomain(page: CogniaPage): void {
  show(page, "cognia.action.new-domain", "domain", field(page, "cognia.domain.name", '<input class="mw-input" name="name" required maxlength="120">'), "cognia.domain.create");
}

export function showEdit(page: CogniaPage): void {
  const { cur } = page;
  if (!cur) return;
  show(page, "cognia.edit.title", "edit", field(page, "cognia.field.title", `<input class="mw-input" name="title" required maxlength="500" value="${esc(cur.title)}">`) + field(page, "cognia.field.domain", domainSelect(page))
    + field(page, "cognia.field.body", `<textarea class="mw-textarea" name="body" rows="10">${esc(cur.body)}</textarea>`), "cognia.edit.save");
  q<HTMLSelectElement>(page, "[name=domain_id]").value = cur.domain_id || "";
}

/** The draft the model wrote, to read before it is saved: its text, the sources it cites, and a way to drop it. */
export function showDraft(page: CogniaPage, draft: Draft): void {
  page.draft = draft;
  show(page, "cognia.draft.title", "review", `<h3>${esc(draft.title)}</h3><p class="cognia-hint">${tx(page, "cognia.draft.review-hint")}</p><article class="cognia-body">${renderMarkdown(draft.body, page.L, [], draft.references)}</article>`
    + renderReferences(draft.references, page.L) + button(page.L("cognia.draft.remove"), "delete-draft", `data-id="${esc(draft.id)}"`),
  draft.saved_id ? "cognia.draft.open-saved" : "cognia.draft.save");
}

export function showDrafts(page: CogniaPage): void {
  const drafts = page.state.drafts;
  show(page, "cognia.action.drafts", "drafts", drafts.length
    ? drafts.map((d) => button(`${d.title} · ${page.L(d.saved_id ? "cognia.draft.saved" : "cognia.draft.pending")}`, "draft", `data-id="${esc(d.id)}"`)).join("")
    : `<p>${tx(page, "cognia.draft.none")}</p>`, "cognia.dialog.close");
  page.submit.hidden = true;
}

/** Asking the model: `query` searches the domain for the answer; otherwise the chosen materials (fixed versions) are synthesized. */
export function showAi(page: CogniaPage, action: "synthesize" | "synthesize-current" | "query", refs: readonly { id: string; revision: number | undefined }[]): void {
  const query = action === "query";
  show(page, query ? "cognia.action.query" : "cognia.action.synthesize", "ai", `<p class="cognia-hint">${tx(page, query ? "cognia.ai.query-hint" : "cognia.ai.synthesize-hint")}</p>`
    + field(page, "cognia.ai.question", `<textarea class="mw-textarea" name="question" rows="3" ${query ? "required" : ""}></textarea>`), "cognia.ai.generate");
  page.content.dataset.mode = query ? "query" : "synthesize";
  page.content.dataset.refs = JSON.stringify(refs);
}
