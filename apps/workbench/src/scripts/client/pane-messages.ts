/**
 * Which window a split-pane message may come from (docs/system/SECURITY-INVARIANTS.md S-30). A split pane is its own
 * document; it and the page around it talk with `postMessage`. Every handler on either side asks here first:
 *
 * - `from(event)`: on the page, the pane frame a message came from, when it came from this origin and from the window of
 *   one of the panes (`iframe[data-pane-owner]`); else null and the message is dropped.
 * - `fromParent(event)`: in a pane, whether a message came from the page around it, from this origin.
 * - `keep` / `take`: a token handed to one pane (a choice it may confirm) is taken back by that pane's frame alone, once.
 *
 * An expression, joined into each factory that listens for these messages.
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
