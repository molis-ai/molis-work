# PG-111：插件的合同归各自插件（Form、灵光、PPT、Dataset，Todo、Pages）

状态：工程验证中（2026-10-25，防腐线 ac-platform，分支 `ac-platform/group6-contracts`）。做法同 [PG-095 的 Images/Jelly 一片](pg095-images-jelly-contracts.md)；第一批是「除本插件和它的测试之外没有任何使用方」的四份（§1、§2）；第二批是 Todo 与 Pages，它们被宿主和 Inbox 用，使用方改成按动作 id 调用、就地声明字段（§3，统筹 2026-10-26 定）；其余见 §4。验收号 RAC-820、RAC-821、RAC-823～825，RAC-822 在引导的测试里。

## 1. 怎么挑出这四份

逐个数 `@molis-ai/molis-work-contracts/modules/<名>` 的使用方（不含 `tooling/` 的快照和文档）：

| 合同 | 本插件 | 测试 | 平台包、宿主、别的插件 |
| --- | --- | --- | --- |
| `form` | 20 | 5 | 无 |
| `lingguang` | 5 | 2 | 无 |
| `ppt` | 10 | 3 | 无 |
| `dataset` | 8 | 1 | 无 |

没有外部使用方，所以挪走不会让任何宿主、模块或别的插件去点名这些插件包，`pnpm health:check` 里「内置插件包名在它自己的包之外被点名的文件数」不会涨。

## 2. 做什么

- `packages/contracts/src/modules/{form,lingguang,ppt,dataset}.ts` 用 `git mv` 挪成各自 `plugins/native/<名>/src/contract.ts`，每个插件包加 `./contract` 出口，平台 `packages/contracts/package.json` 删对应的 `./modules/<名>` 子路径，API 快照 `tooling/gates/api/contracts/modules/<名>.txt` 随 `pnpm api:update` 删除。不留转发层。
- 每份文件开头的 `modules<名>Contract`（`ContractDescriptor`）没有任何使用方，描述符是平台包登记用的，不带走，连同对 `../platform/package.js` 的类型导入一起删。其余常量与类型逐字不变。
- 插件包内的引用改成相对的 `./contract.js`；测试改经插件公开入口 `@molis-ai/molis-work-plugin-<名>/contract`。
- README 的公开入口一行补上数据合同的位置。

不改：动作 id、版本、权限、输入输出 schema、存储、Manifest。`pnpm actions:update` 应当没有差异。

## 3. 第二批：Todo、Pages 与它们的使用方

统筹定的做法（2026-10-26）：使用方按动作 id 调用，就地声明自己用到的输入输出字段，不 import 插件包，也不用平台合同里的插件类型；形状的真相源是动作的 schema，漂移由动作网关的运行时 schema 校验和 `tooling/gates/actions/` 快照兜住，同一个动作 id 换了实现（第三方 Todo）也照样能用。插件自己的常量和记录类型挪进插件的 `./contract`。「留在平台合同里、改名中性」只用于几个插件之间交换、且已在 Manifest 的 `process_items`、`artifacts`、`ports` 里声明的形状；逐个核对后，Todo 与 Pages 的合同里**没有**这样的形状（`TodoBatch` 是 Todo 的整理结果，`PagesBody` 是 Pages 正文，都只是动作的输入输出），所以 Todo 与 Pages 的合同整份挪走，平台合同不留任何一份。

| 使用方 | 原来 | 现在 |
| --- | --- | --- |
| 宿主的引导（`context-onboarding-service.ts`、`-store.ts`） | 取 `TODO_PLUGIN_ID`、`PAGES_PLUGIN_ID`、`TODO_ORGANIZE_MATERIAL_CHARS`、`TodoBatch`、`PagesBody` | 模块里就地写提供方 id（精确钉随宿主发布的 Todo、Pages）、`ProseDocument`（Pages 正文，原样转交）、`OnboardingTodoBatch`（只写引导读的字段：`batch_id`、`revision`、候选的 `candidate_id`、`existing.relation`、`decision.item_id`，其余随结果原样转给页面）、`TODO_PART_CHARS = 60_000`（Todo 的整理读每份材料的前这么多字，所以长材料按这个大小分段；`tests/context-onboarding-todo.test.ts` 的 RAC-822 把它钉到 Todo 自己的数） |
| Inbox（`pages-shapes.ts`） | 取 `PAGES_PLUGIN_ID`、`PagesRecord`、`PagesGenerationRecord`、`PagesInputSnapshot` | 同名意思的 `InboxPagesDocument`、`InboxPagesGeneration`、`InboxPagesInputSnapshot` 与提供方 id 写在 Inbox 自己的 `pages-shapes.ts`；宿主把 Pages 的动作结果交给 Inbox 的端口，结构上是它的超集 |
| `server/tooling/continuity-demo.mts` | 取三个 Pages 常量 | 文件顶部就地写这三个 id，注明来自 Pages 的 Manifest |

不改：动作 id、版本、权限、schema，引导与 Inbox 的运行行为。

## 4. 还没挪的，以及为什么

| 合同 | 为什么不在这一片 |
| --- | --- |
| `shelf` | 已做，见 [bl618-shelf-contract.md](bl618-shelf-contract.md)：合同的主人改成 `modules/shelf`；Images 就地声明自己用到的那一部分、按动作 id 调用，不 import |
| `feed` | 归 FI-5/FI-6（`slices/feed-inbox-runtime.md`，ac-sandbox-sched）：宿主 4 个文件、`modules/feed`、两个官方集成都在用，Feed 迁 Runtime 时一起挪 |
| `characters`（含 `characters-errors`、`character-import`） | `modules/characters`、宿主 9 个文件、Coding、`horizontal` 在用：它是平台的 Character 名词，不是某个插件独有的事实，留在平台（统筹 2026-10-26 定） |
| `goals` 与 `goal-*` | 随 Goals 上 Runtime（S11，PR #1295，ac-sc3 线）；使用方有 `modules/goals`（42 个文件）、宿主（11）、工作台（4）、MCP、CLI、测试套件 |
| `alchemist` | 不迁（用户 10-21，BL-376） |

## 5. 验收

| 编号 | 可观察结果与证明 |
| --- | --- |
| RAC-820 | 四个插件各自的 `./contract` 导出原来的运行时常量，值不变（`tests/plugin-contract-ownership.test.ts`）；原有业务测试继续用迁后的类型并保持原断言 |
| RAC-821 | 平台的 `modules/form`、`lingguang`、`ppt`、`dataset` 四个子路径不能再导入（`ERR_PACKAGE_PATH_NOT_EXPORTED`）；`pnpm api:update` 只删这四份快照；`pnpm actions:update` 无差异；`pnpm boundary:check`、`check-health-gates --base` 通过，插件包名被点名的文件数没涨 |
| RAC-822 | 引导送给 Todo 整理的分段大小等于 Todo 整理读每份材料的字数（`tests/context-onboarding-todo.test.ts`）；引导的两个整理、存文档测试照旧通过，提供方仍精确钉随宿主发布的 Todo、Pages |
| RAC-823 | Todo、Pages 各自的 `./contract` 导出原来的运行时常量，值不变 |
| RAC-824 | 平台的 `modules/todo`、`modules/pages` 子路径不能再导入 |
| RAC-825 | 引导、Inbox、演示脚本的源码里不出现 Todo、Pages 的包名与合同路径 |
