import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantDelegations } from "./assistant-delegation.js";
import type { AssistantUsage, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredRound, StoredWork } from "./assistant-store.js";
import { assistantErrors } from "./assistant-errors.js";
import { startOfToday } from "./assistant-usage-ledger.js";
import { RUNTIME, type AssistantServicePorts } from "./assistant-service-shared.js";

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
      let work: StoredWork;
      try { work = this.store.get(this.actorId, work_id); } catch { continue; }
      if (!work.session_id) continue;
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
      ...(owner.work_id !== work.work_id ? { budget_of: { work_id: owner.work_id, title: owner.title } } : {}) };
  }

  /** The person's cap on one work (its sub-tasks included), or none. A sub-task is held to its delegating work's cap. */
  async saveWorkBudget(workId: string, tokens: unknown): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    if (work.delegated_by) throw assistantErrors.invalid(`子任务按委托它的工作「${work.delegated_by.title}」的上限计算，请在那项工作里设置`);
    if (work.executor.kind === "plugin") throw assistantErrors.invalid("这项工作由执行方插件负责，它的用量在插件自己的会话里管理");
    const value = tokens === null || tokens === "" || tokens === undefined ? null : Number(tokens);
    if (value !== null && (!Number.isSafeInteger(value) || value < 1000)) throw assistantErrors.invalid("这项工作的上限至少 1000 tokens，或留空表示不单独设限");
    this.store.update(this.actorId, workId, null, { budget_tokens: value ?? undefined }, false);
    return this.link.read(workId);
  }

  /** The person's daily cap on the Assistant's own rounds (input plus output tokens), or none. */
  saveBudget(dailyTokens: unknown): AssistantUsage["daily_tokens"] {
    const value = dailyTokens === null || dailyTokens === "" || dailyTokens === undefined ? null : Number(dailyTokens);
    if (value !== null && (!Number.isSafeInteger(value) || value < 1000)) throw assistantErrors.invalid("每日上限至少 1000 tokens，或留空表示不限");
    this.store.setSetting(this.actorId, "daily_tokens", value === null ? "" : String(value));
    return value;
  }

  /** A round does not start once today's cap is reached; what already ran stays, and the person is told why. */
  async assertBudget(): Promise<void> {
    const usage = await this.usage();
    if (usage.daily_tokens === null) return;
    const used = usage.today.input + usage.today.output;
    if (used >= usage.daily_tokens) {
      throw assistantErrors.budget(`今天助理已用 ${used.toLocaleString("en-US")} tokens，达到你设的每日上限 ${usage.daily_tokens.toLocaleString("en-US")}；这一轮没有开始，已做的都保留。可以明天继续，或在设置里调高上限`, { action: "打开设置" });
    }
  }
}
