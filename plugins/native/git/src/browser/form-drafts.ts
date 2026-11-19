import { EditorDrafts, emptyForm, formKey, type FormDraft, type DraftEntry } from "./editing.js";
import { active, inFolder } from "./page.js";
import type { GitPage } from "./page.js";
import { refresh } from "./list.js";
import type { SummaryAnswer } from "./types.js";

const uiText = globalThis.t;
const textFields = { message: "commit-message", branchName: "branch-name", prTitle: "pr-title", prBody: "pr-body", prBase: "pr-base" } as const;
const checks = { checkout: "branch-checkout", prDraft: "pr-draft" } as const;

export function drawForm(page: GitPage, value: FormDraft): void {
  for (const [key, selector] of Object.entries(textFields)) page.s<HTMLInputElement>(`[data-git-${selector}]`).value = value[key as keyof typeof textFields];
  for (const [key, selector] of Object.entries(checks)) page.s<HTMLInputElement>(`[data-git-${selector}]`).checked = value[key as keyof typeof checks];
  page.s("[data-git-pr-base]").dataset.chosen = String(Boolean(value.prBase));
}

/** Remember every real or programmatic edit at its owner, before handing the write to the platform. */
export function rememberForm(page: GitPage): void {
  const current = page.formDraft;
  if (!current || current.workspace !== page.scWorkspace || !current.entry.value) return;
  const value = { ...current.entry.value };
  for (const [key, selector] of Object.entries(textFields)) value[key as keyof typeof textFields] = page.s<HTMLInputElement>(`[data-git-${selector}]`).value;
  for (const [key, selector] of Object.entries(checks)) value[key as keyof typeof checks] = page.s<HTMLInputElement>(`[data-git-${selector}]`).checked;
  page.drafts!.edit(current.entry, value);
}

export function resetEditors(page: GitPage): void {
  page.formDraft = null; page.conflictDraft = null;
  page.lastPrepared = null; page.summary = null; page.scWorkspace = ""; page.sc.hidden = true;
  page.conflictEditor.hidden = true; page.conflictText.value = "";
  drawForm(page, emptyForm());
}

export async function loadForm(page: GitPage, workspace: string, epoch: number): Promise<boolean> {
  if (page.formDraft?.workspace === workspace) return true;
  for (const selector of [...Object.values(textFields), ...Object.values(checks)]) page.s<HTMLInputElement>(`[data-git-${selector}]`).disabled = true;
  const entry = await page.drafts!.read<FormDraft>(formKey(workspace));
  if (!active(page, epoch) || page.scWorkspace !== workspace) return false;
  entry.value ??= emptyForm();
  page.formDraft = { workspace, entry }; drawForm(page, entry.value);
  for (const selector of [...Object.values(textFields), ...Object.values(checks)]) page.s<HTMLInputElement>(`[data-git-${selector}]`).disabled = false;
  return true;
}

export function updateDraftButton(page: GitPage): void {
  const button = page.s<HTMLButtonElement>("[data-git-commit-draft]");
  const suggestion = page.formDraft?.entry.value?.suggestion;
  button.hidden = button.disabled = !suggestion && !page.draft;
  button.textContent = uiText.text(suggestion ? "git.commit.use-suggestion" : "git.commit.draft");
}

/** The borrowed client receives text explicitly; storage keys are Git's own implementation detail. */
export async function offerCommitDraft(page: GitPage, workspace: string, message: string): Promise<"applied" | "suggested"> {
  page.lifetime.assertCurrent();
  const target = await page.host.request(inFolder("/summary", workspace), "GET", undefined, page.lifetime.signal) as SummaryAnswer;
  page.lifetime.assertCurrent();
  if (target.workspace.workspace_id !== workspace || !target.summary) throw new Error(uiText.text("git.commit.workspace-unavailable"));
  const entry: DraftEntry<FormDraft> = await page.drafts!.read(formKey(workspace));
  page.lifetime.assertCurrent();
  const previous = entry.value ?? emptyForm(), applied = !previous.message.trim();
  const value = { ...previous, ...applied ? { message, suggestion: "" } : { suggestion: message } };
  const saving = page.drafts!.write(entry, value);
  if (page.formDraft?.entry === entry) { drawForm(page, value); updateDraftButton(page); }
  await saving;
  return applied ? "applied" : "suggested";
}

export function installFormDrafts(page: GitPage): void {
  const status = page.s("[data-git-draft-status]"), note = page.s("[data-git-draft-note]"), retry = page.s<HTMLButtonElement>("[data-git-draft-retry]");
  page.drafts = new EditorDrafts(page.host.drafts, (state, reason) => {
    if (!page.lifetime.alive) return;
    status.dataset.state = state; status.hidden = state === "ready"; retry.hidden = state !== "failed";
    note.textContent = state === "saving" ? uiText.text("git.draft.saving") : state === "failed" ? uiText.text("git.draft.failed", { reason }) : "";
  }, () => refresh(page));
  page.lifetime.listen(retry, "click", () => { void page.drafts!.retry().catch(() => {}); });
  for (const [key, selector] of Object.entries(textFields)) page.lifetime.listen(page.s(`[data-git-${selector}]`), key === "prBase" ? "change" : "input", () => rememberForm(page));
  for (const selector of Object.values(checks)) page.lifetime.listen(page.s(`[data-git-${selector}]`), "change", () => rememberForm(page));
}
