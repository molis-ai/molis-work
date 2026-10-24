import { readFileSync } from "node:fs";

/**
 * The round's actions, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning `renderCards`. Its
 * code is the type-checked TypeScript in `src/browser/actions.ts` (tsconfig.browser.json), bundled by esbuild into
 * `dist/actions-bundle.js` when the package builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_ACTIONS_CLIENT = readFileSync(new URL("./actions-bundle.js", import.meta.url), "utf8").trim();
