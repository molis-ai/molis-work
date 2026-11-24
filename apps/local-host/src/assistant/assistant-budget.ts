import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import { numberArg, textArgs } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AssistantDelegations } from "./assistant-delegation.js";
import type { AssistantUsage, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredRound, StoredWork } from "./assistant-store.js";
import { readAssistantErrorWord } from "./assistant-error.js";
import { assistantErrors, whenThere } from "./assistant-errors.js";
import { startOfToday } from "./assistant-usage-ledger.js";
import { RUNTIME, type AssistantServicePorts } from "./assistant-service-shared.js";
import { workTitle } from "./assistant-work-title.js";

export type AssistantBudgetLinks = { read(workId: string): Promise<AssistantWorkView>; delegations: Pick<AssistantDelegations, "parentOf"> };

/**
 * Usage and caps: today's usage of the Assistant's own rounds, the person's daily cap, and each work's own cap (its
 * sub-tasks included). Only its ports reach the Host; the other collaborators come through `link`.
 */
export class AssistantBudget {
  constructor(private readonly store: Pick<AssistantStore, "delegatedBy" | "get" | "rounds" | "roundsSince" | "setSetting" | "setting" | "update" | "usage">, private readonly ports: AssistantServicePorts, private readonly actorId: string, private readonly now: () => Date, private readonly link: AssistantBudgetLinks) {}

  /**
   * Today's usage of the Assistant's own rounds, from the runtime's receipts: rounds that finished today and were not
   * yet counted are read once and kept. A round still running is counted when it ends.
   */
  async usage(): Promise<AssistantUsage> {
    const since = startOfToday(this.now(), this.ports.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    await this.settleUsage(this.store.roundsSince(this.actorId, since));
    const saved = this.store.setting(this.actorId, "daily_tokens");
    return { today: this.store.usage.since(this.actorId, since), daily_tokens: saved ? Number(saved) || null : null };
  }

  /** Finished rounds' reported usage, kept once per round; running rounds are counted when they end. */
  private async settleUsage(rounds: Array<{ work_id: string; round: StoredRound }>): Promise<void> {
    const own = rounds.filter(item => item.round.executor !== "plugin");
    const kept = this.store.usage.recorded(own.map(item => item.round.run_id));
    const open = own.filter(item => !kept.has(item.round.run_id));
    if (!open.length) return;
    const host = await this.ports.host().catch(() => null);
    if (!host) return;
    const adapter = host.adapter(RUNTIME);
    for (const { work_id, round } of open) {
      const work = whenThere(() => this.store.get(this.actorId, work_id));
      if (!work?.session_id) continue;
      const view = await adapter.read({ session_id: work.session_id, run_id: round.run_id }).catch(() => null);
      if (!view || !isTerminalAgentPhase(view.phase) || !view.usage) continue;
      this.store.usage.record(this.actorId, { work_id, run_id: round.run_id, ended_at: view.ended_at ?? this.now().toISOString(),
        input: view.usage.tokens.input ?? 0, output: view.usage.tokens.output ?? 0, cached: view.usage.tokens.cached_input ?? 0 });
    }
  }

  /**
   * What a work and the sub-tasks it handed out have used, against the cap the person set on it. A sub-task counts
   * toward the work that delegated it and is held to that work's cap.
   */
  async workUsage(work: StoredWork): Promise<NonNullable<AssistantWorkView["usage"]>> {
    const owner = this.link.delegations.parentOf(work) ?? work;
    const ids = [owner.work_id, ...this.store.delegatedBy(this.actorId, owner, "any").map(child => child.work_id)];
    await this.settleUsage(ids.flatMap(id => this.store.rounds(id).map(round => ({ work_id: id, round }))));
    const used = this.store.usage.of(this.actorId, ids);
    return { tokens: used.input + used.output, rounds: used.rounds, budget_tokens: owner.budget_tokens ?? null,
      ...(owner.work_id !== work.work_id ? { budget_of: { work_id: owner.work_id, title: workTitle(owner) } } : {}) };
  }

  /** The person's cap on one work (its sub-tasks included), or none. A sub-task is held to its delegating work's cap. */
  async saveWorkBudget(workId: string, tokens: unknown): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    if (work.delegated_by) {
      throw assistantErrors.invalid(readAssistantErrorWord("workbench.assistant-error.work-budget-delegated", textArgs({ title: work.delegated_by.title })));
    }
    if (work.executor.kind === "plugin") throw assistantErrors.invalid(readAssistantErrorWord("workbench.assistant-error.work-budget-plugin"));
    const value = tokens === null || tokens === "" || tokens === undefined ? null : Number(tokens);
    if (value !== null && (!Number.isSafeInteger(value) || value < 1000)) throw assistantErrors.invalid(readAssistantErrorWord("workbench.assistant-error.work-budget-min"));
    this.store.update(this.actorId, workId, null, { budget_tokens: value ?? undefined }, false);
    return this.link.read(workId);
  }

  /** A round does not start once today's cap is reached; what already ran stays, and the person is told why. */
  async assertBudget(): Promise<void> {
    const usage = await this.usage();
    if (usage.daily_tokens === null) return;
    const used = usage.today.input + usage.today.output;
    if (used >= usage.daily_tokens) {
      throw assistantErrors.budget(
        readAssistantErrorWord("workbench.assistant-error.daily-budget-reached", textArgs({ used: numberArg(used, "decimal"), limit: numberArg(usage.daily_tokens, "decimal") })),
        { action: readAssistantErrorWord("workbench.assistant-error.open-settings"), action_kind: "open_assistant_settings" },
      );
    }
  }
}
