/// <reference lib="dom" />
import type { AgentInputModelClaim, AgentInputQuestion, AgentTurnSteer } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { compactScript } from "./compact-script.js";

/** What the receipt reads of a run-view turn (`AgentTurnView`) and its round: the round's run id and the questions it waits on. */
export interface InputReceiptTurn { turn_id: string; kind: string; text: string; steer?: AgentTurnSteer }
export interface InputReceiptRound { run_id?: string; awaiting_input?: readonly unknown[] }
export interface InputReceipts {
  /**
   * The receipt under one of the person's supplements, or the Host's mark on a note it wrote for them; null for anything
   * else. The same turn always gets the same element back, changed in place, so an open detail stays open across repaints.
   */
  line(turn: InputReceiptTurn, round?: InputReceiptRound): HTMLElement | null;
}

/**
 * One receipt for every conversation that takes supplements: Coding's bubble and the Assistant's thread
 * (specs/ai-input-receipts §3.3, §4.2, §4.3; stage 3c).
 *
 * Two layers, never mixed. The fact line says what the runtime's ledger says (`steer.state`: sent, in the context, read,
 * not read by the end of the round, taken back) and never that the model followed it. The model's own statement
 * (`model_claim`) is a second line marked 「AI 说」 with a dashed rule, and its detail sits under 「AI 自己说的，Molis 没有核对」:
 * it is a claim, it moves nothing. Questions asked about the input get their own line while one waits.
 *
 * The receipt is a disclosure (`details`): the summary is the lines, the body answers what it can from the ledger today (how
 * the AI says it handles it, what it points at, what it says it changes, the questions, and the ids behind each line).
 * Observed changes come with stage 3d. One polite status region per page says each change once, naming the supplement, and
 * never moves focus; the first paint says nothing, and the receipts themselves are `aria-live=off` so a surrounding log does
 * not say it twice.
 */
export function createInputReceipts(L: (text: string) => string): InputReceipts {
  const FACT: Record<string, string> = { received: "已送达", applied: "已放进上下文，等 AI 回应", read: "AI 已读到", unread: "这一轮结束时 AI 没读到，留给下一轮", withdrawn: "已撤回" };
  const TREATMENT: Record<string, string> = { "apply-now": "立即影响当前这一步", "later-step": "留到后面某一步", "new-task": "作为新任务", "needs-clarification": "需要你澄清", "not-adopted": "暂不采纳", answered: "已在回复里回答", noted: "记下，不改变执行", merged: "与另一条一起处理" };
  const KIND: Record<string, string> = { supplement: "补充", correction: "纠正", constraint: "约束", request: "新需求", question: "提问" };
  const IMPACT: Record<string, string> = { objective: "目标", scope: "范围", priority: "优先级", approach: "实现方案", acceptance: "验收条件", outputs: "已有成果", constraint: "约束" };
  const TARGET: Record<string, string> = { input: "另一条补充", "app-ref": "应用里的对象", todo: "这一轮的待办", pending: "一个问题", "board-node": "计划的一步" };
  const QUESTION: Record<string, string> = { open: "等你回答", settled: "已回答", expired: "已过期", cancelled: "已取消", unresolved: "这一轮结束时还没回答" };
  const shown = new Map<string, { root: HTMLDetailsElement; said: string }>();
  let live: HTMLElement | null = null, pending: string[] = [];
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = "") => {
    const node = document.createElement(tag); node.className = cls; node.textContent = text; return node;
  };
  const say = (words: string) => {
    if (!pending.length) queueMicrotask(() => {
      if (!live?.isConnected) { live = make("p", "mw-sr-only"); live.setAttribute("role", "status"); document.body.append(live); }
      live.textContent = pending.join(L("；")); pending = [];
    });
    pending.push(words);
  };
  const row = (list: HTMLElement, term: string, value: string) => { list.append(make("dt", "", L(term)), make("dd", "", value)); };
  const treatment = (claim: AgentInputModelClaim) => L(TREATMENT[claim.treatment] ?? claim.treatment);
  const impacts = (claim: AgentInputModelClaim) => claim.impacts.map(one => L(IMPACT[one] ?? one)).join(L("、"));
  const claimLine = (claim: AgentInputModelClaim) => treatment(claim) + (claim.impacts.length ? L(" · 影响") + impacts(claim) : "");
  const asking = (questions: readonly AgentInputQuestion[]) => {
    const open = questions.filter(one => one.state === "open").length;
    return open ? L("为这条问了你问题，等你回答") : questions.some(one => one.state === "unresolved") ? L("为这条问的问题没等到回答") : "";
  };
  const body = (steer: AgentTurnSteer) => {
    const part = make("div", "mw-receipt__body"), facts = make("dl", "mw-receipt__facts");
    part.append(make("p", "mw-receipt__note", L("读到不代表已遵循，也不撤销先前操作；补充要求不代替回答问题。")), facts);
    row(facts, "运行记录", L(FACT[steer.state] ?? FACT.received) + L(" · 输入 ") + steer.id);
    for (const [index, question] of (steer.questions ?? []).entries()) row(facts, index ? "" : "为它问的问题", L(QUESTION[question.state] ?? question.state) + L(" · 问题 ") + question.pending_id);
    const claim = steer.model_claim;
    if (!claim) return part;
    const group = make("div", "mw-receipt__claimed"), said = make("dl", "");
    group.append(make("p", "mw-receipt__who", L("AI 自己说的，Molis 没有核对")), said);
    row(said, "怎么处理", (claim.kind ? L(KIND[claim.kind] ?? claim.kind) + L(" · ") : "") + treatment(claim));
    if (claim.targets.length) row(said, "指向", claim.targets.map(target => L(TARGET[target.kind] ?? target.kind) + " " + target.id).join(L("、")));
    if (claim.impacts.length) row(said, "说会改变", impacts(claim));
    if (claim.note) row(said, "AI 的原话", L("“") + claim.note + L("”"));
    row(said, "出处", (claim.revisions > 1 ? L("说明过 ") + claim.revisions + L(" 次，以最新一次为准") : L("说明过 1 次")) + (claim.tool_call_id ? L(" · 工具调用 ") + claim.tool_call_id : ""));
    part.append(group);
    return part;
  };
  return {
    line(turn, round) {
      const steer = turn.steer;
      if (!steer) return null;
      if (turn.kind === "notice") return make("small", "mw-receipt mw-receipt--host", L("Molis 的说明，不是你发的话"));
      if (turn.kind !== "user") return null;
      const waits = (round?.awaiting_input ?? []).length > 0 && (steer.state === "received" || steer.state === "applied");
      const fact = L(waits ? "已补充到这一轮；问题仍在等你回答" : FACT[steer.state] ?? FACT.received);
      const claim = steer.model_claim ? claimLine(steer.model_claim) : "", ask = asking(steer.questions ?? []);
      // Known by its round and input id: a turn id only counts within one round, the page draws every round, and a supplement
      // a round did not read is carried into the next under the same input id (decision D28).
      const id = round?.run_id + " " + steer.id, key = JSON.stringify([fact, claim, ask, steer]), was = shown.get(id);
      if (was && was.said === key) return was.root;
      const root = was?.root ?? make("details", "mw-receipt");
      const summary = make("summary", ""), head = make("span", "mw-receipt__fact", fact);
      summary.append(head);
      if (claim) { const line = make("span", "mw-receipt__claim"); line.append(make("b", "", L("AI 说")), claim); summary.append(line); }
      if (ask) summary.append(make("span", "mw-receipt__ask", ask));
      root.dataset.state = waits ? "waiting" : steer.state; root.setAttribute("aria-live", "off");
      root.replaceChildren(summary, body(steer));
      if (was) {
        const quote = turn.text.length > 12 ? turn.text.slice(0, 12) + "…" : turn.text, before = JSON.parse(was.said) as string[];
        if (before[0] !== fact) say(L("你的补充「") + quote + L("」：") + fact);
        if (claim && before[1] !== claim) say(L("AI 说你的补充「") + quote + L("」：") + claim);
        if (ask && before[2] !== ask) say(ask);
      }
      shown.set(id, { root, said: key });
      return root;
    },
  };
}

/** The page program: `(translate) => InputReceipts`. The workbench makes one and hands it to the Assistant and every plugin (`host.receipts`). */
export const INPUT_RECEIPTS_CLIENT_SCRIPT = compactScript(createInputReceipts.toString());

/** The receipt's words in English (served through the workbench catalog, `apps/workbench/src/i18n/en.ts`). */
export const INPUT_RECEIPTS_EN: Readonly<Record<string, string>> = {
  "已送达": "Delivered",
  "已放进上下文，等 AI 回应": "In the AI's context, awaiting its response",
  "AI 已读到": "Read by the AI",
  "这一轮结束时 AI 没读到，留给下一轮": "Not read by the end of this round; kept for the next",
  "已撤回": "Withdrawn",
  "已补充到这一轮；问题仍在等你回答": "Added to this round; the question still waits for your answer",
  "读到不代表已遵循，也不撤销先前操作；补充要求不代替回答问题。": "Read does not mean followed, and it does not undo earlier steps. A supplement does not answer a question.",
  "Molis 的说明，不是你发的话": "A note from Molis, not your words",
  "立即影响当前这一步": "Changes the current step now",
  "留到后面某一步": "Kept for a later step",
  "作为新任务": "As a new task",
  "需要你澄清": "Needs you to clarify",
  "暂不采纳": "Not adopted for now",
  "已在回复里回答": "Answered in the reply",
  "记下，不改变执行": "Noted; the work does not change",
  "与另一条一起处理": "Handled with another input",
  "补充": "Supplement",
  "纠正": "Correction",
  "约束": "Constraint",
  "新需求": "New request",
  "提问": "Question",
  "实现方案": "Approach",
  "已有成果": "Existing outputs",
  "另一条补充": "another supplement",
  "应用里的对象": "an item in the app",
  "这一轮的待办": "this round's to-do",
  "一个问题": "a question",
  "计划的一步": "a step of the plan",
  "已回答": "answered",
  "这一轮结束时还没回答": "not answered by the end of the round",
  " · 影响": " · affects ",
  "为这条问了你问题，等你回答": "A question about this waits for your answer",
  "为这条问的问题没等到回答": "A question about this was never answered",
  "运行记录": "Run record",
  " · 输入 ": " · input ",
  "为它问的问题": "Questions about it",
  " · 问题 ": " · question ",
  "AI 自己说的，Molis 没有核对": "What the AI says itself; Molis has not checked it",
  "怎么处理": "Handling",
  "指向": "Points at",
  "说会改变": "Says it changes",
  "AI 的原话": "The AI's words",
  "说明过 ": "Stated ",
  " 次，以最新一次为准": " times; the latest stands",
  "说明过 1 次": "Stated once",
  " · 工具调用 ": " · tool call ",
  "AI 说": "AI says",
  "你的补充「": "Your supplement \"",
  "」：": "\": ",
  "AI 说你的补充「": "The AI says your supplement \"",
};
