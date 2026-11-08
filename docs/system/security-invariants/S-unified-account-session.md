# S-unified-account-session

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-unified-account-session | 中央账号恢复材料仅在 Home 加密存储；刷新先持久移除旧 Token，单飞与 epoch 拒绝迟到写回。退出先持久清空，保存失败不得报告 localCleared；离线缓存不授权，普通退出与全局退出分别确认。活动/退出继续经过本机来源、控制 Token 与一次性写键；浏览器不能安装凭据。 | `horizontal/account/src/session-manager.ts`、`horizontal/account/src/session-state.ts`、`apps/local-host/src/account-session-storage.ts`、`apps/local-host/src/account-host.ts` | `tests/account-session.test.ts`「S-unified-account-session」；`tests/security-invariants-account-host.test.ts`「S-unified-account-session」 | `scripts/central-account.test.mjs` |
