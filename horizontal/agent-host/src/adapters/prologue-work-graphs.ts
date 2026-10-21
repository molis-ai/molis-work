import type { ExactRef, Runtime } from "@prologue/sdk";
import type { AgentWorkGraphPort, AgentWorkNode } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { agentErrors } from "../errors.js";
import { canTakeUp, eligibleContinuation, readyStep } from "./prologue-collaboration.js";
import type { SessionIndex, SessionIndexStore } from "./prologue-session-index.js";
import { createWorkJobs } from "./prologue-work-jobs.js";
import { createWorkWaits } from "./prologue-work-waits.js";

type Node = ReturnType<Runtime["boards"]["get"]>["nodes"][number];

/** The work's own step: its rounds stand on it while the work goes on. */
const ROOT = "work";
/** Finished parts a work's graph keeps: a work hands out at most a few parts, each with a few follow-ups. */
const KEEP_FINISHED = 64;
const ENDED: readonly Node["state"][] = ["succeeded", "failed", "cancelled"];
/** A step that changed hands or generation (the person ended it, a restart handed it on) is not the round's to end. */
const NOT_OURS: readonly unknown[] = ["TASKBOARD_CONFLICT", "TASKBOARD_STALE_GENERATION"];
const TERMINAL = ["completed", "failed", "cancelled"] as const;
type RoundEnd = (typeof TERMINAL)[number];
const boardRef = (id: string) => ({ kind: "task-board", id, revision: 1 }) as ExactRef<"task-board">;
const codeOf = (error: unknown) => (error as { code?: unknown } | undefined)?.code;

/**
 * A Host work on its own standing graph (specs/prologue-adoption §6.0k): an Assistant Work, the parts it hands to
 * other sessions, and the rounds that stand on them. The work's session holds the root; a part's session holds the
 * part's step. Which graph a session works on is kept in its index; which step a round stands on is the step its
 * session holds there, so neither the work nor the round names a step the graph could disagree with.
 */
export function createWorkGraphs(runtime: Runtime, index: SessionIndexStore) {
  const admitted = new Map<string, Promise<ExactRef<"task-board">>>();
  const graph = (key: string) => {
    let held = admitted.get(key);
    if (!held) {
      held = runtime.boards.admit({ nodes: [], idempotencyKey: `molis-work:${key}`, standing: { keepFinished: KEEP_FINISHED } }).then(one => one.ref);
      admitted.set(key, held);
      held.catch(() => admitted.delete(key));
    }
    return held;
  };
  const sessionOf = async (id: string) => {
    const saved = await index.read(id);
    if (!saved) throw agentErrors.session_unknown("这条会话读不到，不能放到工作的任务图上");
    return saved.ref;
  };
  // A step held by the session already there is the same step; held by another, it is someone else's.
  const place = async (ref: ExactRef<"task-board">, session: ExactRef<"session">, node: { id: string; title: string; parent?: string }) => {
    const there = runtime.boards.get(ref).nodes.find(one => one.id === node.id);
    if (there && (there.assignee?.kind !== "session" || there.assignee.id !== session.id)) throw agentErrors.collaboration_conflict("这一步已经归别的会话");
    if (!there) {
      await runtime.boards.addNode({ ref, expectedVersion: runtime.boards.get(ref).version,
        node: { id: node.id, title: node.title.slice(0, 120) || "工作", dependsOn: [], ...(node.parent ? { parent: node.parent } : {}), onFailure: "block-for-human", assignee: session } });
    }
    await index.update(session.id, saved => { saved.work_graph = ref.id; });
  };
  const view = (graph: string, node: Node): AgentWorkNode => {
    const last = node.reports.at(-1), job = jobs.view(graph, node);
    return { node_id: node.id, ...(node.parent ? { parent: node.parent } : {}), title: node.title, state: node.state,
      ...(node.assignee?.kind === "session" ? { session_id: node.assignee.id } : {}),
      ...(ENDED.includes(node.state) && last?.human ? { ended_by_person: { at: new Date(last.atMs).toISOString(), note: last.note } } : {}),
      ...(node.endedAtMs === undefined ? {} : { ended_at: new Date(node.endedAtMs).toISOString() }),
      ...(node.continuation ? { continuation: { request_key: node.continuation.requestKey, state: node.continuation.state } } : {}),
      ...(job ? { job } : {}) };
  };
  /** A board is a work's graph when its root is held by a session whose index says it works there. */
  const isWorkGraph = async (graph: string) => {
    const root = runtime.boards.get(boardRef(graph)).nodes.find(node => node.id === ROOT && !node.parent);
    return root?.assignee?.kind === "session" && (await index.read(root.assignee.id))?.work_graph === graph;
  };
  /**
   * End a part's step as the round on it ended, reported by the session that holds it at `generation`. The SDK settles
   * the round's attempt on the same step at the same moment, so a conflict is read again: only a step that ended or
   * moved on meanwhile is left alone.
   */
  const endAs = async (graph: string, nodeId: string, generation: number, type: RoundEnd, note: string) => {
    const ref = boardRef(graph);
    for (let tries = 0; ; tries++) {
      const node = runtime.boards.get(ref).nodes.find(one => one.id === nodeId);
      if (!node || ENDED.includes(node.state) || node.generation !== generation || node.assignee?.kind !== "session") return;
      // A step handed back to the work's session by a restart is ready again: under way first, then ended.
      if (node.state === "ready") await runtime.boards.transition({ ref, nodeId, to: "running", scope: { node: nodeId, generation } });
      try {
        await runtime.boards.report({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId, by: undefined, session: node.assignee, atMs: Date.now(),
          note, to: type === "completed" ? "succeeded" : type, scope: { node: nodeId, generation } });
        return;
      } catch (error) { if (!NOT_OURS.includes(codeOf(error)) || tries >= 2) throw error; }
    }
  };
  /** What could not be written, as the diagnostics page lists it: the step is ended when the Host next starts. */
  const failures: Array<{ kind: string; code: string | null; detail: string | null }> = [];
  const failed = (error: unknown, graph: string, node: string) => {
    failures.push({ kind: "work-graph-step-end-failed", code: typeof codeOf(error) === "string" ? codeOf(error) as string : null,
      detail: `step "${node}" of work graph ${graph}: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}` });
    failures.splice(0, Math.max(0, failures.length - 50));
  };
  /** How a round of `session` ended, read back from its session after a restart; unknown while it has not ended. */
  const endOf = async (session: ExactRef<"session">, run: ExactRef<"run">): Promise<RoundEnd | undefined> => {
    const opened = await runtime.sessions.open(session);
    const terminal = opened ? (await opened.terminalRuns()).find(one => one.id === run.id) : undefined;
    const last = terminal ? [...await opened!.replay(terminal)].reverse().find(event => (TERMINAL as readonly string[]).includes(event.type)) : undefined;
    return last?.type as RoundEnd | undefined;
  };

  const waits = createWorkWaits(runtime, ROOT, isWorkGraph), jobs = createWorkJobs(runtime, ROOT, isWorkGraph);
  const port: AgentWorkGraphPort = {
    async open(input) {
      const ref = await graph(input.key);
      await place(ref, await sessionOf(input.session_id), { id: ROOT, title: input.title });
      return { graph_id: ref.id };
    },
    async add(input) {
      const ref = boardRef(input.graph_id);
      const add = async () => place(ref, await sessionOf(input.session_id), { id: input.node_id, title: input.title, parent: input.under ?? ROOT });
      if (!input.wait_reason) return add();
      // A step this hand-out adds is ended again when the work cannot wait for it; one that was there already stays as it was.
      const remove = runtime.boards.get(ref).nodes.some(node => node.id === input.node_id) ? undefined
        : () => port.end({ graph_id: input.graph_id, node_id: input.node_id, note: "没能让这项工作等它，交出撤回" });
      await waits.handOut(input.graph_id, { add, remove }, input.wait_reason);
    },
    async read(graphId) { return runtime.boards.get(boardRef(graphId)).nodes.map(node => view(graphId, node)); },
    watch(graphId, listener) { return runtime.boards.subscribe(event => { if (event.board === graphId) listener(); }); },
    hold: waits.hold,
    onReady: waits.onReady,
    follow: jobs.follow,
    onJobEnded: jobs.onJobEnded,
    async end(input) {
      const ref = boardRef(input.graph_id), board = runtime.boards.get(ref), node = board.nodes.find(one => one.id === input.node_id);
      if (!node) throw agentErrors.collaboration_unknown("工作的任务图上没有这一步");
      if (ENDED.includes(node.state) || (input.if_ready && node.state !== "ready")) return;
      const holder = node.assignee?.kind === "session" ? node.assignee : undefined;
      await runtime.boards.report({ ref, expectedVersion: board.version, nodeId: node.id, by: undefined, note: input.note.slice(0, 480), atMs: Date.now(), to: "cancelled",
        ...(input.actor_id ? { human: { kind: "human", id: input.actor_id }, override: true } : holder ? { session: holder } : {}) });
    },
  };

  return {
    port,
    failures: () => [...failures],
    /**
     * Where a round of a session on a work's graph stands: under a continuation's request key when a step of its is ready
     * to go on (its wait is over), so the round takes it up, unless a refused start spent that key; otherwise the step
     * it holds there, made ready if it was held for the person.
     */
    async binding(saved: SessionIndex & { work_graph: string }, session: ExactRef<"session">, actor: string): Promise<{ board: string; node: string; requestKey?: string }> {
      const ready = eligibleContinuation(runtime, session, [boardRef(saved.work_graph)]);
      if (ready && await canTakeUp(runtime, ready)) return ready;
      const held = runtime.boards.assignedTo(session).find(entry => entry.ref.id === saved.work_graph)?.nodes.at(-1);
      if (!held) throw agentErrors.collaboration_unknown("这项工作的任务图上没有这个会话可以接着做的一步");
      await readyStep(runtime, saved.work_graph, held.id, actor);
      return { board: saved.work_graph, node: held.id };
    },
    /** A round on a work's graph ended: a part's step ends the same way; the work's root stays open. */
    ended(run: ExactRef<"run">, session: ExactRef<"session">, type: RoundEnd): void {
      const at = runtime.boards.attemptOf(run);
      if (!at || at.node === ROOT) return;
      void index.read(session.id).then(saved => saved?.work_graph === at.board.id ? endAs(at.board.id, at.node, at.generation, type, `这一轮结束：${type}`) : undefined)
        .catch(error => { if (!NOT_OURS.includes(codeOf(error))) failed(error, at.board.id, at.node); });
    },
    /**
     * After a restart: a part's step whose round ended before the step's end was written (the Host stopped in between)
     * ends as that round did. A round cut off by the restart is the SDK's to reconcile and the person's to close.
     */
    async reconcile(): Promise<void> {
      for (const ref of runtime.boards.refs()) {
        if (!(await isWorkGraph(ref.id).catch(() => false))) continue;
        for (const node of runtime.boards.get(ref).nodes) {
          const last = node.attempts.at(-1);
          if (node.id === ROOT || ENDED.includes(node.state) || last?.state !== "settled" || !last.run || node.attempts.some(one => one.state === "running" || one.state === "dispatching")) continue;
          try {
            const type = await endOf(last.session, last.run);
            if (type) await endAs(ref.id, node.id, node.generation, type, `这一轮结束：${type}（宿主重启后补记）`);
          } catch (error) { failed(error, ref.id, node.id); }
        }
      }
    },
  };
}
