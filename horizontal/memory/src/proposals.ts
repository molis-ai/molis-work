import { isDeepStrictEqual } from "node:util";
import type { AgentMemoryMeta, AgentMemorySourceRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryApplies, MemoryApproval, MemoryBasis, MemoryCandidate, MemoryCandidateRecord, MemoryEvidenceInput, MemoryKind, MemoryLedgerPort, MemoryScope, MemorySource } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import type { MemoryOperations } from "./operations.js";
import type { MemoryPreferences } from "./preferences.js";
import type { MemoryQueries } from "./queries.js";
import type { MemoryScopeCommands } from "./scope-commands.js";
import { newMemoryClassification } from "./classification.js";
import { memoryErrors } from "./errors.js";
import { toEntryMeta } from "./facts.js";
import { formationReferenceAllowed } from "./formation.js";
import { placeOf } from "./places.js";
import { assertFormationFacts } from "./policy.js";
import { candidateView, CANDIDATE_TTL_MS, MAX_TEXT } from "./shapes.js";
import { looksLikeInstruction, looksLikeSecret, sameText, sameWords, similarity } from "./text.js";

/** An offer may leave at most three suggestions waiting for one work. */
const PENDING_PER_WORK = 3;
interface ProposalPorts {
  backend: Pick<MemoryBackendPort, "withCaller">;
  ledger: Pick<MemoryLedgerPort, "noteOwner" | "transaction" | "saveCandidate">;
  operations: Pick<MemoryOperations, "caller" | "find" | "begin" | "committed">;
  preferences: Pick<MemoryPreferences, "assertFormation">;
  queries: Pick<MemoryQueries, "candidateRecords">;
  scopes: Pick<MemoryScopeCommands, "located" | "prefsAt">;
  sourceAllowed(actor: string, scope: MemoryScope, owner: string, refs: readonly AgentMemorySourceRef[]): boolean;
}

/** Propose once under the original owner; the SDK owns creation and the ledger projects its same result. */
export class MemoryProposals {
  constructor(private readonly ports: ProposalPorts) {}

  async propose(caller: MemoryCaller, input: { scope: MemoryScope; text: string; kind: MemoryKind; applies?: MemoryApplies; basis: MemoryBasis; why: string;
    from: MemoryCandidate["from"]; hold_reason?: string | null; supersedes?: string | null; evidence?: MemoryEvidenceInput[] }, options: { gate?: boolean; classificationMeta?: Pick<AgentMemoryMeta, "classification" | "session_ref" | "namespace">; formal_expires_at?: string | null; sources?: readonly AgentMemorySourceRef[]; combines?: string } = {}): Promise<MemoryCandidate> {
    const p = this.ports;
    assertFormationFacts(input.basis, input.evidence);
    caller = p.operations.caller(caller);
    if (caller.character) caller = { ...caller, character: { ...caller.character } };
    const where = placeOf(caller, input.scope);
    p.preferences.assertFormation(caller.actor_id, where, input.from, options.gate === true);
    const text = input.text.trim();
    if (!text || text.length > MAX_TEXT) throw memoryErrors.invalid(`记忆内容要在 1–${MAX_TEXT} 字之间`);
    if (looksLikeSecret(text)) throw memoryErrors.invalid("这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
    // Candidate context is internal formation work; formal reads and the proposal retain the original caller.
    const candidateCaller: MemoryCaller = { ...caller, purpose: "management", source_use: caller.source_use === "learning" ? "learning" : "explicit" };
    const captured = await p.queries.candidateRecords(candidateCaller, input.scope, where.owner, { formation: true });
    const work = caller.work ?? null;
    if (options.sources && !p.sourceAllowed(caller.actor_id, input.scope, where.owner, options.sources)) throw memoryErrors.forbidden("这份来源已遗忘，不能重新形成候选");
    const prior = options.combines ? (await p.backend.withCaller(candidateCaller).candidates.list(input.scope, where.owner)).find(item => item.candidate_id === options.combines) : undefined;
    const entries = !p.operations.find(caller, "propose") || input.supersedes ? await p.scopes.located(caller, input.scope, where.owner) : [];
    const target = input.supersedes ? entries.find(item => item.entry.memory_id === input.supersedes) : undefined;
    caller.signal?.throwIfAborted();
    // All canonical reads have finished. Revoked candidates cannot influence deduplication or this work's quota.
    const prefs = p.scopes.prefsAt(caller.actor_id, where);
    const earlier = captured.filter(row => caller.person || formationReferenceAllowed(candidateCaller, prefs, input.scope, row.entry.meta, "form")).map(row => row.note);
    const combines = prior?.state === "pending" && prior.sources?.length && options.sources
      && prior.sources.every(old => options.sources!.some(ref => ref.event_id === old.event_id && ref.version === old.version))
      && options.sources.some(ref => !prior.sources!.some(old => old.event_id === ref.event_id))
      && earlier.some(note => note.candidate_id === prior.candidate_id && sameText(note.text, text) && note.kind === input.kind && isDeepStrictEqual(note.applies, input.applies ?? {}));
    if (options.combines && !combines && !p.operations.find(caller, "propose")) throw memoryErrors.conflict("合并来源需要当前候选与另一份独立原件");
    // Source accumulation creates a new candidate; it never edits the old candidate's immutable source identities.
    if (!p.operations.find(caller, "propose") && earlier.some(item => !(combines && item.candidate_id === options.combines) && item.state !== "expired" && (sameText(item.text, text)
      || (item.state === "pending" && work !== null && item.work?.work_id === work.work_id && similarity(item.text, text) >= 0.6))))
      throw memoryErrors.invalid("这条已经建议过了（用户认可、拒绝或还在等），不要再提");
    if (!p.operations.find(caller, "propose") && entries.some(located => sameWords(located.entry.text, text))) throw memoryErrors.invalid("已经记着这一条了");
    if (!p.operations.find(caller, "propose") && work && earlier.filter(item => item.work?.work_id === work.work_id && item.state === "pending").length >= PENDING_PER_WORK)
      throw memoryErrors.limit(`这项工作已有 ${PENDING_PER_WORK} 条建议在等用户，先不要再提`);
    const formalExpiry = options.formal_expires_at === undefined ? target?.meta.expires_at ?? null : options.formal_expires_at;
    if (formalExpiry !== null && !Number.isFinite(Date.parse(formalExpiry))) throw memoryErrors.invalid("候选的正式期限不合格");
    const retained: AgentMemoryMeta = options.classificationMeta ?? target?.entry.meta ?? newMemoryClassification(caller, formalExpiry);
    const mark = p.operations.begin(caller, "propose", { kind: "propose", scope: input.scope, owner: where.owner, expected_version: 0,
      ...(input.supersedes ? { memory_id: input.supersedes } : {}), formal_expires_at: formalExpiry });
    const at = mark.at;
    const evidence = input.evidence ?? [{ kind: "work" as const, text: input.why.trim().slice(0, 200), ...(work ? { ref: { kind: "work", id: work.work_id } } : {}), at }];
    const facts = { kind: input.kind, source: "accepted" as MemorySource, basis: input.basis, evidence, applies: input.applies ?? {}, expires_at: null, approved_by: { by: "person" } as MemoryApproval,
      plugin_id: caller.consumer === "plugin" ? caller.plugin_id ?? null : null };
    p.preferences.assertFormation(caller.actor_id, where, input.from, options.gate === true);
    if (where.scope === "character" && caller.character) p.ledger.noteOwner({ scope: "character", owner: where.owner, project_id: where.project, title: caller.character.title, subject: caller.character.id });
    const classified = toEntryMeta({ ...facts, plugin_id: retained.namespace ?? facts.plugin_id }, retained);
    const held = await p.backend.withCaller(caller).candidates.propose({ scope: input.scope, owner: where.owner, text, origin: `建议 · ${input.from}`, tags: [input.from, input.kind], meta: { ...classified, expires_at_ms: Math.min(formalExpiry ? Date.parse(formalExpiry) : Infinity, Date.parse(at) + CANDIDATE_TTL_MS) },
      ...(options.sources?.length ? { sources: [...options.sources] } : {}),
      expected_version: 0, operation_id: mark.operation_id, ...(caller.signal ? { signal: caller.signal } : {}) });
    const record: MemoryCandidateRecord = { candidate_id: held.candidate_id, version: held.version,
      classification: held.meta.classification ?? null, waiting_expires_at: new Date(Math.min(held.created_at_ms + CANDIDATE_TTL_MS, held.meta.expires_at_ms ?? Infinity)).toISOString(),
      ...(held.sources?.length ? { source_refs: held.sources.map(({ event_id, version }) => ({ event_id, version })) } : {}), actor_id: caller.actor_id, owner: where.owner, scope: input.scope,
      project_id: where.project, formal_expires_at: formalExpiry, kind: input.kind, text, applies: input.applies ?? {}, basis: input.basis, why: input.why.trim().slice(0, 300),
      // Instruction-like text says so however it came in, so the person sees why before accepting.
      from: input.from, work, hold_reason: input.hold_reason ?? looksLikeInstruction(text), supersedes: input.supersedes ?? null, state: held.state === "promoted" ? "accepted" : held.state, created_at: at, memory_id: held.memory_id ?? null };
    p.ledger.transaction(() => { p.ledger.saveCandidate(record); p.operations.committed(caller, mark, { candidate_id: held.candidate_id, version: held.version }); });
    return candidateView(record);
  }

}
