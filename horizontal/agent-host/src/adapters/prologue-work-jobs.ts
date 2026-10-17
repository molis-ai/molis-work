import type { ExactRef, Runtime } from "@prologue/sdk";
import type { AgentWorkGraphPort, AgentWorkNode } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { agentErrors } from "../errors.js";
import { ACTION_QUERY_CHECKER, jobQueryTool, saidState } from "./prologue-checkers.js";

type Node = ReturnType<Runtime["boards"]["get"]>["nodes"][number];
const JOB = "job.";
const OVER: readonly Node["state"][] = ["succeeded", "failed", "cancelled", "needs-reconciliation"];
const boardRef = (id: string) => ({ kind: "task-board", id, revision: 1 }) as ExactRef<"task-board">;

/**
 * The jobs a work follows (specs/prologue-adoption §6.0o): background work one of its actions started, each a step
 * `job.<key>` under the work's root that no session holds and no round runs. The Host's wait on the step (SDK
 * `afterwards: "end-step"`) asks the owner's read-only status query on the SDK's bounded schedule and ends the step the
 * way the job ended; nothing goes on from it. The graph and the SDK's wait are the only record: which job, how it was
 * asked about, the owner's latest word and how it ended are all read back from them.
 */
export function createWorkJobs(runtime: Runtime, root: string, isWorkGraph: (graph: string) => Promise<boolean>) {
  const now = async () => (await runtime.readClock()).wallTimeMs;
  const isJob = (node: Node) => node.id.startsWith(JOB) && node.parent === root && node.assignee === undefined;
  /** The Host's wait that ends the job's step: the latest one, which the step was followed by. */
  const waitOf = (graph: string, node: string) => runtime.waits.list({ board: graph, node }).filter(one => one.by === "app" && one.afterwards === "end-step").at(-1);
  const end = async (graph: string, node: string, note: string) => {
    const ref = boardRef(graph), step = runtime.boards.get(ref).nodes.find(one => one.id === node);
    if (!step || OVER.includes(step.state)) return;
    await runtime.boards.report({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId: node, by: undefined, note, atMs: await now(), to: "cancelled" });
  };
  return {
    /** What a job's step says about it, for the work graph's view; none for a step that is not a followed job. */
    view(graph: string, node: Node): AgentWorkNode["job"] {
      if (!isJob(node)) return undefined;
      const wait = waitOf(graph, node.id), on = wait?.on.find(one => one.kind === "external");
      const said = saidState(wait?.observations[0]?.note);
      const ended = node.state === "succeeded" ? "done" as const : node.state === "failed" ? wait?.state === "expired" ? "expired" as const : "failed" as const
        : OVER.includes(node.state) ? "unchecked" as const : undefined;
      const source = on?.kind === "external" ? on.check.source : undefined;
      // A step the wait could no longer check is held for a person, not ended: the wait's end is the job's.
      const endedAt = ended ? node.endedAtMs ?? wait?.settledAtMs : undefined;
      return { job_id: source?.id ?? node.id.slice(JOB.length), started_at: new Date(wait?.createdAtMs ?? node.endedAtMs ?? 0).toISOString(),
        ...(said ? { said } : {}), ...(ended ? { ended } : {}), ...(endedAt === undefined ? {} : { ended_at: new Date(endedAt).toISOString() }) };
    },
    follow: (async input => {
      const ref = boardRef(input.graph_id), node_id = `${JOB}${input.key}`, board = runtime.boards.get(ref);
      if (board.nodes.some(node => node.id === node_id)) return { node_id };
      const holder = board.nodes.find(node => node.id === root)?.assignee;
      if (holder?.kind !== "session") throw agentErrors.collaboration_unknown("工作的任务图上没有根，不能跟进后台任务");
      try {
        await runtime.boards.addNode({ ref, expectedVersion: board.version,
          node: { id: node_id, title: input.title.slice(0, 120) || "后台任务", dependsOn: [], parent: root, onFailure: "block-for-human" } });
      } catch (error) {
        // Followed meanwhile (the same job reported twice at once): that follow arms its wait.
        if (runtime.boards.get(ref).nodes.some(node => node.id === node_id)) return { node_id };
        throw error;
      }
      try {
        await runtime.boards.transition({ ref, nodeId: node_id, to: "running" });
        const step = runtime.boards.get(ref).nodes.find(node => node.id === node_id)!, at = await now();
        // As the wait keeps it: plain JSON.
        const params = JSON.parse(JSON.stringify({ tool: jobQueryTool(input.query.action), input: input.query.input,
          status: { path: input.query.path, satisfied: input.query.done, failed: input.query.failed } }));
        await runtime.waits.arm({ session: holder, reason: `等后台任务「${input.title}」结束`.slice(0, 200), by: "app", arrangement: {
          scope: { board: input.graph_id, node: node_id, generation: step.generation },
          on: [{ kind: "external", check: { checker: ACTION_QUERY_CHECKER, source: { kind: "job", id: input.job_id },
            params, schedule: { firstMs: input.every.first_ms, maxIntervalMs: input.every.max_ms } } }],
          mode: "all", until: "success", onFailure: "continue", onEarlyContinue: "keep", deadlineMs: at + input.deadline_ms, autoContinue: false, afterwards: "end-step" } }, at);
      } catch (error) {
        // Not left running with nothing to end it.
        await end(input.graph_id, node_id, "没能跟进这个后台任务").catch(() => undefined);
        throw error;
      }
      return { node_id };
    }) satisfies AgentWorkGraphPort["follow"],
    onJobEnded: (listener => {
      const heard = (graph: string, node: string) => void isWorkGraph(graph).then(work => { if (work) listener({ graph_id: graph, node_id: node }); }, () => undefined);
      const off = runtime.boards.subscribe(event => {
        if (event.type !== "node-state" || !event.nodeId.startsWith(JOB) || !OVER.includes(event.to)) return;
        const node = runtime.boards.get(boardRef(event.board)).nodes.find(one => one.id === event.nodeId);
        if (node && isJob(node)) heard(event.board, node.id);
      });
      for (const ref of runtime.boards.refs()) for (const node of runtime.boards.get(ref).nodes) if (isJob(node) && OVER.includes(node.state)) heard(ref.id, node.id);
      return off;
    }) satisfies AgentWorkGraphPort["onJobEnded"],
  };
}
