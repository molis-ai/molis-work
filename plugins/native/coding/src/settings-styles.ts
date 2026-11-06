/** The shell draws Coding settings with these rules, through its registration. */
export const CODING_SETTINGS_STYLES = `
  .coding-settings details { margin-block: 12px; }
  .coding-settings summary { cursor: pointer; overflow-wrap: anywhere; }
  .coding-settings .coding-method-body { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 28rem; overflow: auto; font-family: var(--font-mono); font-size: 12px; line-height: 1.65; padding: 12px; background: var(--nav-hover); }
  .coding-settings .mw-select { max-width: 100%; }
`;
