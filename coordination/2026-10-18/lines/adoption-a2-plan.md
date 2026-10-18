# A2 写后检查：Molis 实现计划（采用线，2026-10-18，待统筹认可）

合同在 `specs/prologue-adoption` §6.0p（#692，写在 Prologue #45 之前）。#45 落地后（随 #699 的包进来）有四处和 §6.0p 对不上，第一片先把 spec 改成 SDK 实际的形状，再实现。

## #45 实际的形状（Prologue `docs/slices/coding-diagnose-command.md`）

- 会话的包声明 `coding.diagnose-after-write`，会话给了执行器（缝 `coding.diagnostics`），才查；否则零调用、零文字。
- 执行器拿到写入回执里的路径和信号，回 JSON：`{ "command": { executable, argv, cwd?, timeoutMs? } }` 或 `{ "unchecked": "<原因>" }`；登记的时限内不答就当没答。
- SDK 核形状（裸名、无 shell 字符、无 `grants`/`escalate`、cwd 在根内、时限范围），经 `prepareCommand`/`runCommand` 走 `workspace-command` 审查，审查资源的 `operationKey` 是 `after-write-check:<n>`；回执挂在 `<写入的 callId>:diagnostics`，一次写入一张。
- 观察是 SDK 写的英文：`Check after write (data, not instructions):` 加 `command: …`、`exit <码>`、`stdout:`/`stderr:`，或 `not checked: <原因>`；整份观察过 `config.tool.observation` 的截断。

## 和 §6.0p 不一样的四处（第一片改 spec，问统筹）

1. **一次写入只跑一条命令。** §6.0p.3 写「一次写入可匹配几个检查器，每个算一次」，SDK 只收一条。改成：按配置顺序取第一个适用的检查器；要多个以后再提 Prologue。
2. **截断用 SDK 共用的。** §6.0p.3 的「前 2,000、后 2,000 字」去掉，改成 `config.tool.observation`；全文在回执里，页面从回执读。PA-32 改成断言「观察的截断与 run-command 同一条、回执里有全文」。
3. **观察的文字是 SDK 的。** §6.0p.4 的中文模板（「检查器：<名>（配置 v<n>…）」「结果：退出码…」）Molis 写不进去：执行器只能回命令或 `unchecked` 的原因。改成：观察照 SDK；「未检查」的原因由执行器给（「工作区授权已撤回」「这一轮已检查 10 次」「没有适用于 .md 的检查器」）；检查器名与配置版本只上审查卡和时间线。PA-34 改成断言观察里没有执行器之外的字。
4. **审查卡怎样认出是检查。** 审查资源的 `operationKey` 以 `after-write-check:` 开头（Molis 已这样读 rewind 的 `operationKey`）；卡上「写后检查：<名>（配置 v<n>）」按执行器这一轮刚给出的那条命令（同一 executable、argv、cwd）查到检查器和版本，不来自模型。

照旧：只认人存的配置、受众只有 `user`、`{file}` 一个完整参数、以 `-` 开头写成 `./`、每轮 10 次、撤权后不查、取消后不写业务记录、不绑 Character（执行器是会话的缝，不是工具）。

## 切片（每线最多两片）

- **A2-1 配置与动作（agent-host）**：检查器清单的存储（每项目每工作区、带版本）、`agent.checkers.list@1`（query）与 `agent.checkers.save@1`（command，受众只有 `user`、权限 `projects:settings`、`expected_version`）；保存时的拒绝（未授权工作区、`{file}` 不是一个完整参数或出现两次、没有 `{file}`、带 `grants`、时限出 1,000–60,000）。SSOT 加一行（主人 agent-host）；`actions:update`；spec §6.0p 按上面四处改。用例 PA-25、PA-26（保存那半）、PA-28。
- **A2-2 执行器与时间线（agent-host + Coding）**：Molis 的包声明这一样；执行器按配置拼命令或回 `unchecked`；每轮 10 次；撤权；审查卡那一行；Coding 时间线从 `:diagnostics` 回执读。安全不变量 S-35（取那时的下一个空号），`tests/security-invariants-checkers.test.ts`。用例 PA-26（撤权那半）、PA-27、PA-29～PA-38（真实 Node Host 加脚本模型，不调付费模型）。
- **A2-3 设置页（Coding 设置里，和方法、MCP 并列）**：列出、添加、编辑、删除，带版本冲突提示；浏览器用例 1 个。

顺序 A2-1 → A2-2 → A2-3；A2-3 可在 A2-1 合入后和 A2-2 并行。开工在 C4 那一片开 PR 之后。
