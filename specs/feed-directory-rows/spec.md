# Feed 目录行对齐 Goal 列表

## 背景目标

Feed 插件里 Inbox、Feed、来源三份目录都是带图标、类型、摘要、同步事实的多层卡片。Goal 目录已经是单行标题 + 右侧状态。同一条侧栏里两套行高和信息密度，Feed 这边更难看。把这三份目录改成 Goal 那套行语法。

完成等级：功能可用。真实目录可扫、可选、可进详情；不改读取和写入。

## 当前行为与问题证据

Goal 行：`tree-entry` 单行，标题省略，右侧状态，沉浸式高度 32px。

Feed Item 行：左图标、类型、标题、摘要、时间、状态，高度约 66–80px。

来源行：左图标、类型、名称、账号、拉取事实、状态，高度约 72–82px。名称常与类型重复（GitHub / GitHub）。

证据：`plugins/native/feed/src/ui.ts`、`packages/design-system/src/styles/directory-ledger.ts`、`packages/design-system/src/styles/source-feed.ts`、`apps/workbench/src/styles/immersive-directory.ts`，以及当前项目里的来源目录。

## 范围与非目标

做：Inbox、Feed、来源三份目录行的 DOM 与样式；选中/悬停/焦点与 Goal 一致；默认「仅 Feed」状态不占一行；筛选、搜索、data 属性与既有点击契约保留。

不做：详情页、来源配置弹窗、对话框里的管理行、Sessions/Artifacts 目录、Goal 目录、API/同步/筛选逻辑。

## 使用场景

在 Feed 的 Inbox / Feed / 来源之间切换时，左侧目录和 Goal 一样是可扫的单行列表；点一行仍打开右侧详情。

## 方案

每行只保留标题和状态。来源、摘要、时间、类型放到详情，不在目录展开。未读仍用 `data-feed-entry-read`，不另开元信息行。

## 文件边界

- `plugins/native/feed/src/ui.ts`
- `packages/design-system/src/styles/directory-ledger.ts`
- `packages/design-system/src/styles/source-feed.ts`
- `packages/design-system/src/styles/desktop-titlebar.ts`
- `packages/design-system/src/styles/navigation-ownership.ts`
- `apps/workbench/src/styles/immersive-directory.ts`
- `tests/feed-native-plugin.test.ts`
- `tests/immersive-directory.e2e.test.ts`

## 验收

- Inbox / Feed / 来源目录行是标题 + 状态，没有列表图标、摘要、类型条或拉取时间行。
- 沉浸式侧栏行高 32px，标题单行省略，不盖住状态。
- 选中/悬停背景与 Goal 行一致。
- 点击、搜索、筛选、已有 data 属性仍能打开对应详情。

## 验证

- `node --import tsx --test tests/feed-native-plugin.test.ts tests/visual-foundation.test.ts`
- 浏览器走 Inbox、Feed、来源，对照 Goal 列表
- 能跑时补跑 `tests/immersive-directory.e2e.test.ts`

## 假设

当前主界面是 immersive workbench；非沉浸式桌面壳沿用同一套行语法。
