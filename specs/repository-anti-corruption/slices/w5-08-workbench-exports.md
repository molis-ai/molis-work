# W5-08 工作台入口不再转出插件实现（PG-064，ac-shell）

T-382 路径更新：本文历史记录中的 `artifact-native-plugin-http.ts` 现为平台成果库路由 `apps/local-host/src/artifact-library-http.ts`；已移出 `NATIVE_PLUGIN_HTTP_FILES`。历史证据与当时裁定保留。

状态：T118 文档候选，2026-11-01，按冻结 T403 `8b04d7385bb71015d15ccb6481eaf4d368149591`（tree `ce8cb28df9e8d7295962b1e01fa6b6a703e4dd34`，含 PR2 `2ca72c337`）更新现行说明；父与本单均待实际采用。该冻结点的 T403 六项 P1、最终验收、资源结算与 CI/Full 仍未收口，三新增资源的具体批准不替代这些结果。本单只改文档，不改合同、SDK、动作或产品行为。

验收编号：RAC-710～719。BL：BL-635（工作台入口里没人用的导出，§3）。

## 1. 历史基线（2026-10-25 本分支头）

原实施分支为 `claude/ac-shell-w508`，叠在 `claude/ac-shell-rest` 上，#1296 的头为 `58e877b21`。以下保留当时的名字、计数、使用者和裁定，不作为当前入口清单；冻结候选的去向见 §1.1、§3。

`apps/workbench/src/index.ts` 是工作台的公开入口，宿主与测试都从它取名字。入口里有三类不该有的东西：

| 类 | 现状 | 谁在用 |
| --- | --- | --- |
| ① 插件实现的转出 | 入口 `export { … } from "@molis-ai/molis-work-plugin-goals"`（39 个名字）、`"…-plugin-artifacts"`（`isProjectReference`、`ArtifactBrowserUiModel`），再加经 `browser-assets.js` 转出的两个 Goals 名字（`PROJECT_RULES_CLIENT_SCRIPT`、`PROJECT_RULES_SETTINGS_STYLES`）。这些名字在各插件自己的公开入口里本来就有 | 宿主 1 处：`apps/local-host/src/web-home-plugin-recovery.ts` 取 `resolveGoalsPageRoute`；测试 4 个文件：`tests/workbench-renderer-fixture.ts`（再转给 `web.test.ts` 等用夹具的文件）、`goals-planning-ui`、`goals-policy-ui`、`artifact-reference-ui`。其余名字没人从入口取 |
| ② `export *` | `export * from "./i18n.js"`、`export * from "./ui-composition.js"`、`export type * from "./capsule-view.js"`：新增的 helper 自动变成公开面 | i18n 的 5 个名字（宿主 `web-locale.ts` 与多个测试）、ui-composition 的 14 个（宿主 2 个，其余是测试）；`capsule-view` 的 6 个类型没有人在源码里 import，但宿主 `createLocalHostCapsule`、`createLocalWebComposition` 推断出的类型要点名它们（不点名，宿主的声明文件生成报 TS2742） |
| ③ 宿主从工作台取成果类型 | `plugin-catalog.ts` 的 `artifactTypeDeclarations`、`artifactContinuers`、`artifactReferrerActions`、`declaredArtifactTypes`、`HOST_ARTIFACT_PRODUCERS`、`ArtifactTypeDeclaration`，宿主 6 个文件在用（含 `goals-actions.ts:4`，即 privileges 行里那一处） | **不在本片**：这六个名字读的是内置目录；A3 已合入（#1294，随 batch-39 #1307），改成「从全部有效安装的 Manifest 派生」，直接换掉。`tests/registry-host-imports.test.ts` 的 `ARTIFACT_FIVE` 已经把它们钉成「只许减少」，不在这里为它们另造一处再被 A3 推翻 |

宿主已有自己的登记（`plugin-registry.generated.ts` 的 `PLATFORM_PLUGIN_REGISTRATIONS`，W5-02 PR-B），所以 ① 不需要新机制：名字改从插件的公开入口取。

### 1.1 冻结候选的当前边界

`apps/workbench/src/index.ts` 不再转出插件实现或使用星号转出；十个 Goals renderer adapter 与 Capsule 六个类型已经移出工作台入口。`page-view.ts` 从 Goals 的公开 `/contract` 取 `BoardSnapshot`、`GoalPolicyHistoryRecord`，Inbox 判断类型取 owner 的 `InboxStageData["judgment"]`，不再保留原 Feed/Schedule 三页私有取型的待办。合法公共事实类型和平台模型仍可使用，不要求插件包名归零。

无文本 importer 但为宿主声明生成必须点名的入口类型只剩 `ChooserArrival`、`ProjectSettingsFoldId`、`SideViewDocumentInput` 三个，理由由 `tests/workbench-entry-exports.test.ts` 的 RAC-1115 保留。平台成果绘制 `artifactWorkbench`、工作台自己的目录及具名平台端口继续保留；具体去向见 §3。这里是源码与文档对齐，不把父测试、真实界面或采用状态签成通过。

## 2. 原片做法与验收（保留历史范围）

1. 入口删掉对 `@molis-ai/molis-work-plugin-*` 的全部转出（含 `PROJECT_RULES_*` 两个）。宿主的 1 处、测试的 5 处改从插件包入口取同一个名字。**不动**工作台自己内部对插件包的 import（那是工作台画界面要用的，不是转出）。
2. 三条 `export *` 改成具名：`i18n` 的 5 个、`ui-composition` 里有消费者的 14 个、`capsule-view` 的 6 个类型（宿主推断出的类型要点名它们）。没人用的 6 个 ui-composition 名字（`renderWorkbenchContribution` 等）只从入口去掉，模块里仍被工作台自己用。
3. 一个门禁式的测试，防它们回来。

| 编号 | 验收 | 证明 |
| --- | --- | --- |
| RAC-710 | 工作台入口不转出任何 `@molis-ai/molis-work-plugin-*` 包的名字：源码里没有指向这些包的 `export … from`，也没有经 `browser-assets` 转出的插件名字；运行时入口命名空间里没有原来那 43 个名字 | `tests/workbench-entry-exports.test.ts`（AST 扫 `index.ts`，加一次包入口的运行时枚举） |
| RAC-711 | 入口没有 `export *`（含 `export type *`、`export * as`）；`i18n`、`ui-composition` 转出的名字就是 §2 列的具名清单，新增的 helper 不会自动变成公开面 | 同上 |
| RAC-712 | 宿主与测试原来从入口取的那些名字，改从插件的公开入口取，行为不变：`web-home-plugin-recovery.ts` 的页面判断、`tests/goals-planning-ui`、`goals-policy-ui`、`artifact-reference-ui` 与用夹具的非浏览器文件仍通过 | 这几个非浏览器文件（整机测试槽，`--jobs 1`） |
| RAC-713 | 留给别线的几项在这页 §3 与 BL 里有主人，不为变绿删：A3 的成果类型六个名字仍由 `registry-host-imports.test.ts` 钉着（本片不改它） | 该测试仍过 |
| RAC-714 | 门禁数字不增：`check-health-gates --base origin/main`、`pnpm boundary:check`、API 快照不变（工作台入口不在 `tooling/gates/api/`） | 门禁命令 |

RAC-715～719 留给实现里发现的。

## 3. 现行去向与保留边界

- **成果类型六个名字（`artifactTypeDeclarations` 等）**：原 A3（#1294，随 batch-39 #1307）改为从有效安装的 Manifest 派生；冻结候选入口已不转出它们，原 A3 的证据与执行来源保留，不再列为等待 A3 的本片删除项。
- **`artifactWorkbench`**：是工作台自己 `artifact-ui.ts` / `artifacts/` 的平台成果绘制，`apps/workbench/src/ui-composition.ts` 创建并具名导出，平台路由 `apps/local-host/src/artifact-library-http.ts` 仍实际调用 `goalContext` 与 `fragments`。它不是插件实现转出，不因旧 A6/BL-580 的计划删除。
- **十个 `createWorkbenchGoals*Renderer` 与 Capsule 六类型**：已随 owner 迁移从工作台入口移出；Capsule 展示投影归 Goals，不继续写成“等 S11 删除”。`tests/workbench-entry-exports.test.ts` 保留对应出口约束，不在文档收尾里重搬业务。
- **`BUILTIN_PLUGIN_CATALOG`（`scripts/gates/action-contract-host.mjs` 一个脚本在取）**：是工作台自己的目录，不是转出；留。
- **没人从入口取的导出**：BL-635 在 2026-10-27 的重扫为历史基线：211 个名字中 53 个无包外入口使用者，删去 44 个，当时保留 Goals 一组 6 个和声明生成所需类型。该计数不冒充当前重测。冻结候选的无 importer 例外只剩 §1.1 的三个声明必需类型，RAC-1115 继续拒绝没有使用者又无理由的导出；不为凑零删除合法平台绘制或事实合同。
