/**
 * The quiet note (`renderNote`): the field hint's type with a mark; a warning one marks in the attention tone, in shape too. Part of
 * `PRIMITIVE_STYLES`, so every sheet that takes the primitives (each product page and the visual foundation) can draw a note.
 */
export const NOTE_STYLES = `
  .mw-note { display: flex; align-items: flex-start; gap: 8px; min-width: 0; margin: 0; color: var(--muted); font-family: var(--type-note-font, var(--font)); font-weight: var(--type-note-weight, 400); font-size: var(--type-note-size, 12px); line-height: var(--type-note-line-height, 1.6); letter-spacing: var(--type-note-tracking, 0); }
  .mw-note > svg { flex: none; width: 14px; height: 14px; margin-top: 3px; }
  .mw-note > span { min-width: 0; overflow-wrap: anywhere; }
  .mw-note.is-warning > svg { color: var(--tone-attention); }
`;
