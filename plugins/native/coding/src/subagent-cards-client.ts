import { readFileSync } from "node:fs";

/**
 * The subagent cards under a round's block, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning its `render`. Its code is the type-checked
 * TypeScript in `src/browser/subagent-cards.ts` (tsconfig.browser.json), bundled by esbuild into `dist/subagent-cards-bundle.js` when the package
 * builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_SUBAGENT_CARDS_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./subagent-cards-bundle.js", import.meta.url), "utf8").trim();
