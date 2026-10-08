# Prologue SDK 构建来源

本目录的规则见 [AGENTS.md](../../AGENTS.md)：只放当前使用的 Prologue 包（最多再加一份在途分支的），换新包时删掉旧包，旧包从 Git 历史取。

目录里现在有三样东西：

- 当前包 `prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz`（`horizontal/agent-host/package.json` 以 `file:` 依赖它）；
- 重建它要用的唯一一份补丁 `side-panel-memory.patch`，步骤见下一节；
- 本文件：当前包的来源，以及已删除的历史补丁与历史包的大小、SHA-256 和来源。

另外两个 vendored 包各自带 `.sha256`、`provenance.json` 和 `sbom.cdx.json`：[intelligence-client](../intelligence-client/)、[search-evidence-layer](../search-evidence-layer/)。这三个包的 tgz 按决定（2026-10-08，[spec](../../specs/repository-anti-corruption/spec.md) §1「Prologue SDK 收敛与私有包」）将来改从私有 registry 或 release 附件取，不再放进公开仓库；registry 就绪前仍留在仓库里。`pnpm health:check` 限制本目录的 tgz 份数（`tooling/gates/limits.json` 的 `vendoredPrologueSdk`）。

## 当前依赖：side-panel-memory（2026-09-30，平台侧栏的界面控制 + 平台记忆）

`prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz`（953,138 字节），SHA-256 `942de9c594d8fc0bbb81d3b36d766761427ff51c2c4cee33aab342033c85846c`。在 assistant-intake 包的来源（prologue `c63ea1a1`）之上叠两条线，合成一个包给侧栏与记忆两边共用：

- 平台记忆（记忆会话，`f80130ab`、`9773d59a`）：条目元数据与暂停、中日韩召回、固定注入的回执、按范围持久的候选；候选按 App 最终给出的出处与信息落定，或并入它更正的已有条目。
- 侧栏的界面控制（specs/archive/side-panel，`d7aba36b`、`3f8ffd15`、`e0a2f059`、`356ae236`、`9fc3b173`）：
  - 界面归属会话，另一会话的界面与观察一律拒绝；
  - App 模式在本会话挂了界面时放行 `surface-list/observe/act`，本轮工具名单和 Character 绑定两道检查用同一份名单；
  - 文字观察以 `<untrusted-page-content>` 交给模型；
  - `surface-act` 经闸门等人批准，等待的时间不算进观察的新鲜期；等完之后取 Runtime 时钟；
  - `effects.forget` 收回记住的批准；
  - 要输入的文字作为审查正文，批准的人看得见准确内容；
  - 还没打开网站的浏览器页面，scope 为 `about:blank`。
- 来源：prologue 分支 `feat/molis-side-panel-surfaces-on-memory`，头 `9fc3b173`。这些提交暂未推到 prologue 远端，由合并协调统一推。
- 重建：检出 `af7375c7`，`git apply side-panel-memory.patch`（225,092 字节，SHA-256 `1f64a15ce9d5d90d0f4ace90211c147efdea189d225c9236fc138438e86c7c55`）。补丁只含 `packages/sdk`，应用后与 `9fc3b173` 的 `packages/sdk` 逐文件相同。然后 `pnpm install --frozen-lockfile`、`pnpm --filter @prologue/sdk build`，在 `packages/sdk` 执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz`。
- 验证：
  - 在 `9fc3b173` 上，记忆的 memory-export / extract / persist / platform / project-scope 与界面的 app-mode-surfaces / ui-control / plugin-manifest / computer-use 测试全过；
  - Molis 侧，换包后 `pnpm build`、`boundary:check`、`typecheck:all` 通过，tests/side-panel-* 通过；
  - 真实模型（MiniMax-M3）跑通了侧栏浏览器的查看、确认、接手交还、上传与网站决定。
- 包的依赖与 assistant-intake 相同，没有新增。记忆线已改用本包，memory-platform.tgz 与 memory-platform.patch 已删除（经用户同意，2026-10-01）；源码在 prologue 远端分支 feat/molis-memory-platform（9773d59a）。assistant-intake.tgz 换包后不再被依赖，用户 2026-09-30 决定删除，已删掉；需要时从 Git 历史取。

## 已删除的历史补丁（2026-10-08）

下面 25 份补丁是历史包的重建材料。重建当前包用不着它们（当前包的补丁相对 `af7375c7`，不叠加其中任何一份），按决定从树里删掉。Git 历史不改写：删除前最后一次含有它们的提交是 `e4bdeb12`，那时的旧版 README 也在里面，有各包的逐项验证记录。取回并核对：

```bash
git show e4bdeb12:vendor/prologue-sdk/claims.patch > /tmp/claims.patch
shasum -a 256 /tmp/claims.patch   # 与下表一致
```

「对应的包」的 tgz 都已先后从树里删掉（2026-09-28 起，最近一批在 2026-10-02），包的 SHA-256 取自当时的 README。源码工作树都在开发机本地（`~/code/prologue-*`），除标明已推送的提交外没有推到 molis-ai/prologue，别人无法据此重建；所以这里留下大小、SHA-256 和来源，不再留补丁正文。当前包的源分支要推到 Prologue 远端，见 [BACKLOG](../../specs/BACKLOG.md) BL-024。

| 补丁 | 字节 | 补丁 SHA-256 | 对应的包 | 包 SHA-256 | 来源与内容 |
| --- | ---: | --- | --- | --- | --- |
| `claims.patch` | 458,308 | `9248c7fdb87f650749d623b4ba64c93df595e05c94b3345793220bb54f176471` | `claims.tgz` | `0a616614ae5882d20016c4ac07de30f149e0d78e05ff459e29689c0b5eefb43c` | molis-ai/prologue 分支 `codex/molis-coding-collab`，提交 `af7375c7`（基线 `a7e785b8`）；补丁与该提交相对基线的差异逐字节相同。协同第一至五期：任务图负责人与交接（`handOver`）、常开任务图、会话间信件持久化、后台命令与挂起唤醒、给人看的信；可选项 `continueWhenCompactionFails` 与 `retryUnansweredModelCalls`。 |
| `ledger-status.patch` | 257,429 | `32121cd6f32bba0d3349e943f0077ab9bab60849a3f3143d172b8bc97f7fb8d8` | `ledger-status.tgz` | `a50e14cd8bd4afb2fa2f041e639855d21848ee4c9ffbe3c0a010b136e714f2fd` | `~/code/prologue-molis-integrated`，基线 `a7e785b8`，未提交的累计补丁（77 个文件）。Session 账本保存 400–599 的 HTTP 状态；工具超时默认值归 Runtime 配置，去掉 runtime 与 tool 的双向依赖。已并入 claims。 |
| `cache-breakpoint.patch` | 247,275 | `67080d78dc1dc1638413234c1eb41b94d1b6d83cfa45bc2516d1fa8a70c1ff51` | `cache-breakpoint.tgz` | `61bb2ee7a56b70c42e5a65dbbec3159cf08620a9f75f1d9672238aaa5d7bb964` | `~/code/prologue-molis-integrated`，基线 `a7e785b8`，未提交的累计补丁（74 个文件）。没有系统段时把 Anthropic 缓存断点挂到最后一条用户消息；修 `test/host-agnostic-adapters.test.ts` 的类型错误。 |
| `coding-inference.patch` | 240,972 | `8a2c2cb6b1c2380641d0286ed870687d6879a8f21ae4f04f0a1a6df5ef27966c` | `coding-inference.tgz` | `76fc2bda33a3f94d28e0f27be3f83dc2a2a2d5f061c080dc5dc977a016b93c03` | `~/code/prologue-molis-integrated`，基线 `a7e785b8`，未提交（72 个文件）。先 `git apply parent-reads.patch`，再 `git apply --3way bounded-inference.patch`，三方合并零冲突：Coding 线与共享推理线合成。 |
| `bounded-inference.patch` | 155,672 | `7c76c342b0c05ba47d7b6a4f507d9ae26a8ffa4fdb6d5dfc6ad8bd9ac3de594a` | `bounded-inference.tgz` | `9c6d6c0975334c029328d98306c5d5b58a764390d3196a4cdce94e48d4d8166e` | 共享推理线（原工作树 `~/code/prologue-action-loopback`），基线 `a7e785b8`，未提交，含 model-loopback 修复。有界文字、OpenAI/Gemini 图片、原生 TypeSafe、每次真实网络派出前的 Host 权限复核。 |
| `parent-reads.patch` | 109,089 | `af374ba71bc14bc01b7f45a61b89948fcda1d7ea1d0b25c119b0e84f04e03e68` | `parent-reads.tgz` | `3584a8b6c21c6761d65f9ed9c4320ecf570bcd52aba5ee470d6f984eb75d34e3` | Coding 线：`~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交的累计补丁。分派到独立目录的父任务可只读这些目录（`subagents.parentReads`）。 |
| `role-tools.patch` | 91,553 | `67a3aa642d2ae3998aa7f8dddcb35d0496a81702adc4e6107d4b8c7b928fef44` | `role-tools.tgz` | `8e544ec408c6f6ea5c6321d20080c6f7001a91c41fe7163f4d61249a3bcb99b2` | `~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交的累计补丁。子角色带着它声明、且父任务本轮也有的工具去派出；父任务没有的工具仍然整次失败。 |
| `character-precheck.patch` | 87,269 | `dfca57cb8ab04f00d5c4d11157be2370499083a56cdaa53909d98c1d1c36478a` | `character-precheck.tgz` | `2015571474b5dbc6033d74d54f6a9456fac7ddc588a737536e3811d0fe76cecc` | `~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交的累计补丁。派出子任务写错角色版本时，在审查前以 `CHARACTER_NOT_FOUND` 拒绝并列出现有版本。 |
| `subagent-close.patch` | 84,217 | `4cfffc68f5a744a0f18c36e0d1ac903dc1a5571dc85af78ba28681941b4d82b9` | `subagent-close.tgz` | `c054fe2e7fd45b0a78c4f0a0614436cda5e27fd1341bafc9abc082505e51dd1e` | `~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交的累计补丁。核对并结束子任务被中断的那一轮后，立即重读子任务登记表，子任务有终态。 |
| `board-same-state.patch` | 78,764 | `91761254666c6a3c4330a4236d2dd4bd00c2feca3797ce48796ce3d0438a7b8e` | `board-same-state.tgz` | `4070d1b2939a084c5da2caa88f979e03ee355334c9262f6ddb5333a07b9a6e7d` | `~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交的累计补丁。任务图报告一个步骤已在的状态时只记进展，不算冲突；显式 transition 仍严格拒绝。 |
| `large-read.patch` | 75,886 | `cebaa6cc540245c473b554afee480728cde58d34c403a4c386b83f3a01c5cd1f` | `large-read.tgz` | `9ec1243b2eb0bd08fdb866926021a8e714dd77cff8c1afa9da23c64ea46c4ebb` | `~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交的累计补丁。read 工具有 `offset`/`limit` 行窗；edit 与补丁准备为生成差异可整读到 2MB。 |
| `search-large.patch` | 61,930 | `a6591f0a0072365d4f0c2ddb7033655913319f85977c65bff499a970e733767a` | `search-large.tgz` | `4a40774bf8f6fb111e12da40b83304f1253ea4fcb4b7ca1975d1c8c2da4ac123` | `~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交的累计补丁。搜索单个文件可读到 2MB，更大的仍跳过但计入“没搜全”；Tauri 原生 Host 同步修正。 |
| `search-scope.patch` | 58,103 | `74148e65fb4de7c8ccb86157adeeea6858f5bd4569aca01242065f19bf5b3c6c` | `search-scope.tgz` | `11307936c5b68c42460865a407cf4db5c0081a5ac444be674b246b53346a2bb4` | `~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交的累计补丁。搜索上界提到 20000 个文件，到上界时结果带 `truncated`；Tauri 原生 Host 同步修正。 |
| `search-file.patch` | 50,975 | `ce563d89dc0bab3268da2216652c580fc7dca750b593ccfd5d36f063a1bfe88e` | `search-file.tgz` | `fd822866fe9125a641123f056c0f4e94c6416540ac5cbc56677c94bb08e93551` | `~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交的累计补丁。搜索路径可以是单个文件，路径不存在报 `ROOT_NOT_FOUND`；Tauri 原生 Host 同步修正。 |
| `file-mode.patch` | 43,090 | `28bf633436ca2ff2078a41f2768a6433169ca074ddd4b5768d9e723bcba5036d` | `file-mode.tgz` | `f9ca532288b8b6a3d3f68b575f48458f948f8ab93ac29244beb7fce840438398` | `~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交的累计补丁。工作区写入保留文件原来的权限，新文件按默认权限。 |
| `dispatch-key.patch` | 39,459 | `11cbafb86473bfb7b6ba77f350c8788c3b2952e3802dde7bff9622a9262fb944` | `dispatch-key.tgz` | `35367d16ad89cc9b1aac0beaab9fa105e79f07c48addea19cf19d36c52ef81b8` | `~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交的累计补丁。派出键（`idempotencyKey`）进入审查前就按存储地址格式校验。 |
| `output-continuation.patch` | 34,225 | `8b5acc173ce76f1dc5ee11be1ef8c665ea4600b8d28dd593b10ed0a355cef2ae` | `output-continuation.tgz` | `a8a8d1563cf7257015f54ac385f58c189b6e0407b2f4a6a1a5889d88c4a36c6b` | `~/code/prologue-output-continuation`（detached），基线 `a7e785b8`，未提交；先应用 model-loopback.patch 再改。被输出上限截断的回答接着写完，续写上界 8 次，超过以 `MODEL_OUTPUT_TRUNCATED` 失败。 |
| `model-loopback.patch` | 21,154 | `f6a1c161b6f8a8a7dde0b0dce06c03fadb976740cb22fcfb0f1e12277ce88722` | `loopback-model.tgz` | `5eb410ce861d12c987f45515fc605acc59dc8ee558fcd1786b792d6eaae3e3ae` | `~/code/prologue-action-loopback`，基线 `a7e785b8`，未提交。模型目录允许本机 HTTP 而 Run 启动只收 HTTPS 的不一致；回环精确识别 IPv4/IPv6；含 Rust Host 的一致性修复。 |
| `dispatch-denied.patch` | 10,191 | `5d425a16c2d0d4b112759e3fb63688f70ae8132027cc4e3d25b76bdc6cf38308` | `dispatch-denied.tgz` | `3b8dcca04121e458e3c5f6d4fed77617f2e68178dccaad5cfcdb602601bc7c6f` | molis-ai/prologue 分支 `fix/molis-dispatch-denied`，提交 `03c6ba0b`（父 `af7375c7`，4 个文件）。App 的派出前复核拒绝时报 `EFFECT_NOT_AUTHORIZED`，不算网络失败，也不换备选目标。 |
| `network-dispatch.patch` | 22,204 | `1698fe484443bcb07016fac87952b8d627b7dad1b63e328894094201a4072884` | `network-dispatch.tgz` | 未记录 | main 提交 `21cdfbf8`，相对 `af7375c7`（8 个文件）；包 `network-dispatch.tgz` 的 SHA-256 当时没有记录。Node Host 对每次真实 fetch 执行可信 App 的 `beforeNetworkDispatch`；已包含在 assistant.patch 与 bounded-results.patch 中。 |
| `bounded-results.patch` | 48,451 | `d5fb9392f14fad2c70d0c25d7ab8aa172c6c61f05ae81e150f8bc674241dfae3` | `bounded-results-network.tgz` | `2269225bc71c3fd4fccaf4cdd5690244f6608348b79a56b73d50bbe6aef6b04a` | `~/code/prologue-dispatch-denied` 分支 `feature/molis-bounded-results`，提交 `4b6cd9bc`，基线 `03c6ba0b`（含 main `21cdfbf8` 的网络授权增量）。`collectRun`、有界文字与结构校验、`decodeJsonOutput`。 |
| `bounded-results-assistant.patch` | 99,441 | `3ca3e60f3a9a11bc2bfd372dc3875a58976de579dacb029272f34625ffe65845` | `bounded-results-assistant.tgz` | `32201e9e8d3ea6bb8de7cd74b155c1e31677b4b61d9bdd431506ac88419b024f` | `~/code/prologue-dispatch-denied` 分支 `feature/molis-bounded-results`，提交 `93bbe1db`（合并 `4b6cd9bc` 与 `4702abe3`），相对 `af7375c7`。有界结果与 Assistant（app 模式、session-stop）两条线合一。 |
| `assistant.patch` | 65,093 | `256d92254d179a2e1fe9caff85c1895b9ba8a4488d00f4e6c140d68af2e2294a` | `assistant.tgz` | `22265b9165486a265cacbed3b080f8b172a0e161b7e718da3220e7d01a9301a5` | `~/code/prologue-assistant` 分支 `feat/molis-assistant-app-mode`：`03c6ba0b` → `6f530d5a`（app 模式）→ `22a1be08`（session-stop）→ `4702abe3`（并入 network-dispatch 增量），相对 `af7375c7`；没有推到 molis-ai/prologue。 |
| `memory-project.patch` | 3,363 | `64fbe525bc7428aa506e51c2504948dab35f1e7d64da9a1da8f25cd07dcf7e29` | `assistant-memory.tgz` | `6c356f5cda731a402c5c5db1bb233f3ea22d2881593c0f7966e50439448998ca` | `~/code/prologue-assistant` 分支 `feat/molis-assistant-app-mode`，提交 `ac4d1135`（父 `4702abe3`），增量补丁（2 个文件）。记忆作用域 `MemoryScope` 新增 `project`。 |
| `resource-intake.patch` | 122,692 | `6ad3f649ffbfba5733f29d80c7aa130913adf4471a8cba7908c77b4b799b89dc` | `resource-intake.tgz` | `2f7c0eb3eda0d748079d628d1260eac1a812afd50d08153483ff502ceb707974` | `~/code/prologue-dispatch-denied` 分支 `feature/molis-bounded-results`，提交 `18a1c827c933eb22624a6904b71d704945567682`（基于 `93bbe1db`），相对 `af7375c7` 的完整补丁。原图摄取与资源限额。 |

## 没有补丁的历史包

这些包的 tgz 同样不在树里，旧 README 只留下了 SHA-256 与来源提交。基线提交 `a7e785b8c76149961d25b2f918aeec55554d8420` 已推到 molis-ai/prologue。

| 包 | SHA-256 | 来源与内容 |
| --- | --- | --- |
| `prologue-sdk-0.0.0-rc.1-assistant-intake.tgz` | `5eab31e2c4a8b2a4d4b9c2bf7ab30804800025b2df709c3cd8c85822782e95b0` | `~/code/prologue-assistant` 分支 `feat/molis-assistant-resource-intake`，提交 `c63ea1a1`（合并 `18a1c827` 与 `ac4d1135`）。重建：检出 `af7375c7`，先应用 resource-intake.patch，再应用 memory-project.patch。 |
| `prologue-sdk-0.0.0-rc.1-compaction-growth.tgz` | `a00d705a28b94894682a5dea78887ac295e78dfc21fd08e8555307a3400cf61f` | 分支 `codex/molis-coding-receipts`，提交 `a7e785b8`（已推送）。一次实际上下文整理后，按新增内容达到原阈值再软触发。 |
| `prologue-sdk-0.0.0-rc.1-step-reports-v2.tgz` | `353ea0bc7c6d6d4e32dda43a597b15f60e82aec5c7e3728b35c2ed8326a89f3f` | 同一分支，提交 `d2f5a05df6459440a253787e94ee6520f12d754d`。`board-report` 允许 blocked 节点解除阻塞；safe-read 经公开 tool-before hook。 |
| `prologue-sdk-0.0.0-rc.1-child-observe.tgz` | `26a0ef1fd3c862949ea0ccc77f26002c639b4971e834179cbfd28e57a5957bd8` | 同一分支，提交 `4d5f874d37287eb2cd87c10a5837013d922555f0`。同步子任务先确认原分派回执，再由同一次工具调用等待原子结果。 |
| `prologue-sdk-0.0.0-rc.1-subagent-report-pages.tgz` | `fb62c2951b4d72c53e45d25390c27cdd786eb04610bca9caedd5362ef4ccd2d0` | 同一分支，提交 `07ad08a11e3b4a01b9fe877dedff1efba6f4833c`。`await-subagents` 的 `reportOffset` 分页读取子任务的完整最终结果。 |
| `prologue-sdk-0.0.0-rc.1-neutral-agent-prompt.tgz` | `cd2bf974c609fe5277313e876857a61b2b03cc79ee5be6b12a37a5f3cb1b6000` | 同一分支，提交 `52c49cf5095e67cd62f4db9e9c1d515afa68ddd8`。去掉 SDK Agent 循环强加的本地项目检查人格和固定 list/search/read 流程。 |
| `prologue-sdk-0.0.0-rc.1-compaction-usage.tgz` | `a6dcf44718152403d5194fde7df0af0cad34b8d280e9a455bb744b0b3d147322` | 同一分支，提交 `a8ac8e1eb7362a2189973cbe7aaa4f4624649ee0`（基于 `46d8092`）。中断恢复、过程与补充要求持久化、上下文整理用量归属。 |
| `prologue-sdk-0.0.0-rc.1-approved-receipts.tgz` | `852620648243866d755d0b733fbc8354e6cee2eb26b7c9bafa3f077025ead14a` | 对应上一行的提交 `a8ac8e1e`。 |
| `prologue-sdk-0.0.0-rc.1-command-feedback.tgz` | `302c81c049c8a1250a47aff9a5aa5f3fe862e409369f6697c5359b9b7cf2ae81` | 提交 `8d590818e32534880984f9e84e1efd005caa105a`。命令回执与超时反馈。 |

最早的 `prologue-sdk-0.0.0-rc.1.tgz` 没有对应的源码提交记录，不能当作任何一个提交的构建；其余本地中间包不是依赖，也没有作为分发物提交过。
