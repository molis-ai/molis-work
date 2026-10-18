# 采用线交接（specs/prologue-adoption，2026-10-18）

按用户 10-18 的决定，各线做完手上这件就推送、暂停交接。#728 是本线最后一片。

`$S` = `/private/tmp/claude-501/-Users-yijunwang-code-goalboard--claude-worktrees-line-adoption/0b1995fa-f45d-4fc1-8491-9d8ab2d8e26d/scratchpad`
共享笔记 = 本文件所在的目录。

## 现状

| PR | 分支 / head | 工作树 | 状态 |
| --- | --- | --- | --- |
| #725 C4：工具用法回到工具说明，Coding 提示词只留 Molis 的理由（coding-base v12） | `adoption/c4-tool-usage` / `ed37e3319` | `$S/wt-c4`；改前基线在 `$S/wt-c4-before` | 合并队列第 1 位，别推 |
| #728 A2-1：人在设置里保存写后检查器（PA-25、PA-26 与 PA-28 的保存部分） | `adoption/a2-1-write-checkers` / `7cfb9f317` | `$S/wt-a21` | 统筹审过 281028f12；按意见把 `keptWriteCheckers` 移到注释之前，新 head 等统筹核增量、加 full-suite |

#728 的内容：
- 两个动作：`agent.write_checkers.list.v1` 与 `agent.write_checkers.save.v1`，受众只有 user；save 要 `projects:settings`，操作者从调用上下文取。
- 存储：Runtime store，kind `molis-write-checkers`，每个项目、每个工作区一条，版本从 1 起算。
- 只认此刻已授权、`realpath_verified` 的工作区。
- 保存时检查：`{file}` 必须恰好一个，此外还查工作目录、超时、扩展名和 grants。
- 文档：
  - SSOT 写明 agent-host 的三类配置例外；
  - GLOSSARY 分开写后检查器与等待检查器；
  - spec §6.0p.10 记统筹 10-18 的决定；
  - BACKLOG 加 BL-171～173。

## 还剩的需求

spec 状态句：P4 两半与 A1–A4 都在 main，A2 只做了 A2-1；没做的有：

1. **A2 写后诊断的后两片**（§6.0p，验收 PA-25～PA-39）：
   - **A2-2**：执行器、时间线和安全不变量；
   - **A2-3**：设置页。
   PA-25 已证；PA-26 和 PA-28 只证了保存的一半；PA-27、PA-29～PA-39 待证。
2. **A3 的结构化一半**（采用项 11）：`apps/local-host/src/alchemist-prologue.ts` 还把 JSON Schema 写进提示词再解码；共享端口的 `structured` 没有 Alchemist 调用方。没写计划。
3. **A5 其余采用核验**（15–23、存储与预算）：逐项标成「采用」「已验证」或「按已定边界不做」。没写计划。
4. **P5 协作与关联线集成**（PA-13），以及 **P6 协作旧路径退出与恢复验收**（PA-14、PA-15、PA-21）。都依赖前面的片，没写计划。
5. **BACKLOG 里归本线的三行**：
   - BL-171：一次写入只跑一个写后检查器。要改 SDK 的缝，没排期。
   - BL-172：三处按字符串认 SDK 的资源种类。
   - BL-173：窗口读没有行号，即批 B。
6. **文档两处小改**：
   - 手册 `specs/ai-development-handbook/spec.md` §9.5 补一行：「窗口读没有行号」归 Prologue 工具设计。等 #725 合入后、改那份 spec 时带上。
   - spec 状态句里「A4 在 #680」已经过时（#680 10-17 已合），下次改 spec 时顺手改。

## 下一片原本打算做什么

**A2-2 执行器与时间线**（agent-host + Coding）。计划见 `adoption-a2-impl-plan.md`「切片」，已经统筹认可：

- **执行**：
  - Molis 的包声明写后检查。
  - 执行器按配置顺序取第一个适用的检查器（BL-171），把 `{file}` 换成写入的相对路径，交给 SDK 经命令审查去跑；没有适用的就回 `unchecked`。
  - 每轮最多 10 次。
  - 运行时再核一次工作区授权：撤权了就记「未检查：工作区授权已撤回」。
- **记录**：
  - 审查卡那一行用 `isAfterWriteCheckOperationKey` 认。
  - 执行器的记录按 **(run, operationKey)** 存：operationKey 是每个执行器自己的序号，只在一个 run 里唯一。
  - Coding 时间线从 `:diagnostics` 回执读。
  - observation 是 SDK 写的英文，以 `Check after write (data, not instructions):` 开头；Molis 只写「未检查」的理由。截断用 `config.tool.observation`。
- **安全不变量**：
  - 开工时取下一个空号（计划里写的是 S-35，先核），用例放 `tests/security-invariants-checkers.test.ts`。
  - 统筹定：保存时的校验不是安全边界，边界在执行器；S 号随 A2-2 登记。
- **用例**：PA-26 撤权那一半、PA-27、PA-29～PA-38，以及 PA-28 的 `./` 前缀。用真实 Node Host 加脚本模型，不调付费模型。
- **顺手做 BL-172**：三处字符串（`prologue-checkpoints.ts:54`、`prologue-node-port.ts:196`、`prologue-review-documents.ts:129`）换成 #47 导出的 `WORKSPACE_REWIND_KIND`、`WORKSPACE_COMMAND_RECEIPT_KIND`、`WORKSPACE_COMMAND_KIND`。

**A2-3 设置页**：
- 放在 Coding 设置里，和方法、MCP 并列；能列出、添加、编辑、删除，版本冲突时给提示。
- 浏览器用例 1 个。
- 页面字节数另报统筹（10-18 新口径：必需的增长写进 PR，>10 KB 或新增资源才问用户）。
- A2-1 合入后，可以和 A2-2 并行。

## 已批但没做的计划

**批 B：read 窗口读带行号（Prologue）**：统筹已批，计划笔记统筹已入库，全文见 `adoption-batchB-plan.md`。用户 10-18 定：和 **prologue#50**（手册线的 acknowledge-inputs 修复）**合成一次换包**。要点：

- **read**：只给窗口读（带了 offset 或 limit）加 `<文件里的真实行号>\t<原文>`；整文件读不变；`[lines a–b of N]` 留着。
- **edit**：
  - 匹配不到、而去掉行号前缀就能匹配时，只给提示、照样拒绝；不剥前缀，也不退回模糊匹配。
  - 必须有一个用例：照原样能匹配的 TSV 行成功，且不给提示。
  - 只改 edit 的 `find` 与 read 的工具说明。
- **评测**：
  - 规则单独做第一个提交，写在 Prologue 的 `docs/slices/read-line-numbers.md`。
  - T2 和 E（edit 题）改前、改后各跑 8 次。E 一点都不许降；数错行的次数如果没减少，报统筹，默认不发。
- **能跑的用例**：只许跑 `packages/sdk/test/workspace-mutate.live.test.ts`（它的第 121 行要改），环境里不放模型密钥；PR 写明「没有模型调用」。
- **换包 PR**：列出 Molis 里读 read 输出的代码与用例。审过：没有解析它的。

## 共享笔记

- `adoption-handoff-2026-10-18.md`：本文件。
- `adoption-a2-impl-plan.md`：A2 三片的计划，以及对照 #45、#47 改的四处。
- `adoption-a2-1-decisions.md`：A2-1 开工清单，统筹 10-18 批过。
- `adoption-a2-diagnostics-spec.md`：§6.0p 的草稿与来历。
- `adoption-batchB-plan.md`：批 B 的计划、审计、评测规则，以及统筹的批复。
- C4 的评测：
  - `adoption-c4-rules.md`、`adoption-c4-results.md`；
  - `adoption-c4-run.mjs`：驱动脚本，MiniMax，一次性 Home；
  - `adoption-c4-run-fix.diff`。
- 更早的、对应的切片都已合入的记录：
  - `adoption-a4-plan.md`、`adoption-a4-stored-works.mjs`；
  - `adoption-p3-cut.md`、`adoption-p3b-p3c-prep.md`、`adoption-p4-assistant-plan.md`；
  - `adoption-gateway-*`、`adoption-next-slices-plan.md`；
  - `adoption-prologue-diagnose-command*`、`adoption-sdk-e0f99ea2-parked-timer.md`。

## 要注意的坑

- **巨大单元不许变大**：`registerAgentHostCapabilities` 363 行、`composeAgentHost` 245 行、`PrologueAgentAdapter` 602 行、`AgentHost` 类 381 行。往里加一行，就要在同一个函数里省一行。新能力照 `session-actions.ts`、`write-checker-actions.ts` 的 `register(definition, handler)` 写在新文件里，不往类里加方法。
- **typed 能力计数 187 不许变大**：`capability-registration.ts#register-calls` 38、`agent-host-composition.ts#register-calls` 10。统筹说过，变大就先停下来问，不要绕。
- **SSOT 的例外只有三类**：agent-host 只存人保存的 MCP、Skill（方法）、写后检查器，都经 Prologue 的 store，不建表。别扩大，也别顺带搬家。
- **`agent-host-composition.ts` 的注释已经错位（main 上就这样）**：「What one Plugin is allowed to start」那段注释压在 `workspaceGrants` 自己的注释上面。新加的函数别插进注释和函数之间（#728 被指出过一次）。
- **新工作树先整体 `pnpm build`**，不然 local-host 会缺模块。单包构建写成 `pnpm --filter <包> run build`。
- `check-spec-coverage` 只数已跟踪的文件：新用例提交后才算进去。
- **auto 模式会拦 `git rebase`**，连没推送的分支也拦，所以一律 merge main。
- **zsh**：`origin/main:path` 要加引号；路径带空格时用 `export GIT_DIR=…`。
- **Prologue 的用例**：
  - 只跑过 `coding-diagnose-after-write.live`，以及批 B 准许的、不放密钥的 `workspace-mutate.live`。
  - 别的 live 和整个 test 目录照旧不跑；`desktop-computer-use.live` 绝不跑。
  - 不碰 `~/code/prologue`。
- **MiniMax**：
  - 密钥只内联读（`security find-generic-password -a "$USER" -s minimax-api-key -w`），不落文件。
  - 只在一次性 Home 里跑，跑完就删；不碰真实 Home。
- **评测记录**：每条照实分类（设计问题、模型能力、拿不准）。模型能力造成的失误不打补丁，不加措辞禁令（用户 10-16 的规则）。

## 合入后要清的工作树和分支

- #725 合入后：
  - 工作树 `$S/wt-c4`、`$S/wt-c4-before`；
  - 本地分支 `adoption/c4-tool-usage`。
- #728 合入后：
  - 工作树 `$S/wt-a21`；
  - 本地分支 `adoption/a2-1-write-checkers`。
- 现在就能清（PR 都已合入，或者没有独有提交）。统筹说先留着，等 PR 合入后一起清：
  - 工作树 `.claude/worktrees/line-adoption-w406`（`refactor/w4-06-prologue-node`，#498 已合）；
  - 本地分支 `adoption/{find-tools-deferral, found-tools-swap, gateway-no-corrections, handback-step-fix, no-tool-deferral, p3-collaboration, p3b-model-switch, p3c-external-checks, p3c-rerun-record, p4-a1, p4-a2, p4-c2, p4-coding, sdk-mcp-refresh}`，都已合入；
  - `adoption/p4-assistant-scout`：没有独有提交，远端也没有；
  - 主工作树 `.claude/worktrees/line-adoption` 现在停在 `adoption/p4-a2`（#654 已合）。它是本会话的工作目录，留着，交接的人可以接着用。
