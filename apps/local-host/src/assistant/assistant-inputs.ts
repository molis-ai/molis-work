import type { AgentRunView, AgentSessionView, AgentTurnView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentAnswerControl } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { AGENT_INPUT_KEY_PATTERN, type AgentInputSend, type AgentInputsPort, type AgentSteerReceipt } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { AssistantContextSnapshot, AssistantMaterial, AssistantSendInput, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { textFieldId } from "../agent-question-card.js";
import { assistantErrors } from "./assistant-errors.js";
import type { StoredWork } from "./assistant-store.js";

/** What became of a Send that reached a round already under way, or one that had just ended (its words wait for the next). */
type RoundInputOutcome = "answered" | "steered" | "queued";

/**
 * One press of Send as the round under way sees it. `id`: the page's id for it, which the supplement carries as its key,
 * so a Send repeated after a lost answer is the same supplement to the runtime, even when the Host crashed before it
 * recorded the outcome. `target`: what the person chose while a question waits (§4.1, D14). `byHost`: the words are not
 * the person's (a page or the Host wrote them), so the runtime records them as the Host's. `about`: the earlier input
 * these words correct (D34); the runtime keeps the link, the words say what changes.
 */
export interface SendIntent { id?: string; target?: AssistantSendInput["target"]; byHost?: boolean; about?: string }

/** Where `compose` starts what it added after the person's words; nothing before it was added. */
const ADDED = /\n\n【(?:发送时的选区，数据】|附带材料「)/;

/**
 * What the person typed, in order (memory's 「你说过」, specs/ai-input-receipts G13): each round they wrote, then the
 * supplements they sent it while it ran and have not withdrawn. The supplements are read from the runtime's own input record (the run view),
 * never stored again here; a supplement the Host or a page wrote reads as a notice there, so it is not among them.
 */
export interface AssistantMemorySourceRef { run_id: string; input_id: string | null; version: "1" }
export interface AssistantMemorySource extends AssistantMemorySourceRef { text: string }

/** Original round text and SDK input text are immutable; withdrawal changes eligibility, never this version. */
export function typedMemorySources(rounds: ReadonlyArray<{ run_id: string; text: string; written_by?: string }>, views: ReadonlyArray<{ run_id: string; turns: readonly AgentTurnView[] }>): AssistantMemorySource[] {
  const turns = new Map(views.map(view => [view.run_id, view.turns]));
  return rounds.flatMap(round => [...(round.written_by ? [] : [{ run_id: round.run_id, input_id: null, version: "1" as const, text: round.text }]),
    ...(turns.get(round.run_id) ?? []).filter(turn => turn.kind === "user" && turn.steer && turn.steer.state !== "withdrawn")
      .map(turn => ({ run_id: round.run_id, input_id: turn.steer!.id, version: "1" as const, text: turn.text.split(ADDED)[0]! }))]);
}

export function typedWords(rounds: ReadonlyArray<{ run_id: string; text: string; written_by?: string }>, views: ReadonlyArray<{ run_id: string; turns: readonly AgentTurnView[] }>): string[] {
  return typedMemorySources(rounds, views).map(source => source.text);
}

export function memoryLearningSources(rounds: Parameters<typeof typedWords>[0], views: ReadonlyArray<{ run_id: string; phase: string; turns: readonly AgentTurnView[] }>): { said: string[]; sources: AssistantMemorySourceRef[] } {
  const completed = new Set(views.filter(view => view.phase === "completed").map(view => view.run_id));
  const sources = typedMemorySources(rounds.filter(round => completed.has(round.run_id)), views).slice(-6);
  return { said: sources.map(source => source.text), sources: sources.map(({ text: _text, ...ref }) => ref) };
}

/** The round a Send reaches, whichever executor carries it (the Assistant's own runtime or an executor plugin's session). */
interface RunningRoundPort {
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

/**
 * Takes back a supplement the model has not seen yet (specs/ai-input-receipts §4.6), from the work's round it was sent to
 * or from the session where it waits. The runtime refuses one already read: the person sends a correction then.
 */
export async function withdrawInput(work: StoredWork, rounds: ReadonlyArray<{ run_id: string }>, { run_id, input_id }: { run_id: string; input_id: string },
  via: { executor(): Promise<{ withdraw(sessionId: string, runId: string, inputId: string): Promise<void> }>; runtime(): Promise<AgentInputsPort> }): Promise<void> {
  if (typeof run_id !== "string" || !run_id || typeof input_id !== "string" || !input_id) throw assistantErrors.invalid("撤回要指明是哪一轮的哪一条补充");
  if (work.executor.kind === "plugin") {
    if (!work.executor.session_id) throw assistantErrors.state("这项工作还没有交给执行方的补充");
    return (await via.executor()).withdraw(work.executor.session_id, run_id, input_id);
  }
  if (!work.session_id || !rounds.some(round => round.run_id === run_id)) throw assistantErrors.scope("这条补充不属于这项工作");
  const inputs = await via.runtime();
  if (!inputs.withdraw) throw assistantErrors.unsupported("当前运行时不能撤回补充");
  await inputs.withdraw({ session_id: work.session_id, run_id }, input_id);
}

/**
 * What waits in the work's own session for its next round (specs/ai-input-receipts §4.4, D31), as the runtime read it: only
 * while none of its rounds is live. Not read (or no session) leaves it out, so the page never takes that for an empty queue.
 */
export function queuedInputs(session: AgentSessionView | null): Pick<AssistantWorkView, "queued_inputs"> {
  return session?.queued_inputs ? { queued_inputs: session.queued_inputs } : {};
}

/** The revision an answer names: the first one given. An answer to a question no one numbered is not sent. */
export function exactRevision(...revisions: Array<number | undefined>): number {
  const revision = revisions.find(value => value !== undefined);
  if (revision === undefined) throw assistantErrors.stale("这个问题没有版本号，回答没有发送；请刷新后再回答");
  return revision;
}

/**
 * The person's words to a round under way (specs/ai-input-receipts §4.1): an answer to its one open free-text question
 * (a question in words, or a questionnaire whose one question asks for words: specs/ai-interaction-experience D34),
 * or a supplement it reads at its next boundary. One place decides, for the Assistant's own rounds and for the executor
 * sessions it carries, so the two never disagree on where the same words go.
 */
export class AssistantInputs {
  constructor(private readonly maxText: number) {}

  /**
   * The person chooses (D14): words go to the round as a supplement unless they chose to answer its question. Answering
   * takes its one free-text question, without materials; anything else is refused, never quietly sent as a supplement.
   * To answer, `round` is the run as read (a session's summary has not read a questionnaire's questions yet).
   */
  async deliver(round: AgentRunView, text: string, materials: AssistantMaterial[], context: AssistantContextSnapshot | null, port: RunningRoundPort, intent: SendIntent = {}): Promise<RoundInputOutcome> {
    if (intent.target === "answer") {
      const found = composerQuestion(round.awaiting_input), question = found && !found.field ? found.question : undefined;
      if (round.phase !== "awaiting-input" || !question) throw assistantErrors.stale("这一轮已经不在等你回答问题；这句话没有发送");
      if (materials.length) throw assistantErrors.invalid("回答不能带材料；要带上材料，请改选「补充这一轮」");
      const words = question.questions?.length ? { answers: [{ question: question.questions[0]!.index, value: text }] } : { text };
      await port.answer({ kind: "answer", pending_id: question.pending_id, pending_revision: exactRevision(question.pending_revision), ...words });
      return "answered";
    }
    port.beforeSteer?.();
    const key = intent.id && new RegExp(AGENT_INPUT_KEY_PATTERN).test(`send.${intent.id}`) ? { key: `send.${intent.id}` } : {};
    const receipt = await port.send({ text: this.compose(text, materials, context), ...key, ...(intent.byHost ? { source: "host" as const } : {}), ...(intent.about ? { about: intent.about } : {}) });
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
}

/**
 * Where words from the composer can go while the round waits on one question (specs/ai-interaction-experience D34, R4):
 * they answer it when it asks only for words (a question in words, or a questionnaire whose one question asks for words);
 * they go into its draft when it is a questionnaire with more than one question and one of them asks for words (`field`
 * names that field; the card's own submit hands it back). The page shows its chip by the same answer (`from_composer`,
 * `draft_from_composer` on the drawn view), so the two never disagree.
 */
export function composerQuestion(questions: AgentRunView["awaiting_input"]): { question: AgentRunView["awaiting_input"][number]; field?: string } | undefined {
  const [only, ...more] = questions, asked = only?.questions ?? [], words = asked.filter(item => item.type === "text");
  if (!only || more.length) return undefined;
  if (!asked.length) return only.allows_free_text ? { question: only } : undefined;
  if (words.length !== 1) return undefined;
  return asked.length === 1 ? { question: only } : { question: only, field: textFieldId(words[0]!.index) };
}
