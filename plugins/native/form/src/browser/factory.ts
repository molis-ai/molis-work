import { formClient } from "./client.js";
import type { UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";

/** The bundle's entry. It runs inside the factory `(host) => { … }` that src/client.ts wraps around it, so `host` is the factory's own. */
declare const host: UiPluginClientHost<HTMLElement, HTMLDialogElement, HTMLImageElement | HTMLIFrameElement>;
formClient(host);
