# BL-action-card-outcome-text

分组：9. 平台小项与工程流程 / 翻译与界面用词

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-action-card-outcome-text | SDK 操作卡把中文句子存进卡片：`packages/plugin-sdk/src/action-cards.ts` 的 `outcome`（「结果未确认：…」「数据在建议之后变化了…」「已开始，后台进行中」「这项能力已不可用或已对助理关闭」、`outdated`／`targetMoved` 的三种过期说明、`summarizeResult` 的「已完成」）和 `actionCardView` 的「内容」标签。这些句子随卡片存进助理的 `assistant_cards`、Coding 的卡片和 Work Brief 下一步的标记（`NextMark.card`），英文界面照样显示中文，违反「存键和参数，不存译文」。合同 `AssistantCard.outcome`（`packages/contracts/src/services/assistant-cards.ts`）也是 `string`。另：`runActionCard` 的拒绝说明同样是中文句子，但只作错误返回、不存 | 2026-11-17 合入批次核对；第 19 批「没做、留给后面的」末条（该处只记了不在本批改，没登记） | 已知缺口 | 要把 `outcome` 改成 `OwnedTextRef`（SDK 的键，参数带错误原文与对象名），属合同改动；已存的卡片要升版本并给连续升级步骤（旧句子可转成 `literal`），按 `docs/system/CONTRACT-CHANGES.md` 先经用户确认迁移做法；SDK 属共享核心，改它跑全量 | 用户确认存量卡片的升级做法 | 中 | SDK／公共交互（D 轨）；助理、Coding、Work Brief 各自的存储 |
