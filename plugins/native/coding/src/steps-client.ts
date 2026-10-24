import { readFileSync } from "node:fs";

/**
 * The step reports dialog, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning its `sync` and
 * `open`. Its code is the type-checked TypeScript in `src/browser/steps.ts` (tsconfig.browser.json), bundled by esbuild into
 * `dist/steps-bundle.js` when the package builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_STEPS_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./steps-bundle.js", import.meta.url), "utf8").trim();
