/**
 * Which window a split-pane message may come from (docs/system/SECURITY-INVARIANTS.md S-30). A split pane is its own
 * document; it and the page around it talk with `postMessage`. Every handler on either side asks here first:
 *
 * - `from(event)`: on the page, the pane frame a message came from, when it came from this origin and from the window of
 *   one of the panes (`iframe[data-pane-owner]`); else null and the message is dropped.
 * - `fromParent(event)`: in a pane, whether a message came from the page around it, from this origin.
 * - `keep` / `take`: a token handed to one pane (a choice it may confirm) is taken back by that pane's frame alone, once.
 *
 * An expression. The workbench page makes it once (`paneMessages` in the client bootstrap) and hands it to each factory
 * that listens for these messages; a document of its own (a plugin's side view) joins it in.
 */
export const PANE_MESSAGES_SCRIPT = String.raw`(() => {
    const held = new Map();
    const typed = (event) => event.origin === location.origin && Boolean(event.data) && typeof event.data.type === "string";
    return {
      from: (event) => typed(event) && [...document.querySelectorAll("iframe[data-pane-owner]")].find((node) => node.contentWindow === event.source) || null,
      fromParent: (event) => window.parent !== window && event.source === window.parent && typed(event),
      keep: (token, frame, value) => held.set(token, { frame, value }),
      take(token, frame) {
        const entry = held.get(token);
        if (!entry || entry.frame !== frame) return null;
        held.delete(token);
        return entry.value;
      },
    };
  })()`;

/**
 * On the page, the side panel's plugin frame (`#side-panel iframe[data-side-frame]`) a message came from, when it came from
 * this origin and from the window of one of those frames, else null (S-30). One check: `SIDE_FORWARD_SCRIPT.from`, and the
 * context bus for what a side view has in hand (context-bus.ts).
 */
export const SIDE_FRAME_FROM_SCRIPT = String.raw`(event) => event.origin === location.origin && typeof event.data?.type === "string" && [...document.querySelectorAll("#side-panel iframe[data-side-frame]")].find(node => node.contentWindow === event.source) || null`;

/**
 * The page events a plugin's side view may hand to the page (S-30): a side view is its own document, so the shared dialogs
 * and cards that live on the page (placement) would not hear what it dispatches. Its document sends each of these names
 * up as `{ type: "molis:side-forward", name, detail }`. On the page, `from(event)` is `SIDE_FRAME_FROM_SCRIPT`;
 * `event(name, detail)` makes the event to dispatch on the page's window, or null for a
 * name not listed here. One list, read by both ends: `names` to listen, `event` to dispatch.
 */
export const SIDE_FORWARD_SCRIPT = String.raw`(() => {
    const make = { "molis:surface-interaction": () => new CustomEvent("molis:surface-interaction"), "molis:placement-convert": detail => new CustomEvent("molis:placement-convert", { detail }), "molis:placement-request": detail => new CustomEvent("molis:placement-request", { detail }), "molis:placement-result": detail => new CustomEvent("molis:placement-result", { detail }), "molis:assistant-message": detail => new CustomEvent("molis:assistant-message", { detail }) };
    return { names: Object.keys(make), from: ${SIDE_FRAME_FROM_SCRIPT},
      event: (name, detail) => typeof name === "string" && Object.hasOwn(make, name) ? make[name](detail) : null };
  })()`;
