import type { AgentRunView, AgentTurnView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentAnswerControl } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { AGENT_INPUT_KEY_PATTERN, type AgentInputSend, type AgentInputsPort, type AgentSteerReceipt } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { AssistantContextSnapshot, AssistantMaterial, AssistantSendInput } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantErrors } from "./assistant-errors.js";

/** What became of a Send that reached a round already under way, or one that had just ended (its words wait for the next). */
export type RoundInputOutcome = "answered" | "steered" | "queued";

/**
 * One press of Send as the round under way sees it. `id`: the page's id for it, which the supplement carries as its key,
 * so a Send repeated after a lost answer is the same supplement to the runtime, even when the Host crashed before it
 * recorded the outcome. `target`: what the person chose while a question waits (§4.1, D14). `byHost`: the words are not
 * the person's (a page or the Host wrote them), so the runtime records them as the Host's.
 */
export interface SendIntent { id?: string; target?: AssistantSendInput["target"]; byHost?: boolean }

/** Where `compose` starts what it added after the person's words; nothing before it was added. */
const ADDED = /\n\n【(?:发送时的选区，数据】|附带材料「)/;

/**
 * What the person typed, in order (memory's 「你说过」, specs/ai-input-receipts G13): each round they wrote, then the
 * supplements they sent it while it ran. The supplements are read from the runtime's own input record (the run view),
 * never stored again here; a supplement the Host or a page wrote reads as a notice there, so it is not among them.
 */
export function typedWords(rounds: ReadonlyArray<{ run_id: string; text: string; written_by?: string }>, views: ReadonlyArray<{ run_id: string; turns: readonly AgentTurnView[] }>): string[] {
  const turns = new Map(views.map(view => [view.run_id, view.turns]));
  return rounds.flatMap(round => [...(round.written_by ? [] : [round.text]),
    ...(turns.get(round.run_id) ?? []).filter(turn => turn.kind === "user" && turn.steer).map(turn => turn.text.split(ADDED)[0]!)]);
}

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
   * The person chooses (D14): words go to the round as a supplement unless they chose to answer its question. Answering
   * takes its one free-text question, without materials; anything else is refused, never quietly sent as a supplement.
   */
  async deliver(round: AgentRunView, text: string, materials: AssistantMaterial[], context: AssistantContextSnapshot | null, port: RunningRoundPort, intent: SendIntent = {}): Promise<RoundInputOutcome> {
    if (intent.target === "answer") {
      const question = this.freeTextQuestion(round.awaiting_input);
      if (round.phase !== "awaiting-input" || !question) throw assistantErrors.stale("这一轮已经不在等你回答问题；这句话没有发送");
      if (materials.length) throw assistantErrors.invalid("回答不能带材料；要带上材料，请改选「补充这一轮」");
      await port.answer({ kind: "answer", pending_id: question.pending_id, pending_revision: exactRevision(question.pending_revision), text });
      return "answered";
    }
    port.beforeSteer?.();
    const key = intent.id && new RegExp(AGENT_INPUT_KEY_PATTERN).test(`send.${intent.id}`) ? { key: `send.${intent.id}` } : {};
    const receipt = await port.send({ text: this.compose(text, materials, context), ...key, ...(intent.byHost ? { source: "host" as const } : {}) });
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
