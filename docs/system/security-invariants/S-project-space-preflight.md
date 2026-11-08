# S-project-space-preflight

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-project-space-preflight | 受管理项目库在只读预检中核对当前 Home 与已有库空间的完整绑定；零版本与当前版本的外来空间库均在可写连接、WAL 和业务基线写入前拒绝，保留字节、权限和目录成员。合法同 Home 预绑定初始化与独立库的无 Home 基线接口仍可用 | `apps/local-host/src/project-database.ts`、`packages/storage/src/space.ts` | `tests/project-database-baseline.test.ts`「S-142 PCSYNC-F2」 | 拒绝测试使用隔离 Home，不维护真实库 |
