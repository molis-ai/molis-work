import { readFileSync } from "node:fs";

/**
 * Shelf's page client, as the workbench mounts it: a factory `(host) => …`. Its code is the type-checked TypeScript in
 * `src/browser/` (tsconfig.browser.json), bundled by esbuild into `dist/shelf-client.js` when the package builds, already
 * wrapped in the factory (the build's banner and footer), whose `host` the bundle's entry (`src/browser/factory.ts`) uses. This reads it.
 */
export const SHELF_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./shelf-client.js", import.meta.url), "utf8").trim();
