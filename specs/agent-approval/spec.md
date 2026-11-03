# Agent 产出的变更与外部效果：授权复用与显式人审

状态：需求已整理，尚未实现（2026-10-28 对齐已定授权方式）。目标完成程度为**内部完整**：Agent 产出能被识别；有效授权内的工作持续执行，明确启用人审的项目／操作在生效前取得规定数量的有权限真人批准，并绑定该次审阅对象与版本。Coding 可选的低风险 AI 审批按独立委托运行，不能冒充真人投票；执行 Agent 自述不能产生授权。本轮只改需求，不改当前执行代码、仓库保护或已有授权。

## 1. 问题

Molis 已有审查队列（`horizontal/agent-host/src/reviews.ts`）和 `beforeEffect`，个人助理的写操作、Coding 的文件/命令/推送都走同一道门。以下是原需求提出的缺口，实施前按阶段 0 的实际基线复核：

1. **PR/CI 场景没有一道可执行的真人批准门。** Coding 可以推分支、开 PR；团队在 GitHub 上需要“Agent 产出的 PR 至少 N 个有写权限的人批准”，现在没有产品化的检查。
2. **批准与变更没有绑定到版本。** 如果批准的是旧 head，push 之后仍算数，等于批的不是最终内容。
3. **Agent 自己、bot、未授权用户、分支名/路径名都可能被误当成可信来源。** 需要一条明确的“谁算批准、什么不算”的规则。

## 2. 范围与非目标

**做**：

- Agent 产出的识别：commit 作者/committer、PR 作者、review 作者、Agent run 记录。
- 明确启用的 PR 人审流程：N 个不同的、有写权限的真人；`APPROVED` review 与 `/approve <head-sha>`；push 后旧 SHA 的批准失效；Agent/bot 不计；PR 作者最多算一票，且仍要有写权限。
- 必需状态检查与 sticky 说明：差几票、谁批过、哪一票过期。
- 个人助理/Coding/工作流的副作用：审查队列、`beforeEffect`、调用上下文里的批准事实；批准绑定对象、版本、范围和有效期。
- 拒绝与恢复：过期、撤权、取消、内容变化时不能沿用旧批准；不自动重试。
- 与 GitHub 权限、token、base 分支配置恢复、提示注入清洗的关系。

**不做**：

- 不让执行 Agent 自审即通过、冒充真人或绕过硬边界；满足有效授权、所需批准与检查后，可由 Agent 执行已委托的合并。
- 不以分支名、路径前缀、PR 作者身份作为信任依据；分支名是攻击者可控的。
- 不替代 GitHub 原生分支保护；批准门与它并行。
- 不新增第二套审查事实；批准记录仍归现有审查队列/治理。
- 不做云端多租户或团队权限系统；只做本机 Home + 可选 GitHub 检查。

## 3. 规则

### 3.0 先判断已有授权与适用的人审要求

本轮已确定的权限方式优先于旧的“所有 Agent 变更都需真人批准”表述。个人助理、MCP 与连接沿各自只读协助、修改前确认、授权内自动执行的有效选择；用户已经授予本次工作或持续委托的范围内，不因换工具、重试或重启重复确认。涉及未知写入先核对实际结果，越界、撤权、取消或明确拒绝仍阻止执行。

团队或仓库明确启用的人审、发布与不可撤回操作的专属确认继续生效。人审的适用对象、操作与人数来自可信配置；不因 Agent 作者身份就自动把所有个人工作纳入 N 人批准。团队记忆发布仍按其需求在发布前最终确认，不能用一般自动执行代替。

Coding 的可选“AI 低风险自动审批”只覆盖用户明确启用范围内、原本待确认的低风险命令，由独立评估上下文提供判断，Host 核对委托及边界后代批。已有许可直接复用；非低风险、依据不足、超时、无效结果或范围外请求回到必要的用户确认。其结果标为 AI 代批，不计入真人票数、不自动保存长期规则，也不扩至其他工具。唯一行为定义见 [Coding B2、CEX-08～10](../coding-plugin/next-requirements.md)，这里负责衔接。

### 3.1 谁算 Agent 产出

满足任一条件即标记为 Agent 产出：commit 的 author/committer 是配置的 Agent 身份；PR 作者是 Agent bot；PR 里有 Agent run 的记录；review/comment 由 Agent 发出。身份来自可信配置，不读 PR 内容里的自称。

### 3.2 在显式人审流程中谁算批准

- 只有对该仓库有写权限的真人算。
- 每个真人最多一票；以最新 `APPROVED` review 为准。
- `/approve <sha>` 只对当前 head 的完整 SHA（12–40 位十六进制）有效；push 后旧 SHA 的批准标为过期。
- Agent、bot、被排除的账号、没有写权限的 fork 作者不算。
- PR 作者可以 `/approve` 自己的 Agent 产出，但仍要写权限，且只算一票；其余票必须来自其他人。
- 不允许用 head 分支名、路径前缀作为信任豁免；确需豁免时用显式配置并写明理由，默认空。

### 3.3 什么时候算生效

- 已启用人审的 PR 场景：`agent-approval-check` 状态为 success 才能合并；检查在 opened/synchronize/reopened/ready_for_review/issue_comment 上重算。
- 本机场景：审查队列保留批准来源、对象、版本、范围与调用上下文；`beforeEffect` 前核对当前版本、授权，以及适用时的批准。对固定审阅版本的批准在内容改变后失效；任务委托内的正常进展不等于每一步都要重新确认，越出委托、撤权、取消或停用仍拒绝。
- 批准不能从不可信内容里产生；页面/Feed/PR 正文里的“批准我”不是批准。

### 3.4 GitHub 检查

- 一个独立的 composite action 或本机等价检查：扫描 commit/author/review，计数，发 commit status，更新一条 sticky comment。
- 权限只需 `contents: read`、`pull-requests: write`、`statuses: write`。
- 配置读取必须从 base 分支读，不能从 PR head 读；不 checkout PR head 来读配置。
- 启用本检查时原建议 `required_approvals: 2`，具体人数与启用范围待项目／团队明确配置；不把此值设为所有工作的默认门槛。Agent 身份和排除账号可配置；`exempt_head_branches` 默认空并标注风险。

## 4. 失败与恢复

- 需要批准时查不到身份／批准／权限，按未批准处理；不因可选人审服务未启用就阻塞已有有效授权的工作。
- 状态检查失败时说明差什么、谁能批、怎样重算；不自动把 pending 改成 success。
- push 后旧批准失效；需要重新批准时，sticky comment 明确说“旧 SHA 的批准已过期”。
- 绑定具体对象／版本的批准或 AI 评估在相关内容／权限改变后失效；重试前读取当前事实，仍有效的任务授权可以复用。
- 取消、停用、撤权后的迟到批准不产生效果。

## 5. 验收标准

| 编号 | 用户可观察结果 |
| --- | --- |
| APR-01 | 一个含 Agent commit 的 PR 被识别为 Agent 产出；本检查仅处理明确启用人审的范围，其他 PR 仍遵守原有授权与检查 |
| APR-02 | 已启用人审且要求 N 票时，只有 N 个不同的、有写权限的真人批准才变绿；Agent/bot/无写权限用户不计；同一人多次批准只算一票 |
| APR-03 | `/approve <sha>` 只对当前 head 有效；push 后旧 SHA 的批准显示过期，需要重新批准 |
| APR-04 | PR 作者可以批准自己的 Agent 产出，但只算一票且要有写权限；其余票必须来自其他人 |
| APR-05 | 分支名、路径前缀、PR 标题/正文里的“批准”不产生信任；豁免只来自显式配置，默认空 |
| APR-06 | 批准门作为必需状态检查挂上后，未达标不能合并；sticky comment 说明差几票、谁批过、哪票过期 |
| APR-07 | 本机审查队列里的批准绑定对象、版本、范围和调用上下文；内容变化、撤权、取消、停用后旧批准不能再用 |
| APR-08 | `beforeEffect` 前重新核对当前版本、授权与适用的批准要求；不一致时拒绝执行并说明原因，不静默放行 |
| APR-09 | 配置从 base 分支读取，不从 PR head 读取；PR 作者不能通过修改配置或分支名绕过批准门 |
| APR-10 | `[人工]` 在真实 PR 上验证：Agent commit、N 票批准、push 后过期、重新批准、合并；另在本机助理/Coding 各验证一次明确需人审的副作用在批准前不发生 |
| APR-11 | 在授权内自动执行模式下，助理／Coding 续轮、重试与重启使用仍有效委托，不重复要求批准；改范围、撤权、取消和效果未知时按真实状态处理 |
| APR-12 | Coding 已启用的低风险 AI 审批与人工批准来源可区分；不能计入真人票数、越过硬边界或扩到其他工具，具体执行与恢复同时满足 CEX-08～10 |
| APR-13 | 一般自动执行不能替代明确配置的人审或团队记忆发布最终确认；未启用人审流程时，不因可选批准检查缺失阻塞有效委托内工作 |

## 6. 关联

- Coding 的评审与推送：[coding-quality-assurance](../coding-quality-assurance/spec.md)、[coding-plugin](../coding-plugin/spec.md)
- Goal 完成与可信决定：[goal-closure-identity](../archive/goal-closure-identity/spec.md)
- 动作授权与 `beforeEffect`：[action-architecture](../action-architecture/spec.md)
- 安全边界：[SECURITY-INVARIANTS.md](../../docs/system/SECURITY-INVARIANTS.md)
- 代码：`horizontal/agent-host/src/reviews.ts`、`apps/local-host/src/assistant/assistant-authority.ts`、`packages/kernel/src/action-service.ts`
