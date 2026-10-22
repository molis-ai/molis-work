# 系统清理：死代码、边界与重复实现

状态：需求已整理，尚未实现（2026-10-20）。本 spec 是 2026-10-20 审计后的执行需求；[审计报告](../../docs/reviews/cleanup-audit-2026-10-20.md)是输入与证据，不是合同。源码删除开始前必须先满足 §3 的先决条件；P0 卫生可以先做。本 spec 只描述“做什么、按什么顺序、怎样验收”，不包含删除本身。

## 1. 为什么

2026-10-20 的只读审计给出了三类可清理项：不再被引用的代码、过宽的包公开面、重复实现。它们分布在 72 个 workspace 包、约 2,300 个产品源文件里，而仓库同时有 23 个 open PR 和多个未开 PR 的活动分支在改同一批文件。此时按“死代码清单”直接删会与在途工作冲突，也会把正在迁移的接口类型当成死代码删掉。

这份 spec 要解决的是**执行顺序与边界**，不是再写一份审计：先在稳定基线上确认候选，再按包、按风险分批删除；被活动计划占用的候选保留；每一步都有可核对的门禁与测试。

## 2. 目标

1. 把死代码清理变成可分批、可回滚、每步有证据的工作，而不是一次大扫除。
2. 在删除前区分**真死代码**、**公开面过宽**和**被在途计划占用的候选**；后两类不按死代码处理。
3. 清理完成后，只减健康门禁的数字不增加，包边界与公开 API 不变差。
4. 给后续清理留下可重复的基线：谁在什么时候、基于哪个 commit、用什么命令量到了什么。

## 3. 先决条件

**源码删除**的第一个 PR 之前，必须同时满足：

1. **基线是最新主线。** 当前本地 `main` 落后 `origin/main`；执行前先 `git fetch origin`，以当时的 `origin/main` 为基线，重新记录 commit 与日期。2026-10-20 的参照是 `origin/main` `73ce89eb0`；本地 `c59172ffe` 只作审计快照。
2. **当前 PR 波次已经合入或关闭。** 截至 2026-10-20 有 23 个 open PR，覆盖视觉 UX、项目库/插件库、Runtime 迁移与授权。它们触碰的候选按 [审计报告 §11.3](../../docs/reviews/cleanup-audit-2026-10-20.md) 保留；不要在一个还在改同一文件的 PR 上叠加删除。
3. **重新量一次。** 在新的 main 上重跑审计脚本与 `node scripts/check-health-gates.mjs --base origin/main`，把死导出、仅文件内使用、公开面无消费者、入口走不到的文件重新分类。旧数字（本地 54 / 540 / 约 1,251；`origin/main` 55 / 556 / 约 1,266）只作对照，不作为执行清单。

P0 卫生不属于源码删除，可以现在做（见 §4.1）。本 spec 创建时（PR #889）又新增了一个 open PR；23 是审计时的快照，执行前重新数。

## 4. 范围

### 4.1 P0：工作树与仓库卫生

- 修复活文档的断链；当前唯一失败是 `specs/BACKLOG.md` 指向尚未纳入 Git 的 `docs/releases/APPLE-INDIVIDUAL-ACCOUNT.md`。与签名/公证工作的负责人确认后提交那组文档，或由用户决定先删 BACKLOG 链接。
- 给 `plugins/native/jelly/native/` 加忽略规则；它约 469 MB，是 Swift 构建产物，不是源码。
- `git worktree prune`，列出可删的 prunable 工作树，交给各会话确认后删除。
- 决定 `work/`、`.grok/`、`docs/design/folio-component-board/` 与未跟踪审计材料的去留；不要单方面删除其他会话的材料。

### 4.2 死代码

- 只删“不在任何包 `package.json` `exports` 公开面上、且定义文件之外没有任何引用”的导出；先按包分组，一个包一个 PR。
- 只在本文件使用的导出：按包去掉 `export` 关键字，不删定义；每包 `typecheck` 通过。
- 入口走不到的文件：先确认它不是 worker、vitest 配置、QA 脚本或构建入口；当前唯一明确可删的是 `server/src/auth.ts`（4 行兼容别名）。
- 未使用的 workspace 依赖：先确认发布打包不需要，再删；`apps/workbench → im-ui` 还可能被 context-program F12 重新需要。
- `web-query` 整包、`apps/server`、`packages/test-kit`、`packages/im-ui`、`server` 不是本轮死代码删除对象；删 `web-query` 属于包数量/SSOT/CODEOWNERS 的产品决定。

### 4.3 公开面收窄

- 目标不是删除定义，而是把包入口从 `export *` 改成显式导出，去掉没有生产消费者的公开导出。
- 先做 `apps/local-host` 与 `plugins/native/coding`，再按包；2026-10-20 的静态上限是 `origin/main` 约 1,266 个（去掉 `packageDescriptor` 约定后 1,151；再去掉 test-kit/apps-server 后 1,124）。
- 这一步排在功能 PR 之后：在途 PR 正在新增导出，先收窄会冲突。
- 每个包改动后跑该包的 `typecheck`、公共入口测试与 `pnpm boundary:check`；若改变 contracts/SDK 公开面，按 `docs/system/CONTRACT-CHANGES.md` 走 `pnpm api:update`。

### 4.4 重复实现

- 逐字重复优先：`canonicalize` 7 份、插件路由 `handle` 6 份、`ledgerDatabase` 2 份、`writeResponse` 2 份、`deletionRecord` 2 份、`reopenCompletion` 2 份、`resolveSourceFaults` 2 份、Alchemist 的 idea 映射 2 份。
- `canonicalize` 收进 Plugin SDK，作为共享的规范化 JSON 工具；SDK 是共享核心，按共享核心跑全量与 API 快照。
- 其余按“同一包内收成一份”优先；跨包抽到 SDK 或宿主共享文件时，先写清公开面与调用方。
- 小工具 `isRecord` 14 处、`parseJson` 11 处、`unique` 16 处、`nullableText` 12 处收益小，只在顺带改到相关文件时统一，不单开 PR。

## 5. 不该删的（本轮的 hold 清单）

以下候选**不按死代码删除**；完整理由、证据与“何时再删”见[审计报告 §11.3](../../docs/reviews/cleanup-audit-2026-10-20.md)。本 spec 把它作为执行约束：

- **正在被 PR/分支改的**：Alchemist 的 38 个导出与 `bootstrap.ts`/`job.ts`（W5-01 ALC-LIFE/ALC-RES）；`gmail/history-cursor.ts` 与 `GmailFixtureCursor`（W2-18-GMAIL）；Goals 的 4 个导出与 `GoalEventSystemOperation`（#881、#837）；`apps/local-host` 的 7 个（#867/#883/#881 与材料、Computer Use、Onboarding、Connector 分支）；`apps/workbench` 的 3 个与 `packages/design-system` 的组件校验（15 个视觉 UX PR）；Feed 的投影导出（#867）；MCP 的 `v1PayloadTool`（#881）。
- **公开面无消费者但属于活动线**：Jelly 的 `ownJellyStores`、plugin-builder 的 `parseBuilderJson`/`BUILDER_PROJECT_PLUGIN_ID`、RSS 的 3 个、design-system 的 `validatePluginComponentNodes`。
- **计划保留或重做的整块**：`web-query`、`apps/server`、`packages/test-kit`、`packages/im-ui`、`server`、Sessions（BL-177）、Characters（决定 26）、旧构建期插件装配（含生成的 catalog 条目；#853/#847/#840 迁移中）。
- **测试、工具与资产**：`tests/fixtures/artifact-browser.ts`、`scripts/preview-*.mts`/`studio-replay`、`.impeccable/`、`plugins/native/jelly/native/` 构建产物。
- **横切项**：4 个未使用依赖、公开面收窄、重复实现收口；它们都排在当前 PR 波次之后。
- **在途的 macOS 签名/公证文档与工具**：不属于本 spec。

hold 项如果要删，必须先有 owner 或对应 spec 的明确依据，并在 PR 里写明为什么不再是活动文件；不能只凭一次静态扫描。

## 6. 执行顺序

1. P0 卫生；不改产品源码。
2. 等当前 23 个 open PR 合入或关闭；在途期间不做源码删除。
3. 在新的 `origin/main` 上重跑审计与门禁，记录新基线。
4. 删除 `server/src/auth.ts`（单独 PR）。
5. 按包删除死导出与仅文件内使用的 `export`；每包一个 PR，跑 typecheck、相关用例和门禁。
6. 做公开面收窄（先 local-host、coding）。
7. 做重复实现收口（canonicalize 先做，SDK 全量）。
8. 每一步之后重新量数字；发现候选被在途工作使用，立即放回 hold 清单。

## 7. 验收标准

| 编号 | 可观察结果 |
| --- | --- |
| CLN-01 | 清理开始前记录了基线：`origin/main` commit、日期、审计命令、门禁命令，并把它写进 PR 描述或 spec 的进度节 |
| CLN-02 | 每个删除 PR 在开头列出候选文件与当时 open PR/活动分支的交集；有交集的不删，或先说明为什么可以安全删 |
| CLN-03 | P0 完成后 `node scripts/check-health-gates.mjs` 退出 0；活文档没有断链；`plugins/native/jelly/native/` 已被忽略；可清理的 worktree 已 prune |
| CLN-04 | `server/src/auth.ts` 被删除，且该 PR 不包含其他源码删除；`pnpm build` 与相关测试通过 |
| CLN-05 | 每个死导出删除 PR 有删除前后的导出计数、`pnpm --filter <包> run typecheck` 结果与相关用例；没有公开 API 快照变化，除非同一个 PR 明确说明并跑 `pnpm api:update` |
| CLN-06 | 仅文件内使用的导出按包去掉 `export` 后，该包 typecheck 与行为用例通过，公开面没有扩大 |
| CLN-07 | 4 个未使用依赖在删除前都经过 `pnpm package:npm` 或等价打包检查；删后安装/打包通过 |
| CLN-08 | 公开面收窄的 PR 只改入口导出，不删定义；目标包 typecheck、公共入口测试与 `pnpm boundary:check` 通过；目标包没有在途 PR 改同一入口 |
| CLN-09 | `canonicalize` 进入 SDK 时带单元测试与 API 快照更新；其余重复收口每项有行为不变的证据；SDK 变更按共享核心跑全量 |
| CLN-10 | hold 清单里的项没有被当作死代码删除；如果删除，PR 引用了 owner/spec 的依据，并同步更新审计报告或 spec 的 hold 清单 |
| CLN-11 | `web-query`/`apps/server`/`test-kit` 等整包决策不在死代码 PR 里做；若删除 `web-query`，同一个 PR 同步包清单、SSOT §5.1、CODEOWNERS、锁文件，并跑 `node scripts/gates/package-inventory.mjs --table` |
| CLN-12 | 每个批次结束跑 `node scripts/check-health-gates.mjs --base origin/main` 与 `pnpm boundary:check`；只减数字没有增长；下降的快查在同一个 PR 里 `--update` |
| CLN-13 | 在途 PR 波次合入后重新审计，旧数字（本地 54/540/约 1,251；origin/main 55/556/约 1,266）不再作为当前清单引用 |
| CLN-14 | 清理过程遵守并行开发规则：一次一个构建、不并发跑浏览器用例、不碰其他会话的未提交改动；全量回归期间不改源码 |

## 8. 测量与证据

每个批次至少在 PR 里写：

- 基线 commit 与日期；
- 删除/收窄前后的计数：死导出、仅文件内使用、公开面无消费者、入口走不到的文件；
- 跑过的命令与结果：`pnpm --filter <包> run typecheck`、相关测试文件、`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`；
- 如果动过 contracts/SDK：`pnpm api:update` 与 `pnpm test:contracts`；
- 如果动过动作/Manifest：`pnpm actions:update`；
- 如果动过宿主页面资源：`pnpm page-assets:check`。

审计报告与脚本的中间结果在 `.tmp/audit/`（已忽略，不入库）；仓库里只保留 spec、审计报告与每个 PR 的证据摘要。

## 9. 风险与回滚

- **在途冲突**：最大风险。用 CLN-02 的前置检查避免；如果删除后才发现同文件有在途 PR，先回滚该删除，等对方合入。
- **误删被计划使用的类型**：Alchemist、Gmail、Goals、local-host 的 hold 项都属此类；只按“今天没有 import”不足以删除。
- **公开面改坏**：只改入口、不删定义；逐包 typecheck 与公共入口测试；contracts/SDK 变更走 API 快照。
- **门禁数字**：只许下降；拆文件可能产生新的巨大单元，按 `docs/system/HUGE-CLASS-MIGRATION.md` 的规则先拆到阈值以下。
- **回滚**：每批一个 PR，删除与收窄分开；回滚用 `git revert`，不需要数据迁移，不碰真实 Home。

## 10. 不做

- 不做一次性大重构，不按审计清单全仓删。
- 不删除 hold 清单里的包、文件、导出或测试夹具，除非有 owner/计划依据并更新记录。
- 不放宽健康门禁、不跳过测试、不删断言来变绿。
- 不在全量回归期间改源码、不并发构建/浏览器用例，不碰其他会话的未提交改动。
- 不打开真实 Home，不运行发布、签名、公证或跨设备操作。
- 不改 `repository-anti-corruption` 的长期目标；本 spec 只做这一轮清理，遇到结构债按那边的迁移线走。

## 11. 交付

- 本 spec 与[审计报告](../../docs/reviews/cleanup-audit-2026-10-20.md)随本 PR 入库；本 PR 不含任何产品代码删除。
- 后续每个批次一个 PR：先 P0，再 `server/src/auth.ts`，再按包删死代码，再做公开面收窄与重复收口。
- 每个 PR 按 §8 写证据；完成后把本 spec 的状态句改成“实现中/完成”，并按 `specs/README.md` 的规则归档。
