import { ActionError, isSubjectReader, retainActionAuthority, resolveActionSubject, type ActionCallContext, type ActionClient, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  SEARCH_PROVIDER_ID,
  searchActions,
  type SearchQueryRequest,
  type SearchQueryResponse,
  type SearchReferenceCandidate,
  type SearchReferencesRequest,
  type SearchReferencesResponse,
} from "@molis-ai/molis-work-contracts/services/search";

const DEFAULT_LIMIT = 8;

export interface ReferenceAccess {
  client: ActionClient;
  caller: ActionCallContext;
}

/**
 * One object as its owner has it now, read with the caller's own authority through the owner's subject reader; null when it
 * is gone, the caller may not read it, or no reader offers its kind. Multiple available readers explicitly refuse ambiguity.
 * Nothing else counts: an index entry, a title the
 * page or the model gave, or a reference the person picked earlier is not proof the object is still there for them.
 */
async function ownerRead(access: ReferenceAccess, subject: ActionSubject): Promise<{ label: string; revision: string } | null> {
  const nested = retainActionAuthority(access.caller, { ...searchActions.references, provider_id: SEARCH_PROVIDER_ID });
  try {
    const { context } = await resolveActionSubject(access.client, nested, subject);
    return { label: context.title || subject.id, revision: context.revision };
  } catch (error) {
    if (error instanceof ActionError && error.code === "actions.subject_ambiguous") throw error;
    return null;
  }
}

/**
 * Objects of the asked kinds a person may pick (specs/ai-interaction-experience H3): the caller's search finds them, only in
 * the caller's own project or the person's Home-scoped content, and each is read again from its owner before it is offered.
 * The context bar's landing targets read their candidates through the same pair (this and `confirmReferences`).
 */
export async function findReferenceCandidates(search: { query(access: ReferenceAccess, input: SearchQueryRequest): Promise<SearchQueryResponse> },
  access: ReferenceAccess, input: SearchReferencesRequest): Promise<SearchReferencesResponse> {
  const kinds = [...new Set(input.kinds)];
  // Refuse before indexing can call either source. Readback uses the same available-reader rule in resolveActionSubject.
  const views = await access.client.discover(access.caller);
  if (kinds.some(kind => views.filter(view => view.availability.available && isSubjectReader(view.action) && view.action.subject_kinds.includes(kind)).length > 1))
    throw new ActionError("actions.subject_ambiguous", "有多个能力提供此对象上下文，不能任意选择提供方");
  const limit = Math.min(20, Math.max(1, input.limit ?? DEFAULT_LIMIT));
  const found = await search.query(access, { query: input.query, kinds, scope: "project", limit });
  const seen = new Set<string>();
  const hits = found.hits.filter(hit => {
    const key = `${hit.subject.kind}\u0000${hit.subject.id}`;
    if (seen.has(key) || !kinds.includes(hit.subject.kind) || (hit.project_id !== null && hit.project_id !== access.caller.project_id)) return false;
    seen.add(key);
    return true;
  });
  const read = await Promise.all(hits.map(hit => ownerRead(access, hit.subject)));
  const candidates: SearchReferenceCandidate[] = hits.flatMap((hit, index) => {
    const now = read[index];
    return now ? [{ kind: hit.subject.kind, id: hit.subject.id, label: now.label, revision: now.revision, plugin_title: hit.plugin_title, snippet: hit.snippet }] : [];
  });
  return { status: found.status, candidates };
}

/**
 * Each picked object as its owner has it now for the caller (its label and revision), in the order given; null when it is
 * not of an allowed kind, is gone, or the caller may not read it. A landing the Assistant is told about is named from this.
 */
export async function readReferences(access: ReferenceAccess, picked: readonly ActionSubject[], kinds?: readonly string[]): Promise<({ label: string; revision: string } | null)[]> {
  return Promise.all(picked.map(subject => !kinds || kinds.includes(subject.kind) ? ownerRead(access, subject) : null));
}

/**
 * Whether each picked object is still one the caller may use, in the order given: of an allowed kind, and read from its owner
 * just now. The Host asks this right before a reference answer goes on to the run; a `false` keeps the answer back.
 */
export async function confirmReferences(access: ReferenceAccess, picked: readonly ActionSubject[], kinds?: readonly string[]): Promise<boolean[]> {
  return (await readReferences(access, picked, kinds)).map(read => read !== null);
}
