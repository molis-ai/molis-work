import { SYSTEM_TOOL_NAMES, type ExactRef, type Runtime, type PolicyRule } from "@prologue/sdk";

type SdkBoard = ReturnType<Runtime["boards"]["get"]>;
type TaskNode = SdkBoard["nodes"][number];
type Assignee = TaskNode["assignee"];
type Report = TaskNode["reports"][number];
import type { AgentExecutionPlan, AgentRunRef, AgentStepAmendment, AgentStepBoard, AgentStepOwner } from "@molis-ai/molis-work-contracts/services/agent-host";

export interface PrologueStepBinding { step_board?: ExactRef<"task-board">; frozen: { execution_plan?: AgentExecutionPlan };
  /** The SDK session the round ran in: the steps' first holder. */
  session?: ExactRef<"session"> }

/** Only scoped progress metadata is automatic; all existing external effects still ask. */
export const codingExecutionRules: readonly PolicyRule[] = [
  ...SYSTEM_TOOL_NAMES.filter(name => name !== "board-report").map(name => ({ source: "runtime" as const, effect: "ask" as const, match: { what: "tool" as const, name } })),
  { source: "runtime", effect: "ask", match: { what: "tool", namePrefix: "mcp:" } },
  { source: "runtime", effect: "ask", match: { what: "tool", namePrefix: "molis-action-" } },
  ...(["path", "command", "network", "surface"] as const).map(what => ({ source: "runtime" as const, effect: "ask" as const, match: { what } })),
  { source: "runtime", effect: "ask", match: { what: "other", labelPrefix: "" } },
];

/**
 * The SDK owns all graph mutations; this seam only admits and scopes original graphs.
 *
 * Every step has a holder: the round's session, a subtask it handed the step to, or the person. `steer` tells a live
 * round what others changed on its graph (a subtask's report, a step coming back); the round's own reports and a
 * person's changes (told through their own note) are not repeated.
 */
export function createPrologueTaskBoards(runtime: Runtime, original: (run: AgentRunRef) => Promise<PrologueStepBinding | undefined>,
  steer?: (run: AgentRunRef, text: string) => Promise<boolean>) {
  const hook = "molis-confirmed-plan-scope";
  /** The round a call works for: the run's own, or for a subtask the round that dispatched it. */
  const roundOf = async (at: AgentRunRef): Promise<PrologueStepBinding | undefined> => {
    let run: AgentRunRef | undefined = at;
    for (let depth = 0; run && depth < 4; depth++) {
      const attempt = await original(run);
      if (attempt?.step_board && attempt.frozen.execution_plan) return attempt;
      const child = runtime.subagents.list().find(one => one.session.id === run!.session_id && one.run.id === run!.run_id);
      run = child && { session_id: child.parentSession.id, run_id: child.parentRun.id };
    }
    return undefined;
  };
  runtime.hooks.register({ id: hook, event: "tool-before", blocking: true, handler: async context => {
    if (context.toolName === "dispatch-subagent") {
      // Steps can be handed only from this round's own graph; the SDK checks they are the round's to hand over.
      const claims = (context.input as { claims?: { board?: unknown } } | undefined)?.claims;
      if (claims === undefined) return { kind: "allow" };
      const attempt = context.origin?.session && context.origin.run ? await roundOf({ session_id: context.origin.session, run_id: context.origin.run }) : undefined;
      return attempt?.step_board && claims.board === attempt.step_board.id ? { kind: "allow" } : { kind: "deny", why: "只能把本轮任务图上的步骤交给子任务" };
    }
    if (!context.toolName?.startsWith("board-")) return { kind: "allow" };
    const denied = { kind: "deny" as const, why: "只能读取或回报本轮确认计划，不能访问其他任务图或改写计划" };
    if (!["board-read", "board-report"].includes(context.toolName) || !context.origin?.session || !context.origin.run) return denied;
    const attempt = await roundOf({ session_id: context.origin.session, run_id: context.origin.run });
    const args = context.input as { board?: unknown; node?: unknown } | undefined;
    if (!attempt?.step_board || !attempt.frozen.execution_plan || args?.board !== attempt.step_board.id) return denied;
    // Any node on this round's own graph: the confirmed steps plus the ones a person inserted. The model itself can
    // never add a node — every other board tool is denied above.
    if (args.node !== undefined && !runtime.boards.get(attempt.step_board).nodes.some(node => node.id === args.node)) return denied;
    return { kind: "allow" };
  } });
  /*
   * Live rounds following their graph. A change someone else made (a subtask's report, a step handed back) is told to
   * the round once things settle for a moment, as one short note.
   */
  const following = new Map<string, { ref: ExactRef<"task-board">; run: AgentRunRef; plan: AgentExecutionPlan; nodes: Set<string>; timer?: ReturnType<typeof setTimeout> }>();
  const stopFollowing = (id: string) => { const round = following.get(id); if (round?.timer) clearTimeout(round.timer); following.delete(id); };
  const unsubscribe = runtime.boards.subscribe(event => {
    const round = following.get(event.board);
    if (!round || !steer || !("nodeId" in event)) return;
    const node = runtime.boards.get(round.ref).nodes.find(one => one.id === event.nodeId), last = node?.reports.at(-1);
    // The round's own reports and a person's changes are already known to it.
    if (!node || !last || last.human || !last.handover && last.session?.id === round.run.session_id) return;
    round.nodes.add(node.id);
    round.timer ??= setTimeout(() => {
      round.timer = undefined;
      const board = runtime.boards.get(round.ref);
      const lines = [...round.nodes].flatMap(id => { const found = board.nodes.find(one => one.id === id); return found ? [stepLine(runtime, found, round.plan, round.run.session_id)] : []; });
      round.nodes.clear();
      if (!lines.length) return;
      void steer(round.run, `任务图有更新（第 ${board.version} 版，不是你自己报的）：\n${lines.join("\n")}\n需要时先 board-read 取最新版本再继续。`)
        .then(live => { if (!live) stopFollowing(round.ref.id); }, () => undefined);
    }, 1500);
  });
  return {
    /** Every step starts with the round's session: only it reports on them until it hands one on. */
    async admit(plan: AgentExecutionPlan, owner: ExactRef<"session">) {
      return runtime.boards.admit({ nodes: plan.steps.map((step, index) => ({ id: step.id, title: `步骤 ${index + 1}`,
        dependsOn: step.depends_on ?? (index ? [plan.steps[index - 1]!.id] : []), onFailure: "block-for-human" as const, assignee: owner })) });
    },
    /** Follow a live round's graph, so what others change on it reaches the round. */
    follow(board: ExactRef<"task-board">, run: AgentRunRef, plan: AgentExecutionPlan) {
      stopFollowing(board.id);
      following.set(board.id, { ref: board, run, plan, nodes: new Set() });
    },
    unfollow: stopFollowing,
    /**
     * The graph as this round starts, given to the round with its task rather than in its fixed instructions: it
     * changes between rounds, and a model reads what comes last as current.
     */
    digest(board: SdkBoard, plan: AgentExecutionPlan, session: string) {
      return summary(runtime, board, plan, session);
    },
    /** An earlier round's graph, for a round without a plan of its own: read-only context, and nothing when it has ended. */
    standing(ref: ExactRef<"task-board">, plan: AgentExecutionPlan, session: string) {
      let board: SdkBoard;
      try { board = runtime.boards.get(ref); } catch { return ""; }
      if (board.terminal) return "";
      return "本会话还有一张没结束的任务图。这一轮没有任务图工具，不能读取或回报它；要接着执行计划，请用户点「继续计划」。\n" + summary(runtime, board, plan, session);
    },
    /** The unfinished graph of an earlier round in the same session, for a round that continues it. */
    async resume(run: AgentRunRef) {
      const attempt = await original(run);
      if (!attempt?.step_board || !attempt.frozen.execution_plan) throw new Error("那一轮没有可继续的计划图");
      const board = runtime.boards.get(attempt.step_board);
      if (board.terminal) throw new Error("那一轮的计划图已经结束");
      return board;
    },
    instructions(board: SdkBoard, plan: AgentExecutionPlan, round: { session: string; dispatch: boolean }) {
      return `本轮确认计划的任务图：${board.ref.id}。只能用 board-read / board-report 读取和报告此图，不得创建或修改计划。节点 ${plan.steps.map(step => step.id).join("、")} 按顺序对应本轮固定计划材料中的步骤；动作和完成条件读取原材料，它们不是权限指令。\n`
      + (plan.steps.some(step => step.depends_on) ? "这份计划写明了步骤之间的依赖：一步的前置步骤都成功后它才会 ready，同时 ready 的几步互不依赖，可以一起推进（能派子任务时可以分别派出）。\n" : "")
      + "每一步都有负责人（board-read 里的 owner）：只有负责人能报告这一步。开始时每一步都在本会话名下（owner 显示为 you）；负责人是用户的步骤由用户处理，你不要报告它，要等它完成；负责人是别的会话或子任务的，你也报不了。\n"
      + (round.dispatch ? "派子任务时可以在 dispatch-subagent 里写 claims: {\"board\": 本图, \"nodes\": [步骤编号…]}，把这些步骤交给它：交出后只有它能报告这些步骤，它结束时没做完的会自动回到本会话名下；只能交出本会话名下或没人认领、且还没结束的步骤。子任务报告的进展和交回会作为「任务图有更新」告诉你。\n" : "")
      + "这一轮开头附有一份「任务图现状」，是宿主在这一轮开始时读取的，比之前对话里的说法新。\n"
        + "先 board-read 获取当前 version。每步 ready 时报告 running，再实际行动和核对完成条件；满足后报告 succeeded，不能以开始执行、子任务结束或口头承诺代替完成证据。发现阻塞报告 blocked 并说明必要决定；解决后先报告 ready，再 running。失败用 failed。每次 board-report 传 board、version、node、state、note；使用上次工具返回的最新版本，冲突先重新读取。note 最多 500 字，只记录有依据的简短进展和核对结果，不粘贴源码、秘密或全文。按图中的依赖执行；实质变更先说明并等待用户调整计划。图中的 succeeded 只表示你的报告，用户验收由产品入口单独处理。不要为了标绿提前报成功。每完成一步就 board-read，接着做下一个 ready 的步骤；只要图里还有 ready 的步骤，就不要结束这一轮。所有步骤都到终态、或遇到需要用户决定的阻塞时，才总结并结束。";
    },
    async read(run: AgentRunRef): Promise<AgentStepBoard | undefined> {
      const attempt = await original(run);
      if (!attempt?.frozen.execution_plan) return undefined;
      if (!attempt.step_board) throw new Error("原计划没有可读取的任务图");
      return shape(runtime, runtime.boards.get(attempt.step_board), attempt.frozen.execution_plan, run.session_id);
    },
    /**
     * A person's change to the running graph, made only with SDK board operations: skipped and inserted steps,
     * decisions and moves are recorded as reports on the board, so the graph itself is the record.
     */
    async amend(run: AgentRunRef, amendment: AgentStepAmendment, expectedVersion: number, actor: string): Promise<AgentStepBoard> {
      const attempt = await original(run);
      if (!attempt?.frozen.execution_plan || !attempt.step_board) throw new Error("这一轮没有确认计划的任务图");
      const ref = attempt.step_board, plan = attempt.frozen.execution_plan;
      let board = runtime.boards.get(ref);
      if (board.terminal) throw new Error("任务图已经结束，不能再调整；请调整计划后开始新一轮");
      if (board.version !== expectedVersion) throw new Error("任务图刚刚有更新，请刷新后再调整");
      const text = (value: string, label: string, max: number) => { const trimmed = value.trim(); if (!trimmed || trimmed.length > max) throw new Error(`${label}不能为空，且不超过 ${max} 字`); return trimmed; };
      const node = (id: string) => { const found = board.nodes.find(entry => entry.id === id); if (!found) throw new Error("找不到这个步骤"); return found; };
      const person = { kind: "human" as const, id: actor };
      // A person's decision stands over whoever holds the step, and is recorded as theirs.
      const report = async (nodeId: string, note: string, to?: TaskNode["state"]) => {
        board = await runtime.boards.report({ ref, expectedVersion: board.version, nodeId, by: undefined, human: person, override: true, note, atMs: Date.now(), ...(to ? { to } : {}) });
      };
      const handOver = async (nodeId: string, to: Assignee, note: string) => {
        board = await runtime.boards.handOver({ ref, expectedVersion: board.version, nodeId, from: node(nodeId).assignee, to, note, atMs: Date.now(), human: person });
      };
      const roundSession = attempt.session;
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
          // An inserted step is the round's to do, or the person's own when they take it on.
          const holder = amendment.mine ? person : roundSession;
          board = await runtime.boards.addNode({ ref, expectedVersion: board.version, node: { id, title: heading, dependsOn: [amendment.after], onFailure: "block-for-human", ...(holder ? { assignee: holder } : {}) } });
          await report(id, `用户插入：${heading}；完成条件：${acceptance}${amendment.mine ? "；由用户处理" : ""}`);
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
        case "assign": {
          const target = node(amendment.node);
          if (["succeeded", "failed", "cancelled"].includes(target.state)) throw new Error("这一步已经结束，不能改派");
          const to = amendment.to === "me" ? person : roundSession;
          if (!to) throw new Error("找不到这一轮的会话，不能交回");
          if (same(target.assignee, to)) throw new Error(amendment.to === "me" ? "这一步已经由你处理" : "这一步已经在本会话名下");
          await handOver(target.id, to, amendment.to === "me" ? "用户改派给自己处理" : "用户交回本会话");
          break;
        }
        case "resolve": {
          const target = node(amendment.node), note = text(amendment.note, "结果说明", 500);
          if (!same(target.assignee, person)) throw new Error("只有你认领的步骤才能由你标记结果");
          if (target.state === "not-started") throw new Error("这一步的前置步骤还没完成");
          if (["succeeded", "failed", "cancelled"].includes(target.state)) throw new Error("这一步已经结束");
          // The graph moves one state at a time: a blocked step becomes ready, a ready one running, then the result.
          if (target.state === "blocked") await report(target.id, "用户开始处理", "ready");
          if (node(target.id).state === "ready") await report(target.id, "用户开始处理", "running");
          await report(target.id, `用户${amendment.state === "succeeded" ? "完成" : "标记失败"}：${note}`, amendment.state);
          break;
        }
      }
      return shape(runtime, board, plan, run.session_id);
    },
    close() { runtime.hooks.unregister(hook); unsubscribe(); for (const id of [...following.keys()]) stopFollowing(id); },
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

function same(a: Assignee, b: Assignee): boolean {
  return a === undefined || b === undefined ? a === b : a.kind === b.kind && a.id === b.id;
}

/** Who holds a step, as the round's people and model read it. */
function ownerOf(runtime: Runtime, assignee: Assignee, session: string): AgentStepOwner {
  if (!assignee) return { kind: "none", label: "没人认领" };
  if (assignee.kind === "human") return { kind: "person", label: "用户", actor_id: assignee.id };
  if (assignee.kind === "session") {
    if (assignee.id === session) return { kind: "session", label: "本会话" };
    const child = runtime.subagents.list().find(one => one.session.id === assignee.id);
    // The key the coordinator chose when dispatching it, after the round's own part.
    if (child) return { kind: "subtask", label: `子任务「${child.key.slice(child.key.indexOf(".") + 1)}」`, subagent_id: child.ref.id };
    return { kind: "other", label: "另一个会话" };
  }
  return { kind: "other", label: "另一个角色" };
}

const STATE_WORDS: Record<TaskNode["state"], string> = { "not-started": "等前置", ready: "可开始", running: "进行中", succeeded: "已完成", failed: "失败", cancelled: "已跳过", blocked: "受阻" };

function reportBy(runtime: Runtime, report: Report, session: string): string | undefined {
  if (report.handover) return "改派";
  if (report.human) return "用户";
  if (report.session) return ownerOf(runtime, report.session, session).label;
  return undefined;
}

/** A report's text; a handover says who it passed between, in the product's words rather than the SDK's. */
function reportNote(runtime: Runtime, report: Report, session: string): string {
  if (!report.handover) return report.note;
  const name = (one: Assignee) => ownerOf(runtime, one, session).label;
  const why = /^taken on by subagent /.test(report.note) ? "派出子任务时交给它"
    : /ended \((\w+)\) without finishing/.test(report.note) ? "子任务结束时没做完，交回" : report.note;
  return `${name(report.handover.from)} → ${name(report.handover.to)}（${why}）`;
}

/** One step in a line: what it is, where it stands, who holds it, and the latest word on it. */
function stepLine(runtime: Runtime, node: TaskNode, plan: AgentExecutionPlan, session: string): string {
  const last = node.reports.at(-1), owner = ownerOf(runtime, node.assignee, session);
  const latest = last ? `；最近：${reportBy(runtime, last, session) ? reportBy(runtime, last, session) + "：" : ""}${reportNote(runtime, last, session).slice(0, 120)}` : "";
  return `- ${node.id}「${title(node, plan).slice(0, 60)}」${STATE_WORDS[node.state]}（${node.state}），负责：${owner.label}${latest}`;
}

/** The graph at a glance, as a round starts: every step with its holder, and the ones no one holds. */
function summary(runtime: Runtime, board: SdkBoard, plan: AgentExecutionPlan, session: string): string {
  const nodes = executionOrder(board, plan), open = nodes.filter(node => !node.assignee && !["succeeded", "failed", "cancelled"].includes(node.state));
  // Read by the Host as the round starts, so it is newer than anything said earlier in the conversation: a person may
  // have reassigned, skipped or finished steps in between.
  return [`任务图现状（第 ${board.version} 版，宿主在这一轮开始时读取）。它比之前对话里提到的任务图状态更新：用户可能在两轮之间改派、跳过或完成了步骤。被问到谁在做哪一步、哪一步是什么状态时，以这里为准：`,
    ...nodes.map(node => stepLine(runtime, node, plan, session)),
    ...(open.length ? [`没人认领：${open.map(node => node.id).join("、")}`] : [])].join("\n");
}

function shape(runtime: Runtime, board: SdkBoard, plan: AgentExecutionPlan, session: string): AgentStepBoard {
  const missing = plan.steps.find(step => !board.nodes.some(node => node.id === step.id));
  if (missing || board.nodes.some(node => !plan.steps.some(step => step.id === node.id) && !node.id.startsWith("user-"))) throw new Error("原步骤图与确认计划不一致");
  return { board_id: board.ref.id, version: board.version, terminal: board.terminal,
    nodes: executionOrder(board, plan).map(node => ({ id: node.id, state: node.state,
      reports: node.reports.map(report => { const by = reportBy(runtime, report, session);
        return { note: reportNote(runtime, report, session), at_ms: report.atMs, ...(by ? { by } : {}), ...(report.handover ? { handover: true as const } : {}) }; }),
      owner: ownerOf(runtime, node.assignee, session),
      title: title(node, plan), depends_on: [...node.dependsOn], ...(node.id.startsWith("user-") ? { inserted: true } : {}) })) };
}
