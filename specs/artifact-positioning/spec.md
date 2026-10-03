# Artifact 定位与动线梳理，所有插件统一进同一个壳子

状态：壳子 S1–S7 已合入 main，S4（#197）与 S1b（#198）待合并；成果库 A1–A7 未开始（2026-10-02 起）。用户在防腐收尾目标进行中追加，标为严重问题；与[合入后审查](../archive/post-merge-review/spec.md)、[防腐整理](../repository-anti-corruption/spec.md)同一目标推进。本文是这件事唯一的进度与证据记录。

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
| 2026-10-02 | 例外清单 | 进入页（项目选择与 Onboarding）；桌面菜单栏胶囊；开发规格板；宿主 404 页 | 前三项列入例外；404 不列 | 例外清单见 §4；未知地址改为打开工作台并说明找不到 |
| 2026-10-02 | S6 的范围 | 按授权的常规取舍 | 只做设置；能力页并进设置面另做 S6b | 能力页（`/capabilities/*`）现在在工作台的能力面里用框打开，直接访问仍是整页；把它变成设置面里的片段，要把它的脚本改成可绑定、GET 筛选表单改成就地重载，量不小，单独一片 |
| 2026-10-02 | `/settings/projects`（全部项目的管理页）怎么并 | 按授权的常规取舍 | 在工作台设置面里作为不在列表里的分区打开 | 和项目设置里的「工作规划」一样，只从链接进（Onboarding「查看项目设置」、没有项目时的页面）；它的脚本改成可按根节点绑定 |
| 2026-10-02 | S6 走查发现的设置面缺口 | 按授权的常规取舍 | 一并修 | 刷新后停在原分区与原页面（读页签历史）；设置面里的编辑层与保存中的表单拦住 Esc；分区里打开过的内页不再冒充分区首页；直接访问保留 `desktop=1`；删除项目对话框的尺寸在工作台里同样生效；规划编辑保存中点「取消」不再离开 |
| 2026-10-02 | S6 走查发现、main 上已有的两个缺陷 | 按授权的常规取舍 | 各开一个 PR，S6 叠在上面 | [#189](https://github.com/molis-ai/molis-work/pull/189)：工作台里项目规则脚本绑到 Goal 的规则表单，保存 Goal 规则会顺带改写项目默认规则；[#190](https://github.com/molis-ai/molis-work/pull/190)：本地链接加前缀的正则误改 `data-project-directory-href`，在工作台里删除项目后落到已删项目的错误页 |
| 2026-10-02 | #177 漏改的测试 | 按授权的常规取舍 | 开 [#191](https://github.com/molis-ai/molis-work/pull/191) 修测试 | `tests/artifact-browser.test.ts` 在 main 上 8 条失败：S2 只跑了自己改过的浏览器用例，没覆盖同一路由的 Node 用例。以后改一个路由的响应，先 grep 所有读这个路由的测试一起跑 |
| 2026-10-02 | 没有项目时，全局设置的直接访问去哪（弹窗） | 进个人空间的工作台（推荐）；保留设置整页、列入例外；回项目选择页并提示 | 保留设置整页，列入例外 | 归「进入页」：还没有任何项目时（如首次安装后先配模型），`/settings/*` 仍显示整页；有项目后一律进工作台。例外清单 §4 已补 |
| 2026-10-02 | 合并哪些（弹窗） | #189 + #190（推荐）；#188；#186；#192 | #189 + #190 | 两个均已合入 main（a7e8b73f、69749a7a）；#188、#186、#192 下一批再问 |
| 2026-10-02 | 合并哪些（弹窗，第二批） | #191（推荐）；#188 + #193（推荐）；#186 + #187；#192 | #191；#188 + #193 | 三个均已合入 main（1d287a40、e259b956、65979bf0）；#186、#187、#192 下一批再问 |
| 2026-10-02 | 能力怎么并进设置（S6b） | 按授权的常规取舍（用户已定「设置并进工作台的设置位置」，S6 方案写明能力就是设置的几个分区） | 能力的四页成为全局设置的四个分区 | 「能力库、服务连接、对外接入、调用记录」取代原来那一行「能力」（打开框的封面）；页面仍由 `/capabilities/<页>` 提供，工作台用 fetch 读入设置面；规则编辑器作为能力库里的内页。框与它的封面删掉。没有项目时 `/capabilities/*` 与设置一样仍是整页（同一条例外） |
| 2026-10-02 | 合并哪些（弹窗，第三批） | #195 S6b（推荐）；#186 S3 + #187 S5（推荐）；#192 + #194 文档 | #195；#186 + #187 | 文档两个下一批再问 |
| 2026-10-03 | 旧创作台的 `builder.builds.*` 动作（S1b，弹窗） | 随旧系统一起删（推荐）；删旧系统、给新创作台补上同类能力；先不删旧创作台 | 随旧系统一起删 | 这些动作只作用于旧创作台的草稿，S4 之后没有任何界面显示它们。与旧页面、旧路由、灵感库示例一起删，不留兼容；Home 里的旧草稿与旧生成插件不迁移（用户在 PMR-22 定的「当做没有旧版数据」）。能力目录少约 10 项；新创作台的路由不变 |
| 2026-10-03 | 合并哪些（弹窗，第四批） | #196 S7 整页门禁（推荐）；#192 + #194 文档 | 两项都选 | 三个均已合入 main（34434590、05ab4511、e9eccf25） |
| 2026-10-03 | 用户外出期间怎么拍板 | — | 用户：「我回来之前都授权你按推荐执行（如有需要我确认的），我回来会告诉你，到时候请总结一下哪些东西是需要我确认结果按你推荐执行的」 | 期间本该弹窗问的事按推荐直接做，逐条在本表标「代为决定」，用户回来时汇总。不可逆、又不是代码合并的事仍然等用户：真实 Home 的数据操作、删别人的分支或工作树、删 vendored 文件、推 Prologue 上游、改仓库设置 |
| 2026-10-03 | 合并 #197、#198、#199（代为决定） | 按推荐全部合并 | 已合并 | S4 02af2aa1、S1b 8086f612、文档 af9d6d56。#198 在 #197 合入后与 main 冲突，合入 main 后重跑门禁再合 |
| 2026-10-03 | A6「成果」统一到哪 | 按授权的常规取舍 | 成果库与它的版本一律叫「成果」 | 导航、标签页、插件名、空态与错误提示里的「Artifact(s)」都改成「成果」。Goals 证据类型的「产物」与 Coding 的「产物」面不改：它们指运行产出，A2 之后属于过程项，不是成果。Text Stats 的市场简介原写「查看材料与成果的文本统计」，它统计的是文件快照，改为「统计文件快照的字数、字节与行数」 |
| 2026-10-03 | 交换数据怎么搬出成果库（A2 实现方式，代为决定） | 并列的过程项存储、同一套版本引擎（推荐）；每个插件自己的私有存储；成果库里打标记过滤 | 并列的过程项存储 | 用户已定「各自 owner、不进版本库，但要能被成果追溯、链接」。私有存储要求跨插件读取改走插件间调用，端口、Coding 材料、Shelf 接收都要重写；打标记是用户没选的「同一个库打标记过滤」。并列存储按生产插件归属、只有它能写，引用形状不变，消费方不用改 |
| 2026-10-03 | Shelf 交给项目的材料、Coding 的计划与变更集算哪一类（常规取舍） | — | 过程项 | 它们是交给 Coding 与其他 Agent 的材料、交给 Git 与 Diff 的变更，不是人要留存引用的版本；Coding 的执行报告是成果。用户已定的 A2 清单写的是「Files、Diff、Git、Coding 的快照、变更集、回执、计划」，Shelf 材料同理归入 |
| 2026-10-03 | 合并 #200 A6（代为决定） | 按推荐合并 | 已合并 | cbc12e3e |
| 2026-10-03 | 合并 #201 A2（代为决定） | 按推荐合并 | 已合并 | bbc1b42d |
| 2026-10-03 | 旧成果记录怎么处理（A1，代为决定，等用户回来确认） | 新表、旧表不读不删（推荐）；给旧记录补来源后迁移；删除旧表 | 新表、旧表不读不删 | 用户定过「不留兼容：旧的成果记录与交换数据不迁移、不保留读取；涉及真实 Home 的数据先问用户」。新表不动旧数据，真实 Home 升级后成果库从空开始，旧数据仍在库里可回退；删表与真实 Home 的清理一起做、先问。代价：真实 Home 里已有的成果（若有）升级后看不到 |
| 2026-10-03 | 来源里的修订号用什么类型（A1，常规取舍） | — | 字符串 | Feed 条目、文件只有修订串，没有递增整数；数字修订写成字符串 |
| 2026-10-03 | 类型显示名与预览声明放在哪一片（常规取舍） | — | A4 | 显示名要和「每种可见类型都有预览」「门禁 A7」一起落地，A1 只收紧单条记录 |
| 2026-10-03 | Pages 自己的导入怎么处理（A3，代为决定） | 删入口、保留解析作为「在 Pages 继续」（推荐）；连同解析动作一起删；保留 Pages 导入 | 删入口、保留解析 | 用户定了「只从成果库导入」「文本文档从这一版继续进 Pages」。整套删会丢掉 Notion ZIP、Word 一次导入多篇的能力；保留 Pages 导入就有两个入口。保留解析后，导入的 ZIP、Word 也能在 Pages 继续；Pages 的 `import` 动作仍对助理开放，只是没有人用的界面入口 |
| 2026-10-03 | A3 的文件上限与显示（常规取舍） | — | 单个 6 MB；位图直接显示，其余下载 | 6 MB 沿用原件快照已有的上限；SVG 可带脚本，按下载处理；按类型的预览留给 A4 |
| 2026-10-03 | 合并 #202 A1（代为决定） | 按推荐合并 | 已合并 | b12fbfc4 |

**待决**：无（「没有项目时的全局设置」已答，见上表）。

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
| P17 | 未知地址 | 项目里不存在的页面地址回一段 JSON 错误（`{"error":"页面或接口不存在"}`），不是工作台（排查时误写成「宿主 404 整页」；`web-request.ts:191` 那一处是侧栏文档自己的找不到提示，属 P15） | `apps/local-host/src/web-request.ts:538` | 页面地址打开工作台并提示找不到；接口仍回 JSON 404（S2） |
| P18 | 站内新标签页：`/api/project-references/<引用>` | Artifacts 内联引用、Goal 历史附件在新标签页打开 | `plugins/native/artifacts/src/reference-ui.ts:46`、`plugins/native/goals/src/event-history-body.ts:169` | 打开的是项目文件的原文（`text/plain` 内联），与 P19 同类：随 S5 在工作台里预览 |
| P19 | Shelf 打开文件（网页版） | 原生里交给系统打开；网页里 `window.open` 新标签页 | `plugins/native/shelf/src/client.ts:1005` | 问用户（算导出还是要在工作台预览） |
| P20 | 导出与打印 | 问卷填写页导出、Pages 导出 HTML、Jelly 导出、PPT 打印 | `plugins/native/form/src/fillpage.ts`、`plugins/native/pages/src/client.ts:734`、`plugins/native/jelly/src/markdown.ts:95`、`plugins/native/ppt/src/client.ts:126` | 用户已列为例外 |

| P21 | 插件与工作台里指向设置整页的链接 | 「去设置模型」「连接」等 30 多处 `href` 指向 `/settings/models`、`/settings/connectors`、`/capabilities/*` 等，点了离开工作台进 P10 的整页 | 如 `apps/workbench/src/**`、`plugins/native/*/src` 里的 `/settings/models` 9 处、`/settings/connectors` 5 处、`/capabilities/connections` 3 处 | 随 P10 的决定处理 |
| P22 | 下载 | Cognia 素材下载、Experiments 导出、Artifacts 导出 JSON | `plugins/native/cognia/src/client.ts:70`、`plugins/native/experiments/src/client.ts:114`、`artifact-native-plugin-http.ts:73` | 下载文件，拟列入例外 |

站内链接的统计口径：UI 源码里以 `/` 开头的 `href` 按路由归类（设置 30 余处、`/projects/`、`/goals/`、`/decisions` 属于工作台）。Feed 素材、Coding 与 Git 里的链接都是外部网址，按「外部链接」例外处理。

## 4. 例外清单（已定）

只有下面这些可以返回完整 HTML 或在新标签页打开，其余一律并进工作台或删除；门禁按这张表放行。

| 例外 | 路由或入口 | 理由 |
| --- | --- | --- |
| 进入页 | `/`（项目选择）、`/onboarding`；还没有任何项目时的 `/settings/*` | 打开任何项目之前的宿主进入页，与工作台共用底栏与组件；不是插件。没有项目就没有工作台，此时全局设置仍是整页（用户 2026-10-02 定） |
| 桌面菜单栏胶囊 | `/desktop/capsule` | 原生小窗，不是浏览器页面 |
| 开发规格板 | `/__ui/catalog`、`/__ui/catalog/bar` | 只给开发者 |
| 宿主排版的侧栏文档 | `/projects/<id>/side/<插件>/<视图>` | 用户在任务里列为例外 |
| 导出、打印与下载 | 问卷填写页导出、Pages 与 Jelly 导出、PPT 打印、Cognia 素材下载、Experiments 与成果导出 | 给别人用或存到本机的文件 |
| 沙箱框里的文档 | 试用预览、已安装的生成插件 | 生成代码要隔离；只在工作台的标签或舞台里打开，框内不带品牌、返回链接或自带导航 |
| 协作服务 | `/continuity`、`/im`（独立部署的 `server/`） | 给其他设备与成员用 |
| 外部链接 | 外部网站 | 侧栏浏览器或新标签页 |

## 5. 实施计划（一片一个 PR）

按依赖排序；每片写明改动、删除的东西、守住它的测试和隔离 Home 走查（桌面与 390 窄屏）。

**壳子**

| 片 | 内容 | 对应 |
| --- | --- | --- |
| S1 | 删 `renderPluginPageWorkspace` 与它的出口和测试（P9）、炼金术士历史演示记录（P8） | 只删不改；分支 `fix/shell-s1-drop-standalone-pages` |
| S1b | 删旧的解释器创作台整套（P3、P4）：`/plugin-builder` 整页、旧生成插件独立页，以及只为它们存在的旧实现。新创作台（`agent-*`）只依赖旧包里的 `formula.ts`、`model.ts`、`validation.ts`；`actions`、`activity`、`client`、`generated`、`plugin`、`record-client`、`record-routes`、`records`、`routes`、`spec-board`、`starter`、`store`、`styles`、`ui`、`visuals`、`workflow` 只属旧系统。宿主还从旧系统取 `builderManifest`、`builderUiContribution`、`BUILDER_PROMPTS` 与两个角色（新创作台也用设计者、代码两个角色），要先把插件身份与角色提示词挪到新创作台，再删旧系统与 `tests/plugin-builder-browser.e2e`、`plugin-builder-visual.e2e` 等旧用例 | 大；旧发布记录不迁移、不读。[#198](https://github.com/molis-ai/molis-work/pull/198)，叠在 S4 上 |
| S2 | 直达链接打开工作台：`/artifacts`、`/artifacts/<版本>` 改为打开工作台并定位（P1）；未知页面地址打开工作台并提示找不到（P17） | 删 `renderArtifactWorkbenchPage` 整页与只给它用的样式；分支 `fix/shell-s2-direct-links-open-workbench` |
| S3 | 沙箱框只在工作台里开（P6、P7）。① 已安装生成插件的框内文档去掉自带头条（标题、版本、「回创作台」链接），出错页不再链到创作台整页；② 「单独打开试用」两处改为切到创作台自己的「试用」标签（`data-as-tab="try"`），不开新标签页；③ 「打开插件」「打开 vN」只走现有的 postMessage 让工作台打开，去掉新标签页兜底；④ 顶层直接访问试用与已安装插件地址（`Sec-Fetch-Dest: document`）时打开工作台并定位到该插件面；作为 iframe 加载时照常回框内文档。`agent-studio.e2e` 里顶层打开试用页、已安装页的步骤随之改为经工作台或框内检查 | 中；`agent-surface.ts`、`agent-studio.ts`、工作台初始化（按面打开） |
| S4 | 创作台去框：创作台作为工作台插件面直接渲染（P5） | 大；[#197](https://github.com/molis-ai/molis-work/pull/197) |
| S5 | 文件在工作台里预览：Shelf 网页版打开文件（P19）、项目内引用 `/api/project-references/`（P18），浏览器能显示的在标签或侧栏预览，其余下载 | |
| S6 | 设置并进工作台（P10、P11、P21）。现状：工作台已有设置面，点工作台里的 `/settings/…` 与项目设置链接会在设置面里打开（`settings-directory.ts` 的点击拦截），并支持 `?settings=<分区>`；缺的是 ① 顶层直接访问（地址栏、刷新）设置、项目设置、规划方法页时仍是整页；② `/capabilities/*` 链接与页面没有并进设置面（它们其实就是 connectors、mcp、library 等分区）。方案：设置整页与片段同一条路由，工作台和设置页里的脚本用 `fetch` 读它，所以按浏览器的 `Sec-Fetch-Dest: document`（只有顶层导航才带）判断直接访问，302 到工作台并打开对应分区；全局设置带 `?project=` 时进那个项目，不带时进上次打开的项目；`/capabilities/*` 映射到设置分区并拦截链接。约 16 个用例文件、26 处直接打开设置页的步骤要改。待问用户：一个项目都没有时（首次安装后先配模型），全局设置直接访问去哪 | 最大；含一个待决 |
| S7 | 门禁：除 §4 例外外没有路由返回完整 HTML；插件内容里不出现自带页面外壳；站内链接不跳出工作台。做法：① 爬取门禁（Node 用例，不开浏览器）：种子 Home 起服务，从进入页和项目工作台出发，按页面导航（`Sec-Fetch-Dest: document`）逐个打开工作台里能点到的本地地址（href 与 GET 表单），跟随跳转；落点只能是工作台、§4 例外、或不是页面（数据、文件）；② 工作台只有一个文档外壳（一个 doctype、html、body），没有整页才有的外壳类名；③ 服务端渲染的工作台里，本地链接不带 `target="_blank"`；④ 产出整页的源码文件列名单（发 `<!doctype html>` 的与调用整页外壳的），新增一处要在名单里写明属于哪条例外 | 守住 S1–S6 |

**成果库**

| 片 | 内容 |
| --- | --- |
| A1 | 合同：成果库 = 固定版本 + 导入文件；版本记来源对象与修订号；交换数据移出成果库，回到产生它的插件作为「过程项」，版本可追溯并链接到过程项。类型显示名由各插件 manifest 声明，不再写死 |
| A2 | 交换数据迁回 owner：Files、Diff、Git、Coding 的快照、变更集、回执、计划不再写成果库；侧栏文件、搜索、成果库列表都看不到它们；侧栏文件按真实媒体类型标注 |
| A3 | 导入只在成果库：任何文件，浮层打开；文本文档「从这一版继续」进 Pages；删 Pages 的导入与 `/artifacts/import` 整页 |
| A4 | 每种可见类型的四类消费方：预览与导出（各类型由 owner 插件提供预览）、被引用、作为输入、从这一版继续；成果库显示来源与被谁引用、「原文已改，这里仍是第 N 版」 |
| A5 | Goal 交付：完成时选交付物，当场固定一版，写 `goal.output`；Goal 页显示交付物；助理与 Coding 可提议、用户确认；`goal.input` 同理；删演示数据里的 `goal.delivery` |
| A6 | 声明对齐：Feed manifest 声明 `feed.capture`；导航与各处统一叫「成果」 |
| A7 | 门禁：manifest 声明与实际写入一致；可见类型必须有预览；交换数据不进用户可见列表 |

不留兼容：旧的成果记录与交换数据不迁移、不保留读取；涉及真实 Home 的数据先问用户（与防腐第二步「真实 Home 安全」一起做）。

### A1 合同设计（已实施，与草案的差异见下）

现状：`packages/contracts/src/modules/artifacts.ts` 的 `ArtifactVersionRecord` 记类型、生产插件、内容（内联或引用）、元数据与作用域，没有「来源对象与当时修订号」，来源只能塞进 `metadata`；交换数据与用户成果同一张表。

改成：

- **一条成果 = 两种之一**（`origin`）：
  - `pinned`：`{ subject: { plugin_id, kind, id }, revision }`，某个工作对象在某一刻固定下来的版本；
  - `imported`：`{ file_name, media_type }`，导入的外部文件，保留原件。
- **标题与媒体类型**是记录的字段（`title`、`media_type`），不再从 payload 猜，也不再一律写 `text/markdown`。
- **追溯**：`trace: [{ plugin_id, kind, id, version? }]`，指向产生它的过程项（例如 Coding 交付的一版指向变更集与 Git 回执）。过程项本身存在 owner 插件里，成果库只存引用。
- **类型由 owner 声明**：manifest 的 `artifacts.produces[]` 带 `title`（显示名）、`preview`（预览贡献）与可选的 `continue`（「从这一版继续」的动作）。成果库按声明显示，不再写死名称；没有预览的类型不允许声明为可见类型（门禁 A7）。
- **交换数据**：`workspace-artifacts.ts` 里的文件快照、文件集合、变更集、Git 结果、Coding 变更集改名为「过程项」合同，由 Files、Diff、Git、Coding 各自存、各自读；它们之间经动作结果与端口传递，不再写成果库。
- **引用关系**：`goal.output`、`goal.input`、助理工作结果、文档引用都指向成果引用 `{ artifact_id, version }`；成果库按这些关系显示「被谁引用」。
- 身份字段随防腐第二步把 `board_id` 合并为 `project_id`。

**A1 实施与草案的差异**

- **记录**：`ArtifactVersionRecord` 加 `origin`、`title`、`media_type`、`trace`；过程项沿用不带这四项的 `FixedVersionRecord`（`ProcessItemRecord`）。写入合同分开：`RegisterArtifactVersionInput` 必须带来源、标题与媒体类型，过程项的 `RecordProcessItemInput` 不带；编译器因此逐个点出了每个成果写入方。
- **来源**：`pinned` 只写对象的 `kind` 与 `id`（插件就是生产者），`revision` 是字符串（Pages、问卷、数据表、PPT 写版本号，Feed 写条目的修订串，角色写草稿修订号，Coding 报告写 `"1"`：一轮结束后不再变）；`imported` 写文件名。
- **媒体类型**：结构化对象写 `application/json`；导入的文档按读进来的正文写 `text/markdown` 或 `text/plain`。侧栏文件按它标注，不再一律 `text/markdown`。
- **追溯**：`trace` 是过程项引用的列表；Coding 报告追溯到同一轮保存过的变更集。
- **标题**：成果库、搜索、侧栏文件都用记录的 `title`，删掉了从 payload 猜标题的 `artifactDisplayTitle`。
- **存储**：成果库换到新表 `library_artifacts`、`library_artifact_versions`（多四列）；旧的 `artifacts`、`artifact_versions` 不再读写，也不删除。真实 Home 升级后旧记录不再显示，删表留给真实 Home 的清理，先问用户。
- **类型显示名与预览声明**（manifest 的 `title`、`preview`）挪到 A4，与「每种可见类型都有预览」一起做。

### A2 过程项（已实施）

先做 A2 再做 A1：A1 要求每条成果带来源与标题，交换数据若还在成果库就得给它们编造来源，所以先把它们搬出去。

- **存储**：项目库里与成果库并列的过程项存储（`process_items`、`process_item_versions`），用同一套不可变版本引擎（`modules/artifacts` 的仓库按表名参数化，`ProcessItemsModule`），事件另记为 `process_item.*`。每条记生产插件；只有生产插件能写。表随成果库的建表（迁移 31）一起建，缺了就补建，不新增迁移号（恢复检查把 39 当作未来版本）。
- **声明**：manifest 新增 `process_items.produces/consumes`。一种类型要么是成果、要么是过程项，不能两边都列。端口可以传两种：插件记下的过程项，或固定后再选择的成果（Coding 报告经 `outputs.select` 进 Shelf）。
- **写**：端口发布（`outputs.publish`）一律记成过程项；端口类型若是成果类型就拒绝，要先固定再选择。插件直接写过程项用 `services.processItems.record`（manifest 声明了 `process_items.produces` 才有）；`services.artifacts.publish` 只写成果。同一个 ID 不能既是成果又是过程项。
- **读**：按引用读取一个固定版本（`artifacts.read`、端口输入、输入图）在两处都找，引用形状不变（`{artifact_id, version}`），消费方代码不用改。
- **归类**：Files 的快照、集合、选区，Git 的变更集与回执，Coding 的计划、Goal 上下文、变更集与图，Shelf 交给项目的材料，都是过程项；Coding 的执行报告是成果。成果库不再展示 Coding 变更集（去掉了宿主为它拼的预览与类型名）；侧栏文件与搜索只读成果库，自然看不到过程项。
- **不留兼容**：已在成果库里的旧交换数据不迁移、不再按过程项读；它们在 A1 收紧成果合同时随旧记录一起不再显示，真实 Home 的清理与防腐第二步的真实 Home 升级一起做，先问用户。

### A3 导入只在成果库（已实施）

- **入口**：成果库目录的「导入」是按钮，在工作台里打开浮层（`<dialog class="mw-dialog">`），默认选本地文件，外部文档来源照旧；`/artifacts/import` 整页、`renderArtifactImportPage` 与 S7 门禁里「待 A3」的两处一并删掉，不留跳转。导入脚本改成工作台里的绑定函数，打开浮层时绑定一次；导入后关浮层，目录自动刷新出新版本，「查看这个版本」在工作台里打开。
- **任何文件**：Markdown、TXT、HTML 照旧读出正文；其他文件保存原件（单个不超过 6 MB），`media_type` 写原件的类型，来源写文件名。
- **看与取**：成果详情给「下载原文件」（文本给「下载正文」），走 `/api/artifacts/<id>/versions/<v>/file`（例外清单的「下载」）；常见位图直接显示，其余一律下载（含 SVG）。按类型的完整预览在 A4。
- **在 Pages 继续**：Pages 能读的版本（Markdown、TXT、HTML、CSV、Word、ZIP）在详情里给「在 Pages 继续」：宿主把这一版交给 Pages 现有的文件解析，Pages 新建文档并在工作台打开；ZIP（如 Notion 导出）一次建多篇，打开第一篇。
- **Pages 的导入入口删掉**：Pages 目录与空态里的「导入」按钮、导入浮层、脚本与样式都删了；它解析文件的能力（`import.preview`、`import` 动作与宿主的材料解析）保留，只作为「在 Pages 继续」的实现。

## 6. 进度

- 2026-10-03：A3 开 PR（分支 `feat/artifact-a3-import-in-library`），做法见上文「A3 导入只在成果库」。另：成果的 HTTP 入口给「在 Pages 继续」单独绑了一个按 Pages 自己权限调用的动作客户端，不放宽成果入口的权限（首次实测报 `actions.forbidden` 后改的）；网页请求里七处相同的用户动作绑定合成一个 `userActions(权限)`，巨大单元不变大。整页门禁去掉「待 A3」两处。用例：导入页的断言改为目录里的浮层、`/artifacts/import` 不再是页；新增「任何文件」用例（图片原件、真实媒体类型、`/file` 取回、文本在 Pages 继续、图片不能继续）；浏览器用例改为在工作台里开浮层导入（文件框限定在浮层里：工作台里不止一个文件框）。整体构建后相关 41 个用例文件 325 条全部通过。
- 2026-10-03：A1 开 PR（分支 `feat/artifact-a1-contract`）。每个成果写明来源、标题、真实媒体类型与追溯的过程项，做法与差异见上文「A1 实施与草案的差异」。写入方逐个改：Pages、问卷、数据表、PPT（推广端口带上来源修订号）、Feed 捕获（修订号用捕获内容的摘要，同一封信重复进来仍是同一版）、文档导入、角色、Coding 报告（追溯同轮变更集）、演示数据、接续服务的资产包（导出带上三项，导入缺了就拒绝）、两个示例插件；成果库、搜索、侧栏文件改用记录的标题与媒体类型。`ArtifactsService` 的输入检查拆到 `modules/artifacts/src/validation.ts`（服务文件超过 500 行的上限）；巨大单元一律压回原行数。整体构建后相关 242 个用例文件 1187 条：1179 通过、6 失败、2 跳过；6 条都是夹具与旧合同（迁移只建新表、触发器挂旧表、Feed 修订号、接续资产包、两个示例插件），修后重跑 12 个文件 88 条全部通过，迁移用例单独重跑 2/2。
- 2026-10-03：A2 开 PR（分支 `feat/artifact-a2-process-items`）。交换数据搬出成果库，做法见上文「A2 过程项」：并列的过程项存储、manifest 的 `process_items`、端口发布一律记成过程项、按引用读取两边都能读到。六个插件的 manifest 改了归类（Files、Git、Diff、Text Stats、Shelf、Coding）；Coding 的计划、Goal 上下文与变更集改记过程项，执行报告仍是成果；Shelf 交给项目的材料改记过程项；成果库去掉了 Coding 变更集的预览与类型名。顺带修了两处只看 `artifacts` 声明的宿主判断：读 Files 输出前先刷新 Files 的判断（`coding-surface.ts`），和输入图在别的连接提交后重新求值的监视（`plugin-artifact-refresh.ts`，改为也看 `process_item` 事件）；后者漏掉时，切换工作目录后 Diff 不再变成「等待」，由 `files-product-http` 用例发现，用基线工作树对照确认是本分支引入。文档与 `skills/molis-plugin-dev` 写明成果与过程项的区别。用例：断言旧行为的改为新合同（成果库渲染 Coding 变更集的用例改为「变更集是过程项、成果库不显示」；端口同一类型既发布又选择成果的用例拆成成果端口与过程项端口两条，原有检查都保留）；测试夹具里交换数据改写进过程项。整体构建后相关 124 个用例文件 515 条全部通过。合入 main（A6）后：包边界检查里成果仓库「必须有 `CREATE TABLE IF NOT EXISTS artifacts`」的条目改成按表名参数化的写法；巨大单元只许变小，`ArtifactsService`、`openInstalledPlugins`、`migrateLocalProjectDatabase` 各压回原行数，`handleCodingPluginHttp` 的新判断提成独立函数。重跑相关 67 个用例文件 314 条全部通过。
- 2026-10-03：A6 开 PR（分支 `fix/artifact-a6-naming-and-feed-manifest`）。Feed 的 manifest 声明它写的 `io.molis.work.feed.capture`（常量移到 `identity.ts`，manifest 不再引入带 node:crypto 的模块）；48 个源文件里 126 处中文文案的「Artifact」改成「成果」，导航、标签页与插件名「Artifacts」改成「成果」；断言旧文案的 3 个用例随之更新（预期变化）。整体构建后，相关 119 个用例文件 696 条：692 通过、2 失败、2 跳过。两条失败都已查明并修好：一是模板插值里嵌套的 5 处文案第一遍没改到；二是市场搜「成果」同时命中 Text Stats 的简介（简介本身不准确，已改）。修后重跑这两个文件 13/13。
- 2026-10-03：S1b 开 [#198](https://github.com/molis-ai/molis-work/pull/198)，叠在 #197 上。删的是旧的解释器创作台整套：插件包里只属旧系统的源码（含 `builder.builds.*` 动作、`/plugin-builder` 整页与 `/records` 路由、灵感库示例与图片），宿主的 `handleBuilderHttp`、`releaseBuilderSurface`，以及工作台里没人用的 `agent.prompts`；还有旧预览脚本和它的替身，旧创作台的 6 个用例文件与 `builder-routes` 夹具。领域用例保留仍适用的 schema 与公式两条。`plugin-builder-surface.ts` 不再出整页，从 S7 的整页产出名单里去掉；README 只写新创作台，必跑用例逐个列出。整体构建后，涉及创作台、生成插件和整页门禁的 41 个用例文件：355 条，355 通过、0 失败（1 条是只在设了环境时才跑的真实 npm 用例，跳过）。`health:check` 通过，基线下降（测试引用包内部 1015 → 979，若干巨大单元变小），`boundary:check` 无错误。
- 2026-10-03：S4 开 [#197](https://github.com/molis-ai/molis-work/pull/197)，CI 通过、等合并。创作台不再嵌框，直接画在工作台的舞台里：`/plugin-builder/studio` 框内页删掉、不留跳转；客户端随插件包按需加载，打开新装插件、模型设置与卸载都经工作台完成；刚装好的插件带 `?openSurface=` 在工作台启动时打开；打开的构建按项目记在本次会话里，刷新不丢；去掉页面品牌，窄屏在舞台内滚动。预览服务与浏览器用例改用 `scripts/agent-studio-harness.mts`，按工作台的挂法挂载（开发工具，不是产品页）。43 个用例文件 355 条：354 通过、0 失败（1 条跳过）；headless Chrome 1440 与 390 截图，没有横向滚动。附带发现 Dock 切换器把它写成 `plugin-builder`，记 BL-114。
- 2026-10-03：S7 [#196](https://github.com/molis-ai/molis-work/pull/196) 已合入（34434590），门禁 `tests/shell-page-gate.test.ts` 进 CI，AGENTS.md 加一条硬约束。三条：① 爬取：从进入页和项目工作台按页面导航打开全部本地地址，落点只能是工作台、§4 例外或不是页面；② 工作台只有一个文档外壳，本地链接不开新标签页；③ 整页产出名单，新增一处要先进例外清单（`/artifacts/import` 记为「待 A3」，只许减少）。运行时：工作台里指向本站的新标签页链接与 `window.open` 改在本工作台打开。红检：同一用例在 S6 之前的 main 上报出 15 个自己的整页；突变检验名单一项会点出新增的文件。第四批合并（#196、#192、#194）已完成。
- 2026-10-02：S6b 开 [#195](https://github.com/molis-ai/molis-work/pull/195) 并已合入。相关用例 599 条 596 通过，3 条失败：2 条是补样式后规则编辑器被设置面的通用规则压成 0 高（已修），1 条是分区列表的预期变化。重跑 51/51。隔离 Home 走查（4305）：1280 规则编辑器与能力库铺满并在内部滚动，390 对外接入按钮 44px、无横向滚动。S7 开 [#196](https://github.com/molis-ai/molis-work/pull/196)（叠在 S6b 上）：整页门禁 3 项接进 CI。红检：S6 之前的 main 上，爬取报出 15 个自己的整页。突变：新增一个发 doctype 的文件，名单失败。运行时守卫：本站页面的新标签页链接与 `window.open` 在本工作台打开（去掉改动时用例失败）。
- 2026-10-02：S6 [#193](https://github.com/molis-ai/molis-work/pull/193) 已合入。S6b 在做（分支 `fix/shell-s6b-capabilities-in-workbench`）：能力四页成为设置分区；直接访问 `/capabilities/*` 进工作台（`project` 作为范围留在页面地址里）；规则编辑器、对外接入、服务连接的脚本改为按根节点与页面地址绑定，首次打开时按需加载 `/assets/molis-work-capabilities.js`；页面里的 GET 筛选在设置面里就地重载；页面状态（打开的规则、筛选）记进封面的位置，刷新后回来；能力页的样式补进工作台样式表（此前在工作台里打开时没有样式，窄屏 44px 触控高度也因此丢失）；收件箱「判断规则」不再整页跳转；删掉能力框与封面。
- 2026-10-02：S6 开 [#193](https://github.com/molis-ai/molis-work/pull/193)（依赖 #188）。整体构建后相关 18 个用例文件 37/37；新增 `settings-direct-access` 在 main 上 2 条失败。隔离 Home（`~/.molis-work-qa/s6`，4304）走查，桌面 1280 与 390：全局设置直接访问进项目工作台、没有项目时是整页；项目说明编辑器 Esc 只关编辑器；`/settings/planning/<方法>` 详情「返回」回列表；`/settings/projects` 在设置面打开；删除项目落到进入页；390 规则页无横向滚动。#189、#190 已合入。main（08f6c7a9）全量回归 3758 条：10 条失败，其中 9 条是 #176/#177 漏改的测试（[#191](https://github.com/molis-ai/molis-work/pull/191) 修，11/11），1 条 `remaining-forms-viewport` 为 CDP 超时、单独重跑 6/6，属时序。
- 2026-10-02：S6 进行中（分支 `fix/shell-s6-settings-in-workbench`，叠在 [#188](https://github.com/molis-ai/molis-work/pull/188)、[#189](https://github.com/molis-ai/molis-work/pull/189) 上）：设置地址的直接访问（地址栏、书签、刷新）按 `Sec-Fetch-Dest: document` 识别，302 到项目工作台并在设置面打开对应分区，全局设置进所名项目、否则进上次打开的项目，保留 `desktop=1`；跳转逻辑收在 `apps/local-host/src/web-settings-arrival.ts`。约 15 个用例文件从「整页」改为验工作台设置面，相关的 32 条用例里 30 条已通过，剩下 2 条在修。走查中修了上面决策记录里列的设置面缺口；另发现两个 main 上已有的缺陷（#189、#190）和一个由 #177 引入的测试失败（#191）。门禁按行号给无名函数起名，上方一改行号就误报，[#188](https://github.com/molis-ai/molis-work/pull/188) 改为按所在函数命名。
- 2026-10-02：S1 [#176](https://github.com/molis-ai/molis-work/pull/176)、S2 [#177](https://github.com/molis-ai/molis-work/pull/177)（用户确认合并）；S3 [#186](https://github.com/molis-ai/molis-work/pull/186)：框内页标记 `?frame=workbench`、直接访问 302 到工作台、去掉框内头条、「单独打开试用」改切「试用」标签，48/48；S5 [#187](https://github.com/molis-ai/molis-work/pull/187)：Shelf 文件进侧栏预览、项目内引用进浮层，新用例反向验证。S6 已摸清现状与方案（见 §5）。S1b 的依赖已理清。
- 2026-10-02：建 spec；问题 1–6 初步核实；独立页面排查（§3）；三批弹窗问完全部待决（§1）；例外清单（§4）；实施计划（§5）。
