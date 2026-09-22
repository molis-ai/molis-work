# Goals titlebar 左侧与目录宽对齐

状态：已实现。完成等级 **3：功能可用**。不改用户库、不提交。

本文件补 `specs/archive/project-chrome-titlebar-row/spec.md`：项目条对齐目录列（默认 240px，拖过跟 `--tree-width`），不把左边插件栏算进宽度。Goals 没有第二栏，仍占同一条目录宽。

## 背景目标

用户从 Sessions / Artifacts 进 Goals，titlebar 左边的项目名、搜索、设置突然收成一截，或铺满「插件栏 + 目录」后左边比目录多出 48px。Goals 不占第二栏，但项目条仍应叠在目录列上，各插件同一条宽。

## 当前行为与问题证据

- 网页有目录：chrome 从 x=0 起、宽 `plugin-rail + --tree-width`。实测 Feed：chrome 0–324，目录 48–324，左边多出插件栏。
- Goals：曾被 `is-plugin-directory-empty` 收成 `width: auto`（约 217px）；修成 rail+tree 后又和目录左缘对不齐。
- `--tree-width` 默认 240px，拖过之后各插件共用；Goals 上第二栏关掉，变量仍在。

## 范围与非目标

做：

- Sessions 点开一行后，左边列表也走同一条 `--tree-width`；`.session-stage-shell` 作为舞台内容时 padding 为 0，避免桌面工作面内边距把竖线顶歪。
- Goals 以及同样不占第二栏的工作插件：仍走这条宽，搜索/设置贴右缘。
- 首页、插件市场、用户收起目录：仍按内容收窄，去掉这条左边距，不盖标签。
- 桌面壳：项目条从红绿灯留白开始，右缘仍贴目录右缘。

不做：不把 Goals 第二栏加回来；不改红绿灯、目录拖宽、分屏靠右；不把用户已拖过的 `--tree-width` 重置回 240。

## 使用场景

1. 打开 Feed：项目条左右贴目录列。点 Goals：同一条宽，标签起点不变。
2. 回首页：项目条收窄，不盖住标签。

## 方案

`immersive-navigation.ts`：有目录列时 chrome 宽 = `--tree-width`，左边空出 `--plugin-rail-width`。缩小规则只留给 `.is-directory-collapsed` 和 home / market。Goals / Sessions 展开后的左栏 grid 也用 `--tree-width`，不再写死 `17.5rem`。

## 验收标准

1. 网页有目录：`chrome.left ≈ 插件栏宽`，`chrome.right ≈ 插件栏 + --tree-width`，与 `.tree-pane` 左右对齐。
2. Goals 点开一行（宽屏列表+工作区）：左边列表右缘与 `chrome.right` 相差不超过 3px。Sessions 同样。
3. `?desktop=1` Goals：`chrome.right` 与 `plugin-rail.width + --tree-width` 相差不超过 3px。搜索/设置贴这条右缘。
4. 同一项目从 Sessions 切到 Goals，chrome.right 相差不超过 3px。
5. 首页仍 `width: auto`，不按目录宽铺满。
6. 定向测试通过。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/chrome-inner-scroll.test.ts tests/desktop-tui.test.ts tests/immersive-directory.e2e.test.ts
```
