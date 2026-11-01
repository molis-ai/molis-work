# W6-05 原场景5隔离执行合同

负责人：验证线4；状态：准备完成、未执行。根另给最终执行树E；当前只读定位切点为main `b6f92222fce89dfba756a580768889292cfe9967`，tree=`a93880d7fceabb2d2ed57d2524ecefe1aec86ac9`。本书不宣布READY，不采用T377、T116、T402等未合代码。

复用 `/private/tmp/w6-final-execution/PLAN.md` §2～6、`/private/tmp/codex-w6-closeout/w6-03-scenario-walk-plan.md` 的前端/测试/并行约束，以及 `specs/archive/post-merge-review/spec.md` §5原场景5。只准备原“底栏、设置、Shelf、灵光开关/返回；标签增删/暂存；刷新、后退、分屏”，不建全组件矩阵，不接场景7的项目切换、移动、权限、搜索链。

## 执行前只补这些输入

根核T377实际采用及相关失败重试/后台恢复证据后指定E、准确head/tree和可用的匹配整体构建；未到时只保留本计划。T377候选9/9、Verify或排入Full不算采用，也不抵本场景。E若与本定位切点不同，只核本书涉及的壳、右栏、标签、Goals/Shelf/灵光及夹具差异，再沿用或补受影响步，不机械重跑历史绿项。E到最终F亦按同样办法由根核抵。

后续仅独立Home/系统HOME/CFFIXED_USER_HOME/XDG及file secret backend、adhoc helper签名；显式最小环境，不继承用户模型/账号token/NODE_OPTIONS。使用公共machine-slot，一个build槽、一个browser批次、jobs1；只用MOLIS_WORK_TEST_CHROME指定的molis-test-browser与自有profile。匹配构建已有则复用；若缺，根排整体build窗口后才执行。复用test-kit、goal-browser/plugin-frame-browser及现有owner夹具，不另造Host或复制私人配置；不启动日常Chrome，不访问真实Home、4207、Keychain、Memory、模型或外部账号。

## 固定内容与现行入口

- 一个合成示例项目P，沿现有`openGoalBrowser(t,true)`准备方式，使用已有`CORE`与`INTERFACES`两条Goal（记录其真实id/标题）；不跨项目、不改放置。入口`/projects/P/`，底栏Goals，标签条“＋”及标签菜单。
- 两份仅存在自有临时目录的UTF-8材料：`scene5-A.md`内容`# 场景5 A\n保存前 A`，`scene5-B.md`内容`# 场景5 B\n保持 B`。经现有Shelf owner夹具`openTestShelfStore(home,{disabled:true}).admit(...)`准备，保存返回id；这是合成数据准备，不称作UI导入验证。Shelf不启动运行工具/提取/模型。
- 底栏右侧`[data-side-toggle]`开关右栏；Shelf为`plugin:shelf/side`，灵光为`plugin:lingguang/side`，都用实际可见tab点击。Shelf行/编辑/返回为`[data-shelf-item]`、`[data-shelf-edit]`、`[data-shelf-editor]`、`[data-shelf-collapse]`，位于对应插件frame。
- 全局设置入口`[data-directory-open=settings]`，退出用实际“返回工作台”/关闭按钮；主区灵光从现有插件菜单或“＋→灵光”打开，不调用灵光生成/对话。

**历史映射有现行依据。** `specs/side-shelf/spec.md` §3.1～3.2已将Shelf/灵光底栏双按钮收为右栏单按钮，Shelf不再主区打开；因此右栏的Shelf↔灵光检查选中格、开关和内容，不强加浏览器历史。主区历史用Goals↔灵光实走。`specs/plugin-tab-groups/spec.md`明确取代“插件首页不开标签”，当前应有每栏每插件唯一组头；原增删/恢复约束保留，不重新要求旧位置芯片或临时preview标签。“暂存”分别以打开标签/撤销恢复和Shelf最后输入留存证明，不把关闭标签当删除业务内容。

## 最小真实动线（同一Home顺序完成）

1. **底栏→设置→返回。** 从P首页点Goals，打开CORE，记当前记录和标签；从实际设置入口进入全局设置，只查看，不改模型/记忆/执行工具。点返回工作台，核仍为P、CORE内容/原标签保留，无新增重复标签。开关一次右栏后再次返回CORE，主区没有被右栏操作替换。
2. **Shelf/灵光开关与最后输入。** 用底栏开右栏，点Shelf及A材料，编辑为`# 场景5 A\n保存前 A\n最后一键甲`，输入末字后立即点预览“返回”，等待真实保存完成，不靠固定sleep。重新打开A，核末字、完整正文；用Shelf owner公开读取核实际副本字节，B仍为原文。点右栏灵光，核正确页或真实空态，再切回Shelf核A；关闭右栏再打开，按现行“上次选中格”恢复，主区CORE仍在。不构造失败/后台恢复替T377验收。
3. **标签增加、关闭、撤销。** 回Goals列表，用真实⌘/Ctrl点击分别多开CORE和INTERFACES条目标签（或复用已开的同一项），核每个条目对应正确内容、已有CORE未被替换、同栏仅一个Goals组头。关闭INTERFACES标签，点可见“撤销关闭”恢复；核返回同一条目、顺序和当前项。关闭/撤销整组只走一次，核条目内容仍存在；不扩到所有标签菜单/拖动组合。
4. **历史与刷新。** 当前窗格从Goals组头进入主区灵光，再用工作台`[data-workspace-history=back/forward]`往返，核当前面与标签对应。另从地址栏真实导航到同项目`/projects/P/settings/general`，点页面“返回工作台”，再用浏览器后退/前进核实际URL、设置面及工作台一致；这与壳内覆盖层/局部历史分开，不能假定点全局设置就产生浏览器history。停在CORE后刷新，核恢复同一真实记录、标签/组和正文，无重复标签；重新开右栏时核记住的格及A持久内容，按当前合同不要求刷新后侧栏自动保持展开。
5. **向右分屏与两栏独立。** 用现有分屏按钮`[data-tab-split]→[data-layout-split=right]`（或可见右边缘分屏控件）得到两栏；左栏CORE、右栏INTERFACES。分别从实际frame读记录id/标题/正文，不能只数两块容器。只在右栏切到灵光再返回、关掉/撤销右栏条目，左栏当前记录和标签不变；再只切左栏，右栏不变。刷新后核两栏布局、各自活动条目与内容仍对应，最后关闭右栏核左栏可继续操作。只验证窗格独立，不移动任何业务对象、不做场景7的权限试验。

操作均用真实指针/键盘送达可见控件；DOM/存储只读取作观察，不直接改localStorage/工作台状态、dispatchEvent或全局导航函数来冒充点击。遇loading/inert遮挡、错误、内容丢失或串栏，保留首败/请求和实际目标，先判生产链或环境；不加sleep、放宽断言、刷新抹错或转DOM.click求绿。只停本次pid并清自有Home/profile；失败/取消也清理，不按Chrome名称批量杀进程。

## 已有证据与本次缺口

- 原post-merge-review §5场景5在旧隔离4302/62cbc14d构建记录为通过：开关、前后步、刷新、两独立窗格、无脚本错误。它是可保留的历史结果，不能改署E；原UI“插件首页不开标签”已被上述现行合同取代。
- 当前源码可直接复用的路径：`workbench-tab-workspace.e2e.test.ts`含history、CORE/INTERFACES、刷新及分屏；`plugin-tab-groups.e2e.test.ts`含真实组合键多开、分栏内组关闭/撤销；`workbench-current-tabs.e2e.test.ts`含当前item/组/分屏恢复；`cross-plugin-recovery.e2e.test.ts`的Shelf单例含最后输入→owner字节→返回重开及失败草稿；`desktop-shelf-side.e2e.test.ts`含右栏开关，但桌面桥为替身，不是原生壳实操。本轮只读定位，不声称这些文件在E已运行。
- T377相关首败/恢复沿原owner及`/private/tmp/t377-readiness/`原件核收，未采用之前不取其分支执行本场景。最终E上的上述连续真实UI动线、设置返回/浏览器历史与两栏内容独立仍缺；已有有效完整文件运行由根按准确树/构建/真实覆盖核抵，仅补差集，不预设重跑上述全部文件，也不抽受HOLD子例。
- 原FR的视宽、语言、明暗、键盘及本人视觉认可仍沿既有验收记录核抵；本次选现有桌面1440×1000作为连续操作起点，不加截图数量、尺寸/性能指标或新验收号，不据单宽中文动线签FR全部完成。

执行报告只需绑定E/head/tree、构建来源/环境、实际P/材料id、上述各步通过/失败/未运行与原因，并附必要原日志/现有QA证据；UI结果与owner持久正文及刷新后可观察结果相互印证。截图写自有临时目录或既有忽略QA路径，不入库。场景5局部结果不代签整个W6-05、真实Home、真实模型、T377恢复或用户认可；最终F/采用/汇总由根裁定。

本次交付仅此计划；未build/test/启动浏览器、未改源码/coord/GitHub/真实Home/Memory，未重跑T351，也未创建执行槽或工作树。

## 根核收（2026-11-01 00:14Z）

最小执行合同已核收，右栏/标签组按现行合同解释原场景。等待T377实际采用后根给E；不取候选提前执行、不重跑T351，不因本计划补建全组件矩阵。
