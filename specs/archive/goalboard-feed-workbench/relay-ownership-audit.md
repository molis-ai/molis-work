# Relay 所有权迁移与独立性对账

## 结论

Molis Work 已拥有 Feed 日常运行所需的 Source、Connector、Run、Cursor、Item、Material、SecretStore、正文内容存储和迁移代码；运行依赖使用仓库内 `vendor/` 制品，不引用 `/code/relay`。Relay 只保留为用户明确触发的一次性只读迁移源，本项目不删除 Relay。

## 已迁移的代码与制品

- `src/feed/sources/`：RSS 目录、固定网页查询、YouTube 官方频道、自定义 HTTPS RSS、exact runtime 和恢复状态。
- `src/feed/connectors/`：GitHub Token / Device Flow、Gmail OAuth / 多账号、增量游标和 Provider 错误分类。
- `src/feed/security/`：Molis Work 自有 AES-256-GCM SecretStore 与加密正文内容寻址存储。
- `src/feed/relay-import.ts`：只读迁入 Source、Connector 元数据、Cursor、Run、Item、Material、可解密凭据和被引用正文，并生成持久化 receipt。
- `vendor/intelligence-client/` 与 `vendor/search-evidence-layer/`：锁定 tgz、SHA-256、provenance 与 SBOM；`package.json` 和 lockfile 只使用 Molis Work 内相对路径。

## 自动化对账

- 迁移重复执行不会覆盖 Molis Work 已有 disposition / linked Goal，也不会产生重复 Item 或 Material。
- 可读取的 Relay GitHub/Gmail 凭据在进程内解密后立即重封到 Molis Work SecretStore；API、HTML、Item、事件和测试输出不回显 Token。
- 被引用的 Relay 正文解密后写入 Molis Work 自有加密 blob；Relay DB、SecretStore 和 evidence 目录移除后，Molis Work 仍能读取迁入凭据、正文、Source 和 Item。
- GitHub/Gmail live adapter、Provider 失败不推进 Cursor、同幂等键本地 replay、同键中断重试、暂停门禁和 Gmail 账号隔离由 `tests/feed-connectors.test.ts` 覆盖。
- 公开 Source 的零网络注册、规范化去重、手动同步、暂停和幂等由 `tests/feed-sources.test.ts` 覆盖。

## 回退与失败边界

1. 迁移只读打开 Relay，不修改 Relay DB、SecretStore 或 evidence blob。
2. Schema 不兼容时在写 Molis Work 数据前失败；已有 Molis Work 数据保持不变。
3. 凭据或正文密钥不可读时，结构化数据仍可迁入，但 receipt 标记 `unavailable` / `partial`，不把密文当明文。
4. 重复迁移使用稳定 ID 和 receipt 对账，可在修复 SecretStore 或文件权限后重试。
5. 在真实迁移 receipt、Relay 缺席试用和用户另行删除确认完成前，不删除 Relay。

## 人工门禁结果

- 用户已在来源管理界面明确确认真实 Relay 所有权迁移；迁移预览为 10 个 Source、189 个 Item、135 份 Material，迁入后 Molis Work 可管理 13 个 Source。
- Relay 的 GitHub/Gmail 凭据已重封到 Molis Work SecretStore；服务连续重启后仍显示已连接及脱敏尾号，没有在页面、日志或 SQLite 中回显 Token。
- TechCrunch 已完成一次真实网络同步并在 Molis Work 产生 20 个 Item；重复迁移后数量仍为 20，暂停/恢复不丢数据。后续一次网络重试未取得可信终态时，界面保留 20 个旧 Item 并提示可安全重试，没有伪造成功或推进游标。
