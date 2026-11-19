# BL-b35-stored-text-keys

分组：9. 平台小项与工程流程 / 翻译与界面用词

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b35-stored-text-keys | 第 35 批里两处写死的中文：引导读外部会话被拒的原因（`apps/local-host/src/context-onboarding-sessions.ts` 的 `refusal`）存进 journey，英文界面也看到中文，改为存键加参数（评审 S7，与该模块现有错误同一旧债）；给模型的「没标注能不能看图」提示 `UNMARKED_IMAGES_NOTE`（`horizontal/agent-host/src/run-images.ts`）写死中文，助理那一轮另有一句同义提示，两句重复，改由平台一处按回复语言给并合成一句 | [第 35 批](../post-anticorruption-roadmap/reference/batches/35.md#batch-35-record)；PR [#2123](https://github.com/molis-ai/molis-work/pull/2123) | 已知缺口 | 不挡合并；要按现行 locale 与 TextRef 机制改存储形状，与引导模块已有错误一起改 | 无 | 低 | 引导与 Agent Host 主人（执行会话待分配） |
