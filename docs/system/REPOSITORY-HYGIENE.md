# 仓库卫生：哪些材料留在树里

这里写不属于任何包、却会在仓库里越积越多的材料：评审截图与设计记录、根目录的杂项、vendored 的 Prologue 包。每一类说清楚留什么、不留什么、谁来拦。依据是仓库防腐整理的决定（2026-10-08，`specs/repository-anti-corruption/spec.md` §1 的「评审截图与根目录材料」与「Prologue SDK 收敛与私有包」）。

删除一律只从当前的树里拿掉，Git 历史不改写：旧提交里仍然看得到，下面各节写明了去哪里取。

## `.impeccable/`：评审截图与设计记录

`.impeccable/` 有两种位置：仓库根目录的，和嵌在目录里的（`docs/design/<名字>/.impeccable/`、`plugins/native/plugin-builder/.impeccable/`，以前还有 `apps/workbench/`、`specs/archive/goal-timeline-redesign/`）。里面是评审截图（`review/`）、设计记录（`surfaces/`、`design.json`）、mock 图（`mocks/`）。

**只留被点名的。** 一个文件留在树里，当且仅当现行的 spec、文档、Skill、测试或脚本点名了它，或点名了它所在的评审组：

- 按路径点名：`.impeccable/review/<组>/…`、`.impeccable/surfaces/<记录>.md`，Markdown 相对链接（`../../.impeccable/…`）和花括号写法（`preview-{desktop,mobile}.png`）都算；点名一个评审组目录，留下整个目录。
- 测试写入的评审组：测试通过 `tests/fixtures/review-evidence.ts` 的 `REVIEW_EVIDENCE` 或 `reviewEvidenceUrl("<组>/")` 写进的目录。设了 `MOLIS_WORK_REVIEW_EVIDENCE=1` 重跑测试，就是刷新这些组。
- 被已留下的设计记录点名的文件：记录里写的 `.impeccable/…` 路径，以及它用相对链接指向的同目录树里的文件（例如 `surfaces/feed-source-workbench.md` 链到的 `review/feed/` 下六张图），随记录留下。
- 按角色点名的 sidecar：设计文档（`DESIGN.md`）写到「sidecar」时，指的就是同目录树下的 `.impeccable/design.json`（阴影、动效、色阶的精确值），不管句子里有没有写出路径。写到它的文档在，它就留。

`specs/archive/`、`docs/archive/` 和防腐整理自己的报告不算「现行」：只被它们点名的，不留。

**怎么查一个文件被谁点名**：路径要查，角色也要查。只按路径查会漏掉「保存在 sidecar」这种写法（2026-10-08 第一轮清理就漏过两份，复查时补回）。

```bash
# 按路径
git grep -n -F ".impeccable/review/<组>" -- . ':!specs/archive' ':!docs/archive'
# 按角色：哪些设计文档在指望旁边的 design.json
git grep -n -i "sidecar" -- '*DESIGN.md'
```

**新截图默认不入库。** 测试截图写进已被忽略的 `.impeccable/qa/review/`（AGENTS.md「构建与测试」）。`MOLIS_WORK_REVIEW_EVIDENCE=1` 只用来覆盖已入库的同名图，不增加文件。

**门禁**：`pnpm health:check` 的 `impeccable`（`scripts/gates/impeccable-files.mjs`，接在 `scripts/check-health-gates.mjs` 的 `METRICS` 里）数全部 `.impeccable/` 下入库的文件，含嵌套的，按评审组计数：组是 `.impeccable/` 往下第二层的目录（`.impeccable/review/<组>`、`.impeccable/mocks/<组>`），直接放在 `review/`、`surfaces/` 里的文件算那一层，组里更深的文件算组里。每个组只许减少，没有记录的组从 0 开始。所以：覆盖同名图、组内改名、删文件都通过；新增一张图、新增一个评审组、把文件从一组挪到另一组都不通过，在别处删文件也抵不掉（总数是减了，挪进去的那组变多了）。真有一组该入库，要改门禁本身，那要过评审。CI 用 `--base` 与合并基点比较，改 `tooling/gates/baseline.json` 绕不过去；`tests/health-gates-impeccable.test.ts` 在小仓库里验证每条规则（多一个文件就失败、`--update` 不能洗掉、不带 `--base` 的快查对已提交的基线同样拦、被忽略的 QA 目录和名字相近的目录不算、名为 `.impeccable` 的文件不算目录、删文件通过、`--report` 的排序与 `--top`），并用与 `vendored-provenance` 同样的办法检查过：把脚本里的 `&&`、`||` 逐个换成反的，每一处都有用例变红。门禁只管数量，「是不是被点名」靠上面的方法，评审时查。

**2026-10-08 的清理**：1,104 个文件（根目录 1,085 个、嵌套 19 个，约 112 MiB）清到 318 个（约 21 MiB）：

- 根目录 314 个：`review/` 313 个（`action-service`、`continuous-v11` 等被现行 spec 或测试点名的评审组，加上 `feed/` 下被 Feed 记录链接的六张图），`surfaces/` 1 个（`feed-source-workbench.md`，插件 Feed 的 DESIGN.md 点名）。
- 嵌套 4 个，全是 `design.json`：`docs/design/molis-work-onboarding/prototype/`、`docs/design/molis-work-onboarding/oauth-redesign/`、`docs/design/soft-workbench/` 和 `plugins/native/plugin-builder/`，各自的 `DESIGN.md` 写明精确值留在 sidecar。
- 删掉的：没人点名的评审组、全部 `mocks/`、`critique/`、`goalboard-surface-brief.md`、根目录的 `design.json`（根 `DESIGN.md` 没有指望它）、`apps/workbench/.impeccable/` 的 2 份表面记录，以及 `specs/archive/goal-timeline-redesign/.impeccable/` 的 13 张图。

被删的文件在提交 `e4bdeb12` 里一个不缺：

```bash
git show e4bdeb12:.impeccable/mocks/decision/canon.png > /tmp/canon.png
git ls-tree -r --name-only e4bdeb12 -- .impeccable
```

## 根目录

根目录只放仓库本身的入口文件、包目录和配置。下面这些以前在根目录，已经移走：

| 材料 | 现在 | 说明 |
| --- | --- | --- |
| `molis-work-introduction.html`（9/25 第四版介绍页） | `docs/product-intro/archive/molis-work-introduction.html` | 对外介绍的正式位置是 `docs/product-intro/`；旧介绍页只作叙事参考，`v0`、`v1` 里的链接已改过去 |
| `outputs/`（定位材料与商业计划） | 不入库 | `.gitignore` 的 `/outputs/`；商业材料放在仓库之外 |
| `.zcode/`（个人工具的会话计划） | 不入库 | `.gitignore` 的 `/.zcode/`；个人工具状态不进仓库 |

这两项从树里拿掉的只是入库的那几个文件（`outputs/molis-work-positioning-2026-09-25/` 下三份定位与计划材料、`.zcode/plans/` 下一份会话计划）。Git 历史不改写，它们仍在 `e4bdeb12` 里，但这是公开仓库的历史，不是商业材料该待的地方。**合并后在主检出拉取时，git 会把工作副本里这几个已入库的文件一并删掉**：要留底的，先复制到仓库之外。取回与列出：

```bash
git ls-tree -r --name-only e4bdeb12 -- outputs .zcode
git show e4bdeb12:outputs/molis-work-positioning-2026-09-25/bp.zh-CN.md > bp.zh-CN.md
```

`.gitignore` 里旧名 `.goalboard/` 与 `.requirements/` 两行也去掉了：现在没有任何代码、文档或脚本会在仓库里建这两个目录（代码里没有 `.goalboard` 的引用；Home 目录里的 `~/.goalboard` 链接是真实 Home 的事，见 `docs/system/HOME-DATA.md`）。

## vendored Prologue 包

`vendor/prologue-sdk/` 只放当前使用的包（AGENTS.md「硬约束」）。每个 vendored 的 tgz 旁边有 `<tgz>.sha256` 和 `<tgz>.provenance.json`（字节数、SHA-256、integrity、上游仓库与完整提交、构建用的 Node 与 pnpm）；当前 Prologue 包由上游提交 `9fc3b173` 的 `packages/sdk` 无补丁重建，步骤在该目录 README。历史补丁不留正文：25 份补丁的大小、SHA-256、git blob、基线、来源和它们产出的包记在 `vendor/prologue-sdk/patch-history.json`，补丁本身都在提交 `e4bdeb12`（此后到删除它们的合并之前的提交里也有），按 git blob 取回。

两道门禁：tgz 的份数由 `pnpm health:check` 的 `vendoredPrologueSdk` 限制（`tooling/gates/limits.json`，只许减少）；记录是否与文件相符由 `scripts/gates/vendored-provenance.mjs` 在同一条命令里核对（不靠基线）：tgz 缺 `.sha256` 或 `.provenance.json`、记录与 tgz 的字节数、SHA-256、integrity 不符、`source.commit` 不是完整提交或 `source.dirty` 不为 `false`、包换掉后记录还留着、`alsoBuildableFrom` 点名的补丁不在目录里或字节数、SHA-256 不符、`patch-history.json` 的格式不对或已记为删除的补丁又回到目录里，都会失败。

- **在途分支的包也一样**：要先把 Prologue 的改动提交成完整提交，再从那个提交打包；从未提交的工作树打出来的包过不了 `source.dirty`（它没法按记录重建）。这是这道门禁新加的要求，以前没有。
- **测试**：`tests/vendor-provenance.test.ts`（CI 跑）里门禁脚本的每一条检查都有自己的用例：用例在小仓库的分支上造出那一种违例，`--base main` 比较就失败（另有一个用例确认 `--update` 洗不掉它，不带 `--base` 的快查也失败）。检查方法：在脚本的副本里一次只改一处，每个 `problems.push` 去掉，每个 `&&`、`||`、`===`、`!==` 换成反的，再跑这个测试文件，每一处改动都要让某个用例变红。2026-10-08 这样改了 92 处，没有一处存活（早先的版本有 27 处存活，补了用例）。改门禁脚本时照这个办法再查一遍，不要只看新增的用例过了。
- **门禁读不到的**：`patch-history.json` 只核对格式（字段在不在、是不是 40 位提交或 64 位 SHA-256、列表里有没有重复、引用的提交是不是都列在 `upstream.commitsChecked` 里），不去 Git 里取 `gitBlob` 重算字节数和 SHA-256，也不去上游核对提交。这些数字是 2026-10-08 写入时核对过的，之后要核对，用 `vendor/prologue-sdk/README.md`「已删除的历史补丁」里的取回命令（`git cat-file blob <gitBlob>` 再 `shasum -a 256`）。`provenance.json` 里的 `source.commit` 同样只核对形状，不核对它真是上游的提交。

三个 vendored 包的 tgz（`prologue-sdk`、`intelligence-client`、`search-evidence-layer`）按决定将来改从私有 registry 或 release 附件取，不再放进公开仓库；registry 就绪前它们仍留在 `vendor/`。
