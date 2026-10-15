import { renderInteractionQuestion, type InteractionField, type InteractionValues } from "@molis-ai/molis-work-design-system";
import type { AgentPendingQuestion, AgentQuestionProblem, AgentQuestionProblemReason } from "@molis-ai/molis-work-contracts/services/agent-interaction";

/**
 * An Agent's waiting question as the person sees it, wherever a run is shown (specs/ai-interaction-experience A1, A2): the
 * Host draws it with the design system's shared question card, so a surface (the Assistant's island, Coding's page) only
 * binds it with the shared client and never builds the form itself. Fields are named the way the plugin SDK's
 * `questionAnswer` reads them back: `q<n>` for question `n` of a questionnaire, `pick` and `text` otherwise.
 *
 * A question is a questionnaire of choice questions, a short set of options, or a question answered in words. Typed
 * questions other than choice (dates, numbers, references) are offered to the model only once every surface draws them
 * (agent-question-surfaces), so they are not drawn here yet.
 */
/** The values of one card's fields, by field id: `q<n>` for a questionnaire's questions, `pick` and `text` otherwise. */
const picked = (value: InteractionValues[string] | undefined): string[] =>
  Array.isArray(value) ? value : value && typeof value === "object" && "picked" in value ? value.picked : typeof value === "string" && value ? [value] : [];
const otherOf = (value: InteractionValues[string] | undefined): string => value && typeof value === "object" && "picked" in value ? value.other ?? "" : "";

/** The card, with what the person already wrote back in place. */
export function agentQuestionHtml(question: AgentPendingQuestion, say: (text: string, values?: Record<string, string | number>) => string, draft: InteractionValues = {},
  /** What answering leads to, in the asker's words; an Agent's run goes on by default. */
  note = say("回答后这一轮会接着做。")): string {
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
    id: `q-${question.pending_id}`, kicker: say("等你回答"), state: closed ? "unavailable" : "answer", title: question.prompt, fields, optionalLabel: say("选填"),
    ...(closed ? { banner: { text: question.unavailable_reason || say("这个问题暂时不能回答"), tone: "quiet" as const, actions: [] } } : {}),
    footer: { note, keys: "⌘↵", actions: closed ? [] : [{ id: "answer", label: say("提交回答"), variant: "primary", type: "submit" }] },
  });
}

const REASONS: Partial<Record<AgentQuestionProblemReason, string>> = {
  required: "这一题需要回答", unanswered: "这一题需要回答", "single-select": "这一题只能选一项", "unknown-option": "选项已经变化，请重新选择",
  duplicate: "同一项选了两次", "other-not-allowed": "这一题不能写其他答案", "too-long": "回答太长了",
  "reference-unavailable": "选的对象已不存在或现在不能用，请重新选择",
};

/** The Runtime's reasons a questionnaire answer was refused, as a line beside each question's field. */
export function questionErrors(problems: readonly AgentQuestionProblem[], say: (text: string, values?: Record<string, string | number>) => string): Record<string, string> {
  return Object.fromEntries(problems.map(problem => [`q${problem.question}`, say(REASONS[problem.reason] ?? "这一题的回答不能提交，请改一下")]));
}
