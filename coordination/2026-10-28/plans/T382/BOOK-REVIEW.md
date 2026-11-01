# BL926 候选书独立审查

**结论：范围与路径方案成立；补齐下述一项必修后可派执行，无需等待 T116 整单合入。** 本审以 B=`3fd857792a27352030ac8f3544a3b57d418febc1` 的 Git 对象核对，仅写本报告，未运行 build/test、修改产品或操作 GH。任务号、验收号由根后续登记，不在此占号。

唯一当前必修：把“两处双断言触发后再报”改成书内确定的最小类型方案，并同步“整份原样移动/字节相同”的验收表述。B 的旧文件 :136–137 确有两处 `as unknown as`；不能把它们原样带入新文件后借 baseline 或 rename 识别放行。实际 lint 的 `grew` 接收 rename 映射，这也不能作为本单豁免理由。

建议的局部方案：从现有公开模块入口增加 `type ArtifactImportResult`，仅把这两个调用分别改成：

```ts
context.actions.invoke<unknown, ArtifactImportResult>(artifactsActions.importFile, input, undefined, transport)
context.actions.invoke<unknown, ArtifactImportResult>(artifactsActions.importExternal, input, undefined, transport)
```

依据：`readArtifactImportBody` 只保证 JSON 对象，返回 `Record<string, unknown>`；完整输入原本就由动作网关校验。`BoundActionClient.invoke<Input, Output>` 接受 `ActionDefinition<Input, Output>`，其可选 `__types__` 仅携带 input/output；现有两动作输出同为已公开导出的 `ArtifactImportResult`。显式 `unknown` 准确表达校验前的 HTTP 输入，原动作、同一个 input 对象、参数顺序、错误与校验顺序全部保留，类型参数运行时擦除。不增加 parser、字段重组、预校验、helper、断言或兼容分支。此建议基于签名只读核对，尚未经编译；writer 按既定整体 build 核实，若出现实际类型错误，只提交诊断和局部修订，不扩改动作合同。移动内容的允许差异限这一类型 import 与两处泛型/去断言，其余逐字比较。

其余书面边界可采用：

- T147 开头裁定(b)与 B 的 BACKLOG BL926 明确承接此次改名及门禁路径调整；`artifact-library-http.ts` 仍落 `artifacts` owner 的 `apps/local-host/src/artifact-*`，无需改 owner 表、URL、函数/导出或接口。三条生产引用、三个路径测试、词典来源注释与边界读取点均已列入书。
- assembly 只删 artifact 名单项和当前过时说明；两个批准构建例外、目录/磁盘双向核对、新 native 路由拒绝，以及 RAC2746–48 的通用平台例外出处循环均保留。artifact 退出后该循环暂时没有平台项是预期结果，不据此删循环。执行负例应核到具体断言：未批准路由拒绝；临时非插件平台项无 BL 或引用不存在的 BL 时，分别由通用出处断言拒绝，而非仅凭别的名单断言失败计绿。无需新生产机制或新永久例外。
- 边界脚本只换现行读取路径，继续核 `createLocalArtifactHttp` 与禁止 desktop import；`src/web/artifact-native-plugin-http.ts` 存在即拒绝的独立墓碑原样保留。S55 的现行完整回归在 `artifact-document-import.test.ts:552`，实际断言请求头命名文件、body path 和非法 digest 被拒绝，不只是文件存在；书已列完整文件。
- 旧名分类覆盖全部 Git 命中即可：当前实现引用换路径；过程表/历史证据保留旧路径并按需注当前位置；archive、旧 src/web 迁移记录和墓碑保留。不要为清零搜索结果重写历史。baseline 仅由现行命令更新下降快查，不用于移植旧计数。
- `locks.json` 确为22条 PR 文件快照。T116 的 gate/index/web-goals-read/export 测试是具体 hunk 交接；根在 writer 开工时刷新实际 base/owner，串行处理共享文件即可，不构成所有工作的父依赖。冻结 B 只是本次书审输入，不替代执行时的新基点。

原件：[候选书](/private/tmp/bl926-next/BOOK.md)、[引用命中](/private/tmp/bl926-next/REFERENCES.txt)、[文件交集](/private/tmp/bl926-next/locks.json)、[已接受 T147](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-147.md)。其余未发现当前必须扩范围处理的问题。
