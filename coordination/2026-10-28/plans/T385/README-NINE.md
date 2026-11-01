# Storage README 另九项：逐项核抵/补跑

本轮唯一 accepted WO 为 T-385，固定 H=`44efe84d925b7f01e6f8f837c0bf284471ae7659`。当前 README 仍为十五个必跑文件，没有新增/删除要求。旧 T346 H=`b4f7e598…` 的十一文件各116例不包含这九项；T347 修复 H=`a8608b3e…` 的独立10例只覆盖 format/snapshot 两文件。没有将旧223、旧35或作者汇总作为这九项在本组合上的有效完整执行，因此以下九行均选择**补跑原完整文件**，未以六个最小文件豁免 README。

| 完整文件（tests/） | 核抵决定、实际输入和用途 | 本轮准确 H |
| --- | --- | --- |
| secret-store-keychain-retry.test.ts | 不核抵旧批；原受控 fake security + 私有 Home，PATH 只含该假程序。核拒绝/超时/无效 key 后停止重试、另 Home、空 vault、lazy/Functions 和新进程恢复；无真实 Keychain或真实模型。 | 9/9 |
| plugin-private-storage.test.ts | 不核抵旧批；原 SqlitePluginPrivateStorage/Runtime/GitHub fixture，核持久化、签名/权限隔离、失败升级恢复及 stale writer。 | 6/6 |
| system-search.test.ts | 不核抵旧批；当前 SearchService、storage 索引、Todo fixture，核内容可读边界、中文/前缀、更新/删除及索引恢复。 | 27/27 |
| feed-local-history-delete.test.ts | 不核抵旧批；原 EvidenceContentStore/搜索操作 namespace/受控 pull，核只删无引用正文和命名空间内记录；使用合成密封数据。 | 3/3 |
| project-deletion-owners.test.ts | 不核抵旧批；当前 owner hooks、applySqliteBaseline、各 plugin store fixture，核项目私有事实由其 owner 删除并保其它项目。 | 4/4 |
| project-deletion-studios.test.ts | 不核抵旧批；原 controlledAlchemistAi、临时项目/Host、平台 secret store，核 studio/构建/密钥清理、当前 Host owner 和关闭注册；无账号服务调用。 | 4/4 |
| security-invariants-connector-private-state.test.ts | 不核抵旧批；原 connectedPrivateCli 走平台 prepare/install/start/PTY/finish，下载和登录均为 localhost 夹具，核原 key、只读捕获、认证/链接/FIFO/owner 拒绝与恢复。不是外部 Vercel 登录。 | 9/9 |
| security-invariants-home-payload-purpose.test.ts | 不核抵旧批；原 owner payload/vault 的合成密文及原 key，核 AAD 用途隔离和健康正控。 | 3/3 |
| security-invariants-connector-private-state-limits.test.ts | 不核抵旧批；同一现有受控 CLI 与 capture/preflight owner，完整运行字节、节点、跨安装预算和读取期间增长拒绝。 | 4/4 |

命令/原始逐例日志为 `raw/readme-nine.log`，完整文件列表、逐文件 SHA-256、H 与实际 build digest 为 `raw/readme-nine-result.json`。九文件全部69例 pass；fail/skip/cancel/todo均0，jobs1/retries0，没有筛名或重试。共同 fixture（isolated-host、connector-private-state、connector-cli-package、test-home、plugin-home-stores、alchemist-actions）、package/lock 的 Git blob 均与准确 M 相同，详见 `verification-summary.json`；这不把两个新增 storage 行为说成未变，故本轮执行使用组合实际 dist。

这九项和六个固定文件为两个不重叠文件集。旧 T346 的11文件/116例和本轮6文件47例＋9文件69例是不同输入、不同来源；数字偶合不能混账。旧十一文件中 installed-plugin-host、security-invariants-plugin-projects 相对旧116已有主线变化；它们从输入815到承载未再改变，见 `raw/old-eleven-inputs.json`。本轮未重演旧十一，新增 case 不署旧116通过，最终 H 的 CI Full由根结算。
