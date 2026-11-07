# BL-versioned-file-refusal-words

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-versioned-file-refusal-words | 带版本的设置文件比程序新或读不了时，读按默认、保存被拒（升级链 U1-e）。有三处还没跟上。第一，电脑设置（`computer-http.ts` 的 `/api/computer/settings`）和浏览器助理开关（`browser-http.ts`）的 POST 没有接住 `storage.*` 拒绝，界面只显示通用的「没有完成，请重试」，可重试不会好；要把拒绝的原话带给界面，网站决定那一路已经这样做了。第二，文件是坏 JSON 时，拒绝原话来自 `sqliteVersionRefusal`，前半句「结构版本是 0」对坏文件不准，后半句「备份后移走它让它重建」是对的下一步，要换成说文件读不了的原话。第三，不取锁的读者 `catalogManagementProject`、`heldInstalls` 和 `management-action-client.ts` 的 `catalogUpgradePending`，用普通只读连接打开关着的 WAL 目录库，会留下 `-wal`、`-shm`，主文件不变；它们可以改走 `readUpgradeStore`，这要先把 `assertOwnedCatalog`、`assertCurrentCatalog` 改成收裸连接 | [#1958](https://github.com/molis-ai/molis-work/pull/1958) 评审 | 已知缺口 | 只有降级（U6 之前做不到）或文件坏了才会走到；不挡 U1 | U1-e | 低 | C1（执行会话待分配） |
