/** Text Stats' counts as the Host draws them on its page (the page client fills `[data-companion-content]`). */
export const TEXT_STATS_STYLES = `
[data-companion-content] .stats-counts { display:grid; grid-template-columns:minmax(0,1fr) auto; max-width:480px; gap:24px; margin:24px 0; padding:24px 0; font-size:13px; }
[data-companion-content] .stats-counts dt { color:var(--muted); }
[data-companion-content] .stats-counts dd { margin:0; font-size:20px; font-variant-numeric:tabular-nums; }
[data-companion-content] .stats-origin { display:block; margin-top:4px; color:var(--muted); font-size:12px; }
`;
