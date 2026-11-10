import { readFileSync } from "node:fs";

export const IM_CLIENT_SCRIPT = readFileSync(new URL("./im-client.js", import.meta.url), "utf8");
