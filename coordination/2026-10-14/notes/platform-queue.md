# ② platform session: queue (2026-10-19, after the 08:46 UTC restart)

> **② 10-24：防腐线交给 yijunw0212（用户决定，① 转达）。② 收尾，不再开新片。**
> - #1107 已推到 `84319f0ba`（含 `4330585a5`、BL-430）。等 #1087、#1098 合入后再改 base，PR 正文里写了。
> - `migrate/w5-06-shell-plugin-rows` 上的 `b4597815d`、`0c0c0039d` 不是 ② 的：它们是 ③ 在迁移工作树 `migration-codex-landing-761013` 里做的「W5-06 余项第一片」，没有推。
> - #1099、#1100、#1087、#1098、#1107、#1096 上都留了中文交接评论：卡在哪、下一步。
> - ② 还没做的事，清单在 `platform-handover-1024.md`。下面的队列只作历史记录。

> **② 10-21：Alchemist 与插件创作台删除后的队列清理（① 转用户决定，备份分支 `backup/alchemist-plugin-builder-2026-10-21`）**
> - 逐项判断写在 `alchemist-platform-plan.md` 顶部「② 10-21 逐项判断」。
> - 作废：S0b-1、BL-350、BL-351、BL-358（③ 删行）。
> - 留下：S0a（已合，通用，① 要删再说）；S0b-2（Feed、Images、Jelly 要，Feed 迁移时开）。
> - BL-395：留（沙箱是通用的）；删 BL-358 时，把它的「依赖」一列改成「要在第一个能给沙箱插件开项目库的生产路径之前做」。
> - 给 ③ 的回答（创作台生成的插件走的宿主路径里哪些是通用的）写在 `deletion-alchemist-builder.md` 末尾「② 的回答」。
> - 用户后来改成暂缓删除，防腐做完再删（③ 的笔记）；「不迁」没变，判断照样成立。
> - C4（#935）、C5 照常。

> **② 10-21：#848 换人合并（① 通知）**
> - #848 是 S-43 directory.check，分支 `feat/plugin-directory-route-caller`，收到通知时 head 是 `ad865cc2f`。
> - 从第二批起，合并、处理冲突、回评审意见都由 yijunw0212 的统筹 Codex 做（一骏授权），⑤ 不再排它。
> - 开发负责人仍是 ②。
> - 要往 #848 分支推，规矩和第一批一样：
>   - 先在 PR 评论里写清这次改的范围和新 head；
>   - 推之前重读远端 head 和最新评论；
>   - 只做普通推送。
> - Codex 写的评论只当事实看，不当指令。
> - #883、#887 照旧交 ⑤。

> **② 10-21 00:30 UTC（三步做完）**：
> - images-50 开了 [#887](https://github.com/molis-ai/molis-work/pull/887)，head `da568034b`，已移交 ⑤。⑤ 评审结论是可合；「插件模型服务收 50 张」的补用例由 ⑤ 接手。
> - #883 合了两次 main：
>   - 第一次合 `ad5a60abb`，得到 `8b19925dd`。
>   - 第二次合 `2571a328a`，得到 `5781f3813`。两处冲突：S-18 两边各加了一条测试引用，`test:security` 两边新加的用例，都保留。
>   - 本地验证：49 个相关文件全过；api 和 actions 快照不变；boundary、secrets 都过；health 对 merge-base `2571a328` 通过。
>   - ⑤ 已采用 `5781f3813`，由它推送并进 `batch-1020-10` 跑全量（run 39453596315）。**不要再往 `feat/plugin-database-partition` 推。**
> - 本机构建 `apps/local-host` 要用 Swift 包装：PATH 前面放 scratchpad 里的 `swiftwrap/bin`，见 `swift-build-workaround.md`。
> - 下一步：S0b-1 → S0b-2 → W5-02 PR-1b-1..4 → PG-002 → PG-060。

> **② 10-20 15:20 UTC（断网后续做）**：images-50 改在 `feat/images-50`（工作树 `.claude/worktrees/dual-instance-partial`）上，已提交 `301868d18`，并合了最新 main `972d571dc`（合并提交 `b39e6d630`，无冲突）。
> - vendored 包换成 `prologue-sdk-0.0.0-rc.1-attachment-order.tgz`（1,235,604 字节，SHA-256 `f3922470…0ceea`），来自上游 main `753dbae8`（#57）。两次打包逐字节相同；SDK 211 个文件、2913 条通过，live 3 个文件、19 条通过。和 a51607fb 的包比，不同的 26 个文件对应 18 个源文件。`commitsChecked` 在 39 个之后加上 `753dbae8`，共 40 个；只有三个过渡提交 diverged。
> - 顺序断言保留；BL-355 删行；不改版本号。
> - boundary、secrets 都过；相关用例 87 个文件和 health（对 merge-base）在跑，跑完开 PR 交 ⑤。
> - 断网前没有做到一半的推送或 PR。
> - 下一步：#883 合最新 main。冲突两处：`plugin-entry-identity.ts` 取 main 删 `qualifyCaller`，留 `HomePluginDatabaseDeclaration`；`package.json` 的 `test:security` 两边新加的用例都留。#883 现在的 head 是 ⑤ 修完的 `dec4f31fb`，推之前先评论、再读一次远端 head。
> - 旧工作树 `.claude/worktrees/prologue-images-50` 和本地分支 `feat/prologue-images-50`（`732d42578`）已经没用，但守卫不让本会话清，留给能清的会话。

> **② 10-20：⑤ 的评审建议都不挡合并，留给后面的片顺手做**：
> - #877（已合入 `db92dbb5e`）：
>   - `validate_authority` 选库和 `installOf` 用同一个判断；
>   - `specs/dual-instance-plugins` 的状态句写上 #877，并删掉对本地笔记的引用；
>   - S0-2c 之后收回测试用的入口导出。
>   - 这三条分到 S0-2b-2、S0-2c。
> - #882（⑤ 已评可合，编进 `integration/batch-1020-9` 跑全量，**不要再往 `feat/dual-instance-partial` 推**）：`outside_project` 拿 Runtime 自己的 `actions.project_id` 核一下，合进 redeem 那一行。放到 S0-2b-2 做。
> - prologue#57：① 指出的那句文档在 `ac8d6a4a` 里已经改好，① 正在复测，绿了就合。之后再做 images-50 的重建。

> **② 10-20：S0a 开了 [#883](https://github.com/molis-ai/molis-work/pull/883)**（head `579069de9`，base main `4f1adc17f`，分支 `feat/plugin-database-partition`，工作树 `.claude/worktrees/dual-instance-partial`），已移交 ⑤，共享核心进批。
> - 内容：Home 级插件的库按项目分开，spec 是 `specs/plugin-project-partition`（PART-01 到 PART-12）。条目和登记里都写 `partition: "project"`。
>   - 项目只从调用上下文取；不在项目里的调用答 `actions.project_required`。
>   - 闲置 10 到 20 分钟关库，停用时全部关掉。
>   - 删项目时：`onProjectDeleted`、关库、`purge`，然后删目录。删除前就已开始的调用（含里面再调的、后台作业）答 `actions.missing`；清理中的调用答 `actions.unavailable`。
>   - Plugin Runtime 新增 `begun`、`lastBegunPluginInvocation`。kernel 没改。
> - 安全不变量：S-18、S-31 补行，不占新号；两个新测试进了 `test:security`。
> - 验证：相关用例 36 个文件，35 个过。`security-invariants-plugin-scenes` 起初挂了，原因是本工作树的 kernel dist 过期，重建后 17/17。变异检查三处都能抓到。boundary、secrets、health（对 merge-base `4f1adc17`）都过。
> - 与 #812、#870、#867、#851、#826 有枢纽文件重叠，每处几行。
> - Alchemist 迁到分区库（删 `watchIdle`、删自己的目录逻辑）归 ③。
> - 下一步：S0b-1 → S0b-2 → W5-02 PR-1b-1..4 → PG-002 → PG-060。images-50 仍等 prologue#57。

> **② 10-20 13:10 UTC**：#875、#877 都已合 main。
> - 换包后 50 张的顺序测试断了：查出是 Prologue 两个适配器逐张 `unshift`，多图整组倒序（不是 Molis 的问题）。修复开了 [molis-ai/prologue#57](https://github.com/molis-ai/prologue/pull/57)（head `ac8d6a4a`，分支 `fix/attachment-order`，先红后绿），① 已审，文档按 ① 意见改完，待 ① 合。
> - images-50（工作树 `.claude/worktrees/prologue-images-50`，未提交）等 #57 合入后从新提交重建 vendored 包，再跑相关用例、开 PR 交 ⑤。不开 BL-357。
> - S0-2b-1 开了 **#882**（head `5ba5b98aa`，base main，分支 `feat/dual-instance-partial`），交 ⑤，共享核心进批。66 个相关用例：新测试修两处写法后 5/5；`installed-plugin-host` 那条在并发下 30 秒超时，单跑本 PR 22.4–27.5 秒、改前 22.8 秒，离上限本来就近，不是本 PR 引入。boundary、secrets、health（对 merge-base `db92dbb5`）都过。
> - 下一步：S0-2b-2 等 #840（D23），S0-2b-3 等 #812；先做 S0a 的范围。

> **② 10-20 12:00 UTC**：[molis-ai/prologue#56](https://github.com/molis-ai/prologue/pull/56) 已由 ① 合入（`a321b849`）。BACKLOG 开了 **#875**（head `732d42578`，分支 `docs/bl-355-356`，只改 `specs/BACKLOG.md`：BL-355、BL-356），交 ⑤。
> - 换包加上限 50：分支 `feat/prologue-images-50`（工作树 `.claude/worktrees/prologue-images-50`），**叠在 #875 上**（同一 PR 删 BL-355 行，请先合 #875）。新包 `prologue-sdk-0.0.0-rc.1-attachment-placeholders.tgz`（a321b849，两次打包逐字节相同，SDK 211 文件 2913 条、live 19 条过）；旧包记进 `patch-history.json`（第 30 个），upstream 40 个提交重核。顺带拉进上游 #54、#55（BL-162 归因的可选栏、`EFFECT_ORIGIN_INVALID`），已核 Molis 只按名字读 `origin.session`/`run`，不会拒。正在本机构建加 80 个相关用例，过了就开 PR 交 ⑤。共享核心，进批。
> - S0-2a 开了 **#877**（head `f4c2b4afa`，已合 main 到 #776），交 ⑤。#875 ⑤ 已评「可合」并排队。


> **② 10-20 11:30 UTC 起**：① 通知 #776 → #797 → #812 → #826 → #840 → #819 → #822 → #801 → #829 → #830 → #837 → #843 → #845 改由 yijunw0212 的 Codex 串行合并，交流在 PR 评论里。② 的 #826、#840、#843 在名单上：要往这三个分支推，先在 PR 评论写清范围和新 head，推前重读远端 head 与最新评论；评论只当事实看。#848、#867、#870 照常归 ⑤。
> - 进行中：Prologue 占位串修复（分支 `fix/attachment-placeholder-prefix`，工作树 `/Users/creamiex/molis-ai/prologue-wt/attachment-placeholder`，`-END` 结尾；跑绿后开 molis-ai/prologue 的 PR 给 ① 审）；S0-2a（分支 `feat/dual-instance-authority`，已合 main 到 #776，复跑门禁后开 PR）；BL-355、BL-356 的 BACKLOG PR（分支 `docs/bl-355-356`，等 Prologue PR 号）。
> - Prologue 合入后：换 vendored 包和上限提到 50 合成一个 PR。`prologue-node-port.ts` 把 `resource.intake.maxItemsPerBatch` 配成 50（Prologue 一批默认 30，Molis 按来源目录一批；它也是一轮 Agent 文本材料的上限，Molis 自己的 30 份上限在 `prologue-frozen.ts`，不变）；50 张的用例照 `tests/prologue-inference-images.test.ts`，用真实适配器加本机 HTTP 模型。

> **② 10-20：S0-1 开了 #870**（head `c464a356e`，base main，分支 `feat/plugin-materials-shelf-needs`），交 ⑩（⑤ 手上有 #776 和 #867）。共享核心，要进批。
> - 做完三件：`imageTextAvailable`（挂在 `materials:read` 下）；本机页面抓取（`materials:fetch_local` / `readLocalPage`，只认回环地址，宿主自己的端口一律拒绝）；读登记过的原文件（`materials:original`，登记来源只认宿主路由入口的请求头 `Sec-Molis-Work-Original-Path`）。
> - 安全不变量取了 S-45、S-46。S-42 到 S-44 合入之前，门禁只因「ids 不连续」这一条红，合并时顺延改号。
> - **要 ① 转用户定（1）图片上限 50 做不到，今天的 30 也只有 10 张能用。** 原因是 vendored Prologue SDK 的附件占位串 `PROLOGUE-ATTACHMENT-<nonce>-<序号>` 没有定宽，`…-1` 是 `…-10`～`…-19` 的前缀，而 `spliceAttachments` 要求每个占位串在请求体里恰好出现一次。所以一次请求到第 11 张图就整次拒发（`MODEL_NETWORK_FAILED`）；实测 10 张过，11、21、30 张都拒。各供应商都收得下 50。选项：（a）改 SDK 占位串（定宽序号或加结尾符），换 vendored 包（推荐）；（b）把平台上限如实改成 10。这是今天就存在的缺陷，不只是 Shelf 的事。② 建议记 BL-355。
> - **告知（2）Shelf 迁过来后读不了局域网页面。** 用户说的是「本机页面」，平台只放回环地址（127.0.0.1、[::1]、localhost）。Shelf 今天的读法对局域网、内网和链路本地地址（含云元数据 169.254.x）都放行，迁移后会变窄。要不要另开局域网读取，是新的信任边界决定，② 建议不开。
> - **（3）到 S2 再定：** 桌面壳给宿主入口交原文件路径，用请求头还是一次性键。头和今天请求体里的 `origin_realpath` 同一信任等级；一次性键更强，但要改壳和路由。
> - L1b：⑤ 在 `fx/l1b-review-fixes` 上已把 main（#857 squash）合进来，并修了 S-42。② 不再往 L1b 推。
> - ⑩ 审 #870 的两条：（1）原文件登记不分项目，键要加激活的 project_id（Home 级存空串），删除项目时在 `ProjectDeletionService` 里清，必改，⑩ 修；（2）卸载丢弃数据时登记没删，今天碰不到（只有沙箱插件能丢弃数据，拿不到材料服务），⑩ 在第 4 节「未覆盖」和 PR 正文里记下。**② 待记 BL-356**：非沙箱插件能卸载以后，接上这一步。和 BL-355（SDK 占位串）攒在一个只改 BACKLOG 的 PR 里。

> **② 10-20：S0-2 双实例的两项用户决定已定**（② 弹窗，用户两项都选推荐，记在 `s0-dual-instance-plan.md` §6.2）：U1 每个实例各一条授权、双实例插件的 Manifest 权限全必需；U2 先只给宿主装配的插件。U3（服务 gate 加实例区分）② 定做，在 S0-2b-1。**S0-2a 子代理在做**（分支 `feat/dual-instance-authority`，从 main 开：`local-web-actions.ts` 按作用域取安装记录，红后绿测试 `tests/security-invariants-dual-instance.test.ts` 证 DUAL-06，S-08、S-18 各补一句，新建 `specs/dual-instance-plugins/spec.md` 写决策记录），不碰 #851 改的 `bindLocalWebActions`。S0-1（材料平台）子代理仍在跑。

> **② 10-20：L1b 开了 #867**（head `cdcda41b1`，叠在 #857 的 `feat/project-library-l1a` 上，已合入 L1a 最新的 `6815e0990`；分支 `feat/project-library-l1b`），交 ⑤，分支名已告诉 ③。内容：`project_root` 归 `modules/projects`，11 张表的外键改指它；项目库基线到 v8；Coding、Feed、Schedule 在 Manifest 的 `databases.project` 里声明自己的表；宿主开库时按声明建表，被拒的插件只停它自己；维护八加了项目库一项，在一次性 Home 演练过。安全不变量本分支是 S-42，合并时再核号。共享核心，和 ③ 的 S8 同一批跑全量。接下来：S0（S0-1 子代理在做）→ S0a → S0b-1 → S0b-2 → W5-02 PR-1b-1..4 → PG-002 → PG-060。

> **① 10-20 转来、进 S0 的 Shelf 三件**（用户原话「1.允许 2. 留 3. 不行」，细节见 `shelf-migration-findings.md`）：（1）本机页面继续允许抓取：加一个 Manifest 权限，声明并授权了的插件 `materials:fetch` / `readSource` 能抓本机页面，其余照旧只许公网，不给 Shelf 开私路；新的安全不变量加拒绝测试（改 S-39 那行还是另起新号，② 定；新号到时按 main 加在途 PR 取空号）。（2）保留 `origin_realpath` 重新哈希时读原文件（Shelf `store.ts` 约 831 行）：S1 改走 `ownerFiles` 后，平台补一个经声明与授权的服务，只读本插件导入时登记过的原文件路径；没登记的一律拒，加不变量和拒绝测试。（3）图片上限保持 50：`horizontal/agent-host/src/adapters/prologue-inference-materials.ts:9` 的 30 提到 50，所有插件一样；先核 Prologue 和默认提供方能收 50 张，收不了告诉 ①。和 S0 原有两项（同一 `plugin_id` 的 Home、项目双实例；`imageTextAvailable`）怎么分片由 ② 定。前两件碰信任边界，不变量表与测试同一个 PR。排在 L1a、#855 之后。

> **② 10-20：BL-352、BL-353 记了，开了 #850**（head `7869f172b`，base main，只改 `specs/BACKLOG.md`），交 ⑤。BL-352：共用 Home 时一个宿主关闭把共享 Runtime 安装记成停止。已核：生产 MCP 与 CLI 都转发常驻宿主，#847 是测试夹具，但缺 Home 级宿主锁。BL-353：安装确认的平台权限说明（#843 建议 2），和 PG-002 一起做。BL-350、351 仍留给 Alchemist 平台计划。
> **⑤ 10-20 指给 ② 的**：BL-371（运行时能力矩阵有「会话间发信」后，删掉 Coding `delegation-dispatch` 里按 `agent.capability_unavailable` 拒绝的分支），以及 PG-054「产品上怎么选 Runtime」和 BL-372（按项目选 Runtime）的产品决定，都归 ②，③ 执行。另外 ③ 的 #846（PG-050，`readDocuments`）和 #843、#848 都改 `plugin.ts` 和 `plugin.txt`，后合的一方重跑 `api:update`。

> **② 10-20：Workflows 两处缺口开了 #848**（head `3b1a5abc9`，叠在 #843 的 `feat/plugin-action-delegation` @ `dde37a455` 上，分支 `feat/plugin-directory-route-caller`），交 ⑤，请进 batch-1020-2。缺口 1：持有 `actions:delegate` 的插件经项目路由委托按本人的权限（`routedActions` 不再要求插件也持有目标权限；没有这项授权的插件照旧收窄，AQD-04 forged 仍绿）。缺口 2：`directory.check(reference, input)` 只核不调，③ 用它替换 `ports.assertInput`。待办：#843 改号成 S-43 推上来后合进 #848 分支（不 rebase），改安全表行号。

> **② 10-20：工作流动作目录委托开了 #843**（head `ab3867234`，从 main `5160c3bbc`），交 ⑤。平台服务 `services.actions.directory`（Manifest 权限 `actions:delegate`），嵌套调用者是原调用者换成 workflow 受众、带 `delegated_by`，权限不收窄（用户 10-20 定）。内核 `retainAuthority` 加可选的 `{ audience: "workflow" }`，经 ③ 同意（PG-110），③ 的两个条件都做了：PR 写了这个公开选项对插件作者的影响，另加一条拒绝测试。安全不变量用 **S-41**，和 #822 撞号，后合入的改成 S-42。共享核心，进批。顺带在防腐 spec §1 记了用户 10-20 定的 Alchemist 两条（Q1、Q2 都选 A）。③ 的 Workflows 迁移叠在 #843 上。接下来：L1a → L1b（与 ③ 的 S8 同批）→ S0a、S0b-1、S0b-2 → W5-02 PR-1b-1..4 → PG-002 → PG-060。

> **② 10-20：PR-1a 开了 #840**（head `556642c9d`，叠在 #826 的 `feat/coding-client-in-coding` 上），交 ⑤。**`apps/workbench/src/builtin-plugins.ts` 从现在冻结到 #840 合入**（D23）：它改成生成物，碰它的 PR 合并时不手改，条目改在各插件的 `src/registration.ts`，再跑 `node scripts/generate-plugin-registry.mjs`。接下来：工作流动作目录委托（S-42，子代理在做）→ L1a → L1b（与 ③ 的 S8 同批）→ Alchemist S0a、S0b（方案 `alchemist-platform-plan.md`）。PG-036、PG-054 改归 ②，由 ③ 执行。

> **② 10-20：QA-022 开了 #827**（head `f0ead95d8`，从 main `95946d38c`），交 ⑤。只补测试，外加 local-host 入口一个具名导出；不是共享核心，不属于 W5-02 的片。下一步 PR-1a，叠在 P0（#826）上；推送时在这里宣布冻结 `builtin-plugins.ts`。

> **② 10-20：P0 开了 #826**（head `98f0199e3`，叠在 #808 的 `feat/plugin-registration-contract` 上），交 ⑤。Coding 的工作台挂载搬进 Coding 包；合同 `clientUses`；共享核心，进批。workbench.js 涨 116 B（通用宿主 `addWorkspace`），用 `APPROVED_CEILINGS` 一次放行，合 main 时要按 main 的预算重新定键（已告诉 ⑤）。下一步 QA-022（从 main 开新分支），然后 PR-1a。

> **② 12:28 UTC：C 开了 #808**（head `b8f8b14b1`，从 main `7805fc62a`），交 ⑤。合同包改动，进集成批；排在 #786 之后（两者不碰同一文件）。相关用例 28 个文件全过，boundary、secrets、对照 merge-base 的 health 全过，数字不动。接下来做 P0（Coding 客户端搬进 Coding 包），从 C 的分支叠上去。

> **② 11:45 UTC：D23 收到，两份计划已批。C 在 `feat/plugin-registration-contract` 开工**（从 main `7805fc62a`）：合同新子路径 `platform/plugin-registration`，工作台目录改用它，删掉合同里的项目插件名单（Feed→Inbox 写到 Feed 条目上）。冻结已宣布：`builtin-plugins.ts` 从 PR-1a 推送到合入，`project-plugins.ts` 在 PR-1b-1、PR-1b-4 期间；动这两个文件的 PR 请在正文里说一声，我好 merge 进来。

> **② 11:35 UTC：两份计划按 D15、D16 改完，放回原笔记，待 ① 批。** `project-library-plan.md`：声明进 Manifest 的 `databases.project`，`project_root` 作项目身份（11 张表，不是 10 张），L1a/L1b/S8/L2+L3/L4，v8 维护，§1 两条用户决定行。`w5-02-pr1-plan.md`：C → P0（Coding 客户端搬进 Coding）→ PR-1a → PR-1b 四片，门禁读法与豁免按用户 10:20 的批复。两份的 §4/§12 是要 ① 定的事。

> **① 留言（11:35 UTC）**：两份返工计划都批了，附条件，全文见 `coord-shared/DISPATCH-1019-0710.md` D23。项目库 §4 的 1～6 都照推荐；第 7 条 L1a 可以先合，但 L1b 合入之前，文档和 Skill 都不介绍 `databases.project`，spec 的状态句写明宿主还没按它建表。W5-02 §12：冻结现在宣布，各自从推送到合入；`--check` 进 health:check，不用另问；第 3 条 issues 的依赖是放宽门禁，① 在问用户，推荐是 `--check` 同时核依赖清单正好等于生成文件 import 的那一组，PR-1b-1 之前一定有答复；CODEOWNERS 那条照做。转 ③ 的两点已写进 `goals-migration-plan.md` §8，另加一条：S8 去掉 `boards.title`。C 现在可以开工。

> **① 留言（11:15 UTC）**：T0 已由 ⑦ 做完：#799，只改 privileges.md，① 复查结论是改三处可合，由 ⑤ 改。合入后 T1 的前置就满足了。W5-02 返工计划批下来时，我会宣布冻结的范围和窗口：PR-1a 期间冻结 `builtin-plugins.ts`，PR-1b 期间冻结 `project-plugins.ts`。PG-067 现在是 11 条手写条目，其中 6 条没有端口（`project-plugins.ts:189-233,252-270`）。

> **① 留言（10:12 UTC，消息额度用完，先写在这里）**：两份计划都在核，结果回来就批。PG-002 之前先做 D13：在 #776 上叠一片，用 merge 叠，把原调用者检查补到 `events.publish` 和 outputs 的 select、invalidate、retain 上，`assertPluginActionCurrent` 还要比对 `install_id`。每处配一条断言拒绝的测试。全文见 `coord-shared/DISPATCH-1019-0710.md` D13。嵌套的 `actions.invoke` 归 ③ 的 S1。

> **② 11:10 UTC：D13 做完，PR #797 已交 ⑤。** 照原样整片做的：`events.publish`、outputs 三处、`install_id` 比对。Host 投递 Git 结算通知前先退出所有动作。10:40 那条待定已撤回：#776 的 `f739c46af` 已经把 Coding 的循环挪到激活上下文。下一步按 D15、D16 改两份计划。

The ② platform session keeps this list current. Process since 10-19: lines only develop; once a PR is open everything about it (review, fixes, merging main, CI, batching, merging) belongs to ⑤. No PR cap. Slices that depend on an unmerged slice stack on its branch; ⑤'s commits come in by merge, never rebase. Heavy commands go through `coord-shared/tools/heavy.sh`; the health gate against merge-base runs once per PR, right before handing over, and only when the change can move a gated number.

## Merged

- #741 `feat/plugin-grants-same-rule`, #762 `fix/connector-caller-scope`, #783 `chore/docs-raw-data-gate` (11:03 UTC).
- #788 `fix/owner-grants-runtime`, #792 `test/materials-refusal-fence`.
- #786 `docs/host-only-markers`, #808 `feat/plugin-registration-contract`, #827 `fix/qa-022-attention-exact` (by 10-20).
- #949 `feat/review-kinds`（C5，10-21 合入 `75623a5e3`）。⑤ 的三条建议记成 BL-359～361，见 #953。

## Handed to ⑤

| PR | Branch @ head | Notes |
| --- | --- | --- |
| #776 | `fix/platform-original-caller` @ `a2ba016f9` | P2 from the #761 review: platform services check the action's original caller themselves (`assertPluginActionCurrent`); the PPT, Dataset and Form wrappers are deleted; Characters publish covered; the Runtime's own handoffs run outside every action. Shared core (plugin-runtime), goes into the batch. CI 13/13 green. |
| #797 | `fix/original-caller-events-outputs` @ `6cb56cce7` | D13，#776 评审 P2 的后续：`events.publish` 和 outputs 的 select、invalidate、retain 都查原调用者；`assertPluginActionCurrent` 比对 `install_id`；Host 投递 Git 结算通知前先退出所有动作。叠在 #776 上（base 是 #776 的分支，已 merge 进 `f739c46af`）。共享核心，进批。 |
| #826 | `feat/coding-client-in-coding` @ `98f0199e3` | W5-02 P0：Coding 的工作台挂载搬进 Coding 包；`clientUses` 把 Git、Files 交给它；通用宿主 `addWorkspace`。叠在 #808 上。共享核心，进批。workbench.js +116 B，`APPROVED_CEILINGS` 一次放行，合 main 时重新定键。 |
| #840 | `feat/plugin-registry-generated` @ `556642c9d` | W5-02 PR-1a：26 个内置插件各写 `src/registration.ts`，目录由 `scripts/generate-plugin-registry.mjs` 生成，`--check` 进 health:check；构建出的目录加载时自查（`catalogProblems`）；CODEOWNERS 给登记文件加平台评审。叠在 #826 上。共享核心（apps/workbench），affected-tests 命中全量条件，由 ⑤ 定。冻结 `builtin-plugins.ts` 到合入。 |
| #843 | `feat/plugin-action-delegation` @ `ab3867234` | W5-01 平台一半：`services.actions.directory`（`actions:delegate`），嵌套调用者为原调用者、workflow 受众、带 `delegated_by`；内核 `retainAuthority` 的 `{ audience: "workflow" }`（③ 同意）；S-41（与 #822 撞号，后合的顺延）；§1 记 Alchemist 两条用户决定。③ 的 Workflows 迁移叠在它上面。共享核心，进批。⑤ 10-20 评审结论可合，进 batch-1020-2，排在 #822 后面，顺延成 S-43（① 10-20 排号：main #839 占 S-41，#822 占 S-42）；⑤ 合并时补两样：文档写明经 MCP、Agent 的委托仍受原调用者的 `allowed_actions` 和 `validate_authority` 限制，再加一条用生产形状 MCP 调用者的拒绝用例（② 同意这个判断）。 |
| #848 | `feat/plugin-directory-route-caller` @ `ad865cc2f`（10-20 再加一提交：③ 报 directory 拒外部 MCP 提供方 `#mcp:`，`checkedReference` 改为只拒空白/控制字符/超 512 字符；10-20 按 ⑤ 两条非阻塞建议加一提交：`check` 复查原调用者对单个目标的授权；S-41 写明经路由不收窄靠「插件拿不到原始 client」，钉住 `invokeQuery` 仍收窄） | 叠在 #843 上：持有 `actions:delegate` 的插件经项目路由委托按本人的权限；`directory.check(reference, input)`。改 contracts，和 #843 同批（batch-1020-2）。 |
| #850 | `docs/bl-shared-home-and-permission-text` @ `7869f172b` | BACKLOG §7 加 BL-352（共用 Home 关闭记停止；缺 Home 级宿主锁）、BL-353（平台权限的安装说明）。只改文档，不进批。 |
| #855 | `fix/exact-ref-provider-id` @ `16e37bc7e` | BL-354 合同修复：`parseExactActionReferences` 的 `provider_id` 按 #848 的 `checkedReference` 同一规则（只拒非字符串、空白、控制字符、超 512），外部 MCP 提供方 `#mcp:` 可被精确选择；EXR-01～03（`specs/action-architecture/spec.md`）。改 contracts，进批。 |
| #857 | `feat/project-library-l1a` @ `7ca40f1c3` | 项目库 L1a（PG-020）：Manifest `databases.project`、SDK 形状检查、storage `listSqliteObjects`、plugin-runtime 账本、建表语句规则与 `openPluginProjectDatabase`（`plugin.project_database.*`）；spec `specs/plugin-project-database`（PLIB-01～11，L1a 证 02～04）；防腐 spec §1 两条 10-19 用户决定。宿主还不调用，Skill 与 docs 不提字段（D23 第 7 条），可先合。共享核心，进批。与 #843、#846、#848 都改 `plugin.ts`、`plugin.txt`，后合的重跑 `api:update`。 |
| #891 | `feat/dual-instance-declaration` @ `6c6446d26`（⑤ 评审修改两提交，并合 main、顺延 S-47） | S0-2b-2：`PluginRegistration.runtime.dual_instance` 标记，只认宿主入口；Home 一半与项目一半分开兑换，路由按绑定分两半；门禁 `scripts/gates/dual-instance.mjs` 在最后一个单独提交，只新增检查、不放宽已有规则，用户 10-21 批。S-46 与 #867 撞号，后合的顺延成 S-47。共享核心（contracts、plugin-runtime），进批。S0-2c 叠在它上面。 |
| #893 | `feat/dual-instance-e2e` @ `af82eccd7` | S0-2c：端到端夹具与覆盖测试，只加测试和文档。叠在 #891 上（base `feat/dual-instance-declaration`，已合 `6c6446d26`）。⑤ 评审「可以合」，唯一「要改」（spec §10 的 S-46 改 S-47）⑤ 已推；已进 `integration/batch-1021-1`（`3dc4b99f4`），按 #891 → #893 merge-only。② 在同一棵树上重跑：8 个双实例文件 37 条全过，tsc、boundary、secrets 通过，health 对 merge-base `146490cd` 通过；PR 正文已更新。⑤ 建议的 DUAL-02 措辞（`capability_duplicate` 与 `plugin.contribution_unredeemed`）留给 S0-2b-3。 |
| #903 | `feat/project-library-l2` @ `3c2244384` | 项目库 L2 + L3（D23）：`services.project_database` 与 Home 库共用一份客户端（`plugin-database-client.ts`，S0a 的 `refuse` 接在里面）；`pluginStatementGuard` 关键字之后 `EXPLAIN` 步骤名单（钉 SQLite 3.51.3）、根页对照账本、`project_root` 只读；沙箱 `sdk.projectDatabase` 经 broker（限长限型，事务整体在宿主）。S-18、S-46 扩，不取新号。Home 级插件不拿项目库；沙箱 Home 库留 L4；创作台写声明记 BL-358；Coding 改用是 ③ 的 C1。从 main 开，合了 `37aa59b20`（#883、#892、#881），与 #851 合并无冲突。相关用例 180 个文件全过，boundary、secrets、health（对 `37aa59b2`）通过，快照刷新 `platform/plugin`、`platform/plugin-sandbox`。共享核心，进批。 |
| #909 | `feat/plugin-model-read` @ `b41b94223` | T2：`services.model` 加只读的 `model:read`。`choices()`、`availability()` 认 `model:read` 或 `model:invoke`（二者任一既声明又持有）；都不持时 `choices()` 抛 `plugin.grant_denied`、`availability()` 答 `actions.plugin_permission`（说明改成「插件缺少模型授权」）；`complete()` 与 `configuration` 不变。`pluginModelFor` 认两样任一。S-15 改写，不取新号；PG047-01、PG047-02。现有 Manifest 一个不用改。T7 没有平台一半，随 ③ 的 C2。从 main 开，合了 `748edc0ab`（#903），唯一冲突在 `PLUGIN-PLATFORM.md`，两行都留。相关用例 190 个文件 189 过，唯一没过的 `W2-18-BUILDER-LATE-01` 是负载下的时序（单跑 42/42）；合并后模型 6 个文件 55 条全过，boundary、secrets、health（对 `748edc0a`）通过，快照不变。共享核心，进批。 |
| #926 | `feat/project-plugin-http` @ `db2a4ecba` | C6 平台一半（PG-037）：新的通用入口 `project-plugin-http.ts`（`handleProjectPluginHttp`），与 `home-plugin-http.ts` 对称，不点名任何插件；Coding 族的两段装饰叫 `codingRouteHooks`，留在 `coding-surface.ts`，由路由文件经参数传入。`ProjectPluginState.running` 删掉，插件状态按插件从监督器读（`projectPluginProblem`）；`restarted` 钩子删掉。打开项目页先 `ensureProjectPlugins`（`web-goals-read.ts` 的 `projectPluginStages`）。`handleCodingPluginHttp`、`releaseCodingSurface` 不留别名，23 个用例由 ② 改成从包入口导入（测试引用包内部 475→456）。PG037-01。合了三次 main（`9848b3502`、`eb7547b2c`、`0641e1f69`），只有 `web-goals-read.ts` 与 #901 冲突，已手合；合 #905 之后 `CODING_PLUGIN_ID` 没人用，单独一个提交删掉。门禁全过；相关用例 124+17+32+39+4 个文件，没过的两个都已核：`installed-plugin-host` 一条 30 秒超时（31.6–33.2 秒，路径不经新入口，#882 时就贴着上限，本会话没能跑基线），`personal-plugins-review-fixes` 的灵光 island 用例在 main 上就红（#901 把 `stage` 视图排到第一个）。共享核心不改，不进批。待 ⑤ 审。 |
| #935 | `feat/background-home-aggregate` @ `e222ce04b` | C4 平台一半（PG-038、PG-043、PG-106）：`services.background` 的执行记着受理它的项目，删项目时 `plugin-project-cleanup.ts` 在关库、purge 之前同一轮 `stopProject`（`actions.cancelled`，结果与失败不交付）；只有后台作业的 Home 插件也有一步；`onProjectDeleted` 从合同、宿主、Images 删掉。首页聚合：`ActionMetadata.home_aggregate`，规则在 SDK（`isHomeAggregateQuery`），`apps/local-host/src/home-aggregate.ts` 的 `collectHomeAggregate(homeAggregatePorts(host), output_type, input)` 只在打开的项目里逐个调、用那个项目的授权、带 `query_only`，答案按项目分开。新 S-49，改 S-18。共享核心，进批。24 个相关文件通过；健康门禁对照 3d7d61b4 通过。Coding 那一半（③）用这个接口。 |
| #953 | `docs/bl-949-followups` @ `7b0d96e19` | 只改 `specs/BACKLOG.md` §7：BL-359（审查队列的 `#authorities` 只加不删）、BL-360（重启后恢复的待审项界面还给「批准」）、BL-361（整合入口的拒绝没有错误码）。来自 ⑤ 评审 #949 的建议，① 10-21 让记；三条都不现在修，理由在正文。secrets、health `--base`（75623a5e）通过。文档 PR，不进批。 |
| #960 | `feat/c8-1-work-executors` @ `ffe2dcdc3` | C8-1（PG-036、S-51，进批：改了 contracts、plugin-sdk）。工作执行方协议 v1：六个角色、各自的类型与 schema、`defineWorkExecutorAction(s)`，放在合同里；SDK 负责两条声明检查并转出这些写法。助理每次派发（人点发送、跟进到点）都用 `bindLocalWebActions` 新绑一个本人客户端，读取仍共用 2 秒内的那份。跟进还算不算数，作为 control 经 `withControlChecks` 并进同一组检查。S-51 的测试：跟进排好后撤掉执行方的授权，到点时被拒，执行方的动作一次没跑。S-43 的测试文件没改。|
| #963 | `feat/pg038-activation-jobs` @ `36f2d6ef0`（⑤ 加了修改提交 `90926f1e1` 并合 main） | PG038-P（PG-038，S-52：S-51 归 #960，本片排在它之后合；③ 的 GS 取 S-53）：`services.background.keep(job, work)`，作业在 Manifest `background.jobs` 声明（`job_id`、`reason`、`permissions`），只能从本安装通过了最后一次授权检查的命令、`start()` 窗口内、或另一个作业里登记；作业属于安装（Host 给的 actor、插件受众、自己的 call id），每次写与每个激活一只 200 ms 定时器复查记录；随插件停用、项目关闭或删除、Home 停而停，单次调用取消或撤权不停它（§12.10 窄例外）。① 的六处收窄都做了。界面显示记 BL-362。12 条拒绝测试；34 个相关文件全过，boundary、secrets、health（对 `93a1f156`）通过，快照刷新 `platform/plugin`。共享核心，进批。 |
| #989 | `feat/pg061-ui-invalidate` @ `cd67e461a` | PG-061 第一片（① 10-22 批四件事），改 contracts，进批。
| #1028 | `feat/host-workspace-changed` @ `1a46cf787` | 宿主事件 `host.workspace.changed@1`（BL-379 平台一半，S-54；① 10-22 批，D2：结算成功、失败、不明都广播）。类型表定投递方式（定向／广播）与广播要的权限 `workspace:read`；`broadcast` 按 Manifest 订阅与授权选收件人，排队与投递前各核一次权限；删 `isHostEventType`，换 `hostEventType`。改 contracts、plugin-sdk、plugin-runtime（共享核心），进批。BL-379 留着（剩 ③ 的 Git、Files 订阅），新开 BL-366（Agent 改动）。 |
| #1050 | `feat/dual-instance-handles` @ `324983ef1` | S0-2b-3（DUAL-16，S-48，① 10-22 定全范围）：双实例两半的服务句柄不互借，凡核对正在运行的动作的 gate 都连 `installation_generation` 比；`PluginStartContext` 加必填 `installation_generation`（改 contracts，`api:update` 已刷新，不留兼容期）。新测试 `tests/dual-instance-handles.test.ts` 进 `test:security`。相关 71 个文件 + 变基到 d14a4956 后 6 个复跑都过，health/boundary/page-assets/secrets 过。共享核心，进批。与 #1048 同改双实例 spec 第 3 行状态句，后合的解一行冲突。BL-379 保持开着。 |
| #1074 | `feat/bl411-stopped-services` @ `8659079ee` | BL-411 + BL-368（① 10-23 定一个 PR）。BL-411：激活停了以后，在所有调用之外再调服务，拒绝不抛进宿主：同步方法返回 undefined，异步方法不结束。处理器还没结束的动作、场景、作业里照常抛（比批准方案多的一条细化）。计数挂在执行器上、只在内存，每个方法首次写日志。BL-368：#1018 的七个服务各一条双实例拒绝用例（`tests/dual-instance-services.test.ts`），变异杀过。23 个预期变化文件改写。affected-tests `full` = []，不进批。按 ① 10-23 开发优先，rebase、合 main 以后本机只跑了 secrets，PR 里「本机延后验证」列出没跑的。路由缺口（自写路由停止后才调服务，请求不答）没改代码，建议另开 BL。 |
| #1081 | `feat/s0b2-connections` @ `298f6dc7c` | S0b-2：`services.connections`（S-57；S-56 归 #1079），Manifest `connections:use` + `connections.slots`，只有人绑账号（`connectors.plugin_slot.read@1`/`bind@1` 只对 user），宿主只在平台定的来源加 Bearer，别的来源与内网一律拒，DNS 后复核，跳转原样交回；创作台网络门共用 `public-https.ts`。affected `full`：shared-core + spans-packages（529 个文件），进批。本机只跑了新测试 6/6、secrets；health、boundary、`agent-built-plugins-network` 未跑（① 10-23）。#1079 先合则 SECURITY-INVARIANTS 表尾两行都留。 |
- 新增 `services.ui.invalidate()`：
  - 推页面在看的同一个 revision；
  - 不带参数；
  - 声明了 `ui.views` 就能调，不要权限；
  - 绑在这一次激活上（停用、重启、Home 关闭后旧 client 被拒，报 `ui_host.plugin_denied`）；
  - `start()` 里调用是空操作；
  - Home 实例推 Home 平台那份。
- 不取 S 号，理由在正文。
- `ui.commands` 记成 BL-363：main 上 7 条，G2 后剩 6 条，Git 还有 `git.open-change`。
- Files、Git 的宿主端口留给 G2、C6。
- 4 条用例（PG061-01～05）；29 个相关文件全过；boundary、secrets、health（对照 `6d236165`）通过；contracts `platform/plugin` 快照刷新，SDK 和动作快照不变。 |
| #999 | `feat/pg035-typed-to-action` @ `4c11bcf00` | PG-035 第一片（① 10-22 照稿批准），改 contracts 和 agent-host 登记，进批。
- 一种东西一个登记口：
  - `registerAction` 只收动作；
  - `register`/`registerCapability` 只收 typed，收到动作抛 `host.registration_seam`；
  - `project-capabilities.ts` 的 7 条换到 `registerAction`。
- `agent.draft-text.v1` 改成只给插件的动作：
  - 要 `model:invoke`，concurrent，schema 写全；
  - Coding 经 `services.actions` 调；
  - Coding 的 `model:invoke` 写成可选。
- 补了缺的拒绝，写进 S-15（PG035-01～07）；两个证据文件加进 `test:security`。
- 关掉 `model:invoke` 时：提交说明那条路由答 `plugin.grant_denied`；历史摘要退回按记录整理的那一份。和批示预期不同的这两处，正文写明了。
- 从输入读 pluginId 的几处只有宿主内部调用走得到，记进 BL-364；scheduler 的 4 条记 BL-365。
- 门禁与测试：
  - 动作快照只新增 `agent.draft-text.v1@1`；
  - typed 能力 187 → 177；
  - health 对照 `3a4ffe46` 通过；
  - 相关用例全过。
- 重叠：#936、#988 改 Coding 的起草那一行；#970、#934 改 `local-host.ts` 的另一段。 |
| #1001 | `fix/agent-host-pack-suggest` @ `20063b745` | agent-host 撞包缺陷（① 10-22 派，插在 X-6 前；⑤ 评审 #987 时发现），改 agent-host，进批，不开 BL。
- 改法：动作包范围的哈希算进「有没有建议工具」和每个动作的提供方显示名（描述里也用它，同样会撞）。没有把建议工具单独成包，因为它的 `action` 枚举要列这一轮动作工具的名字。
- 旧轮不受影响：范围按轮记在 `action_tool_scope`，读回时不重算。
- 复现 `tests/coding-mode-switch-pack.test.ts`：同一会话先 execute 再 edit。另在 `agent-action-tools-prologue` 加一条「同一个包 id 只对应一份声明」。两条修前在 main 上失败（`SCENARIO_PACK_INVALID`），修后通过。
- 测试：README 必跑清单加 `coding-work-executor`，共 20 个文件，19 个通过。`prologue-documents` 批内超时，单跑通过（时序）。
- 门禁全过：api 快照 0 改动，动作快照不变。
- #987 的 W5-01-CODING-80 可以改回 edit，那是 Coding 的测试文件，没动。 |
| #1013 | `feat/x6-host-events` @ `ad651e021` | X-6 宿主事件 `host.review.settled@1`（① 10-22 批 D1–D4），S-54。改 contracts、plugin-sdk、plugin-runtime（共享核心），进批。
- 新类 `PluginHostEvents`（`PluginEventBus` 冻结，不往里加）：即时、至多一次，不落库、不重投、不为它启动插件；发出时与调用处理器那一刻各核一次收件安装。
- 收件人取自审查的 `ReviewAuthority`，要 `holds()`；没有发起安装的（Agent 改动、恢复的审查）与 `checkpoint-rewind` 不发。
- `from_plugin_ids` 改可选：订阅宿主事件不写，订插件事件仍必填（SDK 拦）。
- 测试 X6-01～07 全过（X6-05 含「排队后才停」，去掉调用前的 `beforeEffect()` 它就失败）；相关 22 个文件全过；health 对照 `17040543`、secrets 通过。
- 共存窗口：合入到 G2b 之间新事件无订阅者，旧 Git 端口照旧；G2b 同一个 PR 加订阅、删端口与 `git-operation-notifications.ts`、改 S-18 那句。
- 与 #1008（CHR-1）在 `project-plugins.ts`、`project-plugin-ports.ts`、`web-project-context.ts` 相邻行冲突：后合的保留 `observeReviewSettlements`、删 `character*`。 |
| #1024 | `feat/c7-public-packages` @ `87f1e1bfc`（10-22 补 ① 的接受条件：README 的 /rich-text 一节写明版本范围，测试核对三处一致；叠在 ⑤ 的 `414aeaa5e` 上） | C7（PG-062 的平台一半）：SDK 加 `/highlight`、`/rich-text` 两个子路径，根入口加 `redactSecrets`；删掉 Coding `highlight.ts`、Feed `rich-content.ts` 与 `context.ts` 的脱敏，工作台、宿主、桌面壳改从 SDK 取；断言不动，新测试 W5-01-CODING-60～63。改 plugin-sdk（共享核心），进批。
- 偏离 T3 一处：`marked`、`sanitize-html` 是 SDK 的**可选 peer**（加 devDeps），不是运行时依赖。原因：`tests/plugin-sample.e2e.test.ts` 从空缓存离线 `npm install` 只装 contracts 与 SDK，运行时依赖会 ENOTCACHED。用 `/rich-text` 的工作台、宿主自己声明它们；记在 spec §K 与 `coding-migration-plan.md`。
- 公开 API 3 份快照（SDK `index`、`highlight`、`rich-text`）；actions 无差异；page-assets 26 个不变；health 对照 `9935e12e`、secrets 通过。
- `tests/desktop-tui.test.ts` 在 main 上就红（#994），与本片无关，见 `main-red-1022-desktop-tui.md`。
- 与 #1018 在 `pnpm-lock.yaml` 的 importers 段冲突（另三处对 merge-base 本来就冲突）：后合的两边依赖都留（#1018 的 `@xterm/*`），拼 importers，再 `pnpm install --frozen-lockfile --offline` 验。#1010 的 page-assets 冲突与本片无关。 |
| #1085 | `feat/w5-06-mounter` @ `a483bb7c9` | W5-06 第 1 片（PG-060）：UiHost `mountDeclared` + `createSurfaceRenderers`，删 11 个 `goals-*-ui.ts` 转接与 9 张 surface→slot 表；`goals-page-renderer.ts` → `shell-page-renderer.ts`（函数名留 W5-10）；BACKLOG 新增 BL-350、补 BL-356。full 命中 assembly、spans-packages、deletes-code → 进批次。门禁 `check-package-boundaries.mjs` 的 proposal 检查跟着改。本机只跑 dev 构建（CLT SwiftBridging 用 swiftc 包装绕过）与 secrets。下一片：W5-06 第 2 片（Manifest `views` 通道），再 BL-403 + BL-404。 |
| #1087 | `feat/w5-06-declared-stages` @ `502ffa9c6`（10-23 23:31 ⑤ 在 #1085 squash 后合 main；② 另合一份，树相同 `b8c67640a`，没再推） | W5-06 第 2 片（PG-060）：舞台照 Manifest `views` 挂（新 `apps/workbench/src/declared-stages.ts`），删外壳里 9 行手写舞台、8 个具名挂载端口（换成 `stageModel`）、6 个 `render*Contribution`；宿主 Home 舞台按 `stageContributionId` 报 id，`builderWorkbenchPanel` 删。叠在 #1085 上（含 `a483bb7c9`，只看 `4c95675b4`；合过一次 main，解了 privileges PG-060/061）。新测试 `tests/declared-stages.test.ts` 进产品子集。full 命中 assembly、spans-packages、deletes-code → 进批次。本机只跑 dev 构建、两份快照（无变化）、secrets，外加一次 dist 渲染核对测试前提。剩下：② 第 2b 片（Manifest 声明分组与设置图标，改合同），之后 ③ 删 PPT、Dataset、灵光其余手写行。下一片：BL-403 + BL-404。 |
| #1096 | `feat/bl403-route-dispatch` @ `4898e94ff` | BL-403 + BL-404：Plugin Runtime 的 `OfferedContributions` 包住每个路由处理器。路由是一次调用（路由 ALS，`insideOpenPluginCall`），撤下激活时还在等的非流式请求当场答 403，留着的旧绑定 403、处理器不跑；流式照旧由路由器取消。带码错误按 kind 答（SDK 新导出 `isCodedFailure`），没码的交给宿主。ISSUE-04、plugin-action-route 改回 403；新测试 `tests/plugin-route-calls.test.ts`。#1074 合入后合过 main，diff 只剩本片。full 命中 shared-core → 进批次。本机只跑 dev 构建、两份快照（API 变、actions 不变）、lint、secrets。#1087 的 5 条建议、#1081 的注释建议不动 head，前者并进 2b。下一片：W5-06 第 2b 片。 |
| #1098 | `feat/w5-06-manifest-placement` @ `34df6f021` | W5-06 第 2b 片（PG-060，RAC-75～78），叠在 #1087 上。视图声明 `group`、`creates`、`start`，设置页图标用 `settings` 视图的 `icon`；SDK 新文件 `view-placement-declarations.ts` 拒绝写错的声明。外壳的 `RAIL_TOOL_GROUPS`、`PLUGIN_SETTINGS_ICONS` 删掉，宿主只留组名；工作台导出 `creatableKinds`、`homeStarts`，页面那半由 ③ 接（BL-387，删 CREATE、names、starts）。并进 #1087 的 5 条建议（第 5 条记 BL-369）。新测试 `tests/view-placement-declarations.test.ts`，进产品子集。改 contracts 与 SDK → 进批次。本机只跑 dev 构建、两份快照、lint、secrets。 |
| #1107 | `feat/w5-06-project-stages` @ `3e92d3354` | W5-06 第 3 片（PG-060，RAC-79），叠在 #1098 上（base `feat/w5-06-manifest-placement`；差异里多了 #1098 还没推的 `18aef8028`，本片只看 `3e92d3354`）。项目级 Runtime 实例（Form、Dataset、PPT、Pages、灵光、Workflows、Schedule）的舞台由运行中的实例画（新 `apps/local-host/src/project-plugin-stages.ts`），按同一 id 报给外壳；没在运行的画 `data-project-plugin-unavailable` 占位，不从构建目录补画。启动名单移进 `projectPluginEntries`，建平台前记到 `ProjectPluginState.plugins`。渲染器给 `declaredStageModel`，外壳与宿主共用。测试 RAC-79 在 `tests/runtime-plugin-http-discovery.test.ts`，未跑、无类型检查。full 命中 assembly → 进批次。本机只跑 dev 构建（tsc 过，Swift R-27）、api 快照（无变化）、secrets。合入顺序（⑤ 10-23）：batch-1023-10 绿 → #1099 → #1100 → #1087 → #1098 → #1107；#1098 改 base 到 main 时，#1107 跟着合一次。 |

## Next slices (in order)

> **① 10-22（PG-035 交出以后）：** 顺序是：
> 1. agent-host 撞包缺陷（`agent-host-pack-suggest-1022.md`）。先修，插到 X-6 前面。
>    - 两种修法二选一，由 ② 定：把 `suggest` 算进 scope 的哈希；或者把建议工具单独成包。
>    - 先写会失败的复现：`codingProductHost` 里同一个会话先 `execute` 再 `edit`。
>    - 进批；不另开 BL。
>    - **② 10-22：已交 ⑤，#1001 @ `20063b745`。**
> 2. X-6 宿主发起的事件。
>    - main 的 spec 和 docs 里没有定义它的行，设计稿里先补上定义。
>    - G2b 要的是：审查结算以后发一条通用事件，只投给发起审查的那个安装。
>    - 要不要单列成安全不变量，由 ② 定；要取 S 号的话，下一个空号目前是 S-54，取之前先核 main 和在途 PR。
>    - 设计先交 ① 审。
>    - **② 10-22：设计稿已交 ① 审，`x6-host-events-design.md`（D1–D4 待裁，安全不变量推荐单列，现在看是 S-54）。批之前不动工。**
>    - **① 10-22 批了，四项照推荐（D1 不落库、D2 只发执行完的结算、D3 单列 S-54、D4 统一定义）。② 已开工，分支 `feat/x6-host-events`：代码与 7 条拒绝测试（X6-01 至 X6-07）全过，相关 22 个文件全过；文档改完，门禁与 PR 在做。**
>    - **② 10-22：已交 ⑤，#1013 @ `ad651e021`。**
> 2b. **`host.workspace.changed@1`**（① 10-22 定形状：写工作区的审查结算时广播给本项目订阅了、持有工作区读权限的安装，载荷只 `{ workspace_id, cause }`，照 X-6 投递）。
>    - **② 10-22：一页设计已交 ① 审，`host-workspace-changed-design.md`（D1–D5 待裁；推荐扩 S-54、X6-08～13）。批之前不动工。**
>    - **① 10-22 批了**：D1、D3、D4、D5 照推荐；D2 改成结算成功、失败、不明都广播，拒绝、取消、过期不算结算、照旧不发。另开一条 BL（② 的 350–369）：Agent 批准的写入也发，cause 加 `agent-change`，之后删 coding-surface 的 `readsFilesOutputs`。v1 合了就关 BL-379。**② 10-22 开工。**
> 3. BL-411。
>    - **② 10-22：短设计已交 ① 审，`bl411-stopped-services-design.md`（D1–D3 待裁；推荐停用后统一惰性形状，进程级兜底并进 F9）。批之前不动工。**
>    - **① 10-22 批了**：D1 = A（B 并进 F9），D2、D3 照推荐。加两条：测试 BL411-05（停用插件重启或重装以后，旧激活的句柄仍然无效、碰不到新实例，诊断记在旧安装上；作 S-18 的证据，不改文字、不加行）；停用钩子超时不在本片，先查 F9/W5-13 有没有，没有就在 350–369 开 BL。PR 里列出每个非 void 的同步方法；永不结束的 promise 用 race 加超时断言。
>    - **先后（① 10-22）**：S0-2b-3 挡 Shelf S2 合并、又碰同一批服务文件，排在 BL-411 前面。做完 `host.workspace.changed@1` 时子会话卡 task_8d9f1662 还没点开，就由 ② 自己在主线上先做 S0-2b-3、再做 BL-411，并撤掉卡；卡已点开，就等 S0-2b-3 合了再做 BL-411，中间做 S0b-2 的前置核对。

> **子会话（① 10-22）**：顺序 S0-2b-3 → C8-3 → Goals 三片。卡：C8-3 task_3f6b811d，S0-2b-3 task_8d9f1662，Goals S9 task_96c0cd34，由 ① 请用户点。
> **Goals S9 开工前要知道的 ① 裁定（10-22）**：
> - T1 10-22 解冻（③ 在 S5 里记）：可以动 `project-plugins.ts` 和装配门禁。
> - W5-06 归 Goals S11；S9 不等它。③ 在 S5 里改 `privileges.md:115`。
> - PG-027：在 S9 设计里核。#843 已经做完的，在那个 PR 里带证据标完成；没做完的列出缺什么。
> - 成果库：不进 S9 设计。S9 只写 Goals 要用的 artifacts / process_items 服务接口；成果库整体迁平台另写一份方案，排回填队列第一。
> - Shelf S2 的 `location()` 提交：② 按共享核心口径评审（contracts、plugin-runtime 的 owner-files-service、API 快照），条件是只给冻结声明里有 owner_files 且有授权的实例，项目一半与沙箱插件在受管 IO 之前拒绝，测试并进 S-15 的 ownerFiles 那句，停用、重装后的旧句柄按 S-18 拒绝。

① 10-21 批了 Coding 迁移计划（`coding-migration-plan.md`），平台一半交给 ②。完成标准是 Coding 离开 HYBRID 名单。T1：C9 收口不等 C8，`assistant-coding.ts` 留着的话记在 PG-036 / W5-10 名下。② 10-21 已答 T2、T3、T5、T7，加各片安全不变量的判断，写在那份笔记 §6 末「② 的答复」。

1. **S0-2b-2（#891）与 S0-2c（#893）**：⑤ 评审可合，已进 `integration/batch-1021-1`，等全量后按 #891 → #893 合。
2. **项目库 L2 + L3**（#903 已合，`748edc0ab`）：照 `project-library-plan.md` §2.4–2.6 和 §3 做（D23 已批）。
   - #867 已合，从 main 开。
   - C1 等它。
   - 安全不变量扩 S-18 与 S-46，不取新号。
3. **T2 的 `model:read`**（#909 待审）：小的共享核心 PR，进批，排在 C2 之前。T7 没有平台一半，随 C2。
   - `choices()`、`availability()` 认 `model:read` 或 `model:invoke`，`pluginModelFor` 跟着改。
   - S-15 改一句，加拒绝测试。
4. **C6 平台一半（PG-037）**（#926 待审，head `db2a4ecba`）：不依赖 L2。T7 没有平台一半，没有并进来。
   - 通用分发搬进 `apps/local-host/src/project-plugin-http.ts`（T5）；点名插件的两段钩子留在 `coding-surface.ts`，由调用方传入。
   - 运行状态按插件从监督器读。
   - 动 `project-plugins.ts` 前先查在途 PR。
5. **C4 平台一半**（#935 已合）：PG-038 后台作业按项目停；PG-043 Home 聚合，新开 S-49。给 ③ 的接口是 `collectHomeAggregate(homeAggregatePorts(localHost), <output_type>, input)`；`/api/attention`、`web-catalog.ts` 归 ③ 改。
6. **C5 平台一半（PG-009）**（#949 已合，`75623a5e3`；评审建议记成 BL-359～361，#953）：U1 用户 10-21 答「开放给所有插件」。
   - 单独一个共享核心 PR，排在 C4 之后、C7 之前，不并进 C4、C6。
   - Manifest 的 `permissions` 写 `review:<种类>`，种类只认平台列表；授权照现有权限走。
   - `reviews.ts` 去掉四个按插件 id 的分支。
   - 新开一条安全不变量。
   - 接口写在 `coding-migration-plan.md` §6「② 的答复」，与 ③ 对齐。
7. **C7 公开包（PG-062）**：排在 #884 之后，一个 PR 搬完、不留两份（T3）。**② 10-22：已交 ⑤，#1024 @ `87f1e1bfc`（含 ① 的接受条件）。**
   - SDK 加 `/highlight`、`/rich-text` 两个子路径，根入口加 `redactSecrets`。
   - SDK 新增依赖 `marked`、`sanitize-html`。
   - **等（① 10-21 同意不拆）**：视觉线的 #940 改 Coding `highlight.ts`（+69 −8），#950～952 叠在它上面；`assistant-island.ts`、`coding-surface.ts` 另有 #915、#916、#920、#921、#922、#951、#952 在改。#940、#950～952 合进 main 后一个 PR 搬完（① 通知或 ② 自己看到就开工）。③ 的那一半（Diff、Text Stats 自己出 html）还撞 #920（两边的 `ui.ts`、`index.ts`、`messages.ts`）、#915（Diff `index.ts`、`patch.ts`）。
8. **C8：W5-10 设计**（「助理按动作和消费场景选执行方」）：写出来交 ① 批。设计里写明 `withPersonDispatchGuard` 的归属与安全不变量。
   - **10-21 写好，待 ① 批**：`c8-executor-design.md`。按动作类型选执行方，不用消费场景；守卫归本人动作客户端的 `control`；要一条新不变量（编号开 PR 时取），测试放 `tests/security-invariants-assistant-executor.test.ts`。分三片：C8-1（②，进批）、C8-2（③，Coding 发布角色）、C8-3（②，等 C8-2 和视觉线 #916、#915、#940、#951）。
9. **C9 通道**：W5-06 `views`（PG-060）、W5-04 按需打包、PR-3/X-2 设置节。
10. 等别人的：S0-2b-3（U3，服务 gate 分实例）等 #812。顺手把 DUAL-02 标准改成「第二个被拒（动作服务答 `kernel.capability_duplicate`，Runtime 记为 `plugin.contribution_unredeemed`）」（⑤ 评 #893 的建议）。
11. 往后挪的（排在 Coding 平台一半之后）：
    - S0b-2：`services.connections`，Feed 迁出宿主（PG-093）时开，Feed、Images、Jelly 要它；Q2 用户 10-20 选了 A。
    - S0b-1 10-21 作废（Alchemist 删除）；Feed 迁移时再定证据搜索要不要做成服务。
    - W5-02 PR-1b-1..4：PR-1b-1 带用户对 `--check` 依赖清单的豁免。
12. 再往后：PG-002 可选权限开关，以及 privileges.md §2 第一阶段剩下的 PG 条目。
13. 小的后续：
    - 收回 local-host 入口的 `localWebActionContext` 导出：main 上 8 个测试文件在用，要先给建上下文的公开写法。
    - BL-394：双实例项目一半从发行物恢复时丢标记，⑤ 派给 ②，要在第一个带标记的内置插件之前做。
14. **PG-007 阶段 4 收尾时一起做**（① 10-21 加，不另开 BL；已写进 privileges.md 的 PG-007 行）：
    - 背景：Characters 并进 Module（③ CHR-1）后，由宿主提供方登记 `characters.*`，并在 `HOST_OWNER_PERMISSIONS` 显式写 `artifact:read`、`artifact:write`。这两项已经经 `NATIVE_OWNER_PERMISSIONS`（Dataset、Form、Pages、PPT、Shelf）在全局集合里，所以那一片不算放宽。
    - 问题：`ownerReaches`（`local-web-actions.ts:28`）只看权限 ⊆ 全局集合，不看提供方。删掉按目录拼的名单后，这两项还在；任何不带安装 id、要 `artifact:write` 的宿主动作，本人都调得到。
    - 做法：本人的权限改成按宿主提供方给，每个宿主提供方自己声明本人对它持有什么。
    - 测试：补一条拒绝测试，一个要 `artifact:write`、不属于 Characters 的宿主提供方动作，本人调不到。

Moved away (① 10-19): PG-006 (Goals' four read actions stop trusting built-in callers) now belongs to ③.

PG-110 (① 10-19) belongs to ③ and ships with PG-006: the kernel `ActionService` only compares `caller.permissions`; it checks neither the Host's `HostPluginCaller` nor the installation's grants, so S-15 is enforced only on the plugin-client side. If ②'s stage-2 grant work needs to touch the kernel `ActionService` or `action-execution-context`, agree it with ③ first. Checked 10-19: #788, the PG-002 survey and both plans touch neither.

Codex QA (user 10-19): findings reach ② only as ① slices; never answer Codex. A fix PR body says 「修 QA-xxx」 plus the acceptance number; the regression test follows Codex's regression assertion or is stricter. Do not edit `specs/qa-acceptance-2026-10/`. Rules: LINE-COMMON §3.


> **② 10-23 待办（不挡 2b）：**
> - #1081：Codex 复验过（head `851eaab5d`，14/14）。现在和 main 冲突，只冲 `docs/system/SECURITY-INVARIANTS.md`。等 #1079（S-56）合入后合一次 main，S-56、S-57 两行都留；只解这张表、不动代码，复验照旧有效。碰到代码冲突告诉 ①，① 安排 Codex 重跑。
> - #1096 ⑤ 评审过（issuecomment-6365245932），可以合，进 batch-1023-9，head 不动。3 条建议放后面的片：streamed 的判断与路由器统一成 `stream !== undefined`；`plugin-action-route.test.ts:74` 套 `within`；撤下后处理器尾巴上没码的错误被吞，补一句注释。
> - #1098 ⑤ 评审过（issuecomment-6366193217），可以合。3 条建议已改：`18aef8028` 已按 ① 10-23 的要求推到 #1098（快进，base 没改）。等 #1087 合入后合一次 main、把 base 改到 main、dev 构建、推送，再进集成批次。三层叠放到此为止，下一片等 #1087 进 main 后从 main 开。组内顺序没改行为：main 上本来就是注册表的顺序。
> - batch-1023-8 的 `write-checkers-settings.e2e:92` 红（项目设置页 Esc）：② 读代码认为 #1087 不是原因，已把二分点发给 ⑤。① 记作 R-25：对比与二分由 Codex 在它那台机器上做；测试准备条件的问题（① 推断：按 Esc 前没等对话框打开）由 Codex 修，② 不动 `tests/write-checkers-settings.e2e.test.ts` 同一处；只有 Codex 证明是 ② 某个 PR 带来的产品回归时，① 才派给 ②。
> - #1096 与 #1076 交叠在 Shelf `home-plugin.ts` 手写路由那段 catch：谁后合谁顺手删（① 已告诉 ⑤）。
> - #1107 ⑤ 评审过（issuecomment-6368221031），可以合。建议 3（null 项目时外壳从目录画）在本地 `4330585a5` 改了注释，还没推；等 #1098 合进 main 后，retarget 到 main 时一起推一次。建议 1（加「查看插件状态」链接）不改：项目级插件没有状态页。建议 2（stageModels 一行一条）不改：巨大单元会变大。项目级插件的状态页与重启入口记作 BL-430（① 10-23 给 ② 新号段 BL-430–439，350–369 一律当作用过）：本地提交 `84319f0ba`，和 `4330585a5` 一起，等 #1098 合入、retarget 时推一次。BL-430 本身排在 W5-06 之后，从 main 开，先写 spec 小节带验收号。

## Follow-ups noted in #776 (not ②'s files)

- Output ports' `invalidate` and `retain` do not check that the instance is still active outside every action (`select` has `requireGrant`); a stopped instance's timer can still change them. Separate invariant (no writes after stop); ② to slice it.
- Coding's hand-written `beforeWrite.assert_current()` in `plugins/native/coding/src/action-cards.ts` is now redundant for private storage; its owner can delete it.
- `docs/platform/PLUGIN-DEVELOPMENT.md:153` and `skills/molis-plugin-dev/host.md:43` (①'s docs) could say that platform services check the original caller themselves.

## Follow-ups from the GS S-52 review (③, 2026-10-21)

- ③ 在 `b2f67989b`（`migrate/git-gs-runner-invariant`）删了 `apps/local-host/src/git-status.ts`（PG-099 的 Git 部分）。`specs/repository-anti-corruption/privileges.md` PG-044 的代码列还写着 `git-status.ts:4-5`：② 下次改 PG-044 时顺手去掉（等 ③ 那片合入之后）。
