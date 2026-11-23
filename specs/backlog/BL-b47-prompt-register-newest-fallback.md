# BL-b47-prompt-register-newest-fallback

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b47-prompt-register-newest-fallback | 同一插件在两个项目装了不同版本，装新版的项目卸载后，模型要求列表回到还在用的那一版 | [第 47 批 47-1](../post-anticorruption-roadmap/reference/batches/47.md) | 已知缺口 | 登记处每个安装只记最新一版的声明，要改成按版本各记各的，并和原地升级的刷新对齐 | `apps/local-host/src/plugin-instructions.ts`、`tests/prompt-registration.test.ts` | 低 | 待分配 |

- 现状：`registerPluginAgentDefinitions` 对同一个安装（同插件、同发布者）只留最新版本的声明。项目甲用 1 版、项目乙用 2 版时列表显示 2 版的默认文字；乙卸载后列表仍显示 2 版的，直到甲重新启动。甲实际运行用的始终是自己那一版的文字和你的改动（`tests/generated-plugin-prompt-binding.test.ts` 有断言），受影响的只是列表里显示的默认文字和多出来的条目。
- 第 47 批之前创作台的私有安装路按「项目＋安装」分别登记，没有这个现象；改为与所有插件同一条登记路以后才出现。
- 验收：按上面的场景，乙卸载后列表里这条的默认文字是 1 版的，2 版独有的条目不再列出。
