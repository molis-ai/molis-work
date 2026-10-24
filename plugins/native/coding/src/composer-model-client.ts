import { readFileSync } from "node:fs";

/**
 * The composer's model controls, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning the handle. Its code is the type-checked
 * TypeScript in `src/browser/composer-model.ts` (tsconfig.browser.json), bundled by esbuild into `dist/composer-model-bundle.js` when the package
 * builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_COMPOSER_MODEL_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./composer-model-bundle.js", import.meta.url), "utf8").trim();
