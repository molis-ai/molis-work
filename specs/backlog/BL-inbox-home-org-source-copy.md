# BL-inbox-home-org-source-copy

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-inbox-home-org-source-copy | `plugins/native/inbox/src/home-events.ts` 自己抄了一份 Feed 的「组织来源」名单（`github`、`gmail`、`youtube_channel`），来源归哪一类应由 Feed 给出或由来源声明，不在 Inbox 里写死第二份 | [第 15 批评审台意见 S6](https://github.com/molis-ai/molis-work/pull/2017#issuecomment-6823945201)；[第 15 批核账](../post-anticorruption-roadmap/reference/batches/15.md) | 明确后续做 | 第 15 批只把首页换成组合服务，没有改 Inbox 的旧首页事件投影 | Feed 公开来源类别（动作或声明） | 中 | 插件（Inbox／Feed） |
