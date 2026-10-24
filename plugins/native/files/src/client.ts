import { readFileSync } from "node:fs";

/**
 * The Files directory and reader's client, as Coding's bundle mounts it (`clientFrom`): a factory `(host, browser) => …` that
 * returns what it mounted. Its code is the type-checked TypeScript in `src/browser/` (tsconfig.browser.json), bundled by esbuild
 * into `dist/files-client.js` when the package builds, already wrapped in the factory (the build's banner and footer). This reads it.
 */
export const FILES_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./files-client.js", import.meta.url), "utf8").trim();
