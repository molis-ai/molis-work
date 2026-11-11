import { readFileSync } from "node:fs";

/**
 * The settings shell's `--settings-view-h` (the height of `.settings-content`, for the list and detail's `data-sticky-detail`): the
 * browser program (src/browser/settings-view-height.ts), bundled by esbuild into dist/settings-view-height-client.js when the
 * package builds. It goes into the settings page's program and the workbench's, which both draw the settings shell. The path goes
 * through the package root, so the package must be built. The bundle ends with `;` and so do the programs before it.
 */
export const SETTINGS_VIEW_HEIGHT_CLIENT_SCRIPT = readFileSync(new URL("../../dist/settings-view-height-client.js", import.meta.url), "utf8").trim();
