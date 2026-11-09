import { mountFrame } from "./parent.js";
import { startChild } from "./child.js";
import { frameAssets } from "./frame-assets.js";
import type { FrameConfig } from "./types.js";

globalThis.molisPluginFrames = { mount: mountFrame, assets: frameAssets };
const parentOrigin = document.querySelector<HTMLMetaElement>('meta[name="molis-work-frame-parent"]')?.content;
if (parent !== window && parentOrigin) {
  const connect = (event: MessageEvent<{ type?: string; config: FrameConfig }>) => {
    if (event.source !== parent || event.origin !== parentOrigin || event.data?.type !== "molis:plugin-connect" || event.ports.length !== 1) return;
    removeEventListener("message", connect);
    const port = event.ports[0]!;
    void startChild(port, event.data.config).catch(error => port.postMessage({ type: "failed", message: String(error.message) }));
  };
  addEventListener("message", connect);
}
