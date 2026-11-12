// Writes the 插件 settings page's own stylesheet (PLUGIN_TRUST_SETTINGS_STYLES, apps/workbench) into ./dist/ (generated, not committed):
// the rows, folds and action buttons the prototype draws are the product's, not copied by hand. Rerun after the page's styles change.
//
//   pnpm build
//   node docs/design/uninstall-retained/export.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const { PLUGIN_TRUST_SETTINGS_STYLES } = await import(pathToFileURL(join(root, "apps/workbench/dist/styles/settings-plugins.js")).href);
mkdirSync(join(here, "dist"), { recursive: true });
writeFileSync(join(here, "dist", "plugins.css"), PLUGIN_TRUST_SETTINGS_STYLES);
process.stdout.write(`plugins.css ${(PLUGIN_TRUST_SETTINGS_STYLES.length / 1024).toFixed(1)} KB\n`);
