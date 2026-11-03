import { readFileSync } from "node:fs";

/** Browser factory built from the plugin's typed client modules. */
export const INBOX_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("./inbox-client.js", import.meta.url), "utf8").trim();
