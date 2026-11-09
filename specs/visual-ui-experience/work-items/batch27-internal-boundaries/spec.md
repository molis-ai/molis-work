# 第 27 批审查卡与 Goals 内部调用清理

状态：子分支已实现，待整批验证（2026-11-09，负责人为第 27 批内部清理写手）。

本片承接[第 27 批第 5 项](../../../post-anticorruption-roadmap/reference/batches/27.md#batch-27-item-5)与[审查台账 N19、N20、N21、N24](../../../../docs/reviews/adversarial-review-2026-11-01.md)。目标是交付可合入的两片内部清理，审查卡的展示与可决定条件、Goals 写入结果与拒绝保持现行行为。基点 `e45cc25b3`，认领见 [#1743](https://github.com/molis-ai/molis-work/issues/1743#issuecomment-6746979638)。

## 依赖与范围

`depends_on` 为已纳入基点的第 02 批（含 #1987）和第 07 批 #1981。两片没有产品依赖，按 Workbench、Goals 顺序由同一写手提交。允许路径为本 spec、[审查卡渲染器](../../../../apps/workbench/src/agent-review-surface.ts)、Goals 的[状态](../../../../plugins/native/goals/src/module/event-state.ts)和[状态效果](../../../../plugins/native/goals/src/module/event-state-effects.ts)，以及后者的[内聚单元尺寸登记](../../../../tooling/gates/giant-exceptions/plugins/native/goals/src/module/event-state-effects.ts.json)。

**审查卡。** [Host 的 GET](../../../../apps/local-host/src/agent-review-http.ts)刷新并读取审查行，将文档交给 Workbench。Prologue effect resource 经 JSON 读取，写后检查的 note 还可来自 session index，重启和 Git 暂存审查也可从已存记录恢复。因此保留 `readable` 的全部判定。渲染一行时只判定一次，将结果用于命令标题、正文和决定按钮。可读文档沿原绘制分支，残缺文档仍显示原提示且没有批准按钮。保留独立的 `isDecidable(row)` 公开入口及其待审判定。原文档的顶层可读性检查从待审命令三次、已结算命令两次、其他待审卡两次收为一次。Git 整合内部复用原暂存区文档字段规则。局部结果仅用于这一行的同步渲染。

**Goals。** `goals.concerns.apply@1` 和 `goals.agreement.set@1` 仍从原命令入口经 `GoalEventApplication`、`GoalEventFacts.state` 到 `GoalEventState`。State 在原构造器中先初始化 `writes`，以一份局部 `core` 和同一组仓库装配 Effects、Concern、Agreement。State 将顾虑和约定直接交给对应部件，删除 Effects 的两处转发。Concern 仍通过 Effects 的实例核对决定能否复用。命令保持输入、结果、错误和事务边界。Effects 的既有内聚单元登记按门禁实测更新，`recordTrustedDecision` 的独立登记沿用当前值，State 按现行阈值核对。

在途 #1999 固定头 `f25c375149`、#2000 固定头 `d918375958` 与本片三个生产文件及尺寸登记无同文件改动。#1999 的 D0193 决定 JOIN 和项目隔离用例由整批集成保留。#2000 的目录、关闭及装配继续由其 owner 处理。

## 开工前检查

| 项 | 核对 |
| --- | --- |
| 1 事实主人 | 审查原件与回执归 Host 的审查队列及执行 owner，Workbench 只绘制。Goals 仍拥有顾虑、约定、决定的作用范围与回执，Governance 仍拥有可信决定记录。 |
| 2 插件同等待遇 | 不涉及装配。Goals 沿现行 Plugin Runtime 与公共动作调用。 |
| 3 能力注册 | 沿用单次声明、可信调用上下文和原调度。HTTP、动作目录和 MCP 进入同一命令路径。 |
| 4 合同 | Workbench 的包根出口、Goals 的六个出口及公开工厂返回原样；核对有效可达声明和既有快照。若发现公开面差异交公共 C 裁定。 |
| 5 包与分层 | 审查可读性仍在 Workbench 的渲染边界，Goals 的部件组合留在包内 State；沿原依赖方向。 |
| 6 表与存储 | 沿同一仓库、事务及幂等回执。表、SQL 和升级链不涉及。 |
| 7 兼容与迁移 | 不涉及。恢复仍读取现行记录格式；检查保留原有拒绝。 |
| 8 安全边界 | 不涉及边界变化。保留不可信文档检查、Host 的项目与审查版本授权、Goals 的取消检查、`beforeEffect` 与决定范围校验。 |
| 9 调用次数 | 同一次渲染减少对文档的顶层检查；两个 Goals 命令各少一次包内转发。请求、发现、授权核对、开库、事务和持久写的次数沿用原路径。 |
| 10 升级与数据 | 不涉及格式变化。既存审查、Goals 事实及保存的动作引用沿原入口读取。 |
| 11 成果与过程项 | 不涉及。原有成果与过程项声明和读写路径照旧。 |
| 12 页面、外壳与文字 | 比对原 HTML、顺序与转义。样式、事件、文字和静态资源引用沿现行渲染，无新交互需定样。 |
| 13 错误 | 保留原可读性提示与 Goals 业务错误。 |
| 14 冲突面 | 仅改允许路径，无聚合入口或快照改动。现有独立尺寸登记随本片更新；阈值、门禁脚本和 CI 照旧。 |
| 15 全局最优 | 插件沿用原 Goals 动作，第三方作者无额外工作；平台在同一行重用检查结果，避免将可读性信任上移到不能保证完整形状的持久来源；助理与 MCP 仍使用原动作与授权；资料、目录、成果、工作流程与同步沿原合同。两处纯转发删在内部装配，后续公共 C 仍能独立裁定门面，06 和 46 各接原有范围。 |

## 验收标准

1. **BIB-01** [人工] 查生产调用，`renderRow` 对原文档求一次 `readable`，并用同一结果选择标题、正文、决定按钮。以合法和残缺的文档覆盖各类现有卡、状态与混排，逐字节比较两版 HTML，独立入口的可决定结果相同。
2. **BIB-02** [人工] 核对 Goals 顾虑和约定各减少一跳，组件实例数、仓库、同步调用和原事务路径一致。两条命令的原鉴权、取消、幂等和版本拒绝从同一入口进入。
3. **BIB-03** [人工] 基点与候选比较 Workbench 与 Goals 所有包入口的有效可达声明，含 `createGoalsApplication().goalEvents`、`GoalsModule.events.state` 与只读门面，成员、参数和返回类型等价。已有 API 与动作快照无差异。
4. **BIB-04** [人工] 整体构建、以 `origin/main` 为对照的健康门禁和 diff 检查通过。Goals State 位于现行阈值内，Effects 的尺寸登记与门禁实测相符。

## 验证与交接

子分支先离线安装，在公共 build 槽中运行整体 `pnpm build`，再做基点对照探针、`node scripts/check-health-gates.mjs --base origin/main` 和 `git diff --check`。已有行为用例覆盖本片路径；如有实际需要新增或调整的用例，在公共 browser 槽用 `node scripts/run-tests.mjs --jobs 1 <具体文件>` 单独验证。

整批最终头保留原有回归。[审查卡 PA-29 等](../../../../tests/agent-review-surface.test.ts)验证坏 note 及残缺预览的拒绝、合法 note 的转义和各阶段按钮，[审查 HTTP](../../../../tests/agent-review-http.test.ts)、[写后检查](../../../../tests/coding-diagnose-after-write.test.ts)、[Checker 拒绝](../../../../tests/security-invariants-checkers.test.ts)验证 Host 投影、重放、越权及撤权。[Goal HTTP](../../../../tests/goal-event-http.test.ts)、[MCP 状态](../../../../tests/mcp-goal-events-state.test.ts)、[状态命令](../../../../tests/goal-events-state.test.ts)和[合同归属](../../../../tests/goals-contract-ownership.test.ts)验证公开写入、读回、幂等、拒绝与门面。两包 README 的必跑用例、边界、页面资源、批次评审及 CI Full 随整批进行。

## 子分支证据

- BIB-01 的静态对照确认每行一次顶层检查，`readable`、`isDecidable`、阶段计算和按钮渲染的实现相同。直接调用两版渲染器，240 个合法或残缺的单行样本、混排及空态的 HTML 和转义调用顺序相同。坏写后 note 与残缺回退预览显示原提示且没有批准按钮。
- BIB-02 逐项核对了构造器中的原 `core` 回调、仓库引用和调用接收者。除两处转发的移除和改接外，State 与 Effects 的其余方法逐字相同。写入和拒绝的真实入口回归留给整批。
- BIB-03 用 TypeScript 重发基点声明，与候选构建产物对照。两个包内类的声明有变化，Workbench 的两个和 Goals 的六个包入口均无法到达这些声明。公开工厂 `goalEvents`、`GoalEventStateApi` 和只读 `Pick` 的成员签名一致。API 和动作快照相同。
- BIB-04 的整体离线构建通过。默认宿主沙箱拒绝 SwiftPM 建立子沙箱，提升权限后以同一命令完成 65 个包与根构建，使用临时签名。State 为 288 行、19 个方法，低于 300 行、25 个方法的阈值。Effects 从 515 行、11 个方法减到 497 行、9 个方法，`recordTrustedDecision` 仍为 152 行。健康门禁对照 `origin/main` 的合并基点 `54a12642c` 通过。

本片沿用现有回归文件。上述探针使用候选构建和基点源码，属于工程对照；隔离 Home 实操及整批运行证据由统筹在最终头补齐。命令、日志和探针交接目录为 `/private/tmp/molis-b27-internal-boundaries.Tz7TqtZ5`。

## 剩余边界

Kernel 的 `whole-units` 转发等待 K3 白名单决定。Goals 外层 `GoalEventApplication`、Projects/Catalog、Memory、Shelf、Functions 的公开门面及 BL-819/821 等公共 C 和对应 owner。Assistant 的外来数据解析由其原片接续。Files 归 06，生成插件旧读取归 46。以上不计为本片完成项。
