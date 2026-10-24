import { readFileSync } from "node:fs";

/**
 * The Character picker, as the Coding page's client (client.ts) calls it: a factory `(ports) => …`. Its code is the type-checked
 * TypeScript in `src/browser/characters.ts` (tsconfig.browser.json), bundled by esbuild into `dist/characters-bundle.js` when the
 * package builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_CHARACTERS_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./characters-bundle.js", import.meta.url), "utf8").trim();
