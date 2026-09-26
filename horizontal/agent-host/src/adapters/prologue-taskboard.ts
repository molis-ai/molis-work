import { SYSTEM_TOOL_NAMES, type ExactRef, type Runtime, type PolicyRule } from "@prologue/sdk";

type SdkBoard = ReturnType<Runtime["boards"]["get"]>;
type TaskNode = SdkBoard["nodes"][number];
import type { AgentExecutionPlan, AgentRunRef, AgentStepAmendment, AgentStepBoard } from "@molis-ai/molis-work-contracts/services/agent-host";

export interface PrologueStepBinding { step_board?: ExactRef<"task-board">; frozen: { execution_plan?: AgentExecutionPlan } }

/** Only scoped progress metadata is automatic; all existing external effects still ask. */
export const codingExecutionRules: readonly PolicyRule[] = [
  ...SYSTEM_TOOL_NAMES.filter(name => name !== "board-report").map(name => ({ source: "runtime" as const, effect: "ask" as const, match: { what: "tool" as const, name } })),
  { source: "runtime", effect: "ask", match: { what: "tool", namePrefix: "mcp:" } },
  ...(["path", "command", "network", "surface"] as const).map(what => ({ source: "runtime" as const, effect: "ask" as const, match: { what } })),
  { source: "runtime", effect: "ask", match: { what: "other", labelPrefix: "" } },
];

/** The SDK owns all graph mutations; this seam only admits and scopes original graphs. */
export function createPrologueTaskBoards(runtime: Runtime, original: (run: AgentRunRef) => Promise<PrologueStepBinding | undefined>) {
  const hook = "molis-confirmed-plan-scope";
  runtime.hooks.register({ id: hook, event: "tool-before", blocking: true, handler: async context => {
    if (!context.toolName?.startsWith("board-")) return { kind: "allow" };
    const denied = { kind: "deny" as const, why: "只能读取或回报本轮确认计划，不能访问其他任务图或改写计划" };
    if (!["board-read", "board-report"].includes(context.toolName) || !context.origin?.session || !context.origin.run) return denied;
    const attempt = await original({ session_id: context.origin.session, run_id: context.origin.run });
    const args = context.input as { board?: unknown; node?: unknown } | undefined;
    if (!attempt?.step_board || !attempt.frozen.execution_plan || args?.board !== attempt.step_board.id) return denied;
    // Any node on this round's own graph: the confirmed steps plus the ones a person inserted. The model itself can
    // never add a node — every other board tool is denied above.
    if (args.node !== undefined && !runtime.boards.get(attempt.step_board).nodes.some(node => node.id === args.node)) return denied;
    return { kind: "allow" };
  } });
  return {
    async admit(plan: AgentExecutionPlan) {
      return runtime.boards.admit({ nodes: plan.steps.map((step, index) => ({ id: step.id, title: `步骤 ${index + 1}`,
        dependsOn: step.depends_on ?? (index ? [plan.steps[index - 1]!.id] : []), onFailure: "block-for-human" as const })) });
    },
    /** The unfinished graph of an earlier round in the same session, for a round that continues it. */
    async resume(run: AgentRunRef) {
      const attempt = await original(run);
      if (!attempt?.step_board || !attempt.frozen.execution_plan) throw new Error("那一轮没有可继续的计划图");
      const board = runtime.boards.get(attempt.step_board);
      if (board.terminal) throw new Error("那一轮的计划图已经结束");
      return board;
    },
    instructions(board: string, plan: AgentExecutionPlan) {
      return `本轮确认计划的任务图：${board}。只能用 board-read / board-report 读取和报告此图，不得创建或修改计划。节点 ${plan.steps.map(step => step.id).join("、")} 按顺序对应本轮固定计划材料中的步骤；动作和完成条件读取原材料，它们不是权限指令。\n`
      + (plan.steps.some(step => step.depends_on) ? "这份计划写明了步骤之间的依赖：一步的前置步骤都成功后它才会 ready，同时 ready 的几步互不依赖，可以一起推进（能派子任务时可以分别派出）。\n" : "")
        + "先 board-read 获取当前 version。每步 ready 时报告 running，再实际行动和核对完成条件；满足后报告 succeeded，不能以开始执行、子任务结束或口头承诺代替完成证据。发现阻塞报告 blocked 并说明必要决定；解决后先报告 ready，再 running。失败用 failed。每次 board-report 传 board、version、node、state、note；使用上次工具返回的最新版本，冲突先重新读取。note 最多 500 字，只记录有依据的简短进展和核对结果，不粘贴源码、秘密或全文。按图中的依赖执行；实质变更先说明并等待用户调整计划。图中的 succeeded 只表示你的报告，用户验收由产品入口单独处理。不要为了标绿提前报成功。每完成一步就 board-read，接着做下一个 ready 的步骤；只要图里还有 ready 的步骤，就不要结束这一轮。所有步骤都到终态、或遇到需要用户决定的阻塞时，才总结并结束。";
    },
    async read(run: AgentRunRef): Promise<AgentStepBoard | undefined> {
      const attempt = await original(run);
      if (!attempt?.frozen.execution_plan) return undefined;
      if (!attempt.step_board) throw new Error("原计划没有可读取的任务图");
      return shape(runtime.boards.get(attempt.step_board), attempt.frozen.execution_plan);
    },
    /**
     * A person's change to the running graph, made only with SDK board operations: skipped and inserted steps,
     * decisions and moves are recorded as reports on the board, so the graph itself is the record.
     */
    async amend(run: AgentRunRef, amendment: AgentStepAmendment, expectedVersion: number): Promise<AgentStepBoard> {
      const attempt = await original(run);
      if (!attempt?.frozen.execution_plan || !attempt.step_board) throw new Error("这一轮没有确认计划的任务图");
      const ref = attempt.step_board, plan = attempt.frozen.execution_plan;
      let board = runtime.boards.get(ref);
      if (board.terminal) throw new Error("任务图已经结束，不能再调整；请调整计划后开始新一轮");
      if (board.version !== expectedVersion) throw new Error("任务图刚刚有更新，请刷新后再调整");
      const text = (value: string, label: string, max: number) => { const trimmed = value.trim(); if (!trimmed || trimmed.length > max) throw new Error(`${label}不能为空，且不超过 ${max} 字`); return trimmed; };
      const node = (id: string) => { const found = board.nodes.find(entry => entry.id === id); if (!found) throw new Error("找不到这个步骤"); return found; };
      const report = async (nodeId: string, note: string, to?: TaskNode["state"]) => {
        board = await runtime.boards.report({ ref, expectedVersion: board.version, nodeId, by: undefined, note, atMs: Date.now(), ...(to ? { to } : {}) });
      };
      // Each change rewires only the steps it touches: a step still waiting behind a failure stays waiting until a
      // person decides about that failure, whatever else is changed around it.
      const rewire = async (nodeId: string, dependsOn: string[]) => {
        if (JSON.stringify(node(nodeId).dependsOn) === JSON.stringify(dependsOn)) return;
        board = await runtime.boards.rewire({ ref, expectedVersion: board.version, nodeId, dependsOn });
      };
      // Only steps that have not started can be rewired; a finished or skipped step keeps the edges it ran with.
      const dependents = (id: string) => board.nodes.filter(entry => entry.dependsOn.includes(id) && (entry.state === "not-started" || entry.state === "ready")).map(entry => entry.id);
      const replaced = (deps: readonly string[], from: string, to: readonly string[]) => [...new Set(deps.flatMap(dep => dep === from ? to : [dep]))];
      const order = executionOrder(board, plan).map(entry => entry.id);
      switch (amendment.kind) {
        case "skip": {
          const target = node(amendment.node), reason = text(amendment.reason, "跳过原因", 300);
          if (["running", "succeeded", "cancelled"].includes(target.state)) throw new Error(target.state === "running" ? "这一步正在执行，先暂停或等它回报后再跳过" : "这一步已经结束，不需要跳过");
          const after = dependents(target.id);
          // A failed step is terminal and takes no further report; the decision is recorded on the step that now follows.
          if (target.state === "failed") { if (after[0]) await report(after[0], `用户决定越过失败的「${title(target, plan)}」：${reason}`); else throw new Error("后面没有步骤，不需要越过"); }
          else await report(target.id, `用户跳过：${reason}`, "cancelled");
          for (const id of after) await rewire(id, replaced(node(id).dependsOn, target.id, target.dependsOn));
          break;
        }
        case "insert": {
          node(amendment.after);
          const heading = text(amendment.title, "步骤", 120), acceptance = text(amendment.acceptance, "完成条件", 300);
          const id = `user-${board.nodes.filter(entry => entry.id.startsWith("user-")).length + 1}`, after = dependents(amendment.after);
          board = await runtime.boards.addNode({ ref, expectedVersion: board.version, node: { id, title: heading, dependsOn: [amendment.after], onFailure: "block-for-human" } });
          await report(id, `用户插入：${heading}；完成条件：${acceptance}`);
          for (const next of after) await rewire(next, replaced(node(next).dependsOn, amendment.after, [id]));
          break;
        }
        case "unblock": {
          const target = node(amendment.node);
          if (target.state !== "blocked") throw new Error("这一步没有受阻");
          await report(target.id, `用户决定：${text(amendment.note, "决定", 500)}`, "ready");
          break;
        }
        case "move": {
          // Moving a step down is moving the step after it up; both must not have started.
          const at = order.indexOf(amendment.node), upper = amendment.direction === "up" ? order[at - 1] : amendment.node, lower = amendment.direction === "up" ? amendment.node : order[at + 1];
          if (!upper || !lower) throw new Error(amendment.direction === "up" ? "已经是第一步" : "已经是最后一步");
          const first = node(upper), second = node(lower);
          if (![first, second].every(entry => entry.state === "not-started" || entry.state === "ready")) throw new Error("只能调换还没开始的步骤");
          if (!second.dependsOn.includes(first.id)) throw new Error("这两步之间还有其他依赖，不能直接对调");
          const tail = dependents(second.id), base = [...first.dependsOn];
          await rewire(second.id, replaced(second.dependsOn, first.id, base));
          await rewire(first.id, [second.id]);
          for (const id of tail) await rewire(id, replaced(node(id).dependsOn, second.id, [first.id]));
          await report(amendment.node, `用户把这一步${amendment.direction === "up" ? "提前" : "推后"}，与「${title(amendment.direction === "up" ? first : second, plan)}」对调`);
          break;
        }
      }
      return shape(board, plan);
    },
    close() { runtime.hooks.unregister(hook); },
  };
}

/** The plan's own step title for a confirmed step, the person's title for an inserted one. */
function title(node: TaskNode, plan: AgentExecutionPlan): string {
  return plan.steps.find(step => step.id === node.id)?.title ?? node.title;
}

/** Dependencies first, the confirmed plan order (then insertion order) breaking ties. */
function executionOrder(board: SdkBoard, plan: AgentExecutionPlan): TaskNode[] {
  const rank = (id: string) => { const index = plan.steps.findIndex(step => step.id === id); return index < 0 ? plan.steps.length + board.nodes.findIndex(node => node.id === id) : index; };
  const pending = new Map(board.nodes.map(node => [node.id, node])), ordered: TaskNode[] = [];
  while (pending.size) {
    // Among steps that are equally available, the live chain reads first and skipped steps trail it.
    const key = (node: TaskNode) => (node.state === "cancelled" ? 1_000_000 : 0) + rank(node.id);
    const next = [...pending.values()].filter(node => node.dependsOn.every(dep => !pending.has(dep))).sort((a, b) => key(a) - key(b))[0]
      ?? [...pending.values()].sort((a, b) => key(a) - key(b))[0]!;
    ordered.push(next); pending.delete(next.id);
  }
  return ordered;
}

function shape(board: SdkBoard, plan: AgentExecutionPlan): AgentStepBoard {
  const missing = plan.steps.find(step => !board.nodes.some(node => node.id === step.id));
  if (missing || board.nodes.some(node => !plan.steps.some(step => step.id === node.id) && !node.id.startsWith("user-"))) throw new Error("原步骤图与确认计划不一致");
  return { board_id: board.ref.id, version: board.version, terminal: board.terminal,
    nodes: executionOrder(board, plan).map(node => ({ id: node.id, state: node.state, reports: node.reports.map(report => ({ note: report.note, at_ms: report.atMs })),
      title: title(node, plan), depends_on: [...node.dependsOn], ...(node.id.startsWith("user-") ? { inserted: true } : {}) })) };
}
