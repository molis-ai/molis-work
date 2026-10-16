/**
 * The line under each input (specs/ai-input-receipts §3.3, §4.2) and the four questions behind it (§4.3).
 *
 * Wording only. Every status below is read off one receipt the SDK projected (plus what Molis itself would know and
 * the preview labels as simulated); nothing is computed from the text of an input. The words follow §3.3's rules:
 * "读到" only for a read fact, "AI 的理解" for every statement by the model, and nowhere "已生效" — that needs a
 * receipt from the thing that acted, and a recording of the SDK has none.
 */
import { IMPACT_LABEL, KIND_LABEL, SOURCE_LABEL, TREATMENT_LABEL, clock } from "./labels.ts";
import type { Ledger, Receipt } from "./facts.ts";

export type Tone = "wait" | "ok" | "attn" | "muted" | "warn";
export interface Headline {
  readonly key: string;
  readonly tone: Tone;
  readonly icon: string;
  readonly text: string;
}

export interface Phase {
  /** A question is waiting for the person (the SDK reported `awaiting-input`). */
  readonly awaiting: boolean;
  /** The run this receipt belongs to has ended. Only then can a receipt be "没读到就结束了". */
  readonly ended: boolean;
}

/** Another input of the scene named this one in `about`: the person's later correction. */
export interface Superseded { readonly byNumber: number }

export function headline(receipt: Receipt, phase: Phase, superseded?: Superseded): Headline {
  const carried = receipt.carried === undefined ? "" : "接续自上一轮 · ";
  if (receipt.state === "withdrawn") return { key: "withdrawn", tone: "muted", icon: "x", text: "已撤回 · 没进过 AI 的视野" };
  if (receipt.state === "unread") {
    const interrupted = receipt.endedBy?.code === "RUN_INTERRUPTED";
    const where = receipt.applied ? "已放进上下文，没等到回复" : "一直排着，没交给 AI";
    return { key: "unread", tone: "warn", icon: "alert", text: `${interrupted ? "这一轮被中断 · 没读到" : "没读到就结束了"} · ${where}` };
  }
  if (receipt.state === "accepted") {
    return { key: "accepted", tone: "wait", icon: "clock", text: `${carried}已送达 · 排在${phase.awaiting ? "你回答问题" : "当前回复"}之后` };
  }
  if (receipt.state === "applied") return { key: "applied", tone: "wait", icon: "clock", text: `${carried}已放进上下文，等 AI 回应` };
  const handling = receipt.handling;
  if (handling === undefined) return { key: "read", tone: "attn", icon: "eye", text: `${carried}AI 已读到 · 还没说明怎么处理` };
  const key = `explained:${handling.treatment}`;
  const base = `${carried}AI 的理解：${TREATMENT_LABEL[handling.treatment] ?? handling.treatment}`;
  if (superseded !== undefined) return { key: "superseded", tone: "muted", icon: "check", text: `${base} · 已被你后来的纠正替代（#${String(superseded.byNumber)}）` };
  const tone: Tone = handling.treatment === "not-adopted" || handling.treatment === "needs-clarification" || handling.treatment === "new-task" ? "attn" : "ok";
  return { key, tone, icon: tone === "attn" ? "eye" : "check", text: base };
}

// ---- evidence ----------------------------------------------------------------------------------------------------------
export interface Evidence {
  /** Where the fact comes from: the SDK's event ledger, the SDK's projection, the session queue, or Molis (simulated). */
  readonly source: "ledger" | "projection" | "queue" | "molis";
  readonly label: string;
  /** 1-based position in the run's ledger, when the fact is one event. */
  readonly at?: number;
  readonly atMs?: number;
}

function mentions(event: Ledger, steerId: string): boolean {
  if (event.type === "prompt" || event.type === "steer-applied" || event.type === "steer-withdrawn") return event["steerId"] === steerId;
  if (event.type === "steer-read") return Array.isArray(event["steerIds"]) && event["steerIds"].includes(steerId);
  if (event.type === "inputs-acknowledged") return Array.isArray(event["items"]) && event["items"].some(item => typeof item === "object" && item !== null && !Array.isArray(item) && item["steerId"] === steerId);
  return false;
}

/** Every event in the visible part of a ledger that bears on one input, in ledger order, plus the run's end if the input did not make it. */
export function evidenceFor(receipt: Receipt, events: readonly Ledger[], callNumber: (callId: string) => number | undefined): Evidence[] {
  const out: Evidence[] = [{ source: "projection", label: `SDK 投影 projectInputReceipts：${receipt.state}${receipt.handlingRevisions === undefined ? "" : `，说明 ${String(receipt.handlingRevisions)} 次`}` }];
  events.forEach((event, index) => {
    const at = index + 1;
    if (mentions(event, receipt.steerId)) {
      if (event.type === "prompt") out.push({ source: "ledger", at, label: `送达：账上第 ${String(at)} 条（${SOURCE_LABEL[receipt.source] ?? receipt.source}说的话落了账）`, atMs: receipt.atMs });
      else if (event.type === "steer-applied") out.push({ source: "ledger", at, label: `第 ${String(at)} 条：放进了模型上下文（还不等于读到）` });
      else if (event.type === "steer-read") {
        const call = typeof event["callId"] === "string" ? callNumber(event["callId"]) : undefined;
        out.push({ source: "ledger", at, label: `第 ${String(at)} 条：${call === undefined ? "一次模型调用" : `第 ${String(call)} 次模型调用`}读到` });
      } else if (event.type === "steer-withdrawn") out.push({ source: "ledger", at, label: `第 ${String(at)} 条：放进上下文之前撤回` });
      else if (event.type === "inputs-acknowledged") out.push({ source: "ledger", at, label: `第 ${String(at)} 条：AI 说明了怎么处理（它的声明，不是执行记录）` });
    }
    if ((event.type === "completed" || event.type === "failed" || event.type === "cancelled") && receipt.endedBy !== undefined) {
      const code = receipt.endedBy.code === undefined ? "" : `（${receipt.endedBy.code}）`;
      out.push({ source: "ledger", at, label: `第 ${String(at)} 条：这一轮以「${receipt.endedBy.state}」结束${code}，它没被读到` });
    }
    if (event.type === "run-recovered" && receipt.endedBy?.code === "RUN_INTERRUPTED") {
      out.push({ source: "ledger", at, label: `第 ${String(at)} 条：重启后核对并收口，没有重放任何操作` });
    }
  });
  return out;
}

// ---- the four questions -------------------------------------------------------------------------------------------------
export interface Answer { readonly text: string; readonly note?: string }
export interface FourQuestions {
  readonly how: Answer;
  readonly where: Answer;
  readonly changed: Answer;
  readonly left: Answer;
}

export function fourQuestions(receipt: Receipt, phase: Phase, label: (steerId: string) => string): FourQuestions {
  const handling = receipt.handling;
  const how: Answer = handling === undefined
    ? { text: receipt.state === "read" ? "AI 读到了，还没有说明" : "还没有说明", note: "AI 的说明只在读到之后才会有" }
    : { text: `AI 的理解：${KIND_LABEL[handling.kind ?? ""] ?? "输入"} · ${TREATMENT_LABEL[handling.treatment] ?? handling.treatment}`, ...(handling.note === undefined ? {} : { note: handling.note }) };
  const targets = handling?.targets.map(one => one.kind === "input" ? `另一条输入 ${label(one.id)}` : `应用里的「${one.id}」`) ?? [];
  const where: Answer = {
    text: [receipt.carried === undefined ? "这一轮" : "带进了这一轮", ...targets].join(" · "),
    note: "任务板的步骤、产品对象的关联是后面的切片，这里不画假数据",
  };
  const impacts = handling?.impacts ?? [];
  const changed: Answer = {
    text: impacts.length === 0 ? "AI 没有声明影响哪一项" : `AI 说：影响${impacts.map(one => IMPACT_LABEL[one] ?? one).join("、")}`,
    note: "实际变了什么要看任务板版本、文件变更和动作回执——预览没有，所以不显示「已变化」",
  };
  const left = leftOver(receipt, phase);
  return { how, where, changed, left };
}

function leftOver(receipt: Receipt, phase: Phase): Answer {
  if (receipt.state === "withdrawn") return { text: "没有：已撤回" };
  if (receipt.state === "unread") return { text: "没读到：带到下一轮，或撤回", note: receipt.endedBy?.code === "RUN_INTERRUPTED" ? "重启后只分类，不自动带入，不自动开新的一轮" : "不会自己开新的一轮，由你决定" };
  if (receipt.state === "accepted" || receipt.state === "applied") return { text: "等 AI 读到", note: phase.awaiting ? "有问题在等你回答，这条在你回答之后才会被读到" : "在这一批工具结束后的下一个模型边界" };
  const handling = receipt.handling;
  if (handling === undefined) return { text: "等 AI 说明怎么处理", note: "提醒次数用完后仍没说明，就停在这里" };
  switch (handling.treatment) {
    case "later-step": return { text: "说要做，还没完成", note: "完成要看后面那一步的回执" };
    case "new-task": return { text: "等你确认这个新任务", note: "AI 只是提议，没有建任何东西" };
    case "needs-clarification": return { text: "等你澄清", note: handling.note };
    case "not-adopted": return { text: "等你决定：接受，还是坚持", note: "坚持的话作为一条新输入发给 AI" };
    case "apply-now": return { text: "AI 说立即处理；是否做完要看执行回执", note: "预览没有执行回执" };
    default: return { text: "没有未处理的" };
  }
}

export function timeOf(receipt: Receipt): string {
  return clock(receipt.atMs);
}
