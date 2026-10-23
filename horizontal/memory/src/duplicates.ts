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

export const EXPLICIT_SOURCES: readonly MemorySource[] = ["said", "manual", "accepted", "imported"];

interface Input {
  text: string; source: MemorySource; basis: MemoryBasis | null; approved_by: MemoryApproval | null;
  evidence: MemoryEvidence[]; retainedMeta?: AgentMemoryMeta; sources?: readonly AgentMemorySourceRef[];
  kind: MemoryMetaRecord["kind"]; applies: MemoryMetaRecord["applies"]; expires_at: string | null;
}
interface Ports {
  ledger: MemoryLedgerPort; operations: MemoryOperations; scopes: MemoryScopeCommands; promotions: MemoryPromotion;
  now(): Date; beforeEffect?: () => void | Promise<void>;
  saveFacts(caller: MemoryCaller, located: Located, meta: MemoryMetaRecord, before?: MemoryMetaRecord): Promise<MemoryBackendEntry>;
}

/** Duplicate selection and adoption; imports retain their original target across delivery and restart. */
export class MemoryDuplicates {
  constructor(private readonly ports: Ports) {}

  async settle(caller: MemoryCaller, input: Input, entries: Located[], retrying: boolean, unsaid: string | null, appliesText: string): Promise<MemoryWriteResult | null> {
    const matches = (one: Located) => sameWords(one.entry.text, input.text) && visibleTo(caller, one.meta)
      && (!input.retainedMeta || isDeepStrictEqual(
        [one.entry.meta.classification, one.entry.meta.session_ref, one.entry.meta.namespace, one.meta.expires_at, one.meta.kind, one.meta.applies],
        [input.retainedMeta.classification, input.retainedMeta.session_ref, input.retainedMeta.namespace, input.expires_at, input.kind, input.applies]));
    const importing = input.source === "imported" && this.ports.operations.find(caller, "import") !== undefined;
    const mark = importing ? this.ports.operations.find(caller, "import-duplicate") : undefined;
    const same = mark ? entries.find(one => one.entry.memory_id === mark.memory_id && one.scope === mark.scope && one.owner === mark.owner)
      : entries.find(matches);
    if (importing) {
      if (mark && (!same || !matches(same))) throw memoryErrors.conflict("原导入重复项已变化或不可用，不能另建条目");
      if (mark || same && !retrying) return this.imported(caller, input, same!, appliesText);
      if (retrying && !this.ports.operations.find(caller, "append"))
        throw memoryErrors.conflict("原导入没有可核对的创建或重复决定，请核对原操作，不能重新选择目标");
      return null;
    }
    // Other save sources retain their existing duplicate behavior; this slice changes only import recovery.
    if (!same || retrying) return null;
    if (EXPLICIT_SOURCES.includes(input.source) && same.meta.source === "auto" && !unsaid) {
      await this.ports.saveFacts(caller, same, { ...same.meta, source: input.source, basis: input.basis,
        approved_by: input.approved_by, evidence: [...same.meta.evidence, ...input.evidence].slice(-6), updated_at: this.ports.now().toISOString() });
      disownAutomatic(this.ports.ledger, same.entry.memory_id);
    }
    if (!unsaid) this.ports.promotions.link(caller.actor_id, same.entry.memory_id, input.sources ?? []);
    return this.result(await this.ports.scopes.find(caller, same.entry.memory_id), appliesText);
  }

  private async imported(caller: MemoryCaller, input: Input, same: Located, appliesText: string): Promise<MemoryWriteResult> {
    const { operations, ledger } = this.ports;
    await this.ports.beforeEffect?.();
    caller.signal?.throwIfAborted();
    const previous = operations.find(caller, "import-duplicate");
    const mark = operations.begin(caller, "import-duplicate", { kind: previous?.kind ?? (same.meta.source === "auto" ? "import-adopt" : "import-skip"),
      scope: same.scope, owner: same.owner, memory_id: same.entry.memory_id, expected_version: previous?.expected_version ?? same.entry.version });
    if (!["import-adopt", "import-skip"].includes(mark.kind) || !Number.isSafeInteger(mark.expected_version) || mark.expected_version! < 1)
      throw memoryErrors.conflict("原导入重复决定不完整，不能猜测恢复");
    if (mark.phase === "committed") {
      const current = await this.ports.scopes.find(caller, same.entry.memory_id);
      if (current.scope !== mark.scope || current.owner !== mark.owner || mark.result?.outcome !== "duplicate"
        || mark.result.memory_id !== current.entry.memory_id || mark.result.version !== current.entry.version)
        throw memoryErrors.conflict("原导入重复项已有后继版本，不能重放旧决定");
      await this.ports.beforeEffect?.();
      caller.signal?.throwIfAborted();
      return this.result(current, appliesText);
    }
    const adopting = mark.kind === "import-adopt";
    const facts = operations.find(caller, `facts:${same.entry.memory_id}`);
    if (same.entry.version !== mark.expected_version && !(adopting && facts && same.entry.version === mark.expected_version! + 1))
      throw memoryErrors.conflict("原导入重复项已有后继版本，不能采用后来内容");
    if (adopting) {
      // Imports contain no evidence additions. Reconstruct only the original metadata update; the SDK must
      // confirm its exact input and original facts CAS even when the current source already says imported.
      operations.formal(caller, same, "facts", mark.expected_version);
      const before = same.meta;
      const entry = await this.ports.saveFacts(caller, same, { ...before, source: "imported", basis: input.basis,
        approved_by: input.approved_by, updated_at: mark.at }, before);
      if (entry.version !== mark.expected_version! + 1) throw memoryErrors.conflict("原采用结果不可确认，不能补记完成");
    }
    const current = await this.ports.scopes.find(caller, same.entry.memory_id);
    if (current.scope !== mark.scope || current.owner !== mark.owner || current.entry.version !== mark.expected_version! + (adopting ? 1 : 0))
      throw memoryErrors.conflict("原导入目标在完成前已变化，不能补记完成");
    await this.ports.beforeEffect?.();
    caller.signal?.throwIfAborted();
    ledger.transaction(() => {
      const result = { outcome: "duplicate" as const, memory_id: current.entry.memory_id, version: current.entry.version };
      if (adopting) disownAutomatic(ledger, current.entry.memory_id);
      this.ports.promotions.link(caller.actor_id, current.entry.memory_id, input.sources ?? []);
      operations.committed(caller, mark, result);
      operations.committed(caller, operations.find(caller, "commit")!, result);
      operations.committed(caller, operations.find(caller, "import")!, result);
    });
    return this.result(current, appliesText);
  }

  private result(one: Located, appliesText: string): MemoryWriteResult {
    return { outcome: "duplicate", reason: one.meta.state === "disabled" ? "已经记着这一条（目前停用）" : "已经记着这一条了", applies_text: appliesText,
      memory: this.ports.scopes.item(one), candidate: null, change_id: null };
  }
}
