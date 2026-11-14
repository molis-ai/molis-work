import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { bindKnowledgeImport } from "./import.js";
import { bindKnowledgePicker } from "./picker.js";
import { bindKnowledgeSettings } from "./settings-page.js";

const uiText = globalThis.t;

/**
 * The bundle's entry: binds every 项目资料 page now, and one the settings cover places later (`molis-work:settings-embed`);
 * the side panel's import into project knowledge; and the one picker inputs ask for (`molis-work:knowledge-pick`).
 */
bindKnowledgePicker();
// What the Assistant asked for goes into its strip through its own open request; each piece is read again when the message is sent:
// a folder file, a quote or a fixed version by its exact reference; another piece of knowledge by its subject, as it is then.
document.addEventListener("molis-work:knowledge-picked", event => {
  const detail = (event as CustomEvent<{ request_id?: string; outcome?: string; items?: Array<{ ref: MaterialRef; title: string; hint?: string }> }>).detail;
  if (!detail?.request_id?.startsWith("assistant:") || detail.outcome !== "confirmed" || !detail.items?.length) return;
  document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail: { source: { surface: "knowledge", title: uiText.text("workbench.knowledge-entry.project-knowledge") },
    materials: detail.items.map(item => {
      const title = item.hint ? item.title + " · " + item.hint : item.title;
      return item.ref.subject.kind === "workspace_file" || item.ref.pin.mode !== "current" || item.ref.range ? { title, ref: item.ref } : { title, subject: item.ref.subject };
    }) } }));
});
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
