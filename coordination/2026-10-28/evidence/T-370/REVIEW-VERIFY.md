# T370 / W6-04-v2 修订2定向数据复核

结论：**原验证线指出的 P1/P2 已修复，修订2的冻结 B/M 中间点数据可采用；本轮没有剩余必须修正项。** 采用的是 `revision-2/run-1/` 的新数据，首轮被拒的运行时导出及 SDK core 数不继续使用。原报告及失败反例保留。本结论不是 W6-04 最终点、W6-05、privileges、风险关闭或全线验收。

复核输入仍为 B=`fccb2a3003de86af556f0030923f9e76ddf369c7`、M=`b9a9755786f3d29774bf706f1f68c3ce4bf8bfb8`。读取修订2脚本与首轮脚本差异、METHOD/REPORT、两端新输出；只从上述 Git 对象和本地证据读取，没有 build、产品测试、Host、GH、refs 或作者原件修改。独立核算脚本为本目录 `revision2-check.py`，结果为 `revision2-check.json`；真实声明源样本见 `revision2-owner-samples.json`。

## 原 P1：type/value 修正成立

`publicSymbols` 现按导出路径递归检查 runtime 可见性，跳过外层/逐项 type-only、处理局部/重导出路径，并用固定 TS5.9.3 的 type-only alias 语义补充判断；未解析可见性单列 unknown。原来的“目标是 class 就当该入口有运行时导出”的错误已消除。

从真实 Git 对象重新核读：B Host index:89、M:102 都是 `export type { FeedSourceService, ... }`；两端 feed owner `plugins/native/feed/src/source-service.ts:9` 都声明 class。这一事实恰说明目标是运行时类、但 Host 入口只输出类型。两端新记录均为 `isValue=false/typeOnly=true/aliasTypeOnly=true`。

独立逐名比较首轮与修订2 Host 记录，名字集合、origin 与其他名字的 value/type 判定没有额外变化，只有 FeedSourceService 被正确改标。Host 值/类型从首轮241/137、432/190纠正为 **240/138、431/191**，unknown均0。export-star声明仍12/8，不混为导出名数。两端已整体重算并更新摘要/报告，不是只手改一个汇总数字。

contracts 的逐 subpath value 语义记录与首轮一致；本轮独立从逐名 origin 去重得到 **503/576**，分类为 B class14/function155/variable334，M class3/function166/variable407，分类之和等于唯一origin总数。另从原对象按offset定位并核了每端各类真实声明：

- B：`index.ts:11` packageDescriptor变量、`modules/artifacts.ts:32` artifactSubjectId函数、`modules/attention-resumption.ts:109` AttentionError类。
- M：`modules/alchemist.ts:3` modulesAlchemistContract变量、`modules/artifacts.ts:45` importedDocumentFile函数、`platform/action-errors.ts:17` ActionError类。

这些是 `packages/contracts/src/` 的实际 owner 声明；分类不拿纯类型或一条多绑定const混算。此复核核对修复逻辑、实际反例、逐名变化及声明源样本，未独立重建整个 TypeChecker；保留既定“虚拟Git解析下界”的能力边界，不升级为所有条件导出或实际产品运行的证明。

## SDK self 与非 workspace 口径

SDK core 分类现明确要求目标非自身且非 contracts。独立对两轮全部 cross 行逐项比对，B的1处、M的94处 core改标都恰为 `sourceOwner=targetOwner=packages/plugin-sdk`，没有把真正跨owner引用删除；core从1/94纠正为 **0/0**。真实Git抽核 B SDK index:7导出 `./actions.js`，M action-cards:5导入 `./errors.js`，两端自己的package.json均给同一SDK包名。这些不是对其他包的依赖。upward8/35、pluginPeers0/0保持不变。

独立按每个 PR 的 old/new path 及双侧owner重算全部140个PR的非workspace分组，均符合 root/tests/docs/specs/scripts/skills/vendor/other规则，文件/包成本不变。原反例 B#159 现在为root1、other29（不再DESIGN.md/.impeccable各造类别）；M#1666为root1（AGENTS.md）。所有逐文件分组与各PR聚合一致。

## 未知项与排除表

createRequire工厂位置已逐条回原Git行核对，并与相同扫描范围的原对象词法调用清单独立比较：B14、M36吻合。直接绑定loader调用另列5/5，不声称追踪任意别名/数据流。原M反例 web-assets:12、agent-control-errors:16现均出现在未跟进工厂位置表中；B对应web-assets为:11。eval直接调用候选0/0保留为该语法范围结果；通用生成源识别明确NOT RUN，跟踪生成TS继续计入源码，没有以无法识别为理由排除。

互斥排除表独立核了全部路径：B源码1827 + 排除3559 = Git跟踪5386；M源码3227 + 排除4554 = Git跟踪7781。无重复、无与源码重叠、无遗漏，逐类count等于路径清单长度。

| 排除类 | B | M |
| --- | ---: | ---: |
| declaration | 2 | 1 |
| tests-fixtures | 817 | 1948 |
| js-tsx-production | 11 | 11 |
| rust-swift | 21 | 28 |
| vendor | 39 | 16 |
| outside-main-areas | 76 | 254 |
| other-tracked | 2593 | 2296 |

实际没有入表的build-dependency条目；不能从“没有该分组键”推断仓库之外不存在构建产物。该表只覆盖冻结Git跟踪文件，符合本方法范围。

## 复用与采用边界

两端 units/packages/hotspots/excluded-commits 与首轮逐JSON一致，首轮已独立核实的体量、巨大AST阈值、PR分母/成本与热点证据继续有效。受影响的Host导出、SDK core及非workspace/未知项必须改用修订2。数据依然如实保留规模、Host公开值、contracts origins和反向引用上升。

独立逐字节比较修订2两次输出：21/21相同；它只证明重复性。本次关闭原P1/P2依靠实际owner源码、语义修复、逐记录差异及独立核算，不以重复运行代替正确性。

可采用范围为该冻结 B/M 的 W6-04-v2 中间点测量材料及已声明局限；不签移动main、真实运行时混载为零、产品体验、冲突率或重构因果。最终结算仍需统筹给一个完整准确代码头，按同方法整体重算并独立复核，不得只替换M一列。共享spec写入和最终采用由统筹串行处理。
