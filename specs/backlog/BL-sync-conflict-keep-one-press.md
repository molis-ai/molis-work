# BL-sync-conflict-keep-one-press

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-sync-conflict-keep-one-press | 解决同步冲突选「用另一台设备的」时，本机那份的附件多于一轮能传的数量，要再按一次才完成 | 修复创作台 SDK 声明清单（#2210）时发现 | 已知缺口 | 每轮请求上限是同步模块的既有设计，改成自己接着传要动 `modules/sync-replication` 的冲突保留流程，不属于那次修复 | `modules/sync-replication/src/conflict-retention.ts`、`blob-transfer.ts` | P2 | 未指派 |

- 现状：`retainConflict` 先把本机那份的每个附件传上去留底，一次调用最多 32 个请求（`blobTransfer` 的预算）。超过就答「附件传输尚未完成，请继续同步」（`sync_replication.sync_busy`，`sync_resume: true`），已传的记着，再按一次从断点接着传。自动同步遇到这个信号会立刻接着跑，人手动解决冲突时要自己再按。
- 创作台草稿每个文件是一个附件（源码、测试、合同、SDK 类型声明）。声明清单从 9 个补到 17 个以后，最小的草稿也超过一轮；文件多一些的草稿原来就会遇到。
- 验收：手动解决一份附件多于 32 个的冲突，按一次就完成，过程中显示进度；中途断网或退出后再按仍从断点继续。`tests/fixtures/authoring-sync-proof.ts` 里「再按一次」的循环随之删掉。
