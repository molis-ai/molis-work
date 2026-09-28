# 公共能力归位与 Prologue 接入收敛

状态：实施中。2026-09-28 用户授权完成下列全部范围，目标等级为「内部完整」。本文件是需求、迁移决策和验收进度的唯一入口；尚未验证的项目不能计作完成。

## 目标与证据

以当前调用链确定 Prologue SDK、平台基础设施、官方公共插件、业务插件的职责，完成公共实现及真实消费者迁移，删除重复路径。不是把所有能力下沉平台。基线为 `c20bb18e`（PR #94），工作分支 `feature/platform-capability-consolidation`，复用 architecture-followup 隔离工作树；不改主检出的其他 Session 工作。

改造前核实：Cognia 与 Coding draft 各自创建临时 Prologue Runtime；公共推理端口只返回文本/不透明 usage；Builder 已使用共享 Scheduler，但提醒、定时 operation、存储和待执行队列仍绑定 Builder。Schedule 本身已是官方 native 插件，不新建调度系统。源 SDK 位于 `/Users/yijunwang/code/prologue-dispatch-denied`，消费基线 `03c6ba0b`，SDK 改动须由源码构建再更新 vendored 依赖。

其他活跃 Session 正在主检出做动作授权/Feed 提交边界和独立 UI 原型。本任务先推进无重叠 AI 链路，进入重叠模块前检查它们最新 diff，不能覆盖或重复搬运未完成成果。

## 范围、归属和依赖

| 项 | 当前问题 → 目标与消费者 | 所有者 | 依赖 / 状态 |
| --- | --- | --- | --- |
| 01 | Cognia、Coding 草稿绕过 Home Runtime → 同一模型入口与执行 owner，删除临时 Runtime/轮询 | Local Host 选择与凭据；Agent Host 执行桥 | Cognia/Coding 已迁移；Alchemist 与生成插件使用公共绑定，Builder 设计/编码保留同一 owner；结构化与其他模型适配继续核对 |
| 02 | 文本结果不完整 → 文本/结构、进度、引用、终态、实际模型、typed usage；Alchemist、Jelly、Coding、生成插件迁移 | Agent Host 公共推理契约 + Host 绑定 | 公共契约、Host 绑定及 Alchemist/Jelly 结构化消费已实现并验证；最终全消费者复核待完成 |
| 03 | App 重复收集 Run；schema 支持不足/本地校验不贯通 → SDK 有界收集与显式校验/有界纠正 | Prologue Session/Model；领域 parse 留消费方 | SDK 有界收集、Run 终态结构校验、必要 schema 子集已落地并打包；SDK 已有 Function 外部校验保留；Alchemist 显式有界纠正已接通，领域约束仍由插件校验 |
| 04 | Pages、Images、Alchemist、Builder 重复运行控制 → 抽取真实共性并迁移，保留各自业务恢复 | Kernel 执行生命周期，经 Plugin SDK；领域继续持有状态/恢复 | 已实现；本地关闭晚提交与恢复回归通过 |
| 05 | Builder 专属提醒/operation/待执行生命周期 → 既有 Schedule、Scheduler、安装执行端口各负其责 | 官方 Schedule 产品、平台技术调度、业务插件执行 | Scheduler 独立续租/提交控制已补齐；提醒与安装执行迁移继续待实现 |
| 06 | timeout/cost 等按名称硬编码 → 公共动作元数据与一致消费策略 | Contracts/Kernel/Host | 执行声明、Kernel 时限/频率、Builder/Agent 消费已实现并验证；其余真实提供方与安装执行元数据继续复核 |
| 07 | Native catalog/pack/Host 多清单 → 适合现有部署模式的共同描述与注册发现 | Host composition + 插件公开描述 | 06；待实现 |
| 08 | 领域提交到插件事件缺桥接 → 已提交事件可靠投递、独立订阅身份/生命周期 | 领域 outbox + 现有 PluginEventBus | 核对 Feed Session 后；待实现 |
| 09 | Jelly/Shelf/Cognia/Pages/Artifacts 重复材料处理 → 公共 Host 解析/资源/来源契约 | Host 解析，Storage 资源，业务转换留插件 | 02；待实现 |
| 10 | Alchemist 搜索依赖 Feed 装配 → 共享 SEL 搜索和证据保存，兼容历史 ref | Host 搜索组合，领域策略留消费者 | 已完成实现与工程验证；真实外部搜索未运行 |
| 11 | Coding/Builder/Shelf/Images 各管 timer/SSE/observer → 公共客户端生命周期与实际清理 | UI Host/Workbench | 已完成实现与工程/浏览器验证：Images、Coding 及子面板、Builder 两套界面、Shelf 及结果面板 |
| 12 | 旧路径、文档、测试预期漂移 → 删除重复并更新手册/Skill/消费者示例 | 对应模块 + 开发规范 | 随每项更新，最终总验收 |

不能新增无消费者的框架、第二调度引擎、RAG/向量库、全局聊天数据库或全量视觉重做。领域提示词、来源选择、业务状态机、结果有效性和未知副作用恢复由业务 owner 决定。插件只能走公开 Contract，不 import 另一插件内部实现。MCP 注册不授予执行权限。

## 行为合同

- 单次推理借用 Home owner 的 Runtime；输入为固定模型选择、受限材料、时限、取消、持续授权检查；输出为有界内容、Run 引用、真实模型与 typed usage。模型/凭据变更、撤权和取消后不得写入业务结果或失败记录。发现阶段不解密凭据。
- 旧 Host Capability 调用合同缺少取消传播；补齐可选 signal，从 PluginCapabilityClient 经 LocalHost 保留到 invocation，作为收紧执行的选项，不能携带或扩大身份授权。Coding draft 的原入口据此接通取消与 beforeEffect 派出检查。
- Alchemist 的模型目录改为复用现有 configuredModelChoices，生成复用 hostTextGeneration，删除私有凭据快照、取消等待与配置比对。保持仅使用已配置目录模型、固定选择、180 秒和 4096 输出 token 的边界；格式纠正与领域 parse 暂留原业务端口，迁移结构化协议时必须保留其显式预算检查。取消和时限覆盖异步派出检查及结果后的检查，等待结束不能再调用模型或返回过期结果。
- 生成插件的 `model.generate` 是无工具的单次推理，改走同一 `hostTextGeneration`，保留 Studio 的固定模型选择、110 秒、8192 输出 token 与安装调用限额。Action 的 `beforeEffect` 传到实际派出前和结果复查；旧沙箱入口以当前调用信号及 live 状态持续收紧。设计/编码 Agent 继续走 Builder，不再为单次文字生成创建工作目录或第二份运行 JSON；旧私有记录原位保留，没有生产读取方，不做破坏性清理。
- Builder 的设计/编码 Run 也复用 SDK `collectRun`，保留原活动和部分输出投影、取消控制、检查执行与业务记录。收集上限为 18 万正文字符和 10 万事件；超限取消原 Run，保留已写文件供检查，不能作为完成。覆盖全部 SDK 终态，避免执行限制终态漏接而无限等待。旧记录的 model role 读取兼容，新 Builder 请求仅保留 designer/coder。
- 结构化消费切片：Prologue Model 提供纯 JSON 解码（代码围栏仅显式允许），Function 与 schema 校验复用同一解码入口，不新建执行引擎。Host 向 Alchemist 返回解码结果和原文/用量，向 Jelly 提供 JSON 值端口；插件删除私有格式解析，继续执行 Zod、证据块、逐字引用与计划领域校验。代码复核还发现 Jelly 未保留 ActionExecutionContext 的 beforeEffect，现补齐每次分段/合并模型派出与结果提交的持续授权检查。Alchemist 仅在显式 beforeCorrection 预留预算后纠正一次，每次实际调用仍检查授权/取消；未知用量不相加为零。普通 Schema 校验不把围栏容忍变为默认，也不静默忽略不支持的关键字。
- SDK 收集复用原 Session/Run 事件，不开第二模型循环。参数/结构 schema 先验证，结构结果必须执行声明的校验。纠正显式、有界，并在每次模型派出前检查预算/授权。未知用量保持未知。Prompt 与领域约束留 App。
- 长任务维持原 request_id、幂等和写主人。提交需满足当前所有权与版本；取消/租约丢失后迟到结果不能写入。结果未知的计费/外部副作用不自动重放。
  - 本轮代码证据：Alchemist LocalWorker 只把租约丢失当作取消，遗漏 stop/cancel 的本地 signal，关闭后仍能 checkpoint/commit/complete/fail。Images 底层 `generateProviderImages` 已有 abortable 等待和返回检查，超时迟到结果不是当前缺陷；它与 Alchemist 存在重复定时监测。Kernel 提供 `createExecutionLifetime`，经 Plugin SDK 暴露，统一取消转发、截止时限、同步周期检查和清理；Alchemist 续租、Images 持久取消监测迁入。它不保存业务数据、不授权、不重试，提交仍由插件的事务/CAS 检查。Pages 的 request/version fence、Images 的进程 SQLite 锁、Alchemist 的检查点恢复、Builder 的 SDK Run 继续由现有所有者负责，不强行统一状态机。验证本地 stop 后的晚提交/检查点/终态无写入、重新打开库后保留 ambiguous checkpoint、不重复模型调用，以及 Images 现有超时、跨进程取消与关闭回归。
- Schedule 对话任务与其他插件 job 保留现有边界。Builder 的公共编排迁移不能改变 fixed interval 为日历日，不能丢失已有 job、业务记录或 pending 操作。隔离键包括真实 Home/数据库、项目、安装实例。
- 公共能力注册一次，由真实合同提供发现、UI/Workflow/Agent/MCP 适用入口；停用、卸载、权限与版本变化使旧引用失效。事件从业务已提交事实产生，订阅不携带过期用户调用身份；普通 query/command 不改消息总线。
- 文件/媒体解析由 Host 管受限 I/O，统一资源大小、取消、超时、来源定位与不完整结果表达。保留历史资源读取。前端卸载取消资源，不允许旧响应覆盖新页面状态；保留产品设计并完善受影响状态反馈。

## 切换与回滚

按 SDK → 推理桥/Host → 消费者切换；每个切片接通真实调用方后删除被替代路径。SDK 从当前 vendored 对应基线派生，保留既有 dispatch-denied 等补丁，不顺带升级不相关功能；记录源差异与包来源。旧业务记录无需随推理迁移重写。

涉及调度/事件/资源迁移时，在动数据结构前补充此处的兼容读取、切换时机与回滚合同，验证幂等迁移和升级后可观察行为。回滚只撤销本任务代码/依赖；存在新数据语义时必须先证明旧版可读或给出数据回迁，不能承诺无条件 git revert。

搜索切片：Host 的公共 SEL 装配与 exact intent 适配从 Feed 文件分离；公共 web query 路由不再由 Feed 插件拥有。Feed 注入自己的 RSS Runtime、来源路由、条件请求与 receipt，Alchemist 只调用公共 web 查询；研究 query、预算、摘要仍归 Alchemist。匿名 AnySearch 的受限传输改为按提供方命名，保留域名/IP/TLS/重定向/字节上限。

证据密文实现移至 Storage，旧 Feed 导出仅作为同一实现的兼容别名。保持 `molis-work-feed/sha256/...` 引用、现有目录、密钥引用、恢复 overlay、AAD 与密文版本，以及 `feed_runtime_blobs` 表和 `feed-intent-v2` namespace，不改写旧数据；新旧 API 能互相读取。公共适配器关闭时取消并等待在途操作，再释放持久化，避免 SQLite 先关闭。回滚仅恢复调用方和实现位置，现有密文与 operation ledger 均保持旧版可读。

## 验证与交付

按项目要求先 `pnpm build`，再 `pnpm boundary:check` 和 `node scripts/run-tests.mjs <受影响测试>`；回归时不并发修改源码/skills 或构建。SDK 按源仓模块合同执行 build、行为测试及真实 Node Host 的本地模型服务验证。测试检验生产路径的状态、持久化、副作用和真实交错，不写只匹配实现文本的自证断言。

01–03 验证共享 owner、取消含启动等待、配置撤销、错误/空响应、结构拒绝/纠正限额、已报与未知 usage；04 验证竞争/租约丢失/未知结果；05 验证重启、迁移、隔离与卸载；06–08 验证真实发现调用及授权、版本、重放；09–10 验证资源上限/取消/历史读取；11 验证重复挂载、切换、SSE/timer 清理及浏览器状态。完整消费者范围不能由局部 green 代替。

更新 `docs/platform/PROLOGUE-AI.md`、`docs/platform/PLUGIN-DEVELOPMENT.md`、`skills/molis-prologue-ai/`、`skills/molis-plugin-dev/` 与变化模块 README；以 Coding 的真实入口示例说明新增契约。逐项记录代码审查、替身、真实 SDK/Host、真实模型、浏览器和用户验收的不同证据。未运行的外部服务/真实模型明确说明。

本地改造授权不等于 push、PR、merge 授权。完成时交付实际 diff、迁移、手册/Skill 和本表逐项证据；所有必须项未完成时保持 Goal active，不以阶段总结宣称完成。

### 前端生命周期切片

UI Host 提供浏览器挂载 scope，由 Workbench 和独立 Builder 页面注入。scope 按 DOM 根节点去重，隐藏时停止视图轮询/SSE，恢复时读取权威状态；移除/卸载时取消请求并释放监听、定时器、动画帧和观察器。写命令不因切换视图擅自重试或取消服务端业务任务。异步响应在消费前检查 scope 与原请求 signal，防止卸载后旧响应覆盖重新挂载的页面。先迁移 Images 与 Builder，再迁移 Coding/Shelf；保持原 UI 与领域状态。验证使用真实 Chrome、HTTP 调用计数、延迟响应、隐藏/恢复/卸载/重复挂载，不能只靠脚本字符串快照。

### Schedule 与安装执行的迁移顺序

当前通用提醒、定时操作仍在 Builder Host 私有模块，调用者索引只以 boardId 分组，且要打开 Studio 才绑定执行入口；待执行队列先删后跑可能丢失工作。迁移到 Schedule 的提醒/任务管理和 Host 安装执行端口，保留历史身份、记录与固定 interval 语义，按数据库/Home、项目、安装实例隔离，生产唤醒不能依赖创作页面启动。新的持久任务拥有自己的执行身份与当前安装授权，不能保存创建动作的临时 beforeEffect。

先修 Scheduler 前置缺口：其现有续租仅由下一次 tick 驱动，handler 等待时没有独立续租；暂停/取消仅挡住 scheduler 回执，领域 handler 仍可提交。复用 Kernel 执行生命周期驱动续租，并通过独立的 `ScheduleWakeupControl` 向处理器提供 signal 与提交前所有权检查（不混入可序列化业务 input）。Schedule 对话任务及 Host runner 消费此端口，失租、暂停和撤销后不写领域成功/失败。保留现有 scheduler 数据表与 lease token；注册覆盖同一任务时撤销旧执行身份。验证无额外 tick 的长等待、两连接竞争、暂停/取消/重排的迟到提交和对话持久化。随后迁移提醒/定时操作及安装运行启动链，不能以此前置修复宣称 05 完成。

### 能力执行元数据切片（安装执行迁移的前置）

当前 Builder 目录用 `capability_id === model.generate` 判断费用，sandbox 超时/slow lane 只读旧 Studio 名单；Agent 工具使用统一固定超时。新增提供方声明的 Action `execution`：明确时限、费用类别（未声明保持 unknown）和必要的调用频率上限，随原目录/版本传递。Kernel 对明确声明的时限和频率执行统一检查，沿既有 signal / beforeEffect 契约取消并拒绝迟到写入；入口可以有更严格的限额。现有 concurrent 声明继续负责并发，不新造第二种调度机制，取消仍为合作式而非保证厂商停止计费。

将 model.generate 和真实 AI/外部工具提供方的已知事实迁入声明，Builder、Sandbox、Workflow、Agent/MCP 消费共同定义；旧生成物只保留输入输出转换，不能继续以能力名称推断执行政策。验证任意名字的声明能力也受相同预算/超时约束、目录与实际执行一致、原调用者隔离、取消后 late commit 被拒绝。未声明的旧能力不被静默标为免费，也不凭空添加产品预算。此切片与 05 的安装执行端口串行，元数据接口及真实消费者迁移完成前不标记 06 完成。频率计数为本机当前注册实例的调用保护，按 actor/project/install 跨入口共享，不承担跨重启计费；未声明的能力不添加默认预算。旧生成物仅保留 Goals 形状适配，其余调用进入统一目录，并在实际派出前重新检查原调用者。设计阶段按声明的 metered 费用拒绝页面自动 query；Agent 的入口上限可更严格。安装 sandbox 启动时读取目录策略，依赖更新后的执行绑定与恢复将随 05/07 补齐。

### 当前验证记录

- 第一批 AI 公共契约及 Cognia/Coding 迁移：整体 `pnpm build` 通过；16 个定向回归文件、105 项测试通过，含真实 Node Runtime 对本机 HTTP 模型替身的调用。后续源码改动需重新构建并运行相关回归。
- SDK：构建通过；新增有界结果与结构化相关 38 项、Session/模型/授权相关 65 项回归通过。全仓 typecheck 仍有基线已有的 `agent-compaction-public.test.ts` 两处参数类型错误，未将该检查记为通过。
- vendored 包已从真实源仓构建，记录增量补丁与来源；补丁在当前源仓反向检查通过。更新包清单后 `pnpm boundary:check` 通过（69 个包，errors 为空）。
- Alchemist 模型绑定迁移：整体构建通过；13 文件回归中 91/92 通过，新增发现阶段断言捕获公共 `configuredModelChoices` 调用 health 解密凭据的问题。改为复用元数据选择校验后重新整体构建，Alchemist Host 与 Coding MCP 10/10 通过，包括本机 HTTP + 真实 SDK、固定模型、配置失效、启动等待取消及无凭据解密。其余已通过的授权、生命周期、领域和安装回归未无故重复。
- 公共模型入口新增验证通过：取消/超时覆盖结果后的异步权限检查，等待结束不会派出迟到请求或发布结果，领域撤权原因保持原错误。相关修改见 `host-complete-text.ts`，回归见 `host-inference-completion.test.ts`。
- 生成插件/Builder：公共生成端口替代 model-role Agent，删除私有记录轮转；设计/编码改为 SDK 有界收集。整体构建及 14 个相关回归文件的 108 项测试通过，覆盖真实 SDK + HTTP 模型、请求/结果阶段撤权、注销与取消、模型配置变更、原设计/编码/并发检查流程。生产 Runtime 构造扫描仅剩 Home composition 与用途独立的模型连接测试。
- 公共搜索/证据归位：删除 Feed 专属 intent adapter 和正文实现，Alchemist 不再装配 Feed/RSS；公共 SEL query + Storage 接通两个真实消费者。整体构建、边界检查通过；20 个相关文件的 108 项测试通过，含真实 SEL 重放、取消并等待传输关闭、独立构造的历史密文读取、旧 API 互读、RSS 条件请求游标以及 Home 隔离。日志 `/tmp/platform-search-regression.log`。
- 前端复核证据：Coding 的 timeline interval 和多处 MutationObserver 不释放；Builder 的全局 visibility 监听/ResizeObserver 无释放；Shelf 全局监听和 boot observer 无释放；Images 只检查 connected，隐藏时仍轮询。Shelf 客户端当前另有 Session 修改，接线前须合并其最新授权边界，不能覆盖。
- 真实付费模型、外部搜索服务与用户本人验收尚未执行；浏览器仅覆盖后文明确记录的路径，上述局部证据不代表 12 项整体完成。

- 结构化消费：SDK 构建通过，4 个相关测试文件 40 项通过、1 项真实 MiniMax 因缺少 Key 跳过；Molis 整体构建和边界检查通过。18 文件回归的生产路径 124 项通过；新增文件首次因测试从根目录导入未声明的 zod 失败，改用现有领域校验器后该文件 5/5 通过，总计 129 项。日志 `/tmp/platform-json-regression.log`、`/tmp/platform-json-correction-regression.log`。包含 Jelly 派出/返回撤权零写入、Alchemist 显式预算纠正上限与取消/撤权拒绝。

- 前端第一批：UI Host 与 Images/旧 Builder/Studio 已迁移；整体构建通过。16 文件回归 92 项通过，新增 Images 卸载后按钮残留禁用用例捕获问题，修复后相关浏览器 3/3 通过；Studio/同源 iframe 可见性/SSE/组件销毁等 4 文件 49/49 通过。日志 `/tmp/platform-ui-lifecycle-regression.log`、`/tmp/platform-ui-lifecycle-recheck.log`、`/tmp/platform-studio-lifecycle-regression.log`。Coding 正在迁移，Shelf 尚未改动。

- Coding 生命周期：整体构建通过；13 文件 29/29 通过，包含 Coding 完整工具/工作区动线、任务板/时间线、实际隐藏停止请求和同一 DOM 重挂后只创建一条会话。日志 `/tmp/platform-coding-lifecycle-regression.log`。Shelf 修改前再次核对主检出：其他 Session 仅新增 select-item 跳转处理，本分支未搬运或覆盖该未提交改动；合并时该处理器需使用同一 lifetime.listen。

- Workbench 真实导航复核发现休眠 surface pool 仅由 CSS 隐藏，缺少共享生命周期可读取的可见性事实。已将 pool 显式声明 hidden；插件页面离开/返回通过同一祖先合同暂停/恢复。Shelf 旧测试改为真实切换页面，Coding 回归也覆盖实际导航，不能通过手工修改 body.dataset 模拟产品行为。

- 前端生命周期闭环：Shelf/旧 Builder/Studio 等 9 文件回归初次 33 项通过，Shelf 旧私有 observer 用例失败；改为真实导航后进一步抓到 Host pool 缺少 hidden，修复并重新整体构建。最终实际导航、Coding 卸载重挂、Shelf 提取/编辑/对照/剪贴板、标签工作区及 Workbench 必需检查 9 文件 28/28 通过，无跳过；边界检查通过。日志 `/tmp/platform-workbench-lifecycle-regression.log`。UI 资源迁移没有改变页面设计或服务端任务的领域恢复规则。

- 长任务执行：Kernel `createExecutionLifetime` 经 Plugin SDK 供 Alchemist 续租与 Images 超时/持久取消共用，替换两处定时器和清理；修复 Alchemist 本地 shutdown 被当作普通失败及晚写入。Pages 的版本 fence 和 Builder 的 Prologue Run/工具取消已有各自必要语义，保留并沿调用链核对。整体构建、boundary、diff whitespace 检查通过。根目录相关回归 115 项通过，新公共工具测试首次因根目录未声明 Plugin SDK 包导入失败，改为现有测试惯例的源码入口后 4/4 通过，共 119 项；Alchemist 包内 26 文件 80/80 通过（含重新打开 SQLite 后保留 checkpoint、过期恢复不重复模型调用）。包内旧 work-reuse fixture 同时补齐上一轮 JSON 回执合同，未放宽业务断言。日志 `/tmp/platform-execution-regression.log`、`/tmp/platform-execution-recheck.log`、`/tmp/platform-execution-alchemist.log`。
- 整合顺序更新：另一架构会话已完成并合入远端 main `21cdfbf8`（PR #95）。先在当前分支保存本次已验证改动，再合并该提交；SDK 同时保留本任务 bounded results/JSON 与 main 的 network dispatch 授权补丁，从真实源码重建合并包。整合完成后重新整体构建并验证实际冲突影响面，再推进 05–09。仅本地改造，不推送、不修改主检出。
- main `21cdfbf8` 已整合到当前分支：保留 Host 新网络派出授权、Action 结果声明和 Shelf 对象选择入口；Shelf 新监听同时纳入本任务 lifecycle。SDK 从 `03c6ba0b` 的真实源码合成 bounded results/JSON/network dispatch，更新完整补丁与依赖。SDK 构建、8 文件 75 项通过、1 项真实模型跳过；520 个 dist 文件在源码构建、tarball、实际安装中一致。Molis 整体构建、boundary 通过，26 文件交叉回归 136/136 通过，日志 `/tmp/platform-combined-regression.log`。未重复 main 已独立验证的所有无交集用例。

- Schedule 前置修复：独立续租、暂停/取消/重排后 handler 提交控制、Prologue 最终派出 guard、对话提交同事务复查。并发日历 tick 通过 Scheduler `isExecuting` 避免重排仍在执行的 once；标为已读不撤销原任务。整体构建及 boundary 通过；6 文件 36/36 回归通过（含两个 SQLite 连接、不再 tick 仍续租、取消后零业务写入、日历并发、原提醒/定时操作）。Feed 调度授权/并发回归也通过。最初新增对话 fixture 在注册 handler 前创建任务被正确拒绝，调整测试准备顺序后通过，未改放宽生产注册约束。日志 `/tmp/platform-scheduler-final.log`、`/tmp/platform-scheduler-recheck.log`。05 的提醒 owner、持久 pending 与安装 Runtime 解耦仍未完成。

- 能力执行声明前置切片：Contracts/Plugin SDK 暴露 `action.execution`，Kernel 执行明确声明的超时与每 actor/project/install 频率，审计分类不分割预算；超时中止等待并拒绝迟到写入。Builder 的旧模型/提醒直调和两套频率窗口已删除，sandbox、设计校验及 Agent 工具读取提供方声明，外部 MCP 费用明确 unknown。原调用者在实际派出前仍重新校验；元数据和调用共用同一最高可用版本选择。手册、Skill 和模块 README 已同步。整体构建通过；首轮 39 文件 332/332，版本选择补充后 13 文件 146/146，最终身份与 Skill 调整后 10 文件 67/67，无跳过；69 包边界检查无错误。日志 `/tmp/platform-policy-regression.log`、`/tmp/platform-policy-recheck.log`、`/tmp/platform-policy-final.log`、`/tmp/platform-policy-boundary.log`。包含真实 SDK、原 SQLite、安装产物和 Studio 发布使用的 Chrome 路径；不代表真实付费模型验收。06 仍需真实 Native 提供方声明复核，05/07 仍需安装执行身份与依赖变更恢复。
