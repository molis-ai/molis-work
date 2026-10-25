# PG-111 第一批：只有自己用的合同归各自插件（Form、灵光、PPT、Dataset）

状态：工程验证中（2026-10-25，防腐线 ac-platform，分支 `ac-platform/group6-contracts`）。做法同 [PG-095 的 Images/Jelly 一片](pg095-images-jelly-contracts.md)；本片只做「除本插件和它的测试之外没有任何使用方」的四份，其余五类见 §3。验收号 RAC-820、RAC-821。

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

## 3. 还没挪的，以及为什么

| 合同 | 为什么不在这一片 |
| --- | --- |
| `todo`、`pages` | 宿主的 `context-onboarding-service.ts`（和 `-store.ts`）用 `TODO_PLUGIN_ID`、`TODO_ORGANIZE_MATERIAL_CHARS`、`TodoBatch`、`PAGES_PLUGIN_ID`、`PagesBody`；Inbox 用 Pages 的两个记录类型，`server/tooling/continuity-demo.mts` 用 Pages 的 Artifact 常量。挪走就得让这些文件点名插件包，装配门禁只许这类文件变少。要先定这些使用方怎么拿到形状（BL-629） |
| `shelf` | BL-618：合同的主人改成 `modules/shelf`；Images 的 `SHELF_ADMIT_ACTION` 既当权限清单又交给 `bindPluginActionRoute`，要改成按动作 id 调用，是 Images 路由和 SDK 路由绑定的改动 |
| `feed` | 归 FI-5/FI-6（`slices/feed-inbox-runtime.md`，ac-sandbox-sched）：宿主 4 个文件、`modules/feed`、两个官方集成都在用，Feed 迁 Runtime 时一起挪 |
| `characters`（含 `characters-errors`、`character-import`） | `modules/characters`、宿主 9 个文件、Coding、`horizontal` 在用：它是平台的 Character 名词，不是某个插件独有的事实，先要定它的主人 |
| `goals` 与 `goal-*` | 随 Goals 上 Runtime（S11，PR #1295，ac-sc3 线）；使用方有 `modules/goals`（42 个文件）、宿主（11）、工作台（4）、MCP、CLI、测试套件 |
| `alchemist` | 不迁（用户 10-21，BL-376） |

## 4. 验收

| 编号 | 可观察结果与证明 |
| --- | --- |
| RAC-820 | 四个插件各自的 `./contract` 导出原来的运行时常量，值不变（`tests/plugin-contract-ownership.test.ts`）；原有业务测试继续用迁后的类型并保持原断言 |
| RAC-821 | 平台的 `modules/form`、`lingguang`、`ppt`、`dataset` 四个子路径不能再导入（`ERR_PACKAGE_PATH_NOT_EXPORTED`）；`pnpm api:update` 只删这四份快照；`pnpm actions:update` 无差异；`pnpm boundary:check`、`check-health-gates --base` 通过，插件包名被点名的文件数没涨 |
