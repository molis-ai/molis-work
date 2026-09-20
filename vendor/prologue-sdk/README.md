# Prologue SDK 构建来源

当前依赖为 `prologue-sdk-0.0.0-rc.1-approved-receipts.tgz`，用于 Coding 的持久命令回执、MCP 资料范围与分页、未声明工具纠正，以及文件批准和落盘状态。

- 源仓库：https://github.com/molis-ai/prologue
- 来源分支：`codex/molis-coding-receipts`
- 源码提交：`46d8092e6057370012e8148c792d587f62a01275`
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`852620648243866d755d0b733fbc8354e6cee2eb26b7c9bafa3f077025ead14a`

2026-09-20 提交整理时重新运行 SDK 构建和类型检查，tarball 内全部 496 个 `dist/` 文件与重新构建结果及 Molis 实际安装目录逐字节一致。相关真实 Node Host 与执行行为回归 205 项通过；原全量回归的 2 个代理 DNS 失败仍保留，不声称全量通过。该包是本仓库固定的本地依赖，未发布到 npm；依赖声明、锁文件和 workspace inventory 配套引用。

历史已提交包 `prologue-sdk-0.0.0-rc.1-command-feedback.tgz` 对应源码 `8d590818e32534880984f9e84e1efd005caa105a`，SHA-256 为 `302c81c049c8a1250a47aff9a5aa5f3fe862e409369f6697c5359b9b7cf2ae81`，保留用于回溯。
原 `prologue-sdk-0.0.0-rc.1.tgz` 缺少对应源码提交记录，不能当作上述提交的构建。其余本地中间包不是当前依赖，也不作为本次提交的分发物。
