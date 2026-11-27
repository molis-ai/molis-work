/**
 * Batch 03 approved Scheme A on-demand help & pre-action facts parts (VUX-55, VUX-56):
 * `.mw-facts`/`.mw-fact-row`, `.mw-help-content`, `.mw-help-card`, `.mw-help-tip`, `.mw-help-side`.
 * Uses semantic tokens from DESIGN.md only; plugin-frame subset is included in PRIMITIVE_PLUGIN_STYLES
 * and full set (with outer-shell `.mw-help-side` and settings bar) is in PRIMITIVE_STYLES.
 */
export const ON_DEMAND_HELP_PLUGIN_STYLES = `
  .mw-facts:not(dl), .mw-help-content, .mw-help-section, .mw-help-section__list, .mw-help-next, .mw-help-card { display: flex; flex-direction: column; }
  .mw-fact-row, .mw-help-card__head, .mw-help-card__foot, .mw-help-tip, .mw-help-tip__actions { display: flex; align-items: center; }
  .mw-facts:not(dl), .mw-help-next, .mw-help-tip { border: 1px solid var(--line); background: var(--surface-soft); }
  .mw-help-card__next, .mw-help-card__foot { flex: none; border-top: 1px solid var(--line); background: var(--surface-soft); }
  .mw-facts:not(dl) { margin: 16px 0; padding: 12px 14px; border-radius: var(--r-card); gap: 8px; }
  .mw-facts__heading { margin: 0; font-size: 12px; font-weight: 600; color: var(--muted); }
  .mw-fact-row { gap: 10px; font-size: 13px; line-height: 1.45; color: var(--ink); }
  .mw-fact-row__icon { width: 22px; height: 22px; border-radius: 6px; display: inline-grid; place-items: center; flex: none; background: var(--rail); color: var(--ink-soft); svg { width: 14px; height: 14px; } }
  .mw-fact-row--ok .mw-fact-row__icon { background: var(--green-soft); color: var(--green); }
  .mw-fact-row--warn { .mw-fact-row__icon { background: var(--amber-soft); color: var(--amber); } .mw-fact-row__detail { color: var(--amber); } }
  .mw-fact-row--out { .mw-fact-row__icon { background: color-mix(in srgb, var(--hue-pink) 14%, transparent); color: var(--hue-pink); } .mw-fact-row__detail { color: var(--hue-pink); } }
  .mw-fact-row__body { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .mw-fact-row__detail { display: block; font-size: 12px; color: var(--muted); margin-top: 1px; }
  .mw-help-content { gap: 14px; font-size: 13px; line-height: 1.65; color: var(--ink); max-width: 60ch; }
  .mw-help-section { gap: 5px; &.is-highlighted { background: var(--accent-soft); padding: 10px 12px; border-radius: var(--r-row); border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent); } }
  .mw-help-section__heading, .mw-help-next__title { margin: 0; font-size: 13px; font-weight: 600; color: var(--ink); }
  .mw-help-section__body { margin: 0; color: var(--ink); }
  .mw-help-section__list { margin: 0; padding-left: 18px; gap: 4px; }
  .mw-help-next { margin-top: 4px; padding: 12px 14px; border-radius: var(--r-row); gap: 8px; }
  .mw-help-next__fact { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.5; }
  .mw-help-next__actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .mw-help-card {
    position: fixed; z-index: 60; width: min(380px, calc(100vw - 24px)); max-height: min(62dvh, 520px);
    background: var(--popover); border: 0; border-radius: var(--r-card); box-shadow: var(--lift-3), inset 0 1px 0 var(--edge-highlight); overflow: hidden; color: var(--ink);
    animation: craft-drop var(--dur-move) var(--ease-quint);
    &:focus { outline: none; }
    @media (max-width: 760px) {
      left: 8px !important; right: 8px !important; top: auto !important; bottom: calc(var(--dock-h, var(--helm-h, 74px)) + 8px) !important;
      width: auto !important; max-width: none; max-height: 50dvh; border-radius: var(--r-sheet); animation-name: craft-rise-from-bar;
      .mw-help-next__fact { display: none; }
    }
  }
  .mw-help-card__head { gap: 8px; padding: 10px 12px 10px 14px; border-bottom: 1px solid var(--line); flex: none; svg { width: 14px; height: 14px; color: var(--muted); flex: none; } }
  .mw-help-card__title { font-size: 13px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-help-card__body { padding: 14px; overflow: auto; flex: 1; min-height: 0; }
  .mw-help-card__next { padding: 10px 14px; .mw-help-next { margin-top: 0; padding: 0; border: 0; background: transparent; } }
  .mw-help-card__foot { justify-content: space-between; gap: 8px; padding: 8px 10px 8px 14px; }
  .mw-help-card__hint { font-size: 12px; color: var(--muted); }
  .mw-help-tip { gap: 10px; padding: 9px 12px; border-radius: var(--r-row); margin-bottom: 14px; font-size: 13px; color: var(--ink); > span:first-child svg { width: 15px; height: 15px; color: var(--accent); display: block; } @media (max-width: 600px) { flex-wrap: wrap; } }
  .mw-help-tip__text { flex: 1; min-width: 0; }
  .mw-help-tip__actions { gap: 8px; flex: none; }
  .mw-btn.mw-help-auto-trigger { position: fixed; bottom: 12px; right: 14px; z-index: 20; background: color-mix(in srgb, var(--paper) 88%, transparent); backdrop-filter: blur(6px); }
  .mw-btn.mw-help-auto-trigger--top { bottom: auto; top: 10px; right: 14px; }
  @media (max-width: 760px) { .mw-btn.mw-help-auto-trigger { top: auto; bottom: 10px; right: 10px; } }
`;

export const ON_DEMAND_HELP_SHELL_STYLES = `
  .mw-help-side{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;background:var(--paper);color:var(--ink)}
  .mw-help-side__head{display:flex;align-items:center;gap:8px;padding:12px 12px 12px 16px;border-bottom:1px solid var(--line);flex:none;& svg{width:14px;height:14px;color:var(--muted);flex:none}}
  .mw-help-side__title{font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mw-help-side__ctx{font-size:12px;color:var(--muted);padding:8px 16px;border-bottom:1px solid var(--line);background:var(--surface-soft);flex:none}
  .mw-help-side__body{padding:16px;overflow:auto;flex:1;min-height:0}
  .mw-settings-help-btn{margin-left:auto;flex:none}
  .mw-settings-help-bar{display:flex;justify-content:flex-end;margin-bottom:8px}
`.replace(/\n\s*/g, "");

export const ON_DEMAND_HELP_STYLES = ON_DEMAND_HELP_PLUGIN_STYLES + ON_DEMAND_HELP_SHELL_STYLES;
