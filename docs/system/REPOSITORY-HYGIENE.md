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

**门禁**：`pnpm health:check` 的 `impeccable`（`scripts/gates/impeccable-files.mjs`，接在 `scripts/check-health-gates.mjs` 的 `METRICS` 里）数全部 `.impeccable/` 下入库的文件，含嵌套的，按评审组计数：组是 `.impeccable/` 往下第二层的目录（`.impeccable/review/<组>`、`.impeccable/mocks/<组>`），直接放在 `review/`、`surfaces/` 里的文件算那一层，组里更深的文件算组里。每个组只许减少，没有记录的组从 0 开始。所以：覆盖同名图、组内改名、删文件都通过；新增一张图、新增一个评审组、把文件从一组挪到另一组都不通过，在别处删文件也抵不掉（总数是减了，挪进去的那组变多了）。真有一组该入库，要改门禁本身，那要过评审。CI 用 `--base` 与合并基点比较，改 `tooling/gates/baseline.json` 绕不过去；`tests/health-gates-impeccable.test.ts` 在小仓库里验证每条规则（多一个文件就失败、`--update` 不能洗掉、被忽略的 QA 目录和名字相近的目录不算、删文件通过）。门禁只管数量，「是不是被点名」靠上面的方法，评审时查。

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

`.gitignore` 里旧名 `.goalboard/` 与 `.requirements/` 两行也去掉了：现在没有任何代码、文档或脚本会在仓库里建这两个目录（代码里没有 `.goalboard` 的引用；Home 目录里的 `~/.goalboard` 链接是真实 Home 的事，见 `docs/system/HOME-DATA.md`）。

## vendored Prologue 包

`vendor/prologue-sdk/` 只放当前使用的包和重建它要用的那一份补丁（AGENTS.md「硬约束」）。历史补丁不留正文：它们的大小、SHA-256 和来源记在 `vendor/prologue-sdk/README.md` 的「已删除的历史补丁」，补丁本身在提交 `e4bdeb12`。tgz 的份数由 `pnpm health:check` 的 `vendoredPrologueSdk` 限制（`tooling/gates/limits.json`）。

三个 vendored 包的 tgz（`prologue-sdk`、`intelligence-client`、`search-evidence-layer`）按决定将来改从私有 registry 或 release 附件取，不再放进公开仓库；registry 就绪前它们仍留在 `vendor/`。
