import { cutWithEllipsis } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { assistantErrors, whenThere } from "./assistant-errors.js";
import { eventBehind } from "./assistant-line-actions.js";
import { deliveryOf, handedBackLines, hangRequirements, readStanding, requirementsBrief, type WorkAcceptancePort } from "./assistant-delegated-delivery.js";
export type { WorkAcceptancePort } from "./assistant-delegated-delivery.js";
import { randomUUID } from "node:crypto";
import type { AgentWorkGraphPort, AgentWorkNode } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { isTerminalAgentPhase, type AgentActionReviewControl, type AgentDelegatedWork, type AgentDelegation, type AgentDelivery, type AgentRunView, type AgentRuntimeAdapter, type AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AssistantCharacterChoice, AssistantCharacterRef, AssistantMaterial, AssistantSavedText, AssistantWork, AssistantWorkState, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantWords } from "./assistant-saved-text.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { identity } from "./assistant-relations.js";
import { assertAssistantSessionSettled, assistantEndControl, assistantWorkEnding, holdAssistantWorkLifetime, inAssistantWorkEffect, stopOriginalRun } from "./assistant-work-permissions.js";
import { promptTitle } from "./assistant-work-title.js";
import type { AssistantStepGate } from "./assistant-step-gate.js";

/**
 * How much one work may hand out: the Assistant's own product rule, defined here and nowhere else. `active` sub-tasks
 * going at once (the SDK's wait takes at most eight), `followUps` follow-ups on each, and `autoRounds` rounds the Host
 * writes in a row before the work stops and reports to the person (specs/work-line/contract-design.md §9, §10). There is
 * no cap on how many a work hands out in all: a main conversation stands for as long as its scope, and what it spends is
 * bounded by the usage caps.
 */
export const DELEGATION_LIMITS = { active: 5, followUps: 2, autoRounds: 8 } as const;
const RUNTIME = "prologue";
const ENDED: readonly string[] = ["succeeded", "failed", "cancelled"];
/** A part's steps on its delegating work's graph: the one it was handed out as, and those under it (follow-ups, the person's rounds). */
const partSteps = (nodes: readonly AgentWorkNode[], child: StoredWork) => nodes.filter(node => node.node_id === child.delegated_by!.node_id || node.node_id.startsWith(`${child.delegated_by!.node_id}.`));
/** A part with a step not yet ended still has something to do, or waits on the person: its delegating work waits for it. */
const open = (steps: readonly AgentWorkNode[]) => steps.filter(step => !ENDED.includes(step.state));
const followUps = (steps: readonly AgentWorkNode[]) => steps.filter(step => /\.f\d+$/.test(step.node_id)).length;
const TAKEN_BACK_NOTE = "用户把这个子任务收回到这项工作：它已停下，已产出的保留。";
const WAITS_FOR_PARTS = "等交出去的子任务有结果，再接着做这项工作";
/** The latest-ended step of a part's steps. */
const lastEnded = (steps: readonly AgentWorkNode[]) => steps.filter(step => step.ended_at).sort((a, b) => a.ended_at!.localeCompare(b.ended_at!)).at(-1);

/** What delegation needs from the Assistant service: its store and the round starts, state reads and checks it already has. */
interface DelegationPorts {
  /** 「每步先问我」 (PWA-156): whether the hand-back may start now, or waits for the person's yes. */
  stepGate?: Pick<AssistantStepGate, "pass">;
  store: AssistantStore;
  actorId: string;
  host(): Promise<AgentHost>;
  characters?(project: LocalHostProjectReference): Promise<AssistantCharacterChoice[]>;
  stateOf(host: AgentHost, work: StoredWork): Promise<AssistantWorkState>;
  latestRun(host: AgentHost, work: StoredWork): Promise<AgentRunView | null>;
  /** The work's latest reply in its own words, if it gave one. */
  lastReply(work: StoredWork): Promise<string | undefined>;
  chooseCharacter(work: StoredWork, choice: AssistantCharacterRef): Promise<StoredWork>;
  /** The events the work line shows to this work, read with the work's own authority; absent or refused, a sub-task cannot be hung on an event. */
  lineEvents?(work: StoredWork): Promise<ReadonlyArray<{ kind: string; id: string }>>;
  /** Requirements and acceptance for a work's own object, called as that work. Absent (or undefined for this work): sub-tasks carry no item-by-item requirements. */
  acceptance?(work: StoredWork, signal?: AbortSignal): Promise<WorkAcceptancePort | undefined>;
  /** Start (or add to) a round of this work; `host` marks words the Host wrote. `request` makes the start happen once. */
  dispatch(work: StoredWork, text: string, materials: AssistantMaterial[], writtenBy: "assistant" | "host", request?: string, stillCurrent?: () => boolean): Promise<unknown>;
  read(workId: string): Promise<AssistantWorkView>;
  /** Tell the person, once per key. */
  notify(work: StoredWork, text: AssistantSavedText, key: string): void;
}

/**
 * A work hands independent parts to works of its own and gets their results back (specs/prologue-adoption §4.6, item 14).
 * Each work has its own task graph (§6.0k): its rounds stand on the root, each part it hands out is a step under it held
 * by the part's session, and each follow-up a step under the part. A part's step ends with the round that stands on it;
 * whether a part still has something to do, how often it was followed up, and which work asked, are read from the graph.
 *
 * Hand-back (§6.0n, specs/work-line/contract-design.md §9): each time the work hands a step out, its root waits on every
 * step under it not yet ended. Each time one of them ends (the others may still be under way), the SDK hands the result
 * to the work's round still running, or the root's continuation may go on: the work then goes on by itself in one round
 * the Host writes ("子任务交回"), started under the continuation's request
 * key like any other round (its current authority, the shared token cap, its reviews). It does not go on when the person
 * stopped it (the continuation is held for them), when its round failed or stopped, or when the only news is a sub-task
 * someone stopped; its next round takes the continuation up instead. A start that is refused tells the person why and
 * is not tried again by itself until the Host starts again. A part's result reaches the work as a material of the first
 * round that starts after the part ended.
 */
export class AssistantDelegations {
  /** Hand-back rounds being prepared, by work: the person's stop withdraws one. */
  readonly #continuing = new Map<string, { withdrawn: boolean }>();
  /** Continuations whose automatic start failed here: given back, they stay for the person's round (or the next Host). */
  readonly #refused = new Set<string>();
  #listening?: () => void;
  constructor(private readonly ports: DelegationPorts) {}

  /** The delegation tools of a round of `parent`; none for a work that was itself delegated (one level deep). */
  of(parent: StoredWork): AgentDelegation | undefined {
    if (parent.delegated_by) return undefined;
    const { store, actorId } = this.ports;
    // Its graph is opened just before its first round, after these tools were given to it.
    const graphOf = () => store.get(actorId, parent.work_id).graph_id ?? "";
    const own = (workId: string) => {
      const work = store.get(actorId, workId);
      if (!work.delegated_by || work.delegated_by.graph_id !== graphOf()) throw assistantErrors.scope("这不是这项工作委托出去的子任务");
      return work;
    };
    const view = async (work: StoredWork, nodes: readonly AgentWorkNode[], host?: AgentHost): Promise<AgentDelegatedWork> => {
      const state = await this.ports.stateOf(host ?? await this.ports.host(), work);
      const reply = work.session_id ? await this.ports.lastReply(work).catch(() => undefined) : undefined;
      const results = store.relations.forWork(identity(work)).filter(row => row.relation === "result").map(row => ({ kind: row.object.kind, id: row.object.id, revision: row.object.revision }));
      const requirements = await readStanding(this.ports, work);
      return { work_id: work.work_id, title: work.title, state, ...(reply ? { reply: cutWithEllipsis(reply, 1200, { prefixLength: 1200 }) } : {}),
        ...(results.length ? { results } : {}), follow_ups: followUps(partSteps(nodes, work)), ...(requirements ? { requirements } : {}),
        ...(work.delegated_by?.taken_back_at ? { taken_back: true, note: TAKEN_BACK_NOTE } : {}) };
    };
    return {
      start: async input => {
        const host = await this.ports.host(), assertCurrent = await this.#holdParent(host, parent);
        const graphs = await this.#graphs(host), graph_id = graphOf();
        // A professional role, when asked for: exactly one the person published here and can run now — never a stand-in.
        let role: AssistantCharacterChoice | undefined;
        if (input.character) {
          const choices = parent.project_ref && this.ports.characters ? await this.ports.characters(parent.project_ref) : [];
          const named = choices.filter(item => item.reference.artifact_id === input.character || item.title === input.character)
            .sort((a, b) => Number(b.available) - Number(a.available) || b.reference.version - a.reference.version);
          role = named[0];
          if (!role) throw assistantErrors.not_found(`没有叫「${input.character}」的专业角色（只能用「可委托的专业角色」里列出的）；没有换成别的角色`);
          if (!role.available) throw assistantErrors.character_unavailable(`角色「${role.title}」现在不能用：${role.reason ?? "不可用"}；没有换成别的角色`);
        }
        const nodes = await graphs.read(graph_id);
        assertCurrent();
        const children = store.delegatedBy(actorId, { graph_id }, "any");
        if (children.filter(child => open(partSteps(nodes, child)).length).length >= DELEGATION_LIMITS.active) throw assistantErrors.limit(`已有 ${DELEGATION_LIMITS.active} 个子任务在办：这一件没有开始。告诉用户它在排队，等其中一个交回后再委托`);
        // Which event it is done for is its owner's record (the `serves` relation): only an event the line shows to this work's project.
        if (input.for_event) {
          const wanted = input.for_event;
          if (!parent.project_ref || !this.ports.lineEvents) throw assistantErrors.scope("个人工作没有事项线，子任务不能挂到事件上");
          const events = await this.ports.lineEvents(parent);
          assertCurrent();
          if (!events.some(event => event.kind === wanted.kind && event.id === wanted.id)) throw assistantErrors.not_found("事项线上没有这个事件（或这项工作读不到它）：子任务没有开始。先读事项线，用它给出的事件对象；不属于任何事件就不要带 for_event");
        }
        // Item-by-item requirements hang on the sub-task's own object, in its project (`modules/acceptance`); a personal work has
        // no such record, so there they are part of the brief and the round is told so.
        const listed = (input.requirements ?? []).slice(0, 20).map((item, index) => ({ id: `r${index + 1}`, statement: item.statement, ...(item.expected ? { expected: item.expected } : {}), requires_person: item.requires_person === true }));
        const hung = listed.length > 0 && Boolean(parent.project_ref && this.ports.acceptance);
        const node_id = `p-${randomUUID().slice(0, 12)}`;
        const child = store.create({ actor_id: actorId, title: input.title.slice(0, 80), scope: parent.scope, ...(parent.scope_title ? { scope_title: parent.scope_title } : {}),
          origin: { surface: "assistant", title: `「${promptTitle(parent)}」委托` }, ...(parent.project_ref ? { project_ref: parent.project_ref } : {}),
          delegated_by: { graph_id, node_id, title: promptTitle(parent), acceptance: input.acceptance.slice(0, 2000), ...(hung ? { requirements: listed.length } : {}) },
          // Done for the event the round named; else, unless it is registered as an event of its own, for the event this work is (or is done for).
          ...(input.for_event ? { serves: [{ kind: input.for_event.kind, id: input.for_event.id }] } : input.track || !parent.project_ref ? {} : { serves: eventBehind(parent) }),
          ...(input.track && parent.project_ref ? { line_event: true as const } : {}) });
        const materials: AssistantMaterial[] = (input.materials ?? []).slice(0, 4).map((material, index) => ({ material_id: `delegated-${index + 1}`, kind: "text", title: material.title.slice(0, 200),
          text: material.text.slice(0, 20_000), explicit: true, source: { surface: "assistant", title: promptTitle(parent) } }));
        try {
          // A Character's own main conversation hands its parts to itself unless it names another role: the task is done, and
          // reported back, by the one the person is talking to (WLN-40).
          const carrier = role?.reference ?? (parent.main && parent.character ? { artifact_id: parent.character.artifact_id, version: parent.character.version } : undefined);
          const assigned = carrier ? await this.ports.chooseCharacter(child, carrier) : child;
          // What being delegated means is the delegated role's own layer; the message is only this part's brief and its bar.
          // Written as the sub-task itself, before its first round: what it is measured against stands before it starts.
          if (hung) { await hangRequirements(this.ports, child, listed); assertCurrent(); }
          await this.ports.dispatch(assigned, [`「${promptTitle(parent)}」委托的子任务`, input.brief, `验收标准：${input.acceptance}`, requirementsBrief(listed, hung)].filter(Boolean).join("\n\n"), materials, "assistant", undefined, () => { assertCurrent(); return true; });
        } catch (error) {
          // A part that never started leaves no step behind on the graph.
          await graphs.end({ graph_id, node_id, note: "子任务没能开始" }).catch(() => undefined);
          store.discard(actorId, child.work_id); throw error;
        }
        const started = await view(store.get(actorId, child.work_id), await graphs.read(graph_id), host);
        return listed.length && !hung ? { ...started, note: "这是个人工作，逐项要求没有单独记录，已写进交办说明；结果回来后按它们自己核对" } : started;
      },
      // Waits on the graph's own changes (a part's step ends with its round), not on a timer.
      status: async (input, signal) => {
        const host = await this.ports.host(), graphs = await this.#graphs(host), graph_id = graphOf();
        const works = () => store.delegatedBy(actorId, { graph_id }).filter(work => !input.work_ids || input.work_ids.includes(work.work_id));
        await new Promise<void>(resolve => {
          const stop = graphs.watch(graph_id, () => look());
          const timer = setTimeout(() => finish(), Math.max(0, Math.min(50_000, input.wait_ms ?? 0)));
          const finish = () => { clearTimeout(timer); stop(); signal?.removeEventListener("abort", finish); resolve(); };
          const look = () => void graphs.read(graph_id).then(nodes => { if (works().every(work => !open(partSteps(nodes, work)).length)) finish(); }, finish);
          signal?.addEventListener("abort", finish, { once: true });
          if (signal?.aborted) finish(); else look();
        });
        const nodes = await graphs.read(graph_id);
        return Promise.all(works().map(work => view(work, nodes, host)));
      },
      follow_up: async (workId, text) => {
        const child = own(workId), { graph_id, node_id } = child.delegated_by!;
        const host = await this.ports.host(), assertParent = await this.#holdParent(host, parent), graphs = await this.#graphs(host);
        if (child.delegated_by?.taken_back_at) throw assistantErrors.invalid("用户已把这个子任务收回到这项工作，这部分由你在这里继续，不要再对它追加");
        if (child.archived) throw assistantErrors.invalid("用户已把这个子任务收起，不要再对它追加；还需要它时告诉用户，由用户先恢复它");
        const assertLifetime = await holdAssistantWorkLifetime(host, child);
        const assertCurrent = () => {
          assertParent(); assertLifetime?.(); store.permissionTransitions.assertWorkPermissionTransitionFree(child.work_id);
          if (own(workId).delegated_by?.taken_back_at) throw assistantErrors.state("这项子任务已被收回");
        };
        const steps = partSteps(await graphs.read(graph_id), child);
        if (open(steps).length || !child.session_id) throw assistantErrors.state("这个子任务还在做：先用 check-delegated-work 等它交回，再按验收标准追加");
        if (followUps(steps) >= DELEGATION_LIMITS.followUps) throw assistantErrors.limit(`已经追加过 ${DELEGATION_LIMITS.followUps} 次；仍达不到验收时停止它，并把实际情况告诉用户`);
        // A follow-up is a step of its own under the part: an ended step is never reopened. The work waits for it too.
        const step = steps.length ? { graph_id, node_id: `${node_id}.f${followUps(steps) + 1}`, under: node_id, session_id: child.session_id, title: `追加：${text.split("\n")[0]!.slice(0, 60)}` }
          : { graph_id, node_id, session_id: child.session_id, title: child.title };
        await inAssistantWorkEffect(host.adapter(RUNTIME), { assertCurrent, beforeEffect: async () => assertCurrent() }, () => graphs.add({ ...step, wait_reason: WAITS_FOR_PARTS }));
        try { await this.ports.dispatch(child, text, [], "assistant", undefined, () => { assertCurrent(); return true; }); }
        catch (error) { await graphs.end({ graph_id, node_id: step.node_id, note: "追加没能开始" }).catch(() => undefined); throw error; }
        return view(store.get(actorId, child.work_id), await graphs.read(graph_id));
      },
      stop: async workId => {
        const child = own(workId);
        const host = await this.ports.host();
        const assertCurrent = await this.#holdParent(host, parent);
        const latest = await this.ports.latestRun(host, child);
        if (latest && !isTerminalAgentPhase(latest.phase)) {
          const control = assistantEndControl(store, child, { assertCurrent, beforeEffect: async () => assertCurrent() });
          await stopOriginalRun(host.adapter(RUNTIME), latest.ref, control);
          host.reviews.cancelPending(latest.ref.run_id, "委托它的工作停止了这个子任务");
        }
        return view(store.get(actorId, child.work_id), await (await this.#graphs(host)).read(child.delegated_by!.graph_id), host);
      },
    };
  }

  /** The delivery report of a round of `work` (`assistant-delivery.ts`); none for a work that was handed no requirements. */
  delivery(work: StoredWork): AgentDelivery | undefined { return deliveryOf(this.ports, work); }

  /**
   * Start a round of `work` where it stands (`placeOn`). A step added for this round is ended again when the round does
   * not start (a later send replaced it, its Character or model was refused): left open, the part would stay "still
   * working" for its delegating work. Another round of the same session may have found the step open meanwhile and gone
   * on with it; a step a round has started on is that round's, so only one still ready is ended (`if_ready`: the graph
   * checks and ends it in one step).
   */
  async startPlaced<T>(work: StoredWork, adapter: AgentRuntimeAdapter, control: AgentActionReviewControl, start: (work: StoredWork) => Promise<T>): Promise<T> {
    const placed = await inAssistantWorkEffect(adapter, control, () => placeOn(async () => {
      const graphs = await this.#graphs(); this.#listen(graphs); return graphs;
    }, this.ports, work, control.assertCurrent));
    try { return await start(placed.work); } catch (error) {
      const added = placed.added;
      if (added) await this.#graphs().then(graphs => graphs.end({ ...added, note: "这一轮没有开始", if_ready: true })).catch(() => undefined);
      throw error;
    }
  }

  /** The work that delegated `work` (the one whose graph its step is on), if it still exists. */
  parentOf(work: StoredWork): StoredWork | undefined {
    const graph = work.delegated_by?.graph_id;
    return graph ? this.ports.store.list(this.ports.actorId, { archived: "any", limit: 500 }).find(item => item.graph_id === graph && !item.delegated_by) : undefined;
  }

  /** A delegated work's `delegated_by` as it is shown: which work asked, found from its graph. */
  shown(work: StoredWork): AssistantWork["delegated_by"] {
    const parent = this.parentOf(work);
    if (!work.delegated_by || !parent) return undefined;
    const { title, acceptance, taken_back_at } = work.delegated_by;
    return { work_id: parent.work_id, title, acceptance, ...(taken_back_at !== undefined ? { taken_back_at } : {}) };
  }

  /** The sub-tasks `work` handed out, as its board lists them. */
  async parts(work: StoredWork): Promise<NonNullable<AssistantWorkView["delegated"]>> {
    const children = this.ports.store.delegatedBy(this.ports.actorId, work);
    if (!children.length) return [];
    const host = await this.ports.host(), nodes = await (await this.#graphs(host)).read(work.graph_id!);
    return Promise.all(children.map(async child => ({ work_id: child.work_id, title: child.title, state: await this.ports.stateOf(host, child), follow_ups: followUps(partSteps(nodes, child)), created_at: child.created_at,
      ...(child.delegated_by?.taken_back_at ? { taken_back: true } : {}), ...(child.serves?.length ? { serves: child.serves.map(one => ({ ...one })) } : {}), ...(child.line_event ? { line_event: true as const } : {}) })));
  }

  /** The person ends what of a part is not done: its round can no longer report on it (the generation moved on). */
  async #endOpen(work: StoredWork, note: string, control?: AgentActionReviewControl): Promise<void> {
    const host = await this.ports.host(), graphs = await this.#graphs(host), { graph_id } = work.delegated_by!;
    for (const step of open(partSteps(await graphs.read(graph_id), work))) {
      const end = () => graphs.end({ graph_id, node_id: step.node_id, note, actor_id: this.ports.actorId });
      if (control) await inAssistantWorkEffect(host.adapter(RUNTIME), control, end);
      else await end();
    }
  }

  async #holdParent(host: AgentHost, parent: StoredWork): Promise<() => void> {
    const { store, actorId } = this.ports, original = store.get(actorId, parent.work_id);
    const assertLifetime = await holdAssistantWorkLifetime(host, original), control = assistantEndControl(store, original);
    return () => {
      store.permissionTransitions.assertWorkPermissionTransitionFree(parent.work_id); assertLifetime?.(); control.assertCurrent();
      const current = store.get(actorId, parent.work_id);
      if (current.archived || current.executor.kind !== "assistant" || current.session_id !== parent.session_id) throw assistantErrors.state("原工作已结束或转交");
    };
  }

  async #graphs(host?: AgentHost): Promise<AgentWorkGraphPort> {
    const graphs = (host ?? await this.ports.host()).adapter(RUNTIME).collaboration?.works;
    if (!graphs) throw assistantErrors.unsupported("当前运行时没有工作的任务图，不能委派或跟进子任务");
    return graphs;
  }

  /**
   * The person takes a sub-task back into the work that delegated it: it stops if still running (what it made stays
   * with it), no more follow-ups go to it, and the delegating work's next round finishes that part itself. On the graph
   * the person ends what of the part is not done (its round can no longer report on it); nothing is handed to the
   * delegating work's session, whose rounds stand on its own root (§6.0k).
   */
  async takeBack(childId: string, caller?: AgentActionReviewControl): Promise<AssistantWorkView> {
    const { store, actorId } = this.ports;
    const child = store.get(actorId, childId), parent = this.parentOf(child);
    if (!child.delegated_by || !parent) throw assistantErrors.invalid("这不是一个子任务");
    const release = store.permissionTransitions.holdWorkPermissions([child.work_id]);
    try {
      const host = await this.ports.host(), ending = assistantWorkEnding(host, child), control = assistantEndControl(store, child, caller);
      assertAssistantSessionSettled(host, child);
      if (child.delegated_by.taken_back_at && (await ending?.read())?.lifecycle !== "ending") throw assistantErrors.invalid("这个子任务已经收回了");
      const finish = await ending?.begin("taken-back", control);
      await this.#endOpen(child, TAKEN_BACK_NOTE, control);
      const latest = await this.ports.latestRun(host, child);
      if (latest && !isTerminalAgentPhase(latest.phase)) {
        if (ending) await stopOriginalRun(host.adapter(RUNTIME), latest.ref, control);
        else await inAssistantWorkEffect(host.adapter(RUNTIME), control, () => host.adapter(RUNTIME).control(latest.ref, { kind: "stop" }));
        host.reviews.cancelPending(latest.ref.run_id, "用户把这个子任务收回了");
      }
      await control.beforeEffect(); control.assertCurrent();
      store.update(actorId, child.work_id, null, { delegated_by: { ...child.delegated_by, taken_back_at: child.delegated_by.taken_back_at ?? new Date().toISOString() } }, false);
      await finish?.();
      return this.ports.read(parent.work_id);
    } finally { release(); }
  }

  /** The person closed an interrupted round of a part: what of it was not done ends as theirs, and its delegating work may go on. */
  async closed(work: StoredWork): Promise<void> {
    const parent = this.parentOf(work);
    if (!parent) return;
    await this.#endOpen(work, "用户核对后关闭了中断的一轮");
  }

  /** The person stopped `work`: what its sub-tasks hand back waits for the person's next round; it does not go on by itself. */
  async hold(work: StoredWork, control: AgentActionReviewControl): Promise<void> {
    control.assertCurrent();
    const preparing = this.#continuing.get(work.work_id);
    if (preparing) preparing.withdrawn = true;
    if (work.graph_id && !work.delegated_by) {
      const graph_id = work.graph_id, host = await this.ports.host(), graphs = await this.#graphs(host);
      await inAssistantWorkEffect(host.adapter(RUNTIME), control, () => graphs.hold({ graph_id, note: "用户停止了这项工作，子任务交回的结果等用户下一轮再看" }));
    }
  }

  /**
   * A round of the work ended: a part that came back while it ran, and that the round did not take up itself, goes on now.
   * The graph says once more which roots may go on; only this work's is acted on.
   */
  async roundEnded(work: StoredWork): Promise<void> {
    if (work.delegated_by || !work.graph_id) return;
    const graphs = await this.#graphs();
    graphs.onReady(ready => { if (ready.graph_id === work.graph_id) void this.#continue(ready).catch(() => undefined); })();
  }

  /** A hand-back round of the work is being prepared: a stop may withdraw it. */
  isHandingBack(parentId: string): boolean { return this.#continuing.has(parentId); }

  /** What its sub-tasks handed back since its latest round began, as a material of the round that starts now. */
  async material(work: StoredWork): Promise<AgentTextMaterial | undefined> {
    if (work.delegated_by || !work.graph_id) return undefined;
    const host = await this.ports.host(), back = await this.#back(host, work);
    if (!back.length) return undefined;
    const lines = await Promise.all(back.map(({ child, state }) => handedBackLines(this.ports, child, state)));
    return { material_id: "handed-back", title: "子任务交回", text: [
      "下面这些子任务结束了，结果交回给这项工作；它们的答复是子任务自己说的，宿主没有核对过。带逐项要求的，核验与认可以平台的记录为准，没通过的项不要对用户说成完成：",
      ...lines].join("\n").slice(0, 18_000) };
  }

  /** The Host started: works whose parts all came back while it was away go on now (the SDK kept their continuations). */
  async attach(): Promise<void> { this.#listen(await this.#graphs()); }

  #listen(graphs: AgentWorkGraphPort): void {
    this.#listening ??= graphs.onReady(ready => void this.#continue(ready).catch(() => undefined));
  }

  /** Parts not taken back that ended since the work's latest round began (none left open), how each ended, and its last step. */
  async #back(host: AgentHost, parent: StoredWork) {
    const since = this.ports.store.rounds(parent.work_id).at(-1)?.started_at;
    const children = since ? this.ports.store.delegatedBy(this.ports.actorId, parent).filter(child => !child.delegated_by?.taken_back_at) : [];
    if (!children.length) return [];
    const nodes = await (await this.#graphs(host)).read(parent.graph_id!);
    const back = children.flatMap(child => {
      const steps = partSteps(nodes, child), step = lastEnded(steps);
      return !open(steps).length && step && step.ended_at! > since! ? [{ child, step }] : [];
    });
    return Promise.all(back.map(async item => ({ ...item, state: await this.ports.stateOf(host, item.child) })));
  }

  /** Its parts are all back and its root may go on: the work goes on by itself in one round the Host writes, when it should. */
  async #continue(ready: { graph_id: string; request_key: string }): Promise<void> {
    const { store, actorId } = this.ports;
    const parent = store.list(actorId, { limit: 500 }).find(work => work.graph_id === ready.graph_id && !work.delegated_by);
    if (!parent || parent.executor.kind === "plugin" || this.#continuing.has(parent.work_id) || this.#refused.has(ready.request_key)) return;
    const preparing = { withdrawn: false };
    this.#continuing.set(parent.work_id, preparing);
    try {
      const host = await this.ports.host(), latest = await this.ports.latestRun(host, parent);
      // Only after a round that ended well, and only for a result a part brought: one someone stopped waits for the person.
      const back = latest?.phase === "completed" ? await this.#back(host, parent) : [];
      if (!latest || !back.some(item => item.step.state !== "cancelled")) return;
      const stillCurrent = () => {
        const current = whenThere(() => store.get(actorId, parent.work_id)); // A store that cannot be read is thrown: the hand-back says so.
        return current !== null && !preparing.withdrawn && !current.archived && current.session_id === parent.session_id && store.rounds(parent.work_id).at(-1)?.run_id === latest.ref.run_id;
      };
      // Started once per continuation: the round's own start is under the continuation's request key (the binding's).
      const key = `hand-back-${ready.request_key.replace(/[^A-Za-z0-9-]/g, "-")}`.slice(0, 80);
      // So many rounds in a row that no person wrote: the work stops here and says so; the person's next word starts the count again.
      const rounds = store.rounds(parent.work_id);
      let auto = 0;
      while (auto < rounds.length && rounds[rounds.length - 1 - auto]!.written_by === "host") auto++;
      if (auto >= DELEGATION_LIMITS.autoRounds) {
        this.#refused.add(ready.request_key);
        this.ports.notify(parent, { label: assistantWords("workbench.assistant-notice.handoff-blocked", { title: parent.title }), original: `已经连续自己接着做了 ${DELEGATION_LIMITS.autoRounds} 轮，先停下来等你看一眼；你再说一句，它就接着做` }, key);
        return;
      }
      if (this.ports.stepGate && !this.ports.stepGate.pass(parent, "hand-back", ready.request_key, latest.ref.run_id)) return;
      const nodes = await (await this.#graphs(host)).read(parent.graph_id!);
      const under = store.delegatedBy(actorId, parent).filter(child => !child.delegated_by?.taken_back_at && open(partSteps(nodes, child)).length).length;
      const names = back.map(item => `「${item.child.title}」`).join("");
      try {
        await this.ports.dispatch(parent, under
          ? `（子任务交回）${names}有结果了，还有 ${under} 个子任务在办。请核对交回的结果，按用户最新的要求判断接下来怎么做，并告诉用户进展；不用等其余的，它们办完会再告诉你。`
          : `（子任务都已交回）请核对${names}的结果，把这项工作接着做完。`, [], "host", key, stillCurrent);
      } catch (error) {
        this.#refused.add(ready.request_key);
        this.ports.notify(parent, { label: assistantWords("workbench.assistant-notice.handoff-blocked", { title: parent.title }), original: error instanceof Error ? error.message : String(error) }, key);
      }
    } finally { this.#continuing.delete(parent.work_id); }
  }
}

/** Where a round of `work` stands: its graph (from its first round on), or for a part, the step it stands on, if added for it. */
async function placeOn(graphsOf: () => Promise<AgentWorkGraphPort>, ports: DelegationPorts, work: StoredWork, assertCurrent: () => void): Promise<{ work: StoredWork; added?: { graph_id: string; node_id: string } }> {
  if (!work.session_id || !work.delegated_by && work.graph_id) return { work };
  const graphs = await graphsOf();
  if (!work.delegated_by) {
    const { graph_id } = await graphs.open({ key: `assistant-work:${work.work_id}`, session_id: work.session_id, title: promptTitle(work) });
    assertCurrent();
    return { work: ports.store.update(ports.actorId, work.work_id, null, { graph_id }, false) };
  }
  const { graph_id, node_id } = work.delegated_by, steps = partSteps(await graphs.read(graph_id), work);
  if (open(steps).some(step => step.session_id === work.session_id)) return { work };
  // Its first round stands on the step it was handed out as, which its delegating work waits for (armed before the part
  // starts, so it cannot have ended first); one the person starts later, on a step under it (its result reaches the
  // delegating work as material of its next round, which does not wait for it).
  const added = steps.length ? { graph_id, node_id: `${node_id}.r${steps.filter(step => /\.r\d+$/.test(step.node_id)).length + 1}`, under: node_id, session_id: work.session_id, title: "用户接着做" }
    : { graph_id, node_id, session_id: work.session_id, title: promptTitle(work), wait_reason: WAITS_FOR_PARTS };
  await graphs.add(added);
  return { work, added: { graph_id, node_id: added.node_id } };
}
