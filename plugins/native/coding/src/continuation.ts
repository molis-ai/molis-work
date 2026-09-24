import type { AgentCommandOutput, AgentReviewReceipt, AgentReviewRequest, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Continuing an unfinished round from where it stopped.
 *
 * The model is not trusted to reconstruct what happened from its own history —
 * after an interruption it has misread closed questions as open and old rounds
 * as someone else's. The continuation states the Host's own facts instead:
 * which writes landed, which were refused, which commands ran and how they
 * exited, what never finished. Nothing is replayed; the next round starts
 * fresh and every write or command it proposes goes through review again.
 */

export const CONTINUATION_MARKER = "【继续上一轮】";
const ORIGINAL_HEAD = "原任务：\n";
const FACTS_HEAD = "\n\n宿主核实的事实";
const LIMIT = 40;

/** The intent a role was started with; parallel rounds carry assignments a continuation cannot re-derive. */
const INTENT_BY_ROLE: Record<string, string> = {
  builder: "execute", writer: "edit", reader: "discuss", planner: "plan", reviewer: "review",
};

export interface ContinuationInput {
  /** 1-based position of the round in its session. */
  number: number;
  run: AgentRunView;
  reviews: ReadonlyArray<{ request: AgentReviewRequest; receipt: AgentReviewReceipt | null }>;
  commands: ReadonlyArray<{ call_id: string; output: AgentCommandOutput | null }>;
  /** The round ran a confirmed plan whose graph still has steps to do; it continues on that same graph. */
  plan_unfinished?: boolean;
}

const shell = (command: string, args: readonly string[]) => [command, ...args].join(" ");
const clip = (text: string, size: number) => text.length > size ? text.slice(0, size) + "…" : text;

/** A round that started from the digest of earlier rounds carries it ahead of its own request. */
export const HISTORY_DIGEST_MARKER = "【前面的对话摘要】";
export const HISTORY_DIGEST_TASK_HEAD = "\n\n【本轮任务】\n";

/** A digest round's own request, without the digest it carried. */
export function digestTask(text: string): string {
  if (!text.startsWith(HISTORY_DIGEST_MARKER)) return text;
  const at = text.indexOf(HISTORY_DIGEST_TASK_HEAD);
  return at < 0 ? text : text.slice(at + HISTORY_DIGEST_TASK_HEAD.length);
}

/** Files a person named with @ travel after their words, as they were when sent. */
export const MENTIONS_MARKER = "\n\n【你提到的文件（发送时的内容）】\n";

/** What the person wrote: without a digest ahead of it or the files attached after it. */
export function requestText(text: string): string {
  const own = digestTask(text), at = own.indexOf(MENTIONS_MARKER);
  return at < 0 ? own : own.slice(0, at);
}

/** The user's own task, even when the round being continued was itself a continuation or carried a digest. */
export function originalTask(run: AgentRunView): string {
  const first = requestText(run.turns.find(turn => turn.kind === "user")?.text ?? "");
  if (!first.startsWith(CONTINUATION_MARKER)) return first;
  const start = first.indexOf(ORIGINAL_HEAD), end = first.indexOf(FACTS_HEAD);
  return start < 0 || end < start ? first : first.slice(start + ORIGINAL_HEAD.length, end);
}

export function codingContinuation(input: ContinuationInput): { task: string; intent: string } {
  const { run } = input;
  const left = run.step_board?.nodes.filter(node => !["succeeded", "cancelled"].includes(node.state)).length ?? 0;
  if (!(["failed", "stopped", "cancelled"].includes(run.phase) || run.phase === "completed" && input.plan_unfinished && left)) {
    throw new Error(run.phase === "completed" ? "这一轮已经完成；需要继续时请直接写下一步要求" : "这一轮还没有结束，不能从断点继续");
  }
  const intent = INTENT_BY_ROLE[run.frozen.role_id];
  if (!intent) throw new Error("并行分工或协作轮次带有目录分工，请在输入框写明要继续的部分再发送");
  const task = originalTask(run).trim();
  if (!task) throw new Error("读不到这一轮的原任务，不能拼出继续说明");

  const reason = (run.stop_reason ?? "").trim().replace(/[。.]+$/, "");
  const why = run.phase === "completed" ? `这一轮结束了，但计划还有 ${left} 步没完成` : run.phase === "stopped" ? "你停止了这一轮" : run.phase === "cancelled" ? "这一轮被取消"
    : reason.startsWith("本轮因中断结束") ? "服务中断，中断前已发生的操作已核对"
    : reason ? `这一轮出错结束：${clip(reason, 400)}` : "这一轮出错结束";

  const writes: string[] = [], commands: string[] = [];
  const outputs = new Map(input.commands.map(entry => [entry.call_id, entry.output]));
  for (const { request, receipt } of input.reviews) {
    const document = request.document;
    const note = receipt?.note?.trim() ? `（意见：${clip(receipt.note.trim(), 300)}）` : "";
    const settled = receipt?.effect_settled === true, uncertain = Boolean(receipt?.effect_uncertain || receipt?.delivery_error);
    if (document.kind === "text-edit") {
      writes.push(uncertain ? `结果未知，请先核对：${document.target_path}`
        : settled ? `已写入：${document.target_path}`
        : receipt?.status === "rejected" ? `被拒绝，未写入：${document.target_path}${note}`
        : receipt?.status === "approved" ? `已批准但未确认写入，请先核对：${document.target_path}`
        : `未执行：${document.target_path}`);
    } else if (document.kind === "command") {
      // What ran is stated once, from its receipt below; reviews add only what did not run or is unknown.
      const line = clip(shell(document.command, document.args), 200);
      if (uncertain) commands.push(`结果未知，请先核对：${line}`);
      else if (receipt?.status === "rejected") commands.push(`被拒绝，未运行：${line}${note}`);
      else if (!settled && receipt?.status !== "approved") commands.push(`未运行：${line}`);
    }
  }
  for (const entry of run.activity) {
    const output = entry.name === "run-command" ? outputs.get(entry.call_id) : undefined;
    if (output === null) commands.push(`回执无法读取，结果未知：${clip(entry.target, 200)}`);
    if (output) {
      const state = output.timed_out ? "超时" : output.cancelled ? "已取消" : output.exit_code === null ? "退出码未知" : `exit ${output.exit_code}`;
      commands.push(`已运行：${clip(output.command, 200)} → ${state}`);
    }
  }
  const reads = [...new Set(run.activity.filter(entry => ["read", "read-file"].includes(entry.name) && entry.state === "completed" && entry.target).map(entry => entry.target))];
  const unfinished = run.activity.filter(entry => entry.state === "started" || entry.state === "unknown")
    .map(entry => `${entry.name}${entry.target ? " " + clip(entry.target, 160) : ""}`);
  const steps = run.step_board?.nodes.map((node, index) => `${node.title ? `「${clip(node.title, 80)}」` : `步骤 ${index + 1}`}（${node.id}）：${{ "not-started": "未开始", ready: "可开始", running: "进行中", succeeded: "已回报完成", failed: "已回报失败", cancelled: "已取消", blocked: "受阻" }[node.state]}`) ?? [];
  const planNote = input.plan_unfinished ? "\n\n这一轮沿用同一张任务图继续：先 board-read，从第一个没完成的步骤接着做，已完成的步骤不要重报。把剩下的步骤依次做完——只要还有可以开始的步骤，就不要结束这一轮；全部完成或遇到需要我决定的阻塞时，再说明做了什么。" : "";

  // Blank lines keep each section its own Markdown list when the turn is rendered.
  const section = (title: string, lines: readonly string[]) => lines.length
    ? `\n\n${title}\n${lines.slice(0, LIMIT).map(line => "- " + line).join("\n")}${lines.length > LIMIT ? `\n- 另有 ${lines.length - LIMIT} 项未列出` : ""}` : "";
  const facts = [
    section("文件写入：", writes),
    section("命令：", commands),
    section("已读取的文件：", reads.map(path => clip(path, 200))),
    section("没有结束的操作（不要当作已完成）：", unfinished),
    section("计划步骤：", steps),
  ].join("");

  return {
    intent,
    task: `${CONTINUATION_MARKER}第 ${input.number} 轮没有完成：${why}。请从断点继续完成原任务。\n\n${ORIGINAL_HEAD}${task}${FACTS_HEAD}（以此为准，不要凭对话记忆推断）：${facts || "\n\n- 这一轮没有经过审查的写入或命令"}\n\n继续时：先读取相关文件的当前内容核对状态；已写入的内容和已运行的命令不要重复，确需重新验证时说明原因；被拒绝的修改按意见调整后再提出；结果未知的操作先核对再决定。${input.plan_unfinished ? "" : "完成后说明这一轮实际做了什么、还剩什么。"}${planNote}`,
  };
}
