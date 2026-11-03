import type { AgentPendingQuestion } from "../services/agent-interaction.js";
import type { AssistantCard } from "../services/assistant-cards.js";

/** A step a plugin adds after what waits on the person: `id` is what its own page reads back, `label` and `source` in its own words. */
export interface PluginInteractionStep {
  readonly id: string;
  readonly label: string;
  readonly source: string;
}

/** What the next-step row is drawn from: a round's records, as the plugin keeps them, and the plugin's own steps after them. */
export interface PluginInteractionNextSteps {
  readonly questions: readonly AgentPendingQuestion[];
  readonly cards: readonly AssistantCard[];
  /**
   * The round is over: the row also offers the result of its card that ran last, as a step pressing that result's 「打开」 by the
   * selector `[data-card="<card_id>"] [data-ix-press="open"]` (the page keeps each card's html in an element carrying `data-card`).
   */
  readonly finished?: boolean;
  readonly follow_ups?: readonly PluginInteractionStep[];
}

/**
 * The platform's interaction pieces as html, the same the Assistant shows (specs/ai-interaction-experience A1, H2, AC-25): a waiting
 * question's card, an action card, and the next-step row. Drawn in the language of the call it runs in, from what the plugin passes
 * and nothing else: it reads and writes no record, needs no permission, and every string the plugin passes is escaped (or, for a
 * card result's link, drawn only when it stays on this Home). A sandboxed plugin reaches it through the broker.
 */
export interface PluginInteractionClient {
  /** `reask`: a question that can no longer be answered offers 「请 AI 重新问」. */
  questionHtml(question: AgentPendingQuestion, options?: { readonly reask?: boolean }): Promise<string>;
  /** `redo`: a stale card offers a fresh preparation; only a keeper that can make one passes it. */
  cardHtml(card: AssistantCard, options?: { readonly redo?: boolean }): Promise<string>;
  /** The row, or an empty string when there is no step. */
  nextStepsHtml(input: PluginInteractionNextSteps): Promise<string>;
}
