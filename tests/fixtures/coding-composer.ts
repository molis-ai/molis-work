/**
 * Where Coding's composer keeps each part (the platform's composer since unified-input-voice K4), for scripts run in the Coding
 * page's own document. The box, send, stop and pause are the composer's; the bar's controls carry their id (`intent`, `model`,
 * `effort`, `model-switch`); what sets the next round is a ＋ command, found by its `/word`.
 */
export const CODING_COMPOSER = "[data-coding-input]";
export const CODING_BOX = `${CODING_COMPOSER} .mw-composer__input`;
export const CODING_SEND = `${CODING_COMPOSER} [data-composer-send]`;
export const CODING_STOP = `${CODING_COMPOSER} [data-composer-stop]`;
export const CODING_PAUSE = `${CODING_COMPOSER} [data-composer-pause]`;
/** The composer's status line (what a send is doing, why it waits, what failed). */
export const CODING_COMPOSER_STATUS = `${CODING_COMPOSER} .mw-composer__status`;

/** A control in the bar by its id: `intent`, `model`, `effort` (a select) or `model-switch` (a button). */
export const codingControl = (id: string) => `${CODING_COMPOSER} [data-composer-control="${id}"]`;

/** A script that opens ＋ (unless it is open) and presses the command found by `/slash` (`materials`, `character`, `actions`…). */
export const codingAdd = (slash: string) => `(()=>{const shell=document.querySelector(${JSON.stringify(CODING_COMPOSER)});
  if(!shell.querySelector('[data-compose-menu]:not([hidden]) [data-composer-command]'))shell.querySelector('[data-composer-add]').click();
  const row=[...shell.querySelectorAll('[data-composer-command]')].find(node=>node.querySelector('kbd, .mw-menu__shortcut')?.textContent.trim()===${JSON.stringify("/" + slash)}||node.textContent.includes(${JSON.stringify("/" + slash)}));
  if(!row)throw Error('no ＋ command /${slash}');row.click();})()`;

/** A script that chooses how the next words reach the running round: opens the ▾ menu and picks `mode`. */
export const codingDeliver = (mode: "next-boundary" | "interrupt" | "after-run") => `(()=>{const shell=document.querySelector(${JSON.stringify(CODING_COMPOSER)});
  shell.querySelector('[data-compose-menu-toggle]').click();const item=shell.querySelector('[data-composer-delivery=${JSON.stringify(mode)}]');
  if(!item||item.disabled)throw Error('delivery ${mode} not offered');item.click();})()`;

/** A script that writes into the box the way typing does: the value, then the input event the composer listens to. */
export const codingType = (text: string) => `(()=>{const node=document.querySelector(${JSON.stringify(CODING_BOX)});node.value=${JSON.stringify(text)};
  node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:${JSON.stringify(text.slice(-1))}}));})()`;
