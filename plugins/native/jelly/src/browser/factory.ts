import { mountJelly } from "./client.js";
import type { JellyHost } from "./types.js";

/** The workbench calls this bundle as `(host) => …`: the build wraps the entry in that function. */
declare const host: JellyHost;

mountJelly(host);
