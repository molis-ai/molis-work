# S-im-discussion-objects

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-im-discussion-objects | 普通聊天不返回项目对象引用或其数量。含引用的发送与对象呈现同时要求当前本机工作台和有效 IM 会话，后者须是持久项目主人且仍能访问原群；等待时任一授权、原消息或引用关系变化不得继续写入或交付。不可读或无效的引用拒绝整笔消息。引用与转发只读原消息保存的关系。缺有效声明的对象由原读取器证明当前可读，重复消息引用可共用本次读取。读后失去 IM 项目主人权限仍拒绝整笔写入。 | `server/src/im/index.ts`、`server/src/im/reads.ts`、`server/src/im/writes.ts`、`apps/local-host/src/im-discussion-surfaces.ts`、`apps/local-host/src/surface-project-read.ts` | `tests/security-invariants-im-discussion-surfaces.test.ts`「ordered discussion objects belong to the original message and require both current authorities」 | `tests/surface-cross-positions.e2e.test.ts`「discussion picks and quotes a Goal」「then opens a Pages object」 |
