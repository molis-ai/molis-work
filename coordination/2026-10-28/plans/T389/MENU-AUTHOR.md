# T389 阶段2终态：当前 M 的受控菜单状态丢失

**第①类结果成立：准确 M `15ad4f397018241c8b31625aff8014b89259f239` 上，一次无关 Goal 的完整正常刷新，在本次受控交错中关闭了用户已打开的同一 Feed 来源菜单。** 这不等于chooser被关、add可信点击丢失、390专属、自然频率或旧Linux Hidden custom_rss根因。旧CI因果仍UNKNOWN。没有产品修复候选、永久回归或新增Full；本阶段停止并交回唯一writer。

## 两次启动、一次业务实验，原件分开

首次启动仅用seedDemoBoard建平台root，公共fixture在首次snapshot（goal-browser:114）报goals.board.not_found，尚未创建page/session；业务对照/实验Goal POST/Response控制均0。完整失败、probe、准备稿、cleanup与当时REPORT原样保存在 `attempt-1/`；不是本轮菜单结果，未删除失败。其后根05:38Z在同WO明确补正：只把临时probe的seed import/参数换成现成fixture `seedBoard`，由owner helper建空Goals board，不种样例Goal；这次前置开板的cursor计入C0，不计作实验Goal创建。`initialization-only.diff`准确显示这两处变化，其它业务逻辑/预算未改。先前作者提出的公开Host查询初始化建议未实现，已标为superseded。

修正后的启动是**首次到达业务实验**：一个新project、390×640、一次正常native add对照、一次公开Goal HTTP POST、一次真实compact Response暂停/原样释放。对照native add=1，POST=1，compact=1，release=1；菜单关闭后未继续点第二次add，不调用带自动reveal的click helper。没有对照/POST/Response重试，没有重跑旧H/M、1440、完整journey或第三轮。`business-M.log`是一例临时probe自然exit0/1pass，case17.625秒、文件20.315秒；此pass仅表示诊断流程得出第①类，不是产品旅程/发布验收。

## 输入、构建与隔离

M tree=`eca97df70b0c53182d70b32ba184508ac1a4f996`；独立detached `/private/tmp/t389-menu-dev`。复用冻结T369 `/private/tmp/t369-dev` 的matching产物；来源head=`89119b9c07c0910f39cfc42beb3fc729c6ee1808`，相对M只多无关测试 `tests/mcp-connection-change-refusal.test.ts`，不冒称M整树。来源、本树及每次运行前独立重算生产摘要均等于manifest `1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`（created03:17:39Z）。公共build槽完成frozen/offline安装及复制；未新增整体或局部生产构建。`prepare-result.json`含源码/依赖摘要和六个public package解析入口，均落在本树自己的dist；`business-M-result.json`再次绑定M/tree/build。仅临时probe新增，没有改生产、共享fixture/helper、原journey、CI或refs。

实际环境：Node24.14.0/ABI137、Mac arm64、专用molis-test-browser wrapper，mock-keychain/password-store=basic、file secret backend、ad-hoc，无真实模型/Keychain/Home4207。系统HOME/CFFIXED/XDG/Node TMPDIR在本任务runtime内，唯一fixture Home为独立新目录。专用二进制在执行后只读`--version`返回Chrome for Testing153.0.8010.12；未从本run的CDP单独读版本，不冒称那是额外现场。Foundation自身临时目录未另测，不承诺所有原生tmp受Node TMPDIR控制。

公共槽在改TMPDIR前解析并固定到 `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-work-slots`。prepare holder PID45672、首失败browser holder48433、唯一业务browser holder51252均有原件；business-M-result里同一public holder的pid/since在完整子进程前后保持一致，不用事前/事后free代替持槽证据。真实命令与环境在各log首行。

## 真实业务链与预算

project=`project-cce1bc6f-2d1a-4579-a412-51151714029c`，session=`35A78D57C94D3D60406433E634B2AC1C`，新Goal=`28f110e3-e18e-4e41-a3e3-98b8d0a1e583`。以下均是`experiment.json`中Node单调毫秒，起点在fixture返回后；浏览器自身可信交互事件时钟另存，不与Node时钟混作协议线上的精确发送时刻。

| 事实 | seq / ms | 原件支持 |
| --- | --- | --- |
| 对照前页面/公开Host cursor一致 | 7–8 /1775.672–1777.165 | C0=1，空Goal列表、root current集合、无selected Goal、同一顶层Feed/task all，visible无dirty |
| 正常summary→rail add→关闭chooser对照 | 9–13 /1827.541–1849.656 | 原生可信summary/add/close各一次；chooser确实可见；对照期间compact数0、cursor仍1 |
| 唯一公开Goal POST成功 | 14–15 /1851.202–1873.535 | LocalHostHttpClient携真实gate头/新key，业务reply含goal/goal_path/observed_event_cursor/replayed；未落正文/令牌 |
| 公开cursor已追平 |16 /1874.635| C1=3 > C0 |
| 自然attention→页面cursor→compact请求 |17–24 /16456.061–16580.834| attention network51301.42的board_cursor=3，页面实际attention事件cursor3；cursor network51301.43回3；唯一compact network51301.44，GET/current/no goal_id |
| 原始200 Response只读验证 |25 /16581.608| Fetch id interception-job-3.0与network51301.44关联；真实HTML public state的project/cursor3/newGoal相符，正文未落盘 |
| 暂挂时原生打开同menu |27–29 /16586.458–16617.293| 页面仍cursor1；menu.open=true、引用/连接/task/source/body均有效；释放前图已保存 |
| 原样continue一次 |30–33 /16617.359–16618.000| planned释放；36.855ms内收到continue回执；未fulfill/替换response |
| 完整恢复后的同次快照 |34 /16666.594| 页面cursor3、新Goal进入goals数组；task后观察documentSyncing=false（前态也false，不能据此证明rAF执行）；同menu.open=false，保相同project/body/Feed/task/source |

POST约22.3ms≤15秒；公开cursor追平约1.1ms≤10秒；自然Response等待约14.7秒≤30秒；真实Response持有约36.9ms≤5秒，未触发4秒watchdog；释放后commit判据约48.9ms≤5秒。初始化完成至写出finally记录14.909秒≤90秒。没有任意sleep猜成功；唯一100ms派生cursor轮询分支实际未用（首次GET即追平）。每阶段预算/停止逻辑与真实数据均保留在`probe-corrected.ts`和`experiment.json`。

网络只白名单准确project/origin/session，临时Fetch pattern仅compact Response；对应请求的method、current view、无goal_id、networkId和唯一性均核实。无第二份compact/fallback/main导航、成员变化或控制期刷新记录；没有手发attention、timer mock、内部setter或第二次arm。raw logger的通用kind字段被network route的kind覆盖；需以method/status/cursor字段区分request/response/body读出，不能按缺少文字“request”说未监听。`business-summary.json`仅按这些字段与原probe分支提取关联，不修改raw。

## 为什么能签完整正常提交，以及局限

当前M的marker之后恢复链已静态核对（见PREFLIGHT）：applyUiState、关系预览、Goal事件绑定是同步尾段，graph loaded=true且modegraph才会另起loadGoalGraph。实际graphLoaded在前后均false，排除本次该后置async分支；task后观察到documentSyncing=false；因前态也已false，不能单凭它证明收尾rAF执行。完整提交由准确M的同步尾段、适用后置状态与无恢复异常组合支持，不以该false字段单独证明完成。marker/newGoal更新后的task后快照里：documentSyncing=false，current project与Feed tab保持，mobileView=document、task=all、selectedSource空，dialog始终hidden、无busy，所有固定refs连接且仍为当前对象，body同一且visible。workspaceMode由focus变graph，符合当前readUiState保存goalWorkspaceMode、applyUiState恢复它的源码路径；不是把预期写成保持focus。没有据此另开UI修复。

浏览器窗口内有限console warning/error与Runtime监听没有恢复失败记录，`failures=[]`；本轮没有“marker变了但Goal refresh failed”的异常分支。**原始Host日志仍有workspace-settings opened_announce_failed/actions.missing warning**，它不是Chrome Runtime console恢复异常，不声称全局零错误，也不将其邻接关系当菜单因果。异步Fetch/Network回调错误均归集，最终为空；cleanup callbacks-settle成功。

可信事件列表仅包含对照summary/add/close和处理阶段打开summary；处理summary之后到提交快照之间没有其它关闭/选择输入、membership事件。menu/summary/add/dialog是测试侧保存的真实引用，未给节点加属性或改业务状态；后态same=true且全部connected=true，没有用孤立旧menu的open值冒充当前菜单。

**closed menu时的几何采样局限：** 后态`menu.open=false`，但addVisible仍true、addRect仍为正值。该布尔只是getClientRects/rect宽高的几何采样，不检查closed details的实际绘制、hit或可输入性，不能证明add仍可见可点，也不能据它否定菜单关闭。实际前后图清楚显示来源面板从展开到收起，判定依`menu.open`加同一对象/输入记录及图；关闭后没有再点击add或重新展开取点。

图：[释放前](/private/tmp/t389-menu-evidence/before-release.png)、[正常提交后](/private/tmp/t389-menu-evidence/after-commit.png)。观察/闸门刻意安排“真实response已就绪→用户开菜单→释放并提交”，只证明该当前交错可发生状态丢失，不测自然概率。没有证明chooser关闭（本处理阶段chooser从未打开）、add click丢失（关闭后没发add）、390专属或旧CI根因。阶段1和旧Linux原记保持。

## 冻结、清理与交接

首尝试原件在attempt-1；修正唯一差异为initialization-only.diff，实际运行版本为probe-corrected.ts/probe-corrected.diff及corrected-binding.json。原始业务log、exit、准确build绑定、experiment.json、business-summary及两图齐全；PREFLIGHT与被根替代的初始化建议均保留，不把未执行计划当证据。

原样continue后没有剩余paused请求；finally各项Fetch.disable、页面listener stop、异步callbacks-settle均成功。公共fixture随后自然清理Chrome、Host、server、db及Home/profile，raw无teardown错误；协议finally实际短于2ms，文件总20.315秒减已初始化段14.909秒的5.407秒还包含导入/初始化，因此给后续fixture及协议清理提供约5.41秒的保守上界，低于15秒，而非另造精确teardown打点。清理前无fixture Home/本次Chrome/test进程，九个runtime目录已准确删除，无手动kill；public槽最终free。临时probe已删除，工作树Git干净停在M，matching构建保留供只读独立核验。见business-cleanup.json；attempt-1/cleanup.json单独保第一次清理。

**作者明确交回writer。** 不自行修产品、不新增运行；根按准确原件安排独立审验，再更新同一WO决定最小修法。当前完成的是本次受控诊断，不是修复/回归/CI/采用。

## 文字修正说明（独立二审核收后）

原表格“既有is-syncing收尾已完成”和正文“同时观察并等待现有生产收尾rAF移除is-syncing”表述过强，现已更正。probe只检查task后false，原件前态也false，没有true→false或rAF命中记录；完整提交结论依据绑定M同步尾段、适用后置状态与无恢复异常的组合。仅修改本报告，probe、原始数据和执行次数不变，未补跑；writer保持已交回。
