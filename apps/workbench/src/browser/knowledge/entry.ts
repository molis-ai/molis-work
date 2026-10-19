import { bindKnowledgeImport } from "./import.js";
import { bindKnowledgeSettings } from "./settings-page.js";

/**
 * The bundle's entry: binds every 项目资料 page now, and one the settings cover places later (`molis-work:settings-embed`);
 * and the side panel's import into project knowledge.
 */
const bindAll = (container: ParentNode) => {
  if (container instanceof HTMLElement && container.matches("[data-knowledge-settings]")) bindKnowledgeSettings(container);
  else container.querySelectorAll<HTMLElement>("[data-knowledge-settings]").forEach(bindKnowledgeSettings);
};
const start = () => {
  bindAll(document);
  const side = document.querySelector<HTMLElement>("[data-side-files-root]");
  if (side) bindKnowledgeImport(side);
};
document.addEventListener("molis-work:settings-embed", event => {
  const root = (event as CustomEvent<{ root?: ParentNode }>).detail?.root;
  if (root) bindAll(root);
});
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
