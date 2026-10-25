/**
 * A question card once the Host has taken its answer (specs/ai-interaction-experience §15.10, AC-10-3, AC-10-8). The card becomes one
 * receipt line, and that line is the card's own status line (`role=status`, drawn with the card): every element that holds neither it
 * nor the title goes, so the receipt is read out as a change in a live region already there rather than as a node that appears, and
 * the card (`aria-labelledby` its title) keeps its name while the receipt shows. Focus that was in the card fell to the page with its
 * fields, so it comes back to the composer, but only while `here` — this is still the session on screen and the card still on the
 * page; focus the person put somewhere else while the answer was on its way stays there.
 */
export function questionAnswered(card: HTMLElement, note: HTMLElement, said: string, input: HTMLElement, here: boolean) {
  const title = card.querySelector("h3");
  card.querySelectorAll("*").forEach(node => node.contains(note) || (title && node.contains(title)) || node.remove());
  note.textContent = said;
  if (here && document.activeElement === document.body) input.focus({ preventScroll: true });
}
