# PG-011、PG-017 余项的设计稿

状态：设计稿，第 9 节六问用户 2026-10-30 已弹窗裁定、都选推荐项（第 10 节），T-140～T-145 按稿开单（T-139；方案 #1332 评论 6529582547，统筹 6529598304 批准）。行号在 main `cc138cf75` 上核过；只读了代码，没有构建，也没有跑测试。

## 为什么有这份稿

用户 2026-10-30 定：PG-011 与 PG-017 要等余项全部做完才收口（`privileges.md` 两格的余项）。余项有八项：

- PG-011：BL-710～BL-715；
- PG-017：BL-491、BL-493。

BL-715 由 T-138 直接做。其余七项在设计上都有没定的地方，有的要用户拍板。这份稿把它们写成开发单可以照着写任务书的形状，并把要问用户的整理成一次弹窗（第 9 节）。

起草时发现一个比余项本身更大的前提：**签名包的 Manifest 是固定形状**。所以 PG-017 已经给出的几项服务，真实的签名包其实用不上（第 1 节，BL-916）。

## 总表

| 节 | 项 | 开发单 | RAC | S | 依赖 |
| --- | --- | --- | --- | --- | --- |
| 1 | 签名包格式（BL-491、BL-493、BL-916 共用） | 由 T-143、T-144 落地 | 随 T-143、T-144 | 改 S-84 一句 | 第 9 节第 6 问 |
| 2 | BL-714 Home 实例的模型入口 | T-140 | RAC-2610～2614 | 扩 S-66、S-91 的分句 | T-134 |
| 3 | BL-711 Home 包就地升级（回滚不做，D1） | T-141 | RAC-2615～2619 | 改写 S-80、S-84 的分句 | T-134、T-140、第 1 问 |
| 4 | BL-712 创作台产物装进 Home | 统筹另给 | 统筹另给 | 甲方案无；乙方案要新号 | BL-377、BL-589、第 2 问 |
| 5 | BL-713 导航位置与图标 | T-142 | RAC-2620～2624 | 无 | T-138、#1576、#1552、第 4 问 |
| 6 | BL-491 模型设置与生图 | T-143 | RAC-2625～2634 | 扩 S-60；S-66、S-91 补分句 | 第 1 节、第 6 问 |
| 7 | BL-493 Agent 角色与方法正文 | T-144 | RAC-2635～2641 | S-104（统筹暂留） | T-143、第 5 问 |
| 8 | BL-710 项目范围动作对 Home 包可达 | T-145 | RAC-2642～2649 | S-105（统筹暂留） | 第 3 问 |

- S-104、S-105 是统筹给 BL-493、BL-710 暂留的号。开 T-144、T-145 时，统筹会再核 main 与在途的改动。S 号要连着排：前面的号如果还没落地，这两个可能顺延。S-103 已经给了 T-136。
- BL-715 不在这份稿里，由 T-138 做。

## 1. 前提：签名包的格式（BL-491、BL-493、BL-916 共用，先定这个）

### 现状

- `apps/local-host/src/sandbox-package.ts` 的 `readSandboxPackage`（第 70～104 行）读五个文件：`manifest.json`、`plugin.mjs`、`contract.json`、`interface.json`、`prompts.json`（见 `docs/platform/PLUGIN-DEVELOPMENT.md`「沙箱包」）。prompts 至多 64 条，每条正文至多 8000 字。
- 第 99～102 行用 `sandboxPluginManifest(...)`（`apps/local-host/src/sandbox-plugin-manifest.ts` 第 31～46 行）重建清单，与包里的清单逐字段比较，有不同就以「清单不是沙箱插件的形状」拒绝。固定形状只有这几样：
  - `storage:private`；
  - 可选的 `projects:exist`；
  - 路由 `studio.call`；
  - 一个不带 `icon` 的 stage 视图。
- 所以真实的签名包写不了 `model:read`、`model:invoke`、`model_configuration`、`image_generation`、`agent`、`methods`。PG-017 已经给出的服务里，至少 S-66（文字模型）是这样：`apps/local-host/src/home-plugin-executor.ts` 第 134 行已经对 Home 包调 `pluginModelFor`，但它要求 Manifest 里有 `model:read` 或 `model:invoke`（`apps/local-host/src/plugin-model-service.ts` 第 25 行）。这类服务的测试用的都是探针定义，不是装进来的包。这就是 **BL-916**。
- **先例**：沙箱集成包（BL-530）已经是「固定部分 + 包给的块」的写法。`readSandboxIntegrationPackage`（`sandbox-package.ts` 第 129～168 行）的做法是：
  1. 先用 `parsePluginManifest` 校验整份清单；
  2. 逐块检查包写的 `connection_services`、`integrations`；
  3. 交给 `sandboxIntegrationManifest`（`sandbox-plugin-manifest.ts` 第 64～77 行）重建，再逐字段比较。
- **安装预览**（`apps/local-host/src/plugin-install-service.ts` 第 103～123 行）给出三样东西：
  - `permissions`（`permissionViews`）；
  - `declarations`（`declarationsNeedingConsent`）；
  - 集成包的顶层可选字段 `origins`。
- `declarations` 是同意账本的条目：`PluginConsentKind` 只有四个值（`packages/contracts/src/platform/plugin-trust.ts` 第 18 行：`always_on`、`default_wiring`、`default_group`、`local_directory`），由 `assertConsentsDeclared` 校验，记进账本，声明一变就重新问。

### 做完是什么

- 应用包的清单比对改成「固定部分逐字段相同 + 名单内的块由包给、各块各自校验」。名单是：
  - `model_configuration`、`image_generation`，以及它们需要的权限行（`model:read`、`model:invoke`）；
  - `agent`、`methods`。
- `sandboxPluginManifest` 的输入加这几个可选块。固定部分仍由宿主写，这个函数仍是写清单的唯一一处。
- 安装预览这样列出：
  - BL-491 的两项走 `permissions`；
  - BL-493 加一个顶层可选的列表，推荐写成 `agent_bodies: [{ kind: "role" | "method", name, excerpt }]`，字段名在开发单里定；
  - `plugins.install.preview` 的输出形状因此改变，由 T-144 升到 `@4`。按 `docs/system/CONTRACT-CHANGES.md`，现在不留兼容期，旧版同时删掉。
- 可检验：
  - 写了名单内块的包能装；
  - 写了名单外字段的包仍以「清单不是沙箱插件的形状」拒绝；
  - 名单内的块写错了，以那一块自己的错误拒绝；
  - 预览列出新的权限行与正文列表。

### 选项与推荐

| 要定的 | 选项 | 推荐与理由 |
| --- | --- | --- |
| 新声明写在哪 | ① Manifest 里允许名单内的可选块；② 另加包文件（如 `agent.json`） | **①**。这些声明本来就是 Manifest 的字段，SDK 的 Manifest 规则已经认得；`SANDBOX_NOT_GIVEN` 的判断也读 `definition.manifest.*`（`packages/plugin-sandbox/src/services.ts` 第 133～138 行）；集成包已经这样做。另起文件要再写一套解析，还要让它和 Manifest 保持一致。用户已定①（D6） |
| 预览怎样列出 | ① 沿用 `declarations`；② `permissions` 加顶层可选字段 | **②**。新内容是安装时看一次的东西，不是对别处的改变要不要同意。塞进 `declarations` 要给 `PluginConsentKind` 加值、给账本加记录，等于平白多改一次合同。集成包的 `origins` 是先例。属于合同上的做法，不问用户 |
| 与 BL-589 的先后 | ① 先扩格式，BL-589 在后；② BL-589 先做 | **①**。BL-589 要把 `sandboxPluginManifest` 搬进 `plugin-sdk`，先扩格式再搬，同一个函数只改一遍 |

### S

改 S-84 的一句：安装确认要列出名单内的块，权限行与正文都要列。各块给出的服务按第 6、7 节分别处理。

### RAC 与依赖

- 不单独开单：T-143 落地模型设置与生图两块，T-144 落地 `agent`、`methods` 两块，RAC 在它们各自的号段里。
- BL-916（S-66 等已给的服务，真实包够不着）由 T-143 的权限行一并解决，开发单里要有一条「装进来的真实包能调 `sdk.model.*`」的用例。

## 2. BL-714 Home 实例的模型入口（T-140）

### 现状

包里的模型调用有两条路，这里要分开：

- **(a) `services.model`**：S-66，即 `sdk.model.*`。Home 执行器已经建它，真实包够不着的原因是 Manifest 写不了权限行。这归第 1 节与 BL-916，不在本节。
- **(b) `prompts.json` 走的动作 `model.generate@1`**：这是 BL-714 说的那条路。
  - 它由 `registerPlatformCapabilities` 注册（`apps/local-host/src/plugin-builder/catalog.ts` 第 44～57 行），`scope` 写死成 `'project'`，provider 是 `PLATFORM_PROVIDER_ID`。
  - 快照里只有一行：`tooling/gates/actions/host-actions.tsv` 的 `model.generate	1	plugin-platform`。
  - 只有项目的已装插件宿主注册它（`apps/local-host/src/installed-plugin-host.ts` 第 158 行）。第 147 行还要求调用者的 `project_id` 等于这个项目，否则以 `plugin.capability_denied`（「模型调用缺少当前项目的执行身份」）拒绝。
  - Home 的已装插件宿主（`apps/local-host/src/home-installed-plugins.ts`）不注册它，所以 Home 包的 `prompts.json` 调用被拒。
- **快照能不能有 Home 一行**：`scripts/gates/action-contract-snapshot.mjs` 第 198 行，宿主行的键是 `capability_id@version via provider`；第 268～270 行（`buildHostRows`），同一个键再出现一次而各列不同（比如 `scope`），就报「registered with two different declarations」。所以**同一个 provider 下不能有 Home 一行；另起一个 provider id 就可以**。先例是 Goals 的 `goals.planning.personal.*`：它在 Home 里以 `io.molis.work.goals.home` 注册（同一文件第 247～250 行的注释）。
- `registerPlatformCapabilities` 已经在 `actions.project_id === null` 时去掉 provider 的 `project_id`（`catalog.ts` 第 56 行），只差 `scope` 和 provider id。

### 做完是什么

- Home 实例用另一个 provider id 注册 `model.generate@1`，`scope: "home"`。id 由开发单定，推荐「插件平台」的 Home 版本，照 Goals 的写法。`capability_id` 不改，包里的调用也不用改。
- 这个入口只认本 Home 实例的执行身份（调用者有 `plugin_install_id`、`project_id` 为空、安装属于这个 Home）。指令只能按包自己登记的 id 点名（与 `createPluginModelPort` 的规则相同）。
- 计量与模型设置读 Home 的。它只读已有的模型设置与计量，不新建表，所以预计不用等干净重建批（#1578、#1549、#1588、#1587、#1589、#1591、#1593、#1552）。开发单开工时若发现要动 Home 插件库的 DDL，就等批落地（#1588 把 `home-plugin-store.ts` 的基线改成 v1）。
- 快照多一行 `model.generate@1 via <Home 的 provider>`，跑 `pnpm actions:update`。
- 可检验（都断言「拒绝」）：
  - 带项目身份调 Home 入口被拒；
  - 别的安装的身份被拒；
  - 点名未登记的指令被拒；
  - 停用后的调用被拒；
  - 本 Home 包用自己登记的指令可以调通。

### 选项与推荐

| 选项 | 推荐与理由 |
| --- | --- |
| ① 同一个 `capability_id`，Home 用另一个 provider id（推荐） | 包的代码不用管自己在哪里运行；快照有先例 |
| ② 另起 id，如 `model.generate.home@1` | 不推荐：作者要按运行范围调不同的 id |
| ③ 同一个 provider 下 `scope` 跟着 registry 走 | 不行：快照门禁按第 268～270 行报错 |

统筹已采纳 ①，不问用户。

### S

扩 S-66（模型与指令：Home 实例的入口只认本实例的执行身份）与 S-91（Home 沙箱实例的身份与服务）的分句。不开新号。

### RAC 与依赖

- RAC-2610～2614。
- 依赖 T-134（`origin/task/T134-ca`，改 `home-installed-plugins.ts` 的集成挂载），排在它后面。

## 3. BL-711 Home 包就地升级（T-141）

### 现状

- 项目里的签名包已经就地升级：`installed-plugin-host.ts` 第 207 行传的是 `lifecycle(recordFor(...) ? 'upgrade' : 'install', ...)`（BL-623）。
- Home 有两处拒绝，都答 `plugin.state_invalid`（「先卸载（可保留数据），再装新包」）：确认处 `plugin-install-service.ts` 第 164 行，宿主 `home-installed-plugins.ts` 第 178 行。
- 回滚在两个范围都被拒：`apps/local-host/src/installed-plugin-lifecycle.ts` 第 152 行。
- 钉住这些拒绝的用例：
  - RAC-1505～1507：`tests/home-installed-plugins.test.ts` 第 155～199 行；
  - RAC-1683：`tests/security-invariants-sandbox-home-instance.test.ts` 第 125～157 行；
  - 来自 T-055、T-155、T-175。
- 设置页的预览只拿当前项目的列表比对版本（`apps/workbench/src/settings-plugins.ts` 第 191～192 行的 `current.find(...)`），装 Home 包时不和 Home 行比。

### 做完是什么

- Home 包就地升级：同一发布者、版本更新、`assertUpgradeOf` 通过，照项目的 `lifecycle('upgrade')` 做；批准、密钥、提示词登记随新版本换。
- 设置页的预览能与 Home 行比对，说出「已装的是 x，装上后升级到 y；数据保留」。
- 上面四个用例改成断言新行为。这是预期变化，不是放宽，PR 里要逐条写；仍要断言的拒绝包括：
  - 另一个发布者被拒；
  - 版本不更新被拒；
  - 范围被换被拒（D5）。
- 不做回滚（D1）：两个范围的回滚照旧被拒，`installed-plugin-lifecycle.ts` 的拒绝和钉住它的断言不动。

### 选项与推荐（回滚，D1 定①）

| 选项 | 推荐与理由 |
| --- | --- |
| ① 不做回滚，从 PG-011 余项里删掉「回滚」二字（推荐） | Runtime 只回退代码、不回退数据。降级后的旧代码读新形状的数据，平台核不了 |
| ② 做，只回退代码，预览写明「数据不回退」 | 风险转给人，平台只能提示 |

### S

改写 S-80（Home 的签名包可就地升级）与 S-84（预览与 Home 行比对）的分句。不开新号。

### RAC 与依赖

- RAC-2615～2619。
- 依赖：T-134（同一文件）；T-140 先合，因为升级时提示词与模型入口要一起换，入口要先立起来；第 9 节第 1 问。

## 4. BL-712 创作台产物装进 Home（开发单号由统筹另给）

### 现状

- S-80 只对「签名固定 + 沙箱」放开（bl628 D1，用户 2026-10-26 弹窗决定）。创作台产物是 `unsigned`，装进 Home 时被 `assertHomeScopeAllowed` 以 `plugin.home_scope_unavailable` 拒绝。
- BL-377（创作台整体升级）还没开工；BL-589（沙箱包的作者工具、创作台发布出签名包）也还没做。今天创作台的产物走自己的 release 目录，只装进项目。

### 做完是什么（两种方案，D2 定甲）

- **甲（推荐）**：
  - 创作台用本机一把只属于这个 Home 的密钥给产物签名，本人固定这把密钥一次；
  - 之后产物走 S-84 那条唯一的安装路：验签、固定、本人确认、沙箱，S-80 不变；
  - 密钥按「密钥只给引用」存放，删 Home 时一起删。
- **乙**：放开 S-80，允许 `unsigned` 加沙箱装进 Home。没有发布者身份，等于让一个没署名的东西常驻 Home。
- 可检验（甲）：
  - 本机密钥没有固定时，产物装不进 Home；
  - 固定之后能装；
  - 别的 Home 的密钥签的包，在这里仍是未固定的发布者。

### S

- 甲：不开号，S-84 补一句「本机密钥也是一个固定的发布者」。
- 乙：要一个新号，统筹另给。

### RAC 与依赖

- 号段由统筹另给，不在 T-138～T-145 里。
- 依赖：第 9 节第 2 问；甲方案与 BL-589 共用「创作台发布出签名包」这一步，推荐排在 BL-589 之后，或与它合成一单。BL-377 的重做不必等。

## 5. BL-713 导航位置与图标（T-142）

### 现状

- **Home 导航只来自构建期目录**：`apps/workbench/src/home-plugin-navigation.ts` 的 `homePluginSideTabs`（侧栏页签）与 `renderHomePluginNavigation`（到达页的 Home 工具按钮），以及 `apps/workbench/src/plugin-store-unavailable.ts`，都只读 `BUILTIN_PLUGIN_CATALOG` 里 `runtime.scope === "home"` 的条目。装进来的 Home 包在这些地方都不出现。
- **装进来的 Home 包只在各项目里以个人插件出现**：
  - 链路：`apps/local-host/src/home-plugins.ts` 的 `outsideBuild()` → `bindHomeRegistration`（`apps/local-host/src/home-registration.ts`）→ `homePluginsOutsideBuild`；
  - 读它的有 `apps/local-host/src/project-catalog.ts`（`isPersonal`）、`apps/local-host/src/project-reach.ts`、`apps/local-host/src/project-plugin-enablement.ts`、`apps/local-host/src/project-action-availability.ts`；
  - 也就是项目的插件目录与底栏插件选择里的「个人插件」。
- **图标**：
  - 各处都取视图的 `icon`，没有就用 `"package"`（`apps/workbench/src/plugin-catalog.ts`、`apps/workbench/src/shell-page-renderer.ts`）；
  - `apps/workbench/src/plugin-directory.ts` 的 `sanitizeView` 只收平台命名图标集里的名字（`PluginIconName`，`packages/plugin-sdk/src/ui/icon.ts`）；
  - 沙箱包的固定形状只有一个不带 `icon` 的 stage 视图（`sandbox-plugin-manifest.ts` 第 44 行），所以现在一律画成 `package`。
- **不可用时**：构建期 Home 插件不可用，由 `plugin-store-unavailable.ts` 与 `apps/workbench/src/unavailable-plugin-stage.ts` 的 Home 提示处理；装进来的包不经过这几处。

### 做完是什么

- 运行中的 Home 包进到达页与侧栏的 Home 工具位，和构建期 Home 插件放在同一个固定位置，按名字排。
- 三种状态照构建期条目的画法：
  - 停用：不出现；
  - 恢复错误：出现，打开后是不可用页，原因取 T-138 给的 `recovery_error`；
  - 卸载：消失。
- 图标按第 9 节第 4 问的裁定。推荐：固定形状的 stage 视图允许带 `icon`，取值只能是平台命名图标集里的名字，经 `sanitizeView` 收；不写就画 `package`。
- 可检验：
  - 装一个 Home 包后，到达页的 Home 工具位有它，图标是包选的名字；
  - 写了图标集之外的名字，装包时被拒；
  - 停用后它从工具位消失。

### 选项与推荐（图标，D4 定①）

| 选项 | 推荐与理由 |
| --- | --- |
| ① 包从平台的命名图标集里选一个名字（推荐） | 内置插件走的就是这条路，同等待遇；`sanitizeView` 已经只认这个集合；不带图片、不用清洗、不扩包文件 |
| ② 平台按插件名画字母徽标 | 要新写一种画法，内置插件不用它 |
| ③ 包带一张受限的图片 | 要扩包格式，还要清洗 SVG 或 PNG，多一个注入面 |

### S

无。包格式只多一个取值受限的字段；如果选 ③，就要改 S-84 并另议。

### RAC 与依赖

- RAC-2620～2624。
- 依赖：
  - T-138（同一套「个人空间里的插件」的说法与 `recovery_error`）；
  - #1576（T-126）与 #1552（都碰插件目录与沉浸外壳）合入；
  - 第 9 节第 4 问。
- 档：乙；如果选 ③，改为甲。

## 6. BL-491 模型设置与生图（T-143）

### 现状

- 不给的表里有 `model_configuration` 一行（`packages/plugin-sandbox/src/services.ts` 第 133～134 行）：启动时以 `sandbox.service_not_given` 拒绝。
- `SANDBOX_SERVICE_FATE.imageGeneration` 是 `'entry'`（同一文件第 100 行）。
- Home 执行器对两者调 `givenService(...)`（`home-plugin-executor.ts` 第 134～135 行），只认启动名单；项目一侧见 `apps/local-host/src/plugin-image-generation-entries.ts`、`apps/local-host/src/plugin-image-generation-service.ts`。
- pg017 片 §3.7 已经定了做法：生图只给命令、计量、base64 字节有上限。
- 同一片的「项目清理」要确认声明式清理对沙箱同样成立（RAC-239），但 main 上没有这条用例：`git grep RAC-239 -- tests` 无输出。
- `files` 一项已不用做：它在 PG-102 P2b 删了，主人文件（S-64）已给。
- 前提：包格式写不了这两项声明（第 1 节）。

### 做完是什么

- 包能在 Manifest 里写 `model_configuration`、`image_generation` 与 `model:read`、`model:invoke` 权限行（第 1 节），安装预览在 `permissions` 里列出它们。
- broker 加这两项服务，每次一个方法地转进沙箱，照 S-60 两道门串联：
  - 模型设置：读、写本插件自己的设置，形状是可序列化的 JSON（选择、状态）；
  - 生图：只给命令，不给查询；照项目的计量；返回的 base64 字节设上限，数字在开发单里定，照 pg017 片 §3.7 的取法；
  - `SANDBOX_SERVICE_FATE.imageGeneration` 从 `'entry'` 改成 `'given'`。
- 删掉 NOT_GIVEN 的 `model_configuration` 一行。
- 补 RAC-239 的用例：删项目时，平台按安装与声明清掉沙箱插件的数据，沙箱插件不用交 `purge` 函数。
- BL-916 的用例：装进来的真实包能调 `sdk.model.*`。
- 可检验（都断言「拒绝」）：
  - 没写声明的包调生图被拒；
  - 超过字节上限被拒；
  - 查询里调生图被拒；
  - 别的安装的设置读不到。

### 选项与推荐

| 要定的 | 选项 | 推荐与理由 |
| --- | --- | --- |
| S 号 | ① 扩 S-60；② 新开一个号 | **①**。它是「沙箱经 broker 用宿主服务」这条总规则下的又一项服务，与 S-66 同类。统筹已采纳 |
| 上限与计量 | — | 不问用户，照 pg017 片 §3.7 写进开发单 |

### S

- 扩 S-60（broker 转模型设置与生图）；
- S-66 补一句「模型设置可经 broker 读写」；
- S-91 补一句「Home 沙箱实例同样适用」。

### RAC 与依赖

- RAC-2625～2634。
- 依赖：第 1 节的格式扩展（本单落地其中的模型设置、生图两块）、第 9 节第 6 问。

## 7. BL-493 Agent 角色与方法正文（T-144）

用词照 `docs/system/GLOSSARY.md`：「Agent 角色」「方法 / Skill」，不写 Character（Character 是人的工作方式，不是插件带的东西）。

### 现状

- 不给的表里有 `agent` 一行（`services.ts` 第 137～138 行）：definition 只要带了 `methods`、`agent_prompts`、`agent_skills`、`manifest.agent` 之一，启动就被拒。
- pg017 片 §3.2 写「角色与方法正文先不给」（§6 Q2），理由是安装确认列不出它们。原来等的 PG-001（一条安装路，S-84、S-85）已经做完，这个前提已经满足。
- 包里现在只有 `prompts.json`：至多 64 条，每条正文至多 8000 字。它们登记成 `model.generate` 用的指令，不是给别的 Agent 的角色或方法。

### 做完是什么

- 包能在 Manifest 里写 `agent`、`methods`（第 1 节）。正文的条数与字数上限照 `prompts.json` 的口径，在开发单里定。
- 安装预览逐条列出名字与正文前 N 字（N 在开发单里定）。`plugins.install.preview` 升到 `@4`，加顶层可选字段（第 1 节）。
- 正文按提示注入面处理，对照 `docs/system/SECURITY-INVARIANTS.md` 里提示注入的几行：
  - 只作数据进别的 Agent 的上下文，带来源标记（哪个插件、哪个版本、哪个发布者）；
  - 不升级权限：Agent 用这段正文时，调用的仍是它自己被授权的动作；
  - 升级后正文换了，预览里要能看出来。
- 删掉 NOT_GIVEN 的 `agent` 一行。
- 可检验：
  - 预览列出每一条的名字与摘要；
  - 正文进上下文时带来源标记；
  - 正文里写「调用某某动作」不会让 Agent 多一项授权（断言拒绝）；
  - 超过上限的包被拒。

### 选项与推荐（正文怎样给，D5 定①）

| 选项 | 推荐与理由 |
| --- | --- |
| ① 预览逐条列出名字与正文前 N 字，正文只作数据进上下文、带来源标记，不升级权限（推荐） | 和内置插件、宿主里的第三方插件同等待遇，人在安装时看得到 |
| ② 只给名字与用途，正文由平台模板生成 | 注入面小，但插件写不了自己的方法，等于不给 |

### S

S-104（统筹暂留）：签名包带进来的 Agent 角色与方法正文只作数据、带来源、不升级权限。开 T-144 时统筹再核号。

### RAC 与依赖

- RAC-2635～2641。
- 依赖：T-143 先合（同一处包格式）、第 9 节第 5 问。

## 8. BL-710 项目范围动作对 Home 包可达（T-145）

### 现状

- bl628 D2：Home 实例没有项目，沙箱不继承内置 Home 插件的 `PROJECT_REACH_PERMISSION`（值是 `projects:reach`；`packages/plugin-runtime/src/action-provider.ts` 第 9 行、第 49 行）。
- 钉住它的是 RAC-967：`tests/security-invariants-sandbox-home-instance.test.ts` 第 100 行。
- 同意账本 `HomeConsentLedger`（`apps/local-host/src/home-plugin-store.ts` 第 70 行）的 `PluginConsentKind` 只有四个值，没有可以直接用的。

### 做完是什么

- **谁同意、在哪里同意**：本人，在某个项目的设置里，对某一个 Home 包同意「它可以读写这个项目」。一次同意只对这一个项目、这一个安装有效。
- **存在哪**：同意账本加一个值（推荐叫 `project_reach`），主体写成「项目 id + 安装 id」。这是改合同：`PluginConsentKind` 加值，有关动作的形状变了就升版本，照 `docs/system/CONTRACT-CHANGES.md`。
- **怎样撤回**：同一处设置可以撤回；卸载这个包、删这个项目，都一并撤掉。
- **调用时怎样查**：
  - `project_id` 只取自调用上下文，不从输入读；
  - 每次调用都查账本里有没有「这个项目 + 这个安装」的同意，并照常检查世代与生命周期。
- RAC-967 改成「没同意时仍拒」，另加「同意后可达」「撤回后再拒」「别的项目仍拒」。

### 选项与推荐（给不给，D3 定①）

| 选项 | 推荐与理由 |
| --- | --- |
| ① 逐项目、逐安装同意，可撤回（推荐） | 用户 10-30 要求余项都做完；按项目给，范围最小 |
| ② 不做，从余项里删掉 | 维持 bl628 D2；Home 包只用自己的 Home 数据 |

### S

S-105（统筹暂留）：Home 沙箱包只在本人对某个项目同意之后才能调那个项目的动作，同意按项目、按安装记，可撤回。开 T-145 时统筹再核号。

### RAC 与依赖

- RAC-2642～2649。
- 依赖：第 9 节第 3 问。

## 9. 问用户

统筹把这六问合成一次弹窗。每问的第一个选项是推荐项。

| # | 问题 | 选项 | 推荐与理由 |
| --- | --- | --- | --- |
| 1 | 装在 Home 里的签名插件升级后，要不要能退回旧版本（BL-711）？ | ① 不做回滚，从余项里删掉（推荐）；② 做，只退代码不退数据，确认页写明 | ①：数据不会跟着退，旧代码读新数据可能出错，平台核不了 |
| 2 | 插件创作台做出来的插件，怎样装进 Home（BL-712）？ | ① 用本机专属密钥签名，你固定一次，之后照签名包装（推荐）；② 放开限制，允许没签名的插件进 Home | ①：仍走唯一一条安装路，常驻 Home 的东西都有署名 |
| 3 | 装在 Home 里的插件，要不要能读写某个项目的数据（BL-710）？ | ① 要，你按项目逐个同意，可以撤回（推荐）；② 不要，从余项里删掉 | ①：按项目给，范围最小，随时能收回 |
| 4 | 装在 Home 里的插件，在导航里用什么图标（BL-713）？ | ① 从平台的图标集里选一个（推荐）；② 平台按插件名画字母徽标；③ 插件自带一张图片 | ①：内置插件也是这样，不用处理外来图片 |
| 5 | 插件带来的 Agent 角色与方法正文，怎样交给 Agent（BL-493）？ | ① 安装时逐条给你看名字与开头，正文只当资料用、不加权限（推荐）；② 只给名字与用途，正文由平台生成 | ①：插件能写自己的方法，你装之前看得到 |
| 6 | 签名插件包里要多写这些声明，写在哪里（BL-491、BL-493）？ | ① 写在插件清单里，只许名单内的几块（推荐）；② 另加单独的文件 | ①：集成包已经这样做，一套规则就能校验 |

## 10. 裁定

六问都选了推荐项（统筹转来，#1632 评论 6537012814）。第 1～8 节的推荐因此就是做法，开发单照写。

| # | 裁定 |
| --- | --- |
| D1 | BL-711 不做回滚，从 PG-011 余项里删掉「回滚」；只做 Home 包就地升级（第 3 节）（用户 2026-10-30 弹窗决定） |
| D2 | BL-712 走甲：创作台用本机专属密钥签名，本人固定一次，之后照签名包装进 Home，S-80 不变（第 4 节）（用户 2026-10-30 弹窗决定） |
| D3 | BL-710 要做：Home 包对项目范围的动作逐项目、逐安装同意，可撤回（第 8 节）（用户 2026-10-30 弹窗决定） |
| D4 | BL-713 图标由包从平台命名图标集里选一个名字，不写就画 `package`（第 5 节）（用户 2026-10-30 弹窗决定） |
| D5 | BL-493 安装预览逐条列出 Agent 角色与方法的名字和正文开头；正文只当资料进上下文，不加权限（第 7 节）（用户 2026-10-30 弹窗决定） |
| D6 | 新声明写在 Manifest 里，只许名单内的几块，照集成包的先例（第 1 节）（用户 2026-10-30 弹窗决定） |
