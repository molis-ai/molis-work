import { readFileSync } from "node:fs";

/**
 * The Issue page's client, as the workbench mounts it: a factory `(host) => …`. Its code is the type-checked TypeScript in
 * `src/browser/` (tsconfig.browser.json), bundled by esbuild into `dist/issues-client.js` when the package builds (tooling/
 * build-client.mjs: minified, with the style sheet inside), already wrapped in the factory. This reads it.
 */
export const ISSUES_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./issues-client.js", import.meta.url), "utf8").trim();
