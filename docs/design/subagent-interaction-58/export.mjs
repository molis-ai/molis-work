// Prototype-only export of the actual shared composer. No product bundle changes.
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const out = join(here, "dist");
await mkdir(out, { recursive: true });
const ds = await import(join(root, "packages/design-system/dist/index.js"));
const { WORK_LINE_STYLES } = await import(join(root, "apps/workbench/dist/styles/work-line.js"));
await writeFile(join(out, "parts.css"), ds.COMPOSER_STYLES + '\n' + WORK_LINE_STYLES);
await writeFile(join(out, "composer.js"), ds.COMPOSER_CLIENT_SCRIPT);
await build({ stdin: { contents: `
  import { assistantComposerLabels } from './apps/workbench/dist/assistant-composer-labels.js';
  import zh from './apps/workbench/resources/locales/zh.json';
  import en from './apps/workbench/resources/locales/en.json';
  import { installTextForTest } from './packages/plugin-sdk/dist/ui/text.js';
  import { renderTaskCard, renderTaskPanel, renderTaskMark, renderWorkLine, renderLineHead, renderReplyWho } from './apps/workbench/dist/work-line-parts.js';
  let release;
  window.prototypeLocale = lang => { release?.(); release = installTextForTest({ packs: [zh, en], locale: lang }); };
  window.prototypeWorkLine = { renderTaskCard, renderTaskPanel, renderTaskMark, renderWorkLine, renderLineHead, renderReplyWho };
  window.prototypeLabels = lang => assistantComposerLabels(key => (lang === 'en' ? en : zh).messages[key] ?? key, /Mac/.test(navigator.platform));
`, resolveDir: root, loader: "js" }, bundle: true, minify: true, platform: "browser", outfile: join(out, "parts.js") });
console.log("Prototype composer exported from current build.");
