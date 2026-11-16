import type { ExactRef, Runtime } from "@prologue/sdk";
import type { AgentWorkGraphPort } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { agentErrors } from "../errors.js";
import { holdContinuation } from "./prologue-collaboration.js";
import { APP_WAIT_MS } from "./prologue-waits.js";

const ENDED: readonly string[] = ["succeeded", "failed", "cancelled"];
const boardRef = (id: string) => ({ kind: "task-board", id, revision: 1 }) as ExactRef<"task-board">;
const codeOf = (error: unknown) => (error as { code?: unknown } | undefined)?.code;
const PART_BACK = "一个子任务交回了，其余的还在办";
const TAKING_UP = "这项工作正在收下子任务交回的结果；先看完交回的结果，再交出新的子任务";

/**
 * A work waits for its parts (specs/prologue-adoption §6.0n, specs/work-line/contract-design.md §9): its root waits, by the
 * Host, on every unfinished step under it, and goes on each time one of them ends, whichever way: the Host goes on early
 * from its own wait when a part ends while others are still under way, and the next round of the work waits again for
 * the rest. The SDK owns the wait and the root's one continuation: a round
 * of the work running then takes it at its next model boundary; otherwise the continuation stays eligible until the
 * work's next round is started under its request key. One step has one continuation, so the Host changes only the waits
 * it armed (`by: "app"`), and hands nothing out while the root waits on one its round armed. Nothing here keeps a copy;
 * a work that may go on is heard from the graph's own event, and, after a restart, from the continuations the SDK kept.
 */
export function createWorkWaits(runtime: Runtime, root: string, isWorkGraph: (graph: string) => Promise<boolean>) {
  const now = async () => (await runtime.readClock()).wallTimeMs;
  const rootOf = (graph: string) => runtime.boards.get(boardRef(graph)).nodes.find(node => node.id === root);
  const open = (graph: string) => runtime.waits.list({ board: graph, node: root, states: ["waiting"] });
  // One change of a root's wait at a time: two parts handed out at once would each cancel the wait the other armed.
  const queues = new Map<string, Promise<void>>();
  const serially = (graph: string, change: () => Promise<void>) => {
    const next = (queues.get(graph) ?? Promise.resolve()).then(change), settled = next.catch(() => undefined);
    queues.set(graph, settled);
    void settled.finally(() => { if (queues.get(graph) === settled) queues.delete(graph); });
    return next;
  };
  /** The Host's own open wait on the root ends; one that ended meanwhile is left as it ended. */
  const cancelOwn = async (graph: string, note: string) => {
    for (const wait of open(graph).filter(one => one.by === "app")) {
      await runtime.waits.cancel(wait.ref.id, await now(), note).catch(error => { if (codeOf(error) !== "TASKBOARD_CONFLICT") throw error; });
    }
  };
  /**
   * The root waits, by the Host, for every unfinished part under it, in place of the Host's wait it had; for none if all
   * ended. A part is a step a session holds: a job the work follows (§6.0o) is a step no session holds, and is not waited for.
   */
  const unfinished = (graph: string) => runtime.boards.get(boardRef(graph)).nodes.filter(node => node.id !== root && node.assignee?.kind === "session" && !ENDED.includes(node.state)).map(node => node.id);
  const waitForParts = async (graph: string, step: { session: ExactRef<"session">; generation: number }, reason: string, only?: readonly string[]) => {
    await cancelOwn(graph, "换成等现在没做完的子任务");
    const on = unfinished(graph).filter(node => !only || only.includes(node)).map(node => ({ kind: "node" as const, board: graph, node }));
    if (!on.length) return;
    const at = await now();
    await runtime.waits.arm({ session: step.session, reason: reason.slice(0, 200), by: "app", arrangement: {
      scope: { board: graph, node: root, generation: step.generation }, on, mode: "all", until: "settled", onFailure: "continue",
      onEarlyContinue: "keep", deadlineMs: at + APP_WAIT_MS, autoContinue: true } }, at)
      .catch(error => { throw codeOf(error) === "TASKBOARD_CONTINUATION_CONFLICT" ? agentErrors.collaboration_conflict(TAKING_UP) : error; });
  };
  const partsOf = (wait: { on: readonly { kind: string; node?: string }[] }) => wait.on.flatMap(condition => condition.kind === "node" && condition.node ? [condition.node] : []);
  const NOT_NOW: readonly unknown[] = ["TASKBOARD_CONFLICT", "TASKBOARD_CONTINUATION_CONFLICT", "WAIT_ALREADY_ARMED", "TASKBOARD_STALE_GENERATION"];
  /**
   * A part the work waits for ended while others it waits for are still under way: the work goes on now, from the Host's
   * own wait, with what that part brought. The last one to end is left to the wait itself (the SDK settles it). A part
   * the open wait does not name (it ended before that wait was armed) changes nothing.
   */
  const partEnded = (graph: string, node: string) => serially(graph, async () => {
    const still = unfinished(graph);
    const wait = open(graph).find(one => one.by === "app" && partsOf(one).includes(node));
    if (!wait || !partsOf(wait).some(one => still.includes(one))) return;
    await runtime.waits.continueEarly(wait.ref.id, await now(), PART_BACK).catch(error => { if (!NOT_NOW.includes(codeOf(error))) throw error; });
  });
  /**
   * A round of the work is under way and the last thing its root waited for, by the Host, is over (taken up, given up, or
   * held for the person): the root waits again for the parts of that wait that have not ended. Nothing is armed over a
   * wait or a continuation still pending, and nothing for a work whose last wait was its round's own.
   */
  const waitForRest = (graph: string) => serially(graph, async () => {
    const step = rootOf(graph), last = step?.continuation;
    if (!step || step.assignee?.kind !== "session" || step.state !== "running" || !last || !["started", "cancelled", "blocked"].includes(last.state) || open(graph).length) return;
    const before = runtime.waits.get(last.wait.ref.id);
    if (before?.by !== "app") return;
    await waitForParts(graph, { session: step.assignee, generation: step.generation }, before.reason, partsOf(before)).catch(error => { if (!NOT_NOW.includes(codeOf(error)) && codeOf(error) !== "agent.collaboration_conflict") throw error; });
  });
  const onWorkGraph = (graph: string, then: () => Promise<void>) => void isWorkGraph(graph).then(work => work ? then() : undefined).catch(() => undefined);
  runtime.boards.subscribe(event => {
    if (!("nodeId" in event)) return;
    if (event.nodeId === root) {
      if (event.type === "wait" && event.state === "started" || event.type === "node-state" && event.to === "running" || event.type === "attempt") onWorkGraph(event.board, () => waitForRest(event.board));
    } else if (event.type === "node-state" && ENDED.includes(event.to)) onWorkGraph(event.board, () => partEnded(event.board, event.nodeId));
  });
  return {
    /**
     * Hand a step out (`part.add`) and have the work wait for it: checked first, so a refusal adds nothing. When the wait
     * cannot be armed after the step was added, the step is taken back (`part.remove`) and the work waits again for what
     * it waited for before, so no step is left that nothing waits for and no round stands on.
     */
    handOut: (graph: string, part: { add: () => Promise<void>; remove?: () => Promise<void> }, reason: string) => serially(graph, async () => {
      const step = rootOf(graph);
      if (!step || step.assignee?.kind !== "session") throw agentErrors.collaboration_unknown("工作的任务图上没有根");
      // The SDK hands the last wait's result to the round at its next model boundary; arming another before that would drop it.
      if (step.continuation?.state === "claimed") throw agentErrors.collaboration_conflict(TAKING_UP);
      if (open(graph).some(wait => wait.by !== "app")) throw agentErrors.collaboration_conflict("这项工作正在等它自己登记的事；等那件事有了结果，再交出新的子任务");
      if (step.state !== "running") throw agentErrors.collaboration_conflict("这项工作现在没有在做的一轮，不能等它的子任务");
      await part.add();
      const at = { session: step.assignee, generation: step.generation };
      try { await waitForParts(graph, at, reason); } catch (error) {
        await part.remove?.().catch(() => undefined);
        await waitForParts(graph, at, reason).catch(() => undefined);
        throw error;
      }
    }),
    hold: (input => serially(input.graph_id, async () => {
      await cancelOwn(input.graph_id, input.note.slice(0, 200));
      // Over already: taken from the work's next round and held for the person (the root follows it), if the Host armed it.
      const continuation = rootOf(input.graph_id)?.continuation;
      if (continuation && runtime.waits.get(continuation.wait.ref.id)?.by === "app") await holdContinuation(runtime, input.graph_id, root, { code: "HELD_FOR_PERSON", note: input.note.slice(0, 200) });
    })) satisfies AgentWorkGraphPort["hold"],
    onReady: (listener => {
      const look = (graph: string) => void isWorkGraph(graph).then(work => {
        const continuation = work ? rootOf(graph)?.continuation : undefined;
        if (continuation?.state === "eligible" && runtime.waits.get(continuation.wait.ref.id)?.by === "app") listener({ graph_id: graph, request_key: continuation.requestKey });
      }, () => undefined);
      const off = runtime.boards.subscribe(event => { if (event.type === "wait" && event.nodeId === root && event.state === "eligible") look(event.board); });
      for (const ref of runtime.boards.refs()) look(ref.id);
      return off;
    }) satisfies AgentWorkGraphPort["onReady"],
  };
}
