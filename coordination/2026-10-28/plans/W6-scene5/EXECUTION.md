# W6-05 场景5 · E 隔离实操报告

负责人：验证线4。**实际执行完成，场景5部分通过、存在右分屏 Goals 首页空白失败，不能签整个场景通过。** 首败及原未知保留；没有产品修复或重跑整链。独立观察和用户验收分开，不签W6、最终F或本人验收。

执行E=`8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987`，tree=`6de1342b398a5a0b3736cdacf2e44975f3b3fbab`。从准备切点b6f到E只7路径：T377三客户端、readiness测试、desktop-tui测试与资源脚本/表；原场景所用Goals/Shelf/灵光/标签夹具未变。见[准确源码与构建绑定](raw/source-binding.json)、[采用差集](raw/adopted-diff.patch)。不取T116/T402候选，不重跑T351。

## 首败：右分屏 Goals 组头显示空白

从CORE通过真实“布局与分屏→向右分屏”，左右初始均为CORE；右栏选择Goals插件组头，实际指针送达，组头成为当前tab。随后右栏Goal列表不可见，10秒原期限内无法进入INTERFACES，右侧整片空白，左侧CORE仍正常。这是**真实UI表现失败**，不是“鼠标没发出”或只凭超时报错；根因及是否由T377引入均未判定，未另建基线重跑。

- 主URL：`http://127.0.0.1:60946/projects/molis-work-v1-demo/`。
- 左pane=`txolqfytb`，右pane=`tp6rt1wr2`；右原CORE条目tab=`tpe5ac3ug`，右Goals组头tab=`trj4je1wy`。点击前双CORE内容已读到；点击后右组头aria-current=page，CORE条目非当前。
- 实际右Goals frame URL：`http://127.0.0.1:60946/projects/molis-work-v1-demo/?workbenchPane=tp6rt1wr2&panePlugin=goals&paneTitle=`；readyState=complete、body.desktopSurface=goals、paneEmbedded=true，body.innerText为空。`[data-goal-canvas-shell]`存在、boardView=list、goalActive=true但仍有hidden；DOM还存在CORE frame结构，不能据存在就说用户看到了列表。
- [首败截图](raw/failure-step5-right-record-pointer.png)、[触发前后标识/真实指针/DOM原件](raw/right-goals-first-failure.json)。连续记录[journey.jsonl](raw/journey.jsonl):97为原期限失败，99为当时只读诊断；截图未被覆盖。首败网络响应未启用监听，历史status/body未知，未补发HTTP或重放页面冒充原件；现有证据不宣称HTTP 200。
- 没刷新/改DOM来补此步绿。只暂停依赖右Goals列表的新条目步骤；后续刷新是原计划的**已有内容标签持久化**步骤，不当作该失败恢复。本报告仍将右Goals首页留失败；一审可直接只读原件及E源码，不需要操作Host。

## 同一Home上其余既定动作的结果

| 原步骤 | 真实结果与证据 |
| --- | --- |
| 1 底栏、全局设置、返回 | 真实底栏Goals→CORE→项目菜单的全局设置→可见关闭按钮返回；tabs逐项与进入设置前相等。右栏开关未替换CORE。原件journey:20；[返回CORE](raw/step1-return-core.png)。 |
| 2 Shelf/灵光开关、暂存 | Shelf A末字“甲”后立即真实返回；owner实际字节及重开编辑器均为`# 场景5 A\n保存前 A\n最后一键甲`，B仍`# 场景5 B\n保持 B`。侧栏切灵光读到“还没有灵光”真实空态，切回Shelf、关闭重开记住选择，主区CORE保留；刷新后再次重开A仍一致。原件journey:32、49及step4-post-refresh-persistence；[保存后](raw/step2-last-key-saved.png)、[灵光就绪](raw/step2-lingguang-ready.png)。 |
| 3 标签增删与恢复 | CORE既有标签保留；真实Meta点击INTERFACES多开，内容id/标题/正文相符，每栏一个Goals组头；条目关闭后从列表重新打开，正文未删除。关闭Goals**整组**后点可见撤销，组内标签id/顺序/当前项逐项恢复。原件journey:65；[组恢复](raw/step3-group-restored.png)。单条标签的独立撤销不适用，见下节纠正。 |
| 4 历史、刷新与后退 | Goals↔主区灵光，工作台上一步/下一步对应正确面。地址栏真实导航`/settings/general`被现行壳规范化为同项目根URL的project-settings覆盖层；关闭后用浏览器真实历史entry7→9后退/前进，记录与tabs保留；刷新再逐项核tabs、CORE正文。原件journey:72、84；[刷新后CORE](raw/step4-reloaded-core.png)。不声称URL始终保留/settings/general或后退必重开已关闭设置。 |
| 5 两窗格独立、刷新、关闭右栏 | 右Goals列表失败后，沿已有内容标签检查到**左INTERFACES、右CORE**两个真实frame，id/标题/正文各自相符。右栏灵光真实空态→返回，右Goals整组关闭/撤销，左栏未变；单切左栏时右CORE未变。按原计划刷新，两个frame内容与刷新前逐项一致。关闭右栏后留下INTERFACES真实内容，继续点CORE可阅读。原件journey:120、122、130；[双栏刷新后](raw/step5-split-reloaded.png)、[关闭右栏后仍可用](raw/step5-final-single-pane.png)。这只支持既有条目链，不抵右Goals首页失败，也未完成原预设“左CORE、右新开INTERFACES”的路径。 |

样本P=`molis-work-v1-demo`；A=`item_mvx4aep4_abfbec40`，B=`item_mvx4aep5_5649c85a`。A/B经既有Shelf owner夹具admit生成，不是UI导入验收。它们及两个Goal均合成内容；没有移动对象/跨项目权限/搜索操作，不重复场景7。最终owner正文及观察到的Runtime异常列表保存在[final-observation.json](raw/final-observation.json)。观察到的Runtime.exceptionThrown为0，不等于无UI缺陷；Host另有3条workspace-settings.opened_announce_failed/actions.missing warning，未归因为空白原因。

## 驱动问题、合同纠正与证据限制

所有失败/纠正保留在连续JSONL，不删首败、无自动重试。只修仓库外驱动/环境，未改生产或DOM业务状态：

- 启动前`.ts`被按CJS解析，改`.mts`；其次公共TMPDIR的/var与/private/var别名导致夹具Home形状比较失败。改为**同一公共目录的realpath**，inode相同、槽路径仍为同一物理目录；两次均未启动浏览器，不算场景运行结果。只在第三次启动了一份实际Chrome/fixture Home，随后同一会话连续走完。
- 设置按钮在未展开的details中；原驱动取到了被底栏遮挡的几何。保留原错误，改为先真实点项目菜单summary再点设置，没有DOM.click。
- Mac全选只发Meta+A未实际选中，导致正文被追加；owner忠实保存了真实输入，不能归为保存缺陷。补CDP原生selectAll编辑命令、核selectionStart/end确实覆盖原文，再真实输入。修正后的末字返回/持久化通过。另一次重开后过早读取editor，在既有可见条件成立后读回；未重做已通过保存。
- 后加的灵光frame观察器没有历史executionContext，补Runtime事件重订阅后读真实frame，没有刷新产品。浏览器历史读到旧文档、整组恢复后过早读新frame、关闭分栏后误读顶层旧CORE而未读仍在使用的INTERFACES iframe，均按实际frame/导航完成信号纠正；后者截图本身显示INTERFACES正常，不能当第二个空白产品失败。
- 计划中“单条标签关闭后可见撤销”是本线误读：`plugin-tab-groups.ts`的撤销只记录关闭的插件组，PTG-05也只约定整组。原“标签增删/留存”已实走，整组恢复真实通过；单条独立撤销没有此现行能力，不新提实现或伪造通过。准备稿保留在PLAN-pre-execution.md。
- 网络原件的缺失保持未知；不重演首败、不取候选修复、不为一审猜根因增加驱动注入。交互封装node:test最后的1/1仅表示会话正常结束/清理；业务断言错误在循环中逐条保留，**该TAP不代表场景全绿**，实际结论以本报告逐步状态及原件为准。

## 构建、隔离与清理

独立detached E树，离线frozen安装exit0，公共build槽完整`pnpm build` exit0；[build.log](raw/build.log)、[build-manifest.json](raw/build-manifest.json)：created_at=`2026-11-01T00:52:56.026Z`，source_digest=`00f5f125621ac3cd160b41281819a9932c050fba830b5959f4e2d4435ab2c0ea`。源码在运行前后保持clean。实际连续UI为2026-10-31 **17:54～18:03 PDT**，Node24.14.0、专用HeadlessChrome153.0.8010.12、1440×1000中文浅色，一个browser槽、一个Home/profile、无自动重试。场景封装单进程，jobs1；没有本机Full或额外完整文件测试批。

显式独立系统HOME/CFFIXED/XDG/file secret backend、adhoc helper、空本地工具目录，模型completion=null；Chrome追加use-mock-keychain/password-store=basic。未读取个人配置、真实Home/4207/Keychain/Memory或调用模型；未使用场景7/8 Home/profile。只用CDP真实指针/键盘、可见控件和公开owner读回，业务DOM/localStorage未直接改写。

Host、Chrome及profile/fixture Home已由原夹具清理，无遗留本线进程；见[浏览器清理](raw/cleanup-browser.json)。自有runtime/E树与公共槽收尾见raw/cleanup-final.json。证据和仓库外驱动保留在本目录。未改源码、coord、GitHub或其他会话成果；仅场景5的这个E结果交根核收，后继修复/最终F/FR其他视宽语言主题及本人认可仍开放。
