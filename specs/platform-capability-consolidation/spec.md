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
| 05 | Builder 专属提醒/operation/待执行生命周期 → 既有 Schedule、Scheduler、安装执行端口各负其责 | 官方 Schedule 产品、平台技术调度、业务插件执行 | 已实现提醒/operation 归位、独立安装 owner、安装世代、全量旧 pending 迁移及明确恢复；工程、真实 SQLite/进程中断/Seatbelt 与 Chrome 路径通过，未运行付费模型和用户本人验收 |
| 06 | timeout/cost 等按名称硬编码 → 公共动作元数据与一致消费策略 | Contracts/Kernel/Host | 执行声明、Kernel 时限/频率、Builder/Agent、Native/Host 及安装调用的动态依赖绑定已实现并验证；生成式公开操作从发布契约派生，当前及传递依赖 cost 已接通；最终跨入口验收随 12 |
| 07 | Native catalog/pack/Host 多清单 → 适合现有部署模式的共同描述与注册发现 | Host composition + 插件公开描述 | 内置目录、UI 资源/贡献、Agent 正文与历史 MCP 已归同一装配声明并验证；普通 Runtime 发现链保留；生成式已接通费用刷新和旧版本定义复用，保持发布契约为唯一公开声明；整体构建及 22 文件 135 项回归通过，最终跨消费者验收随 12 |
| 08 | 领域提交到插件事件缺桥接 → 已提交事件可靠投递、独立订阅身份/生命周期 | 领域 outbox + 现有 PluginEventBus | 安装身份/世代、持久投递状态、旧游标迁移、异步提交检查与关闭已实现并验证；领域 journal 桥接、实际领域消费者及 unknown 显式恢复仍待完成 |
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

### 提醒归位切片

兼容边界：通用提醒原本不要求启用 Schedule 的对话页面。其公共提供方由 Host 装配为 `schedule.reminders`（system），实现和合同归 Schedule；不把既有安装的提醒权限静默改成必须启用可选页面。对话任务保留原 Schedule 插件的启停检查。Web 装配明确传入独立项目/目录项目的路由前缀，提醒链接不能猜测部署入口。

提醒迁移切片：Schedule 拥有提醒数据、时区/固定间隔规则、数量上限、取消与一次性投递；Host 只装配同库 Scheduler、安装身份和 Feed/Inbox 投递端口。保留 `reminders.add/cancel` 的输入输出和能力 id，实际提供方迁到 Schedule，Builder 不再注册或实现提醒。新增提醒记录包含项目、插件和安装实例，跨安装不能取消；创建/取消与 scheduler job 在同一 SQLite 事务中提交，投递与一次性消费也同事务并复查本次 lease。到点不运行插件代码。

Host 在创建 Schedule service 时注册新唤醒及旧 `plugin-builder.reminder.v1` 的兼容入口，无须打开 Studio。旧记录按现有 job 引用原子搬入 Schedule，保留 reminder/job id、next_due_at、收据、链接和固定 interval；迁移后删除相应旧键，避免一次性任务被再次导入。旧安装时间无法证明归属，缺少安装世代的历史提醒保留并暂停，不能交给重装实例执行，详见后文「安装世代与持久任务归属」。取消错误只忽略明确的 job-not-found，其他错误回滚并上报。旧数据迁移后不能仅 revert 回旧代码：回滚须按保留的 job owner/id 将记录写回旧 namespace，新增 Schedule owner 任务需迁回或先处理；不承诺无条件代码回滚。验证实际 Host 无 Studio 发现/调用、重启到点、旧数据幂等迁移、跨 Home/安装隔离、重复唤醒不重复 Inbox、事务失败和撤销后零写入。本切片不代表定时 operation / 安装 Runtime 解耦完成。

### 安装执行控制的前置切片

复核时发现公开生成式动作丢弃 ActionExecutionContext，以静态 actor 字符串穿过 route；SandboxRunner 只产生本地 signal。先沿可信 Host route execution 端口（独立于 JSON body）传入当前调用 signal/beforeEffect，再经 Runner/Broker 到实际存储提交、能力派出与网络解析后的派出。队列里取消的调用不运行，不停止别人的当前操作；已经运行的调用取消时终止该沙箱通道，不能自动重放。所有异步服务返回后、存储 CAS 前复查原授权。执行时限从队列头开始，包含执行前和结果后的授权等待；Host stop 也能终止这些等待。外层生成式动作声明 concurrent，插件自己的 sandbox queue/CAS 保持序列化，避免等跨模块调用时占住项目队列。

不靠 payload 或 actor 名字授予直接 operation 权限；UI 仍按声明组件解析。定时调用以当前 Scheduler control 及任务/调用者存续检查传入，同一 control 不保存进 pending。旧 pending 的持久执行与安装 Runtime 独立启动随后迁移。直接把公开注册转到 Runtime 会改变其合成 Manifest 指纹和提供方身份。后续 07 已依据当前实现修正方案：由安装 Host 从已发布 operations 派生公开注册，保留三种部署模式，见“内置插件装配与生成式公开声明”；不再要求形式上的 Manifest 归并。

验证真实沙箱 + 原 SQLite：排队取消不执行、执行中取消无晚写入、异步撤权后能力/网络不派出、解除限制后的新调用可用；旧静态 actor 不能直接调用 operation。更改公共包后整体构建、包要求测试及边界检查，保留不自动重试与原安装数据。

### 安装运行独立于创作台

新增 Host 安装运行装配，读取 Builder 已发布的版本与批准记录，复用现有 Plugin Runtime、沙箱定义和公开 Action 目录；读取已发布工件不初始化 AgentBuilderWorkflow，也不启动草稿恢复、模型或浏览器验收。按同一数据库和 board 缓存唯一实例，项目关闭统一停止并撤回；关闭创作工作台仅停止创作任务与预览进程。生成式页面、项目能力发现、Home 恢复和调度准备均使用这个实例，Studio 的安装/升级/回滚/启停/卸载端口委托给它。

此步骤保持原安装版本、Manifest 指纹、提供方 id、私有数据和历史路径；旧版本必须有可读发布记录及明确批准信息，不能因恢复而升级或扩大授权。恢复失败逐插件显式保留原因，不能吞掉异常再把插件当可用；一个失效安装不阻断其他项目能力。派出使用当前安装与同一 Project Action 服务，安装实例撤销后不得退回试用替身。复用 Catalog 的内部 inspect 端口以避免初始化递归。通用 model.generate 与 schedule 能力的 Host 装配随安装运行存在，不随创作页面注销。05 的持久 pending/安装实例迁移已完成；07 保留发布 operations 与安装 Host 的派生注册，不引入第二套公开声明或安装执行实现。

生命周期复核还发现原 Runtime.stop 同时用于用户停用和 Host 关闭，均记录 disabled，旧启动又无条件恢复，导致停用意图丢失。为现有 stop 增加可信 Host 的 preserve_enabled 选项，正常关闭后保留 installed，用户停用保持 disabled；关闭时先停进程再撤销 Supervisor，避免 revoke 自带的 stop 抢先写成 disabled。恢复不自动开启 disabled/quarantined；旧 disabled 无法证明是停用还是关闭，保留原记录并提供显式「启用」入口。没有批准记录的安装仍拒绝启用，不能退回 release.permissions 自动补权。

调用边界同步修正：公开 operation 显式传入的 JSON null 不得被 route 默认值替换为对象；只有缺失 input 才补默认。Schedule 存储保持历史输入，不扩宽现有 schedules.add 的对象输入契约。卸载的 keepData=false 必须在 Runtime 停止/卸载成功后由持有私有存储的 Host 删除该安装数据，keepData=true 保留；验证卸载后重装的真实读取结果。保留数据不保留旧执行授权。

同进程卸载后，Supervisor 仍记得撤销状态；仅再次 start 会拒绝用户明确确认的重装。安装入口先经 Runtime 形成当前安装事实，再在收到新 consent 的分支显式恢复 Supervisor 启用资格；普通启动/发现不能清除停用事实。验证同一 Host 内保留数据重装及删除数据重装，而非只检查卸载收据。

Runtime 卸载完成后释放该安装的已加载实现，否则同版本的重装因新内存对象而冲突；运行中的重复注册仍拒绝。不曾在当前进程激活的安装无需加载插件代码即可卸载，因此缺批准记录或工件的冷安装仍可移除，再按正常确认流程恢复。

### 安装世代与持久任务归属

复核发现 Runtime 的 install_id 按插件与签名稳定复用，installed_at 也在重装时沿用；仅保存 install_id 的历史提醒可以误认重装实例。保留稳定 ID 和私有数据命名空间，Runtime 为新安装/确认重装保存独立 installation_generation，正常重启、停用/启用及升级保持不变，重装的 installed_at 记录本次时间。旧活动安装没有世代字段时，以带前缀的原安装时间作为兼容身份，不在发现阶段随机重写身份。

Schedule 的持久记录同时绑定稳定 ID 与世代；世代由 Host 从 Runtime 安装事实读取，不从插件输入采纳。新增、取消和到点投递均复查。进一步核对发现旧 installed_at 在重装时同样复用，且没有完整卸载历史，因此此前用「当前安装时间早于 job」证明归属的方案不成立。所有缺少世代的旧 Schedule 记录和 Builder 提醒保留并暂停，不能自动补成当前身份；保持已有 job、时间、固定间隔、链接和收据。显式恢复旧任务的入口纳入后续 Schedule 定时 operation 迁移，05 在此之前保持未完成；普通启用开关不能暗中补权。验证同 ID、同毫秒重装仍与旧任务隔离，私有数据可保留，重复启动和升级不改变世代，历史迁移重复运行不补权。后续定时 operation 与事件订阅复用该安装事实，不能另造身份源。新增字段为兼容读取；回滚代码会失去世代隔离，须先暂停持久任务，不承诺直接 revert 即安全。

缺少原安装身份的投递尝试保留记录并产生明确失败收据，不能返回成功。Schedule 详情展示 Scheduler 的收据说明，给出需要重新确认归属的原因，消息按普通文本转义。

验证用真实 SQLite/Seatbelt 发布工件：只恢复 Host 即可发现并执行安装动作，无 Studio/模型启动；关闭并重开保留安装数据；两个 Home 隔离；关闭 Studio 后安装动作与定时任务仍可用；缺工件/批准记录有可读失败；停用与卸载后不可用。继续跑真实 Chrome 的创作、发布和安装流程，保证消费者迁移完整。

### 历史提醒显式恢复

旧提醒已保留暂停，但原 Schedule 列表只给普通启用开关，用户不能确认归属并恢复。本切片先补通提醒恢复的完整产品路径，定时 operation 的待执行/结果未知恢复仍按后续独立合同处理，不能借提醒恢复重放插件代码。

Schedule 将提醒正文、原插件及当前可用安装投影到 job 详情；Host 从同一项目数据库的 Runtime 解析唯一正在运行的安装，返回名称、版本、发布方和世代。用户在现有 Schedule 详情确认恢复，HTTP 只适配公开 `schedule.reminders.recover` Action；授权仍由统一 Action 服务及其入口决定。普通 jobs.enabled 不得补权，遇到失效提醒应说明需要确认归属。恢复输入中的预期安装 ID/世代只作乐观并发前置条件，不能选定或授权任意安装；处理时重新读取 Runtime，目标重装或缺失时拒绝，保留原记录和暂停状态。

提醒身份更新与原 Scheduler job 启用必须同库原子提交，保留 job/id、固定间隔、下次时间、收据和旧链接；已过期提醒明确提示恢复后会补提醒一次，间隔任务仍沿原节奏推进。重复确认已经恢复的记录不重新开启或重复投递。恢复后的提醒计入当前安装原有数量限制。界面显示正文、名称/版本/发布方与补提醒语义；使用现有 dialog 组件，失败保留确认内容，提供刷新查看当前安装的路径，不自动提交新身份。

实际调用回归发现 `audiences` 不含 plugin 并不足以拒绝插件：平台默认把 Agent 能力提供给生成插件。恢复是管理者重新指定历史提醒归属的动作，显式声明 `plugin: false`，防止当前插件自己继承旧安装记录；用户、Workflow、Agent 与 MCP 仍遵循各入口权限及具体能力授权。输出 schema 同步声明提醒和当前安装字段，供 UI 与外部管理消费者使用。

验收：真实 SQLite 验证旧数据迁移后保持暂停、普通启用不授予身份、明确恢复后的重启/一次性投递/固定间隔、同 ID 重装导致旧确认拒绝、跨项目/Home 隔离、授权撤销零写入、事务失败回滚与并发重复提交不重开已暂停任务。真实 Chrome 验证发现恢复入口、取消确认、安装变更提示与刷新后重新确认，窄屏可操作。先整体构建，再跑 Schedule 包要求与新增定向回归、边界检查。回滚仍须暂停持久任务；本切片不新增第二数据源。

### 定时 operation 与持久待执行记录

当前 `plugin-builder/schedules.ts` 在没有安装执行入口时将 occurrence 写入最多 50 条的私有数组，注册入口时先删数组再执行并吞错；Scheduler 则在调用前推进间隔/停用 once。决定：任务记录、单次执行记录和恢复决策归 Schedule，安装版本、批准与调用入口归 Host/Runtime，Scheduler 继续只提供排期、原子 claim 和 lease。不另建任务引擎。

Scheduler 的唤醒注册允许可信 Host 提供同步 prepare：在获取 lease 的同一 SQLite 事务中，Schedule 写入 `(任务, due_at)` 的 pending 记录，然后才进入原唤醒处理器。prepare 不能异步等待或派出外部工作，失败则 claim 和领域记录一起回滚；没有 prepare 的现有消费者保持原行为。唤醒结果可明确报告 failed/plugin_unavailable，不能把 operation 失败记成 ok。Schedule 在实际调用前、同事务检查 lease、任务状态、安装世代并改为 running；结果与 Inbox 写入同事务再复查。超时/进程退出必须保留结果未知的语义，不能因为 HTTP 把错误转为 400 就当作已知失败。

安装执行入口注册只登记当前 executor，不能在初始化中补跑。每次 tick 前按同库 lease 复核：未派出的 pending 可以重新挂原 job 并使用新的执行控制；已派出而无终态且无活跃 lease 的 running 改为 unknown，停止后续排期，等待明确恢复决定。原 job 的身份、收据及固定 interval 保留；按 due_at 去重，旧队列中多次实际等待的 occurrence 逐个保存，不能用“漏周期只补一次”丢掉已经登记的待执行工作。暂停、取消、卸载或换执行入口后，旧控制不可提交成功/失败或 Inbox；未知副作用不自动重放。周期任务每次新的正常 occurrence 仍沿原固定间隔，不改日历语义。

`schedules.add/cancel` 的稳定 id 和对象输入合同保留，定义和处理迁到 Schedule 的公共系统提供方；Host 按可信项目/安装上下文装配，Builder 仅保留 authoring stand-in/旧合同适配，不再拥有生产调度记录。任务绑定当前 Runtime 世代，配额按安装世代计算。恢复管理同样必须禁止生成插件自行接管旧安装，使用公开 Action 及 Schedule UI，明确区分确认旧归属、重试未知结果（可能重复副作用）和跳过本次后继续；此管理路径随后与迁移一起验收，不能用“已暂停保留”宣称 05 完成。

管理列表通过同一个 `schedule.tasks.list` 返回原功能、原输入、安装候选、排期和每次执行历史，以及丢失定义的旧等待记录。`schedule.operations.recover` 显式 `plugin: false`；恢复前复查所见任务/历史 revision、当前安装世代和版本，任何过期确认都拒绝。未知结果只能明确 retry/skip，决定和原未知说明保留在 occurrence 历史；多个未知逐次核对完才恢复，一次性跳过即完成。HTTP 与 UI 只调用该 Action；刷新不自动提交，失败保留核对窗口。

Host 只留单向旧数据读取器：在同事务导入已知任务和全部 pending、保留原 id/job/时间/间隔/输入/链接/收据后，删除已转移的旧记录与队列项；无原任务定义的旧等待项保留为不可执行的历史记录，不猜测操作。缺安装世代的旧任务暂停，不能自动绑定当前安装。迁移不干预仍有活跃 lease 的旧任务，待 lease 结束再处理；重复启动不重复导入。旧版本不认识新持久状态，回滚前必须停用新任务并进行明确回迁，不能直接 revert 后同时启动旧队列。

验证：真实 SQLite/进程中断覆盖 claim 前后、派出前后和业务提交后中断；两个连接竞争、暂停/取消/重装/更换入口时晚结果拒绝；超过旧 50 条上限的历史 pending 全量保留；失败事务不删原数据；恢复等待只执行一次、unknown 零自动重放、真实安装 sandbox 经公开 Schedule 能力创建并到点执行。按包要求整体构建后回归及边界检查，恢复 UI 另走真实 Chrome。未完成的管理或迁移行为仍列为缺口。

### 能力执行元数据切片（安装执行迁移的前置）

当前 Builder 目录用 `capability_id === model.generate` 判断费用，sandbox 超时/slow lane 只读旧 Studio 名单；Agent 工具使用统一固定超时。新增提供方声明的 Action `execution`：明确时限、费用类别（未声明保持 unknown）和必要的调用频率上限，随原目录/版本传递。Kernel 对明确声明的时限和频率执行统一检查，沿既有 signal / beforeEffect 契约取消并拒绝迟到写入；入口可以有更严格的限额。现有 concurrent 声明继续负责并发，不新造第二种调度机制，取消仍为合作式而非保证厂商停止计费。

将 model.generate 和真实 AI/外部工具提供方的已知事实迁入声明，Builder、Sandbox、Workflow、Agent/MCP 消费共同定义；旧生成物只保留输入输出转换，不能继续以能力名称推断执行政策。验证任意名字的声明能力也受相同预算/超时约束、目录与实际执行一致、原调用者隔离、取消后 late commit 被拒绝。未声明的旧能力不被静默标为免费，也不凭空添加产品预算。此切片与 05 的安装执行端口串行，元数据接口及真实消费者迁移完成前不标记 06 完成。频率计数为本机当前注册实例的调用保护，按 actor/project/install 跨入口共享，不承担跨重启计费；未声明的能力不添加默认预算。旧生成物仅保留 Goals 形状适配，其余调用进入统一目录，并在实际派出前重新检查原调用者。设计阶段按声明的 metered 费用拒绝页面自动 query；Agent 的入口上限可更严格。安装调用现已逐次读取并复核当前依赖策略，详见下文；生成式公开动作声明仍随 07 收尾。

### 真实提供方执行声明

继续核对 Native AI 入口：Pages、Form、Dataset、灵光、Cognia、Jelly 的直接生成，Images/Experiments/Alchemist/Coding 的后台启动，以及 Feed/Inbox/Workflow/Functions、Home 判断与信息规划的模型或判断调用。由各提供方在实际定义处明确 `cost: metered`（可能消耗计量额度，不等于每次实际收费）；配置读取、取消、缓存读取不据此标为收费，也不以权限名推断。既有后台任务的业务时限、取消和恢复仍由其 owner 控制，本切片不把整个任务生命周期误当成 Action 处理器等待时限。没有单次动作总时限证据就不补假时限或统一频率。未知外部能力保持 unknown。额外确认 `alchemist.reuse.assess` 等待模型时仍占串行队列，因旧门禁只按 `model:invoke` 权限筛选而遗漏；它仅读取候选并在模型返回后核对原授权，改为显式 concurrent，并让门禁同时检查 metered 提供方。验证从真实 Home/项目目录读取并经 Builder 设计策略消费，确认直接生成与后台启动都会阻止页面自动收费查询，普通历史读取仍可用于查询。

### 安装调用随当前能力策略更新

代码证据：`sandboxedPluginDefinition.start` 只读取一次 capability catalog 并据此固定 slow lane 和 Runner/Broker 时限；真正的 `catalogCapabilities.call` 却每次选择最新提供方版本。提供方超时、成本或版本改变后，实际调用和进程限额不一致。query 禁止收费能力也只在生成时检查，现有安装可能在页面刷新时调用后来改为收费的依赖。

每次安装 operation 读取其实际依赖的当前目录，按同一 latest/offered 选择计算慢调用通道和本次操作/服务时限。Sandbox 增加仅可信 Host 可传的单次时限，沿现有 queue、Runner、Broker 和取消链执行，不修改 worker 协议或 CPU/内存/频率限制，也不为时限变化重建整套 Runtime。没有依赖的本地读写继续用原默认值；未声明费用保持 unknown。

安装调用捕获依赖的提供方、版本、可用性、执行策略和读写性质，派出前及异步等待后的原 beforeEffect 中复核；发生变更的原调用不继续产生副作用或提交结果，也不自动重试。新调用读取新策略。当前 query 拒绝收费或写入型依赖，不依靠能力名字；缺失/停用/不再开放的依赖在派出前拒绝。这里不扩大安装 grants，提供方自己的 Kernel 授权与频率检查仍逐次执行。外部结果可能未知时保留 unknown，不能经 HTTP 降格成普通失败。07 保留公开生成式动作的既有身份与不可变 Manifest，补齐费用事实；不改变既有指纹或授权引用。

嵌套 Action 超时或提供方被替换、Host 服务超时的未知结果由可信 Host 标记，并贯穿 Sandbox、安装 HTTP、公开 Action 和 Schedule。worker 不能通过 JSON 伪造该标记；也不能 catch 后返回替代值，将结果变成成功或继续提交。一次调用的未知状态不会污染下一次明确发起的调用。普通缺服务/权限拒绝仍保留原本的已知错误语义。

返回链复核补充：worker 返回违反 output schema 的值时，已有写入可能已发生。将其识别为结果未知的通道协议错误，终止并撤下失效进程；不回滚或重放已发生效果，下一次明确调用重新启动。输入 schema 拒绝仍发生在派出前，保留已知错误。

验证生产 Sandbox 的同进程逐次时限、队列内各调用预算互不污染、服务超时取消；真实安装版本/策略变化后读最新限额，query 的收费/写入变化零派出，等待期间变化导致零晚写入，合法新调用恢复且不重复旧工作。无关提供方注册不取消调用；同一描述的重新注册由 Kernel 原 registration token 拒绝旧提交。按受影响包要求整体构建后跑回归与边界检查。

### 插件事件身份、持久游标与提交检查

08 代码证据：总线发布没有检查 board/当前安装，Executor 交出的旧 events client 在 stop 后仍能 append；游标只按插件名和来源保存，重装会继承旧进度；投递不在调用前持久记录 delivering，崩溃可能重跑已提交处理器，处理器等待后撤权仍推进游标。现有运行订阅来自安装 Manifest，而非用户请求，保留这一授权来源；不复制某次 Action 的回调作为持久身份。

先修复现有总线的完整执行边界：Supervisor 提供来自 Runtime 安装事实的 install_id/generation/version，持久游标绑定订阅安装及世代；发布客户端绑定本次 activation 并检查当前实例、项目及发布声明。新订阅只接收绑定后的事件，重启同一安装续接，重装不消费旧世代工作。已有无身份游标保留为隔离的历史，不能补成当前安装；当前订阅从当前日志尾建立自己的游标，不擅自重放历史。迁移原表保留所有数据并改变复合主键；代码回滚前须先停止事件投递并做明确数据库回迁，不能直接运行旧版忽略身份。

投递开始前持久写 delivering；完成前再次验证实例、订阅声明、取消及版本，提供独立的 beforeEffect 给订阅处理器。进程中断/撤权后未确认的处理保留 quarantined，不自动重试可能已提交的工作；尚未进入处理器的启动失败仍可恢复。游标按安装隔离，旧回调不能覆盖新安装状态。各消费者拿到独立 payload 快照。Files/Git 的真实处理入口接入新的 delivery guard，Host 关闭先撤销并等待事件结束再关数据库。普通命令和查询不改走总线。

验证真实 Runtime、SQLite 持久游标与重启：旧客户端发布拒绝、项目和安装隔离、异步撤权零后续效果/零错误确认、重装旧工作不串入、并发 resume 不重复、崩溃后 unknown 零重放、旧表迁移保留历史与事务失败回滚。该步骤完成后继续领域 journal 到总线的提交桥接及实际消费者，不以仅加接口标记 08 完成。

进一步检查 stop/uninstall 的 await 边界发现 Runtime 在等待插件清理后才撤销 contribution/context；现改为先撤销再等待，Supervisor 的活实例检查同时比较当前 contribution。避免清理钩子未返回时，旧发布者或订阅者仍被当作活动实例。升级排队交接按版本/启用世代去重，游标不能越过首条未处理事件；未知投递的显式恢复管理仍随后续 08 完成。

同一安装重新启用后，新发布沿同一来源补齐仍未派出的持久队列，并按序投递，不依赖调用者额外 resume 才能解开缺口；已经进入处理器但结果未知的游标继续隔离。重启回归同时持久化 Runtime 安装与事件，不能用新建内存安装冒充同一安装重启。

### 内置插件装配与生成式公开声明

07 当前证据：普通 Runtime 插件已由 Manifest.actions 与实际 contribution 注册，停用撤销，MCP/Agent/Workflow 复用目录，不需再造发现层。内置插件仍在 Workbench 的 catalog、workbench packs 和 Host 历史 MCP handler 表重复绑定同一个身份；Coding 设置还在 composition 单独注册。不同 Native Host 工厂携带各自领域依赖，显式注入这些端口是必要的装配，不以动态反射替代。

本切片将内置 build 的 Manifest、产品目录信息、Agent 正文、UI 贡献/静态资源和可选历史 MCP 适配入口放在 Workbench 同一份 `builtin-plugins.ts` 装配声明。catalog、workbench pack 和 Host 的旧名称 MCP 适配从它派生；原包继续拥有 Manifest、实现和资源，Host 保留权限、配置与真实端口。保留全部导航/市场条目、CSS/客户端加载顺序、旧 MCP 名称和授权引用；UI 资源顺序是明确的装配顺序，不能借本次整理改变页面设计。删除三份重复名单和 Coding 设置特例。新普通插件仍走现有 Runtime；仅新增内置打包项时在一个条目绑定它的已导出实现，不自动加载文件系统中的任意代码。

Native UI 兼容证据：Goals Manifest 明确只声明静态产品位置，内部面板不是 Runtime 兑现的 contribution；Goals/Work/Feed 等 UI 的 `io.molis.work.native.*` 身份与 Manifest 全局插件身份长期并存。本次保留全部现有贡献身份和挂载合同，不强加 Runtime 的身份相等/全部内部面板声明规则。普通 Runtime 插件的 manifest/contribution 兑现校验保持严格。

验证实际 UI Host 挂载、客户端初始化和资源组合，未知内置条目无需增加 Host 名单即可提供 UI 与历史别名。通过真实 MCP 的原用例验证旧别名及新 Action 发现/调用保持权限、版本和项目隔离。源码归属门禁改为跟随唯一声明，并保留删除贡献、断开派生或未注册时必失败的负例。构建前记录原产物，比较导航/Manifest/静态资源/MCP 描述无语义变化；不把该比较单独当成业务验证。

生成式安装的唯一公开操作声明已经是已发布 SandboxContract.operations，Host 的安装 owner 将其登记进共同 Action 目录；合成 Runtime Manifest 只承担执行容器身份。复核后不再要求为了形式一致改用 Manifest.actions：这会无谓改变旧提供方授权和不可变安装指纹。保留原动作 ID/provider/version、安装批准与状态检查，升级/回滚仍以实际发布契约替换公开声明。

当前补齐费用事实：Host 依据每个 operation 的 effects 与当前依赖目录派生公开 execution.cost；本地存储等不收费，任一依赖明确收费则 metered；没有明确收费证据时，网络、缺失声明、缺失依赖或循环依赖保持 unknown。生成插件互相调用时沿当前实际 provider/version 递归解析，不以旧的派生结果再次推导；一轮刷新收敛，不按名称猜费用。发现、调用准备与 Builder 目录均刷新，只有变化的 operation 重新注册；普通目录读取、其他 operation 的费用变化不能撤销无关的在途调用。停用、卸载或关闭后，异步刷新不得重新挂回旧动作。声明不扩大任何 MCP/Agent/插件授权。

公共 cost 是可能收费的事实，不是用量或预算。沙箱 operationTimeout 从排队头开始、频率按 lane/安装计数，公共 Action 的时限从处理器开始、频率按 caller/project/install 计数；不把这些不同语义的限制直接互拷。现有动态沙箱依赖策略与每次 beforeEffect 复核保留。验证覆盖真实 Host 自动恢复/发现/调用，直接及传递费用、缺失/网络/循环、动态更新、无关调用存活、升级回滚与原 MCP 授权引用、停用与关闭期间刷新；安装指纹不变，无数据迁移，回滚仅回退 Host 派生代码。08/09 与最终全消费者验收仍待完成。

实际升级→回滚验证发现：Host 每次重新构造同版本 PluginDefinition，而 Runtime 正确拒绝用新对象覆盖已注册的不可变实现。由安装 owner 按已发布 plugin/build/version 保留唯一执行定义；切换先验证批准覆盖该发布所需权限，沙箱只收到该发布所需的权限集合。卸载清理该插件的定义，重新安装创建新的执行对象。保留 Runtime 的冲突检查、发布版本不可覆盖、原安装指纹及版本授权；不在 Kernel 放宽约束。

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

- 真实 Native/Host 提供方：在实际定义处补齐已知 AI 消耗声明，修复 Alchemist 复用评估占住项目队列。68 文件首轮 372/373 通过；唯一失败是新增门禁发现 Home 判断缺少声明，同链审查还找到 information.plan，两处补齐后重新整体构建，10 文件 70/70 通过。已通过的其他插件回归保留有效；69 包边界检查与 diff whitespace 检查通过。日志 `/tmp/platform-native-policy-build.log`、`/tmp/platform-native-policy-regression.log`、`/tmp/platform-native-policy-recheck.log`、`/tmp/platform-native-policy-boundary.log`。真实目录进入 Builder 策略及等待期间可编辑均有行为回归；未运行真实付费模型。

- 提醒归位：删除 Builder 私有提醒实现，公共动作、持久记录、原子创建/取消与消费归 Schedule；Host 注册唤醒、迁移旧键并装配 Inbox。保留旧 job/固定间隔/链接，无法证明原安装的记录暂停保留；不增加启用对话页面的条件。整体构建通过，20 文件首轮 141/141；复查补上独立项目路由前缀和真实 Catalog 停用策略后的 11 文件 63/63，无跳过，含真实 Chrome 发布安装及两个 Home 的数据库隔离。日志 `/tmp/platform-schedule-reminders-regression.log`、`/tmp/platform-schedule-reminders-final.log`、`/tmp/platform-schedule-reminders-final-build.log`。事务回归模拟真实 SQLite 写入失败及 lease 撤销，验证 job/提醒/Inbox 无部分提交。迁移并非无条件可 revert，回滚要求见上文。

  最终边界检查通过（69 包，errors 为空），diff whitespace 检查通过；日志 `/tmp/platform-schedule-reminders-final-boundary.log`。没有修改真实 Home 数据，本次迁移证据来自隔离的真实 SQLite 与 Host。

- 安装调用执行控制：Action → trusted route execution → Runner/Broker → 私有存储、嵌套 Action 和网络派出均保留原 signal/beforeEffect；删除静态 actor 授权，外层动作 concurrent，运行中取消不重放。定时入口按数据库/项目隔离，迟到成功/失败均先复查，结果与一次性消费同事务提交。整体构建通过；23 文件 162 项通过、1 项真实公网 HTTPS 测试未启用而跳过，包含真实 Seatbelt/SQLite、撤权/注销/取消后的零写入与合法恢复、队列取消、授权等待超时、DNS/密钥解析后不派出和 Chrome 发布使用路径。日志 `/tmp/platform-installed-control-build.log`、`/tmp/platform-installed-control-regression.log`。首次 boundary 指出新增 Kernel 生命周期依赖未登记到 workspace inventory，已补齐声明并重新整体构建。最终 5 文件 28 项通过、1 项真实公网跳过；队列溢出旧测试假定 Host 服务一定已派出，与新增异步授权门禁冲突，现断言未派出的不执行、所有已派出的信号停止，并保留独立的明确进入服务后取消用例。新增严格 HTTPS proxy 的派出前撤权验证也通过。69 包边界检查 errors 为空，diff whitespace 检查通过。日志 `/tmp/platform-installed-control-final-build.log`、`/tmp/platform-installed-control-recheck.log`、`/tmp/platform-installed-control-final-boundary.log`。

- 安装运行独立于 Studio：Host 按项目数据库持有唯一安装运行入口，公开发现、重启恢复、页面和定时调用都不初始化创作 Workflow；关闭 Studio 不停止安装进程。正常关闭保留启用意图，显式停用跨重启保留，缺批准记录不自动补权；卸载实际删除或保留私有数据，冷安装可卸载，同进程确认重装可重新登记并运行。整体构建通过；首轮 25 文件 167/169 通过，两个失败分别是新增用例违反 schedules.add 的对象输入契约、后台标签页按生命周期暂停。修正测试前置条件，进一步验证捕获了 Supervisor 撤销状态和 Runtime 保留旧实现导致无法重装的实际缺陷，修复后最终 8 文件 44/44 通过，无跳过。其余原范围通过证据继续有效；额外网络 4 项通过。真实 Chrome 覆盖关闭并重开 Studio、独立安装页保留数据及完整发布使用流程；真实 SQLite/Seatbelt 覆盖无 Studio 恢复、定时调用、未完成草稿不被恢复、Home 隔离、停用/卸载/重装及缺批准记录的修复路径。69 包边界检查 errors 为空，diff whitespace 检查通过。日志 `/tmp/platform-installed-host-regression.log`、`/tmp/platform-installed-host-recheck.log`、`/tmp/platform-installed-host-uninstall-build.log`、`/tmp/platform-installed-host-uninstall-regression.log`、`/tmp/platform-installed-host-boundary.log`。未运行真实付费模型。

- 安装世代：Runtime 新安装/重装产生 installation_generation，保留数据 ID，启停、重启和升级不换世代；Schedule 提醒从 Host 取当前身份并绑定，原安装不可用时保留记录并产生失败收据，UI 显示原因。纠正此前时间推断方案：旧 Runtime 同时复用 installed_at，因此缺少世代的历史记录全部保留暂停，既不丢记录也不自动补权。整体构建通过；19 文件 116/116，无跳过，覆盖同毫秒重装、旧安装拒绝跨世代取消/投递、新提醒正常投递、原 job/时间/链接保留、重复迁移/普通启用不补权、SQLite 事务失败与 lease 拒绝、私有数据保留、实际 Chrome 中 Native 升级后的草稿读取。日志 `/tmp/platform-installation-generation-receipt-build.log`、`/tmp/platform-installation-generation-regression.log`。真实模型与用户本人验收未运行；旧任务的明确恢复入口仍是 05 的未完成项。

  安装世代的最终 69 包边界检查 errors 为空、diff whitespace 检查通过，日志 `/tmp/platform-installation-generation-boundary.log`。没有改动真实 Home 数据，迁移证据来自隔离 SQLite。

- 旧提醒明确恢复：Schedule 管理投影、公开恢复 Action、HTTP 与实际确认 UI 已接通，Host 只读取 Runtime 的当前安装与元数据；恢复和启用同事务，不改 job/时间/间隔/收据/链接。首次整体构建后 15 文件 80/81 通过，新增回归发现 Agent 能力默认提供给插件，恢复接口也可被插件继承；按现有协议补 `plugin: false` 后重新整体构建，8 文件 38/38，无跳过。包括限额、目标缺失/歧义、旧确认被重装拒绝、跨 Home/项目、撤权、原子回滚、重复确认不撤销后续暂停、重启后补提醒一次，以及真实 Chrome 窄屏中取消、拒绝旧确认、刷新失败保留内容和重新确认。日志 `/tmp/platform-reminder-recovery-build.log`、`/tmp/platform-reminder-recovery-regression.log`、`/tmp/platform-reminder-recovery-final-build.log`、`/tmp/platform-reminder-recovery-final-regression.log`。

  提醒界面隐藏旧 Builder 内部标识的最后调整再次整体构建通过；9 文件 UI/Workbench 33/33，无跳过，包含真实 Chrome 的新恢复动线和原有工作台标签/分屏。已查看窄屏浅色/深色截图，使用现有组件，没有重做页面；深色截图等待主题过渡结束后核对文字对比。最终 69 包边界检查 errors 为空，diff whitespace 检查通过。日志 `/tmp/platform-reminder-recovery-ui-build.log`、`/tmp/platform-reminder-recovery-ui-regression.log`、`/tmp/platform-reminder-recovery-boundary.log`。所有数据、投递及迁移在隔离 SQLite/Home 中验证，没有修改真实 Home 数据，没有运行付费模型，也不代表用户本人验收。

- 定时 operation 与持久恢复：Schedule 接管计划、occurrence、公共 schedules.add/cancel 和管理 Action/UI；删除 Builder 的生产队列与调度文件。Scheduler 同事务 prepare 保存 pending，派出前变为 running，结果/Inbox/终态同事务复查。已派出中断转 unknown，停止后续排期；确认 retry/skip 保留历史并拒绝过期的任务、安装或版本。旧队列完整迁移、保留原 job/间隔/输入/链接/收据；活动 lease 延后迁移，并在缓存 timer 的后续 tick 重新导入，不能把旧 job 当作已取消消费。缺失定义的历史可查看但不可运行。

  整体构建通过。最初核心 3 文件 25/25，恢复入口 6 文件 32/32；代码复查补齐缓存 timer 的延后迁移后再次整体构建，最终 34 文件 220/220，无跳过。包括真实子进程在派出前、派出后和业务提交后被 SIGKILL；未派出的可继续，已派出的未知工作零自动重放，已提交结果不因缺技术收据而重放。真实 SQLite 验证准备/创建/取消/结果/恢复失败回滚、世代/Home/项目隔离、配额、晚结果拒绝；旧 60 条 pending 全部迁入并逐条执行，无限长裁剪。Seatbelt 实际安装操作在 Host 重启后继续执行，HTTP 适配保留沙箱中断的 unknown；Chrome 窄屏验证取消、重装拒绝旧确认、刷新失败保留窗口、明确跳过和浅/深色布局，已查看两张截图。

  日志：/tmp/platform-scheduled-operations-final-build.log、/tmp/platform-scheduled-operations-regression.log；先前定向日志 /tmp/platform-scheduled-operations-targeted.log、/tmp/platform-scheduled-operation-recovery-targeted.log。全部使用隔离 Home/SQLite，没有改动真实用户数据；未调用付费模型或外部服务，不代表一骏本人验收。

  最终 69 包边界检查 errors 为空，diff whitespace 检查通过；日志 /tmp/platform-scheduled-operations-boundary.log。源码与构建完成后再回归，回归期间没有改源码、脚本、package.json 或 Skill。

接续位置：05 的调度归位、安装运行独立与恢复链路，06 的执行策略及依赖复核，07 的 Native 装配与生成式公开声明均已实现相应链路；08 的订阅身份、安装世代与处理中断隔离已实现。后续继续 08 的领域 journal 提交桥接、实际消费者及 unknown 显式恢复；09 的材料提取/资源契约；再完成 01–03 及其余实际消费者、文档与 Skill 的最终总验收。仍只交付本地改造，不以已完成切片替代整个任务。

- 安装调用策略更新：删除启动时固定依赖目录、通道和时限的旧路径，每次 operation 使用当前依赖事实，经可信 beforeEffect 复核。query 动态拒绝 metered/写入/停用依赖；无关目录变化不影响本次调用。Sandbox 的单次时限在排队前复制，不进入 worker JSON，也不改 CPU、内存、频率或 grants。嵌套 Action/服务超时的 unknown 贯穿 HTTP 与公开 Action；插件捕获错误后不能继续写入或伪装成功。返回值违反 schema 也保留可能已提交的效果，撤下死进程，下一次明确调用可重新执行。手册、Skill 与包约定同步。

  首轮 6 文件 61/61 通过；补齐输出协议错误后重新整体构建，最终 17 文件 135 项通过、1 项可选真实公网 HTTPS 未启用而跳过，零失败。覆盖真实 Seatbelt 复用进程/独立排队时限、当前版本和策略变化、同描述重新注册、晚写入拒绝、未知状态不可伪造或清除，以及真实 SQLite 提交、Schedule 进程中断/恢复、Chrome 明确恢复入口。没有运行付费模型，数据来自隔离 Home/SQLite，不代表用户本人验收。日志 /tmp/platform-installed-policy-final-build.log、/tmp/platform-installed-policy-regression.log；首轮 /tmp/platform-installed-policy-targeted.log。

  最终边界检查 errors 为空，diff whitespace 检查通过；日志 /tmp/platform-installed-policy-boundary.log。回归期间未改源码、脚本、package.json 或 Skill。06 的生成式公开声明、07–09 及最终全消费者复核仍未完成，不以本切片替代整体交付。

- 内置 build 声明收敛：新增唯一 builtin-plugins 装配表，catalog 和 workbench packs 只做派生；删除 Host 六插件 legacy handler 表，历史适配从同一条目读取，缺声明/处理器时拒绝装配。Coding 设置改走公共贡献循环。插件包仍拥有 Manifest/实现/资源，Host 保留领域端口与权限；没有改变 Native 与 Runtime 的运行模式。开发手册、主 Skill 及 host/ui 指南同步，纠正 Agent 正文手工名单和“给 Agent 再另加 MCP”的过期接入描述。

  改造前后实际产物比较：25 个 catalog/Manifest 条目、原 19 组 UI pack、CSS/设置 CSS/客户端 bootstrap、搜索行和 6 组历史 MCP 源逐项相同；Coding 设置为原特例移入公共 pack，身份保持。基线 /tmp/platform-builtin-composition-before.json；该比较仅证明保留行为，还验证实际挂载、初始化、授权与撤销。

  首轮 4 文件 15/16，唯一失败是新增检查错误要求静态 Native UI 必须遵守 Runtime 的 owner/全部面板声明规则。依据 Goals Manifest 的明确分层与真实挂载路径修正测试契约，保留旧贡献身份检查；未放宽 Runtime 校验。最终整体构建通过，23 文件 126/126，无跳过，包含真实 MCP stdio 到常驻 Host 的六族旧工具/精确授权/撤权/项目隔离，未知条目 UI 挂载与客户端初始化、原 Action 的缺权拒绝/授权成功/注销拒绝，以及 Chrome 标签/分屏。没有付费模型和真实用户数据改动，不代表用户本人验收。日志 /tmp/platform-builtin-composition-final-build.log、/tmp/platform-builtin-composition-regression.log；首轮 /tmp/platform-builtin-composition-targeted.log。

  69 包边界检查 errors 为空、diff whitespace 检查通过，日志 /tmp/platform-builtin-composition-boundary.log。门禁沿唯一声明追踪，删除贡献、断开派生或取消 UiHost 注册都会被负例拒绝。回归期间未改源码、脚本、package.json 或 Skill。生成式公开声明与策略、事件与材料契约、最终全消费者复核继续保持未完成状态。


- 生成式公开能力与版本复用：保留已发布 operations 为唯一公开声明，由安装 owner 派生 Action；保留原 provider/action/version、Manifest 指纹和 MCP grants，不强制统一三种运行模式。公共费用沿当前实际 provider/version 解析直接及传递依赖，网络、未知依赖和循环不能被标成免费；普通发现与无关费用变化保留在途调用，仅变化的 operation 替换注册。关闭期间等待中的目录刷新不能重新注册。外部 MCP 恢复先于最终费用刷新，没有生成式动作的普通项目不额外扫描目录。

  实际升级→回滚暴露了同版本执行对象冲突，安装 owner 现复用不可变发布定义，版本切换核对批准、仅授予发布所需集合，卸载清理并允许新安装重建；未放宽 Runtime 冲突与发布版本校验。手册和能力 Skill 同步。最初定向检查发现新增夹具括号/未声明操作两处错误及上述真实回滚问题；修复后 5 文件 32/32，通过前没有放宽断言。最终整体构建通过，22 文件 135/135，无跳过，包含真实 SQLite/Seatbelt 执行与数据提交、Host 自动恢复、升级回滚、启停卸载重装、MCP 精确授权、Runtime 任意新插件 HTTP 发现及原发布流水线。

  69 包边界检查 errors 为空，diff whitespace 检查通过；回归期间未改源码、脚本、package.json 或 Skill。日志 /tmp/platform-generated-costs-final-build.log、/tmp/platform-generated-costs-targeted.log、/tmp/platform-generated-costs-regression.log、/tmp/platform-generated-costs-boundary.log。均使用隔离测试数据，未调用真实付费模型或外部服务，不代表用户本人验收。事件/材料契约与最终全消费者复核仍未完成。

- 事件身份与投递边界：发布检查当前项目/安装，Host client 绑定 activation；订阅游标绑定安装及世代，旧无身份游标原样保存为历史。投递前持久写 delivering，处理器得到独立 actor/安装与 beforeEffect，完成后再复查；撤权、关闭及进程中断的未知处理隔离，不能自动重跑。Runtime stop/uninstall 在等待清理前撤销执行权限，Files/Git 的处理端口传递 delivery 控制，Host 关数据库前等待总线停止。升级交接和同一安装重新启用不能越过尚未派出的事件。

  整体构建通过。首轮 32 文件 219/221：一个测试只持久化事件却创建了新安装，改为真实 SQLite Runtime 后验证同一安装世代跨重启不变；另一个捕获重新启用后旧队列缺口导致后续投递卡住，已在发布路径按来源接回未派出的队列，并增强完整顺序断言。修复后重新整体构建，受影响的 13 文件 85/85，无跳过；其余首轮通过证据仍有效。覆盖真实 Host、SQLite 旧表迁移/故障回滚、旧 client 失效、重装隔离、重复 resume、慢清理期间零晚写入，以及业务提交后 SIGKILL 的未知工作零自动重放。日志 /tmp/platform-event-identity-final-build.log、/tmp/platform-event-identity-regression.log、/tmp/platform-event-identity-recheck-build.log、/tmp/platform-event-identity-recheck.log。

  全部使用隔离数据；未运行付费模型或外部服务。以上是事件基础边界的工程证据，领域提交桥接、实际领域消费者和显式 unknown 恢复尚未完成，不能计为 08 或整个 Goal 完成。

  最终 69 包边界检查 errors 为空，diff whitespace 检查通过；日志 /tmp/platform-event-identity-boundary.log。回归期间未改源码、脚本、package.json 或 Skill。
