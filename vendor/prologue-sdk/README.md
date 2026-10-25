# Prologue SDK 构建来源

本目录的规则见 [AGENTS.md](../../AGENTS.md)：只放当前使用的 Prologue 包（最多再加一份在途分支的），换新包时删掉旧包，旧包从 Git 历史取。

目录里现在有这些东西：

- 当前包 `prologue-sdk-0.0.0-rc.1-node-storage-verification.tgz`（`horizontal/agent-host/package.json` 以 `file:` 依赖它）；
- 它的 `.sha256` 和 `.provenance.json`：字节数、SHA-256、integrity、上游仓库与完整提交、构建用的 Node 与 pnpm，格式照另外两个 vendored 包的同类文件；
- `patch-history.json`：已删除的 26 份历史补丁和 32 个没有补丁的历史包的记录（大小、SHA-256、git blob、基线、来源、产出的包），见下面「已删除的历史补丁」；
- 本文件。

另外两个 vendored 包各自带 `.sha256`、`.provenance.json` 和 `sbom.cdx.json`：[intelligence-client](../intelligence-client/)、[search-evidence-layer](../search-evidence-layer/)。这三个包的 tgz 按决定（2026-10-08，[spec](../../specs/repository-anti-corruption/spec.md) §1「Prologue SDK 收敛与私有包」）将来改从私有 registry 或 release 附件取，不再放进公开仓库；registry 就绪前仍留在仓库里（[方案](../../specs/repository-anti-corruption/dependencies-and-sdk-plan.md) §5）。`pnpm health:check` 限制本目录的 tgz 份数（`tooling/gates/limits.json` 的 `vendoredPrologueSdk`），并由 `scripts/gates/vendored-provenance.mjs` 核对三个包的 tgz 与各自的 `.sha256`、`.provenance.json` 相符、`alsoBuildableFrom` 点名的补丁在目录里且字节数、SHA-256 相符、`patch-history.json` 的格式对、已删的补丁没有回到目录里（只核对形状，不去 Git 里重算 `gitBlob` 的字节数与 SHA-256，见 [REPOSITORY-HYGIENE](../../docs/system/REPOSITORY-HYGIENE.md)）；`tests/vendor-provenance.test.ts` 给门禁的每一条检查各造一个违例，方法与限度也在那份文档里。

## 当前依赖：node-storage-verification（2026-10-24）

当前包 `prologue-sdk-0.0.0-rc.1-node-storage-verification.tgz`（1,252,963 字节），SHA-256 `349ad8987683472d219ef6dffd49d3e98f77dfaf8b95cc5b5b5b42eaeaf77a1c`。来源为本地上游仓库固定代码提交 `42ccc75ae85b138f73e65f81b789ffecdbb05ce3`，唯一 parent 是上一份实际消费的 `2c7feba5a6ea85e81e4a263671fb5e68f536d86a`；源树干净、无补丁，不声称该本地提交已推送或合入上游 main。最终文档头 `a0e8a76e70bfc49103b3a0abdb1400181f504725` 只补 slice 文字，`packages/sdk` 全部字节相同。Root/流水线接受固定候选后由原 C2 writer 串行消费，没有采用整个 SDK #102 或 Molis Memory #1101。

公开 Node 门面增加 `verifyNodeStorageContents({storageRoot,keyRoot,assertCurrent,signal?}): Promise<void>`。它仅认证已有 SDK 数据的全部 kind/分页、合法空正文与保留密文墓碑；原 AES-GCM reader 共用，不启动 Runtime/模型、不写 key/leases/claims、不输出正文或 key。数据根与原 key 根可以不同；无 sealed 数据不读 key，也不声称 key 已认证。所有错误均拒绝，含非法记录 id 的 `STORAGE_KEY_INVALID`。普通 NodeStorage 复用抽出的同一 reader，原读写合同保持。

C2 对准确包再核 708→712 文件：五项改变（README、Node 门面与 NodeStorage 的 JS/d.ts）、四项新增（reader 与 verification 的 JS/d.ts），其余 703 项与 package.json 逐字节相同。SDK 固定源与空目录安装消费者经独立 REVIEW/TEST 通过，覆盖 1002 条跨页、多 kind、双 root、错误/缺 key/坏 tag、纯元数据/检查点、取消/同步当前性及两根字节/mode/inode/mtime/ctime 不变，无 Runtime/模型。C2 没有再次构建 SDK；应用自身的快照原红例与回归另在 [W5-16 slice](../../specs/repository-anti-corruption/slices/w5-16-home-snapshot.md) 结算，上游通过不能代替本应用通过。

源码交付是准确 commit 的 git archive（16,106,940 字节，SHA-256 `2044a91e265f0f81c5a84f970e3d36b6a3493de5325e381275a0951d0f388adc`），归档和工具要求/重建命令记在 `.provenance.json`。按固定 source 在空目录离线安装，再构建 `@prologue/sdk` 并 `pnpm pack`；候选只改归档文件名，采用时字节不变。旧 retry-waiting 包及来源记录已移除，按 `patch-history.json` 的 git blob 取回。

## 上一份：retry-waiting（2026-10-23）

上一份包 `prologue-sdk-0.0.0-rc.1-retry-waiting.tgz`（1,249,614 字节），SHA-256 `ac44cf9fd079f3444523285798ac0d6d2dc1ed1e5b07f05870887db66b4df419`。来源为上游 main `2c7feba5a6ea85e81e4a263671fb5e68f536d86a`，即 [Prologue #60](https://github.com/molis-ai/molis-prologue/pull/60) 的合并（head `84a6884f`），当时的 main 头；无补丁、dirty 为 false。上游仓库此后改名为 `molis-ai/molis-prologue`（原 `molis-ai/prologue`，旧地址会跳转；下面较早的小节里的旧链接保留原样）。上游按这个提交给的源码归档（GitHub tarball）解到两个各自独立的空目录，各自装依赖、构建、打包，两份逐字节相同。版本号仍是 `0.0.0-rc.1`，只换上游提交，不算发版。

比上一份（attachment-order，`753dbae8`）多四项，前一份里被点名“不在里面”的 #53 这次带进来了：

- [#53](https://github.com/molis-ai/molis-prologue/pull/53)（合并 `023a45a5`，head `b0858ea5`）：已答的 `ask-user` 结果用 `answered` 带题号，不再用 `pending`（BL-176）。结果由 `{"kind":"questionnaire","picked":[…],"pending":"7-…"}` 变成 `{"kind":"questionnaire","picked":[…],"answered":"7-…"}`，自由文本同理（`{"kind":"text","value":…,"answered":…}`）：模型把 `"pending": <id>` 照字面读成「还在等」，拿到回答也不往下做。题号本身不变，仍可当 `acknowledge-inputs` 的 `pending` 目标（目标说明改成“问过的一道题，答上了的也算”）。同时错误文字不再写 `(pending <id>)` 而写 `Question <id>`，会话恢复时转给下一跑的那段话写 `(question <id>)`。
- [#58](https://github.com/molis-ai/molis-prologue/pull/58)（合并 `95e17709`，head `6008c72a`）：运行时准入与关机边界加固，并加上上游的质量门禁。
  - `runtime.shutdown()` 在既有的 Run/Pending 结算之后封闭作用域存储：旧句柄关机后再 `commit`/`commitBatch`/`remove`/`purge`/`discard` 以 `RUNTIME_NOT_READY`（“This Runtime storage is closed.”）拒掉；已交给 Host 的 I/O 撤不回，也不因一个挂起的 Host 调用把 shutdown 拖住。
  - App-data 记录头只收纯 JSON 元数据：非普通对象、环、不是有限数的数字、不可枚举或带访问器的键、嵌套里的字节串和带密钥字样的键都以 `APPDATA_HEADER_UNSAFE` 拒掉；写入前先对头做快照。
  - 大文件拆成较小的模块：任务图（`taskboard-*`，10 个）、子任务装配（`subagent-dispatch`、`subagent-completion`、`subagent-placement`）、效果链（`dispatch`、`pending-effects`、`remembered-rules`）、会话（`annotations`、`intent`、`queued-inputs`、`run-journal-callbacks`）、`model/core/event-validation`。公开导出不变。
- [#59](https://github.com/molis-ai/molis-prologue/pull/59)（合并 `f481d537`，head `588b03c3`）：收窄内部导出，工作区写入前检查统一成一处（`workspace/core/{root,checkpoint,mutate-patch}`）；上游加了 `packages/sdk/test/public-api.snapshot.txt` 钉住公开 API。包的 `package.json`（`exports` 与依赖）和上一份逐字节相同，四个入口（`.`、`./node`、`./tauri`、`./testing`）的导出名一个不多一个不少（1171、5、1、11 个）。
- [#60](https://github.com/molis-ai/molis-prologue/pull/60)（合并 `2c7feba5`，head `84a6884f`）：一次模型调用要先等一会儿再发同一个目标时，先发一条 `retry-waiting` 事件。`ModelEvent` 多一个成员，`Readonly<{ type: "retry-waiting"; model: string; attempt: number; waitMs: number; retryAtMs: number; reason: "rate-limited" | "unavailable" | "not-sent"; why: string; status?: number }>`：`retryAtMs` 是墙钟上的重试时刻（App 按它倒数），`attempt` 是刚失败的第几次，`status` 只是安全的 HTTP 状态码，`why` 是那次失败的稳定说法；`reason` 在 429 时为 `rate-limited`，请求已派出的其余失败为 `unavailable`，还没派出就挂了为 `not-sent`。等待中取消照旧立刻醒。事件由 `agent/core/loop-model-call.ts` 的 `waitAnnounced` 经 `run.emit` 先发、再睡。

对 Molis 的影响：

- #53：
  - Molis 不解析 `ask-user` 的结果文字去找题号：`apps/local-host/src/assistant/assistant-service.ts` 的 `presentActivity`（第 310、311 行）只读 `kind`、`value`、`picked`，没有读过 `pending`；`horizontal/agent-host/src/adapters/prologue-stream.ts`（第 344 行）读的是调用的输入（`why`、`questions`），不是结果。所以只有一处断言要跟着改：`tests/assistant-page-written.e2e.test.ts` 比对原问题的工具结果，键 `pending` 改成 `answered`（浏览器用例，交 CI）。
  - BL-176 的改法本来就归 Prologue；Molis 的提示词里没有补过“pending 不是还在等”，也不需要撤。换包后用同一套 T5 跑法比一次的事仍记在 BL-176 行里。
- #58：
  - 关机：Molis 的 `PrologueAgentAdapter.close()`（`horizontal/agent-host/src/adapters/prologue.ts` 第 759–764 行）先取消订阅、等 `timingCommit`，最后才 `runtime.shutdown()`；节点组装的关闭（`prologue-node.ts` 第 168–177 行）在 `runtime.shutdown()` 之前依次关掉 MCP 库、推理、各步骤看板、消息、等待、检查、审查和检查点。所以 Molis 自己的写入都在封闭之前；关机之后迟到的写（旧句柄上的回答、记账）现在以 `RUNTIME_NOT_READY` 拒掉，经 `controlFailure`（`horizontal/agent-host/src/adapters/prologue-control-errors.ts` 第 26 行，名单里没有的 SDK 码一律如此）映射成 `agent.control_failed`（`tests/agent-control-errors.test.ts` 已有这条路径的断言，用的正是 `RUNTIME_NOT_READY`），不再悄悄写进已关的 Home。
  - App-data：Molis 不用 SDK 的 `appData`（`grep` 没有一处），记录头的收紧碰不到 Molis。
  - 模块拆分只动 SDK 内部；Molis 从 `@prologue/sdk`、`@prologue/sdk/node` 取的名字（`grep` 到 `@prologue/sdk` 的导入约 50 处、`@prologue/sdk/node` 2 处）没有一个在导出里消失，没有深层路径导入。
- #59：Molis 没有导入任何被收窄掉的东西，理由同上（公开入口的导出名与上一份完全相同；Molis 对 `@prologue/sdk/dist/…` 的引用只出现在文档里，指的是 `host/plugin/node*.js`，这几个文件没变）。
- #60：Molis 的代码一行不动，但行为上有一处要知道：`PrologueEvent`（`horizontal/agent-host/src/adapters/prologue-stream.ts` 第 42–70 行）末尾是 `{ type: string; [key: string]: unknown }` 的兜底，`applyPrologueEvent`（第 532 行起）对没有处理器的类型走 `default`，`unknown_frames += 1` 并返回 true。所以 Run 遇到限流或暂时不可用时，现在会多一帧“未识别”（和已有的 `fallback` 一样），只计数、不进 `turns`/`activity`，界面上没有变化。把 `retry-waiting` 读成一个有倒数的状态，是助理限流倒数那一刀的事，不在这次换包里。

验证（2026-10-23）：
- 工具链：node 24.14.0（darwin arm64，正是上游固定的版本；这台机器这次不再是上一份用的 24.21.0 darwin x64），pnpm 11.9.0。命令行上仍按上一份的写法关掉 engine-strict，命令见 `.provenance.json` 的 `build.steps`；产物与工具链无关，上一份换工具链时已核过。
- 把上一份包和这一份解开逐个比：666 个文件对 708 个文件，51 个不同，42 个新增（21 个模块，各有 `.js` 和 `.d.ts`）；`package.json` 逐字节相同。不同和新增的文件全都对应 `753dbae8...2c7feba5` 之间改过的 59 个 `packages/sdk/src` 的 `.ts` 源文件（另有 6 份 README 不进包），只有一个例外：`dist/composition/core/run-parking.d.ts`，它的类型引用跟着任务图拆分改指到 `taskboard-contract.js`。反过来，有 4 个源文件改了、包里却一字未变（`subagent-workspaces`、`open-work`、`stored-resource`、`session/core/run`），都只是删掉了没用到的类型导入。
- 四个公开入口（`.`、`./node`、`./tauri`、`./testing`）的导出名，用 TypeScript 编译器逐个列出再比，两份完全相同（1171、5、1、11 个）。
- 同一棵树上 `tsc -p tsconfig.typecheck.json --noEmit` 无错；SDK 不含 live 的用例 211 个文件、2918 条里 2917 条通过、1 条不过、无类型错误。不过的一条是上游自己的 `migration-guards.test.ts`（“派出去只有一条链”）：它要求 `openDispatch` 的调用只出现在 `effect-policy/core/chain.ts`，#58 把调用挪进了 `effect-policy/core/dispatch.ts`（`EffectDispatch`，仍是唯一的调用处，`chain.ts` 里只剩声明），上游没同步这条守卫。是上游测试落后于重构，不是行为变化；换包不因此受阻，但上游要补。
- live 用例只跑了只要本机 node 和 127.0.0.1 的 HTTP 模型、不要密钥的 13 个文件：`attachment-placeholders`、`coding-diagnose-after-write`、`resource-lineage`（上一份跑过的三个），加上这四项改动碰到的 `app-data`、`ask-user-parked-restart`（含 #53 新加的 `answered` 断言）、`runtime-stale-handles`（#58 新加）、`session-import-terminal`、`model-retry-host`、`host-unanswered-retry`、`session-error-status`、`network-dispatch-authority`、`model-timeout`、`model-loopback`：13 个文件、86 条通过。要真实密钥的 `board-shared`、`character-persona`、`ask-user-fields` 的 live 部分没跑，`desktop-computer-use.live` 会操作真实桌面，没跑。不出网、无付费模型请求。
- 13 个消费者脚本（`prologue-verify.sh`）不在这台机器上，这次没跑；代替它的是 SDK 的 `packaged-consumer.test.ts`（在上面 211 个文件里）和 Molis 这一侧的相关用例。
- 从两个各自解开的源码目录各打一次，字节数与 SHA-256 相同。
- 上游 main 的祖先复核：`patch-history.json` 的 41 个提交对 `2c7feba5` 逐项用 GitHub 的比较接口核对，除三个过渡包来源以外都是祖先（38 个 ahead 或 identical，3 个 diverged：`08b84296`、`923e5a40`、`4007a93c`）。

重建命令与工具版本见同目录的 `.provenance.json`。

Molis 侧的验证（这一刀只换包，加上 #53 带来的一处断言）：
- 在 main `91c24d8f5`（#1055 之后）上换包。`pnpm install --frozen-lockfile=false --offline` 之后，锁文件只改这个包的文件名与 integrity。
- `pnpm build` 通过（含 `local-host` 的 Swift 原生步骤）。
- 相关的非浏览器用例 97 个文件全过：`affected-tests` 选的 41 个，加上 `prologue-*`（40 个）、`vendor-provenance`、问题与回答（`agent-pending-questions`、`agent-typed-questions`、`agent-question-types`、`agent-reference-questions`、`agent-input-delivery`、`agent-run-wait`、`interaction-examples`、`interaction-sdk-mapping`）、助理委托与续跑（`assistant-answers`、`assistant-delegation*`、`assistant-continuation-control`、`assistant-work-wait`、`assistant-work-continuity`、`assistant-input-correct`、`assistant-thread-reply`）、Coding 的等待与命令（`coding-background-wait`、`coding-background-tasks`、`coding-message-wait`、`coding-effect-control`、`coding-input-ports`、`coding-cooperation-http`、`coding-commands`），其中 S-13 的 `prologue-memory-boundary` 在新包上通过。
- `pnpm test:security` 165 个文件、`pnpm test:contracts` 47 个文件全过。
- 没跑：全量和浏览器用例，交 CI；其中 `tests/assistant-page-written.e2e.test.ts` 的 `answered` 键断言是这次改的，没有在本机跑过。

## 上一份：attachment-order（#887，2026-10-23 换掉）

上一份包 `prologue-sdk-0.0.0-rc.1-attachment-order.tgz`（1,235,604 字节），SHA-256 `f39224701ae52eeeb7251e4486d32ee2c3c93a798c997f5764103e127280ceea`。来源为上游 main `753dbae8359e56a74397d030af4d18abf402d5b5`，即 [Prologue #57](https://github.com/molis-ai/prologue/pull/57) 的 squash 合并（head `ac8d6a4a`），当时的 main 头；无补丁、dirty 为 false。上游按这个提交给的源码归档（GitHub tarball）解到两个各自独立的空目录，各自装依赖、构建、打包，两份逐字节相同。版本号仍是 `0.0.0-rc.1`，只换上游提交，不算发版。

比上一份多四项（[#53](https://github.com/molis-ai/prologue/pull/53) 没有合入，不在里面）：

- [#54](https://github.com/molis-ai/prologue/pull/54)（合并 `27daa94e`，head `aecb97cd`）：一笔副作用的归属（`EffectOrigin`）和 `awaiting-input` 事件的 `origin` 可以写明是哪次工具调用（`toolCall`）、哪次模型调用（`modelCall`，即那次调用的 `usage-recorded.callId`）、看板哪一步（`step`）准备的，三栏都可选，由引擎盖，不从工具参数读，只作关联、不作授权；`ToolCallRequest` 多一栏可选的 `modelCallId`；导出 `EffectOrigin` 类型（BL-162）。
- [#55](https://github.com/molis-ai/prologue/pull/55)（合并 `26a86ff3`，head `549615a0`）：#54 评审的跟进。归属里的编号最长 256 个字符（`ORIGIN_STAMP_CHARS`），App 经 `effects.prepare` 或 `gate.origin` 给的不合规时以 `EFFECT_ORIGIN_INVALID` 拒掉；导出判据 `freezeOrigin`、`isOriginStamp`。
- [#56](https://github.com/molis-ai/prologue/pull/56)（合并 `a321b849`，head `d3190cab`）：附件占位串加结尾，写成 `PROLOGUE-ATTACHMENT-<随机段>-<序号>-END`。原先序号后面没有别的字，`…-1` 是 `…-10` 到 `…-19` 的开头，Host 要求每个占位串在请求体里恰好一处，所以一次调用带第 11 张图起整次以 `MODEL_NETWORK_FAILED` 拒发。Host 那一道（恰好一处）不变，真的重复照旧拒。
- [#57](https://github.com/molis-ai/prologue/pull/57)（squash 合并 `753dbae8`，head `ac8d6a4a`）：一次调用带几张图，模型收到的顺序就是给的顺序。OpenAI 兼容与 Anthropic 兼容两个适配器原先把图逐张 `unshift` 到最后一条用户消息的最前面，最后一张排第一，整组倒序；现在按给出的顺序一次插到正文前面。Agent 循环开头的附件（`recipe.start.attachments`）走同一个适配器入口，顺序跟着改对；每一步的窗口图挂在各自的工具结果上，按历史顺序排，原来就不倒。公开 API、请求体形状、占位串都不变。

对 Molis 的影响：

- #56：修掉 BL-355。Molis 一次模型调用的原图上限原先写 30，实际只发得出 10 张；换包后同一个 PR 把上限提到 50（`horizontal/agent-host/src/adapters/prologue-inference-materials.ts`、`packages/plugin-runtime/src/model-service.ts`）。Molis 按来源目录把原图放进一批吸入，Prologue 一批默认最多 30 份，所以组装运行时（`horizontal/agent-host/src/adapters/prologue-node-port.ts`）把 `resource.intake.maxItemsPerBatch` 配成 50；它也是一轮 Agent 文本材料的上限，Molis 自己的文本材料上限（30 份）不变。
- #57：`tests/prologue-inference-images.test.ts` 用一个目录里的 50 张原图、两种协议各调一次，断言模型收到一个请求、每张图恰好一份、顺序不变、没有残留占位串。顺序这一条正是在换上 #56 那一版包时断掉、查出 #57 的；Molis 自己按给定顺序传附件，没有在自己这边补反序，所以 Molis 的代码不用跟着改。
- #54、#55：Molis 的代码一行不动。
  - Molis 读 `awaiting-input`（`horizontal/agent-host/src/adapters/prologue-stream.ts`）和副作用的归属（`prologue-approvals.ts`、`prologue-checkpoints.ts`、`prologue-node-port.ts`、`prologue-checkers.ts`、`prologue-messages.ts`、`plugin-builder.ts`）都只按名字读 `session`、`run`，没有逐键比对，新的三栏不会被拒，也不会被当成授权。
  - Molis 唯一的 `effects.prepare`（`prologue-git.ts`）不给 `origin`，也不用 `gate.origin`，所以 `EFFECT_ORIGIN_INVALID` 不会因 Molis 的输入出现。
  - 新导出的 `EffectOrigin`、`freezeOrigin`、`isOriginStamp`、`ORIGIN_STAMP_CHARS` Molis 都还没用；用模型调用编号把副作用和用量记录连起来，是 BL-162 在 Molis 这一侧的事，不在这次换包里。

验证（2026-10-20）：
- 工具链和上一份相同：node 24.21.0（darwin x64），pnpm 11.9.0，命令行上关掉 engine-strict（命令见 `.provenance.json` 的 `build.steps`）。
- 把上一份包和这一份解开逐个比，两份都是 666 个文件，不同的 26 个，全都对应 `a51607fb...753dbae8` 之间改过的 18 个 `packages/sdk/src` 源文件；其余文件逐字节相同，`package.json` 也相同。和 `a321b849`（#56）打出的包比，只有 #57 改的两个适配器（`dist/model/plugin/openai-compatible.js`、`anthropic-compatible.js`）不同。
- 同一棵树上 `tsc -p tsconfig.typecheck.json --noEmit` 无错；SDK 不含 live 的用例 211 个文件、2913 条通过、无类型错误。live 用例单独跑了 `attachment-placeholders.live`（11、21、50 张原图经真实 Node Host 一次调用，#57 起也逐张核对顺序）、`coding-diagnose-after-write.live`、`resource-lineage.live`：3 个文件、19 条通过；只用本机 node 和 127.0.0.1 的 HTTP 模型，不出网、不要密钥。
- 13 个消费者脚本（`prologue-verify.sh`）不在这台机器上，这次没跑；代替它的是 SDK 的 `packaged-consumer.test.ts`（在上面 211 个文件里）和 Molis 这一侧的相关用例。
- 从两个各自解开的源码目录各打一次，字节数与 SHA-256 相同。
- 上游 main 的祖先复核：`patch-history.json` 的 40 个提交对 `753dbae8` 逐项用 GitHub 的比较接口核对，除三个过渡包来源以外都是祖先。

重建命令与工具版本：来源记录（`.provenance.json`）随包删除，从 `96bca9792` 取回。

Molis 侧的验证见引入它的 PR（[#887](https://github.com/molis-ai/molis-work/pull/887)）。

#887 起是 main 的依赖，2026-10-23 换成 retry-waiting；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## 上一份：after-write-check-marker（#814，2026-10-20 换掉）

上一份包 `prologue-sdk-0.0.0-rc.1-after-write-check-marker.tgz`（1,228,137 字节），SHA-256 `0339fb9ef4935e70b534b35319052bd57d04931654c12fb861ed4ac8b4de6d60`。来源为上游 main `a51607fbfa11e8f59ac0962906aa1bcbf155d8e6`，即 [Prologue #52](https://github.com/molis-ai/prologue/pull/52) 的合并，当时的 main 头；无补丁、dirty 为 false。上游按这个提交给的源码归档（GitHub tarball，即上游的 `git archive`）解到两个各自独立的空目录，各自装依赖、构建、打包，两份逐字节相同。

比上一份多三项：

- [#50](https://github.com/molis-ai/prologue/pull/50)（合并 `dd639069`，head `c077dcb3`）：`acknowledge-inputs` 只在这一轮收得下时列 `todo`：这一轮的名单里有 `update-todo`，或者构建这次请求时这一跑的待办清单不空。列不列在构建请求时定下，这次请求里不再变；没列时硬写的 `todo` 目标在读清单之前就以 `AGENT_INPUT_REF_REJECTED` 拒掉，整次调用不记。没有可指的步骤类目标时，`later-step` 只要求在 note 里写是哪一步。
- [#51](https://github.com/molis-ai/prologue/pull/51)（合并 `43f223e6`，head `912e2d03`）：写后检查是包里标了 `afterWriteCheck: true` 的那个工具，不再认固定名字 `coding.diagnose-after-write`，工具名由包自己起。`validatePack` 以 `SCENARIO_PACK_INVALID` 拒绝（点名工具）：一个包标了两个以上、标在不是 `safe-read` 的工具上、值不是 `true`。官方编码包已标上；没有按名字的退路。
- [#52](https://github.com/molis-ai/prologue/pull/52)（合并 `a51607fb`，head `8decb428`）：没有退出码的命令不再写成 `exit undefined`。Node Host 的前台 `runCommand` 起不来（没有这个可执行文件、没有执行权限、argv 里有 NUL）时以 `COMMAND_FAILED` 拒掉、不留回执，和后台、交互进程以及 Tauri Host 一致；于是不是取消也不是超时、又没有退出码的回执只剩一种来源：被信号结束。各处说法统一成 `exit none (a signal ended it)`，提醒里的状态跟着改成 `exit 2`、`exit timed-out`、`exit cancelled`。写后检查遇到信号结束写 `not checked: no exit code (a signal ended it)`，检查器起不来写 `not checked: COMMAND_FAILED: …`，两种情况写入都照样落盘。

对 Molis 的影响：

- #50：助理业务轮次的名单里有 `update-todo`（`BUSINESS_HOST_TOOLS`），照旧列 `todo`。Coding 的各个角色（`plugins/native/coding/src/roles.ts`）都不列 `update-todo`，Molis 也不替这些跑写待办清单，所以它们的 `acknowledge-inputs` 不再列 `todo`；原先硬写的 `todo` 目标也会因为清单为空、id 不存在被拒，现在是提前拒、换了拒绝的话。插件方法只选了部分业务工具、没选 `update-todo` 的跑同理。Molis 的用例里没有硬写 `todo` 目标的。Molis 的代码一行不动。
- #51：现在没有影响。Molis main 上没有写后检查的执行器，也不引用旧名字。A2-2（Molis 自己的写后检查，[采用 spec](../../specs/prologue-adoption/spec.md) §6.0p）要按它做：Coding 的包带自己的检查工具，按包起名、标 `afterWriteCheck: true`、`effectKind` 为 `safe-read`；执行器照 `PackTool.afterWriteCheck` 的 JSDoc，收 `{ path }`，回 `{ command }` 或 `{ unchecked }`。
- #52：
  - 起不来的前台命令现在没有回执。Molis 读命令输出（`horizontal/agent-host/src/adapters/prologue-node-port.ts` 的 `readCommandOutput`）对这次调用回「没有这次命令的持久回执；结果未知」，不再给一份 `exit_code` 为空的回执。
  - Coding 时间线（`plugins/native/coding/src/timeline.ts`）用 `/^exit (-?\d+)/` 从输出文字里读退出码：起不来的命令现在是工具失败，显示「失败」；被信号结束（`exit none (…)`）、超时、取消的读不到退出码，照旧落到「完成」。这个缺口记在 `specs/BACKLOG.md` 的 BL-222，由交互线单独改。
  - Molis 不读提醒里的 `status`，也不认 `exit unknown`、`exited` 这些旧说法。

验证（2026-10-19）：
- 打包的工具链和上一份不同。上游 `.npmrc` 开着 `engine-strict=true`，`package.json` 要 node 24.14.0；这台机器只有 node 24.21.0（darwin x64），没有 24.14.0，所以装依赖、构建、打包三步都在命令行上关掉 engine-strict（命令见 `.provenance.json` 的 `build.steps`）。pnpm 是要求的 11.9.0，TypeScript 由上游锁文件定在 5.9.3。上一份是 node 24.14.0（darwin arm64）打的。
- 换工具链没有改产物：把上一份包和这一份解开逐个比，666 个文件里不同的 27 个，全都对应 `3adc5e87...a51607fb` 之间改过的 20 个 `packages/sdk/src` 源文件（其中 `composition/core/command-outcome` 是新文件，`.js` 和 `.d.ts` 两个）；其余文件逐字节相同，`package.json` 也相同。
- 同一棵树上 `tsc -p tsconfig.typecheck.json --noEmit` 无错；SDK 不含 live 的用例 208 个文件、2879 条通过、无类型错误。live 用例只单独跑了 `coding-diagnose-after-write.live`：3 条过，其中两条是 #52 新加的（检查器被信号结束、检查器起不来）；只用本机 node，不出网、不要密钥。
- 13 个消费者脚本（`prologue-verify.sh`）不在这台机器上，这次没跑。代替它的是 SDK 的 `packaged-consumer.test.ts`（只认打好的 dist，在上面 208 个文件里），和下面 Molis 这一侧的干净安装、构建与相关用例。
- 从两个各自解开的源码目录各打一次，字节数与 SHA-256 相同。

重建命令与工具版本：来源记录（`.provenance.json`）随包删除，从 `ddab7a2d1` 取回。

Molis 侧的验证（这一刀只换包，不写进采用 spec）：
- 在 main `7d1cc4bfa`（#807 之后）上换包。`pnpm install --frozen-lockfile --offline` 通过，锁文件只改这个包的文件名与 integrity。
- 构建：`design-system`、`agent-host`、`workbench` 从干净构建，`local-host` 跑 `tsc`，都通过。根目录的 `dist` 另照 `pnpm build` 的后几步补做：`clean`、`tsc`、`build:pty-client`、写构建指纹。本机 `local-host` 的 Swift 原生步骤编不过，所以没有跑整体 `pnpm build`。
- 相关的非浏览器用例 84 个文件：`affected-tests` 选的 35 个，加上 `prologue-*`、助理委托、Coding 的命令与等待、输入回执、安全不变量里与 Agent 有关的几份、`vendor-provenance`。
  - 82 个一次过，其中 S-13 的 `prologue-memory-boundary` 在新包上通过。
  - `install` 与 `npm-package` 两个失败，都是本机环境的原因，和换包无关：
    - 工作树里还没有根目录构建：找不到 `dist/cli/main.js`，安装器报 `installer.source.build_stale`；
    - 补上根目录构建后，又缺 Computer Use 助手 `native/computer/bin`：本机 Swift 编不过它，主检出也没有。

    在这个已忽略的目录里放上 Linux 构建写的那份说明（`native/computer/build.mjs` 在 macOS 之外只写它）后，两个都过：install 22/22，npm-package 2/2，包括 npm 包打进 `@prologue/sdk`、不带 `vendor/prologue-sdk/*.tgz` 这几条。测完删掉了说明。
- 没跑：浏览器用例与全量，交 CI 的集成批次。

#814 起是 main 的依赖，2026-10-20 换成 attachment-order；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## 上一份：after-write-check-key（#723，2026-10-19 换掉）

上一份包 `prologue-sdk-0.0.0-rc.1-after-write-check-key.tgz`（1,223,766 字节），SHA-256 `ac2029b40e4e8a8a3d8cd85e9b239b27700161a3431903f7128192e045caedc8`。来源为上游 main `3adc5e87e81567af59983d1e7ac411a703454167`，即 [Prologue #49](https://github.com/molis-ai/prologue/pull/49) 的合并，当时的 main 头；#49 只改 `docs/slices/input-board-refs.md`，包的内容和 #48 的合并 `72866036` 打出来的逐字节相同。无补丁、dirty 为 false。从两份各自独立的干净 `git archive` 各打一次，两份逐字节相同。

比上一份多两项：

- [#47](https://github.com/molis-ai/prologue/pull/47)（合并 `feef0443`，head `d0646b92`）：写后检查的身份交给执行器。执行器的入参多一栏 `afterWriteCheck`：`operationKey` 和这条命令审查资源上的一字不差，`writeCallId` 是触发它的那次写入的 callId（有才给）；由 SDK 填，不来自模型的参数。导出 `isAfterWriteCheckOperationKey`（认一张命令审查卡是不是写后检查）、`afterWriteCheckReceiptKey`（那次写入的检查回执挂在哪），以及审查资源与回执 JSON 的三个种类常量 `WORKSPACE_COMMAND_KIND`、`WORKSPACE_COMMAND_RECEIPT_KIND`、`WORKSPACE_REWIND_KIND`。键仍是执行器里的次序（`after-write-check:<n>`），存下来的值都不变。
- [#48](https://github.com/molis-ai/prologue/pull/48)（合并 `72866036`，head `cb904b48`）：`acknowledge-inputs` 只列这一轮收的目标。`app-ref` 只在 App 注入了 `appRefs` 解析器时才列，`board-node` 只在这一轮的名单里有任务图工具（`board-read`、`board-plan`、`board-revise`、`board-report`、`board-wait`）时才列。目标的 enum、`later-step` / `new-task` / `targets` 的说明、`board` 字段和拒绝的话都只写列出的那几种；没列的照旧在问读取器或解析器之前以 `AGENT_INPUT_REF_REJECTED` 拒掉。两种都收时，参数和登记的那一份逐字节相同。

对 Molis 的影响：

- #47 现在没有影响。Molis 没有写后检查的执行器，SDK 的公开面只加不改。
- #48 让 Molis 每一跑的 `acknowledge-inputs` 说明变短。Molis 不注入 `appRefs` 解析器，所以 `app-ref` 不再出现。原先它列在说明里，写了也会被拒。助理的业务轮次的名单里有 `board-wait`（`BUSINESS_HOST_TOOLS`），所以 `board-node` 照旧列，只有名单里一个任务图工具也没有的跑才不再列（`tests/assistant-business-gateway.test.ts` 钉着助理那一轮看到的工具）。Molis 的代码一行不动。
- Molis 自己的写后检查（[采用 spec](../../specs/prologue-adoption/spec.md) §6.0p）要用它：审查卡上的「写后检查：<检查器>（配置 v<n>）」按 `afterWriteCheck.operationKey` 对上执行器这一次用的配置，回执按 `afterWriteCheckReceiptKey` 找。
- Molis 里写死的三个资源种类改用这几个常量，是 Molis 自己的一件待办，不在这次换包里。

验证（2026-10-18）：
- 同一棵树（干净归档）上 build dist、`tsc` 无错；SDK 不含 live 的用例 208 个文件、2860 条通过、无类型错误；live 用例只单独跑了 `coding-diagnose-after-write.live`（1 条过，只用本机 node，不出网、不要密钥）；
- 这个包装进干净目录，13 个消费者脚本全过；
- 同样的步骤打第二次，字节数与 SHA-256 相同。

重建命令与工具版本：来源记录（`.provenance.json`）随包删除，从 `f7f8adbf2` 取回。

Molis 侧的验证（这一刀只换包，不写进采用 spec）：
- 在 main `7faaa027c`（#699 合入之后）上换包：`pnpm install --frozen-lockfile --offline`、`pnpm build` 通过。
- 相关的非浏览器用例 221 个文件（`prologue-*`、`agent-*`、`assistant-*`、`coding-*`、`interaction-*`、`input-receipts-*`、`security-invariants-*`、`studio-*`、`plugin-builder-*`、`vendor-provenance`，加上 `affected-tests` 另选的）：218 个一次过；`assistant-thread-reply`、`coding-material-consumption`、`coding-history-requirements` 在机器负载 22–25 时超时，一次一个重跑都过。S-13 的 `prologue-memory-boundary` 在其中，在新包上再过一次。
- `pnpm test:security` 79 个文件，78 个一次过，`assistant-thread-reply` 同样是超时、重跑过；`pnpm test:contracts` 44/44（动作合同快照没有变化）。
- `check-health-gates --base origin/main`、`page-assets --base origin/main`、`boundary:check`、`verify-release-versions` 都过。
- 浏览器用例交给全量，由 CI 跑。

#723 起是 main 的依赖，2026-10-19 换成 after-write-check-marker；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## 上一份：after-write-check（#699，2026-10-18 换掉）

上一份包 `prologue-sdk-0.0.0-rc.1-after-write-check.tgz`（1,218,580 字节），SHA-256 `ba2507c9e02a11c4768d0234e67f9eb8b3ee3e93b9ce4ca026e05054f5a7448d`。来源为上游 main `94ee1ea4f48baf529b2ce624b8ee54acefb7bb7f`，即 [Prologue #46](https://github.com/molis-ai/prologue/pull/46) 的合并，当时的 main 头；无补丁、dirty 为 false。从两份各自独立的干净 `git archive` 各打一次，两份逐字节相同。

比上一份多五项：

- [#42](https://github.com/molis-ai/prologue/pull/42)（合并 `3766ed52`，head `67098790`）：`dispatch-subagent` 的说明写清点名的角色和子任务的步骤对它能用的工具有什么影响。只改说明文字。
- [#43](https://github.com/molis-ai/prologue/pull/43)（合并 `68545af6`，head `c4b1652b`）：`search` 的说明写清它按文件内容找，不按文件名找。只改说明文字。
- [#44](https://github.com/molis-ai/prologue/pull/44)（合并 `1110049c`，head `17436096`）：两台 Host 起命令时，`PATH` 只留授权根之外的绝对项：`.`、空项、相对项，以及落在任何一个已授权根里的绝对项（根本身、`<根>/node_modules/.bin`、指进根的链接，按真实路径判断）都丢掉；一项不剩时不给 `PATH`。原先这些项能让「只跑裸名」绕到根里模型改过的同名文件。`run-command`、后台命令、交互进程（含 MCP stdio）都受这一条管。
- [#45](https://github.com/molis-ai/prologue/pull/45)（合并 `7b201ed5`，head `f29a0ec5`）：写后检查改成执行器只回一条命令（JSON），SDK 核过再经命令审查去跑，事实拼进写入的观察；删全局开关 `config.workspace.diagnoseAfterWrite`。会话的包声明了 `coding.diagnose-after-write`、这条会话也给了它的执行器，才查。
- [#46](https://github.com/molis-ai/prologue/pull/46)（合并 `94ee1ea4`，head `ccd6a649`）：`ask-user` 题目 `id` 的说明写出校验接受的格式。只改说明文字。

对 Molis 的影响：

- 起 Host 的进程，`PATH` 里若有相对项，或有落在授权根里的目录，靠它们找到的工具这次找不到了：前台命令回 `exitCode` 为空的回执，后台和交互进程报 `COMMAND_FAILED`。开发时用 pnpm 脚本起 Host，`PATH` 前面会自动加上 `node_modules/.bin`；授权根里若有这一项（例如 Coding 打开的就是本仓库），`tsc`、`vitest` 这类只装在仓库里的工具，Agent 的命令就找不到了。要用，就把工具装在授权根之外，再把那个绝对目录放进 Host 进程的 `PATH`。
- `config.workspace.diagnoseAfterWrite` 没有了。Molis 从没设过它，`git grep` 只在 2026-10-02 的评审文档里找到。
- 写后检查只在会话的包声明了它、又有执行器时才有。Molis 的会话不用编码包，也没给 `coding.diagnostics` 执行器，所以写入的观察和换包前一样，一个字不加。Molis 自己的写后检查（[采用 spec](../../specs/prologue-adoption/spec.md) §6.0p）随后单独做。

验证（2026-10-17）：
- 同一棵树（干净归档）上 build dist、`tsc` 无错；SDK 不含 live 的用例 208 个文件、2849 条通过、无类型错误；live 用例只单独跑了 `coding-diagnose-after-write.live`（1 条过，只用本机 node，不出网、不要密钥），别的 live 没跑；
- 这个包装进干净目录，13 个消费者脚本全过；
- 同样的步骤打第二次，字节数与 SHA-256 相同。

重建命令与工具版本：来源记录（`.provenance.json`）随包删除，从 `f7f8adbf2^` 取回。

Molis 侧的验证：
- 在 main `6505378e`（#695 合入之后）上换包：`pnpm install --frozen-lockfile --offline`、`pnpm build` 通过。
- 相关的非浏览器用例 238 个文件一次全过（`prologue-*`、`agent-*`、`assistant-*`、`coding-*`、`interaction-*`、`security-invariants-*`、创作台的非浏览器部分，`vendor-provenance`，加上 `affected-tests` 另选的）；S-13 的 `prologue-memory-boundary` 在其中，在新包上再过一次。
- 新加 S-38（`tests/security-invariants-command-path.test.ts`，命令的 `PATH` 只用授权根之外的绝对项）：把装进来的包里 `commandEnv` 改成五种变体（不过滤、不查根、按字面比、留相对项、一项不剩时给空 `PATH`）各跑一次，每种至少红一条。
- `pnpm test:security` 63/63，`pnpm test:contracts` 44/44（动作合同快照没有变化）。
- `check-health-gates --base origin/main`、`page-assets --base origin/main`、`boundary:check`、`verify-release-versions` 都过；vendored SDK 仍是 1 份。
- 浏览器用例交给全量，由统筹跑。

#699 起是 main 的依赖，2026-10-18 换成 after-write-check-key；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## 上一份：parked-run（#690，2026-10-17 换掉）

上一份包 `prologue-sdk-0.0.0-rc.1-parked-run.tgz`（1,211,301 字节），SHA-256 `6f551e02050f85bb431aca88ac76ed67f0495b2c606e5e60b3e1c2625a9e61e2`。来源为上游 main `b541a8e62752fce23c83f959d55e549b3086557f`，即 [Prologue #41](https://github.com/molis-ai/prologue/pull/41) 的合并，当时的 main 头；无补丁、dirty 为 false。从两份各自独立的干净 `git archive` 各打一次，两份逐字节相同。

比上一份多三项：

- [#39](https://github.com/molis-ai/prologue/pull/39)（合并 `d7b7c214`，head `6aaa7775`）：交接、改派、重来时，结束型等待（`afterwards: "end-step"`）的引用不再留在新一代上。上一份包记的已知缺口就是它；Molis 的作业步骤没有负责人、不会被交接，以前也不受影响。
- [#40](https://github.com/molis-ai/prologue/pull/40)（合并 `e0f99ea2`，head `1100940e`，BL-156 的上游一半）：正常关机时，只在等人回答一道题（`ask-user` 的文字或问卷题）的那一跑不再取消，而是停放在题上，题在盘上仍开着。重开后 `inspectRecovery` 列出它，`sessions.answerInterrupted` 可以回答它，答案排进会话，由 App 开下一跑。停放期间这条会话开新的一跑得 `SESSION_RUN_PARKED`；答案已收下、还没交出时得 `SESSION_RECOVERY_BUSY`；重开时读不出哪些跑停放着，所有开跑得 `SESSION_HISTORY_UNAVAILABLE`。会话正在被恢复时，`recoverRun`、开跑与 Agent 准入原来报 `EFFECT_RECONCILE_REQUIRED`，现在报 `SESSION_RECOVERY_BUSY`。`inspectRecovery` 现在会写盘：按 Host 的钟定死过期的题、交出已回答的答案、收过期停放跑的板上账。
- [#41](https://github.com/molis-ai/prologue/pull/41)（head `ee1f41dd`）：停放的那一跑在封口时让驱动器返回，墙钟定时器（默认 15 分钟）、网络边界和订阅随之清掉。只有 #40 时，关机停放一跑之后，进程要等这跑的墙钟到点才退出：在进程里关掉适配器、等事件循环排空的地方（用例、脚本、创作台回放的冒烟）都会卡住；装好的 Home 不受影响（网页启动器收到信号 2 秒后强制退出）。公开面只多 `RunDriver` 输入里的 `onSeal`，这份输入只由 SDK 自己构造。

Molis 这一次只换包，`answerInterrupted` 由交互线接上。在那之前，正常关机时等人回答的那一轮，重开后和强杀留下的中断轮次一样：列着它问的题，要核对并关掉，关掉后会话照常开新的一轮（`tests/prologue-start-refusal.test.ts`）。三个新的拒绝码都在开跑写下任何东西之前抛出，Molis 把它们和别的开跑前拒绝一样记成已定的拒绝（`horizontal/agent-host/src/adapters/prologue-run.ts` 的 `REFUSED_BEFORE_RUN`）。

验证（2026-10-17）：
- 同一棵树（干净归档）上 build dist、`tsc` 无错；SDK 全量 360 个文件（354 个通过、6 个按既有条件跳过），3989 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live` 与 `computer-use.live`，它们操作真实桌面与浏览器）；
- 这个包装进干净目录，13 个消费者脚本全过；
- 同样的步骤打第二次，字节数与 SHA-256 相同。

重建命令与工具版本：来源记录（`.provenance.json`）随包删除，从 `7faaa027c^` 取回。

#690 起是 main 的依赖，2026-10-17 换成 after-write-check；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## 上一份：app-wait-ends-step（#668，2026-10-17 换掉）

上一份包 `prologue-sdk-0.0.0-rc.1-app-wait-ends-step.tgz`（1,195,429 字节），SHA-256 `cc4386e2d6edd1d6395f2c73d3cba722ac76da0855131049dd06796886ee0f0a`。来源为上游 main `24e6908352a9d2b164f62b83381b1f4cc6fc7643`，即 [Prologue #38](https://github.com/molis-ai/prologue/pull/38) 的合并，当时的 main 头；无补丁、dirty 为 false。从两份各自独立的干净 `git archive` 各打一次，两份逐字节相同。

比上一份多两项：

- [#37](https://github.com/molis-ai/prologue/pull/37)（`62431743`，树与评审过的 head `f4fda4a1` 相同）：App 的等待可以了结它挂着的步骤（`WaitArrangement.afterwards: "end-step"`，只给 `by: "app"`）。板上只写带 `ends` 的等待引用，不写接续；等待落定时，`running` 的步骤按终态结束（满足 → `succeeded`；失败、过期 → `failed`，`onFailure: "block"` 时 `blocked`；检查被拒 → `needs-reconciliation`），取消不动步骤。挂着它的步骤上不开尝试，提前继续拒绝。这样的等待不往会话里写话：作业怎样结束，由 App 自己从图上告诉 Work（[采用 spec](../../specs/prologue-adoption/spec.md) A3）。
- #38（`24e69083`；它在 `d2b3daa3` 之上的改动与评审过的 head `b3be719b` 逐字相同）：一次运行开跑时可以带自己的引用种类名单。Molis 这一次只换包、不用它，由交互线接上。

两项都要调用方显式选用，Molis 当时都没用，行为不变。已知缺口：交接、改派、重来时，没有接续的结束型等待的引用会留在新一代上（Prologue #39 修，随 parked-run 换进来）；Molis 的作业步骤没有负责人、不会被交接，不受影响。

验证（2026-10-17）：
- 同一棵树（干净归档）上 build dist、`tsc` 无错；SDK 全量 353 个文件，3971 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live` 与 `computer-use.live`，它们操作真实桌面与浏览器）；
- 这个包上 13 个消费者脚本全过；
- 同样的步骤打第二次，字节数与 SHA-256 相同。

重建命令与工具版本：来源记录（`.provenance.json`）随包删除，从 `102671ce6^` 取回。

Molis 侧的验证（这一刀只换包，不写进采用 spec）：
- 在 main `dd2bac58` 上换包：`pnpm install --frozen-lockfile --offline`、`pnpm build` 通过。
- 非浏览器用例 132 个文件（全部 `prologue-*`、`agent-*`、`assistant-*`、`interaction-*`、MCP 与 Coding 步骤用例、`vendor-provenance`、`security-invariants-*` 中的非浏览器部分）一次全过；S-13 的 `prologue-memory-boundary` 在其中，在新包上再过一次。
- `pnpm test:security` 59/59，`pnpm test:contracts` 44/44（动作合同快照没有变化）。
- 浏览器用例交给全量，由统筹跑。
- `check-health-gates --base origin/main`、`boundary:check`、`verify-release-versions` 都过；vendored SDK 仍是 1 份，没有数字变化。

#668 起是 main 的依赖，同日换成 parked-run；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## 上一份：mcp-schema-annotations（#650，2026-10-17 换掉）

上一份包 `prologue-sdk-0.0.0-rc.1-mcp-schema-annotations.tgz`（1,192,221 字节），SHA-256 `15f69f92c7e62dbe5a5d68ccfe3297b019ff21a6ec8018e222019c192b1681a5`。来源为上游 main `d2b3daa3de0744504b3098a17604f5f66019a29e`，即 [Prologue #36](https://github.com/molis-ai/prologue/pull/36) 的合并；无补丁、dirty 为 false，保留此前统一包能力。

MCP 校验副本识别 default 与合法一级 x-mcp-header 注解，原始 schema 仍用于漂移检查；实际派出前校验参数值，不填默认值、不实现新协议头映射、不放宽模型 schema。采用合同与 Molis 验证见[采用 spec §6.0m](../../specs/prologue-adoption/spec.md#60m-mcp-参数注解与派出校验的统一-sdk2026-10-17)。

SDK 24 文件 299 项回归、类型与构建通过，13 个干净包消费者通过；实际 GitHub MCP 发现 46 个工具并读取 Issue #1，零写入与模型请求。合并归档独立构建与已测包字节一致。Molis 整体构建通过，58 个相关非浏览器文件完成验证；首次发现动作目录也拒绝该注解，采用同一动作 schema 副本整理后，相关三文件 29 项通过。包边界、merge-base 健康门禁、页面资源和版本核对通过；真实模型验收另行记录。#650 起是 main 的依赖，同日换成 app-wait-ends-step；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## 上一份：app-tools-waits（2026-10-17）

上一份包 `prologue-sdk-0.0.0-rc.1-app-tools-waits.tgz`（1,191,251 字节），SHA-256 `3025a11ec219210a5e565ee2f81746c9597c15db43d920c574edcbf90f8ac229`。来源为上游 main `86be989137f05b3bb90ca883540c256baf58a227`，即 [Prologue #35](https://github.com/molis-ai/prologue/pull/35) 的合并；不加补丁、dirty 为 false，原有 #33 对象引用题与 #34 MCP refresh 保留。

本次新增：App-tools 可声明 board-wait，但只有绑定当前持有节点的顶层 Run 才能使用；仅允许 App 的只读外部检查器。命令、信封、节点和待答问题条件拒绝，不获得文件或 shell 能力。仍由现有任务图负责持久等待、授权复核、取消和单次接续。Molis 的角色与业务流程不在此换包里调整；采用合同见[采用 spec §6.0l](../../specs/prologue-adoption/spec.md#60l-app-tools-只读外部等待的统一-sdk2026-10-17)。

验证：SDK 构建和完整类型检查通过；非浏览器回归 350 文件、3951 项通过，6 文件、21 项按既有条件跳过，无类型错误。新增 11 项等待用例包含重启、等待期间零模型请求、唯一接续、撤权与迟到结果拒绝；13 个干净安装消费者全部通过。本次未运行真实 Chrome 与真人桌面控制。干净合并归档与已测工作树独立构建得到相同 tgz 字节；重建步骤与工具版本见来源记录。Molis 构建和生产调用链验证仍在进行，真实模型验收不由 SDK 工程结果代替。

## 上一份：mcp-refresh（2026-10-17）

上一份包 `prologue-sdk-0.0.0-rc.1-mcp-refresh.tgz`（1,191,156 字节），SHA-256 `5d1a5fcdae587a9717c71e29d7a1aba58d990244b7210b0f4984e3d937e90021`。

- 来源是上游 main 的 `e69b71cf91fd34b737ce8744c65bfb14d54b2686`：[Prologue #34](https://github.com/molis-ai/prologue/pull/34) 的合并，当时的 main 头，树与评审过的 head `2ad21042` 相同。
- 从干净 `git archive` 构建，不加补丁、`dirty: false`。

比上一份多的只有 #34：

- `Runtime.refreshMcp({ ref, signal? })` 在 Runtime 已经连着的那条 MCP 会话上，重读服务声明的工具、资源与提示。
  - 不重连、不起新进程、不执行工具，也不把新工具接进正在跑的 Run。
  - 读全了、会话也还是这一条，才原子替换 registry 的快照；失败、取消、迟到的结果都保留上一份。
- 派出工具调用时，按 registry 当前的工具形状核，不再按传输刚连上时的列表。刷新以后，旧形状和已删除的工具在发出前就被拒。

Molis 现在没有调用 `refreshMcp`，统一连接管理的「检查连接」（ASC-12 / ASC-14）以后再接。Molis 的 MCP 连接（`horizontal/agent-host/src/adapters/prologue-mcp.ts`）照旧走 `connectMcp` 和 `adoptMcpTools`；派出时核对的形状，在不刷新时和连上时的列表是同一份。

验证（2026-10-17，`prologue-verify.sh`）：
- build dist、`tsc` 无错；
- 同一棵树上的 SDK 全量 356 个文件，3951 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live`，它会操作真实桌面）。其中有 `mcp-discovery-refresh.live`（REFRESH-01～03），和 `public-surface`（公开面快照没变，只是 Runtime 的 A 档多了 `refreshMcp`）；
- 这个包上 13 个消费者脚本全过；
- 同样的步骤打第二次，字节数与 SHA-256 相同。

重建命令与工具版本：来源记录（`.provenance.json`）随包删除，从 `447bec2e0^` 取回。

Molis 侧的验证（这一刀只换包，不写进采用 spec）：
- 在 main `5239a371` 上换包：`pnpm install --frozen-lockfile --offline`、`pnpm build` 通过，装上的 SDK 带 `refreshMcp`。
- 非浏览器用例 201 个文件：`affected-tests --wide` 里引用 agent-host 的全部 154 个用例中的非浏览器部分，加上全部 MCP、`prologue-*`、`agent-*`。199 个一次过。
  - `alchemist-mcp`、`cognia-mcp` 在满载批次里超了 120 秒；单独跑，在新包和干净基线（main `446c0521`，旧包）上都过，各 12～14 秒。
- 5 个浏览器用例（`agent-built-plugins-components`、`mcp-access-browser`、`alchemist-client-boundaries.e2e`、`alchemist-workbench.e2e`、`workbench-stop-feedback.e2e`）交给全量，由统筹跑。
- `pnpm test:security` 58/58，S-13 `prologue-memory-boundary` 在新包上再过一次；`pnpm test:contracts` 44/44。
- `check-health-gates --base origin/main`、`boundary:check`、`verify-release-versions` 都过；vendored SDK 仍是 1 份，没有数字变化。

## main 上的上一份：reference-kinds（#632，2026-10-17 换掉）

`prologue-sdk-0.0.0-rc.1-reference-kinds.tgz`（1,190,630 字节），SHA-256 `585909b1e7fc243828927ff229069445a9056ce2ffb65c17d13c57f6b9372c0c`。来源是上游 main 的 `c673238e340d253f7a794133d547b9f5c34b473b`（[Prologue #33](https://github.com/molis-ai/prologue/pull/33) 的合并，当时的 main 头；树与评审过的 head `a579bfea` 相同），从干净 `git archive` 构建，不加补丁、`dirty: false`。比上一份多的只有 #33：App 可以在 `config.tool.askUserReferenceKinds` 列出对象引用题能要的种类（每类 `kind` 和给人看的 `title`）。配了，`ask-user` 参数里 `refKinds` 的每一项是这几个种类名的 `enum`；模型写了名单外的种类，打开等待前就失败，工具结果说出 App 有哪几类。不配时与原来逐字相同。Molis 这一次只换包、不配名单，名单由交互线 T2 接上。

验证（2026-10-17，`prologue-verify.sh`）：
- build dist、`tsc` 无错；
- 同一棵树上的 SDK 全量 355 个文件，3949 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live`，它会操作真实桌面）；
- 这个包上 13 个消费者脚本全过；
- 同样的步骤打第二次，字节数与 SHA-256 相同。

重建命令与工具版本：来源记录（`.provenance.json`）随包删除，从 `5b9fdbf35^` 取回。Molis 侧的验证写在 [采用 spec](../../specs/prologue-adoption/spec.md) §6.0j。#632 起是 main 的依赖，同日换成 mcp-refresh；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## main 上的上一份：parameter-branches（#615，2026-10-17 换掉）

`prologue-sdk-0.0.0-rc.1-parameter-branches.tgz`（1,189,325 字节），SHA-256 `c6f421292cfcdbadb1dd7db5e8a3175766d9515ae4d25205b732e318c434590f`。来源是上游 main 的 `4e8468ddb6eb8fd0ca48110adb77a316c7048332`（[Prologue #32](https://github.com/molis-ai/prologue/pull/32) 的合并，当时的 main 头；树与评审过的 head `acf7efdb` 相同），从干净 `git archive` 构建，不加补丁、`dirty: false`。比上一份多的是 [#31](https://github.com/molis-ai/prologue/pull/31) 和 #32：
- #31：会话可以给自己包里的工具参数加分支（`sessions.open` 的 `parameterBranches`）。每次组请求时现问，登记时那一份永远是其中一支，调用照旧按登记核。
- #32：`ask-user` 的数字题可以带 `unit`。只用来显示，答案仍是不带单位的数，存盘读回都带着。

验证（2026-10-16，`prologue-verify.sh`）：
- build dist、`tsc` 无错；
- 同一棵树上的 SDK 全量 355 个文件，3946 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live`，它会操作真实桌面）；
- 这个包上 13 个消费者脚本全过；
- 同样的步骤打第二次，字节数与 SHA-256 相同。

重建命令与工具版本：来源记录（`.provenance.json`）随包删除，从 `7bf9b7a1e^` 取回。Molis 侧的验证写在 [采用 spec](../../specs/prologue-adoption/spec.md) §6.0f。#615 起是 main 的依赖，2026-10-17 随 P4-C2 换成 reference-kinds；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## main 上的上一份：find-tools-deferral（#599，2026-10-16 换掉）

`prologue-sdk-0.0.0-rc.1-find-tools-deferral.tgz`（1,187,709 字节），SHA-256 `29013b0cbeaa01e981376d9c5efb7424764b1e78280deb3f0a3bf39239711b0d`。来源是上游 main 的 `be78f726df55d76e7ab7bd5889d4eeb89b049173`（[Prologue #30](https://github.com/molis-ai/prologue/pull/30) 的合并，当时的 main 头；树与评审过的 head `97f9484f` 相同），从干净 `git archive` 构建，不加补丁、`dirty: false`。比上一份多的是 #29（只改文档）和 #30：一轮只要延后了工具，`find-tools` 就带着名册在请求里、调得动，不看这一轮的工具名单和 Character 点没点它；Tool 那道门、提前开跑和明文调用提升照同一个判据收它。一条都没延后时照旧摘掉。

验证（2026-10-16）：build dist、`tsc` 无错；同一棵树上的 SDK 全量 354 个文件，3938 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live`，它会操作真实桌面）；这个包上 13 个消费者脚本全过；同样的步骤打第二次，字节数与 SHA-256 相同。Molis 侧的验证写在 [采用 spec](../../specs/prologue-adoption/spec.md) §6.0e。#599 起是 main 的依赖，同日换成 parameter-branches；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## main 上的上一份：found-tools（#581，2026-10-16 换掉）

`prologue-sdk-0.0.0-rc.1-found-tools.tgz`（1,186,918 字节），SHA-256 `cfed7ff4653289c67ee0dd2801e1b6d9a287d6c8873f477b4927e12dbf510705`。来源是上游 main 的 `e4afd1a718bd8a8629d52526b953bbe75149baa6`（[Prologue #28](https://github.com/molis-ai/prologue/pull/28) 的合并，当时的 main 头；树与评审过的 head `af7be966` 相同），从干净 `git archive` 构建，不加补丁、`dirty: false`。比上一份多的只有 #28：`find-tools` 交出过形状的工具，之后的请求照常声明（记成 Run 事件 `tools-found`，接着历史的下一跑照它接上）；只列了名字的延后工具，Model 那道门也照收；检查器可以说出参数形状（`ConditionCheckers.list()`、`CheckerDescriptor.params`），`board-wait` 的 `params` 照它写类型、登记时先按它核。

验证（2026-10-16）：build dist、`tsc` 无错；同一棵树上的 SDK 全量 354 个文件，3931 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live`，它会操作真实桌面）；这个包上 13 个消费者脚本全过。重建命令与工具版本：来源记录（`.provenance.json`）随包删除，从 `3870004d6^` 取回。Molis 侧的验证写在 [采用 spec](../../specs/prologue-adoption/spec.md) §6.0e。#581 起是 main 的依赖，同日换成 find-tools-deferral；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## main 上的上一份：collaboration（#534，2026-10-16 换掉）

`prologue-sdk-0.0.0-rc.1-collaboration.tgz`（1,182,902 字节），SHA-256 `9f001edeec1d6832ab1ca2e6443398ab2ab376f9cb15fc92e6393fce0c35ca62`。来源是上游 main 的 `e51233699c1463e3c8f0a8b08658c5860c962769`（[Prologue #27](https://github.com/molis-ai/prologue/pull/27) 的合并，当时的 main 头），从干净 `git archive` 构建，不加补丁、`dirty: false`。过渡线到此结束：包里是上游 main 上的 P2a–P2k（任务图协作：输入引用、代次与尝试、运行绑定、门禁与派出、派出四步与 `admitDispatch`、重启恢复、受限通信、等待、接续、外部条件、按节点判冲突）、S4、窗口图、换模型的同步 beforeAccept 复查（#24）和撤销资源不逐块写墓碑（#27）。

验证（2026-10-15，`prologue-verify.sh`）：同一提交上的 SDK 全量 3924 条通过、0 条失败，13 个消费者脚本全过；Molis 侧见 [采用 spec](../../specs/prologue-adoption/spec.md) §6.0d。#534 起是 main 的依赖，2026-10-16 换成 found-tools；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## main 上的上一份：interim-p1-cu-image-acceptance（#523，2026-10-15 换掉）

`prologue-sdk-0.0.0-rc.1-interim-p1-cu-image-acceptance.tgz`（1,123,719 字节），SHA-256 `317d097a1e44f84e501413283bdfa94c4b43ee4ac86a689957b9b83d2853597c`，来源 [Prologue #20](https://github.com/molis-ai/prologue/pull/20) 的 `4007a93c8901f090994bff8d847009982958bdef`：CU-image 过渡线（`08b84296` 加窗口图 `d8c96e29`、公开 API 快照修正 `b88b2422`）再加同步 beforeAccept 复查。该来源不在上游 main（同样的改动在 main 上是 #24）。#523 起是 main 的依赖，同日随 P3a 换掉；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## main 上的上一份：computer-use（#471，2026-10-13 换掉）

`prologue-sdk-0.0.0-rc.1-computer-use.tgz`（1,074,186 字节），SHA-256 `0272431a46d0201dfc5aa4d12af648d8cc0f129a1eb1454a5123a8518826d282`，来源 `d4908c118f7899d44e3d1975806797a05f0094b9`（`c4b9fde3` 上的五个桌面 Computer Use 提交；打包时没有推到远端，2026-10-13 推送并随 PR #15 进上游 main）。#471 起是 main 的依赖，同时留在目录里的还有旧的 side-panel-memory 包与补丁（#408 已删，见下）。重建：`git archive d4908c118f7899d44e3d1975806797a05f0094b9`，其余步骤同上。已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## 更早的正式依赖：side-panel-memory（2026-09-30，平台侧栏的界面控制 + 平台记忆；2026-10-12 换掉）

`prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz`（953,138 字节），SHA-256 `942de9c594d8fc0bbb81d3b36d766761427ff51c2c4cee33aab342033c85846c`。

已从本目录删除，包记在 `patch-history.json` 的 `patches`（`side-panel-memory.patch` 的 `package`，`gitBlob` `432e002a`）。下面保留它的来源与重建记录。

**来源**：上游 `molis-ai/prologue` 提交 `9fc3b17386419625a36359b74fb4789c17a3adc8` 的 `packages/sdk`，不加补丁。这个提交在上游 main 里：分支 `feat/molis-side-panel-surfaces-on-memory` 已经作为 PR #3 合入（2026-09-30），2026-10-08 核对时远端只有 `main` 和三个 pull 引用。在 assistant-intake 包的来源（`c63ea1a1`）之上叠两条线，合成一个包给侧栏与记忆两边共用：

- 平台记忆（记忆会话，`f80130ab`、`9773d59a`；上游 PR #2）：条目元数据与暂停、中日韩召回、固定注入的回执、按范围持久的候选；候选按 App 最终给出的出处与信息落定，或并入它更正的已有条目。
- 侧栏的界面控制（specs/archive/side-panel，`d7aba36b`、`3f8ffd15`、`e0a2f059`、`356ae236`、`9fc3b173`）：
  - 界面归属会话，另一会话的界面与观察一律拒绝；
  - App 模式在本会话挂了界面时放行 `surface-list/observe/act`，本轮工具名单和 Character 绑定两道检查用同一份名单；
  - 文字观察以 `<untrusted-page-content>` 交给模型；
  - `surface-act` 经闸门等人批准，等待的时间不算进观察的新鲜期；等完之后取 Runtime 时钟；
  - `effects.forget` 收回记住的批准；
  - 要输入的文字作为审查正文，批准的人看得见准确内容；
  - 还没打开网站的浏览器页面，scope 为 `about:blank`。

**重建**（2026-10-08 在 macOS arm64、Node 24.14.0、pnpm 11.9.0 上实际跑过：打出的包与仓库里的逐字节相同，953,138 字节，同一个 SHA-256；上游根 `package.json` 钉的也是这两个版本）：

```bash
git -C <prologue 克隆> archive 9fc3b17386419625a36359b74fb4789c17a3adc8 | tar -x -C <空目录>
cd <空目录>
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @prologue/sdk build
cd packages/sdk && pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz
shasum -a 256 /absolute/path/to/prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz   # 与 .sha256 一致
```

早先的写法是检出 `af7375c7` 后 `git apply side-panel-memory.patch`（225,092 字节，SHA-256 `1f64a15ce9d5d90d0f4ace90211c147efdea189d225c9236fc138438e86c7c55`）：补丁只含 `packages/sdk`，应用后与 `9fc3b173` 的 `packages/sdk` 逐文件相同（2026-10-08、2026-10-12 复核），两条路得到同一个包。补丁本身已删（2026-10-12，用户确认），记录在 `patch-history.json`，按 `gitBlob` 取回。

**验证**：

- 在 `9fc3b173` 上，记忆的 memory-export / extract / persist / platform / project-scope 与界面的 app-mode-surfaces / ui-control / plugin-manifest / computer-use 测试全过；
- Molis 侧，换包后 `pnpm build`、`boundary:check`、`typecheck:all` 通过，tests/side-panel-* 通过；
- 真实模型（MiniMax-M3）跑通了侧栏浏览器的查看、确认、接手交还、上传与网站决定。

包的依赖与 assistant-intake 相同，没有新增。记忆线已改用本包，memory-platform.tgz 与 memory-platform.patch 已删除（经用户同意，2026-10-01），其源码是上游 main 里的 `9773d59a`（PR #2）。assistant-intake.tgz 换包后不再被依赖，用户 2026-09-30 决定删除，已删掉，它的 SHA-256 与来源记在 `patch-history.json` 的 `packagesWithoutPatch`。

## 已删除的历史补丁（2026-10-08）

26 份补丁（合计 2,791,897 字节）是历史包的重建材料。重建当前包用不着它们（当前包不加任何补丁），按决定从树里删掉；Git 历史不改写。记录在 [`patch-history.json`](patch-history.json)：

- `patches`：26 项，每项有 `bytes`、`sha256`、`gitBlob`（补丁在 Git 里的对象号）、`base`（基线提交）、`commit`（补丁重建出其树的上游提交，没有则为 `null`）、`sourceKind`、`source`、`summary`，以及它产出的包 `package`（文件名、字节数、SHA-256、`gitBlob`）；
- `packagesWithoutPatch`：32 个没有补丁的历史包（文件名、字节数、SHA-256、`gitBlob`、提交、说明），含本次换掉的 attachment-order、之前的 after-write-check-marker、after-write-check-key、after-write-check、parked-run、app-wait-ends-step、mcp-schema-annotations、app-tools-waits 与 mcp-refresh，以及 2026-10-12 换掉的 dirty 候选 a0-s1 和 adoption-receipts-fields、2026-10-13 换掉的 adoption-receipts-handling 与 main 上的 computer-use、2026-10-14 换掉的 interim-p1-cu，同日换掉的 interim-p1-cu-image，2026-10-15 换掉的 interim-p1-cu-image-acceptance，2026-10-16 换掉的 collaboration、found-tools 与 find-tools-deferral，2026-10-17 换掉的 parameter-branches 与 reference-kinds，以及随 #472 进入 main 历史的 molis-adoption；换掉的 side-panel-memory 包记在 `patches` 里 `side-panel-memory.patch` 的 `package`；
- `upstream`：41 个 Prologue 提交于 2026-10-23 对 main `2c7feba5a6ea85e81e4a263671fb5e68f536d86a`（上游仓库已改名 `molis-ai/molis-prologue`）逐项核对；除三个已替换的过渡包来源 `08b84296`、`923e5a40`、`4007a93c` 以外，均为 main 祖先。这三个过渡提交自身不在 main，记录如实保留。`21cdfbf8`、`d4a2f41b`是Molis仓库提交，不是Prologue提交。

怎么取回并核对：

```bash
# 任一补丁或包：按记录里的 gitBlob 取，再核对 SHA-256
git cat-file blob <gitBlob> > claims.patch
shasum -a 256 claims.patch   # 与该项的 sha256 一致
# 或按提交取：26 份补丁（含 side-panel-memory.patch）和带逐包验证记录的旧版 README 都在 e4bdeb12，
# 此后到删除它们的那次合并之前的每个提交里也都有
git show e4bdeb12:vendor/prologue-sdk/claims.patch > claims.patch
```

补丁里的 `sourceKind` 有三种：

- `upstream-commit`（8 份）：补丁施加到基线上得到的整棵树（`side-panel-memory.patch` 只含 `packages/sdk`，包内逐文件相同）与所写的上游提交相同（实测）。这几份可以从上游重新导出。
- `uncommitted-worktree`（17 份）：来源是未提交的工作树（`~/code/prologue-*`），这些工作树已不在，补丁没有自己的提交。它们的基线都是 `a7e785b8`，都能干净应用在基线上（2026-10-08 实测），新增的非空行绝大部分在 `af7375c7` 里（方案 §4.5 的逐行比对，标为推断）。
- `molis-repo`（1 份，`network-dispatch.patch`）：补丁只保存在 Molis 仓库里，包 `network-dispatch.tgz` 的 SHA-256 记在 `patches[].package`。

没有记录的东西：最早的 `prologue-sdk-0.0.0-rc.1.tgz` 没有对应的源码提交，不能当作任何一个提交的构建；其余本地中间包不是依赖，也没有作为分发物提交过。
