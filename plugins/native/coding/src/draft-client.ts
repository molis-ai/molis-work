import { readFileSync } from "node:fs";

/**
 * The composer's draft, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning the draft's
 * methods. Its code is the type-checked TypeScript in `src/browser/draft.ts` (tsconfig.browser.json), bundled by esbuild into
 * `dist/draft-bundle.js` when the package builds, already wrapped in the factory (the build's banner and footer). This reads it.
 */
export const CODING_DRAFT_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./draft-bundle.js", import.meta.url), "utf8").trim();
