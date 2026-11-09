# BL-golden-computer-settings

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-golden-computer-settings | `computer/settings.json` 必须备份，但第一份金样没有它：设置入口只在 macOS 注册，Linux 回放读回带版本文件的那一步（`scripts/golden/versioned-files.mjs`）会读不到而失败。要做的：让这一步按平台分开（macOS 读回，Linux 写明没跑、不算通过，和第三方样本同一种写法），再在生成时经设置入口写它，从 `tooling/gates/golden-coverage.json` 的 `uncovered` 去掉这一条，重新生成金样 | [金样回放设计](../upgrade-continuity/golden-replay-design.md) §2、§5；#1957 评审 | 已知缺口 | 第一份金样先入库；按平台分开读回要改回放的步骤和结果格式 | 无 | 中 | 升级连续性（U2，执行会话待分配） |
