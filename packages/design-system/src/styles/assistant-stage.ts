/** The same conversation fills a normal workspace sheet when expanded. */
export const ASSISTANT_STAGE_STYLES = `
  .assistant-rules { margin-bottom: 18px; }
  .assistant-rule-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-top: 12px; font-size: 13px; }
  .assistant-rule-form > strong { flex-basis: 100%; font-weight: 500; }
  .assistant-rule-surfaces { display: flex; flex-wrap: wrap; gap: 6px 14px; flex-basis: 100%; }
  .assistant-rule-form select { width: auto; }

.system-view-focus{display:block;margin:32px auto;padding:12px 20px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink);font:inherit;cursor:pointer}.system-work-surface:has([data-assistant-island])>.system-view-focus{display:none}
.system-work-surface{height:100%;min-height:0;min-width:0;overflow:hidden}
html body.immersive-workbench [data-assistant-island][data-assistant-stage]{position:relative;display:flex;flex-direction:column;width:100%;height:100%;max-width:none;min-width:0;gap:0;padding:0;align-self:stretch}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-panel[data-layout][data-side]{position:relative;inset:auto;flex:1;width:100%;height:auto;min-height:0;border-radius:0;background:var(--paper);box-shadow:none;animation:none}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-tabbar{justify-content:flex-end;flex:none;min-height:44px;padding:4px 12px;background:var(--paper);box-shadow:inset 0 -1px var(--line)}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] :is(.assistant-tabs,.assistant-tab-new,[data-assistant-panel-close]){display:none}
html body.immersive-workbench [data-assistant-stage] .assistant-stage-footer{position:relative;flex:none;min-width:0}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-composer{flex:none;width:calc(100% - 40px);max-width:800px;min-height:56px;margin:12px auto 20px}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] :is(.assistant-context-strip,.assistant-next-row){flex:none;position:static;width:calc(100% - 40px);max-width:800px;margin:8px auto -4px}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-thread{scrollbar-gutter:stable;padding:24px max(20px,calc((100% - 800px)/2));font-size:15px;line-height:1.7}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-composer-input{font-size:15px}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-tabbar-actions{gap:8px}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-tabbar [data-assistant-retract]{display:inline-flex;width:auto;gap:6px}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-tabbar [hidden]{display:none}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-side{gap:12px;padding:12px;background:var(--paper)}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-side>:is(.assistant-summary,.assistant-block){flex:none;padding:12px;border:1px solid var(--line);border-radius:var(--r-card);background:var(--paper)}
html body.immersive-workbench [data-assistant-island][data-assistant-stage] :is(.assistant-block-head,.assistant-usage>summary){padding-top:0;box-shadow:none}
html body.immersive-workbench .assistant-stage-launcher{min-width:120px;margin:auto}
html body.immersive-workbench .assistant-stage-launcher[hidden]{display:none}
@media(max-width:760px){html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-composer{width:calc(100% - 24px);margin:8px auto 12px}html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-thread{padding:16px}html body.immersive-workbench [data-assistant-island][data-assistant-stage] .assistant-composer-input{font-size:16px}}
@media(max-width:420px){html body.immersive-workbench [data-assistant-island]:not([data-assistant-stage]) .assistant-tabbar{height:auto;flex-wrap:wrap}html body.immersive-workbench [data-assistant-island]:not([data-assistant-stage]) .assistant-tabs{flex:1 1 calc(100% - 44px)}html body.immersive-workbench [data-assistant-island]:not([data-assistant-stage]) .assistant-tabbar-actions{flex:0 0 100%;justify-content:flex-end}html body.immersive-workbench [data-assistant-island]:not([data-assistant-stage]) .assistant-works{top:94px}}
`;
