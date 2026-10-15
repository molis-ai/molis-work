import { AGENT_QUESTION_TYPES, type AgentQuestion, type AgentQuestionAnswer, type AgentQuestionProblem, type AgentQuestionProblemReason, type AgentQuestionValue } from "@molis-ai/molis-work-contracts/services/agent-interaction";

/**
 * The rules a question set and its answer follow, for a plugin that asks without an Agent run (specs/ai-interaction-experience
 * S1, §15.7): its model says it needs something before it can finish, the plugin keeps the questions, the person answers in the
 * shared question card, and the plugin calls its model again with the answer. The Agent runtime checks the same rules for an
 * Agent's questions (Prologue's `validateQuestionnaireAnswer`), and `tests/question-rules-consistency.test.ts` holds the two to
 * the same verdicts on the same inputs, so a question never passes in one place and fails in the other.
 */
export const QUESTION_LIMITS = Object.freeze({
  maxQuestions: 10, maxOptionsPerQuestion: 20, maxOtherChars: 500, maxTextChars: 2000, maxHelpChars: 500, maxOptionDescriptionChars: 300,
  maxRefKinds: 10, maxRefKindChars: 64, maxReferences: 20, maxReferenceChars: 200,
});

type Flaw = AgentQuestionProblemReason | undefined;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ID = /^[a-z][a-z0-9_]{0,31}$/;

function realDate(text: string): boolean {
  const match = DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** A date or a moment as something to compare; undefined when it is not written as the question takes it. */
function momentKey(type: "date" | "datetime", text: unknown): string | number | undefined {
  if (typeof text !== "string") return undefined;
  if (type === "date") return realDate(text) ? text : undefined;
  const match = DATETIME.exec(text);
  if (!match || !realDate(match[1] ?? "")) return undefined;
  const at = Date.parse(text);
  return Number.isFinite(at) ? at : undefined;
}

function referenceFlaw(question: AgentQuestion, value: unknown): Flaw {
  if (!Array.isArray(value)) return "wrong-shape";
  const most = question.multiple ? question.max_count ?? QUESTION_LIMITS.maxReferences : 1;
  if (value.length > most) return "too-many";
  const seen = new Set<string>();
  for (const one of value) {
    const row = one && typeof one === "object" ? one as Record<string, unknown> : undefined;
    if ([row?.kind, row?.id, row?.label].some(field => typeof field !== "string" || field.length < 1 || field.length > QUESTION_LIMITS.maxReferenceChars)) return "wrong-shape";
    if (!(question.ref_kinds ?? []).includes(row!.kind as string)) return "kind-not-allowed";
    const key = `${row!.kind}\u0000${row!.id}`;
    if (seen.has(key)) return "duplicate";
    seen.add(key);
  }
  return undefined;
}

/** Whether a value fits a question that is not a choice. Blank is not judged here: required or not is the caller's. */
function valueFlaw(question: AgentQuestion, value: unknown): Flaw {
  const type = question.type;
  if (type === "text") return typeof value !== "string" ? "wrong-shape" : value.length > (question.max_length ?? QUESTION_LIMITS.maxTextChars) ? "too-long" : undefined;
  if (type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return "not-a-number";
    if (question.integer && !Number.isInteger(value)) return "not-an-integer";
    if (typeof question.min === "number" && value < question.min) return "too-small";
    return typeof question.max === "number" && value > question.max ? "too-large" : undefined;
  }
  if (type === "date" || type === "datetime") {
    const key = momentKey(type, value);
    if (key === undefined) return "bad-date";
    const min = momentKey(type, question.min), max = momentKey(type, question.max);
    if (min !== undefined && key < min) return "too-early";
    return max !== undefined && key > max ? "too-late" : undefined;
  }
  return type === "reference" ? referenceFlaw(question, value) : "wrong-shape";
}

const blank = (question: AgentQuestion, value: AgentQuestionValue | undefined): boolean =>
  value === null || (Array.isArray(value) && value.length === 0) || (typeof value === "string" && !value.trim() && question.type === "text");

function choiceFlaw(question: AgentQuestion, answer: Pick<AgentQuestionAnswer, "indexes" | "other" | "value">): Flaw {
  if (answer.value !== undefined || !Array.isArray(answer.indexes)) return "wrong-shape";
  if (!question.multiple && answer.indexes.length > 1) return "single-select";
  const seen = new Set<number>();
  for (const index of answer.indexes) {
    if (seen.has(index)) return "duplicate";
    seen.add(index);
    if (!question.options.some(option => option.index === index)) return "unknown-option";
  }
  if (answer.other !== undefined) {
    if (!question.allow_other) return "other-not-allowed";
    if (answer.other.length > QUESTION_LIMITS.maxOtherChars) return "too-long";
  }
  return answer.indexes.length < 1 && answer.other === undefined && question.required ? "required" : undefined;
}

function typedFlaw(question: AgentQuestion, answer: AgentQuestionAnswer): Flaw {
  if ((answer.indexes !== undefined && answer.indexes.length > 0) || answer.value === undefined) return "wrong-shape";
  if (answer.other !== undefined) return "other-not-allowed";
  if (blank(question, answer.value)) return question.required ? "required" : undefined;
  return valueFlaw(question, answer.value);
}

/**
 * Every problem of an answer, each on its own question with a closed reason the card turns into a sentence beside that field.
 * Empty means it may be sent. Every question is answered exactly once.
 */
export function questionProblems(questions: readonly AgentQuestion[], answers: readonly AgentQuestionAnswer[]): AgentQuestionProblem[] {
  const problems: AgentQuestionProblem[] = [];
  const raise = (index: number, reason: AgentQuestionProblemReason, question?: AgentQuestion) =>
    problems.push({ question: index, ...(question?.id === undefined ? {} : { id: question.id }), reason });
  const answered = new Set<number>();
  for (const answer of answers) {
    const question = questions.find(each => each.index === answer.question);
    if (!question) { raise(answer.question, "unknown-question"); continue; }
    if (answered.has(answer.question)) { raise(answer.question, "answered-twice", question); continue; }
    answered.add(answer.question);
    const flaw = question.type === "choice" ? choiceFlaw(question, answer) : typedFlaw(question, answer);
    if (flaw) raise(answer.question, flaw, question);
  }
  for (const question of questions) if (!answered.has(question.index)) raise(question.index, "unanswered", question);
  return problems;
}

/** Fields that belong to some types only: on another type the question was written wrong, so it is refused, not trimmed. */
const OWN_FIELDS: Readonly<Record<string, readonly string[]>> = {
  max_length: ["text"], multiline: ["text"], integer: ["number"], min: ["number", "date", "datetime"], max: ["number", "date", "datetime"],
  ref_kinds: ["reference"], max_count: ["reference"],
};

function constraintFlaw(question: AgentQuestion): string | null {
  const { type, index } = question;
  if (type === "choice" ? question.options.length < 1 || question.options.length > QUESTION_LIMITS.maxOptionsPerQuestion : question.options.length > 0) {
    return `Question ${index}: only choice questions carry options, 1 to ${QUESTION_LIMITS.maxOptionsPerQuestion} of them.`;
  }
  if (question.options.some(option => (option.description?.length ?? 0) > QUESTION_LIMITS.maxOptionDescriptionChars)) return `Question ${index}: an option description is too long.`;
  if (type !== "choice" && question.allow_other) return `Question ${index}: only choice questions take an answer of their own.`;
  if (question.multiple && type !== "choice" && type !== "reference") return `Question ${index}: only choice and reference questions take several answers.`;
  if (type === "text" && question.max_length !== undefined && (!Number.isInteger(question.max_length) || question.max_length < 1 || question.max_length > QUESTION_LIMITS.maxTextChars)) {
    return `Question ${index}: max_length must be from 1 to ${QUESTION_LIMITS.maxTextChars}.`;
  }
  if (type === "number" && [question.min, question.max].some(bound => bound !== undefined && (typeof bound !== "number" || !Number.isFinite(bound)))) return `Question ${index}: its bounds must be numbers.`;
  if ((type === "date" || type === "datetime") && [question.min, question.max].some(bound => bound !== undefined && momentKey(type, bound) === undefined)) {
    return `Question ${index}: its bounds must be written like its answers.`;
  }
  if (type === "number" || type === "date" || type === "datetime") {
    const min = type === "number" ? question.min : momentKey(type, question.min), max = type === "number" ? question.max : momentKey(type, question.max);
    if (min !== undefined && max !== undefined && min > max) return `Question ${index}: its min is above its max.`;
  }
  if (type === "reference") {
    const kinds = question.ref_kinds ?? [];
    if (kinds.length < 1 || kinds.length > QUESTION_LIMITS.maxRefKinds || new Set(kinds).size !== kinds.length || kinds.some(kind => !kind || kind.length > QUESTION_LIMITS.maxRefKindChars)) {
      return `Question ${index}: name 1 to ${QUESTION_LIMITS.maxRefKinds} distinct kinds of object.`;
    }
    if (question.max_count !== undefined && (!question.multiple || !Number.isInteger(question.max_count) || question.max_count < 1 || question.max_count > QUESTION_LIMITS.maxReferences)) {
      return `Question ${index}: max_count needs multiple and must be from 1 to ${QUESTION_LIMITS.maxReferences}.`;
    }
  }
  return null;
}

/** A starting value is measured as an answer would be: a default the person could not send teaches them to send it wrong. */
function defaultFlaw(question: AgentQuestion): string | null {
  const value = question.default;
  if (value === undefined) return null;
  if (question.type === "reference") return `Question ${question.index}: the person picks the object; nothing is prefilled.`;
  if (question.type === "choice") {
    const flaw = Array.isArray(value) ? choiceFlaw(question, { indexes: value }) : undefined;
    return !Array.isArray(value) || (flaw !== undefined && flaw !== "required") ? `Question ${question.index}: its default must be option numbers.` : null;
  }
  return Array.isArray(value) || valueFlaw(question, value) !== undefined ? `Question ${question.index}: its default does not fit the question.` : null;
}

/**
 * What is wrong with a question set before anyone is asked it (a plugin's model wrote it), or null when it may be shown:
 * bounded, numbered once each, every field on a type it belongs to, bounds and defaults that fit.
 */
export function questionSetFlaw(questions: readonly AgentQuestion[]): string | null {
  if (questions.length < 1 || questions.length > QUESTION_LIMITS.maxQuestions) return `A question set has 1 to ${QUESTION_LIMITS.maxQuestions} questions.`;
  const seen = new Set<number>(), ids = new Set<string>();
  for (const question of questions) {
    if (seen.has(question.index)) return `Question ${question.index} appears twice.`;
    if (!(AGENT_QUESTION_TYPES as readonly string[]).includes(question.type)) return `Question ${question.index} has an unknown type.`;
    seen.add(question.index);
    if (question.id !== undefined) {
      if (!ID.test(question.id) || ids.has(question.id)) return `Question ${question.index}: its id must be unique and look like "deadline".`;
      ids.add(question.id);
    }
    if ((question.help?.length ?? 0) > QUESTION_LIMITS.maxHelpChars) return `Question ${question.index}: its help is too long.`;
    const present: Record<string, unknown> = { max_length: question.max_length, multiline: question.multiline, integer: question.integer, min: question.min,
      max: question.max, ref_kinds: question.ref_kinds, max_count: question.max_count };
    for (const [field, types] of Object.entries(OWN_FIELDS)) {
      if (present[field] !== undefined && !types.includes(question.type)) return `Question ${question.index}: "${field}" does not apply to a ${question.type} question.`;
    }
    const flaw = constraintFlaw(question) ?? defaultFlaw(question);
    if (flaw) return flaw;
  }
  return null;
}
