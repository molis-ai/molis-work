/**
 * Instructions a Plugin (or the system) gives a text model when it calls one directly — a writing helper, a summary,
 * a naming step. They are registered with the Host like every Agent prompt, so the person can see and edit them in
 * “Prompt 与 Character”, and a call runs with the person's version when there is one.
 *
 * A call keeps its fixed instructions and its data apart: the instructions are registered text, the data (the user's
 * material, this call's parameters) is appended by the Host after them. Text the call builds for itself never
 * reaches the model without going through a registered instruction; an automated check fails on raw prompt strings.
 */
export interface InstructionPrompt {
  /** The Plugin id, or `system:<module>` for the Host's own. */
  readonly owner_id: string;
  readonly prompt_id: string;
  /** Raise it when the shipped text changes meaning; the person's edit then shows “default updated”. */
  readonly version: number;
  readonly title: string;
  readonly purpose: string;
  /** Which features use it, as the person reads them. */
  readonly used_by: readonly string[];
  readonly body: string;
}

const TOKEN = /^[a-z0-9][a-z0-9.-]*$/u;

export function defineInstructionPrompt(prompt: InstructionPrompt): InstructionPrompt {
  if (!prompt.owner_id.trim() || !TOKEN.test(prompt.prompt_id) || !Number.isSafeInteger(prompt.version) || prompt.version < 1
    || !prompt.title.trim() || !prompt.body.trim()) {
    throw new Error(`指令 Prompt ${prompt.owner_id}/${prompt.prompt_id} 的声明不完整`);
  }
  return Object.freeze({ ...prompt, used_by: Object.freeze([...prompt.used_by]) });
}

/** What a caller hands the Host's text model: registered instructions, and this call's data kept apart from them. */
export interface InstructedPrompt {
  readonly instruction: InstructionPrompt;
  readonly data: string;
}

export function instructed(instruction: InstructionPrompt, data: string): InstructedPrompt {
  return { instruction, data };
}

export function isInstructedPrompt(value: unknown): value is InstructedPrompt {
  return typeof value === "object" && value !== null && typeof (value as InstructedPrompt).data === "string"
    && typeof (value as InstructedPrompt).instruction?.prompt_id === "string";
}

/** The one way instructions and data become the text a model reads. */
export function composeInstructedPrompt(body: string, data: string): string {
  return data.trim() ? `${body.trim()}\n\n${data}` : body.trim();
}

/**
 * A text model port that takes registered instructions. The Host resolves the person's version of the instructions
 * before sending; a plain string is accepted only from the callers still listed as transitional in the check.
 */
export type ModelPromptInput = string | InstructedPrompt;

/** The text a prompt sends with its shipped instructions: what a model double or a Host without a register sees. */
export function modelPromptText(prompt: ModelPromptInput): string {
  return typeof prompt === "string" ? prompt : composeInstructedPrompt(prompt.instruction.body, prompt.data);
}
