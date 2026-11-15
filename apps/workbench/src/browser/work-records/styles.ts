import { WORK_RECORD_STYLES } from "@molis-ai/molis-work-design-system/work-records";

const PAGE_STYLES = `
  .wr-page { display: grid; gap: 24px; min-width: 0; }
  .wr-page > .mw-tabs { margin-top: -8px; min-width: 0; }
  .wr-page > .mw-tabs > .mw-tabs__list { flex-wrap: wrap; }
  .wr-block { display: grid; gap: 16px; min-width: 0; }
  .wr-block > section { display: grid; gap: 8px; min-width: 0; }
  .wr-block h2 { margin: 0; font-size: 13px; font-weight: var(--weight-title, 600); color: var(--ink); }
  .wr-block .wr-sub { margin: 0; font-size: 12px; color: var(--muted); }
  :where(.wr-page) .mw-mark { display: inline-grid; place-items: center; width: 32px; height: 32px; flex: none; border-radius: var(--sk-r-slot, var(--r-control)); background: var(--sk-raised, var(--paper)); box-shadow: inset 0 0 0 1px var(--line); color: var(--ink-soft); }
  :where(.wr-page) .mw-mark svg { width: 16px; height: 16px; }
  .wr-page .mw-items { display: grid; grid-template-columns: minmax(0, 1fr); width: 100%; min-width: 0; margin: 0; padding: 6px; list-style: none; border: 1px solid var(--line); border-radius: var(--r-card); background: var(--paper); }
  .wr-page .mw-item { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 6px 6px 6px 10px; border-radius: var(--r-row); transition: background-color var(--dur-hover, 130ms) var(--ease-quint); }
  .wr-page .mw-item:is(:hover, :focus-within) { background: var(--nav-hover); }
  .wr-page .mw-item > span:nth-child(2) { display: flex; align-items: baseline; gap: 8px; flex: 1 1 auto; min-width: 0; }
  .wr-page .mw-item strong { flex: 0 1 auto; min-width: 0; overflow: hidden; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); text-overflow: ellipsis; white-space: nowrap; }
  .wr-page .mw-item small { flex: 1 1 0; min-width: 0; margin: 0; overflow: hidden; color: var(--muted); font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
  .wr-page .mw-item__end { display: flex; align-items: center; gap: 8px; flex: none; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .wr-page .mw-settings { display: grid; width: 100%; min-width: 0; grid-template-columns: minmax(0, 1fr); border: 1px solid var(--line); border-radius: var(--r-card); background: var(--paper); }
  .wr-page .mw-setting { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px; min-height: 60px; padding: 12px 16px; min-width: 0; }
  .wr-page .mw-setting + .mw-setting { box-shadow: inset 0 1px 0 var(--line); }
  .wr-page .mw-setting > div:first-child { display: grid; gap: 2px; flex: 1 1 220px; min-width: 0; }
  .wr-page .mw-setting strong { overflow: hidden; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); text-overflow: ellipsis; white-space: nowrap; }
  .wr-page .mw-setting p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .wr-page .mw-setting > div:last-child { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; min-width: 0; }
  .wr-page .mw-setting .mw-select { width: auto; min-width: 140px; }
  .wr-page :is(.mw-setting, .wr-filter, .mw-ix-actions) .mw-select-picker { width: auto; min-width: 140px; }
  .wr-page .mw-stat { display: grid; align-content: start; gap: 4px; padding: 16px; min-width: 0; border: 1px solid var(--line); border-radius: var(--r-card); background: var(--paper); }
  .wr-page .mw-stat > p { margin: 0; font-size: 12px; color: var(--muted); }
  .wr-page .mw-stat strong { font-size: 24px; line-height: 32px; font-weight: var(--weight-title, 600); color: var(--ink); letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
  .wr-page .mw-stat strong small { margin-left: 4px; font-size: 13px; font-weight: var(--weight-control, 500); letter-spacing: 0; color: var(--muted); }
  .wr-page .mw-stat__delta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 20px; font-size: 12px; color: var(--muted); }
  .wr-page .mw-meter { max-width: 100%; }
  .mw-items > .wr-more { display: grid; gap: 6px; margin: 0 0 6px 54px; font-size: 12px; line-height: 1.6; color: var(--ink-soft); list-style: none; overflow-wrap: anywhere; }
  .mw-items > .wr-more b { font-weight: var(--weight-control, 500); color: var(--ink); margin-right: 6px; }
  .wr-lock { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; color: var(--muted); }
  .wr-lock svg { width: 14px; height: 14px; flex: none; }
  .wr-impact { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--ink-soft); }
  .wr-impact li { display: flex; gap: 8px; align-items: flex-start; }
  .wr-impact svg { width: 14px; height: 14px; flex: none; margin-top: 2px; }
  .wr-impact .lose svg { color: var(--amber); }
  .wr-impact .ok svg { color: var(--green); }
  .wr-dialog-body { display: grid; gap: 16px; min-width: 0; }
  .wr-dialog-body .mw-field .mw-ix-actions { display: flex; flex-wrap: nowrap; gap: 8px; align-items: center; }
  .wr-dialog-body .mw-field .mw-ix-actions > * { min-width: 0; }
  .wr-dialog-body .mw-field .mw-ix-actions .mw-input[type="date"] { flex: 1 1 0; width: auto; min-width: 140px; }
  .wr-size { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
  .wr-size strong { font-size: 20px; font-weight: var(--weight-title, 600); color: var(--ink); font-variant-numeric: tabular-nums; }
  .wr-size span { font-size: 12px; color: var(--muted); }
  .wr-filter { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 0; }
  .wr-filter .mw-select { width: auto; min-width: 140px; }
  .wr-block .mw-collapsible summary .mw-status { margin-left: 8px; }
  @media (max-width: 600px) {
    .mw-items > .wr-more { margin-left: 10px; }
    .wr-page .mw-setting > div:last-child { margin-left: 0; }
    .wr-page .mw-item { align-items: flex-start; padding-block: 8px; }
    .wr-page .mw-item > span:nth-child(2) { flex-direction: column; align-items: flex-start; gap: 2px; }
    .wr-page .mw-item strong, .wr-page .mw-item small { white-space: normal; overflow-wrap: anywhere; flex: unset; }
    .wr-dialog-body .mw-field .mw-ix-actions { flex-wrap: wrap; }
  }
`;

export function addWorkRecordsStyles(): void {
  if (document.querySelector("style[data-work-records-styles]")) return;
  const style = document.createElement("style");
  style.dataset.workRecordsStyles = "";
  style.textContent = PAGE_STYLES + WORK_RECORD_STYLES;
  document.head.append(style);
}
