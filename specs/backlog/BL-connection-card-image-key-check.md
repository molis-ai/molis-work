# BL-connection-card-image-key-check

分组：6. 连接、来源与 Onboarding

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-connection-card-image-key-check | 原处连接卡存图像密钥（C2 的 `save_key`，`apps/local-host/src/plugin-connection-need-http.ts`）做到先查后存：image-api 没有能单独验密钥的检查，被拒的密钥要到第一次生成才知道，在那之前已经存下了；要先查后存，得先给图像服务加一个检查方法，再由 `save_key` 在存之前调它（被拒时什么都不存、表单里填的留着，和服务连接 ④d 的 `S-connector-candidate-key` 同一个口径）。卡这边的写法已经留好：`save_key` 现在照连接主人的检查走一遍，image-api 没有检查，所以照旧直接存 | [#1901](https://github.com/molis-ai/molis-work/pull/1901) 统筹裁定、[#1903](https://github.com/molis-ai/molis-work/pull/1903)；第 13 批④c-2 统筹 2026-11-07 定照现状、留缺口 | 明确后续做 | 图像服务现在没有单独验密钥的方法；④c-2 按统筹 11-07 的决定保留现行行为 | 图像服务（`plugins/native/images` 的 image-api 提供方）先加检查方法 | 低 | D／连接（执行会话待分配） |
