import { createHash } from "node:crypto";
import { ActionError, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentWorkGraphPort, AgentWorkNode } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantBackgroundJob } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { assistantErrors } from "./assistant-errors.js";
import type { AssistantStore, StoredCard, StoredWork } from "./assistant-store.js";
import { hostLog } from "../host-log.js";
import { whenThere } from "./assistant-errors.js";

const RUNTIME = "prologue";
/** How long a job is followed: one not done by then is no longer followed, and its step fails as not done in time. */
export const JOB_FOLLOW_MS = 6 * 3600_000;
/** How often its owner is asked: after 15 s, then twice as long each time, at most every 5 minutes. */
const JOB_LOOKS = { first_ms: 15_000, max_ms: 300_000 };
type JobStep = AgentWorkNode & { job: NonNullable<AgentWorkNode["job"]> };
type Ended = NonNullable<JobStep["job"]["ended"]>;
const STATE: Record<Ended, AssistantBackgroundJob["state"]> = { done: "completed", failed: "failed", expired: "unknown", unchecked: "unknown" };

/** The value at a dot path (`run.jobId`), or undefined. */
export function pathValue(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined, value);
}
/** An object with one value placed at a dot path. */
function setPath(target: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split("."); let node = target;
  keys.slice(0, -1).forEach(key => { node = (node[key] = node[key] && typeof node[key] === "object" ? node[key] : {}) as Record<string, unknown>; });
  node[keys.at(-1)!] = value;
  return target;
}

interface JobPorts {
  store: AssistantStore;
  actorId: string;
  host(): Promise<AgentHost>;
  /** The work's own action client, as its rounds get it: the looks at its jobs call the status query through it. */
  actions(work: StoredWork): Promise<AgentActionClient | undefined>;
}

/**
 * Background work a work's command started (its action declares `background_job`), followed to its end on the work's
 * graph (specs/prologue-adoption §6.0o): one step per job, which the Host's wait on the owner's status query ends the way
 * the job ended. The graph is the only record: the work's view lists its job steps, the person is told once when one
 * ends, a card that started one shows how it ended, and the work's next round hears of every job that ended since its
 * latest round began (the same way as the parts it handed out, §6.0n).
 */
export class AssistantJobs {
  #listening?: () => void;
  /** Follows under way, by key: the round's report of a change and the card that ran it name the same job at once. */
  readonly #following = new Map<string, Promise<{ node_id: string }>>();
  constructor(private readonly ports: JobPorts) {}

  /** Where a work's jobs hang: its own graph, or for a part, its delegating work's (a part has no graph of its own). */
  static graphOf(work: StoredWork): string | undefined { return work.delegated_by?.graph_id ?? work.graph_id; }

  /**
   * Follow the job `output` names, when the action declares one: the same job is followed once, whoever reports it.
   * Returns its step, or null when nothing is to be followed (no job, or the work has no graph yet).
   */
  async follow(given: StoredWork, view: ActionView, output: unknown): Promise<{ graph_id: string; node_id: string } | null> {
    const declared = view.action.background_job, jobId = declared ? pathValue(output, declared.id) : undefined;
    if (!declared || typeof jobId !== "string" && typeof jobId !== "number") return null;
    // The work as stored now: a new work's graph is opened after its first round's authority captured it.
    const work = whenThere(() => this.ports.store.get(this.ports.actorId, given.work_id));
    if (!work) return null;
    const graph_id = AssistantJobs.graphOf(work);
    if (!graph_id) return null;
    const action = { capability_id: declared.status.capability_id, version: declared.status.version, provider_id: view.provider.provider_id };
    const key = `${work.work_id}.${createHash("sha256").update(JSON.stringify([action.provider_id, action.capability_id, action.version, String(jobId)])).digest("hex").slice(0, 16)}`;
    let following = this.#following.get(key);
    if (!following) {
      following = this.#graphs().then(graphs => graphs.follow({ graph_id, key, job_id: String(jobId), title: `${view.provider.title} · ${view.action.title}`, deadline_ms: JOB_FOLLOW_MS, every: JOB_LOOKS,
        query: { action, input: setPath({}, declared.input, jobId), path: declared.state.split("."), done: [...declared.done], failed: [...declared.failed] } }));
      this.#following.set(key, following);
      void following.finally(() => this.#following.delete(key)).catch(() => undefined);
    }
    return { graph_id, node_id: (await following).node_id };
  }

  /**
   * A card the person ran started the job on `step`: the card stays running until the job ends, then says how. A job
   * another card already started is that card's; this one just shows what its action returned.
   */
  claimForCard(card: StoredCard, step: { graph_id: string; node_id: string }): boolean {
    return !this.ports.store.cards(card.work_id).some(other => other.card_id !== card.card_id && other.job_step?.graph_id === step.graph_id && other.job_step.node_id === step.node_id);
  }

  /** The card's link to its job, written once the card shows it running; a job that already ended settles the card now. */
  async linkCard(card: StoredCard, step: { graph_id: string; node_id: string }): Promise<StoredCard> {
    let linked: StoredCard;
    try { linked = this.ports.store.updateCard(card, card.revision, { job_step: step }); } catch { return card; /* Changed meanwhile: that change decides. */ }
    const ended = (await this.#steps(step.graph_id).catch(() => [])).find(node => node.node_id === step.node_id && node.job.ended);
    if (ended) this.#settleCards(linked.work_id, ended);
    return this.ports.store.card(linked.work_id, linked.card_id);
  }

  /** The jobs a work follows, as its view lists them. */
  async views(work: StoredWork): Promise<AssistantBackgroundJob[]> {
    const steps = await this.#own(work);
    if (!steps.length) return [];
    const cards = this.ports.store.cards(work.work_id).filter(card => card.job_step);
    return steps.map(step => {
      const card = cards.find(one => one.job_step!.node_id === step.node_id);
      return { job_id: step.job.job_id, work_id: work.work_id, title: step.title, state: step.job.ended ? STATE[step.job.ended] : "running",
        started_at: step.job.started_at, ...(step.job.ended_at ? { ended_at: step.job.ended_at } : {}), ...(card ? { card_id: card.card_id } : {}) };
    });
  }

  /**
   * What the round about to start hears of the work's jobs: those still running, and those that ended since its latest
   * round began. A round is recorded only once it has started, so a job's end reaches exactly the first round that
   * starts after it.
   */
  async material(work: StoredWork): Promise<string | undefined> {
    const since = this.ports.store.rounds(work.work_id).at(-1)?.started_at ?? "";
    const told = (await this.#own(work)).filter(step => !step.job.ended || (step.job.ended_at ?? "") > since);
    if (!told.length) return undefined;
    return told.map(step => `- 「${step.title}」（任务 ${step.job.job_id}）：${step.job.ended ? { done: "已完成", failed: "没有完成", expired: "过了 6 小时仍没有结束，不再跟进", unchecked: "不再跟进" }[step.job.ended] : "仍在进行"}`).join("\n");
  }

  /** The authority the looks at the job on `at` are checked against: the work that follows it, as it may call now. */
  async authority(at: { graph_id: string; node_id: string }): Promise<{ actions: { client: AgentActionClient } } | undefined> {
    const work = this.#follower(at.graph_id, at.node_id);
    const client = work ? await this.ports.actions(work) : undefined;
    return client ? { actions: { client } } : undefined;
  }

  /** The Host started: hear each job that ends (and at once each that ended while it was away), told once. */
  async attach(): Promise<void> {
    this.#listening ??= (await this.#graphs()).onJobEnded(ended => void this.#ended(ended).catch(() => undefined));
  }

  async #ended(at: { graph_id: string; node_id: string }): Promise<void> {
    const work = this.#follower(at.graph_id, at.node_id), told = `job:${at.graph_id}:${at.node_id}`;
    // Heard again at every start: one already told, with no card still waiting on it, needs nothing read.
    if (!work || this.ports.store.noticeRaised(this.ports.actorId, told) && !this.ports.store.cards(work.work_id).some(card => card.status === "running" && card.job_step?.node_id === at.node_id)) return;
    const step = (await this.#steps(at.graph_id)).find(node => node.node_id === at.node_id);
    if (!step?.job.ended) return;
    const text = { done: `「${step.title}」在后台完成了`, failed: `「${step.title}」在后台没有完成`,
      expired: `「${step.title}」过了 6 小时仍没有结束，不再跟进；请到原处查看`, unchecked: `「${step.title}」不能再查看它的状态，不再跟进；请到原处查看` }[step.job.ended];
    this.ports.store.raiseNotice(this.ports.actorId, { kind: step.job.ended === "done" ? "result" : "failed", work_id: work.work_id, work_title: work.title, text }, told);
    this.#settleCards(work.work_id, step);
  }

  /** The running cards that started the job on `step` say how it ended. */
  #settleCards(workId: string, step: JobStep): void {
    for (const card of this.ports.store.cards(workId).filter(one => one.status === "running" && one.job_step?.node_id === step.node_id)) {
      try {
        this.ports.store.updateCard(card, card.revision, step.job.ended === "done" ? { status: "done", outcome: "后台已完成" }
          : step.job.ended === "failed" ? { status: "failed", outcome: "后台没有完成" } : { status: "unknown", outcome: step.job.ended === "expired" ? "过了 6 小时仍没有结束，请到原处查看" : "不能再查看它的状态，请到原处查看" });
      } catch (error) { if (!(error instanceof ActionError && error.code === "assistant.conflict")) hostLog.warn("assistant", "job_card_unsettled", error); } // Changed meanwhile is expected (the notice still says how the job ended); anything else is written.
    }
  }

  /**
   * The work a job step belongs to: the step is `job.<work id>.<hash>`, on the graph that work's jobs hang on. A work
   * not found (or whose jobs hang elsewhere) is really gone; how long ago it last changed does not matter.
   */
  #follower(graphId: string, nodeId: string): StoredWork | undefined {
    const workId = /^job\.(.+)\.[0-9a-f]{16}$/.exec(nodeId)?.[1];
    // An unreadable work is thrown: unknown to the checker, which can look again after storage recovers.
    const work = whenThere(() => this.ports.store.get(this.ports.actorId, workId ?? ""));
    return work && AssistantJobs.graphOf(work) === graphId ? work : undefined;
  }

  async #own(work: StoredWork): Promise<JobStep[]> {
    const graph = AssistantJobs.graphOf(work);
    return graph ? (await this.#steps(graph).catch(() => [])).filter(step => step.node_id.startsWith(`job.${work.work_id}.`)) : [];
  }

  async #steps(graphId: string): Promise<JobStep[]> {
    return (await (await this.#graphs()).read(graphId)).filter((node): node is JobStep => node.job !== undefined);
  }

  async #graphs(): Promise<AgentWorkGraphPort> {
    const graphs = (await this.ports.host()).adapter(RUNTIME).collaboration?.works;
    if (!graphs) throw assistantErrors.unsupported("当前运行时没有工作的任务图，不能跟进后台任务");
    return graphs;
  }
}
