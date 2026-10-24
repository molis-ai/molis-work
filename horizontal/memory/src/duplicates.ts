import { isDeepStrictEqual } from "node:util";
import type { AgentMemoryMeta, AgentMemorySourceRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryApproval, MemoryBasis, MemoryEvidence, MemoryLedgerPort, MemoryMetaRecord, MemorySource, MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendEntry } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import type { MemoryOperations } from "./operations.js";
import type { MemoryPromotion } from "./promotion.js";
import type { Located, MemoryScopeCommands } from "./scope-commands.js";
import { disownAutomatic, visibleTo } from "./places.js";
import { memoryErrors } from "./errors.js";
import { sameWords } from "./text.js";
import { toEntryMeta } from "./facts.js";

export const EXPLICIT_SOURCES: readonly MemorySource[] = ["said", "manual", "accepted", "imported"];

interface Input {
  text: string; source: MemorySource; basis: MemoryBasis | null; approved_by: MemoryApproval | null;
  evidence: MemoryEvidence[]; retainedMeta?: AgentMemoryMeta; sources?: readonly AgentMemorySourceRef[];
  replaces?: string;
  kind: MemoryMetaRecord["kind"]; applies: MemoryMetaRecord["applies"]; expires_at: string | null;
}
interface Ports {
  ledger: MemoryLedgerPort; operations: MemoryOperations; scopes: MemoryScopeCommands; promotions: MemoryPromotion;
  beforeEffect?: () => void | Promise<void>;
  saveFacts(caller: MemoryCaller, located: Located, meta: MemoryMetaRecord, before?: MemoryMetaRecord): Promise<MemoryBackendEntry>;
}

/** Duplicate selection and adoption retain one target and decision across delivery and restart. */
export class MemoryDuplicates {
  constructor(private readonly ports: Ports) {}

  async settle(caller: MemoryCaller, input: Input, entries: Located[], retrying: boolean, unsaid: string | null, appliesText: string): Promise<MemoryWriteResult | null> {
    const matches = (one: Located) => sameWords(one.entry.text, input.text) && visibleTo(caller, one.meta)
      && (!input.retainedMeta || isDeepStrictEqual(
        [one.entry.meta.classification, one.entry.meta.session_ref, one.entry.meta.namespace, one.meta.expires_at, one.meta.kind, one.meta.applies],
        [input.retainedMeta.classification, input.retainedMeta.session_ref, input.retainedMeta.namespace, input.expires_at, input.kind, input.applies]));
    const importing = input.source === "imported" && this.ports.operations.find(caller, "import") !== undefined;
    const key = importing ? "import-duplicate" : "duplicate", mark = this.ports.operations.find(caller, key);
    const same = mark ? entries.find(one => one.entry.memory_id === mark.memory_id && one.scope === mark.scope && one.owner === mark.owner)
      : entries.find(matches);
    if (mark && (!same || !matches(same))) throw memoryErrors.conflict("原重复项已变化或不可用，不能另建条目");
    if (mark || same && !retrying) return this.selected(caller, input, same!, appliesText, key, unsaid);
    if (retrying && !this.ports.operations.find(caller, "append")
      && !(input.replaces && this.ports.operations.find(caller, `replace:${input.replaces}`))
      && !this.ports.operations.find(caller, "propose") && !this.ports.operations.find(caller, "candidate-hold"))
      throw memoryErrors.conflict("原保存没有可核对的创建、变更或重复决定，请核对原操作，不能重新选择目标");
    return null;
  }

  private async selected(caller: MemoryCaller, input: Input, same: Located, appliesText: string, key: string, unsaid: string | null): Promise<MemoryWriteResult> {
    const { operations, ledger } = this.ports;
    await this.ports.beforeEffect?.();
    caller.signal?.throwIfAborted();
    const importing = key === "import-duplicate", previous = operations.find(caller, key);
    const adoptKind = importing ? "import-adopt" : `${input.source}-adopt`;
    const skipKind = importing ? "import-skip" : `${input.source}-${unsaid ? "unverified" : "skip"}`;
    const adopting = previous ? previous.kind === adoptKind : EXPLICIT_SOURCES.includes(input.source) && same.meta.source === "auto" && !unsaid;
    const mark = operations.begin(caller, key, { kind: previous?.kind ?? (adopting ? adoptKind : skipKind),
      scope: same.scope, owner: same.owner, memory_id: same.entry.memory_id, expected_version: previous?.expected_version ?? same.entry.version,
      ...(!importing ? { evidence_count: input.evidence.length } : {}) });
    if (![skipKind, ...(!unsaid ? [adoptKind] : [])].includes(mark.kind) || !Number.isSafeInteger(mark.expected_version) || mark.expected_version! < 1)
      throw memoryErrors.conflict("原重复决定不完整或来源已改变，不能猜测恢复");
    if (adopting) this.assertAdoption(input, same, mark.expected_version!);
    if (mark.phase === "committed") {
      const current = await this.ports.scopes.find(caller, same.entry.memory_id);
      if (current.scope !== mark.scope || current.owner !== mark.owner || mark.result?.outcome !== "duplicate"
        || mark.result.memory_id !== current.entry.memory_id || mark.result.version !== current.entry.version)
        throw memoryErrors.conflict("原重复项已有后继版本，不能重放旧决定");
      if (adopting) this.assertAdoption(input, current, mark.expected_version!);
      await this.ports.beforeEffect?.();
      caller.signal?.throwIfAborted();
      return this.result(current, appliesText);
    }
    const facts = operations.find(caller, `facts:${same.entry.memory_id}`);
    if (same.entry.version !== mark.expected_version && !(adopting && facts && same.entry.version === mark.expected_version! + 1))
      throw memoryErrors.conflict("原重复项已有后继版本，不能采用后来内容");
    if (adopting) {
      // At the original version retain the existing append-and-trim semantics. After a possible commit,
      // use its whole evidence unchanged; the matching tail is only input validation, never a receipt.
      const before = same.meta;
      const applied = same.entry.version === mark.expected_version! + 1;
      operations.formal(caller, same, "facts", mark.expected_version);
      const entry = await this.ports.saveFacts(caller, same, { ...before, source: input.source, basis: input.basis,
        approved_by: input.approved_by, evidence: applied ? before.evidence : [...before.evidence, ...input.evidence].slice(-6), updated_at: mark.at }, before);
      if (entry.version !== mark.expected_version! + 1) throw memoryErrors.conflict("原采用结果不可确认，不能补记完成");
    }
    const current = await this.ports.scopes.find(caller, same.entry.memory_id);
    if (current.scope !== mark.scope || current.owner !== mark.owner || current.entry.version !== mark.expected_version! + (adopting ? 1 : 0))
      throw memoryErrors.conflict("原目标在完成前已变化，不能补记完成");
    await this.ports.beforeEffect?.();
    caller.signal?.throwIfAborted();
    ledger.transaction(() => {
      const result = { outcome: "duplicate" as const, memory_id: current.entry.memory_id, version: current.entry.version };
      if (adopting) disownAutomatic(ledger, current.entry.memory_id);
      if (!unsaid) this.ports.promotions.link(caller.actor_id, current.entry.memory_id, input.sources ?? []);
      operations.committed(caller, mark, result);
      operations.committed(caller, operations.find(caller, "commit")!, result);
      const entrypoint = operations.find(caller, importing ? "import" : "write");
      if (entrypoint) operations.committed(caller, entrypoint, result);
    });
    return this.result(current, appliesText);
  }

  /** Compare the fresh adopted facts; only the SDK's facts replay or committed receipt proves the write. */
  private assertAdoption(input: Input, same: Located, expectedVersion: number): void {
    const additions = toEntryMeta({ ...same.meta, evidence: input.evidence }, same.entry.meta).evidence ?? [];
    if (same.entry.version === expectedVersion + 1
      && (same.meta.source !== input.source || !isDeepStrictEqual(same.meta.basis, input.basis) || !isDeepStrictEqual(same.meta.approved_by, input.approved_by)
        || additions.length > 0 && !isDeepStrictEqual(same.entry.meta.evidence?.slice(-additions.length), additions)))
      throw memoryErrors.conflict("原采用事实或新增证据已改变，不能重放旧决定");
  }

  private result(one: Located, appliesText: string): MemoryWriteResult {
    return { outcome: "duplicate", reason: one.meta.state === "disabled" ? "已经记着这一条（目前停用）" : "已经记着这一条了", applies_text: appliesText,
      memory: this.ports.scopes.item(one), candidate: null, change_id: null };
  }
}
