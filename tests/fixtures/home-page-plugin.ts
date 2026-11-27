import type { Server } from "node:http";
import type { PluginContribution, PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * A Home plugin with a standalone page (`/plugins/<plugin id>`): one main view drawn in the common opaque frame, so the page has a plugin
 * frame and an off switch. No built-in Home plugin has both since batch 108 moved Issues and Jelly to the partitions (Work Brief's Home half
 * draws no view); the standalone-Home-page browser cases (FSS-08, HOME-SET-02, P1-4, RING-05) run on this one until the standalone Home
 * pages go with the Home runtime in batch 109-3.
 */
export const HOME_PAGE_PLUGIN_ID = "com.example.homepage";

export function homePagePlugin(name = "Home page probe"): { id: string; key: string; frame: string; definition: PluginDefinition } {
  const view = `${HOME_PAGE_PLUGIN_ID}.page`;
  const manifest: PluginManifest = { schema_version: 1, host_api_version: 1, plugin_id: HOME_PAGE_PLUGIN_ID, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: "home-page-probe" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [view], views: [{ view_id: "page", slot: "stage", title: name }] }, actions: [] };
  const definition: PluginDefinition = { manifest, start: async (): Promise<PluginContribution> => ({ kind: "app", views: [{
    descriptor: { contribution_id: view, kind: "embedded", label: name, surfaces: [{ surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }], slots: [] },
    render: () => `<section data-home-page-probe><h1>${name}</h1></section>`,
  }] }) };
  // The page and its frame are keyed by the plugin id (a plugin outside the build has no project key).
  return { id: HOME_PAGE_PLUGIN_ID, key: HOME_PAGE_PLUGIN_ID, frame: `iframe[data-plugin-frame="${HOME_PAGE_PLUGIN_ID}"]`, definition };
}

/**
 * Every framed view loads its client bundle (`/assets/molis-work-plugins/<bundle>.js`) and starts the factory it registers; a fixture has no
 * built bundle, so the test server answers that one asset with a stand-in. The stand-in also hands the frame a help declaration (the
 * standalone Home page passes none for a plugin outside the build), so the frame's common Help trigger shows as it does for a built-in.
 */
export function serveHomePageBundle(server: Server): void {
  const path = `/assets/molis-work-plugins/${encodeURIComponent(HOME_PAGE_PLUGIN_ID)}.js`;
  const help = { default_topic: "page", topics: [{ id: "page", title: "Home page probe", sections: [{ id: "what", heading: "What it is", body: "A test page." }] }] };
  const source = `(()=>{const help=document.createElement('script');help.type='application/json';help.dataset.mwHelpDeclaration='';
help.textContent=${JSON.stringify(JSON.stringify(help))};
(globalThis.molisWorkbenchPluginFactories ||= {})[${JSON.stringify(HOME_PAGE_PLUGIN_ID)}]=()=>{document.head.append(help);};})();`;
  const handlers = server.listeners("request"); server.removeAllListeners("request");
  server.on("request", (request, response) => {
    if (request.method === "GET" && request.url === path) {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      response.end(source);
    } else for (const handler of handlers) handler.call(server, request, response);
  });
}
