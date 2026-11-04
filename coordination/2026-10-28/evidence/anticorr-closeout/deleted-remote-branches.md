# 防腐线收口删除的远端分支

2026-11-04 用户同意后删除，共 24 条。删之前核过：每条的末端都是 `3246b618c`（#1725 的最终头）的祖先，没有多出来的提交；没有开着的 PR 以它们为头或基；末端和核对时一致。

main 是 squash 合入，这些提交不在 main 的历史里。它们仍可以从 `refs/pull/1725/head` 取到，所以 SHA 和完成表里的引用继续有效。要恢复某条分支：

```bash
git fetch origin refs/pull/1725/head
git push origin <SHA>:refs/heads/<分支名>
```

| 分支 | 删除前的末端 | 对应 PR |
| --- | --- | --- |
| `claude/anticorr-r1-exceptions` | `e181f302fb02b4108fea74d6df12bfe5831e4b75` | #1727 |
| `docs/anticorr-archive-prep` | `71c3cf8d607a194c0828b6961b79292e2738316a` | 无 |
| `docs/anticorr-final-archive` | `709e4f9e2a4320ef99c81a2e408def89c684f9a5` | 无 |
| `docs/anticorr-settlement` | `58d0483678cbce1bc1cadd0b3bdfead97a776552` | 无 |
| `feat/pg070-remaining` | `e0390ea26c1e809ad5413bda0d0ba8e1fa3574ce` | 无 |
| `feature/t395-oauth-feed-carrier` | `4aeda9ffe328049007cb5ce147e5340da93eca34` | #1724 |
| `fix/branch-local-regressions` | `c1c130de777dbb172eb4cccf27a7cce98d1e0620` | 无 |
| `fix/cdp-event-loop-hotspot` | `0715ae4ad53ab1102f62314cda68f328141dcf40` | 无 |
| `fix/feed-reader-scroll` | `9bfb9c10e55f05d0fd01c70815e51fbce60a3af3` | 无 |
| `fix/macos-only-leftovers` | `5089d108593b8c04126538971b2290288f0688e0` | 无 |
| `fix/multi-pane-hotspot` | `a5ed8bf3935fe6fadbf7c3f5b67e11282c1ad276` | 无 |
| `fix/sandbox-entrypoint` | `e7869c30c808e6e6106e7b8220811c084a361ed3` | 无 |
| `fix/snapshot-followups` | `6cb9dc8b21282cb656d1ba121484743bea8cc0aa` | 无 |
| `integration/anticorr-closeout` | `da020e39597e1cc5c532f56c9d3cfbeb336f9bde` | 无 |
| `integration/anticorr-closeout-final` | `a31e1b674d0510ea9f2fda8f61c0018172369614` | 无 |
| `integration/anticorr-closeout-final2` | `3246b618c99a8ec8dd9566cb5aae75f9c99595cf` | 无 |
| `integration/w6-closeout-17b5e7a` | `17b5e7a855517b0306b583a87929d3c725770df3` | 无 |
| `integration/w6-closeout-20261102` | `bfe957e8eb5447be0df10b499302160e6269f346` | 无 |
| `integration/w6-closeout-2f7f314` | `2f7f3148bd5c8f4448e8ae81a43217cad4d5b20f` | 无 |
| `integration/w6-closeout-e93c930` | `e93c930f99525aad299fb4ca1dc430476ecb1894` | 无 |
| `task/T065-ca` | `94861f093ab3971c6370b824cdd2bfcc30caf14d` | #1669 |
| `task/T066-ca` | `ebcd6536cfec7a457802d1d87c24d2c4a242fda0` | #1672 |
| `task/T121-ca` | `c2502b62dc2af4cb090ce740f12d394646e7bdeb` | #1677 |
| `task/T353-b-prc` | `07592e0fc36375b8d191d24ceafbd5e58d36d403` | #1683 |
