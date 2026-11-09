# BL-upgrade-snapshot-key-dependency

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-upgrade-snapshot-key-dependency | 升级链设计 §5.4 要求「Home 主密钥、`feed` 文件密钥只在清单里记依赖（`keys.add` 的写法）」：`packages/storage/src/upgrade-snapshot.ts:246` 的 `captureUpgradeSnapshot` 已收可选的 `keys` 参数，`UpgradeSnapshotEntry.keys` 与 `verifyUpgradeSnapshot` 也会落盘并回读，但生产调用 `apps/local-host/src/home-upgrade.ts:205` 不传 `keys`，`captureUpgradeFileSnapshot` 更没有入口，所以升级快照的密钥依赖清单在生产上永远是空的（目前只有 `tests/security-invariants-upgrade-snapshot.test.ts:134-144` 直接传依赖验证了机制）。今天链里唯一的加密文件是 `feed/secrets.json`，还没有真实密钥升级段，因此无实际影响；接的时候先定「密钥依赖在哪个描述符里声明」，再在 `home-upgrade.ts` 的捕获处传入 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批独立审计（U1 分册「不挡合并」第 4 项）；`specs/upgrade-continuity/upgrade-chain-design.md:437-441` | 明确后续做 | 没有真实密钥升级段，当前不影响恢复；该字段的声明位置（描述符还是 Home 级清单）还没定 | U1 升级链（#1958 已合入）；U6「回到上一版」或第一段密钥升级 | 低 | C1/U1（执行会话待分配） |
