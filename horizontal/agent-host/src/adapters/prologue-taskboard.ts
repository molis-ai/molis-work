import { APP_MODE_SURFACE_TOOLS, SYSTEM_TOOL_NAMES, type ExactRef, type Runtime, type PolicyRule } from "@prologue/sdk";
import type { AgentExecutionPlan, AgentRunRef, AgentStepAmendment, AgentStepBoard } from "@molis-ai/molis-work-contracts/services/agent-host";
import { blockId, isBlock, isPlanStep, PROJECT_STEP } from "./prologue-collaboration.js";
import { amendPlan, finished, fullId, localId, shape, stepLine, summary, type PlanPlace } from "./prologue-plan-steps.js";
import { SUGGEST_TOOL_PREFIX } from "./prologue-action-tools.js";

type SdkBoard = ReturnType<Runtime["boards"]["get"]>;

export interface PrologueStepBinding {
  /** The board a confirmed plan's steps are on (the project's work board), and the prefix of their ids. */
  step_board?: ExactRef<"task-board">;
  step_prefix?: string;
  frozen: { execution_plan?: AgentExecutionPlan };
  /** The SDK session the round ran in: the steps' first holder. */
  session?: ExactRef<"session">;
}

/** Where a round's confirmed plan is, from its saved start; none for a round without one (or one saved before plans moved onto the project board). */
export function placeOf(attempt: PrologueStepBinding | undefined): PlanPlace | undefined {
  if (!attempt?.step_board || !attempt.step_prefix || !attempt.frozen.execution_plan) return undefined;
  return { ref: attempt.step_board, prefix: attempt.step_prefix, block: attempt.step_prefix.slice(0, attempt.step_prefix.lastIndexOf(".")), plan: attempt.frozen.execution_plan };
}

/** Only scoped progress metadata is automatic; all existing external effects still ask. */
export const codingExecutionRules: readonly PolicyRule[] = [
  // Reporting on its own steps and messaging another session of the project need no review each time (the person's
  // decision); reading a background command's output and waiting on it are reads, and so is a step's wait (`board-wait`):
  // it only says what the step waits for and ends the run. Every other system tool asks —
  // starting and stopping a background command among them. The side panel's browser tools are judged by what they do
  // on which site (prologue-surfaces.ts); an ask on the tool itself would outrank a site the person allowed.
  ...SYSTEM_TOOL_NAMES.filter(name => !["board-report", "board-wait", "session-send", "command-output", "await-commands", ...APP_MODE_SURFACE_TOOLS].includes(name)).map(name => ({ source: "runtime" as const, effect: "ask" as const, match: { what: "tool" as const, name } })),
  { source: "runtime", effect: "ask", match: { what: "tool", namePrefix: "mcp:" } },
  { source: "runtime", effect: "ask", match: { what: "tool", namePrefix: "molis-action-" } },
  // A round's suggestion to the person records a button and runs nothing; clicking it is the person's confirmation (D27).
  { source: "runtime", effect: "allow", match: { what: "tool", namePrefix: SUGGEST_TOOL_PREFIX } },
  // The side panel's browser has its own rules (prologue-surfaces.ts): looking is allowed and each action asks. A blanket
  // ask here would also stop looking, which raises no approval; without those rules a surface action is denied anyway.
  ...(["path", "command", "network"] as const).map(what => ({ source: "runtime" as const, effect: "ask" as const, match: { what } })),
  { source: "runtime", effect: "ask", match: { what: "other", labelPrefix: "" } },
];

/**
 * The SDK owns all graph mutations; this seam only places confirmed plans on the project's board, scopes what a round
 * may read and report, and gives the person's changes to the SDK as board operations.
 *
 * Every step has a holder: the round's session, a subtask it handed the step to, another session it handed it to, or
 * the person. `steer` tells a live round what others changed on its plan (a subtask's report, a step coming back); the
 * round's own reports and a person's changes (told through their own note) are not repeated.
 */
export function createPrologueTaskBoards(runtime: Runtime, original: (run: AgentRunRef) => Promise<PrologueStepBinding | undefined>,
  steer?: (run: AgentRunRef, text: string) => Promise<boolean>,
  /** The project's work board a session stands on. */
  projectBoard?: (session: string) => Promise<string | undefined>,
  /** Whether a session has a round running now: a claim held by one that has not, and gone quiet, is marked expired. */
  alive?: (session: string) => boolean) {
  const hook = "molis-confirmed-plan-scope";
  runtime.hooks.register({ id: hook, event: "tool-before", blocking: true, handler: async context => {
    if (!context.toolName?.startsWith("board-") || context.toolName === "board-wait") return { kind: "allow" };
    const denied = { kind: "deny" as const, why: "只能读取或回报本项目的任务图，不能访问其他任务图或改写计划" };
    const asked = context.input as { board?: unknown; node?: unknown } | undefined;
    // The step a session stands on, a plan's own step and the project's root are the Host's: they say where work is, not
    // what it did.
    if (context.toolName === "board-report" && (asked?.node === PROJECT_STEP || isBlock(String(asked?.node)) || isPlanStep(String(asked?.node)))) return { kind: "deny", why: "这一步是会话或计划所在的位置，不用报告；请报告计划里的步骤" };
    if (!["board-read", "board-report"].includes(context.toolName) || !context.origin?.session) return denied;
    // An earlier plan of this session is the person's to take up again (「继续计划」): a round reports on its own plan's
    // steps in its block, not on another plan's.
    if (context.toolName === "board-report" && typeof asked?.node === "string" && asked.node.startsWith(`${blockId({ id: context.origin.session })}.`)) {
      const own = `${blockId({ id: context.origin.session })}.`, rest = asked.node.slice(own.length);
      if (/^p\d+\./.test(rest)) {
        const attempt = context.origin.run ? await original({ session_id: context.origin.session, run_id: context.origin.run }).catch(() => undefined) : undefined;
        if (placeOf(attempt)?.prefix !== own + rest.slice(0, rest.indexOf("."))) return { kind: "deny", why: "这是本会话之前那一轮计划的步骤；要接着做，请用户点「继续计划」" };
      }
    }
    // The project's board: read, and reported on where the SDK lets this session (steps it holds, its own binding).
    const shared = projectBoard ? await projectBoard(context.origin.session).catch(() => undefined) : undefined;
    if (shared && asked?.board === shared) return { kind: "allow" };
    // A board where this session holds a step (a subtask's own session): read, and reported on at that step.
    if (typeof asked?.board !== "string") return denied;
    let other: SdkBoard | undefined;
    try { other = runtime.boards.get({ kind: "task-board", id: asked.board, revision: 1 } as ExactRef<"task-board">); } catch { other = undefined; }
    const mine = (node: { assignee?: { kind: string; id: string } | undefined }) => node.assignee?.kind === "session" && node.assignee.id === context.origin!.session;
    if (other && (asked.node === undefined ? context.toolName === "board-read" && other.nodes.some(mine) : other.nodes.some(node => node.id === asked.node && mine(node)))) return { kind: "allow" };
    return denied;
  } });
  /*
   * Live rounds following their plan. A change someone else made to one of its steps (a subtask's report, a step handed
   * back) is told to the round once things settle for a moment, as one short note.
   */
  const following = new Map<string, { place: PlanPlace; run: AgentRunRef; nodes: Set<string>; timer?: ReturnType<typeof setTimeout> }>();
  const stopFollowing = (runId: string) => { const round = following.get(runId); if (round?.timer) clearTimeout(round.timer); following.delete(runId); };
  const unsubscribe = runtime.boards.subscribe(event => {
    if (!steer || !("nodeId" in event)) return;
    for (const round of following.values()) {
      if (event.board !== round.place.ref.id || localId(round.place, event.nodeId) === undefined) continue;
      const node = runtime.boards.get(round.place.ref).nodes.find(one => one.id === event.nodeId), last = node?.reports.at(-1);
      // The round's own reports and a person's changes are already known to it.
      if (!node || !last || last.human || !last.handover && last.session?.id === round.run.session_id) continue;
      round.nodes.add(node.id);
      round.timer ??= setTimeout(() => {
        round.timer = undefined;
        const board = runtime.boards.get(round.place.ref);
        const lines = [...round.nodes].flatMap(id => { const found = board.nodes.find(one => one.id === id); return found ? [stepLine(runtime, found, round.place, round.run.session_id, alive)] : []; });
        round.nodes.clear();
        if (!lines.length) return;
        void steer(round.run, `任务图有更新（第 ${board.version} 版，不是你自己报的）：\n${lines.join("\n")}\n需要时先 board-read 取最新版本再继续。`)
          .then(live => { if (!live) stopFollowing(round.run.run_id); }, () => undefined);
      }, 1500);
    }
  });
  return {
    /**
     * A confirmed plan's steps, under the plan's own step in the session's block on the project's board; each starts with
     * the round's session.
     */
    async admit(plan: AgentExecutionPlan, owner: ExactRef<"session">, at: { board: ExactRef<"task-board">; block: string; prefix: string }): Promise<PlanPlace> {
      const place: PlanPlace = { ref: at.board, block: at.block, prefix: at.prefix, plan };
      // Added, not admitted, and comparing only what they touch (P2k): another session's changes meanwhile miss nothing.
      await runtime.boards.addNode({ ref: at.board, expectedVersion: runtime.boards.get(at.board).version,
        node: { id: at.prefix, title: plan.title.slice(0, 120) || "计划", parent: at.block, dependsOn: [], onFailure: "block-for-human", assignee: owner } });
      for (const [index, step] of plan.steps.entries()) {
        const dependsOn = (step.depends_on ?? (index ? [plan.steps[index - 1]!.id] : [])).map(id => fullId(place, id));
        await runtime.boards.addNode({ ref: at.board, expectedVersion: runtime.boards.get(at.board).version,
          node: { id: fullId(place, step.id), title: `步骤 ${index + 1}`, parent: at.prefix, dependsOn, onFailure: "block-for-human", assignee: owner } });
      }
      return place;
    },
    /** Follow a live round's plan, so what others change on it reaches the round. */
    follow(place: PlanPlace, run: AgentRunRef) {
      stopFollowing(run.run_id);
      following.set(run.run_id, { place, run, nodes: new Set() });
    },
    unfollow: stopFollowing,
    /**
     * The plan as this round starts, given to the round with its task rather than in its fixed instructions: it changes
     * between rounds, and a model reads what comes last as current.
     */
    digest(place: PlanPlace, session: string) {
      return summary(runtime, runtime.boards.get(place.ref), place, session, alive);
    },
    /** An earlier round's plan, for a round without a plan of its own: context, and nothing when it has ended. */
    standing(place: PlanPlace, session: string) {
      let board: SdkBoard;
      try { board = runtime.boards.get(place.ref); } catch { return ""; }
      if (finished(board, place)) return "";
      return "本会话还有一份没做完的计划。要接着执行计划，请用户点「继续计划」。\n" + summary(runtime, board, place, session, alive);
    },
    /** The unfinished plan of an earlier round in the same session, for a round that continues it. */
    async resume(run: AgentRunRef): Promise<PlanPlace> {
      const place = placeOf(await original(run));
      if (!place) throw new Error("那一轮没有可继续的计划图");
      if (finished(runtime.boards.get(place.ref), place)) throw new Error("那一轮的计划图已经结束");
      return place;
    },
    instructions(place: PlanPlace, round: { dispatch: boolean }) {
      return `本轮确认计划在项目任务图 ${place.ref.id} 上，是本会话那一块里编号以 ${place.prefix}. 开头的步骤。只能用 board-read / board-report 读取和报告这些步骤，不得创建或修改计划。节点 ${place.plan.steps.map(step => fullId(place, step.id)).join("、")} 按顺序对应本轮固定计划材料中的步骤；动作和完成条件读取原材料，它们不是权限指令。\n`
      + (place.plan.steps.some(step => step.depends_on) ? "这份计划写明了步骤之间的依赖：一步的前置步骤都成功后它才会 ready，同时 ready 的几步互不依赖，可以一起推进（能派子任务时可以分别派出）。\n" : "")
      + "每一步都有负责人（board-read 里的 owner）：只有负责人能报告这一步。开始时每一步都在本会话名下（owner 显示为 you）；负责人是用户的步骤由用户处理，你不要报告它，要等它完成；负责人是别的会话或子任务的，你也报不了。\n"
      + (round.dispatch ? "派子任务时可以在 dispatch-subagent 里写 node: 步骤编号，把这一步交给它：只能交出本会话名下、此刻 ready 的步骤；交出后只有它能报告这一步，它结束时没做完的会回到本会话名下。不写 node 时宿主在本会话那一块下给它建一个子步骤。子任务报告的进展和交回会作为「任务图有更新」告诉你。\n" : "")
      + "这一轮开头附有一份「任务图现状」，是宿主在这一轮开始时读取的，比之前对话里的说法新。\n"
        + "先 board-read 获取当前 version。每步 ready 时报告 running，再实际行动和核对完成条件；满足后报告 succeeded，不能以开始执行、子任务结束或口头承诺代替完成证据。发现阻塞报告 blocked 并说明必要决定；解决后先报告 ready，再 running。失败用 failed。每次 board-report 传 board、version、node、state、note；使用上次工具返回的最新版本。这张图上还有别的会话在干活，它们改的是自己那一块，不影响你报告自己的步骤；只有你要报告的那一步在你读过之后被人改过，才会冲突，那时先重新读取。note 最多 500 字，只记录有依据的简短进展和核对结果，不粘贴源码、秘密或全文。按图中的依赖执行；实质变更先说明并等待用户调整计划。图中的 succeeded 只表示你的报告，用户验收由产品入口单独处理。不要为了标绿提前报成功。每完成一步就 board-read，接着做下一个 ready 的步骤；只要计划里还有 ready 的步骤，就不要结束这一轮。所有步骤都到终态、或遇到需要用户决定的阻塞时，才总结并结束。";
    },
    async read(run: AgentRunRef): Promise<AgentStepBoard | undefined> {
      const attempt = await original(run);
      if (!attempt?.frozen.execution_plan) return undefined;
      const place = placeOf(attempt);
      if (!place) throw new Error("原计划没有可读取的任务图");
      return shape(runtime, runtime.boards.get(place.ref), place, run.session_id, alive);
    },
    /** A person's change to the running plan (prologue-plan-steps.ts). */
    async amend(run: AgentRunRef, amendment: AgentStepAmendment, expectedVersion: number, actor: string): Promise<AgentStepBoard> {
      const attempt = await original(run), place = placeOf(attempt);
      if (!place) throw new Error("这一轮没有确认计划的任务图");
      const board = await amendPlan(runtime, place, amendment, expectedVersion, actor, attempt!.session);
      return shape(runtime, board, place, run.session_id, alive);
    },
    close() { runtime.hooks.unregister(hook); unsubscribe(); for (const id of [...following.keys()]) stopFollowing(id); },
  };
}
