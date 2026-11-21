import { renderButton, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/** A CSS string literal for a custom property: whatever could end the string or the attribute is written as a hex escape. */
export const cssString = (value: string) => "'" + value.replace(/[\\'"<>&\n]/g, character => '\\' + character.codePointAt(0)!.toString(16) + ' ') + "'";

/**
 * The agent-built plugin studio: left, the conversation and the real collaboration record; right, the plugin
 * itself, rendered by the host component renderer from the frozen component tree. Everything shown is derived
 * from the build record the host pushes; nothing here advances a build or fakes progress.
 *
 * Studio words come from the exact plugin context. The two CSS badges are projected into custom properties when the
 * stage opens and when its language changes.
 */
export function renderAgentStudio(text: (key: string, values?: Record<string, string | number>) => string = uiText): string {
  const mine = text("plugin-builder.agent-studio.my-plugins"), newPlugin = text("plugin-builder.agent-studio.new-plugin"), edit = text("plugin-builder.agent-studio.apply-changes"), send = text("plugin-builder.agent-studio.send"), codeAgent = text("plugin-builder.agent-studio.code-agent");
  return '<section class="as-shell" data-agent-studio style="--as-idle:' + cssString(text("plugin-builder.agent-studio.not-connected-yet")) + ';--as-wired:' + cssString('✓ ' + text("plugin-builder.agent-studio.connected")) + '">'
    + '<header class="as-top"><div class="as-top-actions"><label class="as-select"><span class="as-sr">' + mine + '</span><select data-as-builds aria-label="' + mine + '"></select></label>'
    + '<button class="as-icon" type="button" data-as-new aria-label="' + newPlugin + '" title="' + newPlugin + '"><svg aria-hidden="true"><use href="#icon-plus"/></svg></button>'
    + '<label class="as-select as-model"><span>' + text("plugin-builder.agent-studio.model") + '</span><select data-as-model aria-label="' + text("plugin-builder.agent-studio.model-used-building") + '"></select></label>'
    + renderButton({ variant: "ghost", className: "as-icon", icon: "sparkles", iconOnly: true,
      label: text("plugin-builder.agent-studio.automation-suggestions"), attrs: { "data-automation-open": true } })
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
    + '<div class="as-pointer as-pointer-ui" data-as-pointer="ui" hidden><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 1l11 7-5 1-2 5z"/></svg><span>' + text("plugin-builder.agent-studio.ui-agent") + '</span><em></em></div>'
    + '<div class="as-pointer as-pointer-code" data-as-pointer="code" hidden><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 1l11 7-5 1-2 5z"/></svg><span>' + codeAgent + '</span><em></em></div></div>'
    + '<div class="as-catalog" data-as-catalog-panel hidden aria-label="' + text("plugin-builder.agent-studio.all-components-ui-catalog") + '"></div><nav class="as-board" data-as-board aria-label="' + text("plugin-builder.agent-studio.spec-board-components-ui-catalog") + '"></nav><div class="as-part-tip" data-as-tip role="tooltip" hidden></div></div>'
    + '<footer class="as-status" data-as-status role="status"></footer></main></section>';
}

