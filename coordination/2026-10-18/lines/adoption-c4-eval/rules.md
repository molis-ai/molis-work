#### C4 Molis 半边：工具自己说清的用法不再写在 Coding 的提示词里（2026-10-18）

判定规则在第一次调用之前写下并经统筹确认，单独作为一笔提交；结果在下面另记。

```text
改动：只删不加。
  plugins/native/coding/src/roles.ts 的 coding-base 升 v12（#697 的 v11 之上）：
    删「找文件用 list 查看目录，或直接 read 已知路径；search 只在文件内容里找文字，按文件名搜不到、返回 (no matches) 都不
    代表文件不存在。」——search 的说明（Prologue #43）写着 "It does not match file names, so "(no matches)" does not mean
    a file is absent; to find a file by name, list the directories that may hold it."
    删同一份里的「（大文件用 offset、limit 读一段行）」——read 的说明写着 "Files over 64 KB cannot be read whole: pass
    offset and limit to read a window of lines."。这一行其余不动：不用 cat、grep（命令要审查）、不用 sed -i（绕过差异
    预览）是 Molis 的理由，SDK 没写。
  horizontal/agent-host/src/adapters/prologue-run.ts 的子角色说明删「子任务带着所选角色列出的工具；dispatch-subagent 的 tools
    不会让它多一个或少一个，可以写 []。」——dispatch-subagent 的 tools 说明（Prologue #42）写着 "A character that declares
    its tools gets exactly those whatever this list says, so [] is fine"。角色名单和每个角色的 tools= 留着。这段宿主文字
    没有自己的版本。
  ask-user 那行不动：#46 只补了 id 的格式。
要解决的问题：清单 C4（手册线 ai-handbook-agent-design.md §8-1）。工具的用法归工具的主人（手册 13.1）；Prologue #42、#43 已把
  这几句写进工具说明，随 #699 的包进来，Molis 这边成了第二份。
比什么：改前＝main（#697、#699 都合入之后，coding-base v11），改后＝本分支（v12，宿主那句删掉）。两版用同一份 vendored SDK
  （after-write-check，Prologue 94ee1ea4），只差上面的文字。改前的 coding 与 agent-host 两个包构建进被忽略的
  node_modules/.eval-before，开跑前核对两版的 coding-base 版本号和子角色说明。
环境：MiniMax / MiniMax-M3，anthropic-messages。每次一个进程，构建出来的 AgentHost + createPrologueNodeAdapter，用 Coding 的
  codingAgentManifest 与 codingPrompts 起一轮，不带方法；让出之后照 Coding 的唤醒循环（openWait / wakeBodyOf）开下一轮，
  最多 4 轮，整次 8 分钟封顶。不建 Home，密钥只在命令上内联读取、只交给 resolveCredential。审查由脚本代答：派出与工具操作批准，
  写文件拒绝；命令只批准只读的 ls、cat、pwd、find、head、tail、wc、grep，其余拒绝并记下（三题都只读，coding-reader 没有命令）。
任务（每次一个新的临时项目）：
  T1 按文件名找文件（coding-reader：coding-base + coding-reader，工具 read、list、search）。项目有三层目录、十来个文件；
    src/net/policies/retry-policy.js 的内容是 MAX_ATTEMPTS = 7 和 BACKOFF_MS = 250，没有一个文件的内容含 retry（脚本建完
    项目先核对）。题目：「项目里有一个文件名带 retry 的文件，它规定最多试几次？告诉我文件路径和那个次数。」
    答对＝最后一轮的回复写出 retry-policy.js 和 7（程序判）。回复里同时有「不存在／找不到」的，逐条人读，写出读的结论。
  T2 读大文件的一段（coding-reader）。logs/orders.log 3000 行、约 150 KB（超过 64 KB），每行一个日期时间、一个订单号
    ORD-xxxxx（固定种子生成，订单号互不相同，行里没有行号）。题目：「logs/orders.log 第 2400 行记的是哪个订单号？」
    答对＝最后一轮的回复写出第 2400 行（从 1 数）的订单号。只写了第 2399 或 2401 行的、没有第 2400 行的，另记「差一行」，
    也算没答对。
  T3 点名角色派子任务（coordinator），BL-151 的 T3 原题：「请派一个代码调查子任务看看 src/parse.js 导出了哪些函数，告诉我
    函数名。」答对＝一个 coding-reader 子任务开出并结束，且最后一轮的回复同时写出 parseDate 和 parseAmount。
次数：三题各 8 次 × 两版，共 48 次；第 r 轮按 T1、T2、T3 跑，r 为偶数先改前、奇数先改后。正式开跑前冒烟一次（T3 改后），
  只验脚本、不计入结果；脚本要改，开跑前交统筹。
判定（统筹 10-18 定）：三题各管一句——T1 管 search 那句，T2 管 offset、limit 那半句，T3 管宿主那句。
  某题「答对」改后 ≥ 改前 − 1：删它管的那句。
  某题改后比改前少 2 次以上：照实记下；那条工具说明（search、read 或 dispatch-subagent）补强归 Prologue，给 Prologue 开一个
    PR（统筹审过即合）；Molis 这句这次先留着，等带上那个 PR 的下一次换包时一起删，记在本节当作有期限的待办。不在 Molis 里
    改写或加句子。
照实记录、不作为条件：
  T1：调没调 search、搜了什么、是否落空；落空后是 list 下去、放弃还是说文件不存在；list 与 read 的次数。
  T2：每次 read 的 offset、limit；第一次不带 offset 读是否因为超过 64 KB 被拒；是否用 search 找。
  T3：每次派出的 tools 写法（空、恰好是角色清单、少了、多了，多了的列出名字）；派出被拒的错误码与原文
    （TOOL_ARGUMENTS_INVALID、CHARACTER_ESCALATION 或别的）；让出、后台、前台。
  三题都记：ask-user 次数、模型调用数、轮数、token、用时、系统文字长度。
出错（统筹 10-18 补）：与模型怎样答无关的失败（Provider 5xx/429、网络、请求超时、整次 8 分钟封顶）照实记下，那一次重跑、不计入，
  同一格最多再跑 3 次；重跑的次数与每次的原因写进结果。与这些无关的失败（模型自己的错、运行出错）算没答对。每条没答对的逐条标
  「设计问题 / 模型能力 / 拿不准」，设计问题写清主人。
记录：48 次的原始结果（每次答了什么、tools 怎么写、错误码、重跑）放进统筹共享笔记 adoption-c4-results.md，spec 里只写汇总与判定。
```
