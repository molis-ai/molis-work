import type { ProjectPluginId } from "@molis-ai/molis-work-contracts/modules/projects";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { TYPEFACE_STYLES, VISUAL_FOUNDATION_STYLES, renderIconSprite } from "@molis-ai/molis-work-design-system";
import { renderWorkbenchDocument, WORKBENCH_UI_SLOTS } from "./document-shell.js";
import { BUILTIN_PLUGIN_WORKBENCH } from "./plugin-workbench.js";
import { sideEntries } from "./plugin-catalog.js";
import { createWorkbenchUiHost } from "./ui-composition.js";
import { CONTROL_CLIENT_SCRIPT } from "./scripts/control.js";

/**
 * One plugin tab of the side panel (specs/side-panel D13): the Host serves the declared `side` view in its own
 * document, which the panel loads in a same-origin frame. The plugin supplies the contribution, its stylesheet and
 * client factory, exactly as for its other views; where the tab sits and how wide it is stay the Host's.
 * The model a side contribution receives is only where it is: `{ project_id, route_prefix, view_id }`.
 */
export interface SideViewModel { readonly project_id: string; readonly route_prefix: string; readonly view_id: string }

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
}

const uiHost = createWorkbenchUiHost();

export function renderSideViewDocument(input: SideViewDocumentInput): string | null {
  const view = sideEntries(input.enabled).find(entry => entry.project_plugin_id === input.projectPluginId && entry.view_id === input.viewId);
  if (!view) return null;
  const surface = uiHost.list().find(descriptor => descriptor.contribution_id === view.contribution_id)?.surfaces
    ?.find(candidate => candidate.target_slot_id === WORKBENCH_UI_SLOTS.side.slot_id);
  if (!surface) return null;
  const model: SideViewModel = { project_id: input.projectId, route_prefix: input.routePrefix, view_id: view.view_id };
  const html = uiHost.mount({ slot: WORKBENCH_UI_SLOTS.side, contribution: { contribution_id: view.contribution_id, surface: surface.surface_id, model } }).html;
  const pack = BUILTIN_PLUGIN_WORKBENCH.find(entry => entry.project_plugin_id === input.projectPluginId);
  const route = JSON.stringify(input.routePrefix);
  const client = pack?.clientFactory
    ? `(${pack.clientFactory})({ mountPluginClient, translate: L, projectId: () => ${JSON.stringify(input.projectId)}, projectTitle: () => "", route: path => ${route} + path, side: true });`
    : "";
  return renderWorkbenchDocument({
    lang: input.lang,
    title: `${view.title} · Molis Work`,
    head_html: `<script>${input.themeBootstrapScript}</script>${input.headHtml}<style>${TYPEFACE_STYLES}\n${VISUAL_FOUNDATION_STYLES}\n${pack?.stylesheet ?? ""}\n${SIDE_VIEW_STYLES}</style>`,
    body_attributes: { "data-project-id": input.projectId, "data-route-prefix": input.routePrefix, "data-side-view": `${input.projectPluginId}/${view.view_id}` },
    body_html: `${renderIconSprite()}<main class="side-view" data-side-view-root>${html}</main>
    <script>${input.clientI18nScript}${CONTROL_CLIENT_SCRIPT}
      const L = globalThis.L;
      const mountPluginClient = (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
      ${client}
    </script>`,
  });
}

const SIDE_VIEW_STYLES = `
html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink)}
.icon-sprite{position:absolute;width:0;height:0;overflow:hidden}
.side-view{box-sizing:border-box;min-height:100vh;padding:16px;font-size:13px;line-height:1.6}
`;

/** Every enabled side view's key, for the Host to answer 404 on anything else. */
export function sideViewKeys(enabled: readonly ProjectPluginId[]): string[] {
  return sideEntries(enabled).map(entry => `${entry.project_plugin_id}/${entry.view_id}`);
}

