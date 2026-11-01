# T389 阶段3最小修复草案独立书审

**结论：最新PLAN的四片段透传open/restore方案与已证故障对应，可作为同WO修复方案；无当前Blocker/P1或必须扩大项。** 本轮书审期间计划已补齐完成信号及永久测试失败传播文字，按最新成稿裁决，不继续保留已关闭的文字必修。无需第三份case、旧H/M或概率复跑。当前只审计划，未获产品实施授权；T391开发线4仍持唯一writer，本线不改源码/原计划/coordination、不运行build、probe、测试、Full或写refs/GH。

阶段2文字已另行回读：作者表格、正文两处均已去掉“观察到收尾rAF完成”的过强声明，尾部留下仅文字修改/未补跑说明；我已在 `/private/tmp/t389-menu-second/REPORT.md` 追加唯一必修关闭。菜单缺陷核收结论不变，旧Linux根因仍UNKNOWN。

## 已落实的执行边界与五文件核对

最新PLAN第39行明确：documentSyncing前态也false，不能据此证明rAF；完整提交采用准确同步尾段、task后marker/newGoal/适用UI后置与无恢复异常的组合。第45行明确永久回归不得像诊断probe记录category3后返回，所有前提/采集/恢复/断言失败必须使测试失败，finally不吞原错。这两处已落实，无需再改同义文字或为完成信号加hook/任意rAF。Browser缺失等按公共runner真实失败/skip单列，不能算产品通过。旧版红必须在可靠提交后的menu保留断言，其它红如实交根；修后还须无reveal的add、choose/cancel走通。

PLAN列的是简称，正式执行合同应落到以下完整文件，**不是五份都叫e2e**：

| 拟定文件 | 存在性与作用 |
| --- | --- |
| tests/feed-source-menu-refresh.e2e.test.ts | 计划新增，当前不存在；承担真实刷新保留菜单与显式选择两case |
| tests/project-user-journey.e2e.test.ts | 存在；现成完整用户旅程，只按其覆盖范围结算，不倒签旧CI因果 |
| tests/workbench-pane-feed.e2e.test.ts | 存在；Feed在工作台窗格的实际操作，防意图传递影响既有入口 |
| tests/feed-sources.test.ts | 存在，非e2e；来源owner合同与所用真实来源准备相关，不能代替UI恢复证明 |
| tests/workbench-ui-platform.test.ts | 存在；工作台已有脚本/界面平台约束 |

没有发现计划指明一个已存在却不存在的完整路径；执行时不要自行补成不存在的feed-sources.e2e.test.ts。五份作为定向核心可接受，尚不是包全部必跑清单。PLAN要求按实际affected与包README选，其正式执行合同要保留README“改动后必跑”“界面改动加跑”等适用规则，affected建议不豁免它们；有效准确输入证据可核抵，不机械复跑。验收编号由根在同WO给出并由测试引用，本轮不要求新号段或新增矩阵。

## 实现方向核对

准确M的来源按钮在events-secondary:6调用setFeedTask(taskId)，重选当前task也有明确收菜单意图；persist=false则遍布preset、surface、tab/frame恢复及其它显式入口，不能用persist或changed单独代理意图。PLAN默认open、只在restore且同task时保留菜单，方向正确。

已核当前applyUiState：documents-state:212调用setFeedPreset，preset在stage:480再次setFeedTask并在:482调setDesktopWorkSurface，最后documents-state:227又调已有intent=restore的setDesktopWorkSurface；navigation-feed:35/76各有setFeedTask。因此只改setter或第一处restore会被后续调用覆盖，PLAN四文件的传递有必要。setDesktopWorkSurface现有open/restore用于被动刷新不重试失败客户端；复用这份已有意图比另加全局refreshing flag、保存菜单到storage或刷新后强制重开简单。内部函数新增参数不是公开API/schema改变，无需为此单独升动作版本。

sources中selectedSource更新仍无条件，关闭相关的railOpen/aria-expanded/open三项只在open或changed时执行；changed的collapseFeedStage/setFeedAddOpen、过滤及保存/广播保留，边界足够。restore同task应同时保留“原来开着”和“原来关着”，不能写成只要restore就open。现成details toggle会同步railOpen及aria-expanded；新增代码不要另建第二份菜单状态主人。

**restoreFeedPresetState预赋selectedFeedTask：本次不是必须扩修的缺陷，但changed不能泛称真实前后task变化判据。** 任意旧快照A→已有B的恢复，预赋B后setFeedTask会见changed=false；本方案不能据此声称拦住所有这种变化。不过准确M只有refresh和初始化两处applyUiState：refresh在commit前readUiState，且该函数先rememberFeedPresetState，因此保存/恢复的是此刻当前task，不是网络发起时旧task；Goals prepareGoalRefresh.apply只换Goals树/正文/创建表单，不替换Feed来源rail。本次不会凭空出现A→已有B。初始化是同步启动恢复，来源菜单本来关闭，不存在用户已打开A菜单再恢复旧B的本轮交互。显式选择则保默认open，无论changed怎样都仍关闭菜单；不存在的saved.task会被available归一化为all，invalid!==all使changed=true，关闭和既有重置仍发生。因此在这份窄合同内，不需要再保存一份全局priorTask、重构preset模型或追加历史恢复矩阵。若实施把restore扩到其它入口或真正不同task恢复，须用恢复前实际选择/归一化目标重新裁定，不能沿用这里的范围论证。

我也读了setDesktopWorkSurface的pluginWorkbench.open和frameContainer.sync：前者只在market/artifacts触发相应加载，后者同步Goal frame容器；未见在这条单pane Feed恢复中必须再修改tab-workspace-panes或plugins的证据。PLAN保留tab/feed-task消息、Feed列表refresh、membership/adopt的原调用合理。若实际修复diff/回归暴露另一个必要关闭者，先交根更新同书，不以“测试没绿”批量给所有persist=false套restore，也不加补偿重开。当前不需要预扩到共享tab/frame协议。

## 回归与交付边界

一个真实公共写→自然attention/cursor→真实compact Response暂挂/放行的保留菜单case，加一个无Goal刷新的显式选择case，足够覆盖本次取舍；无需给已知故障再加概率运行。显式case保留all重选、切S及S重选的菜单关闭、选中项与chooser状态；S按当前公共Feed合同准备并经正常页面加载，不插DOM或改selectedFeedTask。受控case里的chooser choose/cancel只验证原路径，不能被写成旧Linux问题已修复。

基线红阶段只加入新测试，旧M的matching生产构建可核抵；生产改完后须整体build匹配修复树，新回归不能借旧dist验证。原版业务红和修后绿保准确头、原始失败位置/错误与无reveal输入证据，不把两次测试启动说成两次阶段2复现。正式发工输入由根在writer释放后绑定；若采用头较M前进，说明本次比较/实施基线及相关链增量，不把15ad诊断原件改署新头。

资源必须实测并按现行规则处理，不预签零增长或改门禁。Full由实际diff、affected及现行包/仓库规则交根裁定，脚本建议不能反过来豁免明确规则；本计划没有预签full=false，也不构成运行Full授权。当前文件名/内部参数本身不能决定Full，旧Full暂停及历史CI账保持。

已只读核本机对象db29f18d4f602fa8d9efb689a6a766aa9b07625f相对15ad仅多tests/mcp-connection-change-refusal.test.ts，相关生产链无增量；这不是新的main运行证据。可由根据最新PLAN/本REVIEW更新同一WO，并在T391交回writer、绑定正式输入后安排修复；本报告不是开工授权，不请求另开任务/号段，不实施最小修法。
