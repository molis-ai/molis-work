import { mountFrame } from "./parent.js";
import { startChild } from "./child.js";
import type { FrameConfig } from "./types.js";

globalThis.molisPluginFrames = { mount: mountFrame };
if (parent !== window) {
  const connect = (event: MessageEvent<{ type?: string; config: FrameConfig }>) => {
    if (event.source !== parent || event.data?.type !== "molis:plugin-connect" || event.ports.length !== 1) return;
    removeEventListener("message", connect);
    const port = event.ports[0]!;
    void startChild(port, event.data.config).catch(error => port.postMessage({ type: "failed", message: String(error.message) }));
  };
  addEventListener("message", connect);
}
