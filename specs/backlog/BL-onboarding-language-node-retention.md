# BL-onboarding-language-node-retention

分组：6. 连接、来源与 Onboarding

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-onboarding-language-node-retention | 首次使用的语言切换应保留欢迎区节点；核清并修复 FSS-37 的节点保留回归，同时保留语言文字、焦点和后续流程断言 | [FSS-37 回归](../../tests/onboarding-journey.e2e.test.ts)；第 58 批统一回归于 2026-11-16 在分支与干净主线 `4a08c41ca7` 均复现：同一 document 保留，但 `.welcome` 节点被替换，文件 13/14 通过 | 已知缺口 | 第 58 批修改公共子任务组件，未改首次使用实现或此断言；已保留基线证据，不把基线失败记成本批通过 | 在当前主线隔离 Home 复现；定位语言切换重建路径。此条不是 quarantine 或最终 CI 红项豁免 | 中 | Workbench 首次使用维护职责；执行会话待分配 |

复现命令：整体构建后，使用独立测试浏览器运行 `node scripts/run-tests.mjs --jobs 1 tests/onboarding-journey.e2e.test.ts`。对应失败为 `[true, false, "Language", "Hello."]`，期望 `[true, true, "Language", "Hello."]`。最近主线夜间 Full `43763763068` 在较早的 `ddda618006` 通过，不能证明当前基线此路径通过；后续以实际主线和运行结果结算。
