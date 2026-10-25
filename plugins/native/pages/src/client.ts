import { readFileSync } from "node:fs";

/**
 * The Pages page's client, as the workbench mounts it: a factory `(host) => …`. Its code is the type-checked TypeScript in
 * `src/browser/` (tsconfig.browser.json), bundled by esbuild into `dist/pages-client.js` when the package builds, already
 * wrapped in the factory (the build's banner and footer), whose `host` the bundle's entry (`src/browser/factory.ts`) uses. This reads it.
 * The editor is the other script of the page (`dist/pages-editor.js`, from `src/editor-browser.ts`); this client uses it through `window`.
 */
export const PAGES_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./pages-client.js", import.meta.url), "utf8").trim();
