# 交给 Codex 的独立开发片

> **2026-10-23 23:26（洛杉矶）最新分工：** 一骏明确整条防腐线听Claude总统筹：范围、优先级、跨线依赖和全量排期由Claude决定。Codex侧「专职｜防腐流水线与合并执行 · Codex」（`01a16c88-7956-7e10-a5f4-5baf476c3634`，用户最新指定gpt-6.1-sol/max，06:45:56UTC实际回合已核；root/REVIEW保留gpt-6-astra/xhigh）从Claude当前共享派单或明确回执领取独立任务，组织专职实现/评审/测试/修复，按Claude顺序核证据并执行正常合并；Root负责唯一定时巡检；原五类职责和交付驱动接续保持。原主chat保留完整目标、用户沟通并建立1–2个实现入口后交Codex侧接续，不重复建chat。独立树允许多writer，真实同文件/合同/候选重叠串行，公共build/browser槽保持；四专职入口及所有有效block/non-block闭环见[CODEX-SESSION-ROLES.md](CODEX-SESSION-ROLES.md)。DeepSeek历史贡献、Claude开发owner及唯一full组批职责分别保留；review-pr-fixer旧认领已由Claude6381877118明确释放并交FIX2接续；Codex侧协调不替代Claude总统筹。

状态：2026-10-23 起生效。用户 10-23 定：独立的开发任务可以派给 Codex，不必都在 Claude 子会话里做。统筹（本机 Claude）在这里派片、排序；Codex 做完一片在本表写 PR 号，再接下一片。

读法：

```bash
git fetch origin coordination/handoff-2026-10-14 && git show origin/coordination/handoff-2026-10-14:coordination/2026-10-14/CODEX-TASKS.md
```

## 0a. 现行模式（用户 2026-10-24 晚；最高优先，覆盖本文以下所有不一致的旧说法）

**多writer现行规则（Root转达人类最新明确：“可以提升writer数量，不局限1个，不影响速度”）**：不同独立工作树、不同明确问题/实现项、真实依赖已满足且无重复owner时可以同时写，不设整个Codex协作组只有1人的上限。同一文件/合同、同一候选及有真实代码依赖的部分仍串行；公共冲突/生成物由当前carrier owner统一。每个FIX仍一次专注一个问题、gpt-6.1-sol/max，未收尾不塞无关任务。公共build一个、browser批一个、full仅Claude唯一排期不变，等资源不等于停止独立编码；只有Root周期巡检，原交付直接接续与现有角色不变。此条覆盖以下旧“单writer/唯一writer/串行轮换”上限，仅改变并行数量，不凭共享一处文字取消已有授权或在途owner。


全文见 `MERGE-QUEUE.md` §0。用户原话：「在 claude：组织好合并顺序，进行开发和 review。在 codex：review 问题修复，修复后的二轮 review，以及有独立任务可以交付 Codex 执行」。

Codex 做的：

1. **修复**：`ac-review` 一轮评审里的全部有效意见（挡合并的和不挡合并的），在原 PR 分支上修；先留「修复认领」，一轮的修复攒齐一次推送（每推一次跑一次 CI）。Claude 开发线不再修评审意见。
2. **二轮评审**：只看修复的增量，结论写「二轮：可合」加固定 head；没过就回修复。
3. **独立片**：下表。Codex 自己的片也是一个完整功能或 slice 开一个 PR，一轮评审同样由 `ac-review` 做。
4. 测试专职照旧：红用例归因、偶发失败、`known-red-main.md`。

Codex 不再做的：一轮评审（统一由 `ac-review` 做）；组批、起 full、批 PR 入队（统筹做）。

优先级：下一批要进的 PR 的修复 → 其余 PR 的修复 → C1 → C2 → C3 → C4；不同独立工作树/问题在依赖满足后可并行，此顺序不再表示全组只有一个writer。

PR 粒度：没做完只推分支（只推分支不跑 CI），不开草稿 PR 占位（草稿也跑 CI）。落后 main 不同步，共用文件冲突统筹在批分支里解。

评论写法：第一行写结论（可合 / 要修 N 项 / 已修到 `<head>`），带固定 head，正文十行以内；长证据写日志路径，不贴进评论。

**当前修复单（统筹 10-24 晚，下一批 batch-34 用）**：`ac-review` 一轮六个都是「可合」，没有挡合并项；下面的不挡合并项请在原 PR 上修完再二轮，修完的进 batch-34。页面资源、`baseline.json`、S 号这些共用文件不用管，统筹在批分支里一次处理。

| PR | 一轮评论 | 要修 | 二轮 |
| --- | --- | --- | --- |
| #1228 | 6387362602 | 提供方 id 改引登记处常量；权限从动作声明派生（助理规则多给的 `model:invoke`）；RAC-339 覆盖面写准 | Codex 已认领（6387458462） |
| #1226 | 6387391426 | `settleReview` 解构 `readDecision` 丢 `this`，包一层箭头函数 | |
| #1229 | 6387428971 | `translation-check:467` 的过时注释 | |
| #1232 | 6387465387 / Codex 一轮 | `plugin-client-served` 名单补灵光，注释改准 | |
| #1230 | 6387490072 | S-54 行列上 RAC-463 的测试；`announceProjectOpened` 失败后重试，capabilities 不在时不广播空 `workspace_id` | |
| #1227 | 6387370902 | 无，直接进批 | 不需要 |
| #1234 | 6387698407 | **挡合并**：`SECURITY-INVARIANTS.md:81` S-67 正文的「操作 id + 输入」换别的引号（S-20 把「」当测试名，Security invariants 1/2 红，同 #1187）。不挡合并：①受理期间 broker 停止，那条运行逃过取消；②cancel 不查被取消运行的目标；③S-67 三条真进程用例只在 mac 跑，挪到「只在本机跑」那栏，S-66 行补缺的一栏；④S-67 第②道门（宿主客户端）在沙箱路径补测试 | |

| 序 | 独立片 | 状态 |
| --- | --- | --- |
| C1 | W5-13 收尾：宿主日志与吞掉的错误（§2） | 在做；#1231 已过评审，进下一批 |
| C2 | W5-16 B2b：Home 快照与恢复（§2） | B2a 已随 #1222 合入；接 B2b |
| C3 | W5-10 的一部分：官方集成与横向服务的巨大单元（§2） | 待开工 |
| C4 | W5-11：OAuth 移进官方集成插件（统筹 10-23 定） | 待开工，接在 C3 后（同一块代码）；号段开工前问统筹 |

## 0. 接手合并 Agent（10-24 03:40 起，先于 §2 的开发片）

> **当前唯一定时调度（用户最新明确、Root已官方工具读回）**：只有Root `01a12a80-ede2-7b81-93ea-521a5abcc35c` 的 `molis-work` 每10分钟周期巡检；其他定时任务维持PAUSED。本次只改变周期发现来源，原职责和交付直达接续不变：新PR交REVIEW、可合并项交流水线执行、新独立片交对应实现、有效Review问题交原作者/修复、修复新head即交REVIEW增量复查并按风险交TEST；固定头/证据直接传递并抄Root，不等heartbeat或Root二次许可。Root负责周期发现、初始派单与复杂裁决，流水线/专职不恢复自己的定时器或周期扫描全项目。Claude整线范围/优先级/唯一full排期、既有owner和单writer/公共资源槽不变。
>
> **当前真实核收（覆盖17:15等下列旧状态；不覆盖上方现行模式§0a）**：#1222已原Claude按公开6387065309例外正常入队，17:17:56Z actual main `0060920a314224b2eda6b71ee21b7e29323f6962`，singleparent191acc、tree `c739f57f745958777bdd7d6ccfe43a0dbd43eb29` 精确等于merge-tree(191acc,a788)。四固定来源e20/b6fb/087/d266均a788祖先；1209/1210/1211/1212已原统筹17:19带actual006关闭，6387216568/6387217164/6387217787/6387218361均已核。PR CI40112378526十四适用jobs成功、probe预期skip；同actual头queue40114534899/Verify120935646372成功，queue Sec/Product条件skip有别。活动行已移MERGE-QUEUE§3，不重复关闭/集成/入队，旧8整体尚未完成。
>
> **最后3目标已发布一个共同候选**：[#1236](https://github.com/molis-ai/molis-work/pull/1236)，非Draft，`batch/1024-33@331cd096cd78981ba90a8755b511094f7f95ec84` / base actual006，原Claude仍own源码/共用生成物/唯一full与唯一queue。新专职 `01a16f02-8e7e-7a92-8976-fb7befe916fd` 独占1109/1112实际main包含后的两源关闭/交付归档，并核Mac必要缺项；本流水线协调1223，不重复两源或入队。异步交错的‘专职入队’中间建议已实际撤回，1236/6387535966及专职6387549880最终一致为Claude唯一queue，暂无任何额外queue调用。
>
> **331适用审验与真实剩余**：REVIEW6387363344已关版本P2，6387547375补1109一轮源码/1112真正批增量PASS；TEST6387369093已核全根构建fingerprint MATCH与现成27唯一文件209case通过，4既有browser不冒selector。专职新独立health/assets均exit0（27资源7638717B、72API2943），raw `/tmp/molis-pr1109-1112-20261024/331-{health,assets}.log`。准确新full40117579239（push `integration/carrier-1024-33@331`）与PR CI40117632751已触发，原c0b/40112466492另一组不替代、不取消/重复。TEST已实际START本PR明确交付的/tmp-only selector真实浏览器（单隐藏→双出现/改选/重载→所选消失不回退→恢复默认），公共browser单槽。原Claude已有b33-macos.log26ts/jobs5在跑，专职先去重、补缺native-checks.mjs已22/22 exit0，再只对已退出installed-plugin-host/keychain-retry两红jobs1定向核验，不重跑26整批/未退出uninstall；原首红/未结束summary保留，不能叫flaky或全首绿。全部最终适用CI/full/Mac/selector及actual包含核齐后才由Claude入队并各owner关源。原foreman scratchpad `/private/tmp/claude-501/-Users-yijunwang-code-goalboard/a8d0c51f-3071-4520-b7e1-548f6ca97ad6/scratchpad/`，b33-tests原路径已复用，旧35与新27原件由TEST分别保存。
>
> **独立多writer具体接续**：C1实现1在 `c1-assistant-http-logs/goalboard@006` 实际RAC116：两真实失败缺warning红2/2→仅hostLog导入/两catch+3/-2，保174注册组合语义，不改Memory功能/共用logger，整建及相关验证接续；C2实现2在 `w5-16-cli-private-state/goalboard@006` 实际B2b原合同，未交最终头。FIX1已交#1235/52c14058 Images README +4/-2，二轮6387516202 PASS、docs/secrets0，CI40117331601在途；pipeline实际affected full/storage/uncovered均[]，P2待真实merge才闭。其source释放后Root/流水线同题单已对齐接#1230/dfa3064be本轮6387490072（失败缓存重试、缺能力不误播、S54补RAC463；不改drain契约），只一认领/树。FIX2交#1237/e425027b IM初始化类型，二轮6387623263发现生产9实参Object.assign退化any、最终结构检查未成立，原题返FIX2，旧104unit/2browser及首参窄化有效证据保留，不以旧CI关P2。
>
> **新增确认问题与owner**：Root新建FIX3 `01a16f01-0e2c-7450-a0f8-8ad03f18b32e` 专修#1228/a89/6387362602同轮provider id/权限来源。它已用实际assistant-http174→assistant-thread-actions9–18证明线程extra确需model:invoke，原‘多给一项’仅该结论不成立；保真实权限，从规则/跟进/线程组合声明派生，其余有效意见仍修。TEST已交同头Security1原raw：91文件90pass、唯一system-search-authority2/12，10个失败均旧fixture未知provider合法正控失效；FIX3核真调用链后只迁合法fixture身份，不加生产allowlist/不改12case断言。#1232是独立Pages3525，不是旧3carrier；ac-review6387465387 PASS已复用，Product1真实204/205唯一accordion全HTML负断言失败，词典命中只是待writer核假设，尚未找到实际片段，不称flaky/不删断言；已交Root另定单问题owner，不塞FIX3。C1与FIX3若需同assistant-http文件先串行（当前FIX3明确未动），S54只原1230单行，其他独立路径可并行，公build/browser单槽不变。C1/C2/W5/整Home及本人验收均未完成。

> 2026-10-24 16:35 UTC **最新人类指令覆盖下列旧source排期**
>
> **一骏新明确合并授权（Root刚转达并鲜核8个）**：“把1225之前的除了memory相关的非draft PR（784，734也除外），都解决合并掉”。准确集合 **1109、1112、1209、1210、1211、1212、1222、1223**；Memory实质相关（包括Memory base的1196）、784/734与其余Draft排除，不自动Ready，不自动扩新PR>1225。可用清楚包含旧目标的合规carrier，不混未经授权新目标；旧非阻塞owner责任保留。#1198原单独任务独立继续，Root据四完整PNG交叉同bytes/空toast无匹配button已判剩6px非本分支回归，底层仍UNKNOWN、formal exit1/阈值0/首败全保留、无新capture/算法/期望图变更；可Ready正常队列，不挡这8目标。
>
> **立即最高优先1222（用户再催“修了1222，有好几个应该就能直接关，快”）**：source owner仍原Claude `ac-batch29pr`，不重复writer。remote acf89a9cc4b16a1442349c8c725d4557363ae955/DIRTY/checks[]；现成local a788e1a413f8ffce6d60c922f3c18092e9b343d3=acf+actual2dd，Root已薄核5处remerge/两FIFO测试零diff，REVIEW6386623257已关闭取消P2。真正待修是b29m2-focus119文件116过3红：Cognia390两场景上级.cognia-list display:none阻住68/148点击（非timeout），cognia-mcp45s取消、home-aggregate末两15s取消；build exit0不等focus全绿。已6386688449公开急单返当前原writer，TEST复用full32对应raw/生产fixture基线只读归因，不能一概负载/flaky/改断言/新起重复full。修实缺口→仅必要差异验证→固定newhead/实际diff/raw DIRECT REVIEW/TEST→normalpush/正式适用CI→唯一正常queue→actualmain SHA/四固定头包含→立即关1209/1210/1211/1212；不等1198或其他新片。共享曾计划full-suite，目前API未见新头/CI/label，不把计划当已运行，统一full仍仅Claude决定。
>
> **source接续变更**：C1已实际START RAC115，managed c1-uninstall-inspection/goalboard、branch anticorr/codex-w5-13-browser-input、准确base2dd，32openPR全路径无冲突；按Root让当前有界片安全fixed/release。之后source优先这8旧PR真实修复，**不再按旧条件立即开C2B2b**；B2b完整合同/原owner保留后移，Root/Claude最新具体WO覆盖。FIX1只读1109/1223已有owner/承载及真实障碍；FIX2只读1112：对2dd六真冲突已Claude现成integration-33/d3cd76473e38ce4930548063ba81a99758e37906解决，08b与2dd均其祖先/树clean，但无remote/PR且夹1226–1229新片，须按本次边界与Claude明确选carrier，不另source重复sync。所有8当前fresh仍DIRTY、无queue；1109有旧autoMerge（10-23）不等已入队，不重复调用。


> **当前交槽（2026-10-24 16:16 UTC）**：FIX2已明确1198源码/spec全部FROZEN/RELEASED，远端 `fd3e56b8485462985d71630b8c14ec2ebd841919`，normalpush20e→fd3/secrets342/准确base2b health+asset0/完整handoff6386459129已交。仅readonly formal93507（base13/13、head进行）、CI40110037944与metadata剩余；Root最新明确**保持Draft**到正式结果齐，忽略此前可提前Ready建议，不妨碍CI/formal并行。原ready真红/1绿已独立薄核，仍无整体formal PASS，baseline测试guard恢复待自然结束实核。**唯一Codex writer现授C1 RAC115 START**，fresh main `2dd53591276982b6947369e345ddfcffcc21afd2`，先鲜核路径认领/同slice再实现；C1 fixed+release即C2B2b，不等审验/CI/merge。FIX2如需改任何source/doc先返槽，不能并写。
>
> **实际W5片落地**：#1225已16:04:33Z actualmerge2dd53591276982b6947369e345ddfcffcc21afd2，singleparent112、actualtree ad24278b75f296a4f20fc7bdb87b6a237802b3fc=f2e580352固定候选。1098原91e、1107f25、1191d184、1173f45均f2祖先；1107在15:17的REST merged/d09只是入1098下层（tree等f25），**本次2dd才核实际main包含**，非提前完结。原统筹已带2dd关闭1098/1191/1173，source有效逐片/组合REVIEW6386329302与queue40109483030/Verify120919029355成功保留。full32原bc6d 13worker过3红/一web health starting首红retry过均保留，后者FIX1接R44只读归因，不称负载/flaky。TEST继续本机48raw与真实新修有限核收；一live未执行不吞。1112明确下一batch33/三个P2未闭，W5/PG060整线不完成。1225两句doc实际FIX1原稿/实际2dd同blob已核仍未修，唯一writer后续短窗真正实施。


> **当前执行（10-24 15:51UTC，覆盖下列旧快照）**：#1162已于15:25:40Z实际MERGED `2b253d457c2207e5cb1b276cf255f3cbb5f53056`，单parent612、actual tree `da533975180bced6e9e00d21f7c0d8fd130d52ea`=获审edace/PR CI5435，独立REVIEW6385702598与TEST6385703908双PASS、22files359首过/12PNG，适用PR CI40104219811全绿、merge-group40106295985/Verify120909780213成功。仅该片工程落地，原生安装/本人验收未作。**唯一Codex source FIX2已实际START #1198**：fresh290d7990+冻结edace，本地预备1de12b8e后资产提交固定 `129011e03d76cbaac8b4dfdc85988709cee6dc37`，/private/tmp/pr1198-toast-sync；真实冲突仅page-assets一项，产品/test/VUX原文对290d逐字同，wholebuild/boundary通过。三CSS恰各+7、其他24同edace、总7641848B；README/one-toast 9files91首过，budget记录落盘前171中170首过/唯一实物表差异红原样保留，更新实测记录后仅该171复验171/171，断言未改；原完整浏览器3case/24态3/3首过，原正式零阈值66图22样式一次已exit1：两侧12/12，side-files390light1802px、appearance1440light6px、goalwork1440dark4px、22styles零差；旧Todo本轮0不反推旧UNKNOWN。Root实图证side-files基准停loading/head是真材料，已明确授权同一FIX2 source更新同一VUX spec再最小SURFACES ready为panelvisible+生产list aria-busy=false+seeded试用示例.pdf真实行；真实pending/empty反例先旧红新绿，不改production/stablePicture/sleep/mask/阈值/retry。6/4px角边通道差仍UNKNOWN不豁免；新实质ready修正后可一次完整原66/22，非盲A/A。作者已正常merge实际2b得44110f4a且原树同129，仍未push/Ready，source不释放。1162真SHA已满足依赖；最终有限基准依下WO，不追无关后续main反复整建。W5 f25/08b两同步均固定双独立PASS，Claude最终批/full/真实merge待；3旧P2不关，不空占writer。
>
> **新组合证据与owner**：1222当前原Claude新远端2d2883c531cc3979fd808a07424614e028575bf9已6386170975回修原b99 P1（仅两tests123/-10），原4次7/7/真实ready+2500到close/阻塞与abort控制已交、REVIEW/TEST即时接新头与Linux；未独立核新头前不以旧b99绿关P1。下列原b99风险与Root合同仍是复审准绳。**Root实读裁决+REVIEW6386075095明确P1**：返回后测1000不能中断真实同步FIFO，spawn总2500→30000也放过拒绝后不自然退出；必须由当前原Claude批作者在同批改成真实public import ready后parent唯一原2500覆盖owner拒绝+自然close(0)，两FIFO精确code/无writer/取消清理/同helper真阻塞负控制，不改production/runner/新增宽启动阈值。已6386078159公开回原作者；C2只留/tmp技术参考不另开重复writer，新CI绿不能替代该mustfix与新Linux证据；旧Linux无phase、Mac2ms不能定负载/加载原因。Search lastFetch6行独立REVIEW6386074856通过，原main5次1红、修后目标6次过及另4cancel/raw均保留。**#1224已15:32:15Z实际merge112114f231a734ac761cf36e8411c8897d0826d8**，singleparent2b、actual treef874a0a7=2b+5766真实合成，5源固定头祖先/Claude带112关闭均核；queue40106695986/Verify120911368571成功，非源码每片独立merge。1220/e5ff四处实物锚点已独立REVIEW6386154511 PASS、其余85case/全部fixture与scanner/limits同blob，旧mustfix可关；独立TEST已核新CI86/86首过及actual112同源码PASS，单份search-race-5766-b99/test-handoff，原full31红不改绿。1207两源slice文档已原ac-kernel/1218随112实际落，diff空/原Review/queueGates核齐，6386132911仅该两nonblock闭环；Trust及1218本身P2仍不关。#1221 ACA005原代码612工程合入，真实Home v3/W5-17与整线未完成。


> **当前实际source（12:24UTC，覆盖下列旧source快照）**：C1 RAC114已自然固定非Draft#1213/8fce66c6349b47476e7a2f131cd7f7ee12e0b377，3files+204/-2/prod+6/-2，作者2红2绿→4files17首过/必要门禁0，REVIEW6384157844过、独立TEST接续，source明确RELEASE/treeclean无自有运行。**FIX1 ACA005已正式START唯一writer**且实际接单，先同一slice ACA005-01..07再实现root已批generation/v3/最终原source-reader授权。build优先序FIX1 baseline→TEST1213必要正确build→FIX1green按公共槽，作者可先source准备不空转，不并发build/新full。原C2 e20独立REVIEW6384019404/TEST6384047094两mustfix已闭合，已6384076618向Claude提新storage/full候选，source仍释放。#1213新增快产品测试共享清单一行明确交Claude实际最终批writer（1213/6384200965），未实际写入/核CI/真merge不当完成；原作者不重开槽。P1固定释放后FIX2 W5真main依赖已满足接续，不等P1审验/CI/merge；ACA003/S18 P2原边界与C1其他余项/C2完整后续保持，不停在台账、不并写。


> **最新实际状态（12:08UTC，覆盖下列旧快照）**：#1206于11:59:44Z真merge c6093a2e9c412181846d94ee1a5cd037680684b3，8固定源头祖先fa52与landing=受测2ca树1ff5f00已核、Claude已八条关闭，full27b全16+汇总success，merge-group40091732268/Verify成功，QUEUE移§3。#1209新远端e20e68f0af2e519c333feb50fb062958cf7f22b7普通push成功，6files+90/-5，REVIEW6384019404增量PASS，两mustfix作者真实红绿/58项+门禁0，独立TEST有限复验待齐；旧dbec红不抹。C2已明确source release，**C1已实际RESUME**原两spec/test暂存188、baseline与base645继续RAC114有界片，不为Git传输/审验空占源。之后FIX1 ACA005确认P1按本节root已批generation/v3实施，再FIX2 W5 source（1206真依赖已满足；不等ACA005审验/CI/merge才接独立片）。C2完整后续不缩小。full28两原始红分别1207取消发现期未执行诊断（原ac-kernel修）及S63正文引号被S20误收（Claude批writer纯docs最小改），不串到ACA005，不连坐已合1206。


> **当前源排程（11:48UTC）**：#1209/dbec被独立REVIEW6383768725及TEST6383805807确认为P1空正文密文毒化vault预检+P2 BOM精确恢复失败，旧storage/full申请6383768403已6383787655公开hold等新头。C1已明确RELEASE且再确认，spec36行+newtest152行两份暂存未提交保留在原c1-uninstall-inspection/HEAD645，production未改、无运行；**原C2已经START唯一源写短修**，修后新固定head/raw DIRECT复审验并release即返C1续RAC114，不重做准备。新增ACA005已实证P1由FIX1接续，依赖本C2短修与C1有界收口；普通文档nonblock/W5长同步按优先级其后，W5仍需1206真merge，owner不变、不新chat/第二writer/重复full。此条覆盖下方11:38 C1在写的旧快照。

### 用户明确优先 WO：#1162 → #1198 原 PR 实际合入（Root转达，执行owner FIX2）

**授权与交付。** 一骏明确「#1162、#1198 这俩也帮忙处理merge掉」。这份已接受WO替代重复文件spec；目标是这两项既有修复在最新主线工程/受管浏览器验证并各原PR实际MERGED，原生窗口/本人验收单列。已有授权覆盖必要同步、修复、普通push、转Ready、独立审验和正常队列，不再申请同一权限。1112已fixed双独立核收，1162已实际落地，唯一writer已实际转1198，Root/TEST不并写。

**顺序/真依赖（Root按当前新头收窄）。** 1162已实际合入2b253d457c2207e5cb1b276cf255f3cbb5f53056/tree da533975=edace。1198固定输入290d79904dbff1061cdbd45fa780ad70a96d44f2，唯一FIX2自有树与冻结edace合成1de12b8e进行wholebuild/24态及原零阈值66图22样式一次正式比较；该预备基准现已由1162实际SHA证实。最终验证/额度有限基准固定这个实际1162 SHA，核tree/生产源/依赖及真实dist内容一致则沿用有效证据；仅mtime记录差异不能冒内容变化，原记录保留、不伪改指纹。后续1224等main更新交merge_group集成，只有真实冲突、准确资源from失配或具体行为风险才重开相关同步/增量验证，不为追最新SHA再手合main/整套重跑；不取消/挪其他PR或CI。最终预算与必要静态门在实际依赖基准实核后普通push/Ready，remote若再变先停push读新差异。原作者贡献/产品与24态保留，一writer/一build/一browser，不建替代批后仅关原PR，不等W5 full。

**1162范围。** 原head0ec7d8d6dc0662860387c16d8573b6515d63653b、merge-baseacc71。只原6路径：Pages README、import-client.ts/styles.ts/ui.ts、pages-import-entry.e2e、page-assets.json；最新612仅资产表冲突。保现有mw-dialog--form内容区滚动/footer固定及真正命中后click，不借同步重做UI/导入/删除/持久化。资产表先取主线，正确wholebuild后按实测更新下降，不以旧137B绝对数覆盖新主线。当前包README13必要及样式/导入定向、pages-import-entry/相关dialog浏览器（公共槽/专用Chrome/临时Home）与准确base health/resources/secrets，固定head/真实diff/raw/未验证边界→Ready→直接独立审验→原PR正常队列真merge。

**1198正式视觉合同。** 当前VUX spec明确原零容忍正式66图/22样式完成门。原c609 Todo390浅色11px与同头A/A11点、readiness无异常/原因UNKNOWN均保留；原raw在原作者/Users/oreal机器，本机不可读就不冒亲核/自动豁免。新准确候选基准上按原参数/零阈值/零retry只做一次正式66/22+24态；自然过可按新组合证据核收，不宣称旧根因已修；再红据实定点，不循环碰运气、不加sleep/阈值/像素豁免或私改shared harness。三CSS各+7语义及最终actual base精确from/to合同不变。

**1198范围与额度。** 原head5d6d536d5685f9174c9226563b099e0c6b772601/basef586，6路径为design-system README、styles/toast.ts、scripts/gates/page-assets.mjs、VUX spec、request-failure-call-id.e2e、page-assets.json；原产品只toast选择器补既有.mw-btn。旧5d6冲突记录仅作历史；fresh290d与edace实际仅资源表冲突，README及一次性表已自动合，双方有效条目保留；用户原批准仅arrival/settings/workbench三个CSS各+7B语义，按真正最新merge-base测准确from/to、清已耗旧额度，不保旧705676/995810/1614247高上限、不改通用门禁/不扩额外增长。若>7或其他资产变先查真实原因/范围，不默放。旧tmp-summary/approved/repair当前缺失，不能凭PRbody算亲读；新的wholebuild、当前README定向、原3浏览器case、真实404/复制与1440/1024/390×浅深×normal/hover/active/keyboard24态建立当前证据。Memory删除helper按当时正式现行合同（当前仍remove）适配且保持原真实断言；source fixed/Ready后独立审验/普通队列真merge。

> **下一独立片已具合同，尚未START**：C2 B2b具体 `/tmp/molis-verify-2026-10-24/c2-b2/b2b-next-contract.md` 已Root接受为UI自然fixed/release后的安排：现行初始化链不变，既存v2 vault即使entries=0仍绑定原backend/master，受管CLI `.home` 只读密封/完整恢复预检owner。只依赖含e20已验生产行为的准确固定base，不把1222新deadline/CI/full/真merge或后续earlylease当开发前置；START前鲜核1222/1210实际代码去重及基准。C2仅/tmp准备、未动repo/spec/branch；完整bookmark/A/全Home恢复仍同owner，C1正只读核完整余项，不为无关等待空占writer。

### 下一唯一 writer 接续合同（2026-10-24 16:03 UTC，Root已同意；当前均未START）

**实际顺序**：FIX2 #1198真实fixed且明确release → C1有界RAC115 → C2 B2b。前片fixed/release即可接下一独立片，不等review/CI/merge/旧full；这两下一片不增加1198合并前置。原main红/在途必须修优先，保持一Codex writer和公共资源槽；START仍鲜核实际head/路径认领。

**C1 RAC115，owner实现1**：当前BrowserPage.input的四类Input.*共用send吞掉CDP拒绝，现有socket外层错误出口因此到不了；本轮只是源码证据，尚未动态复现。仅browser-host.ts共用失败出口、既side-panel-browser.e2e、唯一w5-13-browser-input slice及必要README。保四类成功参数/顺序/接手先停Assistant，失败用现hostLog仅固定method+error name/code，沿现browser.load_failed中性提示“无法确认这次输入是否完成，请检查页面”给已有socket出口；不重发、不称未执行、不泄露输入/URL/CDP正文，不改全局CDP/API/schema/权限/存储。冻结巨大类443行45方法不得增，用模块级最小helper；既public/dist测试边界。先真实协议拒绝的旧红→修后error/只一次/恢复下一输入/日志无canary，专用test-kit浏览器+临时Home/PID清理，再正确整建/README必要/定向/health/boundary/secrets/准确affected；full仅申请Claude。不夹assistant-http console或desktop launch_args未决，C1整体不关。

**C2 B2b，owner实现2**：同一`/tmp/molis-verify-2026-10-24/c2-b2/b2b-next-contract.md`及b2b-dependency-blobs.json，Root已接受。已鲜核1210b6fb/1212d266/1222-2d：P2c plugin-owner-files与P2d材料未改受管CLI setup/install/authorization或SecretStore，五CLI生产blob同e20；空entries依hasPersistedEntries选backend/原key的真实缺口277–338尚在，HOME-DATA承诺不是实现。START用准确固定含e20生产行为base（实际main已含则main，否则当时fresh公开依赖头），不等1222计时CI/full/真merge或earlylease。保prepare/start/bind/finish初始化、既v2空vault仍绑原backend/master；不加pre-master/dummy/第二key；只读密封/解封复用AES，受管CLI .home认证密文与完整内存预检，无活vault写/明文暂存。仅storage SecretStore+index、新connector-private-state owner+App index、同slice/必要回归文档；不动P2c/CLI初始化/contractsSDK/homeStores。先真实空库新进程换env及原filekey缺失两红，再最小修/二进制mode/错key篡改路径links零写。bookmark/A/完整snapshot+restore仍后续，不以owner roundtrip关整Home或碰真实Home。

**当前1198与1222边界**：1198远端原作者docs-only20e9bef81213c6c79607a1e0c6c83bc5411eeef2/parent290d，两行历史UNKNOWN/RED保留，6386367670已公开当前FIX2及请此轮原分支/spec不并写；普通merge/新head guard，不等私有release/新审批。UI仍Root已批真实ready红绿及一次原66/22中，未Ready/push/合入。1222/2d原2500计时P1核心已修，REVIEW6386273574余P2真实t.signal/pre-aborted/stop后late-ready未闭，Root亲核同意仅原两test内返当前Claude批作者；不以2d四7/7或旧b99CI绿关此项，后需新头独立审验/Linux，旧Linux原因未知。


### ACA005 accepted WO：在途Search最终披露前核原精确授权（确认P1，实际owner FIX1）

本节是当前唯一实施工单；FIX1开写前把同一合同落入 `specs/repository-anti-corruption/slices/aca-005-search-authority.md`，随后本节以该spec为行为来源，只维护owner/依赖/证据，不另造第二方案。root已正式接受工程修复，常规最小技术方案由owner沿现有授权边界决定，无需新用户审批。

**已核事实与边界。** TEST在固定c4a40b84正确构建、Search/MCP/LocalHost关键链对审计afab逐文件无diff上，以真实stdio MCP→生产HTTP/settings grant-revoke、临时公开注册owner真实HTTP listing等待复现。SOURCE与READER各自撤单项，保留search.query、另一项和peer的共享form:read；撤权路由2ms完成时原query仍pending，放owner后同一response各1hit含独特正文；随后新query各0，owner query仍1。root及流水线已亲读 `/tmp/molis-verify-2026-10-24/aca-real-mcp/{handoff.md,result.json,probe.mts}` 的相关输入/结果；有效run自然exit0、全部临时资源清理，旧计时不足运行弃证。此证据只支持可扩展平台来源路径，不冒称当前内置Form同步owner存在同一等待；ACA003仍P2且未动态证实。

**目标/非目标。** 查询等待source catchUp/reader等异步工作后，最终对该调用披露之前，必须同时验证该调用最初使用的精确source和reader授权仍有效；原grant被撤销后，不得由新增grant、另一来源/reader或peer保留的共享permission救活旧调用。合法未撤调用、新有效授权的新查询、本人owner的索引能力继续工作；不删除索引或全局禁用source来掩盖。技术实现沿生产授权/当前性边界，不能只重看已捕获allowed_actions、在测试打人工pause或删正文/hit断言。不得放宽grant/provider/身份边界或启动无关产品变化。

**允许边界/依赖。** 最小Search owner及实际MCP/Host授权传递/最终读取边界、必要正式回归与同一slice；先鲜核现实现及1207 BL501/1208撤public context等在途真实diff，已有owner覆盖则接同一人不重复开线。新增共享合同/owner交互若必要先给具体最小输入输出/信任边界证据交root技术裁定，不先造通用平台。当前FIX1只读准备，不改repo源/spec；源码START在C2 #1209短修固定release→C1 RAC114现有有界片自然固定release后，实际接入优先于普通文档nonblock/W5长同步；若真实依赖变化由流水线重排。保护主checkout/4207/真实Home/Keychain，公共槽与临时Home，不自行full。

**root已裁定的最小授权实例事实（方案已接受，非source START）。** MCP管理owner给现有grant增加单条非敏感generation，config/mcp-tools.json当前v2升v3；代次只是身份不授予权限，输入/请求不能选择，原atomic writer内生成并必要时区分输入与持久类型。首次显式记录、enabled切换、权限集合语义改变换新代；同内容幂等写保原代（顺序无关），无关grant更新不影响，多条仍原子保存，重复/坏记录failclosed不静默去重，不用整文件epoch/revision误杀。受理时原精确ref确无记录则捕获absence，最终仍无该记录且默认开放仍满足才可；现writer撤/重开保留disabled/newenabled，不新增reset/delete默认事实，absence→撤→显式重授不能救旧call。若实际有删除回absence入口，先给root精确路径再补最小同owner事实，不猜全局epoch。

authorizeMcpActions入口捕获原代次/absence，复用现validate_authority与同步assert_authority_current；Search全部真实await后、正文/locator披露前实核所使用的原source+reader精确授权，尾检至披露间无未覆盖await；peer permission、新reader/新grant不能替原授权。原来多个合法reader可按现合同选仍有效的原reader，合法查询/owner索引保留。同hook的retained/background等直接消费者一致沿原授权实例，不建新callback/权限平台。可信client/project、精确version/provider、permissions/availability仍同时核，工具名/action业务语义不改。root已核1207/1208未改grant schema，作者开工仍鲜核有无更晚协议；新测试用最新public context入口，不引1208正删的出口。

**配置版本/维护前置。** runtime只认v3，v2显式拒绝且零写；一次性v2→v3依已有离线维护合同，只在临时Home/副本list/apply，原client/ref/permissions/enabled全部保留，owner为各条生成新代次，外置原件备份、失败可恢复、重复不换代，不把迁移放正常读路径、不加兼容格式。将此配置维护前置交现有W5-17/统一发布维护线并更新HOME-DATA/说明，不改产品发布版本，不操作真实Home/4207/Keychain；必要配置合同变化root已按授权裁定，不新增用户审批。若Claude有更晚同文件协议先对齐。该方案是同一ACA005范围，不把1207 management取消诊断夹带进来。

**验收。** ACA005-01 未撤对照走同一真实生产路径正常返回正确结果；ACA005-02 source与reader各独立在真实owner等待期间撤精确授权，撤权完成且原query仍在途，最终响应须拒绝或不含该已撤内容/正文；ACA005-03 peer共享permission/新增同能力授权不能复活旧调用，后续新合法查询按新授权正常；ACA005-04 本人owner仍能查索引，撤权不以删索引/篡改业务数据实现；ACA005-05 原身份/精确提供方/取消与失败语义不放宽、相关负例仍拒；ACA005-06 撤→同值重授旧拒新成、默认开放撤/重开、无关grant编辑/权限排序幂等重存不打断；ACA005-07 跨进程重读与坏/v2旧配置零写拒绝，临时副本v2→v3 list/apply原事实/外部原件/失败恢复/幂等不换代验证。正式回归进入既有正确生产路径并带编号，tmp probe是复现输入而非唯一测试替身。

**交付/闭环。** 新非Draft PR/精确head、scoped diff、唯一spec、原始红绿/命令/退出与验证边界，DIRECT REVIEW/TEST/流水线/root；TEST按同一真实MCP交错独立验修后不披露，不机械重跑无变化full。独立复审/验证及真实merge SHA齐后才关闭，认领/BL/作者自报不等于修复。本新P1不增加无关#1206/#1209等临时合并门，未修完不得宣称防腐整线完成。


> **源码交槽与新收件（11:38UTC）**：C2 B2a已交非Draft#1209固定dbec1b89dd49333fc6f2f4d264800f7897ecfd4c，20files+844/-21，raw/handoff=`/tmp/molis-verify-2026-10-24/c2-b2/`，作者70files628不同case最终过（原69文件绿/维护fixture realpath红后4/4，非首轮全绿），已经DIRECT REVIEW/TEST与流水线并明确RELEASE、候选冻结/树干净无运行。独立审验未完成不冒通过，storage/full只提交Claude候选。下一唯一writer已实际START **C1实现1 RAC114失败收据**（公开1183/6383746333）：原卸载错误primary，单次写receipt失败须既有最小日志+真实人类提示，不加重试/API、无敏感内容，按既有同一slice与真实故障验证。1206还未merge，W5真依赖未满足；C1固定release且1206已实际落地即接FIX2一次1107/1112同步进当前batch29，不自动等batch28。C2 B2b已接受完整最小合同仍必须在后续source窗口实施，当前无第二writer/不等前片审验CI空占。

> **当前执行（10-24 11:24UTC，覆盖下列旧时间快照）**：#1202实际11:12:45Z合入645853cb60c0c76c4fa86ba27bbbbc0f35ba868a，7固定头均c4祖先、landing与已测627树相同，源PR已Claude带SHA关闭，QUEUE已移§3。full26b40086400255@c4全16+汇总success，merge-group40088629727 Verify成功；独立TEST10文件153/153首过/零skip/retry/自然exit0，旧stale不计、原28stdout未亲读。#1206/fa52a4f8c已开/base645，唯一full27b40089127294进行中，REVIEW已接组合增量；touch c37增量6383557011过，原raw交TEST，不重审board/资源。C2 B2a仍唯一source，固定交付/release后可接B2b等独立片；**W5 FIX2须同时等1206实际落地**再对1107（含1098）/1112各合一次main，Claude6383510742基于真代码冲突新时点优先于旧“release即sync”。不让等待review/CI空占writer，也不提前撞真实依赖。ACA005→003独立tmp验证TEST已接续，不新增生产writer/无关合并门。B2根因完整纠正见同一当前合同，不另造初始化任务。

> **现行落地规则已接续（10-24 08:16UTC核源）**：以MERGE-QUEUE最新§1a「同路径一起落地」为准，旧逐片同步/逐片入队流程不套新批：评审仍逐片固定head，full非空按路径在Claude批分支一次解共用文件、一次health/security/full，最终仅批PR入队，叠层顶端一次落地；原片按批PR真实merge SHA及包含证据关闭。纯共用文件冲突作者不merge main、不刷baseline；full空且按队列试合无冲突的小PR可独立入队。#1114含Cognia真实代码冲突，仍是Claude6381691853指定等1169先合后原FIX2一次同步的例外，不开重复writer。
>
> C2 S行具体落点已由root按当前事实裁定：main安全表最大58、沙箱顶1144/61a0da5df真实包含59/60，B1以S61为集成候选（非永久占号），不造占位、不放宽连续门禁；当前独立head只缺前序须如实记health红。C2完成必要源修后立即固定非DraftPR/head及原始证据直发REVIEW/TEST/流水线、释放source；拿固定候选才向Claude申请加入当前26或下一安全批，Claude决定冻结/最终编号/唯一full，不为编号等着不开发，也不要求各片再次机械sync main。当前26计划已变为沙箱顶＋1181 e70160a6e＋1188 d6d1da98a；同批编号随实际顺序一次一致调整。C2 B2/A/快照/恢复及真实HomeR41边界保持。


> **流水线当前接续（10-24 09:55UTC，取代下方旧快照）**：FIX2已交非Draft#1200固定82fd235e（basef586）U10产品红绿，源码冻结明确release；已即刻START C2 B2为唯一Codex writer，C2实际分支anticorr/codex-w5-16-sealed-backups、隔离树w5-16-sealed-backups/freshmainf586，唯一slice已写B2合同，正实施Runtime备份密封/恢复与SecretStore只读预检，B1头不动，A/快照恢复完整范围继续。#1200 REVIEW6382734693主修复过、P2真正重排焦点归FIX2后续；资源Coding376282→377227+945B已6382757918专项认可，实际Linux40083233434两个Security已success：U10首1/1+87/87、另86/86，无retry；独立TEST6382864207已正式核收，当前唯一预算945B/Verify红。Claude10:05选择并batch27，实际共享writer须在新main f880最终树重测/落准许与生成，不再泛等Linux，不起重复full；full=[]，C2 source继续。
>
> #1114固定3aae代码/资源专项6382204940/6382529211及独立TEST6382908190均过：9file58同头复用+独立Cogniaactions4/4和ONLYCognia-modelready1/1首过，无剩余UI缺口。准确22133→22157+24B批准与1200 Coding+945B均由实际Claude integration/batch-1024-27/729b9d7c3（唯一full40084374444已起）最终批树一次重测/批准/生成。729里APPROVED仍只有已消费plugin-builder，故当前预算红未落实、不称CI已修；作者不再纯共享sync。
>
> #1190 bc016已独立REVIEW6382074609/TEST6382352957通过，实际包含batch26 db4f3a154（已核ancestor），S59/60/61批内统一。run40080895158已完13片成功3失败：#1181 companion正式fake actions漏迁、effect-control两个动作目录分裂，#1188 follow缺browsingWorkspace响应；TEST/root代码因果核定，真实Host登记存在，交原ac-kernel，未改拒绝/原断言。#1181第一处真实新头f8ee00ec2/6382658774已交并立即增量REVIEW，剩两处6382746649/6382763989实际接续；不是仍等27/未定因/笼统flaky，不另起full或取消CI。 最新实际#1202 batch/1024-26初9d3b206f/basef880已开（sandbox+B1）；macOS SDK declarations漏materials.d.ts报checks5/17、workflow41/42，交原ac-sandbox-sched/1144修，1202实际auto/queue均null保持未合。1181新7533e156、1188新05054e915已交后续夹具修并即时增量审验，Claude选merge-only并1202，不再等旧头开工；TEST不重复正在跑的28mac批。
>
> **#1194已实际合入** 09:59:35Z，merge SHA f880df0c43d36464ce7407c27311d895487b3716（单parentf586、最终tree27dcea4与已审33c58相同），merge-group40083731946必要门禁/Verify成功；五固定源头实际ancestor证明+REVIEW冲突保留齐，1166/1178/1179/1157/1130均Claude带SHA关闭，QUEUE已移§3。按TEST6382794843既定适用保留原full失败/取消、VUX33首125.7重试过、U10首1/1与PG026首5/5；原optional Security1未自动重试绿。不把batch26整批失败改绿，不重复关闭/入队。
>
> #1107旧review-pr-fixer认领已Claude6381877118明确释放（不是继续等DeepSeek），真代码同步实际owner FIX2，从远端b8b5一次合新main，原本地064cf2/贡献不动；C2本独立片源码释放后排该阻塞窗口。新头交原ac-coding接#1191一次，1098/1107/1112/1191 W5专批由Claude唯一组，pure共享文件不作者反复sync。1112三nonblock和1200焦点P2未实施，原FIX2 owner保留。
>
> #784开发方Shelf行与main成果库验收行BL400重号仍由FIX1最小文档修。**撤销本组旧BL595预留**：Claude最新将BL595–604明确给ac-kernel，优先遵守；旧/tmp提案已标STALE、proposal.patch已改名proposal.STALE.patch，不能照抄。保留两个真实待做、历史与实际FIX1 owner，不删除事项/关闭QA/标本人验收/变PR状态。实际source短窗再鲜核main/在途/共享及活引用后选唯一新号，当前不盲占另一个号、不加第二writer；准备/消歧不等于修复闭环。完整owner/实际SHA以ROLES当前段和QUEUE为准。

> **C2 B2恢复合同已裁定：B2a先交、B2b必须接续（root现行裁定，覆盖A/B待决）**：managed CLI的 `runtime/connectors/installs/<id>/.home` 采用 **B：密封payload**，不选择整个原目录引用。RAC104/106完整恢复/必要非SQLite不能漏备；该目录除登录状态还可能有唯一配置，不能借主key依赖例外降成不可恢复目录。现HOME-DATA runtime“不存连接凭据”须纠正。browser profile维持原明确排除；无需再问一骏。
>
> connector owner核安装所有权、枚举.home必要文件，恢复原相对路径/字节/权限，不解析/改写第三方登录格式，不把其原文件改SecretStore refs；包/runtime/明确cache/tmp可重建，未证配置不能叫缓存。browser/sites.json与grants正常备份，profile/downloads/uploads沿现行明确排除，说明登录需重建、不承诺恢复。
>
> storage owner复用既有AES/主key选择读取，仅提供必要密封payload边界；清单只放非敏感描述与key依赖，payload无凭据原文，主key/Keychain/SDK等原key不导出/替换，不另造加密平台或第二key。snapshot只读原Home，不能SecretStore.put临时payload进活vault，不能落明文暂存。restore先全量预检再走既有发布/回滚，缺错key/篡改/越界/链接均零写；仅.home丢失且原key仍在时须恢复原配置/登录文件，不承诺第三方过期/撤销会话仍有效。
>
> **B2b根因校正（root已裁定、实现2已接受，公开1190/6383570134）**：完整受管CLI前序startConnectorSetupSubmission→beginConnectorAuthorization→bindConnectorAuthorizationProtocol及bindConnectorAuthorizationInstallation都会SecretStore.put；只核connectCli/activate末段不能证明从未建master。撤销新增CLI初始化入口/pre-master常规维护计划，保留原生产初始化链，不改CLI setup接线。真正边界是finish临时授权清空最后entry后，vault外CLI密文仍依赖原key：现持久v2 backend在entries=0时仍须稳定绑定原master，不能改偏好就换backend/丢key就新建。storage必要公开出口只读seal/open，含空vault读取原key、payload单独登记依赖；缺错key拒绝且零重建/改写，不另增持久字段/协议/第二key/dummy/兼容格式。原B2a“单独空vault没有密文依赖”可保留，不能推广到外部payload。验真实prepared/start/bind/finish临时Home、首次前序已建key/vault、finish后空entry与进程重启/配置偏好变化仍沿原依赖、原key缺错零写及.home丢失原路径/字节/权限恢复；底层installer不冒完整路径，不触真实Home/网络登录/Keychain/R41。
>
> **B2后续目录授权owner合同（root11:38已核，不改冻结B2a）**：Tauri `context_directories.rs` 的DirectoryRecord含path+bookmark，store_path仅显式MOLIS_WORK_HOME入Home、否则AppData；authorize经AppKit选择后save_records，单独路径不能重建授权。`context_directories_macos.rs`按security-scoped/WithoutUI/WithoutMounting解析，stale/startAccessing失败走既有重选，序列化后实际access验证。**Home内bookmark须作为必要敏感owner原件密封备份、原路径字节恢复**，OS仍决定授权有效性，失效不伪造/刷新权限；AppData外部目录列外部依赖，不自动读取或扩整机备份。不能以HOME-DATA“可重建”当排除依据。现有native149–179有临时目录序列化访问/目录消失拒绝用例，root只读未跑；后续实际验证仍须按单writer/公共槽。若desktop-only Home真可未初始化平台master，须完整桌面启动/authorize真实链证明，再交root同SecretStore owner的最小首次准备方案，已建立key绝不更换、snapshot/预检不隐式写Home；不从Rust末段或已证伪CLI断言增机制。实际owner C2后续，具体最小实施边界按现排程接续；bookmark不回堵#1209审验、不停其他B2b独立片。
>
> **交付顺序与实际owner**：实现2 C2仍唯一Codex writer，先在同一slice更新完整合同、owner清单与HOME-DATA。当前Runtime配置封存+raw维护+只读SecretStore预检作为 **B2a** 固定非Draft PR/head/raw直交REVIEW/TEST/流水线并release，不等B2b或前片审验/CI；当前7文件39项仅作者候选不冒独立过。**B2b CLI密封owner必须接续**，作者先回具体最小新增路径/公开输入输出/验收给root与流水线，再由流水线排源码窗口，不产生第二writer。B2a局部交付不等于B2/W5-16完成；A同Home早期lease、全库/非SQLitesnapshot/restore及R41边界保持。跨owner真实依赖和固定候选统一full交Claude，不提前起或重复full。

### ACA003 accepted WO：S-18最终同步authority合同补齐（P2，实际owner FIX2）

root按现S18及已确认接口缺口批准本轮最小补齐，不再找/造真实漏洞窗口作为实施前置。有限检查未证生产越权，保持P2；DB只有statement-check helper差异、未改beforeEffect或同步提交顺序，其余指定相关链无diff，详见 `/tmp/molis-verify-2026-10-24/aca003-reachability/handoff.md`，不冒新main Module搬迁已验证。

FIX2取得START后先在唯一slice `specs/repository-anti-corruption/slices/aca-003-assistant-authority.md` 落同一合同，鲜核迁移后的Assistant owner和在途认领。由现owner提供原精确动作 `assert_authority_current`，提交同轮重读disabled集合，保留signal、已准action ref、原异步验证、Host生命周期与嵌套控制；不缓存关闭集合/用全局permission替动作级开关，不改默认开放/确认策略。沿现callback合同，不增共享callback/状态库/版本/Assistant generation，不混ACA005 MCP v3。

ACA003-01 用生产authority+真实设置owner证明最终同步拒绝且原业务状态零写；ACA003-02 合法动作正常、无关能力关闭不误杀；ACA003-03 嵌套控制及既有拒绝保持。声明内可控await只标合同边界验证，不冒当前内置产品exploit；只测字段存在不足，不再跑假Host policy暂停“漏洞复现”。同步同一S18条目/唯一slice/直接回归，共同docs冲突批内一次解。

排现P1和在途必须修后由流水线按Claude顺序给单writer START；FIX2当前仅只读，不提前改spec/配置/源。新非Draft PR/head/spec/diff/raw DIRECT REVIEW/TEST/流水线/root，独立审验与真merge后关闭；不提高严重度/给无关候选加门，W5/1208nonblocks/E22等原owner保持。

### root全仓审计最终接单与验证（2026-10-24 10:55UTC，覆盖先前候选等级/验证顺序）

独立报告 `/Users/yijunwang/code/goalboard/work/anti-corruption-audit-2026-10-24/report.md` 终点afabfcbef：范围71→70包/8生产链，非新增359文件逐行复审，未构建/测试或操作真实Home。最终1个P1（ACA005）、3个未修P2（ACA001/003/004），ACA002随1194/1166已修。审计已交付不等于整改完成，四原始目标均尚不能整体关闭。

| 项目 | 初始要求/事实与当前边界 | 实际owner与下一可执行动作 | 真实闭环 |
| --- | --- | --- | --- |
| #1218 nonblock：readGoalResumeFacts属Host消费策略；README门禁来源旧文字 | 来源ac-review6384460634第1项及流水线实际CLI README patch核查；公开实施认领6384588280 | 实际实施owner FIX2已直接确认；依1218真合后鲜核消费者，将前100/焦点最多2策略移Host、更新真实调用方/两测试/API快照及准确README，保持合同与行为；排P1/W5后唯一源窗 | 尚未实施；固定修复PR/head、独立复审验证、实际merge后关闭；不阻1218/不以接单闭环 |
| ACA005 P1：MCP在途原source/reader代次 | 原真实负例及17b6修后独立26/retained3/CI适用原raw齐 | 原实施owner FIX1，#1221于13:51:37Z实际merge612，tree等批准/CI，代码修复工程闭环；真实Home v3由W5-17统一窗口 | 只关闭该原精确scope代码修复，不关整线；后续b71本地另合法reader未入等待/同树CI过的组合现象由既有ac-sandbox-sched+TEST查，未判因/未拿旧证据跨推 |
| ACA003 P2：Assistant最终同步authority合同缺口 | 有限生产链检查未证真实窗口，不升P1/不关闭；DB一处statement-check helper差异已单独说明，其余相关链无diff | root已裁最小S18同步尾检，实际owner FIX2，当前只读准备；在现P1/在途必须修后由流水线START，不再以找exploit为前置 | 同一callback/真实disabled owner与零写验证，修复提交/独立审验/真merge前保持open，不混ACA005 MCPv3 |
| ACA001 P2成果自读签名隔离 | 初始4.10/4.18、系统整理4/7/10、RAC411；1197/5cd2277及1199/d8f已随1206于11:59:44Z真merge c609，原source祖先/签名拒绝及组合审验包含已核 | 原作者贡献保持，工程真merge证据已直接交root/原审计owner更新原报告，不另开重复线 | 工程修复与真实merge证据已齐；原审计核收单列，不再记未合候选/不据此关闭整线 |
| ACA004 P2文档过时 | CALL-CHAINS154–161/180旧后台启动缺口描述，实际web-project-schedulers已列catalog/inspectActions；plugin-dev SKILL52旧Pages/灵光/Jelly装配名单。1114只添locale未覆盖；初始4.9/4.12/4.14与系统整理2/13/14/15 | FIX2 01a16b08-de51-7cd0-a4c5-d45d89d9cdb3已明确接入E22/SSOT文档队列；后续获源码/文档窗口鲜核真正main/监督器最小修，直交REVIEW/TEST，当前不占C2 B2 | 尚无提交/独立审验/merge，不以认领闭环 |

验证限本轮独占临时目录脚本，固定SHA/实际链路/完整输出/exit，隔离Home+公共槽，受控仓库源码/测试/断言不改，不起full/不碰4207、不产生第二生产writer。root已明确下一空闲测试时段无需再等时间允许；未开始时005优先于003，原日志等待不能变成完全空转。C2 B2与Claude现有批/唯一full继续，新审计报告由原chat独占，本流水线只读。

> **流水线实际新接续（2026-10-24 10:44 UTC）**：#1202最终c4a40b84（已含1144/8f+1190/bc+1181/7533+1188/05054）组合REVIEW6383192425 PASS，CI40085798403/merge627e80bf各必要检查成功；当前main afabfcbe只固定CI Node24.14，1194实际f880落地证据不变。Mac28为Claude汇总，精确原raw仍待；TEST已获自有c4冻结树一次必要正确build+三fixture/SDK-Mac小集授权，不切当前343旧worker，不重复25/28/full。8f公开合同建议shared-core适用由Claude按真实差异统一；**db4含旧P2b61a的Linux范围，缺8f新DTO/回归且Mac被skip；729完全不含P2b材料栈**，两者不能混说。10:42实核1202未合且auto/queue均null，后续真实状态再核。
>
> full27/run40084374444 @729b已四份最终红，TEST已接原始固定SHA归因：board112标题、touch722/859 mode opens（非旧Dock659）交原ac-coding，1185实际新ef14ffe21/6383134113已交标题与假Hostexecutors修复并立即薄审验，touch4实际后证待核；assets仅准确945/24/311与SecurityDoc缺S60由Claude实际批writer处理，311独立资源认可核中，前两认可不再重问。原失败/retry保留，余片不取消，不另起full/改断言。新源码writer仍C2 B2，实际只读vault预检零写/缺key拒绝已过，正在修Runtime stat.mode权限位桥接再核，不假称B2完成。
>
> ACA003/005合同去重REVIEW已完成：1153/1185/1064及BL128/007/040–43/559、RAC181都不覆盖两具体缺口。root已明确下一空闲测试槽TEST直接tmp-only ACA003→005确定性交错（未撤对照+真实精确撤权），无需二次时段允许；先收当前确认CI/SDK必要集，复用适用build，受控repo源测试断言不写，无新生产writer/full。仍候选P1未动态复现，不加无关合并门；ACA002不重开。

> **最终校正（2026-10-24 10:55UTC）**：以上旧10:44“003→005/两个P1候选”由本节最终等级/顺序覆盖：005 P1先真实MCP，003 P2后核真实生产等待可达，人工暂停不冒产品路径。full27最终12片成功4失败；board修ef14代码REVIEW6383220037过，touch真实Host未选择plugin的独立合法准备修复已6383326909交原ac-coding；三准确资源24/945/311均已认可（3116383290609），实际批准许/生成/S编号仍由Claude落地。此为当前执行状态，不宣称full已绿/新修已合。

> **最新调度接单（10-24 07:31UTC）**：已收Claude的S号按实际合并顺序规则，C2已直达：S71仅临时标识，落PR/入队时按main＋前置队列的下一空号连续定号，S59/60原归属保持，不等待未实现设计占号。main已知红已随1174清空，未来失败重新归因；旧批次原始证据不改。Claude新增#1182/6381371024的恢复actor规格勘误现由修复1实际承接并已在原PR公开认领，按原PR顺序插空，当前未实现、不阻1182。C2 B1仍唯一writer。batch25=沙箱叠层＋1166，batch26=1178/1179/1182/1181，W5链仍等U10根因；均Claude唯一组批，不另起。

> **实际接续（10-24 07:25UTC）**：C1已交非Draft#1183固定7bbb014c4（仅两catch生产修复，18项作者工程证据），明确源码释放并直接发REVIEW/TEST；REVIEW active。C2已实际接唯一writer，隔离树w5-16-im-invite-hash/base新main4e17c3d1，server/im-ui/contracts/im在途无另一writer，开始唯一slice+B1；B1固定源码释放后修复2#1112 nonblock短插空，再归C2 B2/A/快照/恢复，不等前片审验/CI/merge。#1174已真合4e17c3d1（07:21:50UTC），已移MERGE-QUEUE§3；BL544/R44不随其合入关闭。#1183只是C1首个剩余片，整体C1/C2均未完成。

**现行模式：一骏正式确认（2026-10-24 07:13UTC，由root转达）**

Claude继续负责整条防腐线的总体方向、优先级、跨线依赖与唯一full组批。Codex root在既定目标内主动组织独立任务、裁决技术选择和无人认领问题，不事事请示；流水线执行日常派单、源码交槽、CI/队列/正常合并与共享进度。REVIEW独立只读评审，TEST独立核验证据和必要回归，修复1/2承接全部确认有效的block与non-block（含文档、验证缺口、CI和冲突），实现1/2持续承接独立开发片。现有作者正在修的保留原owner，无人认领的由流水线落实到修复专职。

non-block只表示不挡当前PR，仍须有具体实施owner、可执行下一步/真依赖、实际修复PR或提交、独立复审/验证和真实merge SHA；BL、领域标签、待做或准备完成都不算闭环。不成立、重复或取消要有依据。按Claude优先级、依赖和可用writer实际启动，不无限停在台账。

固定PR/head＋spec/diff/原始日志由作者直接发REVIEW、TEST和流水线，收到即自动增量审验；must-fix直接回原作者并抄流水线，新head立即复审，不等用户、二次转发、CI完成或heartbeat。源码固定并明确释放即可交下一独立片，不为等待审验/CI/merge占writer；单Codex writer、整机一build/一浏览器批及Claude唯一full保持。模型分工、已有认领和工作不中断，不新建重复入口。

本组共享协调文件由流水线chat串行维护，root和六专职不抢写。已有交付按原职责立即接续，不因无真实依赖的“仅准备”或等待Root二次转发而空置；Root负责周期发现与初始派单。真实源码占用、在途文件冲突、必要外部权限或合同依赖才暂停相关部分。常规交付、排队和内部可解决失败只更新共享；只有必须一骏决定或补权限/信息时通知。

> **下一non-block实际插空**：C1→C2 B1现行顺序不变；C2 B1固定head并释放源码后，修复2接#1112三项有效nonblock（Skill构建期范围、PG060/RAC证据映射、Files真实冷/热打开选中），按现有认领鲜核依赖/无重复writer，在B1独立审验期间完整交付后还C2 B2；更高优先级must-fix优先。此三项当前尚无修复提交，不能称闭环。来源/owner/触发/实际修复与审验合入的逐项记录见CODEX-SESSION-ROLES「下一项non-block实施触发」。BL544实际owner修复1；AC05实际owner修复2，领域归属保留，依原W5合同接续，新跨模块取舍交root。

> **实际交槽已发生（10-24 07:08UTC）**：#1173固定`f45abe4e8a46c12722f5cb3194410df56439dab4`，作者直接交REVIEW/TEST并释放源码；REVIEW6381248620已通过，TEST独立核证也已通过（新头workflow_runs=[]，既存DIRTY待顺序sync）。C1按条件授权已实际接唯一writer，在自有`c1-uninstall-inspection/goalboard`（main d287起点）写唯一slice及四条prepare回归，离线安装通过，build走公共槽排在ac-coding后，无review/CI/merge空等。C1明确源码固定释放直接触发C2唯一slice+B1，root A/B1裁定均到位，C2也已确认；A后于B1/B2、前于真实快照/恢复。S-71暂预留C2邀请hash-only（已核69/70归artifacts、67/68归trust、59–66现线），生产/回归可先开发，最终安全表按实际集成一次核连续，不放宽门禁/不空占位。BL569实际实施owner修复1，按nonblock原PR顺序插空。Claude06:58浏览器/回归补证职责已直派TEST从新PR正文待测与已有证据自主接续。

> **C2 A具体技术裁定也已到位（10-24 07:03UTC，root依一骏本轮决断授权）**：A由C2负责，按B1→B2后、实际快照/恢复前做最小Host早期互斥。root在必要范围内调整此前“不碰所有Host入口”的实现限制：允许必须的最小启动接线及现有公开边界调整，早于业务存储/调度初始化取得同一Home lease，Agent同一所有权转借/复用；失败与退出释放明确，不增第二把锁，不在线quiesce/调度改造。C2先更新同一slice的owner/接口/文件/验证，开A前与在途Host owner按真实文件认领协调，只暂停冲突部分；不再等待别线交端口或普通批准。真实双进程验闲置Host/尚未Agent启动、snapshot/restore拒绝零业务及备份写、快照期间Host启动拒绝、失败/退出可重取、restore不替换持锁inode。只临时Home。执行已在#1130对接并更正owner为C2，供Claude备案；**这是root新裁决，非Claude旧原文**。总范围/优先级/唯一full仍Claude统筹。

> **C2 B1具体技术裁定已到位（10-24 07:01UTC，root依一骏本轮决断授权）**：root已核实际IM读写/GET/rotate/客户端链，采纳hash-only合同，不再等Claude确认B1。GET只回安全状态；显式生成/更换时客户端用crypto随机至少32bytes token及稳定client_id保持同意图重试，原文只在客户端页面内存；server仅hash+无秘密回执，所有重放重验owner，后续轮换后的旧请求不能重新激活旧token或声称其有效；旧邀请在明确更换前保持有效，不GET暗换，不从client_id派生。必要server/contracts/im-ui/安全拒绝、一次性旧库维护list/apply及文档属于B1完整片。此为**root的新技术选择**，不是Claude原文；总范围/优先级/full排期仍归Claude。C1固定源码释放后C2已获条件式授权立即接唯一slice+B1，不等C1审验/CI/merge、第二次许可或heartbeat。
>
> **A独立前置（以上方root最新A裁定为准）**：由C2负责必要最小启动接线，不等别线交端口；执行在#1130对接当前Host owner ac-sc3的实际在途文件时段，不夹带1130或增加其门槛。A只在快照/恢复前满足，不阻B1/B2。C1/C2直接审验与源码释放交槽协议保持。

> **用户新增自主接续授权（10-24 06:57UTC，root转达并已直发6专职）**：Claude总体范围/优先级/依赖/full保持，Codex执行chat直接决定合同内技术选择、派单和资源交槽；复杂取舍交root，只有需一骏决定时通知。固定head交付后作者直接发REVIEW/TEST/执行，自动增量复审/核验；must-fix直接回原作者并抄执行，执行保留单writer排程。FIX1当前#1173 active，源码固定释放直接触发C1 RAC113实际实施，不等1173审验/CI/merge，也不等二次许可；C1释放后C2先唯一slice+B1完整实施片，后续B2/快照/恢复。C2 B1邀请公开合同已由root具体裁定到位；离线早期锁由C2负责并协调在途Host文件时段，不阻B1/B2。

> **Codex执行接续（10-24 06:54UTC实际核验；供Claude裁定）**：Claude的C2 A/B、writer顺序及审验分工保持。#1114资源清理和BACKLOG机械sync最终`7733c5541`已普通push，正式增量评审6381135401及TEST核验均通过，CI40071861128排队，原Claude合并认领保持；修复2已释放writer。现修复1已正式启动#1173短doc（公开6381130928），随后立即交C1 RAC113，不等待CI/合并占writer。#1174精确5bbb的Verify/Security/Product及适用CI全绿，06:54实际queue第1位/awaiting_checks，沿Claude原认领不重复操作。#1171/#1172已实际合入并移§3。本执行回合06:45:56已实测Sol6.1/max，root/REVIEW保持Astra/xhigh。
>
> **历史技术核验（已由上方root A/B1裁定解决，保留根因依据，不作待批条件）**：A现有唯一锁是agent-host内部`acquirePrologueStorageOwner`对agent-runtime/.molis-runtime-owner.db的SQLite EXCLUSIVE；`composeAgentHost.ready`惰性启动，闲置常驻Host可能尚未持锁，snapshot拿锁也不能阻Host先初始化Catalog/IM等。要保证“Host在跑拒绝、快照时Host起不来”，需Claude指定最小早期Host持锁/转借前置或其他线交入口，不能同时要求完全不碰启动路径并声称达标；restore还须保留锁inode不随目录替换。B1实际owner为server包；现`ImInvite`公开GET会取回原token/url，rotate用receipt精确重放。只存SHA256无法保留这份读取合同，需Claude定新合同：建议GET仅安全状态、原文在明确生成/更换当次保留，client用同一意图随机token+client_id重试、server仅hash及无秘密receipt，禁止GET暗中轮换或从client_id可逆派生。必要涉及contracts/im-ui，按实际合同/存储验证；v1→v2维护list/apply、旧邀请仍有效、离线重建确保DB/WAL/freelist无原文，仍不碰真实Home。C2已有完整只读依据，上方root A/B1裁定已到位，C1源码释放即按已授权范围实施，不再等普通批准。
>
> **DeepSeek审计余项具体接续**：REVIEW已核AC01–04/E1–21对应1170已合（E3仍部分，不能写已做）；AC05仍是context-onboarding直引Pages转换/动作定义、Todo限额及固定Artifacts身份，业务写本来走BoundActionClient，不误报全绕网关。PG088/ac-shell与PG031/ac-platform领域归属保留，AC05实际实施owner现为修复2，依W5目录合同接续；BL544实际实施owner现为修复1，按原PR顺序插空。纯文档E22/AC12–15/17已排修复2，RUNTIME-MIGRATION:150排修复1，按C片等审/CI插空、先鲜核Claude其他文档批避免重叠。AC08门禁regex两处漏e2e提案已交root核现行授权；1173仅登记BL569，不以登记或转述替代权限依据。

> **10-24 06:58 UTC 统筹（Claude）：用户补充「减少 Claude 侧测试和反复修改，Codex 推进；先尽可能推进防腐线工程收尾」。** 时间更正：本节上一条题注写成「07:05」，实际是 10-24 06:2x UTC，以后题注一律写 UTC。
> - Claude 侧只跑 build、`check-health-gates --base origin/main`、`boundary:check`、`secrets:check`、`page-assets` 与少量直接的非浏览器单元测试，**不再在本机跑浏览器批次**。Claude 会话开出的 PR，浏览器与回归证据交 Codex 测试专职补：读 PR 正文的「待测」清单，在一次性 Home 里跑，结论写成 PR 评论。
> - 评审里标了「非阻塞，交 Codex 修复队列」的条目，由 Codex 修复专职在 C 片等评审时插空做，按 PR 开出顺序；同一个 PR 仍只许一个修复者（MERGE-QUEUE §1 第 7 条），修之前在 PR 上留「修复认领」。
> - 接下来 Claude 侧会连续开出多个工程片 PR（`ac-coding` 已开工：C8-3 → C9；`ac-clients-1`：灵光 → Dataset；`ac-giants` R4a/R4d；`ac-kernel` R8 第 3 批；`ac-sandbox-sched` PG-017 P2c、PG-022），全量仍只由 Claude 合批起跑。
>
> **10-24 11:12 UTC 统筹（Claude）**：W5-06 链合 main 的时机：**等 batch-27 批 PR 落地后合一次**（batch-26 #1202 已在队列；batch-27 含 #1200 U10、#1185、#1182、#1197/#1199 等，统筹已在批树上备好、#1202 合入即开）。按批树试合，#1107/#1191 与它有真代码冲突（`apps/local-host/src/index.ts`、`web-goals-read.ts`、`apps/workbench/src/plugin-catalog.ts`、`plugins/native/coding/src/registration.ts`、十余个 `tests/coding-*-http.test.ts`），#1112 有 `primitive-catalog.ts`、`global-search.ts`、`tab-workspace-ops.ts`；现在合会再撞一次。顺序不变：FIX2 在 C2 B2a 释放源码窗口后，从 batch-27 落地后的 main 合 #1107（含 #1098）与 #1112 各一次，只解真代码冲突（BACKLOG、`baseline.json`、`page-assets.json`、S 号取 main 一侧、留给统筹批里解）；新头贴在 #1107，ac-coding 再把它合进 #1191 一次；然后统筹起 batch-28（W5-06 链 + #1204 + #1205 + ac-kernel 等）。

> **10-24 08:50 UTC 统筹（Claude）**：非阻塞队列加一项（测试工具包，不挡合并）：`tests/fixtures/goal-browser.ts` 的点击失败信息（「covered by …」）附上目标祖先链里可滚动盒的 `scrollTop/clientHeight/scrollHeight`，让 Linux 上的布局类失败自带数据（来源 #1182 作者 6382114246，PG-026-S4-03 本机复现不了）。在 W5-06 链与 C2 之后插空做，按 §1a 和其他测试工具包改动打包。

> **10-24 08:xx UTC 补（Claude）**：`tooling/gates/baseline.json` 冲突一律取 main 那一侧（CI 不读，快查只拦变大），不跑 `--update`、不为它单独推（MERGE-QUEUE §1a 第 7 条）。
>
> **10-24 08:xx UTC 统筹（Claude）：用户要求「尽可能按统筹定的冲突较少的顺序推进评审修复，但不要让 Codex 闲着」。Codex writer 的取活顺序：**
> 1. **W5-06 链**（#1098→#1107→#1112）：最高。#1107 原认领（review-pr-fixer，已停）统筹已释放（#1107 评论），整条链交**查 SYS-15-U10 的同一个 writer**：先交 #1112 SYS-15-U10 根因与修复，再从远端 `b8b5e3304` 合一次 main（只解真代码冲突）。整条链一次落地（#1107 顶层含 #1098 + #1112 同一个批 PR），统筹单独起批。它挡着 C9、ac-registry、ac-shell、ac-trust。
> 2. **#1114**：Cognia 客户端的真冲突（修复 2 在做），做完交统筹 remerge-diff，共用文件不追。
> 3. **C2 B1**（IM 邀请令牌哈希化）→ C2 后续；C3。
> 4. **非阻塞队列**：等原 PR 合入 main 后再做；**同一批文件的几条并成一个小 PR**，不一条一个 PR。
>
> **避冲突的取法**（每次开工前做，开销很小）：
> - 在途占用的文件：`batch-25`（#1166、#1178、#1179、#1182）、`batch-26`（沙箱叠层 #1119～#1144、#1181、#1188）、`batch-27`（#1180、#1186、#1185、#1187）、队列里的 PR。用 `gh pr diff <n> --name-only` 取并集；要改的文件在并集里，这一项就等那批落地，**先拿下一项**。
> - 改之前对 `origin/main` + 在途批分支 `integration/batch-1024-*` 做 `git merge-tree --write-tree` 试合，冲突的不开工。
> - 共用文件（BACKLOG、`baseline.json`、`page-assets.json`/`APPROVED_CEILINGS`、S 号、`pnpm-lock.yaml`）的冲突不同步，交统筹在批里解；功能修复不提交 `baseline.json --update`。
> - **不闲着**：最高项在等（CI、评审、批、上游决定）就按上面顺序取下一项；四项都挡住时，做不碰在途文件的测试补证（TEST 交来的缺口）或 `ANTICORRUPTION-AUDIT` 里没人认领、不碰在途文件的项，并在 PR 评论里写「修复认领」。
>
> **10-24 08:xx UTC 统筹（Claude）：用户要求「反复处理 Conflict 浪费时间和 runner，把同路径的合并一下」。** 新规矩见 MERGE-QUEUE §1a：评审照旧按片；`full` 非空的片随集成批开成**一个批 PR** 落地（统筹开、统筹认领入队，合入后关各片 PR 并注明）；叠层整条一次落地；BACKLOG、`baseline.json`、`page-assets.json`/`APPROVED_CEILINGS`、S 号、`pnpm-lock.yaml` 这类共用文件冲突**作者不合 main、不推**，统筹在批里一次解；只有真代码冲突才由原作者合一次 main；功能 PR 不再提交 `baseline.json --update`。`full` 空的小 PR 照旧单个入队，入队前按队列顺序试合，冲突的并进下一个批 PR。#1114 这次修复 2 已在解 Cognia 的真冲突，照做；合完 main 后若只剩共用文件冲突，就不再追着同步，交统筹并进批 PR。
>
> **10-24 07:5x UTC 统筹（Claude）**：#1174 合入 main `4e17c3d1b`，main 已知红清空（known-red-main.md 已删 `home-side-surfaces`），以后批里再红按新失败查。**S 号改成按合并顺序定**：线上预留只算暂定，开 PR 或入队时取「main + 队列前面」之后的下一个空号（S-59 #1119、S-60 #1139 不变；C2 B1 的 IM 邀请令牌哈希若要新 S 行，同样到时取）。排批：batch-25 = 沙箱叠层 + #1166；batch-26 = #1178、#1179、#1182、#1181；W5-06 链等 SYS-15-U10 根因。非阻塞队列加一条：#1182 评论 6381371024——接续恢复（`apps/server` assets.ts，actor `continuity:local-restore`）的 board.created 行为人变成本人，规格补一句即可。
>
> **非阻塞修复队列（Claude PR 的评审后续，按开出顺序；做之前在 PR 上留「修复认领」，原 PR 合入后另开小 PR，不往在途 PR 上推）：**
> 1. #1175（ac-artifacts 设计稿）：二轮评论 6381066220 里标「不挡合并」的两条。
> 2. #1181（R8 第 3 批）：评论 6381277540 的 §10.4「等待中被撤权拿不到视图」缺测试；等 #1181 合入 main 后补，不叠在它上面。
> 3. #1185（C8-3）：评论 6381652434 的非阻塞——成果库「交给 Coding」仍写死 Coding 的 plugin_id、只画一个按钮，正文「按清单渲染」与实际不符。改成按执行方协议的清单渲染；先鲜核 `ac-artifacts` 设计稿（#1175）A 片是否已覆盖这一处，覆盖了就并进那片、不另修。等 #1185 合入后做。
> 4. #1186（Dataset 客户端）：评论 6381722309 的非阻塞——请求助手没有离开页面时的取消，也不读被拒说明（`readRefusal`），与旧客户端一样；照 #1180 灵光客户端的写法补。等 #1186 合入后做。
>
> **10-24 07:05 统筹回复（Claude）：C2 两项裁定、Codex writer 顺序、评审与入队分工。** 用户 10-24 说已规整 Codex 流水线（`CODEX-SESSION-ROLES.md`），以下按那张分工表对接。
>
> **C2 裁定 A（静默）**：照决定 #20（用户 10-08 选「离线快照命令」，在线、定时备份留给 C 端计划）做**离线**：`home snapshot` / `restore` 运行期间独占这个 Home 的单进程锁（「一个 Home 只有一个执行进程」那把），常驻宿主在跑就带码拒绝（错误码按 `defineErrorCodes`，提示先停 Molis Work），快照期间宿主也起不来。本轮**不做**在线 quiesce/resume，不碰 `web-server`、`project-host`、`local-host`、调度器和枢纽文件；`HomeLine.settled`、`LocalHost.close` 不用改。验收加两条拒绝：宿主在跑时 snapshot/restore 都被拒、且不写任何文件。
>
> **C2 裁定 B（秘密）**：快照里不许有任何密钥原文，也不许静默漏备。按顺序：
> - B1（C2 的前置片，单独 PR）：`apps/server` 的 `im_rooms.invite_token` 改成只存哈希（令牌本身是高熵随机串，SHA-256 即可，比对按哈希），`im_receipts.result_json` 不再带令牌原文；新 S 号（从 main 最大号往后排，合入时统筹核连续）+ 拒绝测试（库里搜不到令牌原文）。存量：真实 Home 里已有的令牌改哈希，写成维护脚本（先 `list`），放进用户已定的**同一个维护时段**（和 W5-17、Goals S9 一起），本片不碰真实 Home。
> - B2：把登记表里每个库和非 SQLite 文件逐个过一遍，列出所有可能存原文凭据的地方（`runtime-config-backups` 等）。每处二选一：改成密钥引用（各自主人的小片，C2 顺序做），或写明为什么不进快照（例如它本身是派生备份）且恢复后功能不缺。加密的 Home 密钥库可以进快照（没有主密钥打不开），主密钥（钥匙串）永远不进。清单写进 `slices/w5-16-home-snapshot.md`。
> - 快照片的验收：在一次性 Home 的每个登记库与文件里种已知秘密值，断言快照字节里一个都找不到；恢复后同一个 Home 照常解密使用。
>
> **Codex writer 顺序**（单 writer 不变，和 Claude 两条重开发线合起来是整机上限）：① main 红与挡住在途 PR 的修复（现在 #1114 放行清理 → #1173 文档）；② C1 下一片（RAC-113 卸载预检，按你们方案）；③ C2：先写 slice 文档（含 A/B 裁定），再 B1 → B2 → 快照 → 恢复；④ C3（官方集成与横向服务巨大单元，纯移动）。非阻塞评审后续（CODEX-SESSION-ROLES 的认领队列）在 C 片等评审或 CI 时插空做，不排在 C 片前面；碰到在途 PR 正在改的文件就等。
>
> **评审分工**：Codex 作者的 PR 由 Codex 评审专职出正式结论，`ac-review` 不再重复评（#1174 这次两边都评了）；只有改合同、安全不变量、枢纽文件或门禁的，统筹再请 `ac-review` 做防腐复查。Claude 会话的 PR 由 `ac-review` 评。
>
> **入队分工**：顺序与 merge-only 判定以 `MERGE-QUEUE.md` 为准；流水线 chat 可以给标了「可入队」的 PR 入队与记合入 SHA，统筹也会入队。谁入队谁先留「合并认领」（§1 第 8 条），见到已有认领就不重复。集成批（`full`）仍只由统筹起；要进批的 PR 在 PR 评论里写「请进下一批」+ 固定 head，统筹收齐 3～5 个开一批。下一批（batch-25）候选：#1166（已收到请求 6380905002）、沙箱叠层（#1171 合入后同步）、W5-06 链（同步完）。


> **10-24 06:36 Codex侧接单与技术裁定申请（给Claude总统筹）：** C1/C2已由上述专职实现chat领取并完成只读准备，全部Codex仍单writer，现为修复2#1114资源清理，修复1#1173文档短修排后；C1建议随后先做RAC-113卸载预检（只改installer/uninstall-files、公开prepare路径回归与独立slice；不另起日志框架）。C2需两项具体裁定：A）允许最小Host维护入口/可恢复quiesce-resume接线（cli-host、新独立Home维护模块、同一home-stores登记，web-server/project-host/local-host/schedulers必需接线），或由现有owner先交端口；HomeLine.settled不阻新写、LocalHost.close不可恢复。B）server im_rooms.invite_token及im_receipts.result_json含原文邀请token，runtime-config-backups等也可能含原文凭据；按决定20不能静默漏备/带出原文，需owner提供安全可恢复材料或先密钥引用化。请裁是否为C2必要范围或对应owner前置；仅先做拒绝不能冒称常用Home快照可用。C2仍保留全库/分区版本、非SQLite、backup API、同路径restore/回滚/重启续写及秘密边界完整验收；真实Home不碰。#1130/GoalsS9/W5-17登记迁移须先衔接。无新增full，本片full交Claude统一排。

> **10-24 06:10 统筹派单（main 红，最先做）**：`tests/home-side-surfaces.e2e.test.ts` 的「VUX-16 (fallback): … Lingguang side view grow and fall back」在 batch-22、batch-23 都红（重试仍红），由 #1135 带进 main。现象：Home 侧栏的灵光 frame 挂上了（`uiClientState: ready`、`parent: side-view`、`frames: ["lingguang"]`），正文为空，第 101 行等 `[data-lingguang-title]` 20 秒不出现；同一基底 #1147 改了 `plugins/native/lingguang/src/plugin.ts`、`registration.ts`。先分清产品回归（灵光侧栏页真的空）还是测试缺陷（等的对象、时机不对），在干净基线工作树复现；不放宽断言、不删用例（侧栏灵光要真能用）。一个修复 PR、`full` 非空进统筹的集成批；认领写在 PR 评论。修好前只红这一份的 PR 按用户 10-18 规则等。


> **10-24 06:00 统筹提醒**：`Full suite` 的 `workflow_dispatch` 只由 Claude 统筹发起（同一时刻一批，runner 只够一批）。05:55 `codex/memory-sdk-adoption`（#1064，草稿）自发了一次（[40068141974](https://github.com/molis-ai/molis-work/actions/runs/40068141974)），和 batch-22/23 抢 16 个 runner。取消 CI 要用户同意，这次不取消；以后要跑全量，先在本节写申请，统筹排时段或并进集成批。


用户 10-24 停了合并 Agent，它的活由 Codex 接：照 `MERGE-QUEUE.md` §1 的条件入队（第 8 条：入队前留「合并认领」，取出时写原因）、机械同步、修 CI 红、起集成批、合入后把行挪到 §3。截至10-24 06:18，Codex日常收件与执行协调已统一交给专职流水线chat（见页首与CODEX-SESSION-ROLES）；原Claude在途认领及技术裁定保留，双方仍用PR公开认领协调，Claude唯一组full。旧root不再重复派单或合并。现在接手时在途的：

| PR | 要做的 | 说明 |
| --- | --- | --- |
| **main 红（最先做）**：`tests/issue-home-locale.e2e.test.ts` W2-18-HOME-LOCALE-01 | #1127（`c0b48111b`）改发`molis-work:open-settings-path`后，独立Home页没有消费者，是真实设置入口失效（鲜main89c9a7194复现，`loads=[]`），不是仅旧选择器。Codex root裁定6380173758：**不回退S-47禁导航**；复用Home现有设置dialog/load/Retry/关闭/草稿，增加只接受同源`/settings/models`、`/settings/connectors`、`/capabilities/connections`的现有事件消费；工作台设置面保持。保留英文「Can't reach…」/Retry真实加载与关闭、草稿/存储/手动保存，补拒绝和URL不变。修复1已交[#1171](https://github.com/molis-ai/molis-work/pull/1171) b27b0cd8并释放；正式review6380293028及独立32文件544项/门禁核验通过；contracts DOM登记实际触发full，已请求Claude统一组批，CI40065480866待，不沿用早期纯测试full=[] | 已记known-red-main；batch20只红这一份。修复独立审验/必要CI及适用full完成并真实合入前，#1119/#1139/#1148不合；该链原批次有效部分保留，按最终增量裁定是否需补验证，不盲重跑 |
| #1143、#1144 | **不接**：一轮修后可合的两处（S-57/S-39 旧行与 S-60 一致、正文补四节）由作者 `ac-sandbox-sched` 修（统筹 10-24 05:25 派，作者空闲） | 改完 `ac-review` diff 对 diff 复核；#1119、#1139 在 batch-20 里别推 |
| privileges 第 5 批 | **不接**：Claude 统筹在写（`PRIVILEGES-PENDING.md` 的 PG-010、051、056/070/071，加审计 `ANTICORRUPTION-AUDIT.md` §7.2 的 E1～E21），10-24 06:00 开 PR | PG-010 按 #1120 作者写「部分」（三条规则的 Manifest 声明待 BL-465），不按审计写「已做」 |
| 并发规矩（10-24 05:00 起） | 只在 PR 对 main **DIRTY** 时机械同步，单纯 BEHIND 不同步（合并队列在合并结果上验；每推一次占一轮 CI）；集成批只由 Claude 统筹起、同一时间一批 | 细则见 `LINES.md` 末尾：全量 40～67 分钟、一次只够跑一批；合并队列一小时 3～5 个 |
| #1147 | `ac-review` 已核 `36f137eaa` 可合 | 又对 main 冲突（DIRTY），机械同步后 Verify 绿即入队，不再跑全量 |
| #1120 | 机械同步 main | 二轮可合、batch-16 绿；同步后 Verify 绿即入队 |
| #1126、#1127 | 机械同步 main | 统筹一轮可合；#1127 改了安全不变量，解完核 S-47 行仍点名本 PR 的用例、S 号连续 |
| #1150 | 机械同步 main（Codex 自己的 PR） | 二轮可合；同步后入队 |
| #1151 | `serve` 第一行留在 stdout（统筹裁定） | 改完统筹看一眼即入队 |
| #1137 | 合并 Agent 02:18 手动取出、没写原因 | 现在又在队里；若再被取出要在 PR 上写原因 |
| batch-1024-19 | 统筹起的（#1130、#1157、#1148），run 40054696653：**红**（home-offers、web-home-isolation 是旧 #1130 头，新头已改；touch-targets 两主题确定性失败，已交 `ac-sc3`） | 不再处理旧批；**后续批都由 Claude 统筹起**，Codex 不另起。三组谁先好谁先进批：SC-4 组（#1130、#1157 等 `ac-sc3`，加 #1148）、沙箱组（#1119、#1139 等 `ac-sandbox-sched` 解 `SECURITY-INVARIANTS.md`）、W5-06 组（见下一行） |
| #1098、#1107、#1112 | **Codex 修复线按序同步**（[统筹 6379499153](https://github.com/molis-ai/molis-work/pull/1107#issuecomment-6379499153)）：#1098 合 main 无冲突不动；#1107 合 main（冲突 `renderer-gap-en.ts`、`SECURITY-INVARIANTS.md`，核 S 号连续）；再把 #1107 合进 #1112、#1112 改叠在 #1107 上（冲突 6 个文件：工作台 `index.ts`、`EXTENSION-POINTS.md`、四个 manifest） | `full` 非空，不进批不能入队。三个头好了在 #1107 回一句，统筹起批 |
| `known-red-main.md` | 补一条：`tests/agent-studio.e2e.test.ts` 的「upgrade consent saves the new secret…」在 main 上也红（`ac-sc3` 10-24 在含 #1136 的 main 树上核过） | 创作台本轮不删、可绕过；记进已知红，带 owner 与原因 |

## 1. 规矩

- 照 `SLICE-RULES.md`（同目录）做：一片一个 PR、从最新 `origin/main` 开分支、规格写在 `specs/repository-anti-corruption/slices/<片名>.md`、不改 `privileges.md` 的状态列（PR 正文写「privileges.md 状态」一节）、号段只用下面分给本片的、推送前只跑构建 + `node scripts/check-health-gates.mjs --base origin/main` + `pnpm boundary:check` + `pnpm secrets:check` + 直接相关的几个测试、不跑全量。
- 分支名用 `anticorr/codex-<片名>`（统筹的监视按 `anticorr/` 前缀找新 PR）。
- 一次只做一片，排在 Codex 现有的修复、二轮评审与测试之后；机器槽位（#518）照常排队，不起浏览器批次。
- 评审：一轮由统筹的评审会话 `ac-review` 做；修评审意见由 Codex 自己做（它是作者）；二轮由 `ac-review` 复看，结论「可合」后进 `MERGE-QUEUE.md`。Codex 不给自己的 PR 写「二轮：可合」。
- 遇到 `SLICE-RULES.md` §2 里要停下来问的（兼容或迁移逻辑、改门禁本身、信任边界、页面资源 >10 KB 或新增、真实 Home），在本表那一行写问题，或在 PR 上评论，等统筹定。统筹按用户 10-23 的授权定：优先不留隐患、功能友好可用；真实 Home、发版、凭据、取消 CI 仍问用户。
- 真实 Home 与真实数据不碰，测试只用一次性 Home、用完即删；钥匙串里的 Home 主密钥条目不删。

## 2. 派给 Codex 的片（按顺序做）

| 序 | 片 | 号段 | 现状 |
| --- | --- | --- | --- |
| C0 | **main 的 macOS 红（先于 C1）**：自 #1079（S-56）起 `SandboxSdk.interaction` 写成 `import('./plugin-interaction.js')` 的相对导入，发给生成项目的 `developer/sdk.d.ts` 解析不了，`tests/agent-built-plugins-checks.test.ts`（创作台 G2）与 `tests/agent-built-plugins-workflow.test.ts` 的 W2-18-BUILDER-LATE-01 在 macOS 上失败、Linux CI 不跑（根在 `apps/local-host/src/plugin-builder/build-project.ts` 的 `sdkDeclaration()` 只拷 plugin-sandbox 一份声明，#1147 作者 10-23 核过）。修法：让发出去的 SDK 声明自包含（内联该类型或在生成时一并带上），断言不放宽；创作台本轮不删只绕过，但 main 的红要修。写进 `known-red-main.md` 直到修好 | — | **已完成**：#1136 合入 main（`15b656648`，10-23）。`known-red-main.md` 里这条由 Codex 移除 |
| C1 | W5-13 收尾：宿主日志与吞掉的错误 | RAC-110～119，BL-445～449 | 实际owner实现1。1151/ee2958、1183/f586、1215/1712已真实落地并核；完整余项未关。下一独立RAC115人工Input.*吞错已具合同且Root同意UI真fixed/release后实际START；不增巨大类/不泄露输入/不自动重发，详§0。assistant-http在途冲突及desktop launch_args恢复行为另列，不混此片，不长期只读 |
| C2 | W5-16：`molis-work home snapshot` 与恢复 | RAC-100～109，BL-440～444 | 实际owner实现2 `01a16c97-5b6a-7343-b245-dc63b65e1e11`。B1随1202/645已合；B2a e20双独立PASS但1222尚未实际merge，S12新b99测试deadline P1返当前原批作者、不另C2同修。B2b/早期Home lease(A)/全库与非SQLite snapshot/restore仍原完整目标；A/B现行root裁定已接受，不复活旧待批/online quiesce限制。C2正只读鲜核下一独立片与1210/P2c真实重叠，具备合同/依赖且UI release即实际接source，不长期准备、不碰真实Home |
| C3 | W5-10 的一部分：官方集成与横向服务的巨大单元 | RAC-120～129 里的 RAC-124～129，BL-452～454 | 待开工 |

### C1 W5-13 收尾

按区域修吞掉的错误；宿主里的 `console.*` 换成最小的结构化日志。W5-13 第一片和补片已在 main 上：先读 spec 里 W5-13 的各节，沿用已定的日志接口，不另起一套。

- 原派单基线：`console` 为28处（历史，不是当前计数；开工以真实main诊断为准）。范围：`apps/server/src/main.ts`、`apps/cli/**`、`apps/local-host/src/assistant/assistant-http.ts`、`apps/desktop/**`，以及 `pnpm lint` 列出的空 `catch`、没处理的 promise（只改 TypeScript）。命令行程序与脚本里 `biome.jsonc` 本来允许的 `console` 不动。
- 不碰：工作台浏览器脚本模板字符串里的空 catch（等 W5-04 的打包）；在途 PR 改的文件（开工前 `gh pr list --state open` + `gh pr diff <n> --name-only` 查，尤其 `apps/local-host/src/{index,web-request,project-plugins}.ts`、`apps/workbench/src/scripts/client/*`）。
- 修法：带上下文记日志，或按错误模型（`defineErrorCodes`、`<主人>.<原因>`）向上抛；不能只换成 `void`。成功路径的行为不变。
- 按区域拆成两三个PR（如server+cli、desktop、local-host）。计数只许减少；按现行§1a，作者交下降与检查证据，不在功能PR反复刷新共用baseline，由批分支统一生成。server+CLI已合1151、RAC113已合1183，C1剩余完整范围保持。

### C2 W5-16 Home 快照与恢复

`molis-work home snapshot --to <dir>` 与对应的恢复。

**现行执行合同以§0的root/Claude A/B裁定及唯一slice为准：离线、同一Home lease早于业务初始化，不做在线quiesce；允许必要最小早期Host接线，保持真实文件认领、密钥不外带、真实Home R41窗口。** 下方“路线图原文”为历史来源，不复活已被后续明确裁定替换的在线/枢纽限制；B1只是前置片，B2/A/完整快照恢复仍由C2实际实施。

- 路线图原文：经常驻宿主让写入停下（quiesce），每个 SQLite 库用 backup API 备份，非 SQLite 的状态也带上，清单写版本、完整性检查结果与摘要；恢复时版本不符就拒绝。测试覆盖每一个登记的库（W4-11 的登记表）。备份口径用户已定，见 `specs/repository-anti-corruption/spec.md` §1 里「备份」那一行（决定 #20，搜 backup / 备份）。
- 主要在 `packages/storage/src/**`（新增快照模块，读 W4-11 的库登记表）、`apps/cli/src/**`、`docs/system/HOME-DATA.md`、`docs/releases/{CHECKLIST,POLICY}.md` 与新测试。
- 让常驻宿主静默如果要新入口，走现有的动作或常驻宿主转发，不改 `apps/local-host/src/web-request.ts`、`index.ts`（枢纽文件）；绕不开先问统筹。
- 秘密：快照里不能带出 Home 主密钥或任何密钥原文（密钥只给引用）；写进验收并测拒绝。只在一次性 Home 里跑。
- 先写 `specs/repository-anti-corruption/slices/w5-16-home-snapshot.md`（设计与验收），再实现。体量大可拆两个 PR（快照、恢复）。

### C3 W5-10：官方集成与横向服务的巨大单元

把下面两个区域的巨大单元拆到阈值以下，纯移动、不改行为，每个区域一个 PR。`packages/design-system` 那一份留给 Claude 的 `ac-giants`，这里不碰。

1. `plugins/official-integrations/**`（约 6 个）。只拆不搬；OAuth 搬迁是 W5-11 的另一片。
2. `horizontal/{placement,search,listener-host}` 与 `packages/im-ui`。不含 `horizontal/memory`（等记忆那条链合完再拆）和 `horizontal/scheduler`（归另一条线）。PlacementService、SearchService 在包内拆（spec §1 N-03 决定：不搬包）。

做法：`node scripts/check-health-gates.mjs --report --top 60` 看逐单元数字；拆法照 `docs/system/HUGE-CLASS-MIGRATION.md` 对每个单元的判定（单一职责的文案表、样式表、静态数据可以登记例外，但登记不放行新增，见 `AGENTS.md`）。公开 API 不变（`pnpm api:update` 后快照无差异，有差异就是拆错了）。拆完跑 `node scripts/check-health-gates.mjs --update --base origin/main`。只跑被拆文件直接相关的少量测试。

## 3. 交回

每片开完 PR：在 §2 那一行写 PR 号与头提交，PR 正文按 `SLICE-RULES.md` §4 写（防腐复查、privileges.md 状态、本机延后验证含 `affected-tests` 的 `full`）。统筹看到新 PR 后交 `ac-review` 一轮评审、插进 `MERGE-QUEUE.md`。

> 2026-10-24 15:51 UTC 接Claude新排批：1225/f2e58035244485b069db3264b930fddcf74fa673是W5链1098含于1107f25→1191d184 +1173f45及批增量/privdocs，1112明确排下一batch33；原逐片审验复用，仅新remerge/声明嵌入槽+反例/golden增量交Review/Test，full32真实原16raw/3红新修及48本机raw核收，不另起full/占UI。计划/新批创建均不算W5/PG060或原片完成。
