import { instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { FormQuestionInput, FormQuestionType, FormRecord } from "./contract.js";
import type { AgentQuestion, AgentQuestionProblem, InteractionRequest } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { questionAnswer, questionProblems, questionSetFlaw } from "@molis-ai/molis-work-plugin-sdk";
import { formErrors } from "./error.js";
import { FORM_DRAFT_QUESTIONS } from "./prompts.js";

/**
 * 「AI 生成题目」(specs/ai-interaction-experience S1): the model drafts a few questions from the person's request, or first
 * says what it needs to know (who fills it in, how many questions, what it is for) as a short set of choice questions. The
 * questions it asked are kept here, with the form and the version they were asked about, until the person answers them in
 * the shared question card (contracts `InteractionRequest`; the Host draws it on the way out); the answer is checked against
 * those exact questions and goes back to the model once. This is not a durable wait: what was asked lives as long as this
 * plugin runs (at most a day), and a form changed meanwhile is asked about afresh. The model only asks choice questions: that
 * is what every question card draws today.
 */
export interface FormDraftRequest { id: string; expected_version?: number; prompt: string; interaction?: { interaction_id: string; values: unknown } }
export type FormDraftResult = { status: "done"; form: FormRecord } | { status: "needs_input"; interaction: InteractionRequest };

const string = { type: "string" }, bool = { type: "boolean" }, index = { type: "integer", minimum: 0 };
const askedQuestion = { type: "object", properties: { index, id: string, prompt: string, type: { const: "choice" }, required: bool, multiple: bool, allow_other: bool,
  options: { type: "array", items: { type: "object", properties: { index, label: string, description: string, recommended: bool }, required: ["index", "label"], additionalProperties: false } } },
  required: ["index", "prompt", "type", "required", "multiple", "allow_other", "options"], additionalProperties: false };
/** The action's input: the request, or the answer to what was asked first (the card's field values, read as the card names them). */
export const FORM_DRAFT_INPUT_SCHEMA = { type: "object", properties: { id: { type: "string", minLength: 1, pattern: "\\S" }, expected_version: { type: "integer", minimum: 1 },
  prompt: { type: "string", maxLength: 500 }, interaction: { type: "object", properties: { interaction_id: { type: "string", minLength: 1, maxLength: 200 }, values: { type: "object" } },
    required: ["interaction_id", "values"], additionalProperties: false } }, required: ["id", "prompt"], additionalProperties: false };
/** Done with the form as it now is (`form`), or the questions to answer first (`interaction`). One object, so an MCP tool returns it as it is. */
export const formDraftOutputSchema = (record: Record<string, unknown>) => ({ type: "object", properties: { status: { enum: ["done", "needs_input"] }, form: record,
  interaction: { type: "object", properties: { interaction_id: string, why: string, note: string, questions: { type: "array", items: askedQuestion } },
    required: ["interaction_id", "why", "questions"], additionalProperties: false } }, required: ["status"], additionalProperties: false });
const KEPT = 32, LIFETIME_MS = 24 * 60 * 60 * 1000, MAX_DRAFTED = 8;
/** The card's footer line: what answering leads to here (the Host draws the card and puts it in the reader's language). */
const ANSWER_NOTE = "回答后接着生成题目。";
const TYPES: readonly FormQuestionType[] = ["text", "singleChoice", "multiChoice", "dropdown", "rating", "date"];
interface Asked { form_id: string; project_id: string; form_version: number; prompt: string; why: string; questions: AgentQuestion[]; at: number }

/** The model's reply, parsed: a JSON object, possibly inside a code fence. Anything else is no reply. */
function parsed(text: string): Record<string, unknown> | null {
  const body = text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  try { const value = JSON.parse(body); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
}

/** The questions it drafted, in Form's own shape; refused whole when any is not one Form can hold. */
function drafted(value: unknown): FormQuestionInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DRAFTED) throw formErrors.invalid("模型没有返回有效题目，请调整提示后重试");
  return value.map(row => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const title = typeof item.title === "string" ? item.title.trim() : "", type = TYPES.includes(item.type as FormQuestionType) ? item.type as FormQuestionType : null;
    const options = Array.isArray(item.options) ? item.options.filter((label): label is string => typeof label === "string" && !!label.trim()).map(label => ({ label: label.trim().slice(0, 120) })) : [];
    const choice = type === "singleChoice" || type === "multiChoice" || type === "dropdown";
    if (!title || title.length > 200 || !type || (choice && (options.length < 2 || options.length > 12))) throw formErrors.invalid("模型没有返回有效题目，请调整提示后重试");
    return { type, title, required: item.required === true, ...(choice ? { options } : {}) };
  });
}

/** What it asks first, as questions the shared card draws: choice questions only, numbered in order, bounded and well formed. */
function asked(value: unknown): AgentQuestion[] {
  const rows = Array.isArray(value) ? value.slice(0, 4) : [];
  const questions: AgentQuestion[] = rows.map((row, index) => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const options = Array.isArray(item.options) ? item.options : [];
    return { index, prompt: typeof item.prompt === "string" ? item.prompt.trim().slice(0, 300) : "", type: "choice", required: item.required !== false,
      ...(typeof item.id === "string" ? { id: item.id } : {}), multiple: item.multiple === true, allow_other: item.allow_other === true,
      options: options.map((option, at) => {
        const one: Record<string, unknown> = option && typeof option === "object" ? option as Record<string, unknown> : { label: option };
        return { index: at, label: typeof one.label === "string" ? one.label.trim().slice(0, 120) : "",
          ...(typeof one.description === "string" && one.description.trim() ? { description: one.description.trim().slice(0, 300) } : {}), ...(one.recommended === true ? { recommended: true } : {}) };
      }) };
  });
  if (!questions.length || questions.some(question => !question.prompt || question.options.some(option => !option.label)) || questionSetFlaw(questions)) {
    throw formErrors.invalid("模型想先问几个问题，但问题写得不完整，请把要求写得更具体后重试");
  }
  return questions;
}

/** The answer in the model's words: each question with the options picked and what the person wrote. */
function heard(questions: readonly AgentQuestion[], answers: ReadonlyArray<{ question: number; indexes: number[]; other?: string } | { question: number; value: unknown }>) {
  // Only choice questions are asked here, and the answer passed their rules, so each answer is a pick.
  return answers.flatMap(answer => "indexes" in answer ? [answer] : []).map(answer => {
    const question = questions.find(item => item.index === answer.question)!;
    return { question: question.prompt, picked: answer.indexes.map(index => question.options.find(option => option.index === index)?.label ?? ""), ...(answer.other ? { other: answer.other } : {}) };
  });
}

interface FormDraftPorts {
  completeText(prompt: InstructedPrompt, options: { signal?: AbortSignal; beforeDispatch?: () => Promise<void> }): Promise<string>;
  now?(): number;
}

/** One drafting conversation per form at a time, kept by this plugin for the person to answer. */
export function createFormDrafting(ports: FormDraftPorts) {
  const kept = new Map<string, Asked>();
  const now = () => ports.now?.() ?? Date.now();
  const forget = () => { for (const [id, row] of kept) if (now() - row.at > LIFETIME_MS) kept.delete(id); while (kept.size > KEPT) kept.delete(kept.keys().next().value!); };
  /** The questions asked before, answered: refused with each field's reason, or when they no longer fit the form. */
  const answered = (input: FormDraftRequest, form: FormRecord) => {
    const row = kept.get(input.interaction!.interaction_id);
    if (!row || row.form_id !== form.id || row.project_id !== form.project_id) throw formErrors.invalid("这几个补充问题已失效，请重新生成");
    if (row.form_version !== form.version) throw formErrors.conflict("问卷在你回答时改过了，请重新生成");
    const answer = questionAnswer(input.interaction!.values);
    const answers = answer && "answers" in answer ? answer.answers : [];
    const problems: AgentQuestionProblem[] = questionProblems(row.questions, answers);
    if (problems.length) throw formErrors.answer_invalid(`有 ${problems.length} 题的回答不能提交`, { problems });
    return { row, answers };
  };
  return {
    /** Drops an answered question set once its questions are stored. Until then the same card can be sent again. */
    forget(id: string | undefined) { if (id) kept.delete(id); },
    async draft(input: FormDraftRequest, form: FormRecord, call: { signal?: AbortSignal; beforeEffect(): Promise<void> }): Promise<FormDraftResult | { status: "drafted"; questions: FormQuestionInput[] }> {
      forget();
      const prior = input.interaction ? answered(input, form) : null;
      const request = prior ? prior.row.prompt : input.prompt.trim();
      if (!request || request.length > 500) throw formErrors.invalid("生成要求须为 1 到 500 个字");
      // The form's own questions stay on this computer: only the request and the answers go to the model.
      const data = { request, ...(prior ? { answers: heard(prior.row.questions, prior.answers) } : {}) };
      const reply = parsed(await ports.completeText(instructed(FORM_DRAFT_QUESTIONS, JSON.stringify(data)), { signal: call.signal, beforeDispatch: call.beforeEffect }));
      call.signal?.throwIfAborted();
      if (!reply) throw formErrors.invalid("模型没有返回有效题目，请调整提示后重试");
      if (reply.status === "needs_input") {
        // Asked once: after the person answered, a model that still cannot draft says so instead of asking again.
        if (prior) throw formErrors.invalid("回答之后模型仍没有拟出题目，请把要求写得更具体后重试");
        const questions = asked(reply.questions), interaction_id = `draft-${crypto.randomUUID()}`;
        const why = typeof reply.why === "string" && reply.why.trim() ? reply.why.trim().slice(0, 300) : "生成前想先确认几件事";
        kept.set(interaction_id, { form_id: form.id, project_id: form.project_id, form_version: form.version, prompt: request, why, questions, at: now() });
        return { status: "needs_input", interaction: { interaction_id, why, questions, note: ANSWER_NOTE } };
      }
      if (reply.status !== "done") throw formErrors.invalid("模型没有返回有效题目，请调整提示后重试");
      return { status: "drafted", questions: drafted(reply.questions) };
    },
  };
}
