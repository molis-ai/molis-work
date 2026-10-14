# Prologue SDK 构建来源

本目录的规则见 [AGENTS.md](../../AGENTS.md)：只放当前使用的 Prologue 包（最多再加一份在途分支的），换新包时删掉旧包，旧包从 Git 历史取。

目录里现在有这些东西：

- 当前包 `prologue-sdk-0.0.0-rc.1-interim-p1-cu.tgz`（`horizontal/agent-host/package.json` 以 `file:` 依赖它）；
- 它的 `.sha256` 和 `.provenance.json`：字节数、SHA-256、integrity、上游仓库与完整提交、构建用的 Node 与 pnpm，格式照另外两个 vendored 包的同类文件；
- `patch-history.json`：已删除的 26 份历史补丁和 14 个没有补丁的历史包的记录（大小、SHA-256、git blob、基线、来源、产出的包），见下面「已删除的历史补丁」；
- 本文件。

另外两个 vendored 包各自带 `.sha256`、`.provenance.json` 和 `sbom.cdx.json`：[intelligence-client](../intelligence-client/)、[search-evidence-layer](../search-evidence-layer/)。这三个包的 tgz 按决定（2026-10-08，[spec](../../specs/repository-anti-corruption/spec.md) §1「Prologue SDK 收敛与私有包」）将来改从私有 registry 或 release 附件取，不再放进公开仓库；registry 就绪前仍留在仓库里（[方案](../../specs/repository-anti-corruption/dependencies-and-sdk-plan.md) §5）。`pnpm health:check` 限制本目录的 tgz 份数（`tooling/gates/limits.json` 的 `vendoredPrologueSdk`），并由 `scripts/gates/vendored-provenance.mjs` 核对三个包的 tgz 与各自的 `.sha256`、`.provenance.json` 相符、`alsoBuildableFrom` 点名的补丁在目录里且字节数、SHA-256 相符、`patch-history.json` 的格式对、已删的补丁没有回到目录里（只核对形状，不去 Git 里重算 `gitBlob` 的字节数与 SHA-256，见 [REPOSITORY-HYGIENE](../../docs/system/REPOSITORY-HYGIENE.md)）；`tests/vendor-provenance.test.ts` 给门禁的每一条检查各造一个违例，方法与限度也在那份文档里。

## 当前依赖：interim-p1-cu（2026-10-13，过渡包：P1 之前的 main 加 Computer Use）

`prologue-sdk-0.0.0-rc.1-interim-p1-cu.tgz`（1,119,945 字节），SHA-256 `860081e2c480bc10821fe4dfc75d0ff164eadb35269f1b83c97c42c07f750eca`。

**来源**：上游 `molis-ai/prologue` 分支 `release/molis-interim-p1-cu-2` 的合并提交 `08b84296f81df1bd5f3429c2dc2997d18b72473a` 的 `packages/sdk`，不加补丁，`dirty: false`。这个提交**不在上游 main 上**，它的两个父提交都在（`git merge-base --is-ancestor`，2026-10-13 对 main 头 `b219d859` 核对）：

- `95cd901d`：输入回执第三刀的修正 H16（这一轮的工具名单里没有 `acknowledge-inputs` 就不写编号说明），基于 `82488fa0`。`82488fa0` 是 PR #6 的合并提交（P1 统一协作合同，只有文档），它之下是 `f5ef12e6`（PR #5，输入回执第二、三刀）与 `55b0c85a`（PR #4，A0 采用修正、输入回执第一刀、带类型的问卷）。H16 随 PR #17（`b219d859`）进 main。
- `d4908c11`：桌面 Computer Use（`c4b9fde3` 上的五个提交），随 PR #15（`a47eb26d`）进 main。

为什么是过渡包（用户 2026-10-13 决定）：上游 main 的末端带 P2d（PR #11），没有绑定任务图节点的跑里不再有 `dispatch-subagent` 与 `board-*` 工具，`claims` 已删；Molis 在做 P3 之前还在用它们，统一协作合同又不许留兼容路径。所以这一份只取 P2 之前的 main 加 Computer Use。P2a–P2g 与输入回执第四刀（PR #10）随 Molis 的 P3 第二次换包进来，那一次从上游 main 的具名提交打包。provenance 的 `inFlight` 记分支、两个父提交与核对时的 main 头。

和上一份的关系：比 #408 分支上的 adoption-receipts-handling（`f5ef12e6`）多 P1 文档、H16 与 Computer Use；比 main 上的 computer-use（`d4908c11`）多 A0 之后的上游提交（输入回执第一到三刀、带类型的问卷、H16）。Computer Use 部分的源码与 `d4908c11` 相同。包的依赖与 computer-use 相同（`@tauri-apps/api` 2.11.1），锁文件只换路径与 integrity。

**重建**（2026-10-13 在 macOS arm64、Node 24.14.0、pnpm 11.9.0 上，两份干净的 `git archive` 打出同一个 SHA-256）：

```bash
git -C <prologue 克隆> archive 08b84296f81df1bd5f3429c2dc2997d18b72473a | tar -x -C <空目录>
cd <空目录>
pnpm install --frozen-lockfile --offline
pnpm --filter @prologue/sdk run build
cd packages/sdk && pnpm pack --pack-destination <另一个空目录>   # 得到 prologue-sdk-0.0.0-rc.1.tgz，改名为 prologue-sdk-0.0.0-rc.1-interim-p1-cu.tgz
shasum -a 256 <另一个空目录>/prologue-sdk-0.0.0-rc.1.tgz   # 与 .sha256 一致
```

**验证**（SDK 侧；Molis 默认包路径的结果记在采用 spec §6）：

- 先 build dist，`tsc` 通过；SDK 全量 335 个文件，3782 条通过 / 21 跳过 / 0 失败。`desktop-computer-use.live` 没有跑：它会操作这台正在使用的真实桌面。
- 包装进只有 `package.json` 的空目录，只经公开入口：S1（`steer-receipts-consumer`）、S2（`input-queue-consumer`）、S3（`input-handling-consumer`）三份消费者脚本都通过。
- 未跑：真实 Provider（本机无 Key）。

上一份包 `prologue-sdk-0.0.0-rc.1-adoption-receipts-handling.tgz`（1,102,754 字节，SHA-256 `c474ee43…`，来源 main 上的 `f5ef12e6`，PR #5）只在采用交接分支（#408）上用过，已删除，记在 `patch-history.json` 的 `packagesWithoutPatch`，按 `gitBlob` 取回；它之前的 adoption-receipts-fields（`55b0c85a`）与 dirty 候选 a0-s1 同样记在那里。

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
- `packagesWithoutPatch`：14 个没有补丁的历史包（文件名、字节数、SHA-256、`gitBlob`、提交、说明），含 2026-10-12 换掉的 dirty 候选 a0-s1 和 adoption-receipts-fields、2026-10-13 换掉的 adoption-receipts-handling 与 main 上的 computer-use，以及随 #472 进入 main 历史的 molis-adoption；换掉的 side-panel-memory 包记在 `patches` 里 `side-panel-memory.patch` 的 `package`；
- `upstream`：记录里写到的每个 Prologue 提交（23 个）都是上游 main 头的祖先（2026-10-08 逐个用 `git merge-base --is-ancestor` 对 `4f7110fe` 核对；2026-10-12 加的 `c4b9fde3` 随 PR #4 进了 main，对 `55b0c85a` 与 `f5ef12e6` 同样成立；2026-10-13 加 `f5ef12e6`、`d4908c11`，对 `b219d859` 复核全部成立）。`21cdfbf8`、`d4a2f41b` 是 Molis 仓库的提交，不是 Prologue 的。

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
