# ac-artifacts：成果库去插件身份，成为平台事实的主人（设计稿）

状态：设计稿已审定，A1、A2a（客户端与 owner 操作）已随 batch-27 落地；A2b（动作处理器、浏览、导入、原件存取、项目引用、目标引用搬进 `modules/artifacts`，宿主停止 import 成果库插件包）2026-10-24 开发完成，等评审。A3（PG-064、PG-079、PG-077：成果类型登记表搬进宿主并读有效安装的 Manifest，`consumes[].file`，Goals 链接种类 `artifacts.links`，安装时拒重复属主，宿主这一层拒装上的产出者写未声明的类型）2026-10-25 开发完成，在分支 `anticorr/ac-artifacts-a3`，RAC-415～421；§5.1 的 S-69.1、S-70.4 暂记为 S-75，S-70.2、S-70.3 暂记为 S-76（S-69、S-70 已被连接扩展占用，合入时由统筹核号）。A3 之后的实现片要等 ac-registry 的 PG-024 片。

A2b 的取舍（受「插件不能 import 模块」限制，插件在 A6 删除前仍要自己的 Manifest 与登记）：模块持有完整的 `artifact-actions.ts`（动作清单加处理器）、`artifact-provider.ts`（`ARTIFACTS_PROVIDER`：id、名称、版本、签名）及其依赖；插件只留动作清单（`actions.ts`）、`browser-view.ts`（页面视图类型与版本路径）、Home 存储登记与项目删除清理（`original-store.ts`）和界面。两份清单与提供方字段由 `tests/plugin-artifact-schemas.test.ts` 对照（RAC-414），A6 删插件时重复随之消失。

A2b 一轮修复合同（FIX6，2026-10-24，首评 `6390053800`）：只收齐本轮四项有效意见，原 FIRST 结论保留。S-55 的 `originalFileOf` 引用改指模块现址，HOME-DATA 对应行改用现行 `openArtifactOriginal`。全仓核对模块新增的 `artifactsProjectData`、`purgeArtifactOriginals` 只有本测试的 label 对照，没有生产消费者，删除这两项声明及出口；项目删除继续由插件已登记的 `artifactsProjectData.purge` 执行，不提前做 A6。模块的 `consumerTypes` 合入已有 `plugin-action-schemas.ts`，动作处理器复用它，删除第三份 schema 文件。

- **RAC-413（补充）**：宿主 `src/` 的 TypeScript 导入检查递归到所有子目录；不新增或修改门禁规则、阈值。模块与插件的公共 schema（含 `consumerTypes`）继续相等。
- **RAC-414（补充）**：临时 Home 中，以包含 `.` 的非空合法项目 id 经模块 `storeArtifactOriginal` 写入非空原件，核对实际文件和字节，再经插件真实删除声明清理；实际原件目录消失，另一项目的原件仍可读。17 个动作、消费者 schema、提供方与存储声明的原有对照保留。
- **范围与验证**：仅相关模块文件、原 schema 回归、两处精确文档引用和本稿；不改其他合同、Host 搬移、C2 stdio argv、真实 Home 或后续片。整体 `pnpm build` 走公共单槽，之后跑模块 README 与本题影响用例、真实 merge-base health、boundary、动作快照、资源及推前 fetch/secrets。原作者 123 文件首败和未跑三份浏览器的说法交 TEST 按风险核证据，本题不重跑该全集或另起 full；shared-core、assembly、spans-packages 的整合全量仍交 Claude 唯一组批。

验收编号：RAC-410～429。待办号：BL-575～584。安全不变量先写 S-69、S-70（main 现最大 S-58，在途到 S-68），合入时由统筹核连续。管 `privileges.md` 的 PG-077、PG-078、PG-079、PG-096、PG-097、PG-107；与 PG-060（W5-06）、PG-085（Characters 进 `modules/characters`）、PG-090、PG-001（ac-trust 的提供方身份）的衔接写在 §3.9。本片不改 `privileges.md` 状态列。

方向来自统筹 2026-10-23「成果库去插件身份，平台事实一族」和用户 2026-10-18「插件不分官方、个人、创作台生成还是第三方，待遇一样」：成果库不是一个恰好内置的插件，而是平台的一项事实（每个项目都有、人要留存和引用的固定版本）；别的插件和它的关系，只靠自己 Manifest 里的声明。

## 1. 要解决什么

下表按 `origin/main`（`8aa62a65b`）核对。行号以 main 为准，实现片开工先重核。

| 现状 | 位置 | 问题 |
| --- | --- | --- |
| 成果库以插件身份登记：Manifest `io.molis.work.artifacts`，17 个动作的提供方都是它，有目录条目 | `plugins/native/artifacts/src/manifest.ts`、`tooling/gates/actions/actions.tsv` | 平台事实借插件的壳；换壳之前，宿主一直要从插件包里取动作定义和类型 |
| 宿主十来个文件 import 成果库插件包 | `apps/local-host/src/artifact-actions.ts:15,19-53`、`artifact-native-plugin-http.ts:83-133`、`plugin-host-services.ts:15,83` | 宿主为一个具名插件开私路（10-18 待遇原则） |
| `services.artifacts` 与 `processItems` 由宿主给每个插件现造一份客户端；`ArtifactsModule` 在同一个项目库上被构造多次 | `plugin-host-services.ts:56,83,197-198,226`；`new ArtifactsModule(` 在 `feed-application.ts:96`、`project-version-stores.ts:20`、`installed-plugin-host.ts:95`，`privileges.md` 的 T0 还记了 `project-plugins.ts:113-114` | 没有「一个项目一份成果服务」；各份的事件追加与缓存各管各的 |
| 成果的类型登记取自内置目录 `BUILTIN_PLUGIN_CATALOG` 加 Characters 的宿主产出者表；装上的插件产出的类型不在里面 | `apps/workbench/src/plugin-catalog.ts:311-323,343-368,383-391`、`apps/local-host/src/declared-types.ts:11-12` | 宿主侧「没声明就拒写」只对内置有效，装上的插件靠 Runtime 自己的客户端兜（注释写明「a producer this catalog does not know passes here」）；类型名、续写者、引用者也只认内置 |
| `artifacts.consumes` 写不了文件类型；宿主为了判断「这个导入的文件 Pages 能不能续写」，直接 import Pages 的合同和文件正则 | `plugin-manifest.ts:120`（`consumes` 只有 `artifact_type_id`、`schema_version`、`continue`）、`artifact-native-plugin-http.ts:8-9,222`、`plugins/native/pages/src/actions.ts:54` | 宿主点名一个插件的实现；其他插件无法声明「我能续写这类文件」 |
| 成果库写死 Goals 的边类型和来源模块 | `plugins/native/artifacts/src/actions.ts:137,167-169,218`、`goal-context.ts:20-25` | `goal.input`、`goal.output`、`edge.source.module === "goals"` 是字面量；Goals 不在项目里时行为靠这些字面量碰巧成立 |
| 自读的身份口径有两套：成果的 `head`、`readOwn` 只比 `producer_plugin_id`；过程项的 `ownProcess` 还比绑定签名和 owner | `plugin-operations.ts:45-47`（过程项）、`:75,81`（成果） | 同 id、不同签名的插件能读到对方的成果线（PG-107，#746 没改这条旧行为） |
| 平台事件前缀表里有一个插件专用的 `molis-shelf-` | `packages/contracts/src/platform/dom-events.ts:37,117-119,184-199` | 平台表里给一个插件开专用前缀 |
| 平台存储与资源用插件命名：Home 级密钥库、锁、证据内容库在 `{home}/feed`；素材助手读 `MOLIS_JELLY_*` 环境变量；模型缓存放 `{home}/lingguang/models`；插件客户端包的路由只认目录 `^/assets/molis-work-plugins/<id>.js` | `packages/storage/src/adapters/local-security-paths.ts:29-31`、`apps/local-host/src/material-home.ts:20,29-30`、`material-native.ts`、`web-assets.ts:61-62` | 平台用了某个插件的名字（PG-097） |

## 2. 设计总览

**成果库是平台事实：一个项目一份 `ArtifactsModule`，由平台持有；动作由平台提供方给；别的插件只通过 Manifest 的声明和它说话。**

```text
各插件 Manifest ── artifacts.produces / consumes（含文件类型）/ links 声明
        │
        ▼
Plugin Runtime（有效安装的 Manifest）──► 类型登记表（modules/artifacts 持有，端口取数）
                                              │
项目库 ──► 一份 ArtifactsModule ──► services.artifacts / processItems（平台按插件的 Manifest 裁出客户端）
                       │
                       └──► 动作 artifacts.*（提供方 system.artifacts）──► 工作台面「成果」（平台面，不是插件）
```

### 2.1 谁拥有什么（SSOT-MATRIX 要改的）

| 事实 | 现在的主人 | 改后的主人 |
| --- | --- | --- |
| Artifact、版本、类型登记、链接、过程项的表 | `modules/artifacts`（已是）；`plugins/native/artifacts` 只在行里被写成「Artifacts 一级入口」 | `modules/artifacts` 独占，**含动作的处理器和 `services.artifacts` / `processItems` 的客户端**（今天这两块在插件包里） |
| 动作 `artifacts.*`（17 个）的提供方 | `io.molis.work.artifacts`（`kind: "plugin"`） | `system.artifacts`（`kind: "system"`，与 `system.*` 先例同一写法；能力 id 不变） |
| 类型、续写者、引用者、链接种类 | 宿主与工作台拼的内置目录 | 每个插件在自己的 Manifest 里声明；登记表是有效安装的派生 |
| 「成果」页面（浏览、详情、导入、嵌入） | 插件的工作台面和 5 段客户端模板 | 平台工作台面，随工作台一起发；经 W5-06 的通用挂载器挂上 |
| `plugins/native/artifacts` 包 | 插件 | 实现片完成后只剩界面客户端（若界面也进工作台面，包删除）；`SSOT-MATRIX` 的两行合并说明 |

「成果库只收人要留存、引用的固定版本」「类型在 manifest `artifacts.produces` 声明」「交给别的插件的数据是过程项」这些现行约束不变。

## 3. 设计细则

### 3.1 一个项目一份成果服务（PG-078 的构造部分）

- `modules/artifacts` 导出一个工厂 `projectArtifacts(store)`（名字实现片定）：按项目库缓存一份 `ArtifactsModule` 与它的 `ProcessItems` 门面；`feed-application.ts`、`project-version-stores.ts`、`installed-plugin-host.ts` 与 `project-plugins.ts` 的几处构造都改成取它，源码里 `new ArtifactsModule(` 只在工厂里出现一次（测试夹具除外）。
- 事件追加（`appendEvent`）与 `homeOwner` 在工厂里接一次，不再每处各传一份。
- 删项目、关闭项目库时工厂释放缓存（接 `ProjectDeletionService` 现有的关闭点，不新开关闭路径）。

### 3.2 `services.artifacts` / `processItems` 由平台给（PG-078）

- `createPluginArtifactClient` 从插件包搬到 `modules/artifacts`；`plugin-host-services.ts` 只依赖 `modules/artifacts` 的导出，不再 import 成果库插件包。
- 客户端按调用方的 Manifest 裁：能写哪些类型（`artifacts.produces`）、能读哪些（`consumes`）、过程项同理（`process_items`）。裁剪规则和今天一致，只是来源从「构造时传 Manifest」改为「登记表按 `install_id` 查」。
- 公开 SDK 的 `services.artifacts` 形状不变；插件作者看不到变化。

### 3.3 类型登记表从 Manifest 生成（PG-079）

- 登记表由端口取数：Plugin Runtime 提供「有效安装的 Manifest 列表」（含启用状态），Characters 的宿主产出者表由 `modules/characters` 提供（PG-085 的方向），登记表在安装、卸载、启用、停用、升级时重建，不读 `BUILTIN_PLUGIN_CATALOG`。
- 每条类型登记：`artifact_type_id@schema_version`、属主（插件 id 加发布者签名）、显示名、预览/钉入/比较动作、谁能续写（`produces.continue` 与 `consumes.continue`）、谁声明了「被谁引用」的动作。
- **「没声明就拒写」对所有产出者一视同仁**：今天宿主检查只覆盖内置、装上的插件靠自己的客户端兜（S-69.1）。外加一层，不撤掉 Runtime 客户端那层。
- 类型 id 只有一个属主：后来者声明了已被别的发布者占着的 `artifact_type_id` 时，安装被拒（S-70.2）。同一发布者的升级不算冲突。（统筹 10-24 定，见 §10 A 类第 2 项。）

### 3.4 `artifacts.consumes` 能写文件类型（PG-079）

宿主为了判断「这个导入的文件，哪些插件能从它继续」，今天 import 了 Pages 的合同和 `PAGES_READABLE_FILE`（`.md .markdown .txt .html .htm .csv .docx .zip`）。改成 Manifest 声明：

```ts
consumes: Array<{ artifact_type_id; schema_version; continue?;
  file?: { extensions: readonly string[]; stored_text?: boolean } }>
```

- `extensions`：这个插件能读的文件扩展名（小写、带点）；`stored_text: true` 表示「导入时已存了正文的文件，只要正文非空也算」（对应今天 `file.stored ? Boolean(text.trim()) : regex.test(filename)` 的两支）。
- 宿主「从这一版继续」的名单 = 登记表里该类型的续写者，再按 `file` 声明过滤；`artifact-native-plugin-http.ts` 里不再出现 `PAGES_PLUGIN_ID`、`PAGES_READABLE_FILE`。
- Pages 的 Manifest 加这一项（扩展名和今天的正则逐个相同）；任何别的插件同样可以声明。声明只决定「列不列」，续写动作本身仍走动作授权（不扩大权限，§5.3）。
- 这是 Manifest 合同改动（`PluginManifest` 加可选字段，快照与 SDK 校验同改，同一 PR 改完所有消费者，不留兼容期）。

### 3.5 Goals 的边类型不再写死（PG-077）

今天成果库认 `goal.input`、`goal.input.proposal`、`goal.output`，并要求 `edge.source.module === "goals"`。改成：

- 链接种类由声明方在 Manifest 里登记：`artifacts.links: Array<{ kind: string; role: "input" | "output" | "reference"; … }>`（字段名实现片定）；`source.module` 取声明方的插件 id，不取输入（可信身份来自调用上下文）。Goals 的 Manifest 声明现有三种。
- `artifacts.goals.embeds`、`goal-context.ts`、`readReferences` 里的字面量换成登记表查询；`GOAL_ROLES` 表消失。
- 一个链接种类只有一个属主（S-70.3）：别的插件声明已被占的种类，安装被拒；插件不能写属主是别人的种类的边。
- Goals 不在项目里时，这些查询返回空，不报错（ac-trust §3.4.1 的 Goals 缺席清单里已列成果库一项，本片的用例要覆盖它）。
- 动作 `artifacts.goals.embeds` 的名字带 Goals：留不留、改不改，统筹 10-24 定保留，见 §10 A 类第 3 项。

### 3.6 自读口径合成一套（PG-107）

- 成果的 `head`、`readOwn` 改成和过程项一个规则：`producer_plugin_id` **与** `producer_binding_signature` 都等于调用方的 Manifest（过程项另比 owner）。写成一个函数 `ownsRecord(record, manifest, actor)`，成果与过程项共用，`ownProcess` 并进去。
- 身份由插件 id 加发布者签名一起定，与 ac-trust 的安装信任一致（pinned 的签名是指纹形状，host 是标签，见 ac-trust §3.6）。
- 这一条先在成果库里改（A1），不等整库搬家；搬家（A2）时规则随代码一起进 `modules/artifacts`。
- 失败码沿用 `artifacts.plugin_denied`，文案不变；新增测试断言「同 id、不同签名」被拒（S-69.2）。

### 3.7 事件前缀按事件主人走（PG-096）

- 平台表 `DOM_EVENT_PREFIXES` 只留平台的前缀（`molis-work:`、`molis:`、`workbench-`）。`molis-shelf-` 从表里删除。
- 插件拥有的事件用一条通用规则：名字以 `molis-<owner>-` 开头，且该事件登记的 `owner` 等于 `<owner>`；插件主人由同一张 `PAGE_STATE_OWNERS` 表判定：其 `files` 全部属于同一个 `plugins/<组>/<目录>/` 包。平台主人只用三个平台前缀；主人文件跨插件与平台、或跨两个插件包，门禁拒绝并要求拆开登记，不另写插件名单。Shelf 的现有名字（`molis-shelf-notice`、`molis-shelf-refresh`、`molis-shelf-send-tui`…）已经满足，**不改名**，桌面壳 Rust 侧发的名字也不用动。
- 门禁（`scripts/gates/dom-events.mjs`）改成：未登记前缀、或前缀的 `<owner>` 与登记的 `owner` 不一致，直接失败。任何别的插件按同一规则拿到同样待遇。
- A4 首评修复（#1257，基于 `27d3ef4c0`；[统筹范围裁定](https://github.com/molis-ai/molis-work/pull/1257#issuecomment-6393559237)）：多个已登记主人互为前缀时，按完整 `molis-<owner>-` 的最长匹配确定主人，不依赖登记顺序；合法的长、短插件主人事件都通过，错登到另一个主人、平台主人使用插件前缀、混合归属及未登记的监听、`CustomEvent` 仍拒绝。监听扫描仍识别所有已登记主人的前缀，避免漏掉未登记的平台主人监听。只改合同注释、门禁、直接测试、本节与 UI-PLATFORM 的对应规则；不改事件名、载荷或三个平台前缀，不扩大平台命名政策。
- 这是 `dom-events.ts` 的合同改动，跑 `pnpm api:update`。

### 3.8 存储路径与环境变量去插件名（PG-097）

分两类，**真实 Home 的存量改不改、怎么改先不定**（用户的维护时段）：

| 项 | 现在 | 设计 | 动存量吗 |
| --- | --- | --- | --- |
| 环境变量 `MOLIS_JELLY_NATIVE_HELPER`、`MOLIS_JELLY_WHISPER_HELPER` | 素材助手读 | 改为 `MOLIS_MATERIAL_NATIVE_HELPER`、`MOLIS_MATERIAL_WHISPER_HELPER`；只认新名，不读旧名；同步文档与脚本 | 不动存量；开发机的环境变量要换名，写进 PR 影响 |
| 符号与函数名：`resolveFeedSecurityDirectory` 等 | 名字带 Feed | 改为平台名字（候选 `resolveHomeSecurityDirectory`） | 不动 |
| 磁盘目录 `{home}/feed`（Home 级密钥库、锁、证据内容库） | 路径带 Feed | 候选 `{home}/security`；代码只认新路径，旧路径在时启动显式报错，不回退 | **动**，见 §6、§10 B 类第 8 项 |
| 模型缓存 `{home}/lingguang/models` | 路径带灵光 | 候选 `{home}/materials/models` | **动**，见 §6、§10 B 类第 8 项 |
| 插件客户端包路由 `^/assets/molis-work-plugins/<id>.js`，由内置目录取 | 路由只认目录 | **同源 `/assets` 路由只发宿主构建里的包**（含 A6 之后「成果」平台面的客户端），按宿主构建清单给，不按「目录里有没有 `<id>.js`」；**非 host 插件的客户端代码不进同源资源路由**，Runtime 插件的客户端照旧走隔离框（S-47）。这一项是把路由的口径写清并加门禁，不放宽任何来源；该路由的字节预算按 `page-assets` 门禁的规则走，不得变大 | 不动存量 |

`packages/storage` 的 Home 存储注册表（`home-stores.ts`）已经要求每个路径登记主人；改名后的两个路径在表里登记为平台主人，不是 Feed 或灵光。

**A7 非目录部分已做（分支 `anticorr/ac-artifacts-a7`，2026-10-24）**：环境变量已改为 `MOLIS_MATERIAL_NATIVE_HELPER`、`MOLIS_MATERIAL_WHISPER_HELPER`，旧名不读；`resolveFeedSecurityDirectory` 改为 `resolveHomeSecurityDirectory`（返回的路径仍是 `{home}/feed`，目录改名等维护时段）；客户端包路由本来就只发宿主构建里的包（`pluginWorkbenchClientAsset`），不看目录，现由测试钉住。测试 `tests/platform-naming-pg097.test.ts`（RAC-412、RAC-427）；**开发机的环境变量要换名**。RAC-428 随目录部分。

**A7 验证补修（Codex 修复16，基于 #1264 `93ba2b5a7`，2026-10-24，本机定向通过，独立审验待齐）**：首评的三项非阻塞问题作为同一 RAC-427 验证主题补齐，生产改名与 RAC-412 的路由口径保持原范围。两个旧名检查共用一次 `git ls-files -z` 的文本快照，不按目录或扩展名挑代码；仅豁免 `specs/archive/` 下的历史 Markdown 和本稿描述旧名的行，测试刻意反例用字符串组装，不豁免其他测试或代码目录。读取先以有界前缀辨认二进制，二进制媒体不整文件读取；文本读取失败必须报错。临时 Git 仓库在原漏扫的 Swift、Rust、YAML、Python、`tooling/`、`.github/`、`examples/` 及无扩展名文件写回两种旧名，必须使同一检查失败；同时验证历史叙述、二进制和读失败的边界。

RAC-427 的行为证据经现有 `extractUploadedMaterial` 入口实际进入 `extractHomeMaterial`，只替换原生可执行 helper：在任何运行平台用现有可信 Host 选项 `platform: "darwin"` 进入原生边界，新变量指向临时可执行助手，断言调用参数、收到的材料字节、返回正文、独立 marker 与临时目录清理；旧变量指向另一个助手，既验证新旧同时配置只调用新助手，也验证仅配置旧名时不调用旧助手、不回退。后一个场景以只读的空安装目录隔离默认助手发现，避免依赖本机是否构建过原生程序。环境变量与临时 Home/文件在 `finally` 恢复或清除，不下载模型、联网或访问真实 Home；这不宣称 Linux 原生提取可用。验收命令为整体构建后运行 `node scripts/run-tests.mjs --jobs 2 tests/platform-naming-pg097.test.ts tests/jelly-native-material.test.ts tests/material-extraction.test.ts tests/feed-local-history-delete.test.ts`，并核 `pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm secrets:check`；原首评和作者五项测试保留其原证据范围，不能代替补修的独立审验。

本机补修证据（macOS）：上述四文件 33 项全部通过、0 跳过；整体构建、包导入单一来源检查与 `health --base origin/main` 通过。临时把生产读取改为旧变量、以及给新变量加旧名回退，两次都使新增行为用例失败（分别抓到错误正文和未按预期拒绝），随后已原样恢复生产源码。`pnpm boundary:check` 已经公共构建槽执行通过；独立 REVIEW/TEST 与 Linux 主机实跑尚待；该行为用例自身没有平台 skip，但所在文件含已有原生用例，现行 Full suite 的整文件 macOS 标记会略过它，Linux probe 或独立验证须点名运行，不能把本机通过写成 Linux 实跑。补修增量 `affected-tests` 的 `full=[]`；原 #1264 的存储改名仍命中 full，由 Claude 统一组批。

### 3.9 与相邻条目的衔接

- **提供方换成 `system.artifacts`（PG-077 的最后一步）**：能力 id 与版本不变，只换 `registered_provider`。这会碰到真实 Home 里的 MCP 授权和工作流引用（引用里带提供方），所以放在 A5，随一次维护脚本一起落，**代码只认新提供方，旧引用显式失败，不兜底**；真实 Home 的执行列进维护时段计划，交用户时一并确认，未经用户批准不动（§6、§10 B 类）。A5 只换动作的提供方，「成果」入口仍由原目录条目的界面提供，入口照常可用；目录条目的删除在 A6 同一片里做（§7）。与 ac-trust 的 S-68.3（提供方 id 规则）一致：系统提供方用 `system.*`，插件不得注册 `system.*` 或平台能力 id（RAC-423）。
- **W5-06（PG-060）**：成果页进平台工作台面后，由通用挂载器挂上。A6 把「换成平台面」「删目录条目（C7）」「删插件包」放在同一片，**不许有中间断掉的状态**：每一片合入后「成果」入口都能用（RAC-424）。
- **ac-registry**：本稿的登记表与它共用「有效安装的 Manifest 派生登记」这一件事，实现不另起第二份。统筹 10-24 定：凡是碰 `plugin-catalog.ts` 或内置目录条目的片（A3、A6），排在 ac-registry 的 PG-024 片之后（LINES §2 第 3 行，它本身等 #1098、#1112）；其余片在 W5-06 链合完后可以先做。逐片的前置见 §7。
- **#1098**：动 `manifest.ts`，A3 要改 Pages、Goals 的 Manifest，所以等它合入。A1、A2 不碰 Manifest 文件。
- **PG-085**：Characters 作为宿主产出者的类型声明由 `modules/characters` 提供给登记表，本片不搬 Characters。
- **PG-090**：Shelf 取成果已经走平台（C3），本片不动。

## 4. 合同改动（现在不留兼容期，同一个 PR 改完所有消费者）

| 编号 | 改动 | 影响 |
| --- | --- | --- |
| C1 | `PluginManifest.artifacts.consumes[]` 加可选 `file`（§3.4）；SDK 的 Manifest 校验同改 | `pnpm api:update`；Pages 的 Manifest 加声明 |
| C2 | `PluginManifest.artifacts` 加 `links`（§3.5） | 同上；Goals 的 Manifest 加三种 |
| C3 | 17 个 `artifacts.*` 动作的 `registered_provider` 从 `io.molis.work.artifacts` 改 `system.artifacts` | `pnpm actions:update`；调用方（工作流步骤与绑定、MCP 工具名、Skill）要列；工作流引用与 MCP 授权按维护脚本改 |
| C4 | `DOM_EVENT_PREFIXES` 删 `molis-shelf-`，加 `molis-<owner>-` 规则（§3.7） | `pnpm api:update`；门禁改 |
| C5 | `modules/artifacts` 新导出：`projectArtifacts`、`createPluginArtifactClient`、`ownsRecord`、登记表 | `pnpm api:update`；旧导出路径（插件包里）删除，不留别名 |
| C6 | `plugin-host-services.ts` 的 `artifacts`、`processItems` 来源改成 C5 | 公开 SDK 形状不变 |
| C7 | **与 A6 同一片**删除：`io.molis.work.artifacts` 的目录条目、`BUILTIN_PLUGIN_CATALOG` 里的成果库行、`HOST_ARTIFACT_PRODUCERS` 的内置来源（Characters 改由 `modules/characters` 供） | `node scripts/generate-plugin-registry.mjs`；`builtin-plugin-assembly-gate` 名单同步 |
| C8 | 环境变量改名（§3.8） | 文档、脚本、`.env` 示例 |

## 5. 信任边界与安全不变量

### 5.1 新增（先写 S-69、S-70，合入时核号）

**S-69 成果与过程项的写入只认当前有效安装的 Manifest 声明，读只认自己的身份**

1. 任何产出者（内置、签名、开发目录、创作台产物，不分）写 `artifacts.produces` / `process_items.produces` 之外的类型，一律拒绝；宿主这一层对所有产出者生效，不再只管内置。
2. 成果的 `head`、`readOwn` 与过程项的同名读法同一口径：插件 id 与发布者签名都相同才算自己的；同 id、不同签名的调用被拒。
3. 身份取自调用上下文，不取输入。

**S-70 类型与链接种类的属主由安装身份定**

1. 登记表只由有效安装的 Manifest（和宿主自己登记的产出者）生成；不接受请求里自称的类型。
2. 一个 `artifact_type_id` 只有一个属主发布者；别的发布者声明同一个 id，安装被拒。
3. 一个链接种类只有一个属主；`source.module` 取声明方自己的插件 id；别的插件既不能声明，也不能写这个种类的边。
4. 属主的安装被停用、卸载后，不能再写这个类型；已有版本保留，可读，预览降级（RAC-421）。

每条都要有断言「拒绝」本身的测试，进 `docs/system/SECURITY-INVARIANTS.md` 并跑 `pnpm test:security`。

### 5.2 没有扩大的信任边界

- **宿主检查扩到所有产出者**：是收紧（原来装上的插件只被自己的客户端约束一层）。
- **`consumes.file` 声明**：只决定「续写」名单里列不列，续写动作的权限仍按动作授权走；声明扩展名的插件拿不到文件正文。
- **Goals 的链接种类来自 Manifest**：属主唯一、来源模块取声明方身份，第三方不能伪造 Goals 的交付边。
- **提供方换 `system.*`**：不给任何插件新增权限；系统提供方只有宿主能注册（ac-trust S-68.3）。
- **客户端代码不进同源路由**：同源 `/assets` 只发宿主构建里的包；非 host 插件的客户端照旧走隔离框（S-47）。本片不放宽任何来源，所以也没有新的缓存面。
- **自读加签名**：是收紧。
- 若实现中发现任何一条要扩大，写进 §10 交统筹，不自己定。

## 6. 存量

| 存量 | 改后形状 | 做法 |
| --- | --- | --- |
| 真实 Home 的 MCP 授权、工作流步骤里的提供方 `io.molis.work.artifacts` | `system.artifacts` | 维护脚本一次改完；代码只认新值。**先列清单，用户批准后才动**，与 A5 同一次维护 |
| `{home}/feed` | `{home}/security`（候选） | 维护脚本原子 `rename`，先备份；启动时发现旧路径显式报错；**用户维护时段**，见 §10 B 类第 8 项 |
| `{home}/lingguang/models` | `{home}/materials/models`（候选） | 缓存可重新下载：建议不迁移，维护时删旧目录，首次用时重下 |
| 项目库里的成果、过程项、链接 | 不变 | 不动；表仍由 `modules/artifacts` 独占 |
| 创作台装进项目的插件产出的类型 | 登记表按安装记录补入 | 启动时由登记表重建，不写数据 |

开发机与 CI 都用隔离 Home 演练；演练记录写进 PR（RAC-428）。

## 7. 实现拆片

每片一个 PR；前置栏标和 W5-06、ac-registry、#1098 的先后（统筹 10-24 定：碰 `plugin-catalog.ts` / 内置目录条目的片排在 ac-registry 的 PG-024 片之后，其余片在 W5-06 链合完后可先做）。**每一片合入后「成果」入口都能用，不留中间断掉的状态。**

| 片 | 内容 | 前置 | 备注 |
| --- | --- | --- | --- |
| A1 | PG-107 与 PG-078 的构造部分：`ownsRecord` 合一；`projectArtifacts` 工厂，三到四处构造改取工厂 | W5-06 链合完 | 不碰 Manifest 与合同导出；RAC-410、411 |
| A2 | 代码搬进 `modules/artifacts`：动作处理器、`createPluginArtifactClient`、`plugin-operations`；`plugin-host-services` 与宿主十来个文件停止 import 成果库插件包；提供方先不换 | A1 | `pnpm api:update`；RAC-413～414 |
| A3 | 类型登记表从 Manifest 生成（碰 `plugin-catalog.ts`）；`consumes.file`；Goals 链接种类；S-69、S-70 | A2；**#1098 合入**；**ac-registry 的 PG-024 片** | `pnpm api:update`；Pages、Goals 的 Manifest；RAC-415～421 |
| A4 | PG-096：事件前缀规则 | W5-06 链合完 | 独立，可与 A1 并行；RAC-426 |
| A5 | 提供方换 `system.artifacts` 与维护脚本（C3）；目录条目**不删**，入口照常 | A2、A3；**等用户答完维护时段（B 类）再合，和维护同一时段** | `pnpm actions:update`；RAC-422、423 |
| A6 | 「成果」入口成平台面，经 W5-06 的通用挂载器挂；5 段客户端模板随平台面发；**同一片**删目录条目与 `BUILTIN_PLUGIN_CATALOG` 里的行（C7）、删插件包 | A5；**W5-06 的挂载器**；**ac-registry 的 PG-024 片** | 页面资源字节不得变大；RAC-424、425 |
| A7 | PG-097：环境变量改名、符号改名、客户端包路由口径与门禁；真实 Home 目录改名放维护脚本 | W5-06 链合完；环境变量、符号、路由部分可先合；**目录部分等用户答完维护时段（B 类）再合，和维护同一时段** | RAC-412、427、428；可与 A5 合一次维护 |
| A8 | 文档与门禁收口：SSOT-MATRIX 两行、`privileges.md` 状态、`SECURITY-INVARIANTS.md` 的 S-69/70、门禁名单只减不增 | A5～A7 | RAC-429 |

先后小结：A1、A2、A4、A5、A7 在 W5-06 链合完后可以先做；A3、A6 碰内置目录条目，排在 ac-registry 的 PG-024 片之后（A3 另等 #1098，A6 另等 W5-06 的挂载器）；A5 之前 A3 完成。

## 8. 验收

| 编号 | 内容 | 证据（测试文件待实现片定，名字里写编号） |
| --- | --- | --- |
| RAC-410 | 一个项目只有一份 `ArtifactsModule`：源码里 `new ArtifactsModule(` 只在工厂；同一项目取两次是同一个对象；删项目后释放 | 门禁式测试加单元测试 |
| RAC-411 | 成果的 `head`、`readOwn` 同 id、不同签名被拒（`artifacts.plugin_denied`）；相同 id 与签名通过；成果与过程项共用一个 `ownsRecord`，过程项仍额外比 owner | `tests/artifacts-actions.test.ts` 扩展；单元测试 |
| RAC-412 | 同源 `/assets` 路由只发宿主构建里的包，非 host 插件的客户端代码不进该路由（Runtime 插件的客户端仍走隔离框，S-47）；**这一条与目录改名无关，维护时段否了改名也保留** | `tests/platform-naming-pg097.test.ts` 路由测试 |
| RAC-413 | `plugin-host-services.ts` 与宿主 `artifact-*.ts` 不再 import 成果库插件包（边界规则，`pnpm boundary:check`） | 边界规则加名单只减 |
| RAC-414 | 搬家后 17 个动作的合同快照不变（A5 前提供方仍是原值） | `tests/action-contract-snapshot.test.ts` |
| RAC-415 | 登记表由有效安装的 Manifest 生成：安装、卸载、启用、停用后即时变化；不读 `BUILTIN_PLUGIN_CATALOG` | Runtime 集成测试 |
| RAC-416 | 装上的（非内置）产出者写未声明的类型被宿主这一层拒绝（S-69.1） | `tests/security-invariants-*.test.ts` 新增 |
| RAC-417 | 两个发布者声明同一 `artifact_type_id`，后者安装被拒；同发布者升级通过（S-70.2） | 同上 |
| RAC-418 | `consumes.file` 生效：Pages 的续写名单与今天逐扩展名一致（含 `.docx`、`.zip`、存了正文的文件）；一个装上的第三方声明了 `.pdf`，PDF 导入件的名单里出现它 | `tests/artifacts-*.test.ts` |
| RAC-419 | 源码里 `artifact-native-plugin-http.ts` 不再有 `PAGES_PLUGIN_ID`、`PAGES_READABLE_FILE`；`modules/artifacts`、成果库代码里没有 `goal.input` 等字面量 | 门禁式测试 |
| RAC-420 | Goals 链接种类来自 Goals 的 Manifest；Goals 缺席时 `artifacts.goals.embeds`、详情页「被谁引用」返回空，不报错（对应 ac-trust RAC-400 清单里成果库一项） | 非浏览器用例 |
| RAC-421 | 别的插件声明或写 Goals 的链接种类被拒；属主停用后不能再写，已有版本可读、预览降级（S-70.3、S-70.4） | 安全不变量测试 |
| RAC-422 | 提供方换后（按维护时段计划的结论执行）：能力 id 不变，快照里 `registered_provider` 是 `system.artifacts`；旧提供方的工作流引用显式失败（不兜底）；MCP 授权在维护脚本之后仍解析；A5 合入后「成果」入口照常可用 | 快照测试；隔离 Home 演练 |
| RAC-423 | 插件 Manifest 声明 `artifacts.*` 或 `system.*` 的能力 id 被拒 | 安全不变量测试 |
| RAC-424 | 「成果」入口是平台面，不是插件：不进插件市场与插件常开同意模型，一直在；Dock 上能不能收起跟 Dock 现行规则走，不另开特例。A6 同一片内完成换面与删目录条目，**每一片合入后入口都能用**；经 W5-06 挂载器挂上 | 浏览器冒烟一个 |
| RAC-425 | 客户端模板随平台面发，`plugin-workbench.ts` 里没有成果库内联模板；`pnpm page-assets:check` 不变大 | 页面资源门禁 |
| RAC-426 | `DOM_EVENT_PREFIXES` 不含任何插件专用前缀；`molis-<owner>-` 只给文件全属于同一插件包的主人，按完整前缀的最长匹配确定主人；平台使用该前缀、混合归属及主人不一致均拒绝；长、短主人合法事件及现有拒绝规则均回归，Shelf 现有事件名不变 | `scripts/gates/dom-events.mjs` 与 `tests/dom-events-contract.test.ts` |
| RAC-427 | 代码里读不到 `MOLIS_JELLY_*`；新名生效；平台存储函数名不带 Feed、灵光 | `tests/platform-naming-pg097.test.ts` 的全 tracked 文本检查与故意写回反例；`tests/jelly-native-material.test.ts` 的真实 helper 调用及旧名拒绝 |
| RAC-428 | 目录改名（按维护时段计划的结论执行）：隔离 Home 演练旧路径→新路径；旧路径在时启动显式报错，不回退；备份可还原 | 隔离 Home 演练记录 |
| RAC-429 | 公开 API 与动作合同快照只有 §4 列出的变化，PR 里逐项写对调用方的影响；SSOT-MATRIX、`privileges.md`、`SECURITY-INVARIANTS.md` 同步 | `pnpm api:update`、`pnpm actions:update` 的 diff；`pnpm health:check` 的文档引用检查 |

## 9. 待办

BL-575～582 对应 A1～A8，BL-583 是真实 Home 目录改名与提供方引用改写的维护清单（§10 B 类，用户维护时段），BL-584 是 A3 开工前核 ac-registry 稿的接口（§10 A 类第 5 项）；都写在 `specs/BACKLOG.md`。

## 10. 待定

分两类：A 类统筹 2026-10-24 已定；B 类待用户（维护时段），稿里只写成「按维护时段计划的结论」，不预写成已定。

### A. 统筹 10-24 定

1. **登记表读 Manifest 的端口**：Plugin Runtime 导出「有效安装的 Manifest」查询端口，登记表在 `modules/artifacts` 持有；`modules/artifacts` 不依赖 Runtime 包。
2. **类型 id 冲突**：后来者安装被拒（S-70.2），与 S-68 保留 `plugin_id` 同一口径；备选「id 带发布者前缀」会改所有现存类型，不取。
3. **`artifacts.goals.embeds` 的动作名**：保留（Goals 是它的消费者，数据已是声明驱动），改名会牵动工作流引用与 Skill。
4. **「成果」入口**：成果库去插件身份后是平台面，不走插件常开同意模型，一直在；Dock 上能不能收起跟 Dock 现行规则走，不另开特例。**它和用户 2026-10-24「插件的常开同意都可撤」不冲突，理由是它不再是插件**：那条管的是插件声明的 `always_on` 同意，成果库没有 Manifest、没有同意可撤。RAC-424 按此写。
5. **ac-registry 与 W5-06 的先后**：碰 `plugin-catalog.ts` / 内置目录条目的片（A3、A6）排在 ac-registry 的 PG-024 片之后（LINES §2 第 3 行，它本身等 #1098、#1112）；其余片在 W5-06 链合完后可先做。逐片前置见 §7，A3 开工前由 BL-584 核接口。
6. **不留中间断掉的状态与同源路由口径**：C7 与 A6 同一片；§3.8 的客户端口径（非 host 插件的客户端不进同源 `/assets`）。

### B. 待用户（维护时段）

7. **提供方换 `system.artifacts`**：代码与维护脚本按推荐写（A5），真实 Home 的执行（MCP 授权、工作流引用的改写）列进维护时段计划，交用户时一并确认。RAC-422 写成「按维护时段计划的结论」。
8. **`{home}/feed` 改名与 `lingguang/models` 删旧缓存**：代码与维护脚本按推荐写（`feed` 改、模型缓存不迁移、维护时删旧目录），真实 Home 的执行同上列进计划。若用户不动真实 Home，路径「去插件名」要作为**不做的理由**交用户确认，稿里不预写；RAC-428 同样写成「按维护时段计划的结论」。

## 11. 防腐复查

- 插件不 import 另一个插件的实现：本片删掉宿主对成果库插件包和 Pages 的 import；类型与链接种类都经 Manifest 声明。
- 能力注册一次：17 个动作 id 不变，只换提供方；不另写名单。
- 表的主人：成果、过程项、链接表由 `modules/artifacts` 独占；别的包经它导出的函数读写。
- 可信身份来自调用上下文：链接种类的来源模块、自读的签名都不读输入。
- 错误码沿用 `artifacts.*` 声明，不新写 Error 子类。
- 无兼容层：旧提供方引用、旧目录、旧环境变量都显式失败，不回退；旧导出路径删除。
- 没有巨大单元：搬家按职责拆文件（登记表、客户端、处理器各一份）。
- 本稿只改文档。
