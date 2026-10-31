# 密钥补偿层：隔离测试子进程中的真实生产依赖包装

状态：修订2最后工程候选，采纳 INDEPENDENT-REVIEW.md；未实施、未运行、未Ready，full=true。此文件细化同一PLAN，不另立产品方案。旧公开控制API候选已撤回；不新增HomePluginHost方法，不给openHomeInstalledPlugins返回值追加secrets/approvedFor。公开preview/confirm与真实设置DOM完整范围保留，confirm仍只有preview_id/consent/pin_label。

## 精确路径与加载顺序

父测试仍为`tests/installed-plugin-host.test.ts`，保留其现有项目密钥回归，新增Home密钥受控依赖场景的子进程入口。唯一新装载fixture是`tests/fixtures/home-upgrade-lifecycle.mjs`；不新增公共测试控制服务。现有父文件静态import公开Host及若干内部dist模块，不能在它已加载后注册包装；独立子进程不继承父进程ESM缓存。

子进程在Node启动前已有自有系统HOME/MOLIS_WORK_HOME/config/cache、file secret backend、空encryption key和显式环境；执行argv只含必要`--unhandled-rejections=strict --import tsx`及该fixture，不照搬父execArgv/NODE_OPTIONS或账号凭据。fixture内部顺序固定：

1. 只静态import `node:module`、`node:assert/strict`等Node内置。先创建进程内捕获槽并调用同步`registerHooks({load})`。此时不能静态或动态import Host、sandbox-package或任何应用测试helper。
2. 目标URL明确为相对fixture的`../../apps/local-host/dist/installed-plugin-lifecycle.js`，对应`home-installed-plugins.js`真实`./installed-plugin-lifecycle.js`导入解析后的同一个URL。load对所有模块先调用`nextLoad(url, context)`，非目标原样返回；目标保留原source/format及全部导出，只在source末尾追加factory包装。无第二份URL、query后缀、data模块或源文件替代。
3. 包装语义仅为：保存原installedLifecycle函数，在原导出binding上赋一层同步函数；每次以同一context调用真实factory一次，捕获原context及真实返回lifecycle，再原样返回。此追加在该模块完成evaluation、其Host importer开始evaluation前执行。原APPROVED_KEY、covered和其余源码/依赖保持；installed-plugin-version对APPROVED_KEY的真实ESM循环仍是同一模块，不复制模块绕循环。包装本身没有stage/apply/restore/rollback、异常转成功、模拟批准或沙箱。
4. hook注册之后，才动态import现有公开Host/kernel包以及`./sandbox-package.ts`签包fixture；再正常`new HomePluginHost`、ready。新child不直接import任何包内部文件。观察目标load确实命中、唯一捕获属于本次自有Home；本进程只创建一个HomePluginHost/controller。额外捕获或未捕获必须报错及实际加载链，不能私取字段补齐。
5. 同步hook与目标模块在同一realm，捕获槽可以用进程内唯一Symbol关联；不导出、不通过IPC传密钥、不让子进程全局槽出现在生产对象。finally先释放所有场景屏障并等待pending，再关闭Host/registry/runner，deregister并清除槽，父进程清理自有目录和其pid/group。失败也必须收尾；父进程同时核子进程退出码与断言结果，不能忽略后台拒绝。

这里选同步load包装，避免mock.module先import真实内部模块造成预加载或额外内部import。仓库`tests/desktop-entry-failures.test.ts`/`tests/fixtures/desktop-entry-faults.mjs`只支持隔离子进程模块包装的既有方向；本候选不冒称那里已经验证本次依赖图。[Node官方module文档](https://nodejs.org/api/module.html#moduleregisterhooksoptions)说明同步hook在模块同线程/realm运行，以及先注册、再dynamic import的顺序；API从22.15/23.5提供，仓库engines为Node>=24。**本次没有运行hook、Node/tsx加载、factory捕获或任何测试，兼容性仍待实际实施证明。**

## import门禁的实际边界

只读核对`scripts/test-imports/refs.mjs`和`parse.mjs`：tests内字面量import、export-from、动态import、require进入包src/dist会计入内部引用，新fixture从0开始；`graph.mjs`还按独立子进程fixture核source/dist混用绝对零。父文件现有内部dist引用不为本次新增许可，不再添加一条。

新fixture的实际导入仅Node内置、应用公开包名、已有tests fixture；built路径显式作为load匹配目标，未用computed import加载内部模块。它是透明列明的**内部built依赖拦截**，不是完全公开路径；import扫描不计load目标只是现行语法口径，不能当作语义封装已被证明。实施后检查完整新文件与每进程图，再跑`node scripts/test-imports.mjs --check --chains`及merge-base health；此处只给命令与预期，没有通过结果。不放宽门禁/改baseline、不用隐藏specifier或生产新导出解决失败；若实际阻断给根具体规则与差异。

## 同一Home装配、输入与读回

正常装配沿既有公共入口：真实ActionService作registry/client；`new HomePluginHost({home,actorId:'user',registry:service,client:service,entries:[],inspect})`。ready走生产Home数据库、Runtime、Supervisor、HomePluginExecutor，包装只接住`openHomeInstalledPlugins`实际传给factory的那一份context与返回值；不建第二context/controller，不替Runtime、沙箱、批准库、file secret adapter或补偿。

临时publisher通过现有newPublisher/生产签名工具；签前设置runtime.home、正确递增version、compatible_from_versions、secretRefs。真实readSandboxPackage验签，HomeConsentLedger pin同一home的publisher公开元数据，SandboxPackageStore.save/load取得可重读release。v1经host.installPackage正常安装并作真实业务写读；从捕获context.recordFor核实际install_id/installation_generation，再由`context.secrets.save(pluginId,old)`准备fixture值。捕获函数调用次数只证明接线，不能证明Home范围；须同时核真实Runtime身份、`~home`文件adapter作用域与批准实际读回，防止用了project controller或第二份存储。范围读回的准确键来自现行pluginSecrets.reference：`plugin-builder-secret:~home:<pluginId>:<name>`；仅通过storage现有公开runWithMolisWorkHome(home, () => createFileSecretStore())在本次自有Home取只读owner句柄，核对应weather/fresh的实际值/删除与context.secrets.resolve一致。此句柄不替换context.secrets、不装配另一controller、不直接解析密钥文件；所有断言只用fixture值且不输出值。批准从同一context.approvedFor与context.storage的现行`plugin-builder:agent-studio:approved:<pluginId>`键交叉读回。

v2受控层调用捕获的真实lifecycle('upgrade',v2,{consent:true,secrets:[replacement,fresh]})；同一context.secrets.resolve及approvedFor读结果。此调用绕开公开preview确认流程，结论仅为受控依赖测试，不记为用户从HTTP/DOM输入密钥。公开preview/confirm成功、失败和DOM另有原必需场景。

## 保留的RAC-2615场景与故障判据

不新增矩阵，只把原场景接到同一真实factory：

- 成功：weather旧值替换、fresh新值实际生效；原install_id/installation_generation和业务数据保留，版本v2、真实v2动作/提示词/批准可见。list只含name/header，批准JSON/返回/捕获日志不含fixture值。
- 未声明secret name：真实lifecycle拒绝，切换/批准/secret stage前快照不变。空secrets成功不代此层。
- apply后expose故障：使用HomePluginHost既有constructor.inspect。v1初始catalog完全结束后arm一次，inspect先取真实service.inspect snapshot；仅实际Runtime v2且真实v2暴露动作已在snapshot时进入deferred。entered前再核replacement/fresh已落真实adapter、批准已为v2。升级promise创建后立即挂拒绝观察；屏障释放时仅本次inspect抛sentinel，生产changeInstalledVersion执行真实restore/rollback/旧批准/expose(earlier)/旧prompts。
- 失败后读回旧版本/身份/业务数据、旧批准/weather旧值、fresh===null、真实v1动作与提示词可用、v2提示词不可用；合法v2包可已save而留存。disarm后相同compatible v2能再成功。source旧live服务恢复仍由原真实source补偿场景证明。
- 较新disable及disable→enable：在同一apply后屏障里走真实Host packageAction，旧升级不得覆盖较新generation/状态/批准/密钥；最终用真实Runtime/调用/adapter读回。另保留直接secret编辑场景：在失败屏障内经同一context.secrets.save把weather改later，旧restore后later仍在，fresh本轮新增值撤销。这证明真实adapter的条件恢复，不能只检查错误message。

### disable→enable的确定顺序

`home-installed-plugins.ts`共享catalogPending，enable可能等升级已进入的同一个inspect。固定先后如下：

1. 启动升级pending，立即挂assert.rejects/等价拒绝观察；等entered并核实际v2、apply、批准，故障条件确已到达。
2. 经真实host.packageAction('disable')完成停用，核当前disabled及generation；提前挂对真实ActionService provider登记事件的观察，只匹配本安装v2的实际重新曝光，不用计时猜。这里的“provider登记事件”仅指测试child对真实service.registerProvider的透传观察：先bind原方法，停用完成后arm观察；包装调用bound原方法，在真实登记成功且匹配本安装v2时通知deferred，并原样返回原方法给出的同一disposer；不替代真实登记，不存在生产订阅API。
3. 启动enable，立即给其promise挂拒绝观察（若enable也因同一inspect失败，记录真实结果，不要求假成功）；**不await enable完成**。
4. 等真实v2 provider重新登记事件，证明已到exposure；先release原inspect屏障，再await enable和旧升级各自收束，核较新事实没有被旧补偿覆盖。事件本身不证明持久结果，最终仍读Runtime/批准/secret和实际动作。
5. finally总是先release，再settle所有已启动pending，关Host。超时只能报告未到达/未收尾，不算撤权证据；不加sleep。

若真实inspect、事件或Home范围不符合上述调用链，保留实际堆栈给根修测试装载/接线；不改生产公开API、读private或复制核心算法补洞。所有动态证据NOT RUN。

## 文件锁

#1701已按根交接真实合`4b2f971a`，tests/integration-registry.test.ts锁解除；RAC2447零start/零contribution/holder仍可bind必须保留。#1672 integration-registry.ts仍WAIT。T143 Home接线/fixture仍WAIT，至少home-installed-plugins.ts与其重叠：根逐文件确认持有范围与串行交接，不因撤回home-plugins控制API而释放Home锁；不改home-sandbox.ts，accepted slice只交§3候选。T143 broker.ts及模型/指令修复不是本单实现范围。

新增home-upgrade-lifecycle.mjs及home-upgrade-source.ts和现有测试写路径随同一书交根核定，未做GH/refs刷新，不写无锁。公开控制面无新增，公开confirm和动作schema无变化；仍不扩OAuth/document_import或沙箱权限。
