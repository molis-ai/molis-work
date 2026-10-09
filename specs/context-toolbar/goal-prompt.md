# 目标 Prompt：情境浮条与创建入口

给一个新会话读。先读本文，再按「先读哪里」读文件，然后在「分工」里认领一块。

> 整个目标的推进 Prompt 见 [context-program/goal-prompt.md](../context-program/goal-prompt.md)（2026-10-09）；本文是三块分工的细节。
>
> 2026-10-02 起，本目标与右栏需求（side-shelf）合并设计，三份需求书的交叉部分以[情境动作总纲](../context-program/spec.md)为准；总纲第 8 节是全部能力的索引，第 9 节是合并分期（W0–W7），第 13 节是需求对照表。下文的分期与分工已按总纲改写。

## 目标

把现在固定在屏幕底部的「动态动作栏」，变成贴着用户动作出现的**系统级选区浮条**，外观取 Pages 选中文字时的格式条；在这个基础上做**创建入口**：每个插件都能「一句话新建」，选中内容后由助理按上下文自动创建对应插件的 Item；最后让存量插件尽可能补齐。

用户的原话（按时间）：

1. 动态动作栏一直在底部，能不能变成在用户动作发生的地方？Pages 里选中文字本来就有浮窗工具栏，应该合并；做成系统级通用能力，动态行为的逻辑不变，用 Pages 那种浮窗的 UI，系统定义通用 UI 结构和协议，各插件自定义行为。
2. 其他插件也要有；存量插件应该尽可能补上；开发手册和 Skill 里要声明，尽可能提供。
3. 每个插件有创建 Item：选中文字发送到炼金术士、发送到 Todo，只是举例。所有插件都要有一个快速入口，允许一段自然语言输入，让助理通过插件提供的创建 Item 接口创建对应的 Item。
4. 纠正：「发送到」不是「更多」里的菜单，就是一句话新建，由助理创建；在浮条里由类似 Jev 的选择模型根据当时的上下文推荐最合适的 Item。选中内容后**不用用户再输入**，助理按选区的上下文自动创建。
5. 选中之后还要扩展别的功能；选中文字可以触发一个 Workflow，文字作为第一个节点的输入，第一个节点触发创建 Item 再执行。
6. Side Talk / Fork / Side Chat / `/btw` 这类旁问（核对结果：仓库里没有，Coding 需求书里 C1 分叉、C4 旁问都未实现）。
7. （另一批，side-shelf）Shelf 不当插件，放进右边侧栏成为一格；右栏的灵光、文件、浏览器内容、群聊都能和左边互动、发送到左边；有一整套动作，由 Jev 从同一个动作池里选；助理也要打通。

## 已经定的（别再问用户）

| 主题 | 决定 |
| --- | --- |
| 浮条版式 | 单行：工具在左（插件声明、固定）、动作在右（Host 排序，≤3 个 + 更多 + 助理）；窄舞台时格式类工具折成「格式 ▾」 |
| 打字时 | 不自动浮出；选中文字、⌘.、段落把手才出 |
| 底部动作条 | 整个取消，没有锚点的情境不显示，不留兜底、不留两套 |
| 工具与动作的界线 | Agent 会不会也想调它？会 → 动作，进目录；只是编辑器里的一个按键 → 插件工具，不进目录 |
| 创建入口 | 每个插件声明一次；入口 ① 插件页标题栏「✦ 一句话新建」，② 选区浮条里由 Jev 推荐、不进「更多」和「全部操作」 |
| 创建确认 | 按插件分：声明了 `undo` 的直接创建（带撤销、改放到），其余与提案类、工作流运行出预填卡片一键确认 |
| 旧动作 | 「记成待办」「记下灵光」并进创建入口，旧的删掉 |
| 手册与 Skill | 全部随代码一起写，不单独先补 |
| 覆盖率门禁 | 冻结的豁免名单，只许减少；「待补」名单清零为目标 |
| 选区能力 | 第一批：追加到已有 Item、一次提取多个 Item、任意文本框润色翻译、材料篮；第二批：识别选中内容、带出处的复制引用、记住；最后：批注标记；另有选中文字运行工作流 |
| 合并设计（总纲） | 一个动作池、一个情境中枢、一条浮条、一条执行路径；手上的东西可以在左边、右栏、助理面板（`place: main / side / assistant`），浮条都贴着它出现 |
| 追加与放进 | F2 追加到已有 Item 与「放进左边落点」合成一个 `ItemAttach`，加 `positions`；`positions` 只用于落点目标，`find` 找到的目标放末尾或建关联 |
| 执行总规则 | 写进人眼前正在编辑的对象一律先预览（含助理放进落点）；写到别处按插件声明 |
| 材料篮 | 就用 Shelf：「加入材料」= 收进 Shelf，Shelf 格多选后「一起交给助理」，不另做暂存篮 |
| 右栏 | Shelf 原样（DropAgent 全部功能与外观）成为右栏一格，不是插件；格的顺序 Shelf · 灵光 · 文件 · 浏览器 · 讨论；底栏 Shelf、灵光按钮并进侧栏按钮；「文件」格与 Shelf 分开 |
| Shelf 格的动作 | DropAgent 动作栏管 Shelf 自己的动作，浮条只显示去别处的动作；Shelf 动作仍登记进池 |
| 助理 | 默认带上「手上 + 落点」情境条（可删）；助理面板是一个位置，第一期就做；放置动作不另行登记给助理 |
| 讨论 | 「带到项目讨论」= 讨论格输入框作为落点（im-ui 要新做落点与外部引文） |
| Jev 门槛 | 左右互动评估：首位 ≥80%、前三 ≥95%、p95 ≤2 秒；「最合适去处」先测一轮再定 |

## 先读哪里（按顺序）

设计稿在分支 `feature/context-toolbar`（工作树 `/Users/yijunwang/code/goalboard/.claude/worktrees/context-toolbar`，从 origin/main a4e246e0；文件里的路径与行号以 a4e246e0 为准）。

0. `specs/context-program/spec.md`：总纲。统一模型（§3）、合同（§4）、情境中枢（§5）、助理（§6）、右栏与浮条的交点（§7）、能力总表（§8）、合并分期（§9）、需求对照表（§13）。
0'. `specs/side-shelf/spec.md`：右栏、Shelf、左右互动、落点、架构（§4）。
1. `specs/context-toolbar/spec.md`：浮条（§2–§9）、各插件现状与场景（§10，含选区能力 F1–F13）、手册 / Skill / 门禁 / 存量补齐（§11）、决策记录（§12）。
2. `specs/quick-create/spec.md`：创建入口协议 `ItemIntake`、两个入口、推荐与起草（§6.1）、追加 / 批量 / 工作流起点（§6.2）、各插件创建动作现状（§7）。
3. `specs/archive/contextual-interaction/spec.md`：已合 main 的情境服务，Host 候选 / 判断 / 陈列方案 / 冻结 / 信号都沿用它，不改逻辑。
4. `AGENTS.md`、`PRODUCT.md`、`DESIGN.md`、`specs/action-architecture/spec.md` §3、`skills/molis-plugin-dev/SKILL.md`。

## 要改或要读的代码

**浮条与外壳**
- `apps/workbench/src/scripts/client/context-actions.ts`：现在的底栏（`bar` 渲染）和情境总线（`bus`，保留）、通用 DOM 选区路径、窗格转发。
- `apps/workbench/src/assistant-dock.ts:72`、`packages/design-system/src/styles/craft-finish.ts:1010–1072`：底栏容器与样式，要删。
- `apps/workbench/src/scripts/client/assistant-island.ts`：`molis:assistant-open`、助理开场建议（不受影响）。
- `apps/workbench/src/side-panel.ts`：侧栏，`molis:side-open`。
- `packages/contracts/src/services/contextual.ts`：`SurfaceFocus`、事件常量、`ContextualCandidate`、陈列方案。

**Pages（浮条的外观来源，也是第一个迁移对象）**
- `plugins/native/pages/src/editor-browser.ts`：格式条 `pages-format-bar`（2990）、写作菜单 `openAi`（3248）、`placeToolbar`（3643）、`placeOverlay` / `pinAt` / `followScroll`（309–357）。
- `plugins/native/pages/src/client.ts`（225–335）、`floating.ts`、`styles.ts`（`.pages-format-bar` 约 318）、`actions.ts`、`fragment-offers.ts`。

**情境服务（Host）**
- `apps/local-host/src/contextual/`（`contextual-http.ts`、`contextual-service.ts`、`judgment-service.ts`）、`packages/kernel/src/contextual.ts`。
- `packages/contracts/src/platform/action-fragments.ts`、`action-offers.ts`、`placement.ts`；助理卡片 `POST /api/assistant/cards`（`apps/local-host/src/assistant/assistant-service.ts`）。

**右栏与左右互动**
- `apps/workbench/src/side-panel.ts`、`side-panel-files.ts`、`side-panel-browser.ts`：右栏壳、文件格、浏览器格；
- `apps/workbench/src/immersive-shell.ts`：`BAR_RESIDENT_IDS`（底栏 Shelf、灵光按钮）、侧栏按钮；
- `plugins/native/shelf/src/manifest.ts`（视图改为 side）、`search.ts`（文件来源保留）；`apps/desktop/src/shell.ts` 的 `molisWorkOpenShelf`、`apps/desktop/adapters/tauri/src/drop_wheel_macos.rs` 的 `over_shelf_panel`；
- `packages/im-ui/src/`：讨论格，消息的对象声明与输入框落点；
- `apps/workbench/src/scripts/client/assistant-island.ts`：情境条与助理面板作为位置（动工前通知助理面板线）。

**创建入口相关**
- 现有创建与选区动作：`plugins/native/todo/src/actions.ts`（`todo.items.create`、记成待办）、`lingguang/src/actions.ts`、`goals/src/fragment-offers.ts`、`packages/contracts/src/services/search.ts`。
- 内容站 `receive`：`packages/contracts/src/platform/workflow-content.ts`，实现在 form、lingguang、inbox、dataset、jelly、feed、ppt、pages 的 `content-actions.ts`。
- 工作流：`plugins/native/workflows/src/actions.ts`（`instances.start` 约 161）、`model.ts`。
- Coding：`plugins/native/coding/src/route-actions.ts`（只许本机本人的动作）、`routes.ts`（`steer` 约 1315）、`specs/coding-plugin/next-requirements.md`（C1、C4）。

**手册、模板、门禁**
- `skills/molis-plugin-dev/`（SKILL、process、placement、continuity、ui、examples）、`docs/platform/PLUGIN-DEVELOPMENT.md`、`tooling/plugin-cli/src/create.ts`。
- 冻结名单的先例：`tests/builtin-plugin-assembly-gate.test.ts`；开发要求门禁：`scripts/package-dev-requirements.mjs`。

**测试与切片**
- `tests/contextual-interaction.e2e.test.ts`、`pages-actions.e2e.test.ts`、`contextual-dock-parity.test.ts`、`contextual-fragment-offers.test.ts`、`pages-actions.test.ts`、`contextual-interaction.test.ts`：迁移时只改入口，不放宽断言。
- `scripts/contextual-slice/`：高保真切片的现成脚手架（`pnpm exec tsx scripts/preview-contextual-interaction.mts --port 4293`）。

## 要做什么（分期）

以总纲第 9 节为准：

| 波次 | 内容 | 状态 |
| --- | --- | --- |
| W0 | 总纲定稿；一个高保真切片同时演示左边选区浮条、右栏条目浮条与落点、拖放、推荐的创建动作、「✦」、落点处预览；两组 Jev 评估 | 未开始 |
| W1 共享件 | 浮条组件与定位；全部新合同；情境中枢扩展；起草服务；SDK 页面端模块；目录检查与覆盖率门禁骨架；第一份 `contextual.md` | 未开始 |
| W2 | 外壳换成浮条 + Pages 迁移（同一 PR 分提交） | 未开始 |
| W2' | 右栏改版 | 未开始 |
| W3 | 右→左、落点、助理情境条与助理面板作为位置 | 未开始 |
| W4 | F1 创建入口第一批 + F2（`find`）+ F3，插件页与右栏格的「✦」 | 未开始 |
| W5 | 拖放 | 未开始 |
| W6 | Shelf 动作进池、左→右、F8 = Shelf、F12 讨论输入框 | 未开始 |
| W7 起 | F4、F13，然后 F6、F7、F10，旁问与分叉，最后 F9；存量补齐 | 未开始 |

## 分工与接口（两个会话时的建议）

- **会话 A：浮条主体**（S0 → S1 → S2+S3）。拥有：`context-actions.ts`、设计系统的浮条组件和样式、Pages 迁移、`contextual.ts` 里的 `anchor` / 工具 / 面板槽类型。
- **会话 C：右栏与左右互动**（W2' → W3 → W5 → W6）。拥有：右栏壳与各格、Shelf 进右栏、底栏按钮、落点（`molis:surface-landing`、`molis:landing-at`）、`ItemAttach.positions` 的派生与落点处预览、助理情境条与助理面板作为位置（与助理面板线约定后）、im-ui 的落点。
- **会话 B：创建入口**（Q1 → Q2）。拥有：新的 `item-intake.ts`、`apps/local-host/src/` 下新的起草服务、内容站幂等键泛化、各插件的创建入口声明、覆盖率门禁的骨架和「待补」名单。
- **接口**（先在设计稿里钉死，再各自写；C 加的接口见总纲第 4 节：`SurfaceFocus.place / side_tab`、`SurfaceLanding`、`ItemAttach.positions`、「页面自己陈列动作」字段）：①创建候选的键 `intake.<provider>.<intake_id>`，进 `ContextualCandidate`，由 B 派生、A 渲染；②面板槽事件 `molis:context-panel-open`，A 提供，B 的预填卡片和结果提示使用；③结果提示（「已记成待办 · 撤销 · 改放到」）的容器由 A 提供、B 填内容。
- **会冲突的文件**：`contextual.ts`、`context-actions.ts`、`packages/kernel/src/contextual.ts`、`apps/local-host/src/contextual/*`；A 与 C 还都改底栏（`assistant-dock.ts`、`craft-finish.ts`、`immersive-shell.ts`）。谁先改谁在会话里告知另一方；`contextual.ts` 里 A 加的类型和 B 加的候选键类型分开放。
- B 的 Q1 不依赖浮条（插件页「✦」独立可用），可以和 S0 / S1 并行；Q2 里「浮条里的推荐」要等 A 的 S2 落地。

## 约束

仓库级（`AGENTS.md`）：
- 插件不 import 另一个插件的实现；能力注册一次，由目录供页面、工作流、Agent、MCP 使用，不另写名单、不在外壳里按 `plugin_id` 分支；
- 模型调用只经 `horizontal/agent-host`；等模型的动作声明 `scheduling: "concurrent"`，返回后 `beforeEffect()` 再按读取时的版本提交；
- 可信身份（actor、项目）从调用上下文来，不从输入读；
- 结果合同读取兼容、写入严格（内容站幂等键泛化是唯一改既有合同处）；
- 单包构建 `pnpm --filter <包> run build`；改过 `*/src` 后跑全量前先整体 `pnpm build`；全量回归期间不改源码、脚本、`package.json`、`skills/`；
- 测试用 `node scripts/run-tests.mjs <文件…>`；不为变绿而放宽、跳过、删除断言；判断是否自己引入的失败，用干净的基线工作树对照；
- 开工前看 `git worktree list`；不重置、不覆盖别人的未提交改动；不动主检出（它常被真实 Home 的 4207 服务使用）；推送、开 PR 前先问用户。

本任务特有：
- 动态动作的逻辑（候选、判断、陈列、冻结、记忆信号）不改，只换显示的地方、加来源（右栏、助理面板）；
- 总纲 3.7 的守则；放进落点一律先预览确认；Shelf 格里浮条不重复 DropAgent 动作栏的动作；
- 浮条不抢焦点（浮条上的 `mousedown` 一律 `preventDefault`），选区高亮不变；浮条画在拥有选区的那个文档里，分屏窗格自画；
- 创建类候选只在推荐位出现，不进「更多」和「全部操作」；Shelf 这类仅本人可见的来源，选区不进判断模型；选区文字进模型前先 `redactText`、`screenInbound`；
- Coding 这类只许本机本人的动作（`LOCAL`）不进 Agent / MCP 受众；
- 界面遵守 `DESIGN.md`：浮层只用 `--shadow-raised`、不描边；动效只用 `--dur-*`；深色、窄屏、减少动画、读屏都要走一遍。

## 工作方式

- 需要用户拍板的事，用弹窗（AskUserQuestion）问，带方案和「（推荐）」；先把能独立做的做完，再攒一批问；
- 设计稿里标「待核对」的事（生成插件的绘制处能否代写对象声明、Goals 事件类动作的能力名、记忆合同有没有显式写入入口、Shelf 是否有创建文字材料的动作）开工前先核对，结果写回设计稿；
- 进度与证据写回 `specs/context-toolbar/spec.md`（浮条）和 `specs/quick-create/spec.md`（创建入口），不另开进度文件；
- 任务做完按 `specs/README.md` 归档。

## 第一步

读完上面的文件后，用一段话回复：你认领哪一块、你理解的接口、还有哪些「待核对」的你会先查。**先不要写代码。**
