import { readFileSync } from "node:fs";

import { icon } from "@molis-ai/molis-work-design-system";

/**
 * Files' page client, as the workbench mounts it, and as Coding's bundle takes it for its panel: a factory `(host) => …` that
 * returns what it mounted. Its code is the type-checked TypeScript in `src/browser/` (tsconfig.browser.json), bundled by esbuild
 * into `dist/files-client.js` when the package builds, already wrapped in a factory `(host, icons, browser) => { … return browser }`
 * (the build's banner and footer). This reads it and gives it the folder and file icons, drawn here by the design system.
 */
const FILES_CLIENT_BUNDLE = readFileSync(new URL("./files-client.js", import.meta.url), "utf8").trim();

export const FILES_CLIENT_FACTORY_SCRIPT = `(host) => (${FILES_CLIENT_BUNDLE})(host, ${JSON.stringify({ folder: icon("folder"), file: icon("file") })})`;
