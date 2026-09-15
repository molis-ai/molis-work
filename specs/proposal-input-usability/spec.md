# 提案输入校验与机械参数减负

## 背景目标
用户要求只修 Molis Work，并质疑接口参数/设置复杂度。真实 FlyLeaf 任务提交 Goal Tree 时缺 source_refs/confidence、affected_objects 使用 kind/id，产生 TypeError .map；改走 legacy Contract 后逐个遇到 rationale/status 缺失。另一任务提案和 FlyLeaf 代码不修改。
完成等级：修复到功能可用，定向回归验证；不升级现用安装、不恢复桌面验收、不提交推送。

## 决策与边界
- 来源/理由/可信度、用户确认、Run 权限和可验收合同仍需真实提供，不凭空填充业务事实。
- Legacy Contract 来源的 status=proposed、requires_user_confirmation=true 是系统不变量，允许省略并在保存前补齐；显式相反值仍拒绝。保持既有记录模型。
- Goal/Contract 条目可从 payload.goal_id（含现有 goal/proposed_goal 包装）推导受影响 Goal；关系已有端点推导。允许这些条目省略 affected_objects；其他类型仍要求明确对象。调用者显式给错格式仍报错，不猜 kind/id 别名。推导对象参与原有版本基线和冲突校验。
- Native 条目来源与受影响对象先做结构校验，批量给路径/原因/修正方式，避免 map/trim TypeError；现有有效调用及单字段业务错误码尽量兼容。
- Legacy field_sources 一次报告形状缺项，兼容 details.path 指向首项；补齐常量后再按现有来源覆盖/语义规则验证。不另建通用 schema 引擎。
- 公共 MCP schema/示例同步简化。优先使用 Goal Tree，Legacy Contract 保留兼容而非鼓励遇错换接口。嵌套 proposed_goal 底层已经兼容，不将其当成新增错误或再增兼容层。

## 模块范围
Governance provenance 持有来源校验和系统常量；Goals plugin 持有条目结构/对象推导、legacy 提交接缝；contracts 仅调整 input/return 类型，存储 record 不变；MCP schema 与现有 protocol 说明同步；定向测试覆盖真实失败和公开入口持久化结果。

## 验收
1. 缺来源/可信度和错误 affected_objects 能返回可操作字段列表，无内部 TypeError；失败时提案、事件、Goal 不变，修正后可成功提交。
2. Legacy 来源省略两常量可提交，持久化仍是 proposed/true；显式绕过确认拒绝，失败无写入。
3. Goal/Contract 可省略 affected_objects，保存正确对象和基线；确认仍经现有权限与版本门禁。不能遗漏目标基线或凭空创建目标。
4. 源有据、用户确认和验收严格性保留；非目标是重做整个规划模型、自动接受方案、放宽来源覆盖或一次重构所有工具。
5. typecheck/build、治理来源/提案公共入口与相关合同回归、diff 自检通过。记录未验证范围。

## 参数复杂度判断
当前主要负担是 native 与 legacy 两种模型并存、重复确认常量/对象引用、逐字段 provenance 和完整 policy 重填。此轮只去掉可确定的机械重复；逐字段来源与 policy 的进一步统一会改变合同语义，应作为独立设计决定，不在 bug 修复中静默取消。

## 验收记录
- 通过：pnpm build，38 workspace 与产品入口编译成功。
- 通过：governance-provenance、runtime-skill-flow、proposal-entry-chain、mcp 共 40 项；v1 定向合同/原子提案/决定冲突/版本基线/失败回滚 5 项。
- 通过：MCP 中复现缺 source_refs/confidence + kind/id，返回同一条目的四个字段路径；Snapshot 完全不变；用同一 idempotency_key 修正后成功。省略 affected_objects 的合同提案保存目标基线，仍可走用户确认、执行、证据、复核和重启完成流程。
- 通过：省略 Goal/Contract affected_objects 后，Contract 内容改变仍触发冲突，运行状态改变不误报；现有原子提交/失败回滚回归通过。
- 通过：Legacy 来源省略 status/确认常量，持久化填为 proposed/true；显式反值仍拒绝。后续同 key 改为显式常量返回原提案 replayed=true，无重复事件或提案（补充断言后定向复验通过）。
- 通过：boundary:check，38 包零错误；git diff --check。
- 未运行：更新现用 Home、真实 Runtime 新 Session、桌面启动；这些仍属于之前验收的待办，本轮未接触 4173 或另一任务的提案。未提交/推送。
- 测试修正记录：初次新增 MCP 断言把已有“错误文字 + 末行 JSON”格式误当纯 JSON；按实际协议读取末行结构化 details 后通过，未修改产品错误格式来迁就测试。

本地日志：/private/tmp/molis-work-proposal-fix-{build,tests,contract,replay,boundary}.log。
