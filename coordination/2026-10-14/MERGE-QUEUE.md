# 防腐线合并清单（给合并 Agent）

> **2026-10-23 23:26（洛杉矶）最新分工：** 一骏明确整条防腐线听Claude总统筹：范围、优先级、跨线依赖和全量排期由Claude决定。Codex侧「专职｜防腐流水线与合并执行 · Codex」（`01a16c88-7956-7e10-a5f4-5baf476c3634`，用户最新指定gpt-6.1-sol/max，06:45:56UTC实际回合已核；root/REVIEW保留gpt-6-astra/xhigh）从Claude当前共享派单或明确回执领取独立任务，组织专职实现/评审/测试/修复，按Claude顺序核证据并执行正常合并；每10分钟兜底接续。原主chat保留完整目标、用户沟通并建立1–2个实现入口后交Codex侧接续，不重复建chat。全部Codex实现chat合计仍单writer、公共build/browser槽；四专职入口及所有有效block/non-block闭环见[CODEX-SESSION-ROLES.md](CODEX-SESSION-ROLES.md)。DeepSeek历史贡献和仍在途的review-pr-fixer认领、Claude开发owner及唯一full组批职责分别保留；Codex侧协调不替代Claude总统筹。

状态：2026-10-23 起生效。统筹（本机 Claude）维护顺序与就绪条件；合并由用户另派的合并 Agent 做（用户 10-23）。**10-24 起统筹也合、也审**（用户 10-24：PR 积压，统筹协同处理合并与评审）：条件 1～5 满足的，谁先看到谁入队。**10-24 03:40 用户停了合并 Agent，它的活（入队、机械同步、CI 红的修复、起集成批、挪 §3）由 Codex 接**；统筹职责不变。下文的「合并 Agent」都读作 Codex。

读法：

```bash
git fetch origin coordination/handoff-2026-10-14 && git show origin/coordination/handoff-2026-10-14:coordination/2026-10-14/MERGE-QUEUE.md
```

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

「就绪」只在 1～5 条全满足时写「可合」。

| 序 | PR | 内容 | 依赖 | 批 | 现状（统筹最后核对 10-23 18:55 UTC） |
| --- | --- | --- | --- | --- | --- |
| 4 | [#1098](https://github.com/molis-ai/molis-work/pull/1098) | W5-06第2b片：视图分组/新建/首页起点/设置图标 | 1087；已被1107顶层包含 | W5专批1098/1107/1112/1191一次落地 | 固定91e096524一轮可合；不再逐层sync/base切换，1107真代码交FIX2一次同步，共用BACKLOG/assets/baseline/S号由Claude实际批writer统一，最终固定包含/审验/适用full与真merge齐才关片 |
| 5 | [#1107](https://github.com/molis-ai/molis-work/pull/1107) | W5-06第3片：项目级Runtime实例舞台 | 顶层含1098；新头给1191原ac-coding接一次 | W5专批统一一次落地 | 原b8b5；旧review-pr-fixer已Claude6381877118明确释放，保留其未推064cf2本地树/贡献。实际owner FIX2，C2当前独立片固定release后给真代码同步槽；当前f586 merge-tree已有plugin-catalog.ts及renderer-gap-en真代码、Security冲突，fresh开工再核，纯共用生成/S号交Claude批一次解，不等旧writer答复 |
| 8 | [#1112](https://github.com/molis-ai/molis-work/pull/1112) | W5-06余项：Manifest标题/标签/规格板，非Draft | W5专批1098/1107/1112/1191；1107真代码同步FIX2接续 | full命中assembly/spans-packages，Claude唯一专批 | 固定8d700二轮6380756955有效；U10既有产品竞态已TEST6382237548受控证实，独立修#1200/82fd已交REVIEW与资源认可、独立TEST/Linux待；不能写Linux唯一因果已闭。当前对f586仅BACKLOG/assets冲突交批writer；三nonblock实际owner FIX2未修。1107旧认领已6381877118释放，不再等DeepSeek，保留原贡献 |
| 13 | [#1119](https://github.com/molis-ai/molis-work/pull/1119) | BL-395 整片：沙箱项目库语句跑在宿主能杀的子进程里（时间、内存、结果、递归上限；S-59，改 S-46） | **#1117 先合**（S 号连续的门禁要 S-58 在 main 上） | `full` 非空（shared-core、spans-packages，219 文件），进下一批 | 作者ac-sandbox-sched已回复6379495572确认同步在途，新远端 `ae2b64cd9626d61f2f486db65b51c51035c7b529`；待最终交接/增量复核。原32项有效，batch13–19无本片有效full，后续明确集成批补齐；未开第二writer |
| 19 | [#1129](https://github.com/molis-ai/molis-work/pull/1129) | W5-03/04 Todo 片（样板）：客户端打包成 TS、稳定翻译键；`todo.js` 61,976→54,090 B | — | `full` 非空（assembly、deletes-code，102 文件），进下一批 | **已关闭**（10-24，统筹）：同步 main 后树与 main `1dedc1f5c` 相同、0 个文件；Todo 片内容随 #1132 合入，batch-17 已覆盖 |
| 27 | [#1139](https://github.com/molis-ai/molis-work/pull/1139) | PG-017 P0：`sandboxServicesFor` 一张映射；不给的服务一声明就以 `sandbox.service_not_given` 拒绝（项目与 Home 执行器共用）；S-60 一行 | **叠在 #1119 上**；S 号连续要 #1117、#1119 先合；#1134 合入后作者把切片文件改动并进来 | `full` 为空 | 作者同步下层中，新远端 `9314fc7ba22410df66a2ce38ae27f0dccff3bfbd`，仍叠1119；旧5713头二轮6379124950有效范围保留，新头待回交和增量核验；依赖及Security门槛不变 |
| 28 | ~~#1140~~ | SC-4 残留：BL-485/486/488 | 作者已关闭（第三层）；分支 `migrate/sessions-sc4b-runtime-leftovers`（`259a5fc84`）留着，#1113 已合，作者改开 [#1157](https://github.com/molis-ai/molis-work/pull/1157)（叠在 #1130 上，第 39 行） | — | 最终候选 `e387dc98167679751288f8c8cf6d168abc625c7f`，作者6379640966交付：合下层78与b640，保留fb22双阶段断言；touch恢复原断言、真实pin配置增todo，报告4/4。已派独立最终review/raw核验，下一batch尚未启动 |
| 29 | [#1143](https://github.com/molis-ai/molis-work/pull/1143) | PG-017 P2a：连接经 broker 给沙箱插件 | 叠在 #1139→#1119（第三层）；已按用户要求转为非 Draft，保留 #1119 先合与 #1139 改投 main 的依赖 | 待重算 | 一轮修后可合（[6379959779](https://github.com/molis-ai/molis-work/pull/1143#issuecomment-6379959779)）；作者已修（S-57 与 S-60 一致、正文四节、合 #1139），新头 `f904b2e70`；待 diff 复核，随 #1144 进 batch-22 |
| 30 | [#1144](https://github.com/molis-ai/molis-work/pull/1144) | PG-017 P2b：不联网的材料读取经 broker 给沙箱 | 叠在 #1143（第四层）；已按用户要求转为非 Draft，仍按层依赖合入 | 待重算 | 一轮修后可合（[6379978891](https://github.com/molis-ai/molis-work/pull/1144#issuecomment-6379978891)）；作者已修（S-39 与 S-60 一致、正文四节），新头 `75fe93612`；待 diff 复核，进 batch-22（带着整叠 #1119→#1139→#1143） |
| 新 | [#1114](https://github.com/molis-ai/molis-work/pull/1114) | Cognia目录稳定locator/真实代码同步 | 1167/1169已真合，源冻结 | 实际integration27/729b9d7c3/full40084374444已含，批PR落资源 | 固定3aae，REVIEW6382204940+资源6382529211+独立TEST6382908190通过；9file58同头复用、独立UI4/4+ONLYmodel-ready1/1首过，无剩余UI缺口。预算仍22133→22157+24B红，729批准尚未应用；实际共享writer最终重测/准确APPROVED及生成记录，BL568去已解决行、565–567留，不把起full当已修CI/已合 |
| 新 | [#1173](https://github.com/molis-ai/molis-work/pull/1173) | DeepSeek原稿与Codex CI Chrome/S47文档修复 | #1171已合；沙箱叠层之后sync/合并 | full/storage为空 | 最终`f45abe4e8a46c12722f5cb3194410df56439dab4`已普通push，47cf后两doc+4/-3；REVIEW增量6381248620通过，TEST作者直交独立核证也已通过；最后workflow_runs=[]，DIRTY，非CI排队/已绿。S31/S38/四测试/门禁逐字保留，BL569仅登记，实际后续owner修复1；不新增nonblock合并门槛。不先merge main，作者已释放，C1已实际接writer |
| 新 | [#1180](https://github.com/molis-ai/molis-work/pull/1180) | ac-clients-1 W5-03/04灵光页面客户端 | 叠#1169，合入后改main并核增量/CI/full | 适用full仍待Claude统一批 | 固定`5e26ba1efefc6643a4fc343f2010ea39eb809bb2`，父/受测merge-base为295575bcd，不声称已整合目标新d586。ac-review6381327535通过；TEST公开6381556552实际4文件24项首次通过（真实转换/冲突保留等），其余无关选测不重复；原作者另4browser自报未计独立。实际日志/tmp/molis-verify-2026-10-24/pr1180-test-5e26ba1ef/handoff.md |
| 新 | [#1181](https://github.com/molis-ai/molis-work/pull/1181) | ac-kernel R8 agent-host正式动作 | mainbase；实际后续批按Claude | 最新两fixture薄修按merge-only并1202 | 当前7533e15611d5ddc3b74c65aed9275aaffdabde58，parent已审f8ee(companion REVIEW6382783113过)；新增effect-control接local同动作目录已实际交，REVIEW/TEST即时接新头，不再催旧f8开工。原0/9和503源保留；原真实SDK/9拒绝断言不变，独立原始绿及实际包含merge未齐不关；RAC181nonblock仍FIX2 |
| 新 | [#1188](https://github.com/molis-ai/molis-work/pull/1188) | `ac-kernel` BL-366：人批准的 Agent 写入也发 `host.workspace.changed@1` | — | 进 **batch-26**（full: true） | 头 `d6d1da98a`；**ac-review 一轮可合**（6381803425：只一处广播、载荷不带行为人、被拒与历史恢复不发）；进 batch-26 |
| 新 | [#1191](https://github.com/molis-ai/molis-work/pull/1191) | `ac-coding` C9：删 `coding-surface.ts`，Coding 与 Files/Git/Diff/Text Stats 舞台走通用舞台通道，Coding 离开 HYBRID，GIT-01 收紧到监督器 | 叠在 #1107（base `feat/w5-06-project-stages`） | **W5-06 专批**（与 #1098+#1107、#1112 一个批 PR） | 头见 PR；full 命中 shared-core/assembly/spans-packages；交 ac-review 优先；与 #1130（在 #1157 里）、#1109 有重叠，后合的同步 |
| 新 | [#1186](https://github.com/molis-ai/molis-work/pull/1186) | `ac-clients-1` W5-03/04 Dataset 页面客户端 | — | 进 batch-27（`full` = assembly） | 头 `0310ce2a4`；**ac-review 一轮可合**（6381722309，dataset.js −1,666 字节）；非阻塞 1 条交 Codex；进 batch-27 |
| 新 | [#1187](https://github.com/molis-ai/molis-work/pull/1187) | `ac-sc3` Goals S9-0：插件经项目库日志端口读写事件与幂等记录，取消/撤权后一行不写（S-61，按合并顺序取号） | #1119（S-59）、#1139（S-60）先合，否则 CI 红在 S 号断档 | 进 batch-27 | 头 `0b6d12ce0`；**ac-review 三轮可合**（6381992934：`journal:project` 读只看自己、operation 加命名空间、分隔符 ":"、RAC-294～296 含前缀包含对照）；进 batch-27 |
| 新 | [#1182](https://github.com/molis-ai/molis-work/pull/1182) | ac-sc3 GoalsS8：项目库身份由根行决定，看板首开由Goals创建 | — | 已进batch25固定df5984613 | 固定70343d004，ac-review6381371024可合；接续恢复actor说明非block修复1公开6381494980实际承接，已核project.created仍continuity:local-restore、board.created首开为本人，后续最小doc片，尚未修复/合入 |
| 最后 | [#784](https://github.com/molis-ai/molis-work/pull/784) | QA与本人验收记录，非Draft保持 | 收尾合代码后；文档CI重号可独立修 | 文档full适用由实际diff判断 | 当前a1ffb2aca，Shelf QA018与main成果库/统一壳子本人验收两个不同事项撞BL400；已交FIX1只读最小提案，暂预留BL595（原585–594归ac-coding），保留两事项/活引用与历史证据，不关闭报告或标验收。C2源码独占，尚无实际修复提交/不能以登记闭环 |


新开的开发片 PR 由统筹按依赖插进本表。
| 新 | [#1190](https://github.com/molis-ai/molis-work/pull/1190) | C2 B1：IM邀请hash-only/v2/离线敏感数据维护 | 真实批沙箱S59/60→B1 S61，最终统一编号 | shared-core/storage/spans-packages；实际batch26 db4f3a154包含bc016 | 固定bc0160f06，唯一P1已实际修，REVIEW6382074609/独立TEST6382352957通过，真实rm/SIGKILL/marker拒绝/新v2+WAL/外原件与恢复6/6；其他同头证据复用。run40080895158最终13绿3红均归1181/1188夹具，不改写整批全绿。C2已接唯一writer实际START B2，原B1冻结；真实merge及全C2目标未完成 |

| 新 | [#1200](https://github.com/molis-ai/molis-work/pull/1200) | U10刷新保留交互行 | W5原U10修复/独立main | full=[]；实际Claude并integration27/729b9d7c3 | 固定82fd/basef586，代码REVIEW6382734693/资源6382757918/独立TEST6382864207通过，实际LinuxU10首1/1+Security87/87及86/86无retry；P2真重排焦点仍FIX2后续。当前仅Coding376282→377227+945B/Verify红；最终批共享writer重测落APPROVED/生成，已起full40084374444不代表预算已修；C2 B2独占源继续 |

| 新 | [#1202](https://github.com/molis-ai/molis-work/pull/1202) | batch26 sandbox顶1144+B1，按Claude后并1181/1188 | mainf880；Mac已知回归须核修后 | 原db4 full适用独立核；新SDK修头按最终组合验证 | 当前9d3b206f/basef880非Draft、原claim6382880584；auto/queue实核null。1144新8f6317687/6383003050已实际修声明材料/AbortSignal，REVIEW6383041525五文件PASS，非运行时schema；TEST待两阶段红绿/25file原始路径6383021485。1181新7533/1188新05054已薄REVIEW6382943872/6382944062 PASS，TEST精确新头原日志6382989612待补。最终head尚未含则不关闭原红，不以Linux绿盖Mac，正常CI/真实merge齐再关源片 |

## 3. 已合

| PR | 合并提交 | 日期 |
| --- | --- | --- |
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
