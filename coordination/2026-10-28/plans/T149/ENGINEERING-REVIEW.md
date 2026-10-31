# T149 + BL-589 工程方案独立评审

**结论：总体方向成立，可保留为 WAIT 工程书；三处必须补清：effects 唯一算法漏了真实发布调用者、异步发布提交没有绑定草稿/授权、Home 目标不能沿用项目范围验收。** 不需要重选 unsigned、重做 BL377、迁移旧项目身份或新增通用签名/任务/恢复框架。修订落在同一 ENGINEERING.md；以下建议可以直接采用，无新增产品决定。

依据：本目录 ENGINEERING.md / PLAN.md；现行 accepted `pg011-pg017-remaining.md` §4/D2 甲；`/private/tmp/t141-author-plan/PLAN.md` 与 `/private/tmp/t143-resume-plan/PLAN.md` 的实际接缝约束。代码只读绑定本轮本地 `origin/main=a1117b3bada22b064a5df2e88f21d1a5ee6aab4f`，不把本地 ref 当远端最新证明；所核发布、SecretStore、SDK/展示常量、CLI、Home 安装与清单文件相对方案基点 b0567bf5 无相关差异。未 fetch、改 refs、实现、构建/测试、用模型或凭据、访问真实 Home/4207/Keychain，未写 GitHub/协调仓/保护分支。本报告不将现存测试或任务书当本轮执行证据。

## 1. 必修：effects 的唯一 owner 还漏了创作台自己的算法

ENGINEERING §2 说 `effectsFromContract` 是当前唯一算法，直接消费者清单完整；实际还有 `plugins/native/plugin-builder/src/agent-validation.ts:7–13` 的 `contractEffects`，独立循环合并、去重和排序。`agent-workflow.ts:351、740` 正是用它生成 build/release 的 BuildManifest.effects。只迁 plugin-sandbox 的函数，会让作者打包与 Host 用 SDK 算法，真实创作台发布仍跑另一份。

最小修订：把 `agent-validation.ts` 和 `agent-workflow.ts` 这两个直接调用点纳入范围，删除这份重复循环，workflow 用 SDK 的 `effectsFromContract(design.contract)`；不留旧 wrapper/re-export，也不迁其余设计校验。SDK 函数仍只依赖 contracts，`assertContract` 与界面校验留原 owner。独立固定期望须检查**真实 workflow 所产的 BuildManifest.effects**与签名包所用效果集合，去重例使用不同操作间重复的合法 effects，不靠三次调用同函数互比自证。

展示标识的方案本身可采纳：`ui.plugin-presentation@1` 是 Host 对 renderer 能力的合同标识，放现有 `contracts/platform/ui`、删除 design-system 旧定义/出口，Host 与 SDK 直接取同一常量；设计系统的布局/组件/渲染不迁。两种 sandbox Manifest 和 ui contribution 的算法一起搬、删除 Host 旧出口，也是正确的最小边界。

## 2. 必修：把发布的“冻结”和 CAS 变成真正的提交条件，并补中断后的重试

现有 `agent-workflow.ts:703` 只在入口核 revision/active，`:736–742` 在 `await ports.publish(...)` 后直接 `store.release(release)`。`agent-store.ts:26` 的 release 只重新读取存储、检查同 build/version 尚不存在，再写一次 CAS；**不检查 build 还存在、revision 没变、仍 ready、scope/检查结果没变**。所以等待文件/签名时另一请求 revise/remove，原发布仍可写入过时甚至已删除草稿的发行物。现有 `agent-surface.ts:279` 也只在进入 workflow 前 `pageAuthority.assertCurrent()`，没有把持续授权交到发布过程。新增签名与分发提交不能沿这条入口检查就宣称迟到写受控。

最小修订直接写进 §3 发布顺序与 PUB-1：

- 发布捕获可信项目/build 身份、预期 build revision、目标 scope、发布版本及对应通过检查的候选；将现有执行控制/页面 authority 传给窄发布端口。新 key 持久化、文件正式提交、release 事实提交前分别复核当前授权/关闭状态；异步等待后再次检查。不要从请求 body 接 actor、项目身份或私钥引用。
- `AgentBuilderStore.release` 在同一次读取/CAS 中核对该 build 的预期 revision、存在性、发布资格、范围固定规则与版本唯一性。仅在调用前单独 `store.require` 一次不够。使用现有 store/单宿主控制，不新增持久 job 表或分布式锁。
- 本次文件在独占暂存位置完成并自验，正式目录不得覆盖既有版本。补清**文件正式提交成功、release CAS 前进程中断**的下一次显式发布行为：按 release owner 的事实检查该目录是否被引用；有引用不动，无引用也不能盲目覆盖/当成功。核清本次未发布产物后清理或安全接续，并保证一次失败不会永久占住 `vN` 导致所有重试失败。不能只写“结果不明就读 release”，读到没有行后仍须有明确出口。

必需 oracle 是两个真实交错：① 发布停在 await，另一请求修改/删除草稿或使调用失效，释放后不新增 stale release/已失效签名发布，已合法存在的 Home key/旧版本不被误删；② 正式文件提交与事实 CAS 间中断，再次明确发布能得到一份完整可验且只登记一次的发行物，胜者和其他版本不受影响。原两个并发同版本发布用例继续保留。这是对既有“冻结/失败可恢复”承诺的补全，不扩大成全创作台并发治理。

## 3. 必修：Home 发布范围要进入实际检查，不能只在最终 Manifest 上换 scope

工程书在发布处第一次选择 Home，然后把已有 `checks.global.passed`、`browserResult.passed` 当作其来源。当前这些结果全是项目范围：

- `studio-ports.ts:32–43、65–67` 的 catalog/missingPlugins/开发能力来自当前项目。
- 同文件 `:87–89` 的检查身份是 `projectId: options.projectId`。
- `studio-preview.ts:62–69、85–86` 的试用能力取项目 installed context，runner 身份也带项目。
- 真 Home 安装则由 `home-installed-plugins.ts:62、86–89、123–126` 固定 `project_id/projectId=null`，目录只有 Home 能力。

例子：草稿使用当前项目独有的一个 action，项目替身和浏览器验收通过；发布时仅给清单加 `runtime.scope=home`，签名/读包可能通过，但 Home 真调用没有那个项目能力。T145 也尚未给它访问项目的权利。`readKeptSandboxPackage` 负责包形状，不证明这些业务依赖在目标范围可执行。

最小修订：**目标范围应成为该 build 检查输入的一部分。** 可以保留现有发布处的范围选择，但第一次改选 Home 时必须使原项目范围通过状态不再充当 Home 通过状态，在同一现有检查/试用流程按 Home 目录和无项目身份重新校验必要部分，之后才提交 Home release。也可在首次构建前选择范围；不要求新增第二套生成器或 UI 流程。

Host 从可信 Home context 给目录与能力，不把用户给的 project_id 填进 Home preview，不启用项目插件来“满足”Home 缺依赖。当前支持不了的声明/服务明确拒绝或回到原草稿修改，不能签成“已验收的 Home 发布”；T143/T144 已采用能力按其真实服务合同接入，BL916/T145 未采用能力不提前开放。发布自验还应调用既有 Home admission 所需的校验，不能把签名/固定与 admission 当同一件事。检查/试用只是验证，不替人 pin 或安装。

在 UI-1/RAC2657 现有正面外补一个决定性的负例即可：项目范围可用、Home 不提供的 capability，在切换 Home 后不能复用旧绿通过发布，且真实 Home 调用的可信 project_id 始终为 null；纯私有存储 Home 样本仍可正常发布、本人安装和运行。无需扩大为所有 Home 服务矩阵，也不需要真实模型或外部账号。

## 4. 密钥、包映射与 S84：可保留，不需另改产品规则

以下已符合 accepted，本轮不增加修订项：

- release `manifest.json` 是 BuildManifest；分发包单独用 SDK 生成 PluginManifest，`payload.manifest` 与其文件一致。原 release 语义和 packagePath 不变，signed-package.json 放在分发容器外；不夹 package.json。版本 n.0.0 与实际签名身份先确定再签，T144 如已采用仅带其合法声明正文文件。
- Home 发布私钥由该 Home 的 SecretStore 持有，公共元数据/ref 由 Host 单一 owner 持有；不用项目 secret 前缀。`createIfAbsent` 已提供原子不覆盖，创建后回读胜者、核公钥指纹；metadata 存在而密钥丢失/解不开时拒绝，绝不自动换身份。注意 `SecretStore.get` 在条目解密失败时也可能返回 null（file-secret-store.ts:347–364、607–611），而 `createIfAbsent` 对存在但损坏的条目仍返回 false（621–625）：实现必须兑现书中的“复读失败即拒绝”，不可把 null 当首次创建后继续签名；不需要为此扩 SecretStore API。
- Home purge 通过 home-stores 注册项清该 Home 的元数据与 feed 密文；普通卸载、删除项目和卸载某个插件都不删 Home key。Keychain 的 install-master-key 是共享加密主密钥，不是新发布者私钥；不能删除或覆盖。现有 purge 不需要新增 Keychain 删除入口。备份可恢复同一身份，不把第二 Home 的独立初始化测试改成克隆身份测试。
- 已有 agent-built 项目的身份、安装 ID、数据和原生命周期不迁。签名包撞到同 id 旧发布者应由原安装链拒绝，不自动卸载/pin/建别名；旧 build 不直接改 Home 范围。新 Home 发布仅走公开签名包安装，本人下载再导入是可用的最小完整动线。
- 未固定签名包可 preview；缺 pin_label 的首次 confirm 才拒 publisher_untrusted。首次本人 label+consent 可同次 pin+install，后续仍需确认；A 的 pin 不自动转到 B。确认后启动失败可能已留下 pin/保存包，方案没有虚构跨 owner 总回滚。RAC2656～2658 的原 oracle 足够，保留真实公开链与持久结果。

## 5. 仍 WAIT 的真实前置与交付边界

先把上面三处并回同一工程书及允许路径/测试清单。T141 的真实 Home app/source 升级与恢复语义、T143 的最终签名包/模型声明和已采用 builder 输入必须绑定根选定准确基点；T144 是否先采用由根串行排期，采用了就迁其最终声明/正文规则，未采用不在本片抢做。BL916 和 T145 未实现部分不因本次签包而自动可用。

SDK index、清单算法、Home/创作台发布与其他共享文件的实际锁，保护 #1101 等隔离，以及单 writer/构建与测试时段仍由根 fresh 核定。没有 BL377 全体前置，也没有必须使用真实模型/真实凭据的前置；固定合成 build 经生产发布与签名安装足以验证本管道，不能拿它结 W4-01 的真实生成 corpus。

没有发现必须重新问用户的产品选择。正式实现仍按共享 SDK/合同、信任与持久身份范围 full=true，由根安排准确头独立审验与 CI；本报告没有解除 WAIT，也没有执行或签任何实现验收。

— Codex，T149 + BL-589 独立工程评审，2026-10-31
