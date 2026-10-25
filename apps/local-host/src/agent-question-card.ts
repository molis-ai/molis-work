import type { InteractionPicked, InteractionValues } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { renderInteractionQuestion, type InteractionControl, type InteractionField } from "@molis-ai/molis-work-design-system";
import type { AgentPendingQuestion, AgentQuestion, AgentQuestionProblem, AgentQuestionProblemReason } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { dateTimeLocale } from "./web-locale.js";

/**
 * An Agent's waiting question as the person sees it, wherever a run is shown (specs/ai-interaction-experience A1, A2): the
 * Host draws it with the design system's shared question card, so a surface (the Assistant's island, Coding's page) only
 * binds it with the shared client and never builds the form itself. Fields are named the way the plugin SDK's
 * `questionAnswer` reads them back: `q<n>`, `t<n>`, `n<n>`, `d<n>`, `w<n>`, `r<n>` for question `n` of a questionnaire by its
 * type, `pick` and `text` otherwise.
 *
 * A question is a questionnaire, a short set of options, or a question answered in words. A questionnaire's questions are
 * choices, words, numbers, dates or a date and time (T1); a number shows its unit beside it and in its error line; dates are typed, with the weekday beside them, and a date and time
 * is in this computer's time zone, named once after the time. A reference lists no candidates of its own (T2): the person
 * types a name and the shared client asks the page's search (`search.references`, of the question's kinds) as they type; a
 * pick is held as `<kind> <id>`, and the label it was offered with is only the person's draft, never the answer's.
 */
/** The values of one card's fields, by field id: `q<n>` for a questionnaire's questions, `pick` and `text` otherwise. */
const picked = (value: InteractionValues[string] | undefined): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : value && typeof value === "object" && "picked" in value ? value.picked : typeof value === "string" && value ? [value] : [];
const otherOf = (value: InteractionValues[string] | undefined): string => value && typeof value === "object" && "picked" in value ? value.other ?? "" : "";

type Say = (text: string, values?: Record<string, string | number>) => string;
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const two = (part: number) => String(part).padStart(2, "0");
/** The weekday of a real `YYYY-MM-DD`, and nothing for anything else; written as the shared client rewrites it while typing. */
function weekday(date: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  return day && !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === date ? WEEKDAYS[day.getUTCDay()]! : "";
}
/** A moment written with an offset, as this computer's date and time; nothing when it is not one. */
function localMoment(value: unknown): { date: string; time: string } | undefined {
  const at = typeof value === "string" && /T\d{2}:\d{2}/.test(value) ? new Date(value) : null;
  return at && !Number.isNaN(at.getTime()) ? { date: `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`, time: `${two(at.getHours())}:${two(at.getMinutes())}` } : undefined;
}
/** This computer's time zone as the person reads it, with its offset on that day: 「中国标准时间（UTC+8）」. */
function zoneLabel(date: string, say: Say): string {
  const at = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : new Date();
  const name = new Intl.DateTimeFormat(dateTimeLocale(), { timeZoneName: "long" }).formatToParts(at).find(part => part.type === "timeZoneName")?.value ?? "";
  const minutes = -at.getTimezoneOffset(), size = Math.abs(minutes);
  const offset = `${minutes < 0 ? "-" : "+"}${Math.floor(size / 60)}${size % 60 ? `:${two(size % 60)}` : ""}`;
  return name ? say("{zone}（UTC{offset}）", { zone: name, offset }) : `UTC${offset}`;
}
const draftText = (value: InteractionValues[string] | undefined): string | undefined => typeof value === "string" ? value : undefined;

/** The field a questionnaire's text question is drawn as; the Assistant's composer writes into it by this id (R4). */
export const textFieldId = (index: number): string => `t${index}`;

/** One questionnaire question that is not a choice, as its field: `t<n>`, `n<n>`, `d<n>` or `w<n>`, as `questionAnswer` reads it. */
function typedField(item: AgentQuestion, say: Say, draft: InteractionValues): { id: string; control: InteractionControl } | undefined {
  const start = item.default === undefined || Array.isArray(item.default) ? "" : String(item.default);
  if (item.type === "text") {
    return { id: textFieldId(item.index), control: { kind: "text", value: draftText(draft[textFieldId(item.index)]) ?? start, multiline: item.multiline === true, ...(item.max_length ? { maxLength: item.max_length } : {}) } };
  }
  if (item.type === "number") {
    return { id: `n${item.index}`, control: { kind: "number", value: draftText(draft[`n${item.index}`]) ?? start, step: 1, integer: item.integer === true,
      ...(typeof item.min === "number" ? { min: item.min } : {}), ...(typeof item.max === "number" ? { max: item.max } : {}), ...(item.unit ? { unit: item.unit } : {}), stepLabels: [say("减少 {step}", { step: 1 }), say("增加 {step}", { step: 1 })] } };
  }
  if (item.type === "date") {
    const value = draftText(draft[`d${item.index}`]) ?? start;
    return { id: `d${item.index}`, control: { kind: "date", value, weekday: weekday(value), placeholder: "YYYY-MM-DD" } };
  }
  if (item.type === "datetime") {
    const held = draft[`w${item.index}`], kept = held && typeof held === "object" && "date" in held ? held : localMoment(start) ?? { date: "", time: "" };
    return { id: `w${item.index}`, control: { kind: "datetime", date: kept.date, time: kept.time, zone: zoneLabel(kept.date, say), weekday: weekday(kept.date),
      dateLabel: say("日期"), timeLabel: say("时刻（24 小时制）") } };
  }
  if (item.type === "reference") {
    const held = draft[`r${item.index}`];
    return { id: `r${item.index}`, control: { kind: "reference", source: (item.ref_kinds ?? []).join(","), multiple: item.multiple === true, ...(item.max_count ? { max: item.max_count } : {}),
      picked: Array.isArray(held) ? held.filter((ref): ref is InteractionPicked => typeof ref === "object") : [], placeholder: say("输入名称搜索"),
      labels: { remove: say("去掉"), empty: say("没有找到"), failed: say("暂时搜不了，稍后再试"), full: say("已经选够了"), found: say("{n} 个结果") } } };
  }
  return undefined;
}

/** The card, with what the person already wrote back in place. */
export function agentQuestionHtml(question: AgentPendingQuestion, say: Say, draft: InteractionValues = {},
  /** What answering leads to, in the asker's words; an Agent's run goes on by default. */
  note = say("回答后这一轮会接着做。"),
  /** A closed card offers to ask again with this draft (D5); only where the surface starts that round. */
  reask = false): string {
  const fields: InteractionField[] = question.questions?.length
    ? question.questions.map(item => ({ label: item.prompt, optional: !item.required, ...(item.help ? { hint: item.help } : {}),
      ...typedField(item, say, draft) ?? { id: `q${item.index}`, control: { kind: "choice" as const, multiple: item.multiple, recommendedLabel: say("推荐"), options: item.options.map(option => ({ value: String(option.index), label: option.label,
        selected: (draft[`q${item.index}`] === undefined ? [item.default ?? []].flat().map(String) : picked(draft[`q${item.index}`])).includes(String(option.index)), ...(option.description ? { description: option.description } : {}), ...(option.recommended ? { recommended: true } : {}) })),
      ...(item.allow_other ? { other: { label: say("其他"), value: otherOf(draft[`q${item.index}`]), placeholder: say("其他（可选）") } } : {}) } } }))
    : [
      ...(question.options.length ? [{ id: "pick", label: say("选一个"), optional: question.allows_free_text,
        control: { kind: "choice" as const, options: question.options.map(option => ({ value: option.value || option.label, label: option.label,
          selected: picked(draft.pick).includes(option.value || option.label) })) } }] : []),
      ...(question.allows_free_text || !question.options.length ? [{ id: "text", label: question.options.length ? say("或者写下回答") : say("写下回答"), optional: question.options.length > 0,
        control: { kind: "text" as const, value: typeof draft.text === "string" ? draft.text : "", multiline: true } }] : []),
    ];
  const closed = question.answerable === false;
  return renderInteractionQuestion({
    id: `q-${question.pending_id}`, kicker: say("等你回答"), state: closed ? "unavailable" : "answer", title: question.prompt, fields, optionalLabel: say("选填"), clearLabel: say("清除选择"),
    ...(closed ? { banner: { text: question.unavailable_reason || say("这个问题暂时不能回答"), tone: "quiet" as const, actions: reask ? [{ id: "reask", label: say("请 AI 重新问") }] : [] } } : {}),
    footer: { note, keys: "⌘↵", actions: closed ? [] : [{ id: "answer", label: say("提交回答"), variant: "primary", type: "submit" }] },
  });
}

const REASONS: Partial<Record<AgentQuestionProblemReason, string>> = {
  required: "这一题需要回答", unanswered: "这一题需要回答", "single-select": "这一题只能选一项", "unknown-option": "选项已经变化，请重新选择",
  duplicate: "同一项选了两次", "other-not-allowed": "这一题不能写其他答案", "too-long": "回答太长了",
  "not-a-number": "请填一个数字", "not-an-integer": "请填整数", "too-small": "这个数太小了", "too-large": "这个数太大了",
  "bad-date": "请按 2026-10-23 这样的格式填日期", "too-early": "这个时间太早了", "too-late": "这个时间太晚了",
  "reference-unavailable": "选的对象已不存在或现在不能用，请重新选择", "kind-not-allowed": "选的对象不是这一题要的那一类", "too-many": "选的太多了",
};

/** A bound as the person reads it: a number as written with its unit ("120 分钟"), a date as typed, a moment in this computer's time. */
function bound(item: AgentQuestion, value: unknown): string | undefined {
  if (typeof value === "number") return item.unit ? `${value} ${item.unit}` : String(value);
  if (typeof value !== "string" || !value) return undefined;
  if (item.type !== "datetime") return value;
  const at = localMoment(value);
  return at ? `${at.date} ${at.time}` : undefined;
}

/** The sentence for one problem: the limit it crossed when the question says one, else the reason alone. */
function problemLine(problem: AgentQuestionProblem, item: AgentQuestion | undefined, say: Say): string {
  const low = item && bound(item, item.min), high = item && bound(item, item.max);
  const reason = problem.reason;
  if (item?.type === "datetime" && reason === "bad-date") return say("请填日期和时刻，例如 2026-10-23 15:00");
  if (reason === "too-small" && low) return say("不能小于 {limit}", { limit: low });
  if (reason === "too-large" && high) return say("不能超过 {limit}", { limit: high });
  if (reason === "too-early" && low) return say("不能早于 {limit}", { limit: low });
  if (reason === "too-late" && high) return say("不能晚于 {limit}", { limit: high });
  if (reason === "too-long" && item?.type === "text") return say("不能超过 {limit} 个字", { limit: item.max_length ?? 2000 });
  if (reason === "too-many" && item?.max_count) return say("最多选 {limit} 个", { limit: item.max_count });
  return say(REASONS[reason] ?? "这一题的回答不能提交，请改一下");
}

/** The field a question's answer is read from on the card, as `typedField` names it. */
const fieldOf = (item: AgentQuestion | undefined, index: number): string =>
  `${({ text: "t", number: "n", date: "d", datetime: "w", reference: "r" } as Record<string, string>)[item?.type ?? ""] ?? "q"}${index}`;

/**
 * The Runtime's reasons a questionnaire answer was refused, as a line beside each question's field. Given the questions,
 * a line names the limit the answer crossed (「不能超过 240」) and lands on the field the question is drawn as.
 */
export function questionErrors(problems: readonly AgentQuestionProblem[], say: Say, questions: readonly AgentQuestion[] = []): Record<string, string> {
  return Object.fromEntries(problems.map(problem => {
    const item = questions.find(entry => entry.index === problem.question);
    return [fieldOf(item, problem.question), problemLine(problem, item, say)];
  }));
}
