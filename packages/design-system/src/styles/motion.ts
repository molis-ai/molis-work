/**
 * The product's motion vocabulary (DESIGN「Motion」): one keyframe for each kind of entrance, and the one wash for
 * something that has just landed. Part of the final layer every product page loads, so a plugin animates with these
 * names and never writes its own.
 */
export const MOTION_STYLES = `
  /* Something arrives: a surface's first reveal, a reading, a result, a card or a step. 7px from 40%, so words never blink. */
  @keyframes craft-rise { from { opacity: .4; transform: translateY(7px); } to { opacity: 1; transform: none; } }
  /* Something shown again, or a layer that only appears: a cross-fade. */
  @keyframes craft-fade-in { from { opacity: 0; } to { opacity: 1; } }
  /* A menu grows from its control: down from one above it, up from one below it (and from the bar); 4px and .97. */
  @keyframes craft-drop { from { opacity: 0; transform: translateY(-4px) scale(.97); } to { opacity: 1; transform: none; } }
  @keyframes craft-rise-from-bar { from { opacity: 0; transform: translateY(4px) scale(.97); } to { opacity: 1; transform: none; } }
  /* Something that just landed (a new Goal, message, Inbox entry, issue or record) says so once: one copper wash that fades.
     Set data-craft-new on the row, or call molisCraft.land(row); the row keeps its own background and pseudo-elements' room. */
  [data-craft-new] { position: relative; }
  [data-craft-new]::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: var(--accent-soft); opacity: 0;
    animation: craft-landed var(--dur-moment, 640ms) var(--ease-quint);
  }
  @keyframes craft-landed { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { [data-craft-new]::after { animation: none; } }
`;
