import { renderInteractionQuestion, type InteractionField, type InteractionValues } from "@molis-ai/molis-work-design-system";
import type { AgentPendingQuestion, AgentQuestionAnswer, AgentQuestionProblem, AgentQuestionProblemReason } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import type { AssistantStore } from "./assistant-store.js";

/**
 * The Assistant's question card (specs/ai-interaction-experience A1): a question a round stopped on, drawn on the Host
 * with the design system's shared card, so the island only binds behaviour and never builds the form itself. What the
 * person sends back is turned into the Runtime's answer shape here, beside the card it came from; a half-written answer
 * is kept with the work, so it survives a reload, another tab or a switch to another work.
 *
 * A round's question is a questionnaire of choice questions (each by its number), a short set of options, or a question
 * answered in words. Typed questions (dates, numbers, references) are offered to the model only once the Assistant and
 * Coding both draw them (agent-question-surfaces), so they are not drawn here yet.
 */
/** The values of one card's fields, by field id: `q<n>` for a questionnaire's questions, `pick` and `text` otherwise. */
const picked = (value: InteractionValues[string] | undefined): string[] =>
  Array.isArray(value) ? value : value && typeof value === "object" && "picked" in value ? value.picked : typeof value === "string" && value ? [value] : [];
const otherOf = (value: InteractionValues[string] | undefined): string => value && typeof value === "object" && "picked" in value ? value.other ?? "" : "";

/** The card, with what the person already wrote back in place. */
export function assistantQuestionHtml(question: AgentPendingQuestion, say: (text: string, values?: Record<string, string | number>) => string, draft: InteractionValues = {}): string {
  const fields: InteractionField[] = question.questions?.length
    ? question.questions.map(item => ({ id: `q${item.index}`, label: item.prompt, optional: !item.required, ...(item.help ? { hint: item.help } : {}),
      control: { kind: "choice" as const, multiple: item.multiple, recommendedLabel: say("推荐"), options: item.options.map(option => ({ value: String(option.index), label: option.label,
        selected: (draft[`q${item.index}`] === undefined ? [item.default ?? []].flat().map(String) : picked(draft[`q${item.index}`])).includes(String(option.index)), ...(option.description ? { description: option.description } : {}), ...(option.recommended ? { recommended: true } : {}) })),
      ...(item.allow_other ? { other: { label: say("其他"), value: otherOf(draft[`q${item.index}`]), placeholder: say("其他（可选）") } } : {}) } }))
    : [
      ...(question.options.length ? [{ id: "pick", label: say("选一个"), optional: question.allows_free_text,
        control: { kind: "choice" as const, options: question.options.map(option => ({ value: option.value || option.label, label: option.label,
          selected: picked(draft.pick).includes(option.value || option.label) })) } }] : []),
      ...(question.allows_free_text || !question.options.length ? [{ id: "text", label: question.options.length ? say("或者写下回答") : say("写下回答"), optional: question.options.length > 0,
        control: { kind: "text" as const, value: typeof draft.text === "string" ? draft.text : "", multiline: true } }] : []),
    ];
  const closed = question.answerable === false;
  return renderInteractionQuestion({
    id: `q-${question.pending_id}`, kicker: say("等你回答"), title: question.prompt, fields, optionalLabel: say("选填"),
    ...(closed ? { banner: { text: question.unavailable_reason || say("这个问题暂时不能回答"), tone: "quiet" as const, actions: [] } } : {}),
    footer: { note: say("回答后这一轮会接着做。"), keys: "⌘↵", actions: closed ? [] : [{ id: "answer", label: say("提交回答"), variant: "primary", type: "submit" }] },
  });
}

/**
 * What the card sent, as the Runtime takes it: a questionnaire question by question (every question once, an untouched
 * optional one as an empty pick), a plain question with the words written or else the option picked. Null when nothing
 * was given, so the surface asks for an answer instead of sending an empty one.
 */
export function assistantAnswerFrom(values: unknown): { answers: AgentQuestionAnswer[] } | { text: string } | null {
  if (!values || typeof values !== "object" || Array.isArray(values)) return null;
  const held = values as InteractionValues;
  const numbered = Object.keys(held).filter(id => /^q\d+$/.test(id));
  if (numbered.length) {
    return { answers: numbered.map(id => {
      const other = otherOf(held[id]).trim();
      return { question: Number(id.slice(1)), indexes: picked(held[id]).map(Number).filter(Number.isSafeInteger), ...(other ? { other } : {}) };
    }) };
  }
  const text = typeof held.text === "string" ? held.text.trim() : "";
  const pick = picked(held.pick)[0];
  return text ? { text } : pick ? { text: pick } : null;
}

const REASONS: Partial<Record<AgentQuestionProblemReason, string>> = {
  required: "这一题需要回答", unanswered: "这一题需要回答", "single-select": "这一题只能选一项", "unknown-option": "选项已经变化，请重新选择",
  duplicate: "同一项选了两次", "other-not-allowed": "这一题不能写其他答案", "too-long": "回答太长了",
};

/** The Runtime's reasons a questionnaire answer was refused, as a line beside each question's field. */
export function questionErrors(problems: readonly AgentQuestionProblem[], say: (text: string, values?: Record<string, string | number>) => string): Record<string, string> {
  return Object.fromEntries(problems.map(problem => [`q${problem.question}`, say(REASONS[problem.reason] ?? "这一题的回答不能提交，请改一下")]));
}

/** At most this many half-written answers per work: a round rarely waits on more than one question at a time. */
const KEPT = 4;
const MAX_DRAFT = 20_000;

/**
 * Half-written answers, kept with the work they belong to (not a table of their own: the work's record already travels
 * with it, and a question's draft ends with its work). Only the latest few are kept; an answered question's goes.
 */
export class AssistantQuestionDrafts {
  constructor(private readonly ports: { store: AssistantStore; actorId: string; fail(code: string, message: string): Error }) {}

  read(workId: string): Record<string, InteractionValues> {
    return (this.ports.store.get(this.ports.actorId, workId).question_drafts ?? {}) as Record<string, InteractionValues>;
  }

  save(workId: string, pendingId: string, values: unknown): void {
    if (!/^[\w:.-]{1,200}$/.test(pendingId) || !values || typeof values !== "object" || Array.isArray(values) || JSON.stringify(values).length > MAX_DRAFT) {
      throw this.ports.fail("assistant.invalid", "草稿写法不对或过长");
    }
    const kept = Object.entries(this.read(workId)).filter(([id]) => id !== pendingId).slice(-(KEPT - 1));
    this.ports.store.update(this.ports.actorId, workId, null, { question_drafts: Object.fromEntries([...kept, [pendingId, values as InteractionValues]]) }, false);
  }

  drop(workId: string, pendingId: string): void {
    const drafts = this.read(workId);
    if (!(pendingId in drafts)) return;
    const { [pendingId]: _answered, ...rest } = drafts;
    this.ports.store.update(this.ports.actorId, workId, null, { question_drafts: rest }, false);
  }
}
