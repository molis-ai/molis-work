# 公共能力归位与 Prologue 接入收敛

状态：实施中。2026-09-28 用户授权完成下列全部范围，目标等级为「内部完整」。本文件是需求、迁移决策和验收进度的唯一入口；尚未验证的项目不能计作完成。

## 目标与证据

以当前调用链确定 Prologue SDK、平台基础设施、官方公共插件、业务插件的职责，完成公共实现及真实消费者迁移，删除重复路径。不是把所有能力下沉平台。基线为 `c20bb18e`（PR #94），工作分支 `feature/platform-capability-consolidation`，复用 architecture-followup 隔离工作树；不改主检出的其他 Session 工作。

改造前核实：Cognia 与 Coding draft 各自创建临时 Prologue Runtime；公共推理端口只返回文本/不透明 usage；Builder 已使用共享 Scheduler，但提醒、定时 operation、存储和待执行队列仍绑定 Builder。Schedule 本身已是官方 native 插件，不新建调度系统。源 SDK 位于 `/Users/yijunwang/code/prologue-dispatch-denied`，消费基线 `03c6ba0b`，SDK 改动须由源码构建再更新 vendored 依赖。

开始时其他 Session 在主检出做动作授权/Feed 提交边界和独立 UI 原型。架构修复 Session 的已完成结果已通过 PR #95 纳入本分支；最近核对为完成状态。本任务继续使用隔离工作树，进入其他仍在修改的模块前核对当前差异，不能覆盖或重复搬运成果。

## 范围、归属和依赖

| 项 | 当前问题 → 目标与消费者 | 所有者 | 依赖 / 状态 |
| --- | --- | --- | --- |
| 01 | Cognia、Coding 草稿绕过 Home Runtime → 同一模型入口与执行 owner，删除临时 Runtime/轮询 | Local Host 选择与凭据；Agent Host 执行桥 | Cognia/Coding 已迁移，Coding 两类草稿指令与 Alchemist 六类固定指令已登记并验证用户覆盖；Alchemist 与生成插件使用公共绑定，Builder 设计/编码保留同一 owner；Shelf recipe 已接入 Host/共享 Prologue，自动 CLI 与重复解析已删除；其他模型适配继续核对 |
| 02 | 文本结果不完整 → 文本/结构、进度、引用、终态、实际模型、typed usage；Alchemist、Jelly、Coding、生成插件迁移 | Agent Host 公共推理契约 + Host 绑定 | 公共契约、Host 绑定及 Alchemist/Jelly 结构化消费已实现并验证；最终全消费者复核待完成 |
| 03 | App 重复收集 Run；schema 支持不足/本地校验不贯通 → SDK 有界收集与显式校验/有界纠正 | Prologue Session/Model；领域 parse 留消费方 | SDK 有界收集、Run 终态结构校验、必要 schema 子集已落地并打包；SDK 已有 Function 外部校验保留；Alchemist 显式有界纠正已接通，领域约束仍由插件校验 |
| 04 | Pages、Images、Alchemist、Builder 重复运行控制 → 抽取真实共性并迁移，保留各自业务恢复 | Kernel 执行生命周期，经 Plugin SDK；领域继续持有状态/恢复 | 已实现；本地关闭晚提交与恢复回归通过 |
| 05 | Builder 专属提醒/operation/待执行生命周期 → 既有 Schedule、Scheduler、安装执行端口各负其责 | 官方 Schedule 产品、平台技术调度、业务插件执行 | 已实现提醒/operation 归位、独立安装 owner、安装世代、全量旧 pending 迁移及明确恢复；工程、真实 SQLite/进程中断/Seatbelt 与 Chrome 路径通过，未运行付费模型和用户本人验收 |
| 06 | timeout/cost 等按名称硬编码 → 公共动作元数据与一致消费策略 | Contracts/Kernel/Host | 执行声明、Kernel 时限/频率、Builder/Agent、Native/Host 及安装调用的动态依赖绑定已实现并验证；生成式公开操作从发布契约派生，当前及传递依赖 cost 已接通；最终跨入口验收随 12 |
| 07 | Native catalog/pack/Host 多清单 → 适合现有部署模式的共同描述与注册发现 | Host composition + 插件公开描述 | 内置目录、UI 资源/贡献、Agent 正文与历史 MCP 已归同一装配声明并验证；普通 Runtime 发现链保留；生成式已接通费用刷新和旧版本定义复用，保持发布契约为唯一公开声明；提示词按执行版本解析、按安装分别登记，真实 Sandbox/SDK/HTTP 验证通过；最终跨消费者验收随 12 |
| 08 | 领域提交到插件事件缺桥接 → 已提交事实通知、独立订阅身份/生命周期 | 既有领域 journal / 输入图及 PluginEventBus | 安装身份/世代、持久投递状态、旧游标迁移、异步提交检查与关闭、unknown 明确恢复，以及 Artifact journal 到输入图的通知已实现并验证；Coding/Git 真实 Run/Effect 通知、Files/Git Host 消费与可见刷新已接通并验证；最终全消费者复核随 12 |
| 09 | Jelly/Shelf/Cognia/Pages/Artifacts 重复材料处理 → 公共 Host 解析/资源/来源契约 | Host 解析，Storage 资源，业务转换留插件 | 公共字节/定位/覆盖契约、Host 文字/HTML/PDF worker 与原生组件已实现；Jelly/onboarding 迁移及工程/本地原生验证通过；Pages/DOCX/ZIP 的 Host 解析、领域转换与双入口装配也已迁移并验证；Cognia 无损 vault/附件边界已复核并保留；Shelf 网页与 Artifacts HTML/外部导入已迁移并验证；Shelf PDF/OCR 已迁入公共 Host 并完成本地验证，AI recipe、原图和覆盖说明已接通，最终消费者复核继续 |
| 10 | Alchemist 搜索依赖 Feed 装配 → 共享 SEL 搜索和证据保存，兼容历史 ref | Host 搜索组合，领域策略留消费者 | 已完成实现与工程验证；真实外部搜索未运行 |
| 11 | Coding/Builder/Shelf/Images 各管 timer/SSE/observer → 公共客户端生命周期与实际清理 | UI Host/Workbench | 已覆盖 Images、Coding 及子面板、Builder 两套界面、Shelf 及结果面板，并补齐 Files/Git、独立 Diff/Text Stats 与 Host 审查的真实挂载/隐藏/卸载链；工程与 Chrome 验证通过，最终跨消费者复核随 12 |
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

08 后续代码复核：Coding/Git 有发布声明而无生产发布；Files/Git 的 Host 通知端口尚未装配。Artifact 的发布/失效已与领域 journal 同事务提交，应通知已有输入图；文件写入和 Git 操作的执行真相在 Prologue Effect/Run 回执，不能假定项目 journal 包含这些事实，也不能从一次普通读取推断操作成功。领域接线继续按各自事实 owner 处理，不能把所有查询改成事件。

在新增生产投递之前完成未知事件的明确恢复：Runtime 按项目查询隔离记录，展示事件来源、处理插件、时间、错误和当前安装是否匹配；Workbench 插件管理提供查看、重新读取、取消、明确 retry/skip。retry 明示可能重复副作用，skip 只确认当前事件，不跳过后续。恢复必须由当前受控本地用户入口调用，不能暴露为插件自己的服务或替插件补授权；使用既有 Runtime 管理 HTTP 边界，不伪装成业务插件能力。

游标新增不可复用 revision，旧记录迁移保留全部字段；恢复比较所见 revision、首条未确认事件、安装世代和当前代码版本，拒绝重装、升级、停用、并发或重复提交。修改游标和记录 actor/时间/理由/决定的恢复历史必须同事务，失败全部回滚；重试仅解除该事件隔离，仍走原总线授权与派出检查。没有可信安装的历史只可查看，不能自动转交新安装。验证真实 SQLite 重开、CAS/回滚、事件顺序与旧 callback 拒绝，并以真实 HTTP 及 Chrome 验证权限、错误保留、取消和明确操作；外部副作用本身仍需人核对。

提交链复查还发现 delivering 落库失败会被当作普通处理器失败并错误推进游标；现显式区分是否已经进入处理器，未派出时保留 retry_wait，不丢事件。人工恢复后唤醒失败以同步错误返回、已保存的决定仍可查询，不留下脱离请求的 rejected Promise。前端每次请求捕获本次可见性 signal，重新进入页面不能让旧请求借用新生命周期覆盖界面。

Artifact 输入传播的实际缺口：`PluginInputGraph` 只检查记录存在，未检查 available/active；直接通过领域 API 失效或归档时没有通知，慢处理也只有 signal，缺少提交时的重新读取。继续复用领域事务内的 journal 和既有固定版本输入图：Storage 提供按对象类型读取 journal 游标，Host 以项目为界观察 Artifact 提交并重新计算输入。读取游标和重算只消费已提交事务；不把 Artifact 事件冒充 Coding 发布，不新增业务 outbox 或第二份 Artifact 状态。启动按当前事实重算，不需要重跑全部历史；断线期间以持久 journal 补发现变化。

输入图须拒绝已失效/归档记录，等待启动后和异步消费者提交前复查固定输入、当前插件实例与启用身份；暴露独立 beforeEffect 并迁移真实异步处理入口。重新激活应重新投递当前固定输入，旧调用不可转交新实例。Host 关闭先停止 journal 观察和输入处理，再关闭事件总线及数据库。验证两 SQLite 连接提交、外层事务回滚、同项目/跨项目隔离、关闭、启动等待中失效、处理等待中失效，以及再次激活接到当前输入；普通查询仍直接读事实。此改动不改变原 Artifact/端口数据格式，回滚仅失去自动失效通知与更严格的消费检查。

首轮回归发现收紧输入后 Text Stats 把失效材料显示为「等待选择」。保留原产品的 waiting/unavailable 区分，在输入状态附带既有的失效原因，由消费者明确显示不可用；不重新开放失效 payload，也不放宽原测试预期。

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

接续位置：05 的调度归位、安装运行独立与恢复链路，06 的执行策略及依赖复核，07 的 Native 装配与生成式公开声明均已实现相应链路；08 的订阅身份、安装世代、处理中断隔离、明确恢复及 Artifact journal 输入传播已实现。Coding/Git 生产通知已接通；后续继续 09 的材料提取/资源契约、Shelf recipe 的 AI 执行归位，再完成 01–03 及其余实际消费者、文档与 Skill 的最终总验收。仍只交付本地改造，不以已完成切片替代整个任务。

### Coding/Git 生产通知与可见视图刷新

生产证据：Coding 后台 follower 已取得 Agent Host 的已提交 Run 终态；Git 的 Prologue 适配器在核对持久 Effect 与 dispatch 回执后才调用 ReviewQueue.settle。现有 Coding workspace-invalidated v1 专指某次 review 失效，不能捏造 review ID 来代替普通执行结束；Git file-changed 也不能代表纯暂存、提交或推送。新增独立 v1 的 Coding run-updated、Git operation-updated 通知，明确携带真实终态/结果和工作区引用，不宣称文件必然改变。旧协议保留读取与订阅，不改历史 payload 含义。

Coding 使用本次 activation 的能力与事件客户端，follower 停用即取消等待，所有 await 后再检查当前身份；从开始时已核实的 workspace 捕获引用。Git 为 ReviewQueue 添加仅限实际新收口的观察口，恢复历史不发新执行通知，监听失败不得改写原 Effect 结果。Host 按项目装配，Git 插件按 activation 订阅并在 stop 时注销；撤销后的回调不能向新实例借权。

Files/Git 消费事件后仅使 Host 当前项目的视图 revision 失效。浏览器复用可见生命周期轮询轻量 revision，变化后重新读原有状态/内容；隐藏、卸载、重复进入及网络恢复不重复业务命令。revision 为进程内刷新提示，重启更换 epoch，首次进入总是读当前事实；它不承担跨数据库业务 exactly-once/outbox，通知丢失也不重试模型或 Git。既有持久事件总线继续管理已经 append 的顺序与投递。读取通知接口遵守项目与当前插件运行状态检查，不暴露事件正文或文件路径。

验收包括真实 SDK Git 成功/失败/未知回执、拒绝和重复 settle、历史恢复不新发事件、跨项目及停用隔离、Coding 终态/撤销晚结果，以及真实 Chrome 中可见自动刷新、隐藏零轮询、网络恢复和重挂。先整体 build，再按受影响包执行定向回归，最后 boundary；使用隔离数据，不调用付费模型。没有数据格式迁移，回滚仅停止自动刷新并保留历史事件。

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

- 未知事件明确恢复：Runtime 管理提供当前项目隔离记录与处理历史；Workbench 插件管理接入真实 Host HTTP，用户核对后明确选择重试或只跳过当前事件。安装世代、代码版本、事件和游标 revision 共同拒绝过期确认；SQLite 同事务保存游标与 actor/理由/决定，失败回滚。旧无身份记录保留查看，不自动补权。修复派出前写库失败误确认未执行事件，以及页面重新进入时旧请求覆盖结果的生命周期问题。

  整体构建通过，最终 28 文件 161/161，无跳过；69 包边界检查 errors 为空，diff whitespace 检查通过。包含真实 SQLite 两连接 CAS、事务故障、重启与迁移、明确 retry/skip 后的顺序及副作用，以及真实 Host/Chrome 的控制权限、取消、过期确认、读取失败保留输入和提交后历史。390px 窄屏浅色/深色截图均已检查，使用既有单选组件修复控件布局；截图在 `.impeccable/qa/review/plugin-event-recovery-{light,dark}.png`。日志 `/tmp/platform-event-recovery-final-build.log`、`/tmp/platform-event-recovery-regression.log`、`/tmp/platform-event-recovery-boundary.log`。无真实付费模型或外部副作用调用，未代表用户本人验收；领域桥接与材料契约仍未完成。

  最终 69 包边界检查 errors 为空，diff whitespace 检查通过；日志 /tmp/platform-event-identity-boundary.log。回归期间未改源码、脚本、package.json 或 Skill。

- Artifact 提交传播：Host 按项目观察既有 journal 的 Artifact 游标，其他连接的已提交失效/归档进入原输入图；外层事务未提交时不通知，启动直接重算当前固定事实。输入图拒绝不可用版本，处理器启动等待后和提交前复查原输入与当前实例；关闭取消等待，重新激活重新投递当前输入。Git 接入输入 guard，Text Stats 从输入状态保留失效原因，避免把不可用误显示为尚未选择。没有新增 Artifact 状态表、业务 outbox 或副作用重放路径。

  整体构建通过。首轮 6 文件 31/32 捕获 Text Stats 状态退化，修复产品反馈后重新整体构建，最终 41 文件 252/252，无跳过；69 包边界 errors 为空，diff whitespace 检查通过。真实 SQLite 两连接与外层事务验证提交/回滚、跨项目隔离、重新激活和关闭；慢处理与启动等待验证旧输入零晚写入；已有真实 Coding Chrome 生命周期路径通过。日志 `/tmp/platform-artifact-bridge-final-build.log`、`/tmp/platform-artifact-bridge-regression.log`、`/tmp/platform-artifact-bridge-boundary.log`。未调用付费模型或外部服务，没有新增视觉布局，未代表用户本人验收。

11 后续调用链复核：Workbench 的独立 companions 仍直接创建 MutationObserver，Files/Git 的嵌入和独立客户端仍使用无 signal 的 Host request、直接监听及定时器。Git 的 summary/operations/conflict 和审查视图还缺少等待后的显示世代检查；切页、重新进入和同一 DOM 重新挂载可能显示旧结果或重复监听。因此此前 11 的完成表述只覆盖已列出的主客户端，伴随面板仍待补齐。

继续使用 UI Host 现有 mountPluginClient：Files/Git 各自以目录节点拥有生命周期，不占用 Coding 根节点；结果面板随对应目录视图清理。独立 Diff/Text Stats 的挂载与显示由同一机制管理，删除私有 observer。GET 查询传递可见性 signal，写命令保留挂载 signal；写入返回只在原显示世代仍有效时更新 UI，不自动重放，不把隐藏/卸载当作服务端回滚。重新进入读取当前持久状态，操作中按钮和错误/重试保留原语义。Host 审查渲染使用调用方生命周期，容器因空内容而 hidden 不得阻断后续读取，也不得把插件赋予的 UI 生命周期当成执行授权。

验证实际 Chrome 中独立/嵌入 Files/Git、Diff/Text Stats 的隐藏祖先、慢响应、重新进入、卸载、同一 DOM 重挂以及单次点击只有一次请求；慢审查查询和决定返回不写入新的视图，仍以真实 Host 结果读取恢复。保留已有文件快照、Git 审查与写入回归。整体构建后按包要求回归，边界检查随后执行；此改动不宣称生产事件自动刷新已接通。

相关回归发现上轮 Artifact 输入修复将 Text Stats 的所有 missing.reason 都映射为快照丢失。区分主动撤销当前输出（例如切换项目目录）与固定 Artifact 内容确已不可用：前者等待重新固定、后者提示重新捕获，均不得继续统计旧内容。保留原 Files HTTP 跨工作区断言，并增加与 Artifact 失效/归档并列的输入撤销用例，不能把旧断言改成与错误实现一致。

Git 刷新原本在 summary/operations 尚未读取完时解除 busy，随后插入 source-control 区域会移动已有行。将该读取纳入同一刷新世代，完成后再显示变化行和解除 busy；浏览器操作等本次 Files/Git 刷新结束，再点击真实行，仍要求正文/差异可见与返回焦点正确，不用固定延时替代完成条件。

09 初步代码证据：Shelf 的 `pdf.ts` 自行解析 PDF 字符流，项目导入在 Host 使用 pdfjs，Jelly 的原生 PDF/OCR/音视频工具仍放在业务插件目录，HTML 文字/Markdown 提取也分散在 Shelf 与 Jelly Host。后续将解析器和系统工具归 Host，保留已有上传引用、各入口大小与取消策略、页码/时间定位和完整性表达；不能把 Pages 的任务卡/知识页生成或 Cognia 的业务引用一起搬入解析层。尚未实施该迁移。


- 伴随面板生命周期补齐：Files/Git 目录子树、独立 Diff/Text Stats 与 Host 审查使用现有 UI Host 挂载，删除私有 observer、裸监听和复制反馈 timer。读取绑定当前可见性，写入绑定挂载；隐藏后的旧读取、决定、错误和后续查询不能借用新显示世代。审查容器因空数据隐藏仍可读取，新显示世代只从 Host 重新取事实，不消费旧决定回调或重放命令。Git summary/operations 纳入原刷新并保持提交草稿。补充修复上轮 Text Stats 对主动失效输出的状态误判：切换工作区等待新快照，真正不可读/归档的固定内容提示不可用，均不统计旧数据。README、UI 手册和开发 Skill 已同步。

  整体构建通过。首轮 34 文件 147 项中 144 通过、3 失败：Text Stats 真实状态退化已修复并保留原 HTTP 断言；Coding 操作在面板加载未结束时点击到移动后的控件，修复 Git 刷新完成边界，测试等明确 busy 结束后仍要求真实可见正文与正确返回焦点；新增浏览器夹具先删 Chrome 数据再关进程造成清理失败，改为关闭服务器/浏览器后删除。原有通过项的证据保留，相关改动继续定向验证，没有放宽业务断言。

  最终影响面 8 文件复验 25 项：24 通过，余下新增夹具缺 UTF-8 声明使中文加载提示读成乱码；仅修正夹具编码后完整重跑该文件 5/5，零跳过。其余复验证据仍有效。覆盖实际 Workbench/Host 的文件快照、跨目录、嵌入/独立 Files/Git、Diff/Text Stats、窄屏返回、慢响应/请求中止、同 DOM 重挂单次派出，以及审查决定跨隐藏不重放、普通轮询不丢决定回调、空列表恢复。实际 Chrome 的 390px 深色 Files/Git 阅读截图已查看，沿用现有布局，无溢出；位于 `.tmp/coding-component-board-v2/{files,git}-mobile-dark.png`。验证使用隔离 SQLite/Home 和受控 HTTP 夹具，没有调用真实付费模型/外部服务，不代表用户本人验收。

  69 包边界检查 errors 为空，diff whitespace 检查通过。日志 `/tmp/platform-companion-lifecycle-final-build.log`、`/tmp/platform-companion-lifecycle-regression.log`、`/tmp/platform-companion-lifecycle-final-check.log`、`/tmp/platform-companion-lifecycle-browser-check.log`、`/tmp/platform-companion-lifecycle-boundary.log`。回归期间未改源码/脚本/package.json/Skill，也未并发构建；失败处理后再构建和复验。08 Coding/Git 的生产事件通知、09 公共材料提取与最终跨消费者验收继续保留未完成，不把本次生命周期补齐当作整个 Goal 完成。


- Coding/Git 生产事件闭环：新增语义明确的 v1 `run-updated`/`operation-updated`，保留旧事件格式；Coding 在 activation 内跟随 Run、停用取消等待并拒绝晚写入，Git 只从 Prologue 已核对的新 Effect/dispatch 回执发布，历史恢复/重复回执/其他项目/停用均不产生新执行通知。Host 的晚装配 observer 接入真实项目平台，Files/Git 消费后更新轻量 view revision。浏览器使用公共 watchRevision，仅可见时观察、变化后重读原状态，断线/重启重新读取；通知不承担业务重试。

  整体构建通过；最终 43 文件 271/271，无跳过，69 包 boundary errors 为空，diff whitespace 检查通过。包含真实 SDK + SQLite + HTTP 的生产桥接、成功/失败/未知区分、坏监听不改变 Effect、停止与重启、当前插件启用限制，以及真实 Chrome 的变更刷新、断线恢复、隐藏零轮询、卸载和重挂。初次定向 26/28：新 SDK fixture appVersion 误写为非 semver；Files 重挂后的初始 revision 请求期间旧 DOM 可点，和首次刷新重复。分别修正 fixture 与产品的初始化忙碌状态，保留原“一次点击一条刷新链”断言，最终全部通过。日志 `/tmp/platform-workspace-events-final-build.log`、`/tmp/platform-workspace-events-regression.log`、`/tmp/platform-workspace-events-boundary.log`。回归期间未改源码/脚本/package.json/Skill、未并发构建；未调用付费模型或外部服务，不代表用户本人验收。

  下一步材料归位的新增证据：ShelfStore.runRecipe 仍直接调用 Module 的 CLI job-runner、同步 OCR；PDF 提取和同步 admit/read preview 仍使用私有正则解析器。Jelly 已在 Host 调 native helper，但 helper/build/licenses 仍放插件目录，HTML/UTF-8 解析与 onboarding 重复。迁移须保留 Shelf 原始副本、job/result 身份及预览行为；不能只把解析器换名，或静默删掉 PDF 预览。Shelf 的 AI recipe 还须纳入 01 的最终消费者迁移，不能以“没有 createRuntime”扫描结果当作全部 AI 调用已收敛。


### 公共材料提取口与原生工具归属

09 的实现顺序先从现有 Host 生产调用消除重复，再迁移 Shelf/Pages 的模块内解析及执行。公共 `contracts/services/materials` 定义字节输入、页/时间定位、覆盖信息、容量/取消和提取端口；不新增材料库或第二份附件身份。Local Host 持有 UTF-8/HTML、PDF 文本层及 macOS OCR/音视频实现，原生 Swift 源码、构建与许可证一并迁入 Host 包。Jelly 继续保存同一路径的上传副本与 SHA 引用，旧模型缓存也保留在原路径；通用提取器只消费已授予的字节和受控缓存目录，不接收业务输入任意指定本地文件。

Jelly 的上传与重新读取改为调用公共 Host 提取口；保留旧错误码和显式模型下载选项。onboarding 的 TXT/Markdown/HTML/PDF 改用相同提取口，DOCX/ZIP 的解析与 Pages 领域转换下一步一并迁移，不以此宣称 09 完成。PDF 文本解析放独立 worker，结束、取消、超时和 worker 故障均释放；页数、正文字符/字节和输入大小有上限，扫描页/截断明确表示不完整，onboarding 的非 OCR 路径遇到不完整 PDF 返回问题而非冒充全文。Jelly 允许业务已支持的部分材料，但保持原定位与 coverage。

提取前及每个异步边界检查取消，原生子进程结束后仍检查；上传保存前复核 caller.beforeEffect，取消不触发模型下载或新的原始副本写入。原附件保存成功后发生解析失败仍保留原副本，错误不伪装取消。公共解析不调用模型，不下载远端资源；媒体模型下载只在明确允许时走既有原生路径。验证真实 PDF（含多页/空页）、UTF-8、HTML、真实 native OCR/音视频与缺模型行为、取消及资源释放、历史副本重读、打包路径和现有消费者回归。之后继续 Shelf/Pages/Cognia/Artifacts 调用方迁移和旧实现删除。

原生组件另外保留着没有任何生产调用方的 Apple Foundation Models summarize 命令，与 Jelly 已接入的 Prologue AI 链路重复。迁移时删除这一不可达生成路径及能力宣称，保留 PDF/OCR/转写；生成能力继续经 Agent Host/Prologue。提取契约用 coverage.truncated 明确容量截断，消费方不根据中文错误消息推断完整性。

原生构建输入还需进入现有安装器源码检查：跟踪 Swift、构建脚本和 Package.resolved，排除 SwiftPM 缓存与生成二进制；避免只更新原生源文件时仍把旧构建判为有效。不增加另一套构建状态或材料身份。普通 TXT 的标题继续使用文件名，仅 Markdown 从 H1 取标题，保持 onboarding 原行为。

验证捕获 Node execFile 的 signal 终止路径未传入 killSignal，忽略 SIGTERM 的子进程不会退出。Host 显式监听取消并 SIGKILL，等待 close 后清理资源；进程超时保持有界终止。另外上传 Action 本身 concurrent，不能先创建可被并发重读的空 SHA 文件；先写受控临时副本，在最后一次 beforeEffect 后原子链接到既有 SHA 路径，并发相同内容复用已提交副本，取消清理未提交临时副本。


- 公共材料提取首批消费者：Host 持有公共契约实现、UTF-8/HTML、可终止的 PDF 文本 worker 和原生 PDF/OCR/媒体工具；Jelly 保留 SHA 身份、原始副本/模型路径、旧公开结果形状与错误码，onboarding 保留附件原文、身份和标题规则。删除 Jelly/导入里的重复解析、插件内原生构建和无生产调用方的 Apple 摘要分支，手册与开发 Skill 同步。上传以临时副本和原子 link 提交，并发同内容复用完整文件；取消/撤权不提交尚未保存的副本，已保存原件仍可重读。原生源码进入已有安装器构建输入检查，不跟踪 SwiftPM 缓存或二进制。

  整体构建通过；最终 22 文件 176/176，无跳过。包含真实 PDF 多页/空页与完整性、字节/字符容量及 Unicode 边界、worker 取消/超时及资源释放、并发上传/撤权、旧 SHA 重读、真实 macOS PNG OCR/混合 PDF/静音视频、缺模型不下载、实际 native 子进程与临时目录清理、可执行发布资产和许可证，以及真实 MCP 与 onboarding/Artifact 持久化。回归过程中没有改源码、脚本、package.json 或 Skill，也没有并发构建。

  定向验证抓到 execFile 的 AbortSignal 终止路径未沿用 killSignal：忽略 SIGTERM 的测试子进程挂起，手工终止后该轮不算取消证据。改为 Host 显式 SIGKILL 并等待 close，最终用例在任何兜底清理之前断言进程已不存在、真实临时目录已删除；超时看门狗仅用于失败清理。构建迁址遇到旧 Swift PCH 的绝对缓存路径，清理本工作树的构建缓存后真实重建通过，没有改依赖版本或绕开原生构建。

  日志 `/tmp/platform-materials-final-build.log`、`/tmp/platform-materials-final-regression.log`。原件与数据库均为隔离测试材料；未调用付费模型、下载语音模型或验收真实音频转写质量，也不代表用户本人验收。09 仍需其余消费者的迁移，01 仍需 Shelf AI 归位，最终跨消费者复核保持未完成。

  最终 69 包边界检查 errors 为空，diff whitespace 检查通过，日志 `/tmp/platform-materials-boundary.log`。本切片只作本地提交；主检出与其他会话的修改保持原状，没有推送。


### Pages 文档导入的解析边界

当前 `plugins/native/pages/src/import-files.ts` 同时持有 ZIP 目录/CRC/有界解压、Mammoth DOCX、字符解码，以及 PagesBody 转换与预览键。Host onboarding 也通过该插件调用这些系统解析。将 ZIP/DOCX 及 UTF-8/UTF-16 BOM 解码归 Local Host；`contracts/services/materials` 增加通用文档正文批次（原名、格式、内容、提取覆盖和问题），不带 PagesBody、页面 ID 或业务存储。Pages 仅将解析结果转换为既有 ProseMirror 正文、标题、warnings 与稳定 document-N 预览键。

Host 注入 Pages 的 prepareImport 端口，预览和正式导入共用同一生产装配；onboarding 复用该 Host 装配，保留原附件、标题与现有 Markdown 转换结果。Mammoth/fflate 依赖同步移到 Host 并删除插件内旧解析。解析放在独立 worker，复用已有 PDF 的终止/超时机制；取消或撤权后不进入 Pages 存储。导入解析可并发等待，最终原有 importDocuments 单事务仍是提交边界；保持请求 hash、选中键、项目身份、目录归属和幂等语义。

保留现有上传合计 10 MiB、解压合计 20 MiB、单 entry 5 MiB、最多 100 文档/1000 entry、压缩比 200 和 DOCX 外部文件访问禁止；坏的受支持文件拒绝整个批次，普通不支持附件与嵌套 ZIP 明确提示跳过。Pages 的单篇正文 1 MB、编辑器节点/深度限制、图片支持和格式降级由插件继续校验，不能移成所有材料消费者的业务约束。Word 转换的图片缺失/提示有明确 coverage；不把原生页码和语义 HTML 文档混为同一种定位。

验证保留真实 DOCX/ZIP、CRC/路径/编码/压缩炸弹、外链图片不读取等现有负例，再覆盖 worker 取消/超时、预览零写入、解析等待后撤权/取消零写入、相同 request 重试不覆盖编辑及其他项目隔离。整个 build 后按 Contracts、Host、Pages 要求回归及 boundary。没有持久格式迁移；回滚保留原附件和 Pages 数据。此步骤仍不代表 Shelf、Cognia、Artifacts 迁移或整个 09 完成。

公共文档 worker 另外将解析后的正文合计限制为 20 MiB，防止 DOCX 到 HTML/字符解码后的输出扩大；超限拒绝整批，不静默截断或提交部分页面。该容量约束在 Host 文档与回归中明确，原始上传不因解析而修改。


- Pages 文档导入归位：ZIP 目录/CRC/有界解压、Mammoth DOCX、BOM 解码及两个解析依赖归 Host，通用文档批次不含 PagesBody/页面键；Pages 保留 HTML/Markdown 到自身编辑器节点的领域转换、标题、1 MB/节点/深度限制和产品降级规则。预览、正式导入及 onboarding 使用同一 Host 装配，删除插件旧系统解析；PDF 和文档共用可终止 worker 生命周期。Pages 将 concurrent 明确写在等待解析/模型的能力声明里，不再由 helper 根据能力名称推断。

  依赖版本未升级，离线更新 lockfile 并按 frozen-lockfile 安装通过。整体 build 通过，最终 26 文件 208/208，无跳过，包含真实 DOCX/ZIP/UTF-16、外部图片不读取、所有原 CRC/路径/条目/压缩比负例、解析输出合计 20 MiB 限制、worker 取消/超时/释放、真实 SQLite 批次事务与旧请求恢复，以及 Chrome 桌面/窄屏的 Pages 真实创建、编辑、候选和冲突动线。新增延期边界使用真实解析结果后再暂停，取消/撤权/更换注册时零页面与零导入收据，恢复后同请求只创建一次，且重试保留用户编辑和项目隔离。

  首轮 5 文件 39 项中 33 通过，6 个新增权限用例因测试装配漏掉 Pages content 处理器而被真实注册校验拒绝。按生产方式补齐处理器后，新增 10 项全部通过，再执行最终 208 项回归；没有放宽注册/权限或业务断言。日志 `/tmp/platform-document-import-final-build.log`、`/tmp/platform-document-import-authority.log`、`/tmp/platform-document-import-regression.log`。回归期间没有改源码、脚本、package.json 或 Skill，也未并发构建。未调用真实付费模型、外部服务或代表用户验收。

接续：先整合远端主分支已完成的提示词登记/新功能约定，再迁移 Shelf 的材料/AI recipe 和 Cognia、Artifacts 剩余材料调用，最后对 01–12 按实际新代码总验收。已核对 `origin/main` 对本次材料路径没有重复解析迁移；仅 `bdf417c3` 改了 Pages 的 Host 模型提示词解析，属于后续必须合入的 AI 协议。相关 onboarding 会话当前已完成且是产品需求讨论，不在修改本次解析实现。继续保护主检出未提交内容；以上仍仅为本地改造。

  Pages 切片最终 69 包 boundary errors 为空，diff whitespace 检查通过，日志 `/tmp/platform-document-import-boundary.log`。未推送，工作继续在同一隔离分支。


### 与当前主分支的接口整合

在继续剩余消费者前，将已完成的主分支 `22f383cb` 合入本任务隔离分支；整合前回滚点为 `999d9f30`。保留主分支 Assistant、提示词登记/用户覆盖及公共搜索契约，同时保留本任务唯一 Home 执行 owner、有界结构结果、声明式装配、事件生命周期及 Host 材料解析。不得按冲突文件整体选择一侧而丢失另一侧行为。

SDK 以本任务真实源码 `4b6cd9bc` 合入主分支实际依赖的 `4702abe3`，同时提供 collectRun、结构校验、网络派出复核、app 模式和 session-stop；不纳入其他会话尚未被当前主分支消费的 project-memory 提交。由本任务 SDK 工作树构建、定向验证、打包，并更新单一依赖、补丁和来源说明。业务提示词按新的 instructed / resolveModelPrompt 契约迁移，仍保留取消、授权与业务提交边界。

整合后先整体构建，再验证 Agent/Prologue、提示词登记、Assistant、能力目录、Schedule、材料及受影响入口；发现交叉回归先修真实调用链。仅在本地 feature 分支整合，不改主检出，不推送。回滚整合提交须同时恢复 SDK 依赖与 lockfile；不回退主检出的真实 Home 数据。


整合的人工调用链复核：Cognia 保持共享 Runtime 的单次调用，并将已有可编辑角色正文作为 system 输入，避免提示词登记仍可编辑但不生效；Jelly 保持 Host JSON 解码与领域校验，接收 instructed 后在 Host 解析用户覆盖。Builder 保留独立安装 owner：命名提示词解析、安装/停用/升级/卸载/重启登记均迁到该 owner，创作台只负责编辑和发布 prompt 声明。搜索行声明进入同一 builtin 目录，Pages 保留显式 concurrent/执行费用，同时接入 subject/revision 元数据。


接续代码证据（不是完成声明）：Shelf 的 runJob 仍直接调用 readCliHelp/headlessArguments/runAgentProcess，image 分支直接同步 OCR，PDF 预览和正文另用私有解析；Host runJob 端口未保留 Action caller。迁移应覆盖执行、取消和提交检查，保留副本及产物语义。website.fetchHtml 先完整 arrayBuffer 后裁 4 MiB，并没有限制接收容量；归 Host 时需边读边限量。Artifacts 的 readHtml 仍导入 Shelf 实现，须改为公共 Host 转换。

Cognia 当前扫描由 Host 负责路径/容量与取消，插件只解码严格 UTF-8 的 Markdown/TXT、存储原字节并解释 frontmatter/wiki 引用；PDF/媒体只是原始附件，并没有第二套 OCR/PDF 解析。公共提取器的控制字符/BOM/截断语义不同，不能为了复用把它强塞进无损 vault 导入。最终复核区分纯传输/领域格式校验与系统提取，不凭扩展名重复建设解析链。

新主分支的 Prompt 登记需继续核对两项交叉约束：一是 builtin-instructions 的人工插件清单应与现有共同装配声明一致；二是 generated owner 当前按 Home + plugin_id 登记，同一插件若在不同项目安装不同版本，模型调用不能借用另一安装的默认正文或因另一项目卸载失去自己的覆盖。先以实际安装/提示词调用复现，再确定最小修复；整合回归通过不代替这两项验收。


提示词清单归位决定：内置插件的 instructions 与 manifest、Agent 正文、UI 和历史 MCP 一起放在既有 BuiltinPluginEntry。Host 的 builtin-instructions 从共同目录派生插件指令，只保留 Host 自己的 onboarding/information 指令和特殊角色装配。不另造 registry 或包；沿用现有 prompt-registration 扫描验证“已定义必已登记”，以及真实覆盖/安装消费验证。这样新内置插件仍只在共同装配处声明一次，不回到两个手工插件名单。


本次主分支整合验证：合并 SDK 源码为 `93bbe1db`，SDK build 与 10 文件 70 项通过，1 项真实模型因无凭据跳过。Molis 整体 build 通过；145 文件首轮 1043 通过、1 失败、2 跳过。唯一失败是提示词门禁只识别旧 hostCompleteText，误判 Alchemist 已不再直接调用；门禁扩展到 hostTextGeneration，并识别生成插件的命名提示词解析。model-draft 是接收调用方 instructions 的平台传输口，其调用方固定指令在最终消费者复核中继续检查，不把它伪装成 Host 自有提示词。

首轮通过覆盖了真实本地 SDK/HTTP/HTTPS、用户修改后的 Cognia 角色与生成插件命名提示词、安装停用/重启/卸载重装、长期执行与取消/撤权、Schedule unknown 恢复、文档材料、系统搜索/外部 MCP 权限及多个 Chrome 桌面/窄屏页面。跳过项为真实官方 npm 下载及需要 MINIMAX_API_KEY 的外部模型；未替用户验收。日志 `/tmp/platform-integration-regression.log`。修正门禁后，将内置 instructions 放入同一 BuiltinPluginEntry，由 Host 派生；Coding 的新增 surfaceChanged 通知补生命周期检查。重新整体构建通过，随后对变更范围复验；过程中遵守测试与源文件/Skill 编辑串行。


整合最终复验：14 文件 52/52，无跳过；包含纠正后的提示词门禁、共同目录/自动挂载、声明/Agent 文本、i18n 与客户端名称检查、Coding Chrome 卸载与重挂、独立安装宿主、生成模型真实 SDK/HTTP 和安装构建一致性。日志 `/tmp/platform-integration-final-regression.log`，最终整体构建 `/tmp/platform-integration-catalog-build.log`。70 包边界检查 errors 为空；本地整合差异相对 `22f383cb` 的 whitespace 检查通过（排除必须保留上下文空格的源码补丁），完整 SDK 补丁 reverse apply --check 通过；日志 `/tmp/platform-integration-boundary.log`。首轮已通过且未受后续小改动影响的回归证据保留，不重复跑整批。仅本地整合提交，未推送、开 PR 或修改主检出。

接续以当前同一 Goal 为准，不重复 Goal Prompt：先确认新 Prompt 登记的多项目/安装版本问题是否有真实可达调用，再按既定 09 完成 Shelf/Artifacts 的公共材料与 01 Shelf AI 链路；Cognia 保留经复核的无损 vault 边界。最后覆盖包括 Coding 草稿调用方固定指令在内的全消费者审查，以及 01–12 总验收。此次整合不代表整个 Goal 已完成。

### 生成插件提示词的执行版本

当前可达缺陷：同一插件安装旧发布版后，创作台试运行新版，Host 先读已安装 release，解析器又先读 Home 登记，导致新版试运行使用旧默认正文。现有 generated-plugin-prompts 用例把传入 BUILD 却返回旧登记默认当成成功，需要按实际产品合同纠正。另一个项目卸载相同 plugin_id 时，Home 单 owner 注销也会删除其他安装的登记。

模型 Action 将可信 project_id / plugin_install_id 传给现有安装 owner；它按当前安装记录选择发布版，或按创作台真实 preview 身份选择构建声明，拒绝缺失、错项目及错插件身份。解析前完成异步声明读取并重新检查 beforeEffect / signal，再验证当前版本确实声明该 prompt。已安装调用在自己的默认版本上应用既有 Home/owner/prompt 用户覆盖；创作试运行使用构建正文，避免已安装版和用户覆盖掩盖作者修改。取消和版本切换不允许继续派出。

沿用 AgentDefinitions 的覆盖和使用记录，增加接收 Host 已选声明的指令解析入口；不以设置页当前展示的默认版本决定执行。生成式登记按项目/安装保留，停用、升级与卸载只修改自己的登记。设置仍保留一个 owner/prompt 编辑入口，多个版本的默认展示选择启用安装中的最新 prompt 版本并注明，历史用户覆盖仍共享且重装保留；没有新持久表或业务身份输入。

验证实际安装 owner + Action 调用的已安装版、新草稿、跨项目不同版本与卸载；真实 SDK/本地 HTTP 检查最终 system 正文、未知 prompt 零派出、取消/撤权；覆盖登记删除与用户覆盖历史。先整体构建，再按 Host README 定向回归及边界检查。兼容旧 inline instructions；不改变 release、安装数据或用户覆盖键，回滚仅恢复本次源码。

已实现上述绑定，删除原“Home 登记优先、安装 release 优先于试运行”的解析路径。新增实际双项目安装用例，通过真实沙箱、Action、共享 Prologue 和本地 HTTP 检查旧/新版默认、草稿正文、用户覆盖、未知 id 零请求、升级/回滚、卸载另一安装后的编辑与调用、失效身份及停用。另覆盖异步声明读取期间取消/撤权/提供方撤下：零使用记录、零模型派出。手册与两个开发 Skill 已同步，纠正“所有安装前调用都是替身”的过期说法。

整体 build 通过（`/tmp/platform-prompt-binding-build.log`）；第一批 5 文件 20 项通过，随后按 Host README 执行 15 文件 87 项通过。保留第一批未变化的 3 文件 12 项证据，共 18 文件 99 项当前验证，无跳过（`/tmp/platform-prompt-binding-targeted.log`、`/tmp/platform-prompt-binding-regression.log`）。70 包 boundary errors 为空（`/tmp/platform-prompt-binding-boundary.log`），diff whitespace 检查通过。回归期间没有源码/Skill 编辑或并发构建；未运行外部付费模型，未代表用户验收。仅本地提交；后续仍为 Shelf/Artifacts 及 01–12 最终复核。

### Shelf 网页与 Artifacts HTML

先接通 09 中网页这一完整消费者路径，再处理 Shelf 的 PDF/OCR 与 AI recipe。Shelf 当前自行 fetch/HTML 转换，Artifacts 又跨业务边界导入这份转换；fetch 先读完整 arrayBuffer 后截 4 MiB，无法限制实际接收容量。Shelf 的 admitText / clipboardToMaterial 等待抓取后没有保留 Action 的 beforeEffect / signal，也可能在撤权后保存材料。

现有 materials 合同增加只读网页端口，Host 对显式 HTTP(S) URL 执行无凭据 GET、最多 5 次重定向、总计 12 秒和解压后 4 MiB 正文限制，复用已有 HTML/文字提取。保留原有用户可抓取本机或内网 HTTP(S) 的范围，不把它等同于生成插件已批准域名的沙箱网络策略。超限拒绝整个正文，不保存静默截断的 HTML；Shelf 继续保留链接并明确未抓到正文。普通抓取失败可保存链接，调用取消、权限撤销与提供方失效则不保存任何材料。剪贴板删除或改变后，迟到抓取不能重新保存已失效条目。

Shelf Module 只持有注入的网页读取端口、标题/文件名和产品 Markdown，不再拥有 fetch 与通用 HTML 转换；无 Host 端口的纯领域调用只保存链接，不隐式联网。Artifacts 直接复用 Host HTML 解析，仍由原插件负责 2 MiB 上传、原 HTML 保存、标题、引用、幂等与提交权限。验证真实 HTTP 正常/重定向/超限/流中断/取消、实际 Shelf Action 的撤权后文件与目录零提交、剪贴板变化及恢复，并保留 Artifact 持久化/原文/历史导出验证。无持久格式迁移，旧网页材料照常读取。

实际容量探测发现，仅 200 KB 的连续 `<` 已让现有同步 HTML 正则解析超过 3 秒，独立子进程到时被终止；主线程定时器不能约束这种 CPU 等待。HTML 解析接入既有 runMaterialWorker（256 MB、超时/取消后等待 terminate），保持同一解析实现；网页总 signal 覆盖取回与解析，Artifacts 的 readHtml 端口允许异步并传递取消，在返回后仍用原 beforeSave 提交检查。保留 Artifacts 原 2 MiB 输入/输出范围与原 HTML，不应用网页正文截断；其解析单独限 12 秒。第一批失败的 7 个 Shelf 取消断言由 snapshot 自动示例造成，改为捕获操作前的真实材料与文件，再比较零新增；不能删除产品示例来使测试通过。

提交链复核补齐：Artifacts 两个导入 Action 原来未声明 concurrent，HTML/外部等待占用项目串行队列；Host 手工调用 validate_authority 和 actionAvailability，遗漏 Kernel 原调用的 provider generation / permissions / lifetime 检查。导入提供方显式声明并发，插件端口保留 ActionExecutionContext，Host 将完整 beforeEffect 交给 beforeSave，删除重复校验。真实解析后暂停提交，验证其他导入可完成、撤下提供方或取消后迟到调用零提交。


外部文档提交链发现同类缺陷：账号 revision 在异步 beforeSave 之前检查，检查期间断开连接仍可保存；Integration 的 30 秒读取也没有接入原调用取消，分步读取在撤权后仍继续发请求。保留现有连接器生命周期和固定供应商协议，Host 在每次派出及最终提交前复查原 Action 与账号 revision，Integration 接收可信取消与派出检查，取消原因原样传递且释放响应流。保持连接选择、OAuth 单次刷新、2 MiB、30 秒和导入幂等；取消/连接变化不能触发刷新或继续请求。不改连接器凭据格式，不新增通用网络框架。

本段已实现：删除 Shelf 私有网页 fetch/HTML 解析和 Artifacts 跨业务导入；真实网页读取、解压后容量、worker 解析、领域保存与原 Action 提交检查形成完整路径。连接器文档复用既有请求生命周期和 Plugin SDK 导出的 Kernel 执行生命周期，没有新增网络框架或依赖。保留账号初始 revision，OAuth 重试不得接受读取途中重新授权的新连接。

验证：最终整体 `pnpm build` 通过（`/tmp/platform-web-materials-connector-final-build.log`）；本段网页/材料/导入/Shelf 定向 4 文件 33 项通过（`/tmp/platform-web-materials-final-targeted.log`），广义消费者回归 20 文件 110 项通过（`/tmp/platform-web-materials-regression.log`）。随后 Artifacts 并发/完整执行控制补齐 11 文件 67 项通过，连接器提交与取消补齐后对受影响链及 Host/Integration 必跑项重新执行 16 文件 106 项，全通过且无跳过（`/tmp/platform-web-materials-connector-regression.log`）；以上批次重叠，不累加为独立用例数。新增实际 HTTP 流取消关闭、元信息后撤权零后续请求、异步 guard 取消零派出、账号在最终授权等待期间断开零提交、并发导入不阻塞及提供方撤下零迟到写入。`pnpm boundary:check` errors 为空（`/tmp/platform-web-materials-boundary.log`），`git diff --check` 通过。测试期间未改源码/Skill 或并发构建；未使用真实外部账号/付费模型，也不代表用户体验或本人验收。

接续：已连续完成提示词版本绑定与本段网页材料，后续仍在同一 Goal / spec 内推进。先完成 Shelf PDF/OCR 的公共 Host 端口与逐行置信度/语言选择、保留 PDF 预览和 32 MiB 入库行为，再将自动 AI recipe 接入同一 Home Prologue，保留人工终端交接与现有材料/结果身份；不能用只读 CLI Agent 适配器包装旧写文件 CLI 便声称已迁移。Shelf runJob 还未传原 Action 控制，取消/撤权后的失败记录和输入变化需一起修复。最后核对 Coding 草稿、Alchemist 动态指令及全部 01–12 消费者、手册和 Skill。剩余项未完成，保持实施中；本段仍仅为本地改造。

### Shelf PDF/OCR 与任务提交

当前代码证据：`previewFor`、`extractLocalText` 使用 Shelf 私有 PDF 正则；`ocr.ts` 同步启动 Desktop 自带的另一套 Vision helper，阻塞主线程，无法在等待中取消。公共 Host 仅有页级 OCR 置信度，不能直接替换 Shelf 的逐行“待确认”；Shelf 还支持中/英/自动语言及 32 MiB 文件，必须保留。`runJob` 丢弃原 Action 控制，外部等待后无授权复查，取消或输入变更也可能写失败成果。

公共 materials 增加可选逐行文字/置信度与 OCR 语言；原生 helper 和 Host 验证兑现两者，其他调用方默认行为保持。默认提取仍限 25 MiB，仅可信 Host 可显式使用 32 MiB 上限供 Shelf；不提升上传端本身的限制。删除 Shelf PDF 通用解析与进程启动；OCR 的产品 Markdown 和低置信度标记仍归 Shelf。替换后删除 Desktop 不再使用的 OCR 二进制、构建与环境接线。图像提取失败和空结果保留原有提示；PDF 不完整的 coverage 必须进入输出，不冒充全文。

Host 注入提取与可用性端口。文件 Action 经异步 `admitFile` 提取 PDF 预览，再复查权限并同步入库；底层 `admit` 只保存原始副本与已准备的预览，Coding 已确认的文字成果不增加异步提交间隙。示例 PDF 的正文是随示例定义的已知内容，无须同步解析。原图/PDF、来源 hash、材料/任务/结果身份和输入只读工作目录均保留，不改持久格式。

任务使用现有 Kernel 执行生命周期处理原调用 signal、显式取消与时限。Shelf 仅拥有按 Home/root/job 归属的在途执行记录；快照和 busy 判定依据当前实际在途执行，重启或终止后旧 running 记录不自动重跑、不由原失权调用补写失败。用户显式取消可以关闭其持久记录。每次异步等待后、输出/成果/失败记账前保留原 beforeEffect，再同步核对 job 状态、材料可见性和原件/副本 hash。变化或撤权拒绝迟到提交，失败记账仅在调用仍有效时写入；清理进程、监听器与只读目录权限不被取消阻断。

验收：真实 PDF 文字预览/提取、扫描或截断提示；本机 Vision 中英文字与逐行结果；Host 原生进程取消及临时文件清理；原 Action 下暂停提取、取消/撤权/提供方替换/副本变化后零晚结果与零失败成果，独立任务继续可用；历史任务不重放、可显式取消及重新运行。同步手册/Skill，整体构建后运行 Shelf、材料、Host、Contracts/Kernel 的适用回归与 boundary。AI recipe 的 Prologue 迁移在本段之后继续，不把旧 CLI 保留路径计作完成。


本段已实现：Shelf 的 PDF 预览/提取和图片 OCR 统一调用 Host，保留 32 MiB 原件、语言选择、逐行低置信度标记及覆盖提示；删除私有 PDF 正则、同步原生进程与 Desktop OCR 二进制。混合选择复核同时发现旧逻辑只处理首份 PDF，或按首项类型处理全部材料；现逐份处理所选 PDF/图片，保留每份来源与正文。任务复用 Kernel 生命周期并保留原 Action 提交授权，取消/撤权/提供方撤下/副本变化后不写晚结果或失败成果；历史 running 记录不再凭二十分钟时长阻止用户操作，也不自动重放。

验证：整体构建通过，最后补齐工作区依赖登记后的构建为 `/tmp/platform-shelf-materials-inventory-build.log`；Desktop `cargo check --offline --manifest-path apps/desktop/src-tauri/Cargo.toml --bin molis-work-desktop` 通过（22 条 warning，`/tmp/platform-shelf-materials-desktop-check.log`）。最终材料/设置定向 3 文件 31/31（`/tmp/platform-shelf-materials-final-targeted.log`）；首轮其余未变化的 Shelf plugin/recipes/actions 22 项通过证据保留。Host/Desktop/Contracts/Kernel 及消费者 24 文件 157/157，无跳过（`/tmp/platform-shelf-materials-regression.log`）。依赖清单补齐后安装收集 2/2 复验通过，70 包 boundary errors 为空（`/tmp/platform-shelf-materials-inventory-test.log`、`/tmp/platform-shelf-materials-boundary.log`），diff whitespace 通过。

首轮失败原因分别是旧网页测试未注入已迁移的 Host 端口，以及新增小图双语言 OCR 断言不符合本机识别结果。用改造前 Swift 源码编译实测同图，旧版同样返回 SHELP、置信度 0.3，确认不是此次迁移退化；保留原有英文回归，新增清晰中英原生图片逐语言验证，同时经真实子进程验证语言参数、逐行结果及非法置信度拒绝。没有改识别结果或放宽权限断言来使测试通过。源码/Skill 编辑、构建与测试串行；本地 PDF、Vision、Chrome、HTTP 路径已验证，未调用付费模型或代表用户本人验收。AI recipe 与 01–12 最终消费者复核继续实施，本段仅本地提交。


### Coding 短草稿提示词的消费者闭环

实际调用链已使用共享 Home Prologue，但 `commit-draft.ts` 和 `history-digest.ts` 把固定正文作为 `agent.draft-text.v1.instructions` 发送，未出现在提示词登记与用户覆盖中。将两份指令归 Coding 的 `src/prompts.ts`，共同插件目录声明 `CODING_INSTRUCTIONS`；材料裁剪、摘要降级、用户编辑后提交和业务用量继续归 Coding。

公共草稿请求增加命名 `prompt` 引用，Host 按原 invocation.plugin.plugin_id 解析所属插件已登记的指令，不接受业务输入声明 owner，也不使用请求提供的默认正文。旧 instructions 字符串仅保留现有调用兼容，命名引用和 inline 二者只能选一；新的 Coding 调用只传引用。使用现有 AgentDefinitions 的用户覆盖、版本和使用记录，不新增表。初次异步授权复查、Prompt 使用记录及共享模型派出纳入同一个 120 秒 Kernel 生命周期，取消/撤权后零使用记录和零派出；后续派出和返回仍保留原 beforeEffect，未知用量保持 null。

验证两份指令在设置目录可见且真实 SDK/本地 HTTP 使用用户修改正文、材料单独传递；未知引用、缺可信身份、双重输入、取消及异步撤权零派出/零使用记录；不同 Home 不共享覆盖。保留旧 inline SDK 用例、Coding 摘要 HTTP 路径与提交材料/SDK 验证，更新手册/Skill 和过期测试例外。先整体 build，再定向及包要求回归、boundary；不改变提示词内容、计费模型选择、摘要降级或 Git 执行授权。


本段已实现并删除 Coding 两个调用方的内联正文及 Host 门禁旧例外；指令按原文迁到唯一声明，注册、用户覆盖、可信身份和模型请求形成完整链。生产 PluginHostExecutor 覆盖调用选项中的 plugin_caller，LocalHost 交给 composition 的 invocation，命名引用的 owner 不来自请求。旧 inline 输入继续可用，双重输入拒绝；超出旧 4,000 字但仍在 Prompt 设置上限内的用户指令可以生效，材料没有进入系统指令。

整体构建通过（`/tmp/platform-coding-instructions-build.log`）。定向 6 文件 18/18（`/tmp/platform-coding-instructions-targeted.log`），包含真实打包 SDK/本地 HTTP、两份用户覆盖/版本使用记录、跨 Home 默认隔离、未知 id/错误 owner/缺身份/混合输入，以及异步授权期间取消/撤权零使用记录和零模型派出；原摘要 HTTP 行为、记录降级和用量继续通过。包要求及消费者回归 23 文件 119/119（`/tmp/platform-coding-instructions-regression.log`），70 包 boundary errors 为空（`/tmp/platform-coding-instructions-boundary.log`），diff whitespace 通过。测试期间未编辑源码/Skill 或并发构建；没有调用付费供应商或代表用户本人验收。

接续交接：本次已连续完成 Shelf PDF/OCR 和 Coding 短草稿登记两个切片，仅本地提交。下一个明确剩余项是 Alchemist：当前仍有六类固定指令（方向生成、Founder Copilot、证据交叉检查、研究综合、成果复用适用性、一次格式纠正），只有交叉检查的研究维度属于动态参数。应使用现有 InstructedPrompt 分离正文与数据并登记，保留 Host SDK JSON 解码、插件领域 parse 和一次纠正的预算/授权机制；不能把现有提示词中的 schema 声称为原生 SDK 强约束。之后完成 Shelf 自动 AI recipe 经 Prologue 的迁移，保留人工 CLI 交接、材料/结果身份及明确模型选择，再完成 01–12 最终验收。上述剩余项继续实施，Goal 保持 active，不重建或重复 Goal Prompt。


### Alchemist 固定指令与动态材料分离

六类已核实的固定指令归插件 `src/prompts.ts`，使用现有 InstructionPrompt 声明并从共同目录登记。领域 StructuredGenerationRequest 与 Host AI 端口的 systemPrompt 改为 InstructedPrompt，方向、对话、研究、复用及格式纠正消费者一并迁移；研究维度作为本次数据传递，不随用户材料改变默认正文。Host 使用原 Home 的有效指令，保留 system 与任务材料分离。取消和持续授权复查必须先于 Prompt 使用记录，180 秒涵盖首次授权等待及共享推理；不因登记引入第二 Runtime 或另一套模型选择。

不改变结构化数据语义：Host 仍经 SDK 解码 JSON，插件 Zod/领域 parse 核对业务，只有原预算明确允许才进行一次格式纠正，每次派出复查原授权，未知用量保留未知。本次不新增 schema 原生生成或隐式修复调用。删除开发诊断中 Alchemist 的未登记提示词例外，手册说明真实支持边界。

验收使用实际调用的六份声明、用户覆盖到真实 SDK/HTTP 的系统正文、研究维度与材料传递、纠正次数及预算拒绝、取消/撤权零晚派出/登记、原任务状态和恢复；依包要求整体构建、定向回归与 boundary。历史业务存储及运行记录不迁移，回滚仅需恢复源码声明/调用链，用户 Prompt 覆盖保留。


本段已实现六类固定指令的唯一声明、共同目录登记、InstructedPrompt 端口和全部真实调用方迁移。研究维度作为动态 data；用户材料没有进入可编辑的默认正文。Host 在初次授权复查后读取登记正文，拒绝未知 id/错误 owner，不采用请求对象携带的默认 body；撤权或取消不能补记使用或继续初始化推理。删除 Alchemist 的未登记诊断及测试过渡例外，手册/Skill 同步；格式解码仍归 SDK，领域约束与一次纠正预算继续归插件。

整体 `pnpm build` 通过（`/tmp/platform-alchemist-instructions-build.log`）。本段定向及包要求共 22 文件 112/112，无跳过（`/tmp/platform-alchemist-instructions-regression.log`）；包含实际共享 Home 的 SDK/本地 HTTP、六份用户覆盖与动态参数、未知引用/错误 owner 零请求、配置变化、初次授权等待撤权零登记/零派出、取消/晚返回，以及原方向→研究→决策、预算、格式纠正、状态恢复、HTTP/MCP、权限与消费者回归。70 包 boundary errors 为空（`/tmp/platform-alchemist-instructions-boundary.log`），diff whitespace 通过。构建与测试串行，测试期间未改源码/Skill。未调用付费模型，也不代表商业模型质量或用户本人验收。

后续只按当前同一 Goal 推进：Shelf 自动 AI recipe 仍在 `modules/shelf/src/store.ts` 调 `job-runner.ts` 直启 CLI，人工终端交接和九类 CLI 偏好必须保留。已核实全部内置 recipe 的成果是文字/Markdown/JSON，但输入还含图片、PDF、folder/file；不能把图片静默降为 OCR 文本便宣称等价迁移。SDK Model 的 `StartRunInput.attachments`/ResourceBinding 和两类协议已有图像请求支持，Molis 的 `PrologueTextInput`/`hostTextGeneration` 尚未暴露附件；模型目录已有 vision 声明。下一步先核对真实 Session 附件/资源生命周期与模型能力，补齐必要的公共输入端口，或复用现有 Agent 执行能力，保留图片和文件语义、明确模型选择、大小/时限/取消/预算及结果回执；不要再包装旧写文件 CLI。之后完成 01–12 总验收。SDK 本轮仅只读调查，没有改源码或产物。

### Shelf 自动生成与原图输入

已核实 SDK 的模型附件必须来自 Node Host intake：普通 `resources.stage().publishDurable()` 不是 Host 持有的字节，不能用于模型附件。复用现有只读 workspace 授权、intake 与 Session attachments，不再新增 SDK 模型路径。共享推理端口接收可信 Host 选定的根目录和相对图像路径；SDK 校验越界、符号链接、原件变化及真实媒体类型。附件不授予模型文件工具权限；完成、失败、取消后撤销资源并销毁 Host 暂存字节。单图支持 Shelf 原有 32 MiB，批次最多 30 张、合计 128 MiB，并仍受共享 Runtime 总资源限额约束；不静默截断或转成 OCR。只接受 SDK 已支持的 PNG/JPEG/GIF/WebP，其他格式明确报告不能视觉读取，原件保留。

`hostTextGeneration` 仅在所选目录模型明确声明 `vision: true` 时接受图片；环境变量旧模型没有能力声明，须先在模型设置配置，不能猜测或偷偷换模型。模型、连接、凭据和 vision 变化沿现有快照及派出检查失效。材料读取也纳入原时限、取消与持续授权，不在失权后继续下一份读取或派出。共享端口返回原有类型化执行回执，不增加模型调用次数。

Shelf 自动任务使用模型目录选择；终端 engine/custom runtimes 只影响人工对话。材料副本、source hash、job/result 身份和历史读取保留。PDF/网页/文字使用公共材料提取，目录逐项准备且明确不完整覆盖；图片原件走上述视觉附件。业务指令登记到 Shelf 提示词目录，快捷动作的用户指令与材料单独传递。成功正文经原提交检查后写入 output；固定 JSON 选项用共享 SDK 解码并由 Shelf 验业务，其他选项保留 Markdown。删除自动 CLI 派出/结果猜测路径及过期可用性、网络隔离描述，保留人工终端交接。

先验证真实打包 SDK/本地 HTTP 的两类图像协议、原始字节、超限与伪装类型拒绝、越界/符号链接拒绝、取消/撤权零晚派出及清理；再验证真实 Shelf Action 的模型选择、所有 recipe/快捷动作、混合材料、提交防线和 UI 可用性。按包要求整体构建后跑定向回归、Chrome 与边界检查。未使用付费供应商不声称模型质量验收。无历史材料或任务数据重写，新增可选设置与回执保持旧记录可读；本段完成不代表 01–12 总验收完成。

原图真实边界验证发现 SDK 装配根给 intake 传的是 `DEFAULT_RESOURCE_LIMITS`，即使 App 声明 32 MiB 仍在默认 8 MiB 拒绝；ResourceStore 的 Host 发布还缺共享容量复查，异步 publish/cancel 可复活已取消批次。按资源模块现有合同，在源码工作树修复为当前配置、整批容量/引用原子提交、同批单一操作及取消等待清理；同时补齐早已 stage 的内存资源在实际发布时的容量复查，防止它与原图共同越过 Home 总上限。不新增 SDK 模块、业务规则或重试。SDK 短合同为 `docs/slices/resource-intake-limits.md`，验证后重新打包，不仅改安装目录。

公共原图端口已实现：输入路径仅由可信 Host 注入；同一 Home 的 Prologue 使用真实 intake 原件，跨目录图片仍保持请求顺序，清理不删除原件。视觉声明在目录模型选择及原模型配置快照中生效，旧环境模型拒绝原图；停止调用可立即返回，但关闭推理 owner 等实际任务及资源清理结束。成功和失败沿用原 typed receipt。SDK 源码已本地提交 `18a1c827`，build/typecheck 通过，13 文件 137 项资源/配置/恢复/派出/整理/结构回归通过、无跳过；修正了旧整理测试夹具复制的过期参数类型，不改生产整理逻辑。

已更新来源补丁、包、锁文件与工作区清单，520 个 SDK dist 文件在源码构建、tarball 和实际安装中逐字节相同。Molis 整体构建通过（`/tmp/platform-original-images-integrated-build.log`）；4 文件定向 33/33（`/tmp/platform-original-images-final-targeted.log`），覆盖真实 SDK/本地 HTTP 两类协议、原始字节与顺序、32 MiB 上界及超限/假类型/越根/符号链接拒绝、取消/撤权/关闭期间的零派出和磁盘清理、结构失败的用量回执、视觉能力失效。首次新夹具因 appVersion 写为非法的 `1` 初始化失败，修正为合法版本并补初始化清理；随后真实 32 MiB 失败促成上述 SDK 修复，没有降低验收上限。

此处只完成 Shelf 所需的公共原图前置能力；ShelfStore 自动任务、模型设置 UI、固定提示词登记及旧 CLI 派出删除尚未实施，不能算 Shelf 已迁移。01–12 全消费者验收继续，Goal 保持 active，仍仅本地改造。

本段最终回归：Host/Actions/Review/Images/安装及系统搜索 16 文件 110/111 通过，唯一未运行项是缺 `MINIMAX_API_KEY` 的真实商业模型（`/tmp/platform-original-images-regression.log`）。70 包边界 errors 为空（`/tmp/platform-original-images-boundary.log`）；SDK 累计补丁反向检查、Molis diff whitespace 检查通过。定向与包回归合计 20 文件 143 通过、1 跳过；未把跳过算作成功，也不代表 UI 或用户本人验收。测试期间无源码/Skill 修改或并发构建，主检出保持未动。

接续从 Shelf 消费者开始，不重建 Goal 或重复 Prompt。当前 `ShelfStore.runJob` 仍调用 `runAgentProcess`，`ShelfMaterialPorts` 只有解析端口；应新增其业务 AI 端口，由 Host 接共享配置、登记指令和原图输入，Module 继续拥有副本/任务/结果及 beforeCommit。`ShelfDeviceSettings.engine` 与 9 类 CLI/custom runtimes 留给人工终端，自动模型另设选择；snapshot/设置页/确认文案同步，不能再以 CLI headless 能力表示模型可用性。还须对齐 `shelf.jobs.run` 当前仅有 shelf:write、无模型费用元数据的合同，保留本机 extract_text 的离线路径。Prompt 的固定 recipe 指令归插件登记，用户快捷指令与材料作数据，JSON 仅 json 选项并用 SDK 解码；删除自动 job-runner/结果猜测与无消费者的 headless 参数构造，保留真实手动终端所需探测。PDF/目录/普通文件仍需逐项准备并如实表达覆盖，不静默漏文件。SDK 新包已验证，无需再造图像协议；之后完成 01–12 总验收。

### Shelf 自动生成的权限与落地合同

自动 recipe 经 Host 配置模型、登记指令和同 Home Prologue；Shelf 负责材料副本、业务格式校验、任务与结果提交。`extract_text` 继续只走本机材料提取。新增 `shelf.jobs.generate`（shelf:write + model:invoke、metered）与 `shelf.jobs.extract`（shelf:write、none），界面路由按 recipe 调用。历史 `shelf.jobs.run.v1` 保留为 unknown 成本的兼容入口，AI 分支在每次原 beforeEffect 后复查 model:invoke；不能借旧入口绕过模型授权，也不要求本机提取获得模型授权。所有入口共享一个领域实现，无自动重试。

模型选择独立于手动终端 engine，默认取当前可用模型目录首项；显式选择失效拒绝，不回退。模型目录声明 vision 才可发送原图。固定 recipe 指令由 Shelf 插件登记，option 与用户 shortcut 为数据；输出通过共享 SDK JSON 解码和 Shelf 领域有效性检查，points/todos/quotes 保存 Markdown。完整执行引用、终态、实际模型与逐次用量保存到 job 的可选回执，历史记录仍可读，未知值不转零。

Host 逐份读取已冻结的 input 副本，PDF/HTML 复用公共提取，图片经已实现的原图资源端口；目录保留相对路径并逐项处理。不能处理的二进制或超限输入明确失败，不漏文件、不静默截断、不用 OCR 代替视觉模型。材料解析的部分覆盖进入提示词及最终结果说明。保留原件 hash、材料/任务/结果身份与手动终端全部现有引擎。删除自动 CLI 执行、结果猜测和无消费者参数构造；旧设置及历史任务无破坏性迁移。


Shelf 实施复核补充：删除只为 CLI 写文件而存在的 work 双份副本，新任务统一消费冻结 input，历史目录不改。PDF 部分提取的 coverage 同时保存到 job 和结果条目，JSON 仍保持业务对象且预览显示覆盖说明。Host 从同一个配置快照读取函数检查模型/连接，最终业务 beforeEffect 返回后同步复核该快照，配置失效不补写成果或失败记录。首轮真实 SDK 回归已发现并修复 JSON 解码误读（SDK 返回 ok/value envelope），并对齐非报告用量为 SDK 的 estimated、未知 cost 不转零；域回归 23 项已通过，集成和浏览器仍在验证中。


自动生成的公开 availability 也读取同一 Shelf 模型选择与 Host 模型目录，本机提取保持独立。Action 的 AI recipe 枚举从 Module catalog 派生，时限复用 Module 常量，避免第三份能力清单。此补齐后重新执行整体构建与受影响回归，再做包边界检查；前一版定向 7 文件 41/41、Chrome 与 SDK 全通过（/tmp/platform-shelf-ai-consumer-tests.log）。

Shelf 自动生成本段已实现：生产 HTTP/Action 使用 generate/extract 两个明确入口，兼容 run.v1 对 AI 继续复查模型权限；MCP/Agent 可发现相同成本和当前模型可用状态。模型目录、提示词登记/覆盖、Host 材料提取、原图资源、共享 Prologue、领域输出校验、完整回执与最终授权/配置/hash 检查已贯通。自动 CLI job-runner、无消费者的 headless 参数生成、私有 JSON 拆围栏和 work 重复副本已删除；九种人工终端及自定义 Runtime、原材料/任务/成果身份、历史记录保持。输出有效性和覆盖提示归 Module，Host 只解析、绑定和派出。用户手册、AI Skill 及其已有插件开发 Skill 关联同步。

验证：最后生产改动整体构建通过（`/tmp/platform-shelf-ai-discovery-build.log`）；此前定向 7 文件 41/41 包含 Domain 状态与 Chrome（`/tmp/platform-shelf-ai-consumer-tests.log`）。最后包要求及消费者回归 22 文件 132 项中 131 通过，唯一失败为提示词登记测试不识别 Manifest 导入常量（`/tmp/platform-shelf-ai-regression.log`）。保持 owner 单一来源，检查器增加相对导入常量解析并验证 Shelf 动态指令，随后该检查与扩展后的真实 SDK 全菜单选项回归共 12/12（`/tmp/platform-shelf-ai-registration-tests.log`），无生产源码改动；其他已通过证据不重复执行。以上批次重叠，不累加为独立测试数，均无跳过。`pnpm boundary:check` errors 为空（`/tmp/platform-shelf-ai-boundary.log`），`git diff --check` 通过。

实际覆盖：生产 Action → 同 Home SDK → 本地 HTTP 模型服务；全部 AI 菜单选项与自定义 shortcut、用户提示词覆盖、JSON 对象/非法 JSON/数组/null/纯完成说明、估算 token 与未知 cost、原图字节、指定模型失效无回退、PDF/目录中代码文件与二进制拒绝、部分 PDF 的 JSON 结果覆盖说明、原调用取消/撤权及最后授权等待后配置变化的零晚成果/零失败记账。Chrome 验证本机 PDF、人工终端恢复、设置页模型入口、共享生命周期；浅/深色模型与终端设置截图已目视核对（`.impeccable/qa/review/shelf-plugin/settings-light.png`、`settings-dark.png`）。没有调用真实付费供应商，不代表用户本人验收。

接续：Shelf 消费者迁移结束，Goal 仍 active、全 01–12 范围不变。下一步按本表逐项进行最终代码与调用链复核，核对实际 owner/消费者/删除路径/兼容性、手册与 Skill、已有验证的适用范围；补齐发现的实质遗漏，再更新同一表的最终结论。当前未运行进程、无阻塞，不创建新 Goal 或复述 Prompt；仅本地提交，不推送/开 PR/合并。
