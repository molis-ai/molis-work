# BL-adoption-refusal-text

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-adoption-refusal-text | 项目库采用给出的拒绝原因（`apps/local-host/src/process-items-adoption.ts` 的 `refused`）是英文诊断句，同步设置的过程项四步原样显示在中文界面里。改成返回原因码和参数，界面按语言文件显示（`t` 与 `TextRef`），诊断原文只进日志 | [第 06 批](../post-anticorruption-roadmap/reference/batches/06.md)评审台（PR #2009） | 已知缺口 | 拒绝只在真实 Home 维护窗口里、条件不满足时出现，第 06 批先保证拒绝本身与不写任何东西 | 无 | 低 | 第 06 批之后接手资料与同步的批次（执行会话待分配） |
