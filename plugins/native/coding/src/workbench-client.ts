import { readFileSync } from "node:fs";

/**
 * Coding's client as the workbench registers it: `(host) => …`, the page's typed modules (src/browser/, checked by tsconfig.browser.json)
 * bundled by esbuild into `dist/workbench-bundle.js` when the package builds. Its registration names Git in `clientUses`, so
 * the workbench loads its bundle beside this one and hands its client over as `host.clients`; nothing here imports another plugin.
 */
export const CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./workbench-bundle.js", import.meta.url), "utf8").trim();
