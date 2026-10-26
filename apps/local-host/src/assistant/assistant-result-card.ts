import { randomUUID } from "node:crypto";
import { actionEffect, presentActionResult, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantStore, StoredWork } from "./assistant-store.js";

/** A directly executed command's declared entry stays usable even when the model omits it from its answer. */
export function recordAssistantResultCard(store: Pick<AssistantStore, "addCard" | "rounds">, work: StoredWork, view: ActionView, output: unknown, now: Date): void {
  const presentation = presentActionResult(view.action.result_view, output, work.project_ref?.project_id);
  if (view.operation !== "command" || !presentation?.link) return;
  const at = now.toISOString();
  store.addCard({ card_id: `card-${randomUUID()}`, work_id: work.work_id, run_id: store.rounds(work.work_id).at(-1)?.run_id ?? null,
    revision: 1, status: "done", title: view.action.title, summary: presentation.summary, provider: view.provider.title,
    capability_title: view.action.title, effect: actionEffect(view.action, view.capability_id),
    reference: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id },
    input: {}, input_schema: {}, editable: [], missing: [], outcome: presentation.summary, presentation, created_at: at, updated_at: at });
}
