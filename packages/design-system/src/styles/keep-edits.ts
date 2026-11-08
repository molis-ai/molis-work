/**
 * Keeping someone's edits when what they were editing changed elsewhere (docs/design/rule-stale-reload/README.md「组件板新增」, plan A
 * decided 2026-11-06): buttons inside an alert, the row that keeps what you wrote under its field, the dot on a step and a field's
 * arrival wash. The parts are `renderAlert`'s `actions`, `renderKept` and `renderStepDot` of the SDK's /ui; their specimens are on
 * the board (#alert-actions, #kept, #step-dot, #field-wash). Served in the Workbench and settings sheets, where the rule editor and
 * Feed's rule page draw them; every control is an existing one, these rules only place them.
 */
export const KEEP_EDITS_STYLES = `
  /* 1 · Buttons inside an alert: under its words, so the next step reads as the answer to what the alert says. One shape for
     every alert with a next step; a page never writes its own row. The column is the alert's own width, so a long button wraps
     instead of widening the alert and its words. */
  .mw-alert { min-width: 0; grid-template-columns: minmax(0, 1fr); }
  .mw-alert > :is(strong, p) { min-width: 0; overflow-wrap: anywhere; }
  .mw-alert__actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  /* An action's words are never cut (DESIGN): only a label that cannot fit the row wraps, and only that button grows. */
  .mw-alert__actions > .mw-btn { max-width: 100%; height: auto; white-space: normal; text-align: start; padding-block: 4px; line-height: 1.35; }
  .mw-alert__title { display: flex; align-items: flex-start; gap: 6px; }
  .mw-alert__mark { display: inline-grid; place-items: center; flex: none; width: 20px; height: 20px; }
  .mw-alert[tabindex="-1"]:focus { outline: none; }
  /* It rises in when it first appears; on success its mark settles (the one bounce here, kept for a finished moment); it hops once
     when a blocked press sends someone back to it. A repaint leaves these off, so nothing moves twice. */
  .mw-alert--rise { animation: craft-rise var(--dur-move) var(--ease-quint); }
  .mw-alert--success.mw-alert--rise .mw-alert__mark { animation: mw-alert-land var(--dur-move) var(--ease-spring); }
  .mw-alert.is-nudged { animation: mw-alert-nudge var(--dur-move) var(--ease-quint); }
  @keyframes mw-alert-land { from { transform: scale(.6); } to { transform: none; } }
  @keyframes mw-alert-nudge { 0% { transform: none; } 40% { transform: translateY(-3px); } 100% { transform: none; } }

  /* 2 · What you wrote, kept under the field it came from: the amber of "waits on the person" (DESIGN「Reading load」). Once put back
     the same slot holds the other version, neutral, with the way back. */
  .mw-kept { display: grid; gap: 4px; min-width: 0; padding: 8px 8px 8px 12px; border-radius: var(--r-control); background: var(--amber-soft); }
  .mw-kept.is-swapped { background: var(--surface-soft); }
  .mw-kept__head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .mw-kept__who { flex: 1; min-width: 0; color: var(--ink); font-size: 12px; font-weight: var(--weight-control); overflow-wrap: anywhere; }
  /* The clamp gives the third line its ellipsis; the shared check reads the same cut. */
  .mw-kept__text { margin: 0; color: var(--ink-soft); font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  .mw-kept__text.is-open { display: block; -webkit-line-clamp: unset; }
  .mw-kept__text.is-blank { color: var(--muted); }
  /* The padding reaches a finger without taking line room, as the link beside a status mark does. */
  .mw-btn.mw-kept__more { --reach: 4px; justify-self: start; min-height: 0; padding: var(--reach) 0; margin-block: calc(-1 * var(--reach)); font-size: 13px; line-height: 20px; text-decoration: underline; text-underline-offset: 3px; }
  .mw-btn.mw-kept__more[hidden] { display: none; }
  /* A group arrives one after another, half a hover apart. */
  .mw-kept--rise { animation: craft-rise var(--dur-move) var(--ease-quint) backwards; animation-delay: calc(var(--i, 0) * var(--dur-hover) / 2); }
  @media (max-width: 760px), (pointer: coarse) { .mw-btn.mw-kept__more { --reach: 12px; } }
  /* Forced colours drop the wash: a border the system paints keeps the row's edge. */
  @media (forced-colors: active) { .mw-kept { border: 1px solid transparent; } }

  /* 3 · A dot on a step that holds something to look at: in the corner of the step's number. The number is a centred grid, so the
     dot's place starts from its middle. Amber like the row it points to; its ring keeps it apart from the number's edge. */
  .mw-step-dot { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 2px var(--paper); transform: translate(9px, -9px); }
  [aria-current] .mw-step-dot { display: none; }
  @media (forced-colors: active) { .mw-step-dot { forced-color-adjust: none; background: Highlight; } }

  /* 4 · A field whose content just changed: the same [data-craft-new] moment on the same clock (molisCraft.land(node, "field")), but
     the row's opaque wash would hide the words in a field. A tenth of the accent shows as much and leaves the words readable; it
     reaches a little past the field's edge. The attribute is named twice so the variant outweighs the one rule wherever the sheets
     put it. */
  [data-craft-new][data-craft-new="field"]::after { inset: -4px -8px; border-radius: var(--r-control); background: color-mix(in srgb, var(--accent) 10%, transparent); }

  @media (prefers-reduced-motion: reduce) { .mw-alert--rise, .mw-alert--success.mw-alert--rise .mw-alert__mark, .mw-alert.is-nudged, .mw-kept--rise { animation: none; } }
  html[data-craft-still] :is(.mw-alert--rise, .mw-alert--rise .mw-alert__mark, .mw-alert.is-nudged, .mw-kept--rise) { animation: none !important; }
`;
