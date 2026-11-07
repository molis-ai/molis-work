# 组件板实件（`docs/design/` 里各原型共用一份）

组件板（`/__ui/catalog`）自己的代码，从构建结果里取出来，给产品之外的原型用。原型照这些实件画，不另抄令牌表、不各拷一份（[需求开发流程第 5 节](../../../specs/post-anticorruption-roadmap/reference/development-workflow.md)，用户 2026-11-04 定）。各轨道共用这一份；design-system 或 plugin-sdk 的界面部件变了，由 D 轨重新生成。

| 文件 | 是什么 |
| --- | --- |
| `kit.css` | design-system 的 `VISUAL_FOUNDATION_STYLES`（色板、阴影层级、圆角、时长与曲线、`mw-*` 控件、状态环、提示条）与 `CRAFT_FINISH_STYLES`（动效：四种进场、落定底色；触控尺寸；工艺底），加页面常放的部件：差异视图、过程折叠（plugin-sdk `processFold` 按 `.pf-group`／`.pf-step` 生成）、展开、交互卡、输入回执、看图放大、复制反馈、溢出渐隐、等宽数字；最后是色板 `renderPaletteTokens`（`--hue-*` 与建在它上面的状态色别名），浅色写在 `html`、深色写在 `html[data-resolved-theme="dark"]`。生成文件，不手改 |
| `settings.css` | 工作台设置页自己的样式表 `renderMolisWorkSettingsStylesheet()`（apps/workbench），画在设置页上的原型（如 13、21）引用它。它是整页样式、约 890 KB，所以单独一份，别的原型不加载。生成文件，不手改 |
| `kit.js` | 主题启动脚本；真实渲染函数挂在 `window.mwKit`；图标表 `window.mwKitSprite`；客户端脚本字符串 `window.mwKitClient`（视觉基础：按下回弹、分段滑块、状态环动画、主题切换，并且已经包含工艺底、看图放大、复制反馈、溢出渐隐）和 `window.mwKitClients`（只有 `dropZone`；其余几个已在 `mwKitClient` 里，再挂一份会重复绑定）。生成文件，不手改 |
| `build.mjs` | 生成上面三份的脚本 |

`window.mwKit` 现有：`renderButton`、`renderStatusMark`、`renderBadge`、`renderAlert`、`renderStateRing`、`icon`、`escapeHtml`（plugin-sdk `ui`）；`renderDiff`、`compareChange`、`diffViewText`（plugin-sdk `diff-view`）；`renderMenu`、`renderMenuItem`、`renderMenuGroup`、`renderPopover`、`renderTooltip`（design-system `primitives/overlay`）；`renderToggleGroup`、`renderTabs`（`primitives/navigation`）；`renderFileKind`、`renderFileRow`、`renderFileGroup`、`renderBarStatus`、`renderSteps`（`primitives/arrival`）。

## 重新生成

`build.mjs` 读的是 design-system、plugin-sdk 和 workbench 的构建结果，所以先构建：

```bash
pnpm build
```

```bash
node docs/design/kit/build.mjs
```

提交时 `kit.css`、`kit.js`、`settings.css` 和改动的源码一起提交。

## 原型里怎么引用

原型放在 `docs/design/<目录>/`，用相对路径引用这里：

```html
<link rel="stylesheet" href="../kit/kit.css">
<script src="../kit/kit.js"></script>
```

画在设置页上的原型再加 `<link rel="stylesheet" href="../kit/settings.css">`。

页面里先放一个装图标的元素，再把图标表和视觉基础的客户端脚本挂上：

```html
<div id="icons" hidden></div>
<script>
  document.getElementById("icons").innerHTML = window.mwKitSprite;
  const client = document.createElement("script");
  client.textContent = window.mwKitClient;
  document.body.appendChild(client);
</script>
```

看图放大、复制反馈、溢出渐隐和工艺底随 `mwKitClient` 一起生效，不用另挂；需要拖放区时，再把 `window.mwKitClients.dropZone` 作为脚本文本挂上。原型自己的样式只管布局，颜色、阴影、时长、曲线一律引用 `kit.css` 里的变量。

从 `docs/design` 起服务，`../kit/` 才找得到：

```bash
python3 -m http.server 4416 --bind 127.0.0.1 --directory docs/design
```

## 要加东西时改哪里

- **加一个渲染函数**：在 `build.mjs` 的 `entry` 里从它所在的构建文件 import，再加进 `window.mwKit`，并在上面的清单里补一句。函数要在 `packages/design-system/dist` 或 `packages/plugin-sdk/dist` 里真实导出（先查它在哪个文件，例如 `renderSteps` 在 `primitives/arrival.js`，不在 `navigation.js`）。
- **加一组样式**：把 design-system 导出的样式常量加进 `build.mjs` 的 `css` 数组；只属于某一种页面的整页样式（像设置页）单独出一个文件。
- **加一个客户端脚本**：加进 `clients`。
- 组件板上还没有的部件不加在这里：在原型里标「组件板新增」并写理由，定下后先补成组件板标本，再重新生成。

<!-- 从设计索引保留的说明与决策；后续只在本目录维护。 -->

组件板实件，各原型共用一份：从构建结果生成的 `kit.css`／`kit.js`（色板、`mw-*` 控件、状态环、差异视图、过程折叠、图标表与真实渲染函数）和生成脚本

现行；`pnpm build` 后 `node docs/design/kit/build.mjs` 重新生成，不手改；组件板变了由 D 轨重生成

<!-- 从设计索引保留的说明与决策；后续只在本目录维护。 -->

组件板实件，各原型共用一份：从构建结果生成的 `kit.css`／`kit.js`（色板、`mw-*` 控件、状态环、差异视图、过程折叠、图标表与真实渲染函数）、设置页样式 `settings.css` 和生成脚本

现行；`pnpm build` 后 `node docs/design/kit/build.mjs` 重新生成，不手改；组件板变了由 D 轨重生成
