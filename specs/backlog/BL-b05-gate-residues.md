# BL-b05-gate-residues

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b05-gate-residues | 第 05 批审计列的四类门禁残留里，`verify-release-versions.mjs` 的 `aggregate-copy-store.ts` 豁免与 `openOwnerCopyStore`、`openAggregateCopyOwner` 两个已无定义的 opener 已随 #1998 删除，`tests/verify-release-versions.test.ts` 的 `UPG1-i-verify-03` 钉住它们不再回来；`S-121` 的代码位置也已改成现存文件。只剩 `tooling/gates/secret-allowlist.txt:42-43` 的两条旧金样密封值：注释写「before it was regenerated at integration（#1979 分支历史）」，#1998 删过、后来 #2004 为它自己分支的逐提交 secrets 扫描又加回，现在入库金样只用第 40-41 两行的当前值 | 第 05 批复核（2026-11-11 代码质量复审）；[U1 设计](../upgrade-continuity/upgrade-chain-design.md) §2.5 末行 | 已知缺口 | 白名单是密钥扫描的允许表，删行属于改扫描配置；要确认以后的长分支历史是否还会扫到这两个值（`#1979` 的旧提交不在 main 上）再决定删还是留，先保留并如实登记 | 用户对密钥扫描允许表的一次决定；下次改 `tooling/gates/secret-allowlist.txt` 时 | 低 | 存储维护人（执行会话待分配） |
