import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import { AGENT_REVIEW_CLIENT_FACTORY_SCRIPT } from "./scripts/client/agent-review.js";
import { CONTEXT_PANE_FACTORY_SCRIPT } from "./scripts/client/context-actions.js";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { readFileSync } from "node:fs";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { pluginSurfaceClients } from "./plugin-workbench.js";
import { COPY_FEEDBACK_CLIENT_SCRIPT, CRAFT_FINISH_CLIENT_SCRIPT, REFLOW_CLIENT_SCRIPT, SCROLL_FOLLOW_CLIENT_SCRIPT, SHOW_MORE_CLIENT_SCRIPT, STREAM_TEXT_CLIENT_SCRIPT, DROP_ZONE_CLIENT_SCRIPT, FIELD_FIT_CLIENT_SCRIPT, FLOATING_DETAILS_CLIENT_SCRIPT, INPUT_RECEIPTS_CLIENT_SCRIPT, INTERACTION_CLIENT_SCRIPT_TYPED_DATES, MEDIA_ZOOM_CLIENT_SCRIPT, OVERFLOW_FADE_CLIENT_SCRIPT, ROVING_FOCUS_CLIENT_SCRIPT, SELECT_MENU_CLIENT_SCRIPT, STATE_RING_CLIENT_SCRIPT, TIP_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";

/**
 * The sheets a framed plugin brings (PG-070) are linked at the head of its page, so they come in the frame after the workbench sheet
 * its document already links and before any rule of the page itself. The frame's policy allows sheets from /assets/.
 */
function sheetLinks(bundle: string): string {
  const styles = pluginSurfaceClients().find((client) => client.id === bundle)?.styles ?? [];
  return styles.map((name) => `<link rel="stylesheet" href="/assets/molis-work-plugins/${encodeURIComponent(name)}.css">`).join("");
}

/** HTML from a plugin remains inert data until placed in its opaque frame, including closing-script sequences. */
export function renderPluginFrameSurface(html: string, id: string, title: string, hidden = true, settings = false, bundle = id): string {
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="${escapeHtml(id)}" data-work-surface-label="${escapeHtml(title)}"${settings ? ` data-settings-page="${escapeHtml(id)}"` : ""} data-deferred-surface${hidden ? " hidden" : ""}><script type="application/json" data-plugin-document>${JSON.stringify(sheetLinks(bundle) + html).replaceAll("<", "\\u003c")}</script></section>`;
}

let client: string | undefined;

/** Shared UI factories keep their existing owner; only the new bridge is built from typed browser modules. */
export function renderPluginFrameClientScript(): string {
  client ??= readFileSync(new URL("./plugin-frame-client.js", import.meta.url), "utf8");
  return `globalThis.molisFrameFillMessage = ${fillMessage.toString()};
globalThis.molisFrameReviews = (${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT});
globalThis.molisFrameUi = (L) => {
    ${COPY_FEEDBACK_CLIENT_SCRIPT}${CRAFT_FINISH_CLIENT_SCRIPT}${REFLOW_CLIENT_SCRIPT}${SCROLL_FOLLOW_CLIENT_SCRIPT}${SHOW_MORE_CLIENT_SCRIPT}${STREAM_TEXT_CLIENT_SCRIPT}${STATE_RING_CLIENT_SCRIPT}${SELECT_MENU_CLIENT_SCRIPT}${MEDIA_ZOOM_CLIENT_SCRIPT}${DROP_ZONE_CLIENT_SCRIPT}${OVERFLOW_FADE_CLIENT_SCRIPT}${FIELD_FIT_CLIENT_SCRIPT}${ROVING_FOCUS_CLIENT_SCRIPT}${FLOATING_DETAILS_CLIENT_SCRIPT}${TIP_CLIENT_SCRIPT}
    return {surfaceFocus:(${CONTEXT_PANE_FACTORY_SCRIPT}),mountPluginClient:(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})(), interaction:(${INTERACTION_CLIENT_SCRIPT_TYPED_DATES}), receipts:(${INPUT_RECEIPTS_CLIENT_SCRIPT})(L)};
  };
${client}`;
}
