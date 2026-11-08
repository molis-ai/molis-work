import { readFileSync } from "node:fs";

/** Type-checked account UI, bundled into the existing Workbench script. */
export const ACCOUNT_CLIENT_SCRIPT = readFileSync(new URL("../../dist/account-client.js", import.meta.url), "utf8");
