# 审查覆盖记录

当前范围以 main `f1e875d11e` 及本轮改造为准。主干登记 76 包，候选登记与下表 75 包的路径和成熟度相符，另核对本轮已批准移除的 WebQuery。公开合同有 84 个子路径及根入口。主干新增入口、实际持久化和复验见本文末节。 [审查报告](report.md)

第 68–71 批沿正常 Goal 正文和工作台布局菜单复查目录读取及覆盖层。候选双 Goal 窗格 35 次目录读取、36 次开库，逐次授权合计 5 文件 43 项通过。覆盖层由外层工作台用同一标题栏绘制，鼠标和窄屏触控均可关闭并回到保存的两窗格。灵光历史从工作台经过隔离帧传到插件已有编辑器，复验真实前进、已写入内容和失败输入恢复。最终候选定向 3 文件 32 项通过。详见 [QF-71](report.md#qf-71--p2-分栏设置覆盖层缺少可点的关闭入口)及 [QF-72](report.md#qf-72--p2-灵光的历史前进停在列表)。

第51批交集：main dbcf562a67 已在工作树整合。新增既存验收意向恢复及7天草稿找回、trial来源沿原动作入口纳入范围；原本轮原子提交、保存排队/缓存/版本与案例守护保留。首轮9文件63项通过，最终构建/补强恢复与动作合同2文件31项通过，62个受影响包文件907项通过；准确main基线健康通过。后续Skill真实恢复缺口与最终资源/CI仍未完成。

第50批追加：外层attention/后台poll、Inbox固定规则更新、Feed后台集合与菜单、Goal Frame/正文、Home/Settings、分栏/solo/窄屏实际入口已沿公开stage动作与Host装饰追到owner和DOM反馈。集合投影由Goals声明，布局可见性及请求协调由Workbench维护；保留独立成果/输入的游标变化。构建4后15项刷新及1项多窗格全部通过，另有Feed菜单3项、成果/输入返回1项通过；QF-51表列六方向处置、迟到归档有效反证与修复。五样本20条建议p50=5.4秒，最终包要求、性能断言复核、资源与CI继续，未扩大为整项完成。

第50批最终本地结算：57文件607项、实际UI20项、构建4/健康通过；golden以两处已实施变化的精确逆转证明更新，未放宽原断言。最终五样本带其他工作树测试争用p50=9.1秒，collection/实际建议/提示顺序/单次Inbox重读断言均过，保留性能波动。已fetch新main dbcf562a67的79文件，§51待整合，最终资源/CI与原目标继续。

最新交集（main `4cf1c742e6`、合并 `3f9fc4c6b4`）：75包、84个contracts子路径另加根入口。新增 Skill 创作链从 Assistant 工作身份/能力目录、本人 HTTP、能力包页、Host 模型端口、Agent definitions 草稿/案例/回放存储，到本人签名安装、正式包版本和界面回执逐段核对。第45批10文件83项定向通过，含原完整实操和6项新增浏览器恢复；仍在核采用的异步安装与草稿清理交错，最终CI和原六方向整项未完成。

| 六方向 | 本次 Skill 交集证据与处置 |
| --- | --- |
| 状态 | 保存事实归 Host，未存输入归当前编辑对象；flush失败不离开，迟到采用只结算原对象，读回不把他人的revision配本地fields。trial须在原事务核草稿版本及所用案例快照。 |
| 防御 | 保留本人采用、发布者签名、安装授权尾检、输入schema与采用完整性验证。移除错误的“已请求过保存就能关闭”假设，不添加自动重试或第二份兼容状态。 |
| 干扰 | 失败后输入可重试；每案例最新回放决定采用，旧差异不继续确认，反复试一条不逼另一条重跑。真实模型质量和本人验收仍单列。 |
| 冗余 | 旧 authored.save 已在主干退役，无生产调用；保留现行 draft/read/remove。去掉全草稿最近5次回放截断规则，按实际最多5案例各保留最近事实。 |
| 边界 | Agent definitions 拥有草稿/案例/回放；固定正文版本仍归签名安装。Assistant 身份来自工作上下文，采用不开放给Agent/MCP/插件/工作流；模型仍经agent-host。 |
| 平台化 | 复用动作目录、Observation、签名安装、diff、回执和已提供的采用/回放组件。HostCompleteText用量应补平台口，导航标记应补现有设计系统合同；不能为单一Skill另建用量账、版本库或评测执行器。BL-b42-followups逐条处置见报告。 |

第41批已通过本地验收：沿工作台、桌面壳、CLI、MCP、SDK及插件的实际URL调用核对，只移除旧Events HTTP转发和POST只读例外，公开事件动作保留。未知插件正式动作、原HTTP offers/execute、正式MCP、安装撤权/恢复/停用与实际写入，8文件50项、构建/健康通过。当前包表与登记75行一致（WebQuery退役不计活动包），83个contracts子路径及根入口；这些范围核对不替代最终整合头CI。

第44批完成单目标许可匹配收敛：真实调用的进入/返回和嵌套复核每次仍匹配当前名单，第二个不同目标才建原索引。12文件92项、构建/健康通过；旧无关尾项反证100→0、同轮变更立即拒绝，正式Host/场景/Runtime消费者通过。实际CPU该函数自身3.143→0.972秒，但20条总耗时仍偏长，QF-51继续；没有跨等待授权缓存或缩减审查范围。

第43批继续沿真实授权链核性能：Catalog membership → Home常开插件安装/同意 → Storage当前版本/空间/完整结构 → 当前业务行。结构比较复用平台既有文件身份/schema_version机制，Home保留exact模式，普通baseline合同不变；没有把跨await事实或只读连接缓存起来。14文件149项、构建/API/健康通过，暖读多余扫描消失，WAL结构/版本/归属/失败恢复及实际取消重试保持。UI p50仍约11秒，QF-51未完成，继续按当前CPU实际热点核允许动作名单匹配和行读取。

最新交集（2026-11-17，main eafff2b526、75包）：Inbox 批量判断 → Kernel 场景目录 → 当前授权/实际写入 → attention → Goal 片段 → Runtime stage owner/关联成果。六向处置为：保留唯一业务账与可取消部分成功；目录只读目标行为、授权不缓存；批次让出并仅在建议显示后报告完成；删除无消费者摘要转发；片段收窄到实际 owner 并保留必要装饰；复用 Runtime 读取合同，继续核 Storage 结构校验复用。第40批17文件153项、第42批13文件161项有通过证据；20条耗时p50由22595ms降为10768ms，性能BL仍未关闭，最终全量和资源验收未完成。主干带入的滚轮测试先观察真实落底后保留原向上滚动及重开位置断言，补验14项通过。详见报告，旧表不作为当前整项完成声明。

第39批新增 `horizontal/automation-recommender`、`horizontal/project-approvals` 已从登记、项目到达/Assistant/创作台、Web/CLI/管理 MCP、Kernel、事实 owner、存储及反馈追踪。六向结论：临时建议与固定文稿分开；保留权限/目录等待后复核；页面隔离旧读取且不自动启用；两包有真实职责与消费者；偏好/文稿、平台决定/业务各有主人；Acceptance 同事务缺口应复用现有跨库原子及恢复能力。QEA-84 已实际复现最终提交失败仍留下认可（QF-48/P1），现迁共享同连接事务；QEA-84–86 的最终失败、清理故障、真实进程中断/恢复和原成果消费者8文件41项通过，必跑与准确头CI继续。新增包视觉和外部执行未声称通过，交集验证及失败处理见报告。

状态：深入检查进行中（2026-11-17，负责人 Codex）。当前整合 main `4cf1c742e6`，登记75包、84个 contracts 子路径（另有根入口）；Skill草稿/回放/采用的新调用链加入六方向交集审查。下表按当前包登记列出检查入口，详细改造及最新验证见上文与报告，不能据此宣称原任务已完整验收。初轮和中途检查点的回归结果作为历史证据分别保留。登记核对、静态检查、构建通过均不等于业务路径或外部服务验收。

## 主干新增 Sessions（已整合，定向验收通过，最终门禁待完成）

主干增量 `4a08c41ca` 新增 `horizontal/sessions`，已整合并完成74包构建。已独立核其公开动作/HTTP、后台发现、正常 UI、系统搜索与助理材料路径。状态：范围/归属/发现事实归 Sessions，修复 UI 迟到回答与云账号身份；防御：保留文件根、只读命令与尾检，模型前补当前材料范围复核；干扰：接通分页/检索/旧命中直达、连续换账号保存、读取中返回及失败回列表；冗余：去除保存后额外发现、文件流改用原生 signal 生命周期；边界：原工具拥有正文，Sessions 管许可/索引/归属，Projects 管目录，AgentHost 发模型；平台：复用原读取与动作目录，按 key 读取补同次授权的元数据，不新造状态库。QEA-29～32 浏览器13/13通过，QEA-36/37 文件流与开头材料的真实回归通过；连同 Goals 空画布 QEA-38 的补充8文件94项通过（golden另有2个生成模式按默认跳过）。具体日志/限制见报告；最终资源、全量门禁与当前头CI仍待完成。无真实云服务/模型质量或本人验收声明。

Git QF-03 的独立与 Coding 内嵌入口已补真实仓库复现：提交说明刷新丢失、冲突编辑切文件丢失，四项均有效失败；现已实施并完成下述定向验证。Goals 空项目动量链 QF-20 已由真实浏览器400复现，调用方省略空选中参数后正常200及已有布局/失败重试通过。

## 接续深查：Git 编辑、Coding 交接与平台草稿

实际链：独立 Git / Coding 的 clientUses → Git 同一表单与冲突编辑器 → 安装/项目隔离的 UiPageDrafts → frame broker → Cache；操作走 Git route/page action → Kernel → Host workspace Git → 原人审 → 固定文件/暂存区 → owner operations → 按原 operation_id 与提交快照清理。Coding 的真实 SDK 写入审查完成后，从轮次提交按钮经注册模型提示词生成建议，再由 Git 公共客户端确认原目录并实际保存；不再按私有 storage 键旁路。

| 方向 | 深查依据与处置 |
| --- | --- |
| 状态 | 编辑事实归 Git，业务成功归 Host。最小 operation_id/提交快照关联随草稿存，重载后从实际 operations 核对；拒绝、失败和未知不冒充成功，成功只清理相同内容。QEA-34 保存/删除交错证明后续编辑不被旧成功清除；已确定的输入目录创建审查前拒绝清除无结果可等的操作关联，实际Cache残留1→0并保留正文已通过。 |
| 防御 | 删除从未接生产路径的旧 parseStoredDrafts 坏值转空、4KB截断逻辑及其镜像用例，不复制到真实编辑器。保留实际 Cache 读取/写入失败、Host 修订、路径/锁/权限边界。冲突解决后刷新索引只改 stat，19项 Host 回归保留改写/链接/锁/过滤器拒绝。 |
| 用户路径 | 两个入口的手写提交、目录切换、长冲突编辑、拒绝后重载均保留；当前磁盘改变时可展开只读原文，保留手写内容并阻止旧基准直接提交。Coding 迟到建议显式采用，交接失败重试不重新花模型调用，原目录消失不回退其他目录。 |
| 冗余 | Git private 包的旧 drafts.ts 仅出口+单测，无生产读写者或 Home 格式，按阶段一移除出口/旧实现/唯一版本表项。实际公共插件开发边界 contracts/SDK 不受影响。平台已有 drafts 被采用，不加插件自己的排队/延时保存机制。 |
| 边界 | Git 从不执行 git；Host 固定已审 blob、持文件与索引锁并复查 HEAD/index/文件身份。Coding 不写 Git 缓存键、Git 不 import Coding 实现；挂载和借用仍走已有 clientUses。缓存结果只负责编辑恢复，不成为业务成功账本。 |
| 平台化 | QEA-39 在已有 broker 补同键读/写/删除顺序，真实 Cognia/Todo消费者制造 Cache 写入交错复现旧覆盖，修复后连同账号准备/隔离/原 Coding/Todo 共21项通过。作用限同挂载页面同键，不宣称跨页合并。Git 采用该合同并覆盖独立/嵌入调用。 |

验证分层：平台4文件21项；Git 编辑浏览器10项、Host操作19项、客户端打包2项均通过。Coding 真实 SDK、文件人审、模型生成、迟到手写保护、存储失败/交接重试和移除目录场景1项通过，模型只用隔离 Home 的 loopback 可控响应，不代表模型质量。QEA-40 初始失败到修复及其他暂存数据/过滤器/hook守护2项通过。追加输入目录恢复、同目录刷新/切文件/冲突解除交错使编辑用例达12项全过；原生命周期14项和源码控制1项通过。旧出口退役后插件9项通过；三宽两主题6图已生成，查看中另确认QF-23窄目录栏体验仍待改造；不将这些定向证据当最终头 CI 或整项完成。

## 接续深查：搜索与引用（定向验收通过，最终 CI 待完成）

实际链：Home/项目 `/api/search/{query,open,status,references}` → `handleSearchHttp` → `bindLocalWebActions` → Kernel → `SearchService` / `findReferenceCandidates` → 注册来源与对象读取器 → `openTextSearchIndex` / HTTP 回执。另核对 composer `pick`、MCP 原授权测试、Knowledge 的 `indexedCatalog` 及后台 `refreshKnown`，避免把所有等待都当作用户请求的状态。

| 方向 | 深查依据与判断 |
| --- | --- |
| 状态 | `inflight` 是 source-key 去重的共享索引任务，`changed/syncedSeq` 是失效代次；query 的 caller.signal 是单次请求控制。QEA-12 验证一个请求放弃不取消共享工作、不重复列表/正文读取。 |
| 防御 | `queryAuthority` 的异步与同步尾检保留。`open` 和 `ownerRead` 把取消当作不可用的 catch 已复现；第五批改由原调用信号拒绝，不进行错误的存在性恢复。 |
| 用户路径 | 真正 HTTP 断连后 Home/项目 owner 读取原来继续，导致放弃无效；下一次同操作和正常完成均纳入测试。Home 引用读取仍按既有合同拒绝缺项目，未擅改语义。 |
| 冗余 | Host 已有 `responseAbortSignal`，搜索采用这一份，不复制 composer 的手写监听。来源发现的等待前/后读取承担不同授权职责，不删除。 |
| 边界 | Host 拥有传输生命周期，Kernel 拥有最终执行控制，Search 拥有索引；插件拥有正文。个人空间 `open` 原来换 access 丢信号，直接服务回归已证实。 |
| 平台化 | 复用现有 Host 传输信号与统一动作控制；共享索引不能归入每次请求。余下 HTTP 手写监听按真实语义分别检查（一次动作、SSE、长时后台不同），不机械合成一个生命周期。 |

修复前证据：`system-search-cancellation` 的 Home/项目断连失败；`system-search` 的个人空间取消拒绝失败、共享索引共用成功；`search-references` 的取消拒绝失败。首次测试夹具错误（不存在的 Host 方法、缺少必需 open 字段、Home 引用范围假设）已修正，不能算产品缺陷。第五批定向回归已完成：HTTP取消4项、服务37项、Host1项、预算1项、引用4项、对象权限3项及 stdio MCP授权12项通过；保留前次7项超时未定位的记录，不以重跑删除。完整证据见 report 第五批记录，最终头CI与其余路径组仍待完成。

## 接续深查：Home 后台任务（第六批，定向验收通过，完整门禁待验）

实际链：Home 首屏/恢复可见/attention changed → `/api/attention` → `homeBackgroundTasks` → `collectHomeAggregate` → 已打开项目的公开来源 → Kernel 只读调用 → Mainline 行投影 → side tasks。停止命令另经 `background.tasks.command` 重新核对来源当前仍提供该命令，不信页面旧按钮。

| 方向 | 深查依据与处置 |
| --- | --- |
| 状态 | 插件持有任务状态；Home 仅投影当前可读任务与读取完整性。来源读失败不能推断任务结束；整段读取失败保留上次行但明确暂时不可用。 |
| 防御 | 保留 `isHomeAggregateQuery`、只读上下文、当前暴露和异步权限复核，这是跨插件信任边界。无效整份回答记 issue；单行过滤沿既有 Mainline 合同，不借本次删除拒绝检查。 |
| 用户路径 | 已安装来源全部失败目前显示空态、部分失败数量缺少提示。QEA-14/15 将从真实来源故障走 HTTP 和正常页面验收，原位重试只读不重发命令。 |
| 冗余 | Home 重复 `backgroundTaskOrigin`、tasks 数组和逐行装配；改用现有 `backgroundTaskRows`，终结行过滤仍由 Home 列表语义决定。 |
| 边界 | Host 拥有打开项目集合与来源聚合；Mainline 拥有通用行投影；插件拥有事实/命令。工作台只解释完整性，不按插件名猜恢复方式，不显示诊断原文。 |
| 平台化 | 补齐已有 Home attention 消费合同，与项目后台表使用同样的 tasks/issues 语义；不增加另一轮询器、缓存、状态机或来源名单。Coding、Images、第三方 fixture 及真实停止消费者同步迁移。 |

静态证据：`home-background-tasks.ts` 丢弃 `collectHomeAggregate` 已保留的 issues；客户端仅认数组。真实 HTTP 基线 `home-background-completeness.test.ts` 已复现：Beta 来源抛错，回答没有 issues，期望 1、实际 undefined；故障原始内容未被当作页面材料。正常 Home 浏览器验收进一步复现选中项目时走项目 attention、得不到 Home 任务；已在原单一读取上补 Home view，并保持可信插件页面拒绝。

修复后串行构建/验收：`home-background-completeness.e2e` 2/2、`coding-background-tasks` 8/8、`security-invariants-home-aggregate` 6/6、`home-background-completeness` 1/1、`attention-route` 8/8、`host-log-catches` 7/7、`home-aggregate` 9/9，合计 7 文件 41 项通过。12 张中英文/三宽/明暗截图已生成，实看英文390深色与中文1440浅色，说明、真实任务、重试和数量下界可见且无溢出。补充原 Coding 子进程停止 1/1、插件页面边界 34/34 通过。尚未完成新 head 的资源、全部必跑和 CI；不等于全任务完成。

## 接续深查：项目任务操作与 attention 上下文（第七批，定向验收通过）

入口：项目工作线任务标记 → 列表/任务卡/事件卡 → `/api/mainline/tasks/command` → Mainline 再读取精确来源 → 插件命令 → owner 事实 → attention；Home chooser 选择项目 → chosenRoute → 同一个 attention 读取及订阅 → 助理提示/后台列表。

| 方向 | 实际检查与处置 |
| --- | --- |
| 状态 | 页面尝试与任务事实分开；进行中尝试跨重绘共享，成功只等同一来源的新读取。请求持有自己的地址和 controller，旧 finally 不影响新请求。 |
| 防御 | 保留 Mainline 的当前命令/输入复核；删除以命令数量猜测任务未变的缓存判断。迟到回答按实际请求身份拒收，不逐消费者各加一套猜测。 |
| 使用体验 | 用户不再重复点击等待中的停止；同参数命令重新合法提供时可继续操作；切项目不用等旧项目响应，旧 404/网络错误不污染新页面。 |
| 冗余 | 完整投影替换人工维护的字段子集；三个任务展示位置复用同一个控制器，不各绑一次正在执行状态。 |
| 边界 | 插件拥有任务与命令，Mainline 拥有发现/执行复核；工作台只拥有一次 UI 尝试和读取目标。失败来源精确到 ActionReference，不能用整个 provider 替代来源身份。 |
| 平台化 | 继续复用现有后台任务合同、Mainline 命令入口、共享 UiRequest 和单一 attention 流。Home/项目的展示位置不同，但不复制业务状态机或为 Coding/第三方开专路。 |

旧构建已复现 pending 重画可再点、等长新命令仍提交旧参数、切项目阻塞。第一次修正另被双来源用例证明 provider 粒度过宽，已修为 provider/capability/version。最终 QEA-17 双来源 1/1 与 QEA-18 三种迟到结果 3/3 通过；原 Coding 实际子进程与持久投影 1/1、Home 故障/停止 2/2、助理读取次数 1/1、客户端未声明变量 5/5、工作线标本 12/12、chooser 11/11 通过。context 的首轮错误场景被 CDP 测试拦截器拦住切回请求，修正夹具后 3/3 通过，没有放宽断言/上限。完整门禁、其他必跑和 CI 仍待完成。

## 首轮逐包证据

| 包 | 登记成熟度 | 公开入口 | 路径审查进度 |
| --- | --- | --- | --- |
| `modules/sync-replication` | slice | `.` | `src/index.ts:92,131,151,169`：自动同步、策略保存、停用、批次与回放；身份/策略版本复核保留。未连真实云端。 |
| `apps/server` | experimental | `.` | `src/main.ts:38`：成员授权、配置允许集合、单 Host 转发与退出清理；未开公网服务。 |
| `server` | production | `.` | `src/im/writes.ts:26`：成员内幂等回执与提交后通知；`src/sync/round.rs:8`：策略版本快照。未跑真实 D1。 |
| `packages/im-ui` | production | `.` | `src/browser/controller-sync.ts:10,34`：SSE、epoch、刷新合并和失败保留草稿；不把两个排队标志改成业务状态。 |
| `packages/plugin-sandbox` | production | `.` | `src/runner.ts:31` 与 read protocol：子进程身份、调用限额、取消和受控服务；旧 BL 的进程内执行说法过时。 |
| `apps/desktop` | production | `.` | `src/web-host.ts:12,28`：桌面装配复用 Local Host；终端可用性归 runtime-host。未实操系统 WebKit。 |
| `apps/workbench` | production | `.`、`./terminal` | 资料导入→成果服务、attention→后台列表、chooser→brief、插件 frame→挂载/输入、角色确认。另沿Settings→Kit地址/缓存→草稿动作→SQLite核生命周期；QF-56真实隐藏、失败保存、后退/刷新、迟到读取及资源重试18项通过，含其他设置调用方/包要求共27文件215项通过，最终构建/API/健康通过。其余各批证据见下文。 |
| `apps/local-host` | production | `.` | 动作 HTTP→Kernel→owner；项目/ Home 插件登记、background aggregate、单一项目删除、sourcePull、Memory 身份接线。另核签名采用、模型设置与 Skill/引导的实际写入，见 QF-58、61–64。 |
| `apps/cli` | production | `.` | `src/dispatch.ts`：命令分发与既有 Home 入口；不另开执行事实 owner。安装/公开发版未做。 |
| `apps/mcp` | production | `.` | `src/action-tools.ts`：实时目录→公开动作→Kernel 再授权；输入 _meta 不提供身份。 |
| `packages/contracts` | production | 根入口及 84 个子路径，含 `./modules/sync-replication`、`./platform/sync-transport` | action-input、object-link、plugin-manifest、plugin-sandbox、公开状态：声明与输入/输出的单一合同。Home 回执、后台完整性和页面选择由现行消费者复验。公开导出按其合同及实际调用方判断用途。 |
| `packages/kernel` | production | `.`、`./contextual` | action-schema、action-settlement 与执行控制：输入校验、call/invocation 关联、嵌套调用、beforeEffect；保留异步后授权复核。 |
| `packages/plugin-runtime` | production | `.` | activation-jobs、notification-queue 与调用身份：激活代次/迟到提交、停止与 drain、事务内通知及稳定幂等键。 |
| `packages/plugin-sdk` | production | 根入口及 13 个子路径，含 `./browser`、`./highlight`、`./rich-text` | state-machine、execution-lifetime、browser、sandbox-read-protocol：CAS 状态迁移、取消资源、请求方法差异和生成插件读协议。 |
| `packages/storage` | production | `.` | `src/sqlite-owner-boundary.ts:19,59`：SQLite 实际 prepare/step 授权、finally 清理；升级/快照公开入口核对。第43/47批沿Home成员读取与升级入口复用结构比较，版本/归属逐次检查；QEA-108覆盖空间形式交错和绑定行消失，10文件154项通过，版本文件仍有旧Feed例外待批准。未执行用户存量迁移。 |
| `packages/ui-host` | slice | `.` | `src/index.ts:76,107`、declared-mount-host：登记 surface、owner 与位置兑现；另追 Host surface-slot-http 与 surfaces/position 的受控 plugin-slot，以及 Inbox/Risk/Work Brief 的 UI contribution 声明和 surfaceSlot 消费者，不重建槽能力。 |
| `packages/design-system` | production | `.`、`./produced-text`、`./capability-pack`、`./navigation`、`./work-records`、`./session-sources` | composer-rules 的草稿身份、输入法/发送规则、迟到代次；公开组件/语义样式入口。导入沿用现有组件，Kit 使用既有导航。 |
| `packages/test-kit` | slice | `.`、`./browser`、`./local-host-http`、`./sqlite` | browser launch/close、隔离目录与 CDP；本轮实际使用独立浏览器、临时 Home、真实成果库。 |
| `modules/projects` | production | `.` | project-service、project-deletion：创建/成员/目录事实，删除预检与阶段回执；Host 唯一删除服务保持。 |
| `modules/context-ledger` | slice | `.` | `src/service.ts:28,60,77`：引用完整性、scope 授权、追加版本和 remove；不拥有 Feed/Session 业务状态。 |
| `modules/acceptance` | slice | `.` | state、service：要求版本→交付/证据→机器核对→人认可；状态由事实推导，个人范围仍未完成。 |
| `modules/attention-resumption` | slice | `.` | `src/index.ts:47,99`：显式转换、owner/subject 唯一约束、事件与版本；Inbox 消费服务。 |
| `modules/private-work-context` | slice | `.` | project-setup、project-resolution：确认后稳定请求身份、绑定与创建事务，显式解绑不被历史线索覆盖。 |
| `modules/artifacts` | production | `.` | artifact-document-import、service、original-store：导入固定版本、原件、去重/来源；本轮 UI→HTTP→真实记录已验。 |
| `modules/shelf` | slice | `.`、`./contract` | jobs、job-steps、copy-checks：只读原件副本、任务生命期、写前权限和结果提交；取消后不补业务失败记录。 |
| `modules/characters` | slice | `.` | service 与工作台 client：草稿 CAS、冻结发布、启停/删除、保留未提交内容；确认是否可减少列策略。 |
| `modules/judgment-rules` | production | `.` | authoring-actions、declared-rules：预览/发布前样本、绑定场景、await 后 beforeEffect；规则版本仍归 owner。 |
| `horizontal/sessions` | slice | `.` | 范围配置/本机与云发现/分页列表/详情/系统搜索与助理开头材料；原始事实归来源、许可与索引归Sessions，QF-16～19及正常浏览器/撤回交错已验，真实外部云账户未验。 |
| `horizontal/automation-recommender` | slice | `.` | 项目到达/Assistant/创作台 → 当前动作目录与Workspace → 临时建议 → Pages固定文稿；偏好归此服务，冻结文稿归Pages，失效权限及安装继续拒绝。 |
| `horizontal/project-approvals` | slice | `.` | Web/CLI/管理MCP → Kernel可信决定 → 平台规则/决定账 → 原业务owner；Acceptance联合提交最终失败和真实中断恢复已验(QF-48)，原业务状态不复制。 |
| `horizontal/account` | slice | `.` | session-refresh 与 session-state：Host 单次轮换、多请求各自取消；不取消仍被合法等待者使用的刷新。#2094增量核对authentication:37-65、authentication-protocol:70-77与Host三条登录HTTP入口的句柄、世代和取消检查；中央事实仍归Auth。 |
| `horizontal/agent-host` | production | `.` | prologue-run-store、approvals、reviews、恢复：账本终态与控制意图区分；显示时间另有阻塞耦合 QF-06。未新增真实模型调用。 |
| `horizontal/connector-host` | production | `.` | `src/index.ts:38,67`：受控驱动调用、超时、当前连接复核和闭合失败；Provider 数据仍在集成边界解析。 |
| `horizontal/runtime-host` | slice | `.` | adapters/terminal-pty：独立 PTY、环境键过滤、辅助程序与回放上限；未启动用户真实终端任务。 |
| `horizontal/scheduler` | production | `.` | `src/index.ts:252,274,392`：持久租约、唤醒、续租、取消和最终 lease 检查；与插件业务排期分离。 |
| `horizontal/observation` | slice | `.` | service、records：调用出口采集、事实归属、覆盖缺口与 call/invocation 关联；采集失败不回滚业务。 |
| `horizontal/evaluation` | slice | `.` | run-executor、observation-bridge：获准样本→观测证据/隔离回放→unknown分类；补核#2100的完整分页、留存事实复核、取消补偿和样本统计；相关3文件20项通过。逐条证据读取归PF-13；未把mock评测当真实体验。 |
| `horizontal/memory` | production | `.` | service.write、run-recipe、Host memory-sources：显式原话/来源、插件命名空间、作用域与写入；Coding 特判见 PF-03。 |
| `horizontal/knowledge` | production | `.` | organize、catalog：索引→惰性正文→模型卡片；正文版本复核、截断标识与未知来源保留策略。 |
| `horizontal/search` | production | `.` | query/open 及索引同步：目录发现→等待→原调用身份复核→读；第二次 discover 是安全边界。 |
| `horizontal/appearance` | slice | `.` | selection：选择事实与可用显示分开；失效时保留原选择并呈现恢复项；原子写不因返回错误冒认失败。 |
| `horizontal/kit` | production | `.` | `src/index.ts:25`：声明 reporter 汇总，系统代报白名单属于可信来源边界；不存第二份能力事实。 |
| `horizontal/mainline` | slice | `.` | index 的后台读取、command、事件：保留 issues、重新读取 offered command 再执行。Home 已消费同一行投影和问题列表，见 QF-04。 |
| `horizontal/placement` | production | `.` | project-copy-execution：预览指纹→身份计划→owner prepare/apply→发布；仅声明依赖等待可重试，不吞其他失败。 |
| `horizontal/surfaces` | slice | `.` | composition/fallback：声明发现、授权、组合缓存与 revision；降级只用允许的本地只读动作。 |
| `plugins/official-integrations/catalog` | production | `.` | document-import、http/provider：有限时外部读取、每次 dispatch 检查、HTTP200 业务错误分类；未连真实 OAuth。 |
| `plugins/official-integrations/github` | production | `.` | provider：受控网络、真实/fixture 显式分开、闭合错误与凭据不入内容行；未调用真实账户。 |
| `plugins/official-integrations/gmail` | production | `.`、`./history-cursor`、`./scope` | provider-sync/history-cursor：分页边界、仅完整历史记录推进游标、失败重放与限额；未调用真实账户。 |
| `plugins/official-integrations/rss` | production | `.`、`./host` | pinned-request/host：DNS 固定地址、TLS、压缩/大小限制、取消后释放；不是可直接换普通 fetch 的重复层。 |
| `plugins/official-integrations/youtube` | production | `.` | channel→Host vocabulary/intent/runtime→Runtime sourcePull→Feed，另核真实npm产物依赖；工厂/安装Manifest无消费者，channel与原包名仍需保留。旧工厂/安装Manifest已按第28批批准退役，channel及包名保留，当前来源请求仍通过Host/Runtime，相关拒绝验收保留。 |
| `tooling/plugin-cli` | production | `.` | validate/package-files：只读 manifest/locales，不执行入口；CLI 打包/签名链登记，未生成发布包。 |
| `plugins/native/alchemist` | slice | `.`、`./registration` | SqliteJobRunner、action-operations：持久 job、lease/attempt、取消与事务 fence；Host 特殊装配是已登记例外。 |
| `plugins/native/coding` | production | `.`、`./contract`、`./registration` | session-observation 与 session-lifecycle：只读投影默认不落库；归档业务/执行两份不同 owner 事实并可接续半成功。 |
| `plugins/native/cognia` | production | `.`、`./registration` | actions、ai、drafts：输入材料→模型引用校验→授权写入；saved_id 由资料存在性推导。 |
| `plugins/native/dataset` | production | `.`、`./contract`、`./registration` | actions、promote：模型输入版本、await 后授权/CAS；数据与成果固定在联合事务提交。 |
| `plugins/native/diff` | production | `.`、`./registration` | registration/actions/comparison：公开读取固定版本、变更集与文件，SDK diff 呈现；未私读其他插件存储。 |
| `plugins/native/feed` | slice | `.`、`./contract`、`./registration`、`./store` | 来源/条目/入箱/规则动作、回放、后台连接、来源删除。已迁现有 SourcePull，验实际暂停后旧正文无写入、真实同步及恢复，见 QF-02、05、44/PF-07。 |
| `plugins/native/form` | production | `.`、`./contract`、`./registration` | actions/plugin/store：版本写入、发布固定资料、收集关闭可重开；拒绝旧报告的终态化建议。 |
| `plugins/native/git` | production | `.`、`./registration` | 独立 Git 路由和 Coding 内嵌页面动作经同一客户端；工作区、Git 审查、实际操作回执和界面草稿按主人读取。编辑、固定差异和审查恢复见 QF-03、23、46、65。 |
| `plugins/native/goals` | production | `.`、`./contract`、`./module`、`./governance`、`./page`、`./registration` | actions/module lifecycle-archive：满足后归档、回收恢复、事务回执/事件/active 清理。后台读集合、可见时读正文见 QF-51，平台特判待第 44 批。 |
| `plugins/native/images` | production | `.`、`./contract`、`./registration` | service-job/background/browser request：Runtime job→受控厂商→文件→结果；取消不写业务，孤儿文件下次授权启动回收。 |
| `plugins/native/inbox` | slice | `.`、`./registration` | actions/content/scene：通过 Feed 公开动作取材料、Pages 生成、attention 状态；失效主体保留事项。 |
| `plugins/native/issues` | production | `.`、`./registration` | capture/store：临时采集、取消删草稿、保存前身份/CAS、稳定草稿ID 去重；并发不重复记录。 |
| `plugins/native/jelly` | production | `.`、`./contract`、`./registration` | ai/command-actions：模型只出预览计划，原文 hash/版本确认后提交；日历重复规则是业务而非 scheduler 副本。 |
| `plugins/native/lingguang` | production | `.`、`./contract`、`./registration` | content-actions/actions：公开内容交接、request_id 去重、生成回复前快照与取消检查；部分材料显式标记。 |
| `plugins/native/pages` | production | `.`、`./contract`、`./registration`、`./code-highlight`、`./editor` | actions/ai-run/删除撤销：写作助手失败明确可见，简短命令验证归实际输入边界；版本、保存和撤销归 Pages。 |
| `plugins/native/plugin-builder` | slice | `.`、`./registration` | manifest/agent-state/workflow/SDK sandbox：执行 token、暂停恢复、生成合同与进程沙箱。BL-040/055 的过时描述已校正，仍有来源、质量及跨项目待办。 |
| `plugins/native/ppt` | production | `.`、`./contract`、`./registration` | actions/promote：Pages 经公开动作读取、模型草稿后版本检查、联合成果提交；保留授权绑定。 |
| `plugins/native/risk` | experimental | `.`、`./registration` | review/actions：关闭后复查归档、串行安排及部分失败可见；历次结果/采纳仍在 BL。 |
| `plugins/native/schedule` | slice | `.`、`./registration` | registration/plugin：业务排期归本插件、平台 scheduler 负责持久唤醒与授权；不另造计时器。 |
| `plugins/native/shelf` | slice | `.`、`./registration` | actions/runtime-actions/plugin→modules/shelf：内容与配方入口，文件/任务事实归资料架模块；复用平台后台能力。 |
| `plugins/native/text-stats` | production | `.`、`./registration` | registration/actions/core/ui：公开材料→纯计算→显示，无第二存储或模型入口。 |
| `plugins/native/todo` | production | `.`、`./contract`、`./registration` | organize/actions/store-writes：模型解析有限修复、请求去重、最终事务/CAS、归档需已关闭。 |
| `plugins/native/work-brief` | experimental | `.`、`./registration` | next：running 丢执行进程后 unknown；仅 failed/later 可执行，未知先人工核对避免重复副作用。 |
| `plugins/native/workflows` | production | `.`、`./registration` | run-control/continuation/handoff：持久停用 fence、原请求身份、CAS 交接与部分成功回执；重试不重演未知副作用。 |

另查：`server/src/sync`（Rust 业务）与 `apps/sync-worker`（Cloudflare 入口）不计入 pnpm 包数，已核：Cloudflare fetch/scheduled 直接委托 server/src/sync；round 按空间/策略 revision 查询，变更中拒绝部分结果。未执行线上迁移。


## 接续深查：执行终态与时间保存（第八批，定向验收通过）

实际链：Coding/助理 → AgentHost.start/readRun → Prologue Adapter → SDK 账本事件 → run-store → Node 会话索引 → 恢复读取/运行观测。六方向核查：状态以 SDK 账本为准，显示时间不得重写执行 phase；账本未提交仍保留准入拒绝，不删真实边界；用户不再因为显示元数据收到假 running/session_busy；删除两行错误状态覆盖，复用每轮唯一时间保存；迟到 publish 只触及原 run_id，索引按最新记录更新；无需新平台调度器、重试或第二事实账。

四种终态 × 时间延迟/失败的旧构建 8 项均复现，当前 8 项与真实 Node 恢复/停止及其他消费者共 7 文件 58 项通过。关闭仍等待原资源；真实 Node 的时间写入与启动意图仍共享串行 index.update，不宣称挂住的磁盘事务可被新执行越过。完整门禁与 CI 待完成。

## 接续深查：审查决定的当前可用性（第九批，实操复验中）

真实链：Git 正常准备 → agent-host Queue 的原安装权限/活处理器 → Host GET 投影 → 主审查面与浏览器/电脑侧栏 → 原 respond/decide/consume/SDK 派发。Coding 的变更集/时间线只读能力不提供决定，保持原事实合同。

| 方向 | 独立核查与处置 |
| --- | --- |
| 状态 | pending 不等于能批准或拒绝；现有 receipt、decider、authority 推导选项，不持久化另一份状态。 |
| 防御 | UI 不再提供必拒操作；决定/消费/异步派发复核仍保护真正边界，未删除。 |
| 干扰 | 不能执行的按钮消失，以短句说明重新发起或恢复执行方；不假称全部 pending 都能拒绝。 |
| 冗余 | 三个消费者消费同一 Queue 投影，移除各自只按 pending 推断的规则；有实际语义的人工确认保留。 |
| 边界 | Agent-host 维护活执行方与权限，Host 只投影，UI 不推导安装授权，不恢复旧安装的执行权。 |
| 平台 | 复用既有公共 Review 合同，覆盖三个真实消费端；BL-360 的重启前提现已失效，按现行缺口补齐而不另造恢复服务。 |

当前完整构建、三个消费者和正常 Git 实操通过；隐藏独立 Git 页仍有 Coding 嵌入，运行实例保持，必须关闭最后依赖入口才使旧授权失效，该语义也已验证。更完整的视觉采样与最终门禁/CI 待完成；电脑 WebSocket 为页面消费夹具，Review HTTP/Queue 为真实 Host，不声称已验证操作系统权限或原生控制。

## 接续深查：导入全链与纯动作绑定（第十至十二批，未验收）

导入入口包括资料对话框文件/目录、在线文档、原件上传与模型同意后的流式转写。事实与写入仍由 artifacts 拥有，Host 负责上传临时文件/提取/传输，UI 只拥有待选与待转写队列。状态检查归并两个 busy 入口；防御检查保留最终授权与取消 fence，补丢失的传输 signal；体验区分停止后续与收起；冗余检查移除转写长期保留旧 DOM 行及重复的忙碌控制；边界沿 concurrent 动作追到 beforeSave 与固定版本；平台能力直接复用 responseAbortSignal、BoundActionClient control、NDJSON 上限，不造第二套任务服务。模型原生失败仅保存原件的合同/完成提示另列 QF-14 待实操，未冒称已解决。

Dataset/Form/Todo organizer/Cognia/Images 的公开注册 → Kernel schema → bind → owner 服务/事务逐份核对。纯 bind 迁入已有 contracts 能力；9 处可用性规则随真实调用保留。状态与业务写入仍归插件，最终授权规则不移到转换层；无 UI/数据合同变化。Images DELETE 请求封装、Pages/PPT 权限与 Workflows 上下文包装语义不同，保留。各插件业务其他状态/恢复路径仍须继续审，不以 5 份 bind 迁移宣称五个插件全审完成。

第十二批进一步追原生提取的部分成功：失败/超时回复/空正文仍可保存原件，不能由 UI 用缺少下载需求推断已有文字。成果 owner 从写入 payload 的 content 推导 text_available，两个 import 动作采用同一必填输出，工作台转写据此保留重试。无新状态表，无 warning 字符串解析，无旧结果形状兜底。真实入口的失败/恢复基线与固定版本断言待运行，工程及模型效果分开记录。


## 接续深查：公共输入材料（PF-02，实现验收中）

入口与链：本人底栏 ＋/系统搜索 → parent来源服务 →本人发送 → framed Composer submit → Coding初始/下一轮/steer/等待 →原材料读取器 →AgentHost/SDK输入或等待图 →实际Run/queued_inputs回执 →同一公共组件快照清理。另保留Coding自己的workspace @与长期材料选择。

- 状态：排队事实与Run/发送请求分开投影；迟到回执绑定调用快照，重试身份包含Run/模式/材料；无第二材料/原话账。
- 防御：沿原真实材料/输入授权边界读取，wait延迟开始再读有独立撤权语义；不因读取一次成功删除后续复核，不将未知当未发送。
- 干扰：来源直接在共用底栏选择；失败材料保留在原位置，不要求用户重新输入；移除不偷偷重发，迟到成功不清后写内容。
- 冗余：去除Coding仅清文本回执分支、序号/旧artifact_id混合恢复和恢复后的child代发；平台复用原草稿清理，不另写材料清理队列。
- 边界：父页持本人来源权限，child拿不到列表或未发送引用；Coding负责材料业务组装，Runtime负责输入/原件/回执；公开SDK新增本次submit成功通知。
- 平台：已有来源、draft和回执是本批复用对象；补齐迟到成功通知合同，并由真实Coding调用、原普通composer及真实沙箱frame一起验收。完整通过尚待report更新，BL不提前关闭。

PF-02 接续实证：同 child id shape 重挂通过旧 file input 已卸载确认后，原选中附件在旧实现丢失；parent 复用该 child 的 draft adapter 后 frame 5项与公共 composer 18项通过。Coding 的实际已接收补充丢响应，在原轮结束、按 RC-18/D31 可读 owner 队列后只清原材料，保留新文字/新材料，未重发或自动开轮。另从混合材料失败跟到本地恢复 UI，再跟到 SDK inert 内容净化，证实按钮操作属性丢失；详见 QF-27。扫描16个实际内容安装调用只用于辨认信任边界，其他环境/预算控件尚未动态验收，不把扫描记为完成。

主干整合检查点：`31b0cba134` 合入 #2106 与 #2108，包数仍74。冲突处并入 Home attention 与 Sessions 的拒绝断言、旧页分页/开头消息/范围变化/取消回归，以及新主干账号恢复；parent drop 统一释放 ready 等待、回执和adapter。构建通过后，公开SDK本地子输入、框架来源/重挂、普通输入、真实Coding、Sessions等19文件183项组合验证全部通过（`/tmp/quality-audit-main-635-acceptance.log`）。材料恢复已生成三宽两主题6图，本次复核1024双主题及390深色；重复失败提示仍列QF-27接续，不因按钮恢复关闭整体体验问题。

Memory 候选决定补深：正常助理工具生成候选→卡片HTTP接受/拒绝→Memory公开动作→SDK提交/ledger→后续读取。旧构建在两种实际响应断连交错中均继续写入，QF-30已据此从静态发现升级为真实复现；最小信号修复后取消零业务变动、新请求恢复、正常close不误取消均通过，相关8文件96项通过。QF-31空列表兜底已由正常入口故障反例确认并修复：聚合明确null、独立HTTP安全报错，真实UI重试/恢复有候选及恢复为空、草稿保留、正式写入读回一次全部通过；最终3文件23项、构建与健康检查通过。旧决定转发及重复GET仍待清理；同链新发现候选query会结算过期状态，且短期候选到期仍可显示，按QF-32/QEA-51–52继续复现与处理。当前头Full CI和资源验收未完成。

候选生命周期新增深查（QF-32）：query/read权限→SDK候选manage-read→账注合读→列表/overview；propose→同文/每工作额度；手动/后台upkeep→固定expiry操作→SDK/ledger部分提交及重启。四个旧构建反例确认查询写入和期限/额度问题。两文件42项及真实HTTP取消/维护取消撤权/Memory包必跑19文件209项已通过，构建与健康检查通过；角色候选的完整认可路径、配对query读中写仍未完成。

候选旧路径清理已于64df918968完成：删除全仓仅测试引用的两条Assistant桥决定方法，原业务测试迁移注册Memory动作；删除重复且不可达的第二条GET pairs。构建、6文件44项与包含新安全记录的最终health2均通过，未改变第一条pairs行为。上段“待清理”是此前检查点；仍保留有文档承诺且设置语义不同的旧memories/memory-prefs HTTP，按QF-34继续核实版本与取消，不能据零界面调用删除。


## 接续深查：Coding 环境与子任务恢复（QF-27/29，定向通过）

实际链：正常新会话/末轮→Coding state→已授权workspace Git/文件/工作树动作→共享环境结果→唯一环境卡安装→明确操作准备草稿或原位重试；另从子任务派发/人审→SDK实际失败与budget→主卡/侧栏扩额度→owner写入→本人重试→原Session新Run。后台环境缓存同样按原调用取消与Promise身份检查，不添加第二状态库。

六向证据：状态方面消除轮次/环境读取顺序依赖，失败与已就绪明确区分；防御方面删除吞故障的空事实兜底，保留实际权限和取消边界；体验方面原控件恢复且重试保留草稿，额度写入失败可继续；冗余方面删除重复环境卡安装/匹配，合并前后端形状；边界方面外部模型正文继续净化，本地转义控件由Coding安装，预算事实归SDK；平台方面复用公共renderer、动作与原预算合同，不新增某插件宿主特判。未来公共子任务部件接入依第59批另评，不用未来计划替代当前修复。

真实浏览器QEA-47/48均通过（coding-recovery-acceptance10.log）；环境故障恢复3项、边界5项、真实界面1项通过。模型服务为本机协议替身，不声称真实模型质量；当前包必跑、最新主干、资源及最终Full CI未完成，重复材料失败提示及全仓其他路径继续保留。


## 接续深查：Memory 正式管理与配对查询（QF-33/34，本地验收通过）

旧助理HTTP→本人/项目动作绑定→Memory公开change→Service原版本条件→SDK围栏→业务流水/遗忘→原GET投影；另核旧memory-prefs→MemoryPreferences个人+项目默认事务→具体项目覆写。读取链由正常管理写入→后台upkeep真实形成→只读pairs动作→owner正式记录→设置HTTP/召回贯通。四种旧版本写入及两种实际断连后写入已复现，公开动作迁移后9项通过；查询改决定已复现，停用/启用/明确决定和故障/取消/实际删除2项通过，正式期限补验已通过（3项配对与6项分页合同，`memory-pair-final.log`），分页的原始状态/独立expired合同保留。

六向结论：状态由正式版本/期限和用户配对决定分别拥有，读不可凭可见性作决定；防御复用Memory动作schema/最终fence，不再在旧桥重复校验并丢版本；体验保留读取版本和当前项目，不让过时页面覆盖后来内容，恢复有效配对；冗余移除无独立职责的changeMemory桥并迁真实测试消费者；边界旧HTTP不再绕过公开动作，原设置默认协调确有事务职责而保留；平台采用既有版本/取消/授权/遗忘合同，不新增兼容层、缓存或业务状态表。当前构建与健康门禁已通过；103文件必跑/相关消费者全部通过（已有效通过的6文件与追加97文件，`/tmp/quality-audit-memory-required.log`）；最终健康门禁`memory-management-health3.log`通过，当前头Full CI仍待完成。

## 接续深查：Workflows（六向已核，四项改造及AI恢复变体通过本地验收）

正常页面→Runtime HTTP动作路由→Workflows bind的项目/停止控制/持续授权→公开目录→各内容插件或动作→原pending/attempted/handoff与Store CAS→返回实例/页面；后台恢复依持久pending，由本人继续，异机同步实例只读。状态和用户干扰候选为QF-35～38的迟到归属、冻结提交恢复、明确重试丢失与拦下误报成功；精确版本、目录check先于attempt、最终授权和未知结果拒绝均有实际职责，应保留。save.ts已有按流程/编辑快照排队、失败草稿与开始前等待，不和运行交接混成一个状态。Workflows未私读其他插件表，内容归目标插件；本地bind和内容适配有独立职责，不作机械去包装。平台能力已有目录、事务、公开内容/结果呈现，本次候选应修插件页面意图，不新增工作流引擎或第二份执行账。真实浏览器反例现已确认B实际提交A正文、迟到成功/冲突抢回页面、原已提交改写丢失、明确重试只预览不执行、判断拦下误选下一站（baseline2及retry-baseline）；目录离开控制项通过。第二十五批实现、三宽两主题18图和23文件包回归已全部通过，包含真实停止/撤权/幂等与公开调用方；root实看390深色待交接/未知和1440浅色拦下。AI型pending停用模型后的恢复由真实SDK反例确认，修复后保持原目标/交接键且无新增模型请求，新实例仍需模型；最终构建24文件本地验收与健康门禁通过，最终CI及整项审查继续。

## 接续深查：材料失败反馈归属（QF-27 / QEA-65～66）

真实入口：工作台统一输入选长期/临时材料→Coding开轮→原件读取拒绝→Coding恢复卡及公开ComposerOutcome→框桥→输入草稿/材料反馈。状态保持failed与原草稿，未知/已受理身份不改；去除插件恢复卡与输入框重复解释，并删除卡内重复名称原因的两语言词条。反馈归属以公共可选字段补齐，实际Coding采用、直接composer与框架真实消费者验收，不加插件名特判、状态账或自动重试。普通请求失败仍原位重试，临时失败仍由条目阻止发送，后续明确移除/再次发送才推进。

最终构建和健康通过，129文件包回归、修正准备步骤后Coding整文件6项及普通composer/框架2文件，共132文件有通过证据。首轮130文件中的菜单准备超时保留在report，不当作产品反例。12张三宽两主题图更新并实看390深色与1440浅色混合失败。Skill固定答卷与隔离Home替身smoke通过，仅证明接线；当前头Full CI/新词包资源核准待完成。

## 接续深查：未接入集成与真实来源路径（PF-07 / QEA-67～68）

包清单从74变为73：WebQuery整包退役，YouTube仍在用且只提供频道标识/地址工具。当前Runtime注册只用GitHub/Gmail/RSS工厂及Catalog；Feed公开来源动作→平台SourcePull→Host受控Search Runtime→内容hold→Feed原事务/游标/终态。去掉两个无调用工厂及各自安装、版本、签名，不改用户来源状态、授权或恢复，不把“删除包”当成删除web_query功能。无新增用户步骤。

三个活跃集成安装拒绝反证129项、来源/实际Runtime/取消/撤权/RSS socket/AnySearch/产物12文件均通过，构建和健康通过；真实npm压缩包的频道工具可按原包名导入，YouTube频道新登记/拉取/同键重放实际落库。网络响应受控，不证明公网可达。Feed本地构造指纹intent、Host再次构造的重复仍未迁移，PF-07整体不关闭。首轮73/74包覆盖表是历史范围快照，本节记录本次退役，不用包数计算深查完成率。

## 接续深查：Pages编辑/发布/翻译与平台选择（QF-39～42）

真实入口：文稿标题/正文编辑→本插件保存队列→公开Pages动作/CAS→SQLite→完整回执；存为固定版本→发布事务→失败读回；全局搜索→工作台对象标签→frame select-item→插件GET/保存/导航；正常工具栏整篇翻译→Host模型动作→候选本人修改→pages.create.request_id→实际持久化/显示。取消、失败、迟到、返回和丢回执均通过真实请求屏障及数据库故障验收，不伪造成功。

六向结论：状态以完整文稿/版本、原导航身份和一次候选提交归属收敛；删除将恢复读取伪装保存回执的兜底，保留真实CAS与权限边界；本人不重复生成或重写翻译、不清理重试重复文稿，返回不会又被打开；fillEditor删除隐含后台补存，平台避免与完整处理器重复代点；业务写入仍归Pages，接管声明只规定选择责任，不代表成功或撤销写入；平台补齐现有DOM合同，14个实际完整处理方迁移，PPT行驱动消费保留，无插件特判。平台Host的独立jumpToRecord消费者另行审视，不冒称一并清理。

最终构建/API/健康通过；Pages13条、PPT/Schedule两条正常直达、原空白丢弃28项/草稿队列2项已过；新增明确重选与受影响README并集276文件回归中。6张三宽两主题图已复核代表尺寸，重试按钮几何可达；Skill固定答卷与隔离Home替身smoke3/3通过。真实云端模型、最终CI、资源和整项审查仍未完成。

## 接续动态检查：引导恢复、Feed持有边界、Git结果归属

- 首次引导正常进入/语言切换追到restart保存、IndexedDB恢复、startup绘制；定位两次绘制替换当前问题（QF-43）。过期材料通过真实new-journey按钮，正常SQLite创建成功；真实插入拒绝后HTTP400、busy恢复但按钮仍禁用且无错误（QF-45）。六方向中的隐式状态、用户干扰、重复绘制与入口归属已取得反例，修复与正式验收仍待。
- Feed正常Runtime source.sync→run引用事务→Home ledger真实写账/持有回复→平台正文写入，另一正常enabled动作暂停后仍写正文（QF-44）。这是来源owner尾检缺口，不移除平台的调用身份复核。PF-07采用合同方案已核，尚未实施。
- Git独立与Coding内嵌分别走路由和git.prepare-index公开动作，两个正常入口都复现旧A审查回执隐藏新B操作（QF-46）。后台审查仍合法且未批准index不写；用户界面反馈归当前结果选择，和QF-23布局迁移一起验收。
- Coding首次读取的正式夹具只增加“frame创建操作结束”这一真实等待，去掉诊断后整个7项原断言通过（`/tmp/quality-audit-coding-first-read-acceptance.log`）；原276文件运行中的失败保留记录，不把该运行写成全绿。生产构建未变。


## 本轮更新：Feed公开计划、引导恢复及安装声明（2026-11-17）

上节“尚未实施”为旧检查点。Feed已沿真实Runtime→公开plan/pull→Host网络/正文→run和Home引用账收口，来源与平台各自保留真实围栏；删除私有适配和重复SEL计划，155项原定向及12项新增真实交错通过。自定义RSS和web query覆盖真实消费者，响应仅在网络边界受控；同键重试/清理实际正文通过。引导QF-43/45已修，正常选择及实际SQLite拒绝→重试有19项组合验收和2项六截图补验。完整包回归/当前头CI仍待完成。

安装链另查到QF-47：Studio未打包release→installed.lifecycle→Runtime安装事实→重启AgentBuilderStore恢复，surface-installation对无关缺声明项的全目录硬拒绝使Feed启动失败。按真实引用收窄故障影响；不能弱化同ID精确版本/签名包或complete目录要求。QEA-81/82列入第三十五批，尚未修复。

PF-03已追公开绑定→学习owner→SDK实际来源/写入→清理恢复。BL-memory-session-kinds有用户批准的两个现用消费者例外及第三消费者触发条件；保留已批后续，记为审查/处置完成而非平台改造完成，不静默以此缩减其他方向范围。276文件历史回归保留272通过/4失败；Coding7项及安装策略11项正式夹具修正已通过，安装恢复真实P1继续处理。

第三十一批补验结束：完整 feed-runtime-plugin 75/75、AnySearch唯一owner 4/4、RSS真实TLS安全4/4，共3文件83项通过（`/tmp/quality-audit-feed-runtime-network-final.log`）。自定义RSS与web query真实消费覆盖已取得，包必跑205文件尚未执行。


QF-47本地实现已验证：surface-installation只在非pinned且无精确声明时贡献空动作，完整目录及pending遮盖规则保持；原安装恢复40项及新增正常lifecycle恢复通过，后者明确开启可选平台调用权限后原数据/定时/Feed wake全部成立。SCS-16整文件11项通过，包括缺失引用及同ID pending拒绝、真实安装/pin/包零新增；无新生产导出。测试首版Home unsigned/签名标签和缺可选授权被正确拒绝，修正夹具后通过，不算产品缺陷。日志surface-build、surface-acceptance、surface-targets-final、surface-refusals-final分别保留结果，最终健康与CI仍独立核对。

2026-11-17最新主干a717e44284（#2105第39批，959文件）已fetch。当前固定29f6d1383e的205文件回归继续；根主线准备整合，审查/授权/SDK及真实入口交集纳入QEA-83。此前“最新主干4aa”及包清单为历史检查点，未将旧头验收挪作新头证据；原六方向目标不变。

QF-47最终健康门禁退出0（`/tmp/quality-audit-surface-health-final.log`），测试内部导入违规已消除，未放宽规则。

2026-11-17回归结算：固定29f6d1383e的205文件结束202过/3失败（旧Feed版本例外影响desktop-tui及verify-release-versions，控件远程对象身份问题影响editor-control-names）；后者在主线040f中修夹具后23项通过。固定e7a1c544d2的Acceptance/Storage/Host必跑90文件结束88过/2失败：同一版本例外与secret-store-keychain-retry，后者同头定向复跑稳定出现3次非预期Keychain访问，正在定位，不按偶发跳过。两轮均不代表最终头全通过。

## Git 主结果区与回执归属深查（QF-23/46，QEA-77/78）

入口覆盖独立 Git 与 Coding 借用的同一客户端；目录选择→公开 diff/prepare-index/operations→Host 审查→真实 Git index/文件→原 operation 结果→确切草稿清理。六向处理：分散显示状态收敛到一份选择；保留真实输出目录/版本/权限围栏；冲突正文离开窄目录，错误重试跟随正文；删旧 ticket/displayed/decisionNotice 等被替换路径；业务写入与 owner 回执继续归 Host/原 drafts，展示归选择；复用既有 clientUses/openResult 合同，没有 Coding 特判或新导航平台。新增晚到成功/失败、同键重试、隐藏重入、历史选择/保存交错和实际写入验证，22/22正常入口通过；三宽两主题覆盖两真实调用方。完整包必跑和最终CI另记，不把代表用例当整仓完成。

认可栏QF-49/QEA-87：workbench 原 renderer/styles 的 title/单行截断改为真实正文换行；通过正常界面读当前要求、认可/退回/改要求，Host写入回读原版本/决定。两UI文件7项通过，1440中文及390英文长路径/历史图已实看。状态与事实仍归Acceptance，外壳不再用编辑入口或hover弥补正文不可读。资源与最终共享核心CI继续。

## 自动证据采集与原钥匙（QF-50，QEA-88/89）

真实链为Functions Host/HTTP/MCP只读→Kernel出口→Observation flush/close→Storage原Home密钥库；显式证据读取另沿公开observation.evidence.get。六向结论：钥匙/backend/cache仍由Storage维护，Observation只管缺失及覆盖；不把未尝试解锁缓存成真实Keychain故障；普通读取不再弹凭据交互；同一原缓存由两种访问策略复用，不造密钥或副本；Host按行为注入策略，Functions无特殊豁免；该能力归Storage，env/file和实际解锁消费者同片覆盖。未知摘要不能证明内容相同，删除将空摘要作为读取相同依据的行为。

完整构建及10文件73项有通过证据（首轮Host用例错误期待本人页面query正文，改为正常MCP采集后整文件14项通过）；真实解封、后续加密恢复、旧缺失不重写，跨项目/用途拒绝、原key/backend均验。详细日志及首次失败归因见报告；最终整合头CI未完成。

第46批新增交叉入口检查：项目A/B同时访问同一Home草稿，模型concurrent尾写，真实Home新装/换版及HTTP断连；不是假定“宿主只有一个进程，所以没有交错”。六向结论沿原owner：采用确有短发布生命周期，拒绝期间同draft写而不复制业务事实；保留安装授权；准确报告进行中和失败恢复；移除标题改名的无效trial清理；草稿与案例事务归Agent definitions，正式包归安装服务；复用原事务/错误分类，不给Skill添加另一套安装或版本账。实际SQL拒绝与安装前后交错均有旧反证，QF-53/54定向通过，更广验收继续。

第46批最终定向组合为16文件189项：QEA-107正常动作授权等待跨采用/放弃/第五条后，迟到新增和删除在owner原事务拒绝；不存在新孤儿、第六条或已放弃内容被删。规则从handler等待前迁至store真实写点，属于边界/状态/冗余检查的同一闭环。新增公开合同仅一个conflict错误码，API快照已生成；复核无剩余Blocker/P1，健康与全仓最终验收仍另列。


## 第52批沿签名安装追踪 Skill 采用（最终验收中）

实际入口为能力包编辑页和Home/项目本人HTTP。`skills.drafts.adopt` → `SkillAuthoringService` 生成签名发行物 → `PluginInstallService` 兑现原预览与信任 → Host 安装 owner → Runtime 实例、目录和曝光 → Agent definitions 草稿/案例事务 → 设置回执。普通包复用同一安装收尾。六方向均纳入此调用链：

| 方向 | 发现与处置 |
| --- | --- |
| 状态 | 新装/换版到刷新期间仍属于原尝试，成功边界是同一同步结算。未提交取消回退，已完成不重复，独立停用保留用户选择。 |
| 防御 | 保留调用者和发行物的授权尾检，由安装 owner 执行。删去已离开回退范围的原重复尾检。 |
| 用户体验 | SQL拒绝后正文与原回放仍在，可从原按钮重试，宿主诊断留在调用日志。 |
| 冗余 | Home/Project 外层刷新迁入现有生命周期，复用同一刷新/检查/提交顺序，无专用安装队列或第二份回执记录。 |
| 代码边界 | 安装 owner 持有实例/授权，Runtime 核是否仍是原版本，草稿 owner 写原事务。`complete` 仅为可信组合回调。 |
| 平台化 | 修共享生命周期及精确发行物比较，Skill 的草稿业务不进入 Runtime。使用现有安装、回退、同一错误及文本能力。 |

证据、阻塞清除及局限见报告 QF-58。进程崩溃的跨库一致性并未由同步收尾解决，保持原任务记录。

## 第53–55批草稿编辑、回执和控件复用

真实用户入口覆盖项目、个人空间的能力包和助理回执，沿 `skills.drafts.update/read/create@1` → Host 草稿 owner → 实际保存及操作卡 → Workbench 地址、编辑与比较。Controls 由 Design System 导航模块提供，SDK 操作卡和 Workflows 继续消费同一 action result。六向证据和决定如下。

| 方向 | 入口证据与处置 |
| --- | --- |
| 状态 | 草稿原修订、已存字段与未存输入分别可观察。在途或读取失败保住输入，冲突保留真实新版本，显式选择继续按所见版提交。 |
| 防御 | CAS 仍由 Host 草稿 owner 执行。重复旧修订读写、独立界面时间与失败字段去除。保存重试只在确有新事实时重算。 |
| 用户体验 | 独立更改原位合并，重叠字段看两种实际结果后选择，失效回执按新事实处理，Home 从原工作一击到草稿。 |
| 冗余 | 删除 Workbench 自画的两套页签和分段控制；现有 diff、导航、保存/采用条及 SDK 回执可继续复用。 |
| 边界 | Contracts 验证目的地，Workbench 消费当前设置页参数，Skills 拥有草稿和案例写入，回执不重执行。 |
| 平台化 | Home 目的地为共享 action result 能力。浏览器导航子路径提供现有部件；草稿字段合并为能力包编辑器业务语义。 |

8 文件 78 项定向及完整构建通过。可见、隐藏、重新打开、失败读、重试、采用/试用与正式回执均经正常入口。最终首屏和准确头 CI 待验。

## 第 56–59 批模型结果、原生表单与引导整理

能力包表单 → Skill 改写/案例/回放/采用 → Host 原动作 → Prologue → 草稿/案例 SQLite 与签名安装 → 原页面；引导来源 → `onboarding.context.start@1` → 引导 owner 的分段存储与 Todo 公开动作 → 摘要审阅与重试。模型配置从「设置 › 模型」经目录写入，两条链复用同一 Host 模型检查。

| 方向 | 入口证据与处置 |
| --- | --- |
| 状态 | 草稿修订和有效回放仍由 Skill owner 决定，Workbench 在途状态用于本次编辑。引导运行、Todo 状态和摘要发布分别按各自事实保存。 |
| 防御 | 保留有真实作用的模型、调用者与旅程 epoch 的独立复核，去掉案例提交的重复点击入口。 |
| 用户体验 | 「让助理改」实际提交，原占位词和关停选择在等待期间不被覆盖。引导发现早先结果失效，留在原材料上继续。 |
| 冗余 | 表单共用 SDK 按钮类型和原 submit 监听，复用原模型结果与现有 staging/cache 路径。 |
| 边界 | 模型快照归 Host 传输，Skill 和引导分别决定何时写原事实。Todo 独立运行，页面展示已落定的状态。 |
| 平台化 | 在真实 Host 消费者保留同一执行回执的校验。Skill 的判定、引导的汇总和各自恢复仍由业务 owner 提供。 |

第 56 批 7 文件 86 项通过。第 56–59 批最新组合 8 文件 144 项通过，覆盖原生改写、实际采用、换模型拒绝写入及重试，另验证实际注册的两个建议动作的返回。证据见报告 QF-61–64。Observation 用量、信息建议的产品入口与引导后台任务贡献仍按报告所列继续。

## 第 60–61 批 Git 审查恢复与首屏实测

独立 Git 路由、Coding 内嵌页面动作 → Git 当前选择和准备请求 → 原 Host 审查与工作区执行 → 结果/草稿读回。Workbench 设置遮罩 → 子页可见期 → 原审查槽回读 → 实际决定按钮。

| 方向 | 查到的事实与处置 |
| --- | --- |
| 状态 | Host 账本拥有审查和决定。Git 保留已受理审查的结果选择，Coding 布局取实际打开的 companion，当前会话仍由原选择事件维护。 |
| 防御 | 原宿主批准和实际权限拒绝有真实调用依据。暂时隐藏取消旧读并关闭可信槽，取消的回调仍按旧选择和信号隔离。 |
| 用户体验 | 从设置回来可直接继续暂存或提交审查。Coding 小窗口实际复验能点原审查，跳过重复滚动。 |
| 冗余 | 删除 Git 相邻结果区多次初始化、Coding 重复设置会话详情与 Git 元素，结果索引订阅所在根的同一事实。 |
| 边界 | 原 Git 请求路径和 Coding 授权调用走原合同。Workbench 槽保留空占位高度，重新可见后只从可信 Host 回读。 |
| 平台化 | 共用 Host 审查槽和布局合同，按当前审查内容更新高度。显式返回和工作区写入分别由 Git/Coding 与 Host 维护。 |

已复现并通过 QEA-133 关键路径，三个包的 77 文件、521 项通过。签名呈现和公开动作合同另有复跑证据。QEA-134 对照同基点的真实冷、热浏览器和 HTTP，确认应测的 Home 任务、事件流及 Goal 集合入口。实际首屏登记和当前候选的完整 CI 待结算。

第 62 批。项目首页可见性 → Workbench 读取 → Placement 公开关系 → 实际原件显示与重新定位。删除独立于可见性的重复初始化。12 次真实项目首屏各一次关系读取，旧 Home Events 为零，22 文件194项本地通过。原业务归属、原件和移动证据见 QF-67，最终组合验收继续。

## 第 63–65 批签名安装、数据库提交与组件调用

本人预览和确认 → Install 服务固定发布者 → Home 或项目 Runtime 安装 → 首次运行、冷启动和动作回读。SQLite worker 负责库结构、安装版本及批准的实际提交。Host 负责发布当前版本以及是否能向原确认调用给出回执。签名组件经原页面凭据和动作网关读取本次安装许可，旧调用路径作为明确拒绝验证。

QEA-136 保留 S-80 的包范围、声明和信任拒绝，使用真实安装记录验证 S-84 冷启动的两种失效。QEA-137 覆盖 Home 和项目提交完成、原调用取消或授权撤回、后续读取和同版本重复确认。QEA-138 从真实设置切换权限并经签名页面验证拒绝与实际写入，撤下项目时使用该项目当前成员修订。证据见报告 QF-68、QF-69。

第 66–67 批。安装先写 Runtime 发行物，Home 设置可停用后再排队启用，Registry 只装入当前激活的来源。QEA-139 实测同一安装的确认回执、新登记和拉取，保留迟到 Skill 采用拒绝。QEA-140 经项目工作台实际选择已装插件，按该项目的签名投影打开隔离子页，再从原动作写 Goals；Settings 拥有同意决定，Home 能力开关与逐项目同意各核自己的事实。候选在 18 文件 164 项通过。详见 QF-69、QF-70。

## 第 72–73 批项目同意的呈现、撤回和清理

| 实际入口 | 调用链和状态 | 验证 |
| --- | --- | --- |
| 项目设置的插件登记和签名文件换版 | Home 原安装经项目同意服务提供声明、差集和许可。Workbench 按同一个视图展示剩余声明与新增动作，各动作只渲染一次。Goals 归插件写原事实 | QEA-145 在真实签名设置的首次、同声明换版、动作扩展、取消和重新同意路径读回范围。实际费用说明、撤回及项目隔离通过 |
| 项目删除、个人空间卸载及清理重试 | Host 各入口交给同一个 Runtime 账本。运行库负责主体核对和撤回时间，完整授权读取负责批准集合合同。批量撤回从相同事务写入，只处理相关主体 | QEA-146 实际项目删除、SQLite 安装范围、损坏的批准集合、主体无法归属、写入失败后重开目录、固定 ID 重建、两种真实卸载和重复处理均验证 |

本轮减少重复展示和撤回中的全量明细解码，复用现有项目同意、授予动作介绍和 Runtime 自己的事务。详见报告 QF-73、QF-74。第 72–73 批隔离入口 8 文件 73 项通过。最终组合的 Full CI 和资源验收待结算。

第 74 批从 `inbox.stage.read@1` 和 `inbox.judgment.recommendations@1` 追到原场景，再由 Attention 提供状态、Feed 提供仍需核验的原文、判断账提供历史。已忽略事项依据已有状态继续出现在列表，原文读取故障无需由用户处理。停用或原文变化仍撤回建议，原历史由判断账保留。QEA-147 与现行 Inbox 包要求共 9 文件 71 项通过，含真实隔离 Home 浏览器及原场景停止、取消和写入证据。

第 75 批新增覆盖角色设置、原件与项目成员版本、助理和 Coding 的稳定引用、Agent Host 的每轮冻结及事项容器。检查 `modules/characters` 的角色动作与版本库、`horizontal/mainline` 的创建、关系、排列与工作线投影，核其 Contracts、Host 及配套浏览器入口。范围和六向判断见报告第 75 批。

第 76 批从 `mainline.items.convert@1` 追到 Mainline 的修订和来源动作，再读实际 Goals 和「装进」关系。QEA-149 已经用相同输入对照主干与修复。过期请求返回最新排列且 Goals 零写入，重试后从 Goals 目录读到一个新目标，主线仍是原事项与原关系。

第 77 批沿同入口复验了运行中的排列改动。当前排列获准后，来源先写，另一次主线移动写出新修订，原操作报冲突。重试读回同一个来源，保持只写一次。隔离 Home 签名插件再次经过真实新帧、范围和费用确认，见 QEA-145 与 QF-77。

第 78 批从 Inbox 实际按钮顺序跟到逐条判断写入、Attention 提示、Workbench 隐藏集合读取和 Goals 片段。当前候选宿主在批次中可以回答请求，仍比同机顺次测量的 main 多发 7–12 次后台集合请求。按浏览器网络时刻取得 QEA-150 反证，旧候选请求间隔 451–754 ms。

第 79 批在同工作台控制器合并隐藏期间的游标，原四秒刷新周期消费。隔离 Home 的 Inbox、Goal、Feed、多窗格、失败恢复和实际写入等 10 文件 44 项通过。

第 80 批从助理和 Coding 的实际子任务入口追到 Work 所属服务、Agent Host、原执行结果和共享 SDK 浮窗。原问卷、审批、请求号和缓存命名规则留在各 owner。共享浏览器草稿的读回与写入在新 owner 的同键锁内，实际主干反证和候选验收见 QF-78。主干的本人验收、个人助理团后续归原事项。

第 84–86 批追加了真实 Coding 到 Git 交接、插件样式分配、Goal 投影和 Git 冲突准备。路径从 Workbench 可信确认和 Coding 会话到 Git 草稿缓存的读回，从 Goals 持久化到两类页面可见投影，以及从 Host 审查到 Git 临时索引、已审文件与原 hook。宽窄窗用各自实际控件，Git 用本机和 CI 同版运行，产品冒烟保留 15 项。见 QEA-159～162 与 QF-80/81。

第 80–81 批隔离浏览器分别通过 15 文件 48 项和 7 文件 28 项。共享草稿、真实子任务、三类任务视图的停止、投递迟到、失败恢复和重新进入均有实际入口证据。各生产构建与发布版本的余项见报告。

第 87 批从文件及在线导入追到原件提取、Artifacts 固定记录、同步编解码、工作台即时回执、成果详情与 Goal 引用，再从两种导入版本的真实「继续处理」入口到 Pages。新警告的翻译归工作台，原始固定内容、当前版本检查及引用归 Artifacts。已验证失败与超时、实际记录、历史读回、重启后引用及重导。见 [QEA-79/80](spec.md#第三十四批导入警告按显示语言呈现固定版本保留原文qf-15) 和 [第 87 批](report.md#第-87-批获准的导入警告合同)。

第 88 批从 Pages 选段、助理确认卡与 Goal 建议链接，追到可信审批写入、当前项目浏览器状态与后台集合更新。实际拒绝、反馈、再试、批准、重载与找不到建议时的恢复通过 3 项。第 89 批核对公开审查引用与三个生产消费者，原 HTTP、项目审批及工作线入口通过 30 项。[实际路径及资源](report.md#第-88-批-qf-82--p2-先前展开的-goal-建议被后台集合更新收起)

第 92–99 批从集成 Full 六类入口回到各 owner。检查项目首页后台读取与主动重试，Goals 关系候选更新，Coding 环境和子任务预算，Git 真仓库审批，设置的跨语言 OAuth 编辑与 Kit 缓存，以及 Host 多窗口的注意力失效与外观写入。原始 Linux 结果、当前本机验证和实际首屏差额按批登记。[逐项证据](report.md#第-9296-批集成全量与资源复验)

第 100–103 批复验实际 Goal 产品入口、组件板站内模拟 Host 与共享通知以及 Coding 窄窗。工作台审查槽负责报告实际高度，Git 继续持有当前审查结果与草稿，Coding 继续拥有会话和工作目录。验证在等待真实审查读取时位置稳定，原按钮恢复可操作并结算到文件和存储。组件板和正常项目各通过自己的通知入口接收失效，页面按各自范围重读。[第 101–103 批](report.md#第-101103-批-goal-产品冒烟组件板和-coding-窄窗)

第 104 批整合主干的两条子任务入口。状态沿 Host 的原执行、原请求回执与本地草稿版本，SDK 只保存编辑和订阅事实。保留等待后权限核对及工作归属。使用者能在原浮窗加额，关闭过程中待定请求仍可查。首读复用版本投影，旧等待回答不能覆盖主动读回。Host、SDK 与 Workbench 均按实际双入口复验。[第 104 批](report.md#第-104-批主干子任务修复交集)

第 112–115 批从真实助理资料组及组件板追到初绘、后续更新和界面词包，从灵光转化回执追到 Placement 关系读取和 Goals 提供方声明。等你位置从默认菜单和后台通知，沿工作台位置读取、Host 的本人信任入口，追到 Surfaces 的修订事务及原 Feed 条目。顶部菜单和确认归工作台当前显示，纠正事实归 Surfaces，原对象状态归 Feed。实际修订变化和非相关刷新走不同收尾，见 QEA-183/184/189。[位置交互](report.md#qf-95--p2-位置后台刷新会收起正在使用的菜单和确认)

第 117 批按 main `8c844c5bb6` 补查三个真实路径。角色从助理选角、设置编辑及 Coding 续办到 Characters 当前修订与 Agent Host 固定版。事项从公开安放和转换到主线事务与真实 Goals 写入，兼查事件关系仍归任务主人。回焦从 Coding 任务板、卡片和结果三个原入口经 SDK、浏览器 frame 合同及工作台保留的控件，读回同一个焦点和未送出的输入。Chrome 隔离 Home 的 21 项均查到通过记录，服务九份文件通过。当前候选建树和独立资源对照见 [QEA-191～194](spec.md#第-117-批整合任务回焦角色与事项归属合同) 与 [第 117 批](report.md#第-117-批主干组合)。

第 118 批从工作线原回执、设置盖层、共享输入和 Coding 会话目录复核逐屏 P0 接入。保留插件材料真实交接、迟到回执和工作台原输入。助理回执从真实两次发送追到工作 ID、轮次与消息，再经 Host 公开读回后确认同文的两个回复各有原记录。Goal 页面记录、输入栏、工作线与 Coding 的界面复验见 [第 118 批](report.md#第-118-批主干逐屏修复组合) 与 QEA-195～199。

第 119 批沿助理的真实长回复重开路径，从 Host 固定的原文到浏览器逐帧着色、工作台压缩回执和状态圆环。回复 ID 与源文字决定回执更新，着色器继续单独推进代码节点。四份隔离浏览器文件的 23 项通过，原时限、原文、颜色和实物节点均有断言。 [QF-97 与实测](report.md#第-119-批-qf-97--p2-长回复重开时回执反复重绘)

第 120 批从 Inbox 正常按钮经判断写入、Host 内容为空的变更信号及 Workbench 的页面读取，到等你与位置角标。每个地址的被动读取归工作台合并，任务、位置、判断及权限仍由各自模块执行。用现行浏览器入口验证请求间隔、真实建议及顺序、四窗、切项目、位置菜单和关闭恢复，另按原动作核撤权、实际取消和重试后的持久记录。 [QF-98 与实测](report.md#第-120-批-qf-98--p2-连续写入放大被动通知读取)

第 121 批沿到达页、助理和创作台的建议入口，实际从建议到签名 Skill 设置、助理模型请求与使用记录，再到 Pages 文稿的保存与打开。整页导航用顶层文档的实际提交来确定读回范围，工作台内设置继续按关闭并返回的实际状态验收。隔离实操及加压复验均通过。 [QEA-202](report.md#第-121-批项目自动化建议的页面切换验收)

第 122 批从同一个原助理回执进入预览、逐帧着色、同字新回复、设置盖层和原正文，核对主干前三行及本轮逐回复身份。真实写入、CRLF 跨彩色片、原生重开和完整正文均有验收。新主干的评测与定时任务三文件 32 项通过。决定 54 新增流式体验 spec，当前按需求已整理和真实来源归档到第 91 批。 [QEA-203](report.md#第-122-批前三行预览和真实回复身份)
