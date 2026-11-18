import { readFileSync } from "node:fs";

/**
 * The browser program of 角色: TypeScript in `src/browser/characters/` (tsconfig.browser.json), bundled by esbuild into
 * `dist/characters-client.js` when the package builds. The Host serves it at `CHARACTERS_CLIENT_PATH` (./client-path.ts), and the
 * settings loader below fetches it when Settings › 角色 or 项目设置 › 角色 shows (it is no longer a stage surface).
 */
let client: string | null = null;
export function renderMolisWorkCharactersClientScript(): string {
  return client ??= readFileSync(new URL("../characters-client.js", import.meta.url), "utf8").trim();
}

/** What every settings page carries for Settings › 角色 (`src/browser/characters/loader.ts`): it adds the program when a page shows it. */
export const CHARACTERS_SETTINGS_LOADER_SCRIPT = readFileSync(new URL("../../dist/characters-loader.js", import.meta.url), "utf8").trim();
