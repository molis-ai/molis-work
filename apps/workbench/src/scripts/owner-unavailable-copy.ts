import { readFileSync } from "node:fs";

/** The browser program src/browser/owner-unavailable-copy.ts, bundled by esbuild into dist/owner-unavailable-copy-client.js when the package builds. */
export const OWNER_UNAVAILABLE_COPY_CLIENT_SCRIPT = readFileSync(new URL("../../dist/owner-unavailable-copy-client.js", import.meta.url), "utf8");
