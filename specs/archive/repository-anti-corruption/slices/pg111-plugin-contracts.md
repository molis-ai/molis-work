# PG-111 余项：Coding、Shelf 合同归各自主人

状态：工程验证通过，待统筹合入（2026-10-25）。分支 `claude/pg111-plugin-contracts`，基线 main `2b3dc51de`，不开 PR（统筹按批落地）。号段 RAC-870～889、BL-685～689；本片用 RAC-870～873，BL 号未用。

## 范围

PG-111 要求插件的合同不放在平台的 `packages/contracts`。batch-41 已删 form、lingguang、ppt、dataset、todo、pages 六个子路径（本分支基于 main，没有这些改动，也不碰它们）。本片逐个核对 `./modules/*` 里剩下的子路径，按 `docs/SSOT-MATRIX.md` 分「插件的事实」与「平台的事实」，只挪前者；同时做 PG-095 的 Shelf 一半（BL-618）。

## 子路径分类

| 子路径 | 事实的主人（SSOT） | 处理 | 理由 |
| --- | --- | --- | --- |
| `coding` | Coding 插件 | **挪**到 `plugins/native/coding/src/contract.ts`，公开 `./contract` | 只有 `coding.results.document@1` 一个动作，主人是 Coding；使用方是 Shelf |
| `shelf` | Shelf 模块（`modules/shelf`） | **挪**到 `modules/shelf/src/contract.ts`，公开 `./contract` | Shelf 的记录、材料端口、`shelf.items.admit@2` 都是 Shelf 的事实；使用方是 Images 与 Shelf 插件 |
| `characters`（含 `character-import`、`characters-errors`） | Characters 宿主模块（CHR-0/1） | 留 | 平台的事实，不是插件的 |
| `projects`、`artifacts`、`signals`、`sources` | 平台模块 | 留 | 项目目录、成果库、信号、来源是平台的事实 |
| `attention-resumption`、`context-ledger`、`private-work-context`、`model-providers` | 平台模块 | 留 | 平台的服务与账本 |
| `functions` | 系统能力服务 | 留 | 平台能力，不属于某个插件 |
| `workspace-artifacts`、`workspace-action-schemas`、`workspace-writers`、`workspace-text-diff` | 平台的工作区服务 | 留 | Coding、Files、Git 等多个插件共用的平台服务，不是任何一个插件私有 |
| `feed` | Feed | 不动 | 归 Feed 迁 Runtime 一线（FI） |
| `goals`、`goal-actions`、`governance-collaboration` | Goals | 不动 | 归 Goals S11 一线（#1295） |
| `alchemist` | Alchemist | 不动 | 防腐收尾后删除再重做（BL-376） |

## 做法

- Coding：`coding.ts` 原样移到 Coding 插件包，包公开 `./contract`，Coding 自己的 Manifest 与处理器改从 `./contract.js` 取；`packages/contracts` 不留转发。
- Shelf：`shelf.ts` 原样移到 `modules/shelf`，包公开 `./contract`，模块与 Shelf 插件改从它取；`packages/contracts` 不留转发。模块包登记的 `contract` 字段改指通用的 `platform/package`（contracts 里没有 Shelf 子路径了）。
- 跨插件的使用方不再 import 提供方的合同，按动作 id 调用：Shelf 在 `coding-result.ts` 留一个按 id 发问的视图，Images 在 `shelf-admit.ts` 留一个。视图只写发问所需（id、版本、权限、输入形状）；真正执行时宿主按提供方的定义校验输入、输出与权限，两个 Manifest 的 `capabilities.consumes` 仍只写 id。
- 为什么用视图而不是引用：Coding 的动作只对 plugin 受众开放，`invokeQuery` 沿用调用者的受众会被拒；Images 的保存是命令，`invokeQuery` 只能查询；`dependencies.invoke` 要 `actions:invoke`，权限过宽。所以仍走 `services.actions.invoke`，由消费方自备定义。
- 动作的 id、版本、权限、输入输出 schema 不变。

## 验收

| 编号 | 可观察结果与证明 |
| --- | --- |
| RAC-870 | Coding 合同由插件 `./contract` 导出，Manifest 声明的就是这个对象；`tests/plugin-contract-ownership.test.ts` 钉住 |
| RAC-871 | Shelf 合同由 `modules/shelf` 的 `./contract` 导出；同一测试钉住 `shelf.items.admit@2` |
| RAC-872 | 平台的 `modules/coding`、`modules/shelf` 旧子路径不能导入，断言拒绝；`pnpm api:update` 只移除这两个快照 |
| RAC-873 | Shelf 与 Images 在 Manifest 里只按 id 消费对方的动作，源码不 import 提供方（Shelf 不引 Coding 包，Images 不引 Shelf 的模块与插件）；`pnpm actions:update` 对 `tooling/gates/actions/` 无差异，Coding→Shelf、Images→Shelf 的现有业务测试保留原断言 |

## 验证结果

见提交说明与统筹回报。
