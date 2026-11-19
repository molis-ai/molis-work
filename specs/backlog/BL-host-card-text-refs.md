# BL-host-card-text-refs

分组：9. 平台小项与工程流程 / 翻译与界面用词

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-host-card-text-refs | Host 放给本人的操作卡（第 61 批的项目建议卡，`apps/local-host/src/automation-proactive.ts`）放卡时就用 `uiText.text` 把标题、说明、选项名与描述译好存下；`automation.adoption.adopt@1`／`undo@1` 结果里的 `summary` 也存译文。换界面语言后，卡与结果仍是放卡时的语言，违反「存键和参数，不存译文」。`assistant-step-gate.ts`、`assistant-line-actions.ts` 是同一写法 | 第 61 批全 PR 评审（[#2133](https://github.com/molis-ai/molis-work/pull/2133)） | 已知缺口 | 根源在操作卡合同：`AssistantPreparedCard`／`ActionCard` 的标题、选项与结果文字没有 `TextRef`，要先改卡片合同与助理库，再改这几处放卡方 | 与 [BL-action-card-outcome-text](BL-action-card-outcome-text.md) 同一处合同 | 中 | 助理与操作卡维护人 |
