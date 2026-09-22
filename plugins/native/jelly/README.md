# Jelly

Status: `partial`

Jelly 的日历、笔记、灵感工作区，使用 Molis Work 控件与舞台。个人数据独立存于 `{home}/jelly/jelly.db`；不会访问或覆盖原 Jelly 数据。功能目标与差异见 `specs/jelly-plugin/`。

Contract: `@molis-ai/molis-work-contracts/platform/plugin` 与 `@molis-ai/molis-work-contracts/modules/jelly`。
Migration Goal: `goal-reorg-f2`。

Host 通过包公开接口注入模型/素材能力；MCP 默认关闭。原始素材和 AI 提案只有在用户确认后才写入日历或笔记。当前实现、工程证据、实际体验和真人验收分别记录，不将本地构建视为完整复刻验收。
