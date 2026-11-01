# PG-011、PG-017 余项的设计稿

状态：设计稿，第 9 节六问用户 2026-10-30 已弹窗裁定、都选推荐项（第 10 节），二审（#1632 评论 6537279271）的四条必修与三审（评论 6537734731、6537969194）的两条必修由统筹裁定补进稿（第 11 节），T-140～T-145 与 T-149 按稿开单（T-139；方案 #1332 评论 6529582547，统筹 6529598304 批准）。行号在 main `cc138cf75` 上核过；只读了代码，没有构建，也没有跑测试。

## 为什么有这份稿

用户 2026-10-30 定：PG-011 与 PG-017 要等余项全部做完才收口（`privileges.md` 两格的余项）。余项有八项：

- PG-011：BL-710～BL-715；
- PG-017：BL-491、BL-493。

BL-715 由 T-138 直接做。其余七项在设计上都有没定的地方，有的要用户拍板。这份稿把它们写成开发单可以照着写任务书的形状，并把要问用户的整理成一次弹窗（第 9 节）。

起草时发现一个比余项本身更大的前提：**签名包的 Manifest 是固定形状**。所以 PG-017 已经给出的几项服务，真实的签名包其实用不上（第 1 节，BL-916）。

## 总表

| 节 | 项 | 开发单 | RAC | S | 依赖 |
| --- | --- | --- | --- | --- | --- |
| 1 | 签名包格式（BL-491、BL-493、BL-916 共用） | 由 T-142～T-144 落地 | 随各单 | 改 S-84 一句 | 第 10 节 D6 |
| 2 | BL-714 Home 实例的模型入口 | T-140 | RAC-2610～2614 | 扩 S-66、S-91 的分句 | T-134 |
| 3 | BL-711 Home 包就地升级（回滚不做，D1） | T-141 | RAC-2615～2619 | 改写 S-80、S-84 的分句 | T-134、T-140 |
| 4 | BL-712 创作台产物装进 Home | T-149 | RAC-2656～2658（统筹预留） | 无（D2 甲） | BL-377、BL-589 |
| 5 | BL-713 导航位置与图标 | T-142（档甲，包选图标）；T-401（档甲，页面通路与导航位置，从 T-142 拆出） | T-142：RAC-2620 的包选图标一半、2625、2653；T-401：RAC-2620 的到达页一半、2621～2624、2626 | 无 | T-138、#1576、#1552 |
| 6 | BL-491 模型设置与生图 | T-143 | RAC-2627～2635、2654、2655 | 扩 S-60；S-66、S-91 补分句 | 第 1 节、D6（不依赖 T-142） |
| 7 | BL-493 Agent 角色与方法正文 | T-144 | RAC-2636～2643 | S-105（统筹暂留） | T-143 先合 |
| 8 | BL-710 项目范围动作对 Home 包可达 | T-145 | RAC-2644～2649 | S-106（统筹暂留） | T-134、T-141 |

- S-105、S-106 是统筹给 BL-493、BL-710 暂留的号。开 T-144、T-145 时，统筹会再核 main 与在途的改动。S 号要连着排：前面的号如果还没落地，这两个可能顺延。S-103 已经给了 T-136，S-104 给了 T-134（连接钉，#1649）。
- BL-715 不在这份稿里，由 T-138 做。
- 二审后各单的 RAC 段在 RAC-2610～2649 这四十个号里重新分过；三审再按统筹的批示从 2650～2669 段里取 RAC-2653、RAC-2654、RAC-2655 三个号（RAC-2650～2652 是 T-147 的）。T-140～T-145 合计 43 个：T-140 五个、T-141 五个、T-142 三个号（RAC-2620 的包选图标一半、2625、2653）、T-401 六个号（RAC-2620 的到达页一半、2621～2624、2626；2620 一条两半，各归一单，拆分见第 5 节）、T-143 十一个（2627～2635、2654、2655）、T-144 八个、T-145 六个；T-149 另有统筹预留的 RAC-2656～2658 三个。每节「可检验」的条目都写了号，条数与号数一一对应。

## 1. 前提：签名包的格式（BL-491、BL-493、BL-916 共用，先定这个）

### 现状

- `apps/local-host/src/sandbox-package.ts` 的 `readSandboxPackage`（第 70～104 行）读五个文件：`manifest.json`、`plugin.mjs`、`contract.json`、`interface.json`、`prompts.json`（见 `docs/platform/PLUGIN-DEVELOPMENT.md`「沙箱包」）。prompts 至多 64 条，每条正文至多 8000 字。
- 第 99～102 行用 `sandboxPluginManifest(...)`（`apps/local-host/src/sandbox-plugin-manifest.ts` 第 31～46 行）重建清单，与包里的清单逐字段比较，有不同就以「清单不是沙箱插件的形状」拒绝。固定形状只有这几样：
  - `storage:private`；
  - 可选的 `projects:exist`——它不是包自己写的一块，而是由包的 `contract.json` 里的 `effects.projects` 派生（`sandbox-plugin-manifest.ts` 第 28、40 行）；
  - 路由 `studio.call`；
  - 一个不带 `icon` 的 stage 视图。
- 所以真实的签名包写不了 `model:read`、`model:invoke`、`model_configuration`、`image_generation`、`agent`、`methods`。PG-017 已经给出的服务里，至少 S-66（文字模型）是这样：`apps/local-host/src/home-plugin-executor.ts` 第 134 行已经对 Home 包调 `pluginModelFor`，但它要求 Manifest 里有 `model:read` 或 `model:invoke`（`apps/local-host/src/plugin-model-service.ts` 第 25 行）。这类服务的测试用的都是探针定义，不是装进来的包。这就是 **BL-916**。
- **并不止这几项**：`contract.json` 的 `effects`（`SandboxEffects`，`packages/contracts/src/platform/plugin-sandbox.ts` 第 24～66 行）已经有 `homeDatabase`、`connections`、`materials`、`ownerFiles`、`model`、`background`，而对应的 Manifest 声明（`databases.home`、`connections:use`、`materials:*`、`owner_files` 及其读写权限、`background_job`、`model:*`）固定形状一个都写不了。这些服务里包要自己起名字的（owner_files 的目录、库名、连接槽、来源域名）不是「加一个块」就能解决，见 BL-916 的范围（本节「S」之后）。
- **先例**：
  - 沙箱集成包（BL-530）是「固定部分 + 包给的块」的写法。`readSandboxIntegrationPackage`（`sandbox-package.ts` 第 129～168 行）：先用 `parsePluginManifest` 校验整份清单，逐块检查包写的 `connection_services`、`integrations`，交给 `sandboxIntegrationManifest`（`sandbox-plugin-manifest.ts` 第 64～77 行）重建，再逐字段比较；
  - 应用包的 `projects:exist` 是「由 `effects` 派生的权限行」的写法。
- **安装预览**（`apps/local-host/src/plugin-install-service.ts` 第 103～123 行）给出的不止三样：
  - `permissions`（`permissionViews`）；
  - `declarations`（`declarationsNeedingConsent`）；
  - `jobs`（`jobViews`）与顶层 `effects`（`pkg.permissions`，设置页「它的代码能做的事」读它，`apps/workbench/src/settings-plugins.ts` 第 194～195 行）；
  - 集成包的顶层可选字段 `origins`。
- `declarations` 是同意账本的条目：`PluginConsentKind` 只有四个值（`packages/contracts/src/platform/plugin-trust.ts` 第 18 行：`always_on`、`default_wiring`、`default_group`、`local_directory`），由 `assertConsentsDeclared` 校验，记进账本，声明一变就重新问。

### 做完是什么（统筹按二审裁定，第 11 节）

应用包的清单比对改成「固定部分逐字段相同 + 名单内的块」，名单分两类，**各块的校验和错误码各自独立**：

1. **由 `contract.json` 的 `effects` 派生的**（包只写 `effects`，宿主按它重建清单里的这一部分，包的清单与重建的有任何不同就拒，写法同 `projects:exist`；这样权限行与 `effects` 不会两处不一致）：
   - `effects.model`（`read`、`invoke`，已有）→ 清单里的 `model:read`、`model:invoke` 权限行；这是 BL-916 里模型一项的解法（第 6 节）；
   - 模型设置、生图两项：`SandboxEffects` 加新键，派生出清单里的 `model_configuration`、`image_generation` 两块与它们要的权限行。块里的名字一律由宿主按 `plugin_id` 派生，包不写（第 6 节）。
2. **包自己写的**，每块各自校验：
   - `agent` 与 `methods` 两块：都只收 `{ name, purpose, body }`，`body` 是包内资源文件的相对路径（第 7 节）。它们是简化形状，**不是** `AgentManifest` 的子集：读包时先把这两块取出来各自校验，由宿主派生成合同里的 `agent`、`methods`（`role_id`、`version`、`workspace`、`tools` 等必填字段都是宿主写的固定值），放进 `sandboxPluginManifest` 重建，再整份过 `parsePluginManifest`，最后与包里的清单比较；
   - `ui.views[0].icon`：取值必须在平台命名图标集里（第 5 节）。
- `sandboxPluginManifest` 的输入加这几个可选项。固定部分仍由宿主写，这个函数仍是写清单的唯一一处。
- 安装预览这样列出：
  - 模型一项走 `permissions`；模型设置、生图两项在顶层 `effects` 里多两个键，设置页「它的代码能做的事」跟着列出（改 contracts 的 `SandboxEffects`，要 `pnpm api:update`，T-143 的「做完」要算上）；
  - BL-493 加一个顶层可选的列表，推荐写成 `agent_bodies: [{ kind: "role" | "method", name, excerpt }]`，字段名在开发单里定；
  - `plugins.install.preview` 的输出形状因此改变，由 T-144 升到 `@4`。按 `docs/system/CONTRACT-CHANGES.md`，现在不留兼容期，旧版同时删掉。
- 可检验（RAC 号在各节）：
  - 写了名单内块的包能装；
  - 写了名单外字段的包仍以「清单不是沙箱插件的形状」拒绝；
  - 名单内的块写错了，以那一块自己的错误拒绝；
  - 预览列出新的权限行、`effects` 键与正文列表。

### 选项与推荐

| 要定的 | 选项 | 推荐与理由 |
| --- | --- | --- |
| 新声明写在哪 | ① Manifest 里允许名单内的可选块；② 另加包文件（如 `agent.json`） | **①**。这些声明本来就是 Manifest 的字段，SDK 的 Manifest 规则已经认得；`SANDBOX_NOT_GIVEN` 的判断也读 `definition.manifest.*`（`packages/plugin-sandbox/src/services.ts` 第 133～138 行）；集成包已经这样做。另起文件要再写一套解析，还要让它和 Manifest 保持一致。用户已定①（D6）。Agent 正文是包里的资源文件、Manifest 只引用它，不算 ② 的「另加声明文件」（第 7 节、第 11 节 R1） |
| 预览怎样列出 | ① 沿用 `declarations`；② `permissions` 加顶层可选字段 | **②**。新内容是安装时看一次的东西，不是对别处的改变要不要同意。塞进 `declarations` 要给 `PluginConsentKind` 加值、给账本加记录，等于平白多改一次合同。集成包的 `origins` 是先例。属于合同上的做法，不问用户 |
| 模型权限行怎么来 | ① 包写一块；② 由 `effects` 派生 | **②**。应用包的 `projects:exist` 已经是这样，改动更小，也不会让权限行与 `effects` 两处不一致 |
| 与 BL-589 的先后 | ① 先扩格式，BL-589 在后；② BL-589 先做 | **①**。BL-589 要把 `sandboxPluginManifest` 搬进 `plugin-sdk`，先扩格式再搬，同一个函数只改一遍 |

### S

改 S-84 的一句：安装确认要列出名单内的块，权限行与正文都要列。各块给出的服务按第 6、7 节分别处理。

### RAC 与依赖

- 不单独开单：T-142 落地图标，T-143 落地模型设置与生图两块，T-144 落地 `agent`、`methods`，RAC 在它们各自的号段里。T-142 与 T-143 各给 `sandboxPluginManifest` 加各自的输入项，彼此不依赖，谁先合谁先改参数形状，后合的在合并时解冲突；T-144 在 T-143 之后（同一处包格式，第 7 节）。
- **BL-916 只由 T-143、T-144 解决 model、agent、methods 三项**，装进来的真实包能调 `sdk.model.*` 的用例在 T-143（第 6 节）。**之后仍待**：`homeDatabase`、`connections`、`materials`、`ownerFiles`、`background`，需要固定 Manifest 能声明它们——这几项都要包自己起名字（owner_files 目录、库名、连接槽、来源域名），要沿用 `effects` 派生的做法并另写命名规则，另开开发单，BL-916 这一行不删（第 11 节 R3）。

## 2. BL-714 Home 实例的模型入口（T-140）

### 现状

包里的模型调用有两条路，这里要分开：

- **(a) `services.model`**：S-66，即 `sdk.model.*`。Home 执行器已经建它，真实包够不着的原因是 Manifest 写不了权限行。这归第 1 节与 BL-916，不在本节。
- **(b) `prompts.json` 走的动作 `model.generate@1`**：这是 BL-714 说的那条路。
  - 它由 `registerPlatformCapabilities` 注册（`apps/local-host/src/plugin-builder/catalog.ts` 第 44～57 行），`scope` 写死成 `'project'`，provider 是 `PLATFORM_PROVIDER_ID`。
  - 快照里只有一行：`tooling/gates/actions/host-actions.tsv` 的 `model.generate	1	plugin-platform`。
  - 只有项目的已装插件宿主注册它（`apps/local-host/src/installed-plugin-host.ts` 第 158 行）。第 147 行还要求调用者的 `project_id` 等于这个项目，否则以 `plugin.capability_denied`（「模型调用缺少当前项目的执行身份」）拒绝。
  - Home 的已装插件宿主（`apps/local-host/src/home-installed-plugins.ts`）不注册它，所以 Home 包的 `prompts.json` 调用被拒。
- **快照能不能有 Home 一行**：`scripts/gates/action-contract-snapshot.mjs` 第 198 行，宿主行的键是 `capability_id@version via provider`；第 273～275 行（`buildHostRows`），同一个键再出现一次而各列不同（比如 `scope`），就报「registered with two different declarations」。所以**同一个 provider 下不能有 Home 一行；另起一个 provider id 就可以**。先例是 Goals 的 `goals.planning.personal.*`：它在 Home 里以 `io.molis.work.goals.home` 注册（同一文件第 247～250 行的注释）。
- `registerPlatformCapabilities` 已经在 `actions.project_id === null` 时去掉 provider 的 `project_id`（`catalog.ts` 第 56 行），只差 `scope` 和 provider id。
- **注册表不让同 id 并存**（T-140 开工时核出，统筹 2026-10-31 裁定改采 ②，#1332 评论 6538644146）：`packages/kernel/src/index.ts` 第 52～54 行，条目的键是 `[capability_id, version, project_id|null]`，不含 provider；第 69～73 行的重叠检查是「同 id 同版本，且任何一边没有 project_id，或两边相同」。Home 的 provider 没有 project_id，所以和所有项目已登记的 `model.generate@1` 撞，开机即抛 `kernel.capability_duplicate`。快照的键（`capability@version via provider`）放得下，注册表放不下；Goals 的先例也不同：`goals.planning.personal.*` 是另一个 capability id，不是同 id 换 provider。放宽内核（让 `scope: home` 的无项目条目与项目条目并存）不选：一个能力只登记一次，页面、工作流、Agent、MCP 都从同一个目录拿，同一个 `id@version` 出两条，动作目录、MCP 工具名、工作流绑定、Agent 能力表里都会有同名的两项，正确性就靠查找顺序加 `scope` 拒绝，等于把命名问题变成内核里的歧义规则，还要碰共享核心。

### 做完是什么

- Home 实例用另一个能力 id `model.generate.home@1` 注册，provider 是 `plugin-platform.home`，`scope: "home"`；输入输出 schema、执行策略与说明取项目一半的同一份定义（`studioCapability("model.generate")`），不另抄。包里的调用不变：包写 `sdk.capability.call('model.generate', …)`，Home 的目录（`capabilityCatalog`）把这一条以包用的名字 `model.generate` 给出，另带 `registered_id: "model.generate.home"`，`catalogCapabilities.call` 按 `registered_id` 发动作。作者不知道有两个 id；包自己写 `model.generate.home` 在目录里找不到。**别名只在没有项目的目录里起**：不带项目的条目在每个项目的目录里都看得见，所以项目的目录（`capabilityCatalog`，有项目时）把 Home 一半整条拿掉，Home 一半登记时带 `availability`，有项目的调用者一律 `actions.scope_mismatch`。（与统筹答 T-140 的一点偏离：选 id 放在 Home 实例的目录视图，不放在 `plugin-model-service.ts` 一侧——包声明的依赖检查、费用、权限和调用五处都按包用的名字在目录里查，只在调用一处换 id 会让依赖检查找不到；注册表、动作目录、快照里始终是真名 `model.generate.home`。二审 6538985936 的必修 1 就出在这条别名没分范围。）
- 这个入口只认本 Home 实例的执行身份（调用者有 `plugin_install_id`、`project_id` 为空、安装属于这个 Home），分三层拦：动作服务的 `availability` 按范围拒有项目的调用者、项目的目录不列它、处理器核身份（网关 S-15 之后的一道）。指令只能按包自己登记的 id 点名（与 `createPluginModelPort` 的规则相同）。
- 计量与模型设置读 Home 的。它只读已有的模型设置与计量，不新建表，所以预计不用等干净重建批（#1578、#1549、#1588、#1587、#1589、#1591、#1593、#1552）。开发单开工时若发现要动 Home 插件库的 DDL，就等批落地（#1588 把 `home-plugin-store.ts` 的基线改成 v1）。
- 快照多一行 `model.generate.home@1 via plugin-platform.home`（`scope` 一列为 `home`），跑 `pnpm actions:update`。对调用方：新 id `model.generate.home@1` 在动作目录里以真名出现（项目的目录里也看得见，显示为不可用）；包作者继续写 `model.generate`；没有 Manifest、MCP 工具、工作流步骤或 Skill 提到它。
- 可检验（经包自己的代码和 Host 的目录走真实 Host、沙箱和模型替身；伪造的插件身份在网关 S-15 就被拒，到不了处理器，所以处理器自己的身份检查不单独钉，钉的是走得到的三层）：
  - RAC-2610（三例）：项目调用者调 Home 的 id 被拒——项目的目录里 `model.generate.home` 显示为不可用（`actions.scope_mismatch`），项目的包依赖它时调用被拒，模型没被问；Home 实例到不了项目一半——Home 的目录里只有 Home 的这一条，Home 包点名 `model.generate.home` 同样被拒；项目里装的包按 `model.generate` 问模型照常调通，用项目登记的指令（二审必修 1 的回归）；原写的「Home 实例调项目的 id 被拒」在别名设计下就是第二例：Home 实例用 `model.generate` 到的是 Home 一半，项目一半不在它的目录里；
  - RAC-2611：每个安装用自己登记的指令：两个 Home 包有同名指令时各自用各自的正文，只有另一个包登记的 id 被拒；
  - RAC-2612：点名未登记的指令被拒，模型没被问；
  - RAC-2613：停用后包的操作不再被提供，模型没被问，启用后恢复；
  - RAC-2614：Home 包的操作按 `model.generate` 这个名字问模型，用包自己登记的指令可以调通。

### 选项与推荐

| 选项 | 推荐与理由 |
| --- | --- |
| ① 同一个 `capability_id`，Home 用另一个 provider id | 原先的推荐；开工后核出注册表挡住（见现状），不可行 |
| ② 另起 id `model.generate.home@1`，目录按包用的名字给出（采用） | 不碰内核；包的代码不变，按运行范围选 id 由平台目录做 |
| ③ 同一个 provider 下 `scope` 跟着 registry 走 | 不行：快照门禁按第 273～275 行报错 |

统筹先采纳 ①，T-140 开工后核出注册表挡住，2026-10-31 改采 ②（统筹答 T-140，#1332 评论 6538644146），不问用户。

### S

扩 S-66（模型与指令：Home 实例的入口只认本实例的执行身份）与 S-91（Home 沙箱实例的身份与服务）的分句。不开新号。

### RAC 与依赖

- RAC-2610～2614，对应上面五条。
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
  - 范围被换被拒（bl628 的 D5，同一 plugin_id 的范围不能换）。
- 不做回滚（D1）：两个范围的回滚照旧被拒，`installed-plugin-lifecycle.ts` 的拒绝和钉住它的断言不动。
- 可检验：
  - RAC-2615：同一发布者的新版本装上，Home 包就地升级，批准、密钥、提示词登记随新版本换，数据保留；
  - RAC-2616：另一个发布者的同名包被拒；
  - RAC-2617：版本不更新被拒；
  - RAC-2618：范围被换（Home 的换成项目的）被拒；
  - RAC-2619：设置页的预览与 Home 行比对，说出「已装的是 x，装上后升级到 y；数据保留」。

### 选项与推荐（回滚，D1 定①）

| 选项 | 推荐与理由 |
| --- | --- |
| ① 不做回滚，从 PG-011 余项里删掉「回滚」二字（推荐） | Runtime 只回退代码、不回退数据。降级后的旧代码读新形状的数据，平台核不了 |
| ② 做，只回退代码，预览写明「数据不回退」 | 风险转给人，平台只能提示 |

### S

改写 S-80（Home 的签名包可就地升级）与 S-84（预览与 Home 行比对）的分句。不开新号。

### RAC 与依赖

- RAC-2615～2619，对应上面五条；改成断言新行为的四个已有用例（RAC-1505～1507、RAC-1683）不占新号。
- 依赖：T-134（同一文件）；T-140 先合，因为升级时提示词与模型入口要一起换，入口要先立起来；D1。

## 4. BL-712 创作台产物装进 Home（T-149）

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
  - RAC-2656：本机密钥没有固定时，产物装不进 Home；
  - RAC-2657：固定之后能装；
  - RAC-2658：别的 Home 的密钥签的包，在这里仍是未固定的发布者。

### S

- 甲：不开号，S-84 补一句「本机密钥也是一个固定的发布者」。
- 乙：要一个新号，统筹另给。

### RAC 与依赖

- 开发单 T-149，RAC-2656～2658（统筹预留，不在 T-140～T-145 的号里），对应上面三条。
- 依赖：D2；甲方案与 BL-589 共用「创作台发布出签名包」这一步，推荐排在 BL-589 之后，或与它合成一单。BL-377 的重做不必等。

## 5. BL-713 导航位置与图标（T-142、T-401）

**拆分**（统筹裁定，#1332 评论 6538786921）：本节分给两单。T-142 只做图标：SDK 的图标名单与校验（P1）、沙箱包的 stage 视图可以带 `icon`（P2）；页面通路与导航位置（P3：宿主给出运行中的 Home 包的导航数据、到达页与项目标题栏的工具位、包的页面与项目里的 stage）拆给 T-401。原因：Home 层的已装包没有 stage 的打开路径，P3 要新开宿主页面、stage 面和导航数据，不是把条目并进一个常量，体量和风险都与图标名单无关；拆开后图标这一半可以先合。下面「做完是什么」里的图标一条（D4）和 RAC-2625、2653、2620 的包选图标一半归 T-142，运行期数据通路、工具位、侧栏页签、三种状态和 RAC-2620 的到达页一半、2621～2624、2626 归 T-401。

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

- **运行期数据通路**（二审建议 F，统筹采纳）：到达页的 Home 工具位读的是 `renderHomePluginNavigation` 里对 `BUILTIN_PLUGIN_CATALOG` 常量的过滤（`apps/workbench/src/home-plugin-navigation.ts` 第 40 行，图标取 `navigator` 视图，第 43 行），侧栏页签读 `homePluginSideTabs` 里同一个常量的 `side` 视图（同文件第 7～11 行）。装进来的包不在这个常量里，stage 视图的图标本身到不了首页工具位。所以本单要新开一条运行期数据通路：宿主给出「运行中的 Home 包」的导航数据（名字、图标、视图），工作台把它并进上面两处。这是一个只给本人页面的读（动作或页面数据，形状在开发单里定，改 contracts 时跑 `pnpm api:update` 与 `pnpm actions:update`），不是改静态目录。因此本单从乙档改为**甲档**。
- 运行中的 Home 包进到达页的 Home 工具位，和构建期 Home 插件放在同一个固定位置，按名字排。
- **侧栏页签**（三审建议 K，统筹采纳）：固定形状只有一个 stage 视图（`sandbox-plugin-manifest.ts` 第 44 行），而侧栏页签只收 `slot === "side"` 的视图（`home-plugin-navigation.ts` 第 8 行）。所以只有 stage 视图的包**不出侧栏页签**：它从到达页的工具位打开，打开的就是它的 stage 视图；包格式本单不加 `side` 视图。
- 三种状态照构建期条目的画法：
  - 停用：不出现；
  - 恢复错误：出现，打开后是不可用页，原因取 T-138 给的 `recovery_error`；
  - 卸载：消失。
- **页面通路与数据**（T-401，已做；核对时发现沙箱包的视图没有 `workbench` surface，Home 一侧也没有框内页面，所以比原稿多一块）：
  - 包的 stage 与项目里的 agent 生成插件用同一份区块标记（`installed-stage-section.ts`）和同一个框内渲染器（`renderPluginDocumentShell`，installed 模式）；Home 一侧由 `plugin-builder/agent-surface.ts` 的 `renderHomePackageDocument` 出这个页面（放在这里，因为项目一侧的同类页面也在这个文件，且门禁数「内置插件包名在它自己的包之外被点名的文件」，新文件不许加），调用走 Home 自己的 `/api/plugins/<id>/call`，页面授权用既有的 `pluginPagesFor(home).open(id, null, 人)`，不新增路由路径、动作或合同；
  - `/plugins/<id>` 是 Home 插件页（返回、停用/启用按钮）里框一个 iframe，`?frame=workbench` 是框内页面本身；
  - `HomePluginHost.registered()` 末尾并入 `HomeInstalledPlugins.pages()`（在跑的，或没停用但没起来的、有 `recoveryErrors` 的；停用、隔离、卸载、集成包不在），所以 `/plugins/<id>`、项目页的 stage 与页面情境都认它；stage 的区块 id 就是插件 id，也是 Home 登记它用的键，所以 Dock 的名字、标签条的图标按这个 id 找到包的名字和它选的图标，与别的 Home 插件一样（真 Chrome 里看到过用构建号作 id 时 Dock 只显示 `app-…`，改了）；
  - 工具位的数据是 `HomePluginHost.navigation()`（按名字排）：到达页走 `ChooserArrival.home_plugins`，项目页走视图的 `home_plugin_nav`，都只在服务端渲染成 HTML，不进动作、MCP、工作流或插件能读到的任何输出；
  - **发布记录读不到的包**（包文件被搬走，`releaseFor` 为空）没有清单可画，不出现在工具位和页面里，只在插件管理里看到 T-138 的原因；
  - **只认当前被信任的发布者**：`pages()` 与停用、隔离、卸载一样，在发布者被撤销后不再列出该包（发布者撤销会把它的包停掉，原因写在插件管理里），所以工具位、`/plugins/<id>` 和项目里的 stage 同时消失；
  - **没起来的包**（恢复错误）：工具位照列，`/plugins/<id>` 是一页写出原因的页面，页面上没有「启用」按钮（它没被停用，按钮会误导）；`?frame=workbench` 不框它；
  - **Home 的工具位是本人的，不随项目隐藏**（#679）：项目页的工具位也列它，不因当前项目而变；
  - **进程刚启动时的第一个请求**：Home 在第一次被请求时才起来，包的页面可能就是第一个请求。`/plugins/<id>` 与 `?frame=workbench` 遇到没登记的键，先等 Home 起来再查一次（`ready()`），仍没有才是 404；实测到达时间：没有包 74 ms，有一个包第一个请求 185 ms，之后 7～12 ms；
  - **框内页面的安全头与项目一侧不同**：Home 一侧的框内页面带页面策略（`frame-ancestors 'self'`）和 `X-Frame-Options: SAMEORIGIN`；项目里 agent 插件的框内页面没有 CSP，只有 `X-Frame-Options: SAMEORIGIN`。两边的 `<iframe>` 标记都不写 `sandbox`，被隔离的是包自己的页面（沙箱里跑，页面授权是一次性的 `page_id`）；
  - **已知限制**：标签条上包的图标一律是 `package`（BL-912，要改页面脚本字节数）；发布者撤销与「在跑但不被信任」之间的瞬时窗口没有公开接口可测（`consentsChanged` 未导出），只有撤销之后的结果被断言（RAC-2622.1）；
- **图标**（D4）：
  - 包的 stage 视图允许带 `icon`，这是 §1 名单里「包自己写的」一块；
  - 取值只能是平台命名图标集里的名字（SDK 的 `PluginIconName`，`packages/plugin-sdk/src/ui/icon.ts`）；不写就画 `package`；
  - **在哪里拒、名单从哪来**（三审建议 J，统筹采纳）：SDK 的视图放置规则（`packages/plugin-sdk/src/view-placement-declarations.ts`，已有一条「icon 必须是图标名」，不是字符串或是空白时报它）里，字符串但不在名单里的再报「不在平台图标集里」，用 `else if`，一条消息不重复；错误码沿用视图所有问题共用的 `plugin.declaration_invalid`，不新增码。名字不在集合里，Manifest 读取（含签名和预览）当场拒绝，不靠 `sanitizeView` 静默丢弃。`PluginIconName` 现在只是类型（`packages/plugin-sdk/src/ui/icon.ts` 第 9～22 行），没有运行期名单；SDK 只依赖 contracts，不能引用 design-system 的 `registeredIconNames`（边界规则 `public-sdk-private-dependency`）。所以在 SDK 里加一份运行期的图标名数组，类型 `PluginIconName` 由它派生（design-system 的 `Record<PluginIconName, …>` 继续在编译期兜底），再加一条测试断言这份数组和 design-system 的图标集逐项相等，两边漂移就红（RAC-2653）。这是改 SDK，算共享核心，T-142 按共享核心跑测（全量由统筹在集成分支跑），并跑 `pnpm api:update`。
- 可检验：
  - RAC-2620：装一个 Home 包后，到达页的 Home 工具位有它，图标是包选的名字，没写就是 `package`（T-142：包选的图标进 Host 重建的清单、不写就没有 `icon` 键；T-401：到达页的工具位）；
  - RAC-2621（T-401）：只有 stage 视图的包不出侧栏页签，到达页的工具位有它，从那里打开的是它的 stage 视图；
  - RAC-2622（T-401）：停用后它从工具位消失；
  - RAC-2623（T-401）：恢复错误时它出现，打开后的不可用页写出原因（有清单可画的：见上面发布记录读不到的一条）；
  - RAC-2624（T-401）：卸载后消失；
  - RAC-2625（T-142）：写了图标集之外的名字，装包时以明确的错误码被拒，不画默认图标；
  - RAC-2626（T-401）：运行期导航数据只给本人的页面：agent、MCP、工作流的动作视图里没有它，插件没有宿主发的调用身份就看不到任何目录（S-15）；
  - T-401 二审后补的编号（同属上面八条，只是更细）：RAC-2620.1（区块标记与工具位的写法，Linux 上跑）、RAC-2621.1（进程刚启动的第一个请求）、RAC-2621.2（框内页面只给在跑的包）、RAC-2621.3（页面策略与不加 `sandbox`）、RAC-2621.4（没登记的键在第一个请求也是 404，Linux 上跑）、RAC-2622.1（发布者被撤销）；用到沙箱的在 `tests/home-plugin-stage-navigation.test.ts`（只在 macOS 上跑，因为签名的沙箱包只能在 macOS 装），不用包的在 `tests/home-plugin-stage-pages.test.ts`；
  - RAC-2653（T-142）：SDK 的运行期图标名数组与 design-system 的图标集逐项相等；

### 选项与推荐（图标，D4 定①）

| 选项 | 推荐与理由 |
| --- | --- |
| ① 包从平台的命名图标集里选一个名字（推荐） | 内置插件走的就是这条路，同等待遇；`sanitizeView` 已经只认这个集合；不带图片、不用清洗、不扩包文件 |
| ② 平台按插件名画字母徽标 | 要新写一种画法，内置插件不用它 |
| ③ 包带一张受限的图片 | 要扩包格式，还要清洗 SVG 或 PNG，多一个注入面 |

### S

无。包格式只多一个取值受限的字段，并在 SDK 的 Manifest 规则里校验。

### RAC 与依赖

- T-142：RAC-2620（包选图标一半）、2625、2653；T-401：RAC-2620（到达页一半）、2621～2624、2626。合起来仍是上面八条，2620 一条两半。
- 依赖：
  - T-138（同一套「个人空间里的插件」的说法与 `recovery_error`）；
  - #1576（T-126）与 #1552（都碰插件目录与沉浸外壳）合入；
  - D4。
- 档：T-142 甲（改 SDK，共享核心）；T-401 甲（新增运行期数据通路与宿主页面）。

## 6. BL-491 模型设置与生图（T-143）

### 现状

- 不给的表里有 `model_configuration` 一行（`packages/plugin-sandbox/src/services.ts` 第 133～134 行）：启动时以 `sandbox.service_not_given` 拒绝。
- `SANDBOX_SERVICE_FATE.imageGeneration` 是 `'entry'`（同一文件第 100 行）。
- pg017 片 §3.7 已经定了做法：生图只给命令、计量、base64 字节有上限。
- 同一片的「项目清理」要确认声明式清理对沙箱同样成立（RAC-239），但 main 上没有这条用例：`git grep RAC-239 -- tests` 无输出。
- `files` 一项已不用做：它在 PG-102 P2b 删了，主人文件（S-64）已给。
- 前提：包格式写不了这两项声明（第 1 节）。
- **这两项不是「读写一份 JSON 设置」**，它们各自要的声明：
  - 模型设置 `model_configuration`（`packages/contracts/src/platform/plugin-model-configuration.ts`）要：
    - `preference`：`store_name` 与 `file_name`，`store_name` 必须登记为本插件所有（`apps/local-host/src/model-configuration-entries.ts` 第 14～17 行，靠 `owner === plugin_id` 把关）；
    - `custom_provider`：`provider_id`、`display_name`，这个专用供应商全 Home 唯一；
    - `actions.read`、`actions.save`：必须指向本插件 `manifest.actions` 里唯一的一个动作，并且那个动作自己声明了权限（同文件第 27～34 行）；
    - 权限行 `storage:private`、`model:invoke`。
  - 生图 `image_generation`（`packages/plugin-sdk/src/service-declarations.ts` 第 58～63 行、`apps/local-host/src/plugin-image-generation-entries.ts` 第 13～17 行）要：`store_name`（同样要登记为本插件所有）和三个权限名（`read_permission`、`write_permission`、`generate_permission`），外加 `model:invoke`。
  - 固定 Manifest 没有 `actions`，`capabilities.provides` 为空（`sandbox-plugin-manifest.ts` 第 41 行）。
- **真正挡住装进来的包的，是 `givenService`**（三审必修 1，统筹采纳；上一版把拦路点写成了 `execution === "sandbox"` 的两处检查，是错的）：
  - `apps/local-host/src/plugin-declared-services.ts` 第 8～14 行的 `givenService`：Manifest 声明了 `model_configuration` 或 `image_generation`、而宿主没有把它「给」这个定义，就以 `plugin.declaration_invalid`（「不在宿主启动名单上的插件现在还没有模型设置」）拒启动。`home-plugin-executor.ts` 第 134～135 行调它；
  - 它拿到的「给」的值来自 `plugin-entry-identity.ts` 第 21～22 行的两张 `WeakMap`（`modelConfigurationFor`、`imageGenerationFor`），只有 `remember(启动名单)`（同文件第 37～42 行）会填它们，装进来的定义永远取到 `undefined`；
  - `model-configuration-entries.ts` 第 12 行与 `plugin-image-generation-entries.ts` 第 11 行的 `execution === "sandbox"` 拒绝，只在宿主启动名单（`home-plugins.ts` 第 191、200～201 行）上跑；装进来的包走的是 `home-installed-plugins.ts` 第 112～113 行的 `sandboxDeclaration`，不经过这两处。pg017 片的表也写着「声明只在宿主条目上，沙箱插件没有条目」。**这两处检查不动**：沙箱定义进不了启动名单，它们在名单上仍是有效的防线；
  - **第三处，在 `givenService` 之后**（三审必修，统筹采纳）：`plugin-image-generation-service.ts` 第 15 行 `pluginImageGenerationFor` 开头是 `if (!home || !declaration || definition.execution === "sandbox") return undefined;`。执行器（`home-plugin-executor.ts` 第 135 行）先过 `givenService`，再把结果交给它；对沙箱定义这一行直接返回 `undefined`，`services.imageGeneration` 为空。就算 `givenService` 与 `SANDBOX_SERVICE_FATE` 都改好，装进来的包也拿不到生图客户端。模型一侧没有这个问题：`plugin-model-service.ts` 第 23～29 行的 `pluginModelFor` 只看声明是否给了，不看 `execution`。
- 存储登记也落不到现有机制：Home 的登记表是静态的 `homeStores()` 加测试夹具（`home-side.ts` 第 86～98 行），不收装进来的包；装进来的包的库归属走账本（`installed-plugin-libraries.ts` 第 94～139 行，`holderOf` 防撞，卸载清理读同一张表）。
- **范围**：这两块的使用方只有 Home 执行器（`git grep` `apps/local-host/src` 核过）；`assertHomeOnlyDeclarations`（`plugin-declared-services.ts` 第 16～31 行）拒项目里（非双实例）的插件写这两块。
- **一个安全边界**：模型设置的 `save` 接受 `base_url`、`api_format`、`connection_id`（`plugin-model-configuration.ts` 第 7～12 行、`apps/local-host/src/model-configuration.ts` 第 49～53、85 行），会把本插件专用的供应商指到调用方给的地址；沙箱同时有 `sdk.model.complete`（S-66）。也就是说，如果放着不管，包能影响人的模型请求发往哪里，而联网来源本来是由人逐个批准的（S-93、S-95）。`assertTarget`（`model-configuration.ts` 第 79 行）挡到哪一步还没有核完。

### 做完是什么

- **范围（统筹裁定，第 11 节 R5）：T-143 只做 Home 的签名包。** `assertHomeOnlyDeclarations` 照旧拒绝项目范围的包写这两块；项目里要用这些数据走 BL-710 / T-145，不归本单。
- **名字归宿主，包不起**（防撞别的插件，也不用包去引用 `manifest.actions`）：
  - 包只在 `contract.json` 的 `effects` 里写意图：模型一项用已有的 `effects.model`，模型设置与生图是两个新键（形状在开发单里定，例如 `modelSettings: ['read','save']`、`imageGeneration: ['generate']`），`SandboxEffects` 因此加键，改 contracts，跑 `pnpm api:update`；
  - 宿主按 `plugin_id` 派生清单里这几处，`sandboxPluginManifest` 重建，包的清单与重建的不同就拒：
    - 权限行：`model:read`、`model:invoke`（BL-916 的模型一项，第 1 节）；
    - `model_configuration`：`preference.store_name`、`preference.file_name`、`custom_provider.provider_id` 都由 `plugin_id` 派生（取值规则在开发单里定，要满足现有的格式检查，并保证不同 `plugin_id` 得到不同的名字，也不会与静态登记表里的名字相撞）；`display_name` 取清单的 `name`；
    - `image_generation`：`store_name` 同样派生，三个权限名固定成平台起的名字（在开发单里定）。
- **`givenService` 怎样拿到派生出来的声明**（三审必修 1 的 a）：装进来的定义不走启动名单的 `WeakMap`，由安装记录加派生规则当场算。先例是 `plugin-database-entries.ts` 第 77～90 行的 `homeLibraryFor(definition, given, record)`：沙箱定义忽略名单绑定，用安装记录里的主人。做法：`pluginEntryIdentity` 给 `modelConfigurationFor`、`imageGenerationFor` 各加一个带安装记录的入口；执行器对沙箱定义把派生出来的声明交给 `givenService`；声明与按 `plugin_id` 重新派生的结果不相等就拒（`plugin.declaration_invalid`）。对不是沙箱、又不在启动名单上的定义，`givenService` 仍照旧拒绝。
- **归属记在哪**（三审必修 1 的 b）：派生出来的 `store_name`、专用供应商 id 的主人关系记在已装包的账本（`installed-plugin-libraries.ts`，沿 `holderOf` 防撞的做法，登记时与静态登记表和别的插件的名字比对），不进静态登记表；卸载清理读同一张账本。现在的账本表 `plugin_home_libraries` 是一个插件一行、一个库名（第 109～110、126 行），而 T-143 要给一个插件登记最多三个名字（偏好库名、专用供应商 id、生图库名），所以账本怎样加一类条目（同一张表加列，还是同一份账本文件里另开一张表）T-143 开工第一步写明，核不通就停下回统筹。`holderOf(name, reserved)`（第 101 行）现在只比静态登记表，开单时补上账本里别的行：派生出来的库名、供应商 id 也要与账本里已有的库名、供应商 id 互相防撞。`actions.read`、`actions.save` 怎么指同理：沿用现有的「指向 `manifest.actions` 的唯一动作」检查，还是为沙箱另写一条等价的派生检查（两个设置动作由宿主按 `plugin_id` 派生登记，权限用上面的权限行），也在第一步写明，核不通就停下回统筹，不自己换设计。
- **`pluginImageGenerationFor` 的沙箱分支**（`plugin-image-generation-service.ts` 第 15 行）：删掉 `definition.execution === "sandbox"` 这一项，改由 `givenService` 派生出来的声明决定有没有客户端（给了就建，没给就是 `undefined`，与 `pluginModelFor` 一致）。沙箱定义没有声明，本来就拿不到；声明是宿主按 `plugin_id` 派生的，所以这一行不再需要另外拦一次。
- **`SANDBOX_SERVICE_FATE`**：`imageGeneration` 从 `'entry'` 改成 `'given'`，NOT_GIVEN 的 `model_configuration` 一行删掉（`packages/plugin-sandbox/src/services.ts`）。
- **模型设置的 `save` 怎么限**（统筹裁定，第 11 节 R2）：沙箱包的 `save` **不许写 `base_url` 和 `connection_id`**（`api_format` 与指向自己的专用供应商也一并不许），只能在宿主已经批过、已经启用的供应商与模型里选（`provider_id`、`model_id`）。S-93、S-95 的来源审批因此不被绕开。T-143 开工**第一步**先核 `assertTarget` 对 `base_url` 与连接配对能挡到哪一步，结论写进 PR，并把每个被拒的字段写成一条拒绝用例。要给沙箱包自定义供应商，要走来源批准，另议、不在本单。
- 生图：只给命令，不给查询；照项目的计量；返回的 base64 字节设上限，数字在开发单里定，照 pg017 片 §3.7 的取法。
- **T-143 实际做法（2026-10-31，统筹裁定 A/B/C 之后）**：清单只带由 `effects` 派生的可选权限行，不带 `model_configuration`、`image_generation` 块（块写了仍被 `SANDBOX_NOT_GIVEN` 拒）；模型设置端口是宿主给 Home 包建的 `model.configuration`（不要 Manifest 动作），偏好存在 `<Home>/plugin-files/<安装>/.model-settings/`（不另开 Home 顶层目录，否则 Home 快照清单会拒；包的声明文件夹以字母数字开头，碰不到它），不记账本、不写 `.owner`；生图 namespace `imageconn-<32 位>`、专用供应商 `sbx-<32 位>` 由安装号 `install_id` 的 SHA-256 派生（与偏好文件、主人文件同一个键；二审改，原先按 `plugin_id`），两个前缀保留（`openInstalledPluginLibrary`、账本枚举的 `holderOf`、`pluginModelFor` 的 `custom_provider.provider_id`、`pluginImageGenerationFor` 的 `store_name` 各一条拒绝用例）；`bind`/`generate` 必须是已钉在同一来源的连接，不首次钉住；字节上限 4 张、合计 360 KiB（base64 约 480 KiB，在通道单次响应上限 1 MiB 的一半以内）。`action.permissions` 的语义是「调用者必须持有」，所以已登记动作的 `permissions` 写派生的权限名，调用者必须自己持有（二审改，原先的 `scoped` 副本会替调用者补上权限，已删；页面调用看这个安装的 grants 有没有覆盖动作的全部 `permissions`——人没批可选行时整个动作对人不可见，`draw` 这类操作也派生出 `model:invoke`；Agent、MCP、插件要有各自的授权），客户端仍查 Manifest 声明和人的授权。**接续状态**：原七条未执行 complete/query/generate，RAC-2628/2655 尚未验收；下列执行合同补齐真包链，不能用分层测试替代。
- **2026-10-31 接续执行合同（统筹 6549207475）**：包格式已经有经校验的 `prompts.json`，缺口是定义与 broker 未收到可信指令。仅已验证 `declared.kind === 'app'` 且 `runtime.scope === 'home'` 的包，把同一 release prompt 映射用于 `PluginDefinition.instructions` 与 broker extras（可信字段覆盖 extras）；project/trial/integration 不扩围，不改 SDK、包格式或拒绝规则。Home 登记统一原 installId scope，保持 source、正文、版本、state 一致；保留人的覆盖、停用/重启/卸载、失败补偿，不新增旧 scope 兼容。
- **RAC-2628 接续证明**：真实签名包从 preview/confirm/grants、动作目录、Runtime、Seatbelt、broker、生产 model client 到 HostCompleteText 接缝；接缝执行 beforeDispatch。精确断言正文/data、人的覆盖、未知指令、合法 query 调 complete 和缺 caller 权限拒绝、等待中撤权/停用后不写业务记录；同安装只有一份声明，停用重开仍停用、卸载重开不复活，有 prompts 的失败安装清声明。首红须是 instruction_unknown，不能用编译/夹具失败代替。
- **2026-10-31 生命周期补修（统筹接受 T-143 工单）**：真实 complete 到达 Host 后，旧 broker 正常 RPC dispose 中止了 Runtime held-result 保存的 request signal，导致后续存储与动作返回被误拒。仅 `broker.ts` 的 `model.complete` 增加可解除的取消转发，持续至 invoke 最终检查退出，在 finally 内同步解绑再 dispose；真实 timeout/cancel 保留原 reason，原 caller/grant/active/Host binding 和 held-result 检查不改。RAC-2628 补正常与普通失败可提交、在途取消/超时、模型已返回但 exit guard 等待的真实超时，以及 RPC 结束后取消/撤权仍拒绝写入；不改 Runtime、SDK、runner、生产时限或公开合同。
- **RAC-2655 接续证明**：真实签名包 bind→inspect→generate 经共享 Prologue 到独立 HTTPS 假厂商；临时 CA、精确 SAN、进程内 exact DNS（promises 与 callback 两路均命中），未知外部名拒绝。未信任 CA 与错误 SAN 各自因真实 TLS 失败且 HTTP=0；正确证书正面核一次 POST、独立图片 bytes、revision、metered。保持生产 TLS/来源/pin/权限；不 mock fetch、不更换 inference、不使用真实凭据。全部在临时系统 HOME/config/cache 与 Molis Home、file SecretStore、ad-hoc 构建和公共槽中完成，完整文件 jobs1/retries0；原七条数量不再是验收标准。本机不跑 Full，最终准确头 Full、独立验证和用户验收分开记录。
- 补 RAC-239 的用例（沿用原号，不占新号）：删项目时，平台按安装与声明清掉沙箱插件的数据，沙箱插件不用交 `purge` 函数。这是项目数据的清理，与下面的卸载是两件事，别并在一起。
- **卸载**（含保留数据与否）时，账本里的归属行与专用供应商登记一并清掉；偏好文件和生图存储按「保留数据」的选择去留。删项目不清它们：这两项是 Home 实例专有的，数据在 Home，不是项目的。
- 预览：模型一项列在 `permissions`，模型设置与生图列在顶层 `effects` 的新键里（第 1 节）。
- 可检验（除标明的，都断言「拒绝」）：
  - RAC-2627：包的清单与按 `effects` 重建的不同（多一块、少一块、名字不同）被拒；预览列出新的权限行与 `effects` 键（这一条不是拒绝）；
  - RAC-2628：装进来的真实签名包能调 `sdk.model.*`（BL-916 的模型一项；不是拒绝）；
  - RAC-2629：模型设置经 broker 读、写，`save` 只收 `provider_id`、`model_id`（不是拒绝）；
  - RAC-2630：`save` 里写 `base_url`、`connection_id`、`api_format` 或自己的专用供应商被拒，设置不变；
  - RAC-2631：专用供应商与存储名由 `plugin_id` 派生，别的安装读不到这份设置，也撞不到别的插件的名字；
  - RAC-2632：没写生图的包调生图被拒；在查询里调生图被拒；
  - RAC-2633：返回超过字节上限被拒；生图计量照项目；
  - RAC-2634：装进来的包的声明交给 `givenService` 时，声明与按 `plugin_id` 派生的结果对不上被拒；不是沙箱又不在启动名单上的定义仍被 `givenService` 拒（真实签名包经这条路能启动，是这一条的正面用例）；
  - RAC-2635：卸载（保留数据或不保留）时，账本里的归属行与专用供应商登记一并清掉；
  - RAC-2654：项目范围的包写 `model_configuration` 或 `image_generation` 仍被 `assertHomeOnlyDeclarations` 拒；
  - RAC-2655：装进来的真实签名包调生图的 `generate` 成功（正面用例，不是拒绝）：经 `givenService` 与 `pluginImageGenerationFor` 拿到客户端，返回照上限与计量。

### 选项与推荐

| 要定的 | 选项 | 推荐与理由 |
| --- | --- | --- |
| S 号 | ① 扩 S-60；② 新开一个号 | **①**。它是「沙箱经 broker 用宿主服务」这条总规则下的又一项服务，与 S-66 同类。统筹已采纳 |
| 名字谁起 | ① 包写，宿主校验；② 宿主按 `plugin_id` 派生 | **②**（统筹裁定 R2）。包写就要自己防撞，还要核登记；派生一次定死 |
| 范围 | ① 只 Home 的签名包；② 项目范围也给 | **①**（统筹裁定 R5）。项目一侧要新开通路；项目数据走 BL-710 / T-145 |
| 上限与计量 | — | 不问用户，照 pg017 片 §3.7 写进开发单 |

### S

- 扩 S-60（broker 转模型设置与生图）；
- S-66 补一句「模型设置可经 broker 读写，沙箱的 `save` 不许写 `base_url`、`connection_id`」；
- S-91 补一句「Home 沙箱实例同样适用」。

### RAC 与依赖

- RAC-2627～2635、RAC-2654、RAC-2655，对应上面十一条。
- 依赖：第 1 节的格式扩展（本单落地其中的模型、模型设置、生图三块）、D6。**不依赖 T-142**：两单各给 `sandboxPluginManifest` 加各自的输入项（第 1 节）。
- 档：甲（改 contracts 的 `SandboxEffects`、预览形状、安全边界）。

## 7. BL-493 Agent 角色与方法正文（T-144）

用词照 `docs/system/GLOSSARY.md`：「Agent 角色」「方法 / Skill」，不写 Character（Character 是人的工作方式，不是插件带的东西）。

### 现状

- 不给的表里有 `agent` 一行（`services.ts` 第 137～138 行）：definition 只要带了 `methods`、`agent_prompts`、`agent_skills`、`manifest.agent` 之一，启动就被拒。
- pg017 片 §3.2 写「角色与方法正文先不给」（§6 Q2），理由是安装确认列不出它们。原来等的 PG-001（一条安装路，S-84、S-85）已经做完，这个前提已经满足。
- 包里现在只有 `prompts.json`：至多 64 条，每条正文至多 8000 字。它们登记成 `model.generate` 用的指令，不是给别的 Agent 的角色或方法。
- **合同写明正文不在 Manifest 里**：`packages/contracts/src/platform/plugin-agent.ts` 第 85 行「Prompt bodies live in the Plugin package, never in the Manifest」；Manifest 的 `agent`、`methods` 只有声明，正文在定义的 `agent_prompts`、`agent_skills`、`methods` 上（`packages/plugin-sandbox/src/services.ts` 第 85～86 行、`packages/contracts/src/platform/plugin.ts` 第 167～182 行）。
- **`agent` 整块里有带权限的字段，不是文字**（二审必修 1）：角色的 `execution`（`workspace-write`、`operate`）和 `host_tools`（`plugin-agent.ts` 第 33～52 行），以及 `subagents`、`mcp`、`characters`、`text_sources`、`directory_input_port`（同文件第 174～195 行）。合同自己说方法是文字、不授予东西（同文件第 26～31 行），角色不是。

### 做完是什么（统筹裁定，第 11 节 R1）

- **声明在 Manifest 里，正文在包里**：
  - D6 管的是**声明**：声明写在 Manifest 的名单内的块里；
  - 正文是包里的资源文件（包格式的文件名单多一个目录，例如 `agent/`，每条一个文件），Manifest 的块只用包内相对路径引用它；这与合同「正文在包里，不在 Manifest」一致，也不算 D6 被拒的「另加单独的声明文件」，不用再问用户；
  - 条数与字数上限照 `prompts.json` 的口径（至多 64 条、每条 8000 字），在开发单里定；路径必须在包内、不许越界。
- **`agent` 与 `methods` 两块都只收 `{ name, purpose, body }`**（三审建议 L，统筹采纳）：`body` 是包内资源文件的相对路径。它们是简化形状，**不是** `AgentManifest` 的子集，所以包里写不了任何带权限的字段：`execution`、`host_tools`、`subagents`、`mcp`、`characters`、`text_sources`、`directory_input_port`（`agent` 一侧），`tools`（`AgentSkillDeclaration.tools`，`plugin-agent.ts` 第 126～132 行，`methods` 一侧），多出名字、用途、正文引用以外的任何键都以明确的错误码拒绝，这就是 D5 的「不加权限」。
- **宿主派生的形状与真实用法**：`agent`、`methods` 各收 `{ name, purpose, body }` 的可选数组，合计至多 64 条；`body` 引用包内资源，正文至多 8000 个 UTF-16 单元。宿主派生角色的 `roles`、`prompts` 与顶层 `methods`，不复制到 `agent.skills`、`agent_skills`；`workspace` 固定为 `none`，顶层方法 `tools` 固定为空数组，`host_tools`、`execution` 等一律不写。角色资料和方法都以有来源材料供消费者选择、读取，UI 区分两种 kind；携带角色正文不获得 Agent 执行入口、不增加 `agent:run`、目录、MCP 或子 Agent 权限。角色不能只登记而没有实际取材路径。
- **正文的精确版本**：完整包 SemVer 复用 `AgentDefinitionSource.plugin_version`，与发布者签名身份、`plugin_id`、kind、条目 id 组成默认正文引用，不另建版本字段或版本计数器。派生 Agent 声明里的数字 1 仅为该投影内部占位，不改变公共 Agent 数字版本含义；签名正文的精确读取、覆盖默认更新提示、历史和采用记录均认完整来源引用。角色 prompt 沿用现有人的覆盖，实际正文标 `effective` 与 `user_revision`，不把人的改文称为发布者签名原文；顶层方法不新增编辑功能。
- **派生 id 与校验**：同一 SDK 函数以 `plugin_id`、kind、完整 name 的确定编码做完整 SHA-256，保留原名称作显示，既不截短名称也不截短摘要；不同 plugin/kind 的同名不得混用。对外引用必须满足现有 200 长度的消费合同，名字与用途按 UTF-16 单元限 80/300。原 wire Manifest 与签名文件保持原样验证，完整运行 Manifest 由宿主派生后校验，两种形状不直接作整份相等比较。
- **登记与恢复**：旧 prompts.json 指令、新角色和顶层方法由同一个完整 registration 组装函数提供，执行器及 Home/项目安装启停回调使用同一安装 scope，回调不能再以仅 prompts 的登记覆盖它。覆盖/history/uses 的签名默认来源引用由既有 AgentDefinitions owner 持久保存；重启继续使用当前来源和人的有效修订，不另建正文目录或身份账本。
- 安装预览逐条列出 kind、名字与正文前 200 个 Unicode 码点；`plugins.install.preview` 升到 `@4`，加顶层可选 `agent_bodies`。升级按全文比较并标新增、变化、移除，不能因开头相同漏报正文变化。
- 正文按提示注入面处理，对照 `docs/system/SECURITY-INVARIANTS.md` 里提示注入的几行：
  - 名字、用途、目录摘要和正文都只作带固定不可信声明的 JSON 数据进入消费者上下文，保留真实插件、完整版本、发布者及有效用户修订，不进入系统提示或工具定义；
  - 不升级权限：Agent 用这段正文时，调用的仍是它自己被授权的动作；
  - 读取按当前工作范围关联实际安装/世代与签名来源，旧引用失效就拒绝，不悄悄换最新正文；send 到实际 handoff、运行中 input deliver、按需工具读取的最后副作用检查各复核本次来源；失效后不新增正文交付或采用成功记录；
  - 已有效交付的资料保留为该轮历史，不声称能从模型撤回，不因源插件撤销新增跨插件整轮取消；新读取、新注入再核当前来源；
  - 升级后正文换了，预览里要能看出来；项目升级按已有链验证，Home 就地升级不借用未采纳的 T-141。
- 删掉 NOT_GIVEN 的 `agent` 一行。
- 可检验：
  - RAC-2636：名单内的 `agent`、`methods` 能装且可实际取材，混合旧 prompts.json 的包在全部安装/启停回调、重启及失败恢复后仍保有完整登记；最大长度中文/代理对名称能列出、选择和读取，同名跨 kind/plugin 不混用（不是拒绝）；
  - RAC-2637：名单外的键**每个一例**被拒：`agent` 一侧的 `execution`、`host_tools`、`subagents`、`mcp`、`characters`、`text_sources`、`directory_input_port`，`methods` 一侧的 `tools`；
  - RAC-2638：正文引用不是包内相对路径（绝对路径、`..`、缺文件）被拒；
  - RAC-2639：超过条数或字数上限的包被拒；
  - RAC-2640：预览列出每一条的名字与正文开头（不是拒绝）；
  - RAC-2641：显式选择和按需读取的实际模型输入都有完整签名来源，角色人的覆盖带 effective/user_revision，名字、用途与正文均在数据中，伪标记不能逃出字符串（不是拒绝）；
  - RAC-2642：正文要求未授权动作/目录访问仍被代码拒绝；已读正文但尚未实际 handoff、input deliver 和工具最后检查时取消/停用/撤销/换安装，均不交付迟到正文、不记无效采用或执行副作用；有效交付后的历史保留，不新增整轮取消；
  - RAC-2643：包升级后包括第 200 字以后的变化也可在预览辨认；确认前仍旧正文，失败恢复不泄漏新正文；完整包版本 1.1.0→1.2.0 的角色覆盖/history/default_updated/reset/uses 经重启保持准确，旧引用不自动换版（不是拒绝）。

### 选项与推荐（正文怎样给，D5 定①）

| 选项 | 推荐与理由 |
| --- | --- |
| ① 预览逐条列出名字与正文前 N 字，正文只作数据进上下文、带来源标记，不升级权限（推荐） | 和内置插件、宿主里的第三方插件同等待遇，人在安装时看得到 |
| ② 只给名字与用途，正文由平台模板生成 | 注入面小，但插件写不了自己的方法，等于不给 |

### S

S-105（统筹暂留）：签名包带进来的 Agent 角色与方法正文只作数据、带来源、不升级权限；包的 `agent` 块只收名字、用途、正文引用，带权限的字段安装时拒。开 T-144 时统筹再核号。

### RAC 与依赖

- RAC-2636～2643，对应上面八条。
- 依赖：T-143 先合（同一处包格式）、D5、D6。

## 8. BL-710 项目范围动作对 Home 包可达（T-145）

### 现状

- bl628 D2：Home 实例没有项目，沙箱不继承内置 Home 插件的 `PROJECT_REACH_PERMISSION`（值是 `projects:reach`；`packages/plugin-runtime/src/action-provider.ts` 第 9 行、第 49 行）。
- 钉住它的是 RAC-967：`tests/security-invariants-sandbox-home-instance.test.ts` 第 100 行。
- 同意账本 `HomeConsentLedger`（`apps/local-host/src/home-plugin-store.ts` 第 70 行）的 `PluginConsentKind` 只有四个值，没有可以直接用的。

### 做完是什么

- **谁同意、在哪里同意**：本人，在某个项目的设置里，对某一个 Home 包同意「它可以读写这个项目」。一次同意只对这一个项目、这一个安装有效。
- **存在哪**：同意账本加一个值（推荐叫 `project_reach`），主体写成「项目 id + 安装 id」。这是改合同：`PluginConsentKind` 加值，有关动作的形状变了就升版本，照 `docs/system/CONTRACT-CHANGES.md`。
- **怎样撤回**：同一处设置可以撤回；卸载这个包、删这个项目，都一并撤掉。
- **调用时怎样查，项目从哪来**（二审建议 G）：
  - Home 实例自己没有项目，它的调用者上下文里 `project_id` 是 `null`（`apps/local-host/src/home-plugin-executor.ts` 第 130 行）；
  - 所以检查的项目是**触发这次调用的那个项目**：包的动作是从某个项目的页面或 Agent 里调进 Home 的（RAC-968 的可达集合就是按项目算的），这个项目取自**外层调用的上下文**，从包的输入里读不到；
  - 没有触发项目的调用（后台作业、Home 自己发起）调项目范围的动作一律拒；
  - 每次调用都查账本里有没有「这个项目 + 这个安装」的同意，并照常检查世代与生命周期；
  - T-145 开工第一步核：包发出的下行调用确实带着外层的触发项目，核不到就停下回统筹。
- **同意在包就地升级后**：沿用同一个安装 id，同意照旧；新版本声明的可达动作变多时重新问（沿用 S-84「声明一变就重新问」的规则）。依赖 T-141。
- **删项目时**：清这个项目的所有同意，走 `ProjectDeletionService`（`AGENTS.md`「硬约束」），不另写删除入口。
- 可检验：
  - RAC-2644：没同意时仍拒（RAC-967 改成这样断言）；
  - RAC-2645：本人对某个项目同意之后可达；
  - RAC-2646：撤回之后再拒；
  - RAC-2647：别的项目仍拒（同意只对这一个项目、这一个安装有效）；
  - RAC-2648：卸载这个包、删这个项目，同意一并清掉；没有触发项目的调用仍拒；
  - RAC-2649：就地升级后同意沿用，新版本声明的可达动作变多时重新问。

### 选项与推荐（给不给，D3 定①）

| 选项 | 推荐与理由 |
| --- | --- |
| ① 逐项目、逐安装同意，可撤回（推荐） | 用户 10-30 要求余项都做完；按项目给，范围最小 |
| ② 不做，从余项里删掉 | 维持 bl628 D2；Home 包只用自己的 Home 数据 |

### S

S-106（统筹暂留）：Home 沙箱包只在本人对某个项目同意之后才能调那个项目的动作，同意按项目、按安装记，可撤回。开 T-145 时统筹再核号。

### RAC 与依赖

- RAC-2644～2649，对应上面六条。
- 依赖：D3；T-134、T-141（同一文件 `home-installed-plugins.ts` 与升级路径）。

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

## 11. 二审后的统筹裁定

二审（#1632 评论 6537279271）要改的四条必修，统筹 2026-10-30 裁定如下（R1～R4）；这些是统筹按现有合同与用户已定的 D1～D6 做的取舍，不是新的用户决定。

| # | 裁定 |
| --- | --- |
| R1 | **T-144 的 Agent 正文放在包里的资源文件，Manifest 块只引用它**：D6 管的是声明；正文与合同「正文在包里，不在 Manifest」一致，不算 D6 被拒的「另加声明文件」，不再问用户。`agent` 块的名单只收名字、用途、正文引用；`execution`、`host_tools`、`subagents`、`mcp`、`characters` 这类带权限的字段安装时一律拒，这就是 D5 的「不加权限」；T-144 的验收里每个被拒字段一例（第 7 节） |
| R2 | **T-143 的沙箱模型设置**：把真实需要的东西写进稿（存储登记、专用供应商 id、动作指向、生图的存储与三个权限名、两处 `execution === "sandbox"` 的启动拒绝怎么改，第 6 节）；沙箱包的 `save` **不许写 `base_url` 和 `connection_id`**，只能写宿主批过的值，S-93、S-95 的来源审批不被绕开；`assertTarget` 能挡到哪一步，T-143 开工第一步先核，写成拒绝用例。其中「两处 `execution === "sandbox"` 的启动拒绝」一句，三审已更正为 `givenService`，见 R5 |
| R3 | **BL-916 只写 T-143、T-144 真正覆盖的部分**：model、agent、methods。`homeDatabase`、`connections`、`materials`、`ownerFiles`、`background` 仍留在 BL-916，写明「T-143/T-144 之后仍待……，需要固定 Manifest 能声明它们」；这一行不删（第 1 节、BACKLOG） |
| R4 | **图标的拒绝落在 SDK 的 Manifest 规则里**：名字不在平台图标集里，安装时就以明确的错误码拒，不靠 `sanitizeView` 静默丢弃；图标字段进 §1 名单；这条归 T-142，T-142 按二审建议 F 重定范围：已装包的导航与侧栏数据需要运行时路径，不能靠静态目录，因此改为甲档（第 5 节） |

二审的建议 A～E、G～I 都已照做：A 行号改为 273～275；B 把 bl628 的 D5 写明；C BL-712 统一写 T-149；D 预览不止三样、`effects` 新键要改 contracts，已算进 T-143；E 权限行由 `effects` 派生；G 补了 T-145 的项目来源、升级后沿用、删项目清同意与依赖；H 各节「可检验」逐条带 RAC 号；I 更新了 PR 正文。

三审（#1632 评论 6537734731，增量二审）又要改一条必修，统筹同日裁定如下，并采纳其中的建议 J～P；三审的增量（评论 6537969194）再要一条必修与建议 Q～S，也已照做（R6）：

| # | 裁定 |
| --- | --- |
| R5 | **T-143 的拦路点是 `givenService`，不是 `execution === "sandbox"` 的两处启动检查**：签名包不走那两处，真正挡住它的是 `plugin-declared-services.ts` 第 8～14 行的 `givenService`（`plugin-entry-identity.ts` 只为开机名单建表）。第 6 节写清 `givenService` 怎样拿到派生出来的声明（照 `homeLibraryFor` 的先例，`plugin-database-entries.ts` 第 77～90 行），主人关系记在已装包的账本（`installed-plugin-libraries.ts`），不用静态登记表；RAC-2634 对准 `givenService`。**T-143 只做 Home 的签名包**，`assertHomeOnlyDeclarations` 照旧拒项目范围，项目数据走 BL-710 / T-145 |

建议的采纳（统筹同日裁定）：

- J：SDK 里加一份运行期图标名数组、类型由它派生，加测试断言它与 design-system 的图标集逐项相等（RAC-2653）；校验放在 SDK 的 Manifest 规则里，T-142 按共享核心跑测（第 5 节）；
- K：只有 stage 视图的包不出侧栏页签，写成可检验的一条（RAC-2621，第 5 节）；
- L：`agent`、`methods` 两块都只收 `{ name, purpose, body }`，是简化形状，不是 `AgentManifest` 的子集（第 1、7 节）；
- M：删掉 T-143 的「删项目」，只留卸载（第 6 节，RAC-2635）；
- N：T-143 不依赖 T-142，汇总表与各节改成一致；
- O：PR 正文如实写 `privileges.md` 的 PG-011 格有改动；
- P：BL-710、711、714 补上 RAC 段，BL-916 的开发单列写 T-143、T-144；新增的号取 RAC-2653、RAC-2654（统筹的 2650～2669 段，RAC-2650～2652 是 T-147 的）。

| # | 裁定 |
| --- | --- |
| R6 | **生图在 `givenService` 之后还有第三道沙箱拒绝**：`plugin-image-generation-service.ts` 第 15 行的 `definition.execution === "sandbox"`。T-143 的「现状」列出它，「做完」写明 `pluginImageGenerationFor` 的这个分支怎么改（删掉，改由派生声明决定），并补一条生图的正面用例 RAC-2655 |

Q～S（统筹同日裁定，已照做）：Q 把依赖说法统一为「T-142 与 T-143 彼此不依赖，T-144 在 T-143 之后」；R 账本一个插件一行一个库名，T-143 要登记最多三个名字，开单第一步写明账本形状，`holderOf` 补上与账本里别的行的防撞；S T-149 的三条验收用统筹预留的 RAC-2656～2658。
