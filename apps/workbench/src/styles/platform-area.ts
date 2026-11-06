import { ITEM_ROW_STYLES } from "@molis-ai/molis-work-design-system";

/**
 * The platform's area on a plugin page (src/browser/plugin-frame/framed-area.ts; specs/proactive-assistant/task-grants-platform-area.md
 * §3): a quiet card on its own ground with the platform's header, so it reads apart from the page's own content. Its height is the
 * shell's (two steps by width), so the parts are fixed: header and foot hold their place and only the middle scrolls. The narrow
 * step (under 480px, a container query on the area itself) lets the lead and the change line take two lines. The area's own parts
 * are generic (`mw-platform-area__*`); what the reads area adds is `task-grants-area__*`. Controls not ready yet (§3.3, carrying
 * `aria-disabled` from the shell) are faded. The change line stays put (D2), so it is a quiet line in the area's own ground, not the
 * graphite toast that comes and goes; only a failure takes colour.
 */
export const PLATFORM_AREA_STYLES = `${ITEM_ROW_STYLES}
@keyframes mw-platform-area-in{from{opacity:0;transform:translateY(4px)}}
.mw-platform-area{container-type:inline-size;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:10px;padding:12px 14px 12px;border-radius:var(--r-card);background:var(--surface-soft);box-shadow:inset 0 0 0 1px var(--line),var(--lift-1);color:var(--ink);font-size:13px;overflow:hidden;animation:mw-platform-area-in var(--dur-move) var(--ease-quint) both}
.mw-platform-area__head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;min-width:0}
.mw-platform-area__kicker{display:inline-flex;align-items:center;gap:6px;flex:none;height:22px;padding:0 8px 0 6px;border-radius:var(--r-tag);background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:var(--weight-control,560);white-space:nowrap}
.mw-platform-area__kicker svg{width:13px;height:13px;flex:none}
.mw-platform-area__owner{flex:1 1 0;min-width:0;overflow:hidden;color:var(--muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.mw-platform-area__lead{flex:1 0 100%;margin:0;overflow:hidden;color:var(--muted);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}
.mw-platform-area__body{min-height:0;overflow:auto;overscroll-behavior:contain;border-radius:var(--sk-r-card,12px)}
.mw-platform-area__body[aria-busy]{cursor:progress}
.mw-platform-area__body[aria-busy] :is(.mw-switch,.mw-btn){opacity:.6;transition:opacity var(--dur-hover,130ms) var(--ease-quint)}
.mw-platform-area__foot{display:flex;height:48px;min-width:0}
.mw-platform-area__foot .mw-toast{flex-wrap:nowrap;width:100%;max-width:100%;padding:0 6px 0 12px;border-radius:var(--sk-r-card,12px);background:var(--paper);color:var(--ink-soft);box-shadow:inset 0 0 0 1px var(--line)}
.mw-platform-area__foot .mw-toast.is-error{background:color-mix(in srgb,var(--red) 8%,var(--paper));color:color-mix(in srgb,var(--red) 78%,var(--ink));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--red) 28%,var(--line))}
.mw-platform-area__foot .mw-toast__action{margin-block:0;color:var(--accent)}
.mw-platform-area__foot .mw-toast:not(.is-fresh){animation:none}
.mw-platform-area__foot .mw-toast>span{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mw-platform-area__foot .mw-toast__action{flex:none}
@container (max-width:479.98px){.mw-platform-area__lead{white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}.mw-platform-area__foot{height:76px}.mw-platform-area__foot .mw-toast{flex-wrap:wrap;align-content:center}.mw-platform-area__foot .mw-toast>span{flex-basis:100%;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}}
.mw-platform-area [data-framed-control]{transition:opacity var(--dur-hover,130ms) var(--ease-quint)}
.mw-platform-area :is(.mw-btn,.mw-toast__action)[aria-disabled="true"],.mw-platform-area .mw-switch:has(>[aria-disabled="true"]){opacity:.45}
.task-grants-area__rows{width:100%;background:var(--paper)}
.task-grants-area__row>span:first-child{display:grid;gap:1px;flex:1 1 0;min-width:0}
.task-grants-area__row>span.mw-item__end{flex:none;justify-content:flex-end}
.task-grants-area__row[data-status="off"] strong{color:var(--ink-soft)}
.task-grants-area__note{font-style:normal;font-size:12px;line-height:18px;color:var(--muted)}
.task-grants-area__row[data-status="needs_confirmation"] .task-grants-area__note{color:color-mix(in srgb,var(--amber) 72%,var(--ink))}
.task-grants-area__row .mw-item__end{gap:10px}
@container (max-width:479.98px){.task-grants-area__row small{white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}}
.task-grants-area__empty{margin:0;padding:14px 12px;border-radius:var(--sk-r-card,12px);background:var(--paper);box-shadow:inset 0 0 0 1px var(--line);color:var(--muted);font-size:12px;line-height:1.6}
@media (prefers-reduced-motion:reduce){.mw-platform-area{animation:none}}
`;
