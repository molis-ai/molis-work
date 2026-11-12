# 第 27 批炼金术士与宿主私有声明清理

状态：本片已实现，待第 27 批统一回归（2026-11-09；负责人为 Codex 第 27 批写手）。

本片承接[第 27 批第 5 项](../../../post-anticorruption-roadmap/reference/batches/27.md#batch-27-item-5)与[审查台账 N18](../../../../docs/reviews/adversarial-review-2026-11-01.md)。目标是交回可合入的内部清理，移除未被调用的校验声明和一份重复的扩展名集合。用户仍从现有动作和材料入口使用功能。本片是 N18 的私有声明部分。基点为 `2db8566fe`，认领记录为 #1743 的评论 `6743661274`。

## 候选与处置

基点逐项核得 13 个 Zod 声明和 1 个宿主集合。只改下表列出的 9 个源码文件及本规格。炼金术士文件都在 `plugins/native/alchemist/src/studio/shared/contracts/`。

| 文件 | 删除 | 保留依据 |
| --- | --- | --- |
| `annotation.ts` | `annotationParamsSchema` | 创建和列表使用 `createAnnotationSchema`、`listAnnotationsQuerySchema`，目标验证由 `annotationTargetSchema` 提供。 |
| `decision.ts` | `decisionParamsSchema` | 决策动作使用 `createDecisionRequestSchema`，工作区类型仍由 `decision-workspace.ts` 消费。 |
| `direction.ts` | `directionIdParamsSchema` | 创建和更新使用 `createDirectionInputSchema`，动作处理器调用 `deriveDirectionTitle`。 |
| `idea.ts` | `ideaCardParamsSchema`、`ideaVersionParamsSchema` 及仅两者使用的 `z` 导入 | 保留简报和卡片 DTO，继续供 `idea-card-actions.ts` 使用。 |
| `job.ts` | `jobEventsParamsSchema`、`jobEventsQuerySchema` 及仅两者使用的 `z` 导入 | 保留 `JobEventDto`。现行任务事件动作使用 `actions.ts` 中的游标输入。 |
| `memory.ts` | `memoryRuleParamsSchema` | 动作和业务服务继续使用创建研究方法和偏好规则的校验。 |
| `pulse.ts` | `updatePulseSourceRequestSchema`、`opportunityParamsSchema` | 启动使用 `startPulseRunRequestSchema`，来源枚举经 `pulseSourceParamsSchema.shape.sourceId` 用于动作输入输出。 |
| `research.ts` | `lensParamsSchema`、`startLensRunRequestSchema`、`ideaResearchParamsSchema` | 研究动作、任务和同步继续使用计划、证据、观点和报告校验。`lensCompatibilityKeySchema` 仍使用 `lensKinds`。 |
| `apps/local-host/src/material-native.ts` | `materialImageExtensions` | 格式判断由 SDK 的 `supportsMaterialExtension` 提供。媒体分派和 Home 模型目录仍依赖 `materialMediaExtensions`。原生进程结果仍经 `validateNativeResult` 和容量检查。 |

两个包均为私有 workspace 包。炼金术士包的 `exports` 只列 `.` 和 `./registration`，入口只从该目录转出已登记动作及其权限。宿主的 `exports` 只列 `.`，其入口及转出链均未转出材料集合。核对具名导入和类型引用、模块路径的导入与转出、命名空间、动态加载、登记、生成脚本、测试、活文档和 Skill。构建的炼金术士工作室脚本只清退旧前端产物。当前除声明之外的命中是[旧审查](../../../../docs/reviews/cleanup-audit-2026-10-20.md)和[归档盘点](../../../archive/repository-cleanup/inventory.md)，没有消费者指引。

已核本地及远端跟踪的 532 个 refs，加上现有工作树，共 493 个去重后的分支头。炼金术士声明在这些快照中均无代码引用。材料集合在 10 个旧远端头的 `material-extraction.ts` 仍有引用，均继承自与 `origin/main` 的分叉点。`74f39a47c`（#727）已把现行提取器的格式检查改为调用 SDK。统筹已核对开放 PR 与目标文件无冲突。保留候选或收紧其导出仍会留下未用初始化，因此沿用现行检查路径并删除闲置声明。

Feed 的两个 projection 函数和 Web Query、YouTube 的工厂有公开包出口。共享 contracts 常量、创作台第 46 批清理和炼金术士整体重做另有归属。归档盘点曾把炼金术士候选暂留到整体处理，本片按 N18 仅清理无消费者的私有值。[BL-377](../../../backlog/BL-377.md)继续保留炼金术士现行装配例外及原有两个库。保留活跃动作、模块类型和外部输入检查。

## 开工前检查

| 项 | 判定 |
| --- | --- |
| 1 事实主人 | 继续由炼金术士拥有工作室事实、宿主拥有本机提取执行，材料格式沿用 SDK 的共享规则。 |
| 2 插件同等待遇 | 不涉及新能力或装配。BL-377 继续承接原构建期例外。 |
| 3 能力注册 | 不涉及。现有动作声明、路由、身份、受众和调度完整保留。 |
| 4 合同 | 候选均为私有模块声明。公开包出口、动作 schema、HTTP 和 MCP 合同沿用现行定义。 |
| 5 包与分层 | 清理在现有的炼金术士内部校验模块与宿主原生材料模块进行，依赖沿用。 |
| 6 表与存储 | 不涉及。两个工作室库、提取器输入输出和文件写入流程沿用。 |
| 7 兼容与迁移 | 不涉及。没有新增版本或读取形式。 |
| 8 安全边界 | 不涉及边界改动。现用校验、`beforeEffect`、取消和原生返回检查保留。 |
| 9 调用次数 | 不涉及调用链改动。保留相同的请求、目录发现、授权和开库路径。 |
| 10 升级与数据 | 不涉及持久格式、设置和已存引用。 |
| 11 成果与过程项 | 不涉及。成果及过程项沿用原有声明和读写。 |
| 12 页面、外壳与文字 | 不涉及用户界面、DOM 事件、页面文案与资源。 |
| 13 错误 | 不涉及。原生进程的解析和拒绝沿用现行错误码和转换。 |
| 14 冲突面 | 仅写上表文件与本规格，无共享枢纽。由本片写手交回第 27 批统筹。 |
| 15 全局最优 | 插件方面沿用已消费的校验，第三方作者无额外步骤。平台方面复用 #727 已接好的 SDK 格式判定，保留 Host 执行边界。助理与平台能力继续用原动作、MCP、工作流和材料服务。后续由 BL-377 与第 46 批各自处理原有范围。私有删除比保留闲置声明或搬到另一层更直接。 |

## 验收

1. **BPU-01** [人工] 逐个核对候选的符号、模块路径、包入口、分支头及文档引用。差异只删除表中声明和两个专用导入。历史消费者由分叉点与现行调用链解释。
2. **BPU-02** [人工] 在构建槽运行 `pnpm build`。检查真实产出的 JS 和声明文件，确认候选被删除，相邻的动作校验、类型、包入口与材料分派和原生输出校验仍接在现行路径上。对照差异复核边界。
3. **BPU-03** [人工] 在构建槽运行 `node scripts/check-health-gates.mjs --base origin/main`，并通过 `git diff --check`。本片以编译、产物和现行调用链验证，既有业务用例由统筹在整批分支上统一执行。

整批回归参考[炼金术士开发要求](../../../../plugins/native/alchemist/README.md#开发要求)及[宿主材料提取回归](../../../../apps/local-host/README.md#公共材料提取)。重点覆盖炼金术士的动作／任务流程与材料提取的真实入口、取消和错误返回。本片是工程验证，无界面或本人验收项。

## 本片证据

- BPU-01。9 个源码文件共减 39 行。逐文件对照语法树，除表中 14 项和两个专用导入之外，保留的语句与基点逐项相同。源码、测试、脚本和 Skill 已无候选名。
- BPU-02。Node 24.15.0 下完整 `pnpm build` 成功，构建 65 个包及 macOS 原生助手。首次运行在 SwiftPM 创建系统沙箱时报权限错误，获得构建权限后使用固定版本的本地依赖缓存完成重跑。逐个比对输出的 `.js` 和 `.d.ts`，确认候选消失，登记和包入口沿用基点，动作仍引用有效的校验，材料入口仍经 SDK 格式判定、媒体分派和原生返回校验。
- BPU-03。健康门禁对 `origin/main` 的合并基点 `54a12642` 通过，`git diff --check` 通过。既有业务回归随第 27 批统一执行。
