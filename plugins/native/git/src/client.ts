import { readFileSync } from "node:fs";

import { GIT_SENTENCE_TABLE } from "./sentences.js";

/**
 * The Git directory and result panel's client, as the workbench mounts it, and as Coding's bundle takes it for its panel: a factory `(host) => …` that returns
 * what it mounted. Its code is the type-checked TypeScript in `src/browser/` (tsconfig.browser.json), bundled by esbuild into
 * `dist/git-client.js` when the package builds, already wrapped in a factory `(host, sentences, git) => { … return git }` (the
 * build's banner and footer). This reads it and gives it the table of the Host's sentence templates, built from the messages,
 * so that the bundle itself carries no dictionary.
 */
const GIT_CLIENT_BUNDLE = readFileSync(new URL("./git-client.js", import.meta.url), "utf8").trim();

export const GIT_CLIENT_FACTORY_SCRIPT = `(host) => (${GIT_CLIENT_BUNDLE})(host, ${JSON.stringify(GIT_SENTENCE_TABLE)})`;
