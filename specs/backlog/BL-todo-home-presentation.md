# BL-todo-home-presentation

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-todo-home-presentation | 第 15 批起项目首页按各插件的呈现声明组合，旧首页「今天的事」列表随旧客户端删除。Todo 还没声明概况（[组合服务 §12 第 1 条](../surface-composition/spec.md)：Home 级插件的概况动作按 `project_reach` 给可达项目），所以首页上它是「未声明」卡，到期提醒、逾期待办不再出现在首页（Todo 自己的提醒照旧）。给 Todo 声明对象与概况动作，让首页重新列出今天要处理的待办；`tests/todo.e2e.test.ts` 的首页一段随之改回按内容断言 | [第 15 批 CI 修复（#2017）](../post-anticorruption-roadmap/reference/batches/15.md) | 已知缺口 | 第 15 批只接 Goals、Inbox、Coding、Feed 四个消费者 | Home 级插件的 `project_reach` 概况 | 中 | Todo（E 轨） |
