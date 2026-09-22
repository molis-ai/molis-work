# 插件本机设置进全局设置

状态：**等级 3 已完成**（设置列表能打开插件自己的设置页，第一页是 Shelf，轮盘开关能保存并回读）。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次宿主能力的唯一需求书。Shelf 设置里有哪些栏目、轮盘怎么关，仍以 [`specs/shelf-plugin/spec.md`](../../shelf-plugin/spec.md) 为准。全局设置壳仍以 [`specs/archive/settings-directory-panel/spec.md`](../settings-directory-panel/spec.md) 为准。

## 背景与目标

全局设置目录现在写死四项：外观、AI 与执行工具、规划方法、诊断。插件没有正规入口登记「我有本机设置」。

同时要分清两类东西，不能进同一张页：

- **插件内容功能**：Feed 里的 Gmail、来源、账号。这是插件自己的工作，待在插件工作台。
- **插件本机设置**：Shelf 要不要开轮盘。这是插件怎么在这台机器上工作，进全局设置里该插件自己的那一页。

目标：插件可以登记一页本机设置。用户点左下角齿轮，左边列表多出该插件一行；点它，右边是这个插件自己的设置。

## 当前行为与问题证据

- 全局设置目录是 `apps/workbench/src/settings-directory.ts` 里的固定数组，只有 appearance / runtimes / planning / diagnostics。
- Workbench 只开放 `workbench.directory` / `workbench.main` / `workbench.overlay`。没有给设置正文的槽。
- Integration Manifest 里已有 `settings.integration.gmail` 这类 contribution id，但宿主不收、不画；而且 Gmail 属于 Feed 内容功能，**本来就不该**进全局设置。
- 规划方法是 Goals 的内容，被特例塞进全局设置，不是「Goals 插件本机设置」。
- Shelf 需求已写「设置 → 外观可关轮盘」，但现在没有全局设置里的 Shelf 页。

## 形式（已对齐）

现在点齿轮，左边是：

- 外观
- AI 与执行工具
- 规划方法
- 诊断

以后有本机设置的插件在这四项下面多一行，用插件名。第一行是 **Shelf**。点 Shelf，右边换成 Shelf 自己的设置页。Feed 的 Gmail 不出现在这个列表里。

独立 `/settings/*` 直达页同样多这一行，避免书签和工作台两套目录。

## 范围与非目标

### 做

- 全局设置目录改为「宿主四项 + 已登记的插件本机设置」。没登记的插件不出现。
- 插件登记的是**一整页设置**，不是往 Molis「外观」里塞开关。宿主只负责列出和打开；页上有什么、怎么存，由该插件负责。
- 工作台内切分类仍留在设置壳：目录一行，正文在右边 exclusive stage。不改 URL，不把设置做成标签或可卸载插件。
- 第一页：Shelf。至少包含轮盘开关；Shelf 设置内部栏目（使用准备、快捷键、外观、动作等）画在**右边这一页里**，不拆成全局设置目录的更多行。
- 轮盘开关的语义与 DropAgent 一致：关了以后拖到菜单栏不再出轮盘；不开关 Shelf 面板，不改 Goal 胶囊。
- 插件未运行或未登记本机设置时，目录没有那一行。

### 不做

- 不把 Feed / Inbox / Sources 的内容功能（Gmail、来源、账号、处理任务配置）搬进全局设置。
- 不把轮盘开关放进 Molis 的「外观」（主题、语言、密度仍是宿主页）。
- 不改项目设置，不把插件本机设置做成项目级。
- 不把规划方法改成 Goals 的插件设置。
- 不在这一期做 VS Code 那种「插件只报字段、宿主统一画表单」。
- 不给所有内置插件各做一页空设置。没有本机设置就不登记。

## 使用场景

1. 打开全局设置：左边仍是原来四项，下面多 **Shelf**。当前项还是外观。
2. 点 Shelf：右边是 Shelf 设置。在外观类栏目关掉轮盘，保存后拖文件到菜单栏不再出轮盘。
3. 再点「外观」：回到主题和语言，没有轮盘开关。
4. 打开 Feed：Gmail / 来源仍在 Feed 工作台，全局设置目录没有 Gmail。
5. 直达独立设置页：左边同样能看到 Shelf，点进去是同一页设置。
6. 没有登记本机设置的插件（例如当前 Inbox）：全局设置里没有它的名字。

## 方案与关键决策

1. **形式就是现有全局设置多一行。** 不加新窗口，不进插件工作台里找本机开关。
2. **内容功能 ≠ 插件设置。** 前者是插件产品对象（账号、来源、材料）；后者是本机怎么用这个插件（轮盘、快捷键、外观偏好）。
3. **一行插件名，页内再分栏目。** Shelf 在 DropAgent 里的「使用准备 / 快捷键 / 外观 / 动作」是 Shelf 页内部导航，不是全局设置目录项。
4. **登记，不写死。** 设置目录不再假定永远只有四项。插件用现有 UI Contribution 登记一页本机设置；宿主组装目录并挂到设置正文槽。
5. **第一刀验证整条链。** 合同 + 目录组装 + Shelf 页（至少轮盘）。其它插件以后自己登记。

## 输入输出与依赖

- 输入：已运行且登记了本机设置的插件、该插件自己的设置状态（Shelf：轮盘开关等）。
- 输出：全局设置目录多出的行、右边插件设置文档、开关对插件行为生效。
- 依赖：现有设置壳、UI Host mount、Shelf 本机 store（内置 Shelf 尚未走 PluginHostExecutor 私人存储）、Shelf / DropAgent 轮盘语义。
- 轮盘真正出现仍依赖 Desktop adapter；本需求保证开关能保存，并在轮盘实现后被读取。开关先落地、轮盘后接上，不算未完成这条设置链。

## 文件 / 模块边界

- 合同：`packages/contracts/src/platform/ui.ts`、`plugin.ts` / `plugin-manifest.ts`（设置页 contribution 与槽）
- 挂载：`packages/ui-host`、`apps/workbench/src/ui-composition.ts`
- 设置壳：`apps/workbench/src/settings-directory.ts`、`settings-navigation.ts`、`settings-renderer.ts`、`scripts/client/settings-directory.ts`
- 第一页：`plugins/native/shelf`（设置页 UI 与轮盘偏好读写）
- 平台说明：`docs/platform/UI-PLATFORM.md`、`PLUGIN-PLATFORM.md`
- 表面：`DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`（执行时改，不在本文件提前改视觉合同）
- 不改：Feed / Inbox 来源与账号 UI、项目设置、规划方法契约

## 验收标准

1. 点齿轮后，全局设置目录在原四项之下出现 **Shelf**；没有 Gmail、没有 Inbox（除非它们以后单独登记本机设置）。
2. 点 Shelf：正文在 `[data-work-surface=settings]`，是 Shelf 设置页，不是 Molis 外观页。
3. 关掉轮盘并保存：刷新后仍是关；实现轮盘后，关闭状态下拖到菜单栏不出轮盘。
4. Molis「外观」页没有轮盘开关。
5. Feed 工作台仍能管理来源 / Gmail；全局设置目录不出现这些项。
6. 独立 `/settings/*` 页目录与工作台一致，也能打开 Shelf 设置。
7. 插件未登记本机设置时，目录长度与现在相同（四项）。
8. 定向测试覆盖：目录组装、Shelf 页渲染、轮盘偏好读写、不把内容功能页误挂进来。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-contracts build
npx pnpm --filter @molis-ai/molis-work-module-shelf build
npx pnpm --filter @molis-ai/molis-work-plugin-shelf build
npx pnpm --filter @molis-ai/molis-work-app-workbench build
npx pnpm --filter @molis-ai/molis-work-app-local-host build
node --import tsx --test --test-concurrency=1 \
  tests/plugin-global-settings.test.ts \
  tests/workbench-ui-platform.test.ts \
  tests/project-settings-stage.test.ts \
  tests/shelf-plugin.test.ts
```

执行时按落地测试名补全，不得用「看起来有一行」代替保存与回读。

## 验收结果（2026-09-17）

| # | 标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 齿轮目录原四项下有 Shelf；无 Gmail / Inbox | **通过** | 独立页与工作台内目录均为 外观 / AI 与执行工具 / 规划方法 / 诊断 / Shelf。`tests/plugin-global-settings.test.ts` 目录组装断言同此。 |
| 2 | 点 Shelf 后正文是 Shelf 设置页 | **通过** | 独立 `/settings/shelf` 与工作台 `[data-work-surface=settings]` 均为 `data-shelf-settings`；导航 `aria-current` 为 shelf。 |
| 3 | 关轮盘后刷新仍关 | **通过** | 浏览器关掉后 `GET /api/shelf/settings` 为 `false`，DOM `checked===false`，刷新仍关。Desktop 拖到菜单栏出轮盘未测（spec 允许开关先落地）。 |
| 4 | Molis 外观页没有轮盘开关 | **通过** | 独立 `/settings/appearance` 与工作台切回外观后，可见正文是主题/语言；轮盘控件不在外观文档。工作台切页会把上一页从设置舞台卸掉，缓存节点不留在 DOM。 |
| 5 | Feed 仍管来源 / Gmail；设置目录没有这些项 | **通过** | 设置目录无 Gmail/Inbox。Gmail 只出现在 Feed 模板，不在设置列表。 |
| 6 | 独立 `/settings/*` 目录与工作台一致，能打开 Shelf | **通过** | `/settings/appearance` 有 Shelf 行；点进去到 `/settings/shelf`。 |
| 7 | 未登记本机设置的插件不出现 | **通过** | Inbox/Feed 的 `primary-page` 不进目录；`pluginSettingsNavItemsFrom` 对空贡献返回 `[]`。 |
| 8 | 定向测试覆盖目录、渲染、存取、不误挂内容页 | **通过** | spec 验证命令（含 local-host 构建）后定向测试全绿。未把门禁放到脏树里已失败的 `desktop-tui` / 全量 `i18n`。 |

浏览器验证用临时 home `/tmp/molis-work-plugin-settings-INL2kk`、端口 4187，未写用户真实库。验证结束后已停该服务。

## 假设与开放问题

- 假设插件本机设置都是本机个人数据，不是项目设置。
- 假设目录行文案用插件名（Shelf），不另起「插件设置」总页。
- 开放：Shelf 右边正文完全跟 DropAgent 设置表面，还是外框走 Codex、内部栏目仍是 DropAgent 语义。默认跟 `specs/shelf-plugin/spec.md`：设置页是 Shelf 表面，目录行仍是 Molis 设置分类行。
