# Prologue SDK 构建来源

本目录的规则见 [AGENTS.md](../../AGENTS.md)：只放当前使用的 Prologue 包（最多再加一份在途分支的），换新包时删掉旧包，旧包从 Git 历史取。

目录里现在有这些东西：

- 当前包 `prologue-sdk-0.0.0-rc.1-app-wait-ends-step.tgz`（`horizontal/agent-host/package.json` 以 `file:` 依赖它）；
- 它的 `.sha256` 和 `.provenance.json`：字节数、SHA-256、integrity、上游仓库与完整提交、构建用的 Node 与 pnpm，格式照另外两个 vendored 包的同类文件；
- `patch-history.json`：已删除的 26 份历史补丁和 25 个没有补丁的历史包的记录（大小、SHA-256、git blob、基线、来源、产出的包），见下面「已删除的历史补丁」；
- 本文件。

另外两个 vendored 包各自带 `.sha256`、`.provenance.json` 和 `sbom.cdx.json`：[intelligence-client](../intelligence-client/)、[search-evidence-layer](../search-evidence-layer/)。这三个包的 tgz 按决定（2026-10-08，[spec](../../specs/repository-anti-corruption/spec.md) §1「Prologue SDK 收敛与私有包」）将来改从私有 registry 或 release 附件取，不再放进公开仓库；registry 就绪前仍留在仓库里（[方案](../../specs/repository-anti-corruption/dependencies-and-sdk-plan.md) §5）。`pnpm health:check` 限制本目录的 tgz 份数（`tooling/gates/limits.json` 的 `vendoredPrologueSdk`），并由 `scripts/gates/vendored-provenance.mjs` 核对三个包的 tgz 与各自的 `.sha256`、`.provenance.json` 相符、`alsoBuildableFrom` 点名的补丁在目录里且字节数、SHA-256 相符、`patch-history.json` 的格式对、已删的补丁没有回到目录里（只核对形状，不去 Git 里重算 `gitBlob` 的字节数与 SHA-256，见 [REPOSITORY-HYGIENE](../../docs/system/REPOSITORY-HYGIENE.md)）；`tests/vendor-provenance.test.ts` 给门禁的每一条检查各造一个违例，方法与限度也在那份文档里。

## 当前依赖：app-wait-ends-step（2026-10-17）

当前包 `prologue-sdk-0.0.0-rc.1-app-wait-ends-step.tgz`（1,195,429 字节），SHA-256 `cc4386e2d6edd1d6395f2c73d3cba722ac76da0855131049dd06796886ee0f0a`。来源为上游 main `24e6908352a9d2b164f62b83381b1f4cc6fc7643`，即 [Prologue #38](https://github.com/molis-ai/prologue/pull/38) 的合并，当时的 main 头；无补丁、dirty 为 false。从两份各自独立的干净 `git archive` 各打一次，两份逐字节相同。

比上一份多两项：

- [#37](https://github.com/molis-ai/prologue/pull/37)（`62431743`，树与评审过的 head `f4fda4a1` 相同）：App 的等待可以了结它挂着的步骤（`WaitArrangement.afterwards: "end-step"`，只给 `by: "app"`）。板上只写带 `ends` 的等待引用，不写接续；等待落定时，`running` 的步骤按终态结束（满足 → `succeeded`；失败、过期 → `failed`，`onFailure: "block"` 时 `blocked`；检查被拒 → `needs-reconciliation`），取消不动步骤。挂着它的步骤上不开尝试，提前继续拒绝。这样的等待不往会话里写话：作业怎样结束，由 App 自己从图上告诉 Work（[采用 spec](../../specs/prologue-adoption/spec.md) A3）。
- #38（`24e69083`；它在 `d2b3daa3` 之上的改动与评审过的 head `b3be719b` 逐字相同）：一次运行开跑时可以带自己的引用种类名单。Molis 这一次只换包、不用它，由交互线接上。

两项都要调用方显式选用，Molis 现在都没用，行为不变。已知缺口：交接、改派、重来时，没有接续的结束型等待的引用会留在新一代上（[Prologue #39](https://github.com/molis-ai/prologue/pull/39) 修，随下一次换包）；Molis 的作业步骤没有负责人、不会被交接，不受影响。

验证（2026-10-17）：
- 同一棵树（干净归档）上 build dist、`tsc` 无错；SDK 全量 353 个文件，3971 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live` 与 `computer-use.live`，它们操作真实桌面与浏览器）；
- 这个包上 13 个消费者脚本全过；
- 同样的步骤打第二次，字节数与 SHA-256 相同。

重建命令与工具版本见旁边 `.provenance.json`。

Molis 侧的验证（这一刀只换包，不写进采用 spec）：
- 在 main `dd2bac58` 上换包：`pnpm install --frozen-lockfile --offline`、`pnpm build` 通过。
- 非浏览器用例 132 个文件（全部 `prologue-*`、`agent-*`、`assistant-*`、`interaction-*`、MCP 与 Coding 步骤用例、`vendor-provenance`、`security-invariants-*` 中的非浏览器部分）一次全过；S-13 的 `prologue-memory-boundary` 在其中，在新包上再过一次。
- `pnpm test:security` 59/59，`pnpm test:contracts` 44/44（动作合同快照没有变化）。
- 浏览器用例交给全量，由统筹跑。
- `check-health-gates --base origin/main`、`boundary:check`、`verify-release-versions` 都过；vendored SDK 仍是 1 份，没有数字变化。

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

重建命令与工具版本见旁边 `.provenance.json`。

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

重建命令与工具版本见旁边 `.provenance.json`。Molis 侧的验证写在 [采用 spec](../../specs/prologue-adoption/spec.md) §6.0j。#632 起是 main 的依赖，同日换成 mcp-refresh；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## main 上的上一份：parameter-branches（#615，2026-10-17 换掉）

`prologue-sdk-0.0.0-rc.1-parameter-branches.tgz`（1,189,325 字节），SHA-256 `c6f421292cfcdbadb1dd7db5e8a3175766d9515ae4d25205b732e318c434590f`。来源是上游 main 的 `4e8468ddb6eb8fd0ca48110adb77a316c7048332`（[Prologue #32](https://github.com/molis-ai/prologue/pull/32) 的合并，当时的 main 头；树与评审过的 head `acf7efdb` 相同），从干净 `git archive` 构建，不加补丁、`dirty: false`。比上一份多的是 [#31](https://github.com/molis-ai/prologue/pull/31) 和 #32：
- #31：会话可以给自己包里的工具参数加分支（`sessions.open` 的 `parameterBranches`）。每次组请求时现问，登记时那一份永远是其中一支，调用照旧按登记核。
- #32：`ask-user` 的数字题可以带 `unit`。只用来显示，答案仍是不带单位的数，存盘读回都带着。

验证（2026-10-16，`prologue-verify.sh`）：
- build dist、`tsc` 无错；
- 同一棵树上的 SDK 全量 355 个文件，3946 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live`，它会操作真实桌面）；
- 这个包上 13 个消费者脚本全过；
- 同样的步骤打第二次，字节数与 SHA-256 相同。

重建命令与工具版本见旁边 `.provenance.json`。Molis 侧的验证写在 [采用 spec](../../specs/prologue-adoption/spec.md) §6.0f。#615 起是 main 的依赖，2026-10-17 随 P4-C2 换成 reference-kinds；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## main 上的上一份：find-tools-deferral（#599，2026-10-16 换掉）

`prologue-sdk-0.0.0-rc.1-find-tools-deferral.tgz`（1,187,709 字节），SHA-256 `29013b0cbeaa01e981376d9c5efb7424764b1e78280deb3f0a3bf39239711b0d`。来源是上游 main 的 `be78f726df55d76e7ab7bd5889d4eeb89b049173`（[Prologue #30](https://github.com/molis-ai/prologue/pull/30) 的合并，当时的 main 头；树与评审过的 head `97f9484f` 相同），从干净 `git archive` 构建，不加补丁、`dirty: false`。比上一份多的是 #29（只改文档）和 #30：一轮只要延后了工具，`find-tools` 就带着名册在请求里、调得动，不看这一轮的工具名单和 Character 点没点它；Tool 那道门、提前开跑和明文调用提升照同一个判据收它。一条都没延后时照旧摘掉。

验证（2026-10-16）：build dist、`tsc` 无错；同一棵树上的 SDK 全量 354 个文件，3938 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live`，它会操作真实桌面）；这个包上 13 个消费者脚本全过；同样的步骤打第二次，字节数与 SHA-256 相同。Molis 侧的验证写在 [采用 spec](../../specs/prologue-adoption/spec.md) §6.0e。#599 起是 main 的依赖，同日换成 parameter-branches；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

## main 上的上一份：found-tools（#581，2026-10-16 换掉）

`prologue-sdk-0.0.0-rc.1-found-tools.tgz`（1,186,918 字节），SHA-256 `cfed7ff4653289c67ee0dd2801e1b6d9a287d6c8873f477b4927e12dbf510705`。来源是上游 main 的 `e4afd1a718bd8a8629d52526b953bbe75149baa6`（[Prologue #28](https://github.com/molis-ai/prologue/pull/28) 的合并，当时的 main 头；树与评审过的 head `af7be966` 相同），从干净 `git archive` 构建，不加补丁、`dirty: false`。比上一份多的只有 #28：`find-tools` 交出过形状的工具，之后的请求照常声明（记成 Run 事件 `tools-found`，接着历史的下一跑照它接上）；只列了名字的延后工具，Model 那道门也照收；检查器可以说出参数形状（`ConditionCheckers.list()`、`CheckerDescriptor.params`），`board-wait` 的 `params` 照它写类型、登记时先按它核。

验证（2026-10-16）：build dist、`tsc` 无错；同一棵树上的 SDK 全量 354 个文件，3931 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live`，它会操作真实桌面）；这个包上 13 个消费者脚本全过。重建命令与工具版本见旁边 `.provenance.json`。Molis 侧的验证写在 [采用 spec](../../specs/prologue-adoption/spec.md) §6.0e。#581 起是 main 的依赖，同日换成 find-tools-deferral；已删除，记在 `packagesWithoutPatch`，按 `gitBlob` 取回。

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
- `packagesWithoutPatch`：25 个没有补丁的历史包（文件名、字节数、SHA-256、`gitBlob`、提交、说明），含本次换掉的 mcp-schema-annotations、之前的 app-tools-waits 与 mcp-refresh，以及 2026-10-12 换掉的 dirty 候选 a0-s1 和 adoption-receipts-fields、2026-10-13 换掉的 adoption-receipts-handling 与 main 上的 computer-use、2026-10-14 换掉的 interim-p1-cu，同日换掉的 interim-p1-cu-image，2026-10-15 换掉的 interim-p1-cu-image-acceptance，2026-10-16 换掉的 collaboration、found-tools 与 find-tools-deferral，2026-10-17 换掉的 parameter-branches 与 reference-kinds，以及随 #472 进入 main 历史的 molis-adoption；换掉的 side-panel-memory 包记在 `patches` 里 `side-panel-memory.patch` 的 `package`；
- `upstream`：35 个 Prologue 提交于 2026-10-17 对 main `24e6908352a9d2b164f62b83381b1f4cc6fc7643` 逐项核对；除三个已替换的过渡包来源 `08b84296`、`923e5a40`、`4007a93c` 以外，均为 main 祖先。这三个过渡提交自身不在 main，记录如实保留。`21cdfbf8`、`d4a2f41b`是Molis仓库提交，不是Prologue提交。

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
