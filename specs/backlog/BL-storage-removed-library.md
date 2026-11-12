# BL-storage-removed-library

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-storage-removed-library | 一个库从构建里消失（删掉描述符或改名成新库）时没有门禁，也没有运行期兜底：`scripts/gates/store-schemas.mjs` 明说「一个不在构建里的库从这一条过，它意味着什么归另一个门禁」，但那个门禁不存在；升级扫描只看当前描述符（`apps/local-host/src/home-upgrade.ts` 的 `scan`），指纹只由当前 pattern 与版本算出（`home-upgrade-stores.ts` 的 `upgradeFingerprint`），删档/改名后旧 Home 里的文件不再被扫描、不会升级、不会提示。今天只靠评审看 `docs/system/HOME-DATA.md` 的库行与发布检查单第 4 节的人工比对。补法候选：`tooling/gates/schemas/stores.tsv` 里在当前树没有、merge-base 有的行必须带一条「移除了、旧文件怎么处理」的登记（可扩 `CONTRACT-CHANGES.md`「库版本维护清单」），或在升级扫描里对比上一轮 ledger 与当前描述符，记录一条诊断 | 第 05 批复核（2026-11-11 代码质量复审）；[U1 设计](../upgrade-continuity/upgrade-chain-design.md) §2.3 末段 | 明确后续做 | 补门禁属于「改门禁本身」，2026-11-11 用户只批准了 inline `@version` 门禁这一项；运行期提示还要定「记录在哪、给谁看」 | 用户批准改 stores 门禁；下一次有库被删除或改名时 | 中 | 存储维护人（执行会话待分配） |
