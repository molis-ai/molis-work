import { readFileSync } from "node:fs";

/** The browser program src/browser/runtime-panel.ts, bundled by esbuild into dist/runtime-panel-client.js when the package builds. */
export const RUNTIME_PANEL_CLIENT_SCRIPT = readFileSync(new URL("../../dist/runtime-panel-client.js", import.meta.url), "utf8");
