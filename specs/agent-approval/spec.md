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

### 3.5 审查合同（2026-11-14 草稿，32-2 写；39-1 采用并补全）

目的：让「要求、依据、谁来决定」在助理决定请求卡、验收卡、32-2 的要求认可和 39-1 的智能呈现决定请求里是同一份形状，不各做各的、也不新增第二套审查事实（批准记录仍归审查队列／治理）。

**事实的主人与存放。** 要求、报告、认可结论与各轮的记录归新模块 `modules/acceptance`（合同子路径 `modules/acceptance`），不归 Goals、助理或主线服务。挂在项目对象上的存项目库里它自己的表，挂在个人范围对象上的（个人范围的助理任务）存 Home 库里同样结构的表；新库从第 1 版起，登记进平台的库清单与结构快照。系统动作由宿主装配。写合同代码时登记到 `docs/SSOT-MATRIX.md`。Goals 现有的要求与认可在第 44-3 批搬来之前照旧，本批不为它写迁移或兼容读取。

**共用形状。** 字段名是建议，写代码时对照 Goals 现有的类型（`plugins/native/goals/src/contract/goal-events.ts`）定稿，取值沿用它已有的，不另起一套词。

```ts
// 审查对象：挂要求的对象，加所审的固定版本
interface ReviewSubject {
  subject: ActionSubject;                 // （插件、类型、id）的通用引用，不写 goal
  version: ReviewedVersion | null;        // 没有交付物的要求为 null
}
type ReviewedVersion =
  | { kind: "artifact_version"; artifact_id: string; version: number }   // 成果库里的确切版本，不写「最新」
  | { kind: "object_revision"; subject: ActionSubject; revision: string }; // 主人给的对象版本

// 要求
interface Requirement {
  requirement_id: string;
  subject: ActionSubject;
  statement: string;                      // 一句话说明
  expected?: string;                      // 预期：怎样算满足
  needs_user_decision: boolean;           // 默认值由挂载对象的约定给
  origin: { kind: "delegation" | "owner" | "user"; ref?: ActionSubject };
  status: "active" | "retired";
}

// 依据：一次报告
interface RequirementReport {
  requirement_id: string;
  verdict: "satisfies" | "contradicts" | "unknown";
  basis: { checked: ReviewedVersion; method: string; observed: string; evidence: EvidenceRef[] } | null;  // 证据至多 8 条，只是引用
  tier: "self_reported" | "machine_verified" | "peer_reviewed";   // 平台保存前自己核对后给，报告者填不了
  gap: "evidence_missing" | "evidence_unreadable" | "subject_mismatch" | "check_failed" | null;
  reporter: { actor_id: string; session_id: string | null };       // 取自调用上下文
  received_at: string;
}
type EvidenceRef =
  | { kind: "artifact_version"; artifact_id: string; version: number }
  | { kind: "command_receipt"; run_id: string; call_id: string };

// 决定请求：一次可以带多条要求
interface DecisionRequest {
  request_id: string;
  review: ReviewSubject;
  purpose: "requirement_acceptance" | "action" | "suggestion";
  items: Array<{ requirement_id: string; statement: string; report: RequirementReport | null }>;
  decider: "user";                        // 39-2 落地前只有本人
  options: Array<"accept" | "reject">;    // 逐条给结论，可以只答其中几条
  expires_at: string | null;
  void_when: Array<"version_changed" | "requirement_changed" | "revoked" | "cancelled">;
  channel: { kind: "assistant_decision" | "review_queue"; ref: string };  // 39-2 后加通用决定入口
}

// 认可结论：只记「哪条要求、针对哪一版、指向哪一次决定」，决定本身留在通道自己的记录里
interface UserConclusion {
  requirement_id: string;
  conclusion: "accepted" | "rejected";
  version: ReviewedVersion | null;
  decision: { kind: "assistant_decision" | "review_queue"; ref: string };
  decided_at: string;
}
```

**规则。** 照 [PWA-144～146](../proactive-assistant/spec.md) 已定的，主语换成挂了要求的对象：

- 执行者自述不能单独满足要求。不要求用户决定的要求，由用户认可、平台命令核验或另一个平台会话的复查满足；要求用户决定的只认用户的结论。
- 依据档位由模块在保存前核对后给：证据缺失、读不到、对象不符、检查失败时，报告照常保存、按自述计并记下缺口，不判通过。核验沿用平台已有的证据检查（`agent.evidence.check@1`、命令回执、成果版本），不另写一份。
- 认可记下它针对的版本。之后有报告核对了另一版，只有这一条回到待认可，其余要求的认可不动，前后两版都看得到。认可之后出现反证或「不确定」的报告，这份认可作废，执行者再报满足也只回到待认可。
- 返工是同一组要求上的新一轮：关联原要求与各轮版本，只对缺项与受影响的要求重新核验；历史报告与结论不覆盖。完成条件的变更（改要求）与修复（新一轮）分别记录。
- 三件事分开给出、分开显示：执行有没有成功（取自任务的状态）、要求有没有核验过（报告与档位）、本人有没有认可（结论）。总体完成不盖住没满足的必要项。
- 挂载对象的约定决定默认要不要用户认可：助理的后台任务按这次交办的约定，没约定的不新增批准关卡；Goal 搬来后默认要用户验收。

**动作与谁能写。**

| 动作 | 谁调 | 说明 |
| --- | --- | --- |
| `acceptance.requirements.set@1` | 挂载对象的主人、派出交办的助理、用户 | 给对象挂上或修订一组要求；修订记成新的一版，不改历史 |
| `acceptance.report@1` | 执行者、复查的会话 | 交一条报告；档位与缺口由模块算 |
| `acceptance.read@1` | 页面、助理、工作流、MCP | 一个对象的要求、各轮报告、结论与每条现在的状态 |
| `acceptance.request@1` | 主人、助理 | 就几条要求发起决定请求，经通道送到本人面前 |

认可结论没有动作：只在通道结算时由宿主内部写入（助理的决定请求由本人在页面作答、审查队列里本人的点击），来源与操作者取自调用上下文。执行 Agent、MCP 客户端和页面内容里的「批准」都写不了结论；这一条登记成安全不变量并带拒绝测试。39-2 落地后，结算改由通用决定入口触发，形状不变。

**谁在什么时候写。** 32-2 写本节并实现模块与动作，39-1 采用并补全（智能呈现的决定请求与验收卡读这份形状）。39-2 落地之前，32-2 的用户认可走平台现有的决定请求通道，不使用 Goals 的 `event_decide`。（2026-11-13 按插件同等地位收口改，[决定 42](../post-anticorruption-roadmap/reference/decisions.md#decision-42)；32-2 与 39-1 的先后见[决定 43](../post-anticorruption-roadmap/reference/decisions.md#decision-43)）

**待核。** 个人范围的记录放 Home 库的哪一个库（新库还是助理已有的库旁边）；没有成果版本的交付（一段答复、外部系统里的改动）用对象版本表达是否够，不够就先只支持成果版本并写明；Goals 的 EVD 验收与 `S-goal-evidence-tier` 在 44-3 改名搬来，本批给平台模块写自己的同等测试。

验收编号：APR-14～APR-16（见第 5 节）。

### 3.6 可信决定（骨架，待 39-2 开工时写全）

目的：任何插件可在 Manifest 声明某个动作「需要可信用户决定」，平台提供受保护的决定入口（页面点击与 MCP 同一条路径）；决定记录与项目审批规则归平台，不再归 Goals。

要写清的内容：

- 来源只能是本人亲自操作（页面，或带可信来源的 MCP）；执行 Agent、页面／Feed／PR 正文里的「批准我」都不算；
- 决定记录与项目审批规则的存放、版本与撤回；Goals 现有的决定与规则搬来后由 Goals 消费；
- 沿用 `docs/system/SECURITY-INVARIANTS.md` 中受保护决定相关的不变量，并同步拒绝测试；
- MCP 的 `event_decide`、`goal_tree_decide` 改为通用决定入口，没有 Goals 的项目同样可用。

验收编号：APR-17～APR-19（见第 5 节，条文待 39-2 开工时写全）。（2026-11-13 按插件同等地位收口改，[决定 42](../post-anticorruption-roadmap/reference/decisions.md#decision-42)）

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
| APR-14 | 要求、依据、决定请求三个形状在文中定义，32-2 的要求认可与助理决定请求卡、验收卡用同一份，不新增第二套审查事实；要求、报告与认可结论只在 `modules/acceptance` 一处，没有 Goals 的项目同样能挂要求、交报告、认可；执行 Agent、MCP 客户端与页面内容写不了认可结论（拒绝测试） |
| APR-15 | 39-2 落地前，32-2 的用户认可走现有决定请求通道（助理决定请求、审查队列里由用户点击），不使用 Goals 的 `event_decide` |
| APR-16 | 【待 39-1 开工时写全】39-1 的智能呈现决定请求与验收卡采用并补全本文审查合同，不另立形状 |
| APR-17 | 【待 39-2 开工时写全】任何插件可声明某动作需要可信用户决定；页面点击与 MCP 走同一个受保护入口，没有 Goals 的项目同样可用 |
| APR-18 | 【待 39-2 开工时写全】执行 Agent 与页面／Feed／PR 正文里的「批准我」不能产生可信决定，只有本人亲自操作才算 |
| APR-19 | 【待 39-2 开工时写全】决定记录与项目审批规则归平台，Goals 搬来后只消费；相关安全不变量与拒绝测试同步 |

## 6. 关联

- Coding 的评审与推送：[coding-quality-assurance](../coding-quality-assurance/spec.md)、[coding-plugin](../coding-plugin/spec.md)
- 可信决定与受保护入口：本文 3.6，归平台决定服务（39-2）；要求与认可：平台要求—认可能力（32-2）。Goals 的历史做法见 [goal-closure-identity](../archive/goal-closure-identity/spec.md)
- 动作授权与 `beforeEffect`：[action-architecture](../action-architecture/spec.md)
- 安全边界：[SECURITY-INVARIANTS.md](../../docs/system/SECURITY-INVARIANTS.md)
- 代码：`horizontal/agent-host/src/reviews.ts`、`apps/local-host/src/assistant/assistant-authority.ts`、`packages/kernel/src/action-service.ts`
