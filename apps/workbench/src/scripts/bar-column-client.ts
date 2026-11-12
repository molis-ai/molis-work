import { readFileSync } from "node:fs";

/**
 * The bottom bar's column over the focused pane (UIV-19): the browser program (src/browser/bar-column.ts), bundled by esbuild into
 * dist/bar-column-client.js when the package builds and carried in workbench.js. It sets the page global `molisWorkBarColumn`,
 * which the workbench's start calls. The path goes through the package root, so the package must be built.
 */
export const BAR_COLUMN_CLIENT_SCRIPT = readFileSync(new URL("../../dist/bar-column-client.js", import.meta.url), "utf8");
