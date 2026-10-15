import type { AgentRunControl, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantContextSnapshot, AssistantMaterial } from "@molis-ai/molis-work-contracts/services/assistant";

/** What became of a Send that reached a round already under way. */
export type RoundInputOutcome = "answered" | "steered";

/** The round a Send reaches, whichever executor carries it (the Assistant's own runtime or a Coding session). */
export interface RunningRoundPort {
  control(control: AgentRunControl): Promise<void>;
  /** Called before a supplement goes out; it throws when this executor cannot take one now. */
  beforeSteer?(): void;
}

/**
 * The person's words to a round under way (specs/ai-input-receipts §4.1): an answer to its one open free-text question,
 * or a supplement it reads at its next boundary. One place decides, for the Assistant's own rounds and for the Coding
 * sessions it carries, so the two never disagree on where the same words go.
 */
export class AssistantInputs {
  constructor(private readonly maxText: number) {}

  async deliver(round: AgentRunView, text: string, materials: AssistantMaterial[], context: AssistantContextSnapshot | null, port: RunningRoundPort): Promise<RoundInputOutcome> {
    const question = this.freeTextQuestion(round.awaiting_input);
    if (round.phase === "awaiting-input" && question && !materials.length) {
      await port.control({ kind: "answer", pending_id: question.pending_id, ...(question.pending_revision !== undefined ? { pending_revision: question.pending_revision } : {}), text });
      return "answered";
    }
    port.beforeSteer?.();
    await port.control({ kind: "steer", text: this.compose(text, materials, context) });
    return "steered";
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
