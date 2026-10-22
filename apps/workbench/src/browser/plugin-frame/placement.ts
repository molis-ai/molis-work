import type { FrameDown, FrameScope, FrameUp } from "./types.js";

/** These declared slots contain public labels. Their panels and write controls remain in the trusted document. */
export function childPlacement(port: MessagePort, scope: FrameScope): void {
  const slots = new Map<number, HTMLElement>();
  let sequence = 0, scheduled = 0, last = "";
  const layout = () => {
    scheduled = 0;
    for (const element of document.querySelectorAll<HTMLElement>("[data-placement-slot],[data-placement-target]")) {
      if (![...slots.values()].includes(element) && slots.size < 16) slots.set(++sequence, element);
    }
    const values = [...slots].map(([id, element]) => {
      if (!element.isConnected) { slots.delete(id); return null; }
      const rect = element.getBoundingClientRect();
      return { id, target: element.hasAttribute("data-placement-target"), home: element.dataset.placementScope === "home",
        saved: element.dataset.placementSaved !== "off", box: element.checkVisibility() ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null };
    }).filter(value => value !== null);
    const next = JSON.stringify(values);
    if (next !== last) { last = next; port.postMessage({ type: "placement-slots", slots: values } satisfies FrameUp); }
    scheduled = requestAnimationFrame(layout);
  };
  scope.whenVisible(() => { layout(); return () => { cancelAnimationFrame(scheduled); scheduled = 0; }; });
  scope.listen(port, "message", event => {
    const message = (event as MessageEvent<FrameDown>).data;
    if (message.type !== "placement-label") return;
    const element = slots.get(message.id); if (!element) return;
    element.innerHTML = message.html;
    if (element.hasAttribute("data-placement-target")) element.classList.add("placement-target");
  });
  scope.listen(document, "click", event => {
    const element = event.target instanceof Element ? event.target.closest("[data-placement-slot]") : null;
    const entry = [...slots].find(([, slot]) => slot === element);
    if (entry && !event.defaultPrevented) { event.preventDefault(); port.postMessage({ type: "placement-open", id: entry[0] } satisfies FrameUp); }
  });
}

/** Labels are produced by the existing placement painter under this page's authority, never copied from child HTML. */
export function pagePlacement(port: MessagePort, scope: FrameScope, root: HTMLElement, frame: HTMLIFrameElement) {
  const slots = new Map<number, { node: HTMLElement; html: string }>();
  const publish = () => {
    for (const [id, entry] of slots) if (entry.node.innerHTML !== entry.html) {
      entry.html = entry.node.innerHTML;
      port.postMessage({ type: "placement-label", id, html: entry.html } satisfies FrameDown);
    }
  };
  scope.observe(new MutationObserver(publish), root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "data-kind"] });
  scope.own(() => { for (const entry of slots.values()) entry.node.remove(); slots.clear(); });
  return (message: Extract<FrameUp, { type: "placement-slots" | "placement-open" }>) => {
    if (message.type === "placement-open") {
      if (scope.visible && document.activeElement === frame && navigator.userActivation.isActive) slots.get(message.id)?.node.querySelector<HTMLButtonElement>(".placement-bar")?.click();
      return;
    }
    if (!Array.isArray(message.slots) || message.slots.length > 16) return;
    const kept = new Set<number>();
    for (const value of message.slots) {
      if (!Number.isSafeInteger(value.id) || value.id <= 0) continue;
      kept.add(value.id);
      let entry = slots.get(value.id);
      if (!entry) {
        const node = document.createElement("span"); node.toggleAttribute(value.target ? "data-placement-target" : "data-placement-slot", true);
        if (value.home) node.dataset.placementScope = "home";
        if (!value.saved) node.dataset.placementSaved = "off";
        node.setAttribute("aria-hidden", "true"); node.style.cssText = "position:absolute;opacity:0;pointer-events:none";
        root.append(node); entry = { node, html: "" }; slots.set(value.id, entry);
      }
      const box = value.box;
      if (box && [box.x, box.y, box.width, box.height].every(Number.isFinite)) {
        Object.assign(entry.node.style, { left: Math.max(0, Math.min(frame.clientWidth, box.x)) + "px", top: Math.max(0, Math.min(frame.clientHeight, box.y)) + "px",
          width: Math.max(0, Math.min(frame.clientWidth, box.width)) + "px", height: Math.max(0, Math.min(frame.clientHeight, box.height)) + "px" });
      }
    }
    for (const [id, entry] of slots) if (!kept.has(id)) { entry.node.remove(); slots.delete(id); }
  };
}
