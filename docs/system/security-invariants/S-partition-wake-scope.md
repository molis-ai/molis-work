# S-partition-wake-scope

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-partition-wake-scope | 跨分区的读和提醒不把不相干的分区叫醒（统一工作分区 §6.1、§11）：同步写入或恢复只把那份库标为待读，打开总览时只以只读连接读待读的库，不起任何插件实例，重建索引也不起；到期项只唤醒它所属的（插件, 分区）那一个实例，同一时刻到期的别的分区、别的插件不动。第 106 批只加不删，个人空间总览的开库次数预算（G4）在第 108 批上 | `horizontal/scheduler/src/due-registry.ts`（`DueTimer`）；`apps/local-host/src/partition-platform-services.ts`（`PartitionPlatformServices`）；`horizontal/search/src/overview.ts`（`OverviewService.refreshDirty`）；`packages/storage/src/adapters/overview-index.ts`（`readLibrary`） | `tests/security-invariants-partition-isolation.test.ts`「UPP-34 S-partition-wake-scope a synchronized write into a dormant partition updates the overview without starting anything; a rebuild starts nothing either」「UPP-34 S-partition-wake-scope the due timer wakes only the (plugin, partition) an entry belongs to」 | — |
