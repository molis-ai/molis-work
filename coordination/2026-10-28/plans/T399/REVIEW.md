# T399 合成输入有限书审｜负责人：二审线5

**结论：按根已明确的 UI-1 文件映射更正后通过；无新增 Blocker/P1 或产品设计项。** 原 PLAN.md 的该处映射须写回唯一执行书，不能用 agent-studio 的通过结算新增 UI-1。

绑定核对：父 `b685fc0d81231a193d8dc2b6e4cee481ebc199b5`、T145 `afcc3de4720f13839e387632dd3b9966309d79c0`、T397 `e4e05dc5f96275aa4a396e38d1682f1286393021`。T397 最后相对 a3b55dea2 确实仅 permission-switch 测试的跨平台浏览器路径修复，无生产变动。T149 的 HANDOFF 已推进到 `05efabd4bc0e3aabeb7a2d7b9356c5a03a73068b` 前缀，但仍 IN PROGRESS；不能用 PLAN 的 25f4 或新的前缀替代最终冻结 H/tree 和完整验收。

**顺序与真实 hunk。** 从已审父普通合 T145 → T149 最终完整头 → T397 可保留依赖方向；T145 的两个 merge-base 已实际核到，不能任选其中一个把父片差量当新实现。现有表覆盖 Home 身份/项目 reach、SDK 唯一 owner 与三份权限、安装/卸载保留、页面同意与安装目标的关键相接处。另核到 Runtime index 的共享文件：T145 只加 readProjectReachSubject 导出，T397 只加 Home schema 导出，hunk 不重叠，普通合并保并集即可，无需新增机制或验证矩阵。T149 SDK owner 已被 T397 消费，保最终 owner 的双方语义，不重复拣选或整文件回盖。S107 编号及最终 descriptor 生成快照的处理方向成立。

**必须落实的验收映射更正。** 新增真实发布/下载/导入路径在 T149 当前 `tests/agent-built-plugins-workflow.test.ts:1159`：`SCOPE-1 UI-1 Home checks use the actual target, then physical signed download/import/pin reaches a working Home plugin`。已读实际用例：点击 publish、物理下载签名包、真实文件导入、检查 Home 安装目标、pin、运行并重载读回。它是 **Darwin-only**，须在最终组合中保留该完整 workflow 文件的有效执行；focused 片段或 Linux skip 不能代签。`agent-studio.e2e.test.ts` 是既有 publish→项目安装路径，不替 UI-1；无额外实际重叠时沿用旧证据，不机械重跑。`home-package-project-reach.e2e.test.ts` 继续承担真实项目同意、File 升级、工作台项目传播与撤回，不能代替下载路径。T149 当前 publishing 18/18、external 1/1、其它八文件、replay/smoke 不等于 scope UI 已完成。

**保留已列的必要补验。** T397 S-84 两个 preview caller 最后改读 descriptor @5，源码仍保 @3/@4 拒绝；其完整 `security-invariants-plugin-install.test.ts` 尚未在该末次输入后重跑，PLAN 要求在最终组合补整文件是必要项，不能以旧真签矩阵抵掉。其余按真实解冲影响使用 PLAN 的完整权限 HTTP、trust view、project-reach 文件，和上面的完整 workflow 文件组成一次必要批次；一次 matching build/共享快照/门禁/准确 Full，未变旧矩阵沿用。

T149 继续 WAIT，T398 的 T397 **实际采用**前置不解除。本线只审输入计划、对应 Git hunk 和相关验收用例定位，仅写本页；无源码/refs/协调文件/GH/build/test 操作。
