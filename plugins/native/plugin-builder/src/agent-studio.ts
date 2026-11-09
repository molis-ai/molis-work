import { PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-design-system";
/** A CSS string literal for a custom property: whatever could end the string or the attribute is written as a hex escape. */
const cssString = (value: string) => "'" + value.replace(/[\\'"<>&\n]/g, character => '\\' + character.codePointAt(0)!.toString(16) + ' ') + "'";

/**
 * The agent-built plugin studio: left, the conversation and the real collaboration record; right, the plugin
 * itself, rendered by the host component renderer from the frozen component tree. Everything shown is derived
 * from the build record the host pushes; nothing here advances a build or fakes progress.
 *
 * Every word the studio itself writes goes through `text` (the host's translator; without one the Chinese text is
 * shown); its English is the workbench catalog's `STUDIO_EN` (apps/workbench/src/i18n/studio-en.ts). The two badges the stylesheet draws on a part ("not connected yet",
 * "connected") are CSS content, which cannot call a translator, so the stage carries them as custom properties.
 */
export function renderAgentStudio(text: (zh: string, values?: Record<string, string | number>) => string = zh => zh): string {
  const mine = text("plugin-builder.agent-studio.my-plugins"), newPlugin = text("plugin-builder.agent-studio.new-plugin"), edit = text("plugin-builder.agent-studio.apply-changes"), send = text("plugin-builder.agent-studio.send"), codeAgent = text("plugin-builder.agent-studio.code-agent");
  return '<section class="as-shell" data-agent-studio style="--as-idle:' + cssString(text("plugin-builder.agent-studio.not-connected-yet")) + ';--as-wired:' + cssString('✓ ' + text("plugin-builder.agent-studio.connected")) + '">'
    + '<header class="as-top"><div class="as-top-actions"><label class="as-select"><span class="as-sr">' + mine + '</span><select data-as-builds aria-label="' + mine + '"></select></label>'
    + '<button class="as-icon" type="button" data-as-new aria-label="' + newPlugin + '" title="' + newPlugin + '"><svg aria-hidden="true"><use href="#icon-plus"/></svg></button>'
    + '<label class="as-select as-model"><span>' + text("plugin-builder.agent-studio.model") + '</span><select data-as-model aria-label="' + text("plugin-builder.agent-studio.model-used-building") + '"></select></label>'
    + '<a class="as-model-setup" data-as-model-setup href="/settings/models" hidden>' + text("plugin-builder.agent-studio.open-model-settings") + '</a></div></header>'
    + '<aside class="as-left" aria-label="' + text("plugin-builder.agent-studio.collaboration") + '"><div class="as-feed" data-as-feed aria-live="polite"></div>'
    + '<label class="as-select" data-as-edit-label hidden><span>' + edit + '</span><select data-as-edit-mode aria-label="' + edit + '"><option value="message">' + text("plugin-builder.agent-studio.features-interface") + '</option><option value="visual">' + text("plugin-builder.agent-studio.interface-only") + '</option></select></label>'
    + '<form class="as-composer" data-as-composer><div class="as-target" data-as-target hidden></div><textarea data-as-input data-fit rows="2" maxlength="48000" aria-label="' + text("plugin-builder.agent-studio.describe-change") + '"></textarea>'
    + '<button class="as-send" type="submit" aria-label="' + send + '" title="' + send + '"><svg aria-hidden="true"><use href="#icon-send"/></svg></button></form>'
    + '<p class="as-model-note" data-as-model-note></p>'
    // The build check's packaging step downloads the dependencies a generated plugin declares from the npm registry (W2-18 decision 14).
    + '<p class="as-model-note" data-as-network-note>' + text("plugin-builder.agent-studio.build-check-s-packaging-step-when-plugin-declares") + '</p></aside>'
    + '<main class="as-right"><header class="as-canvas-head"><div class="as-title"><h1 data-as-title>' + text("plugin-builder.agent-studio.new-plugin-2") + '</h1><span class="as-phase" data-as-phase></span></div>'
    + '<div class="as-segment" role="tablist" aria-label="' + text("plugin-builder.agent-studio.canvas-mode") + '"><button type="button" role="tab" data-as-tab="build" aria-selected="true">' + text("plugin-builder.agent-studio.build") + '</button><button type="button" role="tab" data-as-tab="try" aria-selected="false">' + text("plugin-builder.agent-studio.try") + '</button></div>'
    + '<div class="as-head-actions" data-as-head-actions></div></header>'
    + '<div class="as-canvas" data-as-canvas data-tab="build"><div class="as-canvas-scroll" data-as-scroll><div class="as-empty" data-as-empty></div><div class="as-plugin" data-as-plugin></div>'
    + '<div class="as-frame" data-as-frame hidden aria-hidden="true"><i></i><i></i><i></i><i></i><span></span></div>'
    + '<div class="as-pointer as-pointer-ui" data-as-pointer="ui" hidden><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 1l11 7-5 1-2 5z"/></svg><span>UI Agent</span><em></em></div>'
    + '<div class="as-pointer as-pointer-code" data-as-pointer="code" hidden><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 1l11 7-5 1-2 5z"/></svg><span>' + codeAgent + '</span><em></em></div></div>'
    + '<div class="as-catalog" data-as-catalog-panel hidden aria-label="' + text("plugin-builder.agent-studio.all-components-ui-catalog") + '"></div><nav class="as-board" data-as-board aria-label="' + text("plugin-builder.agent-studio.spec-board-components-ui-catalog") + '"></nav><div class="as-part-tip" data-as-tip role="tooltip" hidden></div></div>'
    + '<footer class="as-status" data-as-status role="status"></footer></main></section>';
}

export const AGENT_STUDIO_STYLES = String.raw`
.pb-surface:has(> .as-shell){padding:0!important;min-height:0;overflow:auto}
.as-shell,.as-preview-page{--as-ground:var(--rail);--as-panel:var(--surface-soft);--as-ink:var(--ink);--as-muted:var(--muted);--as-line:var(--line);--as-paper:var(--paper);--as-fill:var(--control-fill);--as-blue:var(--accent);--as-green:var(--green);--as-amber:var(--amber);--as-red:var(--red);color:var(--as-ink);font:13px/1.65 var(--font);-webkit-font-smoothing:antialiased}
.as-shell{display:grid;grid-template-columns:clamp(320px,26%,430px) minmax(0,1fr);grid-template-rows:56px minmax(0,1fr);height:100%;background:var(--as-ground);overflow:hidden}
.as-shell *,.as-preview-page *{box-sizing:border-box}.as-shell [hidden]{display:none!important}:where(.as-shell) button{font:inherit;color:inherit;cursor:pointer}:where(.as-shell) button:disabled{opacity:.42;cursor:not-allowed}
.as-shell svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle}.as-shell :focus-visible{outline:2px solid var(--as-blue);outline-offset:2px}
:where(.as-shell) :is(h1,h2,h3,p){margin:0}.as-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.as-top{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 24px;border-bottom:1px solid var(--as-line);background:var(--as-panel)}
.as-top-actions{display:flex;align-items:center;gap:12px}.as-select{display:flex;align-items:center;gap:8px;color:var(--as-muted);font-size:12px}.as-select>span{white-space:nowrap;flex:none}.as-select select{max-width:220px;font:inherit;color:var(--as-ink);border:1px solid var(--as-line);border-radius:8px;background:var(--as-paper);padding:8px 8px}
.as-icon{color:inherit;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--as-line);border-radius:8px;background:var(--as-paper)}.as-icon:hover{background:var(--as-fill)}
.as-left{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--as-line);background:var(--as-panel)}
.as-feed{flex:1;min-height:0;overflow-y:auto;padding:24px 24px 12px;display:flex;flex-direction:column;gap:16px}
.as-feed h2{font-size:17px;font-weight:600}.as-muted{color:var(--as-muted)}.as-small{font-size:12px}
.as-card{border:1px solid var(--as-line);border-radius:10px;background:var(--as-paper);padding:16px 16px}.as-card h3{font-size:13px;font-weight:600;margin-bottom:8px}
.as-brief{border-left:3px solid var(--line-strong);padding:4px 0 4px 12px}.as-brief span{display:block;color:var(--as-muted);font-size:12px}.as-brief p{white-space:pre-wrap;overflow-wrap:anywhere}
.as-examples{display:grid;gap:8px}.as-example{text-align:left;border:1px solid var(--as-line);border-radius:10px;background:var(--as-paper);padding:12px 12px}.as-example:hover{border-color:var(--as-line)}.as-example b{display:block;font-weight:600}
.as-candidates{display:grid;gap:12px}.as-candidate{border:1px solid var(--as-line);border-radius:10px;background:var(--as-paper);padding:12px 12px;text-align:left;width:100%}.as-candidate[aria-pressed="true"]{border-color:var(--as-blue);box-shadow:0 0 0 2px var(--accent-soft)}
.as-candidate b{display:block;font-size:13px}.as-candidate p{color:var(--as-muted);margin-top:4px}.as-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.as-chip{display:inline-flex;align-items:center;gap:4px;border-radius:999px;background:var(--as-fill);padding:1px 8px;font-size:12px;color:var(--as-muted);white-space:nowrap}.as-chip.jev{background:var(--blue-soft,var(--accent-soft));color:var(--accent)}.as-chip.rule{background:var(--as-fill)}.as-chip.user{background:var(--amber-soft,var(--amber-soft));color:var(--amber)}
.as-secret{display:grid;grid-template-columns:auto 1fr 1.4fr;gap:8px;align-items:center;margin:8px 0}.as-secret input{min-width:0;border:1px solid var(--as-line);border-radius:6px;padding:4px 8px;font:inherit;background:var(--as-paper);color:var(--as-ink)}
.as-mockup{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;border:1px solid var(--as-line);background:var(--as-fill);margin-bottom:8px}.as-mockup[data-drawing]{display:flex;align-items:center;justify-content:center;color:var(--as-muted);font-size:12px}.as-mockup-large{aspect-ratio:auto;max-height:320px;object-fit:contain}
.as-chip[data-as-enable]{background:var(--amber-soft,var(--amber-soft));color:var(--as-amber)}.as-chip.ok{background:var(--green-soft,var(--green-soft));color:var(--green)}.as-chip.bad{background:var(--red-soft,var(--red-soft));color:var(--red)}
.as-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.as-button{color:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:4px 12px;border:1px solid var(--as-line);border-radius:8px;background:var(--as-paper);font-size:12px}.as-button:hover{background:var(--as-fill)}.as-primary{background:var(--ink,var(--action));color:var(--paper,var(--action-ink));border-color:transparent}.as-primary:hover{background:var(--action)}
.as-ops{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}.as-ops li{display:flex;align-items:center;justify-content:space-between;gap:8px}.as-ops code{font-size:12px;color:var(--as-muted)}.as-op-note{display:block;color:var(--as-muted);font-size:11px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.as-ops li>span{min-width:0}
.as-agents{display:grid;gap:8px}.as-agent{display:flex;align-items:baseline;gap:8px}.as-agent b{flex:none;font-weight:600}.as-agent[data-agent=design] b{color:var(--accent)}.as-agent[data-agent=ui] b{color:var(--as-blue)}.as-agent[data-agent=code] b{color:var(--as-green)}.as-agent[data-agent=host] b{color:var(--as-muted)}
.as-decision{border-color:color-mix(in srgb, var(--amber) 42%, transparent);background:var(--amber-soft,var(--amber-soft))}.as-error{border-color:color-mix(in srgb, var(--red) 42%, transparent);background:var(--red-soft,var(--red-soft))}.as-error p{color:var(--red);white-space:pre-wrap;overflow-wrap:anywhere}
.as-steps{border-top:1px solid var(--as-line);padding-top:12px}.as-steps summary{cursor:pointer;color:var(--as-muted);font-size:12px}.as-steps ol{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}
.as-step{display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;align-items:start}.as-step>span{margin-top:3px}
.as-step-agent{font-weight:600;margin-right:4px}.as-step-agent[data-agent=design]{color:var(--accent)}.as-step-agent[data-agent=ui]{color:var(--as-blue)}.as-step-agent[data-agent=code]{color:var(--as-green)}.as-step small{display:block;color:var(--as-muted);font-size:12px;overflow-wrap:anywhere;white-space:pre-wrap}
.as-gates{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.as-controls{display:flex;gap:8px}
.as-composer{position:relative;margin:0 16px 8px;border:1px solid var(--as-line);border-radius:12px;background:var(--as-paper);padding:8px 48px 8px 12px}.as-composer:focus-within{border-color:color-mix(in srgb, var(--accent) 42%, transparent);box-shadow:0 0 0 3px var(--accent-soft)}
.as-composer textarea{--fit-max:180px;display:block;width:100%;border:0;outline:0;font:inherit;background:transparent}.as-send{position:absolute;right:9px;bottom:9px;width:32px;height:32px;border:0;border-radius:50%;background:var(--ink,var(--action));color:var(--paper,var(--action-ink));display:flex;align-items:center;justify-content:center}.as-send:disabled{background:var(--line-strong)}
.as-target{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:var(--accent)}.as-target button{border:0;background:none;padding:0 4px;color:var(--as-muted)}
.as-model-note{margin:0 16px 12px;color:var(--as-muted);font-size:12px;text-align:center}
.as-model-setup{align-self:center;color:var(--as-muted);font-size:12px;white-space:nowrap}
.as-right{display:flex;flex-direction:column;min-width:0;min-height:0;padding:0 24px}
.as-canvas-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px}.as-title{display:flex;align-items:center;gap:8px;min-width:0}.as-title h1{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.as-phase{border-radius:6px;background:var(--as-fill);padding:1px 8px;font-size:12px;color:var(--as-muted);white-space:nowrap}.as-phase[data-phase=ready]{background:var(--green-soft,var(--green-soft));color:var(--green)}.as-phase[data-phase=failed]{background:var(--red-soft,var(--red-soft));color:var(--red)}.as-phase[data-phase=clarifying],.as-phase[data-phase=paused]{background:var(--amber-soft,var(--amber-soft));color:var(--amber)}
.as-segment{display:flex;flex:none;padding:4px;border-radius:10px;background:var(--as-fill)}.as-segment button{border:0;border-radius:6px;background:none;padding:4px 16px;font-size:12px;white-space:nowrap}.as-segment [aria-selected=true]{background:var(--as-paper);box-shadow:var(--lift-1);font-weight:600}
.as-head-actions{display:flex;gap:8px;justify-content:flex-end;min-width:120px}
.as-canvas{position:relative;flex:1;min-height:0;border-radius:14px;background:var(--as-paper);box-shadow:var(--lift-1);display:flex;flex-direction:column;overflow:hidden}
.as-canvas-scroll{position:relative;flex:1;min-height:0;overflow:auto;padding:32px clamp(20px,6%,84px) 96px}
.as-plugin{max-width:980px;margin:0 auto}.as-empty{max-width:560px;margin:8vh auto 0;text-align:center;color:var(--as-muted)}.as-empty h2{color:var(--as-ink);font-size:20px;margin-bottom:8px}
.as-skeleton{display:grid;gap:16px;max-width:760px;margin:0 auto}.as-skeleton div{height:18px;border-radius:6px;background:linear-gradient(90deg,var(--as-fill),var(--surface-soft),var(--as-fill));background-size:200% 100%;animation: none}.as-skeleton .tall{height:120px}
@keyframes as-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
.as-canvas[data-tab=build] .pc-node{position:relative;outline:1px dashed transparent;outline-offset:6px;transition:outline-color 250ms}.as-canvas[data-tab=build] .pc-node:hover{outline-color:color-mix(in srgb, var(--accent) 42%, transparent)}.as-canvas[data-tab=build] .pc-node[data-as-target]{outline:2px solid var(--as-blue)}
.as-canvas[data-tab=build] .pc-node[data-as-queued]{display:none}.as-canvas[data-tab=build] .pc-node[data-as-landing]{opacity:0}
.as-canvas[data-tab=build] .pc-node[data-as-arrive]{animation:as-arrive 640ms var(--ease-quint)}@keyframes as-arrive{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
.as-canvas[data-tab=build] .pc-node[data-live=false]{opacity:.6}.as-canvas[data-tab=build] .pc-node[data-live=false]::before{content:var(--as-idle);position:absolute;top:-11px;right:0;z-index:1;font-size:11px;line-height:18px;color:var(--amber);background:var(--amber-soft,var(--amber-soft));border:1px solid color-mix(in srgb, var(--amber) 42%, transparent);border-radius:999px;padding:0 8px}
.as-canvas[data-tab=build] .pc-node[data-as-wired]::after{content:var(--as-wired);position:absolute;top:-12px;right:-6px;border-radius:999px;background:var(--green-soft,var(--green-soft));color:var(--green);font-size:11px;padding:0 8px;animation:as-wired 640ms var(--ease-quint) forwards}@keyframes as-wired{0%,70%{opacity:1}100%{opacity:0}}
.as-canvas .pc-node{position:relative}.as-canvas .pc-inspect{position:absolute;top:-12px;right:-8px;z-index:2;border:1px solid color-mix(in srgb, var(--accent) 42%, transparent);border-radius:999px;background:var(--as-paper);padding:1px 8px;font-size:12px;opacity:0;transition:opacity 130ms}.as-canvas[data-tab=build][data-inspectable] .pc-node:hover .pc-inspect,.as-canvas[data-tab=build][data-inspectable] .pc-inspect:focus-visible{opacity:1}@media (hover:none){.as-canvas[data-tab=build][data-inspectable] .pc-inspect{opacity:1}}.as-canvas:not([data-inspectable]) .pc-inspect,.as-canvas[data-tab=try] .pc-inspect{display:none}
.as-pointer{position:absolute;top:0;left:0;z-index:5;display:flex;align-items:flex-start;gap:4px;pointer-events:none;transition:transform 640ms var(--ease-quint),opacity 250ms}.as-pointer svg{width:16px;height:16px;fill:currentColor;stroke:var(--paper);stroke-width:2;filter:drop-shadow(0 1px 1px color-mix(in srgb,var(--shadow-color) 18%,transparent))}.as-pointer span{border-radius:6px;color:var(--paper,var(--action-ink));font-size:12px;font-weight:500;padding:1px 8px;margin-top:12px;box-shadow:var(--lift-1)}.as-pointer em{position:absolute;top:36px;left:18px;white-space:nowrap;font-style:normal;font-size:12px;border:1px solid var(--as-line);background:var(--as-paper);border-radius:6px;padding:1px 8px;color:var(--as-muted);box-shadow:var(--lift-1)}
.as-pointer-ui{color:var(--as-blue)}.as-pointer-ui span{background:var(--as-blue)}.as-pointer-code{color:var(--as-green)}.as-pointer-code span{background:var(--as-green)}
.as-pointer[data-click] svg{animation:as-click 420ms var(--ease-quint)}@keyframes as-click{50%{transform:scale(.78)}}
.as-frame{position:absolute;top:0;left:0;z-index:4;border:1.5px solid var(--as-blue);border-radius:10px;pointer-events:none;box-shadow:var(--lift-1);transition:transform 420ms var(--ease-quint)}.as-frame[data-mode=landing]{border-style:dashed;box-shadow:none;background:color-mix(in srgb,var(--accent) 3%,transparent)}
.as-frame i{position:absolute;width:7px;height:7px;background:var(--as-paper);border:1.5px solid var(--as-blue);border-radius:2px}.as-frame i:nth-child(1){top:-4px;left:-4px}.as-frame i:nth-child(2){top:-4px;right:-4px}.as-frame i:nth-child(3){bottom:-4px;left:-4px}.as-frame i:nth-child(4){bottom:-4px;right:-4px}
.as-frame span{position:absolute;top:-21px;left:-1px;background:var(--as-blue);color:var(--paper,var(--action-ink));font-size:11px;line-height:18px;border-radius:6px 6px 6px 0;padding:0 8px;white-space:nowrap}
.as-board{position:absolute;left:50%;bottom:14px;z-index:6;transform:translateX(-50%);display:flex;align-items:stretch;gap:4px;max-width:calc(100% - 28px);overflow-x:auto;border:1px solid var(--as-line);border-radius:16px;background:var(--as-paper);box-shadow:var(--lift-1);padding:8px 8px;}
.as-board-label{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:1px;padding:0 12px 0 8px;margin-right:4px;border-right:1px solid var(--as-line);white-space:nowrap;font-size:12px;font-weight:600}.as-board-label svg{width:16px;height:16px;color:var(--accent);margin-bottom:4px}.as-board-label small{font-weight:400;color:var(--as-muted);font-size:11px}
.as-part{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:64px;min-width:64px;height:58px;border:0;border-radius:10px;background:none;padding:4px;font-size:11px;color:var(--as-muted);transition:background 250ms,color 250ms,transform 250ms var(--ease-quint),box-shadow 250ms}.as-part svg{width:20px;height:20px;stroke-width:1.6}.as-part b{font-weight:500;white-space:nowrap}
.as-part:hover{background:var(--as-fill);color:var(--as-ink)}.as-part[data-used]{color:var(--as-ink)}.as-part-check{position:absolute;top:4px;right:7px;display:grid;place-items:center;min-width:14px;height:14px;border-radius:7px;background:var(--as-green);color:var(--paper,var(--action-ink));font-size:11px;font-style:normal;font-weight:600;padding:0 4px;animation:as-pop 420ms var(--ease-quint)}@keyframes as-pop{from{transform:scale(0)}to{transform:none}}
.as-part[data-legal]{color:var(--amber);background:var(--amber-soft,var(--amber-soft));box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--amber) 42%, transparent)}.as-part[data-legal]:hover{background:var(--amber-soft,var(--amber-soft))}.as-part[data-picking]{color:var(--as-blue);background:var(--blue-soft,var(--accent-soft));transform:translateY(-3px);box-shadow:var(--lift-1)}
.as-part-tip{position:absolute;z-index:8;bottom:90px;width:232px;padding:12px 12px;border-radius:11px;background:var(--as-paper);border:1px solid var(--as-line);box-shadow:var(--lift-1);font-size:12px;pointer-events:none}.as-part-tip b{display:block;font-size:13px;margin-bottom:4px}.as-part-tip p{color:var(--as-muted)}.as-part-tip ul{margin:8px 0 0;padding:8px 0 0;border-top:1px solid var(--as-line);list-style:none;display:grid;gap:4px}.as-part-tip li::before{content:"✓ ";color:var(--as-green)}.as-part-tip .as-tip-legal{color:var(--amber);margin-top:8px}
.as-part[data-catalog]{opacity:.5}.as-board-more{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:64px;min-width:64px;height:58px;margin-left:4px;border:0;border-left:1px solid var(--as-line);border-radius:0 10px 10px 0;background:none;font-size:11px;color:var(--as-muted)}.as-board-more svg{width:20px;height:20px; stroke-width: 1.6; }.as-board-more[aria-expanded=true],.as-board-more:hover{color:var(--as-ink);background:var(--as-fill)}
.as-catalog{position:absolute;left:50%;bottom:90px;z-index:7;transform:translateX(-50%);width:min(880px,calc(100% - 28px));max-height:min(420px,calc(100% - 120px));overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px 16px;padding:16px 16px;border:1px solid var(--as-line);border-radius:14px;background:var(--as-paper);box-shadow:var(--lift-1);animation:as-rise 250ms var(--ease-quint)}
.as-catalog h4{margin:0 0 8px;font-size:12px;font-weight:600;color:var(--as-muted);display:flex;justify-content:space-between}.as-catalog section>div{display:flex;flex-wrap:wrap;gap:4px}.as-catalog .as-part{width:58px;min-width:58px;height:52px}.as-catalog-note{grid-column:1/-1;margin:0;font-size:12px;color:var(--as-muted)}
@keyframes as-rise{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
.as-board-cap{margin-left:8px;padding-left:12px!important;border-left:1px solid var(--as-line)}.as-cap b{max-width:60px;overflow:hidden;text-overflow:ellipsis}
.as-cap[data-as-arrive] .as-part-check{animation:as-pop 420ms var(--ease-quint)}.as-cap[data-wiring]{outline:1.5px dashed var(--as-green);outline-offset:1px;animation: none}@keyframes as-wiring{50%{outline-color:transparent}}@media (prefers-reduced-motion:reduce){.as-cap[data-wiring]{animation:none}}
.as-cap-list{display:grid;gap:4px}.as-cap-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:1px 8px;padding:8px 8px;border-radius:8px;font-size:12px}.as-cap-row b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.as-cap-row small{grid-column:1/-1;color:var(--as-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-cap-row[data-used]{background:var(--green-soft,var(--green-soft))}.as-cap-row[data-off]{opacity:.55}.as-cap-row .as-chip{font-size:11px;padding:0 8px}
.as-recent{display:grid;gap:8px}.as-recent h3{font-weight:500;margin-bottom:4px}.as-recent-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;text-align:left;border:1px solid var(--as-line);border-radius:10px;background:var(--as-paper);padding:8px 12px}.as-recent-item:hover{border-color:var(--as-line)}.as-recent-item b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.as-recent-item small{grid-column:1/-1;color:var(--as-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-status{display:flex;justify-content:space-between;gap:12px;min-height:34px;align-items:center;color:var(--as-muted);font-size:12px}
html:has(> body > .as-preview-page),body:has(> .as-preview-page){margin:0;background:var(--canvas,var(--rail))}
.as-preview-page{display:block;max-width:980px;margin:0 auto 32px;padding:32px clamp(16px,5%,56px);background:var(--as-paper);min-height:calc(100vh - 56px);border-radius:0 0 14px 14px}
.as-install{margin-top:12px;padding-top:12px;border-top:1px solid var(--as-line)}.as-install code{overflow-wrap:anywhere}
.as-dialog{border:1px solid var(--as-line);border-radius:14px;padding:24px 24px;max-width:420px;width:calc(100% - 32px);box-shadow: var(--lift-3);color:var(--as-ink)}.as-dialog::backdrop{background:var(--scrim)}.as-dialog h3{font-size:15px;margin-bottom:8px}.as-dialog ul{margin:8px 0 12px;padding-left:16px}.as-dialog li{margin:4px 0}
.as-installed-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;max-width:980px;margin:16px auto 0;padding:16px clamp(16px,5%,56px);background:var(--as-paper);border-radius:14px 14px 0 0;border-bottom:1px solid var(--line);font:13px/1.6 var(--font);color:var(--ink)}.as-installed-bar span{color:var(--ink-soft)}.as-installed-bar a{margin-left:auto;color:var(--accent);text-decoration:none}
@media (max-width:760px){.as-shell{grid-template-columns:minmax(0,1fr);grid-template-rows:56px auto minmax(0,1fr);height:auto;min-height:100%;overflow:visible}.as-top{padding:0 12px}.as-top-actions{flex:1;justify-content:flex-end;gap:8px;min-width:0}.as-select{flex:0 1 auto;min-width:0}.as-select select{width:100%;min-width:0;max-width:none}.as-select:has(select[data-as-model]){flex:0 0 auto}.as-select>span{white-space:nowrap;flex:none}.as-select select[data-as-model]{width:112px}.as-canvas-head{flex-wrap:wrap;row-gap:4px;padding:8px 0}.as-title{flex:1 1 60%}.as-head-actions{min-width:0}.as-left{border-right:0;border-bottom:1px solid var(--as-line)}.as-feed{max-height:52vh}.as-right{padding:0 12px 12px;min-height:80vh}.as-model span{display:none}.as-canvas-scroll{padding:24px 16px 96px}}
@media (prefers-reduced-motion:reduce){.as-shell *{animation:none!important;transition:none!important}}
`;

/**
 * Browser client; a string so the host can inline it. Receives the host's routes and the component renderer.
 *
 * Notes on the script below. They are kept here rather than inside it because the script is served as it stands: a
 * comment inside it is bytes the browser downloads and never runs.
 *
 * - `selector`: In the workbench the studio is drawn in the plugin's stage (host.root); the preview and an installed plugin run in frames.
 * - `globalThis.__molisPluginRead`: Diagnoses the actual rendered query, including selection and filters, without issuing another request.
 * - `host.mode === 'installed'`: An installed plugin: the same renderer; every call goes to the plugin's own sandboxed process through the host.
 * - `readText`: The workbench's translator (`globalThis.t.text`); the frames get none and show the Chinese text. Every sentence the studio itself writes goes through it, with `{name}`
 *   placeholders for the parts that vary (`STUDIO_EN` has the English). What the build record carries is shown as written: the model's answers, the host's step labels,
 *   errors and notes, the capability directory's titles. `GROUPS`, `c.name` and `c.description` are the shared catalog's own words.
 * - `S`: What a failed request shows: a message the studio's routes send as it is (`STUDIO_EN` has the ones a person reaches by asking), or its opening sentence up to "："
 *   followed by the detail as the host wrote it (the publish check's problems); any other message is shown as written.
 * - `queue`, `landing`, `picking`, `play`: The UI Agent's placements, paced so each one can be seen: a part waits in the queue, is taken from the spec board, carried to its
 *   place (the spot opens, framed, before the part shows), lands and the spec board ticks it off. A part being landed has left the queue but is not revealed yet; an update
 *   arriving meanwhile must not queue it again. Opening a build, or trying it, shows everything at once.
 * - `wiredCaps`, `wires`, `playWires` (D22): Capabilities being connected are ticked on the capability board only once the code agent has carried them in. It takes the capability
 *   from the board and carries it to the part that calls it. A button on each record has nowhere to show while the list is empty: it is carried to that list instead.
 * - `GROUPS`: Parts are UI catalog components; builds from before keep their old names, which map onto the catalog.
 * - The capability board (`CAP_SOURCES`, `usedCapabilities`): what this plugin uses from the project's unified action directory, and the whole directory.
 * - `phaseOf`: A build stopped on a question for the person is waiting for them, not paused.
 * - `toEnable`: The plugins a proposal would need enabled in this project first.
 * - `mockupHtml` (W7): The proposal's picture when an image service drew one; nothing at all when there is none.
 * - `opState`: One row of the task board: where this operation stands, and what its code agent is doing or where it is stuck.
 * - `failure`: What went wrong, in the person's words, and what they can do; the host's own words stay under "Technical details".
 * - `effectsList`: What an installation grants, grouped the way the person weighs it: its own data, what it reads (granted with the installation), and what it changes
 *   outside itself (each listed).
 * - `ask`: A small in-page dialog; resolves with the chosen button's value, or '' when dismissed. `settle` resolves from the form's own submit (synchronous with the click) and
 *   from Escape; a dialog's close event is not delivered while the page is in the background.
 * - `renderHead`: Typing never waits for a build: a change request stops the current round and is taken in.
 * - `usedSlots`: What the rendered plugin actually uses from the catalog: every component carries its catalog slot.
 * - `renderBoard`: Only what has landed counts as placed; a part still waiting its turn is not on the page yet.
 * - `showTip`: What a spec-board part is, and where this plugin already uses it.
 * - `aim`: Points at an element from inside the canvas: above it (the spec board), at its top-right area (a part), or at its right edge.
 * - `schedule`: Hidden views read the authoritative build again on return.
 * - The install click: the plugin opens in place as a workbench stage rather than in a new window. The secrets travel with the install: the host's sealed store keeps them only
 *   if the plugin is installed, and the plugin will only ever name them. An uninstall kept this plugin's data, and this version cannot read it: install fresh only if the person
 *   lets it go.
 * - The composer's submit: a request that starts "做一个……" while another plugin is open is most likely a new plugin; it asks rather than rewrite the open one.
 * - The last lines: coming in without a plugin named in the address starts a new one; earlier ones are a click away, never opened for you.
 */
export const AGENT_STUDIO_CLIENT_FACTORY_SCRIPT = String.raw`(host)=>{
 const selector=host.mode==='preview'?'[data-studio-preview]':host.mode==='installed'?'[data-installed-plugin]':'[data-agent-studio]';
 const root=host.root?(host.root.matches?.(selector)?host.root:host.root.querySelector(selector)):document.querySelector(selector);
 if(!root)return;
 const page=host.page;const lifetime=host.mountPluginClient(root);if(!lifetime)return;
 const Q=n=>globalThis.t.text("plugin-builder.agent-studio.name",{name:n}),S=m=>m;

 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon=n=>'<svg aria-hidden="true"><use href="#icon-'+n+'"/></svg>';
 const headers=m=>m==='GET'?{}:(globalThis.molisWorkControlHeaders?.()||{'content-type':'application/json'});
 async function api(path,method='GET',body,signal){
  const r=await lifetime.fetch(host.api(path),{method,signal,cache:'no-store',headers:headers(method),...(body===undefined?{}:{body:JSON.stringify(body)})});
  const v=await r.json().catch(()=>({}));lifetime.assertCurrent(signal);if(!r.ok)throw Object.assign(new Error(v.error||globalThis.t.text("plugin-builder.agent-studio.operation-failed-content-preserved")),{status:r.status,code:v.code});return v;
 }
 let pending=0;globalThis.__molisPluginPending=0;
 const pluginCall=id=>async(componentId,binding,payload)=>{pending++;globalThis.__molisPluginPending=pending;try{return (await api('/builds/'+id+'/call','POST',{componentId,binding,payload,...(host.acceptance?{acceptance:host.acceptance}:{})})).value}finally{pending--;if(lifetime.alive)globalThis.__molisPluginPending=pending}};
 if(host.mode==='preview'){
  const readings=new Map(),plugin=host.components({root,call:pluginCall(host.build),onRead:(id,result)=>readings.set(id,result)});
  lifetime.own(()=>plugin.destroy());
  globalThis.__molisPluginRead=async componentId=>{const result=readings.get(componentId);if(!result)throw new Error(globalThis.t.text("common.generated.preview-no-result"));if('error'in result)throw new Error(result.error);return structuredClone(result.value)};
  if(host.acceptance){const refresh=async componentId=>{lifetime.assertCurrent();await plugin.refresh(componentId)};globalThis.__molisPluginRefresh=refresh;lifetime.own(()=>{if(globalThis.__molisPluginRefresh===refresh)delete globalThis.__molisPluginRefresh});}
  if(!host.view){root.textContent=globalThis.t.text("common.generated.preview-no-design");return;}
  plugin.update(host.view).then(()=>{if(lifetime.alive)globalThis.__molisPluginReady=true;}).catch(e=>{if(lifetime.alive)root.textContent=e.message;});
  return;
 }
 if(host.mode==='installed'){
  if(parent!==window)root.dataset.framed='';
  const call=async(componentId,binding,payload)=>{pending++;globalThis.__molisPluginPending=pending;try{const r=await lifetime.fetch(host.call,{method:'POST',cache:'no-store',headers:headers('POST'),body:JSON.stringify({componentId,binding,payload})});const v=await r.json().catch(()=>({}));lifetime.assertCurrent();if(!r.ok)throw new Error(v.error||globalThis.t.text("common.generated.input-preserved"));return v.value;}finally{pending--;if(lifetime.alive)globalThis.__molisPluginPending=pending}};
  const plugin=host.components({root,call});lifetime.own(()=>plugin.destroy());plugin.update(host.view).then(()=>{if(lifetime.alive)globalThis.__molisPluginReady=true;}).catch(e=>{if(lifetime.alive)root.textContent=e.message;});
  return;
 }
 const $=s=>root.querySelector(s);
 const feed=$('[data-as-feed]'),input=$('[data-as-input]'),canvas=$('[data-as-canvas]'),scroll=$('[data-as-scroll]'),pluginRoot=$('[data-as-plugin]'),empty=$('[data-as-empty]');
 // The conversation's one scroll owner (VUX-26): it follows at the end and stops when the person reads back.
 const follow=window.molisFollow?.(feed);if(follow)lifetime.own(()=>follow.dispose());
 let state={builds:[],models:[],model:null,components:[],selectionAvailable:false},current=null,versions=[],preview=null,tab='build',target=null,source=null,frame=0,busy=false,notice='',openSteps=null,rendered='',seenWired=new Set(),firstPaint=true;
 let revealed=new Set(),queue=[],landing=null,picking=null,playing=false,playToken=0;
 let wiredCaps=new Set(),wires=[],wiring=null,wiringPlay=false;
 const GROUPS=['版面','展示','录入','操作','浮层','反馈'];let catalogOpen='';
 const CAP_ICON={platform:'sparkles',plugin:'package',mcp:'network'},CAP_SOURCES=[['platform',globalThis.t.text("plugin-builder.agent-studio.platform")],['plugin',globalThis.t.text("plugin-builder.agent-studio.installed-plugins")],['mcp',globalThis.t.text("plugin-builder.agent-studio.mcp-connectors")]];
 const capabilityOf=id=>(state.capabilities||[]).find(c=>c.id===id&&c.offered!==false)||(state.capabilities||[]).find(c=>c.id===id)||{id,title:id,source:{kind:'platform'}};
 function usedCapabilities(b){const ops=b?.design?.contract.operations||[];return [...new Set(ops.flatMap(o=>o.effects?.capabilities||[]))].map(id=>{const using=ops.filter(o=>(o.effects?.capabilities||[]).includes(id));return {c:capabilityOf(id),done:using.every(o=>b.connected.includes(o.id)),ops:using.map(o=>o.id)};});}
 const plugin=host.components({root:pluginRoot,call:(id,binding,payload)=>current?pluginCall(current.id)(id,binding,payload):Promise.reject(new Error(globalThis.t.text("plugin-builder.agent-studio.there-no-draft-yet"))),inspect:id=>{if(tab!=='build'||!current?.design)return;target=id;schedule();input.focus();},inspectLabel:globalThis.t.text("plugin-builder.agent-studio.inspect-part")});
 lifetime.own(()=>plugin.destroy());
 const PHASE={draft:globalThis.t.text("plugin-builder.agent-studio.draft"),designing:globalThis.t.text("plugin-builder.agent-studio.designing"),clarifying:globalThis.t.text("plugin-builder.agent-studio.needs-answer"),choosing:globalThis.t.text("plugin-builder.agent-studio.comparing-proposals"),building:globalThis.t.text("plugin-builder.agent-studio.building"),paused:globalThis.t.text("plugin-builder.agent-studio.paused"),failed:globalThis.t.text("plugin-builder.agent-studio.needs-attention"),ready:globalThis.t.text("plugin-builder.agent-studio.ready-try")};
 const phaseOf=b=>!b.active&&(b.pendingPlugins?.length||b.pendingPart)?globalThis.t.text("plugin-builder.agent-studio.needs"):PHASE[b.phase]||b.phase;
 const AGENT={design:globalThis.t.text("plugin-builder.agent-studio.lead-designer"),ui:'UI Agent',code:globalThis.t.text("plugin-builder.agent-studio.code-agent"),host:globalThis.t.text("plugin-builder.agent-studio.host-check")};
 const componentWord=ref=>ref?.key?globalThis.t.text(ref.key):ref?.literal||"";
 const componentName=kind=>componentWord(state.components.find(c=>c.kind===kind)?.name)||kind;
 const active=b=>!!b?.active;
 const EXAMPLES=[[globalThis.t.text("plugin-builder.agent-studio.reading-notes"),globalThis.t.text("plugin-builder.agent-studio.keep-track-books-i-have-read-rating-one")],[globalThis.t.text("plugin-builder.agent-studio.daily-review"),globalThis.t.text("plugin-builder.agent-studio.each-day-write-down-what-i-got-done")],[globalThis.t.text("plugin-builder.agent-studio.group-sign-up-sheet"),globalThis.t.text("plugin-builder.agent-studio.collect-each-person-s-name-contact-details-time")]];
 function selection(s){if(!s)return '';if(s.source==='jev')return '<span class="as-chip jev" data-mw-state="running">Jev · '+globalThis.t.text("plugin-builder.agent-studio.value-1-n",{n:s.candidates.length})+(s.elapsedMs!=null?' · '+s.elapsedMs+'ms':'')+'</span>';if(s.source==='design')return '<span class="as-chip rule">UI Agent</span>';if(s.source==='user')return '<span class="as-chip user">'+globalThis.t.text("plugin-builder.agent-studio.chose")+'</span>';return '<span class="as-chip rule">'+globalThis.t.text(s.candidates.length===1?"plugin-builder.agent-studio.only-valid-option":"plugin-builder.agent-studio.chosen-rule")+'</span>';}
 function gates(detail){try{const g=JSON.parse(detail);if(!Array.isArray(g))return '';const name={G1:globalThis.t.text("plugin-builder.agent-studio.contract"),G2:globalThis.t.text("plugin-builder.agent-studio.kind"),G3:globalThis.t.text("plugin-builder.agent-studio.packaging"),G4:globalThis.t.text("plugin-builder.agent-studio.implementation"),G5:globalThis.t.text("plugin-builder.agent-studio.test"),G6:globalThis.t.text("plugin-builder.agent-studio.sandbox-trial-run")};return '<div class="as-gates">'+g.map(x=>'<span class="as-chip '+(x.passed?'ok':'bad')+'" title="'+esc(x.id+' '+x.detail)+'">'+esc(name[x.id]||x.id)+(x.passed?' ✓':' ✗')+'</span>').join('')+'</div>'+g.filter(x=>!x.passed).map(x=>'<small>'+esc(x.detail).slice(0,600)+'</small>').join('');}catch{return detail?'<small>'+esc(detail).slice(0,600)+'</small>':'';}}
 function checkChips(detail){try{const r=JSON.parse(detail);return Array.isArray(r?.gates)?gates(JSON.stringify(r.gates)):'';}catch{return '';}}
 function cases(detail){try{const c=JSON.parse(detail);if(!Array.isArray(c))return '';return '<small>'+globalThis.t.text("plugin-builder.agent-studio.passed-total-acceptance-cases-passed",{passed:c.filter(x=>x.passed).length,total:c.length})+'</small>'+c.filter(x=>!x.passed).map(x=>{let d=x.detail;try{const i=JSON.parse(d);d=(i.step?globalThis.t.text("plugin-builder.agent-studio.step-n",{n:i.step})+' ':'')+(i.reason||'')+(i.visible?globalThis.t.text("plugin-builder.agent-studio.screen-text",{text:i.visible.slice(0,80)}):'');}catch{}return '<small>✗ '+esc(x.id)+'：'+esc(d).slice(0,300)+'</small>';}).join('');}catch{return '';}}
 function stepHtml(s){let label=s.label,detail='';
  if(s.agent==='code'&&s.action==='file'){label=globalThis.t.text("plugin-builder.agent-studio.write-file",{file:s.detail||s.label});}
  else if(s.agent==='code'&&s.action==='check'){label=globalThis.t.text("plugin-builder.agent-studio.self-check-gates");detail=checkChips(s.detail);}
  else if(s.agent==='code'&&s.action==='tool'){label=(s.label==='read'?globalThis.t.text("plugin-builder.agent-studio.read"):s.label==='search'?globalThis.t.text("plugin-builder.agent-studio.search"):s.label)+' '+(s.detail||'').slice(0,80);}
  else if(s.agent==='code'&&s.action==='verify')detail=gates(s.detail);
  else if(s.agent==='host'&&s.action==='verify')detail=cases(s.detail);
  else if(s.detail)detail='<small>'+esc(s.detail).slice(0,400)+'</small>';
  return '<li class="as-step" data-status="'+esc(s.status)+'"><span aria-hidden="true" data-mw-state="'+({done:'done',active:'running',failed:'failed',waiting:'waiting',cancelled:'cancelled'}[s.status]||'idle')+'"></span><div><span class="as-step-agent" data-agent="'+esc(s.agent)+'">'+esc(AGENT[s.agent]||s.agent)+'</span>'+esc(label)+' '+selection(s.selection)+detail+'</div></li>';}
 const capabilityTitle=id=>(state.capabilities||[]).find(x=>x.id===id)?.title||id;
 function toEnable(c){const ids=new Set(c.preview.contract.operations.flatMap(o=>o.effects?.capabilities||[]));return [...new Set((state.capabilities||[]).filter(x=>ids.has(x.id)&&x.installed===false).map(x=>x.source?.title||''))].filter(Boolean);}
 function mockupHtml(c,large){const m=c.mockup;if(!m||m.status==='failed'||!current)return '';if(m.status==='drawing')return '<div class="as-mockup" data-drawing><span data-mw-state="running">'+globalThis.t.text("plugin-builder.agent-studio.drawing-mockup")+'</span></div>';
  return '<img class="as-mockup'+(large?' as-mockup-large':'')+'" data-mockup-src="'+esc(host.api('/builds/'+current.id+'/mockups/'+c.id))+'" alt="'+esc(globalThis.t.text("plugin-builder.agent-studio.mockup-title",{title:c.title}))+'" loading="lazy">';}
 function candidateHtml(c,selected){const ops=c.preview.contract.operations,caps=[...new Set(ops.flatMap(o=>o.effects?.capabilities||[]))].map(capabilityTitle),enable=toEnable(c);return '<button type="button" class="as-candidate" data-as-candidate="'+esc(c.id)+'" aria-pressed="'+(selected?'true':'false')+'">'+mockupHtml(c,false)+'<b>'+esc(c.title)+'</b><p>'+esc(componentWord(c.description))+'</p><p class="as-small as-muted">'+esc(c.rationale)+'</p><div class="as-meta"><span class="as-chip">'+globalThis.t.text("plugin-builder.agent-studio.features-n",{n:ops.length})+'</span><span class="as-chip">'+globalThis.t.text("plugin-builder.agent-studio.ui-parts-n",{n:c.preview.parts.length})+'</span><span class="as-chip">'+globalThis.t.text("plugin-builder.agent-studio.pages-n",{n:c.preview.contract.pages.length})+'</span>'+caps.map(t=>'<span class="as-chip">'+esc(t)+'</span>').join('')+enable.map(t=>'<span class="as-chip" data-as-enable>'+globalThis.t.text("plugin-builder.agent-studio.enable-name-first",{name:esc(t)})+'</span>').join('')+'</div></button>';}
 function effects(c){const e=c.effects||{};const words=[];if(e.storage)words.push(globalThis.t.text("plugin-builder.agent-studio.its-own-storage-ops",{ops:e.storage.map(x=>globalThis.t.text(x==='read'?"plugin-builder.agent-studio.read-2":"plugin-builder.agent-studio.write")).join('/')}));if(e.capabilities?.length)words.push(e.capabilities.map(capabilityTitle).join(globalThis.t.text("common.list.separator")));if(e.networkDomains?.length)words.push(globalThis.t.text("plugin-builder.agent-studio.online-sites",{sites:e.networkDomains.join(globalThis.t.text("common.list.separator"))}));return words.join('；')||globalThis.t.text("plugin-builder.agent-studio.uses-no-outside-capabilities");}
 function opState(b,op){if(b.connected.includes(op.id))return '<span class="as-chip ok" data-mw-state="connected">'+globalThis.t.text("plugin-builder.agent-studio.connected")+'</span>';const s=b.steps.find(x=>x.agent==='code'&&x.operationId===op.id&&x.action==='implement'&&x.status==='active');
  if(s&&active(b)){const round=/第 (\d+) 轮/.exec(s.label)?.[1];return '<span class="as-chip jev" data-mw-state="running">'+(round?globalThis.t.text("plugin-builder.agent-studio.fix-round-n",{n:round}):globalThis.t.text("plugin-builder.agent-studio.writing"))+'</span>';}
  const f=b.steps.find(x=>x.agent==='code'&&x.operationId===op.id&&x.action==='verify'&&x.status==='failed');return f?'<span class="as-chip bad" data-mw-state="blocked">'+globalThis.t.text("plugin-builder.agent-studio.stuck")+'</span>':'<span class="as-chip" data-mw-state="'+(active(b)&&b.active.stage==='build'?'queued':'idle')+'">'+globalThis.t.text(active(b)&&b.active.stage==='build'?"plugin-builder.agent-studio.queued":"plugin-builder.agent-studio.connect")+'</span>';}
 function opNote(b,op){if(b.connected.includes(op.id))return '';const mine=[...b.steps].reverse().filter(x=>x.agent==='code'&&x.operationId===op.id);
  const f=mine.find(x=>x.action==='verify'&&x.status==='failed');if(f&&!active(b)){const gate=(()=>{try{return JSON.parse(f.detail).find(g=>!g.passed);}catch{return null;}})();return gate?'<small class="as-op-note">'+esc(gate.id+'：'+gate.detail.slice(0,120))+'</small>':'';}
  if(!active(b))return '';const now=mine.find(x=>['file','tool','check'].includes(x.action));return now?'<small class="as-op-note">'+esc(now.action==='file'?globalThis.t.text("plugin-builder.agent-studio.write-file",{file:now.target||(now.detail||'').slice(0,60)}):now.action==='check'?globalThis.t.text("plugin-builder.agent-studio.self-checking-gates"):now.label)+'</small>':'';}
 function failure(e){e=e||'';const c=/^界面验收「([^」]+)」/.exec(e);
  if(c)return [globalThis.t.text("plugin-builder.agent-studio.name-did-not-work-expected-trial",{name:c[1]}),globalThis.t.text("plugin-builder.agent-studio.choose-continue-let-ai-fix-once-more-tell")];
  if(/已达到 \d+ 轮修复上限/.test(e))return [globalThis.t.text("plugin-builder.agent-studio.one-feature-could-not-be-written"),globalThis.t.text("plugin-builder.agent-studio.choose-continue-let-ai-try-again-if-keeps")];
  if(/^(界面合同无效|功能合同不成立|细化方案|验收「|操作 |组件 |模型输出不是完整 JSON|rework)/.test(e))return [globalThis.t.text("plugin-builder.agent-studio.design-step-did-not-finish"),globalThis.t.text("plugin-builder.agent-studio.choose-continue-let-ai-design-again-describe-what")];
  return null;}
 function installed(b){return b?.design?(state.installations||[]).find(i=>i.pluginId===b.design.contract.pluginId):null;}
 const covered=(next,approved)=>Object.entries(next||{}).every(([k,v])=>v.every(x=>(approved?.[k]||[]).includes(x)));
 function distributionHtml(b,release){if(!release?.distribution)return '';return '<div class="as-install"><p class="as-small">'+globalThis.t.text(release.distribution.runtime_scope==='home'?"plugin-builder.agent-studio.personal-space-version-download-signed-package-then-import":"plugin-builder.agent-studio.import-signed-package-into-another-space-existing-installation")+'</p><p class="as-small">'+globalThis.t.text("plugin-builder.agent-studio.publisher-fingerprint")+' <code>'+esc(release.distribution.publisher_key_id)+'</code></p><div class="as-actions"><button type="button" class="as-button" data-as-download="'+release.version+'">'+icon('download')+globalThis.t.text("plugin-builder.agent-studio.download-signed-package")+'</button><button type="button" class="as-button" data-as-plugin-settings>'+globalThis.t.text("plugin-builder.agent-studio.open-plugin-settings")+'</button></div></div>';}
 function installHtml(b){const latest=versions[0],inst=installed(b);if(!latest)return '';const distribution=distributionHtml(b,latest);if(latest.distribution?.runtime_scope==='home')return distribution;
  if(!inst)return distribution+'<div class="as-install"><p class="as-small">'+globalThis.t.text("plugin-builder.agent-studio.v-version-published-once-installed-appears-project-its",{version:latest.version})+'</p><div class="as-actions"><button type="button" class="as-button as-primary" data-as-install="'+latest.version+'">'+icon('download')+globalThis.t.text("plugin-builder.agent-studio.install-project")+'</button></div></div>';
  const upgrade=latest.version>inst.version?'<button type="button" class="as-button" data-as-upgrade="'+latest.version+'">'+icon('refresh')+globalThis.t.text("plugin-builder.agent-studio.upgrade-v-version",{version:latest.version})+(inst.state==='disabled'?globalThis.t.text("plugin-builder.agent-studio.stays-disabled"):'')+'</button>':'';
  return distribution+'<div class="as-install"><p class="as-small"><span class="as-chip ok" data-mw-state="ready">'+globalThis.t.text("plugin-builder.agent-studio.installed-v-version",{version:inst.version})+'</span>'+(inst.state==='running'?'':' <span class="as-chip bad" data-mw-state="'+({disabled:"disabled",quarantined:"quarantined",crashed:"failed",installed:"ready",uninstalled:"unavailable"}[inst.state]||"unavailable")+'">'+esc(inst.state)+'</span>')+'</p>'+(inst.error?'<p class="as-small" role="alert">'+esc(inst.error)+'</p>':'')+'<div class="as-actions"><a class="as-button as-primary" href="'+esc(host.plugin(inst.pluginId))+'" data-as-open-plugin="'+esc(b.id)+'">'+globalThis.t.text("plugin-builder.agent-studio.open-plugin")+'</a>'+upgrade+(inst.state==='disabled'?'<button type="button" class="as-button" data-as-install-enable>'+globalThis.t.text("plugin-builder.agent-studio.active")+'</button>':'')+'<button type="button" class="as-button" data-as-uninstall>'+icon('trash')+globalThis.t.text("plugin-builder.agent-studio.uninstall")+'</button></div></div>';}
 function effectsList(e){const own=[],reads=[],writes=[],other=[];if(e?.storage?.length)own.push(globalThis.t.text(e.storage.includes('write')?"plugin-builder.agent-studio.save-read-its-own-data-device-belongs-plugin":"plugin-builder.agent-studio.read-data-saved-itself"));
  for(const id of e?.capabilities||[]){const c=(state.capabilities||[]).find(x=>x.id===id),words=(c?.consent||globalThis.t.text("plugin-builder.agent-studio.use-platform-capability-id",{id})).replace(/^(读取|写入)：/,'');(c?.effect==='read'?reads:writes).push(words);}
  if(e?.networkDomains?.length)other.push(globalThis.t.text("plugin-builder.agent-studio.visit-these-sites-sites",{sites:e.networkDomains.join(globalThis.t.text("common.list.separator"))}));
  if(e?.secretRefs?.length)other.push(globalThis.t.text("plugin-builder.agent-studio.use-secrets-saved-names-plugin-only-gets-reference",{names:e.secretRefs.join(globalThis.t.text("common.list.separator"))}));if(e?.artifacts?.length)other.push(globalThis.t.text("plugin-builder.agent-studio.read-write-document-artifacts-project"));
  return [[globalThis.t.text("plugin-builder.agent-studio.its-own-data"),own],[globalThis.t.text("plugin-builder.agent-studio.will-read"),reads],[globalThis.t.text("plugin-builder.agent-studio.will-change-behalf"),writes],[globalThis.t.text("plugin-builder.agent-studio.other"),other]].filter(([,rows])=>rows.length);}
 function ask(title,text,buttons){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='as-dialog';
  d.innerHTML='<form method="dialog"><h3>'+esc(title)+'</h3><p class="as-small">'+esc(text)+'</p><div class="as-actions">'+buttons.map(([value,label,primary])=>'<button value="'+esc(value)+'" class="as-button'+(primary?' as-primary':'')+'">'+esc(label)+'</button>').join('')+'</div></form>';
  settle(d,resolve);});}
 function settle(d,resolve){const stop=lifetime.own(()=>{d.close();d.remove();resolve('');});root.append(d);d.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const value=e.submitter?.value||'';d.close();d.remove();resolve(value);stop();});
  d.addEventListener('cancel',e=>{e.preventDefault();d.close();d.remove();resolve('');stop();});d.showModal();}
 function consent(title,effects,confirmLabel){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='as-dialog';const refs=effects?.secretRefs||[];
  d.innerHTML='<form method="dialog"><h3>'+esc(title)+'</h3>'+(effectsList(effects).map(([head,rows])=>'<p class="as-small as-muted">'+esc(head)+'</p><ul>'+rows.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>').join('')||'<p class="as-small">'+globalThis.t.text("plugin-builder.agent-studio.no-extra-permissions-needed")+'</p>')
   +(refs.length?'<p class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.secrets-needs-kept-device-s-encrypted-store-plugin")+'</p>'+refs.map(r=>'<div class="as-secret" data-secret="'+esc(r)+'"><b>'+esc(r)+'</b><input data-secret-header value="Authorization" aria-label="'+globalThis.t.text("plugin-builder.agent-studio.request-header-name",{name:esc(r)})+'" required><input type="password" data-secret-value placeholder="'+globalThis.t.text("plugin-builder.agent-studio.example-bearer-sk")+'" aria-label="'+globalThis.t.text("plugin-builder.agent-studio.value-name",{name:esc(r)})+'" required autocomplete="off"></div>').join(''):'')
   +'<p class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.apart-what-listed-above-cannot-read-files-other",{network:globalThis.t.text(effects?.networkDomains?.length?"plugin-builder.agent-studio.can-only-visit-sites-listed-above":"plugin-builder.agent-studio.cannot-go-online")})+'</p><div class="as-actions"><button value="cancel" class="as-button" formnovalidate>'+globalThis.t.text("plugin-builder.agent-studio.cancel")+'</button><button value="ok" class="as-button as-primary">'+esc(confirmLabel)+'</button></div></form>';
  settle(d,value=>resolve(value==='ok'?{secrets:[...d.querySelectorAll('[data-secret]')].map(x=>({name:x.dataset.secret,header:x.querySelector('[data-secret-header]').value.trim(),value:x.querySelector('[data-secret-value]').value}))}:false));});}
 function agents(b){const rows=[];const last=(agent,f=()=>true)=>[...b.steps].reverse().find(s=>s.agent===agent&&f(s));
  const d=last('design');if(d)rows.push(['design',d.status==='active'?'<span data-mw-state="running">'+esc(d.label)+'</span>':esc(d.label)+(d.selection?' '+selection(d.selection):'')]);
  const u=last('ui');if(u)rows.push(['ui',esc(u.label)+' '+selection(u.selection)]);
  const writing=b.steps.filter(s=>s.agent==='code'&&s.action==='implement'&&s.status==='active');
  if(writing.length>1&&active(b)){rows.push(['code','<span data-mw-state="running">'+globalThis.t.text("plugin-builder.agent-studio.writing-n-n-once",{n:writing.length})+'</span><small class="as-muted"> · '+globalThis.t.text("plugin-builder.agent-studio.each-edits-only-its-own-files")+'</small>']);}
  const c=writing.length>1&&active(b)?null:last('code',s=>s.action==='implement'&&s.status==='active')||last('code',s=>s.action==='verify');const act=last('code',s=>['file','tool','check'].includes(s.action));
  if(c)rows.push(['code',(c.status==='active'?'<span data-mw-state="running">'+esc(c.label)+'</span>':esc(c.label))+(c.status==='active'&&act?'<small class="as-muted"> · '+esc(act.action==='file'?globalThis.t.text("plugin-builder.agent-studio.write-file",{file:(act.detail||'').slice(0,60)}):act.action==='check'?globalThis.t.text("plugin-builder.agent-studio.self-checking-gates"):act.label)+'</small>':'')]);
  const h=last('host');if(h)rows.push(['host',h.status==='active'?'<span data-mw-state="running">'+esc(h.label)+'</span>':esc(h.label)]);
  return rows.length?'<div class="as-agents">'+rows.map(([a,t])=>'<div class="as-agent" data-agent="'+a+'"><b>'+AGENT[a]+'</b><span>'+t+'</span></div>').join('')+'</div>':'';}
 function renderFeed(){
  const b=current,parts=[];
  if(!b){parts.push('<h2>'+globalThis.t.text("plugin-builder.agent-studio.let-s-build-idea-together")+'</h2><p class="as-muted">'+globalThis.t.text("plugin-builder.agent-studio.tell-me-what-kind-plugin-want-who-uses")+'</p><div class="as-examples">'+EXAMPLES.map(([t,d])=>'<button type="button" class="as-example" data-as-example="'+esc(d)+'"><b>'+esc(t)+'</b><span class="as-muted as-small">'+esc(d)+'</span></button>').join('')+'</div><p class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.example-only-fills-input-box-nothing-starts-itself")+'</p>');
   if(state.builds.length)parts.push('<div class="as-recent"><h3 class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.continue-earlier-plugin")+'</h3>'+state.builds.slice(0,6).map(x=>'<button type="button" class="as-recent-item" data-as-open="'+esc(x.id)+'"><b>'+esc(x.design?.title||x.title)+'</b><span class="as-phase" data-phase="'+esc(x.phase)+'">'+esc(phaseOf(x))+'</span><small>'+esc(x.brief)+'</small></button>').join('')+'</div>');}
  else{
   parts.push('<div class="as-brief"><span>'+globalThis.t.text("plugin-builder.agent-studio.request")+'</span><p>'+esc(b.brief)+'</p></div>');
   for(const m of b.messages.slice(1))parts.push('<div class="as-brief"><span>'+globalThis.t.text(m.role==='user'?"plugin-builder.agent-studio.added":"plugin-builder.agent-studio.lead-designer")+'</span><p>'+esc(m.text)+'</p></div>');
   if(b.questions.length)parts.push('<div class="as-card as-decision"><h3>'+globalThis.t.text("plugin-builder.agent-studio.questions-lead-designer-n",{n:b.questions.length})+'</h3><ol>'+b.questions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ol><p class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.answer-box-below-questions-asked-turn-only")+'</p></div>');
   if(b.phase==='choosing'&&b.candidates.length)parts.push('<div><h3 class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.proposals-n-pick-one-preview-right",{n:b.candidates.length})+'</h3><div class="as-candidates">'+b.candidates.map(c=>candidateHtml(c,c.id===(preview||b.candidates[0].id))).join('')+'</div>'+(()=>{const c=b.candidates.find(x=>x.id===(preview||b.candidates[0].id));return c?'<div class="as-card" style="margin-top:12px">'+mockupHtml(c,true)+'<h3>'+globalThis.t.text("plugin-builder.agent-studio.how-title-used",{title:esc(c.title)})+'</h3><p>'+c.journey.map(esc).join(' → ')+'</p><p class="as-small as-muted" style="margin-top:8px">'+globalThis.t.text("plugin-builder.agent-studio.will-use-what",{what:esc(effects(c))})+'</p>'+(toEnable(c).length?'<p class="as-small" style="margin-top:8px">'+globalThis.t.text("plugin-builder.agent-studio.proposal-needs-names-which-not-enabled-project-yet",{names:toEnable(c).map(t=>Q(esc(t))).join(globalThis.t.text("common.list.separator"))})+'</p>':'')+'<div class="as-actions"><button type="button" class="as-button as-primary" data-as-choose="'+esc(c.id)+'">'+globalThis.t.text("plugin-builder.agent-studio.use-proposal-start-building")+'</button></div></div>':'';})()+'</div>');
   if(!b.design&&b.chosen&&b.active?.stage==='detail'){const c=b.candidates.find(x=>x.id===b.chosen);if(c)parts.push('<div class="as-card"><h3>'+globalThis.t.text("plugin-builder.agent-studio.using-name",{name:esc(c.title)})+'</h3><p class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.lead-designer-completing-feature-contract-ui-parts-acceptance")+'</p></div>');}
   if(b.design)parts.push('<div class="as-card"><h3>'+globalThis.t.text("plugin-builder.agent-studio.lead-design-title",{title:esc(b.design.title)})+'</h3><p class="as-small">'+b.design.journey.map(esc).join(' → ')+'</p><ul class="as-ops">'+b.design.contract.operations.map(op=>'<li><span>'+esc(op.description||op.id)+' <code>'+esc(op.id)+'</code>'+opNote(b,op)+'</span>'+opState(b,op)+'</li>').join('')+'</ul>'+(b.notes?.length?'<p class="as-small as-muted" style="margin-top:8px">'+globalThis.t.text("plugin-builder.agent-studio.tidied-host-notes",{notes:b.notes.slice(0,6).map(esc).join(globalThis.t.text("common.list.separator"))})+'</p>':'')+'</div>');
   const ag=agents(b);if(ag)parts.push(ag);
   if(b.pendingPlugins?.length)parts.push('<div class="as-card as-decision"><h3>'+globalThis.t.text("plugin-builder.agent-studio.proposal-needs-plugins-that-not-enabled-project")+'</h3><ul class="as-ops">'+b.pendingPlugins.map(p=>'<li><span><b>'+esc(p.title)+'</b> · '+esc(p.capabilities.join(globalThis.t.text("common.list.separator")))+'</span></li>').join('')+'</ul><p class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.once-enabled-they-appear-project-plugin-can-use")+'</p><div class="as-actions"><button type="button" class="as-button as-primary" data-as-action="enable-plugins">'+icon('check')+globalThis.t.text("plugin-builder.agent-studio.enable-continue")+'</button><button type="button" class="as-button" data-as-action="skip-plugins">'+globalThis.t.text("plugin-builder.agent-studio.don-t-use-change-proposal")+'</button></div></div>');
   if(b.pendingPart){const part=b.design?.parts.find(p=>p.id===b.pendingPart.id);parts.push('<div class="as-card as-decision"><h3>'+globalThis.t.text("plugin-builder.agent-studio.choose-component-purpose",{purpose:esc(part?.purpose||b.pendingPart.id)})+'</h3><p class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.reason-components-already-placed-not-affected",{reason:esc(b.pendingPart.reason)})+'</p><div class="as-actions">'+b.pendingPart.candidates.map(k=>'<button type="button" class="as-button" data-as-part="'+esc(k)+'">'+esc(componentName(k))+'</button>').join('')+'</div></div>');}
   if(b.error)parts.push('<div class="as-card as-error"><h3>'+esc(b.phase==='paused'?globalThis.t.text("plugin-builder.agent-studio.paused"):failure(b.error)?.[0]||globalThis.t.text("plugin-builder.agent-studio.step-did-not-finish"))+'</h3><p>'+(b.phase!=='paused'&&failure(b.error)?esc(failure(b.error)[1])+'</p><details class="as-small as-muted"><summary>'+globalThis.t.text("plugin-builder.agent-studio.technical-details")+'</summary><p>'+esc(b.error)+'</p></details>':esc(b.error)+'</p>')+'<div class="as-actions">'+(!active(b)?'<button type="button" class="as-button as-primary" data-as-action="resume">'+icon('play')+globalThis.t.text("plugin-builder.agent-studio.continue")+'</button>':'')+(b.history.length&&!active(b)?'<button type="button" class="as-button" data-as-action="undo">'+icon('undo')+globalThis.t.text("plugin-builder.agent-studio.undo-last-revision")+'</button>':'')+'</div></div>');
   if(b.design){const scope=b.runtimeScope||'project',fixed=versions.length>0;parts.push('<div class="as-card"><h3>'+globalThis.t.text("plugin-builder.agent-studio.publish")+'</h3><div class="as-actions">'+[['project',globalThis.t.text("plugin-builder.agent-studio.current-project")],['home',globalThis.t.text("plugin-builder.agent-studio.personal-space")]].map(([value,label])=>'<button type="button" class="as-button'+(scope===value?' as-primary':'')+'" data-as-scope="'+value+'" aria-pressed="'+(scope===value)+'"'+(fixed||active(b)||busy?' disabled':'')+'>'+label+'</button>').join('')+'</div><p class="as-small">'+globalThis.t.text(fixed?"plugin-builder.agent-studio.first-release-fixes-scope-create-new-draft-publish":"plugin-builder.agent-studio.changing-scope-requires-checking-existing-code-interface-again")+'</p>'+(!active(b)&&(b.scopeCheckPending||!b.checks.global?.passed||!b.browserResult?.passed||b.checksScope!==b.runtimeScope)?'<button type="button" class="as-button" data-as-action="recheck">'+globalThis.t.text("plugin-builder.agent-studio.check-scope-again")+'</button>':'')+'</div>');}
   if(b.phase==='ready'&&!b.scopeCheckPending&&b.checksScope===b.runtimeScope){const cases=b.browserResult?.cases||[],latest=versions[0],published=latest&&latest.design.contract.revision===b.design.contract.revision&&JSON.stringify(latest.nodes)===JSON.stringify(b.nodes)&&JSON.stringify(latest.design.presentation)===JSON.stringify(b.design.presentation);parts.push('<div class="as-card"><h3>'+globalThis.t.text("plugin-builder.agent-studio.ready-try-2")+'</h3><p class="as-small">'+globalThis.t.text("plugin-builder.agent-studio.features-connected-n-gates-g1-g6-passed-ui",{n:b.connected.length,passed:cases.filter(c=>c.passed).length,total:cases.length})+'</p><div class="as-actions">'+(published?'<span class="as-chip ok" data-mw-state="saved">'+globalThis.t.text("plugin-builder.agent-studio.v-version-current-version",{version:latest.version})+'</span>':'<button type="button" class="as-button as-primary" data-as-action="publish">'+icon('package')+globalThis.t.text("plugin-builder.agent-studio.publish-v-version",{version:(latest?.version||0)+1})+'</button>')+'<button type="button" class="as-button" data-as-tab="try">'+globalThis.t.text("plugin-builder.agent-studio.go-try")+'</button></div>'+installHtml(b)+'</div>');}
   if(active(b))parts.push('<div class="as-controls"><button type="button" class="as-button" data-as-action="pause">'+icon('pause')+globalThis.t.text("plugin-builder.agent-studio.pause-build")+'</button></div>');
   else if(b.phase==='paused'&&!b.error&&!b.pendingPlugins?.length)parts.push('<div class="as-controls"><button type="button" class="as-button as-primary" data-as-action="resume">'+icon('play')+globalThis.t.text("plugin-builder.agent-studio.resume-build")+'</button></div>');
   if(b.steps.length){const done=b.steps.filter(s=>s.status==='done').length,shown=b.steps.slice(-60);parts.push('<details class="as-steps" data-as-steps'+(openSteps??active(b)?' open':'')+'><summary>'+globalThis.t.text("plugin-builder.agent-studio.collaboration-log-steps-done-n",{n:done})+'</summary><ol>'+(b.steps.length>shown.length?'<li class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.earlier-steps-collapsed-n",{n:b.steps.length-shown.length})+'</li>':'')+shown.map(stepHtml).join('')+'</ol></details>');}
  }
  if(b?.visualResult){const v=b.visualResult;parts.push('<div class="as-card"><h3>'+globalThis.t.text(v.structural?"plugin-builder.agent-studio.layout-check-passed-wide-narrow-screens":"plugin-builder.agent-studio.interface-layout-needs-fixing")+'</h3><p>'+globalThis.t.text(v.status==='reviewed'?"plugin-builder.agent-studio.visual-review-done":"plugin-builder.agent-studio.features-verified-visuals-not-reviewed")+'</p>'+v.issues.map(issue=>'<p class="as-small">'+esc(issue)+'</p>').join('')+'</div>');}
  if(notice)parts.push('<div class="as-card as-error" role="alert"><p>'+esc(notice)+'</p></div>');
  const html=parts.join('');if(html===rendered)return;rendered=html;
  feed.innerHTML=html;if(!current)follow?.restore(0);else{if(firstPaint)follow?.resume();follow?.pin();}firstPaint=false;
 }
 function renderHead(){
  $('[data-as-edit-label]').hidden=!(current?.design&&current?.checks?.global?.passed);if($('[data-as-edit-label]').hidden)$('[data-as-edit-mode]').value='message';
  const b=current;$('[data-as-title]').textContent=b?(b.design?.title||b.candidates.find(c=>c.id===b.chosen)?.title||b.title):globalThis.t.text("plugin-builder.agent-studio.new-plugin-2");const phase=$('[data-as-phase]');phase.textContent=b?(b.active?.stage==='detail'?globalThis.t.text("plugin-builder.agent-studio.detailing-proposal"):b.active?.stage==='revise'?globalThis.t.text("plugin-builder.agent-studio.revising"):b.active?.stage==='design'?globalThis.t.text("plugin-builder.agent-studio.working-out-need"):phaseOf(b)):'';phase.dataset.phase=b?.phase||'';phase.hidden=!b;
  root.querySelectorAll('[data-as-tab]').forEach(t=>{t.setAttribute('aria-selected',String(t.dataset.asTab===tab));t.disabled=t.dataset.asTab==='try'&&!(b?.connected.length);});
  if(active(b)||!previousVisual(b))comparePrevious=false;
  canvas.dataset.tab=tab;canvas.toggleAttribute('data-inspectable',!!b?.design&&!active(b));
  $('[data-as-head-actions]').innerHTML=(previousVisual(b)&&!active(b)?'<button type="button" class="as-button" data-as-compare aria-pressed="'+comparePrevious+'">'+globalThis.t.text(comparePrevious?"plugin-builder.agent-studio.back-current-interface":"plugin-builder.agent-studio.view-previous-interface")+'</button><button type="button" class="as-icon" data-as-action="undo" title="'+globalThis.t.text("plugin-builder.agent-studio.undo-last-revision")+'" aria-label="'+globalThis.t.text("plugin-builder.agent-studio.undo-last-revision")+'">'+icon('undo')+'</button>':'')+(b&&!active(b)?'<button type="button" class="as-icon" data-as-remove disabled title="'+globalThis.t.text("plugin-builder.agent-studio.draft-deletion-not-available-yet-full-creation-files")+'" aria-label="'+globalThis.t.text("plugin-builder.agent-studio.delete-draft")+'">'+icon('trash')+'</button>':'');
  const composer=$('[data-as-composer]'),send=composer.querySelector('.as-send');
  input.placeholder=globalThis.t.text(!b?"plugin-builder.agent-studio.describe-plugin-want-example-keep-track-books-i":b.questions.length?"plugin-builder.agent-studio.answer-questions-above":active(b)?"plugin-builder.agent-studio.say-what-change-current-turn-stops-first-then":b.design?"plugin-builder.agent-studio.ask-change-whole-plugin-selected-component":"plugin-builder.agent-studio.add-request");
  send.disabled=busy;
  const t=$('[data-as-target]');const node=target&&b?.nodes.find(n=>n.id===target);t.hidden=!node;t.innerHTML=node?globalThis.t.text("plugin-builder.agent-studio.pointing-name",{name:esc(node.purpose)})+' <button type="button" data-as-untarget aria-label="'+globalThis.t.text("plugin-builder.agent-studio.stop-pointing")+'">'+icon('x')+'</button>':'';
  const model=state.models.find(m=>m.provider_id===state.model?.provider_id&&m.model_id===state.model?.model_id);
  $('[data-as-model-note]').textContent=(model?globalThis.t.text("plugin-builder.agent-studio.lead-designer-code-agent-model",{model:model.label}):globalThis.t.text("plugin-builder.agent-studio.choose-model-used-building"))+' · Jev '+globalThis.t.text(state.selectionAvailable?"plugin-builder.agent-studio.configured":"plugin-builder.agent-studio.not-configured-ui-agent-s-design-used-first");
 }
 function usedSlots(){const used=new Map();for(const el of pluginRoot.querySelectorAll('[data-slot]')){if(el.closest('[hidden]'))continue;const k=({'directory-row':'directory','button-loading-indicator':'spinner','collapsible':'accordion'})[el.dataset.slot]||el.dataset.slot;used.set(k,(used.get(k)||0)+1);}return used;}
 function renderBoard(){if(!lifetime.alive)return;
  const b=current,board=$('[data-as-board]'),panel=$('[data-as-catalog-panel]');board.hidden=!b?.design;if(board.hidden){tip.hidden=true;panel.hidden=true;return;}
  const placed=b.nodes.filter(n=>revealed.has(n.id)),parts=new Map();for(const n of placed)parts.set(n.kind,(parts.get(n.kind)||0)+1);
  const inside=usedSlots(),legal=new Set((b.pendingPart?.candidates||[])),used=c=>parts.get(c.kind)||(c.use!=='part'&&inside.has(c.kind)?1:0);
  const item=c=>{const n=used(c);return '<button type="button" class="as-part" data-kind="'+esc(c.kind)+'"'+(n?' data-used':'')+(c.use==='catalog'&&!n?' data-catalog':'')+(c.kind===picking?' data-picking':'')+(legal.has(c.kind)?' data-legal data-as-part="'+esc(c.kind)+'"':'')+' aria-label="'+esc(componentWord(c.name)+' '+c.catalog+' · '+componentWord(c.description))+'">'+icon(c.icon||'frame')+'<b>'+esc(componentWord(c.name))+'</b>'+(n?'<i class="as-part-check" aria-hidden="true">'+(n>1&&c.use==='part'?n:'✓')+'</i>':'')+'</button>';};
  const total=state.components.length,inUse=state.components.filter(used).length,caps=usedCapabilities(b),directory=(state.capabilities||[]).filter(c=>c.offered);
  const html='<span class="as-board-label">'+icon('frame')+globalThis.t.text("plugin-builder.agent-studio.spec-board")+'<small>'+globalThis.t.text("plugin-builder.agent-studio.placed-placed-planned-use-used-total",{placed:placed.length,planned:b.design.parts.length,used:inUse,total})+'</small></span>'+state.components.filter(c=>c.use==='part').map(item).join('')
   +'<button type="button" class="as-board-more" data-as-catalog="components" aria-expanded="'+(catalogOpen==='components')+'" title="'+globalThis.t.text("plugin-builder.agent-studio.all-components-ui-catalog-2")+'">'+icon('grid')+'<b>'+globalThis.t.text("plugin-builder.agent-studio.all-n",{n:total})+'</b></button>'
   +'<span class="as-board-label as-board-cap">'+icon('zap')+globalThis.t.text("plugin-builder.agent-studio.capability-board")+'<small>'+globalThis.t.text("plugin-builder.agent-studio.connected-done-total-catalog-n",{done:caps.filter(x=>x.done).length,total:caps.length,n:directory.length})+'</small></span>'
   +caps.map(({c,done,ops})=>{const shown=done&&wiredCaps.has(c.id),busy=wiring===c.id||!done&&active(b)&&b.steps.some(s=>s.agent==='code'&&s.action==='implement'&&s.status==='active'&&ops.includes(s.operationId));
     return '<button type="button" class="as-part as-cap" data-cap="'+esc(c.id)+'"'+(shown?' data-used':'')+(busy?' data-wiring':'')+' aria-label="'+esc(c.title+'：'+(c.description||'')+(busy?globalThis.t.text("plugin-builder.agent-studio.being-connected"):''))+'">'+icon(CAP_ICON[c.source?.kind]||'zap')+'<b>'+esc(c.title)+'</b>'+(shown?'<i class="as-part-check" aria-hidden="true">✓</i>':'')+'</button>';}).join('')
   +'<button type="button" class="as-board-more" data-as-catalog="capabilities" aria-expanded="'+(catalogOpen==='capabilities')+'" title="'+globalThis.t.text("plugin-builder.agent-studio.capability-catalog-platform-installed-plugins-mcp-connectors")+'">'+icon('grid')+'<b>'+globalThis.t.text("plugin-builder.agent-studio.all-n",{n:directory.length})+'</b></button>';
  if(board.dataset.html!==html){board.innerHTML=html;board.dataset.html=html;}
  panel.hidden=!catalogOpen;
  let body='';
  if(catalogOpen==='components')body='<p class="as-catalog-note">'+globalThis.t.text("plugin-builder.agent-studio.spec-board-ui-catalog-ui-catalog-components-use")+'</p>'+GROUPS.map(g=>{const list=state.components.filter(c=>c.group===g);return '<section><h4><span>'+g+'</span><span>'+list.filter(used).length+'/'+list.length+'</span></h4><div>'+list.map(item).join('')+'</div></section>';}).join('');
  if(catalogOpen==='capabilities'){const usedIds=new Set(caps.map(x=>x.c.id)),row=c=>'<div class="as-cap-row"'+(usedIds.has(c.id)?' data-used':'')+(c.offered===false?' data-off':'')+' title="'+esc(c.description||'')+'"><b>'+esc(c.title)+'</b><span class="as-chip">'+globalThis.t.text(c.effect==='read'?"plugin-builder.agent-studio.read-2":c.effect==='write'?"plugin-builder.agent-studio.write":"plugin-builder.agent-studio.irreversible")+'</span><small>'+esc(c.offered===false?c.reason||'':(c.source?.title||'')+' · '+c.id)+'</small></div>';
   const all=state.capabilities||[],off=all.filter(c=>c.offered===false);
   body='<p class="as-catalog-note">'+globalThis.t.text("plugin-builder.agent-studio.capability-board-project-s-unified-capability-catalog-read")+'</p>'+CAP_SOURCES.map(([k,name])=>{const list=all.filter(c=>c.offered&&c.installed!==false&&c.source?.kind===k);return '<section><h4><span>'+name+'</span><span>'+list.length+'</span></h4><div class="as-cap-list">'+(list.map(row).join('')||'<small class="as-muted">'+globalThis.t.text("plugin-builder.agent-studio.none")+'</small>')+'</div></section>';}).join('')
    +(()=>{const idle=all.filter(c=>c.offered&&c.installed===false);return idle.length?'<section><h4><span>'+globalThis.t.text("plugin-builder.agent-studio.plugins-not-enabled-asked-before-one-used")+'</span><span>'+idle.length+'</span></h4><div class="as-cap-list">'+idle.map(row).join('')+'</div></section>':'';})()
    +(off.length?'<section><h4><span>'+globalThis.t.text("plugin-builder.agent-studio.not-offered-plugins")+'</span><span>'+off.length+'</span></h4><div class="as-cap-list">'+off.map(row).join('')+'</div></section>':'');}
  if(catalogOpen&&panel.dataset.html!==body){panel.innerHTML=body;panel.dataset.html=body;}
 }
 const tip=$('[data-as-tip]');
 const partTitle=(node)=>pluginRoot.querySelector('[data-component-id="'+CSS.escape(node.id)+'"] [data-pc-title]')?.textContent||node.purpose;
 function showTip(button){
  if(button.dataset.cap){const cap=capabilityOf(button.dataset.cap),use=usedCapabilities(current).find(x=>x.c.id===cap.id);tip.innerHTML='<b>'+esc(cap.title)+' · '+esc(cap.source?.title||globalThis.t.text("plugin-builder.agent-studio.platform"))+'</b><p>'+esc(cap.description||'')+'</p><p>'+esc(globalThis.t.text(cap.effect==='read'?"plugin-builder.agent-studio.read-only":"plugin-builder.agent-studio.writes-authorise-install-time-stand-used-during-trial"))+'</p>'+(use?'<ul>'+use.ops.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ul>':'')+(()=>{const s=[...(current?.steps||[])].reverse().find(x=>x.agent==='design'&&x.action==='place'&&x.selection?.choice===cap.id)?.selection;return s&&s.candidates.length>1?'<p>'+selection(s)+' '+globalThis.t.text("plugin-builder.agent-studio.chosen-names",{names:s.candidates.map(capabilityTitle).map(esc).join(globalThis.t.text("common.list.separator"))})+'</p>':'';})();
   const area=canvas.getBoundingClientRect(),box=button.getBoundingClientRect();tip.style.left=Math.round(Math.max(8,Math.min(area.width-240,box.left-area.left+box.width/2-116)))+'px';tip.hidden=false;return;}
  const c=state.components.find(x=>x.kind===button.dataset.kind);if(!c)return;const used=(current?.nodes||[]).filter(n=>n.kind===c.kind&&revealed.has(n.id));
  tip.innerHTML='<b>'+esc(componentWord(c.name))+' · '+esc(c.catalog)+'</b><p>'+esc(componentWord(c.description))+'</p><p>'+esc(globalThis.t.text(c.use==='part'?"plugin-builder.agent-studio.can-be-placed-plugin-component":c.use==='inside'?"plugin-builder.agent-studio.used-inside-components-fields-filters-status-hints":"plugin-builder.agent-studio.ui-catalog-generated-plugins-do-not-use-yet"))+'</p>'+(used.length?'<ul>'+used.map(n=>'<li>'+esc(partTitle(n))+'</li>').join('')+'</ul>':'')+(button.hasAttribute('data-legal')?'<p class="as-tip-legal">'+globalThis.t.text("plugin-builder.agent-studio.click-use-component")+'</p>':'');
  const area=canvas.getBoundingClientRect(),box=button.getBoundingClientRect();tip.style.left=Math.round(Math.max(8,Math.min(area.width-240,box.left-area.left+box.width/2-116)))+'px';tip.hidden=false;}
 let lastView='',comparePrevious=false;
 const previousVisual=b=>b?.design&&b.history.at(-1)?.design?.contract.revision===b.design.contract.revision?b.history.at(-1):null;
 async function renderCanvas(){
  const b=current;let view=null;
  if(b?.design)view={contract:b.design.contract,nodes:b.nodes,connected:b.connected,presentation:b.design.presentation,authoringWords:b.design.localePacks};
  else if(b?.candidates.length&&(b.phase==='choosing'||b.active?.stage==='detail')){const c=b.candidates.find(x=>x.id===(b.chosen||preview||b.candidates[0].id))||b.candidates[0];const kind=p=>(state.components.find(x=>x.use==='part'&&x.intents[0]===p.intent)||state.components.find(x=>x.use==='part'&&x.intents.includes(p.intent))||{}).kind||'card';view={contract:c.preview.contract,nodes:c.preview.parts.map(p=>({...p,kind:kind(p)})),connected:[]};}
  if(comparePrevious&&previousVisual(b)){const before=previousVisual(b);view={contract:before.design.contract,nodes:before.nodes,connected:before.connected,presentation:before.design.presentation,authoringWords:before.design.localePacks};}
  pluginRoot.inert=comparePrevious;pluginRoot.setAttribute('aria-label',globalThis.t.text(comparePrevious?"plugin-builder.agent-studio.previous-interface-read-only-comparison":"plugin-builder.agent-studio.current-interface"));
  empty.hidden=!!view&&view.nodes.length>0;pluginRoot.hidden=!view||!view.nodes.length;
  if(!b)empty.innerHTML='<h2>'+globalThis.t.text("plugin-builder.agent-studio.plugin-will-appear-here")+'</h2><p>'+globalThis.t.text("plugin-builder.agent-studio.once-proposal-chosen-ui-agent-takes-components-one")+'</p>';
  else if(!view)empty.innerHTML='<div class="as-skeleton" aria-label="'+globalThis.t.text("plugin-builder.agent-studio.working-out-need-2")+'"><div style="width:40%"></div><div class="tall"></div><div></div><div style="width:70%"></div></div><p style="margin-top:16px">“'+esc(b.brief.slice(0,120))+'”</p>';
  else if(!view.nodes.length)empty.innerHTML=b.pendingPlugins?.length?'<p>'+globalThis.t.text("plugin-builder.agent-studio.waiting-decide-whether-enable-names-ui-agent-starts",{names:b.pendingPlugins.map(p=>Q(esc(p.title))).join(globalThis.t.text("common.list.separator"))})+'</p>':'<p>'+globalThis.t.text(active(b)?"plugin-builder.agent-studio.ui-agent-picking-first-component-spec-board":"plugin-builder.agent-studio.no-components-have-been-placed-yet")+'</p>';
  if(b?.design)stage(b);
  const key=view?JSON.stringify(view):'';if(view&&key!==lastView){lastView=key;await plugin.update(view);lifetime.assertCurrent();}
  decorate();
 }
 function stage(b){const ids=b.nodes.map(n=>n.id);queue=queue.filter(id=>ids.includes(id));stageWires(b);
  if(tab!=='build'||document.hidden){ids.forEach(id=>revealed.add(id));queue=[];return;}
  for(const id of ids)if(!revealed.has(id)&&!queue.includes(id)&&id!==landing)queue.push(id);
  if(queue.length&&!playing)void play().catch(backgroundError);}
 function stageWires(b){for(const {c,done,ops} of usedCapabilities(b)){if(!done||wiredCaps.has(c.id)||wires.some(w=>w.cap===c.id))continue;
   if(tab!=='build'||document.hidden)wiredCaps.add(c.id);else wires.push({cap:c.id,title:c.title,ops});}
  if(wires.length&&!wiringPlay)void playWires().catch(backgroundError);}
 async function playWires(){while(playing)await wait(150);if(wiringPlay)return;wiringPlay=true;const token=playToken,code=$('[data-as-pointer="code"]'),frameEl=$('[data-as-frame]');
  try{while(wires.length&&token===playToken){
   if(tab!=='build'||document.hidden){wires.forEach(w=>wiredCaps.add(w.cap));wires=[];break;}
   const w=wires[0];wiring=w.cap;renderBoard();const chip=$('[data-as-board] .as-cap[data-cap="'+CSS.escape(w.cap)+'"]');
   if(chip){chip.scrollIntoView({block:'nearest',inline:'center'});aim(code,chip,globalThis.t.text("plugin-builder.agent-studio.take-capability-name",{name:w.title}),'above');await wait(620);click(code);await wait(240);}
   if(token!==playToken)break;
   const node=current?.nodes.find(n=>revealed.has(n.id)&&w.ops.some(o=>n.read?.operationId===o||n.submit?.operationId===o)),host=node&&Object.values(node.submit?.input||{}).find(v=>v.source==='selection')?.componentId;
   const el=node&&(partEl(node.id)||host&&partEl(host));
   if(el){const view=scroll.getBoundingClientRect(),box=el.getBoundingClientRect();if(box.top<view.top+40||box.bottom>view.bottom-90){el.scrollIntoView({block:'center',behavior:'smooth'});await wait(380);}
    frameAt(el,'landing',AGENT.code+' · '+w.title);aim(code,el,globalThis.t.text("plugin-builder.agent-studio.connect-name",{name:w.title}),'right');await wait(680);click(code);}
   if(token!==playToken)break;
   wires.shift();wiredCaps.add(w.cap);wiring=null;renderBoard();const done=$('[data-as-board] .as-cap[data-cap="'+CSS.escape(w.cap)+'"]');done?.setAttribute('data-as-arrive','');lifetime.timeout(()=>done?.removeAttribute('data-as-arrive'),700);
   if(el)frameAt(el,'placed',AGENT.code+' · '+globalThis.t.text("plugin-builder.agent-studio.connected-name",{name:w.title}));await wait(560);frameEl.hidden=true;
  }}finally{wiringPlay=false;wiring=null;code.hidden=true;if(!playing)frameEl.hidden=true;renderBoard();}}
 const wait=ms=>lifetime.delay(ms);
 const withBuild=id=>{const here=page.address();if(id)here.searchParams.set('build',id);else here.searchParams.delete('build');return here;};
const partEl=id=>{const el=id&&pluginRoot.querySelector('[data-component-id="'+CSS.escape(id)+'"]');if(!el)return null;if(el.hidden)return pluginRoot.querySelector('[data-pc-action="'+CSS.escape(id)+'"]');const box=el.getBoundingClientRect();return box.width&&box.height?el:pluginRoot.querySelector('[data-pc-open="'+CSS.escape(id)+'"]')||el;};
 function click(pointer){pointer.removeAttribute('data-click');void pointer.offsetWidth;pointer.setAttribute('data-click','');}
 async function play(){playing=true;const token=++playToken,ui=$('[data-as-pointer="ui"]'),frameEl=$('[data-as-frame]');
  try{while(wiringPlay)await wait(150);while(queue.length&&token===playToken){
   if(tab!=='build'||document.hidden){queue.forEach(id=>revealed.add(id));queue=[];break;}
   const id=queue[0],node=current?.nodes.find(n=>n.id===id);if(!node){queue.shift();continue;}
   const name=componentName(node.kind),step=[...current.steps].reverse().find(s=>s.agent==='ui'&&s.target===id),by=step?.selection?.source==='jev'?' · Jev '+globalThis.t.text("plugin-builder.agent-studio.value-1-n",{n:step.selection.candidates.length}):step?.selection?.source==='user'?' · '+globalThis.t.text("plugin-builder.agent-studio.pick"):'';
   picking=node.kind;renderBoard();const part=$('[data-as-board] [data-kind="'+CSS.escape(picking)+'"]');
   if(part){part.scrollIntoView({block:'nearest',inline:'center'});aim(ui,part,globalThis.t.text("plugin-builder.agent-studio.take-name",{name})+by,'above');await wait(620);click(ui);await wait(240);}
   if(token!==playToken)break;
   queue.shift();landing=id;decorate();const el=partEl(id);
   if(el){const view=scroll.getBoundingClientRect(),box=el.getBoundingClientRect();if(box.top<view.top+40||box.bottom>view.bottom-90){el.scrollIntoView({block:'center',behavior:'smooth'});await wait(380);}
    frameAt(el,'landing','UI Agent · '+name);aim(ui,el,globalThis.t.text("plugin-builder.agent-studio.place-name",{name:partTitle(node)||name}),'corner');await wait(680);click(ui);}
   landing=null;picking=null;revealed.add(id);renderBoard();decorate();
   const placed=partEl(id);if(placed){const root=placed.closest('[data-component-id]');root?.setAttribute('data-as-arrive','');lifetime.timeout(()=>root?.removeAttribute('data-as-arrive'),700);frameAt(placed,'placed','UI Agent · '+name);}
   await wait(560);frameEl.hidden=true;
  }}finally{if(token===playToken){playing=false;landing=null;picking=null;frameEl.hidden=true;renderBoard();decorate();if(wires.length&&!wiringPlay)void playWires().catch(backgroundError);}}}
 function frameAt(el,mode,label){if(!lifetime.alive)return;const f=$('[data-as-frame]'),box=el.getBoundingClientRect(),area=scroll.getBoundingClientRect(),was=f.hidden;f.hidden=false;f.dataset.mode=mode;f.querySelector('span').textContent=label;
  if(was)f.style.transition='none';f.style.transform='translate('+Math.round(box.left-area.left+scroll.scrollLeft-6)+'px,'+Math.round(box.top-area.top+scroll.scrollTop-6)+'px)';f.style.width=Math.round(box.width+12)+'px';f.style.height=Math.round(box.height+12)+'px';if(was){void f.offsetWidth;f.style.transition='';}}
 function decorate(){if(!lifetime.alive)return;
  const b=current;const nodes=[...pluginRoot.querySelectorAll('[data-component-id]')];
  for(const el of nodes){const id=el.dataset.componentId;el.toggleAttribute('data-as-target',id===target);
   el.toggleAttribute('data-as-queued',queue.includes(id));el.toggleAttribute('data-as-landing',landing===id);
   const node=b?.nodes.find(n=>n.id===id),ops=[node?.read?.operationId,node?.submit?.operationId].filter(Boolean),wired=ops.length&&ops.every(o=>b.connected.includes(o));
   if(wired&&!seenWired.has(id)){seenWired.add(id);if(tab==='build'){el.setAttribute('data-as-wired','');lifetime.timeout(()=>el.removeAttribute('data-as-wired'),1700);}}}
  pointers();
 }
 function aim(pointer,el,label,where){const box=el?.getBoundingClientRect();if(!box||!box.width&&!box.height){pointer.hidden=true;return;}const area=scroll.getBoundingClientRect(),em=pointer.querySelector('em');em.textContent=label||'';em.hidden=!label;
  const was=pointer.hidden;pointer.hidden=false;const left=box.left-area.left+scroll.scrollLeft,top=box.top-area.top+scroll.scrollTop,width=Math.max(pointer.offsetWidth,140);
  let x=where==='above'?left+box.width/2-6:where==='right'?left+box.width-28:left+Math.min(box.width*.62,box.width-40),y=where==='above'?top-62:where==='right'?top+Math.min(box.height*.5,44):top+12;
  x=Math.max(scroll.scrollLeft+6,Math.min(x,scroll.scrollLeft+area.width-width-12));
  if(was)pointer.style.transition='none';pointer.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';if(was){void pointer.offsetWidth;pointer.style.transition='';}}
 function pointers(){if(!lifetime.alive)return;
  const b=current,ui=$('[data-as-pointer="ui"]'),code=$('[data-as-pointer="code"]');
  if(!b?.design||tab!=='build'){ui.hidden=true;code.hidden=true;$('[data-as-frame]').hidden=true;return;}
  if(!playing){
   const lastUi=[...b.steps].reverse().find(s=>s.agent==='ui');
   if(b.pendingPart)aim(ui,$('[data-as-board] [data-legal]'),globalThis.t.text("plugin-builder.agent-studio.waiting-pick-component"),'above');
   else if(active(b)&&lastUi?.status==='active')aim(ui,$('[data-as-board] .as-board-label'),globalThis.t.text(state.selectionAvailable?"plugin-builder.agent-studio.jev-picking-next-component":"plugin-builder.agent-studio.picking-next-component-spec-board"),'above');
   else if(active(b)&&lastUi?.target&&revealed.has(lastUi.target))aim(ui,partEl(lastUi.target),lastUi.label.slice(0,18),'corner');
   else ui.hidden=true;}
  const writing=active(b)&&[...b.steps].reverse().find(s=>s.agent==='code'&&s.action==='implement'&&s.status==='active');
  const bound=writing&&b.nodes.find(n=>revealed.has(n.id)&&(n.read?.operationId===writing.operationId||n.submit?.operationId===writing.operationId));
  if(wiringPlay)return;if(bound)aim(code,partEl(bound.id),globalThis.t.text("plugin-builder.agent-studio.writing-id",{id:writing.operationId}),'right');else code.hidden=true;
 }
 function renderAll(){if(!lifetime.alive)return;renderHead();renderFeed();root.querySelectorAll('[data-mockup-src]').forEach(el=>{const path=el.dataset.mockupSrc;delete el.dataset.mockupSrc;if(host.loadMedia)host.loadMedia(el,path);else el.src=path;});renderBoard();void renderCanvas().catch(backgroundError);
  const s=$('[data-as-status]'),b=current;s.innerHTML='<span>'+(!b?'':active(b)?globalThis.t.text(b.active.stage==='design'?"plugin-builder.agent-studio.lead-designer-working":"plugin-builder.agent-studio.ui-agent-code-agent-working-together"):b.phase==='ready'?globalThis.t.text("plugin-builder.agent-studio.all-features-connected-can-try-publish"):b.phase==='clarifying'?globalThis.t.text("plugin-builder.agent-studio.waiting-answers"):b.phase==='choosing'?globalThis.t.text("plugin-builder.agent-studio.waiting-choose-proposal"):b.pendingPart?globalThis.t.text("plugin-builder.agent-studio.waiting-choose-component"):b.pendingPlugins?.length?globalThis.t.text("plugin-builder.agent-studio.waiting-decide-whether-enable-plugins"):PHASE[b.phase]||'')+'</span><span>'+(b?.connected.length?globalThis.t.text("plugin-builder.agent-studio.connected-done-total-total-input-kept",{done:b.connected.length,total:b.design?.contract.operations.length||0}):'')+'</span>';}
 function schedule(){if(frame||!lifetime.visible)return;const paint=()=>{frame=0;renderAll();};frame=lifetime.frame(paint);}
 let viewSignal,opening=0,initialized=false;
 const backgroundError=e=>{if(lifetime.alive&&!viewSignal?.aborted){notice=S(e.message);schedule();}};
 function renderBuilds(){const select=$('[data-as-builds]');select.innerHTML='<option value="">'+(state.builds.length?globalThis.t.text("plugin-builder.agent-studio.my-plugins-n",{n:state.builds.length}):globalThis.t.text("plugin-builder.agent-studio.no-plugins-yet"))+'</option>'+state.builds.map(b=>'<option value="'+esc(b.id)+'"'+(b.id===current?.id?' selected':'')+'>'+esc(b.design?.title||b.title)+' · '+esc(phaseOf(b))+'</option>').join('');
  const model=$('[data-as-model]');model.innerHTML=(state.model?'':'<option value="">'+globalThis.t.text("plugin-builder.agent-studio.choose-model")+'</option>')+state.models.map(m=>'<option value="'+esc(m.provider_id+'\n'+m.model_id)+'"'+(m.provider_id===state.model?.provider_id&&m.model_id===state.model?.model_id?' selected':'')+'>'+esc(m.label.endsWith(m.model_id)&&m.label!==m.model_id?m.model_id+' · '+m.label.slice(0,-m.model_id.length).replace(/\s*·\s*$/,''):m.label)+'</option>').join('');
  const setup=$('[data-as-model-setup]');if(setup)setup.hidden=state.models.length>0;}
 function subscribe(id){source?.close();source=null;if(!id||!lifetime.visible)return;const subscribed=source=new EventSource(host.api('/builds/'+id+'/events'));source.onmessage=e=>{if(source!==subscribed||!lifetime.visible)return;const b=JSON.parse(e.data);if(b.id!==current?.id)return;if(b.design?.contract.revision!==current.design?.contract.revision)seenWired=new Set();current=b;
   const listed=state.builds.find(x=>x.id===b.id);if(listed&&(listed.phase!==b.phase||(listed.design?.title||listed.title)!==(b.design?.title||b.title))){Object.assign(listed,{phase:b.phase,title:b.title,design:b.design});renderBuilds();}
   schedule();};}
 async function open(id,signal){const ticket=++opening;comparePrevious=false;target=null;preview=null;rendered='';lastView='';seenWired=new Set();firstPaint=true;tab='build';playToken++;playing=false;queue=[];landing=null;picking=null;revealed=new Set();wiredCaps=new Set();wires=[];wiring=null;
  if(!id){current=null;versions=[];subscribe(null);page.replace(withBuild(null));schedule();return;}
  const v=await api('/builds/'+id,'GET',undefined,signal);if(ticket!==opening)return;current=v.build;versions=v.versions;current.nodes.forEach(n=>revealed.add(n.id));usedCapabilities(current).forEach(x=>{if(x.done)wiredCaps.add(x.c.id);});subscribe(id);page.replace(withBuild(id));renderBuilds();schedule();}
 async function refreshState(signal){state=await api('/state','GET',undefined,signal);renderBuilds();}
 async function run(work){if(busy||!lifetime.alive)return;busy=true;notice='';schedule();try{await work();}catch(e){notice=S(e.message);}finally{busy=false;schedule();}}
 async function act(action,extra={}){const v=await api('/builds/'+current.id+'/action','POST',{action,revision:current.revision,...extra});if(v.build)current=v.build;if(v.release){versions=(await api('/builds/'+current.id)).versions;notice='';}if(v.deleted){await refreshState();await open(null);}}
 lifetime.listen(root,'click',e=>{const el=e.target.closest('button,a');if(!el||!root.contains(el))return;
  if(el.dataset.asOpenPlugin){e.preventDefault();host.openPlugin('app-'+el.dataset.asOpenPlugin);return;}
  if(el.matches('[data-as-model-setup]')){e.preventDefault();host.openSettings('/settings/models');return;}
  if(el.dataset.asExample){input.value=el.dataset.asExample;window.molisFit?.(input);input.focus();return;}
  if(el.dataset.asOpen){run(()=>open(el.dataset.asOpen));return;}
  if(el.hasAttribute('data-as-catalog')){const which=el.dataset.asCatalog||'components';catalogOpen=catalogOpen===which?'':which;tip.hidden=true;renderBoard();return;}
  if(el.dataset.asCandidate){preview=el.dataset.asCandidate;rendered='';schedule();return;}
  if(el.dataset.asChoose){run(()=>act('choose',{candidateId:el.dataset.asChoose}));return;}
  if(el.dataset.asPart){run(()=>act('part',{kind:el.dataset.asPart}));return;}
  if(el.dataset.asScope){run(()=>act('scope',{scope:el.dataset.asScope}));return;}
  if(el.hasAttribute('data-as-plugin-settings')){host.openSettings('/settings/plugins');return;}
  if(el.dataset.asDownload){run(async()=>{const bundle=await api('/builds/'+current.id+'/download?version='+el.dataset.asDownload);await host.download(new Blob([JSON.stringify(bundle)],{type:'application/json'}),current.design.contract.pluginId+'-v'+el.dataset.asDownload+'.json');});return;}
  if(el.dataset.asAction){run(()=>act(el.dataset.asAction));return;}
  if(el.hasAttribute('data-as-compare')){comparePrevious=!comparePrevious;schedule();return;}
  if(el.dataset.asTab){tab=el.dataset.asTab;target=null;if(tab!=='build'){playToken++;playing=false;queue.forEach(id=>revealed.add(id));queue=[];landing=null;picking=null;wires.forEach(w=>wiredCaps.add(w.cap));wires=[];wiring=null;}schedule();return;}
  if(el.hasAttribute('data-as-untarget')){target=null;schedule();return;}
  if(el.dataset.asInstall){const v=versions.find(x=>x.version===Number(el.dataset.asInstall));consent(globalThis.t.text("plugin-builder.agent-studio.install-name-project",{name:current.design?.title||''}),v?.permissions,globalThis.t.text("plugin-builder.agent-studio.install")).then(ok=>{if(ok)run(async()=>{
    const apply=extra=>act('install',{version:v.version,grants:{consent:true,secrets:ok.secrets||[],...extra}});
    try{await apply();}catch(e){
     if(e.code!=='plugin.kept_data_incompatible')throw e;
     const choice=await ask(globalThis.t.text("plugin-builder.agent-studio.install-name",{name:current.design?.title||''}),globalThis.t.text("plugin-builder.agent-studio.when-plugin-was-uninstalled-earlier-its-data-was"),[['discard',globalThis.t.text("plugin-builder.agent-studio.discard-old-data-install-fresh"),true],['cancel',globalThis.t.text("plugin-builder.agent-studio.cancel")]]);
     if(choice!=='discard')return;
     await apply({discardKeptData:true});}
    await refreshState();});});return;}
  if(el.dataset.asUpgrade){const v=versions.find(x=>x.version===+el.dataset.asUpgrade),go=s=>run(async()=>{await act('upgrade',{version:v.version,grants:{consent:true,secrets:s}});await refreshState();});
   if(covered(v?.permissions,installed(current)?.effects))go();else consent(globalThis.t.text("plugin-builder.agent-studio.upgrading-v-version-needs-new-permissions",{version:v.version}),v?.permissions,globalThis.t.text("plugin-builder.agent-studio.confirm-upgrade")).then(ok=>ok&&go(ok.secrets));return;}
  if(el.hasAttribute('data-as-install-enable')){const inst=installed(current);if(inst)run(async()=>{await act('enable',{version:inst.version});await refreshState();});return;}
  if(el.hasAttribute('data-as-uninstall')){const inst=installed(current);if(!inst)return;ask(globalThis.t.text("plugin-builder.agent-studio.uninstall-name",{name:current.design?.title||''}),globalThis.t.text("plugin-builder.agent-studio.after-uninstalling-removed-project-its-saved-data-can"),[['keep',globalThis.t.text("plugin-builder.agent-studio.uninstall-keep-data"),true],['drop',globalThis.t.text("plugin-builder.agent-studio.uninstall-delete-data")],['cancel',globalThis.t.text("plugin-builder.agent-studio.cancel")]]).then(choice=>{if(choice==='keep'||choice==='drop')run(async()=>{await act('uninstall',{version:inst.version,grants:{keepData:choice==='keep'}});await refreshState();host.pluginRemoved('app-'+current.id);});});return;}
  if(el.hasAttribute('data-as-new')){run(()=>open(null));input.focus();}
 });
 lifetime.listen(feed,'click',e=>{const summary=e.target.closest?.('[data-as-steps] > summary');if(summary)openSteps=!summary.parentElement.open;});
 lifetime.listen($('[data-as-builds]'),'change',e=>run(()=>open(e.target.value||null)));
 lifetime.listen($('[data-as-model]'),'change',e=>{const[provider_id,model_id]=e.target.value.split('\n');if(!provider_id)return;run(async()=>{await api('/settings','POST',{provider_id,model_id});await refreshState();});});
 lifetime.listen(document,'molis-work:model-ready',()=>{if(lifetime.visible)void refreshState(viewSignal).then(schedule).catch(backgroundError);});
 lifetime.listen(input,'keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('[data-as-composer]').requestSubmit();}});
 lifetime.listen($('[data-as-composer]'),'submit',e=>{e.preventDefault();const text=input.value.trim();if(!text||busy)return;
  const go=fresh=>run(async()=>{
   if(!current||fresh){const v=await api('/builds','POST',{brief:text});input.value='';window.molisFit?.(input);await refreshState();await open(v.build.id);return;}
   const node=target&&current.nodes.find(n=>n.id===target);await act($('[data-as-edit-mode]').value,{message:node?'［'+node.purpose+'］'+text:text});input.value='';window.molisFit?.(input);target=null;});
  if(current?.design&&!target&&/^(我|帮我|请)?(要|想|需要|来)?(做|建|创建|新建|开发|搭)(一个|个|一款|款)/.test(text))
   ask(globalThis.t.text("plugin-builder.agent-studio.make-new-plugin-change-name",{name:current.design.title}),'“'+text.slice(0,80)+'”',[['new',globalThis.t.text("plugin-builder.agent-studio.make-new-plugin"),true],['modify',globalThis.t.text("plugin-builder.agent-studio.change-name",{name:current.design.title})],['cancel',globalThis.t.text("plugin-builder.agent-studio.cancel")]]).then(choice=>{if(choice==='new')go(true);else if(choice==='modify')go(false);});
  else go(false);});
 lifetime.listen(scroll,'scroll',()=>{if(!playing)pointers();},{passive:true});lifetime.listen(window,'resize',()=>pointers());
 const board=$('[data-as-board]');lifetime.listen(board,'pointerover',e=>{const b=e.target.closest?.('.as-part');if(b)showTip(b);});lifetime.listen(board,'pointerleave',()=>{tip.hidden=true;});
 lifetime.listen(board,'focusin',e=>{const b=e.target.closest?.('.as-part');if(b)showTip(b);});lifetime.listen(board,'focusout',()=>{tip.hidden=true;});
 const catalogPanel=$('[data-as-catalog-panel]');lifetime.listen(catalogPanel,'pointerover',e=>{const b=e.target.closest?.('.as-part');if(b)showTip(b);});lifetime.listen(catalogPanel,'pointerleave',()=>{tip.hidden=true;});
 lifetime.observe(new MutationObserver(()=>{if(!frame&&lifetime.visible)lifetime.frame(()=>decorate());}),pluginRoot,{childList:true,subtree:true});
 lifetime.whenVisible(signal=>{
  viewSignal=signal;
  void (async()=>{
   await refreshState(signal);
   if(!initialized){const id=page.address().searchParams.get('build');await open(id&&state.builds.some(b=>b.id===id)?id:null,signal);initialized=true;}
   else if(current){const id=current.id,ticket=opening,v=await api('/builds/'+id,'GET',undefined,signal);if(current?.id!==id||opening!==ticket)return;current=v.build;versions=v.versions;current.nodes.forEach(n=>revealed.add(n.id));subscribe(id);}
   schedule();
  })().catch(backgroundError);
  return()=>{source?.close();source=null;playToken++;playing=false;wiringPlay=false;landing=null;picking=null;queue=[];wires=[];wiring=null;lifetime.cancelFrame(frame);frame=0;};
 });
}`;

/**
 * The studio as the plugin's own stage in the workbench (specs/artifact-positioning S4): drawn in place, its routes from
 * the host, and the plugin it installed or the model settings opened through the workbench, not a frame's parent.
 * A plugin installed since the page loaded has no entry yet: the workbench is opened again with ?openSurface and opens it.
 * The plugin open in the studio is kept for this browser session (`KEY`), so a reload comes back to it (the address is the workbench's).
 * The browser reads the exact frame provider.
 */
export const AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT = String.raw`(host)=>{
 const client=(` + AGENT_STUDIO_CLIENT_FACTORY_SCRIPT + `),components=` + PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT + `;
 const embedded=host.page?.();
 if(embedded?.mode==='preview'||embedded?.mode==='installed'){client({...host,...embedded,components,api:p=>host.route('/api/plugin-builder/studio')+p});return;}
 const valid=s=>typeof s==='string'&&/^app-[a-f0-9-]{36}$/.test(s);
 const entry=s=>[...document.querySelectorAll('[data-work-surface-open]')].find(el=>el.dataset.workSurfaceOpen===s);
 const openPlugin=s=>{if(!valid(s))return;if(host.openPlugin){host.openPlugin(s);return;}const button=entry(s);if(button){button.click();return;}const next=new URL(location.href);next.searchParams.set('openSurface',s);location.assign(next.pathname+next.search);};
 const pluginRemoved=s=>{if(!valid(s))return;if(host.view?.refreshShell){host.view.refreshShell();return;}entry(s)?.remove();[...document.querySelectorAll('[data-work-surface]')].find(el=>el.dataset.workSurface===s)?.remove();};
 const KEY='molis-work-studio-build:'+(host.projectId?.()||'');
 const page={address:()=>{const here={searchParams:new URLSearchParams()};try{const id=sessionStorage.getItem(KEY);if(id)here.searchParams.set('build',id);}catch{}return here;},
  replace:next=>{try{const id=next.searchParams.get('build');if(id)sessionStorage.setItem(KEY,id);else sessionStorage.removeItem(KEY);}catch{}}};
 client({mountPluginClient:host.mountPluginClient,root:host.root||document.querySelector('[data-work-surface="plugin-builder"]'),mode:'studio',
  api:p=>host.route('/api/plugin-builder/studio')+p,plugin:id=>host.route('/plugins/')+id,
  components,page,openPlugin,pluginRemoved,loadMedia:host.loadMedia,download:host.download,
  openSettings:href=>globalThis.molisWorkOpenExternalUrl?globalThis.molisWorkOpenExternalUrl(href):document.dispatchEvent(new CustomEvent('molis-work:open-settings-path',{detail:{href}}))});
}`;
