import { validateQuestionnaireAnswer, type AgentControl, type ModelEvent, type PendingQuestion, type QuestionnaireAnswer } from "@prologue/sdk";
import type { AgentQuestion, AgentQuestionProblem } from "@molis-ai/molis-work-contracts/services/agent-interaction";

/** Historical questions remain readable, but only their live owner can accept answers. */
export function questionUnavailable(pending: { state: string; expiresAtMs: number }, now: number, live: boolean) {
  return pending.state !== "open" ? "这条问题已经结束，不能再次回答"
    : now >= pending.expiresAtMs ? "这条问题已过期，不能提交原答案"
    : !live ? "原执行者已经停止或离线，不能通过回答重新启动" : undefined;
}

/** A malformed question or confirmation may be corrected once. Stop at the second failed receipt,
 * before the next model call; a prompt alone cannot enforce this limit. */
export function withInteractionRepairLimit(control: Pick<AgentControl, "stop">, listener: (event: ModelEvent) => void) {
  const failures = new Map<string, Set<string>>();
  return (event: ModelEvent) => {
    listener(event);
    if (event.type !== "tool-result" || !["ask-user", "suggest-action"].includes(event.name) || event.errorCode !== "TOOL_ARGUMENTS_INVALID") return;
    const calls = failures.get(event.name) ?? new Set<string>();
    calls.add(event.callId); failures.set(event.name, calls);
    if (calls.size >= 2) control.stop("stopped");
  };
}

/** A frozen SDK question as Molis shows it: type and requiredness explicit, each option's reason kept, no SDK object passed through. */
export function projectQuestion(question: PendingQuestion): AgentQuestion {
  const has = <K extends keyof PendingQuestion>(key: K) => question[key] !== undefined;
  return {
    index: question.index, prompt: question.prompt, type: question.type ?? "choice", required: question.required !== false,
    ...(question.id === undefined ? {} : { id: question.id }), ...(question.help ? { help: question.help } : {}),
    options: question.options.map(option => ({ index: option.index, label: option.label,
      ...(option.description ? { description: option.description } : {}), ...(option.recommended ? { recommended: true } : {}) })),
    multiple: question.multiple === true, allow_other: question.allowOther === true,
    ...(has("default") ? { default: typeof question.default === "object" ? [...question.default!] : question.default! } : {}),
    ...(has("multiline") ? { multiline: question.multiline! } : {}), ...(has("maxLength") ? { max_length: question.maxLength! } : {}),
    ...(has("min") ? { min: question.min! } : {}), ...(has("max") ? { max: question.max! } : {}), ...(has("integer") ? { integer: question.integer! } : {}),
    ...(has("refKinds") ? { ref_kinds: [...question.refKinds!] } : {}), ...(has("maxCount") ? { max_count: question.maxCount! } : {}),
  };
}

/** Every question the answer cannot be accepted for; the SDK's own rules, so what is shown here is what `answer` will decide. */
export function answerProblems(questions: readonly PendingQuestion[], answers: QuestionnaireAnswer["answers"]): AgentQuestionProblem[] {
  return validateQuestionnaireAnswer(questions, answers).map(problem => ({
    question: problem.question, ...(problem.id === undefined ? {} : { id: problem.id }), reason: problem.reason }));
}

/** Reads each picked object again from its owner, as the session's owner (the Host's; S-26): true while it is still theirs to use. */
export type ReferenceConfirmer = (owner: { project_id: string; actor_id: string }, picked: readonly { kind: string; id: string }[], kinds: readonly string[]) => Promise<readonly boolean[]>;

/**
 * The questions whose picked objects the Host will not let through (specs/ai-interaction-experience H3): each reference is
 * read again from its owner right before the answer goes on. Without a Host to ask, or without the run's owner, none passes.
 */
export async function refusedReferences(confirm: ReferenceConfirmer | undefined, owner: { project_id: string; actor_id: string } | undefined,
  questions: readonly PendingQuestion[], answers: QuestionnaireAnswer["answers"]): Promise<AgentQuestionProblem[]> {
  const refused: AgentQuestionProblem[] = [];
  for (const answer of answers) {
    const question = questions.find(each => each.index === answer.question);
    const picked = question?.type === "reference" && Array.isArray(answer.value) ? answer.value.map(({ kind, id }) => ({ kind, id })) : [];
    if (!question || !picked.length) continue;
    const kept = confirm && owner ? await confirm(owner, picked, question.refKinds ?? []) : [];
    if (picked.some((_, index) => kept[index] !== true)) refused.push({ question: question.index, ...(question.id === undefined ? {} : { id: question.id }), reason: "reference-unavailable" });
  }
  return refused;
}
