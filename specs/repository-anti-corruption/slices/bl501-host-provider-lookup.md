# BL-501：宿主调 Goals 的动作只认随宿主发布的 Goals

状态：PR #1207，按统筹 10-24 的裁定与 batch-28 全量的红改过三次（2026-10-24，防腐线 ac-kernel 接 ac-platform 的片）；做的是 `privileges.md` PG-031 里 Goals 那一半（BL-501），代码按 main `645853cb6` 核过。按可信发布者签名接受提供方的那一步归 ac-trust。

## 1. 要解决的

宿主替本机这个人调 Goals 的动作时，把提供方写死成 `GOALS_PLUGIN_ID`：

- `apps/local-host/src/goals-actions.ts` 的 `readProjectGuidance`（Run 与助理轮次读项目说明）；
- 同一文件的 `bindGoalsManagementActions`（命令行 `molis-work v1` 与管理 MCP 的管理调用者）。

插件同等待遇（2026-10-18）之后，平台不该靠认识某个插件的名字来找它的动作。

## 2. 做法

- 两路都经一个私有函数 `invokeGoals`：把随宿主发布的 Goals 的提供方 id 精确写进 `allowed_actions` 与调用的引用，直接调用，不先读目录。
- 这个 id 只有宿主分配（`plugin-entry-identity.ts` 的 `providerFor`：随宿主发布的定义用 `plugin_id`，别的安装用 `install_id`）。第三方安装登记 `goals.*` 也拿不到它，分发器在处理器之前拒绝：没有 Goals 答 `actions.missing`，只有别人的提供方答 `actions.provider_changed`。这次调用照常记进调用记录；等待中被取消，也在分发器里结算。
- 管理入口原有的拒绝（参数带身份、`evidence` 带身份）仍在调用之前。
- CLI 与管理 MCP 都经 `bindGoalsManagementActions`，自己没有写死的提供方，不另改。

## 3. 决策记录

- **宿主调用与插件间依赖分开处理**（统筹 2026-10-24 裁定）。宿主调用按目录找唯一提供方再钉住。插件之间声明的依赖保留声明的精确提供方：Inbox 的 `required_actions` 与 `validate_authority` 对 Pages 仍写 `PAGES_PLUGIN_ID`，它来自 contracts 的公共常量，是 Inbox 自己声明的依赖，不是认识 Pages 的实现。理由：10-23 那条「`allowed_actions` 精确提供方不放宽」也管平台给插件自己调用派生的 `allowed_actions`。去掉提供方后，Pages 被换掉、别人登记同名能力时，Inbox 会把人的收件内容交给用户没同意过的插件，且不报 `actions.provider_changed`。
- 以后由 ac-trust 的同意清单（BL-555 起）在安装时记下用户同意的精确提供方，插件声明才可以不写提供方；不在本片做。
- **同一宿主里同一 `goals.*@v` 不能并存**（统筹 10-24 要求核实）：项目与 Home 的提供方——宿主自己的、项目 Plugin Runtime 的、Home 监督器的——都经 `LocalHost.actionRegistry` 登记进同一个 `CapabilityRegistry`（`local-host.ts` 的 `capabilities`，`ActionService.registerProvider` 逐个 `register`）；`register` 对作用域重叠的同 id 同版本抛 `capability_duplicate`（项目与 Home 重叠，两个项目不重叠），目录可见性又要求提供方的 `project_id` 为空或等于调用者的项目。所以一个项目的目录里同一 `capability_id@version` 最多一个提供方，宿主其他「按目录找唯一提供方」的调用（information-actions、CLI、MCP）不会因为装了一个插件就一直 `provider_ambiguous`。外部 MCP 的能力 id 带固定前缀，登记不了同名。
- **不先查目录**（batch-28 全量 `tests/security-invariants-management.test.ts` 的取消、断联两例红）：前一版先用 `pluginActionView` 读目录再调用。读目录要逐个算动作的可用性，取消发生在这一步时，还没有调用，宿主就不会把这次操作结算成 `actions.cancelled` 的调用记录；每次管理调用和每轮说明读取也多一次整份目录的检查。查找条件已经是 Goals 的提供方 id，先查目录对结果没有增益，所以去掉，回到直接钉住调用，由分发器拒绝。
- **宿主这两路也不放宽谁能收到**（统筹 2026-10-24 回 ac-review 拿不准的裁定）。能力 id 不按插件或发布者归属（R-45）：Goals 不在时，第三方登记的 `goals.*@v` 会接到管理入口（带着本人的决定）与 `readProjectGuidance`（说明进提示词）。裁定要这两路只接受安装由可信发布者签名的提供方。核过：安装记录里的 `publisher.signature` 是 Manifest 自报的字符串，宿主没有核验过的发布者签名可读（包签名 `verifyPluginPackage` 未接进应用），要新合同。所以按裁定的退路：两路保留精确提供方，只接受随宿主发布的 Goals（由宿主分配的提供方 id 认出）；换成按可信发布者签名接受，归 ac-trust（BL-555 起）。
- `goalsActionProvider` 与 `goal-project-application.ts` 里的 `GOALS_PLUGIN_ID` 是 Goals 登记自己、核自己的项目库，不是调别的插件，留给 Goals S9 搬走。

## 4. 验收

- **RAC-336**（`tests/goal-events-state.test.ts`，管理调用者那条）：管理调用钉住随宿主发布的 Goals，`allowed_actions` 与调用引用都是 `GOALS_PLUGIN_ID`，调用前不读目录。
- **RAC-337**（同一文件，真实 `LocalHost`）：项目里没有 Goals 时，管理调用与说明读取被分发器以 `actions.missing` 拒绝。
- **RAC-341**（同一文件，真实 `LocalHost`）：Goals 不在、只有第三方安装登记了同名能力时，管理决定、管理读取与说明读取都以 `actions.provider_changed` 拒绝，第三方的处理器一次也没跑。
- **RAC-342**（同一文件，真实 `LocalHost`）：Goals 已在项目里登记时，同一项目或 Home 再登记同一个 `goals.*@v` 抛 `kernel.capability_duplicate`；另一个项目的登记不出现在这个项目的目录里。
- 取消与断联：`tests/security-invariants-management.test.ts` 的两例照旧证明宿主把真实取消的操作结算成 `actions.cancelled`、没有业务写入。

## 5. 不在本片

- 按可信发布者签名接受这两路的提供方：归 ac-trust（BL-555 起），需要宿主能读到核验过的发布者签名。

宿主里其余写死别的插件提供方的地方，归 PG-031 余下部分（分支 `ac-kernel/pg031-host-provider-lookup`）：

- `home-talk-actions.ts`（Sessions）；
- `information-actions.ts`（Feed、Inbox 的 `required_actions`）；
- `artifact-document-import.ts`（成果库导入）；
- `server/src/continuity/actions.ts`。
