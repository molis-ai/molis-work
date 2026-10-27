import { ActionError, resolveActionSubject, retainActionAuthority, requireSynchronous,
  type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { KnowledgeCardRecord } from "@molis-ai/molis-work-contracts/services/knowledge";
import { readSubjectRetention } from "@molis-ai/molis-work-service-search";
import type { KnowledgeAccess, KnowledgePiece } from "@molis-ai/molis-work-service-knowledge";

/** One organizing attempt keeps its original authority through dispatch and settlement. Archive only permits settlement. */
export async function knowledgeSourceAuthority(access: KnowledgeAccess, source: ActionReference, piece: KnowledgePiece, card: KnowledgeCardRecord) {
  const caller = retainActionAuthority(access.caller, source);
  const identity = { project_id: card.project_id, provider_id: piece.provider_id, subject: piece.subject,
    ...(piece.retention ? { retention: piece.retention } : {}) };
  const installation = async () => {
    if (!card.adoption) return true;
    return (await access.client.discover(caller)).some(view => view.provider.provider_id === piece.provider_id && view.availability.available
      && view.provider.plugin_installation_generation === card.adoption!.generation)
      && (!piece.retention || piece.retention.generation === card.adoption.generation);
  };
  if (!await installation()) return null;
  const initial = await readSubjectRetention({ ...access, caller }, identity);
  if (initial.state !== "active" && initial.state !== "unsupported") return null;
  const original = await resolveActionSubject(access.client, caller, piece.subject);
  if (original.context.revision !== piece.revision || original.reader.provider_id !== piece.provider_id) return null;
  const assertCurrent = () => requireSynchronous(caller.assert_authority_current?.(original.reader));
  const check = async (dispatch: boolean): Promise<boolean> => {
    try {
      await caller.validate_authority?.(original.reader);
      const current = await readSubjectRetention({ ...access, caller }, identity);
      if (!dispatch && current.state === "temporarily_archived") { assertCurrent(); return current.retained.content_revision === piece.revision; }
      if (current.state !== "active" && current.state !== "unsupported") return false;
      const { context, reader } = await resolveActionSubject(access.client, caller, piece.subject);
      if (reader.provider_id !== original.reader.provider_id || reader.capability_id !== original.reader.capability_id
        || reader.version !== original.reader.version || context.revision !== piece.revision) return false;
      // The body read itself may await an owner. Recheck the lifecycle after it and at the actual model dispatch gate.
      if (!await installation()) return false;
      const final = await readSubjectRetention({ ...access, caller }, identity);
      if (!await installation()) return false;
      assertCurrent();
      if (!dispatch && final.state === "temporarily_archived") return final.retained.content_revision === piece.revision;
      if (final.state !== "active" && final.state !== "unsupported") return false;
      return !dispatch || final.state !== "active" || !final.retained || final.retained.content_revision !== null && final.retained.content_revision !== piece.revision
        || final.retained.restoration_operation_id === card.retention?.restoration_operation_id;
    } catch { return false; }
  };
  if (!await check(true)) return null;
  return { assertCurrent, current: () => check(false), beforeDispatch: async () => {
    if (!await check(true)) throw new ActionError("actions.subject_unavailable", "资料已归档、变化或原授权已失效，未发给模型");
  } };
}
