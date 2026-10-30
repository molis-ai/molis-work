# C9：删 `coding-surface.ts`，Coding 的页面与伙伴舞台由插件自己的声明画

状态：2026-10-24，`claude/ac-coding-c9` 上做完，叠在 #1107（W5-06 项目舞台）之上，等 PR 评审与统筹跑全量（本机没有跑浏览器用例和全量）。

## 目标、证据与边界

PG-036 / PG-037 / PG-091 / PG-099：`apps/local-host/src/coding-surface.ts` 是宿主里写死的 Coding 族——Coding 的目录面板与工作面、Files / Git / Diff / Text Stats 四个伙伴舞台、Coding 页里嵌入的 Files 与 Git 的目录和阅读器、`codingRouteHooks`、`failedStage`。#1107 让项目页的舞台按声明从运行中的实例画，本片把 Coding 族接上去，然后删这个文件。

只改 Host 怎样画、怎样取，不改 Coding、Files、Git、Diff、Text Stats 的动作与路由（动作快照没有变化），也不改它们的客户端脚本：伙伴舞台的 `data-coding-companion` / `data-companion` 钩子和里面的 `data-files-*`、`data-git-*` 原样保留，所以页面资源的字节没有变。Alchemist 与创作台那一半的 PG-099 死代码本轮不删（用户 10-23 定）。

## 方案与取舍

- **Coding 的页面。** `codingUiView` 的 `workbench` surface 进主区，由 #1107 的通用通道（`renderProjectRuntimeStages`）从运行中的实例画；Coding 在 `registration.workbench.contributions` 里列出它。目录 surface 的参数（`face`、`filter`、`tools`、`workspace_path`）有默认值，目录当场渲染等不了一次动作，Goal 标题第一次绘制给 id（与 W5-01-CODING-20 已记录的预期变化相同）。
- **伙伴放进别人的页面。** 合同 `UiNestedContentModel`（`contracts/platform/ui`）：父页的模型可带 `nested[slot_id]`。Coding 的描述符声明两个槽 `coding.companion-directory`、`coding.companion-result`（`declarative-html`）；Files、Git 各有两个 surface 指向它们。宿主的 `nestedContent` 按 Manifest `ui.embedded_plugins` 的次序，把运行中的嵌入插件指向该槽的 surface 用页面自己的模型画出来拼成 `nested`，不认识任何插件。嵌入的插件没在跑或它的 surface 出错，该槽为空（`hostLog.warn`），页面照常画。
- **伙伴自己的舞台。** Files、Git 画 `renderCompanionBrowserStage`，Diff、Text Stats 画 `renderCompanionListStage`（`design-system/companion-stage`）：同一套外壳与钩子，词用各插件自己的稳定键（`files.stage.*` 等，中英都在插件的 `messages.ts`）。所以 Files、Git 的包多了对 design-system 的依赖，登记在 `scripts/workspace-packages.mjs` 与两份 README。
- **不可用时。** 伙伴没有页面或读取失败，用 #1107 的“不可用”外壳带原因，不再是 `failedStage` 的宿主文案；也不再把伙伴的目录片段无条件塞进 Coding 页（以前不管 Files 在不在跑都注入）。
- **`codingRouteHooks`。** 它做的是“读 Files 产物的插件先刷新一次 Files”，与 Coding 无关，改名为 `filesOutputsRefresh` 并搬到 `project-plugin-input-refresh.ts`（文件名不能以插件名起头，否则 Files 会进 HYBRID 清单）。这个钩子已由 BL-521 第二片删掉（工作区设置的变化广播 `host.workspace.changed@1`，Files 自己重读），整个文件与 20 个测试里的传参一并删。
- **门禁。** HYBRID 清单去掉 `coding`（只剩 `shelf`）；`W5-01-GIT-01` 收紧为只有监督器 import Git 包；`error-owners.json` 里 `coding` 的 `apps/local-host/src/coding-*` 已无文件，条目删除（Coding 包自己的主人名按目录自动给）。
- **没做的。** Alchemist / 创作台的 PG-099 死代码；`codingRouteHooks`（后来的 `filesOutputsRefresh`）的最终删除（BL-521 第二片已做）；PG-091 里与 Coding 无关的剩余项。

## 验收标准

- **RAC-433**：Coding 的页面是运行中实例经通用通道画的，Files、Git 的目录与阅读器按 `embedded_plugins` 的次序在槽里。证明：`tests/coding-companion-stages.test.ts`。
- **RAC-434**：四个伙伴自己的舞台保留客户端要的钩子，词用插件自己的稳定键；列表型伙伴在 Files 显示时指向 Files，否则指向市场。证明：同上。
- **RAC-435**：嵌入的插件没在跑，它的槽为空，Coding 页与其余伙伴照常画。证明：同上。
- **RAC-436**：嵌入的 surface 出错，它的槽为空，页面照常画，它自己的舞台是“不可用”外壳。证明：同上。
- **RAC-437**：伙伴没有页面时得到带原因的“不可用”外壳，其声明的舞台不再被目录路径画第二遍。证明：同上。
- **RAC-438**：`coding-surface.ts` 已删，Coding 不在 HYBRID 清单，宿主里只有监督器 import 四个伙伴包（Files 另有输入刷新钩子取它的插件标识），舞台模块不点名任何插件。证明：同上与 `tests/builtin-plugin-assembly-gate.test.ts`。
- **RAC-439**：留下的路由钩子按它做的事命名，只在消费者读 Files 产物时读 Files。证明：`tests/coding-companion-stages.test.ts`、`tests/plugin-route-operations.test.ts`。
- **RAC-449**：伙伴插件放进 Coding 页的每个 surface 都指向 Coding 声明的槽，格式是槽接受的。证明：`tests/coding-companion-stages.test.ts`。

沿用并改接的断言：`tests/coding-surface.test.ts`（面板来自运行中的插件，用 `tests/fixtures/coding-view.ts` 取页面）、`tests/goals-project-database-refusal.test.ts`、`tests/project-plugin-database-refusal.test.ts`，以及 `PG062-04/09/13` 三条“宿主不再画/不再加料”的源码断言（原来读 `coding-surface.ts`，现在读接手它的两个文件，名单一个没少）。

## 对调用方的影响

- 合同 `contracts/platform/ui`（API 快照已刷新）：新增 `UiNestedContentModel`；没有改已有形状。
- `apps/local-host` 的导出：去掉 `codingDirectoryPanel`、`codingWorkbenchPanel`、`builtinStagePanels`、`codingCompanionStages`、`codingRouteHooks`、`CodingSurfacePorts`；新增 `filesOutputsRefresh`、`renderProjectRuntimeStages`、`ProjectPluginSurfacePorts`。
- 页面可见变化：伙伴目录片段只在伙伴在跑时出现；伙伴不可用时是“不可用”外壳；其余 DOM 与钩子不变，客户端脚本与页面资源字节不变。

## 与在途 PR 的重叠

叠在 #1107（`apps/local-host/src/project-plugin-stages.ts`、`web-goals-read.ts`、`apps/workbench/src/declared-stages.ts`）之上，目标分支是它的头。#1130 / sc4b 改的是助理一侧，不碰这些文件。BL-366 / BL-521（ac-kernel）要改 `project-plugin-input-refresh.ts`，不再是 `coding-surface.ts`。

## 验证

本机：全量 `pnpm build`；`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`、`pnpm secrets:check`、`node scripts/gates/page-assets.mjs --base origin/main`（字节不变）、翻译门禁；`tests/coding-companion-stages.test.ts` 与 24 个直接相关的非浏览器用例。没有跑浏览器用例和全量。
