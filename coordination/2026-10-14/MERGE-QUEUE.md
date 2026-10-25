# 防腐线合并清单（给合并 Agent）

> **2026-10-23 23:26（洛杉矶）最新分工：** 一骏明确整条防腐线听Claude总统筹：范围、优先级、跨线依赖和全量排期由Claude决定。Codex侧「专职｜防腐流水线与合并执行 · Codex」（`01a16c88-7956-7e10-a5f4-5baf476c3634`，用户最新指定gpt-6.1-sol/max，06:45:56UTC实际回合已核；root/REVIEW保留gpt-6-astra/xhigh）从Claude当前共享派单或明确回执领取独立任务，组织专职实现/评审/测试/修复，按Claude顺序核证据并执行正常合并；Root负责唯一定时巡检；原五类职责和交付驱动接续保持。原主chat保留完整目标、用户沟通并建立1–2个实现入口后交Codex侧接续，不重复建chat。独立树允许多writer，真实同文件/合同/候选重叠串行，公共build/browser槽保持；四专职入口及所有有效block/non-block闭环见[CODEX-SESSION-ROLES.md](CODEX-SESSION-ROLES.md)。DeepSeek历史贡献保留；review-pr-fixer旧认领已Claude6381877118释放并由FIX2接续，Claude开发owner及唯一full组批职责保持；Codex侧协调不替代Claude总统筹。

状态：2026-10-23 起生效。统筹（本机 Claude）维护顺序与就绪条件；合并由用户另派的合并 Agent 做（用户 10-23）。**10-24 起统筹也合、也审**（用户 10-24：PR 积压，统筹协同处理合并与评审）：条件 1～5 满足的，谁先看到谁入队。**10-24 03:40 用户停了合并 Agent，它的活（入队、机械同步、CI 红的修复、起集成批、挪 §3）由 Codex 接**；统筹职责不变。下文的「合并 Agent」都读作 Codex。

读法：

```bash
git fetch origin coordination/handoff-2026-10-14 && git show origin/coordination/handoff-2026-10-14:coordination/2026-10-14/MERGE-QUEUE.md
```

## 0. 现行协作模式（用户 2026-10-24 晚，覆盖本文、`CODEX-TASKS.md`、`SLICE-RULES.md` 里与它不一致的旧说法）

**多writer现行规则（Root转达人类最新明确：“可以提升writer数量，不局限1个，不影响速度”）**：不同独立工作树、不同明确问题/实现项、真实依赖已满足且无重复owner时可以同时写，不设整个Codex协作组只有1人的上限。同一文件/合同、同一候选及有真实代码依赖的部分仍串行；公共冲突/生成物由当前carrier owner统一。每个FIX仍一次专注一个问题、gpt-6.1-sol/max，未收尾不塞无关任务。公共build一个、browser批一个、full仅Claude唯一排期不变，等资源不等于停止独立编码；只有Root周期巡检，原交付直接接续与现有角色不变。此条覆盖以下旧“单writer/唯一writer/串行轮换”上限，仅改变并行数量，不凭共享一处文字取消已有授权或在途owner。


用户原话：「在 claude：组织好合并顺序，进行开发和 review。在 codex：review 问题修复，修复后的二轮 review，以及有独立任务可以交付 Codex 执行」；「完整实现某个功能或者 slice 之后统一 PR」。

| 谁 | 做什么 |
| --- | --- |
| Claude 统筹 | 范围、优先级、合并顺序；按路径组批（§1a），唯一起 full；批 PR 入队，合入后关源 PR；裁定 |
| Claude 开发线（`ac-*`） | 开发。一个完整功能或 slice 做完才开一个 PR，开完接着做下一个；**不修评审意见** |
| Claude 评审（`ac-review`） | **所有**防腐 PR 的一轮评审（Codex 写的也是），按统筹排的顺序 |
| Codex 修复（独立树/独立问题可多writer，同文件/合同/候选串行） | 一轮评审里全部有效意见（挡合并的与不挡合并的）在原 PR 分支上修，先留「修复认领」；一轮的修复攒齐一次推送 |
| Codex 评审 | 修复后的二轮（只看增量），结论写「二轮：可合」加固定 head；没过就回 Codex 修复 |
| Codex 独立实现 | 统筹派的独立片（`CODEX-TASKS.md` §0a），与修复按真实文件/合同依赖协调并行；下一批必要修复优先，但不空等独立编码 |
| Codex 测试 | 红用例归因、偶发失败、`known-red-main.md` |

一片的流程：开发线开 PR → `ac-review` 一轮 → Codex 修复 → Codex 二轮可合 → 统筹组批、full、批 PR 入队 → 合入后关源 PR。一轮结论是「可合」的不经修复，直接等组批。二轮可合之前不进批。

PR 粒度（GitHub runner 槽位有限，开得多就积压）：

- 一个 PR 是一个完整功能或 slice 的全部；分几步做就是几个提交，不拆成几个 PR。没做完的只推分支不开 PR：只推分支不跑 CI（`ci.yml` 只在 PR、main、合并队列上跑；`full-suite.yml` 只在 `integration/**` 和加标签时跑）。草稿 PR 也跑 CI，不开草稿占位。
- 每条开发线同时最多一个 PR 在评审或修复中；二轮可合、只等进批的不算。
- 落后 main 不同步；共用文件冲突由统筹在批分支里一次解（§1a）。
- 已推了没开 PR 的几步合成一个 PR：S-57 扩展 X1～X4 一个 PR；BL-521 第二片并进 #1230；PG-017 P1 与 P3 一个 PR。

过渡：已经在修的保持原修复者，修完为止（如 #1223 的 BL-372 三项由原作者修完，合同版本由统筹在载体里升）。从这条起，新的评审意见一律交 Codex 修复。

## 1. 一个 PR 可以合的条件（全部满足）

1. CI 的 `Verify` 绿（分支保护只要求它，合并走 GitHub 合并队列：`gh pr merge <n>`，方法由队列定）。
2. 一轮评审（统筹的评审会话 `ac-review`）的评论结论是「可合」；或结论是「修后可合」，且 Codex 在 PR 上写了「二轮：可合」。合并前读一遍 PR 上的评审评论，答复或修完再合。
3. `node scripts/affected-tests.mjs --base origin/main --json` 的 `full` 非空的，要在集成批里过：失败文件和 `known-red-main.md` 的机读清单比，只剩已知红（重试才过的不算失败）。下表「批」一列写了它在哪一批。
4. 改了 `docs/system/SECURITY-INVARIANTS.md` 或 `tests/security-invariants-*` 的，合前人工看「Security invariants」两片作业，红了按挡合并处理（R-24）。
5. 叠放的 PR：下层合入、分支删除后，GitHub 自动改投 main；没改投就手动改，再按 squash 感知的方式合一次 main（做法见 #1100 上 ⑤ 的说明），确认 diff 只剩本 PR 自己的改动。
6. 不 force push，不取消任何 CI run（取消要用户本人同意），不绕分支保护。
7. **一个 PR 同一时间只有一个修复者**（用户 10-23：合并 Agent 也在修评审意见，Codex、作者会话也会修）。动手修评审意见或 CI 红之前，先看 PR 评论里有没有「修复认领」；没有就先留一条「修复认领：<谁>，修第几条 / 哪个红」再改，改完在同一条下写结果和新 head；已有别人认领的那几条不碰，要接手先在 PR 上问认领人或统筹。统筹把 PR 退回给作者会话修时，由统筹在 PR 上替作者留认领。认领超过 2 小时没有推送，统筹可以收回改派。
8. **合并认领**（10-24 起，统筹和合并 Agent 都在合）：入队前在 PR 上留一条「合并认领：<谁>」并写满足了哪几条；已有对方认领的不碰。从队里手动取出时，同时在 PR 上写原因（例如要等别的 PR 先合、批没过），对方据此处理，不再重复入队。
9. **评审分工与接续**（10-24 06:18 更新）：保留 `ac-review` 有效结论；新派正式评审及修后复审交专职评审chat，流水线统筹裁决证据和派修。所有有效意见包括non-block均有具体owner和接续，是否阻挡当前PR单列，不把后续项登记当修好。纯机械同步（只解冲突、重算生成物）复用原结论，统筹或独立评审核 `git show --remerge-diff` 和必要增量，不机械重跑全轮。

合入以后：在本表把那一行挪到 §3「已合」，写合并提交。`privileges.md`、spec 链接和登记册由统筹改。

## 1a. 同路径一起落地（用户 2026-10-24 09:0x UTC：「反复处理 Conflict 浪费时间和 runner，把同路径的合并一下」）

评审仍按片一个 PR；**落地**按路径成组，避免每合一个就让后面的同步一次、再跑一遍 CI。

1. **批 PR**：`full` 非空的片照旧进集成批。批跑绿（或只红已知红）后，统筹把集成分支本身开成一个 PR（标题「batch-NN：#a #b #c」，正文逐个列片、固定头、评审结论与全量 run），只这一个 PR 进合并队列；合入后统筹关掉各片 PR，评论写「已随批 PR #X 合入 main `<SHA>`」。privileges.md 与登记册按片记，同时写批 PR 号。
2. **组批按路径**：同批的片优先是改同一批文件的（页面资源 `page-assets.json`/`APPROVED_CEILINGS` 一组、`SECURITY-INVARIANTS` 的 S 号一组、巨大单元 `baseline.json` 一组、同一插件包一组）。共用文件的冲突统筹在批分支里**只解一次**：BACKLOG 两边并列；`baseline.json` 跑一次 `check-health-gates --update --base origin/main`；页面资源在批分支上 `pnpm workspace:build` 后 `page-assets.mjs --update --base origin/main` 重量；S 号按合并顺序在批里一次排定。
3. **叠层整条落地**：叠着的 PR（如沙箱 #1119→#1139→#1143→#1144、#1130→#1157）不逐层改 base、逐层同步，而是顶层（或批 PR）一次落地，下层合入后关掉并注明。
4. **作者不为共用文件同步**：BACKLOG、`baseline.json`、`page-assets.json`/`APPROVED_CEILINGS`、S 号、`pnpm-lock.yaml` 这几类冲突，作者不合 main、不推；只有真代码冲突（同一函数、同一测试）才由原作者合一次 main。功能 PR 不再提交 `baseline.json --update`（CI 不读它，批 PR 里统一刷新）。
5. **还走单个入队的**：`full` 空、和队列里别的 PR 试合不冲突的小 PR（文档、单文件修复）照旧单个认领入队；入队前统筹用 `git merge-tree` 按队列顺序试合，冲突的就并进下一个批 PR，不入队等着被踢。
7. **`baseline.json` 冲突一律取 main 那一侧**（10-24 10:1x 补）：CI 不读这份文件，快查只拦「比基线大」，main 那一侧的数字对本 PR 只会更宽、不会误拦；不用跑 `--update`，也不为它单独同步。真正收紧由统筹在批 PR 或定期一次 `--update --base origin/main` 做。
6. 合并队列本身已是「最多 5 个一起建、一起合、全绿才合」（ALLGREEN），不改仓库设置。

8. **macOS 专属文件要在本机补跑**（10-24 加）：CI 的全量带 `--skip-macos-only`，Linux 上不跑 Seatbelt、Keychain、launchctl、Swift 一类的 28 个非浏览器文件（清单由 `scripts/ci-linux-probe/select.mjs` 的 `classifyFile` 标 `darwin` 且非 `browser` 得出）。批 PR 入队前，统筹在批树上本机跑一遍这份清单（构建后、全量期间以外的时段，走机器槽位）；红的归属与修复按全量的规矩走。起因：batch-26 的沙箱叠层让 `agent-built-plugins-checks`/`-workflow` 在 macOS 上红（创作台 SDK 声明漏带 `services/materials.d.ts`），Linux 全量看不到。

## 2. 顺序与现状

> **统筹 10-24 晚（Claude）**：
> - 载体 #1236（batch/1024-33@331）已19:02:08Z actual merge `bde02c59eb9a1d794a442419570819a80585708a`。原Claude唯一队列自然完成，未重复调用。#1223已Claude6388301030关；#1109/#1112已专职6388316807/6388317402核包含后关闭并归档。实际工程片与旧8指定合并目标已闭环，各nonblock/W5整线保留。
> - 下一批（按路径）：ac-kernel #1226/#1227/#1228 → ac-clients-1 #1229+#1232 整条 → Codex #1231 → ac-coding #1230（BL-521 第二片并进来）→ PG-017 P1+P3（一个 PR，待开）→ S-57 X1～X4（一个 PR，等前三个进批再开）。都要先「二轮：可合」（§0）。
> - 远端分支清理（用户 10-24 晚：「已经合入的就可以删」）：96 个已合入的远端分支已删（PR 合入且 head 相同 44 个；head 被已合 PR 包含 34 个；集成分支的每个来源都已合入 18 个）。未合入的保留，含 `ac-kernel/s57-x4-binding-cleanup`（X4 的旧版，`s57-x4-bindings` 已取代，X4 合入后再删）。本地删了 batch-29 两棵、`baseline-main`、`/private/tmp/handoff/batch-1023-12` 四棵工作树。
> - #1235（Images README，原1212P2）已18:34:28Z actual `7d25794e9e7d9985bf22b863ac57b6d0e2dc6b90`；固定52c、二轮/TEST/适用CI/试合/一次正常queue均核，原P2仅该项已6388326951关闭。
> - S 号按合入顺序定：`scripts/gates/security-invariants.mjs` 要求 S-01 起连续、不跳号，所以分支里都是暂定号，统筹在批分支里按落地顺序定正式号。main 现到 S-65；#1234 进 batch-34 定为 S-66（P1）、S-67（P3）；S-57 扩展 X1～X3 原先暂给的 S-71～73 改成到时接着排（若紧跟 #1234 就是 S-68～70）；ac-trust、ac-artifacts 设计稿里的号同样只是暂定。
> - 统筹裁（10-24 晚）：
>   - R8 余项选 A：一个 PR「删 typed 通道」（删 `registerCapability` 与 typed 登记、调用支；删 `services.capabilities`/`PluginCapabilityClient`，调用方改走 `services.actions`；`HostCapabilityDefinition` 留作 `ActionDefinition` 的身份基类）。外部 API 不留兼容期，创作台和 Alchemist 不能弄坏，跑全量。
>   - PG-022 由 ac-sandbox-sched 先合一次 main 解真代码冲突，#1234 二轮可合后开 PR；BL-490/491 叠在它后面。
>   - 远端分支 `claude/ac-pg017-p2-fetch` 等 p2e 落地再删。
> - #1236同331 full40117579239十六worker+aggregate成功；PRCI十四适用成功。Mac原26ts+native-checks补项合27唯一文件，首红/定向恢复保留；selector七态最终attempt4 exit0/清理0，非真实Home/模型执行/本人验收。最终queue40122786015/Verify120959586844成功，10成功/3条件skip；TEST继续亲读full分母/retry/skip，不把17成功元数据说成所有case首绿。privileges/spec状态按Claude原计划随batch34一次更新，不另开状态PR。
> - **batch-34 已开**：批 PR #1241（`batch/1024-34`@`1b2183a23`），全量 40127827015 在 `integration/carrier-1024-34`（同头）。含 #1227 #1228 #1226 #1229 #1232 #1231 #1230 #1234，另并 `privdocs/ac-kernel`@`868ab3f76`（PG-007、PG-031 状态格，S-57 扩展片 X1～X4 与 §4.1）。#1238 与其余各片没有共用路径，Codex 按 §1a.5 单独入队（6388851739，统筹同意）；它先落，#1241 合 main 时吸收。本机冲突处 13 个文件加 26 个 macOS 专属文件，39/39 通过；health、boundary、page-assets、secrets 都过。8 个源 PR 已留言「不要再推」。
> - **10-24 20:20 统筹**：#1238 已单独落 main（`584112c65`）；batch-34 合 main 吸收（树与全量头 `1b2183a23` 相同），另加文档提交 `838dd20cf`：PG-037、PG-044 标已做（统筹核过）。#1239 FIX4 `5e1d8a29` 二轮 REVIEW 6388795634、TEST 6388887188 都通过，等 batch-34 全量跑完进 batch-35（storage 类，要全量）。派单：ac-coding 队列做完，接 ac-trust T1（BL-563 先核）；ac-sandbox-sched 摸底 Feed/Inbox → Runtime，先写拆片文档；ac-sc3 开 Goals S9-0b PR（S8b、S9-0 已随 batch-27/28 合入）；ac-review 一轮 #1242（先）、#1243。
> - 下一批候选（batch-35）：#1239（C2 原作者修中，严格钉住，用户已定）、#1240（FIX1 修中，删除被坏记录挡住那项已升为挡合并）、ac-kernel「删 typed 通道」（统筹已放行开 PR）、ac-clients-1 W5-04 第 2 组（files、schedule、shelf、git，已放行开 PR）、PG-017 P2e、BL-490。


> **当前唯一定时调度（用户最新明确、Root已官方工具读回）**：只有Root `01a12a80-ede2-7b81-93ea-521a5abcc35c` 的 `molis-work` 每10分钟周期巡检；其他定时任务维持PAUSED。本次只改变周期发现来源，原职责和交付直达接续不变：新PR交REVIEW、可合并项交流水线执行、新独立片交对应实现、有效Review问题交原作者/修复、修复新head即交REVIEW增量复查并按风险交TEST；固定头/证据直接传递并抄Root，不等heartbeat或Root二次许可。Root负责周期发现、初始派单与复杂裁决，流水线/专职不恢复自己的定时器或周期扫描全项目。Claude整线范围/优先级/唯一full排期、既有owner和单writer/公共资源槽不变。
>
> **当前合并执行（batch34 actual已核）**：#1241固定931已03:16:55Z实际df552、8来源03:19:01–32已原Claude关闭且逐个祖先/实际tree包含已核，不重复queue/关闭/统一full；#1231 C1 RAC115本片现实际落地。batch35对34的真实依赖已解除，其余候选/正式审验与统一组合仍原Claude。1250官方构建目录等级已6392849194裁host，原FIX1最终cf63已交独立修复增量审验/source释放；1251/267四nonblock早已双PASS，不因后续统筹摘要重复派修。SDK FIX7代码42ccc/349ad包已独立双PASS，a0e8仅文档不变SDK，C2 Snapshot支线串行采用/原App回归待且build/pack释放，C2接必要整体build，完整C2未交付；原首败/未验证范围保留。


> 2026-10-24 16:35 UTC **本轮新授权只此8旧目标，1222最高优先**
>
> **一骏新明确合并授权（Root刚转达并鲜核8个）**：“把1225之前的除了memory相关的非draft PR（784，734也除外），都解决合并掉”。准确集合 **1109、1112、1209、1210、1211、1212、1222、1223**；Memory实质相关（包括Memory base的1196）、784/734与其余Draft排除，不自动Ready，不自动扩新PR>1225。可用清楚包含旧目标的合规carrier，不混未经授权新目标；旧非阻塞owner责任保留。#1198原单独任务独立继续，Root据四完整PNG交叉同bytes/空toast无匹配button已判剩6px非本分支回归，底层仍UNKNOWN、formal exit1/阈值0/首败全保留、无新capture/算法/期望图变更；可Ready正常队列，不挡这8目标。
>
> **立即最高优先1222（用户再催“修了1222，有好几个应该就能直接关，快”）**：source owner仍原Claude `ac-batch29pr`，不重复writer。remote acf89a9cc4b16a1442349c8c725d4557363ae955/DIRTY/checks[]；现成local a788e1a413f8ffce6d60c922f3c18092e9b343d3=acf+actual2dd，Root已薄核5处remerge/两FIFO测试零diff，REVIEW6386623257已关闭取消P2。真正待修是b29m2-focus119文件116过3红：Cognia390两场景上级.cognia-list display:none阻住68/148点击（非timeout），cognia-mcp45s取消、home-aggregate末两15s取消；build exit0不等focus全绿。已6386688449公开急单返当前原writer，TEST复用full32对应raw/生产fixture基线只读归因，不能一概负载/flaky/改断言/新起重复full。修实缺口→仅必要差异验证→固定newhead/实际diff/raw DIRECT REVIEW/TEST→normalpush/正式适用CI→唯一正常queue→actualmain SHA/四固定头包含→立即关1209/1210/1211/1212；不等1198或其他新片。共享曾计划full-suite，目前API未见新头/CI/label，不把计划当已运行，统一full仍仅Claude决定。
>
> **source接续变更**：C1已实际START RAC115，managed c1-uninstall-inspection/goalboard、branch anticorr/codex-w5-13-browser-input、准确base2dd，32openPR全路径无冲突；按Root让当前有界片安全fixed/release。之后source优先这8旧PR真实修复，**不再按旧条件立即开C2B2b**；B2b完整合同/原owner保留后移，Root/Claude最新具体WO覆盖。FIX1只读1109/1223已有owner/承载及真实障碍；FIX2只读1112：对2dd六真冲突已Claude现成integration-33/d3cd76473e38ce4930548063ba81a99758e37906解决，08b与2dd均其祖先/树clean，但无remote/PR且夹1226–1229新片，须按本次边界与Claude明确选carrier，不另source重复sync。所有8当前fresh仍DIRTY、无queue；1109有旧autoMerge（10-23）不等已入队，不重复调用。


> **Full34实际落地（精确931）**：#1241固定93176d8b596a9db2266f93490e80acd8b9f487d2已于2026-10-25T03:16:55Z squash为df5527f278fa8e631919794d15c52cfd3f364155；PIPE鲜读PR merged=true/closed、main ref同df552、Git commit单parent52560f32c5dec529315d11eff95932c2ea1d7dff，tree4f4153fcc9fb1027ab71613d4d82ea8112a665be与6390676409原已审试合树完全一致；实际parent→merge compare207files。8个精确来源头1227/5bdd、1228/ed398、1226/1d400、1229/c2a665、1232/887b、1231/bf09、1230/c887、1234/7cfff逐个compare确认都是931祖先，原Claude已在03:19:01–03:19:32Z关闭全部8个（源PR为CLOSED/merged=false，经批落地，非逐个另merge），PIPE未重复关闭/催领/queue/full。原机械REVIEW6389956493、CI40135257938/Verify121001095371及Security/Product成功、full40135252991/aggregate121005086286成功与TEST6390355377继续有效；Linux1407−29Mac=1378唯一文件，1377首过/resident同40:47一红唯一retry12.6s过，quiet skip/todo不冒0。Mac TEST6390628942核29项：25旧39原件/闭包继承+1同树Mac CI+3必要缺项真实28/28，总308/311，1可选联网/2缺shellcheck明确未执行，非311全绿；原首败/旧1b三红及原两CI因果UNKNOWN保留。resident独立6b候选未含931或本实际树，仍双PASS待Claude另吸收，不因本批actual关闭其实施责任。batch35对本批实际合入的真实依赖已解除，其余组合/首评/CI/full/actual仍由原唯一Claude继续，不关完整C1/C2/R38或整条防腐线。实际包含/关闭原件：/tmp/molis-batch34-actual-20261024/landing-proof.json；原Linux与Mac raw路径保持，不重做有效审验。
> - #1239/5e、#1240/2f、#1242/b86、#1243/3a均已修后独立增量双PASS/源码冻结，Claude各公开6389034355/6389034698/6389189085/6389189534认领35。1243批内BL545/546与clientServed只剩Lingguang；1242保hostDependencyCheck/去filesOutputsRefresh与新的内部port测试均由carrier实际组合核，不把叶头已PASS冒组合完成。
> - #1244已actual5256；1245/e34、1246/d428、1251/267均修后双PASS并公开6390618803/6390618984/6390619194固定候选交Claude排carrier。1245与T1真实schema/四dump/版本维护同组、1246保先files→KV→发布，1251保C2独立hunk；不能把待收候选记成已吸收/actual。
> - #1249/516已Claude6389882200吸收35/双PASS；#1252横向8abab已source释放/TEST6390184579 PASS、FIRST6390137797尚待。实现1 C4只余Claude三项WO，完整C1/C3仍保原owner。


**batch35组合合同补正（Root核源码/6389783641已传Claude）**：b86 browsingWorkspace仍query，action-call-log70–74成功非command不记行，838已registerAction/actionService；“删typed后动作每次都留行、必然污染首路由”不成立，不能登记为已证产品回归。原Claude carrier可做窄Host内部项目读口：同可信project/runtime、同workspacesFor/Catalog owner+ProjectBrowsingSettings.read投影，保null/多目录未选/撤关联/失效目录及成功每平台一次/失败重试/broadcast-drain；不复制SQL/算法、不信请求project、不向SDK/公开动作暴露绕权入口或扩写权限。无号用例仅限正式装配+内部读成功+本请求无其他实际记行调用时首400/413；真失败/缺依赖/其他实际行仍须号可查、正文头一致。call-scope/formatter/ActionCallLog不改，不用新scope或抑制记录；FIX1不为35预做。合同裁决不等实现/验证通过。

**1245/1250实际四dump同hunk（Root核过，已补6389738857）**：tests/fixtures/goal-event-history/{legacy,mixed,approved,approved-completed}.sql及README双方同改。FIX5仅同步Attention DDL/两部分索引/候选版本，历史业务INSERT、独立v9拒绝样本、helper/生产/断言保持；action-read-compatibility四红为静态v9被候选v10严格拒绝，未证读取兼容回归。唯一carrier合成时保T1 trust+本题owner两套字段/索引并统一版本，不任选一方v10盖另一方。

**C2↔1251窄hunk接续（已补6389927962）**：1251固定267的Artifacts测试module import/workspace apps-local-host记录与C2 #1254固定19cc的stdio argv/agent-host storage依赖记录是独立hunk，carrier保双方；A已有实际63files diff，不再是未交候选。共享production-action-mcp-server按trusted resident origin转发，保五消费者真实授权/撤权/锁拒绝，不绕storage.owner.busy。Memory当前删除owner要接同一技术presence，不回旧predicate或整取A旧业务文件；必要真实合同/共享hunk由carrier一次合，尚未包含/actual不冒完成。

**#1254 修后双PASS固定候选，完整A首评/集成待**：FIX4一次normal push原PR为b5211d8a5b9557783710ea7574a5e6d26751701e，direct parent19ccdfa8ed41fee58038e9cedcd43abf3f48e65d、准确merge-base bde02c59；PIPE鲜核远端OPEN/非Draft/同头/未merge、本地clean，8files290/-44实际diff与final.diff逐字匹配，整PR65files2090/-340。公开交付6390986767/原P1 TEST6390714218/唯一claim6390715632。初始化Promise从创建保close，失败实例仍可显式重试待清理Set，成功资源不重复、全部实际关闭才还borrow/owner；Host持句柄接dispose/下一显式ready，已接纳ready保原结算/关闭中不注册或替代，Memory先SDK未改。仅两生产文件prologue-node/agent-host-composition，未改storage锁/snapshot/CLI/SDK包/门禁/baseline。原公开探针19cc真实exit1；相同故障修后退订2、合法再初始化/关闭/父释放/owner重取，6新例/真实Host并发与跨进程同inode原件已交。首30为29/30（真实已接纳ready契约回归，未改原断言），修生产后8files50/50；30unique208有效并集，不冒同头30首全绿/环境归因。原build/strict/Biome/70boundary/准确MB health/0of1431混载/27资产快查/doc/最终70冻结/提交后2110行secrets等原件齐；digest3dc3cbdb10962d8745056dc92c3c6a0294951b4fb56c06293c5e779bc04dcdcb匹配manifest。REVIEW6391028363/TEST6391043853已固定b521修复增量双PASS，本题原P1 6390714218在本增量收口；TEST独立同故障连续两次退订拒绝后明确close退订到3，父/另进程拒绝仍保，下一SDK正常/父release后另进程取得原inode，模型0/exit0。已6391059350交Claude以当前固定b521接完整A FIRST与唯一carrier/full，不把请求或修复双核当完整首评/actual。精确b521同头CI40143551496/attempt1现completed-success：15jobs中14success、原可选Linux probe 1skip，Verify121021156673及Security/Product两片均成功，原末两job121020084173/121020084206已success；已补原候选交接6391059350。完整A FIRST/唯一carrier-full/actual仍待，不因CI绿列Ready，不挪原19ccCI。原A369分阶段/live/Studio/类型及117建议/Claude完整FIRST与唯一carrier/full/actual仍待。保有效树pr1254-init-cleanup-retry/goalboard@b521供核验，source/公共槽已释放不提前归档；C2独立snapshot继续，后续仅组合本8文件相关hunk，spec保其开头/完整snapshot合同，不能整文件覆盖。原件/tmp/molis-pr1254-init-cleanup-retry-20261024/handoff.md。

**C2后续局部消费者候选**：Alchemist MCP原104有限批首红后，原实现2已本地固定e2d2ea19dee474bc3aaf788a0c86ba2f06c09c7e/direct6ef，两fixture文件56/-30，单resident+多真实stdio/管理grant与原拒绝断言，作者2/2及13+6过；REVIEW6391660103/TEST6391693958两文件窄双PASS，已6391709960交原Claude A carrier；实际运行使用build4+三个snapshot技术overlay，不冒纯e2d/A构建。A1254当前b521未含；最终A适用full/载体只吸此2-file独立commit，不合整snapshot checkpoint（包括本地4f7e95c2f，仍含SDK正式已知红），不以局部或计划吸收冒已合。SDK新认证能力仅属后续完整snapshot依赖，不扩A现有首评/合入范围。

**C2 A已固定交付与snapshot接续（23:06UTC）**：#1254非Draft固定19ccdfa8ed41fee58038e9cedcd43abf3f48e65d（原base bde、63files1820/-316），作者FIRST6390526610已实际请求/TEST已直收；原树冻结释放，完整FIRST仍待，原TEST6390714218恢复阻断已b521修后独立双PASS收口，当前完整FIRST/统一集成待，见上，不重复派首评。唯一slice A/RAC105-A01～10交早期同inode opaque Home lease、SDK一次borrow、真实stdio可信转发与必要消费者，production指纹b1226d8034e904984a4c0054b373a6de4a2a6b4d42dab18532582a70b3aa4f3d。337首批自然328ok/9fail和相关复验原件保留；同步preflight无业务资源窗口已修，Memory.close→SDK及Alchemist原开始时序/全部实际成功后还lease保持。Studio HTTPS分支与干净bde同断言TLS/400红、首份不同正文UNKNOWN保留；3可选live未执行/历史strict诊断不能称全绿，affected full非空/117建议项未跑，统一full只Claude，raw /tmp/molis-w5-16-home-lease-delivery-20261024/handoff.md。Root已授权原实现2下一完整snapshot，已实际新树w5-16-home-snapshot/goalboard、branch feature/codex-w5-16-home-snapshot、组合基点2b7d8133541deaa9d6ad79eaf5ac0e5ae9a19f97=actual5256+A19+B2b5e，已核HEAD与同一slice的完整命令合同改动，现实际实现、不等A CI/full/merge。冻结A/B来源不改，registry/插件ledger窄只读由事实owner供给，不跨owner复制SQL；新同hunk逐项协调。统一restore/RAC107–108仍本C2后续，真实Home/Keychain/用户验收未动，A/snapshot局部不代表C2整线完成；Memory现eb相对c8的A proof/技术presence hunk无新增，保其authority/observer/删除owner独立实现，不采用整Draft。

**C4已授权下一独立片**：实现1 C3 Gmail516/横向1252-8abab source/TEST均已交齐，完整C1/C3仍未关闭。FI3 c986已统筹审过且分支实现，OAuth归connection_services[].auth.methods、非token当前只有kind且SDK拒额外字段；C4须同改合同/SDK/Manifest生成JSON/消费/API而非另登记。6390280424已收敛仅三项待Claude WO：RAC号段/固定base是否叠FI3、OAuth与MCP_SERVERS/CONNECTOR_CLIS本片或后续、generic三特例/三callback边界和X3 refresh签名。现有Gmail并非纯函数（有pending/config/token），Catalog已有Notion协议；不凭顶层目录推无实现，不替换成新总spec。平台state/回调/secret/连接提交/地址校验/撤权尾检已定沿用，API origin与OAuth endpoint用途分开；R48是FI3工厂取法归ac-kernel/PG045，T1官方host/unsigned另待6390190197，由FI3/T1 owner接enableOnce安装身份，不给所有外部definition host。收到可执行WO立即实现，未知共享合同局部等待不等旧PR CI/full。

「就绪」只在 1～5 条全满足时写「可合」。

| 序 | PR | 内容 | 依赖 | 批 | 现状（按行最近固定头与回执读取） |
| --- | --- | --- | --- | --- | --- |
| 原PR同轮修复 | [#1230](https://github.com/molis-ai/molis-work/pull/1230) | BL521 opened失败重试/缺能力误报/S54引用 | 固定 `c887e11c985632b1f5add9a3f83a4dd503bf0f8d` | 原整功能按Claude batch34；仅修复增量full=[]不替原全功能要求 | FIX1源码释放；二轮6388234113、TEST6388250799 PASS，62唯一文件563项有效，真实旧3红→新8/8；drain/时间契约不变。CI40122537049最终结果与共同生成物/full由批接续，未实际merge |
| 原PR同轮修复 | [#1228](https://github.com/molis-ai/molis-work/pull/1228) | PG007提供方常量/权限声明来源 | 固定 `ed3985f188856e829fd5233aa23ada80cd8a26b5` | Claude batch34 kernel路径 | FIX3源码释放；二轮6388105405、TEST6388119074 PASS，80唯一文件706项有效。线程原需model:invoke子结论已据实际链纠正，Search只迁合法fixture不生产放行。CI40121335561与最终批适用full另核；FIX3现#1226 |
| 原PR同轮修复 | [#1229](https://github.com/molis-ai/molis-work/pull/1229) | Workflows过时注释 | 固定 `c2a66516784bb1c6341ccecdd2b6eec5de343bc4` | 和#1232整条入Claude批34 | FIX2仅注释+2/-1，去注释JS完全相同，断言/语义未改；二轮6388272667 PASS、语法/diff/secrets0。不是整个原功能已合或可按纯文档小PR单合 |
| 原PR同轮修复 | [#1232](https://github.com/molis-ai/molis-work/pull/1232) | Pages CI真实DOM与minify测试核实 | 固定 `887b8ee76361289cd46eec27a0e85569776c5243` | 随#1229整条Claude批34 | FIX4源码释放；二轮6387989321、TEST6388063111 PASS。实际词仅i18n脚本，真实UI三变异均拒；灵光23209B内容/served一致。旧3/4首败/最终4/4保留，生产/门禁未改；FIX4现#1239 |
| 原PR同轮修复 | [#1234](https://github.com/molis-ai/molis-work/pull/1234) | PG017 P1+P3本轮全部意见 | 固定 `7cfff92a06b80655c9f823f2954498c5c73c98f3` | Claude批34共享核心/full，S66/67由批最终排 | FIX5源码释放；二轮6388064603、TEST6388103144 PASS。broker-stop/双目标取消/真实Host客户端拒绝与S20引号真实红绿，17文件175PASS+1可选公网skip/3Seatbelt实际执行。CI40121503241/批实际full另核，生产background接线整线未闭；FIX5现#1238 |
| 修后候选/冻结 | [#1239](https://github.com/molis-ai/molis-work/pull/1239) | C2 B2b本轮全部意见 | 5e1d8a29156509d6fc51f75fd5bcc17316e3f225 | Claude batch35/storage full | 固定 `5e1d8a29156509d6fc51f75fd5bcc17316e3f225`；REVIEW6388795634、独立TEST6388887188 PASS，17唯一文件112项/README15核齐，CI40126669798十四适用成功。用途AAD仅Home payload，vault无AAD原读不变；全批32MiB/10000节点/128MiB密封串、严格原backend恢复/S12已核。Claude6389034355认领batch35/分支冻结；四共享文档hunk已释放供C2 A，两个index/Host README本轮未改。旧b9首败、006/Keychain范围保留；storage/full和actual仍待，不关闭C2。 |
| 修后候选/冻结 | [#1240](https://github.com/molis-ai/molis-work/pull/1240) | RAC117严格读写/项目删除 | 2fcb3d63cdf8cfae08c09969ebeee0f552b22d99 | Claude batch35共享核心/full | 固定 `2fcb3d63cdf8cfae08c09969ebeee0f552b22d99`；二轮6389023445、TEST6389093483 PASS，旧8绿/26新红→核心34/34，123唯一文件1856/1856、README65齐。owner窄listIds不受坏launch_args阻断真实项目删除，原坏读internal500保持，非法写input_invalid/400、HTTP去强转。Claude6389034698认领batch35/冻结原分支，不独立queue；实际合入前不闭。 |
| 修后候选/冻结 | [#1242](https://github.com/molis-ai/molis-work/pull/1242) | typed通道删除及活文档收口 | b86b01c980effc3eeddf5d731766e83d9a668368 | Claude batch35/full | FIX5已正常push固定 `b86b01c980effc3eeddf5d731766e83d9a668368`，6c..b86仅两md+8/-9；二轮6389157109、TEST6389150085文档增量PASS。实际registerAction接线、R8待批状态及HostCapabilityDescriptor身份/__types__措辞齐，旧名不恢复。Claude6389189085认领batch35，原源码/full证据边界保留；未actual不关PG035。 |
| 修后候选/冻结 | [#1243](https://github.com/molis-ai/molis-work/pull/1243) | W5-04第二组及文档收口 | 3a3248f784a6b782204a1ef8c7d19d1f5ff35b69 | Claude batch35/full | FIX4已正常push固定 `3a3248f784a6b782204a1ef8c7d19d1f5ff35b69`，9c..3a仅两md+2/-2；二轮6389159203、TEST6389150305文档增量PASS。真实路径为specs/repository-anti-corruption/privileges.md，仅PG056一行和Shelf来源；整PG仍未完成。Claude6389189534认领batch35，批内BL545/546与clientServed名单由其统一。原133/browser raw仍待核、TLS首败UNKNOWN，无同断言基线；文档PASS不代整PR/full。 |
| 修后定向双PASS/待统一carrier | [#1245](https://github.com/molis-ai/molis-work/pull/1245) | Attention对象真实owner隔离 | e34b9130681e9d803c343d090fb958493d939f85 | 1250同组真实schema/维护/四dump冲突 | FIX5已一次normal push固定e34b9130681e9d803c343d090fb958493d939f85（parentf965），27files1048/-128/source冻结释放；REVIEW6390234023与独立TEST6390259895定向PASS，32unique524是有效并集，安全29+1/首fixture错误、历史7files26修正及四dump原INSERT/v9冻结拒绝都保。真实Manifest owner/两表nullable owner/部分唯一索引/跨owner拒绝与事务回滚、跨null全局status、旧Feed/Inbox/Goals/RSS隔离齐。额外strict helper plugin-actions.ts:27/30/80仍exit2，无old对照，不称类型通过或已证基线；原Feed/Goals其余README/Host/sharedcore由最终组合覆盖。#1250 T1与本片实际schema/CHECKLIST/currentfixture/四history dump+README/维护索引冲突，carrier保trust+owner字段索引、统一版本和S66，不选一方v10或两次9→10；/tmp维护演练不是真实备份/维护，S9-2/调用方迁移/full/CI/actual待。；固定候选交Claude6390618803 |
| 修后双PASS/待统一carrier | [#1246](https://github.com/molis-ai/molis-work/pull/1246) | 重装先清真实files/KV | d42891e3ff19449b01ab181279b35ab20c2617cb | Runtime sharedfull/1250装配同组 | FIX2固定d42891e3ff19449b01ab181279b35ab20c2617cb已REVIEW6389944823、TEST6390116338双PASS/source释放；20files269/-32，真实Project/Home四读/跨重启、先校owner端口→files→KV、完成后才候选注册/世代/save，失败与幂等retry/旧retain=true边界已核。36unique683无文件首败/runnerretry，quiet内部skip/todo不额外称0；指纹1f4d6116与manifest一致，旧80/661另保范围。FIX2已Root接旧1112三P2新题，d428仍保本题后续mustfix；当前作为固定candidate交唯一carrier，T1安装trust与1245 schema/维护同组真实hunk合，sharedfull/适用CI/actual未齐不闭Runtime。；固定候选交Claude6390618984 |
| 修后双PASS/已由Claude认领批 | [#1247](https://github.com/molis-ai/molis-work/pull/1247) | FI1稳定规则引用 | a7f47a3a573b0335437439a41dd68aae20e83732 | Claude batch35/fe86d5cec，sharedcore full | FIX6固定a7f47a3a573b0335437439a41dd68aae20e83732，6files+95/-9已独立REVIEW6389827852、TEST6389846644 PASS；73unique/644各有通过记录、README61齐，原69批66/69+5时限取消/RSS late activity仍UNKNOWN，三原失败jobs1 32/32恢复不冒一次全绿/known-main。Claude已6389853469实际认领吸收batch35/fe86d5cec，index导出冲突保两边FUNCTIONS_PROVIDER_ID/publishedFunctionReference，三包构建已报过；batch35 local-host三type红由其ac-kernel当前owner修，不重复writer。新CI40134554188的Security/Product仍在途/Verify尚待，sharedcore/full/actual/PG034仍Claude，source冻结释放不再推。 |
| 修后双PASS/固定候选待Claude排批 | [#1249](https://github.com/molis-ai/molis-work/pull/1249) | C3 Gmail等价纯拆 | 516bd00d3c4aa349fb413634034001fa0bc32987 | full非空，Claude唯一统批 | 固定修后516bd00d3c4aa349fb413634034001fa0bc32987（parent87a），FIX3仅四行测试等价注释；原FIRST6389735163唯一nonblock已落实，REVIEW6389854349、TEST6389873756窄增量PASS，source冻结释放。移除4行原文byte一致，原115/91300d94工程证据绑定87a继续有效，不改称516重跑。CI40134883070新头在途；Claude已6389882200认领吸收batch35/cca312d89，full非空、公共生成物组成树统一，未actual不闭来源/C3/C1。 |
| 修后增量双PASS/待统一carrier | [#1250](https://github.com/molis-ai/molis-work/pull/1250) | T1信任/同意账本 | cf63b8e9e50f8e76d7422c96df7488a1e637e3e3 | FIX1 sole6390172876，原FIRST6390022295+Claude决定6392849194 | d4..cf63三提交8files173/-10，一次普通push/源码释放，REVIEW6392993542/TEST6393061723精确cf63修复增量双PASS。等级定稿只2文件注释/spec/token不变，32unique616/build70有效复用，准确MB584 health/最终2109行secrets过，旧首败/原334未认证边界保留；mergeable=false，carrier统一1245 owner+T1 schema/维护/四dump、保1246先清后发布。cf63最终03:33UTC暂无workflow runs，修复增量已双核，最终CI/full/actual未齐不记Ready；不重复source同步或新full，不泛赋外部host/混FI3/R48/C4/T2 |
| 原FIX5修复中/不可入队 | [#1255](https://github.com/molis-ai/molis-work/pull/1255) | BL490 Home沙箱库 | d0f6cc53b88930b7ffe5ad016a2f2a34012febb9 | Root START/FIRST6392998821/sole6393025853 | 2阻塞+4有效项由FIX5独立单题收口，具体依赖/六项owner见CODEX-TASKS。不重派首评/原40文件；原1245e34双PASS仍冻结待carrier。PLIB03须在真实schema/ledger效果前拒绝，release版本走原共同路径不改门禁；retain=false对native/sandbox同名选项的一致目标/本片范围已6393081731交原Claude裁，仅该清理hunk等，C2三具体hunk局部协调。固定后独立REVIEW/TEST，实际CI/full/批次/actual仅Claude，不记Ready |
| 修后双PASS/待统一carrier | [#1251](https://github.com/molis-ai/molis-work/pull/1251) | A2b四项已修并双PASS，不重复派单 | 267ffa225ea1630fe3a9a50bf34559068ce2f4c5 | sharedfull/实际hunk组合/同headCI待 | 固定267ffa225ea1630fe3a9a50bf34559068ce2f4c5，7d..267共9files42/-38，REVIEW6390380705/TEST6390400572修复增量双PASS/source冻结释放；16unique122首次全过/0skip或retry，公开指纹56c4b309与实际manifest一致，首次冷build并行boundary失序原件保留/正式串行boundary等通过。四项文档、真实跨包store→purge保异项目、删无用module声明出口、consumerTypes合现schema、递归576TS/153nested齐。原123三类失败/作者环境或known-main归因未认证，3browser未跑及full仍交carrier/TEST；原raw请求6390190399。最终PR正文已Root交FIX6仅metadata重写且实际fetch读回逐字一致，去已删文件/纠正归因，无源码/CI重刷；当前mergeable=true不取消batch真实hunk/同headCI/full/actual条件，C2 argv/Host/A6未动。；固定候选交Claude6390619194 |

| 新完整片/首评待 | [#1252](https://github.com/molis-ai/molis-work/pull/1252) | C3四横向巨大单元纯拆 | 8abab965c1f75bfb1ae1f695530a5d1a1312309f | FIRST请求6390137797/TEST6390184579 PASS | 15files533/-412/4→0，28unique205无skip/retry/构建API等原件核，未跑两非直接browser/selector，full仅Claude/共享生成物统一，原C1/C3不闭 |
| 新完整后续/首评待 | [#1253](https://github.com/molis-ai/molis-work/pull/1253) | 1112遗留三P2完整文档+实操 | 22537bd078fabda259b751d18134b287b42be55e | 原FIX2/作者已FIRST请求6390374472不重复 | 6files70/-10/7file119作者证据，构建期Skill范围/映射与真实Files冷/热目标已交，原1112已actual不重开；FIRST尚待/TEST6390447468 PASS，CI待，按实际affected决定独立queue或carrier，不关PG060 |
| 修后双PASS/待完整A首评与统一集成 | [#1254](https://github.com/molis-ai/molis-work/pull/1254) | W5-16 A初始化清理真重试 | b5211d8a5b9557783710ea7574a5e6d26751701e | REVIEW6391028363 / TEST6391043853，候选handoff6391059350 | direct19cc、8files290/-44，原P1恢复阻断本增量收口；TEST连续2次清理拒绝/显式真恢复与另进程同inode0模型证实，30unique208有效阶段/首败保留。精确b521 CI40143551496已completed-success，14success/1可选probe skip，Verify121021156673及Security/Product两片均过；完整ClaudeFIRST/117建议/唯一carrier-full/actual仍待，不列Ready。F4源码和独立阶段释放但保后续mustfix/有效树，C2 snapshot独立继续，不关整C2 |

| 19 | [#1129](https://github.com/molis-ai/molis-work/pull/1129) | W5-03/04 Todo 片（样板）：客户端打包成 TS、稳定翻译键；`todo.js` 61,976→54,090 B | — | `full` 非空（assembly、deletes-code，102 文件），进下一批 | **已关闭**（10-24，统筹）：同步 main 后树与 main `1dedc1f5c` 相同、0 个文件；Todo 片内容随 #1132 合入，batch-17 已覆盖 |
| 28 | ~~#1140~~ | SC-4 残留：BL-485/486/488 | 作者已关闭（第三层）；分支 `migrate/sessions-sc4b-runtime-leftovers`（`259a5fc84`）留着，#1113 已合，作者改开 [#1157](https://github.com/molis-ai/molis-work/pull/1157)（叠在 #1130 上，第 39 行） | — | 最终候选 `e387dc98167679751288f8c8cf6d168abc625c7f`，作者6379640966交付：合下层78与b640，保留fb22双阶段断言；touch恢复原断言、真实pin配置增todo，报告4/4。已派独立最终review/raw核验，下一batch尚未启动 |
| 最后 | [#784](https://github.com/molis-ai/molis-work/pull/784) | QA与本人验收记录，非Draft保持 | 收尾合代码后；文档重号FIX1独立短窗 | 按实际diff判断full | 两真实BL400待做保留；**旧BL595预留撤销**（Claude595–604已给ac-kernel），tmp提案已标STALE并改名proposal.STALE.patch。实际source窗鲜核main/在途/共享及活引用后定唯一新号，不盲另占；未实施、不关QA/本人验收，准备不算闭环 |


新开的开发片 PR 由统筹按依赖插进本表。



## 3. 已合

- 10-24：#1236实际bde及三个来源关闭已逐一核实，见本表精确SHA/证据。原Claude远端/自身树清理由原owner完成；各原首败、独立审验和非阻塞后续责任均保留。

- full40117579239独立TEST6388533532已PASS：16worker全checkout331，源码1398减27Mac=1371唯一文件，11×86+5×85无重/缺；1370首ok（含5全skip）+Cognia SYS15/390首3/4、原策略唯一retry44.8s过，最终1371/1371/零最终红/零known-main豁免。首轮Node9016=9001pass/1fail/14skip，retry无逐case打印，不虚构首绿；同文件旧文档不证明同断言基线。raw `/tmp/molis-verify-2026-10-24/full33-331cd096-test/test-handoff-full331.md`。此为331证据，不声称测试后续main整树。

| PR | 合并提交 | 日期 |
| --- | --- | --- |
| #1241（batch34） | `df5527f278fa8e631919794d15c52cfd3f364155` | 2026-10-25T03:16:55Z（固定93176d8b596a9db2266f93490e80acd8b9f487d2；singleparent52560/tree4f4153fcc9fb1027ab71613d4d82ea8112a665be=原6390676409已审试合树，实际parent compare207files。原CI/full/Linux1378/Mac29及3明确未执行范围复用，原首败/retry/UNKNOWN保留；resident6b未吸收。实际merge_group CI40157394412同df552/Verify121062266666 success，13jobs为10success+3条件skip（Linux probe/Security/Product）；main push CI40157629118现completed-success，非补跑full。正常合并由Claude6392828767认领，本chat未重复queue/full。原件 /tmp/molis-batch34-actual-20261024/landing-proof.json） |
| #1227、#1228、#1226、#1229、#1232、#1231、#1230、#1234（随batch34） | `df5527f278fa8e631919794d15c52cfd3f364155` | 8精确源头逐个是931祖先，原Claude已03:19:01–03:19:32Z依次closed，PIPE实际API读回；源PR merged=false，非八次独立merge。PG031/PG007/R38本片/Workflows-Pages/C1 RAC115/BL521/PG017 P1+P3按各原scope落地，#1238已先单独actual584。保原1231 bf09、1226 receiver1d400修复与全部有效审验/非阻塞后续责任，不关C1/R38/整条线或真实Home验收；源头/关闭时间在同landing-proof.json） |
| #1244（C1入口失败/长连接真收尾） | `52560f32c5dec529315d11eff95932c2ea1d7dff` | 2026-10-24T22:31:33Z（固定07f5c3bd946bb61a824f823955f38f79852324fc，singleparent0a90/tree0d0b762d6c5446994fc44f2d908b6e5fde2f9a7d=实际merge-tree；整个PR七源路径→actual零diff/freshmain包含。6390299069唯一正常match-head/queue40138486257/Verify121006218732成功10+3条件skip，sourceCI40136634175十四适用成功；FIRST6389229048/REVIEW6390141133/TEST6390143106及53有效并集、原首败范围保持。6390492567已公开actual，/tmp/molis-pr1244-shutdown-streams-fix-20261024/merge-proof.json。F4恢复cold树已官方最终归档，原C1-b0d未动；非完整C1/用户验收） |
| #1248（Cognia SYS15测试前置） | `0a90a0ef2be7968e4c9bb41d1713f00e558444b8` | 2026-10-24T21:30:31Z（已actual `0a90a0ef2be7968e4c9bb41d1713f00e558444b8`（21:30:31Z），固定2eb60f7fca2faedc3c86f77594dd529a99ace0b0。FIRST6389394182/TEST6389383644、PRCI40130360806/Verify120987412283齐；6389709064一次正常queue40134060985/Verify120992960162成功10+3条件skip。单parent584/treee7d5776ebeff4eac03991aeac827aabc0a40e278=真实merge-tree，整个源→actual零diff/fresh main包含，6389793900实际闭本测试修复；非Full33唯一根因或整Cognia完成。 raw /tmp/molis-verify-2026-10-24/cognia-sys15-list-state-fix/merge-proof.json） |
| #1238（C1 RAC116日志） | `584112c65477baf907620d86657d1582d92e9eda` | 2026-10-24T20:04:11Z（固定55fc9f14715a574d122c87da479e516215748d55；singleparent87eb/treec93216c31636213bca439edbfa7e17929ed76114=真实merge-tree，四源路径→actual零diff/main包含。6388851739唯一正常queue40127689372/Verify120973494565成功10success/3条件skip，PRCI40124435473十四适用成功；首评6388105657/二轮6388469609/TEST6388652106及6388806251，README56齐，原首败与测试CI实际组成树边界保留。6389021706已公开；raw /tmp/molis-verify-2026-10-24/pr1238-fix5/merge-proof.json。本片实际落地不关C1整线/真Home/本人验收） |
| #1237（ImCtx类型P2） | `87ebba4c769557f9548d66310d76eb4e30b68bc9` | 2026-10-24T19:27:04Z（固定7ebef08b252f675891ae1eca91b84d7200bed349；singleparent bde02c59、tree1f9b385babfa64ae94d01ac436ef1d7fd56a4450=真实试合，12路径源→actual零diff/main包含。6388458800一次正常match-head，queue40124785872/Verify120965005904成功10成功3条件skip，PRCI40120148369十四适用成功；二轮6387881227/TEST6388153277有效，原1216P2由6388559951带actual闭。首导航失败/唯一恢复及uncovered启发式边界保留；raw `/tmp/molis-verify-2026-10-24/im-context-init-types/merge-proof.json`） |
| #1236（batch33） | `bde02c59eb9a1d794a442419570819a80585708a` | 2026-10-24T19:02:08Z（冻结331；真实parent7d25794e、tree972177be84f824edb61053c19909f930b725fe00=merge-tree(parent,331)。受测331只多两文档，生产/测试同；PRCI40117632751十四适用成功，full40117579239十六worker+汇总成功，queue40122786015/Verify120959586844成功/10成功3条件skip。REVIEW6387363344/6387547375、TEST6387369093/6387961395有效；Mac27唯一文件各首红/定向恢复及selector隔离fake边界保留，full逐case已独立TEST6388533532核1371唯一文件/最终全过，Cognia首红唯一retry恢复及14case skip保留。raw `/tmp/molis-pr1109-1112-20261024/landing-proof.json`） |
| #1109（随#1236） | `bde02c59eb9a1d794a442419570819a80585708a` | 2026-10-24T19:02:08Z（固定8921d80b2446bd791a2d8f6ab901ebc4047f45fd为331祖先，actual树包含已核；专职01a16f02已19:05:35带actual关闭，6388316807。Git上游结构字段/动作@2落地，source CLOSED非单独MERGED；专职交付归档，不关其他nonblock/整线） |
| #1112（随#1236） | `bde02c59eb9a1d794a442419570819a80585708a` | 2026-10-24T19:02:08Z（固定08b91a48447c284b342dd384be8124af44b49d61为331祖先，actual树包含已核；专职01a16f02已19:05:38带actual关闭，6388317402。W5-06/PG060该外壳片实际落地，旧三P2现FIX2新#1253/22537已实现且TEST6390447468 PASS，待首评/actual；318/full历史不冒首全绿，非W5整体或本人验收完成） |
| #1223（随#1236） | `bde02c59eb9a1d794a442419570819a80585708a` | 2026-10-24T19:02:08Z（固定ade38ec9c3f8e849bc8254bc1d85ccfb36fe7839为331祖先exit0，原Claude6388301030已19:04:01带actual关闭，流水线鲜核CLOSED未重复close；三行为问题及版本P2已修，agent.runtimes.v1保持id升@2。selector七态最终attempt4 exit0清理0，假adapter不冒模型执行/真实Home） |
| #1235（Images README P2） | `7d25794e9e7d9985bf22b863ac57b6d0e2dc6b90` | 2026-10-24T18:34:28Z（固定52c14058f931c074d5f58e46bcbd34d0397cad95；singleparent7a2b01fd、tree8433129ead69f321a217a8d2328267f7594d71ca=真实试合，仅README+4/-2。二轮6387516202/TEST6387748949、PRCI40117331601十四适用成功、queue40120134604/Verify120953043097成功，流水线6388326724及原1212/6388326951 actual关闭该README权限P2。其他原问题/旧full红保留） |
| #1222（batch29） | `0060920a314224b2eda6b71ee21b7e29323f6962` | 2026-10-24T17:17:56Z（固定a788e1a413f8ffce6d60c922f3c18092e9b343d3；singleparent191acc、actualtreec739f57f745958777bdd7d6ccfe43a0dbd43eb29=真实merge-tree191+a788。原统筹例外6387065309认领，PR CI40112378526十四适用jobs成功/probe预期skip；正常queue40114534899同actual006/Verify120935646372成功，queueSec/Product条件skip另记。REVIEW6386623257取消P2闭环、6387053343合main增量PASS；TEST6386748136为116首过+三后来过，非119首绿；原Linux FIFO首红及三focus UNKNOWN/取消不改写，未新增MCP观察或重复full） |
| #1209（随#1222） | `0060920a314224b2eda6b71ee21b7e29323f6962` | 2026-10-24T17:17:56Z（固定e20e68f0af2e519c333feb50fb062958cf7f22b7为a788祖先0；原统筹6387216568带actual于17:19:27关闭。B2a两must-fix已REVIEW6384019404/独立TEST6384047094通过，旧dbec空ct/BOM红及后续真实原始证据保留；仅Runtime配置密封/只读vault预检/离线raw维护片，C2 B2b/A/整Home恢复未完成） |
| #1210（由#1212随#1222） | `0060920a314224b2eda6b71ee21b7e29323f6962` | 2026-10-24T17:17:56Z（固定b6fb2d1124675c1ba61e31316278739a977ea91e为a788祖先0，含于d266；6387217164带actual于17:19:30关闭。PG017 P2c ownerFiles/声明片落地，原full29 S15启动红由d266修并独立REVIEW6384912989/TEST6384963617核；编号/注释FIX1与清definition失败FIX2三nonblock未实施不关，旧full红不改称首绿） |
| #1211（随#1222） | `0060920a314224b2eda6b71ee21b7e29323f6962` | 2026-10-24T17:17:56Z（固定087e2b15d2a8352bc073f98656361afc6afedc3f为a788祖先0；6387217787带actual于17:19:34关闭。PG086统一Characters动作读取/ac-review6384204115有效；坏记录整selector失败为Claude6384231304当前接受，注释/可读状态/单坏诊断/N²后续具体FIX1认领6384708923保留，未实施不冒闭环） |
| #1212（含#1210，随#1222） | `0060920a314224b2eda6b71ee21b7e29323f6962` | 2026-10-24T17:17:56Z（固定d266035d5841fcf580430a559bbe46a131db7b48为a788祖先0；6387218361带actual于17:19:37关闭。P2d材料/Images S15修正独立6384912989/6384963617有效，旧full29/52原15worker成功1启动回归/aggregate失败原文保留；Mac27/原live边界不吞。README权限/回收语义P2现由#1235/7d实际闭环6388326951，metadata两项原已闭；其他1210生命周期/编号/注释问题仍各原owner，旧full红不回改） |
| #1198（Toast诊断链接） | `191acc418dee3e48b2d7f7238015a479de14372e` | 2026-10-24T16:58:08Z（固定fd3e56b8485462985d71630b8c14ec2ebd841919；singleparent2dd5359、actualtree0844a43fa66df00c7ea7fa17077261922d835fa2=真实merge-tree2dd+fd3，Root唯一正常queue40112248339/Verify成功；PR CI40110037944全部14适用jobs成功。REVIEW6386558510/TEST6386679444与Root6386727389按四完整PNG交叉同bytes及空toast无匹配button判剩6px非本分支回归，旧正式93507两侧13/13、66PNG/22styles仍exit1/6px、底层UNKNOWN/阈值0/首败保留，未改期望图/算法/覆盖。真实ready旧红→新绿1/1及91unit/171assets/原3case24态有效；仅本片工程落地，不冒本人/原生验收；原作者和FIX2贡献/raw保留） |
| #1225（batch32） | `2dd53591276982b6947369e345ddfcffcc21afd2` | 2026-10-24T16:04:33Z（固定f2e58035244485b069db3264b930fddcf74fa673；singleparent112、actualtreead24278b75f296a4f20fc7bdb87b6a237802b3fc=固定候选，queue40109483030/Verify120919029355成功，optionalSec/Product条件skip有别。组合REVIEW6386329302 PASS，独立TEST6386537954已核48既存raw（478/479，27Mac无缺、一live未执行）；full32原bc6d13过3红+web starting首红retry过保留，不冒全full32绿；一live未执行/27Mac边界保持） |
| #1098（随#1225） | `2dd53591276982b6947369e345ddfcffcc21afd2` | 2026-10-24T16:04:33Z（原固定91e096524c29e5f62a14a7fdfbffaa5878752313为f2祖先；后head d09含1107，tree=f25。原统筹6386439923带actual2dd关闭，非单独main merge；PG060整项/1112余项未关） |
| #1107（随#1225，含#1098） | `2dd53591276982b6947369e345ddfcffcc21afd2` | 2026-10-24T16:04:33Z（固定f25e08cc1b9f608bccafb03c0949048c00e556e5为f2祖先；API15:17:48 merged/d09仅入1098下层，parents91e+f25、tree2ea740c0=f25，不能当时称main已合。本次actual2dd主线包含才闭该片；DeepSeek原稿+原作者及FIX2同步贡献/REVIEW6385074192/TEST6385205255有效证据保留，385作者原raw不冒独立复跑） |
| #1191（随#1225） | `2dd53591276982b6947369e345ddfcffcc21afd2` | 2026-10-24T16:04:33Z（固定d1843c3aa2c80800b6c2081e1bdf6f00306d4fc0为f2祖先，原统筹6386440725带SHA关闭；C9/槽声明正反例增量Review保留，两句过时doc实际FIX1未实施，其他nonblock不关） |
| #1173（随#1225） | `2dd53591276982b6947369e345ddfcffcc21afd2` | 2026-10-24T16:04:33Z（固定f45abe4e8a46c12722f5cb3194410df56439dab4为f2祖先，原统筹6386441368带SHA关闭；S38/S47三方合并已组合Review核，BL569实际FIX1尚未实施，不以本次两doc落地关原门禁后续） |
| #1224（batch30） | `112114f231a734ac761cf36e8411c8897d0826d8` | 2026-10-24T15:32:15Z（固定5766a24f2f5d1e56ab3b9216f5f20c023a1939d6；singleparent2b253，actual tree f874a0a7ffd74addbf517fbf1615cf0fdbdf46ef=真实merge-tree2b+5766；queue40106695986/Verify120911368571成功，该组Sec/Product条件skip；原full30/31红与retry边界保留。Search6行REVIEW6386074856独立通过；typed新e5ff四锚点独立REVIEW6386154511 PASS，85其他case/fixture/scanner/limits未改，独立TEST已核新CI86/86首过及actual112同源码，不以合入冒验证） |
| #1218（随#1224） | `112114f231a734ac761cf36e8411c8897d0826d8` | 2026-10-24T15:32:15Z（固定89ba1b65aa64bceb4ebf3d04f838b5add3863c65为5766祖先，Claude6386074848带112关闭；两1207 source slice对89ba逐字同，6386132911闭环仅该两doc，原ac-kernel贡献保留；本PR Host规则/README P2实际FIX2依赖已满足，未实施未关） |
| #1216（随#1224） | `112114f231a734ac761cf36e8411c8897d0826d8` | 2026-10-24T15:32:15Z（固定e7ba9f8eef1657b348f1f8545a52c24b2630a1f6为5766祖先，Claude6386075451带112关闭；ImCtx强转P2实际FIX2未实施，full30 CDP/context原因仍未知，不因后来通过反推关闭） |
| #1220（随#1224） | `112114f231a734ac761cf36e8411c8897d0826d8` | 2026-10-24T15:32:15Z（固定e5ff26268e8a24f07731ffc879d9dae9f7c475ba为5766祖先，Claude6386076124关闭；原full31结构85/86红保留，四处新实物锚点独立REVIEW6386154511 PASS，85其他case/fixture与scanner/limits未改；独立TEST新CI86/86首过/actual112同源码PASS（单份search-race-5766-b99/test-handoff），旧失败保留） |
| #1217（随#1224） | `112114f231a734ac761cf36e8411c8897d0826d8` | 2026-10-24T15:32:15Z（固定8d322f68883819b9ce53b1498052bd5a6d1dec73为5766祖先，Claude6386076719关闭；PPT390 artifact_version首0expected1/retry过及新夹具差异仍未定因，原作者复核后续保留） |
| #1219（随#1224） | `112114f231a734ac761cf36e8411c8897d0826d8` | 2026-10-24T15:32:15Z（固定218e475f29997ac52148da94d614d0b6a20ad235为5766祖先，Claude6386077307关闭；仅本片Form工程落地，BL462残留及整线未因此完成） |
| #1162（Pages footer） | `2b253d457c2207e5cb1b276cf255f3cbb5f53056` | 2026-10-24T15:25:40Z（固定edacefbacd8b4234ad3b23bcda9bb93824817327；actual tree da533975180bced6e9e00d21f7c0d8fd130d52ea=获审/PR受测5435，单parent612；REVIEW6385702598/TEST6385703908双PASS、22files359首过/12PNG；PR CI40104219811两Security/Product全部成功，Security2原90文件首过；正常queue40106295985/Verify120909780213成功，其Sec/Product条件skip另记。6385983364公开核实实际落地，未重复队列/绕保护。仅本片工程完成，原生安装/本人验收未宣称，1198以此有限真SHA接续） |
| #1221（ACA005代码修复） | `61248691df65d2a39036672e725892cfea76aa44` | 2026-10-24T13:51:37Z（固定17b6c3d1db8d6a60dbf49d33cd57d9411eac0fab；actual tree5bdf2cb7644676e48827bb802a836e11455e3721=批准/已受测CI744d+干净试合树，单parent1712；REVIEW6384804793/TEST6384924962 PASS、26首过/retained3/副本维护/PR双Security91+90与Product205+204原raw核齐；合并认领6384958236正常队列，merge-group40099499103/Verify success。代码修复工程闭环，真实Home MCPv3维护/本人验收仍W5-17未完成，不关C1/C2/W5/整线） |
| #1215 | `1712c033138689a5d27945b56e9d9f18331ce4bf` | 2026-10-24T12:52:01Z（batch28b固定9a268a6031cf913b0272d24ee590d0d8feb9a2d6；该头叠base9ed的真实合成树d3d5fcf3=actual landing tree，非把原头tree44feb误当landing；merge-group40095199470/Verify成功。PR CI40094522020 Product原raw205/204文件首过flaky0，job120873883370明确uninstall-receipt pass7.4s；队列optional Security/Product skip有别，full=[]不追加） |
| #1213（随#1215） | `1712c033138689a5d27945b56e9d9f18331ce4bf` | 2026-10-24T12:52:01Z（固定8fce66c6349b47476e7a2f131cd7f7ee12e0b377是9a268祖先，三源文件对landing逐字一致；Claude6384446546带SHA关闭源PR，非单独merge。REVIEW6384157844/独立TEST6384262843保留；共享快回归清单一行已实际入库且CI实跑，6384200965登记闭环，仅RAC114，C1整体不关） |
| #1214 | `9ed0e7a5c37e7b0395f58e7d399db22e713ff682` | 2026-10-24T12:33:15Z（固定d134341e31cc396bcee945df9f5004a2acf19e37；actual tree cdd5f115与固定批头相同、单parent c609；merge-group40094052722 success；原full28=14worker绿2红/aggregate红保留，Claude按共享核心逐字未变+最终相关3/27Mac共30作者补验merge-only，不冒新全量全绿；独立1207后核收单列） |
| #1208（随#1214） | `9ed0e7a5c37e7b0395f58e7d399db22e713ff682` | 2026-10-24T12:33:15Z（固定29047337f67a626b19402b8504f5bd734ba7ec0a是d134祖先；Claude6384262259带SHA关闭源PR，非单独merge；两nonblock实际ownerFIX2，public入口依赖已满足但未修） |
| #1207（随#1214） | `9ed0e7a5c37e7b0395f58e7d399db22e713ff682` | 2026-10-24T12:33:15Z（固定65b8494b67acd812bf0ff3f5d77eb1386104679b是d134祖先；Claude6384262762关闭，REVIEW6384313623合入后代码核收PASS；独立TEST6384365097新CI管理4/4+本地goal-events61首过，旧full失败不挪新头；PR元数据已实际改、两source slice旧表述已原ac-kernel在1218/89ba实际改，REVIEW6384460634过；现随1224/112实际落，两文件逐字同/queueGates过，6386132911闭环仅两doc，Trust与1218自身P2保持） |
| #1204（随#1214） | `9ed0e7a5c37e7b0395f58e7d399db22e713ff682` | 2026-10-24T12:33:15Z（固定f48d20cd26cf5904eb2bda417932b48b11e47d51是d134祖先；源PR6384263244关闭；Pages client职责拆分非C2/Home快照目标完成） |
| #1205（随#1214） | `9ed0e7a5c37e7b0395f58e7d399db22e713ff682` | 2026-10-24T12:33:15Z（固定47c8316ffc00829974b25fd0be4f97ada483f9cd是d134祖先；源PR6384263715关闭；TodoStore拆分保持行为） |
| #1187（随#1214） | `9ed0e7a5c37e7b0395f58e7d399db22e713ff682` | 2026-10-24T12:33:15Z（固定7686e5a69f99d112701e6927483f3da91d24d27b是d134祖先；源PR6384264182关闭；S63正确前缀/8title保留，S20正文引号改写已实际在批落，不改生产gate/断言；沙箱journal另后续） |
| #1206 | `c6093a2e9c412181846d94ee1a5cd037680684b3` | 2026-10-24T11:59:44Z（固定fa52a4f8c；GitHub实际merge，唯一full27b40089127294全16片+汇总success；merge-group40091732268/Verify成功，Security/Product在该组skip但原CI两片已核；tree1ff5f00=受测2ca；REVIEW6383617763；作者31本机原stdout未冒独立，适用有效证据边界保留） |
| #1200（随#1206） | `c6093a2e9c412181846d94ee1a5cd037680684b3` | 2026-10-24T11:59:44Z（固定82fd235e69d0b5792cbdcc9bc62c5ef160c2e20b是fa52祖先；Claude6383939222带SHA关闭源PR，非单独merge；独立TEST6382864207/原Linux U10首过保留，真正重排焦点P2仍FIX2） |
| #1114（随#1206） | `c6093a2e9c412181846d94ee1a5cd037680684b3` | 2026-10-24T11:59:44Z（固定3aae65461ca7299d50a35aa5a686a66a9a880c74是fa52祖先；源PR6383939813关闭；REVIEW/资源24B/独立TEST6382908190及最终批资源实测保留，E22/ACA004等未一并关闭） |
| #1180（随#1206） | `c6093a2e9c412181846d94ee1a5cd037680684b3` | 2026-10-24T11:59:44Z（固定adc25b27c6c64ca4526f23565ecae13a10b5c5b3是fa52祖先；源PR6383940359关闭，原有效TEST与批组合保留） |
| #1186（随#1206） | `c6093a2e9c412181846d94ee1a5cd037680684b3` | 2026-10-24T11:59:44Z（固定0310ce2a406ef3cddd8dcdeee1656d86d06e29bf是fa52祖先；源PR6383940856关闭，list-silent-refresh两侧helper/case均组合保留） |
| #1185（随#1206） | `c6093a2e9c412181846d94ee1a5cd037680684b3` | 2026-10-24T11:59:44Z（固定c37c044bc8d1b435fa4941840742eb22147f8f76是fa52祖先；源PR6383941550关闭；board/touch增量6383220037/6383557011保留，未将作者四e2e汇总冒独立亲跑） |
| #1182（随#1206） | `c6093a2e9c412181846d94ee1a5cd037680684b3` | 2026-10-24T11:59:44Z（固定e1b15e25e66cbe8b7333f71b4f6a5706ce958e03是fa52祖先；源PR6383942301关闭，PG026原批通过/新批结果保留；actor文案后续不因合入关闭） |
| #1197（随#1206） | `c6093a2e9c412181846d94ee1a5cd037680684b3` | 2026-10-24T11:59:44Z（固定5cd2277e07cdd11a1336a238622b54e6a3280d84是fa52祖先；源PR6383942876关闭；ACA001对应id+signature/RAC411在1199与最终批保留，工程落地证据已交root原审计owner核收） |
| #1199（随#1206） | `c6093a2e9c412181846d94ee1a5cd037680684b3` | 2026-10-24T11:59:44Z（固定d8f6403a1796184c58c8e776c623a54e6dfe0d29是fa52祖先；源PR6383943388关闭，Module逐字保留与S15/17/18位置批内修复已REVIEW核） |
| #1202 | `645853cb60c0c76c4fa86ba27bbbbc0f35ba868a` | 2026-10-24T11:12:45Z（固定c4a40b84；GitHub实际merged；merge-group40088629727/Verify成功，Security/Product在merge-group是skip，适用原PR/full证据另计；tree e7a5a85与已测627e80bf相同；full26b40086400255@c4全16片+汇总success；独立TEST6383561599原raw/命令/153首过与弃证边界见`/tmp/molis-verify-2026-10-24/pr1202-test-c4a40b84/handoff.md`，流水线已亲读） |
| #1119（随#1202） | `645853cb60c0c76c4fa86ba27bbbbc0f35ba868a` | 2026-10-24T11:12:45Z（固定3f8fadfb398072e84c24d3a02913592830041d70是c4祖先；源PR由Claude6383513873带SHA关闭，非单独merge） |
| #1139（随#1202） | `645853cb60c0c76c4fa86ba27bbbbc0f35ba868a` | 2026-10-24T11:12:45Z（固定4dc43440c56486dbf9a3eb79fdfb1a037a6b6268是c4祖先；源PR6383514354关闭，叠层一起落地） |
| #1143（随#1202） | `645853cb60c0c76c4fa86ba27bbbbc0f35ba868a` | 2026-10-24T11:12:45Z（固定a26ef6d757a32e4c33a11ac27aecd39c56c19cc9是c4祖先；源PR6383514843关闭） |
| #1144（随#1202） | `645853cb60c0c76c4fa86ba27bbbbc0f35ba868a` | 2026-10-24T11:12:45Z（固定8f631768744e7032cd1830b9edc7c1ae5227886a是c4祖先；源PR6383515328关闭；新DTO/SDK修复按6383041525与153项独立TEST核收，原28Mac汇总未冒亲读） |
| #1190（随#1202） | `645853cb60c0c76c4fa86ba27bbbbc0f35ba868a` | 2026-10-24T11:12:45Z（固定bc0160f06d8d5cef38c3d7d3e57f7bd9fe2014d4是c4祖先；源PR6383515913关闭；B1仅此片完成，C2 B2/A/全快照恢复仍由原实现2继续） |
| #1181（随#1202） | `645853cb60c0c76c4fa86ba27bbbbc0f35ba868a` | 2026-10-24T11:12:45Z（固定7533e15611d5ddc3b74c65aed9275aaffdabde58是c4祖先；源PR6383516363关闭；正式目录两夹具独立回归有效，RAC181等nonblock仍原FIX2） |
| #1188（随#1202） | `645853cb60c0c76c4fa86ba27bbbbc0f35ba868a` | 2026-10-24T11:12:45Z（固定05054e9152dc5768e9366e86619a2c89df292acf是c4祖先；源PR6383516820关闭；REVIEW真6382944062，Files广播与合法browsingWorkspace夹具包含） |
| #1194 | `f880df0c43d36464ce7407c27311d895487b3716` | 2026-10-24T09:59:35Z（GitHub实际merged；固定33c58；merge-group40083731946/Verify成功；最终树27dcea4与已审批头相同；原full失败/取消及复用TEST6382794843边界保留） |
| #1166（随#1194） | `f880df0c43d36464ce7407c27311d895487b3716` | 2026-10-24T09:59:35Z（固定02299dad30fb02acbdc8ff7d1be1183d7d310c63是33c58祖先，树相同证明；源PR已Claude6382835652关闭，非单独merge；1138其他nonblock未关） |
| #1178（随#1194） | `f880df0c43d36464ce7407c27311d895487b3716` | 2026-10-24T09:59:35Z（固定203dd7679b9e0f44859f45cf42796d40ec53cc3b已含，源PR6382836276关闭；REVIEW6382492610核实际逐字移动保留） |
| #1179（随#1194） | `f880df0c43d36464ce7407c27311d895487b3716` | 2026-10-24T09:59:35Z（固定541cd900c7b84051cb2e9884bf3b0aca7f56211f已含，源PR6382836806关闭；原独立TEST6381997985有效） |
| #1157（随#1194） | `f880df0c43d36464ce7407c27311d895487b3716` | 2026-10-24T09:59:35Z（固定8c5ab7a94f6cee60d725c0f5554ff7a2bf6e53fd已含，源PR6382837342关闭；SC4组合按REVIEW6382492610/TEST6382794843实际核收） |
| #1130（随#1194/#1157） | `f880df0c43d36464ce7407c27311d895487b3716` | 2026-10-24T09:59:35Z（固定a25003415cfca292239c794fd1101066919bb87e是33c58祖先，源PR6382837833关闭；不是单独merge，R41/其他完整防腐目标保持） |
| #1175 | `8f76e5b2db773d9e91c2c443cc909cf96e15c514` | 2026-10-24T08:07:36Z（GitHub实际核；finalb3e7443a5；原作者两nonblock已覆盖并真合；R41口径新文案仍修复1后续） |
| #1168 | `ab472ecc8aff824966d36e3e47452a04ce296836` | 2026-10-24T08:11:55Z（GitHub实际核；final98906bfad；batch24旧VUX16失败已独立核缺1174，沿Claude merge-only） |
| #1176 | `715156d46e99b1e61a52c03e7f1ced281c37c75c` | 2026-10-24T08:23:38Z（GitHub实际核；finalcb8795f57；BL543/544登记不等于实际修复） |
| #1169 | `1ae1e41ae6dc6e66d7b751d2e869732f14d799dd` | 2026-10-24T08:32:42Z（GitHub实际核；finald586db646；1114先合依赖已满足；1180按最新§1a接续） |
| #1183 | `f586496e463308995319499f836bb8cfeb654898` | 2026-10-24T08:32:42Z（GitHub实际核；final7bbb014c4；REVIEW6381427633/TEST6381742635/CI齐，RAC113本片关闭；非C1整体完成） |
| #1164 | `3e96b40ea83d97c97cec25d8b23f8302dc12d231` | 2026-10-24T07:50:52Z（GitHub实际合入；finald6b867b02，沿Claude原认领/队列，Codex未重复入队） |
| #1165 | `531e43fbbea9d2d73f7c0131179e2296f9e3475b` | 2026-10-24T07:50:52Z（GitHub实际合入；final01de2cb48，沿Claude原认领/队列，Codex未重复入队） |
| #1167 | `21257170d178574d2964436a7d195981e1b849cd` | 2026-10-24T07:50:52Z（GitHub实际合入；final4097bbd1d，沿Claude原认领/队列，Codex未重复入队） |
| #1148 | `38b27b06716e51f702623096c01620ed09a5bc31` | 2026-10-24T07:57:43Z（GitHub实际合入；final2a8eec5d8，沿Claude原认领/队列，Codex未重复入队） |
| #1174 | `4e17c3d1bef043d2565189fe5776bc515b39497b` | 2026-10-24T07:21:50Z（GitHub实际合入；final5bbb43186，原Claude6380951820认领；BL544/R44后续保留） |
| #1171 | `d28794061a189aea2d4e5ebfe74b558ed9a8e169` | 2026-10-24T06:39:30Z（GitHub实际合入；独立Home设置入口修复，原统筹认领6380903089；沙箱/SC4接续依Claude安排） |
| #1172 | `6f638ad734ce68e6c2b78b3a5ad209f10a711ffd` | 2026-10-24T06:37:01Z（GitHub实际合入；信任设计稿，ac-trust实现仍等1098） |
| #1170 | `61bfc2b8ad28ddd64304e89a3862e2e51d18b37a` | 2026-10-24T06:25:24Z（GitHub实际合入；最终head4010b747d，沿原认领正常队列） |
| #1163 | `8aa62a65b2a3644fc8be69ff50b748a53317ec34` | 10-24 05:16:43 UTC（Codex已核实际合并；#1147 SDK文案建议闭环） |
| #1161 | `a934251d35dae6907fb2de75c3fb9f91735218e0` | 10-24 05:12:22 UTC（Codex已核实际合并，回执6380246527；#805规格引用错号闭环） |
| #1126 | `89c9a71947f483cd429405574df7b2b916b36b8d` | 10-24 04:31:56 UTC（Codex已核实际合并；BL-540/541各已认领待串行实施） |
| #1147 | `1756f9842def9df6b1cb0ccebfa23b10af26ec76` | 10-24 04:28:30 UTC（Codex已核实际合并；SDKREADME非阻塞文案另派修复2） |
| #1125 | `de103e5fa421345101056c9fd9100b2144f710e6` | 10-24 04:08:27 UTC（Codex 已核实际合并；只完成文档登记） |
| #1141 | `04435950a05a3602d6408f31c51c5b3e66080f28` | 10-24 03:56:55 UTC（Codex 已核实际合并） |
| #1150 | `034af76c50a68151c39d62da13aa78d2a0bc0079` | 10-24 03:47:25 UTC（Codex 已核实际合并） |
| #1120 | `47c78064460dadd1890943c73e6af27e7347211c` | 10-24 03:50:00 UTC（Codex 已核实际合并） |
| #1096 | `01a875af0` | 10-23 |
| #1099 | `5248af758` | 10-23 17:27 UTC |
| #1100 | `07a309317` | 10-23 |
| #1093 | `8b8ee3131` | 10-23 |
| #1087 | `327c7c201` | 10-23 18:17 UTC |
| #1084 | `3f715261f` | 10-23 18:19 UTC |
| #1115 | `acc71ae473` | 10-23 18:39 UTC |
| #1122 | `c68071cdc` | 10-23 19:46 UTC |
| #1124 | `e8e79e53e` | 10-23 20:07 UTC |
| #1076 | `38111ce61` | 10-23 20:30 UTC |
| #1118 | `f8d1e5ba9` | 10-23 20:40 UTC |
| #1136 | `15b656648` | 10-23 21:33 UTC |
| #1113 | `587a5ea58` | 10-23 21:34 UTC |
| #1123 | `b3f2f4b18` | 10-23 21:35 UTC |
| #1133 | `7ab72c3af` | 10-23 21:42 UTC |
| #1134 | `27bb3c212` | 10-23 21:42 UTC |
| #1149 | `afaa4fea3` | 10-23 22:58 UTC |
| #1131 | `abc052bcb` | 10-23 23:09 UTC |
| #1138 | `7b1819e44` | 10-24 00:20 UTC |
| #1152 | `53a8c464c` | 10-24 00:42 UTC |
| #1083 | `b30325bd5` | 10-24 01:08 UTC |
| #1121 | `aa4de404f` | 10-24 02:19 UTC（统筹二轮确认 final head 后，合并 Agent 入队） |
| #1117 | `acb8941b0` | 10-24 01:08 UTC |
| #1145 | `b1ab81518` | 10-24 01:27 UTC |
| #1146 | `fea1eb0ba` | 10-24 01:34 UTC |
| #1132 | `1dedc1f5c` | 10-24 01:42 UTC |
| #1158 | `8f3fa138c` | 10-24 02:44 UTC（统筹入队） |
| #1156 | `dd7df26e4` | 10-24 02:46 UTC（统筹入队） |
| #1137 | `4e5f91a19` | 10-24 02:48 UTC |
| #1142 | `1cc9cfee7` | 10-24 02:48 UTC（统筹入队） |
| #1116 | `585b15979` | 10-24 03:02 UTC（统筹入队；产品运营事实基线，非防腐线） |
| #1127 | `c0b48111b` | 10-24 03:33 UTC（Codex 入队） |
| #1159 | `f4df5b471` | 10-24 03:33 UTC（统筹入队；BL-540～542） |
| #1128 | `d7bf2b6690c3b8d247a11dae94729d14b7828c4b` | 10-24 03:41 UTC（Codex 已核 GitHub 实际合并） |
| #1151 | `ee2958d2acef18006eddc14ff0761a3fd3a39e99` | 10-24 03:42 UTC（Codex 已核实际合并；仅 C1 server+CLI 首片） |


2026-10-23 20:24 洛杉矶，Codex 测试专职核 batch-1024-19（固定头 `ee4418881264683b357e3ee743ee48c006aa33c7`）：分片7的 `web-home-isolation.test.ts` 与分片5的 `home-offers.e2e.test.ts` 均重复失败。两项分别依赖已退役的 Sessions 新建与首页 Talk 入口，均归 #1130 的 RAC-212/214，已由同一修复1处理；不是已知 main 红，不能把旧批写成通过。保留其余作业继续运行、不取消，最终修复头与后续集成另核。

2026-10-23 20:36 洛杉矶：下一集成批预检版本原为 main `585b15979` + #1130 `fb22b7dc1` + #1157 `782af05ed` + #1148 `2a8eec5d8`。SC-4 spec 两处第4节追加应同时保留；#1157 的 ci-failure-owner 又认领同两测试，统筹已在[6379391764](https://github.com/molis-ai/molis-work/pull/1157#issuecomment-6379391764)说明下层#1130已完成并独立复核，要求确认沿用及当前精确头。新集成暂不启动、不取消旧批，避免重复补丁与验证错误版本；后续启动前须重取最新main/候选和其他批认领。

2026-10-23 20:50 洛杉矶（Claude 统筹）：batch-1024-19 还有第三个文件——分片13的 `tests/touch-targets.e2e.test.ts` 两个主题都在第 659 行失败（「390px holds the widest row with 项目首页 and the "+N" button」，`moreShown["390 the project's settings"]` 为 false），重试也红。#1130、#1157 都没改这个文件，main `e8e79e53e` 全量绿；`known-red-main.md` 里它只记过「重试才过」，这次两主题确定性失败，不按 flaky 处理。推测是 SC-4 拿掉 Sessions 后 Dock 一排不再折叠。已交 `ac-sc3`（#1130/#1157 作者）本机跑这一个文件定性：预期变化就改夹具保住断言原意，回归就修产品；同时把 main 合进 #1130、再合进 #1157。**下一批（batch-20）由 Claude 统筹起**，等 `ac-sc3` 回两个新头再起，Codex 不另起，避免两批测同一组。

2026-10-23 21:10 洛杉矶（Claude 统筹）：`ac-sc3` 定性 touch-targets——SC-4 拿掉 Sessions 钉住后默认 Dock 少一个按钮，390px 不再折叠、断言空转，不是产品回归；夹具改为多钉一个插件（todo），断言原样恢复（`b64058335` 把断言改成反值、删了「320 home」那条，已撤回）。#1130 `78dbe9ece`、#1157 `e387dc981`。但随后 main 进了 #1120、#1141，#1157 对 main `04435950a` 冲突 `CHECKLIST.md`、`project-deletion-owners.test.ts`、`baseline.json`，已请 `ac-sc3` 再同步一次，好了单起 batch-21。**batch-1024-20** 先起：main `04435950a` + #1148 `2a8eec5d8` + #1139 `9314fc7ba`（含 #1119 `ae2b64cd9`），头 `f5d2e8f69`，run [40061024962](https://github.com/molis-ai/molis-work/actions/runs/40061024962)。绿后按 #1119 → #1139（改投 main 后合一次）→ #1148 合；#1119、#1139 动了安全不变量，合前看 Security 作业。

2026-10-23 21:30 洛杉矶（Claude 统筹）：`ac-sc3` 再同步 main `04435950a`：#1130 `7d5e06b77`、#1157 `2d15c6d41`（baseline 用 `--update --base` 重生成）。**batch-1024-21** 起：main `de103e5fa` + #1157 `2d15c6d41`（含 #1130），头 `05b63880f`，run [40061758914](https://github.com/molis-ai/molis-work/actions/runs/40061758914)。绿后 #1130 → #1157（改投 main 后合一次）。作者不再推送，免得批作废。

2026-10-23 22:50 洛杉矶（Claude 统筹）：**batch-1024-20 结果**：16 片只红分片 10 的 `issue-home-locale.e2e`（重试仍红），就是 main 上 #1127 带进来的已知红（`known-red-main.md`），#1119、#1139、#1148 没带进新的红。照用户 10-18 规矩：**main 修好前不合**；Codex 的修复合入后，三个 PR 各合一次 main、Verify 绿就按 #1119 → #1139（改投 main 后合一次）→ #1148 入队，不重跑全量。入队前看 #1119、#1139 的 Security 作业。

2026-10-23 23:20 洛杉矶（Claude 统筹）：**batch-1024-21 结果**：只红分片 6 的 `issue-home-locale.e2e`（重试仍红），同是 main 上 #1127 的已知红；SC-4 组没带进新的红。main 修好后 #1130 → #1157（改投 main 后合一次）入队，不重跑全量。现在等 main 修复的：#1119、#1139、#1148、#1130、#1157。

2026-10-23 23:40 洛杉矶（Claude 统筹）：#1165、#1143、#1144 diff 复核可合（6380163682、6380172003、6380178818）。**batch-1024-22** 起：main `89c9a7194` + #1164 `d6b867b02` + #1165 `01de2cb48`，头 `e76380003`，run [40065231630](https://github.com/molis-ai/molis-work/actions/runs/40065231630)。沙箱叠层没放进来：#1139 对新 main 冲突（`plugin-model-service.ts`、`plugin-methods-runtime.test.ts`，#1147 改的），已请 `ac-sandbox-sched` 按 #1139 → #1143 → #1144 再合一次 main，好了和 main 修复、#1167、#1169 进 batch-23。预计 batch-22 也会红 `issue-home-locale`（main 已知红）。

后续更新：#1157已在6379484788确认不重复推两测试补丁，原重复认领等待已解除；现等待ac-sc3处理batch-19新增touch-targets移动端失败。测试专职只读核原始失败与产品契约，下一全量仍未启动。#1119需在后续明确集成批补全量，不能借用batch13–19。

20:57 洛杉矶接续：batch-19最终16分片13绿、5/7/13失败（home-offers、web-home-isolation、touch-targets），不是通过。#1157另线b640三测试已推但尚未合入下层已审更完整修复；统筹6379553963明确由ac-sc3统一收口，候选最终交付前不启动新全量。#1119作者已答复同步在途，不再等待归属决定。

20:59洛杉矶：#1157 b640候选预审确认必须补齐Dock +N菜单44px实际覆盖；新默认pin使390/360 Home无+N，原popovers分支直接continue。统筹已公开具体复现链和交付要求，ac-sc3同一writer处理；该候选尚未可合。

2026-10-23 21:17洛杉矶：用户点名#1121，已核该PR实际合并aa4de404fc847d99bf89842f446474ec41d7622a；原review6372440411建议1跨插件资源归属仍未完成，统筹6379753664明确派修复1接续，当前只读准备，待修复2SDK文案小修释放后实施。与BL-541结构化展示字段分别跟踪，不能用原PR已合入关闭遗留。其他未认领non-block按CODEX-SESSION-ROLES表持续认领、修复与独立验证。

Codex本轮接续（2026-10-23洛杉矶）：main的issue-home-locale已知红已公开6380097295明确派修复1，优先于#1121（该归属认领保持）；修复2#1166已交付/释放并立即转独立review/test，暂无第二writer。#1119/#1139/#1148按batch20新裁定等待main修复后同步，未借已知红直接合入。SC4 batch21继续，但#1157非空菜单必修覆盖尚未关闭，6380099760已向ac-sc3说明绿批不能替代该项落实；不重复起批、不取消CI。#1163尚等最后Security1，未入队。

Codex最新裁定：#1127 main红为独立Home设置宿主未消费open-settings-path的实际入口缺陷（loads=[]），非只改旧选择器；6380173758明确按Home现有dialog加同源三路径事件消费并验证真实Retry/拒绝/草稿，工作台与S47禁导航规则保留。修复1唯一writer，#1166修复2仅只读准备交错修复。#1161已实际合入a934251d3；#1163已实际合入8aa62a65b。batch20/21既有main红及1119/1139/1148合并门槛不变。


2026-10-23 22:59洛杉矶／10-24 05:59UTC Codex接续：#1166新头已独立审验，请Claude下一统一full纳入（6380633773）；batch22于05:52已3分片失败（1/10/12），测试专职正在核准确文件与基线，不能预判均是main已知红。batch23继续，#1171自身CI通过但full未完、未合入。#1157非空Dock菜单44px必修覆盖仍待原ac-sc3具体交付，不因batch21没有新增失败关闭。当前无Codex实施writer；修复2只读准备已认领的#1158，#1121仍待#1148实际合入。

- 10-24 06:15 UTC：batch-1024-22（[40065231630](https://github.com/molis-ai/molis-work/actions/runs/40065231630)）完：3 份失败——`issue-home-locale`（已知红，#1171 修）、`home-side-surfaces`（已知红，#1135 带进来，Codex 修）、`work-placement-journeys`（偶发，但重试也红；动线末尾有删除，#1164 改了删项目，交 `ac-sc3` 在批头与基线各跑 3 次排除）。#1164、#1165 等 main 两份红都修好、排除完后合 main 走 merge-only。

- 10-24 06:45 UTC：batch-1024-23 完（只红 `home-side-surfaces`）。batch-1024-24 起：main `61bfc2b8a` + #1171 `b27b0cd8c` + #1169 `295575bcd` + #1168 `98906bfad`，头 `5e781d4bd`，run [40070386529](https://github.com/molis-ai/molis-work/actions/runs/40070386529)。#1169 与 main 在 `page-assets.mjs` 的 `APPROVED_CEILINGS` 冲突，批里按 #1169 一侧解（只留 todo.js、lingguang.js；main 的五条全已用完），作者在 PR 上同样解，统筹 remerge-diff 核。（推批分支时误带 `-f`：新分支首推，没有覆盖任何提交；以后不带。）


- 10-24 07:4x UTC：用户提醒有 PR 修完等统筹裁定。逐个回：#1166 进 batch-25（同批 #1178、沙箱叠层）；W5-06 链 #1098→#1107→#1112 等测试专职交 SYS-15-U10 根因后进 batch-26；#1130 备案 C2 早期持锁由 Codex 实施；#1157 的 Dock 受控溢出覆盖（6379709843）仍是唯一挡合并项，交 ac-sc3 现补。#1164、#1165、#1167、#1148 认领入队，排在 #1174 后（队列 1～5）。
- 10-24 07:5x UTC：#1174 合入 main `4e17c3d1b`，main 已知红清空（`home-side-surfaces` 删行）。排批：**batch-25** = 沙箱叠层 #1119→#1139→#1143→#1144（同步后取顶层头）+ #1166；**batch-26** = #1178、#1179、#1182、#1181（#1148 合入改 base 后）；W5-06 链等 SYS-15-U10 根因，排 batch-27 或并入 26。S 号改成按合并顺序定：线上预留只是暂定，开 PR 或入队时取 main 与队列前面之后的下一个空号（S-59 #1119、S-60 #1139 不变；W5-17 的 S-61、PG-017 的 S-65/66、`ac-sc3` 的 S-62～64、`ac-trust` 的 S-67/68 都改成到时再取）。
- 10-24 07:4x UTC：#1157 的 Dock 受控溢出覆盖已修（`7e6249e20`），ac-review 复核可合（6381497257）。#1130（`e577e7078`）CI 的合同检查红：RAC-192，`tests/fixtures/builtin-definitions.ts:38` 是 main 上 #1147 加的 `io.molis.work.sessions` 行，SC-4 把 Sessions 下线了——合 main 没有文本冲突的语义冲突；交 ac-sc3 删行、查别的 sessions 残留，修完 #1130 入队、#1157 照 rule 5 改 base 后入队，不再起全量。
- 10-24 07:5x UTC：**batch-24**（run 40070386529，`5e781d4bd`）结束：只红 `home-side-surfaces`（重跑也红）——批基底 `d28794061` 早于 #1174，是当时 main 的已知红，现已修好。判定：#1168（`98906bfad`）merge-only，已认领入队（第 7 位）；#1169（`d586db646`）merge-only，但与排在前面的 #1114 在 `page-assets.mjs` 的 `APPROVED_CEILINGS` 同处删行（试合 main+#1114+#1169 冲突），等 #1114 合入后原作者合 main 再入队；#1180 在 #1169 合入后改 base。#1114（`7733c5541`）、#1130（`a25003415`，删 #1147 带来的 sessions 夹具行）已认领入队/设自动合并。
- 10-24 07:5x UTC：**batch-25 起跑**（统筹）：`integration/batch-1024-25` = main `4e17c3d1b` + #1166 `02299dad3` + #1178 `203dd7679` + #1179 `541cd900c` + #1182 `70343d004`，头 `df5984613`，run [40075168266](https://github.com/molis-ai/molis-work/actions/runs/40075168266)。#1178 与 #1179 只在 `tooling/gates/baseline.json` 冲突，批里取 #1178 一侧（CI 不读这份快查；后合的那个合 main 时 `--update` 重写）。沙箱叠层同步完改进 batch-26（同批 #1181 改 base 后）。记忆线自己的全量 `integration/memory-p0-final-20261024` 还在跑。
- 10-24 08:0x UTC：沙箱叠层合 main `4e17c3d1b` 后的新头：#1119 `3f8fadfb3`、#1139 `4dc43440c`、#1143 `a26ef6d75`、#1144 `61a0da5df`（只 #1119 有冲突：SECURITY-INVARIANTS S-47 取 main、BACKLOG 并列；后三层树与上次验证过的头相同）。进 **batch-26**（取 #1144 顶层头，同批 #1181 改 base 后）。#1169 归 `ac-clients-1`，#1114 合入后由统筹通知它同步。
- 10-24 08:1x UTC：`ac-coding` 开 [#1185](https://github.com/molis-ai/molis-work/pull/1185)（C8-3：助理按执行方协议选执行方，删 `assistant-coding.ts`；`full` 命中 shared-core/storage/spans-packages）。排 **batch-27**；交 ac-review 优先（改合同与存储）；S 号暂写 S-59，入队时按合并顺序重编；`workbench.js` +311 B 原则上放行（正文要写理由、试过的省法）；真实 Home 的 assistant store v2→v3 记进 R-41。与 #1130（已入队）、记忆线 #1064/#1153 有重叠，后合的同步。
- 10-24 08:2x UTC：合入 #1164 `3e96b40ea`（BL-385）、#1165 `531e43fbb`（PG-047）、#1167 `21257170d`（Cognia W5-04）。`ac-clients-1` 空出名额开 Dataset PR；`ac-sc3` 开 S9-0（S 号按合并顺序）。privileges.md 状态第 6 批要收 PG-047（#1165）等，待 #1168、#1130、沙箱叠层合入后一起写。
- 10-24 08:3x UTC：#1114 在队列里变 UNMERGEABLE（#1167 Cognia 客户端改写后 `plugins/native/cognia/src/client.ts`、`page-assets.json` 冲突，要真解）。改顺序：#1169（`d586db646`，试合当前 main 与 main+#1168 都干净）先认领入队（第 6 位），#1114 等 #1169 合入后由修复 2 一次合 main、两处一起解，统筹 remerge-diff 核完重新入队。#1175 上 root 选的 R-41 口径（代码与脚本隔离演练过就合，真实 Home 切换等用户统一维护计划）已备案同意。
- 10-24 08:xx UTC：#1185 二轮可合（`8fd671224`，6381730749：v3 维护 SQL 同一事务改 `assistant_requests.result`，RAC-447/448 钉住无旧形状、中途失败整笔回滚）；进 batch-27（同批 #1186、#1187、#1180 改 base 后）。
- 10-24 08:xx UTC：按用户要求改成 §1a「同路径一起落地」。立即生效：#1130 与 #1157 不再逐个同步——#1157 改 base 为 main、#1130 关掉自动合并，由 `ac-sc3` 只在 #1157 合一次 main（BACKLOG、`baseline.json` 共用文件 + `tests/project-deletion-declarations.test.ts` 与 #1164 的真冲突），#1157 一次落地后关 #1130。batch-25（#1166、#1178、#1179、#1182）跑完开成一个批 PR；沙箱叠层进 batch-26 也开批 PR 一次落地；batch-27 按页面资源一组排（#1180、#1186、#1185，加 #1187）。
- 10-24 08:xx UTC：batch-26 = 沙箱叠层（顶层 #1144 `61a0da5df`，一次落地）+ #1181 `e70160a6e` + #1188 `d6d1da98a`，按 §1a 开成一个批 PR；batch-25 跑完就起。
- 10-24 08:xx UTC：#1168 合入 `ab472ecc8`（W6-01 删 personal 旧短名路由桥、PG-058）；进 privileges 状态第 6 批。
- 10-24 08:xx UTC：#1175、#1176 合入（`ac-bl543` 工作树与分支已删）。Codex [#1190](https://github.com/molis-ai/molis-work/pull/1190)（C2 B1，IM 邀请只存哈希 + v1 离线维护，`58bc50cf9`，full 命中 shared-core/storage）请求进批：Codex REVIEW/TEST 在 batch-25 结束前给了结论就并进 **batch-26**（S 号一组：沙箱 S-59/S-60、#1190 届时 S-61、#1181、#1188），否则 batch-27；ac-review 另做合同与安全的聚焦复查。#1187 的命名空间分隔符（"." 会被带点的 plugin_id 包含，R-37 同类）挡合并，交 ac-sc3 改成 ":" 并补前缀包含的对照测试。真实 Home 的 v1 邀请哈希维护记进 R-41。
- 10-24 08:xx UTC：#1190 ac-review 防腐复查可合（6381984863：合同影响与 API 快照一致、S 用例断言拒绝且库不变、v2 开库拒 v1、维护只在 tmpdir 演练且对真实 Home 要 `--maintenance-window`）；等 Codex REVIEW 结论与 TEST。#1187 分隔符已改冒号（`0b6d12ce0`，RAC-296），交 ac-review 复核。
- 10-24 08:xx UTC：batch-25 第 2 片 `project-settings-navigation.e2e` PG-026-S4-03 新红（重跑也红）：reset 按钮在 780x493 视口外（rect y=665），TEST 只读报告（#1182 评论 6381981861）归因**未定**——测试、点击助手、设置样式与基底相同，#1182 改了样例种子根身份与 Goals 建板时机，是头号嫌疑但未证实；修复 1 已认领做 DOM 事实采集与根因。批跑完后：若确定是 #1182，批 PR 去掉 #1182 用 #1166+#1178+#1179 落地，#1182 修好进下一批；若是测试准备问题，修测试后整批落地。#1190 被 Codex REVIEW 挡（P1：含 v1 原文的工作副本在解除启动阻断之后才删），不进 batch-26，修好进 batch-27 或之后。#1179 TEST 13/13 补证完成。
- 10-24 08:xx UTC：`ac-coding` 开 #1191（C9，叠在 #1107）。按 §1a 与 W5-06 链同路径，**W5-06 专批 = #1107 顶层（含 #1098）+ #1112 + #1191 一个批 PR**，等 Codex 交 SYS-15-U10 修复并把 #1107 合 main 后统筹单起；#1191 届时合一次 #1107 新头。#1187 三轮可合，batch-27 四片都齐。#1157 再同步 `8c5ab7a94`（只 baseline.json，取 main）。
- 10-24 08:xx UTC：#1114 按 §1a：修复 2 对含 #1167 的 main 合一次只解 Cognia 真冲突，共用文件不追，交上来并进 **batch-27**（页面资源一组），不单独入队。
- 10-24 08:33 UTC：合入 #1169 `1ae1e41ae`（R11 Inbox/灵光转待办走通用入口）、#1183 `f586496e4`（Codex C1 RAC-113）。batch-25 已知：第 1 片 `session-workspace.e2e` 0/2（重跑也红）为 #1182 引起（看板改由 Goals 在 projectOpened 建，测试直写项目库报 `goals.board.not_found`），第 1 片 `interaction-no-crosstalk` 重跑过（偶发），第 2 片 PG-026-S4-03 按 #1182 处理。**batch-25 去掉 #1182**：#1166+#1178+#1179 开批 PR；#1182 交回 ac-sc3 修。#1180 在 #1169 合入后由 ac-clients-1 做 rule 5。
- 10-24 08:40 UTC：（更正）上面 08:5x～10:4x 几条时间标快了，实际都在 08:00～08:35 UTC 之间，统一改成 08:xx。batch-25 批 PR 改为 **#1166 + #1178 + #1179 + #1157（含 #1130）**：#1182 两项红交回 ac-sc3（PG-026-S4-03 的重置按钮也在 #1182 改的 `demo-project-lifecycle.ts` 动线上）；#1157 又只因 `page-assets.json` 与 main 冲突，按 §1a 第 5 条并进批 PR，已关它的自动合并。合批时把 #1157 对 `craft-finish.ts`、`primitives/catalog.ts` 的 Sessions 删除搬到 #1178 拆出的文件里（逐字、各一处）。批 PR 分支 `batch/1024-25`（不叫 `integration/**`，推送不触发 full），构建量页面资源与 `--update --base origin/main` 后开 PR、认领入队；合入后关 #1166、#1178、#1179、#1157、#1130。
- 10-24 08:50 UTC：批 PR [#1194](https://github.com/molis-ai/molis-work/pull/1194)（`batch/1024-25`，#1166+#1178+#1179+#1157/#1130）已开，页面资源全部变小、`--base origin/main` 健康门禁过。PG-026-S4-03 在 Linux 首跑与重试都红、本机（含 #1182 树）复现不了，归属未定，所以先在 #1194 上起全量（run 40079338049，统筹加 `full-suite` 标签），过了再认领入队；那里过就归 #1182，那里也红就不归 #1182。#1181 自己的 Verify 红（`action-cross-entry` W3-09-1-01 T4：期望 `agent.session_unknown`，实际拒绝），交回 ac-kernel；batch-26 先不等它：沙箱叠层 + #1188（+ #1190 待 TEST 与「请进下一批」）。
- 10-24 09:00 UTC：batch-25 全量结束，只红第 1、2 片（归属见上）。batch-26 本地已备好（`integration/batch-1024-26`，叠在 `batch/1024-25` 上）：沙箱叠层顶 #1144 `61a0da5df` + #1188 `d6d1da98a`（BACKLOG：取 #1188 改写的 BL-366 与新增 BL-521，保留 main 的 BL-575～584）+ #1190 `bc0160f06`（S-61 接在 S-59、S-60 之后）+ #1181 `9b647e9b2`；等 #1194 的全量出结果再推（避免两份全量抢 runner）。batch-27：#1180 `adc25b27c`、#1186、#1185、#1187、#1114 `3aae65461`。
- 10-24 09:12 UTC：#1194 的 PR 全量（run 40079338049）是 fail-fast：第 3 片 `code-scale.e2e` VUX-33（着色时最长一帧 105 ms，计时类，batch-23 也首跑红、重试过）两次红后取消了其余分片，PG-026-S4-03 没跑到。#1194 的 CI「Security invariants (1/2)」（不挡合并）红在 `plugin-page-reviews` SYS-15-U10，与 #1112 在查的是同一条，而 #1194 不含 W5-06 代码，已在 #1112 评论（6382393228）提示 main 上可能本有时序竞态。改法：直接推 batch-26（`integration/batch-1024-26` `db4f3a154`，叠在 #1194 内容之上，不 fail-fast，run 40080895158），一次看清 PG-026-S4-03、VUX-33、SYS-15-U10 三条；它们在那里不红，#1194 就认领入队。#1190 TEST 已核收（6382352957）。
- 10-24 10:05 UTC：batch-26 全量（run 40080895158）结束。`project-settings-navigation` 5/5 过 → PG-026-S4-03 归 #1182（已交 ac-sc3，CPU 降速复现）；`plugin-page-reviews` 过（SYS-15-U10 是 main 上的竞态，Codex 修复 #1200）；`code-scale` VUX-33 与 `coding-question-card` 首跑红、重试过（计时）。其余红都在 #1181/#1188：`companion-client-lifecycle`、`coding-effect-control`（R8 夹具缺口，`dependency_missing`）、`coding-session-follow`（Files 视图版本，#1181+#1188 组合），交 ac-kernel。**#1194 认领入队（第 1 位）**。batch-26 批 PR 改为沙箱叠层（顶 #1144）+ #1190，等 #1194 合入后从新 main 建；#1181、#1188 修好后换新头另跑一次全量。batch-27 = #1180、#1186、#1185、#1187、#1114（Cognia +24 B 已获资源 REVIEW）、#1200（SYS-15-U10，coding.js +945 B 已获资源 REVIEW），#1182 修好后加入。

- 10-24 10:05 UTC Codex流水线实际落地核：#1194已09:59:35Z merged，SHA f880df0c43d36464ce7407c27311d895487b3716；单parent f586、tree27dcea4f288f9682d979cff92505319808461d9e与33c58批头相同（队列落地不是保留33c祖先的merge commit）。五源头逐一merge-base --is-ancestor到33c58均exit0，REVIEW已核非机械冲突保留，五源PR均已Claude带本批SHA关闭，流水线未重复关。只关闭这五片/批本身，不写batch26整批全绿或原Security自动重试绿。#1200精确82fd实际Linux U10首1/1/87文件与Security2 86/86已核，专项945B通过，独立TEST正式回贴接续；Claude最新选择并batch27，一次落实准确资源生成，未应用前预算红保持。
- 10-24 10:10 UTC：**#1194 合入 `f880df0c4`**（batch-25：#1166 #1178 #1179 #1157/#1130），五个切片 PR 已关。批 PR [#1202](https://github.com/molis-ai/molis-work/pull/1202)（batch-26：沙箱叠层顶 #1144 `61a0da5df` + #1190 `bc0160f06`，S-59/60/61 按序）已开、认领、自动合并。batch-27 集成全量 run 40084374444（`integration/batch-1024-27` `729b9d7c3`，只叠 main，不含 batch-26）= #1200、#1114、#1180、#1186（与 #1180 在 `list-silent-refresh.test.ts` 两边都留）、#1185（随 #1157 删掉『所在会话』行与没用的 `sessionKinds`）、#1187、#1182（`session-handoff`/`session-workspace` 取 #1157 的删除）、#1197。#1187 与沙箱叠层在项目库三处有真代码冲突，移出 batch-27：batch-26 合入后由 ac-sc3 合 main 解，并改用 S-63；batch-27 批 PR 里 #1185 改用 S-62。#1199 待文档挡合并项修好后并入。
- 10-24 10:20 UTC：**#1202 关自动合并**：ac-kernel 在批树上本机跑出沙箱叠层的 macOS 专属回归（`agent-built-plugins-checks` 5/17、`-workflow` 41/42：`build-sdk-declarations.ts` 的 `CONTRACT_DECLARATIONS` 漏 `services/materials.d.ts`，来自 PG-017 P2b `86e262d9f`），交 ac-sandbox-sched 在 #1144 上修。统筹在批树上跑 28 个 macOS 专属文件找全。#1181 新头 `7533e1561`（coding-effect-control 夹具改用同一动作目录）、#1188 新头 `05054e915`（coding-session-follow 归 #1188：假宿主补答 `browsingWorkspace`），都只改夹具、批树上本机过；内容已在 batch-26 全量里，按 merge-only 并进 #1202 一起落地。
- 10-24 10:25 UTC：**#1202 重新认领、自动合并已开**，固定 head `c4a40b84e`：在 `9d3b206f4` 上并入 #1144 `8f6317687`（创作台 SDK 声明补 `services/materials.d.ts`，Codex REVIEW 6383041525 通过）、#1181 `7533e1561`、#1188 `05054e915`。本机完整 `pnpm build`、`--base origin/main` 健康门禁过、页面资源与入库相同、28 个 macOS 专属文件 28/28、secrets 过。合入后关 #1119、#1139、#1143、#1144、#1190、#1181、#1188。
- 10-24 10:25 UTC：batch-27 全量（run 40084374444，`729b9d7c3`，不 fail-fast）前 8 片的红：`page-assets-budget`（Cognia +24 B、coding.js +945 B，批 PR 里加 `APPROVED_CEILINGS`，预期）；`security-invariants-doc` S-20（S 号不连续：#1185 的 S 号要排在 batch-26 的 S-59～61 之后，批 PR 里改成 S-62，预期）；`board-assistant.e2e` VUX-39 首跑与重试都红 → **#1185**（工具卡标题从写死的 "Coding Agent" 改成 `work.executor.title`，规格板样例是 "Coding"），已交 ac-coding 在 #1185 上修。#1199 的挡合并项（SECURITY-INVARIANTS S-15/17/18 位置列的旧路径）统筹在批 27 批 PR 里一并改，ac-giants 不再推 #1199，转做 W5-10 pages-client。
- 10-24 10:39 UTC：**#1202 撤出合并队列**（Codex TEST 6383138880 指出：#1144 `8f6317687` 改了 contracts，属共享核心，batch-26 `db4f3a154` 与 batch-27 `729b9d7c3` 的全量都不含它）。最终树 `c4a40b84e` 推成 `integration/batch-1024-26b`，全量 run 40086400255（不 fail-fast）；过了再入队。#1201（CI 固定 Node 24.14.0）已先合 main `afabfcbef`，只改 CI，不影响本批。
- 10-24 10:39 UTC：batch-27 全量（run 40084374444）结束，红 4 个文件：`page-assets-budget`（Cognia +24、coding.js +945、workbench.js +311，批 PR 里按 merge-base 实测加三条 `APPROVED_CEILINGS`，删已用完的 plugin-builder 那条）、`security-invariants-doc` S-20（S 号排在 S-61 之后，#1185 取 S-62）两项预期；`board-assistant.e2e` VUX-39 与 `touch-targets.e2e`「the mode opens」归 #1185（前者 ef14ffe21 已修，后者 ac-coding 在修）。`project-settings-navigation` PG-026-S4-03 这轮过了，#1182 进批。**batch-27 批 PR 组成**（等 #1202 落地后从 main 起）：#1200、#1114、#1180、#1186、#1185（修头）、#1182、#1197、#1199（统筹改 S-15/17/18 位置列）、privileges.md 复核（`ff9207ccd`：PG-047/081/082 已做，PG-053/058/086 余项）；#1187 不进（ac-sc3 等 batch-26 后合 main、取 S-63）。

- 2026-10-24 10:44 UTC Codex执行接续：full27/729b至少四最终红已亲读：shard2 board2/3、shard1 touch0/4（722/859 mode opens）、shard9资产170/171（945/24/311）、shard6 SecurityDoc缺S60 0/1，均retry仍红；TEST已实际接归因，原ac-coding新ef14已即交薄审验，Claude共用writer6383181387按准确预算/S号处理，无取消/新full。#1202已最终c4并REVIEW6383192425 PASS，原28Mac日志待核/TEST自有正确build最小集推进，当前main afab只CI Node固定。P2b覆盖分清：db4含旧61a、无8f新DTO/回归，Mac skip；729没有材料栈，不以其证明SDK修后full。ACA003/005仍候选，root已授权TEST下一空闲时段tmp确定性复现，不新增整改writer或无关合并门。

- 2026-10-24 10:55 UTC 最终审计校正已落实：ACA005为P1；ACA003改P2同步合同gap、目录缓存下真实HTTP交错未证，TEST005真实MCP→003真实生产可达（若003已跑自然结束）。ACA001沿1197/1199原线，ACA004旧CALL-CHAINS/skill名单已FIX2明确接E22/SSOT文档窗口，1114不覆盖，未实施不关闭；ACA002已实际随1194/1166。全文审计完成非整改完成。full27最终12绿4红，aggregate非第5文件；touch独立合法准备修复原ac-coding6383326909，311新tuple资源认可6383290609齐，最终批真实落资源/S号、正常CI/merge后再关闭候选。
- 10-24 11:16 UTC：**#1202 合入 `645853cb6`**（batch-26：沙箱叠层 #1119–#1144 + #1190 + #1181 + #1188；最终树全量 run 40086400255 全绿，28 个 macOS 专属文件 28/28）。七个切片 PR 已关。integration/batch-1024-19～26b 远端分支已删（内容都在 PR 里）。
- 10-24 11:16 UTC：**batch-27 批 PR [#1206](https://github.com/molis-ai/molis-work/pull/1206)**（`batch/1024-27`，head `fa52a4f8c`，main `645853cb6` 之上）：#1200、#1114、#1180、#1186、#1185（`c37c044bc`）、#1182、#1197 → #1199。合批解决：S-62（#1185）、S-15/17/18 位置列（#1199 评审）、`sessionKinds` 死代码、三条 `APPROVED_CEILINGS`（+945、+24、+311，删 plugin-builder 那条）、baseline、privileges.md（PG-036/047/081/082/107 已做；PG-017/021/053/058/078/086 余项）。本机：完整 build、`--base` 健康门禁、页面资源、boundary、28 个 macOS 专属文件 + 3 个相关文件、两个改过的浏览器用例（board-assistant 3/3、touch-targets 4/4）、secrets 全过。上轮全量不含 batch-26，合并后的树再跑一次：`integration/batch-1024-27b` run 40089127294，过了再入队。
- 10-24 11:16 UTC：**batch-28 候选**：W5-06 链（#1098→#1107→#1112、#1191，等 FIX2 在 batch-27 落地后合一次 main）、#1204（W5-10 pages-client）、#1205（W5-10 TodoStore）、ac-kernel（localWebActionContext 撤导出、BL-501 等，共享核心）、#1187（ac-sc3 合 main 后取 S-63）、ac-coding C2b（等 #1185 合入）。

- 2026-10-24 11:24 UTC Codex核落地：#1202实际645853cb6，七固定源头逐一is-ancestor c4 exit0、实际landing与受测627树e7a5a85相同，Claude七条关闭回执已核，不重复关闭/入队；已移§3。独立TEST6383561599自有c4正确build后10文件153/153全部首跑/零skip/retry且自然exit0（44+109，Mac checks18/workflow42/sandbox20/materials18/companion11），历史stale试跑不计、原28stdout未亲读。#1206/fa52a4f8c已直派只读组合REVIEW，full27b进行中；#1107/1112按Claude6383510742改为等本批实际落地后各合一次main，C2 B2a仍唯一writer，等待真依赖时下一独立片可接续。ACA005→003独立tmp-only验证由TEST实际接续，不加无关批门。
- 10-24 11:27 UTC：**batch-28 集成**（`integration/batch-1024-28`，`28098700f`，叠在 batch-27 `fa52a4f8c` 上，run 40089971546，不 fail-fast）：#1208（ac-kernel 撤 `localWebActionContext` 导出，共享核心）、#1207（BL-501，full 空，一起落省一次队列）、#1204（W5-10 pages client 切分）、#1205（W5-10 TodoStore 拆分）、#1187（ac-sc3，S-63）。合批只解了 S 号（S-62 #1185、S-63 #1187 并存）；本机完整 build 后页面资源与健康门禁对 batch-27 都过。评审：四个 Claude 线 PR 已交 ac-review（#1208 → #1207 → #1204 → #1205）。W5-06 链等 batch-27 落地后由 FIX2 合 main，进 batch-29。

- 2026-10-24 11:38 UTC：C2 B2a #1209/dbec1b89固定交付并明确RELEASE，已即接独立REVIEW/TEST和Claude storage/full候选申请；作者70文件628最终结果保留一首红fixture/修后边界。W5还缺1206实际落地，下一唯一Codex writer已实际交C1 RAC114有界失败收据片（1183/6383746333公开），不空等B2a审验/CI、不启动第二writer；C1固定释放且真依赖满足后FIX2接1107/1112一次同步进29，C2 B2b完整目标继续。

- 2026-10-24 11:48 UTC：#1209独立REVIEW6383768725/TEST6383805807两个有效输入缺口已真实确认，原C2取得C1明确release后START短修（C1两暂存文件+188/production未改/无运行保留，修后即返槽继续）。旧dbec storage/full申请6383787655公开hold等新头。ACA005真实MCP单撤source/reader仍回正文P1已核，实施owner FIX1及精确原grant/新grant不得救活/合法owner索引合同已TASKS accepted WO；在本C2短修→C1有界收口后的下一源窗实际接，不停在待验证。新P1不加无关1206/1209门，整线未闭环；W5 FIX2真依赖1206实际落地、按现batch29保留。

- 2026-10-24 11:57 UTC full28新红已交原ac-kernel/#1207（6383898773）：28098700f/run40089971546 shard8 job120860480187 management首2/4、自动retry仍红、84/85文件；cancel/disconnect line92无settled取消诊断。TEST已核新增BL501前置discover等待后signal.throwIfAborted在dispatch前抛出、未进中央invoke/settlement，故未执行诊断缺失；不是late commit结论/不是1208或1187，fa52实际2ca同文件4/4原raw有效。原owner须沿现central settlement保同callId/actor/capability单行无内容诊断及零业务写/零fallback，修头即时审验，不drop断言/不称flaky。不取消余片、不重复full；full27b/1206不受这条新增代码失败连坐。另1208 ac-review6383624497两nonblock（stream谓词/注释、两脚本内引迁public context）已具体归FIX2并公开6383898956，依赖1208真merge，P1/W5后实际窗口实施，未修不闭环。
- 10-24 12:01 UTC：**#1206 合入 `c6093a2e9`**（batch-27：#1200 #1114 #1180 #1186 #1185 #1182 #1197 #1199；合并后的树全量 run 40089127294 全绿）。八个切片 PR 已关，batch-27 的集成分支与工作树已删。
- 10-24 12:01 UTC：batch-28（run 40089971546，`28098700f`）第 8 片 `security-invariants-management` 首跑 2/4、重试也红（cancel/disconnect 第 92 行没有「未执行」诊断行）→ **#1207**（Codex TEST 6383923314 归因：发现期 `throwIfAborted` 在进中央结算之前抛），已交 ac-kernel 修；其余分片在跑。#1207 的修头出来后批 PR 换用。
- 10-24 12:01 UTC：Codex 单 writer 顺序（#1107 统筹评论）：#1209 两条 must-fix → ACA005（R-46，P1）→ W5-06 链合 main → C1 RAC114。batch-29 候选：W5-06 链、#1209、ac-sandbox-sched 的 P2c/P2d、ac-coding C2b/BL-372（等构建空档）。

- 2026-10-24 12:08 UTC流水线核落地：#1206实际c609/11:59:44Z，8固定源head逐一ancestor fa52 exit0、landing与已测2ca树1ff5f00相同，Claude八条closing带SHA已核，移§3不重复关闭。1209新远端e20普通push成功、REVIEW6384019404增量过，TEST有限新头复验接续；C2明确无源工作/release，C1已实际RESUME原188checkpoint续RAC114，不为投递/审验占源槽。之后FIX1 ACA005按已批准generation/v3合同实际接，W5真main依赖已满足但source按P1优先排，不要求等ACA005CI/merge。full28第二红是S63正文引号被S20测试误当title变异，已1187/6384008199交Claude批writer纯docs最小改，真实gate仓库已过，不动生产gate/命名空间/真实8title/断言。
- 10-24 12:25 UTC：batch-28 两处红都已在源头修：#1207 新头 `65b8494b6`（两路不再先查目录、精确钉 Goals，取消由分发器结算）；S-63 行里非测试名的「」改写（批分支里一次处理，不要求 ac-sc3 同步）。批 PR 分支 `batch/1024-28` 由 main `c6093a2e9` 合 #1208 `29047337f`、#1207 `65b8494b6`、#1204 `f48d20cd2`、#1205 `47c8316ff`、#1187 `7686e5a69` 加 S-63 修正；与受测树 `28098700f` 只差 #1207 的 4 个本地文件和 S-63 一行，本机补跑 management/doc/goal-events-state 与 macOS 专属清单，不另起 full。
- 10-24 12:25 UTC：PG-031 另一半（ac-kernel）裁定：Goals 入口动作用 contracts 描述符（`goalEntryActions`，`modules/goal-actions`），不走目录查找；调用仍经动作网关，Goals 精确钉、`allowed_actions` 不放宽（R-45 等 ac-trust 同意清单）；改合同、共享核心，batch-28 合入后给构建时段，进集成批跑全量。
- 10-24 12:25 UTC：#1209 新头 `e20e68f0a` 独立 REVIEW 6384019404 / TEST 6384047094 已关两条 must-fix → batch-29 候选（改 `packages/storage`，共享核心，进集成批跑全量）。

- 2026-10-24 12:24 UTC：C1 RAC114固定1213/8fce66c63并明确release，REVIEW6384157844过，TEST必要覆盖/同头CI接续；新快4例product-subset共享一行已交Claude实际批writer，未实施保留。下一唯一writer已实际START FIX1 ACA005 P1（generation/v3已root批准），不是继续只读；固定即直审验/release不等CI，W5源接续不额外等P1merge。1209 e20双独立过/源冻结，storage/full申请6384076618由Claude统一；full28最终14worker成功、2worker失败，aggregate失败不是第3产品文件，分别1207取消诊断和S63正文引号枚举，原owner/批writer已具体派修，未据此称flaky或追加full。

- 2026-10-24 12:29 UTC：#1207已交新65b8494b67acd812bf0ff3f5d77eb1386104679b（6383966882/6383975189），原ac-kernel在现可信Goals退路下删冗余pre-discover，精确invoke回原dispatcher；management作者三轮4/4/13文件绿，旧280失败不冒新头验收。流水线已即时派独立REVIEW从9c70核scope/diff/信任边界与最终BL501尾项，TEST核现raw/必要范围，6384260851请求已有stdout不机械重跑/不新增full。当前新头审验未齐不写闭环，不要求为原建议额外造settlement API；是否进最终批/适用证据仍Claude定。
- 10-24 12:50 UTC：**#1214 合入 `9ed0e7a5c`**（batch-28：#1208 #1207 #1204 #1205 #1187，S-63 归 #1187）。五个切片 PR 已关；batch-28 不另起全量的依据写在 #1214 认领评论（与受测树只差 #1207 的 4 个 local-host 文件、S-63 一行、baseline）。
- 10-24 12:55 UTC：**batch-28b #1215**：#1213（Codex C1 RAC-114，`full` 空）单独落地，批里加 `tests/uninstall-receipt.test.ts` 进产品子集（流水线 6384200965 交统筹登记）；Verify 过后自动入队。
- 10-24 13:00 UTC：**batch-29 集成** `integration/batch-1024-29` `52c09a280`（叠在 batch-28 + 28b 上），run 40094734962：#1212 `334db4c5c`（含 #1210 `b6fb2d112`，PG-017 P2c/P2d）、#1211 `087e2b15d`（C2b，「坏记录让选择器读不出」统筹裁接受）、#1209 `e20e68f0a`（W5-16 B2a）。批里解的冲突：todo `store.ts` import（#1205 拆分 × P2c 把 `TODO_DATABASE` 移进 `database.ts`）、`plugin-platform.ts`（取 #1187 的 `projectLibraryOf(options)`，去 P2d 删的 `filesFor`）、`uninstall.ts` 两 import 并存、W5-16 切片文档取 #1209。S 号按合入顺序：**P2c S-65→S-64、P2d S-66→S-65**（16 个文件）。本机 build、三份安全文件、健康门禁、页面资源通过。

- 2026-10-24 12:46 UTC核落地：1214/d134实际12:33:15Z merge9ed0e7a5，5源头逐一ancestor d134=0，landing tree cdd5f115=批准头，5源关闭回执均核，已移§3。原full28两红保留，S20纯doc修已批内落；management65已独立REVIEW6384313623/TEST6384365097收口（CI4/4原断言facts/fallback到达+正式61本地首过），不是独立复跑13/30全部。1207 PR标题正文与1214表述已流水线实际API更正；两个main source slice旧事实P2具体交FIX2 E22/SSOT队列，metadata已修不冒source也修。1208两nonblock依赖现已满足，等当前P1/W5后的实际source窗。1213独立TEST6384262843通过、CI实际Verify/合同/Security/Product齐，但product-subset一行仍交Claude实际批writer待落，不因登记当完成。唯一source仍FIX1 ACA005，已baseline build0/正式MCP红例接线，尚未把无效fixture失败当产品红；不新开writer/full/真实Home。
- 10-24 13:20 UTC：**#1215 合入 `1712c0331`**（batch-28b：#1213 + 产品子集一行）。#1213 已关；batch-28/28b 的分支与工作树已删。
- 10-24 13:20 UTC：privileges 状态：统筹分支 `privdocs/hub-1024`（`491d7061c`，从 `9ed0e7a5c`）= PG-031 Goals 部分（#1207）、PG-094 S9-0（#1187，S-63）+ `privdocs/ac-sandbox-sched` `f2ffe74ba`（PG-017 P2c/P2d、PG-022、PG-102～104、V-30、PG-026-S1，S-64/S-65）+ `privdocs/ac-coding` `bdcb08aea`（PG-086 已做）；并进 batch-29 批 PR，不另开 PR。
- 10-24 13:20 UTC：**batch-30 候选**：#1218（ac-kernel PG-031 另一半，`89ba1b65a`，contracts，`full` 非空，含 #1207 的两份 spec 纠正）、#1216（ac-giants W5-10 im-ui `controller.ts`）；都交 ac-review 评（#1218 重点看门禁 `checkGoalTransportCallers` 没变松）。W5-06 链等 Codex 合 main 后进。
- 10-24 13:55 UTC：batch-29 全量 run 40094734962：15 片绿；第 4 片 `local-web-actions` S-15 首跑与重跑都红 → **#1210**（Images 改用 `ownerFiles` 后，启动清理无引用图片在动作之外要 `images:read`，撤读权就启动失败）。作者修在 #1212 新头 `d266035d5`（Codex REVIEW 6384912989 PASS），S-15 断言不改。**批 PR #1222**（`batch/1024-29`，main `1712c0331` + #1212 `d266035d5` + #1211 + #1209 + `privdocs/hub-1024` + S 号 + 基线）：与受测树只差 Images 修复与文档；本机补跑 32 文件（含 27 个 macOS 专属）通过（`secret-store-keychain-retry` 负载时序，单跑 8/8）；Verify 过后入队。
- 10-24 13:55 UTC：batch-30 全量 run 40096378130（`integration/batch-1024-30`，+ #1218 + #1216 + privdocs）：14 片绿；第 4 片同上 S-15；第 7 片 `context-card-in-work.e2e`（重试过）与 `work-placement.e2e`（CDP「Inspected target navigated or closed」，首跑与重试都红，本机单跑 2/2 过）——两者都在 `known-red-main.md` 偶发清单，判环境与时序。
- 10-24 13:55 UTC：**batch-31 集成** `integration/batch-1024-31` `4025e7734`，run 40097934314：叠 batch-30 + #1220（ac-kernel R8 第 4 批，BL-364 收尾）、#1217（PPT 客户端）、#1219（Form 客户端）+ #1212 修复。解的冲突：`characters-host.ts` 两个 import 都不再需要（#1211 × #1220）、`uninstall.ts` 取集成、PPT/Form `registration.ts` 加 `*_MESSAGES` 去 `*_HOME_STORE`、BACKLOG 两行并存、`creative-tools-plugins.test.ts` 两边断言并存。ac-review：#1220（BL-520 Characters 私路待跟进）、#1217、#1219 都可合。
- 10-24 13:55 UTC：在审/待批：#1221（Codex ACA005，REVIEW PASS，等 TEST）、W5-06 链（FIX2 合 main 中）、ac-sandbox-sched P1 本地 `ce31a2c82`（等 #1222 合入再开 PR）。

- 2026-10-24 13:49 UTC 流水线核收：1221/17b6已独立双PASS/适用CI全绿，6384958236公开认领后正常精确head入队，实际position1 QUEUED/main1712，非已合；无新full。1222/a4e由Claude已有认领，S15新d266已增量审验，但Keychain两次单跑原raw待，31/32首过与live skip保留。full30/40096378130新增work-placement首+retry红、context-card首红retry过，TEST已接只读准确head/raw/旧known-red适用核，不从名单/本机2of2即认环境根因；full31/40097934314由Claude唯一启动，TEST核真实source及新增红，不重复起批/取消。
- 10-24 14:10 UTC：#1221（ACA005）由 Codex 落地 `61248691d`；#1222 因与它在 `HOME-DATA.md`、`SECURITY-INVARIANTS.md` 冲突被队列移出，统筹合 main 到 `batch/1024-29` 得 `b71b71b63`（本地，未推）：S-18 行取 P2c 行并插入 ACA005 的文字与测试引用，HOME-DATA 两段都留。合后 `system-search-authority`「ACA005-03/04 another reader granted before acceptance…」3/3 红（「Query answered without entering its owner's HTTP wait」，跨 PR 交互），交 ac-sandbox-sched 二分 #1209～#1212 并修；修好后推送、补跑、重新认领入队。
- 10-24 14:10 UTC：batch-31 run 40097934314 第 4 片 `health-gates-structure.test.ts` 第 582 行首跑与重试都红 → **#1220**（R8 把 Agent registrar 与 Host 组合改成动作后，仓库实物断言还写旧的 typed 债务；同用例第 587、591、592 行同类，Codex TEST 6385096383）。交 ac-kernel：断言改成 R8 后的事实，合成 fixture 变异覆盖不减，不改门禁算法与阈值。
- 10-24 14:10 UTC：**batch-32 集成** `integration/batch-1024-32`（本地，未推；叠在 batch-31 `4025e7734` 上）：#1107 `f25e08cc1`（含 #1098）→ #1191 `8bf13e204` → #1173 `f45abe4e8`。解的冲突：cognia Manifest（`databases.home` 与 `group: "personal"` 都留）、`ci-product-subset.txt` 两边都留；#1191 × 批 31：13 个 `tests/coding-*` 取集成一侧（`withFakeAgentHost`）并把 `codingRouteHooks` 改名 `filesOutputsRefresh`，`goals-project-database-refusal` 去掉 `codingDirectoryPanel`，`index.ts` 加 `ensureProjectPlugins, projectPluginProblem` 并留 `AgentWritePlaces`，`web-goals-read.ts` 取集成参数表并改 `ProjectPluginSurfacePorts`，Coding `registration.ts` 取集成 import 加 `codingUiView`，`host.md` 第 8 步前半取集成、Coding 族一段取 #1191，装配门禁 `HYBRID_RUNTIME_PLUGINS` 清空（Shelf S4、Coding C9 都离开）；#1173 的两行 `SECURITY-INVARIANTS.md`（S-38、S-47）逐句三方合并。等 FIX2 交 #1112 新头后并入再推送起全量。BL-372（ac-coding `8af84df30`）基太旧、与批 29/31 的源码冲突 11 个文件，作者在批 29、31 合入后合 main 解，进 batch-33。
- 10-24 14:10 UTC：开发线：ac-kernel（#1220 修 → agent-host 巨大单元/PG-045）、ac-clients-1（Workflows）、ac-sandbox-sched（二分 → P1/P3）、ac-coding（BL-372 开 PR；BL-521 发事件一半从 main 本地叠片；BL-366 与钩子删除在 #1191 后，归 ac-coding）。
- 10-24 14:40 UTC：**batch-32 全量** run 40101913599（`integration/batch-1024-32` `bc6d5fd92`）已起；批里补 `tests/coding-companion-stages.test.ts` RAC-438 的断言（Shelf S4 后混合名单为空，#1191 × S4）与 BL-387 一行（#1112 晚于 #1107，统筹先补）。#1112（FIX2 本地 `08b91a484`，REVIEW PASS）改进 batch-33。
- 10-24 14:40 UTC：#1220 修好新头 `e5ff26268`（只改 `health-gates-structure.test.ts` 四处实物断言）。batch-31 全量其余 15 片绿。**批 PR #1224**（`batch/1024-30`，main `61248691d` + #1218 + #1216 + #1220 + #1217 + #1219，不含 batch-29）：本机 30/31 + `ppt-actions.e2e` 过；唯一红 `system-search-authority` ACA005-03/04，与 #1222 同一句——不含 batch-29 也红，所以多半不是 #1209～#1212；ac-sandbox-sched 改在干净 main 上核，main 也红就按「main 红」交 #1221 作者。结论前 #1222、#1224 都不入队。#1222 另有 CI run 40100861672 的 `security-invariants-runtime-backups` S12 子进程 ETIMEDOUT（Codex 交 #1209 作者定位）。

- 2026-10-24 14:34 UTC 流水线当前事实：ACA005代码修复已612实际merge/tree同批准，已移§3，真实Home维护未动。1222远端b71文档冲突已消，但新增本地Search正控提前返回+适用安全FIFO child timeout两个不同症状必须判明，明确不入队；已有原owner ac-sandbox-sched/C2+TEST，源writer不增加。full30完整TEST6385143866：1364=1360首过+2retry过+2最终红（旧S15/1440Placement），FIX1只读定点；full31 TEST6385291567：1366=1361首过+4retry过+1typed旧锚点红，原1220/ac-kernel修，script/85变异fixture不放松。用户1162→1198精确新授权已具名FIX2、1112已fixed转交；UI占公槽优先，独立诊断不新增其门槛。
- 10-24 15:00 UTC：batch-32 全量 run 40101913599 已红 3 片，都不是产品回归：第 4 片 `health-gates-structure`（集成 32 叠在 #1220 修前的头上，已并 `e5ff26268`）；第 5 片 `web-route-table` W5-07 路由快照缺 #1107 新字段 `unavailable_plugin_stages`（批里重录，只多这一个字段，两处 board 答复）；第 12 片 `workbench-ui-platform`「W5-06 every surface … names a slot the Workbench host offers」→ **#1191**（Files 的面指向 Coding 描述符声明的 `coding.companion-directory`，用例只认工作台槽），交 ac-coding 改成「工作台槽或嵌入方声明且在 `ui.embedded_plugins` 里列了」并留反例。前两项已在本地 `integration/batch-1024-32` `2c2975c41`，等本轮跑完、#1191 新头到了一起推。
- 10-24 15:00 UTC：`system-search-authority` ACA005-03/04 定性：干净 main `61248691d` 上 5 次 1 红（ac-sandbox-sched 实测），是 #1221 用例的时间竞态（宿主项目打开 2 秒后的知识库补读刷新来源 `checked_at`，测试固定等 3.1 秒落进 `freshMs` 窗口）。修法只改测试（`337727f97`，等待按 owner 最近一次被读算），已进 #1224 新头 `5766a24f2`；请 Codex REVIEW。#1222 合 main 后自然带上。
- 10-24 15:00 UTC：**用户弹窗定 S-57 扩展**（PG-045 前置，ac-kernel 稿 `slices/s57-connections-extension.md`，`privdocs/ac-kernel` `8efec423e`）：照稿批准；存量 Feed 账号一次性脚本带过去；`account_label` 删列；真实 Home 那次放同一维护时段。X1～X4 归 ac-kernel（号段 RAC-470～489、BL-595～604），排在 PG-031 宿主余项之后、PG-007 之前；`privdocs/ac-kernel` 并进下一个批 PR。

- 2026-10-24 15:36 UTC 流水线：1162 actual2b253d45/tree da533975=edace/CI5435已核、移§3；1198唯一FIX2已本地1de12b8e整建/91例与三CSS各+7，原3case24态+零阈值66/22一轮待公共browser，有限base固定1162真SHA，后续main交queue。1224已Claude原claim排队，新Search6行与1222/b99S12协议已直派独立增量，不创建重复writer/full/queue。旧BL595预留撤销，595–604听最新Claude给kernel，#784FIX1真实待做及历史保留/提案STALE，实际短窗再鲜定新号。
- 10-24 15:45 UTC：**#1224 合入 main `112114f23`**（batch-30：#1218、#1216、#1220、#1217、#1219 + ACA005 竞态修复 `337727f97`；Codex 增量 REVIEW 6386074856 通过）。五个切片 PR 已关。#1162（Codex，Pages 弹窗）先于它合入 `2b253d457`。
- 10-24 15:45 UTC：#1222 新头 `2d2883c53`：Security 2/2 的 `security-invariants-runtime-backups` S-12 RAC-104 改成「ready 后 2500ms 覆盖调用、精确拒绝与自然退出」，加阻塞与取消对照（Codex REVIEW 6386075095 P1 指出统筹先前 `b99c3adf8` 的 1 秒检查挡不住同步阻塞、丢了自然退出约束，照 C2 方案改）。本机 4 次 7/7；旧 Linux 红的阶段没有观测，等新头 Linux CI 收口。另带 ACA005 修复（与 #1224 同内容）。等 REVIEW/TEST 与同头 CI。
- 10-24 15:45 UTC：**批 PR #1225**（`batch/1024-32`，main `112114f23` + #1107（含 #1098）+ #1191 `d1843c3aa` + #1173 + 批里三处修复 + BL-387 + privileges（PG-036 C9、PG-037、PG-060 2b/3、PG-091 已做、PG-099 Coding 部分、PG-045）+ S-57 扩展稿）：本机 48/48，门禁过；等同头 CI。#1112 进 batch-33。
- 10-24 15:45 UTC：BL-388、BL-430 在 privileges PG-060 里被引用但 BACKLOG 没有行（main 上本来就缺），ac-shell 开线时补行。

- 2026-10-24 15:51 UTC 流水线CAS冲突鲜读合并：保留Claude新15:45的1224/1222-2d/1225与BL388/430记录。1224实际112/treef874=2b+5766与五源包含/带SHA关闭/queue Verify核齐，移§3；1220/e5ff四锚点独立Review6386154511和有限Test新CI86首过+实际源码同已PASS，原full31红保留。1222原作者新2d已即时复审验，不凭旧b99绿解除P1；新Linux证据待。1198旧129正式3图红原封保留，Root具体批同writer修side-files真实列表ready/先红绿再原66/22一次，另6/4px未知不豁免；未Ready/push/合入，C2下一B2b只/tmp合同待明确release，不把失败当交槽。

- 2026-10-24 16:03 UTC 流水线当前：1198远端20e9bef8 docs-only历史两行将普通merge保留，6386367670公开当前FIX2/请原作者此轮不并写branch/spec；Root已批真实ready红绿/一次原66+22，旧129三图红和6/4px UNKNOWN不豁免。UI fixed/release→C1 RAC115→C2B2b明确实际接续，不等旧CI/full，不加1198门。1222/2d计时核心已修但Review6386273574真实t.signal/pre-abort/late-ready余P2返原批作者，新头/Linux待；1225Review6386329302 PASS、两句nonblock实施FIX1已6386368000，Test真实raw继续，未以登记/Review代真merge。

- 10-24 16:15 UTC：**#1225 合入 main `2dd535912`**（batch-32：#1107（含 #1098）、#1191、#1173 + 批里修复；Codex 组合增量 REVIEW 6386329302 通过）。切片 PR #1098、#1191、#1173 已关，#1107 头已在 main 显示 merged。两条文档意见（BL-387 的 Manifest 字段说法、C9 slice 的 HYBRID 余项）归 Codex FIX1（6386368000）。
- 10-24 16:15 UTC：#1222 再合两次 main：`c02de0389`（#1224；rerere 三源已核，顺改 Coding README、LOCAL-HOST.md 里已删的 `codingCharacterPorts`；126 文件本机全过）与 batch-32 合并（LOCAL-HOST 两行都留、SECURITY-INVARIANTS 按行三方、cognia/ci-subset 并集）。中间 `acf89a9cc` 按 Codex REVIEW 6386273574 P2 把 FIFO 子进程接到用例取消与 after 清理（`fifoChildren(t)`；三处变异各自变红）。两边都改了 SDK `manifest.ts`（自动合），#1222 加 full-suite 跑 CI 全量。
- 10-24 16:15 UTC：ac-kernel S-57 X1 推送 `ac-kernel/s57-x1-services` `074597676`（未开 PR，要 full）：connector-host 的 `origin` → `origins[]` + `refresh`，登记 GitHub、Gmail 与 24 个 Bearer 服务；RAC-346；分支上暂写 S-64，正式号 S-71（合入时按末号改）。租户型服务拆 BL-595。PR 顺序 giants-a → PG-031 余项 → PG-007 → X1。

- 2026-10-24 16:16 UTC 实际收口：1225 actual2dd/treead24278=f2、四源固定祖先+真正main包含/队列Verify核齐，移§3；1107早前15:17下层merge不冒当时main。1112进33保持未合/整W5不关，48raw/原full32红与一live未执行保留。1198 fixed fd3源码/spec已FIX2公开6386459129明确RELEASE，按Root具体指令仍Draft、CI40110037944与必要新formal93507并行；结果+guard恢复未齐不PASS。唯一Codex writer授C1RAC115 freshmain2dd53591276982b6947369e345ddfcffcc21afd2实际START，固定release即C2B2b，不为等CI/full/merge空占；FIX2需改源先返槽。新full32 web.test health actualstarting/expectedok首红retry过交FIX1/R44只读归因，原因未证不标flaky。

- 2026-10-24 16:35 UTC 新用户优先指令已鲜核8 PR/head/base/comments/真实认领与DIRTY/queue状态并挂本chat：Root催先1222，公开6386688449返原Claude现成a788与3真红；不为1198/下一新片延后。1112现成未发布integration33 carrier已找到但混1226–29，须先明确旧目标优先范围。C1当前安全有界片后source优先旧8，C2B2b合同owner保留但后移；普通fix/merge授权已够，不再问同一许可。
- 10-24 16:55 UTC：#1222 推 `a788e1a41`（再合 main `2dd535912`）。本机 focus 119 个文件里 3 个红，逐个核过、都不是本批：home-aggregate 单跑 6/6；cognia-mcp 拆阶段量到 10.2s 无卡点，原用例本批两次 1/1，干净 main 两次 1/1；Cognia 390px 本批两次 4/4、main 两次 4/4，本批不改 Cognia 浏览器、样式与 workbench。390px 那次谁把 `data-expanded` 设成 true 未定，交 Codex 测试修复队列加诊断（PR 评论里写了）。Codex REVIEW 6386623257 关了 P2。
- 10-24 16:55 UTC：**batch-33 集成** `integration/batch-1024-33`（叠在 #1222 `a788e1a41` 上）：#1226 → #1227 → #1228 → #1229 → #1112，全量 run 40112466492。解的冲突：Workflows `registration.ts`（去 `home_store`、留 `messages`）；#1112 × batch-32 四个 Manifest 视图行合键（`accepts_objects`）、workbench 入口导出并集、EXTENSION-POINTS 两条「按需」都删（包外 11 处，外加 2）。本机 build、tsc、health --base 过。#1222 不另起 full，用这一次。
- 10-24 16:55 UTC：X2 存储定 ①（沿用 `connector_bindings`，scope_id 由 connector-host 一个函数拼解；记录键限字符；卸载、删项目按带分隔符的前缀/锚定删，测试放互为前缀的 id）；X3 刷新失败的 `reauth_required` 做成宿主进程内标记，只在令牌端点明确拒绝时标，不改库、不删密钥。S 号 X1 S-71、X2 S-72、X3 S-73。

- **2026-10-24 16:45 UTC 用户最新方法覆盖旧逐PR次序**：一骏要求若旧执行方不再做就合成一个，避免合来合去。Root已鲜核原Claude仍推进、1222已普通push a788e1a413f8ffce6d60c922f3c18092e9b343d3，故当前source owner仍原ac-batch29pr，不另起重复writer。以a788已含四源为核心，把1109@8921、1112@08b、1223@8af统一**一个最终共同carrier**，复用integration33/d3的1112六真冲突解法但不把1226–29新增当依赖；原分支全线成果保留。原writer须给唯一branch/worktree/head与所含源，不逐个leaf合main/刷baseline。原1222 CI自然跑作现成证据、不取消，暂不与共同结果竞争入队；仅真实共同树一次共用文件/必要build/security/full/增量双审、最终一个queue actualmain后一起关8目标。1198临时明确交Root唯一Ready/queue/actual核，流水线不重复命令；C1已在当前有界RAC115安全固定后release，之后source优先8真实修复，原Claude明确不再写该组才交可用FIX2接共同候选。当前3focus中Cognia390需真实Back回列表、不改隐藏规则；MCP唯一有界/tmp阶段取证已派TEST，原45s不加、不新full/第三次盲跑；HomeAgg已有6/6新raw保首取消。
- 10-24 21:35 UTC：#1248 由 Codex 经队列落地 `0a90a0ef2`。FI-3、FI-4 设计稿（`claude/ac-feed-inbox-designs` `582a8b123`）统筹审：方向认可。FI-3 必改——集成冲突改成后装者启用时拒绝（不让后装插件打掉已登记集成）、写明声明 service_id 不给连接权、OAuth 声明地址走平台地址校验、`integrationKeyOf` 放 Feed、四张宿主目录卡写成平台声明列表；FI-4 必改——release 删文件在 Home 写事务提交前、写正文在 hold 之后，备份恢复与导入的项目库要重新 hold（实例启动对账 + 平台路径触发），新 Home 的 `backfilled_at` 怎么来写清。号段：Feed/Inbox 加 RAC-500～519，S-57 X 片收到 RAC-470～479 另给 520～539（原 470～489 与 480 段撞）。新登 R-48（`OfficialProviderFactory` 过渡口）、R-49（#1245 的 null owner 路径随 FI-6 删；#1245 与 T1 的基线版本 9→10 由统筹组批时统一）。R-47 按 Codex 6389783641 更正：query 成功不记行，batch-35 的约束已转 ac-kernel。
- 10-24 21:45 UTC：#1247（FI-1，PG-034）二轮可合（Codex 6389827852，head `a7f47a3a5`）；`full` 命中 shared-core 与 spans-packages，且与 batch-34/35 同碰 `modules/functions/src/{actions,index}.ts`，按 §1a 并进 **batch-35**（`fe86d5cec`，index.ts 导出行两边都留）。三包构建过；local-host 只剩已知的 announce 读口 3 个类型错误（ac-kernel 修）。batch-35 源：#1239、#1240、#1242、#1243、#1247 + ac-kernel 读口修复；落地时改 PG-034。#1249 FIX3 新头 `516bd00d3`（只加注释）等 Codex 二轮。
- 10-24 21:50 UTC：**batch-34 全量重跑** run 40135252991（`integration/carrier-1024-34` = `batch/1024-34` `93176d8b5`）：吸收 Codex 修复1 `9a5da56cf`（公共 Home 夹具读 Catalog 目录）+ `6720aabac` + 合 main `0a90a0ef2`；本机原红三文件与新回归 4/4 过。#1249（C3 Gmail 巨大单元，二轮可合、TEST 过，`516bd00d3`，full=deletes-code）并进 batch-35（`cca312d89`）。batch-35 源：#1239、#1240、#1242、#1243、#1247、#1249 + ac-kernel 读口修复；等 batch-34 落地。
- 10-25 03:13 UTC：**batch-34 全量重跑全绿**（run 40135252991，`93176d8b5`），#1241 认领入队（squash，队列第 1）。FI-3/FI-4 设计稿 `336fbb6de` 统筹审过（只改一处：新 Home 的回填标记用本插件自己的安装记录，不给整个 Home 的项目列表）。**用户弹窗批准** W5-04 第三组新增四个页面资源（git/files/diff/text-stats，上限等于实测）；workbench.js 多 71 字节由统筹批一次性放行。ac-clients-1 号段 RAC-540～559、BL-605～614；PG-055 草案 D1～D6 已裁（D6 不留例外），迁移合成两个 PR，排在 3b 之后。ac-review 派 #1250（T1）、#1251（A2b）一轮。
- 10-25 03:25 UTC：ac-kernel 读口修复 `8873301c2`（`workspacesFor` 端口从目录库给，与 browsingWorkspace 处理器同一主人）并进 batch-35（`b361a8149`，local-host 构建恢复）；统筹要它再补一个提交：去掉宿主入口为测试导出的 `ProjectBrowsingSettings`（故障从端口注入）、`workspacesFor` 改必填。#1251（A2b）一轮可合，4 项不挡合并交 Codex；#1250（T1）一轮挡合并 1 项（`as unknown as` 0→1）+ 6 项不挡合并交 Codex，统筹裁官方集成等级为 `host`（6392849194）。
- 10-25 03:40 UTC：**batch-34 落地** #1241 → main `df5527f27`（与批末端 `93176d8b5` 逐字一致，另含其间的 #1244）。8 个源 PR（#1227、#1228、#1226、#1229、#1232、#1231、#1230、#1234）已关并删分支；另删 carrier、fixture 修复分支、`claude/ac-coding-bl521-hook`（已含在 #1230）、本地 ac-batch34 工作树。privileges 的 PG-007、PG-017、PG-031、PG-037、PG-044 状态格已在 main。batch-35 先合 batch-34 末端（真实历史，无冲突）再合 main（8 个冲突文件 main 版本都等于 batch-34 末端，取 batch-35 一侧），`batch/1024-35` 已推；等 ac-kernel 的补充提交后统一 build 与快照刷新、开批 PR、起全量。已通知 ac-sandbox-sched 开 BL-490 PR、ac-kernel 推补充后开 X1～X4。
- 10-25 03:55 UTC：batch-35 开批 PR #1258（`batch/1024-35` `927897a11`）。源 PR 7 个：#1239、#1240、#1242、#1243、#1247、#1249、#1250，另并入 ac-kernel 的组合修复 `8873301c2`、`60ef1b902`、`8d4c254cd`（目录端口改必填，coding-session-follow 等 3 个测试的装配改走测试动作服务）。本机组合修复的 3 个文件全过；health（--base）、boundary、secrets 都过。privileges：PG-034 已做；PG-001、004、005 改为进行中（T1）；PG-056 进度更新。本批没有新 S 号。全量在 `integration/carrier-1024-35`（run 40159810466）上跑，期间不往这个分支推。#1256（ac-kernel X1～X4）已派 ac-review 做一轮。
- 10-25 04:05 UTC：设计稿审过两份。
  - ac-registry `slices/w5-02-registry.md`（`09555b064`）：方向认可，顺序 A→B→C→D→E，A 现在开工。
    - B 拆成两个 PR：B1～B3 一个，B4 单独一个。
    - 成果类型五项留给 A3。
    - `project_rows` 与 S-暂A 照稿批准，另加三条必改：只删自己那份库，表名不带库限定；沙箱插件的 Home 库要么按声明删、要么明确拒绝；label 转义显示，并写清运行中实例持有写连接时怎样删。
    - PG-095 的 Images、Jelly 两份作 Codex C4（RAC-620～624，BL-617）。Shelf 合同的主人定为 `modules/shelf`（BL-618）。
    - 根 `package.json` 的生成豁免比用户 10-19 批的宽，C 开工前弹窗问用户。
  - ac-shell `slices/w5-06-shell-remainder.md`（`16a121329`）：四片认可，第 1 片开工。
    - D1 每次读页面时现算；D2 只放外壳要用的声明，加不可信文本的转义（JSON 进 script 标签按 `\u` 转义，icon 只认图标集）；D3 用只读转换动作，结果体积写清；D4 BACKLOG 不补行；D5 目标输入的 `CREATE` 归第 1 片。
    - 第 3 片的重启只给失败或被隔离的实例，停用的插件发 restart 要被拒。
  - 两条线的端口对齐：ac-shell 的 `plugin_directory` 就是 B1 的渲染端口，B1 不另开一条。`web-goals-read.ts`、`plugin-catalog.ts`、`immersive-shell.ts` 同时在评审时照 §1a 同批落。

- 10-25 04:20 UTC：
  - ac-platform `slices/platform-authority-audience.md`（`ac-platform/authority-audience` `bc626a13c`）审过，可以写代码。
    - PPT 依赖 Pages：隐藏了 Pages 就拒。
    - 没有外层的自调用：受众是 `plugin`。
    - `project_reach` 要两样都有：Manifest 声明权限 `projects:reach` 并经安装授予，动作上再写 `project_reach: "person"`（只许 Home 级动作）。Todo 照这条走，没有特例。
    - 另加必改：常开的判断用 T3 的账本来源；嵌入闭包只放行嵌入那一条路；清单每次调用现算，沙箱路径也要带上；判断函数只写一份，与 ac-registry B1 对齐。
  - 评审排队：
    - ac-review：#1256 → #1254（b5211d8a5，另带消费者夹具候选 e2d2ea19d）→ #1257 → #1259（T3，base 是 T1 的分支）。
    - 新开的 ac-review-2（Sonnet）：#1252 → #1253 → #1258 的组合增量（ac-kernel 三个提交与批里解的冲突）。
  - batch-36 在建：`batch/1024-36`，叠在 batch-35 上，源 PR 是 #1251、#1246、#1245。
    - #1246 × T1：`installationGrants`、`prepareInstallationData` 改用 `host` 信任与 `hostBuildGrants`/`followHostBuild`；#1246 新加的安装调用补 `trust`。
    - #1245 × T1：项目库 v10 合成一版，`project-maintenance-v10.sql` 加上 Attention 两表的重建（owner 为 null，rowid 不变，多一列整笔拒绝），`project-maintenance-v10.test.ts` 加 ATTN-OWNER-07 的断言。
    - #1245 的不变量编为 S-68，所以 #1255（BL-490）、X1～X4 往后顺延。
- 10-25 04:45 UTC：用户弹窗定了两项。
  - #1254：MCP 上下文工具在 App 不在时先拒绝，自动启动另做（Codex C5，BL-645）。
  - W5-02 PR C：根 `package.json` 也由生成器写，同样的豁免。
  - 一轮可合、无挡合并的又并进 batch-36：#1252、#1253、#1254（另 cherry-pick 夹具修复 `e2d2ea19d`）、#1256。
  - #1256 的 S 号顺延成 S-69～71（#1245 占 S-68）；Gmail 的 `refused` 改动落在 #1249 拆出的文件上。
  - #1256 的裁定：
    - Home 安装卸载不清 per_record 绑定，并进 BL-596（ac-kernel，W6 前做完）；
    - 调用结束后不再新起刷新、也不重发，在途的刷新可以保存；
    - 强制刷新只跑一份、冷却 60 秒；
    - 没刷新就把原 401 交回。
  - #1254 的裁定：search、placement 关不掉时照旧不释放所有权，交 Codex 补有界超时与 S-07 的说明。

- 10-25 04:45 UTC：**batch-35 全量 40159810466 红**（16 个文件）。归因：#1242 删 typed capabilities、`workspacesFor` 改必填后 Coding/Files 的 HTTP 测试没注册 projectSettings 动作（503 `actions.dependency_missing`），mcp-action-grants 还用 `host.register`，project-opened-home-fixtures 两例 RAC-463-FIXTURE-03 待定——派 ac-kernel 在 `ac-kernel/b35-announce-read` 上只改测试修；translation-check 金丝雀下限 8994 < 9000 是 W5-04 第二组搬词进稳定键的预期变化，用 Codex FIX10 `66de11787`（双过后并入，统筹的一半下限 00a638bc1 已撤回）；assistant-undo-refresh.e2e 重跑过，记 flaky。另并入 FIX3 `75d274d08`（REVIEW PASS）。batch-35 头 `06dc68aa0`（未推），修好后重推 carrier。
- 10-25 04:45 UTC：#1257 裁定（6393559237）：`molis-<owner>-` 只给插件主人，判定用 `PAGE_STATE_OWNERS` 本表（files 全在同一插件包目录里），跨包的拒绝；平台主人只用三个平台前缀；三处文档同句，加平台主人发 owner 前缀被拦的拒绝用例。
- 10-25 04:45 UTC：评审派单：ac-review → #1262、#1260；ac-review-2 → #1261、#1263。batch-36 待并入：#1256 FIX8 `dac0c5296`（REVIEW PASS）、#1253 增量 `7f17a75d4`。
