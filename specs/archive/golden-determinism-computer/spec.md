# 金样生成确定性与电脑设置回放

> 归档（2026-11-23）：判定为**已实现**。常速和模拟慢机生成逐字节一致，三份金样回放通过。macOS 经设置入口读回电脑设置，模拟 Linux 明确报告该项未运行。 [PR #2273](https://github.com/molis-ai/molis-work/pull/2273)

状态：工程验证通过（2026-11-23，Codex）。

在最新 `origin/main` 的独立工作树处理 BL-golden-generation-nondeterministic 和 BL-golden-computer-settings。依照 [金样回放设计](../../upgrade-continuity/golden-replay-design.md) §2、§5 和 [#1743 的复现记录](https://github.com/molis-ai/molis-work/issues/1743#issuecomment-6847046532)，用 `.nvmrc` 的 Node 24.15.0 与内置 SQLite 3.51.3 复现两条 UPG2-02，再从生成步骤定位并控制漂移源。以实际还原出的文件和主人的设置入口验证电脑设置。范围是生成、回放及其夹具，使用隔离 Home。

基线 `5bfd52b87b` 的两次常速生成中，一份多了 `memory_markers.upkeep`，对应的 Prologue `queued-tasks` 记录从版本 1 变为 3。记忆服务首次启动把整理排在固定时钟的一分钟以后。Prologue 用真实的单次定时器唤醒，触发时把预定时间直接交给队列，生成器冻结 `Date` 也无法挡住这次运行。生成期间保留队列写入和原来的到期时间，暂停未来任务的唤醒。立即到期的任务与请求超时仍走真实定时器。慢机回归同时加速这次一分钟唤醒和宿主的周期任务。

在 macOS 的根 Home 通过电脑设置入口写一条合成禁用应用，保留关闭状态。回放继续核对已收录的文件版本，macOS 通过设置入口匹配保存值，Linux 把这项列入 `not_run` 并从实际读取计数排除，旧金样缺少设置时报告 `absent`。沿用现有第三方样本的回放与报告机制。新样本用 `0.1.1-dev.8` 入库。现有 `0.1.0` 是唯一的 Agent 定义库 v1 样本，继续供 v1 → v2 → v3 链回放。验证后从覆盖缺口和待办清单销账。

## 验收标准

1. **GDC-01** `tests/golden-home.test.ts` 的常速与模拟慢机两条用例逐字节一致。带签名样本的新金样通过 `golden-home.mjs check`。
2. **GDC-02** macOS 从已还原的 `computer/settings.json` 读到合成禁用应用。Linux 路径报告 `computer-settings` 为 `not-run`，旧金样缺少文件时报告 `absent`。
3. **GDC-03** [人工] `node scripts/replay-golden-homes.mjs --all` 在锁定运行时通过。覆盖检查能从最新金样清单找到 `computer/settings.json`，两条 BL 的处置和证据可查。

## 基线证据

- Node 24.15.0、SQLite 3.51.3、macOS。原测试的首次定向运行 2/2 通过，说明这次未踩中时序差异。
- 保留该次首份样本，另一次常速生成与它相比，根 Home 的 `memory_markers` 从 9 行变为 10 行。队列记录、记忆库转储和清单均有差异。
- 在修复前用扩展后的慢机夹具加速 Prologue 单次定时器，`golden-home.mjs check` 退出 1。根与账号 Home 的 `queued-tasks`、`memory_markers` 均报告 `golden.differs`，清单也不同。

## 验证结果

- **GDC-01** 分支同步到 `origin/main` `8192cc7b10` 后，使用 Node 24.15.0、SQLite 3.51.3、pnpm 11.9.0 完成构建。`node scripts/run-tests.mjs --jobs 1 tests/golden-home.test.ts` 44/44 通过，含常速与模拟慢机比较。`node scripts/golden-home.mjs check --version 0.1.1-dev.8` 报 `identical, 3113110 bytes`。
- **GDC-02** macOS 实际从设置入口读回合成禁用应用。删除该记录并更新测试金样的摘要后，回放报 `golden.versioned_file_lost`。Linux 分支通过 `pretend-linux.mjs` 核对，JSON 的 `steps.computer_settings` 为 `not-run`，`not_run` 列出 `computer-settings`。CI 摘要与 notice 的测试通过。原生 Linux 未运行。
- **GDC-03** `node scripts/run-tests.mjs --jobs 1 tests/golden-coverage-gate.test.ts` 10/10 通过。最新清单记录 `format.computer.settings` v1，`uncovered` 已去掉这一路径。两份旧金样仍提供升级输入。`node scripts/replay-golden-homes.mjs --all` 在 macOS 退出 0，见下表。运行中有 Node `TimeoutOverflowWarning`。

| 金样 | 读 | 写 | 签名插件与 Home 库 | 电脑设置 |
| --- | --- | --- | --- | --- |
| `0.1.0-dev.1` | 166 | 37 | `absent` | `absent` |
| `0.1.0` | 529 | 65 | `replayed` | `absent` |
| `0.1.1-dev.8` | 529 | 65 | `replayed` | `replayed` |
