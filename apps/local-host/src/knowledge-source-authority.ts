import { ActionError, actionSourceIdentity, sameActionSourceIdentity, resolveActionSubject, retainActionAuthority, requireSynchronous,
  type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { KnowledgeCardRecord } from "@molis-ai/molis-work-contracts/services/knowledge";
import { readSubjectRetention } from "@molis-ai/molis-work-service-search";
import type { KnowledgeAccess, KnowledgePiece } from "@molis-ai/molis-work-service-knowledge";

/** One organizing attempt keeps its original authority through dispatch and settlement. Archive only permits settlement. */
export async function knowledgeSourceAuthority(access: KnowledgeAccess, source: ActionReference, piece: KnowledgePiece, card: KnowledgeCardRecord) {
  const caller = retainActionAuthority(access.caller, source);
  const identity = { project_id: card.project_id, provider_id: piece.provider_id, subject: piece.subject, expected_revision: piece.revision,
    ...(piece.retention ? { retention: piece.retention } : {}) };
  const trustedSource = piece.retention?.source_identity ?? card.adoption?.source_identity;
  const capture = () => {
    if (!trustedSource) return () => {};
    if (!access.client.captureSources) throw new ActionError("actions.unavailable", "当前资料来源缺少同步状态校验能力");
    return access.client.captureSources([{ context: caller, references: [{ ...source, provider_id: piece.provider_id }] }]);
  };
  let sourceCurrent = capture(), prepared = false;
  const installation = async () => {
    if (!card.adoption) return true;
    return (await access.client.discover(caller)).some(view => view.provider.provider_id === piece.provider_id && view.availability.available
      && sameActionSourceIdentity(actionSourceIdentity(view.provider, card.project_id), card.adoption!.source_identity))
      && (!piece.retention || sameActionSourceIdentity(piece.retention.source_identity, card.adoption.source_identity));
  };
  if (!await installation()) return null;
  const initial = await readSubjectRetention({ ...access, caller }, identity);
  if (initial.state !== "active" && initial.state !== "unsupported") return null;
  const original = await resolveActionSubject(access.client, caller, piece.subject);
  if (original.context.revision !== piece.revision || original.reader.provider_id !== piece.provider_id) return null;
  sourceCurrent();
  const assertCurrent = () => {
    if (!prepared) throw new ActionError("actions.unavailable", "资料来源尚未完成本次核验");
    requireSynchronous(caller.assert_authority_current?.(original.reader)); sourceCurrent();
  };
  const check = async (dispatch: boolean): Promise<boolean> => {
    prepared = false;
    try {
      // A settlement starts a fresh observation; an allowed same-content archive during the model is not replayed or rejected by an old stamp.
      const currentSource = capture();
      await caller.validate_authority?.(original.reader);
      const current = await readSubjectRetention({ ...access, caller }, identity);
      if (!dispatch && current.state === "temporarily_archived") {
        requireSynchronous(caller.assert_authority_current?.(original.reader)); currentSource(); sourceCurrent = currentSource;
        prepared = current.retained.content_revision === piece.revision;
        return prepared;
      }
      if (current.state !== "active" && current.state !== "unsupported") return false;
      const { context, reader } = await resolveActionSubject(access.client, caller, piece.subject);
      if (reader.provider_id !== original.reader.provider_id || reader.capability_id !== original.reader.capability_id
        || reader.version !== original.reader.version || context.revision !== piece.revision) return false;
      // The body read itself may await an owner. Recheck the lifecycle after it and at the actual model dispatch gate.
      if (!await installation()) return false;
      const final = await readSubjectRetention({ ...access, caller }, identity);
      if (!await installation()) return false;
      requireSynchronous(caller.assert_authority_current?.(original.reader)); currentSource(); sourceCurrent = currentSource;
      if (!dispatch && final.state === "temporarily_archived") { prepared = final.retained.content_revision === piece.revision; return prepared; }
      if (final.state !== "active" && final.state !== "unsupported") return false;
      prepared = !dispatch || final.state !== "active" || !final.retained || final.retained.content_revision !== null && final.retained.content_revision !== piece.revision
        || final.retained.restoration_operation_id === card.retention?.restoration_operation_id;
      return prepared;
    } catch { return false; }
  };
  if (!await check(true)) return null;
  return { assertCurrent, current: () => check(false), beforeDispatch: async () => {
    if (!await check(true)) throw new ActionError("actions.subject_unavailable", "资料已归档、变化或原授权已失效，未发给模型");
    assertCurrent();
  } };
}
