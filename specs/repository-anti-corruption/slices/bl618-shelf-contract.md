# BL-618：Shelf 的合同归 Shelf 的模块，Images 按动作 id 调用

状态：工程验证中（2026-10-26，防腐线 ac-platform，分支 `ac-platform/bl618-shelf-contract`，叠在 `origin/batch/1025-41` 上，未开 PR）。做法同 [PG-095 的 Images/Jelly 一片](pg095-images-jelly-contracts.md) 与 [PG-111 的叶子插件合同](pg111-leaf-plugin-contracts.md)；统筹 10-24 定主人是 `modules/shelf`、Images 改成按动作 id 调用（BL-618）。

## 1. 为什么

`packages/contracts/src/modules/shelf.ts`（366 行）是 Shelf 的记录类型、端口和 `shelf.items.admit` 的动作定义 `SHELF_ADMIT_ACTION`，平台没有任何地方在用它：使用方只有 Shelf 的模块（`modules/shelf`）、Shelf 插件、Images 和五个测试。Images 为了把图片放进 Shelf，import 了 Shelf 的定义，等于点名了另一个插件的合同（与「插件不 import 另一个插件的实现；跨模块只走公开 Contract」相反）。

## 2. 做什么

- `git mv` 成 `modules/shelf/src/contract.ts`，模块包加 `./contract` 出口，平台 `packages/contracts/package.json` 删 `./modules/shelf`，删 `tooling/gates/api/contracts/modules/shelf.txt`。包登记（`scripts/workspace-packages.mjs`、模块的 `package.json` 与 `packageDescriptor`）里的合同入口改成 `@molis-ai/molis-work-module-shelf/contract`。
- 文件里对平台类型的相对导入改成公开子路径（`services/agent-host`、`modules/artifacts`、`services/materials`、`platform/actions`、`platform/plugin`）。没有使用方的 `modulesShelfContract` 描述符（平台包登记用的）不带走。其余逐字不变：类型、`SHELF_ADMIT_ACTION` 的 id（`shelf.items.admit`）、版本 2、权限、输入输出 schema。
- 模块内部的引用改成 `./contract.js`；Shelf 插件（20 个文件）与测试（5 个）改经 `@molis-ai/molis-work-module-shelf/contract`（Shelf 插件对 `modules/shelf` 是在册的层间例外，不新增例外）。
- **Images 不再 import Shelf 的任何东西**：`plugins/native/images/src/shelf-admit.ts` 的 `IMAGES_SHELF_ADMIT` 是 Images 就地写的、它用到的那一部分：`shelf.items.admit`、版本 2、`command`、`scope: "home"`、动作向调用者要的三项权限（Images 的 Manifest 里照旧是可选权限，理由「将选中的图片保存到 Shelf」，现在取自这份声明）、它发的三个输入字段（文件名、类型、Base64 内容）。路由 `images.images.shelf` 照旧用 `bindPluginActionRoute` 调它。宿主按 id 与版本在目录里找提供方、按 Shelf 登记的定义校验输入，从不读这份声明的 schema；读它的只有 `capability_id`、`version`、`operation`（命令要记「已检查」）和 `action.permissions`（授权），所以不必也不抄 Shelf 的全部定义。Manifest 的 `capabilities.consumes` 本来就写着 `shelf.items.admit`。

不改 SDK 与宿主：插件对别的插件的调用，宿主的客户端要拿到一份定义（上面四项）才能判命令和授权；只给引用会丢掉 `operation`，所以这一片不放宽 `bindPluginActionRoute`。

## 3. 防漂移

Images 就地写的那一份可能与 Shelf 的定义漂开：改了 Shelf 的权限，Images 的调用就被拒；改了版本，目录里找不到提供方。RAC-854 逐项对：id、版本、`operation`、范围、调度、权限（逐项相同）、Images 发的每个字段 Shelf 的输入也有同类型的同名字段，Manifest 里为 Shelf 问人的权限正好是这几项且都可选、`consumes` 含该 id；已有的端到端用例（`tests/images-plugin.test.ts` 的 W5-01-IMGPORT-02：真实宿主里 Images 把图片放进真实的 Shelf）证明调用本身通。

## 4. 验收

| 编号 | 内容 |
| --- | --- |
| RAC-852 | Shelf 的模块公开自己的合同：`SHELF_ADMIT_ACTION` 是 `shelf.items.admit` 的第 2 版，三项权限；这份文件里唯一的值是这个定义，其余都是类型 |
| RAC-853 | 平台的 contracts 不再导出 `modules/shelf`（`ERR_PACKAGE_PATH_NOT_EXPORTED`） |
| RAC-854 | Images 就地写的 Shelf 动作声明与 Shelf 的定义一致（id、版本、命令、范围、调度、权限、发出的字段）；Manifest 为它问人的权限与定义逐项相同且都是可选的，`consumes` 含 `shelf.items.admit` |
| RAC-855 | Images 的源码和 `package.json` 里没有 Shelf 的包、合同或 `SHELF_ADMIT_ACTION` |

不改：动作 id、版本、权限、输入输出 schema、存储、Manifest 的声明内容。`pnpm actions:update` 应当没有差异；`pnpm api:update` 只有 contracts 少一个子路径；SDK 的快照不变。

## 5. 对调用方的影响

- 插件作者：没有 SDK 变化。要调别的插件的动作，照 Images 的写法就地声明用到的那一部分（`IMAGES_SHELF_ADMIT`），不 import 对方的合同。
- 平台合同：`@molis-ai/molis-work-contracts/modules/shelf` 删除；不留转发（`docs/system/CONTRACT-CHANGES.md`：现在不留兼容期）。仓库内只有上面列出的使用方，全部已改。

## 6. 不在本片

Alchemist 的合同不迁（BL-376）。PG-111 剩下的 Feed（FI-5/FI-6）、Goals（S11）、Characters（平台名词，留在平台）不动。
