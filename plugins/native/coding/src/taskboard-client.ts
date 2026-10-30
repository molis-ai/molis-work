import { readFileSync } from "node:fs";

/**
 * The task board, as a unit test mounts it alone with fake ports (the page itself is bundled whole, workbench-client.ts): a factory `(ports) => …` returning the board's handle. Its code is the type-checked
 * TypeScript in `src/browser/taskboard.ts` (tsconfig.browser.json), bundled by esbuild into `dist/taskboard-bundle.js` when the package
 * builds (package.json "build"), already wrapped in the factory. This reads it.
 */
export const CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./taskboard-bundle.js", import.meta.url), "utf8").trim();
