# Artifact 定位与动线梳理，所有插件统一进同一个壳子

状态：壳子 S1–S7 与成果库 A1–A7、A4b 全部合入 main（2026-10-03）；隔离 Home 走查（桌面与 390）已完成，发现已修（§5b，#217、#219、#223）；对照任务要求的补漏（五.1）按用户 10-03 拍板全部合入：「被谁引用」的助理工作（#222、#227）与文档（#225）、助理「产出」改名（#224）、交给助理 / Coding（#226）、工作流从一版起步（#228）、Goal 输入合成一个入口（#230、#235）。拷贝真实 Home 用当前 main 打开也已验证（场景 9）。用户 10-04 定「成果也作插件端口的输入」，[#247](https://github.com/molis-ai/molis-work/pull/247) 已开、在跑第三批全量（§6）；之后只差用户验收。本文是这件事唯一的进度与证据记录。用户在防腐收尾目标进行中追加，标为严重问题；与[合入后审查](../archive/post-merge-review/spec.md)、[防腐整理](../repository-anti-corruption/spec.md)同一目标推进。

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
| 2026-10-03 | 合并 #203 A3（代为决定） | 按推荐合并 | 已合并 | 4bce367e |
| 2026-10-03 | 成果预览由谁渲染（A4，常规取舍） | owner 动作给内容、宿主统一只读渲染（推荐）；owner 给 HTML 贡献 | owner 给内容 | 复用侧栏文件已有的内容形状（Markdown、CSV、文本、位图），owner 不写 HTML、不读存储；宿主一处转义渲染，安全面最小 |
| 2026-10-03 | A4 分两片（常规取舍） | — | A4a 声明与预览，A4b 引用、来源变化、作为输入与继续 | 一片一个主题，先让每种可见类型都有 owner 的预览 |
| 2026-10-03 | 合并 #204 A4a（代为决定） | 按推荐合并 | 已合并 | 7abc37e3 |
| 2026-10-03 | Goal 交付的入口放在哪（A5，常规取舍） | — | 现有的「收尾」表单里加「交付物」一组 | Goal 页已有负责人可用的「收尾」表单（事件文档里的 closure），方案里「没有收尾入口」是错的；在它里面列出成果库里每个成果的最新可用版本供勾选，提交收尾前先记下交付物，不另做浮层 |
| 2026-10-03 | 交付物的动作形状（A5，常规取舍） | — | `goals.deliverables.add/remove/list`，不做整组 `set` | 每条交付物是一条以 `goal.output:<goal>:<成果版本>` 为键的 ledger 边，加与删天然幂等；整组 `set` 要比较读取时的版本，收尾表单只需要逐条增删 |
| 2026-10-03 | A5 分两片（常规取舍） | — | A5a 记下与显示已有版本；A5b 当场固定、Agent 提议、`goal.input` | 当场固定要各 owner 声明 `pin` 动作并在浮层里调用；Agent 提议要接待确认流。先让人能在收尾时交付成果库里已有的版本 |
| 2026-10-03 | 合并 #205 A5a（代为决定） | 按推荐合并 | 已合并 | 99e66669 |
| 2026-10-03 | 当场固定怎么找到 owner（A5b，常规取舍） | — | 固定协议：`defineArtifactPinAction`（输入 `{subject_id}`，输出 `{artifact, recovered}`），按对象种类发现；manifest 的成果类型声明 `pin` | 与读取对象上下文（`resolveActionSubject`）同一种发现方式，不写插件名单；门禁要求每个固定动作都声明在某个成果类型上、每种对象至多一个 owner。Pages、问卷、演示稿、数据表的固定动作就是各自原有的「存为成果」，换成统一的输入输出 |
| 2026-10-03 | 网页上固定用谁的权限（A5b，常规取舍） | — | 本机的人用各 owner 固定动作自己的权限 | Goals 的网页入口只带 Goals 权限，嵌套调用 Pages 等会被拒；与 A3「在 Pages 继续」、A4 owner 预览同一做法：只对 `goals.deliverables.pin/candidates` 加上目录里各固定动作声明的权限。Agent、MCP 等调用方不加，仍需自己有 owner 的权限 |
| 2026-10-03 | 同一内容固定两次怎么办（A5b，常规取舍） | — | 每次固定都是新的一版 | 想按「来源修订号相同就沿用」去重，但各插件完成一次发布会把对象自己的版本号加一，修订号永远对不上；沿用原有「存为成果」的语义。收尾表单里固定过的一项立即变为不可再勾，避免同一次收尾重复固定 |
| 2026-10-03 | 固定动作对 MCP 与 Agent 可见吗（A5b，常规取舍） | — | 可见 | 助理、Coding、MCP 调用 `goals.deliverables.pin` 时，嵌套调用的固定动作沿用原调用方，必须对它们的受众开放；它也是一个有意义的独立操作。问卷、数据表、演示稿的 MCP 工具清单因此多一项 `artifacts.pin`（用例的精确清单随之更新）。与原有 `promote` 并存：`promote` 还带读取时的版本、Pages 还带 Goal，删它是另一回事 |
| 2026-10-03 | 合并 #206（代为决定） | 按推荐合并 | 已合并 | e87c77e3；S6b 遗留的 Functions 规则页用例装配 |
| 2026-10-03 | 助理等的「提议」放在哪（A5c，常规取舍） | — | context ledger 里单独的 `goal.output.proposal` 边 | ledger 只有「有效、已移除」两态。提议用自己的边类型，Goal 页、成果库「被谁引用」只读 `goal.output`，自然不把提议当交付物；确认时写 `goal.output` 并移除提议，拒绝时移除提议 |
| 2026-10-03 | 谁的调用算提议（A5c，常规取舍） | — | 受众不是「用户」的一律是提议 | 用户已定「助理与 Coding 可提议、用户确认」。助理、Coding、工作流、MCP 的受众都不是 user；它们调用 `goals.deliverables.add/pin` 只记提议（可附理由），不能移除用户已确认的交付物，可以撤回自己的提议 |
| 2026-10-03 | 收尾表单里提议默认勾不勾（A5c，常规取舍） | — | 不勾，标「助理提议：理由」 | 勾上才是确认。默认勾上等于提交收尾就一并确认，确认不够明确 |
| 2026-10-03 | 合并 #207 A5b（代为决定） | 按推荐合并 | 已合并 | 185d6b0b |
| 2026-10-03 | 合并 #208 A5c（代为决定） | 按推荐合并 | 已合并 | 0b5f6719 |
| 2026-10-03 | 「声明与写入一致」守在哪（A7，常规取舍） | 运行时由宿主拒绝；只靠静态检查 | 运行时：成果库与过程项的写入口按 manifest 拒绝 | 内置插件的写入方散在宿主各处（Pages、问卷、Feed、Coding、演示数据……），静态检查找不全。`ArtifactsService` 加 `declared` 钩子，宿主用内置插件的 manifest 回答：成果只能是 `artifacts.produces` 里的类型，过程项只能是 `process_items.produces` 里的，否则报 `artifact.type_undeclared`。不认识的生产者（安装的插件）放行，它们由 Plugin Runtime 自己的成果与过程项客户端按各自 manifest 检查 |
| 2026-10-03 | 「交换数据不进用户可见列表」怎么守（A7，常规取舍） | — | 端到端用例：成果库列表、侧栏文件、系统搜索三处 | 同一个项目里记一条过程项、一条同样标题形状的成果作对照：三处都能看到成果、都看不到过程项。A2 已从结构上分开存储，这条防以后有人把过程项接进任何一处 |
| 2026-10-03 | 「原文已改」怎么判断（A4b，常规取舍） | 比较修订号；owner 比较内容 | owner 比较内容 | 各插件改名、加星、完成一次固定都会把对象的版本号加一，比修订号会误报。成果类型声明 `compare` 动作（`defineArtifactCompareAction`），owner 读自己的对象、只比内容字段（问卷不比状态），答 same、changed、missing；能当场固定的类型必须有它（门禁） |
| 2026-10-03 | 「被谁引用」列什么（A4b，常规取舍） | — | 引用这一版的 Goal（输入、交付物、提议的交付物），其余引用只计数 | 读 context ledger 里指向这一版的有效边；Goal 名称由宿主提供，点开回到 Goal。助理结果等其他来源暂无可打开的位置，先给数量 |
| 2026-10-03 | A4b 分三片（常规取舍） | — | A4b-1 原文已改与被谁引用；A4b-2 作为 Goal 的输入；A4b-3 其他类型的「从这一版继续」与侧栏预览走 owner | 一片一个主题 |
| 2026-10-03 | 用户回来后确认代为决定的事（弹窗） | 见下面四行 | 见下面四行 | 用户回来时我汇总了全部「代为决定」，弹窗问了四个问题 |
| 2026-10-03 | 代为合并的 13 个 PR（#197–#208）与 A2「并列的过程项存储」（弹窗） | 全部确认（推荐）；有要回退或重做的 | 全部确认 | 本表里标「代为决定」的合并与 A2 设计都算用户已确认 |
| 2026-10-03 | A3 删 Pages 自己的导入入口、A5c 提议默认不勾（弹窗） | 两项都确认（推荐）；Pages 恢复自己的导入入口；助理提议默认勾上 | Pages 恢复自己的导入入口 | 推翻 2026-10-02「只从成果库导入」里 Pages 的那一半：Pages 加回「导入」，导入结果是 Pages 文档、不进成果库；成果库的导入照旧。A5c 用户没选改，保持默认不勾 |
| 2026-10-03 | 合并 #209 A7（弹窗） | CI 通过后合并（推荐）；先不合并 | CI 通过后合并 | 之后用户又说「后面合并可以不用问我，合并可以，只是关键决策问我」：从此 CI 通过就自己合并，只有关键决策弹窗 |
| 2026-10-03 | A1 旧成果记录（弹窗） | 保持现状，第二步再删旧表（推荐）；一次性迁移进新表；现在就在真实 Home 删旧表 | 现在就在真实 Home 删旧表 | 执行前只读核对发现：常驻服务 4173 是安装版 0.2.0，Files、Diff、Coding 与成果库仍读写旧表；旧表在 3 个项目里共 111 版（Coding 报告 8、Feed 捕获 1、演示 `goal.delivery` 2，其余是 Diff 变更集、Files 快照、Coding 计划、工作区引用等交换数据）。这是选项里没写到的后果，于是再问 |
| 2026-10-03 | 删旧表时常驻服务怎么办（弹窗，追问） | 现在备份、换新版时再删（推荐）；备份、停 4173、现在删；备份后现在删、4173 继续跑 | 备份、停 4173、现在删 | 已执行，见下一行 |
| 2026-10-03 | 真实 Home 删旧成果表（执行记录） | — | 已完成 | ① `launchctl bootout gui/<uid>/com.adeptify.goalboard.web` 停下常驻服务（KeepAlive，按 pid 停会被拉起；plist 未改，下次登录或 `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.adeptify.goalboard.web.plist` 会再启动，但 0.2.0 没有旧表不能用，要等装新版）；确认 4173 不再监听、没有进程打开项目库。② 18 个项目库用 SQLite `.backup` 备份到 `~/.molis-work-backups/2026-10-03-drop-old-artifact-tables/`（148 MB），逐个 `integrity_check` 为 ok，旧表行数与原库一致（13、45、53，其余 0）。③ 每个库一个事务 `DROP TABLE artifact_versions; DROP TABLE artifacts`；之后 18 个库都没有这两张表及其索引，`quick_check` 为 ok。④ 先核对过当前代码不再建、读、改这两张表（只剩 `repository.ts` 一处注释），以后升级不会把它们带回来 |
| 2026-10-03 | 合并 #210 A4b-1 | CI 通过即合并（用户已授权） | 已合并 | a639242b |
| 2026-10-03 | Pages 导入怎么恢复（常规取舍，按用户决定执行） | — | 按 A3 之前的样子恢复入口、对话框与脚本 | 解析与 `pages.import` 动作一直留着，只恢复界面；导入对话框的样式放进 `import-client.ts`，由包入口拼进 `PAGES_STYLES`，`styles.ts` 与 `client.ts` 不变大（健康门禁）。导入结果是 Pages 文档，不写成果库 |
| 2026-10-03 | 合并 #211 Pages 导入恢复 | CI 通过即合并（用户已授权） | 已合并 | be268876 |
| 2026-10-03 | 「作为 Goal 的输入」怎么记（A4b-2，常规取舍） | 复用 Goal 的绑定资料（`goals.inputs.bind`）；与交付物同一套规则的 `goal.input` 边 | `goal.input` 边，与交付物共用一套处理 | 绑定资料指向活的工作对象，这里要的是成果库里确定的一版；Goal 页「交付物与输入」、成果库「被谁引用」读的也是 `goal.input`。新动作 `goals.artifact_inputs.add/remove/list`，提议规则与交付物相同（非用户调用记 `goal.input.proposal`），两者共用 `deliverable-actions.ts` 里同一套处理 |
| 2026-10-03 | 入口放在哪（A4b-2，常规取舍） | — | 成果库详情「被谁引用」下的「作为 Goal 的输入」 | 选目标时才读项目的 Goal 目录（`GET /api/goals/directory`）；归档或不可用的版本不给入口，后端也拒绝 |
| 2026-10-03 | 合并 #212 A4b-2 | CI 通过即合并（用户已授权） | 已合并 | 9b604065 |
| 2026-10-03 | 侧栏和成果库怎么共用一份渲染（A4b-3a，常规取舍） | 服务端渲染好 HTML 给侧栏；设计系统把同一组函数做成页面脚本 | 页面脚本 | 侧栏还要显示别处交给它的预览（助理的附件、结果），这些只在浏览器里，服务端渲染不到。`FILE_PREVIEW_CLIENT_SCRIPT` 由 `renderFilePreviewHtml` 与它的 Markdown、CSV 两个函数原样拼成，侧栏删掉自己那份；用例逐字比较两边输出 |
| 2026-10-03 | 侧栏里的成果预览（A4b-3a，常规取舍） | — | 走类型 owner 的预览，与成果库相同 | 只有声明的 owner 且是它生产的版本；拿不到 owner 预览时退回成果库自己的读取 |
| 2026-10-03 | 合并 #213 A4b-3a | CI 通过即合并（用户已授权） | 已合并 | 9d4475e6 |
| 2026-10-03 | 「从这一版继续」怎么接（A4b-3b，常规取舍） | 宿主为每个插件写一条路由；插件在 manifest 为成果类型声明 `continue` | 声明 `continue` | 协议 `defineArtifactContinueAction`（输入这一版，输出新对象在哪打开），可以声明在自己生产的类型上，也可以声明在只读取的类型上（Pages 接着导入的文本文件）。宿主只有一条 `POST /api/artifacts/continue`，按声明找插件、用它自己的权限调用；删掉专为 Pages 写的 `continue-in-pages` 路由和宿主里那个 Pages 客户端 |
| 2026-10-03 | 哪些类型没有「从这一版继续」（A4b-3b，常规取舍） | — | Feed 捕获、角色、Coding 执行报告 | 它们是记录而不是可接着编辑的工作：捕获是收到的内容，角色版本由角色插件自己的版本历史管理，报告是一次运行的结果（接着做是在 Coding 里新开任务）。预览、导出、被引用、作为输入对它们照常适用。名单写在门禁里（`tests/artifact-type-gate.test.ts`），新类型不声明就过不了 |
| 2026-10-03 | 导入文件的格式归谁（A4b-3b，常规取舍） | — | 合同 `modules/artifacts`（`IMPORTED_DOCUMENT_TYPE`、`importedDocumentFile`） | Pages 接着导入的文件要读它，插件之间不能互相 import；什么文件 Pages 读得了（`PAGES_READABLE_FILE`）归 Pages |
| 2026-10-03 | 合并 #214、#215、#216、#217 | CI 通过即合并（用户已授权） | 已合并 | #214 PPT 用例下载竞态（c6958277）、#215 A4b-3b 从这一版继续（e87a9402）、#216 任务书合入 main（592f15bc）、#217 走查发现的「固定版本后的打开」与不带前缀的版本地址（fbc21e03） |
| 2026-10-03 | 任务书来源 | — | 以 main 为准 | 任务书已合入 main：[#216](https://github.com/molis-ai/molis-work/pull/216)（`592f15bc`）用 anti-rot 上的两份任务书替换 main 上的旧版（anti-rot 自分叉以来只改了这两个文件）。此后任务要求、代码与 spec 都以 main 为准，按目标原文「anti-rot 合入 main 后以 main 为准」执行；每个分支从最新 origin/main 开，开工前 fetch、合并前同步到最新 main，不再基于 anti-rot 或其他旧分支开新工作 |
| 2026-10-03 | 验证频率 | — | 用户调整 | 用户 2026-10-03 调整验证频率：小改动攒成一批，整体构建一次，跑这批改动涉及的相关用例（改了什么就跑读它、调它的用例；带 `L()` 文案的加 `tests/i18n.test.ts`，改路由的加所有读这条路由的用例）；全量回归只在大改动时跑（改共享核心 contracts、kernel、modules、local-host 的装配、workbench 外壳，改迁移或存储，改动跨三个以上包，删除整块旧代码，或合入后相关用例意外失败），每个阶段收尾也跑一次全量作为阶段证据。不变的底线：每个 PR 的 CI 必须通过；跑测试前先整体构建；构建与浏览器用例串行；不跳过、不放宽、不删除断言；失败先用干净基线工作树比对 |
| 2026-10-03 | A1 遗留：Pages 成果的来源种类（常规取舍） | — | 改为 Pages 自己的对象种类 `pages_document` | A1 写成了 `page`，与 Pages 的对象读取、搬动、搜索用的种类不一致，A4b 的「原文已改」与当场固定都按种类找 owner。真实 Home 里还没有 A1 之后的 Pages 成果（A1 刚合入），不需要迁移 |
| 2026-10-03 | A6 遗留：Goal Frame 选材料的「交付物」来源（常规取舍） | — | 改叫「成果」，英文「交付物」改为 Deliverable | 这个筛选项指成果库，不是 Goal 的交付物；A6 只改了「Artifact」字样，漏了这里 |
| 2026-10-03 | 助理面板里也叫「成果」的那一栏（五.1，弹窗） | 改叫「产出」（推荐）；改叫「结果」；保持不改 | 改叫「产出」 | 「成果」只指成果库里的固定版本与导入文件；助理面板、待办里助理工作的东西、交给模型与 Coding 的关系词都叫「产出」。[#224](https://github.com/molis-ai/molis-work/pull/224)（960acab7） |
| 2026-10-03 | 「存为固定版本」与「放在哪里」重叠；Goal 有两种输入（五.1，弹窗） | 保留两种、分清叫法（推荐）；合成一种入口；先不动 | 合成一种入口 | Goal 只留一个「加输入…」，选对象时再选「跟着原文」或「固定这一版」；对象位置条的「关联到 Goal…」同样问；成果库里的版本本来就是固定的。Goal 页「输入」一张列表列出两种，「完成要求」下的卡片只放交付物 |
| 2026-10-03 | 成果作为输入的其他去处（五.1，弹窗） | 先做交给助理 / Coding（推荐）；两个都现在做；都放第二步 | 两个都现在做 | 交给助理 / Coding：[#226](https://github.com/molis-ai/molis-work/pull/226)（ebeca52c）；工作流步骤：[#228](https://github.com/molis-ai/molis-work/pull/228) |
| 2026-10-03 | 「被谁引用」的文档引用（五.1，弹窗） | 识别正文里的版本链接（推荐）；加「引用成果」块；不做 | 识别正文里的版本链接 | 新协议 `molis.artifacts.referrers`，Pages 先接；[#225](https://github.com/molis-ai/molis-work/pull/225)（a9cd3f8c） |
| 2026-10-03 | 助理工作怎么进「被谁引用」（常规取舍） | 宿主把助理服务接进成果动作；成果详情读助理已有的关系接口 | 读助理已有的关系接口 | 与 Todo 相同（`GET /api/assistant/related`）；一版在助理里有主体、路径、带项目前缀的路径三种叫法，都查。[#222](https://github.com/molis-ai/molis-work/pull/222)、[#227](https://github.com/molis-ai/molis-work/pull/227) |
| 2026-10-03 | 文档引用由谁回答（常规取舍） | 宿主扫描各插件的存储；插件声明 referrers 动作 | 插件声明，宿主按协议问 | 成果详情按协议找出声明者、各用自己的权限去问，答不了的略过；不写名单 |
| 2026-10-04 | 工作流里只能作起点的站（常规取舍） | 成果库接收交来的内容（存成一版）；协议支持只能作起点的站 | 只能作起点的站 | 「接收」会让工作流往成果库里写，超出用户的决定；站点声明 `receive: false`，工作流把它放第一站，编辑器不在后面的空位里列它 |
| 2026-10-04 | 工作流读一版的正文（常规取舍） | 成果库自己转写；调类型 owner 的预览 | 调 owner 的预览 | 预览协议加上 `workflow` 受众（只读、仍按 owner 声明的权限）；导入的文本直接用 |
| 2026-10-04 | 合并 #220–#227 | CI 通过即合并（用户已授权） | 已合并 | #220 f7d7f1ec、#221 61b805a7、#222 3f7a7b00、#223 d69f4a27、#224 960acab7、#225 a9cd3f8c、#226 ebeca52c、#227 ec8429f9 |
| 2026-10-04 | 成果要不要也作插件端口的输入（五.1 收尾，弹窗） | 不做（推荐）；做 | 做 | 10-03 的两个去处（交给助理 / Coding、工作流步骤）已合入，插件端口当时没问过。按用户决定做：插件在 manifest 声明能接收哪些成果类型作端口输入，宿主按声明把一版交过去；新增合同与门禁 |
| 2026-10-07 | 固定过的对象移走后，成果库说「原对象已经删除」（逻辑复查，常规取舍） | 比较动作多答一个 `moved`（推荐）；沿用 `missing`，只在本项目里找；经放置服务找到新位置并带链接 | 多答 `moved`，不带链接 | 对象只是换了位置，说「已经删除」不实。owner 自己的表是全 Home 一张，能分清「在别处」与「已不存在」；成果库只提示「原对象已移到别处，这里仍保留第 N 版」，不给回到原对象的链接（它不在这个项目里）。带链接要先决定能不能从这个项目打开别处的对象，另行商定 |
| 2026-10-07 | 固定过的对象移走又移回后，再固定拿回旧的一版（逻辑复查，常规取舍） | 下一次固定接着成果库里已有的最高版号（推荐）；移回时保留旧的版号与关联 | 接着最高版号，记录仍显示未固定 | 移走时记录清掉关联与版号是既定语义（旧版留在原项目的成果里），移回后不恢复关联；只修数版号：成果库里已有的各版不再被当作中断的那一次固定交回。只有旧版中断留下、没写来源修订号的单个版本仍按旧规则恢复 |
| 2026-10-07 | 「被谁引用」也列提议的输入（逻辑复查，常规取舍） | 只列输入、交付物、提议的交付物；也列提议的输入（推荐） | 也列提议的输入 | 助理提议的输入在 Goal 页已显示为提议，成果库详情却把它算进「其他」，两边对不上；`artifacts.links` 多一个角色 `proposed_input`，标签「提议的输入」 |
| 2026-10-07 | 个人成果归谁（逻辑复查 #16–#18，用户决定） | A 个人成果都归 Home 的人，生产的工作流、Agent、MCP 客户端记在 `created_by`（推荐）；B 个人按行为者分开；C 保持 owner＝生产者、只改报错 | A | 一个人的 Home 里，工作流、Agent 和 MCP 客户端是这个人的工具。以前它们先固定或导入，人就再也不能续写同一条线；`subject.read` 与插件 SDK 读又拒绝人读它们的成果，而 `read`、浏览、导出、搜索并不拒绝。做法：`registerVersion` 加独立的 `owner_actor_id`，固定与导入端口传本机的人；成果库模块认 Home 的人（`homeOwner`）：这个 Home 里个人成果的 owner 一律读作这个人，已存的、归在某个行为者名下的身份不迁移，人可以直接续写；`subject.read`、插件 SDK 读成果和固定的读端口不再比对 owner 与行为者；给个人成果写一个不是这个人的 owner 报 `artifact.owner_invalid`。`team_project` 的规则不变（共享的成果仍归共享它的行为者），过程项仍归生产它的插件，插件 SDK 读过程项仍比对行为者（决定只管个人成果）。`plugin dev` 的输出按 `created_by` 找出这次运行的成果，不按 owner。中断的固定（未完成的发布意图）仍只由发起它的行为者恢复 |

**待决**：无。10-04 问的「成果作插件端口的输入」见上表，在做（§6）。

## 2. 问题核实（main 1245da7f）

| # | 结论 | 证据 | 处理结果 |
| --- | --- | --- | --- |
| 1 | 成立 | 交换数据类型 `files.snapshot.v1`、`files.collection.v1`、`diff.changeset.v1`、`git.result.v1`、`coding.changeset.v1` 定义在 `packages/contracts/src/modules/workspace-artifacts.ts`，并在 files 等插件的 manifest 里声明为 `artifacts.produces`（如 `plugins/native/files/src/manifest.ts:63`），与 Pages、问卷、数据表、PPT 的固定版本同一个库。助理工作「成果」与「放在哪里」的语义待在动线走查里补证据 | 交换数据搬出成果库，成为各插件的过程项（A2 [#201](https://github.com/molis-ai/molis-work/pull/201)）；成果只表示固定版本，带来源与修订号（A1 [#202](https://github.com/molis-ai/molis-work/pull/202)）；统一叫「成果」（A6 [#200](https://github.com/molis-ai/molis-work/pull/200)）。**未处理**：助理工作的「成果」仍是指向任意对象的关系、并且也叫「成果」；「固定版本」与「放在哪里」的复制、关联语义仍有重叠——见 §1 待决 |
| 2 | 成立（待界面走查补证） | 可见类型：`io.molis.work.pages.document`、`ppt.deck`、`form.questionnaire`、`dataset.table`、`feed.capture`、`document`（导入）、`coding.report.v1`、`coding.changeset.v1`、`character.definition.v1`、`alchemist.research`、`goal.delivery`。`artifacts` 浏览只给 `DOCUMENT` 类型与宿主写死的 Coding 报告、变更做预览（`apps/local-host/src/artifact-native-plugin-http.ts:84`） | 每种可见类型由 owner 声明名称与预览（A4a [#204](https://github.com/molis-ai/molis-work/pull/204)）；被谁引用、原文已改（A4b-1 [#210](https://github.com/molis-ai/molis-work/pull/210)）；作为 Goal 的输入（A4b-2 [#212](https://github.com/molis-ai/molis-work/pull/212)）；侧栏走 owner 预览（A4b-3a [#213](https://github.com/molis-ai/molis-work/pull/213)）；从这一版继续（A4b-3b [#215](https://github.com/molis-ai/molis-work/pull/215)）；门禁（A7 [#209](https://github.com/molis-ai/molis-work/pull/209)）。作为工作流步骤的输入（[#228](https://github.com/molis-ai/molis-work/pull/228)，50f09b3a）、交给助理与 Coding（[#226](https://github.com/molis-ai/molis-work/pull/226)）。作为插件端口的输入：用户 10-04 定「做」，[#247](https://github.com/molis-ai/molis-work/pull/247) |
| 3 | 成立 | `goal.output` 只在读取方出现（`plugins/native/artifacts/src/actions.ts:85`、`goal-context.ts:23`），没有写入方；`goal.input` 由 `modules/goals/src/input-bindings.ts` 写，调用方是 Feed 提升到 Goal（`apps/local-host/src/feed-goal-promotion.ts`、`plugins/native/feed/src/goal-promotion.ts`）与 Goals 的输入动作；`io.molis.work.goal.delivery` 只在演示数据里 | 收尾时交付成果库里的版本、写 `goal.output`（A5a [#205](https://github.com/molis-ai/molis-work/pull/205)）；当场固定 Goal 的资料并交付（A5b [#207](https://github.com/molis-ai/molis-work/pull/207)）；助理等只能提议、用户确认（A5c [#208](https://github.com/molis-ai/molis-work/pull/208)）；`goal.input` 指向成果版本（A4b-2 [#212](https://github.com/molis-ai/molis-work/pull/212)）；演示数据里的 `goal.delivery` 删除（[#205](https://github.com/molis-ai/molis-work/pull/205)） |
| 4 | 成立 | Feed：`plugins/native/feed/src/out-rules.ts:235` 写 `io.molis.work.feed.capture`，manifest `artifacts: { produces: [] }`（`plugins/native/feed/src/manifest.ts:35`）。侧栏文件：`plugins/native/artifacts/src/actions.ts:111` 对所有记录写 `media_type: "text/markdown"`，而且交换数据也在这个列表里。类型显示名写死在 `plugins/native/artifacts/src/browser-ui.ts:10-14` | Feed 在 manifest 声明它写的捕获类型（A6 [#200](https://github.com/molis-ai/molis-work/pull/200)）；侧栏按真实媒体类型、过程项不进侧栏（A2 [#201](https://github.com/molis-ai/molis-work/pull/201)）；类型显示名由 owner 声明（A4a [#204](https://github.com/molis-ai/molis-work/pull/204)）；宿主按 manifest 拒绝未声明的写入（A7 [#209](https://github.com/molis-ai/molis-work/pull/209)） |
| 5 | 成立 | 两套导入：Artifacts 的 `/artifacts/import`（`plugins/native/artifacts/src/import-ui.ts`）与 Pages 的导入（`plugins/native/pages/src/actions.ts:81-84`、`ui.ts:72`）。英文名：`plugins/native/artifacts/src/manifest.ts:22`、`browser-ui.ts:177`、`apps/workbench/src/tab-workspace-ops.ts:41`、`artifact-ui.ts:134` | 导入只在成果库，任何文件、保留原件（A3 [#203](https://github.com/molis-ai/molis-work/pull/203)）；用户 10-03 改为 Pages 也恢复自己的导入，结果是 Pages 文档、不进成果库（[#211](https://github.com/molis-ai/molis-work/pull/211)）；统一叫「成果」（A6 [#200](https://github.com/molis-ai/molis-work/pull/200)） |
| 6 | 成立，且不止这些 | 见 §3 | 全部路由排查见 §3；壳子 S1–S7 处理，门禁 `tests/shell-page-gate.test.ts`（S7 [#196](https://github.com/molis-ai/molis-work/pull/196)） |

## 3. 独立页面与跳出工作台的排查清单

排查方法：全仓源码里返回完整 HTML 文档（`<!doctype html>`、`<html>`、`renderWorkbenchDocument`）的地方、所有 `text/html` 响应、站内的新标签页链接（`target="_blank"`、`window.open`）。外部网站链接不在清单里，按例外处理。

| # | 入口 | 现状 | 位置 | 初判 | 最终处理 |
| --- | --- | --- | --- | --- | --- |
| P1 | `/artifacts`、`/artifacts/<版本>` 直达或刷新 | 整页：自带侧栏、标题「Artifacts」与样式；只有带 `x-molis-work-fragment` 的请求才给片段 | `apps/local-host/src/artifact-native-plugin-http.ts:111`、`apps/workbench/src/artifact-ui.ts` | 并进工作台：直达打开工作台并定位到成果与版本；删整页渲染 | 并入：直达与刷新打开工作台并定位（S2 [#177](https://github.com/molis-ai/molis-work/pull/177)），整页删除 |
| P2 | `/artifacts/import` | 永远是整页，「导入文档」点下去离开工作台 | `artifact-native-plugin-http.ts:62`、`plugins/native/artifacts/src/import-ui.ts` | 取决于「导入归谁」 | 删除：导入是成果库里的浮层（A3 [#203](https://github.com/molis-ai/molis-work/pull/203)） |
| P3 | `/plugin-builder` | 旧的解释器创作台，整页 | `apps/local-host/src/plugin-builder-surface.ts:83` | 工作台入口已换成新创作台，疑似死路由，删 | 删除：旧创作台整套（S1b [#198](https://github.com/molis-ai/molis-work/pull/198)） |
| P4 | `/plugins/io.molis.work.generated.*` | 旧生成插件的独立页，自带「编辑新草稿」条 | `plugin-builder-surface.ts:90-95` | 同上，删 | 删除：旧生成插件独立页（S1b [#198](https://github.com/molis-ai/molis-work/pull/198)） |
| P5 | `/plugin-builder/studio` | 新创作台整页，工作台用 iframe 框起来 | `apps/local-host/src/plugin-builder/agent-surface.ts:371`、`plugin-builder-surface.ts:127` | 问用户 | 并入：创作台直接画在工作台舞台里（S4 [#197](https://github.com/molis-ai/molis-work/pull/197)） |
| P6 | `/plugin-builder/studio/preview/<构建>` | 试用预览整页；「单独打开试用」新标签页 | `agent-surface.ts:372`、`plugins/native/plugin-builder/src/agent-studio.ts:249,265` | 问用户 | 并入：试用只在工作台的标签里，沙箱框列入例外「沙箱框里的文档」（S3 [#186](https://github.com/molis-ai/molis-work/pull/186)） |
| P7 | `/plugins/<生成插件>`（已安装的 Agent 构建插件） | 整页，工作台舞台里用 iframe 框起来；「打开插件」「打开 vN」新标签页 | `agent-surface.ts:365,374`、`agent-studio.ts:204` | 问用户 | 并入：已安装生成插件在工作台里打开，不开新标签页；沙箱框同 P6 例外（S3 [#186](https://github.com/molis-ai/molis-work/pull/186)） |
| P8 | `/api/alchemist/studio/legacy` | 「历史演示记录」新标签页 | `plugins/native/alchemist/src/client-views.ts:68` | 问用户（保留还是删） | 删除（S1 [#176](https://github.com/molis-ai/molis-work/pull/176)） |
| P9 | `renderPluginPageWorkspace`（页面型插件的独立工作区，自带品牌与侧边导航） | 公开出口，仓内没有生产调用方，只有测试 | `apps/workbench/src/plugin-page-workspace.ts`、`tests/plugin-page-workspace.test.ts` | 删（连同出口与测试） | 删除，连同出口与测试（S1 [#176](https://github.com/molis-ai/molis-work/pull/176)） |
| P10 | 全局设置 `/settings`、`/settings/<分区>`、`/settings/<插件>`、`/capabilities/*` | 整页，自带设置导航 | `apps/local-host/src/web-catalog.ts:204-375`、`apps/workbench/src/settings-renderer.ts:266` | 问用户：设置是否属于工作台的「设置」位置 | 并入：设置与能力在工作台的设置位置（S6 [#193](https://github.com/molis-ai/molis-work/pull/193)、S6b [#195](https://github.com/molis-ai/molis-work/pull/195)）；没有项目时的设置整页列入例外「进入页」 |
| P11 | 项目设置 `/projects/<id>/settings/*`、规划方法页 | 整页 | `apps/workbench/src/project-settings-pages.ts:87,143`、`apps/local-host/src/web-goals-read.ts:57`、`web-planning.ts` | 同 P10 | 并入（S6 [#193](https://github.com/molis-ai/molis-work/pull/193)） |
| P12 | `/`（项目选择）、`/onboarding` | 宿主的进入页（arrival 外壳，与工作台共用底栏） | `web-catalog.ts:400`、`web-onboarding.ts:145`、`apps/workbench/src/arrival/shell.ts` | 不是插件；拟列入例外，问用户 | 列入例外「进入页」：不是插件，宿主的项目选择与 Onboarding |
| P13 | `/desktop/capsule` | 桌面菜单栏胶囊窗口 | `web-catalog.ts:177`、`apps/desktop/src/capsule-shell.ts` | 原生窗口，拟列入例外 | 列入例外：桌面菜单栏胶囊，原生窗口 |
| P14 | `/__ui/catalog`、`/__ui/catalog/bar` | 开发用规格板 | `web-catalog.ts:186-201`、`apps/workbench/src/primitive-catalog.ts` | 开发工具，拟列入例外 | 列入例外：开发用规格板 |
| P15 | `/projects/<id>/side/<插件>/<视图>` | 宿主排版的侧栏文档 | `apps/local-host/src/web-request.ts:187`、`apps/workbench/src/side-view-document.ts` | 用户已列为例外 | 列入例外：宿主排版的侧栏文档（用户已定） |
| P16 | 协作服务 `/continuity`、`/im` | 另一个进程（`server/`）的整页 | `server/src/http.ts:58-61`、`packages/im-ui/src/page.ts` | 问用户 | 列入例外：给其他设备与成员用的协作服务，工作台里没有跳到它们的链接 |
| P17 | 未知地址 | 项目里不存在的页面地址回一段 JSON 错误（`{"error":"页面或接口不存在"}`），不是工作台（排查时误写成「宿主 404 整页」；`web-request.ts:191` 那一处是侧栏文档自己的找不到提示，属 P15） | `apps/local-host/src/web-request.ts:538` | 页面地址打开工作台并提示找不到；接口仍回 JSON 404（S2） | 并入：未知页面地址打开工作台并说明找不到（S2 [#177](https://github.com/molis-ai/molis-work/pull/177)） |
| P18 | 站内新标签页：`/api/project-references/<引用>` | Artifacts 内联引用、Goal 历史附件在新标签页打开 | `plugins/native/artifacts/src/reference-ui.ts:46`、`plugins/native/goals/src/event-history-body.ts:169` | 打开的是项目文件的原文（`text/plain` 内联），与 P19 同类：随 S5 在工作台里预览 | 并入：项目内引用在工作台里预览（S5 [#187](https://github.com/molis-ai/molis-work/pull/187)） |
| P19 | Shelf 打开文件（网页版） | 原生里交给系统打开；网页里 `window.open` 新标签页 | `plugins/native/shelf/src/client.ts:1005` | 问用户（算导出还是要在工作台预览） | 并入：Shelf 网页版在工作台预览，浏览器不能显示的下载（S5 [#187](https://github.com/molis-ai/molis-work/pull/187)） |
| P20 | 导出与打印 | 问卷填写页导出、Pages 导出 HTML、Jelly 导出、PPT 打印 | `plugins/native/form/src/fillpage.ts`、`plugins/native/pages/src/client.ts:734`、`plugins/native/jelly/src/markdown.ts:95`、`plugins/native/ppt/src/client.ts:126` | 用户已列为例外 | 列入例外：导出与打印（用户已定） |
| P21 | 插件与工作台里指向设置整页的链接 | 「去设置模型」「连接」等 30 多处 `href` 指向 `/settings/models`、`/settings/connectors`、`/capabilities/*` 等，点了离开工作台进 P10 的整页 | 如 `apps/workbench/src/**`、`plugins/native/*/src` 里的 `/settings/models` 9 处、`/settings/connectors` 5 处、`/capabilities/connections` 3 处 | 随 P10 的决定处理 | 并入：这些链接在工作台里打开设置位置（S6 [#193](https://github.com/molis-ai/molis-work/pull/193)） |
| P22 | 下载 | Cognia 素材下载、Experiments 导出、Artifacts 导出 JSON | `plugins/native/cognia/src/client.ts:70`、`plugins/native/experiments/src/client.ts:114`、`artifact-native-plugin-http.ts:73` | 下载文件，拟列入例外 | 列入例外：下载文件 |

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

不留兼容：旧的成果记录与交换数据不迁移、不保留读取。真实 Home 的旧表已于 2026-10-03 按用户决定备份后删除（见 §1）。

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
- 身份字段已随防腐第二步把 `board_id` 合并为 `project_id`。

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

### A4 每种可见类型的消费方（已实施）

**A4a（本片）**

- **类型由 owner 声明**：manifest `artifacts.produces[]` 加 `title`（显示名）与 `preview`（owner 的一个动作，用 `defineArtifactPreviewAction` 定义，输入是宿主读出的这一版，输出是与侧栏文件同形的内容，类型单列为 `molis.artifacts.preview.v1`，不算侧栏文件来源）。owner 只转换自己的 payload，不读任何存储（`bindArtifactPreview` 统一检查类型）。
- **已声明的八种**：文档（Pages，Markdown）、问卷（题目 Markdown，不含答卷）、演示稿（大纲 Markdown）、数据表（CSV）、捕获的消息（Feed，标题/摘要/来源/原文链接）、角色（说明与工具）、Coding 执行报告（正文 Markdown，身份对不上的报告不预览）、导入的文件（正文或原件）。
- **成果库按声明显示**：分组名与详情的类型名来自声明，删掉写死的类型表；详情里的预览由 owner 的预览动作给出、宿主用共同的只读渲染（`renderFilePreviewHtml`：Markdown、CSV 表格、文本、位图，转义一切、不出脚本与框）显示，并给「在 <插件> 打开原对象」回到固定下来的那个对象。只有声明的 owner、且这一版是它生产的，才会被预览。宿主为 Coding 报告单独拼预览的代码删掉。Coding 报告的来源改为会话（`coding_session`），修订号是轮次。

**A4b-1（本片）**

- 比较协议 `defineArtifactCompareAction`（`molis.artifacts.compare.request.v1` → `molis.artifacts.compare.v1`，答 `same`、`changed`、`moved`、`missing`）与 `bindArtifactCompare`；Pages（标题、正文）、问卷（标题、说明、题目）、演示稿（标题、说明、配色、幻灯片）、数据表（标题、说明、列、行）各一个，manifest 的成果类型声明 `compare`。
- 成果库详情：原对象改过时提示「原对象之后改过了；这里仍是固定下来的这一版」，删除时提示「原对象已经删除」并不再给「打开原对象」。
- 成果库详情加「被谁引用」：`artifacts.links` 读 ledger，列出把这一版作为输入、交付物、提议的输入、提议的交付物的 Goal（点开回 Goal），其余引用计数。
- 门禁：能当场固定的类型必须声明比较动作。

**A4b-2（本片）**：成果库详情的「被谁引用」下加「作为 Goal 的输入」，选一个 Goal 就把这一版记为它的输入（`goal.input`）；Goal 页「交付物与输入」与「被谁引用」随之显示。Goals 新动作 `goals.artifact_inputs.add/remove/list`（HTTP `GET/POST /api/goals/:id/artifact-inputs`），与交付物共用同一套规则，包括助理等只能提议。

**A4b-3a（本片）**：侧栏「文件」里的成果预览走类型 owner 的预览（`via: "owner"`），与成果库同一份；侧栏的 Markdown、CSV 渲染换成设计系统的同一组函数（页面脚本 `FILE_PREVIEW_CLIENT_SCRIPT`），侧栏表格样式改挂在共用的 `file-preview-table` 上。

**A4b-3b（本片）**：「从这一版继续」。协议 `defineArtifactContinueAction` 与 `bindArtifactContinue`；Pages（自己的文档，以及读得了的导入文件）、问卷、演示稿、数据表各一个，新建对象并带上这一版的内容，这一版和原对象都不变。成果库详情按声明给出「在 X 继续」，点了在工作台里打开新对象。Feed 捕获、角色、Coding 执行报告不提供，理由见 §1，名单在门禁里。

### A7 门禁（已实施）

- **类型声明**（A4、A5b 已有，`tests/artifact-type-gate.test.ts`）：每种成果类型有显示名与 owner 的预览动作；固定动作声明在成果类型上、每种对象至多一个 owner。
- **声明与写入一致**（`tests/artifact-declaration-gate.test.ts`）：宿主按内置插件的 manifest 拒绝未声明的写入，成果与过程项各查各的清单；安装的插件由 Plugin Runtime 的客户端按它自己的 manifest 查。
- **交换数据不进用户可见列表**（同一文件）：成果库列表、侧栏文件、系统搜索里都没有过程项，有成果作对照。
- 两个门禁文件在 CI 的同一步里跑；`AGENTS.md` 加一条硬约束。

### A5 Goal 交付（A5a、A5b、A5c 已实施）

- **交付物是成果引用**：Goal 的交付物是 `goal.output` 关系（context ledger，从 Goal 指向成果的某一版），不再有单独的 `goal.delivery` 类型；演示数据里的 `goal.delivery` 删掉，改成真实的成果加 `goal.output`。`goal.input` 同理指向成果版本。
- **收尾入口**：Goal 页的事件文档已有负责人可用的「收尾」表单（结果、理由，提交现有收尾动作并带读取时的约定与配置版本）。交付物作为其中一组，不另做浮层。Agent 收尾时可以附带提议的交付物，进待确认（A5b）。
- **完成时选**：收尾浮层里的「交付物」一步，列出这个项目的成果（按 owner 声明的类型名分组）与可以当场固定的工作对象；选工作对象时调用它 owner 的固定动作（manifest 为可见类型声明 `pin`，如 Pages、问卷、数据表、PPT 的推广动作），固定出的那一版作为交付物。收尾合同不变，交付物由 Goals 的新动作 `goals.deliverables.add/remove` 逐条记下（键是 Goal 加成果版本，重试幂等）。
- **Goal 页显示交付物**：Goal 页的成果区块只显示交付物与输入两类，每条显示类型名、标题与版本，点开在成果库；「原文已改」提示沿用 A4b。
- **提议与确认**：助理与 Coding 可以提议交付物（写成待确认的建议），用户在收尾浮层里确认后才记下。

**A5a（本片）**

- Goals 的动作 `goals.deliverables.add/remove/list`：交付物是 context ledger 里 `goal.output` 的边（键 `goal.output:<goal>:<成果版本>`，来源 `goals`，目标 `artifacts` 的某一版）。记下前检查这一版在成果库里存在、可用、未归档（过程项不能交付）；重复记下返回原记录；移除只把边标为移除，成果本身不动。HTTP：`GET/POST /api/goals/:id/deliverables`。
- 收尾表单的「交付物」一组：列出成果库里每个成果的最新可用版本（`GET /api/artifacts/versions`，类型名来自 owner 的声明），勾选或取消后，提交收尾前逐条记下或移除。
- Goal 页的成果区块改名「交付物与输入」，交付物一条显示「vN · 交付物」；成果库详情里的关系名改为「输入」「交付物」。
- 演示数据删掉 `goal.delivery` 类型，改为一个导入的文档（两版）加一条 `goal.output` 指向第二版。

**A5b（本片）**：收尾时当场固定 Goal 的资料。

- 固定协议 `defineArtifactPinAction`（`molis.artifacts.pin.request.v1` → `molis.artifacts.pin.v1`），由 `pinActionSubject` 按对象种类找唯一的 owner、以原调用方的权限调用；`pinnableSubjectKinds` 列出当前能固定的种类。Pages、问卷、演示稿、数据表各有一个固定动作，内部就是原来的「存为成果」；manifest 的成果类型声明 `pin`。
- Goals 新动作 `goals.deliverables.pin`（固定后按 A5a 的规则记为交付物）与 `goals.deliverables.candidates`（Goal 已确认的绑定资料里能固定的那些）。`GET /api/goals/:id/deliverables` 一并返回 `candidates`，`POST` 带 `subject` 即固定并交付。
- 收尾表单的「交付物」先列 Goal 的资料（「固定当前内容并交付」），再列成果库里的版本。

**A5c（本片）**：助理、Coding、工作流与 MCP 提议交付物，用户在收尾表单里确认。

- `goals.deliverables.add/pin` 由受众不是用户的调用方调用时，记成 `goal.output.proposal`（可附 `reason`，最多 300 字），返回 `proposed: true`；重复提议返回原提议。用户记下同一版即确认：写 `goal.output`、移除提议。
- `goals.deliverables.remove`：用户可移除交付物或拒绝提议；其他调用方只能撤回提议，碰已确认的交付物报 `goals.deliverable_confirmed`。
- `goals.deliverables.list` 一并列出提议（`proposed`、`reason`）；Goal 页与成果库只读 `goal.output`，提议不算交付物。
- 收尾表单把提议排在最前，不勾，标「助理提议：理由」；勾上提交即确认。

`goal.input` 的记下入口归 A4b「作为 Goal 的输入」。

## 5b. 隔离 Home 走查（2026-10-03，桌面 1280 与 390）

环境：隔离 Home（`MOLIS_WORK_HOME` 与 `MOLIS_WORK_SECRET_BACKEND=file` 指向会话临时目录），一个项目「成果走查」，启用全部项目插件并带演示 Goal；服务由 main 的构建（fbc21e03，含 #217）起在 4320，用应用内浏览器操作。

| 步骤 | 结果 |
| --- | --- |
| Pages 新建文档、写正文、「存为固定版本」 | 得到 v1，列表标「固定版本 v1」；提示里的「打开」起初打开的是文档本身——已由 [#217](https://github.com/molis-ai/molis-work/pull/217) 修为打开成果库里的这一版 |
| 改文档正文后打开 v1（直达链接） | 打开工作台的成果面并定位到 v1：「原对象之后改过了」、在 Pages 打开原对象、owner 预览显示 v1 当时的正文、在 Pages 继续、被谁引用、作为 Goal 的输入、类型与来源 |
| 作为 Goal 的输入 → 选 V1 → 记为输入 | 「被谁引用」出现该 Goal（输入），点开在工作台打开 Goal；Goal 的「交付物与输入」显示「v1 · 输入」 |
| Goal 收尾：完成要求 → 检查并收尾 | 收尾表单的「交付物」列出成果库的版本，勾选后提交：Goal 变为已完成，交付物记下；「交付物与输入」显示「v1 · 交付物」 |
| 成果详情「在 Pages 继续」 | 在 Pages 新开一篇带 v1 正文的文档，原文档与 v1 不变 |
| 成果库「导入」一个 Markdown 文件 | 浮层里导入，结果「查看这个版本」打开详情：导入时的说明、正文预览、在 Pages 继续、下载正文；列表按声明的名称分组（导入的文件、文档） |
| 侧栏「文件」 | 项目成果、Pages 文档、工作区文件、置物架分组；成果的预览由 owner 给出（Markdown 标题与列表） |
| Pages 自己的「导入」 | 浮层打开，样式正常（#211 恢复） |
| 390 | 成果详情、导入浮层不横向溢出；窄屏下详情占满、列表在上一层 |

**走查发现与处理**（同一 PR `fix/artifact-walkthrough-findings`，除第 1 条外）：

1. 「存为固定版本」后的「打开」打开原对象；成果库不认不带项目前缀的版本地址，搜索、侧栏、提示都打不开版本——已修（#217）。
2. 直达链接与「查看这个版本」打开的标签名是地址或链接文字——直达改为带上这一版的标题，导入结果带标题，成果面的链接优先用它。
3. 「原文已改」没说是第几版——改为「原文已改，这里仍是第 N 版」「原对象已经删除，这里仍保留第 N 版」。
4. 「被谁引用」里 Goal 名与角色挤在一起——加间距。
5. Goal 页「交付物与输入」的卡片对 Pages 文档写「没有兼容插件」、类型显示 `document`——Goal 页按声明的成果类型读取并用 owner 声明的名称；可读时不再显示面向开发者的「已有兼容的类型声明」，改为「这是固定下来的一版」。
6. 成果库的空状态仍写「推进 Goal 后提交成果」——改为指向「存为固定版本」与导入。
7. 收尾表单的交付物在工作区侧栏里排成三行（复选框单独一行）——样式不再只挂在 Goal 文档容器下，复选框不再被表单的通用宽度拉满。
8. 成果库导入浮层内容贴边，结果显示内部 ID——加内边距（压过设计系统对对话框的默认），结果显示标题。
9. 侧栏把成果按类型 ID 分组——改为 owner 声明的名称。
10. 侧栏「在插件中打开」对成果只打开成果面、不定位到版本——标签式打开的插件（成果库等）改为直接打开那一项。
11. Goal 概览看不到交付了什么，要进「完成要求」才看得到——已改：「Goal 信息」里加「交付物 · N 份」，点开到「完成要求」（[#223](https://github.com/molis-ai/molis-work/pull/223)）。

守住它们的用例：`tests/pin-toast-opens-version.e2e.test.ts`（#217）、`tests/artifact-walkthrough.e2e.test.ts`（1440、390：标题、侧栏分组与打开、Goal 卡片、导入浮层内边距）、`artifact-source-and-links` 与 `artifact-browser` 的「第 N 版」断言。

## 6. 进度

- 2026-10-04（成果作插件端口的输入）：[#247](https://github.com/molis-ai/molis-work/pull/247)。
  - 插件输入端口除了接另一个插件的输出，还可以固定读成果库里的一版。新表 `plugin_port_artifact_bindings`；只收成果库里、类型一致、仍可读、没归档的版本，过程项不收；一个端口只有一个来源。
  - 成果详情加「交给插件作为输入」：列出运行中插件里接这个类型的输入端口（例如 Shelf 的 Coding 报告输入），显示「现在跟着 Coding」或「正在读这一版」，一个按钮改用这一版或改回宿主默认的来源。改输入的动作只给人用。
  - 用例：`plugin-input-graph`、`plugin-durable-coordination`、`artifact-plugin-inputs-http`；第三批集成分支上相关用例与 27 个 Goal / 成果浏览器用例通过，全量在跑。
- 2026-10-04（收尾）：
  - #228 工作流从一版起步（50f09b3a）、#230 Goal 的输入合成一个入口（cd62835a）、#235 它的用例补充（428f435e）都已合入；顺带修了 Dock 用例的时序（#232，268325bd）。
  - 场景 9：先确认 4207 没在写，把真实 Home 拷到会话临时目录，用当前 main、文件密钥后端打开走一遍。项目列表、项目首页、Goals、Coding（旧会话）、工作流与设置都打开，没有报错；拷贝已删。结果记在[防腐整理 §9.4 第 12 条](../repository-anti-corruption/spec.md)。
  - 五.1 的补漏到此全部合入。另问了一项：成果要不要也作插件端口的输入，用户定「做」（§1），在做。
- 2026-10-04：五.1 补漏按 10-03 的决定推进。已合入：#222「被谁引用 · 助理工作」、#223 Goal 信息里的交付物（F6）、#224 助理「产出」改名、#225 文档引用（`molis.artifacts.referrers`，Pages 识别正文里的版本链接）、#226 交给助理 / Coding、#227 直达链接打开的成果标签在助理里显示名字并能被「被谁引用」找到。在合并队列：#228 工作流从一版起步。在做：Goal 输入合成一个入口（分支 `feat/goal-inputs-one-entry`：`goals.artifact_inputs.pin`、Goal 页「输入」一张列表与「加输入…」、位置条「关联到 Goal…」同样问「跟着原文 / 固定这一版」）。用例：`artifact-assistant-works.e2e`、`artifact-handoff.e2e`、`artifact-source-and-links`（文档引用）、`workflows-plugin`（成果起步）、`goal-inputs-one-entry.e2e`、`goal-artifact-inputs`。main 自检的全量结果与两处修复（#220、#221）见[防腐整理 §9](../repository-anti-corruption/spec.md)。
- 2026-10-03：A4b-3b 开 PR（分支 `feat/artifact-a4b3b-continue`），做法见上文「A4」A4b-3b。新增 `tests/artifact-continue.test.ts`（Pages、问卷、演示稿、数据表各固定一版再「继续」：新对象带上标题与内容、与原对象不同；未声明的插件被拒）、`tests/artifact-continue.e2e.test.ts`（1440、390：成果库详情点「在 Pages 继续」，在工作台里打开新文档，成果版本数不变）；`artifact-type-gate` 加「每种可见类型都能继续或在例外名单里」；A3 的「在 Pages 继续」用例改走新路由，原来对数量的断言换成在 Pages 列表里核对恰好新建了那一篇。整体构建后成果、四个 owner 插件、i18n、侧栏、目录与 MCP 等 104 个文件 566 条 565 通过；1 条 `ppt-actions.e2e`（390，PowerPoint 下载读到空文件）在 main 上同样偶发（3 次 2 次失败），是用例读下载的时机问题，单开 [#214](https://github.com/molis-ai/molis-work/pull/214) 修（等文件写完再读，断言不变，修后 4/4）；`alchemist-workbench.e2e` 有同样的读法，尚未见失败。健康门禁、边界检查通过；插件开发文档写明 `compare` 与 `continue`。
- 2026-10-03：A4b-3a 开 PR（分支 `feat/artifact-a4b3-continue-and-side`），做法见上文「A4」A4b-3a。新增 `tests/side-files-artifacts.test.ts`：Pages 文档固定后，侧栏「文件」里的这一版由 Pages 预览（`via: "owner"`，Markdown 带标题与列表），列出的正是固定的那一版；页面脚本版渲染与服务端 `renderFilePreviewHtml` 对 Markdown、CSV、纯文本逐字相同，且不放过 `<b>`、`<script>`。整体构建后侧栏、成果、i18n、整页门禁、设计系统、搜索等 35 个文件 121/121；健康门禁通过。
- 2026-10-03：A4b-2 开 PR（分支 `feat/artifact-a4b2-goal-inputs`），做法见上文「A4」A4b-2。新增 `tests/goal-artifact-inputs.test.ts`（Goal 目录、记为输入与重放、Goal 页「v2 · 输入」、成果库「被谁引用」、归档版本不给入口且后端拒绝、移除；助理只能提议输入、确认后提议退场、助理不能移除已确认的输入、输入不算交付物）与 `tests/artifact-goal-input.e2e.test.ts`（1440、390：在成果库详情选 Goal、记下后「被谁引用」出现该 Goal，页面不横向溢出）。A5c 的提议用例改为同时登记输入动作的定义（处理器工厂现在一并给出两类），断言不变。整体构建后 Goals、成果、i18n、MCP、目录、整页门禁等 133 个文件 475/475；健康门禁、边界检查通过。
- 2026-10-03：Pages 恢复自己的导入入口（分支 `feat/pages-import-entry-back`，用户回来后的决定，见 §1）。新增 `tests/pages-import-entry.e2e.test.ts`（1440、390）：导入一个 Markdown 文件成为 Pages 文档并打开，成果库版本数不变，页面不横向溢出。整体构建后 Pages 导入、发布、动作、i18n、整页门禁 57/57，Pages 与目录、样式相关的其余 29 个文件 280/280；健康门禁通过。
- 2026-10-03：A4b-1 开 PR（分支 `feat/artifact-a4b-source-and-references`），做法见上文「A4」A4b-1。新增 `tests/artifact-source-and-links.test.ts`：Pages 文档固定后不提示改动、给回到原对象的链接；加星不算改动；改正文后提示「原对象之后改过了」且仍显示固定的内容；记为交付物与输入的 Goal 出现在「被谁引用」并能点开；删除文档后提示「原对象已经删除」、不再给链接。比较一开始误报「改过了」：成果库按排好序的键存 payload，Pages 保留自己的键序，`sameArtifactFields` 改为排序后比较。整体构建后相关用例（成果、四个 owner 插件、交付物、收尾表单、i18n、侧栏、目录与 MCP、整页门禁等 104 个文件）564 条 563 通过；1 条是预期变化：A4 的 Pages 预览用例固定的是 Pages 里并不存在的 page-q3，现在如实提示「原对象已经删除」、不给链接，断言随之改；原来对链接地址（`openPlugin=pages`、`openItem`）的检查移到新用例里真实存在的文档上。重跑 15/15；健康门禁、边界检查通过。
- 2026-10-03：A7 开 PR（分支 `feat/artifact-a7-declaration-gates`），做法见上文「A7 门禁」。整体构建后写成果或过程项的相关用例（成果、Coding、Files、Shelf、Feed、角色、Pages 固定、安装插件、插件平台、演示数据等 238 个文件）1168 条 1164 通过、1 条失败：`i18n.test` 三个标签缺英文，是 main 上已知的失败，#207 已修，本分支合入 main 后重跑通过。一条既有用例随门禁调整：`artifact-browser` 原来把 Coding 变更集直接写进成果库再检查不出预览，现在这样写会被拒（新断言），原意（成果库不为别的生产者写入的同类型渲染变更集预览）改用一个安装插件的生产者保留。
- 2026-10-03：A5c 开 PR（分支 `feat/artifact-a5c-deliverable-proposals`，叠在 A5b [#207] 上），做法见上文「A5 Goal 交付」A5c。新增 `tests/goal-deliverable-proposals.test.ts`：真实的交付物处理器与 ledger，以用户和助理两种身份调用——助理提议附理由、重复返回原提议、提议不是 `goal.output`、用户确认后提议退场、助理不能移除已确认的交付物、助理固定后的新版本也是提议、用户拒绝提议不影响已确认的。整体构建后 Goals、交付物、收尾表单 e2e、MCP、i18n、成果门禁等 13 个文件 71/71。`en.ts` 再删一个无引用的旧文案，行数不增。
- 2026-10-03：A5b 开 PR（分支 `feat/artifact-a5b-pin-deliverables`），做法见上文「A5 Goal 交付」A5b。整体构建后相关用例（Goals、成果、四个 owner 插件、目录与 MCP、Frame、i18n 共 168 个文件）831 条 826 通过，5 条失败分三类：① 问卷、数据表、演示稿的 MCP 精确工具清单多了 `artifacts.pin`（预期变化，清单补上）；② `i18n.test` 三个标签缺英文：A3 的「在 Pages 继续」「没能在 Pages 打开这一版」与 A5a 的「成果库暂时读不到」一句，main 上同样失败（A3、A5a 的相关用例集没含 i18n，漏了），本片补译；③ `functions-draft-retention` 在 main（99e66669）同样失败，是 S6b（#195）改了 Functions 脚本的宿主参数而这个用例的装配没跟上，单开 [#206](https://github.com/molis-ai/molis-work/pull/206) 修用例装配（断言不变，0/1 → 1/1）。前两类修后重跑 12/12。新增用例：`goal-deliverables` 的当场固定（候选列出、经 Pages 固定出 v1 并记为交付物、来源记对象与修订号、不能固定的种类 400 且不写成果）；`artifact-type-gate` 加固定动作的两条门禁。教训：改了带 `L()` 的界面文案，相关用例集要含 `tests/i18n.test.ts`。
- 2026-10-03：A5a 开 PR（分支 `feat/artifact-a5-goal-delivery`），做法见上文「A5 Goal 交付」。整体构建后相关用例（goals、goal-event、artifact、演示数据共 70 个文件）258 条 256 通过；2 条是本片引起：Goal 页区块与关系改名的预期变化（断言同强度改为新文案，并加上标签结尾，确保不是旧的「输入结果」）、一个自己装配 Goals 处理器的用例没给交付物端口（manifest 声明了动作就必须有处理器，端口改为必填，用例补上真实 ledger）。修后这批与门禁用例 50/50；健康门禁、边界检查、整页门禁通过。新增 `tests/goal-deliverables.test.ts`（记下、重放、列出、Goal 页显示、拒绝归档与不存在的版本、移除），`goal-event-document.e2e` 断言收尾表单的交付物列表读完。#204 已合入（7abc37e3），本片直接基于 main。
- 2026-10-03：A4a 开 PR（分支 `feat/artifact-a4-consumers`），做法见上文「A4 每种可见类型的消费方」。八种可见类型都由 owner 声明显示名与预览动作；成果库按声明分组、显示 owner 的预览并给回到原对象的链接；宿主为 Coding 报告单拼的预览删掉。门禁 `tests/artifact-type-gate.test.ts`（每种成果类型有显示名与 owner 预览动作、每种类型只有一个 owner）接进 CI。途中两处：预览动作起初沿用侧栏文件内容的输出类型，被动作目录当成侧栏文件来源拒绝，改为单列的 `molis.artifacts.preview.v1`；成果插件里 `actions → document-import → manifest → actions` 循环引用，文档类型常量挪到叶子模块。用例：类型名改按 owner 声明断言（Feed 的「捕获的消息」、未声明类型取末段）；Coding 报告的来源链接打开会话；导入文件改由 owner 预览渲染；Coding 动作目录按 manifest 比对；新增 Pages 版本由 Pages 预览、非 Pages 生产的同类型不预览。整体构建后相关 276 个用例文件 1327 条：1321 通过、4 失败、2 跳过；4 条都已改（导入的预览标记、循环引用、Coding 目录），重跑 5 个文件 28 条全部通过。
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
