import { renderPluginFrameSurface } from "./plugin-frame.js";
import type { ProjectPluginId } from "@molis-ai/molis-work-contracts/modules/projects";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT, UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { COPY_FEEDBACK_CLIENT_SCRIPT, DROP_ZONE_CLIENT_SCRIPT, FIELD_FIT_CLIENT_SCRIPT, FLOATING_DETAILS_CLIENT_SCRIPT, OVERFLOW_FADE_CLIENT_SCRIPT, ROVING_FOCUS_CLIENT_SCRIPT, SCROLL_FOLLOW_CLIENT_SCRIPT, TIP_CLIENT_SCRIPT, renderIconSprite } from "@molis-ai/molis-work-design-system";
import { renderWorkbenchDocument, WORKBENCH_UI_SLOTS } from "./document-shell.js";
import { pluginSurfaceClients } from "./plugin-workbench.js";
import { sideEntries } from "./plugin-catalog.js";
import { createWorkbenchUiHost } from "./ui-composition.js";
import { SIDE_LINKS_SCRIPT } from "./side-panel.js";
import { homeToolKeysScript } from "./home-plugin-navigation.js";
import { PANE_MESSAGES_SCRIPT, SIDE_FORWARD_SCRIPT } from "./scripts/client/pane-messages.js";
import { CONTEXT_PANE_FACTORY_SCRIPT } from "./scripts/client/context-actions.js";
import { knowledgeClientTag } from "./settings-knowledge.js";

/**
 * One plugin tab of the side panel (specs/archive/side-panel D13): the Host serves the declared `side` view in its own
 * document, which the panel loads in a same-origin frame. The plugin supplies the contribution, its stylesheet and
 * client factory, exactly as for its other views; where the tab sits and how wide it is stay the Host's.
 * The model a side contribution receives is only where it is: `{ project_id, route_prefix, view_id }`.
 */
export interface SideViewModel {
  readonly project_id: string;
  readonly route_prefix: string;
  readonly view_id: string;
  /** The same text primitives every other Workbench surface hands a contribution. */
  readonly primitives: { escape(value: unknown): string; text(value: string, values?: Record<string, string | number>): string };
}

export interface SideViewDocumentInput {
  readonly projectPluginId: string;
  readonly viewId: string;
  readonly projectId: string;
  readonly routePrefix: string;
  readonly enabled: readonly ProjectPluginId[];
  readonly lang: string;
  readonly headHtml: string;
  readonly clientI18nScript: string;
  readonly themeBootstrapScript: string;
  readonly translate: (value: string, values?: Record<string, string | number>) => string;
}

const uiHost = createWorkbenchUiHost();

export function renderSideViewDocument(input: SideViewDocumentInput): string | null {
  const view = sideEntries(input.enabled).find(entry => entry.project_plugin_id === input.projectPluginId && entry.view_id === input.viewId);
  if (!view) return null;
  const surface = uiHost.list().find(descriptor => descriptor.contribution_id === view.contribution_id)?.surfaces
    ?.find(candidate => candidate.target_slot_id === WORKBENCH_UI_SLOTS.side.slot_id);
  if (!surface) return null;
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/gu, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const model: SideViewModel = { project_id: input.projectId, route_prefix: input.routePrefix, view_id: view.view_id, primitives: { escape, text: input.translate } };
  const html = uiHost.mount({ slot: WORKBENCH_UI_SLOTS.side, contribution: { contribution_id: view.contribution_id, surface: surface.surface_id, model } }).html;
  const route = JSON.stringify(input.routePrefix);
  const surfaceClient = pluginSurfaceClients().find(entry => entry.id === input.projectPluginId);
  const client = surfaceClient
    ? `void molisPluginFrames.mount(document.querySelector('[data-deferred-surface]'), {mountPluginClient, translate:L, projectId:()=>${JSON.stringify(input.projectId)}, projectTitle:()=>"", route:path=>${route}+path, side:true}, ${JSON.stringify(surfaceClient ? {id:surfaceClient.id,plugin_id:surfaceClient.plugin_id,bundle:surfaceClient.bundle,assets:surfaceClient.assets} : null)}).catch(error=>molisWorkRequest.show(document.querySelector('[data-side-view-root]'),error));`
    : "";
  return renderWorkbenchDocument({
    lang: input.lang,
    title: `${view.title} · Molis Work`,
    // The workbench's own stylesheet (cached with the page), so a plugin's view looks here as it does on the stage.
    head_html: `<script>${input.themeBootstrapScript}</script>${input.headHtml}<link rel="stylesheet" href="/assets/molis-work-workbench.css"><style>${SIDE_VIEW_STYLES}</style>`,
    body_attributes: { "data-project-id": input.projectId, "data-route-prefix": input.routePrefix, "data-side-view": `${input.projectPluginId}/${view.view_id}` },
    body_html: `${renderIconSprite()}<main class="side-view" data-side-view-root>${surfaceClient ? renderPluginFrameSurface(html, input.projectPluginId, view.title, false) : html}</main>
    <script src="/assets/molis-work-plugin-frame.js"></script>
    <script>${OVERFLOW_FADE_CLIENT_SCRIPT}
${COPY_FEEDBACK_CLIENT_SCRIPT}
${SCROLL_FOLLOW_CLIENT_SCRIPT}
${DROP_ZONE_CLIENT_SCRIPT}
${FIELD_FIT_CLIENT_SCRIPT}
${ROVING_FOCUS_CLIENT_SCRIPT}
${FLOATING_DETAILS_CLIENT_SCRIPT}
${TIP_CLIENT_SCRIPT}
</script>
    <script>${input.clientI18nScript}${UI_REQUEST_CLIENT_SCRIPT}${SIDE_LINKS_SCRIPT}${homeToolKeysScript()}
      const L = globalThis.L;
      // This document is the view's host: the work surface a plugin reuses here waits, hidden, for its host to show it
      // (the workbench's surface manager does that on the stage), and its client only starts once it is visible.
      for (const surface of document.querySelectorAll('[data-side-view-root] > [data-work-surface][hidden]')) surface.hidden = false;
      const mountPluginClient = (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
      ${client}
      ${sideViewBridgeScript(input.routePrefix)}
    </script>${knowledgeClientTag()}`,
  });
}

const SIDE_VIEW_STYLES = `
html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink)}
.icon-sprite{position:absolute;width:0;height:0;overflow:hidden}
.side-view{box-sizing:border-box;height:100dvh;display:flex;font-size:13px;line-height:1.6}.side-view>[data-work-surface]{position:relative;display:flex;flex:1;min-width:0}
`;

/** The same parent protocol serves Runtime Home views and project side views. */
export function sideViewBridgeScript(routePrefix: string): string {
  const route = JSON.stringify(routePrefix);
  return `      // This document and the side panel around it (S-30, the same checks as a split pane): the page events the view may
      // hand up (SIDE_FORWARD_SCRIPT) go to the page; an item the panel was asked to open here comes down as
      // molis:side-target and is handed, as it is, to the view's surface: the view finds it, nobody else reads the id.
      // What the person selects here is in hand as in a split pane (specs/context-program §21.4 W3-C): this document draws
      // the toolbar the top document sends it and sends the choices back, through the same checks.
      {
        const messages = ${PANE_MESSAGES_SCRIPT}, forwarded = ${SIDE_FORWARD_SCRIPT};
        (${CONTEXT_PANE_FACTORY_SCRIPT})({ translate: L, paneMessages: messages, route: path => ${route} + path });
        if (window.parent !== window) for (const name of forwarded.names) addEventListener(name, (event) => {
          try { window.parent.postMessage({ type: "molis:side-forward", name, detail: event.detail }, location.origin); }
          catch { /* a detail that cannot be copied stays in this document */ }
        });
        const surface = document.querySelector("[data-side-view-root] > [data-work-surface]");
        let pendingItem;
        const select = () => {
          if (!surface || surface.hasAttribute("data-deferred-surface") || !pendingItem) return;
          const itemId = pendingItem; pendingItem = null;
          surface.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId } }));
        };
        if (surface) new MutationObserver(select).observe(surface, {attributes:true, attributeFilter:["data-deferred-surface"]});
        addEventListener("message", (event) => {
          if (!messages.fromParent(event) || event.data.type !== "molis:side-target") return;
          const item = event.data.target && event.data.target.item;
          if (typeof item === "string" && item) { pendingItem = item; select(); }
        });
      }`;
}
