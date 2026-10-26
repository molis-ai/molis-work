import type { AgentMemoryTools } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantMemory, AssistantMemoryCandidate, AssistantMemoryPrefs, AssistantContextSnapshot, AssistantRound } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredRound, StoredWork } from "./assistant-store.js";
import { assistantErrors } from "./assistant-errors.js";
import { assistantCandidate, assistantMemoryTools } from "./assistant-memory-tools.js";
import type { MemoryChange, MemoryItem } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryCaller, MemoryService } from "@molis-ai/molis-work-service-memory";
import { memoryInputSnapshots } from "../memory/memory-source-identity.js";
import { assistantMemoryTrail } from "./assistant-memory-trail.js";
import type { AssistantContinuations } from "./assistant-continuations.js";
import type { AssistantServicePorts } from "./assistant-service-shared.js";
import type { AssistantWorkReads } from "./assistant-work-reads.js";

export type AssistantMemoryBridgeLinks = Pick<AssistantWorkReads, "assistantPart"> & { continuations: Pick<AssistantContinuations, "currentInput"> };

/**
 * The Assistant's side of the platform memory: the person's memories and suggestions, the round's memory tools and
 * recall, and what each round was given (specs/archive/memory-system). Only its ports reach the Host; the other
 * collaborators come through `link`.
 */
export class AssistantMemoryBridge {
  constructor(private readonly store: Pick<AssistantStore, "get" | "rounds">, private readonly ports: AssistantServicePorts, private readonly actorId: string, private readonly recalled: Map<string, string>, private readonly chosenMemory: Map<string, Awaited<ReturnType<MemoryService["forRun"]>>>, private readonly memorySourceWithdrawals: Set<(eventId: string) => void>, private readonly link: AssistantMemoryBridgeLinks) {}

  /** The platform memory (specs/archive/memory-system): the Assistant reads and writes it like every other consumer. */
  private memory(): MemoryService {
    const memory = this.ports.memory?.();
    if (!memory) throw assistantErrors.unsupported("当前没有记忆服务");
    return memory;
  }

  /** The Assistant acting for the person in one work (or the person themselves, for the settings and the panel). */
  private memoryCaller(work: StoredWork | null, projectId: string | null, person = false): MemoryCaller {
    return { actor_id: this.actorId, project_id: work ? work.project_ref?.project_id ?? null : projectId, consumer: "assistant",
      ...(work ? { work: { work_id: work.work_id, title: work.title } } : {}), ...(person ? { person: true } : {}),
      // The Character carrying this work: its own memories come along, and only in its work.
      ...(work?.character && work.project_ref ? { character: { id: work.character.artifact_id, title: work.character.title } } : {}) };
  }

  /** The person's memories: personal ones, and — given a project — that project's. Disabled ones are listed as such. */
  async memories(projectId?: string | null): Promise<AssistantMemory[]> {
    const { items } = await this.memory().list(this.memoryCaller(null, projectId ?? null, true), { scope: "all" });
    return items.sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "personal" ? -1 : 1) || (a.created_at === null ? b.created_at === null ? 0 : 1 : b.created_at === null ? -1 : a.created_at.localeCompare(b.created_at)))
      .map(item => ({ memory_id: item.memory_id, scope: item.scope, ...(item.project_id ? { project_id: item.project_id } : {}), text: item.text, origin: item.origin, disabled: item.state !== "active" }));
  }

  memoryPrefs(): AssistantMemoryPrefs {
    const memory = this.ports.memory?.();
    return memory ? memory.assistantPrefs(this.actorId) : { form: false, use_personal: false, use_project: false, learn_personal: false, learn_project: false };
  }

  saveMemoryPrefs(input: Partial<AssistantMemoryPrefs>): AssistantMemoryPrefs {
    const pick = (key: keyof AssistantMemoryPrefs) => typeof input?.[key] === "boolean" ? { [key]: input[key] as boolean } : {};
    return this.memory().saveAssistantPrefs(this.actorId, { ...pick("form"), ...pick("use_personal"), ...pick("use_project"), ...pick("learn_personal"), ...pick("learn_project") });
  }

  /** Change, switch off or delete one memory, in the scope it lives in (a project's only from that project's page). */
  async changeMemory(input: { memory_id: string; action: "update" | "disable" | "enable" | "remove"; text?: string }, projectId?: string | null): Promise<AssistantMemory[]> {
    if (!["update", "disable", "enable", "remove"].includes(input?.action)) throw assistantErrors.invalid("不支持的操作");
    await this.memory().change(this.memoryCaller(null, projectId ?? null, true), { memory_id: String(input?.memory_id ?? ""), action: input.action, ...(typeof input.text === "string" ? { text: input.text } : {}) });
    return this.memories(projectId);
  }

  /** What works suggest keeping, still waiting for the person (one work's, or all). Left alone for 14 days, a suggestion goes. */
  async memoryCandidates(workId?: string): Promise<AssistantMemoryCandidate[]> {
    const memory = this.ports.memory?.();
    if (!memory) return [];
    return (await memory.candidates({ actor_id: this.actorId, project_id: null, consumer: "assistant", person: true }, { scope: "all", anywhere: true, ...(workId ? { work_id: workId } : {}) })
      .catch(() => [])).filter(candidate => candidate.work).map(candidate => assistantCandidate(candidate));
  }

  /** The person keeps a suggestion (as it was, or as they reworded it): written like anything they asked to remember. */
  async acceptMemoryCandidate(candidateId: string, input: { text?: string } = {}): Promise<AssistantMemoryCandidate> {
    const { candidate } = await this.memory().accept(this.memoryCaller(null, null, true), candidateId, input);
    return assistantCandidate(candidate);
  }

  /** The person declines a suggestion: it goes, and the same one is not suggested again. */
  async discardMemoryCandidate(candidateId: string): Promise<AssistantMemoryCandidate> {
    return assistantCandidate((await this.memory().discard(this.memoryCaller(null, null, true), candidateId)).candidate);
  }

  /** The round's memory tools (see assistant-memory-tools.ts), or none when forming memories is off. */
  memoryTools(work: StoredWork): AgentMemoryTools | undefined {
    const memory = this.ports.memory?.();
    if (!memory) return undefined;
    const projectId = work.project_ref?.project_id ?? null;
    return assistantMemoryTools({ memory, controlled: (control, bindChangeTarget) => this.ports.memory?.(control, bindChangeTarget), sources: this.ports.memorySources, currentWork: () => this.store.get(this.actorId, work.work_id), currentInput: this.link.continuations.currentInput(work.work_id), actorId: this.actorId, work, projectId, caller: this.memoryCaller(work, projectId),
      onSourceWithdrawal: listener => { this.memorySourceWithdrawals.add(listener); return () => { this.memorySourceWithdrawals.delete(listener); }; },
      spoken: async () => memoryInputSnapshots(this.actorId, (await Promise.resolve().then(() => this.link.assistantPart(this.store.get(this.actorId, work.work_id))).catch(() => null))?.sourceViews ?? []) });
  }

  /**
   * The memories this round is given (specs/archive/memory-system §7.2): the platform recall for the Assistant, handed to the
   * runtime as exact entries it re-reads and injects as data. Chosen once as the round is prepared (so its materials can
   * say what did not fit); the Agent Host asks for the same choice while starting the round.
   */
  async memoryForRound(work: StoredWork, task: string, context: AssistantContextSnapshot | null = null): Promise<import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecalledMemory | null> {
    const prepared = this.chosenMemory.get(work.work_id);
    if (prepared !== undefined) return prepared ? structuredClone(prepared) : null;
    const memory = this.ports.memory?.();
    if (!memory) return null;
    // Where the person is (plugin, object kind, Goal) decides which limited memories apply; the page's claim only narrows.
    const situation = context ? { ...(context.source.plugin_id ? { plugin_id: context.source.plugin_id } : {}), ...(context.object ? { object_kind: context.object.kind } : {}),
      ...(context.object?.kind === "goal" ? { goal_id: context.object.id } : {}) } : {};
    const chosen = await memory.forRun(this.memoryCaller(work, null), { query: `${task} ${work.title}`.slice(0, 2000), limit: 16, budget_chars: 3000,
      ...(Object.keys(situation).length ? { situation } : {}) }).catch(() => null);
    if (chosen) this.recalled.set(work.work_id, chosen.receipt_id);
    this.chosenMemory.set(work.work_id, chosen);
    return chosen && structuredClone(chosen);
  }

  /** What each round was given from memory and what did not fit, and what this work changed in memory (for the panel). */
  async memoryTrail(work: StoredWork, rounds: AssistantRound[], stored: readonly StoredRound[],
    facts: ReadonlyMap<string, import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryRecallFact>): Promise<{ changes: MemoryChange[] }> {
    const memory = this.ports.memory?.();
    if (!memory) return { changes: [] };
    const caller = this.memoryCaller(null, work.project_ref?.project_id ?? null, true);
    const receipts = new Map(stored.filter(round => round.memory_receipt).map(round => [round.run_id, round.memory_receipt!]));
    if (receipts.size || facts.size) {
      const items = new Map((await memory.list(caller, { scope: "all" }).catch(() => ({ items: [] as MemoryItem[] }))).items.map(item => [item.memory_id, item]));
      for (const round of rounds) {
        const fact = facts.get(round.run_id), receipt = receipts.get(round.run_id);
        if (fact) {
          const trail = assistantMemoryTrail(fact, items);
          if (trail) round.memories_used = trail;
        } else if (receipt && memory.uses({ receipt_id: receipt }).some(use => use.state === "used")) {
          round.memories_used = { used: [], omitted: [], unverified: true };
        }
      }
    }
    return { changes: memory.changes(caller, { scope: "all", work_id: work.work_id, limit: 20 }) };
  }
}
