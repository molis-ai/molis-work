/** Runs in the browser only; the plugin build has no DOM library, so elements are typed by the fields this script touches. */
type AnsweredNode = {
  textContent: string | null;
  contains(other: AnsweredNode | null): boolean;
  remove(): void;
  querySelector(selector: string): AnsweredNode | null;
  querySelectorAll(selector: string): Iterable<AnsweredNode> & { forEach(each: (node: AnsweredNode) => unknown): void };
  focus(options?: { preventScroll?: boolean }): void;
};
declare const document: { activeElement: AnsweredNode | null; body: AnsweredNode };

/**
 * A question card once the Host has taken its answer (specs/ai-interaction-experience §15.10, AC-10-3, AC-10-8). The card
 * becomes one receipt line, and that line is the card's own status line (`role=status`, drawn with the card): every element
 * that holds neither it nor the title goes, so the receipt is read out as a change in a live region already there rather
 * than as a node that appears, and the card (`aria-labelledby` its title) keeps its name while the receipt shows. Focus
 * that was in the card fell to the page with its fields, so it comes back to the composer, but only while `here` — this
 * is still the session on screen and the card still on the page; focus the person put somewhere else while the answer was
 * on its way stays there. Injected into the browser with `toString()`, so it stays self-contained.
 */
export function codingQuestionAnswered(card: AnsweredNode, note: AnsweredNode, said: string, input: AnsweredNode, here: boolean) {
  const title = card.querySelector("h3");
  card.querySelectorAll("*").forEach(node => node.contains(note) || node.contains(title) || node.remove());
  note.textContent = said;
  if (here && document.activeElement === document.body) input.focus({ preventScroll: true });
}
