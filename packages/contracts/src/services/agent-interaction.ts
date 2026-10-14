import type { ContractDescriptor } from "../platform/package.js";

/**
 * The shape of a question an Agent's run stops on while it waits for a person, and of the answer and the per-field
 * problems that come back. The SDK owns a pending's questions, their freezing, the answer rules and the machine
 * reasons (`QuestionnaireProblemReason`); this file describes them to Molis in Molis's words, so one question card can
 * show them wherever a run is shown. The Host owns whether an object exists and may be used. Nothing here carries
 * authority: an answer is information, never approval.
 *
 * The question types an interface can render are the Host's to declare (the Runtime offers the model only the types
 * every interface that shows questions can render); a type not offered never reaches the model.
 */
export const servicesAgentInteractionContract = {
  contractId: "io.molis.work.service.agent-interaction.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/ai-interaction-experience/spec.md",
} as const satisfies ContractDescriptor;

/** The kinds of question. A question that names no type is a choice question. */
export const AGENT_QUESTION_TYPES = ["choice", "text", "number", "date", "datetime", "reference"] as const;
export type AgentQuestionType = (typeof AGENT_QUESTION_TYPES)[number];

/** One option of a choice question. Frozen when the question is prepared; an answer names it by `index`. */
export interface AgentQuestionOption {
  index: number;
  label: string;
  /** How this option differs from the others. The reason for a recommendation is written here. */
  description?: string;
  /** The asker recommends this option. A recommendation is not a pick: it counts only when the person picks it. */
  recommended?: boolean;
}

/** An object from the Host's own directory. Whether it exists and may be used is the Host's to check, not the asker's. */
export interface AgentQuestionReference {
  kind: string;
  id: string;
  label: string;
}

/** A question as Molis shows it. */
export interface AgentQuestion {
  /** The question's number within its set; an answer names it by this. */
  index: number;
  /** A stable name the asker uses to read the answer back (`deadline`). Unique within a set. */
  id?: string;
  prompt: string;
  type: AgentQuestionType;
  /** Required unless it says otherwise. An optional question may be answered empty. */
  required: boolean;
  /** Why it is asked, or what a good answer looks like. */
  help?: string;
  /** Choice questions only. */
  options: AgentQuestionOption[];
  /** Choice and reference questions: may more than one be picked. */
  multiple: boolean;
  /** Choice questions: may the person write an answer of their own beside the options. */
  allow_other: boolean;
  /** A starting point for the form only. The answer is what the person submits; an unsent default is no answer. */
  default?: string | number | number[];
  /** Text questions. */
  multiline?: boolean;
  max_length?: number;
  /** Number questions are numbers; date and datetime questions are ISO 8601 strings. */
  min?: number | string;
  max?: number | string;
  /** Number questions: whole numbers only. */
  integer?: boolean;
  /** Reference questions: which kinds of object may be picked, and how many at most when `multiple`. */
  ref_kinds?: string[];
  max_count?: number;
}

/** What a non-choice question is answered with. `null` is an optional question left empty on purpose. */
export type AgentQuestionValue = string | number | readonly AgentQuestionReference[] | null;

/** One answer. Every question is answered exactly once. */
export interface AgentQuestionAnswer {
  question: number;
  /** Choice questions: the numbers of the options picked. */
  indexes?: readonly number[];
  /** Choice questions that allow it: the person's own answer. */
  other?: string;
  /** Every other kind of question. */
  value?: AgentQuestionValue;
}

/**
 * Why one question cannot be answered as given. A closed set the interface turns into a sentence beside the field; it
 * never parses a message. These are the SDK's reasons (`QuestionnaireProblemReason`), spelled the same.
 */
export const AGENT_QUESTION_PROBLEM_REASONS = [
  "unknown-question", "answered-twice", "unanswered", "required", "wrong-shape", "unknown-option", "single-select",
  "duplicate", "other-not-allowed", "too-long", "not-a-number", "not-an-integer", "too-small", "too-large",
  "bad-date", "too-early", "too-late", "kind-not-allowed", "too-many",
] as const;
/**
 * The Host's own reason beside the SDK's (specs/ai-interaction-experience H3): a picked object is gone, is not the person's
 * to use now, or is of a kind the question does not allow, as its owner says right before the answer would go on.
 */
export const AGENT_QUESTION_HOST_REASONS = ["reference-unavailable"] as const;
export type AgentQuestionProblemReason = (typeof AGENT_QUESTION_PROBLEM_REASONS)[number] | (typeof AGENT_QUESTION_HOST_REASONS)[number];

/** One problem, tied to its question so the interface can mark that field and leave the others as they are. */
export interface AgentQuestionProblem {
  question: number;
  id?: string;
  reason: AgentQuestionProblemReason;
}

/** One answer-control's wire shape: the answer to one pending question, closing it. */
export interface AgentAnswerControl {
  kind: "answer";
  pending_id: string;
  pending_revision?: number;
  /** A free-text pending (no questionnaire) is answered with text. */
  text?: string;
  /** A questionnaire is answered question by question, each exactly once. */
  answers?: ReadonlyArray<AgentQuestionAnswer>;
}

/**
 * A question the Run stopped on and is waiting for a person to answer.
 *
 * Options are what the Runtime offered. An empty list means free text only — never a hidden default, because
 * answering on the user's behalf is the one thing a question surface must not do.
 */
export interface AgentPendingQuestion {
  pending_id: string;
  pending_revision?: number;
  /** Position of the original waiting event among this Run's visible entries. */
  sequence?: number;
  /** The Runtime's own category, e.g. a plan choice or a clarification. */
  kind: string;
  /** The question as the Runtime phrased it. Shown as-is. */
  prompt: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Whether a written answer is accepted alongside, or instead of, the options. */
  allows_free_text: boolean;
  /** Frozen questionnaire read from its execution owner, never reconstructed from prose. */
  questions?: ReadonlyArray<AgentQuestion>;
  answerable?: boolean;
  unavailable_reason?: string;
}
