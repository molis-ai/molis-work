# BL-connection-card-image-key-check

分组：6. 连接、来源与 Onboarding

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-connection-card-image-key-check | 原处连接卡的图像密钥（C2 的 `save_key`，`apps/local-host/src/plugin-connection-need-http.ts`）改成先查后存，和服务连接（④d，`S-connector-candidate-key`）同一个口径：被拒时什么都不存、表单里填的留着；换密钥时旧的照常在用 | [#1901](https://github.com/molis-ai/molis-work/pull/1901) 统筹裁定、[#1903](https://github.com/molis-ai/molis-work/pull/1903) | 明确后续做 | ④c-1 与 ④d 同时在审，为了不同改一个文件分成两片；随 ④c-2（外壳画卡）一起做 | 第 18 批 P3-1 的防遮盖模块（④c-2 的前提） | 中 | D／连接（执行会话待分配） |
