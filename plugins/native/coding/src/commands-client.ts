import { readFileSync } from "node:fs";

/**
 * The slash menu, the command palette and the page's shortcuts, as the Coding page's client (client.ts) calls it: a factory `(ports) => …` returning `openPalette`, `closeMenu`, `keyLabel` and `shortcuts`. Its code is the type-checked
 * TypeScript in `src/browser/commands.ts` (tsconfig.browser.json), bundled by esbuild into `dist/commands-bundle.js` when the package
 * builds (scripts/build-browser.mjs), already wrapped in the factory. This reads it.
 */
export const CODING_COMMANDS_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./commands-bundle.js", import.meta.url), "utf8").trim();
