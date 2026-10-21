import { L } from "./common.js";
import { bindKnowledgeImport } from "./import.js";
import { bindKnowledgePicker } from "./picker.js";
import { bindKnowledgeSettings } from "./settings-page.js";

/**
 * The bundle's entry: binds every 项目资料 page now, and one the settings cover places later (`molis-work:settings-embed`);
 * the side panel's import into project knowledge; and the one picker inputs ask for (`molis-work:knowledge-pick`).
 */
bindKnowledgePicker();
// What the Assistant asked for goes into its strip through its own open request; each piece is read again when the message is sent.
document.addEventListener("molis-work:knowledge-picked", event => {
  const detail = (event as CustomEvent<{ request_id?: string; picks?: Array<{ kind: string; id: string; title: string }> }>).detail;
  if (!detail?.request_id?.startsWith("assistant:") || !detail.picks?.length) return;
  document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail: { source: { surface: "knowledge", title: L("项目资料") },
    materials: detail.picks.map(pick => ({ title: pick.title, subject: { kind: pick.kind, id: pick.id } })) } }));
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
