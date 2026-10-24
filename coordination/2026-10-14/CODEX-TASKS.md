# 交给 Codex 的独立开发片

> **2026-10-23 23:26（洛杉矶）最新分工：** 一骏明确整条防腐线听Claude总统筹：范围、优先级、跨线依赖和全量排期由Claude决定。Codex侧「专职｜防腐流水线与合并执行 · Codex」（`01a16c88-7956-7e10-a5f4-5baf476c3634`，用户最新指定gpt-6.1-sol/max，06:45:56UTC实际回合已核；root/REVIEW保留gpt-6-astra/xhigh）从Claude当前共享派单或明确回执领取独立任务，组织专职实现/评审/测试/修复，按Claude顺序核证据并执行正常合并；每10分钟兜底接续。原主chat保留完整目标、用户沟通并建立1–2个实现入口后交Codex侧接续，不重复建chat。全部Codex实现chat合计仍单writer、公共build/browser槽；四专职入口及所有有效block/non-block闭环见[CODEX-SESSION-ROLES.md](CODEX-SESSION-ROLES.md)。DeepSeek历史贡献、Claude开发owner及唯一full组批职责分别保留；review-pr-fixer旧认领已由Claude6381877118明确释放并交FIX2接续；Codex侧协调不替代Claude总统筹。

状态：2026-10-23 起生效。用户 10-23 定：独立的开发任务可以派给 Codex，不必都在 Claude 子会话里做。统筹（本机 Claude）在这里派片、排序；Codex 做完一片在本表写 PR 号，再接下一片。

读法：

```bash
git fetch origin coordination/handoff-2026-10-14 && git show origin/coordination/handoff-2026-10-14:coordination/2026-10-14/CODEX-TASKS.md
```

## 0. 接手合并 Agent（10-24 03:40 起，先于 §2 的开发片）

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
> #784开发方Shelf行与main成果库验收行BL400重号交FIX1最小文档修，先有界只读提案核空号/引用，不删除任何真实待做、不关闭QA/不标本人验收、不变PR状态。**BL595暂预留给此修复**（BL585–594按Claude原ac-coding预留保持）；实际落代码前FIX1仍须鲜核无新占用。当前C2源码独占，无第二writer。全仓新审计只读且不构成合并等待门槛。完整实际owner/待做、已合SHA以ROLES当前段和QUEUE为准。

### root全仓审计候选的验证接单（10-24 10:25UTC）

来源：独立审计报告本机 `/Users/yijunwang/code/goalboard/work/anti-corruption-audit-2026-10-24/report.md` ACA003（40–48）、ACA005（57–64），root已复核对应生产从审计f586到当前mainf880无变。这是候选P1的合同/覆盖核收，未运行动态交错，未声称实际用户数据越权；不派新实现writer，不作为无关批新门槛，C2单writer/Claude唯一full照旧。

| 候选 | 初始要求/当前合同 | 当前去重证据 | 实际验证owner与下一动作 | 实施/闭环状态 |
| --- | --- | --- | --- | --- |
| ACA003：Assistant disabledActions在最后异步检查后撤销，缺同步提交尾检 | S18；防腐4.10/4.11/4.18，撤权后业务owner/事务零写；入口async validate_authority与kernel最后等待后检查要对应同原caller | 对42 OPEN PR九条目标生产/测试路径逐个精确base...head，全部对象齐；1153/d148改authority+http、1185/cf67与1064/71ec只http。1153实际目标diff为memory getter回调，不自动等同已修；REVIEW完整合同复核接单中 | REVIEW 01a16bc4-68fe-71d3-af0e-83523232c1ea实际接合同/覆盖复核；确认契约后TEST 01a16bc4-6c9f-7ca0-b47e-621727302fee用确定性屏障挂住最后Host beforeEffect→关闭精确能力→释放，核assistant.action_revoked及owner/事务零写。先收当前已确认CI修复原始证据，不以临时重试冒复现 | 未实施，未复现关闭；确认后由Claude按既定目标/实际依赖给现有修复者，不以领域标签当已认领/已修 |
| ACA005：search.query owner catchUp等待中MCP真实授权撤source/reader，discover仍用caller快照可返摘要 | 只返caller当前有权读取来源；系统整理7/10/12与防腐4.10/4.18，索引owner有权不代替最终caller授权 | 当前42 OPEN在明确search/index、search-actions、kernel settlement、local-host、mcp-action-client及system-search测试目标路径无改动；现数组splice用例不等于真实MCP授权文件在途撤销。REVIEW核实际合同/可能间接覆盖，不把无路径命中当全球证明 | 同一REVIEW去重/合同owner；TEST在前项契约明确且资源可用时用真实Host/MCP+owner listing屏障→真实设置撤source/reader→释放，同次query不得返撤销命中/正文，索引给有权owner仍可用；tmp Home，不碰4207 | 候选P1，尚未动态复现/实施，不能抹旧测试有效范围或据代码审计宣称真实数据已越权 |

ACA002旧卸载清理问题已随#1166包含在#1194实际f880落地，source固定头与最终树包含证据已核，不重复认领或重开。新审计报告仍由原审计chat独占维护，本流水线只读并记实际接单。

> **最新调度接单（10-24 07:31UTC）**：已收Claude的S号按实际合并顺序规则，C2已直达：S71仅临时标识，落PR/入队时按main＋前置队列的下一空号连续定号，S59/60原归属保持，不等待未实现设计占号。main已知红已随1174清空，未来失败重新归因；旧批次原始证据不改。Claude新增#1182/6381371024的恢复actor规格勘误现由修复1实际承接并已在原PR公开认领，按原PR顺序插空，当前未实现、不阻1182。C2 B1仍唯一writer。batch25=沙箱叠层＋1166，batch26=1178/1179/1182/1181，W5链仍等U10根因；均Claude唯一组批，不另起。

> **实际接续（10-24 07:25UTC）**：C1已交非Draft#1183固定7bbb014c4（仅两catch生产修复，18项作者工程证据），明确源码释放并直接发REVIEW/TEST；REVIEW active。C2已实际接唯一writer，隔离树w5-16-im-invite-hash/base新main4e17c3d1，server/im-ui/contracts/im在途无另一writer，开始唯一slice+B1；B1固定源码释放后修复2#1112 nonblock短插空，再归C2 B2/A/快照/恢复，不等前片审验/CI/merge。#1174已真合4e17c3d1（07:21:50UTC），已移MERGE-QUEUE§3；BL544/R44不随其合入关闭。#1183只是C1首个剩余片，整体C1/C2均未完成。

**现行模式：一骏正式确认（2026-10-24 07:13UTC，由root转达）**

Claude继续负责整条防腐线的总体方向、优先级、跨线依赖与唯一full组批。Codex root在既定目标内主动组织独立任务、裁决技术选择和无人认领问题，不事事请示；流水线执行日常派单、源码交槽、CI/队列/正常合并与共享进度。REVIEW独立只读评审，TEST独立核验证据和必要回归，修复1/2承接全部确认有效的block与non-block（含文档、验证缺口、CI和冲突），实现1/2持续承接独立开发片。现有作者正在修的保留原owner，无人认领的由流水线落实到修复专职。

non-block只表示不挡当前PR，仍须有具体实施owner、可执行下一步/真依赖、实际修复PR或提交、独立复审/验证和真实merge SHA；BL、领域标签、待做或准备完成都不算闭环。不成立、重复或取消要有依据。按Claude优先级、依赖和可用writer实际启动，不无限停在台账。

固定PR/head＋spec/diff/原始日志由作者直接发REVIEW、TEST和流水线，收到即自动增量审验；must-fix直接回原作者并抄流水线，新head立即复审，不等用户、二次转发、CI完成或heartbeat。源码固定并明确释放即可交下一独立片，不为等待审验/CI/merge占writer；单Codex writer、整机一build/一浏览器批及Claude唯一full保持。模型分工、已有认领和工作不中断，不新建重复入口。

本组共享协调文件由流水线chat串行维护，root和六专职不抢写。上述现行规则取代历史无真实依赖的“仅准备”“等root再次派”表述；真实源码占用、在途文件冲突、必要外部权限或合同依赖才暂停相关部分。常规交付、排队和内部可解决失败只更新共享；只有必须一骏决定或补权限/信息时通知。

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
| C1 | W5-13 收尾：宿主日志与吞掉的错误 | RAC-110～119，BL-445～449 | 领取owner：实现1 `01a16c97-0dde-7d82-9244-097a93f50770`（6.1-sol/max目标），当前只读准备已交：推荐local-host卸载预检只忽略ENOENT，其他readdir/stat错误抛出，RAC-113，避开所有在途枢纽；#1114/1173既派短修后按Claude优先级启动，不无限等所有bug清完。进行中：server+cli 首片 [#1151](https://github.com/molis-ai/molis-work/pull/1151) 已于10-24 03:42:05 UTC真实合入，merge `ee2958d2acef18006eddc14ff0761a3fd3a39e99`，最终审验head `11f0d67dbc090b3fc51ca3343441545ddc75c0c3`；stdout产品入口、EPIPE和第二信号强退的评审/本机/CI证据齐备。desktop、local-host后续片尚未开始，C1整体未完成；后续开发仍排在现有修复、评审和测试之后 |
| C2 | W5-16：`molis-work home snapshot` 与恢复 | RAC-100～109，BL-440～444 | 领取owner：实现2 `01a16c97-5b6a-7343-b245-dc63b65e1e11`（6.1-sol/max目标）；完整只读准备已交、未实施。须Claude裁最小Host维护接线与秘密安全备份前置；storage+cli现状无全Home quiesce/resume，不能假装只两包已能完成。完整snapshot+restore目标不缩小 |
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
