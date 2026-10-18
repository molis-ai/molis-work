# AI 手册线交接（2026-10-18）

按用户 10-18 的决定，手册线做完 BL-163/T5 这一件就推送、暂停、交接。这份写给接手的人。

## 1. 在途

| 项 | 现在在哪 | 接手做什么 |
| --- | --- | --- |
| prologue#50（`fix/ack-inputs-todo-offered`，head c077dcb3，base 3adc5e87）：`acknowledge-inputs` 只在这一轮收得下时才提 todo；校验认组请求时冻住的那一份 | 统筹审过；退路问题已在 PR 上答复（comment 6249588729：SDK 自己的组装里没有那条路）；等统筹合并 | 合入后删本线 scratchpad 里的 `pro-ack` 工作树和本地分支。换包交给采用线，和 read 行号那片合成一次 |
| Molis 分支 `ai/bl163-ack-eval`（工作树 `.claude/worktrees/ai-handbook-a82ae7`，base main f7f8adbf2）：0d8185deb 规则，35293d52e 开跑前统筹认的补记，5e0589506 乙第一批作废、映射 v2 重跑 | 评测在跑或刚跑完；结果、BL-163 的处理、T5 的删改（如果判删）、新 BL「注入 appRefs 解析器」放进同一个 PR | PR 号已发统筹的话，只剩评审与合并。T5 第一批按规则整批交了统筹（共享笔记 `ai-handbook-t5-batch1.md`），重跑用 `run-b2.mjs`（映射 v2） |

## 2. 还剩的需求

1. **Coding 上小跑一次**（统筹 10-18 定，等 #726 合入后再做）。规则已提交在 `specs/ai-development-handbook/spec.md` §9.5「BL-163 与 coding-base 补充半句」的末段：
   - 用当时 main 的构建，Coding builder 角色原样（#726 后它列了 `acknowledge-inputs`）；
   - 任务「给 src/math.js 里每个导出函数加一行 JSDoc 注释。」；
   - S1–S4 是 Coding 版的四种补充，每种 4 次，共 16 次；
   - 和甲 A0-后同种补充按比例比，差不到 3 跑就算结论适用于 Coding。
   - 脚本：拿 `ai-handbook-eval-163/` 里 `run-a.mjs` 的计数部分，接上 `eval-ref-run.mjs`（#723 计数用的）那套 Coding 入口（AgentHost + Prologue 适配器 + `codingAgentManifest`，第一次回复压住、补充用 `adapter.inputs.send`）。#726 之后不用在内存里给角色补工具。
2. **holdFinish 要不要设**（统筹在 BL-163 结果出来后定，另一片）。
   - 现状：Molis 没设 `inputReminders`，SDK 默认 max 2、holdFinish false。
   - 甲里「一次都没说明就收工、运行时也没机会提醒」的跑单列成一类，计数在 §9.5 的结果里。
   - 要设的话改 `horizontal/agent-host` 组装 Prologue 的地方，带同一套评测。
3. **手册 §10 补充（ADH-19 至 ADH-23）没写进正文**。
   - 涉及：Skill 包的渐进披露、从一次真实过程生成 Skill、评测循环、作者侧校验。
   - spec 有了（#718），但 `docs/platform/PROLOGUE-AI.md` 和 `skills/molis-prologue-ai/SKILL.md` 里一句都还没有。
   - ADH-23 要一个开发者真的照着用一次。
4. **`default` 的措辞与 PR B**。
   - 措辞：`skills/molis-plugin-dev/elements.md:161` 写「`default` 是开新一轮时已经选上的」，`docs/platform/PROLOGUE-AI.md:206` 写「一开始就选上的方法」。
   - 现状：宿主现在不读 `skills.default`，只有 SDK 在解析 Manifest 时检查（`packages/plugin-sdk/src/agent-declarations.ts`）。
   - 来源：防腐 spec §10.16 第 1866 行把这件交给手册线。PR B 之前把两处改成「宿主开轮时按它选上（PR B 起）」，或者和 PR B 一起合。
   - PR B（宿主开轮时按用途选上默认方法）还没开。
5. **BACKLOG 里本线留下的行**（做完就删行）：
   - BL-145：助理主工作正好 20 个工具，碰到 `deferToolSchemasBeyond: 20`；
   - BL-146：「记住」一类的事实有几个主人；
   - BL-149：Issues 的方法写着宿主的用法；
   - BL-163：这个 PR 处理；
   - 新增的「注入 appRefs 解析器」：这个 PR 登记。
6. **手册的用户验收**还没做（spec 状态句写着「用户验收未做」），之后按 `specs/README.md` 归档。

**原本的下一片与已批计划**

- 已批、没开工：Coding 小跑（上面第 1 条，统筹 10-18 定）。
- 本片之后原本没排下一片：清单做完了，#698 之后手上只有这一件评估。
- 候选按轻重排：
  1. `default` 措辞（第 4 条），小的文档改动，防腐复查点名给本线；
  2. holdFinish（第 2 条，等统筹定）；
  3. 手册 §10 正文（第 3 条，没写计划，开工前先发统筹）；
  4. BL-145/146/149 各自的主人线。

清单（共享笔记 `ai-handbook-inventory.md`）A1–D4 都已合入。C4 的 Molis 半边归采用线。D3 是安全边界，不清理。

## 3. 评测脚本与笔记在哪里

- **脚本**：共享笔记目录 `ai-handbook-eval-163/` 有 `run-a.mjs`（甲，助理）、`run-b.mjs`（乙第一批）、`run-b2.mjs`（乙映射 v2）、`drive-a.sh`、`drive-b.sh`（`RUNNER=run-b2.mjs` 选第二版）、`count.py`、`b-batch1.jsonl`、`eval-ref-run.mjs`（#723 的 AGENT_INPUT_REF_REJECTED 计数，Coding 入口）。
  - 本线 scratchpad（`/private/tmp/claude-501/…/scratchpad/eval-163/`）是会话专用的，可能被清掉，以共享笔记里的拷贝为准。
  - 用法写在每个脚本开头。`WT` 指构建好的工作树；`FAKE=1` 离线干跑，不计数；`DUMP=<文件>` 存下全部模型请求。
- **规则与结果**：
  - 规则：`specs/ai-development-handbook/spec.md` §9.5，每片一节，结果接在规则后面；
  - 共享笔记：`ai-handbook-bl163-rule.md`（规则原文与事实核对）、`ai-handbook-t5-batch1.md`；
  - 以前各片的规则与结果是 `ai-handbook-*-rule.md`、`*-results.md`。

## 4. 要注意的坑

- **评测流程**：
  - 规则先写、先交统筹，再第一次调模型。
  - 脚本要改，开跑前交统筹；开跑后发现脚本的问题，按规则整批交统筹，不自己挑着重跑。
  - 任一版出错超过 2 次就整批交统筹。
- **模型能力问题不打补丁**（用户 10-16）：不加禁令、正则、特例。每条没做到的标「设计问题（Prologue / Molis）/ 模型能力 / 拿不准」，另有「收工前没说明（holdFinish=false）」一类。
- **MiniMax 和环境**：
  - MiniMax 不用问。密钥只在命令上内联读：`MINIMAX_API_KEY="$(security find-generic-password -a "$USER" -s minimax-api-key -w)"`，不落盘、不进日志。
  - 每跑一个一次性 Home 或存储目录，跑完即删；不碰真实 Home（4207、4208、4173）。
  - 别的模型、真实 Home、发版、上游合并，先问。
- **构建**：
  - 构建走机器槽位（#518，自动排队），不要并发构建。
  - `pnpm --filter <包> run build` 的 `--filter` 写在 `run` 前。
  - 改前、改后各用一个一次性工作树（`git worktree add --detach`）构建；看 `horizontal/agent-host/package.json` 里 vendored SDK 的 tgz 名字，就知道是哪一边。
- **助理评测的接线**：
  - 照 `tests/assistant-business-gateway.test.ts` 的 fixture；Todo 按 Home 插件注册（`local.actionRegistry()`）。
  - 收尾复核（D1②）的请求认 system 里的「在这一轮结束时对用户说的话」，要滤掉。
  - 要改角色提示词，就在内存里改 `apps/local-host/dist/assistant/assistant-agent.js` 导出的 `ASSISTANT_PROMPTS`（同一个模块实例），再核一遍请求的 system 里有没有那句。
- **Todo**：`important` 只许本人设（store.ts:605），助理改不了。
- **Coding 评测的接线**：
  - `ask-user` 的参数必填 `why`。
  - `write` 的参数是 `path` + `text`，而且要先 `read`，否则 `WORKSPACE_NOT_OBSERVED`。
  - 问卷可能一卷多题、模型也可能追问，答案映射要覆盖到。
  - 问卷选项形状连错两次，运行时按修复上限停下（`withInteractionRepairLimit`）。
- **补充的编号**：模型请求里写作「[input id] The input just above has the id steer-…」。`acknowledge-inputs` 被收下的结果以「Recorded your statement」开头，被拒的以 `CODE:` 开头。
- **Prologue 仓库**：
  - 没有 CI。本机跑全部非 live 用例（`npx vitest run --exclude '**/*.live.test.ts'`）和 `tsc -p tsconfig.typecheck.json`。
  - `error-codes.test.ts` 在负载下会 5 秒超时，单独跑能过。
  - 不跑 desktop-computer-use.live。
- **Molis 的 PR**：
  - 推送前 `git fetch origin main` 并跑 `pnpm secrets:check`。
  - `node scripts/check-health-gates.mjs --base origin/main`。
  - merge main，不变基；不 force push；不用裸 `git stash`。
  - PR 带「防腐复查」一节并写明 base。开 PR 不加 full-suite 标签，把 head 发统筹。合并由统筹做。
