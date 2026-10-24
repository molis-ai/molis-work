# BL-501：宿主调 Goals 的动作按目录找提供方

状态：已实现，本地分支 `ac-kernel/bl501-provider-by-capability`，未开 PR（2026-10-24，防腐线 ac-kernel 接 ac-platform 的片）；做的是 `privileges.md` PG-031 里 Goals 那一半（BL-501），代码按 main `f586496e4` 核过。

## 1. 要解决的

宿主替本机这个人调 Goals 的动作时，把提供方写死成 `GOALS_PLUGIN_ID`：

- `apps/local-host/src/goals-actions.ts` 的 `readProjectGuidance`（Run 与助理轮次读项目说明）；
- 同一文件的 `bindGoalsManagementActions`（命令行 `molis-work v1` 与管理 MCP 的管理调用者）。

插件同等待遇（2026-10-18）之后，平台不该靠认识某个插件的名字来找它的动作。

## 2. 做法

- 宿主先用这次调用者在项目目录里按 `capability_id@version` 找提供方（`plugin-action-provider.ts` 的 `pluginActionProvider`，与插件消费动作同一份查找），再把找到的那一个精确写进 `allowed_actions` 和调用的引用。
- 找不到：`actions.dependency_missing`。不止一个：`actions.provider_ambiguous`。两种都不调用，不猜。
- 管理入口原有的拒绝（参数带身份、`evidence` 带身份）仍在查找之前，被拒的调用不读目录。
- CLI 与管理 MCP 都经 `bindGoalsManagementActions`，自己没有写死的提供方，不另改。

## 3. 决策记录

- **宿主调用与插件间依赖分开处理**（统筹 2026-10-24 裁定）。宿主调用按目录找唯一提供方再钉住。插件之间声明的依赖保留声明的精确提供方：Inbox 的 `required_actions` 与 `validate_authority` 对 Pages 仍写 `PAGES_PLUGIN_ID`，它来自 contracts 的公共常量，是 Inbox 自己声明的依赖，不是认识 Pages 的实现。理由：10-23 那条「`allowed_actions` 精确提供方不放宽」也管平台给插件自己调用派生的 `allowed_actions`。去掉提供方后，Pages 被换掉、别人登记同名能力时，Inbox 会把人的收件内容交给用户没同意过的插件，且不报 `actions.provider_changed`。
- 以后由 ac-trust 的同意清单（BL-555 起）在安装时记下用户同意的精确提供方，插件声明才可以不写提供方；不在本片做。
- `goalsActionProvider` 与 `goal-project-application.ts` 里的 `GOALS_PLUGIN_ID` 是 Goals 登记自己、核自己的项目库，不是调别的插件，留给 Goals S9 搬走。

## 4. 验收

- **RAC-336**（`tests/goal-events-state.test.ts`，管理调用者那条）：目录里提供 Goals 动作的是另一个插件 id 时，管理调用钉住的是它，`allowed_actions` 与调用引用都是它。
- **RAC-337**（同一文件）：目录里没有提供方、或有两个时，管理调用与说明读取分别以 `actions.dependency_missing`、`actions.provider_ambiguous` 拒绝，一次也不调用；只有一个时，说明读取到达它，并精确钉住。

## 5. 不在本片

宿主里其余写死别的插件提供方的地方，归 PG-031 余下部分，另排：

- `home-talk-actions.ts`（Sessions）；
- `information-actions.ts`（Feed、Inbox 的 `required_actions`）；
- `artifact-document-import.ts`（成果库导入）；
- `server/src/continuity/actions.ts`。
