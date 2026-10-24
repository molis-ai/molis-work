import { readFileSync } from "node:fs";

/**
 * 灵光's page client, as the workbench mounts it: a factory `(host) => …`. Its code is the type-checked TypeScript in
 * `src/browser/` (tsconfig.browser.json), bundled by esbuild into `dist/lingguang-client.js` when the package builds, already
 * wrapped in the factory (the build's banner and footer), whose `host` the bundle's entry (`src/browser/factory.ts`) uses.
 * This reads it. How a blank spark is left, and what the surface does when it is hidden or going away, is written in
 * `src/browser/editor.ts`.
 */
export const LINGGUANG_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./lingguang-client.js", import.meta.url), "utf8").trim();
