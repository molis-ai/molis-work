# 组件板实件（`docs/design/` 里各原型共用一份）

组件板（`/__ui/catalog`）自己的代码，从构建结果里取出来，给产品之外的原型用。原型照这些实件画，不另抄令牌表、不各拷一份（[需求开发流程第 5 节](../../../specs/post-anticorruption-roadmap/reference/development-workflow.md)，用户 2026-11-04 定）。各轨道共用这一份；design-system 或 plugin-sdk 的界面部件变了，由 D 轨重新生成。

| 文件 | 是什么 |
| --- | --- |
| `kit.css` | design-system 的 `VISUAL_FOUNDATION_STYLES`、`CRAFT_FINISH_STYLES`、按需帮助 `ON_DEMAND_HELP_STYLES`、差异视图、过程折叠、展开、交互卡、输入回执、看图放大、复制反馈、溢出渐隐、等宽数字、条目行与列表+详情部件及浅/深色板 `renderPaletteTokens`。生成文件，不手改 |
| `settings.css` | 工作台设置页样式表 `renderMolisWorkSettingsStylesheet()`（apps/workbench），画在设置页上的原型引用它。生成文件，不手改 |
| `kit.js` | 主题启动脚本；全量真实渲染函数挂在 `window.mwKit`；图标表 `window.mwKitSprite`；客户端脚本 `window.mwKitClient` 与 `window.mwKitClients`。生成文件，不手改 |
| `kit-bridge.js` | 原型轻桥接脚本（`kitRing`、`?lang=&theme=` 参数同步、分段滑块同步与 `mwKitClient` 自动挂载；已从历史 `workbench-shared-paths` 收口至此） |
| `prototype.css` / `parts.js` / `dist/` | 到达/设置整页原型框架所需辅助样式与按需产物（`dist/{arrival.css,workbench.css,settings.css,theme.js,sprite.js,foundation.js}` 不入库，随 `build.mjs` 一并生成；原 `_catalog/`、`component-board/`、`coding-frame/`、`assistant-cards/` 均已归档） |
| `build.mjs` | 唯一生成脚本，一次构建上述全部实件 |

`window.mwKit` 现有：`renderButton`、`renderStatusMark`、`renderBadge`、`renderAlert`、`renderStateRing`、`icon`、`escapeHtml`（plugin-sdk `ui`）；`renderDiff`、`compareChange`（plugin-sdk `diff-view`；文字由调用方传 `primitives.text`，SDK 不带翻译）；`renderMenu`、`renderMenuItem`、`renderMenuGroup`、`renderPopover`、`renderTooltip`（design-system `primitives/overlay`）；`renderToggleGroup`、`renderTabs`、`renderCollapsible`（`primitives/navigation`）；`renderFileKind`、`renderFileRow`、`renderFileGroup`、`renderBarStatus`、`renderSteps`（`primitives/arrival`）；`renderEmpty`、`renderInput`、`renderSkeleton`、`renderToast`、`renderRadioGroup`（plugin-sdk `ui`）；第 09 批能力包的组件板部件 `renderNowBlock`（状态与去处块，带锚在按钮下沿的菜单）、`renderPickRow`、`renderItemGroup`（条目组）、`renderCells`（紧凑条目格）、`renderDetailTrail`（第三层返回与路径）、`renderIconCounts`（图标计数）、`renderStateRows`（分项状态行）、`renderUsage`（用量）（design-system `primitives/capability-pack`）。

`kit.css` 另带条目行规则（`ITEM_ROW_STYLES`、`.mw-mark` 的 `MARK_STYLES`）和列表＋详情一组部件（第 08 批 `SKILL_PACK_BOARD_STYLES`、第 09 批 `CAPABILITY_PACK_BOARD_STYLES`，含「详情贴顶」修饰 `data-sticky-detail`）。`window.mwKitClients.anchoredMenu` 是状态与去处块里那个菜单的放置脚本（按钮写 `data-anchored-menu` 与 `popovertarget`）。

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

看图放大、复制反馈、溢出渐隐和工艺底随 `mwKitClient` 一起生效，不用另挂；需要拖放区时，再把 `window.mwKitClients.dropZone` 作为脚本文本挂上；用到锚在按钮下沿的菜单时，同样挂上 `window.mwKitClients.anchoredMenu`。原型自己的样式只管布局，颜色、阴影、时长、曲线一律引用 `kit.css` 里的变量。

从 `docs/design` 起服务，`../kit/` 才找得到：

```bash
python3 -m http.server 4416 --bind 127.0.0.1 --directory docs/design
```

## 要加东西时改哪里

- **加一个渲染函数**：在 `build.mjs` 的 `entry` 里从它所在的构建文件 import，再加进 `window.mwKit`，并在上面的清单里补一句。函数要在 `packages/design-system/dist` 或 `packages/plugin-sdk/dist` 里真实导出（先查它在哪个文件，例如 `renderSteps` 在 `primitives/arrival.js`，不在 `navigation.js`）。
- **加一组样式**：把 design-system 导出的样式常量加进 `build.mjs` 的 `css` 数组；只属于某一种页面的整页样式（像设置页）单独出一个文件。
- **加一个客户端脚本**：加进 `clients`。
- 组件板上还没有的部件不加在这里：在原型里标「组件板新增」并写理由，定下后先补成组件板标本，再重新生成。

## 组件板新增（交 D 轨补标本）

原型探路时如果临时需要组件板 `/__ui/catalog` 尚未收录的部件，可以在原型里用 `kit/prototype.css` 临时标注并写清理由；用户定样后，必须先由 D 轨在 `packages/design-system` 补齐共享原语与 `/__ui/catalog` 标本，再跑 `pnpm build && node docs/design/kit/build.mjs` 重新生成本目录实件。

<!-- 从设计索引保留的说明与决策；后续只在本目录维护。 -->

组件板实件，各原型共用一份：从构建结果生成的 `kit.css`／`kit.js`（色板、`mw-*` 控件、状态环、差异视图、过程折叠、图标表与真实渲染函数）和生成脚本

现行；`pnpm build` 后 `node docs/design/kit/build.mjs` 重新生成，不手改；组件板变了由 D 轨重生成

<!-- 从设计索引保留的说明与决策；后续只在本目录维护。 -->

组件板实件，各原型共用一份：从构建结果生成的 `kit.css`／`kit.js`（色板、`mw-*` 控件、状态环、差异视图、过程折叠、图标表与真实渲染函数）、设置页样式 `settings.css` 和生成脚本

现行；`pnpm build` 后 `node docs/design/kit/build.mjs` 重新生成，不手改；组件板变了由 D 轨重生成
