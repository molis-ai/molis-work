import { readFileSync } from "node:fs";

/**
 * The context ring and spending panel, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning its `render`. Its code is the type-checked
 * TypeScript in `src/browser/usage-meter.ts` (tsconfig.browser.json), bundled by esbuild into `dist/usage-meter-bundle.js` when the package
 * builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_USAGE_METER_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./usage-meter-bundle.js", import.meta.url), "utf8").trim();
