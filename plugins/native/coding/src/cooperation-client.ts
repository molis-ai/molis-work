import { readFileSync } from "node:fs";

/**
 * The cooperation panels of a session, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning `refresh`, `openDialog` and `reset`. Its code is the type-checked
 * TypeScript in `src/browser/cooperation.ts` (tsconfig.browser.json), bundled by esbuild into `dist/cooperation-bundle.js` when the package
 * builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_COOPERATION_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./cooperation-bundle.js", import.meta.url), "utf8").trim();
