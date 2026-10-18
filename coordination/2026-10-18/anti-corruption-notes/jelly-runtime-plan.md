# Jelly Home Runtime 迁移只读设计

2026-10-17，设计 Agent。核对基点 `e8925f8eaf5d9ad0152b16c3441a79bd7d3b875b`，工作树 `wt-model-selection`；另以 `git show/diff` 核对 #661 的 `9d94e5eb5c87dc6271c998d0163cd2f2adf64e57`。没有修改工作树，没有构建/运行测试，没有接触真实 Home。本文是候选方案，唯一需求书仍为 `specs/repository-anti-corruption/spec.md`。

## 结论与需要主 Agent 裁决的一处边界

业务迁到 Home Runtime 的前置基本齐全：原 SQLite、53 个动作、路由/NDJSON、UI 与模型执行都能沿用现有平台能力。尚缺的是**已存在的 Jelly 模型配置管理如何绑定到 Runtime**，不是通用供应商 CRUD 或任意私有文件服务。

最小保行为方案：**53 个动作仍全部由 Jelly Runtime 唯一注册**；其中两个模型设置处理器经一个严格受当前安装及原动作约束的窄 Host 配置端口调用现有配置 owner。`jelly-model.ts` 中配置读写继续保留原路径、原供应商、原事务；删除其中模型执行绑定 `createJellyCompletion`，实际推理只走 `services.model.complete(..., { selection, output: "json" })`。不移动 preferences.json，不建第二份配置，不让插件得到 Home 或凭据。

这个方案确实需要一小块公开服务合同和可信绑定，不能声称现有 `services.model` 已提供设置，也不能把插件定义改成空壳后仍由原 Host 注册全部动作。推荐把端口限于“读取当前消费者选择 / 读取设置视图 / 保存当前消费者设置”，复用当前 `JellyServicePorts` 的业务形状；平台合同可抽为消费者模型设置的共同类型，不能在平台依赖 Jelly 实现。绑定来自可信 Home 启动声明，固定配置 owner/设置权限，不由插件输入指定路径或任意 provider。具体公共名称和声明形状由主 Agent 在 spec 中裁决后再实施；不建议先写一个可扩展的任意 service map。

**决定 #7 不能直接消除这块绑定。** `docs/system/CALL-CHAINS.md` §10.1 的原文边界是宿主设置“只在本机用的管理 HTTP，不进动作目录，助理、Agent 和 MCP 调不到”。模型供应商保存/删除 `/api/settings/models/<provider>` 在例外表内。Jelly 则已有 `jelly.model.settings@1`、`jelly.model.configure@1`，在 Manifest 53 项内，受众为 user/workflow/agent/mcp，权限 `jelly:settings`。把这两项改成仅用户 HTTP、让用户另去全局页面才能完成自定义设置，均为实质缩减现有行为，需要新决定，不能借 #7 自动推导。

若主 Agent 选择“51 Runtime + 2 Host 管理动作”，需明确记录为混合装配：动作集合分离，原 id 只注册一次；相同 provider_id 的不重叠动作在当前 registry 并非天然冲突，但 Runtime 自己的 client 把 Manifest 动作绑定本实例，discover 只保留本 install_id。将两项移出 Manifest 后必须声明 consumes、正确保持原调用者授权，并新增对 Home 安装停用/撤权/换代与项目移除的可用性复查。当前 `projectActionAvailability` 跳过 personal，不能当现成屏障。相较单一 Runtime 注册，此路线增加生命周期桥和 Manifest/目录归属例外，不建议作为最小方案。

## 现行链路与 owner

- 浏览器 `client*.ts` → `/api/jelly/*` → `jelly-native-plugin-http.ts` → `JellyPluginRouteTable` → 统一动作。MCP/工作流用同一动作。`project-host.ts` 以 Home provider 登记 `jellyActionProvider`。
- 51 项内容/日历/导入预览/搜索/内容站点动作在 Jelly 包内；两个设置动作在 `service-actions.ts` 定义，Host 注入读写函数。`jelly.settings` 权限并不存在，实际名称是 `jelly:settings`。
- Jelly Store 唯一业务库 `{home}/jelly/jelly.db`：workspace JSON/revision/checksum、note 版本高水位、undo/redo、删除/导入 preview token；`JELLY_STORE_BASELINE` 版本 1，不需新表或数据迁移。
- 模型偏好唯一文件 `{home}/jelly/preferences.json`：`{schema_version:1, provider_id, model_id}`。逻辑属于 Jelly，现行文件 IO/校验由 `jelly-model.ts` 持有；不迁到 Home Runtime KV。
- 供应商 `model_providers` 在 Host catalog，`ModelProviderStore` 是 owner。Jelly 只能选择已有启用供应商/模型，或改固定 `jelly-text`，不会改其他供应商记录。
- 连接/credential/目标 origin 绑定由 Connector Host 与密钥存储拥有；设置只用 connection_id，传入 api_key 明确拒绝。模型派出经 `hostCompleteText/hostTextGeneration` → Agent Host/Prologue。
- AI 输入是笔记或文字（可带连续选区、日期、起始时间、用户补充）；输出待采纳 `JellyPlan`，不写日历。后续采纳命令核 source hash、revision，再入库。

## 必须保留的用户行为

1. 一个 Home 一份日历/笔记与独立模型选择，无项目也可用；切换项目不生成第二份数据。
2. 当前 v1 库、历史、预览 token、笔记 revision、内容站点同一 delivery 的幂等均保留；损坏/不支持数据拒绝，不覆盖为空库。
3. 手工逐行拆解无需模型；模型只提案，确认后才写内容，失败/取消保留原文。
4. 有偏好时精确使用该供应商/模型；停用/缺失/连接不可用时保留原选择并拒绝，不换默认模型。没有偏好才使用现行默认/环境逻辑。
5. 设置显示 providers、模型、连接状态、selection/effective_selection、source、custom_connection_id；保存普通选择不改共享 provider/key；自定义只改 jelly-text，追加/启用该模型，保留原已保存连接与其他模型。
6. 保存设置不发模型请求；URL、API 格式、模型 ID、连接类型、已绑定 origin 的校验保留；失败保持原选择和凭据。现行 provider transaction 包住原子文件替换，commit 失败会尝试还原原偏好。不要误改成两次独立 await 的 provider-save/file-save。
7. #661：disabled 连接展示为 disconnected；显式选 disabled 连接保存拒绝；连接视图 import 改为 `connector-connection-views.ts`。它仍在途，实施时与最终 main 重核，不拿当前候选整份覆盖。
8. 个人内容/设置各自授权，项目访问不授予它们，MCP 的显式授予仍有效；Runtime 停用后所有 53 项均不可调，搜索及 UI 可用性一致。
9. AI NDJSON 保留 planning 进度及唯一 result/error 末行，断连/撤权/停用无迟到业务写入；原 36,000,000 请求上限按需要的路由声明。
10. 模型设置 dialog 的 model-ready 复读、离开设置标记消耗、hidden 页面不 showModal 均保留；UI 功能不趁迁移重做。

## 已有服务能做与不能做的事

| 能力 | 判断 |
| --- | --- |
| `services.database` | 足够。JellyStore 改成 PluginDatabaseTransaction/Reader，写动作 `database.transaction(caller.beforeEffect, tx => ...)`。移除 Store 自己 BEGIN/COMMIT/ROLLBACK，不能双层事务。 |
| `services.model` | 足够执行和 availability 的显式选择；JSON 解码由它做，领域 shape 校验仍在 Jelly。settings 视图另含 effective_selection/source，不能只凭 runtime_label 反推。 |
| `services.files` | 当前不足以无损代替偏好 IO：必须 store/子目录且只 create(不可覆盖)/remove；不能读写 store 根的 preferences.json，也无原子 replace。不要用删除再 create。若保留管理 owner，无需为 Jelly 扩它。 |
| `services.storage` | 是安装隔离 KV；会改变当前文件事实位置，不是本任务的无损替换。 |
| 现有供应商管理 | 有 `web-model-settings.ts` 与 `model-provider-setup.ts`，没有可消费的 provider-list/upsert 公共动作。一般保存允许 API key 且有 check_connection 语义，不能直接替代 Jelly 的“只选连接、不联网、只改 jelly-text”。复用底层 owner/URL/target 检查，不调用受保护 HTTP 绕权限。 |
| #661 连接管理动作 | 有 connectors.connections.read 等，但只管理连接，不管理模型 provider，也不拥有 Jelly 偏好；定义仍在 Host。可以复用 Host 的连接 view/helper，勿为 Jelly 造第二份连接目录；不以迁移为由把所有 connector management 权限授给 Jelly。 |

## 文件边界与依赖顺序

**P0，先定配置绑定合同（阻塞最终 Runtime 接线，不阻塞业务 Store 改造设计）。** 允许 Host 保留原配置 owner；53 动作唯一注册；窄端口在当前 invocation 内识别设置动作/所需权限，读选择供 plan 与 workspace availability 使用时不强迫调用者获得 jelly:settings。写端口先 await 原 beforeEffect，再同步复查安装/权限，随后同步完成原 catalog/file transaction。不可只在 start 时检查一次 grant。返回 metadata 不带 credential_ref/key；显式输入复制后再等待。

**P1，共享绑定 writer。** 若采纳窄端口：公共 types 放 `packages/contracts/src/platform/plugin-model.ts`（或专门的小合同文件），接入 `PluginHostServices`；`apps/local-host/src/home-plugin-executor.ts` 与可信目录声明/身份派生负责注入；共用生命周期封装只放一个 Host 文件。`jelly-model.ts` 保留配置实现，拆掉推理；读取/保存由同一 owner 复用现有 stores。不得在 `home-plugin-executor.ts` 写 `if plugin_id === jelly`。共享 API、技能手册与安全表由主 Agent 串行协调。

**P2，Jelly writer（P0 接口固定后可落代码，当前应单 writer）。**

- `plugins/native/jelly/src/store.ts`：从 DatabaseSync/home opener 改注入 reader/writer，保留 baseline/home declaration；初始空 workspace 在现行 baseline 的初始 seed 或受监督器授权的单次事务中建立，现有库缺 singleton 且有 history 必须拒绝。note 高水位初始化也须保留。不能在每次只读动作里偷偷补写。
- `actions.ts`, `command-actions.ts`, `content-actions.ts`, `search.ts`：改 `withStore` 为 read/write ports。所有写包括 preview token、content receive、undo/redo都进真实授权 transaction；receive 的 exists/read/create 必须同事务保证幂等。只读用 reader。
- 新 `plugin.ts`：require 必要 grants、注入 db/model/配置端口、返回 views/routes/53 handlers；AI JSON output 将格式错误按既有 jelly.ai_invalid 用户合同处理，权限/取消/连接错误不可一律包成 AI 无效。
- `service-actions.ts`：保留两项 id/version/schema/受众/权限，允许 async save；由 Runtime 调窄配置端口，别把调用者身份塞 input。
- 新 `plugin-routes.ts` 与 `manifest.ts`：声明 API routes（含 notes/:id/export、36MB body、AI NDJSON）；路由只转现有动作，commands/preview/AI manual 分支保持。`routes.ts` 旧 class 由现行 consumer 切完后删除，不保双路。
- `ui.ts` 用 Runtime render context 的 primitives；`client*.ts` 请求迁 `/api/plugins/io.molis.work.jelly`，项目中由 Host 前缀供真实上下文；`index.ts`, `package.json` 同步真实 SDK 依赖/公开工厂。

**P3，主 Agent 集成文件（不可与其他迁移 writer 并行改）。** `apps/workbench/src/builtin-plugins.ts` 加 Home runtime/database 声明、移除 build-time contribution；`apps/workbench/src/ui-composition.ts` 删除 Jelly 专用渲染；`apps/local-host/src/project-host.ts` 删除旧 provider；`web-request.ts`, `web-catalog.ts`, `index.ts`, `native-plugin-api.ts` 删除旧 HTTP 接线与重写；删除 `jelly-actions.ts`, `jelly-native-plugin-http.ts`。如果保留 Host 配置实现，`jelly-model.ts` 不应为装配数字好看而机械改名。

**P4，派生与验证主 Agent 串行收口。** action/API snapshots、assembly gate 冻结名单、package inventory、SSOT/README/runtime migration 文档、page-assets 实测下调与 security/test 子集条目。不改门禁规则，不给数字增大登记借口。

## 能发现真实错误的验收

- `JRT-01`：隔离 Home 预置现行库、非空 undo/redo/history、preview 和 preferences 后启动真实 Runtime；两个项目读到同一份数据；完成一次写入、重启再读，原文件位置不变，无第二份 KV 选择。
- `JRT-02`：遍历真实 action 目录确认 53 项各只一注册、provider 有当前 install 身份；直接 HTTP、Home action、project action、MCP 授权执行一致。停用/重启/撤权/项目移除后查询和写入均拒绝，旧 handle 不写 DB/偏好/provider；重新启用读回原数据。
- `JRT-03`：用实际两个模型替身端点，普通默认、Jelly显式另选、自定义 jelly-text 各记录命中 endpoint/model；设置保存请求计数为零。停用/删除所选连接且另一供应商可用，AI 请求数仍零、偏好逐字节保留；#661 disabled case 必跑。
- `JRT-04`：保存 existing provider 前后共享 provider 行与连接密钥引用不变；custom 可追加模型/切换同源连接；跨 origin、错误服务连接、disabled、无凭据、api_key输入拒绝，旧 provider/preference/连接状态均不改变。故意使偏好原子替换失败，确认 provider tx 回滚；故意使 catalog commit 失败，确认偏好还原（不只断言 throw）。
- `JRT-05`：真实 Runtime 动作停在 beforeEffect barrier，期间撤 settings grant / stop / reinstall，再放行；原偏好、provider、业务库零写入。模型等待中同样停用/撤权/断连，释放模型后没有计划结果或采纳副作用。
- `JRT-06`：生成计划前后 DB 内容不变；确认采纳才新增；源笔记改版/选区不再匹配时拒绝采纳且保留原文；两个窗口相同 expected_revision 实际交错，只有一个写入成功。
- `JRT-07`：import/delete preview 写入走授权事务；错 token/过期/不同 revision 拒绝；undo/redo保持单调 note revision；并发重复 delivery 只一篇笔记。
- `JRT-08`：真实浏览器 Home/项目页面加载、编辑、日历/笔记切换、导出、手工/AI预览、取消、设置无模型/失效选择、model-ready返回与关闭 modal。NDJSON正常/异常/中断末行语义与原客户端相符。

定向基线首先沿用 Jelly README 的 `jelly-actions`, `jelly-content`, `jelly-mcp`, `jelly-model`, `jelly-plugin`, `lingguang-material`, `shelf-jelly-cognia-images-error-model`；加 Home Runtime lifecycle/路由与 `plugin-model-selection`, `plugin-model-service`, `security-invariants-plugin-model-progress`；UI 跑 `model-ready-surfaces.e2e` 及已有 Jelly 主路径 e2e。新测试通过公开包、真实 Host/Runtime 生产接缝，不新增内部源码 import，不拿 JSON 文件存在当业务验收。没有在此只读设计中运行以上检查。

## 实际不可并行项

- #661 `jelly-model.ts`/configured-models/connection view 语义与本迁移配置实现必须串行集成；不是取一边整文件。
- P0 端口未裁决前不应分派完整 Jelly Runtime writer；可以先准备 store 改造，但单 writer 规则仍适用。
- 不能一个 writer 改 Store，另一个 writer 同时改 actions 的 read/write 签名；这是同一事务合同。
- 可信目录、两个 executor、contracts/plugin、Host聚合、API/actions/health/page-assets派生表由主 Agent 串行；其他插件迁移只允许独立只读设计，不多 writer 抢共享文件。
- 整体 build/浏览器批次按机器槽位；共享核心完整回归由统筹一次跑，不由本设计 Agent 启动。
