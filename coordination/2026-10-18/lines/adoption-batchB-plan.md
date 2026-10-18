# 批 B：read 窗口读带行号（采用线草稿，2026-10-18；未开片，未写代码）

## Prologue 的现状（3adc5e87）

- read：`packages/sdk/src/composition/core/system-tools-workspace.ts` 第 124–133 行。窗口读返回 `${held.text}\n[lines a–b of N]`，整文件读返回原文。
- edit 匹配不到：同一文件第 156 行，`TOOL_ARGUMENTS_INVALID` "That exact text is not in the file."，用 `current.includes(find)`，换第一处。
- 工具说明：`packages/sdk/src/tool/core/system.ts` 第 341 行（read）、第 346–347 行（offset、limit）、第 397 行（edit 的 find："Exact text to replace."）。
- Prologue 里钉住窗口读输出的只有一处：`packages/sdk/test/workspace-mutate.live.test.ts` 第 121 行，要改。这个文件不调模型（用 `createNodeHost` 和真实文件），但名字是 live，按规矩不跑，要统筹准许只跑这一个文件。
- 描述文字没有用例断言。

## 改法

1. 只改窗口读（带了 offset 或 limit）：每行写成 `<文件里的行号>\t<原文>`，号从 `held.window.firstLine` 起数。整文件读不变。
2. 末尾的 `[lines a–b of N]` 留着。理由：
   - 总行数 N 和「窗口超出文件末尾（no lines）」只有这一行能说出来，行号说不出来；
   - 删掉就多改一件事，与「改动越小越好」相反。
3. edit 匹配不到时，把 find 每行开头的 `^\d+\t` 去掉再试。去掉后不同、而且文件里有这段，错误照旧是 `TOOL_ARGUMENTS_INVALID`，消息加一句：这段文字的行首带着 read 显示的行号（如 "2400\t"），行号不是文件内容，要去掉。
   - 只提示，不替它去掉，不兜底匹配，文件不变。
   - 去掉后仍然对不上，消息与现在一样。
4. 说明：
   - edit 的 find：从文件里原样照抄，不含 read 在行首显示的行号；
   - read 的说明加半句：窗口里每行先写它在文件里的行号，再一个制表符。
   - 不改 Molis 的提示词。
5. 用例：新文件 `packages/sdk/test/read-line-numbers.test.ts`，用 `createMemoryHost`，照 `coding-diagnose-after-write.test.ts` 的写法。逐条：
   - 窗口读的号是文件里的真实行号（offset 5 时第一行是 `5\t`）；
   - 整文件读不变；
   - 结尾行留着；
   - 带前缀的 find 被拒，提示的话对，文件逐字节不变；
   - 去掉前缀也对不上时，消息不带提示；
   - 文件里本来就有 `12\tfoo` 这种行（TSV）时，照常匹配、照常改。
6. 文档：`docs/slices/read-line-numbers.md`。判定规则是第一笔提交，在第一次模型调用之前；结果后加。

## Molis 里有没有在解析或断言 read 的输出（main d9a58f37f）

没有解析的地方。列给换包 PR：

- `horizontal/agent-host/src/adapters/prologue-stream.ts` 第 357 行 `noteToolResult`：把工具结果的文字照抄进 `activity.output`（前 16,384 字），不解析。
- `plugins/native/coding/src/timeline.ts` 第 95–114 行：时间线把输出的前 24 行原样放进 `<pre>`。窗口读以后会显示行号和结尾行，只是显示。
- `plugins/native/coding/src/timeline-words.ts` 第 59 行 `toolHint`：只按错误码认，`TOOL_ARGUMENTS_INVALID` 不在里面，edit 的新提示不影响它。
- `apps/local-host/src/assistant/assistant-service.ts` 第 265 行：只把工具名 read 映射成 file-read。
- 用例：Molis 没有一个用例做窗口读（没有带 offset 或 limit 的 read），也没有断言 read 输出的文字。约 23 个用例脚本里调 read，都是整文件读，输出不变。

## 评测（照 C4）

- **两版**：同一份 Molis（开片时的 main），只换 SDK。
  - 改前：仓库里的 3adc5e87 包；
  - 改后：另一个工作树，本地装 Prologue 分支打的包，不提交。
  - 跑之前核对两版的系统提示（不含工具定义）逐字相同。
- **题**：
  - **T2** 原题：「logs/orders.log 第 2400 行记的是哪个订单号？」日志是同一份 3000 行、约 150 KB，reader 角色。
    - 答对：回答里有第 2400 行的订单号。
    - 「数错行」：读的窗口盖住了第 2400 行，答的却是窗口里别的行。
  - **E**（新）：「把 logs/orders.log 第 2400 行的 status 改成 cancelled，别的行不动。」同一份日志，Coding 的改写角色（`CODING_WRITER_ROLE`，text-edit）；审查由脚本答「允许」，和 C4 一样记下审查次数。
    - 答对：盘上第 2400 行是 `status=cancelled`，其他行逐字节不变。
    - 另记：find 带行号被拒的次数，被拒后有没有改对，改了几次。
- **次数**：每题改前、改后各 8 次。和回答无关的失败（网络、5xx、429、超时）记下来、不计、重跑。
- **判定**（事先写定）：
  - E 改后答对数 < 改前 → 不发。edit 题不许降，没有容差。
  - E 没降、T2 改后 < 改前 → 不发。
  - E 没降、T2 改后 ≥ 改前、而且「数错行」改后比改前少 → 发。
  - E 没降、T2 不降、但「数错行」没有变少（例如两版都是 0）→ 没有证据，报统筹，默认不发。
- 每个没答对的，逐条标「设计问题 / 模型能力 / 拿不准」。另记 token、调用次数、轮数和整文件读被拒的次数，这些只记录，不参与判定。

## 统筹 10-18 批了（开片要等第二个空位：第一个给 A2-1）

- 格式 `<行号>\t<原文>`、末尾那行留着、只提示不替它去掉、判定规则作为第一笔提交：都批了。
- 提示只在「原样匹配不到、去掉前缀后正好能匹配」时出。用例里要有一条：文件本身有「数字+tab」开头的行（TSV），find 原样就能匹配，这时 edit 照常成功、不出提示。
- 判定照写的办：E 题一次都不许降，没有容差；数错行没有变少就报统筹，默认不发。
- 准只跑 `packages/sdk/test/workspace-mutate.live.test.ts` 这一个文件，前提是它确实不调模型、不联网：
  - 跑的时候环境里不放任何模型密钥（用 `env -u` 去掉，或用干净的 env）；
  - 跑完在 PR 里写一句「没有模型调用」。
