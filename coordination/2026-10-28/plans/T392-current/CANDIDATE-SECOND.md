# T392 加强二审：源码候选审查

状态：候选静态审查完成，**HOLD，不终签**。加强二审线1；作者开发4、独立动态验证3，归属保持。本轮未运行 build/test/browser/门禁，未修改源码、规则、refs、GH 或共享协调账；仅写此审查报告。

输入：accepted WO `coordination/2026-10-28/tasks/T-392.md`、已核 SECOND-PLAN `/private/tmp/t392-second/PLAN.md`、作者 `/private/tmp/t392-evidence/REPORT.md` 及两份冻结 HANDOFF。

- M `08642dcb92dbdad029d990813da56682d6864a23`
- H `b88f7115c8f609079592402330f4bbaa219ae9c7`
- tree `ba6ca4519a201b194c73e0182659948424b43cb1`
- 树 `/private/tmp/t392-dev`。开始读取时 clean；后续观察到根串行应用的22份文档/README/Skill未提交修改。源码评审使用 M/H Git 对象，**不把后到工作树修改并入本次签字**。H不是最终头。

## 必须处理：P1，目录迁移使 functions 动作引用退出原检查范围

定位：H `scripts/gates/doc-citations.mjs:103`、`:122`、`:166`；触发变化是 `modules/functions/` 全部迁到 `modules/judgment-rules/`。门禁源码本身在 M→H 没变。

实读调用链：`ownerDirectories(snapshot.files)` 只取 plugins/native、modules、horizontal 下的物理目录名；`brokenCitations` 在第166行先按该集合过滤 id 前缀，之后才调用 `producible`。独立比较 M/H tracked 路径：M 有 functions、无 judgment-rules；H 无 functions、有 judgment-rules。因此 H 对 `functions.*`（含相应 MCP action 名）直接跳过，源码仍声明完整 `functions.evaluate` 也不能补救这一步。`idUniverse` 的 byOwner 同样在第103行按目录归属，恢复范围时不能漏掉它。

当前受影响正文：`skills/molis-plugin-dev/elements.md:43,45` 与 `examples.md:27` 的 `functions.evaluate`；elements 第45行故意反例 `functions.evaluate.v1`。这里只证明这些引用不再进入原检查，并不宣称正常引用当前已经拼错。后续此命名空间的拼写错误或移除动作也会被忽略；原模板匹配盲点仍是原有边界，不能宣称此前检查无遗漏。

作者 `shared-unused-citation-exception.patch` 删除该反例例外，会消掉“未消费例外”报错，但**不会恢复原覆盖**。这是检查范围退化，不是无害的数据清理；本轮不建议收此补丁。恢复 functions 范围后，这个仍在正文中的反例例外应继续保留。

### 现有数据名单能否解决

结论：**当前实现没有纯数据修改入口，不能在保持门禁代码不变的前提下做到。** 该门禁读取的例外 JSON 只接受文件→token→理由，用来豁免已报告问题；root allow-list 只控制路径识别。两者都不能给 ownerDirectories 或 byOwner 增加稳定前缀映射。已有 workspace registry 保留 `modules/judgment-rules` 与 `contracts/modules/functions` 的关系，error-owners 也保留 functions→新路径，但 doc-citations 未读取它们。

不能把 error owner 全表直接当作动作命名空间：二者语义不同，会改变本单之外的检查范围。也不能保留一个空的旧 modules/functions 路径骗目录推断、改公开动作名、删正文反例或把允许列表中的 id 当作“源码已定义”。

交根的最小决定：是否授权一项窄门禁修正，仅将这个已迁移目录在**目录前缀集合与 byOwner 归属**中映射回稳定 functions，继续沿原 literal/template/rejection 规则检查。原函数级匹配、文件排除、例外消费规则不放宽，不顺带推导其它模块的命名空间；精确保持这次迁移前的范围时，应替换物理 judgment-rules 前缀身份，而非把它和 functions 双加为新范围。映射的数据来源可沿已有 registry 事实设计，但当前没有“只改既有名单即可”的实现可签。该调整涉及门禁代码，超出本 WO 仅定位/名单迁移的窗口，须由根按现有授权边界裁定，本线不写。

授权后交验证3的最小证明：同一旧/新目录夹具中，合法 functions id结果相同；一个无源码 literal/template 可匹配的错误 functions id仍拒绝；owner-relative literal 的 functions 归属保持；现有故意反例例外仍消费、移除正文后仍报 stale；不相关原未知前缀范围不变。可在现有 `tests/doc-reference-gates.test.ts` 补齐，不新造测试体系。本线没有执行这些探针，也没有以“绿”为目标删除拒绝条件。

## 已完成的实际 diff / 合同核对

逐文件比较 M/H 114个差异项：先按限定实现路径/私有包名称归一化，再检查全部13个剩余差异项；101个与预期机械替换相等。归一化仅为审查辅助手段，残差中的持久 owner、CSS类及测试业务值保留均按原始差异复核，没有将它们当作需要替换的内容。

- Git 37个 rename 与作者路径图一致，模块17份 src 均为原文移动；Workbench/Host 只有必要导入、源码位置说明等变化，没有发现额外业务实现改写或兼容入口。
- 根/Host私有依赖、模块 package、registry implementation path/extra dependency 与 lock 一致；lock准确5对替换，无依赖版本或 optional dependency变化。公开合同路径继续 functions。
- contracts、plugin-sdk、API/actions snapshot 路径 M→H 零差异。Home snapshot owner仍为 `modules/functions`；R2在实际 manifest 独立按字面量 path `functions` 找store，先断言存在再断言字面量owner。原真实库内容和完整性断言未删。不声称 Functions sealed 恢复。
- 32份移动源码旧/新 error owner：独立按生产匹配规则和两边 JSON 静态核对，22份仍为 functions、10份Workbench源码仍无归属，0变化；与作者逐项原件一致。error-owner key和contracts路径不变，只改三处实现定位及说明。
- translations仅改字典路径、相应目录定位与说明；FUNCTIONS_EN、词条和匹配规则不变。测试仅同步路径期望、增加验收注释及R2断言，未发现放宽/删除业务断言。
- H仍有明确待根README/活引用/共享表差量，不能将机械源码完成视为 RAC-2847 完成。

## 冻结边界与证据层级

实核 H blobs：T121 index `2cf494d71ccdb214716df92572c0a803e51c590c`、connector-consumer-usages `677a24c26ea9b0f34ca638a52e28b32f61ffd6b7`；T144 i18n/en `9643a748904286da5006961e07a9377f7a0cf1f0`，与 HANDOFF 一致。分别仅2条export路径＋1条private import，以及FUNCTIONS_EN单行路径。未合T121/T144增量不在本候选；不签组合语义。#1101控制链继续按SECOND-PLAN旧→新路径交根与原owner，未采用的ProjectDeletionControl未引入本片。

作者报告24文件218通过、API/actions/assets等通过，仅作为动态验证3接收索引，本轮未重跑、也未把摘要转签为独立动态结果。保留其提交前等价源码构建/测试输入与H固化的区别；package-owners未运行、boundary/health失败、Full/CI待根的原状态不改变。

RAC-2843/2844/2845/2846：本轮完成适用源码/合同审查，运行结论待验证3和最终输入核对；RAC-2847：HOLD，除共享文档收齐外必须处理上述覆盖退化。最终H、准确动态证据、full=true的根CI/Full与采用均未签署。根若只补文档且无源码变化，不要求机械重跑已有有效业务证据；任何门禁修正按实际差量补验证并再审。
