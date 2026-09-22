# Prologue SDK 构建来源

当前依赖为 `prologue-sdk-0.0.0-rc.1-compaction-growth.tgz`。包含下方步骤回报修复，并让一次实际上下文整理后按新增内容达到原阈值再软触发；窗口硬检查和 Provider 明确溢出仍优先。保护内容持续超过软阈值不会逐工具往返重复整理，未缩短的整理也等待新增量；不放宽原文选择校验或丢弃历史。

- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`a7e785b8c76149961d25b2f918aeec55554d8420`（已推送）
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`a00d705a28b94894682a5dea78887ac295e78dfc21fd08e8555307a3400cf61f`

500 个 dist 文件与 SDK 构建、实际安装逐字节一致。SDK 59 项定向、构建、类型通过；全量 3271 项为 3249 通过、20 跳过、原两项 DNS 环境失败，无新增。Molis 构建/边界/类型通过，实际 Node Host 六次读取仅整理一次，原文件与重启后的完整运行投影不变；其余步骤回报与 Character 消费检查通过。MiniMax 返工 completed 且仅一次整理，但读过文件的归属和默认参数覆盖判断仍错误，两步均保存返工评价；完整结果见 Coding spec。Molis 全量仍待复验；未发布 npm 或替换正式安装版。

## 上一依赖：步骤回报

`prologue-sdk-0.0.0-rc.1-step-reports-v2.tgz` 中，`board-report` 允许原 blocked 节点在当前版本解除阻塞到 ready；safe-read 同样经过公开 tool-before hook，使消费 App 的原 Session/Run 归属限制在读取前生效。普通读取不新增 Effect；hook 的拒绝、失败、延后或要求审批均不能偷读。副作用仍走原审批链。

- 源仓库：https://github.com/molis-ai/prologue
- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`d2f5a05df6459440a253787e94ee6520f12d754d`
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`353ea0bc7c6d6d4e32dda43a597b15f60e82aec5c7e3728b35c2ed8326a89f3f`

500 个 dist 文件与 SDK 构建、实际安装一致。SDK build/typecheck、66 项定向通过；全量 3266 项为 3244 通过、20 跳过、两个原有 DNS 环境失败。Molis 真实 Node Host 覆盖原图读取隔离、版本/顺序依赖、blocked 恢复、失败中断与重启零重放。MiniMax 已从正式确认计划按序回报，原评价和返工由 Coding 独立保存；模型准确性与持续整理仍有实际失败，见 Coding spec 本块完整结果，不宣称整个 Goal 完成。未发布 npm 或替换正式安装版。

## 上一依赖：同步子任务等待

上一依赖为 `prologue-sdk-0.0.0-rc.1-child-observe.tgz`。同步子任务先确认原分派回执，再由同一次工具调用等待原子结果；子执行与人工审批不再占用父分派工具期限或 Host 分派许可。子任务预算、审批、取消和拒绝保持，后台分派仍立即返回引用。

- 源仓库：https://github.com/molis-ai/prologue
- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`4d5f874d37287eb2cd87c10a5837013d922555f0`
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`26a0ef1fd3c862949ea0ccc77f26002c639b4971e834179cbfd28e57a5957bd8`

500 个 dist 文件与 SDK 构建、实际安装一致。SDK build/typecheck 与 51 项定向通过；全量 3260 项为 3238 通过、20 跳过、两个原有 DNS 环境失败。Molis 27 项定向通过，包含真实 Node Host 65 秒待审后批准与原结果返回；最终全量 1554 项为 1492 通过、57 个既有失败、5 跳过，零新增失败。

真实 MiniMax 两轮待审分别超过 103 秒、127 秒，拒绝内容错误的提案后父任务收到原子结果，没有超时、许可过期或重派。新 MiniMax 批准写入样本未通过，不能将这些证据解释为模型质量达标。最终八个会话与审查共十六份投影重启保持；详细记录见 Coding spec C13。同步 fork Skill、成果整合、TaskBoard 与完整 Goal 仍未完成；未发布 npm 或替换正式安装版。

## 上一依赖：完整子报告分页

上一依赖为 `prologue-sdk-0.0.0-rc.1-subagent-report-pages.tgz`。在原默认指令修正和恢复能力上，为子任务的有界摘要补上完整最终结果分页。`await-subagents` 的 `reportOffset` 读取本轮原子任务的终态结果，按原 2000 字符页长给出总长与下一页；不灌入思考、工具输出或子聊天过程，不重新执行模型。

- 源仓库：https://github.com/molis-ai/prologue
- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`07ad08a11e3b4a01b9fe877dedff1efba6f4833c`
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`fb62c2951b4d72c53e45d25390c27cdd786eb04610bca9caedd5362ef4ccd2d0`

包内 500 个 dist 文件与 SDK 构建、实际安装逐字节一致。SDK build/typecheck、57 项定向通过；全量 3257 项为 3235 通过、20 跳过、两个原有 DNS 环境失败，零新增。Molis MiniMax 实际读完新子任务的 2500 字符结果（偏移 0、2000），详细证据见 Coding spec C13 与 `subagents-sdk-consumer.json`。未发布 npm 或替换正式安装版。

## 上一依赖

上一依赖为 `prologue-sdk-0.0.0-rc.1-neutral-agent-prompt.tgz`。在原中断恢复、过程/补充要求持久化、整理用量基础上，移除 SDK Agent 循环强加的本地项目检查人格和固定 `list/search/read` 流程。任务方式仍由 App 与已选 Character 提供，工具权限与审批不变。

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
