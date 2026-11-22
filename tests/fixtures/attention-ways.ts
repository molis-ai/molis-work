/**
 * The two ways to what wants the person, as page expressions (底栏第十三版): the notices (a connection lost, a model not ready,
 * plugin deliveries, news of a work) open from the account bar's 通知 key — under 960px, where the account bar is not drawn, from
 * the bell beside the input; the objects that want a look open from their card of the stack.
 */

/** The key to the notices that is on screen. */
export const NOTICES_KEY = "[...document.querySelectorAll('[data-bar-notices], [data-assistant-attention]')].find(key => key.getClientRects().length)";
/** That key says something waits: either key shows its count (the bell stays in reach without one while its list only holds news). */
export const NOTICES_WAIT = `(key => Boolean(key) && (key.matches('[data-assistant-attention]') ? Boolean(key.querySelector('[data-assistant-attention-count]')?.textContent.trim()) : key.querySelector('[data-bar-notices-count]')?.hidden === false))(${NOTICES_KEY})`;
/** Nothing waits there: no count on the account bar's key, and no bell or a bell without a number. */
export const NOTICES_REST = "document.querySelector('[data-bar-notices-count]')?.hidden !== false && (bell => !bell || bell.hidden || !bell.querySelector('[data-assistant-attention-count]')?.textContent.trim())(document.querySelector('[data-assistant-attention]'))";
/** The notices list is open from that key. */
export const NOTICES_OPEN = `${NOTICES_KEY}?.getAttribute('aria-expanded') === 'true'`;
/** Presses that key. */
export const PRESS_NOTICES = `${NOTICES_KEY}.click()`;

/** The stack counts something to look at (its card may stand behind others). */
export const LOOK_WAIT = "Number(document.querySelector('[data-work-stack]')?.dataset.count) > 0";
/**
 * Opens the list of what wants a look from its card: the stack is opened first where it is folded into the input, and paged
 * to that card. Resolves false when no such card is in the stack.
 */
export const OPEN_LOOK = `(async () => {
  const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
  const stack = document.querySelector('[data-work-stack]'), toggle = document.querySelector('[data-work-stack-toggle]');
  if (stack && !stack.getClientRects().length && toggle?.getClientRects().length) { toggle.click(); await frame(); }
  for (let step = 0; step < 16 && !stack?.querySelector('[data-work-stack-look]'); step++) { stack?.querySelector('[data-work-stack-next]')?.click(); await frame(); }
  const look = stack?.querySelector('[data-work-stack-look]');
  look?.click();
  return Boolean(look);
})()`;

/** Opens the list of what wants a look, waiting for its card to come into the stack. */
export async function openLook(evaluate: <T>(expression: string) => Promise<T>, waitMs = 20_000): Promise<void> {
  for (const until = Date.now() + waitMs; ;) {
    if (await evaluate<boolean>(OPEN_LOOK)) return;
    if (Date.now() > until) throw new Error("no card of the stack says something wants a look; the stack: " + await evaluate<string>("(() => { const stack = document.querySelector('[data-work-stack]'); return stack ? stack.dataset.count + ' · ' + stack.textContent.trim().slice(0, 160) : 'none'; })()"));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
