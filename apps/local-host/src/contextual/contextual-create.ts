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
 * works use it). It stays here, in memory, behind a token (S-39): spent once, only by the same person in the same project, within
 * 30 minutes, and only while the undo's provider is still the installation that made the thing; a restart forgets it. The page
 * never names an undo, and the undo runs through the person's own actions, like any other call.
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
/** Whose undo it is: the project the page belongs to and the person whose authority made the thing. */
export interface UndoOwner { readonly project: string; readonly actor: string }
const undos = new Map<string, UndoOwner & { at: number; install: string; reference: ActionReference & { provider_id: string }; input: Record<string, unknown> }>();

/** The installation a provider's calls come from, as its registration names it. */
const installOf = (views: readonly ActionView[], reference: ActionReference & { provider_id: string }): string | undefined => {
  const view = views.find(item => item.capability_id === reference.capability_id && item.version === reference.version && item.provider.provider_id === reference.provider_id);
  return view && view.availability.available ? view.provider.plugin_install_id ?? view.provider.provider_id : undefined;
};

/** Whether the drafted entry may be created without a card: the same rule as the Assistant's (an undo offered now), and nothing left to confirm. */
function direct(view: ActionView, views: readonly ActionView[], draft: ContextualDraft): boolean {
  const intake = view.action.intake;
  return !!intake && intake.effect !== "proposes" && !intake.multiple && draft.missing.length === 0 && directEligible(view, views, new Set());
}

export async function createChosen(owner: UndoOwner, views: readonly ActionView[], focus: SurfaceFocus, landing: SurfaceLanding | undefined, key: string, requestId: string,
  context: DraftRequestContext): Promise<ContextualCreated> {
  const draft = await draftChosen(views, focus, landing, key, undefined, requestId, context);
  const view = views.find(item => item.capability_id === draft.action.capability_id && item.version === draft.action.version && item.provider.provider_id === draft.action.provider_id);
  if (!view || !direct(view, views, draft)) return { created: false, draft };
  const output = await context.actions.invoke(draft.action, draft.input);
  const subject = actionResultSubject(view.action, draft.input, output)?.subject;
  const undo = declaredUndo(view, output), install = undo && installOf(views, undo.reference);
  return { created: true, draft, ...(subject ? { subject } : {}), ...(undo && install ? { undo_token: keep(owner, install, undo) } : {}) };
}

function keep(owner: UndoOwner, install: string, undo: { reference: ActionReference & { provider_id: string }; input: Record<string, unknown> }): string {
  const token = randomUUID();
  for (const [key, held] of undos) if (Date.now() - held.at > UNDO_TTL_MS || undos.size >= MAX_UNDOS) undos.delete(key); else break;
  undos.set(token, { project: owner.project, actor: owner.actor, at: Date.now(), install, ...undo });
  return token;
}

/**
 * 「撤销」 on what the bar just created: the owner's undo, through the person's own actions; the owner refuses one that no longer
 * applies. A token of another project or person is refused without being spent; once its owner presents it, it is spent, also
 * when the undo is then refused.
 */
export async function undoCreated(owner: UndoOwner, token: string, actions: DraftRequestContext["actions"], now = Date.now()): Promise<{ undone: true }> {
  const held = undos.get(token);
  const gone = () => contextualErrors.stale("这次新建已不能在这里撤销，请到原处修改");
  if (!held || held.project !== owner.project || held.actor !== owner.actor) throw gone();
  undos.delete(token);
  if (now - held.at > UNDO_TTL_MS || installOf(await actions.discover(), held.reference) !== held.install) throw gone();
  await actions.invoke(held.reference, held.input);
  return { undone: true };
}
