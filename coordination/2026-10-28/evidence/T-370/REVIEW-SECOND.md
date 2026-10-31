# T-370 / W6-04-v2 修订2独立增量二审

**结论：修订2定向二审通过。旧 REPORT 的 1 项 P1、2 项必须 P2 均关闭；当前 Blocker/P1 为 0、必须 P2 为 0。** 新增 createRequire unknown 与排除清单在本轮核对范围内可接受。可交原独立数据验证线核收、由统筹决定中间点采用；W6-04 最终单头重算、W6-05、privileges、风险和全线验收仍未完成。

本线只读原 REPORT、同一脚本修订差异、真实 B/M Git 对象、分类数据、METHOD、报告与 spec 候选；没有执行测量原件、build/test/Full、GitHub 或真实 Home，没有改共享 spec/协调状态/生产文件。仅新增本报告，原二审与作者被拒数据保留。不把两次21份JSON可重复作为算法正确性证据。

## 绑定对象与范围

- B=`fccb2a3003de86af556f0030923f9e76ddf369c7`；M=`b9a9755786f3d29774bf706f1f68c3ce4bf8bfb8`，均沿原冻结输入。本次未扩大到移动 main 或最终头。
- 实际脚本 `/private/tmp/w6-04-measurement/measure.mjs`，原脚本保留于 `revision-1-original/measure.mjs`；本线直接比较二者。修订数据读取 `revision-2/run-1/{B,M}-*.json`，原数据读取 `run-1/`。`revision-2/revision-check.json` 仅作为作者核对线索，下面结论另读真实源码和逐项 JSON 得出。
- 未重做无变化的巨大单元、70 PR 选择、热点或全树 AST。检查修订影响时，units/packages/hotspots/excluded-commits 两端 JSON 与首轮均逐字相同，contracts 的 value 名成员集合也相同；这些只能支持“修订未改该部分结果”，不升级为本线独立全轮核算。

## 原 P1：运行时导出混入纯类型，关闭

`measure.mjs:255-298` 现在沿公开导出路径递归：跳过父级 `export type`、逐项 type 与 type-star；普通转出追到目标；局部转出结合固定 TS 5.9.3 的 type-only alias 语义。只有值 flag、非 type-only alias、且路径确实 runtime visible 才计 value；循环/未解路径另标 unknown。没有以已知反例直接减一来替代规则修复。

本线直接读 Git：B 的 `apps/local-host/src/index.ts:89`、M 的同文件 `:102` 都是 `export type { FeedSourceService, ... }`；两端来源 `plugins/native/feed/src/source-service.ts:9` 都是 class。修订 JSON 两端均为 `isValue=false/typeOnly=true/visibility=type-only`，不再把底层 class 的值属性当入口值导出。比较两端完整 Host 名单，唯一 value→type 的变化都是此名：value 241→240、432→431，type-only 137→138、190→191，当前 Host unknown 为 0；报告、summary、spec 候选均同步到240/431。

共同 helper 的 contracts 结果也已更新分类字段；两端 runtime value 名成员集合与首轮相同，独立声明源仍503/576。类别汇总为B class14/function155/variable334、M class3/function166/variable407。静态抽核 B 的 AttentionError class 与 M 的 ActionError class（后者经 platform/actions.ts 的普通 export-star 转出）仍属值路径，修复没有把所有 class 一刀切成类型。该抽核不表示重新独立解析了全部公开名；无 lib/第三方类型依赖的静态下界边界继续保留。

## 原必须 P2-1：SDK 自引用误作对外依赖，关闭

`measure.mjs:169` 在 sdk-out 前增加 target owner 不等于 source owner；contracts 的对外规则保留。两端逐处 cross 比较：B仅1项、M仅94项发生变化，全部是同 SDK owner 的 core 标记由 sdk-out 改为null，其它字段逐项不变；core 汇总1/94→0/0，结构引用总量7150/14379、upward8/35、pluginPeers0/0未被顺带清零。

真实 Git 原反例仍是内部路径：B `packages/plugin-sdk/src/index.ts:7` 导出自己的 `./actions.js`；M `packages/plugin-sdk/src/action-cards.ts:5` 引自己的 `./errors.js`。修订逐处数据仍保留引用本身和相同 owner，仅取消不正确的对外标签，符合原要求。

## 原必须 P2-2：root/other 分组错误，关闭

`measure.mjs:52` 使用固定集合：无斜杠的根文件→root；tests/docs/specs/scripts/skills/vendor 保留；其它非 workspace 路径→other，真实路径继续在逐文件记录中。

本线遍历两端 pr-files 的全部非空 old/newNonworkspace，按真实 path 独立计算期望分组，错误0。原64/6条根文件侧记录都归root，包括B #159 DESIGN.md、M #1666 AGENTS.md 与 #1633 package.json/pnpm-lock.yaml；其它286/81条侧记录归other，包括非workspace的.impeccable与tooling/gates，没有混入包数。owner 与样本统计未因本次分组修复改变。

## createRequire unknown 与排除清单

- 新 `loadingUnknowns` 明列工厂位置、直接绑定 loader 的调用与 eval 候选，未跟踪动态别名数据流；工厂B14/M36、直接调用5/5是本轮结果数据的数量，本线核读其实现与原反例，没有重跑全树扫描或把该数称全部动态加载次数。
- 直接读Git核到B/M web-assets 的工厂分别在11/12行；M agent-control-errors 的工厂在16行，下一行确有 `import(requireSdk.resolve(...))`。两处都在 loadingForms.createRequire 中，原漏项不再被静默当成没有。`.resolve` 并非直接 `loader(...)`，未列入5个直接调用；工厂本身已明确标“created loader not followed”，现有未知边界成立。
- 生成源识别显式NOT RUN，eval为0个静态候选，跟踪生成TS仍进入主分母；不据此证明没有生成或求值代码。
- 本线用各准确Git树的NUL分隔路径清单核对排除集合：B共5386条路径=1827主源码+3559排除；M共7781=3227+4554。排除路径无重复、全部存在于对应Git树，与主源码互斥，并集没有遗漏。声明/tests-fixtures/vendor/JS-TSX/Rust-Swift/范围外源码/other各抽读真实路径，分类符合已声明优先顺序。该清单说明主分母排除哪些文件，不证明跨语言逻辑或运行时加载已核完。

## 当前必修与采用边界

**当前必修：无。** 原REPORT保留为首轮要改结论，本文件关闭其中三项。未变旧问题与其它指标不重新展开，不新增测量需求。

报告与spec候选仍将修订2标为待原两线核收，不关闭最终W6；上升、unknown、两端窗口与因果限制保留。一个非阻塞文字建议：spec-candidate.diff首段把“脚本、原始输入”等统称留在 `revision-2/`，实际 measure.mjs、INPUTS.json、vendor在父目录，只有本轮结果在revision-2；统筹持久采用时应写准确的各自位置。材料实际存在且主报告已有正确入口，这不阻塞本次数据修复关闭。

中间点采用仍需原独立数据线结论及统筹串行选择持久位置；最终必须给一个准确完整代码头并按同方法整体重算，不能只换M列。两次输出一致、候选文件存在、作者自核和本次定向二审均不代替最终验收。

— Codex（T-370 原独立二审线，修订2定向复核）
