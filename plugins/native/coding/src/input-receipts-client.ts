import { readFileSync } from "node:fs";

/**
 * The person's words to a round under way, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning the handle. Its code is the type-checked
 * TypeScript in `src/browser/input-receipts.ts` (tsconfig.browser.json), bundled by esbuild into `dist/input-receipts-bundle.js` when the package
 * builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./input-receipts-bundle.js", import.meta.url), "utf8").trim();
