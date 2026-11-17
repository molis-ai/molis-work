# BL-stagger-token-adoption

分组：9. 平台小项与工程流程 / 设计系统与界面收口

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-stagger-token-adoption | 现有页面和助理首显列表手写的 `24ms`／`30ms` 阶梯延迟（`craft-finish-pages.ts`、`craft-finish-assistant.ts`）与卡片错开令牌 `--dur-stagger`（`60ms`，至多 4 张）统一令牌口径 | [#2038 评审第 6 项](https://github.com/molis-ai/molis-work/pull/2038#issuecomment-6828843484) | 明确后续做 | `--dur-stagger` 已在第 22 批定义用于卡片到达错开，列表行首显级联仍为固定毫秒步进，单列由 D 轨收口避免混入功能批 | 无 | 低 | D 轨（执行会话待分配） |
