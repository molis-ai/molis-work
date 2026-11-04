# 组件板实件：docs/design 原型共用

`docs/design/` 里的原型从这里取组件板（产品的 `/__ui/catalog`）现行的样式、图标、主题脚本和渲染函数，不另拷令牌表（用户 2026-11-04 定：原型按组件板实件重做）。

## 生成

`dist/` 不入库，用之前在仓库根目录生成一次（组件板改了就重跑）：

```sh
pnpm --filter @molis-ai/molis-work-design-system run build
```

```sh
pnpm --filter @molis-ai/molis-work-app-workbench run build
```

```sh
node docs/design/component-board/build.mjs
```

产物：

| 文件 | 内容 |
| --- | --- |
| `dist/board.css` | 组件板页面载入的同一份样式表（`renderMolisWorkSettingsStylesheet()`）加组件板标本样式；字体拷到 `dist/assets/` |
| `dist/board-head.js` | 主题引导脚本，放 `<head>`，读 `molis-work:theme` |
| `dist/board.js` | 图标 sprite、视觉机制脚本，以及 `window.MW`：插件 SDK `@molis-ai/molis-work-plugin-sdk/ui` 的全部 `render*`，加设计系统的菜单、弹出层、预览卡、切换组、操作卡等渲染函数 |
| `dist/catalog.html` | 离线组件板；条件、助理、插件行三节是 iframe，离线打不开，只在产品的 `/__ui/catalog` 里看 |

## 原型怎么用

- 页面依次载入 `dist/board-head.js`、`dist/board.css`、`proto.css`、原型自己的版式 css，`<body class="proto-page">`，脚本先载 `dist/board.js`，再用 `window.MW.render*` 画控件。
- `proto.css` 只是原型外壳：顶上一条斜纹的原型控制条、可滚动的舞台、一张工作面（`--paper`、`--r-sheet`、`--sheet-shadow`）。不是产品界面。
- 原型自己的 css 只排位置，只用组件板令牌，不写 hex；组件板上没有的部件在 css 和 README 里标「组件板新增」，交 D 轨补标本。
- 起一个服务看全部原型（打开 <http://127.0.0.1:4422/>）：

```sh
python3 -m http.server 4422 --bind 127.0.0.1 --directory docs/design
```

## 已知的组件板缺陷

- `.mw-items` 是 `display: grid; width: min(480px, 100%)`，列不是 `minmax(0, 1fr)`，窄屏下长标题会把整列撑出容器。原型里就地补了 `grid-template-columns: minmax(0, 1fr)`；D 轨在 [PR #1770](https://github.com/molis-ai/molis-work/pull/1770) 里修组件本身，合入后原型的补丁可以删掉。
