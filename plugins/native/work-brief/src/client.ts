import { readFileSync } from "node:fs";

/**
 * The brief page's client, as the workbench mounts it: a factory `(host) => …`. Its code is the type-checked TypeScript in
 * `src/browser/` (tsconfig.browser.json), bundled by esbuild into `dist/work-brief-client.js` by the package build command (with the
 * style sheet from tooling/minify-styles.mjs inside), already wrapped in the factory. This reads it.
 */
export const WORK_BRIEF_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./work-brief-client.js", import.meta.url), "utf8").trim();
