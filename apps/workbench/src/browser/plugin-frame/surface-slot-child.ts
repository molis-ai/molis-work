import type { UiPageView } from "@molis-ai/molis-work-contracts/platform/ui";
import { PRESENTATION_LIMITS } from "@molis-ai/molis-work-contracts/platform/presentation";
import { childPlaces } from "./over-frame.js";
import type { FrameScope, SurfaceSlotDown, SurfaceSlotUp } from "./types.js";

/** The child owns only an empty element and receives no state about the objects in it. */
export function childSurfaceSlots(port: MessagePort, scope: FrameScope): UiPageView<HTMLElement>["surfaceSlot"] {
  let sequence = 0;
  const mounts = new Map<number, { element: HTMLElement; resolve(): void; reject(error: Error): void }>();
  const send = (message: SurfaceSlotUp) => port.postMessage(message);
  const close = (id: number) => {
    const mount = mounts.get(id);
    if (!mount) return;
    mounts.delete(id); places.untrack(id);
    mount.element.style.removeProperty("height");
    mount.reject(new DOMException("Slot closed", "AbortError"));
    send({ type: "surface-slot-close", id });
  };
  const places = childPlaces(scope, (id, box) => send({ type: "surface-slot-layout", id, box }), close);
  scope.own(() => { for (const id of mounts.keys()) close(id); });
  port.addEventListener("message", (event: MessageEvent<SurfaceSlotDown>) => {
    const message = event.data;
    if (message.type !== "surface-slot-ready" && message.type !== "surface-slot-size") return;
    const mount = mounts.get(message.id);
    if (!mount) return;
    if (message.type === "surface-slot-size") mount.element.style.height = Math.max(0, message.height) + "px";
    else if (message.error) { mount.reject(new Error("Surface slot unavailable")); close(message.id); }
    else { mount.resolve(); places.resend(message.id); }
  });
  return (element, options) => {
    if (!scope.alive) return { ready: Promise.reject(new DOMException("Page closed", "AbortError")), dispose() {} };
    for (const [id, old] of mounts) if (old.element === element) close(id);
    if (!Array.isArray(options.subjects) || options.subjects.length > PRESENTATION_LIMITS.values_subjects)
      return { ready: Promise.reject(new Error("Surface slot unavailable")), dispose() {} };
    const id = ++sequence;
    const ready = new Promise<void>((resolve, reject) => {
      mounts.set(id, { element, resolve, reject });
      try { send({ type: "surface-slot-open", id, slot_id: options.slot_id, subjects: options.subjects }); }
      catch { reject(new Error("Surface slot unavailable")); close(id); return; }
      places.track(id, element);
    });
    return { ready, dispose: () => close(id) };
  };
}
