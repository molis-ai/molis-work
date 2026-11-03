# BL-385：删除项目时清 Characters 的原生执行记录（R-17）

状态：已实现（2026-10-24，迁移线 ac-sc3 片）；代码按 main `27bb3c212` 核过。

## 1. 目标

Sessions 收尾 SC-2（#1080）起，Characters 自己记原生执行：表 `character_runs` 在 `characters/characters.sqlite`（版本 2），每行带 `project_id`。可 Characters 没有在删除项目的 owner 声明里登记自己的数据，删掉项目后，这个项目的执行记录一直留着（风险登记 R-17）。SC-2 之前这些记录在会话库里也不清，因为会话没有 `project_id`。

## 2. 范围

- 加：`modules/characters/src/project-data.ts`：`purgeCharactersProject(home, projectId)` 删该项目在 `character_runs` 里的全部行，不分谁启动的；`charactersProjectData`（确认框标签「角色在这个项目里的执行记录」、`order: 110`）。从包入口导出。
- 改：`apps/local-host/src/project-deleted-owners.ts` 登记 `characters` 这个 owner（Characters 不是插件，与 Functions 一样由宿主按名登记；收据里的 owner id 是 `characters`）。英文标签进 `apps/workbench/src/i18n/flow-en.ts`。
- 不改：草稿（`character_drafts`）不属于任何项目，不清。不改库结构、动作、合同、公开 API。
- 库文件是 `characters.sqlite`，不是 `homeSqlitePath` 的 `<名>.db`，所以清理自己打开文件（同 `openStore` 的结构基线检查），不用 `clearInExistingHomeSqlite`。

## 3. 验收

- **RAC-254**：清一个项目后，该项目的 `character_runs` 行没了（两个人启动的都清），别的项目的行不变，草稿不变；再清一次什么也不找到。（`tests/characters-project-deletion.test.ts`）
- **RAC-255**：宿主的 owner 清单里有 `characters`，标签如上，按收据的 owner id 清得动；Home 里没有 Characters 库时什么也不建；库在别的版本时带原错误拒绝、一个字节不写。（同上；`tests/project-deletion-declarations.test.ts` 钉住 owner 的顺序与标签）

## 4. 对调用方的影响

删除项目的确认框多一行「角色在这个项目里的执行记录」，收据多一步 `characters`。没有动作、合同或 API 快照变化。尚未装 SC-2 的 Home 没有这张表，也没有这个库的版本 2：该库仍是版本 1 时，删除项目会因版本拒绝而卡在这一步，与别的 owner 一致，先按 `docs/releases/CHECKLIST.md` 第 3 节做维护（R-04）。
