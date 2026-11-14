# BL-b12-coding-executor-reads

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b12-coding-executor-reads | Coding 执行与合同的两处重复：① `plugins/native/coding/src/executor.ts` 一轮开始时读两次项目目录（输出与目录列表各一次），改成读一次 `projectDirectories`，和 `routes-sessions` 已改的做法一致；② `plugins/native/coding/src/shapes.ts` 手抄了合同里的类型（目录、说明文件的形状），改成从 `@molis-ai/molis-work-contracts` 导入，合同变了不会悄悄漂开；③ 页面经框桥调 `readInstructions()` 后，宿主回了新的 `instructions`，页面没用它、仍整页重读目录（第 12 批评审 S4），改成直接用回执 | 第 12 批评审台 S8、S4（[#2061](https://github.com/molis-ai/molis-work/pull/2061)） | 明确后续做 | 不挡合并；本批已改了 `routes-sessions` 那一处，这两处要再走一轮评审 | 无 | 低 | 下一个碰 Coding 的批次主会话（待分配） |
