/** AP3 visual layer: motion & interaction polish. Appended last in the visual
    foundation so every surface inherits one calm, consistent timing vocabulary.
    Everything here is additive: zero-specificity fallbacks and property-scoped
    transitions never override a component's own motion. */
export const MOTION_POLISH_STYLES = `
  /* Interactive elements settle instead of snapping. Only surface properties
     transition — geometry stays instant so layouts never wobble. The :where()
     fallback has zero specificity, so any component transition keeps winning. */
  :where(a, button, summary, input, select, textarea, label, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"]) {
    transition-property: color, background-color, border-color, outline-color, box-shadow, opacity;
    transition-duration: var(--dur-fast);
    transition-timing-function: var(--ease-standard);
  }
  :where(.check-box, .goal-status, .momentum-queue-item, .tree-entry, .project-record-row, .feed-list-item, .source-list-item, .tree-filter-option, .feed-filter-option, .preference-option, .policy-source > summary, .goal-factor-nav button, .goal-situation-cell, .plugin-market-grid article) {
    transition-property: color, background-color, border-color, box-shadow, opacity;
    transition-duration: var(--dur-fast);
    transition-timing-function: var(--ease-standard);
  }

  /* Primary actions gain a quiet tactile press. */
  .button-primary,
  .goal-primary-action,
  .planning-primary-action,
  .project-index-create,
  .project-migration-submit,
  .runtime-plan-apply,
  .human-review-jump,
  .guidance-primary-action {
    transition: color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-base) var(--ease-emphasized), transform var(--dur-instant) var(--ease-standard);
  }
  .button-primary:not(:disabled):active,
  .goal-primary-action:not(:disabled):active,
  .planning-primary-action:not(:disabled):active,
  .project-index-create:not(:disabled):active,
  .human-review-jump:not(:disabled):active,
  .guidance-primary-action:not(:disabled):active {
    transform: scale(.975);
  }

  /* Graph nodes and hover-lift cards move smoothly instead of jumping. */
  .momentum-node {
    transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-base) var(--ease-emphasized), transform var(--dur-fast) var(--ease-standard), opacity var(--dur-fast) var(--ease-standard);
  }
  .feed-linked-goal,
  .feed-detail-actions button {
    transition: color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-base) var(--ease-emphasized), transform var(--dur-fast) var(--ease-standard);
  }

  /* Transient surfaces bloom in place; dialogs rise gently. */
  @keyframes goalboard-menu-in {
    from { opacity: 0; transform: translateY(-4px) scale(.98); }
  }
  .theme-menu,
  .tui-menu,
  .goal-more > div,
  .tree-filter,
  .navigator-project-menu-popover,
  .feed-filter-panel,
  .project-record-filter-menu > div {
    animation: goalboard-menu-in var(--dur-fast) var(--ease-emphasized);
  }
  @keyframes goalboard-dialog-in {
    from { opacity: 0; transform: translateY(10px) scale(.985); }
  }
  @keyframes goalboard-backdrop-in {
    from { opacity: 0; }
  }
  .create-dialog,
  .runtime-plan-dialog,
  .project-migration-dialog,
  .feed-import-dialog,
  .feed-source-dialog {
    animation: goalboard-dialog-in var(--dur-base) var(--ease-emphasized);
  }
  .create-dialog::backdrop {
    animation: goalboard-backdrop-in var(--dur-base) ease-out;
  }

  /* Theme switching cross-fades the page canvas instead of flashing. */
  body {
    transition: background-color var(--dur-base) var(--ease-standard);
  }

  /* Selection and caret share the accent so text work feels coherent. */
  ::selection {
    color: var(--ink);
    background: color-mix(in srgb, var(--blue) 22%, transparent);
  }
  input,
  textarea {
    caret-color: var(--blue);
  }

  /* Link underlines sit slightly off the glyphs for cleaner reading. */
  a {
    text-underline-offset: 2px;
  }

  /* Scrollbars stay thin and tonal wherever a surface chooses to show them. */
  :where(*) {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--ink) 22%, transparent) transparent;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: .01ms !important;
    }
  }
`;
