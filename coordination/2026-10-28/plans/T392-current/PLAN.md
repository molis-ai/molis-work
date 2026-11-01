# R-A4 当前开工准备增量

状态：有限只读准备完成；**owner 待根正式分配，未取得 writer 窗口，未实施**。本文件补充已接受 R1/R2 的 `/tmp/w5-14-r-a4-plan/PLAN.md` 与 `REVIEW.md`，不替换原技术书、不重建机械文件矩阵。准备结论不等于工程验证通过。

## 1. 结论及冻结依据

当前核对基点 **M=`08642dcb92dbdad029d990813da56682d6864a23`**。T384 承载实际采用（#1712）的提交 `15ad4f397018241c8b31625aff8014b89259f239` 已是 M 祖先，原 `WAIT #1654` 已解除。主检出仍为 `08c9933d57e153d1d59bf2811f203056d4358992` 且干净；本轮读取 M 的 Git 对象，没有把主检出旧文件当作 M。

**技术上可以从已采用 M 的新独立树一次完成迁移，使用现行公开合同即可，不消费 PR1b 或其他在途 API。** 尚需根分配 owner、最终采用基点和下述短共享窗口；并非还需新的产品命名决定。若开始时 main 已推进，只核新增 delta 后重冻基点，不照搬旧锁。

本轮只读本地对象和既有报告，写自有 `/tmp` 交接；无 refs/工作树创建、源码修改、build、test、GH 或真实 Home 操作。open 依据为 `/private/tmp/root-open-0630.json` 的准确头快照，不宣称是实时 open/排他锁。详细头和交集见同目录 `DELTA.json`；非保护分支的 scoped diff 保留在同目录。#1101 初稿只读取完整文件表元数据；本补正引用同目录 REVIEW.md 已授权只读核实的 control 调用链，不操作保护分支。

## 2. 相对原方案的实际增量

- 原基点 `717d14f2ab8c9cb1b447003fabb120a70b6d9dd3` 到 M，**37 个移动路径集合及各文件 blob 均未变**：模块 21、Workbench 11、Host 5。目标 judgment-rules 目录/文件不存在，没有目标路径碰撞。
- 原 152 个审阅候选路径均仍存在；分类命中成员未变：私有实现包 59、module_path 111、Workbench 路径 25、Host 路径 18、公开 contract import 58。数字包含应保留项，不是全量替换范围，也不是执行上界。
- R1 原列 19 处活动 dist 映射仍存在，但并非完整表；本次补齐 functions-plugin.test.ts 的 4 处旧漏项，**合计 23 条活动 dist 导入映射**。原补正的 7 个漏项及本次 4 条均随原子迁移修改；不能用旧构建目录验证。完整映射仍维护在原 inventory.json 的 active_dist_import_mappings 和 relative-imports.txt，不新增文件矩阵。
- 唯一新增到实际审阅范围的漏项是 `apps/local-host/src/typesafe-connection.ts:5` 的说明注释：其中服务源码位置 `(modules/functions)` 应改为 `(modules/judgment-rules)`，consumer/pluginId `functions` 与 slotId/serviceId `typesafe` 均不变；不把注释中的 plugin-slot 简称误解为 slotId。这处在旧基点已存在，是旧盘点遗漏，不是新 main 行为。其余扩搜命中为公开合同或历史材料，排除，不生成 153 文件机械矩阵。
- 原候选中 18 个文件已有主线变化，清单见 `DELTA.json`。必须保留：T143 的卸载 sandbox image binding 清理；T148 删除的 desktop runtime-launch/panels 与旧 Goals UI 装配登记/owner；`host-pages-error-model.test.ts` 已采用的 `artifact-library-http.ts` 路径。迁移不能把旧整文件拷回而复活这些内容。

稳定身份已核 M：`contracts/modules/functions` 的源文件、subpath、API snapshot 不动；`system.functions`、动作/权限、导出函数名、TypeSafe consumer/pluginId `functions` 及 slotId/serviceId `typesafe`、Home store path `functions`、baseline/DDL 不动。`home-stores.ts` 的 **`owned("modules/functions", FUNCTIONS_HOME_STORE)` 字面量 owner 保留**；该库是 ordinary snapshot，不存在本片可声称验证的 Functions 专属 sealed 恢复。

`workspace-packages.mjs` 只改实现目录及 local-host 私有依赖名，模块 entry 的 contract 仍为 `@molis-ai/molis-work-contracts/modules/functions`。error-owners 的实现路径随迁移更新，但 owner 键 `functions` 和 contracts 路径保留。R2 仍未落地：现有 snapshot 测试只与 `homeStores()` 自比，须补独立固定值断言。逐移动源码的旧/新 error owner 仍须逐项比较，不只凭门禁绿色。

本次补入的四条均在 `tests/functions-plugin.test.ts`，M 行号及旧→新路径如下；该文件本来就在六个 README 完整测试中，不新增测试批次，保留符号、断言、fixture 和 basename。

| M 行 | 旧 dist 路径 | 新 dist 路径 |
| --- | --- | --- |
| 39 | `../apps/local-host/dist/functions-http/routes.js` | `../apps/local-host/dist/judgment-rules-http/routes.js` |
| 40 | `../apps/local-host/dist/functions-http/route-handlers.js` | `../apps/local-host/dist/judgment-rules-http/route-handlers.js` |
| 42 | `../apps/workbench/dist/functions/ui.js` | `../apps/workbench/dist/judgment-rules/ui.js` |
| 43 | `../apps/workbench/dist/functions/settings-ui.js` | `../apps/workbench/dist/judgment-rules/settings-ui.js` |

这四条在旧基点也已存在；此次只是补齐执行映射，不增加移动路径或候选文件。

## 3. 当前候选的真实共享位置

下表为本轮已读的干净本地候选；准确头均记录，不能拿旧远端头替代。共享文件不自动等于共享行为或技术依赖。

| 候选 / 准确头 | R-A4 的真实交集与所需窗口 |
| --- | --- |
| PR1b `d5a1ee558a622aa264d19da42921b3ab8aaa2d32` | Host `index.ts` 的 `declaredStageRequests` 导出，与 R-A4 的 functions-host/http 导出是不同 hunk；privileges 的 PG-060/PG-094 与 R-A4 PG-010/PG-034/PG-045 注记是不同位置。根短时串行收这两文件的精确差集。R-A4 不动 SDK/API，不依赖新 stage API。候选绑定和实际树为准，旧 REPORT 的冲突描述已过时。 |
| T390 `b7eee1b15353b74c586da601d45418c403e0ff5f` | 根 package.json 的 test:security 脚本与 R-A4 私有依赖键是不同 hunk；同一短窗口保留两者，不触碰 S103 行为。 |
| T386 `cb931d6537276952d716b6ca3c3b2b225b222406` | 本次实际路径范围无直接交集。最终资源预算仍须按实际采用 main 实测，不能沿用其他候选的抵扣或额度。 |
| T389 `13767116bd339558596e13ad6b36a3a3ed19f3cc` | 本次实际路径范围无直接交集；资源处理同上。 |
| T065 `df4d3f92dde968062a232bd5ceb5f402da8dec5f` | settings-view 的 R-A4 类型 import 与删除 notion_oauth_configured 不同 hunk；connectors-settings-behaviors 的路径断言与删除参数不同；根 package 的脚本/依赖不同。CALL-CHAINS 的 OAuth 行和判断规则行相邻但不同。CHANGELOG/BACKLOG 只交根收真实必要差集，不机械改历史。open #1669 仍是旧 `94861f0…`，不是此已同步本地头。 |

PR1b/T390/T386/T389 的候选基点均为 `db29f18d4f602fa8d9efb689a6a766aa9b07625f`；T065 为 `8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987`。这些不是让 R-A4 建 stack 的理由。

## 4. open0630 对照及保护边界

20 个准确 head 全量保存在 `DELTA.json.open0630`。以下是按实际引用筛选后的共享 hunk 结论，不沿用旧锁快照的交集数字充当新锁：

| PR / snapshot head 前缀（完整值见 DELTA） | 当前关系 |
| --- | --- |
| #1682 `2de956e7`、#1683 `07592e0f` | lockfile 和 workspace registry 共文件，但对方修改 Knowledge/Artifacts 的 plugin-sdk 依赖，R-A4 改 Host 私有依赖与 Functions 实现 entry，是不同 importer/entry。#1683 对 dc544 基点的差分包含 Knowledge 前片，不全是其自有改动。需要一次短生成窗口，不手工覆盖整份锁/表。 |
| #1680 `d37ec34c` | 用其自身 base `7f389082cc2440875d3a42376a03309efe2b043e` 的 44 文件 delta 对照，不把 stack 的 313 文件误算为它的写入。与当前 PR1b 同类的 index/privileges 位置；以当前候选 d5a1 为接续判断，旧 PR 头仍保留事实。 |
| #1677 `c2502b62` | index 的 connector 导出与 functions 导出相邻但不同。connector-consumer-usages 测试改 Host/Feed import 和 Feed case，R-A4 改 functions 模块 import（对方 hunk 的上下文行）；合并时保留 Feed 新语义并跑完整文件。privileges、Feed/Inbox slice 为不同位置。 |
| #1676 `c35ad303` | page-assets.ts 删除 onboarding 样式 import/输出，R-A4 改 FUNCTIONS_STYLES import 路径；不同语句，同一小文件串行整合。privileges 不同位置；最终资源按采用基点实测。 |
| #1672 `ebcd6536` | index 不同导出；settings-connectors 的第 2 行 functions import 与第 4 行 connector-guide import 相邻但不同，保留 loginReady 行为。settings-view、连接设置测试、package 不同 hunk；CALL-CHAINS 相邻不同表行。baseline 仅最终生成，不手合。 |
| #1669 `94861f09` | T065 的旧远端头，不能覆盖本轮已核的本地 df4d；共享位置见上表。 |
| #1713 `44efe84d`、#1664 `815d6e11` | error-owners 改 storage 段，R-A4 改 functions 实现匹配段；CHECKLIST 改 storage 策略，R-A4 只改 Functions 源码路径且保留库路径；CALL-CHAINS 也是不同段落。 |
| #1714 `3862de92`、#1663 `4e605576` | 仅 Feed/Inbox slice 不同段落，与 R-A4 源码 owner 路径注记不重合。 |
| #1673 `d4f77755` | BACKLOG/主防腐 spec 的 Images 内容与 R-A4 包清单行不同；由根串行整合。 |
| #1700 `c52dcc20`、#1671 `afbcdaad`、#1665 `170777c2`、#1526 `9b4372eb` | 本次实际范围无交集。 |

**#1101 继续保护**：head `2b38b5f5fef4bf70617c3c05b22b6d446771d693`，完整原件 `/private/tmp/root-1101-completefiles-0554.txt` 为 584 行；本线初稿只核文件元数据；独立 REVIEW 已对 merge-base `b707895b45c20fcaa8727ae85c093bb5c04ee61b` 核实完整 584 路径与真实 diff。以下接续说明引用该 REVIEW，不声称无冲突，也不提前消费候选。实际候选相交 17 路径：Host index/project-deleted-owners/project-host，Workbench page-assets，PROLOGUE-AI/CHANGELOG/CHECKLIST/HOME-DATA/HUGE-CLASS-MIGRATION，**modules/functions/src/project-data.ts**，lockfile，workspace-packages，molis-plugin-dev Skill，主防腐 spec，functions-authoring-actions/system-functions-actions 测试，baseline。根须安排主线迁移窗口并交原 owner 旧→新路径图；本片不进入、不修改、不 cherry-pick、不解除其保护，也不自行推断要无限等其合入。

**#1101 control 契约交接**（来自独立 REVIEW）：`modules/functions/src/project-data.ts` 的保护增量增加 `ProjectDeletionControl`、逐步 `assertCurrent` 并传给 `clearInExistingHomeSqlite`；`project-deleted-owners.ts` 的 `ownerOf` 向 `data.purge` 传 control。R-A4 只移动已采用 M 的文件及修改私有包 import，不提前引入这些控制语义；原 owner 经授权接续时将其控制链映射到 `modules/judgment-rules/src/project-data.ts`，保留库名 `functions` 和相对 store-schema 引用。`functions-authoring-actions` / `system-functions-actions` 的保护增量含项目库初始化/root 写入及 import，迁移只改包/dist 路径；两方正文都保留，由保护 owner 对实际组合验证，不背签旧测试结果。index/project-host/page-assets 为不同语句；registry/lock 不取保护候选的 SDK/integrity。共享文档和 baseline 仍按最终实际组合处理。

另外保护头 #1059 `c886c603bd2678bcabaf5128dd8879e0d7a08607` 仅交 baseline，#784 `a1ffb2aca95e903e1b33fbe89bdd5bca9b220a15` 仅交 BACKLOG，#734 `e4893423ec80a5275600f574d69e4fa7bc6d65f8` 无交集；使用相同准确头的既有完整元数据，不改变保护状态。

## 5. 可开范围、短窗口与采用顺序

1. 根分配单 writer、正式接受原技术书及本增量；从执行时**已采用 main** 建新隔离树，冻结 base/head/tree/dirty。只做 37 路径移动、私有包名、必要引用（含 23 条 dist 映射）/登记/活文档与 R2 断言；不建兼容 alias、不改数据或公开 API。主检出继续只读。
2. 如果 #1682/#1683 等 registry/lock 变更已经具备采用条件，宜先采用再冻结一次；否则根可先给 R-A4 短窗口，后续 owner 基于新路径接续。没有必须消费在途提交或长期 stack 的技术条件。PR1b 可独立先后采用，SDK 窗口不纳入 R-A4。
3. 短共享窗口 A：37 路径原子迁移与实际 import/export、根/Host dependency、registry/lock 同一 writer 串行处理；index/settings 的邻接 import 逐行保留对方变化。涉及 #1101 保护交集前，根明确主线窗口与路径图交接，不能依据本报告自行抢写。
4. 短共享窗口 B：根串行收 SSOT/主防腐 spec/privileges/CALL-CHAINS 等必要行与 package-owners/package-inventory 输出；不覆盖整表、不改历史结论。error-owners 仅实现 glob 改名，保留已采用的删除。baseline/资源记录最终依实测生成。
5. build 使用公共 build 槽；所有本机测试（含非浏览器门禁）均使用公共 browser 测试槽，不用 build 槽代替。纯物理 rename 预期 served bytes/API/actions 不变；若资源有实际 delta，根按最终采用的资源 tuple 另排预算窗口，不预先改 ceilings、不复用 T386/T389/T065 额度。最后作为一个完整迁移提交/普通 PR 交根采用；后续 owner 经授权普通 merge 已采用 main，按旧→新路径图处理 rename/modify 与邻接 hunk，保留各自业务修改；禁止 rebase、禁止 force push。保护分支由原 owner 与根决定接续，本片不操作；本报告未执行这些动作。

## 6. 最小补测及证据边界

**新增测试逻辑只需原 R2**：在现有 `home-snapshot-content.test.ts` 的真实 snapshot manifest 中，独立用固定 path `functions` 找到 store、断言存在，并断言 owner 严格等于固定字面量 `modules/functions`，标 RA4-03；不从 registry 推导期望。保留实际库内容与 SQLite 完整性断言，不新增 sealed 恢复主张或第二套 fixture/manifest。

原 R1/R2 验证合同继续适用：匹配整体 build 后跑模块 README 六个完整文件；scene-default-rules、home-store-baselines、home-snapshot-content；完整 package-owners 和 translation-check。R1 新补的 contextual-dock-parity、feed-capture-scenes、inbox-automatic-scenes、workflows-judgment-link、list-silent-refresh 五文件本机定向；home-offers.e2e/inbox-current.e2e 两文件须公共 browser 槽或根绑定最终准确头 CI/Full。Workbench 的 function-agent-authoring.e2e/capabilities-page 按原计划安排，不因目录改名只做静态查找。

因共享邻接 import，最终采用 #1677 内容时，connector-consumer-usages 完整文件纳入组合验证；连接设置路径变更对应 connectors-settings-behaviors 完整文件。只改 typesafe-connection 注释不增加连接业务测试；如实际业务 diff 出现，再按原计划追加现有相关完整文件。

boundary、merge-base health、test-imports、API/actions 零差异核对、page-assets 和实际 affected-tests 仍由最终准确树证明；CI/Full 由根整合，不本机跑 Full。不得用旧 dist 遮蔽漏导入，不为绿色改业务断言或 fixture。未运行项保持 NOT RUN/HOLD；本轮以上全部是待执行验证，没有测试通过声明。

本轮交付只完成“当前可开工范围与调度建议”。原方案的 #1654 等待可解除；owner、最终 main 与共享/保护窗口由根正式分配后才进入实施。
