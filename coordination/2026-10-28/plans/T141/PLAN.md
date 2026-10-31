# T-141 完整开工方案（开发 owner：线1接续；只读方案修订2最终修订）

状态：方案准备，未实现/未验证，**未Ready**。本次全文采纳 INDEPENDENT-REVIEW.md，只修本工程书及 /private/tmp 候选；没有产品代码、build/test/浏览器、refs/GH写入或真实Home操作。生产链依据现成 `717d14f2ab8c9cb1b447003fabb120a70b6d9dd3` 树及独立审查已核的同文件 `2bd444b45e1809c4bad6776dfc62d96e049ad442` 差异说明，不冒充当前全仓核对。T134/T140/T401/T330已合事实保留；#1701按根最新交接已真实合 `4b2f971a`，其测试锁解除，新RAC2447断言保留。**#1672 registry及T143 Home重叠文件仍WAIT**，根逐文件串行交接后才可实施，不交app-only完成片。

目标是同一个T141在隔离Home中功能可用：Home app和已支持source签名包，同发布者、递增版本、范围不变，经真实预览/确认升级，实际安装ID和业务数据保留；新版本运行、批准和提示词生效，禁用状态保留；失败恢复原一致状态；source新声明/来源实际刷新；真实设置DOM初装/升级预览、取消和确认均闭环。用户本人验收、真实Home、PG011整体及BL916不在本片结算。full=true，独立验证和二审另人执行。

## 1. 当前生产链与最小改法

| 边界/路径 | 当前事实 | 实施方案与不变量 |
| --- | --- | --- |
| `plugin-install-service.ts:preview/confirm` | preview验签、parse、scope/free检查后仅在内存持有preview；返回runtime_scope、声明与integration origins。confirm先一次性消费，检查actor/project/TTL/consent、范围、集成占用、pin，再查实际安装。Home同发布者也提前state_invalid | 只去掉Home一律拒绝分支及旧说明。保留真实owner、id命名空间、publisher、scope检查；同publisher且present时沿用assertUpgradeOf，确认版本严格增加且compatible_from_versions包含当前版本后才pin/save/切换。身份、范围、版本等确认预检拒绝时pin/save/包文件/安装/批准/数据/提示词/连接不变；合法v2已save后才发生的切换/expose失败，要求运行和授权一致恢复，不要求删除已合法保存的v2包。预览不是授权安装，取消不调用confirm。 |
| `home-installed-plugins.ts:installPackage` | 当前record存在便拒绝；已装release/批准/Runtime/提示词/密钥上下文已给共用installedLifecycle | 从`recordFor(release.pluginId)`实际有效记录选择`upgrade`或`install`，同一个lifecycle完成；不接受输入宣称升级。保留T401 pages/navigation。禁用包仍禁用；quarantined、撤销发布者、包不可读沿共用现行拒绝。 |
| `installed-plugin-lifecycle.ts / installed-plugin-version.ts` | upgradePackage复核pin/可信/状态/当前包/批准/版本；changeInstalledVersion由Runtime切版本，检查install_id、installation_generation、Supervisor世代/版本/digest/state，stage/apply密钥、写批准、expose、registerPrompts；失败时restore密钥、内部rollback旧定义、旧批准/expose/prompts，补偿失败AggregateError | 先原样复用。Home升级不新增版本算法，不删除内部补偿。用户主动rollback保持Home和project拒绝。只有真实测试证明现有Home上下文无法满足时才列具体最小条件改动并交根，不预先改这些文件。 |
| `home-installed-plugins.ts:expose` | app经exposeActions；source从实际Runtime取installId，新的token/live包住当前实例，再调用registry.attach；upgrade没有先withdraw/detach | 保留该顺序，不在Home升级处另拆detach→attach。失败后共用expose(earlier)恢复旧token/贡献；关闭/停用使live失效，队列里晚attach不得复活。测试要核实际install_id，而非只比plugin_id。 |
| **`integration-registry.ts:attach`（锁）** | 同一tail队列任务内parse/live；attached已有时直接换contribution并返回，旧declarations不刷新 | 根放锁后，在原任务内parse/live→完整`this.assertFree(parsed)`，含Host id、带数据OAuth拒绝、Declarations全部冲突；检查失败不release旧占用、不替换entry。成功后同步release旧声明→declare新声明→set新entry，三步间无await。同plugin_id占用可由同真实Home安装升级复用，另publisher/安装由前面可信Runtime/confirm拒绝；测试覆盖installId固定、不让另安装/发布者接管T134连接。新增路径如果发现不能由现有可信调用保证，先报根，不自行弱化owner检查。 |
| `integration-declarations.ts` | assertFree忽略同plugin_id占用，拒他人service/integration/document_source；declare已登记会早退 | 不改此文件；registry在预检后复用release/declare同步刷新，不能绕过完整assertFree。source以外新document_import/OAuth声明能力不在本片。 |
| `settings-plugins.ts:load/review` | current仅存项目data.plugins；home.plugins取后只画列表。review只从current找旧版本，未画已有preview.origins；真实input File→preview→DOM→confirm已存在 | load保留Home列表；review按shown.runtime_scope选择旧记录，显示原中英文旧/新版本与数据保留说明。初装与升级都逐service显示title、service_id及**精确HTTPS origin字符串**，用现有DOM textContent/el方法，不拼不可信HTML。取消清review，不发confirm；确认使用该preview_id且仅一次按钮在途。成功reload取新事实；失败保留可理解错误与当前安装事实，重新预览再试。项目预览和原权限/声明/jobs展示保留。必要新译文只加plugin-trust-en。 |

签名v2须在签名前同时更新manifest及签名payload，并声明正确`upgrade_compatibility.compatible_from_versions`；不在签名后改manifest，不拿坏签名/缺compatibility当首红。公开动作/API/manifest合同形状保持。

## 2. 允许修改与共享候选

解锁后必需源码：`apps/local-host/src/plugin-install-service.ts`、`home-installed-plugins.ts`、**`integration-registry.ts`**、`apps/workbench/src/settings-plugins.ts`；必要翻译`apps/workbench/src/i18n/plugin-trust-en.ts`。条件源码version/lifecycle/sandbox-integration/Declarations先不动。密钥层采用测试子进程内的真实依赖包装，不为测试修改`home-plugins.ts`或追加factory返回值；现有生产封装保持。确切fixture、built模块加载顺序与import门禁见第6节及secret-control-design.md，仍仅候选、不运行。

明确测试写范围（不是仅“必跑”）：`tests/home-installed-plugins.test.ts`、`security-invariants-sandbox-home-instance.test.ts`、`security-invariants-plugin-install.test.ts`、`plugin-trust-view.test.ts`、`installed-plugin-host.test.ts`、`sandbox-integration-home.test.ts`；新增最小登记回归放现有`tests/integration-registry.test.ts`。真实浏览器确切文件：**`tests/plugin-trust-home-upgrade.e2e.test.ts`**。密钥层由installed-plugin-host完整文件启动唯一新子进程fixture **`tests/fixtures/home-upgrade-lifecycle.mjs`**；其内先注册同步load包装，再动态加载公开Host及现有签包fixture。

source v1/v2包当前helper是sandbox-integration-home文件私有函数；浏览器需要同款真实包。建议一份小fixture **`tests/fixtures/home-upgrade-source.ts`**，只构造source manifest/contract/code并在签名前变更version/service/origins，用既有newPublisher/payloadOf/signPluginPackage；两个测试文件共用。app复用sandbox-package的signedPackage回调，按例声明runtime/compatibility/提示词等。不改被#1675占用的home-sandbox共享fixture，不引入通用生成框架。此新fixture路径随方案交根核范围。

共享文档与门禁只交精确候选，由根串行采用：SI仅S80/S84及实际涉及的S95/S104分句；accepted slice仅§3状态/证据与D1适用说明；必要README只加具体必跑文件；`giant-exceptions.json`仅openHomeInstalledPlugins实测size及原cohesive-unit理由的准确增量，不硬拆/压行绕过；page-assets完整build后served实测，能省先省，按现行准入交根，不预写预计0增长/许可。单资源>10KB或新资源先交根。privileges/BACKLOG、共享baseline由根处理，不用改baseline放大数字。#1101/#1059等保护分支不操作。

## 3. 场景和测试矩阵

不固定case数量；每条使用RAC编号或原编号标注，完整文件保留原拒绝与副作用检查。

| 编号/文件 | 准备、输入与预期 | 错实现时必须抓到 |
| --- | --- | --- |
| RAC2615 / home-installed | 临时发布者签v1 app，公开preview/confirm安装；真实动作写业务数据；签compatible v2，确认升级；实际Runtime install_id/安装世代沿用，数据可读，真实操作返回v2标志，新提示词可用而旧提示词退出；重开同临时Home后仍v2 | 仍Home拒升级、偷偷新安装、数据丢失、旧定义/提示词残留、重启回v1 |
| 原RAC1505–1507 / home-installed | RAC1505签前构造compatible v2公开升级成功；RAC1506再次提交当前v2精确upgrade_required（不是用v1冒充同版）；RAC1507成功前后及同版拒绝后完整快照、原安装/数据/后续操作保留；允许版本批准的预期变化 | 不把三个编号整体删掉，不让成功遮蔽非法同版拒绝 |
| RAC2615 / home-installed或installed-host | v1禁用，确认compatible v2，版本更新但保持disabled，不启动不expose；enable后v2；restart仍disabled另核 | 默认启用、提示词错误启用、隐式运行 |
| RAC2615-FAIL / home-installed | 有效v2在真实runner启动阶段有可识别故障；从公开确认进入；确认失败必须证明故障点被到达，v1实际可调用、数据/安装/批准/提示词还原，可重新预览正常v2再成功 | 基线只早拒导致没到故障点；运行失败留下混合状态 |
| RAC2615-COMP / sandbox-integration-home | 真实v1 source→v2；在当前Home registry.attach对v2注入一次明确expose故障（after真实Runtime切换），而非手工替产品detach；失败后核旧Runtime版本、旧source声明/origins、旧服务与绑定pull、批准/提示词一致，移除故障后重试成功 | 只回版本不恢复声明、批准或旧调用；假fixture失败被当补偿证据 |
| RAC2615-SOURCE / sandbox-integration-home | 正常source v1→v2（改服务/来源），真实preview/confirm、真实runner/pull。registry当前services/integrations/origins更新，移除的旧声明释放，v2返回版本标志；restart重建v2声明；实际install_id延续 | attach只换contribution旧声明仍在、UI成功但旧source运行 |
| RAC2615-QUEUE / registry + source原完整文件 | 复用deferred制造真实registry队列等待，升级attach与disable/close/re-enable交错；live=false任务不替换；v1旧bound pull晚回执在切换/撤权后拒绝，不写新业务；释放阻塞后采用当前世代 | 旧实例复活/晚回执写新事实。保留RAC1001-QUEUE原交错，不重写超时取绿 |
| RAC2616 / sandbox-home-instance + plugin-install | 同id另一发布者、id路径冲突；预览后被他人占用的confirm再检查。旧安装/数据/批准/pin/包目录/源声明/连接都不变，候选未启动 | 升级错误只忽略plugin_id导致接管；拒绝后有持久副作用 |
| RAC2617 / plugin-install + installed-host | same/lower版本及缺compatible_from_versions拒绝；v1继续工作；Home/project用户rollback仍拒 | 放宽升级规则、借内部补偿放开用户rollback |
| RAC2618 / sandbox-home-instance | Home→project、project→Home拒绝；无第二实例、跨范围批准或新包保存 | 只检查当前作用域记录漏查持久scope |
| 原RAC1682/1683 | RAC1682 service harness改为running/disabled合法新版正确调Home端口与save，不能代Runtime未启动证明；RAC1683自己新版成功与b/c另publisher精确拒绝分开，原RAC1500/1501/1504的无pin/save/数据变化及v1动作先核后再升级 | 为绿色删掉真实零副作用检查 |
| RAC2615-REG / integration-registry | 直接生产attach(v1)→attach(v2)，不得手动detach；新增/移除/同id改origins可见，declare刷新。冲突v2同队列拒绝，旧entry/occupancy/contribution不变；他人/platform/OAuth-data冲突仍拒 | 用单个Declarations.assertFree代替完整registry检查；预检前释放旧占用 |
| RAC2619 / plugin-trust-home-upgrade.e2e | 真实settings选初装source包，实际可见service/title/精确origins；取消后无pin/save/install/registry变更；再选确认安装v1；选改来源v2，DOM显示Home旧/新版本与新origin；取消仍v1/旧ID/数据/声明；重选确认后列表v2、真实pull v2/新声明，刷新页面再核；额外项目包预览保持原升级提示 | JSON有origins但DOM不画、拿项目列表做Home旧版本、取消发confirm、toast假成功、来源未变 |
| plugin-trust-view / 局部 | 新DOM片段的转义、空origins、多个service精确展示，中英文加载 | 仅局部view不冒RAC2619真实浏览器证据 |

主成功和一个真实失败补偿先在实施前main红：预期红在Home旧拒绝或故障点未到达，必须记录真实断言/错误；registry stale与浏览器缺来源/旧版本提示也先观察相应缺口。若红在签名/兼容/fixture错误，修fixture后重新取有效红，不算目标红。

最小变异候选随最终实现逐处对应：恢复confirm拒绝或Home入口误用install→RAC2615红；registry恢复attached早退→新来源/移除声明断言红；跳过完整预检或提前release→冲突旧占用断言红；settings忽略home列表/不画origins→真实DOM红。共用version/lifecycle若未改不重演旧变异；新增补偿改动则选恰当故障测试实际咬住。每次匹配重建、源码还原比对后绿；不为凑数量造变异。

## 4. 真实设置浏览器与隔离执行链

新文件优先`serveHomeRuntime(t,{completeText:null})`（真实desktop HTTP composition）或等价显式null的openTestHome+serveTestHost，创建新项目供设置页作用域，Host/HTTP随机127.0.0.1端口。使用公共`ChromeHarness.start(ownTmp,{executable:validatedDedicatedPath})`，新profile；导航**该真实Host** `/projects/<id>/settings/plugins`，无mock HTTP/preview、无手写review DOM。

包文件只写自有tmp，由CDP `DOM.getDocument/querySelector`找实际`[data-plugin-trust-pick]`，`DOM.setFileInputFiles`给它本地签包文件，触发产品File读取/公开preview；取消/确认用test-kit真实click/Input事件，pin label用输入。读取可见元素innerText/布局可见性，逐地址比字符串，不能只查隐藏HTML。确认后的事实通过公开列表/实际Home Runtime/registry bind+pull和业务动作读取，DB只能辅助证明不变量，不直接写入代安装。项目预览可在同页选scope=project包对照，签名且实际preview返回，不mockfetch。

父进程启动测试Node**之前**创建临时系统Home、MolisHome与config/cache范围，构造显式允许环境（必要PATH/系统工具路径、共享槽协议保持），不展开继承真实模型/账号token/登录配置/NODE_OPTIONS自动注入；仅fixture凭据。`MOLIS_WORK_SECRET_BACKEND=file`、空加密env、Host completeText:null/本地替身。默认runner只改MolisHome，不代表系统Home隔离。执行前仅打印路径与布尔判定，不读凭据：`os.homedir()`、配置/cache实际解析须在自有范围；如链真的进入Foundation，以最小路径解析核实际nativeHome/cache，不能假设HOME env覆盖passwd/Foundation。若原生路径不受控，停该依赖报根，不用真实目录补跑。

fixture签名为Node crypto即时Ed25519→生产signPluginPackage→验签/真实SandboxRunner，与系统证书不同。首次构建起MOLIS_HELPER_SIGNING_IDENTITY=-，helper build.sh跳过security find-identity；不启动computer权限操作。runner仍原Seatbelt/profile/worker参数，worker env空；不降沙箱或替换假runner。声明的HTTPS origins仅测试值，health/poll固定返回，不访问该外部域名/账号。

启动前确认专用wrapper及其headless-shell实际可执行且定位结果为显式路径，直接向ChromeHarness传executable；无效就失败报根，绝不允许locate回退`/Applications/Google Chrome.app`。Chrome parent env同样隔离；公共test-kit新profile、随机调试端口。所有Host/server/browser/runner在finally/t.after等待关闭，异常取消也收束本次pid/group并删除自有Home/profile/stage；不按进程名杀、不改TMPDIR来绕machine-slot。

旧B会话HOLD的记录按原来源保持NOT RUN/UNKNOWN，并非当前隔离签名测试的一概禁令。本轮后续按根已有本地测试授权，在上述环境核清后执行完整文件；找到针对具体操作的当前直接禁令或真实拒绝则停该依赖交根，不扩大为全线禁令。Linux整文件排除/mac例skip须实报，不拿Full绿替代真实Darwin升级或RAC2619。

## 5. 实施顺序、命令与交付

1. 根采修订任务书、核定测试内依赖包装及新增fixture/测试写路径，并逐文件释放/串行交接#1672及T143 Home重叠锁；#1701已合不再WAIT但保留其新断言，刷新新鲜main/在途锁和适用包README，独立树领取；本PLAN不操作refs。锁未解期间完成同一全范围方案，不能宣布Ready或交app-only完成片。
2. 核v1/v2包兼容和实际隔离路径，写主成功/失败补偿/登记/DOM用例，旧main取有效红；不使用真实Home或真实发布者钥。
3. 按confirm→Home lifecycle→registry同步刷新→settings DOM顺序实施完整路径；只在具体测试暴露确需补偿缺口时修改条件文件。新源码/合同变化先回同一书，不自扩schema。
4. frozen offline install；公共build槽整体`pnpm build`（adhoc配置从首次即生效）。定向测试公共browser槽，`node scripts/run-tests.mjs --jobs 1 --retries 0 <明确完整文件列表>`；六原文件+registry+新browser按独立批次列日志。不带name-pattern、不裁mac例。受影响README/selector建议先按真实差集与已有效证据核抵，超必要集合先给根具体文件/理由，不本机Full。安全改动对应原集合和SI候选；build/health --base/boundary/资源/secrets按最终头执行，不能用快查baseline自证。
5. 逐RAC交输入/返回/持久记录/外部副作用/后续调用与恢复结果、实际source/build头、首红/绿/变异、skip/retry/失败。异常保留首个case、stack和runner诊断，不把泛化crashed未经定位归环境。
6. 共享文档/giant/assets只交精确候选供根串行；根验候选后形成最终组合build/测量。推前fetch→secrets、旧CI终态、一次普通push按根派发执行；GH发布、Full、二审和采用归根。完成BL711不自动关闭PG011/BL916。

## 6. 密钥输入层：隔离子进程包装真实生产factory（根核定后实施）

公开confirm保持preview_id/consent/pin_label；Home installPackage只传consent:true，空输入不能证明stage/apply/restore。公开升级、真实DOM与密钥值受控依赖测试共同覆盖完整T141；原mapping.md全部保留。

撤回新增生产控制API及factory追加secrets/approvedFor返回值的候选。准确测试接线只有一个：`tests/installed-plugin-host.test.ts`启动隔离Node子进程`tests/fixtures/home-upgrade-lifecycle.mjs`，该fixture只静态import Node内置模块，先用`node:module.registerHooks`注册同步load包装；然后动态import既有公开Host/kernel包及sandbox-package fixture。目标是Host真实导入的`apps/local-host/dist/installed-plugin-lifecycle.js`同一URL，不import一份真实模块再mock、不加query/data副本。

load先调用nextLoad，保留真实源码和所有导出，只在该目标源码末尾把已导出的installedLifecycle函数binding包一层：以原context调用原factory一次，捕获context和原返回lifecycle并原样返回。仅捕获，不执行stage/apply/restore、不吞错误、不改Runtime/沙箱/批准库/secret adapter/补偿。捕获槽仅存在该子进程，由同步hook与模块同realm共享，finally清除并deregister。v1由正常Host入口安装；v2受控层调捕获的同一lifecycle，传replacement/fresh。用真实`~home`文件adapter和批准/Runtime事实核同一安装身份与唯一Home controller，不能以wrapper次数替代业务证据。

现有installed-plugin-host静态加载Host，所以不能在父测试体里迟注册。新fixture不得预加载任何应用模块；若目标未命中、捕获0或>1、上下文不属自有Home则明确失败并给根加载链，不改成private字段或生产公开端口。registerHooks的API/加载时机有Node官方文档依据，实际Node/tsx/ESM循环协作尚未运行，不能写已可用。

门禁按实际代码：refs.mjs/parse.mjs只计字面量import/export/import()/require()进入包src/dist；新fixture起点0。它只用Node内置导入、应用公开包名及既有测试fixture，显式built URL作为load匹配目标而非动态import；不增加任何包内部import，不把computed import用于躲计数。该方法仍是明确的内部built依赖拦截，门禁不测其语义，不能称完全公开端到端。实施后必须跑真实import检查和merge-base health，不改门禁/基线/生产导出来通过；现阶段无实测通过结论。

密钥成功、未声明输入拒绝、apply后真实inspect失败恢复、disabled及disable→enable保护、较新直接值编辑条件恢复均保留原场景，不加新矩阵。existing constructor.inspect先取真实snapshot，在实际v2/密钥apply/批准已写后进入deferred。**disable→enable：先观察旧升级拒绝→等entered→真实disable→启动enable并立即观察其拒绝→等真实v2 provider重新登记事件→释放原inspect屏障→await enable和旧升级收束→核最终较新状态**；不先await enable，否则会等同一catalogPending。finally先release，再收尾所有pending和Host。真实屏障到达、完整读回和清理细节在secret-control-design.md。这里的“provider登记事件”仅指测试child对真实service.registerProvider的透传观察：先bind原方法，停用完成后arm观察；包装调用bound原方法，在真实登记成功且匹配本安装v2时通知deferred，并原样返回原方法给出的同一disposer；不替代真实登记，不存在生产订阅API。

新source签前构包fixture仍为tests/fixtures/home-upgrade-source.ts；不装包、不造假runner、不改home-sandbox.ts。RAC1505/1506同版/1507快照、1682/1683沿用mapping.md，无需重做已闭合项。

## 7. source原子性、锁与交付约束（落实独立REVIEW）

#1672 integration-registry.ts继续WAIT。#1701已合4b2f971a，tests/integration-registry.test.ts锁解除，RAC2447另一document_source holder零start/零contribution/仍可bind断言必须保留。T143 Home接线/fixture文件仍WAIT：至少本单必改home-installed-plugins.ts与其同持有Home文件逐文件交接；home-sandbox.ts仍不改，accepted总slice只交§3候选。T143原指令接线及新broker.ts修复均不由T141重写，不能因撤回home-plugins控制API便认定无重叠。准确持有清单、共享测试/fixture和新增fixture写许可由根派发时核，未核路径不写无锁。本轮不查GH、不释放锁。SI/slice/README/giant/assets仅候选，保护#1101/#1059。

source仍为完整成功路径：原tail任务parse/live→完整this.assertFree（Host id/OAuth-data/全部Declarations）→同步release/declare/set无await；冲突前旧occupancy/owner/declarer/entry/贡献均不变，直接attach(v1)→attach(v2)，禁止测试先detach。新增/移除/同service id改origins和title均核刷新。Declarations同plugin_id复用不认证publisher；真实install_id/T134连接owner不可被其他publisher/installation接管。

registry unit拒绝不变旧entry，与真实Home expose先换token后attach失败再由lifecycle expose(earlier)重建旧live服务分别证明。旧bound pull晚回执在版本切换/撤权后拒绝；实际零业务写入必须经真实owner消费/提交路径核前后状态，registry.bind成功或假control拒绝只证明局部。实施时列出具体owner读回与beforeEffect到达点，不能把绑定对象引用当持久保护。原RAC1001-QUEUE deferred交错完整保留。

RAC2616～2619、actor/project/TTL/一次性确认、publisher撤销/quarantine/坏包/无批准、禁用及并发世代/late-effect全部保留。用户rollback两范围仍拒，内部失败补偿不删除；D1不变。所有RAC静态方案未运行，旧NOT RUN/UNKNOWN不改绿；full=true，工程、CI/Full、二审、真实Home及用户验收分别结算。
