// 把原型打成一个自包含的 HTML：产品真实的样式表 + 设计系统真实的 render* 函数 + 原型自己的脚本与候选组件样式。
// 用法（仓库根目录）：node --import tsx docs/design/project-arrival-flow/prototype/build.mjs
// 前提：packages/design-system 已经 `tsc -p packages/design-system` 构建过（dist 存在）。
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const out = resolve(here, 'dist');
await mkdir(out, { recursive: true });

// 1. 产品的真实样式：项目目录页用的那一套（含 CRAFT_FINISH 的底栏几何）与设计系统的脚本。
const assets = await import(pathToFileURL(resolve(repo, 'apps/workbench/src/page-assets.ts')).href);
const ds = await import(pathToFileURL(resolve(repo, 'packages/design-system/dist/index.js')).href);
const productCss = assets.renderMolisWorkWorkbenchStylesheet();
const prototypeCss = await readFile(resolve(here, 'prototype.css'), 'utf8');

// 2. 脚本：原型的控制器，连同设计系统的 render* 函数一起打成一个 IIFE。
const bundle = await build({
  entryPoints: [resolve(here, 'src/main.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  write: false,
  minify: false,
  legalComments: 'none',
});
const script = bundle.outputFiles[0].text;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Molis Work 到达页</title>
<script>${ds.THEME_BOOTSTRAP_SCRIPT}</script>
<style>${productCss}</style>
<style>${prototypeCss}</style>
</head>
<body class="immersive-workbench arrival-body">
${ds.renderIconSprite()}
<div id="review" class="review" role="toolbar" aria-label="原型审阅"></div>
<button id="review-show" class="review-show" type="button" hidden>显示审阅条</button>
<div id="app" class="arrival"></div>
<script>${ds.VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
<script>${script}</script>
</body>
</html>
`;
await writeFile(resolve(out, 'index.html'), html);
console.log(`dist/index.html  ${(html.length / 1024).toFixed(0)} KB  (product css ${(productCss.length / 1024).toFixed(0)} KB, prototype css ${(prototypeCss.length / 1024).toFixed(0)} KB, script ${(script.length / 1024).toFixed(0)} KB)`);
