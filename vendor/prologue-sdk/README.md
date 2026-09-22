# Prologue SDK 构建来源

当前依赖为 `prologue-sdk-0.0.0-rc.1-neutral-agent-prompt.tgz`。在原中断恢复、过程/补充要求持久化、整理用量基础上，移除 SDK Agent 循环强加的本地项目检查人格和固定 `list/search/read` 流程。任务方式仍由 App 与已选 Character 提供，工具权限与审批不变。

- 源仓库：https://github.com/molis-ai/prologue
- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`52c49cf5095e67cd62f4db9e9c1d515afa68ddd8`
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`cd2bf974c609fe5277313e876857a61b2b03cc79ee5be6b12a37a5f3cb1b6000`

包内全部 500 个 dist 文件与 SDK 构建、实际安装逐字节一致。SDK build/typecheck 与 61 项定向检查通过，全量 3256 项为 3234 通过、20 跳过、2 个既有 DNS 失败。Molis 正式 MiniMax 同条件 v3 角色实操仍先申请 `ls`、两次审批；本次不宣称减少人工介入，完整证据见 Coding spec。未发布 npm 或替换正式安装版。

## 历史包

上一个依赖为 `prologue-sdk-0.0.0-rc.1-compaction-usage.tgz`，包含中断恢复、过程与补充要求持久化，以及上下文整理用量归属。整理请求通过同 Runtime 的原回执加入父 Run 小计与本轮预算，不重复写入 Runtime 总账。

- 源仓库：https://github.com/molis-ai/prologue
- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`a8ac8e1eb7362a2189973cbe7aaa4f4624649ee0`（基于 `46d8092`，本次将恢复、过程、补充要求与整理用量改动一并提交）。打包字节未因提交而改变。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`a6dcf44718152403d5194fde7df0af0cad34b8d280e9a455bb744b0b3d147322`

该包全部 500 个 dist 文件与 SDK 构建、tarball 和实际安装逐字节一致，见 c9-compaction-usage-sdk-consumer.json。正式 MiniMax 长任务已验证整理请求进入合计，报告与完整会话投影重启不变；SDK 最终 3254 项仅两个既有 DNS 安全拒绝失败。详见原 Coding spec，本包未发布 npm。

2026-09-21 核对 tarball 内全部 500 个 `dist/` 文件，与 SDK 构建结果及 Molis 实际安装目录逐字节一致；最新复核证据 `c10-sdk-consumer.json`。依赖声明、锁文件与 workspace inventory 配套，未发布 npm。恢复只按原 Run/Effect/Pending 的权威事实收口，不调用模型、不重放操作；未知结果仍阻塞，已保存的流式前缀可读，未报告的末尾过程和完整用量不补造。补充要求写入原 Run 后才返回接收回执，应用事件仅表示加入后续上下文。真实进程与模型请求的相关验证通过，完整工程与产品验证及剩余边界见 `specs/coding-plugin/spec.md`，不以打包成功宣称完整恢复通过。

已提交的 `prologue-sdk-0.0.0-rc.1-approved-receipts.tgz` 对应上述基线提交，SHA-256 `852620648243866d755d0b733fbc8354e6cee2eb26b7c9bafa3f077025ead14a`，保留用于回溯。

历史已提交包 `prologue-sdk-0.0.0-rc.1-command-feedback.tgz` 对应源码 `8d590818e32534880984f9e84e1efd005caa105a`，SHA-256 为 `302c81c049c8a1250a47aff9a5aa5f3fe862e409369f6697c5359b9b7cf2ae81`，保留用于回溯。
原 `prologue-sdk-0.0.0-rc.1.tgz` 缺少对应源码提交记录，不能当作上述提交的构建。其余本地中间包不是当前依赖，也不作为本次提交的分发物。
