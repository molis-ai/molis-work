# BL-persistent-format-first-upgrade

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-persistent-format-first-upgrade | 三个版本第一次要升时先定好：`format.jelly.workspace` 带 sha256 的 `checksum`，现在的 SQL 升级段算不出来，要升就得换成不靠段的写法或改 `checksum` 的算法；`MEMORY_GATE_VERSION`、`GMAIL_LIVE_CURSOR_VERSION` 第一次要升时先问用户。 | [第 05 批](../post-anticorruption-roadmap/reference/batches/05.md) U1-i 评审（[#1926](https://github.com/molis-ai/molis-work/pull/1926)） | 待你决定 | 现在都是第 1 版，没有要升的改动，定了也用不上。版本检查已接进 `pnpm health:check`，真要升时门禁会拦下，不会悄悄过去。`MEMORY_GATE_VERSION`（条目 `policy.memory.gate`）和 `GMAIL_LIVE_CURSOR_VERSION` 不在 `initial-versions.mjs` 的持久化名单上，给了升级链也过不了，所以要先问用户。 | 第一次要升的改动 | 低 | 各格式的主人 |
