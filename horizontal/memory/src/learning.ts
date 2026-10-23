import { isDeepStrictEqual } from "node:util";
import type { AgentMemorySourceRef, AgentMemorySourceSnapshot } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_KINDS, type MemoryApplies, type MemoryBasis, type MemoryCandidateRecord, type MemoryKind, type MemoryScope,
  type MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendPort } from "./backend.js";
import type { MemoryCaller, MemoryService } from "./service.js";
import type { MemoryOperations } from "./operations.js";
import type { MemoryScopeCommands } from "./scope-commands.js";
import { placeOf } from "./places.js";
import { automaticMemoryHold } from "./policy.js";
import { MAX_TEXT } from "./shapes.js";
import { quotedFrom, theirWords } from "./spoken.js";
import { sameText, sameWords } from "./text.js";

export interface MemoryProposal {
  text: string;
  kind: MemoryKind;
  scope: MemoryScope;
  applies_when?: string | null;
  basis: "explicit" | "inferred";
  quote: string;
  /** A model pointer never proves equivalence or independent evidence. */
  same_as?: string | null;
  supersedes?: string | null;
}
export interface MemoryLearned {
  text: string;
  outcome: MemoryWriteResult["outcome"] | "skipped";
  reason: string;
  candidate_id: string | null;
  memory_id: string | null;
}
interface LearningPorts {
  backend: MemoryBackendPort;
  scopes: MemoryScopeCommands;
  operations: MemoryOperations;
  candidates(caller: MemoryCaller, scope: MemoryScope, owner: string): Promise<MemoryCandidateRecord[]>;
  propose: MemoryService["propose"];
  offer: MemoryService["offer"];
}
const DO_NOT_REMEMBER = /(?:不要|别|不用|无需|不必)(?:帮我)?(?:记|记住|记下|记录)(?!得)|(?:don['’]?t|do not|never) (?:remember|save|store)/i;
const STANDING_WISH = /以后|今后|往后|每次|每回|总是|一律|一直|都要|都用|都别|都不|别再|不要再|下次|下回|记住|习惯|偏好|喜欢|讨厌|统一|规范|约定|规定|改成|应该|不对|always|never|from now on|every time|prefer|going forward|next time/i;

/** Product learning keeps the existing extractor's proposals, while source identity comes only from the input owner. */
export class MemoryLearning {
  constructor(private readonly ports: LearningPorts) {}

  worthLearning(caller: MemoryCaller, said: readonly string[]): boolean {
    const latest = said.at(-1) ?? "";
    if (!latest.trim() || said.some(text => DO_NOT_REMEMBER.test(text))) return false;
    return STANDING_WISH.test(latest) && this.ports.scopes.scopesFor(caller, undefined, true).some(where => {
      const prefs = this.ports.scopes.prefsAt(caller.actor_id, where);
      return prefs.enabled && prefs.form && prefs.learn_from_work;
    });
  }

  async context(caller: MemoryCaller) {
    const existing: Array<{ memory_id: string; scope: MemoryScope; kind: MemoryKind; text: string }> = [];
    const pending: Array<{ candidate_id: string; scope: MemoryScope; kind: MemoryKind; text: string; work_title: string | null }> = [];
    for (const where of this.ports.scopes.scopesFor(caller, undefined, true)) {
      const prefs = this.ports.scopes.prefsAt(caller.actor_id, where);
      if (!prefs.enabled || !prefs.form || !prefs.learn_from_work) continue;
      for (const located of await this.ports.scopes.located(caller, where.scope, where.owner))
        existing.push({ memory_id: located.entry.memory_id, scope: where.scope, kind: located.meta.kind, text: located.entry.text.slice(0, 200) });
      for (const item of await this.ports.candidates(caller, where.scope, where.owner)) if (item.state === "pending")
        pending.push({ candidate_id: item.candidate_id, scope: item.scope, kind: item.kind, text: item.text.slice(0, 200), work_title: item.work?.title ?? null });
    }
    return { existing: existing.slice(-30), pending: pending.slice(-20) };
  }

  async learn(caller: MemoryCaller, input: { said: readonly string[]; proposals: readonly MemoryProposal[]; sources?: readonly AgentMemorySourceSnapshot[] }): Promise<MemoryLearned[]> {
    caller = this.ports.operations.caller({ ...caller, source_use: "learning" });
    const out: MemoryLearned[] = [];
    if (input.said.some(text => DO_NOT_REMEMBER.test(text))) return out;
    for (const [index, proposal] of input.proposals.slice(0, 3).entries()) {
      const text = String(proposal.text ?? "").trim();
      const skip = (reason: string) => { out.push({ text, outcome: "skipped", reason, candidate_id: null, memory_id: null }); };
      if (!text || text.length > MAX_TEXT || !MEMORY_KINDS.includes(proposal.kind)) { skip("提议不合形状"); continue; }
      const scope: MemoryScope = proposal.scope === "project" && caller.project_id ? "project" : "personal", where = placeOf(caller, scope);
      const child = { ...caller, operation_id: `${caller.operation_id}:proposal:${scope}:${proposal.kind}:${index}` };
      const prefs = this.ports.scopes.prefsAt(caller.actor_id, where);
      if (!prefs.enabled || !prefs.form || !prefs.learn_from_work) { skip("这个范围没有允许从工作里学习"); continue; }
      const originals = (input.sources ?? []).filter(source => source.speaker.kind === "person" && source.speaker.id === caller.actor_id
        && source.derivation === "original" && Number.isFinite(source.occurred_at_ms));
      const explicit = originals.filter(source => theirWords(text, [source.text]) !== null);
      // A quote is evidence linkage only. A fragment of a conditional/negated message cannot become the person's claim.
      const basis: MemoryBasis = explicit.length && proposal.basis === "explicit" && theirWords(text, input.said) !== null ? "explicit" : "inferred";
      const sources = basis === "explicit" ? explicit : originals;
      const quote = String(proposal.quote ?? "").trim().slice(0, 200), verifiedQuote = quotedFrom(quote, input.said);
      const evidence = sources.filter(source => quotedFrom(quote, [source.text])).map(source => ({ kind: "said" as const, text: quote,
        ref: { kind: "memory-source", id: source.event_id, revision: source.version }, at: new Date(source.occurred_at_ms).toISOString() }));
      const applies: MemoryApplies = proposal.applies_when?.trim() ? { task: proposal.applies_when.trim().slice(0, 200) } : {};
      const entries = await this.ports.scopes.located(caller, scope, where.owner);
      const retrying = this.ports.operations.find(child, "propose") || this.ports.operations.find(child, "commit");
      if (!retrying && entries.some(item => sameWords(item.entry.text, text))) { skip("已经记着这一条了"); continue; }
      const records = await this.ports.candidates(caller, scope, where.owner);
      const canonical = await this.ports.backend.withCaller(caller).candidates.list(scope, where.owner);
      const refs: AgentMemorySourceRef[] = [...new Map(sources.map(source => [source.event_id, { event_id: source.event_id, version: source.version }])).values()];
      const earlier = records.find(item => item.state === "pending" && item.basis === "explicit" && item.from === "extraction"
        && item.kind === proposal.kind && sameText(item.text, text) && isDeepStrictEqual(item.applies, applies)
        && canonical.find(value => value.candidate_id === item.candidate_id)?.sources?.length);
      const prior = earlier ? canonical.find(item => item.candidate_id === earlier.candidate_id)?.sources ?? [] : [];
      if (!retrying && prior.length && refs.every(ref => prior.some(old => old.event_id === ref.event_id))) { skip("这份原始表态已经提过，重复运行不增加证据"); continue; }
      const combined = basis === "explicit" ? [...new Map([...prior, ...refs].map(ref => [ref.event_id, { event_id: ref.event_id, version: ref.version }])).values()] : refs;
      const repeated = basis === "explicit" && combined.length >= 2;
      const policyHold = automaticMemoryHold(proposal.kind, "repeated", prefs.auto);
      const supersedes = earlier?.supersedes ?? (proposal.supersedes && entries.some(item => item.entry.memory_id === proposal.supersedes) ? proposal.supersedes : null);
      const why = repeated ? "你在两份独立的原始输入里都这样要求" : verifiedQuote ? `你说：“${quote}”` : "从这次工作里推断";
      try {
        if (repeated && earlier && policyHold) {
          const held = await this.ports.offer(child, { scope, text, kind: proposal.kind, applies, basis: "repeated", why, evidence,
            from: "extraction", supersedes, candidate_id: earlier.candidate_id });
          out.push({ text, outcome: held.outcome, reason: held.reason, candidate_id: earlier.candidate_id, memory_id: null });
          continue;
        }
        const candidate = await this.ports.propose(child, { scope, text, kind: proposal.kind, applies, basis: repeated ? "repeated" : basis,
          from: "extraction", supersedes, evidence, why, hold_reason: repeated ? automaticMemoryHold(proposal.kind, "repeated", prefs.auto)
            : basis === "explicit" ? policyHold ?? "只有一份原始表态；独立地再次表达后才会自动记住，也可以现在认可"
            : "只是推断或缺少可核验的原件，需要你认可才会生效" }, { sources: combined,
          ...(repeated && earlier ? { combines: earlier.candidate_id } : {}) });
        if (!repeated) { out.push({ text, outcome: "candidate", reason: candidate.hold_reason ?? "等你认可", candidate_id: candidate.candidate_id, memory_id: null }); continue; }
        const result = await this.ports.offer(child, { scope, text, kind: proposal.kind, applies, basis: "repeated", why, evidence,
          from: "extraction", supersedes, candidate_id: candidate.candidate_id });
        out.push({ text, outcome: result.outcome, reason: result.reason, candidate_id: candidate.candidate_id, memory_id: result.memory?.memory_id ?? null });
      } catch (error) {
        // A committed formal write whose journal is pending must reach the existing queue's retry, not become a skipped success.
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if (!["memory.invalid", "memory.limit", "memory.off", "memory.forbidden"].includes(String(code))) throw error;
        skip(error instanceof Error ? error.message : String(error));
      }
    }
    return out;
  }
}
