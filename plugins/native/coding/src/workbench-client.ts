import { readFileSync } from "node:fs";
import { CODING_CLIENT_FACTORY_SCRIPT } from "./client.js";

/**
 * `(host, coding) => …`: how Coding's page mounts (src/browser/workbench.ts, type-checked by tsconfig.browser.json), bundled by
 * esbuild into `dist/workbench-bundle.js` when the package builds.
 */
const workbench = readFileSync(new URL("./workbench-bundle.js", import.meta.url), "utf8").trim();

/** The bundle above around Coding's page client. */
const mounting = (coding: string): string => `(host) => (${workbench})(host, ${coding})`;

/**
 * Coding's client as the workbench registers it. Its registration names Files and Git in `clientUses`, so the workbench loads their
 * bundles beside this one and hands their clients over as `host.clients`; nothing here imports another plugin.
 */
export const CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT = mounting(CODING_CLIENT_FACTORY_SCRIPT);
