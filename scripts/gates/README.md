# 文档引用与仓库形状门禁

`pnpm health:check`（入口 `scripts/check-health-gates.mjs`，CI 里对照 merge-base 跑）里，和数字门禁并列的一组规则：文档指向的东西必须存在，仓库根目录、`.impeccable/`、`contracts` 的子路径只许变少。设计来源：[specs/repository-anti-corruption](../../specs/repository-anti-corruption/spec.md) §4.12–§4.14（W1-06）。

入口只引入 `doc-gates.mjs` 这一个文件；每条规则一个模块，互不引用（共用的 Markdown 读取在 `markdown.mjs`）。

## 两种规则

| 种类 | 含义 | 在哪里算 |
| --- | --- | --- |
| 问题（problems） | 没有基线，从 0 开始，出现一处就失败 | 只量工作树 |
| 计数（metrics） | 只许减少，对照 merge-base 比，PR 里改 `baseline.json` 放不过 | 工作树与 merge-base 各量一遍 |

## 规则一览

| 规则 | 模块 | 失败时说什么 | 怎么办 |
| --- | --- | --- | --- |
| 活文档里没有断链 | `doc-links.mjs` | `broken link: <文件>:<行>: link … points at …` | 改链接；文件已删就写成不带链接的文字并说明去向。`archive/`、`node_modules/`、`.impeccable/`、`dist/` 与不在文档目录里的顶层文件夹不查；围栏代码块与行内代码里的不算链接；`http:`、`mailto:` 等外链不查；指向 `.md` 的 `#锚点` 按 GitHub 规则对标题查 |
| `skills/`、`AGENTS.md`、`docs/system/CALL-CHAINS.md` 引用的路径与能力 id 存在 | `doc-citations.mjs` | `bad citation: … points at …` / `… is not an id the code defines` | 改文档；确属有意（计划中的文件、插件工程内的相对路径）写进 `tooling/gates/doc-citation-exceptions.json`，带理由，不再需要时门禁会要求删掉 |
| `specs/README.md` 索引与根目录分类 | `spec-index.mjs` | `spec index: …` | 根目录的 spec 目录都要在索引里出现一次：状态句以「状态：现行规范」开头的列在「现行规范」，其余在「在做的」；索引里不列归档的；`specs/` 根只放 `README.md`、`BACKLOG.md`、`archive/` 与 spec 目录 |
| BACKLOG 没有完成行 | `backlog-rows.mjs` | `BACKLOG: … says it is done` | 做完就删行，在提交说明里写编号；编号不复用 |
| 根目录只放允许名单里的 | `root-entries.mjs` + `tooling/gates/root-allowlist.json` | `tracked files at the repository root outside the allow-list in <名>` | 放到合适的目录；确要放在根目录，把名字和理由写进允许名单。名单里的名字不在根目录了要删。名单之外的现存条目只许变少 |
| `.impeccable/` 文件数只许减少 | `impeccable-files.mjs` | `tracked files under .impeccable in <组> n → m` | 评审截图默认写进被忽略的 `.impeccable/qa/review/`；原地覆盖已有图不改数量；删掉没有现行 spec、文档或测试引用的评审组 |
| `contracts` 没有占位子路径 | `contract-placeholders.mjs` | `descriptor-only, unused contracts subpath in ./<子路径>` | 占位子路径 = 源文件只导出一个 `ContractDescriptor` 常量，且仓内没有 import、也没有包的 `contract` 元数据指向它。要用就放类型进去，不用就别加（现存的由 W2-01 删） |

## 引用怎么写，门禁才认

门禁读的是**行内代码**（`like this`），围栏代码块是示例，不读。

- **路径**：以仓库顶层目录开头（`apps/`、`docs/`、`packages/`、`plugins/`、`tests/`、`tooling/` …）。`<名>`、`{名}`、`*`、`{a,b}` 表示「这里是什么」，至少一个入库的文件要匹配。末尾的 `:行号`、`#锚点`、`()` 会去掉。被 `.gitignore` 忽略的目录（`dist/`、`.impeccable/qa/`）下的路径算存在。
- **命令**：`pnpm <脚本>` 的脚本要在根 `package.json` 里（或是 pnpm 自带命令）；带 `--filter` 的不读。
- **能力 id**：`owner.名词.动词`、`molis_work_v1_action_<id>__v<N>`、以 `.vN` 结尾的类型化 id。只读首段是插件、模块或横向服务目录名（`plugins/native/<x>`、`modules/<x>`、`horizontal/<x>`）的写法；`ui.views`、`services.events` 这类 Manifest 字段与 SDK 成员不读。id 要么整串是源码里的字符串字面量，要么去掉首段后是该目录里的字面量（插件写 `define("reminders.recover")`，目录给它加上 `schedule.`），要么匹配某个拼 id 的模板字面量（`` `${station.id}.content.${role}` ``）。只在测试里出现的 id 不算。

门禁读不到的：`.cursor/rules/*.mdc` 的 glob、没有放进行内代码的路径、`owner` 不是目录名的 id（如 `schedules.add`，它整串存在时不会失败，但写错也不会被发现）。

## 怎么加一条规则

1. 没有基线的检查：写 `scripts/gates/<名>.mjs`，导出 `(snapshot) => string[]`；`snapshot` 是 `{ files, read(file) }`（入库文件与读取函数）；在 `doc-gates.mjs` 的 `docGateProblems` 里加一行。
2. 只许减少的计数：模块导出一个规则对象（`id`、`baselineKey`、`totalKey`、`measure(snapshot)`、`grewWhat`、`grewHint`、`title`、`summary`），在 `doc-gates.mjs` 的 `docGateMetrics` 里加进去；merge-base 一侧读不到的文件在 `docGateInputs` 里登记。
3. 在 `tests/doc-reference-gates.test.ts` 里加突变用例：干净的底子上加一处违规，`--base main` 要失败；计数类再确认 `--update --base main` 拒绝写入、本机改基线后 CI 的比法仍然失败。

## 验证

`node scripts/run-tests.mjs tests/doc-reference-gates.test.ts`（CI 里单独一步跑）。每条规则在临时仓库里被故意违反一次，门禁必须变红；还有「合法写法不误报」与「变小时通过」的用例。
