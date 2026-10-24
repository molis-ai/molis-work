# BL-501：宿主调 Goals 的动作按目录找提供方

状态：PR #1207，按统筹 10-24 对 ac-review「拿不准」的裁定改过一次（2026-10-24，防腐线 ac-kernel 接 ac-platform 的片）；做的是 `privileges.md` PG-031 里 Goals 那一半（BL-501），代码按 main `645853cb6` 核过。按可信发布者签名接受提供方的那一步归 ac-trust。

## 1. 要解决的

宿主替本机这个人调 Goals 的动作时，把提供方写死成 `GOALS_PLUGIN_ID`：

- `apps/local-host/src/goals-actions.ts` 的 `readProjectGuidance`（Run 与助理轮次读项目说明）；
- 同一文件的 `bindGoalsManagementActions`（命令行 `molis-work v1` 与管理 MCP 的管理调用者）。

插件同等待遇（2026-10-18）之后，平台不该靠认识某个插件的名字来找它的动作。

## 2. 做法

- 宿主先用这次调用者在项目目录里按 `capability_id@version` 找提供方（`plugin-action-provider.ts` 的 `pluginActionView`，与插件消费动作同一份查找），再把找到的那一个精确写进 `allowed_actions` 和调用的引用。
- 找到的唯一提供方只在它是随宿主发布的 Goals 时接受：提供方 id 由宿主分配（`plugin-entry-identity.ts` 的 `providerFor`，随宿主发布的定义用 `plugin_id`，别的安装用 `install_id`），第三方安装登记 `goals.*` 也拿不到 `GOALS_PLUGIN_ID`。
- 找不到、或找到的不是它：`actions.dependency_missing`。不止一个：`actions.provider_ambiguous`。都不调用，不猜。
- 管理入口原有的拒绝（参数带身份、`evidence` 带身份）仍在查找之前，被拒的调用不读目录。
- CLI 与管理 MCP 都经 `bindGoalsManagementActions`，自己没有写死的提供方，不另改。

## 3. 决策记录

- **宿主调用与插件间依赖分开处理**（统筹 2026-10-24 裁定）。宿主调用按目录找唯一提供方再钉住。插件之间声明的依赖保留声明的精确提供方：Inbox 的 `required_actions` 与 `validate_authority` 对 Pages 仍写 `PAGES_PLUGIN_ID`，它来自 contracts 的公共常量，是 Inbox 自己声明的依赖，不是认识 Pages 的实现。理由：10-23 那条「`allowed_actions` 精确提供方不放宽」也管平台给插件自己调用派生的 `allowed_actions`。去掉提供方后，Pages 被换掉、别人登记同名能力时，Inbox 会把人的收件内容交给用户没同意过的插件，且不报 `actions.provider_changed`。
- 以后由 ac-trust 的同意清单（BL-555 起）在安装时记下用户同意的精确提供方，插件声明才可以不写提供方；不在本片做。
- **宿主这两路也不放宽谁能收到**（统筹 2026-10-24 回 ac-review 拿不准的裁定）。能力 id 不按插件或发布者归属（R-45）：Goals 不在时，第三方登记的 `goals.*@v` 会接到管理入口（带着本人的决定）与 `readProjectGuidance`（说明进提示词）。裁定要这两路只接受安装由可信发布者签名的提供方。核过：安装记录里的 `publisher.signature` 是 Manifest 自报的字符串，宿主没有核验过的发布者签名可读（包签名 `verifyPluginPackage` 未接进应用），要新合同。所以按裁定的退路：只接受随宿主发布的 Goals（由宿主分配的提供方 id 认出），保留目录查找与带码拒绝；换成按可信发布者签名接受，归 ac-trust（BL-555 起）。
- `goalsActionProvider` 与 `goal-project-application.ts` 里的 `GOALS_PLUGIN_ID` 是 Goals 登记自己、核自己的项目库，不是调别的插件，留给 Goals S9 搬走。

## 4. 验收

- **RAC-336**（`tests/goal-events-state.test.ts`，管理调用者那条）：管理调用钉住目录里找到的提供方，`allowed_actions` 与调用引用都是它。
- **RAC-337**（同一文件）：目录里没有提供方、或有两个时，管理调用与说明读取分别以 `actions.dependency_missing`、`actions.provider_ambiguous` 拒绝，一次也不调用；只有 Goals 一个时，说明读取到达它，并精确钉住。
- **RAC-341**（同一文件）：Goals 不在、目录里唯一的提供方是第三方安装时，管理决定、管理读取与说明读取都以 `actions.dependency_missing` 拒绝，一次也不调用。

## 5. 不在本片

- 按可信发布者签名接受这两路的提供方：归 ac-trust（BL-555 起），需要宿主能读到核验过的发布者签名。

宿主里其余写死别的插件提供方的地方，归 PG-031 余下部分（分支 `ac-kernel/pg031-host-provider-lookup`）：

- `home-talk-actions.ts`（Sessions）；
- `information-actions.ts`（Feed、Inbox 的 `required_actions`）；
- `artifact-document-import.ts`（成果库导入）；
- `server/src/continuity/actions.ts`。
