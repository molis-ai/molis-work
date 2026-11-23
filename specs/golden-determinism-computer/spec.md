# 金样生成确定性与电脑设置回放

状态：执行中（2026-11-22，Codex）。目标为工程验证通过。

在最新 `origin/main` 的独立工作树处理 BL-golden-generation-nondeterministic 和 BL-golden-computer-settings。依照 [金样回放设计](../upgrade-continuity/golden-replay-design.md) §2、§5 和 [#1743 的复现记录](https://github.com/molis-ai/molis-work/issues/1743#issuecomment-6847046532)，用 `.nvmrc` 的 Node 24.15.0 与内置 SQLite 3.51.3 复现两条 UPG2-02，再从生成步骤定位并控制漂移源。以实际还原出的文件和主人的设置入口验证电脑设置。范围是生成、回放及其夹具，使用隔离 Home。

基线 `5bfd52b87b` 的两次常速生成中，一份多了 `memory_markers.upkeep`，对应的 Prologue `queued-tasks` 记录从版本 1 变为 3。记忆服务首次启动把整理排在固定时钟的一分钟以后。Prologue 用真实的单次定时器唤醒，触发时把预定时间直接交给队列，生成器冻结 `Date` 也无法挡住这次运行。生成期间保留队列写入和原来的到期时间，暂停未来任务的唤醒。立即到期的任务与请求超时仍走真实定时器。慢机回归同时加速这次一分钟唤醒和宿主的周期任务。

在 macOS 的根 Home 通过电脑设置入口写一条合成禁用应用，保留关闭状态。回放继续核对已收录的文件版本，macOS 通过设置入口匹配保存值，Linux 把这项列入 `not_run` 并从实际读取计数排除，旧金样缺少设置时报告 `absent`。沿用现有第三方样本的回放与报告机制。用同一生成命令刷新未发布的 `0.1.0` 金样，保留已有中间版本的升级输入。验证后从覆盖缺口和待办清单销账。

## 验收标准

1. **GDC-01** `tests/golden-home.test.ts` 的常速与模拟慢机两条用例逐字节一致。有签名样本的 `0.1.0` 通过 `golden-home.mjs check`。
2. **GDC-02** macOS 从已还原的 `computer/settings.json` 读到合成禁用应用。Linux 路径报告 `computer-settings` 为 `not-run`，旧金样缺少文件时报告 `absent`。
3. **GDC-03** [人工] `node scripts/replay-golden-homes.mjs --all` 在锁定运行时通过。覆盖检查能从 `0.1.0` 清单找到 `computer/settings.json`，两条 BL 的处置和证据可查。
