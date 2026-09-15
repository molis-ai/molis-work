# 已收口父 Goal 的覆盖澄清入口一致性修复

## 背景与目标

用户已确认本次重组不新增 Outbox。正式修订恢复验收时，现用 Molis Work 给根 Goal 返回 `clarify / ready / target_type=coverage`，但领取同一个 action/token 返回 `goal.clarification_not_needed`，没有创建 Claim/Run；后续 Explain 也拒绝。该缺陷阻塞正式范围修订，不得通过直接改库、新建空壳Goal或伪造actor绕过。

2026-09-06 用户先“确认修复”，随后对“将修复更新到现用 Molis Work 并重启服务”回复“确认”，已授权本体更新及既有受管服务重启。保留项目与 Runtime 配置，不包含 Goal 状态/提案决定。整体重组仍在进行；Outbox 留后续的用户决定不需要重复确认。

## 根因与调用链

- `plugins/native/goals/src/action-projection.ts` 的 `compoundActions` 读取 Contract revision coverage。发现 stale coverage 后给 closed_compound Goal 发布 Runtime clarify ready 动作。
- `src/v1/coordinator.ts` 的 `goalNeedsClarification` 只看未accepted、abstract/frontier_open或空验收条件。领取的clarifier gate与旧work-state都使用这个判断，未考虑覆盖过期。
- 因而对 accepted/closed_compound，展示侧允许、领取侧拒绝。对 satisfied 父项还会遇到第二个 already_satisfied gate；只改一个布尔判断不足以覆盖完整场景。
- 新旧判断经 `ExecutionValidationApplication` 与 `DraftDialogueApplication` 被 CLI/MCP/Web 共用。修复只针对正式覆盖修订，不应变成任意重开或任意Contract变更权限。

## 最小完整方案

将“当前是否需要覆盖澄清”的判定归入 Goals Native Plugin 的现有动作/生命周期策略owner，投影、Explain、select及work-state消费同一结果。旧Coordinator只做具名装配，不复制coverage算法，不新增huge class。保留归档/回收/替代、已有Claim、待用户决定、权限与token校验。

已收口父项只有真实stale coverage时允许受限clarifier工作；普通已完成且覆盖有效的父项仍不可领取。开始澄清不能改原Contract或子Goal；修改仍需正式提案和用户决定。无效/缺失coverage应保留其原阻塞原因，不能用“放开已完成Goal”补丁掩盖它。

## 范围与非目标

允许修改面建议：Goals Native Plugin 的已有策略/执行入口、根Coordinator必要装配、对应回归及开发文档。实现前核对具体API，避免跨模块Store调用。

不改数据库schema、真实项目、Review权限、DD独立提案、已完成子项及用户确认门禁；不以此次修复批准Outbox范围提案。现用MCP进程加载修复需要独立安装/新Session验证，源码测试通过不等于现用入口已修好。

## 验收

1. 用真实应用API创建父子覆盖、修改子revision产生stale；投影、Explain、select、DraftDialogue一致，Claim/Run只有一份。
2. 在本地隔离测试中提交、检查、用户决定覆盖修订；原业务字段、子项历史及Evidence保留，修订后coverage动作消失。
3. 未变化的closed_compound、归档/回收/替代、其他actor活跃Claim、待确认提案及过期token仍拒绝且无副作用。
4. 覆盖有效/过期和父项fulfilled/unmet场景分别检验；不单测一个helper就宣称调用链通过。
5. 定向Goal/Execution/Dialogue回归、类型与边界检查；授权升级后再用现用MCP验证真实动作，不用管理CLI或SQLite替代。

## 当前状态

2026-09-06：用户已明确授权修复及现用更新。源码修复、隔离应用验证、正式本体更新和服务重启完成；安装消费的 13 项测试通过，服务健康。当前对话旧 MCP 未热加载，只读 Explain 仍返回旧拒绝；需新对话加载修复后继续，不能宣称当前旧 MCP 已解锁。93项迁移/恢复/权限验证保持有效，Outbox 的既有范围决定不变。

实现新增 Goals Plugin 的 `clarification-policy.ts`，复用现有投影索引与 Contract revision 规则，移除投影和生命周期核对中重复的覆盖算法。Coordinator 消费公共策略，并读取既有投影的待用户决定动作；保留全部其他领取门禁。Draft Dialogue 的开始/恢复使用公开 work-state，复用已有澄清 Run，不新建空壳 Goal。

验收记录与实际缺口见 [validation.md](./validation.md)。
