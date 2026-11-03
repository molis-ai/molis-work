import { readFileSync } from "node:fs";

/**
 * The running plan's card, as a unit test mounts it alone with fake ports (the page itself is bundled whole, workbench-client.ts): a factory `(ports) => …` returning its `render`. Its code is the type-checked
 * TypeScript in `src/browser/plan-progress.ts` (tsconfig.browser.json), bundled by esbuild into `dist/plan-progress-bundle.js` when the package
 * builds (package.json "build"), already wrapped in the factory. This reads it.
 */
export const CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./plan-progress-bundle.js", import.meta.url), "utf8").trim();
