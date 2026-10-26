import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { RECEIPT_WORDS, type InteractionNextStep } from "@molis-ai/molis-work-contracts/platform/ui";
import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentInputModelClaim, AgentInputQuestion, AgentQueuedInput, AgentTurnSteer } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { AssistantActivity, AssistantRound, AssistantWorkObject, AssistantWorkState, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { NEXT_STEP } from "../agent-next-steps.js";

/** Whether the person can open this object from where the work shows it: it has a place to open, and its owner still has it. One test for the delivery note and the round outcome. */
export function isOpenable(object: AssistantWorkObject): boolean {
  return Boolean(object.open) && object.state !== "missing";
}

/** How the latest round ended, as the delivery note says it. */
type DeliveryEnd = "completed" | "failed" | "stopped";

/** One supplement of the person, as the runtime's ledger and the AI's own statement have it. Facts only; the words are `deliveryNoteHtml`'s. */
interface DeliverySupplement {
  id: string;
  text: string;
  state: AgentTurnSteer["state"];
  /** The earlier supplement this one corrects: its words when that one is shown, null when only the ledger names it. */
  about: { text: string | null } | null;
  questions: AgentInputQuestion[];
  claim: AgentInputModelClaim | null;
}

interface DeliveryResult {
  /** The place in `view.objects`, which is where the page's `data-assistant-object` finds the object. */
  index: number;
  kind: string;
  id: string;
  title: string;
  state: AssistantWorkObject["state"];
  movedTo: string | null;
  /** Decided by `isOpenable`, the test the round outcome uses too. */
  open: boolean;
}

/**
 * What a work's delivery note says (specs/ai-input-receipts §9.2, stage 3e-2a): facts only, no wording. Every part stands on
 * its own record: the ledger for the supplements, the AI's statement kept apart, the round's activity, the sub-tasks, the
 * `result` edges, the session's queue. Which result came of which supplement is not here: nothing records it.
 */
export interface DeliveryNote {
  /** The note's key in the conversation (`data-ix-record`), which the outcome slot's steps name as well. */
  record: string;
  end: DeliveryEnd;
  supplements: DeliverySupplement[];
  /** The step list the latest round keeps for itself: the AI's own report of what it means to do, never a check. */
  steps: Array<{ text: string; state: NonNullable<AssistantRound["steps"]>[number]["state"] }>;
  changes: Array<Pick<AssistantActivity, "call_id" | "target" | "state">>;
  subtasks: Array<{ title: string; state: AssistantWorkState }>;
  results: DeliveryResult[];
  /** Null: the queue was not read this time. `[]`: it was read, and nothing waits. */
  queue: Array<{ text: string; source: AgentQueuedInput["source"] }> | null;
}

/** The verbs of what the Assistant or its professional Agent changed; reading and looking things up are not a delivery. */
const CHANGES: ReadonlySet<string> = new Set(["change", "file-change"]);

/** Null while any round is live, or while the latest one is not settled (`unknown`, `reconcile-required`); otherwise how the latest one ended. A work that needs checking after a continuation does not change how that round ended. */
function endOf(view: AssistantWorkView): DeliveryEnd | null {
  const last = view.rounds.at(-1);
  if (!last) return null;
  if (view.rounds.some(round => round.phase !== "unknown" && round.phase !== "reconcile-required" && !isTerminalAgentPhase(round.phase))) return null;
  if (last.phase === "unknown" || last.phase === "reconcile-required") return null;
  return last.phase === "completed" ? "completed" : last.phase === "failed" ? "failed" : "stopped";
}

/**
 * The delivery note's facts, or null: nothing to say while a round is live, and no note for a work the person never added
 * to. A `notice` turn is the Host's own line and is not listed; the Host's and other sessions' words show only on the queue.
 */
export function deliveryNote(view: AssistantWorkView): DeliveryNote | null {
  const end = endOf(view);
  if (!end) return null;
  // The same supplement is on every round that carries it; it keeps its first place and its latest facts.
  const sent = new Map<string, { text: string; steer: AgentTurnSteer }>();
  for (const round of view.rounds) for (const turn of round.turns) if (turn.kind === "user" && turn.steer) sent.set(turn.steer.id, { text: turn.text, steer: turn.steer });
  if (!sent.size) return null;
  const supplements = [...sent.values()].map(({ text, steer }): DeliverySupplement => ({
    id: steer.id, text, state: steer.state, questions: steer.questions ?? [], claim: steer.model_claim ?? null,
    about: steer.about ? { text: sent.get(steer.about)?.text ?? null } : null,
  }));
  return {
    record: NEXT_STEP.record("delivery", view.work.work_id), end, supplements, steps: (view.rounds.at(-1)?.steps ?? []).map(({ text, state }) => ({ text, state })),
    changes: view.rounds.flatMap(round => round.activity.filter(item => CHANGES.has(item.verb)).map(({ call_id, target, state }) => ({ call_id, target, state }))),
    subtasks: (view.delegated ?? []).filter(child => !child.taken_back).map(child => ({ title: child.title, state: child.state })),
    results: view.objects.flatMap((object, index): DeliveryResult[] => object.relation !== "result" ? []
      : [{ index, kind: object.subject.kind, id: object.subject.id, title: object.title, state: object.state, movedTo: object.moved_to?.title ?? null, open: isOpenable(object) }]),
    queue: view.queued_inputs ? view.queued_inputs.map(item => ({ text: item.text, source: item.source })) : null,
  };
}

const DOT = " · ";
const esc = escapeHtml;
/** A bit of the person's words, for a button or a line: enough to know which one. */
const clip = (text: string, max = 24) => { const chars = Array.from(text.replace(/\s+/g, " ").trim()); return chars.length > max ? chars.slice(0, max).join("") + "…" : chars.join(""); };

/** The words for a work's state, short and unlike 「已完成」: a part that ended is only said to have ended. */
function workWords(say: (text: string, values?: Record<string, string | number>) => string): Record<AssistantWorkState, string> {
  return { idle: say("尚未开始"), running: say("进行中"), "waiting-input": say("等你回答"), "waiting-review": say("等你确认"), paused: say("已暂停"),
    completed: say("已结束"), failed: say("失败"), stopped: say("已停止"), "needs-check": say("需要核对") };
}

/** How a result stands now, in the words the card in the conversation uses; empty when it is as recorded. */
function resultState(result: DeliveryResult, say: (text: string, values?: Record<string, string | number>) => string): string {
  if (result.state === "changed") return say("之后被改过");
  if (result.state === "missing") return say("已不存在");
  if (result.state === "unavailable") return say("暂时读不到");
  if (result.state !== "moved") return "";
  return result.movedTo === null ? say("在别的项目里") : say("已移到") + say("「") + result.movedTo + say("」");
}

/**
 * The note as html: the record the page puts in the conversation as it is, every piece of text escaped. Two groups stay apart: what the runtime's record says, and what the AI says
 * of itself (never checked by Molis); then what was done, the results, and what is still missing. Never a word that says a
 * supplement was followed or a thing completed.
 */
export function deliveryNoteHtml(note: DeliveryNote, say: (text: string, values?: Record<string, string | number>) => string): string {
  const { FACT, TREATMENT, IMPACT, QUESTION, STEP } = RECEIPT_WORDS, states = workWords(say);
  // The AI's report of its own steps: done is only "the model reports done".
  const stepWords = { pending: say("尚未开始"), "in-progress": say("进行中"), done: say(STEP.succeeded), abandoned: say(STEP.cancelled) };
  const quoted = (text: string) => say("「") + clip(text) + say("」");
  // The page binds a supplement's button to its receipt (`shared.link`) by the input id.
  const supplement = (one: DeliverySupplement) => `<button class="mw-btn mw-btn--sm mw-btn--link" type="button" data-input="${esc(one.id)}">${esc(quoted(one.text))}</button>`;
  const line = (...parts: string[]) => parts.join(DOT);
  const group = (title: string, items: string[], attrs = "") => items.length
    ? `<div${attrs}><p class="mw-receipt__who">${esc(title)}</p><ul class="mw-tray__list">${items.map(item => `<li>${item}</li>`).join("")}</ul></div>` : "";
  const change = (item: DeliveryNote["changes"][number]) => esc(say("改动：") + item.target + DOT + (item.state === "completed" ? say("已修改") : item.state === "failed" ? say("没有完成") : say("结果未确认")));
  const part = (item: DeliveryNote["subtasks"][number]) => esc(say("子任务：") + item.title + DOT + states[item.state]);
  const ended = (item: DeliveryNote["subtasks"][number]) => item.state === "completed" || item.state === "failed" || item.state === "stopped";
  const unsure = (item: DeliveryNote["changes"][number]) => item.state !== "completed" && item.state !== "failed";
  const result = (item: DeliveryResult) => {
    const word = resultState(item, say), name = item.open
      ? `<button class="assistant-inline-object" type="button" data-assistant-object="${item.index}" data-ix-press="open:${esc(item.kind)}:${esc(item.id)}">${esc(item.title)}</button>` : esc(item.title);
    return word ? line(name, esc(word)) : name;
  };
  const recorded = note.supplements.map(one => line(supplement(one), esc(say(FACT[one.state])),
    ...one.about ? [esc(say("纠正：针对") + (one.about.text === null ? say("更早的一条") : quoted(one.about.text)))] : [],
    ...one.questions.map(question => esc(say("为它问的问题：") + say(QUESTION[question.state])))));
  const statements = note.supplements.flatMap(one => one.claim
    ? [line(supplement(one), esc(say(TREATMENT[one.claim.treatment]) + (one.claim.impacts.length ? say(" · 影响") + one.claim.impacts.map(impact => say(IMPACT[impact])).join(say("、")) : "")))]
    : one.state === "read" ? [line(supplement(one), esc(say("AI 读到了，没说怎么处理")))] : []);
  const claimed = [...statements, ...note.steps.map(item => esc(say("AI 报告的步骤：") + clip(item.text, 80) + DOT + stepWords[item.state]))];
  const missing = [
    ...note.supplements.filter(one => one.state !== "read" && one.state !== "withdrawn").map(one => line(supplement(one), esc(say(FACT[one.state])))),
    ...note.supplements.flatMap(one => one.questions.filter(question => question.state === "open" || question.state === "unresolved")
      .map(question => line(supplement(one), esc(say("为它问的问题：") + say(QUESTION[question.state]))))),
    ...note.subtasks.filter(item => !ended(item)).map(part),
    ...note.changes.filter(unsure).map(change),
    ...note.results.filter(item => item.state === "missing" || item.state === "unavailable").map(item => esc(say("读不到的结果：") + item.title + DOT + resultState(item, say))),
    ...note.queue === null ? [] : note.queue.length ? note.queue.map(item => esc(say("排在队里：") + quoted(item.text))
      + (item.source === "host" ? DOT + esc(say("Molis 写的")) : item.source === "peer" ? DOT + esc(say("别的会话写的")) : "")) : [esc(say("没有排队"))],
  ];
  const title = note.end === "completed" ? say("截至最近一轮：最近一轮已结束") : note.end === "failed" ? say("截至最近一轮：最近一轮失败") : say("截至最近一轮：已停止");
  return `<div class="mw-receipt" data-ix-record="${esc(note.record)}" aria-live="off"><div class="mw-receipt__body"><p class="mw-receipt__who">${esc(title)}</p>`
    + group(say("记录里的"), recorded) + group(say("AI 自己说的，Molis 没有核对"), claimed, ' class="mw-receipt__claimed"')
    + group(say("做了什么"), [...note.changes.filter(item => !unsure(item)).map(change), ...note.subtasks.filter(ended).map(part)])
    + group(say("这项工作做出的结果"), note.results.map(result)) + group(say("还差什么"), missing) + "</div></div>";
}

/**
 * The delivery note's steps in the outcome slot (specs/context-program §21.9): one to bring the note into view, and the
 * first result that opens, pressed through the note's own button. None when the latest round failed: the slot then gives
 * only the retry, and the note is still drawn. The note is the record `delivery:<work>` in the conversation. A caller that
 * has the view's note already passes it (null for none), so a reply works it out once.
 */
export function deliverySteps(view: AssistantWorkView, say: (text: string, values?: Record<string, string | number>) => string, note: DeliveryNote | null = deliveryNote(view)): InteractionNextStep[] {
  if (!note || view.rounds.at(-1)?.phase === "failed") return [];
  const { record } = note, first = note.results.find(item => item.open);
  return [{ id: record, label: say("看交付说明"), source: say("这项工作的补充和结果") },
    ...first ? [{ id: NEXT_STEP.press(record, `open:${first.kind}:${first.id}`), label: say("打开「{title}」", { title: first.title }), source: say("这项工作做出的结果"), primary: false }] : []];
}
