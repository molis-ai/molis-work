/** The shell draws Coding settings with these rules, through its registration. */
export const CODING_SETTINGS_STYLES = `
  .coding-settings details { margin-block: 12px; }
  .coding-settings summary { cursor: pointer; overflow-wrap: anywhere; }
  .coding-settings .mw-select { max-width: 100%; }
  .coding-settings [data-mcp-config] { padding-block: 16px; border-bottom: 1px solid var(--line); }
  .coding-settings .mw-form-stack:not([hidden]) { display: grid; gap: 12px; }
  .coding-settings [data-mcp-servers] { padding-block: 12px; font-size: 13px; }
`;
