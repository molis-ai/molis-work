// 把组件板 /__ui/catalog 现行的样式、图标与主题脚本取到 docs/design/component-board/dist/，供 docs/design 里的原型直接链接。
// 不拷令牌表：样式表就是组件板页面载入的那一份（renderMolisWorkSettingsStylesheet() 加组件板页面自己的标本样式）。
// 用法（仓库根目录，先 `pnpm --filter @molis-ai/molis-work-design-system run build` 与 `pnpm --filter @molis-ai/molis-work-app-workbench run build`）：
//   node docs/design/component-board/build.mjs
// 产物（dist/ 不入库）：board.css、board-head.js（主题引导，放 <head>）、board.js（图标 sprite、视觉机制脚本，以及 window.MW：
// 插件 SDK `@molis-ai/molis-work-plugin-sdk/ui` 的全部 render* 与设计系统的菜单、弹出层、交互卡等渲染函数，原型用它们画出与产品同一份的 mw-* 结构）、
// catalog.html（离线组件板；其中条件、助理、插件行三节是 iframe，只在产品的 /__ui/catalog 里能看）。
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const out = resolve(here, 'dist');
const load = (path) => import(pathToFileURL(resolve(repo, path)).href);

const assets = await load('apps/workbench/dist/page-assets.js');
const catalog = await load('apps/workbench/dist/primitive-catalog.js');
const ds = await load('packages/design-system/dist/index.js');

// 第 16 批起界面文字经 t() 取词：离线生成没有宿主给的文字上下文，这里装上工作台自己的中文词表（浏览器里的 window.MW 同样装一份）。
const sdkUi = await load('packages/plugin-sdk/dist/ui.js');
const words = await readFile(resolve(repo, 'apps/workbench/resources/locales/zh.json'), 'utf8');
const pack = sdkUi.parseLocalePack(words);
if (!pack.ok) throw new Error('工作台中文词表读不了：' + JSON.stringify(pack.problems ?? pack).slice(0, 400));
sdkUi.installTextForTest({ locale: 'zh', packs: [pack.value] });
const page = catalog.renderMolisWorkPrimitiveCatalog();
const specimenCss = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
// 字体：样式表按产品的 /assets/ 路径引用，这里拷到 dist/assets/ 并改成相对路径。
const fonts = [...new Set([...assets.renderMolisWorkSettingsStylesheet().matchAll(/url\("\/assets\/([\w.-]+\.woff2)"\)/g)].map((m) => m[1]))];
const css = `/* 生成文件，勿手改：node docs/design/component-board/build.mjs */\n${assets.renderMolisWorkSettingsStylesheet()}\n/* 组件板页面的标本样式 */\n${specimenCss}\n/* 呈现形态（名字片、行、卡片、速览；主人色块） */\n${ds.PRESENTATION_FORM_STYLES}\n`;
const head = `${ds.THEME_BOOTSTRAP_SCRIPT}\n`;
const DS_EXPORTS = ['renderInteractionOperation', 'renderInteractionBadge', 'renderInteractionOptions', 'renderInteractionNextSteps', 'renderMenu', 'renderMenuGroup', 'renderMenuItem', 'renderPopover', 'renderPreviewCard', 'renderToggleGroup', 'renderTooltip', 'renderHint', 'renderTabs', 'renderToolbar', 'renderSheet', 'renderDialog', 'renderCollapsible', 'renderBriefStatus'];
const bundle = await build({
  stdin: {
    contents: `import * as ui from '@molis-ai/molis-work-plugin-sdk/ui';\nimport { ${DS_EXPORTS.join(', ')} } from '@molis-ai/molis-work-design-system';\nconst pack = ui.parseLocalePack(${JSON.stringify(words)});\nif (pack.ok) ui.installTextForTest({ locale: 'zh', packs: [pack.value] });\nwindow.MW = { ...ui, ${DS_EXPORTS.join(', ')} };\n`,
    resolveDir: resolve(repo, 'apps/workbench'),
    loader: 'js',
  },
  // 设计系统入口里有只在服务端用的读文件（字体、页面脚本）；浏览器里用不到，换成空实现。
  plugins: [{ name: 'node-stub', setup(b) {
    b.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, namespace: 'node-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({ contents: 'export const readFileSync = () => ""; export const fileURLToPath = () => ""; export default {};', loader: 'js' }));
  } }],
  bundle: true, format: 'iife', platform: 'browser', target: 'es2022', write: false, legalComments: 'none',
});
const renderers = bundle.outputFiles[0].text;
const tail = `document.body.insertAdjacentHTML('afterbegin', ${JSON.stringify(ds.renderIconSprite())});\n${ds.VISUAL_FOUNDATION_CLIENT_SCRIPT}\n${renderers}\n`;
const offline = page.replace('/assets/molis-work-settings.css', 'board.css');

await mkdir(resolve(out, 'assets'), { recursive: true });
for (const font of fonts) await copyFile(resolve(repo, 'packages/design-system/fonts', font), resolve(out, 'assets', font));
await writeFile(resolve(out, 'board.css'), css.replaceAll('url("/assets/', 'url("assets/'));
await writeFile(resolve(out, 'board-head.js'), head);
await writeFile(resolve(out, 'board.js'), tail);
await writeFile(resolve(out, 'catalog.html'), offline);
console.log(`component-board/dist: board.css ${(css.length / 1024).toFixed(0)} KB, board.js ${(tail.length / 1024).toFixed(0)} KB, catalog.html ${(offline.length / 1024).toFixed(0)} KB`);
