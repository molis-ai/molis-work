import type { FrameScope, FrameUp } from "./types.js";

type IntakeRequest = Extract<FrameUp, {type: "context-intake"}>;

/** A control that names a creation entry (`data-context-intake`) sends one bounded request; what the entry makes is the Host's to show. */
export function childIntake(port: MessagePort, scope: FrameScope): void {
  scope.listen(document, "click", event => {
    const control = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-context-intake]") : null;
    if (!control || control.disabled || event.defaultPrevented) return;
    const data = control.dataset, intake = data.contextIntake, id = data.contextId;
    if (!intake || !id) return;
    event.preventDefault();
    port.postMessage({type: "context-intake", intake_id: intake, id, title: data.contextTitle ?? "", text: data.contextText ?? ""} satisfies IntakeRequest);
  });
}

/**
 * A trusted, focused gesture of the page reaches the workbench's own handling of such a control, from the surface that holds the frame:
 * the surface (not the page) says which plugin and which kind of object it is, so the page can only name one of its own.
 */
export function pageIntake(scope: FrameScope, frame: HTMLIFrameElement, root: HTMLElement): (message: IntakeRequest) => void {
  return message => {
    if (!scope.visible || document.activeElement !== frame || !navigator.userActivation.isActive) return;
    if (typeof message.intake_id !== "string" || typeof message.id !== "string" || !message.id || message.id.length > 256) return;
    root.dispatchEvent(new CustomEvent("molis:context-intake", { bubbles: true,
      detail: { intake_id: message.intake_id.slice(0, 40), id: message.id, title: String(message.title ?? "").slice(0, 200), text: String(message.text ?? "").slice(0, 4000) } }));
  };
}
