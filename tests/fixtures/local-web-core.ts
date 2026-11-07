import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createDesktopWebCore } from "@molis-ai/molis-work-app-desktop";

/** Single-Home business fixture using the same desktop platform, HTTP guards, routes and resource owners as production. */
export const createSingleHomeTestWebServer = createDesktopWebCore({ ptyClientFilePath() {
  const candidates = [new URL("../../apps/desktop/launchers/web/pty-client.js", import.meta.url), new URL("../../dist/web/pty-client.js", import.meta.url)].map(url => fileURLToPath(url));
  return candidates.find(candidate => fs.existsSync(candidate)) ?? candidates[0]!;
} });
