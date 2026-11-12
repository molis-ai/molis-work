import { readFileSync } from "node:fs";

/** The browser program src/browser/upgrade-opening.ts, bundled by esbuild into dist/upgrade-opening-client.js when the package builds. */
export const UPGRADE_OPENING_CLIENT_SCRIPT = readFileSync(new URL("../../dist/upgrade-opening-client.js", import.meta.url), "utf8");
