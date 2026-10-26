# BL-530：装进 Home 的外部集成插件经沙箱进集成登记（设计稿）

状态：设计稿，待统筹审（2026-10-26，ac-registry 线，分支 `claude/ac-registry-bl530`）。只写文档，不改代码；§6 的几项动安全边界，由统筹弹窗问用户，定了再派实现（原定归 ac-sandbox-sched）。代码事实按 main `2b3dc51de` 和 PG-046 分支 `claude/ac-registry-pg046`（头 `72921fbaf`，FI-3 与 BL-528、BL-529，待评审）核过。暂定号：验收 RAC-893～899，后续 BL-691～694；要的新 S 号写成「S-暂」，由统筹给号。

## 1. 今天是什么样

- **登记只收内置。** `apps/local-host/src/integration-registry.ts`（PG-046 分支）一个 Home 一份，里面一个内存里的 `PluginRuntime`，跑在宿主进程里，按 `HOST_BUILD_TRUST`、`hostIds: HOST_PLUGIN_IDS` 装。调 `enable()` 的只有内置清单（`builtin-integrations.ts`）。id 由先声明的占住，后来的启用失败（`plugin.integration_declaration_conflict`）。
- **集成的合同是函数。** `PluginIntegrationContribution.bind(binding)` 返回 `connector_driver`（`health()`、`poll({cursor, intent})`）、`signal_adapter`（同步的 `toSignalDraft`）和可选的 `account(cursor, label)`。`IntegrationBinding` 只有引用：`source_id`、`connection_id`、`credential_ref`、`config`。内置集成拿 `credential_ref` 在宿主里取令牌。
- **沙箱包只有应用一种。** `apps/local-host/src/sandbox-package.ts` 读五个文件（清单、合同、界面、提示词、`plugin.mjs`），清单必须等于 `sandboxPluginManifest(...)` 的形状：`kind: "app"`、一个本地入口、`storage:private`、`studio.call` 路由、一个主区视图；别的形状是 `plugin.declaration_invalid`。所以今天没有办法装一个外部集成。
- **唯一的安装路径是 T2 的签名沙箱包（S-84）**：先预览、本人确认、固定发布者，Host 在写任何记录之前做完这些检查。
- **装上的插件进不了 Home 级。** `runtime.scope:"home"` 只对 `HOST_BUILD_TRUST` 开放（`assertHomeScopeAllowed`，S-80）。BL-628（ac-clients-1，分支 `claude/bl628-sandboxed-home-plugins`）要把装上的非内置 Home 插件交给沙箱宿主的 Home 实例；#1255（BL-490）给 Home Runtime 里的沙箱包一份自己的 Home 库（`homeDatabase` 效果，S-68 暂定）。
- **沙箱里能用什么由一张表定**：`packages/plugin-sandbox/src/services.ts` 的 `SANDBOX_SERVICE_FATE`。`connections` 是 given，经 broker 的 `connections.request/describe/release`，槽按 S-57 扩展（S-69～71）绑账号。

## 2. 设计

### 2.1 沙箱包加 `integration` 种类

- **清单形状。** `sandboxPluginManifest` 加一种形状 `kind: "integration"`：
  - 一个本地入口、`storage:private`；
  - `connection_services` 和 `integrations` 两项，写法与内置的完全相同，由 SDK 的同一份检查读（`connectionMethodProblems` 等，见 PG-046 片）；
  - 没有路由、没有视图、没有 `runtime` 字段（运行范围由种类决定，见 2.2；清单里写 `runtime` 仍按 PG-011 拒）。
  - 读包时，形状不对照旧是 `plugin.declaration_invalid`，发生在写任何记录之前（S-84 ①）。
- **合同里的操作是固定的几个，名字由平台定**，不由插件起：
  - `integration.health`（query）：输入是绑定（见 2.3），输出是 `ConnectorHealth`。
  - `integration.poll`（query）：输入是绑定、`cursor`、`intent`；输出是 `{ events, cursor, … }`，即 `ConnectorPollResult`，每条事件已经是信号草稿的形状（见 2.3）。
  - `integration.account`（query，可选）：输入是绑定、`cursor`、当前账号名；输出是 `IntegrationAccountPresentation | null`。
  - 合同里多出或少了这几个（`account` 除外），或输入输出 schema 与平台给的不同，读包时拒。平台给的 schema 写进 contracts（`plugin-sandbox.ts` 旁边），SDK 出一个 `defineSandboxIntegration` 帮作者写。
- **只先做 `source`。** `document_import` 的读取今天还在宿主的文档来源提供方里（按 `document_source` 选，W5-11 才移进官方集成插件），外部插件声明一个宿主不认识的 `document_source`，没有东西去读。所以第一版的沙箱集成包只许 `kind: "source"`，写 `document_import` 读包时拒；外部文档导入另开 BL-694，等 W5-11 把读取变成插件的操作再做（§6 第 6 项）。

### 2.2 跑在哪里：BL-628 的沙箱 Home 实例，登记里不跑外部代码

- 集成是 Home 级的（一份登记、各项目的 Feed 共用）。外部集成插件的代码只在**沙箱宿主的 Home 实例**里跑，与 BL-628 的 Home 插件共用起停：装、启用、停用、升级、崩溃重启都走 Home 监督器（`apps/local-host/src/home-plugins.ts`）和 Plugin Runtime，登记不另起进程、不另管生命周期。
- **登记的共用 Runtime 只装内置**，`HOST_BUILD_TRUST` 这一行不动。外部的走另一条口：
  - Home 实例激活一个 `integration` 种类的沙箱包时，监督器把它的声明和一个**宿主端代理**交给登记：`registry.attach(plugin_id, declarations, contribution)`。停用、崩溃停下、卸载时 `registry.detach(plugin_id)`。
  - 登记对这两类一视同仁地查 id、查种类、`bind`；只有「代码在哪里跑」不同。
  - 这样宿主进程里没有任何外部代码：代理是平台的代码，只把调用转成沙箱操作。
- 依赖：BL-628 先落（沙箱宿主有 Home 实例、`assertHomeScopeAllowed` 放开装上的 Home 插件）。#1255 的 Home 库给集成插件存自己的东西（例如游标之外的缓存）；游标本身由 Feed 存，见 2.3。

### 2.3 `bind` 和拉取怎样经 broker（S-60 之下）

- **代理的 `bind(binding)`** 返回：
  - `connector_driver`：`health()`、`poll()` 各调一次沙箱操作（`SandboxRunner.call`），输入是绑定的数据形状。代理带上这次拉取的可信上下文（项目、来源、连接，见 2.4），不从插件的返回里读。
  - `signal_adapter`：**宿主端的通用适配器**。`toSignalDraft` 是同步的，过不了通道；沙箱的 `poll` 直接返回草稿形状的事件，宿主按 contracts 的 schema 逐条核过（有界 JSON，`messageBytes` 等照 `DEFAULT_SANDBOX_LIMITS`），再交 Feed。这和 SDK 的 `definePollingIntegrationPlugin` 给内置集成的通用适配器是同一份。
  - `account`：插件声明了 `integration.account` 才有。Feed 的 `FeedConnectorListener.account` 是同步读的，代理在 `poll` 返回后立刻调一次 `integration.account`，把结果和这次拉取的结果一起交回，不让 Feed 等第二次。
- **两道门照 S-60**：broker 先按合同里每个操作声明的效果和人批的授权核；然后宿主的服务自己再核（连接、网络、Home 库）。三个操作都是 query：拉取不改插件之外的任何东西，写信号的是 Feed，提交按 Feed 读取时的版本（`scheduling: "concurrent"`，`beforeEffect()`）。
- **调用被取消、撤权、停用**：代理把 `signal` 和 `beforeEffect` 传给 `SandboxRunner.call`。返回后 Feed 照旧在 `beforeEffect()` 之后才写；已经不让写的，这一轮的事件丢掉，不写业务记录（AGENTS.md 硬约束）。进程退出时按 `installed.ts` 的做法：这次调用不重放，下次调用重启。
- **游标归 Feed。** 游标随拉取返回、由 Feed 存在来源行上，下次原样交回。插件改不了别的来源的游标，看不到别的来源。

### 2.4 凭据：插件拿不到令牌，拉取用「这条来源的连接」

- 沙箱里永远没有令牌和 `credential_ref`。代理交给沙箱的绑定只有 `source_id`、`config`，以及「这条来源有没有连接」的布尔，不交 `connection_id` 和 `credential_ref`。
- 插件发带账号的请求，只经 `services.connections.request`。问题是今天的槽对不上：
  - S-57 的 `installation` 槽是一个安装一个账号；Feed 是一条来源一个账号，账号是人在 Feed 里加来源时选的，存在 Feed 的来源行上。
  - S-71 的 `per_record` 槽按（安装、插件、槽、项目、记录键）绑定，项目要等于实例自己的项目。Home 实例没有项目，而且绑账号的不是集成的安装，是 Feed 的来源。
- **推荐：`services.connections` 加一种「按调用给的连接」**（S-暂，§6 第 3 项）：
  - 只有代理能给：代理调 `integration.poll`/`health` 时，把这次调用的连接定成 `binding.connection_id`，写进这一次沙箱调用的可信上下文。插件在这次调用里写保留的槽名 `source` 发请求，broker 和宿主就用这条连接。
  - 宿主核：这条连接存在、没被撤；连接的 `service_id` 是这个集成在自己 Manifest 里声明的那一个；请求的地址在这个服务的登记来源之内（2.5）；调用还没结束。任何一项不符就拒，不匿名发出。
  - 调用结束、被取消，这条连接就不再可用；插件不能把它存下来、不能在别的调用里用（`source` 槽在没有给连接的调用里是 `sandbox.not_authorized`）。
  - 刷新、401 重发一次、刷新失败标 `reauth_required`，都照 S-57 扩展 §2.3（S-70），只在宿主里做。
  - 插件读不到任何账号列表，`describe` 只给有没有绑、显示名、状态（S-57 那一份视图）。
- 备选：把来源当记录，用 S-71 的 `per_record` 槽，由人在来源上再绑一次。不推荐：同一个账号绑两次（Feed 的来源一次、集成的槽一次），两边可能不一致，且 Home 实例没有项目，S-71 的键要改。

### 2.5 请求去哪里（S-69）

- S-69：请求只能去平台登记表 `CONNECTOR_REQUEST_SERVICES` 里写的精确 `https://` 来源，Manifest 只写 `service_id`，不写地址。
- 外部集成插件声明的服务，按 2.6 不能和内置的撞 id，所以登记表里没有它，带账号的请求无处可去。三种做法，见 §6 第 4 项：
  - **A（推荐）**：沙箱集成包的 Manifest 给自己声明的服务写一个或几个精确的 `https://` 来源（协议、主机、端口都定死；不许通配、不许 IP 字面量、不许本机或内网地址，按 `@molis-ai/molis-work-contracts/platform/loopback` 判），预览时逐个列给人看，随包签名、随固定的信任一起记下。升级改了来源要重新确认（同 S-84 的预览）。这放宽了 S-69 的「地址只来自平台表」，只对签名沙箱包、只对它自己声明的服务；内置服务的地址仍只在平台表。
  - B：只许外部插件用登记表里已有、又没有被内置插件声明的服务。今天这样的服务几乎没有，等于外部集成不能接新服务。
  - C：只许匿名请求（沙箱已有的 `networkDomains` 效果，不带账号），适合公开源（RSS、公开 API）。可以和 A 或 B 并存。
- 无论哪种，匿名请求仍只经 `networkDomains`，带账号的仍只经 `services.connections`，两条不混。

### 2.6 信任：从发布者签名来，与 S-84 同一条

- 安装只走 S-84 那一条：签名沙箱包、预览、本人确认、固定发布者。没有第二条装集成的路，不按「官方」「第三方」分待遇（用户 2026-10-18 定）；内置的仍是 `HOST_BUILD_TRUST`、跟宿主一起发。
- Home 级的预览与确认：S-84 ② 现在是「这个人在这个项目里」的一次预览。装进 Home 时预览的范围是 Home，换项目照旧作废。这一点与 BL-628 一起定，同一套。
- 执行与信任的对应照 `assertTrustFitsExecution`：签名的、装上的只能是 `execution: "sandbox"`；宿主构建的信任不能沙箱。登记的 `attach` 只收 Home 监督器从沙箱实例给的代理，`enable` 只收宿主构建的定义，两条口互不收对方的。
- `connection_services` 的卡片、认证方式、2.5 A 的来源，都在预览里给人看，是确认的一部分。

### 2.7 和内置集成撞 id：安装时明确拒绝

- 预览时、写任何记录之前，Host 拿包里声明的每个 `service_id`、`integration_id` 对登记（内置的和已装的外部的都算）查一遍，有撞的就拒，报 `plugin.integration_declaration_conflict`，说出撞的是哪个 id、被谁占着。确认时再查一次（预览和确认之间可能有别的装上了）。
- 不用登记里今天「先声明的占住、后启用的失败」那一条处理外部插件：那样装得上、起不来，人看不懂。登记启动时的冲突检查（`restore()` 最早的先装）照旧留着，兜住宿主升级后新加的内置和已装的外部撞上的情况：这时内置先装、外部的那个启动失败，安装页上标出原因，不悄悄换主人。
- 这与 A3 的「安装时拒重复属主」同一个做法。

### 2.8 停用、卸载时怎样清

- **停用、崩溃停下**：`registry.detach(plugin_id)`，登记里的声明放掉（`IntegrationDeclarations.release`）。用它的 Feed 来源下次拉取得到 `plugin.integration_unavailable`（「集成 … 不可用：没有已启用的插件登记它」），来源上显示故障，不删来源、不删连接。再启用就能接着拉，游标还在 Feed 那里。
- **卸载**：Home 监督器（`home-plugin-executor.ts`）照旧调 `forgetInstallationRecords({ home, project_id: null }, record)`，本片在那里加两步：
  - 登记的声明随 `detach` 放掉（监督器停实例时已做，卸载不另写）。
  - 这个插件声明过的连接服务卡片从设置页消失；**人的连接记录不删**（连接归连接服务，不归插件；同一个账号可能还在别处用）。用这个集成的 Feed 来源留着，显示「集成不可用」，由人决定删来源还是重装。
  - 沙箱 Home 库里这个安装的数据照 `retain_private_data` 走（#1255 / `discardInstallationOwnerData`）。
  - 「按调用给的连接」不留任何绑定，所以卸载不用清它；S-71 的 `per_record` 绑定这类插件没有。
- 是否在卸载时连同 Feed 的来源一起删，是 §6 第 5 项；推荐不删。

### 2.9 与沙箱服务表 `SANDBOX_SERVICE_FATE` 对齐

- `connections` 仍是 given，多一种「按调用给的连接」（2.4），表里这一行的说明跟着改，不另加服务。
- 集成插件用不到的，照表拒：agents、scheduler（拉取由 Feed 排，不由插件定时）、notifications、actions、artifacts 等都还是 refused；`model`、`materials` 照 BL-490～492 的进度。
- 不新加 broker 方法：三个操作走 `SandboxRunner.call`，请求走已有的 `connections.request` 与 `networkDomains`。
- Home 实例的 `homeDatabase`、`storage` 按 #1255 / BL-628 给。

## 3. 验收（暂定号）

- RAC-893：沙箱包读取认 `kind: "integration"` 的清单；多了路由或视图、写了 `runtime`、少了 `integration.poll`、schema 与平台的不同、`kind: "document_import"`，各自在写任何记录之前拒（`plugin.declaration_invalid`）。
- RAC-894：装上的集成包在沙箱宿主的 Home 实例里起；登记的共用 Runtime 里没有它，宿主进程里没有它的代码（断言 `registry` 只经 `attach` 拿到它）。
- RAC-895：Feed 的来源经代理拉到事件；沙箱 `poll` 返回不合 schema 或超限的事件，这一轮拒、不写信号；拉取中途停用插件，这一轮的事件不写。
- RAC-896（S-暂）：沙箱在拉取里用 `source` 槽带账号请求，宿主用的是来源的连接；在拉取之外、在别的来源的拉取里、连接已撤、连接的服务不是集成声明的服务，各自拒且不匿名发出；沙箱任何返回、错误、日志里都没有令牌和 `credential_ref`。
- RAC-897：预览时声明的 `service_id` 或 `integration_id` 与内置或已装的撞，报 `plugin.integration_declaration_conflict` 并点名，不写任何记录；预览到确认之间有别的装上撞了，确认时拒。
- RAC-898：停用后来源拉取得 `plugin.integration_unavailable`，再启用接着拉；卸载后设置页没有它的卡片，连接记录与 Feed 来源还在。
- RAC-899（随 §6 第 4 项）：选 A 时，请求去 Manifest 未声明的来源、IP 字面量、本机或内网地址都拒；升级改了来源要重新确认。

## 4. 拆片与依赖

- 前置：BL-628（沙箱 Home 实例，`assertHomeScopeAllowed`）、#1255（Home 库）、PG-046 合入（登记、`connection_methods`）、S-57 扩展的 X1～X3 落地（S-69～71）。原 BACKLOG 写的「排在 BL-491、BL-493 之后」：BL-491（模型设置）与集成无关，BL-493（Agent 相关）也不挡；本稿建议改成「排在 BL-628 之后」，由统筹定。
- 第 1 片：包格式与 SDK 帮手、代理与 `attach/detach`、安装时查撞（RAC-893、894、895、897、898）。
- 第 2 片：「按调用给的连接」与 S-暂，及 2.5 选定的做法（RAC-896、899）。动安全边界，同一个 PR 里补 SECURITY-INVARIANTS 的行和拒绝测试。
- 后续 BL（暂定号，统筹审稿时一起入 BACKLOG）：
  - BL-691：BACKLOG 里 BL-530 的前置由「BL-491、BL-493」改成「BL-628」（若统筹同意）。
  - BL-692：安装页上标出「装着但因撞 id 起不来」的集成（2.7 第二段的兜底场景）。
  - BL-693：外部集成的拉取用量与超时上限（`DEFAULT_SANDBOX_LIMITS` 是否够 Feed 一轮拉取）在第 1 片实测后定。
  - BL-694：外部 `document_import`，等 W5-11 把文档读取变成插件的操作。

## 5. 不做的

- 不改内置集成：它们仍由内置清单 `enable`、在宿主进程的共用 Runtime 里跑。
- 不碰 `integration-providers.ts` 的三选一（等 PG-045）。
- 不新开「官方集成」的特殊安装路径。

## 6. 要用户定的（带推荐）

1. **外部集成插件在沙箱里跑**（沙箱包加 `integration` 种类，`bind`、拉取经 broker；宿主进程里不跑外部代码）。推荐：是。备选：不支持外部集成，集成只随宿主发。
2. **信任从发布者签名来，与 S-84 同一条**（签名、预览、本人确认、固定发布者；装进 Home 时预览范围是 Home，与 BL-628 同一套）。推荐：是。
3. **拉取怎样用来源的账号**：推荐 `services.connections` 加「按调用给的连接」（只由平台代理在这一次拉取里给，连接的服务必须是集成声明的，调用结束即失效，要新 S 号）。备选：S-71 的 `per_record` 槽，人在来源上再绑一次（两处绑定、Home 实例没有项目，不推荐）。
4. **外部插件新服务的地址**：推荐 A：签名包的 Manifest 给自己的服务写精确 `https://` 来源，预览时列给人、随固定的信任记下、升级改了要重新确认（放宽 S-69，只对签名沙箱包自己的服务）。备选 B：只用平台表里已有的服务（实际上接不了新服务）；C：只许匿名请求（可与 A、B 并存）。
5. **撞 id 与卸载**：撞 id 推荐在预览时明确拒（确认时再查一次），不用「先装的占住」；卸载推荐只放掉登记和卡片，人的连接记录与 Feed 来源都留着、显示「集成不可用」。备选：卸载时连同用它的来源一起删（会丢人的来源设置，不推荐）。
6. **第一版只做 `source`**，外部 `document_import` 等 W5-11（BL-694）。推荐：是。
7. **共用起停**：外部集成跑在 BL-628 的沙箱 Home 实例里，登记只经 `attach/detach` 接代理、不另起进程；BL-530 的前置改成 BL-628。推荐：是。
