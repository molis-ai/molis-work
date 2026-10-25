/**
 * The two classes a form's button row and its notes are drawn with. Form and Goals' event documents both draw them, so they are
 * the workbench's, not Form's (PG-070): Form's own sheet holds only rules for its own classes. They are in the workbench sheet
 * alone, as they were while they sat in Form's rules; the settings sheet has never carried them.
 */
export const FORM_VOCABULARY_STYLES = `
  .mw-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .mw-actions .mw-btn { flex: none; width: auto; align-self: center; }
  .mw-note { margin: 0 24px 16px; max-width: 40rem; font-size: 12px; color: var(--muted); }
  .mw-note.is-error { color: var(--red); }
`;
