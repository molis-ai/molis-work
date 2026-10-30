import type { FramePack, FrameScope } from "./types.js";

export type PresentationMessage = { type: "presentation"; name: "assistant-message" | "assistant-open" | "assistant-surface-changed" | "placement-result" | "placement-request" | "placement-convert"; value: unknown };

/** Existing declarative links and presentation requests use the same narrow channel as public UI services. */
export function childPresentation(port: MessagePort, scope: FrameScope): void {
  const send = (name: PresentationMessage["name"]) => (event: Event) => port.postMessage({ type: "presentation", name, value: (event as CustomEvent).detail } satisfies PresentationMessage);
  scope.listen(window, "molis:assistant-message", send("assistant-message"));
  scope.listen(document, "molis:assistant-open", send("assistant-open"));
  scope.listen(window, "molis:assistant-surface-changed", send("assistant-surface-changed"));
  scope.listen(window, "molis:placement-convert", send("placement-convert"));
  scope.listen(window, "molis:placement-result", send("placement-result"));
  scope.listen(window, "molis:placement-request", send("placement-request"));
  for (const name of ["input", "pointerdown"]) scope.listen(document, name, () => port.postMessage({type: "interaction"}));
  scope.listen(document, "click", event => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-workbench-item-plugin][data-workbench-item-id]") : null;
    if (!row || event.defaultPrevented) return;
    event.preventDefault();
    port.postMessage({ type: "ui", name: "openItem", args: [row.dataset.workbenchItemPlugin, row.dataset.workbenchItemId, row.dataset.workbenchItemTitle] });
  });
}

/** A child cannot select its source identity or turn a presentation event into an automatic result write. */
export function pagePresentation(scope: FrameScope, frame: HTMLIFrameElement, root: HTMLElement, pack: FramePack, pageId: string) {
  scope.listen(window, "beforeunload", event => {
    if (scope.alive && JSON.parse(root.getAttribute("data-assistant-context") ?? "{}").unsaved === true) {
      event.preventDefault(); (event as BeforeUnloadEvent).returnValue = "";
    }
  });
  return (message: PresentationMessage): void => {
    if (!scope.alive || !message.value || typeof message.value !== "object" || Array.isArray(message.value)) return;
    const json = JSON.stringify(message.value); if (json.length > 100_000) return;
    const detail = JSON.parse(json) as Record<string, unknown>;
    const gesture = scope.visible && document.activeElement === frame && navigator.userActivation.isActive;
    if (message.name === "assistant-message") {
      if (!["background", "change", "suggest", "delegate"].includes(String(detail.purpose))) return;
      // The plugin is the frame's, never what the page says (PG-057: a comment thread's reply is started for it).
      detail.source = { surface: pack.id, title: root.dataset.workSurfaceLabel ?? pack.id, plugin_id: pack.plugin_id };
      if (!gesture) { delete detail.card; if (detail.purpose === "delegate") detail.purpose = "suggest"; }
      window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail }));
    } else if (message.name === "assistant-open" && gesture) {
      detail.source = { surface: pack.id, title: root.dataset.workSurfaceLabel ?? pack.id };
      document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail }));
    } else if (message.name === "assistant-surface-changed") {
      detail.plugin_id = pack.id;
      window.dispatchEvent(new CustomEvent("molis:assistant-surface-changed", { detail }));
    } else if (message.name === "placement-convert" && gesture) {
      detail.page_id = pageId;
      window.dispatchEvent(new CustomEvent("molis:placement-convert", { detail }));
    } else if (message.name === "placement-result") window.dispatchEvent(new CustomEvent("molis:placement-result", { detail }));
    else if (message.name === "placement-request" && gesture) window.dispatchEvent(new CustomEvent("molis:placement-request", { detail }));
  };
}
