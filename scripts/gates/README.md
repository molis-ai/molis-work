# 文档引用与仓库形状门禁

`pnpm health:check`（入口 `scripts/check-health-gates.mjs`，CI 里对照 merge-base 跑）里，和数字门禁并列的一组规则：文档指向的东西必须存在，仓库根目录、`.impeccable/`、`contracts` 的子路径只许变少。设计来源：[specs/repository-anti-corruption](../../specs/repository-anti-corruption/spec.md) §4.12–§4.14（W1-06）。

入口只引入 `doc-gates.mjs` 这一个文件；每条规则一个模块，互不引用（共用的只有两个读取模块：Markdown 在 `markdown.mjs`，根目录允许名单在 `allowlist.mjs`）。哪些顶层文件夹算文档、哪些能起头一个被引用的路径，只有一份来源：`tooling/gates/root-allowlist.json`（`allowlist.mjs` 的 `allowedRoots` 读它）；往名单里加一个文件夹，它的 `.md` 链接和被引用的路径就自动被查，名单之外的（stray）两者都不查。

## 两种规则

| 种类 | 含义 | 在哪里算 |
| --- | --- | --- |
| 问题（problems） | 没有基线，从 0 开始，出现一处就失败 | 只量工作树 |
| 计数（metrics） | 只许减少，对照 merge-base 比，PR 里改 `baseline.json` 放不过 | 工作树与 merge-base 各量一遍 |

## 规则一览

| 规则 | 模块 | 失败时说什么 | 怎么办 |
| --- | --- | --- | --- |
| 活文档里没有断链 | `doc-links.mjs` | `broken link: <文件>:<行>: link … points at …` | 改链接；文件已删就写成不带链接的文字并说明去向。`archive/`、`node_modules/`、`.impeccable/`、`dist/` 与根目录允许名单之外的条目（`outputs/`、`.zcode/`）不查；围栏代码块与行内代码里的不算链接；`http:`、`mailto:` 等外链不查；指向 `.md` 的 `#锚点` 按 GitHub 规则对标题查 |
| `skills/`、`AGENTS.md`、`docs/system/CALL-CHAINS.md` 引用的路径与动作 id 存在 | `doc-citations.mjs` | `bad citation: … points at …` / `… is not an id the code defines` | 改文档；确属有意（计划中的文件、插件工程内的相对路径）写进 `tooling/gates/doc-citation-exceptions.json`，带理由，不再需要时门禁会要求删掉 |
| `specs/README.md` 索引与根目录分类 | `spec-index.mjs` | `spec index: …` | 根目录的 spec 目录都要在索引里出现一次：状态句以「状态：现行规范」开头的列在「现行规范」，其余在「在做的」；索引里不列归档的；`specs/` 根只放 `README.md`、`BACKLOG.md`、`archive/` 与 spec 目录 |
| BACKLOG 没有完成行 | `backlog-rows.mjs` | `BACKLOG: … says it is done` | 做完就删行，在提交说明里写编号；编号不复用 |
| 根目录只放允许名单里的 | `root-entries.mjs` + `tooling/gates/root-allowlist.json` | `tracked files at the repository root outside the allow-list in <名>` | 放到合适的目录；确要放在根目录，把名字和理由写进允许名单。名单里的名字不在根目录了要删。名单之外的现存条目只许变少 |
| `.impeccable/` 文件数只许减少 | `impeccable-files.mjs` | `tracked files under .impeccable in <组> n → m` | 评审截图默认写进被忽略的 `.impeccable/qa/review/`；原地覆盖已有图不改数量；删掉没有现行 spec、文档或测试引用的评审组 |
| `contracts` 没有占位子路径 | `contract-placeholders.mjs` | `descriptor-only, unused contracts subpath in ./<子路径>` | 占位子路径 = 源文件只导出一个 `ContractDescriptor` 常量，且仓内没有 import、也没有包的 `contract` 元数据指向它。要用就放类型进去，不用就别加（现存的由 W2-01 删） |

## 引用怎么写，门禁才认

门禁读的是**行内代码**（`like this`），围栏代码块是示例，不读。

- **路径**：以根目录允许名单里的顶层文件夹开头（`apps/`、`docs/`、`packages/`、`plugins/`、`tests/`、`tooling/` …；名单之外的 `outputs/` 不读）。`<名>`、`{名}`、`*`、`{a,b}` 表示「这里是什么」，至少一个入库的文件要匹配。末尾的 `:行号`、`#锚点`、`()` 会去掉。被 `.gitignore` 忽略的目录（`dist/`、`.impeccable/qa/`）下的路径算存在。
- **命令**：`pnpm <脚本>` 的脚本要在根 `package.json` 里（或是 pnpm 自带命令）；带 `--filter` 的不读。
- **动作 id**：`owner.名词.动词`、`molis_work_v1_action_<id>__v<N>`、以 `.vN` 结尾的类型化 id。只读首段是插件、模块或横向服务目录名（`plugins/native/<x>`、`modules/<x>`、`horizontal/<x>`）的写法；`ui.views`、`services.events` 这类 Manifest 字段与 SDK 成员不读。id 要么整串是源码里的字符串字面量，要么去掉首段后是该目录里的字面量（插件写 `define("reminders.recover")`，目录给它加上 `schedule.`），要么匹配某个拼 id 的模板字面量（`` `${station.id}.content.${role}` ``）；模板在首段之后至少要有一段固定文字，只固定了插件名的（`` `pages.${name}` ``、`` `shelf.${recipe}.${optionId}` ``）不算，否则这个插件的任何拼写错误、已删除的 id 都会被放过。有固定文字的模板只按形状匹配，仍会放过同形状的任何 id，见下面「门禁读不到的」。只在测试、`fixtures/`、构建产物或 `tooling/gates/` 自己的数据文件里出现的 id 不算（后者是「这条被豁免了」的记录，不是定义）。

门禁读不到的（读不到的地方，写文档的人自己要核对）：

- `.cursor/rules/*.mdc` 的 glob，没有放进行内代码的路径。
- `owner` 不是目录名的动作 id（如 `schedules.add`）：整串存在时不会失败，写错也不会被发现。
- 动作 id 的模板匹配只认形状：模板字面量里只要首段之后有固定文字，凡是形状对得上的 id 都算有定义，门禁不知道占位符实际会取哪些值。`` `feed.sources.${suffix}` `` 让任何 `feed.sources.<x>` 通过（`docs/system/CALL-CHAINS.md` 引用的 `feed.sources.sync`、`feed.sources.tick` 只靠它认出来，只查形状：写错最后一段，或者哪天删掉这两个动作，都不会被发现）；`` `feed.items.${suffix}` ``、`` `jelly.material.${code}` `` 同理；`` `${station.id}.content.${role}` `` 让任何 `<插件>.content.<角色>` 通过（`goals.content.receive` 这类不存在的 id 会通过）；`` `${x}.published` ``、`` `${x}.version` ``、`` `${prefix}${id}.resources.read` `` 这类让这些后缀对任何插件都算有定义（`todo.published`、`pages.version`、`goals.resources.read` 会通过）。要收紧得解析占位符的取值范围，需要一个解析器，不值当；引用这类 id 时自己对着源码核对。只固定了插件名的模板不算（见上），那类写错会被发现。
- MCP 工具名只认 `molis_work_v1_action_<id>__v<N>` 这一种：`molis_work_v1_context_resolve` 这类上下文工具（例如 `skills/goal-advance/references/service-start.md` 里）不读，写错也不会被发现。
- BACKLOG 完成行只认单元格被划线、或单元格以 已完成、已实现、已做完、已关闭、完成、done 开头：写成「已修复（#300）」「已合入 main」的行不会失败（「待你验收」一节的行本来就是做完了等试用，写「已合入 main」是正常的，按这类字样判会误报，所以不加进规则）。做完就删行是纪律，不是这条规则能全部兜住的。

## 报告模式：spec 验收编号（还不是门禁）

`node scripts/check-spec-coverage.mjs`（读取在 `spec-coverage.mjs`）：在做的 spec 的验收标准有没有编号，编号有没有测试引用。写法、`[人工]`、`~~` 作废和 `验收编号：不适用（理由）` 都在 [specs/README.md](../../specs/README.md) 的「验收编号」。默认是**报告模式**：打印结果，退出码永远是 0（`--strict` 才在有问题时退出 1，`--root`、`--json` 见脚本开头）；CI 里这一步带 `continue-on-error`，所以它现在不会让任何构建变红。`pnpm health:check --report` 里有它的一行摘要。

它会报的问题（`--strict` 会失败的就是这些）：

| 问题 | 含义 |
| --- | --- |
| `unnumbered` | spec 有标题含「验收」的一节，却一个编号都没有，也没有写 `验收编号：不适用（理由）` |
| `criterion-without-id` | 同一个标题下已有带编号的条目，另有列表项或表格行没有编号 |
| `uncovered` | 编号没有被任何测试文件引用，也没有标 `[人工]` 或作废 |
| `stale-reference` | 测试引用了 spec 里没有的编号（前缀是某份 spec 的），或已作废的编号 |
| `duplicate-id`、`prefix-shared`、`prefix-mixed`、`reserved-prefix` | 编号定义了两次；一个前缀被两份 spec 用；一份 spec 用了两个前缀；用了 `BL`、`PMR` |
| `exempt-without-reason`、`exempt-but-numbered` | `验收编号：不适用` 没写理由；写了不适用却又定义了编号 |

读不到的：只读 `specs/<目录>/spec.md`（`archive/` 与 spec 目录里的其他文件不读）；编号写在 spec 里别的节或正文里不算定义；测试里提到编号就算引用，不看提到的位置是不是真的在证明那一条；只认 `git ls-files` 里的文件，新文件要先 `git add`。验证：`node scripts/run-tests.mjs tests/health-gates-spec-coverage.test.ts`（每种问题在临时仓库里被故意造一次，报告模式仍退出 0、`--strict` 退出 1）。

## 怎么加一条规则

1. 没有基线的检查：写 `scripts/gates/<名>.mjs`，导出 `(snapshot) => string[]`；`snapshot` 是 `{ files, read(file) }`（入库文件与读取函数）；在 `doc-gates.mjs` 的 `docGateProblems` 里加一行。
2. 只许减少的计数：模块导出一个规则对象（`id`、`baselineKey`、`totalKey`、`measure(snapshot)`、`grewWhat`、`grewHint`、`title`、`summary`），在 `doc-gates.mjs` 的 `docGateMetrics` 里加进去；merge-base 一侧读不到的文件在 `docGateInputs` 里登记。
3. 在 `tests/doc-reference-gates.test.ts` 里加突变用例：干净的底子上加一处违规，`--base main` 要失败；计数类再确认 `--update --base main` 拒绝写入、本机改基线后 CI 的比法仍然失败。

## 验证

`node scripts/run-tests.mjs tests/doc-reference-gates.test.ts`（CI 里单独一步跑）。每条规则在临时仓库里被故意违反一次，门禁必须变红；还有「合法写法不误报」与「变小时通过」的用例。
