import type { ActionReference, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { pathValue } from "./assistant/assistant-jobs.js";

/**
 * The call that takes a finished command back, as the command declared it (`undo`): its owner's own undo command, with the
 * input read from this command's output. Null when the command declares none, or its output does not say what to undo:
 * nothing is offered rather than an undo that might hit something else. The Assistant's works and the bar's 「撤销」 use it.
 */
export function declaredUndo(view: ActionView, output: unknown): { reference: ActionReference & { provider_id: string }; input: Record<string, unknown> } | null {
  const undo = view.action.undo;
  if (!undo || view.operation !== "command") return null;
  const input: Record<string, unknown> = {};
  for (const [field, path] of Object.entries(undo.input)) {
    const value = pathValue(output, Array.isArray(path) ? path[0]! : path as string);
    if (value === undefined || value === null || value === "") return null;
    input[field] = Array.isArray(path) ? [value] : value;
  }
  return { reference: { capability_id: undo.capability_id, version: undo.version, provider_id: view.provider.provider_id }, input };
}
