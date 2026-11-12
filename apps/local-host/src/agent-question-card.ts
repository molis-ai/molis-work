import type { InteractionPicked, InteractionValues } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { renderInteractionQuestion, type InteractionControl, type InteractionField } from "@molis-ai/molis-work-design-system";
import type { AgentPendingQuestion, AgentQuestion, AgentQuestionProblem, AgentQuestionProblemReason } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { format } from "@molis-ai/molis-work-plugin-sdk/ui";
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
const two = (part: number) => String(part).padStart(2, "0");
/** The weekday of a real `YYYY-MM-DD`, and nothing for anything else; written as the shared client rewrites it while typing. */
function weekday(date: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  return day && !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === date ? format.date(date, "weekday") : "";
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
  return name ? say("workbench.agent-question-card.zone-utc-offset", { zone: name, offset }) : `UTC${offset}`;
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
      ...(typeof item.min === "number" ? { min: item.min } : {}), ...(typeof item.max === "number" ? { max: item.max } : {}), ...(item.unit ? { unit: item.unit } : {}), stepLabels: [say("workbench.agent-question-card.decrease-by-step", { step: 1 }), say("workbench.agent-question-card.increase-by-step", { step: 1 })] } };
  }
  if (item.type === "date") {
    const value = draftText(draft[`d${item.index}`]) ?? start;
    return { id: `d${item.index}`, control: { kind: "date", value, weekday: weekday(value), placeholder: "YYYY-MM-DD" } };
  }
  if (item.type === "datetime") {
    const held = draft[`w${item.index}`], kept = held && typeof held === "object" && "date" in held ? held : localMoment(start) ?? { date: "", time: "" };
    return { id: `w${item.index}`, control: { kind: "datetime", date: kept.date, time: kept.time, zone: zoneLabel(kept.date, say), weekday: weekday(kept.date),
      dateLabel: say("workbench.agent-question-card.date"), timeLabel: say("workbench.agent-question-card.time-24-hour") } };
  }
  if (item.type === "reference") {
    const held = draft[`r${item.index}`];
    return { id: `r${item.index}`, control: { kind: "reference", source: (item.ref_kinds ?? []).join(","), multiple: item.multiple === true, ...(item.max_count ? { max: item.max_count } : {}),
      picked: Array.isArray(held) ? held.filter((ref): ref is InteractionPicked => typeof ref === "object") : [], placeholder: say("workbench.agent-question-card.type-a-name-to-search"),
      labels: { remove: say("workbench.agent-question-card.remove"), empty: say("workbench.agent-question-card.no-matches"), failed: say("workbench.agent-question-card.search-is-not-available-right-now-try-again-later"), full: say("workbench.agent-question-card.that-is-as-many-as-this-question-takes") } } };
  }
  return undefined;
}

/** The card, with what the person already wrote back in place. */
export function agentQuestionHtml(question: AgentPendingQuestion, say: Say, draft: InteractionValues = {},
  /** What answering leads to, in the asker's words; an Agent's run goes on by default. */
  note = say("workbench.agent-question-card.answering-lets-this-turn-go-on"),
  /** A closed card offers to ask again with this draft (D5); only where the surface starts that round. */
  reask = false): string {
  const fields: InteractionField[] = question.questions?.length
    ? question.questions.map(item => ({ label: item.prompt, optional: !item.required, ...(item.help ? { hint: item.help } : {}),
      ...typedField(item, say, draft) ?? { id: `q${item.index}`, control: { kind: "choice" as const, multiple: item.multiple, recommendedLabel: say("workbench.agent-question-card.suggested"), options: item.options.map(option => ({ value: String(option.index), label: option.label,
        selected: (draft[`q${item.index}`] === undefined ? [item.default ?? []].flat().map(String) : picked(draft[`q${item.index}`])).includes(String(option.index)), ...(option.description ? { description: option.description } : {}), ...(option.recommended ? { recommended: true } : {}) })),
      ...(item.allow_other ? { other: { label: say("workbench.agent-question-card.other"), value: otherOf(draft[`q${item.index}`]), placeholder: say("workbench.agent-question-card.other-optional") } } : {}) } } }))
    : [
      ...(question.options.length ? [{ id: "pick", label: say("workbench.agent-question-card.pick-one"), optional: question.allows_free_text,
        control: { kind: "choice" as const, options: question.options.map(option => ({ value: option.value || option.label, label: option.label,
          selected: picked(draft.pick).includes(option.value || option.label) })) } }] : []),
      ...(question.allows_free_text || !question.options.length ? [{ id: "text", label: question.options.length ? say("workbench.agent-question-card.or-write-an-answer") : say("workbench.agent-question-card.write-your-answer"), optional: question.options.length > 0,
        control: { kind: "text" as const, value: typeof draft.text === "string" ? draft.text : "", multiline: true } }] : []),
    ];
  const closed = question.answerable === false;
  return renderInteractionQuestion({
    id: `q-${question.pending_id}`, kicker: say("workbench.agent-question-card.needs-your-answer"), state: closed ? "unavailable" : "answer", title: question.prompt, fields, optionalLabel: say("workbench.agent-question-card.optional"), clearLabel: say("workbench.agent-question-card.clear-choice"),
    ...(closed ? { banner: { text: question.unavailable_reason || say("workbench.agent-question-card.this-question-cannot-be-answered-right-now"), tone: "quiet" as const, actions: reask ? [{ id: "reask", label: say("workbench.agent-question-card.ask-again") }] : [] } } : {}),
    footer: { note, keys: "⌘↵", actions: closed ? [] : [{ id: "answer", label: say("workbench.agent-question-card.submit-answer"), variant: "primary", type: "submit" }] },
  });
}

const REASONS: Partial<Record<AgentQuestionProblemReason, string>> = {
  required: "workbench.agent-question-card.this-question-needs-an-answer", unanswered: "workbench.agent-question-card.this-question-needs-an-answer", "single-select": "workbench.agent-question-card.pick-only-one-option-here", "unknown-option": "workbench.agent-question-card.the-options-changed-pick-again",
  duplicate: "workbench.agent-question-card.the-same-option-was-picked-twice", "other-not-allowed": "workbench.agent-question-card.this-question-takes-only-the-options-shown", "too-long": "workbench.agent-question-card.the-answer-is-too-long",
  "not-a-number": "workbench.agent-question-card.enter-a-number", "not-an-integer": "workbench.agent-question-card.enter-a-whole-number", "too-small": "workbench.agent-question-card.this-number-is-too-small", "too-large": "workbench.agent-question-card.this-number-is-too-large",
  "bad-date": "workbench.agent-question-card.enter-a-date-like-2026-10-23", "too-early": "workbench.agent-question-card.this-is-too-early", "too-late": "workbench.agent-question-card.this-is-too-late",
  "reference-unavailable": "workbench.agent-question-card.the-object-you-picked-is-gone-or-not-available-to-you-now-pick-aga", "kind-not-allowed": "workbench.agent-question-card.this-question-does-not-take-that-kind-of-object", "too-many": "workbench.agent-question-card.too-many-picked",
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
  if (item?.type === "datetime" && reason === "bad-date") return say("workbench.agent-question-card.enter-a-date-and-a-time-like-2026-10-23-15-00");
  if (reason === "too-small" && low) return say("workbench.agent-question-card.must-be-at-least-limit", { limit: low });
  if (reason === "too-large" && high) return say("workbench.agent-question-card.must-be-at-most-limit", { limit: high });
  if (reason === "too-early" && low) return say("workbench.agent-question-card.must-not-be-before-limit", { limit: low });
  if (reason === "too-late" && high) return say("workbench.agent-question-card.must-not-be-after-limit", { limit: high });
  if (reason === "too-long" && item?.type === "text") return say("workbench.agent-question-card.at-most-limit-characters", { limit: item.max_length ?? 2000 });
  if (reason === "too-many" && item?.max_count) return say("workbench.agent-question-card.pick-at-most-limit", { limit: item.max_count });
  return say(REASONS[reason] ?? "workbench.agent-question-card.this-answer-cannot-be-sent-please-change-it");
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
