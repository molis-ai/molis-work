# BL-seatbelt-tests-unrun

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-seatbelt-tests-unrun | 只在 macOS 跑的沙箱用例（`process.platform !== 'darwin'` 就跳过，如 `agent-built-plugins-*`、`agent-studio.e2e`；`full-suite` 按 `scripts/ci-linux-probe/select.mjs` 用 `--skip-macos-only` 略过）现在没有地方跑：CI 和 `full-suite` 都在 Linux 上，CI 里的 macOS 任务只跑 Rust 和 Swift 检查；开发机的 Homebrew Node 又起不了沙箱（BL-seatbelt-dynamic-node）。#1908 碰到 7 个这样的用例，#1910 的 `test:security` 比对里也有一批，都只能写「没跑过」，不能算过 | [#1908](https://github.com/molis-ai/molis-work/pull/1908)、[#1910](https://github.com/molis-ai/molis-work/pull/1910) | 已知缺口 | 要跑就得改 CI 或换开发机的 Node。改 CI 要用户同意，GitHub 的 macOS 机器又常排不上（用户 2026-11-04 因此让 macOS 任务按改动跳过）。开发机换 Node 随 SQLite 第二步发生，到时先在开发机上跑一遍，看积了多少失败 | SQLite 第二步（锁 Node） | 中 | 工程流程（执行会话待分配） |
