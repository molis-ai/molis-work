import type { Claim, Evidence } from "../../domain/research/report.js";
import type { SqliteMemoryRepository } from "../db/memory-repository.js";
import type { ResearchExecutionRuntimePort, RuntimeInput } from "./fixture-research-runtime.js";
import type { AlchemistAiPort } from "./host-port.js";
import { HostResearchRuntimeAdapter } from "./host-research-runtime.js";

export class ResearchRuntimeSelector implements ResearchExecutionRuntimePort {
  private readonly runtime: HostResearchRuntimeAdapter;
  constructor(private readonly options: { ai: AlchemistAiPort; memory: SqliteMemoryRepository }) {
    this.runtime = new HostResearchRuntimeAdapter({ ai: options.ai, resolvePlaybookMethods: ids => ids.flatMap(id => {
      const rule = options.memory.getPlaybookRule(id);
      return rule?.status === "active" ? [rule.methodChange] : [];
    }) });
  }
  async collect(input: RuntimeInput) { await this.assertModel(input); return this.runtime.collect(input); }
  async crossCheck(input: RuntimeInput & { evidence: readonly Evidence[] }) { await this.assertModel(input); return this.runtime.crossCheck(input); }
  async synthesize(input: RuntimeInput & { evidence: readonly Evidence[]; claims: readonly Claim[]; runId: string }) { await this.assertModel(input); return this.runtime.synthesize(input); }
  private async assertModel(input: RuntimeInput): Promise<void> {
    input.signal?.throwIfAborted();
    if (!(await this.options.ai.listModels()).some(model => model.id === input.plan.modelId)) throw new Error("RUNTIME_MODEL_UNAVAILABLE");
  }
}
