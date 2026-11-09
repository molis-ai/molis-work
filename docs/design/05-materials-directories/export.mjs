// Writes what this prototype takes from the product build into ./dist/ (generated, not committed):
//   settings.css    the settings page's own stylesheet (renderMolisWorkSettingsStylesheet), for group A
//   settings.js     the product's own markup of a project's 常规 settings page and its navigation, through the product's
//                   renderers (createProjectSettingsFolds, createWorkbenchSettingsNavigation), in Chinese and through the
//                   product's English dictionary; the delete dialog in it is the one the product draws today
//   parts.js        the board renderers ../kit/kit.js does not carry (directory rows, option cards, dialogs, radios …), as window.mw05,
//                   with the icon sprite and the board's client script of this build (window.mw05Sprite, window.mw05Client)
//   board.css       the board's stylesheet as ../kit/build.mjs makes it, from this build (the committed kit lags the build a little),
//                   plus two sets of the board's own rules that are not in the served sheets yet: buttons inside an alert
//                   (KEEP_EDITS_BOARD_STYLES) and a menu item's description line (COMPOSER_BOARD_STYLES)
// Nothing here is copied by hand; rerun after the pages change.
//
//   pnpm build
//   node docs/design/05-materials-directories/export.mjs
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const load = (path) => import(pathToFileURL(join(root, path)).href);

const { renderMolisWorkSettingsStylesheet } = await load("apps/workbench/dist/page-assets.js");
const { createProjectSettingsFolds } = await load("apps/workbench/dist/project-settings-folds.js");
const { createWorkbenchSettingsNavigation } = await load("apps/workbench/dist/settings-navigation.js");
const { EN } = await load("apps/workbench/dist/i18n/en.js");
const { icon, escapeHtml } = await load("packages/plugin-sdk/dist/ui.js");
const designSystem = await load("packages/design-system/dist/index.js");
const { processFold } = await load("packages/plugin-sdk/dist/ui/process-fold.js");
const { KEEP_EDITS_BOARD_STYLES } = await load("packages/design-system/dist/primitives/catalog-keep-edits.js");
const { COMPOSER_BOARD_STYLES } = await load("packages/design-system/dist/primitives/catalog-composer.js");

// The dictionary's two placeholder forms: {name} and {count|one|many}.
const fill = (text, values = {}) => text
  .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (_, key, one, many) => (Number(values[key]) === 1 ? one : many))
  .replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));

// Two sample projects: a usual name, and the longest one a person is likely to give (the crowded case).
const PROJECTS = {
  plain: { zh: "网站改版", en: "Website redesign" },
  full: { zh: "2026 年官网改版与品牌手册整理（给市场部和设计组一起用的第二期）", en: "2026 website redesign and brand handbook clean-up (phase two, shared with marketing and design)" },
};

const fragments = {};
for (const lang of ["zh", "en"]) {
  const L = (text, values) => fill(lang === "en" ? EN[text] ?? text : text, values);
  const folds = createProjectSettingsFolds({ L, escapeHtml, icon, withDesktopQuery: (path) => path });
  const nav = createWorkbenchSettingsNavigation({ L, escapeHtml, icon, withDesktopQuery: (path) => path });
  fragments[lang] = {};
  for (const [data, names] of Object.entries(PROJECTS)) {
    const project = { project_id: "proj-7f3c2a91", display_name: names[lang], data_class: "user", database_path: "~/.molis-work/projects/proj-7f3c2a91/project.sqlite" };
    fragments[lang][data] = {
      nav: nav.renderProjectSettingsNavigation("general", project, false, [], { goals: true }),
      page: folds.renderGeneralPage(project, false),
      chrome: L("项目设置"),
      back: L("返回工作台"),
    };
  }
}

const sdk = (p) => JSON.stringify(join(root, "packages/plugin-sdk/dist", p));
const ds = (p) => JSON.stringify(join(root, "packages/design-system/dist", p));
const entry = `
import { renderDirectoryRow, renderDirectoryHeading, renderRadio, renderCheckbox, renderToast, renderEmpty, renderSpinner, renderAlert, renderBadge, renderStatusMark, renderStateRing, renderButton, renderSelect, icon, escapeHtml } from ${sdk("ui.js")};
import { renderInteractionOptions } from ${ds("interaction.js")};
import { renderDialog, renderAlertDialog, renderMenu, renderMenuItem, renderMenuGroup, renderPopover } from ${ds("primitives/overlay.js")};
import { renderFileGroup, renderFileRow, renderFileKind } from ${ds("primitives/arrival.js")};
window.mw05 = { renderDirectoryRow, renderDirectoryHeading, renderRadio, renderCheckbox, renderToast, renderEmpty, renderSpinner, renderAlert, renderBadge,
  renderStatusMark, renderStateRing, renderButton, renderSelect, icon, escapeHtml, renderInteractionOptions, renderDialog, renderAlertDialog, renderMenu,
  renderMenuItem, renderMenuGroup, renderPopover, renderFileGroup, renderFileRow, renderFileKind };
`;
const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: "js" }, bundle: true, write: false, format: "iife", platform: "browser", minify: true, logLevel: "silent" });

const board = [
  designSystem.VISUAL_FOUNDATION_STYLES, designSystem.CRAFT_FINISH_STYLES, designSystem.DIFF_VIEW_STYLES, designSystem.DISCLOSURE_STYLES, designSystem.INTERACTION_STYLES, designSystem.INPUT_RECEIPTS_STYLES,
  designSystem.MEDIA_ZOOM_STYLES, designSystem.COPY_FEEDBACK_STYLES, designSystem.OVERFLOW_FADE_STYLES, designSystem.NUMBER_STYLES,
  processFold("", { group: ".pf-group", groupBody: ".pf-group__body", step: ".pf-step", stepBody: ".pf-step__body" }),
  `html{${designSystem.renderPaletteTokens("light")}} html[data-resolved-theme="dark"]{${designSystem.renderPaletteTokens("dark")}}`,
  KEEP_EDITS_BOARD_STYLES,
  COMPOSER_BOARD_STYLES,
].join("\n");

const out = join(here, "dist");
mkdirSync(out, { recursive: true });
const files = {
  "settings.css": renderMolisWorkSettingsStylesheet(),
  "settings.js": `window.SETTINGS_FRAGMENTS = ${JSON.stringify(fragments)};\n`,
  "parts.js": `/* Generated by docs/design/05-materials-directories/export.mjs from packages/plugin-sdk and packages/design-system. */\n${bundle.outputFiles[0].text}
window.mw05Sprite = ${JSON.stringify(designSystem.renderIconSprite())};
window.mw05Client = ${JSON.stringify(designSystem.VISUAL_FOUNDATION_CLIENT_SCRIPT)};
`,
  "board.css": `/* Generated by docs/design/05-materials-directories/export.mjs (the kit's recipe, from this build). */\n${board}`,
};
for (const [name, text] of Object.entries(files)) {
  writeFileSync(join(out, name), text);
  process.stdout.write(`${name.padEnd(13)} ${(text.length / 1024).toFixed(0)} KB\n`);
}
