# W6-05 原场景8：隔离Host正常重启子步的最小执行合同

状态：只读准备完成，**未执行、待根给E和开始命令**。负责人：独立验证线1（Codex）。不新增任务号/验收号，不签整个场景8。复用 `/private/tmp/w6-final-execution/PLAN.md` 的范围/分账，只具体化原 `specs/archive/post-merge-review/spec.md` §5第8行的无模型重启子步，不重写总方案。

## 冻结准备输入与开始条件

本次仅读Git对象：本地origin/main=`b6f92222fce89dfba756a580768889292cfe9967`（下称P），不是执行终点E，也未查服务器moving main。原场景8要求“工作含状态、待办、搜索结果、所在面重启后恢复”；其真实模型跟进、Coding确认卡中断、后台回报仍另列。

必须等根明确：①完整E SHA及允许使用的隔离checkout/匹配构建；②本子步开始命令；③场景7释放本机browser槽、涉及同一构建产物时也释放build窗口。场景7仍独立执行，不复做权限/移动；场景5等待T377采用，不在此跑导航/分屏矩阵。**T377不是本子步整段的自动全局前置**：只在根选E的实际diff影响本链或入口无法避开时等具体采用，不借本合同提前验收其notice/重挂载。

拿到E只核P→E影响本链的实际差异和既有构建绑定；未变部分沿用这里的入口定位。E/构建不匹配先交具体缺口，不启动未经允许构建。根授权执行后才允许创建一个本目录的一次性驱动（只编排真实进程/浏览器/公开HTTP，不入库，不形成框架）；本轮没有生成或运行驱动。

## 当前支持到哪里（P源码依据）

| 对象 | 本子步可实际形成并读回的现行状态 | 不能偷换的承诺 |
| --- | --- | --- |
| 助理工作 | 无模型从真实页面发送会真实返回400/assistant.model_missing，details.work保留work_id/draft；公开works读可取回。依据tests/assistant-error-recovery.e2e.test.ts:23–40及assistant-send-journey.ts的公开入口。 | 不配置真实模型或替身，不继续“修复模型后发送”。不是已开始/完成的模型工作，不构造虚假运行轮次。 |
| 待办 | Todo quick entry先解析/预览，点击提交才创建；todo.items.create/get/list及对应GET/POST /items路由已有，成功创建有id/revision/history。依据todo.e2e.test.ts、todo/src/actions.ts、manifest.ts:37–48。 | Todo详情会自动保存，不能把“输入后没点保存”一律称待确认写入。 |
| 搜索 | 全局搜索经生产/api/search/*→search.query/open，命中有真实对象引用、revision和打开位置；重启后重查同一个待办。 | 搜索结果是派生查询，不承诺弹层/查询文字跨重启持久；不以缓存结果当Owner仍存在。 |
| 页面所在面 | tab-workspace.ts:99读取浏览器localStorage布局，tab-workspace-panes.ts负责保存；助理当前work选择也有独立客户端便利状态。 | 浏览器状态归同origin/profile，不归Home数据库；不是服务器恢复所有UI状态。不能手写localStorage或URL强制openPlugin来伪造恢复。 |
| 待确认写入 | 目前本无模型链能自然停在**Todo quick预览尚未提交**；这是本地输入意图，不是已派发的业务命令。可用唯一预览标题证明重启后没有自动创建。 | 没有从本链核到可无模型自然产生的真实Coding写文件确认卡。不得手工插review/work状态、伪造pending DTO，或借纯projectRecovery函数声称“需要核对/不会自动重放”已实操。 |

`tests/coding-recovery.test.ts`只调用projectRecovery；`cross-plugin-recovery.e2e.test.ts`涵盖旧记录/Shelf草稿等，并未按本次Host pid重启。文件名字或原通过数均不抵本子步。

## 唯一真实链（一次正常restart，不加故障矩阵）

用一个全新自有Home、一个项目、一个已提交待办、一个无模型工作、一个未提交quick预览。只用合成中文标记，不接账号、不导真实数据、不使用模型替身。所有对象带同一短随机标记Q，防止搜索命中其他对象。

1. **起独立Host子进程与浏览器。** 使用E整体构建的 `node <E树>/dist/web/server.js --home <本次Home> --port 0`（根tsconfig rootDir=apps/desktop/launchers，产物入口为dist/web/server.js）。捕获自己spawn返回的pid、cwd、Home和stdout实际loopback地址。P的launcher支持SIGTERM/SIGINT关闭，禁止默认4173/4207。通过现有public test-kit LocalHostHttpClient读取本Home控制令牌，使用项目设置公开createProject/addProjectPlugin（最小只启Todo），不直接写Catalog/SQLite。test-home.ts仅复用装配/协议方法，不能用openGoalBrowser的自动mkdtemp/seed替代同Home真实子进程重启。
2. **真实UI建状态。** ChromeHarness+专用test Chrome打开该项目canonical根路径；用产品按钮/CDP鼠标键盘输入，Todo quick创建`Q 已保存待办`，确认成功HTTP/Owner GET返回id、title、revision、status。助理输入`Q 无模型重启工作`并发送；只读CDP Network取真实400响应的details.work_id，公开GET works读回draft、精确state与rounds，不预造状态枚举。没有模型配置、没有成功模型轮次；遇非model_missing先报实际输入/环境，不换模型求绿。
3. **查找并打开同一对象。** 通过生产全局搜索入口（global-search.ts的data-global-search/dialog/results；实际点击或产品快捷键）搜索Q，读真实search返回的todo对象id/打开位置，点击同一命中打开。核UI的待办title/id与Owner GET相同。只要求目标命中与打开，不比较无关来源排名；若仍partial/indexing保留状态，在既有有界等待内等目标，未到则记具体失败，不加超时或造索引数据。
4. **记录重启前与未提交意图。** 再用Todo quick框输入`Q 未提交待办`，只观察预览，不点提交、不让它走create。公开list/search确认此标题未生成对象，记录已保存todo条数/id/revision/history与work状态/draft/rounds；截图/只读DOM记录当前所在面和已打开对象。保持同一Chrome/profile；布局只由实际UI产生，不setAttribute改状态、不dispatch伪产品事件、不写localStorage、IndexedDB、JSON或SQL。quick预览是否持久不是保证项，预先不强行要求刷新后原样保留。
5. **只停本次Host pid。** driver用捕获的子进程句柄send SIGTERM一次并等待exit与监听口关闭；不得按进程名/端口批杀。此合同只验证正常shutdown/restart，不加SIGKILL或未决请求切点。停止失败立即保留日志交根；不向未知pid发信号。Chrome及同profile保持，Host退出期间不点击任何提交/重试，也不缓存写请求等重放。
6. **同Home、同端口重新启动。** 用同E、同构建、同Home，`--port <首轮实际端口>`启动唯一新Host子进程。必须同origin才能比较浏览器本地布局；若端口被别的进程占用，停止依赖步骤报根，不杀它、不换新origin后仍声称布局丢失或恢复。等新pid与实际监听就绪。
7. **先Owner再UI回读。** 新Host公开GET同work_id、同todo_id和list，核工作draft/持久state及rounds没有额外执行，todo的title/status/revision/history没有自动改动、没有重复对象，`Q 未提交待办`仍不存在。再导航/刷新canonical项目根（不给openPlugin/openItem恢复提示），只读观察保存的面/对象是否回来；若URL自带显式打开参数，单列“链接定位”而不能当布局恢复。原Q搜索重新发送真实query、点击同一todo，Owner与UI同id/内容；不能拿停服前DOM或搜索缓存当读回。记录窗口console/pageerror，基线已有噪声逐条保留。
8. **终态清理。** 保存原始响应/截图/退出记录后关闭本次Chrome并等exit/profile清理，再对第二个自有Host句柄SIGTERM并等exit；关闭本次所有公开client连接，不留额外打开SQLite句柄。确认仅本次pid/临时目录；按根的保留证据要求删除本次OS HOME/TMP/Home/profile，失败时先保留证据位置。不得删其他会话树/用户服务。

这是一次短链，不补场景7移动/权限、不跑场景5前后退/分屏，不为“完整恢复”额外加Pages文档或日历/调度对象。这里“页面状态”是所在面/对象，**不是Pages插件正文版本**；后者原场景2已有独立Owner验证要求。

## 隔离与执行入口合同

根开始后，外层只启动一个driver并持有公共browser槽：

`node scripts/machine-slot.mjs run browser --label 'W6 scene8 <E短头>' -- node <一次性driver> --repo <E匹配树> --home <本次Home>`

driver串行一次、jobs=1/retries=0，无全量/整批测试；不是当前已存在可运行命令，本轮未创建driver。驱动用E公共`@molis-ai/molis-work-test-kit/browser`和`/local-host-http`，不更改共享fixtures或生产实现。根若选已有测试执行器承载一次性驱动，也必须原样保留上述子进程/同origin/同Home合同，不把in-process host.close代替pid重启。

进程环境用独立临时system HOME、TMPDIR及MOLIS_WORK_HOME，file secret backend、`MOLIS_HELPER_SIGNING_IDENTITY=-`、`MOLIS_WORK_TEST_CHROME=~/.local/bin/molis-test-browser`。白名单环境不给个人模型/API/OAuth变量，不读取用户.env/Keychain/已有模型配置；Molis与Chrome资料均全新。DOM evaluate仅用于读字段/状态/截图辅助，不写表单值/浏览器存储模拟操作；输入用真实CDP鼠标/键盘。HTTP写只允许上述公开项目设置及真实UI发出的业务请求，Owner核算走公开GET，不直写Store。

正常产品boot可能初始化空Home自己的平台存储；这不作为Memory验收，也不人为清Memory表避开启动。不开Memory设置/动作/检索、不注入Memory资料，不调用restore。如果E正常启动实际跨进受HOLD动态链或需要迁移/模型/保护分支，先给根具体调用链，依赖步骤停住，不能以“临时Home”绕禁。

## 证据与完成边界

执行后只交同目录一份REPORT及必要原件：E/tree/构建绑定、两个自有Host pid/启动退出及同Home同origin、关键公开响应/对象id/revision、重启前后UI截图/DOM读数、搜索新请求、待提交标题未生成对象、异常/cleanup。可在一份报告内按步骤记通过/失败/未执行，不建新状态manifest、框架或测试矩阵。不以相同schema、逻辑单测或记录文件存在证明实操成功。

本子步通过最多可签：**E上无模型无Memory合成工作/已提交待办/目标搜索与所测页面状态，经一次自有Host正常pid重启回读；未提交Todo quick意图未自动变成对象**。若布局或草稿某项不恢复，按真实Owner合同报告，不能临时新加产品恢复机制。

仍明确未执行/不抵扣：SIGKILL崩溃恢复、真正待确认写入的中断与“需要核对/结果未确认”状态、真实Coding确认卡和磁盘零误写、真实模型一次性跟进/触发/结果、后台任务回报、完整snapshot restore及Memory恢复、真实Home正常升级和用户体验认可。Todo预览未提交不是Coding确认卡，正常restart不是restore；不因本子步绿把整场景8或W6-05标完成。

开始前的唯一等待项仍是根给E/开始命令和相关公共槽释放；没有请求真实模型或Memory解禁，因为它们不在本子步。若以后需要那些缺口，应由根另给对应输入与授权，不能从本PLAN推导。

## 根执行裁定（2026-11-01 00:20Z）

已核收并授权执行正常Host重启子步，E=b6f92222f，只读复用场景7的匹配构建；使用全新自有Home/profile/driver及白名单系统HOME/CFFIXED_USER_HOME/XDG/TMP。经公共browser槽等待场景7释放，两个自有pid各一次SIGTERM，同Home/同origin，真实UI及重启后新查询读回。准备期driver.goto调用错误保留、不计产品故障，修正后继续既有授权；无重建/额外故障矩阵或Memory/模型/restore。最终局部结论须准确绑定E，不能签整个场景8。
