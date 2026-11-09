import { mountFrame } from "./parent.js";
import { startChild } from "./child.js";
import { frameAssets } from "./frame-assets.js";
import type { FrameConfig } from "./types.js";
import { prepareFrameLanguages } from "./language.js";

globalThis.molisPluginFrames = { mount: mountFrame, assets: frameAssets, prepareLanguage: prepareFrameLanguages };
const parentOrigin = document.querySelector<HTMLMetaElement>('meta[name="molis-work-frame-parent"]')?.content;
const challenge = document.querySelector<HTMLMetaElement>('meta[name="molis-work-frame-mount"]')?.content;
if (parent !== window && parentOrigin && challenge) {
  // Only this srcdoc holds the local end. A later document in the same WindowProxy cannot receive the connection.
  const hello = new MessageChannel();
  const connect = (event: MessageEvent<{ type?: string; config: FrameConfig }>) => {
    if (event.data?.type !== "molis:plugin-connect" || event.data.config?.origin !== parentOrigin || event.ports.length !== 1) return;
    hello.port1.close();
    const port = event.ports[0]!;
    void startChild(port, event.data.config).catch(error => port.postMessage({ type: "failed", message: String(error.message) }));
  };
  hello.port1.addEventListener("message", connect);
  hello.port1.start();
  parent.postMessage({ type: "molis:plugin-mount", challenge }, parentOrigin, [hello.port2]);
}
