# 灵光

本机临时灵感池：先记下还没想清楚的想法，再决定留下或丢掉。数据在 `{home}/lingguang/lingguang.db`。

包名：`@molis-ai/molis-work-plugin-lingguang`。

所有对外读写及对话能力由插件的 `actions.ts` 声明，项目 Runtime 注册。HTTP、工作流内容交接与授权 MCP 适配器共用动作服务；原 URL 只转参数，项目身份由 Host 绑定。

头脑风暴通过 Host 的文字模型接入，使用所选灵光和真实历史。未配置模型时提示连接，不创建占位回复；失败或取消不保存半轮消息。生成期间材料变化会拒绝过期结果。已有 `stub` 历史仍保留，并标记为本地记录。

工作台使用项目路由，自动保存携带版本检查，发送期间防止重复提交。数据保留原 SQLite 表和稳定 ID。对外客户端的正式授权产品仍随系统动作服务迁移推进。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`
