import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryCandidate, MemoryCandidateDecision, MemoryCandidateRecord, MemoryChangeRecord, MemoryItem, MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendCandidate, MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import type { MemoryQueries } from "./queries.js";
import type { MemoryPreferences } from "./preferences.js";
import type { MemoryPromotion } from "./promotion.js";
import { MemoryOperations } from "./operations.js";
import { MemoryScopeCommands } from "./scope-commands.js";
import { correctedMemoryMeta } from "./classification.js";
import { fromEntryMeta } from "./facts.js";
import { disownAutomatic, personOnly } from "./places.js";
import { candidateView, CANDIDATE_TTL_MS, MAX_TEXT } from "./shapes.js";
import { looksLikeSecret, sameWords } from "./text.js";
import { memoryErrors } from "./errors.js";

type Decision = Omit<MemoryCandidateDecision, "candidate_id" | "expected_version"> & { expected_version?: number };
interface DecisionPorts {
  backend: MemoryBackendPort; ledger: MemoryLedgerPort; operations: MemoryOperations; scopes: MemoryScopeCommands;
  queries: MemoryQueries; preferences: MemoryPreferences; promotions: MemoryPromotion; now(): Date; date(at: string): string;
  beforeEffect?(): void | Promise<void>;
  record(caller: MemoryCaller, input: Omit<MemoryChangeRecord, "change_id" | "actor_id" | "at" | "state" | "undoable" | "project_id" | "work">): MemoryChangeRecord;
}

/** The person decides a candidate once; SDK owns its settlement, ledger only records that same result. */
export class MemoryCandidateDecisions {
  constructor(private readonly ports: DecisionPorts) {}

  async accept(caller: MemoryCaller, candidateId: string, input: Decision = {}): Promise<{ candidate: MemoryCandidate; memory: MemoryItem | null }> {
    const p = this.ports;
    caller = p.operations.caller(caller);
    personOnly(caller, "只有本人能认可记忆建议");
    const record = await p.queries.ownCandidate(caller, candidateId), key = `accept:${candidateId}`;
    const original = p.operations.find(caller, key);
    if (record.state !== "pending" && !original) throw memoryErrors.invalid(record.state === "accepted" ? "这条已经记住了" : "这条建议已经不在了");
    if (input.text !== undefined && typeof input.text !== "string") throw memoryErrors.invalid("记忆内容必须是文字");
    const text = input.text === undefined ? record.text : input.text.trim();
    if (!text || text.length > MAX_TEXT || looksLikeSecret(text)) throw memoryErrors.invalid("请使用不含秘密的 1–400 字记忆内容");
    const holder = { ...caller, project_id: record.project_id ?? caller.project_id, work: record.work };
    const backend = p.backend.withCaller(holder);
    const candidate = (await backend.candidates.list(record.scope, record.owner)).find(one => one.candidate_id === candidateId);
    if (!candidate) throw memoryErrors.conflict("候选原件已不可读，不能重建其分类或来源");
    const candidateVersion = input.expected_version ?? original?.candidate_expected_version ?? candidate.version;
    if (!Number.isSafeInteger(candidateVersion) || candidateVersion < 1) throw memoryErrors.invalid("请选择页面所见的候选版本");
    if (!original && candidateVersion !== candidate.version) throw memoryErrors.conflict("候选已变化，请重新查看后决定");
    const entries = await p.scopes.located(holder, record.scope, record.owner);
    const fixedTarget = original ? original.memory_id : candidate.replacement?.memory_id;
    const target = original || candidate.replacement ? entries.find(one => one.entry.memory_id === fixedTarget)
      : (record.supersedes ? entries.find(one => one.entry.memory_id === record.supersedes) : undefined)
        ?? entries.find(one => sameWords(one.entry.text, text));
    if (fixedTarget && !target) throw memoryErrors.conflict("原候选决定的目标已不可读，请核对原操作");
    const targetVersion = original?.expected_version ?? candidate.replacement?.expected_version ?? target?.entry.version;
    if (target?.entry.meta.session_ref || target?.entry.meta.classification?.lifecycle === "session")
      throw memoryErrors.invalid("会话记忆需要可信会话管理入口");
    if (target?.entry.meta.classification?.extra && candidate.meta.classification?.extra
      && !isDeepStrictEqual(target.entry.meta.classification.extra, candidate.meta.classification.extra))
      throw memoryErrors.invalid("候选与原记忆的额外分类约束不同，不能在此覆盖");
    const formal = this.formal(candidate, record, input, original ? new Date(original.at) : p.now(), target?.entry.meta);
    const digest = createHash("sha256").update(JSON.stringify({ candidateVersion, text, formal,
      target: target ? { id: target.entry.memory_id, version: targetVersion } : null })).digest("hex");
    if (original && (original.input_digest !== digest || original.candidate_expected_version !== candidateVersion))
      throw memoryErrors.conflict("重试不能改变原候选版本、正文、分类或期限");
    // A matching original decision may already have committed formally while candidate finish is still pending.
    // The SDK reconciles it; Host's joint commit guard still rejects every genuinely new formal write after TTL.
    if (!original && candidate.state === "pending" && Math.min(candidate.created_at_ms + CANDIDATE_TTL_MS, candidate.meta.expires_at_ms ?? Infinity) <= p.now().getTime())
      throw memoryErrors.invalid("这条建议的等待期限已到，不能再认可");
    p.preferences.assertEnabled(caller.actor_id, { ...record, project: record.project_id });
    await p.beforeEffect?.(); caller.signal?.throwIfAborted();
    if (!original && candidate.state === "pending" && Math.min(candidate.created_at_ms + CANDIDATE_TTL_MS, candidate.meta.expires_at_ms ?? Infinity) <= p.now().getTime())
      throw memoryErrors.invalid("这条建议的等待期限已到，不能再认可");
    const mark = p.operations.begin(caller, key, { kind: "accept", scope: record.scope, owner: record.owner, candidate_id: candidateId,
      candidate_expected_version: candidateVersion, ...(target ? { memory_id: target.entry.memory_id, expected_version: targetVersion } : {}), input_digest: digest });
    const at = mark.at;
    // Candidate expiry is a waiting deadline. Only the separately validated formal decision enters the record.
    const { expires_at_ms: _waiting, ...candidateMeta } = candidate.meta;
    const base = { ...(target?.entry.meta ?? {}), ...candidateMeta };
    const extra = target?.entry.meta.classification?.extra ?? candidate.meta.classification?.extra;
    const meta: AgentMemoryMeta = { ...base, kind: formal.kind, classification: { ...formal.classification,
      ...(extra ? { extra: structuredClone(extra) } : {}) },
      source: "accepted", approved_by: { by: "person" } };
    const additions = new Map((candidate.meta.evidence ?? []).map(item => [JSON.stringify(item), item]));
    const evidence = [...new Map((target?.entry.meta.evidence ?? []).filter(item => !additions.has(JSON.stringify(item)))
      .map(item => [JSON.stringify(item), item])).values(), ...additions.values()].slice(-6);
    if (evidence.length) meta.evidence = evidence;
    delete meta.expires_at_ms;
    if (formal.expires_at !== null) meta.expires_at_ms = Date.parse(formal.expires_at);
    // Missing candidate provenance does not inherit an unrelated target's basis or gain a fabricated work source.
    if (candidate.meta.basis === undefined) delete meta.basis;
    const origin = record.scope === "project" && record.work
      ? `你认可的建议 · 工作「${record.work.title.slice(0, 40)}」· ${p.date(at)} · 依据：${record.why.slice(0, 120)}`
      : `你认可的建议 · ${p.date(at)} · 依据：${record.why.slice(0, 120)}`;
    const location = { scope: record.scope, owner: record.owner, candidate_id: candidateId, operation_id: mark.operation_id,
      ...(caller.signal ? { signal: caller.signal } : {}) };
    const entry = target ? await backend.candidates.settleInto({ ...location, candidate_expected_version: candidateVersion,
      target: { memory_id: target.entry.memory_id, expected_version: targetVersion!, change: { text, meta } }, by: { by: "person" } })
      : await backend.candidates.accept({ ...location, expected_version: candidateVersion, text, origin, meta });
    if (entry.version !== (target ? targetVersion! + 1 : 1) || (target && entry.memory_id !== target.entry.memory_id))
      throw memoryErrors.conflict("正式记忆已有后继版本，不能补作原接受历史");
    const accepted = (await backend.candidates.list(record.scope, record.owner)).find(one => one.candidate_id === candidateId);
    if (!accepted || accepted.state !== "accepted" || accepted.memory_id !== entry.memory_id || accepted.version !== candidateVersion + 1)
      throw memoryErrors.conflict("候选提交后的关联不可确认，请使用原操作对账");
    const facts = fromEntryMeta({ ...entry, scope: record.scope, owner: record.owner })!;
    const kept: MemoryCandidateRecord = { ...record, version: accepted.version, text, state: "accepted", memory_id: entry.memory_id };
    await p.beforeEffect?.(); caller.signal?.throwIfAborted();
    p.ledger.transaction(() => {
      p.operations.committed(caller, mark, { memory_id: entry.memory_id, candidate_id: candidateId, version: accepted.version });
      p.promotions.link(caller.actor_id, entry.memory_id, candidate.sources ?? []);
      p.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: facts.kind, applies: facts.applies,
        snapshot: { origin: entry.origin, meta: entry.meta }, change: target ? "replaced" : "created", by: "person", at });
      if (target) disownAutomatic(p.ledger, entry.memory_id);
      p.record(holder, { kind: target ? "replaced" : "accepted", scope: record.scope, owner: record.owner, memory_id: entry.memory_id,
        text: entry.text, applied_version: entry.version, by: "person", rule: null, reason: `依据：${record.why.slice(0, 120)}`, undo: null });
      p.ledger.saveCandidate(kept);
    });
    return { candidate: candidateView(kept), memory: p.scopes.item({ scope: record.scope, owner: record.owner, entry, meta: facts }) };
  }

  private formal(candidate: MemoryBackendCandidate, record: MemoryCandidateRecord, input: Decision, now: Date, target?: AgentMemoryMeta): NonNullable<Decision["formal"]> {
    if (candidate.meta.session_ref || candidate.meta.classification?.lifecycle === "session") throw memoryErrors.invalid("会话记忆需要可信会话管理入口");
    const selected = input.formal;
    if (selected !== undefined && (!selected || typeof selected !== "object" || Object.keys(selected).some(key => !["kind", "classification", "expires_at"].includes(key)) || selected.expires_at === undefined))
      throw memoryErrors.invalid("请完整决定正式分类与期限");
    if (!selected && (!candidate.meta.classification || record.formal_expires_at === undefined))
      throw memoryErrors.invalid("这条建议需要明确分类与正式期限后再认可");
    // An existing complete correction keeps its target's classification, as before; explicit adoption supplies the new decision.
    const original = target ? target.classification : candidate.meta.classification;
    const classification = selected ? selected.classification : original && { scenes: original.scenes, lifecycle: original.lifecycle };
    const expiry = selected ? selected.expires_at : record.formal_expires_at;
    if (!classification || expiry === undefined) throw memoryErrors.invalid("这条建议需要明确分类与正式期限后再认可");
    const { expires_at_ms: _waiting, ...previous } = candidate.meta;
    const meta = correctedMemoryMeta(previous, { memory_id: candidate.candidate_id, action: "reclassify", kind: selected ? selected.kind : record.kind,
      classification: classification as NonNullable<Decision["formal"]>["classification"], expires_at: expiry }, now);
    return { kind: meta.kind as NonNullable<Decision["formal"]>["kind"], classification: {
      scenes: [...meta.classification!.scenes] as NonNullable<Decision["formal"]>["classification"]["scenes"],
      lifecycle: meta.classification!.lifecycle as "short-term" | "long-term" }, expires_at: expiry };
  }
}
