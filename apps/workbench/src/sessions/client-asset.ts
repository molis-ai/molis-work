import { readFileSync } from "node:fs";

/**
 * Browser program for external tool session history (`src/browser/sessions/`, bundled into `dist/sessions-client.js`).
 * Served at `/assets/platform/sessions.js` and mounted on demand by `HOST_SURFACE_CLIENTS` or `molisOpenSessionsScope`.
 */
let client: string | null = null;
export function renderMolisWorkSessionsClientScript(): string {
  return client ??= readFileSync(new URL("../sessions-client.js", import.meta.url), "utf8").trim();
}
