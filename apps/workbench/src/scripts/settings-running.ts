import { readFileSync } from "node:fs";

/** The browser program src/browser/settings-running.ts, bundled by esbuild into dist/settings-running-client.js when the package builds. */
export const SETTINGS_RUNNING_CLIENT_SCRIPT = readFileSync(new URL("../settings-running-client.js", import.meta.url), "utf8");
