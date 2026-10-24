import { readFileSync } from "node:fs";

/**
 * The writer directories dialog, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning `refresh` and `renderTurn`. Its code is the type-checked
 * TypeScript in `src/browser/writers.ts` (tsconfig.browser.json), bundled by esbuild into `dist/writers-bundle.js` when the package
 * builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_WRITER_DIRECTORIES_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./writers-bundle.js", import.meta.url), "utf8").trim();
