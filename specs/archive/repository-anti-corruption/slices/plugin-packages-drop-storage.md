# 插件包不再依赖 storage、不再自己按路径开库（PG-023）

状态：已做（2026-10-25，防腐线 ac-platform，分支 `ac-platform/group5-home-services`）。Todo、Form、灵光、Dataset、PPT、Workflows、Jelly、Cognia、Pages 九个包做了；Images 不在这里（§3），Alchemist 不迁。验收号 RAC-746、RAC-747。

## 1. 重核结果

11 个插件包的 `package.json` 依赖私有的 `@molis-ai/molis-work-storage`（Alchemist 不迁，其余十个）。逐个核对它们用 storage 做什么：

| 包 | 用法 | 生产里有人调吗 |
| --- | --- | --- |
| Todo、Form、灵光、Dataset、PPT | `store.ts` 里的 `openXStore(home)`：`openBaselineHomeSqlite` 开 Home 里的库文件，再包成 `XStore`；加 `*_HOME_STORE` 的类型 `HomeStoreDeclaration` | 没有。运行中的插件拿 Runtime 给的 `services.database`（`ownXStores`）。只有测试在用，Form 的注释写着「删项目时用」，现在也没有这条路 |
| Pages | 单独的 `testing` 出口（`./testing`，边界规则 `plugin-testing-entry-import` 拦生产代码引用） | 没有，只有测试（59 个文件） |
| Workflows、Jelly、Cognia | `openHomeSqliteDatabase` + `applySqliteBaseline` 开自己的库 | 没有；`ownJellyStores`、`ownWorkflowsStores` 没有调用方，生产走宿主的库 |
| Images | `clearInExistingHomeSqlite`：删项目时按路径清自己的作业行 | **有**，是生产路径（PG-026 的一部分，删项目的清理归平台）。2026-10-26 核：batch-41 的 PG-024 已让平台按 `project_rows` 删，Images 包里已经没有这个调用 |

所以做法是：把「按路径开库」整个搬出插件包，放到测试夹具里。Pages 的 `./testing` 出口（`openPagesStore`）是同一件事，只是多一个导出子路径。Workflows、Jelly、Cognia 开库的写法略不同（先开库、再套基线，Jelly 开完还要 `initialize`），夹具里照原样写一份。

## 2. 做什么

- 九个包删掉 `openXStore`（Pages 删的是 `src/testing.ts` 与 `package.json` 的 `./testing` 出口）与它的私有 `immediate`，`store.ts` 的 `HomeStoreDeclaration` 改从合同取（`@molis-ai/molis-work-contracts/platform/plugin`，storage 的那个本来就是它的转出），`package.json` 去掉对 storage 的依赖，锁文件同步。
- 测试夹具 `tests/fixtures/plugin-home-stores.ts` 提供同名同签名的 `openTodoStore`、`openFormStore`、`openLingguangStore`、`openDatasetStore`、`openPptStore`、`openJellyStore`、`openCogniaStore`、`openWorkflowsStore`、`openPagesStore`：用 storage 的 `openBaselineHomeSqlite` 按插件自己导出的 `XXX_DATABASE` 基线开库，再 `new XStore(...)`。夹具在所有插件包之外，所以 storage 只出现在测试里。
- 126 个测试文件的导入从插件包改到夹具，用例本身不变。

不改：插件的动作、Manifest、`ownXStores`（运行中的插件用的那条）、库文件的位置和基线。

## 3. 这一片不做

- **Images**：`clearInExistingHomeSqlite` 是生产里删项目的路径，不是测试夹具，要由平台替它清（PG-026），不在这里动。
- **Alchemist**：不迁（用户 2026-10-21、2026-10-23）。

## 4. 验收

| 号 | 内容 | 证明 |
| --- | --- | --- |
| RAC-746 | 九个包的 `package.json` 没有 `@molis-ai/molis-work-storage`、没有 `./testing` 出口，源码不 import 它，也不导出 `openXStore` | `tests/plugin-storage-dependency.test.ts` |
| RAC-747 | 同一批原有用例在夹具上全部通过（行为不变） | 原有测试文件（非浏览器的已在开发机跑过，浏览器的交 CI） |
