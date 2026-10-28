# W5-08 工作台入口不再转出插件实现（PG-064，ac-shell）

状态：草稿，2026-10-25，在 `claude/ac-shell-w508`（叠在 `claude/ac-shell-rest` 上，#1296 的头 `58e877b21`）。不改合同、不改 SDK、不改动作，直接做；留给别线的几项写在 §3。

验收编号：RAC-710～719。BL：BL-635（工作台入口里没人用的导出，§3）。

## 1. 现状（按 2026-10-25 本分支头重核，`privileges.md` PG-064 写的行号已过时）

`apps/workbench/src/index.ts` 是工作台的公开入口，宿主与测试都从它取名字。入口里有三类不该有的东西：

| 类 | 现状 | 谁在用 |
| --- | --- | --- |
| ① 插件实现的转出 | 入口 `export { … } from "@molis-ai/molis-work-plugin-goals"`（39 个名字）、`"…-plugin-artifacts"`（`isProjectReference`、`ArtifactBrowserUiModel`），再加经 `browser-assets.js` 转出的两个 Goals 名字（`PROJECT_RULES_CLIENT_SCRIPT`、`PROJECT_RULES_SETTINGS_STYLES`）。这些名字在各插件自己的公开入口里本来就有 | 宿主 1 处：`apps/local-host/src/web-home-plugin-recovery.ts` 取 `resolveGoalsPageRoute`；测试 4 个文件：`tests/workbench-renderer-fixture.ts`（再转给 `web.test.ts` 等用夹具的文件）、`goals-planning-ui`、`goals-policy-ui`、`artifact-reference-ui`。其余名字没人从入口取 |
| ② `export *` | `export * from "./i18n.js"`、`export * from "./ui-composition.js"`、`export type * from "./capsule-view.js"`：新增的 helper 自动变成公开面 | i18n 的 5 个名字（宿主 `web-locale.ts` 与多个测试）、ui-composition 的 14 个（宿主 2 个，其余是测试）；`capsule-view` 的 6 个类型没有人在源码里 import，但宿主 `createLocalHostCapsule`、`createLocalWebComposition` 推断出的类型要点名它们（不点名，宿主的声明文件生成报 TS2742） |
| ③ 宿主从工作台取成果类型 | `plugin-catalog.ts` 的 `artifactTypeDeclarations`、`artifactContinuers`、`artifactReferrerActions`、`declaredArtifactTypes`、`HOST_ARTIFACT_PRODUCERS`、`ArtifactTypeDeclaration`，宿主 6 个文件在用（含 `goals-actions.ts:4`，即 privileges 行里那一处） | **不在本片**：这六个名字读的是内置目录；A3 已合入（#1294，随 batch-39 #1307），改成「从全部有效安装的 Manifest 派生」，直接换掉。`tests/registry-host-imports.test.ts` 的 `ARTIFACT_FIVE` 已经把它们钉成「只许减少」，不在这里为它们另造一处再被 A3 推翻 |

宿主已有自己的登记（`plugin-registry.generated.ts` 的 `PLATFORM_PLUGIN_REGISTRATIONS`，W5-02 PR-B），所以 ① 不需要新机制：名字改从插件的公开入口取。

## 2. 做法与验收

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

## 3. 留给别线的，和在等哪一族

- **成果类型六个名字（`artifactTypeDeclarations` 等）**：A3 已合入（#1294，随 batch-39 #1307）：从有效安装的 Manifest 派生后删。本片不碰，`registry-host-imports.test.ts` 的 `ARTIFACT_FIVE` 继续钉着。
- **`artifactWorkbench`（`ui-composition.ts`，宿主 `artifact-native-plugin-http.ts` 与 `tests/artifact-browser.test.ts` 在用）**：成果库界面经工作台转给宿主，等 A6（BL-580）把「成果」入口做成平台工作台面、经通用挂载器挂上之后删。仍作为具名导出留在入口。
- **十个 `createWorkbenchGoals*Renderer`（`ui-composition.ts`，只有测试在用）**：Goals 的界面适配，等 Goals S11 把 Goals 界面迁出工作台的组合里后删；仍作为具名导出留在入口。
- **`BUILTIN_PLUGIN_CATALOG`（`scripts/gates/action-contract-host.mjs` 一个脚本在取）**：是工作台自己的目录，不是转出；留。
- **没人从入口取的导出**：本片只收 ①②；收窄另做（BL-635，2026-10-27 已做）。当天重扫 main、C 分支与在途 PR：入口 211 个名字里 53 个在工作台包之外没有从入口取的人（静态、动态、命名空间导入和 `import()` 类型都算），删去其中 44 个，模块里的定义不动；留下的是 Goals 一组 6 个（等 Goals S11），和宿主声明文件要点名的 3 个类型（`ChooserArrival`、`ProjectSettingsFoldId`、`SideViewDocumentInput`，删了宿主构建报 TS2742）。`tests/workbench-entry-exports.test.ts` 的 RAC-1115 扫一遍入口的取用者，没有取用者又没写明理由的名字直接失败：现在写明的是 Goals 一组 6 个，和宿主声明文件要点名、却不 import 的 9 个类型（`capsule-view` 6 个和上面 3 个）。
