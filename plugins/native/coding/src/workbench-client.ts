import { readFileSync } from "node:fs";
import { icon } from "@molis-ai/molis-work-design-system";
import { CODING_CLIENT_FACTORY_SCRIPT } from "./client.js";

/**
 * `(host, coding, icons) => …`: how Coding's page and the companion pages that borrow its bundle mount (src/browser/workbench.ts,
 * type-checked by tsconfig.browser.json), bundled by esbuild into `dist/workbench-bundle.js` when the package builds.
 */
const workbench = readFileSync(new URL("./workbench-bundle.js", import.meta.url), "utf8").trim();

/** The bundle above around Coding's page client, with the Files icons drawn on the Host. */
const mounting = (coding: string): string => `(host) => (${workbench})(host, ${coding}, ${JSON.stringify({ folder: icon("folder"), file: icon("file") })})`;

/**
 * Coding's client as the workbench registers it. Its registration names Files and Git in `clientUses`, so the workbench hands
 * their clients over as `host.clients` and the Host's review actions as `host.reviews`; nothing here imports another plugin.
 */
export const CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT = mounting(CODING_CLIENT_FACTORY_SCRIPT);
