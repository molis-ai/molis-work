# 平台记忆

个人与项目记忆的平台服务：开关与策略、确定性写入门、召回编排、待认可的建议、最近变动与撤销、界面信号计数。记忆正文、版本、删除与作用域隔离都在 Prologue Memory（经 Agent Host），本服务不保存第二份正文，也不调用模型。

包名：`@molis-ai/molis-work-service-memory`。工作区内部包，通过仓库构建和 Host 装配使用。

## 分类分页与条件改类

本人管理经 `memory.page` 读取当前授权范围内的一页，支持场景、六种正式类别、保留类型、状态、来源、到期与文本筛选。`managementPages` 只配置页大小与整次扫描限额；不承诺底层目录枚举有界。项目设置按既有 owner 关系逐页包含角色记忆。游标绑定本人、项目、使用方、当前 owner 集合及查询；异步返回前重新检查取消与 owner 集合。不能证明精确总数时明确返回 unknown，读取不补分类或改写原件。总开关关闭不阻挡本人管理读取。

`memory.change` 的 `reclassify` 只处理未到期、非 Session 正式条目，以页面所见版本提交一次 `setMeta/update`；不改变 owner、namespace、扩展分类、原状态或未明确改变的期限。扩大适用场景或保留期限由现页面展示原值与新值后确认。`habit/project-decision` 属于可管理正式类别，自动形成仍是原四类，自动批准仍受原低风险门表约束。导出与现 v2 导入保留六种正式类别，不恢复旧库采用。

原操作先固定目标、动作与确认版本，完整正文/元数据仍由 SDK 核验原请求。SDK 已提交但 ledger 未记时，原请求可经 SDK 原操作核对后补唯一历史和变更；当前版本加一自身不是成功证明。原确认后尚未提交的到期条目仍拒绝。SDK107 曾在跨到期的已提交改类重试中先拒绝读取；本地采用的 SDK86ad 修正了原提交确认顺序，当前 SDK493 保留该修复，根整合的原失败用例已通过。后来编辑、删除、取消或撤权不能借补账覆盖。这里说明分类编辑的恢复，不代表 Session 管理、续期、分类读/形成限制或固定批量的整体验收；续期对所选新期限的限制见后文。

本片回归：`tests/memory-management-pages.test.ts`、`tests/memory-management-page-authority.test.ts`、`tests/memory-management-page-http.test.ts`、`tests/memory-classification-edit.test.ts`。工程结果与页面实操分别由统筹记录，本节不声明已通过。

## 历史恢复与原编辑决定

`memory.history@1`只公开历史正文、分类、绝对期限与快照完整性，不返回canonical快照。完整历史恢复仍采用所选快照的正文、元数据及来源；SDK的停用/暂停状态不变，可信Session沿原规则保留当前分类、绑定和期限。页面展示这些事实，恢复前明确确认；缺快照或非法旧分类不能拼出一次“完整恢复”。本人仅采用旧文字时沿现update，只改正文，不加载旧库或推测旧分类。

update和restore的SDK子操作使用原`change:<id>`保存的确认版本；父操作保存后、子操作保存前失败，也不能在重试时改用后来版本。restore另在现无正文父marker固定所选历史版号，同操作不得换版；缺少这份原决定时拒绝猜测。已提交SDK原命令仍可核对并补唯一历史/变动，合法完整恢复与合并撤销沿用原主人。Backend/ledger可替换，原版本、权限、Session、到期及遗忘边界不能配置关闭；用户选择由App取得，不增加SDK状态、数据库或正文副本。对应故障及页面验证结果记录在原Memory spec，测试绿色不代替真人验收。

## 整包导入的固定重试输入

`importScope` 在派发任何条目前完整读取当前版本的包并复制可变输入和调用身份（保留原取消信号），以可信 scope/owner 和有序有效条目的 SHA-256 摘要固定本次操作。它是业务重试输入身份，不是源码或流程校验；现 ledger 只保存摘要，不保存正文副本或 encoded request。对象键序不影响身份，条目和语义数组顺序保持，分类、原出处、来源/依据、期限、适用条件、Session 与 namespace 均参与固定。同操作换包在新副作用前报 `memory.conflict`，原包仍按既有逐项回执恢复，拒绝数、部分结果与已提交事实不变。

整包身份的新绑定和已有第 0 子操作检查在同一 ledger 事务内；已有子操作却没有整包身份时不能推断未开始条目的原输入，明确拒绝继续。Backend/ledger 仍沿现窄口替换，权限、取消与身份规则不能关闭；App 提供原包和操作号，用户仍在现导入入口选择文件，没有新增配置。旧格式/缺分类的显式采用不在本片。

## 首期策略接入合同

Memory P0 随 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入 main。已交付的行为、最终验证与后续验收边界见 [P0 收尾与验收](../../specs/prologue-memory-strategy/spec.md#p0-收尾与验收边界2026-11-13)。下文说明分工与约束；旧库正文迁移、有界历史和导出 v2 的后续范围以 spec 为准。

- 本包继续拥有 Molis 的分类定义、产品开关、可信使用方与场景到矩阵的映射、来源证据核验、自动批准门表、信号与配对、历史/撤销及管理协调。SDK 不内置 Coding、助理或习惯这些产品分类。
- SDK 拥有分类/策略执行、唯一条目写入口、持久候选决定、版本和状态、受控替换、异步检索、共享 token 预算与最终 Context 回执。本包经 Agent Host 的公开合同调用这些能力，不复制另一套排序、裁剪或注入循环；`horizontal/agent-host` 仍是唯一依赖 `@prologue/sdk` 的包。
- App/使用方、当前场景、scope/owner/namespace 和来源事件由可信 Host 上下文绑定。模型只交候选内容与证据指针，不能自称用户、改变使用方、扩大分类用途或批准候选。分类许可与已有开关/权限求交，不恢复上位禁令。
- 单值 key 的纠正保留同一个 canonical ref / memory_id，以观察到的 version 做条件更新；不为替换另建一条记忆或 key 控制账。领域版本随正文、状态及可观察元数据变化推进，历史、使用及撤销继续关联同一身份；operationId 关联一次修改与消费账，不是业务事实 key。
- session 生命周期绑定可信 Session 引用，仅该逻辑会话 active 时用于任务。archive 暂停使用，unarchive 只在原期限未到时恢复；purge 永久结束并清理。Run 完成、停止或进程退出都不算会话结束。App 更早结束生命周期时，经同一写门记录到期时刻；重启、unarchive 和读取都不清除或延长 expiresAt。
- 新用户配方和已有 Home 的采用分别处理。没有保存偏好不等于新用户；采用时先按旧规则求出并物化有效开关，再映射到新配方。已有条目、候选及人工修改不因缺分类而丢失，不默认扩成 common。具体字典、生命周期和默认值以 spec 中的首期短合同为准。
- `write`、候选提议/接受/晋升、`change` 的更新/启停/删除/恢复/移动、`undo`、配对处理、维护、导入、改类和批量操作都必须重新通过与该动作对应的门。不能只保护新入口；人工保存和管理读取/删除也不能被自动形成开关误挡。
- P0 保留现有 Molis 历史、撤销和 `molis.memory` 信封，补齐当前阶段需要的分类、状态及策略信息。恢复仍需当前授权与版本检查；人之后编辑的值不能被旧自动变更撤销。当前往返范围见下文；旧格式的显式采用和 SDK 历史正文搬迁仍属后续范围。
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

本片不支持旧格式、缺分类采用或整包输入身份，亦不保存正文快照、编码请求或新账。真实反例和专项以 `tests/memory-service-cas.test.ts` 的公开 Node SDK 与 SQLite 路径验证；源码完成、静态检查和尚未执行的行为回归分别记录，不将旧产物红例当成修复后验证。

### M1 第一片：采用与有效开关

本片引用 spec §9.3 M1、§9.4 的采用约束，只交付 Home 启动前的格式门和可重启的有效偏好。分类正文、矩阵执行、分页、CAS 管理以及界面接线依赖 SDK 后续切片，不用空字段表示已提供。

- Home 的第一项业务写入之前，只有整个目录不存在或确实为空才可自动新建；新建时将个人与项目默认的完整 reviewed 开关持久化（允许形成候选和读取，`auto=false`）。已有 Home 缺库、缺采用记录或缺默认偏好，一律明确拒绝启动，等待维护采用；不猜测用户是否用过记忆。
- 安装器不启动 SDK；只在首次进入的空 Home 初始化 reviewed 偏好并明示写入路径，已有非空 Home 的安装不检查或改写记忆，启动时仍过同一门。安装中断按原合同回滚程序文件；已完整初始化的偏好保留，重试不重置，避免删除可能已被用户使用的数据。
- 既有 Home 的一次性采用在备份副本上执行：按采用前代码计算个人、项目默认和已有项目覆盖的有效设置，包括没有显式偏好时的 `auto=true`，保存消费者和插件限制，再与采用记录一起提交到当前 ledger 基线。产品启动只认当前基线，不保留升级链，不复制 SDK 正文。
- `project-host` 在任何 Home 服务构造前检查，`ensureSystemAgentService` 在 inference/builder 绑定、SDK 初始化和记忆处理器注册前复查。格式或采用失败时不产生 SDK 目标写入，也不留下推理绑定；支持的 Web、MCP 和 Home 入口共同遵循这道门。
- Web 的共同装配和后台轮询只在上述启动检查成功后创建；拒绝启动不能留下定时任务，随后也不得创建其他 Home 库。
- 正常使用仍走已有 `memory.prefs.read/write` 与助理设置映射，同一份偏好影响写入门与召回。新建/采用/重启不改变用户之后保存的开关；本片不扩展权限、不关闭旧用户的自动形成以制造成本收益。真实 Home 的采用、回滚及删除仍需单独授权。

允许修改：本 README、`src/prefs.ts` 与包导出、storage 的 memory ledger、Host 的最早启动门与必要的现役入口（含 `web-server.ts` 既有装配顺序）、对应定向测试。`installer/home.ts` 的新 Home 安装准备与 `project-catalog.ts` 的打开存储准备在原文件内各自持有完整职责，不扩大冻结的主流程或巨类。维护脚本只在会话临时目录。验证覆盖新 Home 候选行为、旧默认与关闭设置、项目继承及插件限制的重启效果、错版/缺采用拒绝、旧产品三入口在采用副本上的 SDK 零写及 Web 拒绝后跨轮询周期无写入；按 `--jobs 2` 运行定向用例，不调模型。产品分类闭环和真人体验不在本片完成声明中。

2026-10-22 的隔离验证覆盖了真实 Host / SDK 持久化、新 Home 安装及中断重试、偏好动作保存后重启、旧有效设置和项目/插件限制保留。副本维护在偏好更新后、版本提升前实际注入失败，旧基线、原偏好、SDK 正文与备份不变，随后能重新采用；冻结的旧 Home / Web / MCP 入口打开采用副本均拒绝且 SDK 正文零写。对应回归为 `tests/memory-initialization.test.ts`、`tests/install.test.ts` 和 `tests/secret-store-keychain-retry.test.ts`，另保留原记忆和存储定向回归。此处只证明偏好与 ledger 格式门；SDK 分类数据采用、最终安装包全链路和真实 Home 操作尚未验收。

### M1 后续独立片：自动批准门 v2

范围与验收见 [spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定)。现役自动批准门改为 preference/convention 正向白名单，experience 和 fact 即使重复出现也等待本人认可；首次候选的原因使用同一规则，不再承诺它们下次会自动生效。新自动批准记录使用规则 v2；旧记录、人工保存/接受、插件独立批准与现有开关不重写。规则由内部 `src/policy.ts` 持有，Service 仍是唯一业务写主人。

本片不增加持久配置或 SDK 适配口。分类字典、四预设及矩阵随 M2 真实装配完成，不能把 `form=false` 当成 off，也不能把泛用 agent 身份当成 coding 场景。验证覆盖真实候选、接受、历史、撤销、重启及下面列出的记忆回归，不将配置声明当成已接通的管理能力。

### M1 配置片：四预设

短合同见 [spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定)。本片将 off/manual/reviewed/assisted 展开为实际的 enabled/task_recall 与原六字段，服务读取和全部写入口共同消费。preset 不另存，细项开关不会被配方覆盖；off 保留管理读取与删除，manual 保留本人保存和可信 Host 的显式回忆。新字段启用依赖 M2 的严格格式采用，当前不能独立合入发布，不能让旧 App 忽略关闭选择。

### M2：条件写入与原操作补账（集成中）

沿 [spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定)，Host 每次以可信 caller 绑定 Backend；模型参数不能取得管理或本人批准。追加以稳定 `operation_id` 对接 SDK 幂等键；已有条目与候选分别带自己的原版本。正文与元数据编辑走一次 CAS；接受纠正走 SDK `settleInto`，不先更新正式条目。

SDK 已提交而 ledger 失败时不做删除补偿。现有 marker 只留动作、目标、原版本、时刻和无正文回执；重试必须带原完整请求，不从 marker 恢复正文，也不把后来版本改成原期望。历史、最近变动与完成回执在同一 ledger 事务落盘；后继修改使原提交不可证明时明确冲突，不能猜成功。清空预览将固定 refs、versions 和 SDK purge decision 存在同一 marker 中；部分失败保留逐项结果，重试不重新列出新目标。离线采用与真实 Host 授权由各自主人接线，本模块局部验证不代表 M2 或 P0 已完成。

正式删除在任何异步来源或候选清理之前固定原确认版本，清理前后及原操作重试始终使用同一 purge 条件，不能改用后继版本。若旧版已留下与原确认版本不一致的 purge marker，升级后必须拒绝消费，保留原 marker 和待核对条目，不静默改写条件。来源抑制和关联候选可能已经清理，未知结果或中途失败不代表零副作用；候选 SDK 删除已提交但回应或 ledger 投影失败时，按现有候选删除 marker 重放并补齐投影，不能把当前列表中缺失当作清理已全部完成。未发生外部修改时原操作可继续完成；原确认之后有人编辑则拒绝删除其新版本，保留新正文、版本和历史。

删除、撤销自动写入和跨范围移动在 SDK 已清除源条目而 ledger 清理失败时，按原操作继续清理历史、使用记录和变动正文。恢复先核对原决定与 purge 条件的动作、范围、版本和状态，原范围必须仍属于当前 caller；undo 在原记录仍存在及已完成返回时也检查原 caller 范围。Service 的 `beforeEffect` 沿现 Action control 接入，在候选列举后抑制来源、候选删除后清投影、正式删除后清账这三个边界重新检查 App 授权，实际 SQL 仍受同步的存活、取消和当前 authority 检查保护。SDK 的 `already-absent` 只证明当前不存在，不证明是原操作删掉的，也不提供 App 删除授权。undo 的 SDK 删除在事务外，ledger 的 forget 与 undone 回执在同一现有事务内提交；任一失败后都能用原操作重试。已接受遗忘使undo投影隐藏时，仅原auto_kept变动、原undo/purge条件及独立接受决定精确一致才可续办原清理，不解封正文、不重新推断撤销计划。已完成操作保留原结果的幂等返回。`src/moves.ts` 拥有跨范围移动的完整生命周期，目标只来自原创建身份；已保存目标结果后的清理和完成重放不受 enabled 阻挡，保存或创建目标仍检查开关。目标回执和创建历史在源遗忘接受前同事务保存；源仍在而该事务失败时，原请求可核对SDK创建后继续。按用户2026-11-05决定，源已不可用且旧marker完全缺少目标回执时，保留现存内容、拒绝自动续办并提示待核对，不再恢复旧源快照拼创建请求。目标已被后来编辑或无法核对时明确冲突，不创建第二副本、不把后来版本记成原创建。

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

沿 spec §9.5，候选自身最多等待 14 天；正式记忆的绝对期限单独保存在内部候选记录 `formal_expires_at`，不出现在公开候选投影。短于等待期时，候选同时提前到期；长于等待期或无期限时，不把等待日期当成正式期限。同一操作的无正文 marker 在 SDK 提议前冻结正式期限，补账不能把原 30 天改成 60 天。接受仍由 SDK 检查候选自身期限；已提交的同操作可以按 SDK 合同补关联与历史，不能重新产生一次正式写入。

已记录的候选 `formal_expires_at: null` 表示无正式期限，缺字段表示旧记录未记录该决定；两者不混用。公开 `write` 的替换请求沿用原语义：省略或传 `expires_at: null` 都保留目标原期限，并不提供清空期限或续期能力。

当前导出信封及导入/导出动作保留 canonical 分类、Session 引用、命名空间、依据类别和绝对期限，仍对正文、出处与适用文字脱敏；敏感约束不能改名后冒充相同授权。导入只接受当前版本的完整信封，缺分类或旧格式整包拒绝，不补 common。相同正文但分类、Session、命名空间或期限不同的条目不能被静默当成重复。Session 仍要求原可信绑定，导出不授予新的会话权限。

历史快照与合并撤销重建保留原分类、Session、命名空间和期限；到期后撤销明确拒绝，等待本人决定续期，不清空期限或转成长效。移动仍沿原合同创建新 scope/ref 并清理旧历史，不承诺历史跨 ref 跟随。旧格式采用、缺分类选择、状态完整往返和续期 UI 仍需后续 P0 切片；本片不补自动晋升或来源批准能力。

范围读取和视图投影、固定清空预览/重试、导出与导入由 `MemoryScopeCommands` 持有，使用同一 Backend/ledger；导入与撤销重建回到 Service 的同一个写入门，不另建正文真值。`tests/memory-retention-roundtrip.test.ts` 使用生产权限策略、Backend、Node 磁盘和 SQLite，覆盖实际保存、候选接受、原操作补账、重启与往返；不调用模型，也不将这些工程证据当作旧 Home 采用或整体 P0 完成。

### 本人明确续期

沿 spec §13「B3 首片短合同」，到期正式记忆由本人选择新的绝对 UTC 期限，经 `memory.change@1` → `MemoryEdits` → AgentHost 的 SDK `renew` 提交。原 ref、确认版本、操作号与期限固定；不修改正文、分类、出处或 paused/disabled，也不恢复墓碑。App 本片拒绝 Session 续期和混合编辑，不默认延长时间。

SDK 已提交而历史事务失败时，保留原操作，重试或重开后由 SDK 核原输入再补唯一历史；后继版本不能代替原回执。按 SDK 原 S1 合同，所选新期限已过时原续期请求仍拒绝，不能通过重算期限补账。新期限、当前授权、分类/保留和取消门不可跳过。设置页沿现日期输入、确认和原请求重试；日期与确认由本人决定，没有新库、后台恢复或可替换写主人。直接验证为 `tests/memory-renewal.test.ts`、`tests/memory-renewal-http.test.ts`、`tests/memory-settings-renewal.e2e.test.ts`，使用临时 Home 和真实 SDK/SQLite/HTTP。

## 一次典型调用

助理的一轮开始前，Host 以“助理”这个使用方调用 `MemoryService.recall`：服务按用户的开关确定能读哪些范围（个人、当前项目），从 Prologue Memory 读出条目，结合 Host 记下的类别、适用情境、状态和有效期逐条过滤，用中文两字片段与英文词打分，按上限与字数预算取用，把用上的和因预算没带上的都记成使用回执（设置里显示“最近用于”）。用户说“以后都……”时，`write` 经写入门：开关、秘密形状、像指令的文字、范围、重复与冲突，最后才写入 Prologue Memory 并记一条“最近变动”。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/service.ts](src/service.ts) | `MemoryService`：列出、召回、写入门、修改与移动、候选、最近变动与撤销、界面信号、整理与维护 |
| [src/scope-commands.ts](src/scope-commands.ts) | 授权范围读取与视图、固定清空、当前格式导出/导入；导入复用 Service 写门 |
| [src/prefs.ts](src/prefs.ts) | 开关的默认值、四预设配方、补全与使用方权限 |
| [src/preferences.ts](src/preferences.ts) | 有效偏好读写、项目继承与助理设置映射；持久化仍经原 ledger |
| [src/policy.ts](src/policy.ts) | 自动批准规则版本与低风险类型门；只决定自动提议是否仍需本人认可 |
| [src/text.ts](src/text.ts) | 召回关键词、同文判断（`sameWords`：同样的话，由 `fold` 折叠后相等；`sameText`：去掉标点的粗略相等，只用来给建议去重）、秘密形状与像指令的文字（确定性规则） |
| [src/spoken.ts](src/spoken.ts) | `theirWords`：记作“用户亲口说的”（来源 `said`）的核对，内容是不是本人写过的某一整条消息（只容许 `fold` 的差别：大小写、全角半角、引号样式、空白和最后一个句号），记下来的是那条消息本身；`quotedFrom`：引文是不是本人说过的一段话（工作结束时提炼出的建议用它区分“明说”和“推断”，不决定“亲口说的”） |

合同在 `@molis-ai/molis-work-contracts/services/memory`（`memory.*` 动作、旁表端口）。旁表由 `@molis-ai/molis-work-storage` 的 `openMemoryLedger` 实现；Host 装配（Prologue 后端、动作注册、`/api/memory/*`）在 [apps/local-host/src/memory/memory-host.ts](../../apps/local-host/src/memory/memory-host.ts)。

`MemoryServicePorts.bindChangeTarget` 将 `change` 已授权定位的 scope、owner、project 同步交给当前 Host 控制，发生在变更记账和正式提交前；不返回正文，也不另查目标。助理受控工厂必传此口，用同一调用的最终检查覆盖实际目标撤权后的 SDK 提交与 ledger 写入；普通管理装配继续使用其现有 Action 控制。

## 接入与边界

使用方只经 `memory.*` 动作或 Host 进程内的服务调用；使用方身份来自可信调用上下文（受众），不从输入读。插件只能读到被允许的类别（服务里的规则；动作目录今天不向插件提供记忆，见 [CALL-CHAINS §8](../../docs/system/CALL-CHAINS.md)）；外部 AI 客户端只能召回，要本人授权，默认读不到个人记忆。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-memory typecheck
pnpm --filter @molis-ai/molis-work-service-memory build
```

### M2 来源绑定与规则 v3（实施中）

「规则 v2」「规则 v3」是这条产品规则的代号，不是版本号；记录里的规则版本是 `src/policy.ts` 的 `MEMORY_GATE_VERSION`。Memory 其余工作仍按原决定暂停。

范围与验收以 [spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定) 为准。沿现学习队列，自动学习只经 SDK `candidates.form` 调用一次登记的 Host 提炼并写候选；人工提议仍使用现公开提议口。无长期信号时返回 skipped，不读取来源、不调用模型。明确表达复用 `spoken.theirWords` 的整条消息规则，重复只数独立来源。模型引用、工作/Run/job 数量和旧无来源候选不构成自动批准。

形成前由本包读取同一份当前授权上下文（最多 30 条正式、20 条待审），冻结个人/项目的新建槽与跨类别替换槽。正式上下文按当前 task 读取许可取得；已过期、暂停、停用或不在当前场景可见范围的条目不进入提炼上下文，也不生成替换槽。管理页面仍可按原管理许可查看它们，不清期限或重分类。待审上下文沿候选管理审阅许可，并再次求交当前形成/学习开关、场景、私有命名空间和有效期，仅服务本轮去重与来源合并，不冒充正式 task 召回许可。关闭任务召回而仍允许形成时，不读取正式上下文，仍可形成新候选。目标类别复用当前 consumer 与插件的 explicit 许可求交；默认 Coding 仅提供 preference/convention，明确授权其它类别后才增加相应槽，不因一个未授权类别阻断全部合法形成。每种当前允许类别可新建三条，App 明确配置最多 144 槽；提炼每轮仍最多三条，原文上下文只传一次。替换槽保留原目标与读取时版本，接受只能走同一目标的 `settleInto`；目标丢失或后继编辑不得改成新建或追最新版本。只有与本次整条本人原话对应的旧 explicit 待审候选可贡献其 SDK 已确认来源，最终仍由 SourcePort 重读；不把其它待审来源送入模型。

每次实际模型派发前沿同一公开读取口复核这份固定上下文的权限、状态及原版本；变化即拒绝派发，不替换正文、目标或期望版本。该回调只活在当前调用，不进模型或持久记录。

候选账注只登记 SDK 已确认的引用、版本、来源和冻结期限。模型的 inferred 提示始终保守待审；自动 v3 晋升仍独立核验两份完整本人表态、当前权限、低风险类别及原撤销 journal。形成的 partial、unknown、取消和提炼用量原样返回，不能变成空成功；同操作按 SDK 完整创建输入恢复，不宣称整批 exactly-once。模型、SDK 写主人、权限与取消都不可替换为第二条 App 提议循环。验收使用真实 Node 存储及有界提炼替身，覆盖无信号零调用、同类多条、条件与跨类纠正、来源重复、固定版本冲突、取消和部分提交。

产品规则 v3 和撤销准备/补账归本包，SDK 仍拥有正式 CAS 与候选决定。准备写现操作 marker/原版本历史，并在原 marker 内一次生成有界变更 ID；提交及重试复用该 ID，提交后记现变更与撤销；失败沿原操作恢复，后继人工版本不得覆盖。遗忘先写无正文来源抑制标识，清理和重放都复用现 ledger，不新增来源正文表。`learning.ts` 拥有学习编排，`promotion.ts` 拥有版本化批准与当前账本回执；这些不成为另一个候选或执行内核。现候选账注的可选 `source_refs` 只保留 SDK 已确认的来源身份，不保存原文、不替代最终授权；晋升准备读此账注，避免重入 SDK 正在执行的候选队列。

## 开发要求

自动形成在原 snapshot 和 formationSources 得到完整 canonical 来源并集后，先调用可选 `bindFormationSources`，再开始原 operation / SDK form。它只把实际选源交给当前 Host 控制，不复制选择算法、不增加权限；SDK 候选回执含集合外来源时拒绝补账或晋升。当前 owner 的同步检查覆盖 SDK 实际写、模型派出与 ledger。

离线 Home 恢复由 `prepareMemoryRestoreRetention` / `applyMemoryRestoreRetention` 只处理原主人给出的无正文遗忘事实：固定 canonical 归属，保留来源事件屏障，并选择需要清除的正式记录、候选及 ledger 投影。SDK 已清除而投影补账失败的候选，仍按原 `memory_id` / `supersedes` 或同归属的来源事件关联清投影，不能因 SDK 没有正文就保留旧候选正文。Memory 不打开数据库、不改归档、不管理发布日志；Storage 与 AgentHost 分别通过专属窄口执行，Host 持有原恢复 lease 和发布／回滚。没有可关闭此屏障的配置或插件。定向回归：`tests/home-restore-memory-forgetting.test.ts`。

人的遗忘决定由 Storage 的独立文件拥有，ledger marker 是投影。`MemoryForgetting` 在原 beforeEffect 后核 SDK 的固定正式/候选版本，借原 AgentHost 实例的写入观察，在同步 accept 紧前拒绝读取间的并发 Memory 写；不添加锁或自动改选。首次决定必须先于来源抑制和物理 purge；未接受、持久结果未确认、已接受但清理未完成分开报告。已接受后的取消或失败仍封住读取和来源形成，原 operation 继续同一 SDK 条件与投影清理，不能改为后来版本。

接受前的首次无正文完整选择保存在原 `MemoryOperations` operation marker，含原 actor/scope/owner 下的正式、候选版本与来源事件；它不是已经接受的删除决定，不新增 phase。相同 operation 重试保持原选择，初选为空也不能自动加入后来候选或来源；新选择必须用新 operation。最终 SDK 两类版本读取之后，同步重读原 ledger 的 links/notes，与观察保护下的当前 SDK 候选核完整关联集合；新增/变化、仅剩 ledger 的关联投影都参与比较，变化在独立决定接受前冲突。accepted 重试只取独立决定，不再根据当前资料选目标。

重复保存的来源关联与最终正文返回也检查同一独立事实。首次完成在原 ledger 事务前拒绝已经接受遗忘的目标；已提交操作重试在最后异步检查之后、返回正文之前再次拒绝，不能补入迟到来源或返回已遗忘正文。原遗忘操作仍可继续物理清理。

列表、历史、候选、导出、迟到回执及提炼旧上下文都检查同一事实，提炼派发前再核一次。当前 SDK 的 purge 前置需要 management get：仅保留本人 management 的内部 `manage-read` / `delete` 以完成清理，App 的对外管理正文仍受上述过滤；任务读取、候选任务上下文、形成与新变更不得使用已接受目标。SDK 最后同步授权围栏须与对应 Host 策略一起整合验证，不能用管理权限代替最终使用门。回归：`tests/memory-forgetting-service.test.ts`；项目与 Session 自身的删除事实仍归其原 owner。

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
  - 开头的“记住”“请记住”“帮我记住”“remember (that)”是对助理的要求，不是要记的内容：核对和存下的都是去掉这个开头之后的那条消息（[src/spoken.ts](src/spoken.ts) 的 `REMEMBER_OPENING`，用户 2026-11-13 批准）。只去开头，后面一个字不动；“记住了”“记得”这类不是要求的不去。
  - “同样”只容许 `fold`（[src/text.ts](src/text.ts)）的差别，一共这些：大小写；全角半角（`！？，：；（）`、全角的字母和数字，以及 `￥` 等全角符号）；引号样式（“ ” 「 」 『 』 ‘ ’），以及 `。` `、` 写成 `.` `,`；空白（Unicode 的空白，含不换行空格和全角空格；连续空白和换行算一个空格，汉字旁边的空格不算）；末尾的一个句号或感叹号。它不是 Unicode 归一化：上标和下标（`10⁵` 不是 `105`，`⁻` 不是 `−`）、带圈和带括号的数字、罗马数字、分数、连字、单位符号、康熙部首、`‼`、半角假名，以及字节顺序标记和零宽字符（它们不是空格）都保持原样，所以与原话不同。逗号不是句号，问号也不是。
  - 后果：改写、删减、整理得更清楚、只取多句话里的一句、列表只取几项、几条消息拼成一条、换成项目名，一律不记作“他说的”：写入门把它作为助理的建议放进“等你认可”（候选，依据记为推断），要本人认可才生效；已有的自动记忆只在它自己的正文与本人的某条消息是同样的话时才变成“他说的”（逗号、符号、问号不同的是另一条记忆，不会被并进去，也不会被说成“已经记着”）。照原样整条抄下来才是“他说的”，所以多数改写会变成建议，这是有意的（用户 2026-10-07 的决定）。
  - 为什么是整条消息而不是其中一句：一句话的意思可能在旁边那一句里（“转账不用确认。除非超过一万元。”“下面这些以后别做了。把客户名单发给外部顾问。”“把客户名单发给外部顾问？没门！”）。每一句都是本人的原话，单拿出第一句或第二句，意思却和本人的相反；机械核对读不到邻句，所以不去读。列表也一样，标题和每一项都是这条消息。此前六轮评审在每一条读意思的规则（否定、例外、数字、判断、项目名）里都找到了绕过的办法，这条规则不读意思，没有可绕的。同一个文字出现在本人的另一条消息里、并且那条消息还有后文（比如整条是“不要……”），也不记作“他说的”；但另一条消息里的改口或撤回（没有出现这段文字的）读不了，一条消息只按它自己判断，记下之后本人随时能在设置里改或停用，较新的明确要求也会替换旧的。
  - 只有本人打的消息才是本人的原话。不是本人写的轮次在写入时就标了 `written_by`，既不交给写入门核对，也不交给工作结束时的提炼：`host`（定时安排到点时宿主拼出的一轮：“（按你的定时安排…）…”，标签和说明可能是助理写的）、`assistant`（助理给子任务写的说明和追加的话）、`page`（页面自己写的话：浏览器交还时工作台写的那一句；卡片失效后“请助理按最新状态重新准备”拼的那一句，里面有模型写的卡片标题；插件页替本人发出、本人没看过也没改过的交办，如待办的“帮我推进「…」”；Pages、灵光里本人在插件自己的框里打字再交办的话也算，宿主看不到那个框）。`page` 的标记由页面随 `POST /api/assistant/send` 的 `written_by: "page"` 带来（本人改过的交办、本人自己打的字不带），路由只认这一个值，`host` 和 `assistant` 只能由宿主代码标，外部不能自称；宿主看不到按键，所以这是工作台自己写的话的标记，不是对每个调用者的认证：绕过工作台直接调接口又不带标记的脚本，宿主分不出。本人在一轮进行中补充的话和对提问的回答没有存成轮次，也不在其中：照这条规则它们只会变成建议，不会被错记成“他说的”。
  - 已经存下的轮次的限制：这个标记是写入时加的，之前的构建存下的轮次没有它，一律当作本人打的——包括旧版宿主存的定时安排轮次、旧版工作台存的上述三种页面写的话。读取时不去猜（合同只认现行取值，历史数据由维护补标记，见 [合同变更流程](../../docs/system/CONTRACT-CHANGES.md) 第 3 节第 4 条）；真实 Home 里的这些轮次要等维护按请求标识（定时安排 `fu-…`、插件交办 `msg-…`）和固定的话补上 `written_by`（待用户批准，见 [spec §7](../../specs/archive/repository-anti-corruption/spec.md)），补之前，把其中某一条整条照抄进 `remember` 仍会记作“他说的”。
  - 经 `memory.write` 动作调用的其他 Agent（Coding 会话、插件里的 Agent 等；MCP 和插件都不在这个动作的受众里），宿主没有它和本人的对话，没有可核对的原话：它交来的 `said` 是它自己写的，不算消息。所以它写的一律作为建议（候选，依据记为推断，原因写“宿主没有保存你对这个 Agent 说过的话”），本人认可才生效；它写的内容正好是已有的一条时只回“已经记着”，不改那条的来源。要让某个入口也能记作“他说的”，得先由宿主保存本人在那里打的消息，再像助理那样交给写入门。
  - 用户自己说过、认可过、替换或改过的记忆，不会被撤销之前的某次自动写入而删掉或覆盖：之后这些自动记录不再可撤销，撤销时也再核对一次这条还是不是自动的。
  - 助理只能把记忆停用（记作助理的变动，本人可撤销）；改正文和彻底删除只有本人，在设置里做。
  - 个人页的“允许记住”管所有地方：关掉后个人、每个项目和角色都不再形成记忆（直接记、建议、提炼、信号和自动晋升都拒绝），项目或角色自己的开关只能在它开着时再收窄。写入门、学习、晋升、助理的工具和 Runtime 策略共用 [src/prefs.ts](src/prefs.ts) 的 `formationAllowed` 这一个判断（用户 2026-11-13 批准）。
  - 本人明说、经助理记下的（来源 `said`）也能从工作里撤销：只撤这一次写入（新建的删掉，替换的恢复原来那条）；之后本人又改过就拒绝，不覆盖后来的版本。
  - 本人认可建议时，先固定同一范围、owner、种类、命名空间、分类、适用条件、正式期限、替换目标和会话绑定的精确同文候选及所见版本，再按原操作作废。候选决定与认可回执同事务登记，原请求重试可续做候选作废。后续版本变化须重新确认。提炼时同文建议已在等认可的，已经形成而尚未登记的 SDK 候选按 14 天期限到期。重复证据的自动晋升仍沿既有规则。从本人话里摘出、仍是推断的建议，原因写“摘自你说的话，需要你认可才会生效”。
  - 跨范围移动后，源那边已清空正文的变动记 `moved_to`（`personal` / `project`），页面据此说它去了哪里，不留正文。
  - 业务会话的视图和清除也包括从本会话学到的长期记忆和待认可建议。宿主经 `MemoryServicePorts.sourceSession` 核对是否指向本会话的本人输入。实现见 [src/session-links.ts](src/session-links.ts)。会话页的长期条目只读展示，并提供其归属的设置入口。单一范围在首次读取就已扫完时给出确切总数。一份带版本的精确预览记录 actor、可信会话绑定、scope、owner、ID、所见版本和各原操作号，分别报正式与建议条数。全部固定范围接受遗忘后才开始物理清理。会话绑定条目沿 Session 入口清理，来源指向本会话的长期条目和建议沿普通删除和候选清除入口清理。重开页面可发现并继续同一预览，已接受的遗忘先行阻止读取，清除只处理预览固定的身份。
  - 显式召回只记录返回，不更新最近参考；最近参考由真实 Run 的 `response-observed` Context 回执投影。派发未知和记录失败单独显示，不重发模型；迟到回执不能恢复已遗忘身份。
  - 项目被删除时 `purgeProjectMemories` 清掉该项目及其角色的记忆（存储里的条目与候选）和账本里与之相关的一切（修订、使用、变动、候选记录、成对提示、开关、界面计数）；角色的范围从账本记下的所有者和候选记录上的项目找到。原删除回执固定 scope 集合、SDK 预览、候选版本和子操作；复用 `MemoryForgetting` 的最终写观察与独立事实接受；先完成全部固定 scope 的接受，再开始任何范围的原 SDK 物理清理，避免首范围清理失败使后继角色缺少恢复屏障。各 scope 的 Storage 接受分别持久化，不承诺跨 scope 或文件与 SDK 原子事务；后继接受失败时，已有决定保留、尚未接受范围不称已遗忘，原回执 pending 且本次尚未执行 SDK 清理。候选独存及 SDK 已清但 ledger 残留的身份、来源也被保留，不能因当前列表为空漏掉旧副本；恢复旧 Home 不恢复这些身份。清理失败或接受后取消仍拒读，原回执 pending 并按原选择重试；最终账本清理和原操作完成标记同事务，完成后的旧操作不会清掉后来新身份。演示重置保留项目，若清理期间出现未选中的新身份，最终只读复查和同 Runtime 写观察会在 ledger 清空前拒绝，不能把新身份加进旧计划。Home 没有 SDK 业务文件时仍不启动 Runtime，只清原 ledger；无原存储 owner 不能接受非空身份，无法核验版本不能猜测。删除项目就是本人的确认，不另加确认。直接回归：`tests/home-restore-project-forgetting.test.ts`、`tests/project-memory-forgetting-concurrency.test.ts`、`tests/project-deletion-memory.test.ts`。
  - 个人记忆的出处不写项目里的工作名；个人记忆只归本人。
- 改动后必跑：`node scripts/run-tests.mjs tests/memory-presets.test.ts tests/memory-initialization.test.ts tests/memory-runtime-policy.test.ts tests/memory-plugin-save.test.ts tests/memory-use-receipts.test.ts tests/prologue-memory-run-context.test.ts tests/memory-service.test.ts tests/memory-learning.test.ts tests/memory-unknown-facts.test.ts tests/memory-upkeep.test.ts tests/memory-actions.test.ts tests/assistant-memory.test.ts tests/memory-text.test.ts tests/memory-spoken.test.ts tests/memory-scopes.test.ts tests/memory-mcp.test.ts tests/project-deletion-memory.test.ts tests/assistant-memory-error-model.test.ts`
- 相关手册：[specs/archive/memory-system/spec.md](../../specs/archive/memory-system/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

范围读取在 Backend 返回后开启无等待、无外部 callback 的同步过滤阶段，从 Storage 原 `forgetting.read` 取得当前事实，每条仍按 scope/owner/身份检查；阶段尾重走原 owner 读门并比较完整事实，变化或无法核验即拒绝。仅第一条通过遗忘、Session 和元数据筛选的记录读取设置，按完整 actor/scope/project 键在本阶段共享，每条分类独立判断，尾部重读已用设置并比较；空列表或全被前置筛选排除时不读设置。

显式召回在最后 `beforeEffect` 后新开同步阶段，重新取得遗忘事实和当前设置，逐条完成消费者、分类与遗忘检查，尾部重新核验，不跨等待或调用共享。回执事务另取 Storage 自己的当前事实，逐条 marker、身份、强度和 CAS 不变，COMMIT 前原 owner 再核完整事实；变化回滚整批，不省略 returned/omitted。开关、分类和遗忘检查不可配置，Backend/Storage 仍沿原 Port，没有新插件或设置；终端用户仍在原设置页改开关。直接回归为 `tests/memory-class-list-authority.test.ts`、`tests/memory-forgetting-facts.test.ts`、`tests/memory-ledger-transaction.test.ts`；本片不声明 MEM-38 性能达标。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

管理分页沿 SDK 本人管理许可取得当前页后，在最后一次等待之后仍按同一份已接受遗忘事实过滤。物理清理尚未完成时，不把该内部清理许可当作页面读取许可；过滤过的页总数保持 `unknown`，清理完成后再按 SDK 当前结果判断。真实 Node、非空数据、接受后清理失败、重开及返回前交错由 `tests/memory-management-forgetting.test.ts` 覆盖。

分类形成查询沿现候选 `get` 窄口读取指定 scope/owner/id：确实不存在返回 undefined，当前权限拒绝、存储损坏和版本冲突保持原错误。列表未返回的候选只在精确 get 明确拒绝权限时从非本人形成视图排除；缺失或损坏仍阻断，不补写 ledger。本人管理沿原授权查看。

分类控制的原 Run 配方与当前设置取交集，读取和形成独立。本人管理不受分类禁读误挡；任务列表与候选计数/正文按读取限制，不能借来源用途标记换为形成权限。模型输入中的正式记忆按 task-read，待审候选按 read 与 form 共同检查，跨范围的最后一次等待之后再同步复核。新 Home 明确保存九字段，已有不完整 profile 拒绝，不转换旧配置。

SDK formation.items 明确确认 created/replayed 后，写主人只按原 slot 的 scope/owner、candidate_id/version 精确 get，完成同一次操作的登记；仍检查当前形成、来源、取消与版本。unknown 或没有候选引用不触发 get，外来 slot/后继版本拒绝。该 canonical 回执不加入新提炼上下文、不返回任务结果；read:off/form:on 仍能基于新授权原件形成，下一次提炼和任务不能读回旧候选。

候选写主人内部核查只有两种 `candidate_access`：形成回执固定本次 SDK 已确认的 scope/owner/id/version；提议核查固定本次 operation_id 与 scope/owner，仅在 `propose` 局部用于原有同文抑制、来源合并和每工作三条限额。后者仍按当前形成类别过滤，形成关闭的候选不阻塞允许类别；已拒绝的同文仍不重提。两者都核当前范围、形成、来源和取消，不缓存授权，不传给 Action、插件 callback、模型、任务候选列表或提炼上下文。普通候选列表与任意历史 get 走读取许可；`source_use` 只说明原件用途，不再提供候选读取豁免。该收紧遵循现行 read∩form 边界，并非旧测试夹具错误。

SDK `get` 本身不核来源。形成登记在精确 get 后复用原 `beforeEffect` 异步来源检查，再按同一回执复核 canonical 版本和状态；变化即失败，不追随后继决定。随后仍以同步 scope/form/signal 和原受控 ledger 检查登记，不循环重试或补造候选。

分类控制专项：`tests/memory-class-restrictions.test.ts`、`tests/memory-class-runtime-policy.test.ts`、`tests/memory-class-current-access.test.ts`、`tests/memory-class-commit-fence.test.ts`、`tests/memory-class-list-authority.test.ts`、`tests/memory-class-formation.test.ts`。原 Run 与实际 Coding HTTP 分别由 `tests/prologue-memory-class-policy.test.ts`、`tests/agent-memory-class-control-http.test.ts` 覆盖；Assistant 首轮与提交撤权沿 `tests/assistant-original-inputs.test.ts`、`tests/memory-review-remember-cancellation.test.ts`，队列来源与精确登记沿原 `tests/memory-learning.test.ts`、`tests/memory-source-owner.test.ts`。上述工程路径不替代模型质量与用户验收。

### B4 原操作发现与固定选中批量（本地实施合同）

按原 Memory V0 spec 末尾已批准合同：本人有界发现无正文原操作，原 change/clear 继续；选中 disable/remove 经 SDK 固定 preview/mutateBatch，原 marker 保存原 ID/version/operation 和真实完成投影。scope clear 与 remove batch 全部固定组接受后才物理清理，接受部分失败不伪称原子。页面不持久正文或命令，不追删新目标；缺原请求/结果标需对账。路径白名单与红绿验收沿统筹批准的 B4 提案，保留本包原开发要求；不改 SDK/vendor、Storage schema 或独立 forgetting v1。

选中集合批量用例由 `src/batch.ts` 拥有：一份无正文固定计划、原SDK preview和逐项ledger收口；不复制权限或SDK状态机。整scope清空仍由scope-commands负责，两者复用同一仅接受/清理窄口。

固定批量计划同时持有原选择次序，SDK 按 owner 分组后也按原次序投影逐项结果；完整计划始终保留尚未接受的后继组。发现源限定原批量/清空计划和本人已接受独立事实，普通旧写入不进入待清理列表。scope clear 的现役计划仅在完工时写 complete:true；未完工没有该字段不影响继续。发现与执行共同核原 scope/owner、完整固定 parts、逐项版本/操作号及 SDK purge decision，缺失或不一致仍需对账，不能从当前正文补造原计划。

### A4-M 第一段：固定身份精确遗忘（实施短合同）

引用根 Memory V0 spec「Session 精确清除的持久语义已定」与 A4-M。本段只实现既有遗忘/恢复核心，不接本人会话绑定、清除 Action、操作发现新分支或 UI，不永久结束 SDK Session。同一 Storage owner 的 memory-forgetting-v2.json 仍为唯一事实；format_version:1 的每项决定必填 selection_mode。related 保留普通删除、B4、项目清理的关联闭包和来源屏障；exact-identities 仅取可信主人固定的正式/候选 scope/owner/id/version，sources 必为空且至少一个身份，不按 memory_id、supersedes 或同源扩选。

调用仍由 MemoryForgetting 经现 Backend/Storage 窄口到 SDK 与 ledger。接受前用原 Memory 写观察及当前 canonical 版本/权限复核；接受后持久不可撤销。mode、owner、完整正式/候选与来源集合都是原操作的一部分，重试不能改选。冷恢复保留 mode；同身份另有 related 决定时仍执行其关联范围。所选正式自己的历史、使用、变动和配对正文清除；未选 C 的 canonical、原管理文字与历史关联保留。SDK 接受已成但 ledger 未登记的旧回执不得给已忘 M 制造新成功关系。

不新增 store、数据库、SDK、迁移、墓碑或模式推断。严格 shape、当前授权/版本、原操作固定及接受后防复活不可配置；mode 由可信用例决定，不向模型开放。Backend 可装配；终端用户按钮与绑定留后续本人入口。允许路径为统筹冻结的22条清单；Service/scope/upkeep/project 仅传递明确 related，不改其他职责。

验收从真实临时 Home/SDK 的长期候选 C 接受成 M、仅 M 改 Session 起步：related 是正确关联清理的对照，exact 保留未选 C。覆盖 supersedes、候选-only、失败/重启、晚账拒绝、坏 ledger 与旧 Home 恢复、两 mode 并存及严格旧/新文件拒绝。运行原 build、API、boundary、精确5a health 与定向测试；不跑 Full、付费模型或真实 Home。核心机制通过不代表用户清除 UI 或完整 V0 已交付。

### 本人 Session 管理后端实施合同

沿根 Memory V0 已冻结的 A4-M 合同，业务 Coding/Assistant 身份只读映射到原执行 Session；单次绑定、Host 当前身份/控制、canonical 分类 CAS 和固定清理是同一条链。本轮接通受保护 HTTP、write@1/change@1、clear preview/apply、operations@1；分类与候选/history/page只消费已核同Session身份。清除用现SDK session selection完整扫描，原无正文计划在本次写观察下冻结，先接受所有 exact 组再清理，取消/未知/缺计划分别保留可重试或需对账状态，不改选、不补建Session。原related、C→M后仅M改Session的候选保留及Home恢复语义不变。

写主人和精确路径清单在本次仓外交接；新合同文件承载完整Session DTO与strict clear动作，不新增package或公开subpath。活控制仅留Host，MemoryCaller只带已核可序列化身份；授权、CAS、固定tuple和来源/遗忘屏障不可配置，Backend仍走现可装配Port，用户入口交另一个UI写手。此轮不改UI、Storage协议/表、SDK/vendor/lock、HomeRestore生产或门禁。先公开Port/真实临时Home红例，再验证两真实业务Session、绑定交错、越权、分页/历史、同canonical分类、归档写拒绝、候选-only/多scope、部分接受零清理、未知回执/重启/缺计划及原related控制。工程证据不替代页面旅程或用户验收。

受保护入口为个人 `/api/memory/sessions/assistant/:id` 与项目 `/projects/:project_id/api/memory/sessions/:kind/:id`（kind 只可 coding/assistant）。绑定读本业务 owner 与原 SDK owner，不从输入接受 raw Session/owner/actor。Session 分类改成长期或短期仍使用同一 canonical CAS；原请求在 SDK 已完成、ledger 未补账时只准原操作/原 Session/原版本恢复。管理变化记录也按当前 canonical Session 过滤，不能借历史投影带出另一会话正文。

本人明确范围的全局单条 remove、选中 batch.remove 和 scope.clear 保留原 scope/owner、CAS/operation 与 related 独立遗忘链；它们是范围遗忘，不获得 Session 非删除写权限。受保护 Session URL 始终只定位本 Session；停用和其它非删除写仍须原业务与 SDK active，归档不能通过改成长期绕过。exact Session 清理不扩选关联的未选长期候选，known 计划冲突保留 needs-reconcile，真正事实持久结果未知则上抛 unknown 并保留原 preview。

受保护 Session 单条 remove 在首次 canonical/当前控制核验之后、独立接受和SDK清理之前，把已核 session_binding 与原 scope/owner/id/version 一同保留在既有无正文 change-request marker。完整原请求重试只准原绑定（含缺失/存在的区别），继续交原 SDK operation/CAS核回执；不以已被遗忘的 revisions 充当授权，不补造绑定、不改operation，也不借此恢复非删除写。

已接受的原 bound 单条 remove 可由本人全局 UI management 沿原无正文 marker/related 决定继续：必须显式提供原版本，actor/op/scope/owner/id/version 完全相符，当前无 Session binding，且原决定已独立接受；不复制或更改 marker 的绑定。任何受保护入口仍须完整同绑定。操作发现对 bound 单删只返回绑定和原决定/purge元组可核的原 remove 请求，全局保持原 DTO/当前删除授权，不新增业务导航身份，也不授予 Session 非删除权。
