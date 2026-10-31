# T122 当前组合补证独立二审

**结论：接受已采用实现的当前组合工程核收，无当前 Blocker/P1。** 原任务书 §2.3、§5 指定的三文件 Mac 补证已由验证线3在准确冻结头完整执行；结合可沿用的 T134 独立证据，当前约定的工程缺口已补齐。没有源码修复需要，也不需要本轮重跑、造变异或扩大矩阵。

本结论绑定 **`77f4fd172a380648535ac0f101bb2d6c8654c1bd`**，tree=`3cb7aa56dbad61d21340788b3f5df86f83cbc4d4`。仅接受本书允许的分层证据与已采用实现的当前组合；不签后来 main 的任意变化。**整单书面关闭仍等根将同 slice 两份最小状态更新实际采用**；#1696 仅是前次文档采用，不能当作本次运行。

负责人：Codex 二审线4。本轮只读任务书、PLAN/REPORT、execution 原件、冻结 Git 对象、现行三测试及相关生产输入、T134 原独立验证/采用记录；只新增本报告。未 build/test/browser、未改仓库/coord/GH/refs，未代验证线3署执行。

## 1. 运行证据有效性

三份原 stdout/stderr 的逐 case 行、汇总和 outer exit 与各 result JSON 一致：

| 完整文件 | 验证线3本次实际结果 | 主要覆盖 |
| --- | --- | --- |
| tests/sandbox-integration-home.test.ts | 6/6，exit0 | 真实签名包公开API预览/确认、Home安装/登记/拉取、冲突和确认前抢占、停用/启用/卸载、Host重启、RAC-1001-QUEUE |
| tests/sandbox-integration.test.ts | 9/9，exit0 | 格式/来源、UTF-8 config边界、真实runner拉取/游标/事件和signal draft、非法结果整轮拒、临时连接缺失、stop/revoke后旧调用拒绝 |
| tests/security-invariants-call-connections.test.ts | 8/8，exit0 | slot/read-only/来源/服务/调用结束/DNS后current、真实broker与本机TLS refresh的cancel/stop分支 |

合计 **23/23**，每份 fail/cancelled/skipped/todo=0；完整文件、jobs1/retries0、无name筛选。脚本顺序为 Home→integration→connections，前份 exit0 才允许后份。每个外层命令经共享系统 TMPDIR 的公共 browser 槽；没有 Chrome，browser 是槽名。

本线从 Git 独立复算并核对：

- head/tree 正确；锁文件 SHA256=`750c45694af6d8d31271a8d8b4493a41a0d4d37fbc3035d1bbd512670de9ad02`，与执行记录相同。
- 三测试 blob 分别为 `b3cfababb95c2c091222dc92979b64bf675933ed`、`ebdc2879d6bec0da373e7cc6335a1ee1ba55ec57`、`fa0a5b320c192fd41c50a746ab2f2c5e98501f3c`。保存的三份测试文本也逐字节等于 H 对象，没有剪裁后冒称原文件。
- `run-stage.py` 从空环境 allowlist 建隔离目录，固定 H、要求执行前树干净；三次测试前实际调用公开 `computeBuildSourceDigest`，必须等于构建 manifest 才运行。日志三次均记录 `6c87c8169b59b765060a3148941b8e6e13ecab0b2e0ee6ad861ffe98c2e4c3e8`；manifest 时间为 `2026-10-31T22:57:13.750Z`。本线核其执行脚本与原日志，未重新计算已清理树的 fingerprint。
- 独立树 frozen/offline install、整体build均exit0，build原日志确有63包构建及根产物完成，耗时约129.7秒，保留4条xterm warning。不是只运行单包或借旧dist。
- 实际Node v24.14.0/ABI137、darwin/arm64；首次构建即adhoc，file secrets、独立HOME/CFFIXED/XDG/Node TMPDIR。Foundation的NSTemporaryDirectory仍是系统临时目录，原件明确false，报告没有掩去这一限制。
- 三次结束git status均空；final-binding与cleanup记录自有进程为空、独立树和任务临时目录已清理。没有为了取证保留私钥/秘密库内容。

原件：[运行脚本](/private/tmp/t122-runtime-verify/run-stage.py)、[Home日志](/private/tmp/t122-runtime-verify/execution/home.log)、[integration日志](/private/tmp/t122-runtime-verify/execution/integration.log)、[connections日志](/private/tmp/t122-runtime-verify/execution/connections.log)、[build日志](/private/tmp/t122-runtime-verify/execution/build.log)、[最终绑定](/private/tmp/t122-runtime-verify/execution/final-binding.json)、[清理](/private/tmp/t122-runtime-verify/execution/cleanup.json)。计数来自原日志，不只相信final-binding摘要。

## 2. 对原 §2.3 / §5 的逐项核收

| 原要求 | 裁决与具体证据 | 不可扩大成的结论 |
| --- | --- | --- |
| 合法签名source安装、API预览/确认、代码不在Host执行 | **通过，当前H实跑。** Home文件36–61行实际生成临时发布者并 `signPluginPackage`，通过公开action client预览/确认；70–90行核Home范围、pinned/sandbox安装记录、登记owner、pull事件和Host全局标记未出现。 | origins断言是API JSON，不是设置页DOM或人已看见来源。 |
| 伪来源/非法形状、冲突ID/预览后抢占拒，零安装副作用 | **通过，当前H分层实跑。** integration文件69–114行走公共包读取/Manifest规则拒错误形状和HTTP/IP/本机/路径/通配来源；Home文件92–109行走真实签包安装API拒冲突、无包保存/无pin/无新安装，并保持既有owner。 | 形状负例未逐项重新签包走安装；不把解析层负例改写为每一例都经过验签安装。 |
| config序列化UTF-8恰限/超限且沙箱零调用 | **通过，当前H实跑。** RAC-895-CONFIG独立构造中文补齐与ASCII边界，核字节恰限、超限拒绝码、calls=0。生产 `sandbox-integration.ts:43–45` 先JSON.stringify再UTF-8 byteLength，拒绝发生在bind。 | 不是以字符串长度或fixture可解析替代字节行为。 |
| 拉取→游标/事件→信号、非法返回整轮拒 | **通过到当前片的代理/adapter合同层。** Home真签包得到events；integration文件161–198行经真实runner与生产proxy核cursor/events及 `signal_adapter.toSignalDraft(...).kind`，非法items/cursor/重复ID/URL/schema/数量均整轮拒。生产proxy先pullResult整体验证，再交SDK唯一polling adapter；失败不能返回一半events。 | 本次没有真实Feed信号库落盘或页面显示断言；不能写成真签包带凭据拉取后在Feed落盘可见的单体端到端实操。原书的当前片工程核收采用其明确允许的分层证据，不据此关闭产品后续。 |
| attach/detach真实队列交错，旧清理不撤新注册 | **通过，当前H实跑。** RAC-1001-QUEUE用真实registry.enable等待，不替换tail；包装attach只观察、仍调原函数。disable/enable交错后实际outcomes=[false,true]，新source可pull，最终disable再排空队列无声明。生产Home缓存registry Promise/激活token，registry attach/detach共用tail且队列内问live。 | 不是两个顺序mock返回值或仅“最后running”快照。 |
| 停用拒绝、再启用、卸载保人的连接、Host重启恢复 | **通过，当前H真签包路径。** Home文件112–137行分别核HTTP disable/enable/uninstall后pull拒绝/恢复、服务卡片登记消失而人的连接保留，Host close后释放ID、同Home重开从保存包恢复可pull。 | 未做T141就地升级或来源变更确认。卡片登记存在/消失不是视觉卡片验收。 |
| 调用临时source槽、来源/服务匹配、结束失效、不交凭据/id到sandbox | **通过，当前H分层实跑＋现行代码核对。** connections完整文件拒错slot/record key/写请求/release、结束或DNS等待后失效不发送；Host真实TLS端口核origin/service/state、脱敏响应和describe。proxy输入只交source_id/config_json/has_connection，连接ID和credential_ref不进入operation输入；Runtime返回describe白名单字段。 | request stand-in和直接构造runner不是签名安装；无真实厂商登录/账号。 |
| cancel/revoke/stop之后无迟到业务结果或后续请求 | **通过，按各自合同保留差异。** RAC-2464在stop开始和context revoke后拒旧poll且发送0；真实broker refresh两例均先等TLS refresh已经发出，再cancel/stop，等Host请求结束后查持久结果。proxy/SDK adapter返回前再次beforeEffect/current，调用终结abort其临时连接。 | 不可笼统写成“所有取消后凭据也零写入”，详见下一节。也不是重演Host关闭时所有外部服务组合。 |
| T134另一发布者/安装不得接管旧连接，零请求/令牌泄露 | **沿原已采用独立证据核收，不算本次23的新执行。** S104完整安全文件及发送前安装pin检查相关实现未变；原RAC-2524/2526有HTTP新建连接、元数据attach换声明者、真实TLS拒绝与请求数不增加，并有本人连接成功正控。当前生产usableConnection在取令牌/sendThrough前拒错install_id。 | 原S104使用元数据attach/直接Host port，不是签名source worker完整拒绝链。不能把新Home签包成功与旧port拒绝拼写成一条新单体实测。 |
| 当前工程证据、采用状态和开放后续分别记录 | **工程证据可采用；文档状态更新仍待根实施并采用。** 当前报告可替换“这三份当前Mac未执行”的状态；旧Linux skip与旧执行来源不倒填。 | #1696和本报告都不等于两份新状态文字已进入main，更不关闭PG046/BL691整条。 |

“信号”部分的明确层次：生产 `sandboxIntegrationContribution` 调 SDK `pollingIntegrationBinding`，当前测试实际调用其 signal adapter，已经超过“函数存在/fixture可解析”。其有效结论是本片输出给Feed的事件/信号草稿合同和拒绝行为；没有新增Feed持久化或视觉体验证明。本报告不要求无源码变更的核收任务为此另造大矩阵，也不把该局限隐藏为完整产品通过。

## 3. cancel 与 stop 必须分别记账

`security-invariants-call-connections.test.ts` 的两个真实broker案例共用本机TLS/OAuth resolver，但控制原因不同，断言也不同：

| 事件 | 已发refresh传输 | 回答的持久写回 | 后续业务 |
| --- | --- | --- | --- |
| 用户cancel，RAC-1085 | 不因该caller取消而断掉已发请求；测试核tokenAbandoned=false、exchanges=1 | 仅保存轮换access/refresh/expiry，client secret不变；protocol configuration与connection.updated_at不变 | 原poll拒绝，第二个数据请求不发；取消不是refresh失败 |
| runner.stop，RAC-2463 | 同样保留已发传输，不把停止描述成服务没收到 | 保存的凭据全集、配置、connection.updated_at均保持原值，回答不写回 | 原poll拒绝，第二个数据请求不发 |

测试真实等待refresh入口并释放回答，最后 `await Promise.all(requests)` 后查秘密存储及SQLite配置，避免只看到runner先拒绝就过早签零写回。调用通过原production runner/broker/Host port/transport；外部主机逻辑名经fixture lookup/testServer到127.0.0.1随机TLS端口，且global fetch被断言禁止。临时自签证书、测试包Ed25519签名、helper adhoc属于不同用途，不互相替代信任证明。

## 4. T134原证据的沿用范围

已核原独立[执行进展6540228810](https://github.com/molis-ai/molis-work/pull/1649#issuecomment-6540228810)、[正式验证6542996661](https://github.com/molis-ai/molis-work/pull/1649#issuecomment-6542996661)及[合main等价采用6545745870](https://github.com/molis-ai/molis-work/pull/1649#issuecomment-6545745870)。原0bb五完整文件56/56中包含S104安全文件10/10；这是原验证owner的记录，本线没有重新运行或把其数字加进23。Full的Linux选择/跳过与原物理执行边界继续原样。

本线从原0bb以及采用提交 `daa8fd23c5698f644d89c4bd47a3ae6fc9612c62` 分别对当前H重算既定13路径差异：都仅有 `home-installed-plugins.ts` 新增T401页面投影、`connector-connection-declarers.test.ts` 新增T367事务/秘密库补偿断言；其余11路径相同。实际patch与验证线保存的t134-to-main.patch一致。页面投影排除integration，不改变本source装配/身份链；T367是额外测试断言，本次不签其独立新结论。S104安全测试自身、连接pin/Host发送前拒绝等核心输入未变；另核相关contract、test-home/sandbox-package/connector-control fixture与T134采用输入无diff。

由此允许沿用原S104的精确拒绝范围，不需要再跑T134全矩阵。不是宣称全树依赖相同；本轮新的三文件匹配构建执行正是补后来组合的Mac路径。T346旧B/H Home6/6、#1295历史6/6及T134 Linux的6/8、5/9、0/6继续保留各自头与来源，本次不能倒填它们的skip或改写历史HOLD归因。

## 5. 交根的最小状态结算

可以据实际证据把同一BL530 slice/PG046 slice内“当前三份Mac未独立运行”的陈述更新为：验证线3在H匹配构建、完整文件23/23；config/队列已采用实现的当前工程核收通过，并引用本报告。旧“13/13相同”只属于dc544的历史读取点，本次准确口径是上述11相同、2项已解释差异，不把旧快照当当前。

继续开放：T141初装/升级origins真实设置DOM、来源变更确认、Home source升级/失败补偿；整条PG046/BL691；BL692/693/694、PG045及真实外部服务额度/超时、最终App和本人验收。本次无新Full/CI，不把23或原Full写成这些后续通过。

**本轮必须返工项：无。未提出无证据P2。** 根随后按已交接范围串行更新两份文档并实际采用后，才可完成本任务的书面销账；本报告本身不越过该最后步骤。

— Codex，T122独立只读二审，2026-10-31
