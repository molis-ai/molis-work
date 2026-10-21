import type { ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { AGENT_REASONING_EFFORTS, type AgentReasoningEffort, type AgentRunControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AGENT_INPUT_KEY_PATTERN, AGENT_INPUT_SOURCES, AGENT_STEER_MODES, type AgentInputSend, type AgentInputSource, type AgentSteerMode } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { QUESTION_LIMITS, questionAnswer as cardAnswer } from "@molis-ai/molis-work-plugin-sdk";
import { codingWriterAssignments } from "./writers.js";
import type { CodingModelChoice } from "./routes.js";
import { codingFailure } from "./words.js";

const identity = {
  session_id: { type: "string", minLength: 1, maxLength: 200 },
  run_id: { type: "string", minLength: 1, maxLength: 200 },
};
/** A string the handler's text() accepts: present, within the cap, and not only spaces. */
const words = (maximum: number) => ({ type: "string", minLength: 1, maxLength: maximum, pattern: "\\S" });
const reference = { type: "string", maxLength: QUESTION_LIMITS.maxReferenceChars };
/** A choice question's picks, or the value of any other question: words, a date or a moment as text, a number, picked objects, or nothing. */
const answerItem = { oneOf: [{
  type: "object", additionalProperties: false, required: ["question", "indexes"],
  properties: {
    question: { type: "integer" },
    indexes: { type: "array", maxItems: 20, items: { type: "integer" } },
    other: { type: "string", maxLength: 500 },
  },
}, { type: "object", additionalProperties: false, required: ["question", "value"],
  properties: { question: { type: "integer" }, value: { oneOf: [{ type: "string", maxLength: 2000 }, { type: "number" }, { type: "null" }, { type: "array", maxItems: QUESTION_LIMITS.maxReferences, items: {
    type: "object", additionalProperties: false, required: ["kind", "id", "label"], properties: { kind: reference, id: reference, label: reference } } }] } } }],
};
function controlBranch(kind: string, extra: Record<string, unknown>, required: readonly string[]): ActionSchema {
  return {
    type: "object", additionalProperties: false,
    properties: { ...identity, kind: { const: kind }, ...extra },
    required: ["session_id", "run_id", "kind", ...required],
  };
}

/**
 * The page answers with the question card's fields as they hold them (`values`); they become the run's answer here, on the
 * way to the action, read the same way the Host reads the Assistant's card. Anything else passes as it is.
 */
export function controlInput(input: Record<string, unknown>): Record<string, unknown> {
  if (input.kind !== "answer" || input.values === undefined) return input;
  const { values, ...rest } = input, answer = cardAnswer(values);
  if (!answer) throw codingFailure("coding.server.answer-every");
  return { ...rest, ...answer };
}

/**
 * The published input of coding.runs.control. Each kind names the fields its handler reads, so a call the schema
 * accepts is not later rejected for a field this schema never asked for.
 */
export const codingRunControlInput: ActionSchema = {
  oneOf: [
    controlBranch("answer", { pending_id: words(200), pending_revision: { type: "integer", minimum: 1 }, text: words(100_000) }, ["pending_id", "pending_revision", "text"]),
    controlBranch("answer", {
      pending_id: words(200), pending_revision: { type: "integer", minimum: 1 },
      answers: { type: "array", minItems: 1, maxItems: 10, items: answerItem },
    }, ["pending_id", "pending_revision", "answers"]),
    controlBranch("steer", { text: words(100_000), source: { enum: [...AGENT_INPUT_SOURCES] }, key: { type: "string", pattern: AGENT_INPUT_KEY_PATTERN },
      mode: { enum: [...AGENT_STEER_MODES] }, about: words(200) }, ["text"]),
    controlBranch("withdraw", { input_id: words(200) }, ["input_id"]),
    controlBranch("stop", {}, []),
    controlBranch("pause", {}, []),
    controlBranch("resume", {}, []),
    controlBranch("switch-model", {
      provider_id: { type: "string", minLength: 1, maxLength: 200 },
      model_id: { type: "string", minLength: 1, maxLength: 200 },
    }, ["provider_id", "model_id"]),
  ],
};

/** What the page sends to start, steer or answer a round, checked before it reaches the Host. */

export function text(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw codingFailure("coding.server.field-invalid", { label: { key: label }, maximum });
  return value.trim();
}

/** The next round's saved choices; an effort that is not quick, balanced or deep is dropped, not guessed. */
export function nextConfiguration(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw codingFailure("coding.server.next-config");
  const config = value as Record<string, unknown>;
  if (!["discuss", "plan", "collaborate", "parallel", "edit", "execute", "review"].includes(String(config.intent))) throw codingFailure("coding.server.intent");
  for (const key of ["provider_id", "model_id", "workspace_id"]) {
    if (typeof config[key] !== "string" || (config[key] as string).length > 1000) throw codingFailure("coding.server.model-workspace");
  }
  // The effort the person chose for the next round; one that is not quick, balanced or deep is dropped, not guessed.
  const effort = (AGENT_REASONING_EFFORTS as readonly unknown[]).includes(config.reasoning_effort) ? { reasoning_effort: config.reasoning_effort as AgentReasoningEffort } : {};
  return { intent: config.intent as string, provider_id: config.provider_id as string,
    model_id: config.model_id as string, workspace_id: config.workspace_id as string, ...effort,
    ...(config.writer_assignments === undefined ? {} : { writer_assignments: codingWriterAssignments(config.writer_assignments) }) };
}

/** Picked objects as a reference question's answer: within the SDK's limits, each a kind, an id and a label as text. */
function pickedObjects(given: unknown[]): Array<{ kind: string; id: string; label: string }> {
  if (given.length > QUESTION_LIMITS.maxReferences) throw codingFailure("coding.server.pick-limit", { count: QUESTION_LIMITS.maxReferences });
  return given.map(item => {
    const { kind, id, label } = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    if (![kind, id, label].every(field => typeof field === "string" && field.length <= QUESTION_LIMITS.maxReferenceChars)) throw codingFailure("coding.server.pick-shape");
    return { kind: kind as string, id: id as string, label: label as string };
  });
}

export function questionAnswer(body: Record<string, unknown>): Extract<AgentRunControl, { kind: "answer" }> {
  const pending_id = text(body.pending_id, "coding.field.question");
  const pending_revision = body.pending_revision;
  if (typeof pending_revision !== "number" || !Number.isInteger(pending_revision) || pending_revision < 1) throw codingFailure("coding.server.question-version");
  if (body.answers === undefined) {
    text(body.text, "coding.field.answer", 100_000);
    // Validate blank/oversized input without rewriting the user's answer.
    return { kind: "answer", pending_id, pending_revision, text: body.text as string };
  }
  if (body.text !== undefined || !Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > 10) throw codingFailure("coding.server.answers-shape");
  const answers = body.answers.map(value => {
    if (!value || typeof value !== "object") throw codingFailure("coding.server.answers-shape");
    const { question, indexes, other, value: given } = value as Record<string, unknown>;
    // A question that is not a choice is answered with a value: words, a date or a moment as text, a number, picked objects,
    // or nothing. Only the shape is read here; whether it fits its question (one or several, which kinds) is the Runtime's
    // to judge, and whether the person may hand the objects over is the Host's (S-26).
    if (indexes === undefined && typeof question === "number" && Number.isInteger(question)) {
      if (Array.isArray(given) && other === undefined) return { question, value: pickedObjects(given) };
      if (!(given === null || typeof given === "string" && given.length <= 2000 || typeof given === "number" && Number.isFinite(given)) || other !== undefined) throw codingFailure("coding.server.answer-shape");
      return { question, value: given as string | number | null };
    }
    if (typeof question !== "number" || !Number.isInteger(question) || !Array.isArray(indexes) || indexes.length > 20
      || !indexes.every(index => typeof index === "number" && Number.isInteger(index))
      || other !== undefined && (typeof other !== "string" || other.length > 500)) throw codingFailure("coding.server.answer-index");
    return { question, indexes: indexes as number[], ...(other === undefined ? {} : { other: other as string }) };
  });
  return { kind: "answer", pending_id, pending_revision, answers };
}

/** The reasoning effort a round is started with: one of the three, and only for a model marked as taking one. */
export function chosenEffort(body: Record<string, unknown>, model: CodingModelChoice): AgentReasoningEffort | undefined {
  const effort = body.reasoning_effort === undefined || body.reasoning_effort === "" ? undefined : String(body.reasoning_effort);
  if (effort !== undefined && (!(AGENT_REASONING_EFFORTS as readonly string[]).includes(effort) || !model.reasoning_effort)) throw codingFailure("coding.server.effort");
  return effort as AgentReasoningEffort | undefined;
}

/** A supplement goes to the Agent Host's `agent.inputs.send`, taking one back to `agent.inputs.withdraw`; every other control to the round's own control. */
export type CodingRunControl = AgentRunControl | { kind: "steer"; send: AgentInputSend } | { kind: "withdraw"; input_id: string };

/**
 * A control the person sends to the round. A switch names only a model the Host offers this plugin; whether the round
 * can carry it is the Host's check. A supplement's source, key, mode and `about` were checked against the action's schema; its
 * key is the page's, so one sent again after a lost answer is the same supplement to the runtime. A correction names the
 * input it is about; what changes is in its words (specs/ai-input-receipts D34). `host`: the Host relaying words the
 * person did not write (a page's own wording), which the round keeps as a note, never as theirs (BL-144).
 */
export async function runControl(body: Record<string, unknown>, models: () => Promise<readonly CodingModelChoice[]>): Promise<CodingRunControl> {
  if (body.kind === "answer") return questionAnswer(body);
  if (body.kind === "steer") return { kind: "steer", send: { text: text(body.text, "coding.field.supplement", 100_000),
    ...(typeof body.source === "string" ? { source: body.source as AgentInputSource } : {}),
    ...(typeof body.key === "string" ? { key: body.key } : {}), ...(typeof body.mode === "string" ? { mode: body.mode as AgentSteerMode } : {}),
    ...(typeof body.about === "string" ? { about: body.about } : {}) } };
  if (body.kind === "withdraw") return { kind: "withdraw", input_id: text(body.input_id, "coding.field.supplement-ref") };
  if (body.kind === "stop" || body.kind === "pause" || body.kind === "resume") return { kind: body.kind };
  if (body.kind === "switch-model") {
    const model = (await models()).find(entry => entry.provider_id === body.provider_id && entry.model_id === body.model_id);
    if (!model) throw codingFailure("coding.server.model-missing");
    return { kind: "switch-model", provider_id: model.provider_id, model_id: model.model_id };
  }
  throw codingFailure("coding.server.control");
}
