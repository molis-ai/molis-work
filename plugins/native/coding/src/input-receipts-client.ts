import { readFileSync } from "node:fs";

/**
 * The person's words to a round under way, as a unit test mounts it alone with fake ports (the page itself is bundled whole, workbench-client.ts): a factory `(ports) => …` returning the handle. Its code is the type-checked
 * TypeScript in `src/browser/input-receipts.ts` (tsconfig.browser.json), bundled by esbuild into `dist/input-receipts-bundle.js` when the package
 * builds (package.json "build"), already wrapped in the factory. This reads it.
 */
export const CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./input-receipts-bundle.js", import.meta.url), "utf8").trim();
