/** The Issue page's style sheet; the client bundle carries it minified (tooling/build-client.mjs). */
export const ISSUES_STYLES = `
[data-issues=workbench] [hidden]{display:none!important}
.issues{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--paper);color:var(--ink)}
.issues-home,.issues-page{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px 12px 72px}
.issues-home>*,.issues-page>*{max-width:720px;margin-inline:auto}
.issues-composer{border:1px solid var(--line-strong);border-radius:12px;padding:10px 10px 8px 12px;background:var(--paper);transition:border-color var(--dur-hover) var(--ease-quint),box-shadow var(--dur-hover) var(--ease-quint)}
.issues-composer:focus-within,.issues-composer.is-drop{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}
.issues textarea{display:block;width:100%;resize:none;overflow:hidden;max-height:none;font:inherit;font-size:15px;line-height:1.65;color:var(--ink);background:transparent}
.issues-composer textarea{border:0!important;outline:0!important;box-shadow:none!important;border-radius:0;padding:0;min-height:69px}
.issues-bar{display:flex;align-items:center;gap:6px;margin-top:6px}
.issues-tip{flex:1;color:var(--muted);font-size:12px}
.issues-tip,.issues-toast>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.issues-tip.is-error{color:var(--red)}
.issues-shots{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.issues-shots:empty{display:none}
.issues-shots figure{position:relative;margin:0}
.issues-shots figure>button:first-child{display:block;padding:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface-soft);cursor:zoom-in}
.issues-shots img{display:block;width:64px;height:64px;object-fit:cover}
[data-issue-view-shots] img{width:auto;height:auto;max-width:100%;max-height:220px;object-fit:contain}
.issues-shots [data-remove]{position:absolute;top:-6px;right:-6px;width:22px;height:22px;min-height:0;padding:0;border-radius:50%;background:var(--action);color:var(--action-ink);font-size:13px;line-height:1}
.issues-head{display:flex;margin:20px auto 4px;padding:0 10px;font-size:12px;font-weight:var(--weight-control);color:var(--muted)}
.issues-list{list-style:none;padding:0;margin-block:0}
.issues-row{display:flex;gap:10px;align-items:flex-start;width:100%;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.issues-row:hover{background:var(--nav-hover)}.issues-row:focus-visible{outline:var(--focus-stroke);outline-offset:-2px}
.issues-row>span{flex:1;min-width:0}
.issues-row b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:var(--weight-control);overflow-wrap:anywhere}
.issues-row small,.issues-meta{display:block;color:var(--muted);font-size:12px;line-height:1.6;margin:2px 0 0}
.issues-row[data-state] b{font-weight:var(--weight-body);color:var(--ink-soft)}
.issues-row[data-state=attention] small{color:var(--amber)}
.issues-row>[data-mw-state]{flex:none;margin-top:4px}
.issues-empty{padding:28px 10px;color:var(--muted);font-size:13px;line-height:1.7;text-align:center}
.issues-more{display:flex;margin:8px auto}
.issues-detail{flex:1;min-height:0;display:flex;flex-direction:column}
.issues-detail-bar{display:flex;align-items:center;gap:4px;padding:8px 8px 0}.issues-detail-bar>span{flex:1}
.issues-detail-bar svg{width:16px;height:16px}
.issues h1{font-size:17px;line-height:1.45;font-weight:var(--weight-title);letter-spacing:-.01em;margin:6px auto 12px;overflow-wrap:anywhere}
.issues-prose{font-size:15px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
[data-issue-source]{margin-top:20px;padding-top:12px;border-top:1px solid var(--line)}
.issues-editor{display:grid;gap:12px}.issues-editor .mw-toggle-group{justify-self:start}
.issues-editor textarea{min-height:120px}
.issues-editor .issues-bar{position:sticky;bottom:-60px;padding:8px 0 60px;margin-bottom:-60px;background:var(--paper)}
.issues-flag{margin:0;padding:8px 10px;border-radius:8px;background:color-mix(in srgb,var(--amber) 12%,transparent);color:var(--ink);font-size:13px;line-height:1.6}
.issues-toast{position:absolute;inset-inline:0;margin-inline:auto;bottom:14px;z-index:5;max-width:calc(100% - 24px)}.issues-toast .mw-toast__action:empty{display:none}
dialog.issues-preview{width:calc(100vw - 32px);max-width:1440px;height:calc(100dvh - 32px);padding:0;overflow:hidden}
.issues-preview form{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr)}
.issues-preview header{display:flex;justify-content:flex-end;gap:8px;padding:10px}
.issues-preview-body{display:grid;grid-template:minmax(0,1fr)/minmax(0,1fr);min-height:0;padding:16px}
.issues-preview-view:not(.mw-media-zoom){overflow:auto;display:grid;place-items:safe center}
.issues-preview-view:not(.mw-media-zoom) img{max-width:100%;max-height:100%;object-fit:contain}.issues-preview[data-zoom] .issues-preview-view img{max-width:none;max-height:none}
@media(max-width:760px){.issues textarea{font-size:16px}}
`;
