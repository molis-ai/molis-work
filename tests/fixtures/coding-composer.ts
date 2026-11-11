/**
 * Where Coding's composer keeps each part. Since one input (specs/unified-input-voice §10.3–10.4, O2–O3) Coding draws no box of
 * its own: a session on show is the receiver of the workbench bar's one input, so these selectors are the bar's and every script
 * built from them runs in the TOP document (the workbench, `owner`/`browser`), never in the Coding frame. The box, send, stop and
 * pause are the composer's; the bar's controls carry their id (`intent`, `model`, `effort`, `model-switch`); what sets the next
 * round is a ＋ command, found by its `/word`.
 */
export const CODING_COMPOSER = "[data-assistant-island] [data-assistant-composer]";
export const CODING_BOX = `${CODING_COMPOSER} .mw-composer__input`;
export const CODING_SEND = `${CODING_COMPOSER} [data-composer-send]`;
export const CODING_STOP = `${CODING_COMPOSER} [data-composer-stop]`;
export const CODING_PAUSE = `${CODING_COMPOSER} [data-composer-pause]`;
/** The composer's status line (what a send is doing, why it waits, what failed). */
export const CODING_COMPOSER_STATUS = `${CODING_COMPOSER} .mw-composer__status`;
/** True (top document) once a Coding session on show has taken the bar: before that the box is the Assistant's. */
export const CODING_TAKEN = "(document.querySelector('[data-assistant-island]')?.dataset.receiver === 'page' && globalThis.molisBarReceivers?.front()?.options.entry === 'session')";
/** True (top document) once the bar is Coding's and its box takes words (the session's first read landed). */
export const CODING_OPEN = `(${CODING_TAKEN} && !document.querySelector(${JSON.stringify(CODING_BOX)}).disabled)`;

/** A control in the bar by its id: `intent`, `model`, `effort` (a select) or `model-switch` (a button). */
export const codingControl = (id: string) => `${CODING_COMPOSER} [data-composer-control="${id}"]`;

/** A script (top document) that opens ＋ (unless it is open) and presses the command found by `/slash` (`materials`, `character`, `actions`…). */
export const codingAdd = (slash: string) => `(()=>{const shell=document.querySelector(${JSON.stringify(CODING_COMPOSER)});
  if(!shell.querySelector('[data-compose-menu]:not([hidden]) [data-composer-command]'))shell.querySelector('[data-composer-add]').click();
  const row=[...shell.querySelectorAll('[data-composer-command]')].find(node=>node.querySelector('kbd, .mw-menu__shortcut')?.textContent.trim()===${JSON.stringify("/" + slash)}||node.textContent.includes(${JSON.stringify("/" + slash)}));
  if(!row)throw Error('no ＋ command /${slash}');row.click();})()`;

/** A script (top document) that chooses how the next words reach the running round: opens the ▾ menu and picks `mode`. */
export const codingDeliver = (mode: "next-boundary" | "interrupt" | "after-run") => `(()=>{const shell=document.querySelector(${JSON.stringify(CODING_COMPOSER)});
  shell.querySelector('[data-compose-menu-toggle]').click();const item=shell.querySelector('[data-composer-delivery=${JSON.stringify(mode)}]');
  if(!item||item.disabled)throw Error('delivery ${mode} not offered');item.click();})()`;

/** A script (top document) that writes into the box the way typing does: the value, then the input event the composer listens to. */
export const codingType = (text: string) => `(()=>{const node=document.querySelector(${JSON.stringify(CODING_BOX)});node.value=${JSON.stringify(text)};
  node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:${JSON.stringify(text.slice(-1))}}));})()`;
