export const PROJECT_RULES_SETTINGS_STYLES = `
  .project-rules-page .settings-document { width: min(100%, 900px); }
  .project-rules-receipt { margin: 20px 0 0; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--green), var(--line) 65%); border-radius: 5px; background: var(--green-soft); display: grid; gap: 2px; }
  .project-rules-receipt strong { color: var(--green); font-size: 12px; }
  .project-rules-receipt span { color: var(--muted); font-size: 12px; line-height: 1.5; }
  .project-rules-receipt:focus-visible { outline: 2px solid var(--green); outline-offset: -2px; }
  .project-rules-intro { margin: 24px 0 20px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 6px; background: var(--rail); }
  .project-rules-intro h2 { margin: 0; font-size: 15px; }
  .project-rules-intro p { max-width: 70ch; margin: 5px 0 0; color: var(--muted); font-size: 12px; }
  .project-rules-intro ol { margin: 14px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
  .project-rules-intro li { min-width: 0; padding: 11px 12px; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; }
  .project-rules-intro li > span:first-child { width: 22px; height: 22px; border-radius: 50%; color: var(--ink); background: var(--nav-hover); display: grid; place-items: center; font-size: 10px; font-weight: 400; }
  .project-rules-intro li > span:last-child { min-width: 0; display: grid; }
  .project-rules-intro li strong { font-size: 12px; }
  .project-rules-intro li small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .project-rules-page .policy-source { margin-bottom: 18px; }
  .project-rules-page .policy-source-title small { display: none; }
  .project-rules-page .settings-footnote { margin-top: 16px; }
  @media (max-width: 760px) {
    .project-rules-intro ol { grid-template-columns: 1fr; }
    .project-rules-page .policy-source-state { min-width: 0; }
  }
`;
