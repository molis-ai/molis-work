/**
 * Maximise (specs/screen-polish §4「底栏第十三版」, POLISH-60): the conversation and the information column reach up to the
 * tab strip; the work surface and the side panel give way and come back as they were (they are hidden, never unmounted, so
 * tabs and scroll positions stay). The conversation column keeps the input's width and the input does not move. Pressing the
 * key again, Esc, or closing the conversation restores.
 */
export const ASSISTANT_MAX_FACTORY = String.raw`({island,panel})=>{
  if(document.body.hasAttribute('data-pane-embedded'))return null;
  const expand=island.querySelector('[data-assistant-expand]'),retract=island.querySelector('[data-assistant-retract]');
  let on=false;
  // The panel's foot is set by the sheet; its height is what reaches the work surface's top.
  const measure=()=>{
    if(!on)return;
    const stage=document.querySelector('[data-plugin-stage]'),top=stage?stage.getBoundingClientRect().top:0;
    panel.style.setProperty('--assistant-max-h',Math.max(240,Math.round(panel.getBoundingClientRect().bottom-top))+'px');
  };
  const set=(next)=>{
    if(on===next)return;
    on=next;panel.toggleAttribute('data-max',next);document.body.toggleAttribute('data-assistant-max',next);
    if(expand)expand.hidden=next;if(retract)retract.hidden=!next;
    if(next)measure();else panel.style.removeProperty('--assistant-max-h');
  };
  expand?.addEventListener('click',()=>{set(true);retract?.focus();});
  retract?.addEventListener('click',()=>{set(false);expand?.focus();});
  window.addEventListener('resize',measure,{passive:true});
  new ResizeObserver(measure).observe(island);
  return {set,get on(){return on;}};
}`;

/** Shared by the Assistant's controller and its movable presentation. */
export const ASSISTANT_ELEMENT_SCRIPT = String.raw`(tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}`;

/**
 * Puts children in order without moving any that already stand in place: moving a node drops the focus inside it (an answer
 * being typed, a button reached by keyboard), and a running work repaints every few seconds.
 */
export const ASSISTANT_PLACER_SCRIPT = String.raw`(parent) => {
  let last = null;
  return (child) => {
    const want = last ? last.nextElementSibling : parent.firstElementChild;
    if (want !== child) parent.insertBefore(child, want);
    last = child;
    return child;
  };
}`;
