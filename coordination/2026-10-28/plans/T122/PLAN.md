# T122 当前组合独立工程补证计划

结论：当前main的三份目标完整文件尚未取得可直接核抵的独立Mac完整原件。找到T346的旧Mac Home集成6/6×两头，但其生产输入在T134之后已经变化，不能将它搬成当前组合6/6。建议根先批准当前固定main上一棵隔离树、一次匹配构建及完整 `sandbox-integration-home.test.ts` 六例作为第一份probe；成功后按同一匹配树接另外两完整文件。不新跑通用notes probe，不重演旧大批或Full。此文仅计划与证据核查，未建树、build/test或改源码。

负责人：Codex验证线3，只读准备。2026-10-31本轮GitHub main API与本地origin/main均为 `77f4fd172a380648535ac0f101bb2d6c8654c1bd`，tree=`3cb7aa56dbad61d21340788b3f5df86f83cbc4d4`。后续授权和执行绑定此头；若根选更新main，先窄核相关输入再更新绑定，不静默改头。主检出内容不能代替origin/main对象，本计划源码判断均以冻结Git对象为准。

## 1. 已有原件与核抵裁定

已读正式T-122、T-141任务书，main BL530 slice §7.3，t122-doc-closeout/REPORT与相关证据，t134-sync-20261031已存测试/选择记录，以及t346-probe-pair和t346-remaining-pair的报告、隔离脚本、原始Home日志/result。#1696是文档采用，不是新Mac执行。

| 来源 | 实际证明 | 当前核抵结论 |
| --- | --- | --- |
| T134正式6542996661、等价核6545745870、main §7.3 | Linux call-connections 6/8、sandbox-integration 5/9、Home 0/6；Full排除三完整文件 | 不能把2/4/6项skip签绿；已执行非Mac部分与采用结论保原来源 |
| #1295正文/旧评审 | config字节修复、队列修复及当时Home6/6已采用 | 证明历史修复及采用，不跨过后来call-control/T134输入变化签当前全部通过 |
| `/private/tmp/t346-probe-pair` B/H各1/1 | notes包真实签名、安装、调用、重启链；隔离路线可行 | 可参考隔离方法，不是T122三个文件的结果，也不需要为本单再跑一次notes probe |
| `/private/tmp/t346-remaining-pair/{B,H}/sandbox-integration-home.test.log`及对应result | B=`4b73d807142456edb4b363a5d5a3ad2472da1fff`、H=`b4f7e598e62d290de0606b3f718e39ab97213845`，每头真实完整6/6、无skip/retry，独立构建指纹、Darwin arm64/Node24.14/ABI137 | 有效历史Mac证据，不能整体抵当前：测试blob相同，但Home→registry attach新增可信installId/declarer，Sandbox proxy→CallConnection新增install_id，Host请求增加连接pin检查；真实主调用输入已变 |
| T346其余十文件/115计数 | 其他安装、生命周期等各自原头结果 | 没有call-connections或sandbox-integration两目标文件，不借总数填缺 |
| T134 S104正式采用证据 | 连接声明者、同名另一安装拒绝/零请求等原安全文件 | 继续按原接受范围沿用，不为补三文件机械重跑全T134矩阵；不能替三份沙箱组合运行 |

本轮没有找到后T134当前等价输入的三目标Mac全文件原件。此结论限于上述正式来源和本机相关任务证据目录，不声称全盘/所有会话从未跑过；若根持有更近原件，可先按头、调用链、匹配产物和完整日志核抵，再删对应待跑项。

与T134采用daa8→当前main的13路径窄diff不再完全空：home-installed-plugins多了T401页面投影，connector-connection-declarers测试多了事务回滚断言（T367）；其它11路径相同。前者不改变本三文件的source集成核心，但文档旧“13文件无diff”仅对其dc544读取时点成立。与T346 H→当前的真实关键差异记录在 `t346-to-main.patch`，逐blob在 `inputs.json`；另存 `t134-to-main.patch`。不从相同测试文本推出相同生产输入。

## 2. 三完整文件、依赖与边界

| 完整文件 | 当前结构/主要缺口 | 实际依赖与副作用 |
| --- | --- | --- |
| `tests/sandbox-integration-home.test.ts` | 当前6例全Mac：真实签source预览/确认、来源API、冲突/抢占拒绝、停用/重启、RAC1001-QUEUE真等待 | fixtures home-sandbox/test-home/sandbox-package/home-runtime/connector-control；公开Host/actions→pluginInstallService→Home installed/runtime→registry attach/detach→SandboxRunner。Node crypto临时Ed25519签包并真实pin/安装，真实临时SQLite/file秘密和本机随机HTTP；CODE只返回本地事件，不请求外部，不调用模型。origins JSON不等DOM展示 |
| `tests/sandbox-integration.test.ts` | 当前9例，4项Mac真实runner：poll/cursor/信号草稿、非法返回整轮拒、无call connection拒、stop/revoke晚调用拒；5项普通Node含RAC895-CONFIG | 公共包解析、manifest/contracts、IntegrationRegistry、sandboxIntegrationContribution/Definition、CallConnectionsClient、真实Seatbelt runner；此文件直接构造bundle/runner，不能称全部走签名安装。请求端口是原文件stand-in，只本地返回；无厂商请求 |
| `tests/security-invariants-call-connections.test.ts` | 当前8例，2项Mac：真实broker refresh在用户cancel与runner.stop后的不同写回语义，另含slot、来源、DNS后current拒绝 | CallConnectionsClient→SandboxBroker/runner→createCallConnectionsPort→真实TLS transport/OAuth resolver→临时protocol/connection/file-secret。openssl生成临时自签TLS密钥，127.0.0.1随机端口，lookup/testServer将github.com/api.github.com等逻辑主机明确指向本机，global fetch被原断言拒绝。不是登录GitHub、不接真实账号。取消保已发refresh轮换凭据但不写配置/业务；stop不保存回答；二者不可混写成统一零凭据写入 |

预期完整计数分别6、9、8，计数仅帮助核日志，不新增固定数量门禁；实际以全部当前测试名、断言与fail/skip/cancel/retry为准。不得只筛Linux跳过的12项，也不能把混合文件拆成去掉OAuth的替代文件。

三份均是Node集成测试，**不需要Chrome**。仍按协调约定全部占公共browser槽；“browser槽”不意味着启动浏览器。不得为此调用日常Chrome/个人profile。T141未来DOM新增用例才需要专用Chrome，不能提前拿这三份充当视觉证据。

## 3. 执行前隔离合同（需根后续派发）

采用t346-probe-pair已证明的方法，重建本次独立输入，不复制旧输出。自有detached worktree准确M，一份新临时系统用户目录及各文件独立测试Home；不动主检出、原作者树、#1101/#1064/#1059/#784/#734/#1324、真实~/.molis-work/4207、账号配置或凭据。

- 用子进程环境空字典allowlist，不改统筹shell的HOME。固定已验证Node绝对路径 `/Users/yijunwang/.nvm/versions/node/v24.14.0/bin/node`、同目录pnpm；执行时只查版本/ABI/实际路径，不读私人配置。该Node本轮尚未执行核验，不能把旧24.14输出写成本轮结果。
- 新任务范围内设置HOME、CFFIXED_USER_HOME、Node TMPDIR、XDG_CONFIG_HOME/CACHE_HOME/DATA_HOME/STATE_HOME、CLANG_MODULE_CACHE_PATH/SWIFT_MODULECACHE_PATH、MOLIS_WORK_HOME；npm user/global config=/dev/null，GIT_CONFIG_NOSYSTEM=1、GIT_CONFIG_GLOBAL=/dev/null、GIT_TERMINAL_PROMPT=0。file SecretStore，空MOLIS_WORK_ENCRYPTION_KEY/MOLIS_WORK_SECRET_KEY；不继承模型、OAuth、API token、代理、用户Node启动选项。可读既有离线公共包缓存，不读npm登录配置。
- 安装/首次构建起即 `MOLIS_HELPER_SIGNING_IDENTITY=-`。当前build.sh先读显式identity，只有空值才security find-identity；因此采用现有adhoc分支，不查询Keychain，不改脚本。Node crypto签名测试包与macOS helper adhoc是两件事，不能用adhoc替签名信任安装断言。
- 构建前只用路径信息探针确认Node os.homedir/tmpdir及Foundation NSHomeDirectory/Library/Caches/Application Support落在本次目录，路径比较先realpath。不读取其配置内容/钥匙。T346已证Foundation NSTemporaryDirectory仍为OS用户临时目录；必须如实记录，不能宣称全系统临时目录隔离。三文件Home/包/stage使用Node tmpdir，均不执行原生Computer helper操作；编译过程系统临时目录限制单列。如本次实际路径逃出隔离的用户配置范围则停依赖步骤。
- 公共machine-slot用全机共享TMPDIR排队，进入槽后再切本次Node TMPDIR，不能在私有TMPDIR造另一把锁；整个机器一个build与一个browser批次。先offline frozen安装，再按需要整体pnpm build；已有准确M、同源码与有效产物匹配证据能核抵才省构建，不借作者不明dist。
- 测试前后核准确HEAD/tree/dirty、Node/ABI、lock与manifest；用公开computeBuildSourceDigest核当前源码=构建manifest。Runner本身对子进程使用env={}和真实sandbox-exec/seatbeltProfile，不改profile/argv/worker，不用fake executor替代。原fixture completeText:null，无模型调用；不启动真实厂商连接/登录/额度测量。

## 4. 最小第一份probe与后续顺序

建议根先批准仅：自有准确M隔离准备、必要匹配构建、**完整Home集成6例一次**。理由是它直接覆盖T122真实签包、激活、队列和重启链，且旧T346同名文件已有可靠安全环境原件可对照；另造notes probe只会多一次无关运行。第一份通过后仍不把另外两文件/12项全部签绿。

以下命令均须在上述受控子环境内运行，不能直接粘贴到继承日常环境的shell：

```sh
MOLIS_HELPER_SIGNING_IDENTITY=- node scripts/machine-slot.mjs run build --label 'T122 current build' -- pnpm build
node scripts/machine-slot.mjs run browser --label 'T122 Home integration probe' -- node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose tests/sandbox-integration-home.test.ts
```

仅根批准后执行。若第一份成功且根授权继续，同一匹配树依次完整一次sandbox-integration、call-connections；每文件单独保stdout/stderr/退出码和阶段结果，在前份失败时不自动跑后一份。第一份只获准时就报告结果等待下一明确派发，不能按本计划自行扩批。原T218/shared-refresh旧会话HOLD是待核具体操作的历史记录，不当泛禁；本次call-connections确实覆盖真实refresh分支，根授权应明确完整文件及本机TLS/临时凭据边界，不能借Home文件授权自动跑它。

没有源码变化，不新增变异/先红要求；没有实际失败，不造干净基线第二树。第一份失败时先报告准确失败和已到阶段，由根决定是否需要同条件B/H对照或最小诊断；不自动换Node、换设备、改沙箱或反复试跑。后两份成功及现有S104证据核抵后，按T122原验收表逐项结算；此处不追加原任务书所有七文件或Full。

## 5. 失败取证与清理

执行前将命令、准确头/tree、构建摘要、工具版本、有限allowlist、目标文件原blob写到自有证据目录；日志保存完整进程stdout/stderr，不只截尾。成功/失败均保每case结果、总pass/fail/skip/cancel/todo、退出码、超时与重试次数、实际最后阶段（预览/确认/运行/注册/拉取/队列/关闭），不记录临时secret值或签名私钥。

当前SandboxRunner的child.stderr只计字节，exit没有保存code/signal细节，stage退出后清理；因此普通日志不一定含底层Seatbelt/dyld原因。若只得sandbox.process_exit/start_failed，明确原生stderr/exit signal UNKNOWN，不能归因“环境”。可先读原已输出错误及本次临时Home的公开安装状态/last_error_code（若尚在且已有端口可读），不读真实Home；fixture已清理则如实记录不可取。不得为了留现场私改fixture finally、延迟cleanup或加产品观测；如证据不足，交根批准下一最小取证方案。

本次进程组/pid精确收束，释放所有原测试deferred/Host/HTTP/TLS/sandbox句柄；按测试已有finally及t.after运行。测试退出后核本任务路径/进程归属，无残留再删自有worktree、用户配置/缓存和临时Home，只留脱敏日志/报告。失败时先保存可得原件再清理，不按Chrome/node名称批杀其他会话，不扫描或保留秘密库内容。

## 6. T141承接与T122不能被删除的范围

| 项目 | T141合同 | T122当前处理 |
| --- | --- | --- |
| 初装/升级精确HTTPS origins真实设置DOM、取消零变更 | RAC2619明确完整承接，新增真实签source浏览器文件 | 完全交T141，不在T122并行写UI；API origins不结清BL691/PG046 |
| Home source v1→v2保安装ID/数据、声明刷新、来源变化确认、失败补偿、停用态/重启 | RAC2615～2618及registry刷新，完整sandbox-integration-home列为必需 | T141会再次运行并扩充该完整文件；若未来实际准确等价组合证据先到，可核抵，不能提前认定已完成。当前六例初装/冲突/队列/停用/重启仍属T122接受范围 |
| UTF8 config恰好/超限、沙箱非法pull整轮拒、call结束/stop/revoke拒绝 | 不因T141升级合同自动完整覆盖sandbox-integration原9例 | 保留T122当前组合证据责任；完整Home6绿不等这4项Mac绿 |
| source slot、精确origin、DNS后authority、真实broker cancel/stop refresh写回 | T141未要求完整call-connections作为必跑，不是其升级主验收 | T122不能因未来T141而删当前2项Mac缺口；必须当前有效原件或定向完整文件结果 |
| 另一发布者/安装不能继承连接，零请求/令牌副作用 | T141须保持T134并验升级身份不漂移 | 既有S104独立采用证据继续核抵；未来升级测试不倒填当前沙箱组合，也不强制重跑T134全矩阵 |

BL692撞ID原因展示、BL693真实源额度/超时、BL694外部document_import、PG045统一取钥均另片；本计划不实现、不申请真实账号，也不通过关闭这些后续宣称T122全产品完成。

本轮交付仅本PLAN、三份冻结测试文本、inputs.json和两份窄diff。未读取真实Home/key/账号配置，未执行路径probe/模型/厂商请求，未建工作树、修改refs、build/test或任何源码/GH/coord写入。后续最小实际补验待根明确批准与派发。
