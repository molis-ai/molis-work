import type { UiPageMessage, UiPageMessages } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameDown, FrameScope, FrameUp } from "./types.js";

export function childMessages(port: MessagePort): UiPageMessages {
  return {
    send: message => port.postMessage({ type: "page-message", message } satisfies FrameUp),
    listen: receive => {
      const listener = (event: MessageEvent<FrameDown>) => { if (event.data.type === "page-message") receive(event.data.message); };
      port.addEventListener("message", listener); return () => port.removeEventListener("message", listener);
    },
  };
}

/** Only the outer shell's parent can deliver side context; a plugin cannot choose another frame's channel. */
export function pageMessages(port: MessagePort, scope: FrameScope, pluginId: string, side: boolean) {
  const send = (message: UiPageMessage) => port.postMessage({ type: "page-message", message } satisfies FrameDown);
  scope.listen(window, "message", event => {
    const received = event as MessageEvent<UiPageMessage>;
    if (received.source !== parent || received.origin !== location.origin) return;
    if (side && ["molis:side-context", "molis:side-shown", "molis:side-context-result"].includes(received.data?.type)) send(received.data);
    else if (!side && received.data?.type === "molis:side-context-command"
      && (received.data.context as { plugin_id?: string } | undefined)?.plugin_id === pluginId) send(received.data);
  });
  scope.listen(document, "molis:side-context-command", event => {
    const detail = (event as CustomEvent<{ context?: { plugin_id?: string } }>).detail;
    if (!side && detail?.context?.plugin_id === pluginId) send({ ...detail, type: "molis:side-context-command" });
  });
  return (message: UiPageMessage): void => {
    if (!message || typeof message !== "object") return;
    if (side && ["molis:side-ready", "molis:side-context-command"].includes(message.type)) {
      if (parent !== window) parent.postMessage(message, location.origin);
    } else if (message.type === "molis:side-open") {
      if (parent !== window) parent.postMessage(message, location.origin);
      else document.dispatchEvent(new CustomEvent("molis:side-open", { detail: message }));
    } else if (!side && message.type === "molis:side-context-result") {
      if (parent !== window) parent.postMessage(message, location.origin);
      else document.dispatchEvent(new CustomEvent("molis:side-context-result", { detail: message }));
    }
  };
}
