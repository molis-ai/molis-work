# R-A4 当前准备增量：独立只读窄审

结论：**最小原子迁移仍可行；派发前须补正两处执行材料：禁止 rebase，以及补齐同一测试文件漏列的四条活动 dist 映射。** 原 accepted `/tmp/w5-14-r-a4-plan/PLAN.md`、`REVIEW.md` 仍为唯一迁移合同，本文不另立方案、不扩大迁移行为或测试矩阵。#1101 的真实交集已只读核清，需根明确路径交接窗口，但不构成必须先采用其候选的技术依赖。owner/写锁尚未分配，本报告不放锁，开发线4仅是根可选作者。

## 准确输入与已核结论

基点 M=`08642dcb92dbdad029d990813da56682d6864a23`，tree=`1a5141a207f7af8aeda53c70f5bba1e8b3daf6bd`。本次本地 origin/main 等于 M，主检出 HEAD 仍08c9933且clean。M 是 T391 #1717 文档提交，父db29；T384实际采用15ad4f397（#1712）是祖先。新稿将旧 #1654 等待视作已解除可接受，但对外应准确说“由T384承载实际采用”，不能把#1712称作#1654原PR自身merged。未fetch或GH刷新，不声明最新远端状态或锁排他性。

独立用Git对象核原inventory，不重建矩阵：

- 37个移动路径与原717d14f2对应blob全部相同，分组仍21 Module/11 Workbench/5 Host；按原规则得出的37目标路径在M均不存在，无碰撞。
- 原152候选路径均可读取；其中18个已变化，与DELTA清单完全相同。仅移动37文件blob不变不意味着可整文件覆盖其余消费者；T143/T148等已采用变化必须保留。
- 原列19条活动dist映射全部仍存在，但不是全部活动导入，见下面补正2。原R1七个新增测试均已在映射内，原R2也已写进新稿。
- `typesafe-connection.ts:5` 的括号源码目录说明确需随迁移更名；同文件CONSUMER="functions"保持。准确字段区分是consumer/pluginId为functions、slotId/serviceId为typesafe，均不改；原稿简称“TypeSafe slot functions”不能被理解为将slotId改名。

## 两处必要修订

**1．§5第5项的“后续分支按路径图 rebase”必须删除。** 用户明确禁止rebase。建议改为：“作为完整迁移提交/普通PR由根采用；后续owner经授权普通merge已采用main，按旧→新路径图处理rename/modify与邻接hunk，保留各自业务修改；不rebase、不force push。保护分支仍由原owner和根决定接续，本片不操作。”这是执行禁令，不是技术选项；本线未执行任何历史重写。

**2．§2/原清单的19条dist映射不能作为完整导入表。** 本次对M的活动dist引用窄搜为23条，原19条之外，`tests/functions-plugin.test.ts` 同一文件还有以下四条；它们在原717d14f2就存在，原relative-imports与active_dist_import_mappings确实未列出，不是新main新增：

| M行 | 旧路径 | 同原子迁移的目标 |
| --- | --- | --- |
| 39 | `../apps/local-host/dist/functions-http/routes.js` | `../apps/local-host/dist/judgment-rules-http/routes.js` |
| 40 | `../apps/local-host/dist/functions-http/route-handlers.js` | `../apps/local-host/dist/judgment-rules-http/route-handlers.js` |
| 42 | `../apps/workbench/dist/functions/ui.js` | `../apps/workbench/dist/judgment-rules/ui.js` |
| 43 | `../apps/workbench/dist/functions/settings-ui.js` | `../apps/workbench/dist/judgment-rules/settings-ui.js` |

该测试本来就在原候选和模块README完整文件验证范围，**不新增文件/测试批次或重建152文件矩阵**；只在现有迁移映射加这四条并将“19全部”口径更正为原19+补4。原合同“所有活动消费者同片迁移”不变。若writer只按19条表改，干净新树会缺模块、旧dist可能掩盖，故这是实施前必须交代的漏项，不应等运行才发现。保留符号、业务断言、fixture和测试basename。

## 稳定身份与R2

M上已核：实现包private=true/version0.0.0；workspace entry的公开contract仍`@molis-ai/molis-work-contracts/modules/functions`，层/production/capabilities不随目录改。error-owners的functions键和contracts路径保留，仅三个实现匹配换路径，不扩大范围。原REVIEW已要求逐移动源码比较旧/新error owner，继续执行，不能只信门禁绿色。

`FUNCTIONS_HOME_STORE`在store-schema.ts为 `{path:"functions",library:{baseline:FUNCTIONS_STORE_BASELINE}}`，没有专属sealed snapshot；home-stores.ts:39的`owned("modules/functions", FUNCTIONS_HOME_STORE)`是持久owner身份，必须保持，不是待重命名源码引用。公开subpath/API snapshot、descriptor、system.functions、动作版本/schema/权限、函数符号、Home库/DDL及TypeSafe绑定身份保持原合同，不引入别名/双读/迁移。

M的home-snapshot-content:33仍用manifest对homeStores自比，未有R2固定值断言。新稿§6正确要求实际createHomeSnapshot结果中找独立path字面量functions、assert存在，再严格assert owner字面量modules/functions，标RA4-03；不可由registry推导期望。保留现有真实库内容和SQLite完整性；无需新manifest/fixture框架或Functions sealed恢复主张。

## 共享hunk核查与#1101真实交集

已按本地准确候选对象核PR1b d5a1ee55（base db29）、T390 b7eee1b1（base db29）、T065 df4d3f92（base8a46），及DELTA注明的历史open heads；不把这些候选当已采用main。

- PR1b只在Host index加declaredStageRequests导出，R-A4改functions-host/http导出路径；privileges改PG060/094，迁移注记在PG010/034/045。不同hunk但由根短时串行收，R-A4不取新stage API或占SDK窗口。
- T390根package只有test:security脚本变化，依赖未变；R-A4私有依赖键不同hunk。T065的settings-view删除notion字段、连接设置测试删参数、CALL-CHAINS改OAuth行，与R-A4类型/源码路径不同；不整文件回灌。
- #1682/#1683 registry分别是Knowledge/Artifacts的plugin-sdk依赖；R-A4是Functions entry和Host私有依赖。#1683使用DELTA的dc544基点所见还带Knowledge前片，不能将其全部称为C自有差分；不影响“不同entry需串行生成”的结论。
- #1677 connector-consumer-usages确有Feed/Host import及业务case变化，Functions import是相邻上下文。#1672 settings-connectors的loginReady变更与Functions settings import相邻但不同。未来普通merge保两方语义，完整文件验证仍沿原合同/新稿，不复制未知旧整文件。

本轮获授权只读保护diff。#1101 H=`2b38b5f5fef4bf70617c3c05b22b6d446771d693`，相对M的实际merge-base=`b707895b45c20fcaa8727ae85c093bb5c04ee61b`。Git差分的584路径集合与`root-1101-completefiles-0554.txt`逐项相同，和原候选集合相交17路径确实成立。不是拿默认100文件截断表判断。

| 实际共享区域 | 保护候选做了什么；对迁移窗口的含义 |
| --- | --- |
| `modules/functions/src/project-data.ts` | 增加ProjectDeletionControl可选参数、逐步assertCurrent并传给clearInExistingHomeSqlite。这是直接生产rename/modify交集。R-A4只移动M的文件、不采这段候选；其owner日后将这些控制语义接到`modules/judgment-rules/src/project-data.ts`，保留库名functions和相对store-schema引用。 |
| `project-deleted-owners.ts` | 新增删除恢复/重建控制、ownerOf向data.purge传control、分区与其它owner清理变化；R-A4只改functionsProjectData的私有包import。文件级共享并有调用链关联，但迁移不需要提前引入ProjectDeletionControl。 |
| `project-host.ts` / `index.ts` | 保护候选改Artifacts registration刷新、删除恢复/Memory相关导出；R-A4改Functions两处import/导出路径。不同hunk，后续merge不得用整文件取旧版本覆盖任一方。 |
| `functions-authoring-actions` / `system-functions-actions` | 保护候选新增项目库初始化/root写入及相关import；R-A4改私有包/dist导入。两方测试正文都保留，未来保护owner针对其实际组合验证，不把本片旧结果背签保护候选。 |
| `page-assets.ts` | 保护候选删Coding样式直连、接pluginWorkbenchSettingsStyles；R-A4改FUNCTIONS_STYLES import路径。不同语句，不借候选样式减少抵消迁移资源。 |
| registry / lock | 保护候选Artifacts storage/plugin-sdk依赖和vendored Prologue integrity；R-A4是新Functions目录/importer/Host依赖。不能拷保护lockfile或SDK，实际采用后各自生成对应元数据。 |
| 六份文档/Skill、主spec、baseline | 保护增量是Memory/项目库版本、运行契约/迁移说明及尺寸等；与R-A4现行Functions路径注记不同。共享文档只收准确行，主spec包清单不覆盖Memory保留机制。baseline按最终组合生成，不手合计数。 |

只读检查保护候选的已改生产/测试/脚本路径，物理Functions引用仍在上述已知消费者，没有发现需扩大本次迁移行为的新保护消费者。**保护分支始终不修改、不检出、不取实现、不cherry-pick、不解除保护。** 新稿§4目前只有元数据层结论；正式派发应把上表最关键的project-data→ownerOf/control调用链和两测试路径交接写入简短窗口说明，替代“未知hunk”的占位，不另建大矩阵。不能凭纯rename自动推断无冲突，也无需凭17同名文件要求无限等待#1101先合入。

## 可派的最小窗口

补正以上两项后，根可指定开发线4或其它唯一writer，在**执行时已采用main**的新隔离树一次做完整迁移；先重冻基点与当前实际认领，不消费任何在途候选。主检出只读。原37移动、实现包/消费者/登记/23条dist映射及R2同一原子片，不拆出缺引用的中间采用状态。

根明确一次短共享代码窗口：Host index/项目装配/清理import、settings与page-assets邻接import、workspace registry、根/Host package和lock、error-owner定位及翻译路径。#1101原owner收到旧→新路径图和上述control链交接，本次不触其分支；该接续只允许经授权普通merge。随后根串行收SSOT/主spec/privileges/CALL-CHAINS及必要生成行，writer不同时覆盖总表。

运行沿唯一accepted合同：独立干净新树/frozen offline安装、匹配整体build，现有完整业务与R1/R2文件、翻译/owner门禁、Workbench/连接设置路径验证；API/actions应零差异，served资源按实际新M/H测量。**所有本机测试（包括非浏览器门禁）都占公共browser测试槽，build用公共build槽，不以build槽替代测试槽。** 不新增全矩阵、不本机Full；两份可交准确最终CI/Full的浏览器文件未执行时按合同记HOLD，不能凭静态导入销账。若仅物理rename造成资源变化，按真实原因交根，不复用T386/T389等许可。

是否等待已接近采用的registry/lock任务，是根调度选择；没有技术证据要求stack或提前取兄弟候选。此次仅完成书审，所有工程/真实产物验证仍NOT RUN。根尚未正式派发，本文不是作者选择、共享锁释放、代码实施或READY/采用签署。

本轮仅只读Git/现有材料，写此REVIEW；未构建、测试、GH、refs、源码、协调或共账操作。未重建原机械矩阵。
