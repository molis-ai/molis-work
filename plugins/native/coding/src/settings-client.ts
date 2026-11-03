import { readFileSync } from "node:fs";
import { CODING_PLUGIN_ID } from "./manifest.js";

const bundle = readFileSync(new URL("./settings-bundle.js", import.meta.url), "utf8").trim();

/**
 * Coding's sections of the settings pages, bound in both standalone and embedded settings: the project-owned method library and
 * the MCP server list. Their code is the type-checked TypeScript in `src/browser/settings/`, bundled by esbuild into
 * `dist/settings-bundle.js` when the package builds (package.json "build"). The plugin's route goes in front of the bundle
 * as the constant its entry declares; the page defines `L`.
 */
export const CODING_SETTINGS_CLIENT_SCRIPT = [
  "(() => {",
  `const CODING_SETTINGS_API = ${JSON.stringify("api/plugins/" + CODING_PLUGIN_ID)};`,
  bundle,
  "})();",
].join("\n");
