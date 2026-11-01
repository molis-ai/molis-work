# BL916 四资源 / background：当前接续差量

状态：只读准备；未改原书、共账、源码、refs/GH，未fetch/build/test。不占号、不转派作者、不造READY。唯一行为需求仍accepted PG余项slice §1/§11 R3/R5/R6；直接复用 [revision-3四资源书](/private/tmp/bl916-five-services-plan/revision-3/four-resources.md)、[background书](/private/tmp/bl916-five-services-plan/revision-3/background.md)、[固定PLAN](/private/tmp/bl916-five-services-plan/revision-3/PLAN.md)及[FINAL-REVIEW](/private/tmp/bl916-five-services-plan/revision-3/FINAL-REVIEW.md)。原工程书作者归属保留；书内未分配本轮实施开发线，不自行派开发4或把T144 owner改掉。

## 结论与已解除前置

**先完整做四资源，再在其实际采用树做background。当前两本都不应标无条件READY。** T143已随T384采用15ad，旧“等T143候选合入”的等待解除；但accepted两书明确仍等T144采用/共享接缝，background另等四资源准确采用。这里既有实际同hunk交集，也有书面先后合同，不因T143已落地就默默删掉其余等待。

准确M=`08642dcb92dbdad029d990813da56682d6864a23`；相对db29仅T391文档，相对15ad再加T369测试，相关生产不漂移。与T143最终H58a1713c6比，sandbox-plugin-manifest、sandbox-package、plugin-builder/exposed-actions、plugin-install-service、home-plugin-executor、sandbox/services这组关键父接缝无diff，T143已定model/image/operation权限基础可以沿已采用合同。

旧书的717d14f2不是现在的生产：其FINAL-REVIEW列的15关键文件中，当前六处已有变化（home-plugin-executor、installed-plugin-libraries、exposed-actions、sandbox-plugin-manifest、sandbox/broker、sandbox/services）。不能复用旧“15全同”的结论或照旧owner结构实现。当前主派生函数仍在sandbox-plugin-manifest（sandboxDerivedPermissions/sandboxOperationPermissions等）；PluginPermissionView尚无requested；openSandboxHomeLibrary仍同步调用openPluginDatabase；exposed注册与runInPluginAction仍需按原书BG-1核同一finalDefinition。以上支持原缺口未消失，不是动态验收。

## 准确接缝与实施窗口

初轮使用根保存的root-open-0630.json、root-parallel-paths-0614.json及其准确head本地Git自有diff。此轮按根最新交接补正：PR1b准确冻结头为 `3421e0e69645a7ac247672c590951bce3a9c5765`，四个SDK/API冻结窗口已明确；T141已获IntegrationRegistry.attach具体窗口，正式从M08642完整实施。旧0630快照不再代表这两项当前排期。本线未刷新远端；以下文件映射是原书函数owner的现行定位，不是新增无限写路径授权。

| 对象 | 具体文件+hunk与原因 | 是否必须串行 |
| --- | --- | --- |
| **T144** | sandbox-package.ts/readSandboxPackage的允许字段与资源映射；sandbox-plugin-manifest.ts的输入及静态Manifest重建；sandbox-package-store/installed-release/installed-plugin-definition保存与恢复；plugin-install-service.ts预览、plugin-install-actions及settings-plugins的预览输出；home-plugin-executor的start/服务公布/关闭；plugin-builder/installed和installed生命周期。T144插入签名正文/角色方法，四资源插入resource/Requested/async Home初始化，必须组合在同一真实发布definition上 | **这些同函数写入串行**。先T144准确patch冻结并由根交接，再按原书在其实际采用输入完成四资源；不能各造一份Manifest/预览/恢复函数。根若想提前开发，需明确修改同一书的排程条件和hunk交接，不由本准备解除“T144采用” |
| **PR1b** | 准确冻结头3421e0e69645a7ac247672c590951bce3a9c5765；SDK manifest.ts的imports/assertV2Blocks、index.ts导出，以及platform/plugin与plugin-sdk/index两份API快照共四个冻结文件。PR1b加page-route声明校验；四资源可能增加资源形状/权限校验与导出。contracts plugin-sandbox/plugin-trust不同于PR1b plugin-manifest/ui，不泛称整个contracts被锁 | 根已明确四SDK/API冻结窗口；按该准确patch保护page-route增量并只改本片获交hunk，最终普通合成。不需要消费PR1b未采用page_routes API，也不再写成“等dev3冻结”；本片实施仍遵守T144父条件 |
| **T141** | plugin-install-service.ts的Home公开upgrade/preview与setHomePermission；home-installed-plugins的Home lifecycle/恢复；settings-plugins.ts的升级/权限显示；真实安装测试及共用签包fixture。四资源新增requested及shape-only setter拒绝，T141改完整Home升级/secret/source恢复，不能丢批准记录或恢复成Manifest全集grant | T141已正式从M08642完整实施，IntegrationRegistry.attach队列体/assertFree声明更新窗口已交，不再等#1672整单采用。同service/组件函数与BL916仍须根精确交接串行；本片connections仅引用已有service/slot，不接管source升级或registry。共享fixture/测试若确需改，核具体窗口，不另建替代fixture避锁 |
| **T389 / T386 / T390** | 根并行路径表与本片候选核心生产owner映射无交集；共享SI/README/资产/快照另核 | 没有整单产品等待，不恢复“整机唯一writer”。SI只交本片实际行；build/browser公共槽与资源实测仍排队 |
| **#1101保护分支** | packages/plugin-runtime/src/project-database.ts新增checkedExisting与inspectExistingPluginProjectDatabase，复用inspectPluginProjectSchema/shape/ledger；packages/plugin-runtime/src/index.ts同一project-database导出行新增inspectExistingPluginProjectDatabase。四资源提取共用词法/CREATE规则但保持project wrapper/project_root例外；SDK index另有导出交集 | **DDL抽取与wrapper接缝须根确认保留/交接**。Runtime index导出行及相应plugin-runtime公开API条目，仅在实现确需改时向根领取具体hunk；无需改则只读保留，不预领整文件。不能改保护树、消费未采用inspect API或改项目wrapper签名/返回/特权；未来组合责任由根指定 |
| **#1059/#1677及其余open** | 在本片核心owner映射无新增生产交集；API/actions、SI/BACKLOG/privileges/文档条目可能同文件。#1672 registry、#1669 OAuth不在本片必要写路径 | 根串行各自条目、最终从实际源码生成快照，不拿同文件作全域锁，也不改非本单hunk。连接服务新增/registry升级不偷带进四资源 |

需要根明确交出的剩余最小集合是：①T144签包派生/预览/恢复/Home executor同函数hunk；②在PR1b已冻结四SDK/API窗口内本片的实际写入hunk；③T141升级/permission UI与Host setter/共享安装测试窗口（不含已交T141的attach窗口）；④保护DDL规则/wrapper，及实现确需改时才领取的Runtime index导出行/相应API条目；⑤API/actions/SI/资源的本片条目。不同hunk可以并行，但独立worktree本身不解除同hunk冲突。

## 哪一本能先独立完成

**四资源书是可独立验收的完整第一本**：homeDatabase/connections/materials/ownerFiles、Declared/Requested/Operation、Home有界DDL、真实签名包预览/安装/启动/恢复和拒绝一起闭环；不依赖background完成、不要求T141产品先采用。T144本身无四资源依赖，应先给它共享接缝，随后四资源接实际采用父。原书已足够，不另造“先app、Home以后”的切片，不把独立DDL准备或一个broker正例签成四资源完成。

**background不能先独立完成**：它直接复用第一本Requested/operation权限、静态Manifest投影及finalDefinition，并要真实目标同时DB/files/HTTPS效果、COMMIT unknown和业务job重启待核对。若在M上先补background_job/lane，会复制未定第一本派生或遗漏跨服务验收；只能只读核接口，不标完整实施READY。

建议实际采用顺序：T144→四资源→background；PR1b可在此链前/并行审验，但parser/API生成hunk必须冻结交接后按main正常合成。T141无须整片插进父链，然而其具体升级/setter/UI改动与四资源应由根选定谁先冻结，后者普通吸收准确采用实现并只补差量。保护#1101/#1059不操作、不假定先采用，根只裁当前main本片写权与未来合成责任。

## 最小当前增量核验

- T144采用后，仅核真实保存包形状/reader/Manifest派生/预览动作版本与home start异步链差量；若已提供等价requested或资源校验即复用，不再生成第二套。当前没有这些实现的运行通过证据，不能把工程书审过当本片验收。
- 四资源沿原书六项验收和具名原完整文件类别：真实签名四服务正反/恢复、Declared/Requested/Operation与Host setter、PLIB03/S60/S64/S65/S91/S93、独立controller在Host/SQL阻塞时仍终止、ledger/业务库/外部哨兵、COMMIT明确失败与派出未知。父T143有效权限/模型层按准确输入复用，不重演其139矩阵；项目wrapper保持原完整回归，不能只测新Home规则。
- background沿原书七项：静态投影与注册/运行同finalDefinition、provider/version/cost闭包与旧token失效、真实lane/取消/撤权、跨服务部分结果、持久job与短句柄及重启待核对。第一本不变输入的有效真包原件核抵，只补本片组合增量；不加新场景矩阵。
- 本片新增源码先整体build匹配；实际diff及包READMEmandatory与精确API/actions/served、真实签名Darwin链和Linux层分别结算，shared-core/full=true仍由根排。不得把Linux skip、手工definition或假broker签为真签包成功；本地定向不替代CI/Full/用户验收。

真实Home、真实模型/Keychain、付费账户不因本准备获得权限；用临时Home/file secrets/受控HTTPS与明确当次授权执行。原B会话HOLD不是永久禁止，也不能换设备规避当前限制。第一本只结四项、BL916仍留background；第二本五项真实证据齐后根才关行，T144/T145/T149和PG整行另账。

根现在可更新原书一句状态：“T143采用前置满足；T144与上述共享hunk/采用父条件仍待”，保作者归属和两书内容。无需重开语义、重写方案、派新号或把当前准备改成READY。本轮到此停止。


## 2026-11-01 11:55Z 统筹执行窗口：T397四资源／T398后继

用户明确增加特权清理开发线；T397正式承接revision-3 four-resources完整范围，甲档/full=true，六项验收依序RAC2865～2870。负责人：Codex辅助开发线bl916_resources；原工程书作者归属保留。T398为background既有完整后继预留，七项验收RAC2871～2877，仍严格等T397实际采用，不派第二并发writer。不更改五项全部真实贯通才关BL916的要求。

本轮以实际M e4bf46ca正常合冻结T3943878296ad为候选父，T143已实际采用，T144完整签包正文/升级实现已在冻结父内。根明确允许T397在父实际采用前开始独立候选实施，发布/采用仍排T394/T145/T149已交接组合之后。先改Runtime project-database词法/CREATE共用规则及其必要具名出口、Host现有ProjectStatementProcess/controller/SQL Worker的两个Home准备窄命令、installed-plugin-libraries唯一owner适配与独立DDL回归；不改保护#1101树、不消费其未采用inspect接口，当前main project wrapper和project_root特权原样保留。根承担将来保护分支合成责任。

T149拥有唯一Manifest/effects迁入SDK的共享hunk，T397必须等其准确冻结后在新owner扩资源/Requested/Operation，禁止改旧Host派生文件或留副本。T145拥有home-plugin-executor.start、可信项目上下文与同一permission setter hunk，冻结后由根交一次串行窗口，T397只补异步Home初始化等待，不复制项目授权。T149的readSandboxPackage/installed/preview与T394已冻结正文/升级/UI都保留；未交接hunk先给最小候选，不消费WIP。其余不相交资源contract/DDL/服务真实测试可以直接推进。完整真签包预览批准安装恢复和四服务正反证同一任务交付，不能把DDL子步称完成。

公共build/test槽、jobs1/retries0、隔离Home/file secrets/专用浏览器；不本机Full/真实Home4207/Keychain/真模型/保护分支/push/GH。只原必要相关回归与真实边界实验，父未变有效证据沿用，报告一页，原件只保定位需要。共享API/actions/SI/预算/基线/状态根串行。无需重新设计或重审已接受工程选择。

2026-11-01 12:02Z：用户明确全部工作线Sol6.1Max；原Astra回合已中断，T397由Sol子代理t397_sol保留同一工作树与Runtime两文件WIP接续，范围、等待hunk和完整验收不变。

2026-11-01 12:30Z准确接缝已交：T149 owner完整冻结40249032c73e84c605fe3f02ab2f33ed43a2c09e（含d3921f），独立candidate树matching整体build通过，三constants/import迁移接入且旧Host算法删除。根核提交后授权T397保存自有checkpoint后普通merge此准确父并在唯一SDK owner/reader扩四资源；不消费发布WIP。T145未改executor，T397原异步await窄hunk已获交接。整T149/T397仍未Ready/未采用，后续只追加普通合流。


2026-11-01 13:19Z T397实际失败裁决：原four-resources合同明确ownerFiles根按install_id/scope，只有Home DB拒项目；项目沙箱原服务已存在。真签项目安装经过platform.start时，plugin-declared-services.ts把沙箱owner_files误按native Home根声明拒绝。允许仅owner_files且execution=sandbox这一分支进入原沙箱派生/装配/授权/目录检查；不得跳整个HOME_ONLY或放开native/dual、模型/生图/终端规则。真签项目正例、native项目拒绝及既有S64完整回归保持。另按原账本恢复合同补created=false严格只读核验，已有账本但业务文件缺失/空/坏时不重建、不重放DDL；真实缺失/空文件和账本不变已纳入原完整DDL用例。以上均属原四资源完整闭环，未扩大background或保护wrapper范围。

2026-11-01 13:43Z：T397四资源完整候选a3b55dea20ea75445be8f3db4094490fee656d80冻结，作者真签四服务、项目/原生边界及缺失/空库只读恢复、真实discard冷重启重试原件齐；验证线1及二审线4独立核实际实现与必要原件，最后装配改动的最终matching整体build/API/actions/SI/giant/资源交后续组合。T145 afcc3de4720f13839e387632dd3b9966309d79c0也已冻结并独立核收，后续与T149准确发布候选合流由根另给一次窗口；不重复父矩阵，不提前关BL916或释放T398实际采用条件。

2026-11-01 15:29Z T398工程接续：根已核既有七项验收的当前接口差集。四资源最终e4e05dc5及T145/T149/T402已进入T399 c68df1183候选；background仍严格等T397实际采用，原工程书与作者归属保留。唯一派生owner改认SDK sandbox-manifest的Declared/Requested/Operation三函数，预览@5与两setter@2跟随真实descriptor；exposed注册与scope共用finalDefinition已实现，后继只补target闭包、job投影及同cost的provider/version失效。两个Host回调已移至project-reach，按最终采用输入衔接。原四资源真签正反/恢复证据仅在输入未变时沿用，新增验证集中原书的真实lane、job原子竞态、跨服务COMMIT unknown和重启status链；不新造矩阵、第二owner或平台job表，五项齐后才关BL916。


## 2026-11-01 18:05Z 用户提速：T398并行候选实施窗口

用户明确要求后续开发并行。根撤销先前为排程设置的T398“必须等T397实际main才可开发”条件；T397完整且独立审验的实现已在冻结T399 debaf12eb7bb0b61bb0fe259bec683606804ae8c/tree5a313100eb5ea0b98f8dbcaaa8bcdafc84dec469，依赖合同可从准确候选消费。正式交Codex开发线4在独立feature/t398-background真签包树完整实施revision-3/background.md及七项RAC2871～2877；不是只做lane切片，不造第二派生owner/平台job表，不改保护分支或真实Home。当前唯一静态派生在SDK sandbox-manifest，exposed注册/运行已共用finalDefinition，继续补原目标闭包/费用/provider-version失效、真实lane、业务job竞态与重启待核对。主写路径为sandbox合同/SDK派生、installed definition/lane、exposed/background服务与其原测试；与T403的ui/frame/client路径分开，最终公开快照/SI/资源/状态根串行。父后续修复只收准确冻结提交；发布/采用仍等T399实际采用，并满足本头审验/Verify/SI/Full。原七项真签验收与已有效父证据复用不变，不重审原书或新增矩阵。


2026-11-01 19:34Z T398原HTTP-lost合同补正窗口：真签包受控TLS已收到请求后断响应，现行链仅普通错误、缺可信unknown。根核public-https→connector-plugin-requests→sandbox broker/runner，允许新增apps/local-host/src/public-https.ts和connector-plugin-requests.ts中send的最小生产差量；broker/bridge沿原窗口。传输层只记录请求局部的可信可能派出状态，派出前DNS/地址/授权/连接拒绝不冒作已生效未知；发送后丢确认由Host产生现有actions.outcome_unknown，broker仅由可信Host拒绝映射SandboxError.outcome，worker JSON伪造不得触发。保取消/撤权原拒绝语义与已提交部分事实，不自动重放、不补failed、不跨服务回滚，不改正常前台model预算。fresh 11 open中public-https与broker无交集；connector-plugin-requests父T395/T068/T121改binding列表，保护#1101仅import及forgetProjectConnectionBindings，当前send窗口无同hunk，保护分支不动。必要验证为原完整真签文件HTTP-lost/伪造/派出前拒绝及已受影响完整连接安全文件，保最初失败，不重演四资源父矩阵。和held-result、重复enable、10分钟/60秒原后台预算共同最终冻结后核增量。


2026-11-01 20:18Z：T398修复候选73b1ea2ec/treea253已冻结，准确头真签完整文件16/16，原9完整文件101pass/1默认关闭外网集成skip按原输入保留。独立增量二审核出新的必要修复：background lane按单caller signal/authority失效就discard共享runner，会在A实际执行、B排队时仅取消B便杀A。根已回读确认，交原作者移除这项越界的lane判断，由现有runner派发/取消责任保queued隔离，实际executing取消及安装/世代stop仍结束所属进程；不加第二队列或状态表。补真实A持有/B排队取消或单caller撤权/A继续完成/显式C成功和B零副作用的必要用例。旧73b不终签，其他已有效证据不重复跑；API/SI/giant只在新源码冻结后一次生成并核收，最终CI/Full与采用仍未完成。


2026-11-01 20:38Z最终源码与元数据窗：cd9cdda4567d378e23a351eb6abe4bbd5e4eca48/tree86462be62221759a389099d0b9e4537119d29b67相对73b仅5paths，原queue task保有执行及最后异步检查责任，queued caller拒绝不会杀另一active caller；最终完整签名19/19、runner23/23，独立两线均通过，旧PID退出与红例保留。根授权原writer仅官方API两份、SI既有S67/S18/S57准确行为/证明入口和giant现有四项实测size（ActionService406/15、PluginRuntime624/29、SandboxBroker315/9、runner192），保完整既有理由、不改算法/limits；普通health/boundary/API/actions/imports及提交级secrets收尾，未变业务不重复。最终metadata由原两线只核差量；不push/Full/真实Home，发布采用仍待根。
