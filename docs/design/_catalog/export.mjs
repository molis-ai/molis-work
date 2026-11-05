// Writes the product's own stylesheets and page scripts next to this file (into dist/), so the standalone prototypes
// under docs/design/ draw with exactly what the component board and the product draw with: the same tokens, mw-* controls,
// arrival frame, workbench bar and settings pages. Nothing here is copied by hand; rerun after the styles change.
//
//   pnpm build                       (or at least: pnpm --filter "@molis-ai/molis-work-app-workbench..." run build)
//   node docs/design/_catalog/export.mjs
//
// dist/ is generated and not committed (see .gitignore here).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const out = join(here, "dist");
const load = (path) => import(pathToFileURL(join(root, path)).href);

const pages = await load("apps/workbench/dist/page-assets.js");
const ds = await load("packages/design-system/dist/index.js");

const files = {
  "arrival.css": pages.renderMolisWorkArrivalStylesheet(),
  "workbench.css": pages.renderMolisWorkWorkbenchStylesheet(),
  "settings.css": pages.renderMolisWorkSettingsStylesheet(),
  // Before the first paint: theme, density and skin on <html>, exactly as the product does.
  "theme.js": ds.THEME_BOOTSTRAP_SCRIPT,
  // The icon sprite, placed at the top of <body> by the page that loads it.
  "sprite.js": `document.currentScript.insertAdjacentHTML("afterend", ${JSON.stringify(ds.renderIconSprite())});`,
  // Shared control behaviour (menus, focus groups, state rings, tips …) and the arrival motion (wordmark, caption).
  "foundation.js": `${ds.VISUAL_FOUNDATION_CLIENT_SCRIPT}\n${ds.ARRIVAL_MOTION_CLIENT_SCRIPT}`,
};

mkdirSync(out, { recursive: true });
for (const [name, text] of Object.entries(files)) {
  writeFileSync(join(out, name), text);
  process.stdout.write(`${name.padEnd(14)} ${(text.length / 1024).toFixed(0)} KB\n`);
}
