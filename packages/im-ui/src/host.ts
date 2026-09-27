import { icon } from "@molis-ai/molis-work-design-system";

/** Peer of capture/Assistant; deliberately not a project-installed plugin. */
export function renderImHostEntry(label = "群聊"): string {
  const text = label.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  return `<button class="immersive-plugin-link plugin-rail-item" type="button" data-im-toggle aria-pressed="false" aria-label="${text}" title="${text}">${icon("review")}<span>${text}</span></button>`;
}

/** Compatibility exports. The Workbench owns its split host and Dock entry. */
export const IM_HOST_STYLES = "";
export const IM_HOST_SCRIPT = "";
