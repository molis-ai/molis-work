/**
 * The install sheet on a plugin page (src/browser/plugin-frame/package-install.ts; specs/plugin-builder-upgrade/spec.md §7.0; design in
 * docs/design/studio-package-install): a platform area (`mw-platform-area`, styles/platform-area.ts) whose height is the shell's. Four
 * parts of the component board are new here: the sheet (`install-sheet`: the band that says who draws it, the head, the two lists, the
 * foot, a result in the sheet's own place), the permission tile (`install-tile`: a tinted mark, a name, one line; a required one has a
 * lock, an optional one presses as a whole and ends in the board's switch), the chip (`install-chip`) and the three steps
 * (`install-steps`). Every part has a fixed height, so the height the shell counts (`packageInstallHeight`) is the height drawn: the
 * sheet stands in one screen and only a package asking for more than the cap makes the middle scroll. Every line is one line, cut short.
 * From 640px the two lists stand side by side; under 480px (the area's narrow step) the foot stacks, its buttons are 44px targets and an
 * upgrade's three chips take two lines. The sheet's outline is drawn over its parts (`::after`), so the band and the foot do not hide it.
 */
export const PACKAGE_INSTALL_AREA_STYLES = `
.install-sheet{position:relative;gap:0;padding:0;border-radius:16px;background:var(--paper);box-shadow:none}
.install-sheet::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px var(--line-strong);pointer-events:none}
.install-sheet__band{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;height:32px;padding:0 16px;background:var(--accent-soft);color:var(--accent-strong);font-size:12px;white-space:nowrap}
.install-sheet__by{display:inline-flex;align-items:center;gap:6px;flex:none}.install-sheet__by svg{width:14px;height:14px}.install-sheet__by strong{font-weight:var(--weight-strong,600)}
.install-sheet__guard{min-width:0;overflow:hidden;text-overflow:ellipsis;opacity:.8}
.install-sheet__main{min-height:0;overflow:auto;overscroll-behavior:contain}
.install-sheet__head{display:flex;align-items:center;gap:12px;box-sizing:border-box;height:76px;padding:14px 20px 12px}
.install-sheet__app{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--accent-soft);color:var(--accent-strong);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 18%,transparent)}
.install-sheet__app svg{width:22px;height:22px}
.install-sheet__id{flex:1;min-width:0;display:grid;gap:6px}
.install-sheet__name{display:flex;align-items:center;gap:8px;min-width:0;height:22px}
.install-sheet__name strong{min-width:0;overflow:hidden;font-size:17px;line-height:22px;font-weight:var(--weight-strong,600);text-overflow:ellipsis;white-space:nowrap}
.install-sheet__ver{flex:none;display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;background:var(--rail);color:var(--muted);font-size:11px;font-weight:var(--weight-strong,600);font-variant-numeric:tabular-nums}
.install-sheet__ver[data-new]{background:var(--action);color:var(--action-ink)}
.install-sheet__arrow{flex:none;display:inline-grid;color:var(--muted)}.install-sheet__arrow svg{width:12px;height:12px}
.install-sheet__chips{display:flex;gap:6px;min-width:0;height:22px;overflow:hidden}
.install-sheet__chips[data-center]{flex:none;flex-wrap:wrap;justify-content:center;max-width:100%}
.install-chip{display:inline-flex;align-items:center;gap:5px;min-width:0;height:22px;padding:0 8px 0 6px;border-radius:999px;background:var(--rail);color:var(--ink-soft);font-size:12px;white-space:nowrap}
.install-chip svg{flex:none;width:12px;height:12px}.install-chip>span{overflow:hidden;text-overflow:ellipsis}
.install-chip[data-tone=green]{background:var(--green-soft);color:var(--green)}.install-chip[data-tone=amber]{background:var(--amber-soft);color:var(--amber)}
.install-sheet__news{display:flex;align-items:center;gap:8px;height:32px;margin:0 20px 12px;padding:0 12px;border-radius:10px;background:color-mix(in srgb,var(--accent-soft) 60%,transparent);white-space:nowrap;overflow:hidden}
.install-sheet__news svg{flex:none;width:14px;height:14px;color:var(--accent-strong)}.install-sheet__news span{overflow:hidden;text-overflow:ellipsis}
.install-sheet__grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;padding:4px 20px 16px}
@container (min-width:640px){.install-sheet__grid:not([data-single]){grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.install-sheet__grid section{display:grid;align-content:start;gap:8px;min-width:0}
.install-sheet :is(.install-sheet__grid,.install-sheet__keys) h4{display:flex;align-items:baseline;gap:8px;height:18px;margin:0;color:var(--ink-soft);font-size:12px;line-height:18px;font-weight:var(--weight-strong,600);white-space:nowrap}
.install-sheet h4 span{min-width:0;overflow:hidden;color:var(--muted);font-weight:400;text-overflow:ellipsis}
.install-sheet__tiles{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.install-tile{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;column-gap:10px;box-sizing:border-box;height:52px;padding:0 12px 0 10px;border-radius:12px;background:var(--rail);box-shadow:inset 0 0 0 1px transparent;transition:background var(--dur-hover,130ms) var(--ease-quint),box-shadow var(--dur-hover,130ms) var(--ease-quint)}
.install-tile__copy{display:grid;gap:1px;min-width:0}
.install-tile__copy strong{display:flex;align-items:center;gap:6px;min-width:0;font-size:13px;line-height:18px;font-weight:var(--weight-control,560)}
.install-tile__copy strong>span,.install-tile__copy>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.install-tile__copy>span{color:var(--muted);font-size:12px;line-height:16px}
.install-tile[data-pick]{cursor:pointer;background:var(--paper);box-shadow:inset 0 0 0 1px var(--line-strong)}
.install-tile[data-pick]:hover{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 45%,var(--line-strong))}
.install-tile[data-on=true]{background:color-mix(in srgb,var(--accent-soft) 55%,var(--paper));box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--accent) 55%,transparent)}
.install-tile[data-on=true] .install-tile__copy>span{color:var(--ink-soft)}
.install-tile[data-pick]:has(input:focus-visible),li.install-tile:focus-visible{outline:var(--focus-stroke);outline-offset:2px}
.install-tile[data-pick]:has(input:disabled){cursor:default;opacity:.6}
.install-tile__lock{display:inline-grid;color:var(--muted)}.install-tile__lock svg{width:14px;height:14px}
.install-tile__mark{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:var(--paper);color:var(--ink-soft);box-shadow:inset 0 0 0 1px var(--line)}
.install-tile__mark svg{width:16px;height:16px}
.install-tile__mark:not([data-tint=plain]){box-shadow:none}
.install-tile__mark[data-tint=blue]{background:var(--blue-soft);color:var(--blue)}.install-tile__mark[data-tint=green]{background:var(--green-soft);color:var(--green)}
.install-tile :is(.install-tile__mark,.install-tile__tag)[data-tint=amber]{background:var(--amber-soft);color:var(--amber)}
.install-tile :is(.install-tile__mark,.install-tile__tag)[data-tint=accent]{background:var(--accent-soft);color:var(--accent-strong)}
.install-tile__tag{flex:none;height:16px;padding:0 6px;border-radius:999px;font-style:normal;font-size:11px;line-height:16px;font-weight:var(--weight-strong,600)}
.install-sheet__strip{display:flex;align-items:center;gap:8px;height:28px;margin:0;padding:0 4px;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden}
.install-sheet__strip svg{flex:none;width:14px;height:14px}.install-sheet__strip span{overflow:hidden;text-overflow:ellipsis}
.install-sheet__foot{display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;min-width:0;height:60px;padding:0 20px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--rail) 45%,var(--paper))}
.install-sheet__sum{min-width:0;overflow:hidden;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}
.install-sheet__sum.is-note{color:var(--ink)}
.install-sheet__acts{display:flex;flex:none;gap:8px}
.install-sheet .mw-btn{flex:none;height:36px;min-height:0;margin-block:0}
.install-steps{display:flex;align-items:center;max-width:100%;margin:0 auto;padding:0;overflow:hidden;list-style:none}
.install-steps li{display:inline-flex;align-items:center;gap:6px;min-width:0;color:var(--muted);font-size:12px;font-weight:var(--weight-control,560);transition:color var(--dur-move) var(--ease-quint)}
.install-steps li>span{white-space:nowrap}
.install-steps li+li::before{content:"";flex:none;width:28px;height:1px;margin:0 10px;background:var(--line-strong)}
.install-steps li:is([data-state=doing],[data-state=done]){color:var(--ink)}.install-steps li[data-state=failed]{color:var(--red)}
.install-steps .mw-state-ring{flex:none;margin:0}
.install-sheet__result{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:0;padding:16px 24px 20px;overflow:hidden;text-align:center}
.install-sheet__result:focus,.install-sheet__keys:focus{outline:none}
.install-sheet__ring{flex:none;display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:var(--rail)}
.install-sheet__ring .mw-state-ring{margin:0}.install-sheet__ring>svg:not(.mw-state-ring){width:26px;height:26px;color:var(--amber)}
.install-sheet__result[data-tone=ok] .install-sheet__ring{background:var(--green-soft)}.install-sheet__result[data-tone=bad] .install-sheet__ring{background:var(--red-soft)}.install-sheet__result[data-tone=warn] .install-sheet__ring{background:var(--amber-soft)}
.install-sheet__result h3{margin:0;font-size:17px;line-height:24px;font-weight:var(--weight-strong,600)}
.install-sheet__result p{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;max-width:440px;margin:0;overflow:hidden;color:var(--ink-soft);line-height:20px;overflow-wrap:anywhere;text-wrap:pretty}
.install-sheet__result p.install-sheet__note{color:var(--ink);font-size:12px}.install-sheet__note:empty{display:none}
.install-sheet__result .install-sheet__acts{flex-wrap:wrap;justify-content:center;margin-top:8px}
.install-sheet__keys{display:flex;flex-direction:column;gap:10px;padding:4px 20px 16px}
.install-key{display:grid;gap:8px}
.install-key__fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,184px);gap:12px}
.install-key .mw-field{display:grid;gap:4px;min-width:0;margin:0}.install-key .mw-field__label{font-size:12px;line-height:18px}.install-key .mw-input{box-sizing:border-box;height:36px;min-height:0}
.install-sheet[data-stage=line]{grid-template-rows:1fr;padding:0 14px;animation:none}
.install-sheet__line{display:flex;align-items:center;min-width:0}
.install-sheet__line p{flex:1;min-width:0;margin:0;overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.install-sheet__line p:focus{outline:none}
@container (max-width:479.98px){
.install-sheet__guard{display:none}
.install-sheet__head{gap:10px;height:70px;padding:12px 12px 8px}.install-sheet__head[data-chips="3"]{align-items:flex-start;height:98px}.install-sheet__head[data-chips="3"] .install-sheet__chips{flex-wrap:wrap;height:50px}
.install-sheet__app{width:36px;height:36px;border-radius:10px}.install-sheet__app svg{width:18px;height:18px}
.install-sheet__news{margin:0 12px 8px}
.install-sheet__grid{gap:10px;padding:4px 12px 8px}.install-sheet__grid section,.install-sheet__tiles{gap:6px}
.install-tile{height:48px}.install-sheet__strip{height:22px}
.install-sheet__foot{flex-direction:column;align-items:stretch;justify-content:center;gap:6px;height:96px;padding:0 12px}
.install-sheet__sum{text-align:center}
.install-sheet__foot .install-sheet__acts{display:grid;grid-template-columns:auto minmax(0,1fr)}
.install-sheet .mw-btn{height:44px}
.install-steps li{gap:4px}
.install-steps li+li::before{width:8px;margin:0 2px}
.install-sheet__keys{padding:4px 12px 8px}.install-key__fields{grid-template-columns:minmax(0,1fr);gap:8px}
.install-sheet__result{padding:12px 16px 16px}
}
@media (prefers-reduced-motion:reduce){.install-tile,.install-steps li{transition:none}}
`;
