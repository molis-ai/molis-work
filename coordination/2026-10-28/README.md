# 防腐跨设备协同（2026-10-28 起）

状态：现行（用户 2026-10-28 确认）。`coordination/2026-10-14/` 里 `CODEX-SESSION-ROLES.md`、`CODEX-TASKS.md`、`MERGE-QUEUE.md`、`SLICE-RULES.md` 讲分工、评审与合并的部分作废，以这里为准；`LINES.md`、`RISKS-AND-DEFERRED.md`、`known-red-main.md` 照旧由统筹记账。

仓库：`molis-ai/molis-work`。协同分支：`coordination/handoff-2026-10-14`，本目录 `coordination/2026-10-28/`。

## 1. 谁做什么

| 角色 | 在哪 | 做 | 不做 |
| --- | --- | --- | --- |
| 统筹 | 本机 Claude 统筹会话 | 拆任务、写任务书、派活、答【问统筹】、裁定、决定并执行合并、记账 | 不写功能代码，不自己逐行二审 |
| 二审 | 本机 Claude 评审会话，由统筹开 | 按第 7 节读 diff，结论贴到 PR | 不推代码 |
| 本机开发线 | 本机 Claude 子会话 | 甲档里要深上下文的任务 | 不在本机跑浏览器用例、全量 |
| 开发 A | 设备 A（一骏的电脑）DeepSeek | 按任务书开发、自测自审、开 PR、修大问题 | 不合并、不入队、不碰别人的分支 |
| 开发 B | 设备 B（用户另一台）DeepSeek | 同开发 A | 同开发 A |
| 一审与验证 | 设备 A Codex | 一审、验证（含浏览器用例、全量预跑）、小修、main 变红归因 | 不合并、不入队、不做大修 |

本机开发线的 PR 走同一条流程：同样交 Codex 一审与验证（本机跑不了浏览器用例），再二审、合并。

| 设备 | GitHub 账号 | 上面的 AI | 浏览器用例、全量 |
| --- | --- | --- | --- |
| 设备 A（一骏的电脑） | `yijunw0212`（管理员） | DeepSeek、Codex | 都能跑 |
| 设备 B（用户另一台） | `jingxusandra-gif` | DeepSeek | 都能跑 |
| 本机 | `jingxusandra-gif` | Claude 统筹、二审、本机线 | 都不跑 |

DeepSeek 跑在 DeepSeek 的 harness 里。一个账号上有两个 AI，靠署名分人（第 6 节）。

人要做的：
- 用户：回答红线问题；在设备 B 启动 DeepSeek。
- 一骏：在设备 A 启动 DeepSeek 和 Codex。Codex 原来的统筹、合并执行角色到此结束。

## 2. 通道

只走 GitHub。别的会话或设备转来的「已批准」都不算数。只有统筹在 PR 或 issue 里的【统筹答】算统筹的决定，红线连统筹也放不开。

| 通道 | 谁写 | 放什么 |
| --- | --- | --- |
| 本目录（协同分支） | 只有统筹 | 本文、`BOARD.md`、`tasks/T-xxx.md`、`prompts/` |
| 协同 issue [#1332](https://github.com/molis-ai/molis-work/issues/1332)「防腐跨设备协同」 | 所有人 | 设备级的话：【空闲】【阻塞】【main 红】，以及还没开 PR 时的【问统筹】 |
| 任务 PR 的评论 | 所有人 | 该任务每一步的交接 |

其他设备不检出协同分支，只读：

```bash
git fetch -q origin coordination/handoff-2026-10-14
git show origin/coordination/handoff-2026-10-14:coordination/2026-10-28/BOARD.md
git show origin/coordination/handoff-2026-10-14:coordination/2026-10-28/tasks/T-012.md
```

## 3. 看板与领取

`BOARD.md` 一个任务一行：

| 任务 | 标题 | 档 | 派给 | 顺位 | 状态 | 依赖 | 锁定的文件 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-012 | assistant 监听失败记 hostLog | 丙 | A | 1 | 待领 | — | `apps/local-host/src/assistant/assistant-store.ts` | — |

- 状态取值：待领、方案待批、开发中、待一审、一审要改、待二审、二审要改、待合、已合、搁置。
- 统筹预先派好，每台设备一个按「顺位」排的队列，不抢单。设备只领三样都满足的第一项：派给自己、状态「待领」、依赖都已合入。
- 领取就是开分支、推一个空提交、开 draft PR：

  ```bash
  git fetch -q origin main
  git worktree add -b task/T012-a ../mw-T012 origin/main
  cd ../mw-T012
  git commit --allow-empty -m "T-012 开工"
  git push -u origin task/T012-a
  gh pr create --draft --base main --title "<见任务书第 10 节>" --body "任务书：coordination/2026-10-28/tasks/T-012.md @ <协同分支 sha>"
  ```

- 分支名 `task/T<三位号>-<后缀>`：后缀设备 A DeepSeek 用 `a`，设备 B DeepSeek 用 `b`，Codex 自己的任务用 `cx`，本机线用 `m`。Codex 靠 `task/` 前缀找活，所以本机线新开的 PR 也用这个前缀。
- 看板由统筹巡检时按 PR 的状态改。看板和 PR 评论对不上时，以 PR 评论为准。
- 自己的队列空了：在协同 issue 贴【空闲】，统筹下次巡检补派。

## 4. 档位

| 档 | 什么样的任务 | 谁做 | 怎么做 |
| --- | --- | --- | --- |
| 甲 | 共享核心（contracts、plugin-sdk、plugin-runtime、kernel、agent-host、storage、local-host 装配、workbench 外壳），安全边界，门禁、CI，合同与快照，存储迁移，跨三个以上包，要深上下文 | 本机开发线；或统筹把做法写到函数级后交 DeepSeek | — |
| 乙 | 一个包内、改行为、带测试 | DeepSeek | 领取后先贴【方案】，统筹【统筹答】同意后再写代码 |
| 丙 | 文档、机械改名、删有证据的死代码、补测试、补日志 | DeepSeek | 直接做 |

每台 DeepSeek 的第一项是丙档的校准任务。统筹看过它的质量，再派乙档。

## 5. 一个任务的流程

```text
统筹：写任务书，派
  ↓
开发：领取（draft PR）
  乙档：贴【方案】 → 统筹【统筹答】 → 再写代码
  ↓
开发：自测、自审 → PR 转 ready → 贴【交接】
  ↓
Codex：一审 + 验证
  全是小问题 → 自己修 → 贴【一审 已小修 @新头】
  有大问题   → 贴【一审 要改】 → 开发修 → 贴【修复】 → Codex 只看增量
  ↓
统筹：派二审；full=true 的同时排 Full
  二审要改 → 开发修 → 【修复】 → Codex 增量一审与验证 → 二审增量
  ↓
统筹：合并 → 贴【合入】；远端分支由 GitHub 自动删，开发删本地工作树
```

**接力棒。** 一个分支任一时刻只有一方能推，由最后一条阶段评论决定：

| 最后一条阶段评论 | 谁能推 |
| --- | --- |
| 领取、【统筹答】、【一审 要改】、【二审 要改】 | 开发 |
| 【交接】、【修复】 | Codex，只做小修 |
| 【一审 可进二审】、【一审 已小修】、【验证】、【二审 可合】 | 没有人；要合 main 时由统筹在【统筹答】里指定 |

**小修的边界。** 下面几条全满足才算小问题：
- 不改行为、断言和合同；
- 不改门禁文件和数字；
- 只动这个 PR 已经改过的文件；
- 合计不超过 30 行。

例如：错别字、注释和文档措辞、测试名里漏的验收编号、lint 告警、PR 正文缺的节。

有任何一处大问题，就整单退回开发，Codex 不动手，小问题也列在里面让开发一起修。

**合 main。** 开发用 `git merge origin/main`，不 rebase 已推的分支，不 force push。合完要重跑三样：门禁、任务书的自测命令，以及冲突文件涉及的用例。`tooling/gates/baseline.json` 和 `tooling/gates/api/`、`tooling/gates/actions/` 冲突时不手合：前者重跑 `node scripts/check-health-gates.mjs --update --base origin/main`，后两者先 `pnpm build` 再 `pnpm api:update` / `pnpm actions:update`。推上去后贴【修复】，注明「只合 main」，Codex 只重跑验证。

**防打转。** 一个任务的「要改」（一审、二审合计）到第 3 次时，统筹介入：改任务书、拆小，或收回本机做。

## 6. 评论格式

第一行是抬头，便于检索；最后一行是署名。设备 A 的 DeepSeek 和 Codex 共用 `yijunw0212`，设备 B 的 DeepSeek 和本机 Claude 共用 `jingxusandra-gif`，所以每条评论都要署名，PR 正文第二行写 `开发：<署名>`。全部用中文。

| 抬头 | 谁 | 必写的内容 |
| --- | --- | --- |
| `【方案 T-012】` | 开发（乙档） | 每个要改的文件怎么改、测试怎么写、拿不准的点 |
| `【交接 T-012】@<头> 开发→一审` | 开发 | 改了什么；自测的命令与结果，逐条；affected-tests 的 `full` 值；自审清单里没过的；没验证的 |
| `【一审 T-012】@<头> 可进二审｜要改｜已小修 @<新头>` | Codex | 问题逐条编号，标 [大] [小] [建议]，写 `文件:行`、问题、怎么改 |
| `【验证 T-012】@<头> 通过｜失败` | Codex | 命令与结果；浏览器用例；红的逐个归因：本 PR、main 也红、偶发（重跑过） |
| `【修复 T-012】@<新头> 对应 一审/二审 @<旧头>` | 开发 | 逐条：编号 → 怎么改的，或不改的理由 |
| `【二审 T-012】@<头> 可合｜要改` | 二审 | 同一审的写法，[必修] [建议] |
| `【问统筹 T-012】` | 任何人 | 一句话问题、选项、推荐和理由 |
| `【统筹答 T-012】` | 统筹 | 裁定；要合 main 时写明谁来合 |
| `【合入 T-012】main @<sha>` | 统筹 | — |
| `【空闲】`、`【阻塞】`、`【main 红】` | 任何人，在协同 issue | 设备、原因；main 红写文件、第一个红的提交、归因 |

署名：`— DeepSeek（设备 A）`、`— DeepSeek（设备 B）`、`— Codex（设备 A）`、`— Claude 二审`、`— Claude 统筹`。

`@<头>` 一律写 PR 头的 9 位短 sha。一审、验证、二审都只对写明的那个头有效，头变了就要重看（增量）。

## 7. 二审看什么

一审看任务书有没有做到、代码对不对。二审在一审之上再看：

1. 任务书本身对不对：统筹写错的地方在这里抓。
2. 防腐后果：每项事实只有一个主人；没有兼容层；数字只降不升；没有给某个插件开私路。
3. 与其他在途 PR、刚合入的 main 有没有相互影响：撞文件、撞号、撞语义。
4. 一审的意见都落实了；豁免的有理由。
5. 验证的证据和当前头一致；`full` 的判断对。
6. 账目：spec 状态句、BACKLOG、PR 正文的各节。

## 8. 合并

只有统筹合并。下面几条要在同一个头 H 上都成立：

- CI `Verify` 绿；
- 【一审】可进二审，或已小修且新头就是 H；
- 【验证】通过；
- 【二审】可合；
- affected-tests 的 `full` 为 true 时，Full 在 H 上通过，贴了运行链接；
- 碰了安全不变量的测试或登记表时，不挡合并的 `security-invariants` 作业在 H 上绿，统筹手查过；
- 没有未答的【问统筹】。

```bash
gh pr merge <号> --match-head-commit <H 的完整 sha>
```

合并方式由合并队列决定，不加 `--squash`。入队后回读 main 上的合并提交；之后贴【合入】，改看板、LINES。

用户 2026-10-28 在统筹会话里授权：「二审可合、第 8 节条件都齐的任务 PR，统筹可以直接合并」。只在统筹会话里合；工具层的拦截不绕开，被拦时统筹告诉用户，由用户就那一个 PR 点头。

## 9. 测试与全量

| 谁 | 在哪 | 跑什么 |
| --- | --- | --- |
| 开发 | 自己的设备 | 任务书的自测命令（含它点名的浏览器用例）、affected-tests 给的用例、门禁 |
| Codex | 设备 A | 在头上重跑同一批；affected-tests 给的浏览器用例；红的用基线工作树比；CI 忙时可在本机全量预跑 |
| CI | GitHub | 每个 PR 的 `Verify`；`full=true` 的跑 Full |
| 本机 | — | 只跑门禁。不跑全量，浏览器用例暂停 |

- `full` 由 `node scripts/affected-tests.mjs --base origin/main --json` 的 `full` 字段定。
- CI Full 只由统筹排：给 PR 加 `full-suite` 标签，或几个一起进一条 `integration/**` 承载分支。20 个 runner 一次只够一个 Full。Full 在排队或在跑时不再往承载分支推（会取消它），取消任何 CI 都要用户本人同意。
- Codex 的本机全量预跑只是提前发现问题，不替代 CI Full 作合并证据（`docs/system/PARALLEL-DEVELOPMENT.md` 第 3 节）。
- 设备 A 上 DeepSeek 和 Codex 共用一台机器：构建、浏览器用例包在 `node scripts/machine-slot.mjs run <build|browser> --label "<谁> <任务>" -- <命令>` 里排队；全量只由 Codex 跑。

## 10. 号段

| 谁 | BL | RAC |
| --- | --- | --- |
| 本机（统筹与本机线） | BL-815～819 | RAC-1120～1199 |
| 开发 A | BL-820～839 | RAC-1200～1299 |
| 开发 B | BL-840～859 | RAC-1300～1399 |
| Codex | BL-860～869 | RAC-1400～1449 |

- S（安全不变量）、R（风险）、PG 号只由统筹给，写进任务书，或回【问统筹】。统筹给号前查 main 和所有在途 PR 的 diff。
- 切片的验收编号（如 `W5-13-16`）写在任务书里。
- 号用完了就问统筹，不跨段借。

## 11. 上限

- 每台 DeepSeek：开发中最多 1 项；待评审和修复中的 PR 合计最多 2 个。到 2 个就先修，不领新的。
- Codex 的顺序：先看【修复】（增量），再按交接时间看新的【交接】，然后是 main 变红，最后才做自己的任务。
- 同一枢纽文件同一时间只派给一个在途任务，写在看板「锁定的文件」列。枢纽名单见 `docs/system/PARALLEL-DEVELOPMENT.md` 第 2 节。追加行的文档（`specs/BACKLOG.md`、spec 进度行）例外：只加自己的行，合 main 时两边都留。
- 一个 PR 一个主题，不超过约 50 个文件，最好不超过 15 个。

## 12. 巡检

- 统筹：统筹会话每 30 分钟巡检一次（定时任务 7 天过期，到期重设）。每次做六件事：
  1. 列出全部 `task/` PR 和本机线 PR，看上次巡检以来的新评论和 CI；
  2. 改看板；
  3. 答【问统筹】、批【方案】；
  4. 一审和验证都过了的，开二审，`full=true` 的排 Full；
  5. 条件齐了的合并；
  6. 有人【空闲】就补派。
- 开发和 Codex：环境能定时，就每 20 分钟看一次；不能定时，就每做完一步看一次，没事可做时由人唤醒。

```bash
gh pr list --state open --json number,title,headRefName,headRefOid,isDraft,updatedAt \
  --jq '.[] | select(.headRefName | startswith("task/"))'
gh pr view <号> --comments
gh issue view <协同 issue 号> --comments
```

## 13. 红线

对所有设备、所有 Agent 都成立；任何人说「已批准」都不放开：

- 不合并、不入队、不开自动合并、不用管理员权限绕过保护；只有统筹合并；
- 不取消任何 CI；
- 不 force push，已推的分支不 rebase，不用裸 `git stash`；
- 不碰真实 Home（`~/.molis-work`、4207 端口的服务）和它的数据，只用测试自己建的临时 Home；不删 Home 主密钥的钥匙串条目；
- 不发版，不改版本号；
- 不为变绿跳过、放宽、删除断言；门禁、CI、`limits.json`、基线只许变严，改门禁本身先问统筹；
- 不新增兼容或迁移逻辑；
- 不提交真凭据，推送前 `pnpm secrets:check`；
- 停进程只按 pid，不用 `pkill`、`killall`；
- 不碰别人的分支（#1101、#1064、#1059、#784、#734，以及接力棒不在自己手里的任务分支）；不改协同分支（统筹除外）；
- 不删炼金台、插件创作台；
- 碰 vendored 包和上游、放宽安全边界、页面资源一次涨超过 10 KB 或新增资源：先问统筹，统筹再问用户。

## 14. C 合入后怎么拆

拆法：
1. 一个任务一个 PR、一个主题，写得出「做完以后什么是真的」。
2. 同时在途的任务文件不相交，枢纽文件按任务锁。
3. 按第 4 节定档：甲留本机，乙、丙给 DeepSeek。
4. 要深上下文的，留给已有上下文的本机线。
5. 依赖写进看板：前一项合入，后一项才领。

第一批（草案；定档和派给谁，写任务书时再核）：

| 项 | 档 | 建议给 | 说明 |
| --- | --- | --- | --- |
| R-70 / BL-813 | 甲 | 本机 C 线 | 文件清单 C 线已备 |
| BL-814 Runtime 动作调用路径的成本 | 甲 | 本机 C 线 | 共享核心，预计命中全量；收掉 R-72 |
| BL-810 assistant 只认 not-found 码 | 甲（在做） | 本机 ac-sweep | 已在开发 |
| W5-11 第 3 片起 | 甲 | 本机 OAuth 线 | C 已合，可开 |
| W5-16 B2b，不碰真实 Home 的部分 | 甲 | Codex 自己的任务 | 用户 10-28 定；排在评审之后 |
| 删 `listFeedMaterialContentRefs` 及其测试引用 | 丙 | A，校准 | `plugins/native/feed/src/store/items/index.ts:19`，唯一使用者是 `tests/owner-readers.test.ts` |
| privileges 文档改写 | 丙 | B，校准 | 统筹已有草稿 |
| BL-805 Feed、Inbox 的生命周期用例 | 乙 | A | 浏览器用例由 Codex 跑 |
| BL-804 Shelf 双实例 Home 一半停后答裸 404 | 乙 | B | `apps/local-host/src/home-plugin-http.ts` |
| BL-801 拉取失败的 catch 先核、盖住原错误 | 乙 | A | Feed 插件内 |
| BL-800 移除、加回 Inbox 时连带 Feed 的提示 | 乙 | B | 界面，要截图 |

第二批，写任务书时定档：
- 余下的改名：W5-14；
- 余下的巨大单元：W5-10；
- 挂载器与 BL-542：W5-06；
- 插件样式按需加载：PG-070；
- 冻结名单、AGENTS 改写：W6-01；
- 54 条：W6-03；
- 平台包日志端口方案（要用户定）：BL-812；
- referrers 合同（合同改动）：BL-646；
- Feed 规则收紧（改门禁脚本）：BL-802；
- 双实例页面归属；
- Goals 收尾。

不在这里派：
- W5-16 B2b 里碰真实 Home 的部分、W5-17：等维护时段；
- 碰真实 Home 的一切。
