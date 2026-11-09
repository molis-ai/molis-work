# 第 27 批门禁待决方案

状态：概念方案，固定基点 `3387d6247` 核查完成，分项待一骏决定（2026-11-09；第 27 批统筹负责决策接续，实现写手待分配）。

本片承接 [27-4／27-5](../../../post-anticorruption-roadmap/reference/batches/27.md)、[BL-914](../../../backlog/BL-914.md)、[BL-569](../../../backlog/BL-569.md)、[BL-901](../../../backlog/BL-901.md) 和[对抗式审查 R4／B1／G3、N10](../../../../docs/reviews/adversarial-review-2026-11-01.md)。类型为底层与架构；方案现在可审，工程目标是让开发者在已有健康门禁看到具体失败位置、改正后原命令通过。批次的产品验收不随本片调整。依据 [Goal Prompt 红线](../../../post-anticorruption-roadmap/reference/batches/27.md#goal-prompt)及[开发流程 §4／§8.4](../../../post-anticorruption-roadmap/reference/development-workflow.md#batch-grouping)，门禁改动须先批准；本片只交本文。[N3 的标题检查](../batch27-security-evidence/spec.md)和 [A2 的行数报告](../batch27-host-lines/spec.md)已交付，沿用原授权；27-6 已批先报告，仍等 26-7，与本片无依赖。

## 三组决定

| 要定的事 | 推荐与代价 | 可以另选 |
| --- | --- | --- |
| 1. 安全证据和扩展点引用，两项可分别同意 | 安全表补完明确路径和证据再启用绝对检查；扩展点清掉现有坏引用后单独接现有检查。安全表一次约 75 份记录需要对照源码；扩展点只加一份文档。二者分别交提交，任一未批，另一项可走。 | 可以只开其中一个或暂缓。扩展点三处事实勘误可作为独立文档修正交原写手，先不接门禁。 |
| 2. 插件／Module 的 `./contract` 是否进公开 API 快照 | 进同一套快照，只收工作区明确声明的 `./contract`，含 Shelf。一次新增 12 个快照；以后有意改合同才刷新并说明影响。 | 保持现有检查范围，BL-901 保留，接受工作区调用方依赖的合同变化不会由 API 快照提示。 |
| 3. 宿主出口如何收住、Coding 伙伴导入漏扫怎么补 | 先把 RAC-438 补到所有宿主子目录；有效出口宽度先在整批组合头报告，确认在途变化后按 merge-base 只减、挡新增。无需先迁 1,000 多个测试文件；报告与正式阻断分别确认。 | 可以在确认组合头无未处理增长后直接启用只减；也可以只补 RAC-438、宽度留后续。出口迁移及任何测试专用子路径是后续合同决定。 |

## 规则和落地前置

**1a · 安全记录：BL-914＋BL-569。** 现有 `TEST_REFERENCE` 认识 `.e2e.test.ts`，但「总表被删」和「测试无归属」各用一份不认 `.e2e` 的正则。基点 6 个同前缀浏览器测试已全部登记，4 个列 CI、2 个列本机（回程测试在多条记录复用）。用一份测试文件谓词覆盖 `tests/security-invariants-<slug>[.e2e].test.ts`，用于这两个入口；仍只在已有命名和目录范围内发现。沿用现有测试引用、标题片段与调度检查，不把文件挂到不相干记录，也不以字符串命中宣称业务断言正确。

代码列目前完全未查。用共享 Markdown 行内代码读法，只对该列独立的 `.ts` 文件引用核对（可带行号，行号不校验）。写成本仓根起的完整路径，严格按候选 Git 文件集精确匹配；没有、写成简称、越出根、用同名文件代替均报记录 ID、行号及原文。不要求每条都有 TypeScript 位置（仍有 Rust／脚本）；不扫描说明列的符号、示例和历史叙述。上游用指向具体来源的 Markdown 链接和说明，历史移到非现行位置的正文或历史链接。沿用现行链接检查，门禁不联网，不加通配、全仓同名回退、过渡计数或例外名单。

基点 175 条记录的代码列有 1,118 条字面 `.ts` 引用：785 条以门禁认的仓库根名开头，333 条简称分布在 75 份记录。逐条按本不变量的实现链确认再补全，如 S-02 的 `web-http.ts` 指宿主 HTTP，S-109 的 `replica.ts` 指本条同步实现；不能批量按文件名替换。完整路径中 S-38 两条属 Prologue 上游（连同两处 Rust 来源明确写成上游出处）；S-56 的旧设计系统按钮实际迁到 `packages/plugin-sdk/src/ui/button.ts` 的 `renderButton`。简称里另有 S-121 已明写 U1-d 删除的聚合复制存储，应移出代码列的现行引用。先核准当前树所有位置，再开绝对检查；若来不及写清或遇到在途所有者，维持待决，不带缺口开门禁。

五组旧拒绝断言在基点仍未被对应记录引用。补真实测试标题，保留原测试断言和原有引用：

| 记录 | 测试与实际拒绝 | 列 |
| --- | --- | --- |
| S-03 · RAC-1805 | `tests/web-mutation-key-settle.test.ts`：`a key that has been served is refused with 409 at the old Goals addresses too, and the refusal leaves it used` | 已进 Verify 产品子集，但现行安全表只读 scripts 和 CI 里的字面文件名。此处另须批准：复用产品子集已有计划解析，只把实际列入且不在隔离表的用例认作 CI 证据。无新调度、无第二份名单；计划无效不据此承认。 |
| S-17 · RAC-411 | `tests/plugin-artifact-operations.test.ts`：`process recovery uses only its store, producer signature and personal owner across upgrades`；同一测试体确有成果 `readOwn`／`head` 拒绝不同发布者签名，注释标 RAC-411 | CI，已在 `test:security` |
| S-86 · RAC-2435 | `tests/project-rows-deletion.test.ts`：`a declared file is not removed through its directory swapped for a link after the check` 与 `a failure to re-read the parent's real path is not a skip: the rows roll back and a retry removes the file` | CI，已在 `test:security` |
| S-47 · RAC-1809～1811 | `tests/security-invariants-plugin-pages.test.ts`：分别引用已存在的三个完整标题；坏百分号编码在匹配声明形状、未声明形状、普通 Home 请求各按原协议拒绝 | CI，沿原测试 |
| S-100 · RAC-2711 | `tests/feed-inbox-lifecycle.test.ts`：`a capture whose call is refused by a revoked grant is thrown again and its whole write rolls back` | 本机／Full；当前未列 Verify，不记成其证据 |

后续允许文件：`scripts/gates/security-invariants.mjs`、`tests/security-invariants-doc.test.ts`（真实树夹具纳入 tracked 源码、临时快照做突变）、安全总说明和对应独立记录、`scripts/gates/README.md`。产品子集计划只读。等 N3 集成后的检查结果；在在途记录写手交接或合并后逐条核对，不改产品安全边界、业务拒绝测试、CI 调度及其他来源规则。

**1b · 扩展点 N10。** 基点仍有三处过时事实：§3.2 及总表还称无法安装，实际已走签名包的预览、本人确认、发布者固定及沙箱（[实际入口](../../../../apps/local-host/src/plugin-install-service.ts)、[安装说明](../../../../docs/system/THIRD-PARTY-PLUGINS.md)）；§4.2 F2 的 Coding 库与工厂已由[自己的数据库声明](../../../../plugins/native/coding/src/database.ts)和 [Runtime 登记](../../../../plugins/native/coding/src/registration.ts)持有，不需给 Host 加 `codingPorts` 或为插件升 Host 基线（其现值为 2）；§3.1 舞台的具名函数已撤，沿[声明渲染](../../../../apps/workbench/src/declared-stages.ts)，历史路径从现行接线列移出。

把 `docs/system/EXTENSION-POINTS.md` 单独加进现有 `isCitingDoc`。在内存按现有解析核对基点，新增 8 条失败：已删 Feed 页面 `apps/workbench/src/feed-projection-ui.ts`；工作台 4 个实际仍在、但少 `apps/workbench/src/` 前缀的引用（设置目录、设置脚本、通知、初始化）；§3.7 两个关于旧放置／首页手写表的相对位置，改为明确历史并指向现行声明；尚未存在的观测包，保留为计划说明并链接已有[操作合同说明](../../../../docs/platform/CONTRACTS-AND-OPERATIONS.md)。分清真正的文件、历史路径和计划，优先修文字和路径。只核现有口径内的反引号路径、根 pnpm 命令和可识别的动作 ID；代码围栏、未声明为路径的简称或符号、模板匹配的精度与原检查相同。它不会判断一段「现在」是否属实，三处事实需按实现人工核对。允许文件仅扩展点说明、`scripts/gates/doc-citations.mjs`、`tests/doc-reference-gates.test.ts`、`scripts/gates/README.md`；当前八处不需新例外。W6-06 的文档归档结果已在基点的[索引](../../../README.md)中，延续现行说明，不重开防腐归档。

**2 · API 范围 BL-901。** 当前脚本的 `API_PACKAGES` 仅 contracts 和 SDK；不能直接把 12 个包按现有整包规则追加，那会把根实现、登记和样式等其它子路径也纳入。以被测根的 workspace 登记及其包 `exports` 为入口集合，保留现行两包范围，其他已登记插件和 Module 只读精确 `./contract`。当前是 coding、dataset、feed、form、goals、images、jelly、lingguang、pages、ppt、todo 和 `modules/shelf`；不把这 12 个名字做成名单。对 `--root` 夹具从传入根发现清单，不把当前 `WORKSPACE_PACKAGES` 的模块加载目录当测试根；优先复用 workspace 声明发现，在既有读取器内提供根参数所需的最小复用。覆盖单文件与目录入口（Feed、Goals 是 `dist/contract/index.d.ts`）。沿用已有生成器的单次声明编译、分包分子路径快照与 `pnpm api:update`，使用唯一包目录键，如 `api/plugins/native/goals/contract.txt`、`api/modules/shelf/contract.txt`，旧两包位置不动。新增路径缺快照、删除后残留、修改未刷新均走现有失败和差异报告；解析不出的声明入口报错，不能静默跳过。

这些包都是 private，仍是有调用方的工作区公开入口：Host 和 Workbench 直接用 Goals 合同；Shelf 插件直接用 Shelf Module 合同的类型和 `SHELF_ADMIT_ACTION`；12 个入口都被测试引用。外部插件仍只装 contracts 与 SDK；不改 exports、发布面、版本、动作快照或调用语义。参与快照的包域和实际快照入口由同一个发现结果提供：Goals 的 `GoalWorkEventBase` 这类非入口辅助类型应随声明列出，已有公开承载者的跨包再导出仍以承载子路径引用，不复制一份定义。现有编译器按名字追 helper、SDK→contracts 规范化和独立校验继续生效；核对额外声明编译量、同名 helper、原快照串变和生成内容差异。命名空间类型和外部依赖仍按原已知限制；不把消费包根加入快照来消掉占位。出现原快照变动时由 C1 逐条裁定是实际合同携带位置变化还是解析误报，禁止顺手覆盖在途文件。

后续允许文件：`scripts/gates/api-snapshot.mjs`（若必要，只抽现有 workspace 发现的纯读函数，登记数据不改）、`tests/health-gates-api-snapshot.test.ts`、新增子路径快照及经 C1 核准的派生行、`tooling/gates/README.md` 和[合同变更说明](../../../../docs/system/CONTRACT-CHANGES.md)。生成数据单独提交，公共合同台核最终头；仍按现行合同时序、消费者与评审规则。

**3 · 宿主 R4／B1／G3＋RAC-438。** [原防腐方案](../../../archive/repository-anti-corruption/roadmap-2026-10-07.md)建议生产出口留装配、测试经 owner 公开入口和 test-kit 真实动作；另列过测试子路径作为取舍，并无此片加出口的授权。旧门禁只数入口的星号语句，测试内部引用统计则已经能解析嵌套测试文件里的相对 src/dist；G3 的缺口是把实现改挂到根出口后测试不再被计深路径。另一处漏扫在 [RAC-438](../../../../tests/coding-companion-stages.test.ts)：只读宿主顶层，用字符串匹配四个伴随插件。

- 宽度沿用结构门禁的同一个比较入口，保留原星号检查，再量包 `exports["."]` 实际可导入的名字。复用 TypeScript 解析及[快照导出索引](../../../../scripts/test-imports/exports.mjs)同源读取：按候选／merge-base 的源树展开星号再导出、计唯一公开值与类型名，别名按可导入名，接口与同名值算一个；星号不带出 default，显式 default 算一个。重导出的模块 namespace 单列它可访问的成员宽度并递归，按同一路径防循环；不数普通对象字段。仅入口可达的重导出依赖需解析，未解析时提示链路，不能当零；merge-base 读对应提交的包 manifest 和源码，不用磁盘 dist 或候选的依赖文件掩盖基线。先给组合头出报告及增长出处；批准阻断时走现有 `--base` 只减，不开例外和可提交基线，旧本地快查不能放过增长。它只防变宽，同数量替换仍依赖合同与消费者核查。
- RAC-438 沿原四个伙伴断言递归扫描 `apps/local-host/src/` 的源码。复用现有 import AST 读法，覆盖具名／类型、再导出、字面量动态 import／require 和工作区相对引用；唯一允许边是生成的 registry 到各包的 `./registration`，不是整文件任意导入。保留原舞台中立、无旧宿主文件及监督器装配断言；不加通用第二份层间政策。固定基点的递归 AST 核对四个包均只有该允许边。第 06 批若退役 Files，按实际仍存在的伴随关系同步更新测试及其余原断言，不把名单变化当新的例外。
- 只读盘点：基点入口 703 个显式具名再导出、7 条星号，用 TypeScript 的 `getExportsOfModule` 解析得到 785 个名字。按字面模块引用有 1,077 个测试或夹具文件使用它；B1 旧时的 45 个名字不可直接用作删减表。桌面 CLI／MCP／Web 启动、服务器网关／管理员、打包与运行时交付都实用；库结构快照、金样生成／回放四处整模块动态读（例 `homeStores`、`CATALOG_BASELINE`、`createHomeSnapshot`），不能只搜具名 import。仓内旧评审脚本和个别测试还引用已删的名字；如 `scripts/contextual-slice/dock-compare.mts` 仍调用已删 Feed 装配函数，须先分清历史证据和待修消费者；不以「找不到具名用处」删出口。后续先按生产／工具／测试夹具列出名字、实际读取和主人，再按测试族将 setup 改走 owner 合同或 test-kit 真实请求，每片保持一份 src/dist 加载并核正常和拒绝路径，最后才删除已迁完的一组入口。这次不迁几百用例或改变宿主 API。

后续允许文件：`scripts/gates/host-entry-exports.mjs`、`scripts/gates/structure.mjs` 及必要的既有快照输入／导出索引接线、`tests/health-gates-structure.test.ts`、`tests/coding-companion-stages.test.ts`、`tooling/gates/README.md`。避免改入口、包 exports、CI、规则阈值或测试 kit 的生产依赖。

## 开工前检查与冲突

| 项 | 裁决 |
| --- | --- |
| 1 事实主人；2 插件待遇；3 能力注册 | 路径以候选 Git 文件为准，安全条文仍由独立记录和原拒绝用例持有；API 以包声明和源码为准。无插件装配变化、无新动作或旁路。 |
| 4 合同；5 包边界 | 只记录现有公开工作区子路径，C1 管快照，统筹管规则；R4 首片不改公共 API，后续收窄按既有合同流程。无新包、运行时服务或外部依赖。 |
| 6 表与存储；7 兼容；10 升级与数据 | 无读写业务库、版本、兼容读取或迁移；历史文档改写不改变业务行为。 |
| 8 安全；9 调用次数 | 只增强定位和证据覆盖，不改变任何授权或拒绝；静态检查重用已有输入及编译入口，不起 Host、不调模型、无重复安排 CI。 |
| 11 成果／过程项；12 页面与外壳；13 错误 | 无业务成果、页面、翻译、资源体积或产品错误模型改动；门禁报文件、行或出口。 |
| 14 冲突面 | 见下；共享规则、文档和每份快照由单一写手接力，整批最后同步和统一验证。 |
| 15 全局最优 | 插件增加 `./contract` 只改自家清单，外部作者无新依赖；平台重用 health、路径解析和编译器；助理／Agent 没有新工具或批准；工作流、MCP、成果、连接器和同步不增运行成本；后续只在源合同有意变化时刷新快照，宿主收窄按实际消费者迁移，不让本批把迁移成本转嫁给在途写手。 |

- [#1999](https://github.com/molis-ai/molis-work/pull/1999) 固定头 `3afeeffdc` 改 S-15、S-47、S-30、S-103、S-agent-invocation；S-47 新增打印 D0109，补 RAC-1809～1811 时保留它，S-15 通知 D0206 沿 N3 交接。它与 [#2000](https://github.com/molis-ai/molis-work/pull/2000) 固定头 `755d369ba` 对 `EXTENSION-POINTS.md` §3.3 公开来源行的同一处修正，要保留 Feed 页面已迁回插件。#2000 还改安全总说明、S-30、S-84、S-87、S-skill-catalog、S-skill-import；若路径规范碰同一记录，合并后按实际源码和标题处理，不平行重写。
- 两 PR 的已见 API 物理差异与本片新增 `./contract` 文件不重合；#1999 占 contracts 的 platform/plugin、platform/ui 与 SDK execution、index，#2000 占 contracts 多项（含 platform/plugin、actions、plugin-trust）与 SDK index、ui。单一生成器会读这些文件对应的当前声明；先接回这些所有者的快照，最终头生成，不以旧头整目录覆盖。#2000 改宿主星号达及的 `local-host.ts`、`project-catalog.ts`、`project-host.ts`、`web-project-settings.ts`；R4 即使不写入口也要用组合头重算。两固定头未改 RAC-438 测试或本片所列门禁模块。
- 第 06 批在 `batch/06`／`codex/06-home-join` 已写 S-18 的 BRC／N12 证据和 `scripts/check-health-gates.mjs` 的 N56 接线；`codex/06-sdk-tools` 另改 SDK 的 browser、index、whole-units 快照与 `scripts/gates/source-counts.mjs`。本片优先在规则模块接入，若确需碰 health 汇总，串行交接。S-18 补路径须保留新增记录；API 最终头复算；Files 退役完成后再决定 RAC-438 的第四条及相关装配引用。这里引用的是固定头／本地分支差异，集成前由统筹重查在途头、同一记录、同一快照及导出来源。

## 验收

| 编号 | 获批实施后应有的正反例 |
| --- | --- |
| B27G-01 | 安全规则真实记录全部过；临时快照删掉代码列点名的已入库源文件即报该行，即使同名文件还在另一个包；同目录简称、越根也报，现行完整路径过，上游历史出处不误报。 |
| B27G-02 | 仅有 `tests/security-invariants-extra.e2e.test.ts` 的树缺总表即报；有表但未登记也报；挂在正确记录、含真实标题并列合适栏即过。保留原普通测试、标题及 CI 检查。 |
| B27G-03 | 五组拒绝证据齐备 [人工]；若批准覆盖判定，已有且未隔离的产品子集证据过，从清单移走／进入隔离则不能借此算 CI。Full-only 与无效计划不满足 CI，原已认可的执行路径仍可用。 |
| B27G-04 | 扩展点里临时删被引用的已跟踪源文件或改成无效脚本／已知命名空间下的无效动作即报该行；现行路径、命令、动作通过，围栏例子不误报；三处现状按实现核实 [人工]。 |
| B27G-05 | Fixture 新增工作区包或给已登记包新增 `./contract`，缺快照失败，刷新后通过；删除包／子路径后残留快照失败。根实现、登记和非入口无关变化不入快照；现行 12 个入口均生成 [人工]。 |
| B27G-06 | 有关跨文件／跨包 helper 增必填字段或改签名未刷新时失败；无关实现／注释改动通过。公开再导出指向唯一承载子路径；不能把未解析出口当合同已生成。 |
| B27G-07 | 在星号达及的二层文件加新导出、加具名别名、在模块 namespace 里加成员，报告具体增长；若启用只减，同样候选失败，`--update` 不得清账。同名合并、实现搬移不假增，减宽通过；只修 RAC-438 时本条继续待决。 |
| B27G-08 | 在宿主子目录构造指向四伙伴之一的字面导入（包括动态或再导出）被拒；既有生成登记与无关模块引用通过，RAC-438 的产品装配断言保留。 |

实现时按相应编号运行 `node scripts/run-tests.mjs --jobs 1` 的 `security-invariants-doc`、`doc-reference-gates`、`health-gates-api-snapshot`、`health-gates-structure`、`coding-companion-stages` 对应测试文件；安全五组原断言随整批定向计划验证。API 改动运行 `pnpm api:update` 并核对差异；阻断规则在最终组合头跑 `node scripts/check-health-gates.mjs --base origin/main`。按 §8.4 分提交随批，不单开 PR，整批统一 build 和选择回归、CI 最终头跑全量；PR 单列门禁改动与验收编号。

本片证据只到方案：用 Git 跟踪清单和现有解析函数核对路径、引用和导入，TypeScript 只读探针核入口；不运行产品、构建或回归。待决项各自获准后才进入实现。
