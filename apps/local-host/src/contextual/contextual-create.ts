import { randomUUID } from "node:crypto";
import { actionResultSubject, type ActionReference, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ContextualDraft, SurfaceFocus, SurfaceLanding } from "@molis-ai/molis-work-contracts/services/contextual";
import { declaredUndo } from "../action-undo.js";
import { directEligible } from "../assistant/assistant-authority.js";
import { draftChosen, type DraftRequestContext } from "./contextual-draft.js";
import { contextualErrors } from "./contextual-request.js";

/**
 * A creation entry chosen on the bar (context-program W4, quick-create §8 point 3): the passage is drafted into the entry's own
 * action, and then the declaration decides. A command whose owner declared how it is undone, and whose draft has every required
 * field, runs at once with the person's authority, and the bar offers 「撤销」; anything else (no undo, a proposal, several
 * Items, a field the draft could not fill) comes back as the draft, for the page to show as a card the person confirms.
 *
 * The undo is the owner's own undo command with the input this creation's output gives (`declaredUndo`, as the Assistant's
 * works use it). It stays here, behind a token that only this project's pages can spend, once: the page never names an undo.
 */
export interface ContextualCreated {
  readonly created: boolean;
  readonly draft: ContextualDraft;
  /** The Item it created, when the action names it. */
  readonly subject?: ActionSubject;
  /** Spends the undo of this creation, once (`/api/contextual/undo`). */
  readonly undo_token?: string;
}

const UNDO_TTL_MS = 30 * 60_000;
const MAX_UNDOS = 50;
const undos = new Map<string, { scope: string; at: number; reference: ActionReference; input: Record<string, unknown> }>();

function keep(scope: string, undo: { reference: ActionReference; input: Record<string, unknown> }): string {
  const token = randomUUID();
  for (const [key, held] of undos) if (Date.now() - held.at > UNDO_TTL_MS || undos.size >= MAX_UNDOS) undos.delete(key); else break;
  undos.set(token, { scope, at: Date.now(), ...undo });
  return token;
}

/** Whether the drafted entry may be created without a card: the same rule as the Assistant's (an undo offered now), and nothing left to confirm. */
function direct(view: ActionView, views: readonly ActionView[], draft: ContextualDraft): boolean {
  const intake = view.action.intake;
  return !!intake && intake.effect !== "proposes" && !intake.multiple && draft.missing.length === 0 && directEligible(view, views, new Set());
}

export async function createChosen(scope: string, views: readonly ActionView[], focus: SurfaceFocus, landing: SurfaceLanding | undefined, key: string, requestId: string,
  context: DraftRequestContext): Promise<ContextualCreated> {
  const draft = await draftChosen(views, focus, landing, key, undefined, requestId, context);
  const view = views.find(item => item.capability_id === draft.action.capability_id && item.version === draft.action.version && item.provider.provider_id === draft.action.provider_id);
  if (!view || !direct(view, views, draft)) return { created: false, draft };
  const output = await context.actions.invoke(draft.action, draft.input);
  const subject = actionResultSubject(view.action, draft.input, output)?.subject;
  const undo = declaredUndo(view, output);
  return { created: true, draft, ...(subject ? { subject } : {}), ...(undo ? { undo_token: keep(scope, undo) } : {}) };
}

/** 「撤销」 on what the bar just created: the owner's undo, through the person's own actions; the owner refuses one that no longer applies. */
export async function undoCreated(scope: string, token: string, actions: DraftRequestContext["actions"]): Promise<{ undone: true }> {
  const held = undos.get(token);
  if (!held || held.scope !== scope || Date.now() - held.at > UNDO_TTL_MS) throw contextualErrors.stale("这次新建已不能在这里撤销，请到原处修改");
  undos.delete(token);
  await actions.invoke(held.reference, held.input);
  return { undone: true };
}
