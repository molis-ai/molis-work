import { clearResultSelection } from "./result-selection.js";
import { drawForm } from "./form-drafts.js";
import type { ConflictDraft, PreparedEdit } from "./editing.js";
import type { GitPage } from "./page.js";
import type { OperationRecord } from "./types.js";

/** Store only the original edit and operation identity, before preparing. Outcomes always come from Host operations. */
export async function rememberOperation(page: GitPage, operationId: string, operation: { action: string } & Record<string, unknown>): Promise<void> {
  const form = page.formDraft;
  if (!form?.entry.value || form.workspace !== page.scWorkspace) throw new Error(globalThis.t.text("git.draft.not-ready"));
  const fields: PreparedEdit["fields"] = operation.action === "commit" ? { message: String(operation.message) }
    : operation.action === "branch-create" ? { branchName: String(operation.name) }
    : operation.action === "pr-create" ? { prTitle: String(operation.title), prBody: String(operation.body) } : {};
  const conflict = operation.action === "resolve" ? page.conflictDraft : null;
  if (!Object.keys(fields).length && !conflict) return;
  const saved = conflict?.entry.saved;
  const reference: PreparedEdit = { operation_id: operationId, action: operation.action, fields,
    ...conflict?.entry.value ? { conflict: { path: conflict.path, key: conflict.entry.key,
      snapshot: { base: conflict.entry.value.base, text: String(operation.content) } } } : {} };
  await saved;
  await page.drafts!.write(form.entry, { ...form.entry.value, prepared: [...form.entry.value.prepared, reference] });
}

/** Only a known pre-review refusal (or an undispatched request) has no owner outcome to reconcile. Keep its actual edit. */
export function forgetUnsentOperation(page: GitPage, form: GitPage["formDraft"], operationId: string): void {
  if (!form?.entry.value?.prepared.some(item => item.operation_id === operationId)) return;
  page.drafts!.edit(form.entry, { ...form.entry.value, prepared: form.entry.value.prepared.filter(item => item.operation_id !== operationId) });
}

/** A late receipt may remove its own submitted text, never text edited after it. Missing/unknown records keep the association. */
export async function reconcileEdits(page: GitPage, operations: readonly OperationRecord[]): Promise<void> {
  const form = page.formDraft;
  if (!form?.entry.value) return;
  for (const reference of form.entry.value.prepared) {
    const record = operations.find(item => item.operation_id === reference.operation_id);
    if (!record || ["pending", "running", "unknown"].includes(record.outcome)) continue;
    if (record.outcome === "succeeded" && reference.conflict) {
      const saved = await page.drafts!.read<ConflictDraft>(reference.conflict.key);
      if (saved.value?.base === reference.conflict.snapshot.base && saved.value.text === reference.conflict.snapshot.text) {
        if (page.conflictDraft?.entry === saved) {
          // The owner has resolved this exact text. End this editor before deleting its cache so it cannot accept unsaved input.
          clearResultSelection(page);
        }
        await page.drafts!.write(saved, null);
      }
    }
    // An awaited conflict write may have overlapped another edit or preparation of this workspace.
    const value = { ...form.entry.value, prepared: form.entry.value.prepared.filter(item => item !== reference) };
    if (record.outcome === "succeeded" && Object.entries(reference.fields).every(([key, text]) => value[key as keyof PreparedEdit["fields"]] === text)) {
      for (const key of Object.keys(reference.fields) as (keyof PreparedEdit["fields"])[]) value[key] = "";
    }
    const saving = page.drafts!.write(form.entry, value);
    if (page.formDraft === form && page.lifetime.alive) drawForm(page, value);
    await saving;
  }
}
