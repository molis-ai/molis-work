import type {} from "@molis-ai/molis-work-plugin-sdk";
import { bindMcp } from "./mcp.js";

/**
 * The bundle's entry for the settings pages (standalone, and embedded in a project's settings). The wrapper in
 * src/settings-client.ts puts the plugin's route in front of it as `CODING_SETTINGS_API`; `L` is the page's own translator.
 * Binds Coding's MCP server list. Skills are the shared catalog's, managed in the AI settings (batch 09, 9-4).
 */
function bind(scope: ParentNode) {
  bindMcp(scope);
}

bind(document);
document.addEventListener("molis-work:settings-embed", event => {
  const root: unknown = event instanceof CustomEvent ? (event.detail as { root?: unknown } | null)?.root : null;
  if (root instanceof Element) bind(root);
});
