# Artifact 定位与动线梳理，所有插件统一进同一个壳子

状态：核实与排查中（2026-10-02 起）。用户在防腐收尾目标进行中追加，标为严重问题；与[合入后审查](../post-merge-review/spec.md)、[防腐整理](../repository-anti-corruption/spec.md)同一目标推进。本文是这件事唯一的进度与证据记录。

## 0. 任务要求（用户 2026-10-02 原文要点）

**问题**（开工前逐条核实，补上遗漏）：

1. 一个词指了好几样东西：平台版本库；插件之间的交换数据（文件快照、变更集、Git 回执、Coding 计划）与用户成果进同一个库、同一个列表；助理工作的「成果」是指向任意对象的关系；「固定版本」与「放在哪里」的复制、关联语义重叠。
2. 生产了没人读：Pages、问卷、数据表、PPT、Shelf、角色都能存固定版本；Artifacts 页只显示导入文档和写死的 Coding 报告与变更，其余显示「没有兼容插件」和原始 JSON；生产方读回版本只用在「恢复发布」。
3. 有读的地方却没有写入方：Goal 页「输入 / 产出成果」读 `goal.output` 与 `goal.input`，没有写 `goal.output` 的地方，`goal.input` 只指向 Feed；空状态「推进 Goal 后提交成果」没有路；`goal.delivery` 只在演示数据里。
4. 声明和实际对不上：Feed 实际写 `feed.capture`，manifest 声明不产出；侧栏「文件」把所有成果标成 `text/markdown`；类型显示名写死在 Artifacts 插件里。
5. 入口重复、命名不一：Artifacts 页与 Pages 各有一套文档导入；导航显示英文「Artifacts」，别处叫「成果」。
6. 有插件页面脱离工作台成了独立页面，**完全不允许**：Artifacts 直达或刷新 `/artifacts` 返回整页，`/artifacts/import` 永远是整页；疑似还有安装插件的独立工作区、创作台与试用预览与生成插件（「单独打开试用」「打开 vN」新标签页）、炼金术士「历史演示记录」、各设置页。要求全部路由排查。

**要做成什么样**：

- 定位：Artifact 只表示「某个工作对象在某一刻固定下来、可以引用的版本」。工作对象、固定版本、插件交换数据三者在合同、存储、界面上分开；交换数据不出现在用户的成果、搜索和侧栏里。
- 每个固定版本记得来源（对象与当时修订号）：能打开原文，能看到「原文已改，这里仍是第 N 版」，能从某一版继续编辑。
- 每种可见类型都有完整消费方，消费方只有四类：预览和导出；被引用（Goal 交付物、助理工作结果、文档引用）；作为输入（插件端口、工作流步骤）；从这一版继续。不许只写不读或只读不写。
- 动线：做完 → 存为固定版本 → 交付到目标或交给助理 / Coding；完成目标时选交付物，Goal 页看得到；成果页看得出每一版从哪来、被谁引用；导入外部文档只有一个入口，结果是可继续编辑的对象。
- 同一个范式、同一个壳子：插件只提供内容，挂在工作台的位置（目录、主区、浮层、设置、侧栏）；不自己出整页、不带返回链接、品牌、侧边导航或页面级布局；标签、前进后退、底栏、组件与样式同一套；任何直达链接都打开工作台并定位；导入、预览、试用、历史记录在工作台里以标签、浮层或侧栏打开；例外写成明确清单（导出给别人用的文件、发给别人的问卷填写页、打印、宿主排版的侧栏文档、外部链接等）。
- 门禁：manifest 声明与实际写入一致；可见类型必须有预览；交换数据不进用户可见列表；除工作台和例外清单外没有路由返回完整 HTML；插件内容里不出现自带页面外壳；站内链接不跳出工作台。

**约束**：定位、交换数据放哪、导入归谁、Goal 交付怎么做、各独立页面怎么并进工作台、例外清单，都先弹窗问；不留旧格式兼容，旧独立页直接删、不留跳转；涉及真实 Home 数据先问；一个主题一个 PR；界面改动在隔离 Home 上用浏览器走查桌面与窄屏。

**完成标准**：每个问题有核实结论与处理结果；每条目标有测试与隔离 Home 操作记录；独立页面清单每项已并入、删除或列入例外并说明理由；改动已合入或 PR 已开、CI 通过、等合并；做不了的写进待决并附推荐。

## 1. 决策记录与待决事项

| 日期 | 事项 | 选项 | 结论 | 说明 |
| --- | --- | --- | --- | --- |
| 2026-10-02 | Artifact 的最终定位 | 只是固定版本（推荐）；成果库：版本加导入文件；并进「放在哪里」 | 成果库：版本加导入文件 | 「成果库」收两样：工作对象在某一刻固定下来的版本（记来源对象与修订号），以及导入的外部文件（任何格式，保留原件）。工作对象本身仍在各自插件里可改 |
| 2026-10-02 | 插件之间的交换数据放在哪里 | 各自 owner、不进版本库（推荐）；同一个库打标记过滤；平台单独交换库 | 用户原话：「own plugin, but should be process item that artifact can trace and linked」 | 交换数据（文件快照、变更集、Git 回执、Coding 计划）存在产生它的插件里，作为「过程项」；不进成果库、搜索与侧栏文件；成果库里的版本能追溯并链接到产生它的过程项（例如 Coding 交付的一版能看到对应的变更集与 Git 回执） |
| 2026-10-02 | 导入归谁 | 归 Pages（推荐）；归成果、再「从这一版继续」；归 Shelf | 用户：导入的可能是任何形式的文件，不只是文档；追问确认：只从成果库导入 | 只有一个导入入口：成果库，接受任何文件，在工作台里以浮层打开；文本文档可「从这一版继续」进 Pages 编辑，其他文件有预览与下载；删掉 Pages 自己的导入与 `/artifacts/import` 整页 |
| 2026-10-02 | Goal 交付怎么做 | 完成时选交付物、当场固定（推荐）；只能选已有固定版本；删掉输入/产出区块 | 完成时选交付物，当场固定 | 完成 Goal 时选交付物：已有版本，或任意工作对象当场固定一版（记来源与修订号），写 `goal.output`；Goal 页显示交付了什么，成果库显示被谁引用；助理与 Coding 可以提议，用户确认；`goal.input` 同理 |
| 2026-10-02 | 创作台、试用预览、生成插件（P5–P7） | 创作台去框、生成代码留沙箱（推荐）；全部留框只是不再跳出；全部去框 | 创作台去框，生成代码留沙箱 | 创作台直接作为工作台的插件面渲染；试用与已安装的生成插件留在沙箱 iframe 里，但只在工作台里打开（标签或舞台），框内文档不带品牌、返回链接与「编辑新草稿」条，列入例外（理由：沙箱）；直达这些路由时打开工作台定位；「单独打开试用」「打开 vN」改为工作台标签 |
| 2026-10-02 | 炼金术士「历史演示记录」（P8） | 删掉（推荐）；并进工作台 | 删掉 | 删链接、`/api/alchemist/studio/legacy` 路由与读取代码 |
| 2026-10-02 | 设置页（P10、P11、P21） | 并进工作台的设置位置（推荐）；项目设置并进、全局留整页；保持整页列例外 | 并进工作台的设置位置 | 全局与项目设置都在工作台里以设置面打开；直达 `/settings/...` 打开工作台定位到分区；插件里的「去设置」链接在工作台里切面；删设置整页 |
| 2026-10-02 | 协作服务 `/continuity`、`/im`（P16） | 列入例外（推荐）；并进工作台 | 列入例外 | 给其他设备与成员用的独立服务页，与「发给别人的问卷填写页」同类；本工作台里的 IM 只用嵌入的面，工作台里没有跳到它们的链接 |
| 2026-10-02 | Shelf 网页版打开文件（P19） | 工作台里预览、不支持的下载（推荐）；列入例外 | 工作台里预览，不支持的下载 | 图片、PDF、文本等浏览器能显示的在工作台标签或侧栏预览，其余下载；桌面版仍交给系统打开 |
| 2026-10-02 | 例外清单 | 进入页（项目选择与 Onboarding）；桌面菜单栏胶囊；开发规格板；宿主 404 页 | 前三项列入例外；404 不列 | 例外清单见 §5；未知地址改为打开工作台并说明找不到 |

**待决**：无。实施中再出现的取舍按「先弹窗问」处理。

## 2. 问题核实（main 1245da7f）

| # | 结论 | 证据 |
| --- | --- | --- |
| 1 | 成立 | 交换数据类型 `files.snapshot.v1`、`files.collection.v1`、`diff.changeset.v1`、`git.result.v1`、`coding.changeset.v1` 定义在 `packages/contracts/src/modules/workspace-artifacts.ts`，并在 files 等插件的 manifest 里声明为 `artifacts.produces`（如 `plugins/native/files/src/manifest.ts:63`），与 Pages、问卷、数据表、PPT 的固定版本同一个库。助理工作「成果」与「放在哪里」的语义待在动线走查里补证据 |
| 2 | 成立（待界面走查补证） | 可见类型：`io.molis.work.pages.document`、`ppt.deck`、`form.questionnaire`、`dataset.table`、`feed.capture`、`document`（导入）、`coding.report.v1`、`coding.changeset.v1`、`character.definition.v1`、`alchemist.research`、`goal.delivery`。`artifacts` 浏览只给 `DOCUMENT` 类型与宿主写死的 Coding 报告、变更做预览（`apps/local-host/src/artifact-native-plugin-http.ts:84`） |
| 3 | 成立 | `goal.output` 只在读取方出现（`plugins/native/artifacts/src/actions.ts:85`、`goal-context.ts:23`），没有写入方；`goal.input` 由 `modules/goals/src/input-bindings.ts` 写，调用方是 Feed 提升到 Goal（`apps/local-host/src/feed-goal-promotion.ts`、`plugins/native/feed/src/goal-promotion.ts`）与 Goals 的输入动作；`io.molis.work.goal.delivery` 只在演示数据里 |
| 4 | 成立 | Feed：`plugins/native/feed/src/out-rules.ts:235` 写 `io.molis.work.feed.capture`，manifest `artifacts: { produces: [] }`（`plugins/native/feed/src/manifest.ts:35`）。侧栏文件：`plugins/native/artifacts/src/actions.ts:111` 对所有记录写 `media_type: "text/markdown"`，而且交换数据也在这个列表里。类型显示名写死在 `plugins/native/artifacts/src/browser-ui.ts:10-14` |
| 5 | 成立 | 两套导入：Artifacts 的 `/artifacts/import`（`plugins/native/artifacts/src/import-ui.ts`）与 Pages 的导入（`plugins/native/pages/src/actions.ts:81-84`、`ui.ts:72`）。英文名：`plugins/native/artifacts/src/manifest.ts:22`、`browser-ui.ts:177`、`apps/workbench/src/tab-workspace-ops.ts:41`、`artifact-ui.ts:134` |
| 6 | 成立，且不止这些 | 见 §3 |

## 3. 独立页面与跳出工作台的排查清单

排查方法：全仓源码里返回完整 HTML 文档（`<!doctype html>`、`<html>`、`renderWorkbenchDocument`）的地方、所有 `text/html` 响应、站内的新标签页链接（`target="_blank"`、`window.open`）。外部网站链接不在清单里，按例外处理。

| # | 入口 | 现状 | 位置 | 初判 |
| --- | --- | --- | --- | --- |
| P1 | `/artifacts`、`/artifacts/<版本>` 直达或刷新 | 整页：自带侧栏、标题「Artifacts」与样式；只有带 `x-molis-work-fragment` 的请求才给片段 | `apps/local-host/src/artifact-native-plugin-http.ts:111`、`apps/workbench/src/artifact-ui.ts` | 并进工作台：直达打开工作台并定位到成果与版本；删整页渲染 |
| P2 | `/artifacts/import` | 永远是整页，「导入文档」点下去离开工作台 | `artifact-native-plugin-http.ts:62`、`plugins/native/artifacts/src/import-ui.ts` | 取决于「导入归谁」 |
| P3 | `/plugin-builder` | 旧的解释器创作台，整页 | `apps/local-host/src/plugin-builder-surface.ts:83` | 工作台入口已换成新创作台，疑似死路由，删 |
| P4 | `/plugins/io.molis.work.generated.*` | 旧生成插件的独立页，自带「编辑新草稿」条 | `plugin-builder-surface.ts:90-95` | 同上，删 |
| P5 | `/plugin-builder/studio` | 新创作台整页，工作台用 iframe 框起来 | `apps/local-host/src/plugin-builder/agent-surface.ts:371`、`plugin-builder-surface.ts:127` | 问用户 |
| P6 | `/plugin-builder/studio/preview/<构建>` | 试用预览整页；「单独打开试用」新标签页 | `agent-surface.ts:372`、`plugins/native/plugin-builder/src/agent-studio.ts:249,265` | 问用户 |
| P7 | `/plugins/<生成插件>`（已安装的 Agent 构建插件） | 整页，工作台舞台里用 iframe 框起来；「打开插件」「打开 vN」新标签页 | `agent-surface.ts:365,374`、`agent-studio.ts:204` | 问用户 |
| P8 | `/api/alchemist/studio/legacy` | 「历史演示记录」新标签页 | `plugins/native/alchemist/src/client-views.ts:68` | 问用户（保留还是删） |
| P9 | `renderPluginPageWorkspace`（页面型插件的独立工作区，自带品牌与侧边导航） | 公开出口，仓内没有生产调用方，只有测试 | `apps/workbench/src/plugin-page-workspace.ts`、`tests/plugin-page-workspace.test.ts` | 删（连同出口与测试） |
| P10 | 全局设置 `/settings`、`/settings/<分区>`、`/settings/<插件>`、`/capabilities/*` | 整页，自带设置导航 | `apps/local-host/src/web-catalog.ts:204-375`、`apps/workbench/src/settings-renderer.ts:266` | 问用户：设置是否属于工作台的「设置」位置 |
| P11 | 项目设置 `/projects/<id>/settings/*`、规划方法页 | 整页 | `apps/workbench/src/project-settings-pages.ts:87,143`、`apps/local-host/src/web-goals-read.ts:57`、`web-planning.ts` | 同 P10 |
| P12 | `/`（项目选择）、`/onboarding` | 宿主的进入页（arrival 外壳，与工作台共用底栏） | `web-catalog.ts:400`、`web-onboarding.ts:145`、`apps/workbench/src/arrival/shell.ts` | 不是插件；拟列入例外，问用户 |
| P13 | `/desktop/capsule` | 桌面菜单栏胶囊窗口 | `web-catalog.ts:177`、`apps/desktop/src/capsule-shell.ts` | 原生窗口，拟列入例外 |
| P14 | `/__ui/catalog`、`/__ui/catalog/bar` | 开发用规格板 | `web-catalog.ts:186-201`、`apps/workbench/src/primitive-catalog.ts` | 开发工具，拟列入例外 |
| P15 | `/projects/<id>/side/<插件>/<视图>` | 宿主排版的侧栏文档 | `apps/local-host/src/web-request.ts:187`、`apps/workbench/src/side-view-document.ts` | 用户已列为例外 |
| P16 | 协作服务 `/continuity`、`/im` | 另一个进程（`server/`）的整页 | `server/src/http.ts:58-61`、`packages/im-ui/src/page.ts` | 问用户 |
| P17 | 未找到的页面 | 宿主自己的 404 整页 | `web-request.ts:191` | 拟改为打开工作台并说明找不到 |
| P18 | 站内新标签页：`/api/project-references/<引用>` | Artifacts 内联引用、Goal 历史附件在新标签页打开 | `plugins/native/artifacts/src/reference-ui.ts:46`、`plugins/native/goals/src/event-history-body.ts:169` | 改为在工作台里定位 |
| P19 | Shelf 打开文件（网页版） | 原生里交给系统打开；网页里 `window.open` 新标签页 | `plugins/native/shelf/src/client.ts:1005` | 问用户（算导出还是要在工作台预览） |
| P20 | 导出与打印 | 问卷填写页导出、Pages 导出 HTML、Jelly 导出、PPT 打印 | `plugins/native/form/src/fillpage.ts`、`plugins/native/pages/src/client.ts:734`、`plugins/native/jelly/src/markdown.ts:95`、`plugins/native/ppt/src/client.ts:126` | 用户已列为例外 |

| P21 | 插件与工作台里指向设置整页的链接 | 「去设置模型」「连接」等 30 多处 `href` 指向 `/settings/models`、`/settings/connectors`、`/capabilities/*` 等，点了离开工作台进 P10 的整页 | 如 `apps/workbench/src/**`、`plugins/native/*/src` 里的 `/settings/models` 9 处、`/settings/connectors` 5 处、`/capabilities/connections` 3 处 | 随 P10 的决定处理 |
| P22 | 下载 | Cognia 素材下载、Experiments 导出、Artifacts 导出 JSON | `plugins/native/cognia/src/client.ts:70`、`plugins/native/experiments/src/client.ts:114`、`artifact-native-plugin-http.ts:73` | 下载文件，拟列入例外 |

站内链接的统计口径：UI 源码里以 `/` 开头的 `href` 按路由归类（设置 30 余处、`/projects/`、`/goals/`、`/decisions` 属于工作台）。Feed 素材、Coding 与 Git 里的链接都是外部网址，按「外部链接」例外处理。

## 5. 例外清单（已定）

只有下面这些可以返回完整 HTML 或在新标签页打开，其余一律并进工作台或删除；门禁按这张表放行。

| 例外 | 路由或入口 | 理由 |
| --- | --- | --- |
| 进入页 | `/`（项目选择）、`/onboarding` | 打开任何项目之前的宿主进入页，与工作台共用底栏与组件；不是插件 |
| 桌面菜单栏胶囊 | `/desktop/capsule` | 原生小窗，不是浏览器页面 |
| 开发规格板 | `/__ui/catalog`、`/__ui/catalog/bar` | 只给开发者 |
| 宿主排版的侧栏文档 | `/projects/<id>/side/<插件>/<视图>` | 用户在任务里列为例外 |
| 导出、打印与下载 | 问卷填写页导出、Pages 与 Jelly 导出、PPT 打印、Cognia 素材下载、Experiments 与成果导出 | 给别人用或存到本机的文件 |
| 沙箱框里的文档 | 试用预览、已安装的生成插件 | 生成代码要隔离；只在工作台的标签或舞台里打开，框内不带品牌、返回链接或自带导航 |
| 协作服务 | `/continuity`、`/im`（独立部署的 `server/`） | 给其他设备与成员用 |
| 外部链接 | 外部网站 | 侧栏浏览器或新标签页 |

## 4. 进度

- 2026-10-02：建 spec；问题 1–6 初步核实；独立页面排查第一轮（上表）。
