# Shelf 文件生命周期与项目服务前置（负责人：主会话；执行待分配）

状态：只读设计，未实现、未运行验证。依据 S `d2b6d903c`，承接 `shelf-runtime-plan.md` C/D/E/F；接受后并入 `specs/repository-anti-corruption/spec.md` W5-01，本文不是第二份需求书。未改工作树、未构建或启动用例。SHM 的 images / execution / validateResult / choices 可作为确定接口；此处不声称 SHM 已运行通过，更不声称 Shelf 已迁移。

目标完成程度：前置功能可用。通过真实 Home Runtime fixture 证明 owner 文件、真实项目固定版本和端口可达；Shelf 的正式装配、全部 UI/桌面切换仍在后续原子迁移片。不能靠旧 Host provider 兜底完成前置验收。

## 1. 结论与现有证据

最小完整前置由两个串行子片构成：**受控 owner 文件树**，然后**Home 调用中的项目成果/过程项/连线服务**。后者还必须让现有项目连线图识别 Home 参与者；只把 services 塞进 Home executor 不够。材料被动状态和 PDF bytes 预览可作为同一前置的两项小接缝，不建设另一套材料或渲染平台。

| 当前实现 | 保留的事实与缺口 |
|---|---|
| `modules/shelf/src/store.ts` | catalog.json v1、files/<item>/<Unicode name>、jobs/<job>/input/output、manifest.json、任务事件文本；构造即 mkdir，snapshot 的 ensureSample 写示例；保存 catalog 为临时文件+rename。read/edit/delete/copy/freeze 都是同步 fs；任务等待前后已有内容 hash 与执行生命周期。 |
| `apps/local-host/src/plugin-files.ts`、合同 plugin-files.ts | 单层 ASCII 名、独占创建/删除，已有 NOFOLLOW、普通文件、字节上限、等待前复制 bytes、最终同步授权。不能靠扩大 directory 值把它伪装成 Shelf 根；不能破坏 Images 对 create-exclusive 的依赖。 |
| `home-plugin-executor.ts` | 明确拒绝 artifacts/process_items/ports 声明；没有项目服务。它的代次、撤权、stop/revoke/dispose 顺序可复用。 |
| `plugin-host-services.ts`、`plugins/native/artifacts/src/plugin-client.ts` | 现行固定版本客户端，身份从 Host 绑定，读按 consumes；processItems 仅 record，成果 head/readOwn 不查询过程项。createPluginArtifactClient 会登记 sdk.artifacts.<install> provider，不能每个请求反复创建/覆盖。 |
| `packages/plugin-runtime/src/services.ts`、`wiring.ts` | inputs.reference、outputs.select 的类型/生产者/签名/CAS已存在。图的 requireManifest、enabledPluginIds、generation、ensureStarted 都依赖项目 lifecycle；Home Shelf 从项目监督器移除后不自动可见。 |
| `shelf-actions.ts::publishShelfMaterial` | 手算自己的过程项版本，检查 owner/producer/signature/type，同正文复用；不自动改 output。应移回 Shelf 编排，读取和写入经共同服务。 |
| `project-plugins.ts`、`coding-shelf-material.ts` | 当前列表包括未连到端口的固定报告和变更；Host import Coding preview 进行领域校验，再组织 Shelf 副本文案。不可把这份 import 直接搬进 Shelf。 |
| `client.ts:249,265`、`shelf-native-plugin-http.ts` | PDF 当前 iframe 直接 src 指向旧文件 URL，靠 inline application/pdf；不是已有 blob 渲染。Runtime `plugin-route-operations.ts` 只准位图 inline，其余 attachment+octet-stream+sandbox。直接换 URL 会退化。 |

## 2. C：可信 owner 文件树，范围有限的同步提交

建议新增 **独立的 PluginOwnerFilesClient / Declaration**，不改变现 PluginFilesClient，也不交 Home 路径或 Node fs。声明来自可信 builtin 条目，包含单段 store_name、允许的顶层单文件/目录（Shelf 为 catalog.json、files、jobs）、读写权限和实际现行大小约束。不从 Manifest/action 输入接受绝对根、任意服务名、运行任意代码/SQL。声明只向可信 native executor 提供，sandbox 与 upgrade validation 不得获得。

**最小操作**：read(relative)→字节或 null；list(relative)→只含名称与 file/directory 种类的直接子项；write scope 内 mkdir(relative)、write(relative, bytes)、replace(relative, bytes)、copy(sourceRelative,targetRelative)、remove(relative)、setReadOnly(relative, boolean)。相对路径仅在已声明树内；copy 只允许同 owner；replace 由 Host 在同目录生成不可预测临时名并原子 rename；不暴露任意 rename、chmod 位掩码、append、绝对 resolve。事件日志先读再 replace 即可。递归复制/遍历/冻结的**业务顺序**由 Shelf owner 组织，Host 的递归删除/保护检查必须覆盖全部节点。setReadOnly 仅在该 owner 树生效，用于保留现 0444/0555 input 与恢复目录的行为，不授予外部路径操作。

写入方式采用 `write(control, synchronousCallback)`：先冻结本次 bytes 参数或在同步 callback 内从 owner 读副本，await 原 beforeEffect，随后检查当前 Runtime action、安装身份/代次、声明权限、caller.permissions、signal、原 caller.assert_authority_current，再发一份只在 callback 栈内有效的 writer；每个写原语再做同步检查，callback 不允许 Promise，退出后撤销 writer。它**不是文件系统事务**，不声称失败可回滚多文件；现 catalog 原子替换仍是可见提交点，目录/输出先于 catalog 的部分失败按现 Shelf 恢复规则处理。不要为这次迁移引入 WAL、第二份 catalog、文件操作日志或事务模拟。

这避免把几十个同步 Store 操作全改成独立 await，导致 edit/remove/任务结果的中间状态被别的调用插入。`ShelfStore` 接受窄 IO 接口，不再自行 root 拼接后调用 fs；同一 Home 唯一运行实例保持原领域 owner，不新增第二个 store。长任务只在 prepare 与 finalize 的同步段获得 writer，中间材料/模型等待不持有写入权；finalize 再检查本次配置、输入 hash、任务状态及 SHM validateResult（成功和失败）。原 caller 的最终权限检查是必需项；仅检查 install grant 不能拦住一次调用的撤销。

安全规则：拒绝绝对路径、空/./../NUL 段、平台分隔符绕过、任何父链或末端 symlink、非普通文件；Unicode 名正常通过，不将中文改 ASCII。读取逐步限流而非先读全再量。已有 catalog.relative_path 是磁盘输入，也必须过同一校验。owner 根不可指向 Home 根，可信登记按现 store registry 防止两 owner 占同根。拒绝对别的 owner 的任意路径；父目录 realpath/lstat 与末端 NOFOLLOW 的限制和本机并发替换风险应按现本机威胁模型测试，不宣称只靠字符串前缀能防符号链接。

**生命周期**：构造改为纯读；授权 activation 的初始化阶段以仅本次启动有效的 writer 创建 files/jobs 并运行 owner initialize（检查现 catalog，首次空架 seed 一次）。注册动作前完成；stop 前先撤销初始化和 action writer，stop 本身无业务写能力。这样第一份对外 snapshot 仍含示例，查询本身不 mkdir/seed。需在唯一 spec 明写“初始化从首次 snapshot 移到已授权 activation、对外首次展示不变”；未接受此语义前不实施。已存在错版/坏结构拒绝并保留字节；旧 running 不重跑也不继续锁材料，显式取消仍可关闭旧记录；不顺手清理旧数据。

**原件与桌面**：owner IO 不读 origin_realpath。当前 `items.admit` 只检查 audience=user，网页 user 请求也能传路径，不能把它说成已证明的桌面来源；admit-folder 目前连该检查都没有。原件 Hash 是独立可信本机入口责任：原生导入取得的只读来源绑定由 Host/desktop 边界核实，普通业务输入的路径不变成读取能力。先查现桌面可信 IPC/导入选取能力并复用；没有能力时，这属于必须明确的小合同（可信来源句柄，不是允许路径字符串），不能在本前置伪造桌面身份。既有 origin_realpath 数据不删、不重新格式化；迁移如何为既有路径建立可信只读检查须单列决策，不能静默忽略原件 Hash 或增加历史读取兼容。导出/拖出仍由桌面已授权入口从 owner 中的 item 定位真实副本；不向普通插件提供任意 resolvePath。现 snapshot.root 及 Rust 直接读 catalog 的 wheel_enabled 是后续切换审计对象，本前置不改格式或掩盖依赖。

## 3. D：同一组服务按真实 invocation 选择项目

保留 `services.artifacts / processItems / inputs / outputs` 的语义，在 Home activation 暴露同名**动态门面**；不新增 `project(id)`、services map、输入 project_id 或第二个项目 Shelf 实例。每次调用读取 currentPluginAction，要求同 install、尚在原动作、caller.project_id 存在；Host 从该可信身份解析已打开真实项目 runtime/coordinator。只接真实项目 runtime 的公共 APIs，不借 Store SQL，不从 Home start context 的空项目猜。

读检查 manifest、action 声明、原 caller 权限、安装代次、项目实际运行实例、可见性与取消。写先 await 原 caller.beforeEffect；随后在同步 `projectWrite(control, callback)` 提交段检查原 caller.assert_authority_current、project runtime identity、当前可见性，再让 callback 使用原同步 record/select，避免“await 后借新项目”的窗口。外层命令已通过 owner binding 的同步提交可复用同一个同步 gate；不要改为拿 Home 用户/安装静态权限创建新 action。保留最初 action scope 标识，缓存的客户端/回调到另一次调用或原动作结束后都拒绝。

项目身份须同时绑定 runtime/数据库实例生命期，而非仅 project_id 字符串：删除后同 id 重建不能让旧结果进入新库。复用 ProjectDeletionService 和已有 project route control + caller authority；必要时给现 runtime owner 加一份对象身份撤销闭包，不建持久 generation 表。删除项目不 purge Shelf 个人材料/已接收副本，只取消依赖该项目的在途发布/接收/选输出。

**复用底层，而非新造规则**：提取 `createPluginArtifactClient` 内现行 owner 操作构造为包内共同实现，现项目 SDK action wrapper 与 Home invocation wrapper使用它；外部包只拿该 owner 包的公开工厂。禁止每个 Home 请求 registerProvider，也不要在 Host 复制 consumption/producer/版本规则。现 sync action wrapper继续过原授权；若改公共 factory 名称/签名，同步 API快照和调用方，不放兼容别名。

只补以下缺口：

1. `processItems.head(artifactId)` / `readOwn(reference)`：由 Artifacts/process owner 提供，查过程项，不误用 artifacts.head；检查 producer plugin、binding signature、个人 owner，读自己的归档版本仅用于恢复/算下一版，不让它成为可消费来源。返回使用既有版本/head形状，必要的小 process head type不冒充成果的 pin revision。
2. `artifacts.listConsumable()`：合并两个现存 fixed store 中本 manifest 声明可消费且仍可用的固定版本摘要，过滤使用与 read 相同 owner/consumes 规则；不接任意 project/producer 查询。可返回 reference/type/schema/title，正文始终固定版本 read。必须包括未接 ports 的版本，不仅 inputs 两项；自有 Shelf 过程项由 Shelf按目标 type筛掉，不扩成可接受任何类型。
3. 项目图参与者接缝：现 `PluginInputGraph` 强依赖 project lifecycle。将图所需的 manifest/enabled/generation/active 读取与已存在的运行回调接入提成一份窄 participant port，默认仍由现 lifecycle 实现；Host 将已启用且在项目可见的 Home manifest作为同一图的参与者，执行身份仍指向 Home实例。Shelf本次没有 onUpstreamReady，不创建假的 project session/安装记录、不调用第二次 start。默认连接、bindings/output记录仍是原项目图，读取和写入共享这一份；失效后不可继续选输出。不要开放 Home events 或通用跨项目后台回调：executor只取消对本片已经兑现的 artifacts/process/ports 的一刀切拒绝，events继续拒绝。Pages应复用这套接缝，不再另开桥。

Shelf保存项目材料搬到插件域：同一同步提交里重读副本/核预览指纹→process head/readOwn→现同内容比较→record。ID仍 shelf-material:<真实project>:<item>；owner取真实caller，producer由服务定；未变且可用复用旧版、变化+1、旧归属不符拒绝。record完不自动select。select沿原 outputs.select expected_reference CAS，与旧 Coding会话的已冻结输入无关。

## 4. E：Coding owner 验证固定内容，Shelf owner 组织副本

优先复用已有 `coding.artifacts.list@1`、`coding.reports.read@1`/`coding.changesets.read@1` 的 fixed=true 语义，后两者当前入参是 session_id/run_id，不能由 Shelf 解析 artifact_id字符串或信未校验 payload 获得身份。因此本片建议加**一个按 ArtifactReference 读取固定预览的 Coding query**，例如 `coding.fixed-results.read@1`（名字并入主 spec 后固定），由 Coding 复用 `codingReportPreview`/`codingChangeSetPreview`，只读固定版本、拒绝归档/不可用/生产者签名/引用身份不符，绝不退回实时 run preview。原 read 动作保留自身用户动线，不为接缝改其语义。

输入仅 reference；真实项目来自调用上下文；输出为有限 union（report 的 title/body_markdown/saved_at，changeset 的已验证 frozen files/review状态，reference/来源内容hash）。返回完整文本与 review before/after/null，保留已有旧局部 diff 表达，不以摘要替换全文。共享纯数据形状进 contracts；Coding解释领域形状；Shelf负责“副本不代表当前工作区/验收”文案、Markdown fence、来源和 preview fingerprint。Host不再编码这些文案，不import Coding preview，Shelf不import Coding实现。

候选列表走 listConsumable + inputs.reference去重，预览逐项调已声明 Coding query（或已验证的普通 consumes read再交 Coding query核验）；一次生成指纹只用同一次固定记录，不混两次读取的 title/payload。receive提交时重新读取、核 expected_fingerprint；外部query是await，因此必须重新核原Shelf invocation并在最终同步owner写段保存，不能保留现“命令后均不yield”的假设。Coding不可用时明确拒绝新接收，已有个人副本继续可读。

## 5. F：被动 OCR 与 PDF 预览

`materials.availability()` 增加只读 `{ image_text: boolean }`，复用 `materialImageTextAvailable`；仅 materials:read 的真实同安装query/action可见，查当前授权/生命周期，不要求 concurrent，不联网、不下载、不启动probe。extract/readSource继续现并发执行口，不因availability而放宽下载同意边界。

PDF优先在**Shelf客户端**使用已有文件动作/Runtime bytes返回的已授权bytes，确认该item为PDF并检查PDF文件头后构造 `Blob(application/pdf)`，在原iframe位置显示并管理object URL；选择切换/隐藏/卸载/失败均释放，迟到回包不能覆盖新选择，嵌套文件夹PDF同样支持。保留附件响应、HTML/SVG强制下载以及原Host安全头，不能给所有插件开放 PDF inline来“顺手修好”。必须真实Chrome证明下载头下fetch→PDF blob→内嵌能看（页数/可视内容），且当前CSP允许；静态代码没有证明此路可用。若实际平台PDF viewer或CSP阻止，回到主spec提出窄PDF预览合同并补拒绝回归，不能偷偷扩大MIME名单或以提取文字替代PDF。这里不安装PDF.js、不新建预览服务。

## 6. 顺序、允许修改范围、验收

唯一writer串行：C合同+Host受控IO+真实Runtime fixture → D owner API+图参与者+Home invocation fixture → E Coding固定query+Shelf纯转换 → F availability/PDF可交互探针 → 主会话核证据后另做Shelf正式切换。A/B SHM可作为调用合同，但未通过运行验收前不得用其作为新slice的成功证据。

允许文件（主会话收口共享枢纽；不默认扩大）：

- C：contracts/platform/plugin-owner-files.ts及plugin导出；Runtime action-scope相关门面新文件；local-host/plugin-owner-files.ts、可信entries校验、home-plugin-executor.ts与project executor装配；modules/shelf/src内窄IO接口/Store替换及配套测试。先保持旧正式装配，用 fixture实例验证，禁止混用两个真实writer。builtin条目最终切换另片。
- D：contracts/platform/plugin-artifacts.ts及必要plugin类型；plugins/native/artifacts/src/plugin-client.ts及对应包内操作工厂；Runtime services.ts/wiring*.ts/lifecycle窄接口；local-host通用Home项目门面、project runtime生命周期/现Home装配；对应owner/API/安全测试。不得改其他owner数据库或借SQL。
- E：Coding route-actions/固定预览handler及公共数据合同；Shelf material/runtime-actions纯编排。删除 coding-shelf-material.ts、project-plugins shelfPorts 与旧publishShelfMaterial在正式切换片，前置不得留下两套被激活的规则。
- F：plugin-materials合同/Runtime/Host adapter；Shelf client的PDF object URL生命周期；现material与浏览器测试。无权限修改MIME全局门禁、预算上限、Prologue vendor。
- 文档/API/actions/security/边界/资源快照、spec与Skills由主会话串行统一维护；测试新增CI子集仅选实际快而稳的文件。

验收编号供并入唯一spec，测试标题逐条注明：

| 编号 | 可失败的验收 |
|---|---|
| SHF-C01 | 真实Runtime保持catalog v1字节语义、Unicode目录/嵌套PDF、编辑与结果原目录；新空架首个snapshot有一次示例，删除重启不再生；查询本身不写；错版拒绝不改。 |
| SHF-C02 | traversal/绝对/父链和末端symlink/非普通文件/跨owner拒绝，目标与原文件字节不变；同owner复制/冻结有效，input与原件hash保持。 |
| SHF-C03 | beforeEffect悬挂期间取消/撤权/停用/升级/重启，以及持有writer到回调后/另动作后均零写；bytes等待期间篡改不改变本次接受内容；异步callback拒绝。 |
| SHF-C04 | 多文件中途实际失败不产生成功catalog记录；恢复不重跑模型，旧running不锁材料，合法显式取消可收尾；失败顶层snapshot与receipt保留原语义。 |
| SHF-D01 | 两个真实项目+Home唯一fixture，页面/MCP/workflow调用的project/actor正确；伪身份、无项目、错安装、query尝试写拒绝，固定版本落原项目库。 |
| SHF-D02 | caller最终同步检查、项目隐藏/删除/同id重建发生在await窗口均零业务写；不清除个人副本；旧服务句柄不能借新动作/新项目。 |
| SHF-D03 | list包含未连端口的固定版本，拒绝不consumes/别actor个人过程项/归档；process head/readOwn不读成果表、不读别人producer；同内容复用、改内容新版、陈旧output CAS拒绝。 |
| SHF-D04 | Home参与者不增加项目安装或第二start；默认Shelf→Coding材料连接仍在现图；选择改变新输入而不改旧Coding会话，停用/隐藏后拒绝。 |
| SHF-E01 | 按精确reference读取固定报告/变更全文，错误producer/signature/identity/归档拒绝、无实时fallback；receive重读指纹，重复接收保留编辑；插件间无implementation import。 |
| SHF-F01 | OCRavailability无网络/secret/native启动，权限失效拒绝；实际extract行为与下载同意拒绝不变。 |
| SHF-F02 | Chrome根文件/文件夹PDF实际可见且无下载替代，切换/卸载object URL释放、迟到回包丢弃；HTML/SVG仍不可同源内联执行。 |

按主会话排期先整体build，定向原有用例：shelf-current-format、shelf-material-extraction、shelf-job-runner、shelf-settings、shelf-terminal-recovery、shelf-coding-materials-http、shelf-project-results-http、plugin-artifact-client、plugin-host-services、security-invariants-plugin-files、security-invariants-home-route-project、security-invariants-plugin-materials，加新增前置fixture测试。浏览器PDF与后续完整Shelf流程分证据；Rust真实拖入拖出/轮盘验证在正式切换片单列。共享核心全量/API/actions/health/boundary/assets由主会话安排，本文未运行任何命令证明成功。

需主spec确定的两个语义点：①授权activation初始化替代首次query写示例；②现有origin_realpath的可信来源验证及既有记录处理。其余是上面已限定的实现选择，设计不要求新增审批，也不提前启用Home Shelf。
