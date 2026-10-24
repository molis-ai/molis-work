import { readFileSync } from "node:fs";

/**
 * The review reader of a round's changes, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning `close`, `openFixed` and `active`. Its code is the type-checked
 * TypeScript in `src/browser/changeset.ts` (tsconfig.browser.json), bundled by esbuild into `dist/changeset-bundle.js` when the package
 * builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_CHANGESET_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./changeset-bundle.js", import.meta.url), "utf8").trim();
