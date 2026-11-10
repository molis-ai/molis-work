# BL-b05-gate-residues

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b05-gate-residues | 已删除的 `packages/storage/src/aggregate-copy-store.ts` 还有残留：`scripts/verify-release-versions.mjs:300` 仍把它列进 `checkBaselineCalls` 的豁免文件名，`:302` 的正则仍列 `openOwnerCopyStore`、`openAggregateCopyOwner` 两个已无定义的 opener；`tests/verify-release-versions.test.ts:352-364`（UPG1-i-verify-03）仍造这份文件来验证豁免；`docs/system/security-invariants/S-121.md:5` 的代码位置也点名它（本次修复只把 S-121 改到现存文件，未动门禁与测试）。另 `tooling/gates/secret-allowlist.txt:42-43` 还留着金样重新生成前的两条旧密封值（注释写「before it was regenerated at integration（#1979 分支历史）」），现在入库金样只用 40-41 两行的当前值。设计稿 `specs/upgrade-continuity/upgrade-chain-design.md:200` 自己写明「名单里还留着这两个名字，不影响判定，不为此改门禁」，评审侧要求「随手清或记」。清前两类要改门禁脚本和它的测试，删白名单行要改密钥扫描的允许表，都属改门禁（AGENTS 红线），需用户批准后再做 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批独立审计（U1 分册 B4/不挡第 5 项 + cleanup-global T7） | 已知缺口 | 删豁免等于改门禁脚本与其测试；secret-allowlist 只放行确切值、改它属门禁改动，需要用户批准 | 用户批准改门禁；U1-d 删除 aggregate-copy-store 已合入（#1958） | 低 | C1/U1（执行会话待分配，需用户批准） |
