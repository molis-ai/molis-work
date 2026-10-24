import { readFileSync } from "node:fs";

/**
 * The plan panel and editor, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning `prepareStepRework`, `openFixed`, `update` and `renderTurn`. Its code is the type-checked
 * TypeScript in `src/browser/plans.ts` (tsconfig.browser.json), bundled by esbuild into `dist/plans-bundle.js` when the package
 * builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_PLANS_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./plans-bundle.js", import.meta.url), "utf8").trim();
