import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentAnswerControl } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { AGENT_INPUT_KEY_PATTERN, type AgentInputSend, type AgentInputsPort, type AgentSteerReceipt } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { AssistantContextSnapshot, AssistantMaterial } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantErrors } from "./assistant-errors.js";

/** What became of a Send that reached a round already under way, or one that had just ended (its words wait for the next). */
export type RoundInputOutcome = "answered" | "steered" | "queued";

/** The round a Send reaches, whichever executor carries it (the Assistant's own runtime or a Coding session). */
export interface RunningRoundPort {
  answer(control: AgentAnswerControl & { pending_revision: number }): Promise<void>;
  send(input: AgentInputSend): Promise<AgentSteerReceipt | undefined>;
  /** Called before a supplement goes out; it throws when this executor cannot take one now. */
  beforeSteer?(): void;
}

/** The runtime's supplement port, or a refusal that says this runtime has none. */
export function inputsOf(adapter: { readonly inputs?: AgentInputsPort }): AgentInputsPort {
  if (!adapter.inputs) throw assistantErrors.unsupported("当前运行时不能向进行中的一轮补充要求");
  return adapter.inputs;
}

/** The revision an answer names: the first one given. An answer to a question no one numbered is not sent. */
export function exactRevision(...revisions: Array<number | undefined>): number {
  const revision = revisions.find(value => value !== undefined);
  if (revision === undefined) throw assistantErrors.stale("这个问题没有版本号，回答没有发送；请刷新后再回答");
  return revision;
}

/**
 * The person's words to a round under way (specs/ai-input-receipts §4.1): an answer to its one open free-text question,
 * or a supplement it reads at its next boundary. One place decides, for the Assistant's own rounds and for the Coding
 * sessions it carries, so the two never disagree on where the same words go.
 */
export class AssistantInputs {
  constructor(private readonly maxText: number) {}

  /**
   * `requestId` is the page's id for this press of Send: the supplement carries it as its key, so a Send repeated after
   * a lost answer is the same supplement to the runtime, even when the Host crashed before it recorded the outcome.
   */
  async deliver(round: AgentRunView, text: string, materials: AssistantMaterial[], context: AssistantContextSnapshot | null, port: RunningRoundPort, requestId?: string): Promise<RoundInputOutcome> {
    const question = this.freeTextQuestion(round.awaiting_input);
    if (round.phase === "awaiting-input" && question && !materials.length) {
      await port.answer({ kind: "answer", pending_id: question.pending_id, pending_revision: exactRevision(question.pending_revision), text });
      return "answered";
    }
    port.beforeSteer?.();
    const key = requestId && new RegExp(AGENT_INPUT_KEY_PATTERN).test(`send.${requestId}`) ? { key: `send.${requestId}` } : {};
    const receipt = await port.send({ text: this.compose(text, materials, context), ...key });
    // A round that ended as the words arrived does not take them; they wait in its session for the next round.
    return receipt?.delivered === "queued" ? "queued" : "steered";
  }

  /** A supplement reaches a running round as text; its materials go with it, marked as data. */
  compose(text: string, materials: AssistantMaterial[], context: AssistantContextSnapshot | null): string {
    const parts = [text];
    if (context?.selection) parts.push(`【发送时的选区，数据】${context.selection.text.slice(0, 4000)}`);
    for (const material of materials) parts.push(`【附带材料「${material.title}」，数据】${(material.text ?? "").slice(0, 4000)}`);
    return parts.join("\n\n").slice(0, this.maxText);
  }

  private freeTextQuestion(questions: AgentRunView["awaiting_input"]): AgentRunView["awaiting_input"][number] | undefined {
    return questions.length === 1 && questions[0]!.allows_free_text && !questions[0]!.questions?.length ? questions[0] : undefined;
  }
}
