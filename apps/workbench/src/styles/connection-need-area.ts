/**
 * The connection card on a plugin page (src/browser/plugin-frame/connection-need.ts; specs/assistant-service-connections/spec.md
 * §13.5): a platform area (`mw-platform-area`, styles/platform-area.ts) whose height is the shell's, two steps by width and one line
 * once folded. The header and the buttons hold their place; what the card says in between scrolls. The foot holds at most two
 * buttons (cancel and the step's own); in the narrow step they stack, each a 44px target, in the foot's 96px (ASC-71). Another way
 * (换一个) is a quiet button in the body. The accounts to choose from are the component board's choices, one a line.
 */
export const CONNECTION_NEED_AREA_STYLES = `
.connection-need-area__title{flex:1 0 100%;margin:0;overflow:hidden;font-size:14px;font-weight:var(--weight-strong,600);line-height:20px;text-overflow:ellipsis;white-space:nowrap}
.connection-need-area .mw-platform-area__body{display:grid;align-content:start;gap:10px}
.connection-need-area__quote{margin:0;padding:2px 0 2px 10px;border-left:2px solid var(--line);color:var(--muted);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.connection-need-area__text,.connection-need-area__wait{margin:0;font-size:13px;line-height:20px;overflow-wrap:anywhere}
.connection-need-area__wait:focus{outline:none}
.connection-need-area__origin{margin:0;padding:8px 10px;border-radius:var(--sk-r-card,12px);background:var(--accent-soft);color:var(--accent);font-size:13px;font-weight:var(--weight-control,560);overflow-wrap:anywhere}
.connection-need-area .mw-field{display:grid;gap:4px;margin:0}
.connection-need-area__accounts{display:grid;gap:4px}.connection-need-area__accounts .mw-choice{min-width:0;min-height:40px;text-align:left}.connection-need-area__accounts .mw-choice__label{white-space:normal;overflow-wrap:anywhere}
.connection-need-area__scope,.connection-need-area__hint{margin:0;color:var(--muted);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.connection-need-area__more{display:flex;justify-content:flex-start;min-width:0}
.connection-need-area__note{margin:0;color:var(--muted);font-size:12px;line-height:18px}.connection-need-area__note:empty{display:none}
.connection-need-area__note.is-error{color:color-mix(in srgb,var(--red) 78%,var(--ink))}
.connection-need-area__foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0;height:44px}
.connection-need-area__foot .mw-btn{flex:none;max-width:100%}
@container (max-width:479.98px){.connection-need-area__foot{flex-direction:column-reverse;align-items:stretch;height:96px;justify-content:flex-start}.connection-need-area__foot .mw-btn{min-height:44px;width:100%}}
.connection-need-area[data-stage=line]{grid-template-rows:1fr;padding:0 6px 0 14px;animation:none}
.connection-need-area__line{display:flex;align-items:center;gap:8px;min-width:0}
.connection-need-area__line>p{flex:1 1 auto;min-width:0;margin:0;overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.connection-need-area__line>p:focus{outline:none}
.connection-need-area__line>p:focus-visible{outline:var(--focus-stroke);outline-offset:1px;border-radius:var(--r-tag)}
.assistant-connection-need{margin-top:10px}.assistant-connection-need[data-stage=line]{min-height:48px}
`;
