/**
 * The page asking the Assistant which work a card it prepared goes into (`molis:assistant-card-target`, answered in
 * assistant-work-objects.ts; specs/context-program §21.2 item 5, W3-A3a). Dispatching is synchronous: when it returns, the
 * answer is in. No answer means a new work, as before.
 */
/** The page's question: one answer, a work id or null; a second answer, or anything else, is ignored. */
export const CARD_TARGET_ASK_SCRIPT = String.raw`((object) => {
    let target = null, answered = false;
    const reply = (id) => { if (answered || (id !== null && typeof id !== "string")) return; answered = true; target = id || null; };
    document.dispatchEvent(new CustomEvent("molis:assistant-card-target", { detail: { object, reply } }));
    return target;
  })`;
