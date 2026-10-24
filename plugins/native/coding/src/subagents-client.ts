import { readFileSync } from "node:fs";

/**
 * The subagent results panel, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning its `update`. Its code is the type-checked
 * TypeScript in `src/browser/subagents.ts` (tsconfig.browser.json), bundled by esbuild into `dist/subagents-bundle.js` when the package
 * builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_SUBAGENTS_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./subagents-bundle.js", import.meta.url), "utf8").trim();
