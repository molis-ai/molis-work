import { readFileSync } from "node:fs";

/**
 * Coding's client as the workbench registers it: `(host) => …`, the page's typed modules (src/browser/, checked by tsconfig.browser.json)
 * bundled by esbuild into `dist/workbench-bundle.js` when the package builds. Its registration names Files and Git in `clientUses`, so
 * the workbench loads their bundles beside this one and hands their clients over as `host.clients`; nothing here imports another plugin.
 */
export const CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./workbench-bundle.js", import.meta.url), "utf8").trim();
