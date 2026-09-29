import { PRIMITIVE_STYLES, renderShellTokens, TYPEFACE_STYLES } from "@molis-ai/molis-work-design-system";

/**
 * Onboarding: one horizontal window on a softly lit desk. The warm and cool light belongs here and nowhere
 * else in the product; everything inside the window uses the same tokens, type and controls as the
 * workbench it leads into. Choices are small white options that turn graphite with a check; the preview
 * beside them follows each choice at once; steps move sideways with the direction you are going.
 */
export const CONTEXT_ONBOARDING_STYLES = String.raw`
${PRIMITIVE_STYLES}
${TYPEFACE_STYLES}
:root{${renderShellTokens("light")}--ob-page:var(--desk);--ob-window:var(--paper);--ob-secondary:var(--surface-soft);--ob-ink:var(--ink);--ob-muted:var(--muted);--ob-outside:var(--muted);--ob-action:var(--action);--ob-on:var(--action-ink);--ob-line:var(--line);--ob-bar-idle:var(--line-strong);--ob-bar-done:color-mix(in srgb,var(--accent) 45%,var(--paper));--ob-bar-now:var(--accent);--ob-shadow:var(--shadow);--ob-lift:var(--shadow-soft);--ob-lift-hover:var(--shadow-raised);--ob-chosen:var(--shadow-soft);--ob-page-light:color-mix(in srgb,var(--line-strong) 32%,transparent);--ob-surface:var(--paper);--ob-warm:color-mix(in srgb,var(--accent) 26%,transparent);--ob-cool:color-mix(in srgb,var(--ink) 9%,transparent);--ob-light:.85;--ob-ease:cubic-bezier(.22,1,.36,1);--ob-spring:cubic-bezier(.2,1.35,.4,1)}
html[data-resolved-theme=dark]{${renderShellTokens("dark")}--ob-page:var(--desk);--ob-window:var(--paper);--ob-secondary:var(--surface-soft);--ob-ink:var(--ink);--ob-muted:var(--muted);--ob-outside:var(--muted);--ob-action:var(--action);--ob-on:var(--action-ink);--ob-line:var(--line);--ob-bar-idle:var(--line-strong);--ob-bar-done:color-mix(in srgb,var(--accent) 45%,var(--paper));--ob-bar-now:var(--accent);--ob-shadow:var(--shadow);--ob-lift:var(--shadow-soft);--ob-lift-hover:var(--shadow-raised);--ob-chosen:var(--shadow-soft);--ob-page-light:color-mix(in srgb,var(--ink) 8%,var(--desk));--ob-surface:var(--popover);--ob-light:.12}
*{box-sizing:border-box}
.icon-sprite{position:absolute;width:0;height:0;overflow:hidden;pointer-events:none}
body.cx-page{margin:0;min-height:100dvh;background:var(--ob-page);color:var(--ob-ink);font-family:var(--font);font-size:13px;line-height:1.6;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
button,input,select,textarea{font:inherit;color:inherit}button,a,input,select,textarea{-webkit-tap-highlight-color:transparent}button,a{touch-action:manipulation}button{cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}a{color:inherit;text-decoration:none}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}[hidden]{display:none!important}
.cx-icon,.ob-stage svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none}
.ob-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* Desk, the window and the words around it. */
.ob-stage{min-height:100dvh;display:flex;flex-direction:column;justify-content:center;padding:32px clamp(20px,5vw,72px);background:radial-gradient(ellipse at 20% 100%,var(--ob-page-light),transparent 65%)}
.ob-outside{width:min(1080px,100%);margin:0 auto 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;color:var(--ob-outside)}
.ob-brand{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;letter-spacing:-.01em;color:var(--ob-ink);opacity:.86}
.ob-brand svg{width:20px;height:20px;stroke-width:1.6}
.ob-outside-actions{display:flex;align-items:center;gap:16px}
.ob-link{display:inline-flex;align-items:center;gap:8px;padding:8px 0;border:0;background:transparent;color:var(--ob-outside);font-size:12px;font-weight:500;transition:color 130ms var(--ease-quint)}
.ob-link:hover{color:var(--ob-ink)}.ob-link svg{width:14px;height:14px}
.ob-outside-note{width:min(1080px,100%);margin:16px auto 0;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--ob-outside);font-size:12px}
.ob-outside-note svg{width:14px;height:14px}
.ob-window{--choice-surface:var(--ob-surface);isolation:isolate;position:relative;width:min(1080px,100%);height:clamp(560px,calc(100dvh - 150px),760px);margin:0 auto;border-radius:18px;background:var(--ob-window);box-shadow:var(--ob-shadow);overflow:hidden;display:flex;flex-direction:column;color:var(--ob-ink);transition:background-color 420ms var(--ease-quint),color 420ms var(--ease-quint)}
.ob-window::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(ellipse 65% 74% at 0% 4%,var(--ob-warm),transparent 100%),radial-gradient(ellipse 65% 78% at 100% 100%,var(--ob-cool),transparent 100%);opacity:var(--ob-light);transition:opacity 420ms var(--ease-quint)}
.ob-windowbar{flex:none;height:38px;display:grid;place-items:center;color:var(--ob-muted);font-size:11px;font-weight:500;letter-spacing:.01em}
#cx-app{flex:1;min-height:0;display:flex;flex-direction:column}

/* A step: the question with its choices, and the small preview those choices make. */
.ob-content{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.92fr);align-items:stretch;gap:48px;padding:12px 64px 8px}
.ob-question{min-width:0;min-height:0;display:flex;flex-direction:column;justify-content:safe center;overflow:auto;padding:12px 8px 24px 4px;scrollbar-width:thin;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 12px,#000 calc(100% - 22px),transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 12px,#000 calc(100% - 22px),transparent 100%)}
.ob-question h1{margin:0;font-size:30px;font-weight:600;letter-spacing:-.035em;line-height:1.25;outline:none;text-wrap:balance}
.ob-question>p{margin:12px 0 24px;max-width:40ch;color:var(--ob-muted);font-size:13px;line-height:1.8}
.ob-content.is-wide{display:block;overflow:auto;padding:16px 64px 12px;scrollbar-width:thin}
.ob-content.is-wide .ob-question{display:block;overflow:visible;padding:8px 4px 24px}
.ob-preview{position:relative;min-width:0;display:flex;align-items:center;justify-content:center;perspective:1000px}

/* Choices are the shared mw-choice (white options that turn graphite with a check), laid out in a row. */
.ob-options{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch}
.ob-label{margin:24px 0 12px;color:var(--ob-muted);font-size:12px;font-weight:500}

/* Sources: one quiet row each, a graphite box with a check when chosen, the scope folding out below. */
.ob-sources{display:grid;gap:8px}
.ob-sources-head{display:flex;align-items:center;justify-content:space-between;margin:0 4px 4px;color:var(--ob-muted);font-size:12px;font-weight:500}
.cx-select-all{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-weight:500}
.cx-check{appearance:none;-webkit-appearance:none;display:inline-grid;place-items:center;width:18px;height:18px;margin:0;flex:none;border:1.5px solid color-mix(in srgb,var(--ob-ink) 24%,transparent);border-radius:5px;background:var(--ob-surface);cursor:pointer;transition:background-color 130ms var(--ease-quint),border-color 130ms var(--ease-quint),transform 130ms var(--ob-spring)}
.cx-check:hover{border-color:color-mix(in srgb,var(--ob-ink) 42%,transparent)}
.cx-check:active{transform:scale(.88)}
.cx-check:checked,.cx-check:indeterminate{background:var(--ob-action);border-color:var(--ob-action)}
.cx-check:checked::after{content:"";width:9px;height:5px;margin-top:-4px;border:2px solid var(--ob-on);border-top:0;border-right:0;transform:rotate(-45deg)}
.cx-check:indeterminate::after{content:"";width:8px;height:2px;border-radius:1px;background:var(--ob-on)}
.cx-row{border-radius:11px;background:var(--ob-surface);box-shadow:var(--ob-lift);transition:box-shadow 250ms var(--ob-ease)}
.cx-row:hover{box-shadow:var(--ob-lift-hover)}
.cx-row.selected{box-shadow:0 0 0 1.5px var(--ob-action), var(--ob-lift-hover)}
.cx-row-main{display:flex;align-items:center;gap:12px;min-height:58px;padding:12px 12px 12px 16px}
.cx-source{display:flex;align-items:center;gap:12px;flex:1;min-width:0;cursor:pointer}
.cx-source>.cx-icon{width:20px;height:20px;color:var(--ink-soft)}
.cx-source>svg:not(.cx-icon),.cx-source>img{width:20px;height:20px;object-fit:contain;flex:none; stroke-width: 1.6; }
.cx-row .mw-choice__check{display:none}
.cx-source-copy{min-width:0;flex:1}
.cx-source-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;font-weight:500}
.cx-status{font-size:11px;font-weight:400;color:var(--ob-muted)}
.cx-status.ready{color:var(--green)}
.cx-source-copy small{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;margin-top:4px;color:var(--ob-muted);font-size:12px;line-height:1.5;overflow-wrap:anywhere}
.cx-row-action{width:32px;min-width:32px;padding:0!important}
.cx-row-action svg{transition:transform 250ms var(--ob-ease)}
.cx-row-action[aria-expanded=true] svg{transform:rotate(180deg)}
.cx-scope{padding:0 12px 12px 48px;animation:ob-reveal 420ms var(--ob-ease)}
.cx-scope>div{padding:16px;border-radius:9px;background:var(--ob-secondary)}
.cx-scope label{display:block;margin:0 0 8px;font-size:12px;font-weight:500}
.cx-scope p{margin:12px 0 0;color:var(--ob-muted);font-size:12px}
.cx-scope textarea{resize:vertical;min-height:120px}
.cx-scope select{margin:0 0 4px}
.cx-field+label{margin-top:12px}
.cx-file-list{max-height:110px;overflow:auto;margin-top:8px;color:var(--ob-muted);font-size:12px;white-space:pre-line}
.cx-recap{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin:16px 4px 4px;font-size:12px;font-weight:500}
.cx-model{color:var(--ob-muted);font-size:12px;font-weight:400;text-align:right}
.cx-model a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
.cx-preparation,.cx-footnote,.cx-hint,.cx-muted{margin:4px 4px 0;color:var(--ob-muted);font-size:12px;line-height:1.7}
.cx-footnote a{color:var(--accent)}
.cx-error{margin:0 0 12px;padding:12px 12px;border-radius:9px;background:var(--red-soft);color:var(--red);font-size:12px;line-height:1.6;overflow-wrap:anywhere}
.cx-error:empty{display:none}
.ob-notice{display:flex;align-items:center;gap:12px;margin:0 0 12px;padding:12px 12px 12px 12px;border-radius:10px;background:var(--ob-surface);box-shadow:var(--ob-lift);font-size:12px}
.ob-notice>span{flex:1;min-width:0;overflow-wrap:anywhere}.ob-notice>svg{width:16px;height:16px;color:var(--accent)}
.ob-field{max-width:340px}
.ob-field label{display:block;margin:0 0 8px;color:var(--ob-muted);font-size:12px;font-weight:500}
.ob-inline-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}

/* Fields and buttons, the same shapes as the workbench. */
.cx-field{display:block;width:100%;min-height:40px;padding:8px 12px;border:1px solid var(--ob-line);border-radius:8px;background:var(--ob-surface);color:var(--ob-ink);font-size:13px;box-shadow:var(--lift-1);transition:border-color 250ms var(--ease-quint),box-shadow 250ms var(--ob-ease)}
.cx-field:focus{outline:none;border-color:color-mix(in srgb,var(--accent) 55%,var(--ob-line));box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}
.cx-field::placeholder{color:var(--ob-muted);opacity:.8}
.cx-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:0 16px;border:0;border-radius:8px;background:color-mix(in srgb,var(--ob-ink) 6%,transparent);color:var(--ob-ink);font-size:13px;font-weight:500;white-space:nowrap;transition:background-color 130ms var(--ease-quint),color 130ms var(--ease-quint),box-shadow 250ms var(--ob-ease),transform 130ms var(--ob-spring)}
.cx-button:hover:not(:disabled){background:color-mix(in srgb,var(--ob-ink) 10%,transparent)}
.cx-button:active:not(:disabled){transform:scale(.97)}
.cx-button.primary{background:var(--ob-action);color:var(--ob-on);box-shadow:var(--lift-1)}
.cx-button.primary:hover:not(:disabled){background:color-mix(in srgb,var(--ob-action) 88%,var(--ob-on));box-shadow:var(--lift-1)}
.cx-button.primary:disabled{opacity:.42}
.cx-button.quiet{background:transparent;color:var(--ob-muted)}
.cx-button.quiet:hover:not(:disabled){background:color-mix(in srgb,var(--ob-ink) 6%,transparent);color:var(--ob-ink)}
.cx-button.small{min-height:32px;padding:0 12px;font-size:12px}
.cx-button svg{width:16px;height:16px}
.cx-button kbd,.ob-continue kbd{margin-left:4px;font:inherit;font-size:15px;line-height:1;opacity:.6}
.ob-back{padding:8px 4px;border:0;background:transparent;color:var(--ob-muted);font-size:13px;font-weight:500;transition:color 130ms var(--ease-quint)}
.ob-back:hover{color:var(--ob-ink)}

/* Footer: short-line progress on the left, the way on at the right. */
.ob-footer{flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 64px 32px}
.ob-progress{display:flex;align-items:center;gap:4px;margin:0;padding:0;list-style:none}
.ob-progress li{display:flex;align-items:center;padding:12px 4px}
.ob-progress li>span{display:block;width:15px;height:3px;border-radius:3px;background:var(--ob-bar-idle);transition:background-color 420ms var(--ease-quint)}
.ob-progress li.complete>span{background:var(--ob-bar-done)}
.ob-progress li[aria-current=step]>span{width:24px;background:var(--ob-bar-now)}
.ob-footer-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:12px 16px;min-width:0}
.ob-footer-note{color:var(--ob-muted);font-size:12px}

/* Previews: a greeting, a miniature workbench, and the project your sources are gathering into. */
.ob-greeting{text-align:center;min-width:280px}
.ob-greeting strong{display:block;font-size:72px;font-weight:500;letter-spacing:-.035em;line-height:1.3;animation:ob-greeting 640ms var(--ob-ease)}
.ob-greeting strong[lang=zh]{font-size:66px}
.ob-greeting span{display:block;margin-top:16px;color:var(--ob-muted);font-size:12px;letter-spacing:.03em}
.ob-mini{width:min(340px,100%);padding:12px 12px 0;border-radius:14px;background:var(--page);box-shadow:var(--lift-1);animation:ob-preview 640ms var(--ob-ease);transition:background-color 420ms var(--ease-quint)}
.ob-mini-surface{padding:16px 16px 4px;border-radius:10px;background:var(--paper);box-shadow:var(--surface-shadow);transition:background-color 420ms var(--ease-quint)}
.ob-mini-title{display:block;width:74px;height:7px;margin-bottom:12px;border-radius:4px;background:var(--ink);opacity:.72}
.ob-mini-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);transition:border-color 420ms var(--ease-quint)}
.ob-mini-row:last-child{border-bottom:0}
html[data-density=compact] .ob-mini-row{padding:8px 0}
.ob-mini-row i{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--rail);color:var(--ink-soft)}
.ob-mini-row i svg{width:12px;height:12px}
.ob-mini-row span{flex:1;display:grid;gap:4px}
.ob-mini-row b{display:block;height:6px;border-radius:3px;background:var(--ink);opacity:.5}
.ob-mini-row s{display:block;height:4px;border-radius:2px;background:var(--line-strong)}
.ob-mini-bar{display:flex;align-items:center;gap:12px;padding:12px 4px 12px}
.ob-mini-dock{display:flex;gap:4px}
.ob-mini-dock i{width:15px;height:15px;border-radius:5px;background:var(--nav-hover)}
.ob-mini-dock i.is-on{background:var(--paper);box-shadow:var(--shadow-soft)}
.ob-mini-composer{flex:1;display:flex;align-items:center;justify-content:space-between;height:24px;padding:0 4px 0 8px;border-radius:8px;background:var(--paper);box-shadow:var(--shadow-soft)}
.ob-mini-composer i{width:44px;height:4px;border-radius:2px;background:var(--line-strong)}
.ob-mini-composer em{width:14px;height:14px;border-radius:5px;background:var(--action)}
.ob-mini-avatar{width:16px;height:16px;border-radius:50%;background:color-mix(in srgb,var(--accent) 70%,var(--paper))}
.ob-scene{position:relative;width:340px;height:330px;animation:ob-preview 640ms var(--ob-ease)}
.ob-docs{position:absolute;inset:0 0 auto 0;height:210px}
.ob-docs:empty::before{content:"";position:absolute;left:50%;top:48px;width:176px;height:62px;margin-left:-88px;border-radius:11px;border:1.5px dashed color-mix(in srgb,var(--ob-ink) 16%,transparent)}
.ob-doc{--i:0;position:absolute;left:50%;top:22px;display:flex;align-items:center;gap:12px;width:184px;margin-left:-92px;padding:12px 12px;border-radius:11px;background:var(--ob-surface);box-shadow:var(--lift-1);transform:translate(calc(var(--i) * 12px - 18px),calc(var(--i) * 40px)) rotate(calc(var(--i) * 1.6deg - 2.4deg));transition:transform 420ms var(--ob-ease)}
.ob-doc svg{width:20px;height:20px;color:var(--ink-soft); stroke-width: 1.6; }
.ob-doc>span{display:grid;min-width:0}
.ob-doc b{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ob-doc small{color:var(--ob-muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ob-doc[data-state=done] small,.ob-doc[data-state=ready] small{color:var(--green)}
.ob-doc[data-state=failed] small{color:var(--red)}
.ob-doc--more{justify-content:center;width:64px;margin-left:-32px;color:var(--ob-muted);font-size:12px;font-weight:500}
.ob-doc.is-new{animation:ob-doc 420ms var(--ob-ease) both}
.ob-folder{position:absolute;left:34px;right:30px;bottom:14px;z-index:3;padding:24px 24px 24px;border-radius:13px;background:var(--ob-surface);box-shadow:var(--lift-1)}
.ob-folder>svg{width:30px;height:30px;margin-bottom:12px;color:color-mix(in srgb,var(--accent) 55%,var(--paper));stroke-width:1.6}
.ob-folder strong{display:block;overflow:hidden;font-size:15px;font-weight:600;letter-spacing:-.015em;text-overflow:ellipsis;white-space:nowrap}
.ob-folder small{display:block;margin-top:4px;color:var(--ob-muted);font-size:12px}
.ob-mark{position:relative;display:inline-grid;place-items:center;width:54px;height:54px;margin-bottom:24px;border-radius:15px;background:var(--ob-surface);box-shadow:var(--lift-1);color:var(--ob-bar-now)}
.ob-mark>svg{width:20px;height:20px; stroke-width: 1.6; }
.ob-mark>b{position:absolute;right:-7px;bottom:-5px;display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:var(--green);color:var(--paper);animation:ob-complete 420ms var(--ob-spring)}
.ob-mark>b svg{width:14px;height:14px;stroke-width:2}

/* Reading and review. */
.cx-progress{height:3px;margin:4px 0 16px;border-radius:3px;background:var(--ob-line);overflow:hidden}
.cx-progress span{display:block;height:100%;background:var(--accent);transform-origin:left;transition:transform 420ms var(--ob-ease)}
.ob-receipts{display:grid;gap:8px}
.cx-receipt{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:11px;background:var(--ob-surface);box-shadow:var(--ob-lift)}
.cx-receipt>svg{width:20px;height:20px;color:var(--ink-soft); stroke-width: 1.6; }
.cx-receipt>div{flex:1;min-width:0;font-size:13px;font-weight:500}
.cx-receipt small{display:block;color:var(--ob-muted);font-size:12px;font-weight:400;overflow-wrap:anywhere}
.cx-receipt>span{color:var(--ob-muted);font-size:11px;font-weight:500}
.cx-receipt[data-state=done]>span{color:var(--green)}.cx-receipt[data-state=failed]>span{color:var(--red)}
.cx-issues{margin:12px 4px;color:var(--ob-muted);font-size:12px;overflow-wrap:anywhere}
.cx-issues summary{cursor:pointer;color:var(--ob-ink);font-weight:500}
.ob-review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
.ob-review-head h1{margin:0}
.cx-subtitle{margin:8px 0 0;color:var(--ob-muted);font-size:13px}
.cx-review-grid{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:24px;align-items:start}
.cx-document{padding:24px 24px;border-radius:13px;background:var(--ob-surface);box-shadow:var(--ob-lift)}
.cx-document>label{display:block;margin-bottom:8px;color:var(--ob-muted);font-size:12px;font-weight:500}
.cx-title-input{margin-bottom:16px;font-size:20px;font-weight:500}
.cx-document .cx-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
.cx-document .cx-status{font-size:12px;font-weight:500;color:var(--ob-muted)}
.cx-summary{font-size:13px;line-height:1.9;overflow-wrap:anywhere}
.cx-summary p{margin:12px 0 16px;white-space:pre-wrap}
.cx-summary h3{margin:24px 0 8px;font-size:15px;font-weight:600}
.cx-citation{padding:0 4px;border:0;border-radius:4px;background:var(--accent-soft);color:var(--accent);font:inherit;font-size:.9em;cursor:pointer}
.cx-summary-editor{min-height:300px;resize:vertical;line-height:1.85}
.cx-sources h2{margin:4px 0 12px;font-size:12px;font-weight:600;color:var(--ob-muted)}
.cx-reference{display:block;width:100%;padding:12px 0;border:0;border-bottom:1px solid var(--ob-line);background:transparent;color:var(--ob-ink);font-size:12px;text-align:left;overflow-wrap:anywhere;transition:color 130ms var(--ease-quint)}
.cx-reference:hover{color:var(--accent)}
.cx-reference span{display:block;color:var(--accent);font-size:11px;font-weight:500}
.cx-source-meta{color:var(--ob-muted);font-size:12px}
.cx-preview{display:grid;gap:12px}
.cx-preview-source{padding:16px 16px;border-radius:12px;background:var(--ob-surface);box-shadow:var(--ob-lift)}
.cx-preview-heading{display:flex;align-items:center;gap:12px}
.cx-preview-heading>svg{width:20px;height:20px;color:var(--ink-soft); stroke-width: 1.6; }
.cx-preview-heading>div{flex:1;min-width:0}
.cx-preview-heading h3{margin:0;font-size:15px;font-weight:500}
.cx-preview-heading small{display:block;color:var(--ob-muted);font-size:12px;overflow-wrap:anywhere}
.cx-range{width:136px;min-height:34px;padding:4px 8px;font-size:12px;flex:none}
.cx-missing{margin-top:12px;padding:12px 16px;border-radius:9px;background:var(--ob-secondary)}
.cx-missing p{margin:0 0 12px;color:var(--ob-muted);font-size:12px}
.cx-missing .cx-actions,.cx-scope .cx-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.cx-file-tools{display:flex;align-items:center;gap:4px;margin-top:12px;color:var(--ob-muted);font-size:12px}
.cx-file-tools>span{margin-right:auto}
.cx-metadata-list{max-height:240px;overflow:auto;margin-top:4px;scrollbar-width:thin}
.cx-file-row{display:flex;align-items:flex-start;gap:12px;min-height:40px;padding:8px 0;border-top:1px solid var(--ob-line);cursor:pointer}
.cx-file-row>span{flex:1;min-width:0;font-size:12px;overflow-wrap:anywhere}
.cx-file-row small{padding-top:4px;color:var(--ob-muted);font-size:11px;white-space:nowrap}
.cx-folder-toggle{display:flex;align-items:center;gap:8px;padding:8px 0;font-size:12px;cursor:pointer}
.cx-folder-toggle>span{margin-left:auto;color:var(--ob-muted);font-size:11px}
.cx-dialog{width:min(600px,calc(100vw - 32px));max-height:85dvh;overflow:auto;padding:24px;border:0;border-radius:16px;background:var(--ob-window);color:var(--ob-ink);box-shadow:var(--ob-shadow)}
.cx-dialog[open]{animation:ob-dialog 250ms var(--ob-ease)}
.cx-dialog::backdrop{background:var(--scrim)}
.cx-dialog h2{margin:0 0 16px;font-size:20px;font-weight:600;letter-spacing:-.02em}
.cx-dialog .cx-actions{display:flex;justify-content:flex-end;margin-top:24px}
.cx-source-body{font-size:13px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere}

.ob-update-list{display:grid;gap:16px;margin:4px 0 0;padding:0;list-style:none}
.ob-update-list li{display:grid;gap:4px}
.ob-update-list strong{font-size:15px;font-weight:500}
.ob-update-list span{color:var(--ob-muted);font-size:13px;line-height:1.7}
@keyframes ob-greeting{from{opacity:0;transform:translateY(20px);filter:blur(6px)}to{opacity:1;transform:none;filter:blur(0)}}
@keyframes ob-preview{from{opacity:.3;transform:translateY(13px) scale(.96)}to{opacity:1;transform:none}}
@keyframes ob-doc{from{opacity:0;translate:0 38px}to{opacity:1;translate:0 0}}
@keyframes ob-complete{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
@keyframes ob-reveal{from{opacity:.4;transform:translateY(-5px)}to{opacity:1;transform:none}}
@keyframes ob-dialog{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}

@media (max-width:1100px){.ob-content{gap:32px;padding:12px 48px 8px}.ob-content.is-wide{padding:12px 48px}.ob-footer{padding:12px 48px 24px}.ob-scene,.ob-mini{transform:scale(.92)}}
@media (max-height:760px) and (min-width:861px){.ob-stage{padding:16px clamp(20px,4vw,56px)}.ob-outside{margin-bottom:12px}.ob-window{height:calc(100dvh - 92px);min-height:500px}.ob-outside-note{margin-top:12px}.ob-question h1{font-size:30px}.ob-footer{padding-bottom:24px}}
@media (max-width:860px){
  .ob-window{height:auto;min-height:calc(100dvh - 120px)}
  .ob-content{grid-template-columns:minmax(0,1fr);gap:0;padding:4px 32px 8px}
  .ob-preview{order:-1;height:210px}
  .ob-scene,.ob-mini{transform:scale(.72)}
  .ob-greeting strong{font-size:54px}
  .ob-question{overflow:visible;justify-content:flex-start}
  .ob-content.is-wide{padding:8px 32px}
  .ob-footer{position:sticky;bottom:0;padding:12px 32px 24px;background:color-mix(in srgb,var(--ob-window) 92%,transparent);backdrop-filter:blur(8px)}
  .cx-review-grid{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:600px){
  .ob-stage{padding:12px 12px 12px;justify-content:flex-start}
  .ob-outside{margin:4px 4px 12px}.ob-link span{display:none}
  .ob-window{border-radius:16px;min-height:calc(100dvh - 86px)}
  .ob-windowbar{height:30px}
  .ob-content,.ob-content.is-wide{padding:0 16px 8px}
  .ob-preview{height:170px}.ob-scene,.ob-mini{transform:scale(.6)}.ob-greeting strong{font-size:44px}
  .ob-question h1{font-size:24px}.ob-question>p{margin-bottom:16px}
  .ob-options .mw-choice{min-width:0;flex:1 1 128px}
  .ob-footer{flex-wrap:wrap;padding:12px 16px 16px}
  .ob-footer-actions{flex:1;gap:12px}
  .cx-scope{padding-left:16px}
  .cx-field{font-size:13px}
  .ob-review-head{flex-direction:column}
  .ob-outside-note{margin-top:12px;font-size:11px}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;
