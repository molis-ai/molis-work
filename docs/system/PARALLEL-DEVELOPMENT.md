# 多会话并行开发

状态：现行规范（2026-10-08 入库）。同一台机器上常有几个会话（人和 Agent）、很多个工作树、几个在途 PR 同时在改这个仓库。这份文档写它们怎样不互相踩：开工、改枢纽文件、构建与测试排时段、合并、清理。每条规则后面写了依据；还没做、还开着的在最后一节「还没做、还开着」。`AGENTS.md`「协作」一节指到这里。

文中的「路线图」是 `specs/repository-anti-corruption/roadmap-2026-10-07.md`，`W1-13` 这样的编号是它排出的切片，进度以 `specs/repository-anti-corruption/spec.md` §10 为准；「spec」指该目录的 `spec.md`。

合同怎样变更见 [合同变更流程](CONTRACT-CHANGES.md)。每个包归谁见 [`docs/SSOT-MATRIX.md`](../SSOT-MATRIX.md) 的「归属」列和 `.github/CODEOWNERS`。

## 1. 开工

- 先看别人在做什么：`git fetch -q origin main`、`git worktree list`、`gh pr list --state open`。
- 自己开工作树，不在主检出里改。分支从最新 `origin/main` 开，不基于别的分支或旧分支开新工作（`specs/repository-anti-corruption/spec.md` §1，2026-10-03「任务书来源」）：

  ```sh
  cd <主检出> && git fetch -q origin main
  git worktree add -b <分支> .claude/worktrees/<目录> origin/main
  ```

- 主检出常被真实 Home 的服务（4207）使用，也常带着别的会话留下的未提交改动：不在里面改，不重置，不覆盖，只提交自己的（`AGENTS.md`「协作」）。
- stash 栈在主检出和所有工作树之间共享（它存在仓库级的 `refs/stash`）。不用裸 `git stash` / `git stash pop`；要放一放就做一个临时提交。
- 推送、开 PR、发布先问用户；推送前先跑 `pnpm secrets:check`（`AGENTS.md`「协作」）。用户另外授权的范围以他当次的话为准，不在这里推广。
- 一个 PR 一个主题。分支一推上去就开 draft PR：别人用 `gh pr list --json files` 才看得到你动了哪些文件（见下一节）。

## 2. 枢纽文件

枢纽是每条需求线都会顺手改一下的聚合文件：翻译词典、内置插件名单、路由分发、公共合同、登记表。它们是冲突的主要来源。

名单怎么来的：自 09-28 起合入 main 的 PR（`git log --first-parent`，到 2026-10-08 在 origin/main `f8ea20b9` 上共 205 个）里，下列文件各被至少 7 个改过；只属于一个插件的文件（如 `plugins/native/artifacts/src/actions.ts`）是单线热点，不是聚合，不列。spec §2.2 是同一方法在更早一天的结果，路线图 §4.7 点名了结构枢纽。重数：

```sh
# 某个文件被多少个合入 main 的 PR 改过
git log origin/main --first-parent --since=2026-09-28 --format=%H -- <文件> | wc -l
# 哪些文件被改得最多
git log origin/main --first-parent --since=2026-09-28 --format=%H | while read m; do git diff --name-only $m^1 $m; done | sort | uniq -c | sort -rn | head -60
```

| 类 | 文件 |
| --- | --- |
| 工作台聚合（`apps/workbench/src/` 下） | `i18n/en.ts`（总词典）、`index.ts`、`builtin-plugins.ts`、`plugin-catalog.ts`、`ui-composition.ts`、`renderer.ts`、`goals-page-renderer.ts`、`page-assets.ts`、`immersive-shell.ts`、`scripts/client/initialization.ts`、`scripts/client/plugin-workbench.ts`；另有 `packages/design-system/src/styles/craft-finish.ts`（总样式） |
| 宿主聚合（`apps/local-host/src/` 下） | `web-request.ts`（路由分发）、`web-catalog.ts`、`project-host.ts`、`index.ts`（出口） |
| 公共合同（`packages/contracts/src/` 下） | `platform/plugin.ts`、`platform/actions.ts`、`services/agent-host.ts`、`services/assistant.ts` |
| 登记与门禁 | `scripts/workspace-packages.mjs`、`scripts/check-package-boundaries.mjs`、根 `package.json` 与 `pnpm-lock.yaml`、`tooling/gates/baseline.json`、`.github/workflows/ci.yml` |
| 文档 | `AGENTS.md`、`DESIGN.md`、`docs/SSOT-MATRIX.md`、`docs/platform/PLUGIN-DEVELOPMENT.md`、`skills/molis-plugin-dev/SKILL.md`、`specs/README.md`、`specs/BACKLOG.md`、`specs/repository-anti-corruption/spec.md` |
| 巨大文件 | `apps/workbench/src/scripts/client/assistant-island.ts`、`horizontal/agent-host/src/adapters/prologue-node.ts`、`apps/local-host/src/assistant/assistant-service.ts`、`horizontal/agent-host/src/adapters/announce-guard.ts` |

`apps/local-host/src/project-plugins.ts` 不到 7 次，但 `AGENTS.md` 把每个新内置插件的装配点指到它的监督器条目，按枢纽对待。

动枢纽的规矩：

1. 动之前看有没有在途 PR 也动它：

   ```sh
   gh pr list --state open --json number,title,files \
     --jq '.[] | select(any(.files[]; .path == "apps/workbench/src/i18n/en.ts")) | "#\(.number) \(.title)"'
   ```

2. 只加自己的几行，写在自己的位置上。不顺手重排、重命名、换格式；那类改动单独一个 PR，不夹逻辑改动。
3. 解冲突时两边的条目都要留，不整块取「我的」或「对方的」。解完重跑 `pnpm boundary:check` 和健康门禁。`tooling/gates/baseline.json` 冲突时不手工合并：合入 main 后重跑 `node scripts/check-health-gates.mjs --update --base origin/main`。CI 不读这份文件（`AGENTS.md`「构建与测试」）。`tooling/gates/api/` 下的快照冲突时同样不手工合并：合入 main 后重跑 `pnpm api:update`，再看 diff 里是否只剩自己的 API 变化。
4. 两个 PR 动同一个枢纽：先准备好的先合；后一个合入 main 再重跑相关用例。
5. 门禁脚本、`tooling/gates/`、`limits.json`、CI 工作流的改动单独一个 PR：它们是唯一能放宽数字的地方（`AGENTS.md` 的健康门禁一条）。这几处在 `.github/CODEOWNERS` 里只请求 @yijunw0212 评审；这是请求，不是强制（必需批准数是 0，见第 3 节）。放宽数字的 PR 在描述里写清放宽哪一项、为什么。

枢纽名单会随结构变短：翻译改用稳定键、词典按主人分（用户 2026-10-08 定，spec §1「界面翻译」），内置插件名单与路由改成声明式登记（路线图 W5-02、W5-03）落地后，对应文件不再逐个点名插件，就从上表删掉。

## 3. 合并

- 合同与扩展点先合，实现后合；体量大的需求按包与层拆开（`docs/prompts/repository-anti-corruption.md` §4.7）。
- 合并前把分支同步到最新 main（spec §1，2026-10-03）。main 的分支保护（2026-10-08 用 `gh api repos/molis-ai/molis-work/branches/main/protection` 读到）：必需检查只有 `Verify`（对应 `.github/workflows/ci.yml` 的 `verify` 作业，它等 `architecture-boundaries` 和 `secret-scan` 两个作业都成功；改这个作业的名字就等于改保护规则），并且要求分支与 main 同步；必需的批准数是 0，没有开「必须由代码所有者批准」。
- 不开合并队列，不强制评审（spec §1，2026-10-02）。`.github/CODEOWNERS` 只自动请求评审，不改分支保护；谁评审、评审哪些包见 `docs/SSOT-MATRIX.md` 的「归属」列。
- PR 描述按 `.github/pull_request_template.md` 写，包括验证结果、基线比对、API 影响和基本合同检查。
- 产品用例子集进 CI 的做法（用户 2026-10-08 定，spec §1「CI 产品子集是否挡合并」）：先作一个单独的作业，不挡合并，跑约两周；隔离掉不稳定的用例后并入 `Verify`，不改分支保护。怎么并入（比如让 `verify` 作业 `needs` 它）由路线图 W2-16 定。第一步已经有了：`ci.yml` 的 `linux-probe` 作业（`continue-on-error`，不在 `verify` 的 `needs` 里）在 ubuntu 上把非浏览器用例逐个跑一遍，记下哪些通过，并给 macOS 专有和用真实模型的文件打标记（做法与产物见 [PACKAGE-BOUNDARIES.md](PACKAGE-BOUNDARIES.md)）；它的 `pass.txt` 是 W2-16 的 `tests/ci-product-subset.txt` 的底稿。`ci.yml` 现在有 `architecture-boundaries`、`secret-scan`、`linux-probe` 和 `verify` 四个作业，其中挡合并的只有前两个，经 `verify` 汇总；全量产品用例和浏览器用例仍在本机跑。

## 4. PR 体量

2026-09-28 至 10-07 合入的 PR：改动文件数 p90 约 50，最大 728（路线图 §4.7）。下面的数字是建议，不是门禁：

- 目标：一个 PR 不超过约 50 个文件、一个主题。超过的，在描述里说明为什么拆不开。能整块说明的例外：机械改名、删除整块旧代码、生成文件。
- 拆法：合同与扩展点 → 宿主与内核 → 插件 → 界面 → 文档。删旧代码和加新代码分开。机械改动（改名、格式）独立成 PR。
- 大需求先在 `specs/<task>/spec.md` 里列出 PR 序列和每片的验收，再逐片开。
- 门禁、脚本、CI 的改动不和功能混在一个 PR（见上节第 5 条）。

## 5. 构建与浏览器用例排时段

- 整体 `pnpm build` 先跑 `workspace:clean`，把本检出里每个包的 `dist` 清空再重建（根 `package.json` 的 `workspace:build`）。同一检出里同时跑两次构建，或构建时跑测试，会读到空的 `dist`。单包构建写成 `pnpm --filter <包> run build`，`--filter` 在 `run` 前；写成 `pnpm run build --filter …` 会被当成根构建的参数，清空全部包。
- 不同工作树的 `dist` 互不影响，但构建和浏览器用例都吃满 CPU。几件同时跑，浏览器用例会因负载超时（spec §9.5 记录了只因负载超时、单独重跑就过的 `goals-document.e2e` 与 `goal-event-document.e2e`）。所以整台机器同一时间最多一个构建、一个浏览器用例批次，其余排队。
- 开跑前看一眼有没有人在跑：

  ```sh
  pgrep -fl "run-tests.mjs|pnpm .*build|tsc "
  ```

  有，就等；有会话在统筹排期时听它的。停进程只按 pid（`kill <pid>`），不用 `pkill -f scripts/run-tests.mjs`：那会连别的工作树的测试一起杀掉。
- 一次测试运行内部已经串行：`scripts/run-tests.mjs` 带 `--test-concurrency=1`，整次运行共用一个临时 `MOLIS_WORK_HOME`。把它改成并发的计划见 W5-12，现在不要绕开。
- 全量回归期间，被测的那棵树里不改源码：安装类测试比对源码与构建指纹，指纹覆盖根的 `package.json`、`tsconfig.json`、`tsconfig.base.json`、`tsconfig.package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`scripts`、`src`、`apps/desktop/launchers`，以及每个工作区包的 `package.json`、`src`、`tooling`、`bin`、`tsconfig.json` 和原生工具源码（`apps/local-host/src/installer/fingerprint.ts` 的 `computeBuildSourceDigest`）。`skills/` 也不改：安装类用例会把它拷进发布目录并比较两次安装的内容。`docs/`、`specs/` 可以改。改过指纹覆盖的文件之后，跑全量前要整体 `pnpm build`，单包重建不刷新指纹。

## 6. 验证频率（2026-10-03 的决定）

用户在 2026-10-03 调整了验证频率（spec §1 同日「验证频率」一行）：小改动攒成一批，整体构建一次，跑这批改动涉及的相关用例；全量回归只在大改动时跑。

| 改了什么 | 跑什么 |
| --- | --- |
| 一个包的源码 | 该包 README「开发要求」里的「改动后必跑」，加读它、调它的用例（`git grep -l <名字> tests`） |
| 带 `L()` 文案 | 再加 `tests/i18n.test.ts` |
| 路由 | 再加所有读这条路由的用例 |
| 界面 | 受影响的浏览器用例（排时段、串行）；PR 模板里的浅深色与三个宽度的截图 |
| 共享核心（contracts、kernel、modules、local-host 的装配、workbench 外壳）、迁移或存储、改动跨三个以上包、删除整块旧代码、或合入后相关用例意外失败 | 全量：`node scripts/run-tests.mjs`。不带参数时含 `tests/*.test.mjs`（跑全量约 76–78 分钟，spec §9.5 各批记录） |
| 每个阶段收尾 | 全量一次，作为阶段证据 |

不变的底线：每个 PR 的 CI 必须通过；跑测试前先整体构建；构建与浏览器用例串行；不跳过、不放宽、不删除断言；失败先分清产品回归、预期变化、测试缺陷、环境与时序，并用干净的基线工作树比对（下面第 8 节）。

按改动挑用例的脚本还没有（路线图 W2-17 要把这张表做成 `scripts/affected-tests.mjs`）；现在靠表和各包 README。

## 7. 集成分支上跑全量

几个 PR 同时动共享核心，各跑一次全量太贵，也看不到它们合在一起的结果。做法（第二步各批的做法，记录在 spec §9.5）：

1. 开一个集成工作树和分支，名字 `integration/batch-<月-日><字母>`；把这几个 PR 的分支合进去。
2. 整体构建一次；`pnpm boundary:check`、健康门禁（`node scripts/check-health-gates.mjs --base origin/main`）和类型检查过了，再跑这批的相关用例，最后跑一次全量。
3. 失败先和干净基线比对。属于某个 PR 的，修在那个 PR 的分支上，再合进集成分支重跑受影响的用例；不在集成分支上直接改。
4. 全量通过后，各 PR 仍然各自合入：各自的 CI 通过，分支同步到最新 main，批次结果贴在各 PR 里，也记进对应 spec。集成分支本身不合入 main。
5. 用完删掉集成工作树与分支（第 10 节）。

## 8. 基线工作树比对

判断一条失败是不是自己引入的，不靠印象，靠同一批文件在干净基线上的对照（`AGENTS.md`「构建与测试」）：

```sh
# 同样从主检出执行：工作树目录都在主检出的 .claude/worktrees/ 下
git worktree add --detach .claude/worktrees/baseline-<日期> origin/main   # 集成批次用该批的合并基点
cd .claude/worktrees/baseline-<日期> && pnpm install --frozen-lockfile --offline && pnpm build
node scripts/run-tests.mjs <你这边失败的那几个文件>
```

- 只在基线上跑你这边失败的文件，不跑基线的全量。
- 两边的完整输出都留着，不用 grep 把输出剪成只剩失败行，否则看不到失败原因。比较时取以 `✖ ` 开头的用例名，排序后 `comm -23`。
- 只在你这边失败的，才逐个看原因。负载下的偶发失败，在同一棵树上单独重跑几次来排除。
- 基线工作树不改任何文件。比完删掉。

## 9. 共享 Agent 锁与真实 Home

- 一个 Home 同一时刻只有一个进程能跑 Agent。创建 Agent 执行适配器时，会在 `<Home>/agent-runtime/.molis-runtime-owner.db` 上取独占事务，适配器关闭时才释放（`horizontal/agent-host/src/adapters/prologue-storage-owner.ts`、`prologue-node.ts` 的 `createPrologueNodeAdapter`；目录由 `apps/local-host/src/system-agent-service.ts` 的 `storageRoot` 给出）。别的进程拿不到，得到 `agent.storage_busy`，提示「Agent 执行服务正由另一个进程使用」。
- 所以两个服务不要同时指向真实 Home 跑 Agent：主检出的 4207、另一会话的服务（如 4208）、安装版的常驻服务（4173）轮流用。报 `agent.storage_busy` 时，用 `lsof -nP | grep molis-runtime-owner.db` 找持有者，和对方商量，不去停别人的服务。重启服务会释放锁，对方可能趁空档拿走。
- 测试和预览用自己的 Home：`MOLIS_WORK_HOME=<目录>`。`scripts/run-tests.mjs` 就是这样给每次运行一个临时 Home 的。预览真实数据时用 Home 的拷贝，不直接指向 `~/.molis-work`。
- 动真实 Home 的库（升级、清理、删数据）不属于普通开发，要用户当次说可以（spec §1 里 10-02 至 10-07 的各行）。

## 10. 清理

- PR 合入后：删自己的工作树和本地分支。

  ```sh
  git worktree remove .claude/worktrees/<目录>      # 有未提交改动时会拒绝，先弄清楚那些改动是谁的
  git branch -d <分支>                               # 未合并时会拒绝，不用 -D 强删
  git worktree prune
  ```

- 基线工作树、集成工作树、集成分支用完即删。删集成分支或 `wip/*` 救援分支之前先逐个核对里面有没有只在那里的提交。
- 只清已合入且干净的；别人的工作树和分支不动（spec §1，2026-10-02「他人的工作树与分支」）。
- 谁清什么（用户 2026-10-08 定，spec §1「工作树、分支与仓库设置」）：本地已合入且干净的工作树和分支，由做防腐整改的 Agent 会话清；`wip/*` 与整合分支逐个对比、确认没有只在那里的提交后才删；救援分支与 Codex 的 d62d 不动。远端已合入的分支（决定时 147 个）和 GitHub 仓库设置里的「合并后自动删除分支」由用户来做。这个设置现在还是关的（`gh api repos/molis-ai/molis-work --jq .delete_branch_on_merge` 为 `false`，2026-10-08 读到），打开之前远端已合入分支会继续积累。日常的做法照上面：合入后各会话清自己的。
- 工作树占地方：2026-10-07 普查时 `.claude/worktrees` 占 13 GB（路线图待决 #24 的说明），每个工作树都有自己的 `node_modules` 和 `dist`。
- 自己起的预览服务、浏览器、Chrome 调试进程用完关掉；端口不要占着。

## 11. Prologue SDK 合成包

- 只有 `horizontal/agent-host` 依赖 `@prologue/sdk`（`AGENTS.md` 硬约束）。包放在 `vendor/prologue-sdk/`，目录里只留当前使用的一份，最多再加一份在途分支的；换新包时删掉旧包，旧包从 Git 历史取。健康门禁数这个目录里的 `.tgz` 包数，上限是 `tooling/gates/limits.json` 的 `vendoredPrologueSdk`（现在是 2：当前一份加一份在途）。
- 两条线要不同的 SDK 改动时，合成一个包共用，不各带一份：先落地的线在 Prologue 仓库里把几条分支合成一个分支，打一个包；后一条线在这个包的基础上重建，不另加包。当前包的来源记在 `vendor/prologue-sdk/<包>.provenance.json` 和 `.sha256`，`vendor/prologue-sdk/README.md` 当前一节写重建步骤（检出哪个上游提交、构建、`pnpm pack`）与验证结果；这几份的写法就是模板，`pnpm health:check` 核对它们和 tgz 相符。
- 方向已定（spec §1，2026-10-08「Prologue SDK 收敛与私有包」）：来源分支 `feat/molis-side-panel-surfaces-on-memory` 收敛到上游基线，按一个合成流程、一个负责人；删掉重建用不着的历史补丁，记下 sha256 与来源；`prologue-sdk`、`adeptify intelligence-client`、`search-evidence-layer` 的 tgz 改从私有 registry 或 release 附件取，不再放进公开仓库。方案是 [dependencies-and-sdk-plan.md](../../specs/repository-anti-corruption/dependencies-and-sdk-plan.md)：来源分支早已作为 Prologue PR #3 合入上游 main，没有要推的东西；25 份历史补丁已删，记录在 `vendor/prologue-sdk/patch-history.json`（W1-23）；tgz 移出公开仓库（方案 §5）还没做，做完之前上面的做法照旧，删除 vendored 的 tgz 按用户当次的授权办。
- 合成负责人：还没有指定人。上面的决定要求设一个，W1-20 出方案时提名。在那之前，谁要换包谁做，并把 README 写全；`/vendor/` 在 `.github/CODEOWNERS` 里走默认规则，只请求 @yijunw0212。指定之后，把负责人写在这一节。

## 12. 还没做、还开着

- 合成包负责人和流程：方向已定，人选与方案等路线图 W1-20（见上一节）。
- 读取兼容的合同流程：起点已定为第一个装到开发机之外的版本（用户 2026-10-08），日期到时写进 [合同变更流程](CONTRACT-CHANGES.md)；在那之前不留兼容期。
- 挑相关用例的脚本：路线图 W2-17。
- 测试并发隔离（每个测试文件一个 Home 和密钥库，非浏览器用例并发）：路线图 W5-12。在那之前全量约 76–78 分钟。
- CI 里的产品用例子集、浏览器冒烟、隔离名单：非浏览器用例的 Linux 探针作业已有（路线图 W1-11，不挡合并，见第 3 节）；`tests/ci-product-subset.txt`、3–5 个浏览器冒烟、隔离名单（`tests/quarantine.json`）和并入 `Verify` 在路线图 W2-16，约两周的探针结果出来后做。
- 远端已合入分支的清理与「合并后自动删除分支」：用户来做（见第 10 节），还没做。
- 第 4 节的 PR 体量数字是建议；要改成门禁，先量再定。
- 从零安装到跑起预览与测试的步骤和耗时（新成员上手）：还没写。
