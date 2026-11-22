/**
 * The quiet note (`renderNote`): the field hint's type with a mark; a warning one marks in the attention tone, in shape too. Part of
 * `PRIMITIVE_STYLES`, so every sheet that takes the primitives (each product page and the visual foundation) can draw a note.
 */
export const NOTE_STYLES = `
  .mw-note { display: flex; align-items: flex-start; gap: 8px; min-width: 0; margin: 0; color: var(--muted); font-family: var(--type-note-font); font-weight: var(--type-note-weight); font-size: var(--type-note-size); line-height: var(--type-note-line-height); letter-spacing: var(--type-note-tracking);
    > svg { flex: none; width: 14px; height: 14px; margin-top: 3px; }
    > span { min-width: 0; overflow-wrap: anywhere; }
    &.is-warning > svg { color: var(--tone-attention); }
  }
`;
