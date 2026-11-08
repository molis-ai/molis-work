# BL-tests-umask

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-tests-umask | `security-invariants-home-restore-recovery`、`security-invariants-runtime-backups`、`home-snapshot-cli`、`home-restore-content` 的权限断言依赖 umask：shell 是 077 时，断言期望 `0o750`、`0o640`，实际是 `0o700`、`0o600`，换 `umask 022` 就过。`home-snapshot-cli` 的夹具用 `writeFile` 带 mode 建文件，会被 umask 截断；另外几个没逐行读。这让基线比对多查了一轮，#1910 一度把这些算成原因不明。要让夹具不受 umask 影响，不放宽断言。第 14 批的本机基线比对里 `home-restore-content`、`home-snapshot-cli` 又因 umask 077 失败（022 下过），算作这一条，没有新开 | [#1910](https://github.com/molis-ai/molis-work/pull/1910) 的比对、U1-c 写手 | 已知缺口 | 查别的事时碰到的。现在本机跑这几个文件先设 `umask 022` | 无 | 低 | 工程流程（执行会话待分配） |
