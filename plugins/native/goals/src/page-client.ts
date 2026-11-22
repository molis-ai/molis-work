import { readFileSync } from "node:fs";

/**
 * The Goals page client (specs/page-client-lifecycle): the one factory this plugin registers as `workbench.pageClient`, a
 * function expression `(host) => hooks | null` the shell's page script calls with its own ports. Its source is
 * src/browser/page.ts, bundled beside this file by package.json "build".
 */
export const GOALS_PAGE_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./goals-page-client.js", import.meta.url), "utf8").trim();
