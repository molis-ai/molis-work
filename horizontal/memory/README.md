# 平台记忆

## 同一 Run 按需读取

依 [Memory spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定)，本人管理读取继续返回已授权内容；运行中 Agent 的 list/recall 则由 owner 选择可见固定引用，交 Host 绑定的同 Run 展开窄口，输出仅为无正文回执和 memory_id/version。scope/owner 由可信 caller 解析，工具输入只能收窄；无 Run 控制不得回落普通正文结果。最终 canonical 读取、预算、去重、状态及派发前权限仍归 SDK，本包不另排注入循环。

可配与可换：沿现 backend 和产品配方；read/form 独立、当前与冻结许可求交、取消及无正文结果是硬边界。用户继续用现设置，没有新配置项。列表扩展复用一次完整的跨范围读取和最终授权检查，SDK 所给范围只与当前 caller 范围求交；读取中撤回消费者或分类许可明确拒绝，不当作已读空结果，过滤前已读目标仍在复核内。真实 Run/HTTP 的六种撤权与形成独立场景已定向验证；聚合完整验收与剩余限制见现 spec。

## M3 到期正式记忆的明确续期（实现中）

短合同见现策略 spec 的「M3 到期正式记忆的明确续期」。`memory.change@4` 的 renew 仅本人明确选择新绝对期限，复用 MemoryEdits、现 change-request/子操作 marker 与 SDK renew；原操作同时固定目标/所见版本/期限，原 SDK 结果补入同一历史事务。 SDK 返回后、历史事务前重跑本次 `beforeEffect`，随后同步检查公开 `caller.signal`，直接构造 Service 也不能在取消后补账；Action 的实际 SQL 继续核同步的存活、取消与当前授权；SDK 已提交后的拒绝保留原操作补账，不虚称零正式写入。后继版本不覆盖，paused/disabled 不恢复，来源/分类/未知事实保持，Session 管理本片明确拒绝。本片保持原已采用 SDK96；准确父 c10 的集成验证按策略 spec 记录，不据源码声称本轮通过。

## M3 正式记忆管理页

依 spec §9.4，`MemoryService.page` 由 `MemoryQueries` 复用当前 scope owner 与 SDK `page`；旧 `list` 的业务行为保留在同一查询职责，设置页不再调用它。页面只能由本人请求，owner 从可信 caller 和当前项目角色登记恢复，不从输入取得；开关 off 不挡本人管理。项目页包含项目及合法角色，角色选择不扩大到别的项目。

每次请求只执行一个 owner 的一次 SDK page，共用一份 App 限额（缺省 40 条、最多 100 条、最多扫描 200 个记录槽，可由 Service ports 配置）。跨 owner 游标携固定查询及当前 owner 序列；开始及返还前比较当前序列，SDK 仍最终复核该页范围、条目和版本。游标不是许可，重启可以继续，范围或查询变化须重新开始。不建立缓存或分页表，不把 Node 目录枚举说成有界记录扫描。

搜索与未分类筛选只过滤本次已授权页正文；没有命中且未穷尽时继续分页，不回退全库 list。跨 owner、后续页或存在正文/未分类后筛选时总数为 unknown；只有单 owner 首页完整且没有后筛选才能沿 SDK 报 exact。物理成本沿 SDK 当前诊断许可返回，unknown 不填 0。管理投影显示六类、真实状态、独立 expired 与 classification/null，不给旧未分类条目猜 common。四类自动形成保持不变；正式条目的六类 DTO 随下述逐条纠正片补全。

正常、取消、范围撤回、固定 cursor 变化与跨重启通过真实 Node owner 的 `tests/memory-management-pages.test.ts`；Action/HTTP 入口及 overview 不全量读取由 `tests/memory-management-page-http.test.ts` 验证。首片不接批量操作、改类或候选分页。


## M3 逐条纠正正式分类

沿 spec §9.4，现 `memory.change@3` 的 `reclassify` 由本人明确选择六种正式类别、已声明场景和 long-term/short-term 生命周期。旧 `MemoryKind` 仍是自动形成/工具默认的四类，正式读取、历史、变更回执及 v2 导入导出使用 `MemoryFormalKind` 六类。页面所见版本与原操作号绑定 SDK CAS；所有 change 请求在定位与授权完成后、任何 SDK 步骤前，同步在现 ledger 固定不含目标 ID 的 change-request 标记，绑定动作、scope/owner、memory_id 和所见版本；后续同号请求核原绑定，等待 SDK 提交期间也不能换目标或动作。标记只确认身份，删除后 closed 标记不妨碍原 purge 回执补齐删除投影，SDK 子步骤操作号保持不变；分类合成在 `classification.ts`，内容/分类编辑及历史恢复由 `MemoryEdits` 共同提交，Service 保留原授权和范围入口。

期限省略保留原绝对时间，ISO 时间明确替换，null 明确移除；短期必须有未来截止时间，改长期不自动清期限。纯分类编辑使用一次 setMeta；正文或原适用情境同时修改时一次 update。原 ref、来源、依据、证据、namespace、key、扩展分类及 paused/disabled 不因改类改变。已到期条目的本人续期、Session 可信管理绑定、批量和按类 read/form 仍是 P0 后续，本片明确拒绝未经支持的分类更改。

`memory.history@2` 仅投影原快照的分类、期限及结构完整标志；缺快照返回未知，不补 common 或长期。snapshot_available 不随当前时钟或权限变化，恢复是否允许仍由原 SDK 对当前版本、分类、到期与 Session 检查。原操作补账不保存第二份正文，不换成后继版本；人工纠正仍使旧自动删除/恢复撤销失效。正式召回的 habit/project-decision 沿用偏好/约定的固定权重，未扩大自动形成许可。

定向验证：`node scripts/run-tests.mjs --jobs 2 tests/memory-classification-edit.test.ts tests/memory-classification-edit-http.test.ts tests/memory-retention-roundtrip.test.ts tests/memory-service-cas.test.ts tests/memory-actions.test.ts tests/memory-mcp.test.ts`。真实 Node/SQLite/HTTP 覆盖六类、旧未分类、期限三态、同版本竞争、原操作重试/重启补账、当前授权、状态与拒绝；最终页面实操和资源门禁由集成任务按槽位验收。


个人与项目记忆的平台服务：开关与策略、确定性写入门、召回编排、待认可的建议、最近变动与撤销、界面信号计数。记忆正文、版本、删除与作用域隔离都在 Prologue Memory（经 Agent Host），本服务不保存第二份正文，也不调用模型。

包名：`@molis-ai/molis-work-service-memory`。工作区内部包，通过仓库构建和 Host 装配使用。

## 整包导入的固定重试输入

`importScope` 在派发任何条目前完整读取当前 v2 包并复制可变输入和调用身份（保留原取消信号），以可信 scope/owner 和有序有效条目的 SHA-256 摘要固定本次操作。它是业务重试输入身份，不是源码或流程校验；现 ledger 只保存摘要，不保存正文副本或 encoded request。对象键序不影响身份，条目和语义数组顺序保持，分类、原出处、来源/依据、期限、适用条件、Session 与 namespace 均参与固定。同操作换包在新副作用前报 `memory.conflict`，原包仍按既有逐项回执恢复，拒绝数、部分结果与已提交事实不变。

整包身份的新绑定和已有第 0 子操作检查在同一 ledger 事务内；已有子操作却没有整包身份时不能推断未开始条目的原输入，明确拒绝继续。Backend/ledger 仍沿现窄口替换，权限、取消与身份规则不能关闭；App 提供原包和操作号，用户仍在现导入入口选择文件，没有新增配置。旧 v1/缺分类的显式采用不在本片。

## 首期策略接入合同（设计，尚未实现）

首期目标、分类字典、矩阵配方、依赖顺序和验收统一见 [Prologue 记忆策略与 Molis Work 接入](../../specs/prologue-memory-strategy/spec.md)。本节只说明本包的责任变化；下面的「一次典型调用」和现有不变量仍描述当前实现，不能把合同当成已经接通的能力。

- 本包继续拥有 Molis 的分类定义、产品开关、可信使用方与场景到矩阵的映射、来源证据核验、自动批准门表、信号与配对、历史/撤销及管理协调。SDK 不内置 Coding、助理或习惯这些产品分类。
- SDK 拥有分类/策略执行、唯一条目写入口、持久候选决定、版本和状态、受控替换、异步检索、共享 token 预算与最终 Context 回执。本包经 Agent Host 的公开合同调用这些能力，不复制另一套排序、裁剪或注入循环；`horizontal/agent-host` 仍是唯一依赖 `@prologue/sdk` 的包。
- App/使用方、当前场景、scope/owner/namespace 和来源事件由可信 Host 上下文绑定。模型只交候选内容与证据指针，不能自称用户、改变使用方、扩大分类用途或批准候选。分类许可与已有开关/权限求交，不恢复上位禁令。
- 单值 key 的纠正保留同一个 canonical ref / memory_id，以观察到的 version 做条件更新；不为替换另建一条记忆或 key 控制账。领域版本随正文、状态及可观察元数据变化推进，历史、使用及撤销继续关联同一身份；operationId 关联一次修改与消费账，不是业务事实 key。
- session 生命周期绑定可信 Session 引用，仅该逻辑会话 active 时用于任务。archive 暂停使用，unarchive 只在原期限未到时恢复；purge 永久结束并清理。Run 完成、停止或进程退出都不算会话结束。App 更早结束生命周期时，经同一写门记录到期时刻；重启、unarchive 和读取都不清除或延长 expiresAt。
- 新用户配方和已有 Home 的采用分别处理。没有保存偏好不等于新用户；采用时先按旧规则求出并物化有效开关，再映射到新配方。已有条目、候选及人工修改不因缺分类而丢失，不默认扩成 common。具体字典、生命周期和默认值以 spec 中的首期短合同为准。
- `write`、候选提议/接受/晋升、`change` 的更新/启停/删除/恢复/移动、`undo`、配对处理、维护、导入、改类和批量操作都必须重新通过与该动作对应的门。不能只保护新入口；人工保存和管理读取/删除也不能被自动形成开关误挡。
- P0 保留现有 Molis 历史、撤销和 `molis.memory` 信封，补齐当前阶段需要的分类、状态及策略信息。恢复仍需当前授权与版本检查；人之后编辑的值不能被旧自动变更撤销。当前 v2 往返范围见下文；旧 v1 的显式采用和 SDK 历史正文搬迁仍属后续范围。
- 删除继续使用已有 Host 删除收据和单一执行主人。SDK 与账本分别提交可核对的结果；失败可重试，未完成清理不能报完成。停用、遗忘、项目删除或撤权后，已排队提炼和迟到结果也不能回写；同来源重试不能把遗忘内容学回来。
- 新格式沿用 `MemoryLedger` 的严格基线版本门：采用后的基线升为新版本，已有程序只认的旧版本因此拒绝打开。版本检查必须在 inference/builder 绑定、SDK 初始化及动作处理器可用之前成功；失败不能留下半装配。新建 Home 由可信创建入口明确初始化为新配方；已有 Home 缺少偏好或采用记录时不自行按新用户补默认。先在隔离副本验证旧产品的 Web、MCP 和 Home 入口明确拒绝，且没有 SDK 目标写入，再启用新格式。
- 上述版本门保护受支持的 Molis 产品写入口，不声称阻挡持有同一磁盘/密钥权限、绕开产品启动过程的任意旧 Host 程序。SDK 自身的新格式校验仍由 SDK 承担。首期不另建 generation 库或第二个 Runtime root，也不复制一份历史正文。真实 Home 的备份、采用或回退需要对应授权，不是普通启动时的隐式迁移。

### 可配与可换

Molis 在配置中声明分类、读写矩阵、保留策略、候选限额、常驻集合和 token 预算；界面只管理已声明分类，不提供任意规则语言。提炼器与召回器通过 Agent Host 接入 SDK 的窄口，未装配的必需能力明确不可用，不回落到另一套行为。模型调用与提示词登记仍走 Host 的共同入口。

不可配置掉的是来源与权限边界、秘密检查、版本/幂等约束、模型不能自批、删除后的不可读，以及最终注入硬预算。终端用户在原设置页选择读/形成/自动记住开关，查看依据，改类、纠正、停用、撤销或遗忘；操作结果和部分失败由同一个服务回执说明。

### 普通保存重复项的固定重试分支

引用 spec §9.4 同名合同。manual/said/plugin 写入与 auto offer 命中重复时，沿现 duplicate marker 固定目标 scope/owner/id/version、来源与 skip/adopt；完成回执和来源/自动撤销归属投影同一事务，重启不改为 append。公开 accept 使用独立候选决定；undo-recreate 保留其原固定创建身份。

普通采用仍按原顺序追加 evidence 并取末六条，marker 仅存新增条数，不复制证据。SDK 已提交但回应/账本失败时，核原新增证据尾段、保留当前完整证据，重放原 facts CAS 让 SDK 核对原输入；不重复追加、不凭 source 相同确认。原目标后继编辑/删除或当前撤权/取消均拒绝。无固定分支且无实际创建/替换/候选步骤的 pending 保存保持待核对，不猜测自动恢复。原导入身份和前片合同不变。已有候选继续等待用原 candidate-hold 身份固定候选与版本，重试须重新读取 SDK pending 原件，并在最后异步读取之后重核来源/Action beforeEffect；开关变化不能把既有等待决定升级为创建。已完成采用也在重读当前目标后核新增证据，不能用并发请求的旧快照绕过。

### 导入重复项的固定重试分支

引用 spec §9.4「M2 导入重复项的固定重试分支」。导入命中同文同约束的已有条目时，在采用该条目的异步修改之前固定原 scope/owner/id/version 与 skip/adopt 分支。原操作只恢复这一决定，不重新选同文目标、不因已有 commit 而创建第二条。完成回执只含 duplicate、目标 ID 和版本；相关投影与回执在现 ledger 事务提交。原目标后继修改、删除或当前权限失效时明确拒绝；没有可核对分支或 SDK append 身份的旧在途导入保持待核对，不猜成功。

自动条目采用沿原 facts CAS 重放，更新时间使用原 marker 时刻；即使当前 source 已变成 imported，仍由 SDK 的原操作与输入核验确认。导入不增加原话证据，未知 basis/approved 保持现导入语义，原 namespace、分类、期限和 paused/disabled 不被采用恢复或重置。SDK 已提交而响应/ledger 失败后可以补账，取消或撤权后不补完成。重复项职责在 `src/duplicates.ts`；其它保存来源的后续恢复见上节普通保存合同。Service 的权限、筛查及唯一正式写链不变。

本片不支持 v1、缺分类采用或整包输入身份，亦不保存正文快照、编码请求或新账。真实反例和专项以 `tests/memory-service-cas.test.ts` 的公开 Node SDK 与 SQLite 路径验证；源码完成、静态检查和尚未执行的行为回归分别记录，不将旧产物红例当成修复后验证。

### M1 第一片：采用与有效开关

本片引用 spec §9.3 M1、§9.4 的采用约束，只交付 Home 启动前的格式门和可重启的有效偏好。分类正文、矩阵执行、分页、CAS 管理以及界面接线依赖 SDK 后续切片，不用空字段表示已提供。

- Home 的第一项业务写入之前，只有整个目录不存在或确实为空才可自动新建；新建时将个人与项目默认的完整 reviewed 开关持久化（允许形成候选和读取，`auto=false`）。已有 Home 缺库、缺采用记录或缺默认偏好，一律明确拒绝启动，等待维护采用；不猜测用户是否用过记忆。
- 安装器不启动 SDK；只在首次进入的空 Home 初始化 reviewed 偏好并明示写入路径，已有非空 Home 的安装不检查或改写记忆，启动时仍过同一门。安装中断按原合同回滚程序文件；已完整初始化的偏好保留，重试不重置，避免删除可能已被用户使用的数据。
- 既有 Home 的一次性采用在备份副本上执行：按采用前代码计算个人、项目默认和已有项目覆盖的有效设置，包括没有显式偏好时的 `auto=true`，保存消费者和插件限制，再与采用记录一起提交到当前 ledger 基线。产品启动只认当前基线，不保留升级链，不复制 SDK 正文。
- `project-host` 在任何 Home 服务构造前检查，`ensureSystemAgentService` 在 inference/builder 绑定、SDK 初始化和记忆处理器注册前复查。格式或采用失败时不产生 SDK 目标写入，也不留下推理绑定；支持的 Web、MCP 和 Home 入口共同遵循这道门。
- Web 的共同装配和后台轮询只在上述启动检查成功后创建；拒绝启动不能留下定时任务，随后也不得创建其他 Home 库。
- 正常使用仍走已有 `memory.prefs.read/write` 与助理设置映射，同一份偏好影响写入门与召回。新建/采用/重启不改变用户之后保存的开关；本片不扩展权限、不关闭旧用户的自动形成以制造成本收益。真实 Home 的采用、回滚及删除仍需单独授权。

允许修改：本 README、`src/prefs.ts` 与包导出、storage 的 memory ledger、Host 的最早启动门与必要的现役入口（含 `web-server.ts` 既有装配顺序）、对应定向测试。`installer/home.ts` 的新 Home 安装准备与 `project-catalog.ts` 的打开存储准备在原文件内各自持有完整职责，不扩大冻结的主流程或巨类。维护脚本只在会话临时目录。验证覆盖新 Home 候选行为、旧默认与关闭设置、项目继承及插件限制的重启效果、错版/缺采用拒绝、旧产品三入口在采用副本上的 SDK 零写及 Web 拒绝后跨轮询周期无写入；按 `--jobs 2` 运行定向用例，不调模型。产品分类闭环和真人体验不在本片完成声明中。

2026-10-22 的隔离验证覆盖了真实 Host / SDK 持久化、新 Home 安装及中断重试、偏好动作保存后重启、旧有效设置和项目/插件限制保留。副本维护在偏好更新后、版本提升前实际注入失败，旧基线、原偏好、SDK 正文与备份不变，随后能重新采用；冻结的旧 Home / Web / MCP 入口打开采用副本均拒绝且 SDK 正文零写。对应回归为 `tests/memory-adoption.test.ts`、`tests/install.test.ts` 和 `tests/secret-store-keychain-retry.test.ts`，另保留原记忆和存储定向回归。此处只证明偏好与 ledger 格式门；SDK 分类数据采用、最终安装包全链路和真实 Home 操作尚未验收。

### M1 后续独立片：自动批准门 v2

范围与验收见 [spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定)。现役自动批准门改为 preference/convention 正向白名单，experience 和 fact 即使重复出现也等待本人认可；首次候选的原因使用同一规则，不再承诺它们下次会自动生效。新自动批准记录使用规则 v2；旧记录、人工保存/接受、插件独立批准与现有开关不重写。规则由内部 `src/policy.ts` 持有，Service 仍是唯一业务写主人。

本片不增加持久配置或 SDK 适配口。分类字典、四预设及矩阵随 M2 真实装配完成，不能把 `form=false` 当成 off，也不能把泛用 agent 身份当成 coding 场景。验证覆盖真实候选、接受、历史、撤销、重启及下面列出的记忆回归，不将配置声明当成已接通的管理能力。

### M1 配置片：四预设

短合同见 [spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定)。本片将 off/manual/reviewed/assisted 展开为实际的 enabled/task_recall 与原六字段，服务读取和全部写入口共同消费。preset 不另存，细项开关不会被配方覆盖；off 保留管理读取与删除，manual 保留本人保存和可信 Host 的显式回忆。新字段启用依赖 M2 的严格格式采用，当前不能独立合入发布，不能让旧 App 忽略关闭选择。

### M2：条件写入与原操作补账（集成中）

沿 [spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定)，Host 每次以可信 caller 绑定 Backend；模型参数不能取得管理或本人批准。追加以稳定 `operation_id` 对接 SDK 幂等键；已有条目与候选分别带自己的原版本。正文与元数据编辑走一次 CAS；接受纠正走 SDK `settleInto`，不先更新正式条目。

SDK 已提交而 ledger 失败时不做删除补偿。现有 marker 只留动作、目标、原版本、时刻和无正文回执；重试必须带原完整请求，不从 marker 恢复正文，也不把后来版本改成原期望。历史、最近变动与完成回执在同一 ledger 事务落盘；后继修改使原提交不可证明时明确冲突，不能猜成功。清空预览将固定 refs、versions 和 SDK purge decision 存在同一 marker 中；部分失败保留逐项结果，重试不重新列出新目标。离线采用与真实 Host 授权由各自主人接线，本模块局部验证不代表 M2 或 P0 已完成。

正式删除在任何异步来源或候选清理之前固定原确认版本，清理前后及原操作重试始终使用同一 purge 条件，不能改用后继版本。若旧版已留下与原确认版本不一致的 purge marker，升级后必须拒绝消费，保留原 marker 和待核对条目，不静默改写条件。来源抑制和关联候选可能已经清理，未知结果或中途失败不代表零副作用；候选 SDK 删除已提交但回应或 ledger 投影失败时，按现有候选删除 marker 重放并补齐投影，不能把当前列表中缺失当作清理已全部完成。未发生外部修改时原操作可继续完成；原确认之后有人编辑则拒绝删除其新版本，保留新正文、版本和历史。

删除、撤销自动写入和跨范围移动在 SDK 已清除源条目而 ledger 清理失败时，按原操作继续清理历史、使用记录和变动正文。恢复先核对原决定与 purge 条件的动作、范围、版本和状态，原范围必须仍属于当前 caller；undo 在原记录仍存在及已完成返回时也检查原 caller 范围。Service 的 `beforeEffect` 沿现 Action control 接入，在候选列举后抑制来源、候选删除后清投影、正式删除后清账这三个边界重新检查 App 授权，实际 SQL 仍受同步的存活、取消和当前 authority 检查保护。SDK 的 `already-absent` 只证明当前不存在，不证明是原操作删掉的，也不提供 App 删除授权。undo 的 SDK 删除在事务外，ledger 的 forget 与 undone 回执在同一现有事务内提交；任一失败后都能用原操作重试。已完成操作保留原结果的幂等返回。`src/moves.ts` 拥有跨范围移动的完整生命周期，目标只来自原创建身份；已保存目标结果后的清理和完成重放不受 enabled 阻挡，保存或创建目标仍检查开关。旧 marker 没有结果时，必须以原版本完整快照重放原 SDK 创建并核对已有创建历史。目标已被后来编辑或无法核对时明确冲突，不创建第二副本、不把后来版本记成原创建。

### M2 维护提交后的补账

沿 spec §9.4，维护先用同一 SDK 对固定的真实命令预检，再在现 revision history 准备原版本。现 operation marker 只保留步骤身份、原版本、历史指针和提交状态；原操作重试先恢复未完成步骤，再扫描当前条目，不把停用或缺失当成已记账。SDK 确认原 CAS 提交后，唯一 change、实际版本、历史与完成标记在同一 ledger 事务提交。后继编辑、未知回执、撤权、取消及遗忘屏障都不能被补账绕过。

合并冗余项使用 SDK 逻辑删除的真实版本回执，补账成功前保留其原历史，完成后再清理账本；用户删除/清空仍物理清除并抑制来源。合并只引用已有、与原版本一致的历史快照，不借删除预检复制未知旧正文。依据恢复后的自动 resume 引用原版本的暂停记录，撤销按实际应用版本恢复原暂停理由，不复制未知理由。合并的 recreate 撤销只重建被合并项，不改 survivor，因此不对 survivor 建 undo CAS；状态/正文撤销仍核实际写目标版本。没有可靠回执的旧物理删除不追溯猜成功。

范围为本包维护/operations/Backend、AgentHost 固定命令预检与逻辑删除薄口、LocalHost 薄适配和真实 Node/SQLite 维护恢复测试。无新 SDK、数据库表、UI 或恢复循环；阈值与选择规则不变。验证覆盖提交后账失败、合并更新/逻辑删除后的中断、事务回滚与重开、同操作只补一次及准确撤销，以及后继编辑/遗忘拒绝。

同一 actor 的现 operation marker 索引最多保留一个在途步骤：当前维护逐步串行、每步提交后才进入下一步，因此不需要缓存整批。准备历史、计划与登记索引在一个事务，完成变更与移除索引也在一个事务；满时新动作明确拒绝，不淘汰旧计划。下一次后台调用即使换了父操作号也先恢复。原 consumer/项目/插件/角色/Session 绑定必须与当前调用相符并重新授权；并发的其它范围也不能覆盖在途项，删除标记优先。

recreate 撤销按原 changeId 在现 operation marker 中保留短创建号；重试使用同一 SDK 创建回执，不以同文判断原创建成功。合并的 undo 计划只增存被合并项的 source refs 身份；重建经现 commit 检查来源抑制并重新链接。创建已完成而最终 undone 记账失败时，新请求只补原事实；后继编辑不被覆盖或复制成第二条，遗忘重建项后也不能重放原来源。

### M2 新写分类准备

新普通写入与候选使用可信 Host caller 的场景，按既有场景映射准备分类；新记忆无明确期限时由 App 选择 long-term，有正式期限时选择 short-term。分类准备属于本包的产品规则，不在 SDK taxonomy 配默认值。候选等待 14 天是候选自身的期限，不是正式记忆的生命周期；修改已有条目和使用已有候选时保留 canonical 分类及 Session 关联。旧导入和撤销重建不经新输入默认，不能凭缺字段推成 common。

本刀不增加公开分类编辑、来源事件、晋升或导入格式。候选正式期限、未知审批投影和旧原件恢复另行收口。`tests/memory-new-classification.test.ts` 使用生产 `memoryRuntimePolicy`、生产 Backend 与真实 Node/SQLite，验证新保存、候选、当前授权和重启；不能使用测试 taxonomy 默认分类补齐。分类的准备可由 App 变更，当前授权、内容门、版本和最终写门不能配掉。

### M2 期限与当前格式往返

沿 spec §9.5，候选自身最多等待 14 天；正式记忆的绝对期限单独保存在候选账本 `formal_expires_at`，并投影给本人决定；`waiting_expires_at` 独立显示等待截止时间。短于等待期时，候选同时提前到期；长于等待期或无期限时，不把等待日期当成正式期限。同一操作的无正文 marker 在 SDK 提议前冻结正式期限，补账不能把原 30 天改成 60 天。接受仍由 SDK 检查候选自身期限；具备完整操作身份的已提交同操作可以按 SDK 合同补关联与历史，不能重新产生一次正式写入。

已记录的候选 `formal_expires_at: null` 表示无正式期限，缺字段表示旧记录未记录该决定；两者不混用。公开 `write` 的替换请求沿用原语义：省略或传 `expires_at: null` 都保留目标原期限，并不提供清空期限或续期能力。

当前导出信封及导入/导出动作升级为 v2，保留 canonical 分类、Session 引用、命名空间、依据类别和绝对期限，仍对正文、出处与适用文字脱敏；敏感约束不能改名后冒充相同授权。导入只接受完整 v2，缺分类或旧 v1 整包拒绝，不补 common。相同正文但分类、Session、命名空间或期限不同的条目不能被静默当成重复。Session 仍要求原可信绑定，导出不授予新的会话权限。

历史快照与合并撤销重建保留原分类、Session、命名空间和期限；到期后撤销明确拒绝，等待本人决定续期，不清空期限或转成长效。移动仍沿原合同创建新 scope/ref 并清理旧历史，不承诺历史跨 ref 跟随。旧 v1 采用、缺分类选择、状态完整往返和续期 UI 仍需后续 P0 切片；本片不补自动晋升或来源批准能力。

范围读取和视图投影、固定清空预览/重试、导出与导入由 `MemoryScopeCommands` 持有，使用同一 Backend/ledger；导入与撤销重建回到 Service 的同一个写入门，不另建正文真值。`tests/memory-retention-roundtrip.test.ts` 使用生产权限策略、Backend、Node 磁盘和 SQLite，覆盖实际保存、候选接受、原操作补账、重启与往返；不调用模型，也不将这些工程证据当作旧 Home 采用或整体 P0 完成。

## 一次典型调用

助理的一轮开始前，Host 以“助理”这个使用方调用 `MemoryService.recall`：服务按用户的开关确定能读哪些范围（个人、当前项目），从 Prologue Memory 读出条目，结合 Host 记下的类别、适用情境、状态和有效期逐条过滤，用中文两字片段与英文词打分，按上限与字数预算取用，把用上的和因预算没带上的都记成使用回执（设置里显示“最近用于”）。用户说“以后都……”时，`write` 经写入门：开关、秘密形状、像指令的文字、范围、重复与冲突，最后才写入 Prologue Memory 并记一条“最近变动”。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/service.ts](src/service.ts) | `MemoryService`：列出、召回、写入门、修改与移动、候选、最近变动与撤销、界面信号、整理与维护 |
| [src/queries.ts](src/queries.ts) | 列表、管理分页、候选原件读取与召回；Run 展开在同一查询主人内选择引用，保留读取后权限复核，使用回执仍由真实 Context 决定 |
| [src/run-recipe.ts](src/run-recipe.ts) | `forRun` 的可信 recipe 构造：当前场景、读取预检、分类限制快照、事实、使用标题及预算；不读正文、不记使用 |
| [src/scope-commands.ts](src/scope-commands.ts) | 授权范围读取与视图、固定清空、当前格式导出/导入；导入复用 Service 写门 |
| [src/prefs.ts](src/prefs.ts) | 开关的默认值、四预设配方、补全与使用方权限 |
| [src/preferences.ts](src/preferences.ts) | 有效偏好读写、项目继承与助理设置映射；持久化仍经原 ledger |
| [src/class-restrictions.ts](src/class-restrictions.ts) | 当前使用方、场景与 canonical 分类的只收紧匹配；读取与自动形成分别判断 |
| [src/policy.ts](src/policy.ts) | 自动批准规则版本与低风险类型门；只决定自动提议是否仍需本人认可 |
| [src/text.ts](src/text.ts) | 召回关键词、同文判断（`sameWords`：同样的话，由 `fold` 折叠后相等；`sameText`：去掉标点的粗略相等，只用来给建议去重）、秘密形状与像指令的文字（确定性规则） |
| [src/spoken.ts](src/spoken.ts) | `theirWords`：记作“用户亲口说的”（来源 `said`）的核对，内容是不是本人写过的某一整条消息（只容许 `fold` 的差别：大小写、全角半角、引号样式、空白和最后一个句号），记下来的是那条消息本身；`quotedFrom`：引文是不是本人说过的一段话（工作结束时提炼出的建议用它区分“明说”和“推断”，不决定“亲口说的”） |

合同在 `@molis-ai/molis-work-contracts/services/memory`（`memory.*` 动作、旁表端口）。旁表由 `@molis-ai/molis-work-storage` 的 `openMemoryLedger` 实现；Host 装配（Prologue 后端、动作注册、`/api/memory/*`）在 [apps/local-host/src/memory/memory-host.ts](../../apps/local-host/src/memory/memory-host.ts)。

`MemoryServicePorts.bindChangeTarget` 将 `change` 已授权定位的 scope、owner、project 同步交给当前 Host 控制，发生在变更记账和正式提交前；不返回正文，也不另查目标。助理受控工厂必传此口，用同一调用的最终检查覆盖实际目标撤权后的 SDK 提交与 ledger 写入；普通管理装配继续使用其现有 Action 控制。

## 接入与边界

使用方只经 `memory.*` 动作或 Host 进程内的服务调用；使用方身份来自可信调用上下文（受众），不从输入读。插件只能读到被允许的类别（服务里的规则；动作目录今天不向插件提供记忆，见 [CALL-CHAINS §8](../../docs/system/CALL-CHAINS.md)）；外部 AI 客户端只能召回，要本人授权，默认读不到个人记忆。

工作区依赖：`@molis-ai/molis-work-contracts`。

分类限制由现偏好持有：新默认给 `class_restrictions: []`，本 profile 更新省略数组时保持、显式数组时完整替换，四预设保留细分限制。项目沿现完整有效 profile 继承；清空项目数组不会清空项目默认或其它项目。规则保存先严格校验，再复制到结果，调用方后续改动数组不能修改已经接受的设置；重复选择条件、未知字段/值在保存前拒绝。

`memoryClassReadAllowed` 与 `memoryClassFormationAllowed` 是独立的纯限制计算，均接收规则、可信 consumer/current_scene 与 canonical kind/classification。多场景条目只匹配本次 current_scene 或 common 且条目实际具有的 scene，缺分类不猜 common。read 的 explicit-only 禁止 task/resident；form 不受 read 限制影响。返回 true 只表示未被这组规则关闭，调用方仍须求交当前旧权限、Run 冻结规则与实时规则；本人管理及显式保存的适用范围由调用链决定，不由匹配器授予。对应公共入口单测为 `tests/memory-class-restrictions.test.ts`，生产授权/形成与真实持久化另由集成验证覆盖。

`memoryClassReadPossible` 在 Run 计划与 SDK 查询门共用，先合并当前与冻结规则，再判断当前声明分类和未分类是否仍有可读目标；全部关闭时不开始自动读取。它不读取库、不把未知分类映射为 common，也不取代逐条授权。形成按完整新建槽和 replacement 槽过滤；替换同时检查原分类与目标分类，派发前复核固定上下文和槽，返回登记前再次检查。正式提炼上下文走 task 读取门，候选上下文独立经过形成门。工程回归分别在 `tests/memory-class-runtime-policy.test.ts` 与 `tests/memory-class-formation.test.ts`，后者使用 SDK Node 与 SQLite；真实调用链执行后才可报告对应路径通过。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-memory typecheck
pnpm --filter @molis-ai/molis-work-service-memory build
```

### M2 来源绑定与规则 v3（实施中）

范围与验收以 [spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定) 为准。沿现学习队列，自动学习只经 SDK `candidates.form` 调用一次登记的 Host 提炼并写候选；人工提议仍使用现公开提议口。无长期信号时返回 skipped，不读取来源、不调用模型。明确表达复用 `spoken.theirWords` 的整条消息规则，重复只数独立来源。模型引用、工作/Run/job 数量和旧无来源候选不构成自动批准。

形成前由本包读取同一份当前授权上下文（最多 30 条正式、20 条待审），冻结个人/项目的新建槽与跨类别替换槽。正式上下文按当前 task 读取许可取得；已过期、暂停、停用或不在当前场景可见范围的条目不进入提炼上下文，也不生成替换槽。管理页面仍可按原管理许可查看它们，不清期限或重分类。待审上下文沿候选管理审阅许可，并再次求交当前形成/学习开关、场景、私有命名空间和有效期，仅服务本轮去重与来源合并，不冒充正式 task 召回许可。关闭任务召回而仍允许形成时，不读取正式上下文，仍可形成新候选。目标类别复用当前 consumer 与插件的 explicit 许可求交；默认 Coding 仅提供 preference/convention，明确授权其它类别后才增加相应槽，不因一个未授权类别阻断全部合法形成。每种当前允许类别可新建三条，App 明确配置最多 144 槽；提炼每轮仍最多三条，原文上下文只传一次。替换槽保留原目标与读取时版本，接受只能走同一目标的 `settleInto`；目标丢失或后继编辑不得改成新建或追最新版本。只有与本次整条本人原话对应的旧 explicit 待审候选可贡献其 SDK 已确认来源，最终仍由 SourcePort 重读；不把其它待审来源送入模型。

显式提议的候选去重、限额与来源合并查询使用内部 management 副本，保留原 actor、项目、Session、插件、场景、Run 分类快照与取消信号；学习来源保留 learning，其余标为本次 explicit 提议。只有候选上下文按形成权限读取，要求当前与原 Run 共同允许；learn_from_work 仅约束 learning。正式读取与最终候选提议继续使用原 caller，Agent 不因此取得候选管理、接受或删除入口。验收覆盖 read off/form on 的真实 Action 提议、去重与本人接受，以及形成关闭、原快照缺失和 Agent 管理拒绝。

`learningContext` / `learnFromWork` 明确使用 task / learning，正式读取、来源和 SDK `form` 不借后端的默认管理身份。内部候选快照、派发重验、按形成回执精确引用/版本登记和 v3 策略晋升独立使用同一受限 management 副本；保留 person 原值与所有可信身份、冻结限制和取消信号，不赋予任务正式管理读取或人工决定权。已有候选只在获准集合内参与去重；写入和候选决定仍由 SDK 独占。

`memory.list@4` 的非本人调用只读取当前合法可见的正式项，personal/project 计数也来自这些正式项；pending 与 auto_this_week 返回 null，表示本次未查询管理计数，不表示零。本人管理仍查询并返回原实际计数。正式列表不因旁账中不可见的候选而失败，也不借内部 management 副本扩大权限。助理提议工具直接返回本次 Service.propose 的候选 ID，不再通过全范围候选回读或最后一条猜测结果；并发提议各自保留自己的回执。

跨范围读取返回前同步复核所有已计入正式计数的 canonical 分类目标，使用当前规则与原 Run 快照交集；不只检查筛选后显示项。中途类别禁读整体拒绝，避免返回先前范围的正文或计数；只关闭形成不影响读取。复用现分类判定，不重扫 SDK 或新增元数据存储。

内部非本人提议仅在本轮获准使用的 canonical 候选集合上做同文/相似去重与每工作三条上限，不借不可见项的 App 账注正文或计数推断。列表未返回的账注引用由固定 scope/owner/id 的 SDK get 复核：仅明确 MEMORY_SCOPE_DENIED 可排除；真实缺失、损坏及其它存储错误继续拒绝，不修账、不重建正文。查询保持取消信号与当前∩冻结权限，本人管理仍采用严格完整性检查。重启重放不能绕过获准集合的去重或使缺失原件复活；本片不增加 store/cache。

每次实际模型派发前沿同一公开读取口复核这份固定上下文的权限、状态及原版本；变化即拒绝派发，不替换正文、目标或期望版本。该回调只活在当前调用，不进模型或持久记录。

候选账注只登记 SDK 已确认的引用、版本、来源和冻结期限。模型的 inferred 提示始终保守待审；自动 v3 晋升仍独立核验两份完整本人表态、当前权限、低风险类别及原撤销 journal。形成的 partial、unknown、取消和提炼用量原样返回，不能变成空成功；同操作按 SDK 完整创建输入恢复，不宣称整批 exactly-once。模型、SDK 写主人、权限与取消都不可替换为第二条 App 提议循环。验收使用真实 Node 存储及有界提炼替身，覆盖无信号零调用、同类多条、条件与跨类纠正、来源重复、固定版本冲突、取消和部分提交。

产品规则 v3 和撤销准备/补账归本包，SDK 仍拥有正式 CAS 与候选决定。准备写现操作 marker/原版本历史，并在原 marker 内一次生成有界变更 ID；提交及重试复用该 ID，提交后记现变更与撤销；失败沿原操作恢复，后继人工版本不得覆盖。遗忘先写无正文来源抑制标识，清理和重放都复用现 ledger，不新增来源正文表。`learning.ts` 拥有学习编排，`promotion.ts` 拥有版本化批准与当前账本回执；这些不成为另一个候选或执行内核。现候选账注的可选 `source_refs` 只保留 SDK 已确认的来源身份，不保存原文、不替代最终授权；晋升准备读此账注，避免重入 SDK 正在执行的候选队列。

### P0 候选明确采用（SDK99 定向工程验证）

页面的完整 `formal` 必须沿现候选 HTTP accept 路由进入共同 Action；此前路由重建参数漏传该字段。`tests/memory-candidate-adoption.test.ts` 补真实 HTTP → Action → Service → SDK 回归，覆盖选择透传及非法决定零写入；校验仍由共同 schema/Service 持有，本片已在 SDK99 上通过该真实 HTTP 回归。

完整新 marker 的同一决定允许 pending 候选在 TTL 后进入 SDK 对账，以覆盖 formal 已提交但 candidate finish 未保存；新 formal 提交仍须通过 Host 联合请求的 TTL 最后门。真实回归分别制造 finish 保存前失败与 formal 从未提交，关闭/重开跨 TTL 观察补关联或零新增。settleInto 合并证据按现 identity 将候选证据稳定放在末尾再限六条，避免重叠截断在补账时改变 meta。旧 unknown canonical 的 SDK accept 由继承的 SDK99 处理，App 不伪造分类；真实 Node/SQLite 回归已覆盖这两个故障窗口和证据合并。重开仅为同进程 Runtime/Host 生命周期，不等同 OS 进程重启。

候选本人决定由 `candidate-decisions.ts` 拥有，复用原 SDK candidates.accept/settleInto 与 MemoryOperations/ledger Port。可选 formal 必须完整；旧分类或正式期限未知须本人决定。等待期与正式期限分离，canonical replacement 优先；无 replacement 时保留原 supersedes/同文选择，首次选定后固定目标版本与完整输入摘要，失败不转 append。当前授权、来源、Session、CAS 不可配置；无新插件/阈值，用户在 App 选分类和期限。短合同与 CAND-01–05 验收见现 memory strategy。候选专项17项已通过，包含项目设置列出本项目已登记角色候选、排除个人/其它项目并拒绝错项目采用；真实临时 Home 浏览器及相关 README 回归的实际结果见 spec。完整 App、真实 Home、模型效果与用户验收不由这些工程证据代替。

本人项目候选视图在读取或过期处理前，复用管理页的当前项目与已登记角色 owner 集合；个人、非本人和显式全范围查询保留各自语义。无关个人候选的到期或待恢复决定不会因项目设置读取而被处理。

旧候选即使没有 SDK expiry，现 Host policy 也在 SDK 的正式 `accept` + 候选 `accept` 联合请求上检查 canonical `createdAtMs + CANDIDATE_TTL_MS`，并由同一 `assertCurrent` 在实际提交前同步重查。SDK 已提交后的 accept 对账只有候选请求，不受此新提交截止门阻挡；不推广到 promote 或其它动作，不从调用参数和 App 投影读创建时间。

恢复仅覆盖具有完整新 identity 的原 marker。尚未合入的 #1064 开发态旧 accept marker 缺少完整 digest/候选版本身份时，即使 SDK 已提交，也明确 conflict 并保留原记录待对账；不猜原决定，不重写正式记录、候选或历史。主干 `abc052bcb` 的旧 accept 没有 MemoryOperations，此边界不等于发布版本升级全恢复承诺。`tests/memory-candidate-adoption.test.ts` 已分别通过真实 SDK/ledger 的旧 marker 拒绝无写反例和完整新 marker 关闭/重开后跨 TTL 补账用例。

## 开发要求

使用历史只由真实 Run Context 回执补入现有 ledger；显式召回返回记为 `returned`，不会进入最近参考。相同条目/SDK receipt 保存一份逐 call 事实的摘要，确认响应后不会被较弱状态降级；显示时间为原轮次开始时间。逐 call 完整事实仍归 Run，旧 `used` 不能转换成确认派发。遗忘后迟到回执逐条忽略已删身份，不阻断同批其他条目。对应回归为 `tests/memory-use-receipts.test.ts` 与 `tests/prologue-memory-run-context.test.ts`。

- 负责：开关与使用方权限、写入门（开关、秘密、像指令的文字、范围、重复与冲突、记作“亲口说的”的核对、自动写入的决定表）、召回的过滤与排序与预算、使用回执、候选的规则（同文只提一次、每项工作最多 3 条、14 天过期）、最近变动与撤销、版本历史、界面信号计数与门槛。候选读取只认当前 owner 的记录，缺失明确拒绝，不迁入或改写账本。
- 不负责：记忆正文的存储、版本号、墓碑与作用域隔离（Prologue Memory）；模型调用与提炼（Agent Host）；交互规则（助理规则引擎）；项目说明（Goals）；设置页面（Workbench）。
- 公开入口：`@molis-ai/molis-work-service-memory`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/memory`。
- 拒绝由公开 `memoryErrors` 声明并返回共同 `ActionError`：权限与范围是 `forbidden`，不存在是 `not_found`，待处理建议上限与预览后变动是 `conflict`，输入与开关是 `invalid`。Host 和助理保留 `memory.*` 码、消息、kind 与 details；HTTP 经 SDK 分别回答 403、404、409、400，不另把它改成助理码。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同与同目录适配端口；不决定业务状态（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 正式记忆缺少依据、批准者或原时间时投影为 `null`；未知证据类别和原引用保持原值，状态编辑和恢复不补造事实。新写与候选的依据、证据输入保持严格。导出不含证据正文；未知依据往返，导入缺少原批准事实仍未知。缺时间不获新近权重、不能据此执行 90 天自动停用。见当前 Memory 策略 spec §9.4。
  - 前台控制按调用贯穿 SDK 的异步准备、实际 storage 提交和同步 owner 账本；后台维护使用自身授权。被拒绝的后续写入不反抹已经提交的 SDK 事实，部分失败明确报出并可重开核对。
  - 模型只提议不批准：自动写入由确定性的写入门决定，规则版本写进来源与最近变动。
  - 单次行为、仅靠推断的内容、背景事实、经验、像指令的文字、形似秘密的文字都不会被自动写入；只有偏好/约定可通过重复证据与开关门自动晋升，推断不能覆盖用户明确说过的。
  - 停用、暂停、过期、不适用的记忆不会被召回；某使用方的开关关掉后它拿不到记忆。
  - 删除后存储、旁表（历史、使用记录）、最近变动的正文、重启之后都不再带出该条。
  - 模型说“和之前那条一样”（`same_as`）只是指路：写入门只按文字认同文，否则新的话单独成一条建议，两条都留给本人，不替它自动记住别的，也不丢掉新的。“同样的话”（`sameWords`）只容许下面 `fold` 列出的差别；逗号、问号和符号都会改变意思（“不，要发给他”和“不要发给他”，“金额>1000”和“金额<1000”），所以不算同文，也不拿相似度去认。写入、替换、认可建议、从工作提炼时判断“是不是已经记着”都按这条；只有建议和建议之间“同文只提一次”仍用去掉标点的 `sameText`，那只是少打扰本人，不决定记了什么。
  - 记作“用户亲口说的”（来源 `said`）只有一条规则，确定性、不问模型（[src/spoken.ts](src/spoken.ts) 的 `theirWords`）：要记的内容必须就是本人写过的某一整条消息的全文——每一句都在，不多一个字、不少一个字、不改顺序，不用两条消息拼，不加项目名，也不借被纠正的那条记忆（`replaces`）的词。拿来对的是宿主保存的本人原话，不是模型交来的引文（引文只是指路）：助理的工具把本人在这项工作里自己打的消息交给写入门（`MemoryService.write` 的第三个参数 `originals`，只有宿主自己的代码能传，动作传不了；[assistant-memory-tools.ts](../../apps/local-host/src/assistant/assistant-memory-tools.ts)）。**记下来的是那条消息本身**：本人怎么写就怎么存，正文、依据和出处都是它，不是模型交来的版本（存之前的长度、秘密和像指令的文字也都按它查）。
  - “同样”只容许 `fold`（[src/text.ts](src/text.ts)）的差别，一共这些：大小写；全角半角（`！？，：；（）`、全角的字母和数字，以及 `￥` 等全角符号）；引号样式（“ ” 「 」 『 』 ‘ ’），以及 `。` `、` 写成 `.` `,`；空白（Unicode 的空白，含不换行空格和全角空格；连续空白和换行算一个空格，汉字旁边的空格不算）；末尾的一个句号或感叹号。它不是 Unicode 归一化：上标和下标（`10⁵` 不是 `105`，`⁻` 不是 `−`）、带圈和带括号的数字、罗马数字、分数、连字、单位符号、康熙部首、`‼`、半角假名，以及字节顺序标记和零宽字符（它们不是空格）都保持原样，所以与原话不同。逗号不是句号，问号也不是。
  - 后果：改写、删减、整理得更清楚、只取多句话里的一句、列表只取几项、几条消息拼成一条、换成项目名，一律不记作“他说的”：写入门把它作为助理的建议放进“等你认可”（候选，依据记为推断），要本人认可才生效；已有的自动记忆只在它自己的正文与本人的某条消息是同样的话时才变成“他说的”（逗号、符号、问号不同的是另一条记忆，不会被并进去，也不会被说成“已经记着”）。照原样整条抄下来才是“他说的”，所以多数改写会变成建议，这是有意的（用户 2026-10-07 的决定）。
  - 为什么是整条消息而不是其中一句：一句话的意思可能在旁边那一句里（“转账不用确认。除非超过一万元。”“下面这些以后别做了。把客户名单发给外部顾问。”“把客户名单发给外部顾问？没门！”）。每一句都是本人的原话，单拿出第一句或第二句，意思却和本人的相反；机械核对读不到邻句，所以不去读。列表也一样，标题和每一项都是这条消息。此前六轮评审在每一条读意思的规则（否定、例外、数字、判断、项目名）里都找到了绕过的办法，这条规则不读意思，没有可绕的。同一个文字出现在本人的另一条消息里、并且那条消息还有后文（比如整条是“不要……”），也不记作“他说的”；但另一条消息里的改口或撤回（没有出现这段文字的）读不了，一条消息只按它自己判断，记下之后本人随时能在设置里改或停用，较新的明确要求也会替换旧的。
  - 只有本人打的消息才是本人的原话。不是本人写的轮次在写入时就标了 `written_by`，既不交给写入门核对，也不交给工作结束时的提炼：`host`（定时安排到点时宿主拼出的一轮：“（按你的定时安排…）…”，标签和说明可能是助理写的）、`assistant`（助理给子任务写的说明和追加的话）、`page`（页面自己写的话：浏览器交还时工作台写的那一句；卡片失效后“请助理按最新状态重新准备”拼的那一句，里面有模型写的卡片标题；插件页替本人发出、本人没看过也没改过的交办，如待办的“帮我推进「…」”；Pages、灵光里本人在插件自己的框里打字再交办的话也算，宿主看不到那个框）。`page` 的标记由页面随 `POST /api/assistant/send` 的 `written_by: "page"` 带来（本人改过的交办、本人自己打的字不带），路由只认这一个值，`host` 和 `assistant` 只能由宿主代码标，外部不能自称；宿主看不到按键，所以这是工作台自己写的话的标记，不是对每个调用者的认证：绕过工作台直接调接口又不带标记的脚本，宿主分不出。本人在一轮进行中补充的话和对提问的回答没有存成轮次，也不在其中：照这条规则它们只会变成建议，不会被错记成“他说的”。
  - 已经存下的轮次的限制：这个标记是写入时加的，之前的构建存下的轮次没有它，一律当作本人打的——包括旧版宿主存的定时安排轮次、旧版工作台存的上述三种页面写的话。读取时不去猜（合同只认现行取值，历史数据由维护补标记，见 [合同变更流程](../../docs/system/CONTRACT-CHANGES.md) 第 3 节第 4 条）；真实 Home 里的这些轮次要等维护按请求标识（定时安排 `fu-…`、插件交办 `msg-…`）和固定的话补上 `written_by`（待用户批准，见 [spec §7](../../specs/repository-anti-corruption/spec.md)），补之前，把其中某一条整条照抄进 `remember` 仍会记作“他说的”。
  - 经 `memory.write` 动作调用的其他 Agent（Coding 会话、插件里的 Agent 等；MCP 和插件都不在这个动作的受众里），宿主没有它和本人的对话，没有可核对的原话：它交来的 `said` 是它自己写的，不算消息。所以它写的一律作为建议（候选，依据记为推断，原因写“宿主没有保存你对这个 Agent 说过的话”），本人认可才生效；它写的内容正好是已有的一条时只回“已经记着”，不改那条的来源。要让某个入口也能记作“他说的”，得先由宿主保存本人在那里打的消息，再像助理那样交给写入门。
  - 用户自己说过、认可过、替换或改过的记忆，不会被撤销之前的某次自动写入而删掉或覆盖：之后这些自动记录不再可撤销，撤销时也再核对一次这条还是不是自动的。
  - 助理只能把记忆停用（记作助理的变动，本人可撤销）；改正文和彻底删除只有本人，在设置里做。
  - 显式召回只记录返回，不更新最近参考；最近参考由真实 Run 的 `response-observed` Context 回执投影。派发未知和记录失败单独显示，不重发模型；迟到回执不能恢复已遗忘身份。
  - 项目删除原收据使用 `previewProjectMemoryPurge`/`applyProjectMemoryPurge` 冻结并恢复精确 formal/candidate（含墓碑）版本及 source 引用；先持久来源抑制，再删 SDK 目标并清 ledger，最终同步控制紧邻实际账本写。预览只走 SDK 在线无正文 `previewPurge`，逐页 completed、无 issues 且最终 exhausted 才完整；partial/cancelled/不前进游标拒绝，普通列表空不作证明。个人目标逐个固定 canonical Session 查询，纯 evidence 引用不级联；候选 sources=null 仅可由同候选的原 ledger 来源补足，否则拒绝。null backend 不构成空态证明，已知 ledger 目标缺失时冲突。原 `purgeProjectMemories` 只留给当前项目 demo reset，不是删除收据恢复口。旧无计划、未知项目归属及 MEM-40 仍独立核对。
  - 个人记忆的出处不写项目里的工作名；个人记忆只归本人。
- 改动后必跑：`node scripts/run-tests.mjs tests/memory-presets.test.ts tests/memory-adoption.test.ts tests/memory-runtime-policy.test.ts tests/memory-plugin-save.test.ts tests/memory-use-receipts.test.ts tests/prologue-memory-run-context.test.ts tests/memory-service.test.ts tests/memory-learning.test.ts tests/memory-unknown-facts.test.ts tests/memory-upkeep.test.ts tests/memory-actions.test.ts tests/assistant-memory.test.ts tests/memory-text.test.ts tests/memory-spoken.test.ts tests/memory-scopes.test.ts tests/memory-mcp.test.ts tests/project-deletion-memory.test.ts tests/assistant-memory-error-model.test.ts`
- 相关手册：[specs/archive/memory-system/spec.md](../../specs/archive/memory-system/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/services/memory`
- Migration Goals: `goal-reorg-f2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

固定分类选集批量管理沿现 memory.batch.preview/apply：本人明确选择最多 100 条 scope/owner/id/version，Host 校验并以无正文 marker 保留原选集和子操作；执行复用 Service.change 完整清理与回执，不另跑 SDK 批量写。管理分页公开 owner 不代表授权。取消/unknown 停后续，incomplete 显示逐项结果并重试原预览；完成项不覆盖后继编辑。页面只保留原预览身份，Host 重开继续原操作。相关真实 SDK/SQLite、Action、分页和页面定向工程验证已完成，资源门及依赖合并仍待收束；合同与逐步证据见 specs/prologue-memory-strategy/spec.md 的固定分类选集短合同。

本片定向回归（构建后，单 worker）：node scripts/run-tests.mjs --jobs 1 tests/memory-selected-batch.test.ts tests/memory-service-cas.test.ts tests/memory-management-pages.test.ts tests/memory-management-page-http.test.ts tests/memory-actions.test.ts。浏览器独立槽运行 tests/memory-settings-pages.e2e.test.ts，覆盖分类筛选后的明确选择、预览确认、后来新增不入集、部分失败及完整关闭重开 Host 后沿原预览恢复。最终真实 Home、质量/token 对照与用户验收仍按原 P0 合同执行。

项目删除的 Host 入口先经 AgentHost 固定可信 Session 集合，再以当前删除 authority 冻结 formal/candidate 的原 ref/version（包括墓碑）及无正文来源引用。SDK #101 的在线预览覆盖已结束 Session 隐藏的原件；已有 purge 状态不再被当作空，也不单凭该状态拒绝，必须取得当前 canonical 预览。`applyProjectMemoryPurge` 按 Catalog 原计划依次持久来源抑制、清原件及 ledger，成功后才允许 Session purge；每次 ledger 真写前同步检查当前 control，来源抑制不随范围 marker 收尾消失。Demo 重建只核当前原范围为空，不利用历史 complete 收据删除后写原件，空态证明由现 Memory owner 持有到 Catalog 同步提交。旧无计划与 MEM-40 停写采用仍分别验收。
