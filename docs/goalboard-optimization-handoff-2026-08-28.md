# Molis Work 优化交接（2026-08-28）

## 交接结论

本轮不再使用 Molis Work 推进 Molis Work 自身优化。已经满足的 7 个 Goal 已从原脏工作树中拆成 7 个顺序提交，并已随集成提交 `140d25e` 快进到远端 `main`。最后一条“安全并行 Runtime 建议”Candidate 的代码修复位于分支 `codex/proactive-safe-parallel-runtime-choice`，与本文更新放在同一个独立提交中。后续仍以 Git 提交、代码评审和测试结果推进，不再把 Molis Work 账本状态当作执行入口。

本轮没有安装或发布，也没有清理原工作树中尚未完成的改动。最后一条 Candidate 修复是否已推送或合并，以 Git 远端和 PR 记录为准。

## 已修好的 Goal 与对应提交

下面的提交按实际提交顺序排列。建议按此顺序评审或 cherry-pick；它们是顺序构建并验证的，不应假定可以任意乱序摘取。

| Goal ID | 已解决的问题 | Commit | 工程验证边界 |
| --- | --- | --- | --- |
| `runtime-lease-contract-discoverable` | Runtime 在写入前可以读取动态租约限制，避免调用方只能靠失败猜参数。 | `1feac8d fix(runtime): expose dynamic lease contract` | 精确暂存快照中，动态 MCP 契约测试和 2 个 v1 租约测试通过（3/3）。 |
| `owned-web-service-readiness` | 受管 Web 服务只有在本次实例真正启动、健康且归属匹配后才报告成功。 | `39955d6 fix(web): verify owned service readiness` | TypeScript 编译通过；service 测试 21/21，通过 Web health、安装启动器和卸载定向测试。 |
| `runtime-upgrade-stale-session-recovery` | 升级后遇到旧 Session/旧 catalog reader 时给出可恢复路径，不把用户留在不可读账本状态。 | `d88dd68 fix(runtime): recover from stale catalog readers` | TypeScript 编译通过；project catalog 17/17、MCP 22/22。 |
| `bound-runtime-web-deep-link` | 已绑定 Runtime 打开 Web 时返回当前项目或 Goal 的深链，而不是只回首页。 | `f91d71c fix(runtime): return bound Web deep links` | TypeScript 编译通过；2 个深链定向 MCP 测试通过。该暂存快照的完整 MCP 并发运行出现 8 个临时数据库打开失败，因此这里只主张定向工程验证。 |
| `finite-goal-recurring-operation-semantics` | 把有限 Goal 与持续运营循环分开；持续循环产出 Evidence，真实的新问题才进入 Candidate。 | `cb1d853 fix(planning): keep recurring work outside finite Goals` | TypeScript 编译通过；MCP 定向 1/1、planning 9/9、Web 定向 1/1。 |
| `existing-candidate-unified-promotion` | 已有 pending Candidate 可在一份 Goal Tree Proposal 中修订并原子晋升，含并发冲突、关系落盘和严格启动期对账。 | `4b123e8 fix(planning): promote existing candidates atomically` | TypeScript 编译通过；v1 定向 4/4、MCP 定向 1/1（单并发）、Web 定向 1/1。 |
| `review-needs-changes-reopens-execution` | `needs_changes` 会退回 executor；新执行 Run 完成后才重开 Review，旧轮次 pass 不会跨返工复用。 | `6435a74 fix(review): reopen execution after needs changes` | 精确暂存快照中 TypeScript 编译通过，2 个定向状态机测试通过。 |

以上结论是工程验证，不等于最终 App 产品实操或用户验收。特别是升级后的真实旧 Session 恢复、最终安装产物中的 Web 打开体验，仍未重新做端到端真人验收。

## 仍未晋升成功的 Candidate

以下 3 条在本轮只读核对时仍为 `pending`。本交接没有替用户批准、拒绝或删除它们。

| Candidate ID | 拟议 Goal ID | 标题 | 当前边界 |
| --- | --- | --- | --- |
| `candidate-a7bfb094-78e2-4f0a-83e7-2a714c2e5e0e` | `candidate-existing-promotion-regression-20260828` | 恢复现有 Candidate 的统一提案晋升能力 | 对应能力已经由 `4b123e8` 修复，但原 Candidate 仍是 pending；后续应人工决定如何关闭或对账，不能用代码完成替代账本决定。 |
| `candidate-a61d322a-6274-4101-9021-e3f3d2af0d7d` | `review-needs-changes-routing-regression-20260828` | 修复 0.1.2 中 needs_changes 返工路由回退 | 对应能力已经由 `6435a74` 修复；原晋升提案仍 pending，并曾出现 `candidate_exists` 冲突。后续应先核对正式 Goal 与 Candidate 的唯一对应关系，再由用户处理账本状态。 |
| `candidate-2a9a60f8-db28-4806-bc58-1258611d131e` | `proactive-safe-parallel-runtime-choice` | 在多个 Goal 可安全并行时主动提出执行与 Runtime 分配方案 | 对应能力已由分支 `codex/proactive-safe-parallel-runtime-choice` 的独立修复覆盖：Available 只在 executor Goal 都有 confirmed Impact 且两两兼容时返回只读分配建议；它不会自动启动 Runtime 或 Claim。原 Candidate 仍是 pending，后续账本决定仍归用户。 |

## 仍留在工作树、未作为完成项提交的改动

在 7 个修复提交之后，工作树仍有 23 个已跟踪文件发生修改，并有未跟踪目录 `src/evidence/`；这些改动约为 1803 行新增、194 行删除。它们被有意保留，未混入已完成 Goal 的提交。

可辨认的未完成工作簇包括：

- Evidence 不可变更正、有效记录判断与 locator 只读预检；
- accepted/frontier Goal 的澄清启动与恢复；
- Risk 更新的生命周期值校验和完成阻塞解除；
- 自然语言操作授权，不要求用户复制固定确认短语；
- 只在有具体价值时提供一次可视化建议；
- Web 首次打开时的一轮“临时运行 / 登录常驻”选择及授权边界；
- 已安装 MCP 启动器保留调用方工作目录的行为。

这些工作簇尚未完成统一拆分、完整回归和产品实操，因此不得称为“已修好”。不要直接把剩余脏工作树整体提交或整体合入；应逐项重新核对目标、必要性、最小范围和验收证据。

## 后续接手顺序

1. 从目标集成分支创建干净分支，确认目标分支是否已经包含 `63e1246`。
2. 按本文顺序评审并 cherry-pick 7 个修复提交；若基线已前进，逐个解决冲突并在每一步复验，不要一次性搬运剩余脏工作树。
3. 在干净集成结果上运行完整 TypeScript、v1、MCP、Web、安装与端到端测试；定向测试结果不能替代整仓回归。
4. 对真实安装产物补做升级恢复、Web 启动与深链打开的产品实操；主观体验和真人确认项标记为 `UNVERIFIED`，直到用户本人认可。
5. 再从“仍留在工作树”的工作簇中一次只选一个最小闭环，单独审查、实现和提交。
6. 3 条 pending Candidate 的对应代码范围均已有修复，但账本状态仍属治理问题，不属于 Git 合并动作。除非用户以后明确要求，否则不要再通过 Molis Work 推进或代替用户作 Candidate 决定。

## 拆分完成时的 Git 边界

- 工作树：`/Users/oreal/.codex/worktrees/eea6/molis-work`
- 分支：`codex/split-completed-goal-fixes`
- 拆分基线：`63e1246`
- 已合入 `main` 的修复提交范围：`1feac8d..6435a74`（共 7 个提交），集成边界为 `140d25e`
- 最后一条 Candidate 修复分支：`codex/proactive-safe-parallel-runtime-choice`
- 本轮未执行：安装、发布、剩余改动清理或 Molis Work 账本写入
