import { readFileSync } from "node:fs";


/**
 * The Git directory and result panel's client, as the workbench mounts it, and as Coding's bundle takes it for its panel: a factory `(host) => …` that returns
 * what it mounted. Its code is the type-checked TypeScript in `src/browser/` (tsconfig.browser.json), bundled by esbuild into
 * `dist/git-client.js` when the package builds, wrapped as a factory by the build. The already authorized document supplies its words.
 */
const GIT_CLIENT_BUNDLE = readFileSync(new URL("./git-client.js", import.meta.url), "utf8").trim();

export const GIT_CLIENT_FACTORY_SCRIPT = `${GIT_CLIENT_BUNDLE}`;
