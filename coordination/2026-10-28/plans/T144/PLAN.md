# T144 / BL-493 / S-105 函数级实施任务书候选

状态：**WAIT；工程书修订一，等 T143 采用与共享 writer 锁，未获实施放行。** 根已按 D5 采纳原二审推荐的角色资料与完整包版本方向；本次只落实 REVIEW A–D，不重开方案。正文不等于实现，不代表 S-105 已生效。负责人：开发线 3；统筹负责采纳、共享文件排期与最终验收。

## 依据、冻结点与授权边界

- 本轮只读代码，只写本文件。未实现、未构建、未跑测试，未 fetch、改 refs、写协调仓、GitHub 或真实 Home。BL916 revision-3、T362 继续冻结。
- 初稿 main 读证据绑定 `3740f3510febb613f417b7eb79972073f422842b`：本轮 origin/main 与 `ls-remote` 回读一致。主检出自身 HEAD 是 `08c9933d57e153d1d59bf2811f203056d4358992`，因此实现事实均用 `git show` 冻结 main，而不把主检出当最新 main；主检出 status 无输出。修订读证据补充绑定原二审的 `86570ac4499871f46c52762f73a1cd91f68ccc20`；修订开始本地 origin/main 为 `7579870d5c02f8db532005d4beada2df2ea69cb9`，二者只差 Feed out-rules 和相邻测试，无本次合同路径改动。本轮未更新远端 refs。
- T143 最终合同只读绑定 `58a1713c67833bba0ebea706a88e5476ed6499c2`。`merge-base --is-ancestor T143 main` 返回 1。这只能证明该 SHA 不在本轮 main 的祖先链，不能排除 squash 采纳；统筹须给采纳提交并核实际合同，不能据此自行认定“已合”。
- accepted 主需求：`specs/repository-anti-corruption/slices/pg011-pg017-remaining.md` §1、§7、D5/D6、R1/R3/L/Q；**RAC-2636～2643，S-105**。早期协调计划的 RAC-2635～2641 已被 accepted 总表替换，不再使用，也不新编编号。
- 原始来源核对：协调仓 `coordination/2026-10-28/tasks/T-139.md` §7 与 `plans/PG011-017-plan.md` 的 BL-493/T-144 行已读；原任务书要求包含正文、逐条预览、来源、不扩权、删除 NOT_GIVEN agent 行、等 T143。独立 `tasks/T-144.md` 在已检索的协调目录、该仓 Git 全 refs 路径历史及本机临时文件名中未找到。**不能声称已读到独立 T144 原任务书**；根本次已确认按 accepted §7/总表完善工程书，它就是本片唯一需求书，独立旧文件未找到不再是额外停工条件。旧原始稿号码与决策不覆盖 accepted 稿。
- 本轮使用仓库 `skills/molis-plugin-dev/SKILL.md`、`skills/molis-prologue-ai/SKILL.md` 的合同/AI 数据边界；WAIT 来自本任务授权与 accepted 依赖，不是 Skill 额外审批。
- 仅继承 main 已落地实现与 T143 最终合同。T141、T145、BL916 未合入实现均不作为能力前提；特别不假设 Home 就地升级、Home 访问项目、其余五项服务可用。

目标仍是 accepted T144 的完整行为：真实签名包可带角色/方法正文，预览逐条展示，正文作为有来源的数据给消费者，不授予权限；不能把“解析通过”“登记成功”当作角色真实可用。

## 根已裁定的两项语义（本次固定）

### 角色怎样被真实使用

源码事实：`horizontal/agent-host/src/run-start.ts::assertInferenceRole` 和 `index.ts::assertSessionCreation` 支持 workspace:none、read-only、无工具角色，纯推理本身有用。但签名沙箱这条产品调用链没有相应入口：

- `plugin-agent-service.ts::pluginAgentsFor` 要求 `agent:run`、本安装自己的并行动作与当前调用权限。
- 固定包 Manifest 不派生 `agent:run`；`sandboxedPluginDefinition` 的 broker 不提供 agents.run。Home executor 也没有这一服务；`preparePluginAgent` 还要求项目。
- `AgentDefinitions.roles()` 可显示角色，不提供“别的 Agent 读取该角色正文”的现成产品入口；助理现有读取的是 methods。

**根已采纳：角色在本片是可选择的角色资料，沿现有助理方法材料入口读取，UI 明确标“角色资料”；保持派生的 workspace:none 角色声明，但不因携带正文启动一个 Agent。** 在现有资料选择/读取合同中保留 kind:role|method，使名字、用途、正文都可消费，统一作为数据入模。角色声明用于可见登记；完整验收必须让真实消费者读到角色正文，不能只做展示。

角色资料和方法都是真实可读取、有来源的数据；kind 必须分别保留，不把 role 改名为 method。新增 agent:run 权限、broker Agent 服务、Home 项目接续均不属于本片。本文件末尾提供同一 accepted §7 的精确候选 diff，由根采纳；不另造需求书。

### 包版本与 Agent 声明版本不是同一种类型

源码事实：Manifest `version` 是完整 SemVer 字符串；`AgentRoleDeclaration`、`AgentPromptDeclaration`、`AgentSkillDeclaration` 的 `version` 是 number，SDK `validVersion` 只收正安全整数。accepted “version 取包版本”不能按字面赋值；`parseInt`/只取 major 会把 1.1.0 与 1.2.0 合成一个正文版本。`AgentDefinitions` 的覆盖版本比较、方法精确读取和 Prologue inlineMethods 的同版本正文检查也受影响。

**根已采纳：完整包 SemVer 是签名正文的权威版本，复用 `AgentDefinitionSource.plugin_version`。** 签名正文引用持有该 source 的不可变快照，不再造另一份版本字段。精确默认正文引用为 `{ source: { kind: "plugin", plugin_id, plugin_version, publisher_signature }, kind: "role" | "method", entry_id }`；publisher_signature 由验签/可信安装提供。运行时读取还绑定实际 install_id、installation_generation 与当前工作 scope，这些不是包自报授权。

派生角色、prompt、顶层 method 的数字 `version: 1` 仅是这份派生投影内部满足现行类型的固定占位，不重定义公共 Agent version，也不用于签名正文的新旧比较、精确读取或更新提示。原生 Agent 的数字版本行为保持原义。没有第二个正文版本计数器；不同安装的复制快照只用于既有历史/覆盖/使用记录，不成为可单独修改的版本主人。

## 已可直接采用的工程选择

- 包级 `agent` 与 `methods` 各是可选数组；每项严格只有 `{ name, purpose, body }`。合计最多 64 项，单项正文 UTF-16 `.length` 最多 8000，与既有 prompts.json 口径一致；name 1～80、purpose 1～300，二者均按 UTF-16 `.length` 计数。拒空白正文；保留原正文，不 trim 后悄悄改变它。
- body 必须是 `agent/` 下的普通相对资源文件，例如 `agent/review.md`；复用包路径校验拒绝绝对路径、盘符、反斜杠、NUL、空段、`.`、`..`。从已验签文件映射取内容，不解包到用户目录、不跟随文件系统符号链接、不联网。严格 UTF-8；解码前设 32,000 字节上限，解码后再判 8000 字；缺文件、非法编码、重复包路径均拒。允许多个声明引用同一资源；目录中未被声明引用的额外文件拒绝。
- 两类各自拒重复 name；唯一 SDK helper 对 `JSON.stringify([plugin_id, kind, name])` 的 UTF-8 使用既有 SHA-256 算法，取完整 64 位十六进制摘要，不截断。entry_id 为 `role-<64hex>` / `method-<64hex>`，role 的 prompt_id 为 `prompt-<同一64hex>`。显示保留原 name，不做 slug、归一化或静默截短；同名跨 kind/plugin 得不同 id。单次解析检查派生 id 重复则拒绝，不建身份账本。
- 签名资料对外 method_id 使用 `signed/<entry_id>`，最长 78，落在既有读取 200 与发送检查 `1..120/1..80` 界限内；不再拼任意长度 plugin_id。同一个 SDK helper 可纯确定地生成 id；读取必须凭当前目录返回的完整签名引用及实际安装查同一条，不能从 `signed/` 或摘要反推身份/授权。公开合同说明原生 `<plugin_id>/<skill_id>` 与此签名分支，原生分支不改名。
- 预览顶层可选 `agent_bodies: [{ kind: "role" | "method", name, excerpt, change?: "added" | "changed" | "removed" }]`；change 只在有已装包可比时给出，移除项用旧条目的名称与摘要并明确标记已移除；excerpt 取正文前 200 个 Unicode 码点。name、正文均纯文本渲染，禁止 HTML/Markdown 执行。完整来源在预览既有 plugin/version/publisher 上展示。变更后正文前 200 字相同时，不能声称预览能发现所有内容差异：RAC-2643 还须显示“正文已变化”的比较结果，比较已安装的同身份条目全文，新增/移除分别显示，不向用户倾倒 hash。
- SDK `inspectSkillDeclarations` 当前把空 tools 数组拒掉，与 accepted “tools 固定为空”冲突。推荐允许空数组；依然逐项校验非空数组成员，消费方仍只用自己的工具授权。这是无工具文字方法的合同完善，不需要再询问产品方向。
- agent 块只允许推荐的文字数组，完整 AgentManifest 不能夹带在签名包里；每个多余键都拒，不是忽略。包的集成分支仍只收原有集成格式，不借本片扩展。
- 不新增动作权限、不增加 PluginConsentKind，不为方法正文新建 consent 表、执行队列、cache/epoch 服务或第二个来源登记。

## 唯一主人和函数级调用链

| 边界与路径 | 函数/类型与改法 | 输入、输出及唯一主人 |
| --- | --- | --- |
| `packages/contracts/src/platform/plugin-package.ts` | 明确签名包 wire Manifest 与运行 `PluginManifest` 的区别；加入文字声明/来源引用类型。`PluginPackagePayload.manifest` 必须能准确表达 wire 形状，不能靠 `as unknown as PluginManifest` 混过去 | 包保存作者原始声明与资源；运行 Manifest 由宿主派生。二者不是两份业务事实 |
| `packages/plugin-sdk/src/manifest.ts` 与拟新增 `sandbox-agent-declarations.ts` | 保持 `parsePluginManifest` 只校验完整运行形状；增加专门的包声明解析/文字投影函数，共用原 Manifest 基础校验与严格三键校验。签名工具与宿主使用同一份公共 SDK 解析，不让 Runtime import local-host | 原始 unknown → 已校验 wire Manifest + 派生文字声明；所有外部作者只依赖 contracts/SDK |
| `packages/plugin-runtime/src/package-verification.ts` | `parsePluginPackage` 改用明确的包 wire 解析；`signPluginPackage`、`verifyPluginPackage`、`verifyPluginPackageSignature` 继续对原 payload 的 canonical bytes 签名/验证。manifest.json 必须等于原 wire Manifest；不得先替换成派生形状再验签 | 路径、base64、重复文件、签名、发布者、公钥绑定仍归此处；无运行装配、无 Host 回调 |
| `apps/local-host/src/sandbox-package.ts` 与拟新增 `sandbox-agent-bodies.ts` | `readSandboxPackage` 在固定文件名单上仅加引用到的 agent/ 文件；读取/限制正文后，调用唯一派生 helper 产生 roles/prompts 与顶层 methods 及正文来源；对固定部分原样比对、文字块按共同投影比对，再 `parsePluginManifest` 验完整运行形状 | 输出 SandboxPackage 的有效 Manifest、正文、来源、预览摘要。绝不把简化 agent 数组和完整 AgentManifest 直接 deepEqual |
| `apps/local-host/src/sandbox-plugin-manifest.ts` | `SandboxManifestInput` 加已校验的文字声明参数；`sandboxPluginManifest` 仍是 app 运行 Manifest 唯一组装处。workspace:none、无 execution/host_tools/subagents/mcp/characters/text_sources/directory_input_port；methods tools:[]；每个角色明确自己的 prompt id | 不从正文提取动作，不根据正文添加 capabilities/permissions。保留 T143 的 effects 派生规则 |
| `apps/local-host/src/sandbox-package-store.ts`、`installed-release.ts` | `packagedRelease` 将已校验文字与可信来源沿 `InstalledRelease.packaged` 传递；`save` 保存原 bundle；`load` 重新验签、读同一正文、重建同一运行投影 | 不另写散落的角色文件或运行 JSON 真相；已存 bundle 是恢复来源，安装账本只管理安装/世代/信任 |
| `apps/local-host/src/plugin-builder/installed.ts` 与调用它的 installed-plugin-host/Home 装配 | `sandboxedPluginDefinition` 接收该已校验 release，填 `agent_prompts`、顶层 `methods`、完整 instructions 和 Manifest；不填 `agent.skills`/`agent_skills`；沿现有调用点传入，不借道创作台未合代码 | 只搬运已校验数据；不自行第二次生成 id/version/来源。生成插件旧 prompts 路径不误映射成角色 |
| `packages/plugin-sandbox/src/services.ts` | 完整正反路径接通后删除 SANDBOX_NOT_GIVEN 的 agent 行；检查入口仍拒绝非文字型沙箱 Agent 定义，以严格派生合同的断言替代一刀切拒绝 | 删除行不等于全 Agent 服务开放；agents.run、目录、工具、子 Agent 未新增 |
| `apps/local-host/src/plugin-instructions.ts`、`agent-definitions/agent-definitions.ts`、`agent-declarations.ts` | `registerPluginAgentDefinitions` 使用安装提供的签名来源；`agentRegistration`/`declaredMethods` 保留准确来源；现有 register/remember/withdraw/forget 持有登记，不另建私有目录。增加按 kind 与完整签名正文引用读取的现有注册表方法；在现有编辑覆盖逻辑核默认包版本变化 | AgentDefinitions 拥有登记/用户覆盖，安装监督器拥有是否运行；插件不得自报 publisher/install/世代。disabled 仅可查看编辑，不能作为可用资料读取 |
| `apps/local-host/src/plugin-install-service.ts`、`plugin-install-actions.ts` | preview 从同一个已验证 pkg 生成 agent_bodies，confirm 使用 held 中同一 bundle/pkg，不收客户端回传正文；`plugins.install.preview@3` 一次替换成 @4，同步严格输出 schema 和引用。全文变更提示与已安装包比较，不靠名称或截取文字判断 | 安装/信任仍归原服务。preview 不写持久业务记录；原 actor/project、TTL、一次消费、撤销后拒绝继续有效 |
| `apps/workbench/src/settings-plugins.ts::review` 与 i18n | 真实安装确认页逐条渲染 kind/name/excerpt/更新提示，使用现有纯文本 el/row，错误与取消保持当前界面流程 | 同一份安装预览数据，不另解析签名包，不用摘要替代逐条显示 |
| `apps/local-host/src/assistant/assistant-http.ts`、`assistant-work-reads.ts` | methods 的 list/read 接口带入经裁定的 kind/可信来源/完整正文引用；`methods()` 不能继续把 provider_id 当 plugin_id：签名包 provider 是 `plugin:<id>`。按公开 ActionView.provider.plugin_id 与 plugin_install_id 关联当前授权安装，不以字符串去前缀推断身份 | 读取前后复查当前安装、publisher、版本、范围；多个安装不能通过 owner 聚合读到另一个安装的正文。注册表补按安装读取，沿原 scope map，不增加新的事实表 |
| `assistant-round-materials.ts::chosenMethods/roundMaterials`、`assistant-rule-actions.ts` | 显式选择与按需 read 两条路都保留来源，把签名正文作为带固定不可信声明的 JSON 数据交给现有材料/工具回执；去掉签名正文分支“这一轮按它的步骤做”的无条件背书。沿用 S-13 材料编码与 Prologue 数据路径 | source.plugin_id/plugin_version/publisher_signature 来自签名与安装，title/name/purpose/body 仍是不可信数据。不放 base/role system prompt，不伪造本人原话，不把角色资料转成 runtime role 权限 |

### 必须逐点审的交界

1. SDK/runtime wire 与 Host effective Manifest 分离必须显式命名、类型清楚；现有 native Manifest 仍完整校验。包解析可以在验签前做有界结构校验，但任何信任/登记/写入必须在签名验证之后。拒绝错误码分别归包结构、签名、agent/method 声明，不在错误文本里泄露正文。
2. 正文不去 `inlineMethods` 的指令注册路线。该函数当前会把 body 填成 instructions；本片复用助理的数据材料通路。若某消费者要使用签名正文，必须采用同一有来源数据适配，不允许靠“tools:[]”就把不可信正文升级为系统指令。
3. 来源不能只存在 UI：`AgentDefinitionSource` 目前没有 publisher，`AssistantWorkReads.readMethod` 还会丢掉 source；必须沿读/选择/工具回执/入模/恢复全过程保留。必要合同增加属于本片；动作 schema 改形状就按现行合同规则升版本并删除旧引用，不能只改 TS。
4. `AgentDefinitions.methods()` 目前按 owner 汇总；T144 必须绑定实际安装，签名包不同安装/版本不能被全局“最后一条”替换。已有聚合可继续供设置展示，但执行读取用原 scopes 中实际安装。没收到明确安装来源就拒绝，不从客户端输入授予身份。
5. T143 最终实现不是旧设计里“把 model_configuration/image_generation 放进 Manifest”：它的 `sandboxDerivedPermissions/serviceRows` 从 effects.model/modelSettings/imageGeneration 派生权限，`withSandboxModelSettings` 与 `sandboxImageGenerationFor` 接服务；NOT_GIVEN 两行仍拒绝包直接写这两个 Manifest 块。T144 不撤掉这些行、不覆盖它们的 effects 校验与返回后复核。

## REVIEW A：一个完整 registration，所有安装回调复用

唯一组装函数放 `plugin-instructions.ts`，从 `registerPluginAgentDefinitions` 抽出纯 `pluginAgentRegistration(definition, source)`（拟名）：输入已校验 Definition 与可信安装 source，输出完整 `AgentDefinitionRegistration`，一次包含旧 prompts.json 对应的 instructions、新角色 prompts/roles、顶层 methods、完整 source。源状态另由 existing lifecycle 写 enabled/disabled；不在 Home/project 两边手写拼接。

1. `plugin-builder/installed.ts::sandboxedPluginDefinition` 对签名 app 的项目/Home 两种范围都把 `releaseInstructions` 与新角色/方法放入同一个 definition；T143 Home 的 instructions broker 路径原样保留。顶层 methods 只放 `manifest.methods`/`definition.methods`；workspace:none 角色只用 roles+prompts，不复制到 `agent.skills`/`agent_skills`，不放宽这些字段现有拒绝。
2. `installed-plugin-definition.ts::installedDefinitions` 保留现有 definition 对象缓存与 release 身份。executor 与 lifecycle 用它取得同一 Definition、同一可信 source，再调唯一组装函数；不得在回调里重新“生成另一份正文”。
3. `home-installed-plugins.ts::registerPrompts`、`installed-plugin-host.ts::registerPrompts` 改为发布/更新这份完整 registration，Home 不再调用只带 prompts 的 generatedRegistration 覆盖同一 install_id；项目签名分支撤掉并列 JSON promptScope，统一用 executor 的 install_id。历史生成试运行还用 generatedRegistration，不把试运行伪装成签名安装；已安装生成包如仍走旧投影，保持它自身现行 scope，不能覆盖签名安装。
4. `plugin-instructions.ts` 是安装登记/引用计数的唯一写入协调者：executor acquire/release 计数，lifecycle 的状态更新不 acquire 第二次。更新/恢复调用是现有 holder 的 update/remember，不增加 held；disable 只有最后活跃实例释放后才把全安装显示为 disabled，多项目一处停用不能撤掉另一处的有效登记。执行取材仍核当前项目自己的安装/版本，不靠聚合 enabled 获得权限。
5. Home/project `declaredPrompts` 的 installed 分支也从同一完整登记取 instruction 子集；`resolvePluginPrompt` 依旧只解析所选发布版的 instructions 和人的覆盖，T143 complete/override 不改成角色资料入口。
6. `installed-plugin-lifecycle.ts` start/expose/enable 后、disable、恢复及 `installed-plugin-version.ts` 失败升级补偿都传完整登记；uninstall 走原 forget。`AgentDeclarations.remember` 保存完整 registration；启动失败不能遗留 enabled 资料，重启恢复不能从旧 prompts-only 回调把角色抹掉。已有 owner 聚合仅供设置显示；按安装读取遇到当前登记版本不匹配就拒绝，不取 preferred.at(-1) 的其他版本。失败升级补偿以 Runtime 当前安装记录确认的恢复 release 更新完整登记，不能被 holder 的“只收更高版本”挡住；仅可信补偿入口允许这种替换，迟到的旧激活不能自行覆盖新安装。

A 的完成证据在 RAC-2636/2641/2643：混合真包带 prompts.json、角色和方法，必须在安装所有回调结束后读取，随后 Home/项目停用、重新打开、启用、两项目同时激活/停一个、失败安装/失败升级恢复，逐项检查完整目录和消费者读取。不能只在 executor.start 中途采快照。

## REVIEW B：覆盖、history、uses 与精确读取共用来源引用

`AgentDefinitionSource` 的签名来源分支保存 publisher_signature，完整版本只用现有 plugin_version。以下 default_ref/source_ref 内嵌的 source 就是它的冻结投影；所有构造由上述唯一组装函数提供，不从请求拷贝可信事实。

- `agent-definitions/agent-definitions.ts::AGENT_DEFINITIONS_BASELINE` 在现有三张表上加 nullable TEXT 字段：prompt_overrides.default_ref、prompt_history.default_ref、prompt_uses.source_ref。非签名现行记录显式 NULL，继续使用原 base_version/version；签名角色 prompt 写完整默认引用，uses 写完整引用加 effective/user_revision。没有第二张版本账本，也不把签名正文版本写进整数列。
- `save` 同一事务写 override 与 history 的当前 default_ref；`reset` 删除 override，history 记录恢复时实际采用的默认引用；`history/view/uses/recordUse` 读写这些字段。签名分支 default_updated 比较 current default_ref 与保存时 default_ref 的精确身份，不比较数字 1；包版本不同就提示默认来源已更新，不用大于号遗漏不同构建标识。原生分支沿原数值逻辑。
- 角色取材复用现有覆盖解析，返回 `{ default_ref, effective: "default" | "user", user_revision: number | null, body }`；存在人的覆盖时标明“基于该包默认的用户修订”，不能称这份 body 是发布者签名原文。覆盖仍按现有 Home/owner/prompt 政策共享；读取默认内容则按实际安装，用户覆盖当前 revision 也进入最后复核。顶层 methods 没有编辑接口，本片不新增方法编辑/history；它的 effective 固定 default，user_revision 为 null。
- 拆开签名角色“解析 effective 正文”与“记一次使用”：读取/预览不提前 recordUse；在本次有效交付得到既有 accepted 回执后记录该冻结引用和实际 user_revision。已有效交付后才写出的真实历史记录可以保留，不因源随后撤销删除；未交付/被拒不得记成功使用。既有 instructions 的使用路径保持其实际调用语义，不为本片改成另一个执行系统。
- `AgentPromptView`、`AgentPromptRevision`、`AgentPromptUse`、settings-prompts 的默认更新/history/last_used 显示完整来源引用及用户修订；现有 prompt 读取 HTTP 透传同一字段。methods 不伪造可编辑提示。
- 持久化按已确认的当前完整 schema/干净重建规则：修改当前 baseline（保持存储起点 1）和 `tests/fixtures/home-store-schemas/agent-definitions.sql`，同步 release checklist 的 schema 说明；不加 ALTER-on-open、不读取缺列旧库、不把缺 default_ref 猜成当前包。真实 Home 搬开与重建仍由用户另行授权，本片只在临时干净 Home 与同一现行 schema 的重启恢复验收，不编造历史签名引用或写迁移脚本。

公开消费链固定为：列表返回 kind、完整 default_ref 与可信安装定位；`AssistantMaterial.method`、`AssistantMethod`、`assistant-send-materials.ts::checkMaterials` 保留有界选择引用，丢掉前端 body/effective 自报；server 对 source/install 逐项与当前目录比较，不把客户端定位当权限。`AssistantWorkReads.readMethod` 接受精确选择引用，查当前工作 scope 的 ActionView.provider.plugin_id/plugin_install_id、运行安装及世代、信任、包版本和 entry_id；异步目录读取后取得同步 live-check。执行读取使用 AgentDefinitions 原 scopes 中指定安装，不能 owner 聚合取最新版。

`assistant.methods.read@1` 一次替换为 @2：签名分支输入要求 method_id 与完整 default_ref/安装定位；输出 kind/source/ref/effective/user_revision/body；原生分支继续以数字版本精确比较，不能丢掉用户已选择的 version。同步 handler、严格 schema、roundMaterials 中的硬编码调用示例、目录说明、action snapshot、浏览器 picker/HTTP、assistant-present 的历史返回；删除 @1 引用，不留兼容口。role 与 method 都可沿这一已存在入口作为材料读取，标题和描述不能再无条件说“读了就按它做”。

持久 round.materials 保存已采用的引用、effective/user_revision 和实际当时正文；新轮明确重新采用/重新读取时复核当前引用，失效要求重新选择，绝不把旧引用悄悄改成新包。旧轮历史按事实显示，不重写成最新版、不因停用抹去。

## REVIEW C：检查到实际 handoff，输入与工具各走原控制口

`AssistantWorkReads` 返回正文副本及仅本次消费持有的检查函数，检查绑定同一 installation/generation、工作 scope、publisher、source.plugin_version、entry_id、effective/user_revision。此函数不持久化、不进请求、不建全局 token/cache/epoch；目录 async 校验结束后，最后同步检查从原安装/信任 owner 读取当前状态。不得查 A 的来源却交付 B 的正文。

- `AssistantService.send` 在 chosenMethods 后收集本次所有新资料的检查，组合原 caller.beforeStart/assertBeforeStart（先原检查，再本次来源检查），传到 `AssistantDispatch.dispatch`。work/session 创建、原始用户输入此前合法发生的写入不算失效后新采用。
- 自有 Runtime 新轮：保留 `dispatch → roundMaterials → delegations.startPlaced → host.start`；所有中途 await 后，执行现有 authority.beforeStart 与最终 assertBeforeStart，直到 Agent Host/Prologue 已有启动交付边界。不得在 chosenMethods 返回处就宣称已检查到底。来源检查只约束本次材料移交；不装入持续的 authority.beforeDispatch/action guard，不把源撤销转换成跨插件整轮取消。有效 handoff 回执后，本次 source 检查结束；dispatch 现有 host.start 之后再次 beforeStart 的位置只保留原 caller 检查，不重新因来源变化否定已接受输入。记录真实采用/history 使用这次冻结回执，不回读“现在是否还启用”来篡改过去。
- 这里“交付”指现有 Runtime/执行方有效接受本次输入的 handoff；没有这一回执不能写“已使用”。宿主开始调用 host.start 本身不证明已交付，失败路径仍留未交付。交付后该资料成为已接收历史，之后模型何时处理这段历史不再被称为本次新增注入；不承诺从模型或 SDK 队列删除。新读取/新注入仍须检查新来源。
- 自有 Runtime 已运行轮：`AssistantInputs.deliver` 的 port.send 包装在 compose 后、调用前执行 async beforeStart + 同步 assertBeforeStart，并将同步检查传到既有 `inputsOf(adapter).send(..., assertCurrent)` 最终口；不能只用 beforeSteer（它目前只验图片）。answer 原来拒绝带材料，保持拒绝，不偷偷改成补充。
- 插件执行方：`dispatch` 当前提前 return executorDispatch 丢掉 beforeStart/assertBeforeStart，须贯通参数。`executorDispatch` 在 open/read 等 await 后，通过现有 WorkExecutor 的 `ExecutorControl.beforeEffect/assert_authority_current` 组合本次检查；start/send/control 均经同一 BoundActionClient 的末端复核。仅改调用接线，不修改任一具体执行方业务或增加 Agent 服务。
- `assistant-rule-actions.ts` 的按需 @2 handler 读取后先 `await context.beforeEffect()`，再 `context.signal`/当前 authority 与同一来源同步复核，才返回 JSON 数据给工具消费；不把无效读取写进 uses/采用记录。按需工具读取不在 query handler 新写 prompt_uses：保留现有 Action 的真实读取回执作为读取证据，不新增工具交付确认协议；只有经 send/handoff 实际采用的可编辑角色正文，才在已有 prompt_uses 记录有效使用。方法正文无新增编辑/使用持久账。未交付读取不能被描述成模型已采用。
- 所有名、用途、目录摘要、publisher 显示名与正文均放同一固定不可信声明后的 JSON 字符串；trusted source id 由代码外层给出，包正文伪标记留在字符串中。`chosenMethods`、`roundMaterials`、工具回执和 `AssistantInputs.compose` 都采用同一编码，不再把 name/summary 单独插到指令文本。
- `AssistantInputs.compose` 目前对每项截 4000 再截总量；签名材料分支须保持完整 JSON 和正文，若整体无法在既有 maxText 内完整交付就明确拒绝本次发送，不能切开 JSON/署名/正文。无需提高总预算或改通用附件策略；8000 字单条可在有预算时完整走补充/执行方路径，多条超预算要得到可见拒绝。

RAC-2642 受控 barrier 至少覆盖三条末端：chosenMethods 已读→dispatch 经 startPlaced 尚未 handoff；已运行 input.deliver 异步校验→send 最终口；按需 @2 handler 读完→beforeEffect 尚未结束。取消/停用/publisher 撤销/安装世代或版本变更后释放 barrier，断言未交付新正文、未写无效采用/成功使用、未执行受限副作用。另在有效 handoff 后撤销，保留历史且不新增整轮取消，以正例守住边界。

## REVIEW D：界限一致与最小长度正例

稳定摘要方案已固定，全部 derived token 最长 71，外部 method_id 最长 78；200 的 consumer 限制不必放宽。正文引用另带完整 source 与 entry_id，method_id 只定位当前目录条目，不承载版本/权限。`readMethod` 去掉对签名分支按 plugin_id.length 截 method_id 的旧假设，原生分支仍沿原合同解析。

RAC-2636/2640/2641 增加真实签包正例：80 个中文 BMP 字符的 name，40 个 emoji（80 UTF-16 单元）的 name，混合代理对的 80 单元边界；purpose 300 单元；签包→安装所有回调→列表→浏览器选择→checkMaterials→读取→入模全过程不截 name/id。再用不同 plugin_id 的同名及同 plugin 不同 kind 的同名验证 id 不混用，只有同 plugin+kind 重复 name 被拒。以独立固定摘要向量/字面量检查 helper，不用被测 helper 同时生成期望值。

## 生命周期、取消、撤权与失败恢复

- 预览取消或到期：不安装、不登记正文；held 沿既有 TTL/一次消费，重来须新预览。confirm 重核 publisher 撤销；前端送来的摘要不是许可正文。
- 解析、签名、正文资源、派生 Manifest 任一步失败：没有 pin、package save、安装记录、Agent 登记或模型请求。真实验收要回读这些状态，不只断言报错。
- 安装 start 失败：沿原 dispose 撤下本次 Agent 登记与 caller；不删除别的安装。若既有机制记住 disabled 声明，应如实显示未运行且不可供模型读取，不能显示 enabled。用户数据/编辑覆盖不擅自删。
- 停用/卸载/publisher 撤销：先令实际安装不可调用，随后 withdraw；新的读取立即拒绝，卸载调用既有 forget。Home 与项目各覆盖，重启只从已存签名 bundle 恢复当前有效定义；撤销发布者不因重启又出现可用资料。
- 消费者异步取材：取材前确认安装/精确正文版本；等授权目录/材料解析后、真正把结果交给本轮前再检查。取消、撤权、换安装或换版本时，不写材料采用/调用成功业务记录，不把迟到正文交给模型。新选择/新读取/新注入须重新解析引用；已交付的历史 snapshot 按当时事实保留，不用它授予当前权限。
- 已发送给模型的数据无法收回。原消费者执行仍按自身 signal、授权与 beforeEffect 约束；源插件撤销至少阻止下一次读取/派出，不能把历史文本宣称为“已从模型删除”。是否取消已经独立启动的消费者整轮不在 accepted 中，默认不新增跨插件全局取消；受限动作本身照常拒绝。
- 模型拒绝、失败或超时：原输入保留，不改正文版本、不新增“已采用”成功状态，不自动重试模型或动作。恢复沿现有消费者/Runtime，不建 T144 后台队列。
- 升级：main 当前项目包支持原路升级，Home 包确认仍拒就地升级。RAC-2643 用项目同一签名身份的 v1→v2 验完整升级；Home 只能预览变化及已有卸载/重装路径，不能采用未合 T141 升级实现。新包未确认/升级失败时旧版本与覆盖按现有机制保持；不能先发布 v2 正文后再装 v2 代码。

## RAC 验收：真实签名包和实际消费者

新增建议文件 `tests/security-invariants-sandbox-agent-bodies.test.ts` 与必要的产品浏览器用例，复用现有 `tests/fixtures/sandbox-package.ts`、`signed-package-host.ts`。测试均经正式 signer → preview@4 → confirm → 保存 → 重新 load/启用 → 注册表 → 消费者；不把手工 PluginDefinition 注入当签名包验收。信任正例用临时 Ed25519 密钥和临时 Home，反例改后重新签名以区分“声明被拒”和“签名被拒”。以下编号均为已有 RAC/S。

| 编号 | 最低正面/拒绝证据 |
| --- | --- |
| RAC-2636 | 一包多个角色与方法，派生 id、角色 prompts 关联、workspace:none、methods tools:[] 均与独立字面量期望相符；无 agent:run/目录/新增动作权限。真实消费者分别读到角色资料和方法。项目与 Home 安装、stop/start 及进程重启后从原签名 bundle 恢复均成立；手改存储 bundle 或资源后拒绝恢复 |
| RAC-2637 / S-105 | agent 的 execution、host_tools、subagents、mcp、characters、text_sources、directory_input_port 各单例，以及 methods.tools 单例都重新签名再走 preview 拒绝；补通用未知键与直接塞完整 AgentManifest 的拒绝。回读 pin、package、安装与登记均无变化 |
| RAC-2638 / S-105 | 绝对路径、`..`、缺文件为三个独立拒绝；补反斜杠/盘符/重复路径/非法 UTF-8。正文文件名合法但引用越界同样拒绝，不访问真实文件系统 |
| RAC-2639 | 合计 64 项、单项 8000 UTF-16 单元可用；65、8001、超解码字节限分别拒绝；含中文和代理对边界，正例不能用全空白；预览不静默截掉超限项 |
| RAC-2640 | @4 实际输出逐项 kind/name/excerpt；真实安装确认页可见每一项，HTML 与伪角色标记仅作文字。@3 不再可调；取消不写安装或登记 |
| RAC-2641 / S-105 | 捕获实际 Prologue/模型输入边界：显式选择、按需读取、重启后接续都包含真实 plugin_id、完整包版本、发布者身份、kind、正文；正文为不可信 JSON 数据，不进入 system/工具定义。正文伪造结束围栏、system/user 标记、发布者身份仍留在数据字符串内 |
| RAC-2642 / S-105 | 恶意正文要求读取无授权目录/调用未授权写动作/提升角色；实际工具调用被已有权限拒绝，并断言目标记录/文件/外部副作用为零。不能用“模型没尝试调用”当拒绝证据。另在取材等待 barrier 中停用、撤销发布者、换安装、取消消费者，释放后断言拒绝且无迟到正文/采用记录；其他安装仍可用 |
| RAC-2643 | 项目同安装 v1→v2：变更开头、只变更第 200 字以后、新增、删除各能从真实预览辨认；确认前仍 v1，成功后消费者精确取 v2，旧引用不悄悄换成 v2；升级失败不泄漏 v2。用户覆盖保留且能提示默认包版本已变；Home 不借此证明尚未采纳的就地升级 |

测试中不得以 `plugin_id === provider_id` 的内置 fixture 掩盖签名提供方前缀问题；至少一个方法提供方真实为 `plugin:<id>`，同时有另一安装/版本干扰。取消/撤销用受控 barrier 制造交错，不 sleep 猜时序。真实模型质量检查另记：正常角色资料/方法各完成一项简短任务，恶意文本保持授权边界；模型替身只能证明机制，不能代替该体验结论。

A–D 加入已有 RAC 的完整验收还包括：角色覆盖 save→重启→默认包 1.1.0 升 1.2.0→history/default_updated→reset→uses；版本引用不匹配拒绝，人的实际 user_revision 可回读，methods 没有新增编辑功能。使用记录以有效交付为界，先前有效历史不被后来的撤销抹掉。正常模型回答与授权机制证据分列。

### 最小故障注入

另加两项仅击穿 A/B 的最小必要故障：恢复 Home 的 prompts-only 覆盖回调，安装结束 RAC-2636 应红；签名 default_updated 退回整数比较，1.1.0→1.2.0 的 RAC-2643 应红。无需另建变异框架。

每项单独改生产路径一个点，先确保健康版本通过，再注入、按源码匹配整体构建、跑对应完整文件，恢复后验证；不把变异注入最终 diff。

- 放过一个不在三键名单中的 `execution`：RAC-2637 必须因“没有拒绝”而红，签名仍有效。
- 去掉发布者/包版本的数据来源包装：RAC-2641 在实际入模边界变红；不是只比较 helper 输出。
- 去掉本次材料 handoff 的最终安装复核：RAC-2642 的末端撤销 barrier 例稳定变红，且断言迟到正文/采用副作用。
- preview 只比较前 200 字：RAC-2643 的尾部修改变红，防止用摘要相等漏掉升级变化。

不为测流程另建 hash 清单、固定总 case 数或第二份状态 manifest。签名/包 canonical bytes 的现有安全校验照旧保留。

## 文件范围、顺序与验证命令

实施前先由统筹解除 WAIT：核 T143 采纳提交与实际合同、排包格式/安装/AgentDefinitions/助理共享文件 writer。两个语义已由根本次裁定，accepted §7 直接作唯一任务书，不再额外索取相同决定。一个 writer 串行修改；不同时动别人的工作树。创建隔离分支/worktree 属后续实施授权，本轮未做。

顺序：合同与唯一解析 → 正式签名包读取/保存/恢复 → 运行 Definition/登记及停用清理 → preview@4/真实 UI → 消费者按安装取材/来源与复核 → 正反真实包 → mutation → scoped 审查 → 统筹安排 Full/独立验收。

除函数表所列路径，必需同步：`packages/contracts/src/platform/plugin.ts` 的实际导出、`packages/contracts/src/services/agent-definitions.ts`、助理材料/方法的现有合同与调用点、`packages/plugin-sdk/src/index.ts` 公共导出、`packages/plugin-sdk/src/agent-declarations.ts`；触及新来源分支时逐个列明实际传递路径，不新增无用途接口。下节列明精确允许路径；不泛化公共 Agent 数字版本、不修改 inlineMethods。

文档：在 accepted 片里修正上述已裁定语义与状态；`pg017-sandbox-services.md`/`privileges.md`/BACKLOG 只更新本片实际完成部分；S-105 记录边界和拒绝用例，S-84 补文字预览；`docs/platform/PLUGIN-DEVELOPMENT.md`、插件开发 Skill 与 AI 手册同步包 wire 格式、来源和使用方式。BL916 五项余项原样保留，不因 T144 宣称整体完成。原编号如与采纳时 main 冲突交统筹处理，本线不擅自顺延。

### 精确允许路径（后续实施授权范围候选）

下列是允许变更集合，不是必须全改；拟新增路径明确标出。未列路径若确需修改，先在同一 PLAN 说明具体调用链并由根协调共享锁，不用“相关文件”无限扩范围。当前轮仍只允许写 PLAN。

| 目的 | 精确路径（仓库相对） |
| --- | --- |
| wire 声明、来源、精确选择合同 | `packages/contracts/src/platform/plugin-package.ts`；`packages/contracts/src/platform/plugin.ts`；`packages/contracts/src/services/agent-definitions.ts`；`packages/contracts/src/services/assistant.ts` |
| 唯一声明/摘要解析与顶层空 tools | `packages/plugin-sdk/src/manifest.ts`；`packages/plugin-sdk/src/agent-declarations.ts`；`packages/plugin-sdk/src/index.ts`；拟新增 `packages/plugin-sdk/src/sandbox-agent-declarations.ts` |
| 验签、包读取、唯一派生、持久恢复 | `packages/plugin-runtime/src/package-verification.ts`；`apps/local-host/src/sandbox-package.ts`；`apps/local-host/src/sandbox-plugin-manifest.ts`；`apps/local-host/src/sandbox-package-store.ts`；`apps/local-host/src/installed-release.ts`；拟新增 `apps/local-host/src/sandbox-agent-bodies.ts` |
| 完整登记/生命周期 A | `apps/local-host/src/plugin-instructions.ts`；`apps/local-host/src/plugin-builder/prompts.ts`；`apps/local-host/src/plugin-builder/installed.ts`；`apps/local-host/src/installed-plugin-definition.ts`；`apps/local-host/src/home-installed-plugins.ts`；`apps/local-host/src/installed-plugin-host.ts`；`apps/local-host/src/installed-plugin-lifecycle.ts`；`apps/local-host/src/installed-plugin-version.ts`；`apps/local-host/src/plugin-host-services.ts`；`apps/local-host/src/home-plugin-executor.ts`；`packages/plugin-sandbox/src/services.ts` |
| 单 owner 的持久化与展示 B | `apps/local-host/src/agent-definitions/agent-definitions.ts`；`apps/local-host/src/agent-definitions/agent-declarations.ts`；`apps/local-host/src/agent-definitions/agent-definitions-http.ts`；`apps/workbench/src/settings-prompts.ts`；`tests/fixtures/home-store-schemas/agent-definitions.sql` |
| 安装预览 | `apps/local-host/src/plugin-install-service.ts`；`apps/local-host/src/plugin-install-actions.ts`；`apps/workbench/src/settings-plugins.ts` |
| 选择/输入/工具/末端检查 B/C/D | `apps/local-host/src/assistant/assistant-http.ts`；`apps/local-host/src/assistant/assistant-service-shared.ts`；`apps/local-host/src/assistant/assistant-work-reads.ts`；`apps/local-host/src/assistant/assistant-send-materials.ts`；`apps/local-host/src/assistant/assistant-round-materials.ts`；`apps/local-host/src/assistant/assistant-rule-actions.ts`；`apps/local-host/src/assistant/assistant-service.ts`；`apps/local-host/src/assistant/assistant-dispatch.ts`；`apps/local-host/src/assistant/assistant-inputs.ts`；`apps/local-host/src/assistant/assistant-executor.ts`；`apps/local-host/src/assistant/assistant-present.ts`；`apps/local-host/src/assistant/assistant-store.ts`（只保留现有 round materials 的新引用字段，不增平行账）；`apps/workbench/src/scripts/client/assistant-composer.ts`；`apps/workbench/src/scripts/client/assistant-send.ts` |
| 现行文档 | `specs/repository-anti-corruption/slices/pg011-pg017-remaining.md`；`specs/repository-anti-corruption/slices/pg017-sandbox-services.md`；`specs/repository-anti-corruption/privileges.md`；`specs/BACKLOG.md`；`docs/system/SECURITY-INVARIANTS.md`；`docs/platform/PLUGIN-DEVELOPMENT.md`；`docs/platform/PROLOGUE-AI.md`；`docs/releases/CHECKLIST.md`；`skills/molis-plugin-dev/SKILL.md`；`skills/molis-plugin-dev/generated-ai.md`；`skills/molis-plugin-dev/authoring.md` |
| 测试 | 拟新增 `tests/security-invariants-sandbox-agent-bodies.test.ts`、`tests/sandbox-agent-bodies.e2e.test.ts`；复用/必要更新 `tests/fixtures/sandbox-package.ts`、`tests/fixtures/signed-package-host.ts`；下文完整文件列表中的现有测试可为对应新增断言修改，不放宽原断言 |
| 生成快照/翻译 | `tooling/gates/api/contracts/platform/plugin.txt`；`tooling/gates/api/contracts/services/agent-definitions.txt`；`tooling/gates/api/contracts/services/assistant.txt`；`tooling/gates/api/plugin-sdk/index.txt`；`tooling/gates/actions/host-actions.tsv`；`apps/workbench/src/i18n/en.ts`（只加本片实际文字） |

上述快照路径已按原二审核读树逐个核对存在；包声明由 platform/plugin 汇总，不造 plugin-package 独立快照。资源体积/巨大单元登记只在实际测量后按现行规则提交具体候选给根，不提前授权改门禁。这里不允许 storage 通用迁移层、公共 Agent 数字版本类型、Prologue inlineMethods、vendor SDK、T141/T145/BL916 实现或协调仓。

后续命令（本轮均未执行）：

```sh
pnpm install --frozen-lockfile --offline
node scripts/machine-slot.mjs run build --label "T144 build" -- pnpm build
pnpm api:update
pnpm actions:update
node scripts/test-imports.mjs --check --chains
pnpm boundary:check
node scripts/affected-tests.mjs --explain
node scripts/check-health-gates.mjs --base origin/main
```

定向完整文件建议：新增 signed-agent 文件，加 `tests/plugin-package.test.ts`、`security-invariants-plugin-install.test.ts`、`plugin-install-trust-call-sites.test.ts`、`sandbox-package-icon.test.ts`、`security-invariants-sandbox-services.test.ts`、`plugin-methods-runtime.test.ts`、`agent-definitions.test.ts`、`assistant-methods.test.ts`、`agent-workspace-none.test.ts`；再加 A/B 完整文件 `tests/generated-plugin-prompt-binding.test.ts`、`tests/generated-plugin-prompts.test.ts`、`tests/home-store-baselines.test.ts`；C/D 完整文件 `tests/assistant-material.test.ts`、`tests/assistant-executor.test.ts`、`tests/assistant-executor-product.test.ts`、`tests/assistant-original-inputs.test.ts`、`tests/assistant-input-correct.test.ts`，以及新浏览器文件与现有 `tests/assistant-send-intent.e2e.test.ts`、`tests/assistant-input-receipts.e2e.test.ts`。T143 的 `tests/security-invariants-sandbox-home-signed-model.test.ts` 与相关 complete/override 文件在其采用树上按 README/affected 纳入，不借此重审 T143；以上是最小接缝集合，最终仍按实际 diff 和包要求收口。

```sh
node scripts/machine-slot.mjs run browser --label "T144 targeted" -- node scripts/run-tests.mjs --jobs 1 <已核过的完整文件列表>
```

所有占位列表在获测试窗口后展开，禁止空列表触发全量。上面的命令表示子进程内的工作负载，不授权按当前真实用户环境直接运行：公共 `machine-slot` 先在共享 `TMPDIR` 取得整机槽，再由槽内子进程切换到临时 `TMPDIR`，避免隔离目录分裂公共槽。子进程从环境 allowlist 构造环境，不继承真实凭据；系统 `HOME`、`CFFIXED_USER_HOME`、各 `XDG_*` 目录变量、`TMPDIR` 与 `MOLIS_WORK_HOME` 均指向本次隔离目录，secrets 使用 file backend，首次构建起即设置 `MOLIS_HELPER_SIGNING_IDENTITY=-`。专用浏览器使用 `/Users/yijunwang/.local/bin/molis-test-browser` 与本次独立资料目录，单 jobs、无 retry；绝不读取真实 Molis Work Home、真实用户配置或 Keychain。构建、测试和浏览器批次按整机槽排队；actions:update 等会启动临时 Host 的步骤也占既有窗口并使用同一隔离边界，WAIT 期间不执行。此片触及 contracts/SDK/Host 装配，Full 是必要的后续统筹整合证据，本线不私跑。本地定向通过不能替代 Full/CI。

UI 真实预览需验证明暗、窄宽状态与截断长文本；跑资源检查前按仓库要求 workspace:build，与冻结 main 的实际资源对比。优先复用现有样式，不新增 asset；新增资源或单资源增长超过 10 KB 交用户决定，小增长按既有审批机制准备实测理由。未测量前不预先申请体积额度。

推送/PR/发布不是本轮授权。后续明确获准推送时再 fetch main、核差异、跑 secrets:check 与要求门禁；版本快照/动作引用删除同一提交完成，不留旧 @3 兼容口。

## 本轮交付状态

只有本 PLAN.md 已修订，原 REVIEW.md 未改。工程测试、真实签名包实操、真实 AI 体验、修订后二审、CI/Full 和一骏验收未运行。T144 仍 WAIT；根已采纳的两项语义和原二审 A–D 均在同一工程书落实，交原二审只核必修接缝，不再换大方案。T143 未采纳前不开始实施；也不把未合的 T141/T145/BL916 当作其前提。

## accepted §7 精确候选 diff（未应用）

基于原二审核读树 `86570ac4499871f46c52762f73a1cd91f68ccc20` 的 `specs/repository-anti-corruption/slices/pg011-pg017-remaining.md`。只改 §7，保留 §1/D5/D6/R1 与既有 RAC-2636～2643、S-105；本段为根采纳准备，仓库原文未写。§1 的概括按 §7 的明确展开理解：运行派生不含重复 agent.skills，wire 与 effective 各按自己的形状校验。

```diff
--- a/specs/repository-anti-corruption/slices/pg011-pg017-remaining.md
+++ b/specs/repository-anti-corruption/slices/pg011-pg017-remaining.md
@@ -385,22 +385,27 @@
   - 正文是包里的资源文件（包格式的文件名单多一个目录，例如 `agent/`，每条一个文件），Manifest 的块只用包内相对路径引用它；这与合同「正文在包里，不在 Manifest」一致，也不算 D6 被拒的「另加单独的声明文件」，不用再问用户；
   - 条数与字数上限照 `prompts.json` 的口径（至多 64 条、每条 8000 字），在开发单里定；路径必须在包内、不许越界。
 - **`agent` 与 `methods` 两块都只收 `{ name, purpose, body }`**（三审建议 L，统筹采纳）：`body` 是包内资源文件的相对路径。它们是简化形状，**不是** `AgentManifest` 的子集，所以包里写不了任何带权限的字段：`execution`、`host_tools`、`subagents`、`mcp`、`characters`、`text_sources`、`directory_input_port`（`agent` 一侧），`tools`（`AgentSkillDeclaration.tools`，`plugin-agent.ts` 第 126～132 行，`methods` 一侧），多出名字、用途、正文引用以外的任何键都以明确的错误码拒绝，这就是 D5 的「不加权限」。
-- **宿主怎样派生合同里的形状**：读包时先把这两块取出来，各自校验（路径、条数、字数），由宿主派生成 `AgentManifest` 的 `roles`、`prompts` 与 `skills`；`role_id`、`skill_id` 由 `plugin_id` 加名字派生，`version` 取包的版本，`name` 取包给的名字，`summary` 取用途，`workspace` 固定为 `none`（纯推理角色，不需要授权目录，`plugin-agent.ts` 第 39～41 行），`tools` 固定为空数组，`host_tools`、`execution` 等一律不写；派生的 `agent`、`methods` 放进 `sandboxPluginManifest` 重建，再整份过 `parsePluginManifest`，最后与包里的清单比较（第 1 节）。这样一个只读、不带工具的角色是否还有用，T-144 开工第一步核，没用就只许 `methods`，回统筹。
-- 安装预览逐条列出名字与正文前 N 字（N 在开发单里定）。`plugins.install.preview` 升到 `@4`，加顶层可选字段（第 1 节）。
+- **宿主派生的形状与真实用法**：`agent`、`methods` 各收 `{ name, purpose, body }` 的可选数组，合计至多 64 条；`body` 引用包内资源，正文至多 8000 个 UTF-16 单元。宿主派生角色的 `roles`、`prompts` 与顶层 `methods`，不复制到 `agent.skills`、`agent_skills`；`workspace` 固定为 `none`，顶层方法 `tools` 固定为空数组，`host_tools`、`execution` 等一律不写。角色资料和方法都以有来源材料供消费者选择、读取，UI 区分两种 kind；携带角色正文不获得 Agent 执行入口、不增加 `agent:run`、目录、MCP 或子 Agent 权限。角色不能只登记而没有实际取材路径。
+- **正文的精确版本**：完整包 SemVer 复用 `AgentDefinitionSource.plugin_version`，与发布者签名身份、`plugin_id`、kind、条目 id 组成默认正文引用，不另建版本字段或版本计数器。派生 Agent 声明里的数字 1 仅为该投影内部占位，不改变公共 Agent 数字版本含义；签名正文的精确读取、覆盖默认更新提示、历史和采用记录均认完整来源引用。角色 prompt 沿用现有人的覆盖，实际正文标 `effective` 与 `user_revision`，不把人的改文称为发布者签名原文；顶层方法不新增编辑功能。
+- **派生 id 与校验**：同一 SDK 函数以 `plugin_id`、kind、完整 name 的确定编码做完整 SHA-256，保留原名称作显示，既不截短名称也不截短摘要；不同 plugin/kind 的同名不得混用。对外引用必须满足现有 200 长度的消费合同，名字与用途按 UTF-16 单元限 80/300。原 wire Manifest 与签名文件保持原样验证，完整运行 Manifest 由宿主派生后校验，两种形状不直接作整份相等比较。
+- **登记与恢复**：旧 prompts.json 指令、新角色和顶层方法由同一个完整 registration 组装函数提供，执行器及 Home/项目安装启停回调使用同一安装 scope，回调不能再以仅 prompts 的登记覆盖它。覆盖/history/uses 的签名默认来源引用由既有 AgentDefinitions owner 持久保存；重启继续使用当前来源和人的有效修订，不另建正文目录或身份账本。
+- 安装预览逐条列出 kind、名字与正文前 200 个 Unicode 码点；`plugins.install.preview` 升到 `@4`，加顶层可选 `agent_bodies`。升级按全文比较并标新增、变化、移除，不能因开头相同漏报正文变化。
 - 正文按提示注入面处理，对照 `docs/system/SECURITY-INVARIANTS.md` 里提示注入的几行：
-  - 只作数据进别的 Agent 的上下文，带来源标记（哪个插件、哪个版本、哪个发布者）；
+  - 名字、用途、目录摘要和正文都只作带固定不可信声明的 JSON 数据进入消费者上下文，保留真实插件、完整版本、发布者及有效用户修订，不进入系统提示或工具定义；
   - 不升级权限：Agent 用这段正文时，调用的仍是它自己被授权的动作；
-  - 升级后正文换了，预览里要能看出来。
+  - 读取按当前工作范围关联实际安装/世代与签名来源，旧引用失效就拒绝，不悄悄换最新正文；send 到实际 handoff、运行中 input deliver、按需工具读取的最后副作用检查各复核本次来源；失效后不新增正文交付或采用成功记录；
+  - 已有效交付的资料保留为该轮历史，不声称能从模型撤回，不因源插件撤销新增跨插件整轮取消；新读取、新注入再核当前来源；
+  - 升级后正文换了，预览里要能看出来；项目升级按已有链验证，Home 就地升级不借用未采纳的 T-141。
 - 删掉 NOT_GIVEN 的 `agent` 一行。
 - 可检验：
-  - RAC-2636：名单内的 `agent`、`methods`（`{ name, purpose, body }`）能装，宿主派生出合同形状（不是拒绝）；
+  - RAC-2636：名单内的 `agent`、`methods` 能装且可实际取材，混合旧 prompts.json 的包在全部安装/启停回调、重启及失败恢复后仍保有完整登记；最大长度中文/代理对名称能列出、选择和读取，同名跨 kind/plugin 不混用（不是拒绝）；
   - RAC-2637：名单外的键**每个一例**被拒：`agent` 一侧的 `execution`、`host_tools`、`subagents`、`mcp`、`characters`、`text_sources`、`directory_input_port`，`methods` 一侧的 `tools`；
   - RAC-2638：正文引用不是包内相对路径（绝对路径、`..`、缺文件）被拒；
   - RAC-2639：超过条数或字数上限的包被拒；
   - RAC-2640：预览列出每一条的名字与正文开头（不是拒绝）；
-  - RAC-2641：正文进上下文时带来源标记（不是拒绝）；
-  - RAC-2642：正文里写「调用某某动作」不会让 Agent 多一项授权（断言拒绝）；
-  - RAC-2643：包升级后正文换了，预览里能看出来（不是拒绝）。
+  - RAC-2641：显式选择和按需读取的实际模型输入都有完整签名来源，角色人的覆盖带 effective/user_revision，名字、用途与正文均在数据中，伪标记不能逃出字符串（不是拒绝）；
+  - RAC-2642：正文要求未授权动作/目录访问仍被代码拒绝；已读正文但尚未实际 handoff、input deliver 和工具最后检查时取消/停用/撤销/换安装，均不交付迟到正文、不记无效采用或执行副作用；有效交付后的历史保留，不新增整轮取消；
+  - RAC-2643：包升级后包括第 200 字以后的变化也可在预览辨认；确认前仍旧正文，失败恢复不泄漏新正文；完整包版本 1.1.0→1.2.0 的角色覆盖/history/default_updated/reset/uses 经重启保持准确，旧引用不自动换版（不是拒绝）。

 ### 选项与推荐（正文怎样给，D5 定①）

```

## 交原二审的单轮核对范围

只核 REVIEW A–D 是否闭合：完整登记未被回调覆盖；签名默认来源与人的 effective/user_revision 在既有覆盖/history/uses/读口贯通；send/实际 handoff、input deliver、工具末端复查及有效历史边界；稳定摘要与消费长度、中文代理对/同名区分正例。两个语义按根已裁定方向，不再另换大方案。仍 WAIT T143 采用/共享锁，无实施或测试授权。待根将本修订交原二审，本文不把“已交审/已通过”写成事实。
