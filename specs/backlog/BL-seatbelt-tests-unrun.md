# BL-seatbelt-tests-unrun

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-seatbelt-tests-unrun | 沙箱和已签名包的用例没有固定跑的地方：CI 和 `full-suite` 都在 Linux 上，它们在那里跳过或被 `--skip-macos-only` 略过；CI 里的 macOS 任务只跑 Rust 和 Swift 检查。本机换一份只链接系统库的 Node 能跑（`~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`，见 [第 02 批](../post-anticorruption-roadmap/reference/batches/02.md)），但没有人按例跑，它也只是别的工具的缓存，靠不住。#1908 的 `security-invariants-plugin-project-database`、`security-invariants-sandbox-signed-resources` 就是这样的用例 | [#1908](https://github.com/molis-ai/molis-work/pull/1908)、[#1910](https://github.com/molis-ai/molis-work/pull/1910) | 已知缺口 | 要固定下来就得改 CI，或定一个开发机上按例跑的步骤。改 CI 要用户同意，GitHub 的 macOS 机器又常排不上（用户 2026-11-04 因此让 macOS 任务按改动跳过）。SQLite 第二步会把开发机换成官方 Node，到时再看哪种便宜 | SQLite 第二步（锁 Node） | 中 | 工程流程（执行会话待分配） |
