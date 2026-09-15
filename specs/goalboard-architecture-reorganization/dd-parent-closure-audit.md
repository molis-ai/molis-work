# DD 父 Goal 收口审查

2026-09-06。父 Goal `goal-1cb5db42-232a-426a-ac79-36c6320d621e`，revision 2；本次只准备拆分结束的待确认提案，不改变产品功能、验收标准或其他 Goal。

## 判断

DD1、DD2 已完成，并且覆盖父 Goal 的全部承诺。建议保持原 Contract 的结果、范围、约束、验收和 Policy，只把 `frontier_open` 改为 `closed_compound`，结束其拆分。不是用“两个子项已完成”代替覆盖审查，也不是整个重组完成。

| 父项承诺 / 验收 | 对应子项与已有实证 |
| --- | --- |
| Draft Dialogue / Goal Tree Decision 薄应用端口 | DD1 的草稿开始、记录、恢复应用；DD2 的原生/历史提交、读取、预检、决定应用，均由 Goals Plugin 组合唯一 Module owner 的公开 API |
| 跨入口兼容测试 | DD1 最终 182/0/0；DD2 最终 209/0/0 包含草稿与决定的真实 CLI/MCP/Runtime、浏览器及持久化恢复。两组有重叠，不把数量相加宣称独立覆盖 |
| 旧 Coordinator 对应 caller 与职责清零 | DD1 三方法及独占 helper；DD2 四方法、历史提交/决定及 helper 均退出，Host 绑定新应用，提案 UI 通过 Workbench / UiHost 组合 |
| criterion-0879e808-c659-44b5-a81f-4852d38dcdeb：公开 caller / 边界 | DD1 boundary + exit、DD2 boundary + exit；具体调用与残留非目标见 dd1-validation.md、dd2-caller-audit.md |
| criterion-d7c2fe12-0040-4831-b05b-d3bc982d82b3：行为无损 | DD1 result + DD2 result；身份、幂等、错误、回滚、真实交错、过期恢复、部分决定、历史数据恢复及明确用户确认已验证 |

Canonical 来源：DD1 Evidence `evidence-4a0cc5ee-ba83-4d4b-a828-b5da26e0368a` verified、Review `review-8bca2c40-37c6-4d02-aa6b-6cc1df332898` pass；DD2 Evidence `evidence-5bbb9ca4-957d-4ca0-bd52-e64547da2bd4` verified、Review `review-ed351489-139c-409e-be42-f3f33afdcf6b` pass。两个子 Goal 的当前 Contract 均 valid / satisfied / verified / completed。父项映射继续精确使用这两个后代的原输出名和 criterion_id。

## 方法、输入与依赖

重新读同一目录 `sha256:e222a61b77957e4763660c9a` 的迁移重构、软件开发、开发者工具、AI 人工复核完整方法。项目必选组合为空；本项未涉及新市场、收费、模型、敏感数据流或发布，不扩方法或新建工作。继续采用 dd-work-plan.md 的逐条依赖判断：

- 迁移基线与回退 → 软件实现 / 旧 caller 退出：DD1/DD2 内部已验证，不新建测试或清理子 Goal。
- Goals / Governance / Execution 的公开结果 → CLI/MCP/Web 真实调用：继续消费现有 GW3 / EX3 / EX4 / DV1 前置，不重做这些模块。
- Runtime 待确认 Proposal → 人的明确决定 → 正式事实：保留当前信任边界，权限失败、拒绝、修订和重试由两条用户流程的测试证明。
- DD 完整结果 → 最终 Cutover：保留已有依赖；反方向没有消费。DD1/DD2 保持原 part_of，不新增依赖，也不把 DD 挂入 Goals Mutation 制造组合循环。

现有项目 spec、模块 README / public Contract 和 UI Platform 继续提供架构事实。这里只记录一次有限覆盖核对，不复制根 SSOT，不组织并行写入。既有方法 coverage 的 28 项继续由 DD1/DD2 承担；最后的开放项只剩父项拆分状态，建议清空 open_goal_ids 并把 review 改为 complete。

## 不包含与决定后状态

不关闭 Goals Mutation 父项：现用 Web 的 Policy SQL、Coordinator 的 Goals/Relation/Risk 查询仍须有限清理与原标准复核（见 goals-parent-closure-audit.md）。不以“以后 Cutover 做”冒充本次已消除。

不完成 DV4 GUI 首启、不暂停 4173、不改用户 Home / 安装 / 模型配置，不代表全产品 E2E、总清理、再 E2E 或最初要求总审查完成。

待确认提案仅一个父 Contract-update，其他 Goal、关系、Policy、Risk、Evidence、Review 均不变。用户确认后才 materialize；再读取返回的 semantic_review 并检查受影响 Contract，父项真实完成状态以 Molis Work 返回为准，不手动写 satisfied。

正式提案：`goal-tree-proposal-84bdb63c-4da2-4996-9af5-8a93e2cec4b4`，条目 `item-dd-parent-closure-20260906`。2026-09-05T21:18:46.762Z 预检无冲突、无 planning issues，cursor 1133；仍 pending，尚未确认。当前源代码未因本审查改变，复用已有验收；本轮文档 diff check 通过。
