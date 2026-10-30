import { mountImages } from "./client.js";
import type { ImagesHost } from "./types.js";

/** The workbench calls this bundle as `(host) => …`: the build wraps the entry in that function. */
declare const host: ImagesHost;

mountImages(host);
