import { readFileSync } from "node:fs";

/**
 * The work line at the bottom of the workbench: the browser program (src/browser/work-bar.ts), bundled by esbuild into
 * dist/work-bar-client.js when the package builds and carried in workbench.js. It sets the page global `molisWorkBar`,
 * which the workbench's start calls. The path goes through the package root, so the package must be built.
 */
export const WORK_BAR_CLIENT_SCRIPT = readFileSync(new URL("../../dist/work-bar-client.js", import.meta.url), "utf8");
