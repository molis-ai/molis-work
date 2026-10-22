import { readFileSync } from "node:fs";

/**
 * The browser program of 角色: TypeScript in `src/browser/characters/` (tsconfig.browser.json), bundled by esbuild into
 * `dist/characters-client.js` when the package builds. The Host serves it at the address the plugin's pack had,
 * `/assets/molis-work-plugins/characters.js` (CHR-1 D5; the name is inexact, BL-378), and the deferred loader mounts it with
 * the stage page (`HOST_SURFACE_CLIENTS`).
 */
let client: string | null = null;
export function renderMolisWorkCharactersClientScript(): string {
  return client ??= readFileSync(new URL("../characters-client.js", import.meta.url), "utf8").trim();
}
