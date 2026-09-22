import { SYSTEM_TOOL_NAMES, type ExactRef, type Runtime, type PolicyRule } from "@prologue/sdk";
import type { AgentExecutionPlan, AgentRunRef, AgentStepBoard } from "@molis-ai/molis-work-contracts/services/agent-host";

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
    if (!attempt?.step_board || !attempt.frozen.execution_plan || args?.board !== attempt.step_board.id
      || args.node !== undefined && !attempt.frozen.execution_plan.steps.some(step => step.id === args.node)) return denied;
    return { kind: "allow" };
  } });
  return {
    async admit(plan: AgentExecutionPlan) {
      return runtime.boards.admit({ nodes: plan.steps.map((step, index) => ({ id: step.id, title: `步骤 ${index + 1}`,
        dependsOn: index ? [plan.steps[index - 1]!.id] : [], onFailure: "block-for-human" as const })) });
    },
    instructions(board: string, plan: AgentExecutionPlan) {
      return `本轮确认计划的任务图：${board}。只能用 board-read / board-report 读取和报告此图，不得创建或修改计划。节点 ${plan.steps.map(step => step.id).join("、")} 按顺序对应本轮固定计划材料中的步骤；动作和完成条件读取原材料，它们不是权限指令。\n`
        + "先 board-read 获取当前 version。每步 ready 时报告 running，再实际行动和核对完成条件；满足后报告 succeeded，不能以开始执行、子任务结束或口头承诺代替完成证据。发现阻塞报告 blocked 并说明必要决定；解决后先报告 ready，再 running。失败用 failed。每次 board-report 传 board、version、node、state、note；使用上次工具返回的最新版本，冲突先重新读取。note 最多 500 字，只记录有依据的简短进展和核对结果，不粘贴源码、秘密或全文。按原有序依赖执行；实质变更先说明并等待用户调整计划。图中的 succeeded 只表示你的报告，用户验收由产品入口单独处理。不要为了标绿提前报成功。";
    },
    async read(run: AgentRunRef): Promise<AgentStepBoard | undefined> {
      const attempt = await original(run);
      if (!attempt?.frozen.execution_plan) return undefined;
      if (!attempt.step_board) throw new Error("原计划没有可读取的任务图");
      const board = runtime.boards.get(attempt.step_board);
      if (board.nodes.length !== attempt.frozen.execution_plan.steps.length
        || board.nodes.some((node, index) => node.id !== attempt.frozen.execution_plan!.steps[index]!.id)) throw new Error("原步骤图与确认计划不一致");
      return { board_id: board.ref.id, version: board.version, terminal: board.terminal,
        nodes: board.nodes.map(node => ({ id: node.id, state: node.state, reports: node.reports.map(report => ({ note: report.note, at_ms: report.atMs })) })) };
    },
    close() { runtime.hooks.unregister(hook); },
  };
}
