# 目录列表原语

## 背景与目标

Host 已经用 `plugin-section` + `data-directory-panel` 把各插件列表挂进第二栏，但栏内仍由各插件自拼行、筛选、空态和添加按钮。Sessions / Inbox / Feed / Artifacts 看起来不像同一栏。

目标：在现有 HTML Slot 契约上补 `mw-dir` Panel 与 `DirectoryRow` 展示接口，四个有目录的插件迁过去。完成等级 **3：功能可用**。不宣称可发布。

## 当前行为与问题

- 共用 CSS 钩子 `directory-list-row`，没有组件层。
- Feed：`feed-source-task` + 底部「添加任务」。
- Sessions：隐藏标题栏 `+`、工具条 compact add、单行 `project-record-row`。
- Inbox：重复标题、筛选、两行 `feed-list-item`（含 kind/来源/时间）。
- Artifacts：空壳客户端填 `<a>` 列表。
- Coss 原语库当时把目录树列为非目标；本文件只收 **列表栏**，不收 Goal 树。

## 范围与非目标

范围：design-system `mw-dir` / `mw-dir-row` helper 与样式；Catalog；Feed / Sessions / Inbox / Artifacts 的 directory 表面；工作台目录 CSS 接到同一行语法；相关单测与定向 e2e。

非目标：Goals 树、首页、市场、设置目录、Feed 右边 Item 流水、隐藏的 `data-directory-panel="sources"`、Slot 改成 JSON、领域写入。

## 使用场景

打开项目后，Sessions / Inbox / Feed / Artifacts 段都是同一套栏：可选筛选、列表、可选添加、空态。点行仍开标签或换 Feed 范围；点 Feed「添加任务」、Sessions「新建 Session」仍打开各自对话框。

## 方案与关键决策

1. **外壳 + 行合同，不是领域 Item。** 行类型叫 `DirectoryRow`。Feed 的消息对象仍叫 Item。
2. **插件仍返回 HTML。** Native helper 是方便写法；第三方可手写同样 `mw-*` class。
3. **密度两档，不合成一种。** `compact` 28px（Sessions：标题 + 行尾状态标；Feed：全部带流水计数，来源任务缩进为子项 + 行尾健康标）；`meta` 36px（Inbox / Artifacts：标题 + 一条次要事实 + 行尾状态标）。状态标是 12px/400 家族色的 Lucide + 文案，不要 11px 加粗灰字，也不要第二层描边盒。caption 只占 meta 第二行。计数和行尾配置按钮不得盖住副标题。
4. **添加是 panel 槽，位置可在列表上或下。** Feed 与 Sessions 用 `addPlacement: "start"`；默认仍在底部。筛选留在 `data-directory-list-actions`。去掉 immersive 里已隐藏的重复段标题。
5. **插件保留 data-\* 与点击合同。** Host 不管对话框内容。

### DirectoryRow

| 字段 | 用途 |
| --- | --- |
| title | 主标题 |
| caption? | 次要事实（meta 第二行；compact 不画） |
| icon? | 可选 Lucide 名 |
| count? | 右侧计数 |
| status? | 右侧短状态 |
| selected / current | `is-selected` / `aria-current="page"` |
| href? | 有则渲染 `<a>`（Artifacts） |
| trailing? | 行内附加动作 HTML（Feed 任务配置） |
| attrs / wrapperAttrs | `data-frame-asset*`、插件 data-\* |

### Panel

`data-directory-panel="{plugin}"` + `data-slot="directory"`。槽位：tools、list、empty、add、footer。

## 输入输出与依赖

输入：现有 token、四个插件 directory HTML、tab/frame data 属性。  
输出：`renderDirectoryPanel` / `renderDirectoryRow`、`PRIMITIVE_STYLES`、Catalog、替换后的插件标记。  
依赖：`@molis-ai/molis-work-design-system`。官方 Native Plugin 增加对该包的依赖。

## 文件 / 模块边界

允许：`specs/directory-list-primitive/`、`packages/design-system/src`、`plugins/native/{feed,work,inbox,artifacts}` 的 directory 标记、`apps/workbench/src/styles` 目录密度、对应测试、`DESIGN.md`、Coss 原语 spec 增补 Directory。  
禁止：改 Goal/Feed/Session/Inbox 写入、MCP、凭据、Slot 合同。

## 验收

1. Catalog `/__ui/catalog` 有 Directory：compact、meta、选中、添加、空态。
2. 四个有目录的插件 directory 根节点带 `mw-dir` 与 `data-directory-panel`；行带 `mw-dir-row`。
3. Feed 仍用 `data-feed-task-toggle` / `data-feed-add-toggle` / 任务配置；Sessions 仍用 `data-operation-select` / `data-open-session-add`；Inbox 仍用 `data-inbox-row` / 筛选；Artifacts 仍用 `data-frame-asset="artifact"`。
4. Sessions 目录不再画重复「Sessions」标题；添加在列表底部。Inbox 目录行是标题 + 进入原因，不再堆 kind/来源/时间。
5. 定向测试通过；浏览器核 Catalog 与真实目录：Feed 添加任务、Sessions 新建、Inbox 筛选、Artifact 行。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-design-system typecheck
pnpm --filter @molis-ai/molis-work-plugin-feed typecheck
pnpm --filter @molis-ai/molis-work-plugin-work typecheck
pnpm --filter @molis-ai/molis-work-plugin-inbox typecheck
pnpm --filter @molis-ai/molis-work-plugin-artifacts typecheck
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/feed-native-plugin.test.ts tests/inbox-native-plugin.test.ts tests/workspace-directory.test.ts tests/session-directory.test.ts tests/artifact-browser.test.ts
```

隔离浏览器打开 `/__ui/catalog` 与项目工作台目录。不打用户默认 home。

## 假设

不提交、不发布、不替换用户运行服务。Goal 树以后若要收进行语法，另开任务。
