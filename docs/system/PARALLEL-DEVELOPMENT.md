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
| 登记与门禁 | `scripts/workspace-packages.mjs`、`scripts/check-package-boundaries.mjs`、根 `package.json` 与 `pnpm-lock.yaml`、`tooling/gates/baseline.json`、`.github/workflows/ci.yml`、`tests/ci-product-subset.txt`（CI 产品子集的清单，见下） |
| 文档 | `AGENTS.md`、`DESIGN.md`、`docs/SSOT-MATRIX.md`、`docs/platform/PLUGIN-DEVELOPMENT.md`、`skills/molis-plugin-dev/SKILL.md`、`specs/README.md`、`specs/BACKLOG.md`、`specs/repository-anti-corruption/spec.md` |
| 巨大文件 | `apps/workbench/src/scripts/client/assistant-island.ts`、`horizontal/agent-host/src/adapters/prologue-node.ts`、`apps/local-host/src/assistant/assistant-service.ts`、`horizontal/agent-host/src/adapters/announce-guard.ts` |

`apps/local-host/src/project-plugins.ts` 不到 7 次，但 `AGENTS.md` 把每个新内置插件的装配点指到它的监督器条目，按枢纽对待。`tests/ci-product-subset.txt`（2026-10-09 才有，谈不上次数）也按枢纽对待：它点名三百多个用例，其中任何一个改名或删除，都要在同一个 PR 里改它的那一行，不然 `pnpm health:check` 变红（见第 3 节）；一行一个文件，解冲突时两边的行都留。

动枢纽的规矩：

1. 动之前看有没有在途 PR 也动它：

   ```sh
   gh pr list --state open --json number,title,files \
     --jq '.[] | select(any(.files[]; .path == "apps/workbench/src/i18n/en.ts")) | "#\(.number) \(.title)"'
   ```

2. 只加自己的几行，写在自己的位置上。不顺手重排、重命名、换格式；那类改动单独一个 PR，不夹逻辑改动。
3. 解冲突时两边的条目都要留，不整块取「我的」或「对方的」。解完重跑 `pnpm boundary:check` 和健康门禁。`tooling/gates/baseline.json` 冲突时不手工合并：合入 main 后重跑 `node scripts/check-health-gates.mjs --update --base origin/main`。CI 不读这份文件（`AGENTS.md`「构建与测试」）。`tooling/gates/api/` 下的快照冲突时同样不手工合并：合入 main 后重跑 `pnpm api:update`，再看 diff 里是否只剩自己的 API 变化。`tooling/gates/actions/` 下的动作合同快照同理：先 `pnpm build`，再 `pnpm actions:update`（行按名字排序，两个 PR 加不同的动作一般不冲突）。
4. 两个 PR 动同一个枢纽：先准备好的先合；后一个合入 main 再重跑相关用例。
5. 门禁脚本、`tooling/gates/`、`limits.json`、CI 工作流的改动单独一个 PR：它们是唯一能放宽数字的地方（`AGENTS.md` 的健康门禁一条）。这几处在 `.github/CODEOWNERS` 里只请求 @yijunw0212 评审；这是请求，不是强制（必需批准数是 0，见第 3 节）。放宽数字的 PR 在描述里写清放宽哪一项、为什么。

枢纽名单会随结构变短：翻译改用稳定键、词典按主人分（用户 2026-10-08 定，spec §1「界面翻译」），内置插件名单与路由改成声明式登记（路线图 W5-02、W5-03）落地后，对应文件不再逐个点名插件，就从上表删掉。

## 3. 合并

- 合同与扩展点先合，实现后合；体量大的需求按包与层拆开（`docs/prompts/repository-anti-corruption.md` §4.7）。
- 合并前把分支同步到最新 main（spec §1，2026-10-03）。main 的分支保护（2026-10-08 用 `gh api repos/molis-ai/molis-work/branches/main/protection` 读到）：必需检查只有 `Verify`（对应 `.github/workflows/ci.yml` 的 `verify` 作业，它等 `architecture-boundaries` 和 `secret-scan` 两个作业都成功；改这个作业的名字就等于改保护规则），并且要求分支与 main 同步；必需的批准数是 0，没有开「必须由代码所有者批准」。
- 不开合并队列，不强制评审（spec §1，2026-10-02）。`.github/CODEOWNERS` 只自动请求评审，不改分支保护；谁评审、评审哪些包见 `docs/SSOT-MATRIX.md` 的「归属」列。
- PR 描述按 `.github/pull_request_template.md` 写，包括验证结果、基线比对、API 与动作合同影响和基本合同检查。
- 产品用例子集进 CI 的做法（用户 2026-10-08 定，spec §1「CI 产品子集是否挡合并」）：先作一个单独的作业，不挡合并，跑约两周；隔离掉不稳定的用例后并入 `Verify`，不改分支保护。现在 `ci.yml` 有 `architecture-boundaries`、`secret-scan`、`linux-probe`、`product-subset` 和 `verify` 五个作业，其中挡合并的只有前两个，经 `verify` 汇总。`linux-probe` 在 ubuntu 上把全部非浏览器用例逐个跑一遍，记下哪些通过（只记录，约 50 分钟）；`product-subset` 跑 `tests/ci-product-subset.txt`（快而稳、走用户动线的约 370 个文件，加 5 个浏览器冒烟、`tests/i18n.test.ts`），有时间预算，不稳定的文件写进 `tests/quarantine.json`（`file`、`owner`、`since`、`expires`、`reason`，至多 30 天（从 `since` 数起，`since` 不能比运行当天晚）、最多 10 条，到期自动重新计入）。做法、预算、退出码与并入 `Verify` 的步骤见 [PACKAGE-BOUNDARIES.md](PACKAGE-BOUNDARIES.md) 的「产品子集作业」。**日常怎么用**：产品用例新增或改动后，若它快（几秒）、在 Linux 上稳、走用户动线，就加进清单；`product-subset` 作业红了，先看摘要里「Failed」与「Flaky」两节，是自己引入的就修，是偶发的就按摘要里附的条目格式写进隔离名单（owner 写你自己），不要跳过或放宽断言，也不要为了变绿把文件从清单里拿掉。全量产品用例和浏览器用例的全量仍在本机跑。
- 清单和隔离文件自己的规则现在就挡合并，作业本身不挡：这些规则（每行的文件存在、没有 live 或 macOS 专有的用例、冒烟 3 到 5 个、`tests/i18n.test.ts` 在内、隔离项的字段与日期）在 `pnpm health:check` 里，随挡合并的 `architecture-boundaries`（经 `Verify`）检查，没有基线，出一处就失败。这是 W2-16 实现时加的，决定 #14 说的是作业不挡合并（记在 spec §1 同一行）。对每个人的影响：重命名或删除清单里的某个用例，要在同一个 PR 里改 `tests/ci-product-subset.txt` 那一行；给清单里的用例加上 macOS 专有或 live 的用法（直接写，或经它引入的夹具）也会变红，那个用例已经不适合 Linux 子集，在 PR 描述里说明后从清单拿掉。需要日期的两条（隔离到期、`since` 不在将来）不在门禁里，由运行器按当天日期判断。

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

### 6.1 用脚本挑：`scripts/affected-tests.mjs`

上面这张表由脚本执行（路线图 W2-17）。它只读：读 git 的改动、`tests/` 下的用例和各包 README，给出要跑的用例、是否建议全量、陪着跑的检查；只有 `--run` 才动手，而且从不启动全量。

```sh
node scripts/affected-tests.mjs                 # 自 origin/main 合并基点以来的全部改动：已提交、暂存、未暂存、未跟踪
node scripts/affected-tests.mjs <文件>…         # 只看点名的文件，当作整个文件都改了（没有行信息，按整个文件判断）
node scripts/affected-tests.mjs --explain       # 每个用例为什么被选
node scripts/affected-tests.mjs --run           # 跑相关的非浏览器用例；没选到就什么都不跑。--include-browser 再跑浏览器用例，--browser-only 只跑浏览器用例
node scripts/affected-tests.mjs --list [--unit-only|--browser-only]   # 只列文件名，给人看或给别的工具
```

不要写 `node scripts/run-tests.mjs $(node scripts/affected-tests.mjs --list …)`：列表为空（只改了文档，或相关用例都是另一类）时 `run-tests.mjs` 收到零个参数，会把 700 多个用例全跑一遍（约 77 分钟），绕过排时段的规矩。要交给别的命令就先判空；`--list` 在列表为空时会往 stderr 写一句提醒。

`pnpm test:affected` 等于 `node scripts/affected-tests.mjs`。基点是本地的 `origin/main`（没有就退到 `main`，`--base <ref>` 另指），所以先 `git fetch -q origin main`。输出四块：改动的文件；「FULL REGRESSION RECOMMENDED」及原因（有才出现）；相关用例，分非浏览器与浏览器（浏览器 = Linux 探针标记里的 browser，要本机 Chrome，排时段，见第 5 节）；陪着跑的检查（`pnpm build`、`pnpm boundary:check`、健康门禁、页面资源、版本一致性、密钥扫描，按改动内容出现）。`--json` 给机器读，`--list` 只列文件名。

选法，对应上表每一行；每个被选的用例都带原因，`--explain` 看得到：

| 规则 | 脚本怎么做 |
| --- | --- |
| 包的「改动后必跑」 | 读改动所在包 README `## 开发要求` 里 `- 改动后必跑：` 一行的 `tests/….test.ts`。只有非文档文件的改动才触发，README 自己的改动不触发 |
| 读它、调它的用例 | 静态读 `tests/*.test.*` 和它们 import 的 `tests/` 下的 fixture（与探针读标记是同一个闭包），不运行。依次：① 用例自己 import 这个文件，或在字符串里写出它的路径（认 `.js` 与 `.ts`、`dist` 与 `src`、包的子路径 import、`join(root, "plugins", "x")` 这种拼法，也认写到上层目录）；② 用例触及这个包（import 包名，或路径进了包目录）并提到这个文件导出的名字，已删除的导出也算（用例会因此加载失败）；③ 用例文件名对得上：`tests/<文件名>` 开头，`actions`、`store` 这类通用名改用 `<包目录名>-<文件名>`；④ 包整体：import 该包或以包目录名开头的用例 |
| 带 `L()` 文案加 `tests/i18n.test.ts` | 产品源码里改动的行（注释不算）调用翻译函数（`L`、`x.L`、`p.text`、`primitives.text`、`translate`、`this.t`），或含中文字符串，或改的是词典文件 |
| 改路由加读这条路由的用例 | 改动行里的 `/api/…`、`/__…`；路由文件（`*-http.ts`、`routes.ts`、`web-*.ts` 等）里任何 `"/x/y"` 字面量。路由文件里，改动落在哪段处理函数里就算改了哪条路由：从每处改动往上找，第一行缩进比改动浅、又写着路由字面量的，就是包着它的那条路由（注释和同缩进的兄弟行不算，最多往上找 120 行），所以只改了处理函数的函数体、没碰路由那一行，也会选到读这条路由的用例。在参数处（`${}`、`:id`）拆开，读这条路由的用例要含全部固定片段（`/api/projects/` 和 `/brief`），查询串不算 |
| 界面加浏览器用例 | 改动在界面包（workbench、design-system、ui-host、im-ui），或文件名像客户端、样式、视图、渲染器，或是 css、html、svg，或改动行是页面脚本与样式模板。加 README「界面改动加跑」一行里 `再加跑` 之前的用例，并加该包同名的浏览器用例。输出提示页面资源门禁和三宽度、明暗截图（PR 模板） |
| 全量 | 见下 |

收窄，避免一次选出几百个：

- 一个包被超过 40 个用例 import 或同名时不整包选，只选读到改动文件与名字的用例，Notes 里写明；`--wide` 选全部。
- 一个文件只被借 fixture 间接读到（用例自己没写它），共用这个 fixture 的用例超过 25 个时不选：那些用例是起整个宿主，不是读这个文件；Notes 写出 fixture 名。`--wide` 选全部。
- 一个名字被超过 25 个用例直接提到，说明不了谁读它，不用。
- 一条路由被超过 25 个用例提到（`/projects/` 在 199 个用例里，`/health` 在 143 个），说明它只是路径的一个常见片段，不当作“读这条路由”：不选，Notes 写出路由和个数，`--wide` 选全部。点名一个路由文件（当作整个文件都改了）时也一样：`web-request.ts` 原来选出 265 个用例，现在 70 个。这个上限比 10-03 原话“所有读这条路由的用例”窄，代价不止这两个片段：在全部产品源码里量（`76ba1545`），被它挡掉的真路由还有 `/settings`（77 个用例）、`/api/plugins`（62）、`/archive`（58）、`/sessions`（38）、`/api/plugins/io.molis.work.coding`（28），片段还有 `/desktop/`（236）、`/settings/`（66）。它们的读者不选，只在 Notes 里写出路由和个数。`web-catalog.ts` 在装配名单上，改它本来就建议全量；`web-goals-read.ts`、`web-routing.ts`、`document-routes.ts` 这类不在名单上的文件改到这些路由时，读者只在 Notes 里，不在用例列表里，`--wide` 才选。放不放宽等用户拍板（第 12 节第 3 点）。
- README 里除「改动后必跑」「界面改动加跑」之外带测试路径的分项（「助理逻辑验证」等）和 `再加跑` 之后的条件部分，只列在 Notes，`--readme-extras` 才选。
- 没有任何用例直接读到的改动文件单独列出（`No test reads these directly`），别当成已覆盖。

建议全量的条件，写在 `scripts/affected-tests/rules.mjs`，`tests/affected-tests.test.ts` 逐条验证：

- 改了 contracts、kernel 或任一 `modules/*`。
- 改了 local-host 的装配或 workbench 的外壳文件：名单是 rules.mjs 的 `assemblyFiles`，共 23 个文件，不含 `index.ts` 出口，来源有三处。测试逐条核对这些来源：下面说“README 点到”的文件，README 里真有这个文件名；说“枢纽表”的，第 2 节的表里真有，README 里没有；两个 README 的「从哪里读代码」表里用途写了“装配”或“组合”的文件都在名单上；两个 README 里“阅读装配方式”指到的文件，在名单上或明确排除。
  - 两个包 README 按文件名点到的 15 个：local-host 的 `project-host`、`local-host`、`project-capabilities`、`web-server`、`mcp-server`、`system-agent-service`、`goal-project-application`（local-host README「从哪里读代码」表）；workbench 的 `ui-composition`、`goals-page-renderer`、`scripts/client/initialization`、`browser-assets`（workbench README 同一张表），以及 `builtin-plugins`、`plugin-catalog`、`plugin-workbench`（workbench README 不变量里“派生相应投影”那一句点到的 `src/` 下三个文件；注意 README 没点到客户端程序 `scripts/client/plugin-workbench`，它是下一条里的），再加 `apps/local-host/src/workbench-renderer.ts`（workbench README“阅读装配方式”指到的现有调用方，12 行，把 Workbench renderer 绑到这个 Host 的语言、桌面端口和 Goals 默认值上）。
  - 第 2 节枢纽表里把东西接在一起的 7 个，两个 README 没按文件名点到：local-host 的 `web-request`（路由分发）、`web-catalog`、`project-plugins`（`AGENTS.md` 把每个新内置插件的装配点指到它，第 2 节按枢纽对待）；workbench 的 `renderer`（README 只在“一次典型调用”里把它叫作“Workbench renderer”）、`immersive-shell`、`page-assets`，以及浏览器端的客户端程序 `scripts/client/plugin-workbench`。
  - `apps/workbench/src/document-shell.ts`：README 和枢纽表都没点名，是实现时按判断加的，因为它出整页外壳文档和 `WORKBENCH_UI_SLOTS` 这五个挂载位。
  - 明确不在名单上的：`apps/desktop/src/web-host.ts`（local-host README 在同一句“阅读装配方式”里指到它，但它是 desktop 包的文件，不属于 local-host 的装配或 workbench 外壳；测试固定这一点）；`index.ts` 出口；`apps/workbench` 的其余文件（`src` 下 214 个，包里共 217 个，大多是某个插件的一页或一块界面，见第 12 节第 1 点）。
- 改了存储或迁移：`packages/storage` 的任何源码；名字带 migration 的文件；改动行调用或写了 `PRAGMA user_version`、`user_version`、`applySqliteBaseline`；或者一个产品源码文件持有的结构变了。后一种不看哪几行变了，而是把这个文件在合并基点和现在的两个版本各读一遍，比较它持有的结构：所有含 `CREATE`、`ALTER`、`DROP` 表、索引、视图、触发器或 `PRAGMA user_version` 的字符串与模板字符串的全文，和每个 `SqliteBaseline = { version, schema }` 声明的整个内容。所以 `version: 2` 改 `3`、在多行 `CREATE TABLE` 中间加一列、删一张表都算，注释里的 DDL 不算；名字里带 baseline 但不存数据的文件（`proposal-baselines.ts`）不算。点名文件（没有基点可比）时，持有结构的文件按整个文件改了算。此时还会提示 `node scripts/verify-release-versions.mjs`（库版本表在 `docs/releases/CHECKLIST.md`）。
- 动了三个或更多包的非文档文件。
- 删了整块旧代码：三个或更多源文件被删除（已暂存或已提交的改名不算删除；没暂存的 `mv` 见下面的局限）；或者产品源码里取走的代码行（不算注释和空行）合计 300 行或更多，按文件算“删去的减去加上的”，所以重写一个文件不算、别处新增一个文件也盖不住。300 取自 2026-09-28 以来合入的 245 个 PR：合计取走 300 行以上的有 17 个（7%），其中有 #164（旧表单）、#176（独立页面）、#198（旧构建器）、#260（库基线）、#263、#268（事件前历史）、#269、#272、#275、#285 这些删旧路径的 PR；取 200 是 26 个，取 500 是 13 个。
- `--full`：阶段收尾，或合入后相关用例意外失败；这两条看 diff 看不出来，要人说。

脚本只建议，不替你跑全量。

`--run` 守第 5 节的规矩：改动的包源码比它的 `dist` 新（没构建）就拒绝，`--allow-stale` 放行；`pgrep` 看到别的构建、测试运行或 tsc 就拒绝，`--ignore-busy` 放行。先跑非浏览器用例；给了 `--include-browser` 且前一批通过，才跑浏览器用例；`--browser-only` 只跑浏览器用例。没选到任何用例就什么都不跑。两批各是一次 `scripts/run-tests.mjs`。

局限，知道它会漏、会多的地方：

- 它读文本，不读运行。字符串拼出来的路径、动态 import、环境变量传的路径看不到；用例对包名的 import 只看到包名，看不到包里哪个文件被用到，大包只能靠上面的收窄规则。
- 不追反向依赖：改了 A 包，只依赖 A 的 B 包的用例不会被选。波及面大的改动走全量条件，不靠它挑。
- 阈值（40、25、3 个包、3 个文件、300 行、往上找 120 行）是首批取值，不是量出来的最优。用一两周后按漏选、多选的实例调；调的地方只有 `rules.mjs` 的 `LIMITS` 和 `FULL_REGRESSION`。
- 路由按缩进认包着改动的那一层：路由条件拆成几行、路由字面量那行和函数体缩进一样时认不到（只剩改动行里直接写着的路由）；顶层的辅助函数不算在任何路由里；删除整段处理函数时，只有被删的行里写着路由才认得到。
- 改名要先暂存：git 只有在两个路径都进了索引之后才认得出改名。没 `git add` 的 `mv` 在它眼里是三个删除加三个未跟踪的新文件，于是报“删了整块旧代码”并建议全量（3 个源文件，或搬走的代码行达到 300）。这是往安全的一侧错；输出里这时会多一句提示，`git mv` 或 `git add -A` 之后再问一次就只剩改名。改名的同时改了很多内容，git 也可能认不成改名，那就按删除加新增算。
- 三处对 10-03 原话的读法还没有人拍板（第 12 节）：“workbench 外壳”读成名单上的文件，不是整个 `apps/workbench`；“删除整块旧代码”读成 3 个文件或 300 行，没有别的形状（比如只删一个 250 行的大函数）；“所有读这条路由的用例”读成最多 25 个，更多的只在 Notes 里。
- 它不替代 CI：CI 每个 PR 都跑的合同与门禁用例（`pnpm test:contracts` 等）不一定在选出的用例里。

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
- 挑相关用例的脚本已有（第 6.1 节）；阈值是首批取值，要用一两周后按漏选、多选的实例调整，反向依赖不追。有三处读法等用户（或统筹会话）拍板，现在按推荐的做：
  1. “workbench 外壳”。选项：名单上的 23 个文件（推荐：`apps/workbench` 的 `src` 下有 214 个文件（包里共 217 个），大多是某个插件的一页或一块界面，这类改动已经会选浏览器用例，整包都算外壳会让每个界面小改动都建议跑 77 分钟）；整个 `apps/workbench`（README 第一行把整个包叫“工作台外壳”）；名单加上 `side-panel*`、`assistant-dock`、`project-home` 这类外壳零件。“local-host 的装配”同理，名单是 11 个文件：README 按文件名点到的 8 个（`project-host`、`local-host`、`project-capabilities`、`web-server`、`mcp-server`、`system-agent-service`、`goal-project-application`，加 workbench README 指到的 `workbench-renderer`），加第 2 节枢纽表与 `AGENTS.md` 点到的 3 个（`web-request`、`web-catalog`、`project-plugins`）。workbench 的 12 个里，README 按文件名点到 7 个（`ui-composition`、`goals-page-renderer`、`scripts/client/initialization`、`browser-assets`、`builtin-plugins`、`plugin-catalog`、`plugin-workbench`）；另 5 个（`renderer`、`immersive-shell`、`page-assets` 和客户端程序 `scripts/client/plugin-workbench` 来自枢纽表，`document-shell` 是实现时加的，两处都没点名）要不要留，随这一问一起定。
  2. “删除整块旧代码”。选项：3 个文件或净取走 300 行（推荐，现状，以 245 个 PR 量过）；只看文件数；再加一条“一个文件净取走 150 行以上”以抓住只删一个大函数的情形（245 个 PR 里 18 个会触发，其中只有 4 个是 300 行条件抓不到的）。
  3. “所有读这条路由的用例”。现状：一条路由被超过 25 个用例提到就不选（Notes 写出路由和个数，`--wide` 选全部），因为 `/projects/`（199 个）、`/health`（143 个）、`/desktop/`（236 个）这类只是路径的常见片段，全选会让每个路由改动都带上几百个用例（`web-request.ts` 原来选出 265 个，现在 70 个）。代价是真路由也被挡，在 `76ba1545` 上量：`/settings`（77）、`/api/plugins`（62）、`/archive`（58）、`/sessions`（38）、`/api/plugins/io.molis.work.coding`（28）；不在装配名单上的文件（`web-goals-read.ts`、`web-routing.ts`、`document-routes.ts`）改到它们时，读者只在 Notes 里。选项：保持 25（推荐，现状；Notes 与 `--wide` 兜底）；把上限提到 80，让上面五条真路由选上（`/settings/` 的 66 也会进来），`/projects/`、`/health`、`/desktop/` 仍挡；不设上限，路由改动一律带上所有读者（一次可到几百个用例）。
- 测试并发隔离（每个测试文件一个 Home 和密钥库，非浏览器用例并发）：路线图 W5-12。在那之前全量约 76–78 分钟。
- 产品子集并入 `Verify`（路线图 W2-16，决定 #14）：`product-subset` 作业已有（清单、浏览器冒烟、隔离名单，见第 3 节），现在不挡合并；它在 main 上第一次运行之后约两周，隔离掉不稳定的文件，再并入 `Verify`，步骤见 [PACKAGE-BOUNDARIES.md](PACKAGE-BOUNDARIES.md) 的「产品子集作业」。
- 远端已合入分支的清理与「合并后自动删除分支」：用户来做（见第 10 节），还没做。
- 第 4 节的 PR 体量数字是建议；要改成门禁，先量再定。
- 从零安装到跑起预览与测试的步骤和耗时（新成员上手）：还没写。
