import { readFileSync } from "node:fs";

/** The browser program src/browser/settings-update.ts, bundled by esbuild into dist/settings-update-client.js when the package builds. */
export const SETTINGS_UPDATE_CLIENT_SCRIPT = readFileSync(new URL("../settings-update-client.js", import.meta.url), "utf8");
