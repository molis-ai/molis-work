# 系统性代码与架构防腐整理

状态：执行中，整线未完成（2026-10-18 起由 Claude 接手收口：平台能力与去特权归 ② 平台会话，插件迁移与 Codex 留下的候选归 ③ 迁移会话，审查与合并归 ① 统筹；范围按 §1 10-18「这一轮的收口范围」，W5、W6 全做完。Codex 10-17～10-18 的接续复查见 §10.27）。I8 的修复树 F109 按 §1 10-15 的决定整树一个 PR，#523 已合入 main（`f74e29d86`；#522 是 Pages 编辑器的单次资源例外）；全量在 CI 分片跑，macOS 专有用例在本机补，失败逐个对照 main 基线，合入后的三项 Linux 修复与一处合并留下的旧错误码在后续 PR 补进。10-15 代码回溯审查的 C-03、C-05、C-06 与文档尾项在 #514 修，C-01、C-02、C-04、A-01、A-04 随 #523 进了 main（§10.12）。下一步接第 4–6 波与 B-01～B-12 的结构项。10-14 独立复查见 §10.11。

共享候选收尾验证（2026-10-18，Codex）：既有候选组合 `a212e9369` 的 [CI 全量 39153520650](https://github.com/molis-ai/molis-work/actions/runs/39153520650) 已完成：16/16 分片及汇总成功，1,128/1,128 个测试文件通过；`side-shelf-in-hand.e2e.test.ts` 首次失败、运行器自动重试一次通过，保留这项不稳定记录。Linux 排除的 25 个 Mac 专属非浏览器文件在同一固定组合上补跑，25/25 文件、303 条通过，1 条真实 npm 包安装按既有 opt-in 跳过。未操作真实 Home、钥匙串或 launchctl。此结果结算下面各片旧“待共享全量”的记录，不代表各片已合 main 或整条 W5/W6 完成。

本轮全量修复已在原候选完成并传播：Cognia/Images/Jelly 删除重复页面挂载，保留唯一 Runtime 业务视图；旧路由及 SHM 模型失败断言对齐现行合同；Pages 保存/取消调用当前评论弹层关闭句柄；Alchemist 的 Host.close 保留并发与成功后的 Promise 身份，失败才允许显式重试，已成功关闭的基础资源不重关。原拒绝、持久化与恢复断言保留。最终全量中 `system-agent-service` 3/3、`pages-previews` 2/2、`lingguang-plugin` 4/4、`interaction-no-crosstalk` 4/4 均一次通过；跨项目浏览器历史 HTTP 清理超时的根因仍未定，不据一次通过宣称修复。

全量启动后，main 的 placement 关闭修复 #740 已实际合入 `be0158e53`。所有候选同步同一三文件；本地组合 `d5429d136` 相对云端冻结提交仅多该修复，整体构建、placement/重启/Alchemist/Host 关闭六文件 59 条及完整 health、boundary、资源与 secrets 检查全部通过。精确结果分别归上述两个提交；本批按依赖顺序逐片通过正式 CI、合并队列与实际 main 后结算，当前 handoff 只覆盖防腐部分，由 Claude 汇总。

Pages 共享全量补修（2026-10-18，本地通过，待新共享全量）：39147615440 第 11 分片在评论保存后再次点击预览按钮失败，评论 textarea 仍挡在按钮上；原本机两条通过，说明原断言未直接验证表单关闭。当前评论提取模块接收 `hidePop` 的值，而 `showPop` 会在入口重绑该函数，保存/取消可能仍调用上一弹层的关闭句柄。`W5-10-PPV-03`：评论保存与点击取消都立即关闭本次表单，保留原编辑结果/取消零写、Escape、重新打开及真点击遮挡检查；加强断言在当前候选与干净 main 同样 1/2 失败（保存后 hidden=false），原 main 的评论提取与传值实现相同；这是新回归暴露的既有缺陷。最小修复为传入动态调用当前关闭句柄的闭包；测试固定在 CI 的 780×493 视口，保留真实点击，增加保存/按钮取消关闭断言，原 Escape 路径保持。范围限定 Pages 入口、原 previews 浏览器回归、本 spec 与实测下降资源记录；公开 API、动作、持久化、样式和门禁不改。整体构建、完整 merge-base health（含 API 快照）、boundary 和资源通过；23 文件 184 条有完整通过证据，含 8 个 Chrome 文件 41 条。首轮两条导航超时、182/184，其余 21 文件通过；两失败文件原样串行浏览器复跑 14/14，干净 main 同文件也 14/14，无断言/时限更改。正式编辑器 706,942 B，仍比 main 的 707,007 B 少 65 B，25 项总 7,480,167 B，无新增额度。日志 `/tmp/molis-pages-preview-{fix-*,navigation-current,navigation-baseline}.log`；新共享全量、正式 PR/CI 另结算。



Pages 交接收口（2026-10-18，本地组合通过）：既有命令与编辑器职责拆分已合入当前 Runtime、D1 成果服务、Module 出口与 Images 翻译候选；Pages 行为补丁包括已复现的段间输入焦点、抓手 pointer capture，以及本轮共享全量暴露的评论表单关闭回调修复（见上）。整体构建、API（无新增变化）、boundary、merge-base health 及资源检查通过；15 个非浏览器文件 351 条、6 个真实 Chrome 文件 29 条通过，覆盖正式编辑器预览、工具、键盘、拖拽、插入及工作台窄屏。本轮评论补修前，编辑器相对当时 main 为 707,007→706,928 B（−79），整组 25 项 7,478,901 B；因此删除中间 PPV 的 +103 B 许可，两个旧起点也加入不可复用断言，保留前置尚未消费的灵光及 Alchemist 许可。日志 `/tmp/molis-pages-closeout-*.log`。既有逐片基线对照证据保留；最终共享全量、PR/CI 与合并仍待，整条 W5-10 未完成。

W5-10 Pages 工具定义与选区投影拆分（PGT，2026-10-18，Codex，本地定向通过）：接 PGK `507f454bb`，目标为功能可用且行为保持。14 项工具定义、heading/list 命令工厂、分组与 pressed/opens 投影、选区 screen 归新内部 editor-tools；六行 runTool 留入口路由既有弹层或命令。commandToggle 沿用 keyboard 中唯一实现。工具定义在原时刻按原顺序创建，每次 tools/screen/runTool 只读或操作当次 view/state，不缓存视图或选区、不加 getView/controller/生命周期 owner。三段列表命令改用捕获固定 id 的同形工厂，tools/screen 的转发闭包直接放入原 handle，执行时机不变。外部同参数预演与原正式产物逐字节核对后，候选 served bytes 706,825，低于 PGK 的 706,839 B；正式构建已确认该值，关键行为按下述实操结果验收。

范围只含 Pages editor-tools/editor-browser、README、必要的位置断言与新 tools Chrome 用例、本 spec/迁移表和下降快照；公开 27 出口、handle、schema、存储、动作、Host、样式与构建参数保持。`W5-10-PGT-01`：14 工具与分组/字段/译文顺序、命令事务及剩余入口 AST 保持，依赖无环、无新巨大单元，整体构建与 merge-base health/API/boundary/资源通过，正式脚本不超过 706,839 B。`W5-10-PGT-02`：新真实 Chrome 用例先在 PGK 正式资源通过，再在本片通过；从公开 mount/handle 验动态 pressed、只读 tools/screen 无额外通知、命令正文/邻居/选区/undo/focus，以及 tone/link/comment 路由；未知 id 不改正文或抢焦点。`W5-10-PGT-03`：setDoc 后工具和矩形使用新文档/选区，滚动和重挂仍正确，旧实例不受新 handle 影响；复用键盘与两项真实上下文工具栏用例，验证工作台接线及窄屏状态。矩形期望来自可见 DOM Range，不能复制被测算法。

先准备测试并跑 PGK 基线，再应用已审候选；writer 只写上述 Pages 源码/测试/README，root 串行维护共享文档、快照、正式整体构建与最终验收。只为这片增加能发现用户路径回归的用例，复用已证生命周期，不造全工具组合矩阵。正式入口 856→804、mount 568→537 行，仍有后续职责待拆；本片不代表 W5-10 完成，不运行本机全量、不新增第三个在途 PR。

本片验证：W5-10-PGT-01，14 项工具定义和译文次序、事务及其余入口 AST、27 个公开出口保持，55 个相对模块无环；新工具模块 65 行、最大函数 18 行。独立只读复查无 Blocker/P1；整体构建、完整 merge-base health/API、boundary 与资源门禁通过，下降快查已更新。正式脚本 706,839→706,825 B（−14），25 项共 7,476,131 B。W5-10-PGT-02/03 新增三条先在 PGK 正式资源通过，再在本片通过；最终 31 个非浏览器文件 620 条、7 个真实 Chrome 文件 43 条，共 38 文件 663 条通过，零跳过。首轮浏览器命令另含一个拼错且不存在的文件名，该项没有执行；保留其失败日志，之后单独运行实际 plugin-small-ux，16/16 通过，其余六份 27 条不重复跑。

运行证据：`/tmp/molis-pages-tools-{build,browser,small-ux,boundary,health,assets}.log`，新用例基线 `/tmp/molis-pages-tools-baseline.log`；31 非浏览器文件沿用 `/tmp/molis-pages-keyboard-required.json`，逐文件通过终态保存在本次运行器输出，未重造日志。Chrome 验证正式资源、公开 handle 与实际工作台工具栏/窄屏，不代表外部模型质量或一骏本人验收；本机全量未跑，剩余 mount 职责继续。

W5-10 Pages 键盘命令装配拆分（2026-10-18，Codex，本地定向通过，待队列与 CI）：接已验证的 PGP，目标为功能可用且行为保持。将 mount 中 37 个自定义绑定按原连续顺序分成 shortcutKeys、blockKeys、navigationKeys 三个短职责函数，由新内部 editor-keyboard 的 pagesKeymap 装配成原位置的同一个 keymap 插件；turnCurrent、applySelected、nudgeTableColumn、cellNav 一并迁入，共用 commandToggle 仍只有一份供键盘与工具栏使用。每个 mount 仍创建自己的键表；原闭包 view 改为 ProseMirror keydownHandler 每次执行给出的第三参数，不在装配时读 view，不引入 view/selection 缓存或 getView 端口。只把现有 openLink 回调交给该模块，弹层 owner 与生命周期保持。 `turnCurrent(id)` 只捕获固定目标，执行时取第三参数 view；上下方向和 Tab 的镜像分支在同一职责中收成方向函数，保持无变化 transaction 的返回值、Tab 最终吞键与 Shift-Tab 不增行。

范围只含 Pages 新内部模块、editor-browser、README、受影响的位置断言、新 Chrome 键盘用例、本 spec/迁移表与下降快照；公开 27 出口、文档/存储/动作/Host/样式、插件数组顺序不变。保留 Enter 的逐项回退至 task/base keymap、Backspace/Delete 的组优先与 base 回退、Tab/Shift-Tab 的表格/代码/列表/容器次序及吞键、Arrow 的短路和边界返回、格式/复制/移动/历史的原事务与 focus。Mod-c/x 保持原 execCommand 与 boolean 返回；不改系统剪贴板或平台键位。依赖只向原命令/schema/选择/查找模块，不回指入口。键盘拆分不代表整个 mount 或 W5-10 完成。

`W5-10-PGK-01`：37 键名和顺序、各 handler/chain/返回逐项对照，view 参数化按现行 keydownHandler 合同单列；公开出口与其余入口 AST 保持，无循环/新巨大单元，正式编辑器资源不超过 706888 B，完整 merge-base health/API/boundary/资源通过。`W5-10-PGK-02`：新用例先在 PGP 正式资源通过、再在最终资源通过；真实 Chrome 键盘验证格式/块转换/复制/历史、Enter与删除回退、表格/代码/容器Tab和导航的代表状态，断言文档/选区/相邻内容/undo/focus。`W5-10-PGK-03`：同一编辑器 setDoc 和 destroy/remount 后命令作用于当前实例，slash/mention、块菜单/拖拽capture、find与clipboard优先级由原浏览器用例保持；Mac Chrome为实操平台，保留原 Mod 依赖与键名支持跨平台判断，不把模拟平台当作Windows/AltGr实操。

先准备新测试并跑拆分前基线，再外部候选预览和语义对照，通过预算后应用源码；只在本职责内去确实重复，不能改门禁/minifier或将整键表换成巨大函数。子代理负责有限源码/测试路径，root串行维护共享spec/快照、最终整体构建、README必跑与相关浏览器。独立只读复查与实际diff核验后记本地完成，不运行本机全量、不新增第三个在途PR。

本片验证：W5-10-PGK-01，入口 1,092→856 行、mount 752→568 行；新键盘模块最大函数 66 行，37 个绑定及顺序、27 个公开出口保持，54 个相对模块无环。独立只读复查无 Blocker/P1；整体构建、boundary、完整 merge-base health/API、下降快查与资源通过。正式编辑器脚本 706,888→706,839 B（−49），25 项共 7,476,145 B。W5-10-PGK-02/03 的新键盘 4 条先在 PGP 正式资源通过；最终 31 个非浏览器文件 620 条、9 个真实 Chrome 文件 41 条，共 40 文件 661 条通过，零失败/跳过。浏览器覆盖 keyboard、find、insert、menu、drag、clipboard、content-editing、small-ux 与 portable；逐项结果由运行器终态核对。构建、浏览器和门禁日志为 `/tmp/molis-pages-keyboard-{build,browser,boundary,health,assets}.log`，非浏览器清单 `/tmp/molis-pages-keyboard-required.json`，其结果保存在本次运行器输出中，未重造日志。未验证系统剪贴板与 Windows/AltGr 实操；本机全量未运行，整个 mount/W5-10 仍继续。

W5-10 Pages 剪贴板与图片拖入拆分（2026-10-18，Codex，本地定向通过，待队列与 CI）：接块手柄提交 `5109581ba`，目标为功能可用且行为保持。把 mount 内的 paste、图片 drop/dragover、copy/cut 及 writeSpanClipboard 移到现有 `editor-paste.ts`，共用的 dropSelectedBlock 移到 `editor-block-selection.ts`；入口只装配事件处理器。保持图片→块组选区替换→Shift 纯文本→URL→HTML→Markdown 的分支顺序，复制先写完整 HTML/Markdown、剪切后删选中块；图片仍由既有 transient 持有映射锚点并处理换文档/销毁，继续同一 dispatchTransaction 和 onChange 链。处理器使用当前事件传入的 EditorView，不另存 view/selection、不增加监听 owner。范围仅这些 Pages 内部模块、README、受影响的位置断言、新剪贴板浏览器用例、本 spec/迁移表与下降快照；不改公开 API、schema、存储、Host、样式、模型、生命周期顺序与资源门禁。键盘、弹层和 AI 留后续片；本片不表示整个 mount 或 W5-10 完成。

`W5-10-PGP-01`：27 个公开出口/签名保持，模块无环、无新巨大单元，mount/入口实测减少，正式编辑器资源不超过 PGH 的706897 B并通过merge-base资源门禁。`W5-10-PGP-02`：正式bundle/CSS和公开mount的Chrome事件链验证多块copy/cut的HTML与Markdown、正文变化/undo、整组替换与邻块保留，以及HTML/URL/结构化Markdown/Shift纯文本优先级；空和不支持输入不多写正文。`W5-10-PGP-03`：真实DOM图片paste/drop及落点、等待中的映射锚点、换文档/销毁后零写入、重挂可用；优先复用原W2-18-PAGES-TRANSIENT-01，不复制异步夹具。DataTransfer/ClipboardEvent只证明浏览器编辑路径，不声明系统剪贴板或系统拖入授权已验证。新动线先在PGH正式资源保存基线，再应用拆分；最终整体build、README必跑与相关浏览器、health/API/boundary/资源/diff核验，本机不跑全量。资源若增长先在本职责内去真实重复，不改门禁或借无关模块抵扣；无法同时满足时记录具体差值。

本片验证：W5-10-PGP-01，入口 1,204→1,092 行、mount 828→752 行；剪贴板 owner 157 行，最大函数 50 行，27 个公开出口保持、53 个相对模块无环。原事件处理正文逐项 AST 保持，HTML 读取的两段相同循环合为 leavesFromDom，保留空字符串；独立只读复查无 Blocker/P1。整体构建、boundary、完整 merge-base health/API、下降快查与资源通过，正式脚本 706,897→706,888 B（−9），25 项共 7,476,194 B。31 个非浏览器文件 620 条、8 个真实 Chrome 文件 37 条，共 39 文件 657 条通过，零失败/跳过。W5-10-PGP-02/03 的新用例先在 PGH 正式资源通过，拆分后再次通过；既有内容状态用例验证延迟图片映射及跨文档取消。两项浏览器文件名首轮误写，按 README 更正后补跑通过；资源检查要求收紧减少的 9 B，更新后 71 条预算回归全过。没有放宽业务断言或门禁。日志 `/tmp/molis-pages-clipboard-{build,required,browser,browser-completion,budget-recheck,boundary,health,health-update,assets}.log`。事件夹具不代替操作系统剪贴板/文件拖入实操；本机全量未运行，整个 mount/W5-10 仍继续。

W5-10 Pages 块手柄与拖拽拆分（2026-10-18，Codex，本地定向通过，待队列与 CI）：接块菜单 `8da33bf57`，目标为功能可用且行为保持。将悬浮插件剩余职责分成块选择状态/属性及装配、手柄定位/菜单协调/监听生命周期、拖拽会话/预览/提交/取消；分别归 Pages 内部模块。已有 hover PluginKey、选区事实与 DragPreview/commitDrag 原实现仍各一份；拖拽只持有当前手势，手柄只持有自己的 DOM/当前位置，互相经必要的当前状态读取和关闭/hover 回调协调，模块不回指入口。保留 5px 启动阈值、按下未移动的菜单点击、Shift 多选、Alt 复制、拖动期间按键隔离、滚动/resize/blur/capture 丢失/Escape 取消、正文变化导致取消、撤销及销毁清理。输入仍为当前 EditorView、翻译和备注回调；输出仍为原事务/DOM，预览不提前写正文。

新增基线发现：鼠标按下抓手后，原实现将 pointer capture 交给外层手柄，松开及随后的 click 目标被浏览器重定为外层 div；点击处理只认内部 `[data-pages-grip]`，所以单击无响应。真实 Chrome 捕获阶段事件记录证实此路径，拖拽移动/Alt 复制/取消的独立用例仍通过。最小修复让同一抓手按钮捕获和释放指针，保留原手柄上的冒泡监听与拖拽流程。此项是明确的行为修复，除它以外按语义保持核验。拖拽夹具需在鼠标移动时同时声明被按住的 left button；原先只给 buttons=1 而 button=none 导致 CDP 释放捕获，已修正夹具，不把它报成产品缺陷。

范围为 Pages 内部实现/README、跟随实现位置的源码断言、新真实 Chrome 拖拽回归、下降快查、迁移表与本 spec；公开出口、动作、文档 schema、持久化、Host、模型、样式及门禁不改。`W5-10-PGH-01` 原状态/事件/命令顺序和 27 个公开出口保持，新增类/函数/文件均低于原阈值、无循环、正式资源不增加；`W5-10-PGH-02` 正式资源与 CSS 的真实 Chrome 先在拆分前验证点击开菜单、拖拽预览不改正文、释放后移动、Alt 复制、撤销、Escape/正文变化取消与销毁重挂，同断言在拆分后通过。整体构建后运行 Pages README 必跑及命令/拖拽/相关编辑浏览器，完整 merge-base health/API、boundary、资源、文档及 diff 核验。若新用例暴露原生产缺陷，先辨明夹具与原版本证据，再在本段明确最小修复；不把行为改变伪称纯移动。本机不跑全量，仍不据此宣称整条 W5-10 完成。

本片验证：整体构建、boundary、完整 merge-base health/API、资源与 diff 检查通过；33 个非浏览器文件 626 条、7 个真实 Chrome 文件 34 条，共 40 文件 660 条通过，零失败/跳过。源码定位断言随新 owner 更新后通过，未放宽业务断言。PGH-01：主会话复核原公开声明正文一致、53 个相对模块无环；悬浮状态/装饰、手柄协调/定位、拖拽/绘制分成五个内部模块，最大新函数130行，原521行插件与399行嵌套view消除；入口1816→1204行，mount仍828行。PGH-02：正式Chrome覆盖点击菜单、预览不改文档、移动/Alt复制/撤销、Escape/正文变更取消、销毁重挂；工作区自动滚动和blur/resize/lostpointercapture未逐项实操，不宣称全覆盖。正式编辑器资源706917→706897 B（−20），25项共7476203 B；巨大单元133→131，仅下调原快查。日志 `/tmp/molis-pages-block-handle-{final-build,final-targeted,final-editing,final-required,final-browser,health,health-update,boundary,assets}.log`；新增点击回归在原8da版本失败、最小抓手修复与最终版本通过。未运行本机全量，Pages剩余mount/store及整线仍继续。

W5-10 Pages 块菜单拆分（2026-10-17，Codex，本地定向通过，待队列与 CI）：接插入插件 `225388a02`，目标为功能可用且行为保持。悬浮插件的菜单 DOM、菜单模式、转换/色调/表格/单块和多块操作、键盘及鼠标高亮归内部 `editor-block-menu.ts`；一份菜单实例拥有自身状态和生命周期，从编辑器当前位置和同一 PluginKey 读选择。原块选择键与真正被菜单/主入口共同调用的选择、移动、复制/删除命令归 `editor-block-selection.ts`，不另存选择事实、不回指主入口。菜单按职责分方法与短 DOM 助手，所有新增单元在原阈值内；悬浮插件保留拖拽/手柄职责，下一片继续，不把原巨大闭包原样换文件。输入仍为当前 EditorView、位置读取、翻译和备注回调，输出仍为原事务与菜单 DOM；动作顺序、拒绝有损转换、选择范围、焦点、撤销、滚动关闭及销毁保持。

范围为 Pages 内部模块/README、跟随源码主人的原断言、补充 Chrome 行为回归、下降快查与本 spec/迁移表；不改公开导出、schema、存储、Host、样式、模型或门禁。`W5-10-PGM-01` 原入口和块操作语义保持、依赖无环、无新增巨大单元、正式资源不增加；`W5-10-PGM-02` 真实 Chrome 验证键盘打开与子菜单导航、转换/颜色、复制/删除/撤销、多块选择及销毁重挂，先在原生产代码通过，拆分后同样通过。继续运行 README 必跑与编辑/插入/往返相关回归；整体构建后完整 merge-base health/API、boundary、资源和实际 diff 核验。不运行本机全量，不将该局部完成当作整条 W5-10 完成。

本片验证：`W5-10-PGM-01` 原入口除悬浮插件以外的 35 个声明、31 个悬浮/拖拽声明、8 个手柄监听及 Plugin 状态/按键属性逐项 AST 保持；菜单的关闭/打开/高亮/按键/按钮助手经反向替换后相同，渲染分支及共用提交/移动/模式助手另外对照操作顺序核验；27 个公开出口保持。新菜单类 241 行、22 个方法（含构造与访问器），菜单文件 321 行，选择模块 75 行；入口 2,188→1,816，悬浮插件 795→521、view 673→399，原 173 行 renderMenu 消除，巨大单元 134→133。最终整体构建、boundary、完整 merge-base health/API 与下降快查通过，正式资源 706,962→706,917 B，25 项 7,476,223 B。

`W5-10-PGM-02` 同一浏览器用例在保存的原生产入口和最终正式资源均通过，覆盖菜单导航、单块转换/颜色/复制/删除、撤销、多块选择/复制、Escape 和销毁重挂。夹具首次在未滚入视口的删除按钮中心点击，被裁切菜单挡住；随后按真实点击命中检查滚到按钮处。另一次失败经新旧代码对照和按键诊断定位：原生 Shift+↓ 选择尚未通过 selectionchange 同步时，用例已立即发下一次按键并读取结果；现等待实际内部选区非空，再继续按键及等待两块高亮，没有固定延时或放宽断言。诊断监听已移除，生产实现无需改动。最终去重 31 非浏览器文件 620 条、六个 Chrome 文件 32 条，共 37 文件 652 条通过、零跳过；资源文件初跑读到更新前预算，写入实测下降值后只重跑该文件 71 条通过。日志 `/tmp/molis-pages-block-menu-{build,regression,browser,assets-test,health,health-update,boundary,assets}.log`，最终新旧浏览器对照 `/tmp/molis-pages-block-menu-selection-settled.log`。未运行本机全量、未作逐项真人验收；拖拽/手柄和挂载主体继续，整条 W5-10 未完成。

W5-10 Pages 插入插件拆分（2026-10-17，Codex，本地定向通过，待队列与 CI）：从查找候选 `262ebff76` 接续，目标为功能可用；拆分保持既有语义，并修复下述真实段间输入焦点缺陷。斜杠菜单和 @ 文档提及（共用显示/关闭规则，并通过 slash 状态互斥）归 `editor-insert-menu.ts`；段间输入与占位装饰归 `editor-gap.ts`；实际由主编辑器和段间输入共用的图片/HTML 剪贴板读取归 `editor-paste.ts`。菜单键仍各一份，悬浮块插件读取同一键；共用滚动定位函数归既有 editor-view-ui。原有段落构造只内部导出，主入口继续调用同一实现。斜杠的图片选择回调独立成短函数，两个菜单相同的选中项 DOM 更新、定位和滚动共用，避免把 158 行函数原样搬到新文件。挂载插件顺序、事件/事务、选择图片后的文档归属与取消、输入法、段间草稿提交/撤销和销毁保持。新增基线 Chrome 证明：加载正式 CSS 后，点击段间条会出现临时输入区，但它嵌套在 contenteditable 编辑器内且不可独立聚焦，既有 `.focus()` 没有移走前一段的光标；输入 `AutoProbe` 得到 `AutoProbeBefore`，而非两块之间的新段落。仅加 tabIndex 能移焦点却未移动输入位置，真实输入仍得到 MiddleBefore。最小修复给已有临时输入区加不可编辑的外层，使其成为独立编辑根；仍走同一焦点调用、输入监听、事务和清理，不另写选区或提交逻辑。此项属于已复现的行为修复，不把它称为纯移动等价。

范围为 Pages 内部模块与 README、跟随实现主人的既有源码断言、补充的真实 Chrome 交互用例、下降快查、迁移表和本段；不改入口 API/动作/schema/持久化/Host/样式/模型/门禁，也不改其他在途 Pages client/import-client。`W5-10-PGI-01` 除临时输入区新增的非编辑外层外，原实现经内联小助手比对等价，27 个公开编辑器出口保持、无依赖回环、新单元均在阈值内、资源不增加；`W5-10-PGI-02` 斜杠过滤/键盘选择、@ 文档提及、退出菜单后正文保持与销毁清理经真实 Chrome 验证；`W5-10-PGI-03` 点击段间条即获得可输入焦点，输入插在原两块之间，拼音合成期间不写正文，选词后只提交一次；Escape/撤销、销毁后重挂仍可用。基线菜单用例已通过，段间用例在原实现失败（上段所述，正式脚本/CSS、真实点击和输入，不绕过焦点）；修复后要求同一断言通过。整体构建、先验正式资源，再跑 README 必跑及编辑/往返/查找浏览器回归、boundary 和完整 merge-base health/API。仍不跑本机全量，既有 mount/hover 留给后续，不据此宣称整条 W5-10 或逐项真人体验完成。

本片验证：`W5-10-PGI-01` 原入口 58 个声明与共用 UI 的 6 个声明经内联两个小助手后规范化 AST 相同，唯一行为差异为已声明的段间编辑根外层；27 个公开出口保持。新模块分别 406、205、45 行，斜杠插件 139 行，入口按健康口径 2,827→2,188 行，巨大单元 135→134。最终整体构建、boundary、完整 merge-base health/API、下降快查和文档门禁通过；正式脚本 706,978→706,962 B，25 项共 7,476,268 B。`W5-10-PGI-02/03` 的最终 Chrome 用例全部通过，覆盖真实点击/输入、拼音合成期间不写正文、选词一次提交、撤销、Escape、销毁和重挂。31 非浏览器文件 620 条及五个 Chrome 文件 31 条共 36 文件 651 条通过、零跳过。五文件首跑其余四文件 29 条通过；新文件先在最后的重挂表达式返回整个编辑器对象时遇到 CDP 序列化错误，将该表达式改成 void 后只重跑此文件两条通过，生产代码未再改。最初夹具遗漏正式 CSS、段落点击位置被菜单遮挡和重挂返回对象均已修正，未放宽行为断言。日志 `/tmp/molis-pages-insert-{root-build,root-regression,root-browser,remount-browser,health,health-update,boundary,root-assets}.log`；基线真实输入失败见 `/tmp/molis-pages-insert-before-input-proof.log`。未运行本机全量或真人验收，mount/hover 继续，整条 W5-10 未完成。

W5-10 Pages 查找替换拆分（2026-10-17，Codex，本地定向通过，待队列与 CI）：在节点视图提交 `09026e794` 后，把查找状态、PluginKey、查找栏生命周期和打开动作归到内部 `editor-find.ts`，浏览器入口只装配。目标为功能可用且行为等价；查找栏 DOM/事件/更新/销毁归一个低于阈值的视图工厂，插件本身保留状态与高亮声明；两处相同的 Escape 关闭逻辑在视图内共用，使现有 169 行 findPlugin 与视图工厂都低于 150 行阈值。保留查询/替换字符串、匹配索引、正反向循环、单个/全部替换、事务/撤销、Escape 返回焦点和销毁行为；保留当前单份 findView，不新增状态、模型调用或公共出口。依赖只指向既有 find、editor-types 和 editor-view-ui 叶子模块；入口依赖它，无回环。

范围为一个内部模块、入口 import/装配、README、定向浏览器测试、下降快查和本 spec/迁移表；不改文档 schema、持久化、动作/Host、样式、公开 API 或门禁。`W5-10-PGF-01` 原语义与 27 个编辑器出口保持，视图在同点创建、相同的关闭处理共用，无循环/新巨大单元，构建、boundary、完整 merge-base health/API 和资源不增加；`W5-10-PGF-02` 新 Chrome 用例通过生产挂载与真实 ProseMirror 验证查找高亮/计数、正反向循环、逐个和全部替换、键盘撤销、Escape、重开与销毁。结合现有 find 生产函数回归及 Pages README 必跑；不把挂载夹具的交互证明称为全用户流程或完整持久化验收。先整体构建，跑定向非浏览器和上述真实 Chrome；首个 refactor 前运行新用例，确保它描述当前行为。仍不运行本机全量；mount/hover/slash 后续继续，PR 队列不新增第三项。

本片验证：`W5-10-PGF-01` 原 63 个声明在内联视图/关闭助手后逐项规范化 AST 比对一致，27 个公开编辑器出口保持。新文件 209 行，findPlugin 27 行、视图工厂 140 行；入口按健康口径 3,031→2,827 行，巨大单元 136→135。最终整体构建、boundary、完整 merge-base health/API、下降快查和资源通过，Pages 对外脚本 706,997→706,978 B，25 项总计 7,476,284 B。最初的 DOM 创建助手使资源增加 175 B，改为视图工厂并合并相同关闭代码后按正式实测下降 19 B，没有改构建选项或门禁。`W5-10-PGF-02` 新用例在重构前与最终代码均通过，实际验证大小写无关查找、双向循环、高亮/计数、单个/全部/空文本替换、撤销、Escape、重开和销毁；最终代码另有 31 非浏览器文件 620 条全部通过，合计 32 文件 621 条零失败/跳过。资源优化前的同片四个 Chrome 文件 29 条已通过，最后只复跑改动直接覆盖的查找用例；这两批版本证据分别记录，不当作最终版本的四文件重跑。最初夹具挂在 Pages 列表的隐藏编辑舞台导致查找栏无法聚焦，已改在 Home 上加载同一正式资源并挂公开编辑器，拆分前即通过；未为该夹具问题改变产品。日志 `/tmp/molis-pages-find-{before-browser,first-browser,final-build,regression,final-browser,final-boundary,final-health,health-update,assets,assets-update}.log`。未运行本机全量、未触碰真实 Home，仍不宣称整条 W5-10 完成。

W5-10 Pages 节点视图拆分（2026-10-17，Codex，本地定向通过，待队列与 CI）：在命令族提交 `01f6b8005` 后，从仍有 3,829 行的 `editor-browser.ts` 收回各节点渲染职责。目标为功能可用且行为等价：布局节点（分栏、表格单元格、待办、折叠、提示块、提及、日历和目录容器）、媒体节点（书签、图片、代码及配套高亮）、引用/任务/日程卡片各归内部模块；原有编辑器类型与共用的翻译/图标/浮层/表单小函数各归一个叶子模块。入口继续原样导出既有类型和运行方法，挂载顺序与选区/弹层/延迟图片的生命周期保持；共享 PluginKey 仍只有一份。节点模块直接用现有命令与 transient API，不回指浏览器入口。先移动独立、低于阈值的函数；mount、hover、find、slash 的大函数保留原处，后续继续收小，不把整段巨大函数搬进新文件。

范围仅 Pages 编辑器内部源码/README、一个跟随 taskNodeView 主人的既有源码定位断言、验收注释、下降快查、迁移表与本段证据。原函数体、节点 DOM/监听器/释放、选区与事务、内容 schema、模型接口、公开导出、Host 和样式均保持；没有新依赖或存量迁移。`W5-10-PGV-01` 搬移的声明/实现逐项等价、公开入口不增减、内部依赖无环且新单元不超过阈值；`W5-10-PGV-02` 包要求及编辑器/转换/拖拽/评论回归保持，Chrome 覆盖现行挂载、编辑、文档切换与延迟图片/弹层归属、导入发布和内容往返。先整体构建，再跑上一片的相关非浏览器和七个 Chrome 文件；做完整 merge-base health/API、boundary、正式资源与实际 diff 检查，资源不增加，不改门禁规则。仍不运行本机全量，CI 与整个编辑器后续分片保持待完成；现有用例覆盖的路径和未逐个手动操作的节点交互分开记，不泛称完整真人验收。

本片验证：`W5-10-PGV-01` 全部 94 个原声明的实现逐项 AST 比对相同，27 个原编辑器出口保持；五个新模块均低于巨大单元阈值，只有叶子依赖，没有回指入口。健康口径下入口 3,829→3,031 行，现存 mount/hover/find/slash 仍在原文件，本片不算这些函数完成。`W5-10-PGV-02` 31 个非浏览器文件 620 条、七个真实 Chrome 文件 37 条全部通过，共 38 文件 657 条，零失败/跳过。整体构建、boundary、完整 merge-base health/API 与下降快查通过；健康检查包括已暂存的新模块。资源检查按实测下调 10 B 后通过：Pages 对外编辑器 707,007→706,997 B，25 项总计 7,476,303 B。日志 `/tmp/molis-pages-node-views-{build,regression,browser,boundary,health,health-update,assets,assets-update}.log`。既有 Chrome 覆盖编辑、切文档、延迟图片/弹层、评论、导入/发布和往返，不宣称逐个节点的全部手动体验已验，也未运行本机全量。

W5-10 Pages 命令族拆分（2026-10-17，Codex，本地定向通过，待队列与 CI）：按路线图和巨大单元迁移表先收 `plugins/native/pages/src/commands.ts` 的 2,241 行，目标为功能可用且行为等价。保留块编辑、选区、列表、折叠、分栏、代码、行内格式与 Markdown 的现行语义；按职责拆成 selection、blocks、insert、containers、caret、formatting、markdown 七个内部模块，`commands.ts` 只显式重导出现有名字。底层选区与位置读取不依赖执行命令；插入及容器命令使用块变更，模块之间不回指 barrel、不形成环。原有局部辅助函数只在有真实跨模块调用时内部导出，不加入包入口。函数体、执行顺序、ProseMirror Transaction、返回值及 dry-run 判断保持。输入仍是现行 EditorState/位置/命令参数，输出仍是现行 Transaction 或 Command；依赖与文档 schema 不变。

范围为上述源码、Pages README、既有测试的验收编号、下降的健康及资源快查和本段证据。`index.ts`/包 exports、动作、数据库、Host、路由、样式和 Skill 合同不改；不处理在途 #634 的 client/import-client，也不把这一片当成 editor mount/hover 或整条 W5-10 完成。基于 main `149faac7d` 的独立工作树；无迁移、读取兜底或新依赖。保留原入口使调用方无须切换，回滚可直接还原本片提交。

验收：`W5-10-PGC-01` 原命令入口及包入口导出的名字与类型保持，函数/常量实现逐项等价，新模块均不超过现行 800 行文件和函数阈值，无循环依赖；`W5-10-PGC-02` 块/列表/容器/选区/代码/格式/Markdown 的既有生产命令回归通过，撤销、边界和不适用时的拒绝保持；`W5-10-PGC-03` 真实 Chrome 的编辑与内容往返路径通过，打包编辑器正常加载，页面资源不增加。先整体 `pnpm build`，再运行 Pages README 必跑、`tests/pages-plugin.test.ts`、`tests/pages-input-rules.test.ts`、`tests/pages-conversion.test.ts`、拖拽与所有命令直接调用方；浏览器运行 `tests/plugin-small-ux.e2e.test.ts`、`tests/content-editing-regressions.e2e.test.ts`、`tests/content-portable-regressions.e2e.test.ts`、Pages 动作与导入路径。最后核对 boundary、完整 merge-base health、API 快照、资源与实际 diff。不运行本机全量；全量由统筹 CI 安排。此片无新增产品决定，若拆分导致资源变大，先分析打包顺序和命名，不修改门禁许可。

本片验证：`W5-10-PGC-01` 搬移前后逐项 AST 比对确认全部 139 个声明实现原样保留，原入口 113 个导出相同；构建后的包入口声明完全相同，113 个命令签名在解析同一导入类型名后相同。七个模块为 139～634 行，汇总入口 128 行，依赖无回环。`W5-10-PGC-02` README 必跑、命令/输入规则/转换/拖拽/评论及直接调用方共 29 文件 545 条全部通过。`W5-10-PGC-03` 七个真实 Chrome 文件 37 条全部通过，包括编辑状态、文稿切换保护、评论、导入/发布与内容往返；合计 36 文件 582 条，零失败/跳过。整体构建、boundary、完整 merge-base health/API（64 快照、2,506 声明）和资源检查通过，巨大单元 137→136，快查只删除原命令文件这一项；25 份页面资源共 7,476,313 B，Pages 编辑器对外资源保持 707,007 B，本片增量 0。日志 `/tmp/molis-pages-commands-{build,regression,browser,boundary,health,health-update,assets}.log`，定向非浏览器清单 `/tmp/molis-pages-commands-files.json`。首次健康检查只因本段把整线状态句挤出开头而失败，已把状态句保留在第三行并完整复跑通过，没有改门禁规则。未运行本机全量、未发布或触碰真实 Home，整条 W5-10 仍继续。

灵光浏览器失败提示合同补齐（2026-10-18，W5-01-SHM-01，本地通过）：共享全量 39144854479 第 2 次运行的 11/16 在 1440/390 两个灵光错误恢复场景仍等待 provider 原始“测试模型暂不可用”时失败；修前完整组合 2/4。此前动作级错误合同已对齐，但浏览器消费断言遗漏。只将等待条件收紧为现行公开提示“模型请求失败，请重试”，保留原始错误注入、输入/零消息、重复发送、晚回复草稿、重开冲突和持久化断言及原时限；不改生产错误、权限或路由。按相同模型失败注入检索 Form/Pages 动作和 Inbox→Pages 浏览器场景，分别核对是否经 Runtime 模型服务，不批量替换仍走其他 owner 的消息合同。干净 actual main 2b5 的原浏览器文件 4/4，修前组合 2/4；修后本片六文件 64 条通过（两个 Chrome 文件六条），包含灵光动作、模型服务、Form/Pages 动作与 Inbox→Pages 浏览器。后面三者原断言保持且通过；旧路由检索的剩余字面量均为明确拒绝或移除路径验证。普通完整 health 通过，日志 /tmp/molis-shm-browser-errors-{after,health}.log；只有测试/spec 变化，复用现有构建，待传播后的共享全量。

SHM 模型失败集成补正（2026-10-18）：39130898172 的灵光失败回归仍期待底层异常 `Fixture model failure`，而本片已有公共模型服务故意隐藏底层异常。同步用例为精确 `plugin.model_failed` 与公共提示，保留会话消息为空的持久化断言及取消/撤权/并发修改分支，不恢复泄漏内部错误的旧行为。此项是当前模型失败合同的消费者补齐，生产实现不变；定向与后续全量另记。

任务要求：`docs/prompts/repository-anti-corruption.md`（2026-10-03 起以 main 上的版本为准，见 §1）。同时适用 `docs/prompts/repository-systematic-review.md` 与 `docs/prompts/code-health-report-2026-09-30.md`。上一轮整理见 [repository-systematic-review](../archive/repository-systematic-review/spec.md)，这里不重复它的内容。

本 spec 是第二步唯一的进度与证据记录，每完成一片就更新。

Workflows Store 交接收口（2026-10-18，Codex，本地组合通过）：DSH 已完成的纯 Store 前置已 merge 当前 Dataset/PPT/公共服务与实际 main 63639a764；只保留 owner SQL 端口与唯一 WORKFLOWS_DATABASE，尚未切换 Runtime、Manifest 路由或 Host 接线。整体 offline install/build、API（无额外变化）、动作快照、boundary、merge-base health 与资源通过；七个直接相关文件 42 条通过，覆盖流程/实例存储、停止/继续、固定交接键幂等、内容动作和发布库版本。快照额外六行来自 Dataset/PPT 前置的 D1 查询；25 项7,479,517 B，无本片资源增量。日志 /tmp/molis-workflows-closeout-{build,api,actions,health,boundary,assets,targeted}.log；原8文件33条证据保留。正式 PR/CI 与共享组合全量仍待队列，业务迁移交接后继续。

Dataset 全量路由断言补齐（2026-10-18，W5-01-DATASET-05）：跨插件客户端回归必须匹配现行 Manifest 的 /api/plugins/io.molis.work.dataset/datasets，保留旧 URL 的真实 HTTP 拒绝与错误边界。只修迁移遗留断言，不改生产行为；当前组合整体构建通过，该文件和真实 HTTP 错误边界/路由表三文件 35 条通过，日志 /tmp/molis-dataset-route-assertions-after.log。

Dataset 交接收口（2026-10-18，Codex，本地组合通过）：DSH 已审 Runtime 候选 merge 当前 PPT/公共服务与实际 main 63639a764。项目监督器沿现 homeLibraryPlugins 加入 Dataset 单一声明，Form/PPT/灵光/其他已迁移插件保留，旧 Host 提供方及路由全部删除；共同文档与错误模型测试同时保留 PPT、Dataset 的真实 Runtime、体积/冲突/发布拒绝证据。整体 offline install/build、API、动作快照、boundary、merge-base health 与实测资源通过；14 个相关文件 145 条最终通过。首轮13文件仅 Dataset 普通 provider 失败仍期待旧原始消息，现 SHM 合同明确返回 plugin.model_failed；仅改测试为精确码与文案，失败后数据不变等断言保持，复跑Dataset11条与模型材料14条通过。动作快照新增当前 Dataset 安装的 D1 三个 query（PPT的三个随前置并入），原业务动作合同不变。25 项7,479,517 B，比PPT前置减少200 B，无新增额度；日志 /tmp/molis-dataset-closeout-{build,api,actions,health,boundary,assets,targeted,model-contract}.log。正式 PR/CI 与共享组合全量待队列，先前DSH相关与Chrome证据保留。

PPT 成果继续回归路径补齐（2026-10-18，W5-01-PPT-02）：同类旧 URL 审计发现 artifact-continue 的创建、编辑、固定和读取四次请求仍用 /api/ppt，组合已复现 404；干净材料基线该文件通过。只改为现行 /api/plugins/io.molis.work.ppt/ppt，保留固定内容、全新对象身份、原版本和跨插件拒绝断言。与已补齐的客户端路径断言共同验证：整体 build 通过，两文件 17 条通过（包含四类成果实际从固定版本创建新对象），日志 /tmp/molis-ppt-continue-after.log；不改生产行为。

PPT 全量路由断言补齐（2026-10-18，W5-01-PPT-02）：personal-plugins-review-fixes 中 PPT 客户端路径按现行 Manifest 固定为 /api/plugins/io.molis.work.ppt/ppt。生产实现与旧 HTTP 路径拒绝保持；同文件及真实 HTTP 错误边界/路由表三文件 34 条通过，日志 /tmp/molis-ppt-route-assertions-after.log。

PPT 交接收口（2026-10-18，Codex，本地组合通过）：DSH 的现行 Runtime 候选与 root 同步 publish 点尾检已 merge 当前 Alchemist/D1/OwnerFiles/SHM/AQD 和实际 main 63639a764。请求入口同时保留 Alchemist 原调用授权并删除 PPT 旧路由。整体 offline install/build、API、动作快照、boundary、merge-base health 与资源通过；九个有效相关文件 95 条通过，覆盖发布前同步撤权、Pages 查询委托、业务动作、错误/大小限制、移动后固定、路由与动作合同。首批两个测试路径误写，实际 ppt-promote-authority 和 document-pin-after-move 已补跑14条通过。动作快照为本次新增 PPT Runtime 安装补齐 D1 三个 query，原动作合同不变；25 项资源7,479,717 B，比前置减少97 B。日志 /tmp/molis-ppt-closeout-{build,api,actions,health,boundary,assets,targeted,authority-pin}.log；先前红/绿授权回归、DSH真实Chrome与相关回归证据保留。正式 PR/CI 与共享组合全量待前置；不是整线或发布完成证明。

Alchemist 交接收口（2026-10-18，Codex，本地组合通过）：既有生命周期/显式继续候选已 merge 当前 D1/OwnerFiles/SHM/AQD 与实际 main 63639a764。动作客户端冲突同时保留 query_only 的只减权传播和后台额外权限的持续核验；请求入口保留原用户授权。整体 offline install/build、API/动作快照（均无额外变化）、boundary、merge-base health 和实测资源通过；12 个直接相关文件 178 条通过，覆盖关闭排空、迟到零写、显式恢复、搜索最终效果、后台权限和查询委托。workbench 沿前置已批准 +2,231 B，Alchemist 沿原已批准 50,619→52,373 B（+1,754 B）；25 项共 7,479,814 B，未再扩大额度。日志 /tmp/molis-alchemist-closeout-{build,api,actions,health,boundary,assets,targeted}.log。前期190文件/1732条、27文件/95条和4 Chrome文件/15条证据保留；正式 PR/CI 与共享组合全量仍待队列。这里只收已完成的生命周期与恢复，Runtime 迁移和 WorkReuse 生产接入仍未做。

D1 项目成果操作交接收口（2026-10-18，Codex，本地同步通过）：已 merge 当前 OwnerFiles/SHM/AQD 与实际 main 63639a764，原固定身份及 owner 操作实现不变。安全表 S-17 保留 D1 真实拒绝，S-18 并入 OwnerFiles 与当前主线；整体 offline install/build、API/动作快照（均无额外变化）、boundary、merge-base health 与资源核对通过。11 个直接相关文件 99 条通过，覆盖创建参数后续变更不能换权、过程 own 恢复、公开 SDK/输入图、真实 Host/Runtime、查询委托、OwnerFiles 生命周期与动作合同。25 项 7,478,060 B，无本片增量。日志 /tmp/molis-d1-closeout-{build,api,actions,health,boundary,assets,targeted}.log；原79文件921条及修前红/修后绿证据保留。正式 PR/CI 待前置；D2/D3 与 Shelf 业务迁移均未启动。

OwnerFiles 交接收口（2026-10-18，Codex，本地同步通过）：已 merge 当前 SHM/AQD 与实际 main 63639a764，未改变原已审服务实现；安全表保留当前主线与本服务的最终同步授权/句柄失效拒绝。整体 offline install/build、API（无额外变化）、boundary、merge-base health 与实测资源通过；七个直接相关文件 60 条通过，覆盖路径/注册/生命周期拒绝、当前 Home 路由、Host 接线、Runtime 安装及私有文件服务。25 项资源 7,478,060 B，本片增量 0；日志 /tmp/molis-owner-files-closeout-{build,api,health,boundary,assets,targeted}.log。原172文件相关证据保留，正式 PR/CI 待前置；Shelf/Alchemist 业务接入与迁移仍未完成。

共享全量 Jelly 模型失败断言（2026-10-18，W5-01-SHM-01，本地通过）：39140030877 的 10/16 在 jelly-actions 的原 /model down/ 断言失败；五分片成功，其余取消，不计全量通过。干净材料基线同文件 16/16，组合 15/16；基线与实际 main 的该用例相同。SHM 公共模型服务把未分类 provider 错误归为既定 plugin.model_failed/upstream 与中文公开消息，Jelly 的 Host→Runtime 调用也走这份分类。只把该原断言改为准确 code/message，保留取消的 jelly.cancelled、成功预览与执行前工作区逐项相同；不改生产代码或错误传播。当前整合的灵光、Dataset 与模型服务同类断言已核对，其他 raw failure 匹配是成果关联/删除故障而非模型调用，不作替换。Jelly/灵光动作、跨插件错误、模型服务与真实回执/授权五文件 72 条及完整 health 通过（/tmp/molis-shm-jelly-failure-after.log、/tmp/molis-shm-jelly-failure-health.log）；既有构建复用。下一轮集成全量另结算。

共享全量 Coding 停止回归（2026-10-18，W5-01-AQD-07，本地通过）：39138797210 的 7/16 在 coding-goal-context-http 的旧停止码列表失败，五个分片通过、其余 fail-fast 取消，不记全量通过。同文件在干净材料基线 1/1，组合稳定失败；基线与实际 main 的该用例及 coding-surface/plugin-route-control 无差异。AQD 让真实 Coding HTTP 传入共享 projectRouteControl，原 beforeEffect 在 Goal policy barrier 释放后先检查插件状态，已有 plugin_unavailable/unavailable 由唯一 SDK 映为 503。将原三个可选码的断言收紧为准确 503/actions.plugin_unavailable；原零事件/进度/receipt、旧身份在停止与重启后均拒绝、重开无迟到 receipt、后续并发幂等确认保持。生产代码、错误映射、权限和时限不变。同文件及 AQD 的 query/HTTP/MCP/消费者七文件 41 条、完整 health 均通过（/tmp/molis-aqd-stopped-goal-after.log、/tmp/molis-aqd-stopped-goal-health.log）；仅测试/spec 改动，现有构建仍适用。传播后的集成同用例及下一轮全量另结算。

共享全量模型拒绝修复（2026-10-18，W5-01-SHM-04，本地通过）：39137670023 的 1/16 在 host-inference-completion 失败；干净材料基线同文件 12/12 且相关 Host 实现与实际 main 无差异，组合稳定复现 11/12。SHM guardedGeneration 的 catch 再次执行配置校验，改写了 completeTextRequest 在派发前给出的 connection_required。保持底层唯一派发/拒绝分类，包装层直接保留已有 ActionError 终态拒绝，不给它添加执行事实或提交 guard；普通 provider 失败仍先复核快照、再附同步 validateResult，让最终失败记账拒绝失效配置。验收 W5-01-SHM-04：真实初始化 barrier 中撤销凭据，原 connection_required、零模型调用、无执行事实及 guard 保持；成功、provider/JSON 失败的现有真实回执和最终授权拒绝回归继续通过。首次定向中模型选择用例还钉住终态 configuration_changed 不得附 guard，因此保留原 catch 快照检查，仅让已有 ActionError 原样穿过；不修改该原断言。范围限 Host 回执包装、同测试与本 spec；不改动作、API、SDK 或权限。先整体 build，再 host-inference-completion、host-configured-text 及已有模型回执/生命周期回归，整体 build、完整 health、boundary、资源与上述十文件 99 条均通过（/tmp/molis-shm-refusal-build.log、/tmp/molis-shm-refusal-final-*.log）；待传播到共享组合重跑全量。

SHM/AQD 交接收口（2026-10-18，Codex，本地同步通过）：已 merge 当前模型/Images/Jelly 前置 10e8ef32a 与实际 main 63639a764，保留原模型最终提交复核和原调用者只读委托。整体 offline install/build、API（无额外变化）、boundary、merge-base health 与实测资源通过；13 个有效相关文件 121 条通过，覆盖原图/推理回执、权限等待、query-only、真实 Home/project HTTP/MCP、后台授权及缺项目诊断。首批命令误写不存在的 home-platform.test.ts，属于路径错误，实际 home-plugin-platform.test.ts 已另跑 7/7 通过；不把该错误当成产品回归。25 项 7,478,060 B，无本片增量。日志 /tmp/molis-shm-aqd-closeout-{build,api,health,boundary,assets,targeted,home-platform}.log。此前完整相关与浏览器证据保留，正式 PR/CI 待前置；Shelf 业务迁移仍未开始。

Images/Jelly 唯一页面挂载补修（2026-10-18，W5-01-HOME-STAGE-01，本地验证通过）：共享全量在 Cognia 发现同名页面重复挂载后，同链检查确认 Images/Jelly 的 Home Runtime 视图也与旧构建期 renderer 并存。沿本候选的迁移合同删除两条旧页面链，只保留 Home Runtime 返回的视图；资源/样式/目录登记与业务 API 保持。验收由 workbench-deferred-clients 的唯一根节点、原节点保留与单次资源下载断言，以及实际 Images/Jelly 页面动线共同证明；工作台必跑、整体 build、完整 health/boundary/API/资源检查后再汇入共享集成。Cognia 修复是前置，本条不修改或复述它的业务代码。 前置接入后原 Chrome 唯一性断言在 Images 得到 2 而非 1；删除旧渲染链后 33 文件 170 条通过（15 个 Chrome 文件 40 条），包含原失败回归、真实 Images 生成/恢复与 Jelly 1440/390 操作。整体 build、API、完整 merge-base health、boundary 与资源通过；25 项仍 7,479,312 B，无增长。日志 /tmp/molis-model-single-stage-*.log；共享全量待重新运行。

Images 生命周期夹具补齐（2026-10-18，W5-01-IMAGES-LIFECYCLE-01）：同类旧 URL 审计发现 ui-client-lifecycle 的测试服务器仍只接 /api/images，而生产客户端已使用 Runtime 完整插件 id。仅将 jobs/connections 两个夹具地址同步到当前合同；隐藏停轮询、重开刷新、移除取消、迟到响应与复用 DOM 单监听的原断言和时限全部保持。干净材料基线的该 Chrome 文件 3/3，完整组合在读取当前行处超时；修后本片整体 build 与真实 Chrome 3/3 通过，原断言和 30 秒时限不变。日志 /tmp/molis-images-lifecycle-{combined-before,after}.log、/tmp/molis-remaining-route-fixtures-baseline.log。已取消本线含已知旧夹具的全量 39136942882，不计通过；不改生产生命周期。

Jelly Runtime 首屏修复（2026-10-18，第二轮全量发现）：真实 Chrome 在 1440/390 两宽均无法加载日历；隔离页面诊断确认客户端 GET `/api/plugins/io.molis.work.jelly` 返回 404，同一现行 Manifest 根路由带末尾 `/` 返回 200。只修客户端初载、冲突后刷新、按 ID 打开前刷新三处工作区读取，统一请求声明的 `/`；Host 匹配、路由权限、业务动作与数据不变，不新增旧地址兼容。`W5-01-JELLYHTTP-02`：正式 Chrome 初载、创建/编辑、手工拆解、复制日程与重载持久化均通过（1440/390）；同原用例在主线基线通过、修前组合失败。整体构建后跑 Jelly 现行必跑、模型设置页面回归、health/boundary/API及资源；不得以加长等待掩盖 404。

第二轮补修验证：整体 build、完整 merge-base health/API、boundary 和资源通过；10 个相关非浏览器文件 75 条、2 个真实 Chrome 文件 14 条，共 12 文件 89 条通过。Jelly 同一 1440/390 用例在已合入材料基线通过、修前组合失败、修后通过；完整创建/编辑/手工计划/复制/重载路径保持。Jelly 客户端 91,167→91,179 B（修复 +12 B），仍低于实际 main 预算；本模型组合 25 项 7,478,072 B，相对前置减少 300 B，无新额度。原日志 `/tmp/molis-jelly-{baseline,combined-before,root-*}.log`、`/tmp/molis-model-consumer-usages-after.log`；后续全量另记。

Images v2 连接用途集成补正（2026-10-18）：第二轮全量 39132021277 暴露连接用途成功夹具仍只有 `images:generate`，遗漏现行 v2 动作要求的 `model:invoke`。真实 main 材料基线同用例通过，当前组合失败；成功夹具补完整现行权限，并新增仅移除 model:invoke 的拒绝分支，原 Home 无项目、缺 generate、不可见 reporter、换账号及停用连接断言保持。未修改生产权限或可用性判定。

模型/Runtime 集成全量补正（2026-10-18）：39130898172 的 `affected-tests` 失败来自历史断言“至少 18 个 SqliteBaseline 声明”；Images/Jelly 迁移已从 19 个减到 17 个，后续 PPT/Dataset/Workflows 继续减到 14 个。改为明确断言两处实际声明必须被发现，再逐个检查扫描所得全部声明的完整 version/schema；原 schema 变化、版本变化和无存储文件的拒绝判定均保持，不改选择脚本或门禁规则。定向与后续全量结果另记。

模型端口与 Images/Jelly 交接收口（2026-10-18，Codex，本地同步通过）：候选 merge 前置后台服务 c99e348ec，包含实际 main 63639a764 与已验证的灵光、Cognia、插件文件服务；保留主线 vendor/receipts 与完整的已消费资源拒绝用例。整体 offline install/build、API 与动作快照（均无额外变化）、boundary、merge-base health 及实测资源通过，19 个直接相关文件 235 条通过，覆盖模型选择/配置/图片调用、项目清理/路由、Images/Jelly HTTP/MCP、授权并发及公开合同。25 项共 7,478,060 B，比当前后台服务前置减少 312 B；本次没有新增资源额度。日志 /tmp/molis-model-closeout-{install,build,api,actions,health,boundary,assets,targeted}.log；前期必跑与 Chrome 证据继续有效，未冒称重复运行。共享核心全量和正式 PR/CI/合入仍待队列，整线未完成。

后台授权集成全量补正（2026-10-18）：39130898172 的 `ci-product-subset-plan` 发现 `action-background-authority.test.ts` 已由挡合并的动作合同通配命令运行，又被本片加入产品子集。移除子集中的重复选择，合同命令和全部授权拒绝断言保持，仍由 CI 必跑；定向与后续全量结果另记。

后台授权交接收口（2026-10-18，Codex，本地同步通过）：已 merge 当前私有文件/Cognia/灵光与实际 main 63639a764，保留安全表和 CI 子集双方条目，后台授权生产实现不变。整体 build、API、boundary、merge-base health 及资源核对通过；六个直接相关文件 81 条通过，涵盖后台失权拒绝、Kernel 授权、真实 HTTP 生命周期、模型/文件服务与 Host 接线。25 项资源共 7,478,372 B，无本片增量；日志 /tmp/molis-background-closeout-{build,api,health,boundary,assets,targeted}.log。原完整相关组合证据保留，正式 PR/CI 待前置；不把模型端口或插件业务迁移算成本片已合入。
插件私有文件交接收口（2026-10-18，Codex，本地同步通过）：已 merge 当前 Cognia/灵光与实际 main 63639a764；保留主线 Assistant 关闭接线、Shelf IPC 拒绝和产品子集两项连接器回归，同时保留 files 类型/授权接线与安全断言。整体 build、API、boundary、merge-base health 及资源重测通过；六个直接相关文件 54 条通过，覆盖文件边界、Home 生命周期、真实 Host 服务/执行器、项目库和安装 grant。25 项资源共 7,478,372 B，与 Cognia 相同；日志 /tmp/molis-plugin-files-closeout-{build,api,health,boundary,assets,targeted}.log。早前完整相关组合证据保持，正式 PR/CI 待依赖顺序，未开始新的业务迁移。

Cognia 唯一页面挂载补修（2026-10-18，RAC-43，本地验证通过）：共享全量 39141589229 的按需客户端 Chrome 回归在切回 Cognia 后丢失原 surface；干净材料基线两条通过、完整组合一条失败。根因是迁入 Home Runtime 后，项目页仍调用 Cognia 的旧构建期 renderer，同时追加 Runtime 返回的同名页面，形成两个同 id 根节点。删除这条旧渲染链，只保留 Runtime 提供的视图；客户端资源、样式与目录登记保持。既有浏览器用例补每个可打开页面恰好一个根节点的断言，原节点保留、失败重试、单次资源下载和 companion 断言不变；真实 Home HTTP 另验证停用时项目页只保留不可用视图，重新启用后恢复唯一业务视图。验证：整体 build、工作台包必跑、原 Chrome 回归、相关 Home/Cognia 路径与完整 health/boundary/资源检查；不以延长等待或放宽断言处理。 新唯一性断言在修前明确得到 2 个根节点，修后原 Chrome 两条通过；工作台必跑与相关组合 32 文件最终 177 条通过（13 个 Chrome 文件 39 条）。原纯 renderer 测试在删除旧装配后失败，改为真实 Host HTTP，全部原结构/客户端断言保持，另验证停用/恢复。整体 build、API、完整 merge-base health、boundary 和 25 项资源检查通过，7,479,612 B 无变化；日志 /tmp/molis-cognia-single-stage-*.log。共享全量与更新后正式 CI 待结算。
Cognia 交接收口（2026-10-18，Codex，本地同步通过）：已 merge 灵光 a1a10e86d 与实际 main 63639a764。业务源码保持此前已审候选，冲突仅整合安全表与重生成派生记录；S-18 同时保留主线跨分区恢复与模型 metadata 拒绝证据。整体 build、API/动作快照（均无额外变化）、boundary、merge-base health 和资源检查通过；13 个直接相关文件 344 条通过，覆盖 Cognia 动作/Store/AI/HTTP/Runtime、Host 模型与附件拒绝、声明、路由和 Home 平台。Cognia 客户端仍减少 260 B，25 项资源共 7,478,372 B；日志 /tmp/molis-cognia-closeout-{build,api,actions,health,boundary,assets,targeted}.log。此前组合的 203 文件 1,823 条、其中 5 个 Chrome 文件 20 条及 1 条环境跳过证据保留，未重复计为本次重跑。正式 PR、CI 与合入仍按前置顺序推进，整线未完成。

共享全量路由断言补齐（2026-10-18，RAC-31、PPT-07、W5-01 Dataset）：39135082261 的 4/16 在 personal-plugins-review-fixes 仍要求旧短路径时失败，其余分片由 fail-fast 取消。相同文件在干净已合入材料树 8145f96bd 为 16/16；该文件和三插件客户端在这份基线与实际 main f4207e064 间均无变化，组合本机复现 Dataset 旧路径断言失败。分别在灵光、PPT、Dataset 所属片将对应客户端断言改为 Manifest 路径；不恢复旧路由、不改生产行为或放宽授权，保留现有真实 Runtime HTTP 拒绝与消费者回归。此处先补灵光，当前 2 文件 31 条通过（跨插件回归 16、真实 Runtime HTTP 15），日志 /tmp/molis-lingguang-route-assertions-after.log；下一轮共享全量另记。

灵光接 W4-1 主线（2026-10-18，actual main f4207e064）：主线 #721/#731/#730 已合入，后一项直接改变灵光创建/撤销合同，PR 再次冲突。保留当前主线的 intake/quick-create 声明、独立 revert 动作与空 fragment 选择；新 revert 沿 Runtime 唯一 ports.write(caller, ...) 写入，仍以所见 updated_at 拒绝后续改动，不退回已删除的 Host withStore 接线。材料 read/fetch 权限及进度回调保留；S-39 指向 Runtime 插件，新增 S-40 撤销令牌边界按主线保留。原 +2,231 B 额度仅重定为 1,113,068→1,115,299，已消费 W3-C2/W4-1 与两次中间起点继续拒绝。整体 build、API/动作快照（无新增变化）、完整 merge-base health、boundary 与资源通过；18 文件 231 条通过，含真实 Host 创建/撤销、令牌边界与 Chrome 2 文件 18 条。25 项资源实测 7,479,872 B，workbench.js 1,115,299 B。日志 /tmp/molis-lingguang-main3-*.log。旧组合全量 39133888386 已确认 cancelled，不计通过；当前共享组合全量待后置候选串行接入后重跑。

灵光 a989 主线复验（2026-10-18）：整体 build、API 与动作快照（均无额外变化）、完整 merge-base health、boundary 和页面资源通过；原 13 个直接相关文件共 189 条通过，新增两条旧额度起点拒绝。25 项共 7,478,714 B，workbench.js 实测 1,114,141 B，符合原 +2,231 B 的重定上限。日志 `/tmp/molis-lingguang-main2-*.log`。新 head 的正式 CI 和同步后的共享全量另记，未将先前全绿 head 冒充本次结果。

灵光接新增主线（2026-10-18，actual main a98967d7f）：合入 #720/#708/#726/#728 的侧栏落点、并行问卷拒绝、回执角色和写后检查器。冲突仅页面资源额度/拒绝测试/实测预算，生产代码保留双方自动合并结果。原灵光 +2,231 B 额度重定为 1,111,910→1,114,141，#720 已消费的 1,111,791 起点与灵光旧中间起点继续拒绝；不新增或重复消费额度。整体构建、派生表与合并后验证另记。为避免验证已知过时组合，刚排队的本线全量 39133059966 已申请取消，待该 main 整合进共享候选后重跑，不影响他人运行。

灵光交接收口（2026-10-18，Codex，本地同步通过）：本片已 merge 材料 8145f96bd 及实际 main 63639a764，保留主线 receipts/vendor/Coding 变化。整体 build、API、boundary、merge-base health 与实测资源通过；13 个直接相关文件 187 条通过（含资源预算拒绝、流读取、浏览器同源请求、Runtime HTTP、灵光动作/材料/MCP/丢弃/库、客户端与项目清理）。前期 159 文件 1,474 条通过、1 条环境跳过及其中 9 个 Chrome 文件 41 条证据仍保留；没有声称重跑这一批。workbench.js 只沿用用户已批的 +2,231 B，按实际前置重定为 1,111,791→1,114,022，灵光包减少 725 B；25 项共 7,478,632 B。Todo 与 receipts 的旧起点均进入拒绝回归，不重复消费额度。原日志 /tmp/molis-lingguang-post703-{build,api,health,boundary,assets,targeted,actions}.log。正式 CI、共享核心组合回归与合入待 PR 队列；整线尚未完成。

交接收口（2026-10-18，Codex）：用户已要求停止开启后续实现，将手头候选经 PR、问题处理与合并 main 后统一交接。#703 的全部分支检查及合并队列 Verify 已通过，实际合入 main `63639a76498a44320018ed4d935ace2abed1c886`。原 MCP stdio 用例在源码、断言和 60 秒时限不变下低并发复跑 20.8 秒通过；桌面包必跑三文件共 39 条及 Shelf Rust 七条通过，原两次超时记录保留。材料 #727 已 merge 该实际 main，offline install、整体 build、API（无额外变化）、boundary、merge-base health 与资源核对通过；六个直接相关文件 39 条通过。25 项资源 7,477,126 B，仍比这份 main 少 6 B，没有新增额度；日志 /tmp/molis-materials-post703-{build,api,health,boundary,assets,targeted}.log。共享全量运行 39125232628 针对此前材料头 846d0baa8，结果另行结算。以下旧“待合入/不自行合并”等文字保留为当时记录，当前授权按本段；整条 W5/W6 仍未完成。

材料服务接续（2026-10-18，Codex，本地组合验证通过，准备 PR）：#684 已以 c5d2b3cf6 合入，本片 merge #703 的本地同步源码 efd9c18de，纳入同一实际 main c5d2b3cf6。保留主线 S-38 命令 PATH，材料服务沿原顺延决定使用 S-39，测试同号；此前 S-38 记录仅为历史时点。最终 offline install、整体 build、API、boundary、merge-base health/快查下调与资源测量均通过；25 项 7,475,692 B，比前置少 6 B，来自灵光客户端的现错误码替换，无新资源额度。包要求及影响面的 183 个非浏览器文件全部通过，1,817 条通过、1 条原有沙箱环境条件跳过；实际 Chrome 的 plugin-sample.e2e 1/1 通过，去重184文件共1,818条通过、1条跳过、0失败。安全表合并材料不可信输入与主线桌面边界，派生表按组合重测。没有带入后续灵光、Cognia、Images、Jelly 的迁移源码；本片功能可用的本地证据不代表共享核心全量、正式 CI 或 W5/W6 整线完成。

后台作业授权读取交接收口（2026-10-18，Codex，本地同步通过）：既有补片 merge 实际 main 63639a764，生产修复保持为仅把 assistant.not_found 当成工作缺失，数据库暂不可读继续交给现有 SDK 有界重查。整体 offline install/build、boundary 和 merge-base health 通过；真实 SQLite 锁恢复、外部检查授权与后台工作等待三个文件 72 条通过。新主线的助理用例与供应商 SDK 一起验证，未引入新重试机制、公开合同或客户端变化；此前 64 文件 581 条的完整相关证据保留。日志 /tmp/molis-job-read-closeout-{build,health,boundary,targeted}.log。RAC-61/62 本地成立，正式 PR/CI 与合入待队列。

STREAM 正式 CI 补修（2026-10-18）：a0f47c314 的 CI 39121688588 中，边界、健康、动作合同、安全和产品子集通过，Rust 测试因 Shelf 测试目录只用进程号与时钟、并发时重名而失败；同一夹具在 c5d2b3cf6 中存在。本次仅给测试目录补进程内原子序号，生产代码和断言不变。rustfmt 与 8 线程的 Shelf Rust 定向 7/7 通过；桌面包另外两文件38条通过。MCP stdio 的原60秒用例两次超时，未放宽时限；逐阶段诊断显示三个进程启动累计约65.6秒、读写及重连均返回，总计69.6秒，仍须低并发重跑原用例确认。该超时不宣称基线已证；先推已验证的 Rust 夹具修复以重启正式 CI，不把待补证写成全绿。

W5-01 STREAM 接实际 main（2026-10-18，PR #703，本地整合验证通过，待正式 CI）：#684 已在固定 head b1683481b 经 Verify、16/16 全量分片与汇总通过后合入，main 的实际 squash 提交为 c5d2b3cf66bcc6b48e0d35770480a708c5a6cccf。按原 merge-only 次序将该 main 合入 #703（efd9c18de）；保留原流式路由、增量终态与停用尾检，冲突保留主线的 Shelf/Todo 挂载清理、S-35 跨分区移动复原、全部现行安全用例与已消费资源许可。最终组合整体 build、API、boundary、merge-base health/快查下调及资源测量通过；25 项 7,475,698 B，与该 main 相同，增量 0 B。包要求及影响面的178个非浏览器文件全部通过，1,667 条通过、1 条原有沙箱环境条件跳过；真实 Chrome 的 plugin-sample.e2e 1/1 通过，去重179文件共1,668条通过、1条跳过、0失败。推送前 fetch 与 secrets 扫描通过。正式 CI 与共享核心全量仍交统筹排，不自行合并或加标签；这些是本片证据，不代表 W5/W6 整线完成。

W5-01 Todo 最新主线整合（2026-10-18，merge `576b98556`，准备推送）：固定 main `7faaa027c`，保留 #712 的侧栏上下文、#699 正式 SDK 与 #719 文档。冲突仅资源许可/测试/派生表，Todo 业务源码保持原迁移。原 +28 B 重定为 workbench.js 1,110,329→1,110,357，todo.js 62,081→62,036（−45）；25 项 7,475,698 B，相对该 main 少17 B。整体 build、offline install、boundary、API/merge-base health、资源检查通过；36 个非浏览器文件 418/418，覆盖 Todo、Home Runtime、SDK/授权、侧栏消息安全和资源旧额度失效。真实 Chrome 的 todo-app、side-shelf-in-hand、context-toolbar-panes 三文件仍在机器公共窗口排队，尚无该组合结果；此前5f03的11文件29条仅是对应版本证据。推送前 fetch 确认 main 未变，secrets 扫描933行通过。先更新 PR 候选以启动正式 CI/源码复核，不称浏览器补验、全量或整线完成；不自行合并/加标签。


W5-01 Todo 合入 #661 后验证（2026-10-18，本地 merge `c07e47e96`，未推）：merge main `5f03d1e4`，两份派生表重新生成，Todo 生产源码与原 `3272c36df` 相同。原 +28 B 许可重定为 workbench.js 1,110,056→1,110,084；todo.js 62,081→62,036（−45），25 项共 7,475,425 B，比该 main 少17 B。整体/workspace build、boundary、API/完整 merge-base health、资源实测通过；17 非浏览器文件222条、11真实Chrome文件29条，去重28文件251条最终通过。Goal刷新与对话框初跑导航超时，原源码/断言/时限不改后串行复跑7条通过，失败日志保留；未声称已查明时序根因。`prologue-origin-withdraw-race` 两条也通过。日志 `/tmp/molis-todo-main-661-{nonbrowser,browser,browser-rerun}.log`。推送前 main 又合入 #712/#719/#699，仍需合入并重测实际资源与受影响路径，本段仅记录5f03切点，不代表最终远端CI或整线完成。

W5-01 Todo 同步（2026-10-17，PR #684，仍待合入）：按交接的 merge-only 顺序纳入 main `8fcff0442`。冲突仅为单次资源许可、对应测试及两份派生表；主线的交互、回执、SDK 与 S-32/S-33 保留。Todo 的 +28 B 已按既有批准重定为 workbench.js 1,109,302→1,109,330，Todo 客户端 62,081→62,036 B（−45）；25 项资源总计 7,479,372 B，整体与 workspace 构建、资源实测及 boundary 已通过。#688 已用的 Coding 373,784 与 workbench.js 1,108,502 两个起点补进拒绝回归。合并后定向 10 文件 / 162 条、真实 Chrome 2 文件 / 7 条、安全清单 63 文件全部通过；sandbox 文件保留 1 个环境条件跳过项。merge-base health 与快查下调通过。共享核心全量交统筹在 CI 排；不把已做好的后续本地切片算作已合入。

材料服务编号（2026-10-18，用户确认顺延）：Runtime 材料服务改用 **S-38**，保留当前 main 的 S-34 常开插件及 S-35～S-37。安全表与对应拒绝测试同步；以下旧验证中的 S-33/S-34 只表示当时编号，保留原运行事实。本次不改变授权、行为或断言；材料候选在前置合入后接实际 main，旧基点没有的中间编号不补造条目。其他在途分支的编号由其 owner 接当前 main 排列。

W5-01 Todo 再同步（2026-10-17，本地晚间，PR #684）：按统筹 PR 评论先 merge main `b3499cda5`，再 merge `a56a2763d`，全程不变基。主线 #701 的 Shelf 侧栏和常开插件保留；两处渲染器冲突只同时删除 Shelf 与 Todo 的旧挂载引用。Todo 业务源码与此前审过的补丁一致。+28 B 许可重定为 workbench.js 1,109,913→1,109,941，Todo 客户端 62,081→62,036 B（−45）；主线已用预算起点全部保留，AC-03 的 1,109,312 B 加入拒绝回归，活动许可只有本片一条。整体构建、boundary、merge-base health/快查下调及资源实测通过，25 项资源共 7,475,644 B。109 个非浏览器文件 1,111 条通过、1 条原有公网 npm 条件跳过；7 个真实 Chrome 文件覆盖 14 条：首次 `todo-from-inbox` 宽屏在灵光转待办提示处超时，其余 13 条通过；不改源码或断言单独复跑，该文件 2 条通过。另建干净 main `a56a2763d` 工作树同构建、同文件 2 条通过。此为一次尚未稳定复现的时序失败，不把它写成首次全绿，也不据此认定基线已有同一缺陷。共享核心全量及合入仍由统筹在 CI 排；本线不加标签。

W5-01 Todo 第三次同步（2026-10-17，PR #684，本地定向通过，待正式 CI）：按统筹评论 `6246076698` merge main `4bea52c84`，不变基，合并提交 `dfcb0439f`。冲突仅为资源许可脚本、对应测试和资源派生表；Todo 业务源码与冻结 head `f7fffda2e` 逐字相同。正式构建实测 workbench.js 为 1,110,215 B（main 1,110,187，仍只增加已批准的 28 B），todo.js 62,036 B（main 62,081，减少 45 B）；25 项合计 7,475,589 B，比 main 少 17 B。#706 已用的许可与本片同为 workbench.js 一个键，故按原有单次合同将活动起点换为 `[1110187, 1110215]`，保留全部已用起点拒绝回归，并新增 #706 的 1,109,913 与 1,110,802 B 两种再次增长拒绝；不扩展许可格式或保留已用增长权限。整体构建、边界和资源更新已通过；16 个非浏览器文件合计 220 条、另一个转待办调用方文件 3 条、3 个真实 Chrome 文件 4 条通过（去重共 20 文件 227 条）。资源用例首次在合并提交和预算落定前读到 1,110,187 B，1 条失败；完成合并与派生表后该文件 73 条重跑全过，未改断言。完整 merge-base health/API（64 份快照、2,506 项声明）通过，快查重测后无额外变化；全量仍交统筹 CI，整线未完成。

W5-01 OwnerFiles 服务前置（2026-10-18，Codex；本地实现与相关验证通过，待PR/CI整合）：目标为公共服务功能可用，基于已冻结的 SHM+AQD `dfc21df3b` 在独立工作树串行实现。Shelf 现有同步文件树需要受本次真实动作控制的短同步写入段；现 PluginFiles 的单层 ASCII/独占文件合同不能承担嵌套 Unicode 树。新增 `PluginOwnerFilesReader/Writer/Client/Declaration`，继续从 `platform/plugin` 导出；`services.ownerFiles` 只给可信 Home native 定义，升级预检、sandbox、project executor 不提供。声明只来自可信 entry 和真实 definition 的 WeakMap，深复制冻结目录条目及初始化函数绑定，不能由 Manifest、自报 plugin_id 或替换 definition 继承。不改 ShelfStore、现 Shelf owner/装配、原件来源、桌面导入导出、模型、项目成果或 PDF；服务 fixture 不能冒领 Shelf 真实迁移验收。

合同：Reader 为 `stat/read/list(relative)`；Writer 另有 `mkdir`、`writeFile(relative,bytes,"create"|"replace")`、`replaceFileAtomic`、`copyFile`、`removeTree`、`setAccess(relative,"readonly"|"readwrite")`。Client 的 `write(run)` 捕获真实 currentPluginAction，检查本安装、command、action/manifest/caller/实时 grant，再等待原 beforeEffect；等待后与每个原语同步复核原 caller、signal 和现有实例 gate。callback 以现 requireSynchronous 检查并在 finally 撤销 writer，旧 writer 不能借新动作/新授权续命。writer 内读按已授予的写权限；独立 Reader 要读权限。原语同步消费 bytes；跨 await 的业务输入快照归以后 Shelf 调用者，本片不新增通用克隆协议。不增加第二 active/generation、持久句柄或 close，现 executor 的 activeRecord/revoke 是实例权威。

Host 只绑定 canonical Home 和声明，打开 port 不创建目录。受信 initializer 在有效 activation、storage:private 与写 grant 检查后取得单次短 writer，完成后才 start/register；初始化失败不注册且保留已经合法写入的字节，无跨文件回滚承诺。初始化入口不进 PluginHostServices。初始化幂等/坏 catalog 拒绝由 fixture 自己证明，服务不理解 catalog 或建立 seed 日志。完整可信 Home+project 名单在受管 Home 库/owner 目录/seed 前一次性校验，沿唯一 HomeStoreRegistry：owner 正确、名字/权限/顶层条目有效、只准 Home 非 sandbox；owner_files 所占 store 不带 library、不与任何 scope 的 database/旧 files 或第二 owner_files 共根。即使相同 plugin_id 的不同 definition 也查交叉冲突；不另建 owner registry。fixture 只登记尚未占用目录，不覆盖现 Shelf。可信 create 工厂自身副作用不属于受管 IO 零写承诺；project 调用方已开的 db 不计入该声明。

登记接线裁定：Home 预检读取实际 shipped Home 与双 scope fixtures，现 shipped project 的 Form/Lingguang 库根由唯一 home.stores.library 覆盖拒绝；其余现 shipped project 条目均无 files/database。project.start 再以实际 entries 与 Home catalog/fixtures 做共同纯校验。不把整个项目装配导入 Home、不移动插件 imports 或复制一张声明表。这里的完整性针对当前 Home 已知的受管声明与根；未来新增 project 旧 files 声明必须先接入同一 Home 预检，不能静默遗漏。跨 scope fixture 共根与坏尾项的零 seed 证明仍不可省；既有 assertFixtureScopes 同 id 拒绝保留，共根纯校验另测，不能为新测试放松旧约束。

路径只接受已声明顶层下严格相对 `/` 路径，Unicode 原样保留，拒绝绝对/盘符/反斜杠/空段/dot/NUL；在任何写前验证完整路径。逐层拒绝现存链接/非目录；普通文件统一拒绝 nlink>1，NOFOLLOW/NONBLOCK 打开并 fstat 后才读写/截断/chmod，fd 每次 finally 关闭。list 遇不安全节点整次拒绝，不能过滤；缺失返回 null/空列表，类型和权限错误不能装成缺失。create/copy 目标独占，replace 要存在；atomic replace 用同目录随机独占临时文件，rename 前失败旧 bytes 不变且只清本次 tmp。removeTree 先预检整棵树，不安全节点零删除，不删 owner 根或声明目录顶层；合法 file 顶层可删。固定 access 位为文件 0444/0644、目录 0555/0755，目录用安全只读 fd。无新增 32MiB 通用限制，不承诺多文件/树事务、fsync 掉电持久或抵御同 OS 用户并发换父目录（本片无 openat/native helper）。

范围：contracts/plugin-owner-files 与 plugin 类型；Runtime owner-files-service/public export；Host owner-files IO/路径/纯 entry 校验、entry identity、Home executor/home-plugins/home-side、project platform 的显式拒绝；workbench builtin runtime 只改可信类型，不启用 Shelf；真实 Home Runtime fixture/拒绝测试。root 串行维护 API、README、安全表和 spec，不修改门禁阈值、资源许可或 vendor。对照 accepted service-slice 的原语和职责实施，文件按实际职责拆小，不建立通用资源登记框架。

验收编号（测试名/注释标记）：`SHF-IO-S01` 完整名单坏尾项、跨 Home/project 同 owner 同根、错 owner/权限/sandbox/project 等在 owner 目录与 seed 前拒绝，正反启动顺序均验证；`SHF-IO-S02` 真实授权初始化先于动作可见，无 grant 零 seed，坏 catalog 不覆盖，失败不注册，重复 query 不写，停用回调与逃逸/async initializer 拒绝；`SHF-IO-S03` 合法 Unicode 与各类路径/链接/FIFO/硬链接拒绝，读/stat/list/copy/replace/atomic/chmod/removeTree 一致，坏子树零删除、非法末段零父目录写；`SHF-IO-S04` 真实 beforeEffect barrier 中取消/撤权/stop/同 id 换代后零文件副作用，query/无 scope/错安装/缺权限拒绝；`SHF-IO-S05` 旧 writer/晚到 ALS/非法 Promise/重启后旧 client 均不获新权，Promise 拒绝被观察，不谎称同步已写部分回滚；`SHF-IO-S06` 独占/替换缺失/copy 冲突与真实 rename 前失败语义、完整成功 bytes、同步源 buffer 后续修改隔离、超过32MiB普通文件；`SHF-IO-S07` upgrade/project/sandbox 无服务且既有 files/database fixture 保持。

验证：先整体 `pnpm build`，再新真实 Home 安全测试及 Runtime/Host/contracts README 对应定向用例，包含现 private storage/files/database/upgrade/Home lifecycle；拒绝必须核磁盘状态。随后 boundary、API、merge-base health、资源门禁。共享核心全量交统筹 CI，本机不跑全量；不增加浏览器资源，正式 Shelf 产品/桌面体验仍留后片。

本地证据（2026-10-18，本地实现与相关验证通过，待PR/CI整合）：整体build、新增/既有9文件72条、API、merge-base health、boundary和25项资源测量均通过；资源7,476,626 B，与前置S相同。IO测试首轮因macOS /var→/private/var真实路径未匹配故障注入而失败，修fixture后原rename/chmod故障与字节/临时文件断言5/5通过，无生产修改。另163文件相关回归首轮162通过；唯一home-plugin-project-routes旧期待与冻结S dfc21df3b同样冲突。合并公共测试补正4c39270a7后，原完整用例1/1通过，精确400/project_required与撤grant403均保留；其余162文件不重复跑。README测试通配符改成现存文件名后边界复查通过。日志 /tmp/owner-files-required-tests.log、/tmp/owner-files-home-route-final.log、/tmp/owner-files-boundary-recheck.log；保留原sandbox环境条件跳过。真实Shelf接入、Store迁移和产品/桌面体验尚未做，本片仅公共OwnerFiles服务，不称整线完成。

### W5-01 Shelf 前置 D1：项目成果操作与过程项恢复（2026-10-18，本地实现、复审与定向验证通过，待主线整合/CI；负责人 Codex）

目标等级为公共前置功能可用。现 `createPluginArtifactClient` 将动作注册和成果政策混在一起，过程项只有 record，Shelf 后续 Home 迁移缺少复用的 owner 操作、读取自己过程版本和可消费目录。本片基于已交付 S `dfc21df3b` 提取现 owner 操作，并立即由现项目 SDK client 消费；不做 D2 图参与者、D3 Home invocation 门面、Shelf 正式迁移或新增 Home 声明，不改 C OwnerFiles、A Alchemist，也不另建 registry、库或直接跨包 SQL。

保留旧五个 SDK 动作的 identity/schema/version、project/actor/producer 绑定、created_by 来源与停用/撤权拒绝。特别是既有 artifact head/readOwn 仍仅按 producer_plugin_id 判自己，不顺便加严签名/owner；普通 read 仍成果优先、过程其次，过程个人 owner 与 consumes/归档/可用性规则不变。已经固定的合法版本在生产者停用后仍可被消费，不新增 active-producer 条件。

作者合同新增 `PluginProcessItemHead { version: number }`；`PluginProcessItemClient.head(artifactId)` 与 `readOwn(reference)` 返回过程最新版本/固定记录或 null；校验 producer id、publisher signature，personal 还需 owner_actor_id 等于安装 actor_id，不比较 producer version，归档/unavailable 自恢复可读且不要求 consumes。record 的 owner/author 仍按现 Module 规则，不为恢复接口重写旧 owner；由其他 author 写下的个人过程项对安装 actor 的 own 读取明确拒绝。`PluginArtifactClient.listConsumable()` 返回 `PluginConsumableVersion extends ArtifactReference { kind: "artifact" | "process_item"; artifact_type_id; schema_version; title: string | null }[]`，不返回正文、metadata、owner 或路径。返回所有可消费固定版本（不限 latest/端口），成果在前、过程在后，分别保持 owner listArtifacts 顺序；过程 metadata.title 仅非空字符串原样返回，其余 null。与 read 共用消费判定，拒绝项过滤，查询错误抛出。同 id/version 碰撞时成果优先：用于排除过程引用的集合必须取全部成果记录，包括不可消费成果，保证列表随后 read 不会读到另一种类；集合仅为单次查询局部值。

在 artifacts owner 包新增 `createPluginArtifactOperations({ api, process, manifest, project_id, actor_id, author?, authorize, assertInput, assertCallerCurrent })`，返回分开的 `{ client, process }`（两个 head/readOwn 不能交叉合成一个对象）。工厂 clone Manifest，每方法先核声明再调可信 authorize；不创建身份、不登记动作。共享输入投影/动作 schema 提取为一个包内文件，白名单先丢弃伪身份字段再校验，保留现客户端语义。Host 注入 kernel 已公开的 assertActionInput；项目 ActionService 与 owner 直调边界使用同一 schema/validator，不复制解析规则、不加 no-op 或调用方可开的跳过开关。owner 包不依赖 kernel，现 Host/client/test 调用点补 required validator。公开工厂只经 artifacts 包出口，作者从 contracts/platform/plugin 得新类型，本片不额外扩 SDK 的便利 type export。

`createPluginArtifactClient` 保留安装匹配、一次 provider 注册、availability、caller allowlist、invokeSync 与 dispose，五项旧 handler 全委托共同工厂；同 provider 新增 `process-head`、`process-own`、`list` 三个 query @1，project scope、plugin audience、artifact:read、sync。旧 @1 的输入输出不变。Home 不提前接这份工厂。动态 SDK 动作可能不被当前无安装身份的 host snapshot 枚举到：按现 actions:update 实测记录，不为快照放开 availability；定向 discovery 固定新动作的 schema/版本/受众/权限。

允许源码范围：contracts 的 plugin-artifacts.ts/plugin.ts；artifacts 的 plugin-client.ts、plugin-operations.ts、plugin-action-contracts.ts、index.ts（现 action-schemas.ts 仅共享 schema 必需时）；Host plugin-host-services.ts 的 validator 注入；plugin-artifact-client、plugin-artifact-operations、plugin-host-services 与必要 typed fixture 测试。既有公共 client 新增 required 方法导致的 typed fixture 仅补实际语义，不改可选方法兜底。root 串行维护唯一 spec、包 README/必要 Skill、安全表与 API/动作派生快照。没有数据库迁移或页面资源变化；错误沿现 artifacts.plugin_denied/plugin_incompatible 与 kernel 校验模型。

验收：
- **W5-01-D1-01**：旧五动作经实际项目 client 委托唯一操作工厂；返回、事件游标、replayed、身份白名单、停止/撤权/旧 client 拒绝不变。
- **W5-01-D1-02**：process head/readOwn 的精确 store、null/最新/归档/unavailable 恢复、错 producer/签名/个人 owner 拒绝与跨 producer version 恢复；artifact own 原规则不加严。
- **W5-01-D1-03**：两类多版本/未连端口目录、标题、过滤和引用碰撞优先级符合上述合同；列出的每个 ref 经 read 得到同 kind/type/version；查询故障抛出，空库返回空列表。
- **W5-01-D1-04**：未声明 type/schema、跨 store 同ID、冲突版本、伪身份与非法输入拒绝后版本/事件不增加；SDK 与直调共享验证；author 与安装 actor 不同时保留原 created_by/owner 并按新 own 边界拒绝。
- **W5-01-D1-05**：真实 SDK discovery 新三 query @1 的完整合同，其他安装、无 grant 和伪受众拒绝；旧五 action schema 不变。不能全用裸工厂 fixture 代替生产链。
- **W5-01-D1-06**：真实项目 Host 暴露 process head/readOwn 和 listConsumable；现 inputs/outputs 的 record/select 继续工作，生产者 stop 后固定可消费版本仍可读；工厂不注册 provider，client 仍只注册一份且可 dispose。

验证：整体 build 与包要求相关 79 个不同文件、921 条测试通过（71 文件 865 条，加最终 8 文件 56 条；不重复计算初轮）。创建参数身份回归在修前代码精确复现修改 actor_id 后借读他人过程项，修正后通过。API 源码匹配、动作合同 25 条、boundary、merge-base health 与资源检查通过；25 项资源仍为 7,476,626 B，本片增量为零。API 仅增 plugin 合同，动作快照新增 9 个安装各自的三个 query（27 行），旧五动作 schema/version 保持，不新增用户/MCP 动作。日志为 /tmp/molis-artifact-operations-d1-{required,binding-before,binding-build,binding-tests}.log 及 /tmp/molis-d1-{api-check,actions-final,contracts-final,boundary-final,health-final,assets-final}.log。contracts-final 中曾误传不存在的 plugin-api-snapshot 文件；实际动作合同 25/25 通过，API 已用正式脚本核对成功，该参数错误不计为产品失败。共享核心全量及正式主线整合仍待 CI；未实施 D2/D3 或 Shelf 迁移。

AQD 测试合同补正（2026-10-18，生产源码不变）：OwnerFiles 的相关回归发现 home-plugin-project-routes 在 personal 路径附 query project_id 时仍期待403/forbidden，冻结 S dfc21df3b复现同一400!=403。实际可信项目只从路径建立；现AQD已经明确保留Home缺项目400/actions.project_required并先于caller allowlist，因此只将这两个旧期待改为精确400/project_required。保留合法项目路径400/input_invalid、拒绝后jobs为空、撤grant后的403/forbidden和Home读仍可用等断言；这是与已接受合同对齐，不改生产或放宽成任意拒绝。原文件复跑1/1通过，真实响应确认精确project_required；合法project路径、拒绝后空jobs及撤grant后的403对照均保留并通过。

SHM+AQD 公共候选（2026-10-18，本地功能可用，可供 PPT 本地迁移；整线/发布未完成）：本分支已合并 M 的 9c1635a96，含 main 7faaa027c 和 Todo b168 的源码组合，以及同一份模型 validateResult 与原调用者 invokeQuery。最终整体 pnpm build 通过；按该组合 merge-base 7faaa027 的 health（含公开API匹配）、boundary 与资源检查通过，25项资源7,476,626 B，AQD无客户端增量。包要求相关107文件首轮106通过，唯一旧Home缺项目诊断400→403已修复并原测试7/7重验；最终对应107文件1,294条通过。五个query文件最终37条通过（正式SDK/真实HTTP/Runtime/Kernel/MCP），与旧Home平台合计6文件44条；原background21/21保持有效。SHM此前真实模型/最终提交拒绝与组合7文件147条证据保留。日志为 /tmp/molis-shelf-aqd-final-build.log、molis-shelf-aqd-main-required.log、molis-shelf-aqd-final-query.log、molis-shelf-aqd-home-final3.log、molis-shelf-aqd-final-health-tracked.log、molis-shelf-aqd-final-assets.log；原失败日志保留。

own-action复核的最终行为：公开bindPluginActionRoute原样传execution，Host原caller自然包含Pages content.read/get，因此不需要父动作required_actions；无可信入口的自主own调用拒绝借owner，MCP/Agent allowed refs保持上限。真实来源缺grant时Pages读取拒绝而text成功；Pages是personal，项目隐藏只隐藏入口、仍可读取，测试保留这一原语义；owner不可用的分支由现公开actionAvailability受控拒绝验证，未伪称存在真实Pages停用功能。尚未完成的验证：README要求的plugin-sample Chrome已排队，受整机另一1103文件批次占槽；正式PR与共享核心CI待原队列推进。本地PPT可基于固定提交实施，不等同于这些待验项通过。

W5-01 原调用者 query 委托（AQD，2026-10-18，Codex 接受方案、实施中；PPT 消费者归 DSH）：目标为公共前置功能可用。插件只在本安装正在执行的真实动作中，经 PluginHostServices.actions.invokeQuery(reference,input) 读取已声明 consumes 的外部 query；保留原 actor/project/audience/permissions/allowed refs 和动态授权，再与来源 manifest/grant/实例寿命取交集。普通 actions.invoke 的 plugin audience 自主消费语义不变；不扩 Pages audience，不新增 PPT 专属 pagesRead，不无条件 required_actions，不增加后台委托或持久授权。模型 validateResult 沿已验证 SHM，不重复实现。

公共合同为 PluginActionClient extends BoundActionClient 的 invokeQuery，以及 ActionCallContext 的只减权 query_only?: true。bindActionClient 的父 control 与子 caller 只要任一 query_only 为 true 就保留 true，相关控制 Pick 同步承载，不能在新 bound caller 中丢限制。引用只收现 ActionReference；实际目录选唯一 id/version/provider 的 query，固定 provider，Kernel 在实际派发时检查 query_only 并沿子链保留，拒绝发现后换成 command。 invoke/invokeSync 的 handler 前同步检查同时传实际当前注册 definition.action.permissions，让委托 wrapper 按实际权限复核来源 manifest/grant；只读 handler 不调用 beforeEffect 也不能绕过。来源 consumes 只限制直接目标，Pages content.read/list 内部 get/list 仍受原 allowed refs 和 query_only，不借委托加入原未授权引用。缺 scope、别安装、结束后的 ALS、普通 start/route/timer 不获委托权。保留原父 beforeEffect/同步断言，并用现 retainAuthority 固定目标注册；等待前后、结果交付前复核原父、实例、目标注册/权限，不新增 token registry 或 generation。

真实本机 HTTP 的 authority 在已认证 Host 入口用现 localWebActionContext 取得，原完整 caller 与 client 通过 plugin-actions-client 现 routedControls WeakMap 按原 control 身份保留，克隆/伪造 control 不能取权。项目 root/catalog 路由统一传入可信入口回调；Home 挂项目使用已验证 reference，Home 无项目不读项目 query。Home client 选择只从 Host 已打开/核对的项目引用按可信 caller.project_id 取得，不从 input/query/path 新开库。own route 动作沿原 caller 再加实例/route 检查，不用安装全 grants 或 own+required 替换原 authority。直接 MCP/Agent 沿 currentPluginAction 的原 caller，不调用本机用户工厂补权。派出/嵌套 query 的实际 permission 始终同时核来源声明、实时 grant 与原 caller；新增 grant 或父动作已结束不能延长旧调用。

AQD own-action 复核收敛（2026-10-18）：用户指出普通 services.actions.invoke(own) 的 own+required 包装不能调用外部 query，此现象已核实；其 authority 与 retainAuthority 也只认 own，不能仅给子 allowed_actions 加目标。PPT 已接受接线为公开 bindPluginActionRoute，它传递真实 request.execution 原对象，Host routedActions 取认证入口的完整 caller，因此不经过无来源的 actionCaller。补公开 SDK route 的真实 HTTP 正反回归，确认父 refs 来自 Host 目录、无 Pages required_actions、Pages 可用读取、不可用或缺 grant 时文本仍独立。无可信入口的普通自主 own 调用继续拒绝借用 owner 读取 Pages；克隆 control、MCP/Agent 原 allowlist 不得扩展。AQD-04 的 root 指真实 Home root；单库 standalone 无 catalog 的 Runtime 入口保持原拒绝，不新增入口。另恢复 Home 缺项目的原 400/actions.project_required 诊断，在 Kernel 结算内按真实 own Manifest scope 先于原 caller allowlist 校验，不放大授权。

允许范围：contracts/plugin 与 actions 的上述窄类型、Kernel visibleAction/实际派发限制、Host plugin-actions-client 与一个同职责 query helper、coding-surface/web-request/home-plugin-http 的可信入口、必要 Home executor/host client 装配、真实 Runtime/HTTP/MCP fixture 与拒绝回归。复用现服务/动作目录，不加第二 dispatcher；不改 PPT/Pages 业务代码、动作 schema/version、数据库、文件服务、模型服务或门禁。公开 API 快照、README、安全表由 root 串行整合。共享核心全量交统筹 CI，本机仅整体 build 与包必跑/影响面定向。

验收：`W5-01-AQD-01` 真实 Runtime 父动作调用现 Pages content→get/list 成功且身份不变；原权限/目标 allowed/底层 allowed、来源 grant/consumes 任一不足拒绝且零业务写。`W5-01-AQD-02` 父或目标授权等待、交付前撤权/停用/同 id 重装均拒绝旧结果，旧 scope/timer/别安装不可复用。`W5-01-AQD-03` 直接 command、伪造 operation、发现后同 id/version 换成 command 及子链 command 零 handler 进入；引用缺失/版本/provider/歧义不回退。`W5-01-AQD-04` 真 root 与 catalog Runtime HTTP 保原 caller，伪造/克隆 control、输入项目伪装、断开/隐藏/停用均拒绝；Home 无项目拒绝项目 query，未知项目不新开库。`W5-01-AQD-05` 真实受限 MCP 只授权父动作时拒绝，齐备目标与底层授权时成功；撤权不会被安装全 grants 补回。`W5-01-AQD-06` 文本分支在 Pages 未启用或未 grant 时仍成功，Pages 分支明确不可用，required_actions 不转授权。`W5-01-AQD-07` 原 invoke 的 plugin audience/consumes、own route command 的原取消/权限保持；无 scope 不得作为 owner 委托。用真实 Kernel/Runtime/Host route/MCP、handler 计数及拒绝后可观察状态证明，不以 mock invokeQuery 成功为主证据。

W5-01 Shelf 模型服务前置（SHM，2026-10-18，Codex，本地定向通过、待主线整合）：目标为功能可用，先补 Shelf 迁 Runtime 实际缺少的原图输入、完整推理回执、最终精确绑定复核与只读模型 choices。保留 Shelf 现有工作流、catalog、文件和任务语义，不在此片切换 Shelf 的 Runtime 装配；不改 SDK/vendor、数据库、项目桥或恢复策略。既有公共 model 服务扩展 images（bytes/label）、execution、validateResult() 与 choices()；不接受文件路径、URL、凭据或调用方自带的验证函数，不建立 service map、token/receipt registry。

Host 沿现 hostTextGeneration 真实 dispatch snapshot 产生同步 validateResult，成功及可记账失败保留同次 BoundedInferenceReceipt 和 guard；Runtime 再包原动作 scope、当前安装/grant、signal、同步 caller 授权，动作结束或换代后不能复活。提交仍为原 beforeEffect 等待之后立即 validateResult 再同步写，不用 guard 替代等待。JSON 解码失败保留真实已完成推理的 receipt，普通 provider 失败有真实 receipt 才传，无推理事实不伪造。原图 bytes/label 在首个 await 前复制；沿既有 30 张、单张 32 MiB、总 128 MiB 限制，Host 私有临时目录用内部生成文件名适配现 PrologueInputImage，finally 清理；SDK intake 的格式/原字节校验与资源回收照旧。choices 直接复用 configuredModelChoices 元数据，不解密、联网或重写用户选择。 模型服务内未分类的 provider 错误按 plugin.model_failed/upstream（HTTP 502）返回，可携带真实 receipt 与 guard；已有 ActionError 保留原码/分类，普通领域错误仍按 actions.execution_failed/500，取消、撤权及配置变化不提供可记账失败回执。

范围：contracts/plugin-model、Runtime model-service、Host plugin-model-service/host-complete-text（必要时一个原图暂存 helper）、相关测试与必要开发说明；公共出口、API快照、安全表、共享 spec 与资源由主会话整合。`W5-01-SHM-01`：真实 Runtime→Host→本机模型链验证两种协议原图字节/顺序、等待前快照、prompt覆盖、真实成功/失败/JSON解码回执与暂存清理，伪图/非vision拒绝零请求。`W5-01-SHM-02`：真实最终 beforeEffect barrier 期间连接/模型变化、撤权、停止再启用，成功与失败 guard 都阻止零迟到业务写；原调用结束后及另一次调用不复用旧 guard，未变化对照可提交。`W5-01-SHM-03`：choices 随目录状态即时变化且零请求/零解密、不含地址或凭据引用，精确 selection 与 availability/complete一致、不回退。先整体 build，再模型service/selection/lifecycle/metadata/progress、host-configured-text、prologue-inference-images/native、Shelf AI/job/recipes/settings、prompt-registration与新真实用例；boundary、API、merge-base health、资源门禁由主会话统一做。共享核心全量交统筹CI，本机不跑；本片通过也不代表Shelf迁移完成。

SHM 验证：正式整体构建、API、boundary、merge-base health、资源检查通过；新增及定向 7 文件 71 条通过，原选择测试 4 条通过。包要求与受影响补充 198 文件首轮 195 通过；goal-pin 与 local-mcp 在原源码原断言串行复跑 18 条通过，Jelly 错误测试按上述现行分类分开领域错误与模型错误后 12 条通过，198 文件均已有终态通过证据。未运行本机全量；不将混合批次累加为新全量。后续 main 整合需复测变化面。 SHM 接入 M 主线刷新候选后的 9c19b4ad3 组合已完成整体构建、API、merge-base health（固定5f03）、正式资源及7文件147条定向回归，全部通过。资源仍25项7,476,353 B；这份已核模型guard与随后AQD实现分开记录。

W5-01 Alchemist 生命周期前置（ALC-LIFE，2026-10-18，Codex 已接受、本地定向验证通过，等待整合）：目标为现行架构下功能可用，关闭/删项目先阻止接纳与迟到业务写，再等待真实前台、worker 和搜索工作退出，最后关闭数据库/删除目录；失败后仍能找到未释放资源并重试。源码证据是 local-runtime 只等 worker 而未等前台动作，Host eviction 在失败 finally 遗忘 studio，关闭期 alive 错落离线 purge，四层关闭函数缓存失败或遗忘资源。先修这条完整调用链，不引入分区数据库、borrowedSql、持久授权平台或重复 Store，不把本片称为 Runtime 迁移完成。

插件在现有 actor-actions/helper 统一追踪原始 invoke Promise，覆盖 actions、actionsFor 与内置 HTTP app；传合并 signal 和 studio 自己的同步/异步 effect fence，原 caller 权限仍由原控制决定。关闭同步撤销本实例前台和 worker，等待所有原始工作 settlement 后才关 DB；动作本身的正常拒绝不算关资源失败。并发 close 共用当前 Promise，关库失败保留句柄和禁止接纳状态，下次只重试未成功步骤。Host 共享 studio 同样分开“不再接纳”“关闭中”“已释放”，保留失败 entry/owner，get 不得绕过 draining；runtime、search、目录按依赖收尾。两个 Host 的既有共享语义保持：第一 owner 退出不取消另一 owner，最后 owner 才关闭。idle 清理失败必须被观察且可重试，不吞为成功或紧循环。

Host 关闭开始至资源真正释放期间，项目删除 hook 继续等待同一 live drain；失败不得改走静态 purge。公共 MolisWorkLocalHost.close 对 Alchemist 收尾保留单独重试路径，不重新执行已完成的其它 Host 关闭。同一次关闭中的并发调用与成功后的重复调用必须返回同一个 Promise；只有关闭失败后显式再调 close 才开启新的收尾尝试，已成功的其它 Host 资源仍不重关。搜索组合及 intelligence adapter 保留失败子资源/已 bootstrap 的 foundation，成功的子资源不重复关闭；不在 finally 丢引用或提前关搜索库。任何底层 SDK 无法重试的真实证据须先报告并重新诊断，不能用外层 stub 证明实际资源已释放。

允许修改 Alchemist bootstrap 的 actor-actions/local-runtime（必要时一个同职责内部 helper）；Host 的 alchemist-service-host、alchemist-search、search-evidence-runtime、search-intelligence-client、project-host；对应既有 lifecycle/idle/runtime/search 测试和 README。只有实际回归证明某前台服务缺 effect fence 才补该点。共享 spec、安全表和快照由 root 串行维护；不动 HomePluginExecutor/PluginBackgroundClient/PluginDatabase、SQL schema、动作合同、恢复队列、模型 vendor、UI 或资源门禁。新单元和既有巨大单元都遵守当前阈值，不为修复增长巨大函数。

验收：`W5-01-ALC-LIFE-01` 正式前台模型/metadata 等待中关闭或删除，立即取消和拒绝新工作，原始 Promise 未退出时不关库；迟到成功/失败零新业务写，已合法保存输入保留。`W5-01-ALC-LIFE-02` worker 忽略 abort 的等待同样 drain，现有业务/恢复回归保持。`W5-01-ALC-LIFE-03` 真实 DB.close 一次失败后仍拒绝动作、第二次关闭成功且之后幂等。`W5-01-ALC-LIFE-04` ProjectDeletionService 的关闭/搜索收尾一次失败保留目录与唯一 studio，重试才清理，其他 Host 不另开同项目。`W5-01-ALC-LIFE-05` 公共 Host.close 同次并发和成功后重复调用保持原 Promise 身份；失败后显式重试返回新 Promise、真实再次进入未完成 Alchemist 步骤，其它成功资源不重复关闭。`W5-01-ALC-LIFE-06` 关闭/删除交错和关闭失败后 clear 始终等待 live owner，成功后才允许离线清理。`W5-01-ALC-LIFE-07` 多 Host owner 和 idle/get 交错保持，idle 失败无 unhandled rejection。`W5-01-ALC-LIFE-08` 实际搜索组合的一项收尾失败仅重试失败项，foundation 和 DB 引用保留到成功。

验证先整体 build，再 `tests/security-invariants-alchemist-lifecycle.test.ts`、`tests/alchemist-studio-idle.test.ts`、`tests/alchemist-runtime.test.ts`、`tests/search-evidence-runtime.test.ts` 及改动包 README 必跑；用 deferred 制造真实交错，可经已有 wrapStudio/测试 mock 注入一次资源关闭失败，但不能替换整个生产清理链。同步 effect 拒绝需要接入安全不变量验证。root 核实际 diff、boundary、API、merge-base health/资源与 Host/search 相关回归，独立复查后记录证据。本机全量不运行，两个在途 PR 上限保持。

ALC-LIFE 关闭幂等补修（2026-10-18）：共享全量 39150056775 第 2 次尝试的第 8 分片发现 `system-agent-service` 原有 Promise 身份断言失败。原用例在当前 Alchemist 候选 2/3、干净 main 2b5（与新增 #739 只有文档之差）3/3，确认每次新建 settleHostClose 包装导致回归。修复仅缓存一次公开关闭尝试，失败时才释放该缓存；原 Host 资源关闭 Promise 继续保留，Alchemist 仍可显式重试。补强既有 LIFE-03/05 的失败、并发、重试与成功后身份断言，原真实 Git/MCP/Web 断言不变。最终整体构建、67 个 Host/生命周期相关文件 590/590 条、对直接前置 c7bfbbd2 的完整 health、boundary 与资源实测全部通过；关闭状态归在同一实例状态对象，巨大类保持原行数。日志 /tmp/molis-host-close-fix2-{build,tests,health,boundary,assets}.log；待传播后的共享全量。

ALC-LIFE 本地证据（2026-10-18，生产候选 `f26f8216e`）：整体构建、boundary、API、merge-base health 与资源实测通过；25 项资源共 7,476,413 B，本片无客户端变化。四个针对文件 41/41 条、包内 25 文件 81/81 条通过；其余 75 个相关文件首跑 74/75，`action-before-effect` 的两个 Form 等待用例超时，源码与断言未改后单独复跑 23/23 通过（原失败日志保留）。实际覆盖前台/worker drain、迟到零写、数据库/搜索关闭重试、多 Host owner 与删除交错；独立源码复核无 Blocker/P1。安全用例改名为 `security-invariants-alchemist-lifecycle.test.ts`，进入现有安全发现规则。证据日志 `/tmp/molis-alchemist-life-{targeted,unit,remaining,rerun}.log`；未运行本机全量、未推送或开 PR，最新 main/Runtime 前置整合及 CI 待后续。本片维持现行恢复队列，下一段用户恢复裁定尚未实现。

Alchemist 后续恢复裁定（用户 2026-10-18 选择，尚未实施）：重启保留任务与进度，由用户点“继续”重新授权；禁止自动续跑，不把 actor/job/lease 当授权。沿用 interrupted 与当前实例执行登记派生等待继续视图，query 不写 actor/seed，首次有权 command 再初始化。继续固定原 job/input/方向快照；Exploration 明确展示并在本次等待前冻结当前模型/taste，不承诺缺失的历史上下文逐字相同，不新造 JSON 兼容。Lens 保留原 plan/model/budget/callsUsed，未知调用从最近可恢复 checkpoint 重做，只花原剩余额度，提示可能重复计费；耗尽保留待审阅，并明确需另发新研究，不自行增加预算。安全 checkpoint 不二次调用，继续 A 不消费 B，同一 job 并发点击只能受理一次。此决定写入后续分库/恢复实施合同，本生命周期前置仍保持现行队列行为，不能用本片通过宣称此决定已经实现。

W5-01 Alchemist 显式继续（ALC-RES，2026-10-18，Codex 已完成本地实现与相关验证，待 PR/CI 整合）：目标为现单一 Store 上的恢复功能可用，承接用户上段决定及已验证 ALC-LIFE，不在本片迁移项目数据库或 Plugin Runtime。重启只读显示原 job/checkpoint；旧 queued/running/interrupted 及有明确当前中断原因的 failed 均按实际 checkpoint 判定是否可继续，完成/取消/不可恢复记录拒绝。查询不写 actor、默认 settings、来源或恢复状态，空库 workspace/settings/Pulse 返回一致的纯默认视图；首次有效 command 在同一提交内依 workspace→真实 actor→必要 defaults 顺序初始化。坏记录明确失败，不补猜历史形状。

ALC-RES 本地最终证据（2026-10-18）：整体构建、公开 API/动作快照、boundary、merge-base health 与资源实测通过；正式客户端52,373 B，25项资源共7,478,380 B。包内27文件95条、相关非浏览器190文件1,732条、真实Chrome4文件15条最终通过；保留sandbox原环境条件跳过1条。非浏览器首轮3文件失败：旧生命周期用例沿用自动恢复断言，已改为真实Host的领取前交错、新操作者明确继续并保留历史作者；HTTP测试旧手工入口把正常response关闭当撤权，已改走现有serveTestHost正式入口；Goals MCP原60秒超时后未改源码/时限，低并发复跑通过。浏览器下载首轮在ZIP未完成时读文件，改等CDP对应guid完成事件后保留原内容断言，复跑通过。仅重跑受影响4文件，不把首轮失败抹去。日志为 `/tmp/alchemist-res-final-{build,unit,required,browser,health}.log`、`/tmp/alchemist-res-test-repairs.log`、`/tmp/alchemist-res-download-repair.log` 及最终 reviewed health/boundary；独立源码复核无Blocker/P1，root核最终测试差异与原始日志。用户确认的预算/重复收费提示已实现且桌面、手机实测通过；生产WorkReuse外部接线、项目分库与Runtime迁移仍未完成。本机全量未运行，远端全量/合入及整线验收不能由本段替代。

ALC-RES 共享授权补充（2026-10-18，主会话复核接受）：现单一 continue 的类别来自已存 job，静态 read/write 加实际类别持续权限；Exploration/Lens 需要 generate，Pulse 需要 collect，不能要求两类同时具备。扩展既有 retainBackgroundAuthority(additionalPermissions?) 及可信入口 hook，参数只增加检查、复制冻结，不替换原动作权限或允许引用，不引入授权存储。Kernel 只在活跃 handler 捕获，额外权限必须属于原 caller；无独立入口沿原 signal，独立入口沿后台授权，原 beforeEffect 到期保持。MCP 固定受理时原 allowed refs 与权限来源集合，之后只取该原集合与最新有效 grant 的交集；受理后新增动作、另一版本/provider 不能救活旧授权。绑定父/子 guard 分别保留各自身份与撤权，子额外权限不能替换父权限。HTTP 本地固定 owner 由可信绑定身份持续检查，response signal 只归 route control，正常响应后不撤已受理任务，受理前断开仍拒绝。继续必须先纯读 job 和类别校验，再初始化；缺权限零 seed/claim/失败记账。



ALC-RES08 确认界面补齐（2026-10-18，root核实际UI后接受窄实现）：Lens继续前显示原计划模型及原预算总数/已预约/剩余；计数只从现有效 call_started ledger与绑定原plan派生，不持久化第二份计数、不把预约当已扣费。当前合法 call_dispatched 表示未知结果时明确提示“上次调用可能已收费，继续可能重复收费；该次已计入原预算，不增加预算”。沿同一 lens-progress 解析/校验提取只读inspect摘要，执行read继续保耗尽拒绝；损坏历史仍拒绝且不猜0。ResumeView仅增budget{limit,reserved,remaining}和unknownCall{operation}；耗尽也显示数字但不可提交，安全checkpoint允许零模型完成。真实UI补可继续Lens的数字/原模型/风险提示及桌面手机截图，旧耗尽、双击和正常返回路径保持。最终Chrome用例1/1通过，桌面/手机图已核，无模型真实扣费验证；用户在2026-10-18明确批准客户端脚本单次50,619→53,507 B（+2,888 B）以保留完整提示。只登记这个资源和起点，合入后的已用额度不可复用，其余资源规则不变；最终组合整合及门禁仍待完成。

ALC-RES08 正式体积核对：整合后按正式 Host 服务口径实测为52,373 B（+1,754 B），上段53,507是未包装 factory 字符串。既有服务压缩保留全部预算与收费提示，最终许可因此下调为50,619→52,373，不留1,134 B余量；门禁同时拒绝多一字节、其它资源增长和新基点再次增长。

ALC-RES 动作合同：新增 runs.list/resume/continue@1；explorations.start/research.start@1 改为 concurrent，受理中的授权等待不占串行队列。后两者的输入输出、provider、权限及任务引用不变，固定@1引用仍执行同一受理合同，因此只更新调度元数据与快照，不改工具名；旧串行例外移除。此改动不能证明生产WorkReuse外部接线已完成。

ALC-RES 复查修正（2026-10-19，③，§10.29 #747 的 P2 与统筹裁定 9）：
- 只读查询 `alchemist.runs.resume@1` 改名为 `alchemist.runs.continuation@1`（插件路由 `/runs/:id/continuation`）。这次输出 schema 也变了：`unknownCall.operation` 多了 `generating`。按 `docs/system/CONTRACT-CHANGES.md` 第 3 条，形状变了不能留在原来的 id 和版本下。改名同时解决复查的 P3「名字像命令」：固定了旧 id 的引用会失效报错，不会被静默当成新形状。
- `runs.continue` 与这个查询的拒绝都用 `alchemistStateErrors` 声明，调用方拿到的是码和类别，不再是 `actions.execution_failed`：
  - 冲突（`conflict`）：`job_lease_active`、`job_not_resumable`、`resume_context_changed`、`research_budget_exhausted`
  - 无效（`invalid`）：`job_kind_unsupported`
  - 不可用（`unavailable`）：`background_authority_required`
  - 找不到（`not_found`）：`job_not_found`，对外仍换成 `alchemist.run_not_found`。插件路由回 404；经动作网关或 MCP 时这个错误不带类别，读成 `invalid`（原来就如此）
- 预算耗尽原先由校验器抛普通 `Error`，现在校验器只报告，由继续服务按声明的码拒绝。
- 探索停在 `generating` 检查点时，模型结果未知，可能已经收费。恢复视图对它也给 `unknownCall`。探索的确认串包含这一状态，所以在它之前给出的确认会被拒绝（`resume_context_changed`）。界面上「可能重复收费」对两类任务都显示，「计入原预算」只在有预算（Lens）时显示。
- 验收 `W5-01-ALC-RES09`：探索在 `generating` 处恢复，视图给出未知调用，旧确认被拒且不派出调用，新确认继续时再调一次模型。
- 待补浏览器验证（用户 10-19 暂停）：探索在 `generating` 处继续的对话框显示「可能重复收费」、不显示「计入原预算」，三种宽度加暗色，验收号 `W5-01-ALC-RES09`。
- 验收 `W5-01-ALC-RES10`：每种拒绝的码与类别都核对过，包括没有后台授权的入口与找不到的任务。
- 事件流路由删除（2026-10-20，③ 派的 Alchemist 清理片）：`GET /api/v1/runs/:id/events`（SSE）只有两个测试用，页面、Skill、手册、路由表快照都不碰它（页面读 `runs/:id/continuation`，其他入口读 `alchemist.runs.events` 动作，按游标轮询）。路由与处理器一起删，两个测试改读动作与续跑视图。删它是为了迁到 Plugin Runtime 时不用为一条流式响应另做转发。验收 `W5-01-ALC-LIFE-09`：该路径回 404 且不是事件流，事件仍可由动作按游标读完。
- 四个模型动作声明 `model:invoke`（同日）：`alchemist.reuse.assess`、`conversation.send`、`explorations.start`、`research.start` 的权限由 `alchemist:generate` 加 `alchemist:read/write` 变为再加 `model:invoke`；`model:invoke` 是平台检查「这个动作可以用系统文字模型」的权限，迁到 Runtime 后 `services.model` 只在声明了它的并发动作里可用，现在先把声明补齐。
  - 保留 `alchemist:generate`：它是 Alchemist 自己的词汇，MCP 客户端、Agent、流程已有的授权按它写，模型不可用的判断（`createAlchemistActionHandlers` 的可用性绑定）、后台继续时保留的权限（`job-resumption.ts`）和 `tests/model-unavailable-declarations.test.ts` 都认它；去掉它会同时改授权词汇和这几处，没有收益。与 Images、Shelf、Cognia 一样，领域权限和 `model:invoke` 成对出现。
  - 版本保持 1（用户 2026-10-20 经统筹 ① 裁定，与 `research.cancel` 同一做法，见 §1 决策记录里 2026-10-20 的 `research.cancel` 一行）：这四个动作只多了一个权限，输入输出形状没变，`tooling/gates/README.md` 的动作合同快照表把只改权限归为「谁能调、怎么调变了」，不升版本。同一版本下已授权的客户端可以重新授权：MCP 授权记录的是「某个 `capability@version` 的确切权限集合」（`apps/local-host/src/mcp-action-grants.ts` 的 `matches()` 要求集合相等），集合不一致时授权页标 `stale`（`apps/local-host/src/mcp-action-access.ts`，「能力所需权限已变化，请查看新权限后重新授权。」，`can_enable: true`），在设置页重新授权一次即可，调用在此之前以 `mcp.action_revoked` 被拒并提示重新检查对外接入设置；MCP 工具名不变（`__v1`），固定 @1 的流程步骤照常解析。用户在 #835 选了不改名，`research.cancel` 也保持 @1。这四项一度升到 @2（先例是 Images `jobs.start@1→@2`，#743），被评审指出理由不成立后撤回。
  - Manifest 里 `model:invoke` 为可选（`required: false`，同 Form、Dataset）：内置插件新装时所有声明的权限默认全开，包括可选的（#741）；已装的 Home 与项目跟随新构建时，`install-rules.ts` 的 `followBundledBuild` 保留已有取值、必需权限补上、新声明的可选权限默认开，人关掉过的仍保持关闭。关掉它只会让这四个动作不可用，其余动作不受影响。Alchemist 现在是构建期装配、没有安装记录，页面调用者的权限由 `ALCHEMIST_ACTION_PERMISSIONS`（从各动作的声明推出）给，随动作自动带上。
  - 验收 `W5-01-ALC-RES-AUTH-04`：只有这四个动作声明 `model:invoke`、计费为 metered、调度为 concurrent、版本为 1，Pulse 不声明；Manifest 里它是可选权限、其余仍为必需；调用者没有它时这四个被拒（`actions.forbidden`）、不派出模型请求，读与写类动作不受影响；MCP 工具名不变（`__v1`）。
  - 本片没改的：`runs.continue` 也会派出模型调用，但它声明 `[]` 并按任务类别取保留的后台授权；等它迁到 Runtime（PG-108）时再决定是否声明 `model:invoke`，否则 `services.model` 会拒。
- 不在这里做的：裁定 10（把按任务类别另要的权限写进声明）和 `runs.list` 的分页，都是 P3，另开一片。

ALC-RES 搜索最终边界补充（2026-10-18，root 已直接核对调用链并接受窄实现）：现 beforeDispatch 仅在入口，之后还等待 bootstrap、DNS 与 TLS；SEL 会写 opaque operation、secret 与正文。RES03 必须覆盖这些实际业务效果，不能以每秒撤权轮询代替。允许在 Alchemist search 资源现 owner 内用每次调用的 AsyncLocalStorage 传递本次 beforeDispatch/assertCurrent，Host search-evidence-runtime/search-intelligence-client/anysearch-transport 接同一可选检查；storage 的既有 search-storage blob/secret owner 在最终同步写入前检查，不越 owner 写 SQL、不改 vendor 或密文/schema/路径、不加授权持久化。查询控制不存在时，已配置此检查的 Alchemist 调用拒绝；未配置的 Feed 现行为保持。bootstrap 共享 promise 不能固化首次调用的权限，失败后沿现 ready reset 可再尝试；资源关闭仍等待真实 promise 退出。

`W5-01-ALC-RES-SEARCH-01`：真实 AnySearch DNS 等待后撤权，最终建请求前拒绝；TLS 等待期间撤权，在 secureConnect 已核合法 peer 后、req.end(body) 紧前再次同步检查，零请求正文发送；extract 也逐次检查，不放宽原 SSRF/TLS/响应上限。`W5-01-ALC-RES-SEARCH-02`：真实 SEL bootstrap/provider 晚回执期间撤权后，search.sqlite opaque rows、secret/content 与 Studio job/checkpoint/events 均无迟到结果或失败记账，原合法预约保持；同步 blob 各写方法实际拒绝、原行不变。`W5-01-ALC-RES-SEARCH-03`：未配置 hooks 的 Feed/Search 现回归不变通过；无 scope 的业务写拒绝但关闭可完成，真实文件/SQLite owner 与模型入口不增加第二实现。新增 API、安全表与派生检查仍由 root 整合；本段是现 RES03 完整修复范围，不引入数据库分区或 Runtime 迁移。

允许最小新增范围：contracts/actions.ts、Kernel action-execution-context.ts、Host mcp-background-authority 与必要的 mcp-action-client 原解析上下文传递、plugin-route-control、web-request/web-project-context 可信入口和 actor-actions 参数透传；不全局移除 signal 检查、不变更 action refs 或模型 availability。`W5-01-ALC-RES-AUTH-01`：两类单独权限成功、缺类别在初始化前拒绝、参数快照及原动作到期保持。`W5-01-ALC-RES-AUTH-02`：真实 MCP 原来源撤销、新 grant/版本/provider 不恢复旧 guard、最终同步检查拒绝且零迟到写；父子撤权独立。`W5-01-ALC-RES-AUTH-03`：真实 HTTP 正常响应后继续，受理前断开、studio stop/Host close/项目删除/provider 换代拒绝；安全 checkpoint 在模型离线但类别权限有效时零模型落库。API、README、安全表及快照由 root 整合。

继续动作只收 jobId 与必要所见上下文确认值；项目与操作者来自真实 caller，历史 job.actorId 不授予权限。保留原 input/方向/plan；Exploration 固定本次确认的当前具体 modelId 与 taste，列表等待前先冻结选择政策与 taste，配置变化要求重新确认，不静默改模型。Lens 沿原 plan/model/budget；唯一累计预约数读完整 call_started 序列，严格验证 1…n、原 budget 与 checkpoint 一致，每次外部调用前在同一事务保存 n+1 事件及 marker。未知调用可能已收费，从最近安全 checkpoint 重做仍占原剩余额度；不把阶段 max3 字段当累计重试次数，不取 max、不用尾页或 fallback 猜数。安全 ready_to_persist 零模型落库；还需模型而预算耗尽时保留待审阅，不扩额或伪装正常成功。

每次 start/continue 在有效动作内取得既有 retained authority，并同步按 jobId 登记当前实例的 pending 防重；单 worker 忙时等待的本次命令不先占 lease。worker 只从有本次授权的内存队列取指定 job，授权后 CAS 状态与 lease；不消费旧持久队列、不并发第二 worker、不引入后台持久授权。未过期陌生 lease 拒绝接管并显示到期等待，过期后仍需新 command CAS。每次模型/搜索/外部 link 派出、续租、checkpoint、领域成功/失败记账前复核同一 authority 与 lease，撤权/停用/关闭后零业务写；等待中的真实 Promise 未退出仍由 ALC-LIFE drain，不提前关库。取消只作用指定 job。Pulse 共用此继续入口与授权，已完成来源不重复消费。

HTTP 接入须沿现 plugin-route-control 捕获 entry-owned 权限与 Kernel 注册身份，再交 retained authority：正常 response 结束后已受理工作继续，受理前断开拒绝，项目删除/Host 关闭/provider 换代/撤权仍阻止。MCP 走真实 gateway 的 backgroundHostCurrent，不手造永远成功的 guard。Lens workReuse.reconcile 的外部 linkConsumption 与本地 receipt UPDATE 都受本次权限，后者还走 worker lease 提交；撤权后迟到结果不得更新 receipt 或记失败。原复用 snapshot.actorId 归属校验保持，换操作者不符明确拒绝，不修改历史作者绕过。

允许范围：Alchemist bootstrap/jobs/相关 services/shared contracts/manifest/既有 client 及测试；Host 现 Alchemist HTTP/retained-authority 必要接缝与 work-reuse 实际接收端。一个 Store、现物理路径、现 SQLite schema 保持；不增加恢复平台、锁系统、并发 worker、第二队列事实或 vendor。唯一 spec、README、安全表、API/action 快照由 root 串行维护，门禁不放宽。现模型/搜索/复用合同复用公开入口；项目分库与 Runtime 接线另片，不能冒领本片完成。具体字段与函数划分由实施者在现结构中选择，小函数遵守现门禁。

验收：`W5-01-ALC-RES01` 真实进程重启后旧任务/lease/checkpoint保留，重复 query 零业务写、零自动 dispatch，空库三种视图可读。`W5-01-ALC-RES02` 同 job 双击只一份登记/lease/dispatch/产物，继续 A 不消费旧 B，A 忙时新授权 B 等待且不占 lease，等待撤权零写。`W5-01-ALC-RES03` 授权/模型/搜索/linkConsumption/提交各实际等待中撤权、禁用、关闭或删除，迟到成功与失败零业务写/续租/额外派出，真实工作未退出不关库。`W5-01-ALC-RES04` 原方向不变，本次所示 model/taste 固定且不可用明确拒绝，安全卡片 checkpoint 不重复模型或产物。`W5-01-ALC-RES05` Lens 四类未知调用恢复累计计数不归零，计数不完整拒绝，耗尽无 dispatch/扩额且可读，安全 checkpoint 可完成。`W5-01-ALC-RES06` 首次 command 外键顺序/一次默认值、query 零 seed/actor、真实继续操作者与历史作者分明，伪改 job.actorId 不增权。`W5-01-ALC-RES07` Pulse 已完成来源不重复，取消与权限拒绝不写失败。`W5-01-ALC-RES08` 真实 UI 重启视图确认并继续、双击忙态、耗尽提示与原任务链接；真实 HTTP 正常返回后后台继续/受理前断开拒绝/MCP 同动作结果均验证。`W5-01-ALC-RES11` Pulse 能从 HTTP、界面、MCP 同一个动作取消；在等待外部来源期间取消，业务记录零写；MCP 经工具 `alchemist.research.cancel__v1` 取消排队中的 Pulse，动作仍是 `@1`（本节决策表 2026-10-20 一行）；等待确认继续（宿主重启后作业未受理）时，Pulse 列表的「停止」与 Lens 页脚的「停止研究」照样给，点下去走同一个取消动作，之后零写入、不能再继续（BL-370，D27 第 4 条：进行中、等待中都显示「停止」）。

先整体构建，再按 README 运行 Alchemist runtime/worker/recovery/authority/Host 生命周期与包内测试，新增交错调用生产路径；根排真实 Chrome 和合并后的边界/API/action/health/资源验证。工程通过、真实本地替身路径通过与用户本人体验分开记录。本机全量及真实 Home 不运行；本节尚无实施或运行证据。

W5-01 Runtime 最新主线整合（2026-10-18，merge `9eb049928`，本地定向通过）：纳入 Todo `b1683481b` 与 main `7faaa027c` 的侧栏/正式 SDK；Host/合同/Images/Jelly 生产增量相对前一 Runtime 候选 `3cb549a9c` 为空。完整 offline 安装与整体 build、API（0变化）、merge-base health/快查、实际资源与边界检查均通过。25资源共7,476,626 B，workbench.js 1,112,588 B，仍仅 main 1,110,329 B 加原未使用的 Todo28 B+灵光2,231 B；#661原减少量已在main内，未重复抵扣。保留全部历史许可失效回归；材料安全编号因main S-38已归命令PATH而顺延S-39，只改表/测试编号。

本组合17个相关非浏览器文件最终228/228通过：模型/原beforeEffect/材料/进度6文件75条，以及正式资源、Images/Jelly真实MCP、Home生命周期/项目路由/删除、命令PATH、错误模型及动作合同11文件153条。首次脚本误列5个不存在的文件，且资源用例早于派生预算完成而失败；不存在的项未执行，完成派生后按仓库真实文件名补验，未改产品源码或断言。此为当前main组合的定向证据，不是本机全量或SHM/AQD完成。下一步在各writer冻结后向S/A串行整合，PPT仍等AQD+SHM实际可用head。

Todo固定head b1683481b 的Chrome补验现已完成：todo.e2e 5条、side-shelf-in-hand 1条、context-toolbar-panes 3条，共9/9；首次不存在的todo-app文件名已纠正，未用它作为产品失败。PR #684正文/评论已更新而不另推文档打断CI；必需Verify、产品子集、安全检查成功，远端全量仍在跑。下段保留该提交准备时的记录，不代表这些Chrome仍未完成。

W5-01 合并 #661 后复核（2026-10-18，候选 `236f3a57d`，本地定向通过）：merge 固定 main `5f03d1e4`，保留原历史和通用 Runtime 接线；生产增量仅纳入 main 的忙碌表单刷新保护，Host/合同/Images/Jelly 生产源码与原 `9892c6b9d` 一致。原 Todo +28 B、灵光 +2,231 B 的未使用额度仍合计 +2,259 B；main 已含 #661 原分支的 −71 B（旧 main 1,110,187→原 #661 1,110,116），不能再次扣除。因此本次许可重定至实际 main 1,110,056→实测 1,112,315，原消耗起点继续拒绝，没有新增额度。API/action 已按实际生成；整体构建、健康、边界与正式资源门禁通过，25 项资源共 7,476,353 B。合并后 12 个相关文件最终全部通过；其中 Jelly MCP 首轮超时，原测试串行复跑通过。错误模型测试恢复本组合原断言后 12/12 通过。此证据固定 main 5f03d1e4，尚不包含之后侧栏及 vendor 更新，不称远端 CI 或整线完成。Jelly 流错误在本组合仍按原 500/actions.execution_failed 断言；Shelf 的后续 SHM 才新增可携带回执/guard 的模型失败合同，相关 502 断言留在 SHM，不提前混入此组合。

W5-01 Jelly / Images 并行前置（2026-10-18，本地定向通过，待队列与 CI）：用户要求每个插件迁移独立 worktree，plan 与已明确的实现并行、主会话 review。当前工具最多主会话加三个运行中的子代理，四个子任务负责人按依赖接续；不增加在途 PR 数、不合并、不加标签、不碰真实 Home。此候选包含模型选择前置 `e8925f8ea`、#661 `0fbc0c89e` 与已验证的后台、材料、灵光、Cognia 前置，不宣称这些候选或 #661 已合入。材料已按用户 10-18 决定顺延 S-38，主线常开插件 S-34 保留。已有 Todo +28 B、灵光 +2231 B 的许可重定至实际 main 的 workbench.js 1,110,187 B；保留组合中减少的 71 B，实测 1,112,375 B，净增 2,188 B，无新增增长授权，前序合入后只可重定仍未使用的额度。

- Jelly 模型配置采用 `services.model.configuration.selection/read/save`，可信 Home 条目声明唯一 preference 文件、固定 custom provider、设置 read/save 动作引用；不接受调用方路径、身份、凭据或任意 service map。Host 消费者模型配置服务独占解释与读写模型选择，仍用原 `jelly/preferences.json` v1 和现有 ModelProvider/Connector owner；Jelly 拥有日历、笔记、设置动作/UI和消费入口。53 动作全部由 Runtime 唯一提供，受众/权限/schema不缩小；显式模型选择不回退。通用配置实现替换原 Jelly 专属 Host 实现，不留第二份设置逻辑；原 provider+preference 同步补偿保留，Connector 首次 origin pin 不随之后文件失败回滚的现有边界明确保留。配置 read/save 绑定原执行动作，所有持久效果前复核 beforeEffect、当前安装/权限/同步授权；selection 只给当前安装自身模型名字供 availability。`W5-01-JMC-01`：真实 Runtime 保原53动作/模型选择/配置格式且保存不联网。`W5-01-JMC-02`：设置专属调用、伪声明、跨安装、停用/换代/撤权/过期回调拒绝，原文件/provider/连接零迟到写。`W5-01-JMC-03`：输入等待前复制，失效选择不回退，文件失败后按现有 provider/preference/pin 各自边界断言。
- Images 采用专用 `services.imageGeneration.connections/inspect/bind/unbind/generate`；声明在可信启动条目，保留 `("home","images",slot)` 绑定、原 v1 库与资产位置。连接和密钥仍只由 Connector owner 解释，模型只经 agent-host；输出字节交插件验证/保存，不把任务、调度或私有SQL搬入Host。inspect必须只读，assertTarget首次pin只在授权后；并发指纹只含不透明摘要，不向插件泄露密文或secret引用。生成使用既有后台授权与文件服务，前后和每次派出核原连接/权限，取消或撤权不写失败记录。`W5-01-IMGPORT-01`：无密钥loopback、有失效绑定loopback、错误服务/目标、disabled/removed及凭据/绑定中途变化均按现行边界拒绝；实际请求与结果可核对。`W5-01-IMGPORT-02`：真实Runtime当前动作/安装与后台授权检查，迟到成功/失败均零业务写，停止、重新启用、孤儿文件及最多两项运行/幂等行为实证。
- 恢复沿现有可信 native 安装的数据库/文件生命周期授权，在新实例注册并接受任务之前把旧 running 标 interrupted、清未引用资产，绝不重派厂商；不伪造 user/action 身份，不新增恢复任务平台。项目删除保留原“同步取消该项目后台，再 purge”的语义，不能改成只等200ms轮询。公共 live-owner 接缝由主会话在现有 ProjectDeletedHooks/可信 catalog 上接线，插件只给自己的同步停止回调，停止/卸载/升级后回落原离线 purge。`W5-01-IMGPORT-03`：真实删除、固定id重建、等待中撤权/停用交错，删除回执返回前停止且之后无迟到资产/记录。

整合中发现并补充的合同保持：图片生成返回当次派出检查后的 `{ images, revision }`，Runtime交付及插件写文件/任务时均按该receipt的revision复核，不能在返回后重新inspect并把新连接版本当作旧结果的版本。selection/inspect/connections供availability读取，只读检查保留安装、声明、scope、权限和取消，不再递归触发会重算availability的完整assert_authority_current；设置写、绑定与真实模型调用的beforeEffect/最终同步授权保持。Jelly保留原NDJSON planning进度和断开取消。Home插件的项目路由按Host已从路径验证的project构造本地授权，不能用无项目的目录漏掉仅项目动作的权限；未带项目、隐藏插件或失效安装仍拒绝。`W5-01-HPR-01`：真实HTTP有项目时抵达输入校验/成功动作，Home或隐藏/撤权后拒绝，不借另一项目、请求体或query授予项目身份。原完整Images HTTP/并发用例与新增Home项目路由拒绝回归共同证明。

整合 HTTP 回归补充：Images 的图片预览必须内联显示、显式下载保留附件文件名；现有 Runtime bytes 一律 octet-stream 附件会使图片 UI 无法显示。公共响应补可选 disposition（inline/attachment，省略仍 attachment），Host 只保留 image/png、image/jpeg、image/webp 三种无脚本位图 MIME，只有显式 inline 才内联；其他 MIME（含 HTML/SVG）一律仍为 octet-stream 附件。所有二进制响应继续由 Host 固定 nosniff、sandbox、no-store，不接受插件 headers。`W5-01-IMGHTTP-01`：真实 Home/project HTTP 验证三种位图的内联/下载与字节、文件名，HTML/SVG及伪头仍拒绝内联；Images 实际生成→预览→下载回归通过。未知 Images 错误继续对外只给 images.internal 与原通用句，不能泄露内部路径；已知 owner/平台错误保持原码和状态。

数据库声明收尾：Images/Jelly 各自以 IMAGES_DATABASE/JELLY_DATABASE 作为唯一 version/schema 定义，Runtime、离线项目清理与 Home 库目录共用；删除旧 baseline 名字及重复包装，同步发布版本表与调用测试，物理路径/版本/SQL 不变。客户端只收束重复 data-images 选择器，保持任意 selector 的 $、class 与 directory 查询路径；用于抵消完整插件路由带来的 44 B，不修改压缩器或资源上限。

动作合同收尾：Images jobs.start 因 Runtime 后台受理改为 concurrent、增加 model:invoke 并声明后台状态追踪，按当前合同规则升到 version 2；输入输出和 request_id 幂等形状保持。客户端、HTTP和连接使用位置从同一 imagesActions 引用取版本；MCP 当前工具为 images.jobs.start__v2，旧版固定引用失效并要求重新选择，不加兼容别名或改真实Home。只读MCP客户端须在当前v2仍被拒绝，v1不再发现；动作快照显式登记这一版本变化。

项目清理接缝：HomePluginHost 用目录原 project_data 的 owner、label 与 purge 注册既有 owner 栈的 wrapper；clear 从 Runtime 取当前已发布 contribution，同步调用可选 onProjectDeleted 后立即执行原 purge，中间不 await。可信声明按 definition 对象冻结并在正式发行物恢复时传递；无声明却返回回调、异步回调均拒绝。回调仅取消本实例内存任务，不授予写库/文件权；停止/卸载期间无 contribution 即走原 purge，Home 释放在实例停止后恢复原 owner。Images 在第一个 await 前登记受理取消信号，删除与固定 id rebuild 后旧信号不可复活；已写入但尚未引用的文件按启动恢复清理，不宣称回执当刻全部收回。`W5-01-RPC-01`：同步取消先于 purge、当前代次投递及 close 恢复原 owner；`W5-01-RPC-02`：缺可信声明、原声明被变更、异步回调及抛错均真实拒绝或保持冻结身份，拒绝不执行 purge；`W5-01-RPC-03`：受理等待/文件提交交错、旧任务晚到与恢复按 IMGPORT-02/03 实证。（2026-10-21 C4 改：`onProjectDeleted` 已删，删项目改由平台按项目停掉 `services.background` 受理的执行再 purge，插件不被调用；`W5-01-RPC-01/02` 现在证明这一点，见 PG-038、PG-106。）

实施边界：配置合同与其Runtime gate/Host owner、图片合同与其Runtime gate/Host adapter可分别准备；共享 plugin合同出口、可信identity、Home executor、catalog、公开API/动作快照、SSOT、安全表与资源由主会话串行。两项新服务仅接当前 Home 消费方，不为项目执行器预埋。插件迁移各自独立worktree，平台前置与插件切换分提交，先冻结合同再整合消费者。验证先整体build，再各包README、真实临时Home/Host/Runtime、定向Chrome、boundary、merge-base health、API/actions与实测资源；共享全量交统筹CI，不在本机跑全量。尚未实现/运行的编号不记通过。

本片验收：W5-01-JMC-01～03、IMGPORT-01～03、HPR-01、IMGHTTP-01、RPC-01～03 的真实临时 Home/Runtime/HTTP/MCP、并发拒绝和持久化路径通过。最终整体构建、API/动作快照、boundary、完整 merge-base health 与资源通过；健康快查收紧为 136 个巨大单元、486 处测试内部引用、20 个插件专属 Host 文件、20 处 registerProvider、393 处插件包外点名。25 项资源共 7,476,413 B，其中 Images 22,458→22,212 B、Jelly 91,233→91,167 B。135 个包要求及相关非浏览器文件首轮 133 通过：Images MCP 仍找旧 v1、发布版本表未识别重复包装声明两项已按上述现行合同修复，并在补充批通过。安全/合同与变更重验 103 文件首轮 102 通过；assistant-thread-reply 第二条在 fetch 收到 ECONNRESET，原代码单独复跑 3/3 通过，没有改断言或超时。5 个真实 Chrome 文件 19 条通过（configured-text、content-context-regressions、model-ready-surfaces、plugin-sample、images-actions）。保留 plugin-sandbox-network 原环境条件跳过 1 条；没有据此声称所有环境已覆盖。

运行证据：`/tmp/molis-runtime-migrations-{required,completion,browser-final,final3-build,health-final2,boundary-final2,assets-final3}.log` 与 `/tmp/molis-runtime-assistant-recheck.log`。这批验证使用本机受控供应商和隔离 Home，证明配置/授权/真实请求及结果保存的调用链，不代替真实外部厂商、一骏本人体验或最终 CI；本机全量未运行。后续仍需按原队列逐插件接实际 main、正式 CI 与 PR 交付，整个 W5/W6 未完成。

W5-01 模型选择前置（2026-10-17，Codex，本地定向通过，待前序与 CI）：Jelly 的现行 `preferences.json` 保存独立的供应商/模型选择，Shelf 也有逐次选择；Runtime 的 `services.model` 目前只用默认模型。迁移不能丢掉人的选择，因此先补公共服务的精确选择入口，目标为功能可用并由真实 Host/Runtime 与本机模型替身验证。`availability(selection?)` 和 `complete(prompt, { selection })` 只收已有目录中的 `provider_id`、`model_id`；不指定时沿用默认选择，指定后找不到、停用或连接失效均拒绝，不落到另一供应商或环境模型。选择在任何异步等待前复制，调用途中改原对象不改变本次目标；凭据、地址及模型配置仍由 Host 持有，派出前与返回后的现行授权/连接检查照旧。

范围为 contracts 的 `plugin-model`、Runtime `model-service`、Host `plugin-model-service`、对应测试/API 快照与开发说明；不修改 Jelly/Shelf 的 UI、偏好格式、库版本、专用配置入口、连接管理或 Prologue SDK，也不触碰真实 Home。Jelly 的偏好存储与专用供应商管理仍是后续迁移依赖，本片不冒称 Jelly 已迁完。基于已验证后台授权候选 `46058ab7b` 本地准备；#661 定形后的连接启停语义由其公共 Host 路径继承，不复制到 Runtime。

验收：`W5-01-SEL-01` 两个已配置模型下，默认调用保持原选择，显式选择只到目标模型，状态标签也对应目标；`W5-01-SEL-02` 无效形状、目录缺失、已停用/断开的目标均不发模型请求，不因另一个模型可用而回退；`W5-01-SEL-03` 等待授权时修改原选择不改变此次请求，撤权/取消与连接变化仍阻止派出或交付结果。以隔离 Home 的公开配置 HTTP、真实 Runtime 动作、本机替身请求记录和拒绝后零请求/零业务写入证明；运行 `tests/plugin-model-selection.test.ts`、`tests/plugin-model-service.test.ts`、`tests/home-plugin-model-lifecycle.test.ts`、`tests/security-invariants-plugin-model-progress.test.ts`、`tests/host-configured-text.test.ts` 与包必跑定向批次。整体构建、API 快照、boundary、merge-base health 和资源检查通过后提交本地候选；共享核心全量仍由统筹在 CI 排，不新增第三个在途 PR。

本地验证：整体构建、API 重生成、boundary、merge-base health 与资源通过；资源仍为 25 项、7,480,612 B，本片增量 0。首批 5 文件 51 条（新选择测试 4 条）与相关包补充 83 文件 954 条全部通过，共 88 文件、1,005 条、0 失败/跳过；日志 `/tmp/molis-model-selection-{targeted,required}.log`，用例清单 `/tmp/molis-model-selection-required.json`。新测试 4 秒且无 Linux 限制，加入 CI 产品子集，Linux 实跑仍待发布后的 CI。`W5-01-SEL-01/02/03` 的功能与拒绝路径均已由真实 Host/Runtime、本机模型替身验证；不代表真实外部模型、Jelly 迁移或整线验收通过。未运行本机全量；共享核心全量由统筹安排。

材料服务编号（2026-10-18，用户确认顺延）：Runtime 材料服务原顺延为 S-38；main 7faaa027c 的 SDK 命令路径规则现占 S-38，本地整合沿原顺延原则将材料改为 **S-39**，保留 main S-34～S-38。安全表与对应拒绝测试同步；以下旧验证中的 S-33/S-34 只表示当时编号，保留原运行事实。本次不改变授权、行为或断言；材料候选在前置合入后接实际 main，旧基点没有的中间编号不补造条目。其他在途分支的编号由其 owner 接当前 main 排列。



W5-08 收尾组合验证（2026-10-18，本地通过）：合入当前 Runtime、D1 成果查询与 Images 翻译候选后，Module 不公开 Repository 的四项断言与 D1 业务测试同时保留。整体构建、API、boundary、merge-base health、资源更新通过，25 项资源 7,478,980 B、此片无增量；项目目录/绑定、Projects/Governance、成果服务与 SDK 调用等 11 文件共 66 条已有通过终态。首次动作快照用例发现上游 PPT/Dataset 的六条 D1 查询登记尚未传播；合入上游最终快照后 25 条同断言通过，未改生产或放宽测试。日志 `/tmp/molis-module-boundaries-closeout-{build,api,health,boundary,assets,targeted,actions-recheck}.log`。既有大批定向证据保留，共享核心全量及 PR/CI 仍待，不把本组合验证记为整条 W5-08 完成。

W5-08 Runtime 项目绑定出口（2026-10-17，Codex，本地定向通过，待队列与 CI）：在第二片 `0a1a9f7c3` 上处理 `private-work-context`。唯一包外生产构造在 Host 的 `project-catalog.ts`：它直接装配 `RuntimeContextBindingRepository`、Resolution、Commands，并把 Repository 方法接进项目创建和删除。目标为功能可用：由 owner 的 `createRuntimeContextModule` 在同一数据库连接上完成装配，只向 Host 提供现有绑定命令、创建并绑定服务与删除项目绑定事实的服务；Repository 不再从包入口导出。项目目录创建/补偿仍由 Host 的 provision 端口负责，原事务、确认、幂等、项目事件、Session/Ledger 语义保持。

范围为 owner 内一份小型装配、包入口/README、Host catalog 装配与对应公开入口用例；不改 Repository SQL、库版本、模型或插件配置、路径授权、真实 Home、加密内容 API及其格式。其余八项 Store/interface 出口另按实际消费者处理，不做为过计数的改名；没有新增 testing 子路径或内部导入。已核对在途 #661/#699/#634/#704/#706/#708/#631 的文件清单，与本片不重叠。

验收：`W5-08-CTX-01` owner 包不导出 RuntimeContextBindingRepository，Host 不再构造/保存它，绑定服务仍由同一 owner 装配；`W5-08-CTX-02` 通过公开 Catalog 入口确认绑定、读取事件、创建并绑定的幂等重试及删除时的绑定清理仍正常，缺少确认时零绑定/事件；`W5-08-CTX-03` private-work-context 和 Host README 必跑、相关 Runtime/MCP/Session/项目删除用例及构建、完整 health、boundary、API/动作快照/资源通过；`W5-08-CTX-04` 边界门禁要求 owner 工厂并拒绝包出口/Host 再暴露 Repository，原直接 SQL 和大小限制仍能拒绝，新增装配文件纳入原大小检查（`tests/private-work-context-boundaries.test.mjs`）。以隔离临时 Home 验证；共享核心全量仍交统筹 CI，不运行本机全量。

本片验证（2026-10-17）：整体构建、完整 merge-base health/API/下降快查及页面资源通过；公开入口首批 3 文件 17 条、Chrome 2 文件 20 条、README/受影响补充 97 文件 1,072 条，共 102 文件 1,109 条全部通过，零失败/跳过（`/tmp/molis-runtime-context-{build,regression,health,assets}.log`）。结构计数由 9 降到 8，Host catalog 类 289→278 行，页面资源增量 0。首次 boundary 失败于 `checkPrivateWorkContextOwnership` 硬编码要求 owner 导出及 Host 使用 RuntimeContextBindingRepository。用户随后明确批准已展示的门禁补丁：改为要求 owner 装配并拒绝旧 Repository 出口，保留 SQL/大小限制且把新装配文件纳入大小检查；已应用仓库，补充整体构建、新门禁和相邻边界 5 文件 16 条、真实 boundary 及完整 merge-base health/API 均通过（`/tmp/molis-runtime-context-{gate-build,gate-tests,boundary-final,health-final}.log`）。现有语义回归不因仅改变门禁重复跑；共享核心全量仍由统筹 CI 安排，没有宣称整条 W5-08 完成。

W5-08 Module 存储出口第二片（2026-10-17，Codex，本地定向通过，待队列与 CI）：在第一片 `5b1493e28` 上收 Goals、Artifacts 与 ProcessItems 的公开 Repository。当前包级搜索确认 `GoalsRepository`、`ArtifactsRepository` 及服务构造只在各自包内使用，外部生产调用已经走命令/查询服务。目标为功能可用：两个 Repository 不再由包入口导出；三个 Module 只在构造期持有局部 Repository；`createGoalReadServices` 返回的查询服务与 Artifacts/ProcessItems 的 service/query/commands 使用私有字段保存 Repository，去掉可直接读到的 `repository` 成员。

本片仅改两包的入口、查询/成果服务、README 与既有公开入口用例及下降快查。保留所有业务服务、查询结果、错误、SQL、事务和版本结构；不动 Host、Plugin SDK、动作合同、门禁规则或真实 Home。第一片保持独立分支；其余 Module 与 Host 入口仍属后续工作。本片不将内部实现隔离描述成安全沙箱。

验收：`W5-08-MOD-03` 两个包不再导出 Repository，三个 Module 及返回的上述服务不公开 `repository`；`W5-08-MOD-04` 通过公开入口创建/读取 Goal、生命周期、成果和过程项版本仍正常，幂等、冲突拒绝与持久化结果保持。先整体构建，再运行两包 README 必跑和相关公开调用方（含过程项、Goal 只读装配、规划与生命周期）；核对 boundary、merge-base health、API/动作快照及页面资源，结构计数只下降。共享核心全量仍在统筹 CI，按已有授权不运行本机全量。

本片验证：整体构建、boundary、完整 `check-health-gates --base origin/main`（含 64 份 API 快照 2,506 声明）及下降快查、页面资源检查通过。README 必跑、公开入口、Goal 生命周期/规划/CLI-MCP、成果与过程项消费、动作合同快照共 36 文件 295 条全部通过，无失败/跳过；日志 `/tmp/molis-goals-artifacts-{build,regression,health,health-check,boundary,assets}.log`，精确文件清单 `/tmp/molis-goals-artifacts-files.json`。Module Repository/Store 公开项由首片后的 16 降到 9（相对 main 为 21→9），快查仅下降这七项；页面资源仍 25 项、7,475,661 B，本片增量 0。构建声明不再公开上述五个 repository 成员或导出两个类，内部服务构造的参数类型保留。未改变页面行为，不重复界面全套；整线及共享核心 CI 全量未记完成。

W5-08 Module 存储出口第一片（2026-10-17，Codex，本地定向通过，待队列与 CI）：按路线图先收 Projects 与 Governance 两个 Module。当前 `repository` 是公开成员，包入口还导出 `ProjectsRepository`、`GovernanceRepository`、`GovernanceRecordStore`；生产调用已经使用 `query` / `commands` / `lifecycle` / `records` / `decisions`，只有两个测试直接构造 Governance Store。这些出口允许调用方绕过 Module 的业务入口，且不再承担装配需求。目标为功能可用：把 Repository 保留为构造期局部实例供既有服务闭包使用，移除三个类的包导出；两个测试改用 `GovernanceCollaborationModule.records`，不增加 testing 子路径或内部导入。

范围仅两包入口/README、两个既有测试调用方、对应公开入口回归与下降快查。本片不改表、结构版本、事务、事件、身份、业务服务签名或 Host 装配；余下 Module 和 Host 大入口继续按 W5-08 后续片处理，不将本片记为全部收口。以实际 main `a56a2763d` 为基点，本地独立候选，最多两片在途限制照旧。

验收：`W5-08-MOD-01` 两个包不再导出上述存储实现，Module 实例没有公开 repository；`W5-08-MOD-02` 既有项目查询/修改/删除回执及结构提案/可信决定、Goal 事件/规划用例仍经公开服务完成，拒绝路径与持久化结果保持。先整体构建，再跑两包 README 必跑、真实 Host 项目删除与 Goals 事件/规划定向批次；验证 boundary、merge-base health、API/动作快照与资源，现有结构门禁的 Module Repository/Store 数量应由 21 降到 16，不放宽规则。共享核心完整回归按统筹 CI 安排，不运行本机全量。

本片验证：整体与 workspace 构建、boundary、merge-base health/下降快查、contracts/SDK API 及动作合同快照通过。公开入口断言与业务回归 23 文件 186 条，加动作合同 1 文件 25 条，共 24 文件 211 条全部通过，零失败/跳过。日志 `/tmp/molis-module-boundaries-{regression,actions,health,boundary,assets}.log`。两个包的构建声明也已不含上述三个类或公开 repository；结构计数 21→16，页面资源仍为 25 项、7,475,661 B，本片增量 0。快查另同步 main 已有 Coding 样式行数下降（828→812），未改该源码或门禁规则。没有 UI 行为改动，不重复浏览器；共享核心全量仍由统筹 CI 安排。

W5-10 Pages 预览层（PPV，2026-10-18，Codex，本地定向通过，待队列整合）：目标为行为保持的结构拆分。当前 PGT head `90d279993` 的编辑器入口 804 行、mount 537 行，链接与评论预览的创建、绘制、按钮、blur、跟随和释放仍嵌在 mount。将这些同职责代码交给唯一内部 `createEditorPreviews(options)` 闭包：只持有原七个 DOM 引用，返回两根节点及 update/blur/bind/follow/remove；入口保留全部原时点，pop/AI/token/请求状态仍归入口，不存另一份 view、不加 Controller/Plugin、getter、缓存或新的代次。按钮创建、坐标放置及一次同步绘制中的空 TextSelection 判断按相同效果去重，翻译与 onScreen 仍按原时点动态读取 options。

不改变公开编辑器 API、DOM 类名、文字、120ms blur、选择/编辑/打开链接、重定位和销毁语义；setDoc 不额外重画。release 先解除 scroll/resize，再由原入口 hidePop（允许原重入 dispatch）与移除 pop，最后移除预览；迟到 blur 仍只引用旧实例 DOM。允许修改 editor-browser、新 editor-previews、既有源码定位断言、一个真实浏览器回归及必要 README。主会话维护本 spec、HUGE 记录与派生表。实现先在原正式 PGT 构建上跑新用例基线，再应用候选，整体 build 后复跑同一用例与既有相关动线。

`W5-10-PPV-01`：真实公开 mount + DOM 验两组 link/comment 及重叠标记、空/非空选择、当前目标按钮、window.open 参数、编辑与取消，以及 setDoc 保持原刷新时点。`W5-10-PPV-02`：真实焦点/blur、scroll/resize、onScreen、release 重入、销毁后重挂及旧 timer/订阅验证：旧实例不影响新实例，按钮和表单仍可用。复用 content-editing-regressions、pages-tools、context-toolbar-panes、contextual-interaction 的现有覆盖，不再造第二套 AI 延迟矩阵；同时按 Pages README 跑相关非浏览器回归，boundary/API、merge-base health、正式资源与图结构核验。

外部配对预演的原 raw 731,794 B 与正式产物逐字节相同；当前闭包候选 served 为 706,928 B，对 PGT 706,825 B 增加 103 B。纯提取/自由函数/职责内去重已比较；不改压缩器、短名或跨职责补偿。正式整体构建复得相同 706,928 B，新增 Chrome 在原 PGT 基线和候选上各 2/2 通过；Pages 插件 127 条、README 必跑 14 文件以及六个相关 Chrome 文件 39 条全部通过。boundary/API 与 merge-base health 通过，文件 804→719 行、mount 537→451 行，新闭包 89 行。用户已于 2026-10-18 批准本片实测 +103 B；精确许可仅 706,825→706,928，其余资源与后续增长继续冻结。最终整体构建、merge-base health/API、资源门禁与前一提交 HEAD 的精确预算检查通过；预算正反回归 73/73 通过，25 项资源总计 7,476,234 B。授权已覆盖本片必要的单次精确资源例外；不占 Todo/灵光额度。本片仅为 Pages 结构拆分的一段本地候选，主体 mount 与整线工作继续；未推送、未开第三个 PR。

W4-06 / #498 合并验收补充（2026-10-14，本地验证通过）：本次只拆分 Agent Host 内部组合，公开合同与启动副作用顺序保持原样。`W4-06-01`：携带确认计划的协调者请求若因子目录重叠而被拒绝，不能先建立计划图或启动模型；关闭并重开同一隔离运行时后仍无该计划图。已恢复原先的「文本材料 → 子任务校验 → 计划与项目材料」顺序。组合版本 `b532b87ad`（含 #489 最终候选 `308dd02d`）整体构建、边界、merge-base 健康与 29 项资源预算检查通过；包要求、全部 `agent-*` / `prologue-*` 及相关调用方共 95 文件、1333 条通过，2 条按条件跳过（真实 MiniMax 凭据、公网 npm 安装），无失败。`tests/prologue-node-start-order.test.ts` 经真实 Host / 已打包 SDK 正反验证：修复版通过；临时恢复旧顺序后，关闭重开运行时的计划图为空断言明确失败；随后已恢复源码并重建。远端检查与合并结果以 PR #498 为准；不升级 SDK、不改公开接口或门禁。

W4-03 第一片（2026-10-15，端口的默认来源由 Manifest 声明，#565；BL-087、D-04 的 A）：任务书要求「当时选择短期维持的项（例如 D-04 端口默认连线）重新判断是否到了该做的时候」，路线图把它排进 W4-03；新增一个端口插件只改自己的包和声明（§4.6），名单挡着这条，所以现在做。
- 合同：输入口加可选的 `default_source: { plugin_id, port }`（另一个插件的输出口），输入组加可选的 `default`（至多一个）。SDK 的 Manifest 检查拒绝指向自己、不像插件 id、端口名不合法、不是对象的默认来源，以及两个默认组、不是布尔值的 `default`（`packages/plugin-sdk/src/wiring-declarations.ts`；插件 id 的写法挪到 `plugin-id.ts`，与 Manifest 自己的 id 共用）。公开 API 快照多出这两个可选字段，现有 Manifest 不受影响。
- 宿主：`workspace-plugin-bindings.ts` 的 13 行名单删掉，换成 `plugin-default-bindings.ts` 的 `bindDeclaredDefaults`：按项目里运行中的插件读声明，只给什么也没读的口接，人选过的来源、固定成果版本、选过的组都不动；来源插件不在、没有那个口或类型不同就不接（原来名单靠类型恰好一致，第三方插件的声明可能不一致，不接比让项目启动失败对）。默认连线只在随 Host 发布的插件之间生效（统筹 10-16 复查要求，保持重构前的行为）：两端都要是 Host 启动名单标了 `bundled` 的定义（`platform.shipsWithHost`，与动作提供方用的是同一个判断，不是名单，也不读插件自己的声明），已安装或生成的插件写了 `default_source` 或默认组都当作没写；否则已安装的插件写一行 `default_source` 就能自动收到 Coding 的变更集或 Shelf 的材料，是这一片不该开的新数据通路。已安装的插件不能声明默认连线（用户 2026-10-16 定：暂只在随宿主发的插件之间；装插件时的同意流程有了再议）。13 行搬进 Coding（6）、Shelf（2）、Diff（4 加默认组「两份快照」）、Text Stats（1）各自的 Manifest。
- 测试：新增 `tests/plugin-default-bindings.test.ts`：`W4-03-01`（Coding 家族接出的默认连线与原名单逐行相同、Diff 默认组；名单外的插件按自己的声明接上、默认组生效）、`W4-03-02`（人选的来源与组不被覆盖；来源不在、口不存在、类型不同都不接）、`W4-03-04`（不随 Host 发布的插件拿不到 Coding 的变更集、默认组不生效，用内置插件的 id 也不行；内置插件不按默认读它的输出；先在旧构建上看它失败）；`tests/plugin-declaration-rules.test.ts` 加 8 条 `W4-03-03`。变异检查：去掉类型比对、去掉「已有来源就跳过」、去掉默认组，各有一条失败。`tests/workspace-plugin-graph.test.ts` 改从包入口取 `bindDeclaredDefaults`（新的具名导出），少一处包内部引用。
- 文档：`docs/system/EXTENSION-POINTS.md`（Text Stats 包外点名从 12 个文件降到 11 个，按第 1 节的复核命令重数）、`apps/local-host/README.md`、`skills/molis-plugin-dev/elements.md`、`examples.md`、`host.md`。
- 剩下的两项（Diff 与 Text Stats 自己渲染视图、伙伴舞台由 Manifest 视图生成而不是 `coding-surface.ts` 的名单）要改 `coding-surface.ts`，在途的 H4（#554）也改它，排在它合入之后做第二片。

W4-02（2026-10-15，Runtime 与已安装插件的 Manifest `methods` 生效，#562；决定 #18「和内置插件一样注册：启动时注册，停用、卸载、升级时收回」）：
- 原来只有目录条目的 `methods` 在 Host 启动时登记（`builtinRegistrations`）；没有目录条目的插件在 Manifest 里声明方法能通过检查，却没有任何代码登记，别的 Agent 看不到。
- 合同：`PluginDefinition.methods`（可选，`AgentSkillDefinition[]`）放方法正文，与 `agent_skills`（插件自己 Agent 的）分开。公开 API 快照 `tooling/gates/api/contracts/platform/plugin.txt` 只多这一个可选字段，现有插件不受影响。
- 登记：`apps/local-host/src/plugin-instructions.ts` 的 `registerPluginAgentDefinitions`（原 `registerPluginInstructions`）在同一处登记指令和方法，项目与 Home 两个执行器都经它；按安装计数，最后一个实例停下时收回；升级后的版本在别的项目还跑旧版时启动，按新版本重新登记。声明与正文的配对与目录同一个函数（`declaredMethods`）：只登记声明了且有同标识、同版本正文的，缺正文的记进开发者诊断。定义带着指令或方法正文、而目录已为该主人登记了任何定义时拒绝启动（与指令的规则相同）；只带 Manifest 声明、不带正文的定义什么也不登记（目录插件自己的定义就是这样，如 Home Runtime 上的 Issues）；沙箱执行的定义不登记方法，因为方法正文会进别的 Agent 的轮次。
- 测试只经包的公开入口（`homeAgentDefinitions` 新导出）：`tests/plugin-methods-runtime.test.ts` 的 `W4-02-01`（启动时登记、只登记声明且有正文的、诊断说明缺的、两个项目共用一份、最后一个停下收回）、`W4-02-02`（停用收回、启用恢复、升级换成新版本的、卸载收回）、`W4-02-03`（别的项目还跑旧版时升级，换成新版本，最后一个停下收回）、`W4-02-04`（目录已登记的主人带正文被拒、目录的方法仍在；目录插件自己的定义不带正文照常启动；沙箱定义能跑但不登记）。第一版按 Manifest 的声明触发，Issues 在 Home Runtime 上被当成第二来源拒绝启动（`issue-home-runtime`、`issue-assistant`、`home-plugin-platform`、`builtin-plugin-assembly-gate` 失败），改为按定义带的正文触发并补了这条。变异检查：去掉「版本变了就重新登记」，`W4-02-03` 失败；去掉沙箱判断，`W4-02-04` 失败。
- 文档：`docs/platform/PLUGIN-DEVELOPMENT.md`「给其他 Agent 的方法」、`docs/system/EXTENSION-POINTS.md` §3.4 的那一行（原「不会被登记」）、`docs/platform/PROLOGUE-AI.md`。

W4-04 第一片（2026-10-15，插件读自己成果线的最新版本，#545 已合入 main）：
- 范围：Form 迁到 Runtime 前要先补的平台服务（RUNTIME-MIGRATION「迁移要用到时先补服务，不在迁移 PR 里补」）。Form、Dataset、PPT、Pages 固定成果时，要知道这条成果线在项目里的最新版本，才能给下一版编号；现在这一步由宿主的 `artifactLineHead` 端口给。
- 新增 `services.artifacts.head(artifact_id)`：返回 `{ version, source_revision }`，项目里还没有就是 `null`。只读得到这个插件自己开的成果线，要有 `artifact:read`。
- 宿主的 `artifactLineHead` 改用合同里的同一个推导 `artifactLineHeadOf`，不再另写一份。
- `W4-04-01` 在 `tests/plugin-host-services.test.ts`。变异检查：去掉「成果线必须是自己的」，`W4-04-01` 失败。
- `tests/plugin-artifact-client.test.ts` 原来按「唯一的查询动作」找 SDK 的读取动作，现在有两个查询动作，改成按动作 id 找 `.read`，断言不变。
- 动作快照：每个安装多一条 `sdk.artifacts.<安装>.head@1`。

W4-04 第二片（2026-10-15，插件读回自己固定的版本，#547）：Form 迁到 Runtime 还缺的两处平台能力，按同一规则先补。
- 新增 `services.artifacts.readOwn(reference)`：读这个插件自己固定的一个版本，不看它 `consumes` 里有没有这种类型，也不管是否已归档；别的生产者固定的版本拒绝（`artifacts.plugin_denied`）。原因：宿主今天替 Form 读回自己的成果（`readFormArtifactVersion`）时不看归档状态，问卷固定前要读回已写的最新版本、恢复中断的固定也要读回那一版；`read` 只答插件消费且仍可用的版本，迁过去用 `read` 会让「归档了上一版再固定」从成功变成失败。`read` 本身不变，所以 Coding 读自己报告时归档即拒的行为不变。
- 放置（`bindObjectMoveHandler`、`bindHomeObjectMoveHandler`、`bindObjectCopyHandler`）与工作流内容（`WorkflowContentHandlers`）的处理函数收到的调用方，类型从 `ActionCallContext` 改成执行时真实传入的 `ActionExecutionContext`。Runtime 插件的写入要先等 `beforeEffect()`（插件库的事务要它），这几处原来拿不到。只是把类型写成实际传的值：已有的实现收到的对象不变，照样编译。
- `W4-04-02` 在 `tests/plugin-host-services.test.ts`。变异检查：去掉「必须是自己固定的」，`W4-04-02` 失败。
- 动作快照：每个安装多一条 `sdk.artifacts.<安装>.own@1`。`createPluginArtifactClient` 加上这一条后到了 153 行，超过函数行数上限，把 SDK 动作的定义拆到同文件的 `sdkArtifactActions`。

W4-04 第三片（2026-10-15，Form 经 Plugin Runtime 装配，#551）：按 `docs/system/RUNTIME-MIGRATION.md` 5.1 删 Host 的 Form 适配，Form 成为每个项目一个的 Runtime 插件。
- 删：`apps/local-host/src/form-actions.ts`、`form-native-plugin-http.ts`，`index.ts` 的 `handleFormNativePluginHttp`，`project-host.ts` 的 `formActionProvider` 一行，`web-request.ts`、`web-catalog.ts` 的 Form 段，`creative-artifacts.ts` 的三个 Form 端口；包里的 `routes.ts`、`route-handlers.ts`。`tests/builtin-plugin-assembly-gate.test.ts` 的冻结名单把 Form 从 `BUILD_TIME_ASSEMBLED`、`NATIVE_PLUGIN_HTTP_FILES` 移到 `RUNTIME_ASSEMBLED`；`tooling/gates/error-owners.json` 删掉只剩已删文件的 `form` 条目。
- 加：`plugins/native/form/src/plugin.ts` 的 `createFormPlugin`；`project-plugins.ts` 的监督器条目（`bundled: true`，`database: FORM_DATABASE`，即 W4-11 登记的 `form` 库，位置与结构不变）。问卷库的读写改走 `services.database`：`FormStore` 只认 `get`/`all`/`run` 三个调用，写入在 `database.transaction(() => caller.beforeEffect(), …)` 里，`ownFormStores` 给不经 Runtime 的测试与夹具同样的读写形状。成果走 `services.artifacts`：`publish`、自己的线头 `head`（第一片）、读回自己固定的版本 `readOwn`（第二片），别的生产者的线仍答 `form.publication_conflict`（原来宿主就这样答）。
- 路由：Manifest 声明 15 条（项目下的 `/api/plugins/io.molis.work.form/forms…`，`route_id` 沿用原来的），每条只把请求转成同名动作；页面送来的 `project_id` 必须是本项目，否则 `actions.scope_mismatch`，什么也不写。项目分发要求插件 id 后面有路径，所以根是 `/forms`。客户端改用 `host.route(…)`（带项目前缀）；`native-plugin-api.ts` 的短名改写保留到 W6-01，Form 已用不到。
- 舞台页仍走目录的渲染路径（与 Shelf 相同，5.1「舞台页怎么渲染」：过渡期沿用，通用挂载器是 W5-06）；客户端改 TypeScript 与 esbuild 打包是下一片。「项目已删」步骤仍由目录条目上的 `project_data` 送达：它只调用包里的 `purgeFormProject`、按 Home 文件清除、不要求实例在运行，满足 5.1 列的 (a)–(e)。
- Manifest 加 `artifact:read`（必需）：固定下一版、恢复没存完的固定要读回自己的问卷，`readOwn` 要这个权限。少了它第二次固定会失败（原因被 `publication_conflict` 盖住，测试里第二次固定抓到了）。
- 迁移中发现、按原行为补上的两处平台缺口：
  - **谁固定的。** Runtime 的成果客户端把每个版本的 `created_by` 记成安装者，原来 Form 记的是调用方（Agent、流程、MCP 客户端、人）。现在宿主从 Runtime 的动作范围（`currentPluginAction`，插件说不了自己是谁）取调用方：在本安装的动作里固定的版本记调用方，动作之外仍记安装者。Characters 的发布也在动作里，所以它今后同样记调用方，与 `RecordFixedVersionInput.actor_id` 的合同说明一致。`tests/document-pin-after-move.test.ts` 与 `tests/form-actions.test.ts` 迁移前就断言这一点，迁移后、补上前两处失败。
  - **请求体上限。** Runtime 的项目路由读 256 000 字节，原来 Form 的边界读 1 000 000（答卷文件每份可到 400 000 字）。路由声明加 `max_body_bytes`（至多 12 MiB，SDK 的 Manifest 检查拒绝越界），Form 的 POST 路由都声明 1 000 000。变异检查：把 Form 的上限改回 256 000，新加的 Runtime 边界用例失败。
- 测试：
  - 新增 `tests/form-runtime-routes.test.ts`：`W4-04-03` 经项目的 Runtime 路由走一遍建题、收集、结果、CSV、填写页、两次固定、列表，旧的 `/api/form` 404；`W4-04-04` 别的项目的 `project_id` 被拒、什么也没写，停止收集后经页面导入答卷仍收（原来在 `form-actions.test.ts` 的路由里，搬到这里）。
  - `tests/form-mcp.test.ts` 原来给每个 MCP 客户端起一个自己的 Host 进程；Form 在 Runtime 上之后，一个进程关掉会把共用库里的安装记成「已停」，另一个进程就答 `actions.plugin_unavailable`，这正是「一个 Home 只有一个执行进程」要防的。改成一个常驻 Host，各个工具经网关调它（与 `tests/images-concurrency.test.ts` 相同），「跨进程」改成工具进程和 Host 重启；授权按人在访问设置里给的，断言都在。删掉 `tests/fixtures/form-mcp-server.ts`。
  - `tests/document-plugins-error-model.test.ts`：Form 的码到状态改问 SDK 的 `actionErrorResponse`（Form 每条路由是 `bindPluginActionRoute`，失败都由它回答）；真实路由的 404、409 与请求体上限改走测试 Home 的 Runtime 边界；没有发布方时的 409 `form.unavailable` 改直接调动作（Runtime 总给 Form 成果服务）。`tests/plugin-declaration-rules.test.ts` 加三条 `max_body_bytes` 规则。
  - 其余改了调用方式的：`creative-artifact-promote`、`creative-tools-plugins` 里 Form 的部分改经动作；`tests/personal-plugins-review-fixes.test.ts` 断言 Form 客户端请求 Runtime 路由；夹具与五个用例里的 `withStore` 换成 `ownFormStores`。
- 证据：相关 38 个文件全过（含 `tests/action-contract-snapshot.test.ts`），Runtime 路由、成果客户端、Characters 与 Coding 的发布 8 个文件全过，浏览器 `form-actions.e2e`、`work-placement-plugins.e2e`、`content-portable-regressions.e2e` 全过；health（`--base origin/main`）、boundary、page-assets 通过（`form.js` 小了 288 字节，预算同步降下）。公开 API：`PluginRouteDeclaration.max_body_bytes`（可选，旧 Manifest 不受影响）。动作快照：Form 的安装多 5 条 `sdk.artifacts.<安装>.*`。

W4-04 第四片（2026-10-15，Form 客户端改成打包的 TypeScript，PR #558）：路线图 W4-04 的「bundle its client as type-checked TS (esbuild IIFE) … and a *_SCRIPT template-constant metric is added」。
- 客户端：原来 900 行的模板字符串 `FORM_CLIENT_FACTORY_SCRIPT` 和 `src/draft-client.ts` 的 `FORM_DRAFT_CLIENT_SCRIPT` 改成 `plugins/native/form/src/browser/` 下 14 个 TypeScript 文件，`tsconfig.browser.json` 做类型检查（`typecheck` 与 `build` 都跑），esbuild 从 `factory.ts` 打成 `dist/form-client.js`，banner/footer 直接包成 `(host) => {…}` 工厂；`src/client.ts` 只读这个包。页面状态集中在 `FormPage`（`page.ts`），原来 200 行的点击处理拆成 `commands.ts` 里按原顺序匹配的 21 条命令，每个函数都在函数行数上限以下（巨大单元门禁把类型源码当代码数，第一次拆前是 924 行的文件、904 行的函数）。行为按原样：匹配顺序、哪些命令要打开的问卷、离开前先存再问、失败的 note 范围都与原来相同。
- 大小：`--minify`（与 `--minify-whitespace` 比，名字也压短）后宿主发的 `form.js` 从 37 472 字节降到 30 300，`tooling/gates/page-assets.json` 同步降低。
- 门禁：`scripts/gates/source-counts.mjs` 加 `scriptConstants`：名字以 `_SCRIPT` 结尾、值是字符串或模板字符串的变量按文件计数，只许减少，新文件从 0 开始（普查 130 个、100 个文件，这一片后 129）。`rawFetchInScripts` 认得打包生成的程序：常量读 `dist/<名>.js`、所在包 build 里有 `esbuild <入口> … --outfile=dist/<名>.js` 时，入口和它 import 的文件按类型源码数，对不上构建步骤的读取直接失败（`scripts/gates/browser-programs.mjs` 的 `bundleEntry`）。口径写在 `tooling/gates/README.md`。
- 测试：`tests/health-gates-source-counts.test.ts` 加定义、两条违规与一条减少用例；`tests/health-gates-browser-fetch.test.ts` 加打包源码里的裸 fetch 被数、读不存在的构建产物失败两条（基线里预先放一个 `clean.ts`，原来那条「不算的写法」用例改为编辑已有程序，否则它会被新计数当成新增）；变异：在 Form 的打包源码里加一个裸 fetch，`rawFetchInScripts` 记 1。`tests/creative-tools-plugins.test.ts` 与 `tests/personal-plugins-review-fixes.test.ts` 里按名字查代码形状的 Form 断言改读 `src/browser/` 的源码（同样的性质：结果请求只认最新且仍打开的问卷、换问卷先清保存计时器、保存不重画编辑器、列表行的状态格、请求走 Runtime 路由），字面量断言仍查打包结果；`tests/document-plugins-error-model.test.ts` 的浏览器入口除 `tsconfig.editor.json` 外也读 `tsconfig.browser.json`（服务端能到达的文件仍按服务端查）。
- 证据：门禁 `--base origin/main`、`boundary:check`、`page-assets`（`--update` 后）通过；相关 18 个非浏览器文件全过；浏览器 `form-actions.e2e`、`work-placement-plugins.e2e`、`content-portable-regressions.e2e`、`model-ready-surfaces.e2e` 共 19 条全过。全量由统筹在 CI 跑。
- 变基到 #551 合入后的 main（`19823a62`）后重跑：门禁 `--base origin/main`、`boundary:check`、`page-assets`、页面事件通过；Form 与门禁相关的 11 个非浏览器文件、7 个浏览器文件（另加 `goal-form-viewport`、`policy-form-binding`、`remaining-forms-viewport`）全过。Runtime 停 Form 时库先关（`home-plugin-executor.ts`、`plugin-host-services.ts` 的 `dispose`），#551 第 7 片那次原生崩溃统筹重跑已过，判为跑机环境。

Form 发布授权补漏（2026-10-19，§10.29 统筹追加的 P1，③；分支 `fix/form-promote-authority`）：
- 问题：Form 的「存成成果」与修复前的 Dataset 逐行同构（`plugins/native/form/src/promote.ts`、`actions.ts` 的 `promote`）。`begin` 提交后到 `artifacts.publish` 之间不再问原调用方，被取消、撤权的调用仍会多写一份成果（S-18）。
- 修法：照 Dataset（`W5-01-DATASET-06`）与 PPT（`W5-01-PPT-07`）：
  - 两个业务写入在事务里、第一条 SQL 之前，同步检查原调用方的 `signal` 与 `assert_authority_current`；
  - 发布前 `beforePublish` 先等原调用方的 `beforeEffect` 再查；
  - 真正调用发布的包装里紧前再查一次。
- 验收 `W5-01-FORM-01`（`tests/form-promote-authority.test.ts`）：真实 `createFormPlugin` 与 SQLite，五个交错点（入口到 begin、begin 到发布、异步检查通过后到真实发布、成果写出后到完成、完成记录的 `beforeEffect` 通过后到它的 SQL），每个点分别取消、撤权、提供方被替换（`actions.provider_changed`），只留已经合法提交的阶段；另有正常对照。
- 同一片：`W5-01-PPT-07`、`W5-01-DATASET-06` 补上第五个交错点与提供方被替换；三份用例登记进 `docs/system/SECURITY-INVARIANTS.md` S-18 的 CI 列，并加进 `test:security`。
- Pages 不用改：`promotePagesDocument` 从 begin 经发布到完成都是同步的，中间没有 `await`，取消或撤权插不进这三步之间。

平台自查（2026-10-19，§10.29 的 P2，②；分支 `fix/platform-original-caller`）：上面 PPT、Dataset、Form 三段「修法」里插件手写的同步检查和发布包装都已删掉。
- 插件经平台服务写入时，由服务自己在写入的同一回合查 Runtime 动作作用域里的原调用方（`packages/plugin-runtime/src/action-scope.ts` 的 `assertPluginActionCurrent`）：库事务在插件交来的等待前后、每条语句前和 `COMMIT` 前各查一次；成果 `publish` 与过程项 `record` 在登记版本之前查。插件只留各阶段的等待：`stores.write(caller, …)`，以及发布前的 `beforePublish: () => caller.beforeEffect()`。
- `W5-01-PPT-07`、`W5-01-DATASET-06`、`W5-01-FORM-01` 三份用例改在真实的 `createPluginPlatform` 上跑（真库、真成果模块、Kernel 的调用）：五个交错点，每个点分别取消、撤权、提供方被替换。把平台的检查短路，三份都失败。
- Characters 的发布在 `await beforeWrite()` 之后不再检查，由 `tests/security-invariants-plugin-original-caller.test.ts` 的 S-18 用例覆盖。
- 补齐（2026-10-19，#776 评审 P2 的后续，②；分支 `fix/original-caller-events-outputs`）：事件 `publish` 和输出端口的 `select`、`invalidate`、`retain` 也在写之前查。`assertPluginActionCurrent` 现在要服务说出它为哪个安装写，作用域属于别的安装就拒绝（`actions.forbidden`）。S-18 用例对每个写入点各测取消、撤权、提供方被替换和别的安装四种情况；把检查短路，对应的用例都失败。Host 把 Git 的结算通知交给 Git 时先退出所有动作（`apps/local-host/src/project-plugins.ts`）：结算可能发生在别的安装的动作里，Git 发的通知只归它自己的安装。Coding 的跟随与唤醒循环已由 #776 的 `f739c46af` 移到激活自己的上下文，不再因动作返回而被拒。

- 评审补修（2026-10-20，#797；用户要求尽可能修复评审问题）：Files 只有在 `last-workspace` 保存或删除与四个输出失效都成功后才更新内存中的目录；一次写入被拒后，下一次调用仍重试未完成的切换。验收 `S18-FILES-RETRY`：真实 Files 动作分别在保存、删除与输出失效时被拒，检查已持久化状态及后续重试结果，不跳过剩余输出失效；正常完成后不重复失效。`tests/files-plugin.test.ts` 证明该行为。Git 的真实结算通知 `tests/workspace-production-events.test.ts` 加入 CI 产品子集，沿用 S-18 的跨安装通知验收。构建后跑 Files 包必跑用例、原调用者与通知回归、boundary 与 merge-base health；全量由统筹 CI 安排。输出端口的 `invalidate`/`retain` 在动作之外同样检查当前激活：沿用 Host 已有 `assertActive`，停止与重启后旧 client 均拒绝，当前激活可用，不增加权限要求；由 `tests/security-invariants-plugin-original-caller.test.ts` 的 S-18 停止输出客户端回归证明。同片把 typed `services.capabilities.invoke` 及嵌套动作的原调用者捕获扩展到场景，#812 仅补 Host 签发身份的边界。
- 同片补齐 Runtime 场景回调：Kernel 为 `bind`、`consume`、`failed` 提供真实 `ActionSceneExecutionContext`（原上下文加 `beforeEffect`）；每次等待后重查原授权、场景与判断注册、权限和取消，回调返回或抛错后拒绝迟到写入。`bindings`、`targets`、`prepare`、两种 availability 是只读回调，保留合法查询及原授权目录中的判断/写动作元数据，但拒直接及嵌套写入。`read_only_effects` 只限制执行；现有 `query_only` 的目录过滤不变，实际派发按已注册定义拒绝写动作与付费查询。Runtime 用同一作用域区分真实动作与场景声明，不伪造 ActionDefinition；动作和场景内部保留原控制，给 handler 的副本隔离权限/引用数组与 signal，嵌套约束取可信 `scope.read_only`，插件改写收到的上下文不能扩权；模型、后台与动作专属查询委托仍只认真实动作。配置权限、启用附加权限和 owner 原子 revision 检查不变。验收 `S18-SCENE-READ`、`S18-SCENE-WRITE`、`S18-SCENE-END`：真实 Runtime 插件经公共 Kernel 场景入口，分别证明只读拒写且可读，bind/consume/failed 等待后取消或撤权或提供方重注册零写且正常写通过，返回与抛错后迟到写拒绝。`S18-SCENE-NESTED` 在 #797 捕获共同作用域，证明嵌套查询成功、写入与付费路径按当前只读约束拒绝，下游等待后仍受原场景控制。公共合同同步 API 快照及插件手册，Kernel/Runtime 相关检查与新批次集成全量验证新增行为。

W5-02 PR-1 评审补修（2026-10-20，#826；原任务合同为已接受的 PR 正文）：保留 Coding 装配归包、`clientUses` 与伙伴包的现行装配关系。本片的 `W5-02-REG-09`：通用 Host 的 `addWorkspace` 只接受本人已经选择并确认的目录，接口与 Host 接线都写明这个调用前提；其失败兜底通过同一 `api` 在使用时翻译，英语页面得到英语，未传兜底的请求保留原有文案。真实浏览器回归 `tests/workbench-deferred-clients.e2e.test.ts` 从已挂载客户端的 Host 发出请求，控制失败响应，检查路径、确认字段与中英翻译；既有装配和资源测试保留。修正 PG-091 的伙伴装配实际路径。`host.reviews` 仍只随 `clientUses` 的工厂注入；要给无 `clientUses` 的插件同一服务，单份评审工厂须移入共同 Host 资源，压后约 8,278 字节，超过本片已批准的 +116 字节，因此交 W5-04 一起处理按需加载、侧栏文档和 Home 插件页的共同 `host.request`/`host.reviews`。本片不复制工厂、不加新资源；构建后以最新 main 预算核对，上限仍为 +116，实际下降则同步缩小放行。验证整体构建、装配与未声明变量、浏览器路径、翻译、资源预算及健康门禁；全量由统筹 CI 安排。

W5-02 PR-1a 评审补修（2026-10-20，#840；原任务合同为已接受的 PR 正文）：生成的目录保留最新 main 的各插件登记值与 Runtime 装配。`W5-02-REG-02` 增补实际加载回归：在隔离子进程里经公开 workbench 入口加载真实构建模块，只在加载器边界将目录改成重复项目键或悬空伙伴，必须由 `plugin-catalog` 的模块初始化检查拒绝；未改目录正常加载。不改生产行为与门禁阈值，不以单独调用 `catalogProblems()` 替代模块加载证据。合并时按各包登记重新生成目录；整体构建后逐字段比对合并前后的目录，验证生成器、装配、Pages Runtime、翻译、边界与资源预算，全量由统筹 CI 安排。

W4-03 第二片（2026-10-16，伴随面借 Coding 的客户端，PR 待开；统筹 10-16 定范围：只去重，Manifest 视图另成一片）：
- 去重：Files、Git、Diff、Text Stats 四个目录条目原来各把 Coding 的 `CODING_WORKBENCH_SETUP_SCRIPT` 登记成自己的 `clientFactory`，宿主于是发五份逐字相同的 434 KB 客户端。现在四个条目写 `clientFrom: CODING_PROJECT_PLUGIN_ID`；`apps/workbench/src/plugin-workbench.ts` 的 `pluginSurfaceClients()` 给每个有客户端的面指出那一份包，按需加载（`deferred-plugin-client.ts`）、主区的延迟面（`goals-page-renderer.ts`）和侧栏文档（`side-view-document.ts`）都读它。按需加载取 `coding.js` 一次，用同一个工厂挂各自的根：工厂和根与原来一样，画面不变。
- 大小：宿主不再发 `files.js`、`git.js`、`diff.js`、`text-stats.js`（共 1,736,113 字节）；加载器多带四个包名，同片把它里面重复三次的失败文字和两处收尾合成一处，`molis-work-workbench.js` 净降 8 字节。`tooling/gates/page-assets.json` 删掉四条、降一条。
- 门禁：`scripts/gates/page-assets.mjs` 的一次性放行（W3-B1 #553、回执 1d #564）都已用完，按原注释「下一次改这个门禁时删掉」整段删去（与 #541 相同）；`tests/page-assets-budget.test.ts` 的两条放行用例改成「用完的放行在旧大小上也不再有效」，与 #541 的两条并成一组。
- 测试：`W4-03-05`：`tests/builtin-plugin-composition.test.ts`（四个伴随面的包都是 Coding、工厂是同一份，宿主不发它们自己的包；别的客户端都是自己的包）；`tests/workbench-deferred-clients.e2e.test.ts`（逐个打开有客户端的面：伴随面不下载自己的包，Coding 的包整页只下载一次）。

W4-05（2026-10-15，助理服务拆分样板，PR #559；决定 #3）：
- 抽出：提醒与跟进协作者 `AssistantFollowUps`（`apps/local-host/src/assistant/assistant-followups.ts`）：Plugin 的到期提醒（`sweepReminders`）、工作上的定时轮次（保存、取消、到点运行、归档时停用、宿主启动时重新排队）、关注规则（`saveRule`、`removeRule`）。它只经 `AssistantFollowUpPorts` 依赖宿主（工作、通知、设置、规则、Home 动作、Agent Host、发送、队列），不 import 助理其他模块的实现（只用共同的错误表 `assistant-errors.ts`），带走自己的表：`assistant_followups` 的读写从 `AssistantStore` 搬到 `AssistantFollowUpRecords`（`store.followUps`）。服务上的 `followUps` 现在是这个协作者，HTTP、动作（`assistant-rule-actions.ts`）、`web-server.ts` 的定时任务改为经它调用。
- 不变的：行为与文字一字不改（逐段搬，旧的 `runDueFollowUp`、`enqueueCurrentFollowUp` 并进类里）；到期提醒对 Home 动作的每一步仍有 20 秒限时，由服务包在端口里（`withinTime`）。没有动 `assistant-inputs.ts`，没有动发送与回执的路径；没有往 contracts 加 typed 能力。
- 大小：`AssistantService` 1,796 行 / 110 方法 → 1,663 / 99，文件 2,222 → 2,081 行；`AssistantStore` 280 行 / 42 方法 → 267 / 39。两者仍超限，其余协作者归 W5-10。新文件 311 行、类 16 个方法，在阈值以下。
- 测试：`tests/assistant-followups-collaborator.test.ts` 只拿协作者和测试自己的队列、时钟跑，不起服务与 Agent Host：`W4-05-01`（每天的定时排进队列、到点只跑一次并排下一天；取消与归档）、`W4-05-02`（到期提醒各告诉一次，没答的 Plugin 下次同一段时间再问；规则严格检查）、`W4-05-03`（只 import 自己的端口与共同错误表）。变异检查：让提醒扫描不论有没有 Plugin 没答都记下进度，`W4-05-02` 失败。原有的助理用例（定时、定时删除、提醒、关注规则、记忆、材料、项目删除、委派交回）只把调用改成经 `followUps`，断言不变。

W4-09（2026-10-15，两个 PR 开着）：#539 把 Web 服务的五个周期任务登记在一处（`apps/local-host/src/periodic-tasks.ts`），「设置 › 诊断」列出「后台任务」；`W4-09-01`、`W4-09-02`（反复启停不留计时器）在 `tests/host-periodic-tasks.test.ts`。#540 让成果游标改为进程内通知加 30 秒兜底（`W4-09-03`，`tests/plugin-platform-composition.test.ts`），炼金术士工作室空闲 10 分钟且手上没事就关（`W4-09-04`，`tests/alchemist-studio-idle.test.ts`）。三处都做了变异检查。

W4-10（2026-10-15，空闲轮询合并，PR 待开；用户 10-15 拍板「一个接口、每 15 秒」）：
- 一个读：宿主加 `GET /api/attention`（`apps/local-host/src/attention-http.ts`），Home 页和项目页各一份，一次答出等着人的事：后台任务（Coding 会话）、助理对当前插件的提醒、插件投递待处理数，项目页另带 Board 的事件游标。每一部分仍由它的主人读（`homeBackgroundTasks`、`assistantNotices`、`pluginEventsPending`、`store.eventCursor`）；某一部分读失败就答 `null`，页面保留上次显示的，其余照答。原来的 `/api/background-tasks` 删掉。
- 一个订阅：工作台的 `attention.ts`（由 `background-tasks.ts` 改名而来）每 15 秒读一次，只在页面可见时读；回到标签页、切换插件、本地动作之后（`molis-work:attention-refresh`）立刻再读。读完发 `molis-work:attention`：助理的铃铛（`assistant-island.ts` 去掉 20 秒轮询和它自己的可见性、侧栏点击重读）从这一份画，插件通知数也由铃铛直接从这一份和插件市场的列表（`molis-work:plugin-events`，比它之前开始的读新）计，`plugin-notifications.ts` 去掉 30 秒轮询和转发事件 `molis-work:plugin-events-waiting`，只剩打开插件市场，不再发任何请求。后台任务从 10 秒变 15 秒。两个新事件登记在 `dom-events.ts`（新主人 `attention`），转发事件删去。`/assets/molis-work-workbench.js` 不变大（`page-assets` 门禁）。
- Board 游标：4 秒一次的游标检查只在 Goals 是当前面时跑；别的面靠 attention 带回的游标，变了才刷新 Board。放置的「这里用到的别处内容」只在首页进入视野、或放置变了（`invalidate`）时读，不再随每次重画读。
- 预算：`tests/idle-request-budget.e2e.test.ts`（`W4-10-02`）在示例项目的首页空闲一分钟，请求数不超过 6（attention 4 次、首页自己的 30 秒刷新 2 次），旧的三个接口不再单独轮询。改前实测同一分钟 25 次（`board/cursor` 15、`attention` 4、`placement/related` 4、`home/events` 2；再往前没有合并时约 36 次，BL-116）。`tests/attention-route.test.ts`（`W4-10-01`）钉住两个页面的回答；`tests/settings-requests-through-helper.test.ts` 改为断言插件通知数不发请求（比原来「经请求助手发」更严）。
- 改了的用例：`tests/workbench-hidden-refresh.e2e.test.ts` 原来在 Coding 窗格上看游标读取「隐藏就停、回来就读」，现在游标检查只在 Goals 面，改到 Goals 窗格上看同一件事，另加一条「Coding 窗格 4.5 秒内不读游标」；`tests/plugin-notification-bell.test.ts` 改为断言铃铛从 attention 和插件市场列表计数；`tests/dom-events-contract.test.ts` 里拿 `plugin-events-waiting` 当例子的几处换成同一主人的 `plugin-events-reveal`，断言不变。
- 证据：`affected-tests` 选出的 137 个非浏览器文件全过；29 个浏览器文件（选出的 24 个加 `goal-event-review`、助理提醒与插件投递相关的）全过，`workbench-hidden-refresh` 按上条改后通过。健康门禁、边界、页面事件、`page-assets`（`/assets/molis-work-workbench.js` 与 main 同为 1,097,494 字节以内）通过。动了合同里的页面事件表（`pnpm api:update` 刷新了 `contracts/platform/dom-events` 快照），插件不受影响：这几个事件只在工作台里收发。改动命中全量条件（共享核心与外壳装配），全量在 CI。

W4-11（2026-10-15，Home 存储统一登记，#542）：
- 登记：`apps/local-host/src/home-stores.ts` 的 `homeStores()` 列出 Home 里 43 项有数据的条目和它们的 owner，库另带基线。
- 声明：各 owner 在打开它的代码旁声明。插件的 `*_HOME_STORE` 经目录条目 `home_store` 带进；Issues 的经 `runtime.database` 带进；模块、存储层和宿主的各在自己的文件里。类型 `HomeStoreDeclaration` 放在 `contracts/platform/plugin`，形状与检查 `homeStoreRegistry` 放在 `packages/storage`；storage 不认识任何插件或模块。
- 读登记的：卸载清除（决定 #20：清除覆盖所有登记的库），不再手列；插件库的发放（`plugin-database-entries.ts`）；基线用例（`tests/home-store-baselines.test.ts` 按登记逐个检查，新库要带结构样本或写进无样本名单）。路线图里的「维护」在仓库里没有代码（真实 Home 的维护脚本在交接目录，不入库），所以没有接。
- 行为变化：原来的临时宿主名单（`HOST_LIBRARY_NAMES`）删掉，改为「库必须登记为这个插件自己的、基线相同」。所以个人插件的库不再对任意插件开放，只对登记的主人（及以同一 id 替换它的 Runtime 插件）开放；`alchemist/` 由宿主决定目录，登记给宿主，不再是可发给插件的库。测试夹具的库：名字没人登记的，按夹具自己的 id 登记；已登记给别人的（Issues 的 `issues`、宿主的 `plugin-runtime`、Dataset 的 `dataset`、存储层的 `feed`）不替它登记，启动名单检查按原因拒绝（`tests/home-plugin-platform.test.ts` 的用例相应改成这几种原因；原来「不在清除清单」那一条对夹具不再成立，未登记库的拒绝留在 `tests/plugin-project-database.test.ts`）。
- 删掉 `PERSONAL_HOME_SQLITE_STORES`；`docs/system/HOME-DATA.md` 第 9、11 节改成登记的说明。
- `W4-11-03`（夹具不能占用别人的库）在 `tests/plugin-project-database.test.ts`。变异检查：去掉主人检查，「声明错的启动名单」用例失败；再去掉夹具登记，`W4-11-03` 失败。

W4-07（2026-10-15，拆 Coding 的路由绑定，#549 已合入 main）：
- 范围：`plugins/native/coding/src/routes.ts`（门禁量出文件 1,440 行、`codingRouteBindings` 一个函数 1,262 行）是两个巨大单元。只搬代码、不改行为：激活共享的状态（忙碌集合、摘要缓存、文件索引、跟随者、目录读取队列、等待循环与重启后的恢复）进 `route-activation.ts`，开一轮与跟随进 `start-round.ts`，选择与 MCP 来源的读取进 `route-selections.ts`，会话标题进 `session-title.ts`；路由按资源分成七组（写入者、变更集、Goal、设置、会话、时间线、委派，各一个 `routes-*.ts`，每组都在 800 行以下、每个函数都在 150 行以下）；`routes.ts` 只剩组合（51 行），错误到状态码的对应（`failure`）留在原文件，交给激活用。
- 不变的：路由 id 与顺序和拆前一样（67 条，逐条比对过）；`codingSurface`、`stopCodingSurface`、`planContinuesAfterTalk`、`codingSessionTitleFrom`、`DEFAULT_SESSION_TITLE` 仍从 `routes.ts` 导出；动作合同快照没变。
- 证据：巨大单元 146 → 144；`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check` 通过；Coding README 必跑与 `affected-tests` 选出的 43 个非浏览器文件、2 个浏览器文件（`coding-client-lifecycle`、`companion-client-lifecycle`）全部通过。`docs/system/HUGE-CLASS-MIGRATION.md` 的 W4-07 行改为已做，两个单元从清单删去。

W4-12（2026-10-15，视觉比对工具，#550）：
- 拍：`tests/visual-surfaces.e2e.test.ts` 在隔离 Home 的示例项目里拍 8 个关键界面（项目首页、插件切换器、Goals 列表、Todo、Pages、助理面板、侧栏文件、设置·界面与语言），各按 1440、1024、390 三个宽度，浅色、深色各一张，共 48 张。页面时钟钉在 2026-10-15 14:00（上海时区，之后照常走，计时器不受影响），页面上显示的时间与光标隐去；每张要连拍两次一模一样才算定下来，一直在变的界面直接失败（它本身就没法比）。
- 比：`pnpm visual:compare`（`scripts/visual-compare.mjs`）在 HEAD 与 `--base`（默认 `origin/main`）的合并基点上各拍一遍：基点工作树在本机建一次、离线安装并构建（占构建槽位），留着下次用；两边都用本分支的拍摄用例，画面由各自的产品代码出。逐像素比（`scripts/visual/png.mjs`，只用 `node:zlib`，读不了的格式按名字拒绝），默认任何一个像素变了就算变了；报告在 `.impeccable/qa/review/visual/compare/`（`report.html` 三栏对照、`diff/` 红色标出变化），有变化退出 1。W5-05 删旧皮肤用它判定。
- 证据：`pnpm visual:compare` 对 main（合并基点 `65df2709`）完整跑一遍：基点树建好、两边各拍 48 张，0 张有变化。同一棵树拍三次，48 张两两一像素不差；把钉住的日期改到 10-20，首页、侧栏、助理三类 16 张被点出、差异落在周条与问候语上（变异检查）；`tests/visual-compare.test.ts` 4 条（PNG 读写与五种行过滤、拒绝 16 位、单像素与尺寸变化、`--compare` 的退出码与报告），去掉均值过滤的移位或让脚本恒退 0 都会失败。`docs/system/PARALLEL-DEVELOPMENT.md` §6「界面」一行写明何时跑。
- W5-05 第 0 片（删皮肤之前先把尺子补齐）：拍摄多了项目设置（常规）、Goal 的 Frame、Goal 的工作三处，共 11 处 66 张；每处在 1440 宽、浅深色两张图之后各取一份逐元素的计算样式（含 `::before`、`::after`，只存与父元素不同的值，无限动画停在 0 时刻再放回），比对按属性报出变化开始的那个元素和前后取值、只有一边有的元素（`scripts/visual/styles.mjs`），有任何样式差异与有图变化一样退出 1。图看不到的状态和不到一像素的变化由样式这一半抓。证据：同一棵树拍三次，样式 22 份两两为 0；图 66 张第一、二次一像素不差，第三次与前两次在 goal-work@1440-dark 差 4 个像素、每个 1 到 2 个色阶，落在时间线「◇」标记（y 为 759.984 的小数位置）的左边缘，样式为 0，判为 macOS 字形栅格的跨进程抖动，容差不放宽；在样式里注入一行 CSS 被点出；`tests/visual-compare.test.ts` 第 5 条（变化只在开始处报一次、继承与重述同值不算、`--compare` 只因样式就退出 1），把比对改成只比自身取值会失败。删皮肤时若撞上这 4 个像素，在 PR 里写明样式快照一致、像素差只在这里并贴对照图，每次由人判断；不写成脚本里「样式一致就放过像素」的自动规则（统筹 10-16）。
- W5-05 第 1 片（删 `quiet-paper`，108 条规则、341 条声明）：仍在决定计算值的只有四处，各并回主人样式表——`body` 的 `text-rendering` 进 `foundation.ts` 的 `body`、`.tui-mode-label` 下划线颜色进 `momentum.ts`、`.goal-more > summary` 与 `.tui-resizer` 线在悬停与键盘焦点时的颜色进 workbench `styles/base.ts`（`.tui-resizer.is-dragging` 拆开、拖动时仍是 `--blue`）；其余声明不是被后面的规则盖掉，就是打在没有标记的类上。三份样式表各少 11,120 B，`page-assets.json` 随之降。证据（每一项都在删之前和删之后两棵树上各量一遍再比）：`pnpm visual:compare` 66 张图、22 份计算样式全 0；另用一个临时探针（不入库）在两棵树上把 quiet-paper 每条选择器碰得到的每个元素、它设的每个属性的计算值记下来再比：11 个面、全部系统设置与项目设置分区、项目规则与规划（经 `molis-work:open-settings-path` 打开）、项目列表、Goal 的 Frame / 文档视图 / 移入回收站对话框、`/goals/<id>`、`/archive`、`/trash`、各个已重定向的旧设置地址，1440 与 390 宽、浅深色、标准与紧凑密度，以及强制 `:hover`、`:focus-visible`、`:focus`、`:active`，共 1,125 个情形、531,841 个值 0 差；进入页（空 Home 的 `/onboarding`，用 arrival 样式表）48 个值 0 差。探针先抓到了第四处（`.tui-resizer` 悬停时会从 `--line-strong` 变成 `--blue`），并回 `base.ts` 后归零。没碰到的：`settings-navigation`、`settings-shell--standalone`（只在独立设置页里，这些地址现在都重定向进工作台）和 Goal 规则编辑器里的 `.policy-*`（`renderPolicyEditor` 的表单在探针走过的所有 Goal 页面上都没有画出来）。
- W5-05 第 2 片（删 `personal-shell`，78 条规则、312 条声明）：没有一处还在决定计算值，所以整层删掉，没有并进任何主人样式表。三份样式表各少 10,020 B，`page-assets.json` 随之降；巨大单元与其他数字不变。证据叠在第 1 片之上，删之前和删之后两棵树各量一遍再比：`pnpm visual:compare` 66 张图、22 份计算样式全 0；同一个临时探针换成 personal-shell 的选择器，情形与第 1 片相同（1,125 个），4,620 个值 0 差；进入页上没有元素被这些选择器选中。探针碰到的只有 `body[data-desktop-shell="true"]` 下的 `.app`、`.workspace` 与 `.tree-pane`：只有 Goals 页把这个标记写成 `"true"`，设置页写的是 `"false"`；这几个元素的网格、边框和行都被后面的层盖掉了。其余 70 条规则的类在标记里找不到（`personal-sidebar`、`personal-nav-item`、`desktop-project-*` 等，工作台改成统一底栏之后就没人画了）。只有 `.personal-sidebar-footer` 还在源码里出现，它来自 `renderPluginRailAccountFooter`（`apps/workbench/src/settings-directory.ts`），而这个函数没有调用方。
- W5-05 第 3 片（删 `personal-workbench-v2`，120 条规则、336 条声明）：只有两组还在决定计算值，各挪回主人。① 项目菜单弹层里账户头像的 1px 圈（`inset 0 0 0 1px var(--line-strong)`，只在 761px 以上），挪进 `craft-finish.ts` 的弹层规则，和原来一样只在 `@media (min-width: 761px)` 里生效，单独占一行；同一处弹层里 `.navigator-personal` 原有两条同一选择器的规则（中间只隔着它子元素的规则），合成一条，所以 `craft-finish.ts` 的行数不变（`visual:compare` 的 22 份逐元素计算样式在合并前后 0 差）。② 回收站 Goal 页在桌面宽度下的标题行：间距 12px、隐藏「这条 Goal 已从日常列表移除…」那一句、操作按钮最小高度 28px。三条挪进 Goals 的 `trash-document-styles.ts`，放在已有的 `@media (min-width: 761px)` 桌面块里，选择器限定在 `.trash-goal-document` 之下；`.goal-title-row` 在 markup 里只出现在回收站文档这一处。样式表的降幅：arrival.css 与 settings.css 各少 13,837 B，workbench.css 少 13,558 B（回收站的三条规则只进工作台样式表），`page-assets.json` 随之降。证据（叠在第 2 片之上）：`pnpm visual:compare` 66 张图 0 变化。状态探针测了 1,125 个情形、29,715 个值，挪完以后只剩一类差：账户名下 `small` 的 `align-items`、`row-gap`、`column-gap`（132 个情形）。这个元素在所有情形里删之前、删之后都是 `display: block`，这三个属性对 block 元素不起作用，画面不会变，所以没有把这几条不起作用的声明挪过去。计算样式的比对因此在 22 份里都报这三处，图都是 0 差。删之前，第一次量出 537 个差；挪完之后，除了这一类全部归零。
- W5-05 第 4 片（删 `personal-workbench-v3`，433 条规则、1,641 条声明；巨大单元少一个，`baseline.json` 随之降）：整层直接删掉时，状态探针在 837,542 个值里量出 173,546 个差，12 张图有变化（goals-list、goal-work 的 1024/1440，3%～5%）。所以把还在决定计算值的规则挪进各自主人的样式表，不进兜底文件；在主人文件里放在开头，层叠位置与原来相同（v3 与这些主人之间的几层另做了静态翻转检查：同一选择器、同一属性的规则，先后一换就会翻）。① Feed 与来源整组进 `source-feed.ts`：v3 里 Feed 那一组 207 条规则，在 markup 里有元素的 120 条按原顺序整组挪，87 条在任何模板里都没有元素，删掉。挪过去以后，有四处被同一层里后写的规则翻了（`.feed-source-list` 的 gap、详情标题的字号与字距、窄屏 `.feed-directory-tools` 的内边距、窄屏详情标题字号），把这几个属性从挪过去的规则里去掉，结果与原来相同。② 目录栏（`.tree-pane`、拖拽条、目录标题、行的圆角与悬停底色）进 `directory-ledger.ts`。③ 桌面外框（安全区变量与原生窗口的 88px 安全区、`.app` 网格、项目菜单、拖拽区域、`.document-pane` 的内边距与底色、工作面、非 Goal 面上 TUI 窗格的隐藏）进 `desktop-titlebar.ts`。④ 只读的 Runtime 窗格（`.tui-pane[data-tui-read-only]`：只剩上级的守护说明，不出标签、外框、终端和菜单）进 `navigation-ownership.ts`。⑤ 回收站 Goal 页在桌面宽度下的文档与标题（宽度、间距、内边距、状态标签、标题字距、工作区最小高度）进 Goals 的 `trash-document-styles.ts` 已有的 `@media (min-width: 761px)` 块，限定在 `.trash-goal-document` 之下。主人文件都在 800 行以下（562、464、285、306、105）。选法与补漏：先用逐条去掉声明的探针找还起作用的规则；逐条去掉看不出两条规则设同一个值，整层探针又补出了⑤和 `.document-pane`；原来的探针不开桌面模式（服务端只在带 `x-molis-work-desktop: 1` 或 `?desktop=1` 时出桌面外框），`visual-foundation.test.ts` 的失败把这一点暴露出来，于是探针加了桌面一遍（1440、1024，含 18 个 `/settings/*` 地址），补出了原生窗口的安全区那条；探针原来也没有 Feed 数据和只读窗格，加上一个来源、一条带材料的条目和只读状态以后，又补出了①的整组和④。`visual-foundation.test.ts`：37 条断言删去或改写，删去的都是 markup 里没有元素的选择器（`.desktop-work-tab*`、`.workspace…`、`.desktop-utility-surface`、`.desktop-workbench-bar`、`.goal-brief-item`、`.desktop-goal-directory`、`.personal-sidebar-footer`）或被后面的层盖掉的值（标题栏 48px/34px 被 `immersive-navigation`、`linear-density` 覆盖，`[hidden]` 被 `base.ts` 的全局规则覆盖）；改写的 4 条落到现行的主人：独立设置页 markup 里是 `data-desktop-shell="false"`（所以 v3 的 Diagnostics 间距从来不生效）、原生窗口的项目按钮内边距、拖拽区域、回收站工作区高度。样式表的降幅：arrival.css 与 settings.css 各少 47,465 B，workbench.css 少 46,677 B，`page-assets.json` 随之降。证据（叠在第 3 片之上，删之前与删之后两棵树用同一份探针各量一遍）：浏览器模式 907,601 个值 0 差；桌面模式 1,218,728 个值 0 差；`pnpm visual:compare` 66 张图、22 份计算样式 0 变化。另把第 1 片之前（`ea396a276`，所有旧皮还在）与这一片在桌面模式下用四层合起来的 739 条规则比：2,032,834 个值里只剩第 3 片记过的那一类 `small` 不起作用的差，和 Feed 详情页里目录树因为 markup 多包了一层而换了路径（按路径对齐以后 1,652 个值全同），所以第 1～3 片在桌面模式下也没有漏挪。另有两组规则放回主人、没有删，因为全量里 `tests/web.test.ts` 的两条「desktop work tabs…」与 `tests/chrome-inner-scroll.test.ts` 按文字断言它们，而本片受影响用例的挑选（`scripts/affected-tests.mjs` 按读的文件与名字选）没有选到这两个文件：工作标签的整组（v3 里 111 行，加 1180px 以下的 `max-width`）进 `desktop-titlebar.ts` 开头；设置页 `body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) .settings-content` 进新的 `apps/workbench/src/styles/settings-desktop-shell.ts`，由 `settings.ts` 在原位置引入。两组都是死样式：两份设置页的 body 写死 `data-desktop-shell="false"`（写 `"true"` 的只有工作台的 Goals 页，`apps/workbench/src/goals-page-renderer.ts`），工作标签没有 markup（`renderInitialGoalTab` 没有调用方），所以计算值不变。第 5 片随 `renderInitialGoalTab` 与这几条用例一起删，每条写理由。教训：删样式的片除了 affected-tests，还要按删掉的选择器 grep 用例。
- W5-05 第 5 片（删 `calm-desktop`，324 条规则、998 条声明、1,391 行；五层旧皮全部删完，巨大单元 140→139，`baseline.json` 随之降）：还在决定计算值的声明挪到各自主人，不进兜底文件。① 表单控件与浮层（输入框、文本框、下拉框，`.theme-menu`、`.dialog-shell`、`.runtime-plan-dialog` 的边框、圆角与底色）进 `foundation.ts`。② 目录树的行（外边距、节点网格、标题字距、关系、底部、紧凑密度）进 `directory-ledger.ts` 开头。③ Runtime 窗格（主人栏与标签栏、舞台、上级守护、子选项、外框按钮、菜单、`.tui-resizer` 的线与悬停色）与设置导航进 `navigation-ownership.ts` 开头。④ Goal 文档窗格的内边距与底色（放在桌面外框自己那条之前，同优先级由它盖住）、标题栏里的项目名、窄屏 `.app` 网格进 `desktop-titlebar.ts` 开头。⑤ Goal 详情的卡片组进新的 `apps/workbench/src/styles/focus-sections.ts`（markup 在 `apps/workbench/src/focus-sections.ts`）。⑥ Goal 文档（标题、状态、hero 与工作区面板、卡片里的关系与因素、树上的状态标签）进 Goals 插件新的 `document-styles.ts`（`GOALS_DOCUMENT_STYLES`）。⑤⑥排在工作台样式表里所有基础层之后，calm 原来在 momentum 与 directory-ledger 之间，所以挪过去的规则会压过后面各层里同优先级、原来只靠次序赢的规则：静态检查（同一目标元素、同一属性族、同优先级、任何媒体条件）找出的几对，各自不改结果地解决——`.document-pane` 挪到 desktop-titlebar 开头；卡片过渡包进 `prefers-reduced-motion: no-preference`（与 titlebar 的 `transition: none` 互斥，是检查仍报的唯一一对）；卡片基规则放到 `.is-active` 之前（否则它的 `border` 盖掉选中卡的边框色）；`.focus-section-card.goal-record-section` 没有调用方传 `cardClass`，删掉。挪到 foundation、navigation-ownership、desktop-titlebar 开头的规则对它们与 calm 原位置之间的各层同样检查，0 对。补漏：第一次探针 22 类差，修了翻转与漏挪的 `.tui-resizer` 底色后剩 4 类，都是活性筛查判成死的声明——430px 容器查询里的 `border-left: 0`、只在紧凑密度回收站页起作用的 `.goal-document` 960 宽，以及两条同优先级靠次序压过 momentum 的（`.goal-header` 下内边距 24px、760 以下标题 24px），逐条去掉声明看不出后一类；四条补回 `document-styles.ts`（单独一个提交）。其余删掉的声明用 `lost` 检查复核：新样式表不再带的 791 条里，有同目标同属性、优先级不高、值不同的对手规则的 372 条（容器 5、密度 14、其他媒体 29、无条件 324），最终探针要覆盖这些条件，所以补了浏览器 1024（761～1080 媒体）与桌面 390（760 以下）两种宽度，两边都跑。死样式两组随功能删，各写理由：标题栏的工作标签（`renderInitialGoalTab` 没有调用方，连同贡献面 `initial-tab` 与 `WORK_TAB_VISIBILITY_CLIENT_SCRIPT`）、`settings-desktop-shell.ts`（两份设置页写死 `data-desktop-shell="false"`）；`tests/web.test.ts` 删两条工作标签用例（集合占位那一半留下），`visual-foundation.test.ts` 12 条改读 `renderMolisWorkWorkbenchStylesheet()`、3 条指向现行主人、7 条随无 markup 的选择器删去，`chrome-inner-scroll.test.ts` 那条换成写明理由的注释，没有放宽的断言。样式表（对 main）：arrival.css 746,249→705,879 B（少 40,370 B）、settings.css 1,034,967→994,313 B（少 40,654 B）；workbench.css 1,625,858→1,596,754 B，少 29,104 B（挪去的卡片与 Goal 规则只在它里面），`page-assets.json` 随之降。证据分两段。① 本片对第 4 片合入的 head `77cbbaa17`（main `aabf597de` 与它只差 LICENSE 文件），同一份探针：浏览器模式（1440、390）2,451,224 个值 0 差，桌面模式（1440、1024）3,265,660 个值 0 差；补的两种宽度，浏览器 1024 955,530 个值、桌面 390 1,275,118 个值，都是 0 差；Onboarding 0 差；head 一侧 1024 深色因负载超时漏了 4 个地址，两边只跑地址那一遍再比，91,253 个值 0 差。390 宽的 Feed 与 Feed 详情：浅色那一遍打开详情以后，窄屏下详情一直开着、列表看不见，所以接着的深色那一遍等不到条目（两边都这样，与样式无关）；单独跑深色，浏览器与桌面各 19,728 个值 0 差。Feed 详情页里目录树前面有一个随加载时机出现的元素，同一次运行里不同情境的路径也会差一层（base 的 1440 浅色标准与紧凑之间就差），按路径对齐以后值全同。② 并 main（`c276ab9cb` 以后）：main 自 `aabf597d` 起改样式的只有 T2（#638：craft-finish 的聚焦规则、交互里 `.mw-ix-refs` 的聚焦、新的 `INTERACTION_REFERENCE_STYLES`），D1、#629、#648、#650、#653 不改样式；三份样式表里 `CRAFT_FINISH_STYLES` 与 `ASSISTANT_INTERACTION_STYLES` 都排在 calm 原位置与本片所有新位置之后，所以挪动不跨过 T2 的规则；本片删掉的声明里末端可能落在 T2 新元素上的 39 处，祖先都不会包住问题卡（没有 markup 的、Goals 目录树与关系、只由 Goals 因素面板填的详情卡片）；并完以后三份样式表从并之前到并之后的文本差，与 main 自己从 `aabf597d` 到并入点的差逐字相同（workbench 与 arrival 各 36 行、settings 4 行）。主人文件都在 800 行以下。用例：受影响的用例加上 `tests/` 里点名删掉选择器的每个文件，浏览器 75 个文件 71 个过；`goal-event-visual.capture.ts` 在第 4 片的 head 上同样失败（等事件表的 DOM 超时），`product-interaction`、`agent-studio` 重跑两边都过（负载下的时序）；`pnpm test:contracts` 只有 `action-mcp-stdio` 在负载 25 下超出 20 秒，单独跑两边都过。`affected-tests` 选不到按选择器断言样式表的用例，这一类并进 BL-153。并 main 时的一处回退：本片先并了 #630 的 head（`467526610`），再单独删两组死样式（`9ddce29c5`）；之后并进 main 上 #630 的 squash 提交 `aabf597de`，三方合并以 #630 之前的 main 为基点，squash 提交「新增」了 `settings-desktop-shell.ts`，本片这边对基点「没有」它，于是文件和 `settings.ts` 里的两行又回来了（工作标签那一组在 squash 里本来就有，删掉的那几行与 squash 改的行重叠，没有回来）。死样式，计算值不变，探针看不出；开 PR 后复查时发现，在同一个 PR 里再删一次。教训：一个分支并过另一个 PR 的 head、又在其上删了东西，那个 PR squash 合入后再并 main，要按自己删掉的文件和选择器核一遍有没有回来。
- W5-05 收尾（删要求 `body.settings-page[data-desktop-shell="true"]` 的 26 个选择器，`settings.ts`、`desktop-titlebar.ts`、`navigation-ownership.ts` 共 101 行，只删不加）：两份设置页的 body 都写死 `data-desktop-shell="false"`，也没有脚本改它，所以这些选择器从来匹配不到。整条规则的选择器全是这一种的连声明一起删，混在列表里的只删这几个、其余选择器与声明留着。`visual-foundation.test.ts` 删 11 行、`chrome-inner-scroll.test.ts` 删 1 行断言，每行都只匹配被删的规则（删后各自变红，注释写明原因）。证据：源码与构建后的三份样式里都不再有这个前缀（构建产物逐条解析：main 上 20 条规则、26 处，本片 0）；状态探针把这 26 处去掉属性后套到真实元素上（`body.settings-page …`），在没有项目的 Home 里直接打开 12 个独立设置页和能力页（另 6 个设置地址在没有项目时不出独立页），浏览器 1440/390、桌面 1440/1024，亮暗两套、五种强制状态，基线树与本片各量一遍，两种模式都是 564 个值 0 个不同；设置地址在有项目时一律进工作台（`?embed=1` 也一样），工作台里没有 `body.settings-page`。页面资源只降：arrival.css −2,357、settings.css −4,408、workbench.css −4,202 字节。

W4-08（2026-10-16，平台产品服务的边界，不新增规则，统筹 10-15 认可）：决定 N-03 之后这一项只剩「层与 owner、依赖规则写全」。逐条核对，现有的都已经守着：
- 层与 owner：`docs/system/ARCHITECTURE.md`「平台产品服务」写明四项（记忆、放置、搜索、情境排序）可以持有跨插件策略和自己的机制记录，不拥有业务事实；`docs/SSOT-MATRIX.md` §6 与 `docs/horizontal/memory.md`、`placement.md` 各写了 owner。
- 依赖：三项在 `horizontal/` 下，`pnpm boundary:check` 的 `horizontal-reverse-dependency` 拒绝它们 import App、Module 实现或插件实现（`packages/test-kit/src/boundaries.ts`）；情境排序在内核里，`scripts/gates/kernel-contextual.mjs`（`docs/system/PACKAGE-BOUNDARIES.md` §6 的 K1 起）不许核心碰它。
- 表：`tooling/gates/table-owners.json` 里没有记忆、放置、搜索的共写表，门禁 `scripts/gates/table-owners.mjs` 让别的包写不了它们的表。
- 能力：它们以系统动作登记；新的 typed 宿主能力由 `pnpm health:check` 的结构数字拦着（只许减少）。情境排序的 HTTP 例外与删除条件写在架构文档同一节。
- 拆 `MemoryService`（`horizontal/memory/src/service.ts` 现 1,262 行）不在本项：按 `docs/system/HUGE-CLASS-MIGRATION.md` 的决定在包内由 W5-10 拆，路线图 W4-08 一行同步删去了「再拆 MemoryService」。

W5-12 测量（2026-10-16，统筹给的安静时段 23:56 起，main `cbf2341c5`；并发隔离的运行器早由 #497 做完，#518 加了只重建变了的包与机器槽位）：路线图「Measure full-run and build time before and after」。
- 全量：`node scripts/run-tests.mjs`（不带参数）1,017 个文件、5 份同时跑（浏览器文件 196 个，同时至多 2 个）、每个文件一份 `MOLIS_WORK_HOME`：58.2 分钟（3,493 秒）。之前串行 76–78 分钟（N-16 引用的口径，当时 762 个文件），文件多了约三分之一，墙钟少了约四分之一。
- 构建：冷构建（新工作树，71 个包）81.9 秒；不改源码再跑 10 秒（71 个都跳过）；改 `contracts` 一个文件，71 个包全重建（都依赖它）28.9 秒；只改一个插件的文件，重建它和依赖它的 5 个包 13.7 秒。只 `touch` 不改内容不算改动（按内容摘要判）。
- 争用：每 10 分钟记一次 `machine-slot status`（6 次）：build 槽一直空，browser 槽只有这次全量；负载 8–13（10 核），全是这次运行自己，没有别的会话的构建或浏览器批次插进来，这一段不标争用。
- 失败：13 个文件红；同一棵树逐个（`--jobs 1`）重跑，9 个过（负载下的时序）。剩下 4 个在 #565 之前的基线 `bd2472ae7` 上也红，不是这几天的合并引入的：
  - `onboarding-journey.e2e`、`project-arrival.e2e` 每次都红：项目还在打开（`registerProviders` 编译完动作合同才登记）时 Host 开始关闭，登记看到 Host 已关、打开失败；`LocalHost.closeProject` 再 `await` 这次打开，把它的错误又抛给 `close()`，夹具收尾记成失败。本片修掉（HOST-CLOSE-01）：打开失败已经告诉了打开的调用方，没有东西要关，Host 照常关完，打开成功的项目照常关闭。`tests/local-host-close.test.ts` 钉住（去掉修复即红），两个浏览器文件在修复后都过。
  - `issue-capture-page.e2e`、`issue-clarification-page.e2e` 偶发：基线与 main 各跑四次都有红，每次红的子用例不同（ISSUE-34、ISSUE-37、ISSUE-38，都是等 Issues 侧栏 iframe 里的某个状态 20 秒超时）。不是本线引入，交 Issues 的主人；没有放进 `tests/quarantine.json`（要 owner 与到期日，由统筹定）。

W5-13 第一片（2026-10-16，Host 日志，PR #570；统筹 10-16 认可盘点与分片）：路线图「最小的结构化日志替换 Host 里的 console.*」与任务书 §4.8「结构化日志与调用标识贯穿主链路」。
- 加：`apps/local-host/src/host-log.ts` 的 `hostLog.warn/error/debug(区域, 事件, 错误?, 字段?)`，Host 侧唯一的实现。每条是 stderr 上的一行 JSON（常驻服务的 LaunchAgent 写进 Home 的日志文件），用稳定的区域加事件名（如 `search` / `index_update_failed`）和错误码定位，带 `call_id`（内核调用范围里的编号，就是页面失败提示里可复制的诊断编号）。
- 只记键（`docs/system/SECURITY-INVARIANTS.md` 的「密钥只给引用」）：错误只留名字和码，不留消息和调用栈（会带人写的字、路径或密钥）；字段只留数字、布尔、null 和像键的字符串（字母数字与 `._:@-`，至多 120 字，没有空格和路径分隔符），其余写成 `"[omitted]"`；不是键的区域或事件名也写成 `"[omitted]"`，不在 catch 里抛错。
- `debug` 只在 `MOLIS_WORK_DEBUG` 列出区域时写（逗号分隔，`*` 为全部），直接取代 `MOLIS_WORK_MEMORY_DEBUG`、`MOLIS_WORK_SEARCH_DEBUG`，不留旧开关（仓库里没有别处读或写它们）。
- 改：Host 里 14 处后台 `console.warn/error`（Web 重启、助理的定时队列与两项周期扫描、记忆提炼与整理、删除收尾、操作队列占用、创作台读目录、CDP 事件、搜索索引）改写 `hostLog`；`assistant/assistant-http.ts` 的 2 处等回执 1e 合入后再改（统筹：assistant/ 在途）。`cli-install-service.ts`、`cli-project-maintenance.ts` 的 46 处命令行输出改走 apps/cli 的 `printCliLine`、`printCliJson`（输出逐字不变；apps/cli 是 biome.jsonc 里已经关掉 `noConsole` 的命令行程序）。
- 行为变化：搜索索引的后台更新（对账、刷新、同步）失败原来只在开关打开时打印，等于吞掉；现在总是记一条 warn（`logSearchIndexFailure`）。记忆提炼的 debug 原来打印整个结果对象（含提炼出的记忆正文），现在只记跑没跑、记了几条（`logMemoryLearning`）。删除收尾按错误的名字和码去重（原来按消息）。
- 数字：`console` 88 → 28（剩下的是 `assistant-http.ts` 2 处、`apps/server` 的命令行入口 7 处、测试与示例）。
- 测试：`tests/host-log.test.ts`：`W5-13-01`（一条记录的区域、事件、调用编号、错误名与码、字段；调用之外没有编号）、`W5-13-02`（debug 只为列出的区域写，`*` 为全部；warn 不看开关）、`W5-13-03`（搜索索引失败与记忆提炼经 Host 实际用的两个函数，错误消息、字段、嵌套对象、数组、名字里的人写的字、路径和密钥都进不了日志）。变异检查：错误留消息（01、03 失败）、字段留任意字符串（03 失败）、去掉 `call_id`（01 失败）、去掉 debug 的开关判断（02 失败）。
- 吞错的盘点（下一片起按区域修，每片开工前把文件清单给统筹）：TypeScript 代码（不含浏览器模板字符串）里 1,631 个 `catch` 与 `.catch(…)`，按处理方式分：重抛或包装 345、有记录 180、空且带注释 123、空 26、只返回默认值 354、其他处理 603。空的、只带注释的、只返回默认值的三类共 503 处：`apps/local-host/src` 247（顶层 102、`assistant/` 63、`browser/` 35、`installer/` 15、`computer/` 14、`plugin-builder/` 9、`memory/` 7）、`horizontal/agent-host` 61（几乎都在 `adapters/prologue-*.ts`，是模型调用路径，只列给 AI 开发手册线，不在本项改）、Pages 21、Coding 18、`packages/storage` 17、gmail 13、Work 11、runtime-host 10、memory 9，其余每包 7 处以下。逐处判：确是「没有就是答案」（解析失败返回空、可选文件不存在）或尽力清理（关闭时删临时文件）的，留下并在注释里写明真实原因（不写「忽略」）；把失败当成功的，改为记 `hostLog` 或向调用方报错。分片：2 顶层（不含 `coding-surface.ts`）；3 `browser/`、`installer/`、`computer/`、`plugin-builder/`、`memory/`；4 storage、runtime-host、memory、search、plugin-runtime、contracts；5 插件（不含 Coding）；最后 `assistant/`、Coding（相关 PR 合入后）。

W5-13 第二片（2026-10-16，`apps/local-host/src` 顶层吞错，PR 待开；第一片 #570 已合入，已变基到 main；统筹 10-16 认可文件清单，另提三点，已并入）：
- 改成记录或收窄（原来把失败当成功）：
  - 按 id 查项目：`web-server.ts` 3 处、`web-request.ts`、`system-agent-service.ts`、`project-arrival-http.ts` 原来捕获一切当「没有这个项目」。现在经新文件 `catalog-lookup.ts` 的 `projectOrNull`，只有目录的 `catalog.project_not_found` 读成没有，别的错误（目录打不开、读不了）在这里记一条 `projects` / `catalog_lookup_failed`（只记键），再交给调用方，由各边缘按惯常的 500 答（目录类已是巨大单元，不往里加方法）。这是行为变化：项目简介（`project-arrival-http.ts`）原来读成 404，现在是 500；侧栏浏览器的项目检查原来是 404，现在经 Web 服务最后的 catch 成 500；群聊的项目连接（`im-server.ts`）原来一律 403，现在目录读不了是 500（`im.server.catalog_unavailable`），没有这个项目仍是 403；进程不崩，下一个请求照常答。
  - 定时轮次：`web-project-schedulers.ts` 的 Feed 与定时任务两种轮次、`project-schedulers.ts` 启动时的首轮、`schedule-task-runner.ts` 取消失败，原来静默；现在记 `schedule` 区域。每 30 秒一轮的失败只在开始失败时记一条，跑通过后再失败才再记（`host-log.ts` 的 `repeatingFailure`，Coding 后台清单与终端记录共用）。
  - 连接目录：`connector-mcp-actions.ts` 重启后某个连接登记失败按连接 id 记，其余照常登记；`external-mcp-actions.ts` 重启副本写不进、恢复失败，`project-host.ts` 启动时 `connectorMcp.sync()` 失败，都记 `connections` 区域。
  - 成果预览：`artifact-actions.ts`、`side-files-http.ts`、`artifact-native-plugin-http.ts` 的主人预览失败仍显示为没有预览；「不能读」（`forbidden`）与「不在了」（`not_found`）是答案不记，别的按成果类型记（`logPreviewFailure`）。
  - 其余：Characters 解析不了的记录按 id 记；已安装插件的入口读不出来时页面照开、记一条；终端记录写不进每个进程记一次；Coding 后台清单读不了的库按项目记（开始失败时一条）。2026-10-21 起（C4，PG-043）这条换了做法：Coding 的清单是它自己的查询 `coding.home.background-tasks@1`，宿主 `home-background-tasks.ts` 经首页聚合（S-49）问每个已打开的项目，读取器 `listCodingBackgroundSessions` 与 `holdsCodingSessions` 已删；停用或没授权的项目安静跳过，读不了的按项目记一条（`home` 区域 `background_tasks_unreadable`，开始失败时一条），仍是 W5-13-06 管的那件事，测试换成经真实宿主与插件的写法（`tests/host-log-catches.test.ts`）。Alchemist 读不到绑定账户的令牌（只记键，不记错误文字和任何可能带令牌的值；界面上该不该显示「读不到」而不是「未连接」是界面改动，不在本片，记为后续）、Images 绑定连接对这个地址被拒或读不到密钥，仍按无令牌处理，但记一条。项目关闭时搜索、放置关不掉也记，不挡其余部分关闭。
  - `web-onboarding-input.ts` 的空 `catch {}` 写明真实原因（空 catch 4 → 3）。
- 留下并写明真实原因（不写「忽略」）：队列串接（`connector-api-oauth.ts`、`connector-mcp.ts`、`mcp-settings-store.ts`：上一个的失败已经答给它自己的调用方）、收尾关闭（`connector-mcp.ts` ×4、`material-web.ts` ×2、`workspace-git-index.ts`、`git-operations.ts` ×2、`alchemist-native-plugin-http.ts`）、「没有就是答案」（`action-call-log.ts` ×3、`git-status.ts`、`git-worktrees.ts`、`onboarding.ts`、`jelly-source-providers.ts` ×3、`personal-planning-methods.ts`、`notion-oauth.ts` ×2、`feed-history-release.ts`、`web-assets.ts`、`home-plugin-http.ts`、`resident-host-request.ts`）；`project-host.ts` 原来的「closing anyway」改成记录。
- 模型路径，只列给 AI 手册线、不在本片改：`home-event-actions.ts:52`（行为判断失败不记）、`information-actions.ts:27` 与 `workflows-actions.ts:12`（`hostCompleteText` 不可用时为 undefined）、`schedule-runtime.ts:92`（Feed 的 `flushPendingJudgments`）。
- #570 评审的两点并入本片：像键只是形状检查，不是密钥识别（邮箱、`sk-` 令牌形状像键，会照写），所以字段只放调用处自己定的编号、枚举和计数，`host-log.ts` 注释与 README 写明，`W5-13-09` 钉住；搜索索引的告警按（遍次、错误码）在进程内只记一次，`W5-13-10` 钉住。
- 测试：`tests/host-log-catches.test.ts`：`W5-13-04`（项目查找只把 not_found 当没有，目录读不了与别的目录错误照抛）、`W5-13-05`（预览失败按类型记，forbidden、not_found 不记，消息与路径不进日志）、`W5-13-06`（Coding 后台清单，经宿主的真实接线：没有 Coding 的项目不记，读不了的库开始失败时记一条、读通后再失败再记；没有 Coding 的库用不带 Coding 表的空库——演示看板会建 Coding 的表，用它就量不到这一条；去掉接线里的询问即红）、`W5-13-08`（重复失败只在开始时记）、`W5-13-11`（项目简介与侧栏浏览器：没有这个项目仍是 404，目录读不了是 500 并记一条，服务照常答下一个）；`tests/im-local-project.test.ts` 的 `W5-13-11`（群聊连接：目录读不了 500，没有这个项目仍 403，之后照常连上）；`tests/connector-mcp.test.ts` 的 `W5-13-07`（重启后一个连接登记失败按 id 记，另一个照常登记）。变异检查：项目查找改回全捕获（04 失败）、预览不分种类（05 失败）、重复失败不去重（06、08 失败）、连接登记改回静默（07 失败）、Coding 去掉表检查（06 失败）。
- 门禁：`--base origin/main` 通过；新加的几行没有留在巨大单元里（移到模块级小函数或同行注释），巨大单元的行数不变。

W5-13 第三片（2026-10-28，`apps/local-host/src` 里失败后什么都不留的几类 catch，已合入（#1330，main `8a72df336`）；统筹 10-28 裁定合成一片）：门禁能数的空 catch 与 `console` 在范围内已是 0，余下的是 catch 里只有注释、或吞掉任意错误的写法。逐行看过 local-host 的约 230 处，大多是合理兜底（解析失败当找不到、探测文件或进程、回给调用方的拒绝、回滚时保住原错误），不改；本片只收「失败了没人知道」的四类，行为都不变，只是失败写进 `hostLog`（只记错误名或码、区域、事件和调用处自己定的 id 与计数，不记消息、输入文字和路径，同 W5-13-03、09）。
- 监听者与观察者：`host-log.ts` 加一个共用的 `eachListener(区域, 听的是什么, 监听者, 告诉)`，一个监听者抛错不挡其他监听者和告诉它们的代码，开始失败时记一条 `<区域>.listener_failed`（字段 `of`），好过之后再失败才再记。用在助理库的变化（`assistant-store.ts`）、电脑桌面的状态与画面（`computer-desk.ts`）、辅助程序的事件（`helper-connection.ts`）。宿主对动作提供方的观察者（`local-host.ts:106`）不在本片：改它命中 affected 的 assembly、要跑全量，留给 W6-01（装配冻结名单清零），那一片本来就动宿主装配、跑全量，到时顺手补（统筹 10-28）。
- 主操作不等的次要记录：提示词使用记录（`agent-definitions.ts`，`agents` / `prompt_use_unrecorded`，字段 `owner` 与 `prompt`）、命令成功后的关系与 Send 时的材料关系（`assistant-authority.ts`、`assistant-relations.ts`，`assistant` / `relation_unrecorded`，`step` 为 `command` 或 `send`）。任务卡片收尾（`assistant-jobs.ts` 的 `#settleCards`）按错误码分：`assistant.conflict`（卡片已被改）是预期，不记；别的记 `job_card_unsettled`。
- 后台循环：续接的监视（`assistant-continuations.ts`，每 5 秒重试，按范围记 `continuation_watch_failed`）、新材料的来源（`assistant-material-scan.ts`，按项目和 `capability_id` 记 `material_source_failed`）、到期提醒的来源（`assistant-followups.ts`，`reminder_source_failed`，这段时间下次照旧再问）用 `repeatingFailure`，按来源的 `capability_id` 或范围记，开始失败时一条；发布者账本的记法（RAC-1113）每个 `publisherStanding` 各一份。
- 发布者账本读不了（`installed-publisher-standing.ts`）：仍是谁都不信任，拒绝不变（S-87 的「账本读不出来时谁都不信任」，安全不变量的表和测试都没改，不新增 S 行）；开始读不了时记一条 `plugins` / `publisher_ledger_unreadable`，读通后再读不了才再记。
- 验收：`tests/host-log-listeners.test.ts`：
  - `RAC-1110` / `W5-13-12`：一个监听者抛错，其他监听者照常收到、写入照常成功，日志里一条 `<区域>.listener_failed`，只带错误名或码；依次是共用的 `eachListener`（辅助程序的事件经它）、助理库、电脑桌面。
  - `RAC-1111` / `W5-13-13`：次要记录写不进（命令后的关系、Send 时的材料关系、模型调用的提示词使用记录）：主操作照常返回或继续，日志里一条 warn，不带人写的字；提示词按主人与 id 分两个字段记（合起来的键带 `/`，不像键）。
  - `RAC-1112` / `W5-13-14`：任务卡片收尾，版本冲突不记，别的失败记一条，库里的卡片保持原样。
  - `RAC-1113` / `W5-13-15`：发布者账本读不了，固定的安装照旧被拒、宿主自己的照旧可跑，只记一条；读通后照常信任；人此后改了同意（如撤销另一个发布者），同一个 standing 再读不了，再记一条；另一个 standing 各记各的。
  - `RAC-1114` / `W5-13-16`：新材料来源、提醒来源、续接监视一直失败，开始时按键记一条，查看照常继续；提醒来源没答的那段不记为已看过。
- 不在本片、各记一处：
  - 「`store.get` 失败就当已删」一类（助理里约 15 处）改成只认 `assistant.not_found`：BL-810，见下一节。
  - 平台包（`horizontal/*`、`modules/*`、`packages/*`）不能 import `hostLog`，要记日志得先定注入的日志端口：BL-812（随 BL-169；`horizontal/agent-host` 的 32 处归 AI 手册线）。
  - Promise 上的 `.catch(() => 默认值)` 约 243 处门禁不数，大多是进程清理与收尾关闭，不整体清，只在碰到的片里顺手收。
  - `alchemist-service-host.ts`、`plugin-builder/*` 不改：用户 10-21 定了炼金台与插件创作台以后删掉重做。
  - 浏览器脚本模板字符串里的 9 处空 catch（读写 localStorage、匹配媒体查询的兜底）：页面里没有 `hostLog`，页面错误要不要报给宿主是另一件事，要用户定。

BL-810（2026-10-28，T-009，分支 `task/T009-m`，#1335）：助理读一项可能已被删的工作时，只有 `assistant.not_found` 算「不在了」；库读不了不再冒充删除。
- 写法：`assistant-errors.ts` 加 `whenThere(read)`：读到就返回，`assistant.not_found` 返回 null，别的错误照抛，不新写 Error 子类。用在 14 处：续接的变化监听与「是不是还是当前」（`assistant-continuations.ts`；读不了时，监听器的失败由 `eachListener` 记，监视的失败由 `continuation_watch_failed` 记）、用量结算（`assistant-budget.ts`）、执行器会话的占用（`assistant-executor-session.ts`：读不了不当作会话空着）、跟进后台任务（`assistant-jobs.ts` 的 `follow` 与 `#follower`）、记忆工具读这一轮说过的话（`assistant-memory-bridge.ts`）、已处理通知的结算（`assistant-notices.ts`：一项工作读不了，按 work_id 记一条 `assistant.notice_work_unreadable` 再跳过它，别的工作照常结算）、定时跟进（`assistant-followups.ts`：宿主启动排队时读不了，按 follow-up 记一条 `assistant.followup_work_unreadable` 再跳过；到点时读不了，同样按 follow-up 记一条 `assistant.followup_work_unreadable`（与启动时同一个键，已记过的不重复），再抛出、不写这条跟进，不再写「这项工作已不存在」；队列把这一次记为失败，它的错误没有别的读者，所以以日志那条为准。下次启动按同一条宽限规则重判：还在宽限内就照常开始，晚了就记 `missed`，一次性的照样停用，通知里的原因写的是「当时 Molis Work 没有在运行」，不是实情（库读不了），通知文字这次不改）、工作记录、相关工作与诊断（`assistant-work-reads.ts`）、子任务交回后接着做（`assistant-delegation.ts`，读不了时交回的通知写明原因）。读不了时，同步的调用带着库自己的错误失败，监听器与监视由已有的日志记下，通知结算与定时跟进的两处如上另记一条。列表类读取（相关工作、诊断）一行读不了整次读取失败，用量结算读不了就拦住发送：这几处给不出完整答案就不答，是有意的。照实写明：`follow` 的两个调用处（`assistant-outcomes.ts` 的 `.catch(() => undefined)`、`assistant-offers.ts` 在 `started` 里的调用）、子任务交回写通知那一处（`assistant-delegation.ts` 的 `.catch(() => undefined)`），以及二审（#1335 第二轮）请作者核出的两处——后台任务结束的监听（`assistant-jobs.ts` 的 `onJobEnded(… .catch(() => undefined))`，经 `#follower` 读工作；每次启动会再听一遍）、读一项工作时附带的用量（`assistant-service.ts` 的 `workUsage(…).catch(() => null)`，经用量结算读工作；这次读不到用量，下次再读）——仍会把这类错误吞掉、不留日志，按下一条的 Promise 一条处理。
- 不在本片：`assistant-http.ts` 的两处已经只认这个码，不动；Promise 上的 `.catch(() => 默认值)`（如 `assistant-outcomes.ts` 跟进后台任务那一处）照 W5-13 第三片「不在本片」的 Promise 一条处理。
- 二审（#1335）顺手改的：`assistant-followups.ts` 的 `reminder_source_failed` 记法从模块级改为每个实例一份（与账本那份同一类）；`assistant-jobs.ts` 两行同源导入合成一行。
- 并入 #1330 评审（`b70faf1ed`）的四条：新材料来源按「项目:capability_id」去重、字段带 `project_id`；每个 `publisherStanding` 各一份账本失败的记法；RAC-1112 断言库里的卡片；`docs/system/SECURITY-INVARIANTS.md` S-87 行「只在本机跑」一列引用 RAC-1113（只加引用，不改条文）。
- 验收：`tests/assistant-not-found.test.ts`：
  - `RAC-1140`：工作记录，不在了是 null，库读不了抛出库自己的错误。
  - `RAC-1141`：相关工作，指向已删工作的关系不列出，库读不了时读取失败。
  - `RAC-1142`：已处理通知的结算，已删工作的通知原样留着、不记失败；一项工作读不了，记一条 `assistant.notice_work_unreadable`（两轮只记一次），每一轮都接着读它后面那项读得通的工作，它的通知仍开着。
  - `RAC-1143`：续接听到变化时库读不了，记一条 `assistant.listener_failed`（`of` 为 `work_changes`），写入照常成功。
  - `RAC-1144`：定时跟进，宿主启动时读不了工作记一条 `assistant.followup_work_unreadable`（启动两次只记一次，到点时不再记第二条）；启动时读得通、到点时读不了，到点时记这一条；两种情形到点都抛出库自己的错误，这条跟进原样不动。

W5-01-PAGES 正式 Runtime 迁移（2026-10-20，#847，叠在平台片 PG-050（#846）上）：
- 范围：Pages 从构建期宿主适配器迁到每个项目一个 Plugin Runtime 实例；库仍是 `{home}/pages/pages.db` 的 `PAGES_DATABASE`（version 2，原 schema 不变），17 个动作的处理器、17 条 HTTP 路由（走 Manifest 的 `routes` 与 `bindPluginActionRoute`）、成果发布（`services.artifacts`）、写作模型（`services.model.complete` 的完整结果）和上传文件读取（`services.materials.readDocuments`）都由 Runtime 服务供给；删除宿主 `pages-actions.ts`、`pages-native-plugin-http.ts`、`pages-artifact.ts`、`pages-import.ts` 及 `project-host.ts`/`web-request.ts`/`web-catalog.ts`/`index.ts` 里的接线，目录条目只留 UI/client/styles 与 `project_data`。新增 `plugin.ts`（`createPagesPlugin`、`PAGES_DATABASE` 经 `index.ts` 导出）。
- 平台前置（③ 裁定成独立一片 PG-050，分支 `feat/pg-050-materials-read-documents`，先于 Pages 合入主线）：`services.materials` 加 `readDocuments`（`materials:read`，只能在插件自己声明了该权限的 concurrent 动作里调；宿主端直接用 `readMaterialUploads`）。偏离 RUNTIME-MIGRATION §6 第 1 项「迁移 PR 不加平台服务」，原因是 Pages 导入按上传文件批量读文档（ZIP/DOCX/编码），Runtime 此前没有对应服务；`W5-01-PAGES-01` 与 S-39 登记；公开 API 快照只多 `PluginMaterialsClient.readDocuments` 与 `PluginMaterialDocumentsRequest` 共 3 行。
- 不变：`project_id` 分区、块备注/批注/评论线程、生成租约与幂等收据（V-18 的内存 attempts 改为每个实例一份）、导入回执、发布意图/完成两阶段与恢复；动作 id/version 不变，`previewImport`/`import`/`artifactContinue` 现声明 `materials:read`，`artifactContinue` 改为 `scheduling: "concurrent"`，Manifest 新增 `artifact:read`（见动作快照）。合同影响（① 2026-10-20 定的写法）：这三个动作只改了权限与 scheduling，输入输出 schema 的哈希没变，所以 version 仍是 1、MCP 工具名不变；合同影响：已授权的要在设置页重新授权（`pages.artifacts.continue`、`pages.import`、`pages.import.preview`；没有升版本，没有改 MCP 工具名）。Inbox 仍以 `provider_id: PAGES_PLUGIN_ID` 固定 Pages；内置提供方身份仍是 plugin_id。
- 验收：`W5-01-PAGES-01` Runtime 材料服务按上传文件批量读文档；`W5-01-PAGES-02` 动作与 17 条路由经 Manifest/SDK，旧 `/api/pages` 404，`project_id` 与本项目不符的请求在写入前被拒，路由体积上限（1 MB，两条导入路由 15 MB）；`W5-01-PAGES-03` 导入预览到保存、转换与幂等收据；`W5-01-PAGES-04` 发布两阶段、成果身份与恢复；`W5-01-PAGES-05` HTTP 与动作写同一条成果线；`W5-01-PAGES-06` 发布各阶段的取消、撤权与提供方被替换；`W5-01-PAGES-07` 项目删除步骤（`project_data` 与实例无关，实例未运行也清理，失败后重试补完）；`W5-01-PAGES-08` Inbox 的 `inbox.pages.generate` 经 Runtime 提供方跑通（规范身份、共享快照、重放保留编辑）；`W5-01-PAGES-09` 项目 Runtime 装配、Home 库与冻结名单、目录条目、包清单；`W5-01-PAGES-STORE-01`–`04` 唯一库声明、窄 SQL 端口、导入/复制中途失败回滚、`beforeEffect` 拒绝不进入写入、Runtime 事务回滚。
- 行为变化（按预期变化处理，已改测试）：①没有成果库发布方的 409 `pages.unavailable` 分支删除（Runtime 总会给成果库）；②`[]` 文件列表由 Manifest 输入 schema（`minItems: 1`）以 `actions.input_invalid` 拒绝，不再由处理器单独拒绝；③模型失败统一为 Runtime 的 `plugin.model_failed`（「模型请求失败，请重试」），不再透出模型端原文；④成果以固定 scope `personal` 发布，owner 由平台从调用上下文取，Pages 不再传 `owner_actor_id`（合同影响：成果库里 Pages 成果的 owner 不再可能由输入给定）；⑤发布的 `begin` 与 `artifacts.publish` 之间每一步都重新询问原调用方（`goal-pin-authority` 的栅栏改为等 Pages 自己返回后再放行，`pagesReturned()`）；⑥内容交接处理器（`pages.content.*`）把实际提供方 id（`PAGES_PLUGIN_ID`）写进保留的授权引用，MCP 客户端的逐动作授权才对得上（`plugin-action-query-mcp` AQD-05）；⑦`pages-project-binding` 里针对旧 board 路径的用例随旧路径一起删；⑧`pages.artifacts.continue` 改为 `scheduling: "concurrent"`（等模型的动作，返回后 `beforeEffect()` 再提交）并让 Manifest 声明 `artifact:read`，这两项只改权限与 scheduling，不改 schema，所以不升版本。
- 项目已删：目录条目的 `project_data: pagesProjectData` 注册进 `project-deleted-owners.ts`，与 Runtime 实例无关；`tests/pages-project-deleted.test.ts` 经真实 `POST /api/settings/projects/<id>/delete` 覆盖三种情形（正常清理并保留另一项目、步骤失败后重试补完、实例已关闭仍清理）。
- 证据（2026-10-20，本地，合并 PG-050 分支与 `origin/main 5b996f603` 之后）：`pnpm workspace:build` 的 72 个包里除 `apps/local-host` 的 Swift 原生步骤（本机命令行工具的 `SwiftBridging` 模块重复定义，与本片无关）之外都构建通过，local-host 的 `tsc -p tsconfig.json` 通过（`apps/desktop`、`apps/server` 另行 `run build` 通过）；相关 87 个用例文件里 86 个通过、共 836 项，包括 `pages-actions` 14/14、`pages-mcp` 1/1、`pages-project-deleted` 3/3、`pages-promote-authority` 2/2、`pages-store` 4/4、`pages-plugin` 127/127、`pages-import*` 40/40、`feed-inbox-pages-loop` 8/8、`inbox-prepared-pages` 9/9、`goal-pin-authority` 14/14、`material-documents` 10/10、`security-invariants-plugin-materials` 14/14、`plugin-action-query-mcp` 1/1、`builtin-plugin-assembly-gate` 7/7、`project-deletion-owners` 12/12、`action-contract-snapshot` 25/25、`workflows-plugin` 7/7、`workflows-handoff-idempotency` 3/3、`content-owner-regressions` 11/11、`document-plugins-error-model` 19/19、`document-plugins-limits` 12/12；唯一没过的 `web-route-table` 只差 `/desktop/pty-client.js` 与 `<project>/desktop/pty-client.js` 两行（本机没有构建桌面 pty 客户端，返回 404「desktop pty client missing」，与本片无关），Pages 的路由行与快照一致。门禁：`pnpm boundary:check` 通过；`pnpm api:update` 与 `pnpm actions:update` 在合并后都不再有改动（API 快照只因 PG-050 多 `PluginMaterialsClient.readDocuments` 与 `PluginMaterialDocumentsRequest` 共 3 行；动作快照改 3 个动作的调用方式：`pages.artifacts.continue` 改 concurrent 并加 `materials:read`，`pages.import`、`pages.import.preview` 加 `materials:read`，另增 8 条宿主登记的 `sdk.artifacts.*` 动作）；页面资源 `molis-work-pages-editor.js` 小 9 字节（706942 到 706933）、`molis-work-plugins/pages.js` 小 55 字节（48466 到 48411），经脚本降低预算。浏览器用例（`*.e2e.test.ts`）按并行规则未跑。
- 未做/未验：浏览器用例（`*.e2e.test.ts` 只改路径未跑）；全量回归；真实 Home。多个宿主进程共用一个 Home 时，项目内的 Runtime 安装记录是共享的（`pages-mcp` 在最后一个宿主第一次调用前读到被前一个宿主关闭写成的 `disabled`），测试里按这个顺序先问再读；这不是 Pages 的行为。
- 已一并改的三处（③ 裁定）：`package.json` 的 `test:security` 加入 `pages-promote-authority`；`scripts/contextual-slice/client.ts` 删掉残留的 `/api/pages-ai`（演示服务从没提供过，`runAi` 本就是可选项）；`apps/workbench/src/builtin-plugins.ts` 的 Pages 条目与 PPT、Dataset 同一形状（`personal: true` 加 UI/client/styles/`project_data`），`/api/plugins/pages/…` 不是 Pages 专有的别名改写，而是 `native-plugin-api.ts` 对 `personal` 且无 `runtime` 的目录条目通用生成的映射；Pages 的项目实例由 `project-plugins.ts` 装配（`runtime` 字段只表示 Home 作用域），旧 `/api/pages` 仍 404。
- 待办：Lingguang、Cognia 的内容交接处理器是否同样对不上 MCP 逐动作授权，记为 BL-374。

W5-01-PPT 正式 Runtime 迁移（2026-10-18，本地实现与复审收口，待主线整合与 CI；merge 公共 head `dfc21df3b`，未推、未开 PR）：
- 范围：PPT 从构建期宿主适配器迁到每个项目一个 Plugin Runtime 实例；库仍是 `{home}/ppt/ppt.db` 的 `PPT_DATABASE`，动作、11 条 HTTP 路由和成果发布改走 Manifest/`bindPluginActionRoute`/`services.artifacts`，Pages 读取走 `services.actions.invokeQuery`，模型走 `services.model.complete` 的完整结果；删除宿主 `ppt-actions.ts`/`ppt-native-plugin-http.ts`/路由表与提供方接线，目录条目只保留 UI/client/styles。
- 不变：1–39 页可追加、满 40 页才拒绝、title-only 页保留、replace 语义；原 `ppt.db` v1、两表、`project_id` 分区、发布意图/完成两阶段与恢复；动作 id/version/schema/scheduling 不借迁移改。
- 验收：`W5-01-PPT-01` 项目 Runtime 装配、Home 库/旧数据、目录与冻结名单；`W5-01-PPT-02` 动作与 11 条路由经 Manifest/SDK，旧 `/api/ppt` 404、未知 id `ppt.not_found`；`W5-01-PPT-03` 发布两阶段、成果身份/恢复、actor 隔离、重启后保留；`W5-01-PPT-04` Pages 读取保留原 caller/audience/allowlist，text-only 不依赖 Pages，不无条件 required_actions；`W5-01-PPT-05` 模型返回完整 `validateResult`，事务同步回调首条业务 SQL 前调用，失败不写、撤权不记失败业务数据；`W5-01-PPT-06` 1–39/40/title-only/replace 行为；`W5-01-PPT-07` HTTP/MCP/Agent 原入口授权，克隆 control/命令/别安装拒绝；`W5-01-PPT-08` 定向用例、build、boundary、health、page-assets、动作/API 快照、assembly gate 与包清单。
- 证据（2026-10-18，本地；公共 head `dfc21df3b` + PPT Store `db4ab7244`）：整体 `pnpm build` 71 包通过；`ppt-actions` 5/5、`ppt-store` 3/3、`ppt-subject-kind` 1/1、`creative-tools-plugins` 8/8、`creative-artifact-promote` 2/2、`document-plugins-limits` 9/9、`project-deletion-owners` 12/12、`document-plugins-error-model` 17/17、`ppt-promote-authority` 1/1（原 6 个取消/撤权交错 + 正常对照；下述 root 复核扩为 8 个）、`document-pin-after-move` 13/13、`web-route-table` 1/1、`builtin-plugin-assembly-gate` 6/6、`ppt-mcp` 1/1、`action-contract-snapshot` 25/25、`plugin-client-served` 3/3、`artifact-compare-moved` 与 `content-owner-regressions` 通过；真实 Chrome 的 `ppt-actions.e2e` 1440/390 2/2、`content-editing-regressions.e2e` 9/9、`model-ready-surfaces.e2e` 12/12。`boundary:check`、health（merge-base `7faaa027`）、page-assets（25 项 7,476,529 B）、`verify-release-versions` 通过；日志见 `logs/ppt-runtime-*.log`（`p1-tests`、`document-limits`、`document-pin`、`readme-browser`、`e2e-final`、`health-0a9237ced`）。
- P1 修复（2026-10-18，`ppt-runtime-a414-review.md`）：发布的两个业务事务都重新等待原 caller `beforeEffect`，并在同步 SQL 前检查原 `signal`/`assert_authority_current`；`begin` 提交到 `artifacts.publish` 之间增加同一原 caller 的 `beforePublish` 等待。root 复审发现外层 await 仍可在回调尾检后失权，已在实际同步 publish wrapper 紧前复核 current。`tests/ppt-promote-authority.test.ts` 的 `W5-01-PPT-07` 用实际 `createPptPlugin` + 真 SQLite `PptStore` + 可控 database/artifact 阶段，覆盖入口后到begin SQL、begin后到publish、异步publish检查成功后到真实publish、artifact后到complete SQL四个交错点，分别取消与撤权，并验正常对照；新增微任务用例在旧 `9198c2d3c` 构建上稳定失败（本应零发布却发生一次），补 wrapper 后通过。已合法提交的 pending/artifact 保留，后续阶段零新增。整体 build、4 个相关文件 21 条测试及 merge-base health/boundary 通过，原始日志 `/tmp/ppt-authority-final-tail-{before,build,tests,health,boundary}.log`；该测试使用真实插件与 SQLite、受控授权阶段，未声称外部进程全链验收。
- 未做/未验：推送、PR、合并、标签；`api` 快照的公共 AQD/SHM 变化由 root 持有，不在这片改；真实 Home 未动。
- 待办：正式 head 的基线/同步顺序由 Codex 定；本地实现完再做完整回归，不推送、不开 PR、不自行合并。

W5-01-PPT 纯 Store 准备（2026-10-18；Codex 允许先做包内 Store；工作树 `feature/w5-01-ppt-store`，未推、未开 PR）：
- 范围：PPT 仍按每个项目一个 Runtime 的目标；本片只改 `plugins/native/ppt/src/store.ts` 的窄 SQL 端口（`PptSql`/`PptStores`/`ownPptStores`）与唯一 `PPT_DATABASE`（`store_name: "ppt"`、version 1、原 schema 与列顺序不变），`openPptStore` 保留同一 Store 的本地连接适配；`PPT_HOME_STORE`、`project-data.ts` 与发布库版本表引用同一份 `PPT_DATABASE`，删除 `PPT_STORE_BASELINE` 别名。
- 不变：原 `{home}/ppt/ppt.db`、`project_id` 分区、三阶段发布、动作 id/版本/权限、Manifest/路由、Pages 读取、模型调用、宿主接线与目录条目。不改 Host 或包外调用方。
- 验证：现有 PPT Store 消费者（actions、MCP、placement、project deletion、creative artifact）保持；`PPT_DATABASE` 与 Home baseline、`docs/releases` 版本表一致；health 对照 merge-base。
- 证据（2026-10-18，本地；基于 `origin/main 7faaa027`，未带 Dataset 分支的宿主改动）：`pnpm --filter @molis-ai/molis-work-plugin-ppt run build` 通过；`tests/ppt-store.test.ts` 的 `W5-01-PPT-STORE-01`–`03` 3/3（唯一声明与 Home baseline 一致；`ownPptStores` 经原 Store 读写；真实原库的 duplicate/receive 中途失败回滚，无半份 deck/receipt；`beforeEffect` 拒绝时回调未进入、库不变）；`ppt-actions` 5/5、`ppt-subject-kind` 1/1、`project-deletion-owners` 12/12、`creative-tools-plugins` 8/8、`creative-artifact-promote` 2/2、`ppt-mcp` 1/1；`verify-release-versions` 的 29 个库表行与代码一致；`pnpm boundary:check` 通过；health 对 merge-base `7faaa027` 通过。原始日志在交接通道 `logs/ppt-store-tests.log`、`logs/ppt-store-port-test.log`、`logs/ppt-store-health.log`。
- 未做/未验：Manifest 路由、Pages/模型调用、宿主接线、动作/API 快照、page-assets 都未动；没有 UI 变化，未跑浏览器与真实 Home。
- 待办（另片）：公共动作委托、`validateResult` 集成、Manifest 路由、Pages/模型调用、宿主接线删除与调用方迁移；等 Codex 的实际基线与 spec 编号。

W5-01-PPT 收尾（2026-10-19，§10.29 #748 复查的 P2，③；分支 `chore/closeout-ppt-ports`）：
- 删 `apps/local-host/src/creative-artifacts.ts`：里面是 PPT 的三个旧端口（行头、写版本、读版本）和对 PPT 插件的 import，PPT 迁到 Runtime 后已经没有调用方（[privileges.md](privileges.md) PG-109）。`tests/document-plugins-error-model.test.ts` 去掉专扫这个文件的断言；`tooling/gates/error-owners.json` 的 `artifacts` 去掉这条路径，文件没了，路径按门禁规则必须离表。
- 同片收掉 #733 复查的两条 P3：
  - `builtin-instructions.ts` 的注释改成创作台的 Agent。
  - Cognia 没有模型时的提示按预期变化处理。平台规则 D4-b 只给 Host 写的一句「请先在「模型设置」里连接文字模型」；Cognia 原句「……导入、搜索和阅读仍可使用。」不留，它在 `plugins/native/cognia/src/en.ts` 里已无人使用的翻译一并删掉。

W5-01-DATASET（2026-10-18，本地候选已审（Codex 10-18 裁定代码候选无 Blocker/P1，文案收尾后等待整合），工作树 `feature/w5-01-dataset-runtime`，未推、未开 PR；等 #684 合入后的空位）：
- 范围：Dataset 从构建期装配迁到 Plugin Runtime，每个项目一个实例；库仍是 `{home}/dataset/dataset.db`，项目分区、目录条目与 `project_data` 不变。不改成 Home 单实例，不动其他插件。
- 包：`store.ts` 的 SQL 端口（`DatasetSql`/`DatasetStores`/`ownDatasetStores`）与 `DATASET_DATABASE`；`actions.ts` 读/写分开；`promote.ts` 三段写（intent → publish → complete）；新增 `plugin.ts` 与 13 条 Manifest 路由（`/datasets…`），`max_body_bytes` 保持 1,000,000 B，CSV 的 2,000,000 字符仍是动作层限制；导出 `createDatasetPlugin`/`DATASET_DATABASE`，删旧 `routes.ts`/`route-handlers.ts`。
- 宿主：删 `dataset-actions.ts`、`dataset-native-plugin-http.ts`、`project-host.ts` 的 provider、`web-request.ts`/`web-catalog.ts` 的处理段、`index.ts` 导出、`creative-artifacts.ts` 的三个 Dataset 端口；`project-plugins.ts` 加 `bundled` + `database: DATASET_DATABASE`；装配名单把 dataset 从构建期移到 Runtime，删短路由名单。
- 客户端：路由前缀 `api` 常量指向 `/api/plugins/io.molis.work.dataset`；旧 `/api/dataset` 不留别名，加 404 拒绝用例。
- 测试：`dataset-actions` 经宿主动作；`dataset-mcp` 改一个常驻 Host + 网关；e2e 路径更新；公开 action id/version/schema/provider 不变。验收编号 `W5-01-DATASET-01` 起。
- 证据（2026-10-18，本地；未推、未开 PR）：整体构建通过（machine-slot，37.6 s；增量 15.9 s）；`tests/dataset-actions.test.ts` 11/11（`W5-01-DATASET-01`）、`tests/dataset-mcp.test.ts` 1/1（`W5-01-DATASET-02`；同一测试进程内构造 MCP gateway/adapter，关闭并重建 Host 对象验证持久化重开，不是外部 MCP 子进程或 OS 重启）、`tests/dataset-actions.e2e.test.ts` 3/3 与 `tests/dataset-file-import.e2e.test.ts` 6/6（`W5-01-DATASET-03/-04`）、`tests/creative-tools-plugins.test.ts` 8/8、`tests/builtin-plugin-assembly-gate.test.ts` 6/6；`pnpm boundary:check` 通过；health 对 merge-base `aceffff86` 通过；`tests/action-contract-snapshot.test.ts` 25/25、`tests/page-assets-budget.test.ts` 71/71；`page-assets` 里 `dataset.js` 25,832 → 25,632 字节（低于 merge-base，已 `--update` 降预算）。动作快照多 5 条 `sdk.artifacts.<Dataset 安装>.{publish,read,own,head,record}@1` 宿主行，来自 Dataset 的 Runtime 安装；Dataset 自己的动作 id/版本/schema/提供方不变。`package-inventory --table` 的 Dataset 行已从构建期改为 Runtime。
- 未验证：全量回归（按 Codex 与本线规则交 CI/统筹）、真实 Home、`#684` 合入后的 main 重跑；等 Codex 在 `to-dsh/w5-dataset.md` 给出空位与基线后再推送。
- 发布授权补漏（2026-10-19，§10.29 的 P1，③；分支 `fix/dataset-promote-authority`）：#749 合入的发布在 `begin` 提交后到 `artifacts.publish` 之间不再问原调用方。现照 PPT（`W5-01-PPT-07`）补齐：两个业务写入在事务里第一条 SQL 前同步检查原调用方的 `signal` 与 `assert_authority_current`；发布前 `beforePublish` 先等原调用方的 `beforeEffect` 再查；真正调用发布的包装里紧前再查一次。验收 `W5-01-DATASET-06`（`tests/dataset-promote-authority.test.ts`）：真实 `createDatasetPlugin` 和 SQLite，四个交错点（入口到 begin、begin 到发布、异步检查通过后到真实发布、成果写出后到完成）分别取消、撤权，只留已合法提交的阶段；另有正常对照。

W5-01-WORKFLOWS 纯 Store 准备（2026-10-18，Codex 分配；工作树 `feature/w5-01-workflows-store`，基于 `origin/main 7faaa027c`，未推、未开 PR）：
- 范围：Workflows 仍按每个项目一个 Runtime 实例；本片只改 `plugins/native/workflows/src/store.ts` 的窄 SQL 端口（`WorkflowsSql`/`WorkflowsStores`/`ownWorkflowsStores`）与唯一 `WORKFLOWS_DATABASE`（`store_name: "workflows"`、version 1、原 schema/两表形状不变），`openWorkflowsStore` 保留 `{home}/workflows/workflows.db`、WAL、`applySqliteBaseline` 与关闭归属；`WORKFLOWS_HOME_STORE`、`project-data.ts` 与发布库版本表引用同一份，删除 `WORKFLOWS_STORE_BASELINE` 别名。
- 不变：`project_id` 分区、流程修订冲突、实例 `updated_at` 并发凭证、停止/继续与手动确认、固定交接键及拒绝后的零写入、项目删除只清本项目且缺库不创建；动作 id/版本/权限、Manifest/路由、宿主接线、UI 与 Runtime 迁移均不动。
- 验收：`W5-01-WORKFLOWS-STORE-01` 唯一声明与 Home baseline 一致，`ownWorkflowsStores` 经原 Store 读写且修订冲突仍拒绝；`W5-01-WORKFLOWS-STORE-02` `beforeEffect` 拒绝时回调未进入、库不变；现有 Workflows 行为用例保持。
- 证据（2026-10-18，本地；基于 `origin/main 7faaa027`）：整体 `pnpm build` 71 包通过；`tests/workflows-store.test.ts` 的 `W5-01-WORKFLOWS-STORE-01`/`02` 2/2，连同 workflows-plugin 7/7、handoff 3/3、stop-and-token 3/3、stop-effects 2/2、action-steps 1/1、content-actions 3/3、project-deletion-owners 12/12，共 8 文件 33/33；`verify-release-versions`、`boundary:check`、health（merge-base `7faaa027`）通过。日志：`logs/workflows-store-build.log`、`logs/workflows-store-tests.log`、`logs/workflows-store-health.log`。
- 待办：Manifest/路由、动作切换、宿主接线删除与 Runtime 迁移另片；等 Codex 的实际基线与公共前置。

W5-01-WORKFLOWS（Runtime 迁移，2026-10-20，分支 `migrate/workflows-runtime`；动作目录的 `directory.invoke/discover/check` 与 S-43 来自 #848，不在本片重写）：
- 范围：Workflows 从构建期装配迁到 Plugin Runtime，每个项目一个实例；库仍是 `{home}/workflows/workflows.db`（`WORKFLOWS_DATABASE`，version 1），项目分区与目录条目不变。不改成 Home 单实例，不动其他插件。
- 包：新增 `plugin.ts`（`createWorkflowsPlugin`）与 Manifest 0.3.0 的 13 条路由（`/workflows…`），`max_body_bytes` 取原宿主路由的 400,000 B；导出 `createWorkflowsPlugin`，删旧 `routes.ts`/`route-handlers.ts`。站点内容、动作步骤与判断规则一律经 `services.actions.directory`（`discover`/`invoke`/`check`）到达；AI 交接的文字模型走 `services.model`。
- 宿主：删 `workflows-actions.ts`、`workflows-native-plugin-http.ts`、`web-project-platform-routes.ts` 的 `workflowsRoute`、`project-host.ts` 的 provider 与 `index.ts` 的导出；`project-plugins.ts` 的 `homeLibraryPlugins()` 加 Workflows 条目（`bundled`、`database: WORKFLOWS_DATABASE`）；装配名单把 workflows 从构建期移到 Runtime，从旧路径名单里去掉；`apps/workbench/src/builtin-plugins.ts` 的目录条目保留。
- 授权：Manifest 声明必需权限 `storage:private`、`workflows:read`、`workflows:write`、`actions:delegate`，可选 `model:invoke`。嵌套调用以原调用者身份、`audience: "workflow"` 进目录，`delegated_by` 是 Workflows 的插件 id；原调用者的 `allowed_actions` 与 `validate_authority` 原样带着，插件自己不持有任何站点或步骤的权限。
- 不变：动作 id、版本、输入输出 schema、`scheduling: "concurrent"`、受众与 `provider_id`（`retainActionAuthority(…, provider_id: WORKFLOWS_PLUGIN_ID)` 不动，RUNTIME-MIGRATION 4.2；仓库里写死的 `provider_id` 只有这一处自钉，没有别的插件钉 Workflows）；库 schema；固定交接键与拒绝后的零写入；实例 `updated_at` 并发凭证；被取消、撤权、停用的调用不写业务记录；界面。
- 验收：
  - `W5-01-WORKFLOWS-01`：Manifest 要的权限，少一项就拒绝启动；项目起 Runtime 实例后，Workflows 的每个动作仍登记在自己的插件 id 名下（`tests/workflows-delegation.test.ts`）。
  - `W5-01-WORKFLOWS-02`：真实路由的错误模型：边缘读到声明的 400,000 B，超出 413，坏请求体 400（`tests/document-plugins-error-model.test.ts`）。
  - `W5-01-WORKFLOWS-03`：页面里站点与步骤以本人身份到达：本人有而插件没有的权限能用，本人没有的不会因插件而得到（`tests/workflows-delegation.test.ts`）。
  - `W5-01-WORKFLOWS-04`：只被授权了「继续」与 Feed 站、没被授权这一步的 MCP 客户端被拒（`workflows.unavailable`），步骤不运行、不留尝试记录；授权后以 `workflow` 受众运行，`delegated_by` 是插件、原操作者不变。
  - `W5-01-WORKFLOWS-05`：动作清单里没有这一步的 Agent 被拒，步骤不运行；列入后照常。
  - `W5-01-WORKFLOWS-06`：目标动作对这份映射输入的拒绝在记 `attempted_at` 之前（`directory.check`），映射错了可直接改了再跑，不需要「重试」（`tests/workflows-action-steps.test.ts`）。
  - `W5-01-WORKFLOWS-07`：停止或撤权后不留业务记录，嵌套调用经动作目录（`tests/workflows-stop-effects.test.ts`）。
  - `W5-01-WORKFLOWS-08`：模型的回答只在原调用仍有效时记录：检查在提交里，被拒的回答不留交接（`tests/workflow-content-actions.test.ts`）。
  - `W5-01-WORKFLOWS-09`：项目已删（RUNTIME-MIGRATION 第 6 节第 10 项）：Runtime 实例在跑时，一步失败后在同一次删除里重来并完成，只清本项目的流程与运行；没有 Runtime 时同一步照样清、不碰别的项目（`tests/workflows-project-deletion.test.ts`，两个用例）。
- 行为变化（按预期变化处理）：
  - 页面的写请求之后不再 `invalidateWebView`：插件路由没有这一步。
  - 提供方缺失或有多个时由目录报 `actions.dependency_missing` 或 `actions.provider_ambiguous`；无效的流程或运行 id 现在进到动作，由动作的输入校验或 `workflows.not_found` 拒绝，不再在路由层给 404。
  - `workflows:read`、`workflows:write`、`actions:delegate` 成为必需权限。当前随宿主发布的安装按共同 `bundledGrants` 规则取得 Manifest 的必需权限，用户关闭过的可选 `model:invoke` 保持关闭，不要求另到设置页重新授权；缺少必需权限的直接 Runtime 启动仍拒绝。动作版本不升（动作形状未变）。
  - 每次 `invoke` 都重新在目录里找一次提供方，不再沿用宿主启动时绑定的那一份；提示词覆盖与「模型已不可用」的措辞改由 `services.model` 给出。
  - 与旧路径相比 MCP 与 Agent 没有变宽：旧的提供方本来就用原调用者（`actions.invoke(caller, …)`）去调站点与步骤，现在改经目录，仍是原调用者，`allowed_actions` 与 `validate_authority` 一路带着，另外多一道安装的 `actions:delegate`。所以 MCP 没被授权、Agent 清单里没有的步骤被拒（`workflows.unavailable`），步骤不运行；调用途中被撤权仍是 `mcp.action_revoked`。页面上也没有变窄：旧路由按本地用户的全部权限，现在以本人身份，本人能到达的照旧能到达。
  - 旧的 `/api/workflows…` 不留别名；客户端改用 `/api/plugins/io.molis.work.native.workflows/workflows…`。
- 证据（2026-10-20，本地整合）：已合入实际 main `73ce89eb0`（含 #887 SDK、#870 材料服务、#805 设置）与 #848 `133a7c918`，候选 `74e6944b2` 的整体 `pnpm build`（含 Swift 辅助程序）通过。首轮 79 文件 809 项、另两文件 7 项通过；最新 main 组合复跑 62 文件 968 项，覆盖 Agent Host/Plugin Runtime README 必跑、模型图片与材料、原调用者授权、查询限制、Workflows 委派/删除/停止与模型提交；另外版本核对与 Pages 项目删除 2 文件 25 项通过。真实 Runtime HTTP 错误模型 20/20：六个文档插件的体积限制与坏 JSON 均走实际路由，Workflows 400,000 B 边界、404 和修订冲突断言保持。`pnpm boundary:check`、对 main merge-base 的 health 与 page-assets 通过；API 和动作快照重新生成没有新增变化。Workflows 自己的动作 id、版本、schema、提供方不变；Runtime 安装新增的 8 条 `sdk.artifacts.<Workflows 安装>.{head,list,own,process-head,process-own,publish,read,record}@1` 宿主快照保持。`workflows.js` 82,533 → 82,527 字节；`package-inventory --table` 的 Workflows 行已由构建期改为 Runtime。
- CI 子集：`workflows-delegation.test.ts` 与 `workflows-project-deletion.test.ts` 已加入产品子集；最新必要复跑分别 11.4 s、5.1 s，Linux 静态分类无 `darwin`/`live`/`browser` 标记，清单检查通过。Linux 实跑与耗时由本次 CI 核验。
- 真实浏览器（临时 Home、本机 Chrome）：四文件 21/21 通过——`workflows-action-steps.e2e` 2/2（真实创建 Feed → Shelf 流程、字段映射、材料写入与窄屏安全结果）、`workflows-open-object.e2e` 2/2（搜索与对象页签重新打开）、`workflows-save-ownership.e2e` 5/5（跨页面保存、CAS 冲突与显式重试）、`model-ready-surfaces.e2e` 12/12（包括 Workflows 首个文字模型就绪后的界面恢复）。整批全量、真实 Home 与用户本人验收尚未完成，由统筹保留独立状态。

W5-01-GIT Git 离开 HYBRID 名单（G5，2026-10-23，③；分支 `migrate/git-g5-closeout`；前面几片是 G0 #993、GS、G1 #1025、G2a #1015、G2b #1023、G3 #1014、G4 #1019）：
- 范围：宿主里最后三个以 Git 命名的文件改名成平台的工作区 Git 服务，和 `workspace-git.ts`、`workspace-git-index.ts`、`workspace-git-actions.ts`、`workspace-git-writers.ts` 放在一起：`git-operations.ts` → `workspace-git-operations.ts`，`git-worktrees.ts` → `workspace-git-worktrees.ts`，`git-writer-integration.ts` → `workspace-git-integration.ts`。内容不变，只改 import 路径。
- 错误主人（T5）：写者工作树的五个码从 `git.*` 改成 `workspace_git.worktree.*`（`unavailable`、`not_a_repository`、`failed`、`not_owned`、`dirty`）；没有别的代码、测试或库按旧码分支，调用记录里的错误码只是诊断行。`tooling/gates/error-owners.json` 的 `git` 主人只留 SDK 的 `git-porcelain.ts`，三个改名的文件归 `workspace_git`。`workspace-git.ts` 与 `workspace-git-index.ts` 在 merge-base 是 `host` 的，主人表只许变严，所以留在 `host`；`workspace-git.ts` 的 `GitReadError` 只在本文件里抛、本文件里转成读取结果，不是线上的错误，不改。
- 名单：`tests/builtin-plugin-assembly-gate.test.ts` 的 `HYBRID_RUNTIME_PLUGINS` 去掉 `git`，剩 `coding`、`shelf`。
- 验收：
  - `W5-01-GIT-01`：宿主里 import Git 包的文件正好是 `project-plugins.ts`（Coding 页里的 Git 伙伴页是 Git 自己的 surface，C9 删 `coding-surface.ts` 时收紧，见 privileges PG-091）；监督器不带参数调 `createGitPlugin()`；宿主没有 `gitPorts` 或 `observeGitOperations`。
  - `W5-01-GIT-02`：`workspace-git*.ts` 不 import 任何 `@molis-ai/molis-work-plugin-*`。
  - `W5-01-GIT-03`：真实宿主里 `projects.workspace.git.*`、`projects.workspace.writers.*` 都没有 typed 条目，Git 的四项与 writer 的四项都是只给插件调的动作。
  - `W5-01-GIT-04`：没有以 Git 命名的宿主文件，Git 不在 HYBRID 名单里（同一测试文件的 hybrid 用例）。

### W5-03 第一片：Images 稳定翻译键与共同运行时（2026-10-17，本地验证通过，待按队列集成）

收尾整合（2026-10-18，本地通过）：合入当前 Runtime、PPT/Dataset 与 Workflows Store 候选 `e55aa3545`，保留当前 Images 放入 Shelf 的 placement 路径和稳定翻译键。整体构建、API、boundary、merge-base health 与资源更新通过；5 个非浏览器文件 164 条及 2 个真实 Chrome 文件 6 条通过。资源为 25 项 7,478,980 B，较上游减少 537 B；当前中文内联 936→5,904 B（+4,968），英文 692,183→691,038 B（−1,145），仍在已批准的同一增量内。日志 `/tmp/molis-images-i18n-closeout-*.log`；最终共享全量和 PR/CI 合并仍待，不据此宣称整条 W5-03 完成。

目标是形成可继续迁移的内部完整样板，落实决定 #16 与 Workbench README 已定的 Images 首片。基于 main `4726820a8` 实测：Images 的 `ui.ts`、`client.ts` 共 107 处翻译调用、85 个不同文案；原词典 90 条，16 条仍由其他页面或目录元数据消费。服务端 `L` 与浏览器 `L` 当前只查中文键，直接换键会把键显示给用户。

实现边界：Images 在自己的 `src/messages.ts` 声明中英并排的稳定键，在现有 `BUILTIN_PLUGIN_CATALOG` 条目登记；Workbench 按页面语言派生词典，服务端与浏览器沿用同一调用接口。现有其他主人的中文键继续按现行入口查找，保留仍被使用的 Images 中文条目，删除无人使用的旧条目。稳定键不另建中心 import 清单、不加新的公开 SDK/Manifest 合同。英文以迁移前实际 `EN` 的结果为准，中文与交互保持不变。Images 的生成、连接、任务、持久化与授权，以及 W5-01 Runtime 迁移均不在本片改动范围内；#661 未改动这两份 UI/客户端源文件。

#### 验收与证据（RAC-56～60）
- **RAC-56**：插件的两条翻译路径使用主人稳定键，键在主人词典中只定义一次、中英完整；保留其他消费者实际需要的中文条目，迁移前后同语言可见文字相同。由 `tests/i18n.test.ts` 的实际服务词典/Images 渲染断言及现有翻译扫描证明。
- **RAC-57**：服务端请求交错时语言隔离，浏览器收到当前语言的稳定键表，中文、英文和参数替换均正确，现有中文键调用正常；由 `tests/i18n.test.ts` 运行真实脚本与公开 Host 入口证明。
- **RAC-58**：真实浏览器中的 Images 空态、服务管理、提交与生成结果在中英两种语言均不显示稳定键，受控 provider 的原有调用次数、图片字节及授权失败路径保持；由 `tests/images-actions.e2e.test.ts` 与 `tests/content-context-regressions.e2e.test.ts` 证明。
- **RAC-59**：给现有翻译检查补上“稳定词典实际登记到目录”的拒绝条件，断开登记时明确失败，且不放宽已有规则。该门禁改动已于 2026-10-17 经用户弹窗批准，按可审补丁落实；`tests/translation-check.test.ts` 的变异场景证明。
- **RAC-60**：整体构建、Workbench/Images README 要求的定向用例、health（对 main merge-base）、boundary 与 page-assets 通过。逐项测量静态资源和内联翻译脚本；若受预算约束的资源增长，记录实际增量、按已有约定弹窗确认后再改放行。共享运行时的完整回归交统筹在 CI 排，不在本机跑全量。分五部分，全部成立才算通过（2026-10-19 拆，QA-021；门禁部分与平台线对过）：① 定向用例：两包 README 必跑列表在该提交上全部通过，其中证明本片行为的是 RAC-56～59 的用例（`tests/i18n.test.ts`、`tests/images-actions.e2e.test.ts`、`tests/content-context-regressions.e2e.test.ts`、`tests/translation-check.test.ts`）；② 静态资源逐项实测：`tests/page-assets-budget.test.ts` 的「this repository's build is within the committed page asset budget…」，本树构建的每个资源（含 `images.js`）等于已提交的预算、没有未登记的新资源；③ [人工] 内联翻译脚本：资源门禁不量页内 `<script>`（`scripts/gates/page-assets.mjs` 开头写明），2026-10-17 的实测数字记在下面的本地证据里，那次增长经用户弹窗批准；④ [人工] 整体构建、对 merge-base 的 health 与资源只降、boundary：没有测试证明「在这个提交上通过」，看该提交 CI 作业记录；⑤ [人工] 共享运行时的完整回归交统筹 CI。

验证命令：`pnpm build`、`pnpm workspace:build`（机器 build 槽位串行）；`node scripts/run-tests.mjs` 加上述测试与两包 README 的必跑列表（浏览器走 browser 槽位）；`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`、`node scripts/gates/page-assets.mjs --base origin/main`。2026-10-17 本地证据：整体构建及 workspace 构建通过；翻译 2 文件 73 项、两包必跑 24 文件 185 项、真实浏览器 2 文件 6 项、门禁集成 2 文件 136 项全部通过（合计 30 文件 400 项）。85 条英文逐条与迁移前实际 EN 比较相同；中英桌面/窄屏生成返回的 provider 次数与图片字节通过。health 对 merge-base `4726820a8` 与 boundary 通过。Images 静态脚本 22,546→21,978 B（−568 B），预算随实测下调；内联翻译脚本中文 952→5,920 B（+4,968 B）、英文 683,136→681,991 B（−1,145 B）。RAC-56/57/58 已验证。2026-10-17 用户分别批准“允许新增检查”和“允许这项内联增长”：登记检查仅增加拒绝、不放宽已有规则；中文内联增长限于上述 +4,968 B，其他静态预算不增长。RAC-59 已按获准补丁落实并验证：未登记、只有 import、无关对象与错误字段四种场景均拒绝；两种 `--update` 写过基线后仍拒绝；导入别名通过；断开真实 Images 目录登记也被发现。登记识别按导出名字、不解析模块路径，边界与现有英文词典检查一致。RAC-60 的本地构建与门禁已通过，最终集成与 CI 仍待。未宣称整个 W5-03 完成。

### W5-13 补片：后台作业授权读取失败不冒充工作删除（2026-10-17；已合入 main：#754 `ffb3db076`）

收尾组合验证（2026-10-18）：已合入 Pages 及其前置的现有 Runtime、成果服务和 Module 出口候选；完整 build、API/动作快照（均无额外变化）、boundary、merge-base health 与资源检查通过。真实暂时读不到再恢复的作业路径、外部检查安全及 SDK 作业回归 3 文件 72 条通过；日志 `/tmp/molis-job-combined-*.log`。25 项资源仍 7,478,901 B，本修复无页面变化；原 64 文件 581 条证据保留。共享核心全量与正式 PR/CI、合入 main 仍待，未将本地候选记作主线已修。

独立复查 #675（`b75e20738`）确认 `AssistantJobs.#follower` 把 `store.get` 的全部异常都当作“工作不存在”，与 `specs/prologue-adoption/spec.md` §6.0o 已定的“工作不在就 refused；读不到算这次不知道，SDK 再看”冲突。在隔离 SQLite 文件上持有真实排他锁，真实 Prologue 适配器第一次检查即把作业置为 `needs-reconciliation/unchecked`，解锁后仍不恢复，查询未执行。复现基于 main `8dad2fb96` 的同一生产实现；不读取真实 Home。

最小修复仅改 `apps/local-host/src/assistant/assistant-jobs.ts` 的授权查找：只吞掉 owner 明确的 `assistant.not_found`，其他异常向现有检查器传播；检查器继续使用原有 unknown 有界重查，不新建重试、计时器或状态。作业执行、授权撤销、五次未知后交人、通知、卡片及库版本均保持原合同。复用现有 `tests/assistant-business-gateway.test.ts` 的服务与适配器夹具，允许为这条用例传入隔离的真实文件数据库。

- **RAC-61**：真实排他锁引发的读取错误不会被当作工作删除；第一次失败后步骤仍运行，期间不调用状态查询；解锁后原步骤查询一次并正常完成，不创建第二步骤、不调模型。测试名带 `RAC-61`，走生产 `AssistantJobs.authority`、检查器及 SDK 等待。
- **RAC-62**：确实不存在的工作及不属于该图的工作仍无授权；已有撤权拒绝、后台作业及助理回归通过。由同条测试及 `tests/security-invariants-external-checks.test.ts`、`tests/prologue-work-jobs.test.ts` 证明。

验证：整体 `pnpm build` 后运行新增回归与 Host README 必跑/助理逻辑列表；`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`。修改是一个读取错误分类，不改合同、页面或安全上限；无需修改 API/动作快照或门禁。2026-10-17 验证通过：整体构建；定向 3 文件 69 项（含真实 SQLite 排他锁恢复与既有撤权拒绝）；Host/助理必跑其余 60 文件 510 项；真实 Chrome 1 文件 2 项，合计 64 文件 581 项、无失败或跳过；health 对 merge-base `8dad2fb96`、boundary 通过。RAC-61/62 已满足；本地实现与定向验证完成，等待按本线 PR 顺序集成，不据此宣称整体防腐线完成。

### W5-01 Characters 搬逻辑进 Module（CHR-0，2026-10-21，③；分支 `migrate/characters-chr0`）

状态：完成，经 PR #956 合入 main（⑤ 评审，集成批次跑全量）。这是 Characters 迁到宿主的第一片（计划见迁移线笔记 `characters-into-module-plan.md` §12）：只搬逻辑，不换装配；第二片（CHR-1）才换宿主登记提供方、删插件包。片内的工作名是 CHR-0、CHR-1；验收编号照 `specs/README.md`「验收编号」一份 spec 一个前缀，接着本 spec 的 RAC 往下排。

- **搬了什么**：处理器逻辑进 `modules/characters`：`createCharactersActionHandlers(ports, runtime)` 返回每个 Characters 动作的纯函数（`action-handlers.ts`）；已发布角色的筛选、锁定、「能不能跑」的判断在 `publications.ts`，内置 Agent 能力目录的检查在 `agent-actions.ts`，用到处的统计在 `usages.ts`，成果库详情的 Markdown 在 `artifact-preview.ts`；非界面的预览与导入逻辑（`import-preview.ts`、`imports.ts`）整份从插件搬来。
- **边界发现与做法**：插件不能 import Module（`PLUGIN_MODULE_IMPORT_ALLOWLIST` 只许减少），所以不让插件依赖 `modules/characters`。宿主 `characters-host.ts` 用宿主的端口建好处理器，经插件现有的端口类型 `CharactersPluginPorts` 交给插件，端口的内容从「数据端口」换成 `handlers(runtime)`。只有运行中的插件才有的东西（项目号、成果库客户端、内置 Agent 目录）由插件在 `start` 里作为 `runtime` 递给处理器。插件的 `start` 只剩用 `bindOwnerPluginAction` 逐个绑定，Manifest、`actions.ts` 定义、14 条路由不动。
- **不变**：动作 id、版本、schema、受众、权限、提供方 id、MCP 工具名、路由路径与状态码映射、`project-plugins.ts`、目录条目、`CodingCharacterPorts` 与 `codingCharacterPorts`（留给 C2b）。没有新增兼容或迁移代码，没有向 `PLUGIN_MODULE_IMPORT_ALLOWLIST` 或任何名单加条目。
- **客户端就地收拾**：`plugins/native/characters/src/client.ts` 里的空 catch、两处直接 `fetch` 在 `check-health-gates.mjs --report` 里各降到 0。直接 `fetch` 改走工作台已有的 `molisWorkRequest`（同一批地址）。`_SCRIPT` 文本常量（`CHARACTERS_CLIENT_FACTORY_SCRIPT`）不在这一片动：脚本还是文本，改名只会让计数变小而程序没变；CHR-1 把它搬进 `apps/workbench/src/characters/` 改成打包的 TypeScript，这一项才真正去掉（新位置从 0 开始，仍是文本就过不了门禁）。

#### 验收（RAC-63～69）
- **RAC-63**：每个 Characters 动作在 Module 里恰有一个处理器，名字与插件的动作定义一一对应；插件源码不 import Module、插件包不依赖 Module，经真实 Runtime 与路由绑定后行为不变。`tests/characters-action-handlers.test.ts`、`tests/characters-native-execution.test.ts`、`tests/characters-actions.test.ts`。
- **RAC-64**：处理器只为一个人服务：别人的草稿读不到（`characters.not_found`）、改不了、发布不了（`characters.conflict`），被拒的发布不写成果；绑定后的动作仍拒绝别的调用方。`tests/characters-action-handlers.test.ts`、`tests/security-invariants-plugin-original-caller.test.ts`（S-18）。
- **RAC-65**：只列出、只允许运行「本人、本项目、Characters 自己发布」的角色版本：别的项目、别的所有者、别的生产方、别的签名、别的类型、别的 schema 版本，各一条不列出、也不可运行；本人版本的身份与正文不一致是错误，不是可覆盖的版本。`tests/characters-action-handlers.test.ts`。
- **RAC-66**：已发布版本只有在它的草稿启用、且它据以发布的草稿修订存在时才能运行；停用、删除、来源修订不存在，`characters.runnable` 都答 `available: false` 并带 Characters 自己的原因，`execution` 拒绝。`tests/characters-action-handlers.test.ts`。
- **RAC-67**：同样的内容再次发布返回已有版本（`replayed`，不写成果）；内容变了写下一版并带 `supersedes_version`；过期修订不发布。`tests/characters-action-handlers.test.ts`。
- **RAC-68**：对外合同不变：`pnpm actions:update` 对 `tooling/gates/actions/` 零差异，19 个 `characters.*@1` 的提供方仍是 `io.molis.work.characters`，`tests/action-contract-snapshot.test.ts` 通过。`tests/characters-action-handlers.test.ts`（快照里的 id、版本、提供方与动作定义一致）。
- **RAC-69**：Characters 浏览器客户端无空 catch、无直接 `fetch`，经 `molisWorkRequest` 请求；`/assets/molis-work-plugins/characters.js` 不涨。`tests/characters-action-handlers.test.ts`、`tests/characters-publication-http.test.ts`、`pnpm page-assets:check`。

#### 证据（2026-10-21，合并 origin/main `63ee40cc7` 之后）
- 构建：`pnpm build`、`pnpm workspace:build` 通过。
- 测试：`tests/characters-action-handlers.test.ts`（新，7 项，RAC-63～69）与 Characters 相关、动作合同与成果声明门禁共 12 个文件通过（`characters-actions`、`characters-module`、`characters-import`、`characters-schema`、`characters-native-execution`、`characters-publication-http`、`security-invariants-plugin-original-caller` 17 项含 S-18、`action-contract-snapshot` 25 项、`artifact-type-gate`、`artifact-declaration-gate`、`builtin-plugin-assembly-gate`）；读文档的 `health-gates-structure`、`health-gates-store-versions`、`package-inventory-gate`、`package-owners`、`shelf-owner-files`、`plugin-registry-generation` 通过。合并前对 `affected-tests` 建议的 101 个非浏览器文件跑过一遍：98 个通过；失败的 3 个里 `security-invariants-plugin-original-caller` 是本片改测试时留下的重复声明，已改并重跑通过，另 2 个与本片无关：`npm-package` 在这台机器上 `spawn npm ENOENT`（PATH 里没有 npm），`shelf-jelly-cognia-images-error-model` 因 cognia 的 `directory_unavailable` 错误码（#901 加入，已在 HEAD，本片没动 cognia 的源码或测试）；没有为它们另建基线工作树对比，依据是静态的（`git log`、`git grep`）。浏览器用例（`affected-tests` 列的 2 个）按本机约定未跑，留给 CI。没有跑全量。
- 动作合同快照：`pnpm actions:update` 对 `tooling/gates/actions/` 零差异；`pnpm api:update` 无变化（Module 不在公开 API 快照里）。
- 页面资源：`characters.js` 30250 → 29988 字节（-262），`page-assets --update --base origin/main` 已写入。
- `pnpm boundary:check`：72 个包、`errors: []`，没有向 `PLUGIN_MODULE_IMPORT_ALLOWLIST` 或任何名单加条目。`pnpm secrets:check` 通过。
- `check-health-gates.mjs --base origin/main` 通过，数字对 merge-base：巨大单元 126 → 124（`createCharactersPlugin`、`start` 两个函数）；浏览器脚本里的空 catch 128 → 127；`*_SCRIPT` 文本常量 127 → 126（改名，见上，不是脚本已变成 TypeScript）；直接 `fetch` 63 → 61；插件在自己包外被点名的文件 `characters#outside-files` 11 → 10（总数 367 → 366）；`as unknown as` 177 → 176。其余数字不变；`--update --base origin/main` 已刷新本地快查。
- 没验证：真实浏览器里角色页的点击与导入流程、真实 Home、其他机器；原生 CLI 执行没有重跑（`characters-native-execution` 用的是测试替身）。

### W5-01 Characters 换宿主装配、删插件（CHR-1，2026-10-22，③；分支 `migrate/characters-chr1`）

状态：本地实现与定向验证完成，待评审与集成批次全量（改了 contracts 与 Module，算共享核心）。这是 Characters 迁到宿主的第二片：CHR-0 把处理器搬进 `modules/characters`，这一片换掉装配，删掉插件包 `plugins/native/characters`。用户批准的裁定 D1～D5 见迁移线笔记 `characters-into-module-plan.md`。

- **搬了什么**：
  - 动作定义 `actions.ts` 从插件搬进 `modules/characters`。为宿主提供方逐个绑定的 `bindCharactersActions` 也在那里（`action-bindings.ts`）：只服务本人，别的调用方是 `actions.owner_mismatch`；写之前先做本次调用的检查，再把检查交给处理器。
  - 宿主在 `characters-host.ts` 的 `charactersActionProvider` 里给每个项目登记 Characters 提供方：草稿在 Home，发布进本项目的成果库，写成果时用本次调用的调用方。
  - 页面的门在 `apps/local-host/src/characters-http.ts`：原来插件的 14 个地址不变，每个地址经项目的动作目录调用本人的 Characters 动作。请求提前结束，就取消这次调用。
  - 界面（`ui.ts`、`import-ui.ts`、`styles.ts`）搬到 `apps/workbench/src/characters/`。浏览器程序改写成 `apps/workbench/src/browser/characters/` 下的 TypeScript，由 esbuild 打成 `dist/characters-client.js`，不再是 `_SCRIPT` 文本。
  - 设置 › 角色是宿主自己的一节（`HOST_SECTIONS`，AI 组，`order: 35`）。成果库对 Characters 生产方的声明由工作台的 `HOST_ARTIFACT_PRODUCERS` 给出，宿主检查写入时与内置 Manifest 同等对待。
  - 删掉的：监督器条目、目录条目、生成的插件登记、插件包、锁文件与 workspace 登记里的条目；冻结名单与混合插件名单去掉 characters。
- **裁定**：
  - D1：提供方仍是 `io.molis.work.characters`，`kind: "plugin"`。合同里只有 `system`、`plugin`、`mcp` 三种，等有 Module 提供方的种类再改（BL-378）。
  - D2：已有项目库里 Characters 留下的安装记录，不在产品代码里处理，作为一项维护写进 `docs/releases/CHECKLIST.md` §4.3 维护八。
  - D3：设置 › 角色是宿主的一节，不再能按项目隐藏。
  - D4：发布的 `producer_plugin_version` 是 `PRODUCT_VERSION`。
  - D5：客户端仍发在 `/assets/molis-work-plugins/characters.js`，体积只许变小。这个名字不准确，记在 BL-378。
- **对外不变**：19 个 `characters.*@1` 的 id、版本、schema、受众、权限、提供方 id 与 MCP 工具名都不变。`pnpm actions:update` 只把这 19 行从 `actions.tsv` 挪到 `host-actions.tsv`，各列哈希一致。页面地址与路径也不变。
- **行为变化**（PR 里逐条写明）：
  - 门的状态码改用共同的动作错误映射：`characters.not_found` 由 404 改为 400；没带错误码的异常是 500 `actions.execution_failed`；不是对象的请求体是 400 `actions.input_invalid`；非本人是 403 `actions.owner_mismatch`。页面够得着的拒绝原来靠插件把无码错误一律映射成 400，现在都带码，仍是 400：宿主里导入、文件预览与原生启动的拒绝（越界路径、过期的扫描、不支持的来源、缺任务、原生终端未接通等），Module 里发布核对、文件预览与 Agent 动作校验的拒绝，都是 `characters.invalid`；`runs` 找不到角色是 `characters.not_found`。经 MCP、工作流调用时它们原来是 `actions.execution_failed`，现在带 Characters 自己的码。Module 里「导入服务、能力目录尚未接通」两处装配缺口仍无码（宿主总会给，走不到）。
  - 发布读取改走宿主成果库的 `getArtifactVersion`，不再兜底过程项库。发布前仍检查这个 id 没被过程项用过；用过时是 400 `characters.invalid`（原来经插件的成果客户端是 `artifacts.plugin_incompatible`，也是 400），宿主不为此引入 Artifacts 插件的错误码。
  - `character` 不再出现在 `hostReferenceKinds()` 里。
  - Characters 安装带来的 8 个 `sdk.artifacts.plugin-install-…` 动作消失。
  - 项目里不能再隐藏角色：`DELETE /api/settings/projects/<项目>/plugins` 带 `plugin_id: "characters"` 返回 400。
  - S-18 的测试名改成宿主写成果。
  - 全局集合目前已经含 `artifact:*`，按提供方限定在 PG-007 第 4 阶段做。
  - 公开 API 快照 `contracts/modules/characters` 新增 `CHARACTER_ARTIFACT_PRODUCER` 与 `characterArtifactPreviewAction`：原来在插件的 Manifest 与 `artifact-preview.ts` 里，现在由合同给出，供宿主的生产方表与 Module 共用。

#### 验收（RAC-70～74）
- **RAC-70**：Characters 不再是插件：磁盘上没有 `plugins/native/characters`，监督器、目录与生成的登记里都没有它。宿主登记的提供方 `io.molis.work.characters` 恰好带每个 Characters 动作，冻结名单与混合插件名单不含它。`tests/builtin-plugin-assembly-gate.test.ts`、`tests/characters-actions.test.ts`、`tests/characters-action-handlers.test.ts`（RAC-68 那条改读 `host-actions.tsv`，并断言 `actions.tsv` 没有 Characters 行）。
- **RAC-71**：门的每个地址都调用本人的 Characters 动作。页面离开就取消这次调用，原生启动没有迟到的副作用。错误照动作给的码回答：缺草稿 400 `characters.not_found`，非对象请求体 400 `actions.input_invalid`，过期修订 409，导入预览的越界路径与伪造候选 400 `characters.invalid`。`tests/characters-publication-http.test.ts`、`tests/characters-native-execution.test.ts`、`tests/characters-import-http.test.ts`。
- **RAC-72**：发布经宿主成果库按本人写入，生产方版本是 `PRODUCT_VERSION`。调用方在 `beforeWrite` 之后消失的，这一次的成果写入被拒（S-18）。`tests/characters-publication-http.test.ts`、`tests/security-invariants-plugin-original-caller.test.ts`。
- **RAC-73**：设置 › 角色是宿主的一节，项目隐藏不了（`DELETE` 返回 400），设置目录里没有 Characters 插件项，「角色」排在助理与提示词之间。客户端是打包的 TypeScript，不超过 29988 字节，没有 `_SCRIPT` 文本。`tests/plugin-global-settings.test.ts`、`tests/project-plugins.test.ts`、`tests/characters-appearance.test.ts`、`tests/characters-action-handlers.test.ts`（RAC-69 那条读 `src/browser/characters/`）、`tests/page-assets-budget.test.ts`（宿主自己的客户端也算发出的包）、`pnpm page-assets:check`。
- **RAC-74**：项目库里留着旧 Characters 安装记录时，宿主不启动它也不改写它，设置 › 角色照常列出本人的草稿。`tests/cross-plugin-recovery.e2e.test.ts`（浏览器用例，本机不跑，交给 CI）。

#### 证据（2026-10-22）
- 构建：这台机器上 local-host 的 Swift 步骤失败（CLT 16.2），所以逐包构建 contracts、ui-host、coding、`module-characters`、workbench（含 esbuild 打的 `characters-client.js`）与 local-host 的 `tsc`，再写构建清单。
- 定向用例（`--jobs 2`，不含浏览器用例，没跑全量）：
  - 合并 main 之前：从 `affected-tests` 列出的相关文件里选 112 个，102 个通过。失败的 10 个里，6 个由本片引起，改完重跑通过；另 4 个与本片无关：两个缺本机 Swift 产物 `native/computer/bin`，两个的失败落在本片没动的文件上。
  - 合并 origin/main `4591a1484` 之后：14 个文件全部通过，含动作快照 25/25、S-18 17/17，以及 main 新加的 `coding-work-executor`、`plugin-ui-invalidate`。
- 门禁：动作快照、`boundary:check`、§5.1 包清单（71 个包）、页面资源与 health 门禁都对 merge-base `4591a148` 通过；`secrets:check` 扫了 1830 行，没有发现。RAC-74 的浏览器用例交给集成批次。

### W5-06 第 2b 片：视图声明分组、新建、首页起点与设置图标（PG-060，2026-10-23，②；分支 `feat/w5-06-manifest-placement`）

状态：已实现，待评审与集成批次（改了 contracts 与插件 SDK，算共享核心；本机只跑 dev 构建与两份快照，相关用例交给批次，见开发优先阶段的规则）。叠在第 2 片（#1087）上。

- **合同**（`packages/contracts/src/platform/ui.ts`，都可选）：`UiViewDeclaration` 加三项。
  - `group`：插件切换列表里的分组，取 `UI_VIEW_GROUPS`（`advance`、`make`、`personal`、`research`、`code`）之一。组名（推进、写与做、个人、研究、编码）和顺序归宿主；骨干（Goals、Inbox、Feed、Sessions）照旧由宿主排在第一组的标题下。
  - `creates`：`{ station, title }`，目标材料里的新建入口。`station` 是本 Manifest 里一个能新建的工作流内容站；新建的默认标题是「未命名」加 `title`。
  - `start`：`{ title, hint, icon? }`，项目首页当天没有事件时的一个起点，点了打开这个插件。
  - 设置页图标用已有的 `icon`：`settings` 视图的 `icon` 就是设置目录里这一页的图标。
- **校验**（`packages/plugin-sdk/src/view-placement-declarations.ts`，接在 `parsePluginManifest` 的视图检查之后）：`icon`、`start.icon` 不是图标名；`group`、`creates`、`start` 用在 `navigator`、`island` 以外的槽；不认识的组；`creates` 缺 `station` 或 `title`、不是对象、指向本 Manifest 没有的站或不能新建的站；`start` 缺 `title` 或 `hint`、不是对象。每一种都拒绝，提示写明视图与字段。
- **工作台**：
  - 外壳的分组表删掉，按视图的 `group` 分组，宿主只留 `RAIL_GROUP_LABELS`（组名）；没写分组的插件在「更多」。组内先是个人岛（灵光，`island`，`group: "personal"`，照旧排在「个人」第一个），再是目录视图，按视图的 `order`、同 `order` 按插件 id（`UiViewRegistry` 的排法）：Workflows（25）在 Schedule（35）前面，成果库与图片都是 60，成果库在前。这与 main 上画出来的一样：旧表里的 id 只决定成员，组内一直是注册表的顺序。
  - 设置图标表删掉，按 `settings` 视图的 `icon` 取，宿主不认识的名字和没写的都用 `settings`；按地址直接打开的设置页同样取到。原来表里 Pages、Form、Dataset、PPT 四行没有对应的设置页，一起删。
  - 新增 `creatableKinds(enabled)`、`homeStarts(enabled)`（`apps/workbench/src/plugin-catalog.ts`）：只列本项目显示的插件，先是目录视图（按 `order`），再是个人岛；与切换列表不同，切换列表里个人岛排在组首。页面还没改读它们：`goal-inputs-html.ts` 的新建表、`scripts/client/placement.ts` 的默认标题表、`scripts/client/project-home.ts` 的起点表由 ③ 接上后删（BL-387）。新建入口的顺序会从手写的 Pages、PPT、Form、Dataset 变成声明顺序 Pages、Form、Dataset、PPT。
  - 内置插件的声明照原来的表写：Schedule、Workflows 是 `advance`；Pages、Form、Dataset、PPT、Images、成果库是 `make`；灵光、Todo、Jelly、Cognia 是 `personal`；Alchemist 是 `research`；Coding 是 `code`。Pages、Form、Dataset、PPT 声明 `creates`；Goals、Pages、灵光声明 `start`；Shelf、Coding 的设置视图声明 `icon`。
- **顺带**（#1087 评审建议）：声明舞台里不起作用的 Text Stats 分支删掉（它的贡献没有 `workbench` surface），外壳不再传 `developerMode`；`tests/declared-stages.test.ts` 的点名清单补上 Alchemist，并钉住 Feed、Inbox 的舞台用的是页面视图的数据；`docs/system/RUNTIME-MIGRATION.md` 第 5.1 节不再点名已删的函数。第 5 条（隐藏创作台的项目里直接打开预览地址，落到不存在的舞台上）不归这一片，记 BL-369。
- **对插件作者**：三项都可选。不写 `group` 的插件在「更多」；设置视图不写 `icon` 的用 `settings`；不写 `creates`、`start` 的插件不出现在新建入口和首页起点里。已有 Manifest 不用改；写了的照上面的规则校验。

#### 验收（RAC-75～78）
- **RAC-75**（W5-06-PLACE-01）：每一种写错的分组、新建、起点与图标声明都被 `parsePluginManifest` 拒绝，提示逐字一致；三项都写对、都不写、写在 `island` 上的都通过；全部内置 Manifest 通过。`tests/view-placement-declarations.test.ts`。
- **RAC-76**（W5-06-PLACE-02）：插件切换列表的组标题依次是推进、写与做、个人、研究、编码、更多；每个插件都在它的视图所写分组的标题下，没写的在「更多」（如 Files）；各组成员与删掉的表一致，组内顺序钉成显式列表：推进是 Workflows、Schedule，写与做是 Pages、Form、Dataset、PPT、成果库、图片，个人是灵光、Todo、Jelly、Cognia。`tests/view-placement-declarations.test.ts`、`tests/characters-appearance.test.ts`。
- **RAC-77**（W5-06-PLACE-03）：设置目录里 Shelf、Goals、Coding 的图标是各自设置视图的 `icon`（library、workflow、code）；按地址打开、项目没显示的插件的设置页也取到；视图没写宿主认识的图标的页用 `settings`。`tests/view-placement-declarations.test.ts`。
- **RAC-78**（W5-06-PLACE-04）：`creatableKinds` 按目录视图的 `order` 给 Pages、Form、Dataset、PPT 的站与名称（文档、问卷、数据表、演示稿），`homeStarts` 给 Goals、Pages、灵光的起点（标题、提示、图标与 ③ 的手写表一致）；两者都只列本项目显示的插件。`tests/view-placement-declarations.test.ts`。

### W5-06 第 3 片：项目级 Runtime 实例的舞台由运行中的实例画（PG-060，2026-10-23，②；分支 `feat/w5-06-project-stages`）

状态：本片评审修复、真实浏览器与定向验证通过（2026-10-23，Codex 接续）；已同步第 2b 片（#1098）的最终验证提交，整批全量仍待集成，不代表 W5-06 全部完成或用户验收。

- **宿主**（`apps/local-host/src/project-plugin-stages.ts`）：项目的 Runtime 跑的内置插件里声明了舞台的（Form、Dataset、PPT、Pages、灵光、Workflows、Schedule），舞台用运行中实例的视图画，并按打开舞台的贡献 id 报给外壳（`plugin_stage_ids`），工作台不再从构建目录画第二份。没在运行的（被停、启动失败、项目库被拒、整个平台没起来）在同一个舞台画不可用占位（`data-project-plugin-unavailable`，写明原因）；实例在运行却没有这个视图，或画的时候抛错，也画占位，后者另写日志。Home 级插件（含双实例插件）仍归 Home 那条路径（`renderHomePluginStages`）。
- **占位文字**（本轮评审修复）：项目级与 Home 级舞台的固定标题、原因和操作提示走当前请求的 `L()`，英文词条纳入既有工作台词典；外部错误仍转义显示。项目实例在运行但没有贡献时明确说未提供页面，不报成未运行；Home 实例运行却没有视图也不报成停用。不新增状态页或链接，项目状态与重启入口仍属 BL-430；不调整 `stageModels` 的排版或巨大函数行数。
- **真实占位修复**（RAC-79 浏览器发现）：原先宿主生成的占位 HTML 被外壳当成插件贡献送入 frame；停止实例没有有效 activation，`POST /api/host/plugin-pages` 正确拒绝，因此人看到通用加载失败，读不到占位。宿主现在把不可用状态作为结构化显示数据（surface、label、reason、scope）交给工作台，由工作台转义后绘制静态占位，不申请页面授权、不执行插件客户端。正常贡献仍走原 sandbox frame；不根据插件 HTML 可伪造的标记改变隔离，不增加状态存储，不放宽停止/撤权后的页面或动作拒绝。
- **启动名单**（`apps/local-host/src/project-plugins.ts`）：内置条目移进 `projectPluginEntries`，在创建平台之前记到 `ProjectPluginState.plugins`，平台整个没起来也认得出该画占位的插件。没有 Home 目录时，除 Schedule 外这几个实例不启动，舞台照旧由工作台按目录画。
- **模型**：渲染器给 `declaredStageModel`（Feed、Inbox、Schedule 用页面视图里的数据，其余给共用原语），外壳与宿主用同一份，外壳自己的兜底删掉；`declaredStageContributionId`（`apps/workbench/src/declared-stages.ts`）给出插件在主区的舞台贡献，两边共用。
- **次序**：这几个舞台在舞台池里从外壳声明的那段挪到宿主那段；舞台池是隐藏的，次序不影响显示。

#### 验收（RAC-79）
- **RAC-79**（W5-06-STAGE-01）：项目页里 Form 的舞台只有一份，实例在运行时可用（有「新建问卷」）；停掉实例后，同一个舞台是不可用占位，没有 Form 的界面，不从构建目录补画；重启后恢复可用，占位消失。`tests/runtime-plugin-http-discovery.test.ts` 同时验证中英文请求中的固定占位文案、运行实例缺少贡献的准确原因，以及 Home 舞台占位的请求语言。定向验证运行该文件、`tests/i18n.test.ts` 与相关 Home 语言用例；整包构建后检查 API、边界、health 和页面资源，真实浏览器验证宿主占位可见且没有 Form 编辑控件，重启恢复 frame 并能创建持久化问卷；S-47 回归同时拒绝停止实例的页面授权和旧页面动作，并证明插件伪造占位标记仍在隔离 frame 中。 本轮 RAC-79 三项通过；page-authority、Home private-store、Workbench UI 与 deferred-clients 四文件共 34 项通过（deferred 一项首次导航超时，原样定向重跑通过）。整体构建、API、边界及 merge-base health 通过；27 项页面资源仍为 7,811,882 B，无增长。其余包级必跑清单随统筹的下一批集成 full 验证。

## 0. 现场与范围

- **基线**：第一步最终 main。第一步全量回归基线见 [post-merge-review §7.1](../archive/post-merge-review/spec.md#71-回归基线)；能力快照见 [§7.2](../archive/post-merge-review/spec.md#72-能力快照)；跨功能场景清单见 [§7.4](../archive/post-merge-review/spec.md#74-跨功能场景清单)。
- **范围**：全仓 71 个 workspace 包（2026-10-08，`scripts/workspace-packages.mjs` 的 `WORKSPACE_PACKAGES`：`apps` 6、`horizontal` 8、`modules` 13、`packages` 10、`plugins/native` 26、`plugins/official-integrations` 6、`server` 1、`tooling/plugin-cli` 1）。开工时是 73 个，`modules/execution` 与 `modules/evidence-verification` 随 #268 删除；2026-10-10 实验插件删除（`plugins/native/experiments`）后曾为 70 个；Issue 加入后恢复为 71 个，`plugins/native` 26（I6 `af0fe957` 的登记表与代码重算）。每个包都至少做一次结构审查，交出 §5 的包级清单。
- **在途的其他线**（开工前要重新核对）：`feature/side-shelf`、`feat/plugin-picker-pins`、`docs/archive-project-arrival-flow`、`feature/fix-project-management-freeze`（另一工作树）、Codex 工作树 `~/.codex/worktrees/d62d`。

W5-01 流式路由（a）（2026-10-17，Codex 接手继续，未验收）：保留已实现的 Runtime 路由、Home 项目身份与统一动作目录，补齐 Host 的 NDJSON 传输。仅声明 `stream: "ndjson"` 的 POST 路由启用；插件只发进度，Host 写唯一的结果或错误末行。单行至多 65,536 字节、进度至多 10,000 行且合计 1,048,576 字节，超限取消并返回 `actions.output_invalid`。按已接受的交接方案，单路由显式声明的请求体最大值为 36,000,000 字节，未声明的默认上限不变。项目与 Home 共用传输，断连、停用或撤权后结束等待，晚到的处理器不得写业务记录；实例观察器在成功、失败和取消时释放。进度单独传入动作客户端，保持 Host 发出的执行控制对象身份不变。

范围为 contracts、plugin-sdk、plugin-runtime 与 local-host 的路由、模型文本进度及配套测试、开发手册和 S-03；不迁业务插件、不改真实 Home、不改页面资源或门禁上限。先在隔离 Home 上验证真实 HTTP 和写入拒绝，再按机器槽位整体构建、跑相关包要求与安全回归；共享核心全量交统筹的 CI 标签链。验收与验证记录如下。

2026-10-17 接续整合：按用户「直接接续，不浪费时间」继续本片，四个流式路由提交已重放到 Todo #684 的最新候选 `8738385e3`，未改动本片业务实现；唯一冲突为本 spec 的整线状态句，保留最新状态。已开草稿 PR #703，以 Todo 分支为基线仅展示本片差异供审阅，保持 Todo → 流式路由的合入次序和至多两片在途。Todo 合入后再移到实际 main，改 PR 基线并交正式 CI；不加标签、不自行合并。整体与 workspace 构建、merge-base health、boundary、API 和资源检查已通过，25 项资源共 7,479,372 B，与 Todo 候选相同；当前组合的包要求与安全回归 162 个非浏览器文件全部通过（1,538 条通过、1 条原有沙箱环境跳过）；插件作者从打包 SDK、CLI 脚手架到安装后的真实 Chrome 成果与私有界面用例 1 条通过，共 163 文件、1,539 条通过、1 条跳过、无失败。共享核心全量仍由统筹在 CI 排。

迁移前核对灵光的模型调用发现，现有 `services.model` 没有传递文字增量，会丢失现有的生成中预览。本片补可选的 `PluginModelRequest.onText(delta)`，Host 只把现有模型端口的 `text-delta` 传给它；Runtime 每次同步核对本次调用与安装仍有效、请求未取消，模型请求结束后关闭回调。插件仍负责把文字转换成自己的动作进度，不改模型提示词、配置、限额或业务存储。新增公开入口测试验证顺序、非文本事件过滤、取消/撤权/停用/模型结束后的拒绝与无晚到业务写入，随后重跑受影响的模型、动作与 Runtime 包回归。

### W5-01 流式路由验收

| 编号 | 场景与必须成立的行为 | 本地证据 |
| --- | --- | --- |
| RAC-20 | `W5-01-STREAM-01`：真实动作进度先于唯一结果或错误末行；JSON 路由不获得 emit；Home 路由的可信项目身份保持；模型文字增量按原顺序交给插件，非文字事件不转发 | 路由：`tests/security-invariants-plugin-route-stream.test.ts`、`tests/security-invariants-home-route-project.test.ts` 通过；模型：`tests/security-invariants-plugin-model-progress.test.ts` 通过 |
| RAC-21 | `W5-01-STREAM-02`：Manifest 拒绝非法 stream 和请求体上限；36,000,000 字节可进入，超一字节在处理器前以 JSON 413 拒绝 | `tests/security-invariants-plugin-route-stream.test.ts`、`tests/plugin-declaration-rules.test.ts`，通过 |
| RAC-22 | `W5-01-STREAM-03`：伪造末行字段被丢弃，插件在拒绝里写的 `call_id` 也是（流与 JSON 两个出口只带 Host 记录的号）；单行、行数和总字节超限均取消且只出一个错误末行 | `tests/security-invariants-plugin-route-stream.test.ts`，通过 |
| RAC-23 | `W5-01-STREAM-04`：Home 与项目流在断连、停用、撤权和升级后结束；原处理器仍被阻塞时连接已结束，释放后业务写入被拒；恢复后存储无晚到数据；模型文字回调在取消/停用/撤权/请求结束后拒绝 | 路由：`tests/runtime-plugin-http-discovery.test.ts`，8 种真实 HTTP 中断通过；模型：`tests/security-invariants-plugin-model-progress.test.ts` 通过 |
| RAC-24 | `W5-01-STREAM-05`：反复成功、抛错、取消、停用后计时器均回到零；停用后 emit 当场拒绝 | `tests/plugin-route-stream-lifecycle.test.ts`，通过 |

2026-10-17 灵光实接发现的 RAC-23 缺口：`supervisor.revoke()` 已返回而 Runtime 的停止仍在队列里时，同步文本回调原先仍能通过。停止请求现在同步撤销当前 activation 的 grant 与动作注册，清理 hook 保留原上下文并按原队列执行；不新增生命周期状态或绕过串行队列。`security-invariants-plugin-model-progress.test.ts` 的 `supervisor-revoke`、`stop-request` 在任何 await 之前断言文字被拒，并验证迟到结果不写业务记录及重新启用可恢复。 整体构建、23 个相关文件 481 条用例与 merge-base health 通过。

本地定向验证：整体构建通过；上述 4 文件 27 条，加 Home 平台、Home 模型生命周期、共同路由操作与 SDK 路由适配 4 文件 23 条，共 8 文件 50 条通过。构建搬迁后失效的 Swift PCH 缓存已在本工作树内清理并重建。公开 API 快照、包边界和页面资源预算检查通过；另跑相关包 README 要求与安全集共 150 个非浏览器文件：149 个初次通过；`plugin-declaration-rules` 的两条旧 12 MiB 断言按已批准合同改为 36,000,000 与超一字节后，整文件 265 条通过。该批最终 1,416 条通过、1 条沙箱环境用例按既有条件跳过；插件安装浏览器用例 1 条通过。merge-base health 与快查基线更新通过，无门禁数字增长。共享核心全量尚未由 CI 验证，本片未完成合入验收。

本片复用 SDK 已有 `createExecutionLifetime` 取消等待，Home/项目均保留原执行控制对象。按 10-17 最终交接，浏览器统一读流器留到第三片灵光迁移，在 `ui-host` 的 `molisWorkRequest.stream` 接入，不在本片新增 Node SDK 读取器；当时同时删除灵光的旧解析器并按实测资源变化报批。

合入 Todo 的最新候选 `ce6d460108`（含 main `9626b24b1`）后，模型预览补齐并在真实 Host 的隔离 Home 中通过 8 条拒绝/交付测试；新测试归入 S-18 与安全回归。此次受影响的路由、模型、Runtime、授权和 Todo/Form/Characters 消费路径共 36 个文件、589 条通过；补验安全文档 1 条通过。命令里一度写了不存在的 `todo-ai-assist` 文件，已换成仓库实际的 `todo-organize` 与 `todo-actions`，无产品测试失败。整体与工作台构建、boundary、公开 API、merge-base health、25 项页面资源预算通过；没有新增页面资源。前一批 150 文件与浏览器验证仍作为此前路由实现的证据，共享核心最终组合全量由 CI 验证。

### W5-01 材料服务前置片（2026-10-17，实施中）

2026-10-17 接续整合：材料候选的实现与编号提交已重放到流式路由候选 `7a4c2c04a`，保留 Todo 与流式路由的现行实现、S-32 / S-33 及各自验收记录。S-13 同时保留主线对象引用题说明与材料来源说明，材料使用用户指定的 S-34。本片仍仅本地准备，不增加第三个在途 PR；新在途 #699 也声明 S-34，编号归属须在材料开 PR 前交用户转达统筹协调，当前不改动其他线。此次只整合已有实现，产品源码增删与原材料提交一致。整体与 workspace 构建、API 重生成（无额外差异）、boundary、merge-base health、资源检查通过；25 项资源共 7,479,366 B，较流式路由少 6 B。当前包要求、材料消费者与完整安全清单 181 个非浏览器文件全部通过（1,688 条通过、1 条原有沙箱环境跳过），真实 Chrome 插件安装用例通过 1 条，合计 182 文件、1,689 条通过、1 条跳过、0 失败。完整安全表与材料权限/下载/撤权拒绝均已通过；下方旧基点缺 S-32 的记录仅保留为历史结果。共享核心全量与最终 main 组合仍待 CI 验证。

目标是让 Host 执行的 Runtime 插件在自己的并发动作里调用平台已有的材料读取口，达到功能可用；本片不迁灵光的装配和浏览器流读取器，不搬真实 Home 数据，不新增材料存储。`contracts/services/materials`、`material-extraction.ts` 是材料提取的事实与实现来源，Shelf、Artifacts 和项目上手已共用；不能因旧包装文件带 Jelly 前缀就把它归给 Jelly。

用户决定的经过：第一次询问错误地把已有实现说成 Jelly 的代码，用户据此前提选择归 Jelly；核对上述共同入口并更正前提后，用户选择「照现状归平台（推荐）」。因此本片给 `PluginHostServices.materials` 接现有平台能力，保留 `{home}/lingguang/models` 缓存位置，在 `HOME-DATA.md` 写清归属，搬目录作为后续维护。

合同与边界：`materials:read` 只给 `extract(source, options)`，输入为文件名与已授权字节，不接受路径；`materials:fetch` 只给 `readSource(url, options)`，沿用公开地址、DNS/重定向和容量限制。两项独立声明；沙箱定义与升级预检拿不到服务。运行时从 `currentPluginAction()` 取安装、动作、调用者、取消与授权，不接受插件传入身份，要求自己安装的并发动作声明对应权限，每次外部副作用前与结果返回后重查。`allowModelDownload` 只有可信 `caller.audience === "user"` 且明确为 true 才传给底层；其余来源按 false，不因为业务参数中写了身份而放行。

上传检查只在 SDK 的 `decodeMaterialUpload` 实现：文件名、支持格式、规范 Base64、非空与 25 MiB；Host 和插件共用。公开来源读取实现去掉 Jelly 前缀，错误由材料服务拥有；灵光现有调用方同步识别 `material.model_required`。已有文件/来源提取结果的业务形状保持，缓存与原生 helper 位置保持。生产调用链核对显示旧 `extractJellyMaterial` / `readJellyMaterialSource` 只被灵光使用，不保留无人消费的 Jelly 错误转译层。现有来源解析测试保留文件名以保留逐文件内部引用预算，内容与用例名改成平台语义；不为重命名增加公开 API 或门禁例外。

允许修改：contracts 的材料与插件服务合同、SDK 上传工具、Runtime 的材料权限绑定、Host 材料入口与服务装配、灵光当前材料调用与错误识别、对应测试/手册/Skill/安全表和 API 快照。错误主人新增路径仅登记新增的 SDK 工具，不改变已有文件的主人。原生格式提取与业务内容转换不重写。改合同后整体构建、API 快照、包 README 要求的相关测试、安全集、boundary/health（对 merge-base）、页面资源实测；全量由统筹在 CI 排。

| 验收编号 | 应有行为 | 证明方式 |
| --- | --- | --- |
| RAC-25 | 服务按 read/fetch 分别暴露；未声明、撤权、沙箱、启动/路由/外来安装、串行动作不能调用 | `tests/security-invariants-plugin-materials.test.ts`，正式 Runtime 与拒绝断言 |
| RAC-26 | 只有 user 的明确同意允许模型下载；agent/mcp/workflow/plugin 带 true 仍不下载 | `tests/security-invariants-plugin-materials.test.ts`，记录传给真实服务端口的选择并验证缺模型拒绝 |
| RAC-27 | 取消、停用、升级、撤权与动作结束后，材料返回与业务写入均被拒绝；外部请求前重查 | `tests/security-invariants-plugin-materials.test.ts`，制造等待交错并检查调用数与持久化结果 |
| RAC-28 | 上传检查唯一且拒绝路径、坏扩展名、坏/非规范 Base64、空内容与超过 25 MiB；合法材料仍可提取 | `tests/material-upload.test.ts`、现有材料提取用例 |
| RAC-29 | 公开来源地址、重定向、解压容量与各来源解析行为保留；现有灵光路径使用平台错误 | 现有 `tests/jelly-source-providers.test.ts` 与材料/灵光回归 |
| RAC-30 | 服务只读文件名与字节；模型缓存位置不变且授权失效后没有下载或业务记录 | 材料集成拒绝测试、HOME-DATA 记录与实际 diff 复核 |

当前证据（2026-10-17，Codex）：材料服务已接入项目与 Home 两种执行器；合入 main `9626b24b1` 后整体构建和工作台构建通过。9 条实际 Runtime/Host 服务测试通过，覆盖五类调用方的下载授权、按权限暴露、沙箱/预检、外来安装/过期调用，以及取消/停用/撤权/升级后的零业务写入。相关包 README 要求、安全集与实际材料消费者共 170 个非浏览器文件，169 个通过，唯一失败为 `security-invariants-doc`：S-33 前面缺等待 #681 的 S-32；merge-base health 同样仅此一项失败，不通过填空行或改门禁跳过。插件作者从打包 SDK、CLI 创建项目、安装到真实浏览器成果和私有 UI 的用例通过。SDK 上传边界与来源拒绝、现有材料和灵光回归通过；灵光脚本减少 6 B，page-assets、boundary 通过。前序合入后同步并复验安全表；全量待统筹在 CI 排，尚未开 PR。RAC-25–30 不替代整线 RAC-01–19 的最终裁决。

### W5-01 灵光迁到项目 Runtime（2026-10-17，实施中）

2026-10-17 接续整合：按用户继续推进后续工作及启用本会话 Goal 的要求，将本片三个独立提交重放到已验证的材料候选 `17c99cef1`，旧分支保留可恢复引用。业务源码增删与原实现 `fa0348ed5` 一致；安全表保留主线 S-32/S-33 与用户指定的材料 S-34，仅将灵光实现位置改到插件。已批准的 workbench.js +2,231 B 按材料候选的 1,109,330 B 起点重定为 1,111,561 B，既有耗用起点全部保留并追加 Todo 的 1,109,302 B；整体/workspace 构建、boundary、对材料基点的 merge-base health 与快查下调已通过，API/动作快照重生成无额外差异。资源实测 25 项共 7,480,872 B，对材料基点门禁通过，保持原批准额度。当前组合 150 个非浏览器文件全部通过（1,433 条通过、1 条原有沙箱环境跳过），9 个真实 Chrome 文件全部通过（41 条），合计 159 文件、1,474 条通过、1 条跳过、0 失败；完整安全表与原来缺号的文档断言均通过。下方初次实现与旧安全表缺号的运行记录保留为历史证据。当前只做本地整合，不增加第三个在途 PR；后续仍按实际合入顺序接 main，完整 CI 由统筹排。

本片接在流式路由/模型文字进度（RAC-20–24）与平台材料服务（RAC-25–30）之后，恢复现有灵光完整动线。按 §1 的 2026-10-10 决定，灵光每个项目一个 Runtime 实例；保留 Home 中 `lingguang/lingguang.db` 的基线 1、稳定 ID、项目分区、请求幂等、跨项目移动/复制、对话快照比较与项目删除清理。AI 仍使用原登记指令、所选灵光和历史，经同一个 Host 模型服务；文字先作预览，只有模型完成且原材料、调用权限仍有效才成对保存消息。失败、取消、停用、撤权和重启均不留下半轮消息。

实现边界：插件提供 `createLingguangPlugin`、数据库声明与 Manifest 路由，经 `project-plugins.ts` 的监督器装配。存储改用读端口和带 `beforeEffect` 的 Runtime 事务；独立连接只供现有维护/测试入口，SQL、表、数据归属不变。模型接 `services.model`，读取上传/链接分别接 `services.materials.extract` / `readSource` 与 SDK 的唯一上传解码器；动作补上对应材料权限，既有 id、输入输出和提供方不变。工作流内容处理器走当前实例的共同动作客户端；先由原调用的 `retainAuthority` 核对目标业务动作的权限与限定名单，后续写入持续检查该授权及原调用控制，不能借实例自己的授权扩大原调用范围。删除 Host 的灵光专属动作/HTTP 适配、插件的旧路由表与流封装，现有 `/api/lingguang` 停用；页面改用项目下 `/api/plugins/io.molis.work.lingguang/sparks…`，业务参数中的异项目身份仍拒绝。

浏览器统一读流器在 `ui-host` 的 `molisWorkRequest.stream` 实现，继承共同请求器的同源、令牌、一次性键和取消控制。按 UTF-8 与跨块分行解码，只向调用者发进度，以唯一结果/错误末行结束；非成功 HTTP、无末行、无效行与中途断开均失败。灵光删除自己的 `postStream`，保留编辑输入、生成中预览、模型下载同意与可恢复错误。空白灵光离开时的软丢弃、版本冲突、工作台导航/刷新与保留输入行为保持。页面资源已实测并获用户批准（2026-10-17 弹窗答「放行这 2,231 字节（推荐）」）：以 Todo/材料前置为基准，workbench.js 1,105,181 → 1,107,412（+2,231 B），lingguang.js 26,110 → 25,385（−725 B），合计 +1,506 B；门禁只在这个起点放行一次，前置实际合入后重新核对起点，不增加额度。不开新的业务页、不动真实 Home、不改提示词、不迁其他插件。

允许修改：灵光包、上述 Host 装配/路由删除、ui-host 请求器与其 UI 合同、工作台目录的路由基址、受影响测试/开发手册/安全表/动作与 API 快照、包清单判定。共享核心全量由统筹在 CI 排；本地先整体构建，跑包要求、真实 HTTP 与浏览器用例、boundary、merge-base health、actions/API、资源与 secret 检查。和 #661 的 `project-host.ts` 改动位于不同注册段；合入时按最新 main 复核。页面资源沿既有批准流程处理；材料服务 S-34 随前序同步 main #681/#695 的既有安全编号后复验。

| 验收编号 | 应有行为 | 证明方式与状态 |
| --- | --- | --- |
| RAC-31 | 唯一 Runtime 装配；项目真实 HTTP 完成创建、编辑、列表、材料提取、打开/继续对话；旧路径 404，伪造项目被拒 | 新 Runtime 路由集成与装配门禁，`lingguang-plugin`、`lingguang-actions`、`lingguang-mcp` 通过 |
| RAC-32 | 原库与数据不变；请求幂等、移动/复制、版本冲突、搜索/工作流/MCP、项目删除保持 | 现有 store/actions/MCP/删除与内容回归，灵光动作、存储、内容与项目删除用例通过 |
| RAC-33 | 文件与链接读取经平台，五类 audience 的下载同意规则保持；提取不写灵光，36 MB 请求边界保留 | 真实 Runtime 材料与拒绝用例，材料读取及 SDK/Runtime 拒绝用例通过；前置材料服务 S-34 在同步含 S-32/S-33 的 main 后复验 |
| RAC-34 | 模型预览先到；模型失败/空回复/材料变化/取消/停用/撤权后无半轮、无晚到写入；恢复后继续可用 | 延迟模型、真实 HTTP 中断与数据库重开检查，停用、重启、调用者撤权及安装同步撤权通过；真实 HTTP 断连后迟到进度被拒，恢复轮正常保存并在重开库后可读 |
| RAC-35 | 统一浏览器流读取器处理跨字节/跨行块、唯一末行、HTTP/解析/中断错误与取消；控制头只给同源 | ui-host 单元与安全边界用例，6 条流读取用例、同源拒绝与 3 个浏览器公共请求文件通过 |
| RAC-36 | 真实页面创建、文件/链接读取、预览与对话、编辑冲突、空白丢弃、刷新/返回路径正常；页面资源按批准值 | 现有灵光/编辑/小体验浏览器用例与实测，灵光、内容编辑、小体验、产品体验及公共请求共 7 个浏览器文件 39 条通过；资源许可见上 |

本地阶段证据：整体构建与 workspace 构建通过；动作、材料、库、HTTP、MCP、内容授权与公共请求定向回归通过。第一批浏览器回归被本工作树重建干扰的三个文件已完整重跑，与公共请求等共 7 文件全部通过，另一个入口用例通过。路由快照按已声明的新 Runtime 地址更新后通过。merge-base health 仍有前置 S-33 等待 S-32 的明确依赖；本片不填占位行，也不放宽门禁。已合入前置 Runtime 的同步撤权修复；实际灵光 HTTP 的停用/重启/两种撤权和断连恢复全部通过，相关 HTTP 文件 15 条均通过。其余相关包与安全回归 100 个非浏览器文件中 99 个通过，唯一失败是上述安全表编号依赖；未用占位表行绕过。尚未开 PR，未做真实 Home 操作，未完成 CI 全量与人工体验验收。

### W5-01 Cognia 的平台前置与 Home Runtime 迁移（2026-10-17，本地定向通过，待前置合入与 CI）

2026-10-17 接续整合：平台前置与 Cognia 迁移已分两提交重放到最新灵光候选 `5df681d44`；原分支及 `feature/w5-01-cognia-before-sync-20261017` 保留旧引用。两片业务源码增删与原 `287bf0f7b` / `1df4b89d2` 完全一致。冲突仅保留现行安全表、灵光已完成的中断证据和各资源当前值，Cognia 客户端仍只减 260 B；用户指定的材料 S-34 已由前置带入，重复编号提交无新增差异。本组合整体/workspace 构建、API/动作快照、boundary 与对灵光基点的 merge-base health 通过，快查基线已下调；18 个独立定向文件 378 条全过。Cognia 客户端 −260 B，25 项资源共 7,480,612 B。随后在后台授权组合 `8a8518329` 上统一跑包要求、安全与相关消费者：198 非浏览器文件 1,803 条通过、1 条原有公网 npm 条件跳过；5 个真实 Chrome 文件 20 条通过。合计 203 文件 1,823 条通过、0 失败，覆盖导入、固定版本、审阅采纳、模型恢复和公开 SDK 安装。共同结果属于该组合，未单独重复全量；旧缺号失败仅是下方历史记录。尚未推送，按前序合入顺序接实际 main；全量仍交统筹 CI。

目标是保留现有知识导入、版本阅读、附件下载、引用生成、审阅和明确采纳的完整动线。Cognia 仍是 Home 个人知识的唯一主人，库路径 `cognia/cognia.db`、基线 1、稳定 ID、预览时限与幂等不变；不会读写真实 Home。采用现有 Home 监督器，不另建平台，不增加后台扫描或模型调用。

迁移前发现三处共同平台缺口，按 RUNTIME-MIGRATION §4.2 独立提交平台前置片，再提交插件迁移片：
- 原 Cognia HTTP 明确接受 45,000,000 字节，保留 32,000,000 字节原始文件批次的 Base64 JSON 上传；Runtime 声明目前封顶 36,000,000，直接迁移会拒绝原本可导入的合法批次。拟将**显式声明**封顶改到 45,000,000，未声明的项目 256,000 / Home 12 MiB 保持；仅 Cognia 导入预览声明 45,000,000，其他路由的声明保持原值或更小。用户 2026-10-17 弹窗已批准保留 32 MB 批次并将显式封顶升到 45 MB；按上述范围实施。
- `PluginRouteResponse` 已有 bytes/filename/mime，但共同 HTTP 只发 JSON。共同路径支持现有 bytes 合同，强制 octet-stream、attachment、nosniff、sandbox、no-store，保持 Cognia 原下载隔离；不让插件自选可执行响应头。流式路由仍只发既定 NDJSON。
- 模型可用性只给布尔状态，现有 Cognia 显示实际提供方与模型。`PluginModelClient.availability()` 补可选 `runtime_label`，由 Host 的既有配置选择读取，不解密凭据、不调用模型；缺模型或实例无效不泄露标签。执行仍在同一个 Host/Prologue 服务，原提示词、180 秒上限和用户指令覆盖保持。无模型的提示沿共享服务现有文案「请先在『模型设置』里连接文字模型」，错误码 `actions.connection_required`；Runtime 失败返回共同 `call_id` 供定位。

插件片把 `CogniaStore` 改成库端口，读用快照、写在 `database.transaction(caller.beforeEffect, …)`；目录扫描实现归插件，保留独立 `cognia:read-local-files` 权限、realpath/符号链接与批量限制，并在扫描后复核权限才存预览。动作目录和 25 个业务动作的 schema/id/version 不变，内嵌扫描/预览沿原调用身份执行。生成只读取固定版本、释放读操作再等模型、校验引用后受控保存草稿；取消/停用/撤权/删除领域均不得存草稿，只有明确采纳才存知识。知识角色文本移回插件的指令目录，同 owner/id/version/body 与覆盖键不变。

Manifest 声明现有各 HTTP 行为，客户端和仓库消费者一并改用完整插件 id 路径；删除旧原生路由、Host 动作/模型/目录适配和构建期舞台，保留目录元数据、样式与客户端。跨项目看到同一库，带项目的路由继续受 S-31 约束。工作台样式及交互结构保持；若资源实测增长，按具体差值再提批准，不预先提高预算。

#### 验收（RAC-37～44）

| 编号 | 验收 | 验证 |
| --- | --- | --- |
| RAC-37 | 显式体积上限按用户决定；缺省不变，超过声明一字节在执行动作前拒绝，原 32 MB 批次可上传 | SDK 声明用例、真实 Home/项目 HTTP 请求体拒绝；安全表 S-03 |
| RAC-38 | 普通 Runtime 路由按原字节下载，HTML/SVG 也只能附件；空字节、中文文件名、JSON/NDJSON 路径各正确 | 真 HTTP 下载及头部断言，安全表 S-03 |
| RAC-39 | 模型标签来自当前配置，切换/失效立即反映，发现不解密不请求；无授权/停用不返回标签 | Host 模型服务、Runtime 权限拒绝、受控模型配置用例 |
| RAC-40 | Home 只装一次，各项目同库；创建/改名/导入预览提交取消、阅读下载搜索和 MCP 同路径成功，项目旧路径 404（Home 未知 API 沿用公共 400） | Cognia actions/store/http、装配门禁与 MCP/导入消费者 |
| RAC-41 | 固定来源版本、导入与采纳幂等、预览冲突/过期和源文件不改；目录权限失效后无预览 | Cognia store/ai、内容授权、真实目录与 Runtime 中断测试 |
| RAC-42 | 生成预览草稿、明确采纳、有效引用、指令覆盖、180 秒模型选项保持；取消/失败/停用/撤权无晚到草稿，恢复及重开正常 | Cognia AI/Prologue 与延迟模型交错，重开库检查 |
| RAC-43 | 桌面/窄屏真实导入、阅读、生成审阅采纳与模型停用/恢复可操作，现有显示名保持 | Cognia 浏览器、model-ready、content-context 用例 |
| RAC-44 | 仅公共合同接入；库版本与形状未变、旧宿主接线删除；API/动作快照与资源/健康/包边界通过 | 分五部分，全部成立才算通过（2026-10-19 拆，QA-021；门禁部分与平台线对过）：① 只经公共合同接入、旧宿主接线删除：`tests/builtin-plugin-assembly-gate.test.ts` 的「RAC-44: the Host keeps no Cognia wiring of its own…」（目录条目是 Home Runtime 声明；宿主源码没有以 Cognia 命名的文件、不为它注册 provider、不 import 它的包）与紧接的「Home Runtime declarations resolve shipped factories and start once…」（真实 Home 监督器按出厂工厂只启动一次）；项目旧路径 404 见 RAC-40（`tests/cognia-http.test.ts`）；② 库版本与形状：`tests/home-store-baselines.test.ts` 的 cognia 行（版本 1，逐表等于真实 Home 取下的结构）与「RAC-44: the cognia library is the one Cognia's Home Runtime declares…」（被比对的正是 Cognia 的 Home Runtime 声明的那份库）；③ 动作快照：`tests/action-contract-snapshot.test.ts` 的「the committed snapshot is what the built-in Manifests and the Host's action directory generate」；④ 资源：`tests/page-assets-budget.test.ts` 的「this repository's build is within the committed page asset budget…」，本树构建的每个资源（含 `cognia.js`）等于已提交的预算、没有未登记的新资源；⑤ [人工] 公开 API 快照、对 merge-base 的 health 与资源只降、包边界、整体与 workspace 构建：没有测试证明「在这个提交上通过」，看该提交 CI 的 Verify 与 page-assets 作业记录；全量由统筹排 CI |

范围边界：平台片只改 contracts/plugin-sdk/plugin-runtime/local-host 的共同能力及对应测试/手册；插件片改 Cognia 包、目录/路由装配和已有消费者。安全上限已获用户批准，平台前置与插件片按依赖顺序实施。两片保持独立提交，在本线空出在途名额且前序合入后才推送/开 PR；不以本地工程通过代替最终产物与人工验收。

平台前置本地证据：整体与工作台构建、API 更新、boundary 通过；9 个相关文件 325 条通过，包括新加的 45 MB 真实请求边界、强制附件与模型元数据用例。相对灵光前序分支 25 项资源 7,491,168 B，零增长。新增测试纳入索引后安全表检查仅失败于前序 S-33 等待 #681 S-32 的编号依赖；不写占位行。平台代码为单独提交，尚未推送或验收。

本地插件片证据（2026-10-17）：整体构建、workspace 构建、包边界与动作快照通过；93 个非浏览器定向文件共 745 条测试通过，覆盖包 README 要求、HTTP/MCP、32 MB 批次、两项目同库、HTTP 断开与停用/撤权/重启/取消/领域删除后拒绝晚到草稿。4 个浏览器文件共 19 条通过（桌面与 390 px 导入/引用/真实本机 HTTP Prologue/审阅采纳、停用后本地编辑、模型恢复、设置跳转与当前对象情境）；检查了实际截图。`tests/cognia-runtime.test.ts` 加入 CI 产品子集。Cognia 客户端由 23,963 降到 23,703 字节，25 项页面资源总计 7,490,908 字节，对平台前置提交 `287bf0f7` 的资源门禁通过。health 同样只剩 S-32 在途造成的 S-31→S-33 缺号；未放松门禁，待前置合入后同步 main 并更新快查基线。全量 CI、真实 Home 与用户本人验收尚未完成。

### W5-01 Images 的私有文件前置片（2026-10-17，本地定向通过，待前序与 CI）

2026-10-17 接续整合：已在 Cognia 当前候选 `a9d6bb9d3` 上重放本片，产品源码增删与原 `8a9c21476` 完全一致；原分支与 `feature/w5-01-plugin-files-before-sync-20261017` 保留旧引用，材料 S-34 与主线 S-32/S-33 从前置保留。本片整体/workspace 构建、API、boundary 与对 Cognia 基点的 merge-base health 通过，快查基线已下调；14 条实际 Runtime/磁盘安全用例全过。资源保持 25 项 7,480,612 B，零增量；共同包要求、安全与消费者在后台授权组合 `8a8518329` 上统一验证，203 文件 1,823 条通过、1 条原有环境跳过、0 失败（含 5 个真实 Chrome 文件 20 条），不能当作本片独立全量。下方旧安全表缺号仅是历史运行事实，当前安全表门禁已过。Images 本身继续等待 #661 评论指出的连接合同、库维护和拆片要求落定。

Images 迁移仍等待 #661 的连接合同定形。本片先补不依赖该合同的共同缺口：Runtime 插件保存与读取自己拥有的二进制文件。当前 `ImagesService` 直接使用 `{home}/images/assets/`，`PluginStartContext` 没有文件服务；直接把 Home 路径交给插件会扩大文件权限，改存成果库又会改变事实归属。目标为功能可用的平台前置，Images 的生成、后台任务、连接选择和界面留在后续片，不在本片实施。

采用 `services.files`：宿主可信启动条目声明 `store_name`、单层子目录、单文件字节上限、读写权限；运行时只给已登记为该插件所有的 Home 存储目录。声明不来自 Manifest、动作参数或安装脚本；沙箱与无 Home 平台拒绝，升级预检不提供。Home 与项目执行器使用同一实现，原路径可直接读取，不搬数据、不改库版本，不开放任意本机路径。

客户端只提供 `list()`、`read(name)`、`create(control, name, bytes)`、`remove(control, name)`。文件名是单个普通文件名，不能带分隔符、父路径、绝对路径或隐藏路径；只读取普通文件，拒绝符号链接。读与列举不创建目录；创建采用排他写入、0600，不覆盖已有文件；读写都服从声明的单文件上限。每次操作核对当前实例和授权，变更接收原动作执行控制，在等待 `beforeEffect()` 后同步检查 signal、`assert_authority_current()` 与安装授权，再执行磁盘操作，停用/撤权/升级后旧句柄不能继续写。清理归文件主人，平台不新增任务、重试或业务记录。

文件边界：contracts 的公开类型；local-host 的可信声明检查、文件 IO、Home/项目两条装配；既有安全表、插件开发手册与对应测试。以 S-15/S-18 的现行原生插件信任与生命周期为边界，独立于外部插件沙箱，不新增 typed 能力、每插件宿主分支、读取兼容或预算例外。#661 与本片共同涉及 `home-side.ts`、公开 plugin 合同和文档，后合片逐块保留双方内容；不改 #661 工作树。

| 编号 | 验收 | 验证 |
| --- | --- | --- |
| RAC-45 | 只有可信启动条目、正确 Home owner 与已声明权限能取得文件服务；另一 owner、无 Home、沙箱和升级预检均不能取得 | 真实 Home/项目 Runtime 夹具与拒绝用例 |
| RAC-46 | 现有文件字节可读；列举/缺失读取不创建目录；排他创建、删除、重开正常，原文件不会覆盖 | 实际临时 Home 文件读写与重开检查 |
| RAC-47 | 路径越界、目录/文件符号链接、非普通文件和超过声明大小均在读写前被拒，目录外与原文件不变 | 真实磁盘拒绝断言，含上限与超一字节 |
| RAC-48 | 写入等待中取消、停用、撤权、升级与关闭拒绝，旧句柄失效；新实例只使用新授权 | 真实动作屏障和生命周期交错，磁盘/重开检查 |
| RAC-49 | 两个执行器使用同一公共服务；无业务动作或界面变化，公共 API/边界/健康/资源检查通过 | 整体 build、API 更新、相关包用例与 merge-base health/boundary；全量由统筹排 CI |

实现已接入两种执行器；包要求与安全回归合计 127 个定向文件，126 个通过（1,171 条测试），唯一失败是安全表 S-31→S-33 中等待 #681 的 S-32 缺号。新增 14 条实际 Runtime/磁盘用例通过，先复现并修复了异步授权返回后的最终调用者撤权，以及原声明对象被改动后重定目录两处问题；文件变更接收完整执行控制，可信条目与发行物恢复共用已校验声明的不可变快照。整体与 workspace 构建、包边界、公开 API 通过，资源对 Cognia 前序分支为 25 项共 7,490,908 B、零增长；对当前 main 的资源检查仍被前序已批准但尚未合入的工作台增长阻挡，待按实际合入顺序同步。健康检查只剩上述 S-32 缺口，未放宽规则。与 Cognia 平台/插件片分别保留提交；仍按本线两片在途与既定提交顺序推进，不提前占 PR 名额。共享核心全量待统筹在 CI 排，未操作真实 Home。

Images 后台执行的后续边界（本片不实现）：当前 `ImagesService.start` 在返回 running 后继续执行，HTTP/MCP 断开不取消；后台只持续检查选中的生图配置和连接，并未持续核对原 MCP 的动作授权。2026-10-17 用户弹窗决定「立即停止等待，不保存晚到结果（推荐，遵守统一撤权规则）」：后台须保留原调用者的可撤销授权，撤销后停止等待，不写生成结果或失败业务记录。正常 HTTP/MCP 断开仍保留已受理任务；取消、停用和重启后的恢复按同一生命周期边界验证。#661 当前正式 PR head `0090afe3887a1b9fd5861d4ee3e61c99a3931248`，仍未合入；连接合同相关实现继续等待。

### W5-01 已受理后台执行的授权前置片（2026-10-17，本地定向通过，待前序与 CI）

2026-10-17 接续整合：本片已重放到当前私有文件候选 `abddd84ad`，产品源码增删与原 `079987005` 完全一致；原分支及 `feature/w5-01-plugin-background-before-sync-20261017` 保留旧引用。主线 S-32/S-33 和用户指定的材料 S-34 从前置保留，重复编号提交仅有既有文档差异。本组合整体/workspace 构建、API/动作快照、boundary 与对私有文件基点的 merge-base health 通过，快查基线已下调；资源保持 25 项 7,480,612 B，零增量。在 `8a8518329` 上统一完成相关 Kernel/Runtime/Host、包 README、安全与消费者回归：198 非浏览器文件 1,803 条通过、1 条原有公网 npm 条件跳过；5 个真实 Chrome 文件 20 条通过，合计 203 文件 1,823 条通过、0 失败，包含新后台授权文件的 21 条安全用例。日志 `/tmp/molis-platform-combo-{regression,browser}.log` 与清单 `/tmp/molis-platform-combo-files.json` 保留，源码和 Skill 构建后未改。旧缺号失败仅是历史证据；当前安全表已过。本地未推送，仍待实际前序/main 复验与统筹 CI，不据此宣称 Images 已迁移。

用户已决定 Images 原 MCP 动作授权撤销后立即停止等待，不保存晚到结果。当前 `retainAuthority` 能保留注册与权限检查，但 HTTP 路由把请求结束和授权生命周期放在同一个控制上；直接复用会让已受理任务随正常响应结束而取消。`services.model` 又只允许本安装的活跃并发动作，不能把已结束处理器的 `beforeEffect` 留给后台使用。本片补共同的有限后台执行边界，不迁 Images，不做生图/连接服务、调度器、持久任务表、自动重试或重启后重放；业务任务、幂等与恢复仍由插件拥有。目标为功能可用的平台前置，整线目标不变。

采用 `services.background.start(work, { signal? })`，只允许本安装当前的并发 command，且该动作声明了 `background_job`。接收前检查原动作，捕获原动作的精确注册、身份、项目和可撤销权限；返回含结果 Promise 与取消方法的临时句柄。后台回调取得独立的执行控制，并在同一个插件动作范围内使用既有模型与数据服务；它只延长这次已受理工作的执行，原处理器的 `beforeEffect` 仍随处理器结束失效。执行结束、取消、撤权、停用、升级或关闭后控制失效，复查失败立即结束本机等待，之后到达的成功和失败都不能提交业务事实。复用 SDK 的 `createExecutionLifetime` 监听与等待，200 ms 复查间隔沿用 Images 当前标准，提交前另有同步检查。

入口把可保留授权和临时传输分开：Kernel 只在活跃处理器内提供 `retainBackgroundAuthority()`；可信入口通过 `ActionCallContext.retain_background_authority` 提供不依赖已结束传输的检查，Kernel 仍固定原注册并核对可见性。绑定客户端保留父调用的后台授权，不能转换成插件自身权限；HTTP 路由保留 Host/项目存在与安装检查，MCP 保留原动作授权，明确保留 Agent/调用方自身的取消与身份约束。没有独立入口授权时，沿用原取消边界，不自动脱离。沙箱、升级预检、启动钩子、路由、计时器和其他安装的动作均不能启动后台执行。

修改边界：contracts、Kernel 的授权捕获、Runtime 的一次执行与两个 Host 执行器、HTTP/MCP 与绑定客户端的授权组合、既有 S-18 和开发手册。公共 API 快照随新可选字段更新；当前业务动作 schema、库版本、页面资源上限与安全上限不变。#661 仍仅作为后续连接合同依赖；本片不改其连接实现。共享安全文档与 #675/#681 逐块合并，保留 main S-32/S-33，材料服务用 S-34；本片自身不新占编号。

#### 验收（RAC-50～55）

| 编号 | 验收 | 验证 |
| --- | --- | --- |
| RAC-50 | 只有本安装正在执行且声明后台结果的并发 command 可受理；没有父授权不能变成插件自身权限 | 真实 Kernel/Runtime 拒绝用例，含启动/路由/过期/外来安装/嵌套调用 |
| RAC-51 | 受理后正常 HTTP/MCP 断开仍继续；原处理器和旧路由控制已过期，不能另起未受理工作 | 真实 HTTP/动作网关关闭响应后完成、磁盘重开验证 |
| RAC-52 | 原 MCP 授权撤销、安装撤权/停用/替换、Host 关闭、显式取消均停止等待；迟到成功与失败不写记录或文件 | 实际授权文件/Runtime 生命周期交错，未配合取消的提供方与同步尾检 |
| RAC-53 | 后台模型调用保留原身份、项目、声明权限与注册；结束后的模型进度、控制与进一步后台启动拒绝 | 实际 Host 模型端口、原调用结束及后台结束边界 |
| RAC-54 | 执行器撤销先于插件清理；重启不复活旧工作；无计时器/未处理拒绝残留 | 两执行器公开生命周期、关闭与新实例恢复；包要求与安全回归 |
| RAC-55 | API、包边界、merge-base health/资源检查及适用回归通过；全量交统筹 CI | 分五部分，全部成立才算通过（2026-10-19 拆，QA-021；门禁部分与平台线对过）：① 适用回归：RAC-50～54 的用例全部通过（主要是 `tests/action-background-authority.test.ts`，另有 `tests/security-invariants-plugin-background.test.ts`、`tests/plugin-model-service.test.ts`、`tests/runtime-plugin-http-discovery.test.ts`）；② 现有合同回放：`tests/action-contract-snapshot.test.ts` 的「the committed snapshot is what the built-in Manifests and the Host's action directory generate」；③ 资源：`tests/page-assets-budget.test.ts` 的「this repository's build is within the committed page asset budget…」，本树构建的每个资源等于已提交的预算、没有未登记的新资源（本片不改页面）；④ [人工] 公开 API 快照（contracts 新增的可选字段 `retain_background_authority`）、包边界、对 merge-base 的 health 与资源只降、整体构建：没有测试证明「在这个提交上通过」，看该提交 CI 的 Verify 与 page-assets 作业记录；⑤ [人工] 共享核心全量交统筹 CI |

项目 HTTP 的正向用例暴露既有授权缺口：`coding-surface` 未传路由分发器要求的 `granted`，因此带 `permission` 的路由即使安装已授权也返回 403，尚未进入动作。本片让可信本地 HTTP 入口读取目标安装的现行 grants，保持分发器的权限断言；RAC-51/52 同时验证授权时能受理、撤销该权限后进入处理器之前拒绝，不从请求体补权限。

本地证据：相关 Kernel/Runtime/Host/contracts 包要求、授权消费者和安全集共 158 个不同文件，157 个通过；1,479 条通过、1 条公网 npm 条件跳过，唯一失败是既有 `security-invariants-doc` 的 S-32 缺口（材料前置已登记 S-33，S-32 等 #681）。新增后台安全文件 21 条全部通过：实际 Home/项目 HTTP、项目路径下的 Home 实例、MCP 网关及直接 MCP 关闭、原授权撤销、未配合取消的提供方、停止钩子尚未返回、重启和晚到失败；另核受理后的文件与业务结果在重开隔离 Home 后仍在，取消后的两者都不存在。Kernel 新 4 条与既有保留授权 5 条、Runtime HTTP 17 条和模型服务 15 条通过；沙箱、无声明、过期作用域、外来安装、预检与没有模型 Home 的边界均覆盖。RAC-50–54 在这些路径上通过，不外推为 Images 已迁移或真实外部模型已验收。

工程证据：整体 `pnpm build`、`pnpm workspace:build`、boundary 和 API 快照通过；与前置私有文件分支比较的 25 个页面资源均不变，总计 7,490,908 B。merge-base health 也仅 S-32 缺口一项失败，没有调大门禁或占位行。一次测试与 workspace 构建重叠，两个目录探针遇到构建产物被重写而 404；构建结束后原样重跑通过，后续回归固定源码与产物。RAC-55 仍待前置合入后的 main 检查及统筹安排的共享核心全量 CI；本片未推送，不读取或维护真实 Home、钥匙串。

## 1. 决策记录与待决事项

| 日期 | 事项 | 选项 | 结论 | 说明 |
| --- | --- | --- | --- | --- |
| 2026-10-17 | Images 已受理后台任务遇到原 MCP 动作授权撤销（弹窗） | 立即停止等待，不保存晚到结果（推荐）；保留既有行为继续已受理任务 | 立即停止等待，不保存晚到结果 | 后台保留原授权并持续检查；撤权后不写结果或失败业务记录。正常断开不等于撤权，已受理任务仍继续；本决定用于后续 Runtime 后台执行与 Images 迁移 |
| 2026-10-16 | 已安装的插件能不能在 Manifest 里声明默认数据来源（`default_source`、默认输入组；W4-03 第一片 #565 留下的产品问题，统筹弹窗；2026-10-18 改为按声明与授权，见本表末） | 暂只在随宿主发的插件之间（推荐）；已安装的也生效 | 暂只在随宿主发的插件之间 | 已安装或生成的插件写了也当作没写，免得没人同意就拿到 Coding 的变更集或 Shelf 的材料；装插件时有同意流程后再议。改的是 #565 留下的「产品还没定」措辞（合同注释、宿主注释、EXTENSION-POINTS、Skill 的 elements/host、Host README、本规格），行为不变 |
| 2026-10-15 | CI 全量占满 runner（弹窗） | 限流并只在加标签时跑（推荐）；只限流；全量只在每晚和集成分支跑 | 限流并只在加标签时跑 | 6 个带 `full-suite` 标签的 PR 每次推送各开 16 个分片，占满仓库的 20 台并发，`Verify` 与 main 的 CI 排队 10–20 分钟。`full-suite.yml`：PR 只在加上标签时跑一次，`max-parallel: 6`；要再跑就重新加标签或手动触发 |
| 2026-10-15 | F109 在启动时打开所有项目（为了恢复各项目的定时任务），每次打开都同步编译全部动作合同（Goals 一项约 250 ms），Catalog 读取被卡住（`tests/catalog-read-contention.test.ts`：最长停顿 84 ms，main 是 22 ms；加载重时 3 次都失败；弹窗） | 推迟到第一次调度时再打开（推荐）；拆小打开项目的同步工作；撤掉启动时打开项目 | 推迟到第一次调度时再打开 | 启动不打开项目，第一轮调度（30 秒）先从 Catalog 打开各项目、再跑到期的任务；同一份合同只编译一次（按合同全文缓存），打开项目时先分批编译再注册。最长停顿回到 22 ms；`tests/schedule-reminder-recovery.test.ts` W2-18-SCHEDULE-01 改为断言启动不打开、第一轮打开 |
| 2026-10-15 | F109 合 main 后 Pages 编辑器资源 698,574 → 703,633 字节（+5,059，全部来自 `editor-transient.ts` 与 `card-content.ts` 的修复；弹窗） | 单次资源例外（推荐）；瘦身现有编辑器代码 ≥5 KB；去掉几种代码高亮语言 | 单次资源例外 | 照 #520 的做法在 #522 里只给这一个资源、这一个旧基线开一次，上限等于实测，多一字节、其他资源、之后再长都拒绝；名字混淆会破坏现有 `/Decoration\.node/` 断言，不用 |
| 2026-10-15 | W3-10 单片全量失败后 I8 怎样合（弹窗；改上一行的两个 PR）：W3-10 单独取 35 个文件，全量 41 个文件失败（缺别的工作流里的 `molisWorkRequest`、`feedApi` 等），单片离不开其余工作流 | 整个 F109 一个 PR（推荐）；继续拆 | 整个 F109 一个 PR | 用合了 main 的 F109 整树开一个 PR，不写混合文件；重建、刷新门禁基线；加 `full-suite` 标签在 CI 分片跑全量，本机补 macOS 专有用例，失败逐个对照 main 基线；PR 描述按工作流分节写改动与影响 |
| 2026-10-15 | W3-10 之后剩下的 1116 个文件怎样合（弹窗）：27 个文件跨工作流，W2-10 的 353 个测试文件只有 1 个是纯导入改写 | 剩余一片合入（推荐）；仍拆 2–3 片并写过渡 | 剩余一片 | I8 = 两个 PR：W3-10 与其余；其余那片合入前在合并树上重跑全量并对照基线，PR 按工作流分节写改动与影响 |
| 2026-10-15 | I8 怎样拆片（弹窗；改决定 7 的 5–8 片）：第 1 片的构建闭包拉进 136 个文件、仍有 19 个测试文件失败，S1、W3-02、W3-07 互相离不开 | 改成 3–4 片（推荐）；仍坚持 5–8 片；整个 F109 一次合入 | 3–4 片 | 每片从合了 main 的 F109 整文件取，不写混合文件 |
| 2026-10-15 | CI 全量里轮换出现的偶发失败（弹窗） | 重试一次加降负载（推荐）；只重试；只降负载；继续逐个修 | 重试一次加降负载 | #519 前后五轮：864 → 888 → 892，每轮失败的是另一批浏览器文件，报错是 CDP、DOM 等待超时（4 核 runner 同时 3 个文件）。`run-tests.mjs --retries <n>`（默认 0，本机行为不变）：重跑通过的列为 flaky、不让运行失败；`full-suite.yml` 用 `--retries 1`，每个 runner 同时 2 个文件，分片 10 → 16 |
| 2026-10-15 | 本机验证的等待（弹窗） | 只重建变了的包（推荐）；机器槽位工具（推荐）；把点名的用例送 CI 跑；本机浏览器槽提到 3 | 只重建变了的包；机器槽位工具 | 依据 42 个会话：前台构建 19 小时（每次整体清空重建 71 个包，整台机器一次一个）、浏览器用例 16 小时、前台轮询等待 29 小时（其中 13 小时等别的会话，靠 `pgrep` 或某个会话私有的锁脚本）。`scripts/build-workspace.mjs` 按输入摘要跳过没变的包，`pnpm build:clean` 保留全量重建；`scripts/machine-slot.mjs` 让构建与浏览器批次按到达顺序排队、死掉的占用者被接手；`docs/system/PARALLEL-DEVELOPMENT.md` §5 写明等待用后台加通知 |
| 2026-10-15 | main 开合并队列（弹窗，推翻 2026-10-02「不开合并队列」） | 开（推荐）；不开 | 开 | 10-02 时 `Verify` 约 28 分钟，现在约 5 分钟；10-13 到 10-15 的 200 次 CI 里 95 次因分支同步后重跑被取消。`ci.yml` 加 `merge_group`，健康门禁与密钥扫描在队列里以 `merge_group.base_sha` 为比较点；分支保护去掉「必须与 main 同步」，由规则集的合并队列验证 `Verify`；不挡合并的作业不进队列。做法见 `docs/system/PARALLEL-DEVELOPMENT.md` §3 |
| 2026-10-15 | 测试自己的时限能不能按慢机调大（#519 与 #527 口径相反，§10.13 R-5） | 用户直接答复 | 可以：「时限可以90秒，我没说必须30秒」 | 时限只用来拦卡死，不是行为断言：Linux CI 比 macOS 慢约 2.3–2.5 倍，按这个倍数调大时限、在注释里写明，不算放宽断言；断言本身仍不放宽、不跳过。`tests/mcp-scene-effect-authority.test.ts` 定为 90 秒 |
| 2026-10-15 | W4-01 探针插件既要 bundled、又要 id 只在自己的包里：bundled 插件现在都要在 `project-plugins.ts` 里点名，声明式登记（W5-02）未做，测试夹具按 W3-06 永远不是 bundled | 走夹具路径、bundled 留给 W5-02（推荐）；现在先做声明式发现；允许测试夹具标 bundled；推迟 W4-01 | W4-01 推迟到 W5-02 之后 | W4-04（Form）不再等 W4-01，按 `docs/system/RUNTIME-MIGRATION.md` §5.1 直接迁；W4-01 的验收（探针对 Form 同样成立等）随 W4-01 一起后移 |
| 2026-10-15 | W4-01 回放样本里 2–3 个「创作台生成的插件」从哪来（仓库里没有，创作台回放只到设计定稿） | 隔离 Home 里用 MiniMax 真跑创作台（推荐）；从真实 Home 只读拷贝里取；手写仿制 | 隔离 Home 里真跑 | 生成的源码与清单入库当样本；做 W4-01 时执行 |
| 2026-10-15 | 全量搬到 CI 分片跑（弹窗） | 上 CI 分片（推荐）；只在本机 | 上 CI 分片 | `.github/workflows/full-suite.yml`：10 个 ubuntu runner，PR 加 `full-suite` 标签、推到 `integration/**`、每晚和手动时跑；不挡合并；Linux 探针标为 macOS 专有的文件（`run-tests.mjs --skip-macos-only`）仍在本机跑。依据：本机全量 56–61 分钟，其中浏览器文件 116 分钟、同时 2 个就占 58 分钟，整台机器一次只能一个全量，并行需求互相排队 |
| 2026-10-15 | Prologue #26 由我合入后被权限检查标成「未经评审合并」（弹窗） | 保留（推荐）；回退等评审 | 保留合入 | #26 只改两个消费者脚本（P2i、P2h 改用真实会话），SDK 代码未动；12 个消费者脚本在干净包上全部通过 |
| 2026-10-15 | BL-137：SDK 释放 8 MiB 资源约 0.8 秒（弹窗） | 在 Prologue 开 PR 修（推荐）；只记录 | 在 Prologue 修 | 先作废索引，再逐块直接删、目录 fsync 一次；崩溃后由扫块兜底补删，断电语义不变；另跑 SDK 全量与干净包 |
| 2026-10-15 | 8 个中文名插件在英文界面的名字（F-20，弹窗） | 按建议英文名（推荐）；灵光、炼金术士不译；全部保持中文 | 按建议英文名 | Artifacts、Plugin Studio、Images、Lingguang、To-do、Characters、Alchemist、Workflows，只用于英文界面，中文界面不变（角色已是设置的一节，不在插件列表）；实现 #512 |
| 2026-10-15 | 新项目摘要页等生成内容的语言（F-22，弹窗） | 跟随创建时的界面语言（推荐）；保持中文 | 跟随创建时的界面语言 | 已建的页面不改；实现 #512 |
| 2026-10-14 | 108 卡在 work-placement-restart（弹窗） | 只停这一个文件的进程（推荐）；停整个 108；等它超时 | 只停这一个文件的进程 | 去停时 pid 35170 已自行退出、108 继续，实际没有停任何进程 |
| 2026-10-14 | Issue 首次登记的 24,000 资源上限（复查 F-1，弹窗） | 批准过，补记录并删掉已用完的例外（推荐）；没批准，回退 | 批准过，补记录 | 记录补在 specs/issue-home-v0；`INITIAL_ASSET_BUDGETS` 已删，门禁回到只减不增（[#501](https://github.com/molis-ai/molis-work/pull/501)） |
| 2026-10-14 | Home 级内置插件的登记位置（复查 F-2，弹窗） | 改规则文字（推荐）；改代码搬到 Host 侧名单 | 改规则文字 | AGENTS.md、EXTENSION-POINTS、PLUGIN-DEVELOPMENT 写明：Home 级内置插件在 `builtin-plugins.ts` 以 `runtime: { scope: "home" }` 登记，由 `home-plugins.ts` 装配；项目级仍只走 `project-plugins.ts`（[#502](https://github.com/molis-ai/molis-work/pull/502)） |
| 2026-10-14 | Runtime 插件的 consumes 能否调到别的插件的动作（复查 F-10，弹窗） | 只给宿主装配的内置插件；对所有插件放开；都只到宿主动作 | 对所有插件放开 | 仍受受众、权限、可用性与 schema 约束；先查授权再查目录；未列在 consumes 的动作 `actions.forbidden`。SECURITY-INVARIANTS S-15、插件开发 Skill、PLUGIN-DEVELOPMENT 已写；`tests/workspace-read-one-id.test.ts` 改为断言列出的可达、未列的拒绝，进 `test:security`（在 F109 00bbdacb7，未进 main，随 I8 落地） |
| 2026-10-14 | main 缺模型切换的授权复核（复查 F-4，弹窗） | 单独一个小 PR 先进 main（推荐）；随 I8 一起 | 单独一个小 PR 先进 main | 上游已有：Prologue #24。Molis 侧要换包加 beforeAccept 接线，接线依赖 G5 的执行检查框架（`prologue-effects.ts`），所以这是 I8 拆分后的第一个 PR，不会很小 |
| 2026-10-14 | SDK 系谱不满足 D7（复查 F-5，弹窗） | 过渡期内接受并写进决定（推荐）；按 D7 重建 | 过渡期内接受 | D7 的例外：Molis P3 之前，临时线可以带已在 Prologue main 上的提交的 cherry-pick（#18、#24），provenance 照实写 `parentsOnUpstreamMain: false` |
| 2026-10-14 | I8 怎样落 main（弹窗） | 按大块拆成几个 PR（推荐）；一个大 PR | 按大块拆成 5–8 个 PR | 依赖顺序串行，每片从最新 main 起、CI 全绿再合 |
| 2026-10-14 | 当前CU-image SDK的beforeAccept补丁、上游与正式vendor（用户原问题回复） | 只留临时包；提交上游并正式换包 | 允许提交上游并正式换包（推荐） | 范围为923e5a40 CU-image当前系谱上的最小同步beforeAccept补丁；允许提交/推送Prologue、开PR，经复查与验证后更新Molis正式vendored包及来源记录、删除被替换旧包。当前上游多一项公开API快照修正，补丁保留该修正；不扩大到P2/P3迁移、真实Home维护或他人成果清理。上游GitHub Actions未配置，须如实记录验证缺口，不能声称远端CI通过。 |
| 2026-10-12 | 将复查推进到现有全部 71 包实际审完（用户后续明确要求） | 只核对要求与部分路径；逐包补齐全部现行代码、插件和组合路径 | 逐包继续到审完，必要修复归本 spec | 用户明确“把现有全部 71 个包逐包审完，补齐未审代码、插件和组合路径，不只核对要求和进度”。已启动 §12.7 的 9 个 `gpt-6.1-sol / max` 只读会话，按完整包边界互不重叠，现行五个缺陷沿原 owner 修复；所有结论由协调方核源码/证据后回写此 spec。阶段报告、首次扫描、派发、测试存在均不计已审完成。I6 冻结和机器验证队列不变。 |
| 2026-10-12 | 复查后提高独立修复并发（用户在协调会话追加） | 原 writer 串行；按独立包新建 Codex 会话 | Dataset、Issue 各新建一个会话 | 用户明确现有 writer 较慢，可以新开提高并发；随后允许派发会话使用 `gpt-6.1-sol`、`max`。两个新会话已按此设置，文件边界与身份见 §12.6；这一决定覆盖本任务此前的单 writer 默认，仅允许互不冲突的实现并行。I6 受测树冻结、整机一个构建/一个浏览器批次、共享核心整合验证和唯一进度 spec 保持。没有扩大真实 Home、发布或他人成果清理授权。 |
| 2026-10-12 | G3 记忆错误的 kind（日常取舍，沿用统一错误模型） | 保留 Host 重写和默认400；由 owner 分类并贯通共同出口 | 由 owner 分类 | 实际源码中两个 HTTP 入口的 limit/conflict 都是400，Assistant 重写后的 forbidden 也是400。按现有拒绝条件，待本人处理的建议达到上限、预览后事实改变均用 conflict→409；forbidden/scope→forbidden、not_found→not_found，invalid/off维持invalid。Assistant 的权限拒绝400→403、两个入口的状态冲突400→409明确记为分类修正；Memory主人原码、文案、拒绝与无写入语义保留，Host旧assistant码重写删除；不把状态变化说成旧行为未变。图片 expired 的410→404已由原方案接受。 |
| 2026-10-12 | BL-133 的五条 Issue 导航旧测试（弹窗，现场已测量） | 防腐线修正；交给 Issue 原会话；保留基线失败 | 防腐线修正旧测试 | 用户批准保留 ISSUE-30 的右上角常显入口，修正控件登记与标题栏几何预期。实测 Home 按钮桌面 32px、手机 44px；测试继续检查所有触控 44px、桌面 Home 32px（含短窗口）、视窗边界与实际命中，以及 Add/分屏对齐、标签距离与 Home 相邻且不遮挡，不改产品布局。 |
| 2026-10-12 | Codex 接手防腐线（本轮用户指令） | 沿用 Claude 后台结果，接续到完成 | 已授权 | 先确认后台、补齐同一份 spec，再从 I4 回归与第五批剩余修复接续；按交接逐片推送、开 PR，全部必需 CI 检查通过并对齐 main 后串行合并。不重启已有驱动或回归；真实 Home 写入、他人成果清理仍按交接的独立授权边界处理。 |
| 2026-10-12 | Claude 周额度耗尽后，批后合规复查的模型（弹窗） | 改由 Codex 完成；保留 Sonnet 等额度恢复 | 改由 Codex 完成 | 用户选择「改用 Codex 完成复查」。本轮实现、合规复查及修复评审由 Codex 承接；保留独立只读评审、单一 writer、隔离 Home、构建与浏览器排时段、先整合再分片合入的验证要求。 |
| 2026-10-12 | 原合并脚本的必需检查与报告作业（日常取舍，核对已有#14） | 沿用交接原门槛；额外等待所有报告作业结束 | 沿用原门槛，相关产品子集须实际通过 | 本轮重新核对原merge-seq：所有未标not required的检查完成SUCCESS且Verify存在，分支同步；Linux probe沿既有W1-11/#14仅报告，结果继续收集、未结束不称通过。#470额外核实际Product361/361与Runtime16/16，strict扫描及远端相同后由原daemon合入。不改CI/分支保护或任何门禁，只撤掉协调此前自行追加的等待报告要求；#455/#456确已七项通过的历史证据保持。 |
| 2026-10-02 | 任务要求以哪份为准 | anti-rot 版；main 版 | anti-rot 版 | 用户在目标里指定；anti-rot 合入并删除后改用 main 版 |
| 2026-10-02 | `~/.molis-work` 在删迁移代码前怎么处理 | 保留并升级；备份后重建；先不处理 | 保留并升级 | 先整份备份；停 4207 与常驻服务期间用删除前的代码升到最新；与新基线逐表比对一致后才删迁移代码 |
| 2026-10-02 | 4173 上的服务（第一次问时我误说成独立的旧 Home，用户选「备份后停用」；执行前发现是真实 Home 的常驻服务，重问） | 不停，保持现状；停掉常驻服务；第二步升级时一并换新版 | 不停，保持现状 | 不备份、不停；升级 `~/.molis-work` 时常驻服务也要一起停，升级后由用户决定是否换新版（**已被 2026-10-03 的决定推翻**：备份、停 4173、删旧成果表，见本表下方）|
| 2026-10-02 | 插件升级声明的机制 | 保留机制，清掉旧声明；连机制一起删 | 保留机制，清掉旧声明 | 保留 `compatible_from_versions`、`migratable_from_versions` 与发行物留存；内置插件为过去版本写的声明删掉，版本号按新策略重置 |
| 2026-10-02 | 同事有没有要保留的 Home | 给同事一份备份升级说明；没有同事在用；稍后告知 | 没有同事在用 | 只处理本机 `~/.molis-work` |
| 2026-10-02 | 共享核心的评审方式 | CODEOWNERS 记归属、不开必选评审；共享核心必须评审；再加合并队列 | CODEOWNERS 记归属，不开必选评审 | 加 `.github/CODEOWNERS`，自动请求评审但不强制；合同变更靠门禁守；不改仓库设置、不开合并队列 |
| 2026-10-02 | vendored 私有包 | 删 3 份不用的、分发照旧；删 3 份并改私有源；先不动 | 删 3 份不用的，分发照旧 | [#170](https://github.com/molis-ai/molis-work/pull/170) 删掉 assistant-memory、compaction-growth、resource-intake；私有包继续随仓库分发 |
| 2026-10-02 | 他人的工作树与分支 | 只清已合入且干净的；全部保留；逐个问 | 只清已合入且干净的 | 已删 `~/code/molis-work-performance-pr` 工作树与本地分支（#150 已合、无未提交改动）。删远端已合入分支（他人的 #159、#164，以及本目标自己的 23 条）被自动模式拦下，留给用户在 GitHub 上删，清单见 §7 |
| 2026-10-03 | 任务书来源 | — | 以 main 为准 | 任务书已合入 main：[#216](https://github.com/molis-ai/molis-work/pull/216)（`592f15bc`）用 anti-rot 上的两份任务书替换 main 上的旧版（anti-rot 自分叉以来只改了这两个文件）。此后任务要求、代码与 spec 都以 main 为准，按目标原文「anti-rot 合入 main 后以 main 为准」执行；每个分支从最新 origin/main 开，开工前 fetch、合并前同步到最新 main，不再基于 anti-rot 或其他旧分支开新工作 |
| 2026-10-03 | 验证频率 | — | 用户调整 | 用户 2026-10-03 调整验证频率：小改动攒成一批，整体构建一次，跑这批改动涉及的相关用例（改了什么就跑读它、调它的用例；带 `L()` 文案的加 `tests/i18n.test.ts`，改路由的加所有读这条路由的用例）；全量回归只在大改动时跑（改共享核心 contracts、kernel、modules、local-host 的装配、workbench 外壳，改迁移或存储，改动跨三个以上包，删除整块旧代码，或合入后相关用例意外失败），每个阶段收尾也跑一次全量作为阶段证据。不变的底线：每个 PR 的 CI 必须通过；跑测试前先整体构建；构建与浏览器用例串行；不跳过、不放宽、不删除断言；失败先用干净基线工作树比对 |
| 2026-10-03 | 推翻 10-02「4173 不停，保持现状」 | 保持现状；备份、停 4173、现在删旧成果表 | 备份、停 4173、现在删 | 成果库改造里用户决定立即删真实 Home 的旧成果表（[artifact-positioning §1](../archive/artifact-positioning/spec.md)）：已 `launchctl bootout` 停下 4173（安装版 0.2.0，没有旧表已不能用，要等装新版）；18 个项目库已备份到 `~/.molis-work-backups/2026-10-03-drop-old-artifact-tables/` 后逐库删掉 `artifacts`、`artifact_versions`。下面 §4.1 第 4 步按此重写 |
| 2026-10-03 | anti-rot 分支与工作树（弹窗） | #216 合入后三处都删（推荐）；只删工作树与本地分支；先都不删 | 三处都删 | 已执行：#216 合入（592f15bc）后删了工作树 `.claude/worktrees/review-prompts-goal`（无未提交改动）、本地分支 `anti-rot`（无本地独有提交）与远端 `origin/anti-rot` |
| 2026-10-03 | 场景 9：拷贝真实 Home 用当前 main 打开（弹窗） | 拷到会话临时目录验证（推荐）；等 4173 装新版时一起做；不做 | 拷到会话临时目录验证 | 先确认 4207 没在写，再把 `~/.molis-work` 拷到会话临时目录；用当前 main 在别的端口、文件密钥后端打开这份拷贝走一遍；不碰原 Home、不调模型，做完删拷贝。结果记在 §9.4 第 12 条 |
| 2026-10-04 | 内置插件安装停在旧版本，删「可从旧版本升级」名单前怎么办（弹窗） | 内置插件随宿主升级（推荐）；在插件市场里逐个确认升级；先不删名单 | 内置插件随宿主升级 | 随宿主发布的内置插件（监督器名单里标 `bundled`）启动时把安装记录升到宿主的版本：保留新 Manifest 仍声明的授权、补上它要求的授权，与新装一致；不再恢复旧发行物。第三方与生成的插件不变 |
| 2026-10-04 | 没配模型目录时的文字补全兜底（§9.5 第 7 条，弹窗） | 只删旧凭据，环境变量留作开发配置（推荐）；全删，只认模型目录；先不动 | 只删旧凭据，环境变量留作开发配置 | 删掉读 `model:text:api_key` 和导入「文本补全 · 原有密钥」。`MOLIS_WORK_TEXT_*` 与 `MINIMAX_API_KEY` 只作开发与测试的显式配置，写进手册。通用的 `MOLIS_WORK_TEXT_API_KEY` 不再默认成 MiniMax。产品里只有模型目录配置模型 |
| 2026-10-04 | V3 一次性导入（§9.5 第 6 条附带，弹窗）：早先独立仓库规格特意保留的产品入口（BL-083） | 删掉导入全链（推荐）；保留导入 | 删掉导入全链 | 删 CLI `import-v3`、管理 MCP `import_v3`、宿主能力、Goals 动作与导入实现，BL-083 关闭。只有导入会写的覆盖账本随后单独删。身份修复与之无关，已先做 |
| 2026-10-04 | 删两处兼容前是否只读核对真实 Home（弹窗） | 只读核对后再删（推荐）；不核对直接删；两处都先保留 | 只读核对后再删 | ② 密钥库：只按格式核对 `feed/secrets.json`（不解密、不输出内容），格式 2、keychain+aes-gcm，27 条全是 AES-GCM，没有 v0.3 信封，可以删。① 会话执行者：执行时发现执行者存在 Prologue 的加密记录里，核对要用真实 Home 的存储密钥在内存里解开会话索引，超出弹窗里说的「拷单个文件只读统计」，没有动手，改为再问（下一行） |
| 2026-10-04 | 会话执行者核对要解密，怎么办（更正后再问，弹窗） | 在拷贝上解密索引只数条数（推荐）；不核对，保留这处兼容；不核对，直接删 | 不核对，直接删 | 删 `legacyActorId`，会话的执行者改为必填；没写执行者的很早的旧会话，插件读不到（用户已知） |
| 2026-10-04 | Casebook 对外合同的旧名（待决 6，弹窗） | 改成 Molis Work 的名字（推荐）；保持旧名列入例外；等外部插件下次改版 | 改成 Molis Work 的名字 | `goalboard.casebook.*` 改为 `molis-work.casebook.*`，Schema `$id` 改到 `https://molis-work.dev/contracts/casebook/...`（与已归档的 Casebook v1 合同同一写法），用户动作签名的域名串一并改；不留旧名别名。外部 Casebook 插件要同步，PR 里列出全部新旧 id |
| 2026-10-04 | 真实 Home 的库（用户在对话里说 "you can touch the database"） | — | 授权动真实 Home 的库 | 用于 §4.1「每个库一份当前 schema 加版本」：按 10-02 的「保留并升级」执行。先整份备份 `~/.molis-work`，确认 4207、4208、4173 都没在跑；每一步先在拷贝上演练、核对，再动原库；只写结构版本号（`PRAGMA user_version`），不改表和数据 |
| 2026-10-04 | 项目库基线的列序（日常取舍） | 按某个真实库；按代码里的建表语句 | 按建表语句 | 18 个真实项目库有多种列序（Coding 会话表就有 4 种），一份基线对不上全部；真实 Home 按列名搬进新基线库，见 §4.1 演练 |
| 2026-10-04 | 项目库、目录库里只剩旧数据才用的列与值（日常取舍） | 留着；随基线去掉 | 随基线去掉 | `feed_items.item_type`（只剩 `'feed'`）、`feed_items.linked_goal_id`（关联早在上下文账本，列恒空）、`projects.migrated_from_path`（恒空）；Feed 快照的 `contract_migrations` 与 `markRead` 的类型参数随之去掉 |
| 2026-10-04 | 目录库的版本记法（日常取舍） | 改用 `user_version`；沿用 `catalog_meta.schema_version` | 沿用，升到 20 | 目录库本来就有版本号和「拒绝更新的版本」；只删 1→19 的升级链，版本不符就拒绝 |
| 2026-10-04 | Casebook 恢复失败报什么（日常取舍） | 保留缺失迁移的明细；只报代码 | 只报 `project_recovery_unsupported_schema` | 明细说的是缺哪些迁移，基线下没有迁移可缺；外部 Casebook 插件与 #248 的改名一起同步 |
| 2026-10-04 | Schedule「重装后确认归属」（日常取舍） | 随旧 Builder 导入一起删；保留 | 保留 | 是插件重装后把提醒、定时操作交给新安装的现行流程，不是兼容；用例改成真的重装一次 |
| 2026-10-04 | 项目库、目录库的一次性搬运工具放哪（日常取舍） | 进仓库；只放会话临时目录 | 只放会话临时目录 | 只用一次（真实 Home 与测试样本），不留产品代码；做法写进 §4.1 与样本 README |
| 2026-10-04 | 真实 Home 项目库、目录库何时按新基线重建（弹窗） | 合并后马上重建并换新版（推荐）；等全部改完再重建；先不重建 | 合并后马上重建并换新版 | 已执行（见 §4.1 真实 Home）：目录库先行（v20 让 0.2.0 旧进程打开即拒），18 个项目库 v1；4173 换新版是用户的操作 |
| 2026-10-04 | 治理「旧提案」的只读投影（弹窗） | 连表带投影一起删（推荐）；只删投影留表；保留 | 连表带投影一起删 | Contract Proposal、Candidate、Rewire 三张表与投影、`supersedes_legacy_proposal_id`；项目库 v2 |
| 2026-10-04 | 根包 0.1.x SDK 出口（弹窗） | 删掉，根包不再导出代码（推荐）；留作对外 SDK；改成转发 | 删掉 | `apps/local-host/sdk/`、`tsconfig.sdk.json`、根 `exports` |
| 2026-10-04 | Goal 事件前的旧历史（弹窗） | 连表带显示一起删（推荐）；保留为只读历史 | 连表带显示一起删 | 运行、领取、依据、评审、评审义务、澄清、覆盖修订、影响范围十张表（9-08 起无写入路径）与两个模块；「迁入的历史完成」；Coding 迁移前委派；项目库 v3 |
| 2026-10-04 | MCP 三套对外名（弹窗） | 只留动作工具一套（推荐）；v1 名留作 Goals 正式名；维持现状只改名 | 只留动作工具一套 | 删 Goals/判断规则 v1 别名、插件旧导出、「旧版工具（全局开关）」；连接类工具保留；Skill 与文档改动作名 |
| 2026-10-04 | 正在跑的 0.2.0 MCP 进程（日常取舍） | 逐个停掉；不停，靠目录库版本挡住 | 不停 | 6 个其他会话的进程；目录库 v20 让它们打开即拒，不会碰重建后的项目库 |
| 2026-10-04 | 插件安装记录的世代与执行边界（日常取舍） | 留读取兜底；必填并补齐真实 Home | 必填 | 删 `'legacy:'+installed_at` 与「缺省即 host」；真实 Home 171 条已有世代，161 条缺 `execution` 由维护二写 `host`（与原读法相同） |
| 2026-10-04 | 记忆条目没有平台事实时（日常取舍） | 从标签推断；不当作平台的条目 | 不当作平台的条目 | 平台写的条目都带事实；旁表的 `memory_meta`（真实 Home 0 行）与「早于旁表的历史补记」删；`memory_migrations` 改名 `memory_markers`，丢掉已删导入的 `assistant-p8` 标记 |
| 2026-10-04 | 事件前历史删掉后受影响的现行界面（日常取舍） | — | 按现行事实重算 | 动量图改看事件工作日志；胶囊进行中按进行中 Goal 计；回收站、项目删除不再被历史运行挡；项目引用只读当前工作区；「影响范围」页删 |
| 2026-10-04 | 真实 Home 里 458 个 Goal 的归属来源 `migration`（日常取舍） | 留作历史取值；搬时记为 `intent` | 记为 `intent` | 与「迁入的历史完成」同属 9 月搬迁的产物；维护二在拷贝上先改再搬，代码不再认识 `migration` |
| 2026-10-05 | 动作工具的结果不带 Goal 地址后，Runtime 怎么给用户链接（日常取舍） | 每个 Goals 动作结果补地址；连接结果给模板 | 连接结果给模板 | `context_resolve` 的连接多一个 `goal_url_template`（`<project_url>/goals/{goal_id}`）；Skill 改为填模板，仍不许从 ID 之外的东西拼地址；不在宿主里按能力补字段 |
| 2026-10-05 | 只为别名服务的宿主方法与外壳（日常取舍） | 留着；随别名一起删 | 随别名一起删 | `trash-with-work-state` 宿主方法与 `work_state`/`next_action` 外壳、判断规则旧名转换、Jelly 自动补版本号、Pages「翻译成新文档」的组合（动作只给候选）、会话活动里旧 `payload` 包装的读取；测试改走动作 |
| 2026-10-05 | Runtime 经 MCP 写入时没有稳定 Session（日常取舍） | 所有写入一律要求；只对声明了的动作要求 | 只对声明了的动作要求 | 以前只有 Goals 别名的写入（`session_actor`）按 Session 记作者、缺 Session 就拒绝；别名删掉后这条语义搬到动作定义上：`authorship: "session"`，Goals 的写入都声明，宿主按声明拒绝（W2-08 起在动作服务派发处，嵌套调用也拒，见 2026-10-09 升格一行；原先只在 MCP 入口），不按能力名分支。一律要求会让没有会话元数据的外部客户端写不了插件（多组现有用例就是这种客户端）。Runtime 有 Session 时每次调用都带上（按作者查的回执能找到自己的写入）；从已连接项目调用全局动作仍在该项目上下文里（判断记录问自哪个项目）；Runtime 自报 `source_kind: runtime` 不算冒充，其他渠道拒绝 |
| 2026-10-05 | 凭据两处记（弹窗） | 统一到连接表（推荐）；收编留作现行机制；这轮不动 | 统一到连接表 | 各设置直接建连接、只读连接；删每次打开连接页的「收编」、Gmail 单账号默认安装、旧引用镜像和 `legacy` 来源；真实 Home 5 条原有连接改记正式连接，钥匙串里的密钥不读不动；旧 Gmail 连接与「Gmail 兼容入口」来源连同旧令牌删除（已有 yijunw0212 的正式连接） |
| 2026-10-05 | 会话两处记（弹窗） | 会话表为唯一来源（推荐）；保留同步只改名；这轮不动 | 会话表为唯一来源 | 终端面板与 Runtime 绑定直接写会话表；删读取时的迁移、迁移回执表与 `legacy_migrated`；真实 Home 54 条按出处改记：来自绑定的 `explicitly_linked`，来自面板的 `molis_work_created` |
| 2026-10-05 | 结构提案里的旧类型条目（弹窗） | 只留当前两类条目（推荐）；含旧条目的提案整份删；只清待决其余留读 | 只留当前两类条目 | 真实 Home 约 1,500 条 dependency/contract/risk/candidate/rewire/policy 与 goal 更新条目及其决定删除；71 份纯旧提案（含 13 份已无法决定的待决）整份删；103 份混合提案只留 goal/relation 条目与对它们的决定；库表只允许 goal/relation，显示与检查里的「历史结构条目」分支删除；已落地的 Goal 与关系不动 |
| 2026-10-05 | 风险记录（弹窗） | 连表带显示一起删（推荐）；保留为只读历史 | 连表带显示一起删 | 插入函数无调用方、只经已退役的提案条目产生；风险表、Goal 风险关联、「风险」页签与决定里的风险卡片删除，真实 Home 46 条删除；Goal 页因素只留关系与规则 |
| 2026-10-05 | 合同修订（弹窗） | 删掉合同修订（推荐）；只删 r2 以上 | 删掉合同修订 | 不再存创建时的 r1 快照与修订号，Goal 原文就在 Goal 本身；Coding 只显示工作约定版本；真实 Home 477 条与修订号删除 |
| 2026-10-05 | 提案基线的旧版本格式与 policy 对象（日常取舍） | 保留旧比对；只按 semantic-v1 | 只按 semantic-v1 | 旧格式只出现在已落地、已被取代和 8 条本就冲突的条目上，删掉后不改变任何可决定的结果；policy 与 risk 对象随旧条目一起退出 |
| 2026-10-05 | 关系条目里一条带多条关系的旧形状（日常取舍） | 拆成单条；保留读取并列入例外 | 保留读取并列入例外 | 真实 Home 63 条（多为已落地，1 条待决、1 条冲突，单条最多 61 条关系）；拆开要改条目编号和引用它们的决定记录。新提交只收单条关系；`rewire`/`proposal` 嵌套无数据，删除 |
| 2026-10-05 | Casebook 导出合同里的「合同修订号」（日常取舍） | 改外部合同删字段；保留字段恒为 1 | 保留字段恒为 1 | Casebook 是给外部工具的版本化合同（goal-context 2.0.0 要求 ≥1 的整数）；Goal 的说明不再修订，恒报第一次修订，不改外部合同版本 |
| 2026-10-05 | Coding 的目标版本显示（日常取舍） | — | 只显示工作约定版本 | 删「目标合同修订 rN」与「工作约定版本未记录」；真实 Home 没有存下的 Coding 目标快照（过程项 0 条） |
| 2026-10-05 | 凭据统一第一刀的拆法（日常取舍） | 一个 PR 全做；先做模型/图片/TypeSafe，再做 Host 连接器与 Gmail/Notion | 分两刀 | 模型、图片、TypeSafe 的设置早已走连接，旧位置只剩回退和认领，自成一题；Host 连接器的固定槽位、Feed 内联绑定、GitHub 设备流、Gmail/Notion 旧槽涉及 Feed 来源与 OAuth，另成一刀。`legacy` 来源与 `adoptLegacy` 在第二刀最后删 |
| 2026-10-05 | 模型供应商的密钥归属（日常取舍） | 供应商自带密钥位；密钥属于连接 | 属于连接 | 供应商只记连接的引用：新建必须带一条 model-api 连接的引用，删供应商不删密钥（连接留在 Connectors），去掉 `setCredential`/`selectConnection`/`modelCredentialRef` 与构造时补表；表单先校验再建连接，被拒的表单不留连接 |
| 2026-10-05 | 模型密钥可用的条件（日常取舍） | 无连接行的旧密钥也算可用；必须是钉了地址的 model-api 连接 | 必须钉地址 | 删「旧前缀无连接也可用」「legacy 行不钉地址也可用」两条回退；真实 Home 的 Minimax 连接由维护按供应商地址补钉 |
| 2026-10-05 | 图片服务的密钥（日常取舍） | 插件自存 `images:<id>`；只用所选连接 | 只用所选连接 | 插件不再收 `api_key`、不再有密钥端口；没选连接时只有本机地址能生成 |
| 2026-10-05 | TypeSafe 密钥（日常取舍） | 固定槽位回退；只读按用途绑定的连接 | 只读绑定的连接 | Functions 模块改收「凭据解析」端口，删存/清密钥方法；实验必须有 Home，删 `"legacy"` 配置标记；连接断开或缺失算没有密钥，钥匙串锁住照实报错（以前被吞成「没配」）；真实 Home 由维护把 functions/experiments/plugin-builder 三个用途绑到原 TypeSafe 连接 |
| 2026-10-05 | Feed 固定来源（弹窗，更正上次「Gmail 兼容入口」的说明） | 不再自动建、按内容收拾（推荐）；全部保留；改按连接自动建；Gmail 照原决定全删 | 不再自动建、按内容收拾 | 每个项目不再自动补 GitHub/Gmail/Notion/飞书来源，来源只能选一条连接来加；真实 Home 64 个固定来源：有内容的 GitHub 来源挂到 GitHub 连接，2 个有内容的 Gmail 来源保留历史、标为断开（以后切到 yijunw0212 的连接会新建来源），58 个空占位删掉；旧 Gmail 连接与令牌照原决定删除 |
| 2026-10-05 | 环境变量里的连接器令牌（日常取舍） | 保留为「外部」连接；只认连接表 | 只认连接表 | `GITHUB_TOKEN`/`GMAIL_ACCESS_TOKEN`/`<ID>_TOKEN`/`NOTION_TOKEN`/`GMAIL_AUTH_REF` 回退和打开连接页时的环境变量收编一起删；要用令牌就建一条连接。「外部」连接只剩官方 CLI（飞书），id 改为 `external-<hash>`；飞书 CLI 的固定模式槽位删除 |
| 2026-10-05 | 连接账号动作的输入（日常取舍） | 仍按服务 id；改按连接 id | 按连接 id | `connectors.account.read` 读一条连接的账号，经同一个 `resolveApiConnection`，不会换成另一个账号；设置页没有调用方的 whoami/固定令牌路由、飞书 `cli/use`、非托管 OAuth 分支一并删除 |
| 2026-10-05 | Gmail 旧多账号模型（日常取舍） | 留安装表；删 | 删 | Feed 自带的按邮箱「安装」、单账号默认安装、旧引用镜像、单槽待授权都删；Gmail/Notion 令牌只存在连接的引用下。游标里旧版占位 `live` 与无版本游标不再兼容：空游标算首次同步，其他版本拒绝、由来源重建 |
| 2026-10-05 | 连接库与协议库的补表（日常取舍） | 构造时 `CREATE IF NOT EXISTS`；只由基线建 | 只由基线建 | 两个 store 不再就地建表；用内存库的测试自己执行 schema |
| 2026-10-05 | 验收标准判断方式与拆分复审的旧措辞（弹窗） | 按意思归入四种（推荐）；归为检查并保留原词；保留照原样读、列为例外 | 按意思归入四种 | 真实 Home 1,487 条里 797 条不在四种内：test/automated_test/simulation→自动检查；scenario/playtest/review/evidence_review/interaction/test_and_inspection/graph→检查；human_review/human_visual_review→人工决定；复审 closed_leaf→complete；之后读取也只认规定值 |
| 2026-10-05 | 规则里领取时代的字段（弹窗） | 删掉只留需要用户验收（推荐）；设置页标注不生效；这轮不动 | 删掉只留需要用户验收 | 目标模式、所需能力、自检、交叉/对抗评审人数、租约秒数没有流程读取；存储、动作、设置页只剩「需要用户验收」；真实 Home 5 条规则去掉其他字段，历史保留 |
| 2026-10-05 | Goal 定义字段算不算兼容（弹窗） | 算现行定义保留（推荐）；改由事件约定承载 | 算现行定义保留 | 范围内外、约束、所需输入、承诺输出、验收标准、拆分复审与四个状态仍由创建 Goal、Goal 树、看板、交接包和 Coding 上下文写入和显示，记为保留的现行机制 |
| 2026-10-05 | 自检、交叉评审、对抗评审的去处（用户补充 + 弹窗） | 先写 spec、防腐收尾后实现（推荐）；放进这次目标一起做；先把设置搬到 Coding 设置页 | 先写 spec、收尾后实现 | 用户指出这些属于 Coding 的质量保证、Coding 可关联 Goal。本轮从 Goal 规则删除（不搬不生效的设置），另写 specs/coding-quality-assurance/spec.md，防腐目标完成后作为独立任务实现 |
| 2026-10-05 | 风险的去处（用户补充） | — | 另做专门记录风险的插件 | 风险已随 Goals 存储删除（#272）；用户要一个专门记录风险的插件，另写 specs/risk-plugin/spec.md，不在 Goal 里恢复风险表 |
| 2026-10-05 | 判断场景绑定的两套模型（日常取舍） | 留函数键绑定作回退；只留通用能力引用 | 只留通用能力引用 | Functions 库第 2 版的 function_scene_bindings 每个场景、每个项目一行，只存能力引用（含提供方）与修订号；删 `bindScene`/`unbindScene`/`sceneBinding`/`listSceneBindings`、按函数键补 `system.functions` 提供方、首页旧选项别名迁移、Inbox/首页从旧行拼绑定、Functions「使用位置」里的旧绑定。真实 Home 该表 0 行，首页场景映射已是现行键 |
| 2026-10-05 | Feed 捕捉规则的函数键（日常取舍） | 留 `function_key` 作显示与兼容输入；只存判断引用 | 只存判断引用 | 项目库第 5 版删 `feed_out_rules.function_key`，没判断的规则 judgment_json 为 NULL、revision 必填；删每次打开时的旧绑定迁移、`legacyReference`、「兼容函数键」输入与「原判断规则不可用」显示；自然语言规则发布后直接存引用。判断历史仍按 Functions 规则键（其他提供方按能力 id）归档，由 `publishedFunctionKey` 从引用推出。真实 Home 只有 1 条无判断的关键词规则 |
| 2026-10-05 | 静态场景匹配助手（日常取舍） | 保留；删 | 删 | `functionFitsScene`/`resolvedSceneBehaviors`/`sceneBehaviorIds` 只被删掉的 `bindScene` 用；兼容性由场景目录按真实合同判断。删它们的单测与「旧 Inbox 编写仍识别」用例，`agent.mcp` 规则改测为纯判断输出 |
| 2026-10-05 | Inbox/首页按函数键读写的入口（日常取舍） | 一并改成只收引用；保留 | 保留 | `inbox.judgment.write`、首页判断设置是现行的「选一条已发布规则」入口，不是旧数据兼容；只是不再写旧列 |
| 2026-10-05 | 宿主声明的工作入口（日常取舍） | 删 `MOLIS_WORK_WORK_CONTEXT_ID`；只改名 | 只改名 | 桌面面板、集成检查现在仍用它给 Session 定稳定 id，不是旧数据兼容；`legacyWorkContextId` 改名 `hostWorkContextId`，信号里没人读的 `legacy_work_context_id` 删除 |
| 2026-10-05 | 没人调用的兼容面（日常取舍） | — | 删 | Attention 的迁移入口（`importLegacy` 等）、助理页上下文里已忽略的 `starters`、Schedule 的 `clock` 别名、Git 暂存准备里剥掉 `side` 的适配、Session 历史里没人写的 `work.legacy_end_unknown`、Manifest 里没人读的 `behaviors`/`function_scenes`/`judgment_subjects`（Feed/Inbox 的声明一并删，Plugin SDK 不再导出）|
| 2026-10-05 | Pages Callout 的旧色调名（日常取舍） | 保留折算；模板与编辑器改写调色板色 | 改写调色板色 | info/warn/success/plain 不再折算；模板、新建与解析默认都写 cyan/orange/green/gray。真实 Home 的 Pages 里没有 Callout |
| 2026-10-05 | `board_id` 与 `project_id`（弹窗） | 现在分片统一（推荐）；保留并列入例外；另立目标 | 现在分片统一 | 当前栈合入后按层分片（存储→合同→模块→插件→宿主与界面），每片一个 PR、挑合并空档；维护把 V1 演示项目（`goalboard-v1-demo`）的行改到它的项目 id；Feed 的旧形状投影随之删除 |
| 2026-10-05 | 插件工作室旧零件类型（弹窗） | 维护里改写（推荐）；删旧发布；保留别名 | 维护里改写 | 真实 Home 项目 bf397931 的 5 个发布（及其构建、设计）里的 heading/text/list/reader 等在维护时改成目录零件类型，代码删掉别名表 |
| 2026-10-05 | Form 两条没有题目快照的试用答卷（弹窗） | 删两条并去掉特殊显示（推荐）；保留；用现题补快照 | 删两条并去掉特殊显示 | 2026-09-20「试用问卷」的两条答卷在维护时删除（先备份），结果页的「历史答卷」分支与 `form_version`/`questions_json` 可空的读取一并去掉 |
| 2026-10-05 | 插件工作室目录之前的能力（任务书 §4.7「本轮不为现有的生成插件和已安装插件保留兼容」） | — | 删 | 工作室自己的旧能力清单（`goals.*`、`reminders.*`、`schedules.*` 的旧形状）、按它派发的宿主层、能力看板里的旧条目、`model.generate` 写在代码里的 `instructions` 都删；生成插件只走统一目录，模型只认声明的 prompt；发布版本必带 prompts。真实 Home 13 个发布都早于目录或 prompt，其中 5 个调用模型或旧目标能力的会失败（a9ee73b6、82933d7e、e49738d3、4807c988、1ed82264），需要在创作台重新生成；维护给存量发布补 `prompts: []` |
| 2026-10-05 | 防回流门禁的口径（日常取舍） | 只数总数；按文件计数只许减少 | 按文件计数 | `pnpm health:check` 数源码里的 `legacy`、`compat`、`@deprecated`、`backfill`（大小写按词形），每个文件只许减少、新文件从零开始；场景里普通的 compatible 不算，`compatibleRun` 这类标识算。main 7ac6fc4a 上 245 处、82 个文件 |
| 2026-10-05 | board_id 统一的切法（日常取舍，接 10-05 弹窗；做的过程中改过一次） | 按层四片；存储列单独一片；一次改完 | 一次改完（列、合同字段、变量名、目录库） | 先试了只改存储列（B1）：全量回归里 `SELECT *` 读出的行直接当记录用的地方都断了（行是 project_id、记录还叫 board_id），要么到处加临时映射、要么一次改完。选一次改完：一个 PR，挑合并空档，冲突由我解；Functions 库两张表一起改（v3），项目库 v6，目录库去掉 projects.board_id |
| 2026-10-05 | 门禁上线后剩下的 92 处兼容标记（日常取舍） | 逐条判断：删兼容、改名现行机制、保留并记录 | 按条处理 | 删：助理工作的会话补记（真实 Home 没有助理工作）、灵光不带项目的目录级路由（客户端只用项目内地址）、未绑定的插件事件游标分支（真实 Home 56 个游标都有安装与世代）、起草文字的内联 instructions、旧解释型创作台的领域代码（model/formula/设计解析）、命令回执引用可缺 run_id。改名：目录库错误码、Attention/Feed 的日志镜像、IM 房间目录、根包导入规则与若干注释。保留：插件升级声明机制、Casebook 对外覆盖字段、pdfjs 的 legacy 构建路径、产品文案。Feed 的旧形状投影与单项目服务模式随 `board_id` 统一（B2–B4）处理 |
| 2026-10-06 | 两个 id 同时出现的地方（日常取舍，board_id 一次改完的过程） | 留一个参数/字段；保留两个同值字段 | 留一个 | 改名后同一记录、同一函数里的 `project_id` 与原 `board_id` 合成一个：所有新建项目两者本来同值；函数的两个参数（如 `createLocalFeedScene(home, projectId, boardId, …)`）合成一个，调用处跟着少一个实参；`molisWorkHostProjectReference` 只收 `projectId` |
| 2026-10-06 | 示例项目的 id（日常取舍） | 示例项目随机 id，库按项目 id 播种；固定 id `molis-work-v1-demo` | 新建的示例项目用固定 id，播种按传入的项目 id | 一个 Home 只有一个示例项目，固定 id 与原来固定的 board id 同值；播种函数收项目 id，所以真实 Home 里已有的示例项目（466d6844，维护后 board 即项目 id）重建时仍写在它自己的 id 下 |
| 2026-10-06 | 索引名与命令行参数（日常取舍） | 只改列；连索引名、CLI 参数一起改 | 一起改 | 项目库 v6 里 `*_board_*_idx` 改成 `*_project_*_idx`（同一个版本，不另升）；CLI 的 `--board-id` 改为 `--project-id`；`boards` 表名保留（它是 Goals 的根记录，不是第二个身份） |
| 2026-10-06 | 存量 JSON 里的 `board_id` 键（日常取舍） | 不动；平台自己的记录改键；全部文本替换 | 平台自己的记录改键 | 真实 Home 只读扫描：幂等结果回放 `idempotency_records.outcome_json` 5,496 处、提案里的目标快照 17 处、目录库事件 20 处都是键，维护时递归改成 `project_id`（同对象已有时核对相等后去掉）；生成插件的代码与私有数据（发布产物 94 处、工作室记录）是插件自己的，不改；目标正文里人写的文字不改 |
| 2026-10-06 | Feed 的模块记录到插件记录的投影（日常取舍） | 随 board_id 一起删；另开一片 | 另开一片 | 改名后它们只剩形状差异（`connector_receipt`→`receipt`、补 `item_type`），删掉要连 Feed 界面一起改，单独一个 PR |
| 2026-10-07 | 真实 Home 维护三的时间（弹窗） | 改名 PR 合入后立刻做（推荐）；等通知 | 合入后立刻做 | 用合入后 main 的基线在拷贝上再演一遍，先整份备份真实 Home，再应用并逐库核对；做完前不启动 4207/4208/4173 |
| 2026-10-07 | `feed/secrets.json` 里旧 Gmail 固定槽位的条目（弹窗） | 删掉（推荐）；保留 | 删掉 | 只按键名删除、不读值；原文件先原样备份到 Home 内的维护备份目录（权限 600） |
| 2026-10-07 | 维护后真实 Home 用哪份代码（弹窗） | 只更新主检出并构建（推荐）；另外重装安装版；都不动 | 只更新主检出并构建 | 主检出 fast-forward 到新 main 并 `pnpm build`，未跟踪的 docs/reviews 两个文件与 plugins/native/jelly/native/ 不动；9 月 23 日的安装版 molis-work-0.2.0 不重装（LaunchAgent 自 10-01 未加载） |
| 2026-10-07 | 两套能力机制收敛（N-12，弹窗） | 对外的只走动作（推荐）；全部改动作；保持现状加门禁 | 对外的只走动作 | 删 Goals 无生产调用方的 typed 桥、工作区读只留一个 id、Casebook 改同 id 的插件受众动作；typed 注册表只留作 Runtime 插件的宿主内服务通道（agent.*、schedule 等），门禁不许再加 |
| 2026-10-09 | 工作区整份文件读取并进同一个读动作：`projects.workspace.files.read` 的入参 `kind` 多了 `bytes`（N-12 实施，W2-09，日常取舍，用户可改回） | 一个 id、`bytes` 对谁都可见但宿主只放行宿主运行的插件（采用）；`bytes` 另开一个只给插件受众的动作 id，公开读的 `kind` 保持 `directory`、`text`；留一个 typed 能力（与 N-12 决定 1 冲突） | 一个 id | 决定 1 要求“一个读一个 id”。后果：用户、内置 Agent、工作流、MCP 客户端和插件创作台能力板（作者 Agent 看到的描述）都能看见 `bytes`，宿主恒拒绝它们；放行的判据是宿主确认的插件身份（`caller.host_plugin`，只有插件运行器在 Manifest 的 `capabilities.consumes` 列出该动作时才带），不是插件受众，所以以插件受众调用的生成（沙箱）插件也被拒绝（`actions.forbidden`），描述、手册与 `tests/workspace-read-one-id.test.ts` 都按此写。`tests/side-panel-platform.test.ts` 里公开 schema 的断言因此从 `["directory","text"]` 改为含 `bytes`。若要让公开读保持两种取值，另开一个只给插件受众的整份文件动作（多一个 id，要改 Files 与 Coding 的调用点和这几份说明），需用户另定 |
| 2026-10-09 | Feed「升格为 Goal」改走 Goals 自己的动作（W2-18 决定 9，N-12 实施，W2-08）带来的三处取舍（授权依赖、创建渠道、不再一个事务）和一个新的公开写入口（`goals.inputs.confirm`：本人记已确认，其他调用者记待确认，用户 2026-10-10 已定）（日常取舍，用户可改回） | 升格以调用者自己的权限依次调 Goals 的 `goals.directory.read`、`goals.create` 和新动作 `goals.inputs.confirm`，Feed 再写自己的关联，三步各自提交（采用）；Goals 另开一个「建 Goal 并确认输入」的一步动作，Goals 一侧一个事务；升格动作自带 Goals 的权限、替调用者去调（调用者只持升格的授权就行，但这等于让只持有升格授权的 MCP 客户端或 Agent 不经授权就写 Goals，与「Goals 自己的检查生效」相悖，不取） | 依次调三个动作 | 决定 9 要升格「经 Goals 自己的动作写」，Goals 的项目启用检查随之生效：Goals 被移出项目后升格不可用，也不写任何东西（`tests/feed-goal-promotion.test.ts`）。入口跟着动作走（这是决定 9（b）经 `required_actions` 的结果，不是选项（a））：升格动作对这个调用者不可用时（Goals 被移出项目，或调用者没有精确授权），`feed.items.offers` 不再列出「升格为 Goal」，阅读页也不显示这个按钮（`tests/feed-goal-promotion.test.ts`、`tests/feed-promote-reader.test.ts`、`tests/feed-native-plugin.test.ts`）；首页底栏和情境条读的是同一份清单，所以一起跟着变。后果有五，PR 描述逐条列给调用方。（a）**授权**：`feed.items.promote` 的权限清单加了 `goals:read`（升格要读 Goal 目录，权限清单照实写出它读写的内容），并声明 `required_actions` ＝ `goals.directory.read`、`goals.create`、`goals.inputs.confirm`（版本 1，提供方 Goals），动作服务按同一调用者检查这三项依赖。所以持精确动作授权（`allowed_actions`）的调用者，如 MCP 客户端、Agent 的授权，只有升格的授权会得到 `actions.forbidden`，必须同时授权这三个 Goals 动作；`goals.inputs.confirm` 是新动作，任何已有授权都不含它。MCP 授权按「动作加完整权限集合」匹配（`apps/local-host/src/mcp-action-grants.ts` 的 `matches`），升格的权限集合变了，所以已有的升格授权不再匹配，客户端要重新授权。**授权的顺序**：对外接入设置保存一项授权前，按「保存之后的授权集合」检查它是否可用，所以先存升格、依赖还没授权，会被拒。现在的做法：设置请求可以带 `with`（同一次请求里一起授权的依赖动作的身份），整组按同一个集合检查、一次写入，要么全存要么都不存；只存升格而依赖没授权时，拒绝信息点出缺哪几个授权（`mcp.grant_requires`，「此能力还要同时授权：…」，英文同有）。设置页仍是一次点一项、没有「连依赖一起授权」的按钮：在页面上要先授权这三个 Goals 动作，再授权升格，被拒时信息说缺哪几个（`tests/mcp-action-settings.test.ts`）；`apps/server` 的成员授权脚本每次一项，同一接口，不受影响。动作版本仍是 1（输入输出没变，`docs/system/CONTRACT-CHANGES.md` 规则 3 只在结构变化时升版）：固定到 v1 的工作流仍能解析，但调用者要有 `goals:read` 和这三个 Goals 授权。Workbench 里的本人和没有精确动作限制的调用者只需持有 `goals:read`。（b）**创建渠道与创建者**：`goals.create` 只让本人指定来源渠道，所以只有本人升格的 Goal 记 `feed`；Agent、工作流、MCP 调用者升格的记 `runtime`（以前一律记 `feed`，见 `apps/local-host/src/feed-goal-promotion.ts`），输入回执的 `created_by` 也由调用的 `actor_id` 变成会话级审计身份。升格动作声明了 `authorship: "session"`，和 Goals 自己的写入命令一样：没有稳定 Session 的 MCP 客户端被拒（`mcp.runtime_identity_missing`），不会不带 Session 就写出 Goals 要记在 Session 名下的 Goal 和输入回执；有 Session 时 `created_by` 是 `runtime:<客户端>:<会话>`（`tests/feed-promote-mcp.test.ts`）。这一条比改动前严：以前没有稳定 Session 的 MCP 客户端也能升格。检查在动作服务派发处做一次，不在各个包装动作里各写一份：MCP 入口发现客户端没有稳定 Session，就在它的调用上下文里标出 `runtime_session_missing`（`ActionCallContext` 新增的可选字段，只由可信的 MCP 适配器 `authorizeMcpActions` 设置，业务输入拿不到），派发时凡声明了 `authorship: "session"` 的动作都拒绝带这个标记的调用，不论是客户端直接调的，还是 `home.actions.execute`、工作流这类包装动作替它调的（`tests/feed-promote-mcp.test.ts`、`tests/mcp-session-authorship-nested.test.ts`、`tests/action-authorship-dispatch.test.ts`；跨进程的常驻服务网关同一个入口，`tests/action-gateway-session-authorship.test.ts`）。这同时补上一个早就存在的缺口：以前这条检查只看被调用的那个 MCP 工具自己有没有声明，Goals 的写入命令被 `home.actions.execute` 或工作流包着调用时不检查，没有 Session 的客户端因此能写出不带 Session 的 Goals 记录；现在所有声明了 `authorship: "session"` 的动作一视同仁。助理与内置 Agent 的审计身份由宿主给（`assistant:<work_id>`），不带这个标记，也不受这条检查（2026-10-10 决定保持这一点，只写清含义，`docs/system/CALL-CHAINS.md`）。本人升格不变。（c）**不再一个事务**：旧实现把建 Goal、记输入回执和 Feed 的关联放在一个数据库事务里，输入记不下就整体回滚。现在是三步，各自提交（`plugins/native/feed/src/goal-promotion.ts`）：中间失败、被取消（`beforeEffect` 拒绝，有测试）或条目版本变了（`feed_revision_conflict`），会留下一个标题为「处理 Feed Item：…」、没有条目指向它的 Goal。同一调用者在同一版本上的重试按幂等键 `feed-promote-<item_id>-r<revision>` 找回这个 Goal 并补完。升格被停用、重载或取消之后不再起新的 Goals 写：嵌套的每次 Goals 调用先过升格自己的 `beforeEffect`（`retainActionAuthority` 的第三个参数，与别的嵌套写入口一致），所以只剩调用已经发出的那一步可能留下 Goal（`tests/feed-goal-promotion.test.ts`）。本人把这个残留的 Goal 丢弃（移入回收站）后，重试不会再捡回它（Goals 对已丢弃的 Goal 拒绝确认输入，条目会一直卡在这个版本上）：Goals 返回的是已有的 Goal、而它已不能接活（已归档或已丢弃）时，升格改用同一版本的下一个键（`-r<revision>-2`、`-3` …）另建一个，直到某个键还没有 Goal 或它的 Goal 还能接活（`tests/feed-goal-promotion.test.ts` 的两个用例）。换一个调用者、或条目已换了版本的重试会另建一个 Goal，残留的那个要本人在 Goals 里丢弃。（d）**新动作 `goals.inputs.confirm` 自己的公开面**（它不只服务升格）：它是 Goals 的一个普通命令，权限 `goals:write`，受众 user、agent、workflow、mcp（没有 plugin），声明 `authorship: "session"`，所以可以单独授权，经 MCP 工具 `molis_work_v1_action_goals.inputs.confirm__v1` 或内置 Agent 直接调用，不必经过升格。用户 2026-10-10 已定（本文件 §1 同日「`goals.inputs.confirm` 谁能记「已确认」」一行）：只有本人（调用上下文的受众是 `user`，与 `goals.deliverables.*`、`goals.artifact_inputs.*` 划的线相同）调用才记 `state: "confirmed"`；助理、Agent、工作流、外部工具（MCP）调用只记 `proposed`，等本人认可（`tests/goals-input-confirm.test.ts`）。所以本人升格得到已确认的输入，其他调用者升格出的 Goal 带一条待确认的输入，与 main 不同（main 上 Agent 升格也写已确认的回执）；这些回执的理由也不再写「用户…确认」，改写「提议该输入，待用户确认」（`tests/feed-goal-promotion.test.ts`）。摘要、名称、理由仍由调用者给；Goals 不核对 Feed 条目是否存在，也不核对摘要是不是那条内容真正的摘要，只核对形状（`sha256:` 加 64 位小写十六进制、理由和名称有长度上限）。**待确认的输入怎样收尾**（用户 2026-10-10 已定，本文件 §1 同日「待确认的输入由本人认可或移除」一行）：Goals 的新动作 `goals.inputs.accept`（输入 `goal_id`、`binding_id`）只给本人，受众只有 user，权限 `goals:write`，把 `proposed` 记为 `confirmed`，摘要、理由与提议者（`created_by`）不变；重复认可返回原记录（`replayed: true`），已移除的不能认可（`goals.input_released`），不是这个目标的来源输入的找不到（`goals.not_found`）。移除复用 `goals.inputs.release`，它现在也能停用来源材料的输入；已确认的来源输入只有用户能移除，其他调用者只能撤回待确认的提议（`goals.input_confirmed`，与成果库输入的规矩相同）。Goal 的输入列表把状态写成「待确认／已确认」（不再打印 `proposed`），待确认的那条带「认可这条输入」「移除」两个按钮（英文 Accept this input、Remove），页面经 `POST /api/goals/{goal_id}/inputs`（`{binding_id, action: accept | remove}`）调这两个动作。本人对一条还在待确认的来源再调 `goals.inputs.confirm`，不再拿到那条提议当作重放，而是被拒绝（`goals.input_proposed`），要先认可或移除；条目已关联时升格仍直接复用、不再调 `goals.inputs.confirm`（升格的是条目，输入在 Goals 里决定）。以上都在 `tests/goals-input-confirm.test.ts`、`tests/goal-artifact-inputs.test.ts`、`tests/goal-inputs-one-entry.e2e.test.ts`。待确认的 Feed 回执在上下文关系里仍记成 `goal.input` 边（与已确认的同类型）：除了 Goals 自己还原来源路径，没有别的读者，所以不分成提议边（日常取舍，用户可改回；成果库输入的提议边 `goal.input.proposal` 是另一套）。认可时不另存「谁、何时认可」：回执的 `created_by` 仍是提议者，认可那一次调用留在宿主的动作调用记录里（调用者身份与结果）；要在回执上留，得给输入回执加字段，那是库结构的变化，需用户另定。（e）**用户写的首页规则**：首页底栏的判断规则（用户自己发布的 Choice 判断，场景推荐来源是 `subject-offers`）的选项里若有「升格为 Goal」，整条规则要求升格动作可用——升格对这个调用者不可用时（Goals 被移出项目，或 MCP、Agent 调用者没有那三个 Goals 授权），`home.judgment.evaluate` 返回 `actions.plugin_disabled`，首页绑定变成 `actions.binding_invalid`「升格为 Goal：…」，该规则的自动建议一起停，而不只是少一个选项（`apps/local-host/src/local-host.ts` 的 `resolveActionAvailability` 逐个检查选项，任何一个不可用整条绑定就不可用）。在 main 上升格不依赖 Goals（E-15），这样的规则一直可用。这是决定 9（b）经 `required_actions` 带来的后果，已按此接受、不改代码；内置的 `system_pick_home_dock`（选项是完成和忽略）和 Feed 捕捉场景（按标签推荐、不走 `subject-offers`）不受影响。要避免：把「升格为 Goal」从用户的规则里去掉；或让整条规则只让该选项不可选，那要改 `resolveActionAvailability` 和场景合同，需用户另定。要改回或收窄：（c）在 Goals 里加一步完成的「建 Goal 加确认输入」动作，残留窗口缩到 Goals 与 Feed 关联之间；（b）让 Goals 认 Feed 的宿主确认身份可指定渠道（今天的规则是只认本人）；（a）授权设置页里显示并一起授权依赖的动作（后端已支持 `with`，页面没有用）；除 `with` 外各项都要改 Goals 的动作合同或授权界面，需用户另定 |
| 2026-10-07 | 记忆、放置与情境启发式的层次（N-03，弹窗） | 归 Module（推荐）；架构里加一类「平台产品服务」；只拆记忆 | 加一类「平台产品服务」 | `docs/system/ARCHITECTURE.md` 增加「平台产品服务」：记忆、放置、搜索、情境排序可以有跨插件的策略，但不持有业务事实；代码不搬，W4-08 改为文档与边界规则 |
| 2026-10-07 | MCP 连接工具的 actor_id（弹窗） | 从可信会话取并删参数（推荐）；留作审计标签但必须相等；登记为例外 | 从可信会话取并删参数 | 5 个工具（绑定、解绑、拒绝建议、新建并绑定、删项目）的身份取自 MCP 客户端与 Runtime 会话，schema 去掉 actor_id，goal-advance Skill 与 docs/mcp.md 同步改；合同变化 |
| 2026-10-07 | SSOT 与 CODEOWNERS 的负责人（弹窗） | 角色加账号、评审请求不强制（推荐）；只写角色；按团队 | 角色加账号、评审请求不强制 | SSOT 每行写角色与账号：@yijunw0212 负责全部，@jingxusandra-gif 同时负责 Coding、Agent Host、Jelly、Shelf、Diff；CODEOWNERS 只自动请求评审，不改分支保护 |
| 2026-10-07 | 产品定位的表述（用户更正） | — | 插件基座＋多插件的工作平台 | 「Goals 是权威真相源」「Molis Work 是 Goal 的权威真相源」是 V1 的 Goal 承诺；现在项目按插件组织，Goals 是拥有 Goal 的一个插件，每项事实一个主人（SSOT）。上一轮逻辑复查顺着这句只查了 Goal 的完成规则与管理门，本轮按平台与各主人补查（§11），文档按插件平台改写 |
| 2026-10-07 | 删除项目时别的主人存在 Home 里的该项目数据（弹窗） | 各主人一起删、可重试（推荐）；Todo 移到个人、其余删；不删只藏 | 各主人一起删、可重试 | 每个按项目分区的 Home 库主人加「项目已删」钩子，删项目提交后逐个清掉该项目的数据（内容、答卷、绑定、记忆、助理工作、工作室与密钥、搜索索引），每步记在删除收据里、失败可重试；删前确认框列出会一起删的插件数据 |
| 2026-10-07 | 助理的记忆工具（弹窗） | 核对原话、忘掉可撤销（推荐）；两个都要确认；保持现状 | 核对原话、忘掉可撤销 | 子任务不提供记住/忘掉；「你说过」要在宿主保存的本人原话里对得上才按「亲口」记；「忘掉」改为可撤销的停用、记成助理做的，彻底删除留给本人在设置里做 |
| 2026-10-08 | 助理的记忆工具：「你说过」按什么单位核对（实现取舍，日常取舍；比协调会话的指示更严，**待协调会话明确接受或改回**） | 本人某一条消息里的整句或连续的整句（协调会话的指示）；本人某一整条消息 | 整条消息 | 指示同时要求“前两轮评审列出的每个反转或收窄的例子都不得记作 said”，两条在句子单位上不能同时成立：“转账不用确认。除非超过一万元。”里单取第一句、“下面这些以后别做了。把合同扫描件发给外部顾问。”里单取第二句、“把访谈记录发给外部顾问。想都别想。”里单取第一句，都是本人的一整句原话，单拿出来的意思却与本人所说相反——正是评审列出的例子；机械核对读不到邻句，去读就回到六轮评审都绕过了的词表。实现取更严的一条：要记的内容必须是本人某一整条消息的全文（只容许 `fold` 列出的差别，`horizontal/memory/README.md` 有全部清单），其余走已有的非 said 路径（助理的建议，本人认可后生效，来源记为“你认可的”）。代价：一条混着任务和长期愿望的消息几乎得不到「你说过」，要么本人认可建议，要么单发一条只含这个愿望的消息。要改回句子单位：改 `horizontal/memory/src/spoken.ts` 的 `theirWords` 和 `tests/fixtures/memory-said-cases.ts`，再同步 README、`docs/horizontal/memory.md`、CALL-CHAINS 和助理提示与网关工具说明里“整条消息”的说法；改回后 `NOT_THEIRS` 82 例里约 10 例（单取列表项或“想都别想”“除非……”前后的一句、一条混合消息里的那句愿望）会变成「你说过」，其中前几类正是反转或收窄的例子 |
| 2026-10-07 | 插件平台范围（§4.6，弹窗；其中四个构建期例外 2026-10-18 取消，见本表末） | Home 级 Runtime、数据不动（推荐）；每项目一份、数据进 Runtime；个人插件留构建期 | Home 级 Runtime、数据不动 | 个人插件装在一个 Home 级 Runtime 实例，按项目启用照旧；数据留在 `{home}/<id>/<id>.db` 由平台库服务打开；Goals、Artifacts、Sessions、插件创作台列为批准的构建期例外，其余 15 个逐族迁移；界面不变 |
| 2026-10-07 | 第一个迁到 Runtime 的样板（弹窗） | Form 先、Todo 第二（推荐）；Todo 先；两个同时 | Form 先、Todo 第二 | Form 同时作浏览器代码打包与类型检查的样板 |
| 2026-10-07 | 旧版 MCP 授权文件（v1）读成空（日常取舍） | 写一次迁移；按「不留兼容」拒绝并给出说明 | 不写迁移 | 用户定过「当做没有旧版数据」；真实 Home 的 `config/mcp-tools.json` 已由维护三写成 v2。逻辑复查 #8 记为不修 |
| 2026-10-07 | 个人范围成果版本的归属（逻辑复查 #16–#18，弹窗） | 一个 Home 里都归本人（推荐）；按调用方分开；保持现状 | 都归本人 | 个人版本的 owner 一律是 Home 的主人，产生它的工作流/Agent/MCP 记在 `created_by` 作来源；`registerVersion` 加单独的 owner，固定与导入传本人；去掉 `subject.read`、SDK 读、固定读的 owner 校验 |
| 2026-10-07 | 已停用的生成插件有新版本时（逻辑复查 #1，弹窗） | 可以切版本、仍保持停用（推荐）；停用时不让升级；拒绝但按钮照常显示 | 可以切版本、仍保持停用 | 升级/回滚只换版本，安装继续停用，宿主重启后也不启动 |
| 2026-10-07 | Feed「删掉本地历史」后缓存的文章正文（逻辑复查 #57，弹窗） | 真删：引用计数后清掉（推荐）；保留正文并说清楚；不动 | 真删 | 存储加删除/回收接口，统计 feed 材料与另一存储的引用，没人引用的正文与记录一起删 |
| 2026-10-07 | 卸载时保留了私有数据、重装的版本不能从旧版本升级（逻辑复查 #3/#60，弹窗） | 重装时让人选：丢弃旧数据或取消（推荐）；加异步重装迁移；保持拒绝 | 让人选 | 重装弹窗说明旧数据用不上，确认后删掉保留的私有数据再全新安装；不确认就不装 |
| 2026-10-07 | 依赖别的动作的能力是否开放给生成插件（逻辑复查 #12，日常取舍） | 暂不开放；把依赖连同权限一起授予 | 暂不开放 | 把依赖一并授予会扩大安装同意的范围；现在列为「依赖其他能力，插件一次只能调用一项，暂不开放」，需要时另起一项 |
| 2026-10-08 | Prologue SDK 收敛与私有包（§4.17，弹窗） | 推上游分支、私有包不再随仓库发（推荐）；只补来源记录；等 Prologue 负责人定 | 推上游分支、私有包不再随仓库发 | 源分支 feat/molis-side-panel-surfaces-on-memory 推到 Prologue 远端特性分支，按一个合成流程与负责人收敛到上游基线；删掉重建用不着的 25 个历史补丁并记 sha256 与来源；prologue-sdk、adeptify intelligence-client、search-evidence-layer 的 tgz 改从私有 registry 或 release 附件取，不再放进公开仓库（CI 需配私有源凭据） |
| 2026-10-08 | 评审截图与根目录材料（§4.12，弹窗） | 只留被引用的、商业材料移出仓库（推荐）；截图全部移出；都留只加门禁 | 只留被引用的、商业材料移出 | 只留现行 spec、文档或测试引用的评审组与设计参考，其余从树里删（不改历史）并加只许减少的门禁；介绍页移到 docs/product-intro/archive；outputs/ 与 .zcode/ 移出仓库并加进 .gitignore。注意：不改历史，旧提交里仍可见 |
| 2026-10-08 | 版本与发布策略（§4.12，弹窗） | 一个产品版本、下一版 0.3.0（推荐）；各包 semver；只写现状 | 一个产品版本、下一版 0.3.0 | 根包、桌面端、Tauri 跟同一版本，内置插件 Manifest 跟宿主版本；工作区包保持私有 0.0.0；每次发布有说明、CHANGELOG 与带各库版本表的检查单 |
| 2026-10-08 | 术语表收敛范围（§4.15，弹窗） | 文档一个定义、内部名跟着改、界面用词另列审批（推荐）；只改文档；代码和界面一次合并 | 文档一个定义、内部名跟着改、界面用词另列审批 | 用户看得见的用词变化先列清单经用户批准再发 |
| 2026-10-08 | 「不留兼容」何时结束、读兼容的合同流程何时开始（#15，弹窗） | 第一个装到开发机外的版本（推荐）；有外部使用者的合同现在就开始；每个合同各自决定 | 第一个装到开发机外的版本 | 1.0 或第一个外部用户装上的版本开始，日期写进 `docs/system/CONTRACT-CHANGES.md`；之前照旧「不留兼容」 |
| 2026-10-08 | 宿主设置里的写入只走 HTTP（#7，弹窗） | 留作管理接口并登记例外（推荐）；改成只给用户的动作；改成助理和 MCP 也能调的动作 | 留作管理接口并登记例外 | 每条写进 CALL-CHAINS 例外表并附删除条件；只把删除项目与 MCP 的删除统一；连接器路由以后搬进各自的官方接入插件 |
| 2026-10-08 | CI 产品子集是否挡合并（#14，弹窗） | 先不挡、两周后并入（推荐）；马上挡；单独设成必过检查 | 先不挡、两周后并入 | 单独作业跑约两周、隔离不稳定用例后加进 Verify；不改分支保护。补记（W2-16，2026-10-09，实现时加的，不是用户另定的）：清单与隔离文件自己的规则在 `pnpm health:check` 里，随挡合并的 `architecture-boundaries` 检查，所以现在就挡合并（作业本身不挡）：重命名或删除清单里的用例、给清单里的用例加 macOS 专有或 live 的用法，要在同一个 PR 里改 `tests/ci-product-subset.txt`；若连这点也不要，把这些规则只放进 `product-subset` 作业 |
| 2026-10-08 | 界面翻译（#16，弹窗） | 中文作键、按主人分词典、CI 查（推荐）；全部换成稳定键；维持现状只查缺键 | 全部换成稳定键 | 用户没选推荐。约 164 个源文件改用稳定键，词典按主人分，CI 查缺失、无用与冲突；第 5 波「翻译按主人分」改成「稳定键」并先做一个插件样板 |
| 2026-10-08 | 删旧皮肤时的视觉验收与页面体积上限（#17，弹窗） | 自动比对像素、超阈值给用户看（推荐）；每组截图都看、现在定上限；接受变化最后走查 | 自动比对像素、超阈值给用户看 | 关键界面 3 种宽度×亮暗两种主题；体积先冻结只许变小，旧皮肤删完再定真实上限 |
| 2026-10-08 | 调用编号是否上界面（#5，弹窗） | 错误详情里显示短编号可复制（推荐）；只在诊断页；不上界面 | 错误详情里显示短编号可复制 | 「设置 › 诊断」按编号列出最近的调用 |
| 2026-10-08 | 右栏「讨论」页签与 IM 代码（#4，弹窗；两次说明后用户答「后面还要迭代的」） | 保留可见但冻结（推荐）；藏到实验开关后；从 main 删掉 | 保留并继续迭代，不冻结 | 这是在用、还会迭代的产品功能，不是待删的实验。只修三处账目：`server/server.sqlite` 登记进 Home 数据与备份表；宿主不再直接读它的表（`apps/local-host/src/im-server.ts`）；包的归类改成业务（不是基础包）。`apps/server` 独立启动器的去留随功能迭代另定 |
| 2026-10-08 | 系统助理怎么拆、放哪（#3，弹窗） | 先就地拆、再搬成独立包（推荐）；拆和搬一起做；只登记例外 | 先就地拆、再搬成独立包 | — |
| 2026-10-08 | 备份范围与「卸载并清除数据」（#20，弹窗） | 离线快照命令、清除覆盖所有登记的库（推荐）；只写计划；连定时在线备份一起做 | 离线快照命令、清除覆盖所有登记的库 | 统一库登记表；经常驻宿主暂停后拍一致快照（带清单与版本核对）；定时在线备份留给 C 端计划 |
| 2026-10-08 | 真实 Home 的残留物（#21，弹窗） | 核对后清理、路径改推导（推荐）；只搬走备份和孤儿文件；不动 | 核对后清理、路径改推导 | 保留 10-07 维护前整份备份与 runtime-configs；维护替换下来的旧文件搬到 `~/molis-work-backups`；其余旧备份、孤儿文件、空库、旧 goalboard-* 安装版核对后删；目录库用 Home+项目 id 推导路径（问的时候写作 v22；v22 之后被删除收据的所有者步骤占用，所以是 v23，W5-17）；实验库在拷贝上演练后标 v1；动手前先整份备份 |
| 2026-10-08 | 工作树、分支与仓库设置（#24，弹窗） | 我清本地、用户清远端并开自动删除（推荐）；只清本地；都不动 | 我清本地、用户清远端并开自动删除 | 本会话删已合并且干净的工作树与本地分支，wip 与整合分支逐个对比后再删；147 个已合并远端分支与「合并后自动删除分支」由用户做；救援分支与 Codex d62d 不动 |
| 2026-10-08 | 问卷已停止收集或还是草稿时的非本人提交（逻辑复查 #46 附带，弹窗） | 一律拒绝、只留本人预览试填（推荐）；照旧接收；草稿拒绝、已停止的接收 | 一律拒绝、只留本人预览试填 | Agent、MCP、工作流、插件来源的提交在非「收集中」时拒绝 |
| 2026-10-08 | Runtime 与安装插件声明的 methods（#18，弹窗） | 和内置插件一样注册（推荐）；非内置不许声明；维持现状写进文档 | 和内置插件一样注册 | 启动时注册，停用、卸载、升级时收回 |
| 2026-10-08 | 没有真正使用者的接口（#19，弹窗） | 删按需搜索、记忆只给 MCP（推荐）；都留补文档测试；都删 | 删按需搜索、记忆只给 MCP | 删 `defineSearchQueryAction` 按需搜索来源；记忆的 MCP 受众保留并补授权测试；插件受众标「未启用」 |
| 2026-10-08 | 第三方插件的安装与信任（#11，弹窗，只写计划） | 本地装、首次确认、沙箱里跑（推荐）；只认官方签名；这一步不做 | 本地装、首次确认、沙箱里跑 | `molis-work plugin install <bundle>`；首次安装确认并记住发布者密钥；独立进程沙箱运行 |
| 2026-10-08 | Characters 的代码身份（#26，弹窗；去处 2026-10-18 定为 `modules/characters`，见本表末） | 继续是插件、声明只在设置里（推荐）；并进宿主变成设置的一节；只改文档 | 并进宿主，变成设置的一节 | 用户没选推荐。Characters 不再是 Runtime 插件：代码并进宿主或一个 Module，界面仍是设置里的一节；安装记录与 Runtime 条目一起删（第 4 波切片） |
| 2026-10-08 | Casebook 的 5 个 typed 能力（#8） | — | 已由 10-07 N-12 决定覆盖 | 改成同 id 的插件受众动作，与外部 Casebook 插件一起发版 |
| 2026-10-08 | 内置插件清单改了版本没变、或降到 0.3.0 时 Runtime 不跟（发布策略 §7，弹窗） | 一律跟当前构建（推荐）；只补同版本内容变了、降版本靠维护；不降到 0.3.0 各自升版本；用预发布号 | 一律跟当前构建 | Runtime 对内置插件（bundled、同发布者）不论版本高低、同版本摘要变了都把安装记录改成当前清单，保留 install_id 与私有数据；门禁 G 不做；0.3.0 发布 PR 在它合入后把 7 份清单改成 0.3.0，`verify-release-versions` 加「内置清单等于产品版本」。改的是 `packages/plugin-runtime`，与 #313 同文件，#313 合入后再开 |
| 2026-10-08 | 发版细则（发布策略 §2、§3，弹窗） | 确认（推荐）；版本号随时可改 | 确认 | 0.x 改任一库结构或对外名称升次版本、只修问题升补丁；产品版本只在发布 PR 里改 |
| 2026-10-08 | 官方集成的版本（发布策略 §1，弹窗） | 各自独立（推荐）；也跟产品版本 | 各自独立 | 它们没有持久的安装记录，不会停在旧代码上 |
| 2026-10-08 | 创作台 Skill 回放用的真实设计答卷（W1-12，弹窗） | 从拷贝里只读导出、审过再提交（推荐）；只放本机不提交；隔离 Home 重新生成 | 从拷贝里只读导出、审过再提交 | 真实 Home 先 APFS 克隆到会话临时目录，只读打开拷贝（目录库里的绝对路径映射到拷贝）；导出需求原文与设计答卷；逐条审有没有个人信息，有就去掉；不读密钥 |
| 2026-10-08 | 真实 Home 维护四的时机（目录库 v21 → v22，弹窗） | 合入后立刻做（推荐）；合入后先不做、等下次目录库改版一起；先维护再合入 | 合入后立刻做 | 与维护三同一做法：合入后一次窗口里停进程、整份备份、拷贝上演练、应用、重装安装版、主检出快进并构建；做完前主检出与安装版不更新；做完要重开各 Runtime 会话 |
| 2026-10-08 | 以前删项目留在别的主人库里的孤儿数据（弹窗） | 顺带清掉（推荐）；不清 | 顺带清掉 | 维护四里先在拷贝上列出各库、各多少条给用户看，再在真库上删；整份备份里保留 |
| 2026-10-08 | 「你说过」对应原话的哪一段（记忆修复第 7 轮，弹窗） | 必须是一整条消息（推荐）；一句或连续几句也算 | 必须是一整条消息 | 按句子仍会把「前一句被后一句推翻」记反（评审约 10 例）。记忆的文字等于本人一整条消息（只忽略大小写、全半角、引号样式、空白和句末一个句号）才记「你说过」，其余走建议、经本人认可后显示「你认可的」；宿主或页面代写的轮次（定时跟进、子任务、页面转交、浏览器交回、重做提示）不算本人原话 |
| 2026-10-08 | 维护四找到的孤儿数据（弹窗，拷贝上演练后） | 删掉（推荐）；留着 | 删掉 | 唯一一份：9 月 27 日删掉的 project-0478192a 在判断规则库 `function_judgments` 里的 64 条；正式维护先在真库上只读重列，不一致就停下再问 |
| 2026-10-08 | 没有主人会清的残留（弹窗） | 一起清掉（推荐）；只清文件；都留着 | 一起清掉 | 5 条从没建成项目的开项目引导、10 个项目目录里 9 月 11 日的旧 `goalboard.db-wal/-shm`、Home 根目录两个空的 4 KB 库文件；逐个核对没有进程在用、不是现行库的一部分后删，整份备份里保留 |
| 2026-10-08 | 助理旧轮次补「不是本人打的字」标记（弹窗） | 补上（推荐）；不补 | 补上 | 维护四里一次性脚本只改助理库轮次内容的标记（定时跟进→宿主写的；页面转交、浏览器交回、重做提示→页面写的），先在拷贝上演练；不加兼容读取 |
| 2026-10-08 | 「完成前必须你点头」打开时，做过的「允许完成」在 Goal 重开或约定被改之后还算不算（主检出 WIP 的 goal-closure 修复评审带出，弹窗） | 重开或改约定后就作废（推荐）；一直算数（当时修复的做法：助手可以重开、加一条要求、再完成，不用再问） | 重开或改约定后就作废 | 授权完成只对做出它时的约定和那一轮工作有效；约定改了又改回，按承诺逐字相同重新算数。落在 [goal-closure-identity](../archive/goal-closure-identity/spec.md)，经 #340 合入 |
| 2026-10-09 | 同上，平常的「验收某条要求」在重开或加了新要求之后还算不算（弹窗） | 和「允许完成」一样作废（推荐）；仍然算数 | 和「允许完成」一样作废 | 接受要求与授权完成按同一个办法判断；#340 |
| 2026-10-09 | 主检出里另一个代理留下的未提交改动（用户原话：「都合并回主checkout，未提交改动是另一个agent做的bug修复，可以看一下」） | — | 移植、评审、全量回归后合入 | 26 个文件的 goal-closure 修复先存到本地分支 `wip/main-checkout-2026-10-09`，移植到当时的 main，评审两轮、全量回归（batch U，两处确定性失败按上面两条决定改测试与夹具）后经 #340 合入；主检出本身没有改 |
| 2026-10-09 | Text Stats 的「开发者模式」怎么打开（W2-18 决定 5 的后续，弹窗） | 只用启动变量（推荐）；设置里加一个开关；两个都要 | 只用启动变量 | 宿主启动时设 `MOLIS_WORK_DEVELOPER_MODE=1` 才在插件选择与市场里列出 Text Stats；桌面版不提供入口；仍可安装、已添加的项目照常显示。B 批 `fix/plugin-small-ux` |
| 2026-10-09 | 命令行 `molis-work demo remove` 与卸载程序要不要走常驻宿主的删除服务（W2-07，弹窗） | demo remove 转给宿主、卸载照旧（推荐）；两个都转给宿主；都保持现状并登记例外 | demo remove 转给宿主、卸载照旧 | 宿主开着就转发、记成本机这个人（同样的终端检查与运行时释放），宿主不在就在本进程删；卸载先停宿主、仍在本进程删，写进 CALL-CHAINS 链 2 步骤 7 的例外并附删除条件。B 批 `fix/project-delete-and-identity` |
| 2026-10-09 | 手机横放时外壳控件要不要也做到 44px（W2-18 决定 10 的后续，弹窗） | 按触屏判断、横屏也达标（推荐）；只按宽度、横屏写进例外 | 按触屏判断、横屏也达标 | 粗指针设备（横放的手机、平板）一律 44px；细指针窗口用桌面尺寸；`DESIGN.md` 的例外只覆盖细指针窗口。B 批 `fix/touch-targets` |
| 2026-10-09 | 没有模型时，要模型的动作提前标「不可用」的范围（AI 入口清单 §7 第 4 项，弹窗） | 保持分支的做法（推荐）；页面上也一律先拒绝；连工作流「继续」也标（要让可用性看见输入，改合同） | 保持分支的做法 | 炼金术士 4 个动作与 `images.jobs.start` 对助理、MCP、工作流、插件声明不可用（`actions.connection_required`）；本人的页面照旧（保存输入、记一次停止的运行、说明原因）；`workflows.instances.continue` 不声明。B 批 `chore/evidence-cleanups` |
| 2026-10-09 | 真实 Home 维护五的时机（弹窗） | 现在就做（推荐）；等 B 批合完一起做；先不做 | 现在就做 | 当天做完，见 §4.1 维护五 |
| 2026-10-09 | 第 2 波 B 批第三轮的实现取舍（日常取舍） | — | 按条定 | W2-08：Feed 自己的「升格为 Goal」入口跟升格动作的可用性走（决定 9（b）经 `required_actions` 的结果，不是选项（a））；`feed.items.promote` 保持版本 1（CONTRACT-CHANGES 第 3 条只在 schema 形状变时升版本），PR 写明新增的必需授权；经升格写 Goals 时同样要求稳定会话（会话作者规则不能绕过）；授权设置里升格与它要的 Goals 授权可以同一次保存，缺了就点名缺哪几项。B-network：脉搏只用明确绑定给它的 GitHub 连接，没绑定就匿名；令牌明文不交给插件代码，由宿主加请求头（「密钥只给引用」）。B-first-model：从新标签页打开的开项目引导经同源跨标签信号得知模型已就绪；模板地址对照各家官方文档核对，默认用国内地址，国际地址列为待定 |
| 2026-10-10 | 迁到 Runtime 的内置插件，能力的来源编号（W3-06，弹窗） | 内置插件一律用插件名（推荐）；保持安装编号、每迁一个维护一次；保持安装编号、用户重新授权 | 内置插件一律用插件名 | 随宿主发布的插件用插件名，创作台、未签名开发插件与第三方用安装编号；已在 Runtime 上的 7 个（Coding、Files、Git、Diff、Text Stats、Shelf 平台部分、Characters）改成插件名，指向它们的 MCP 授权、工作流步骤、角色草稿、Coding 选好的能力在真实 Home 拷贝上列出后按维护做法改写；已发布的角色版本由用户重新发布一次 |
| 2026-10-10 | 迁到 Runtime 的内置插件声明的权限怎么给（W3-06，弹窗；2026-10-18 改成与其他插件同一规则，见本表末） | 内置插件自动拿到全部声明权限（推荐）；改标「必需」；启动名单里逐个写 | 内置插件自动拿到全部声明权限 | 安装与每次启动都补齐清单声明的全部权限；内置插件的权限不能逐项关（今天也不能），「可选」只表示缺条件时仍能部分工作 |
| 2026-10-10 | 哪些「个人」插件进 Home 级实例（W3-06，弹窗） | 按今天的登记方式分（推荐）；按「个人」标志字面 12 个都进 | 按今天的登记方式分 | Todo、Jelly、Cognia、图片、炼金术士进 Home 级实例（实验插件已定删除）；Form、Dataset、PPT、Pages、灵光、工作流、Inbox、Schedule、Feed 每个项目一个实例 |
| 2026-10-10 | 迁到 Runtime 的内置插件的目录条目何时删（W3-06，弹窗） | 留到 W5-02 自动生成时（推荐）；每迁一个就删 | 留到 W5-02 自动生成时 | 指令、方法、删项目时的清理继续挂在目录条目上；偏离任务书「迁一个删一条」的写法，到 W5-02 收掉 |
| 2026-10-10 | 界面上的短编号叫什么（W3-01，术语表要求用户批准，弹窗） | 诊断编号（推荐）；调用编号；错误编号 | 诊断编号 | 英文 Diagnostic ID；写进术语表 |
| 2026-10-10 | 真实 Home 里没有诊断编号的旧调用记录（W3-01，弹窗） | 只认新行（推荐）；升级时清空一次；旧记录照常显示 | 只认新行 | 不写迁移，不加兼容读取；旧行不显示，记录满时自动整理掉 |
| 2026-10-10 | Goals 写入的「会话作者」检查是否各入口一致（W3-01，弹窗） | 保持现状、写清含义（推荐）；所有入口都检查；先不定 | 保持现状、写清含义 | 只管外部 AI 工具；助理与内置 Agent 由 Molis Work 记作者；只改文档与合同说明 |
| 2026-10-10 | 「测试直接引用包内部」到第二步结束降到多少才算明显下降（W2-10/W2-11，弹窗） | 第二步结束 ≤ 600（推荐）；≤ 500；不定数字、只降不升 | 不定数字、只降不升 | **用户没选推荐**。沿用门禁（按文件只许减少、新文件从 0 开始）；收尾时剩下的每一处列出原因与归属；W2-10、W2-11 照计划做 |
| 2026-10-10 | 错误码前缀规则（W3-02，弹窗） | 开头归事实主人、冻结现状（推荐）；一律用主人名开头；只统一写法 | 一律用主人名开头 | **用户没选推荐**。所有错误码改成 `<主人>.<原因>`（Goals 的约 20 种开头都改成 `goals.…`）；经 MCP 的 Runtime 看到的错误码随之变，goal-advance Skill、MCP 文档同步改；不留旧码。Casebook 已定删除，不再有外部同步问题 |
| 2026-10-10 | 合同包里会运行的三样东西搬到哪（W3-03，弹窗） | 放进插件开发包（推荐）；新建公开小包；照路线图原文；不搬 | 放进插件开发包 | 清单校验、长任务计时器、文字比较进 plugin-sdk；内核等从开发包取；开发包算共享核心，加「只依赖合同包」门禁 |
| 2026-10-10 | 选区推荐与创作台挑零件的判断说明进不进「设置 › 提示词」（W3-04，弹窗） | 两处都放进设置（推荐）；只放选区推荐；都不放 | 两处都放进设置 | 改掉 9 月 28 日的划分；默认文字与结果不变；「材料不是指令」安全声明仍固定；跑一次全量 |
| 2026-10-10 | 助理改完东西后怎样知道改的是哪个对象（W3-05，弹窗） | 保留猜、写成明文规则（推荐）；全部写明删掉猜；先量再定 | 保留猜、写成明文规则 | 写进手册与合同说明；已写明位置的在注册时校验位置真在返回合同里 |
| 2026-10-10 | Coding 读写目标的四个旧入口（W3-07，弹窗） | 这一片就改（推荐）；先登记临时例外 | 这一片就改 | Goals 的读约定、读状态、记进展、查回执四个动作对宿主运行且声明了的内置插件开放，生成的插件仍拒绝；Coding 改走动作，旧入口删 |
| 2026-10-10 | Molis Work 开着时命令行与管理 MCP 改目标（W3-07，弹窗） | 交给运行中的 Molis Work（推荐）；保持自己做、登记例外；开着时拒绝 | 交给运行中的 Molis Work | 数据属于这个 Home 的项目且宿主在运行就转发，记本机这个人、带诊断编号；宿主不在就自己做；宿主拒绝时命令停下 |
| 2026-10-10 | 受信管理 MCP 去留（W3-07，弹窗） | 保留、改走 Goals 动作（推荐）；删掉 | 保留、改走 Goals 动作 | 工具名与参数不变；错误码按主人前缀一起改 |
| 2026-10-10 | `goals.inputs.confirm` 谁能记「已确认」（W2-08 评审带出，弹窗） | 非本人只记「待确认」（推荐）；保持现状；只有本人能调 | 非本人只记「待确认」 | 本人升格记「已确认」；助理、Agent、工作流、外部工具升格只记「待确认」，等本人在 Goals 里认可 |
| 2026-10-10 | 待确认的输入由本人认可或移除（W2-08 评审的追问，弹窗） | Goals 加只给本人的「认可」动作，输入列表显示「待确认／已确认」并给「认可」「移除」两个按钮（推荐）；不加新动作，本人再调 `goals.inputs.confirm` 或再升格一次时把待确认升级成已确认；先不做，登记待办并改掉动作说明里的「等用户认可」 | Goals 加只给本人的「认可」动作，列表显示「待确认／已确认」并给「认可」「移除」两个按钮 | 助理、Agent、工作流、外部工具升格出的输入记为「待确认」后，本人在 Goals 里认可（`goals.inputs.accept`）或移除（`goals.inputs.release`）；做法与后果记在上面 2026-10-09「Feed『升格为 Goal』改走 Goals 自己的动作」一行的（d）。同一问的第二问（待确认的 Feed 回执在上下文关系里要不要分成提议边 `goal.input.proposal`）按推荐不分，仍记 `goal.input` 边，用户可改回 |
| 2026-10-10 | Casebook 的读取、同意、`/casebook/v1/` 通道与外部仓库（W3-08，弹窗） | 四问各有推荐（只给配置好的连接；动作里验签；保留通道登记例外；本仓库合入即完成） | **删掉 Casebook 及全部相关内容** | **用户没选任何选项**：「先不管 casebook，把这个插件相关的内容都删掉吧，这个插件后面重做」。删 `apps/local-host/src/casebook/` 与接线、合同、测试、文档、项目库里的 5 张表（项目库 v6 → v7）；W3-08 改成删除切片；W3-09 里「Casebook 要不要记助理操作」随之作废 |
| 2026-10-10 | 实验插件（A/B 对照实验）去留（随 Casebook 一问，用户主动提出） | — | **删掉实验插件及相关内容** | 用户原话：「同样，AB测试的插件，也删掉，相关内容清理掉」。删 `plugins/native/experiments/` 与宿主接线、grok/laya 本地调用例外（CALL-CHAINS §10.1）、AGENTS 里关于实验本地调用的那条（B 批 `refactor/agent-entries` 不再加）、W2-05 给它的基线 |
| 2026-10-10 | 删掉 Casebook 与实验插件后真实 Home 的数据（弹窗） | 删除 PR 合入后立刻维护（推荐）；和下一次库结构维护一起做 | 删除 PR 合入后立刻维护 | 维护六：停进程、整份备份、拷贝上演练，每个项目库删 5 张 Casebook 表并升到 v7，删 `plugins/experiments`；做完前主检出不升级 |
| 2026-10-10 | npm 归档上的飞书/Lark 连接器：`basic-ftp` 高危公告（GHSA-c475-qrg2-pj4r）没修，`keytar` 在 Home 之外读写钥匙串并建数据目录（W2-18 决定 11 的后续，合规复查带出） | 接受：两件事写进安装说明，npm 路径照旧（推荐）；安装说明里让使用者在自己项目的 `package.json` 写 `overrides` 固定 `basic-ftp` 6.2.1；归档自带这个包的依赖树（`bundledDependencies`）；npm 归档不带飞书/Lark 连接器 | 接受：两件事写进安装说明，npm 路径照旧 | 用户选推荐。`docs/installation.md` 与 `.en.md` 新增「npm 路径上的飞书/Lark 连接器」一节（`basic-ftp` 5.x 只在代理被配成 FTP 上的 PAC 文件时才走到；`keytar` 的安装脚本、每次启动读写钥匙串里 `lark-mcp` 一项、`lark-mcp-nodejs` 数据目录都在 Home 之外），`docs/releases/CHECKLIST.md` 第 2 节加发 npm 归档时的检查；不写 `overrides`、不把 `@larksuiteoapi/lark-mcp` 及其依赖树放进 `bundledDependencies`（归档里本来就有工作区包）、不去掉连接器；Home 之外的三项登记在 `docs/system/HOME-DATA.md` 第 8 节；结论与重新问的条件记在 [依赖与 SDK 方案](dependencies-and-sdk-plan.md) §3.5。没有 BACKLOG 行（没有剩余工作） |
| 2026-10-10 | 外部 AI 工具或助理按名字调已关插件的能力（W3-09，弹窗） | 原因与错误码与页面一致、外部工具记一行（推荐）；两个都记；保持现状 | 原因与错误码与页面一致、外部工具记一行 | 外部工具的这次调用交给宿主判、记调用记录带诊断编号；助理照旧在确认前拦下、不记，但原因与页面一致；Skill 与 MCP 文档同步改 |
| 2026-10-10 | 修改已有内容时是否必须带读到的版本（W3-09，弹窗） | 所有 AI 来源同一条规则（推荐）；只要求内置助理；所有来源都要求 | 所有 AI 来源同一条规则 | 内置助理、内置 Agent、外部工具都必须带版本，错误码统一 `actions.version_required`；本人页面与插件自身调用不受限 |
| 2026-10-10 | 错误吐司里的诊断编号（W3-10，弹窗） | 停久一点、指着时不消失（推荐）；一直留到关闭；吐司里不带 | 停久一点、指着时不消失 | 带编号的错误吐司停约 8 秒，悬停或聚焦时不消失，按钮可复制 |
| 2026-10-10 | 哪些报错显示诊断编号（W3-10，弹窗） | 只在查得到时显示（推荐）；只在服务出错时；设置修改也记下全部显示 | 只在查得到时显示 | 记进调用记录的操作失败就显示；没记的设置修改与安全拦截不显示 |
| 2026-10-10 | 没有自己重发办法的页面保存时断线（W3-10，弹窗） | 说明不知道有没有完成、内容保留不重发（推荐）；加「再试一次」；自动读最新状态判断 | 说明不知道有没有完成、内容保留不重发 | 读取断线提示「连不上 Molis Work 服务，请稍后重试」；不显示浏览器英文原话 |
| 2026-10-10 | 空白文档或灵光离开时被自动丢掉后，工作台的后退、页签和刷新还会去打开它（W2-18 决定 6 的后续，合规复查带出，弹窗） | 工作台只在页面展开时把它算作「正在显示的对象」，丢掉后按原有的安静计时自然忘掉（推荐）；插件发一个「这条已经不在」的工作台事件，工作台删掉历史、页签与记录；保持现状、在 Pages 与灵光的 README 写成已知行为 | 工作台只在页面展开时把它算作「正在显示的对象」 | `tab-workspace.ts` 的 `jumpToRecord` 在安静重开（后退、前进、刷新）时，`showsIt` 只在 surface 的 `data-expanded` 不是 `false` 时才把 `named_by: "workbench"` 的对象算作正在显示；页面还停在列表时，约 8 秒的安静计时到了，记录里仍是它在找的那一条就 `forgetRecord`（期间人打开了别的条目，那一条的记录不动；安静重开到点从不弹「未能打开这条内容」），`molis-work-plugin-records:<项目>` 不再留它，后退、前进、刷新之后页面停在列表；没有新的页面事件、没有新的合同。链接、放置「打开」、全局搜索的非安静路径不变，仍把工作台的名字算作在显示：Todo 的批次整理这类内容开在列表页里（`data-expanded` 保持 `false`），按严格规则会在 10 秒后误弹「未能打开这条内容」。留下的：后退到那一步的那一次，约 1.5 秒后页面仍显示一次「找不到这篇文档」「这条灵光已丢掉或不存在」，留到再打开别的条目或刷新；指向已收回条目的标签与放置链接仍显示既有错误。`tests/plugin-small-ux.e2e.test.ts` 的四个新用例覆盖（后退、前进与刷新；找它的 8 秒里打开的新文档不被忘；找它的 8 秒里后退再立刻前进，列表上不留记录、不弹错误；Todo 批次链接不弹错误），都盯着页面的提示，Pages 与灵光的 README 已改 |
| 2026-10-10 | 每一轮的诊断编号记在哪（W3-01，日常取舍） | 记在 Molis Work 自己的冻结记录；请 Prologue 上游加字段；不记 | 记在 Molis Work 自己的冻结记录 | 不改 Prologue、不换 SDK 包；路线图 W3-01 行「Prologue 运行记录带上编号」按此改写 |
| 2026-10-10 | plugin-sdk 算共享核心；只依赖合同包的门禁；其余包从 SDK 取执行生命周期（W3-03 PR-A，日常取舍，随上面「搬到哪」那一问落地） | SDK 仍算平台包、只靠 `plugin-sample.e2e`（本机）守住；算共享核心并加边界规则（推荐） | 算共享核心并加边界规则 | `scripts/package-owners.mjs` 的 `SHARED_CORE` 加 `packages/plugin-sdk`（SSOT 归属格变成「共享核心」；`.github/CODEOWNERS` 不变，它只列有第二位评审人的包），`PARALLEL-DEVELOPMENT.md` 的全量条件写上 plugin-sdk，因为执行生命周期已在它里面，内核注册时、Plugin Runtime 安装时执行的规则随 W3-03 的 B1、B2 也搬进来（`scripts/affected-tests/rules.mjs` 的 `corePackages` 同步加上，`pnpm test:affected` 改 SDK 就推荐全量）；`packages/test-kit` 加违规码 `public-sdk-private-dependency`（SDK 只能依赖合同包，源码 import 与 `package.json` 依赖都查，带 4 个用例，随 `pnpm boundary:test`、`boundary:check` 在 CI 里跑）。一条路径：`createExecutionLifetime` 只剩 SDK 一条公开路径，合同包的 `platform/execution-lifetime` 子路径（59 个变 58 个）和内核的转出都删，宿主一侧七处调用改从 SDK 取；调度服务、Shelf 模块、沙箱原来只为这个函数依赖内核，改为依赖 SDK。`plugin-sample.e2e` 因文件名被探针当成浏览器用例、进不了 CI 子集，记为 BL-124 |
| 2026-10-10 | 清单校验归 plugin-sdk，推翻 DV3 验收里的一句边界陈述；顺手删两处没人用的名字（W3-03 PR-B1，日常取舍，随「搬到哪」那一问落地） | 清单校验仍归合同包（DV3 原话）；改归 plugin-sdk，保留「只有一套规则」（推荐） | 改归 plugin-sdk | `specs/molis-work-architecture-reorganization/dv3-validation.md` 写的「Manifest JSON/版本/声明校验归 Contracts `platform/plugin-manifest.ts`」的前半句被推翻（那一份在 dv3-validation 里加了一行指向新位置，原句不改）；后半句「SDK、CLI 不维护第二套规则」保留并更严：SDK、Plugin Runtime、命令行都从 SDK 取同一份 `parsePluginManifest`、`PluginManifestError`、`comparePluginVersions`，内核注册时的动作声明检查在 B2 搬入同一处。删 `canonicalPluginId`（恒等函数，只有解析函数自己用）；端口与事件的检查函数（`inspectPortDeclarations`、`inspectEventDeclarations`）只有清单解析用，搬进 SDK 后不进它的公开出口。`SURFACE_BROWSER_PERMISSION` 是权限名常量，留在合同包的 `platform/plugin` |
| 2026-10-10 | 文本比较搬进 plugin-sdk、推荐函数删除时的取舍（W3-03 PR-C，日常取舍，随「搬到哪」那一问落地） | 比较的值和类型一起进 SDK、Diff 继续转出；值进 SDK、类型留合同包、Diff 不再转出（推荐）；把没人用的 `suggestedAuthoringBehaviors` 一并搬进 SDK，或删掉并把测试改成测目录数据与页面规则（推荐） | 值进 SDK、类型留合同包、Diff 不再转出；推荐函数删除 | 一条路径：`compareTexts`、`splitLines`、`joinLines`、`reconstructSides`、`textDiffRow`、`alignSplitRows`、`DIFF_STEP_BUDGET` 在 `packages/plugin-sdk/src/text-diff.ts`（代码一字未改，只是类型改从合同包导入），`DiffLine`、`DiffOp`、`TextDiff`、`TextDiffRow`、`SplitPair` 五个类型留在合同包 `modules/workspace-artifacts`（`workspace-text-diff.ts` 只剩类型）；工作台的审查界面、Coding、Diff 的值都从 SDK 取，Diff 删 `src/text-diff.ts` 且包入口不再转出这些值和类型（仓库里没有人从 Diff 取过它们，只有 `tests/diff-plugin.test.ts`，已改从 SDK 取）；工作台、Coding、Diff 加 SDK 依赖（登记表、`package.json`、锁文件、Coding 与 Diff 两份 README 的依赖一行）。`suggestedAuthoringBehaviors` 生产调用为 0，用户真正跑的是判断规则页脚本里另一份同规则的实现，所以删掉没人用的那份而不是搬走：原来调它的两个测试改成断言目录数据（场景的两个版本都在、版本 2 的推荐项叫 "Version two approval"、`agent.mcp` 下每项带各自的对象种类、别的场景的符号不挂在它下面），并在 `tests/functions-plugin.test.ts` 新增一个用例，在 Node 里直接执行页面脚本的那段规则（不是正则匹配、不需要 Chrome），重放原来的四条结论，这一步先在未改合同的 main 上做完并确认全绿。页面规则与被删的那份有两处不同（页面对目录里没有的 id 造占位行，多版本时返回合成的「原用途不可用」目的地），四条结论相同，用户看到的行为不变 |
| 2026-10-12 | 路由绑定函数搬进 plugin-sdk，Plugin Runtime 路由器、页面外层与 Coding 客户端改答平台的码（W3-02 C，日常取舍，随 W3-02 方案落地） | 两个函数留在合同包、只把状态表换成按 kind 查；整个搬进 SDK、合同包不留（推荐）；路由器的拒绝另起一套新码，或用动作层已有的码和句子（推荐）；路由自己的请求映射函数抛错按「没有码的错误」答 500，或答 400 `actions.input_invalid`（本片自己定的） | 搬进 SDK、合同包不留；路由器与页面外层用动作层已有的码和句子；映射函数拒绝请求答 400 | 一条路径：`bindPluginActionRoute`、`bindOwnerPluginAction` 在 `packages/plugin-sdk/src/routes.ts`，签名不变，合同包删两个函数（公开 API 快照 `contracts/platform/{actions,plugin}.txt` 各少两条，SDK 的快照把「转出」改成自己的声明），纯度门禁 8 条变 6 条（`#http-status`、`#long-fn:bindOwnerPluginAction` 归零）。路由答法：动作失败按错误的 kind 给状态（`actionErrorResponse`），响应体 `{ error, code, details? }`；`actions.scope_mismatch`、`actions.plugin_disabled` 以前答 400，现在 403，`actions.connection_required` 503，`actions.conflict` 与带 `conflict` kind 的主人码 409，没有我们的码的错误 500 `actions.execution_failed`。**映射函数拒绝请求答 400 `actions.input_invalid`**（带映射函数那句话）是方案没写、本片加的：不加，Files 路由里 `JSON.parse(request.query.path)` 一类会从 400 变成 500，还把解析器的原话当内部错误回给页面；映射函数自己抛出的是主人的码就原样答。Plugin Runtime 路由器的四个裸字符串：没有路由要的权限 `actions.forbidden`（沿用 `local-web-actions.ts` 里授权失效那句话）、本项目没有启用 `actions.plugin_disabled`（`project-action-availability.ts` 那句，404 变 403，路线图那行写的状态）、未运行 `actions.plugin_unavailable`（`plugin-runtime/src/action-provider.ts` 那句）、声明了路由却没有处理器 `actions.execution_failed`（「能力执行失败」）；没有新增句子。页面外层 `web-request.ts` 在同一行答同一个码和同一句话（行数不变，不让那个巨大函数变长）；Coding 设置页的「为当前项目启用 Coding」按钮据 `actions.plugin_disabled` 判断，写法比原来短（`unavailable(error,1)`）。**页面资源**：只有 `/assets/molis-work-workbench.js`（它带着 Coding 设置脚本）降了 24 字节；方案以为 coding、diff、files、git、text-stats 五个包的脚本各降约 18 字节，实测它们不含这段脚本，数字没动。**加 SDK 依赖的是 6 个**（Characters、Files、Git、Issues、Shelf、Text Stats；登记表、`package.json`、锁文件、README 依赖一行），方案写的 7 个里 Coding 与 Diff 已在 W3-03 C 加了，Issues 是方案之后才有的插件。**方案没有照顾到的一处（要协调知道）**：Files、Git、Diff 的处理器里抛的没有码的 `new Error("…")`（调用者的条件不满足，例如「工作目录已改变」「差异参数无效」）原来经路由答 400，路由按 kind 答之后会变 500 `actions.execution_failed`，而已有的用例（`files-product-http`、`git-product-http`、`shelf-coding-materials-http`、`shelf-project-results-http`）断言这些是 400。方案的 D 到 F、G4 清单里没有哪一片给这三个插件声明主人码，所以本片先做：三个插件各加 `src/errors.ts`（`defineErrorCodes("files" | "git" | "diff", { invalid: "invalid" })`），处理器里 28 处调用者条件不满足的抛出（Files 8、Git 16、Diff 4）换成 `<插件>Errors.invalid(同一句话)`，状态仍是 400；Files 一处「文件快照输出尚未装配」是装配错误，仍是没有码的 500。Shelf 只做被用例碰到的几处：`runtime-actions.ts` 里读成果、解析 Shelf 材料、选材料输出这三步，凡不是 `ActionError` 的拒绝（成果服务读不到、材料格式不对、输出服务说「当前输出已变化」）都包成 `ActionError("shelf.invalid", …)`（一个 `refused()` 小函数，状态仍是 400）；Host 的 `coding-shelf-material.ts` 两处抛 `ActionError("coding.shelf_material_invalid", …)`，前缀用 `coding`，因为错误主人表（`tooling/gates/error-owners.json`）把 `apps/local-host/src/coding-*` 的文件算作 Coding 的；Shelf 其余的没有码的抛出归 F。这是方案之外多做的一步，范围到「这条路由改了才会变的行为」为止；这三个插件里其余没有码的抛出（事件载荷检查、界面命令里的「没有可打开的…」）不经这个绑定函数，不动 |
| 2026-10-10 | 选区推荐是否登记成系统动作（W3-04，日常取舍） | 保持只给工作台用的 HTTP、写明删除条件；做成只读的系统动作；做成助理也能问 | 保持只给工作台用的 HTTP，不登记成系统动作 | 决定 #1（N-12）管的是对外可见的能力，情境排序只给工作台自己的选区条用，助理、工作流、MCP、插件都不调它；决定 #7（宿主设置里的写入只走 HTTP）是同类先例；`action-architecture/spec.md` §3 复核已判过「这是系统自用的排序，不会进用户的判断函数库，需要时另起一项」。它不违反「能力只有一条路径」和「每项事实一个主人」：准备输入与上报信号都经调用者自己的动作，判断只排序、不执行；所以不进 CALL-CHAINS §10.1，只在 `ARCHITECTURE.md` §3、`docs/horizontal/README.md`、CALL-CHAINS 链 6 开头、内核 README 注明。**删除条件**：助理、工作流、MCP 或插件要用情境推荐时，把它做成只读的系统动作，HTTP 改为调这个动作。代价：判断不进调用记录、没有诊断编号（W3-01 也不会给它带上）；「让助理也能问」是新的产品范围，不在这一片 |
| 2026-10-10 | 情境判断的材料是分行文字还是 JSON（W3-04，日常取舍） | 保持分行文字、补上折行与测试；改成带不可信声明的 JSON | 保持分行文字 | 安全不变量 S-13 的通用写法是「带不可信声明的 JSON 数据」，情境判断交给判断服务的是分行文字，格式随 9 月 30 日真实判断服务的评估定下（30 个标注情境，首位合理 90%），改成 JSON 要重跑评估、可能还要改题面。W3-04 第二个 PR 把这条更窄的通道写进 S-13，补上对象种类与目标状态没折行的缺口，并加测试，由这几条守住：开头声明、每段一行并有长度上限、先去密钥并标出像指令的文字、材料不进题面、只能在候选键里选、结果只排序不执行。同一行里写出「【当前目标】」字样仍可能误导判断，最坏是推荐排错，动作仍要人确认。用户要求改成 JSON 时另开一项（JSON 材料加重跑评估） |
| 2026-10-10 | 子代理的模型与力度（用户 10-10 指示） | — | 主会话按任务挑最合适的模型与力度 | 用户：「not limits i set, but the most suitable model for each task」；每个子代理显式设定，注意用量 |
| 2026-10-10 | 维护六里实验插件留在别处的残留行（弹窗，真实 Home 只读数过） | 清掉绑定与隐藏记录、历史事件保留（推荐）；都留着；连历史事件一起清 | 连历史事件一起清 | **用户没选推荐**。5 条（连接绑定 1、项目隐藏记录 1、项目事件 3）都删了，整份备份里还在 |
| 2026-10-10 | 「被取消、撤权、停用的调用不再写任何记录」管不管调用记录里的诊断行（W3-01 实现带出，弹窗） | 诊断行可以记、硬规则写清只管业务数据（推荐）；一律不记 | 诊断行可以记、硬规则写清只管业务数据 | 被拒的调用在调用记录里留一行「未执行」（谁、什么动作、结果、错误码，不记内容）并带诊断编号；W3-01 PR B 落实，同时把 AGENTS.md 那条改写清楚 |
| 2026-10-10 | 维护七（内置插件改用插件名作来源编号后改写真实 Home 里的旧编号）的时机与范围（弹窗） | W3-06 合入后立刻做、卡片等一起改（推荐）；只改设置类、卡片失效；等下次库维护 | W3-06 合入后立刻做、卡片等一起改 | MCP 授权、工作流步骤、角色草稿、Coding 选好的能力、助理设置，以及助理卡片、可撤销操作、后台任务都改写；先在拷贝上列条数给用户看；已发布的角色版本仍由用户重新发布 |
| 2026-10-10 | 主检出何时与远端同步（用户指示） | — | 当时就快进 | 快进到 #368（`890bffff9`），未构建；#369（项目库 v7）之后的同步与构建排在维护六之后（已落实：维护六的数据部分做完后主检出同步到 `72137e89a`（#371）并构建（主检出上有另一个会话的本地提交 `3a4a61f22`，不能快进；按用户选择把它挪到分支 `docs/ai-interaction-plan`，再把主检出对齐 origin/main），Home 安装版同日重装，见 §4.1 维护六「做了什么」） |
| 2026-10-10 | 整合时发现的实现取舍（日常取舍） | — | 按条定 | W2-08 的会话作者检查不拦跨设备成员（`runtime:cross-device:*`，作者就是成员本人，保持原行为）；维护六窗口里会话自动重连起的 MCP 不反复停，靠脚本的 `lsof` 守卫；W3-01 PR A 先不记被拒调用（保守），等上一行的决定由 PR B 落实 |
| 2026-10-11 | 备份清理（用户指示「把一些低风险 Molis 备份清理一下」，弹窗多选） | 10-09 维护五第一次失败的不完整备份（推荐）；10-09 维护五前的整份备份（推荐）；10-09 维护四前的整份备份（推荐）；10-07 维护三替换下来的旧库文件 | 删前三份 | `~/molis-work-backups` 里删了 `2026-10-09-before-maint5`、`2026-10-09-before-maint5-r2`、`2026-10-09-before-maint4`。它们是 APFS 克隆，腾出的是约 300 万个文件的元数据，可用空间几乎不变（删前删后都是约 32 GB）。保留：10-07 维护三前整份与 `runtime-configs`（10-08 决定 #21）、维护三替换下来的旧库文件（约 1.9 GB，不是克隆）、维护六前与维护七前的整份克隆、移出的实验插件数据 |
| 2026-10-11 | 维护七怎样收尾（弹窗；整份克隆上只读列出：可改 0 条） | 不写真库，重装后复查一次（推荐）；照清单开窗口在真库上跑一遍 | 不写真库，重装后复查一次 | 旧编号在 Home 里出现 168 次，全是创作台运行记录里的 `sdk.artifacts.<安装编号>`（安装自己的身份，不是引用）；复查做法与结果见 §4.1 维护七 |
| 2026-10-11 | 停在等批准或暂停的 Coding 轮次（弹窗；工具看不见加密的运行记录） | 不提前处理，遇到就重开（推荐）；重装前用户先在 Coding「需要你」里处理掉 | 不提前处理，遇到就重开 | 重装后若有这样的轮次调 7 个插件的动作报 `actions.missing`，取消后重开一轮；已经结束的轮次不受影响 |
| 2026-10-11 | 新版什么时候装到真实 Home（弹窗） | #382–#385 都合完后装一次（推荐）；#382 一合就装 | 四个都合完后装一次 | 10-11 用 `origin/main` `9f9bda551`（#385 的合并提交）的干净构建重装；会话里已经开着的 MCP 跑的是旧代码，要用户重开会话 |
| 2026-10-11 | W3-02 改错误码之后，真实 Home 里存着的旧错误码（弹窗；Feed/收件箱运行记录、来源、插件事件投递、Functions、Sessions、炼金术士、IM 与调用记录日志里都有） | 维护时改写成新码（推荐）；清掉旧码；当历史原样留着 | 维护时改写成新码 | 和维护六、七一样做一次性工具：先在备份拷贝上列出和演练，条数给用户看后改真库（维护八，排在 W3-02 的改名合入之后）；调用记录日志 `logs/action-calls.jsonl` 是历史，照维护七原样保留 |
| 2026-10-11 | W3-09-3「所有 AI 来源改东西要带读到的版本」里，工作流算不算 AI 来源（弹窗） | 不算（推荐）；算 | 不算 | 要带版本的是 Agent、助理和外部 MCP 客户端；工作流里不经模型的步骤照旧；工作流里的 Agent 步骤以 Agent 身份调用，照样要带 |
| 2026-10-11 | 插件页面在 W5-04 之前仍可能显示浏览器英文原话（如 Failed to fetch），与 10-10「不显示浏览器英文原话」不一致（弹窗） | 接受、记成过渡（推荐）；现在逐个插件补 | 接受、记成过渡 | W3-10 只给工作台自己的页面接统一请求助手；各插件页面（含 Goals 对话框）在第 5 波浏览器代码打包（W5-04）时一起接上 |
| 2026-10-11 | 两条新门禁（都是收紧；动门禁要用户同意，弹窗） | 两条都加（推荐）；只加浏览器脚本不许直接 fetch；只加测试混用进程只减不增；都不加 | 两条都加 | ①W3-10-5：浏览器脚本里不许直接 `fetch`，走统一请求助手（`rawFetchInScripts`）；②W2-10：测试里同一个包既读源码又读构建产物的混用进程（196 个）先按文件只减不增，W2-10 收尾（PR-E）换成归零的硬门禁 |
| 2026-10-11 | 第 3 波 B 批计划里的日常取舍（计划代理提出，按推荐定） | — | 按条定 | 吐司里「诊断编号」按钮也按 `DESIGN.md`「Focus and accessibility」现有规则在手机与粗指针下是 44px，不另问；Goals 的错误码改名保留原前缀作第二段（`goals.<原前缀>.<原因>`），因为压平会让 19 个不同的码撞成同名；对 MCP 可见的改名都在 0.3.0 之前合完；W3-02 的改名按语法树改（`goal.trashed` 等也是存着的事件类型，不能按字符串替换）；W3-02b（改名收尾）由可选变成必做 |
| 2026-10-11 | 浏览器用例的并发（用户指示「浏览器锁…可以提高并发到 2-3 个」） | — | 3 个名额 | 协调会话的整机锁（会话临时目录 `build-lock.sh`）把浏览器用例批次从 1 个放到 3 个（`browser.lock`、`.2`、`.3`），构建仍是 1 个；全量回归只占一个名额，代理不再为全量等一两个小时。代价是负载更高、浏览器用例更容易超时，失败照旧先重跑再对干净基线。`AGENTS.md` 与 `docs/system/PARALLEL-DEVELOPMENT.md` 里「一个浏览器用例批次」的写法没改，等用户定 |
| 2026-10-11 | 首次引导的第一个目标用哪个调用者（W3-07 PR-1+2，日常取舍） | 网页里的本机这个人（`bindGoalsWebActions`）；路线图 W3-07 行写的管理调用者工厂；为它另做一个只授 `goals:write`、只放行 `goals.create` 的窄调用者 | 网页里的本机这个人 | `/api/onboarding/initialize` 是网页路由，调用在来源、控制令牌和一次性键校验之后，正是 `bindGoalsWebActions` 注释写的合同；管理调用者（现只有 `tests/goal-management-caller.ts` 里测试用的那一个，生产的工厂归 PR-3）的出处是 `management`，用在网页路由上会把这次创建记成管理入口所为。**代价**：权限比原来的单个 typed 入口宽，是 `GOALS_ACTION_PERMISSIONS`（`goals:read`、`goals:write`、`goals:decide`），不带 `allowed_actions` 钉住；但这条路由只发 `goals.create` 一个调用，项目由路由定、身份由调用者上下文定，所有 Goals 的网页路由本来就是这个调用者，并没有给网页新增权力。目标仍记本机这个人（`actor_kind: user`）、创建渠道仍是 `onboarding`。**可改回**：要钉住单个动作，就在 `goals-actions.ts` 里给首次引导另做窄调用者，是一个小改动 |
| 2026-10-11 | Run 与助理轮次读项目长期说明用哪个调用者（W3-07 PR-1+2，日常取舍） | 新的只读宿主调用者 `readProjectGuidance`（本机这个人、只授 `goals:read`、钉住 `goals.guidance.read`）；借 `bindGoalsWebActions`；借管理调用者 | 新的只读宿主调用者 | 这两处不是网页请求，没有来源与令牌校验可依托，借网页调用者等于无端多授 `goals:write`、`goals:decide`；管理调用者同样带写权限。只读调用者的权限就是动作自己声明的 `goals:read`，并带 `allowed_actions` 钉住这一个动作和提供方，能读到的只有这一份说明。读不到（Goals 已移出项目、库读不出）时照旧：`catch` 之后没有项目层，Run 与助理轮次照常开始。**代价**：`goals-actions.ts` 多一个十来行的函数；PR-3 做生产的管理调用者工厂时可以并入它的只读形态，到时再看 |
| 2026-10-11 | 「读说明时没有 typed 那一行」的测试怎么断言（W3-07 PR-1+2，日常取舍；W3-01 B 已经 #421 合入） | 数调用记录结算钩子里 `path === "typed"` 的行；等 W3-01 B 再写；按调用记录文件断言 | 数结算钩子里 `path === "typed"` 的行 | W3-01 A（#372）已让 typed 调用也走结算（`path: "typed"`），所以现在就能断言「没有 typed 行，只有 `goals.guidance.read` 一行；被拒时是动作自己的 `actions.plugin_disabled`」；查询不写进调用记录文件，说明读取只能看结算，首次引导的创建（命令）才断言调用记录文件里恰好一行。W3-01 B 已落地，接续修正时，说明读取的断言可以改成「一行失败的查询记录带本轮调用编号」，到时改测试，不改产品代码 |
| 2026-10-12 | 管理调用者工厂这一片就带上 `goals.decisions.record` 的分支吗（W3-07 PR-3，日常取舍） | 带上，用桩客户端测（采用）；等 PR-4 的管理 MCP 要用时再加 | 带上 | 出处规则本来就按动作分：两个决定动作（`goals.tree.decide`、`goals.decisions.record`）的 `evidence` 只指向它出自哪段对话，权威分别由 `managementTreeAuthority`、`managementEventDecisionAuthority` 造，其余动作带 `evidence` 返回 `actions.input_invalid`。两个放在同一个工厂里，PR-4 的管理 MCP 复用它就不必再改工厂。命令行不调 `goals.decisions.record`，所以这个分支在本片只有测试在走，测试写在 `tests/goal-events-state.test.ts`（该文件已从 src 读 `goals-actions`，新测试文件不能再加内部引用，所以没有另开）。**代价**：PR-4 合入前，工厂里多一个没有生产调用方的分支 |
| 2026-10-12 | 经管理调用者的读取在调用记录里记成谁（W3-07 PR-3，日常取舍） | 每个动作都带 `management` 出处，读取也记 `web-user`（采用）；读取类动作不带出处，只有写入带 | 每个动作都带 | 命令行以前直调 typed 能力，调用记录里读取的执行者是 `local-host`、没有 `user_action`。现在的调用者是本机这个人（`web-user`），读取（没有幂等键）的出处是 `management:<项目>` 与 `management:<动作 id>`。工厂对所有动作一个写法，不按读写分叉，也就不必靠猜动作种类来决定带不带出处；写入的落库出处（`management:<项目>`、`management:<幂等键>`、`management-tree-decision:<键>`）与以前逐字一样。**代价**：调用记录里这类读取的执行者变了；**可改回**：给读取类动作省去 `user_action`，是工厂里的一个分支 |
| 2026-10-12 | 命令里的 `project_id` 与绑定项目比较的写法（W3-07 PR-3，日常取舍） | 沿用原先各命令挑字段的方式：`init`、`snapshot`、`active-goal` 用 `String(...)`，`goal-tree-*` 用原值（采用）；全部 `String(...)`；全部原值 | 沿用原方式 | 任务要求命令行的线路逐字节不变。统一成任何一种都会改掉另一组命令对形状不对的 `project_id` 的错误面（`actions.scope_mismatch` 还是别的错误），那是有意改线路，不是本片的事。**代价**：`command-dispatch.ts` 里两种写法并存，靠 `bound()` 调用处的参数看出；要统一就是下一次有意的线路改动 |
| 2026-10-12 | 「一条命令一个调用编号」的测试怎么改（W3-07 PR-3，日常取舍） | 改成覆盖动作客户端（采用）；保留原来对 `client()`、`withScope` 的覆盖；两者都覆盖 | 改成覆盖动作客户端 | 命令行不再开 `client()` 和 `withScope`，原断言所在的路径没有了。新断言仍是同一件事：每条命令里的 Goals 动作调用带着 `runV1Cli` 打开的编号（有值）、下一条命令是另一个编号、命令结束后编号结束；`init` 只剩一个动作调用，快照也是一个（`tests/cli-protocol.test.ts`）。**差别要说清**：原来「项目作用域那一次和动作那一次编号相同」的断言，因为一条命令现在只有一次调用，没有两个编号可比，所以不再有；编号由 `runV1Cli` 的 `withCallId` 作用域带进动作，不由工厂造，这一行归 W3-01 E 的基底。**代价**：同一条命令里多次调用共用一个编号，现在没有测试能断言（没有命令会调两次），等有这样的命令再补 |
| 2026-10-12 | 生产的管理调用者工厂要不要并入 `readProjectGuidance` 的只读形态（W3-07 PR-3；PR-1+2 在 10-11 留下的「到时再看」，日常取舍） | 不并入，两个函数各管各的（采用）；并入工厂，按调用方种类分支 | 不并入 | 两者的出处不同：Run 与助理轮次读说明不是管理入口，没有 `user_action`，也不该被记成 `management`；工厂每次调用都固定写管理出处，要并入就得给工厂加一个「不带管理出处」的分支，等于让「管理调用者」的工厂能造出不是管理入口的调用，削弱它「只造管理调用者」这一条。`readProjectGuidance` 仍是十来行的独立函数，权限与钉住的动作不变（`goals:read`，`goals.guidance.read`）。**可改**：要合并，在工厂里加一个调用方种类参数，是一处小改动 |
| 2026-10-12 | 命令行里参数带身份字段的错误怎么保持（W3-07 PR-3，日常取舍；评审指出线路有两处变了） | 工厂在造权威之前先拒绝写入类动作参数里的身份字段，措辞与原 typed 口一样（采用）；让动作合同的 `additionalProperties` 去拒绝（消息不再点名字段，且决定类命令的参数与 `authority` 同时带身份时先报 `goal_tree_proposal.authority_source_invalid`）；在命令行分发器里拒绝 | 工厂先拒绝 | 计划与任务都要求命令行的线路逐字节不变。让合同去拒绝会有两处可见差别：`goal-tree-propose/check/decide` 载荷里带身份时，错误码仍是 `actions.input_invalid`，但消息由「写入者由宿主确定…参数里不能带 actor_id」变成「输入不符合能力合同：/ additionalProperties」，不再点名字段；决定类命令的参数与 `authority` 同时带身份时，错误码由 `actions.input_invalid` 变成 `goal_tree_proposal.authority_source_invalid`。所以拒绝放进工厂（`apps/local-host/src/goals-actions.ts`）：在造 `user_action` 之前，对 `goals.tree.submit`（另有 `submitted_session_id`）、`goals.tree.check`、`goals.tree.decide`（另有 `audit_actor_id`、`runtime_actor_id`）、`goals.decisions.record` 的参数查 `actor_id`、`actor_kind` 及这几个附加字段，说原来的话；顺序与原来一致（项目，参数里的身份，权威，合同）。其余动作不查（命令行的 `init`、`active-goal` 本来就只挑字段，读取类动作留给合同），所以读取里带 `actor_id` 仍是合同的消息，与原来一致。`refusePayloadIdentity` 从 `project-capabilities.ts` 搬到 `goals-actions.ts`（包内导出，不进包入口），typed 路径继续引用它，PR-5 删 typed 路径后只剩一份。已用 37 个载荷对比 typed 口（原路径）与命令行：错误码与消息逐字相同，修前有 14 个不同。工厂对 `goals.decisions.record` 的这条规则等 PR-4 的管理 MCP 复用。**代价**：工厂里多一张四项的附加字段表；新增一个写入类管理动作要在这张表里决定要不要列。**可改**：改让合同拒绝，要同时改这三处「不变」的说法（本表 N-12 行、`docs/system/CALL-CHAINS.md` 入口表、`docs/cli-and-development(.en).md`）并重写 `tests/cli-goals-actions.test.ts` 的消息断言 |
| 2026-10-12 | 基底（W3-01 E）与 main 交叉出来的测试夹具问题（W3-07 PR-3，日常取舍） | 夹具 `tests/fixtures/goals-mcp-grants.ts` 的两处导入改读 `dist`（采用）；让 `agent-host-composition.test.ts` 不再用夹具；给拆分名单加一项 | 夹具改读 `dist` | 基底的 `agent-host-composition.test.ts` 用 `grantGoalsMcp`，夹具从 src 读 `mcp-action-grants`、`mcp-settings-store`，而测试读包入口（`dist`）：合入 main 的「测试读同一份」门禁后，这个测试由 0 变 1 个拆分进程。夹具改读 `dist` 的孪生后，这个测试不再由 0 变 1，另有 13 个用这个夹具的测试文件各少一处拆分（门禁的 `testImportSplitsTotal` 224 → 211，有拆分的测试文件 193 个降到 180 个）。只改两个导入说明符，单独一个提交（`fix(integration)`），与删除 `goal-tree-commands.ts` 无关。**代价**：基底自己修同一处时会有一个相同的小冲突，取任一边即可 |
| 2026-10-12 | 合入 main 时的两处冲突怎么取（W3-07 PR-3，日常取舍） | 两边取并集（采用）；以 main 为准再手工补本片的行 | 取并集 | `docs/system/CALL-CHAINS.md` 入口表和 `apps/local-host/README.md` 的必跑清单：main 与本片改了同一行。入口表保留 main 新增的说明和本片的 CLI 行，必跑清单合并两边新增的用例，不丢任何一边的内容 |
| 2026-10-12 | 门禁 `checkGoalTransportCallers` 怎样管命令行分发器（W3-07 PR-3，日常取舍；评审指出旧规则可以绕过） | 分发器只许引三个模块的白名单，加一组 Host 客户端名字（采用）；只禁几个名字 | 白名单 | 只禁名字时换个名字或经别的模块转一手就能绕过；代价是分发器以后要引新模块时，要在同一个 PR 里改这条规则 |
| 2026-10-12 | W3-06-F 与已合入 Issue Home Runtime 的重叠（日常取舍） | 按当前实现复用同一 HomeHost/Executor | 复用现有实例与显式 retry，完整补原 F 的平台服务 | 不再新建第二套 Home Runtime、不恢复旧稿 30 秒自动重试；现行数据库服务为 services.database。泛用私有 KV 沿用既有接口，纳入严格 v2 完整基线，v1 或损坏 v2 明确拒绝且不启动补表。只读核对本机真实 Home 尚无 plugin-runtime 库、三个常驻端口均未监听，本片无需真库维护；若发现已有 v1，另在拷贝上列条数/演练、取得具体授权后维护，运行时不加兼容。Home HTTP 沿用 Home scope，项目前缀只用于定位同一实例，不自称已传递 caller.project_id；项目作用域动作由可信 actionClient 上下文验证。补 Home 故障不阻塞 Goals、场景准备和授权、非 bundled 夹具归属与生命周期；业务插件迁移仍在后续波。 |
| 2026-10-14 | CI 必过检查拆成并行作业（弹窗，「开发、CI 都慢」的系统优化，PR #497） | 合入（推荐）；只合测试运行器，CI 结构先不动 | 合入 | 原来 `Verify` 约 28–29 分钟，全卡在串行的 `architecture-boundaries`。拆成 `gates`、`health-gate-rules`（都不构建，后者分两个 runner）与 `architecture-boundaries`、`action-contracts`（各自构建），都在 `Verify` 的 `needs` 里（PR 上第一次运行 `Verify` 约 7.7 分钟；健康门禁的变异用例每个文件本身就占一个多核，4 核 runner 上并行几乎不再加快，所以分到更多 runner 上，并用 `actions/cache` 留下用时让长的先跑）；安全不变量单独一个不挡合并的作业；`workspace:verify` 去掉重复构建 `tsc` 的 `workspace:typecheck`。检查一项不少、不放宽。按 `AGENTS.md`，改 CI 步骤要用户确认，这一行就是 |
| 2026-10-14 | Linux 探针跑的频率（弹窗） | 每晚一次 + 手动（推荐）；保持每次推送都跑；只在推送到 main 时跑 | 每晚一次 + 手动 | `schedule` 每晚跑 main（有自己的并发组，夜里的合并取消不到它），保留 `workflow_dispatch`；PR 和推送上不跑。每次推送占一小时 runner、不决定任何事，main 上又常被下一次合并取消 |
| 2026-10-14 | 产品子集作业的并行份数（弹窗） | 现在提到 4 份（推荐）；等并入 `Verify` 时再说 | 提到 4 份 | 拆分后必过检查约 10 分钟，子集约 15 分钟，并入后会成为最长的一项；runner 是 4 核，趁作业还不挡合并（W2-16）看负载会不会让文件变得不稳定 |
| 2026-10-18 | 页面体积是不是硬上限（改 #17，用户在统筹会话里提出） | 用户直接给出 | 体积控制，不是硬上限 | 默认只许变小、能省先省；功能确实需要、在同一个资源里又省不回的增长，PR 写明理由、字节数与试过的省法，评审认可后在 `APPROVED_CEILINGS` 一次性放行（只认 merge-base 的准确数字，上限等于实测，下一条放行进来时删掉用完的），合入后照样冻结。一个资源一次涨超过 10 KB、或新增资源（要改门禁），先问用户（10 KB 这条线是统筹 10-18 定）。此前每次放行都弹窗问用户（#589、AC-03 +606、回执 3d-4 +889） |
| 2026-10-18 | 这一轮的收口范围（弹窗；用户：「这次都一起收口，按标准走，不留尾巴」） | 防腐路线图全做完、需求线也到验收归档（推荐）；只把防腐线做完 | 全做完，需求线也归档 | W5-01 剩下各族（含 Feed、Alchemist、Shelf 收尾、Characters 并进 Module）、W5-02～W5-17、W6-01～W6-06 都在范围里，不再「到时看值不值得」；各需求线把 spec 剩下的验收项做完并归档，挂在名下的 BL 要么做掉、要么写清不做的理由。动真实 Home 的步骤到时仍弹窗问（Alchemist 2026-10-21 改：不迁，防腐收尾后删除再重做，见本表末） |
| 2026-10-18 | 插件的待遇（弹窗；用户：插件不分官方还是个人，同样待遇、同样的标准与开发逻辑，补齐必要的平台能力） | 能力规则一样，只按来源定安装信任（推荐）；连信任也一样 | 能力规则一样，只按来源定安装信任 | 官方、个人、创作台生成、第三方插件：同一套 SDK 与合同、同样的 Manifest 声明、都由 Runtime 装配、同样的平台服务、生命周期与授权规则。只有安装信任按来源：发布者签名决定要不要首次确认、跑不跑沙箱、动作提供方身份归谁（防冒名；10-10 W3-06 C 的提供方身份规则保留）。写进 AGENTS.md 硬约束 |
| 2026-10-18 | 四个构建期例外（改 10-07，弹窗） | 插件按标准迁、平台事实归平台（推荐）；四个都迁成插件；保留 | 用户另给 | Goals 是普通插件，按标准迁到 Runtime；插件创作台不算插件，是平台能力；成果库（Artifacts）与 Sessions 是平台事实。Sessions 这一轮清理掉、文档留记录，以后重做（下一行）。例外名单清空，RUNTIME-MIGRATION 第 3 节的理由只当作补平台能力时要解决的依赖（插件创作台 2026-10-21 改：不迁、不并进平台，防腐收尾后删除再重做，见本表末） |
| 2026-10-18 | Sessions 重做的时机（弹窗） | 这一轮只清理，重做另开需求（推荐）；清理后就重做 | 这一轮只清理 | 清理前查清谁在用（工作区动作、Coding、项目删除的 `sessionsProjectData`、真实 Home 的存量记录），用到的能力挪给平台或它的主人；删真实 Home 数据先弹窗问。重做记 BL-177，先写需求书给用户审 |
| 2026-10-18 | 内置插件的授权（改 10-10 W3-06 B，弹窗） | 改成一样的规则（推荐）；保留 | 改成一样的规则 | 所有插件都按清单的必需与可选给权限，可选的都能在设置里关；内置插件装上时可选项默认勾上（体验不变），关了只是用到它的动作不可用。POLICY.md 7.8、`bundledGrants` 与对应测试随实现的那一片改 |
| 2026-10-18 | 其余只给内置插件的特权（弹窗） | 全部改成按声明与授权（推荐）；逐项再定 | 全部按声明与授权 | `always_on` 只许内置声明（S-34，`install-rules.ts`）、端口默认连线只在内置之间（W4-03-04，10-16 那一行）、Goals 信任内置插件的调用（`builtin-plugin-callers.ts`）、native 插件的动作权限自动算本机所有者的（`local-owner-permissions.ts`）、工作台手写名单（目录、设置节、搜索页签、翻译、页面资源）：任何插件声明了、经同意或按安装信任就有；名单由 W5-02 从各包声明生成（含 EXTENSION-POINTS X-1 的依赖清单）；缺的平台能力补齐。改信任边界的（S-34、默认连线的同意流程）由那一片设计并先弹窗问。接手后第一步的防腐审查先出完整的「内置特权与平台缺口」清单 |
| 2026-10-18 | 项目库里的插件表（RUNTIME-MIGRATION §10 第 4 项 / X-5，弹窗；先选了按现状，按「不留尾巴」重问后改） | 做项目库服务（推荐）；只迁动作和界面 | 做项目库服务 | 仿 Home 库服务：插件自己的项目库表（Schedule 三张、Feed 出口规则、Coding）由插件声明，平台建表与升级，宿主的项目库基线不再点名插件；表名与数据不动。Module 的表（Attention、Feed、Sources、Signals 等）仍归 Module。排在迁 Schedule、Inbox、Feed 之前 |
| 2026-10-18 | 放置规则（§10 第 3 项，弹窗，再次确认 10-10 的读法） | 按今天的登记方式放（推荐）；按 `personal` 字面读 | 按今天的登记方式 | Form、Dataset、PPT、Pages、灵光、Workflows、Inbox、Schedule、Feed 每个项目一个实例；Todo、Issues、Jelly、Cognia、Images、Alchemist 在 Home 级实例 |
| 2026-10-18 | 删项目时清插件数据（§10 第 5 项，弹窗；第一次问时前提写错，说 Form、Todo、灵光没接，更正后重问） | 用现有 `project_data` 声明，W5-02 挪进各包（推荐）；另加 Runtime 代接钩子 | 用现有声明 | 目录条目上的 `project_data` 已覆盖 8 个插件；W5-02 把它和目录条目一起挪进各插件包自己的声明，生成的与第三方插件走同一条路；不另加 Runtime 钩子 |
| 2026-10-18 | 目录条目什么时候删（§10 第 9 项，弹窗） | 保留到 W5-02 由声明生成（推荐）；迁一个删一个 | 保留到 W5-02 | W5-02 在本轮范围里，生成后一次删掉手写条目 |
| 2026-10-18 | Characters 并进哪里（§10 第 8 项，弹窗） | `modules/characters`（推荐）；`apps/local-host` | `modules/characters` | 宿主只装配；路由路径保留、客户端不改；「角色」成果类型由 Module 声明 |
| 2026-10-18 | 合并与全量（弹窗；替代同日一次性的「只看 Verify」做法） | Verify 过即可合、每批一次集成全量（推荐）；只在 main 定期跑全量；每个 PR 都跑 | 每批一次集成全量 | 单个 PR 不跑全量；同时待合的 3～6 个 PR 先合成集成分支跑一次全量，过了按依赖逐个合（每个仍要 Verify）；红了只拆出引入失败的那个。共享核心的 PR 一定在批里 |
| 2026-10-18 | 全量红了停在哪里（用户在统筹会话里提出，#716） | 用户直接给出 | 停在第一个两次都失败的文件，其余分片取消 | `run-tests.mjs --bail` 加 matrix `fail-fast: true`：重跑通过的仍算 flaky，不让分片变红；两次都失败的，分片不再开新文件，正在跑的也停掉，其余分片随之取消。代价：一次红的运行只报第一个失败，几个不相关的失败要一个个修、一次次跑；只红 main 上也红的用例时，这次运行证明不了其余文件是绿的，要在 main 修好后重跑全量（`docs/system/PARALLEL-DEVELOPMENT.md` 第 7 节） |
| 2026-10-18 | Computer Use 的系统打开/保存面板（CU-G09，弹窗） | A 先拿真机事实、独立进程的面板继续拒（推荐）；B 加窄例外；C 绕开面板 | A | 只把同进程 sheet 的情况补成真机用例；独立进程的面板请用户自己完成。落点校验与 S-25 不变（`specs/computer-use/open-decisions.md` 第 1 节） |
| 2026-10-19 | 工作流内容协议 `receive` 升到第 2 版（W4-6a，⑧ 在自己的会话里问用户） | 八个站的 MCP 工具名随版本改，`…content.receive__v1` 变 `__v2`，不留别名（推荐）；留旧名别名一段时间 | 改名，不留别名 | 八个工具：`dataset.content.receive__v1`、`feed.content.receive__v1`、`form.content.receive__v1`、`inbox.content.receive__v1`、`jelly.content.receive__v1`、`lingguang.content.receive__v1`、`pages.content.receive__v1`、`ppt.content.receive__v1`，各改为同名 `__v2`；其他工具名不变（`docs/system/CONTRACT-CHANGES.md` 第 3.5 条）。⑧ 用选择题问，用户原答「同意改名（推荐）」。同一次答复里定了真实 Home：受影响的已保存工作流由用户自己在编辑器里修（原答「我自己在编辑器里修（推荐）」；把站删掉再加回来，新引用固定 `receive@2`），产品里不写迁移代码，也不写开发 Home 的迁移脚本；已固定 `receive@1` 的流程和实例照 `specs/action-architecture` 第 3 节报「已保存的接收能力 v1 不可用」，不换版本、不写任何记录（`W4-6-04`）。Feed 里已存的、`externalId` 为 `<实例>:<步>` 的旧条目不改，新交付用 `workflow:<实例>:<步>`，这条边界也没有兼容代码。按准确版本固定 `receive@1` 的另外两类引用也一样对不上，也不迁移：MCP 客户端与内置 Agent 的动作授权（授权页把 v1 那条列为「找不到原能力、版本或提供方」，v2 未授权，要在授权页重新授权 v2，之前调不到）；Characters 角色动作范围里选过的 v1（保存或发布时报「原能力 … · v1 不可用或尚未授权给内置 Agent」，要移除 v1、改选 v2）。这两类用户 2026-10-19 另定（D25），原话：「不想手动改：在真实 Home 上做一次性维护，把授权和角色里的 receive v1 改成 v2。先在一次性 Home 上演练、先备份，时间由我定。」由一次性维护把八个站在这两类引用里的 v1 改成 v2：v2 的权限或受众比 v1 宽的那一条不带过去，列给用户在授权页重新授权；角色按人自己改角色时的版本规则处理，不就地改已发布的那一版；先在一次性 Home 上演练、整份备份，真实 Home 那一次由用户定时间、当次同意。维护脚本放会话临时目录、不进仓库，产品代码里也不加迁移，所以不登记到 `specs/repository-anti-corruption` 的保留机制（`docs/system/CONTRACT-CHANGES.md` §3 第 4 条）。**结项（用户 2026-10-20 定）：** 原来那台电脑上的 Home 不再用，现在的开发机上没有真实 Home，这次维护没有在任何真实 Home 上跑过；两次一次性 Home 演练都通过了，脚本留在会话临时目录、不进仓库。已存的工作流不在这次维护里，仍由用户在编辑器里修。见 `specs/quick-create/spec.md` §11.9 第 3 条。 |
| 2026-10-19 | 项目库基线升 v8，维护现有项目库（X-5，D15，统筹 ① 转问） | 升 v8 并维护（推荐）；不升 | 升 v8 并维护 | 先在一次性 Home 演练，维护前整份备份；真实 Home 什么时候维护由用户定（到时弹窗问，统筹 D23 第 8 条）；L1b 与 S8 合入后到维护之前，4207 的服务不重启到新的 main。做法见 `specs/plugin-project-database/spec.md` §2.4 |
| 2026-10-19 | `boards` 什么时候拆（PG-021，D15，统筹 ① 转问） | 留在宿主基线作项目根行；现在按 PG-021 拆 | 现在拆 | 项目库的身份改成项目本身（平台表 `project_root`，归 `modules/projects`），`boards` 改为 Goals 自己声明的表，8 个包里 11 张表的外键改指根行；数据迁移随 v8 一起跑，不留兼容读取，真实 Home 尽量只动一次（`specs/plugin-project-database/spec.md` §2.4，L1b 与 ③ 的 S8 同批） |
| 2026-10-20 | `alchemist.research.cancel` 的输出加了 `kind`（Pulse 取消入口，D27，#835）：版本升到 `@2`、MCP 工具名随之变成 `alchemist.research.cancel__v2`，还是仍是 `@1`（统筹 ① 向用户转达，改工具名按 `docs/system/CONTRACT-CHANGES.md` 第 3 节第 5 条是产品决定） | 保持 `@1`，不改名（推荐）；升到 `@2`，工具名改 `__v2` | 保持 `@1`，不改名；MCP 工具名仍是 `alchemist.research.cancel__v1` | 用户原话「保持 @1，不改名（推荐）」，经统筹 ① 转达。输出现在是 `{ kind: "lens", run }` 或 `{ kind: "pulse", run }`，输入哈希 `8081d3eb3674` 不变，输出哈希在 `tooling/gates/actions/actions.tsv` 里是新的（`909a3b21aa2f`）。理由四条：（1）以前能成功的输入只有 Lens 作业，现在得到 `{ kind: "lens", run }`，原来的 `run` 还在原处，只多一个字段；（2）Pulse 作业以前一律 404，没有谁能依赖那个结果；（3）仓库里没有固定 `@1` 的工作流步骤、绑定、Skill 或手册（`git grep` 查过：`tests/fixtures/studio-replay/recorded.json` 的三处只有 id、不带版本，`specs/archive` 下是历史记录）；（4）授权带版本：`apps/local-host/src/mcp-settings-store.ts` 的 `McpActionGrant`（第 7 至 12 行）有 `version`，授权的键也含版本（第 52 至 53 行）；内置 Agent 的授权是同一份 `config/mcp-tools.json` 里 `client_id` 为 `agent:prologue` 的行（`apps/local-host/src/mcp-action-access.ts` 第 52 行），授权页把版本对不上的行列为「找不到原能力、版本或提供方」（同文件第 36 行）；Characters 角色的动作范围按版本核对（`plugins/native/characters/src/plugin.ts` 第 62 行、`horizontal/agent-host/src/index.ts` 第 536 行）。升到 `@2` 会让真实 Home 里已经给出的 `cancel@1` 授权失效，要扩大 D25 的一次性维护（上一行），而保持 `@1` 它们原样有效，不需要维护，产品里也不写迁移。`tests/alchemist-mcp.test.ts` 真的经 MCP 工具 `alchemist.research.cancel__v1` 取消一个排队中的 Pulse（W5-01-ALC-RES09），工具名或版本读错时它失败。 |
| 2026-10-20 | 工作流程那样“按目录调动作”的平台服务：插件经 `services.actions.directory`（Manifest 权限 `actions:delegate`）替原调用者调目录里的动作时，嵌套调用受谁的权限约束（W5-01，用户直接定；编号 S-43） | （a）只受原调用者的权限约束，与今天 Workflows 的行为一样（推荐）；（b）在原调用者的权限之外，再收窄到插件自己的授权 | （a） | 嵌套调用者是 `{ ...原调用者, audience: "workflow", delegated_by: <manifest.plugin_id> }`，`permissions` 不变，`plugin_install_id`、`host_plugin` 与原调用的 `beforeEffect` / 保留授权句柄不带过去。原调用者的 `allowed_actions` 与 `validate_authority` 也随它带过去（内核的 `visibleAction` 查 `allowed_actions`，委托的 `validate_authority` 链到原调用者的），所以（a）是“不再另外收窄到插件自己的授权”，嵌套调用照样受原调用者的授权范围约束：本人页面发起的，`allowed_actions` 覆盖本人能到的全部动作，只受目标向 `workflow` 开放这一条约束；MCP、Agent 发起的，`allowed_actions` 只含该客户端已授权且对 mcp / agent 开放的动作，每个目标还要过客户端自己的授权复查（`mcp.action_revoked`），只到得了客户端自己授权过的动作（`tests/security-invariants-plugin-action-delegation.test.ts` 的 W5-01-DELEGATE-05 用与生产同形状的 MCP 调用者钉住，用户决定 (a) 本身没有改）。插件经 `services.actions.invoke` 调自己的动作时，调用者由 `plugin-actions-client.ts` 的 `actionCaller` 造（`user` 受众、插件自己的授权），`allowed_actions` 只含本插件的动作与 `required_actions`，从这样的自调用里委托到别的插件的目标被拒。补充验收 W5-01-DELEGATE-08：经插件项目路由的本人调用，只在插件声明并持有 `actions:delegate` 时保留本人的目标权限；查询委托仍按插件授权收窄，没有委托权限的伪造分发仍拒绝（AQD-04）。W5-01-DELEGATE-09：`directory.check(reference, input)` 固定与 `invoke` 相同的目标，复查原调用者的异步和同步授权，再校验目标输入，不运行、不记账、不保留守卫，让消费者在记尝试之前拒绝坏输入或已撤回的权限。这两条由同一测试文件中的同编号用例验证。七条护栏，每条有拒绝它的测试（`tests/security-invariants-plugin-action-delegation.test.ts`，安全表 S-43）：（1）只有 Manifest 声明 `actions:delegate` 的插件才有这个服务，授权按安装给、不因为是内置，每次 `discover` / `invoke` / `check` 都 `requireGrant`；（2）只能在本安装自己正在运行的动作内用，不能后台用；（3）原调用者的受众是 `plugin` 的拒绝（别的插件用它自己的授权调进来），`user`、`agent`、`mcp`、`workflow` 可以；（4）受众换成 `workflow`、记 `delegated_by`，其余身份与权限原样；（5）目标没有向 `workflow` 开放、需要原调用者没有的权限、或在原调用者自己的 `allowed_actions` / `validate_authority` 之外的拒绝；（6）取消、撤权、实例停止在每次 await 前后终止调用，不交回结果；（7）调用记录行写 `delegated_by`，并进折叠比较。目标的受众只对 `workflow` 核，与今天 Workflows 的嵌套调用一样。插件这边仍保留原调用对目标的授权守卫，调用途中目标被重载、不可用或原调用授权失效，结果都不交回插件；内核的 `retainAuthority` 为此加了可选的 `{ audience: "workflow" }`，按工作流受众接纳目标。不加这个选项，守卫会按原调用者自己的受众再核一遍目标（例如原调用者是 `agent` 时，拒掉只向 `user`、`workflow` 开放的目标），比用户的决定多收窄一层。守卫只检查、不授予任何东西。选（b）会让这个服务比工作流程更窄，插件要替人做的事要多登记权限，没有被采用。 |
| 2026-10-20 | Alchemist 每个项目的工作室库放在哪（Alchemist 迁到 Plugin Runtime 的 S0a，要动真实 Home 的数据；用户在 ② 会话里直接定） | A 平台的「按项目分区的插件库」，位置不动、只改文件名（推荐）；B 并进项目库 `databases.project`；C 位置和文件名都不动，声明里允许写文件名 | A | `services.database` 加 `partition: "project"`，只许 Home 级实例声明；项目只从可信的调用上下文取，不在项目里的调用拒绝。库在 `{home}/<store_name>/projects/<编码后的项目 id>/<store_name>.db`，编码沿用 Alchemist 现在的写法，所以目录不变，只有 `studio.sqlite` 改名为 `alchemist.db`。闲置关库、删项目时先取消再关库再删、失败留 pending 重试，都归平台，插件不自己写。D25 已于 2026-10-20 结项，本机没有真实 Home（见上面 `receive` 升版那一行的结项说明）：读取兼容与维护按 `docs/system/CONTRACT-CHANGES.md` 从第一个装到开发机之外的版本起算，到那之前改名不需要维护步骤，产品里也不写迁移。B 要搬 36 张表的真实数据，Alchemist 的作业还要和项目里别的插件抢同一把写锁；C 给平台留一个只为旧路径存在的选项，都没有采用。完整方案随第一片写进它自己的 spec（Alchemist 2026-10-21 定不迁，见本表末；平台这一半已合入 #883，去留到删除那一片再核） |
| 2026-10-20 | 插件用人的连接（如 GitHub 令牌）向外发请求，怎么给（Alchemist 迁移的 S0b-2，信任边界；用户在 ② 会话里直接定） | A 通用的连接外联服务，来源由平台的连接服务定义决定（推荐）；B 通用服务，来源由插件在 Manifest 里写、在安装确认里给人看；C 每个要用的插件各开一个专属服务 | A | `services.connections`：Manifest 声明连接槽与权限 `connections:use`，由人在插件设置里绑定，默认不绑、不绑就匿名请求。宿主现取令牌，只在请求来源精确等于平台连接服务定义里的来源时加凭据，插件看不到令牌、也没法把它引到别的地址；跳转不带凭据，只连公网地址，只能在本实例正在跑的动作或后台作业里用，每次查授权。落地为安全不变量 S-57（2026-10-23 取号：main 到 S-55，S-56 归在途的 #1079），每条护栏一条拒绝测试；人在插件设置里选账号的界面另做（S0b-2b），在它之前绑定只经只对 `user` 开放的动作 `connectors.plugin_slot.bind@1`。B 写错一个来源，令牌就可能发给第三方，只能靠人在确认时看出来；C 违背 10-18「插件缺什么就补进平台、不开私路」。Images、Jelly 以后也改到这个服务上，另记 BL（Alchemist 2026-10-21 定不迁，见本表末；服务本身 Feed、Images、Jelly 照旧要用，见 privileges.md 的 PG-045、PG-102） |
| 2026-10-20 | 集成分支上的全量怎样停、占几台 runner（用户问合并能不能再快，统筹 ① 弹窗；改 10-18「全量红了停在哪里」和 10-15「限流」两行在集成分支上的做法） | 集成分支上关掉 `fail-fast` 和 `--bail`（推荐）；保持现状。runner 提到 10 台（推荐）；保持 6 台；提到 16 台 | 集成分支上关掉；提到 10 台 | `.github/workflows/full-suite.yml`：条件是 `startsWith(github.ref, 'refs/heads/integration/')`，推送和手动跑集成分支都算。PR 加标签、每晚的 main、手动跑别的分支，照旧 `fail-fast`、`--bail`、6 台。起因：batch-1020-2 从 10-20 04:08 UTC 起连红 9 次，每次只报一个文件，而且一次一个不同（e2e、context-pick-result、contextual-pages-goals、contextual-todo、assistant-undo-refresh、cognia-actions、agent-run-session、issue-reorganize），修一个跑一次。现在一次红的运行就列出所有两次都失败的文件，两次都失败的定义与 flaky 的算法不变。代价：红的运行要跑完，约 20–25 分钟，不再几分钟就停；两批同时跑会占满 20 台，`Verify` 要排队。仓库公开，Actions 不另花钱。`docs/system/PARALLEL-DEVELOPMENT.md` 第 7 节同步改。 |
| 2026-10-20 | Shelf 迁到 Plugin Runtime 之前平台要补的三件（S0-1，③ 向用户问的三个问题，经统筹 ① 转达）：（1）Shelf 的网页抓取今天允许本机页面，而 `materials:fetch` 只许公网；（2）Shelf 重新哈希时读 `origin_realpath`（任意绝对路径）；（3）图片上限从 50 降到 30 | （1）允许；不允许。（2）保留；不保留。（3）降到 30；保持 50 | 「1.允许 2. 留 3. 不行」：本机页面允许、`origin_realpath` 这一读保留、图片上限不降，保持 50 | 一条原则：平台补能力，任何插件声明并获授权都能用，不给 Shelf 开私路。（1）新的平台权限 `materials:fetch_local`，给 `services.materials.readLocalPage(url)`；没声明或没授权，`readSource` 照旧只许公网（S-10）。地址只到回环（`http://` 加 `127.0.0.1`、`[::1]`、`localhost`，无账号密码，“是不是本机”只问 `platform/loopback` 那一份），宿主自己的 Web 入口和它起的浏览器的调试口照旧拒绝，每一跳重定向再查一遍。（2）新的平台权限 `materials:original`，给 `claimOriginal`、`readOriginal`、`releaseOriginal`：路径只由宿主入口在用户驱动的那次导入里记下（该请求的 `Sec-Molis-Work-Original-Path` 头，网页脚本设不了；按 `plugin_id`、安装、激活所在的项目和插件自己的记录键存真实路径，删除项目时清掉该项目的登记），插件自己给不出路径；服务只读，读之前重新解析真实路径、与登记值相等才读（防符号链接替换），上限 32 MiB，不列目录、不写。桌面壳发这个头、导入请求不再把路径放进请求体，是 Shelf 迁移 S2 的事。（3）本片没有提高上限，`services.model` 一次仍是 30 张：供应商收得下 50（Anthropic 每次 100、OpenAI 1500、DeepSeek 600、通义千问 256、Kimi 不限张数、GLM-4.5V/4.6V 50、MiniMax-M3 实测 100），但 vendored Prologue SDK 收不下——`resource/core/bind.js` 的附件占位串是 `PROLOGUE-ATTACHMENT-<nonce>-<序号>`，`host/plugin/node-intake.js` 的 `spliceAttachments` 要求每个占位串在请求体里恰好出现一次，`…-1` 又是 `…-10` 到 `…-19` 的前缀，所以一次请求带到 11 张图就整次拒发（`MODEL_NETWORK_FAILED`，实测 10 张通过，11、21、30 张都被拒），现有的 30 张上限在这个 SDK 上其实只有 10 张可用。“任何一方收不了就不提”，所以不改数；改 SDK 占位串并换 vendored 包，还是把上限如实改成 10，待用户定。另有一项不是用户决定的：`imageTextAvailable()` 与 `extract` 同在 `materials:read` 之下（只回答本机能不能识别图片文字，不读材料，复用宿主已有的那一个判断）。两个新权限的拒绝测试见 `docs/system/SECURITY-INVARIANTS.md` 的 S-44、S-45。 |
| 2026-10-20 | 一个插件的 Home 实例和项目实例（双实例，PG-012；Shelf 迁到 Plugin Runtime 的前置 S0-2，用户在 ② 会话里直接定 U1、U2） | 授权 U1：A 每个实例各一条记录、Manifest 权限全部必需（推荐）；B 项目实例的授权取两条记录的交集。范围 U2：A 先只给宿主装配的插件（推荐）；B 第三方与沙箱插件也能声明 | U1 选 A；U2 选 A | 标记 `dual_instance` 只在宿主自己的启动名单上（目录条目的 `runtime.dual_instance`），Manifest、安装记录和项目那一半都说不了，规则写进 `skills/molis-plugin-dev/host.md`「双实例」与 S-15。U2 与 2026-10-18「插件的待遇」之间的差距，是同一个平台缺口：外部插件今天还装不了 Home 实例，它们能装 Home 实例那天才谈得上声明另一半；不是给内置插件开的私路，现在一个也没用上（Shelf 迁入时第一个用）。U1 的代价：项目记录也持有只有 Home 一半才用的权限，项目一半没有那些处理器，用不到；交集方案等真有带可选权限的双实例插件再做。设计、切片与验收见 [`specs/dual-instance-plugins`](../dual-instance-plugins/spec.md) |
| 2026-10-21 | Alchemist 与插件创作台迁不迁（统筹 ① 转达用户；改 10-18「这一轮的收口范围」与「四个构建期例外」里关于这两个的部分） | 用户直接答复 | 不迁；防腐收尾后删除，再重做 | 用户原话：「Alchemist 和 插件创作台先不用迁，帮我做个备份，直接删了，我后面等防腐做完重新重做」，随后补充「先不做删除，我就是跟你说下，这两个不要迁，先把我们防腐做完，再删」。所以这一轮两件都不做：不迁到 Plugin Runtime，也先不删。[privileges.md](privileges.md) 里只关它们的行，「状态」写成「不迁；防腐收尾后删除，再重做（用户 10-21）」，不再算进本线的完成标准；几个插件共有的行只把它们那一部分划出去。删除与重做记 BL-376（Alchemist）、BL-377（插件创作台）。备份是远端分支 `backup/alchemist-plugin-builder-2026-10-21`（main `458b33059`），真删时按当时的 main 另做一份。删除范围用户同日已定（「一起删（推荐）」）：创作台的离线回放（`pnpm studio:replay` 与 CI 里对应的任务）和宿主里只给创作台生成的插件开的专用通路，随创作台一起删；通用的第三方插件安装、沙箱和它们的安全测试保留；以前由创作台生成、已经装好的插件随之不能用。本机没有真实 Home，不写迁移、不留兼容。删之前两者的现行代码照常受门禁约束，别的片碰到照常改；为迁它们而排的平台工作不再因它们而做，别的插件也要用的照旧。 |
| 2026-10-23 | Alchemist 与插件创作台删不删（用户在防腐收口目标里直接写；改上一行的「防腐收尾后删除」） | 用户直接写 | 不删；可以绕过、先不理会，后续重做 | 用户原话：「Alchemist 和插件创作台不删，但是可以绕过先不理会，后续重做」。所以本轮收口不删这两者，BL-376、BL-377 的删除计划不执行，留作重做时参考；仍不迁。[privileges.md](privileges.md) 里它们的行按「不迁、不删，本轮绕过，后续重做（用户 10-23）」读，照旧不算进完成标准。要删，先问用户。 |
| 2026-10-27 | 后续 Alchemist 与插件创作工作台的需求归并 | 用户本次直接要求 | 场景组装是平台能力，与工作台升级一并交付；Alchemist 为落地场景 | 现行需求见 [plugin-builder-upgrade](../plugin-builder-upgrade/spec.md)，统一由 BL-377 承接；删除独立重做项 BL-376，旧编号不复用。与场景包设置、秘书与助理团引导、首次／项目／通用任务 Onboarding 三项独立。本次只改需求和计划，不启动实现、不删除旧代码，10-23 的本轮绕过边界保持。 |
| 2026-10-25 | 巨大单元要不要硬拆（用户在防腐收口目标里补充；改 §4.5 与 W5-10 的「拆到阈值以下」、10-07「登记不放行新增」） | 用户直接写 | 不硬拆：本身合理的标明即可，混了几件事的才拆 | 用户原话：「对于oversized-unit，我们也不是硬拆，只要本身合理，可以不做硬性拆分，标明即可」。门禁随之改：`tooling/gates/giant-exceptions.json` 的条目带 `kind`（新增 `cohesive-unit`）、理由和门禁量出的 `size`，大小与实测相等就放行新增与变大；`size` 不等直接失败，所以每次变大小都在 diff 里由评审看见；没有标明的巨大单元照旧不许新增、不许变大。W5-10 改为逐个复核：本身合理的改判「例外」并标明，不为凑数字硬拆。规则写在 `docs/system/HUGE-CLASS-MIGRATION.md` §1、§4。 |
| 2026-10-25 | 插件样式放在哪里（PG-070；ac-clients-1 的 W5-04 余项设计稿，统筹弹窗问） | 用户弹窗选推荐项 | 拆成按需加载的 css：每个插件的样式（现在 403 KB，全在 `workbench.css` 里）搬到 `/assets/molis-work-plugins/<id>.css`，只在该插件出现时加载 | 一次批准约 20 个新资源，其中 9 个超过 10 KB（coding 82、pages 54、feed 45、workflows 43、shelf 39、plugin-builder 35、jelly 20、todo 14、form 11 KB）。条件：总字节不许变多，`workbench.css` 要少掉这 403 KB；`page-assets.json` 按实测在同一个 PR 里写，放行理由写在 PR 里。负责：ac-clients-1（RAC-750～769，PG-070、PG-071 合一个 PR） |
| 2026-10-25 | 插件的英文词典由谁带、怎样登记（PG-071；同上） | 用户弹窗选推荐项 | 插件包自带，在 Manifest 里声明：每个插件在自己的包里带「中文键 → 英文」词典，在 Manifest 里声明；平台对内置插件和第三方插件用同一种方式加载；`apps/workbench/src/i18n/en.ts` 不再 import 插件包 | 翻译门禁（`scripts/gates/translations.mjs`）改成读这些声明，经用户批准，口径只许持平或更严。「中文原文当键」作为保留机制写进本 spec 的保留机制。ac-clients-1 起初提议在内置目录上加一个登记字段，那样只给内置插件，违反 10-18 的同等待遇，所以没采用 |
| 2026-10-25 | PG-071 落地口径（上一行的实现：字段、保留的机制与已知限制） | 上一行的方案 A：Manifest `ui.messages` 是纯数据词典，平台从已安装插件的 Manifest 派生英文目录，内置与第三方一样，门禁改读声明（推荐）；B 维持工作台 import 插件词典，只把 Goals 的语言改掉 | 选 A | `ui.messages`（稳定键）与 `ui.translations`（中文原文→英文）是 Manifest 字段，形状检查在 SDK 一份。**`ui.translations` 任何发布者都收（用户 10-25「内置与第三方同一种方式加载」；统筹评审纠正了最初的「只给宿主构建的插件」），但只翻译声明它的那个插件自己的框架和贡献，不进全页目录**：中文原文不属于任何人，同一句在宿主页面和别的插件里都出现，所以一个插件的词典改不到宿主或别的插件的句子；宿主 `EN` 优先；宿主（含外壳画的 Goals、Feed 等）画一个插件交来的文字时，用该插件自己的词（`withPluginWords`/`LFor`，统筹评审 2026-10-25 定），所以第三方也有英文，而且只限它自己的文字；宿主词典里只留宿主自己的、或几个插件共用的句子（`shared-words-en.ts`），不再有给内置插件开的词表。`apps/workbench/src/i18n/en.ts` 不再 import 任何插件包；翻译门禁改读声明，只许持平或更严。**保留的机制**：`ui.translations` 是过渡段，内置插件的页面代码还以中文原文为键，逐个迁到稳定键后删（`apps/workbench/README.md`「界面文字」）；登记表不随撤权注销（进程内、不含事实）。**已知限制**：动作返回的整句和历史调用记录里存下的标题宿主不翻译，要英文就用稳定键或按语言返回；第三方的独立查看页仍是中文；宿主按非字面量的键查词时，只有套了该插件的词才查得到它的词。记录见 [slices/pg071-plugin-messages.md](slices/pg071-plugin-messages.md)。 |
| 2026-10-25 | PG-070 第 2 片落地口径（Shelf、Diff、插件创作台搬出共用样式表，加门禁） | 第 1 片之后的收尾：给「共用样式表里属于具体插件的规则」加按插件计数的门禁，只许减少 | 按第 1 片同一方向做完 | 拆分条件去掉「有设置页的插件」：Shelf 整张成为 `shelf.css`，框架与外壳画的设置页都链接它（`pluginSettingsStyleLinks`），设置样式表不再带插件规则。Diff 的 27 条规则只画 SDK `diff-view` 的类，改名为 SDK 自己的 `mw-diff-*` 名字空间、规则搬进 design-system `DIFF_VIEW_STYLES` 由工作台样式表下发，Diff 删掉样式表与注册字段、不新建 `diff.css`。插件创作台新增注册字段 `stylesheetPrefixes`（`as-`、`pb-`），拆分按 id 名字空间加声明前缀判定，`pc-` 组件词汇与宿主画的 `as-preview-page`/`pb-surface` 留共用；宿主 `catalogProblems` 拒绝冲突前缀；逻辑与类名不改。级联离线核对无同优先级平局；Feed、Goals 本片不搬，门禁列数字。验收 RAC-763～769；门禁口径先报 PR #1302，统筹 2026-10-25 批准后已实现 `scripts/gates/plugin-styles.mjs`；评审 18:23 指出第一版跳过有框架插件、扣除 `stylesheetShared`（声明共用即可藏规则），已改成对每个有样式表的插件都量、不扣 `stylesheetShared`，首冻结 coding 9、feed 234、form 6、goals 321、plugin-builder 5 规则块共 575，文件记住 `stylesheetPrefixes` 且只许加（删前缀会让规则回到共用表），只许降；CI 在 page-assets 之后对 merge-base 比对，`--update` 拒绝增长与新插件。记录见 [slices/pg070-plugin-styles.md](slices/pg070-plugin-styles.md)。 |
| 2026-10-25 | PG-070 落地口径（上上一行的实现：怎样拆、哪些留在共用样式表） | 上上一行的方案 A：拆成按需加载的 css，总字节不许变大 | 选 A | 页面在框架里运行的插件，名字空间（`.<id>-…`、`[data-<id>…]`）下的规则作为 `/assets/molis-work-plugins/<id>.css` 单独发，框架把它链接在工作台样式表之后；别的规则留在共用样式表，拆分按名字做、不改规则适用的对象；`stylesheetShared`/`stylesheetUses` 是新注册字段。**页面资源**：15 个新资源（不是约 20 个）按批准一次登记，`workbench.css` 同时少 247,609 字节，总量 −83 字节。**保留的限制**：靠源码扫描找框架之外也画的类，运行时拼出来的类名找不到，由框架页面的浏览器用例兜底；创作台与 Alchemist 不迁（绕过）。记录见 [slices/pg070-plugin-styles.md](slices/pg070-plugin-styles.md)。 |
| 2026-10-25 | 插件读本机目录的授权怎样管（PG-049；ac-kernel 设计稿 `slices/pg049-local-directory-consent.md` §5 四点，统筹弹窗问，第一次英文弹窗答案自相矛盾，按用户要求改用中文重问） | 用户弹窗 | ① 选了目录就一直有效，直到本人撤回；② Agent 自主、定时、工作流、MCP 等后台调用也能用这份授权读，每一次读都进可见记录并通知本人；③ 插件升级换代后授权沿用，不再问；④ 平台设置单独一页「本机目录」，按插件列，可撤回 | ①②③ 没选设计稿的推荐（推荐是可选记住、只限本人当场发起、升级后再确认一次）。这是放宽安全边界：实现时另开 SI 行，测试断言仍然存在的拒绝（撤回后立即拒、别的插件拿不到、目录之外的路径拒、停用/撤权/取消的调用不读、每次读都有记录与通知）。实现由 ac-kernel 叠在 #1298 上 |
| 2026-10-25 | Home 级插件实例要不要建按项目给的成果、端口、事件服务（PG-025，D5；ac-platform 第 5 组 `slices/home-instance-project-services.md` §3，统筹弹窗问） | 用户弹窗选推荐项 | 不建，改成目录检查：Home 实例声明了这三样，目录检查与启动时拒绝，提示做成双实例、由项目那一半拿；以后真有插件需要时，按真实使用者开片 | 改了原 §4 k「Home 实例按调用所在的项目给数据库、成果、路由、端口和事件」的方向（数据库与路由不变）。理由：6 个 Home 级内置插件没有一个用得上（Shelf 是双实例），原本要用它的 Alchemist 迁移已撤销，先建没人用的路等于给平台加一个没有调用方的合同面。privileges PG-025 以「不做，用户确认」收口 |
| 2026-10-25 | PG-070 第一片只搬出 248 KB、留下 5 个插件的样式要不要收口（#1302 实际 −248 KB、15 个资源；Feed、Shelf、插件创作台、Diff、Goals 约 155 KB 仍在 `workbench.css`；统筹弹窗问） | 用户直接写：「我要求尽可能插件都是独立的，这才是插件平台的意义」 | 不以 248 KB 收口，五个都搬出：Shelf 的设置页改成插件自己的设置贡献、样式随包；Diff 与 SDK diff 视图共用的规则归 SDK 的 diff 组件，独有的随 Diff；插件创作台只搬样式不动逻辑（照 10-23「绕过」）；Feed、Goals 没有自己的客户端，样式随 FI 线与 Goals 迁移线各自的客户端一起搬，写进两线验收。另加门禁：`workbench.css` 里属于具体插件的规则按插件计数、只许减少（口径由统筹审） | 负责：外部 Agent（DeepSeek，用户 10-25 交办），从 #1302 的分支另建 `deepseek/pg070-slice2`，验收号 RAC-763～769，做完在 #1302 评论里交、由统筹合进 #1302；ac-clients-1 只修 #1302 的挡合并项；新增的 Shelf、Diff、创作台三个资源在 10-25 PG-070 的批准范围里，每个 >10 KB 的在 PR 里写字节 |
| 2026-10-29 | 0.3.0 是不是第一个外部版本；W5-15 余下的发版、BL-812（平台包日志端口）算不算进防腐完成标准 | 用户在统筹会话里直接定 | 1.0.0 之前都是开发版本：0.3.0 不是第一个外部版本；W5-15 发版与 BL-812 不算进完成标准 | 用户原话「1.0.0 之前都是开发版本」。2026-10-08 #15 行的起点（第一个装到开发机外的版本）不变，只是不早于 1.0.0；`docs/system/CONTRACT-CHANGES.md` 顶部与第 7 节、`c-end-readiness.md` 的 D1 同步。BL-812 记录在案、后续做（仍随 BL-169，`specs/BACKLOG.md`） |

**待决（开工后攒批弹窗问）**：

1. ~~真实 Home 的处理~~：已定，见上表（同事没有要保留的 Home）。已知：`~/.molis-work`，主检出上的 4207 与常驻服务 4173（LaunchAgent `com.adeptify.goalboard.web`，安装版 0.2.0）都用它；`~/.goalboard` 是指向它的符号链接，不是另一个 Home；4208 开工核对时没有在监听。
2. ~~插件升级声明的机制~~：已定，见上表。
3. ~~共享核心的评审方式~~：已定，见上表。
4. ~~vendored 私有包~~：已定，见上表。
5. ~~他人的工作树与分支~~：已定，见上表；保留 Codex 工作树 d62d（1,173 个未提交文件）、side-shelf（未审阅的 spec 草稿）、anti-rot（本目标的任务书）、plugin-picker-pins（在做）。
6. ~~Casebook 外部合同的旧名~~：已定（10-04，见上表）。原记录：`apps/local-host/src/casebook/` 里的 `contract_id` 都是 `goalboard.casebook.*`，JSON Schema 的 `$id` 在 `goalboard.dev` 下。外部 Casebook 插件按这些 id 对接，改名是合同变化，要外部插件同步（§4.1「旧身份与旧名称」）。源码里其余的 `GoalBoard`（如 `project-capabilities.ts` 的 `checkGoalBoard`）只是内部命名，随 `board_id` 合并一起改。（Casebook 已于 2026-10-10 整个删除，这一条已没有对象。）

**W2-18 产出的决定（2026-10-09 已弹窗问完，结论在每行末尾）**：证据写作（[逐插件结论](plugin-conclusions.md)、[AI 入口清单](ai-entry-inventory.md)、[前端动线走查](frontend-flow-walk.md)）没有改代码，凡是产品行为、合同语义或要动依赖的，都停在这里，等用户定。其余发现是清理和文字修正，没有选择，按各自的去向做。

| # | 问题 | 选项 | 推荐 | 证据与去向 |
| --- | --- | --- | --- | --- |
| 1 | agent-host 的 `CliAgentAdapter`（`claude` 命令行）去留 | （a）删掉并从 agent-host 公开入口移走，`pnpm api:update`，5 个把它当夹具的测试文件换夹具；（b）留着但不再默认注册；（c）保持现状 | （a）：外部 Agent 运行时按口径暂缓，它默认注册却没有内置调用方，是一条「旧执行器」的尾巴 | [AI 清单](ai-entry-inventory.md) §7 第 1 项、EX-6；**用户 10-09：删掉（推荐）**；**已完成（#364，2026-10-10）**：三文件、公开入口的导出和默认注册一起删了，测试换夹具 |
| 2 | 实验里的 `grok`/`laya` 本地调用要不要进 AGENTS.md | （a）加一条独立的短说明指向 `CALL-CHAINS.md` §10.1，并写成「例外要有登记和删除条件」；（b）只在 CALL-CHAINS 登记（现状）；（c）迁成 agent-host 的外部运行时适配器 | （a），只加一条、不改已有条 | AI 清单 §7 第 2 项、EX-1、EX-2；10-07 矛盾裁定已定「登记为例外」，这里问的只是 AGENTS.md 里要不要有字；**用户 10-09：加一条短说明（推荐）**；**2026-10-10 随实验插件删除不再需要**：唯一的 `grok`/`laya` 调用方已删，CALL-CHAINS §10.1 的这条例外同时删除，B 批不加 AGENTS.md 这一条（见上表 2026-10-10「实验插件」一行） |
| 3 | 定时任务创建时查不查就绪（模型、已绑定的工作区） | （a）缺时对话框给提示、仍允许创建；（b）缺就拒绝创建；（c）保持现状（到点才「叫醒失败」） | （a）「提示但不挡」，用户可能稍后配置 | 逐插件结论 K-2；AI 清单 §7 第 5 项；动线走查截图 17；**用户 10-09：创建时提示、不挡（推荐）** |
| 4 | 没有模型的第一次使用：要不要供应商预设 | （a）几家常用供应商（含 Prologue 已支持的两种协议）一键模板，保存时做一次连通性自检，保存后回到触发它的页面；（b）只加连通性自检；（c）保持现状 | （a），并定它算不算本轮防腐范围（[c-end-readiness.md](c-end-readiness.md) 把「BYOK 首次引导」归为产品引导） | 动线走查 V-1、截图 14 至 16。这一项不含「出站时把主机名、包名发给第三方要不要在界面告知」，那一句单列为待决 14；若这里选 (a)，要改的模型设置供应商表单可以同片放下待决 14 的那句话；**用户 10-09：这轮就做全套：一键供应商模板、保存时连通自检、保存后回到原页面（用户没选推荐）** |
| 5 | Text Stats 是否留在用户的插件列表 | （a）保留作示例；（b）藏进开发者模式（仍可装，仍是平台的样板和测试依托）；（c）删除 | （b） | 逐插件结论 E-13、截图 03、30；**用户 10-09：藏进开发者模式（推荐）**；第二轮（10-09）：**开发者模式只由 Host 启动变量 `MOLIS_WORK_DEVELOPER_MODE=1` 打开，设置里不加开关** |
| 6 | Pages「新建文档」立刻落库一条空的「未命名文档」，离开不清理 | （a）内容为空就在离开时丢弃（`pages.discard` 已有）；（b）第一次输入才创建；（c）保持现状 | （a），灵光「记下第一条灵光」同类，一并看 | 逐插件结论 E-9、截图 11；**用户 10-09：内容为空就在离开时丢弃，灵光同类一并（推荐）** |
| 7 | 炼金术士市场脉搏的 GitHub 令牌怎么读（现在读环境变量 `GITHUB_TOKEN`） | （a）改用 Settings 里 GitHub 连接器的密钥引用，没绑定就匿名（限额低），并让界面写明会访问 Toolify、观猹、GitHub；（b）一律不带令牌；（c）保持现状 | （a） | 逐插件结论 E-16；AI 清单 §3.10 第 7 类；**用户 10-09：用设置里的 GitHub 连接器（推荐）**（2026-10-21：Alchemist 不迁，防腐收尾后删除再重做，见上表末；这一项不再单做） |
| 8 | Characters 的 `create`/`update`/`state` 没有权限声明，却对助理、MCP、工作流开放 | （a）受众收到仅用户；（b）加 `characters:write` 权限；（c）保持现状 | （a）：Characters 已定并进宿主设置（决定 #26），那时的写入是只给用户的管理接口（决定 #7），现在直接收受众与终态一致，不必为将要并走的插件新造权限；合同变化，要刷新 API 与动作合同快照 | 逐插件结论 E-2；**用户 10-09：保持现状（用户没选推荐）** |
| 9 | Feed「升格为 Goal」在 Goals 被移出项目后仍成功，并写进 Goals 的数据 | （a）动作的可用性和「升格为 Goal」入口都跟 Goals 的项目启用状态走（同 `feed.goals.context`）；（b）升格改成经 Goals 的动作写（N-12 的「对外的只走动作」），Goals 自己的启用检查随之生效；（c）保持现状 | （b），W2-08 删桥时一起做 | 逐插件结论 E-15；**用户 10-09：升格改走 Goals 自己的动作，随 W2-08（推荐）**；**已做（W2-08）**：升格经 Goals 的动作写，入口（`feed.items.offers`、阅读页按钮）跟升格动作的可用性走，取舍记在 §1 2026-10-09 一行 |
| 10 | 外壳控件小于 `DESIGN.md` 的触控下限（桌面标题栏标签条 22 至 26px，手机标签 26、底栏图标 40、助理输入 28） | （a）达标（手机先把助理输入框、发送、附件做到 44）；（b）在 `DESIGN.md` 为标题栏与底栏写有范围的例外；（c）保持现状 | （a）手机先行，桌面标题栏写例外 | 动线走查 V-2、§4 度量；**用户 10-09：手机先达标、桌面标题栏写例外（推荐）；二次答复：触控尺寸按输入类型、不按宽度——凡 `pointer: coarse` 的设备（横过来的手机如 852×393、平板）都是 44px 目标，精细指针的窗口保持桌面尺寸，`DESIGN.md` 的例外只覆盖精细指针窗口，不留「已知缺口」** |
| 11 | 飞书/Lark 的 MCP 连接器用 `npx -y @larksuiteoapi/lark-mcp mcp` 起子进程：包没有固定版本，子进程拿到 Host 的**整份**环境变量 | （a）固定精确版本、纳入依赖由 `pnpm-lock.yaml` 管，同时把环境收窄到它需要的变量；（b）只收窄环境；（c）保持现状 | （a） | AI 清单 §7 第 11 项、§3.10 第 1 类；`connector-mcp.ts:215`；W1-20 的依赖清单只查工作区包，没收进它；**用户 10-09：固定版本并收窄环境（推荐）** |
| 12 | Shelf 首次打开自动放一份「试用示例.pdf」 | （a）保留，在规格里写明是有意的（与「不生成演示数据」并存）；（b）改成空状态里的「试用示例」按钮；（c）删除 | （a） | 逐插件结论 E-12；**用户 10-09：保留，在规格里写明有意（推荐）** |
| 13 | 个人插件在项目里「移除」改成真停用（BL-088）何时做：行为 2026-10-01 已定，只问排期 | （a）单独提前成一小片：个人插件也进可用性策略（`project-action-availability.ts` 现在只处理非个人插件），搜索来源与助理能力搜索跟着；（b）随 W5-01（现状，XL） | （a）：选择器里 13 个个人插件有「移除」按钮，逐个移除（含选择器里没有的 Characters 与创作台，共 15 个）后，它们的动作一个都没有变成不可用，助理与 MCP 仍调得到；工作量没有评估过 | 逐插件结论 K-1、`specs/BACKLOG.md` BL-088；**用户 10-09：随第 5 波插件迁移一起做（用户没选推荐）** |
| 14 | Molis Work 有三种情况会在你不知道的时候，把一个名字发给第三方（只是网站名或包名，不含你的内容；界面上现在一处都没写）：（1）插件创作台做构建检查时，把生成的插件要用的依赖包名和版本发给 npm 官方仓库去下载；（2）你的电脑开了代理软件、查任何网址都先得到一个占位用的假地址（198.18 开头）时，要连的模型服务和炼金术士搜索服务的网站名，会发给 Google 和阿里云的公共域名查询服务去问真实地址；（3）同样是假地址的情况下，Jelly 导入一张网页时，那张网页的网站名会发给 Google 的公共域名查询服务（比（2）更接近「你读了哪些站点」）。要不要在界面上告诉用户 | （a）三种都在界面上写一句；（b）只在创作台的构建检查旁写一句（说明依赖包名和版本会发给 npm），两种公共域名查询只写进文档；（c）三种都只写进文档（整理一页「Molis Work 会联网去哪里」放进 `docs/`，设置页放链接）；（d）保持现状 | （b）：npm 那一种每个带依赖的生成插件都会遇到，发生在你自己点的构建检查里，一句话放得下；两种公共域名查询只在电脑返回假地址时才发生（第一种还要设了代理），发出去的只有网站名，是开发机一类环境的事，而这类环境里代理软件本来就能看到这些网站名 [推断]，放进每个人的界面是噪音。如果你认为「读了哪些站点」本身就该告知，改选（a），Jelly 的那句放在来源输入框旁 | [AI 清单](ai-entry-inventory.md) §7 第 10 项、§3.10 第 9 类（npm）、第 10 类（两套公共域名查询）、第 4 类（Jelly 读网页）；代码 `plugin-builder/build-dependencies.ts`、`horizontal/agent-host/src/adapters/node-model-dns.ts`、`apps/local-host/src/jelly-source-reader.ts`。待决 4 若选（a），要改的模型设置供应商表单可以同片放下（1）至（3）里属于它的那句；**用户 10-09：创作台构建检查旁写一句，其余写进文档（推荐）**（2026-10-21：（1）随插件创作台删除，不再做，见上表末；（2）（3）照旧） |
| 15 | 同一个搜索服务（AnySearch）在 Host 里有两套各自的联网代码：炼金术士用一套，Feed 的网页搜索用另一套（来自仓库附带的搜索依据包 Search Evidence Layer）。两套写了同样的安全限制（固定网址、只连公网地址、请求和回答的大小上限、不跟随跳转），行为只在一点上不同：开了代理、电脑返回假地址时，炼金术士的研究能搜，Feed 的网页搜索会失败（错误码 `provider_unavailable`）。代码里的注释说这是有意的，但没写原因。要不要合成一套 | （a）Feed 也改用炼金术士那套：一套代码、一套规则，Feed 的网页搜索在代理环境下也能用；代价是 Feed 的这个来源也要走公共域名查询（待决 14 的告知要覆盖它）；改动在 Feed 来源服务的默认设置里，不大，但没有试做；（b）反过来，炼金术士也用 Feed 那套，删掉炼金术士自己的联网代码和它的测试夹具：一套代码、没有公共域名查询，代价是炼金术士的研究在代理环境下也会被拒；（c）保持两套，在代码和 `docs/SSOT-MATRIX.md` 里写明为什么 | （a）：「怎样连 AnySearch」只应有一个负责的地方；你已定过代理的假地址模式按正常环境处理（9 月 22 日的代理实操、9 月 27 日生成插件的出站），（b）会让炼金术士在这类环境里也失效 | [AI 清单](ai-entry-inventory.md) §7 第 12 项、§3.7 的 SE-1 与 SE-4、§3.10 第 3a 与 3b 类；代码 `alchemist-search.ts:22`、`feed-source-service.ts:31`、`feed-source-runtime.ts:37`；两种情况的行为差别由 §8 的探针证明（没有真联网）。Jelly 读网页另有第三份同类重复，不在本项里，等本项定了方向再排；**用户 10-09：用户答「哪套好用哪套」：在代理假地址环境下只有炼金术士那套能用，所以 Feed 改用炼金术士那套（等于选项 a），实现时两套各测一次确认**（2026-10-21：Alchemist 不迁，防腐收尾后删除；Feed 若届时已改用这套，删除那一片先把它挪成平台自己的搜索代码，见 BL-376） |

**不需要新决定的**：E-1（删除项目不清 Sessions 记录）——2026-10-07 已定「各主人一起删、可重试」，这是它漏掉的一个主人，按 W2-07 收尾做；修好后真实 Home 里以前删项目留下的 Sessions 记录（若有）按 10-08 已定的做法在下一次维护里先列后删，本片没有读真实 Home，不知道有没有。E-3 至 E-8、E-10、E-11、E-14、V-3 至 V-5、AI 清单 §7 第 3、4、6、9 项是清理与文字修正，没有产品语义的选择；会改合同文字或输出合同的（E-8 去掉 `pages.ai` 的 `stub`、E-11 删 `shelf.jobs.run`、AI 清单 §7 第 4 项的标题与描述）要刷新 API 与动作合同快照，PR 里写给调用方。

### W5-10 巨大单元登记评审收口（2026-10-25，FIX1；基于已合入的 #1289）

目标是让已采用的「合理巨大单元标明即可」可审阅、可验证；完成程度为门禁功能与定向工程验证。范围只含健康门禁的登记展示、类大小校验、同名函数测量缺口及直接回归、本 spec、AGENTS 与巨大单元清单。登记的准入方向、阈值、CI、CODEOWNERS、产品代码和其他门禁不变，不新增文档表格门禁。

- `W5-10-GUR-01`：带 `--base` 时从真实 merge-base 的登记表比较本次登记，明确列出新增条目、`size` 变更、单元键和前后大小；其他门禁失败或 `--update` 拒绝时仍可见。文本报告同样展示；JSON 报告保持可解析并包含同一差异。基准分支分叉后的新登记不能冒充 merge-base 的旧登记。
- `W5-10-GUR-02`：类的登记 `size` 只接受包含且仅包含 `lines`、`methods` 的非数组对象，两值与实测严格相等。多字段、缺字段、数组、字符串数字等形状均拒绝；有效类/文件/函数登记、陈旧条目与原型属性键的既有行为保持。
- `W5-10-GUR-03`：以基点 `54437998` 的实际登记为准（3 个文件：动量样式、基础控件样式、连接器声明），校正清单 §2/§3、§4.5 和 AGENTS 的现行表述；旧分类总数明确是历史快照，不靠改数字制造实时完整盘点。以后改登记或判定时人工同步相应文档，不加机器强制表格门禁。
- `W5-10-GUR-04`：同文件同名函数的较小实现增长由实际生产测量链在真 Git 快照中复现并拒绝。按统筹裁决 B，仅对同名具名实现组用具名词法 owner 区分，唯一名称保持现有键，重载签名不算第二个实现；无法用具名 owner 唯一区分的多个实现明确拒绝，不用行号、序号或默默取最大值。未改组合通过，只在上方插行不改变身份；新增第二个同名实现使 flat 键改为 owner 键时保守报新单元，不加别名自动放行，合理的单元仍可各自标明。基点盘点无涉及巨大函数的同名组，三条登记都是文件，不迁移现有巨大键或登记。

验证用 `tests/health-gates-merge-base.test.ts` 的真临时 Git 仓库调用生产 CLI，断言返回码和具体输出；保留未登记/无效登记拒绝及有效登记正例。脚本修改后经机器构建槽完成整体 `pnpm build`，再跑相关健康门禁回归、实际 merge-base health、boundary 与 fresh-fetch secrets；不运行本机全量或浏览器。第 4 项的生产复现原始记录留在会话临时目录，最终按实际结果注明完成或待裁决。

本片工程证据（2026-10-25）：吸收既有候选 `a34d706235` 的第 2–4 项，撤回同义重复改法；第 1、5 项与补充回归由 FIX1 收口。整体构建、实际 merge-base `54437998` 健康门禁（含 API）及 boundary 通过，构建指纹与现行源码一致。5 个定向文件 288 条通过，其中 merge-base 68、结构 86、API 38、lint 69、源码计数 27；初轮暴露的基点登记 JSON 漏读和函数夹具陈旧登记已修，失败原始日志保留，不计作通过证据。`W5-10-GUR-01/02/04` 经真 Git 与生产 CLI 验证；`W5-10-GUR-03` 人工对照三条实际登记、两处 AGENTS、清单与 §4.5。生产测量的 head/base 同为 80 个巨大单元，键与大小完全相同，三条登记大小不变；同一 Big/Small Git 快照从旧 CLI 放行变为准确拒绝 `Small.handle 12 → 13`。未运行本机全量或浏览器；独立 REVIEW/TEST、唯一 Claude 承载与 main 采用另结算，不代表 W5/W6 整线完成。

### 1.1 剩余风险登记（2026-10-23）

复审报告（2026-10-20～23 合入 PR 的复审；报告文件不入库，由合并 Agent 会话持有）§2.8 与 §8 第 6 条要求：#1018 的 Todo 宿主私路至少在这里登记剩余风险。本节是登记，不是清理完成。

- **来源**：#1018（`f562ed466`，隔离插件页面并修复系统评审中的生命周期与权限问题）；报告 §2.8「隔离页新增 Todo 宿主私路」一行。
- **现在的代码**
  - `apps/local-host/src/plugin-page-authority.ts:145`：情境页（带 `x-molis-context-page`、不带 `x-molis-plugin-page`）的 POST 白名单里硬编码了 `/api/plugins/io.molis.work.todo/items`；
  - `apps/local-host/src/plugin-page-todo.ts`：只放行 `io.molis.work.todo` 的 `items` 操作，把情境页选中的来源映射成待办的 `title`、`sources`、`placement` 与幂等 `request_id`；唯一调用点在 `apps/local-host/src/home-plugin-http.ts`；
  - `scripts/gates/assembly.mjs:92`：`hostPluginFiles` 指标只按 `-actions.ts` / `-native-plugin-http.ts` 后缀认出「以插件命名的宿主文件」，`plugin-page-todo.ts` 识别不到、不进该指标记录。`scripts/check-health-gates.mjs` 的 `--base` 用同一份 `measureAll` 测量工作树和 merge-base；两边已有且同样命中新规则的文件会共同计入，不会仅因扩充扫描口径就自动成为新增违规。改门禁仍须按仓库规则取得授权，本片只登记，不改正则或指标（口径见 `tooling/gates/README.md`）。
- **为什么本片只登记**：[context program](../context-program/spec.md) 开头的「交接（2026-10-20）」已说明 W0～W3 合入 main；W1-5 已有内核派生实现（`47c00b44`，`packages/kernel/src/contextual/destinations.ts`），不是尚待新建的平台能力。该 spec §18.7 已修正旧计划：去处走 `/draft`，落点版本冻结与执行前核对归 W3 的 `attach`。后续应按现行情境合同核对并迁移仍存的 Todo 专用入口与适配；是否还需改合同，由核对出的实际差距确定，不能预设为清理前置。本片保持复审报告 P3 的登记范围，不实施迁移。
- **归属与跟踪**：后续清理沿用 ② 的 context program W1-5 跟踪归属，按当前交接接续；BACKLOG 的 BL-568 跟踪这一条（随 #1114 登记；该 PR 未合入前以本节为准）。完成须同时覆盖情境页的 Todo POST 白名单、`plugin-page-todo.ts` 专用适配及其调用，验证该路径已由通用合同承接后再更新本节；单独删文件不代表清理闭环，也不会消除扫描正则的通用识别盲区。`privileges.md` 的 PG 行由统筹在合入后补，本节不重复维护那份清单。
- **同报告的另一条**：#1018 的「隔离页 link 通道」（合成 click 可导航宿主设置页）已由合并 Agent 派出的 plugin-frame-fixes 认领修复，不在此登记。

## 2. 现状度量（§3）

开工时的数字（2026-10-02，main fccb2a30）。口径：源码是 git 跟踪的 `.ts/.mts`，排除 `tests/`、`specs/`、`docs/`、`dist/` 与 `.d.ts`；类和函数用 TypeScript 语法树量起止行。模板字符串里的浏览器脚本不按函数计，只算在文件行数里。

### 2.1 改动成本

- 09-28 起合入 main 的 PR：71 个。每个 PR 改动的文件数：中位数 6，p90 98，最大 615；改动的包数（`plugins/<区>/<包>` 与其他区的 `<区>/<包>`）：中位数 1，p90 11，最大 37。
- 新增一个内置插件的实际改动面（以 Todo 为例），插件包外有 15 个文件直接接线：
  - 宿主：`todo-actions.ts`、`todo-native-plugin-http.ts`、`project-host.ts`（`registerProvider`）、`web-request.ts`、`web-catalog.ts`、`context-onboarding-service.ts`、`package.json`；
  - 工作台：`builtin-plugins.ts`、`ui-composition.ts`、`i18n/en.ts`、`scripts/client/initialization.ts`、`package.json`；
  - 合同：`contracts/src/modules/todo.ts`；
  - 根：`package.json`、`scripts/workspace-packages.mjs`。

  目标：只改插件自己的包和声明。

### 2.2 冲突热点

自 09-28 起被最多 PR 改过的源码文件（按合入 main 的 70 个合并提交统计）：

| PR 数 | 文件 | 类型 |
| --- | --- | --- |
| 15 | `apps/workbench/src/scripts/client/assistant-island.ts` | 巨大文件 |
| 14 | `horizontal/agent-host/src/adapters/prologue-node.ts` | 巨大文件 |
| 12 | `packages/design-system/src/styles/craft-finish.ts` | 总样式 |
| 12 | `apps/workbench/src/i18n/en.ts` | 总词典 |
| 12 | `apps/local-host/src/web-request.ts` | 路由分发 |
| 11 | `packages/contracts/src/platform/actions.ts` | 公共合同 |
| 11 | `apps/workbench/src/scripts/client/initialization.ts` | 页面初始化 |
| 11 | `apps/workbench/src/immersive-shell.ts` | 外壳 |
| 11 | `apps/local-host/src/assistant/assistant-service.ts` | 巨大文件 |
| 10 | `plugins/native/pages/src/actions.ts`、`contracts/src/services/assistant.ts`、`contracts/src/services/agent-host.ts`、`agent-host/src/adapters/announce-guard.ts` | 合同、插件 |
| 9 | `apps/workbench/src/scripts/client/tab-workspace.ts`、`apps/local-host/src/web-catalog.ts` | 外壳、路由 |
| 8 | `scripts/workspace-packages.mjs`、`plugins/native/pages/src/client.ts`、`apps/workbench/src/page-assets.ts` | 登记、聚合 |

### 2.3 巨大单元

阈值按 §4.5：文件超过 800 行，类超过 300 行或超过 25 个方法，函数超过 150 行。

| 度量 | 编写时（74776928） | 开工时 |
| --- | --- | --- |
| 超过 800 行的源文件 | — | 37 |
| 超过 1000 行的源文件 | 24 | 25 |
| 超过 300 行的类 | 42 | 43 |
| 方法超过 25 个的类 | 25 | 25 |
| 超过 150 行的函数 | — | 99 |
| 超过 300 行的函数 | 22 | 22 |

排在前面的：

- **文件**：`pages/editor-browser.ts` 4,043 行，`workbench/i18n/en.ts` 3,661，`assistant-island.ts` 2,813，`assistant-service.ts` 2,700，`craft-finish.ts` 2,245，`pages/commands.ts` 2,241，`tab-workspace.ts` 2,050。
- **类**：`AssistantService` 2,131 行、121 个方法；`MemoryService` 1,170 行、59 个方法；`ShelfStore` 748 行、35 个方法。
- **函数**：`initializePrologueNodeAdapter` 1,436 行，`codingRouteBindings` 1,365，Pages 编辑器 `mount` 1,024，`startIm` 957。

### 2.4 边界穿透

| 度量 | 编写时 | 开工时 |
| --- | --- | --- |
| 测试直接引用包内部源码（`../<区>/*/src/`） | 942 处 | 959 处，另有 34 处引用 `dist/`；涉及 336 个测试文件 |
| 宿主入口导出 | 136 行，12 个 `export *` | 不变（`apps/local-host/src/index.ts` 222 行） |
| contracts 导出的运行时函数、类与常量 | 157 | 503（口径更宽：含 Schema 常量） |
| 只有占位描述的 contracts subpath | 6 | 6，见 §3 R-11 |
| 跨层依赖 | — | `boundary:check` 通过，兼容白名单 0 条；它守的是声明过的规则。按 `docs/system/PACKAGE-BOUNDARIES.md` 的层次重新数「向上」与「同层插件互引」，在分层一片里做 |

## 3. 体检报告附录 A 复核

状态：2026-10-08 逐项重新量过，§4.9 闭环完成（W1-01）。数字与行号量于 main `ba223d95`：首轮量于 `33067cbe`，#314–#322 合入后整张表又对着 `ba223d95` 复核了一遍，变了的都已改；之后的 #323（`1cdb31dd`）只改文档与 spec，数字不受影响；W2-01 合入后 R-11 一行与 §3.5 的计数改过（见 §3.5）。附录 A 的每一项（含皮肤、Goals UI、Server 与 C 组）、体检报告 §5 的 6 步、§7.5 的 5 条、第一步交接清单（[post-merge-review §12](../archive/post-merge-review/spec.md#12-交给第二步的清单)）的每一项，都有结论、证据和归属。

**读法**：

- 结论分四档：**已修复**（附证据）、**部分**（做了什么、还缺什么）、**仍然成立**（附方案与顺序）、**不再成立**（附依据）。
- 标签：[已确认] 是这次在 `ba223d95` 上跑命令量到的；[引用] 是引用 [roadmap](roadmap-2026-10-07.md) 或本 spec 里带日期的记录、这次没有重跑；[未验证] 没有量。
- 归属写 roadmap 路线表的切片编号（`W<波>-<序>`，表在 [roadmap-2026-10-07.md](roadmap-2026-10-07.md) 开头）；「决定 #n」是 §10 的 27 项用户决定；`BL-nnn` 是 [BACKLOG](../BACKLOG.md) 的条目。路线表里没有对应切片的，写「补记」并指定到最近的一片，这些也列在本节末尾。
- 数字口径：`git grep` 只扫 `apps`、`packages`、`plugins`、`horizontal`、`modules` 五个目录（另有说明的除外）；源码行数同 §5.1（按换行切开的段数）；空 catch、`as unknown as`、Error 子类、`escapeHtml` 与 `readBody` 的定义用 TypeScript AST 数。量度脚本是一次性的、没有入库，其中几项由 W1-04、W1-09 的门禁固化。
- 与 roadmap 不一致处，以这里为准：#293（健康门禁）、#294（密钥扫描）、#295–#298（文档对齐）和 #314–#322（并行开发与合同变更流程、术语表、C 端方案、扩展点、依赖与 SDK 方案、调用链、巨大单元清单、版本与发布策略、包清单）在 roadmap 写完之后合入，已改变若干行的现状。

### 3.1 附录 A 逐项闭环

以下逐项正文保留 `ba223d95` 时的现场与后续补记，不是当前状态表；2026-10-12 按现行源码的裁决统一见 §12.2。历史的「没有门禁」「CI 不跑产品」「尚未实现」若与后续相冲突，以 §12 的带基线结论为准。

| 编号 | 结论 | 证据（`ba223d95`） | 归属 |
| --- | --- | --- | --- |
| R-01 | 仍然成立 [已确认] | `tests/builtin-plugin-assembly-gate.test.ts` 冻结 19 个构建期插件（`BUILD_TIME_ASSEMBLED`，含 todo）、7 个经 Runtime（`RUNTIME_ASSEMBLED`）；`apps/local-host/src/*-native-plugin-http.ts` 18 个；`project-host.ts` 26 处 `registerProvider`；`apps/workbench/src/builtin-plugins.ts` 的 `BUILTIN_PLUGIN_CATALOG`（`:64` 到 `:382`）26 个目录条目（19 个构建期加 7 个经 Runtime）、33 条 import。新插件只走 Runtime 的规则已写进 AGENTS.md:31 与 `skills/molis-plugin-dev/host.md`（#298）；今天新增一个内置插件要改哪些地方逐项列在 `docs/system/EXTENSION-POINTS.md` 3.1，迁移计划在 `docs/system/RUNTIME-MIGRATION.md`（#317） | §4.6：W1-05（装配门禁加严）、W4-04（Form 样板）、W5-01、W5-02、W6-01；host.md 与 AGENTS.md 对目录条目的说法已在 W5-02 PR-1a 统一（目录条目 = 各包的 `registration`，`builtin-plugins.ts` 由生成器写）。决定 #9：Goals、Artifacts、Sessions、插件创作台是批准的构建期例外，其余 15 个逐族迁移；决定 #10：Form 先、Todo 第二 |
| R-02 | 已修复 [已确认] | #269（`aab032d0`）删除 `apps/local-host/src/mcp-native-plugins.ts`、`apps/mcp/src/goal-action-aliases.ts`，并改了 `skills/goal-advance`；`legacyMcp`、`LEGACY_FUNCTIONS_MCP`、`LEGACY_GOALS_MCP` 在五个目录里 0 处。现存的 `molis_work_v1_*` 是现行工具命名空间，不是别名。同一条线的剩余入口见 §3.4 的 BL-081 | — |
| R-03 | 仍然成立 [已确认] | `apps/local-host/src` 369 个 `.ts` 文件、41,807 行（10-03 为 369 个、42,787 行；两次口径不同，只作量级对照）；36 个 `*-actions.ts`；18 个 `*-native-plugin-http.ts`；6 个按插件写的 AI 适配文件（`alchemist-prologue`、`cognia-prologue`、`experiments-grok`、`jelly-model`、`shelf-ai`、`typesafe-prologue`；2026-10-10 删实验插件后 `experiments-grok` 已不在，余 5 个） | §4.3/§4.6：W3-06（插件的平台服务）、W5-01、W5-11（宿主瘦身；决定 #7：宿主设置的写入留作管理接口并登记例外） |
| R-04 | 已修复 [已确认] | 代码与测试里 `personal-assistant` 0 处；原来只剩 `scripts/personal-assistant-public-sources.mts`（引用已归档的路径，没有人引用它），W1-23 已删（2026-10-08；W2-02 核对：`git ls-files scripts` 里已没有） | — |
| R-05 | 已修复，余小项 [已确认] | 只剩 `README.md` 与 `README.zh.md`；两份 :190 已写成现行事实（项目库只有一份现行结构、版本不符拒绝，旧 Claim/Run/Evidence/Review 历史、V3 导入与旧库升级已删）；`PRODUCT.md` 已没有 Claim/Run 门禁段；`docs/SSOT-MATRIX.md:104` 记明 `modules/execution`、`modules/evidence-verification` 已删（#268），:76 已有 `packages/plugin-sandbox` 行（均为 #295–#298）。余：两份 README :196 的链接标题仍写「迁移归属」；SSOT 没有系统助理的行。`SSOT-MATRIX.md:65` 的「63 个 public subpath（外加根入口）」与 `packages/contracts/package.json` 的 64 项 `exports`（含根）一致，不用改 | W1-02 收尾 |
| R-06 | 部分 [已确认/引用] | 第一步关闭了当时的失败；`tests/todo-plugin.test.ts`、`tests/pages-plugin.test.ts` 在隔离 Home 里 132/132 通过 [引用 roadmap §4.9，10-08]，所以「这两个早已红」的旧说法已过时。最近一次记录的全量是 batch Q（#287）：3,678 个用例，3,670 通过、7 跳过、1 失败（已修，见 §4.1 表）。仍缺：固定位置记录 main 的最新全量数字（`specs/README.md` 没有，`docs/system/PARALLEL-DEVELOPMENT.md`（#314）也没有定义）；CI（`.github/workflows/ci.yml`）不跑产品用例；没有偶发失败的隔离名单 | W1-11（Linux 探针）、W2-16（产品子集与 `tests/quarantine.json`）、W6-05（最终回归记在固定位置）。决定 #14：先不挡合并，约两周后并入 Verify |
| R-07 | 仍然成立 [已确认] | 工作台客户端脚本 33 个、14,424 行（`apps/workbench/src/scripts/client/`）；插件 `plugins/native/*/src/client*.ts` 25 个、12,827 行（再加子目录里的 `work/src/terminal/client.ts`、`alchemist/src/work-reuse/client.ts` 是 27 个、13,330 行）；133 个 `*_SCRIPT` 模板字符串常量散在 125 个文件里，覆盖 22 个原生插件；esbuild 只用在 Pages 的构建（`plugins/native/pages/package.json`）、根 `package.json` 的 `build:pty-client`、`scripts/preview-contextual-interaction.mts`、`apps/local-host/src/native-plugin-release-artifact.ts` 与创作台的 `build-checks.ts`。空 catch：AST 只在已解析的代码里看到 4 个，另有 121 个只带注释的 catch，其余在模板字符串脚本里 [引用 roadmap：约 137 个在模板字符串里] | §4.8：W4-04（Form 样板：打包加类型检查）、W5-04（逐插件推广）、W1-09（lint 规则）、W5-13（吞掉的错误） |
| R-08 | 仍然成立 [已确认] | Error 子类约 110 个（AST）；两套基类 `ActionError`（`packages/contracts/src/platform/actions.ts:464`）与 `MolisWorkV1Error`（`.../platform/errors.ts:2`）；`escapeHtml` 11 处函数定义，其中 10 份是各文件自带的（`apps/workbench/src` 的 `renderer.ts`、`document-shell.ts` 与 Feed/Inbox/Schedule 三个 `*-projection-ui.ts`，`apps/desktop/src/capsule-shell.ts`，Pages 编辑器，Work 的 3 处），1 份是 `packages/design-system/src/primitives/html.ts` 的公共版；`readBody` 5 份，全在 `*-native-plugin-http.ts`（experiments、feed、images、inbox、schedule） | §4.2/§4.8：W3-02（一套错误模型）、W3-10（浏览器请求助手）、W5-13 |
| R-09 | 部分 [已确认] | 每个库一份基线建库、带版本、版本不符拒绝（`packages/storage/src/sqlite-baseline.ts:31`，§4.1）；`docs/system/HOME-DATA.md`（#295）列了 Home 里 SQLite 文件的 owner、版本、备份类别与卸载覆盖（起草时 29 种，2026-10-10 删实验插件后是 28 种），并记了真实 Home 的孤儿。原来有 2 个库没有版本（`plugins/experiments/private.sqlite`、`alchemist/projects/<id>/search.sqlite`），W2-05（#346）都加了版本 1，Experiments 库在维护五（2026-10-09）盖过章，2026-10-10 随实验插件删除，真实 Home 里剩下的 `plugins/experiments/` 由维护六移出；炼金术士搜索库现在是版本 1。仍缺：产品里的备份命令、在线备份或统一快照、检查「每个库都登记并有版本」的门禁。现有的只有离线备份说明（`docs/installation.md`「离线备份与恢复边界」）与 `tests/home-backup-recovery.test.ts` | 决定 #20（离线快照命令，清除覆盖所有登记的库，定时在线备份留给 C 端计划）、决定 #21：W2-05（给两个库加版本）、W4-11（统一登记）、W5-16（快照命令）；BL-115 |
| R-10 | 已修复 [已确认] | `specs/` 根目录 12 个 spec 目录（外加 `archive/`），都有「状态：」句，由 `scripts/check-health-gates.mjs` 的 spec 状态句检查强制（#179，CI 里跑）；`specs/README.md` 已列 `coding-quality-assurance`、`risk-plugin`。余：索引与分类没有门禁 | W1-06 |
| R-11 | 已修复（W2-01，2026-10-08）：6 个占位已删除，下面 ①～④ 的普查数字是删除前的证据；原 §3 行的三个待查已有结论：`platform/kernel`、`platform/testing` 保留，`platform/plugin-builder` 不是占位；`contract-only` 这个标记不等于占位 [已确认] | `packages/contracts/package.json` 的 `exports` 共 64 项（根入口加 63 个 subpath），没有门禁。下面的导入者数是仓内用 `import … from`、`import()`、`require()` 引用该 subpath 的文件数（不含 `packages/contracts` 自身、`docs`、`specs`），只作字符串出现的另说。① **6 个占位，0 个使用者**：`./modules/actions`、`./modules/automation`、`./modules/identity-team-access`、`./modules/sync-replication`、`./platform/exchange`、`./platform/observability`。每个 10 行，只有一个 `maturity: "contract-only"` 的描述符，没有任何字符串引用，也没有包把它们声明为合同入口，对应的包不存在。② **`./platform/kernel` 与 `./platform/testing` 保留，不并入这 6 个**：`packages/contracts/src/platform/kernel.ts`（9 行，`maturity: "partial"`）和 `testing.ts`（10 行，`contract-only`）同样只有描述符，没有任何代码从这两个 subpath 导入类型或值。引用它们的只有字符串，而且是对应的包存在、并把它们当作自己声明的合同入口：`packages/kernel/package.json:36`、`packages/test-kit/package.json:35`、`packages/kernel/src/index.ts:18`、`packages/test-kit/src/index.ts:20`、两个包的 README、`scripts/workspace-packages.mjs:43`、`:49`（`workspace:check` 在 `:172` 逐包比对 `molis-work.contract` 与这里的字符串），另有 `packages/test-kit/tests/boundaries.test.mjs:418` 把 kernel 的这一项当作边界检查的样例。kernel 真正用的合同在 `platform/actions`、`platform/app-host`、`platform/execution-lifetime`（`packages/kernel/src/index.ts:4-6`）。要不要把这两个包的声明入口改指真实 subpath、再删这两个描述符，是另一件事（要改两个包的元数据、README、`scripts/workspace-packages.mjs` 与一个测试），§10 的 27 项决定没有涉及，也不在 W2-01 的范围里：这两个描述符保留。③ **`./platform/plugin-builder` 不是占位，关闭**：`packages/contracts/src/platform/plugin-builder.ts`（12 行）是真实类型（`BuildManifest`、`BuildDependency`、`BuildDependencyLock`、`BuildGateId`、`BuildGate`、`BuildCheckResult`），有 3 个导入者：`apps/local-host/src/plugin-builder/build-types.ts:4-5`、`plugins/native/plugin-builder/src/agent-model.ts:3`、`plugins/native/plugin-builder/src/agent-workflow.ts:6`。原行写的「没有 subpath 使用者」已不成立。④ **`maturity: "contract-only"` 共 12 项，占位只是其中 6 项**：另 6 项是根入口（不是 subpath）和五个在用的合同入口，各被一个现存的包声明为自己的 `molis-work.contract`（`scripts/workspace-packages.mjs:42`、`:46`、`:49`、`:65`、`:107`）：`./platform/package`（30 行，`packages/contracts` 声明，代码导入者 0）、`./platform/storage`（20 行，除描述符外还有 `StoredModuleEvent` 接口，`packages/storage` 声明，导入者 0）、`./platform/testing`（即上面的 ②，`packages/test-kit` 声明，导入者 0）、`./platform/tooling`（34 行，`tooling/plugin-cli` 声明，导入者 4：`apps/local-host/src/local-plugin-development.ts`、`plugin-development.ts`、`project-capabilities.ts` 与 `tooling/plugin-cli/src/cli.ts`）、`./services/agent-host`（1,733 行，`horizontal/agent-host` 声明，导入者 128）。把 `package.json`、`scripts/workspace-packages.mjs` 里的字符串引用也算上，`platform/package`、`storage`、`tooling`、`services/agent-host` 分别是 1、3、7、130 个文件。另有 `./platform/plugin-wiring`（378 行，`maturity: "partial"`）没有包外的导入者，但被 `platform/plugin.ts` 与 `plugin-manifest.ts` 在包内引用，也不是占位 | ①：W2-01 已做（2026-10-08）：删了 6 个源文件、`packages/contracts/package.json` 里的 6 项 `exports`（64 项变 58 项，subpath 57 个）与 6 份 API 快照，没有任何 import 要改；W1-06 的对应规则随之改成没有基线、出现一个占位 subpath 就失败（`scripts/gates/contract-placeholders.mjs`），`baseline.json` 里的 `contractPlaceholders` 两项去掉。②：W2-01 不动 kernel、testing。④：W1-06 的规则要按「只有描述符、没有导入者、也没有现存包把它声明为 `molis-work.contract`」来写，不能按 `maturity` 字段读成「所有 contract-only 的 subpath」，也不能只看「没有导入者」，否则会误伤 `platform/package`、`storage`、`testing`、`tooling`、`services/agent-host` 和 `plugin-wiring`（见 §3.5 补记）。③：— |
| R-12 | 部分 [已确认] | AST 数：`as unknown as` 源码 112 处、测试 88 处，共 200（10-03 为 236，体检报告时 138）；main 上没有计数门禁；`chore/health-gates-lint-api`（`474ee1ab`，仅在本地）加了计数，与 #293 改的是同一个文件，要变基 | W1-04（变基并统一口径）、W1-09（lint 规则取代计数） |
| R-13 | 部分 [已确认] | 主检出在 `d81b12cb`（落后 origin/main 197 个提交），带着另一会话留下的 32 项未提交改动；救援分支 `wip/main-checkout-rescue-2026-10-01`、`wip/main-checkout-2026-10-07` 还在；这次 4207、4208、4173 都没有在监听 | 用户 10-07 的决定（改动放回为未提交）与决定 #24：W1-23（清单与本地清理）；主检出由用户处理 |
| R-14 | 仍然成立 [已确认] | `git ls-files .impeccable` 1,085 个文件、约 111 MiB（`git ls-tree -r -l HEAD -- .impeccable` 求和 111.3 MiB）；`.gitignore` 只忽略 `.impeccable/qa/`、`config.local.json`、`questions/` | 决定 #22（只留现行 spec、文档或测试引用的评审组与设计参考，其余从树里删、不改历史，门禁只许减少）：W1-23、W1-06（数量门禁） |
| 皮肤 | 仍然成立 [已确认] | `packages/design-system/src/visual-foundation.ts` 按顺序拼接 14 个样式模块，含 `momentum` 1,170 行、`quiet-paper` 382、`calm-desktop` 1,391、`personal-shell` 373、`personal-workbench-v2` 393、`-v3` 1,421；`styles/` 共 17 个文件、11,885 行（报告时 11,338）；`craft-finish.ts` 2,312 行 | 决定 #17（自动比对像素、超阈值给用户看；页面体积先冻结）：W1-07（体积门禁）、W4-12（视觉比对）、W5-05（逐个删除） |
| Goals UI | 部分，已不完全成立 [已确认] | `apps/workbench/src/goals-*.ts` 16 个、573 行：15 个是 5–59 行的挂载转接层，已不含 Goals 业务界面；`goals-page-renderer.ts`（335 行）是工作台外壳的页面渲染器，名字起错了，留在工作台改名 | §4.3/§4.6：W5-06（通用贡献挂载器取代 15 个转接层，并改名） |
| Server | 已不按原样成立 [已确认] | `server/` 与 `packages/im-ui` 支撑侧栏「项目讨论」页签（`apps/workbench/src/side-panel.ts` 的 `data-side-body="discussion"`；`apps/local-host/src/im-server.ts:3-4` 引入二者）；`apps/server`（5 个文件）这个独立启动器仍没有产品入口，只有 `tests/cross-device-*.test.ts` 在用；SSOT 标「实验性」（`docs/SSOT-MATRIX.md:57`）；`server/server.sqlite` 已登记进 `docs/system/HOME-DATA.md` | 决定 #4（保留并继续迭代，不冻结；只修账目：备份表、宿主不再直接读它的表、包归类）：「宿主不再直接读它的表」已由 W2-06 做完（`im-server.ts` 与 `apps/server/src/main.ts` 改走 `Identity`、`ContinuityService` 的方法），其余 W2-12 |
| N-01 | 已修复 [已确认] | 标题栏只剩底栏铃铛 `data-assistant-attention`（#140，`597d15d2`）；`data-plugin-notifications`、「通知，暂不可用」「通知功能即将开放」在源码里 0 处，只在两处断言里作为「不应出现」被检查（`tests/plugin-notification-bell.test.ts:17`、`tests/plugin-event-recovery.e2e.test.ts:22`） | — |
| N-02 | 已修复 [已确认] | `vendor/prologue-sdk/` 只剩 1 份 tgz（`prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz`，#170 删旧包）；`tooling/gates/limits.json` 的 `vendoredPrologueSdk` 上限 2，由 `pnpm health:check` 守，CI 里跑 | 来源与补丁见 N-14 |
| N-03 | 已按决定收口为文档分类，代码不搬 [已确认] | 决定 #2：架构里加一类「平台产品服务」。已写进 `docs/system/ARCHITECTURE.md`「平台产品服务」小节与 `docs/SSOT-MATRIX.md` §6（#296）；代码未动：`horizontal/memory/src/service.ts` 1,337 行（写入门、自动写入、插件写入审批）、`horizontal/placement/src/index.ts` 479 行。记忆与放置两页已补（`docs/horizontal/memory.md`、`placement.md`，#319）。余：边界规则入门禁 | W1-05（边界规则）、W4-08（按决定改为文档与边界规则，不搬代码） |
| N-04 | 部分 [已确认] | 复核已做（#319，W1-14）：`specs/action-architecture/spec.md` 在 §3 末尾（`:330` 起）新增「基本合同复核」，把基本合同拆成八条可核对的条款（C1–C8），对情境片段推荐、对象、情境判断与布局、撤销、后台任务回报、到期提醒、效果、作者八类合同逐条核对，列出缺口 G1–G9；原来 §3「架构中的职责」（`:174–329`）对这些条款逐词 0 处的情况由这一节补上。余：G4 已按 N-03 收口（W3-04 第一个 PR）：`packages/kernel/src/contextual.ts`（340 行，候选排序与判断选择）是放在内核里的平台产品服务，代码不搬；内核 README 写清两半，`pnpm health:check` 新增没有基线的规则 K1–K5（`scripts/gates/kernel-contextual.mjs`：核心不依赖情境排序、只有它读合同的 `services/contextual`、它只读两份合同与 `node:crypto`、它无副作用无可变状态、从目录派生的代码不点名能力）。`subject-offer-choices.ts`（59 行）改判为核心：`ActionService.discoverScenes` 用它判断判断规则引用的选项是否还在，它只从目录派生，没有启发式，原来把它也算作产品策略的说法已改正。第二个 PR 给情境排序自己的子入口 `@molis-ai/molis-work-kernel/contextual`，包入口不再转出它（加载核心的导入闭包里没有情境排序，K1 的入口允许名单清空），并补上安全不变量 S-13 在情境判断上的缺口（对象种类与目标状态折成一行，加测试与文档）；题面进「设置 › 提示词」在第三、四个 PR 也做了（选区推荐的两道题 `system:contextual`；创作台挑零件的两句，在创作台名下）；这一片的路线表条目到此做完，N-04 仍是「部分」，因为 G2、G6、G9 在别的切片 | §4.2/§4.10，缺口去向见该节：G1、G5 W2-03；G2、G6 W3-05；G7 与 W1-12 一起补；G9 W3-01（合同有变，先问用户）；G4 W3-04（第一个 PR 已做，余下见上）；G3、G8 没有对应切片，见 §3.5 补记；BL-120（内核里的情境策略）随 W3-04 做完已删 |
| N-05 | 部分 [已确认] | 用户可见的部分已修（#141，只在设置里）；代码身份仍是 Runtime 插件加一条 `personal: true` 的目录条目（`apps/workbench/src/builtin-plugins.ts:243`；`RUNTIME_ASSEMBLED` 里有 characters）；`docs/SSOT-MATRIX.md:99`、`:131` 还写「产品接入中」 | 决定 #26：并进宿主，界面仍是设置里的一节，安装记录与 Runtime 条目一起删。路线表没有单独切片，W5-01 里 Characters 一项按此改写（见本节末的补记） |
| N-06 | 仍然成立，略有改善 [已确认] | `.github/workflows/ci.yml` 现在跑：`pnpm workspace:verify`、健康门禁对照合并基点（#293）及其自测（连同包清单门禁用例，#322）、版本核对 `verify-release-versions` 及其用例（#321）、Goal 边界/存储/发布用例、`tsc` 启动器、`pnpm test:contracts`、整页门禁、成果类型与声明门禁、密钥扫描规则用例与 Secret scan 作业（#294）、炼金术士用例；pnpm 的版本读根 `package.json` 的 `packageManager`（#318）；不跑产品用例；PR 模板写的是全量在本机跑 | W1-11（非阻塞探针）、W2-16（产品子集与隔离名单）；决定 #14 |
| N-07 | 部分 [已确认] | `git worktree list` 写作时 62 条（含并行工作流刚建的）；远端 184 个分支里 179 个已合入 origin/main；仓库设置 `delete_branch_on_merge` 仍为 false | 决定 #24：本会话清已合并且干净的本地工作树与分支，wip 与整合分支逐个对比后再删；已合并的远端分支与「合并后自动删除分支」由用户做；救援分支与 Codex d62d 不动。W1-23 |
| N-08 | 部分 [已确认] | 健康门禁量出 164 个巨大单元，逐单元只许减少；#293 起类的行数与方法数分开记，阈值在 `tooling/gates/limits.json`（文件 800 行、类 300 行或 25 个方法、函数 150 行），与合并基点比对；`LEGACY_HUGE_FILE_LINE_LIMIT` 已不存在。W1-19 已做（#320）：`docs/system/HUGE-CLASS-MIGRATION.md` 重写为现行清单（164 个单元分布在 38 个包的 130 个文件里，每个单元有判定：拆、归线或例外，没有「待排期」），2026-09 的迁移记录移入 `docs/archive/huge-class-migration-2026-09.md`；当时 `tooling/gates/giant-exceptions.json` 登记 4 个必然很长的单元。2026-10-25 核对 `54437998` 为 3 个现存文件条目，Coding 样式已不在登记表；现行规则按 §1 当天决定：有效登记与实测相等即放行，未登记的仍不许新增或变大。其余拆分按 W5-10 继续 | 拆分：W4-05、W5-09、W5-10（W4-06、W4-07 已做） |
| N-09 | 部分 [已确认] | W1-13 已做（#314）：`docs/system/PARALLEL-DEVELOPMENT.md`（枢纽文件、排时段、集成分支跑全量、基线比对、Agent 锁、清理、PR 体量）、`docs/system/CONTRACT-CHANGES.md`、`.github/CODEOWNERS`（默认 `* @yijunw0212`，另有 6 个包目录加 @jingxusandra-gif，门禁、`tooling/gates/` 与工作流只请求 @yijunw0212）和 SSOT 各表的「归属」列，后两者由 `scripts/package-owners.mjs` 的规则生成、`pnpm boundary:check` 校验；AGENTS.md「先读哪里」新增了术语表、并行开发、合同变更、归属与发版几行，「协作」现有 4 条（`:49–52`）。余：CODEOWNERS 只请求评审、不改分支保护（决定 #13），且只路由包根目录，Coding、Jelly、Shelf 在宿主与外壳里的代码未路由；挑相关用例的脚本、CI 产品子集、测试并发隔离、固定记录最新全量数字的位置都还没有（§9.2 的 §4.7 一行） | 决定 #13（SSOT 每行写角色与账号，CODEOWNERS 只自动请求评审、不改分支保护）：W1-13 已做；余项 W2-17、W1-11/W2-16、W5-12、W6-05 |
| N-10 | 部分 [已确认] | #293 起按测试文件用 AST 数 `import`、`export … from`、`import()`、`require()`（含 `server/src`），只许按文件减少、新测试文件从 0 开始：当前 893 处、320 个文件（`tooling/gates/baseline.json`，2026-10-12 在 W2-11 d 分支上测得，叠在 c1 之上；合入 main 后以 baseline.json 为准；10-10 删 Casebook 的测试后，之前 994 处、352 个文件；原正则口径 957） | W2-10（71 个文件改走公开入口）、W2-11（test-kit 助手：a、b 已合入；c1、c2、c3、d 在分支上，四个授权内部模块的导入合入后 93 条 → 16 条，剩下的逐处原因与归属见 [test-internal-imports-ledger.md](test-internal-imports-ledger.md)）、W5-08。决定 #12：不加 testing 子路径 |
| N-11 | 仍然成立 [已确认] | `packages/contracts/src` 91 个文件、16,544 行；`apps/local-host/src/index.ts` 219 行、138 条 `export`、11 个 `export *`；`modules/goals/src/index.ts:204` 把 `GoalsRepository` 作为公共出口；W3-03 做完后合同包还剩八条纯度记录：W3-03 有意不碰的六条（五个负载读取函数 `parseCharacterImportSnapshot`、`parseFilePath`、`parseFilesCollection`、`parseChangeSet`、`parseCodingChangeSet`，和 `modelRequestShape`）与归 W3-02 的两条（`bindOwnerPluginAction`、`actions.ts` 的状态码表），由纯度门禁冻结、只许变小；归 W3-02 的两条已由 W3-02 C 搬进 SDK（`bindPluginActionRoute` 与 `bindOwnerPluginAction` 在 `packages/plugin-sdk/src/routes.ts`，合同包不再有状态码表），合同包还剩六条；这六条算不算「无副作用的小工具」、N-11 要不要等它们搬走才算完成，在 N-11 收尾时定 | W1-05（纯度基线与导出计数）、W3-03（运行时逻辑迁出 contracts）、W5-08、W5-09 |
| N-12 | 部分：Goals 的无调用方 typed 桥已删（W2-08）、工作区读已并成一个 id（W2-09），其余待做；方案已定 [已确认] | `HostCapabilityDefinition` 出现在 18 个文件，`registerCapability(` 10 处，动作服务 `registerProvider(` 45 处；`LocalHost` 仍持有 `CapabilityRegistry`（`apps/local-host/src/local-host.ts:96`）和 `register()` 直调这条路。决定 #1：对外的只走动作，Goals 无生产调用方的 typed 桥删除，工作区读只留一个 id，typed 注册表只留作 Runtime 插件的宿主内服务通道（`agent.*`、`schedule.*`）、门禁不许再加；决定 #8：Casebook 的 typed 能力随 Casebook 一起删除（10-10 决定，不再改成动作）；这些偏离已登记在 `docs/system/CALL-CHAINS.md` §10（#319）。**W2-08 已做（2026-10-09，分支 `refactor/goals-bridges`）**：Goals 26 个没有生产调用方的 typed 条目已删（16 个事件读写、项目指导与规划方法的写和读、规划组合读、回收站列表、续接事实读、Goal 契约读、从未注册的 `createGoalCapability`），留下的 typed 条目都有生产调用方（初始化、快照、设当前目标、项目指导读、`create-intent`、本人的决定记录、四个结构提案入口），归 W3-07；原来调它们的测试改用管理调用者调 Goals 的动作（`tests/goal-management-caller.ts`）；typed 能力点位（`pnpm health:check`）在合入 #348 之后的 main 上是 330，现在是 253；`HostCapabilityDefinition` 文件数与 `registerCapability(` 处数不变（18 个文件、10 处，Goals 的桥走 `host.register`）。同一片按决定 9 把 Feed「升格为 Goal」改成经 Goals 自己的动作写（新动作 `goals.inputs.confirm`），取舍记在 §1 同日一行。**W3-07 PR-1+2 已做（2026-10-11，分支 `refactor/onboarding-goals-actions`）**：`MolisWorkLocalHost.actionClient(reference, preparePlugins = true)` 多一个开关，传 `false` 时不先启动项目的 Runtime 插件、不恢复外部 MCP；首次引导的第一个目标（`/api/onboarding/initialize`）改调 `goals.create`（网页里的本机这个人），Run 与助理轮次读项目说明改调 `goals.guidance.read`（新的只读宿主调用者 `readProjectGuidance`，只授 `goals:read`）；`createGoalIntentCapability`、`readProjectGuidanceCapability` 因此没有生产调用方，还登记着只因测试在用，随 PR-5 删除。三处取舍（首次引导的调用者、说明读取的调用者、「没有 typed 行」测试的断言方式）记在 §1 的 2026-10-11 三行。 **W3-07 PR-3 已做（2026-10-12，分支 `refactor/cli-goals-actions`，叠在 W3-01 E 的 `feat/call-ids-for-rounds` 上）**：`apps/local-host/src/goals-actions.ts` 多 `bindGoalsManagementActions(client, reference)`——Host 造的管理调用者（本机这个人，`web-user`，`user`，出处 `management`，一次一个 Goals 动作，权限取该动作自己的，`allowed_actions` 钉在这一个动作上；两个决定动作的 `evidence` 只指向对话），不从本包入口导出；`molis-work v1` 的 `init`、`snapshot`、`active-goal`、`goal-tree-propose/read/check/decide` 各调一个 Goals 动作（命令行的输入、输出、错误码、错误消息与落库出处不变，一条命令在调用记录里只留一行），`apps/cli/src/goal-tree-commands.ts`（4 处 `as unknown as`）删除；门禁 `checkGoalTransportCallers` 的命令行部分读所有进入 Goals 包和 Host 客户端的写法（命名空间、`export … from`、子路径、动态导入、`host.client(…)` 等）和 `bindGoalsManagementActions(<host>.actionClient(reference, false), reference)` 的两个参数，带变异用例。快照、设当前目标、结构提案的提交、读取、检查这几条 typed 桥因此在生产里没有调用方，还登记着，随 PR-5 删除（管理 MCP 的初始化和决定仍走 typed，等 PR-4）。九处取舍记在 §1 的 2026-10-12 九行。 | W1-05（计数）、W3-07、W3-08（W2-08、W2-09 已做） |
| N-13 | 仍然成立 [已确认] | 没有 eslint、biome、prettier 配置，根 `package.json` 的 31 个脚本里没有 lint 或 format | W1-09 |
| N-14 | 部分 [已确认/引用] | `vendor/prologue-sdk/` 有 26 个 `.patch` 加 1 个 tgz；`vendor/prologue-sdk/README.md:16` 仍写着来源分支的提交「暂未推到 prologue 远端」，但 W1-20 的方案（#318，[dependencies-and-sdk-plan.md](dependencies-and-sdk-plan.md) §1、§4.1）查到来源分支早已推到 Prologue 远端并合入（PR #3，2026-09-30），现行 vendored 包不需要补丁：用上游提交 `9fc3b173` 直接构建，打出的 tgz 与仓库里的逐字节相同 [引用方案，这次没有重跑]，所以「别人无法重建」的前提不成立，README 与 BL-024 都过期；25 个历史补丁可删，还没有删；另两个 vendored 包（`intelligence-client`、`search-evidence-layer`）有 sha256 与 provenance，Prologue 没有 | 决定 #25（推上游分支、删 25 个历史补丁并记 sha256 与来源、tgz 改从私有 registry 或 release 附件取）：方案已出（W1-20）；推送、删除、改取用都等用户确认后分片做（W1-23）；BL-024 已按方案改写 |
| N-15 | 代码已修复，文档与示例有残留 [已确认] | `schemaPatches` 0；兼容标记 9 处（按文件计数，只许减少，#283；10-10 删 Casebook 后，之前 17 处）；`tooling/migrations/`、`compatibility-allowlist.json`、`apps/local-host/sdk/`、`tsconfig.sdk.json` 已不存在；`modules/execution`、`modules/evidence-verification` 已删（#268）；AGENTS.md:29 与两个 Skill 的读取兼容规则（#290；以后的读取兼容从第一个装到开发机之外的版本起算，流程见 `docs/system/CONTRACT-CHANGES.md`，#314）、`CONTRACTS-AND-OPERATIONS.md`、`ARCHITECTURE.md`、README（#295–#298）已改。余：① `specs/action-architecture/spec.md:248` 仍写「旧环境/文本密钥入口可作为兼容来源」（文本密钥 `model:text:api_key` 已不读，开发用的 `MOLIS_WORK_TEXT_*` 环境变量还在 `apps/local-host/src/host-complete-text.ts:100`）；② `specs/action-architecture/migration.md`（1,625 行）仍写「兼容入口」「旧名字仍可用」（:14、:261、:653–663）；③ 内部名 `checkGoalBoard` 在 `project-capabilities.ts` 里 36 处，W2-02 已改名 `requireRuntimeProject`（`oldNames` 基线里该文件的 36 处随之清零）；④ `board_id` 在运行代码里 0 处，但随根包发布的 `examples/draft-goal.json`、`examples/leaf-goal.json` 仍写 `"board_id"`：W2-02 查到这两个文件的形状（顶层 `goal` 对象）没有任何现行命令接受（`goal-tree-propose` 要 `summary` 与 `items`，`submitGoalTreeProposal` 先报 `goal_tree_proposal.summary_required`），仓库里没有文档或测试引用它们，来自初始发布，已删并从根 `package.json` 的 `files` 去掉 | ①② W1-02；③④ W2-02 已做 |
| N-16 | 仍然成立 [已确认] | `scripts/run-tests.mjs:16` 用 `--test-concurrency=1`；757 个 `tests/*.test.ts`（其中 128 个 e2e）加 5 个 `.test.mjs`；全量 76–78 分钟（§4.1、§9 各批记录）[引用]。W5-12 已做（#497 隔离并发；2026-10-16 测量：1,017 个文件 58.2 分钟，见文首「W5-12 测量」） | W5-12（每文件一个 Home 与密钥库，非浏览器文件并发）、W2-17（受影响用例挑选） |
| N-17 | 仍然成立 [已确认] | `tooling/gates/` 现在有 `baseline.json`、`giant-exceptions.json`（#320）、`limits.json`、`secret-allowlist.txt`，没有 `api/`；WIP 分支 `chore/health-gates-lint-api` 只在本地 | W1-04（API 快照）、W2-15（动作合同快照，取代 `specs/archive/post-merge-review/capability-snapshot.mts`） |
| N-18 | 部分 [已确认] | W1-17 已做（#315）：`docs/system/GLOSSARY.md` 一概念一名一定义，含术语到翻译稳定键的对应、界面用词待批清单（第 4 节，等用户批准）、代码改名清单（第 5 节，分内部改名与合同改名，尚未执行），AGENTS.md「先读哪里」指向它。改名前各词出现在多少个源码文件里：Action 939、Capability 421、Method 382、Role 257、Character 154、Judgment 118、Behavior 113、Skill 73、Scene 53 [引用]；Project 与 Board 已统一（#287，`boards` 表名按决定保留） | 决定 #27（文档一个定义、内部名跟着改、界面用词另列清单经用户批准）：W1-17 已做；代码改名 W5-14 |
| N-19 | 部分 [已确认] | 版本与发布策略已写（W1-22，#321）：`docs/releases/POLICY.md`（一个产品版本、下一版 0.3.0）、`CHANGELOG.md`（第一节 `[Unreleased]`）、`CHECKLIST.md`（含各库版本表与真实 Home 的处理）；核对脚本移到 `scripts/verify-release-versions.mjs`，CI 里跑（「Release versions agree」）。余：根包仍是 0.2.0，71 个工作区包 0.0.0，`examples/plugin-sample` 2.0.0；内置插件清单版本仍各自独立（1.0.0 到 1.50.0，`POLICY.md` 第 1 节），Runtime 对内置插件一律跟当前构建的做法用户 10-08 已选定（A，`POLICY.md` 第 7 节，#323），还没实现；v0.2.0 之后 1,868 个提交（不含合并提交 1,213 个，`git rev-list --count v0.2.0..origin/main`）都在 `[Unreleased]` 里，还没发布 0.3.0；根目录仍入库 `molis-work-introduction.html`、`outputs/`（3 个文件，含商业计划）、`.zcode/plans/`（1 个文件），`.gitignore:8` 还留着旧名 `.goalboard/`；`docs/product-intro/` 才是对外介绍的正式位置 | 决定 #23（一个产品版本，下一版 0.3.0）、决定 #22（介绍页移到 `docs/product-intro/archive`，`outputs/` 与 `.zcode/` 移出并加进 `.gitignore`）：W1-22 已做；W1-23、W5-15；BL-117 |
| N-20 | 仍然成立 [已确认] | Rust 18、Swift 3、shell 7、Python 1 个文件；CI 里没有 rustfmt、clippy、Swift 构建检查或 shellcheck | W1-09 |
| C 组 | 仍然成立，方案已出 [已确认] | `packages/observability` 在 SSOT 里仍是 `absent`（`docs/SSOT-MATRIX.md:73`）；没有自动更新、崩溃上报、在线备份；macOS 安装包未公证（README）；生成插件沙箱依赖 `sandbox-exec`（`packages/plugin-sandbox`）；CLI 没有第三方插件安装路径；核心 AI 依赖私有 vendored 包。方案已写：[c-end-readiness.md](c-end-readiness.md)（W1-21，#316，三个里程碑、各项成本与依赖、5 个探针）、`docs/system/THIRD-PARTY-PLUGINS.md`（#317）、[dependencies-and-sdk-plan.md](dependencies-and-sdk-plan.md)（#318） | 决定 #11（第三方插件：本地装、首次确认、沙箱里跑，只写计划）、#20、#25：W1-21（方案，已做）、W1-20（方案，已做）；执行见各方案 |
| 新（合并现场） | 部分 [已确认] | 真实 Home 上同时跑两个 Web 的情形这次没有：4207、4208、4173 都没有在监听（4173 自 10-03 停着，§7）；规则仍是 AGENTS.md 的「一个 Home 只有一个执行进程」。装新版仍待用户（§7） | 用户（§7）；W5-16 之前开发用隔离 Home |

### 3.2 体检报告 §5 的防腐顺序

| 步 | 结论 | 证据 | 归属 |
| --- | --- | --- | --- |
| 1 收掉 main 上 4 个已知失败，最近一次全量写进固定位置 | 部分 [已确认] | 失败已关（R-06）；还没有固定位置记录日期与数字，`specs/README.md`、CI 与 `PARALLEL-DEVELOPMENT.md`（#314）都没有 | W6-05（定位置并记录；W1-13 已合入，没有覆盖这一项） |
| 2 删旧助理、合并 README、修 SSOT 的 `apps/server` 行、摘 6 个占位 subpath、删旧皮肤 | 部分 [已确认] | 做了：旧助理（R-04）、README 两份、SSOT 的 `apps/server` 行（#103，`SSOT-MATRIX.md:51`）、6 个占位 subpath（R-11，W2-01）；没做：旧皮肤（皮肤行）。验收信号里 `git grep personal-assistant-` 只剩 1 个脚本，`boundary:check` 通过（CI 里跑），旧皮肤删除后的截图对比未做 | W5-05 |
| 3 官方插件只有一种装配方式 | 部分 [已确认] | 只做了 `legacyMcp` 一项（#269）；19 个构建期插件、`project-host.ts` 26 处逐插件 `registerProvider`、`builtin-plugins.ts` 不由 Manifest 推导（R-01） | W4-04、W5-01、W5-02、W6-01 |
| 4 浏览器代码一条构建管线 | 未做 [已确认] | R-07：133 个模板字符串常量，客户端脚本 58 个、27,251 行 | W4-04、W5-04 |
| 5 统一错误基类与错误码前缀，删重复 helper | 未做 [已确认] | R-08：Error 子类约 110 个（目标 < 30），`escapeHtml` 11 份，没有错误码表 | W3-02 |
| 6 规格归档与 SSOT 例行化 | 已执行 [已确认] | `specs/` 根目录 12 个 spec 目录（目标 < 40），状态句门禁在 CI；SSOT 经 #295–#298 与代码对齐，余项见 R-05、N-15 | W1-02、W1-06 |

### 3.3 体检报告 §7.5 对在途工作的建议

| 条 | 结论 | 证据 | 归属 |
| --- | --- | --- | --- |
| 1 合入顺序 | 部分 [已确认] | 报告建议先合 #102、后合 #98，合入前做三件事。实际两个都已合入，顺序相反：#98 在 2026-09-30T16:47:44Z，#102 在 16:56:09Z（`gh pr view`）。三件事是合入之后才做的：#98 的合并提交 `2e8f60de` 上 `vendor/prologue-sdk/` 还有 4 个 tgz，10-02 的 #170 才收成 1 个（N-02）；`scripts/personal-assistant-public-sources.mts` 当时就在、现在还在（R-04）；Todo 登记为待迁移见 `tests/builtin-plugin-assembly-gate.test.ts` 的 `BUILD_TIME_ASSEMBLED` 注释。侧栏、助理面板、页面动线各线的合入见 post-merge-review §13 [引用] | — |
| 2 文件归属表落地 | 被取代，已做 [已确认] | 被 10-02 的 CODEOWNERS 决定与决定 #13 取代；`.github/CODEOWNERS` 与 SSOT 各表的「归属」列已由 W1-13 建好（#314），见 N-09 | — |
| 3 动 Characters 先立项 | 部分 [已确认] | 用户可见形态已定（#141）；代码身份已定（决定 #26：并进宿主）；未执行（N-05） | W5-01 的 Characters 一项 |
| 4 清理检出 | 部分 [已确认] | 主检出 10-07 快进过，现又落后 origin/main；工作树、远端分支、d62d 还在（R-13、N-07） | 决定 #24；W1-23 |
| 5 统一基线 | 未做 [已确认] | 没有固定位置记录每次合入后的全量数字。#314 的 `docs/system/PARALLEL-DEVELOPMENT.md` 写了集成分支上跑全量（第 7 节）和基线工作树比对（第 8 节），没有定义记录最新数字的位置 | W6-05（定位置并记录；W1-13 已合入，没有覆盖这一项） |

### 3.4 第一步交接清单（post-merge-review §12）

**12.1 兼容逻辑**

| 项 | 结论 | 证据 | 归属 |
| --- | --- | --- | --- |
| 助理第一版记忆迁移、旧表、旧记忆路由（PMR-05） | 已修复 [已确认] | #257（`caf65e1e`）；`migrateLegacy` 在五个目录里 0 处 | — |
| 旧动作入口（BL-081） | 已完成（2026-10-26，W6-01）[已确认] | 已删：MCP 旧名与别名（#269）、旧场景绑定（#279）、`/api/plugins/<id>/…` 的改写表 `native-plugin-api.ts`（W6-01 第一片，RAC-1020）、`/api/functions/by-key/*` 两条路由（用户 2026-10-26 弹窗决定；`functions.describe`、`functions.invoke` 只走动作入口，3 个用例改走 Host 动作入口，断言的意思不变，RAC-1021）；`function_scenes` 0 处。BACKLOG 的 BL-081 已删行；`action-architecture/migration.md` 里带日期的历史条目仍写当时的「兼容入口」说法，不改 | W6-01（已做） |
| 文字补全读旧凭据 `model:text:api_key`（BL-082） | 已修复 [已确认] | #239、#246；该键只在 3 个测试文件、4 处出现（`tests/secret-store-format.test.ts:25`、`:27`，`tests/host-configured-text.test.ts:237`，`tests/secret-store-keychain-retry.test.ts:136`），都是拒绝读取与旧存储格式的断言；BACKLOG 行已删 | 文档残留见 N-15 ① |
| V3 一次性导入（BL-083） | 已修复 [已确认] | #244；`importV3` 0 处 | — |
| `AssistantSurfaceContext.starters`（BL-084） | 已修复 [已确认] | #281（`baa88220`）；`packages/contracts/src/services/assistant.ts:62` 的 `AssistantSurfaceContext` 已无 `starters`；BACKLOG 行已在 #297 删除 | — |
| 客户端 Goal 时代的旧路径（PMR-08） | 三项已删，两项有入口、留给用户 [已确认] | **已删（W2-02，2026-10-08）**：① `/decisions` 页：服务端的 `decisionView`（`goals-document-routes.ts`、`goals-page-renderer.ts`、`web-goals-read.ts`，Goals 插件 `collection-model.ts` 的参数）、页面从没有用到的 `decision-center.ts` 与 `goals-decision-results-ui.ts`、六个客户端片段里的 `decisionView` 分支（`bootstrap.ts`、`documents-state.ts`、`events-secondary.ts`、`initialization.ts`、`refresh-decisions.ts`、Goals 插件的 `navigation-client.ts`）、存档键 `…:inbox`、没有生产方的 `[data-decisions-link]`；`GET /decisions` 现在是 404。**样式（评审后补清，2026-10-09）**：已删 `.decision-empty`（`apps/workbench/src/styles/workbench.ts`，唯一生产方是已删的 `decision-center.ts`）；设计系统里指向已删视图 `data-board-view="decisions"` 的 84 处 `:not([data-board-view="decisions"])` 守卫（`momentum.ts` 58、`calm-desktop.ts` 23、`quiet-paper.ts` 2、`directory-ledger.ts` 1）；`personal-workbench-v3.ts` 里没有生产方的 `[data-board-view="decisions"]` 规则和整段旧决定页/Inbox 页外壳（`.inbox-workspace`、`.inbox-header`、`.inbox-group`、`.inbox-item*`、`.decision-summary`、`.decision-groups`、`.decision-owner*`、`.decision-stack`、`.human-review-list` 等，含一段 `@container` 里同一批类，共 117 行，全仓没有生产方）；决定中心 `renderFeedDecisionGroupDetail`（删前在 origin/main 上也没有调用）留下的 `.feed-decision-work`：`personal-workbench-v3.ts` 的 4 条规则、`navigation-ownership.ts` 里 900px 以下整段媒体查询（选择器全在 `.feed-decision-work` 之下，其中的 `.decision-guidance`、`.decision-scenario` 在页面上仍由 Goals 插件的方案表单生成，基础样式在 `proposal-styles.ts`，窄屏写法在 `responsive.ts`，不受影响）、以及 `navigation-feed.ts` 重载 Feed 工作区时按 `.feed-detail--decision, .feed-detail--result` 移除旧详情的两行（这两个类全仓没有生产方：`git grep -n "feed-detail--"` 只剩 `--prototype`、`--attention`）；`tests/visual-foundation.test.ts` 里钉着这些旧写法的两条断言改成断言它们不再出现（含 `.feed-decision-work`），并新增一条钉住保留下来的紧凑缩进。去掉守卫会让规则少一级特异性，所以不是纯删除，核对过：用浏览器把旧、新两版设计系统样式表换进同一页面，比较所有会被带守卫规则选中的元素的计算样式（25 个状态：首页、Goals 的列表/画布/看板、Goal 文档、八个插件界面、归档、回收站，桌面壳开关、宽度 1440/1000/800、沉浸开关、紧凑/标准密度），以及对 14820 条规则逐对检查「去掉守卫后谁胜出会不会变」（加载全部 28 个插件界面之后）。结果只有一处真有变化：紧凑密度下 `momentum.ts` 的 `.tree-children` 缩进（8px/4px）靠守卫多出的一级特异性压过了 `goal-canvas.ts` 里 Goals 列表写的扁平 `.tree-children`（0）；去掉守卫会让列表在紧凑密度下子目标缩进消失（7 个元素直接受影响，Goals 列表打开时连带 55 个元素的布局值不同），属于看得见的改动，所以那一条改写成 `.tree-children.tree-children` 保持原样，缩进该不该留列给你（BL-121 ③）。改完后 25 个状态差异为 0。**没有删（还有生产方或待主人决定）**：`.decision-record*`、`.decision-actions`、`.decision-reason`（Goal 方案采纳表单）、`.decision-receipt*`（回执，BL-121 ①）、`.decision-results*`、`.decision-result*`（「最近处理结果」贡献，现在没有挂载点，见 §7）。查入口：这页唯一的站内入口是 Goal 关系编辑器里的「Inbox」链接（`plugins/native/goals/src/relation-ui.ts`，旧写法 `href="/decisions"`），已改成 `href="/"` 加 `data-work-surface-link="inbox"`，点开按插件切换器的方式打开 Inbox 插件（`tests/goals-relation-ui.test.ts`、`tests/goals-relation-inbox-link.e2e.test.ts`）；CLI、MCP、Skill、Tauri 里没有生成这个地址的地方。② `#decision-goal-` 跳转（任何页面上这种锚点都会整页跳到该 Goal，随 `decisionView` 一起删；页面上唯一产生这种 id 的是已删的决定中心）。③ Tauri 测试地址（`main.rs`，改成当前路由 `/projects/project-a/goals/goal-a#goal-document-pane`，仍测「片段留在 `?desktop=1` 之后」）。**没有删，交用户（BL-121）**：决定回执有入口——Goal 页采纳或退回方案后由 `plugins/native/goals/src/proposal-client.ts:43、:75` 调用，`tests/goals-proposal.e2e.test.ts:66、:74、:85` 断言它；只删了回执代码里指向已删决定中心的选择器（`.decision-goal-group`、`[data-decision-center]`、`.decision-center-header`，它们不可能再匹配）。`?feed-start=1`：界面上已没有入口（Feed 详情不渲染「开始处理」，`tests/desktop-tui.test.ts:1149` 断言没有 `data-feed-action="start"`），但整条链还在，包括 HTTP `POST /api/feed/items/:id/start`、Feed 动作 `feed.item.promote` 的输入 `start_processing`（对 Agent 和 MCP 公开的动作合同）、`processing` 去向、终端自动填入，删它要改动作合同，见 BL-121 | W2-02 已做；BL-121（回执、`?feed-start=1` 待你决定） |
| 场景 9：真实 Home 在当前 main 上能否打开 | 已做 [引用] | 10-04，§9.4 第 12 条 | — |

**12.2 结构与分层**

| 项 | 结论 | 证据 | 归属 |
| --- | --- | --- | --- |
| 19 个构建期装配的内置插件（BL-080，含 BL-088） | 仍然成立 [已确认] | 见 R-01 | W4-04、W5-01、W5-02、W6-01；BL-088 随 W5-01 |
| 首屏渲染全部插件的隐藏界面（PMR-07） | 未验证 [未验证] | #150 加了部分按需加载（`lifetime.whenVisible` 用在 `coding-companions.ts`、`plugin-event-recovery.ts`）；当时的 293 KB HTML、6041 个节点没有重量 | W1-07（页面资源预算门禁给出数字）、W5-05 |
| 空闲轮询 | 已做（W4-09 #539、#540，W4-10） | 宿主的周期任务登记在 `periodic-tasks.ts`（W4-09）；页面上等着人的事并成一个读 `/api/attention`、每 15 秒且只在可见时读，Board 游标检查只在 Goals 面跑，空闲首页每分钟请求数由 `tests/idle-request-budget.e2e.test.ts` 守住不超过 6（W4-10，见上方记录）；BL-116 已删 | W4-09、W4-10 |
| 渲染后改写 HTML 里的链接（`prefixLocalLinks`） | 仍然成立 [已确认] | 定义在 `apps/workbench/src/renderer.ts:407`，`renderer.ts:299/309/313` 与 `goals-page-renderer.ts:138/330` 在渲染后改写 HTML 串 | 补记：并入 W5-06。第 1 片没动（文件已改名 `shell-page-renderer.ts`）：真正的改法是生成链接时就带上作用域，不在渲染后改写，留 W5-06 后面一片 |
| Home 级插件的数据分项目时的搜索来源模式 | 已做（#1310）[已确认] | `skills/molis-plugin-dev/search.md:35` 写了这种模式：声明个人范围（`"home"`）与项目范围两个来源，读同一份存储，样板是 `plugins/native/todo/src/search.ts` | 补记：原并入 W6-03（Skill 与手册统一更新）；Skill 这一处已随 #1310 写进 |
| 147 个被三条以上线改过的热点文件 | 仍然成立 [引用] | roadmap §4.7：`apps/workbench/src/i18n/en.ts` 23 次、`web-request.ts` 21 次、`web-catalog.ts` 14 次、`project-host.ts` 12 次等；`tooling/gates/baseline.json` 自身也成了冲突热点 | W1-13 已做（枢纽文件与排时段，`PARALLEL-DEVELOPMENT.md` 第 2、5 节；归属见 `.github/CODEOWNERS`，#314）；W5-02（声明式登记）、W6-04（重量） |
| 翻译键重复与覆盖（PMR-04、PMR-14） | 仍然成立，且变大；全角冒号一处已修 [已确认] | `apps/workbench/src/i18n/*.ts` 5,516 个键里 192 个重复、100 个英文不同（AST 数，口径与 10-03 不同；后写的覆盖先写的）；`assistant-island.ts:2114` 原来的 `L("正在看") + "："` 已改成一句带参数的译文 `L("正在看：{title}", { title })`（英文 `Viewing: {title}`，W2-02；`tests/assistant-island-script.test.ts`）；同类写法（译文加全角冒号拼接）还有 66 处，在 10 个文件里（`assistant-island.ts` 37 处、`settings-memory.ts` 9、`plugins/native/todo/src/client.ts` 8 等），英文界面都会显示全角冒号；没有重复键门禁；`tests/i18n.test.ts` 只查 61 个手写文件、不在 CI | 决定 #16（换成稳定键，先做一个插件样板）：W1-08、W5-03（拼接冒号的 66 处并进 W5-03，换键时一并改成带参数的整句）；BL-118 |
| vendored SDK 积了 3 份未用 tgz（PMR-06） | 已修复 [已确认] | #170；现 1 份（N-02） | — |
| 死脚本（PMR-09） | 已修复 [已确认] | `scripts/personal-assistant-public-sources.mts` 已由 W1-23 删（2026-10-08），W2-02 核对 `git ls-files scripts` 里已没有 | — |
| 左侧插件栏标记是否已成死代码（BL-086） | 核对结论：不是死代码；助理取名已改走目录 [已确认] | `.plugin-rail-items` 由 `apps/workbench/src/immersive-shell.ts:194` 渲染，插件切换器弹层（`packages/design-system/src/styles/craft-finish.ts`）、导航脚本（`navigation-presentation.ts`、`immersive-navigation.ts`）和助理都在读它；它是插件切换器的列表容器，不是旧左栏的残留。W2-02：助理的 `surfaceName()` 不再读它，改问宿主传入的 `pluginTitle`（标签页工作区的 `ops.pluginTitle`：目录里的名字，加运行时装上的插件自己报的名字；`tests/assistant-island-script.test.ts`）；助理还有六处读它的状态（有没有 Coding、去 Coding 的按钮、三处「当前显示的插件」、切换后刷新提醒），选择页（chooser）上的助理没有标签页工作区、仍显示插件 id（和以前一样） | W2-02 已做取名；容器是否改名、六处读状态是否换接口留在 BL-086（建议不改名：40 余处样式与脚本，没有行为收益） |
| 能力快照脚本改成仓库内的 API 快照门禁 | 未做 [已确认] | `specs/archive/post-merge-review/capability-snapshot.mts` 还在 | W2-15 |
| 插件有两套 id（PMR-31） | 助理取名已修 [已确认] | 助理「起点」查名字原靠 `.plugin-rail-items` 里的 `surfaceName()`，W2-02 改成问目录（见上行）；#162 之前只修了显示 | W2-02 已做 |
| 助理面板取插件名靠左栏标记（PMR-31、BL-086） | 取名已修，状态仍读容器 [已确认] | 取名见上；`assistant-island.ts` 仍有六处读 `.plugin-rail-items` 的状态（`codingHere`、去 Coding 的按钮、三处 `aria-current` 当前插件、切换后刷新提醒） | W2-02 已做取名；其余留 BL-086 |
| 单次模型请求沿用 Prologue 默认 60 秒（PMR-33） | 部分 [已确认] | 已经不是 SDK 的 60 秒默认：`horizontal/agent-host/src/adapters/prologue-node.ts:128` 的 `MODEL_CALL_TIMEOUT_MS`（180 秒）是轮次没有时间预算时的默认，预算里的 `max_duration_ms` 优先（`:1431`）；创作台另按角色设了 `horizontal/agent-host/src/adapters/plugin-builder.ts:27` 的 `MODEL_CALL_LIMIT_MS`（designer 600 秒、coder 300 秒）；文字补全默认 120 秒（`apps/local-host/src/host-complete-text.ts:121`）。仍缺：没有按场景统一设定，`docs/platform/PROLOGUE-AI.md` §8 只写了文字 120 秒和预算里的 `max_duration_ms`，没写 180 秒默认和创作台的按角色限制 | 补记：并入 W3-06（模型走 agent-host 的插件服务，按场景设时限并写进 Prologue AI 手册） |

**12.3 测试与回归基础设施**

| 项 | 结论 | 证据 | 归属 |
| --- | --- | --- | --- |
| 浏览器用例的固定时限对负载敏感 | 仍然成立 [已确认] | `tests/fixtures/goal-browser.ts` 里 `waitFor(expression, timeoutMs = 4000)`（W2-11 a 把启动与 DevTools 连接搬到 `packages/test-kit` 的 `/browser`，这一条时限与诊断留在夹具里；按函数名引用，行号会随夹具的其他改动移动）；130 个测试文件定义或调用 `waitFor` | W2-16（时限改为等真实条件，稳定的部分进 CI 子集） |
| 测试依赖 `fs.watch` 收到其他进程的文件事件 | 不再成立 [已确认] | 全仓 `fs.watch`、`watchFile` 0 处；#143 修的那一处改成轮询（`tests/feed-research-authority.test.ts:52` 的注释） | — |
| 全量回归两小时以上，并行会话互相干扰 | 部分 [已确认] | 全量 76–78 分钟 [引用]；`scripts/run-tests.mjs` 已按文件隔离并发（#497），2026-10-16 测得 58.2 分钟（1,017 个文件）；#250 让全量也跑 `.mjs` 用例 | W2-17（受影响用例挑选）、W5-12（隔离与并发） |
| 页面在浏览器窗格隐藏时不启动（`lifetime.whenVisible`），自动化验收会误判 | 未做 [已确认] | 验收脚本没有先确认 `document.visibilityState`（`tests/` 里 0 处） | 补记：并入 W1-12（回放工具先确认可见性） |

### 3.5 小结与补记

- 附录 A 共 39 行（R-01～R-14 十四行，皮肤、Goals UI、Server 三行，N-01～N-20 二十行，C 组一行，另有一行「新（合并现场）」）：已修复 7（R-02、R-04、R-05、R-10、R-11、N-01、N-02），已按决定收口或不再按原样成立 2（N-03、Server），部分 16（R-06、R-09、R-12、R-13、Goals UI、N-04、N-05、N-07、N-08、N-09、N-10、N-14、N-15、N-18、N-19，加上「新（合并现场）」），仍然成立 14（R-01、R-03、R-07、R-08、R-14、皮肤、N-06、N-11、N-12、N-13、N-16、N-17、N-20、C 组）。
- 报告 §5 六步：已执行 1、部分 3、未做 2；§7.5 五条：被取代且已做 1（第 2 条）、部分 3（第 1、3、4 条）、未做 1（第 5 条）；交接清单 25 项：已修复或已做 6、部分 5、仍然成立或未做 11、不再成立 2（`fs.watch`、BL-086 的死代码假设）、未验证 1（PMR-07）。
- 首轮（`33067cbe`）之后，#314–#322 改变了结论的行：N-04、N-09、N-14、N-18、N-19（仍然成立 → 部分）、C 组（方案已出）、§3.3 第 1、2、5 条、§3.2 第 1 步的归属；只改了数字、行号或引用的行：R-01、R-03、R-05、R-06、R-07、R-11～R-14、Server、N-03、N-05～N-08、N-11、N-12、N-15～N-17，以及 §3.4 的 BL-081、BL-082、PMR-33、空闲轮询、热点、翻译键各行。
- `ba223d95` 之后改变了结论的行：R-11（仍然成立 → 已修复，W2-01，2026-10-08）。本节第一条的计数已按此更新：已修复 6 → 7、仍然成立 15 → 14，合计仍是 39；其余行的结论与数字仍是 `ba223d95` 的量。
- roadmap 记错或已过时、这里更正的：`feed-start=1` 不是 0 处；`.plugin-rail-items` 不是死代码；BL-084 的行已在 #297 删除；SSOT、README、`ARCHITECTURE.md`、`CONTRACTS-AND-OPERATIONS.md`、`host.md` 的多处断言已由 #295–#298 修好（见 R-05、N-15）；`docs/system/HOME-DATA.md` 已存在（W1-16 的内容）；健康门禁对照合并基点、类行数与方法数分开记、`--report`、按文件 AST 数测试内部引用已由 #293 合入；密钥扫描已由 #294 合入；并行开发规则、合同变更流程、CODEOWNERS（W1-13）、术语表（W1-17）、调用链（W1-14）、扩展点（W1-15）、巨大单元清单（W1-19）、版本与发布策略（W1-22）、包清单表（W1-18 的第一个 PR）都已在 main，对应行已改。
- 路线表里没有对应切片、本节指定了归属的：`prefixLocalLinks` → W5-06；Home 级插件的搜索来源模式 → W6-03；PMR-33 请求时限 → W3-06；`whenVisible` 验收检查 → W1-12；Characters 并入宿主（决定 #26 写作「第 4 波切片」，路线表把 Characters 放在第 5 波 W5-01）→ W5-01；固定记录 main 最新全量数字的位置 → W6-05（W1-13 已合入，没有覆盖这一项）；W1-14 的基本合同复核留下的三项：G3（对象上下文接受两种历史输出形状，复核建议列为兼容清单的新项，确认没有生产方后删除）→ W2-03，G8（「基本合同」对 `_meta` 的措辞要补上「只给审计作者」）→ W1-02，G4（情境排序与布局留在内核，改内核 README 与边界规则，W3-04 原先写的搬出内核按 N-03 要重估）→ W3-04（已在 W3-04 第一个 PR 落实）。这几项是本节的提议，请协调会话确认。
- W2-02 的范围：路线表 W2-02 行（roadmap 第 35 行）只列了 PMR-09 脚本、PMR-14 冒号、BL-086、PMR-08 的 `/decisions` 视图、`#decision-goal-` 跳转和 Tauri 测试地址、`checkGoalBoard` 改名。另外三项也归 W2-02，不另开一片：① PMR-08 的决定回执；② PMR-08 的 `?feed-start=1`（roadmap 记成 0 处，见 PMR-08 行和 BL-121 ②）；③ 随根包发布的 `examples/draft-goal.json`、`examples/leaf-goal.json` 里的 `"board_id"`（N-15 ④；这一项原先记在 BL-121 ①，W2-02 已把两个文件删了，BL-121 现在是三项产品判断：① 决定回执、② `?feed-start=1`、③ 紧凑密度的列表缩进）。① 和 ② 删之前要先过产品判断（现在的 BL-121 ①②），不是直接当死代码删。
- W2-02 的结果（分支 `refactor/dead-code-batch`，2026-10-08）：做了 PMR-09（脚本 W1-23 已删，核对）、PMR-14 的冒号、BL-086 的取名、PMR-08 的 `/decisions` 页与 `#decision-goal-` 跳转与 Tauri 测试地址、`checkGoalBoard` 改名、两个示例 JSON（删，形状没有任何命令接受）；决定回执和 `?feed-start=1` 按 BL-121 先查入口：回执有入口（Goal 页采纳、退回方案），`?feed-start=1` 界面入口已撤但整条链（HTTP 路由、`feed.item.promote` 的输入 `start_processing`、终端自动填入）还在，所以都没删，列给用户（§7、BL-121）。顺带：删决定中心页后，Goals 插件的「最近处理结果」贡献（`decision-results`）没有挂载点了，仍在 `builtin-plugins.ts` 登记并受 DD2 守卫保护（`scripts/check-package-boundaries.mjs`、`tests/workbench-registration-boundaries.test.mjs`、`tests/workbench-ui-platform.test.ts`），留给 Goals 的主人决定：挂到 Goal 文档或 Inbox，还是连同三处守卫一起退役（§7）。评审后补（2026-10-09）：样式残留已清，范围和核对方法见 PMR-08 行；其中 `momentum.ts` 紧凑密度的 `.tree-children` 缩进靠守卫多出的一级特异性压过 Goals 列表的扁平写法，保持原样，是否保留缩进列为 BL-121 ③。
- W1-06 的规则（W2-01 行打开同一条规则）：路线表写的是「contracts has no contract-only subpath」。按 `maturity: "contract-only"` 读，它除了 6 个占位，还会命中根入口和 5 个在用的合同入口（`platform/package`、`platform/storage`、`platform/testing`、`platform/tooling`、`services/agent-host`），每个都被一个现存的包声明为自己的 `molis-work.contract`（R-11 ④）。规则写成「只有描述符、没有导入者、也没有现存包把它声明为 `molis-work.contract`」，命中的恰好是 R-11 的 6 个占位 → W1-06（写规则）、W2-01（删 6 个，已做，规则同时改成没有基线）；`platform/kernel`、`platform/testing` 的描述符保留（R-11 ②）。

## 4. 兼容逻辑清单（§4.1，初稿）

从文件名就能看出是迁移、旧格式或兼容的文件，共 50 个：

- **宿主**：`catalog-migrations.ts`、`feed-migrations.ts`、`project-migrations.ts`、`session-migration.ts`、`pages-legacy-project.ts`；
- **Modules**：
  - `artifacts/migrations.ts`、`evidence-verification/migrations.ts`、`execution/migrations.ts`；
  - goals 的 `migrations.ts`、`event-workflow-migration.ts`、`guidance-migrations.ts`、`revision-migration.ts`、`legacy-coverage.ts`；
  - governance 的 `migrations.ts`、`legacy-proposal-view.ts`；
  - `private-work-context/session-migration.ts`；
- **炼金术士**：10 个 SQL 迁移、`migrate.ts`、`pre-migration-backup.ts`、`legacy-actions.ts`；
- **测试与样本**：13 个；
- **tooling**：`tooling/migrations/` 三个文件，以及兼容白名单 `tooling/boundaries/compatibility-allowlist.json`。

此外：

- `board_id` 出现在 269 个源码文件、335 个测试文件里；建库语句里有 91 处 `board_id TEXT` 列。最多的是宿主 75 个文件、goals 模块 35、Goals 插件 32、contracts 19、Feed 14。按 `docs/system/ARCHITECTURE.md` §2，新项目两者同值，`board_id` 只为旧 V1 库保留。方案：与各库的基线重写同一片做，列与合同字段统一成 `project_id`，合同里的 `board_id` 字段删除，不留别名；
- 源码里提到旧产品名 GoalBoard 的有 10 个文件；
- 0.1.x 根 SDK 出口、MCP 旧名与别名仍在。

源码（排除 tests/specs/docs/dist）里与兼容相关的标识：

| 标识 | 文件数 | 处数 |
| --- | --- | --- |
| `legacy` / `Legacy` | 158 / 101 | 449 / 304 |
| `compat` | 78 | 187 |
| `historical` | 48 | 82 |
| `backfill` | 11 | 15 |
| `v3Import` / `importV3` / `V3_` | 11 | 19 |
| `GoalBoard` / `goalboard` | 1 / 9 | 38 / 21 |

另有：0.1.x 根 SDK 出口 `apps/local-host/sdk/`（index、sdk-store、sdk-types）、`tsconfig.sdk.json`、根包 `exports["."]`。

这些标识里，有些是产品里的「历史」功能，例如时间线、版本、撤销记录，不算兼容。开工时逐项分类：删除，或写明保留理由。

### 4.0 按文件名找到的兼容文件：初判

依据 §4.1「要删除的」逐条对照（main 16879b22）：

| 文件 | 做什么 | 初判 |
| --- | --- | --- |
| 宿主 `catalog-migrations.ts`、`project-migrations.ts`、`feed-migrations.ts`、`session-migration.ts` | 在目录库、项目库上按序跑各 owner 的迁移；项目恢复时校验支持的 Goal schema | 删迁移链；每个库改为一份当前 schema 的建库代码加版本校验，版本不符明确拒绝 |
| 宿主 `pages-legacy-project.ts` | 为 Pages 旧项目读原目录 owner | 随「Pages 旧项目导入」一起删 |
| Modules：`artifacts`、`evidence-verification`、`execution`、`governance-collaboration` 的 `migrations.ts` | 各自的升级链 | 删；执行、证据、治理里只剩历史职责的部分按 §4.1 一并删 |
| Goals：`migrations.ts`、`event-workflow-migration.ts`、`guidance-migrations.ts`、`revision-migration.ts` | 事件工作流、指导、修订回填等升级 | 删，Goals 库只留当前建库语句 |
| Goals `legacy-coverage.ts` | V3 导入带来的覆盖账，注释写明「不是现行账本」 | 随 v3 看板导入一起删 |
| 治理 `legacy-proposal-view.ts` | 旧提案的只读投影 | 删 |
| `private-work-context/session-migration.ts` | 会话库升级 | 删 |
| 炼金术士 `migrations/001`～`010` 十个 SQL、`migrate.ts`、`pre-migration-backup.ts` | 按序迁移与迁移前备份 | 合成一份基线建库 SQL 带版本号；删迁移器与迁移前备份 |
| 炼金术士 `legacy-actions.ts` | 为旧动作保留的入口 | 删，调用方改用现行动作 |
| `tooling/migrations/audit-goal-lifecycle.mjs`、`audit-project-identity.mjs` 等 | 迁移审计脚本 | 删 |
| `tooling/boundaries/compatibility-allowlist.json` | 兼容白名单（现为 0 条） | 删，换成防回流门禁（§4.1「以后的规则」） |

测试与样本里的 13 个（历史 SQL 样本、迁移测试、读取兼容测试、旧名拒绝测试）随代码删除；只留「当前 schema 建库正确」和「拒绝版本不符的库」的测试。

### 4.1 库与就地补表

系统评审修复的项目库 v8 → v9（2026-10-22，`feature/system-review-fixes`，待提交、待维护）：新增 `schedule_action_bindings`，记录闹钟所绑定安装、世代与动作版本。运行时只接受 v9，不补旧表、不推测旧闹钟身份。维护只在备份副本先演练：严格检查 v8、加入现行表、暂停未绑定闹钟、保留原任务与执行历史，明确重新授权后才恢复；拒绝错误版本并保证失败回滚。真实 Home 尚未维护，切换前须按发布维护窗口另行授权。验收与证据归 `specs/archive/system-review-fixes/spec.md` 的 SYS-15-S6。

一个隔离 Home（QA Home，跑过一轮场景）里 Molis 自己的库共 30 个：

- 个人库 16 个：`{name}/{name}.db`，名单在 `packages/storage/src/home-sqlite.ts` 的 `PERSONAL_HOME_SQLITE_STORES`；
- 其他 Home 级库：`projects/catalog.db`、`assistant/assistant.db`、`sessions/sessions.db`、`placement/placement.db`、`agent-definitions/agent-definitions.db`、`characters/characters.sqlite`、`agent-runtime/.molis-runtime-owner.db`；
- 每个项目一个 `projects/<id>/molis-work.db`；炼金术士每个项目一个 `alchemist/projects/<id>/studio.sqlite`；
- 锁库：`images` 的运行锁与 runner 库、`feed/secrets.lock.sqlite`。

建库代码里就地补旧表（main 16879b22，源码，不含测试）：

| 写法 | 处数 | 文件数 |
| --- | --- | --- |
| `ALTER TABLE` | 80 | 31 |
| `ensureSqliteColumn()`（缺列就加） | 35 | 7 |
| `PRAGMA table_info`（看列再决定） | 23 | 18 |
| `PRAGMA user_version` | 2 | 1 |

补得最多的文件：

- `modules/functions/src/store.ts` 12 处；
- `modules/goals/src/event-state-schema.ts` 9；
- `plugins/native/form/src/store.ts` 8；
- `modules/governance-collaboration/src/migrations.ts` 8；
- `pages/store.ts`、`goals/migrations.ts`、`execution/migrations.ts` 各 6。

版本记法不统一：`catalog_meta.schema_version`（项目目录）、`search_meta.schema`（搜索索引，不符就重建）、`user_version`（1 处），其余库没有版本，靠看列补列。

**方案**（开工后按库执行）：

1. 每个库只留一份当前 schema 的建库语句，删掉 `ALTER TABLE`、`ensureSqliteColumn` 与看列补列；
2. 统一一个版本记法：建库时写入当前版本；
3. 打开时版本不符就明确拒绝，报出库路径与期望版本，不就地升级；
4. 加门禁：源码里不再出现 `ALTER TABLE` 与 `ensureSqliteColumn`（测试夹具除外）。

搜索索引这种可以从权威数据重建的派生库，版本不符时重建，不算兼容。

**执行顺序**（每步一个 PR）：

1. `packages/storage` 加一个共用的打开函数，例如 `openBaselineSqlite(home, name, { version, schema })`：
   - 新库：执行基线建库语句，写入版本号（`PRAGMA user_version`）；
   - 版本相同：直接打开；
   - 版本不同：抛出明确的错误，带库路径、期望版本和处理办法，不就地升级。
2. 按库替换，每个库只留一份当前 schema。Home 级库的打开处（main 16879b22）：

   | 库 | 打开处 |
   | --- | --- |
   | `agent-definitions` | `apps/local-host/src/agent-definitions/agent-definitions.ts:315` |
   | `assistant`（助理与记忆宿主共用） | `assistant/assistant-http.ts:41`、`memory/memory-host.ts:256` |
   | `connectors` | `connector-authorization-status.ts`、`connector-connection-store.ts`、`connector-protocol-store.ts` |
   | `context-onboarding` | `context-onboarding-store.ts` |
   | `placement` | `placement-actions.ts` |
   | `functions` | `modules/functions/src/store.ts:460` |
   | 记忆账本 | `packages/storage/src/adapters/memory-ledger.ts` |
   | 搜索索引 | `text-search-index.ts`（派生库，不符就重建） |
   | 插件库 | cognia、dataset、form、images、jelly、lingguang、pages、ppt、todo、workflows 各自的 `src/store.ts` |

3. 项目库 `projects/<id>/molis-work.db` 由多个 Module 的建库语句经 `catalog-migrations`、`project-migrations` 依次组成，最后做：
   - 各 Module 只交出当前 schema；
   - 宿主一次建库、写版本；
   - 删掉迁移链与 `tooling/migrations/`。
4. 真实 Home（用户选「保留并升级」；2026-10-03 起的现状：旧成果表已删、常驻服务 4173 已停，见 §1）：
   1. 整份备份 `~/.molis-work`（10-03 已单独备份 18 个项目库，见 §7；升级前仍要整份备份一次）；
   2. 确认 4207 没在跑、4173 仍停着（10-03 起它没有旧成果表已不能用）；
   3. 用删除迁移代码之前的最新 main 打开一次，让每个库升到最新（新成果表、过程项表在这一步建出）；
   4. 用新代码在临时目录建一个基线库，逐表比对两者的表、列、索引、约束与版本号；
   5. 一致后才合入删除迁移代码的 PR；
   6. 合入后用新代码打开真实 Home，确认版本相符、不被拒绝；
   7. 4173 换成新版（重新安装或指向新构建）再启动，由用户决定时机。

真实 Home 要先按用户的决定备份、升级或重建，才能删兼容代码（§4.1「真实 Home 的安全」）。

进度（10-04 夜至 10-05）：

| PR | 合入 | 内容 |
| --- | --- | --- |
| [#260](https://github.com/molis-ai/molis-work/pull/260)、[#261](https://github.com/molis-ai/molis-work/pull/261) | ffed8174、cadb7db9 | 项目库、目录库各一份当前 schema 加版本号，版本不符就拒绝（真实 Home 10-04 已按列名重建：项目库 v1、目录库 v20） |
| [#262](https://github.com/molis-ai/molis-work/pull/262) | 222b633c | 删 0.1.x 根 SDK，根包不再导出代码 |
| [#263](https://github.com/molis-ai/molis-work/pull/263) | df025f2a | 删治理旧提案三张表与只读投影 |
| [#264](https://github.com/molis-ai/molis-work/pull/264)、[#265](https://github.com/molis-ai/molis-work/pull/265) | 2a96bc37、0e903150 | 炼金术士工作室库、服务端库各一份当前 schema；删最后一个就地补列工具 |
| [#266](https://github.com/molis-ai/molis-work/pull/266)、[#267](https://github.com/molis-ai/molis-work/pull/267) | 9e4c5b92、ebb499e0 | 插件安装记录必带 generation 与 execution；记忆旁表与助理库 v2 |
| [#268](https://github.com/molis-ai/molis-work/pull/268) | b1a791ee | 删事件模型之前的旧历史（运行、领取、依据、评审等）连表带显示 |
| [#269](https://github.com/molis-ai/molis-work/pull/269)、[#274](https://github.com/molis-ai/molis-work/pull/274) | aab032d0、ef89d8e8 | MCP 只留一套工具（平台工具加授权动作）；打包发布用例改读 `goal_url_template` |
| [#270](https://github.com/molis-ai/molis-work/pull/270) | 7b946cfc | 已删功能的残留与被叫作 legacy 的现行路径 |
| [#271](https://github.com/molis-ai/molis-work/pull/271) | 2b1ad795 | （他人会话）工作事件挂到 Goal；完成以收尾为准 |
| [#272](https://github.com/molis-ai/molis-work/pull/272) | 7325a3a2 | Goals 存储去掉风险、合同修订与退役提案条目（项目库 v4） |
| [#273](https://github.com/molis-ai/molis-work/pull/273)、[#275](https://github.com/molis-ai/molis-work/pull/275) | 81592458、7ac6fc4a | 凭据只在连接表：模型、图片、TypeSafe（C1）；宿主连接器、Feed 固定来源、Gmail 安装与 Notion 旧槽（C2） |
| [#277](https://github.com/molis-ai/molis-work/pull/277) | 合入 | 会话表为唯一来源：面板与运行时绑定写会话，删读取时的复制（会话库 v7） |
| [#278](https://github.com/molis-ai/molis-work/pull/278) | 合入 | 判断方式四种、复审状态两种、规则只剩「需要用户验收」 |
| [#279](https://github.com/molis-ai/molis-work/pull/279) | 2a8fffcd | 场景绑定一套模型（Functions v2、项目库 v5、内置首页规则种子带 Inbox offer 键） |
| [#280](https://github.com/molis-ai/molis-work/pull/280)、[#281](https://github.com/molis-ai/molis-work/pull/281)、[#282](https://github.com/molis-ai/molis-work/pull/282) | 合入（99f778cd） | 宿主声明的工作入口改名；没人调用的兼容面；Form v2 与工作室零件类型 |
| [#283](https://github.com/molis-ai/molis-work/pull/283) | dd5d8c89 | 防回流门禁：源码兼容标记按文件计数只许减少（CI 里跑；当时 92 处、42 个文件） |
| [#284](https://github.com/molis-ai/molis-work/pull/284) | 4d5776af | 生成插件只走统一目录（工作室目录之前的能力与内联模型要求删除） |
| [#285](https://github.com/molis-ai/molis-work/pull/285) | 267a6f03 | 兼容标记清理 sweep D（92 → 53） |
| [#286](https://github.com/molis-ai/molis-work/pull/286) | 6e62652d | 浏览器夹具固定 zh-CN（Chrome 154 起英文优先系统让中文断言全挂） |
| [#287](https://github.com/molis-ai/molis-work/pull/287) | e1cd4906 | 一个项目身份：`board_id` 全仓改为 `project_id`（项目库 v6、Functions v3、目录库 v21）；batch Q 全量 3,678 个用例 3,670 过、7 跳过、1 败（已修） |
| [#288](https://github.com/molis-ai/molis-work/pull/288) | d81b12cb | Feed 的记录就是模块记录（删 toLegacy* 投影，兼容标记 53 → 20） |
| [#289](https://github.com/molis-ai/molis-work/pull/289) | 合入 | 最后几处名不副实的兼容标记（20 → 17，剩下的都是保留机制） |
| [#325](https://github.com/molis-ai/molis-work/pull/325)（分支 `fix/project-deletion-owners`） | 合入（真实 Home 维护四 10-08 已做） | 删除项目时各数据所有者一起清、可重试（§1 10-07）：删除收据里每个所有者一步（目录库新表 `project_deletion_steps`，目录库 v21 → v22）；各插件的项目数据由插件包自己声明（目录条目的 `project_data`：标签与清除函数），宿主遍历目录登记、不点名插件，所以新插件声明了就被清（结构门禁的「插件被包外点名」不增）；真实 Home 要先做维护四（下面），做之前这份代码打不开它 |

- 全量回归：batch K（C2 栈顶）3,685 个用例 3,674 过、4 败（均为 C2 预期变化或缺 #274，已修，重跑通过）；batch L（#277–#282 栈顶）3,680 个用例 3,659 过、13 败（11 个是本栈自己的用例仍用旧字段，已修；2 个是负载超时，单独重跑通过；受影响的 32 个用例在栈顶重跑全过）。
- batch M（#284 加 `board_id` 只改存储列的试做）3,679 个用例 3,656 过、16 败：6 个是 #284 自己的用例仍发内联 instructions（已修，#284 单独验证 192/192）；其余都来自「只改存储列」造成的行与记录字段错位，于是改为一次改完（§1）。
- sweep D（#285）已合 main（267a6f03），兼容标记 92 → 53。
- `board_id` 一次改完（分支 `refactor/project-id-everywhere`）：codemod 7,910 处 / 709 个文件，再手合并两个 id 同时出现的地方（§1 10-06 各条）；项目库 v6（含索引改名）、Functions v3、目录库 v21、会话库不变。batch O 全量 3,660 用例 3,316 过、330 败：大头是共用夹具（浏览器夹具把新建项目的库按固定示例 id 播种、目录库 SQL 只剩一个参数）、历史夹具仍标 v5、测试里原来分开写的 board 与 project 值；夹具与示例 id 修好后余下按文件并行修。
- 回归时发现与改名无关的环境变化：2026-10-05 装上的 Chrome 154 在英文优先的 macOS 上以英文请求页面，浏览器用例断言的中文界面全挂；干净的 main 上同样复现。浏览器夹具固定 `--lang=zh-CN`（[#286](https://github.com/molis-ai/molis-work/pull/286)）。
- 真实 Home 维护三演练（2026-10-07，拷贝 rehearsal-1007，基线取自改名分支的构建）：真实 Home 现为项目库 v1、Functions/Form/记忆/助理 v1、会话库 v6、目录库 v20，所以一次补齐 v1→v6 的整条链（v3、v4 的整理脚本、目标严格读取、场景绑定、改名）；27 个库 1,132,505 行搬完，外键 0、完整性 ok；26 个库的结构与当前基线逐项相同、版本对；18 个项目都能用新构建打开且 board 即项目 id；平台自己存的 JSON 键 `board_id` 改名 20,051 处；会话库 16 个面板会话、38 个绑定会话改来源，96 个 Goal 端点补上项目。演练检查时一次误开了真实 Home 的一个项目库（目录库里存的是绝对路径），版本不符被拒、文件未变，检查脚本已限制只开拷贝。
- 真实 Home 维护三已做（2026-10-07 19:22–19:40，用户弹窗定「改名 PR 合入后立刻做」）：
  1. 先停掉连着真实 Home 的旧 MCP（Claude Code、Codex、Grok 各会话的 goalboard-mcp，跑 9 月 23 日的安装版 0.2.0，会就地迁移数据库；用户弹窗定重装并停掉），按 pid 精确停止；
  2. 整份备份：APFS 克隆 `~/molis-work-backups/2026-10-07-before-maint3`（8.9 GB），160 个库与配置文件逐个比对一致；
  3. 用 main（e1cd4906）的干净构建重装 Home 安装版（installation.json 新摘要）；之后新起的 MCP 都是新代码，遇到旧版本的库只拒绝不写；
  4. 应用维护三（基线由 `gen-maint-schemas.mjs` 从同一构建生成，与两次演练用的逐字相同）：27 个库 1,132,511 行，外键 0、完整性 ok；被换下的原库在 `~/.molis-work/maintenance-3-replaced/`（权限 700）；`feed/secrets.json` 只按键名删了 8 个旧 Gmail 固定槽位条目（OAuth 应用的 client_id/secret 现行代码仍读，保留；`connector:feishu:auth_mode` 不在用户批准范围内，保留）；
  5. 工作室 5 个旧发布的零件类型改写（13 个界面文件里的 5 个），示例项目的工作室目录改名为项目 id；
  6. 只读核对：26 个库的结构与当前基线逐项相同、版本对、完整性 ok；18 个项目的 board 都以自己的项目 id 为键；目录库 18 个项目都在。
  7. Runtime 接入：三处客户端配置还是早先的 goalboard 条目（旧的 `GOALBOARD_*` 环境变量，新代码只认 `MOLIS_WORK_*`），新代码报「MCP 宿主没有提供 Runtime 标识」；用户弹窗定「备份后换成产品接入」：三份配置与三个 goal-advance 链接、三张 9 月 11 日的旧接入收据备份到 `~/molis-work-backups/2026-10-07-runtime-configs/`，删掉旧条目后用产品自己的 Runtime 接入（prepare→confirm）给 Claude Code、Codex、Grok Build 写入 `molis-work` 条目与技能；按配置启动的 MCP 能列出真实 Home 的项目。已开着的会话要重开才会用上。
  8. 主检出：另一会话 10-07 8:59–9:27 留下的 26 个文件改动与两个新 spec（用户弹窗定「本会话处理」）先存成补丁并提交到本地分支 `wip/main-checkout-2026-10-07`（4cb5e28f），主检出 fast-forward 到 main（d81b12cb）后把它重新放回为未提交改动（按改名三方合并，`boardId` 改为 `projectId`），构建通过，它改过的 16 个测试文件 73/73 通过。
- 演练（rehearsal-1007、rehearsal-1007b，拷贝只读取自真实 Home）：两次结果相同；演练检查时一次误开了真实 Home 的一个项目库（目录库存的是绝对路径），版本不符被拒、文件未变，检查脚本已限定只开拷贝。
- 真实 Home 维护四已做（2026-10-09 09:30–10:10，用户 10-08 弹窗定「合入后立刻做」、孤儿数据与残留「一起清掉」、助理旧轮次「补上标记」；主检出改动用户定「都合回主检出」）：
  1. 主检出：另一代理留下的 26 个文件改动（goal-closure-identity 修复）先移植到当前 main 并评审、全量回归（batch U）后经 #340 合入；原样另存本地分支 `wip/main-checkout-2026-10-09`（079898fa，含未跟踪的 spec）；主检出改回已提交状态后 fast-forward 到 main（53b62b0f）并整体构建；其余未跟踪文件（`.grok/`、两份 `docs/reviews/`、`plugins/native/jelly/native/`、`specs/ai-interaction-experience/`）原样保留；
  2. 停掉连着真实 Home 的 7 个 MCP 进程（Claude Code、Codex、Grok 各会话，跑维护三装的构建），按 pid 精确停止；4173、4207、4208 都没在跑；之后 Home 下没有任何打开的文件；
  3. 整份备份：APFS 克隆 `~/molis-work-backups/2026-10-09-before-maint4`（10 GB，1,331,146 个文件，库与 JSON 逐个比对一致）；
  4. 只读清点真实 Home，与拷贝上的演练逐项相同：孤儿只有一个（9 月 27 日删掉的项目，`functions.function_judgments` 64 条），另有 5 条从没建成项目的开项目引导；
  5. 目录库 v21 → v22（`catalog-maintenance-v22.sql`，一个事务）：结构与新建的 v22 逐项相同，原有 17 张表行数不变，完整性 ok，外键 0；
  6. 用新代码打开：18 个项目、会话库与 17 个 Home 库都能开、版本都对（检查脚本按真实路径比对，`~/.goalboard` 是指向 Home 的符号链接）；
  7. 清孤儿：用产品自己的删项目逐主人清，只有 Functions 删了 64 条；记忆与搜索按演练的办法手工核对，都是 0；17 个在用项目格子、2,827 行前后不变；
  8. 残留（脚本先列后删）：5 条停在「选择」阶段、项目从没建成的开项目引导；15 个项目目录里改名前留下的 `goalboard.db-wal/-shm`（30 个文件，21 MB）；Home 根目录两个空库文件；完成了的那条引导保留；
  9. 助理库里没有已存轮次，补标记无事可做（脚本干跑为 0）；
  10. 用主检出的干净构建重装 Home 安装版（`releases/molis-work-0.2.0`，即 53b62b0f）；按会话的方式起安装版 MCP，能列出 18 个项目；
  11. 按 10-08「核对后清理」：`maintenance-3-replaced`（1.9 GB）搬到 `~/molis-work-backups/2026-10-07-maintenance-3-replaced`；11 个旧的 `goalboard-*` 安装版核对无引用、无打开、整份备份里有后删除；Home 从 10 GB 减到 6.5 GB；
  12. 用户要做的：重开 Claude Code、Codex、Grok 会话（旧 MCP 已停，新起的才是新构建）。
- ~~真实 Home 维护四（目录库 v21 → v22）~~：见上一条，已做。原计划：真实 Home 维护四（目录库 v21 → v22）——**用户 2026-10-08 批准：合入后立刻做，顺带清掉以前删项目留下的孤儿数据**（§1）；做完之前主检出与安装版不更新。分支 `fix/project-deletion-owners` 给目录库加了一张表 `project_deletion_steps`（删除收据里每个数据所有者一步，`modules/projects/src/deletion-steps.ts:7`），`CATALOG_SCHEMA_VERSION` 因此从 21 升到 22（`apps/local-host/src/project-catalog-contract.ts:1`）。别的库的结构与版本都没变（项目库 v6、会话库 v7、Functions v3……）。真实 Home 的目录库是 v21（维护三之后），所以这个分支合入后它与代码对不上，两个方向都要处理：
  - **跑新代码的进程拒绝 v21**，什么都不写：`catalog.unsupported_schema`「项目目录数据库的版本是 21，这个版本只认 22，不就地升级」（`apps/local-host/src/catalog-schema.ts:32-42`）。主检出快进到新 main 并构建之后，4207 和主检出的命令行就打不开真实 Home；Home 安装版换成新 main 的构建后，新起的 MCP 也一样；都要等做完维护四；
  - **做完以后跑旧代码的进程拒绝 v22**：维护三用 e1cd4906 重装的 Home 安装版只认 21，遇到 v22 报 `catalog.reader_too_old`（`apps/local-host/src/project-catalog-contract.ts:51-68`），要用新 main 的干净构建重装；已开着的会话里的 MCP 同样报它，要重开会话（`docs/installation.md:76` 同一段说明）。
  - **做什么**：对 `projects/catalog.db` 跑 `tests/fixtures/catalog-maintenance-v22.sql`，一个事务：新建 `project_deletion_steps`，把 `catalog_meta.schema_version` 由 21 改为 22。库不是项目目录库、版本不是 21、表已存在，整个脚本回滚，什么都不改（用 `node:sqlite` 的 `exec` 或 `sqlite3 -bail` 跑，遇到第一个错就停；不加 `-bail` 的 sqlite3 出错后会接着往下跑并提交：在版本 20 的库上它建出了表、版本没动，试过）。
  - **旧回执**：新表是空的。此前删除项目留下的回执没有步骤（「早于所有者步骤的回执」），宿主不替它们补跑：它们的 `owner_steps` 为空、`cleanup_state` 不变（还没收尾的旧回执，宿主启动时只收尾暂存目录，没有步骤可跑）；固定 id 的示例项目再创建前，由各所有者先清一遍（`apps/local-host/src/demo-project-lifecycle.ts:47-49`，用例 `tests/project-deletion-hooks.test.ts` 的 “a fixed-id demo whose earlier deletion has no owner steps”）。旧删除留在各所有者库里的数据不在这次维护范围；要清，另起一项。
  - **演练**（2026-10-08，临时目录，没有打开真实 Home）：① `tests/catalog-maintenance-v22.test.ts`（5 个用例）：v21 目录库被拒且不被改动；脚本跑完与新建 Home 的 v22 目录库逐项相同（表、列、索引、外键、CHECK、`catalog_meta`）、项目与回执不变、`integrity_check` ok、外键 0；维护后的目录库能打开，旧回执步骤为空（没收尾的那张由宿主收尾）、示例项目能重建、新删除记步骤；版本不是 21、owner 不对、表已被占用都整个回滚；只认 21 的构建对 v22 报 `reader_too_old`。该文件和 SQL 在维护四做完后删除（目录库再变时它会先失败）：2026-10-09 随维护五的收尾一起删了，要用从 Git 历史取（`git show bccdcee17:tests/fixtures/catalog-maintenance-v22.sql`）。② 另用 origin/main（4d59cd4d）的干净构建写出 v21 目录库（一个保留的项目、一个删除的项目、建了又删的示例项目），取 SQLite 备份 API 的拷贝跑同一份脚本：`integrity_check` ok、外键 0、只多 `project_deletion_steps` 一张表、其余表结构不变、与新 Home 的 v22 目录库逐项相同、项目 1 个、回执 2 个都在；新构建能打开并列出两张回执（步骤 0，状态仍完成）；再跑一遍被拒（`catalog_meta.schema_version is 21`）；原构建（只认 21）报 `catalog.reader_too_old: schema=22，当前 reader 支持 1..21`。
  - **步骤**（按维护三的做法，对着 [发布前检查清单](../../docs/releases/CHECKLIST.md) 第 4 节逐项过）：1. 用户批准并定时机（弹窗）；2. 停掉连着真实 Home 的进程（4207、4208、4173、各会话的 MCP），按 pid 精确停；3. 动手前只读核对目录库确是 v21，整份备份（APFS 克隆 `~/molis-work-backups/<日期>-before-maint4`，逐个比对）；4. 在 `catalog.db` 的拷贝（SQLite 备份 API，不用 cp）上先演一遍，只开拷贝里的目录库文件，不用产品代码去打开项目——目录库存的是项目库的绝对路径，维护三演练时误开过真实项目库；5. 对真实 Home 的 `projects/catalog.db` 跑脚本（就地改，不换文件，所以没有被换下的原库要搬走；要退回就用第 3 步的整份备份）；6. 用新 main 的干净构建重装 Home 安装版（装过桌面端 App 的话，它也是只认 21 的构建，要用就一并重装），主检出快进并构建（§1 10-07「维护后真实 Home 用哪份代码」）；7. 只读核对：版本 22、`project_deletion_steps` 在且为空、项目数与回执数同维护前、新构建能列出项目。
- 真实 Home 维护五（实验私有库、炼金术士搜索库盖版本 1，W2-05）——**已做（2026-10-09，经 #346 合入后；记录见本条末尾「做了什么」）。** **用户 2026-10-08 的决定 #21（§1「真实 Home 的残留物」一行）：在拷贝上演练后标 v1；真库的盖章等协调会话的维护窗口，动手前照例先问用户。** 分支 `refactor/version-unversioned-stores`（#346）给这两个库各加了一份基线，版本 1（`EXPERIMENTS_PRIVATE_BASELINE`、`ALCHEMIST_SEARCH_BASELINE`）；新建的文件带版本，有表没有版本的旧文件新构建拒绝（`storage.schema_version_mismatch`，只影响 Experiments 或该项目的炼金术士搜索，宿主启动不受影响）。旧构建不看这个版本，所以**先盖、后升级**：盖章可以在这个分支合入之前做，之后装新构建就不会撞上。
  - **真实 Home 现状**（2026-10-09 只读核对：文件元数据加一次 `immutable=1` 的备份拷贝，没有打开真库）：`plugins/experiments/private.sqlite` 一个，版本 0，12288 字节，表 `plugin_private_values` 一行（`io.molis.work.experiments` / `experiments.v1`，36 字符），`-wal` 0 字节，没有进程持有它，4173、4207、4208 没有监听；`alchemist/projects/` 下有一个项目目录但没有 `search.sqlite`，所以这次真库只盖 Experiments 这一个，炼金术士搜索库的脚本留给将来有这种文件的 Home。
  - **工具**（原在 `tests/fixtures/`，做完维护后和 `tests/store-version-maintenance.test.ts` 一起删了；要用从 Git 历史取，`git show bccdcee17:<路径>`）：`store-maintenance-experiments-private-v1.sql` 与 `store-maintenance-alchemist-search-v1.sql`（一个事务，具名 CHECK 做前提：未盖版本、只有基线那一张表、列与顺序一致、没有多余的索引、外键、CHECK、视图、触发器；只写 `PRAGMA user_version = 1`）；`store-maintenance-run.sh <home> [--apply <备份目录> [--maintenance-window]]`（默认是演练：先查没有进程持有这些库、真 Home 的 4173/4207/4208 无人监听、`-wal` 为空，再用 `immutable=1` 的备份 API 把库拷到一份 Home 形的临时目录，在拷贝上跑 SQL，核对版本 1、`integrity_check` ok、表结构与行不变；`--apply` 先整份备份 Home（macOS 上是 APFS 克隆，备份目录必须在 Home 之外且不存在）并逐库比对，再在真库上跑同一份 SQL 并同样核对；已是版本 1 的库跳过，没有要盖的库就不备份；真 Home 不带 `--maintenance-window` 一律拒绝）；`store-maintenance-verify-open.mjs <拷贝>`（用本仓库的构建像产品启动那样打开这两种库；拒绝真 Home）。
  - **演练**（2026-10-09）：① `tests/store-version-maintenance.test.ts` 25 个用例，其中 4 个跑这几个脚本：在临时 Home（一个 Experiments 库加 `project-a%2Eb`、`project-plain` 两个搜索库，都是旧构建留下的无版本状态）上演练，Home 的任何文件都不变、拷贝全部盖到 1 且内容不变、构建能打开拷贝而拒绝原 Home；`--apply` 的备份与原 Home 逐文件相同、盖完内容不变、再跑一次不做备份；备份在 Home 里面或已存在、某个库版本是 2、真 Home 不带窗口参数、有进程持有库、`-wal` 非空，都在写任何东西之前停。演练用的 Home 放在名字带中文和空格的目录下（`<临时目录>/odd/家 home`）、用 `/bin/bash`（macOS 上是 3.2）跑脚本。故意改坏脚本（路径不转义、字节不掩码、备份路径不规范化、去掉 `-wal` 检查、去掉持有检查、去掉窗口参数检查）各让对应用例失败。② 路径转义是评审发现的：炼金术士把项目 id `a.b` 写成目录 `a%2Eb`，早先的脚本把路径原样拼进 `file:...?immutable=1`，`%2E` 被当成 `.` 解码而打不开（失败即停、没有损害；真库没有这种文件）；现在路径按字节百分号转义，演练用例里就有这样的目录。第二个评审发现是转义本身：macOS 的 `/bin/bash` 3.2 里 `printf '%%%02X' "'$c"` 把 0x80 以上的字节当有符号数，`家` 的三个字节会打成 `%FFFFFFFFFFFFFFE5…`，名字里有中文的用户目录或 Home 路径下脚本打不开库（失败即停，演练与 `--apply` 都在备份和写入之前停，库留在版本 0；真实 Home 路径是 ASCII，不受影响）；现在字节先掩到 0–255（`& 255`），演练用例的 Home 放在 `odd/家 home` 下，撤掉掩码两个跑脚本的用例（演练、`--apply`）和第三个用例（拒绝路径）会失败，错误就是上面那种 `unable to open database "file:…%FFFFFFFFFFFFFFE5…"`。③ 真库的拷贝：对 `~/.molis-work` 跑了脚本的演练（只读，拷贝放在会话临时目录）：1 个库，盖章后版本 1、`integrity_check` ok、结构与行不变；用本分支的构建打开未盖的拷贝，报 `storage.schema_version_mismatch`，打开盖过的拷贝能读出那一行；真库文件的大小和修改时间演练前后一致。评审修好脚本后（2026-10-09）又做了一遍：用 `sqlite3 "file:~/.molis-work/plugins/experiments/private.sqlite?immutable=1" ".backup <会话临时目录>/…/private.sqlite"` 取得拷贝（只读，没有 `-shm`、`-wal` 被碰），对拷贝用 `/bin/bash` 跑演练（`stores found: 1`、`REHEARSAL OK`、版本 1、`integrity_check` ok、表结构与行不变）；再对拷贝的副本跑 `--apply`（备份与未盖的拷贝逐字节相同，盖完核对通过，第二次 `--apply` 什么都不做）；用本分支的构建打开盖过的副本得到 `"user_version":1` 和那一行，打开未盖的副本报 `storage.schema_version_mismatch`（退出码 1）；真库的 `private.sqlite`、`-shm`、`-wal` 三个文件大小、修改时间、inode 演练前后一致，没有进程持有它们，4173/4207/4208 无人监听。真库里没有 `search.sqlite`（`alchemist/projects/` 下那个项目目录只有 `studio.sqlite`），所以搜索库只能靠合成的库演练。
  - **窗口步骤**（对着 [发布前检查清单](../../docs/releases/CHECKLIST.md) 第 4 节；在含这些文件的检出里做，分支或合入后的 main 都行）：0. 用户批准并定时机（弹窗）。1. 停掉连着真实 Home 的进程（4173、4207、4208、各会话的 MCP），按 pid 精确停；脚本也会拦：文件有人持有、端口有人监听就停。2. `pnpm build`。3. 再演一遍：`KEEP=1 TMPDIR=<临时目录> bash tests/fixtures/store-maintenance-run.sh ~/.molis-work`，期望 `stores found: 1` 和 `REHEARSAL OK`；再 `node tests/fixtures/store-maintenance-verify-open.mjs <它打印的 scratch home>`，期望 experiments 一行带 `"user_version":1` 和那一行数据，退出码 0；用完删掉那份临时目录（里面是 Home 的数据）。4. 盖章：`bash tests/fixtures/store-maintenance-run.sh ~/.molis-work --apply ~/molis-work-backups/<日期>-before-maint5 --maintenance-window`，期望 `STAMPED` 和一行 `verified`。5. 只读复核：`sqlite3 "file:$HOME/.molis-work/plugins/experiments/private.sqlite?immutable=1" "PRAGMA user_version"` 为 1。6. 装新构建（Home 安装版、主检出），打开一次 Experiments；备份保留到用户验收。7. 退回：`sqlite3 ~/.molis-work/plugins/experiments/private.sqlite "PRAGMA user_version = 0"`（旧构建不看版本），或从第 4 步的备份恢复。8. 做完后删 `tests/fixtures/store-maintenance-*` 四个文件和 `tests/store-version-maintenance.test.ts`，把 CHECKLIST 第 3 节、CHANGELOG 里的「要先维护」改成「已做」。
  - **做了什么**（2026-10-09，用户当天弹窗定「现在就做」）：在 origin/main（`3f7b181f`，含 #346）的干净工作树里 `pnpm build`。4173、4207、4208 无人监听；连着真实 Home 的只有各会话的 MCP 服务（安装版 0.2.0 的 `molis-work-mcp`，持有 memory、search、placement、agent-definitions 几个库，不持有实验库，旧构建也不看这个版本），没有停它们。第 3 步再演一遍：`stores found: 1`、`REHEARSAL OK`，用新构建打开盖过的拷贝得到 `"user_version":1` 和那一行（`install_id` `io.molis.work.experiments`、`item_key` `experiments.v1`、长 36），用完删掉拷贝。第 4 步第一次 `--apply` 时磁盘满（当时 8 个 B 批工作树在并行构建，可用空间不到 10 GB；Home 有 1,269,849 个文件，整份 APFS 克隆要的元数据就占满了），`cp -c -R` 报 `clonefile failed: No space left on device`，脚本在备份那一步停下、没有碰真库（只读复核版本仍是 0、`integrity_check` ok、1 行）；那份不完整的备份 `~/molis-work-backups/2026-10-09-before-maint5` 留着（删它被权限挡下，留给用户删）。清掉本会话 67 个已合并、干净、无人使用的工作树（腾出约 40 GB）后重跑：备份 `~/molis-work-backups/2026-10-09-before-maint5-r2`（库与原件逐字节相同），`verified …private.sqlite: user_version=1, integrity_check ok, schema and rows unchanged (dump ed621923be40)`、`STAMPED`。第 5 步只读复核：`PRAGMA user_version` 为 1，`integrity_check` ok，1 行。第 6 步（装新构建、打开一次 Experiments）随 B 批合入后的主检出快进一起做；在那之前主检出与安装版仍是旧构建，旧构建不看这个版本，照常能用。第 8 步：本 PR 删了四个工具和演练用例，CHECKLIST 与 CHANGELOG 改成「已做」。
  - **全量回归（路线图 W2-05 行要求）**：已做：第 2 波 A 批 16 片合成的集成分支 `integration/wave2-1009`（含本切片）2026-10-09 全量 5,027 个用例，5,018 通过、0 失败、9 跳过，之后经 #346 合入。原先的记录：本切片跑了 `apps/local-host` README 的必跑清单（评审在拷贝里重跑 132/132 通过）、实验、炼金术士宿主、搜索依据运行时与 Feed 的相关用例（51 个，其中 `studio HTTP` 一个在整批并发下超时、单独跑通过）和本切片自己的用例；按分工不跑全量，留给协调会话的集成窗口。全量跑过之前这一切片不算完成。
- 真实 Home 维护六（项目库 v6 → v7，删 Casebook 的 5 张表；移出 `plugins/experiments`，并报告实验插件在别处的残留行）——**数据、重装及新构建打开/逐库核对已做，只剩用户重开旧会话（10-11 的后续结果见本条末尾；以下保留 2026-10-10 当时记录：18 个项目库已是 v7、实验插件目录已移出、残留行已清、Home 安装版已重装（计划步骤 7）、新构建的安装版 MCP 列出 18 个项目；新构建打开 v7 项目库那一项（计划步骤 8 的后半）没做，待办 BL-126，见本条末尾「做了什么」；Sessions 库里旧版删项目留下的 1 个空会话已于 10-10 按授权删除，不属于维护六，结果见末尾）。** 用户 2026-10-10 的决定（§1「删掉 Casebook 与实验插件后真实 Home 的数据」）：删除 PR 合入后立刻维护，做完之前主检出与安装版不更新。分支 `chore/delete-casebook` 删掉 Casebook 的全部代码（宿主子系统、`/casebook/v1/` 通道、5 个 typed 能力、对外合同与参考客户端、`config/casebook.json` 的读取、`LocalHost` 的 observation 钩子），项目库的 `PROJECT_DATABASE_BASELINE` 因此从 6 升到 7（`apps/local-host/src/project-database-schema.ts`）：v7 是 v6 去掉 `casebook_interaction_scopes`、`casebook_interaction_facts`、`casebook_goal_contexts`、`casebook_interaction_audit_keys`、`casebook_interaction_actions`，别的表、索引、外键都没变（这 5 张表没有显式索引，也没有外键进出）。分支 `chore/delete-experiments` 删掉实验插件（`plugins/native/experiments`、宿主里的接线与私有库打开代码、Python 工作进程、手册、目录条目与测试）；真实 Home 里留下 `plugins/experiments/`（私有库，维护五盖过版本 1）和这个插件在别处的残留行。两个分支都合入后才做，三件事在同一个维护窗口里一次做完，下面的描述就是维护六的全部。
  - **跑新代码的进程拒绝 v6**，什么都不写：`storage.schema_version_mismatch`「…的结构版本是 6，这个版本的 Molis Work 只认 7；不就地升级」；恢复（`LocalProjectDatabase(path, { existingOnly: true })`）报 `project_recovery_unsupported_schema`。主检出快进到新 main 并构建之后，4207 和主检出的命令行打不开真实 Home 的项目；Home 安装版换成新 main 的构建后，新起的 MCP 也一样；都要等做完维护六的数据部分（本机已按这个顺序做完，见「做了什么」）。
  - **做完以后跑旧代码的进程拒绝 v7**：Home 安装版（只认 6）遇到 v7 报同一个 `storage.schema_version_mismatch`，要用新 main 的干净构建重装；已开着的会话里的 MCP 同样，要重开会话。本机的安装版 2026-10-10 已重装；重装之前起的 MCP 进程跑的仍是重装前的代码，要重连或重开会话才换成新的。
  - **做什么（一）项目库 v6 → v7**：对 `projects/<id>/molis-work.db` 逐个跑 `tests/fixtures/project-maintenance-v7.sql`（目录库列出的每个项目含个人空间，再加磁盘上有、目录库没列出的项目库，先查），一库一个事务：具名 CHECK 做前提（`user_version` 是 6、表正好是 v6 的 78 张、Casebook 的 5 张表的 23 个列对、没有视图和触发器），删 5 张表，`PRAGMA user_version = 7`；前提不成立整个脚本回滚，什么都不改（用 `node:sqlite` 的 `exec` 或 `sqlite3 -bail` 跑；不加 `-bail` 的 sqlite3 出错后会接着往下跑并提交）。没有 `VACUUM`（不能在事务里；释放的页留在文件里无害）。
  - **做什么（二）移出实验插件的目录**：把 `{home}/plugins/experiments/`（`private.sqlite` 与 `-wal`、`-shm`，里面是实验和多模型对比结果）整个搬到 `~/molis-work-backups/<日期>-removed-experiments/`，不直接删；`{home}/plugins/` 空了就一并移除；记下搬走的文件和大小。新构建不读也不重建这个目录。
  - **做什么（三）实验插件在别处的残留行：只读数、报告，经用户同意再清**（决定里点名的只有（二）的目录，下面是同一个插件留下的东西；在备份拷贝上数，不碰真库）：`connectors/connectors.db` 的 `connector_bindings` 里 `scope_id = 'home' AND plugin_id = 'experiments' AND slot_id = 'typesafe'`（连接本身留着，Functions 在用）；`projects/catalog.db` 的 `project_plugins`、`project_plugin_exclusions` 里 `plugin_id = 'experiments'`（项目隐藏过它）；`projects/catalog.db` 的 `project_events` 里 payload 的 `plugin_id` 是 `experiments` 的添加与移除事件（只读数时发现的，计划里原先没有）；`config/mcp-tools.json` 里属于实验提供方的 `action_grants`（`experiments.list`、`experiments.results`、`experiments.search.entries`、`experiments.subject.read` 对 MCP 可见过）；`workflows/workflows.db` 里动作是 `experiments.*` 的步骤（只报告，不改写，那个步骤以后会解析失败）；助理库与放置库（`placement/placement.db` 的 `context_edges`）里主体类型是 `experiment` 的关联，以及助理能力设置里点名 `experiments.*` 的项；`search/search.db` 是派生库，若其中来源是实验的条目没有随启动被丢掉，就重建它。`logs/action-calls.jsonl` 里的旧行是历史，留着。
  - **会丢的数据**：这 5 张表里的交互事实、审计密钥（每个项目一条）、操作回执，用户的决定里就是删；整份备份里还在。实验插件的目录不删，搬进备份目录；残留行经用户同意才清。
  - **残留的 `config/casebook.json`**：不再被任何代码读取，里面是服务端 Bearer 令牌和用户动作签名密钥，按密钥对待。窗口里问用户：搬进备份目录并从 Home 删掉（推荐），或留着。
  - **演练**：`tests/project-maintenance-v7.test.ts`（6 个用例）：这个构建是 v7，v6 的项目库被构建和恢复拒绝且不被改动；脚本跑完与新建的 v7 项目库逐项相同（表、列、索引、外键、CHECK、全部对象）、其余 73 张表的每一行不变、5 张表连同行没了、`integrity_check` ok、外键 0；v7 的构建能打开它，也能经恢复入口打开，维护前写下的 Goal 与便笺还在；版本是 5 或 7、多一张表、少一张 Casebook 表、少一张别的表、一张别的表换了名字或被另一个名字的表顶替（表数仍是 78，只有名单能识破）、Casebook 表多一列或改了列名、有视图、有触发器、根本不是项目库，都整个回滚（表、行、版本都与跑之前相同）——这些拒绝都在第一条语句就失败，那时什么还没改；所以另有一个用例在 `COMMIT` 之前、5 张表已删且版本已改成 7 之后注入一条必然失败的语句，断言版本回到 6、5 张表连同行回来、整个快照与跑之前相同，事务只要少了就过不了；再跑一遍被拒（版本已是 7）；只认 6 的构建对 v7 报 `SqliteSchemaVersionError`。故意改坏脚本（少删一张表、不改版本、去掉表集合检查——整个去掉，或只去掉其中的表名清单、只剩 78 的计数——`COMMIT` 换成 `ROLLBACK`、去掉 `BEGIN IMMEDIATE` 与 `COMMIT`）各让对应用例失败；脚本也用系统的 `sqlite3 -bail`（3.51.0）在一份 v6 基线库上跑过，第二遍按预期报 `user_version is 6`。这份文件和 SQL 在维护六做完后删除（项目库再变时它会先失败），要用从 Git 历史取。
  - **实验插件部分的核对**：（二）（三）没有入库的脚本（做的时候是会话里的一次性脚本，输入、输出与语句记在「做了什么」），先在备份拷贝上只读数，再对真库做；清完以后要用新构建打开一次拷贝（10-10 当时未做，10-11 已补新构建打开与逐库核对；真实数据拷贝的工作台界面未实操，见后续记录和 BL-126），期望工作台和插件切换器里没有「实验」，浏览器里存过的 `experiments` 页签或固定项不会让工作台报错（在隔离 Home 里验过：工作台正常打开，旧页签留在标签栏里，关掉即可；页签与固定项存在各浏览器的 `localStorage` 里，不属于 Home，不用处理）。核对 `config/mcp-tools.json` 的授权条数时，期望值要扣掉被清掉的实验授权条数。
  - **步骤**（对着 [发布前检查清单](../../docs/releases/CHECKLIST.md) 第 4 节逐项过）：1. 用户批准并定时机（弹窗，沿用「合入后立刻」）；2. 停掉连着真实 Home 的进程（4207、4208、4173、各会话的 MCP），按 pid 精确停；3. 动手前只读核对每个项目库确是 v6，整份备份（APFS 克隆 `~/molis-work-backups/<日期>-before-maint6`，逐个比对）；4. 在项目库的拷贝（SQLite 备份 API，不用 cp）上先演一遍，只开拷贝，不用产品代码去打开项目——目录库存的是项目库的绝对路径；5. 对真实 Home 每个项目库跑脚本（就地改，不换文件；要退回就用第 3 步的备份）；6. 做上面（二）（三）：移出 `plugins/experiments`，在备份拷贝上只读数残留行并报告，经用户同意再清；7. 用新 main 的干净构建重装 Home 安装版，主检出快进并构建；8. 只读核对：每个项目库版本 7、`integrity_check` ok、没有 `casebook_` 表、Goal 数同维护前、新构建能列出项目，Home 里没有 `plugins/experiments/`；9. 做完后删这两份工具，把 CHECKLIST 第 4.3 节与 CHANGELOG 里的「要先维护」改成「已做」。
  - **全量回归**：已做，B 批与两个删除合成的 `integration/wave2b-1010` 全量 5,142 个用例，5,132 通过、9 跳过、1 失败（删实验插件漏改的一条断言，已在 #370 修好）；`chore/delete-casebook` 只跑它改到的包的必跑清单和引用过 Casebook 的用例。
  - **做了什么**（2026-10-10，#369、#370 合入后，用户批准的窗口）：4173、4207、4208 无人监听；停掉 9 个会话的旧版 MCP（按进程号，安装版 0.2.0）后，有两个会话立刻自动重连起了新的 MCP，没有再停（它们只开记忆、搜索、放置、Agent 定义这几个库，与本次维护无关；每一步脚本动手前都用 `lsof` 查目标文件没有进程持有，有就停下）。整份 APFS 克隆备份 `~/molis-work-backups/2026-10-10-before-maint6`（18 个项目库、目录库、连接库、实验库与原件逐字节相同）。（一）18 个项目库全是 v6、各有 Casebook 的 5 张表、表里 0 行；先在只读拷贝上演练（`VACUUM INTO` 取得拷贝，跑同一份 SQL，第二遍什么都不做），再对真库跑：18 个都到 7，各 73 张表，`integrity_check` ok，其余每张表的行数不变。（二）`plugins/experiments/`（`private.sqlite` 12 KB 与 `-shm`、`-wal`）整个移到 `~/molis-work-backups/2026-10-10-removed-experiments/experiments`（目录权限 700），`plugins/` 空了一并移除。（三）残留行只读数：连接绑定 1（实验插件对 TypeSafe 连接的绑定，连接本身留着）、项目隐藏记录 1、项目事件 3（9 月 23 日的添加与移除）；工作流、助理、放置、MCP 授权里都没有。用户定「连历史事件一起清」，按条数精确删除（语句与保护见下面「脚本」），外键与完整性检查通过。`config/casebook.json` 在这个 Home 里本来就没有。只读复核：18 个项目库 v7、无 Casebook 表；Home 里没有 `plugins/experiments`；残留行 0；目录库 v22、连接库完整、6 个连接都在。**步骤 7–8（同日，协调会话）**：Home 安装版用 origin/main 的干净构建（`72137e89a`，#371 的合并提交）重装：`node dist/cli/main.js install --source .`，输出「同版本内容已刷新 0.2.0」（版本号仍是 0.2.0，程序与 Skill 换成这个构建的内容）；主检出同步到同一个提交并构建。核对（只记看到的）：用 Claude Code 启动 MCP 时的运行环境起安装版的 MCP，调用 `molis_work_v1_context_list_projects`，它列出 18 个项目，与维护前的项目数一致。这个工具只读目录库（`projects/catalog.db`，v22；`apps/mcp/src/runtime-context-tools.ts` 的 `listRuntimeProjects` → `catalog.listProjects()`），不打开任何项目库，所以这一条只说明新构建的安装版起得来、读得出目录库，**不说明它能打开 v7 的项目库**：新构建还没有打开过任何一个 v7 项目库（项目库只在会话绑定项目之后才由宿主打开，`apps/local-host/src/mcp-server.ts` 的 `currentActions` → `actionClient(reference)`，启动与列出项目都不开；拒绝 v6 的 `storage.schema_version_mismatch` 也只在打开项目库时才会出现，所以没报错不能当证据），计划步骤 8 里「新构建打开项目库、Goal 数同维护前」这一半没有做，列出项目那一半做了。各库 v7、无 Casebook 表、`integrity_check` ok、其余表行数不变，是维护当时用 SQLite 对真库逐库核对的（见上），不是新构建打开后核对的；重装只写发布目录、启动脚本和安装清单，不碰库（`apps/local-host/src/installer/home.ts`），但重装之后没有重新逐库核对。运行中的 MCP 会写各自的记忆、搜索、放置库，那几个库不在这次核对里。要补这一半，在安装版里绑定一个项目并读它的 Goal 数（或在拷贝上用新构建打开一次），做完在这里补一行并删 BL-126。重装之前起的 MCP 进程（包括窗口里自动重连起的那两个）跑的仍是只认 v6 的旧代码，要重连或重开会话才换成新的。这两件事是维护六还欠的收尾，记在 `specs/BACKLOG.md` 的 BL-126（负责人：动真实 Home 的协调会话）；CHECKLIST 第 4.3 节的「做完核对」据此拆成两项：重装与列项目打勾，新构建打开 v7 项目库与重连旧会话不打勾。 **另：Sessions 残留**（不是维护六的一部分；**2026-10-10 已删**）：W2-07（#361）之前删掉的项目在 `sessions/sessions.db` 里留下的会话，按 §1 2026-10-08 的做法（先列出、再在真库上删）处理，用户 2026-10-10 再定「先列后删」（在备份拷贝上列出，用户看过清单同意后才删），所以没有新增 §1 一行。**列出的结果**（整理这份记录时只读核对，对象是维护六之前的整份备份 `~/molis-work-backups/2026-10-10-before-maint6`，取其中 `sessions/sessions.db` 与 `projects/catalog.db` 的 `VACUUM INTO` 拷贝放在 `/private/tmp` 下，跑 `05-sessions-orphans` 的列出模式，没有打开真实 Home）：Session 共 56 个，孤儿 1 个——项目 `project-0478192a`（9 月 27 日删掉的那个，维护四清过它在判断规则库里的 64 条）名下的 Session `session-ce4bcc84…`，2026-09-27 创建，标题为空、状态 active，0 个事件、0 条消息、0 个交接，关联边 1 条。这是备份当时的状态，不说明真库现在的样子。**删除**（2026-10-10，用户看过上面的清单后弹窗定「删掉」）：用产品自己的那一步，也就是删项目时 Sessions 这个所有者的 `purgeSessionsProject`（`modules/private-work-context/src/project-data.ts`）配宿主的 Session 账本，不另写 SQL。先在拷贝上演练：第一次删完仍报 1 个孤儿，原因在列出语句——关联账本只追加，同一条关联的旧 `revision` 也被算了进去；改成只看每条关联的最新 `revision` 之后，拷贝上 56 → 55、孤儿 0。真库上：`lsof` 查过 `sessions/sessions.db` 与 `-wal` 没有进程打开（脚本删除前再查一次）；只读列出与拷贝一致（56 个，孤儿 1 个，`project-0478192a` 名下 1 个）；`05-sessions-orphans ~/.molis-work --real --apply --expect project-0478192a-…:1` 删除后 Session 55 个、孤儿 0，退出码 0，只读打开跑 `PRAGMA integrity_check` 为 ok。能退回的备份是 `~/molis-work-backups/2026-10-10-before-maint6`（含这个 Session），没有为这一步另做备份。 **脚本**（会话临时目录 `maint6/`，没有入库；按检查清单第 4.3 节的第二种办法，输入、输出和语句记在这里，包括 Sessions 残留用的 `05-sessions-orphans`）：维护 SQL（`project-maintenance-v7.sql`）与演练用例随 #371 删除，从 Git 历史 `9fba2db43`（#370 的合并提交）取。每个脚本默认只读、只列出要做什么；真实 Home 要同时给 `--real` 和环境变量 `MAINT6_REAL_HOME_APPROVED=yes` 才动，演练只许在 `/private/tmp` 或 `/var/folders` 下的拷贝上跑，路径是真 Home（`~/.molis-work`、`~/.goalboard`）或其下的一律拒绝。
    - `00-prep-copy <拷贝>`（只用于演练）：目录库存的是项目库的绝对路径，照着开会打到真库，所以先在一个事务里把拷贝目录库里每个指向真 Home 的绝对路径改成拷贝的路径，再逐列 `SELECT` 证明没有一格还指着真 Home，否则回滚；拒绝真 Home。
    - `01-inspect <home> --real`：只读，真库用 `immutable=1` 打开，不读密钥值。对每个项目目录里的 `molis-work.db`（目录库列出的与磁盘上有的）报 `user_version`、表数、5 张 Casebook 表有几张、其中共几行；列出 `plugins/experiments/` 的文件与字节数；在 `connectors/connectors.db`、`projects/catalog.db` 的每张表里数出文本含 `experiments` 的行数，在 `workflows/workflows.db`、`assistant/assistant.db`、`placement/placement.db` 里数含 `io.molis.work.experiments` 或 `experiments.` 的行数，并数 `config/mcp-tools.json` 里 `experiments` 出现几次；脚本还试着打开 `plugins/plugin-runtime.db`，文件不存在就返回 `null`，什么也没扫。维护前：18 个项目库全是 6、各有 5 张 Casebook 表、共 0 行；`plugins/experiments/` 有 `private.sqlite` 12,288 字节、`private.sqlite-shm` 32,768 字节、`private.sqlite-wal` 0 字节；残留行是 `connector_bindings` 1、`project_plugin_exclusions` 1、`project_events` 3，workflows、assistant、placement 和 `mcp-tools.json` 都是 0。`plugins/plugin-runtime.db` 在真实 Home 里不存在（输出里是 `"plugin_runtime": null`），所以 Plugin Runtime 一侧这次什么也没扫：Plugin Runtime 的状态表（`plugin_runtime_installs` 等，见 `docs/system/HOME-DATA.md`）在各项目库里，脚本在项目库里只数了 Casebook 的表；实验插件不是经 Plugin Runtime 装配的（删除前它在 `tests/builtin-plugin-assembly-gate.test.ts` 的旧路径冻结名单里），所以预期那里没有它的行，但没有数过。另外，脚本在 workflows、assistant、placement 里用的关键字是 `io.molis.work.experiments` 和 `experiments.`，写成单数 `experiment` 的主体类型它匹配不到；整理这份记录时在备份 `2026-10-10-before-maint6` 的只读拷贝（`VACUUM INTO`）上改用不分大小写的 `experiment` 把这三个库又数了一遍，仍是 0（连接库 1、目录库 1 和 3、`mcp-tools.json` 0 次，与上面一致）。维护后同一脚本：18 个都是 7、0 张 Casebook 表、残留行全为 0、`plugins/experiments/` 不在。
    - `02-v7 <home> <sql> --real --apply`：对每个 `molis-work.db`，版本是 6 的跑 `project-maintenance-v7.sql`（一库一个事务，前提与回滚见（一）），然后核对版本 7、没有 Casebook 表、`integrity_check` ok、其余每张表的行数不变；有进程持有库文件（`lsof`）就在写任何东西之前停；已是 7 的跳过。
    - `03-move-experiments <home> <备份目录> --real --apply`：动手前对 `plugins/experiments/` 里每个文件跑 `lsof`，有进程持有、或备份目录已存在就停；`mkdir` 备份目录（权限 700），把 `plugins/experiments` 整个 `rename` 到 `<备份目录>/experiments`（同一个卷，原子），`plugins/` 空了就 `rmdir`；打印搬进备份里的文件与字节数。
    - `04-leftovers <home> --real --apply --expect 1,1,3`：先数下面三类行，条数与 `--expect` 不一致就停；涉及的库文件（含 `-wal`、`-shm`）有进程持有就停；然后每个库一个事务（`BEGIN IMMEDIATE`）：`connectors.db` 一个，`catalog.db` 一个（后两条语句在其中）。删除条数与期望不一致、或 `foreign_key_check` 有行，就整库回滚；提交后 `integrity_check` 必须是 ok。三条语句（`PLUGIN` 即 `('experiments', 'io.molis.work.experiments')`）：（1）`connectors/connectors.db`：`DELETE FROM connector_bindings WHERE scope_id = 'home' AND plugin_id IN PLUGIN`，期望 1 行（匹配到的是 `slot_id = 'typesafe'` 那一条；谓词里没有再限定 `slot_id`）；（2）`projects/catalog.db`：`DELETE FROM project_plugin_exclusions WHERE plugin_id IN PLUGIN`，期望 1 行（某个项目隐藏过它；`project_plugins` 里没有）；（3）`projects/catalog.db`：`DELETE FROM project_events WHERE json_valid(payload_json) AND json_extract(payload_json, '$.plugin_id') IN PLUGIN`，期望 3 行，是 2026-09-23 的一次 `project.plugin_added` 和两次 `project.plugin_removed`，`plugin_id` 都是 `experiments`。第（3）类不在计划的残留清单里，是只读数时发现的。这三个条数与谓词事后在备份 `2026-10-10-before-maint6` 的只读拷贝（`immutable=1`）上又数过一遍，仍是 1、1、3。
    - `05-sessions-orphans <home> [--real] [--apply --expect <项目 id>:<个数>]`（Sessions 残留用，见上面「另」）：不带 `--apply` 只读，用只读方式打开 `sessions/sessions.db` 并附上目录库，列出每个 Session 的现行 `work.project` 关联（`context_edges` 里 `relation_type = 'work.project'`、`state = 'active'`，且是该关联的最新 `revision`）所指的项目不在目录库 `projects` 表里的项目 id 和各有几个 Session，再报 `sessions` 表总数。带 `--apply` 时，列出的孤儿必须正好是 `--expect` 给的那一个项目、那个个数，否则停；`sessions.db` 与 `-wal` 有进程持有（`lsof`）也停；然后调用产品自己的 `purgeSessionsProject(home, 项目 id, db => createSessionLedger(db))`（`createSessionLedger` 在 `apps/local-host/src/session-registry.ts`），不写 SQL；清完再列一次，孤儿还有、或总数不是清前减期望个数，就以失败退出。输出是 JSON：`sessions_total`、`orphans`，清完后多 `purged`、`sessions_total_after`、`orphans_after`。上面「另」里的 56 个 Session、1 个孤儿先在备份拷贝上列出，真库上的列出与删除结果见「另」。
  - **10-11 后续核对（本次从发布检查清单与 BL-126 回填，不是 10-12 重做维护）**：18 个项目库以只读 `immutable=1`/`VACUUM INTO` 取得拷贝，用 `9f9bda551` 的 `LocalProjectDatabase` 打开，基线检查通过；每个项目的 Goal 数（最多 277）及除已删 Casebook 五表外的各表行数均与维护六前备份相同，v7、无 Casebook 表、完整性 ok，拷贝已删除。未在这批真实数据拷贝上打开工作台/切换器；该 UI 只在隔离 Home 验过。BL-126 只剩用户重开旧会话，不能反复要求已做的库维护，也不能把重装本身写成旧会话已重连。
- 真实 Home 维护七（W3-06 C，#382：Runtime 上的 7 个内置插件的能力来源编号由安装编号改成插件名；用户 10-10 定「W3-06 合入后立刻做、卡片等一起改」，10-11 定「不写真库，重装后复查一次」）：
  - **列出**（2026-10-10，#382 合入时）：4173、4207、4208 无人监听，整份 APFS 克隆 `~/molis-work-backups/2026-10-10-before-maint7`（`cp -c -R`，退出码 0、无报错），在克隆上跑 `node tests/fixtures/provider-identity-maintenance.mjs list --home <克隆>`：五类可改的（MCP 授权、工作流步骤、角色草稿、Coding 选好的能力、助理）都是 0，`FIXED`、`derived`、`history`、`UNCLASSIFIED` 都是 0，问题 0；`NOT READ` 是 50 个加密目录（`agent-runtime/records/*` 与 Cognia 的运行目录）。为确认 0 不是因为工具算错了旧编号，又在克隆的文本文件里直接找 `plugin-install-<32 位十六进制>`：7 个旧编号各 24 次、共 168 次，正好是工具按 Runtime 规则推出来的 7 个，全部写成 `sdk.artifacts.<安装编号>`，都在 9 月的创作台运行记录（`plugin-builder/project-*/runs/*/builder-runs/*.json`）里，是安装自己的身份，工具按规则不算引用。
  - **用户决定**（2026-10-11 弹窗，§1 三行）：不写真库，#382–#385 都合完后重装一次，再对会被改的五处做只读复查；停住的 Coding 轮次不提前处理。
  - **重装与复查**（2026-10-11）：`origin/main` `9f9bda551` 的干净工作树里整体构建（经整机构建锁），`node dist/cli/main.js install --source .` 输出「同版本内容已刷新（0.2.0）」，常驻服务未启用（`service status`：absent），新装的 MCP 经 stdio 列出 18 个项目。然后只读拷出五处到会话临时目录（700 权限）：`config/mcp-tools.json` 直接拷贝；`workflows/workflows.db`、`characters/characters.sqlite`、`assistant/assistant.db` 用 `?mode=ro` 打开 `VACUUM INTO`；18 个项目库是 WAL 模式、没有 `-wal` 文件、没有进程打开，只读打开建不了 `-shm`，改用 `immutable=1` 打开 `VACUUM INTO`。在拷贝上跑 `list`：各类都是 0（拷贝里只有这五处，`NOT READ` 也是 0），退出码 0；拷贝随即删除。真实 Home 一个字都没改（`workflows.db-shm` 的修改时间因只读连接更新，它是共享内存索引，不是数据）。
  - **收尾**：工具 `tests/fixtures/provider-identity-maintenance.mjs` 与演练用例 `tests/provider-identity-maintenance.test.ts` 删除，从 Git 历史 `9f9bda551` 取；检查清单第 4.3 节维护七一项勾上并写明结果，CHANGELOG 的 W3-06 C 一行注明已核对。会话里已经开着的 MCP 进程跑的是旧代码（用户要重开 Claude Code、Codex、Grok 会话）；克隆 `2026-10-10-before-maint7` 留着，删不删由用户定。
- 真实 Home 维护八（候选，未做；动真实 Home 之前弹窗问用户）：做下面「库版本维护清单」里还没做的行，与装下一个版本同一步做，不提前：已装的构建只认旧版本，提前改了它就拒绝打开。
  - **#661 旧 HTTP MCP 凭据配置**（候选，未做）：此前通过 `replace-secret` 保存的 Prologue `molis-mcp` 配置可能只有 `credential_ref`，新版本连接时会拒绝该引用并提示重新填写。与 `connectors/connectors.db` 1→2 同一次维护：先在停宿主后的完整备份副本中，经 Agent Runtime 的公开存储入口列出受影响配置的 owner、id、地址与数量，不输出秘密；能通过凭据 owner 恢复的，演练迁成固定地址的 Host 连接，并将配置改存 `auth_connection_id`；不能恢复的，保留配置并明确请用户升级后重新填写或选择已有连接。真实 Home 当前未核对，不预报数量，也不宣称已迁移。演练须核对配置归属、地址和现行版本、重启后认证、原调用授权及秘密不进入日志；失败恢复同一时点的完整副本。维护及安装新构建仍需当次授权，产品读取不增加旧值兜底。
  - **Shelf 目录 `shelf/catalog.json` 1 → 2**（Shelf S3，① 裁定 D3；候选，未做）：版本 2 的条目不再带 `origin_realpath`，原件由平台的 `materials.claimOriginal` 按条目编号登记；新构建只认版本 2，打开版本 1 的目录会拒绝。维护是停宿主后跑 `node tests/fixtures/shelf-catalog-maintenance.mjs rewrite --home <Home> --maintenance-window`（先在完整备份副本上 `list`，只报版本、条目数和带路径的条目数，不报路径）：去掉每个条目的 `origin_realpath`，版本写成 2，一次改名落盘，再跑一遍什么也不改。路径不搬进平台的登记，所以维护前放进来的副本不再有「原件已变」的提示。只在临时 Home 演练过（`tests/shelf-catalog-maintenance.test.ts`）；这台机器没有真实 Home。目录是 JSON 文件，不在检查清单第 3 节的库版本表里，所以没有进下面那张门禁读的表。
  - **10-17 只读核对**（真实 Home 各库的只读拷贝，读完即删；只读 `user_version` 与 `catalog_meta`、`session_meta` 的版本，不读内容、不碰密钥；真实 Home 跑的是 10-11 构建的安装版 0.2.0）：19 个项目库都是 7，目录库 22、会话库 7，Functions 3，助理、记忆、Form 2，`homeStores()` 登记的其余各库 1，都与基线相符；不符的只有 Pages（真实 1，代码 2）。`plugin-runtime/plugin-runtime.db`、`issues/issues.db`（都是 2）真实 Home 里还没有，新版本第一次打开时按基线新建，不用维护。没有核对的：搜索索引 `search/search.db`（可重建的派生库，版本记在 `search_meta`，不符就重建、不拒绝）和两个 JSON 文件（`feed/secrets.json`、`config/mcp-tools.json`）。

**库版本维护清单**（门禁 `scripts/gates/store-versions.mjs` 只读这张表）：检查清单第 3 节表里某个库的版本，和 merge-base 比变了（升或降），同一个 PR 就要在这里加一行，不然 `pnpm health:check` 失败。写法固定：「位置」一格是检查清单第 3 节同一行的位置，原样加反引号；「版本」一格写 `旧 → 新`，两边是数字，箭头是 `→`；后两格写哪个提交或 PR 改的版本、怎样维护和做没做。别处正文里写的不算。

| 位置 | 版本 | 改版本的提交 | 维护 |
| --- | --- | --- | --- |
| `config/mcp-tools.json` | 2 → 3 | ACA005（`feature/aca005-search-authority`，本片 PR） | [同一片规格](slices/aca-005-search-authority.md)；逐条授权增加管理 owner 生成的 generation，原 client、scope、精确引用、权限、enabled 全部保留。临时副本已演练一次性 list/apply、外置原件、幂等、重复拒绝、真实写入失败零改和原件恢复；脚本仅在会话临时目录，不进运行时读路径。真实 Home 未操作，随 W5-17/统一发布维护窗口停全部 owner、完整备份并在副本核对后，另按真实 Home 的当次授权执行；v3 运行时严格拒绝 v2，不自动迁移、不改产品发布版本。 |
| `server/server.sqlite` | 1 → 2 | W5-16 B1（`anticorr/codex-w5-16-im-invite-hash`） | 原旧格式转换路线已于2026-10-30由用户取消；工具/旧夹具/演练删除。保留现行权限、原key绑定与拒绝；旧Home整体搬开后新建当前格式1，真实重建未开始。 |
| `memory/memory.db` | 2 → 3 | 记忆策略 M1 第一片（`codex/memory-p0`，独立 PR 交付） | [记忆策略 spec](../prologue-memory-strategy/spec.md) §9.4 / §13；真实 Home 未执行。停止全部 owner 并备份，在隔离副本按旧代码物化个人、项目默认及已有项目的有效开关，保留消费者/插件限制，同一事务写采用记录和版本 3，不改 SDK 正文。已演练事务失败回退、重试、两次新进程重启及旧 Home/Web/MCP 入口拒绝。真实库采用与安装新构建须另获对应授权，不能由普通启动就地升级 |
| `memory/memory.db` | 3 → 4 | [Memory SDK 采用 PR #1064](https://github.com/molis-ai/molis-work/pull/1064)，`6bbacc107` | [记忆策略 spec](../prologue-memory-strategy/spec.md) §8.3 / §13；真实 Home 未执行。停止 owner 并备份，在隔离副本经公开 `adoptMemoryHome` 转换并逐页核验 SDK 当前格式，再事务提交 ledger4；保留原偏好、历史和引用。SDK 已转但 ledger 提交失败时，原维护操作重读并补齐，不启动旧 App 或回写旧格式。已演练非空旧 App 采用、故障重试、新包重启及旧 Home/Web/MCP/延迟绑定入口拒绝；直接旧 SDK 绕过不受支持。真实库切换仍须另获授权，不由普通启动升级 |
| `connectors/connectors.db` | 1 → 2 | #661（`7074abe67`、`fe5634dd3`、`7007532b8`） | 归维护八，与安装新构建同一步进行；真实 Home 未执行，仍需当次授权，不得先用新构建打开旧库或让旧构建打开维护后的库。隔离 v1 副本已演练：停宿主并完整备份，按当前 `CONNECTORS_STORE_BASELINE` 增加连接启停/移除字段、协议/授权请求与技术观察字段和表，在事务中写基线 2，核对原连接 id、凭据引用、绑定、协议及取消记录不变；失败恢复完整副本。证据见 [服务接入 spec](../assistant-service-connections/spec.md) 的连接生命周期、正式接入准备与技术观察记录 |
| `projects/<project_id>/molis-work.db` | 6 → 7 | #369（删 Casebook 的 5 张表） | 维护六，真实 Home 的 18 个项目库 10-10 已做（上面「维护六」） |
| `pages/pages.db` | 1 → 2 | `0ff3adb8a`（10-13，直接提交到 main、没有 PR；只多一张 `page_comments`，其余建库语句逐条相同） | 维护八，未做：一个事务里按 `PAGES_STORE_BASELINE` 建 `page_comments`，写 `PRAGMA user_version = 2`，不动已有的表和行；先在副本上演练（检查清单第 4.3 节）。那个提交在检查清单第 3 节写了「真实 Home 尚未执行这一项维护」，但没有进这张表、也没有待办行，10-17 只读核对时才发现（BL-157） |
| `projects/<project_id>/molis-work.db` | 7 → 8 | L1b（`feat/project-library-l1b`，叠在 #857 上；与 S8 同一批） | 维护八，未做：每个项目库一个事务跑 `tests/fixtures/project-maintenance-v8.sql`，建 `project_root` 并抄 Board 的那一行，重建 `boards`（去掉 `title`，外键指 `project_root`，行与 rowid 不变，S8）和外键指向 `boards` 的 11 张表改指 `project_root`（行、rowid 与自增序号不变），建插件库账本写 Coding、Feed、Goals、Schedule 四行（Goals 一行与 `boards` 的改建是 S8 加进同一份脚本的两步），写 `user_version = 8`；前置或后置核对任一不对整库回滚。演练 `tests/project-maintenance-v8.test.ts`（一次性 Home）；做法见检查清单第 4.3 节维护八。2026-10-20 本机没有真实 Home |
| `projects/<project_id>/molis-work.db` | 8 → 9 | `feature/system-review-fixes`（SYS-15 公共调度安装绑定，待提交） | 未维护真实 Home：备份副本严格核对 v8，事务中新增 `schedule_action_bindings`、暂停未绑定闹钟、保留业务数据与历史，写 v9；错误版本和失败整笔回滚。SYS-15-S6 临时库演练已通过（`tests/project-maintenance-v9.test.ts`，脚本 `tests/fixtures/project-maintenance-v9.sql`），切换真实 Home 前另定维护窗口。 |
| `projects/<project_id>/molis-work.db` | 9 → 10 | ac-trust T1（[PR #1250](https://github.com/molis-ai/molis-work/pull/1250)）与 S9-0b（[PR #1245](https://github.com/molis-ai/molis-work/pull/1245)，[slice](slices/goals-s9-0b-attention-ledger-services.md)）合成同一版（batch-36） | 未维护真实 Home，动之前弹窗问用户，时段与 W5-17 同一次：备份副本严格核对 v9（两张 Attention 表的列数也要正好是 v9 的，多一列整笔拒绝），一个事务里重建 `plugin_runtime_installs`（多 `publisher_trust` 列，按记录的 `execution` 写：`host` → `host`，`sandbox` → `unsigned`，别的取值整笔回滚），再重建 `inbox_entries` 与 `attention_events`（多 `owner_plugin_id`，旧行全部保留、rowid 不变、owner 为 null，不按 ID 或 kind 猜；按 owner 区分的两条部分唯一索引），写 v10。演练是 `tests/project-maintenance-v10.test.ts`，脚本 `tests/fixtures/project-maintenance-v10.sql`；设计 [slices/ac-trust-install.md](slices/ac-trust-install.md) §6。 |
| `projects/<project_id>/molis-work.db` | 10 → 11 | FI-5（`claude/ac-feed-inbox-designs`；Feed 的表归 Feed 声明，[slice](slices/feed-inbox-store-into-feed.md)；版本号暂定，别的分支先合入则顺延） | 未维护真实 Home，动之前弹窗问用户，时段与 W5-17 同一次：备份副本严格核对 v10（11 张表和 11 条索引都在、Feed 的账本行正好是版本 1 的那一行，任一不对整笔拒绝），一个事务里把 `plugin_project_databases` 的 Feed 行改成版本 2 与 12 张表的 `tables_json`、`user_version` 写 11；表和行一行不动，没有数据搬迁。演练是 `tests/project-maintenance-v11.test.ts`，脚本 `tests/fixtures/project-maintenance-v11.sql`。 |
| `projects/<project_id>/molis-work.db#feed` | 1 → 2 | FI-5（同上一行，同一次维护） | 未维护真实 Home，随上一行同一个事务：Feed 的声明从只有 `feed_out_rules` 与它的索引，变为 12 张表（加 Feed 条目、Sources、Signals、Listener Host 的 11 张）与它们的索引；账本行改成版本 2 和新的 `tables_json`，表与行不动。演练同上一行（`tests/project-maintenance-v11.test.ts`）。 |
| `plugin-runtime/plugin-runtime.db` | 2 → 3 | ac-trust T1（`claude/ac-trust-t1`） | 同上一行，同一次：事务中重建 `plugin_runtime_installs` 并建同意账本 `plugin_consents` 与发布者固定表 `plugin_publishers`，写 v3。演练是 `tests/plugin-runtime-maintenance-v3.test.ts`（用本构建的 Home 退回 v2 再维护、再打开），脚本 `tests/fixtures/plugin-runtime-maintenance-v3.sql`。 |
| `characters/characters.sqlite` | 1 → 2 | Sessions 收尾 SC-2（`migrate/sessions-sc2-characters-runs`；Characters 自己记原生执行，D3） | 未维护真实 Home：停宿主、整份备份，副本上一个事务跑 `tests/fixtures/characters-maintenance-v2.sql`（只核对 `user_version` 正好是 1，不比表结构；只加 `character_runs` 表与索引，草稿不动），演练是 `tests/characters-maintenance-v2.test.ts`；以前记在会话库里的角色运行不迁，留给 SC-5 随会话库一起处理。与装新构建同一步做，动真实 Home 之前弹窗问用户 |
| `functions/functions.db` | 3 → 4 | 平台服务 P2（`claude/ac-platform-scenes`；判断账按记它的插件安装分开存，S-90，[slice](slices/platform-scenes-judgments-services.md)） | 未维护真实 Home：停宿主、整份备份，副本上一个事务跑 `tests/fixtures/functions-maintenance-v4.sql`（只核对 `user_version` 正好是 3；给 `function_judgments` 加 `install_id` 列，写 4；已有的判断都留着，`install_id` 为空，即宿主自己记的），演练是 `tests/functions-maintenance-v4.test.ts`。Feed、Inbox 现在经宿主私路记的判断都是空；它们迁到 Runtime（FI-6）后读 `latest()` 只看自己安装记的，要不要把旧行按场景号补成插件的安装号（`plugin-install-` 加 `plugin_id` 与发布者签名算出的号，逐项目一致）由 FI-6 那一步定，不补则旧判断不再被采用、重新判断一次。与装下一个版本同一步做，动真实 Home 之前弹窗问用户，不得先用新构建打开旧库或让旧构建打开维护后的库。 |
| `assistant/assistant.db` | 2 → 3 | PG-036 C8-3（`claude/ac-coding-93b25f`；助理按执行方协议选执行方，工作正文的执行方改记插件标识） | 归维护八，与装下一个版本同一步做；未维护真实 Home，动之前弹窗问用户，不得先用新构建打开旧库或让旧构建打开维护后的库。停宿主并整份备份，在副本上一个事务跑 `tests/fixtures/assistant-maintenance-v3.sql`：只核对 `user_version` 正好是 2；工作正文里 `executor.kind` 为 `coding` 的改成 `plugin` 并补 `plugin_id` 为 `io.molis.work.coding`，轮次正文里 `executor` 为 `coding` 的改成 `plugin`，已发送请求的结果（`assistant_requests.result`，同一个请求标识再发会原样取回）里的 `work.executor` 同工作正文那样改，写版本 3；表、工作与会话的关联（种类仍是 `coding_session`）和其余字段不动。失败整笔回滚。临时库演练是 `tests/assistant-maintenance-v3.test.ts`（RAC-447、RAC-448） |
| `server/server.sqlite` | 2 → 1 | 干净Home第六片（统筹6517794305） | 现行IM/身份/传输完整DDL归1，错版与错结构在可写打开前拒绝；旧邀请转换工具/演练删除，旧Home整体搬开后新建，真实未开始。 |
| `feed/secrets.json` | 2 → 1 | 干净Home第六片（统筹6517794305 / 6518340875） | 只改外层文件格式号；AES-GCM、AAD、Home绑定及缺原key拒绝保持，不改Keychain或SDK内部形状；旧Home整体搬开，真实未开始。 |
| `config/mcp-tools.json` | 3 → 1 | 干净Home第六片（统筹6517794305） | 现行逐客户端/动作精确授权字段归外层1，权限与撤销保持；旧Home整体搬开后用户重授权，不转换旧授权。 |
| `shelf/catalog.json` | 2 → 1 | 干净Home第六片（统筹6517794305） | 当前item/job/clipboard字段不变，外层1；旧转换工具删除，坏格式不补造；旧Home整体搬开后新建。 |

**各库版本表（10-08 建立，项目库一行已按 10-10 维护六更新；各个后续候选的现行版本以 `docs/releases/CHECKLIST.md` 和 `node scripts/verify-release-versions.mjs` 的代码核对为准）**：每个库只有一份建库代码，版本不符就拒绝，不就地升级。表里是对应时点的代码版本；真实 Home 目录库已在维护四升至 22，原「仍是 21」为过时状态。I6 Home Runtime 候选 v2 的要求另见 §10.2，不把本表当候选全部库的唯一清单。

| 库 | 版本 | 记在 |
| --- | --- | --- |
| 项目库 `projects/<id>/molis-work.db` | 7 | `user_version`（`PROJECT_DATABASE_BASELINE`；10-10 由 6 升到 7，删 Casebook 的 5 张表，真实 Home 的 18 个项目库已于 10-10 升到 v7，是维护六的数据部分） |
| 目录库 `projects/catalog.db` | 22 | `catalog_meta.schema_version`（`CATALOG_SCHEMA_VERSION`，`apps/local-host/src/project-catalog-contract.ts:1`） |
| 会话库 `sessions/sessions.db` | 7 | `session_meta.schema_version` |
| Functions | 3 | `user_version` |
| Form、记忆、助理、Pages | 2 | `user_version`（Pages 10-13 由 1 升到 2，真实 Home 还是 1，见上面的维护八） |
| 连接、Agent 定义、引导、放置、炼金术士工作室、炼金术士搜索库、server、Cognia、Dataset、Images、Jelly、灵光、PPT、Todo、Workflows | 1 | `user_version` |

**保留下来、不算兼容的机制**（门禁里剩的 9 处标记都在这几类里）：

| 机制 | 为什么不算兼容 | 标记 |
| --- | --- | --- |
| 插件升级声明（`upgrade_compatibility.compatible_from_versions`、同版本重装） | 插件版本之间的升级是现行产品功能，不是读旧数据 | 5 |
| pdfjs 的 `legacy/build` 路径 | 第三方包给 Node 的构建名 | 2 |
| 产品文案（Gmail 同步说明里的「回填」、规划方法的一条说明） | 给人看的话 | 2 |
| 各库的版本号与基线 | 一份当前 schema 加版本，版本不符就拒绝；不做迁移 | — |
| Goal 事件历史、成果的固定版本 | 现行产品功能（记录与版本），不是旧格式 | — |

## 5. 包级清单（§4.4）

W1-18 原排期分三片：事实表；计划「深」11 个和「中」43 个；计划「浅」17 个。用户 2026-10-12 明确要求继续把现有 71 包全部实际审完，现按 §12.7 的九组并行补齐，不在前轮核心路径抽查处停下。审完的包，把「主要文件及各自的变化原因、放错位置的类和方法、重复实现、建议的移动」写入本 spec 的逐包结论，审查列才由「待审」改为「已审」；该列表示代码审查完毕，修复与运行/产品验收另记，不能互相替代。每个包的 README 都有「开发要求」一节；当前清单为 68 包（2026-10-26，Goals/Governance 并回插件），I6 预检的 boundary 结果见 §10/§12.5，原 70/70 是旧计数。

### 5.1 事实表

本表于 2026-10-26 从当前 #1295 收口组合（`cbf060ca` 加原 `eb617d59` 增量）重新生成；原审计记录保留，本片涉及的 owner 行待固定头增量复审。包清单取自 `scripts/workspace-packages.mjs`。用 `node scripts/gates/package-inventory.mjs --table` 从代码重新生成，用 `--check` 对照代码检查；后者也在 `node scripts/check-health-gates.mjs`（CI 里的健康门禁）里跑，是不对照 merge-base 的绝对规则：增删 workspace 包、插件迁到 Plugin Runtime 监督器、或改变 import 的可达性后不补表，CI 变红。门禁守行集合（不多不少、各一行）、层、状态和各列的取值；数字列不守，否则每个加一个文件的 PR 都要改表，要新数字就重新生成。

列的口径：

- 层：登记里的 `kind`（基础是 `foundation`，官方接入是 `integration-plugin`）。`server` 与 `packages/im-ui` 是在用、还会迭代的产品功能（右栏「讨论」页签，`apps/workbench/src/side-panel.ts:42`、`:115` 嵌入 `/im`）。2026-10-08「右栏『讨论』页签与 IM 代码」一行把归类改成业务列为待办（PR #312）：`server` 已改登记为 `module`（本表标「模块」，结构门禁按 Module 规则查它）；`packages/im-ui` 是界面包、不拥有事实，仍登记为 `foundation`，要不要也改，等用户另定。
- 源文件、行数：`<包>/src/` 下的 `.ts`、`.mts`，不含 `.d.ts`、测试、`dist`、`fixtures`；行数是按换行切开的段数，与巨大单元门禁（`scripts/check-health-gates.mjs`）同一口径。最大文件的路径相对 `src/`。
- 公开入口：`package.json` 的 `exports` 条数。依赖内部包：`package.json` 的 `dependencies` 里 workspace 包的个数。被依赖：反方向的个数。
- 状态、计划深度、审查：见 §5.2。

| 包 | 层 | 源文件 | 行数 | 最大文件 | 公开入口 | 依赖内部包 | 被依赖 | 状态 | 计划深度 | 审查 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `apps/cli` | 应用 | 4 | 159 | `command-dispatch.ts` 63 | 1 | 1 | 1 | 在用 | 浅 | 已审 |
| `apps/desktop` | 应用 | 11 | 1,239 | `capsule-shell.ts` 548 | 1 | 6 | 1 | 在用 | 中 | 已审 |
| `apps/local-host` | 应用 | 653 | 65,025 | `assistant/assistant-service.ts` 1,837 | 1 | 62 | 2 | 在用 | 深 | 待审 |
| `apps/mcp` | 应用 | 16 | 956 | `runtime-context-tools.ts` 193 | 1 | 2 | 1 | 在用 | 中 | 已审 |
| `apps/server` | 应用 | 5 | 192 | `main.ts` 81 | 1 | 7 | 0 | 非产品 | 浅 | 已审 |
| `apps/workbench` | 应用 | 303 | 51,590 | `i18n/en.ts` 3,266 | 2 | 31 | 1 | 在用 | 深 | 已审 |
| `horizontal/agent-host` | 横向 | 96 | 13,630 | `adapters/prologue-stream.ts` 723 | 1 | 2 | 1 | 在用 | 深 | 已审 |
| `horizontal/connector-host` | 横向 | 5 | 754 | `connection-store.ts` 396 | 1 | 1 | 1 | 在用 | 浅 | 已审 |
| `horizontal/knowledge` | 横向 | 11 | 1,300 | `index.ts` 425 | 1 | 1 | 1 | 在用 | 浅 | 待审 |
| `horizontal/memory` | 横向 | 23 | 3,180 | `service.ts` 1,151 | 1 | 1 | 1 | 在用 | 中 | 已审 |
| `horizontal/placement` | 横向 | 2 | 650 | `index.ts` 613 | 1 | 1 | 1 | 在用 | 中 | 已审 |
| `horizontal/runtime-host` | 横向 | 2 | 436 | `adapters/terminal-pty.ts` 424 | 1 | 1 | 2 | 在用 | 浅 | 已审 |
| `horizontal/scheduler` | 横向 | 2 | 622 | `index.ts` 541 | 1 | 2 | 1 | 在用 | 中 | 已审 |
| `horizontal/search` | 横向 | 2 | 659 | `index.ts` 585 | 1 | 1 | 1 | 在用 | 中 | 已审 |
| `modules/artifacts` | 模块 | 23 | 2,284 | `service.ts` 341 | 1 | 1 | 1 | 在用 | 中 | 待审 |
| `modules/attention-resumption` | 模块 | 1 | 449 | `index.ts` 449 | 1 | 1 | 1 | 在用 | 浅 | 待审 |
| `modules/characters` | 模块 | 15 | 808 | `action-handlers.ts` 129 | 1 | 2 | 1 | 在用 | 浅 | 已审 |
| `modules/context-ledger` | 模块 | 5 | 284 | `repository.ts` 98 | 1 | 1 | 1 | 在用 | 浅 | 已审 |
| `modules/functions` | 模块 | 17 | 1,969 | `store.ts` 290 | 1 | 2 | 1 | 在用 | 中 | 已审 |
| `modules/private-work-context` | 模块 | 10 | 1,208 | `project-binding-commands.ts` 330 | 1 | 1 | 1 | 在用 | 中 | 已审 |
| `modules/projects` | 模块 | 8 | 1,215 | `repository.ts` 470 | 1 | 1 | 1 | 在用 | 中 | 已审 |
| `modules/shelf` | 模块 | 25 | 3,114 | `contract.ts` 367 | 2 | 2 | 2 | 在用 | 中 | 已审 |
| `packages/contracts` | 基础 | 139 | 21,034 | `modules/goals.ts` 776 | 63 | 0 | 67 | 在用 | 深 | 待审 |
| `packages/design-system` | 基础 | 97 | 15,500 | `styles/primitives.ts` 1,258 | 1 | 2 | 5 | 在用 | 深 | 已审 |
| `packages/im-ui` | 基础 | 23 | 1,730 | `views.ts` 168 | 1 | 3 | 3 | 在用 | 中 | 已审 |
| `packages/kernel` | 基础 | 14 | 1,879 | `action-service.ts` 487 | 2 | 2 | 1 | 在用 | 深 | 已审 |
| `packages/plugin-runtime` | 基础 | 52 | 7,889 | `index.ts` 784 | 1 | 2 | 3 | 在用 | 深 | 待审 |
| `packages/plugin-sandbox` | 基础 | 14 | 1,681 | `broker.ts` 336 | 1 | 2 | 1 | 在用 | 中 | 已审 |
| `packages/plugin-sdk` | 基础 | 57 | 6,707 | `manifest.ts` 443 | 7 | 1 | 41 | 在用 | 中 | 待审 |
| `packages/storage` | 基础 | 20 | 3,378 | `adapters/file-secret-store.ts` 744 | 1 | 1 | 10 | 在用 | 中 | 已审 |
| `packages/test-kit` | 基础 | 11 | 1,242 | `boundaries.ts` 610 | 3 | 1 | 0 | 非产品 | 中 | 已审 |
| `packages/ui-host` | 基础 | 8 | 808 | `request-client.ts` 298 | 1 | 1 | 2 | 在用 | 浅 | 已审 |
| `plugins/native/alchemist` | 内置插件 | 106 | 10,872 | `studio/server/db/pulse-repository.ts` 563 | 2 | 3 | 2 | 构建期 | 中 | 已审 |
| `plugins/native/artifacts` | 内置插件 | 14 | 820 | `browser-ui.ts` 239 | 2 | 2 | 2 | 构建期 | 中 | 已审 |
| `plugins/native/coding` | 内置插件 | 206 | 23,321 | `styles.ts` 749 | 3 | 2 | 2 | Runtime | 深 | 已审 |
| `plugins/native/cognia` | 内置插件 | 36 | 1,789 | `store.ts` 149 | 2 | 2 | 2 | Runtime | 中 | 已审 |
| `plugins/native/dataset` | 内置插件 | 33 | 2,535 | `store.ts` 423 | 3 | 2 | 2 | Runtime | 中 | 待审 |
| `plugins/native/diff` | 内置插件 | 18 | 829 | `comparison.ts` 192 | 2 | 2 | 2 | Runtime | 浅 | 已审 |
| `plugins/native/feed` | 内置插件 | 85 | 9,735 | `store/listener.ts` 779 | 3 | 2 | 2 | Runtime | 深 | 待审 |
| `plugins/native/files` | 内置插件 | 31 | 1,697 | `actions.ts` 167 | 2 | 2 | 2 | Runtime | 中 | 已审 |
| `plugins/native/form` | 内置插件 | 36 | 3,245 | `store.ts` 466 | 3 | 2 | 2 | Runtime | 中 | 已审 |
| `plugins/native/git` | 内置插件 | 32 | 2,655 | `browser/source.ts` 249 | 2 | 2 | 2 | Runtime | 中 | 已审 |
| `plugins/native/goals` | 内置插件 | 220 | 25,273 | `event-document-client.ts` 742 | 4 | 2 | 2 | Runtime | 深 | 待审 |
| `plugins/native/images` | 内置插件 | 34 | 2,092 | `service.ts` 181 | 3 | 3 | 2 | Runtime | 中 | 待审 |
| `plugins/native/inbox` | 内置插件 | 19 | 1,443 | `scene-runtime.ts` 190 | 2 | 1 | 2 | Runtime | 中 | 待审 |
| `plugins/native/issues` | 内置插件 | 28 | 1,908 | `browser/capture.ts` 183 | 2 | 2 | 2 | Runtime | 浅 | 已审 |
| `plugins/native/jelly` | 内置插件 | 56 | 4,517 | `messages.ts` 257 | 3 | 2 | 2 | Runtime | 中 | 待审 |
| `plugins/native/lingguang` | 内置插件 | 28 | 2,264 | `store.ts` 362 | 3 | 2 | 2 | Runtime | 中 | 已审 |
| `plugins/native/pages` | 内置插件 | 112 | 17,055 | `styles.ts` 770 | 5 | 2 | 2 | Runtime | 深 | 待审 |
| `plugins/native/plugin-builder` | 内置插件 | 19 | 2,960 | `agent-authoring.ts` 800 | 2 | 2 | 2 | 构建期 | 中 | 已审 |
| `plugins/native/ppt` | 内置插件 | 36 | 2,853 | `store.ts` 295 | 3 | 2 | 2 | Runtime | 中 | 待审 |
| `plugins/native/schedule` | 内置插件 | 46 | 3,103 | `tasks.ts` 300 | 2 | 2 | 2 | Runtime | 中 | 待审 |
| `plugins/native/shelf` | 内置插件 | 61 | 6,192 | `styles.ts` 647 | 2 | 3 | 2 | Runtime | 中 | 已审 |
| `plugins/native/text-stats` | 内置插件 | 16 | 553 | `core.ts` 105 | 2 | 2 | 2 | Runtime | 浅 | 已审 |
| `plugins/native/todo` | 内置插件 | 49 | 5,225 | `organize.ts` 328 | 3 | 2 | 2 | Runtime | 中 | 待审 |
| `plugins/native/workflows` | 内置插件 | 44 | 4,602 | `model.ts` 438 | 2 | 2 | 2 | Runtime | 中 | 待审 |
| `plugins/official-integrations/catalog` | 官方接入 | 10 | 2,184 | `catalog.ts` 1,013 | 1 | 2 | 1 | 在用 | 中 | 已审 |
| `plugins/official-integrations/github` | 官方接入 | 6 | 960 | `provider.ts` 592 | 1 | 2 | 1 | 在用 | 浅 | 已审 |
| `plugins/official-integrations/gmail` | 官方接入 | 16 | 2,641 | `history-cursor.ts` 529 | 3 | 2 | 2 | 在用 | 中 | 已审 |
| `plugins/official-integrations/rss` | 官方接入 | 8 | 1,308 | `catalog.ts` 513 | 2 | 2 | 2 | 在用 | 中 | 已审 |
| `plugins/official-integrations/web-query` | 官方接入 | 1 | 42 | `index.ts` 42 | 1 | 2 | 0 | 非产品 | 浅 | 已审 |
| `plugins/official-integrations/youtube` | 官方接入 | 2 | 123 | `channel.ts` 80 | 1 | 2 | 1 | 在用 | 浅 | 已审 |
| `server` | 模块 | 18 | 1,120 | `continuity/service.ts` 179 | 1 | 3 | 2 | 在用 | 中 | 已审 |
| `tooling/plugin-cli` | 工具 | 8 | 359 | `sample-source.ts` 108 | 1 | 3 | 0 | 在用 | 浅 | 已审 |

### 5.2 状态、计划深度与审查

**状态**：I6 `af0fe957` 重算为在用 42、Runtime 8、构建期 18、非产品 3（共 71）；Issue 是新增的 Runtime 插件，Experiments 已删除。由代码判定，门禁每次重算：

| 状态 | 含义 | 代码里怎么判 |
| --- | --- | --- |
| 在用 | 从产品入口走得到 | 产品入口是根包的三个启动器：根 `tsconfig.json` 把 `apps/desktop/launchers/**` 编成 `package.json` 的 `bin`（`molis-work`、`molis-work-mcp`、`molis-work-web`），目录在 `apps/desktop` 下，所以从 `apps/desktop` 出发，沿包内 `.ts`/`.mts`（不含测试）里的 import 走，类型导入也算；写在模板字符串里的 import 不算 |
| Runtime | 内置插件由 Plugin Runtime 监督器启动 | 走得到，且 `apps/local-host/src/project-plugins.ts` 里有它的包名（`tests/builtin-plugin-assembly-gate.test.ts` 的 `RUNTIME_ASSEMBLED` 用同一证据） |
| 构建期 | 内置插件手工装配进宿主与工作台 | 走得到，但监督器里没有它；就是同一测试冻结的 `BUILD_TIME_ASSEMBLED`（只许减少，迁到 Runtime 时把这里的状态一起改） |
| 非产品 | 产品入口走不到 | 见下 |

非产品的三个包，每个都用 `git grep` 再核对过：

- `apps/server`：没有任何包、脚本或测试按包名导入它。它有自己的 `start` 脚本（`apps/server/package.json`，`node dist/main.js`），`server/README.md:15` 教人手工启动；不随根包发布。
- `packages/test-kit`：根入口只被 `scripts/check-package-boundaries.mjs`、它自己的测试和 `tests/import-boundary-template.test.ts` 导入，根包把它放在 `devDependencies`。W2-11 a 起它多了子路径 `/browser`，由浏览器用例和它们的夹具导入（`tests/fixtures/goal-browser.ts`、`tests/fixtures/plugin-builder-browser.ts` 与三个独立的浏览器用例等）；W2-11 c1 起又多了子路径 `/local-host-http`（访问本机 Host HTTP 管理接口的客户端），由 `tests/fixtures/test-home.ts`、`tests/fixtures/goal-browser.ts` 和直接用授权调用的用例导入。
- `plugins/official-integrations/web-query`：除它自己的文件和登记表外，没有任何文件按包名引用它（代码、脚本、测试都没有），根包的 `dependencies` 里也没有它。Feed 的 `web_query` 来源由 `plugins/native/feed/src/source-request.ts` 自己处理；`specs/action-architecture/migration.md:98` 仍写它由 Feed 来源服务驱动，与代码不符，W1-02 对齐文档时一并改。

另有两处声明了依赖、包内却没有任何文件按包名导入：`apps/workbench` 对 `packages/im-ui`（「讨论」页签用的是 `/im` 的 iframe）、`plugins/native/goals` 对 `modules/goals`。这版不判断，留给逐包审查。（`packages/test-kit` 对 `packages/contracts` 的依赖原先也在此列，只把包名当字符串；W2-11 c1 起 `/local-host-http` 的类型从 `@molis-ai/molis-work-contracts/platform/actions` 导入，它不再属于「没有文件导入」。）

**计划深度**按风险定（任务书 §0：深入程度按风险决定）。四个量各给分：源文件行数 ≥ 9,000 记 2 分、≥ 3,000 记 1 分；2026-09-08（Cutover）以来碰过这个包的非合并提交数 ≥ 100 记 2 分、≥ 40 记 1 分；被依赖数 ≥ 17 记 2 分、≥ 4 记 1 分；`tooling/gates/baseline.json` 里记在它名下的巨大单元数 ≥ 10 记 2 分、≥ 4 记 1 分。总分 ≥ 4 为「深」。另有两个包放在授权脊梁上，也列「深」：`packages/kernel`（`ActionService`：可信身份、`beforeEffect`、撤销后不再写，见 `AGENTS.md` 硬约束）和 `packages/plugin-runtime`（安装、grant、签名）；每个能力调用和每次插件安装都经过它们，体量小，出错的代价最大。其余有 ≥ 1,000 行源码、或有巨大单元、或被 ≥ 3 个包依赖的为「中」，再其余为「浅」。结果：深 11（`apps/local-host`、`apps/workbench`、`horizontal/agent-host`、`modules/goals`、`packages/contracts`、`packages/design-system`、`packages/kernel`、`packages/plugin-runtime`、`plugins/native/coding`、`plugins/native/goals`、`plugins/native/pages`）、中 43、浅 17（现行 §5.1 的计划；I6 按阈值重算建议为深 11、中 42、浅 18，审查时再判定，不机械改已有深度）。深度是计划，不是门禁：以后某个包越过阈值不会让门禁变红，审它的时候再按当时的数重定。

**审查**：「待审」含尚未开始和已开始但未审完；「已审」须在同一 spec 有完整逐包结论和已核实的实现覆盖。现行71包源码均已审，逐包职责、依赖、放置与冗余结论及覆盖核对见 §12.9。缺陷修复和运行未完成项另记于 §12.8/§12.11，不能以代码审完代替整改完成，也不能据 #322 已合入或 §12.6 的历史局部读码记整条防腐线完成；代码审完、缺陷修复、工程通过、产品实操分别判定。

### 5.x 本轮补记的清单项（2026-10-03）

| 项 | 现状 | 证据 | 处理 |
| --- | --- | --- | --- |
| `apps/workbench/src/i18n/en.ts` 无引用的译文 | 约 1,489 条键在源码里找不到（全文件约 3,640 行），译文表一大半是死数据 | 脚本逐键在 `apps`、`plugins`、`packages`、`modules`、`horizontal`、`server`、`tooling`、`examples` 的源码里查找（排除 `dist`、`node_modules`）；抽查「官方连接方式」「计划与执行看板」「钉住预览」只在 `en.ts` 出现 | 死代码清理一片：删无引用的键，把动态拼出的文案改成常量后再删；健康门禁随之下调 |
| `tests/ppt-actions.e2e.test.ts` 下载竞态 | 读到 Chrome 先建的空文件就停，main 上 3 次 2 次失败 | A4b-3b 相关用例与基线对比 | 已修：[#214](https://github.com/molis-ai/molis-work/pull/214)（等文件写完再读，断言不变）。`tests/alchemist-workbench.e2e.test.ts` 读导出有同样写法，尚未见失败，留待测试稳定性一片一起改 |
| 演示稿对象的两套种类名 | PPT 的动作（`ppt.*`）声明 `subject_kinds: ["ppt"]`，对象读取、搬动、搜索、侧栏与成果来源用 `presentation` | `plugins/native/ppt/src/actions.ts`（`subject_kinds: ["ppt"]`）对 `search.ts`、`defineObjectMoveAction("ppt.placement.move", ["presentation"])` | 统一成 `presentation`；改动方的发现与授权都按种类匹配，要连同读它的用例一起改 |

## 5a. 门禁先行（§5 第 1 步，方案）

先接进 CI、防止边整理边恶化。每个门禁都有入库的基线文件，「只减不增」；改动后用突变验证（故意违反一次，确认 CI 变红）。

| 门禁 | 机制 | 基线 | 突变验证 |
| --- | --- | --- | --- |
| 静态检查最小规则集 | ESLint（或 Biome）只开几条：无未用变量与导入、无空 catch（显式注释的除外）、无 `as unknown as`（现有处数进基线） | `tooling/gates/lint-baseline.json` | 新增一处空 catch |
| 公开 API 快照 | 插件 SDK、contracts 各 subpath 的导出（名字加签名，去注释）由编译器的声明输出生成、文件入库；源码和快照有任何不同就失败，要改用 `pnpm api:update` 有意刷新，PR 里说明兼容影响（`scripts/gates/api-snapshot.mjs`） | `tooling/gates/api/<包>/<subpath>.txt` | 新增一个导出不更新快照（`tests/health-gates-api-snapshot.test.ts`） |
| 巨大单元只减不增 | 按 §4.5 阈值（文件 800 行、类 300 行或 25 个方法、函数 150 行）统计，超出的列名单 | `tooling/gates/giant-units.json`（开工时 37 个文件、43 个类、99 个函数） | 新增一个 160 行函数 |
| 装配名单只减不增 | 已有 `tests/builtin-plugin-assembly-gate.test.ts`，接进 CI | 冻结名单 | 加回一个 `*-native-plugin-http.ts` |
| 分层与依赖方向 | 已有 `pnpm boundary:check`，按 `PACKAGE-BOUNDARIES.md` 补上「向上依赖」与「插件互引」的统计 | 现有规则 | 插件 import 另一插件 |
| 测试不新增内部引用 | 统计测试里 `../<区>/*/src/` 与 `dist/` 的引用处数，只减不增 | 开工时 959 + 34 处 | 新增一处内部引用 |
| vendored 包数量 | `vendor/prologue-sdk/*.tgz` 不超过 2 份 | #170 合入后 1 份 | 放回一份旧包 |
| spec 状态句与根目录 | `specs/` 根目录每份都有状态句；只许在做的与现行规范 | 当前根目录 | 新建一份没有状态句的 spec |
| 兼容逻辑不回流 | 源码不再出现 `ALTER TABLE`、`ensureSqliteColumn`、旧产品名与兼容标记（建库基线与允许名单除外） | 删兼容后为 0 | 加一处 `ALTER TABLE` |
| 页面资源预算（§4.8，用户决定 #17） | 宿主 `apps/local-host/src/web-assets.ts` 里写成字符串字面量的每个 `/assets/` 路径（三份样式表、`molis-work-workbench.js` 与 `molis-work-capabilities.js` 两份脚本、Pages 编辑器、各插件客户端包、字体）向构建产物要内容，量发出去的字节数；预算文件（当前的与 merge-base 的）里读不到路由、宿主却还在发的路径照样量并按发现遗漏失败，所以删条目躲不掉；读不成整条字面量的写法（模板、拼接、前缀）、拿请求路径和非字面量比较、文件里除整条 `/assets/…` 字面量和插件包那一条已知正则以外还出现单词 `assets`（正则或带转义斜杠的写法：`\/assets\/`、`[\/]assets`、`(assets)`），退出 2；CI 在 `workspace:verify` 之后跑，预算文件与 merge-base 里的那份比，调大数字、加条目、删仍在发的条目都放不过；数字必须等于实测 | `tooling/gates/page-assets.json`（先冻结，默认只许变小；2026-10-18 起是体积控制、不是硬上限，功能必需的增长经评审在 `APPROVED_CEILINGS` 一次性放行，见决策记录） | 工作台样式表多一个字节；新增一个 `/assets/` 路由（含写成正则的，但把 `assets` 一词本身拆开的除外，见没覆盖的几项）；手改预算调大；把路由改成读不到的写法并删掉预算条目 |
| 独立整页（artifact-positioning S7） | 除例外清单外没有路由返回完整 HTML；插件内容里不出现自带外壳；站内链接不跳出工作台 | [artifact-positioning §4](../archive/artifact-positioning/spec.md) | 加一个返回整页的路由 |
| 成果库声明（artifact-positioning A7） | manifest 声明与实际写入一致；可见类型必须有预览；交换数据不进用户可见列表 | 同上 | 写一个未声明的类型 |
| 文档引用（W1-06） | 活文档（`archive/` 之外的 `.md`）没有断链（含标题锚点）；`skills/`、`AGENTS.md`、`docs/system/CALL-CHAINS.md` 引用的路径、`pnpm` 脚本与动作 id 存在；`specs/README.md` 索引与根目录分类一致；`specs/BACKLOG.md` 没有完成行 | 从 0 开始，没有基线；有意的例外在 `tooling/gates/doc-citation-exceptions.json`（带理由，不再需要就要删） | 加一处断链、引用一个不存在的 id、少列一份 spec、留一行已完成 |
| 仓库形状（W1-06） | 根目录只放 `tooling/gates/root-allowlist.json` 里的名字；`.impeccable/` 入库文件按组只许减少；`contracts` 不许有只导出描述符且没人用的占位子路径 | 根目录与 `.impeccable/` 对照 merge-base 只许减少（开工时：根目录 3 个越界条目、1,104 个 `.impeccable` 文件）；`contracts` 占位子路径没有基线，W2-01 删光 6 个之后出现一个就失败（开工时 6 个） | 根目录加一个文件、往评审组加一张图、加一个占位子路径 |

**进度**：

- 第一批已做：[#179](https://github.com/molis-ai/molis-work/pull/179)，`pnpm health:check`，接进 CI。覆盖巨大单元、测试内部引用、vendored SDK 份数、就地补表、spec 状态句。
- 开工基线（main 2b138559）：巨大单元 182（文件 37、类 48、函数 97），测试内部引用 1016，vendored SDK 1，就地补表 115。
- 突变验证四项都失败。
- 实例：基线若从 98984bf7 起算，#171 会被拦下。它让 `events-primary.ts`、`navigation-feed.ts`、`craft-finish.ts` 三个超长文件又变长，并新增 2 处测试内部引用。
- 公开 API 快照（W1-04，2026-10-08，分支 `chore/gates-api-snapshot`）：contracts 的 64 个 subpath 加插件 SDK 共 65 个文件，口径和刷新命令见 `tooling/gates/README.md`；每条声明各占一段（函数的每个重载、同名的类型与常量都在），导出提到、却没有任何 subpath 导出的声明（如 `GoalWorkEventBase`）列在辅助声明里；`pnpm health:check` 比较源码与快照，`--base` 时在日志里列出相对 merge-base 的 API 变化。同一片接上了空 catch（TypeScript 代码与浏览器脚本的模板字符串各记一项）、`as unknown as`（含测试）、旧名（`goalboard`、`board_id`，只数源码）三类按文件计数（浏览器脚本一项也只数源码），口径写在 `scripts/gates/source-counts.mjs` 开头。静态检查工具（W1-09）仍待做，它接进来后替换 TypeScript 代码这部分的计数。每条新规则的突变验证是 `tests/health-gates-source-counts.test.ts`、`tests/health-gates-api-snapshot.test.ts`。
- 文档与仓库形状门禁（W1-06，`scripts/gates/`，说明见 [scripts/gates/README.md](../../scripts/gates/README.md)）：接进 `pnpm health:check`，突变用例在 `tests/doc-reference-gates.test.ts`（CI 单独一步）。开工时门禁量到 7 处断链，已改：`plugins/native/plugin-builder/DESIGN.md` 5 处指向 S1b 已删的文件、`specs/molis-work-architecture-reorganization/f2-validation.md` 2 处指向已删的 `docs/system/MIGRATION.md`，都改成不带链接的说明；Skill `elements.md` 里的 `functions.evaluate.v1` 是故意写的反例（`.v1` 后缀是 id 的一部分、不是版本，所以是另一个 id；代码里没有它），文字不改，写进 `tooling/gates/doc-citation-exceptions.json` 并带理由。哪些顶层文件夹算文档、哪些路径写法算引用，都从 `tooling/gates/root-allowlist.json` 取（`scripts/gates/allowlist.mjs` 的 `allowedRoots`），不另存名单；名单之外的根目录条目（`outputs/`、`.zcode/`）不查链接、不读引用（W1-23 移走）；`contracts` 的 6 个占位子路径已由 W2-01 删掉，这条规则现在是「一个也没有」：没有基线、算问题（`contract placeholder: …`），出现一个就失败。
- 页面资源预算（W1-07）已做：`scripts/gates/page-assets.mjs`、`pnpm page-assets:check`，CI 在 `workspace:verify` 之后一步，规则用例 `tests/page-assets-budget.test.ts`（临时仓库 + 假宿主构建 + 本仓库真构建）。冻结时（`f876a503` 上的构建）量到 29 个文件、11,481,575 字节：工作台样式表 1,946,506、设置样式表 1,341,060、开场样式表 1,022,266、工作台脚本 1,414,769、Pages 编辑器 1,051,178、21 个插件客户端包（coding、files、git、diff、text-stats 各约 498 KB，合计 3,442,954）、两个字体。这是冻结值，不是目标，现行数字以 `tooling/gates/page-assets.json` 为准：旧皮肤删完后再定真实上限（`VISUAL_FOUNDATION_STYLES` 现在把五套旧皮肤拼进每个页面）。宿主不压缩这些响应，所以量的是原始字节。评审发现的洞已补：改写路由让读源码读不到、再删预算条目，原先 `--base` 全过；现在预算里的每个路径都向构建产物要一遍（`tests/page-assets-budget.test.ts` 的「discovery」几例，在假宿主构建上走完整的基线分支流程；同一手法在本仓库构建的临时副本上，修前 `--base` 通过、修后失败），读不成整条字面量的写法（模板、拼接、前缀），以及拿请求路径和非字面量比较，都退出 2。评审补的：`\/assets\/` 不是整条 `/assets/`，原先既不计入提及次数也躲过比较检查，新增一个按这种写法的路由会通过；先补成「认 `\/assets`、`assets\/`、`[/]assets` 相邻的写法」，复审用 `[\/]assets[\/]`、`(assets)` 绕过了，所以改成按单词认：把整条 `/assets/…` 字面量和插件包那一条已知正则（`/^\/assets\/molis-work-plugins\/([a-z0-9-]+)\.js$/`，id 来自已登记的工作台包）从代码里拿掉以后，文件里不许再剩单词 `assets`（注释不算），剩下的一律退出 2，不管它是正则、带转义斜杠的字符串还是别的用法。现在 `web-assets.ts` 里恰好 9 处这个词，1 处插件包正则、8 处字面量；以后在这个文件里为别的用途写 `assets`（比如导入 `./assets.js`）也会停下来，改写或教会脚本都行。

页面资源预算没覆盖的几项（脚本头部写着同一份清单）：

- 只读 `apps/local-host/src/web-assets.ts`：别的宿主文件里新增的 `/assets/` 路由看不到，不管怎么写。今天只有 `serveWorkbenchAsset` 回应 `/assets/`（`web-server.ts` 把请求交给它），所以现在成立；新增这类路由要靠评审。
- 写法既读不出（拆成两段字符串拼接、`\x2f` 或 `\u002f` 转义、运行时拼出，或把 `assets` 一词本身拆开的正则，如 `asset[s]`、`a(?:ss)ets`，这些文本里不剩单词 `assets`）、又不在任何预算里的新增路由，只能靠评审 `web-assets.ts` 的改动；已在预算里的路径不受影响，照样向构建产物要。把这一项收紧要换成真正的解析（读出所有正则字面量再逐个判断）。
- 比较检查认标识符 `pathname`，即 `web-assets.ts` 给请求路径起的名字：参数改了名、又拿别的文件导入的常量去比，看不到；常量声明在 `web-assets.ts` 里则读得到它的字面量。
- 把字节从被量的资源挪进页面 HTML 里内联的 `<style>`、`<script>`（`side-view-document.ts` 已经这么做）不量；首屏 HTML 的大小与首屏时间要带数据的宿主，这个门禁没量。插件客户端代码从 `/assets/molis-work-plugins/` 搬走（迁到 Plugin Runtime）时，条目随之删除是允许的，那部分重量离开这个预算，要由 Runtime 一侧另算。
- 终端客户端 `dist/web/pty-client.js`（根 `pnpm build:pty-client` 生成，CI 不跑）。
- 只在 macOS 上量过；输出不随语言、时区、路径变，但 Linux CI 上的第一次运行才是核对。

工作流上要知道：冻结按资源、等号严格，也没有像巨大单元那样的例外文件（用户决定 #17 就是这样写的），所以合入后，任何给 `workbench.css`、`workbench.js`、`settings.css`、`arrival.css` 或某个插件包多加一个字节的在途界面 PR 都会在 CI 里红，除非它在同一个资源里省回同样多；两个 PR 都压低同一个资源时会在 `page-assets.json` 的同一行冲突，合并后要重新 `--update --base origin/main`。2026-10-18 用户改了这一条：体积是控制，不是硬上限。功能确实需要、在同一个资源里又省不回的增长，PR 写明理由、字节数与试过的省法，评审认可后在 `scripts/gates/page-assets.mjs` 的 `APPROVED_CEILINGS` 加一条一次性放行（只认 merge-base 的准确数字，上限等于实测），合入后照样冻结；一个资源一次涨超过 10 KB 或新增资源，先问用户。

CI 目前只跑边界、类型、合同与炼金术士（`.github/workflows/ci.yml`）；以上门禁都以非浏览器用例或脚本形式加到 `architecture-boundaries` 作业里，时间预算 3 分钟以内。

## 6. 安全不变量（§4.18，W2-19 已落地）

初稿的 9 行已展开成 21 条，搬到 [docs/system/SECURITY-INVARIANTS.md](../../docs/system/SECURITY-INVARIANTS.md)：每条写明拒绝什么、代码位置、断言拒绝本身的测试；门禁（`pnpm health:check` 的 `security invariants` 规则）看住这张表，CI 的 `Security invariants` 一步（`pnpm test:security`）跑其中 Linux 上能稳定跑过的部分，只能在 macOS 上跑的（Seatbelt 沙箱、真 Chrome）与较重的整机用例留在本机。这一步先不挡合并（`continue-on-error`，决定 #14 的口径：产品用例约两周的 `linux-probe` 之后才并入 `Verify`，W2-16 一起做）。

初稿各行现在对应：Web 只绑回环地址 S-01；变更请求要控制令牌、同源 Origin、一次性操作键 S-02、S-03、S-06；跨进程网关（动作网关，以及删除项目的内部网关，后者 2026-10-10 补进）只接受回环 http S-07；MCP 逐客户端授权 S-08；插件权限与沙箱 S-15；密钥只给引用 S-12；侧栏浏览器站点策略与逐步确认 S-16；提示注入防护 S-13；路径与 URL 校验 S-09、S-10、S-11。初稿漏掉的也补进来了：终端与浏览器 socket S-04、控制令牌之前没有别的通道 S-05（原为 Casebook 通道，10-10 随 Casebook 删除改写）、可信身份 S-17、取消后不再写 S-18、推送前扫密钥 S-19、桌面 IPC 范围 S-14（F15/D9）、表本身为真 S-20、页面不被别的站点嵌进框架 S-21。

写测试时找到、补了拒绝的缺口（每一处都先写出会失败的测试，再做最小修复）：

- `/locale` 在主机头检查之前处理，外来 `Host` 也能拿到 302（现在所有路由先查 `Host`）；
- `/api/` 与 `/projects/<id>/api/` 之外的变更请求不过令牌检查，只靠各处理器碰巧都在 `/api/` 下（现在一律 403，IM 挂载自己查）；
- 终端 socket 的第一条消息里令牌不是文字时抛异常、socket 不关（现在按验证失败处理并关闭）；
- 插件创作台的网络门（`plugin-builder/network.ts` 的 `publicAddress`）认不出 `::ffff:7f00:1`、6to4、Teredo、`::127.0.0.1` 写法的私有地址，自定义 RSS 的解析地址检查认不出多播、NAT64、6to4、Teredo 和文档网段（现在前者委托给沙箱代理的 `isPublicAddress`，只多放过用户决定的 `198.18.0.0/15`，后者按 2000::/3 判断）；
- 宿主的页面和回答可以被别的网站嵌进框架（点击劫持）：页面里就有控制令牌，点击发生在真页面里，S-03 的 Origin 检查挡不住。现在请求入口给每个回答加 `X-Frame-Options: SAMEORIGIN`，`PAGE_CSP` 加 `frame-ancestors 'self'`（S-21）。创作台的页面带着控制令牌却没有自己的 CSP，所以头在入口统一加，不只加在 `PAGE_CSP`。不受影响的已核对：插件侧栏、创作台、群聊都是同源框架且没有 `sandbox` 属性；桌面壳（`apps/desktop/adapters/tauri/src/main.rs`）把窗口 `navigate` 到 `http://127.0.0.1:4173`，作为顶层文档加载；仓库里找不到任何跨源嵌入宿主页面的地方。如果用户要让某个别的网站嵌入宿主页面，要在这里和 S-21 里明说加例外，不是默认。

“是不是本机地址”原来在源码里各写一份（初稿列了 8 处：`action-gateway.ts`、`browser-socket.ts`、`configured-models.ts`、`connector-api-oauth.ts`、`connector-mcp.ts` 两处、`im-server.ts`、`web-http.ts`，实际还有 `pty-socket.ts`、模型供应商、Notion、Casebook、Images、Gmail、连接存储、外部 MCP、管理命令、群聊服务共 22 处），允许的写法也不一样。现在收成 `packages/contracts/src/platform/loopback.ts`（`isLoopbackHostname`、`isLoopbackHttpUrl`、`isLoopbackHttpOrigin`、`loopbackHost`，S-09），这些地方都问它。三处因此变宽，都是原来错拒了合法的回环写法（`new URL("http://[::1]").hostname` 带方括号，原来的写法拿它跟不带括号的 `::1` 比）：终端 socket 认 `[::1]` 作 `Host`（S-04 的测试断言它仍要令牌），Gmail 回调认 `[::1]`（`tests/gmail-oauth.test.ts`），创作台验收浏览器认 `[::1]` 作预览地址（`tests/agent-built-plugins-components.test.ts` 断言它拒绝其他一切）。

创作台的网络门改成委托给沙箱代理的 `isPublicAddress`，策略因此不只是补上上面那几种写法，还有这些变化（`tests/agent-built-plugins-network.test.ts` 逐条断言）：IPv4 变宽：原来整个 `192.0.0.0/16` 都拒，现在只拒 `192.0.0.0/24` 和 `192.0.2.0/24`，`192.0.1.0/24` 与 `192.0.3.0`–`192.0.255.255`（例如 WordPress.com 的 `192.0.78.x`）可达；IPv4 变严：`198.51.100.0/24`、`203.0.113.0/24`（文档网段）和 `192.88.99.0/24` 原来可达，现在拒；IPv6 变严：只认 `2000::/3`（去掉 6to4、Teredo、`2001:db8::/32`、`3fff::/20`），所以 `::ffff:<公网 IPv4>` 这样的映射写法原来按里面的 IPv4 判断而放行，现在一律拒（DNS 解析本来就不会答出这种地址，影响只在构造的输入上）。`198.18.0.0/15` 的例外（用户 2026-09-27 的决定）不变。

## 7. 需要用户操作的事项

- **W2-02 留下的三项产品判断（BL-121）**：① 决定回执（Goal 页采纳或退回方案后的「已记录你的决定」）：有入口，选项：保留现状（建议）；只留一条 toast；删掉回执。② `?feed-start=1` 与 Feed 的「开始处理」链：界面上的按钮已经撤了，但 HTTP `POST /api/feed/items/:id/start`、`feed.item.promote` 的输入 `start_processing`（对 Agent 和 MCP 公开的动作合同）、`processing` 去向、终端自动填入还在，并有测试守着。选项：整条链一起删（建议，入口已撤，要在一个 PR 里改动作合同、路由、终端和测试）；恢复一个按钮；保持现状。③ 紧凑密度下 Goals 列表（stage list）里子目标的缩进：`momentum.ts` 写 8px/4px，`goal-canvas.ts` 给列表写的是 0（扁平），现状是缩进赢（靠一个已删守卫多出的一级特异性），为了不改变界面我保持了现状（`.tree-children.tree-children`）。选项：保持缩进（建议，界面不变）；改回扁平（紧凑密度下列表的子目标不再缩进，随 W5-05 的视觉验收一起定）。
- **W2-02 留下的两个代码层取舍**：Goals 插件的「最近处理结果」贡献现在没有挂载点（见 §3.5），建议由 Goals 的主人在「挂到 Goal 文档」和「连同三处 DD2 守卫退役」里选一个；`PRODUCT.md:88`、`README.md:94`、`README.zh.md:94` 还写着「决定中心」（那一页早就只是 Inbox 的壳，现在连壳也没有了），改文字要按 W1-02 的规矩先把 `PRODUCT.md` 的 diff 给用户看，建议改成「决定卡片」。
- ~~**W2-18 带出的 15 项待用户决定**~~：2026-10-09 已弹窗问完，结论见 §1「W2-18 产出的决定」；落实在第 2 波 B 批（W2-18 后续）。其中第 2 项（实验的 `grok`/`laya` 本地调用要不要进 AGENTS.md）2026-10-10 随实验插件删除作废，落实时不加这一条。

- **助理库里已存轮次的补标记（执行证据未验证，继续待核）**：「你说过」和从工作里提炼只认本人打的轮次（[horizontal/memory/README.md](../../horizontal/memory/README.md)）；新写入的轮次由宿主和工作台标 `written_by`，之前的构建存下的轮次没有标记，被当作本人打的。补标记是对 `assistant/assistant.db` 的一次维护，只改 `assistant_rounds.body` 里的 JSON，不改库结构和版本：请求标识 `fu-…` 的（定时安排）补 `host`，`msg-…` 的（插件交办）补 `page`，文字正好是浏览器交还那一句、或“建议「…」没有执行：…请读取最新状态，按现在的情况重新准备这一项的操作卡。”（中英文界面各一种写法）的补 `page`。脚本按合同变更流程第 3 节第 4 条放在会话临时目录、不入库，已在用真实助理库代码建的临时库上演练过（干跑不改、应用后只改这几类、再跑一遍无事可做）；真库上照维护三、四的做法：用户批准并定时机、停进程、整份备份、先在拷贝上演、再就地改、只读核对，可以并进下一次维护窗口。补之前，把某条旧的定时或交办轮次整条照抄进 `remember` 仍会记作“你说过”。
- ~~真实 Home 维护四的时机~~：已定（§1 2026-10-08）：合入后立刻做，并在同一窗口里清掉以前删项目留下的孤儿数据（先在拷贝上列出各库、各多少条给用户看，再在真库上删；整份备份里保留）。
- **常驻服务 4173 的状态（2026-10-12 校正）**：10-03 停旧服务是历史事实；维护六用 `72137e89a`、维护七用 `9f9bda551` 已重装同版本 0.2.0 的新构建，见 §4.1 与发布检查清单。原「还没装新版」已失效。维护七 `service status` 为 absent，本次 4173/4207/4208 均无监听，只能确认未在运行，不能声称已启动新版；重启/真实 Home 新候选的验证继续按既有维护窗口处理，不照旧 plist 指令盲目重启。
- **旧成果表的备份**：`~/.molis-work-backups/2026-10-03-drop-old-artifact-tables/`（18 个项目库，148 MB，逐个 `integrity_check` 通过、行数与删除前一致）。确认不再需要后由用户删除。
- ~~**anti-rot**~~：已于 10-03 删除（工作树、本地与远端分支，见 §1），不再需要用户操作。
- **#192–#215 合入后留下的远端分支**（24 条，GitHub 上 Branches 页删除）：`docs/artifact-positioning-progress`、`fix/shell-s6-settings-in-workbench`、`docs/archive-post-merge-review`、`fix/shell-s6b-capabilities-in-workbench`、`chore/shell-s7-page-gates`、`fix/shell-s4-studio-in-workbench`、`fix/shell-s1b-drop-old-builder`、`docs/artifact-positioning-s4-s1b`、`fix/artifact-a6-naming-and-feed-manifest`、`feat/artifact-a2-process-items`、`feat/artifact-a1-contract`、`feat/artifact-a3-import-in-library`、`feat/artifact-a4-consumers`、`feat/artifact-a5-goal-delivery`、`fix/test-functions-harness-host`、`feat/artifact-a5b-pin-deliverables`、`feat/artifact-a5c-deliverable-proposals`、`feat/artifact-a7-declaration-gates`、`feat/artifact-a4b-source-and-references`、`feat/pages-import-entry-back`、`feat/artifact-a4b2-goal-inputs`、`feat/artifact-a4b3-continue-and-side`、`fix/test-ppt-download-race`、`feat/artifact-a4b3b-continue`；以及之后合入的本目标分支。
- 删除已合入的远端分支（自动模式拦下了我执行的删除）：`docs/spec-sweep`、`fix/onboarding-blank-name`、`fix/global-links-in-project`、`feat/one-attention-bell`、`feat/characters-settings-only`、`fix/contextual-live-region`、`test/baseline-timing-defects`、`fix/todo-project-search`、`fix/open-plugin-link`、`fix/jelly-assistant-refresh`、`fix/assistant-undo-refresh`、`fix/narrow-stage-side-panel`、`fix/assistant-claimed-save`、`fix/pages-writing-faithful`、`feat/one-idea-inbox`、`fix/open-plugin-enabled-only`、`fix/todo-search-plain-fields`、`fix/side-browser-stop-revoke`、`fix/button-guard-same-sentence`、`fix/side-browser-wait-no-ask`、`fix/assistant-origin-name`、`fix/builder-model-call-limit`、`fix/test-pages-publication-narrow`，以及他人的 `feature/project-arrival-flow`（#159）、`claude/nostalgic-engelbart-93e407`（#164）。也可以在仓库设置里打开「合并后自动删除分支」。

## 8. 未验证的范围

2026-10-12 复查：下列范围仍不能记为完成，具体 owner、接续切片与验收见 §12.1–§12.4。

- 71 个包的源码、职责与代码放置裁决已完成（§12.9）；必要整改及整改后的运行验证未完成，事实表的“已审”只表示源码审查。
- 所有现行插件及官方接入的失败、取消、撤权、并发、重启恢复和组合使用。旧的 26 插件首轮表包含已删除的 Experiments、未含新增 Issue，不能直接当现行全集。
- 前端第二轮：键盘、读屏、暗色、英文、多窗口、离线、加载/空/失败/部分成功/无权限，以及配置真实模型后的核心路径。已有局部浏览器用例和 31 张首轮截图可复用，但不代表全部覆盖。
- 全部动作的实际生产消费入口、真实返回与声明输出、不同入口的拒绝/持久化/副作用一致性；动作快照只固定声明。
- 测试与有效需求的系统对照，以及跳过项、过度 Mock、自证预期和只测内部方法的复核；迁移到公开 import 不等于测试有效性已确认。
- 最终分支的完整工程检查与 CI、第一步全部跨功能场景、能力/UI 快照差异、真实模型和外部服务路径、用户验收。I5 原始三项失败保留；I6 原始四项失败及跳过项见 §12.5。
- Form Runtime 样板、声明式扩展探针、剩余旧装配、浏览器打包/类型检查、巨大单元、统一 Home 库登记与快照、最终手册/Skill 演练仍随第 4–6 波推进。
- 维护八及新版本对真实 Home 的最终验证尚未完成；§4.1 维护六/七的已有结果不扩展成对所有后续候选的验证。

## 9. main 自检（2026-10-03，main aef917dc）

第二步结构性改动的起点。按用户 10-03 的要求：任务书合入 main 后，逐条复核第一步与成果库改造修过的问题在最新 main 上仍然成立，再对照四份任务要求逐项标出已覆盖、本轮新发现、不适用（第二步还没做的标「待做」并指到本文的计划）。

**方法**：

- 最新 main（aef917dc，含 #219）整体构建后跑全量回归（738 个用例文件），作为本阶段证据，也一次跑过下面每一条的守护用例；
- 守护用例取自每个修复 PR 改动的测试文件（`gh pr view <N> --json files`）；已删除的用例逐个核对去向；
- 「交第二步」与「待决」的条目，用命令在 main 上重新量；
- 界面上的条目以 10-03 的隔离 Home 走查为准（[artifact-positioning §5b](../archive/artifact-positioning/spec.md)）。

### 9.1 回归自检

**全量回归**：3,758 个用例：3,749 通过、2 失败、7 跳过（main aef917dc，10-03 10:47 起）。两个失败都不是旧问题复发，是本轮新发现，都在干净的 main 上复现（3/3 与必现），已修：见 9.4 第 1、2 条（#220、#221）。没有一条第一步或成果库改造修过的问题复发。

**第一步问题表（PMR）**

| 编号 | 当时的处理 | 复核结论 | 证据 |
| --- | --- | --- | --- |
| PMR-01 | 已修 #138 | 未复发 | `context-onboarding-blank.e2e`（全量通过） |
| PMR-02 | 已修 #140 | 未复发 | `announce-guard`、`plugin-notification-bell`、`plugin-event-recovery.e2e`（全量通过） |
| PMR-03 | 已修 #141 | 未复发 | `characters-appearance`、`creative-tools-plugins`（全量通过） |
| PMR-04 | 交第二步 | 状态准确：仍有 38 个重复键（共 3,517 个）；另查出约 1,489 个无引用的键（9.4 #1） | 逐键统计脚本，见 9.3 |
| PMR-05 | 交第二步 | 状态准确：`migrateLegacy` 仍在（15 处） | `git grep -c migrateLegacy` |
| PMR-06 | 交第二步 | **已不成立**：#170 删了 3 份未用的包，vendored 只剩 `side-panel-memory.tgz`；状态改为「已修（#170）」 | `ls vendor/prologue-sdk/*.tgz` |
| PMR-07 | 核实中 | **状态不准**：归档 spec §12.2 已量过（首屏 293 KB HTML、6,041 个节点），处理在第二步「浏览器脚本打包、按需渲染」；状态改为「已量，交第二步」，本轮重量见 9.3 | 9.3 首屏体量 |
| PMR-08 | 部分已做（W2-02） | `/decisions` 页、`#decision-goal-` 跳转、Tauri 测试地址已删，决定中心遗留样式已清（`.decision-empty`、84 处 `data-board-view="decisions"` 守卫、v3 里 117 行旧页外壳、`.feed-decision-work` 及其媒体查询、`navigation-feed.ts` 里查 `.feed-detail--decision, .feed-detail--result` 的两行；`.decision-receipt*`、`.decision-results*` 仍在，见 §3.4 的 PMR-08 行）；决定回执（有入口）和 `?feed-start=1`（界面入口已撤、动作合同还在）交用户，见 BL-121 | `git grep` |
| PMR-09 | 已修（W1-23） | 状态准确（10-03）：`scripts/personal-assistant-public-sources.mts` 仍在；2026-10-08 W1-23 已删，W2-02 核对 | `ls` |
| PMR-10 | 已修 #139 | 未复发 | `project-page-links`（全量通过） |
| PMR-11 | 已关闭 | 不适用 | — |
| PMR-12 | 核实中 | **状态不准**：助理会话 9-30 已修（c48a8608，在 main）：左栏看不到时对话顶部一行给出状态与暂停、继续、停止；抽屉开着时点对话区先收起抽屉。当时用替身在 800、1440 核对，**没有自动守护用例**（9.4 #9） | `git merge-base --is-ancestor c48a8608 main`；`assistant-dock.ts` 的 `data-assistant-strip` |
| PMR-13 | 已关闭 | 不适用 | — |
| PMR-14 | 已修（W2-02） | `assistant-island.ts` 的 `L("正在看") + "："` 已改成 `L("正在看：{title}", { title })`；同类拼接还有 66 处，并进 W5-03 | `git grep`、`tests/assistant-island-script.test.ts` |
| PMR-15 | 已做 | 已做（BL-088，2026-10-27）：动作、路由与 MCP 的拒绝是 PG-013（S-72）；移除 Pages 后项目搜索不再命中、助理与 MCP 调不到、加回后都恢复且文档还在，由 RAC-1116 证明；切换器上「移除」的说明改成「在本项目停用；数据保留，加回即恢复」 | `tests/plugin-remove-reach.test.ts`、`tests/security-invariants-hidden-personal-plugin.test.ts` |
| PMR-16 | 已修 #144 | 未复发 | `system-search`、`todo-actions`（全量通过） |
| PMR-17 | 已关闭（未复现） | 不适用；第二步重跑场景 1 时留意 | — |
| PMR-18 | 已修 #146 | 未复发 | `jelly-outside-changes.e2e`（全量通过） |
| PMR-19 | 已修 #151 | 未复发 | `assistant-business-gateway`、`announce-guard`（全量通过） |
| PMR-20 | 已修 #145 | 未复发 | `context-onboarding-todo.e2e`（全量通过） |
| PMR-21 | 已修 #148 | 未复发 | `assistant-undo-refresh.e2e`、`assistant-undo`（全量通过） |
| PMR-22 | 已修 #153 | 未复发；`jelly-material` 随灵感页一起删除 | `jelly-*` 其余用例（全量通过） |
| PMR-23 | 已修 #149 | 未复发 | `side-panel-narrow-stage.e2e`（全量通过） |
| PMR-24 | 已修 #152 | 未复发（提示词 v2 仍在）；真实模型回放不在全量里，未重跑 | `pages-plugin`（全量通过） |
| PMR-25 | 已修 #154 | 未复发 | `open-plugin-link.e2e`（全量通过） |
| PMR-26 | 已修 #155 | 未复发 | `todo-actions`（全量通过） |
| PMR-27 | 已修 #157 | 未复发 | `side-panel-assistant-surface`（#157 加的 3 条，全量通过） |
| PMR-28 | 已修 #158 | 未复发 | `assistant-business-gateway` 反例（全量通过） |
| PMR-29 | 已修 #160 | 未复发 | `side-panel-assistant-surface`（全量通过） |
| PMR-30 | 交 BACKLOG | 状态准确 | BACKLOG |
| PMR-31 | 已修 #162 | 未复发 | `assistant-origin-name.e2e`（全量通过） |
| PMR-32 | 交 BACKLOG（BL-104） | 状态准确 | BACKLOG |
| PMR-33 | 已修 #163 | 未复发 | `agent-built-plugins-agent`（全量通过） |
| PMR-34 | 修复中（#172） | **状态不准**：#172 已合入（35257cd9），应为「已修」 | `plugin-builder-stage.e2e`（全量通过） |
| PMR-35 | 修复中（#182） | **状态不准**：#182 已合入（141f6cef），应为「已修」 | `agent-built-plugins-agent`（#182 加的重叠保存用例，全量通过） |
| PMR-36 | 交后续（BL-113） | 状态准确 | BACKLOG |

**第一步合并缺陷（§4）**

| 项 | 复核结论 | 证据 |
| --- | --- | --- |
| 冲突标记 | 仍无 | `git grep` 除 Markdown 与锁文件外 0 处 |
| `en.ts` 重复键（PMR-04） | 仍然成立，交第二步 | 38 个键重复（共 3,517 个） |
| Prologue SDK 合成包 | 已收：vendored 只剩一份 `side-panel-memory.tgz`（#170 删了 3 份） | `ls vendor/prologue-sdk/*.tgz` |

**成果库改造（S1–S7、A1–A7、A4b、走查）**

| 片 | 守住它的用例 | 复核结论 |
| --- | --- | --- |
| S1 删独立工作区、演示记录（#176） | `shell-page-gate`；`plugin-page-workspace` 随功能删除 | 未复发：`renderPluginPageWorkspace` 0 处 |
| S1b 删旧创作台（#198） | `agent-studio.e2e`、`plugin-builder-stage.e2e`；旧创作台用例随功能删除 | 未复发：`/plugin-builder` 整页路由 0 处 |
| S2 直达链接打开工作台（#177） | `shell-direct-links.e2e`、`shell-page-gate` | 未复发 |
| S3 沙箱框只在工作台里（#186） | `plugin-builder-stage.e2e`、`agent-plugin-identity` | 未复发 |
| S4 创作台去框（#197） | `agent-studio.e2e`、`plugin-builder-stage.e2e` | 未复发 |
| S5 文件在工作台里预览（#187） | `shell-file-preview.e2e`、`artifact-reference-ui` | 未复发 |
| S6、S6b 设置与能力库进工作台（#193、#195） | `settings-direct-access`、`capabilities-in-settings.e2e`、`project-settings-*.e2e`、`functions-draft-retention`（#206 补了用例装配） | 未复发 |
| S7 整页门禁（#196） | `shell-page-gate`（CI 里跑） | 未复发 |
| A1 合同（#202） | `artifacts-module`、`artifact-subject-context`、`artifact-browser` | 未复发 |
| A2 交换数据迁回 owner（#201） | `artifact-type-gate`、`coding-artifacts` 等 Coding 用例 | 未复发 |
| A3 导入只在成果库（#203）；Pages 恢复自己的导入（#211） | `artifact-document-import`、`artifacts-actions-browser`、`pages-import-entry.e2e` | 未复发：`/artifacts/import` 整页 0 处（只剩 `POST /api/artifacts/import`） |
| A4a owner 预览（#204） | `artifact-browser`、`artifact-type-gate`、Forms/PPT/Dataset 的 MCP 用例 | 未复发 |
| A4b-1 原文已改、被谁引用（#210） | `artifact-source-and-links` | 未复发 |
| A4b-2 作为 Goal 的输入（#212） | `goal-artifact-inputs`、`artifact-goal-input.e2e` | 未复发 |
| A4b-3a、3b 从这一版继续、侧栏预览（#213、#215） | `artifact-continue`、`artifact-continue.e2e`、`side-files-artifacts`、`artifact-type-gate` | 未复发 |
| A5a、A5b、A5c Goal 交付、当场固定、提议（#205、#207、#208） | `goal-deliverables`、`goal-deliverable-proposals`、`goal-event-document.e2e`、`goal-events-state` | 未复发 |
| A6 命名与 Feed 声明（#200） | `artifact-browser`、`immersive-workbench.e2e`、`plugin-declarative-mounting` | 未复发 |
| A7 声明门禁（#209） | `artifact-declaration-gate`、`artifact-type-gate`（CI 里跑） | 未复发 |
| 走查发现（#217、#219） | `pin-toast-opens-version.e2e`、`artifact-walkthrough.e2e`（1440、390） | 未复发 |
| 用例缺陷（#206、#214） | `functions-draft-retention`、`ppt-actions.e2e` | 未复发 |

**已删除的守护用例**：`plugin-page-workspace.test.ts`（S1 删了独立工作区）、`plugin-builder-{browser,visual}.e2e`、`plugin-builder-{presentation,publication,runtime,workflow}.test.ts`（S1b 删了旧创作台）、`jelly-material.test.ts`（PMR-22 自己的修复 #153 去掉了 Jelly 灵感）。都是随被删的功能一起删，没有丢失守护。

### 9.2 对照任务要求的补查

2026-10-08 刷新：#290（本 spec 的进度合入）、#293–#298 已在 main，本节按 `ba223d95`（并含 #314–#323）重对一遍；10-03 的初版结论保留在 git 历史里。

**第一步任务书（main 上的新版）**：新版比归档时的旧版多两条要求——

1. 「本步的修复不新增任何兼容或迁移逻辑」：已覆盖。第一步的修复 PR（#137–#185）里只有 #176 动了带 legacy 字样的文件，且是删除（`legacy-actions.ts` −33 行、`alchemist-legacy.ts` −14 行）。成果库改造的 A1、A2 新表写进现有的建库语句，没有新增迁移步骤。
2. 场景 9 改为「拷贝一份我（以及同事）正在用的 Home，用当前 main 打开，看能不能正常用」：**已做**（10-04，main 818d0aff，见 §9.4 第 12 条）。10-03 删了真实 Home 的旧成果表、停了 4173；拷贝在会话临时目录里用当前 main 打开，成果库从空开始，符合预期。

其余各节的完成标准见第一步归档 spec §13.1，复核结论同上表。

**第二步任务书**：

| 节 | 结论 | 指向 |
| --- | --- | --- |
| §3 先量化现状 | 已量（10-02、10-03），本节 9.3 重量；收尾用同一批脚本再量（W6-04） | §2、§9.3 |
| §4.1 清除兼容逻辑 | 已完成（10-07）：兼容逻辑删到只剩下面保留的机制；每个库一份当前 schema、版本不符拒绝；真实 Home 维护三已做并逐库核对；防回流门禁在 CI（#283） | §4.1 末尾 |
| §4.2 调用链文档 | 部分（W1-14 已做，#319）：[`docs/system/CALL-CHAINS.md`](../../docs/system/CALL-CHAINS.md) 八条链，每个环节写归谁、输入输出、身份与权限、失败时、事件与记录，§10 登记长期例外与已定要修的偏离；`specs/action-architecture/spec.md` §3 末尾的「基本合同复核」逐类核对了八类新合同（缺口 G1–G9，见 §3 N-04）。余：调用 id 贯通 W3-01；§10 末尾列的一批只走 HTTP 的写入还没有逐条盘点 | roadmap §4.2、`docs/system/CALL-CHAINS.md` |
| §4.3 分层与边界 | 部分：N-03 已按决定 #2 记为「平台产品服务」（#296），记忆与放置两页已补（`docs/horizontal/memory.md`、`placement.md`，#319），代码不搬；N-12 方案已定（决定 #1），Goals 无调用方的桥已删、Feed 升格改走 Goals 的动作（W2-08，2026-10-09），工作区读单一 id 已做（W2-09，#348），其余的桥与 host_only 改成可用性策略待做（W3-07），Casebook 已整个删除（10-10 决定，W3-08 改为删除）；N-04 的基本合同复核已做（缺口 G1–G9）；边界规则 W1-05（还没有合入 main） | §3 N-03、N-04、N-12 |
| §4.4 包级清单 | 部分（W1-18 的第一个 PR 已做，#322）：事实表是 70 个包，带层、状态（在用 42、Runtime 7、构建期 18、非产品 3）与计划深度（深 11、中 43、浅 16），`scripts/gates/package-inventory.mjs` 在健康门禁里守表；逐包深审（深 11、中 43）与浅审（16）待做，审查列现在 70 个都是「待审」 | §5.1、§5.2 |
| §4.5 巨大单元 | 部分（W1-19 已做，#320）：门禁对照合并基点，只减不增（164 个单元）；`docs/system/HUGE-CLASS-MIGRATION.md` 重写为每个单元一个判定（拆、归线、例外）和计划，2026-09 的迁移记录移入 `docs/archive/huge-class-migration-2026-09.md`；`tooling/gates/giant-exceptions.json` 登记 3 个必然很长的单元（原 4 个，Coding 样式表已降到阈值以下），由门禁校验；2026-10-25 起本身合理的巨大单元不硬拆，标明 `kind`、理由与实测 `size` 即放行新增与变大（§1 当天一行）。W4-06 已做（#498）：`prologue-node.ts` 的文件与 `initializePrologueNodeAdapter`、`startAgentRun` 三个单元拆成九个模块，初始化只剩组合。W4-07 已做：Coding 的 `routes.ts` 与 `codingRouteBindings` 按资源拆成七组路由。W5-07 已做：`handleMolisWorkWebRequest`（368 行）与它内嵌的项目回调（271 行）两个单元改成按顺序尝试的路由表（`web-route-table.ts` 的 `WebRoute` 与 `dispatchWebRoutes`），入口只剩解析前、解析与分支；表在宿主里写，不按路线原话让 25 个 `*-http` 模块各自导出 `{match, handle}`：其中 16 个是冻结名单上的 native-plugin-http，改它们会把枢纽冲突扩到每个插件的 PR，表的顺序就是路由顺序、一处可读（统筹 10-17 定）。点名插件包的条目（各插件、Feed 与 Inbox 的判断、Goals、成果、胶囊）留在 `web-request.ts`，平台条目进 `web-project-platform-routes.ts`，目录外的那串进 `web-catalog-index-routes.ts`，一次项目请求的上下文进 `web-project-context.ts`，所以每个插件在包外被点名的文件数不变。证据：`tests/web-route-table.test.ts` 经公开入口 `createMolisWorkWebServer` 在临时 Home 里发 123 个请求（项目内外、带不带令牌、库不存在、个人空间），记状态码、类型、跳转、错误码与错误句或 JSON 顶层键、页面标题；快照先在 main 上生成并提交，重构后原样通过。原来只读 `web-request.ts` 的边界检查（Goal 读取、Feed 与 Inbox 的路由归属、事实表 SQL、已删的 Coordinator 外观）改为读分发器的全部五个文件（`WEB_DISPATCH_FILES`），只变严。拆分待做：W4-05、W5-09、W5-10 | `tooling/gates/baseline.json`、`docs/system/HUGE-CLASS-MIGRATION.md`、§3 N-08 |
| §4.6 扩展点与插件平台 | 部分（W1-15 已做，#317）：[`docs/system/EXTENSION-POINTS.md`](../../docs/system/EXTENSION-POINTS.md)（15 个方向各写怎么加、现在要改的位置、目标，另有六个下一步功能的推演）、`RUNTIME-MIGRATION.md`（迁移计划与批准的构建期例外）、`THIRD-PARTY-PLUGINS.md`（安装方案，只是计划）；`LOCAL-HOST.md`、`PLUGIN-DEVELOPMENT.md` 的装配说法已改。`skills/molis-plugin-dev/host.md` 的必改步骤与 AGENTS.md 对目录条目的说法已在 W5-02 PR-1a 统一。余：装配名单冻结 18 个（2026-10-10 删实验插件从 19 个减掉 1 个，迁移还没有减过）；迁移从 W4-04（Form）起 | `docs/system/EXTENSION-POINTS.md`、`tests/builtin-plugin-assembly-gate.test.ts`、§3 R-01 |
| §4.7 多人并行 | 部分（W1-13 已做，#314；健康门禁对照合并基点 #293、密钥扫描进 CI #294 更早合入）：`docs/system/PARALLEL-DEVELOPMENT.md`（枢纽文件、排时段、集成分支、基线比对、Agent 锁、清理、PR 体量）、`docs/system/CONTRACT-CHANGES.md`（现在不留兼容期；读取兼容从第一个装到开发机之外的版本开始，日期未到）、`.github/CODEOWNERS` 与 SSOT 各表「归属」列（由 `scripts/package-owners.mjs` 生成，`pnpm boundary:check` 校验）、PR 模板新栏目、`AGENTS.md` 指针。待做：公开 API 快照 W1-04、动作合同快照 W2-15、挑相关用例脚本 W2-17、CI 产品子集 W1-11/W2-16、插件回放工具 W4-01、测试并发隔离 W5-12（#497 已做，2026-10-16 测量见文首）、Prologue SDK 合成负责人（W1-20 提名）、固定记录 main 最新全量数字的位置（`PARALLEL-DEVELOPMENT.md` 没有定义，归 W6-05）；CODEOWNERS 现在只路由包根目录，Coding、Jelly、Shelf 在宿主与外壳里的代码未路由 | §1、`docs/system/PARALLEL-DEVELOPMENT.md` |
| §4.8 改需求的便利 | 待做：页面资源预算 W1-07，翻译检查 W1-08（决定 #16），浏览器代码打包 W4-04、W5-04 | §3 R-07 |
| §4.9 体检报告逐项闭环 | 已闭环（10-08）：附录 A 39 行、报告 §5 的 6 步、§7.5 的 5 条、交接清单 25 项，各有结论、证据、归属 | §3 |
| §4.10 新合同全链路 | 部分：搜索来源与对象读取器、侧栏文件来源、成果库的预览固定比较继续、工作流内容站、插件通知（只对 Runtime 插件）、撤销声明在使用端的授权，都已走通并有用例（roadmap §4.10）；Manifest `methods` 对 Runtime 与已安装插件按决定 #18 和内置一样注册（W4-02，`tests/plugin-methods-runtime.test.ts`）；无使用者的接口按决定 #19 处理（W2-03）；注册时交叉校验 W3-05；八类新合同按基本合同逐条复核已做（`specs/action-architecture/spec.md` §3 末尾，#319），缺口 G1–G9 各有去向 | roadmap §4.10 |
| §4.11 数据与可靠性 | 部分：`docs/system/HOME-DATA.md`（#295）是库的 owner 表（第 11 项交付物）；跨 owner 直接 SQL 已由 W2-06 清零并加了门禁（`scripts/gates/table-owners.mjs`；`tooling/gates/table-owners.json` 的 `shared` 登记两张共享日志表，`same_name` 登记 `workspaces`、`jobs` 两个不同库里的同名表；清掉的是普查列的 4 处加门禁量到的 `feed-history-release.ts` 与 `apps/server/src/main.ts`，说明见 `docs/system/HOME-DATA.md` §4.5）。共享日志表留着的原因是依赖方向（`modules/goals`、`modules/governance-collaboration` 只依赖 contracts，不能 import storage 的日志函数），不是事务：Artifacts 已改成宿主注入 `appendEvent`、`eventCursor`；后续：Goals 与 Governance 也改成宿主注入的日志端口，然后删掉两条 `shared` 登记；两个无版本库（W2-05）已加版本 1，真实 Home 的盖章在维护五里待做；统一登记（W4-11）、快照命令（W5-16）待做 | §3 R-09 |
| §4.12 卫生与文档 | 部分：vendored 已收到 1 份（#170），`MIGRATION.md` 已退场（#251），文档对齐经 #295–#298 做掉大半；版本与发布策略已写（W1-22，#321：`docs/releases/POLICY.md`、`CHANGELOG.md`、`CHECKLIST.md`，`scripts/verify-release-versions.mjs` 进 CI），发布 0.3.0、内置插件清单版本改成 0.3.0 与 Runtime 跟随当前构建在 W5-15（细则和清单跟随的做法用户 10-08 已确认，#323）；余下见 W1-02（文档收尾）、W1-23（根目录、`.impeccable`、工作树）；合同包的 6 个占位 subpath 已由 W2-01 删除 | §3 |
| §4.13 门禁 | 部分：已接健康门禁（对照合并基点；含巨大单元例外校验 #320、包清单表校验 #322）、整页门禁、成果类型与声明门禁、密钥扫描、版本核对（#321）；API 快照、页面资源预算、结构门禁、文档引用门禁、静态检查待做（W1-04～W1-09） | §5a |
| §4.14 手册与 Skill | 部分：读取兼容规则（#290）与 `host.md` 重写（#298）已做；创作台回放工具 W1-12；`host.md` 与 AGENTS.md 对目录条目的说法已在 W5-02 PR-1a 统一；基本合同复核发现 Skill 没写撤销、后台任务、到期提醒、片段推荐（缺口 G7，和 W1-12 的回放工具一起补） | `skills/molis-plugin-dev/` |
| §4.15 术语表 | 部分（W1-17 已做，#315）：`docs/system/GLOSSARY.md` 已写（一概念一名一定义；术语到翻译稳定键的对应；界面用词待批清单；代码改名清单分内部改名与合同改名；Characters 按「设置的一节」写，讨论按在用功能写）；代码改名（W5-14）、旧术语门禁、两套能力机制的收敛未做 | `docs/system/GLOSSARY.md`、§1 |
| §4.16 静态检查 | 待做：仓库没有 lint/format 脚本（W1-09） | `package.json` |
| §4.17 依赖与 SDK | 部分（W1-20 已做，#318）：[依赖清单与 Prologue SDK 收敛方案](dependencies-and-sdk-plan.md)；根 `package.json` 已固定 `packageManager`（pnpm 11.9.0），CI 与发布工作流读它。方案查到 Prologue 来源分支早已合入上游（PR #3）、现行 vendored 包不需要补丁、25 个历史补丁可删；推送、删 vendored 文件、改依赖版本都还没做，等用户确认后按方案分片执行（W1-23） | §3 N-14、`dependencies-and-sdk-plan.md` |
| §4.18 安全不变量 | 已写成 docs/system/SECURITY-INVARIANTS.md（W2-19，20 条，门禁与 CI 步骤在位）；密钥扫描已接 CI（#294）；开放项在该文档第 4 节 | §6 |
| §4.19 C 端就绪方案 | 部分（W1-21 已做，#316）：[`c-end-readiness.md`](c-end-readiness.md) 三个里程碑（M1 能装到第二台 mac、M2 保持更新不丢数据、M3 不止 macOS）、各项成本与依赖、5 个探针；还要用户定的 7 项在它的 §8，用户决定后各写成 §1 表的一行 | §3 C 组 |

**仓库系统整理要求（15 节）**：§1、§2 已覆盖（第一步 spec §1、§7）；§9 前端动线：壳子 S1–S7 与成果库走查覆盖了「插件不出整页、直达打开工作台、对话框与侧栏在工作台里」，其余页面的质感审查**做了一部分**（W2-18，2026-10-09）：26 个页面逐个打开、10 条关键路径走查与度量，见 [frontend-flow-walk.md](frontend-flow-walk.md)，发现与去向在该文 §5；任务书 §9 的检查项逐条做到哪一步见该文 §6：键盘与焦点、基本可访问性，失败、部分成功、权限不足、离线，乐观更新失败、多窗口、事件重连，前后端四个状态的区分，暗色主题与英文界面，闪烁与布局跳动，动效，长文本，配置完成后返回原任务，有真实模型的路径，都**没做**，另排一片（§10 的遗留）；§12 测试与预期对齐：第一步回归基线与本轮的 #206、#214（用例装配与下载竞态）覆盖了已发现的，系统性审查待做；§13 Prologue AI 手册与 Skill 已有（`docs/platform/PROLOGUE-AI.md`、`skills/molis-prologue-ai/SKILL.md`），与当前代码的一致性待第二步 §4.14 复核；§6 逐插件审查：W2-18 做了一部分，十条检查里 3 条做了、2 条做了大半、5 条部分（权限撤销、失败、取消、并发、恢复的逐插件审查与测试是否覆盖真实行为都没有逐插件做），见 [plugin-conclusions.md](plugin-conclusions.md) §0.1；§8 AI 入口：清单与分类已做（[ai-entry-inventory.md](ai-entry-inventory.md)），手册与 Skill 的一致性归 §4.14；§3–§5、§7、§10、§11、§14、§15 归第二步，见上表。

**体检报告**：附录 A、§5 的 6 步、§7.5 的 5 条与第一步交接清单的逐项结论见 §3.1–§3.4；附录 A 的数字 10-03 的版本见 9.3，10-08 的见 §3.1 各行证据。§5 的防腐顺序与第二步 §5 相同，第 1 步「门禁先行」已做大半（#179、#283、#293、#294），其余见 §3.2；§7.5 对在途线的建议：第 1 条没有按建议的顺序执行（#98 先于 #102 合入），第 2 条已被 CODEOWNERS 取代并做掉（#314），第 3～5 条仍要做，见 §3.3。

### 9.3 重新量（main aef917dc，与 10-02 开工时对比）

| 项 | 10-02 | 10-03 | 口径 |
| --- | --- | --- | --- |
| 构建期装配的内置插件（R-01） | 19 | 19 | `tests/builtin-plugin-assembly-gate.test.ts` 冻结名单；`project-host.ts` 的 `registerProvider` 26 处 |
| 宿主 `apps/local-host/src`（R-03） | 367 文件、42,714 行 | 369 文件、42,787 行 | `git ls-files` 的 `.ts`；`*-native-plugin-http.ts` 18 个、`*-actions.ts` 34 个，未变 |
| 工作台客户端脚本（R-07） | 32 个、14,032 行 | 33 个、14,469 行 | `apps/workbench/src/scripts/client/*.ts` |
| 插件客户端（R-07） | 26 个、13,086 行 | 25 个、12,842 行 | `plugins/native/*/src/client*.ts` |
| 空 `catch` | 145 | 142 | 源码（不含测试） |
| `Error` 子类（R-08） | 116 | 112 | 同上 |
| `as unknown as`（R-12） | 236 | 236（源码 154、测试 82） | 含测试 |
| `.impeccable/` 入库文件（R-14） | 1,067 | 1,085 | `git ls-files` |
| vendored Prologue 包（N-02） | 4 | 1 | `vendor/prologue-sdk/*.tgz` |
| 旧能力注册（N-12） | 18 个文件、10 处 | 18 个文件、11 处 | `HostCapabilityDefinition` 文件数、`registerCapability` 处数 |
| 巨大单元（健康门禁） | 181 | 181 | `pnpm health:check` |
| 测试引用包内部 | 979 | 979 | 同上 |
| `en.ts` 无引用的键 | — | 约 1,489 | 逐键查源码，见 §5.x |

宿主与工作台客户端仍在小幅增长（成果库改造新增了比较、继续、作为输入等入口），第二步「声明代替名单」与「浏览器脚本打包」要先做。

### 9.4 本轮新发现与处理

| # | 发现 | 处理 |
| --- | --- | --- |
| 1 | 全量回归的失败①：`project-home-start` 的首页快捷方式用例在 main 上 3/3 失败。S7（#196）让站内地址不开第二个标签页，用例仍期望开新标签页；预期变化没随改，当时相关用例集漏了它 | 已修：[#220](https://github.com/molis-ai/molis-work/pull/220)（f7d7f1ec），用例改为断言在本页打开、没有第二个标签页，其余断言全部保留 |
| 2 | 全量回归的失败②：`soft-workbench-refinement` 的字号刻度。成果库导入浮层的标题 18px、结果 16px、提醒 14px 不在刻度上，来自 A3（#203） | 已修：[#221](https://github.com/molis-ai/molis-work/pull/221)（61b805a7） |
| 3 | 第一步问题表有 5 条状态与事实不符：PMR-06（#170 已删旧包）、PMR-07（已量过）、PMR-12（9-30 已修）、PMR-34（#172 已合）、PMR-35（#182 已合） | 本 PR 在归档 spec 里更正，注明「10-03 main 自检更正」 |
| 4 | PMR-12 的修复（c48a8608）没有自动守护用例，只在当时用替身核对过 | 第二步补用例：800 宽、左栏收起时，暂停与等确认两种状态下顶部一行显示继续、停止与「去确认」 |
| 5 | 成果版本的「被谁引用」只列 Goal，助理工作不在里面 | 已补做：[#222](https://github.com/molis-ai/molis-work/pull/222)（3f7a7b00）；从直达链接打开的成果标签记的是带项目前缀的地址，由 [#227](https://github.com/molis-ai/molis-work/pull/227)（ec8429f9）补查 |
| 6 | 文档引用成果：Pages 没有引用成果版本的节点，也不记反向引用 | 用户拍板「识别正文里的版本链接」：[#225](https://github.com/molis-ai/molis-work/pull/225)（a9cd3f8c，新协议 `molis.artifacts.referrers`） |
| 7 | Goal 概览看不到交付物（走查 F6） | 已补做：[#223](https://github.com/molis-ai/molis-work/pull/223)（d69f4a27），「Goal 信息」里加「交付物 · N 份」 |
| 8 | 助理面板的结果栏也叫「成果」，与成果库同名不同义 | 用户拍板改叫「产出」：[#224](https://github.com/molis-ai/molis-work/pull/224)（960acab7） |
| 9 | 成果版本没有「交给助理 / Coding」 | 用户拍板现在做：[#226](https://github.com/molis-ai/molis-work/pull/226)（ebeca52c），成果详情加两个按钮，把这一版作为材料交给新工作 |
| 10 | 成果版本不能作为工作流步骤的输入 | 用户拍板现在做：[#228](https://github.com/molis-ai/molis-work/pull/228)，工作流内容协议支持「只能作起点」的站点，成果库声明列出与读取 |
| 11 | 「存为固定版本」与「放在哪里」重叠；Goal 有两种输入 | 用户拍板「合成一种入口」：Goal 只留一个「加输入」，选对象时再选「跟着原文」或「固定这一版」（进行中） |
| 12 | 场景 9（拷贝真实 Home 用当前 main 打开） | 已做（10-04，main 818d0aff）：4207、4208、4173 都没在跑，占着 Home 文件的只有已安装 0.2.0 的 MCP 服务（只开着自己的二进制，不开库）；把 `~/.molis-work` 拷到会话临时目录（排除 1.9 GB 的 `releases/` 安装包，拷了 7.0 GB），137 个库完整性检查全过；用当前 main、文件密钥后端在 4331 打开：项目列表、项目首页（今天的工作）、Goals、Coding（旧会话在）、工作流、设置、能力库都正常，浏览器与服务端无报错，成果库为空（旧表 10-03 已删，符合预期）。插件安装记录停在旧版本（如 Coding 1.32.0、1.44.0，当前 1.50.0）但跑的是当前代码，没有升级提示；把 Coding 加进一个装着 1.32.0 的项目也能用。未验证：调模型（按约定不调）、连接（文件密钥后端读不到钥匙串里的凭据）。做完已删拷贝与临时启动项 |
| 13 | 助理底栏「正在看」对从直达链接打开的成果标签显示地址而不是标题（标签本身的名字是对的）：工作台替插件命名打开的对象时没带标签名 | 已修：[#227](https://github.com/molis-ai/molis-work/pull/227)（ec8429f9） |
| 14 | 常驻服务 4173 停着，要装新版 | 用户操作，见 §7 |
| 15 | 宿主与工作台客户端仍在增长（9.3） | 第二步「声明代替名单」「浏览器脚本打包」先做 |
| 16 | `en.ts` 约 1,489 个无引用的键、38 个重复键；演示稿两套种类名 | 已记入 §5.x，第二步处理 |

### 9.5 另一会话复查的九条（用户 2026-10-04 转来，由我判断修不修、怎么修）

逐条在 main 上核实，并用场景 9 的拷贝查了真实 Home 是否还依赖。

| # | 发现 | 核实 | 判断与做法 |
| --- | --- | --- | --- |
| 1 | 本机网页把所有调用者写成 `"web-user"` | 属实：约 20 个宿主文件各写一份字面量，`agent-host-composition.ts` 还有 `legacyActorId` | 修（第二步，可信身份一节）：身份值不变（已存数据按它记），收成合同里的一个常量，所有调用方引用它；删 `legacyActorId`。多人身份属 §4.19 C 端就绪，不在这里做 |
| 2 | 来源表 `feed_sources` 有两个主人 | 属实：`modules/sources` 建表，`horizontal/listener-host` 建 `feed_source_runs` 并对 `feed_sources` 加外键、删行；`cursor_json` 标着只给旧数据用、靠就地补列 | 修（分层与边界）：删 `cursor_json` 与就地补列、CHECK 重建、旧游标拷贝（不留兼容），见 [#240](https://github.com/molis-ai/molis-work/pull/240)。`feed_source_runs` 的处理改了做法（10-04）：运行记录是 Listener Host 的同步账本，留在它那里，只去掉它对来源表的外键。来源只退役不硬删，这条级联从不触发；运行记录本来就由 `deleteListenerSourceState` 显式清理。分支 `refactor/listener-runs-own-table` |
| 3 | 会话库仍在把 `goalboard_*` 改写成 `molis_work_*` | 属实：`session-schema.ts` 见旧值就整表重建；兼容清单只列了 `session-migration.ts` | 修（清除兼容）：真实 Home 的会话库已是第 6 版、没有旧值（54 条 `legacy_migrated`、2 条 `molis_work_created`），删掉改写；`legacy_migrated` 与 `session_migration_receipts` 一并列入兼容清单 |
| 4 | 文件密钥库的派生盐是 `"goalboard-feed-secretstore-v1"` | 属实 | **不改值**：它是派生已封存密钥的常量，换了旧密钥就解不开，只能再加一层重新封存（那才是兼容逻辑）。代码里已注明（`Historical key-derivation constant. Changing the string would invalidate existing ciphertext.`），列入 §4 例外。**另发现**：同一文件在打开时把 v0.3 的 Base64 信封重新加密（兼容逻辑），列入兼容清单；删之前先只按格式（不读内容）核对真实 Home 还有没有这种信封 |
| 5 | 八个内置插件仍列着可以从哪些旧版本升上来 | 属实；真实 Home 的安装记录多是旧版本（Coding 1.32.0 / 1.44.0、Characters 1.2.0、Files 1.1.0、Git 1.3.0 / 1.4.0） | **更正（10-04）**：前一版写「内置插件启动时不查这些名单」不对。读监督器的代码：已装版本在名单里就直接跑新代码、记录不动；不在名单里就恢复当时存下的旧发行物——所以真实 Home 里装着 Coding 1.32.0 的项目很可能跑的是旧 Coding；照原计划删名单，其余项目也会退回旧代码。用户 10-04 弹窗拍板「内置插件随宿主升级」：随宿主发布的内置插件启动时把安装记录升到当前版本、跑当前代码，不再靠名单；然后删名单。第三方与生成的插件仍走升级确认。分支 `feat/bundled-plugins-follow-host` |
| 6 | CLI 与 MCP 仍能初始化旧看板、导入 v3，执行者来自参数 | 属实：`init`、`import-v3`、`molis_work_v1_initialize`、`molis_work_v1_import_v3`，宿主用参数里的 `actor_id` 做管理身份 | 修（安全不变量，硬约束「可信身份从调用上下文来」）：删 `import-v3` 全链（旧数据导入，按「不留兼容」）；初始化的身份改从调用上下文取，参数里不再收 `actor_id`。MCP 外部调用方会少一个工具、少一个参数，在 PR 里写明 |
| 7 | 生产用的模型入口没有清单；没有模型目录时仍读环境变量与旧凭据、默认走 MiniMax | 属实（BL-082）；真实 Home 的模型目录里有 1 个已配置的提供方，不走兜底 | 修，按用户 10-04 的决定（§1）：<br>• 写调用链清单（§4.2，十七处宿主绑定都经 `host-complete-text.ts` 到 Prologue）。<br>• 删 `model:text:api_key` 的读取与导入，见 [#239](https://github.com/molis-ai/molis-work/pull/239)。<br>• 环境变量留作开发与测试的显式配置，写进手册；通用变量不再默认成 MiniMax。<br>• 产品里没配模型时，调用方提示「请先配置可用的文字模型」。<br>• 其他旧账号导入（TypeSafe、图片、旧连接引用）列入兼容清单，核对真实 Home 后再删 |
| 8 | 演示稿两套种类名 | 属实，方向相反：PPT 动作声明的是 `ppt`，对象、搜索、侧栏、成果来源都用 `presentation` | 修：统一为 `presentation`（动作声明的种类不入库，改它不涉及数据） |
| 9 | 炼金术士自己的库用了平台在用的表名 | 属实（`workspaces`、`jobs`、`evidence`、`claims`） | **不改**：每个项目单独的 `studio.sqlite`，不与平台库同库，不会冲突；改名要迁移用户数据。只在将来并库时再处理，记入已知命名 |

执行顺序：3、8、6 先做（小、独立）；1、2、5、7 随第二步对应小节做。每条一个 PR，进度记在本节。

进度（10-04）：
- 第 3 条：分支 `fix/drop-session-name-rewrite`——查下去发现改名只是会话库旧版升级链的一部分（新建的库先建成第 3 版再迁到第 6 版），按「不留兼容」一并删掉，只认第 6 版；全量回归在跑（存储改动按 10-03 的验证频率要跑全量）。
- 同时发现并修了一处与它无关的时序：`immersive-directory.e2e` 关切换器前 Dock 还在重排，按下与松开不在同一处——[#232](https://github.com/molis-ai/molis-work/pull/232)（268325bd）。
- 第 5 条：见上表更正与 §1 的决定。

进度（10-04 下午）：

| # | PR | 状态 |
| --- | --- | --- |
| 3 | [#234](https://github.com/molis-ai/molis-work/pull/234)（3fa5f40f）：会话库只认第 6 版，删旧版升级链与改名 | 已合入；全量回归在合入前跑过 |
| 8 | [#236](https://github.com/molis-ai/molis-work/pull/236)（fc0b1b70）：演示稿只用 `presentation` | 已合入 |
| 5 | [#237](https://github.com/molis-ai/molis-work/pull/237)：内置插件随宿主升级，删八份名单 | 已合入 |
| 1 | [#238](https://github.com/molis-ai/molis-work/pull/238)（69f2cd65）：`"web-user"` 收成合同常量 `LOCAL_PERSON_ACTOR_ID`（25 个文件）；`legacyActorId` 由 [#243](https://github.com/molis-ai/molis-work/pull/243) 删（§1 决定） | 已合入；#243 待全量 |
| 7 | [#239](https://github.com/molis-ai/molis-work/pull/239)（bab13d7a）：删旧凭据读取与导入；补充 [#246](https://github.com/molis-ai/molis-work/pull/246)（34ded78f）：通用环境变量不默认 MiniMax、手册写明、删 BL-082 | 已合入 |
| 2 | [#240](https://github.com/molis-ai/molis-work/pull/240)（46b7ec3f）：来源表只按当前结构建，删补列、重建、旧游标拷贝；v35 夹具去掉旧的空来源表 | 已合入 |
| 6 | [#244](https://github.com/molis-ai/molis-work/pull/244)（dfe3765e）：管理入口（CLI、管理 MCP）一律以本机这个人的身份调用；删 V3 导入全链；需求覆盖账本另由 [#252](https://github.com/molis-ai/molis-work/pull/252) 删 | #244 已合入；#252 第三批全量通过，排队合入 |

- 本批验证方式：#237–#240 都动共享核心（插件运行时、宿主、模块、合同），按 10-03 的验证频率合成一个集成分支 `integration/batch-10-04`。整体构建、健康与边界门禁都过，在上面跑一次全量回归，失败先用干净基线比对。全量通过后逐个合入。
- 第一批全量回归（集成分支 `integration/batch-10-04`）：3,753 个用例，3,745 通过，1 失败，7 跳过（需要真实账号的 live 用例），用时 76 分钟。唯一的失败是 `goal-event-document-history`：v35 旧库夹具里的来源表还是旧 CHECK，#240 不再就地重建它，属于预期变化。改为夹具装载时删掉这张空表，补在 #240；之后装载 v35 夹具的 9 个用例文件 40/40 通过。四个 PR 都贴了结果，按顺序合入。
- 第二批（集成分支 `integration/batch-10-04b` = 第一批 + 下面五项）：整体构建一次就过，健康与边界门禁通过。140 个相关非浏览器用例文件里 9 个失败，都是我写的预期变化没跟上：替身会话没写执行者、管理调用者不是本机这个人、旧密钥文件在打开时就被拒绝。已逐个修好，复跑 32/32 通过。全量回归在跑。
  - [#241](https://github.com/molis-ai/molis-work/pull/241)：工作流站点的对象种类。pages、feed、inbox、lingguang 原来拿站点 id 当种类；`subject_kind` 改为必填，加门禁 `workflow-station-kinds`。
  - [#242](https://github.com/molis-ai/molis-work/pull/242)：密钥库删 v0.3 信封升级，加用例 `secret-store-format`。
  - [#243](https://github.com/molis-ai/molis-work/pull/243)：会话执行者必填，删 `legacyActorId`。
  - [#244](https://github.com/molis-ai/molis-work/pull/244)：第 6 条（见上表）。
  - #239 的补充：通用模型环境变量不再默认成 MiniMax，手册写明开发用的环境变量，删 BL-082。#239 合入后另开 PR。
- 第二批全量回归（集成分支 `integration/batch-10-04b`）：3,748 个用例，3,740 通过，1 失败，7 跳过，用时 76 分钟。唯一的失败是 `goals-document.e2e` 的一次 CDP `Runtime.evaluate` 超时，没有断言失败；同一棵树上单独连跑 3 次都通过，第一批全量里也通过，判为全量负载下的时序问题。已合入：#241（67aa74ef）、#242（d142eb72）；#243、#244、#246 排队。
- **验证缺口（10-04 发现）**：`scripts/run-tests.mjs` 不带参数时只收 `tests/*.test.ts`，四个 `tests/*.test.mjs`（Goals 查询与存储边界、草稿对话边界、工作台注册边界）只在 CI 里按名字跑。#244 删了导入文件后，第二批全量没发现 `goals-storage-boundaries.test.mjs` 还读它，是 CI 报出来的。之后每批全量另跑 `node --test tests/*.test.mjs`（第三批 10/10）；让全量也带上它们另开小 PR。
- 第三批（集成分支 `integration/batch-10-04c` = 第二批 + 下面四项）：
  - 整体构建一次，修了一处没用到的类型引用；健康与边界门禁通过。
  - 相关用例里 2 个失败，都已修：`.mjs` 边界用例（修在 #244）；新用例的项目没启用成果库。27 个 Goal / 成果浏览器用例 55/55 通过。
  - **全量**：3,752 个用例，3,745 通过，0 失败，7 跳过，用时 78 分钟；`.mjs` 10/10。
  - 已合入：#249（f1309918）、#250（b106be22，全量也跑 `.mjs`）、#251（a172e540，迁移期工具与 MIGRATION.md 退场）；#247、#248、#252 排队。
  - [#252](https://github.com/molis-ai/molis-work/pull/252)：只有 V3 导入会写的需求覆盖账本。
  - [#247](https://github.com/molis-ai/molis-work/pull/247)：成果库里固定的一版交给插件作为输入（artifact-positioning 10-04 的决定）。
  - [#248](https://github.com/molis-ai/molis-work/pull/248)：Casebook 对外合同改名（§1 决定；外部 Casebook 插件要同步）。
  - [#249](https://github.com/molis-ai/molis-work/pull/249)：PMR-12 守护用例 `assistant-strip-narrow.e2e`。
- 第四批（集成分支 `integration/batch-10-04d` = main + 下面三项）：
  - 整体构建通过；健康门禁就地补表 110 → 72，边界 0 错误。全量在跑。
  - [#253](https://github.com/molis-ai/molis-work/pull/253)：Listener Host 的运行记录去掉对来源表的外键（第 2 条后半）。
  - [#254](https://github.com/molis-ai/molis-work/pull/254)：删 Pages 旧项目按 board_id 分区的迁移（§4.0）。
  - [#255](https://github.com/molis-ai/molis-work/pull/255)：§4.1 第一、二步，Home 级的库各留一份当前 schema 加版本号，见下面一条。
- §4.1 Home 级的库（#255，用户 10-04 授权动真实 Home 的库）：
  - **先只读对照**：在拷贝上逐个比真实 Home 的库与当前代码新建的库。差别只有两种：
    - 列的顺序：pages、forms、datasets、presentations、functions 的列是一处处补上去的，顺序与新建不同；
    - 用到时才建的表：Todo 整理器的两张表、连接器的授权结果表。
  - **基线**：17 个库各写一份，列顺序按真实 Home。上下文账本与连接器宿主导出建表语句，由所在库合进去。characters 本来就是版本 1，会话库只认第 6 版，搜索索引是派生库，三者都不改。
  - **盖版本号**：一次性工具 `scripts/stamp-store-baselines.mjs`。只给结构与基线完全一致的库盖；基线里有、库里还没建过的表建成空表；不一致的原样不动。
  - **演练（已做）**：只拷这 17 个库的文件到会话临时目录，不碰原 Home。
    1. 只读报告：17 个都可以盖（connectors 要补一张空表）；
    2. 写入：17 个都盖上，再报告都是当前版本；
    3. 74 张表的行数盖前盖后完全一样；
    4. 新代码逐个打开 17 个库全部成功，行数不变。
  - **真实 Home（10-04 已做）**：
    1. 4207、4208、4173 都没在监听；Home 里的库没被常驻服务占着（0.2.0 发布版的两个 MCP 进程只转发，没开库）。
    2. 整份备份到 `~/.molis-work-backups/2026-10-04-store-baselines/`（APFS 克隆；1,326,429 个文件与原 Home 一致，抽查的库逐字节相同）。
    3. `--apply`：17 个库全部盖上版本 1；connectors 补了一张空表。
    4. 复核：再跑一次全部报告 current；75 张表（原 74 张 + 补的空表）行数与盖前一样；新代码逐个经基线打开 17 个库全部成功。
    5. 只读模式打不开没有 `-shm` 的 WAL 库（cognia、jelly、todo、workflows 报错 14），所以没跑只读报告，直接 `--apply`：它只给结构一致的库写版本号，其余原样不动。
- **第四批全量**（`integration/batch-10-04d` = main + #253、#254、#255）：3,772 个用例，3,760 通过，5 失败，7 跳过，76 分钟。
  - 4 个失败是 #255 的预期变化：Form、PPT、Images 的用例手工建旧表或删列再期望就地升级，已改成在当前基线上造同样的场景，断言不变；删一条只测「Functions 旧库删列后还能开」的用例。
  - 第 5 个是 `goal-event-document.e2e` 负载下超时，单独跑通过。上述文件加该 e2e 单独跑 39/39。
  - #253（4f992391）、#254（acb98817）已合入；#255 排队。
- 记忆账本的「第一版导入」（10-04 删，分支 `refactor/memory-drop-first-version-import`）：
  - 只读查真实 Home 的助理库：第一版关掉的记忆 0 条、候选 0 条、开关从没存过，导入早已无事可做。
  - 删 `MemoryService.migrateLegacy` 与 `LegacyMemoryState`，删宿主每次调用前的 `migrate()` 包装和读助理库的 `readAssistantMemory`，删 `AssistantStore` 只供它用的记忆方法和两条导入用例。记忆是否关闭只看条目自己的事实。
  - 助理库里的 `assistant_memory_candidates` 表已无人读写，留在助理库基线里，等基线下一版一起去掉。
- Schedule 的旧 Builder 提醒与定时操作导入（10-04 删，分支 `refactor/schedule-drop-builder-import`）：
  - 只读查真实 Home 18 个项目库：旧格式提醒 0、旧格式定时操作 0、孤立执行记录 0；只有演示项目（466d6844）剩 2 个旧键和 1 个没导入的旧 Builder 定时任务（每日小结，下次到点 9-28 已过）。删掉读取后，它到点只会记一次「插件不可用」，不影响别的。
  - 删宿主每次启动的两段读取、两组旧唤醒登记、`pauseLegacyScheduleReminders`、旧唤醒 `board|id` 的引用格式，以及只有导入会留下的「无法恢复的旧执行记录」列表（取消定时操作会连执行记录一起删，所以别处不会产生孤立记录）：列表动作的输出、插件界面、宿主与工作台投影一起去掉。
  - 「重装后确认归属」保留：它是插件重装后把提醒、定时操作交给新安装的现行流程。原来借旧数据造场景的用例改成真的重装一次，断言不变。
- §4.1 项目库（分支 `refactor/project-database-baseline`，叠在 #253、#254、#255 与 Schedule 分支上）：
  - **先只读对照**（真实 Home 18 个项目库 vs 当前代码新建的库）：
    - 新建库只有 71 张表；真实库另有 21 张由各主人用到时才建的表（插件运行时、Scheduler 与 Schedule、Coding、上下文账本、浏览设置）；
    - 13 张表结构不同：多数是列序（一处处 `ALTER` 补上），另有来源表多一列 `cursor_json`、运行记录的外键（#240、#253 改的）、6 个库的出站规则少两列、8 个库的 `runs` 多两列旧列；
    - 16 个库还没有成果库与过程项的表，6 个库没有信号表（新代码打开时才会建）；
    - Coding 会话表在 18 个库里有 4 种列序。
    - 结论：一份基线不可能对上所有库，真实 Home 要「按列名搬进新基线库」，不能只盖版本号。
  - **基线**：`apps/local-host/src/project-database-schema.ts` 把各主人交出的建表语句拼成 `PROJECT_DATABASE_BASELINE`（版本 1）：Goals、执行、依据、治理、成果与过程项、日志、上下文账本、来源、信号、Listener、Attention、Feed 与出站规则、插件运行时五张表组、Scheduler、Schedule 三组、Coding、浏览设置、Casebook。`LocalProjectDatabase` 新库一次建好并写版本；版本不符（包括有表没版本）就拒绝；恢复只看版本。各主人仍用 `IF NOT EXISTS` 建自己的表，在项目库里是空操作；改任何一张表就是新版本。
  - **删掉**：宿主的迁移链（`project-migrations.ts`、`feed-migrations.ts`、恢复时的迁移明细 `project-recovery-details.ts`）、`SqliteSchema` 与 `schema_migrations`；Goals、治理、执行、依据、成果五个模块的迁移文件；Feed 的合同迁移与迁移收据表（Feed 快照的 `contract_migrations` 字段一起去掉）、八处补列、Goal 关联的一次性搬迁；Attention 的 reason 重建；出站规则、Scheduler、Schedule、Coding、插件事件游标的补列与重建；输入绑定的旧来源搬迁；浏览设置读已退役插件存储的一次性搬迁；Coding 后台任务列表对旧列的容忍。
  - **随之去掉的死列与死值**：`feed_items.item_type`（只剩 `'feed'`，`'inbox_message'` 是合同迁移前的旧值，`markRead` 的类型参数一起去掉）与 `feed_items.linked_goal_id`（关联早已只在上下文账本里，列恒为空）。
  - **合同变化**：Casebook 恢复失败只报 `project_recovery_unsupported_schema`（原 `project_recovery_requires_migration` 及其明细没有了，外部 Casebook 插件要同步，与 #248 一起）；Feed 快照少 `contract_migrations`。
  - **用例**：迁移本身的用例删掉（Goals 迁移 12–15/25/26/30/36、Impact 历史、治理 8、Feed 29、Attention 重建、Artifacts 31 的迁移部分）；借旧库造场景的用例改成在当前基线上造。v35 旧库样本改为「带事件前历史的项目」基线样本（`tests/fixtures/goal-event-history/`），由真实 Home 同样的流程生成一次。新增 `tests/project-database-baseline.test.ts`：基线等于入库的 schema 快照、新项目经宿主打开各插件后不多一张表、版本不符拒绝且不改库。
  - **演练（真实 Home 的拷贝，取自 10-04 备份）**：
    1. 用删迁移之前的版本（第四批集成分支）打开一次 18 个库，让当时的全部升级跑完；
    2. 一次性工具按列名把每张基线表的行搬进按基线新建的库（会话临时目录里的 `rebuild-to-baseline.mjs`，不进仓库）：共 36,214 行，0 个外键问题，18 个库完整性都通过；
    3. 不进基线的：空的 V3 覆盖账、18 条 Feed 合同迁移收据、671 条迁移编号、1 条旧导入收据；`feed_items.item_type`（全是 `'feed'`）、两处恒空的旧列，以及 `feed_sources.cursor_json`（81 个值，其中非空的 10 个与 Listener 自己表里的游标逐字相同）；
    4. 补默认值的列只出现在空表或旧代码本来也会补成同样默认值的地方（Coding 归档标记、出站规则、空的插件事件游标表、对话任务归档标记）；
    5. 新代码打开 18 个重建后的库（普通打开与恢复打开都试），459 个 Goal、431 条 Feed 都读得出来。
  - **时机（待用户定）**：重建后的项目库，删迁移之前的旧代码打不开（它会按迁移编号重新建表）。已安装的 0.2.0（常驻服务 4173 与两个 MCP 进程）就是旧代码，所以重建要和换新版一起做。
- §4.1 目录库（分支 `refactor/catalog-drop-migrations`）：
  - 目录库本来就有版本号（`catalog_meta.schema_version`，现 19）和「拒绝更新的版本」。删 1→19 的升级链：项目插件表的四次重建、数据分类补列、旧导入列的删除、运行时绑定的两次搬迁、模型供应商的两次补列；版本不符就拒绝，不就地升级。卸载前的预览不再容忍缺列的旧目录。
  - 顺带删恒空的 `projects.migrated_from_path`，版本升到 20。
  - 用例：删掉 7 条迁移用例；「老目录不建新表」改为「老目录打开时被拒且原样不动」；「迁移时锁超时后服务自己恢复」改为「第一次准备遇到锁、之后自己恢复」（基线下已没有迁移锁，重试逻辑仍在）。
  - 演练：真实目录库的拷贝只差模型供应商表的列序和项目表上的一条约束；按列名搬进版本 20 的新库，655 行全部搬过，只丢恒空的那一列；新代码打开，18 个项目都在。
- **第五批**（`integration/batch-10-04e` = 项目库基线分支（含 #253、#254、#255、Schedule）+ 记忆 + 目录库）：整体构建、`typecheck:all`、边界、健康门禁通过（就地补表 72 → 5）；相关用例全过（项目库 227 个里 8 个失败已修：其中 2 条只测迁移 36 导入规则的用例删掉，运行时的同类规则另有用例；目录与记忆 120 个里 1 个已修）。全量在跑。
  - [#257](https://github.com/molis-ai/molis-work/pull/257)：记忆第一版导入；[#258](https://github.com/molis-ai/molis-work/pull/258)：Schedule 旧导入。
- 门禁第二批（§5a）：空 catch、`as unknown as`、旧产品名的计数，以及 contracts 与插件 SDK 的公开 API 快照。最初的 WIP 分支 `chore/health-gates-lint-api` 只数名字、用正则数空 catch（137/141 处落在浏览器脚本的模板字符串里）；已由 W1-04 的 `chore/gates-api-snapshot` 取代：基于合并基点比对的门禁，快照含签名，空 catch 与双重断言按语法树数，口径见 `tooling/gates/README.md`。旧分支不再使用。
- 「其他旧账号导入」已查（10-04）：**不全是兼容，不能直接删**。
  - `importLegacyAccounts`（`apps/local-host/src/web-connector-connections.ts`）每次列出连接时都会做几种「认领」：旧图片密钥、TypeSafe 的 `FUNCTIONS_CREDENTIAL_REF`、各连接器的 `connector:<id>:…`、模型目录的 `model-provider:<id>`，以及各项目来源里的凭据引用。认领后它们出现在设置的「连接」里。
  - 其中至少三种仍由现行流程写入：模型设置按 `model-provider:<id>` 存密钥（`model-provider-store.ts:96`）；Functions / Jev 仍直接读 `FUNCTIONS_CREDENTIAL_REF`（`functions-host.ts`、`experiments-executor.ts`）；Feed 的 GitHub、Gmail 来源注册仍写连接器凭据引用（`plugins/native/feed/src/connector-service.ts`、`connector-source-registration.ts`）。
  - 所以这里一部分是「活的投影」：把直接存的凭据显示成连接。
  - 处理：记入 §5 的分层问题。连接只有一个主人：现行流程直接建连接，认领只留给确实只有旧数据的那几种；那时再按格式核对真实 Home、删掉认领。不在兼容清单里直接删。
- 「桌面面板的 reconcile 是否仍在用」已查（10-04）：**仍在用，不能当兼容删**。
  - Work 插件的终端面板仍存在 `catalog.desktopPanels`（`plugins/native/work/src/http/panels.ts` 打开、列出、标记退出；SC-3 后这些路由在宿主的 `apps/local-host/src/web-panel-routes.ts`）。
  - `reconcileLegacySessionCatalog`（`apps/local-host/src/session-migration.ts`）在 MCP、网页会话与运行时面板每次读会话时，把面板与运行时绑定同步进会话库（`registry.migrateLegacy`）。名字带 legacy，其实是活路径。
  - 产品代码里没有 `openDesktopPanel` 的调用者，只有用例在用。
  - 处理：记入 §5 包级清单的分层问题。改成显式的「面板 → 会话」投影，改名，去掉 `legacy` 字样，并把 `session_migration_receipts` 与 `legacy_migrated` 的去留一起理清；不在兼容清单里删。

## 10. §4.2–§4.19 普查与路线（2026-10-07）

方法：九个只读普查各看一到三节（main 15c20920），对照任务书 §7 的完成标准量现状、列已满足/部分/缺失与证据、拆成 PR 大小的切片；再由一个完整性评审合并去重成一条路线。原文与逐节证据见 [roadmap-2026-10-07.md](roadmap-2026-10-07.md)。

**第 1 波进度（已列 PR 均已合入 main；W1-18 仅事实表完成、逐包审查待做；W1-09 于 2026-10-09 随第 2 波 A 批最后合入）**：W1-01 #327、W1-02 #296–#299、W1-03 #293、W1-04 #328、W1-05 #329、W1-06 #330、W1-07 #331、W1-08 #332、W1-09 #357（Biome 最小规则集按文件计数、只许减少：显式 any、console、debugger、浮动的 Promise 等；rustfmt 与 clippy、shellcheck、`JellyMaterial.swift` 类型检查挡合并；`jelly-whisper` 的 Swift 构建先不挡，收口见 BL-122）、W1-10 #294、W1-11 #333、W1-12 #334（380 份真实设计答卷，完整设计一次通过 42/80）、W1-13 #314、W1-14 #319、W1-15 #317、W1-16 #295、W1-17 #315、W1-18 #322、W1-19 #320、W1-20 #318、W1-21 #316、W1-22 #321、W1-23 #335。合入前两次整合回归：batch S 4,441/4,470（22 个门禁测试互相不知道对方，修夹具后过）、batch T 4,527/4,538（3 个浏览器用例负载超时，单跑全过）。新门禁在合入时抓到的跨分支问题：删项目点名 8 个插件（改成插件自己声明）、页面体积增长（以删掉证明无用的客户端代码抵消）、新 `as unknown as`、合同快照漂移。

**第 2 波进度（A 批 2026-10-09，B 批 2026-10-10）**：A 批 15 片（加上第 1 波的 W1-09）先合成整合分支 `integration/wave2-1009` 跑全量（5,027 个用例：5,018 通过、0 失败、9 跳过；W2-01 原先欠的全量回归由这一次补上），再逐个从最新 main 合入：W2-01 #342（删合同包 6 个占位 subpath）、W2-02 #343（死代码一批）、W2-03 #344（插件 SDK 出口补齐）、W2-04 #345（孤儿资源回收、命令行与管理 MCP 不再有默认库路径）、W2-05 #346（两个无版本的库加版本 1；真实 Home 维护五 10-09 已做，#358）、W2-06 #347（跨主人 SQL 清零加门禁）、W2-09 #348（工作区读取一个 id）、W2-12 #349（「讨论」库进 Home 登记与备份）、W2-13 #350（页面事件合同与门禁）、W2-14 #351（验收编号约定）、W2-15 #352（动作合同快照门禁）、W2-16 #356（CI 产品子集单独作业）、W2-17 #353（受影响用例选择器）、W2-18 #354（首轮证据写作，余项见 §12）、W2-19 #355（安全不变量逐条测试）。合入时抓到的跨分支问题都在合入它的 PR 里修：产品子集清单里 11 个文件已由挡合并的 `test:security` 跑（从清单删掉，随 #356）；别的切片新写的显式 any 与 console（6 处，随 #357）；#357 带进的新依赖要求工作树重装。B 批 8 片（W2-07 删项目统一与可信身份、W2-08 删 Goals 桥与 Feed 升格改走 Goals 动作、W2-18 十五项决定的落实：网络与搜索、Agent 入口、插件小体验、触控尺寸、第一次配模型、证据清理）做完修复与评审（10-09 用户再答 4 项，§1，之后又做了一轮），10-10 与用户定删的 Casebook、实验插件两个删除分支合成整合分支 `integration/wave2b-1010` 跑全量（5,142 个用例：5,132 通过、9 跳过、1 失败，是删实验插件漏改的一条断言，已在 #370 修好），再逐个从最新 main 合入：W2-07 #361、W2-08 #362、网络与搜索 #363、Agent 入口 #364、插件小体验 #365、触控尺寸 #366、第一次配模型 #367、证据清理 #368，之后删除 Casebook #369、删除实验插件 #370，真实 Home 维护六的记录 #371（§4.1）。C 批 W2-10、W2-11（测试改走公开入口）已与第 3 波分批推进；W2-10-PR-0、PR-B 及 W2-11-a0/a/b/c1 已合入，余项见 §10.1。

**第 2 波 B 批清理（W2-18 后续，2026-10-09，分支 `chore/evidence-cleanups`，经 #368 合入 main）**：逐插件结论的 E-3 至 E-8、E-10、E-11、E-14，前端动线的 V-3 至 V-5，AI 入口清单 §7 第 3、4、6、9 项，是清理与文字修正，没有产品语义的选择，按各自去向做了。E-3 删 Feed 的演示前端；E-4 成果的搜索摘要只取声明过的文字字段（标题、正文、文件名、说明、表格行的值，加内置生产者各自的正文键：Coding 报告的 `body_markdown`、`task`、`model_answer`，演示稿的 `bullets`，角色的 `instructions`，Feed 捕获的 `source_label`、`tags`；其余字符串，如文档 id、节点类型、编码内容，不再进摘要，生成插件若把正文放在别的键下，摘要里也不再有它，这是 E-4 要的取舍；成果搜索条目的 `revision` 现在把摘要文字算在内，否则已建好的索引会因版本与内容摘要没变而跳过这些成果，真实 Home 里的旧摘要（带开头的文档 id）要等每个成果出新版本或手动 `search.rebuild@1` 才换掉——现在合入后的第一次同步就按新取法重读所有成果一次，摘要没变的成果以后不再重读；这是修订号该有的覆盖范围，不是为旧数据写的迁移分支，不进保留机制；若判为要记，退路是不改修订号、把一次 `search.rebuild@1` 记进下一次真实 Home 维护）；E-5、E-6 成果库与 Sessions 的空状态；E-7 缺模型而停下的炼化与研究，方向卡和研究卡都只说一次「还没有可用模型」并带「打开模型设置」，研究阶段的端口类型与假证据运行时分开，README 数目改成 54；E-8 与 §7.3 去掉 `pages.ai` 的 `stub`；E-10 命令标签；E-11 删 `shelf.jobs.run`；E-14 Diff 与 Text Stats 用插件舞台；V-3 Todo 的「查看」；V-4 窄屏的 Todo 页签与 Goals 行（页签条只在自己里横向滚动，不带动下面的列表，所以打开某条整理结果时它不会被滚回去）；§7.6、§7.9 两处 `PROLOGUE-AI.md`。§7.4 的标题与描述做完（Assistant 目录里描述等于标题的 4 个、少于 14 字的 17 个、同名的 16 组，`tests/action-catalog-wording.test.ts` 钉住）；可用性声明做了能做的部分：`alchemist.reuse.assess`、`alchemist.conversation.send`、`alchemist.explorations.start`、`alchemist.research.start`、`images.jobs.start` 在没有模型或没有可用的生图服务时，对助理、MCP、工作流和插件标成不可用并写明原因（让助理在发现阶段就看到），用户自己的页面不变——发送讨论仍先保存消息、启动炼化与研究仍记一条停下的运行并在卡片上指向模型设置、生图仍给出所选服务连接的具体原因；`tests/model-unavailable-declarations.test.ts` 钉住这个划分。没有声明的：`workflows.instances.continue`（只有下一站是 AI 整理才要模型，可用性声明看不到输入）、`experiments.run`、`coding.runs.start`（只对用户开放，助理看不到）、`alchemist.pulse.start`（规则综合，不调模型；AI 入口清单原先把它算进去，已在清单的 §1 第 3 项、TX-15、§6、§7 第 4 项更正）。用户 2026-10-09（第二轮）已定：保持这个做法，可用性只对助理、MCP、工作流和插件声明，用户自己的页面不变，不声明 `workflows.instances.continue`。**V-5 关闭，不改代码**（前端动线走查的 V-5 行已标关闭）：走查本身写的是「观察，不是缺陷」，失败后「输入已保留」是有意的；「只在回到原工作时才带出」会让助理的输入与引用标签随页面消失，是助理草稿语义的变化而不是清理，要做须先定什么算「回到原工作」（同一对象、同一插件还是同一项目）和被收起的草稿放哪里，再单独开片。合同变化（给调用方）：`pages.ai` 的输出少了恒为 false 的 `stub`（版本仍是 1，有意不升：它是常量 false，按旧形状读它的调用方现在拿到 undefined，同样走假值的那个分支；工作流映射、Skill、MCP 文档、页面脚本里没有谁读它，`git grep` 查过，所以按 `pages.ai@1` 固定的引用不会坏）；`shelf.jobs.run` 不存在（用 `shelf.jobs.generate`、`shelf.jobs.extract`）；多个动作的标题与描述改了（`capability_id` 与输入、输出、权限不变）；上面五个动作在没有模型（`images.jobs.start` 是没有可用的生图服务）时，对不同调用方这样表现：工作流和插件的目录里它们是不可用，调用得到 `actions.connection_required`（原来是进了处理器才失败，或先保存、先记录再提示）；助理（Agent）搜能力时不列出它们，已知 id 直接调用得到同一个错误和原因；**MCP 的 `tools/list` 不列出这些工具，按名调用一个没列出的工具得到 `actions.mcp_unavailable`（不是 `connection_required`）**，所以 MCP 工具 `alchemist.reuse.assess__v1`、`alchemist.conversation.send__v1`、`alchemist.explorations.start__v1`、`alchemist.research.start__v1` 在没有模型时从列表里消失，`images.jobs.start__v1` 在没有可用的生图服务时消失（Images 的 MCP 列表先是 10 个，有一条能用的服务后是 11 个）；工具名本身没变，模型或服务配好后它们回到列表里。用户自己的页面不受这条影响。

**结论**：§4.1 之外，§7 的大多数条目还没满足。路线 87 片分 6 波：

| 波 | 内容 | 片数 |
| --- | --- | --- |
| 1 | 文档对齐、门禁加固（合并基线比对、API 快照、结构门禁、文档引用、页面资源预算、翻译检查、静态检查、密钥扫描、CI 产品子集探针）、协作与合同流程、调用链/扩展点/Home 数据/术语表/依赖与 SDK/C 端/版本策略文档、巨大单元清单重写 | 23 |
| 2 | 删占位合同子路径与死代码、补插件 SDK 出口、两个无版本的库加版本、跨主人 SQL 门禁、项目删除统一、Goals 无生产调用方的桥删除、工作区读一个 id、测试改走公开入口、契约快照门禁、安全不变量逐条测试、逐插件结论与 AI 入口清单 | 19 |
| 3 | 调用 id 贯通、统一错误模型、contracts 里的运行时逻辑迁出、情境启发式归位、注册时交叉校验、Runtime 插件的平台服务、管理入口改走动作、删除 Casebook 与实验插件（10-10 决定）、跨入口一致性用例、浏览器请求助手 | 10 |
| 4 | 探针插件夹具、Manifest methods 生效、工作区伴随按声明、Form 迁到 Runtime 的样板、助理拆分样板、Prologue 适配器与 Coding 路由拆分、记忆与放置归 Module、周期任务注册、客户端空闲负载、Home 库统一登记、视觉比对 | 12 |
| 5 | 插件按族迁到 Runtime、声明式登记、翻译按主人分、浏览器代码打包与类型检查、删旧皮肤、贡献挂载器、请求处理改注册表、宿主入口收窄、其余巨大单元拆分、宿主瘦身、测试并发隔离、结构化日志、术语改名、成熟度词表、Home 快照命令、目录库路径派生 | 17 |
| 6 | 删旧插件 API 别名与短路由、生命周期用例扩到迁移后的生产者、Skill 与手册统一更新、§3 指标重量、最终回归、交付汇总 | 6 |

**评审发现的覆盖缺口**（已并入路线）：静态检查、安全不变量测试、术语表、依赖普查、创作台 Skill 回放工具、逐插件结论、AI 入口清单、前端质感走查、第一步场景与快照的回归比对、「明显下降」没有数字目标、开工与收尾的 §3 指标对比；另有两个库没有版本（experiments `private.sqlite`、alchemist `search.sqlite`，与 §4.1「每个库一份当前 schema」相冲突，W2-05 补）。

**C 端就绪方案**（§4.19、交付第 22 项，W1-21）：[c-end-readiness.md](c-end-readiness.md)。三个里程碑（M1 能装到第二台 mac、M2 保持更新不丢数据、M3 不止 macOS）、各项成本与依赖、5 个探针，以及它们与各波的对应（它的 §4.1）：M1 的前置片在第 4、5 波，所以 M1 最早在第 5 波之后收口。还要用户定的 7 项在它的 §8，用到的已定决定在它的 §0.1；用户决定后各写成 §1 表的一行。

**普查之间的矛盾，按日常取舍定**（记入 §1）：宿主测试不加 `./testing` 子路径，测试走公开入口与 test-kit 助手；助理先就地按包形边界拆、再搬包；`goals-page-renderer.ts` 是外壳页面渲染器，改名留在工作台；门禁基线先加「与合并基点比对」，baseline.json 暂不拆；Home 库登记放在 storage、插件库由插件声明；插件模型端口做成 Runtime 插件服务（由 agent-host 支撑），不新增 typed capability；`stamp-store-baselines.mjs` 等 W2-05 用完再删（W2-05 已删，两个新库的盖章另有维护五的脚本）；调用 id 只在 W3-01 做一次；探针插件夹具只做一套；实验的 grok/laya 本地调用登记为例外，删除条件随 Prologue 收敛口径。

**用户决定**（27 项，10-07 至 10-08 分 7 批弹窗，全部已定；原因与细节见 §1 各行）：

| # | 问题 | 决定 |
| --- | --- | --- |
| 1 | 两套能力机制收敛（N-12） | 对外的只走动作 |
| 2 | 记忆、放置与情境启发式归属（N-03） | 架构里加一类「平台产品服务」，代码不搬 |
| 3 | 系统助理去向 | 先就地拆、再搬成独立包 |
| 4 | IM 实验与「讨论」页签 | 保留并继续迭代，只修数据登记、越界读表与归类 |
| 5 | 调用编号上界面 | 错误详情里显示短编号可复制，诊断页按编号列出 |
| 6 | MCP 连接工具的 actor_id | 从可信会话取并删参数 |
| 7 | 宿主设置写入 | 留作管理接口并登记例外 |
| 8 | Casebook 能力 | 删除 Casebook 与实验插件（10-10 决定；原为随 N-12 改成同 id 插件受众动作） |
| 9 | 插件平台范围 | Home 级 Runtime、数据不动 |
| 10 | 第一个迁移样板 | Form 先、Todo 第二 |
| 11 | 第三方插件信任 | 本地装、首次确认、沙箱里跑（只写计划） |
| 12 | 合成根的测试入口 | 不加 testing 子路径（按矛盾裁定） |
| 13 | SSOT 与 CODEOWNERS 负责人 | 角色加账号、评审请求不强制 |
| 14 | CI 产品子集 | 先不挡、两周后并入 Verify |
| 15 | 「不留兼容」窗口 | 第一个装到开发机外的版本 |
| 16 | 翻译 | 全部换成稳定键 |
| 17 | 视觉验收与页面体积 | 自动比对像素、超阈值给用户看；体积先冻结，2026-10-18 改为体积控制：必需的增长经评审一次性放行 |
| 18 | 非内置插件的 methods | 和内置插件一样注册 |
| 19 | 没有使用者的接口 | 删按需搜索，记忆只给 MCP |
| 20 | 备份与清除范围 | 离线快照命令，清除覆盖所有登记的库 |
| 21 | 真实 Home 残留 | 核对后清理，目录库路径改推导 |
| 22 | 评审截图与根目录材料 | 只留被引用的，商业材料移出仓库 |
| 23 | 版本与发布 | 一个产品版本，下一版 0.3.0 |
| 24 | 工作树、分支与仓库设置 | 本会话清本地；用户清远端并开自动删除 |
| 25 | Prologue SDK 与私有包 | 推上游分支，私有包不再随仓库发 |
| 26 | Characters 的代码身份 | 并进宿主，变成设置的一节 |
| 27 | 术语合并范围 | 文档一个定义、内部名跟着改、界面用词另列审批 |

**第 1 波产出**：W1-20 依赖清单与 Prologue SDK 收敛方案（2026-10-08）见 [dependencies-and-sdk-plan.md](dependencies-and-sdk-plan.md)；根 `package.json` 已固定 `packageManager`（pnpm 11.9.0），CI 与发布工作流读它。

**第 3 波方案（2026-10-10）**：C 批 W2-10、W2-11 与第 3 波 W3-01 至 W3-10 各做了一份只读方案，每份经一次对抗评审再修订（现状带文件与行号、目标设计、PR 拆分与依赖、先失败的测试、门禁影响、风险）。方案里需要用户定的 25 问已全部弹窗问完，见 §1 2026-10-10 各行。对路线的改动：W3-08 不再把 Casebook 改成插件受众动作，改为删除 Casebook 与实验插件的全部代码、合同、测试、文档与项目库表（项目库 v6 → v7，随后真实 Home 维护六）；W3-02 按用户定的「一律用主人名开头」改全部错误码；W3-01 的每轮诊断编号记在 Molis Work 自己的冻结记录，界面显示分两处（诊断页按诊断编号查找、调用记录里的编号由 W3-01 做；错误详情里的短编号由 W3-10 的共用请求助手显示，所以 W3-10 合入之前，§4.2 的「从界面报错能追到具体环节」只能经诊断页手动按编号查）；W3-07 把 Coding 的四个目标入口也改走 Goals 动作，并让命令行与管理 MCP 在宿主运行时转发。W2-10 实测比路线估的大（294 个测试文件、9 个 PR），排在 B 批与 W2-11 之后。

**第 3 波 A 批（2026-10-10 至 10-11，全部合入 main）**：W3-01 A #372（调用编号进内核）、W3-03 #373–#375（声明规则刻画、执行生命周期与 Manifest 解析归插件开发包）、W3-04 #376–#379（情境判断的边界、入口、两段提示词进设置、创作台的选择提示）、W3-06 A–C #380–#382（Runtime 插件的平台服务、随宿主发布的插件拿全部声明的权限、内置插件以插件名作来源编号）、W2-11 a0/a/b #383–#385（探针标记、test-kit 的一份 Chrome 启动器、MCP 公开工具名与可用性）。逐个从最新 main 准备、门禁通过后排队合入；#383 的产品子集（不挡合并）有一条浏览器冒烟在 Linux 机器上两次都报「Chrome debugger did not start」，其余 4 条冒烟和 355 个文件通过，main 上同一条通过，记作环境问题。
**第 3 波进度（W2-11 c1 至 d，2026-10-12，在分支上，等合并）**：c1 `test/test-kit-local-host-http`（test-kit 的 `/local-host-http` 子路径、`tests/fixtures/test-home.ts`、七个 MCP 调用方用例）、c2 `test/plugin-grants-real-route`、c3 `test/agent-function-grants-real-route`、d `test/goals-mcp-grants-real-route`（叠在 c1 之上，与 c2、c3 互不依赖）。d 做了什么：`tests/fixtures/goals-mcp-grants.ts` 不再自己写 `config/mcp-tools.json`，改走 `POST /api/settings/mcp/actions`（约 60 个 Goals 动作按依赖顺序、同范围的一起分四次存），所以产品会拒绝的授权在用例里同样被拒绝：目录里没有的项目、项目没装的插件、模型的客户端不能持有的动作；要求加授权的 `also` 动作没被提供时报错，不再悄悄跳过。它的 14 个调用方跟着改：5 个用自编项目编号和孤立库文件的用例（`command-entry-chain`、`goal-read-entry`、`host-entry-consistency`、`local-host`、`proposal-entry-chain`）改用目录里真的项目，由项目创建时初始化 Board，所以各自的 `init` 步骤去掉了（命令行 `init` 另有 `cli-protocol.test.ts`）；Host 绑着 Home 的用例（一个 Home 同一时间只有一个 Host）把自己的 Host 交给 `serveTestHost` 来存授权，`runtime-skill-flow` 在存授权的时候先停掉自己的 MCP 进程（真实情形里存授权的是另一个进程）；`goals-actions`、`goals-mcp-actions`、`mcp-context-actions`、`mcp-resume-view`、`mcp-action-catalog`、`mcp-action-settings` 的授权与撤销改走同一个接口，`mcp-action-settings` 的「提供方没了、项目也没了」那一段改用一个从没撤销过的第二个客户端造出这个状态（接口不能给不存在的提供方加授权）。四处「只给本人的动作不能授权给模型」（`goals-decision-actions`、`goals-tree-actions`——两个都是 S-17 的用例、标题不变——`goals-configuration-actions`，另有 c2 的 `personal-planning-actions`）原先调 `createMcpActionGrant` 断言抛 `mcp.grant_invalid`，现在断言接口把请求当成「没有这个能力」拒绝（404 `actions.missing`，客户端的授权列表里没有新增记录）：同一条规则（模型的客户端拿不到只给本人的动作的授权）在更早一步、在真实的路径上执行；`createMcpActionGrant` 自己的受众规则经接口走不到，在 S-08 的用例「MCP grants are exact for client, project, Home, provider, version and accepted permissions」里补了五条断言（只给本人的动作、`agent:` 与 `runtime:` 各自的受众、空客户端名、正向一条），标题不变。变异检查：去掉 `packages/kernel/src/action-service.ts` 目录里的受众过滤，三个 Goals 用例的 404 断言都变红（接口答 400 `mcp.grant_invalid`）；去掉 `mcp-action-grants.ts` 里的受众判断，S-08 的用例变红。逐处原因与归属的清单（用户 10-10「收尾时剩下的每一处列出原因与归属」）：[test-internal-imports-ledger.md](test-internal-imports-ledger.md)。
**每批之后的合规复查（用户 2026-10-10 加进目标；10-12 批准改由 Codex 完成）**：第 2 波 B 批确认 42 条，并成 18 个修复题目（每个两道评审，没过的再修），全部合进整合分支 `integration/wave2b-compliance`（基于 main `9f9bda551`，合并时 7 处文档冲突按两边各自的改动合并；BACKLOG 撞号，`fix/touch-targets-360` 的待办改成 BL-127），构建与门禁通过后跑全量（10-11）：5,527 个用例，5,508 通过、8 失败、2 取消、9 跳过（同机同时有修复代理在构建，负载 12–23）。失败与取消涉及的 10 个文件在负载低时重跑，33/34 通过；剩下的分两类：①真的合并缺陷 2 处——`fix/studio-english` 新加的浏览器用例还用 `ChromeHarness.start`，#384 已把它换成 `openStudioChrome`（报 ReferenceError，在该分支上改）；`fix/touch-targets-360` 把项目菜单行的 `height: 34px` 换成只有 `min-height`，让一条更早的 `.personal-account { height: 44px }` 在精细指针的桌面窗口生效，账号一行在 761px 变成 44px（`tests/project-home-start.e2e.test.ts` 失败，干净基线 `9f9bda551` 上通过）：改成 `height: var(--menu-row, 34px)`，桌面 34、触屏 44；这条用例在 600px 期望 30–36px 是 W2-18 决定 10 之前的写法，按决定（手机宽度下底栏打开的列表是 44px 目标）改成手机宽度 44、桌面 30–36，属预期变化，不是放宽。②其余 7 个文件重跑通过，是负载下的超时与等待。修好后整合分支重新构建、门禁，跑底栏与菜单相关的 8 个浏览器文件；没有为一处 CSS 改动再跑一次全量（日常取舍），下一个整合分支（第 3 波 A 批的 6 个修复加 B 批的前 4 片，叠在合入这些修复之后的 main 上）照常跑全量。再逐个从最新 main 合入。第 3 波 A 批按任务书 §3–§13 十个维度找、逐条对抗核实：确认 25 条（多条重复），并成 5 个修复题目（Scheduler 的插件身份规则归 Scheduler、创作台的两条选择提示走它的目录条目、规则目录的 `plugin_id`、随宿主发布的权限与来源编号的文档与安全不变量、其余文档漂移）；另有 5 条说调用记录的范围「还要用户定」的文字，交给 W3-01 B（它按 10-10 的决定改写那条硬规则）。
**第 3 波 B 批与 C 批其余的计划（2026-10-11）**：[wave3-batchB-plan.md](wave3-batchB-plan.md)。计划代理把每片方案对照 main `b2460cb62` 重新核对（九个只读代理各看一片），列出每个剩下的 PR 的改动、依据的决定、依赖、碰到的枢纽文件、会动的门禁、大小与先失败的测试，排成 8 条并行线。要点：Casebook 与实验插件删掉后，W3-07 PR-1、W3-01 C、W3-02、W3-09 里与它们有关的部分作废；「一律用主人名开头」让 W3-02 变成特大（约 743 个不同的码、89 个前缀，Goals 一家 185 个），W3-02b（改名收尾）由可选变成必做；`LocalMcpServer`（297/300 行）、`registerProvider`（147/150）、`handleCodingPluginHttp`（148/150）贴着巨大单元的线，先做小的拆分 PR 再动；计划带出的 4 问已于 10-11 弹窗定（§1）。

**第 3 波进度（W3-03，2026-10-12，五片已合入，C 经 #441）**：按「放进插件开发包」（§1）拆成五片，各自能单独合：PR-0 声明规则刻画用例（只加测试：`tests/plugin-declaration-rules.test.ts` 与夹具 `tests/fixtures/declaration-manifest.ts`，把动作、场景、清单各段、Agent 块、方法的每条规则和「几条一起违反」时的整条消息与先后顺序写成字面量，已进 `test:contracts`；对校验器做了 13 种变异，每一种都使它变红）；PR-A 执行生命周期归插件开发包（`createExecutionLifetime` 随 `git mv` 进 `packages/plugin-sdk/src/execution-lifetime.ts`，合同包删 `platform/execution-lifetime` 子路径，内核不再转出，宿主一侧七处调用与动作服务改从 SDK 取；调度服务、Shelf 模块、沙箱把内核依赖换成 SDK，local-host 与根包加 SDK 依赖；SDK 进共享核心，边界规则 `public-sdk-private-dependency`）；PR-B1 清单本体归插件开发包（`plugin-manifest.ts` 随 `git mv` 成 `packages/plugin-sdk/src/manifest.ts`，端口与事件检查进 `wiring-declarations.ts`；合同包删 `parsePluginManifest`、`PluginManifestError`、`comparePluginVersions`、`canonicalPluginId` 与两个检查函数，`SURFACE_BROWSER_PERMISSION` 留在 `platform/plugin`；Plugin Runtime、命令行、15 个测试改从 SDK 取，Plugin Runtime 与命令行加 SDK 依赖）；PR-B2 动作、Agent 与方法的声明检查归插件开发包，两个巨大函数边搬边拆（`inspectActionDeclarations` 成 `action-declarations.ts` 里按声明段的小函数，四项来源检查成 `source-declarations.ts`，`inspectAgentDeclaration` 与 `inspectMethodDeclarations` 成 `agent-declarations.ts`；合同包删这七个名字，内核改从 SDK 取 `inspectActionDeclarations`，SDK 只多出口这一个；巨大单元 159 变 157，合同包纯度记录 18 变 13；6 个测试改为经清单解析读结论，11 个测试改从 SDK 取）；PR-C 文本比较归插件开发包、删没人用的推荐函数（`workspace-text-diff.ts` 的代码进 `packages/plugin-sdk/src/text-diff.ts`，合同包只留五个类型；工作台审查界面、Coding、Diff 改从 SDK 取，Diff 不再转出；`suggestedAuthoringBehaviors` 删除，两个测试改测目录数据并新增一个执行页面规则的用例；合同包纯度记录 13 变 8）。五片已分别经 #373–#375、#414、#441 合入；合同包里还剩的纯度记录见 §3.1 的 N-11 行。路线表里 W3-03 一行写的「搬进内核」「搬进 plugin-runtime 并由 SDK 转出」做不到（SDK 一转出私有包的东西，外部作者就装不上，2026-09-30 出过一次），已按这条记录改写；W3-05 的交叉检查随之放在 SDK 里，导入 B2 的 `inspectActionDeclarations`。

**第 3 波进度（W3-02，2026-10-12；本段保留 A/C 实施说明，实时批次见 §10.1、§10.4、§10.9）**：A（错误模型与 Todo 样板片）经 #419 合入。C（路由绑定函数归插件开发包，Plugin Runtime 路由器、页面外层与 Coding 客户端改答平台的码，分支 `refactor/route-binders-in-sdk`，叠在 W3-03 C 即 `refactor/text-compare-in-sdk` 上）：`bindPluginActionRoute`、`bindOwnerPluginAction` 随实现进 `packages/plugin-sdk/src/routes.ts`，合同包不再有状态码表（纯度记录 8 变 6）；路由按失败的 kind 答 `{ error, code, details? }`；Plugin Runtime 路由器的四个裸字符串改答 `actions.forbidden`、`actions.plugin_disabled`（404 变 403）、`actions.plugin_unavailable`、`actions.execution_failed`；页面外层与 Coding 设置页跟着改；Characters、Files、Git、Issues、Shelf、Text Stats 加 SDK 依赖。取舍与方案没照顾到的 Files、Git、Diff 缺口（本片补了这三个插件 28 处调用者条件不满足的抛出的主人码）记在 §1 的 2026-10-12 一行。B（错误门禁）已随 I2 合入，C 已经 #452 合入；D 之后的分片已陆续实施，G1/G3 在 I6 候选中、G4 在途。原「C 待合入、B/D 未开始」已过时，不再用此段判断当前进度。

**第 2 波产出**：W2-18 证据写作（2026-10-09，只读代码、没有改代码）：[逐插件结论](plugin-conclusions.md)（交付第 10 项；26 个内置插件与 6 个官方接入，五个维度加横向比较、平台接点矩阵、11 个组合场景；一行的结论由五格按规则滚上来：通 9、部分 17、缺 0；新发现 21 条：已登记复核 K-1 至 K-5、新发现 E-1 至 E-16；§0.1 逐条对照任务书 §6 的十条检查）、[AI 入口清单](ai-entry-inventory.md)（交付第 12 项；45 行，分类与迁移、旁路核查、工具可理解性；模型之外的出站网络 13 类逐类登记在 §3.10，原来漏了 5 类：评审指出了 npm 注册表和模型主机名的公共 DNS 回退，Whisper 模型下载、侧栏浏览器、研究库的 `git fetch` 是复核时把扫描扩大到原生组件和子进程后补的；评审还指出 Feed 的网页搜索被误写成走 `anysearch-transport.ts` 与公共 DNS 回退，实际走 vendored SEL 自带的宿主，第 3 类因此分 3a、3b，并补解了 SEL 与 intelligence-client 两个 vendored 包；第四次评审又指出扫描的写法漏了 10 个文件，加宽后命中 81 个、逐个对到类，补上了项目上手直读 Gmail、Jelly 的站点适配器（固定主机 `api.bilibili.com`）和 Jelly 读网页自带的一份公共 DNS 回退；待决与清理 12 项）、[前端动线走查](frontend-flow-walk.md)（系统整理要求 §9，只做了一部分，§6 逐条写了做到哪一步；31 张截图在 `evidence/flow-walk/`，新发现 V-1 至 V-5）。**要用户决定的 15 项**（问题、选项、推荐在 §1）：`CliAgentAdapter` 去留、实验的本地调用是否进 AGENTS.md、Schedule 创建时是否查就绪、没有模型时的供应商预设（V-1）、Text Stats 是否留在插件列表、Pages 空文档（E-9）、市场脉搏的 GitHub 令牌怎么读（E-16）、Characters 的写入权限（E-2）、Feed 升格为 Goal 的可用性（E-15）、外壳触控下限的例外（V-2）、飞书/Lark MCP 的 `npx`、Shelf 首次示例（E-12）、个人插件「移除」改真停用的排期（K-1，行为已定）、出站时把主机名与包名发给第三方要不要在界面告知（AI 清单 §7 第 10 项；三处：npm 包名、模型与搜索服务的主机名、Jelly 导入网页的主机名）、AnySearch 两套出站实现的去留（SE-1、SE-4）；E-1 不需要新决定，按 10-07 已定的「各主人一起删」收尾。**必须接续（本次明确并入原 W2-18，依赖与验收见 §12.3 及原路线图，不另建任务线）**：（1）前端质感走查第二轮：键盘与读屏、失败与离线等状态、暗色与英文、四态区分、有真实模型的路径；（2）逐插件的失败、取消、并发、恢复审查，按现行插件全集重对，原「未点名的 13 个」仅是历史差集，须扣掉 Experiments、加入 Issue，并复用 §11 的有效证据；（3）测试与预期对齐（系统整理要求 §12）：每条断言是否对应预期行为；（4）动作目录的「无生产调用方」扫描与输出合同的逐个比对。

### 10.1 2026-10-12 接续核对与第 3 波 B/C 进度

本次以 GitHub PR 的合入状态、`origin/main` 的提交祖先关系、各工作树的 diff 和原执行日志核对，不用交接中的「已完成」代替证据。I3 最终 main 为 `8d81173a7`。以下「第四批」「第五批」是第 3 波 B/C 内的执行批次，区别于路线图的第 4、5 波。

| 批次或事项 | 已合入 main 的 PR | 结果与边界 |
| --- | --- | --- |
| 第 2 波 B 批合规修复 | #386–#394、#397–#405（18 个）；维护七收尾 #406 | 42 条确认项并成 18 个修复主题，已合入；原整合回归和负载下重跑见本节上文。 |
| 第 3 波 A 批合规修复 | #407、#412–#413、#416–#418 | Scheduler 可信插件身份、规则目录的来源身份、创作台选择提示登记、权限与来源编号文档漂移已合入。 |
| B/C 第一批、I1 | #414、#415、#419、#421；Inbox 等待预算 #422 | W3-03-B2、W2-10-PR-0、统一错误模型样板、调用记录与拒绝诊断已合入。 |
| B/C 第二批、I2 | #424–#428、#435–#436 | P-MCP、Runtime 平台 Home、上手与 guidance 走 Goals 动作、交叉引用检查、错误码门禁、请求/Feed/定时器调用编号、浏览器请求助手已合入。 |
| B/C 第三批、I3 | #437、#440–#441、#443–#444、#448–#449 | 根包按包名解析 server、成果声明校验、文本比较归 SDK、文档插件错误模型、Home store、Agent/CLI 调用编号、test-kit 的真实 Host HTTP 助手全部合入。I3 驱动在 10-12 09:10（洛杉矶）输出 `ALL MERGED`，已结束。 |
| 第四批、I4 | #452–#455、#458 已合入；#456–#457、#459已完成当前main复验并推送，按合并顺序同步新main | 8 片已整合；390 个取消文件已全部补跑。对齐 I3 main 后整体构建、全包类型检查、健康与边界通过，17 文件 237 条定向用例与 5 文件 7 条浏览器用例全过。归回整合修复后依次合入，分片补验证据如下。 |
| 第五批 | 未合入 | W3-02-F、W3-02-G2、W3-06-F1、W2-11-d 的末轮评审为通过；W3-10-1b 的手机错误 toast、按钮尺寸与文档修复已完成，追加 ebc4d0123 将最终样式与测试提交：16 文件 149 条定向用例、3 文件 11 条浏览器用例全过，包含 390px 浅深色、桌面及无项目入口；W3-02-F 已对齐诊断 main e4ec01bd0 到 9aa606ffc，16 普通文件 146/146 与锁内 Shelf 浏览器 6/6；诊断 main 组合 4 文件 21/21，构建与门禁通过、资源不变；三份 CSS 比原分支预算各降 3 字节，健康与边界通过。第四批 I4 八片已全部开 PR；第五批的 F1 已对齐最新 main 到 82a7baf6d，5 文件 22/22 与构建/门禁通过，通用路由操作保留 Coding 专属钩子且无 API/动作/资源变化；第五批进入独立 feature/anti-corruption-wave3-i5 整合；原 I4 树保留，只在新的隔离树中继续。G2 与 MCP formatter 的组合点已确认：目录错误折为 ActionError 后，元数据须保留到新的 mcp-call-id formatter，可信编号最后写入；修复归 G2，验证后再合入。只读复核指出未留行时 details.call_id 可自称编号、details.code 可覆盖真实码，已在 adb68f210 过滤这两项保留字段；ActionError 与 V1 分支均只写真实码和确实留行的宿主编号，其他详情保留。主协调对照实际 diff 与日志确认修复，公开 MCP 用例覆盖真实未来版本目录不改原库、两类错误有/无调用行及实际可查的 Host 编号；15 普通文件 158/158、锁内成果导入浏览器 1/1，构建、健康、边界与资源通过；G2 已对齐诊断 main 到 33b01d727，新增 3 文件 35/35；FunctionsError 出口退役，动作与资源不变。 |

**第五批当前 main 复验与发布。** 五片已在ed419f303独立锁内整体构建/类型/边界/健康、API/动作/资源实测，并核对远端发布HEAD；只将原整合修复归回对应片，未增加生产补丁。F与G2的工厂及元数据边界已有独立窄复核；相关当前组合用例均无跳过/取消。各PR等待全部CI/Verify及main同步，不把READY或已开PR记作合入。

| 片与 PR | 发布 HEAD | 当前定向证明与合同影响 |
| --- | --- | --- |
| W3-02-F #465 | c0f80835a | 4文件22/22，真实Coding→Shelf、伪造外来code/call_id拒绝、指纹409；95子类/516坏形状/173状态/1116非主人码，API/动作/29资源不变。旧146/146与Shelf浏览器6/6等证据保留。 |
| W3-02-G2 #466 | b8fbe0268 | 4文件41/41，真实未来catalog元数据和原库不变、两错误类型×有无记录的保留字段拒绝、Functions413/非法JSON400且never不执行、SDK/真实Runtime HTTP；FunctionsError公开类删除的原快照同步，动作/资源不变。 |
| W3-06-F1 #467 | 73f8ef7a8 | 3文件10/10，真实运行状态503/POST重试持久running、upgrade409不改安装、view/no-cache、未声明404与控制令牌/项目隔离；仅5文件共同Runtime操作提取，Coding输入图钩子保留，API/动作/资源不变。 |
| W2-11-d #468 | ad66deb95 | 5文件22/22，真实HTTP授予、catalog未提供/卸载拒绝、精确权限撤权/替换、MCP作者与收据、唯一Agent服务整轮编号；31文件仅测试/文档/生成，869内部引用、164混源；API/动作/资源不变。 |
| W3-10-1b #469 | 39cdb9339 | 4普通文件60/60、3锁内浏览器文件6/6，真实迟到响应交错、可查号复制/无记录无号/断线未知、390px浅深色44px按钮及桌面/独立设置；API/动作不变，29资源11,366,488字节比main减156，四个预算实测只降。 |

独立Issue decoder barrier #464发布43175b137，同main实际整体构建与门禁后浏览器5/5；diff只有测试两行。原生拖放、图片上限/格式、取消离开后DOM/存储与原时限保留，生产及公开合同不变；待全部CI/Verify及main同步。

**I4 分片补验（10-12）。** 早先对齐 main 9e7f650f2 仅新增 #451 测试/文档，生产未变，保留已有有效验证。C 合入带有源码/脚本/包增量，I5 全量持锁期间四片只机械合并，未冒称READY。全量及静默对照结束后，四片已在实际 main ed419f303 逐棵锁内离线安装、整体构建、API/动作/资源与健康实测更新、边界及类型检查，全部通过；README必跑取并集，没有门禁、阈值或Biome放宽。下表当前HEAD已核对远端，待各HEAD全部CI与Verify通过、对齐main再交原daemon合并。

| 片 | 当前提交与 PR | 已核对的补验 |
| --- | --- | --- |
| W3-01-D MCP 调用编号 | #452 已合入 main 1ec92c18e | main 合并仅测试/文档；原 68 文件 542/542，security 161 通过、1 原有跳过；构建、健康、边界、API/动作/资源、密钥扫描及只读复核通过 |
| W3-01-F 诊断查找 | #453 已于 12:15 合入 main e4ec01bd0，必需 CI 全过 | 10 文件 78/78，锁内编号查找/真实剪贴板 1/1；原 7 文件 85/85 有效证据保留；构建、健康、边界与资源通过，API/动作无新增变动 |
| W3-02-C SDK 路由绑定器 | #454 已于 13:29 合入 main 56033f06d，必需 CI 全过 | 17 文件 108/108；绑定器移至 SDK 同名实现，contracts/SDK 快照同步；contracts 长函数项 8 → 6，工作台脚本比最新 main 降 24 字节；对齐 Issue #420 后再整体构建与门禁，6 文件 30/30；再合诊断 main 后 3 文件 17/17，源码无冲突/修复 |
| W3-02-E Feed/Inbox/Schedule | #455已于16:42合入main0568cd684；3ce67a1e5在实际ed419基点七项CI（含Linux/Product/Verify）全部通过 | 13 文件 188/188；含浏览器的 Schedule 文件另经锁复验 5/5；错误子类 102 → 99、坏形状码 539 → 448、状态决策 200 → 187、错主人码 1139 → 1043；构建与门禁通过，无动作/资源变化；对齐 Issue #420 后 4 文件 42/42；再合诊断 main 后 3 文件 26/26，无新增生产修复 |
| W3-06-E 模型服务 | #456已于17:55合入main679034ca；固定d0e0c8c74在main0568基点七项CI全部通过 | 11 文件 117/117；包括本机替身经真实 SDK/动作 client、取消/停用/调用结束/指令归属拒绝；公开类型及 SDK 提示词出口快照同步，构建与门禁通过，无动作/资源变化；对齐 Issue #420 后 4 文件 37/37，包括真实 SDK 经本机替身与新 Issue 助理；再合诊断 main 后 3 文件 26/26，仅合并必跑清单 |
| W3-07-PR-3 CLI Goals 动作 | #457；READY并已推送d27fad963，base ed419f303，待CI | 11 文件 129/129；每命令一次动作/一个编号、无并行 typed 记录，身份拒绝、提案跨 Host 重启及合同快照通过；构建与门禁通过，unknown casts 197 → 193；对齐 Issue #420 后 4 文件 24/24；再合诊断 main 后 3 文件 17/17，仅合并必跑清单 |
| W2-11-c2 插件授权真实路由 | #458 已于 12:53 合入 main ba6f5232，必需 CI 全过 | 9 文件 19/19；真实 Web/MCP 共享授权和撤权、用户专用拒绝与恢复；构建与门禁通过，内部引用 909 → 886、混源进程 176 → 173；对齐 Issue #420 后 4 文件 9/9 |
| W2-11-c3 Agent/函数授权 | #459；READY并已推送b6d3c0043，base ed419f303，待CI | 普通 3 文件 23/23、浏览器锁内 3 文件 3/3；真实动作选择、Agent 创作与未知场景编辑器通过；构建与门禁通过，内部引用 909 → 898，无 API/动作/资源变化；对齐 Issue #420 后 2 文件 7/7 |

**回归证据。** 原日志位于本机交接所指的会话临时目录，不作为新增仓库资产。I1：5,599 个用例，5,587 通过、3 失败、9 跳过；I2：5,824 个，5,813 通过、2 失败、9 跳过；I3：5,920 个，5,904 通过、7 失败、9 跳过。交接报告的分类分别是 I1 三条负载超时、I2 两条真问题已修、I3 一条 Characters 夹具问题已修与五条 main 既有问题、一条偶发；接续核对已确认 I3 的 Characters 夹具由 cad95801d 修复，修复后的三条浏览器用例 3/3、必跑用例 417/417 通过；五条布局失败在 main 347d0a541 同因复现；Issue 导航的一条仅能认定重跑通过，偶发机制未查明。I1/I2 的原分类继续由原执行报告和修复提交提供证据，不宣称全量零失败。

**当前 main 补验。** #455 为4文件39/39（Feed/Inbox/Schedule及真实Runtime HTTP），#456为4文件34/34（模型14、Runtime-integration13、SDK5、真实HTTP2），#457为4文件11/11（真实CLI/管理身份/SDK/HTTP），#459为5普通文件30/30及浏览器锁内3/3（真实推荐和创作）；全部无跳过/取消。API、动作与29资源11,366,644字节实测；E的两份Feed/Inbox公开快照按工厂替代原错误类，Model的两份公开快照记录instructions/model与SDK提示词出口。其余动作快照、资源不变；四片均推送前密钥扫描通过。CLI第一次推送443网络短时失败，重试后核对远端HEAD一致，不归为代码失败。

I4 首跑 `i4-full.log`：3,639 个用例，3,246 通过、2 失败、390 取消、1 跳过。两条失败为 `feed-capture.e2e` 和 `immersive-directory.e2e`；390 个取消项是测试文件入口，统一报事件循环结束时 Promise 未完成，具体中断来源未确认。10-12 接手时 PID 30523 正在用 `i4-rest.log` 补跑剩余文件和 Feed 用例，不重复启动、不改该树的源码或 skills。续跑最终 2,748 条：2,735 通过、5 失败、8 跳过、无取消。失败是 Feed 与四条 touch-targets；首跑另有一条 Immersive。Feed 在原分支、I4 带请求观察的副本及未改动的原用例、对齐最新 main 后的浏览器批次均通过（独立约 13–14 秒），整批失败时约 22 秒；未证实读取器卡住，未按猜测修改生产代码或放宽超时。

**已知基线失败与归属。** 原交接及 main `347d0a541` 的比对指出 Issue 合入后的 `touch-targets.e2e` 四条未列入按钮规则和 `immersive-directory.e2e` 标题栏按钮位置问题；原由 BACKLOG 的 BL-133 跟踪；用户批准的五条旧测试修复 #451 已于 10-12 合入 main 9e7f650f2，必需 CI 全过，待办已删除。10-12 用干净源码的 main 8d81173a7 重新整体构建后跑相同三文件，Feed 通过（约 14 秒），Immersive 一条与 touch-targets 四条仍同因失败（共 7 条中 2 通过、5 失败）。进一步对照 ISSUE-30 和现场测量，确认是五条旧测试未随已接受的入口变化更新；用户已批准修正。修复后的 Immersive、touch-targets 与 Issue 全局导航三文件 12 条全部通过，无跳过，不改生产样式或布局。

**新增 CI 运行差异。** #453 对齐 Issue #420 后的 Product subset（run 38292837918）359/360，通过重试后仍失败的是 `assistant-dock-ime.e2e`；保存的最终错误是 after hook 删除临时 `chrome-profile/Default` 的 ENOTEMPTY，未报告 IME 产品断言失败，首轮详细原因未保存。F 分片没有修改该测试、Chrome launcher 或清理 fixture。main acede03e2 的同一作业（run 38292739820）359 直接通过、1 重试通过，IME 用例单次通过；具体 profile 写入者尚未确认。只读核验建议对该临时目录删除增加有界重试，保留关闭顺序、5 秒上限和最终失败，不改产品断言或测试排除；在 Linux 上验证后按独立修复记录。本机 1b 的 ISSUE-36 同步求值超时在完整构建的干净 acede 同点复现（默认 CDP 命令上限 5 秒）。Root 最小复现发现传 nativeVirtualKeyCode=229 时大量真实 Unidentified 键盘事件，空白 iframe 的顶层求值也可卡住；只省去这个原生键码字段、保留 Windows/DOM 229 与真实输入法组合，三种探针均通过且真实 composing/229 键到达、没有提交。原六条测试的忽略副本仅作此单字段改动，保留全部业务断言与时限，6/6 通过；已在独立 #461 提交测试修复，原文件 6/6（IME 约 3.9 秒），必需 CI 通过后已于 13:55 合入 main faee12f3；不改 Issue 产品代码。此与 CI 目录清理问题分开处理。

**仓库事件。** 原执行报告：10-11 仓库短时转私有，#406、#407、#412–#416 在 CI 未完成时合入，之后 main CI 全绿；用户改回公开并授权恢复 main 的必需检查 `Verify` 及分支同步要求。交接合并脚本已要求逐项等待必需检查成功，接续继续遵守，仓库设置不在本轮另作修改。

**W2-10 后续窗口的只读测量。** 10-12 在保留的 I4 整合树 bdc23ab9d 运行现有 codemod 报告（未写源码）：875 个内部引用、173 个混源进程；当前计划可转换 268 个文件、没有阻塞组，内部引用预计降低 355、混源归零。改变目标的动态导入/require 有 14 处，正式改写前再以当时 main 生成并逐项对照基线，不把这份报告当成已经完成的迁移。

**I5 的组合收口。** 隔离树已合第四批与第五批、独立 IME 和有界清理修复，按当前 main ba6f5232 保留双方文档；最终 head 8bac4a4ea 已对齐 main 56033f06d，整体构建、门禁、类型检查通过；4 个浏览器文件 16/16。16 普通文件首轮 135 条：134 通过、1 失败，为 Agent 编号用例的授权夹具签名未同步；该消费者修复归第五 d，经真实 HTTP 项目/授权和 Host 唯一 Agent 服务，固定 294bb2385 复核无 Blocker/P1、全文件 9/9。针对新的 CI 疑点 runtime-integration 另已通过 13/13；包含旧重复服务装配失败的整段日志不计作全绿。13:59 主协调持浏览器与构建排他锁启动独立全量（i5-full-01.log），固定 8bac4a4ea 的源码/脚本/包与 Skill 冻结直到退出：6,051 条，6,039 通过、3 失败、9 跳过、0 取消，约 103 分 44 秒，退出码 1。不能称全绿；完整 footer 与静默定向重跑确认下述三个失败点。首个失败已由独立只读复核与主协调核实为 action-error-model 的 Functions 大请求体旧 mapper 默认 400 断言：G2 已移除 mapper，实际 SDK 出口按既定 too_large kind 回答 413；生产无效 JSON 仍为 400。修复归 G2，其原分支已保存 687ac9c91，仅同步现行 Functions 消费者与过渡标题、413 预期；主协调核对与冻结树的差异只为标题/注释和超限状态，输入/code/message/invalid JSON/never 动作不变。全量期间冻结树未改；全量及基线对照结束后，三项 test-only 修复在 2a1912250 的同组复验 23/23 通过，见下。W3-02-F-INTEGRATION：C 的 SDK 路由绑定器和严格 ActionError 外来拒绝与 Shelf 的工厂同时保留，Coding 校验仍归 coding.shelf_material_invalid；组合修复 0ad07f8a3 补回五处工厂并新增真实 Host executor→Shelf action→SDK route 的伪造外来 code/kind/call_id 拒绝。845656157 仅把指纹冲突的旧 400 预期对齐已接受 kind=conflict 的 409，其他 400 拒绝断言保留。固定源码窄复核无 Blocker/P1，最终组合运行证据未出，分别归第五 F，不把各分片通过相加冒称新全量。

**I5 第二条失败的核对。** global-ui-interaction 的窄屏设置迟到响应用例失败（约7.9秒）。固定源码的旧 hook只匹配相对 /settings/runtimes，现请求助手发送 target.href；两方核对确认该 hook无法拦截实际请求，loading请求身份保护仍在。完整 footer 确认为第108行等待 settingsResponseReady 超时；同固定 I5 重跑仍失败，干净 acede 的真实原文件通过，验证了迁移后的旧 hook 缺陷；修复后同组 23/23 已通过。W3-10-1B-INTERLEAVE-01：按实际URL的pathname匹配同一路由，保留真实fetch回应、持有→切回appearance→释放的交错、两帧等待、所有panel/选中/drawer/inert断言与60秒上限；修复归1b，冻结树仍不改。

**I5 第三条失败已定位为既有测试交错缺口。** issue-page 的 ISSUE-10 原生拖放/离开记录图像导入用例失败（约1.29秒），同文件其余四条通过；它不属于此前issue-capture-page的16/16。与acede相比，此测试、Issue client/image/capture、fixture与lifecycle未变，相关生产差异仅插件改用SDK binder。“正在读取截图…”早于文件头异步读取，完整 footer 确认第152行 window.issueFinish is not a function；静默 I5 与干净 acede 都在同一行、同一 TypeError 复现。应先确认实际解码 barrier 已进入，再取消/离开并释放；不改变生产保护、原生文件/拖放、断言或时限。

**W3-02-G2-BODY-01。** Functions 经真实 HTTP 拒绝同一超限请求为 413 / actions.input_too_large / 请求内容过大，无效 JSON 为 400 / actions.input_invalid / 请求不是有效 JSON；两者均在业务 handler 前拒绝，动作不执行。仅按已接受 kind 合同同步旧断言、标题和注释，不放宽大小、输入、错误体或时限。

**I5 三文件静默对照。** 用同一命令 `node scripts/./run-tests.mjs tests/action-error-model.test.ts tests/global-ui-interaction.e2e.test.ts tests/issue-page.e2e.test.ts` 顺序测试已构建的固定 I5 8bac4a4ea 与干净 acede03e2：I5 为 23 条/20 通过/3 失败，acede 为 23/22/1；均无跳过/取消。acede 的唯一失败是同一 issueFinish TypeError，Functions 400 与相对设置 hook 在旧基线通过。故三项分别为按已接受 kind 同步的过渡断言、请求迁移后的旧拦截方式、既有测试 barrier 缺口；修复后三文件同组23/23的实际结果见下，定位本身不算通过。**I5-ISSUE-INTERLEAVE-01**：真实 FileList/PNG 拖放仍加入两张，旧编辑记录的导入确认已在解码等待后取消并离开，再释放；DOM 及持久化图片均为空，原时间上限保留。

**I5 修复后的验证。** 固定 2a1912250 相对 8bac 只有三个测试文件 +8/-6，没有 src/scripts/package/skills 变化；分别为 G2 77700a330、1b 21ce9d473 与独立 Issue barrier 2a1912250。主协调核对实际 diff 后，用原已构建生产代码再次持安静锁运行上述三个文件，23/23 通过、0 失败/跳过/取消，约28秒，退出码0（i5-failures-fixed-01.log）。原生拖放的两张图片、离开后 DOM/持久化为空、真实设置迟到响应、精确413及无效JSON400均仍被断言；不是新的单次全量全绿。全量9个跳过为既有 live账号/真实网络与MiniMax需凭据、以及本机缺shellcheck两条，未宣称其行为已验证；必需CI的Shell/Python检查另有通过证据。

**继续执行。** I4 的失败核对和当前定向复验已完成，接下来把原整合修复归回对应分片、构建和门禁验证、CI 全过后逐片合入；第五批的 W3-10-1b 修复及整合随后收口。B/C 剩余片沿 `wave3-batchB-plan.md`，每批合入后做系统要求合规复查，再执行路线图第 4–6 波。维护八先用拷贝列出和演练，真实 Home 写入等用户决定；不清理其他会话的工作树、分支或备份。


**测试设施的两项收口。** `IME-SIM-01`：ISSUE-36 保留真实 CDP composition、Windows/DOM 键码 229、⌘↵与普通回车不提交、结束组合后只保存一次且原文相同的全部断言；不把 Windows 值硬填进可选的原生键码，验证实际到达的 composing/229 事件，不延长时限。依据 [CDP Input 定义](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Input.pdl)，两个键码字段独立，原生键码可省略（默认 0）。`BROWSER-CLEAN-01`：仅临时 Home 的递归删除使用有界重试，保留 Chrome/server/Host/DB 的关闭顺序、5 秒上限及最终 AggregateError；Linux 验证成功与目录实际消失，不用隔离名单或吞错取得通过。两项各自提交，与业务修复分开。IME 独立 #461 已于 13:55 合入 main faee12f3；清理独立 #462，固定 1f16574f5 复核无 Blocker/P1、完整锁构建/类型/健康/边界与原入口 2/2 在 Mac 通过，原 IME 断言和时限未变。真实删除和唯一预设权限拒绝放在原 CI 浏览器文件，不新增第六冒烟；Linux Product subset（run 38304432216，测试合并树 041b574b）360/360，原入口两条均单次通过、无跳过；已验证真实目录消失及权限拒绝；原daemon同步main后的dd4bb1cc5再次通过Product subset与必需CI/Verify，14:46合入main ed419f303。

### 10.2 Home Runtime 的接续验收（W3-06-F/G）

沿用 §1 的现行决定和 batchB-plan 中更新的 F/G 范围，复用已服务 Issue 的 Home 宿主。目标为隔离 Home 上功能与异常恢复完整；真实 Home 的任何数据操作仍须单独决定。下面的编号写入对应测试名或注释，不以固定用例数量代替验收；模型实测使用真实 SDK 与本机替身，不宣称真实账号已验收。

| 编号 | 可观察结果与证明路径 |
| --- | --- |
| W3-06-F-01 | 公开 Host 的并发发现、动作、场景和 HTTP 共用一个 Home Runtime；两个项目读取同一 Home 安装。真实装配拒绝 Home/project 重叠及同名伪造内置定义；仅可信 bundled 用插件名作 provider，其他安装用安装编号。 |
| W3-06-F-02 | Home 的数据库、模型和动作服务只取可信条目、调用者和当前安装授权；未声明/不足权限、沙箱、宿主或他人数据库及过期世代均拒绝，模型/业务写入未发生。Home 及项目作用域动作/场景按真实 scope 授予；缺项目的 project 动作拒绝，不从输入制造身份。HostPluginCaller.project_id精确表达string或null，Home保留真实plugin/installation/actor身份且项目为null；既有Agent项目入口显式拒绝null及不匹配项目，保留原拒绝码，Kernel project_required仍生效。公开app-host快照、真实Home消费身份和项目拒绝证明同片同步。 |
| W3-06-F-03 | Home 的原生 concurrent 动作经 E 的共同模型入口与本人登记指令调用；指令不能盖过现有目录 owner。取消、撤权、停用、调用结束后的结果不交付且无业务写入；未配模型明确拒绝，调用编号不传给 Prologue。 |
| W3-06-F-04 | 新库按完整 v2 schema 创建，既有 services.storage 的 KV 持久化并隔离安装；真实交错的 compareAndSet 只有匹配版本者提交。失败升级恢复原 KV，升级校验只读；撤权/停止后的旧 storage handle 不再写。 |
| W3-06-F-05 | 用独立 SQL 夹具构造非空 v1 和缺 KV 表的损坏 v2，经公开 Host 启动拒绝；原版本、安装/授权/发行物/世代及事实不变，不新增表、不重建、不静默清空。无运行时迁移或读取兼容。 |
| W3-06-F-06 | 停用、停止开始、卸载、关闭/重装后的旧 database/model/actions handle 失效；停止钩子不能继续写。关闭保留启用意图，用户停用跨重启保持，显式启用恢复；重装世代变化不复活旧授权。 |
| W3-06-F-07 | Home HTTP 在无项目和两项目前缀下仍访问同一 Home 实例、保持 Home scope；保留控制令牌/Origin/一次性键、取消及 beforeEffect、client_reported 页面上下文、Issue 图文上传限额、revision 与项目专属钩子边界。重启/解除隔离/升级等写操作未经保护被拒且状态不变。已声明Home卸载后缺真实安装回答404，不借项目前缀落到另一实例；已注册Home未声明operation及实际项目范围unknown为404。裸global未知plugin未被Home接管，保留旧catalog的400/先选择项目语义，本片不扩大目录路由。 |
| W3-06-F-08 | 损坏 Home Runtime 库使其自身保持明确失败，公开发现、Goals 页面与其他项目动作仍可用；普通 ready 不自行重试，受保护的显式 retry 并发只启动一次。清理失败或关闭不另开实例。 |
| W3-06-G-01 | README、接入/迁移/调用链/事实 owner/库版本及相关 Skill 与实际接线一致；不宣称 Todo 等业务插件已迁移。更新创作台挂载章节时，离线 replay 与隔离 smoke 通过；共享装配整体构建、门禁和协调全量回归提供工程证据，真实 Home 维护另列具体条数与授权。 |

2026-10-12 接续状态：独立分支 `feature/plugin-home-runtime-services` 已保存组合候选 `1e1e58c88a0e4244c1a23aa1dbcd733ed9ed5f5d`，工作树干净；相对冻结 I5 `8bac4a4ea` 的独有范围48文件+1009/-160，含F服务、真实身份与scope、完整v2拒绝及G文档。最新锁内build06、API/动作/资源实际检查、boundary、noEmit及影响三文件15/15通过；安全组31文件192条为191通过、1原有可选外网跳过、0失败/取消。候选包含I5祖先，实际merge-base为56033f06，并未对齐新main0568cd68，不把它判作独立PR READY；依赖合入后只提取Home独有提交，再按最新main测量与验证，协调整合全量另记。公共app-host的项目字段nullable已明确同步；SDK/Manifest/动作shape及Home资源无新增。所改Skill章节不在Builder CHAPTERS，不触发或宣称studio replay；安装与Skill规范检查纳入最终整合。

该固定稿的独立复查与主协调核对发现一项测试缺陷：两条 stop/close 用例在动作外调 model.complete，现行模型合同先答 plugin.model_action_required，不能证明实例失效。独立 test-only `4fd2fa407` 改为在真实 barrier 前后验证旧 model.availability 从非 provider_stopped 变为精确的拒绝，真实动作内取消/停用/撤权/断开后无交付及无写入断言保留；生产拒绝顺序不变。当前 source-only `df54a4956` 并已同步 S-15/S-18 与两份新增安全测试的实际 CI 清单；无确认的运行时P1，首轮候选构建类型失败，完整工程检查尚未通过。主协调核对当前 Builder CHAPTERS 不挂本片改的 host.md、authoring.md 或 Prologue Skill；没有运行或宣称 replay。真实 Home 的 plugin-runtime.db 及其 WAL/SHM 当前不存在，4173/4207/4208 无监听；只查存在性和监听，没有打开库、读取密钥或维护写入，后续若出现旧库重新核对。

Home首轮候选构建停在TS2322：可信caller的真实null项目与旧HostPluginCaller的string声明冲突，后续门禁/用例未运行。按已接受F-02的Home身份与真实scope补接（日常实现取舍）：只将既有项目字段定型为string|null，Agent项目入口先拒null并窄化，Memory继续收到真实插件身份；不丢caller、不伪造项目、不新开SDK端口或权限。该公共类型变化与消费者/快照/实际拒绝同片实现，完成后重新整体构建；当前未宣称通过。

Home补接当前源码b2ba56740：d867的真实null身份、bab7的先拒null再窄化已由独立只读及root核对，无当前必须修复的Blocker/P1；4ac只把原PluginExecutor.capturePrivateData返回标为已有合同unknown，运行行为不变。b2ba在既有storage/sqlite-baseline里增加describeSqliteBaseline，内存连接只由storage创建并finally关闭，Home仍用同一owner的完整DDL与describeSqliteSchema比较、保持先拒绝再构造顺序；不放宽boundary，不加SDK端口/迁移。候选包含I5祖先，实际merge-base为56033f06，尚未归回当前main的独有片，不把整个祖先diff称Home单片。

Home build05与实测门禁/类型已通过，首批core48条为45通过/3失败、无跳过/取消；模型、KV/独立坏v1/v2、真实Home null消费与Agent拒绝、Issue HTTP/MCP、原授权路径已通过。两项测试装配缺口修为实际Issue.read权限与编辑器接受的场景result_schema，保留无权限拒绝/available正例；平台文件重跑7条6通过/1失败。剩余是裸global未注册plugin的旧目录400（精确原消息「请先选择一个 Molis Work 项目」），不是Home路由失败。root按F-07保留该无关目录行为；已声明Home卸载后404继续用真实安装/卸载补证，不造另一份名单或重装来变绿。当前不称候选回归全过或独立PR READY。

Home最后补证：be531e00f在真实installation查询后、retry/control成功前拒绝已声明而无安装的Home路由；经无项目与实际项目前缀均返回404/actions.missing，旧storage/actions精确拒actions.forbidden，runtime.list的全部grants/generation/state/安装事实不变。独立固定源码窄复核及root实际diff核对无Blocker/P1；原global未知400、项目未知404和已注册Home未声明404同时保留。build06后的三文件15/15包括两个fixture、F1共用SDK识别、Home >1MiB成功/>12MiB413、卸载及原Issue真实HTTP/MCP，0跳过/取消。八文件首轮68条的67通过/1条静态SDK误判已保留，失效项单独修复并复跑，不冒称第一次整组全绿。最终安全31文件192/191/1/0（总数/通过/跳过/失败）实际退出0，未验证真实外网。巨单元ProjectHost309→308、WebRequest424→423、Agent393→392，Home状态分支2→0；资产29项/11,366,488字节与I5相同，API仅app-host nullable为Home独有变化。

### 10.3 浏览器请求剩余片的接续验收（W3-10）

沿用现有 UiRequest 与 owner 错误，不改变业务动作、公开合同或插件客户端；插件页面的请求和浏览器英文留到 W5-04。1b 在 I5 先收口，之后按 2 → 3a → 3b → 4 → 5 串行修改共享初始化；4 依赖 W3-02-G3 的最终错误详情。每片整体构建、相关真实入口回归、资源预算与健康门禁，整合后全量；新增或改写的测试以如下编号或注释对应验收。

| 编号 | 可观察的验收 |
| --- | --- |
| W3-10-2-01 | 引导/选择、Functions、连接与 Home 设置经同一助手；空项目、授权过期、已授权后刷新失败仍正确，未保存输入保留，取消不写晚到页面，不自动重发。 |
| W3-10-3A-01 | Feed/Inbox/规则与 Home 的全部 api 工厂同片迁完；只有既有 409 且 state=failed 接纳为消息收据，引用 HTML 与 Board 读取回退不变；切项目后迟到响应不改新 DOM。 |
| W3-10-3B-01 | 插件按需加载、事件恢复、成果 HTML、Coding/Files/Git 和 Review 经助手；五参数 adapter 保留，成果 404 仍可渲染，读取取消与审批写入的原生命周期语义分别生效。 |
| W3-10-4-01 | 两处助理、Placement、Context 与搜索经助手；按 G3 现行详情恢复 work/action，同 request_id 恢复断线发送，原文与草稿不丢、JSON 不双重编码、迟到读取不改 DOM。 |
| W3-10-UI-01 | 上述 Host 请求失败保留实际 code/status/callId/body；服务端可查编号可以复制并查到记录，未留行不造编号，AbortError 不显示；390px 浅深色、桌面按钮及 #420 快捷键/忙态/焦点行为保留。 |
| W3-10-5-01 | 实际执行的浏览器程序 AST 拦裸/成员/计算属性/别名 fetch 增长，新文件从零；评论、普通字符串与 HTML 文本不误计。Workbench 剩余 raw fetch 归零，插件存量冻结，只有精确底层实现例外；修改 baseline 不能放大 merge-base 数字。 |

W3-10-5 复用现有 SOURCE_COUNT_RULES 与逐文件 merge-base 比较，不另建计数系统。程序按实际装配顺序展开字符串、拼接与静态 join，再解析 AST；HTML 只取执行脚本，function.toString 按函数 AST 取体，不执行仓库源码。被浏览器入口引用的 TypeScript（包括 Work 插件 terminal-client）也计入，服务器 fetch 不计；插件现存请求仍按 W5-04 的范围冻结。计数归属原文件，同一片段被多次装配不重复计；UiRequest 底层传输及 lifecycle.fetch 的例外精确到函数或分支，邻接的新 fetch 仍被拦。不能静态展开或解析的已识别程序报位置，不能当零；动态属性构造、反射和任意运行期程序生成不是此静态规则的已验证能力。

门禁回归以真实 Git 临时树和 CLI 制造旧文件增长、新文件 fetch、计算属性与局部别名、跨片段程序、相邻例外和 typed 浏览器入口；普通字符串/注释/HTML 文本应通过。Workbench 非零即拒绝（包括与 base 相等及 --update），插件按文件只降；修改已提交 baseline 不能放大 --base 比较，拒绝增长时 --update 不写入。源码已实现于`5577c3c65`及复核补修`e9bcecea7`，实际小仓CLI与源码扫描证据见本节末的接续记录；整合后的完整门禁、构建、产品回归与合入仍待，不关闭验收。

### 10.4 共同错误出口的接续验收（W3-02-G1/G3）

固定 I5 8bac4a4ea 的只读核对已确认实际调用链；按 G1 → G3 → W3-10-4 推进。G1 范围为既定平台 HTTP/网关、客户端、availability 与同义码；G3 包括 Assistant service/store/http 与 memory tools、Memory owner/Host、AgentDefinitions、dispatcher、island 和对应测试，不能只删 Service 的三段转换。此处不提前改写存量错误码或运行时读取历史形状。

| 编号 | 可观察结果与证明路径 |
| --- | --- |
| W3-02-G1-01 | 真实网关与删除调用按 kind 返回状态，客户端经 actionErrorFromResponse 保留 code/message/kind/details。匹配调用编号后标记真实记录的顺序不变；未留行不造编号，传输结果未知不自动重发。授权、取消与专用读体限额保留，拒绝无业务写入。 |
| W3-02-G1-02 | ActionAvailability 的可选 kind 在 Kernel 两处与 SDK 路由两处抛错贯通；Pages/PPT/Dataset/Form 的现有 owner unavailable 带 conflict，恢复409。无 kind 的其余项仍按现行共同规则处理，API快照与真实动作/HTTP证明同片更新。 |
| W3-02-G1-03 | HomeDock、search、placement、contextual 的失败统一经共同出口；Todo不存在回404/todo.not_found，Search坏hit/cursor及缺项目分别为400/actions.input_invalid和actions.project_required、scope拒绝403；Search的missing/unavailable业务结果仍为200。Placement现行same_location按invalid回400，其余码不猜义新增kind。Contextual原码保留，input_invalid为invalid，stale/unavailable/not_offered为conflict，原400/409不变。真实HTTP断言literal状态/code/details与事实未写。 |
| W3-02-G1-04 | 四入口共用readLocalWebBody保留256000个UTF-8字节上限、早停及空正文行为；超限与坏JSON按actions.input_too_large/too_large及actions.input_invalid/invalid，分别413/400，原消息保留。不换成按字符计数的Native reader；真实超限、中文正文和坏JSON在业务前拒绝，不造调用编号或事实。Home的12MiB消费者先用严格instanceof ActionError保留新reader的kind，再处理原未编码拒绝；组合仍证明>1MiB成功/>12MiB413、不写事实，不扩大上传限额。 |
| W3-02-G1-05 | 平台同义码not_found→missing、invalid_input→input_invalid、permission_denied→forbidden，改全体生产消费者及三处测试假码后删合同表not_found/invalid_input/failed/transport_failed四行及过渡测试例外；共同客户端替代最后fallback后孤立的transport_denied亦删除；不留读取兼容。真实原缺失与输入拒绝的404/400及文案保留，Memory这片只改读码，mapper删除归G3。API快照同片更新。 |
| W3-02-G3-01 | 主人声明 kind，删除最后三处 HTTP mapper 及选项、全部 Memory→Assistant 码重写（含 memory tools 回调）；未知内部异常经共同出口回答500，保留 owner拒绝的消息/详情。Host不另起一套码或同义状态表。 |
| W3-02-G3-02 | Memory的权限、对象不存在、待处理建议上限与预览后变动分别按 forbidden/not_found/conflict 分类；invalid/off保持invalid。真实Memory HTTP验证scope403与preview交错409，Assistant HTTP验证其可达的404/invalid及原owner码无重写，真实memoryTools证明forbidden/limit的owner码、kind与事实未写；保留候选的拒绝/去重、本人接受及可撤销停用行为。Assistant管理入口只有person=true的change/prefs/candidate，不新增propose/clear路由或假造owner拒绝凑两个HTTP入口的矩阵；400→403/409是已记录的分类修正。 |
| W3-02-G3-03 | 真实助理失败仍持久化原文草稿并返回同一 publicWork，work/action放在details，island同片读failure.code与failure.data=details；保留修复按钮、原request_id与恢复流程，不读取旧顶层work/action。浏览器证明失败后草稿、同一work及修复按钮实际可用。 |
| W3-02-G3-04 | 应用重启后失效的图片句柄经真实读取入口回答404 / assistant.expired（原410），kind=not_found；保留重新添加文案及业务资料记录，不伪造调用编号。 |

API与相关契约快照同步，整体构建、定向真实入口及浏览器回归完成后进入下一次协调整合全量；巨大单元和页面资源只降。2026-10-12 G1已完成原网关/删除/availability子块与剩余四HTTP/同义码，共同source-only固定8d37f4de；对Home1e1+I5三测试修复的合成依赖276d2b8f比较为50文件+454/-127，不能把Home/I5祖先计成本片。固定稿独立窄复核与root实际diff核对无Blocker/P1；首轮整体build、两份API刷新、actions/资源实际检查、boundary/noEmit/actual-base健康均通过。实际merge-base56033f06仍早于当前main0568。21文件196条首轮192通过/4失败、无跳过/取消；035412731仅删已孤立的transport_denied表行并修三处消费者/夹具：Inbox实际content.read需feed:read、HomeTalk先经真实Settings安装Sessions、S07现行missing404替旧403。真实编号、无行/UUID/headers、业务不写约束保留；全量冻结祖先的三条test-only修复已机械保留。修后第二次整体build/API/动作/资源/actual-base健康/boundary/noEmit均通过，四失败文件24/24；其余17文件172/172有效证据保留，不能把192+24算成216个独立用例，也不称第一次整组全绿。最终clean候选2031daa794ef1decd3bea07d3952ae855e4d104d，独有54文件+460/-147，error classes/shape/status/owner为84/424/107/1013。完整196个独立相关用例已有通过证据；独立main归回与协调I6全量仍待完成。G3已提交完整source-only 682d15192967e041f59ac40660df25fcc8fae840，clean，基点0a1d88，独有31文件+543/-348（16生产/11测试/4文档）。root已核关键生产与新增公开Memory/图片重启/Chrome修复路径diff，固定源码窄复核正在进行；尚未install/build/API/门禁/类型/回归，不记READY。新增五条用例待实跑：真实scope/preview拒绝、坏SQLite共同500且原库不变、真实Prologue memoryTools权限/上限无写、同Home Host关闭重开图片404无伪号、Chrome观察原失败答复后点修复再继续同work。

G3固定I5源码复核的必要接线同属以上合同：Memory Host的asActionError重新构造会丢owner kind/details，需与mapper一起撤除，直接memory.forbidden也走同一owner声明；不能只改HTTP catch。AgentDefinitionsError范围外唯一生产消费者plugin-model-service的instanceof分支同步改用共同拒绝，保留plugin.model_instruction_refused及原指令边界。Assistant related坏输入使用现有assistant.invalid共同错误体，保留400。完整允许路径包括这三个消费者与现有公开HTTP/模型/浏览器验证，不新增错误别名、读取兼容或业务语义；G3固定源码已包含这些接线。test-only b77f2333补公开send故障/owner详情与假work盖章/同request恢复后窄核无P1；首次build因Memory edge残留导入失败，cf0a67仅删未用导入。第二build通过后资产比自身0a增29B、health挡两处巨大文件各+1；39acb9987改同义Error装配/唯一Memory root出口，第三整体build通过，自身资产反降13B（29项11,366,475）。health下一次还发现5处退役class文档引用，b6566e73仅改正确owner factory出处；最终API0变/动作不变、actual-base0568健康/boundary/noEmit均通过。两新普通文件5/5（6.49秒）、其余24文件198/198（71.99秒），均0跳过/取消；root已核真实footer与资源实测。随后三锁内浏览器文件6/6、0跳过/取消（49.08秒）；修复按钮继续同work、page written_by拒绝、第一次模型设置与Pane路径均实际通过。两短普通已以3e7c418ee登记Product子集，仍仅5browser smoke，登记后health04再通过，未重复5/198/6有效证据。最终clean READY0dcffb18119cce5df32ce3ca3a05584ba87fc10f，对0a独有34文件+603/-368；157giants/855内部引用/164混源/193casts，errors80/424/93/1013。完整209个独立相关用例通过，Linux及协调I6全量仍待完成，不把定向验收当全量/用户验收。

**main e7a51ff0后的两片复验。** CLI独有24文件+662/-139，当前head2fc3cbe5545c08370e5c8a208f94375ad29544ff；Agent/函数c3当前head d9a1b30544157b7b6ce282f0c9caa3a864f69e4d。分别再锁内offline/whole build/API0变/actions无变/29资源不变/actual-base健康/boundary/noEmit全部通过；CLI6文件41/41，c3七普通文件60/60、0跳过/取消，包含原作用域及Model14/MCP16组合。原浏览器证据保留而不重复计数；两份Git源祖先已在I5组合中验证，无新增页面变化。严格扫描并核远端后发布，等当前head合并门槛与必要产品结果。CLI探针前两次误把逗号清单当regex，均exit2且未运行，保留日志；读当前脚本改用精确regex后6普通/0浏览器，再以原runner实际通过。

### 10.5 Goals 管理入口的接续验收（W3-07-PR-4/5）

固定 I5 8bac4a4ea 已核：P-MCP的解析在mcp-v1-tool，CLI已删自己的树命令桥并使用管理工厂；剩管理MCP仍消费 initialize/event-decide/tree-decide 三个 typed入口。按PR-4 → PR-5 → 后续PR-6/8推进，PR-4先于错误码R3，不夹带常驻转发（PR-7）或owner改名。保留生产管理工厂使用的tree/event authority与management-evidence；managementIdentity仍供进展记录使用、requireRuntimeProject仍供插件开发使用，Coding四个合同入口留到PR-8。

| 编号 | 可观察结果与证明路径 |
| --- | --- |
| W3-07-4-01 | 三个管理MCP工具经现有bindGoalsManagementActions和同一ActionClient执行；到达真实Goals动作时恰有一条动作记录、没有typed行，保留伪造_meta编号拒绝与Host可信编号。既有factory的身份检查、event字段检查在invoke前拒绝，可零动作行/无编号，不人为补记录。不扩大LocalMcpServer。 |
| W3-07-4-02 | 工具名/schema/字段挑选与JSON输出保持；database参数优先于环境、无默认路径。initialize忽略额外身份；event-decide拒未知字段/authority；tree-decide保留顶层及authority身份拒绝、prompted_proposal_id与出处默认。拒绝不写业务事实；CLI提交→Host重启→MCP决定/幂等回放保持。 |
| W3-07-5-01 | 在删前固定当前十个Goals自有typed协议ID与版本，删后三个capability文件、两份合同中的对应类型/描述符、两处出口及十个注册；公开Host/SDK availability和invoke逐项答actions.dependency_missing，伪造描述符不能恢复入口。权限/提供方的有效用例改走真实动作，不靠删断言过关。 |
| W3-07-5-02 | InitializeBoardOutput回到board-actions；两个management authority移到小的Goals owner文件，现有evidence保留且真实管理调用通过。checkNoGoalTypedAdapters做带mutation的绝对拒绝；相关API快照更新，巨大单元、typed计数与基线只降，动作schema和资源无意图变化。 |
| W3-02-H-01 | PR4→PR5后删除MolisWorkV1Error、platform/errors子路径/快照及全部生产/测试消费者，改同一ActionError和SDK错误体；details显式保留，无旧别名/兼容读。两个MCP renderer共用JSON {error,code,details?,call_id?}，保留isError/content和成功工具schema/structuredContent；details中的code/call_id排除，真实code与Host实际已留行的号最后写，输入/_meta不造号。公开影响在API/MCP文档明示。 |
| W3-02-H-02 | Goals HTTP所有已知输入/owner拒绝经共同SDK，保留原400/404/409、消息/详情及无事实写入；未知内部异常500/actions.execution_failed。现owner对实际配置/协议/闭环版本冲突声明conflict，保留旧409，不将transport regex搬家或提前改名。八个用户输入裸Error先补既有invalid分类，不能换catch后误回500；可选guidance读取降级与成功/正常missing业务结果保持。真实missingGoal页面证明web-panel旧V1→404分支删除后的状态。 |
| W3-02-H-03 | 三管理工具、普通动作及原V1/连接拒绝走真实MCP/HTTP证明：保留fields/current_version/recovery、真实编号可查，未留行无号；真实stale409/输入400/未知500及原method和读体限额。CLI提交后真正关闭/重启同一隔离Host，再由管理MCP决定及幂等回放，无重复决定。测试预期用literal，不复制私有factory或增加内部导入。 |

允许修改实际tool-dispatch、goal-event-commands、mcp-v1-tool与MCP类型出口，PR-5对应桥/合同/注册与owner小文件、门禁、测试及必要文档。旧“迁Casebook observer”不再适用；每片依现有management-door-identity、mcp-goal-events-state、proposal-entry-chain的真实入口验证，整合全量由协调运行。当前为已核对的执行边界，尚未实现或验证。

### 10.6 跨入口与 AI 版本前提的接续验收（W3-09）

固定 I5 8bac4a4ea 的只读核对确认 §1 的 10-10/10-11 决定完整，不重问。按 1a（页面/MCP/typed）→1b（真实助理 gateway 与批准）→1c（等 G1/H 的状态与诊断出口）→2→3 串行；使用已有公开 Test Home、真实 HTTP 项目/授权和 MCP/Assistant/AgentHost 接口，不复制内部导入；实际SDK仅用受控模型响应，精确匹配模型URL的fetch桩转发所有其他URL，真实HTTP、gateway与owner不被替换。状态与 code 用合同中的 literal 断言，不能用生产 actionHttpStatus 计算期望。

| 编号 | 可观察结果与证明路径 |
| --- | --- |
| W3-09-1-01 | 同一普通插件命令和拒绝经页面 HTTP、实际 MCP 工具、助理真实 gateway 与 typed 路径保持 owner 事实、错误和平台记录一致；调用身份及各入口自有工作记录按既有职责分别保留。每次留行才发可信编号，嵌套沿用它，可在诊断页查到；T6 明确为 403/actions.plugin_disabled。 |
| W3-09-2-01 | MCP 已精确授权而暂不可用的动作进入两层调用目录的 entries，tools/list 继续隐藏；按名调用由 Host 决定，恰有一条带可信编号的拒绝记录。未知、未授权、同名其他 provider/version 及管理入口的限制保留；助理确认前仍零 review、零调用行，但 availability 和 check 异常两处都保留同原因与 code。 |
| W3-09-3-01 | 顶层 Agent/助理/MCP 的 command 必带 schema 声明的 expected_version、expected_revision、expected_revisions、expected_updated_at 或 Functions authoring 的 updated_at；表必须覆盖全部 ids。缺前提/空表/部分表/Functions updated_at:null 均为 400/actions.version_required，无事实写入。查询、无版本字段的独立创建、本人页面、非 AI workflow 及可信插件自调保留现行行为。 |
| W3-09-3-02 | 只校验一次 schema。仅当全部结构化 Ajv errors 都是根对象缺版本字段的 required，才统一为 version_required；map:null、错类型、其他业务 required/enum/额外字段仍为 400/actions.input_invalid。允许现行 schema 的 expected_revision:null 代表真实 create-if-absent CAS；正确版本成功、陈旧版本仍由 owner 拒绝。 |
| W3-09-3-03 | 嵌套豁免只由 Kernel 的实际活跃 handler 关系产生，只免额外版本规则；原权限、Session、signal、beforeEffect、提供方与安装检查全部生效。作用域跟 dispatcher 的 executing 同时结束，超时或取消后不因旧 promise 尚未返回继续有效；handler 内新建的顶层 Agent client 仍须版本，ALS 继承或伪造 input/_meta/header 标志不能获得豁免。 |

实际 owner 证据：Todo batch 的缺表/缺键允许无调用者版本写；灵光 discard 的表也只校验已给的键；Functions 的 update/preview/publish/delete/sample 操作用省略或 null 的 updated_at 时采用 owner 刚读的值，仍缺 AI 原先读到的前提，preview 会保存 last_preview，是 command。configure 的 expected_revision:null 则真正做空绑定 CAS。PR3 只在 Kernel 共用输入校验/版本/handler 作用域、助理共用 preflight、gateway code 展示和 actions.version_required:invalid 中收口，不改 owner schema/CAS、不增加公开 nested 字段或宽例外；冻结类内替换调用，不加方法。相关 API、文档与真实拒绝测试同片完成；当前仅核对与实施边界，未实现或运行验证。

### 10.7 管理入口余项的接续验收（W3-07-PR-6/7/8/9）

沿用§1的10-10决定及现行batchB-plan；PR-5删除最后的Goals管理桥后做6，7复用已存在的resident-host-request及G1/H共同错误出口，8拆为provider接线与Coding消费者两片。现行事实已核：runLocalPluginDevelopment只有一个typed消费者，Host已有withProject；pluginHostActions的dependencyCaller仍固定HOST_PROVIDER_ID，不能直接把Coding改成Goals动作后结束。原设计提到的Casebook已删除，不复建。

| 编号 | 可观察结果与证明路径 |
| --- | --- |
| W3-07-6-01 | 私有开发Host复用withProject、同一runPluginDevelopment及原状态目录marker/非空目录拒绝；项目取已打开reference，操作者仍PLUGIN_DEVELOPMENT_ACTOR_ID，输入actor_id/actor_kind/audit_actor_id及不匹配项目在运行前拒绝。create/close只由本次私有Host负责，原真实插件安装、运行、成果与渲染证明保留。 |
| W3-07-6-02 | 删除pluginDevelopmentCapability及其注册、HostCapabilityDescriptor.host_only、Kernel复制与LocalHost的typed专用拒绝分支；Input/Result实际类型及pluginCapabilityCallers仍留。旧literal ID的公开availability/invoke均为actions.dependency_missing，伪造描述符或声明consumes不恢复入口；相关安全断言改证真正不存在及原剩余能力权限，API/文档/计数同片同步。 |
| W3-07-7-01 | CLI与management MCP只对当前Home目录登记的同一项目数据库借常驻Host；只读目录匹配，非目录数据库与Host未连接保留原进程内路径。Host明确拒绝、取消或已送出后结果未知均停止，不回退或重发。复用postToResidentHost的数字回环、Home令牌、Origin、一次性键、禁止redirect及发送前序列化；Runtime MCP继续原动作网关。 |
| W3-07-7-02 | 新management-action端点挂在现行保护后，closed正文/有效调用号/项目及数据库均核对owner目录，仅受理原CLI/MCP管理动作集合与确切版本，真实身份由bindGoalsManagementActions构造。真实HTTP的无Origin、外来Origin、错误token、缺键、复用键及不匹配数据库拒绝且业务事实不变；请求断开不再提交。S-03/S-07与现有安全测试同片更新，不新增公开SDK端口或第二套目录。 |
| W3-07-7-03 | 真实CLI与管理MCP各在常驻Host中留下同一操作号的一条动作记录、无typed或第二个项目执行Host；成功stdout/工具JSON不变，失败保留code/message/details及可查的实际已记录号。未留行与伪造_meta/输入不造号；Host停用后的进程内路径、在线拒绝后零回退、送出后断连结果未知均有真实证明。 |
| W3-07-8-01 | dependencyCaller从真实目录解析唯一提供方，可信身份取实际内置definition的现行WeakSet登记，不凭plugin_id、publisher字符串或HostPluginCaller的结构形状判断。缺失、歧义或伪造提供方不放行；Runtime的真实内置提供方也有install_id，不能据此一律当外部。移除固定HOST_PROVIDER_ID，actor_kind与真实Host插件/安装/项目身份同传；Coding依赖调用显式保留原user身份。可信caller只在真实内置session装配时登记；真实Host重启由当前bundled工厂的新definition装配并登记新caller，旧caller继续拒绝，安装与业务事实保留；bundled始终跟随Host当前构建，不恢复存储的旧发行物，不按同plugin_id或任意upgrade参数补资格；revoke/stop/close先撤资格，assertActive及原声明/权限/世代/取消/beforeEffect仍生效，复制/JSON不继承身份。provider解析独立小文件，Executor巨单元不增长。 |
| W3-07-8-02 | Coding的四个Goals桥改用goals.list、goals.contract.read、goals.state.read、goals.progress.record、goals.progress.receipt五个现行动作；完整ActionDefinition及schema只有一份owner合同，contracts供Goals与Coding共用，插件不import Goals实现、不复制schema或靠强转满足BoundActionClient。仅contract/state/progress/receipt四项新增plugin audience及可信host_plugin拒绝；原list与events.note的plugin边界保留，不能顺带撤销。沙箱broker现行runtime身份无host_plugin，生成插件实际调用四项须拒绝，不修改broker帮其取得身份；伪造输入无效。真实Coding取得相同GoalContextSnapshot与user进展结果，Goals移除仍明确不可用。删除四桥、对应类型/注册/出口并验证旧literal协议不能恢复；四动作/API快照、Skill及调用方影响同片记录。 |
| W3-07-9-01 | 基于实际完整Host测量剩余typed家族与生产调用者，tests/typed-registry-inventory及mutation拒绝Goals/开发入口回流；CALL-CHAINS、GLOSSARY、SDK/Host/Goals/CLI/MCP README与Skill均只描述现行唯一业务路径。不存在的Casebook及已删host_only不留为当前清单；计数实测降低，不用改基线放过新增。 |

已实际复核snapshotCaller、bindCall和bindActionClient现行浅拷贝会保留host_plugin原对象，故过程内对象登记可守住这条信任边界。PR-8首片`eaeb5e86d`已加入实际内置definition登记、session撤回和按目录解析依赖提供方；协调方已核源码与真实Runtime回归的拒绝断言，尚未运行。后续追实际恢复调用链纠正此前方案：`install-rules.ts`的directlyUsable在bundled时恒为true，Supervisor直接采用当前definition，不会到达releaseArtifact.restore；既有发行物回归也明确断言内置插件不恢复旧发行物。首片因此误加的bundled restore包装应删除，验收改为真实停止、撤权和Host重启后的旧caller拒绝与新caller可用；不为测试改变既有随构建运行的语义。不能凭非空host_plugin授权。Kernel原register已按同ID/version和重叠项目拒绝重复来源（kernel.capability_duplicate）；真实同scope歧义无法先注册进目录，回归证明该真实注册拒绝及跨项目隔离，resolver保留唯一候选核对，不新增假目录/testing hook凑覆盖。

本节是已核对的实施边界。PR-6候选已以`0df38883c`、`d55c0e9ba`、`840a6902c`纳入I7：开发入口改为Host函数，保留输入快照、真实项目核对、固定操作者、原运行owner与私有状态目录；旧开发注册、host_only字段与错误分类删除，真实Host/Runtime旧协议拒绝、身份及目录回归源码已核。PR-7候选`52085f0bc`已纳入I7；协调方已核只读目录匹配、同库别名统一为owner路径、现有受保护HTTP入口、可信管理调用者、同一调用号与取消传递，以及真实CLI/MCP和拒绝/断连回归源码。复核发现把management全部动作绕开常驻网关会改变既有已授权action工具的执行owner；`31013e08e`已恢复普通action工具原网关与授权，只在网关发现失败时保留平台工具可用。新增真实授权、常驻写入与调用号、撤权后零新增事实和零本地项目执行回归，源码已核；S-03/S-07文档映射实际检查为空，不代替安全用例运行。上述候选尚无整合构建和用例通过证据，不记验收完成。PR-8第二片正在将完整Goals动作合同与原schema移到contracts，由Goals和Coding共用；协调方已核schema声明保真与静态纯度，四个原Host专用动作新增可信调用者拒绝，原list/note边界保留。Coding生产接线已保留分页100、原请求的取消/撤权/提交前检查，四个旧桥及合同已删除，真实拒绝/恢复用例仍待完成。协调方发现进展确认复用模型材料函数而误触20,000字符上限，候选已拆分纯事实读取与模型材料准备。独立只读复核及协调方复核还确认Coding缺少Goals读写权限声明，真实bundled安装会在目录发现时拒绝五项动作；候选已在Manifest补齐goals:read/goals:write，未改Kernel、resolver或授予规则。其余真实对象身份、跨项目、撤资格与沙箱源核未见新的阻断；bundled恢复的不可达方案按上段收回，改验现行重启链，均尚无实际运行通过证据。PR-9尚待。单片整体构建、契约/API/健康/资源/安全及实际相关入口回归后再进入协调全量；7的安全边界与8的可信身份必须做只读窄复核，不把测试工具或假caller当生产证明。


### 10.8 MCP launcher 闭管道拒绝（CI 独立修复）

新一轮Linux CI的#457、仅test-only的#464及#468产品子集均360文件通过、同一runtime-integration整文件失败；两次尝试仅有file-level test failed报告，尚未取得其原始异常。当前main0568的Linux同文件实跑13/13、I5按同CI runner在本机13/13，故不把它定性为已确认CLI或Issue回归。只读核对发现现行validateMolisWorkMcpLauncher没处理child.stdin的error；经公开MCP包的真实子进程故障注入，两次在输入已关闭而id1回答到达后写tools/list稳定产生未处理EPIPE并退出。此缺陷已确认，但它是否解释原CI的全部失败仍待新CI与原始异常证明。

修复目标是维持原“验证失败→恢复配置及Skill”的行为，范围仅现行MCP launcher验证函数及其公开Runtime安装测试/必要README；单独从最新main提交，不夹带G1/G3，不改CI门槛、清单或超时。真实Home与凭据不访问。输入管道失败让现有finish(false)收口，settled后不再发送请求；不增加重试或进程管理设施。

| 编号 | 可观察结果与证明路径 |
| --- | --- |
| CI-MCP-PIPE-01 | 真实launcher关闭stdin后发送initialize结果，公开验证函数返回false且父进程存活，不产生未处理EPIPE；第一次write可以用于检测远端闭管道，验证失败/exit收口后的剩余stdout及同chunk消息不再触发后续写。监听保留至owned child关闭以吸收已排队错误，不靠Writable字段预测远端状态或另加测试hook。原initialize→tools/list成功、退出launcher和慢启动证明保留，10秒限制及仅关闭自己child不变。 |
| CI-MCP-PIPE-02 | 同一闭管道fixture通过公开RuntimeIntegrationService实际验证，失败后配置字节/无关Runtime设置、Skill状态和原receipt恢复，没有成功接入或新授权记录；再次可用launcher能正常接入。独立源码复核、整体build、定向Runtime/MCP公开回归及当前main门禁通过后开独立PR，Linux CI另记实际结果。 |

独立候选5f49307082a6448876adda410c29011f56875f6b已完成，3文件+106/-1，生产仅4行；固定源码窄复核及root实际diff无Blocker/P1。main0568上的整体build/API0变/动作无变/资源29项11,366,644字节不变/actual-base健康/boundary/noEmit全通过，9文件53/53、0跳过/取消。只临时撤自有忽略dist的两settled关口而保留error listener，真实trace按预期失败，实际收到initialize+tools/list；finally字节精确恢复后完整Runtime16/16、无跳过/取消，不能把53+16算69独立用例。Model #456合入679034ca后，root机械并到abcab187a73040696560526628701123a409fcc5，独有范围仍3文件+106/-1。第二次整体build/API0变/动作无变/29资源11,366,644字节不变、actual-base健康/boundary/noEmit均通过；Runtime与Model两个实际文件30/30、0跳过/取消。动作检查首次误用不存在的--check参数退出2，原日志保留，按脚本默认调用重新检查通过，未据此重建或放宽规则。推送前strict扫描106新增行干净并核对远端相同，独立[#470](https://github.com/molis-ai/molis-work/pull/470)已发布并附到本任务；随后Linux Product subset run38330375903在合并树e21add3519a2b669f6a5a7ac8df23c76a7cb9f44实跑361/361文件、0flaky/fail/timeout/skip/not-run，11.9分钟；原Runtime文件16/16、一次通过、0跳过/取消，21.3秒。已下载并核对实际report.json，含新增闭管道/回滚路径；Package/Verify随后已SUCCESS；Linux probe仍运行，只是报告作业，原CI异常的唯一归因仍未证明。


**#470合入。** 2026-10-12 18:37，abcab187a的五项必需检查全部SUCCESS（含Verify），Product实跑通过且同步main679；root重新fetch、扫描106新增行干净、核本地/远端相同后只向原daemon11526排一次。按已授权原merge-seq门槛合入e7a51ff0469f0e4835e814be6a5363564ea54209；Linux probe仍在收集报告，未称已通过。剩余I4/第五分支随后按此main真实同步、工程及必要产品结果串行推进，不重新启动驱动。

### 10.9 产品 HTTP 错误出口的接续验收（W3-02-G4）

#### BL-305 补修：Agent busy 经 Coding HTTP 保持 409（2026-10-25，FIX1）

基点 `4db89e26d6d5740e3002dfcfa868b40876385ded`；#1304 的[首评非阻塞第 1 项](https://github.com/molis-ai/molis-work/pull/1304#issuecomment-6401620828)及[统筹优先修复裁定](https://github.com/molis-ai/molis-work/pull/1304#issuecomment-6401645352)。共同 Coding HTTP 出口已按 kind 选状态，`agent.session_busy` 仍声明 invalid，导致 Agent 恢复/忙碌拒绝从原 409 变为 400。本补修只由错误主人把它归为 conflict，保留 code、消息及所有拒绝条件；不恢复 Coding 按 code 选 HTTP 的分支，不改其他错误或公开形状。

生产范围仅 `horizontal/agent-host/src/errors.ts` 的该声明；验证扩到已有 Agent 控制、Coding HTTP、助理停放回答/恢复用例及本段。`assistant-error.ts` 与 `assistant-parked-answer.ts` 的忙碌消费按 code，核它们的映射/有限重试不变。HTTP 正文继续使用现有 code/error，不新增 kind 字段：在实际 Agent 错误产出边界断言 kind，再验证同一错误经生产 Coding HTTP 路由得到 409。审批 stream、write-checkers、Memory、SDK 包/provenance、共享 BACKLOG、预算和 CI 均不在范围；不改原 PR/main，候选由唯一 carrier 采用。

- `BL305-BUSY-01`：现有 Prologue 控制的三种恢复/停放/历史暂不可读拒绝仍给出原 `agent.session_busy`、原本人消息和诊断码，kind 为 conflict。
- `BL305-BUSY-02`：经实际 HTTP server 与生产 Coding control 路由触发同一 Prologue adapter 的拒绝，断言 409、原 code/message 及上游实际 kind；无业务状态推进。不能仅断言错误常量或手写 HTTP 映射。
- `BL305-BUSY-03`：原 Coding 归档 409、未知对象 404、无权限 403，以及助理对同码忙碌的映射、读后单次重试/保留回答行为保持；原用例和源码审查按实际范围复用。

先经公共 build FIFO 做完整 `pnpm build`，再用官方 runner 单进程必要定向 `agent-control-errors`、`coding-product-http`、`interaction-parked-answer`、`coding-session-recovery`、`prologue-start-refusal`、`prologue-recovery`，并核必要边界/错误门禁、源码与构建指纹及推前 fresh-fetch secrets。按本题明确限定不重 full、浏览器整批或真实模型，不把替身 Runtime 的 HTTP 机制证据称为真实模型/最终产品验收；固定 diff/源与原件直交窄 REVIEW、必要 TEST，再由 FIX1 主核交 PIPE/统筹。

本轮验证：公共 FIFO 整体构建自然退出 0，源码与生成的构建指纹一致；六个定向文件全部通过（38/38），边界、对实际 merge-base 的 health、72 份公开 API 快照和 diff 检查通过，未改快照或门禁。新增 HTTP 场景通过真实插件 HTTP 适配器、Kernel 动作及 Coding control 路由进入现有 Prologue adapter；SDK 控制端是受控替身，没有调用真实模型。仅把独立树已构建错误产物的该 kind 暂改回 invalid，原 HTTP 用例即在原 code/message 的真实 400 上失败（预期 409）；产物随后逐字恢复，再跑上述六文件通过。首次 HTTP 夹具因缺少 owner 在输出合同处失败，已补齐真实会话/轮次 owner，原失败保留，未计作产品回归或通过。独立 REVIEW/必要 TEST 与 carrier 采用按固定候选回执另记。

固定I5的只读调用链核对已补足旧计划遗漏，按G1/G3、Home F/F1及Goals H的实际依赖接续；G4不改Coding尚在用的四个Goals桥（PR-8另片），不提前做owner改名或Session全迁移。目标为六组实际HTTP出口走共同SDK，先给现行明确用户/状态拒绝owner kind，再移除mapper，保留成功/部分成功与原业务事实。

| 编号 | 可观察结果与证明路径 |
| --- | --- |
| W3-02-G4-01 | Coding现行输入解析、执行前提、工作区拒绝仍400/invalid且句子不变；只分类真实已知用户拒绝，不把整段catch/外来IO包成invalid。真实CodingStore session_unknown与actual Agent busy owner分别not_found/conflict，保持现有404/409；未知500/actions.execution_failed。真产品HTTP拒绝后session/round/draft不变，重启草稿仍在；Coding巨单元不增长。 |
| W3-02-G4-02 | Browser原Error的已知失败保留409/conflict，原64MB上限亦保留409与句子，不额外改成413；明确HTTP缺项目/下载404与参数400仍在。JSON读体改共同400/413及reader原消息，原“开关”catch不再掩盖解析错误，限额不变。下载仍binary stream/附件/no-store/nosniff，chooser与真实页面capture的边界保留；必要surface-driver消费者同步，不扩Chrome/CDP传输。 |
| W3-02-G4-03 | Agent review/recovery已知状态与revision核对拒绝保留409，实际foreign/missing404、坏note400及receipt200/effect_settled语义保留；在真正prologue-git handler分类原裸状态拒绝，保留recovering finally、两次observe、先保存核对依据再reconcile，零重执行。按实际raiser区分输入与不存在，不仅凭review_unknown名字猜全局kind；共同出口覆盖读体并补literal状态/code/无effect。 |
| W3-02-G4-04 | MCP授权设置经共同SDK保留code/message/details/availability.kind；with先核全套授权再一次提交，拒绝不写任何grant、不调用业务handler。真实owner409及平台404/403/503按已接受kind，无kind的fixture仍400；失效provider可撤销、GET missing业务200、method405及精确project/provider/version合同不变。 |
| W3-02-G4-05 | Work各HTTP异常走共同SDK；scope/not_found/conflict由真实owner定型，public context中旧classifyError移除/改接同步唯一web-panel消费者。workspace.change_rolled_back/recovery_required（现为`work.workspace.*`，R4a3）owner为invalid，最终400（WSERR-03；原写unavailable/503已作废，2026-10-19对齐，QA-020）；Host project-workspace-actions原样透传、不重建kind；目录关系自动恢复（恢复也失败才是recovery_required），原cause对象保留且不可枚举（WSERR-02）。证明：`tests/workspace-directory.test.ts`的repair/unlink两处change_rolled_back（400、目录恢复、cause同一对象且不可枚举）；recovery_required与它同一声明，无单独用例；host.workspace_not_found仍404/原消息。Session发送sent201、failed409、其它202（含uncertain）、handoff未送达502/原error_message、picker取消200/busy409/unavailable503都是现行业务结果，保留，不能改为throw。SC-3（2026-10-23，PG-082）：目录的关联、修复、解除与选择窗口和终端面板的路由搬进 Host 后，拒绝一律按 kind 定状态（SDK `actionErrorResponse`，宿主 `respondLocalWebRefusal`），响应体多 `code`；`host.workspace_not_found` 的 kind 由 invalid 改 not_found（仍 404，动作调用方看到的 kind 随之改）；`actions.service_unavailable`、`actions.unredeemed` 仍 503；`actions.forbidden` 由 400 改 403；`work.session.*` 按声明的 kind（`message_target_changed`、`message_attempt_changed` 是 conflict，回 409，其余 invalid，回 400）；change_rolled_back/recovery_required 已随 SC-1 删除（修复与解除不再改挂会话）。证明：`tests/workspace-directory-picker.test.ts`、`tests/workspace-project-actions.test.ts`。 |
| W3-02-G4-06 | F1/Home的唯一shared operations及controls/hooks/readBody/取消/revision/卸载边界保留；仅真正抛出的失败经SDK，不改restart/upgrade409、not-running503等supervisor结果。Work未知异常按共同500/actions.execution_failed保留实际消息，原状态查询与草稿保留证明结果未知恢复，不加自动重发。实际HTTP、必要Browser/Work公开路径与安全拒绝证明完整后再协调整合，API/动作/资产均按实测记录。 |
| W3-02-G4-ANSWER-01 | 真实助理页面经Host与SDK原问卷拒绝未知选项，共同HTTP信封的details.errors仍映射到q0行内错误、焦点及保留选择；拒绝不完成原等待、不发第二次模型请求。本人修正后重交同一pending/run，成功继续原工作且不重复新建轮次。既有assistant-page-written浏览器用例追加真实Runtime拒绝/恢复，不用假拒绝或仅检查源码字符串。 |

本节的Browser64MB409、recovery原409与Work未知共同出口取舍保留现行业务并采用已接受的共同分类，不追加产品语义变化。允许路径按真实owner/消费者扩到Work workspace-actions与Host project-workspace-actions、Agent reviews/prologue-git及必要busy raiser；不增公开测试口、重复码表、兼容读或预算。当前只读计划核到必要调用链，尚未实施或运行；全部Session/Agent raiser与浏览器失败路径仍须在实际片中按影响面验证，不把部分源码阅读记成工程通过。


**Model #456合入与原进程。** 2026-10-12 17:55，固定远端d0e0c8c7464fc23c7a3fb61a9af4053e8414dea6的七项CI均SUCCESS（含Linux探针/Product/Verify）、与main0568同步；主协调在自己的Model树fast-forward该远端、再次strict密钥扫描及本地/远端SHA核对后，仅移除原done中的456重排原队列。原daemon11526合入679034ca46da3112b7d4f00f0d85e1c65ee220c7，没有新启驱动。剩余#457/#459及第五PR只按新main与实际CI结果串行推进，不用旧绿结果称新head通过。MCP独立已复现缺陷优先收口，不放宽产品子集或跳过Runtime文件。

**I6准备。** managed隔离树feature/anti-corruption-i6-1012已由G1最终2031建立；机械并当时main0568至0a1d88db194992518f941b6a50b222d83379b4cc，git tree差异为空。随后机械并入独立MCP候选abcab187a及其main679祖先至bb85902097e40e3d942a33a68a1b80506fc99930；两README仅原必跑清单顺序冲突，保留已包含全部main用例的Home/G1清单，实际新增仍只有MCP三文件。它已有已验Home/G1、I5三测试修复与MCP独立候选，仍等G3候选；未install/build或启动全量。当前未安装I6的import-plan首次因缺typescript退出，原日志保留；使用已安装且脚本与I6完全相同的progress树执行只读--root I6 --report --summary，测得855内部引用/317文件、164混源进程；预测259文件重写后减少355引用且混源为0、14动态入口须逐个核对。该结果只证明计划自检，未write/运行测试、不算W2-10完成；G3及后续源变动后须重新实测。最终组合完成后重新测量所有派生数据、整体build并冻结该树源码/脚本/包/Skill，协调全量与基线对照另记，准备不能算全量通过。


**第五批/测试片在MCP合入后的复验。** main e7a51ff0 上各树先整体offline/build与API/actions/资源/actual-base健康/boundary/noEmit通过，再只复验原作用域加Model14/MCP16：F65/65（head59da70c4e）、G2 71/71（901648f1e）、F1 40/40（ba2f657a3）、d52/52（ae00a07ce）、1b90/90（369baafd7）；均0skip/cancel并strict扫描/核远端后发布。F/F1/G2的README与CALL-CHAINS冲突逐项保留两边语义/必跑，生产无冲突。1b29资源11,366,488字节（比main减156），其余29项11,366,644不变；不重复原浏览器证据、不累加用例或称新全量。CLI2fc的Product新头已SUCCESS，原失败报告保留；其余合并门槛/实际报告仍等待。Issue纯测试片同步2051cde9e并whole build/all gates通过，Model/MCP30/30，原Chrome5/5证据保留，strict发布在核远端后才记完成。

**I6当前组合与冻结回归。** 在前述09e4ffa0（与main e7a ancestry同步且tree不变）上机械并G3 READY0dcffb181，携唯一当前spec至cb46007877741a8f35be832ac73830821f240628，clean且没有生产冲突。Root新整树offline/build/API/actions/资产/actual-base健康/boundary/noEmit均已通过：API刷新0写入/0删除，60份快照共2284声明；相对main有4份已说明的合同变化，动作558+2/25manifest及Host140+1不变；29资源11,366,475字节，workbench1,396,030。实际基点e7a的健康数字为157巨单元、855内部引用、164混源、193casts，错误80/424/93/1013，无放宽门禁。最后仅携5行进度至冻结head af0fe957f8fbeff94c92fa6b1a8f3899694d0660；2026-10-12 19:19:36（UTC 02:19:36）开始协调全量，日志位于临时证据目录的i6-full-01.log。该次持有整机构建锁及1个浏览器名额，源码、脚本、包、Skill、HEAD与构建产物均冻结；当前仍运行，未记录最终通过、失败或跳过数量。

唯一writer已从cb460固定base开独立PR4源码树，按PR4→5→H接续，仅改源码，不构建/改I6/碰真实Home。实际MCP旧client.withScope在tree载荷校验前已绑定项目；新的Host.withProject还会prepareInstalledPlugins，不能替代它。PR4只保留原client.withScope空回调预打开及精确AST约束，三个Goals管理业务全部经unprepared factory/action port，保留真实身份拒绝顺序与原IO边界，不新增插件预准备或业务行；工程与回归须等I6释放机器构建窗口。

### 10.10 调度前拒绝的共同结算（108新失败，已修）

现象：action-call-log 的早取消命令需要留下原操作编号的一行“未执行”，而 MolisWorkLocalHost 的项目插件准备、withPreparedActions 的Home准备、LocalHost 的caller/signal/runtime检查在ActionService结算之前就可能抛错；原取消/范围/关闭拒绝必须保留。新失败与源码已定位，完整108栈及基线仍待，不以定位替代修复验收。最小方案只把准备阶段的拒绝交给现有bindCall/refuseCall/settleCall及同一Host记录hook，成功转发保持原ActionService唯一结算；不启动本已取消调用的插件、不写业务事实、不在下游已结算后再记录一次，保原error、caller和call_id。Assistant在计算目录之前已取消或期间取消时也须保原not-run结果跟踪，不能只把异常预期放宽为AbortError。 冷invoke没有discover前置条件：已发现view只作诊断名、不作授权；没有缓存时共享核心提取registeredActionMetadata，由既有directory复用同一scope/audience过滤；Host的inspectActionMetadata只返回这些已登记声明，保scope/Host身份校验、不评估Host或provider可用性、不打开Runtime或准备插件，未登记reference不伪造view，metadata不可读时保原拒绝。此模式只给停止结果命名，常规目录与validate_authority始终带原signal，实际invoke的授权、授予与最终effect检查不变。

验收沿现有S-12/S-18与action-call-log/assistant-change-outcomes，不增重复测试系统：PREP-108-01验证项目/Home准备、直接LocalHost早取消与等待后取消各留一次可查诊断，只有身份/动作/结果/错误码、没有输入或正文、业务handler零执行；PREP-108-02验证scope/closed/准备失败原拒绝和原对象/编号保留；PREP-108-03验证成功及handler内失败仍由原链记录一次，正常重新授权/重试可执行；PREP-108-04验证助理not-run持久化及后续读取、撤权等待零effect且原unknown无重复副作用。必要编号补进实际现有测试名/注释。修后整体构建、root/工作区类型、health对merge-base、相关真实Host用例与原安全/权限用例；按最终影响面决定共同补验，未解决的新业务失败继续独立归因。无需真实Home写入或改变拒绝语义。


### 10.11 2026-10-14 独立复查（Claude 接手后）

按 10-14 目标的三条（是否符合 15 份要求文档、有没有把清理过的问题带回来、有没有无依据的行为变化），复查了 b66c423c7 以后合入 main 的 PR、在途的 I8（774acaf57..F109），以及 Prologue SDK 同期合入的 #18–#24。CI 通过、已合入和 PR 里的自查不算证明，每条都对着代码与用例看过。

| 编号 | 发现 | 判定 | 处理 |
| --- | --- | --- | --- |
| F-1 | #395 在资源门禁加 Issue 首次登记上限 24,000，批准没有带日期的记录 | 用户确认批准过 | 补记录，删已用完的例外（#501） |
| F-2 | Issue 是 Home 级内置插件，登记在 `builtin-plugins.ts`，与 AGENTS.md「只走 project-plugins.ts」不符 | 规则与实现冲突，用户定改文字 | #502 |
| F-3 | AI 入口清单少了情境起草（`draft-wiring.ts`）与 Issue 整理两处 | 都经 agent-host，边界没破，记录不全 | ai-entry-inventory 补 HJ-5 与 Issue 一行（#502） |
| F-4 | main 的 vendored SDK 没有模型切换接受时的授权复核 | 安全缺口（已有上游修复） | 决定 5：I8 第一片 |
| F-5 | 现用 SDK 包的系谱经过 08b84296，不在 Prologue main 上 | 与 D7 冲突 | 决定 6：过渡期例外 |
| F-6 | I8 的 W3-10 把 Feed/Inbox 列表刷新失败的「当前输入已保留」换成共同出口的话；Issue 的模型设置读不出时同样 | 在 W3-10 批准的方向内，但措辞上的损失没写明 | BL-134 |
| F-7 | Prologue #21、#22 合入前没跑最终头的 SDK 全量与干净包消费者 | PR 里写明，承诺合后补跑 | 已补跑：Prologue main `b01067b4`，SDK 全量 3912 条通过，2 条失败都在 `desktop-computer-use.live`（桌面被占）；干净包上的消费者脚本通过（记在 Prologue `docs/slices/taskboard-collaboration.md`，`0107d9b0`） |
| F-8 | I8：删一条已接受的记忆后，账本留下孤立的候选记录，之后每次读记忆都失败 | 产品缺陷（I8 去掉了 main 的兜底，按不留兼容是对的） | 在 F109（未进 main）e694bd761 里删记忆时连记录一起删，随 I8 落地。真实 Home 只读拷贝核对（用户 10-14 同意）：记忆账本 0 条候选记录，没有孤立记录，不需要维护 |
| F-9 | I8：Shelf 与 Characters 只读现行形状；shelf-settings 里两条旧默认值用例与之矛盾 | 符合「读取不兜底」 | 两条在 F109（未进 main）改成拒绝用例。真实 Home 只读拷贝用 F109 的读取代码打开：Shelf 目录（版本 1）与角色库（版本 1）都是现行形状，不需要维护 |
| F-10 | I8：Runtime 插件的 consumes 能调到别的插件的动作，没有决定，用例被留在失败 | 缺决定 | 决定 4 |
| F-11 | Goal 收尾被拒后，读回文档时未满足的原因列表消失，只剩提示 | 与 main 相同，不是回退 | 已修：读回后拒绝响应里的未满足原因留在收尾表单旁，直到改表单或再次提交；顶部仍是读回的权威状态 |
| F-12 | I8：用 POST 发的读请求（Files 打开）断网时被说成「不知道这次操作有没有完成」 | 共同请求出口的口径缺口 | BL-136 |
| F-13 | #503 的一次资源放宽被 #504 用完，按旧值 23,451 写的放宽留在门禁里，缩回去就重开 | 与 F-1 同类 | #505 删掉 |
| F-14 | #504 让页面加载时读回截图草稿也算作「写入未完成」，读失败也算「写入失败」：带 Issue 侧栏的页面刚打开就离开会弹「离开此网站？」，什么都没丢。main 上 project-arrival 1 条、project-settings-navigation 2 条因此失败（浏览器用例不在 CI 子集） | 产品缺陷（#504 引入） | [#507](https://github.com/molis-ai/molis-work/pull/507) 只让写入计数，三条恢复通过 |
| F-15 | I8 的 W2-18 让文档解析返回前释放源资源与派生资源；SDK 释放 8 MiB 资源约 0.8 秒，8 MiB 附件的解析从约 0.6 秒变成约 1.4 秒 | 释放是要求（不释放会撑满 128 MiB 总量）；代价来自 SDK | 用例时限按实测放宽到 120 秒（断言不变；在 F109 7882cf09c，未进 main，随 I8 落地）；SDK 释放的耗时留作上游性能项 BL-137 |
| F-16 | #481：宿主在一轮结束时没把结束状态传给电脑桌面，被停下或出错的一轮也被记成「失败：模型说完成了…」；没写核对行的目标，结论同样说模型说完成了（Grok 复查 r4，已核实） | 无依据的行为错误（ACL-09 规则本身成立） | [#510](https://github.com/molis-ai/molis-work/pull/510)：`release(ended)` 带结束状态；停下记停下、出错记失败、只有完成才按事实判；结论如实；两条用例在旧逻辑上失败 |
| F-17 | #471：电脑 socket 自带一份本机名单，没用 `contracts/platform/loopback`，S-04 也没覆盖它；校验失败静默关闭 | 违反 AGENTS.md「本机地址只有一份写法」与安全不变量登记 | #510：改用 `loopbackHost`，失败先报错再关；S-04 行与用例补上 `/computer` |
| F-18 | #471：电脑面板把宿主的中文原因、助手问题和一轮结论直接显示，并用「，」拼英文半句 | 英文界面缺口 | #510：固定句子经 `L()`，补英文，经可翻译模板拼接 |
| F-19 | 共享问卷卡在约 300px 宽时，状态签和收起按钮挤占标题行，标题四字一断（规格板 390px 视口所见） | 低；生产里卡片更宽，可能不出现 | BL-138：窄卡片时状态签换到标题下 |
| F-20 | 英文界面里插件栏与底栏的显示名、提示与无障碍名仍是中文的 8 个插件名（成果、插件创作工作台、图片、灵光、待办、角色、炼金术士、工作流程），并用全角「：」「（）」拼接英文（`immersive-shell.ts`，`capabilities.ts`、`call-row.ts` 同样） | 英文界面缺口（9 月起即有，不是本期回退）；英文名要定 | 用户 10-15 定了英文名（§1）；[#512](https://github.com/molis-ai/molis-work/pull/512) 改名称、拼接标点与列表分隔，中文界面不变 |
| F-21 | 侧栏宽度拖柄的无障碍名「调整侧栏宽度」没经 `L()` | 英文界面缺口（9 月起） | #512 |
| F-22 | 新项目自动建的摘要页标题与正文结构是中文（「· 工作摘要」「## 资料来源」「项目：」），英文用户也一样 | 生成内容用什么语言，需产品决定 | 用户 10-15 定：跟随创建时的界面语言（§1）；#512 |
| F-23 | 英文界面里欢迎页主按钮显示「Started」：「开始」在词典里有两种译法（状态「Started」、动作「Start」），合并后取了前者 | 英文界面缺口；同一中文两种语境，只能靠稳定键区分 | BL-139，随 W5-03 稳定键做；运行时的 `L` 目前还不认稳定键 |

界面复查（本人在隔离 Home 的真实页面与规格板 `/__ui/catalog` 上看，浅深色、390px）：#488 状态环在两种主题下文字对比 ≥ 4.5:1，减少动效时停止绘制，进行中的灰环在浅色下约 2.2–2.6:1，但每个环旁都有文字说明含义（设计如此，符合 1.4.11 的补充图形情形）；#492/#496 的共享问卷与 Coding 问题卡：助理问卷带「推荐」预填（设计如此），Coding 问题卡不预选（有用例）；390px 无横向滚动。Grok 并行复查（r1 r2 r4 r5，视觉与交互部分由我做）：r1 11 个 PR 无发现；r2 一条台账行过期（W2-11 台账第 4 行，已删并重排）；r4 三条见 F-16～F-18；r5 指出本节记录有两处不实，已改（状态句写反了合并方向；F-8、F-9、F-15 的修复在 F109、未进 main）。

其余：#489（Pages 评论侧栏与助理主区）新动作只给用户、等模型的动作并发声明并在写前复核、后台投递用可撤销授权；删掉的断言都是原样保留、等价改写，或换成按模块图判定浏览器专属代码（PR 写明）。#498（W4-06）只拆文件，没有删断言。#504 的 Issue 草稿截图存在浏览器 Cache Storage，属于本机草稿。I8 的门禁只收紧（`rawFetchInScripts` 是 W3-10-5 的批准项），资源预算 24 项下降、0 项上升，产品子集只增，断言数下降的 7 个文件都是退役的 Goals typed 桥（PR-5）和 `host_only`（PR-6），改由动作重新断言。

I8 修复树 F109 上另修的产品问题（都带用例）：卡片结果未知的判断在合并 7c7999489 里丢了（assistant-offers）；Coding 打开会话就提前启动运行时（只在有可恢复会话时启动）；工作流接续与停止投递同一毫秒的时间戳冲突（`nextUpdatedAt`）；Pages 新建与导入时空白页丢弃了两次；成果交给别的插件失败时直接显示内部原因（改成可读的话）；consumes 先查目录再查授权（改成先查授权）；导出的问卷页必填题只有 aria-required，原生下拉框在 Chrome 的可访问树里看不到必填（加原生 required 并 `novalidate`，提交校验与错误话不变）。其余是测试跟着已批准的变化改（共同请求出口的话、按 id 现读详情、MCP 新会话要用户确认、AI 改对象要带版本），每条在提交说明里写了依据，没有放宽断言。


### 10.12 2026-10-15 代码回溯审查的逐项状态

来源：`docs/reviews/anti-corruption-code-audit-2026-10-15.md`（对 main `24d04d98` 的回溯审查，C-01～C-06、A-01～A-06、B-01～B-12）与 `docs/reviews/anti-corruption-pr-audit-2026-10-14.md`。两份报告未入库，以本节为准。「main」指已合入的共同版本；F109 是本地修复树，不算完成。

| 编号 | 问题 | main 状态 | 处理 |
| --- | --- | --- | --- |
| C-01 | 共同副作用守卫在最后一次 Host 等待（`beforeEffect`）之后不再复查调用者授权 | 已修（#523，main `f74e29d86`） | `effectGuard` 在 Host 的 `beforeEffect` 之后同步调用 `assert_authority_current`（异步结果拒绝），MCP 入口的末端检查同步重读对外授权；`tests/mcp-effect-authority.test.ts`（真实 MCP，在 Host 最后一次可用性等待里撤权后拒绝）、`tests/action-authority-tail.test.ts` W3-09-AUTH-02 |
| C-02 | Pages 评论回复在停止后被异步返回写回「运行中」 | 已修（#523，main `f74e29d86`） | 读取返回后复查轮次、按 revision 提交；`tests/assistant-thread-reply.test.ts` PAS-10 S-18-102-03（发送后第二次读取时停止，晚到的写入被拒） |
| C-03 | 搜索等索引追上时撤权，这次查询仍返回旧授权内容 | #514 修 | 查询在追上索引之后重读调用者目录，再按那份目录过滤和报来源；`tests/system-search.test.ts`「a source revoked while the query waits for the index answers nothing from that query」（未修时返回 `a1`，已复现） |
| C-04 | 外部 MCP 改已有对象可以不带读取版本 | 已修（#523，main `f74e29d86`） | 动作服务按声明的版本字段对 `agent`、`mcp` 来源统一要求读取版本（W3-09-3），在任何处理器之前拒绝；`tests/action-version-precondition.test.ts` W3-09-3-01～03 |
| C-05 | 「永久清除用户数据」漏掉现行库和数据 | #514 修 | 清除范围补上 `assistant`、`placement`、`agent-definitions`、`characters` 四个库（进 `PERSONAL_HOME_SQLITE_STORES`，归为宿主库，插件不能用这些名字），以及 `docs/system/HOME-DATA.md` 登记的 `agent-runtime/`、`feed/`、`browser/`、`plugin-builder/`、`cache/`、`directory-access/`、`git-operation-details.json`、`runtime-integration-attempts/` 和 `config/` 里属于人的五个文件；`tests/uninstall.test.ts` 往每一项放内容，断言在计划里且 Home 整个删掉（未修时「purge 要删 assistant」失败）。Keychain 主密钥不在 Home，不碰。统一登记（W4-11）仍未做 |
| C-06 | Characters 打开无版本旧库时直接盖成版本 1 | #514 修 | `openCharacters` 改经 `applySqliteBaseline`（`CHARACTERS_STORE_BASELINE`）；无版本的表、更高版本都拒绝且原库不动（`tests/home-store-baselines.test.ts`，未修时「Missing expected exception」）。发布检查清单该行改成「拒绝」。真实 Home 的库在 10-14 只读拷贝上是现行形状（F-9） |
| A-01 | 模型切换在 SDK 接受时没有末端授权复核 | 已修（#523，main `f74e29d86`） | 新 SDK 包的 `beforeAccept` 接到模型切换；`tests/agent-sdk-effects.test.ts` W2-18-MODEL-SWITCH-01/02（在读配置、读凭据、SDK 接受三处撤权或取消，切换都被拒，已接受的模型 B 和它的显示不变） |
| A-02 | Computer Use 停下或出错的一轮被记成「失败：模型说完成了」 | 已修 | #510 |
| A-03 | 电脑 socket 自带本机名单、S-04 未覆盖 | 已修 | #510；`SECURITY-INVARIANTS.md` 第 9、70 行「Computer Use 不在 main」#514 改掉，并补 S-25（桌面动作的拒绝，用例只在本机跑） |
| A-04 | `withPreparedActions` 准备失败不进共同调用结算 | 已修（#523，main `f74e29d86`） | 准备失败经 `refuseCall` 进共同结算，调用记录留一行「未运行」；`tests/action-prepare-refusal.test.ts`（10-15 补，main 上 0 行、F109 上 1 行） |
| A-05 | 测试内部引用台账开头仍写 16 条 | #514 修 | 改成 15 条、8 个测试文件，注明 10-15 删去的一条 |
| A-06 | AI 入口清单没有 Pages 评论线程 | #514 修 | `ai-entry-inventory.md` 补 AG-7（模型调用仍走 AG-1；C-02 记在这一行） |
| B-01～B-12 | 结构项（手工装配、浏览器模板脚本、Home 清单分散等） | 照路线图 | 第 4～6 波；不在本节关闭 |

I8 落地的实际情况（10-15）：第 1 片（S1）的构建闭包把 136 个文件拉进来，仍有 19 个测试文件失败，原因都是 W3-02 的错误改名、`goal-actions` 子路径和管理入口没跟进。S1 不能单独成片，下一步把 S1 与 W3-02 合成一片，从 F109 `9a30b3135`（已合入 #505～#513）整文件取，而不是 `7882cf09c`。后来按 §1 的三行决定改成整个 F109 一个 PR：W3-10 单独取 35 个文件时全量 41 个文件失败，单片离不开其余工作流。C-01、C-02、C-04、A-01 的用例用到 F109 才有的接口，在 main 上跑不起来，main 上的失败以审查报告的隔离复现为准；A-04 的用例只用公开接口，在 main 上失败、在 F109 上通过。#523 在 CI 上第一次跑全量：F109 失败 25 个文件，main 基线（`integration/main-baseline-e18a65b4`，同一套分片）失败 31 个。只在 F109 失败的 6 个逐个查过：`characters-schema` 是 F109 的 W1-18 断言还在等旧的 `characters.invalid`，而 main 的 C-06 已改成共同基线的 `storage.schema_version_mismatch`；同时发现 #514 把 `chmod` 放在了版本检查之前，被拒绝的库也会被改权限，已改成通过检查后才收紧。`catalog-read-contention` 是启动时打开项目引起的真回归，处理见 §1 的启动决定。`side-panel-browser` R5B-01/03 是浏览器进程退出先于 DevTools 连接关闭时页面仍显示「就绪」的竞态，退出时先关连接。`lingguang-mcp`、`ppt-mcp`、`companion-client-lifecycle` 在本机通过，CI 上是超时，main 上同样接近时限。第二轮（合了 #524：16 片、失败重试一次）对照同一配置的 main 基线（`integration/main-baseline-64ae9293`）：重试后仍失败的，F109 15 个、main 17 个，只在 F109 失败的 3 个都已查清并修好，在 Linux 上的临时诊断任务里连跑 3 次都通过。`alchemist-client-boundaries` 是真缺陷：选中一项后，如果它的列表读取被更晚的读取超过，或视图在读取中被隐藏，这次选择就丢了，回来时打开的是旧对象。现在记住这次选择，直到它真正打开，并补了两个确定复现的步骤（W2-18-ALCHEMIST-UI-01）；修复多出的字节用一个共用的提示段落函数抵掉，资源预算反而降了 60 字节。`side-panel-browser` R5B-01/03：在限制用户命名空间的 Linux runner 上，带沙箱的渲染进程收到崩溃指令后会卡住不退出，页面收不到崩溃事件；用例改用测试机的 Chrome（CI 上不带沙箱），产品逻辑不变。`shelf-client-boundaries`：Chrome 主进程退出后辅助进程还在写配置目录，清理时删除失败；#519 已让测试用的 Chrome 退出后等辅助进程 500 ms 再删，不另改。#523 先于这三项合入，它们和 #519 与 F109 文本合并留下的一处旧错误码（`tests/side-panel-browser.e2e.test.ts` 等待 `page.load_failed`，F109 已改名为 `browser.load_failed`）由后续 PR 补进 main。`tests/goal-event-document.e2e.test.ts` 的「event document writes planning, report, concern, decision and closure」随 F109 变得偶发失败（本机单跑：旧 main `afe440dd8` 0/9，F109 2/9，合入后的 main 4/13）。原因是保存后约 0.6 秒，看板每 4 秒一次的游标轮询整页刷新 Goal 文档，把刚打开的记录菜单收起，下一次点击落到时间线上（旧 main 也有这个刷新，F109 的时序让窗口更常撞上）。现在 Goal 文档里打开着记录菜单或「更多」菜单时，后台刷新先等，菜单关掉后下一次轮询再刷新；`tests/goals-refresh.e2e.test.ts` BL-140 用例去掉修复会失败。修复后本机 17 次都通过。#529 合入后又看到 `tests/todo-draft-recovery.e2e.test.ts`（W2-18-TODO-DRAFT-01）偶发失败：等不到版本冲突（409）。原因在测试：关掉详情时编辑区只是藏起来，字段里还留着旧值，所以「重新打开」后等标题的那一步在读取返回之前就过了；页面外的修改先落库，重新打开读到的是新版本，后面的输入照常保存，不会冲突。编辑区藏着的时候人打不了字，产品没有问题。现在这一步同时等编辑区显示出来。把重新打开的读取人为推迟 1.5 秒：旧写法每次都按 CI 的报错失败，新写法通过。`tests/agent-action-selection.e2e.test.ts` 在 main 上早就在 CI 里反复失败（I8 之前的基线 `64ae9293` 也失败），新建角色后编辑区一直不出现。原因在产品：设置里的「我的角色」先由服务端画出来，「新建角色」「从本机导入」按钮一出现就可以点，但页面脚本这时还没挂上，点了没有任何反应；CI 上测试刚打开页面就点，正好落在这段时间里。现在这两个按钮先画成不可用，页面脚本第一次读完列表后照常由 `controls()` 打开；测试等按钮可用后再点。旧写法下点击落在脚本挂上之前，不会发出新建请求；把列表读取人为推迟 2.5 秒后，修复前失败、修复后通过，本机另跑两次以及 `cross-plugin-recovery`、`page-interaction-flow` 两个用到角色页的用例都通过。


**10-15 现状：** 已随 #523（A-04）修好。PREP-108-01～04 在 `tests/action-call-log.test.ts` 与 `tests/assistant-business-gateway.test.ts`，10-15 在 main `f484d09a5` 上 2 个文件 67 项全部通过。上面的现象和方案留作记录。

### 10.13 2026-10-15 合入 PR 的独立复查（#513～#533，及在途）

按 10-14 目标的三条（是否符合要求文档、有没有把清理过的问题带回来、有没有无依据的行为变化），复查 10-15 审计基线 `24d04d98` 之后合入 main 的 #513～#533。看的是实际改动和合并后的共同效果，不只看 PR 自述与 CI。

| 编号 | 发现 | 判定 | 处理 |
| --- | --- | --- | --- |
| R-1 | #527 撤回了把 `tests/mcp-scene-effect-authority.test.ts` 时限从 30 秒调大的提交，理由是「调大测试自己的时限就是放宽」，并改为把安全任务拆成两片。3 分钟后合入的 #529 又把它调到 120 秒 | 当时判为推翻 #527 的决定、没有新依据，#541 改回 30 秒。用户 10-15 已定：时限可按慢机放宽（第 1 节），所以 #541 的改回是错的：30 秒下 `W3-09-AUTH-03` 在 #532 的 CI 上超时过，本机 13–16 秒 | 改成 90 秒，注释写明倍数与用途（#541 之后的修正 PR） |
| R-2 | #520 与 #522 的单次资源例外已经用完（issues.js 实测 26,331，Pages 编辑器 703,633），可门禁里按旧大小（24,378、698,574）写的例外还在：缩回旧大小就能再用一次 | 与 F-1、F-13 同类 | 本 PR 删掉 `APPROVED_CEILINGS`，两条例外用例改成「已用完、旧大小下不再放行」。变异检查：用 main 的门禁跑，这两条失败 |
| R-3 | #520 写明用户在 10-15 批准了 Issue 26 KiB 的例外，但 `specs/issue-home-v0` 没有这条批准的记录，只有 PR 说明和门禁注释 | 与 F-1 同类；批准由 #520 作者转述，本会话无法核实 | 记在这里；例外已在 R-2 删除 |
| R-4 | #516（依赖安全修补）：MCP SDK 升到 1.31.0；OAuth 凭据没有 issuer 时拒绝读取，提示「MCP 授权凭据来自旧版本，请重新连接」（stdio 不受影响） | 有依据（GHSA）的行为变化，不留兼容，符合「读取不兜底」 | 用户可见：之前保存的 OAuth MCP 连接要重新连接一次。未读钥匙串核对 |
| R-5 | #519 为 Linux CI 调大 20 多个用例的时限与等待（「时限只防挂住，不是速度检查」），#527 对同类问题的口径相反 | 用户 10-15 已定：时限可按慢机放宽，不算放宽断言（第 1 节）；#519 的做法符合，#527 撤回时限那一步不再作为口径 | 已定，不用再问 |
| R-6 | #521 新增浏览器脚本模板 `ISSUE_REVIEW_CLIENT_SCRIPT` | R-07（浏览器代码无打包与类型检查）方向上多一个，但这项还没有门禁 | 留给第 5 波浏览器类型化，不在本 PR 处理 |

没有问题的：
- #521：重新整理只读助理已就绪的 `issues.update` 建议卡，把标题和类型填回编辑器，页面不执行卡片；仍由带 `expected_version` 的保存提交；不引用别的插件的实现。
- #527：校验结果与注册时的拒绝都不变，与 #523 的预编译组合正常。
- #528：去掉了重复的重试，占位里仍显示带诊断编号的错误。
- #531：纯提取，外加改成显式版本号。
- #533：等待条件跟上 #523 改的错误码，断言没变。
- #513、#517、#525（文档）与 #515、#518、#524、#526（CI 与测试基础设施）：每项改动都有用户 10-15 弹窗决定（第 1 节）。`--retries 1` 只在 CI 全量里开，重跑才通过的文件会单独列出，本机默认仍是 0。

Prologue（10-14 复查到 #22 为止，这次看 #24～#27）：
- #24：把 #20 的模型切换末端授权复核搬到 main，源码与用例和 #20 相同。#23（临时发布分支）关闭，没有合入。
- #25（P2k，按步骤判冲突）：同一版本、不同步骤上的两次改动都落地，是 X5 用户选 B 的预期变化；同一步骤上的冲突仍拒绝，用例保留并补了这一条。
- #26：只改测试夹具，改用 Runtime 里真实的会话。
- #27（F-15 / BL-137）：撤销时先作废索引（一次墓碑），再用新的 `HostStorage.discard` 删块，最后 fsync 一次目录；崩溃后再次撤销能按文件名找到残留块。会话与 Effect 的删除路径不变。Tauri 的 `storage_discard` 接受任何 kind，信任级别与 `storage_purge` 相同，PR 里已经提出可以再收紧，不挡。Molis 还在用旧包，要等 P3a 换成 `e5123369` 的包才生效，BL-137 那时再关。

在途：
- #530：目录读取改为共享冻结的快照，写入会抛错而不是只改到副本；调用方核查与 Agent 工具参数拷贝合理。
- #532、#534、#536：由四线各自负责，与第 4 波的冲突已经告知统筹（W4-04 等 #532，W4-07 等 #534）。
- 本节的修复是 #541，已合入（`4eead9d5`）。
- #539、#540（W4-09）的 CI 全量各有红片，查过不是它们引入的：
  - 两者共有的是 `tests/agent-action-selection.e2e.test.ts`。它在 #535 合入前的各分支全量里都红（`context/assistant-flow`、`adoption/p3-collaboration`、`feature/ai-interaction-s1`），#535 修了这处 Characters 偶发，而这两个分支的基点早于 #535。
  - #540 另有 `W2-18-PAGES-TRANSIENT-01`（插入的文字落在段尾）：失败片重跑全过，本机在该分支上 9/9 通过；之前没有记录。只出现一次，没有进隔离名单，再出现就按 `tests/quarantine.json` 登记。
    - 原因是测试自己：它用脚本设 DOM 选区再按方向键，编辑器会把只经 DOM 设的光标放回自己状态里的位置，两者赛跑，Linux 上编辑器赢了，「Prefix 」就落到段尾。改成像人一样在段首、段尾点一下，再等光标确实到那里；断言不变（#548）。本机 13 次全过（其中 10 次与构建或另一批浏览器用例同时跑）；更早有两次在构建期间失败，没留下失败细节。

### 10.14 2026-10-15～16 合入 PR 的独立复查（#534～#556 中不是本线的）

范围：#534、#535、#536、#537、#538、#543、#546、#548、#552、#554、#556（本线自己的 #539～#542、#544、#545、#547、#549～#551、#555 由统筹审）。逐个看 diff，按清单查五件事：门禁数字有没有调大、有没有新增兼容或读取兜底、有没有删或放宽断言、有没有调大现有用例的时限、可信身份是否从输入读。

结论：没有发现需要修的。
- 门禁数字：没有一处调大；`baseline.json`、`page-assets.json`、`limits.json` 的改动都是降数或随 merge-base 重算。
- 兼容标记：命中的都是 `anthropic-compatible` 一类的供应商名，不是兼容逻辑。
- 删掉的断言：#552（1c）把 `control-run` 的断言改写到 v3 形状，按 `docs/system/CONTRACT-CHANGES.md` 升了版本，新断言更严；#536（W3-A1）删掉的是旧的下一步卡片布局，是 context-program §21 已定的设计。
- 时限：没有调大现有用例的时限；#548 把 `W2-18-PAGES-TRANSIENT-01` 的光标改为点击放置（原因见 10.13），断言没变。
- 身份：没有从输入读 actor、项目或安装的新路径。
- #534（P3a）改到的 typed 宿主能力都是就地替换：队列 v1 → v2，`waits.await` → `collaboration.await`（文档里写成一种等待），另删了 4 条；结构数字没有变大。
- #537（CI）：全量里侧栏自己的浏览器也走 `--no-sandbox` 的 Chrome。runner 的沙箱下崩溃的渲染进程退不干净，Chrome 不发崩溃事件；用例没改，`ci.yml` 没动。
- #538（CI）：限流并只在加标签时跑，是用户 10-15 的弹窗决定（第 1 节）。

Prologue：#10～#22 在 10-14 复查过，#24～#27 在 10.13，这一轮没有新合入的。

### 10.15 2026-10-16 合入 PR 的独立复查（#553、#557、#561、#564、#566、#567，及在途的 #560、#568、#569）

范围：§10.14 之后合入、不是本线的 PR（本线的 #555、#559、#562、#563 由统筹审）；在途的三个只做机械核对，入队前统筹按清单再审。查法同 10.14（门禁数字、兼容或读取兜底、删改断言、调大时限、从输入读可信身份），另读改到宿主、合同、Agent Host 与 SDK 的部分。

结论：代码没有需要修的；一处活文档过时，本 PR 已改。
- 门禁数字：没有调大。#553 与 #564 各用一次用户 10-15 批准的资源放行（`APPROVED_CEILINGS`），两者合入后都已用完；W4-03 第二片按原注释提议删去（待统筹定）。`limits.json`、`giant-exceptions.json`、`biome.jsonc`、隔离清单都没动。
- 断言：#564 改的一条是计划里「规划时补充的意见」的措辞，从「已体现在确认的计划里」改成「没有逐条核对是否已写进计划；以确认的计划为准」，依据是 specs/ai-input-receipts RC-07、G14（没有核对就不说已体现），属于有依据的预期变化；其余只增不删。#569（在途）改的一条只改了失败说明，用例从 3 种扩到 11 种。
- 时限、兼容、身份：新用例自带时限，没有调大现有的；命中的「compatible」都是 `Anthropic-compatible` 一类供应商名；没有从输入读 actor、项目或安装的新路径。
- #553（W3-B1，放进左边）：新路由 `/api/contextual/attach` 走现有的情境请求读取与动作服务，用的是本人的权限；输入由落点和选中的文字算出，不经模型，所以预览就是要写的内容；执行前经 H3 的 `confirmReferences` 从主人那里重读落点对象，缺这个端口时拒绝；版本由主人比较。
- #561（H4 2b）：卡片规则从 `assistant-offers.ts` 整段搬进 `packages/plugin-sdk/src/action-cards.ts`（`cardSubject`、结果摘要、相对日期判断都随之搬走，宿主不留第二份）；SDK 仍只依赖合同包，拒绝原因以端口给出，由助理映射回自己的 `assistant.*` 码，错误码与文字不变；API 快照随 PR 更新。
- #564（回执 1d）：恢复报告的 `inputs` 读自运行时自己的输入队列，没有另存一份；会话打不开时不写这一项（未知，不当成空）；开轮时 `queued: "carry"` 是 D4 的「人开的那一轮带上」。
- #557、#566、#567：文档与 Skill，门禁里的引用检查通过。
- 过时：`specs/coding-plugin/spec.md` 第 6 条仍写旧措辞，本 PR 改成现行措辞并注明依据。`specs/ai-input-receipts/spec.md` 的现状核对表（「1d 计划轮次不写已体现：未做」等）是那条线写的时点快照，转给统筹，由回执线在 1e 时一并更新，这里不改。

Prologue：#24～#27 已在 10.13 复查过，之后没有新的 PR。

### 10.16 2026-10-16 合入与在途 PR 的独立复查（#569、#574，在途的 #571、#573、#575、#576、#577；Prologue #28）

范围：§10.15 之后合入、不是本线的 PR（本线的 #558、#570 由统筹审），以及在途的五个；Prologue 仓库 #27 之后的 #28。查法同 10.14：门禁数字、兼容或读取兜底、删改断言、调大时限、身份来源，再按 AI 入口清单（`ai-entry-inventory.md`）看模型调用链。

结论：代码没有需要本线修的；给两条线各一条跟进（下面「跟进」），都不是回退。
- 门禁数字：没有调大。#573 的页面资源 5 项全降（arrival.css 823,361 → 820,783、todo.js 62,221 → 62,081、settings.css 1,115,160 → 1,112,582、workbench.css 1,701,633 → 1,699,055、workbench.js 1,099,387 → 1,094,955），巨大单元 `assistant-island.ts` 2,384 → 2,277、`craft-finish.ts` 2,173 → 2,156；#571 的三个单元都变小。API 快照的改动都在 PR 里说了对调用方的影响（#571 `services/agent-host`、#573 `platform/dom-events`、#576 `platform/plugin-agent`、#577 `platform/model-prompts`）。
- 断言：#573 删的 13 条都对着 context-program §21.2 第 1、3、4 条与 §21.5 的决定（情境条取代「材料」按钮、聚焦不弹开场建议、交给助理不替人写话），每条都换成新行为的断言（输入框为空、情境条里只出现一次、× 去掉、发送前不开始），触控用例改量情境条的小片仍是 44px；#577 改的 4 条换成更严的（与固定的不可信提示逐字相等），并为 Cognia 补一条 S-13；#571、#575、#576 只加不删。
- 时限、兼容、身份：新用例自带时限；没有兼容或读取兜底；没有从输入读 actor、项目或安装的新路径。
- #573（W3-A2）：`molis:assistant-open` 的载荷去掉 `text`、加 `object`，发它的只有工作台的 `context-actions` 与成果的 `works-client`（只带 `work_id`）；插件经 `molis:assistant-message` 的 `delegate` 带来的 `text` 照旧放进输入框（`assistant-island.ts`），公开的 `AssistantPluginMessage` 合同不变，只是内置插件不再替人写话。
- #571（H4 2a）：建议工具名前缀 `molis-suggest-` 在任务板里免审（D27：点卡才是人的确认），冒名不了：角色的工具要过 `prologueToolName` 的系统工具名单，MCP 工具名是 `mcp:` 开头。S-28 的拒绝都有断言（不在本轮冻结的动作、已停用、合同已变、已不在目录、超过 32 KiB、输入被动作拒绝、只读角色带它）。
- #575：去掉 `deferToolSchemasBeyond`，依据是用户 10-16 的决定（延后的工具谁都调不到，先不延后，上游修好换包后恢复），PA-12 钉住；这是配置，不是兼容逻辑，恢复的步骤写在 prologue-adoption。
- #576：合同加 `AgentRoleDeclaration.skills`、SDK 安装时检查；宿主开轮时的拒绝与 Coding 的用途组在后续 PR。
- #577：Cognia 与项目引导共用 `fencedMaterials` 的固定提示，S-13 扩到 Cognia；模型调用仍经 `horizontal/agent-host` 的文本口，入口清单里的链不变。
- #569、#574：#569 按错误码与种类读失败的运行（不读措辞），#574 是手册记录用户 10-16 的两项决定；门禁里的引用检查通过。
- Prologue #28：延后的工具在 `find-tools` 之后照常声明，只列了名字的也能按名字调（Model 那道门照收），参数仍按真 schema 核；能调的名字取自这一轮可见、已授权的工具，授权收回或换了角色之后就不再带，没有放宽授权；测试只加不删（+33）。Molis 还没换这个包（`vendor/prologue-sdk/` 换包与删旧包要用户定），#575 的暂时做法等换包后删。
- W5-12 测量（#578）里在基线上也红的 Issues 两个浏览器用例记成 BL-142（主人 Issues，统筹 10-16 定先不隔离）；收尾竞态由 #578 修掉。

跟进：
- #571：建议工具对输入的检查靠可选的 `client.check`；调用方没给它时，记录下来的建议没核过输入（不执行，点卡时再核），S-28 的「输入被动作拒绝也拒」以给了 `check` 为前提。已由 2c 覆盖：统筹 10-16 认可逐项回合的 client 带上 `check` 的透传，建议在提出时就核。
- #576 → 手册线（在 PR B 里改，或 PR B 之前单独一个小文档改动）：`elements.md` 与 `PROLOGUE-AI.md` 把 `default` 写成「开新一轮时已经选上」，但宿主读 `role.skills` 要等 PR B 与 Coding 那一片；在那之前照文档写的外部作者会发现默认不生效。请在 PR B 合入前把这两处写成「宿主开轮时按它选上（PR B 起）」，或与 PR B 一起合。

### 10.17 2026-10-16 在途 PR 的独立复查（#580、#581、#583、#585；#571、#573 在 §10.16 之后的提交；在途 9 个的组合效果）

结论：都有依据，不用改代码。#583 照复查建议补了 S-13 的措辞；#580、#585 要先解与 main 的冲突。

- #580（D4）：八处要模型的动作改用同一个 `textModelAvailability` 判断可用。没配模型时与原来相同（`actions.connection_required`，各用原来的话）；设置读不了时带失败自己的码（没有码就用 `actions.configuration_unavailable`），原因是固定的一句话、不带失败内容，界面不会再带人去设置里找一个不存在的问题。Feed 的判断队列取出的每一项都试一遍、全部试完再抛第一处失败，原来是第一处失败就丢掉同批其余的（PR 里做过变异核对）。宿主日志只记码（W5-13 的 `hostLog`）。动作合同不变，`ai_available` 仍是布尔值。
- #581（换包）：独立核对。tgz 的 SHA-256 `cfed7ff4…0705` 与 `.sha256`、provenance 一致；来源提交 `e4afd1a7` 在 Prologue main 上（#28 的合并），树 `9dbe15b1` 与评审过的 head `af7be966` 相同；包里有 `tools-found`；`prologue-node-port.ts` 与 #575 之前的 main 逐字相同。§10.16 里「#575 的暂时做法等换包后删」由这个 PR 完成。
- #583（B3）：Todo 整理的材料与已有待办放进 `fencedMaterials` 的固定声明后面，S-13 新增 Todo 一条用例；项目上手那条从「只有一次带围栏的请求」改成每一次请求都查、自己的那次恰好一次，更严。复查建议：围栏前的「用户这次的要求」由调用方给出，经助理调用时是 Agent 的转述。它只影响等用户确认的候选、不带工具，不算缺陷，但 S-13 应写明来源。PR 在 `3200b1901` 照此改了 S-13，已变基、去掉 #577 的提交。
- #585（B5）：什么时候写 yes 只写在 reader 角色里，给代码读的格式写在任务末尾一行。位置有对照评测（共 68 次调用），用户 10-16 在弹窗里选定；单次的错判按「模型能力不打补丁」记下，没有加规则。角色与提示词升 v2，PR 里写明改过提示词的 Home 会看到「默认已更新」。历史回合不经围栏是旧问题，PR 列为后续。与 main 在 `specs/ai-development-handbook/spec.md` 冲突（与 B2 的记录写在同一处）。
- #571 `693726fd8`：S-28 加一条拒绝用例：角色点名不是这一轮的 `molis-suggest-` 工具，在发模型请求前就被拒；调用一个没给这一轮的建议工具，什么都不执行。建议工具的名字统一取 `GATEWAY_TOOLS.suggest`。
- #573 `7487fa34d`、`acbd2becc`：加 STRIP-03（排满时横向滚动，键盘和滚轮都能到最后一个），触控用例同时量 + 与 ×；相对 main，5 个页面资源与 3 项基线全部变小。

组合效果：
- 在途 9 个按队列顺序（571 → 573 → 581 → 578 → 580 → 582 → 583 → 584 → 585）在 main `f48f56fe` 上试合并。文字冲突三处：#580、#585 各自与 main 在手册 spec；#584 与 #573 在 `tooling/gates/page-assets.json`（数字，#573 合入后 #584 变基、重新量）。在合得进的那几个上查过跨 PR 引用（`aiAvailable`、旧的材料声明常量、`deferToolSchemasBeyond`、`codingBackgroundTasks`），没有遗留。
- #581 恢复「超过 20 个工具就延后」，而 #571 的建议工具和 S-28 用例是在不延后时（#575）写的，两个 PR 各自的全量都不含对方。在 main+#571+#581 上构建，跑了两边动过的 5 个用例文件，89 条全过。
- 缺口（不是缺陷）：S-28 的回合只声明 2 个工具，没有走到延后；agent-host 对一轮的动作工具数没有上限，超过 20 个时建议工具只列名字。#28 之后只列名字的照样调得动、宿主照样核。交给 H4 2b 补一条用例：一轮工具超过 20 个时，建议工具仍只指向这一轮的动作，输入仍被核。

### 10.18 2026-10-16 合入与在途 PR 的独立复查（#588～#603 中不是本线的；在途的 #591、#598、#605；Prologue #29、#30）

范围：§10.17 之后合入、不是本线的 PR（#588、#589、#590、#592、#594、#595、#596、#597、#599、#601、#602、#603），在途的 #591、#598、#605，Prologue #28 之后的 #29、#30。本线自己的 #593、#600、#604 由统筹审，不在这里。查法同 10.14～10.17：门禁数字、兼容或读取兜底、删改断言、调大时限、身份来源；再逐个读改动的处理器与调用链，对照六份原始要求和本目录九份补充，不以 CI 通过、已合并或 PR 里的自查为证据。

结论：两处要修，本轮已修（下面 1、2）；一处要用户定（下面 3）；其余都有依据。

1. **记录被删（#589，已在本 PR 恢复）。** #589（回执 1e，`ca36cb959`）把本文件 §10.17 整节（16 行，#580～#585 的独立复查和在途 9 个的组合效果）删掉了，PR 描述没有提，应是解冲突时的误删（`git log -S` 只有 #586 加、#589 删）。本 PR 从 `aadce77ac` 原样放回，一字不改。
2. **取消的点击仍会执行（#597，修复在 #606（`fix/offer-run-signal`））。** `agent.offers.run` 依次核过一轮、建议、动作和输入，跑完 `beforeEffect()`，然后调 `client.invoke(offer.reference, input.input)`，没有把调用自己的 `signal` 交下去。Coding 的卡把路由的 `signal` 传给这个动作（`codingActionControl`），每轮的动作客户端也会在动作生效前查它拿到的 `signal`，只是中间这一层丢了：核完之后才取消的点击（页面关了、Coding 的调用停了）照样执行建议点名的动作，违反「被取消的调用不再写任何业务记录」。修复把 `call.invocation.signal` 交给 `invoke`，S-29 加一条拒绝用例（最后一次检查时取消，动作没跑）；去掉修复时这条用例失败（动作跑了）。撤权、停用由内层的 `caller.assertActive()` 与宿主状态挡住，本来就不漏。
3. **要用户定：main 上已是 0.3.0，但 0.3.0 没有发布（#595）。** #595 的描述写「此 PR 保持 draft，不合并、不打正式 tag、不公开发布」，作者在 12:31 自己合入了。现在 main 的产品版本与 26 份内置清单都是 0.3.0，GitHub 上只有 v0.3.0 的草稿、没有 tag。冲突在三处：
   - POLICY 第 3 节「两次发布之间，main 上的版本是最近一次发布的版本」：最近一次发布是 v0.2.0；
   - CHANGELOG 的 `[0.3.0] - 2026-10-16` 写「汇集至 main `aadce77ac`」，而 PR 描述说正式产物要「在最终合并提交重新生成」，那时 `aadce77ac` 之后合入的（#589、#597 等）会在包里却不在这一节；
   - 发布说明的清单摘要表停在 `aadce77ac`，之后改过清单的合并（如 #597 的 Coding 角色 v13/v15）已让摘要变了。按做法 A 这不挡运行（同版本不同摘要照样跟），但表不再是「这个版本带的是哪份清单」的记录。
   内容本身有依据：清单版本跟产品版本是用户 2026-10-08 的决定（POLICY 第 1、7 节，W5-15），1.x 降到 0.3.0 由做法 A 接住（`tests/plugin-release-artifact.test.ts`），新加的检查只收紧。要定的是：0.3.0 按 `aadce77ac` 还是按最终合并提交来切；切之前 main 上保留 0.3.0，还是退回 0.2.0。本线不改发布记录，交给用户。**已定**：用户 2026-10-16 定不退回 0.2.0，v0.3.0 按最终切版提交生成（`docs/releases/POLICY.md` 第 3 节「0.3.0 的例外」）；用户 2026-10-29 定「1.0.0 之前都是开发版本」：0.3.0 不是第一个外部版本，读取兼容的起点不早于 1.0.0，发版（W5-15 余下）不算进防腐完成标准（§1 决策表 2026-10-29 行）。

逐项：
- 门禁数字：#589 调高了五个页面资源的预算（arrival.css +112、coding.js +411、settings.css 与 workbench.css 各 +136、workbench.js +2,145），经 `scripts/gates/page-assets.mjs` 的 `APPROVED_CEILINGS`。用户 10-16 在回执会话里批准（`specs/ai-input-receipts/spec.md`），按 10-15「小而必需的增长一次性放行」的规则；每条只认一个确切的 merge-base 数字，main 移动后已失效，不能再用。注释要求下一次改这个门禁时删掉，交给本线下一片（W5-05 第 1 片）。其余 PR 的页面资源只降（#594、#597），#601 把一个用例加进 `ci-product-subset.txt`；没有别的门禁文件被调大。
- 断言：逐条看了删掉或改掉的。#588 换成更严的；#589 两处加 `target: "answer"`，另有新增；#597 三个 HTTP 状态按 D26 由错误种类决定（`stale_goal`、`actions.expired` 400→409，别人的材料 400→403），PR 里逐条列了；#599 的 vendored 记录跟着换包；#602 把 `used_by` 断言扩大；在途 #598 的原因措辞从「请先配置可用的文字模型」改成宿主一处写的「请先在「模型设置」里连接文字模型」，PR 里逐条列了预期变化，并加一条把措辞钉在设置导航标签上的用例。都对得上记录的行为变化，没有为变绿放宽。
- 时限：没有调大已有的时限；#589 唯一删掉的一行是用例改名（180 秒不变），其余是新用例自带的。
- 兼容与身份：#589、#592、#602 各一处新加的兼容标记，都是测试夹具里的协议名 `anthropic-compatible`，不是兼容逻辑。没有从输入读 actor、项目或安装的新路径；`agent.offers.run` 的调用方取自调用上下文（`ports.pluginFor`）。
- #597（H4 2c，S-29）：除上面第 2 条，拒绝面齐全：只给插件受众；别的插件的会话、这一轮没有的建议、不是建议自己的引用、不在这一轮冻结工具里的都拒；动作已不给 Agent、停用、合同在建议之后变了（`action_digest`）、输入不过动作自己的检查，都什么都不执行。重复点击由 Coding 卡的修订号认领挡住，宿主不另记状态；卡只在调用自己的 `beforeEffect()` 之后写，写前每次 `assert_current()`。`action_digest` 是新加的必填字段，旧建议读成合同已变（不加兼容）。
- #599（换包，Prologue #30）：独立核对。tgz 1,187,709 字节、SHA-256 `29013b0c…1b0d` 与 `.sha256`、provenance 一致；来源 `be78f726` 是 Prologue main 上 #30 的合并，树与评审过的 head `97f9484f` 相同；换下的 found-tools 包按 `gitBlob` `bb31b2a2` 取出，字节数与 SHA-256 和 `patch-history.json` 的记录相同。
- Prologue #30：一轮只要延后了工具，`find-tools` 就在场，不看角色点没点它。它只交出这一轮本来就有的工具，不扩大授权；依据是 #581 之后延后的工具调不到。#29 只改文档。
- #596（A2）：现在用不了的能力留在目录里并带提供方的原因，但不作为工具给这一轮，动作服务照样拒。原因文字与本来就进目录的动作标题同一来源、同一信任级别，没有新增注入面。
- #592（D2）：桌面步骤、缺模型改按事实认（轮次开始时记下的桌面目标、错误码），删掉了按措辞的正则，符合「模型能力不打补丁」与「读码不读措辞」。
- #602（A3①）：委派与记忆的用法从 base 挪到工作角色和工具说明，没有新增禁令或特例；子任务成为自己的角色 `assistant-delegated`。
- #601、#594、#590、#603：分别是历史摘要带上仍有效的补充、切换器标签只在变了时重建、采用线文档、界面验收说明；没有越过要求的地方。
- 在途 #605：Coding 的回执播报改按「这一轮 + 输入编号」认，原来按每轮内才唯一的 `turn_id`，两轮的同名 turn 互相覆盖。改写后的提示与原来的字一样（`SENT['after-run']` 就是那句），coding.js 变小 2 字节、预算跟降。
- 在途 #591（W5-09，纯搬移）：统筹已核过 124 条顶层语句相同；本线在 `5ba635c8c` 上重生成时 126/126 相同，API 快照不变。

组合效果：在途的 #591、#598、#604、#605 与本线的两支（`fix/offer-run-signal`、W5-05 第 1 片）之间，文件重叠只有两处，都是只降的数字文件：#591 与第 1 片的 `tooling/gates/baseline.json`，#605 与第 1 片的 `tooling/gates/page-assets.json`；后合的那个变基后重新量。`fix/offer-run-signal` 改 `horizontal/agent-host/src/session-actions.ts` 与 S-29，#591 只搬 `packages/contracts` 里的定义，不冲突。#598 依赖 #580 的 `textModelAvailability`，#580 已在 main。

### 10.19 2026-10-16 另一轮质量复查（N-01～N-06）与 #608 的逐项裁决

来源：用户 10-16 交来的两份复查。一份是 Codex 的审查（主检出 `docs/reviews/anti-corruption-audit-2026-10-16*.md`，未入库；交接在主检出 `.claude/handoff/anti-corruption-review-handoff-2026-10-16.md`），另一份是 #608 入库的三份审查文档。用户的口径：先核实是不是真问题、生产路径能不能到、有没有已被修掉，再酌情处理；真问题按原计划安排，不特意提优先级。下面每一项都在 main `76758783` 上按符号重核，不沿用报告里的行号与结论。

| 编号 | 裁决 | 依据 | 验证 | 剩下的 |
| --- | --- | --- | --- | --- |
| N-04 Functions 同毫秒写入绕过版本检查 | 确认并修复（#616） | `modules/functions/src/store.ts` 拿 `updated_at` 同时当新值和比对的版本，写入时取 `new Date()`；同一毫秒内的第二次写入不会让版本前进，还拿着旧版本的写入照样能覆盖。改草稿、存预览、增删样例、发布四条写入路径都一样。改成仓库已有的做法 `Math.max(Date.now(), 上一版 + 1)`（Lingguang、Pages、Workflows 用的就是它），四条路径都用。 | 新增 `tests/functions-store-versions.test.ts`：把时钟固定在同一毫秒，逐条路径断言第一次写入成功、版本前进、拿旧版本的那次被拒（`functions.conflict`）、第一次写的内容留着；不修时这条用例失败。Functions 相关的 11 个文件全过。 | 没有用浏览器双窗口实测。 |
| N-05 记忆导出漏掉适用条件，筛查失败时退回原文 | 确认并修复（#616） | 合同 AC-M12（`specs/archive/memory-system/spec.md`）写「导出包里没有秘密和绝对路径」。`exportScope` 只清理正文和出处，`applies.task` 是自由文字却原样复制；`screen` 失败或没有时退回原文，还当成功导出。现在 `applies.task` 也清理；筛查没有或失败时整次不导出，报 `memory.unavailable`，绝不交出原文。 | `tests/memory-upkeep.test.ts` 的导出用例加一条 `applies.task` 带路径的记忆，断言导出里是 `[path]` 且计进 `redactions`；没有 `screen`、`screen` 抛错两种都断言被拒、错误信息里也没有路径。不修时这条用例失败。导入条数随新增的一条从 2 改成 3（是新加的夹具，不是放宽）。 | 审查复现用的是示例路径，没有发现真实密钥外泄。 |
| N-03 Handoff 已收下却没落账，过期后可以显式重试 | 恢复规则已厘清；只修界面说法（#616） | 规则是三条一起成立的：硬约束是被取消或撤权的调用不再写任何业务记录，所以原生端收下之后再被拒，不能补记「已发送」；旧 spec 第 67 行规定租约过期转成可重试的失败，为的是不永久卡死；第 76 行规定结果不确定时不自动重发、先请人看目标。现在的实现三条都守住了：后台不自动重发，恢复写的是 `work.handoff.interrupted`，原因是「请检查目标 Runtime 后重试」，重试要人点。真正的缺陷在界面：重开对话框时这种失败也显示「已恢复上次未发送的 package」，说成没送到，人可能不先查就重发。现在对 `work.handoff.interrupted` 显示「上次发送没有确认结束，目标可能已收到；请先查看目标 Session。」，其余情形不变；这次增加的字节由同一脚本里重复的忙碌与报错代码合并抵掉。 | 对话框脚本没有公开入口，新测试文件又不能引用包内部，所以用一个临时 VM 驱动（在会话临时目录，不入库）把脚本跑起来：修之前过期的失败显示「未发送」，修之后显示先查看；运行时明确没收下、不能安全重试、草稿三种的提示不变。会话与 Handoff 的 6 个用例文件全过。 | 还没有入库的断言钉住这条提示；要钉住，得给对话框脚本一个公开入口，或者加一条浏览器用例，等 Work 插件按原计划迁移时一起做。 |
| N-06 Shelf 的预览指纹检查跨过授权等待 | 误报 | 动作合同是「按已预览的指纹把文字存成固定版本的材料，内容变了就拒绝」。处理器读材料、比指纹、等 `beforeEffect()`，然后发布的正是比过指纹的那一份。存进去的版本就是人预览并确认的内容；等待期间才发生的修改，排在这次保存之后，并不违反合同。读材料是同步的，读和比指纹之间没有别的等待。 | 读码核对。 | 无。 |
| N-01 搜索组合项目和个人空间时用到旧目录 | 不适用 | 第二次 `callerSources` 先读项目目录、再等个人空间，结果反映的是几毫秒前的一份目录快照，和来源刚好在响应之后才停用没有区别；下一次查询照常不返回它。`system-search` §5.2 管的是索引追平这段长等待里失去的来源，#514 已修，这次复核仍然成立。只读的路径不需要提交边界，也没有越过当时已有的权限。 | 读码核对。 | 无。 |
| N-02 「测试对包内部的引用归零」说法不对 | 确认，在这里改正 | #523 的描述第 41 行把归零写成「测试对包内部的引用」。真正归零的是同一个测试进程里同一个包既从源码又从构建加载（W2-10-E 绝对零）；测试直接引用包内部的数目，按文件只降不升，在 main `76758783` 上是 494。本节就是改正后的记录，远端合入 PR 的描述不改。 | `node scripts/check-health-gates.mjs --base origin/main` 报 494 个测试内部引用、0 个混用进程。 | 494 处内部引用按台账继续减（W2-10/W2-11）。 |
| #608 F-40 `RUNTIME-MIGRATION.md` 名单过时 | 确认，本 PR 改正 | 状态行还写「Form 与 Todo 迁移尚未开始」，名单还是 7 + 18。main 上实际是项目监督器 8 个（含 form）、Home 监督器 1 个（issues）、构建期 17 个，目录 26 条。只改了状态句、条数和三份名单。 | 对照 `tests/builtin-plugin-assembly-gate.test.ts` 与 `apps/workbench/src/builtin-plugins.ts` | 迁移本身按 W5-01/W6-01。 |
| #608 F-41 §12.4 的 RAC-01、RAC-13 两格过时 | 确认，本 PR 补现状 | RAC-01 那格写「Form 样板未合」，RAC-13 那格写「W4-11 未交付」，两件事都已经做完。两格各加一句「10-16 现状」，原来的裁决文字保留不动；两条仍然没有通过。 | 对照 `project-plugins.ts` 与 `home-stores.ts` | 无。 |

#608 本身：它是另一位作者在 `dfc81998a` 和 `c1531e6dd` 两个提交上做的状态快照，三份文件都没有改代码。除了上面两条，它列的开放项大多是路线图上已经排着的（第 4～6 波、回放工具、扩展演练、巨大单元），不是新缺陷。审它时在 PR 上留了三条意见：
- 描述只写了 `dfc81998a`，可三份里有两份测的是 `c1531e6dd`；
- 文件里写着别人机器上的绝对路径（`/Users/…/repos/molis-work`），还引用了不在树上的 `health-gates.txt`；
- 它的发现编号 F-01～F-42，和归档的系统整理 spec 的 F-01～F-35 撞号，引用时容易认错。

§10.18 第 3 条（#595 的 0.3.0）用户 10-16 在弹窗里定了：按最终合并提交切 0.3.0。在那之前 main 保留 0.3.0，当作发布候选。发版时做三件事：在最终合并提交上重算清单摘要表；CHANGELOG `[0.3.0]` 的范围写到那个提交；POLICY 第 3 节补一句「发布候选期间，main 可以先是下一版」，然后再打 tag。这些都由发布 PR 的作者做，本线不改发布记录。统筹会话那边，用户对同一件事也定过：不退回 0.2.0。据此，#609（`ce800c281`）已在 POLICY 第 3 节写下「0.3.0 一次性例外，打 tag 后失效」。两处决定不冲突：在发布 PR 之前，0.3.0 由 #609 记的这条一次性例外管；发布 PR 里删掉这条例外，换成上面那句通用规则「发布候选期间，main 可以先是下一版」。

### 10.20 2026-10-16 合入与在途 PR 的独立复查（#609、#610，在途的 #612～#615；Prologue #31、#32）

范围：§10.18 之后、不是本线的 PR：合入的 #609、#610，在途的 #612、#613、#614、#615，以及 Prologue #30 之后合入的 #31、#32。本线自己的 #606、#611、#616、#617 由统筹审，不在这里。查法和 10.14～10.19 相同，先过一遍机械检查，再逐个读改动：
- 门禁数字；
- 兼容或读取兜底；
- 删改的断言；
- 调大的时限；
- 身份从哪里来。

结论：没有要修的。六个 PR 和 Prologue 两个都有依据，删掉或改掉的断言都换成了同样严或更严的；没有调大门禁数字或时限，也没有新的兼容逻辑。

逐项：
- 机械检查：新加的兼容标记只有协议名（`anthropic-compatible` 一类），没有兼容逻辑；页面资源只有 #613 动了，两份都只降（coding.js −842、workbench.js −84）；产品子集新加 `tests/agent-question-types.test.ts`（#613）和 `tests/prologue-input-claims.test.ts`（#614），都是快的、不跑浏览器的用例。没有从输入读 actor、项目或安装的新路径。
- #609：只改发布记录，写下 §10.19 末尾用户定的口径（main 在发版前先是 0.3.0，发布 PR 把记录刷到切版本的那个提交），没有动版本号或清单。
- #610（回执 RC-09，D29）：`prologue-effects.ts` 的 Proxy 原来丢掉了 `startRun` 的第三个参数 `{ carry }`，所以等在会话里的补充从来不被取走，每轮都进开场却不记账。修复只有一行，原样转交 `drive` 之后的参数。新用例跑真 SDK 和本机模型替身：补充只出现一次、带自己的输入编号和回执，下一轮不再出现。用例在修复前红、修复后绿。没有删断言。
- #612（A3②，BL-147）：会议纪要的方法从 v1 升到 v2，「不覆盖已有文档」保留；v1 不再登记，符合「合同不留兼容期」。
- #613（T1，AC-27，D29～D34）：删掉的七条断言都换成了新的形状，没有放宽：
  - `hostQuestionTypes()` 从 `["choice"]` 换成五种，两个界面各自声明同一份（AC-21、AC-22）；
  - `questionErrors` 的旧用例换成会写出限值的用例，另加一条没有题目时只写原因的用例；
  - 回答芯片仍然要求一份问卷在卡片上回答，只有宿主标了 `from_composer` 的单个文字题例外（D34）；
  - Coding 的卡改交原始字段（`values`），由路由的 `toInput` 用 SDK 读，断言跟着换；
  - `coding.runs.control` 从 v3 升到 v4，因为回答项可以带 `value`。按 `docs/system/CONTRACT-CHANGES.md` 升了版本；唯一钉住它的引用（`assistant-coding.ts` 的 `VERSIONS`）和动作快照在同一个 PR 里改了。
  
  不升提示词（D32），由 AC-27-1 用真 Node 适配器核对实际发给模型的 `ask-user` schema。
- #614（回执 3a）：用例里把 `steer-read` 放在 `steer-applied` 之后，是因为运行时从不会只写 read、不写 applied（SDK `control.js`、`projectInputReceipts`）；旧的账本形状本来就写不出来，这一处是修正测试，不是放宽。
- #615（采用线网关，Prologue #31、#32）：独立核对了 vendored 包。tgz 1,189,325 字节，SHA-256 `c6f42129…` 与 `.sha256` 和 provenance 一致；来源 `4e8468dd` 是 Prologue main 上 #32 的合并，`dirty: false`。依据是用户批准的上游 P31、P32。会话自己加的参数分支有上限（每个工具 12 条、每条 8 KiB、每次请求 24 KiB），调用照样要过动作自己的输入检查，不会扩大授权。
- Prologue #31、#32：都是新增，没有删断言：
  - #31 让会话可以给自己的 pack 工具加参数分支，带 `pack-parameter-branches.test.ts`，公开接口快照跟着改；
  - #32 让数字题可以带单位，带 `ask-user-fields.test.ts`。

组合效果：
- 在途的 #612 和 #614 现在都与 main 冲突（DIRTY），由各自的作者变基。
- #613 与 #614 都动 Assistant 的回答路径：#613 改由谁回答问卷，#614 改回执怎么投影。两者不改同一个文件；但不论后合的是哪一个，都要在合并结果上重跑 `tests/prologue-input-claims.test.ts` 和 #613 的 AC-27 用例。
- 本线的 #606 在全量里只红了 `tests/visual-surfaces.e2e.test.ts`，是一处 CDP 超时。那次运行开始于 16:45，检出的是 `528227248`，即 #606 合到 `76758783` 上，比 #604（17:02 合入）早。它撞上的是 #604 之前一次读完全部样式的那个调用，#604 已经把它拆成每次约一秒；#604 自己的全量在 Linux 上通过了 visual-surfaces。所以这不是新的问题，也和 #606 的改动（`agent.offers.run` 把 `signal` 往下交）无关。

### 10.21 2026-10-17 复查总表：接手以来合入与在途的全部 PR（#513～#622、Prologue #21～#32），以及在途 6 个的组合效果

这一节把接手（2026-10-14）以来逐批复查的结论收成一张表，补上前几节没有覆盖到的几个 PR，再看在途 PR 合在一起的效果。查法和 10.13～10.20 一样：
- 门禁数字（巨大单元、页面资源、测试引用包内部、兼容标记、API 与动作快照、隔离与产品子集清单）；
- 兼容逻辑或读取兜底；
- 删改的断言、调大的时限；
- 可信身份从哪里来，取消、撤权、停用之后会不会写业务记录；
- 改动的依据：用户决定、spec 决策记录或上游已批的切片。

对照的要求是第 1 节列的六份原文与九份补充；已经收口的事项（系统整理 F-01～F-35、健康报告 R-01～R-14、第一步 §4 的交接项）逐条看过有没有被退回。

结论：
- 违反要求、本线已修并验证的有四处：#589 误删 §10.17（#607 放回）、#597 被取消的点击仍会执行（#606）、另一轮质量复查确认的 N-03、N-04、N-05（#616，在途）、#608 记的两份过时记录（#617）。
- 要用户定的一处已经定了：#595 的 0.3.0，见 §10.19 末尾。
- 其余都有依据，都是已批准的预期变化。

**汇总**

| 范围 | 复查在 | 裁决 |
| --- | --- | --- |
| #513～#533 | §10.13 | 有依据。I8 修复树 F109 整树合入（#523）的描述把「测试同时从源码和构建加载同一个包」的绝对零误写成「测试对包内部的引用」，§10.19 N-02 已改正；没有退回的事项 |
| #534～#556（不是本线的） | §10.14 | 有依据，无须修 |
| #553、#557、#561、#564、#566、#567，#560、#568、#569 | §10.15 | 有依据 |
| #569、#574，#571、#573、#575～#577，Prologue #28 | §10.16 | 有依据。#571 的建议工具输入检查依赖可选的 `client.check`，已交 H4 2b，由 #597 补齐 |
| #580～#585，#571、#573 后续提交 | §10.17 | 有依据；#583 变基时去掉了 B2 的提交 |
| #588～#603（不是本线的），#591、#598、#605，Prologue #29、#30 | §10.18 | #589 误删记录（已放回）；#597 取消后仍执行（#606 已修）；#595 待用户定（已定）；其余有依据 |
| N-01～N-06、#608 | §10.19 | N-03、N-04、N-05 确认并修（#616）；N-01、N-06 不成立；N-02 与 #608 两处记录改正 |
| #609、#610、#612～#615，Prologue #31、#32 | §10.20 | 有依据 |
| #612、#614 的最终合入提交（`efe156edd`、`ea396a276`） | 本节 | 有依据。#612 删的 10 条断言，每条都换成把同一句话从轮次材料挪进角色、并在两边各断言一次的写法（例如「不要再委托出去」不在材料里、在角色里）；会议纪要方法从 v1 升到 v2，v1 不再登记，「不覆盖已有文档，除非用户明确要求」保留（BL-147）。#614 删的 5 条是本地 `applyPrologueEvent` 推导的断言，3a 的目的就是改由运行时的投影给回执，新增 26 条断言针对投影；产品子集加了 `tests/prologue-input-claims.test.ts` |
| Prologue #22、#25、#27 | 本节 | 有依据。#22（P2j：只读检查器、Runtime 自己的队列道、零模型）与 #27（撤销持久资源不再逐块写墓碑，Tauri 宿主加 `storage_discard` 命令）只新增，没有删断言。#25（P2k）把工作板的冲突判断从整张板改成按节点：删掉的两条断言是「同一张板上第二次写入被拒」，换成「不同节点的两次写入都成功、同一节点用旧版本写入仍被拒（`TASKBOARD_CONFLICT`）」。依据是用户 2026-10-14 在 X5 里选的 B（一个项目的编码会话共用项目工作板，记在 Prologue 的切片文档与决策记录） |
| 本线自己的 #550、#565、#572、#579、#582、#584、#587、#593、#600、#604、#606、#607、#611、#617 | 统筹逐个审过 | 门禁只降：#611 用完的 `APPROVED_CEILINGS` 按 #584 的做法删掉，机制留给回执 3c；#604 把读样式拆成每片约 1 秒，没有加时限。各自的证据记在 §W4-12、§10.x 与 PR 描述里 |

**在途 6 个（2026-10-17 的 head）**

- #616（`eccd952`，本线）：修 N-03、N-04、N-05，见 §10.19。
- #618（W3-B2，`8afb521f0`）：情境条显示要放到哪里，选区浮条在助理面板盖住时让开。
  - 没有删断言，新加 16 条；页面资源五项都只降。
  - 依据是情境线的 L-1～L-3 与重叠规则（`specs/context-program`）。落点只在对象被加进这次发送时才出现（L-1），不会在没有 + 的情况下把文档内容交给模型。轮次只有在对象的主人重新读到这个对象之后才得知落点，而且是以事实的形式告诉它。
  - 选区读取跳过助理回复的部分，记为 BL-149，没有偷偷补上。
- #619（`d44296e`，本线）：W5-05 第 2 片，见 §W4-12。
- #620（`acefbac35`，AC-27-6，D35）：数字题在输入框旁和错误里都写出单位。删的 3 条断言都换成更严的：schema 多带 `unit`；错误文字写成「不能超过 120 分钟」；输入框的 `aria-describedby` 同时指向单位和错误槽位。
- #621（`47b63d477`，采用线 §6.0g）：业务网关不再改写模型写错形状的参数，形状不对就在评审之前按合同拒绝。
  - 删的 13 条断言是「网关会改写」的旧行为，换成 21 条「拒绝并给出合同、同样的字段放进 `input` 里才评审」的断言。这是有意收紧，不是放宽。
  - 依据：用户 10-16 的决定（`specs/prologue-adoption/spec.md` §7.7「用户 10-16（§6.0g）」），以及「模型能力问题不打补丁」（用户 10-16）。§6.0f 给工具带上类型之后，30 次调用里只剩 1 次需要改写。
- #622（回执 3c，`fc3931994`）：Coding 与助理共用一个回执组件。
  - 重新加了 `APPROVED_CEILINGS`，只有三条：arrival.css 与 workbench.css 各 +2,062，workbench.js +4,110；coding.js −524。
  - 都在用户 10-16 弹窗批准的数之内（`specs/ai-input-receipts/spec.md` D25：+2,062、+2,062、+4,113），每条只认 merge-base 上的一个确切字节数。
  - 删的 20 条断言随旧回执条一起换掉，新增 41 条。旧断言保证的几件事都有新的断言对应：本人的任务和其他宿主说明没有回执；「读到不代表已遵循」是正文文字，不是悬停提示；第一次绘制和没变的重绘都不播报；补充每前进一步只播报一次；同一输入编号带进下一轮时，两轮各有自己的回执，不轮流播报（RCPT-312，D28）。
  - baseline 只降（Coding `client.ts` 少 1 行）。

**组合效果**

- 两两之间只在数字文件上重叠：`tooling/gates/page-assets.json`（六个里有五个都改它），以及 #616 与 #622 都改 `tooling/gates/baseline.json`。每个都能干净地合进 main。
  - 先合 #622 再合 #618：代码文件 `apps/workbench/src/scripts/client/assistant-island.ts` 与 `craft-finish.ts` 能自动合并，冲突只在 `page-assets.json`。
  - 两者都改助理面板的页面脚本，所以后合的那个要在合并结果上重跑助理面板与情境条的浏览器用例（`tests/assistant-*.e2e.test.ts`、STRIP-04/05、CTX-COVER-01、RC-14/15）。
- #622 的放行条目按 merge-base 上的确切字节数认，现在认的是 810,350 / 1,688,608 / 1,097,604。#616、#618、#619 里任何一个先合，基数就变了，条目对不上，门禁会拒绝。到那时 3c 要在新的 main 上把同样的增量重新对到新的基数上。增量和用户批的数一样，不算新的放行。要是增量变大，就要回去问用户。
- W5-05 后面几片（v2 已在本地做完，接着是 v3、calm-desktop）都叠在 #619 上，只降样式表字节。和 3c 的 CSS 增量不在同一处：3c 加的是共用组件的规则，W5-05 删的是旧皮肤。所以两边谁先合都只需要重新量，不需要挪规则。
- 取消与授权语义：#606（S-29）合入后，`agent.offers.run` 把调用自己的 `signal` 交给动作，取消在核对之后到来时什么都不执行。在途 6 个里，只有 #621 动到动作调用路径，它只在评审之前多拒一类输入，不改变被取消、撤权、停用之后的处理。
- AI 调用链：在途的改动没有在 `horizontal/agent-host` 之外调模型，也没有新增生产 AI 入口（`ai-entry-inventory.md`）。#621 删的是网关里的改写，调用仍走动作服务自己的输入检查。

**剩下的**

- 在途 6 个由统筹排全量、合并。
- W5-05 还剩 v3、calm-desktop 两片：v2 那片已在本地做完、正在跑受影响用例，下一个 PR 会写进 §W4-12。
- `renderPluginRailAccountFooter`（`apps/workbench/src/settings-directory.ts`）没有调用方，已作为单独任务提出来。
- 第 4～6 波路线图里尚未开工的条目照 §12 的状态推进，这一节不改任何目标。

### 10.22 2026-10-17 合入与在途 PR 的独立复查（§10.21 之后：#618～#633，Prologue #26、#33）

对照的仍是第 1 节列的六份原文与九份补充，看法同 §10.21：门禁数字、兼容逻辑、删改的断言与调大的时限、可信身份与取消语义、改动的依据。合入的 PR 按**合入时的 head** 看：评审之后又加的提交单独看过，不只看评审时的那一版。

**已合入**

| PR | 合入的 head | 裁决 |
| --- | --- | --- |
| #618（W3-B2，情境条的落点） | `7044125be` | 有依据。合入的 head 就是 §10.21 之后评审过的那一版；页面资源只降。 |
| #619、#624（W5-05 第 2、3 片，本线） | `a793f53df`、`d03c44fd6` | 有依据，记录见 §W4-12。#624 冻结后并过一次 main，没有改代码。统筹说明：「后合的只并 main、不重跑全量」只适用于已经跑过全量的 PR；#624 冻结后没跑过全量，所以照跑。 |
| #625（visual-surfaces 的时限） | `5b4bca52a` | 有依据。整条用例的时限 600→1,200 秒，每个面拆成子用例、各 180 秒，慢机上失败时报出是哪个面。只调时限，按用户 10-15 的决定（慢机时限可放宽，不算放宽断言）。 |
| #626（采用线 A5，补 §6.0b 第 2、5 项的证据） | `23e591ec4` | 有依据。只加用例，不改源码。两条都做了变红对照：去掉 PPT 的 `beforeDispatch`，三条变红；修改回执的位置早于被压缩的那次读，所以能留下来只靠效果种类。把 `change-capability` 改成 `safe-read` 的那次对照没有算作证明：它失败在等审批超时，不是回执断言。spec 里写明了这一点。 |
| #627（Coding 协调者拿 board-read 与 board-report） | `cd80c9b07` | 有依据。合入的 head 就是评审过的那一版，加一次并 main。 |
| #628（回执 B，补充带上自己的键） | `d894fc01a` | 有依据。评审过的是 `15941159f`。之后除了并 main，只有 `14c173333` 一个提交：RC-09 的期望加上 `key: "send.c1"`，并新加一条 RC-17 断言（补充带过去以后保留原来的键），断言只变严。 |
| #632（人改一轮的计划：从 typed 能力改成动作） | `8086f81d4` | 有依据。 |

#632 的细节：
- typed 的 `agent.run.step-board.amend.v1` 换成动作 `agent.collaboration.revise.v1`，依据是防腐决定 #1 与采用 spec §4.6.9。
- 宿主能力（typed）少一处，旧 id 不留别名，符合现在不留兼容期的规矩（`docs/system/CONTRACT-CHANGES.md`）。
- 操作者取调用的插件，没有就取会话的主人，不从输入读。
- 写之前先过 `beforeEffect` 和授权检查，Coding 的路由经动作服务调用。
- vendored 包换成 `reference-kinds`：旧包删掉，`.sha256`、来源记录与 `patch-history.json` 同步，`SECURITY-INVARIANTS.md` 的 S-13 改指新包。

**Prologue**

| PR | 裁决 |
| --- | --- |
| #26（P2i 的消费者脚本） | 有依据。P2j 之后，接续的材料从步骤所属的会话里取，脚本里伪造的会话引用因此被记成 `SESSION_NOT_ACTIVE`。改法是步骤改属 `runtime.sessions.create()` 建出的真实会话，断言原样保留，SDK 代码不动。 |
| #33（引用题可以列出要的对象种类） | 有依据。Molis 这边经 #632 的 `reference-kinds` 包接入。 |

**在途**

- #629（手册线 D1②，没改东西的一轮按事实核对收尾）：
  - 评审时发现收尾核对的提示词 `ENDING_REVIEW` 没有登记，不出现在 设置›提示词，也不进冻结记录。
  - 统筹定按 compaction 的先例登记。现在的 head（`ae0768b6c` 起）把它登记为 `assistant-ending-review` v1，`agent-definitions.ts` 把它和 compaction 一样排除在角色的提示词之外。
- #630、#633（本线）：见 §W4-12 与 #633 的说明。#633 修机器槽位的饿死：一张写了一半的票被别的等待者当成死票删掉，主人就永远排不到。
- #631（统一输入与本地语音，外部作者）：有三处违反，统筹经用户同意，已作为 PR 评论交给作者。
  1. `design-system` 承担了产品行为：草稿存在 localStorage、助理会话的键、`/api/local-voice` 路由、发送结算。这违反它 README 的「不负责」。
  2. 改了 `DESIGN.md` §366–374 写明的行为（桌面 28px 的例外与逐级折叠），并改了触控尺寸的断言，却没有改 `DESIGN.md`。
  3. 两处 localStorage 读写没有包 try/catch；local-host 有没人用的导出。
  - 安全没问题：新路由在 `refuseForeignRequest` 与 `authorizeLocalWebRequest` 之后。
  - 它与 main 冲突，CI 没跑。
  - 用户的裁决：由作者二选一，一是改 `DESIGN.md` 并删掉 `data-crowded` 那段代码，二是保留原行为与原断言；作者选了以后用户确认。本线不改 #631。

**组合效果**

- #632 换了 vendored 包，并改了 `horizontal/agent-host` 的 7 个文件；#629 也改 `horizontal/agent-host`。#629 现在的 head（`ffecda928`）不含 #632：它和 main 能干净合并，但它自己的用例是在旧包上跑的。所以 #629 跑全量之前先并一次 main，让全量在新包上跑（已告诉统筹）。
- 页面资源按 #619→#624→#630 一次一个降；下一个是 T2，排在 #630 后面。
- #618、#622、#628 都改助理面板或回执的页面脚本，按合入顺序各自在合并结果上重跑过。

**本次复查顺手查出、交给后续的**

- `chrome-inner-scroll.test.ts` 还断言 `body.settings-page[data-desktop-shell="true"]:is([data-settings-section="projects"], [data-settings-section="project"]) .settings-content { grid-column: 1 }`。两份设置页的 body 都写死了 `data-desktop-shell="false"`，所以这条规则从来不生效，和 W5-05 第 5 片删掉的那条是同一类。别的层里 `body.settings-page[data-desktop-shell="true"]` 开头的规则还有好几条（`> .topbar`、`.project-context`…），都是死规则，等 W5-05 删完皮肤后一并清（不在本片的范围里）。（10-17 已删，见本文开头的「W5-05 收尾」一行。）

### 10.23 2026-10-17 合入与在途 PR 的独立复查（§10.22 之后：#630、#634～#646，Prologue #34、#35）

对照的仍是第 1 节列的六份原文与九份补充，看法同 §10.21：门禁数字、兼容逻辑、删改的断言与调大的时限、可信身份与取消语义、改动的依据。合入的 PR 按**合入时的 head** 看。

**已合入**

| PR | 合入的 head | 裁决 |
| --- | --- | --- |
| #636（改用 Molis AI 合作源码许可） | `655ef24ad` | 用户本人的决定。根包与各包的 `license` 改成 `"SEE LICENSE IN LICENSE"`，其中 `plugin-sdk` 与 `contracts` 原来是 MIT：外部插件作者装的就是这两个包，所以许可的变化对作者可见。 |
| #640（归档许可 spec） | `5ef9d6217` | 有依据。只改 `specs/README.md` 索引和归档 spec 的状态句。 |
| #633（机器槽位的饿死，本线） | `63d102824` | 有依据，说明见 §10.22。 |
| #637（P4 助理：每个 Work 一块任务图，子任务是图上的一步） | `82f3ddbf2` | 有依据，有一处待修（见下）。 |
| #641（vendored 包换成 mcp-refresh，Prologue main `e69b71cf`） | `62d14f828` | 有依据。旧包 `reference-kinds` 删掉，`.sha256`、来源记录、`patch-history.json`、`SECURITY-INVARIANTS.md` 与 `workspace-packages.mjs` 同步。 |
| #642（Companion 用例的假宿主） | `e3518507c` | 有依据。只改 fixture 一行：假宿主像没有任务图的宿主那样回答 `agent.collaboration.await.v1`（`agent.capability_unavailable`），Coding 的唤醒循环在那里结束，不再在拍下输出之后重试。断言不变，产品代码不动。 |
| #630（W5-05 第 4 片，本线） | `77cbbaa17` | 有依据，记录见 §W4-12。统筹审过最后的 head 并跑了全量。按 squash 合入。 |
| #638（T2：引用题按名称找对象） | `86b77ad25` | 有依据（见下）。 |
| #639（回执 C1：排着的补充显示在 Coding 对话末尾） | `7b3fd68a6` | 有依据。断言只加：RC-18 的单测、e2e，以及恢复读里的 `queued_inputs`。`baseline.json` 只降（插件包名在包外被点名的文件少 2 个）。`coding.js` 降 37,805 B。 |
| #644（采用 SDK 的等待；工作图的接续只认领一次） | `5f078dae9` | 有依据。vendored 包换成 `app-tools-waits`（Prologue main `86be9891`，#35）：来源记录、`patch-history.json`、`SECURITY-INVARIANTS.md` S-13 同步。P4 工作图的绑定原来每轮用新随机键，等待满足后旧接续一直可认领，宿主会反复接续；现在复用 `eligibleContinuation`，PA-23 改成在项目图和工作图上各跑一遍。活动列表不显示 `board-wait` 这个工具原名，依据见采用 spec §6.0l。**合入时没有跑全量**：用户账号（yijunw0212，Codex 那条线）09:17Z 把它放进合并队列，统筹 09:19Z 才加 `full-suite` 标签，09:23Z 合入。换 vendored SDK 算共享核心，按规矩应先跑全量；它的全量（run 39020694821）在合入后补跑作证据，有红的在 main 上修。 |
| #645（记忆整理用例的假时钟） | `fba03a953` | 有依据。原来钉的是固定日期 2027-01-15。到 2026-10-17 这一天，它离条目的写入时间已经不到 90 天，用例就红了。现在改成从条目自己的写入时间往后推 91 天，「90 天没用过的自动记忆关掉」这条断言的含义不变。 |
| #646（Linux 探针用例等 pid 本身） | `daeccec3b` | 有依据。pid 文件写了一半时读到的是空串，读成 0 就会指向本进程组；现在读不到正整数就不算，并加了一条断言：用例确实写下了它起的进程的 pid。 |

#637 的细节：
- 依据：采用 spec §6.0k，统筹 10-17 定的五条，其中第 1、4 条由用户在弹窗里定。
- 存量：子 Work 的 `delegated_by` 从 `{ work_id, … }` 改成图与步骤，`follow_ups` 删掉、改从图上数。旧形状不读；按用户 10-17 第 4 条，由 A4 合入前的一次性脚本改；真实 Home 在用户同意前不碰。这符合「只认现行取值、存量由维护改」。
- 公开视图 `AssistantWork.delegated_by` 不变，`work_id` 从图推出来。
- 合同：`AgentCollaborationPort` 加可选的 `works`，加两个类型，API 快照已刷新。
- 门禁：`baseline.json` 只降（`assistant-service.ts` 2,058→2,054 行，类 1,643→1,640 行，脚本常量 130→129）。
- 断言只加不放宽：WG-01～04，是新加的四组断言；原来对子 Work 自己 `follow_ups` 的断言，改成对父工作看板上的计数。
- 人结束一步时，`actor_id` 取服务自己的 `actorId`，不从输入读。
- **待修（已交统筹转采用线）**：用户在一个已交回的子任务里再发一轮时，`assistant-service.ts:1514` 先 `delegations.place(work)`，在图上加一步 `<part>.rN`，然后才 `assertSendCurrent` 和 `host.start`。如果这一轮没开起来（被后一次发送取代、Character 版本被拒、没有模型），catch 分支不结束这一步。于是图上这个子任务一直「还在做」：父工作不再自动交回，它一直占一个并行名额，`follow_up` 也被拒，直到用户在里面成功跑一轮。以前判断「还在做」看的是 run 的状态，一轮没开起来就不算。委派时第一轮起不来的情况，`delegate` 的 catch 会结束那一步，没问题。

#638 的细节：
- 依据：交互 spec D36、AC-28。引用题不再由卡片列出候选，改成人输入名称、经 `search.references` 搜问题要的那几类对象。
- 删掉的断言都有替代，属于有依据的行为变化。
  - 「卡片上不出现问题没要的那类候选」改由 S-26 的新用例证明：搜索只给问题要的那一类。
  - 「提交了别的种类」原来报 `kind-not-allowed`。现在由宿主在答案交出去之前拒绝，模型什么都收不到。页面传来的标签不会进答案，进答案的是对象主人此刻给的标签。
  - `SECURITY-INVARIANTS.md` S-26 和它的拒绝用例同一个 PR 改了。
- `coding.control-run` 升到 v5（值可以是选中的对象），v1～v4 都被拒，符合 `CONTRACT-CHANGES.md`。
- 页面资源：`page-assets.mjs` 加了一次性的 `APPROVED_CEILINGS`，每条只认合并基点 `aabf597d` 的一个准确数字。批准的是上限：workbench.js +4,090，workbench.css 与 arrival.css 各 +1,344，settings.css +19（用户 10-17 批准、由统筹转达，做法同 3c：#541、#584、#611）。实际涨的、也是条目钉的上限（对合并基点实测）：workbench.js 1,101,126→1,105,163（+4,037），workbench.css 1,624,532→1,625,858（+1,326），arrival.css 744,923→746,249（+1,326），settings.css 1,034,948→1,034,967（+19）。`page-assets.mjs` 的注释写的仍是批准的 +4,090、+1,344；按注释，下一次改这个门禁时连同条目一起删掉。
- 和第 5 片的交集：两边改 `page-assets.json` 的同一几行，后合的那个并 main 以后按实测重钉（统筹定的顺序）。

**Prologue**

| PR | 裁决 |
| --- | --- |
| #35（App-tools 的只读外部等待） | 有依据。只对绑定了当前持有节点的顶层 App-tools 运行开放 `board-wait`，只认 App 的只读外部检查器。命令、信封、节点和待答问题这几种条件，在读目标之前就拒掉。没有新的等待循环和存储。Molis 经 #644 接入。 |
| #34（MCP 在现有连接上刷新能力） | 有依据。`Runtime.refreshMcp` 只在还连着、还是同一条连接时用完整的新快照替换，失败或晚到的保留上一份；调用改按注册表里当前的工具形状核对，刷新后旧形状或已去掉的工具在发出前被拒，只变严。Molis 经 #641 的包接入。 |

**在途**

- #634（半途的一步不再让下一次读错事实）：统筹评审之外我加了两条，已由统筹转给作者。① 一个打不开的库会挡住之后每个项目的调度器（统筹定为必修）。② 孤儿对象移回失败时不留记录，建议带 `cause` 记一笔。
- #629、#631 见 §10.22。
- #637 那处待修的：统筹在 main 上核过，属实，已交采用线单开小修复 PR（排在 A2 前面，带上那条用例）。写这份记录时这个 PR 还没开。
- #643（回执 D1）新加 BL-153：affected-tests 漏选读合同字段的用例。W5-05 第 4 片撞上的「按选择器断言样式表的用例选不到」是同一类，统筹定合进 BL-153，第 5 片在 #643 合入后补上，不另开一行。

**组合效果**

- #637 与 #632 都改 `horizontal/agent-host` 的协作口：#632 加 `revise`，#637 在同一个对象上加 `works`。合入顺序是 #632 先，#637 的 head 包含它。
- #641 与 #644 在同一天先后换了两次 vendored 包（mcp-refresh，再换 app-tools-waits），每次都删了旧包、补了来源记录。#629 的全量要在 #644 的包上跑。
- #637 与 #644 都改 `prologue-work-graphs.ts`：#644 补上了 #637 漏掉的接续请求键。#637 那处 `place` 的待修与它无关，还开着。

### 10.24 2026-10-17 合入的独立复查（§10.23 之后：#629、#647、#648、#650，Prologue #36）

看法同 §10.23。合入的 PR 按**合入时的 head** 看。

**已合入**

| PR | 合入的 head | 裁决 |
| --- | --- | --- |
| #647（§10.23，本线） | `4d926fc60` | 只改 spec。统筹审过最后的 head。 |
| #629（D1②：一轮什么也没改时，按事实核对它的收尾；内部标识用宿主给的那些） | `a480533bc` | 有依据，见 §10.22。**合入时没有跑全量，最后的合入也没有经统筹评审，也不在统筹定的顺序上**：用户账号（yijunw0212）10:49Z 把它放进合并队列，10:57Z 合入（`8f4c9173a`），不是统筹合的，是哪个会话或谁操作的看不出。`a480533bc` 是 main 有 #637、#641、#644 之前的旧 head；统筹原先定的是等 main 含 #637、#641 以后由手册线并 main、重跑、把 head 交统筹。合并队列的 Verify 在合并结果上跑过、通过。合入后的证据同 #650：main `c276ab9cb`（含 `8f4c9173a`）的全量 run 39027427145。收尾核对的提示词由主人登记，不加措辞清单（用户 10-16「模型能力问题不打补丁」）。 |
| #650（采用带标注的 SDK 工具，经共同的动作目录） | `09e94dcf3` | 有依据，有一处记录（见下）。**合入时没有跑全量，也没有先经统筹评审**：用户账号（yijunw0212，Codex 那条线）11:05Z 合入，没有 `full-suite` 标签。这是 10-17 第三次换 vendored 包（`app-tools-waits` → `mcp-schema-annotations`，Prologue main `d2b3daa3d`，#36），算共享核心。统筹合入后审过，全量（run 39027427145，main `c276ab9cb`）在合入后补跑作证据，有红的在 main 上修。 |
| #648（子任务里一轮没开起来时，结束为它加的那一步） | `2fe1224fe` | 有依据。修的是 §10.23 记的 #637 待修，带 `full-suite`。留一处余项，记为 BL-154。 |

#650 的细节：
- 上游 #36：校验用的副本只去掉 `default` 和顶层 `x-mcp-header`；未知或写错的标注直接拒绝；参数在派发之前核对，报错不回显值。
- Molis 一侧：`mcpInputContract` 先经 `mcpActionInputSchema` 去掉 `x-mcp-header`。标注只认合法的头名，只用在 `string`、`integer`、`boolean` 上，头名不分大小写不得重复；不合的，整个工具标成 `actions.schema_unsupported`，不放行。`default` 留在动作合同里：它不是约束，派发时也不会被填进参数。`tests/external-mcp-dispatch.test.ts` 的工具改成带 `default` 和 `x-mcp-header`，原有断言（重查授权、取消、恢复）不变（PA-MCP-01）。
- 记录：来源记录、`.sha256`、`patch-history.json`（无补丁的包 23→24，核对过的上游提交 33→34）、`vendor/prologue-sdk/README.md` 同步，旧包删掉。
- 同一条规则写了两份：SDK 的 `mcpToolInputSchema` 与 Molis 的 `mcpActionInputSchema`。Molis 另写一份，是因为只有 `horizontal/agent-host` 依赖 SDK。记为 BL-155：由 agent-host 导出 SDK 的校验副本，或写明两份怎样保持一致。

#648 的细节：
- `AssistantDelegations.startPlaced` 包住开始这一步：开始失败时，为这一轮新加的那一步由持有它的会话结束，备注「这一轮没有开始」；沿用的步骤不动。结束本身失败时吞掉，让原来的错误交给调用方（PR 写明了，这时这一步照旧开着，和修之前一样）。
- 一轮向宿主要什么（项目、会话、角色、材料、图片、预算、浏览器、Character）挪到 `assistant-round-start.ts` 的 `roundStartInput`，字段和条件都没变。`baseline.json` 只降：类 1,640→1,629 行，文件 2,054→2,041 行。
- 断言只加：`W2-18-DELEGATION-PLACED-01` 证明没开起来的一轮不留开着的步骤，之后还能交出满额的三个子任务，三个交回后父工作照常被交回。PR 写了去掉修复后在哪一条变红。
- 余项（BL-154，统筹 10-17 定为不必修，归采用线）：沿用的步骤不归沿用它的那一轮。前一轮加上 `.rN`、还没失败时，同一会话的另一轮读图见到它开着就沿用；前一轮随后失败，就把后一轮正在用的这一步结束了。要同一个已交回的子任务上同时来定时发送和人发的消息（定时那条作废），或两轮同时发、只有前一轮的 `host.start` 临时出错，窗口很窄。修法：结束之前再读一次图或 Host，这一步上还没开始过任何一轮才结束。

**Prologue**

| PR | 裁决 |
| --- | --- |
| #36（MCP 参数标注与严格派发） | 有依据。见上文 #650 的细节。只变严：未知的标注拒绝，参数在派发之前核对。 |

**组合效果**

- 10-17 一天换了三次 vendored 包（#641、#644、#650）。#644、#650 与 #629 合入时都没有全量，#629 和 #650 的最后合入也没有经统筹评审，都由 `c276ab9cb` 合入后的全量补证据。
- 此后的规矩（用户 10-17 在弹窗里定，统筹转达）：**所有合入都经统筹**，Codex 线和用户自己的 PR 也一样。PR 号先交统筹，由统筹评审、加标签、跑全量、入队。绕过统筹合入的，统筹事后复查，在 main 上跑全量作证据，并通知要变基的线。在途的 PR 要在 `mcp-schema-annotations` 上重跑全量。
- W5-05 第 5 片要并 `c276ab9cb`（含 #629、#648、#650）。这三个都没改样式，三份样式表在 `7a55444fd` 与 `c276ab9cb` 上逐字节相同。

### 10.25 2026-10-17 合入的独立复查（§10.24 之后：#649、#651、#653～#655、#657～#660、#662、#663、#666、#668，Prologue #37～#39）

看法同 §10.23。合入的 PR 按**合入时的 head** 看。

**已合入**

| PR | 合入的 head | 裁决 |
| --- | --- | --- |
| #653（侧栏用例：被拒页面的读取容得下还没有 `body` 的文档） | `2912423e8` | 有依据。只改测试：`document.body?.`，那一刻的断言强度不变。无标签（只改测试），经统筹合入。 |
| #651（W3-B3：分屏里的 Pages 也是落点；每个窗格的框都标出主人） | `c942bb4b1` | 有依据，带 `full-suite`。S-30 变严：打开设置只认窗格框发来的、且在任何同源窗口之前。所有窗格 iframe 都带 `data-pane-owner`（`tab-workspace` 两处）。craft-finish 只改脚本（问候语）。没有删测试行。页面资源只降（workbench.js −1,261）。 |
| #655（交互：插件怎样提问、建议、引用；AC-12 用例） | `779131e66` | 有依据。文档加用例，断言只加，`ci-product-subset` 加一行。 |
| #657、#658（手册线 C2、C3：生成插件的提示词说什么是好回答；炼金术士的交叉核对问判断与依据） | `24919bbe9`、`88b331668` | 有依据，都带 `full-suite`。提示词去掉固定的数量与长度，合用户 10-16「模型能力问题不打补丁」的规则；MiniMax 评测记在 PR 里（151 次调用）；schema 要求的那一句留着。 |
| #649（回执 3b-1：收回模型还没看到的补充；纠正指明它针对哪一条输入） | `be6d66a99` | 有依据，带 `full-suite`。`agent.inputs.send` 的形状变了（加 `about`），按 `CONTRACT-CHANGES.md` 升到 v2（快照删 v1 行、加 v2 行）。新的 `agent.inputs.withdraw.v1` 先 `requireRun`，运行时不支持就报 `capability_unavailable`，`fresh(call)` 之后才撤，撤之前再 `assertAuthorityCurrent` 一次。错误码 `agent.input_applied`、`agent.input_not_queued` 经 `defineErrorCodes`，类别 conflict。`baseline.json` 只降（`prologue.ts` 967→966），API 快照同步。 |
| #659（AC-08：两处回答同一个问题只收一个） | `0189d3785` | 有依据。只加用例与文档。AC-07 的重启缺口照实记为 BL-156，没有用用例盖过去；新用例进 `ci-product-subset`。 |
| #660（BL-150：助理回复里选中的一段可以拿在手上，放进左边的落点） | `4829741fb` | 有依据，带 `full-suite`。门禁数字只降：workbench.js −529，空 `catch` 136→134。 |
| #663（BL-156 设计：一个待答的问题撑过宿主重启） | `93c2a69a5` | 有依据。只改 spec（`ai-interaction-experience` §15.9）。走上游的恢复操作（`sessions.answerInterrupted`），不续跑工具调用；身份与权限在回答时从调用上下文取，和开一轮的前置检查相同；`control` 的回答结果要说明需要一轮，这是合同变更，设计里写明了；两处待评审的点（执行器怎样放手而不写 `cancelled`、一次 `commitBatch` 能否同时跨两本账）照实列出。 |
| #662（本线，W5-05 第 5 片：删 `calm-desktop`） | `177abcf56` | 统筹审过最后的 head。自查时发现 squash 把已删的 `settings-desktop-shell.ts` 带回来了，在 `4c7c243bc` 修掉；统筹第一轮评审也没看出来。之后每次并 main 都核对这一片删掉的三个文件仍然不在。 |
| #654（采用线 A2：工作经 SDK 的等待与接续等它的各部分） | `41603000b` | 有依据，带 `full-suite`。我审的是 `a02de52e2`；最后的 `41603000b` 只是并 main，`git show --remerge-diff` 没有冲突的改动。去掉的 `handed_back_run` 断言逐条换成对接续状态的断言；每张图的等待串行；加之前先查；挂等待失败就删掉再挂。低处的边：再挂也失败时，没完的部分让根在空等（给调用方报错，之后的交出会重挂）。`publicWork` 展开存着的正文，旧键会漏出来，直到 A4（统筹交给采用线：A4 从合同字段建视图）。 |
| #668（换 vendored 包：Prologue main `24e69083`，含上游 #37、#38） | `662a7b62e` | 有依据，带 `full-suite`。只换包，两个新选项都要显式开、Molis 还没用，行为不变。两次干净 `git archive` 打包逐字节相同；旧包与记录删掉，`patch-history.json`（换下的包记为无补丁包的第 25 项，核对过的上游提交 35）、README、`SECURITY-INVARIANTS.md` S-13（#650 漏改的旧包名）同步。健康门禁仍是 1 份 vendored SDK。上游 #39 不在这个包里，随下一次换包进来。 |
| #666（本线，W5-07：网页分发改成有序的路由表） | `3137b5ee4` | 统筹审过最后的 head（并 main 之后 20 个文件、+1774 −463，与审过的一致）。123 个请求的路由快照在 main 上生成，重构后原样通过；巨大单元 139→137。 |

**Prologue**

| PR | 裁决 |
| --- | --- |
| #37（`afterwards: "end-step"`，只给 `by: "app"` 的等待） | 有依据。等待不带接续，这一步跟着等待的结果结束；不往会话写字；有这种等待的步骤拒绝 `beginAttempt`；重开时对账。只加，旧的等待不变。 |
| #38（一跑开始时可以自带引用种类表） | 有依据。只加，用同一个 `freezeReferenceKinds` 校验，坏表在任何模型请求之前以 `AGENT_START_INVALID` 失败；子代理继承。 |
| #39（交接时把结束这一步的等待一起丢掉） | 有依据。一行：没有活着的接续时返回去掉 `wait` 的节点。核过：带接续的等待结算时已经把 `wait` 从节点上拿掉（`taskboard.ts` 结算一处），所以「没有活着的接续却还拿着等待」只剩结束这一步的等待，PR 的说法成立。AWE-06 加了交接，改回去就红。Molis 还没采用。 |

**交接时的暂停状态，现在的事实**（`.claude/handoff/anti-corruption-handoff-2026-10-14.md` 第 4、5 节；10-17 核对）

- 第 108 轮全量（冻结头 `c2017a9ac`）已经跑完，没有续跑：状态文件里健康检查 exit 0（10-14 15:39Z），全量 exit 1（10-14 18:27Z），6,750 项里 6,606 通过、135 失败、9 跳过、0 取消。上文 §12 的「108 进行中」与「暂停交接」两段到此有了终态。
- 那 135 项失败没有在 108 的树上逐条裁决，改由修复树 F109 收：交接时 F109 的三个未提交测试文件（`pages-publication`、`ppt-mcp`、`project-deletion-service`）在 `8ddab2a95` 提交，F109 整树经 #523（`b0b167ffe`，带 `full-suite`，10-15 合入 `f74e29d86`）进 main；F109 之后的 Linux 修复 `178ee5bec` 的内容随 #529（`414f61b44`）进 main（`W2-18-ALCHEMIST-UI-01` 等用例在 main 上）。此后的共同证据是 CI 上 16 分片的全量（#524），不是 108。
- 两个暂停时的工作树（I8 冻结树、F109）都还在、都干净，没有未提交的改动。

**组合效果**

- 带 `full-suite` 的都跑过全量；#653、#655、#659、#663 没有标签，只改测试或文档。合入都用同一个账号，从记录上分不出是不是统筹合的，这一段没有发现绕过统筹的迹象。
- 真实 Home 的库版本（RAC-13）：10-17 只读核对时发现 Pages 库是 1、代码要 2。`0ff3adb8a`（10-13，直接提交到 main、没有 PR）升了版本，检查清单第 3 节写了，却没有进维护清单和待办。补法是 #676（已合，`eb421d335`）：§4.1 的「库版本维护清单」与门禁 `scripts/gates/store-versions.mjs`（版本对 merge-base 变了却不在清单里就失败），Pages 记为 BL-157、随维护八做。
- 写这一节时在途、已审，开 PR 前已合入的两个：#665（BL-154 的修法，叠在 #654 上；合入 `476c08931`，head `72db37a47`）只结束仍是 `ready` 的那一步，核过一步从 `ready` 到 `running` 只发生在一轮真的开始时，所以「仍 `ready`」就是没有一轮开始过；剩下的窗口 PR 照实写了。§10.24 写的「统筹定为不必修」与 #665 写的「统筹 10-17 选的修法」不矛盾：修法是统筹定的，做不做后来由统筹排进了采用线。#664（W3-A3a；合入 `bcb304cd1`，head `9b43af194`）页面传来的 `work_id` 只当指针，宿主的四条拒绝原来就有，本 PR 补用例；顺带删了手机标签切换的死处理器（`bc79f8a49` 起没有对应的标记），有依据，但不在 W3-A3a 的范围里，合入时记一句。两个都按上面的合入 head 在下一节再看。

### 10.26 2026-10-17 合入与在途 PR 的独立复查（截至 main `4b063bf98`；含已合入 #667、#669、#671、#672、#674、#677、#679、#682）

看法同 §10.23。合入的 PR 按**合入时的 head** 看；合并提交用 `git show --remerge-diff` 看冲突是怎样解的。2026-10-17 提交前复核了下表新增合入项及 #681 的编号修正；其余在途行保留最初审阅的 head，不把后来推送当成已经复核。新开的 #683～#685 不在本节审阅范围内。

**已合入**

| PR | 合入的 head | 裁决 |
| --- | --- | --- |
| #665（BL-154：没开起来的一轮只结束还没有一轮开始过的那一步） | `72db37a47` | 有依据，带 `full-suite`。核心在 `427c898ec`：`end` 加可选的 `if_ready`，状态检查与结束对着同一次同步读图，中间被一轮接走的那一步留给那一轮；合同字段是可选的，API 快照同步。最后一次并 main（`72db37a47`）的冲突解法：`agent-collaboration.ts` 留 `if_ready` 的那份说明，`prologue-work-waits.test.ts` 留 DELEGATION-PLACED-03，`BACKLOG.md` 删掉 BL-150（#660 做完）与 BL-154（本 PR 修完）两行，都合法。 |
| #664（W3-A3a：页面上选的写动作，卡片放进拿着这个对象的工作） | `9b43af194` | 有依据，带 `full-suite`。两次并 main（`cbc812f15`、`a90f2e10a`）只碰 `baseline.json`、`page-assets.json` 与 context-program spec：spec 两段都留，只换了先后；门禁文件先取 main 的数，最后的 head 把 workbench.js 降到 1,099,839（比合入前的 main 少 3,210）。 |
| #670（运行控制的失败，用 Agent 的话交给调用方） | `6da1670a8` | 有依据，带 `full-suite`。SDK 错误码只在一处（`controlFailure`）映射，码表写成 `Partial<Record<PrologueErrorCode, …>>`，SDK 加码时编译器看得见；普通错误给通用的一句；`control()` 的路径只抛 `agentErrors`。没有调用方再按 SDK 原码分支（agent-host 自己的 `codeOf` 只在 `prologue-inputs` 内部用）。测试的假实现改抛 `PENDING_EXPIRED`，断言不变。 |
| #676（本线：库版本变了就要在维护清单里有一行，BL-157、RAC-13） | `d9b5073dd` | 只让门禁变严：新加 `scripts/gates/store-versions.mjs`，读不了表时以 exit 2 失败（失败即关）；没有放松别的规则，新用例进 `ci-product-subset`。没有标签：不改产品代码。 |
| #678（本线：§10.25） | `9cef9900a` | 只改本 spec。 |
| #667（回执 3b-2a：从回执撤回与纠正；`coding.runs.control` v6） | `e403929a4` | 有依据，带 `full-suite`。形状变了就升版本（快照删 v5 行、加 v6 行），不留 v5；唯一钉住它的调用方（助理的 Coding 客户端）同 PR 改到 v6，没有工作流、MCP、Skill 用它。字节放行（workbench.js +5,043、coding.js +684、两份样式表各 +136）由用户 10-17 经统筹弹窗批准，用一次性的 `APPROVED_CEILINGS` 写法，以 merge-base 为键，带有界用例。 |
| #669（「请 AI 重新问」） | `bbb715e1c` | 有依据。复核并 main 的 `b7787fa38`：重新问与纠正输入的检查都保留，发送来源断言从三处改为实际四处；失败时重新问不覆盖人的草稿。材料校验移到自己的文件，限制不变。字节许可按 #667 后的基准重定为 coding.js 374,113→374,297（+184）、workbench.js 1,104,882→1,105,153（+271），#667 的四个起点进入已用名单，没有叠加使用。 |
| #671（回执 3b-2b：共用的未处理托盘；去掉 Coding 的排队条） | `edf3d9a96` | 有依据。删掉的排队条断言换成托盘的断言，并加了「只有一个列表」的反向检查（D38）。复核三次并 main 的冲突：spec 保留两线记录，补充要求的实现与用例保留托盘和逐条说明，资源许可按新基准重定。相对最初审阅 head，末次门禁已改为用户批准的一次性增长：workbench.js +2,838 B，arrival/settings/workbench 三份 CSS 实测 +64/+57/+102 B，均在批准上限内；#667、#669 的旧起点已列为用完。 |
| #672（手册线 C1） | `026d51582` | 有依据。只调整设计指令及说明，要求一个 JSON 对象，去掉恳求格式的话；未改变解析或合同。 |
| #674（ui-review 2.1.0） | `f2caa8879` | 有依据。指令不再列举不要用的格式；并 main 的冲突只在手册 spec，保留 C1 与视觉复查两段证据，没有删掉其中一段。 |
| #677（本线：删设置页的 desktop-shell 规则） | `5f7a1600c` | 有依据。现有设置页不产生对应 body 属性，删除的是不匹配的规则。末次并 main 仅资源数字冲突，保留 main 的 workbench.js 与本片三份 CSS 的实测降幅；三份分别减少 2,357、4,408、4,202 B。 |
| #679（本线：Home 插件路由带项目，S-31） | `4a2dec7fb` | 有依据。路由项目由宿主确认且绑定原控制对象；每次写前重查项目存在、插件显示状态，请求结束后控制失效。新用例覆盖隐藏插件期间的迟到写入及请求结束后再次调用，两个都明确拒绝；没有把请求体里的项目当身份。 |
| #682（回执 3d-1：报告逐条说明补充要求） | `1fd95df53` | 有依据。报告从运行时视图读每条补充的记录状态、模型说法、更正关系与未答问题，不另存副本，不据此宣称生效。人的原话与模型说明使用原有围栏转义；新增用例走真实报告保存、HTML 展示及下一轮材料路径，检查注入标题和 HTML 不能变成报告自己的话。移除的是旧的简略补充列表，原有报告持久化断言仍在。 |


**在途**（按 10-17 晚各自的 head 看；只看依据与回归，合入前统筹再审最后的 head）

| PR | head | 看到的 |
| --- | --- | --- |
| #675（采用线 A3：后台作业是工作图上的一步） | `fc2f7538d` | 有依据。删掉的 12 条断言逐条换成对图上那一步的断言（`untold` 少了 `jobs` 一项，因为作业不再单记）；结果文字去掉了括号里的原始状态（「后台没有完成（failed）」→「后台没有完成」），这是本 PR 的预期变化，不是回归。`assistant_jobs` 留在 2 号基线、不再写：真实 Home 里还在 running 的作业卡要等以后那一片（3 号基线，与维护八同一次安装）结掉。这一条是用户 10-17 在统筹弹窗里选的「以后的一片」，spec 记了。门禁只降（assistant-service 2040→1956，显式 `any` 514→510，workbench.js −55）。 |
| #680（采用线 A4：工作的视图只取合同字段） | `d5cfc2b13` | 有依据，补的是 §10.25 记下的 `publicWork` 旧键外漏：`workView` 按合同字段逐项取，合同加字段时漏取会编译不过。存量改法照用户 10-17 定的 Q2：一次性脚本不进仓库，拒绝在真实 Home 的路径上跑，对真实 Home 的任何一次 `count`、`apply` 都要先问用户。演练用的真实 Home 只读拷贝（Q3，用户同意）里 `assistant_works` 与 `assistant_jobs` 都是 0 行，所以 #675 留下的 running 作业卡在那份拷贝上是空的；装下一个版本前要再数一次。没有删断言，门禁只降。 |
| #673（W3-A3b：拿起结果卡；悬停时落点闪一下） | `8a59b07a1` | 有依据。新的 DOM 事件在 `dom-events.ts` 登记，API 快照同步；门禁与页面资源只降。 |
| #681（交互线 BL-152：每轮按自己项目目录算对象引用种类） | `7a868d819` | 原先审阅的依据成立；提交前复核编号修正：本片已改为 S-32，S-13 的引用、拒绝用例和交互 spec 同步，S-31 留给已合入的 #679。此前的编号冲突已解决；这一行只补核编号与合入 main 的变化。 |
| #634（Cursor：做了一半的步骤不再让下一次读到错的事实） | `02a884aa2` | 门禁只降。现在和 main 冲突（DIRTY），解冲突之后再看最后的 head。 |
| #661（草稿：助理统一接入服务，100 个文件、+9,180） | `90a60c17a` | 方向有依据（`specs/assistant-service-connections`），`@prologue/sdk` 只在 agent-host 里引用，门禁数字只降（巨大单元 140→139、浏览器脚本空 `catch` 136→134）。合入前要补一样：连接库基线 1→2（新表 `connector_observations`，基线遇旧版本「拒绝」打开），它自己的 CHECKLIST 写了「真实 Home 尚未维护，不能直接用新构建」，隔离副本演练过；但它是在 #676 之前开的，没有在本 spec §4.1 的库版本维护清单里加一行，变基后 `store-versions` 门禁会挡下。另新增一份 Home 存放（`CONNECTOR_TOOLS_HOME_STORE`）。`prologue-mcp.ts` 的 `as unknown as` 是改写原有的一行，计数不变。体量远超 `PARALLEL-DEVELOPMENT.md` 的 PR 体量建议，转正前宜拆片；它的 page-assets 基数（workbench.js 1,103,578）已过时，要在新 main 上重量。 |
| #631（草稿，外部作者：统一输入与本地语音） | `8055bedfc` | 有依据。行为变化都写在 `specs/unified-input-voice` §2 的需求里：Enter 换行、Ctrl/Command+Enter 发送（`assistant-dock-ime` 的断言随之改成「Enter 不发送、插入换行；Ctrl+Enter 发送一次」，没有变弱）；作曲条改成多行 textarea。删掉的 36 条断言里，CSS 那些是把字面空格改成 `\s*`，被测的规则没变；回执用例改从实际请求取 `request_id`，「同样的话同一个键、换了话换键、答复后不留待发」三条都在；`touch-targets` 的分步折叠换成「各控件留在作曲条与视口内、44px」，跟随新版面。缺 Chrome 或本机模型时 `t.skip`，仓库里有 20 个文件这样写，属于先例，跳过的原因写明了不算通过。桌面权限只加 `audio-input` 和麦克风说明，spec 记了 codesign 的检查。`home-talk.ts` 的空 `catch` 是把原来读 sessionStorage 的一行改成读 localStorage，计数不变。门禁数字只降。 |

**组合效果**

- 字节放行已按合入顺序消耗：#667 从 workbench.js 1,099,839 增到 1,104,882；#669 从 1,104,882 增到 1,105,153。#671 随后将 workbench.js 增到 1,107,991，三份 CSS 分别增到 703,722、989,962、1,592,790。本线 Todo #684 的 +28 已重定为 1,107,991→1,108,019，并把 #671 的四个起点放进已用名单。后续合入若再改基准，仍须重新构建重定键，不能重复使用旧许可。
- 删掉的断言（#667、#669、#671、#673、#675、#634）都有等价或更严的替换，或者属于本 PR 的预期变化；没有找到为了变绿而放宽的。
- 结论：这一批没有找到无依据的回归，也没有把已清理的问题带回来。原先的编号冲突已按统筹决定修正；仍在途的 PR 在合入前要复核最后的 head。

### 10.27 2026-10-17～18 接续独立复查（Codex，10-18 停止扩展、交接；已读 main 至 `aceffff86`，运行基点分别记录；接续见 §10.28）

本节接 §10.26，按各 PR 实际合入 main 的差异及当前调用链核对。下表只说明已经查到的范围，不把文件名单、PR 作者报告或单批绿色测试当成整项验收。新增运行复用已整体构建的 Todo 整合候选 `92300b312`（包含 main `b3499cda5` 的产品代码；之后 #705 仅文档与资源门禁说明变化），没有重跑本机全量或使用真实 Home。

| PR / 合入提交 | 当前复核结果与证据边界 |
| --- | --- |
| #675 / `b75e20738` | 后台作业由工作图与 Host wait 持有，结束通知、卡片和新轮材料从同一图读取；查状态前重新取得工作的精确动作 client。发现一项已复现的缺陷：`AssistantJobs.#follower` 将 SQLite 读取失败也当作工作不存在，检查器据此给出 refused，使步骤永久转为 unchecked；与已定的“暂时读不到则 unknown、有界再查”相反。本线本地修复 `88d07caec` 只将 owner 的 `assistant.not_found` 当不存在，真实排他锁→释放→原步骤恢复测试及相关 64 文件 581 条通过（RAC-61/62）；（2026-10-19 更正：#754 已把同一修法合入 main，`ffb3db076`，见 §10.28、§10.29。）`assistant_jobs` 的历史清理仍按 §10.26 留给已批准的后续库维护。 |
| #683 / `4726820a8` | Feed 调用取消后停止后续判断。共享 flush 只放回尚未尝试的主体，已尝试的主体不重放；`judgeOwn` 不把自己剩下的内容交给其他调用身份。实际 `feed-sync-concurrency` 验取消后零后续调用、后续 flush 的顺序与身份、恢复后明确重试；没有靠跳过失败断言通过。 |
| #680 / `8abfffc02` | `workView` 逐项构造合同字段，必选项由类型约束、可选项由映射覆盖，旧存储的额外字段不泄露到视图；委派关系由图归属读回。`assistant-work-view` 经真实 SQLite 写入额外键后调公开服务，断言返回键和业务值，而非仅验证测试用映射。没有改库版本或读写真 Home。 |
| #681 / `42c968efe` | 每轮从其可信 owner 的当前项目动作目录取种类，按安装聚合、同时具备搜索和读取、过滤隐藏与不可用项；SDK 名称/长度/数量限制在边界处理，不把坏条目送进模型。无端口或空列表时保留 Runtime 内置种类是本片明示合同；两个项目、外部插件、非本地 actor、伪造输入及不合格名称有拒绝用例。安全编号 S-32 与引用已一致。 |
| #695 / `6505378e8` | 正常关闭留下的精确 pending 才可在重启后答复；事故遗留或已关闭的问题不获得同等待遇。答卷按原 revision、字段和对象 owner 校验，`answerInterrupted` 在写入时调用现行 `effects.assertCurrent`；原调用身份失效不会沿用提问时权限。S-33 用实际 Runtime/重启及写入前撤权，核对拒绝后全部存储未变。答卷成功后只把下一轮启动失败作为独立结果，保留已接受答案，不重复答题。 |
| #698 / `31c48ed5d` | 连续两次交互格式失败在第三次模型请求前停止；停止理由只用 Host 的固定说明，不复制拒绝内部内容。当前显示与重开会话读同一原因。实际 Runtime 回归核对模型请求数为 2、结束状态和重开原因一致；持久化失败只保留当前理由这一边界已在实现说明，不冒称故障下也落盘。 |
| #685 / `8dad2fb96`，#693 / `14bb4bc55`，#697 / `8cc8fb67b` | 已检查本地提示与角色声明差异：精确角色工具由 Runtime 发放；协调者删去重复的等待工具讲解，基础提示删去问卷格式讲解。相关提示版本同步，仍保留权限、材料不授予权限、按真实回执陈述及用户决定边界。本节没有独立重跑上游真实模型评估，不能仅据提示更短认定效果提升。 |
| #689 / `bee59ffdd` | 只修 Feed 重试用例的竞争：占位失败保持到实际点击，固定期间的游标刷新；额外断言点击本身发起首个 detail 请求，因此刷新成功不能冒充重试成功。未改产品源码，也未删掉读取状态与单标题断言；本节未重跑该 Chrome 文件。 |
| #673 / `9fda1a405`，#691 / `df00646d8` | 内容落点由实际编辑器按已保存版本、光标/选区/末尾报告；准备与确认仍调用 Host，不由预览自行写。主页面向已确认面板发闪烁消息，面板只接受同源父窗口；实际动作确认令牌仍绑定具体面板、一次消费。工具条的悬停/键盘焦点只触发落点提示，不提交内容。`assistant-pick` 与两项落点 Chrome 回归在干净 main a56 通过；S-30 来源/重放拒绝已随 Todo 整合定向批次通过。没有据这些用例宣称全部辅助技术或视觉状态验收。 |
| #687 / `1483a9f2c`，#688 / `877dc7626` | 工作视图保留队列“没读取”和“已读取为空”的差别；补充的状态来自 Runtime 台账，AI 自述与正式状态分行。任务图报告只存输入引用，页面定位回原会话输入；去掉多余的 JSON 引号不改变来源与事实。核 `assistant-input-correct`、`prologue-input-claims`、回执客户端及真实 Chrome 的撤回/更正/队列路径，第二批通过。 |
| #700 / `e128c1203` | revise 从 v1 升到 v2；普通伪造、外轮和已撤回输入在 Host 拒绝，AI 不能用 board-revise 自行增加用户步骤。但新增 **P2 公共动作并发一致性缺口**：来源检查在 `await fresh(call)` 前；一个仍为 received 的输入在这次等待内被真实 `inputs.withdraw` 撤回后，动作仍成功插入步骤、持久化指向该 withdrawn 输入的 origins。Todo f7fff 和干净 main a56 各真实 SDK/任务图复现。通常 UI 的“新任务”入口针对已读输入、不能再撤回，故不扩大为普通 UI 或越权缺陷。未修复，留作后续有界修复；不能靠仅将检查换到另一处 await 前宣称消除交错。 |
| #690 / `102671ce6` | 核 vendored 来源记录与 Molis 起跑拒绝码：正常关闭停在问卷、恢复中/交接中及历史不可读，都作为开跑前明确拒绝；恢复检查后可关闭旧轮并开新轮。第二批 `prologue-start-refusal`、`prologue-recovery`、`interaction-reask` 均通过，旧轮的答案恢复另由 #695/S-33 证据承担。未独立重跑上游 SDK 全量，不把作者报告当本轮运行。 |
| #696 / `8fcff0442`，#702 / `b3499cda5` | 引用答卷采用 SDK 的数组/对象形状和数量限制，归属检查保持；问卷含多个问题但只有一个文字题时，输入框仅写进那一题的草稿，卡片的“提交回答”才交回。失败时输入保留；Host 拒绝把这种多题问卷当作直接文字答复。真实 Chrome `assistant-typed-questions` 4 条和对应客户端/HTML/类型答卷用例在 main a56 通过，未把草稿写入当已提交答案。 |


本轮新增运行：`prologue-work-jobs`、`assistant-work-view`、`interaction-repair-limit`、`feed-sync-concurrency`、`agent-reference-questions`、`interaction-parked-answer`、`coding-session-recovery`、`assistant-delegation`，8 文件 54 条全部通过，无跳过；日志 `/tmp/molis-review1027-targeted.log`。S-32/S-33 与外部检查拒绝用例已在同一 Todo 候选的 73 文件安全/相关回归中通过，不为本节重复运行。以上属于工程与受控模型路径证据，没有新增真人体验或外部真实模型结论。

第二批（2026-10-17 晚间）在已整体构建的干净 main `a56a2763d` 上运行：16 非浏览器文件 98 条、5 Chrome 文件 11 条，全部通过，无跳过；日志 `/tmp/molis-review1027-second-{nonbrowser,browser}.log`。本批与第一批是不同基点，分别保留，不合称一次全量。额外的 #700 故障复现预期拒绝却实际新增成功，属于明确失败：源码 `/Users/yijunwang/code/molis-anti-corruption-20261017/review1027-origin-race.test.ts`，日志 `/tmp/molis-review1027-origin-race-main.log`，没有为绿色删除断言或修改产品语义。

第三批：干净 main a56 的侧栏 Chrome 3 文件 20 条，日志 `/tmp/molis-review1027-side-browser.log`；包含 main 3edf 的复查树上 native 门禁夹具 22 条，日志 `/tmp/molis-review1027-native-gates.log`。均无失败/跳过；没有跑本机全量。复查树已 merge main 3edf，文档差异独立保留。

| PR / 合入提交 | 补充复核结果与证据边界 |
| --- | --- |
| #692 / `002fbbb5b` | 仅需求书与 BACKLOG，明确依赖 SDK 先交回命令，再由原命令审查、Effect 和回执执行；检查器配置归 agent-host、只允许用户保存，文件作为完整 argv、无自动发现或免审路径，尚未实现。不把拟议动作和用例当现有能力。发现一处非阻塞规格矛盾：§6.0p.3 写模型输出“至多 4,000 字”，同节与 PA-32 又要求前 2,000＋后 2,000＋截断提示，后者会超过 4,000；实现前应统一总上限是否含提示。第一片不增加按检查器的会话规则及其逐文件批准成本已明写，BL-160 保留后续决定。 |
| #705 / `3b3a7f573` | 六文件实际差异只有资源控制的说明、PR 模板、AGENTS 与一条报错文案；`APPROVED_CEILINGS`、实测比较及拒绝逻辑没有被改松。中英文手册和 spec 同步“默认下降，必要增长按准确基点单次许可”的描述。本项是已合文档/实现的一致性核对，不从 PR 说明推导本会话追加门禁许可的授权。 |
| #701 / `a56a2763d` | 侧栏顺序来自视图声明，Shelf 的工作区入口已删除；链接、搜索与通知仍使用插件名，经 `openPluginInSide` 定位到声明的侧栏页，并把 item 交给该页。该页只接受同源父窗口的 target；转发上行事件同时核对侧栏 frame 的窗口、同源及自有键白名单。Runtime 在安装/升级处拒绝外部插件声明 always_on，项目服务拒绝移除常开插件。S-30、S-34、项目插件与侧栏平台用例已在 Todo a56 整合批次通过；本轮另在干净 main a56 运行 `shelf-side-links`、`shelf-plugin`、`plugin-picker-pins` 三个 Chrome 文件，20 条全部通过，覆盖落点、默认侧栏、样例 PDF、固定/移除/恢复及宽窄布局。未据此宣称所有桌面入口或真人验收通过。 |
| #707 / `3edf9c91f` | Rust 门禁在 rustfmt 与 clippy 后真实运行 `cargo test --locked`，测试失败加入失败结果；新增夹具以编译通过但断言失败证明它能挡。粘贴板测试在各自 TestPasteboard 生命周期持有同一 Mutex，清理后才释放，修改仅在测试模块。现行 `native-checks.test.mjs` 在合入此提交的复查树运行 22 条全部通过，零跳过；这证明门禁正反例，不代替本轮未运行的完整桌面 crate 测试。 |
| #704 / `c31291c34`（最终候选 `c7a002c43`） | 只读核对桌面入口改走通用 `openPlugin`，位置仍由侧栏声明决定；页面只由顶层报告 Shelf 页的矩形，开关、切页、尺寸变化重新报告；Rust 收有限、正面积矩形，命中前再检查是否完整落在当前窗口内容区。S-14 的 Rust 正反例覆盖 NaN/无穷/负原点/无面积/超边界，页面用例以模拟 Tauri 桥验证真实 bootstrap 的报告；没有把这个桥称为实际原生拖放。最终候选与已读 bafe1e97c 的本片生产源码一致，新增差异为合入 main 后已有的 #707 粘贴板测试互斥；远端最终普通 CI（含 Rust 测试的原生检查）已通过，已合入 main。本轮未运行该候选的桌面程序或新的 Chrome 文件。 |
| #706 / `149faac7d`（候选 `6f70aad2a`） | 新回执从 `step_board.origins` 取步骤，动态状态进入重绘键，文本仍经 textContent；读不到板时不编造步骤。发现 **P2 显示归因错误**：`readBoard.added` 只用 state 选“模型报告完成/失败”，忽略已有的 `owner.kind=person`，因此用户亲自处理的步骤也显示成模型回报；同一板在计划卡有 yours 分支，正确显示“你标记完成/失败”。按候选完整页面代码转译并运行，person 的 succeeded/failed 两条期望分别失败，model 对照通过；该生产源码与合入 main 相同。复现 `/Users/yijunwang/code/molis-anti-corruption-20261017/review706-receipt-owner/proof.test.mjs`，日志 `/tmp/molis-review1027-pr706-owner.log`。另在既有完整构建上运行真实 SDK 的 `coding-step-claims` 人工认领/完成用例，1 条通过（`/tmp/molis-review1027-person-step.log`），证明此状态是现有路径；本轮未改生产代码、未把小 DOM 用例当整页体验通过。 |
| #708 / 候选 `618f0b1ed` | 双标签页用例明确在页面里拦住第二次答卷，第一份进入模型并终止后才放行，断状态/错误码、刷新、模型次数和拒绝前后磁盘内容；Coding 的旧轮/外轮由无类型 Error 改为 owner 错误码，页面据码刷新旧卡。当前远端产品子集及全量 4/16 失败都是 `coding-session-recovery.test.ts:86` 仍断言 400、实际新合同 404，重试同样失败；不是时序证据。实际日志 `/tmp/molis-review1027-pr708-{product,full-4}.log`，已在本线 #684 评论 `6245609333` 交统筹协调原线同步旧用例和码，保留不调用 control 的原断言。补读完整全量后，12/16 另在新增 AC-08 Coding 双标签页用例中失败：第二标签页等待当前会话及同一问卷超时，重试仍失败（`interaction-no-crosstalk.e2e.test.ts:229`，`/tmp/molis-review1027-pr708-full-12.log`）。这项发生在第二份答卷发出之前，不能用它证明重复写入；当前未区分页面问题和用例准备时序。本轮未运行候选 Chrome，也未修改别线代码。 |

| #709 / 候选 `34946e581` | 只读核对新会话创建中和初读未落地时的输入关闭条件；提交处理器也检查 disabled，避免快捷提交绕过按钮。初读失败后，后续读取用 draftOwner 是否等于当前会话决定恢复草稿，创建失败/复用空会话则在 finally 重新计算控件。四条新增 Chrome 用例分别拦住创建/初读、制造初读 503、覆盖创建失败和复用；断言旧字未被 POST 到新会话，成功后才接受新输入。常规 CI、远端全量 16 个分片及汇总现已全部通过；本轮只读源码/测试，未在本机运行候选页面，执行证据明确来自该 head 的 CI。 |
| #710 / `931ee111b`（候选 `731196146`） | 只在现有原生检查的 rust-cache 增加 `key: with-tests`，使已加入 cargo test 的构建不沿用旧缓存键；无测试命令、失败处理或断言改变。常规 CI 包括原生检查已通过。本轮未改变缓存或工作流。 |

#661 增量复核（候选 `1d1a44944`，仍在途）：已同步到 main `c31291c34`，当时可合并；相对先前读取的 `0090afe`，Jelly 模型配置、Images Host、Functions Host/动作与 Functions 包没有新增差异。核对 main 合并与 `2292eb1ba`：后台作业仍经新版 jobs 跟进，独立的 owner 外部等待保留；`createPrologueWaits` 的标题/展示组装移出，sessionView 保留 main 的 end-step 过滤，运行中继续由原 wait/continuation 事实判断。新增 Issue 夹具把结束检查和背景记忆提取与业务模型答复队列分开，业务断言未减少；导航选择器跟随真实侧栏容器。晚间再次核对普通检查已全部通过，可选 Linux probe 按条件跳过，但 main 推进后同一 head 又显示冲突，尚无全量检查；本轮未运行该候选、未代替全量或真实 OAuth 验收。该 PR 的主代理自查表与 93 文件报告只作为提供方证据，未当作本轮独立实跑。

#699 CI 补读（候选仍为 `d53611b92`）：全量 run `39085263355` 的 11/16 在 `interaction-no-crosstalk.e2e.test.ts` 的 AC-05 第二个会话等待问卷处失败，重试仍失败；另外两个用例通过。日志确认检出的是候选与 main `8fcff0442` 的合并结果 `3bbdeec32`，这份用例来自 main，并不在候选原分支。失败时只收到甲会话模型请求，乙会话已创建却未见其运行请求；发生在答案和拒绝后写入场景之前。仅此不能归因于本 PR 的 SDK 写后检查，也不能认定为环境偶发；日志 `/tmp/molis-review1027-pr699-full-11.log`。其余 15 个全量分片通过，同一候选现在与 main 冲突。

#661 再次同步（候选 `1ab2f29f3`）：已把 main 至 `a19524f58` 合入，新增 `53accc7cc` 收紧三个安装/启动边界。HubSpot 的 latest 原生发行物不再假称固定版本，移除受管安装声明和来源域名，保留连接已有 CLI；本地 MCP 拒绝 JAVA_TOOL_OPTIONS、_JAVA_OPTIONS、RUBYOPT 和 PERL5OPT。新增断言检查准备 HubSpot 时零网络请求、零安装目录/连接记录，注入变量拒绝后无子进程；没有通过删除断言放行。当前安全表与测试统一使用 S-36，原先与 #634 的 S-35 冲突已解除。Jelly/Images/Functions 目标文件相对 `1d1a44944` 没有新改动。普通必需 CI 已通过，产品子集与 16 分片全量仍在进行；这里只读源码/CI，不把提供方验证当成本轮独立实跑。

#711 回执竞态修复已合入：`cedd0503d` 经普通 CI 和 16 个全量分片全部通过，以 `eb3bf7131` 进入 main。源码把来源检查放到 Host beforeEffect 返回后，并让适配器在 addNode 调用前读取所属轮次的当前输入记录；两条新增 RCPT-357 运行真实 SDK，分别在 Host 等待中撤回和绕过 Host 直接调用已撤回来源，均断言拒绝且任务图版本/节点不变。它对应本轮在 #700 上复现的 P2。独立运行已补齐：把自有干净基线树切到实际 main `aceffff86`，离线安装、整体构建后，原先在 a56 失败的同一竞态脚本不改断言通过，真实 `inputs.withdraw` 在第三次 beforeEffect 内撤回后得到 `agent.input_not_origin`，最终任务图不含该来源；同批 `prologue-input-claims` 六条通过，合计 2 文件 7 条、零跳过，日志 `/tmp/molis-review1027-origin-main711.log`。已声明的队列边界为 SDK 接收 addNode 调用的时点，进入 SDK 队列之后撤回按“新增后撤回”显示，本轮不另改这个合同。

#661 全量失败补读（仍为 `1ab2f29f3`）：run `39101618084` 的 3/16 中，`connector-managed-install.test.ts` 的 Python 安装用例在第一个 `uv --version` 前置检查报 `spawn uv ENOENT`，尚未进入安装产品路径；同文件其余五条通过，重试仍失败，分片其余 67 文件通过。候选 `.github/workflows/full-suite.yml` 未安装 uv，因此这是明确的 CI 前置环境缺失，不能当作 Python 安装能力已通过，也不能据此归为产品安装语义回归。日志 `/tmp/molis-review1027-pr661-full-3.log`，job `117598881892`；本轮只读记录，不代改其他线 CI。读取时 13/16 与 15/16 仍在跑，其余分片通过。

#661 环境修复补读（候选 `9d94e5eb5`）：相对 `1ab2f29f3` 仅在全量工作流新增固定 SHA 的 setup-uv、指定 uv 0.12.19 并禁用其缓存；没有修改产品代码或测试断言。同样的 7 行已单独随 #715 合入 `aceffff86`。新 head 的普通必需、产品子集和安全检查全部通过；全量 run `39104715563` 的原失败 3/16 已通过，其他分片仍以最终收束结果为准。此项证据来自 CI，本轮没有另跑连接安装或真实外部服务认证。

#709 合入补读：最终 head `5d403c724` 仅把 main 至 #634 合入已通过全量的 `34946e581`，已以 `a19524f58` 合入 main。实际检查 Coding client 的新增差异只为主线 #706 的计划卡文案端口，四条 `coding-session-first-read.e2e.test.ts` 与先前候选相同；没有新的草稿行为变化。最终 head 的普通检查除产品子集在读取时仍运行外已通过；16 分片全量证据属于先前 `34946e581`，不能写成最终 head 又跑了一次。#699 的旧 CI 失败是否由本修复解决仍需新整合验证，未据此提前消项。

#634 独立复核（候选 `8c98220aa`，P1 待修）：新 S-35 承诺放置服务关闭后补偿移回一律拒绝，但 `placementCallPorts.revert` 仅在调用 `ports.scope` 前检查 alive；分区等待返回后、发现动作与调用方授权等待后的最终同步断言都未再检查。基于该 head 的完整 placement-call、PlacementService、subject-reader 转译执行（仍用真实 ActionService 与 Context Ledger，库契约相对 main 无差异），在补偿分区打开或动作授权各置一个受控等待；对象先从 personal 移到 q4，原调用被拒，补偿进入等待后关闭服务再释放。两种交错均实际调用 mover 两次、对象回到 personal，原错误没有 actions.expired cause；新增拒绝断言两条失败，候选自带的两条 S-35 对照用例通过。只在隔离副本的 revert 最终同步 assert_authority_current 里补 alive 检查后，四条全部通过，对象仍在 q4、只有一次移动，cause 为 actions.expired。复现位于本地 Pages 树忽略目录 `.impeccable/qa/review/pr634-revert-race/`，日志 `/tmp/molis-review1027-pr634-revert-{race,fixed}.log`；未修改该 PR 的实现，未声称运行完整原生宿主关闭流程。另核对 #634 与 #661 当前同时新增 S-35（补偿移回与受管工具两个不同约束），合流时需由统筹分配唯一编号并更新对应测试；本线不擅自改号。

#634 合入核对（2026-10-17 晚）：GitHub 确认上述同一候选 `8c98220aa` 已合入 main `4bea52c84`；placement-call、PlacementService 与 subject-reader 相对被测候选无差异，故补偿等待中的关闭 P1 仍适用于 main。已在本线 #684 评论 `6246152139` 再次交统筹处理，未将原 PR 全量通过解释为覆盖这两个缺失的交错场景。Todo 为资源冲突合入同一 main 后，其原 S-35 两条测试通过，也不替代上述新增拒绝证据。

收尾状态（2026-10-18）：本轮独立复查停止扩展，后续复核交接手人。GitHub 当前确认 #661 已以 `de6dbfc8b`、#699 以 `7faaa027c`、#709 以 `a19524f58`、#703 以 `63639a764` 合入；#708 仍在途，head 为 `c4e6d38e0`。以上是合入状态核对，不冒充重新审查这些最终候选的全部变化。旧运行和旧 head 的失败记录仍按上文归属保留。

当前待处理的已复现 P1 是 #634：`placement-call` 的 revert 在等待与最终同步提交处仍缺关闭状态复核，实际 main `63639a764` 与前述已测实现相同；两种交错失败及隔离最小修复四项通过的证据保留，未在本次收尾中启动新修复。#675/P1 的既有修复已接 actual main，最终组合候选 `729ce024d` 的整体构建、boundary、health 及 3 文件 72 条通过，原 64 文件 581 条证据保留；当前仍待本线 PR/CI 合并，不能记作 main 已修。#700/P2 已由 #711 合入且原竞态独立复现通过。#706/P2 显示问题与 #692 输出预算文义仍保留待核，不把未复核项写成已解决。材料安全编号在当前候选统一为 S-39，旧段落的 S-34 只是当时冲突记录，不再要求占用现行编号。

### 10.28 2026-10-18～19 统筹接手复查（Claude ①；读到 main `2e5bc0a7d`，其后 #740 合入为 `be0158e53`）

本节接 §10.27，是 10-18 交接后统筹会话的第一轮复查。范围是交接时 main 上 §10.27 没有审过内容的合入（它只核了合入状态的也算），外加 #740 与在途的 #733。依据有三：防腐线最初六份原文（`docs/prompts/` 下四份与 `specs/archive/` 下两份）；`coordination/2026-10-13/ANTI-CORRUPTION-REVIEW.md` §3 的 27 条；§1 末尾 2026-10-18 各行。

怎么读的：
- 按合入 main 的 squash 提交和当前 main 代码读。
- 全程只读：没有构建、没有跑测试、没有碰真实 Home。
- 写「需复现」的条目还没有运行证据，由统筹排时段，不当成已证实。
- CI 通过、作者自查、已经合入，都不单独算合规。

每条问题后面写归属：② 平台、③ 迁移、④ 需求、① 统筹（文档）。统筹已把各条派给对应会话，排在它的下一片之前。

各插件族与宿主里「只给内置插件的特权和平台缺口」另成一份清单 [privileges.md](privileges.md)，是 ②③ 的排期依据；本节只记逐个 PR 的结论。

**已合入**

| PR / 合入提交 | 结论与证据边界 | 遗留与归属 |
| --- | --- | --- |
| #608 / `f86d4d711`，#686 / `054ec6140` | 只改复查文档与本 spec §10.26，通过。 | P3：`docs/reviews/anti-corruption-review-c1531e6dd.md:6`、`anti-corruption-checklist-c1531e6dd.md:3` 写着开发机的绝对路径 → ① 改写。 |
| #634 / `4bea52c84` → #740 / `be0158e53` | §10.27 记的 P1 已修（补偿移回的等待中放置服务关闭，仍会把对象移回）。`placement-call.ts` 的 revert 在三处重查服务是否还开着：取作用域前、分区等待返回后、最终同步授权断言里；关闭了就抛 `actions.expired`。`tests/security-invariants-placement-revert.test.ts` 新加三条 S-35 交错用例：开分区时关闭、等授权时关闭、移动方提交前等待时关闭，都断言对象不回原处。S-35 行同步。Verify 与 `test:security` 全绿后合入，随下一批集成全量复验。 | 无。 |
| #675 / `b75e20738`（§10.27 记的 P1） | 写本节时 main 上仍在：`assistant-jobs.ts:161` 的 `#follower` 把库读失败也当成「工作不存在」。检查器据此给出 refused，步骤永久变成 unchecked。修复是 `88d07caec`：只把 `assistant.not_found` 当不存在，其余错误抛给检查器当 unknown，带 RAC-61、RAC-62。写本节时它只在 ③ 接手的 `integration/anti-corruption-closeout-20261018` 上。之后 #754（`ffb3db076`）把同一修法合进了 main：生产文件的 blob 都是 `5dd287d11..f12bd6926`，测试 hunk 逐行相同；`AssistantStore.get` 找不到时抛的正是 `assistant.not_found`。 | 已修。RAC-61、RAC-62 守住（`tests/assistant-business-gateway.test.ts`）。§10.27 的 #675 行和 W5-13 补片标题的状态句，随 §10.29 一并改。 |
| #699 / `7faaa027c` | 换 Prologue 包，通过。核对了包的份数、sha256、provenance、`patch-history.json`、上游 #42～#46，以及 S-38 行与用例。 | 无。 |
| #661 / `de6dbfc8b` | 有问题：P2 两条、P3 四条，另有两条待核、由统筹定。<br>已核没问题的：<br>• squash 等于 head `f7d07b658` 加 #717。<br>• 9d94e5eb5 之后的夹具更严；`allowDisabled` 只有 4 处，且都先断言 disabled。<br>• 受管安装：来源固定版本加校验和、`--ignore-scripts`、域名逐跳核对。<br>• 凭据不进日志；connectors 库 1→2，没有运行时迁移。<br>• 取消或撤权后不写观察；续办每次重新取授权。<br>• 错误码用 `defineErrorCodes`；巨大单元 137→136。 | ② P2：S-36 说拒绝 Node、Python、Java、Ruby、Perl 的 loader 环境变量。可 `connector-local-mcp.ts:26` 的名单只有 `JAVA_TOOL_OPTIONS`、`_JAVA_OPTIONS`、`RUBYOPT`、`PERL5OPT`，`JDK_JAVA_OPTIONS`、`CLASSPATH`、`PERL5LIB`、`RUBYLIB`、`PYTHONUSERBASE` 都能过 → 按前缀拒（`JAVA_*`、`JDK_*`、`PYTHON*`、`PERL*`、`RUBY*`、`NODE_*`），每个补拒绝用例。<br>② P2：`connectors.connection.control` 把 enable、disable、remove 合成一个动作，声明的 effect 是 `write`（`connector-management-actions.ts:37-39`），审批卡写「可撤回」。可 remove 会删凭据、协议配置和受管安装目录 → remove 拆成单独的 irreversible 动作，快照与版本随改。<br>② 待核两条，统筹已定：项目 MCP 与发起者核对，见下文「统筹裁定」第 5、6 条。<br>② P3：`project-host.ts:229` 的连接器装配一行 687 字符、4 个 lambda，塞在巨大类里 → 挪进 connector 模块的工厂函数。<br>① P3：S-27 漏了 `molis.connection-ready@1`。<br>① P3：board-wait 扩大了业务角色能声明的工具，PR 没写影响 → 随第 4 条规则补记。<br>③ P3：`connector-management-service.ts:22` 每次启停都打开所有项目库，推 Feed 的连接状态 → Feed 迁移时改成按需读。 |
| #709 / `a19524f58` | **P1，数据写错会话**（§10.27 只核了候选的输入关闭）。<br>`client.ts:346` 里的两组条件：<br>• `off = !current \|\| sending` 是没有当前会话或正在发送；<br>• `shut = off \|\| unread` 还加上首读未落地。<br><br>问题出在这几处：<br>• 上下文按钮只看 `off`，不看 `shut`：goal、material、method、mcp、actions 在 :360，角色在 :363。<br>• `select()` 只把 `draftOwner` 清成空串（:1171），不清输入框。<br>• 材料、方法、能力和角色的保存（:1445、:1461、:376、:378）都按当前会话 id `saveDraft(id, input.value)`，没有核对 `draftOwner === id`。<br><br>所以新会话 B 首读在途或失败时一保存，A 的话就写进 B 的本页草稿和服务端草稿，B 读完后框里是 A 的话。 | ④（交互线，Coding）：<br>• 六个按钮改用 `shut`；<br>• 面板的 materials、methods 命令加 `draftOwner === current`；<br>• 四个保存入口在 `draftOwner !== id` 时不写 draft。<br><br>需复现：在 `coding-session-first-read.e2e` 加一条：挡住 B 的首读或让它返回 503，点方法保存，再放行。断言 B 的输入框里没有 A 的话，`PATCH /sessions/<B>` 带的 draft 也不是 A 的话。 |
| #715 / `aceffff86`，#724 / `d9a58f37f` | 通过。<br>• #715：setup-uv 的 SHA 对应 v10.3.0，uv 0.12.19，没有改断言或必需检查。<br>• #724：只把时限放大到 75 秒和 180 秒（按慢机放大，用户 10-15 认可），断言不变。 | 无。 |
| #716 / `5f03d1e45` | 通过。bail 不吞失败：引起失败的文件进失败名单，退出码 1；被停掉的文件只会少报，不会变绿。 | ① P3：「全量快速失败」这项 10-18 决定只写在 yml 注释和 `PARALLEL-DEVELOPMENT.md:183` → 已随本节补进 §1 决策表。 |
| #717 / `59fd7850c`，#719 / `4e729b6c3` | **P2**。仓库是公开的，59fd7850c 加进了两份原始采集 JSON（10-17 那份 26,839 行，10-18 那份 14,525 行）。里面有：<br>• `club` 键：私有仓库 molis-club 的本机路径、分支、HEAD，以及 60 个文件的路径与 sha256；<br>• `worktrees` 键：38 个工作树的路径和 1,621 行 git status。<br><br>没有邮箱或令牌。#719 只把它们从树上删了，历史里还在。 | 要不要改写 main 的历史由用户定；红线是不 force push。统筹推荐：不改写，在 REPOSITORY-HYGIENE 记一笔，并给 health:check 加一条，拒绝 `docs/` 下的大 JSON 和 `/Users/` 绝对路径。后者改门禁，按批弹窗问用户。 |
| #712 / `38beba3dd`，#720 / `b2336d5c4` | 通过。<br>• #712 资源从 1,110,056 涨到 1,110,329（+273），#720 从 1,111,791 涨到 1,111,910（+119），都按父提交的准确数字放行。<br>• baseline 只变小，没有空 catch。 | ④ P3 待核：`context-bus.ts:242`、`context-landing.ts:23-25` 对分屏窗格与主区自报的 place、side_tab 原样保留（旧行为）→ 其他来源一律给 `{place:"main"}`。 |
| #718 / `62a4d9287` | **P2**。`specs/skill-packs/spec.md:24-27` 的 `pack.json`（§3）和宿主的 `SkillPackRegistry`（§4）是插件之外的第二套安装注册路径，违反 10-18「插件的待遇」。它与 plugin-platform-v2 S1（:229）也矛盾，S1 写的是只有内容的插件。 | ① 改写成「没有 runtime、只有 Manifest 的插件」：扩展 `AgentSkillDeclaration`，走插件的安装与信任；实现归 ④。<br>① P3：plugin-platform-v2 S3 的 Manifest hooks（allow、deny、rewrite 工具调用）是信任边界的变化，要补 SECURITY-INVARIANTS 的条目和「先弹窗」。 |
| #722 / `6aa8459ac`，#732 / `2b5deedb1` | P3。抽查了 14 条说法，都有代码支持。 | ① 改：<br>• `产品介绍.md:64-66`、`功能全景.md:154-161`、`:182`、`:311`、`:319` 仍把 Sessions、成果、插件创作台、角色当插件，Sessions 的 F-010～F-013 还标「可用」。<br>• F-083「最多 12 页」只是提示词（`ppt/src/prompts.ts:7`）→ 改成「提示模型最多 12 页」。 |
| #684 / `c5d2b3cf6` | 有问题：P2 三条、P3 三条。<br>已核没问题的：<br>• 宿主文件、路由行、registerProvider 和工作台的构建期舞台都删了，冻结名单也删了 todo。<br>• 目录条目改成 `runtime: { scope: "home" }`。<br>• 库：版本仍是 1，没有补表，没有兜底读；写入经 `database.transaction(beforeEffect, …)`。<br>• 资源 +28 B 按 merge-base 的准确数字放行，S-03 行带新用例。 | ② P2：迁完以后 Manifest 还是 `kind: "native"`，所以按 `local-owner-permissions.ts:17-20` 自动算进本机所有者权限，网页动作走 `local-web-actions.ts:26,49` 的捷径。:17 的注释写「Runtime plugins are not included」，和代码对不上 → 按 Runtime 装配的条目排除，补一条拒绝：撤掉授权后经网页调 `todo.*` 被拒。这一项是 privileges.md「本机所有者权限」那一行的一部分。<br>③ P2：外壳「转为待办」在 `events-secondary.ts:106` 写死了 Todo 的路由和输入形状 → 按能力目录调公开动作。<br>④ P2：`web-onboarding.ts:29,31` 手写 `todo:read`、`todo:write`，`context-onboarding-service.ts:15` 直接 import Todo 包 → 按动作 id 调，权限来自用户授权。<br>③ P3：旧路径 `/api/todo` 没留 404 断言；`web-request.ts:213` 的注释过时了。<br>② ① P3：`homeViewModel` 的形状只在 `PLUGIN-DEVELOPMENT.md:129` 提了一句，contracts 没有类型。 |
| #713 / `0ffa9842d` | P3。角色版本有两种做法：<br>• `assistant-agent.ts:136-142` 的两个助理角色停在 v1；<br>• todo 的 `roles.ts:11` 停在 v2，经 `BUSINESS_HOST_TOOLS` 多了工具却没升版；<br>• #726 的 Coding 七个角色各 +1；<br>• #661 加 board-wait 也没升。 | ④ 按「统筹裁定」第 4 条升版本，并写进 Skill。<br>④（手册）：SKILL.md 与 PROLOGUE-AI.md 补写 acknowledge-inputs：业务角色经常量自动带上；workspace 角色要自己列；它只记 AI 的自称，不改账本。 |
| #723 / `f7f8adbf2` | 包本身核过：份数 1，sha256、字节数、integrity 一致，旧包已删，patch-history 的 gitBlob 对，dist 改动的 32 个文件对应上游 20 个源文件。 | ① P3，`vendor/prologue-sdk/README.md` 两处：<br>• :26 说助理的业务轮次「不再列 board-node」，不对。实际是只少了 app-ref，列了 board-wait，board-node 照样提供。<br>• :67、:96、:116、:165、:185、:199、:211 的旧包段落还写「见旁边 .provenance.json」，那份文件已随包删掉 → 改成「来源记录随包删除，从 `<提交>^` 取回」。 |
| #714 / `e5adc24c2` | P3。放行口径核过，合规。 | ④：<br>• 「当前约定」的英文写在 design-system 的 `input-receipts-client.ts:513`，应放 `apps/workbench/src/i18n/assistant-en.ts`。<br>• :392、:511-512 把句子拆成碎片翻译，N=1 时复数错 → 改用带数字占位的整句。<br>• 命名冲突按「统筹裁定」第 3 条改。 |
| #725 / `ee78569fc` | P3。`tests/agent-prompt-layers.test.ts:69` 删掉的三句只换成了 `doesNotMatch`，没有用例钉住 SDK 的工具描述里确实有这几句。 | ④ 加用例：读安装包里 search、read、dispatch-subagent 的描述。<br>① P3：手册 spec:1227 §9.5 的 T2 行没写回「定为 Prologue 设计问题，见 BL-173」；BL-173 的出处应为手册 §9.5。 |
| #703 / `63639a764` | P2 一条、P3 四条；§10.27 只核了合入。<br>已核没问题的：<br>• 取消从 Host 一路传到模型请求的 signal；<br>• 超限、停用、断连都会 `stop()`；<br>• 末行只由 Host 写；<br>• 每段文字交付前同步重查授权；<br>• S-03、S-18 的表行和拒绝用例都同步改了。 | ② P2：`plugin-route-stream.ts:57-58` 的错误末行优先用插件 body 里的 `call_id`，这个号可以在调用记录里查不到。JSON 出口反而用记录的号覆盖 → `refusalLine` 只用 `recordedCallIdField()`。<br>需复现：在 `security-invariants-plugin-route-stream.test.ts` 加一个直接路由，返回伪造的 `call_id`，断言末行不是它。<br>② P3：<br>• `BoundActionClient` 的注释挂错了类型（`actions.ts:423-430`）；<br>• 100 ms 轮询 `active()` 没进 BACKLOG；<br>• STREAM-04 多 import 了一个内部符号 `runningProjectPlatform`；<br>• 拒绝只断言了 `instanceof Error`，没断言错误码。 |
| #727 / `74f39a47c` | P2 三条、P3 四条，另有一条待核。<br>已核没问题的：<br>• 授权在 Runtime 的 materials-service 里，要求动作声明了权限、是 concurrent、调用者持有这项权限；<br>• 效果前后都核 signal、在不在线、当前授权和 `beforeEffect`；<br>• 公开来源每次请求和跳转前都重查。 | ② P2：S-39 的取消、停用、撤权、升级拒绝都带 `skip: process.platform !== "darwin"`（:111），表里却登记在「CI 里跑」→ 写一份不分平台的拒绝，原生那份挪到「只在本机跑」一列。<br>② ③ P2：S-13 扩到材料服务，但没补测试；灵光把「不可信」声明放在用户能改的指令里 → 灵光改用 `fencedMaterials`，加 S-13 用例，或由平台给材料围栏。<br>② P2：沙箱插件拿不到 materials、model、Home 库和登记指令 → 已列入 privileges.md。<br>P3：<br>• ① Jelly README:30 描述的是已删的文件；<br>• ② `material.invalid_data` 等错误码声明了两次；<br>• ① BACKLOG 补 `{home}/lingguang/models`；<br>• ② 两个 jelly 命名的测试文件改走公开入口后改名。<br>② 待核：插件自调用把受众洗成 user，见「统筹裁定」第 10 条。 |
| #708 / `23946656c` | 通过：Coding 的错误码用 `defineErrorCodes`；被拒的卡片保留是批准的预期变化；测试更严。 | ① P3：`ai-interaction-experience/spec.md:1123` AC-11 行的包来源仍写 b541a8e6 → 改成引用 vendor README。 |
| #726 / `f28088b2b` | P3：`prologue-run.ts:149` 抛不带码的 `new Error`，RCPT-365 的 `assert.rejects` 不判别错误。 | ④ 改用 `agentErrors.role_execution_exceeded`，并断言错误码。 |
| #728 / `a98967d7f` | **P2**。合同（`agent-host-write-checkers.ts:12`）写「裸名或绝对路径」，保存时（`write-checker-actions.ts:23-29`）不查 executable，SDK 却只认裸名（S-38）。带路径保存的，执行时一律被拒；cwd 指向 `.git` 也要到执行时才拒。 | ④ 在 A2-2 之前修：<br>• 保存时拒绝含 `/`、`\` 的 executable 和受保护的 cwd（`agent.write_checker_invalid`）；<br>• 合同注释改成「裸名，在 Host PATH 上找」；<br>• PA-28 补这两种拒绝。<br>④ P3：`agent-host-composition.ts:341` 抛普通 Error，统筹要求记的 BL 没记（和 :133、:155、:173 一起记）。<br>设置页放哪里，见「统筹裁定」第 1 条。<br>#692（§10.27）留下的规格矛盾已由本 PR 解决（:1823、:1873、:1902 改用 `config.tool.observation`），在此关闭。 |
| #721 / `7509b10ad` | P2：`computer-driver.ts:312`「菜单路径指向 Molis 窗口」这条拒绝，只在 `computer-use-reliability.test.ts:108` 里测（假 helper，能在 Linux 跑），不在 `test:security`。S-25 却写在「只在本机跑」那一列。 | ④ 挪进 `security-invariants-computer-*.test.ts`，S-25 列进「CI 里跑」。<br>④ P3：`computer-act.ts:78` 不再把裸数字当节点编号，可 PR 说「不改合同」→ CU-G11 和 `ui-surfaces.ts` 的注释写明。 |
| #731 / `09304a129` | P3。 | ④（手册）：<br>• Coding 那组小跑没跑，也没写「未验证」，BL-163 就删了 → §9.5 补上「只在助理上成立」，并跑 16 次。<br>• C4 和 BL-163 的记录缺 §16.3 要求的成本与时延 → 补上，或写「未知」。 |
| #730 / `f4207e064` | **P2**：删掉了「卡片准备途中改选区，卡片仍按原选区」那条用例，没有等价替换（旧的在 `contextual-todo.e2e:30-62`）。spec §21.6 说「断言不变」，不实。<br>资源 1,111,910→1,113,068（+1,158）按父提交的准确数字放行。 | ④（情境）：补回 Goals 卡片的版本，再给直接新建加一条：`/api/contextual/create` 在途时改选区，断言问模型的 focus 和建出的待办都是第一次的选区。<br>④ P3：<br>• S-40 的跨项目拒绝只在函数层测，要补一条经真实项目路由的拒绝；<br>• 撤销令牌是模块级的全局 Map，上限 50 个、跨项目共用 → 挂到宿主的情境服务，上限按项目算；<br>• `directEligible`、`pathValue` 是从 assistant 内部借的 → 挪进 `action-undo.ts` 共用；<br>• invoke 之前先 `signal.throwIfAborted()`；<br>• 「目录顺序」就是 capability_id 的字典序，在 spec 里写明，BL-174 注明是临时的。<br>浮条读不读助理的 `confirm_always`，见「统筹裁定」第 2 条。 |
| #735 / `35eea0614` | 通过：Proxy 拦住 RegExp，600 个节点 2 秒内拒绝；全仓库没有别处把模型给的模式编译成正则。 | 无。 |
| #729 / `ce4df86f1`，#736 / `7d0e7b09b` | P2 一条、P3 六条、待核一条；#736 是测试收紧，通过。<br>已核没问题的：<br>• 宿主文件和路由行都删了，冻结名单同步；每个项目一个实例，由 `project-plugins.ts:246-258` 装配；<br>• 库没动；拒绝 query 和 body 里不一致的 project_id；<br>• 资源放行 +2,231 B 按准确数字，用完的写成拒绝测试。<br>另记一条事实：#729 只过了 Verify 就合入，共享全量 39135082261 有 4/16 片失败，靠 #736 才修好。这正是 10-18「共享核心一定在批里」的理由。 | ② ③ P2：灵光的工作面仍在构建期装配：`ui-composition.ts:117,327`、`renderer.ts:121`、`goals-page-renderer.ts:98,300`。Runtime 返回的 views 没有用上 → 平台补项目级 Runtime 视图的通用渲染，然后删掉这三处手写，`host.md:40,43` 也不再教人写 `render<X>Contribution`。<br>③ P3：<br>• 进度可能发两遍（插件和服务各转一次）；<br>• 每条 POST 路由都声明了 36 MB；<br>• 测试有四处变弱；<br>• `native-plugin-api.ts:8` 的死别名，`personal-plugins-review-fixes.test.ts:191` 还在断言它；<br>• #736 的注释指错了测试。<br>①：<br>• `material.read`、`source.read` 加了权限却没升版本，已有的 MCP 授权会失效，要补影响说明；<br>• `max_body_bytes` 的上限文档里两处冲突（12 MiB 与 36,000,000）；<br>• migration.md 灵光那一行；<br>• S-03 的测试列表；<br>• RAC-36 没有测试点名。<br>③ 待核：灵光 e2e 在混合集成分支上失败，要在纯 main 上复跑才能定是不是 #729 引入的。 |
| #737 / `5972daefd` | P3：AGENTS.md:34 说旧行为「都标了 2026-10-18 改」，不成立：字面标记 9 处，别的写法约 27 处，还有 8 处没标。没标的是：`skills/molis-plugin-dev/elements.md:15`、`:111`，`host.md:134`，`EXTENSION-POINTS.md:83`，`RUNTIME-MIGRATION.md:9`、`:133`，`SECURITY-INVARIANTS.md:29`，`side-shelf/spec.md:270`。 | ① 统一成字面标记，补上没标的（`skills/` 避开全量时段）。决策日志里的行（spec:264、:441，RUNTIME-MIGRATION:29）留作历史指针。代码改完一处，就删掉对应的标记。 |
| #739 / `2e5bc0a7d` | 只改本 spec（落 §10.27）和交接，通过。 | 无。 |
| #706 / `149faac7d`（§10.27 记的 P2） | main 上仍在：`input-receipts-client.ts:408-409` 的 added 只用 `word(node.state)`，节点类型（:13）不带 owner，所以本人处理的步骤也显示成模型回报的。 | ④（回执）：<br>• 节点类型加 owner；<br>• person 的 succeeded、failed 显示「你标记完成／失败」；<br>• 补英文和 RCPT-366 的三种对照。 |

**在途**

| PR / head | 结论 | 遗留与归属 |
| --- | --- | --- |
| #733（Cognia 迁到 Home Runtime；审时是草稿 `873f9f773`，2026-10-18 19:03 UTC 由 yijunw0212 自己入队合入，`739e6cb29`，没有等统筹终审） | P3 四条、待核一条。<br>门禁数字全降：<br>• hostPluginFiles 26→24<br>• registerProvider 23→22<br>• pluginOutsideMentions 409→402<br>• rawFetch 85→84<br><br>RAC-42、RAC-43 覆盖停用、撤权、重启、取消、断连之后不留晚到的草稿。附件头固定，插件给的 mime 盖不过；45 MB 上限是用户 10-17 批准的。 | ② 待核，统筹已定：插件改用 `node:fs` 直接读用户给的绝对路径，平台没有对应服务 → 见「统筹裁定」第 11 条，并更正 §12.9。<br>P3：<br>• ① `web-request.ts:211`、`builtin-instructions.ts:18`、`EXTENSION-POINTS.md:123` 的注释和文档过时；<br>• ② 模型显示名的用例归错了 S-18；<br>• ③ 没有模型时给用户的提示文案变了，要写成预期变化，或者留原句；<br>• ③ 宿主和工作台点名 Cognia 的名单，随 W5-02 处理。 |

**统筹裁定（2026-10-18～19）**

原文没写死、需要统筹定的取舍，按「技术项看防腐后果，功能项取体验最好的推荐」定下：

1. **A2-3 写后检查器的设置页**放在平台自己的项目设置节，和工作区授权放在一起，不挂 Coding；执行器按会话声明启用，不看插件名（④）。
2. **浮条新建**（记成待办、记下灵光）是本人亲手点的，不读助理的逐项确认 `confirm_always`；spec §21.6:1399 照此改写（④）。
3. **助理侧栏的「当前约定」改名「AI 记下的约定」**，英文 "What the AI noted as agreed"。Goals 的「当前约定」是人确认过的事实，这里是 AI 的自称，没有核对过。回执 spec §9.2 改成「AI 自称、未核对、不可编辑」，GLOSSARY 记下两个词的区别（④）。
4. **角色版本**：角色实际拿到的工具集变了就升版本，经共用常量变的也算。写进 `skills/molis-prologue-ai`；两个助理角色和 todo 角色补升（④）。
5. **项目 MCP**：带项目作用域的调用者只管本项目的 MCP，跨项目拒绝，列表也按项目过滤；Home 级的本人可以管全部。补拒绝用例，S-36 的文字同步（②）。
6. **发起者核对**：`connectors.local.execute`、`cli.install`、`cli.connect` 一律用 `connectorAuthorizationInitiator` 核对同一用户、项目和会话，S-37 同步（②）。
7. **删项目时清插件数据**改为声明式：平台按声明的分区和文件删除，先经平台的后台作业服务停掉该项目的作业，不另设 Runtime 钩子。Images、Alchemist 删前要先停 worker，和 10-18「用现有声明、不加钩子」看似冲突，这样就合上了（②）。
8. **随宿主发布的插件跟着宿主版本升级**，这算安装信任的一部分，不算特权。
9. **S-32 去掉「内置优先」**：对象种类按插件分配公平的配额，按 plugin id 排序（②）。
10. **插件经 `services.actions` 调自己的动作时**，保留外层调用的受众。`allowModelDownload` 只认 Host 发的路由 control，或本人的直接调用（②）。
11. **Cognia 读用户指定的本机目录**，要一项带同意流程的平台服务，任何插件都走它。这是信任边界的变化，② 设计时先弹窗问用户。
12. **RUNTIME-MIGRATION §5.4 第 3 条**与 10-18 冲突，以 10-18 为准（① 改文档）。
13. **Characters 的界面落点**：处理器进 `modules/characters`，界面由 ui-host 或宿主登记的工作台面提供（推荐；② 做 W5-06 时确认）。② 10-23 确认：界面写成宿主登记的 UI 贡献，surface 声明目标 slot，经 UiHost `mountDeclared` 挂，不进工作台的手写行、不另开挂载转接文件。
14. **X-5 与「Goals 按标准迁」的读法**：
    - Goals 的事实只有 Goals 一个主人。`modules/goals` 和 `governance-collaboration` 只有 Goals 在用，它们的表随 Goals 插件声明，由 X-5 项目库服务按声明建，表名和数据不动。
    - 10-18 那一行说「仍归 Module」的，是多方共用的 Attention、Feed、Sources、Signals 等。
    - Artifacts、ProcessItems 是平台事实；Attention、ContextLedger 由平台经 services 提供。
15. **放置决定不变**：Alchemist、Images 仍在 Home 级。由此，Home 级实例要能按调用所在的项目给出 database、artifacts 和路由，这一项列为平台缺口（②）。

**待用户定（统筹按批弹窗，每项带推荐）**

- ~~#717、#719 的历史怎么处理~~：用户 2026-10-18 定「不改写，记一笔并加门禁」。记在 `docs/system/REPOSITORY-HYGIENE.md`「原始采集与开发机路径」一节（#756，`7e6955b93`）；门禁归 ② 平台，拒绝 `docs/` 下的大 JSON 和带用户名的开发机绝对路径。
- ~~Codex 与 ③ 怎么分工~~：用户 2026-10-18 约 19:10 UTC 定「停掉 Codex，③ 全接」，#733 让它合完。但此后 Codex 又自己合了 14 个 PR，见 §10.29。
- W5-02 之后，要不要把「新插件在包外被点名」的额度降下来（改门禁）。
- ② 排到时再问：PRIV-34 安装同意与 S-34、PRIV-38 连接器与 S-12、默认连线的同意，以及涉及真实 Home 存量的几项。清单见 privileges.md §5。

**本轮没做的**

- 「需复现」各条都还没有运行证据。
- 没有重跑任何上游 SDK 或真实模型的评测。
- 交接后新开的在途 PR，由统筹在各自合入前单独审，结论记入下一节。实际上 Codex 在停止决定之后又自己合了 14 个，事后复查见 §10.29。

### 10.29 2026-10-19 Codex 停止决定之后 14 个合入的事后复查（Claude ①；读 main `ffb3db076`）

用户 2026-10-18 约 19:10 UTC 定「停掉 Codex，③ 全接」。此后 19:27 到 10-19 00:23 UTC 之间，yijunw0212 账号又自己入队合入了 14 个 PR（#738、#742～#754），统筹都没有终审。合入后，main 末端的全量（`integration/main-check-20261019`，run 39184391653）第 6 片变红：`tests/interaction-no-crosstalk.e2e.test.ts` AC-05 的浏览器夹具清理在 `tests/fixtures/goal-browser.ts` 的 5 秒期限内没关掉 HTTP server，片内重试同样失败。前一晚在 `739e6cb29` 上的夜间全量是绿的，所以回归在这 14 个合入之内。

统筹按 §3 逐个复查了实际合入 main 的差异：每个 PR 一路只读审阅，读的是 `ffb3db076`，没有构建，也没有跑测试；「需复现」的各条都还没有运行证据。结论见下表。表里不重复 §10.28 已记的条目（#684 的本机所有者捷径、#727 沙箱缺服务、统筹裁定 7 与 15），只作引用。

| PR / 合入 | 结论 | 主要问题（P1/P2；P3 见归属会话的清单） | 归属 |
| --- | --- | --- | --- |
| #738 平台文件服务 / `4caeba1e4` | 有问题 | P2：`services.files` 只能由宿主可信启动条目选择，Manifest 不能声明（`packages/contracts/src/platform/plugin-files.ts:15`，`apps/workbench/src/builtin-plugins.ts:140`），属于 10-18 之后新开的内置私路。P3：S-18 的写法比代码严（写入接受插件自己拼的 control）；项目执行器的 files 落在 Home 存储，不按项目分区，删项目时不清；合入时没有消费者。 | ② |
| #742 后台作业服务 / `be233271a` | 通过，有 P3 | P3：S-31 没写后台权限可以活过请求这一例外；`mcp-background-authority.ts:28` 每 200 ms 同步读一次偏好；沙箱插件拿不到 background；合入时没有消费者。 | ②（S-31 文字 ①） |
| #743 Images、Jelly 迁到共用模型端口 / `1da96e18c` | 有问题 | P2：`services.model.configuration`、`services.imageGeneration`、`onProjectDeleted` 只给可信目录条目，沙箱插件和 Manifest 都拿不到。P2：`PluginAppContribution.onProjectDeleted` 是新加的 Runtime 生命周期钩子，与 §1 10-18「用现有 project_data 声明、不另加 Runtime 钩子」和统筹裁定 7 冲突（`apps/local-host/src/plugin-project-cleanup.ts:38-41`）。P3：Jelly 有死导出 `ownJellyStores`，`openJellyStore` 是绕开 Runtime 的第二条 SQLite 路径；Images 先改 Connector 绑定后写库，两步不是原子的。 | ②；Images、Jelly 部分 ③ |
| #744 模型回执与 query 委托 / `dca26fd13` | 有问题 | P2：Home 路由和项目 Runtime 路由的 `granted` 取 `LOCAL_OWNER_PERMISSIONS`（`apps/local-host/src/home-plugin-http.ts:101,109`、`web-request.ts:153`），对 Manifest 仍是 `kind: "native"` 的 Runtime 插件，路由层的权限门总是放行。动作层的 `requireGrant` 还会拒，所以眼下没有越权结果；但这是把 #684 的捷径扩到了所有 Home 路由。需复现：撤掉 `images:read` 后 GET Images 的 jobs 路由，应在路由层以 403 拒绝。P2：合同要求在提交前调用模型结果的 `validateResult()`，平台却不强制，除 PPT 以外的内置消费者都把 result 丢了（Jelly、灵光、Todo、Form、Dataset）。P3：`invokeQuery` 与 `query_only` 没写进 Skill、手册和 action-architecture spec；squash 正文列了约 150 条别的 PR 的提交标题。 | ②；各插件 ③；文档 ① |
| #745 Owner 文件服务 / `52f84e122` | 有问题 | P2：没有生产消费者（Shelf 还没切过来）。P2：这是第二套文件服务，与 #738 的授权规则不同。P2：`initialize_owner_files` 是只有内置目录条目能用的启动钩子，与统筹裁定 7 冲突（`apps/workbench/src/builtin-plugins.ts:77-78`、`apps/local-host/src/plugin-platform.ts:58`）。P3：平台层 import 手写的内置目录，每次启动项目平台都 create 一遍；权限位 0o644/0o755/0o555 偏宽（需复现）；路径不存在时抛原始 ENOENT。 | ②；Shelf 接线 ③ |
| #746 项目成果与过程项的恢复查询 / `dfa3914be` | 通过，有 P3 | P3：成果的 `head`、`readOwn` 只比 `producer_plugin_id`，过程项还比签名和 owner。这是旧行为，本 PR 没改，但两套口径并存。 | ③（按裁定 14 以后归平台） |
| #747 Alchemist 执行队列排空与显式恢复 / `dee72e041` | 有问题 | P2：`runs.continue` 拒绝时抛普通 `Error`，六个码（`alchemist.job_lease_active`、`resume_context_changed` 等）没有用 `defineErrorCodes` 声明，调用方只收到 `actions.execution_failed`，原码混在 message 里（`plugins/native/alchemist/src/studio/server/services/job-resumption.ts:84,102-104,111,118`）；测试只写裸的 `assert.rejects`，没核对码。P2（统筹裁定 9）：Exploration 在模型结果未知的 `generating` 检查点上继续时会再调一次模型，`ResumeView.unknownCall` 却只对 Lens 置位。P3：`runs.list` 先取最近 100 条再按状态过滤，更早的待恢复任务看不到；`runs.continue` 运行时按任务类别另要 `alchemist:generate`、`alchemist:collect`，声明里没有（统筹裁定 10）；`runs.resume` 实为只读查询，名字像命令；`scripts/gates/page-assets.mjs:243` 用完的 workbench 放行条目没删。 | ③；门禁条目 ② |
| #748 PPT 迁到 Runtime / `a0ceae7e3` | 有问题 | P2：`apps/local-host/src/creative-artifacts.ts` 仍导出 PPT 的三个旧端口（`:21,28,57`），并 import PPT 插件（`:6`），已没有调用方。同一文件里 Dataset 的三个端口 #749 已删。P2：工作台仍在构建期按插件名装配 PPT 的界面（`apps/workbench/src/ui-composition.ts:36-45,109,282`、`renderer.ts:94-104`、`goals-page-renderer.ts`），Runtime 声明的 `views` 没用上，与 §10.28 对 Lingguang 记的 P2 同类。P3：`docs/system/RUNTIME-MIGRATION.md` 的状态与数字过时。 | 旧端口 ③；按 `views` 挂载的通道 ②；文档 ① |
| #749 Dataset 迁到 Runtime / `25dfd479a` | 有问题 | P1（已复现，2026-10-19 由 #761 `975686cc7` 修好，`W5-01-DATASET-06`：撤掉修复时，在入口到 begin 之间撤权就多写一份 intent）：推广在 begin 提交之后、`artifacts.publish` 之前不再核对原调用者的取消和撤权（`plugins/native/dataset/src/promote.ts:51-63`）；`publish` 以插件身份执行，complete 才再过一次 `beforeEffect`。PPT 在 #748 用 `current()` 与 `beforePublish` 补了这个窗口，Dataset 没跟上。两步之间可能只隔几个微任务，交错能否真的落进来要靠用例证明。不管能不能复现，都照 PPT 补齐。需复现：仿 `tests/ppt-promote-authority.test.ts` 新建 Dataset 的同类用例，在 begin 之后、publish 之前撤权或取消，预期成果数为 0、发布不进入 completed。P2：模型结果只取 `.text`，丢了 `validateResult()`（统筹裁定 5）。P2：工作台构建期装配 Dataset 的界面，同 #748。 | ③；通道 ② |
| #750 Workflows 改用 store 端口 / `beffc61d8` | 通过，有 P3 | P3：`ownWorkflowsStores` 只有测试在用，生产的 `actions.ts` 仍走 `withStore`；`list()` 每处理一行都重新 prepare 一次计数查询。另有旧问题：`docs/releases/v0.3.0.md` 的 Todo 行还写 `TODO_STORE_BASELINE`。 | ③；发版文档 ① |
| #751 Images 稳定翻译键 / `b80d3f789` | 有问题 | P2：稳定词典登记在 `BUILTIN_PLUGIN_CATALOG` 的 `messages` 字段，翻译门禁的 `MESSAGES_ROOT` 写死这份文件（`scripts/gates/translations.mjs:66,258,537-541`），第三方或生成的插件给不了稳定键词典。P3：`images/src/client.ts:226` 借用别的主人的键，拼成碎句。 | ②（并入 W5-02；门禁要改，先问用户）；Images ③ |
| #752 Module 存储收到服务边界后面 / `45a7762f2` | 通过，有 P3 | P3：入口仍导出没有外部消费者的装配件（`modules/private-work-context/src/index.ts:40,44,46`）；`GovernanceEventDecisions` 直接写 `goal_event_trusted_decisions`；门禁只按名字认 Repository、Store。P3：改了门禁脚本 `scripts/check-package-boundaries.mjs`，没在 PR 里写，也没问用户。改动只收紧。 | ② |
| #753 Pages 编辑器拆分 / `eed596bfb` | 通过 | 巨大单元 135→128，mount 828→451 行，还修了 main 原有的 hidePop 缺陷。P3：`docs/system/HUGE-CLASS-MIGRATION.md:304` 与 W5-10 的状态句还写着「待 CI」。 | ① |
| #754 后台作业读失败不冒充删除 / `ffb3db076` | 通过 | 与 ③ 线的 `88d07caec` 是同一修法（生产文件 blob `5dd287d11..f12bd6926`），RAC-61、RAC-62 守住。§10.27 #675 行与 W5-13 补片标题的状态句已随本节改。 | — |

**统筹裁定**

1. **不回滚，向前修。** 不 force push；每个 PR 合入时 Verify 都是绿的；查到的问题都能向前修，没有一条需要先把代码撤出 main。主线全量的红由 ③ 当天修（Codex 的活由 ③ 全接）。
2. **10-18 之后新开的「只给内置」的服务一律记进特权清单**，和旧特权一样由防腐线改掉。它们是：#738 `files`；#743 `model.configuration`、`imageGeneration`、`onProjectDeleted`；#745 `owner_files`、`initialize_owner_files`；#751 `messages`（[privileges.md](privileges.md) 的 PG-102～PG-106）。改掉之前，合同注释、手册和 Skill 里描述它们的地方都要标「2026-10-18 改」。往后的 PR 再新增这类服务，审时按 §3 第 2 条当 P1 拦。
3. **文件服务只留一套。** 以授权更严的 ownerFiles 为准：写入只认当前动作的作用域，不接受插件自己拼的 control。files 合并进去或改成委托给它，Images 随之迁移；进 Manifest 声明（`storage` 加配额）。由 ② 定方案，取舍记在 §1。
4. **`onProjectDeleted` 与 `initialize_owner_files` 按裁定 7 删掉。** 删项目时，平台在 purge 之前，先按项目取消 `services.background` 受理的执行和 Runtime 自己的等待；Images 的作业改走 background。初始文件改成 Manifest 声明的种子，或由插件在 start 里自己写。
5. **模型结果的复核由平台兜住。** 在动作的写事务或最后一次 `beforeEffect` 里，平台自动执行本动作所有待验的 `validateResult()`，作者忘了也不会按旧绑定提交。补一条用例：模型返回后换模型，再写库，应被拒。
6. **路由层的权限只取安装授权的交集。** Runtime 条目不进 `NATIVE_OWNER_PERMISSIONS`，与 #684 在同一处修。本机所有者权限只用于 Host 自有的服务。
7. **#752 改门禁脚本，事后认可。** 认可只因为它只收紧。改门禁仍要先问用户；往后没问就改的，审时当 P1 拦。
8. **平台服务与第一个消费者同批合入。** 否则就在 `specs/BACKLOG.md` 写明消费者和截止日期。#738、#742、#745 都是先合服务、后来才有消费者，或者至今没有。
9. **Exploration 的恢复与 Lens 同样提示「可能重复计费」。** 检查点停在模型结果未知的地方（`generating`）时，继续就会再调一次模型；恢复视图对两类任务都置 `unknownCall`，由人确认后才继续。这是为了恢复可见（S-18），按 P2 修，归 ③。
10. **动作可能要的权限都写进声明。** `alchemist.runs.continue` 把按任务类别另要的 `alchemist:generate`、`alchemist:collect` 写进 Manifest 与授权视图；运行时再按任务类别收窄，只收窄不放宽。往后别的动作按输入另要权限的，也照此办。

**还没做的**

- 主线全量的红。重跑（同一 run 的第 2 次）第 2 片又红在 `tests/side-shelf-in-hand.e2e.test.ts` 的 W3-C AC-S04：Shelf 侧栏 iframe 里的选中条没出来，焦点停在 Pages 编辑器上，片内重试也红。其余片被 fail-fast 取消，还有没有别的红不知道。两处都交 ③，用 `739e6cb29` 的干净基线工作树比对。2026-10-19 更新：AC-05 由 #760（`12017cc87`，关闭项目时结束它的等待，不再等到超时）修好；main 加 #760 的集成全量 run 39194646754 十六片全绿，main 的 CI 也绿。AC-S04 判为既有的时序偶发，不是这 14 个合入引入的；③ 在 #763 加了超时时记下页面现场的诊断，根因定下后派给情境栏的主人修。
- 「需复现」的三条：#744 的路由层拒绝、#745 的权限位、#749 推广窗口里的撤权。#749 那条已复现并由 #761 修好（见上表），另两条还没有运行证据。
- 合入时间核对：14 个 PR 全由 yijunw0212 自己入队合入，首个 #738 在 19:27 UTC，最后一个 #754 在 00:23 UTC。

## 11. 平台逻辑复查（2026-10-07，补第一步按 Goal 收窄的范围）

用户更正：上一轮逻辑复查只查了 Goal 的完成规则与写进 Goal 的管理门。本轮按事实主人分 8 个区（插件基座、动作服务与授权、成果库/放置/上下文账本、搜索/记忆/助理、个人插件、文稿与数据插件、工作流插件、Coding/创作台/炼金术士），只读查逻辑缺陷，每区一个对抗核验者逐条复现或驳回（复现脚本在会话临时目录 `logic-review/`）。

结果：67 条候选，4 条驳回，63 条成立（高 7、中 25、低 31；53 条已复现，其余读码确认）。按主题分 15 组修，每组一个 PR，先补回归用例再修：

| 组 | 条目 | 状态 |
| --- | --- | --- |
| 插件生命周期（停用后升级被重新启用、卸载后不能装别的版本等） | #1, #3, #60, #4, #5, #6, #7, #10, #12 | 已合 main：#313；内置插件一律跟当前构建 #337 |
| 工作区默认接线覆盖用户固定的成果版本 | #2, #19 | 已合 main：#301 |
| 成果发布与归属（移出再移回后固定成旧版本、Agent 固定后本人不能再固定、个人范围读取不查归属等） | #15, #41, #16, #17, #18, #20, #21 | 已合 main：#304 |
| Feed/Inbox（定时拉取失败后每 30 秒重拉、归档只关一条 Inbox 等） | #50, #51, #53, #54, #57, #58 | 已合 main：#302 |
| 搜索打开时把读不到的对象当已删并移出索引 | #22 | 已合 main：#305 |
| 动作队列与身份（串行动作被并发动作调用时绕过队列、等模型的动作占住项目队列、进度能力从输入取身份等） | #9, #11, #13, #14, #61, #52, #63 | 已合 main：#308 |
| Todo（整理覆盖本人后改的字段、request_id 跨项目全局） | #55, #56 | 已合 main：#306 |
| 助理（开轮前就标记已告知、作业跟两次、撤销无占用、归档不停定时轮等） | #23, #25, #26, #29, #31 | 已合 main：#311 |
| 记忆（写入门按模型的 same_as 自动保留别的工作的建议、撤销自动记忆删掉本人明说的、recall 无 beforeEffect） | #24, #27, #32 | 已合 main：#338 |
| 个人插件（Jelly、灵光、Cognia） | #33, #35, #36, #37, #38, #39, #40 | 已合 main：#310 |
| 文稿与数据插件（交接标题超长、Form 来源取自输入、AI 发请求前不复核权限等） | #42, #46, #47, #48, #49 | 已合 main：#303；问卷停止收集时拒绝非本人提交 #326 |
| Workflows（判断拦下的运行重载后丢原因、并发令牌不变） | #43, #44 | 已合 main：#307 |
| 删除项目留下别的主人的数据（弹窗已定：各主人一起删、可重试） | #30, #34, #45, #59, #62 | 已合 main：#325（插件各自声明项目数据）；真实 Home 维护四 10-09 已做；W2-07（#361）补上漏掉的 Sessions 主人（W2-18 E-1）：`modules/private-work-context` 导出 `sessionsProjectData`，回执多一步 `sessions`（关联边经 Ledger 取消，只追加的 Ledger 留下 id 的历史）；以前删项目留在 `sessions/sessions.db` 里的 Session 记录按 10-08 已定的做法先列后删，本片没有读真实 Home；2026-10-10 在维护六之前的备份上列出 1 个空会话（`project-0478192a`，共 56 个 Session），按用户 10-10 的「先列后删」，已于 10-10 按产品自己的 purge 步骤删除：56→55、孤儿 0、integrity_check ok，§4.1 维护六「做了什么」末尾的「另」已有完整结果；10-12 接续线程只读复查仍为 55 且无该项目的最新活跃关联。原「删除处理中」已过时 |
| 助理记忆工具（弹窗已定：核对原话、忘掉可撤销） | #28 | 已合 main：#338（「你说过」只认本人一整条消息） |
| 旧版 MCP 授权文件（按「不留兼容」不修） | #8 | 不修（§1） |

逐条原文（问题、位置、场景、核验理由、复现脚本、修法提示）保存在会话临时目录 `logic-review.json`；修复 PR 的描述逐条引用编号。

## 12. 完整要求复查与完成裁决（2026-10-12）

**结论：复查所见的整改仍在执行，整条线未完成。** 本节逐项覆盖两份任务书，纠正进度表达，不替代原路线。已有证据支持已完成片段；不能从已合 PR、门禁变小、测试用例存在或一次全绿推出全部要求达成。整线实现、PR 与回归的接续负责人仍为防腐会话 `01a130de-5470-7223-827e-b28663ee7e06`；本轮协调复查负责本 spec 的裁决与遗漏接续。用户后续授权的两个独立修复会话见 §12.6，各自本地准备，统一安排验证和整合。真实 Home 写入、他人成果清理继续按 §1 的明确边界执行。

**证据切点。** 代码复查以冻结 I6 `af0fe957f8fbeff94c92fa6b1a8f3899694d0660` 为主，度量另列 main `490251d1e82b9db8d58922bbd2e5ef17f1011bf7`（#457 合入后）；I6 内含未回归完、未全部合入 main 的 Home/G1/G3 候选，不能把两列混称已发布。进度文档位于 `feature/anti-corruption-i5-progress-1012`，更新前 HEAD `69d3ef3a1`；保留接续会话已有的 I6 预检与冻结记录。未修改 I6、主检出、他人工作树或启动第二轮构建/回归。切点之后的 PR 收口继续记 §10，不让一张滚动 PR 表改变本次读码和运行证据的适用范围。

### 12.1 系统整理全部 15 节与防腐工作内容的对应

下表「部分」表示已有实现或局部有效证据，但该项尚不能验收；「未验证」不等于已确认代码有缺陷。涉及具体运行结果时以 §12.5 的原始记录为准。

| 系统整理要求 | 防腐任务书工作内容 | 本次核对的实现与证据 | 裁决与接续 |
| --- | --- | --- | --- |
| 1 现场、授权与归属 | §0、§4.7、§5 | 核对工作树、开放 PR、主检出脏改动、I6 runner 与构建/浏览器锁；原线程交出 progress 文档写权，保留单一实现 writer | 本轮现场保护通过；既有在途任务不重复启动，主检出不清理。最终工作树收尾仍按 W1-23/W6-06 |
| 2 全部清单与预期行为 | §3、§4.4、§4.9、§4.12 | `scripts/workspace-packages.mjs` 与包清单门禁重算 71 包；SSOT、§5.1、插件/AI 清单有登记 | 部分：包事实与现行插件成员更新不能代替逐包审查，W1-18；第一步预期基线与当前差异须随 W6-05 复核 |
| 3 模块划分、代码放置、调用链 | §4.2–§4.5、§4.8 | 追踪 ActionService→dispatcher→owner handler→存储，Runtime→监督器→模型服务；N-03 已按用户决定定义平台产品服务；跨 owner SQL 已有门禁 | 部分：137 处浏览器空 catch、157 个巨大单元及宿主插件专属接线仍在；W1-18、W4-05–08、W5-07–11，不为搬包而推翻 N-03 决定 |
| 4 契约、注册、协议 | §4.2、§4.6、§4.10、§4.13 | 动作注册、输入/输出 schema 校验、audience/权限/依赖与 `beforeEffect` 在共同服务；Manifest 与 Host 动作快照已入 CI；`tests/plugin-declaration-rules.test.ts` 的字面量预期和既有变异证据可复用 | 部分：快照固定声明，不能证明所有生产消费者与真实返回正确；W2-18-AC、W3-05/07/09、W4-02 |
| 5 自动发现与扩展 | §4.6–§4.8、§4.10 | Runtime 的贡献撤销与监督器 generation/epoch 检查存在；`project-plugins.ts`、`builtin-plugins.ts` 和装配冻结测试仍为手工清单；扩展点文档列 15 个方向和六个演练 | 部分：8 Runtime、18 构建期，声明式探针和 Form 样板未交付；W4-01/03/04、W5-01/02、W6-01。不能用 Issue 成功接入证明只改自己的包 |
| 6 逐插件完整性与组合使用 | §4.6、§4.9–§4.11、交付 10 | 首轮逐插件结论、§11 的修复、平台接点与 11 个组合场景可复用；原表是当时 26 插件，不能覆盖新增 Issue | 部分：对现行成员重对空/首次/无模型及异常、取消、撤权、并发、重启、组合路径，W2-18-LC；迁移后的生产者再由 W6-02 验证 |
| 7 数据、状态、事件、生命周期 | §4.1、§4.2、§4.10–§4.11 | SQLite baseline 明确拒绝错版；项目删除有唯一服务；DOM 事件登记与门禁；模型调用在派发前与返回前复查；模型测试用 barrier 制造取消/停用、旧 client 重启后失效 | 部分：本次另发现精确授权复核后异步窗口的 P1（§12.3）；已有真实交错测试只证明覆盖的生产路径。全插件/后台任务生命周期及多窗口、重启须 W2-18-LC；全部库唯一登记与快照仍 W4-11/W5-16 |
| 8 AI 与 Prologue | §4.2–§4.3、§4.14、§4.17 | 生产模型端口经 `hostTextGeneration`→`horizontal/agent-host`，`@prologue/sdk` 的 workspace 依赖只在该包；插件模型校验 owner、声明、并发调度、指令与预算；旧实验直连已随插件删除 | 部分：真实模型/外部账户、全生产 AI 入口的恢复未全验；仓库仍使用现有 side-panel-memory tgz，不能把上游补丁或 #408 在途接入当成本仓已采用。W3-06/09、W5-11、W6-03/05 |
| 9 前端质感、交互与动线 | §4.8、§4.9、交付 10/12 | 查看首轮实际截图（包括助理无模型与保留输入），核对真实浏览器用例的 HTTP、持久化、焦点及失败恢复断言；首轮截图主要为 1440/390、中文亮色、无模型 | 部分：局部暗色截图/键盘断言不覆盖全站；第二轮 W2-18-FR，视觉基线 W4-12、皮肤 W5-05；不得把截图存在记作读屏/离线/真实 AI 已通过 |
| 10 配置、安全、性能、升级、发布 | §4.1、§4.11、§4.16–§4.19 | 安全不变量表有拒绝测试并在 CI 执行，密钥扫描、schema 版本拒绝、来源与产物核对存在；C 端只出方案符合原范围 | 部分：公开 URL 校验仍分散、上游注入防护未等于当前包已带、macOS sandbox/桌面 IPC 的证据边界见安全表；周期/空闲负载、统一备份与真实 Home 新版验收仍 W4-09–11、W5-12/16/17、W6-05，不在此擅自做 C 端实现 |
| 11 清理无用、重复、过时内容 | §4.1、§4.9、§4.12、§4.15、§4.17 | 旧 MCP 别名、六个空合同子路径、Casebook/Experiments、历史 schema 升级链已删除；9 个 compat 标记的保留理由在 §4.1；旧名、截图、vendor、根目录有只降门禁 | 部分：旧装配、typed、模板脚本、旧皮肤、剩余重名/日志仍按 W3–W6 清理；不因已归档文案出现旧名就删除历史证据 |
| 12 测试是否表达有效预期 | §2、§4.8–§4.9、§5、§7 | 抽查模型真实异步交错、storage baseline 数据与回滚、事件恢复的 UI/持久化与失败保持输入；I5 三个失败经基线与生产合同对照，保留原失败 | 部分：855 内部引用不是 855 无效测试，公开 import 也不是质量证明；W2-18-TE 审断言、Mock、skip 与后续可观察行为，W2-10/11 继续降耦合。事件恢复用例直造安装/事件只支持恢复消费端，不能替代生产插件事件发布链 |
| 13 手册与 Skill | §4.12、§4.14 | 阅读插件开发与 Prologue Skill，核对唯一模型入口、注册/授权/副作用要求；文档引用、380 份创作台答卷回放及对应 CI 已存在 | 部分：离线答卷回放支持解析/校验，不能证明新文档可完成所有开发场景；最终手册、迁移样板及隔离 Home 创作台 smoke 仍 W6-03，受测树冻结期间不改 skills |
| 14 实施顺序、真实验证 | §5 | 第 3 波按候选整合后分片，I5 留下 raw failures、干净基线和定向修复结果；I6 独占冻结回归进行中 | 本轮纪律通过；最终证据未齐。优先收口新确认权限/状态缺陷，再做结构迁移；不为缩小数字改产品语义，不叠加另一全量 |
| 15 交付与完成 | §6–§7 | 本节把要求、代码、证据、未完成与原路线对应；原始日志/失败/跳过保留 | 未通过整线验收，见 §12.4。复查完成不等于整改完成；原线程继续已授权实现与验证 |

### 12.2 附录 A 与第一步遗留的现行裁决

§3.1 的长表留作历史出处，以下为当前修正；同一编号不再开另一套问题编号。代码位置及有效原始测试证据分别见 §12.1、§12.5。未写「运行通过」的静态核查不能提升成产品验收。

| 编号 | 现行结论、证据与原路线归属 |
| --- | --- |
| R-01 | 未完成：装配冻结测试与监督器为 8 Runtime/18 构建期；批准迁移计划在，但 Form 样板尚未交付。W4-04、W5-01/02、W6-01 |
| R-02 | 已确认旧 MCP 兼容工具退役；当前管理 MCP 直通 Goals 的剩余路径属 N-12/W3-07，不能混称旧名回流 |
| R-03 | 未完成：宿主仍承载插件适配与模型接线，32 个按插件命名宿主文件、40 处 registerProvider 是 I6 门禁记录。W3-06、W5-11 |
| R-04 | 已确认旧个人助理路径未回流，保留删除证据；现行系统助理拆分属 W4-05/W5-10 |
| R-05 | README 已收成两份，PRODUCT/SSOT 主线已更新；其历史段落数和合同 subpath 数不代表当前值。最终术语、事实与手册复核 W6-03 |
| R-06 | 不能记无失败：I5 6,039/6,051，三项失败、九项跳过；三文件修后 23/23，I6 尚未结束。W6-05 |
| R-07 | 未完成：浏览器模板代码与 137 处空 catch 仍在；页面预算仅控体积。W4-04、W5-04/13 |
| R-08 | 部分：共同错误模型/SDK 路由已实现，多批 owner 接入继续；I6 仍 80 个 Error 子类，不能据数字判断每个都应删除。W3-02/10、W5-13 |
| R-09 | 部分：schema 基线与离线恢复用例已有；统一库登记和用户快照命令未交付。W4-11、W5-16 |
| R-10 | 已确认 spec 状态、索引/分类/引用门禁存在；本次纠正正文假完成，门禁不能代替内容真实性裁决。W6-06 |
| R-11 | 已确认六个空合同 subpath 已删且零容忍门禁存在；现存 package/kernel/testing 描述符按已有决定保留，不新增删除范围 |
| R-12 | 部分：I6 `as unknown as` 193，AST/lint 只降门禁已生效。全量清零不是用户已定目标；必要重构归 W2-10/11、W5-08 |
| R-13 | 未解决主检出工作状态：本次看到 main `9da180833` 与未提交他人成果，不 reset/clean；当前隔离复查与受测树不依赖它。主检出整理遵循独立归属与授权 |
| R-14 | 数量已显著缩小：I6 门禁 318 个入库 `.impeccable` 文件且只降，历史 1,085 不能当现状；保留文件仍按引用规则审查，W1-23/W6-06 |
| 皮肤 | 已完成：W5-05 按 `quiet-paper`、`personal-shell`、`personal-workbench-v2`、`-v3`、`calm-desktop` 的顺序一片删一层，五层都已删（第 1～5 片，见 §W4-12 下的记录） |
| Goals UI | 部分：W5-06 第 1 片（2026-10-23）删了 11 个挂载转接文件，通用挂载器（UiHost `mountDeclared`、`createSurfaceRenderers`）接上，外壳 renderer 改名 `shell-page-renderer.ts`；剩 `goals-document-routes.ts`、`goals-fragment-renderer.ts`、`goals-planning-request.ts` 三个读路由与片段组合（不是挂载转接），按 Manifest `views` 挂载的通道是第 2 片；不能把外壳错移进业务插件 |
| Server | 按用户决定保留 IM/讨论；表归属与 Home 登记已有修复。实验的独立启动器不包装成生产入口，不删产品讨论 |
| N-01 | 已确认遗留第二铃铛/占位已清，真实事件恢复用例消费现行唯一注意力入口；后续新 UI 以现行产品决定为准 |
| N-02 | 已确认仅一份当前 Prologue tgz，旁置来源/摘要与历史补丁记录有门禁；不等于 N-14 上游接入完成 |
| N-03 | 按用户决定收为平台产品服务，代码不搬；相关层规则与说明保留，W4-08 不再按旧提议迁往 modules |
| N-04 | 部分：基本合同 C1–C8 与 G 缺口已有逐条去向；交叉声明检查/调用 id 已推进，真实生产者的新合同全生命周期仍 W4-01/02、W6-02 |
| N-05 | 未完成代码身份收口：Characters 的 UI 在设置，Runtime/安装身份仍待按决定并入宿主。W5-01 |
| N-06 | 旧「CI 不跑产品」已失效：产品子集及 Linux 报告作业存在，Verify 的现行依赖仍按 §1 已定阶段，不擅自把非必需报告改为门槛。W2-16/W6-05 |
| N-07 | 本机工作树仍多且有活跃归属，不按数量自动删除；原 W1-23 与各线完成后清理 |
| N-08 | 已有按单元 AST、merge-base 只降门禁，183→157；剩余拆分未完。W4-05–07、W5-07/09/10 |
| N-09 | 已确认协作文档、AGENTS 入口、冻结与锁规则存在；本轮实际沿用，不能代替每条在途线遵守情况的持续核对 |
| N-10 | 部分：同口径 1,054→I6 855，内部引用/混源门禁有约束；W2-10/11 继续。用户已拒绝固定 600 目标，按「不定数字、只降不升」验收 |
| N-11 | 部分：SDK 迁入后合同纯度剩 6、Host `export *` 11、Module Repository/Store 导出 21；W3-03、W5-08/09 |
| N-12 | 已定对外只走动作，尚未完成：typed 引用点 244；管理 MCP、CLI、Agent/函数等分片按 §10 推进。W3-07、W6-01 |
| N-13 | 已确认 Biome/原生静态检查、API/页面预算入 CI；存量告警未清零，Jelly Whisper 构建边界见 BL-122，不能泛称全仓无静态问题 |
| N-14 | 部分：收敛方案经用户确认，I6 仍用旧命名的当前 tgz；上游结果与本仓采用是两件事，#408 等在途接入不得记已完成。W1-20/W6-03/05 |
| N-15 | 历史迁移/旧别名已大批删除、就地补表为 0、剩余 9 标记逐项解释；仍须核全库登记、旧服务入口与最终真实 Home，新发现历史读取分支不能用登记保留机制放行。W4-11/W6-01/05 |
| N-16 | 已交付（2026-10-16）：隔离并发由 #497 做完；同口径测量见文首「W5-12 测量」：全量 1,017 个文件 58.2 分钟（之前串行 76–78 分钟、762 个文件），冷构建 81.9 秒、增量 10–29 秒；全量里唯一每次都红的收尾竞态（HOST-CLOSE-01）同片修掉 |
| N-17 | 已确认 API 签名快照与动作声明快照入 CI；I6 API 60 份/2,284 声明，刷新无新增写入。实际生产输出仍须 W2-18-AC |
| N-18 | 术语文档已存在，内部改名/界面批准边界仍 W5-14；不把旧词字符串总数当语义重复的证明 |
| N-19 | 纠正：发布策略/版本检查已存在，内置跟随当前构建已在 Runtime 实现（#337）；原「尚未实现」、根目录 outputs/.zcode 等为历史现场。下一产品版本及最终发布未完成，W5-15；未因此授权发布 |
| N-20 | 已确认 Rust/Swift/shell/Python 检查入 CI，有登记/覆盖边界；原「无检查」已失效。新原生文件需随实际 PR 通过对应检查，Jelly Whisper 仍 BL-122 |
| C 组 | 方案交付，不做本步未授权的 C 端产品：现行 `c-end-readiness.md` 的里程碑/成本/依赖与尚待决定项保留；不能称自动更新、公证、多平台、观测、安装信任已经实现 |
| 第一步交接与 PMR/AR/S 列表 | §3.4 与 §9.1 逐项历史证据保留；已删功能按用户决定退役。最终 main 的场景 1–8、能力/UI 差异和真实 Home 仍 W6-05，旧全量/截图不可直接外推到 I6；未看到新证据的行维持未验证 |

### 12.3 必须收口的遗漏与验收

这些均来自原始要求，不是新增建议性重构。防腐接续会话负责整线接续，各独立片的负责人见 §12.6；各包主人负责被分派的事实/实现，协调会话维护唯一结论。P1 表示整线验收的必要缺口，不能据此推断每个包都有 P1 产品缺陷。确认的运行时缺陷须另写触发、根因和最小修复，不拿「补审查」替代修 bug。

| 既有路线/验收编号 | 严重性、根因与影响 | 必须动作与验收方式 |
| --- | --- | --- |
| W3-09 / W2-19（S-08/S-18） | P1 授权竞态，源码已确认、复现待跑：共同 `beforeEffect` 在精确授权之后还 await 权限与 Host 可用性检查；最后只用初始 `allowed_actions`，期间撤销精确动作可能仍写。MCP 权限并集不能识别保留同权限 B、撤销 A 的差别 | 唯一 writer 优先以真实 MCP 授权文件、Form SQLite 与可控后续可用性检查复现；`form.questions.ai`（#532 起是 `form.questions.draft@1`）最后检查后写题目的路径可触发。修共同入口，断言 A 被拒、业务记录不变、B 不能替 A 授权、重新授权恢复；不要每插件补兜底。涉及 kernel/MCP，按共享核心整合验证，I6 结束前只准备源码。依据：`packages/kernel/src/action-service.ts` 119–124/446、`apps/local-host/src/mcp-action-client.ts` 16–26、`local-host.ts` 99–106、Form `actions.ts` 109–110；现 `tests/action-before-effect.test.ts` 只覆盖模型等待时撤权和授权等待时换提供方，未覆盖此窗口。 |
| W1-18 | P1 完成声明失真：把事实表 PR 当作三阶段逐包审查，71 行全待审仍写第 1 波全完；owner/放置错误可能遗漏 | 按 §5.1 已登记的深 11、中 43、浅 17 逐包写职责、依赖方向、变化原因、代码放置、重叠和必要动作；每行有源码依据与裁决。未完成项不得改成已审。按风险读码，不靠文件数/门禁替代 |
| W2-18-FR | P1 验收范围遗漏：首轮亮色无模型页面和部分浏览器测试被当成前端整体；暗色/英文/辅助技术/异常恢复未全覆盖 | 在已有 frontend-flow-walk 中接续同一表，复用有效截图；核关键路径的键盘/读屏、三种宽度、暗色/英文、离线/失败/无权限/部分成功、多窗口与真实模型。状态、操作、反馈及输入保持需实际操作；受限项写明，不伪装通过。接 W4-12/W6-05 |
| W2-18-LC | P1 生命周期证据缺口：首轮差集名单过期，§11 的 15 组修复不覆盖所有插件/官方接入 | 按现行成员重对安装/启用/发现/调用/停用/撤权/卸载/升级/重启；按有意义的路径制造真实交错，验返回、持久化、副作用、重试和下次可观察状态；组合场景按原 11 条更新。已删 Experiments 明确退役，Issue 纳入。批准的例外写理由，迁移后接 W6-02 |
| W2-18-TE | P1 测试有效性缺口：把 import 耦合下降、用例数和全绿当作需求覆盖 | 沿需求与生产路径审断言/Mock/fixture、期望的独立性、只断言不抛错、内部注入、skip/排除项；实际缺陷才补定向回归，关键疑点可变异。保留原失败分类与干净基线，不为覆盖率造矩阵、不改语义求绿。结果记回原需求/用例而不造独立进度系统 |
| W2-18-AC | P1 契约与消费证据缺口：动作快照只有声明，不能发现无人消费或 handler 输出不符 | 从实际登记目录追到用户/工作流/Agent/MCP/插件消费者，核发现过滤、身份权限、输入输出与拒绝；“无仓内消费者”先查公开用途，不能直接删公共动作。对实际合同缺陷补真实 action/HTTP/MCP 路径测试；有意改形状按合同规则升版/更新快照。接 W3-09/W4-01 |
| W6-04/06（本次） | P1 进度文档相互矛盾：§8 暂无、W1 全完、W3-02 未开始、历史现场混入现状 | 本次改回有基线、有证据层级的结论；本节逐条对任务书验收、补同口径数据。只代表文档整改，其他行须由对应验证结案 |
| W2-18-FR/LC（Dataset） | P1 错目标覆盖，已由真实 Chrome/HTTP/SQLite 复现并在本地提交 `f29e7074e` 修复：旧代码在文件读取后才读可变 selected.id/version，将 A 所选 CSV 写到 B；迟到响应还会重开旧编辑器。现持有已有 busy、绑定 save 返回的目标/版本，并以 editorSeq 拒绝失效读取与回包 | W2-18-DATASET-01：两张非空表、真实文件读取屏障、指针尝试切 B，核 A 请求目标/已确认版本及 B 内容/版本不变。W2-18-DATASET-02：响应/移走时不重开旧对象，读取失败保留输入并可重选同文件，其他客户端修改导致 409 且不覆盖。六条新回归旧实现 2 通过/4 失败，修后新旧浏览器 21/21、相关 365/365；统筹已读实际 diff 与原始日志。局部验收通过，未整合；资源快照下调和最终整合检查仍待完成，详见 §12.5。 |
| W2-18-LC/TE（Issue ISSUE-15/37） | P2 重复业务写已复现并在本地 `1d67c6408` 修复：旧 submit/Cmd-Enter 无提交锁，keep 每次新 UUID 绕过同 draft 幂等；丢回执后身份未持久，重试再新建。现一次在途保存，派发前保存原身份和输入；重试先读取同 id 的真实记录 | W2-18-ISSUE-01：真实 Chrome 阻塞 capture 回包、重复按钮/快捷键/submit，只建一条真实 SQL 记录。W2-18-ISSUE-02：已提交但丢回执的重试/刷新，以及未到 Host 的显式重试，核同一持久身份、原文、图片与无重复。四条旧实现全部失败，修后4/4、相关51/51；统筹已核实际 diff 与原始日志，局部验收通过。资源快照下调与最终整合待做，详见§12.5。 |
| W2-18-LC/AC、W4-09（Schedule/Feed 周期任务） | P2 无页面访问时不执行，统筹已核真实装配链，复现未跑：Web server 的 timer 仅遍历最初为空的 feedSchedulers，唯一 set 在项目 Web 请求；持久任务重启或纯 MCP/ActionGateway 创建均不登记，该服务活着也不会触发。旧“Web 未开不响”不能解释这一路缺线；手工 tick/只验创建列表的用例不能证明实际后台调度 | 随既有周期任务注册路线收口，不另建元系统。W2-18-SCHEDULE-01：隔离 Home 持久任务，关闭/重启真实 Host/服务，完全不访问项目页面，到期只写一次真实收据/业务结果；纯动作网关新建同样执行。W2-18-SCHEDULE-02：关闭/删除项目清理且无重复 timer/执行。核 web-server.ts 97/177/226–237、web-request.ts 262–278 及 schedule-actions/installed-plugin-host 的 runner 接线后先复现，再选择现有唯一调度机制；I6 冻结期间未占构建/浏览器。后续候选已整合为`ea34f2a89`：随服务与项目实例激活，停调度后释放库，关闭仅释放当前租约、不重放已派发一次任务；新增无页面重启/动作创建、服务/项目/删除的实际等待交错，均尚未运行。 |
| W1-18 / W2-18-LC（Goals 恢复） | P2 恢复可持久化非法关系图，统筹/只读复核确认源码，运行待复现：`modules/goals/src/lifecycle-archive.ts` 220–237 只检查旧关系两端已恢复就直接激活。先有 C part_of A、A part_of B，trash A 后新增 B part_of C 当前合法；恢复 A 却把旧边接成环。正常 `goal-commands.ts` 109–112 经 Host `goal-project-application.ts` 121 注入校验；`planning/goal-graph.ts` 184–190 明确拒绝父子/依赖/组合环，恢复入口绕过同一不变量 | 原整线负责人在 Goals owner 内接续，不动其他模块的事实。W2-18-GOALS-01：用生产命令与真实库构造三 Goal 中途改图，恢复不得激活导致环的关系或损坏既有合法关系；对 part_of、depends_on 及组合规则使用同一现行图校验。W2-18-GOALS-02：核实际恢复/待恢复结果、事务失败不留半状态、重放与重启后图仍合法。现生命周期动作测试和 v1 双端恢复只验 extends，不能覆盖本例。先明确冲突关系保留待恢复还是整体拒绝的现行合同，再做最小修复，不另建图框架。 |

**Schedule 与 Goal 恢复的修复边界（2026-10-13，两项候选均已整合，尚未运行）。** Schedule 必须覆盖已持久项目的服务启动与纯动作入口，不能只补页面访问时登记；删除/关闭时也要停止本运行实例的 tick 和在途控制，再释放项目库，保留持久任务供正常重启恢复，不将停止服务解释为取消所有任务。旧实现仅删除 `feedSchedulers` 映射，不能撤销 `fire()` 内仍在续租的执行；处理器返回后的回执事务及外层tick的reconcile/reschedule也须在关闭后停止访问项目库，用实际等待中的handler和迟到响应验证。Goals原先同一`validateRelationGraph` hook只接入新增关系；`9a9cbaf1b`已将它接入恢复，在原事务内逐边激活前检查，发生图冲突按现有`planning.*`错误整体拒绝并回滚；另一端尚在回收站时仍放入原`pending_relation_ids`，不新增跳过冲突边后成功恢复的合同或自动修图。协调方完整核源码、README和真实Host/SQLite回归：父子/依赖/混合环拒绝、重开状态、同请求纠错重试、真实事件写入失败后的全状态/幂等回执回滚均有断言，尚未运行。对应验证继续使用上表SCHEDULE-01/02、GOALS-01/02。

**授权竞态的实现取舍（2026-10-12，日常取舍，源稿准备中）。** 实际 MCP 的两个 validator 与 Agent transport 接线均允许异步；只调检查顺序或再 await 重查仍会留下后续窗口，不能强制现有 validator 全部同步。保留它们，按需要在可信 ActionCallContext 增加可选同步尾断言：共同入口最后一个 await 后验证精确来源/目标的当前授权、原注册/调用生命周期和运输存活；同步尾断言若返回 Promise 必须拒绝。MCP 从其唯一授权文件同步读当前 v2、复用同一 parser 和精确 grant 规则，不持第二份授权事实；bind/control/retainActionAuthority 须保留真实来源关系，不能仅检查嵌套目标。此可选调用上下文接线维持既有撤权拒绝合同，不增业务输入、工具名、动作形状/版本或读取兼容；实际 API 快照变化与消费者影响须随修复记录。当前尚未运行复现、工程或修复回归。

| 验收编号 | 可观察结果与证据要求 |
| --- | --- |
| W3-09-AUTH-01 | 真实隔离 Home 经 HTTP 授予 MCP A/B 两个精确动作且权限相同；A 为实际 form.questions.draft@1（#532 起取代 form.questions.ai@1；`tests/mcp-effect-authority.test.ts` 用的就是它）。A 精确检查后在后续 availability 等待期间撤 A、保留 B，A 必须拒绝，Form SQLite 业务事实/失败业务记录均不变；保留原缺陷复现日志，不能只测人工构造 caller。 |
| W3-09-AUTH-02 | 重新授权 A 后同一真实入口正常提交一次；已有提供方替换、取消、timeout、安装/运输撤销拒绝仍生效。原异步 validators/合法异步 transport 继续可用；最终同步尾检不得接受 Promise，也不得新增循环重查。 |
| W3-09-AUTH-03 | 真实 bind/control、原动作包裹的嵌套动作与函数/scene 路径保留来源和目标的精确拒绝；同权限目标不能替已撤销来源放行。测试调用生产共同路径，literal code/事实/真实平台拒绝行与编号分别核对，不把无业务写入误记为无平台调用记录。 |

Images 后台 job 未携带原 MCP 调用的持续授权，但 Prologue 手册明确启动 Action 与后台任务有独立生命周期；未找到撤销已完成启动授权必须取消已接受 job 的现行要求，故本次不列 P1、不擅改产品语义，其异常/任务权限边界仍随 W2-18-LC 核对。

执行顺序：原线程收当前 PR/I6 与共同权限缺陷；Dataset、Issue 按 §1 后续授权并行准备各自源码和回归，W1-18/W2-18 的只读审查可同时进行。各片的问题、验收与优先级保持，最新负责人见 §12.6。需要新的浏览器、真实模型或全量验证时，复用既有运行结果并等当前 I6 结束后排时段。不得为了本次复查重启后台回归。

### 12.4 防腐任务书 §7 逐条验收

本表复用原文顺序，编号 RAC-01–19 用于本次完成核对，沿用原要求顺序；[人工] 表示协调者对代码、已运行证据与复合条件作验收判断，实际业务回归继续引用原 W/S 等编号，不新增重复测试。复合条件须全部成立才记通过；“已有迁移计划”不抵消同条中的“样板已合入”。

| 编号与标准 | 裁决 | 证据、原因及剩余动作 |
| --- | --- | --- |
| RAC-01 [人工] 内置只剩 Runtime，或获批计划且样板合入 | 未通过 | 计划获批；8/18 装配仍并存，Form 样板未合，W4-04/W5-01。**10-16 现状**：Form 样板已合（项目监督器启动），Issues 由 Home 监督器启动；构建期剩 17 个（含第二个样板 Todo），仍未通过 |
| RAC-02 [人工] 测试插件证明只改自己的包和声明 | 未通过 | W4-01/W5-02 探针未交付；现有注入 fixture 不证明新增无需改宿主 |
| RAC-03 [人工] 各扩展方向有路径，演练达目标或补齐计划 | 未通过 | 15 方向文档存在，但文档仍列无切片/X-1 等缺口；需把当前实现、目标与 W4/W5 承接对齐，不把提议当获批实施 |
| RAC-04 [人工] 热点明显下降且聚合文件各自登记 | 未通过 | 固定样本触碰率 45.7%→32.9%，但手工聚合仍在；W5-02/03，数字改善只支持前半项 |
| RAC-05 [人工] SSOT owner、合同流程/门禁、CI 产品子集 | 通过（结构/配置） | SSOT/CODEOWNERS 生成、合同变更流程、CI 子集已存在；当前 PR 的 CI 结果另验，不声称产品全覆盖 |
| RAC-06 [人工] 协作规则入库且 AGENTS 指向 | 通过 | `docs/system/PARALLEL-DEVELOPMENT.md` 与 AGENTS 入口一致；本次沿用冻结/锁，独立 writer 并行按 §1 用户后续授权执行 |
| RAC-07 [人工] 静态/API/资源预算入 CI，未来回放规则及工具 | 未通过 | 三类门禁与合同规则已有；创作台答卷回放不等于 W4-01 的插件版本回放 corpus，后者未交付 |
| RAC-08 [人工] 术语表完成、能力机制收敛或获批计划 | 通过（计划分支） | 术语表与对外只走动作的获批计划存在；N-12 实现未完成，不能删掉 W3-07 余项 |
| RAC-09 [人工] 主链文档一致、每能力一路、界面错误可追 | 未通过 | ActionService 与 call_id 已推进，管理旁路和 owner 错误仍在途；全能力与返回核查 W2-18-AC/W3-07/09 |
| RAC-10 [人工] 巨大单元门禁缩小，测试内部引用下降且不新增 | 通过（现行只降口径） | 同口径 183→150、1,054→496（联合102b）；CI merge-base 不许增长。剩余巨大单元仍须原计划收口，目标不是强加 600 |
| RAC-11 [人工] Skill/手册代表性场景及创作台验证 | 未验证 | 有离线 replay/历史验证，最终样板和手册未齐；W6-03 的场景走查与隔离 Home smoke 待做 |
| RAC-12 [人工] 兼容逻辑清掉，保留机制逐项解释 | 未验证（已清理部分确认） | 0 就地补表与 9 个解释过的标记不证明无非标记兼容；结合 W1-18/旧入口核查与 W6-01 才可最终裁决 |
| RAC-13 [人工] 每库一份当前 schema、错版明确拒绝 | 未验证（核心拒绝已确认） | baseline helper 与当前版本拒绝/数据不变测试有效；所有库的现行全集与登记门禁 W4-11 未交付。**10-16 现状**：W4-11 的统一登记已交付（`apps/local-host/src/home-stores.ts` 的 `homeStores()`，2026-10-15）；真实 Home 各库当前盖的版本仍没有核对（`docs/system/HOME-DATA.md`），所以仍是未验证。**10-17 现状**：真实 Home 各库的版本已只读核对，除 Pages（真实 1，代码 2）外全部与基线相符；Pages 记进 §4.1 的「库版本维护清单」、由维护八做；版本变了却不进这张表，现在由门禁 `scripts/gates/store-versions.mjs` 拦下。最终裁决要等维护八做完再核一次，仍是未验证 |
| RAC-14 [人工] 在用 Home 按决定升级/重建并逐表一致 | 未通过最终状态 | 维护六/七结果仅覆盖其当时构建；维护八与新候选仍待做，同事无 Home 已由用户确认，不增加第二份迁移需求 |
| RAC-15 [人工] 防兼容回流 CI、AGENTS/文档更新 | 通过（已实施清理范围） | merge-base 只降、schema/旧名/vendor/文档规则存在；后续实现改动仍须同步文档，不等于 RAC-12 全仓结论已证 |
| RAC-16 [人工] 报告、附录 A、第一步每项有结论与证据 | 未通过完成态 | §12.2 已逐项裁决，仍多项在途/未验证；不能因有一个行号或 PR 链接就记已解决 |
| RAC-17 [人工] 安全不变量测试、依赖/SDK方案用户确认 | 未通过 | 安全表/测试/CI、依赖与SDK方案已存在且经决定；S-08/S-18修复、原caller末等待撤权与真实线程reader等待后stop回归已在103通过，最终共同安全集与全量尚待。外部网络跳过、上游无CI及未采用的其他上游防护仍保留证据边界 |
| RAC-18 [人工] 跨功能基线无退化，build/type/boundary/CI通过 | 未通过 | I6 预检通过、全量四失败；最终 main、真实模型场景与快照仍 W6-05。局部修后定向通过不能替代 |
| RAC-19 [人工] 持续完成必要工作，不早停/无限扩重构 | 未通过整线收尾 | 原线程继续第 3–6 波及本次漏项；新建议无当前要求/证据则不扩入。本次只关闭已证实完成的审查与文档工作 |

### 12.5 可比度量与有效运行证据

**同口径重算。** 从 Git 对象读取开工 `fccb2a30`、main 切点 `490251d1`、冻结 I6 `af0fe957`，用同一份当前 TypeScript AST 规则计数；排除 tests/fixtures/声明文件的源码体量，巨类分别计行数/方法数、函数阈值 150 行；内部引用含 import/export/import()/require() 和 server 内部路径。先前 959+34、函数 99 等值来自旧正则/扫描范围，保留作历史记录，不与本序列拼接。重算脚本/JSON 放在会话临时证据目录 `/tmp/molis-anti-review-20261012/`，不新增仓库门禁或基线。

| 度量 | 开工 fccb2a30 | main 490251d1 | I6 af0fe957 |
| --- | ---: | ---: | ---: |
| 源文件 / 行数 | 1,827 / 291,506 | 1,861 / 285,087 | 1,867 / 285,381 |
| 超过 800 行的源文件 | 37 | 33 | 33 |
| 超过 300 行的类 | 43 | 35 | 35 |
| 超过 25 方法的类 | 25 | 21 | 21 |
| 超过 150 行的函数 | 98 | 84 | 84 |
| 巨大单元合计 | 183 | 157 | 157 |
| 测试内部引用 / 涉及测试文件 | 1,054 / 361 | 886 / 327 | 855 / 317 |

**改动成本与热点。** 两端各取截至该 main 切点最近 70 个 first-parent merge；比较每个合并与第一父提交，全部变更文件计文件数、路径映射到 workspace 包计包数。采用同一组 13 个聚合路径（工作台总词典/初始化/助理岛/外壳/目录、Host 请求/目录/项目装配/监督器、两份核心合同、craft-finish 样式与 workspace 登记表），一个 PR 触碰任一项即计一次。I6 的 first-parent 中有本地整合，不拿来冒充 PR 成本样本。

| 度量 | 开工前 70 合并 | 当前 main 前 70 合并 | 解释 |
| --- | ---: | ---: | --- |
| 文件数中位数 / P90 / 最大 | 6 / 98 / 615 | 14 / 38 / 137 | 大尾部缩小，中位数反升，不能宣称全面下降 |
| 涉及包数中位数 / P90 / 最大 | 1 / 15 / 69 | 2 / 5 / 13 | 同上；样本含功能与重构，不是同需求实验 |
| 至少触碰一个固定聚合文件 | 32/70（45.7%） | 23/70（32.9%） | 降 12.8 个百分点；不证明并行冲突率或声明式登记已达标 |
| 动作合同触碰次数 | 11 | 7 | 仍为热点 |
| Host 项目装配触碰次数 | 7 | 5 | 仍有手工装配 |
| 总词典 / 初始化脚本触碰次数 | 12 / 11 | 0 / 0 | 最近样本改善；不是文件结构已去聚合的证明 |

**本轮复用、已核原始 footer 的证据。** 下列日志均在 `/private/tmp/codex-anti-corruption-20261012-01a130de/`，不把多个重跑相加成一次全绿；日期均为 2026-10-12 本地时间。

| 运行与文件 | 实际结果 | 可证明与不能证明 |
| --- | --- | --- |
| I5 冻结 8bac4a4ea，i5-full-01.log | 6,051 总数；6,039 通过、3 失败、9 跳过、0 取消，退出 1，103m44s | 原始全量失败保留；不删记录，不称全绿 |
| 三失败重跑 i5-failures-repeat-01.log；干净 acede03e2 对照 i5-failures-acede-01.log | 前者 20/23、3 失败；基线 22/23、1 失败 | action-error-model 的大请求体应 413（旧 400 预期）；settings 测试 hook 需匹配现行绝对 URL，均为迁移后的测试缺陷。Issue finish 未等 decoder 为基线已有时序缺陷，不改变产品语义 |
| 三个 test-only 修复合成头 2a1912250，i5-failures-fixed-01.log | 23/23、0 失败/跳过/取消；对 8bac 为三测试文件 +8/-6 | 含 G2 77700a330、1b 21ce9d473、Issue 2a1912250；验证生产大包 413、坏 JSON 400、迟到响应/真实拖放后 DOM 与持久化为空等原断言。仅定向通过 |
| G1 原组与修复组 | 原 196 中 192 通过/4 失败；失败四文件修后 24/24 | 保留其余 172 个有效结果，共 196 个不同用例有通过证据；不是 216 个，不是首跑全绿 |
| G3 普通/相关/浏览器组 | 5/5、198/198、6/6，均无跳过/取消 | 共 209 个不同用例，含真实 scope/preview 拒绝、坏 SQLite 不变、Host 重开、Chrome 修复后继续同 work；仅覆盖该片 |
| Home candidate security | 192 总数：191 通过、1 外网可选项跳过 | 安全相关本地路径已验；跳过网络项未验，不能写 192/192 |
| I6 整树预检 | 整体 build、boundary、类型、actual-base health、API/actions 与资源已通过；API 0 变，29 资源 11,366,475 字节 | 支持冻结候选的工程预检；不是全部测试通过或 main 已合入 |
| I6 全量 i6-full-01.log | 冻结 af0fe957 的本轮已结束：6,088 tests，6,075 pass、4 fail、9 skipped、0 cancelled；失败为 agent-action-selection、tab-split-drop-preview、work-placement-restart、workbench-pane-feed。Placement 断言失败后其 HTTP 未关闭，子进程挂住，由原执行者单独终止后主回归继续 | 不能记全量通过；四文件由原负责人重跑并做干净基线对照。单独终止事实保留，后续修复/定向通过不改写本轮失败；各修复树不能把通过数相加当整合通过 |
| I7 关键18文件，i7-critical-tests-01.log；四文件修后 i7-critical-fixtures-fixed-01.log | 首轮83条、77通过/6失败；测试修正 `05cc4931b` 后16/16、零跳过/取消。另14文件的67条保留首轮有效证据，共83个不同用例有通过证据 | 协调方核过原始日志与四文件实际diff：Choice补真实第二选项、Manifest补必需ui、诊断事实不依赖未承诺顺序、匹配夹具实际拒绝码。AUTH/MCP坏配置、固定输入与Diff、SemVer/密钥/事务、管理入口和Placement定向通过；不是新的18文件单次全绿或最终全量。Placement `09034f1d` 按现行合同断言400及具体错误码/文案，并新增拒绝后状态不变与失败清理，未放宽拒绝 |
| I7 相关回归，冻结 `1485e959f` | AUTH相关28文件245/245；SDK/存储/Runtime/Diff首组30文件549/549，第二组17文件58/58，均零失败/跳过/取消，执行退出0 | 协调方核实际运行命令、文件清单、原始日志footer和头。日志为 `i7-auth-related-tests-01.log`、`i7-core-related-tests-01.log`、`i7-core-related-tests-02.log`。G4局部相关验证已收齐；以上按批保留，不相加称单次全量或全部71包已修复 |
| I7 PR5相关，`d0174744f`，i7-pr5-tests-01.log | 25文件97/97，零失败/跳过/取消，实际退出0 | 协调方已核命令、文件清单及原始footer；同头整体构建/API/动作/资源/actual-base health/boundary/types通过。仅支持这批工程与相关回归 |
| I7 Home/发送/组件浏览器首跑及定向复跑 | 首跑17条14通过/3失败；02b78a2bc夹具修正后两个文件10/10，均零跳过/取消，复跑实际退出0 | 原日志i7-home-component-send-browser-01.log保留；i7-send-component-browser-fixed-01.log核过完整footer与命令。原CDP超时原样复跑通过；details.work与HTML括号只修夹具，行为断言保留。17个不同用例均有通过证据，不是一次17条全绿 |
| I7 PR5/Workbench/设计系统相关，i7-pr5-workbench-design-related-tests-01.log | 33文件265条264通过/1失败，零跳过/取消，实际退出1 | 唯一失败ui-request-client-pages漏传Home页面现行必需的第五参数locale；生产Home语言五条已过。eeadef80d仅给测试传既有locale helper，i7-ui-request-pages-fixed-01.log定向7/7，实际退出0且零跳过/取消，命令与完整日志已核；265个不同用例均有通过证据，不是新一轮265条全绿，不加生产默认值 |
| I7桌面/助理相关，eeadef80d，i7-desktop-send-related-tests-01.log | 18文件161条160通过/1失败，零跳过/取消，实际退出1 | 实际队列命令、18文件清单与原日志已核。唯一失败为server/tooling的连续QA脚本无法解析im-ui包，尚未listen；既有助理发送/输入法/页面更新/恢复及组件浏览器均通过。QA准确依赖声明与复跑仍待，不将静态IPC测试说成真实原生窗口通过 |
| I7原生Rust与私有剪贴板 | Rust1.96.0 gate的19份Rust格式及clippy通过；剪贴板首轮1/2，测试夹具补齐后2/2，实际exit0、0ignored、66filtered | 已核实际命令、i7-native-rust-01.log与i7-native-clipboard-fixed-01.log。原失败的左右值只差AppKit派生UTF16格式，原有类型和bytes一致；2f9427d7f显式种入该格式，未放宽逐字节断言。真实唯一私有NSPasteboard覆盖多格式恢复、未复制不读旧文件与后来复制不被覆盖，未碰通用剪贴板；不是整App胶囊/快捷键实操 |

**Dataset 独立片的已核证据。** 本地提交 `f29e7074e`，三个文件 +228/-20，工作树干净、未推送。临时原始日志在 `/tmp/dataset-import-target-evidence/`：`baseline-browser-02.log` 的 6 条回归 2 通过/4 失败，诊断直接显示 B 收到 A 的 CSV 并以 200 落库，以及切 B 后迟到响应重开 A；首轮 harness 对文件选择触发 autosave 的错误假设已修，首轮失败日志保留、不充当最终复现。`fixed-browser.log` 21/21（含新回归 6/6）、`related-tests.log` 365/365，均零跳过/取消；整体 build、boundary、对真实 merge-base 的 health 通过。`page-assets.log` 仅报 Dataset JS 实测 33,710 字节小于旧快照 34,285，按共享文件归属留整合时正常下调；不是允许使用的余量，也没有放宽门禁。协调方已读实际客户端与测试 diff、旧故障诊断和各 footer，判定该片局部验收通过；最终整合验证另计。

**Issue 独立片的已核证据。** 本地 `1d67c6408`，四文件 +187/-34，工作树干净、未推送。`/tmp/issue-manual-save-evidence/baseline-tests.log` 的四条回归全部失败：重复提交产生5条记录、丢回执重试产生2条、刷新仍留待处理项、未到Host重试换了身份。`fixed-tests.log` 4/4、`regression.log` 51/51，均零失败/跳过/取消；整体build、boundary、对merge-base `490251d1` 的health通过。每条实际经过Chrome/Host/SQLite，屏障只控制网络回包，标题整理使用现有模型替身；校验原文、图片、身份、版本、数据库及重开界面。协调方读完实际生产/测试diff、完整客户端和原始日志，局部验收通过。`issues.js` 23,559→23,535字节，最终构建时统一下调共享快照；整合与真实模型质量另计。

**Home 语言接线局部验收。** 协调方独占候选 `967a19aef`（前置Issue `1d67c6408`，含G2独立helper/既有词典），11文件+205/-48、干净未推。`/tmp/home-locale-wiring-evidence/` 的 `locale-tests-01.log` 为5/5（两helper、三实际Chrome/Host），`issue-regression-01.log` 为README十文件42/42，均零失败/跳过/取消；`baseline-tests-01.log` 在冻结I6对相同三条新浏览器0/3，实际失败分别是中文控件、中文模型设置链接、503的zh-CN。验证英文Home/项目侧栏和中文返回、原文恰为翻译键仍不变、空模型设置加载失败后重试并手动保存原文，以及坏Runtime实际503；没有真实模型质量结论。两次整体build通过，首次资源超232字节，合并重复读取/按钮样式/CSS后issues.js实测23,536，较merge-base预算23,559下降23，正式assets/boundary/actual-base health均通过。47个不同用例只支持本片；最终组合资产和全量另计，具体提交顺序与原始日志见临时Handoff。

**Workflows 保存与对象打开局部验收。** 候选 `c35d8ff9d` 已纳入I7；协调方已核实际源码、原始 `wfsave-baseline-browser-01.log`（同七条旧实现0/7，目标误写/丢第二请求/迟到重开/动画误写真实复现）与 `i7-wfsave-browser-01.log`（7/7，零跳过/取消）。搜索首次懒加载与已有对象、A的多次保存/防抖在切B或目录后仍归A、真实CAS失败保留草稿并重开恢复均通过。相关九文件 `i7-wfsave-related-tests-01.log` 32/32；实际Feed→Shelf动作流程和迟到结果/窄屏两条 `i7-wfsave-browser-action-steps-01.log` 2/2；受影响的模型就绪恢复一条 `i7-wfsave-browser-model-ready-01.log` 1/1，均零失败/跳过/取消、实际命令退出0。project-deletion-owners复用上述首组核心相关的有效结果，不重复计数。该片局部验收通过，Workflow停止与最终组合全量仍另计。

**发送基线失败的证据边界。** `i7-send-baseline-browser-01.log`为0/7，但只有四条直接复现旧生产行为：误发给B、旧回执切回A、选择页路由漂移、迟到404清掉B。PAGE-CARDS是Chrome启动失败，late refusal是旧错误体夹具问题，A→B→A停在新实现的deferred空草稿前提，不能把三项都当产品复现。前两项已用有效夹具补证：`i7-send-baseline-complement-01.log`在源码仍为I6 `af0fe957`的独立树上2/2失败，分别断言兄弟卡片丢失、A的迟到拒绝把B选择切回A，零跳过/取消且没有环境或夹具失败；旧行为已有六条直接复现。投影补证也已完成：`i7-send-preprojection-projection-01.log`在准确`852be6ecf`上1/1失败，真实A→B→A后屏幕输入为空而非后来草稿X；该基线已含初次SEND修复、尚未含d2ce投影修复，原业务断言未改。七项旧行为至此均有有效失败证据，未将首轮的环境/夹具失败改写成产品结果。当前修后真实浏览器通过不受此口径修正影响，仍保留首轮原始失败。

I5 的九个跳过包含 live 账号/真实网络、MiniMax 凭据与本机缺 shellcheck 的两条；CI 的 Shell/Python 检查有独立证据，不能因此说本地那两条已运行。真实产品证据目前是各片实际 HTTP/SQLite/Chrome 覆盖的路径与历史维护窗口；外部模型/账户、完整辅助技术和最终用户验收没有全量结论。

**本次文档验证（2026-10-12）。** 首批同步 main `490251d1` 后，独有差异仅本 spec 与原路线图；文档/引用/索引/安全表检查无问题，包清单 71 项全部与代码匹配，验收编号报告中本 spec 无问题（全仓仍有 26 条既有报告项，不称全仓零问题），`git diff --check` 通过。`node scripts/check-health-gates.mjs --base origin/main` 通过（main 口径内部引用 886，与 I6 的 855 区分），首批推送前 `pnpm secrets:check` 通过。本次增补代码发现、13 Module/9 插件的实际读码矩阵与并行分工后，文档门禁仍零问题、包清单仍 71 项匹配、验收编号仍本 spec 零问题/全仓 26 条既有项、diff 检查通过；未为文档改动重启产品回归。

增补随后同步 main `77c8f65c`（#459）至文档头 `ef2f21756`，独有差异仍只有本 spec 和原路线图。actual-base health 再次通过（该 main 口径内部引用 875、API 声明 2,285，不替换上表固定切点）；527 行分支新增提交内容的 secret scan 通过。此为文档合并后检查，不是新的产品回归结果；I6 继续使用原冻结稿。

### 12.6 本轮实际代码审视与并行接续

**历史阶段说明。** 本节保留启动71包补审前的重点路径复查与当时分工，表内“仍未审”“未整合”均指该阶段；现行完整源码结论以§12.9为准，整改与运行状态以§12.5/§12.11为准，不能用本节旧状态覆盖后续证据。

**审查深度。** 该阶段按系统整理 §2/3/7/8/12 重新读取冻结 I6 的代码、有效合同与关键测试断言。完整清点仍是 71 包：6 Apps、1 Server、10 共享包、13 Module、8 横向服务、26 内置插件、6 官方接入和 1 插件 CLI。下列是实际读码范围，不把包清点、README 或 import 扫描等同逐包结构审查完成；§5.1 的完整结构审查仍须 W1-18 原要求逐项结案。

| 范围 | 实际检查与判断 | 证据边界及原路线 |
| --- | --- | --- |
| App/Host、CLI/MCP/Server 入口 | 对照公开入口、依赖与事实 owner，深追 LocalHost 的 ActionClient、MCP gateway、项目/安装可用性、Web 调度装配；发现 §12.3 的精确授权竞态与无页面访问漏调度 | 入口存在不代表等价；当前权限与调度问题未关闭，CLI/Server 全部管理动作返回仍待 W2-18-AC/W3-07/09。桌面原生 IPC 的真实可达范围仍按安全表开放项，未运行桌面探针 |
| Contracts、Kernel、Runtime、SDK/Storage/UI 等 10 包 | 深读共同派发的 schema/权限/来源检查、Runtime 的 grant/世代与贡献失效、SDK 依赖和当前 schema 基线；外部作者 SDK 仍只依赖 contracts。读取 `tests/plugin-sample.e2e.test.ts`：先打包两公共包并在独立项目安装，执行真实 CLI，再核安装、持久成果及 UI/MCP | 测试的 CLI/包安装部分确走发布形状；后半段自行组装 Runtime 的部分只证明该组合，不能代替 W4-01/W6-01 全宿主声明式探针。未以“SDK 可 import”证明全部插件扩展方向可用；运行结果仍以原日志为准 |
| 13 Module | 全部 README/依赖/导出清点；模型、网络、进程的源码入口扫描未见新增直接模型/供应商客户端；已逐个核下表的 owner、事务、事件与 Host 调用路径。新增 Goals 恢复关系 P2 | 已读核心路径与现行职责划分吻合；Goals/Governance 的共享事件表属于已登记债，不重报新问题。扫描和读码不是业务运行证明；仍未审范围在下表，不能直接把 §5.1 所有行改为已审 |
| 8 横向服务 | 追踪模型服务→Host 文本端口→Agent Host→Prologue 的 text/images/typesafe；检查上下文、凭据引用、指令 owner、并发声明、signal、超时、输出上限与清理。深读 Scheduler claim/续租/同步 beforeEffect/回执，Runtime Router 的能力拒绝，以及 Memory/Placement/Search 的现行职责 | `@prologue/sdk` 依赖仍只在 Agent Host，未找到新的生产文本模型直连；这不证明全部供应商、真实账户和长期运行已验。Memory/Placement/Search 保留产品政策是用户已接受边界，不因目录名再提搬层；调度本体租约保护不抵消 Host 启动装配缺口 |
| 6 官方接入与插件 CLI | 核 Manifest、SDK 的 polling integration 接口、权限与 secret 引用、公共依赖；Catalog 按连接声明生成入口，普通网络访问属 Connector 业务，不误算模型直连 | 未逐一实际登录/同步外部账户，不能宣布全部接入闭环。包脚手架测试的生成/打包/安装证据不能外推为所有外部协议通过；接 W2-18-LC/AC、W6-01 |
| 测试与 CI | 重读取消/撤权、版本冲突、模型 barrier、真实持久化与发布包用例；核 CI 的安全/合同/原生/资产/答卷回放入口和 skip 条件，`tests/quarantine.json` 当前为空 | Dataset 文件读取、Issue 手动换 ID、Schedule 自动 tick 恰是已有测试未覆盖的生产路径；相应测试通过不能抵消新缺陷。macOS/Chrome、外网 opt-in、凭据和原生工具导致的 skip 均须按实际环境单列；没有删除或放宽断言 |

**13 个 Module 的 owner 复核。** 下表记录实际源码路径与职责裁决，不替代 §5.1 要求的全部历史变化、重复代码和完整包深度检查；判断“吻合”仅限已读路径。生产装配与事件/事务边界一并核对，未新跑测试。

| Module | 读到的核心路径与生产接线 | 现行 owner 判断 |
| --- | --- | --- |
| Projects | `project-service.ts`、workspace/repository/deletion-steps；Host Catalog 与 ProjectDeletionService | 身份、目录关联、删除回执归模块；终端/进程和文件效果归 Host，吻合 |
| Context Ledger | `service.ts`、repository/materialization；Feed/Session 关联端口 | 只存版本引用边，正文物化向注入 owner 读取，引用不授正文权限，吻合；publication/异步物化仍是已声明缺口 |
| Sources | `index.ts`；Host Feed 装配和连接状态刷新 | 配置、启停、计划意图归 Sources，游标/租约归 Listener；保存和事件同事务，吻合 |
| Signals | `index.ts`；FeedConnectorSync→Listener→submitDraft | 项目＋来源＋Provider ID 去重，修订和事件同事务，不代 Feed 处置，吻合 |
| Feed | `index.ts`、goal-links；createLocalFeedApplication 注入 Attention/Ledger/journal | 条目、材料与处置由 Feed 写；关联经 Ledger，不直接创建 Goal，同库失败可回滚，吻合 |
| Attention | `attention-resumption/src/index.ts`；Feed 与 GoalProjectApplication 的 resolver | 引用、原因与最小处置状态归模块，不复制正文或运行 Runtime，吻合；完整 snooze/resume 尚未实现 |
| Goals | event-state-effects、authorization/completion/state、lifecycle-archive、planning graph；GoalProjectApplication | 完成效果与具体承诺授权归 Goals，可信决定来自 Governance，同库提交，分工吻合；恢复绕过图校验的 P2 见 §12.3 |
| Private Work Context | session-registry、associations/handoffs/messages/events/content-store/project-data/project-binding-commands；RuntimeSessionHost | 私人正文与身份由本模块拥有，关联经 Ledger，进程句柄归 Host；删除提交行后在写锁内回收无引用块，吻合 |
| Artifacts | service/registration/repository/content/validation；Host 的 journal、Home owner 与声明校验注入 | 固定版本不可覆盖，成果与过程项分表，平台不解释 payload，journal 经端口，吻合 |
| Shelf | store/website/recipes/runtimes；动作注入材料与 AI 端口 | 副本、Hash、任务与结果组织归 Shelf；提取/模型经端口，等待后复查执行权、配置、材料，吻合 |
| Characters | service/repository/open；charactersPluginPorts 同步发布，Coding 读取固定版本 | 私人草稿、CAS、墓碑和启停归 Characters；固定正文归 Artifacts，无第二份发布事实库，吻合 |
| Functions | service/actions/authoring-actions/provider/store/project-data；FunctionsHost 的 TypeSafe 执行注入 | 规则与判断记录归模块，推荐仅返回动作引用，不执行业务；模型后原 caller.beforeEffect 再落历史，吻合，共同权限 P1 仍需修 |
| Governance | event-decisions/provenance/decision-transactions/record-store/repository/state-machine；实际 Goals owner 注入 | 可信来源、结构提案与决定归本模块，不计算完成或直接写 Goals 业务事实；savepoint 预检和正式事务分工吻合 |

Goals/Governance 共读写 `events`、`idempotency_records` 的现状已登记在 `tooling/gates/table-owners.json`，后续 journal 端口收口仍沿原路线；这不构成新发现的未登记跨表访问。本轮未逐行深查整个 Goals planning 库、指导编辑和全部查询，也未运行真实 Provider、模型或产品恢复；读取相关测试断言不能写成运行通过。

**本轮逐插件读码记录。** 以下 9 个插件是重新追踪过的范围，其余 17 个内置插件仍复用有效首轮记录并待 W2-18 后续；不能将本表写成 26 个现行插件全量通过。这里的“未见独立问题”只描述已读路径，非运行验收。

| 插件 | 本轮实际读到的链路与结论 | 未覆盖/继续事项 |
| --- | --- | --- |
| Dataset | `client.ts` 保存队列、切表、两种 CSV 导入与冲突，`store.ts` import/update/version；动作测试与浏览器测试当前只覆盖粘贴导入。文件读取错目标 P1 见 §12.3 | 文件路径回归由独立会话补；发布补偿、所有 CSV 异常和视觉不在本次静态结论内 |
| Workflows | `actions.ts` scoped authority、内容/动作交接、attempt、stop，`store.ts` token/CAS，handoff/stop/action-step 断言；未知结果必须显式重试是现行合同 | 当前动作派发后停止的语义候选见下文；真实模型、全部可组合插件与前端动线未验 |
| Issue | `actions.ts`/`store.ts`/`capture.ts` 的 CRUD、同 draft 幂等、取消，`client.ts`/`capture-client.ts` 的助理待处理→手动补录→恢复；前后端断言对照 | 同 draft 后端保护存在，但页面每次新 ID 绕过它，P2 见 §12.3；真实模型标题忠实度、IME/跨应用粘贴与全部 Home 监督器体验未全验 |
| Form | AI 动作模型前后检查、问卷导入与提交、`store.ts` 的 submit/import/校验，以及填写页/预览与关键 e2e 断言 | 所读提交幂等和版本路径存在；共同权限 P1 同样影响 AI 写题。未完成真实填写→导出答卷文件全路径 |
| Pages | 动作生成→`generate.ts` 的 complete/fail/refusedEnds，`store.ts` 的 lease/reopen/CAS，content receive 幂等与生成 lease 测试 | 已读取消/重启路径未见另一确定缺陷；三分钟 lease 不等于自动重发。整个编辑器、发布/复制移动及真实模型仍未全验 |
| Images | service 的取消、删除项目、close 与文件落地，providers 的 abort/字节校验，以及容量、晚到结果、连接改变、runner 恢复测试 | 后台任务与已结束启动调用独立是有效合同，不将其误报撤权缺陷；真实厂商及生图→Pages 组合仍未验 |
| Cognia | 固定证据→模型→引用校验→草稿，store 的版本/采纳/领域删除，固定版本与幂等采纳测试 | 源资料改变/删除后仍引用原固定版本是有效合同；未发现独立确定缺陷。真实模型、完整目录导入与 Pages 组合未验 |
| Shelf | Module 运行与 authority/lifetime/hash/提交/cancel 的关键路径，Shelf AI Host 的权限与迟到结果断言 | 取消后不把原 running 历史改成新失败记录符合现行“取消后不再写入”；未覆盖终端、所有提取格式与真实配方 |
| Coding | README、`recovery.ts`、`continuation.ts` 的断点与事实投影，并对照 Agent Host 公开入口 | 本轮没有深追完整真实仓库 Agent 轮次；不得记深审完成，W6-03/05 保留 |

**Workflows 停止的原待决边界，现已由用户明确（本轮决定与验收见 §12.10）。** 在 `actions.ts` 214–215，下游仅保留原 caller 权限；341–344 先记 attempt 再 invoke；451–453 的 stop 只经 `store.ts` 164–167 将实例改成 stopped/CAS 新 token。若当前 Form AI 动作尚在等模型，stop 返回后 Form 仍可能提交题目，外层流程随后因 CAS 冲突而不记 arrival。这不依赖精确授权 P1。现行文案是“后面的站不会再继续，已经交出去的内容保留”，未明确当前已派发、尚未提交动作的停止含义，不能自行把它解释成撤回外部效果。

用户已选择让实例停止进入下游控制，阻止尚未提交的本机效果；已经发生的外部结果保留并显示（§12.10）。G8 按同一合同用真实 Host actions、FormStore 与模型 barrier 验“派发→stop→放行模型”，不扩建任务恢复框架。旧 action-step 测试直接 abort 自建控制器、stop 测试串行核 token，不能代替真实 stop 接口的迟到写入拒绝。

**并行负责人与当前状态。** 用户后续要求提高并发，以下两个独立会话已启动并设为 `gpt-6.1-sol / max`；这是一项本任务分工决定，不改变仓库的全局默认。

| 会话与范围 | 修改边界/依赖 | 当前可证明状态 |
| --- | --- | --- |
| 原防腐会话 `01a130de-5470-7223-827e-b28663ee7e06` | 共同权限 P1、PR4 与既有整合；管理 I6、原 PR/CI、后续 Schedule 与 Goals 生命周期片。共同合同/快照按原流程处理 | AUTH 本地候选 `b5504585a` 与真实交错回归已备，运行未验；不是已验收。Dataset/Issue 不再重复分派给原 writer |
| 修复 Dataset 文件导入错表覆盖，`01a13341-d712-73f2-99f4-992f8645847c` | 自己隔离工作树；仅 Dataset 客户端、相关测试/README；不改 Dataset action 错误映射及共享核心 | 本地 `f29e7074e` 的 W2-18-DATASET-01/02 已有缺陷复现与修后通过证据；统筹已核，未整合 |
| 修复 Issue 手动保存重复创建，`01a13342-5853-75e1-a3ce-929ee5ec4e75` | 自己隔离工作树；Issue client/capture-client 与必要回归/README；优先复用现有后端幂等。浏览器批次排 Dataset 之后 | 本地 `1d67c6408` 的W2-18-ISSUE-01/02缺陷复现与修后4/4、相关51/51已核，局部验收通过、未整合；保存片冻结，后续语言接线由协调方串行 |
| 协调复查会话与只读审查代理 | 核 diff、源码证据与验收，串行维护本 spec/原路线图；只读审查不启动构建、测试、浏览器或修改代码 | 15 节、附录与 §7 已对应；逐包/逐插件深审和真实实操的缺口保持可见，不把派发与代码准备记作关闭 |

新会话只提交自己的本地改动，不自行推送、开 PR、发布或安装，不改总 spec、路线图和共享门禁快照；由协调方在实际整合后记录验证与去向。I6 结束并释放机器锁前先准备源码，不起第二全量；之后按单一构建/浏览器队列做有意义的缺陷复现和修复验证。最终共享核心整合结果不能用三个独立工作树的通过数相加代替。

### 12.7 全部 71 包实际审查与组合路径接续（2026-10-12）

**本轮执行合同。** 本节承接用户在 §12.6 交付后明确追加的继续要求，不再以全仓清点加重点路径抽查作为终点。保持同一 spec 和 W1-18/W2-18 路线；先补齐各包所有受跟踪生产实现、原生/启动脚本与必要配置，再沿实际消费者检查合同、事实 owner、状态/权限/事件/取消/恢复、重复及旧路径，核相关测试的断言有效性。每包给职责与放置判断、文件职责/变化原因、必要修复与可验证结论。长文件必须分段读完；仅 grep、README、导出或注册表不计该实现文件已审。静态资源与生成内容按适用规则审查并写清边界，不制造无意义逐行计数门槛。

共同源码切点为冻结 I6 `af0fe957`。审查期间只读该树，不动源码、dist、脚本、配置、skills，不启动第二回归。后续 main/修复发生变更时，对受影响文件和调用链补差异审查，不能把旧切点的结论直接转为新头通过。临时文件覆盖清单只是防漏证据，不是另一份进度事实；唯一状态仍在本 spec。主检出与真实 Home 不写入。

| 组与重点 | 包数 | 完整包边界 | Codex 会话 | 状态 |
| --- | ---: | --- | --- | --- |
| G1 宿主与 CLI/MCP | 3 | `apps/local-host`、`apps/cli`、`apps/mcp` | `01a1335c-bdeb-7473-b444-25370fc0e242` | 源码审查完成；修复/最终实操未完成，见 §12.9 |
| G2 工作台与 UI 宿主 | 2 | `apps/workbench`、`packages/ui-host` | `01a1335c-c133-7891-9b62-a36a02e10c5a` | 源码审查完成；修复/最终实操未完成，见 §12.9 |
| G3 桌面、设计系统与 IM | 6 | `apps/desktop`、`packages/design-system`、`apps/server`、`server`、`packages/im-ui`、`packages/test-kit` | `01a1335c-c77b-75c2-9ad0-6ea2e5458ba5` | 源码审查完成；修复/最终实操未完成，见 §12.9 |
| G4 公共合同与插件运行时 | 7 | `packages/contracts`、`packages/kernel`、`packages/plugin-runtime`、`packages/plugin-sdk`、`packages/storage`、`packages/plugin-sandbox`、`tooling/plugin-cli` | `01a1335c-d9c5-7990-978a-cf976825eb9d` | 源码审查完成；修复/最终实操未完成，见 §12.9 |
| G5 AI 横向服务与开发插件 | 11 | `horizontal/agent-host`、`horizontal/connector-host`、`horizontal/listener-host`、`horizontal/runtime-host`、`horizontal/scheduler`、`horizontal/memory`、`horizontal/search`、`horizontal/placement`、`plugins/native/coding`、`plugins/native/plugin-builder`、`plugins/native/characters` | `01a1335c-f6be-7560-896b-e9153331eea5` | 源码审查完成；修复/最终实操未完成，见 §12.9 |
| G6 业务模块与 Goals | 14 | `modules/projects`、`modules/context-ledger`、`modules/sources`、`modules/signals`、`modules/feed`、`modules/attention-resumption`、`modules/goals`、`modules/private-work-context`、`modules/artifacts`、`modules/shelf`、`modules/characters`、`modules/functions`、`modules/governance-collaboration`、`plugins/native/goals` | `01a1335d-0db9-7a61-90af-d93fb33b11e7` | 源码审查完成；修复/最终实操未完成，见 §12.9 |
| G7 内容创作插件 | 7 | `plugins/native/pages`、`plugins/native/form`、`plugins/native/dataset`、`plugins/native/ppt`、`plugins/native/images`、`plugins/native/cognia`、`plugins/native/lingguang` | `01a1335d-1541-75e2-9c2a-3930e8fb3b2f` | 源码审查完成；修复/最终实操未完成，见 §12.9 |
| G8 工作流与执行插件 | 6 | `plugins/native/workflows`、`plugins/native/alchemist`、`plugins/native/work`、`plugins/native/issues`、`plugins/native/shelf`、`plugins/native/artifacts` | `01a1335d-246b-71f3-ba85-34421a4d71c4` | 源码审查完成；修复/最终实操未完成，见 §12.9 |
| G9 信息接入与日常工具 | 15 | `plugins/native/feed`、`plugins/native/inbox`、`plugins/native/todo`、`plugins/native/schedule`、`plugins/native/files`、`plugins/native/diff`、`plugins/native/git`、`plugins/native/text-stats`、`plugins/native/jelly`、`plugins/official-integrations/catalog`、`plugins/official-integrations/github`、`plugins/official-integrations/gmail`、`plugins/official-integrations/rss`、`plugins/official-integrations/web-query`、`plugins/official-integrations/youtube` | `01a1335d-44e2-7a23-aff4-14c68ce9ed5b` | 源码审查完成；修复/最终实操未完成，见 §12.9 |

以上集合由协调方与仓库登记的 71 包核对：不遗漏、不重复。九个会话均为 `gpt-6.1-sol / max`，初始只读；只有经协调方核事实、归入本 spec 并明确分配后才接续隔离实现，不自动成为 writer，也不占构建/浏览器时段。Dataset/Issue 的两个既有修复会话继续其已授权边界；共同授权与既有防腐实现仍由原线负责。新问题先核实并登记根因、影响、最小修复和验收，再按不冲突边界接续，不能将交接记为已修复。

**完成与证据口径。** W1-18-ALL-01 [人工]：71 个包各有完整当前代码审查结论，受跟踪生产文件不存在未披露的未审项，重要实际入口/消费者与 owner 判断有源码依据；§5.1 逐行据此更新，未审完仍“待审”。W1-18-ALL-02 [人工]：发现的必要问题按原 owner 修复并核实际 diff，状态/权限/并发缺陷有能发现原错误的生产路径回归；代码审完但整改未完的包须明确标出。W2-18-ALL-03 [人工]：下列现行组合路径逐项核当前实现、完整传递与运行证据，缺口按真实权限/环境说明，不能把 Mock 模型输出当真实模型质量验证。W2-18-ALL-04 [人工]：最后在整合后的实际代码头核受影响差异与必要工程/产品实操，复用有效证据，不相加不同树的通过数冒充最终验证。

**组合路径沿原 S1–S11 继续。** 原 `plugin-conclusions.md` §7 是历史证据，下列待核点不是新增一键产品需求；阶段状态在同一 spec 更新，不再复制一份进度表到其他文件。

| 原编号 | 本轮核查的真实路径与边界 | 审查组及当前结论 |
| --- | --- | --- |
| S1 | 灵光/Pages 选区→Todo、Jelly、Goals；核来源、内容与返回入口、失败输入保持 | 已核 `lingguang-one-place.e2e` 的文件导入→spark→Jelly 原文持久化及打开；`work-placement-plugins.e2e` 核灵光→Pages→Goal 的标题/来源关系。`contextual-interaction.e2e` 的灵光卡只 prepare，不能证明选区转交后真正新增；Todo另有新增/撤销证明，G9已准备 `contextual-todo.e2e`：真实选区准备/执行、切选区后仍用原文、403保稿/恢复、Todo owner正文/来源回读；当前create合同为未归属，项目scope与内容归属分开断言。该正式浏览器用例首轮因Pages初始化、复跑因建议层遮挡而未通过；真实Escape修正已核、待复跑，不能仅断卡存在 |
| S2 | 连接/Feed→Inbox→Pages→固定成果；无模型、撤权、来源删除/变更、部分成功与重试 | 已核 `feed-inbox-pages-loop`、`pages-cross-module` 的真实 owner/动作、固定来源快照与重试保留编辑；Feed 为直接 seed，生成是模型 callback。Gmail/GitHub 分页、Catalog 拒绝与内容控制整改后须核接入链；真实外部账号/模型未验 |
| S3 | Pages 固定版本→Artifacts→Goal 输入/交付→Diff；固定引用、删除/移动后读取与授权 | 已核 `artifact-goal-input.e2e`、`artifact-continue.e2e` 真 Chrome 1440/390 与正文/版本；`document-pin-after-move` 核四文档、跨 actor/项目及移动后版本。G4固定输入SDK/Diff修复已在I7局部验收（§12.5）；G6历史pin正式动作14条已在I7通过，浏览器待复跑；G9点击测试缺事件owner端口已补、未验，不能称全链通过 |
| S4 | Form 答卷 CSV→Dataset 文件/粘贴导入；Pages→PPT 大纲/文件；只验现行人工衔接，不新增一键流转 | `work-placement-journeys.e2e` 核真实中英离线表单下载答卷→owner导入及去重；G7已在 `work-placement-plugins.e2e` 补实际列名、两行答案/时间/来源和原答卷保留，已在I7浏览器复跑通过；既有CSV将换行转分号的语义明确断言。Dataset文件导入局部已验（§12.5）；离线Form新便携用例仍停在原生页AX必填语义，后续尚未执行，PPT取消回归通过，最终组合见§12.11 |
| S5 | Shelf 材料提取/处理→项目材料→Coding 会话实际消费 | `shelf-coding-materials-http` 核真实 HTTP/SQLite、固定原 bytes、scope/CAS、重启/归档；Agent start 是 spy，只证明材料进入启动参数。G5结合本轮Coding整改补正式AgentHost/PrologueAdapter实际消费固定原文的回归，越项目拒绝；已整合、尚未运行，不能将spy当模型证据 |
| S6 | Coding 变更集→Git 审批/暂存或提交→Diff；实际批准范围、状态失效与工作目录变化 | 已核 `git-operations` 隔离 repo/bare remote 和 `git-product-http` 正式审批/拒绝、重启、index锁、精确Diff及结果交给Coding；PR用 fake gh。`087e0c7df` 已补真实Catalog/HTTP/当前SDK写文件→本人审批→实际回执/盘上字节→Coding固定变更→Git批准暂存→两份固定Diff同链，逐字原文与暂存前后断言已核；provider仍为受控SSE，尚未运行，不能称同链通过或真实模型质量已验。既有Git失效/重启断言继续保留 |
| S7 | 助理按需发现→选择→审批→真实动作→撤销/刷新；来源精确权限、用户输入保留与真实模型的独立证据 | 已核 `agent-action-tools-prologue` 真SDK/授权文件/SQLite与 `assistant-undo-refresh.e2e` 真Chrome新增Todo后撤销；模型SSE为脚本。共同AUTH关键回归及SEND修后正式浏览器已验；typed能力桥与G5已整合但尚未运行，其他消费者及最终组合仍待收束，真实模型推理与质量未验 |
| S8 | Todo→助理到期提醒；项目 Schedule/Feed 持久任务重启/纯动作创建→Host 自动触发→一次业务结果 | 现行 Todo 的 `todo.reminders.window` 由助理按共同动作合同发现，服务每60秒扫描并保存去重notice，不经过Schedule；原“Todo→Schedule”措辞纠正，不新增依赖。已核 `assistant-reminders.test.ts` 的窗口、去重、quiet与读失败后恢复断言，原例注册fixture provider并手工sweep。`ea34f2a89`现已加入 W2-18-S8-TODO-01，真实Todo经HTTP创建后由服务原setInterval回调生成并去重notice；创建路径/状态码已在`89af5b5f2`对齐现行合同，尚未运行。项目Schedule的SCHEDULE-01/02另验持久任务重启、动作网关注册、真实Todo结果、三种关闭迟到拒绝与不重放；夹具统一built实例，避免source/dist两份状态。所有新增组合仍待实际通过 |
| S9 | Workflows 串联 Feed/Inbox/Pages/灵光及动作站；接收回执、结果未知/重试、停止与已派发操作 | `workflows-plugin` 已核真实Host动作/owner持久正文、原subject、固定成果起点、回执/并发CAS与重试；RouteTable调用并非网络HTTP，模型callback。WFSAVE/WF-OPEN局部已验（§12.5）；§12.10停止合同的生产Form与真实本机外部接受用例已在I7修正重复登记夹具后通过；最终组合见§12.11 |
| S10 | 现行 26 内置与 6 官方接入的安装/启用/配置变化/停用/卸载/重启→目录/调用/UI/持久事实一致 | 已核公共Runtime生命周期/SQLite重开、真实Home动作与HTTP取消、旧实例权限失效/重装世代、项目插件加删依赖；GitHub组合跑到Connector→Listener→Signals但provider是fixture。各包源码全审不等于32项都完成所有UI生命周期；真实账号、逐插件第二轮仍未全验，Issue已纳入 |
| S11 | 删除项目→所有实际 owner 清理→进程/任务/文件/引用与失败重试；共享个人内容按既有合同保留 | 已核唯一删除服务、managed删除事务/回执、声明owner与活服务替换接线，并读全部8份 `project-deletion-*` 测试；I6相应原始结果均通过。真CLI/MCP/HTTP、两连接/子进程锁、失败重试、同回执并发、Sessions内容、Memory/Assistant/Studio/图片与个人/其他项目保留有实际断言；模型SSE/部分清理owner为受控fixture，非真实账号试用 |
| 补充接点 | Images→Pages、Cognia 固定证据→文稿/PPT、Characters→Artifacts→Coding、创作台→安装→实际调用、Jelly 音频/网页→内容 | 各负责组报告现行真实支持与边界，不能凭同类功能存在就推断可组合 |

真实页面仍按 W2-18-FR 补键盘/辅助技术、暗色/英文、三宽度、离线/失败/无权限/部分成功、多窗口、配置返回与核心模型路径。只读会话先把具体缺证据动线和可复用用例列清；协调方在 I6 及已排修复验证释放机器后安排实操。没有必要账号、权限或产品未支持的路径写明，实质产品语义待决定时只暂停依赖部分，其余继续。当前 71/71 包源码审查完成，必要修复与组合核查仍在进行；整条防腐线不标完成。

### 12.8 全包深审发现的必要修复（增量，未验收）

本节只登记协调方已经核过实际源码的新增问题。其他审查候选仍需核事实与现行合同；源码确定不等于运行复现，更不等于已修复。修复沿用户允许的独立并行边界，唯一 spec 仍由协调方维护，I6 源码和整机验证队列保持冻结。公开合同、门禁与快照不在客户端修复的顺手修改范围。

| 编号 / 优先级 | 根因、真实触发与必要边界 | 最小实现范围与验收 |
| --- | --- | --- |
| W2-18-SEND / P1 | `assistant-island.ts` 2663–2686 在点击发送后先等待草稿请求，才从可变 UI 读取 work、scope、project、Character、上下文；`switchTo` 不受 busy 限制。A 的文字和材料可被发给后来选择的 B。回执也无条件重设当前工作、消费材料 | 点击时固定完整发送意图和未知结果重试身份；回执更新对应工作，仅在仍对应当前页面时更新可见输入与选择。限定助理客户端及其回归/README；不改领域合同。W2-18-SEND-01：真实 Home A/B、草稿 HTTP barrier、发送后切 B，只有 A 收到原文，B 事实/输入与当前选择保持。W2-18-SEND-02：选择页切项目与丢回执重试仍使用原 scope/材料/request_id，只产生一次业务结果。 |
| W2-18-WFSAVE / P1 | `workflows/client.ts` 402–434 的队列保存虽然捕获 A 的 URL，却在执行时读 `state.workflow` 的正文/revision，并把回执写回当前对象。A 连续两次修改、首个响应挂起时打开 B，可把 B 写进 A；返回目录还会读 null | 队列固定本次对象与内容快照，在同一对象推进版本；迟到回执/错误只影响所属对象，去抖也绑定原对象。限定 Workflows 客户端及回归/README，不改变流程停止合同。W2-18-WFSAVE-01：真实浏览器/HTTP/Store barrier 制造 A 两次修改→打开 B→放行，A 保存自己的两次修改，B 内容、标题、版本不变。W2-18-WFSAVE-02：返回目录、标题去抖、失败后再开/重载保留原对象编辑，不跳回或覆盖后来对象。 |
| W2-18-GMAIL / P1 | `gmail/history-cursor.ts` 454–562 合并候选时只留 25 个，`provider.ts` 686–739 却提交整个历史页的最终 historyId，超过 25 的增量邮件永久跳过；初次 25 条快照是另一项既有合同 | 修 reducer/provider 让进度只覆盖已消费记录，或保留有界未完成进度；不能只调大条数或悄悄丢尾。W2-18-GMAIL-01：单页/两页至少 26 个不同新增邮件，经真实 Connector→Listener→Signals→Feed 消费，在重复同步中全部恰好一次进入；W2-18-GMAIL-02：次页/详情失败和重启不丢尾、不越过未消费进度。G9已准备游标与真实接入链回归，尚未冻结/运行。 |
| W2-18-PLACEMENT / P1 | `placement-actions.ts` 82–114 丢弃原 caller，在 scope 中重建 ownerContext；`horizontal/placement/index.ts` 158–173 等待读取后直接写关系，move/copy/convert/bindGoal/create 同样丢原生命线 | 按 invocation 传递原可信控制，在本服务提交前复查，嵌套调用保留原来源/取消；不在共享服务上挂可覆盖的当前 caller。W2-18-PLACEMENT-01：真实 Host registry/SQLite，reader barrier 后取消或撤下原提供方，无关系/目标业务新增；W2-18-PLACEMENT-02：正常移动/复制/绑定仍可用，部分已提交结果如实可核对，不自动重派。与精确 AUTH 尾窗分别修、最后合并验证。 |
| W2-18-CATALOG / P1 | Catalog 的 Jira/Confluence `jiraHost/jiraBase` 与 Salesforce `salesforceInstance` 从 token 拼出任意目标；`createCatalogHttp` 只拒重定向，初始请求仍可携 Basic/Bearer 到声明 network 域之外或明文 HTTP。真实连接创建只验非空/长度，账号读取与 Feed 同步走该路径 | 在形成请求的共同边界校验当前官方 Cloud HTTPS 目标与可信 OAuth base；不新增任意自托管支持。W2-18-CATALOG-01：真实连接/账号读取/同步接线对 HTTP、IP、本机、伪后缀、账号、端口与路径/查询注入零派出、无凭据回显；W2-18-CATALOG-02：合法固定 Cloud 测试替身仍可完成，所有入口共用同一规则，安全不变量同步。只用隔离 Home 和测试凭据。 |
| W2-18-RSS-SOCKET / P1 | 自定义RSS在host.ts预检DNS后仍调不绑定地址的生产fetch；隔离证明预检8.8.8.8通过、实际DNS为127.0.0.1，真实回环TCP接入并收到TLS ClientHello | 将本次已检查地址固定到实际连接，沿原RSS策略及Host装配，不复制公网判定或扩大网络权限；保留原hostname/SNI/TLS、条件请求、同域重定向和现行198.18.0.0/15例外，已核现行Host与README未装配或承诺显式环境代理；自定义RSS遇明确启用且配置HTTPS环境代理时连接前封闭拒绝并说明限制，不静默直连、不回退普通fetch、不新增CONNECT/NO_PROXY解析；目录来源/YouTube保留原fetch，TUN假地址例外不变。W2-18-RSS-SOCKET-01：真实生产连接器遇预检/连接间DNS变化不接触私网socket，私网与混合答案零连接；W2-18-RSS-SOCKET-02：受控合法TLS、重定向、取消与流量上限正常且释放资源；明确启用的HTTPS环境代理被拒时直连及代理socket均为零。不得用纯lookup替身或fetch抛错代替socket拒绝证据。 |
| W2-18-RUNTIME-PIPE / P1 | CodexAppServerTransport只监听child error/exit，stdin.write后的异步EPIPE无人处理；隔离真实子进程关闭fd0后，owner虽捕获请求拒绝，仍因未处理Socket error退出1 | 在原transport内处理流故障，终止受影响实例、拒绝在途请求并释放buffer/timer；不吞错、不自动重派已派请求，旧child事件不污染重启实例。W2-18-RUNTIME-PIPE-01：真实子进程关读端后owner存活、请求明确失败且无未处理错误；W2-18-RUNTIME-PIPE-02：显式新请求恢复或关闭行为符合原合同，旧实例迟到事件不取消新实例。不连接实际Codex会话。 |
| W2-18-DATASET-SCHEMA / P2 必修 | `dataset/store.ts` 的 CSV parser 与 normalizeColumns 直接保留长表头，`actions.ts` 的所有记录输出却要求列名不超过 80；导入已落库才被公共动作拒绝，后续 get/list 也失败。Form 合法的 200 字题目会走到同一问题 | Owner 在任何持久化前落实已有 80 字与 40 列合同；receiveCsv 的现有事务保证创建/更新/回执同回滚。W2-18-DATASET-SCHEMA-01：真实动作导入 81 字表头拒绝且原表/版本不变，随后列表仍可读；80 字、引号多行正常往返。W2-18-DATASET-SCHEMA-02：Form 答卷→CSV→Dataset 超 40 列/80 字时明确拒绝、无目标表/回执，保留原答卷和 CSV；不悄悄裁列或扩合同。与正在修的 Dataset 客户端互不混改。 |
| W2-18-PPT / P1（含同路径 P2） | 本地 outline 等待 Pages source 后无原 beforeEffect 就更新；客户端生成中可关对话框并编辑，迟到回执只核 id 就 fillEditor，清掉新草稿和计时器；isBlank 也把仅有标题的已有页当空白替换 | 同一 PPT slice 补原调用复查/读取版本与对话框请求身份/取消/草稿版本保护，标题计入非空内容。W2-18-PPT-01：真实 source/model barrier 期间取消/撤权/停用/改稿，未提交结果不得写入或覆盖；正常原版本成功一次。W2-18-PPT-02：关生成框→新编辑→迟到回执，原输入与后续 SQL 保持；重开的生成框不受旧回执影响。W2-18-PPT-03：title-only 页在 append 下保留，显式 replace 与全空 starter 沿原合同工作。 |
| W2-18-FIXED-INPUT / P2 必修 | `PluginInputGraph.reference` 只查普通输出线；`saveArtifactBinding` 会删除这条线，固定成果虽然经 resolve 显示 ready，SDK inputs.reference/read 仍返回 null；Diff 是实际消费者 | 统一固定/普通输入解析顺序，连同 library 与 read 端口核可读性，不只补状态。W2-18-FIXED-INPUT-01：真实成果库绑定固定版本→SDK reference/read→Diff 正文差异均一致；W2-18-FIXED-INPUT-02：重绑、归档/失权、重开后的读取与状态一致，不自动换成最新版本。 |
| W1-18-SECRET-KEY / P2 必修 | 已有 `aes-gcm-file` 密文时仍调用 loadOrCreateInstallKeyFile，冷开缺 key 会新造主密钥，旧内容读不到后新旧密文可混存 | 有密文只读有效现有 key，缺失明确拒绝，不改 key/密文；空库首次安装仍可创建。W1-18-SECRET-KEY-01：隔离 Home 保存两项→关闭→移走 key→读取/写入/createIfAbsent 拒绝且原文件不变、不新造 key；恢复原 key 后原两项可读、新写正常。禁止操作真实凭据。 |
| W1-18-MEMORY-TX / P2 必修 | Storage memory-ledger 在 BEGIN IMMEDIATE 前递增 depth，BEGIN 在 finally 之外；锁冲突失败后同实例永远当作嵌套，后续多写失去事务 | depth 只覆盖实际已开始事务并在失败回收。W1-18-MEMORY-TX-01：真实两个连接/进程制造 BEGIN 失败，释放锁后同 ledger 多写的第二步失败必须整笔回滚，随后成功提交/重开结果一致。 |
| W1-18-SEMVER / P2 必修 | SDK comparePluginVersions 用 split('-', 2)，合法 alpha-a 与 alpha-b 都变成 alpha，影响版本选择和升级来源校验 | 只在第一个连字符处分开 core，保留完整预发布标识。W1-18-SEMVER-01：字母连字符、数字/字母、点分段及 build metadata 的独立字面量期望正确；真实 Runtime 升级接受合法较新版本、拒绝未变/倒退。 |
| W2-18-MEMORY-EFFECT / P1 | Memory Host 的 write/change/accept/discard/undo/import/clear 等只在进入 service 前检查；Prologue backend 还要等 store/startup，service 又等待 screen/list/origin，之后正文与账本写入无原调用控制。recall 的回执复查不覆盖其余命令 | 按 invocation 将可信效果控制传到实际写点，后台已接受任务继续用其独立授权；不得在共享 service 覆写全局 caller。W2-18-MEMORY-EFFECT-01：真实 registry、backend startup/screen/list barrier 中取消/撤权，放行后无首次业务提交；W2-18-MEMORY-EFFECT-02：本人写入、接受、撤销与清理正常，已提交的部分事实如实恢复，不谎称全无效果或自动重复。 |
| W2-18-GOAL-PIN / P1 | Goals deliverable/input pin 先核 Goal、await owner pin 后直接写关联；`pinActionSubject` 没保留父固定动作来源检查。仅撤父动作精确授权或归档 Goal 时，子 owner 可保持授权，父关联仍会落库 | 沿现有原调用控制保留委托来源，返回后原 beforeEffect 与 Goal状态复查再写 Ledger。W2-18-GOAL-PIN-01：真实 Host/owner pin 的派出前与返回前 barrier，父撤权/取消/停用分别保证零派出或零新关联；W2-18-GOAL-PIN-02：归档目标不再新增关联，已有 owner 固定成果仍是有效已发生事实，重新授权不重复固定。 |
| W2-18-COGNIA-EFFECT / P1 | directory_preview 通过普通绑定 scan→preview，只在 scan 后检查 signal；只撤销外层精确动作、保留两个依赖权限，preview 仍可保存暂存材料和业务预览 | 用同一个来源授权机制包住嵌套动作。W2-18-COGNIA-EFFECT-01：真实扫描 barrier 撤外层授权，放行后 previews/materials/sources 无新增；依赖权限不能替代父授权。重新授权后同入口预览、本人明确提交正常。 |
| W1-18-SESSION-CONFIRM / P2 必修 | `project-resolution.ts` 唯一已关联目录直接返回 bound；MCP restoreBoundSessionConnection 接受它，新的 Session 无确认就取得项目连接。PRODUCT 明确新 Session 即使一个候选也需确认；旧测试的自动继续预期不构成豁免 | 无本 Session 确认绑定时只返回建议，保留已确认绑定恢复和显式 bind；不引入新绑定事实。W1-18-SESSION-CONFIRM-01：隔离 Home 正式 MCP，新 Session 同目录仍无 connection，明确确认后才可进入项目；解绑不因唯一目录立即复活，多候选/symlink/无稳定Session按现行合同处理。 |

| W2-18-CAPSULE / P2 必修 | 胶囊客户端调用 `capsule_resize`，Rust 已实现/注册，现有 `capsule.toml` 却没有允许此命令；remote WebView 拒绝后客户端吞错，内容变化不能调高度 | 只补胶囊现有许可与客户端调用覆盖，保持 S-14 的窗口/来源边界。W2-18-CAPSULE-01：隔离桌面短/长内容下高度在既有 252–476 范围改变且锚点/边界正确；W2-18-CAPSULE-02：错误窗口/外源仍拒绝，不能用名单包含替代原生效果。 |
| W2-18-CONTINUITY-QA / P2 必修 | 文档指定的 `server/tooling/continuity-demo.mts` 同一 const 重复声明 projectId，解析即失败；固定成果夹具参数也落后于当前 owner 合同，既有测试没有运行这个命令 | 对齐现行参数、保留显式隔离目录与故障开关边界。W2-18-CONTINUITY-QA-01：按 README 真启动隔离 QA，写/读固定成果和进展、丢回执后同键重试只产生一条业务事实；不接真实 Home/账号。 |
| W2-18-CLIPBOARD / P2 必修 | `shelf_hotkeys_macos.rs` 非 Finder 文件复制只保存纯文本，随后 clearContents 丢掉图片/RTF/文件 URL；未看 changeCount 可误收旧文件；file URL 直接剥前缀未解码中文/空格 | 同一路径保全 pasteboard items/types，确认本次复制有新内容，恢复不得覆盖期间用户的新复制，URL 用现有原生解析；不增加持久状态。W2-18-CLIPBOARD-01：受控独立板的文本/RTF/图片/文件 URL 在复制成功/失败后完整保留；W2-18-CLIPBOARD-02：未复制不收旧文件、新复制不被旧恢复覆盖、中文/空格路径正确。不得拿真实用户剪贴板作破坏性试验。 |
| W2-18-HOTKEY-IO / P2 必修 | 快捷键 dispatch 明确在主线程，抓网页/收文件继续同步 osascript/curl/文件与 Host IO，curl 可等 20 秒并有 sleep，堵住 AppKit 窗口/菜单/快捷键 | 主线程只做必要 AppKit 与目标快照，慢 IO 用现有 worker 方式，结果回主线程；与 CLIPBOARD 同一 writer 连续处理，异步后仍用原目标。W2-18-HOTKEY-IO-01：受控慢 HTTP/automation 时窗口、胶囊/toggle 可用，超时解释清楚，原目标不漂移、入库不重复。 |
| W2-18-COMPONENT-DRAFT / P2 必修 | 公共 plugin component renderer 提交后只禁按钮，字段仍可编辑；旧成功无条件关 sheet/dialog、reset form，清掉等待时新写的草稿。epoch 只保护换版/部件，不保护同表单的新输入 | 依据提交时输入版本处理清空/关闭，沿既有 pending 编辑合同，不加草稿服务。W2-18-COMPONENT-DRAFT-01：生产 renderer 提交 A→等待时编辑 B→A 返回，B 保留，真正提交 B 后才清 B；W2-18-COMPONENT-DRAFT-02：失败保输入、销毁/换版旧回包不回写，表单与浮层均覆盖。 |

| W2-18-WORK-EFFECT / P1 | Work discover/create/handoff 入口只在进入 service 前查控制；等待 Runtime discover/create/read 后继续写 Session/草稿，create 返回后还可继续派 handoff，原 caller 控制未传入 | invocation 控制传至每个等待后的首次提交/下一派发点，不存在共享 service 的可变 caller。W2-18-WORK-EFFECT-01：真实 ActionService/Session owner 与 Runtime barrier 中取消/撤权/停用，放行后无新 Session/草稿/后续 handoff；W2-18-WORK-EFFECT-02：外部已创建但本地未获提交授权的目标如实保留未知、不自动重建；仅消息真实送达回执沿 §12.10 窄例外，拒绝返回和重派，恢复不重复。 |
| W2-18-ALCHEMIST-EFFECT / P1 | foreground invoker 只传 signal；conversation 的取消/拒绝被 catch 后写成新的 failed assistant 行；plan 等模型/来源、settings 等模型元数据后也无 beforeEffect 直接写库 | 可信控制按调用传到前台实际写点，取消/撤权不能转成业务失败回复；已合法保存的本人消息保留，独立后台 job 生命周期保留。W2-18-ALCHEMIST-EFFECT-01：正式 Host/SQLite 的模型/metadata barrier 取消、撤权、停用，无迟到回复/plan/settings 与后续派发；W2-18-ALCHEMIST-EFFECT-02：正常失败解释与重新授权后恢复正确，不靠存 failed 行假称无写入。 |
| W2-18-WF-OPEN / P2 必修 | 搜索/对象标签发送现行 select-item 的 itemId，Workflows listener 遇 itemId 直接 return，实际保留 B 或目录而非选中的 A | 沿现有 openWorkflow/navigationRevision 接入，兼顾延迟挂载与无 id 返回目录。W2-18-WF-OPEN-01：正式搜索 A、已开 B、首次懒加载/恢复标签均真正打开 A，正文/标题/助理上下文同对象。由现有 WFSAVE writer 连续处理，避免客户端双 writer。 |
| W2-18-SHELF-OPEN / P2 必修 | Shelf 搜索返回合法 clipboard id，但 applySnapshot 只查 materials/results，清 selectedClip 并说材料已不存在 | 由现有 owner id 区分内容与 clipboard，保留 user-only。W2-18-SHELF-OPEN-01：实际查询/打开剪贴板结果在首次与已挂载页面选中正确正文；普通材料正常，Agent/MCP 仍不可读剪贴板。 |
| W2-18-SHELF-CACHE / P2 必修 | full text cache 只按 item_id，权威 reload/另一窗口改同 id 正文不失效，旧 file 回包也能覆盖新值 | 将缓存/在途读与 owner 当前内容或 reload 代际绑定，沿现有投影，不造事实库。W2-18-SHELF-CACHE-01：正式 owner 改 A→B 后刷新/返回读到 B，早期文件回包不得恢复 A，比较视图同样正确。 |
| W2-18-SHELF-LIFETIME / P2 必修 | shelf-admit 用 window.addEventListener 而非共享 lifetime；卸载后旧 handler 仍发失败通知，重挂后成功与假失败并存 | 用既有 lifetime.listen，死 mount 不派出也不发布结果。W2-18-SHELF-LIFETIME-01：真实 detach/remount 后一次入库只一 POST/一成功且无旧失败；只剩已销毁 mount 时零请求/通知。 |
| W2-18-ALCHEMIST-UI / P2 必修 | Alchemist 搜索只能点当前已渲染 collection/filter 内条目，没有 select-item；client 未挂共享 lifetime，隐藏/卸载后继续轮询与事件响应 | 用现有 authoritative bootstrap 定位 kind 与现有 seq 打开；共享 mount lifetime 管 fetch/listener/observer/timer。W2-18-ALCHEMIST-UI-01：跨集合/过滤/懒加载搜索打开对应对象且迟到回包不覆盖新选择；W2-18-ALCHEMIST-UI-02：隐藏停读、返回一次刷新、卸载取消、重挂无重复，已接受后台 job 独立。 |
| W2-18-ALCHEMIST-PARTIAL / P2 入口纠正 | 固定研究成果复用的生产 WorkReuseHostPort 缺失是既有披露的未完成项，当前“保存固定版本”却无条件可点且必失败；fixture 端口不能作生产证据 | 本轮按既有 available=false 明示不可用并保留方法复用，不顺手实现全套发布/preview/Manifest。W2-18-ALCHEMIST-PARTIAL-01：正式 Host 无端口时没有可执行发布承诺，说明可见、方法链仍可用；完整成果复用仍保持后续未完成。 |
| W2-18-BROWSER-UPLOAD / P1 | 浏览器选择 A 文件后等 FileReader，才从共享 dataset 取 chooser；期间 B 覆盖 id，A 字节可上传到 B。Host 对当前 B 的身份校验无法发现错配 | 选择时固定 chooser/page/文件任务，失效就拒绝，禁止把旧文件改投新 chooser。W2-18-BROWSER-UPLOAD-01：两个隔离真实网页，A 读取 barrier→B 选择器→放行，B input/接收端无 A 字节；W2-18-BROWSER-UPLOAD-02：正常多文件/取消/失败重选可用。不使用真实私人文件。 |
| W2-18-BROWSER-GRANT / P1 | approve-site await 后 decide 读可变 reviewing，可批准后到的 B；站点面板显示 A，按钮从可变 state.origin 写 B，授权失败 catch 后还继续 decide | 点击时固定原 review_id 与显示 site scope，失败不继续批准，旧回执不关新审查。W2-18-BROWSER-GRANT-01：A 站点请求 barrier、A 结束/B 成当前、放行，B 仍 pending/零效果，只保存 A 决策；W2-18-BROWSER-GRANT-02：面板显示 A 后导航 B 再操作，持久决策仍属于 A。 |
| W2-18-GIT-TARGET / P1 | readGitSummary 读取 remotes，但审查 revision 不含 URL；批准期间 origin 改到 B 后执行 git push remote.name，仍通过旧 A 审查 | 固定该操作实际远端目标并在执行前复核，保留用户正常改 remote 能力；核 pushurl/有效目标，不只显示旧 URL。W2-18-GIT-TARGET-01：临时 bare A/B、prepare A→改 origin B→批准拒绝，B refs/objects 不变；正常 A 推送通过，无真实远端写入。 |
| W2-18-GIT-CONFLICT / P1 | resolve 的 revision 仅含 HEAD/index 等，不含冲突文件正文/身份；等待期间新编辑未 stage 仍被 writeFile 覆盖，替换 symlink 也未在写前拒绝 | 唯一 Git owner 固定并核正文/文件身份与实际授权路径，写入不跟随后到链接。W2-18-GIT-CONFLICT-01：真实临时冲突，prepare 后改正文再批，拒绝且新正文/index保持；W2-18-GIT-CONFLICT-02：换 symlink 到隔离外部哨兵明确拒绝、哨兵字节不变，正常解决/暂存成功，安全表同步。 |

| W1-18-MCP-CONFIG / P2 必修 | 损坏/冲突的 MCP grant 被读成空配置，permission-free system 默认放行会重新开放已明确撤下的动作；缺配置与坏配置被混为一谈 | 唯一 parser/resolver 保留拒绝状态，冲突精确 key 拒绝，其他合法 grant 保留；不增授权事实库。W1-18-MCP-CONFIG-01：真实临时配置的重复/错版/读错沿 Host 发现与调用不可恢复已撤动作，明确管理修正后正常；首次无配置仍按现行默认。归原 AUTH writer，同文件不另派人。 |
| W2-18-RUNTIME-ROLLBACK / P1 | 接入写 config/Skill 后 await 验证；失败盲恢复旧整份文件并删当前任意 symlink，覆盖验证期间后来编辑/另一接入 | 唯一 confirm 按实际 Runtime 目标协调；回滚仅收回仍属于本次的内容，变化保留并明确冲突/备份，不谎称全部恢复。W2-18-RUNTIME-ROLLBACK-01：真实临时配置/Skill，验证 barrier 内改 key/链接后失败，后来内容保留；并发同目标确认不撤掉后来成功，备份可核。 |
| W2-18-RUNTIME-TOML / P2 必修 | 文本 regex 不识别合法引号 key 的 TOML 表，同一 family 又追加裸表，最终实际配置不可解析 | 按当前 TOML key 语义识别/验证既有 owner，保留无关字节，不新增历史兼容。W2-18-RUNTIME-TOML-01：quoted owner prepare/confirm 只一份可解析 family；未知 owner 明确冲突、零写；现行裸表正常。 |
| W2-18-CARD-UNKNOWN / P1 | 助理卡把 output_invalid_after_effect/outcome_unknown 记 failed，而 failed 可重试，已发生业务可能重复 | 按共同错误身份归 unknown 并禁止重派，供原 owner 核对。W2-18-CARD-UNKNOWN-01：真实 ActionService 先写库再返回坏 schema，卡 unknown，第二次/重启不再执行；生成插件 outcome_unknown 同样拒重派，正常未生效失败仍可恢复。 |
| W2-18-FOLLOWUP-DELETE / P2 必修 | 定时回调持旧 followup 等待，删除只删队列和行，尾部 UPSERT 重建定时并再派下一次 | 等待后核现行同一记录，尾部仅 CAS 更新仍存在版本，再排下一次。W2-18-FOLLOWUP-DELETE-01：真实 Store/Adapter 状态读取 barrier 中删除，放行后不开始尚未派出的轮次、不复活记录、不排下一次；已开始轮次不自行扩大停止语义。覆盖已跑助理后转交Coding的同一工作：原session_id仍在、可继续定时，Coding state/update等待期间删除也不能runs.start；G1串行接Host CodingExecutor调用控制，G5仍管Coding实际effect边界。 |
| W1-18-MODEL-SCHEMA / P2 必修 | openConfiguredModels 只检查宽版范围，与正式 Catalog 严格现行 schema 不一致，旧 21 库仍可读取模型 | 复用唯一 assertCurrentCatalog，旧/新/坏版拒绝且不改库、不解密、不调模型。W1-18-MODEL-SCHEMA-01：真实临时 21/22 Catalog 经独立模型入口分别拒绝/成功，版本和原库不变。 |
| W2-18-DIRECTORY-PICKER / P2 必修 | 默认 runner await 原始 execFile 返回 ChildProcess，立即把 stdout 流当空文本，提前 cancelled/释放 busy | 唯一 runner 真正等待进程结束并收字符串。W2-18-DIRECTORY-PICKER-01：默认实际子进程的成功/取消/错误/超时可核，未结束前第二选择仍 busy；真实系统窗口单列实操。 |
| W2-18-ONBOARDING-GMAIL / P2 必修 | 首次使用来源读绕过共同 resolver，以旧专用 expiry/client 规则读当前 API OAuth，过期后直接401而不刷新 | 复用被选账号的共同 resolver/lifecycle，不跨账号回退。W2-18-ONBOARDING-GMAIL-01：隔离现行 API OAuth 数字过期连接，经实际首次使用读取只刷新一次并固定材料；专用 Gmail 正常，断开不开始新请求。远端用测试替身，不读真实账户。 |
| W2-18-NATIVE-BODY / P2 必修 | 原生 HTTP JSON 按字符而非 UTF-8 字节限流，超限 reject 后仍积累/解析 | 同一 reader 按 wire 字节拒绝，settled 后不留正文/解析，保留413回应。W2-18-NATIVE-BODY-01：真实 HTTP 限内中文成功、字节超限413且 handle/DB/模型零效果；分块超限后停止累积，畸形JSON仍400。Pages、Workflows 迁到 Runtime 后，本回归经仍使用此 reader 的 Schedule 公开入口（256,000 字节）验证；两者的 Runtime 限额另由真实 HTTP 错误模型用例覆盖。 |
| W1-18-SHELF-FORMAT / P2 必修 | Shelf 存储读取忽略 version，补旧单项 job/result 字段和 done 状态后可覆盖为现行格式 | 仅接受现行版本/形状，删除历史补齐，不增加迁移；保留现行单项 API 输入。W1-18-SHELF-FORMAT-01：真实 ShelfStore 读当前/错版/旧形状，前者可用、后两者拒绝且文件字节不变。 |
| W1-18-CHARACTER-SCHEMA / P2 必修 | openCharacters 对已有 v0 库 CREATE IF NOT EXISTS 并盖 v1，违反现行库拒绝规则 | 区分首次空库与已有表无版本库，仅前者创建。W1-18-CHARACTER-SCHEMA-01：公开入口新建/重开成功；已有表/数据 v0、未来版明确拒绝，结构/数据/user_version不变。 |
| W2-18-CONCERN-EVIDENCE / P2 必修 | Goal 解决/推翻 Concern 表单只给 event_ids，客户端仅 open 使用，未提交后端要求的 supporting_event_ids | UI 显示真实处理证据并沿现有 HTTP 传入，不放宽后端拒绝。W2-18-CONCERN-EVIDENCE-01：真实页面开问题→后续事件→解决/推翻，读回历史和完成阻塞正确；前序/外 Goal 证据拒绝且保留输入。 |
| W2-18-ATTENTION-TX / P2 必修 | Attention 独立 create/deleteSubject 没有事务，journal 失败后留下事项/部分事件；Feed 手动加入和 Goals reconcile 是实际独立消费者 | Owner 同库事务覆盖事项、事件和同步 journal，复用既有嵌套事务。W2-18-ATTENTION-TX-01：真实独立消费者注入 journal 拒绝，三类事实全不变；恢复重试恰好一次，原 Feed 外层事务继续成立。 |
| W2-18-GOAL-PIN-RETRY / P2 必修 | Goal 固定成果提交成功但回执丢失后，页面重试新随机键再次委托 owner，Pages 生成 v2；普通 reference 幂等无效 | 沿现有 owner/Goals 机制恢复同一次意图，或未知先核对再继续；一次性控制键不当业务回执。W2-18-GOAL-PIN-RETRY-01：真实 HTTP+Pages/Artifacts/Ledger 提交后丢回包，同意图重试只一固定版/一关联；新的明确固定意图可增版。动作 shape 若变化按现行版本规则处理。 |
| W2-18-PLANNING-LATE / P2 必修 | 规划详情 A 的迟到成功/失败无条件覆盖已打开 B 的编辑器，关闭也不失效 | 固定请求/选择身份，关闭/teardown 失效，仅当前详情可回写。W2-18-PLANNING-LATE-01：真实 A慢/B快并写B草稿，放A成功/失败不改B；关页后不重开。 |
| W1-18-GOAL-POLICY / P2 必修 | Goal 页面仍给 scope=goal override 表单，而当前 HTTP 一律只收 project_default，操作必失败 | 删除旧单 Goal policy 写入口，展示现行项目默认与 Goal 要求，修改沿已有事件合同。W1-18-GOAL-POLICY-01：真实 Goal 不再给必失败表单，现行要求修改/项目默认保存/继承和收尾检查正常。 |
| W2-18-FUNCTION-CHOICE / P2 必修 | Functions provider 接受 Choice 任意字符串并先存 ok 判断；精确 published action 的 enum 在副作用后才拒绝 | 在生产 provider 转换边界核已声明 criteria，非法答案按真实失败处理，不保存错误成功；不推断未查证的其他原语语义。W2-18-FUNCTION-CHOICE-01：原生协议返回 enum 外 choice，preview/通用/精确动作均不产 ok 历史或取得发布资格；合法选项结果正常。 |
| W2-18-PAGE-CARDS / P2 必修 | 助理逐张绘制 page card，却每次删除不在单张数组的其他卡，多个待确认卡只留最后一张 | 列表清理按完整集合，单张绘制不删除兄弟卡。W2-18-PAGE-CARDS-01：同真实 work 两张页面卡均可见，执行/忽略/重读各自状态与 Host 一致。仅原 SEND writer 连续修改该文件。 |
| W2-18-ASSISTANT-404 / P2 必修 | A 刷新晚到 not_found 未核 currentId，会清掉后来打开的有效 B | 成功与失败 UI 效果都固定原读取身份。W2-18-ASSISTANT-404-01：A慢404/B先成功后B选择/草稿保持，A原地删除仍退出。仅原 SEND writer。 |
| W2-18-HOME-LOCALE / P2 必修 | Home plugin 页面硬写 zh-CN 和 identity translate，英文工作台的 Issue 侧栏仍中文 | 注入现有 locale/L/clientI18n，无第二词典。W2-18-HOME-LOCALE-01：英文选择页/项目中的 Issue 侧栏、无模型设置往返与错误随语言，中文正常。#1127 合入后的设置链接按 S-47 打开宿主设置面：首次设置请求失败显示共用请求助手的英文错误和 Retry，点击后由真实 Host 返回模型设置，能关闭回到原 Issue 草稿；宿主地址不跳转、草稿不因往返保存。 |
| W1-18-TAB-FORMAT / P2 必修 | 当前读取仍把 task/goalId/mother/preview/collapsed 旧状态转成现行对象，无当前 writer | 恢复只收现行形状，删历史转换，保留当前 settings撤下与合法标签/组/分屏规范化；其他旧键先核writer再删。W1-18-TAB-FORMAT-01：当前真实标签/多层分屏重载正确，旧状态不转换；保留现行 UI 无母页/preview 的负向断言。 |
| W2-18-SETTINGS-LATE / P2 必修 | 设置 A 迟到失败无 request 检查，会替换已打开 B 为 A 错误页 | 失败/重试与成功同样绑定请求。W2-18-SETTINGS-LATE-01：A慢失败/B成功并编辑后B字段/目录保持，A原地失败仍能重试且有诊断编号。 |
| W2-18-REFERENCE-LATE / P2 必修 | 项目引用预览共用 dialog，A关闭后打开B，A迟到正文可覆盖B标题/下载对应内容 | 只读请求绑定当前预览，关闭/重开失效。W2-18-REFERENCE-LATE-01：真实两文件B先/A后，正文/标题/下载一致，旧失败不改下一预览。 |
| W2-18-MARKET-REFRESH / P2 必修 | 市场 projects 首次读后永久缓存，不消费现行插件成员变更，重新打开仍显示反向添加/移除 | 用既有 changed 事件使投影失效并重开读现行事实，不增事实库。W2-18-MARKET-REFRESH-01：市场→switcher改成员→市场，按钮/Dock/Host一致；失败保持正确最后状态。 |
| W2-18-STOP-FEEDBACK / P2 必修 | 后台命令停止的 catch 只开按钮，丢失拒绝/未知结果与诊断 | 沿现行 UiRequest 显示错误，不自动重试。W2-18-STOP-FEEDBACK-01：真实停止拒绝、断线未知、成功的反馈与任务后续状态一致。 |
| W2-18-FUNCTION-LATE / P2 必修 | 判断规则样例保存/删除和草稿删除迟到回执无条件 remember/closeEditor，切B后清B草稿；保存前 await还可换目标 | 点击固定规则/版本/正文，结果更新原记录，仅同对象可更新编辑器。W2-18-FUNCTION-LATE-01：真实A/B延迟样例保存/删除/草稿删除，B输入/选择/URL保持，A持久结果正确。 |
| W2-18-FILE-PREVIEW / P2 必修 | 侧栏文件预览只比较裸 id，协议身份实际是source/kind/id，A迟到可覆盖同id的B | 用完整身份及本次请求保护成功/失败，外部给定预览/返回/重开使旧请求失效。W2-18-FILE-PREVIEW-01：真实两来源同id不同内容A慢/B快，最终正文/标题/打开目标一致。 |

| W1-18-MEMORY-CANDIDATE / P2 必修 | candidateRecords 列表读取为缺少 Prologue 候选的旧 ledger 行 propose/discard/expire 并改 id，属于未获保留的读取迁移 | 删除旧迁入与旧 accepted 缺失分支，现行缺失给明确状态，不用读取悄悄补事实；正常版本/来源/撤销保留。W1-18-MEMORY-CANDIDATE-01：现行及缺失/损坏候选列表均无业务写入，正常采纳/丢弃可用；真实Home存量维护单列，不擅自改真实库。 |
| W2-18-THINKING-BUDGET / P2 必修 | Node先写显式输出budget，再被thinking整份params的32768覆盖，冻结预算与实际请求不符 | 同一params按显式上限和既有默认合成，不能静默提高。W2-18-THINKING-BUDGET-01：真实SDK请求显式7+thinking仍符合7上限，frozen/request/usage一致；不支持组合须派出前明确拒绝，默认正常。 |
| W2-18-CHARACTER-LAUNCH / P1 | launch不消费beforeWrite；Host等workspaces/registry后写bundle/Session/event并spawn，HTTP又漏request.execution | 启动端口按invocation传检查，Host最后一次await后同步核原授权/角色active及固定publication，再写bundle/Session/event并派发；仅callback返回前检查不足。统一HTTP控制，已接受进程沿自身生命周期。W2-18-CHARACTER-LAUNCH-01：真实动作/HTTP加启动barrier，取消/停角色/撤提供方后零新文件/Session/event/进程；正常恢复及重复请求仅重接。 |
| W2-18-PARSE-RESOURCES / P2 必修 | documents.parse发布输入binary与SDK派生文本，返回值只有正文，未释放任何ref；Home资源容量可持续耗尽 | 文本适配器finally经资源owner释放自己临时输入/派生件，失败同样回收，不删历史附件。W2-18-PARSE-RESOURCES-01：同runtime累计超容量的多次成功/失败解析后容量回收，后续图片仍可发布，使用中的其他资源保留。 |
| W2-18-BUILDER-LATE / P1 | Builder查token后await resetPreview，再用最新revision改design/connected/phase；暂停或新job期间旧结果能写新构建 | reset等待后再次核原token/取消，预览与业务提交仅处理所属版本。W2-18-BUILDER-LATE-01：真实reset stopRunner barrier→暂停/修订/续跑→旧回包，design/history/connected/phase与新预览不被旧job改，合法恢复可完成。 |
| W2-18-UPGRADE-SECRETS / P2 必修 | upgrade UI丢consent.secrets，Host切版本也不保存，新版声明密钥用户填完仍不可用 | UI传批准值，Host按release验名并在升级结果中保存/回收本次变化，不损原版密钥或串安装。切换/expose等待后的收尾与失败回收同时核安装、启用代次与关闭状态，不覆盖期间较新的停用/启用选择；expose自身失败导致的停用与较新用户选择需区分，原尝试可恢复，旧失败不能停用新实例，恢复等待后先核身份再写批准值/曝光。W2-18-UPGRADE-SECRETS-01：隔离真实consent→Host升级→受控HTTPS使用新fixture密钥，公开清单无正文；失败原版/密钥仍可用，并以生命周期屏障核较新选择保留。不操作真实凭据。 |
| W2-18-CODING-BACKGROUND / P2 必修 | readBackground失败时running Map为空，仍持久setBackground(null)，瞬态失败抹掉最后已知运行命令 | 区分成功空与读取失败，只改成功runtime投影，失败保最后事实并明确未知。W2-18-CODING-BACKGROUND-01：真实SDK命令仍运行时查询拒绝→恢复，Store/HTTP/跨项目列表不假装结束；多runtime部分成功独立更新。 |
| W2-18-CODING-EFFECT / P1 | Coding HTTP丢execution，handler未用beforeWrite；ready/SDK多次等待后仍保存报告/变更/计划或启动Run | 共用adapter与per-invocation控制贯通所有前台最终写/接受启动点，后台已接受run/wake沿activation生命周期。旧typed能力桥的options→SDK→Host→invocation也必须保留原取消与同步checker，只有异步before_effect不足；共同端口由原AUTH owner串行补齐。W2-18-CODING-EFFECT-01：真实action/HTTP+SDK ready/read barrier，取消/撤权/撤提供方后零新报告/过程项/计划/Run，原快照与版本检查保留；正常恢复可用。W2-18-CODING-EFFECT-02：初始Run持久提交前拒绝原失权调用，同权限peer不借权，已接受Run脱离前台断连后完成并可重开。W2-18-CODING-EFFECT-03：Session首次提交前及SDK记录与owner索引之间的失权均不留下不可接续半成品。 |
| W2-18-CODING-WAKE / P1 运行阻断，含原P2恢复 | plugin start只建surface，已有runtime wakeLoop仅readState重启，持久fired等待重启后不自动继续。整合STOP实跑又暴露Host awaitFiredWaits在adapter无waits时立即返回空数组，Coding成功空结果立即再等，形成微任务循环；隔离测试进程持续约99%CPU，120秒定时器未执行。G5冻结版本仍有同路径，不能通过补假waits掩盖 | activation ready后由现有服务恢复本owner的等待消费者，stop释放，不造新等待事实；不支持waits明确拒绝，消费者停止永久不支持的等待，真实服务临时故障保留退避与恢复。W2-18-CODING-WAKE-01：隔离真实waits重启且不打开页/读state，满足后只续一次；撤回/held/关闭正确，连续服务失败不靠页面恢复。W2-18-CODING-WAKE-02：正式Host与只支持background的合法Runtime，经Coding state/activation进入后，定时器、HTTP读取与原STOP路径仍可完成，不出现空成功忙循环；支持waits的正常长等与原四次故障恢复仍通过。 |
| W2-18-CODING-DELIVERY / P2 必修 | 收交付先complete信，再在材料满30时跳过附上，却总返回attached:true | 在了结前落实既有容量，明确拒绝并保留可决定交付或回真实未附上，不silent skip。W2-18-CODING-DELIVERY-01：真实delivery/HTTP/store的30项+新项与已有同引用场景，返回/信/材料/下轮frozen refs一致。 |
| W2-18-CODING-DELEGATE / P2 必修 | sendPeopleMessage已flush后deliver失败，catch仍以“没发送”归档target；重试新建身份可重复委派 | 保留实际target/message引用，区分派前失败与已存/未知，恢复先核对不换身份重派；恢复观察及返回正文前仍核原调用，取消/撤权不得被catch转成成功，不能套用Work窄回执例外。W2-18-CODING-DELEGATE-01：真实SDK send flush后deliver拒绝/丢回包，重开仍同原信/目标可见，恢复无新target/重复信；失权调用拒绝返回、派前失败正确回收。 |
| W2-18-CODING-LIFETIME / P2 必修 | Coding全局assistant-effect监听未归lifetime，卸载/重挂保留旧闭包响应 | 使用现有lifetime.listen。W2-18-CODING-LIFETIME-01：真实挂载→卸载→重挂→effect，仅活实例刷新，旧DOM/请求/监听不残留。 |
| W2-18-CODING-REPORT / P2 必修 | 合法TaskBoard insert后节点数不同原plan，report拒绝整个board/verdict且Markdown只遍历原steps | 保留固定plan来源核对，接受owner合法修订的当前图并固定新增节点/用户记录/评价/version。W2-18-CODING-REPORT-01：真实SDK插步并记录/评价→保存重开报告，原/新增均留，后续变化不改固定报告；来源不可核仍拒推断。 |
| W2-18-FORM-ANSWER / P2 必修 | 离线填写页无4000字检查，生成“成功”答卷后owner无法导入，组合路径自相矛盾 | 导出输入与提交执行现行答案上限，含多选合成值，超限留输入/无成功文件。W2-18-FORM-ANSWER-01：真实导出HTML4000字可导入一次，4001不假成功，required/choice/date正常。 |
| W2-18-FORM-LABEL / P2 必修 | 原生/导出Form题目仅视觉span，input/select无可访问名称，选项缺题目分组名；整合真实AX又确认dropdown仅设aria-required，增强器从原生required读到false，必填语义丢失 | 复用原生label/fieldset/legend或aria关联，不改变题意；公共下拉增强器尊重原select显式aria-required，缺省沿用native required，不改变Form现有提交校验与错误提示。W2-18-FORM-LABEL-01：两种真实页的浏览器可访问树/键盘填写暴露题名和必填状态；真实读屏本人体验仍单列。 |
| W2-18-CONTENT-CONTEXT / P2 必修 | Cognia返回/删除与Images返回历史只关工作区，留下插件声明的旧对象，助理/Placement继续消费A | 各owner统一关闭路径清当前可见对象，不因Images导航取消已接受job。W2-18-CONTENT-CONTEXT-01：真实A→目录/删除→B，助理对象与实际可见对象一致，删除后无旧id，重开正常。 |
| W2-18-IMAGES-SETUP / P2 必修 | Images服务modal内连接设置链接打开设置cover但不关原生modal，top-layer/inert挡住设置 | 跟随既有设置链接前关modal，保留服务草稿，打开服务框主动刷新账号。首轮真实浏览器确认设置cover只改变CSS可见性，不触发现有hidden生命周期，单靠whenVisible仍漏掉新账号；2edbc178c已补打开刷新及失败提示，待运行。W2-18-IMAGES-SETUP-01：真实首次无账号→设置可点/键盘可达→建受控账号→返回可继续生成，原输入在；不使用真实厂商。 |
| W2-18-LINGGUANG-REVISION / P1 | list刷新把selected换新updated_at但保留旧编辑正文，后续用新版本提交旧输入，绕过正确CAS覆盖远端编辑 | 编辑器ack版本独立于目录元数据，只有真正打开/成功保存才能推进。W2-18-LINGGUANG-REVISION-01：实际A编辑器、外部动作改A、B placement触发列表刷新后本地改A必须冲突并保留两边；显式重开及同草稿队列正常。 |
| W2-18-PAGES-CREATE / P1 | create/extract等待时旧A仍可编辑，迟到remember/fillEditor清dirty/计时器并换对象，A新稿丢失 | 沿草稿版本/选择/保存队列在采用新结果前保存离开稿或留在冲突，不重置新输入。W2-18-PAGES-CREATE-01：真实create/extract HTTP barrier中编辑A，放行后原字句与最终SQL保留，外部写冲突保两边，新记录可找且不重复。 |
| W2-18-PAGES-EXPORT / P2 必修 | Markdown只取表格cell.firstChild且漏attrs卡片/mention；HTML/print的DOMSerializer输出空card，丢可见事实 | 序列化所有文本段落和支持卡片/引用为可读正文/链接，导出静态DOM可读；数据图像省略沿已披露边界。W2-18-PAGES-EXPORT-01：独立期望fixture的双段cell/任务/事件/引用，经content.read/files/artifact及真实Markdown/HTML/print均保留事实。 |
| W2-18-PAGES-TRANSIENT / P1 | 同EditorView换Doc未使FileReader/普通popover失效，A读图迟到或A弹层保存会写B并自动保存 | 文档切换结束其瞬态读取/弹层，回调核alive/doc身份；同文档读取保留映射锚点，不拿后来caret替代。W2-18-PAGES-TRANSIENT-01：真实上传/粘贴/拖图barrier A→B后B库/正文不变，同Doc插原锚点；A任务/评论/链接弹层换B不能写B，正常编辑仍保存。 |
| W2-18-PAGES-ACTIONS / P2 必修 | AI actions候选走slash专用replace，无slashSession便无事务，关闭候选却未插task_list，也没执行insert_after | 使用已验证frozen范围按声明mode插任务列表。W2-18-PAGES-ACTIONS-01：真实普通选区候选插后保留原文、精确unchecked任务进SQL；范围变化拒绝、同次提交不重复。 |
| W2-18-PAGES-READONLY / P1 | 不支持正文显示emptyDoc只禁输入，Back/import/publish/extract仍无条件save占位稿，CAS合法覆盖原JSON | unshowable占位永远不是可保存草稿，离开保留原record，操作按真实支持明确拒绝/使用原文。W2-18-PAGES-READONLY-01：真实未知正文进入后Back/import/发布/抽取均不覆盖原body/version；合法外部替换/undo可重开编辑。不可把未知schema当支持。 |
| W2-18-PAGES-SOURCES / P2 必修 | 多Pages合成既有1500字符的节选被丢truncated标记，成果称完整材料且把pages:id写成无效Inbox返回 | 现有provenance保留节选/对象/版本，输出真实来源返回链接或省无效Inbox链接，不扩采集量。W2-18-PAGES-SOURCES-01：两页1500字后有独特内容，经真实prepare/generate固定采用前缀、明确节选、可回原Page；原SQL不变，同请求只创建一次。 |
| W2-18-GITHUB-PAGES / P2 必修 | GitHub通知固定第一页50，未读占前页后尾页永不进入Feed，却提交首响应Last-Modified | 固定API origin的有界分页与完整cursor，不携凭据跟任意Link。W2-18-GITHUB-PAGES-01：51+ literal通知经真实Connector/Listener/Signals/Feed全入一次；重复/304/次页失败/限流不越过未完成页，GET-only及凭据边界保留。 |
| W2-18-TODO-DATE / P2 必修 | 候选日期按原文换算，existing.changes/protected却采信模型日期；只有日期时还保留模型时间 | 同一确定reading决定新旧项日期/时间，歧义只建议，手改字段仍需显式采纳。W2-18-TODO-DATE-01：真实extract→看提案→apply的冲突字面量，候选/原项/history一致，无时间不补时刻，模糊日期不确定写入。 |
| W2-18-TODO-DRAFT / P1 | flush吞POST失败或空标题，导航/后续动作当成功继续，fillEditor覆盖尚未保存输入 | 保存失败/无效传给离开与后续动作，保留稿，明确丢弃才清。W2-18-TODO-DRAFT-01：真实409/500/断网/空标题后返回/换项/关联/搜索/换归属均不丢稿、不派后续写；恢复保存与明确丢弃可行。 |
| W2-18-CATALOG-ERROR / P1 | Catalog把200业务错误原话当action/message，经Connector/Listener持久回执与Feed公开日志传播，可能含上游回显凭据 | Provider边界封闭原因/恢复动作，不持久服务原话，不依赖宽松secret正则。W2-18-CATALOG-ERROR-01：每类literal业务错带非真实fixture token，经正式失败链响应/回执/DB/日志/Inbox均无该值及派出编码；限流/重新授权原因仍准确，S-12同步。 |
| W2-18-DIFF-FILE / P2 必修 | Diff渲染show-file按钮但无生产点击消费者，正式state有change_index仍只能看0；同path也不唯一 | 现行surface绑定原始索引，沿固定input/请求lifetime，不能改成果或工作树。W2-18-DIFF-FILE-01：真实Coding固定多文件含同路径两写，逐个点击/刷新/隐藏重开呈现对应literal前后文，旧响应不覆盖新选择。 |
| W2-18-ASSET-JS / P1 必修（新main差异） | `fc18d5f62`的`served-page-text.ts`用未重扫模板尾的TS scanner删行首空白，插值后的多行模板正文被改；前置strip还把含换行的块注释改空格，改变return的自动分号语义。新web-assets将转换扩大到所有插件JS。协调方内存执行实际模块复现：`head ${1}`后两空格消失；return后含换行的块注释使结果由undefined变1 | 用现有成熟JS转换器直接处理原程序，失败时保留原文语义，移除有损预处理，不放宽资产预算。W2-18-ASSET-JS-01：多行插值/嵌套模板、正则与注释换行经正式资源HTTP后的执行结果逐项等于原程序独立期望；W2-18-ASSET-JS-02：原locale/ETag/HEAD缓存及实际资产字节门禁保持，非法fixture改有效程序仍核同一缓存约束。仅最小执行探针已复现，修复/工程/浏览器未运行；由原writer随最新main整合。 |
| W2-18-MODEL-SWITCH / P1 必修（新main差异） | 换模型等待配置、凭据与SDK校验后，SDK直接写内存`pendingSwitch`；I7的storage尾检覆盖不到这个接受点，外层返回后拒绝也已太迟 | 在实际接受点核原调用取消、授权与替换状态，等待失败不改变当前/待切换模型，拒绝后展示仍须对应此前独立接受的目标，不能清空其他请求已排队的模型。W2-18-MODEL-SWITCH-01：真实锁定SDK分别在配置、凭据和SDK校验等待中取消、撤权或替换调用，放行后没有换模或迟到状态；W2-18-MODEL-SWITCH-02：正常切换只影响后续模型边界，原历史、预算和冻结设置约束保留。G5源码发现、协调方核实实际SDK接受点；尚未执行交错。 |
| W2-18-HANDBACK-CURRENT / P1 必修（新main差异） | 子任务自动回交只在等待前检查父工作，dispatch未传既有stillCurrent；所有子任务结束后，父工作在authority/材料准备期间归档仍可启动新轮次 | 复用原dispatch的当前状态检查并覆盖最终接受点，归档/停止或新轮次使旧回交失效；已接受后台轮次沿现有生命周期。W2-18-HANDBACK-CURRENT-01：真实回交在authority和材料屏障期间归档/停止父工作，放行后无新增Run、轮次或已回交标记；W2-18-HANDBACK-CURRENT-02：正常完成子任务只自动接续一次，明确恢复后仍可消费未交回结果，已有幂等与手动接续不回归。`89af5b5f2`已接入当前状态及同步接受检查；归档交错、未消费标记与恢复接续用例正在补齐，停止/新轮次及运行结果仍待验。 |
| W2-18-CODING-CONTROL-VERSION / 必修合同缺口（新main差异） | `coding.runs.control`新增switch-model输入但version仍为1，动作快照同版本输入hash由`4dd83c4a83fc`变`78d0a95586bb`，固定引用被静默改形状 | 按现行CONTRACT-CHANGES升动作版本，同改现行路由、固定引用、测试与快照，不加旧版读取兜底。W2-18-CODING-CONTROL-VERSION-01：正常控制和换模走现行版本，固定旧版明确拒绝；W2-18-CODING-CONTROL-VERSION-02：构建后动作快照与实际发现一致，调用方与MCP影响记录。`89af5b5f2`已将控制动作升至v2并加入旧版拒绝断言；快照和运行尚待。 |

| W1-18-PIN-CURRENT / P2 必修 | nextPinnedVersion在无pending、head=recorded+1且source_revision=null时复用“快照前”的旧版；当前四文档先存pending再固定，正常中断不产生此形状 | 删除这条历史特判及旧说明，已有head后正常递增；保留真实pending恢复、移动/复制/不同actor各项目版本线。W1-18-PIN-CURRENT-01：四owner真实固定中断/pending恢复与移动后编号仍正确；无pending的null head不当作旧发布恢复，不覆盖旧成果。由G6与同文件pinActionSubject父控制串行处理，G7不改promote协议。 |

2026-10-23，W2-18-HOME-LOCALE-01 接续修复（[原失败](https://github.com/molis-ai/molis-work/pull/1127#issuecomment-6380003167)，Codex 修复 1）：固定 main `89c9a71947f483cd429405574df7b2b916b36b8d` 复现设置不打开；进一步验证独立 Home 没有工作台设置面，`open-settings-path` 无接收者，设置请求为零。独立 Home 的既有设置宿主补收同一 document 事件，复用 `home-model-settings → molisWorkRequest` 的加载、Retry、关闭与草稿保留；工作台仍走 `settings-directory`，不恢复隔离页面导航、不把 Home 重做成工作台。只接受同源 `/settings/models`、`/settings/connectors`、`/capabilities/connections`；无效 detail、外域和其他路径均无请求、无打开、无导航。范围是 Home 设置脚本、现有事件登记与 S-47 文档、本条验收，以及 `tests/issue-home-locale.e2e.test.ts`、安全 CI 已执行的 `tests/security-invariants-plugin-pages.e2e.test.ts`；实际请求记录须证明失败后 Retry 取得真实 Host 的 200，原草稿/存储结果不变。定向命令为 `node scripts/run-tests.mjs tests/issue-home-locale.e2e.test.ts tests/security-invariants-plugin-pages.e2e.test.ts tests/settings-requests-through-helper.test.ts`，其余按包要求与实际 affected 结果选择；全量交统筹安排。真实 Home 和模型账户不在本片范围。

Gmail 增量判断也与 [Gmail 官方 history.list 合同](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list) 对照：历史按 ID 递增，startHistoryId 排除以前的记录，单条历史可包含多封邮件。因此“最后一页已读”不能替代“候选已消费”。本轮不实际读取外部账户。

Catalog 目标形状于2026-10-12联网核对官方资料：[Jira 3LO](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) 与 [Confluence 3LO](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/) 明确经 api.atlassian.com 的服务/cloudid前缀；[Confluence Users](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-users/) 使用 wiki/rest/api 用户路径；[Salesforce REST Reference](https://developer.salesforce.com/docs/platform/api-rest/guide/resources-list.html) 给出 MyDomainName.my.salesforce.com 根地址。当前Host构造和Catalog接受形状与这些路径一致；这是文档/源码对照，不是真实账号或网络拒绝测试，也未扩支持到Salesforce自定义域或Experience Cloud路径。

以上保留各问题初次登记的根因与验收合同；现行修复、已运行结果与剩余缺口以§12.11为准，不将初始“待运行”或后来的局部通过外推到整批。新客户端修复先准备可复现用例与最小改动，机器时段由原防腐会话统筹；每包 README 必跑项、整体构建和最终整合检查仍保留。助理客户端与 #471 都触及 `assistant-island.ts`，按枢纽规则只改本问题范围，在最终组合头检查两边改动，不能覆盖 Computer Use 的工作。

§12.8 的修复现按九组原审查会话接续，外加既有 Dataset、Issue、助理发送和 Workflows 保存四个独立 writer；文件重叠已逐项分开。共同 AUTH/MCP 配置仍由原防腐会话负责，所有机器验证时段仍由其统筹。具体责任、已交本地候选提交与验证状态见 §12.11，不把代码准备等同验收。

### 12.9 已完成源码审查的逐包结论（持续归回，整改另计）

本节按实际审查批次保留证据；原冻结批次累计71包源码已审，整改及实操另计。2026-10-13 main合入`fc18d5f62`（#472 Prologue接入），相对`2cb35d4e8`新增93文件差异，涉及Local Host、Workbench、AgentHost、contracts、design-system、Coding、Lingguang七包；这七包增量已补读，§5.1恢复71包已审；只读这批新增/变化的生产实现、必要消费者及回归，没有重做无变更包。G5按固定合并头`6972b1cb0`、随后`808f0856c`复核AI/助理/Coding/合同及Workbench Follow、Review、模型控制，确认既有AUTH/Memory控制、SDK启动作用域与接受后脱离前台、Documents双资源回收、Assistant错误分类/Follow CAS、Coding生命周期及等待退避保留；协调方核实际合并冲突diff、拆分、资源转换、Lingguang流式进展/版本控制、模型设置与样式消费者。ASSET-JS、MODEL-SWITCH、HANDBACK-CURRENT和CODING-CONTROL-VERSION见§12.8；还发现Memory控制类型只转出未导入的编译缺口，已交writer修复。审读结论不代表上述问题已通过回归，整合与运行仍由原会话唯一writer承接。首批 G3/G4 合计 13 个包的跟踪清单经协调方与冻结切点 `git ls-files` 对照，无漏项、重复或未披露可执行文件。G4 全部 191 文件（生产 170 文件/27,820 行）已逐段读；G3 180 文件含 26 个静态资源：CSS 全文件结构、装配/插值、公共令牌、focus/hidden/主题/响应式/减少动态与消费者已审，未逐行评价每个历史选择器；图片/字体核格式、引用及许可，不声称视觉/字形全验。此口径用于代码审查，视觉、原生与用户体验仍需实际证据。生产入口、失败/恢复与测试断言已随各包核对；未出现新问题的包也不是“所有场景已通过”。

| 已审包 / 覆盖 | 职责、依赖与实际消费者判断 | 变化原因、放置与冗余裁决 | 验证及整改边界 |
| --- | --- | --- | --- |
| `packages/contracts` / 91 文件 | 跨层词汇、类型、动作 schema 与纯协议；由 Kernel/Runtime/SDK/Host/MCP/插件消费，不持业务事实 | 合同因协议与共同输入边界变化；现位置成立。部分运行 helper 仍须沿既有 SDK 清理；null source_revision 的 pre-snapshot pin 恢复无当前四 writer 来源，不能当正常中断保留 | 共同合同/固定 pin/move 测试有真实断言；历史 pin 分支待 owner 清理并保留真实 pending 恢复，RAC-12 未关闭 |
| `packages/kernel` / 11 文件 | 唯一注册、场景、调用/授权与纯情境策略；业务由 owner，材料不是授权 | 按注册与执行合同变化，不因插件动作另分支；保留已接受纯策略位置 | 当前动作/场景/CAS/撤销断言有效；精确 AUTH 与 SDK beforeWrite 仍原 writer，在整合头验证 |
| `packages/plugin-runtime` / 33 文件 | 安装事实、Supervisor、端口 Wiring、持久事件与私有 KV；真正隔离交 Sandbox | 生命周期/连线/事件合同各有实际 Host 与插件消费者，未发现应另建一套的理由 | 固定输入 §12.8 必修；升级/revoke 单独 API 时序候选不越过正式 stop 补偿报生产 P1。真实 SQLite、CAS、崩溃重开证据不覆盖 fixed SDK read |
| `packages/plugin-sdk` / 17 文件 | 作者只装 SDK/contracts；平台与作者共用 Manifest/声明/lifetime/文本工具，未引入私有依赖 | helper 因共同协议变化，避免作者/Host 两套验证；当前位置成立 | SemVer 必修；routes 原控制沿 AUTH。packed 双包/真实 CLI seam 有证据；导出扫描仅支持 API 可用 |
| `packages/storage` / 16 文件 | 技术 SQLite、加密内容/secret、原子文件、索引和 Memory 账本；不决定 Goal/建议业务 | 保留技术端口，业务事实由 owner；索引可重建是现行机制 | 缺 key 与 BEGIN 恢复两项必修；现有冷开/Keychain fake/rollback 测试不覆盖它们，不操作真实密钥 |
| `packages/plugin-sandbox` / 11 文件 | macOS Seatbelt、资源/IPC/Host代理、声明效果与 grant 交集；生成插件 Host 消费 | 不可信代码隔离是真实边界，其他平台 fail closed；严格 HTTPS 公共适配器与生成插件 Host 网络不可混称 | I6 19 项 real Seatbelt、6 项模拟 DNS/TLS 通过、live 网络跳过；POST unknown 候选尚无产品消费者证据，不升生产 P1 |
| `tooling/plugin-cli` / 12 文件 | scaffold/validate/显式打包/签名/验证与开发请求；不拥有生产安装或运行模型 | 保留作者工具；不执行 lifecycle script，不等于拒绝含 scripts 的包，README 应对齐 | 隔离 built CLI/双公共包/临时签名/Host seam 有证据，第三方分发安装仍在后续，不算可发布 |
| `apps/desktop` / 58 文件 | Panel/launch recipe/native shell 与启动器；业务经 owner 和常驻 Host，工作终端实际走 Host PTY | 平台桌面适配位置成立；原生注册 PTY 未找到当前 JS 消费者，需按保留用途裁决，不以内部测试证明在用 | 胶囊/剪贴板/主线程 IO 必修。HTTP Panel/PTY 既有测试不替原生 IPC 拒绝、打包和快捷键实操；原生未验 |
| `packages/design-system` / 56 文件 | tokens/字体/HTML原语/受限生成界面 renderer；Workbench 和插件消费，执行仍经 Host/Runtime | 共享呈现位置成立；历史 CSS cascade 活着，沿既有 W5/字节预算按真实样式收口，不为拆文件而搬移 | 新草稿被清空必修；控件板换月样例后续。select/composition 实浏览器证局部控件，内存样例不证插件持久/模型质量 |
| `apps/server` / 8 文件 | 私有跨设备启动/管理与 gateway/restore，沿正式 Host 动作与 owner | 按用户既有决定保留明确用途；不随正式根入口交付，不另造 grant/Agent | launcher/gateway/restore 隔离真实 Host 有局部证据；新设备/LAN/TLS/备份完整实操未验，无新增必要代码缺陷 |
| `server` / 26 文件 | device/member/配对/项目访问/IM/传输回执；Goal/Artifact 经公开 owner | 业务模块位置成立，不持第二份 Goal 事实；旧 SSOT 直 SQL 描述需按实际公开管理函数纠正 | 隔离 HTTP/domain/幂等/撤权有证据；QA 工具必修，撤权后 command error receipt 的类别待合同裁决；完整手机未验 |
| `packages/im-ui` / 15 文件 | 讨论 DTO/呈现/transport/history/read/draft；身份与权限由 server | UI 位置成立，未复制业务状态；不把未接受的附件/AI 等扩功能当缺陷 | target/epoch/草稿与真实域/HTTP已核；factory 用例不能替完整 controller/触控/软键盘/辅助技术，无新增必修项 |
| `packages/test-kit` / 17 文件 | dev-only 边界扫描、Chrome/CDP、授权 HTTP 测试工具；不代替真实授权 | 无生产消费者，dev dependency 正确；扫描只保证可读静态 import，不声称完整 JS 语义 | 驱动 fake 验合同，真实 test-home/消费者验用户路径，二者分开；无新增必要修复项 |

G4 已完整核 20 个相关测试文件与真实 crash fixture；G3 按风险核 domain/HTTP/launcher/IPC/bootstrap/renderer/select/driver，范围外长测试只计实际片段。协调方核实新增缺陷的实际生产位置并复核覆盖清单。既有 I6 原日志仅按已出逐案结果复用；本节未新启动任何测试，不能把表内审读写成运行通过。13 包“已审”不关闭 §12.8、W1/W2/W3/W5 或整条防腐线。


**G8 六包补齐。** 266 跟踪文件经协调方再次与 Git 对照（258 完整读取、8 样式/词典按静态资源口径审查），无漏项/重复；共 32,308 行，不将静态口径写成完整视觉/逐译文验收。相应根测试核了实际断言，包内测试/fixture 全读；新故障没有运行。该批累计 19/71 包源码审查完成，当时52包仍待审；修复与最终组合证据未关闭。

| 已审包 / 覆盖 | 职责、实际消费者、变化与放置裁决 | 验证及整改边界 |
| --- | --- | --- |
| `plugins/native/workflows` / 20 文件 | 拥有项目流程定义、编排、attempt/receipt 与交接计算；站点内容归插件，经 provider/version 固定动作消费，Host 管授权/模型；现由 Plugin Runtime 装配 | CAS/幂等接收/unknown/重试现有断言有效；保存串写、搜索打开、按 §12.10 停止当前步骤待修，真实模型质量另验 |
| `plugins/native/alchemist` / 135 文件 | 单一 Studio 拥有 Direction/Idea 版本、研究证据/报告、Taste/Playbook 与 job/checkpoint；Host 仅装配 AI、搜索/关闭 | 后台 lease/事务/重开有有效证据；前台 effect、client lifecycle/搜索待修。固定成果 reuse 为已披露未接线，纠正入口不冒充全链已实现 |
| `plugins/native/work` / 48 文件 | 组织 Session 发现/内容/交接、工作区/终端；私有加密事实归 private-work-context，原生传输归 runtime-host | read/resume 快照、unknown、回执事务有效；等待后控制缺失必修，真实送达回执例外按用户 §12.10。原生 transport fixture 不等用户实际 Codex 会话 |
| `plugins/native/issues` / 16 文件 | Home 内 Issue 自有 schema/命令/原文/版本/capture 草稿，Runtime 管身份安装与授权；不是 Goal/项目或 Host 特例 | 真 Home/HTTP/stdio MCP、CAS/撤销有证据；手工页重复仍由原 writer 修；模型分类/IME/跨 App 实操未验，无重复新缺陷 |
| `plugins/native/shelf` / 24 文件 | 插件管呈现/入库/recipe映射；Home 字节/clipboard/jobs/settings 归 Module；项目材料是固定 process item，经 SDK 和 KV CAS | 真实完整字节/固定版本/权限有证据；clipboard搜索、缓存、listener 生命周期必修。Agent start 参数只证明材料传入，不代表模型实际消费 |
| `plugins/native/artifacts` / 23 文件 | 浏览/导入导出/SDK适配；固定版本/过程事实归 Module，owner/project/install来自上下文 | post-wait import、固定读、grant/type/producer与旧SDK拒绝有效；本包无新增独立缺陷；Goal input/Diff 组合仍须修核心固定读并实操 |

**G1/G2/G6 补齐。** 协调方与冻结 Git 清单逐项核对：G1 为 439 文件（431 代码/配置/脚本等完整读取，8 文档/许可证按适用范围核）；G2 为 231 文件（149 完整读取，82 静态样式/词典/SVG按已披露规则审查，不算像素或逐译文验收）；G6 为 355 文件，含 276 src / 36,939 行与 37 份规划方法。三组无漏项或重复。G6 曾报 455 是清点笔误，已核实际清单纠正，不沿用错误数字。以下加 19 包，该批源码审查累计 38/71；当时剩余33包结论仍在核实，所有整改/组合实操独立计。

| 已审包 / 跟踪文件 | 职责、实际消费者、变化与放置裁决 | 验证及整改边界 |
| --- | --- | --- |
| `apps/local-host` / 412 | 常驻Host、可信安装/动作装配、HTTP/文件/模型/连接适配；Desktop/CLI/MCP/工作台消费。IO适配成立，插件与业务事实留owner；旧native桥/typed/长类沿原路线 | 新增接入回滚、卡unknown、Git目标/正文等§12.8必修；共同AUTH仍原writer。无真实安装/模型/账号验收 |
| `apps/cli` / 7 | 薄命令协议、参数/退出码/JSON，组合根注入Host业务，不持项目库或模型 | 无独立新增缺陷；Host接入问题影响CLI，当前未新跑真实安装 |
| `apps/mcp` / 20 | JSON-RPC/stdio/工具schema与受众适配，动作来自共同目录；身份/权限/事实由Host | MCP配置fail-closed必修在Host；EOF取消/早拒日志仅候选，不能称全部进程路径通过 |
| `apps/workbench` / 222 | Shell/项目到达/导航/标签分屏/设置/助理与内容挂载；原生插件仍沿冻结装配，业务事实不在Shell另存 | 三P1与十P2见§12.8；历史CSS/集中词典/字符串程序债仍按W5，不因静态审查宣称视觉/读屏/键盘通过 |
| `packages/ui-host` / 9 | slot/format/contribution、共享请求与mount生命周期，真实插件与Workbench消费；不解释业务 | 无独立新增必修核心缺陷；README协议相对同源措辞待对齐。正确核心不证明消费者使用正确 |
| `modules/projects` / 10 | Catalog项目身份/workspace关系/生命周期及删除步骤；Host经公开函数消费，不接管Session事实 | 保留，唯一目录不应自动绑定问题归Private Work Context；删除重试与真实Home实操另计 |
| `modules/context-ledger` / 7 | 跨owner精确引用、边与历史，正文临时由owner materialize；Feed为当前消费者 | 保留；opaque revision去重候选当前数字版本不触发，仅后续，不增机制 |
| `modules/sources` / 4 | 来源身份/开关/范围/schedule intent/connection_ref；游标由Listener，凭据由Connector | 保留，来源隔离和接入现有断言有效；外部账号本轮未验 |
| `modules/signals` / 4 | 接受规范事件/去重/内容修订和来源；Signal及事件同事务，Feed另管消费 | 保留；实际接入重放/失败恢复/部分成功有断言，不替新Gmail遗漏回归 |
| `modules/feed` / 5 | Feed Item保存/已读/处置/材料事实，Attention与Ledger经合同、事务消费 | 保留；独立Attention事务缺口由其owner修，不能把Feed外层事务通过扩到所有入口 |
| `modules/attention-resumption` / 4 | Inbox引用/原因/状态唯一owner，经注入读存在性，不跨读Feed/Goal实现 | 独立create/delete事务必修；正式Feed手动加入/Goals reconcile为实际触发 |
| `modules/goals` / 82 | Goal约定/要求/事件/Concern/完成/关系/Guidance与规划目录，Governance给可信决定；无第二执行协议 | 保留后端证据拒绝，UI补消费；回收站关系还原沿原writer。旧Catalog空读分支核后删除，规划内容非自动门禁 |
| `modules/private-work-context` / 25 | 私人Session/加密正文引用、项目/Goal/workspace关系和Handoff，原生handle归Runtime | 新Session必须确认，目录只建议；已确认恢复保留。租约恢复边界不得冒称新增事故 |
| `modules/artifacts` / 10 | 固定成果/过程项身份版本、来源/引用与状态，正文owner在插件，Host核声明/可信身份 | 保留不可变版本；Goal委托/丢回执重试修调用链，不改成可覆盖旧版本 |
| `modules/shelf` / 14 | 个人材料副本/clipboard/提取作业与结果；AI端口由Host，原文件只读 | 删除旧目录补齐必修；现行API单项输入保留，完整文件提取/原生与模型证据另计 |
| `modules/characters` / 7 | 个人角色草稿/CAS/发布引用，固定正文归Artifacts，Host通过公开open入口 | 已有v0库拒绝必修；正常首次空库创建保留，不操作真实角色库 |
| `modules/functions` / 14 | 判断规则/已发布配置/样本/判断历史及动作；原生TypeSafe由Host注入，规则不直接执行业务 | Choice边界必修；已发布配置不可变与可试跑/管理样本不混淆，不凭未知原语语义扩验证 |
| `modules/governance-collaboration` / 15 | 提案/决定/事件出处与幂等，Goal通过同库事务回调物化自己的事实 | 保留；真实拒绝/整组回滚断言有效，共用journal/idempotency既有债不重复报 |
| `plugins/native/goals` / 154 | Goals动作/HTTP/界面及结构提案编排；事实由Module，界面挂现有工作台位置 | 证据表单、pin授权/重试、规划迟到、旧policy入口必修；浏览器正常串行/字符串断言不能证明新交错 |

三组审查均读取必要测试与实际消费者，未新增运行。仅报告过的候选保持候选：Workbench跨窗格停用、范围切换、ResizeObserver；Host stdio EOF/早拒日志；Context Ledger非数字revision。源码已审不能关闭这些验证缺口，也不把已声明partial的外部接入/设备能力记完整。

**G5/G7/G9 补齐，71 包源码审查完成。** 三组覆盖分别为 179 跟踪文件（144 src / 28,948 行）、169 包内文件 / 26,782 行、267 文件 / 28,971 行；协调方逐项与冻结 Git 清单对照，无遗漏/重复。G7 另读的包外消费者/测试仅计实际片段，不混入169分母。各报告的主要根因已按实际生产实现复核，相关断言能力和未验证项仍分开。至此 §5.1 的71行均可记源码“已审”；§12.8 的修复、组合路径和最终实操仍未完成，不能标整条防腐线完成。

| 已审包 / 跟踪文件 | 职责、实际消费者、变化与放置裁决 | 验证及整改边界 |
| --- | --- | --- |
| `horizontal/agent-host` / 36 | 唯一SDK依赖，装配同Home Prologue执行/工具/审批/恢复/用量/步骤图与等待；Coding/助理/Builder消费，领域意图留调用者 | 显式budget与临时parse资源必修；适配位置合理，无新第二模型引擎。真实SDK协议证据不替模型质量 |
| `horizontal/connector-host` / 6 | driver/connection/health/技术回执与凭据引用owner，服务协议由Integration，来源与Signal由各Module | 无新增确定阻塞；目的origin/超时/断连隔离有有效断言，外部商业账号未验 |
| `horizontal/listener-host` / 4 | lease/cursor/delivery/feed_source_runs，Signal接受后才推游标；Host管timer，Source管意图 | 单进程生产source排他排除原lease疑点；公共API异lease同operation重入仍缺证据，Catalog原话泄漏在provider边界修 |
| `horizontal/runtime-host` / 8 | Runtime技术能力/PTY/Codex回执；Session关系/消息意图归Work/Private Work Context | PTY与受控协议有有效证据；stdin异步EPIPE已由真实隔离子进程复现，按§12.8修复。无existingThreadId的分支无现行Handoff消费者，不报生产重复创建 |
| `horizontal/scheduler` / 4 | durable job/lease/token/一次唤醒与回执，可信owner来自调用；产品任务与timer由Schedule/Host | 实际SQL租约/竞争/旧完成拒绝有证据；不替无页面启动，沿原Schedule缺陷 |
| `horizontal/memory` / 13 | 平台写门/使用范围/召回/候选/信号/撤销，正文版本归Prologue，Host注backend/ledger | 按用户决定保留平台产品服务；晚写和旧候选迁入必修，原话门/正常历史保留 |
| `horizontal/search` / 4 | 目录entries/reader与可重建索引，按caller筛选，内容归owner | 平台产品服务位置成立；stale/partial/撤权/删除裁决有证据，无新增确定阻塞；规模和实际响应体验未测 |
| `horizontal/placement` / 4 | 跨插件位置/来源关系归Ledger，移动/复制走owner，Goal绑定归Goals | 跨本人个人/项目为获批行为，原调用生命线必修；重启失败仍按I6归因，不能报通过 |
| `plugins/native/coding` / 61 | Session意图/配置/计划/报告/变更/委派/评价；Agent Host/SDK拥有执行/步骤图/信/等待；跨插件走合同 | 七项本组必要整改及effect/wake见§12.8；不存在新执行引擎，真实模型/全部交互未验，README按实现与实测分开纠正 |
| `plugins/native/plugin-builder` / 23 | brief/设计/parts/connected/checks/release意图；Agent Host运行模型，Host检查隔离，Runtime安装 | 旧job晚写/升级密钥必修；ready不能代替外部服务实用，获批kept-data/升级机制保留 |
| `plugins/native/characters` / 16 | 角色管理与发布操作，私人草稿归Module、固定正文归Artifacts；原生CLI由Host | 启动等待与HTTP控制必修，角色不可扩权；当前浏览器动作选择用例失败，原生加载/实际执行另证 |
| `plugins/native/pages` / 52 | 项目文档/目录/材料生成租约/导入回执/抽取撤销/固定发布意图；编辑器、导出、模型候选各有真实变化原因 | 只读占位、旧create/extract、瞬态编辑、导出、候选插入与节选来源必修；不机械重写长编辑器或扩采集量 |
| `plugins/native/form` / 21 | 问卷/答卷及题目快照/导入回执/固定发布；导出HTML是离线收集，不是公网匿名平台 | 答案容量/label及转Dataset拒绝收口；完整导出填写→导入需实操，不能以结构串验收 |
| `plugins/native/dataset` / 20 | 列/行/快照/CSV接收及发布意图；40列/2000行/80字列名现行合同 | Store CSV越输出schema必修，客户端错表由独立writer，双方边界分开；不扩合同或裁原数据 |
| `plugins/native/ppt` / 22 | 文本/要点/备注/主题/版本与发布，Pages材料走公开动作 | 源读取后effect、生成迟到、title-only必修；既有演示/打印/OOXML不代表完整图表编辑，Office实开未验 |
| `plugins/native/images` / 17 | job/asset字节与元数据/runner及重启清理，凭据/连接归Host | 接受job独立生命周期正确；历史对象与账号设置modal必修，导航不取消job；真实厂商/费用/成图质量未验 |
| `plugins/native/cognia` / 19 | Home材料/来源/修订/导入预览/知识草稿及固定引用，Host受限目录IO | V1链存在，V2仍另案；目录嵌套授权和关闭后旧情境必修，不能据V2期待删除现行V1 |
| `plugins/native/lingguang` / 18 | 项目灵光/对话/消息/软丢弃与幂等回执，模型前后复查和整轮事务 | Owner CAS成立，客户端错误推进ack版本必修；嵌套内容动作原控制同组一起核，不新造授权表 |
| `plugins/native/feed` / 49 | 应用编排/UI，Source/Listener/Signal/Attention各持自己的事实；共同接入与判断链 | Gmail/GitHub/Catalog及原后台调度影响真实路径；坏规则读取仅后续，未发现新事实owner错放 |
| `plugins/native/inbox` / 15 | Attention引用/判断场景/Pages收集的消费面，建议与实际执行分开 | 无独立新增P1；中断自动判断重放仍声明partial，真实模型未验 |
| `plugins/native/todo` / 26 | Home事实、正式动作、来源和本人采用提案/历史 | 保存失败丢稿与原文日期不一致必修；提案显示/采用/历史必须同一事实，不改用户手改保护 |
| `plugins/native/schedule` / 27 | 任务/提醒/操作意图，经Scheduler接受与恢复，unknown不自动派 | 真实租约/重开/失败原子性有证据；无页面自动调度沿原writer，模型/外部动作另验 |
| `plugins/native/files` / 20 | Workspace读取、固定快照/位置；Runtime提供正式动作，不持第二文件事实 | 保留正式读取；纯preview helper无生产消费者只作后续，不能算实际路径 |
| `plugins/native/diff` / 13 | 只比较固定版本的多文件/文本，不读实时工作树、不执行改动 | 固定input核心与索引点击两个断点分别修；原始索引不能用路径去重替代 |
| `plugins/native/git` / 19 | 状态投影与正式Host进程/审批/固定过程结果 | Host目标/正文审批两P1由G1修；公开draft/acceptance helper无生产消费者列后续，不把原型测试报成上线 |
| `plugins/native/text-stats` / 9 | 有界纯计数/固定输入，无新增IO或事实副本 | 无新增必要缺陷；空文本合法，未读与不可用区别保留；实际全站体验未验 |
| `plugins/native/jelly` / 30 | Home单份工作区、命令/undo/redo、任务关系/重复实例/计划采用；材料读取已归灵光 | 无新独立必修P1；显式旧Swift导入保原文是获批导入，不是正常读兼容；真实转写/模型另验 |
| `plugins/official-integrations/catalog` / 13 | 39类协议适配/文档读取，被Host真实使用；连接事实在Connector | 目标HTTPS官方域与封闭业务错误P1必修；不操作真实凭据/外部写 |
| `plugins/official-integrations/github` / 9 | DeviceFlow/GET provider/研究库与Integration driver的正式消费者 | 分页必修，完整游标与固定origin一起验证；不把两条fixture当分页证据 |
| `plugins/official-integrations/gmail` / 16 | PKCE/每账号app/ref/刷新/只读provider，增量与初始快照区分 | 增量尾部遗漏必修，初始25快照保留；新API OAuth首次使用接线由G1修，真实邮箱未读 |
| `plugins/official-integrations/rss` / 10 | Source/helpers/SEL生产transport，Integration工厂未接是明示partial | 公网DNS预检未固定实际socket已由生产fetch与隔离真实TCP/TLS接触复现，按§12.8修复；未读取私网HTTP正文，代理既有例外不扩大 |
| `plugins/official-integrations/web-query` / 5 | 注入式Integration工厂未有生产调用，实际搜索为Host SEL/AnySearch | README边界准确，不假称Runtime迁移完成或删除实际网页搜索 |
| `plugins/official-integrations/youtube` / 6 | UC/channel URL/RSS helpers被Source使用，Integration工厂无生产调用 | 保留真实helper用途，未验真实频道端到端，不把工厂存在记安装/运行成熟 |

两项候选已在冻结I7的生产构建上实证：原队列运行runtime-stdin-proof-01.log，真实子进程关fd0后owner因未处理EPIPE退出1；rss-rebinding-proof-01.log显示policyLookups=1、socketLookups=1、acceptedPrivateSockets=1及1610字节TLS ClientHello。两份脚本返回0表示确认缺陷，不是回归通过；没有实际Codex、外部账号、私网HTTP正文或真实Home写入。协调方已核原脚本、实际命令与完整日志；Runtime两文件修复91a40bd6f已冻结并核实际diff，沿现有failProtocolLine收敛stdin error，回归准备真实owner/断管/显式新请求/旧child退出/close，尚未运行。RSS最小固定连接修复实施中。两项均按§12.8收口，未验收。固定pin无现行writer的null旧分支和Characters/Builder旧markup仍按current-only原清理范围串行归owner，不用正常中断恢复作删据；既有pure helper无消费者按原冗余路线处理，不在本轮假造新产品需求。源审完成不能降低修复与组合实操标准。

### 12.10 用户明确的停止与回执合同（2026-10-12 本轮答复）

用户选择：**工作流取消当前尚未提交的本地步骤；已经发生的外部结果保留并显示状态。** stop 必须使当前实例的在途派发控制失效，传至下游最终 beforeEffect，不能仅改外层状态再让本地插件写入；已经真实发生的外部结果不回滚、不自动重派，按原请求可追踪并明确成功/结果未知。W2-18-WF-STOP-01：正式流程 action-step 调 Form/Pages 等本地动作，模型 barrier 中 stop，放行后目标无迟到正文/题目、无后续站点，实例保持停止。W2-18-WF-STOP-02：外部已接受后才 stop，保留真实结果或未知状态，重开/重试不重复派出，也不把“未收到回包”说成“没有发生”。WFSAVE 与本合同为两个独立根因，不互相代替验收。

用户同时选择：**Work 保存真实送达回执，避免恢复后重复发送；不向无权调用者返回内容。** 这是对通用撤权后禁写的明确、窄例外：仅收敛已经派出且已占用原幂等请求的实际外部事实/原会话对应回执，不允许新业务请求、伪造失败回复、继续交接或返回受保护正文。W2-18-WORK-RECEIPT-01：Runtime 已接受消息后撤权、返回真实 turn id，原请求/对应回执持久一次，调用者被拒，恢复不重发；W2-18-WORK-RECEIPT-02：派出前撤权零调用，未知结果保持未知，撤权后不能以记回执为名派发下一步。Server transport command 的错误回执不能自动套用此例外，须另按实际事实/回执合同核查。

### 12.11 修复归属与整合队列（71 包源审后的接续）

以下是同一任务的文件责任与当前可证明状态，不是另一套完成清单。各组沿§12.8/§12.10验收；协调方核实际diff与原始运行结果后才逐项关闭。原线程管理整机一个构建/一个浏览器批次，独立树不得抢跑或改冻结I6。新的共享核心先整合再统一全量，不把不同树用例数相加。

| 负责人 | 独占范围与依赖 | 当前证据 |
| --- | --- | --- |
| 原防腐会话 `01a130de-5470-7223-827e-b28663ee7e06` | 共同AUTH/同步最终检查、MCP坏配置、既有Schedule/Goals恢复片、I6失败归因与验证队列；提供可复用本地AUTH提交 | AUTH父子身份及MCP配置、管理入口的I7关键回归已核通过，详见§12.5；其余消费者整合后再跑最终全量。Placement预期已按现行400与错误码/文案修正，重启拒绝状态通过；I6其余浏览器超时仍待基线证据 |
| G1 宿主 | Runtime接入/TOML、卡unknown/followup、model schema、系统目录、Gmail首次使用、native JSON、Host Git；不碰原AUTH文件 | 冻结至 `3a732b697`，各生产/回归diff已核。`23d4d6901` 保留原caller精确reference/permissions并补最终liveness；测试是helper加Kernel最终等待，未构造完整assistantServiceFor。后两提交的Git实际push目标/commit固定、逐文件冲突前置检查与部分效果未知已核；无新源码阻断。已纳入I7整体构建/工程预检与首批实际回归，部分失败及修正见本节末；README全部回归与最终组合仍待 |
| G2 工作台 | 浏览器upload/grant与工作台八项；不碰assistant-island与G9的coding-companions。HOME-LOCALE仅交Workbench helper和同一词典；Host/Issue由协调方串行接线（用户在G2聊天明确选择） | 冻结至 `3f5bae9e3`，全部生产diff、五份新浏览器测试、tabs回归及共用fixture已核，无新源码阻断；末次补充让菜单重绘后迟到stop错误仍可见，并核真实拒绝响应屏障。STOP用真实隔离子进程与Runtime端口，依赖#469共用UiRequest；其余覆盖真实Host与本地网页的迟到结果。已纳入I7整体构建/工程预检；新增浏览器已有局部运行；其通过项、失败及候选修正见本节末，剩余实操与最终组合尚待，不将用例源码当实操通过 |
| G3 桌面/公共呈现 | 原生胶囊/剪贴板/worker IO、接续QA、component草稿 | 冻结 `11928b332`，三片 `631287a69`（原生）、`a5c9ac46e`（接续QA）、`11928b332`（表单草稿）。协调方已读实际生产/测试差异及相关上下文；原片仅rustfmt/diff通过，现已纳入I7；其资源收束补丁保留草稿代次于原Part状态、共用live/operation读取，实际diff已核，d0174744f的build/API/动作/资源/actual-base health/boundary/types通过；测试夹具纠正后a84046f32的SEND/component浏览器10/10通过，其中component五条，详见§12.5。Rust门禁及真实私有Pasteboard两条已通过，保留首轮夹具失败；胶囊/快捷键整App实操仍待，不称全片验收 |
| G4 核心 | SemVer、缺key、Memory事务、固定输入/SDK/Diff Manifest；不改AUTH/helpers或历史pin | 本地四提交 `48c04310e`、`c64bbfd82`、`c93d01249`、`a538a9165` 的生产diff已核，已纳入I7构建及关键回归；固定输入测试缺必需ui由 `05cc4931b` 修正后真实SDK/Diff三条通过，SemVer/密钥/事务亦通过。两组相关30/17文件549/58条已核，局部验收与交接完成，聊天已归档；最终消费者整合与全量仍待原会话完成 |
| G5 AI/开发插件 | Placement/Memory调用控制、Agent预算/解析资源、Characters启动、Builder预览/升级密钥、Coding前台/后台/委派/报告；必要Host对应port | 五片已冻结：Agent `0061cab7d`、Memory/Placement `dabd499da`、Characters `51d368bbc`、Builder `15da93422`、Coding `c3f881668`；57文件生产/测试/六本README增量均已核，工作树干净。前置typed同步端口`bbe6e1531`与五片均已纳入I7，整合核对见本节末。原调用控制到SDK实际storage提交，Run初始持久提交后脱离前台；Session仅清本次未获owner索引的SDK半成品并明示清理失败。真实SDK拒绝/同权限peer/接受后断连与重开、Memory/Placement原handler完成后的零写、Characters正式HTTP拒绝、升级浏览器到真实HTTPS、Coding后台缓存/持久等待/原信委派/固定报告与Shelf原文消费的回归源码已核；全部尚未运行，不记工程或产品通过。BUILD-LATE真实Host stopRunner与S6整链用例已由原writer补入，源码已核而运行仍待；G5原片未改G1文件或vendor，后续MODEL-SWITCH的SDK必要修复由原writer串行承接 |
| G6 Module/Goals | Session确认、Shelf/Character当前库、Attention原子性、Functions Choice、Goals证据/固定/规划/policy | 七提交冻结至 `5a54e3d8d`，生产/回归/README与词典diff均已核；已纳入I7并通过整体构建/合同快照，首批相关回归已运行；Goal pin父停用两条首轮失败，经最终检查顺序修正后14条全部通过，本节末保留两次失败与重跑结果；浏览器和最终组合仍待 |
| G7 内容 | 七插件必要整改；Dataset仅store/动作，client/import与README导入片留既有writer | 生产diff及四份新owner/编辑/便携/情境回归已核；包含实际下载Blob、离线HTML填写再导入、AX树、print iframe、Host prepare与Images本机provider，仍不等于真实模型/Office/读屏。PPT与Lingguang等待已改到真实取消及页面完成。README已核，三提交b5643772a、73af20a60、ecd774a41冻结，独立工作树干净；已纳入I7并通过整体构建，owner回归11条已通过，新增浏览器已有实际通过与失败结果，余下候选修正待重跑，详见本节末。内容嵌套调用复用AUTH，旧pin helper由G6串行处理 |
| G8 流程/执行 | Work/Alchemist effects与客户端、Shelf客户端、Workflows backend stop | 六提交冻结至 `38ef520f8`，生产/回归diff及完整handoff已核；stop落库/取消同同步回调，Form与Alchemist取消均等实际生产处理链结束再读库。新增真实provider注销/重登记拒绝旧调用并验证新调用恢复，以及在途HTTP卸载关闭连接、重挂后旧响应不覆盖。已纳入I7并通过整体构建，Work与Workflow stop的夹具校正后真实回归通过，其他新增浏览器仍待；不碰WFSAVE客户端，遵守§12.10窄回执例外 |
| G9 接入/日常 | Gmail/GitHub/Catalog、Todo与Diff点击；唯一workbench例外为coding-companions，G2不改该文件 | 四提交冻结至 `c260fb76f`，25文件生产/回归/README已核，无新源码阻断。Todo日期事件、在途保存后删除及快捷新建先flush已收束；S1按当前未归类创建合同断言，未宣称自动项目归属。原四片已纳入I7构建及首批回归，Todo日期校正夹具后通过，其余整体与浏览器待验；Catalog Cloud根域/OAuth形状已核官方文档（§12.8）；Git Host归G1。RSS生产fetch的DNS/socket缺陷现已实证，已核最小固定连接方案及显式环境代理拒绝限制（§12.8），原四提交保持冻结，RSS第五提交`dc659dd31`已冻结，六文件生产/README/真实TLS与TCP隔离回归已逐项核；纳入I7后修正解码器类型，整体构建/门禁及RSS四条真实socket回归通过，原组Todo/Diff浏览器及最终组合仍待 |
| Dataset既有writer `01a13341-d712-73f2-99f4-992f8645847c` | 文件导入目标/草稿与对应浏览器，独占client/import | 本地 `f29e7074e`，统筹已核实际diff、旧复现4失败、新旧浏览器21/21、相关365/365及门禁；局部验收通过。资源快照下调与最终整合验证待做，见§12.5 |
| Issue既有writer `01a13342-5853-75e1-a3ce-929ee5ec4e75` | 手工页/capture保存与丢回执恢复 | 本地 `1d67c6408`，统筹已核实际diff、旧4失败、修后4/4与相关51/51及门禁；局部验收通过，最终整合与资源快照下调待做（§12.5）。该保存片冻结 |
| 助理发送writer `01a13369-d79c-70f1-9798-7b84181fa7d0` | SEND/PAGE-CARDS/ASSISTANT-404同文件连续处理，保护在途#471 | 冻结 `d2ce01f35`，统筹已核发送意图、同owner草稿投影及A→B→A/重载回归；纳入I7构建/门禁与修后浏览器均有通过证据（§12.5）。七项旧行为有效补证与README相关助理浏览器均已核；该独立片局部验收通过，聊天已按用户要求归档、树和日志保留。最终组合及#471接续仍由原会话承接 |
| Workflows保存writer `01a13369-e221-7433-a2eb-24bcdcee1039` | WFSAVE/WF-OPEN客户端与README，backend留G8 | 本地 `c35d8ff9d` 已纳入I7构建，旧七条全失败、修后7/7和相关32/32、浏览器2/2、模型就绪1/1均已核，局部验收通过（§12.5），聊天已归档；最终组合验证由原会话承接 |
| 协调方 Home 语言接线 | 用户在G2聊天明确选择协调方串行补齐。以Issue保存片 `1d67c6408` 和G2语言helper为前置，Host两次render、Issue静态控件用既有L及正式浏览器/README；为保持资源预算，合并client/capture-client中的重复读取、按钮样式及相同CSS，保存协议不变 | `967a19aef` 的build/正式assets/boundary/actual-base health、新5/5、相关42/42、旧三条0/3均已核，局部验收通过。因I7先降至23,535，追加私有标记机械改名 `b3cff85a9` 回收最后1字符；该补充已纳入I7 d0174744f并通过整合build/资源/actual-base health等工程检查，新一轮正式Home五条浏览器均通过（§12.5，含三条locale），不把旧证据改写为新头。最终组合全量未完成，见§12.5 |

2026-10-13新增整合切点：I7至60b38f7f4已纳入G1、G2、G6、G7、G8及G9原四提交，并补连续QA准确工具依赖和Dataset owner README。协调方逐组核range-diff：G1/G6/G7/G8/G9仅沿现行错误合同或README上下文接续，G2保留共同UiRequest出口及原目标/失败保稿语义；原Home三提交早已整合，没有重复采纳。Dataset README补充80个Unicode字符、Form转表失败保留及定向用例。随后在`d8fd46843`上整体构建、API与动作快照检查已通过，实际`i7-preflight-results-12.json`与原始日志已核；编译所需修正仅清理失效import、接现行错误factory及补assistant.cancelled分类。快照变化为pin helper接ActionExecutionContext和两项Goals pin动作concurrent声明。资源预算因八个产物增长拒绝更新（`i7-assets-update-12.log`），仍按既有上限收束；随后`i7-six-owner-engineering-01.json`的类型与71包boundary通过；actual-base health仍六项失败：Goals新巨大单元、Git Host文件增长、tabs测试语法、两处installer错误归属增长、Cognia插件id误入翻译检测。原始日志已核，继续修正源码与测试，不称整树预检全过。新批回归、typed桥/G5/RSS最终组合继续待做。随后`4b7398b48`收束源码、`9a10e29ec`记录实测快照：Git两片完整正文并回原operation owner；Goals交付表单片段在原位置展开逐字相同；七客户端仅语义绑定重命名，Pages编辑器只压缩空白；installer错误码归现行owner，tabs补缺失类型括号。协调方已核实际diff、脚本映射及`i7-preflight-13.py`/results与原日志，该轮build/API/actions/assets/actual-base health/boundary/types全通过，29项资源11,024,257字节，未改变门禁规则。它只证明这批新组合的工程预检，不替代待纳入三片后的最终回归。

同一冻结切点`9a10e29ec`随后实际执行38文件回归：`i7-six-owner-regression-01.log`记录327条、314通过、10失败、3因超时取消、0跳过，整体退出1；协调方已核实际命令、文件清单与失败原文。已定位的生产缺陷是Runtime在stdin不可写的同步路径未清旧child，以及Goals嵌套pin在下游等待后未同步复查父动作停用。两处最小修正已准备并核源码，须重跑原失败用例，不能据源码关闭。其他失败继续按实际合同校正并重跑：Pages的prompt数据被二次JSON编码后错用正则；Functions测试仍引用改名前的私有变量；native HTTP现行成功码为200；Todo材料输入缺必需字段；Work create缺四个显式可空必填项，未进入native屏障而超时；Workflow stop夹具重复登记既有Form预览动作。这些夹具问题不支持对应业务验收，保留原业务拒绝、持久化及恢复断言；该轮不记整批通过。G5、typed桥、RSS及浏览器组合仍待最终纳入验证。随后`ccd9c9b6a`的第14轮工程预检11步均通过；10文件定向重跑`i7-six-owner-fixed-regression-01.log`为96条、94通过、2失败、0取消/跳过，剩余仅两条Goal父动作停用后仍产生owner v1。Runtime恢复、Pages节选、Functions、Todo、Work与Workflow stop已按原断言通过；native成功码夹具单独修正`1f5ed9a50`后`i7-native-body-fixed-01.log`两条通过。协调方已核实际命令和完整日志，不将不同批次相加成新全量。Goal失败进一步定位为Host异步可用性检查早于下游等待；`74836be90`把父beforeEffect移至下游原validate之后，保留同步检查，已核源码，仍待运行。RSS第五片已无差异整合为`5a94f045d`（range-diff相同），与主线文档归档合并后为`09b6316e4`；RSS真实socket回归尚未运行。随后RSS首轮编译因Readable不足以作为pipe的写入端拒绝（build15），`9a64fe027`保留实际解码器类型后第16轮整体build/API/actions/资源/actual-base health/boundary/types全部通过，merge-base为`51999193`、71包/1882源码文件/7926imports/243依赖边/58合同子路径；源码与原始日志已核。该切点的`i7-parent-rss-regression-01.log`实际11文件78/78、0失败/取消/跳过（实际命令退出0）：Goal pin14条含两种role停用前零写入均通过，共同AUTH/MCP、RSS四条真实TLS/TCP及既有Feed/URL回归亦通过。RSS覆盖公网/TUN固定连接、重绑定私网零接触、证书/redirect/validators/304、wire与解压双限、DNS/响应取消后连接清理，以及实际Node环境代理标志拒绝。Goal pin与RSS socket必要修复的局部验收通过；此轮没有最终G5/typed消费者，不替代后续整合全量或Todo/Diff浏览器。安全表S-03/S-10/S-11/S-18及test:security已在I7同步，默认正文限额仍须准确区别各入口显式配置。

同一I7切点`9fbf92543`的首轮18文件浏览器回归已结束：`i7-six-owner-browser-01.log`为76条、48通过、28失败、0取消/跳过，实际命令退出1；协调方已核受build/browser锁保护的命令、完整文件清单、通过项与失败原文。已通过Alchemist、Cognia/Lingguang对象状态、旧有companion生命周期、插件切换器、Shelf、Todo失败保稿、设置/引用/文件预览迟到响应及tabs恢复。Pages多条真实路径因资源收束改名遗漏两个嵌入片段而报`workbench is not defined`，属于本轮生产回归；`3c93a8e93`同步片段绑定，仍待重建复跑。另确认Diff夹具向Artifacts/ProcessItems构造器传裸db而非现行`{ db }`、Functions浏览器夹具导航能力目录而非规则编辑页，尚未进入业务断言；修正夹具不能替代复跑通过。其余Images、Form/PPT、Goals/Planning、市场刷新、Browser upload/grant与STOP失败继续按实际调用链诊断，不将该批或组合路径记为通过。安全表S-03在`9fbf92543`已准确区分默认限额与显式导入限额；G5/typed桥与最终整合全量仍待。

后续`2edbc178c`的Images打开刷新、README及Diff/Form/PPT/Functions/STOP夹具修正已核实际差异；业务断言保留，复跑仍待。主线#471 Computer Use已合入I7（`8943a38c5`），agent-host实际依赖切至主线computer-use SDK；第17轮install/build/API/actions通过，资源门禁仍因Workbench增加2364字节、Images增加161字节拒绝更新，其余预检尚未执行。协调方已读实际脚本、results及原日志，不将这轮记全过。最终G5与typed桥必须在该现行SDK上验证。G5最新交接的两个实证缺口继续纳入最终组合：BUILDER-LATE的新增reset屏障尚在port fixture，未证明真实Host stopRunner后不删除新预览；S6尚未把Coding实际SDK文件修改、正式Git批准与Diff读取接成同链。既有分层用例和源码准备均不能代替这两项，待整合后补验。

**浏览器复跑前的工程检查补记。** `5ae3cf5ee`及`f10ee6fc9`的最终差异已核：Goal当前入口与recordNote、Planning关闭/返回路径、Market个人插件hidden状态、Browser首帧尺寸与首轮审批刷新均修正夹具，保留原业务断言；Functions与Side Browser的无效二次改名已撤回，Images刷新失败只回写原请求仍有效的对话框。第19轮build/API/actions通过，资源仍多2101字节，原日志保留。原因是Host已统一去注释，局部重复去注释无效。`e08ae7be6`撤回重复处理，在既有JS解析路径压缩语法节点前的空白并保留换行，新增真实HTTP资源用例断字符串、模板、正则和自动分号语义；协调方已核生产与测试源码，该用例尚待执行。该提交的第20轮整体build、API、actions、资源更新/复核、actual-base health更新/复核、boundary及根类型检查11步均退出0；资源29项10,835,522字节，比较主线merge-base `2cb35d4e`，71包/1,898源码文件。已读执行脚本、results与各原日志；这些工程结果不代替待跑的资源语义用例、浏览器复跑或G5整合后的最终组合。

随后`d42f19dc2`的7文件定向运行`i7-main-sdk-and-assets-tests-01.log`为119/119、0失败/取消/跳过，实际退出0；协调方已核driver、HEAD/命令、exit记录与完整日志。包括上述RAC-19真实HTTP资源语义与缓存两条、Functions19条，以及当前Computer Use/助理相关回归和vendor来源校验。G5及typed桥尚未纳入，这119条不支持其效果控制验收；同切点13文件浏览器复跑仍待最终结果。

同切点13文件浏览器复跑`i7-six-owner-browser-fixed-02.log`现已结束：47条、33通过、14失败、0取消/跳过，实际命令退出1；已核HEAD、命令、完整footer与失败原文。Images真实设置到本机provider、PPT取消后迟到响应、Lingguang冲突、Planning两种迟到结果、Browser真实上传/授权、Functions四条、既有companion与放置组合均有该轮通过证据。剩余Diff夹具缺必需appendEvent、Market对非popover元素调用hidePopover、Goal四条未到可见工作区和S1输入建议层遮挡继续修正操作步骤，业务断言不放宽；Pages/Form六类继续按实际失败诊断。STOP进程406秒仍忙循环，抓栈后仅终止该精确PID，计失败而非通过或跳过；Host无waits立即空成功与Coding重复等待已定位为生产缺陷，纳入W2-18-CODING-WAKE-02。typed桥已纳入`022893041`，G5首片整合为`cb8f0be17`，余片正按既有事实owner解决冲突，均尚无本切点运行证据。该批不是整体通过，G5效果控制、Builder真实Host停止与S6整链仍未验收。

typed桥及G5五片已全部整合至`697cf9422`；协调方逐份核range-diff，typed/Characters/Builder/Coding生产片原样，Agent仅README上下文接续，Memory保留现行memoryErrors与直接bindings登记，没有恢复旧错误重写层。`dff982674`的无waits明确拒绝与Coding停止不支持消费者、Host回归断言及Diff/S1/Goals/Market真实入口修正均已核，尚未运行。G7只读诊断与协调方源核进一步确认：Pages READONLY/CREATE须明确宽布局；TRANSIENT原选择器命中article而非button；ACTIONS第二段8字被现行规则归word，不支持拆行动项，改长计划文本保留变化后拒绝。Markdown/HTML事实断言已有经过证据，打印捕获须等待实际srcdoc文档并断真实print调用，当前不足以定产品根因。补查Form两个submit处理后，修法收束为公共下拉增强器尊重原select显式aria-required，缺省用native required；若直接给Form添加原生required会让浏览器先行拦截，改变现有错误提示，因此不采用。原MutationObserver已观察全部属性，无需新机制，AX要求不放宽；离线填写/导入后续尚未执行。上述仅是修正方案与源码证据，§12.7组合和最终运行未据此关闭。

`8d4bc1c5e` 已提交公共select的显式ARIA优先及动态回归、Pages宽布局/真实指针切换/实际srcdoc打印捕获；协调方完整读diff，业务断言未放宽，尚未运行。`087e0c7df` 将S5/S6共用的真实Home、Catalog工作区、HTTP和SDK装配抽成夹具，原Shelf完整原文与跨项目拒绝断言保留；新增S6在审批后等待实际回执再判写入，分别核文件、Git index及固定变更正文。两项夹具问题（漏装工作区能力、将审批接受误作效果完成）已在源码审查中纠正。Builder真实Host用例`61bd21df5`/`1e9ab3096`通过真实SandboxRunner目录清理制造旧reset与pause/resume交错，同目录两条清理路径共享实际删除屏障，待续步落地后核新ready状态和预览原文不变；模型使用现有受控fixture，未运行。Goals候选见§12.3，Schedule仍待。这些均不作为工程或组合通过证据。

新main整合头`6972b1cb0`已把ASSET-JS改为直接对原JS调用现有esbuild转换，失败保留原文；真实HTTP用例保留locale/ETag/HEAD/缓存断言并增加插值模板、正则和自动分号的独立执行期望。Goals候选已原样整合为`b468273e1`。`808f0856c`按职责搬移附件/Character校验、启动控制合同和Builder设计夹具，原断言与effects.start整次作用域保留，并补Documents合并时遗漏的函数括号；上述实际diff已核，均未新构建或运行。G5新main补审发现的两个P1、动作版本和控制类型本地import缺口尚待处理。Schedule服务激活与S8自动提醒用例仍在原writer准备中，不以候选实现替代产品证据。

第23轮整合构建实际失败于`AgentMemoryExecutionControl`缺少本地类型导入（TS2304）；`5bf879c03`已补实际import，尚无重建通过证据。Schedule与S8候选`ea34f2a89`已整合，协调方核完整生产、README和测试diff；两个闭合、状态复用和关闭回收修正未放宽门禁。Schedule源/构建双实例夹具已统一为构建产物，旧测试的内部导入数量减少；Todo提醒HTTP夹具在`89af5b5f2`已改为现行`POST /api/todo`/200。当前这些是待运行候选，不更新全量通过数字。

`89af5b5f2`与`d18c735ef`已将handback的同一`stillCurrent`贯穿dispatch准备与SDK启动的同步接受检查，保留基础授权检查；父工作归档、明确停止或已有新轮次时旧交回失效。停止入口复用现有settling状态，允许撤回正在准备的交回。真实SDK用例覆盖authority、beforeStart和已持久化准备记录后的归档屏障，新增停止/新父轮、未消费子结果及显式恢复后仅一次接续断言；源码已核，尚未运行。Coding控制动作升为v2，旧版拒绝和调用方影响已写入README；构建后动作快照与消费者运行尚待。MODEL-SWITCH的Molis候选已改为在SDK最终同步接受点核原调用，并在同一点更新待切换显示，移除失败后清空显示的旧行为；正式typed Host、Node SDK、真实文件读取与受控模型回复的配置/凭据交错用例已备。`e652b4a0b`补入实际SDK接受帧中的取消/撤权：原调用检查须确实到达该帧，拒绝后显示仍为B，实际后续模型请求严格为START、B且不新建Run；协调方已核实际diff。S-18与安全测试命令已同步；上述Molis新增用例及正式SDK集成仍待完成，不提前结案。

Prologue修复在当前包对应提交`d4908c118f7899d44e3d1975806797a05f0094b9`的隔离树内实现。SDK首轮四文件62项中61通过、1失败：新拒绝用例漏算subscribe立即触发的首次通知；当前源码按订阅后基准计数纠正，不改生产通知语义，第二轮实际命令已退出0：四文件62/62通过、类型检查无错误，随后SDK构建通过；协调方已核完整日志、同一命令的退出结果与最终源码差异。协调方在受控端口下执行旧/新生产换模封装：先接受B再拒绝C，旧版清空B显示、新版保留B；这仅证明封装状态，不替代实际SDK整链验证。上述新候选的整体构建、工程门禁、浏览器和全量通过数均未更新。

新SDK已打成隔离验证包，协调方核包内相对当前正式包只改变换模控制实现和类型声明。I7第24轮整体构建实际失败于Memory仍引用已移除的`MemoryError`（TS2552）；`9fa969049`改为现行owner的`memoryErrors.not_found`，协调方已核一行差异，重建与Molis真实SDK换模回归尚待。隔离验证包尚未替换正式vendor与来源记录，不宣称已完成SDK集成。

共享spec、路线图、安全不变量、门禁/API/动作/资源快照由协调方按实际整合结果串行同步；writer不得放宽阈值或为绿删断言。当前均只获本地独立实现/提交，不自行推送、开PR、安装、发布或操作真实Home/凭据。§12.8中需同步安全表的具体拒绝必须有生产边界断言；受控第三方响应不等于真实外部账号验收。

2026-10-12 用户要求完成的会话从Codex列表清理。协调方已归档Dataset、Issue、G4核心、Workflows保存与助理发送五个独立会话，工具均确认成功：各片局部验收与交接已完成，候选提交已由原防腐会话纳入I7，最终资源快照及整合验证继续由该会话承接。仅归档聊天，工作树、提交和原始日志保留；其余仍有实现或验证工作，不将idle当作完成。

PR-8第二片已保存为`222bb2d4c`与`f002b7ffb`，协调方核实际44文件改动及后续沙箱断言修正；工作树在该切点干净，仍无构建与回归通过证据。不可达的bundled发行物恢复包装已删除，真实Coding停用后零事件、旧caller拒绝与重新装配读取，以及真实沙箱子进程/生产broker的四项拒绝用例已备；沙箱安装身份是夹具，不称完整安装链。当时Coding HTTP新用例有两项待收口：21,000字约定会污染后半重新选择模型材料的场景，须经真实owner恢复短内容并保留正确版本及原固定报告断言；停用拒绝只断言状态大于等于400，须钉拒绝状态与code，不能让未知错误满足验收。两项已在协调停止零碎消息前反馈，后续源码修正见下段。I7仍为`9fa969049`，构建25尚排在他人全量之后。

2026-10-13后续批次源审：PR-8测试修正`b38ed53e1`经核，21,000字确认后由真实Goal owner恢复原短约定，版本自然前进到4，后续重新选择与固定报告断言保留；停用拒绝改为限定三个现行拒绝code及相应状态，不再接受任意500。`93b8d6f22`/PR-9上的`154a42aaf`统一沙箱用例四处内部引用到dist，不增加第二份owner。上述仅源码通过，仍未运行。PR-9候选`5c0c128b3`的12文件已源审：增加完整Host/无工作区的typed家族核对、四个Goals与私有开发旧协议的AST回流拒绝和mutation，并将CLI/MCP接线检查适配现行常驻与惰性fallback。发现门禁迁移遗漏原CLI `.goalQueries` 拒绝：新`HOST_NAMES`没有该名；直接调用现行门禁，对真实cli-project正文及正文追加`const query = runtime.goalQueries;`均返回空错误，必须恢复原约束并加对应mutation，不能以迁移常驻接线放宽。文档仍有两处当前描述未收束：Goals README开发不变量保留“typed入口薄转发”“Coding四协议保留”和十项旧数；Host README管理段仍写十项及无条件预打开。原路径文档其他已改部分已核，不要求另加清单。当前新增跨入口组合用例尚在编写，I7 build25仍排队，未将候选或测试存在记作验收。

2026-10-13 09:18，Root接续核实并补齐同一进度书（原进度会话已完成当前轮次、工作树干净；未重启或派发新会话）。PR-8补充提交`b38ed53e1`通过真实Goals owner恢复长约定后的短内容，版本自然由3升到4，保留原固定报告v1与后续重新选择场景；停用拒绝改为已知code/status配对，未知500不能满足断言，实际运行后仍须钉住观察到的确切拒绝。`93b8d6f22`将沙箱目录用例其余四处内部导入统一到各自构建版本：新增真实broker接线原会令app-local-host混用增加，不能当作已有基线；现待重新度量与运行。Coding用例语法零诊断，最长函数180行、原基线181行；均不代替运行通过。

PR-9候选`5c0c128b3`已保存：十四个旧Goals literal及旧导出、隔离开发旧协议及导出由AST回流门禁拒绝；新增真实完整Host/无工作区Host的typed注册清单，当前路径文档与Skill同步收口。静态回归发现原管理入口门禁只接受直接本地绑定，与PR-7已接受的常驻转发不符；新私有门禁核原signal、惰性回退、实际目录选择与canonical reference、resident/fallback端口、Runtime为null、!owned空scope及无第二条Host客户端路径，保留原反例并新增伪造项目、丢取消、提前本地执行和绕过常驻的mutation。实际`tests/goals-query-boundaries.test.mjs`六条全过、完整包边界检查errors为空、新门禁与注册清单Biome检查无诊断；注册清单的真实Host运行仍未进行。此项收紧和接续现行结构，不放宽任何计数阈值。新注册清单及跨入口用例静态import图的混用数字为零。

W3-09-1a已在`feature/anti-corruption-cross-entry-consistency`准备T1/T2/T4/T7源码，复用现有公开Test Home、真实HTTP项目/授权与实际MCP工具，不增加测试端口或模型调用。T4按当前生产事实补正旧设计：schedule typed服务要求原插件身份，裸Host调用应被拒；成功读取和missing-job拒绝由实际executor装配的声明服务夹具验证，不把伪造plugin_id当身份，也不声称已有正式业务消费者。T5、1b助理、1c状态/诊断、W3-09-2/3仍待；本片运行尚未进行，不能记验收完成。

I7仍为`9fa969049`加隔离SDK验证包的临时依赖/lock；构建25唯一任务仍排在他人Status Ring全量之后，未重复启动、未占用他人名额。SDK隔离回归62/62与SDK构建通过的证据保持；Molis消费者、换模/handback变异、各片整体构建/类型/API/动作/健康/资源及整合全量仍须在实际新head验证。现有远端进度PR #463已合并最新main到本地进度分支，后续按密钥扫描与新head CI再推/合；其它draft与冲突PR未作为可合候选。没有上游SDK提交/推送、正式vendor替换/删除或真实Home写入。


2026-10-13 10:03，Root继续持有本进度书的唯一写入权（原进度会话批次源审后明确交回、保持只读）。进度PR #463已按确切head `305c506d2`、当时main `fc18d5f62`，核五项必需CI/Verify与Product subset成功、密钥扫描零命中后合并；main为`0d5169efa`。剩余#411/#410/#409/#408/#156仍draft，#180仍冲突，未作为可合候选。

PR-9的后续`ed4f57663`恢复原CLI `goalQueries` 拒绝并增加实际mutation，六条接线门禁回归再次通过；Goals/Host README旧十项typed与四个Coding桥描述已收口，错误的`goals.events.decide`改为真实`goals.decisions.record`。`b599783d6`补当前typed生产消费者表；`6f0d9fe6b`按实际五个workspace协议均为动作修正文档与清单，不把读取算作剩余typed服务。新增清单核真正已装Host的availability及无工作区的dependency_missing，仍待运行，不以源码替代验收。

跨入口候选已保存T5 Shelf真实页面schema拒绝、1b真实SDK/助理gateway批准及owner拒绝（`0a66d7709`），以及T6真实停用后的页面/Host gateway/typed同码同原因、拒绝后零业务写入、实际诊断页编号查询（`f6f78647f`）。不增加私有导入、测试端口、显式any或类型双断言，语法与Biome检查无诊断；全部新运行断言仍未运行，尤其助理实际review、持久化及SDK后续模型材料的code证明待核。按名调用隐藏MCP动作的两层目录修改属于W3-09-2，尚未实现；不能据Host gateway直调称实际工具按名已通过。

用户已授权向「Work | 进行中 | 优化 Pages 和个人助理交互」发送一次构建/浏览器名额协调消息；Root已发送，未停止他人进程或重复派发。Pages在完成预览后自行释放，I7构建25实际运行退出1：`prologueEffects`返回类型推断泄露SDK私有storage声明（TS2742）。`62a58259d`通过现行公共`PrologueHost`明确返回边界，源码语法/diff检查通过；构建26为唯一接续任务，仍在排队。I7当前仍使用隔离候选SDK临时依赖，仅用于验证；SDK自身62/62及build通过不代替Molis消费者，换模/handback原同步fence变异及最终整合全量仍待。未提交或推送Prologue、未正式替换/删除vendor、未写真实Home。


W3-09-2候选`725879ff1`已保存：两层MCP只保留精确授权但暂不可用的调用条目，tools/list继续隐藏，按名进入同一Host拒绝/留行；无授权、撤权、不同provider/version及管理入口仍拒绝。助理gateway的availability与check错误保留稳定code，确认前仍零review、零调用行。实际工具停用/撤权、public adapter、错误provider/version及两种真实SDK preflight用例已补，源码语法/Biome检查零诊断、完整包边界errors为空；运行仍待。批次源审核Schedule create的HTTP合同为201（route handler明确声明、native回应原样传递），新跨入口用例已修正期望；MCP README空预开改为实际!owned条件与resident路径，精确模型URL桩的范围同步写清。上述不放宽业务断言或新增网络框架。


W3-09-3源候选`59d825ec5`已保存（十四文件，不含快照更新）：Kernel共同输入校验只运行一次编译schema；只有全部结构化Ajv错误都为根对象缺版本字段required时归`actions.version_required`，错误类型/null map/其他缺业务字段仍为`actions.input_invalid`。有效schema后检查顶层Agent/MCP的声明版本字段、完整ids版本表及Functions authoring updated_at非null；实际允许的expected_revision:null保留CAS语义。助理preflight改调用同一Kernel函数，删除局部旧版本规则。活跃handler上下文由实际dispatcher创建，嵌套检查同时核actor/audience/project、同一beforeEffect函数及实际executing/lifetime；仅继承ALS、新建顶层caller或旧promise不得豁免，不新增JSON嵌套标志或schema兼容。当前schema里两种版本表仅Todo batch与灵光discard，均明确使用ids，已核实际声明；现行非AIworkflow及plugin/user行为保持。新测试经public ActionService覆盖各字段、缺版本/部分表/错误schema、null CAS、真实嵌套及timeout后旧promise；另外通过实际Home Todo MCP和本人页面核版本前提/事实/历史。源码语法/Biome零诊断、静态包边界errors为空；新增文件和实际运行、API/健康门禁及整合全量仍待，不能据源码关闭验收。

用户进一步明确授权本防腐任务内必要构建、浏览器及交接协调，Root已向「Work｜推进中·统筹」发送一条协调消息。统筹核当前adoption-contract-loop持锁者是终端Grok而非Codex采用聊天，现有消息工具不能投递；没有成功联系到负责人的确认，没有停止进程、改锁或重复构建。当前全量仍推进，I7构建26保留唯一排队，独立源整改继续。


W3-09-3批次源审补两项，均已源修但待运行：`ed8247d97`将实际Todo batch载荷改为当前`change:{status:"doing"}`（不含不存在的kind字段），否则schema先拒、版本路径未被验证；后续进程内ActionClient的own property为undefined也必须算缺前提，Ajv会略过可选undefined，故共同检查显式拒绝并补原真实ActionService入口断言，合法expected_revision:null保留。`5b7e3b0be`进一步钉原actor_kind/runtime_session_id/plugin_install_id/host_plugin，另一会话即使持有原beforeEffect函数也不能借嵌套豁免；这些仍只有源码/Biome/diff证据。

W3-10-2源候选`fc8887783`已保存：九处Workbench源码的引导/选择、Functions三个脚本、MCP授权、连接与Home模型读取统一经UiRequest；保留空项目的原feedApi分支、输入/选择序号、Controller取消、原已授权后刷新失败恢复，并在失败位置用同一failure view显示可查号。Home插件页原本已使用助手，未重复迁。Functions纯页面夹具挂现行公开UI_REQUEST_CLIENT_SCRIPT，业务保稿/冲突断言不改；新增真实Host/浏览器保稿、owner事实不变、真实诊断页及明确修正后保存用例。九处本范围raw fetch已归零，静态翻译缺失/未装词典/稳定键错误均为零、完整包边界errors为空。新增源与新用例Biome无诊断；原functions-draft-retention四处显式any仍是原基线，未新增，不能称该文件整份lint通过。当前仍待whole build、资产/actual-base健康门禁、浏览器运行和最后整合全量。


2026-10-13 10:56，进度PR #473已按确切head`ef8fb699e`与当时main`0d5169efa`、五项必需检查/Verify及Product subset成功、再次密钥扫描零命中后合并（`ee84a8379`）。该PR只记录实际失败、已确认静态证据及仍待运行源码，未发布实现。剩余远端draft及冲突#180继续未作为可合候选。

W3-10-2批次源修`74d554195`保留context rangePick与native+save共用捕获里的Host错误对象及实际编号，native其他错误保留原说明；连接refreshFailed/只读重试透传错误，仍显示已授权、不重新授权的提醒。W3-10-3a候选`b0d790ae9`、`f93be38e1`、`ffa56932d`、`ef73dbf9e`按同片迁api工厂和全部feedApi读者，保留Functions可空项目语义、既有409且state=failed收据、HTML/取消/选择序号与来源已创建只补计划；Feed/规则/Home显示链保留真实Error，Home草稿/原请求持久化不变。复制编号按钮加入后会改变宽泛button查询，现settingsLoadFailed只取原直接子级重试按钮，复制与只读重试各自生效。原builtin composition VM夹具同步api变量，挂载断言不改。静态翻译缺失零、完整包边界errors为空、源码/所改新用例Biome无诊断；整棵构建、资产/健康与真实浏览器仍待。

W3-10-3b候选`376d2da54`及`2c92d01e1`、`f69fd2aa0`把Workbench自有插件/Review/companion请求统一到UiRequest。真实原requestLifetime、审批写入activation signal/读取view signal、五参数Files/Git adapter与返回后的assertCurrent、成果HTML404/fragmentheader、member串行修改及原错误对象透传均源核保留。审查刷新与固定成果读取也用共同failure view，原可见性/序号及只读刷新提示保留。未扩到Files/Git插件内部显示，其迁移仍在W5；回归尚未运行。

尝试两条既有脚本验证的原始`w3-request-static-scripts01.log`为2文件、0通过/2启动失败：构建产物缺失导致进入断言前ERR_MODULE_NOT_FOUND，不能算静态/产品通过，也未通过改导入路径绕过。目前唯一I7构建26仍排在Grok全量之后；I7冻结`62a58259d`加临时SDK依赖、没有重复启动或停止他人任务。后续须实际整体构建，再在同一冻结树完成SDK消费者/变异和各批运行验收。

W3-10-4源候选`4a822c9f1`已固定十三文件：两处助理、Placement、Context、搜索、Frame/Board与当前电脑面板经同一UiRequest。按G3仅从`body.details`恢复work/action，断线仍用原request_id；原文、材料、草稿与切换后的状态保护保持。Placement数据属性JSON解析一次交助手编码；Frame成果404与fragment header、Board三段读取回退、Computer二进制Response、原幂等键/失败撤回及409收据处理保留。错误展示保留code/status/callId/body，不再只取message。原电脑Shelf用例改接公开助手和真实Response，失败撤回/二进制/幂等断言保留；原断线发送浏览器用例补验收编号，不修改断言。相关十三TS与六个完整序列化程序语法零错误、十三文件分组Biome零诊断、静态包边界errors为空、缺英文/未挂词典零；grep定位Workbench直接fetch为零不等于AST门禁通过。当前仅源码候选，已发既有统筹只读复核；实际整体构建、脚本/浏览器运行、资源与健康门禁均待。唯一构建26仍等adoption全量释放，未重复启动或中断他人。

W3-10-4只读复核发现主要写对话与几处最终显示仍压成message，补修`9907297e2`已源核：共用dialog保留失败输入及确认恢复；Placement位置失败的共同view放在bar按钮外、检查原slot/签名；Characters、handback、材料/图片、sideAction/budget与permissions透传Error，图片/PDF保留文件名和native错误文字。没有放宽测试断言；真实UI仍待构建后验证。

W3-10-5独立源码候选`5577c3c65`及`e9bcecea7`保存七文件。模块/绑定图、程序展开与fetch AST扫描分开，沿用SOURCE_COUNT_RULES及现有逐文件merge-base比较，不另建基线体系。WorkBench绝对归零（含相等base、--update）；其他程序按文件只降。候选源码按已声明SCRIPT/CLIENT、HTML执行script及现行terminal/browser-client typed入口识别，相对/workspace出口、副作用import及运行性export-from跟到实际源文件；纯类型边排除。仅现行ui-host精确运输站点例外，邻接/复制的新调用仍拒绝。当前范围、字段候选保守展开及动态/反射/新构建入口的未证明边界已同步gate README；静态候选上限256，超限报错。

复核实际补出的逃逸为：String/replace不能默认为占位或不变、条件返回不能丢分支、typed闭包不能漏副作用import与export-from、共享formatter不能覆盖输入owner后去重掉新片段、inline type-only import不能算运行边。现已用正式Git反例覆盖，未知程序变换明确拒绝；精确缩进/整行注释正则实际删除且保留未改字符来源。原始首轮15/15、第二轮39/39、第三轮47/47、第四轮48/48各留原日志；最终`raw-fetch-cli-tests05.log`新门禁与既有source-counts两文件50/50、0失败/跳过/取消。当前树`raw-fetch-scan10.log`358个静态程序变体、9个typed文件、展开/解析错误0、Workbench0；其余46文件90站点是当前测量，不固定数量。六源码/测试Biome无诊断。较早的实际health `--report --json --base origin/main`量到merge-base fc18、head90/base154，只是报告退出0，不是完整health通过。当前候选未推送/合入，整合预算、API/健康、产品/浏览器/全量仍待；SDK消费者构建26保持唯一排队，原冻结I7与临时包依赖未改。

SDK消费者变异准备补齐一处测试接线：I7`bec456310`把`assistant-delegation.test.ts`的四处Host源码引用改为已存在的公开构建入口（现有独立handback用例已这样导入）。否则移除dist中的最后同步检查不会命中被测实现，可能给出无效变异结论。生产冻结仍为62a加临时候选SDK依赖，构建26尚未开始时仅改此测试；没有启动第二份构建，也没有跑变异或称SDK消费者通过。

W2-10-A1从最新main`ee84a8379`重跑工具后固定`e128c0f5a`，已开并附加[#474](https://github.com/molis-ai/molis-work/pull/474)。64文件由53份测试导入、开发要求/九README构建前提及向下更新的基线组成。无新增公开出口；Alchemist两别名已核原声明、本地名保留。53文件语法零错误；剥离静态import及dynamic import/require目标后测试正文逐字相同。五动态引用位于三文件，独立源审逐一确认原声明对应的现行public出口或dist twin；没有新增Blocker/P1。真实`w2-10-a1-health01.log`完整health相对ee84的merge-base退出0，internal references752、mixed processes140；`--update --base`再次0，仅下降；密钥扫描199新增行通过。此健康通过仍含既有允许的存量lint项，不等于全仓零告警。PR确切head为e128、baseee84，CI启动中；53文件实际运行、本机构建与最终整合尚待，不能据源审或工具预计归零关闭W2-10。

I7构建26实际退出1，Agent Host的类型修复已构建到，但Issues的esbuild缺darwin-arm64可选二进制；没有SDK消费者通过。27离线frozen force安装成功却再次同因失败，Root随后核到临时lock的非SDK删除888行，不能靠重装补回不存在的optional合同。现已从I7 HEAD完整恢复lock，只保留候选SDK必要路径、包完整性及snapshot键的五行替换；optional/omit环境均未设，不改共享配置。28使用offline frozen optional=true安装退出0，esbuild实际transform及Biome2.5.14启动都成功；整棵构建进一步到Host后因五TS错误退出1。`28a82c1b5`删未用off/requireRuntimeProject/workspaceFor及其旧调用、替换遗漏MemoryError为现行owner的memoryErrors.off，并让typed helper接受公开合同本有的ActionCallContext（call_id可选、原对象不clone、不造编号）。六TS语法零错；scopedBiome仍报告该六文件既有十项存量，不称零lint。下一段29仅一份构建及三个SDK消费者文件，实际仍排队；26/27/28原进程均已结束，未重复或中断他人。

W2-10-A2在A1之后重测固定`e4a8d7e00`：五十三测试加基线，无额外文件或工具阻塞；除模块引用外正文逐字不变、语法零错。唯一dynamic为coding-surface的同文件src转dist，独立源审已核同一生产声明，未发现新增Blocker/P1。真实完整health及`--update --base origin/main`均退出0，相对ee84的当前internal references704、mixed processes95；基线仅下降。尚未运行、构建或推送，不能称模块运行验证或W2-10归零。A1的Product subset已有实际成功，必需Package boundaries/Verify尚待；未提前合入。

I7第29轮整棵构建实际成功（原始日志`i7-build-sdk29.log`），随后三个SDK消费者首轮24条16通过/8失败：七条未到目标拒绝，是fixture仍调用LocalHost已不存在的registerCapability；一条owner-index未触发，是raw SDK inspector读裸sessions而真实ScopedStorage加appId前缀。补齐`87e61275c`后10/10：使用现行register，独立peer使用另一真实project队列（保留生产串行合同），raw inspector核appId~sessions且原清理/后续创建断言保持；没有更改生产语义来变绿。最初typed-start按同项目相互等待的30秒取消、旧owner-index的Missing rejection均保留在30日志，不记产品漏洞或通过。

模型变异初两轮删选项/空通知误伤B显示，driver正确拒绝作为目标证据；最终03仅删Node接纳回调的effects.assertCurrent、保留SDK选项与beforeAccept显示通知：基线退出0，变异两条均Missing expected rejection退出1，字节恢复后0。交回03虽变异仍0，driver正确判无效；`3a7130585`把失效移到真实SDK Session同步授权回调，而非更早的async read微任务，原权限/入库/child未消费/本人恢复断言不变。04实际基线0→移除service最终assertSendCurrent后的拒绝通知缺失1→字节恢复0。没有改SDKstore或正式vendor，临时诊断移除；只停止过精确pid30256的本轮无效调试进程，未中断他人。最终`i7-sdk-consumers33.log`三个文件24/24、0失败/取消/跳过，测试仍对应候选包；agent-sdk-effects scopedBiome0，既有delegation的一处any未新增、不冒称该文件零lint。独立只读复核已核实际SDK调用链与原日志，无新增Blocker/P1。

SDK四文件实现/候选包与上述消费者已可审阅，Root已按交接与Prologue AGENTS条款弹窗请求跨仓提交/上游分支推送/PR及正式computer-use vendor替换，当前授权仍待，不能据静默继续该部分。其余整合继续。A2已开并附加[#475](https://github.com/molis-ai/molis-work/pull/475)，exact e4a、叠A1；该base暂不触发main限定CI，A1合入后须重新指main及校验。A1 exact e128/baseee84必需五项与Product subset均已实际成功，尚待适用本地回归后裁定合入；Linux probe仅报告。当前A1/A2所在独立树已完整构建成功、按40/40/26文件分组拿一个浏览器名额运行，不与I7整合树混用证据。


2026-10-13 I7 真实静态检查与 W2-10 回归接续：A1/A2 的整体构建成功，106 文件分三批得到 358/358、96/97、176/176，均无取消或跳过。唯一失败属于 A2 的 Cognia HTTP：导入统一后，两次创建同一 Home 的 Host 被 `inference.home_in_use` 拒绝；先做 ee84 干净基线对照，再让测试经已有构造注入共享服务宿主及其动作网关，保留全部 grant/search/read/revoke 拒绝断言，不改变单 Home 执行约束。A1 的 53 文件全部运行通过，确切 e128 head 的五项必需 CI、Product subset 与 Linux probe 均成功，准备按已有授权合入；A2 不提前合。

I7 在已收齐 W3-07/09/10 源码后重新跑完整 health，六项实际失败：Goals 新交付物片段的两处 raw fetch（新文件从零）；新项目调度文件多点名 Feed/Inbox/Schedule；actions.provider_ambiguous 未列入平台码；原 Linux catalog 文件新增 Darwin 真沙箱验收。修复合同：交付物两请求用现有 UiRequest，保留一次性键、确认/未定结果、核对及迟到读保护（W3-10-5-01）；调度复用现有 Feed/Inbox 编排与 Schedule 专属宿主文件，保留无页面启动、身份/权限和清理（W2-18-SCHEDULE-01/02）；平台码登记为当前默认 invalid，保持原拒绝类别；真沙箱场景完整迁到独立 macOS 测试文件，原 Linux catalog 覆盖及 CI 清单保留（W3-07-8-02）。不改 gate/limits 或放宽断言。boundary 单项失败是尚未获批的临时 SDK file 路径与登记表不符，正式换包仍待用户决定，不以登记临时路径绕过。以上修复后的构建、定向回归、动作/资源快照及整合全量均待。

2026-10-13 A1已真实合入：#474确切e128的五项必需、Product subset及Linux probe成功，推送前密钥扫描通过，19:52:33UTC合并为main f2024d6b2。A2改base main并同步f202为16a55971d，Cognia夹具复用服务Host和真实网关后3/3通过、无取消或跳过；原断言不变。完整health及向下baseline更新通过，密钥352新增行无命中，#475已推更新、CI在跑；ee84干净基线实际构建等待contextual全量释放名额，不提前合入。

I7调度门禁修复为968463d0a，平台码与交付物请求为cff53afcb、公开快照ed4375d1b。沙箱测试初搬到新文件被内部导入0→1正确拦下；c6cb71a2f改为完整放入既有独立Darwin的installed-plugin-execution测试，原Linuxcatalog与CI清单不变，复用其生产broker、现行publicHost及同文件dist副本，无新增测试端口。实际health36完整通过，平台码仍当前default invalid；只读复核未发现新增P1，后一测试归属修正补审中。随后8b74a5d48合入A1，43137af1c合入A2，冲突均保留I7业务正文并用现行工具转导入，README保留两边要求。health37相对f202更新成功：695内部引用、93混用进程，raw fetch88、外部插件点名423，基线仅下降。新整合构建/定向/浏览器/全量仍待，temporary SDK单项boundary缺口仍待用户正式换包授权。

A3第三批从16a重跑现行工具，53普通无浏览器/平台专属测试，只改导入；两动态引用分别是functions-system-capability的现行BUILTIN_PLUGIN_CATALOG和jelly-model的现行MolisWorkLocalHost。AST去导入目标后正文相同、语法零错误、工具无阻塞；actual health --update --base通过626内部引用、68混用进程。运行分40/13批，沿用未改生产源码的既有完整构建；还在跑，未以这些源审指标声明片完成。

2026-10-13 A3 真回归结束：40/13 文件实际321/321与104/104，均零失败、取消或跳过。只读核对两动态声明、原测试正文与基线无增长，无新增P1。f3625612d已密钥扫描并推送，开并附加#482，当前叠#475；A2合入后转main并核其CI。Cognia干净对照复用ee84的干净adoption-main-baseline，未修改源码且无活动进程；公共computeBuildSourceDigest与19:09:34UTC完整构建manifest严格一致，实际3/3通过。仅停止Root自己还在排队的baseline54821，不动foreign contextual全量。原迁移唯一失败与修复后3/3的原日志全部保留。

W3-02-H源码继续：删除旧MolisWorkV1Error与platform/errors出口/快照，原第三参数details改为ActionError options.details，无旧导出别名。MCP包复用SDK actionErrorBody，一份formatter处理普通动作/连接/管理的JSON {error,code,details?,call_id?}，保留owner详情，拒绝其code/call_id覆盖，Host只附已留行编号。Goals HTTP catch及已知输入共用SDK，删除transport regex猜kind；实际配置与协议版本检查在owner处携conflict，原8裸输入归invalid，未知内部500。旧event_http等数据式拒绝保留当前code与表示，送共同SDK，改名仍归R1。模块factory可携kind到Host的Goal ActionError。H-01/02/03构建、真实入口、重启及回归仍待。锁工具曾删optional项，已恢复当前完整锁，只保留MCP新增SDK的3行workspace链接。旧API快照删除，含新文件门禁与MCP消费者仍检查，不宣称H通过。

2026-10-13 接续状态：#475确切16a在五必需与Product subset成功、currentmain及密钥核对后真实合入39a1a800c（20:28:54UTC），Linux probe是报告任务。A3 #482已转main、同步39并重生成626/68下降基线为95dad0fff后推送，现等CI。A4从95重测剩余100文件，选51普通测试（4动态引用），导入外正文相同、语法0、完整health/update通过570内部引用/29混用进程。首次测试在导入尚写入时启动，结果废弃并保留日志；仅核对并停Root75645/75678，完成写入后02批重新运行，首40文件已202/202，其余11文件待，未称片完成。

H源码候选6a330c8de，源复核发现Personal测试缺Goal namespace和action-error-edges遗漏旧message/两行协议断言，b7f00b793均修正，保留真实Todo conflict、编号查询及业务断言。f2322857a补公共Host及真实Goals HTTP的400输入/坏JSON、owner版本冲突409/details/实际调用行、内部故障500与业务事实不变。H04含两个新增文件完整health通过，仅源码/静态证据；H05与新测试构建/类型/运行均待。I7仍冻结71405559e等待唯一整合构建15935，不在测试冻结树改源码。

2026-10-13 A4完成普通测试运行：正确02两批202/202与41/41（243条），源码及四动态入口复核无新增P1，3fc5bb4a7已密钥扫描并推送，开并附加#483叠#482，等A3合入后转main、刷新实际CI。剩余49文件按现行工具为23浏览器、7平台专属、4授予相关、14夹具/支持文件和1可选网络实操。C片同为导入机械迁移，将平台专属7文件与23浏览器文件一起收口，生产正文/断言/生命周期保持，源审及静态门禁后仅用隔离Home按整机slot逐组运行；不碰真实Keychain。其余授予/夹具沿D的已有依赖，网络实操在确认其实际外部输入后验证，不以skip补齐实操。H源修复及新增HTTP测试在f2322857a保存，含新增文件H05完整health通过；独立构建/19真实路径回归已排队47546，并在现有临时SDK上验证，正式vendor与上游提交仍待用户授权，保留package/lock临时未提交差异。I7唯一队列15935仍保持冻结。

2026-10-13 C源迁移30测试及1关联支持文件，逐字正文/语法比对与源复核无新增P1；完整health/update通过520内部引用、7混用进程（不是运行全绿）。Darwin首批63条62通过/1失败，唯一Keychain测试与Cognia相同：Web默认Host后又建同Home actionHost，统一模块后正确被inference.home_in_use拒绝。已在Source将带计数的actionHost提前并注入Web，一份Host负责实际HTTP和动作；保留三独立MCP读、未触凭据断言、三次授权拒绝、providerCalls=0、原密文不变及恢复读断言。ee84干净已核构建对照该文件真实通过，修后定向02还在跑；不改生产约束。Keychain全程只用假security/PATH隔离。剩余工具计划18文件，7混用链逐条在D/w2-10-after-c-splits01.txt保存，D/硬门禁与最终全量未结束。

C源候选fd660a3ac固定32文件（30测试、1被现有工具自动纳入的支持文件及baseline）；原Darwin01唯一夹具失败后实际该文件8/8，干净基线8/8，其他6已通过结果不重复相加。C浏览器尚未运行；继承C的D片18个最后入口/夹具先机械转换，C/D共用这些夹具，运行将明确注明组合证据，不能假称C独立运行。四授予调用者沿已完成W2-11的依赖，唯一可选网络用例新导入仅移生产resolver原声明，真实TLS只访问已明示registry.npmjs.org、不调用模型或真实凭据。D之后工具/过程图必须实际归零，E才单独按用户接受收紧到绝对零，source检查不替代完整回归。

D候选3a42f62e7固定19文件（18入口/夹具及baseline），两个动态导入均对应原声明。actual AST正文/语法通过；工具check显示0/899混用进程，report无任何待改/阻塞/附加/错误；完整health/update实际500内部引用、0混用。相关42非浏览器消费文件分40/2在隔离Home运行，含唯一明确启用的真实registry HTTPS探针；未完成，不宣称D运行或W2-10整片完成。C/D浏览器仍待，共用夹具的组合证据将单列。E在独立分支实现用户已接受绝对零：复用同一图与现有报告字段，零以外均拒绝，含未增长、比旧基线下降、改baseline和--update；不放宽图规则。旧测试期望在相同混用基线仍通过的部分改为拒绝，新增实际CLI旧基线/更新不得洗大与真正全零通过；C/D运行树保持冻结。

E真实CLI第二轮32/32通过，零skip/cancel；首轮实际抓到无--base的update绕过绝对校验，已在入口修复为写baseline前无条件检查本指标absolute，不改变其他门禁分类或放宽graph。快查实际移除testImportSplits/Total两键，完整health待最后结束；其余报告保留精确两边路径。D第一40非浏览器文件100/100，第二2文件唯一真实registry TLS探针被当前fake-IP DNS地址拒绝（NETWORK_DENIED），安全拒绝保持正确，不记整批通过；用该测试已存在的明确DoH端口选项只获取可核公网地址重跑，未更改生产或绕过公网/证书校验。结果仍待。

#482 A3在确切95dad0fff、五必需及Product subset成功、currentmain/密钥核对后于21:10:07UTC真实合入main726e281e5（Linux probe只报告）。A4 #483现在转main并同步，冲突按当前门禁重生成。E候选73e6af397七文件，完整health/update相对39通过，快查两旧混用键真实删除，32真实CLI通过、只读复核无P1；整合到I7必须保留它已有browserErrors的update前置拒绝，同时加入split absolute。D组合40文件100/100，后两文件8条7通过1真实公网失败，零取消/跳过；DoH重跑仍TLS连接错误，干净基线同旗标对照未结束。不得将网络或C/D浏览器、H/I7构建/全量标为通过。

公网探针根因已更新：基线同败不能证明环境故障。两份DoH运行均得到93.184.216.34，实际是前一DNS单元测试桩值；全新进程实际解析到VPN假IP，再经已存在的明确DoH端口得到104.16.*及对应公网IPv6，resolver正常。Node测试同一属性两次mock的自动恢复在finally之后又把第一个桩装回默认dns.lookup，污染后续live的默认对象端口。最小test-only修复为先t.mock.reset清空恢复跟踪，再按现有方法还原并syncBuiltinESMExports；所有DNS/SSRF/pin/TLS/secret/cancel拒绝断言保留，不改生产与VPN设置。真实公网固定04正在重跑，未运行完不得记通过。

D公网回归已真实通过：a2525e9c2只增加测试清理t.mock.reset并保留原同步，固定04实际7/7、零skip/cancel/fail，核定公网DNS地址及registry.npmjs.org固定HTTPS返回200。生产网络策略无变。D非浏览器42文件共108条独立用例已有通过证据（100首批及末8的唯一网络重跑），不把历史失败/重跑叠成更多用例。C/D仍缺浏览器组合；源码零混用、健康门禁与公网通过不替代该项或I7最终全量。A4本地2a78同步726后首推SSL失败，已按原密钥/最新main规则重试，成功须读实际工具返回。

W3-02-R1沿§1已接受错误码规则和batchB-plan串在H之后准备：仅Goals事件类当前错误码，按AST把旧前缀保留为第二段 goals.<原前缀>.<原因>，生产方和MCP/HTTP/测试/文档同片更新。不碰持久化业务事件type、历史SQL夹具，不新增旧码读取或alias。R1-01：生产与真实入口拒绝给新owner码，消息/kind/details/编号及事实不变；R1-02：旧码生产消费者归零，原历史event/SQL内容不变；R1-03：真实事件/管理MCP定向回归及H/R整合全量通过后才开验收，机械语法替换或静态计数不足。Root先核每个literal语境再改，当前只读inventory，没有运行或完成声明。H/I7/C-D冻结等待任务不改源码。

R1语法树清点当前308处、140种码、31份TS文件，比历史设计估数多，逐处语境已核：producer error/validation调用、completion reason.code、当前HTTP failure.code与两处读码比较。Governance事件决定与provenance在owner表明确归Goals，同片接续；server连续性只改其消费比较，业务事件type、SQL及历史日志不改。源码已按同一当前词元位置迁到goals.<旧前缀>.<原因>，解析0，新增MCP/Skill说明和README现行码，API快照无变化。真实HTTP/MCP/状态与整合回归仍待，源迁移不算R1完成。

W3-02-R2准备仍沿§1现行决定：Goal/board/planning/guidance/relation/policy错误码按事实owner接续，goal.not_found按计划归goals.not_found，其余保留旧前缀第二段，业务事件type/命令ID/历史SQL不改。R2-01：AST只迁生产错误与其消费，错误类/kind/消息/details/编号保持；R2-02：规划issue公开enum同当前码，API/实际动作快照同步且形状变动按合同规则升版、所有当前消费者同片更新；R2-03：错误与业务type同名的goal.trashed等各证明，历史数据/事件仍按原type，相关真实HTTP/MCP/状态回归后验收。当前清点279匹配词元横跨105文件，包含大量实际业务type，不能全字替换；仅可确定的生产错误集合用于下一轮语境裁决。尚未修改或运行R2。

R2实测生产错误集合50种，134待迁词元；与其同字的7个实际业务事件/读取断言已单独保留，不按279总匹配替换。规划issue的7个公开enum改变输出合同，因此goals.planning.impact、goals.planning.graph.check、goals.tree.check、goals.tree.decide改v2，实际semantic_review的review_action及公开type/schema同步v2，三现行显式tree.check MCP消费者转v2；无旧版保留。具体消费者与实际快照仍需最终构建后的严格对照，未据源改声称完整。当前Source语法、API及health检查继续，原Goal事件type和SQL不变。

A1–A3合入后的Codex合规复查（按systematic-review §1–15）：本批差异实际仅测试导入、构建前提文档和只下降快查；§1–7的身份、注册、事实owner、生命周期及生产边界没有新生产路径，公开声明对原定义、私有项对同文件构建已核，无测试专用API；§8/13没有新增模型路径或SDK依赖；§9未改用户界面，浏览器C/D仍待；§10隔离Home/FileSecrets、Cognia基线的真实build指纹与单Home约束已核，未读写真Home/Keychain；§11工具空计划只证明本轮导入迁移，不宣称全仓死码清理；§12/14 AST正文保留加实跑与CI，Cognia暴露的重复Host夹具按现行合同修正、授权/读回/撤权及持久化断言未放宽，基线与失败日志保留；§15原总验收未全部满足，维护8、SourceI7/H/R及剩余路线未关闭。当前该批没有新增必须修复P1；后续片实际合入后再按其diff复查，不把本批复查扩成新功能完整验收。

R2源码固定dd7db1df3：47文件，134错误词元/35TS迁当前owner；七处同名业务事件/读取保持原值。实际Source health通过（w3-r2-health01.log，零语法错误；非主人码845→781）；Goals/Governance两个API快照同步，四规划输出动作v2及实际review_action/显式MCP消费者同片更新。生命周期与真实Runtime已有测试加R2验收编号，未修改断言。动作快照、全量构建、真实HTTP/MCP/事件与H-R整合全量均待，不据源码提交宣称R2验收通过。

W3-02-R3沿当前错误owner规则接在H/R1/R2后：仅Goals树提案、依赖提案、决定与Governance request错误及其现行消费者，按goals.<原前缀>.<原因>同片迁移；身份/授权/决定动作、存储业务type/SQL/事实与结果不改。R3-01：真实受保护审批/Runtime拒绝给现行owner码，kind/details/编号及拒绝副作用保持；R3-02：按AST核对生产与MCP/HTTP/测试/活文档消费者，旧码无生成/读取兼容；公开schema或API实际变化才升动作版本并同片更新消费者。R3-03：事件/树/管理MCP授权、幂等、原子性与重启定向回归，H/R合并全量通过才验收；当前先清点语境，尚无运行或完成声明。由Root独立隔离树串行写入，与冻结构建队列无修改冲突。

A4 #483已在2026-10-13T21:40:11Z合入main c33448f29bbfa3c0eedc49a8b23bd125da9c4bdd：精确HEAD2a78babc0ec25e8201655cf63f2da7a19bad8551对齐目标726e281e，五必需检查与Product subset实际SUCCESS、fresh secrets通过；Linux probe仍运行，仅报告，不记已通过。A4有效本机回归243/243及源码只读复核保留；C/D浏览器与E零混载整合仍待，不把A4合入当全部W2-10完成。
R2固定源码dd7db1df3已由统筹独立只读核对AST、七业务词元、planning cycle分支、四动作v2与对应消费者/API/文档及health原日志，无当前Blocker/P1；运行证据缺口仍全部保留。

R3源码20e9b32e9固定：148错误词元/32TS、90现行码；AST门禁仅识别其中58码，数据式校验已按实际来源一起迁移。八树提案业务事件词元及三宿主request.in_flight保留。38文件含五现行文档/CHANGELOG与两验收编号注释，身份/确认/幂等/原子写与SQL不改。实际Source health通过（非主人码781→697，零语法错误），API实测零变化；独立只读复核已送。H/R整合构建、动作v2实际快照/消费者与真实入口、全量仍待。

I8接续共享核心整合：新树i8-error-test-import-integration由当前main c33448f29建立，4778d5636合入H/R1–R3与此前I7源码，194a288fa合入C/D测试与隔离夹具/DNS恢复，2e29acd4e承接E绝对零；冲突保留新增业务测试正文并按现行入口重写导入。E入口同时保留I7浏览器程序拒写guard与新增混载绝对零检查，不放宽门禁。实际静态图零混载（967进程），缺的整体构建/类型、MCP/HTTP与动作v2、核心与全量由这一组合统一补证。Root已核pid/cwd/未启动日志，仅取消自己未启动的H47546/82294与I7 15935/78750两个排队构建，组合代替它们，不重复构建；外来全量自然结束，其进程未动，C/D25浏览器已拿到名额。候选SDK仍只在私有临时树引用，pkg1+/1-、lock5+/5-且118optional项保留；上游commit/push/PR与正式vendor替换许可仍待，未动正式vendor。
R3独立源审确认148literal/32TS/90码之外正文仅两注释，2990JS/TS含嵌入脚本零旧错误码；八业务type/三宿主in-flight保留，无Blocker/P1。运行与动作快照缺口继续保留。

C/D冻结ada822a15的25文件真实浏览器组合已完成：w2-10-cd-browser-runtime01.log实际77/77，零fail/cancel/skip，session65943退出0；C 7Darwin63条与D42非浏览器108条既有独立有效证据保留，不重复计 rerun。I8预检01安装frozen/offline/optional通过，整体build退出1，contracts报告闲置导入（原日志i8-build01.log）；未执行后续动作快照/门禁/类型/79文件，不记运行通过。先最小清理编译阻断后整体重建。

I8编译接续：02验证contracts已越过，但Goals报告13闲置import，02b7c66cf仅移除这些绑定；03先单包Goal编译，明确TS4023是公共动作使用contracts私有GoalReadActionInput、插件另有同形输入定义。沿P-MCP的单一合同主人公开现有{goal_id:string}输入到goal-actions subpath，插件import/re-export现行类型并删本地定义，同步API；不改字段/动作schema/运行行为，不增加读取兼容。03仍未整体build或运行，不记通过。

I8源码编译修复固定f2fad9f96：fc1c8b3fe清contracts闲置imports，02b7c66cf清Goal13闲置绑定，7a8903319公开并复用GoalReadActionInput唯一合同/API（插件原类型名作纯type再导出），f2fad9f96标明Coding位置参数_api；动作行为不改。05整体build/API/actions/types实际退出0，四个Goal规划输出已实测v2；另四Goal读/进度动作plugin消费场景及Coding control v2来自既有I7承接，不能误记只四行变化。资源实测十一项超main预算，未写预算；health拒context-onboarding内部import 7→8，未写基线；boundary另发现Goals HTTP SDK未声明dep，候选SDK临时路径也仍待正式许可。79文件真实运行仍在进行，已有失败待末尾完整诊断，先不改断言或生产语义。C独立仅测试分支对齐main a4106442f，正确头版本脚本health降至520/7，密钥扫描通过；#484已开draft并附到当前任务，等完整CI，不提前合。

I8预检05真实79文件单批收齐：658条613通过/45失败，17文件，零取消/跳过。该轮不能验收。按实际源码与独立只读诊断，88dbd9be2修当前kind解析/Agent权威夹具/已退役active入口并声明Goal SDK依赖，d5943e356修六现行入口（可逆plugin create实际actor审计/原四builtin拒绝保持、禁用403、catalog新Session恢复文案、合法token、真实sandbox闭合schema及隔离Home），96a802b1e接SDK真正授权动作链/原current+signal真实Runtime尾检装配、真实Schedule provider通知、SDK编码模型正文、MCP读版本再promote。原低层typed端口permissions=[]保持，T1增加它拒绝写入/编号/事实和通知不变，合法第三入口由真实PluginRuntime的绑定actions证明；不可继续称它为typed写路径。其他backend合法后台行/项目关闭重开与可用性、资源16路径超额、OAuth内部导入等仍待。13修复文件06 frozen96a802b1e，安装/整建/类型/相关运行已单次启动，不重复05的有效无变部分；SourceSDK临时pkg/lock5差异仍只验证未正式发布。

06补验证据：13文件106条98通过/8失败、零取消/跳过，安装/整体build/types通过。16版本前置、两typedAgent、真实Sandbox四保护动作、十个真实Runtime尾检及MCP未来catalog等已有效通过；仍须处理实际出站错误边界、八剩余根因和05未补文件。GATEWAY-MODEL-CODE-01：本地Agent动作网关对已识别ActionError用SDK已支持HOST_RESPONSE_INVALID协议保留原owner code与message，让真实模型上下文与Host诊断一致；取消保留原路径、未知错误仍按SDK现行处理，不扩大SDK任意code闭集。真实Assistant用例须仍断言模型收到schedule.task_not_found与原理由、Host日志及零事实改变。当前Source拟修，未据98通过关闭整条目标。

当前main在执行中独立合入#411情境动作到70c928ae（108文件、含源码/资源/门禁），非本轮Root操作；C #484原a410 CI五必需+Product已成功，ready后因新main变BEHIND，未提前合。C隔离树自动merge新main为2d2a955b，无冲突；03 frozen安装/整体build/health/boundary已通过，当前24文件浏览器（23C+既有D mcp-access，多跑一文件）尚在，不再只引用旧Source的77条证明新main。I8六剩余修复文件07 frozenb0b7d09f1排队等待，Source不改；它含GATEWAY-MODEL-CODE-01本地已识别ActionError的SDK允许失败码保留原code/message，取消与未知错误原样，Goal settings/guidance缺的共同SDK出口亦补齐。06其余失配改按真上下文保留断言（Home Todo page/MCP各自project_id、低typed无ambient权限、未曾授权MCP未知方法）；Pages真实读动作为get，未新增别名。#476独立docs树原97d2 CI五+Product通过但新main落后，已同步到ca0091b28，两doc94新增行、源码与main一致，健康/密钥02通过，推送后重等CI；后五堆叠片仍须按父片/current main验证。

I8合入#411后固定e881c7302并单次排08：新版landing/draft、浮层停留保留，HTTP拒绝继续共同SDK，安全测试取两边并集、S13新增起草/S15原Home权限仍完整；Pages文档级资源与冻结锚点、setDoc/destroy清理保留。08十文件含OAuth真实HTTP/servedScript/情境landing/draft及六剩余入口，现等待外来adoption全量结束，没有动它的进程。独立只读复核另识别同合并P1：callout样式弹层仍绕过showPop（旧pos可留到新文档），已记在待修，须08后接reclaim+showPop并实操补验，不据源并关闭。C新main03安装/整建/健康/边界全过，24浏览器73/73，零跳过取消；#484已推2d2a并等新CI。#476当前ca009两doc94新增行、现行main一致，密钥与健康通过并已推，等待5+Product；#477审发现shape变而留v1，沿现行合同规矩在Root独立树ed5acdfe6改v2/原user受众与校验保留，新增验收编号ADOPT-CONTROL-V2-01；构建/真实动作快照/三既有控制用例仍排队，不提前推新形状或声称通过。

远端#476已在2026-10-13T23:35:16Z以b03a4e839487f5d87eb09404c606e834f0ab009a合入：精确ca0091b28同步70c，5必需+Product实际成功、freshsecrets通过，Linux探针仍报告中。C原2d2a5必需+Product成功，但合并文档片后必须再同步；Root已把#476的两doc合到C为10a85e13b并freshsecrets普通push，源码/脚本/技能/测试与已验证73条的头逐项无差异，因此不机械重跑Source浏览器，只等新头严格CI。I8 e881/08与#477 ed5/预检01仍在同一机器构建队列等待外来adoption全量，未重启或中断它。

W3-02-R4a1接续现行owner命名决定：先只迁私人Session/消息/交接的生产错误及现行消费者到work.<原前缀>.<原因>，在当前main b03a4e83隔离树串行准备。capability/session.create/read/resume、sessions动作与权限名、handoff.goal/project/workspace业务关系、sessions.db文件及历史记录保持；context/workspace跨owner同词码另片按生产方裁决，不能全局替换。本片不新建错误类、alias、schema兼容或维护读取。R4A1-01：真实动作/HTTP/Registry消息和交接拒绝产生现行work码，消息/kind/details/诊断号与拒绝副作用保持；R4A1-02：AST逐词元审生产/消费，公开PrivateWorkContextErrorCode/API同片更新，业务词元与历史SQL保持；R4A1-03：现行Session真实定向回归、资产/健康/边界及共享组合全量通过后才能验收。生产错误写入原库的维护八先在克隆统计并验证，真实Home写入仍按既有待决许可；本片源码准备不冒充数据维护、构建或运行完成。

R4a1源码准备实际完成：118个TS错误词元（105生产/13断言）涉及22文件，另将recoverInterrupted的现行SQL写入码改为work.handoff.interrupted，未改历史查询。AST逆转owner名后22份文件正文一致、解析零；只刷新PrivateWorkContextErrorCode一份API，其他公开快照不变，现行base健康门禁通过。新增R4A1-01标在真实消息撤关联与租约恢复用例。动作/权限/业务type/关系/数据库名保持；数据维护、构建、真实运行与组合全量尚未执行，不验收。D现行main/C同步至c816d570e，重新量得500内部引用/0混载，剩19文件差异；须C先合及新版实际回归后发布D。

R4a2按事实owner收口同词context错误：私人工作绑定产出的context.*为work.context.*；Projects/桌面Panel各自产出的context.*为catalog.context.*；Ledger四种拒绝为context_ledger.*。三类producer与各自当前类型/调用消费者同片同步，传入同一个catalogFailure工厂不改变事实归属；跨owner透传仍保留原码。R4A2-01：真实项目绑定/Panel/Ledger拒绝产生相应owner码，拒绝理由、确认门槛及事务/事件不变；R4A2-02：context.bound/rebound/unbound、目录/关系及业务事件SQL一字不改，错误类型/API同步；R4A2-03：各producer定向真实用例及共享组合回归证明当前消费者，无读取旧码兼容。该片从现行main隔离准备，不修改I8/#477冻结树。

R4a3按已登记Work owner承接Workspace句柄/文件快照校验与Session目录更新回滚的错误：只将workspace.invalid_ref/handle_not_opaque/invalid_path/invalid_payload/change_rolled_back/recovery_required及实际消费者变成work.workspace.*，字段、opaque句柄、安全路径、内容、事务回滚/重试不变。R4A3-01：真实校验仍拒绝路径泄露、越界及错误载荷，目录变更失败仍回滚或明确恢复失败，返回现行owner码；R4A3-02：公开错误union/API及现行比较同步、workspace.name等业务键和历史SQL保持；R4A3-03：真实生产路径与现有断言、资源/门禁及组合全量通过后验收。与前两片共享组合一次验证，不新增测试专用API。

R4a1 b4153282b经统筹独立只读复核：3,099份跟踪JS/TS/SQL未剩21种完整旧错误token，22TS逆名AST一致，HTTP状态/交接SQL/回执与业务词元保持，无新Blocker/P1。R4a2 19a2a9568准备15TS/78词元，独立只读同样无新Blocker/P1，剩25个context业务词元保持；API仅app-host错误union同步，health通过，补工厂透传说明不改行为。R4a3 ac65c8789准备5TS/51错误词元，逆名AST一致、API仅workspace-artifacts错误union、health通过；真实目录回滚/路径拒绝断言保留。三片均未构建或真实运行，不能据静态复核验收。

R4b沿已接受owner规则准备Artifacts首片：Module产出的artifact.<原因>→artifacts.artifact.<原因>，成果文档导入的document.<原因>→artifacts.document.<原因>，已是artifacts.*的现行码保持。生产工厂、HTTP/动作消费者及测试/活文档同片更新；artifact.*业务事件/引用路径、document.id/version合同示例、导入文档类型和历史数据不迁。R4B-01：实际成果注册/导入拒绝使用现行owner码，原消息/kind/details、权限、幂等与读回保持；R4B-02：只迁错误语境，完整消费者与工厂类型API同步，业务与SQL保持；R4B-03：owner真实定向、资源/健康/边界与共享组合全量通过才验收。当前排队期间仅准备源码，不另起构建。

R4a3 ac65c8789独立只读复核无新Blocker/P1：3,062份JS/TS/SQL无六类旧错码，实际路径/opaque/快照、repair/unlink补偿顺序与cause及Files/Git拒绝断言保留，静态证据不替代运行。R4b 2f6dc5def准备71错误literal/14file、两document工厂变artifacts.document，17文件合并改动中16JS/TS逆名后AST正文一致；API0差异、base health通过，9条boundary引用与真实Feed消费保持同一检查，仅错码名字同步，不放宽门禁。artifact.published、document.id/version、DOM及旧库保持；构建/真实运行/资源与组合全量仍待，不验收。

W2-10 C #484已在2026-10-14T00:06:34Z合入main 5c66cf0ab607bf1550287942cbc6011e0559eaf7：精确head10a85e13b对齐b03a4e83，五必需检查+Product成功、freshsecrets05通过；Linux仍报告中。GitHub mergeState为UNSTABLE仅因Linux未结束，其余全部已完成SUCCESS；未忽略任何必需/产品失败。C新main03真实73/73和旧Darwin63独立证据保留，D同步后仍须实际新版回归，不据C合入关闭D/E或I8。

R4c1先按既有登记Characters owner处理五种character错误（not_found/conflict/deleted/disabled/invalid）为characters.<原因>：Module和插件、HTTP状态比较及现行测试同片更新；角色身份、修订号、启停/删除状态、固定成果、授权和持久化业务事件保持。R4C1-01：真实更新冲突/停用/删除/导入输入拒绝仍阻止写入，owner码现行且原消息和事实不变；R4C1-02：producer和HTTP/测试消费者无旧码读取或alias，既有API/action形状无变化则不机械升版；R4C1-03：owner相关实跑/资源/健康与共享回归后验收。当前从main5c66隔离源码准备，不新增构建排队。

R4c2沿登记Agent owner仅迁Molis自有inference错误到agent.inference.<原因>，保留第二段区分执行服务与既有agent.*；SDK原生闭集错误、Run状态/模型协议/事件、dispatch-refusal身份标记及日志历史保持。生产Molis Prologue适配器/Host服务、Unavailable/image前缀消费者和现行测试/活文档同片更新，不改SDK源码或正式vendor。R4C2-01：服务停用/占用、图片/密钥/空输出等原拒绝保持、模型回执和0外部派发/0事实修改断言不放宽；R4C2-02：现行consumer无旧Molis错码读取兼容，外部SDK码不改，API/action形状有变化才同步；R4C2-03：实际Agent/推理生命周期、类型/资源/门禁与共享组合回归通过后验收。当前仅源码准备。

C #484合入后的Codex合规复查按系统整理§1–15：§1–7没有新增生产身份/能力/owner/生命周期路径，包导入迁移保留实际定义及私有构建副本，除Keychain夹具外AST测试正文一致；§8/13未新增模型/SDK调用，文档仅现行构建前提；§9真实新main浏览器73/73保留范围；§10单Home/文件Secret和假Keychain隔离，唯一fixture Host供网页与动作共用、原locked读取/0provider/0Keychain/不改密文断言全部保持，未碰真Home；§11/12/14与Darwin干净基线及真实失败/重跑证据对照，不改产品语义或吞断言；§15仅本片可收口，D/E/I8和维护/后续路线不关闭。未发现该片新增必须处理P1。
R4c1 67081873c（41错误词元/6TS）独立只读无新Blocker/P1，旧5码无残留、API0及health通过；R4c2 bd56ef174（22错误词元/8TS+现行文档/fixture说明）将Molis自有推理码和image_比较归agent.inference，逆名AST8/8同、API0/health通过，SDK原生错误与真实拒绝身份标记/模型回执保持。R4c2仍未运行；D现行5c66同步7cf62dc67，整树与c816d570e一致，42非浏览器+2浏览器新版driver仅准备未启动。I8和#477原等待进程保持，不新增同一构建。

R4c3按现行实现收窄旧计划：kernel.capability_*由packages/kernel自己的类生产、owner表已登记kernel，Coding只是消费，保持；Jelly b23旧生产前缀已随早前F片清掉，不重复迁移。仅Diff的三种unified拒绝→diff.unified.<原因>，Coding图的unknown_node/duplicate_node→coding.diagram.<原因>，对应真实消费同步。R4C3-01：实际hunk解析仍拒坏头/数量不符/空片，图仍拒重复与未知节点，输入/输出和事实不变；R4C3-02：错误语境/API或测试消费者现行，kernel自有码、图节点/关系、SQL业务type保持；R4C3-03：真实Diff/图定向、资源/门禁与共享回归后验收。首片只Diff，图另片，一题一个PR。

R4c3a 09db92c77（Diff8词元/2TS）和R4c3b 9e72f8479（图6词元/2TS）源码准备、逆名AST一致、API0/base health通过；统筹独立只读无新增Blocker/P1，Diff comparison消费按类和原message显示unavailable，图结构及coding.diagram.v1成果类型保持。Kernel自己的三码与Jelly现行prefix已按代码核验保持；这两片仍未构建/运行/资源验证。R4c2 bd56ef174独立只读亦无新Blocker/P1：包含fixture说明共9TS，现行image_消费、singleHome拒绝、SDK原生code/status透传和dispatch-refusal机制保持。只读源码接受不升级到产品验收。

维护八仅准备只读演练：现行Home登记路径及目录克隆确认40份SQLite（含18项目库）共1,138,073,600字节，全部SQLite只读backup逐库一致，非整Home原子快照；不改原行、不读Keychain/明文凭据、不碰历史调用日志。最初全Home递归元数据读取被自身确切pid53964/53947终止，改按现有登记及克隆Catalog列路径，未动其他进程；系统Python readonly在Catalog backup/clone查询失败，当前Node SQLite readOnly成功接续，保留失败日志。仅克隆中已统计94个scalar error-code列：已准备R1–R4映射命中0行，另21行暂不改；58个JSON/自由文案候选字段仍需追到真实producer，J/R5/R6映射亦未全，不能称维护八完成或请求改真库。克隆与scalar-count02证据在当前私有会话临时目录；实际维护按§1等全部rename合入、演练完整、展示条数并得到最终窗口决定后执行。

R5首片仅侧栏Browser的三种page错误为browser.page_crashed/load_failed/blocked_scheme，owner表已有browser；同片更新HTTP/driver、BrowserProblemCode类型、真实测试和工作台崩溃/刷新比较。R5B-01：实测页面崩溃仍提示重载，加载失败仍给刷新，地址scheme/接管/禁用/网站权限/文件限制仍拒且无旧码alias；R5B-02：当前消费者/API同步，其他page.*能力/属性/夹具名称、消息/状态/URL/权限不变；R5B-03：源JS变长以局部变量等价缩短抵消，实测资源预算不增、现有真实浏览器和共享组合回归通过才验收。当前仅独立源码准备，I8/477冻树不改；不会用unsafe模板剥除或提高预算。

R5B源码准备中复查发现撞名：已有browser.crashed是浏览器进程退出，不能给页面崩溃共用，否则stopped会误走重载而非重启。新页面码固定browser.page_crashed，现有进程码/恢复语义保持，API和模板比较同片同步；源逆名证明对同码已有producer也须保留，不只把新码全字逆回。这个候选缺陷在提交/运行验收前修正，不计已通过。

W3-10-5现行程序形态接续：I8合入#411后绝对解析检查拒绝compactScript的split/map(trimStart)/filter/join，导致其父程序集无法展开、已有合法片段被误当完整程序。这不是增加raw fetch许可。BROWSER-FORMAT-01：语法限定该纯逐行formatter，静态计算实际输出并保留每片来源，不执行仓库函数；支持后父程序负责解析、片段不单独判坏，原分片raw-fetch归属/反射/替换/未知动态拒绝保持。BROWSER-FORMAT-02：合法formatter组合通过，新增片fetch及formatter改写仍失败且不能update洗基线；真实current程序展开/等价与既有门禁测试通过后才收口。不采用对未识别文本剥字面量的旧做法、不放宽任何数值或规则。

I8组合增长按实际职责修复：Pages的callout图标/颜色菜单在同一模块提取私有函数，mount继续持有文档弹层生命周期，不新增公开API或资源额度；W2-18-PAGES-CALLOUT-01：A文档弹层关闭/切B后旧按钮不能更改B，B重新打开的按钮仍可正常保存。Schedule旧提醒测试不再import宿主私有reminder adapter，沿真实Host已注册Schedule/Reminder动作验当前安装、200条限额、跨项目、重新安装/原子回滚与拒绝码；W2-18-SCHEDULE-01/02的真实后台timer、等待handler、close/delete撤销及0迟到Todo/收据断言完整保持，registerHostWakeup既有私有引用保留，文件私有引用总数不增。仅重写测试入口，不为门禁新增测试出口、阈值或第二套生产规则。新构建、定向和组合全量未运行。

2026-10-13接续实际：I8 08构建/类型通过，10文件85条中83通过、2失败、0skip/cancel；MCP最后撤 grant 的当前合同返回unknown，SDK nested测试原barrier在实际note写入前未进入，按真实origin beforeEffect修正，尚待重跑。R4八片已收入5bf77084c，main408同步为27f93778e，模型接受点和采用线steer返回处理/安全表/测试清单均保留。现行正式interim SDK安装09完成，但整体build09明确TS2554（switchModel只认单参数），不能把采用线正式包当成接受点修复已交付；此前独立候选仅临时manifest/lock引用，正式上游/vendor决定仍待。浏览器格式化门禁format17实际40/40，但只读复核补出spread赋值仍可能剪枝，修后format18及后续完整health待；format16相对旧f47完整health通过，496内部import/0混载，新main后重新量。Pages与Schedule源修复已保存e61d0a592/f53a0a620，真实运行未记通过。#408已由采用线合入，#477根会话同步当前main283371d23、freshsecrets通过后推送，等新CI，未合。

I8当前资源10实际相对main1a9416ec：共享六客户端各+32、Alchemist+161、Dataset+364、PPT+77、Shelf+482、Todo+117、Workflows+3480、Workbench+2520；更小项待同片下降快照，增长项未update放行。后续仅等价局部标识/重复代码整理和真实资源重测，不改build flags/unsafe程序剥字面量/额度。boundary当前除临SDK未获批路径外，Goals action-only新增SDK依赖未补登记与README；待补现行依赖事实，不给临时SDK改登记。定向10未结束，期间Source/scripts/package/skills冻结。

R5下一片按实际owner表限定installer：安装源/真实Home文件检查、release冲突、uninstall计划和常驻服务计划错误当前共42site/10producer，旧source/home/release/version/uninstall/service统一为installer.<旧前缀>.<原因>保留区别；类型union、当前测试/CLI消费同片更新，不改路径、预览/确认/拒绝、发布物、版本、清理次序与Service生效语义。R5I-01：实际隔离安装、缺文件/旧构建拒绝、冲突/过期计划、purge确认和service失败仍不写不该写的文件/不启停他人进程；R5I-02：现行错误词元无旧alias、API仅真实变化同步，AST逆名后行为一致；R5I-03：安装/service定向与current构建、门禁及共享全量通过后验收。只准备独立Source，不写真实Home、不改正式SDK、不另启Agent/全量。

I8定向10实际394条381通过13失败（0skip/cancel），42格式门禁与Pages callout A→B通过；失败核因后收口：Pages合并后client三处workbench自由引用未随bench改名，导致5真实页面用例打不开；R4动态document错误模板消费漏改；resident成功query无durable row，旧测试误读独立feed.sources.tick，invalid-envelope测试同样不能要求整Home空日志；纯typed无projects:settings不能获得选目录动作。测试改走现行合法入口并仍保留拒绝/0handler/精确操作编号与owner事实。Schedule真实close用例确认旧Feed timer跨多个await重新打开已释放项目：生命周期 AbortController必须在服务/项目关闭前abort、读授权每个await后复查并在后续invoke前复查，后台只用已装配的项目actionClient(false)，不再激活释放实例；W2-18-SCHEDULE-02继续要求released instance gone与0late effect/receipt。R5新增回归fixture误用不存在的page.detach导致cleanup异常，已核仅终止Root自己的泄露Chrome62469与测试child62361，记录该文件失败，改用attach返回解除函数后严格单slot重跑。独立D运行和其他会话进程未中断。

Schedule关闭复核补齐实际入口边界：actionClient(false)仍经prepareHomeActions及LocalHost.withRuntime，不代表不激活。信号须在withPreparedActions等待前后、MolisWorkLocalHost.inspect/prepareProjectPlugins的各等待后、LocalHost.inspect/scene/actionClient进入withRuntime前后检查；用已有真实homePlugins.ready受控等待制造内部prepare→closeProject→release，证明原项目仍不存在及0owner副作用。拒绝的是已取消的原调用，不给未取消的新调用加禁区、不变更权限或新增全局closing状态。

当前main b15ba0b1a已合#477（exact283371d23、5必需+Product成功/freshsecrets227行、02:01:04UTC），#478已与它对账15bf76753，唯一构建driver排队；后续#479–481仍按堆叠顺序验证。I8同步9733efee7保留#477控制v2完整schema；R5I source8516经独立只读17TS86literal逆名一致/API0/health后收入13c041592，运行待。I8生命期修复d135与目标交错4c31独立只读无P1；abf0内联单次私有转发使Host类未增长，health12相对b15通过，正式boundary仍仅tmpSDK路径待许可（未为它改登记）。维护八按真实Alchemist producer补只读studio.sqlite，当前41库；JSON明示37槽2码值、0坏JSON，只有条数不出payload，未改原行/clone行/调用日志，未完成J/R6映射。

R5M仅现行模型连接owner model_provider：model-provider.invalid/unknown→model_provider.invalid/unknown，供应商连接字段、凭据引用、校验/保存/撤权语义、模型参数与SDK原生码保持；R5M-01：实际连接缺凭据/非法协议地址/模型与thinking拒绝仍不覆盖已有连接，正常保存读取保持；R5M-02：类型和现行消费者同片无旧别名，AST逆名一致/API按实际同步；R5M-03：隔离连接/模型设置定向、门禁与共享组合回归后验收。I8 11b排队时只准备独立Source，无并发Agent或真实连接写入。

资源预算收口单独机械片（从I8 abf0c414d固定Source）：仅浏览器factory局部变量/函数用短而明确的名字，字符串、DOM属性、API字段/对象keys、文案、条件/控制流与调用参数不变；跨分片共用标识在同片同步。ASSET-TRIM-01：逆名后的实际JS AST与原程序集一致，短名无既有绑定碰撞，不把属性key当变量改、不借build选项/额外inline资源/unsafe文本剥除绕额度；ASSET-TRIM-02：实际served各路径不超过最新main额度，只下降快照并跑已有选择器、插件客户端与相关工作流/内容/UI回归。暂在独立树准备，I8 11b冻树不改，不能把源码字节减少当成真实资源通过。

资源片Workflows沿现有formatter只删行首空格/tab，替代仅删两个空格；采用已被门禁支持的确切pattern。完整静态拼装的真实factory前后各1程序、0解析错误，含字符串/正则/模板内容的JS AST逐项相同，真实程序少3466字节；不是按未识别文本剥字面量，也未放开formatter接受范围。与局部标识机械片同组验当前字节及动态行为，资源门禁实际尚待。

I8 14完成后解冻：147条141通过6失败；gateway拒绝夹具引用fixture内部look自由变量是测试错误，按返回的saveView/lookView过滤精确操作，0handler/0该操作行保持。Pages真实DOM选区尚未被ProseMirror读入便发Input.insertText，导致Prefix实际追加在旧末尾；修正夹具同步真实selection与编辑器state，再测完整持久化位置，不改期望。Actions选择同样需真实聚焦/选区同步；Browser crash已实际区分page/process，但侧栏未选择浏览器tab使实际按钮hidden，改真实打开再点，恢复消息/真实reload/restart断言保持。S6无评审与管理MCP错误需先取实际run/reply诊断，不增等待或放宽结果。Functions实际入capabilities并不入workbench，Workflows缩行首源码3466字节在served再次格式化后没有额外节省，不作为真实预算通过。五份Coding共同输出+32已只读拆分为Source+10、移除旧unsafe剥除保留模板空格+22，应等价整理局部factory而非恢复剥除。

R6从现行main b15ba0b1隔离准备IM owner片：server自己产生的identity/continuity/server错误→im.<原family>.<原因>，已是im.*保持；Goals或Host回包错误原owner透传，不能全字迁“continuity”业务事件、设备身份字段、路由及SQL。R6-01：真实跨设备/IM身份拒绝、撤权取消、原幂等/冲突/无迟到副作用与原status/message保持，现行consumer仅认新owner码；R6-02：生产及当前测试/类型/API同片同步，AST逆名正文一致、不留读旧码alias；R6-03：隔离HTTP/CLI/IM/存储真实定向、health/边界/资源和共享组合回归后验收。2026-10-11 Q-c已选择维护八一次性改库，源码片只备完整映射/统计合同；历史调用日志不读不改，原库写入仍等全部改名合入、clone演练/条数和最终窗口，不借此提前动真实Home。

J1按已有plugin owner表分小片接续：Runtime/Manifest自己的plugin_<原因>→plugin.<原因>；事件/订阅/port/input-group细分另片，不全局改业务表名、动作id或第三方错误。J1A-01：现行安装/启停/升级/撤权/隔离拒绝返回同一原因的新owner码，原grant、状态机、回滚、消息和无副作用保持；J1A-02：Runtime错误规范化使用已存在的ACTION_ERROR_CODE现行格式，只有现行owner码透传，无码/driver码归plugin原故障fallback；生产consumer/API和测试同步，无旧underscore读取兼容；J1A-03：安装/升级/生命周期真实用例、公共API/health/边界/资源与共享组合回归后验收。将已存last_error_code的完整map交维护八，历史日志和原Home不读写。此片不并入后续I错误类工厂转换，不混淆改名与删类两个根因。

W2-10 D #486在2026-10-14T02:54:06Z合入main 6588ee531c2f89bae87105b1d12d799cf3f4168d；精确head c1d3f000b、基点b15，5必需+Product完成SUCCESS、freshsecrets04扫描835相关行通过（publish03原证据保持），Linux仍报告中。未据D关闭E/I8共享全量。#478现行同步b6350551b相对60b生产/脚本/package/skills零变化，health03/freshsecrets05通过，新CI已触发；第一次误推Root新建分支feat/lingguang-insert-selection-locked，确认exactoid后带lease删掉，只推真正PR源feat/lingguang-reply-preview，未动别人分支或主树。#479实际2/2+health01/secrets01通过，仍待parent序列。

资源第二片ca313bc88的独立只读review发现P1：document全局被当局部缩到docEl导致Workflow启动ReferenceError；已保存6afccfc1b恢复16引用，不新增alias。独立checker全展开359、42受影响完整组合，literal/regex/template/property key与真实声明绑定验证：其余35组合沿第一次有效证据、修后7Workflow组合定向全部通过，未剩P1。Root首次proof错误Source谓词、缓存循环JSON和raw未实际应用映射的逆名导致各工具证明失败，均未据它验收；独立绑定证据经实际diff核对接受。第二片现行Sourceworkbench省2922、Workflow1979、Coding共同timeline省50，真实served/动态仍待。R6 e9eef4758经独立5TS/43literal/28map逆名、全源码旧码0/API61快照匹配/healthowner下降38，无P1，仍仅Source接受。

J1B仅Plugin Event Bus及port/input-group真实生产码归plugin：event_*、subscriber_*、port_*、input_group_*分别保留family为plugin.<原原因>；J1A已经改完的plugin_前缀不重复。J1B-01：事件发布拒绝、订阅撤权、未知结果隔离及显式恢复仍保留游标/安装世代/0迟到副作用，现行owner码从原类/回包贯通；J1B-02：端口/输入组仍拒不匹配、过期输入与外部固定成果，原版/对象与SQL/业务事件名不变；同词payload_invalid只在PluginEventDeliveryFailure合同和生产消费里迁，不改其他owner的同词码；J1B-03：类型API、实际producer/consumer无旧alias、原正文逆名一致，现有事件恢复/连接和共享全量/资源/门禁通过后验收。持久cursor/error字段完整映射交维护八，历史日志保持。这份Source依赖J1A c4205ad21，不提前运行或合并。

J1C处理监督器自己的启动/撤销/发行物缺失与依赖诊断九码：静态capability/port/dependency诊断是Plugin Runtime装配的事实，归plugin.<原原因>，不改真正缺能力的合同名或动作。J1C-01：实际监督器只启动依赖满足且未停用的实例，循环/optional/self/port诊断、显式恢复与发行物缺失给现行owner码，装配顺序/隔离/授权/版本保持；J1C-02：仅生产码与类型/当前consumer同片迁，原正文和SQL一致、API按实际更新，不兼容读旧码；J1C-03：依赖解析、停用/升级/发行物真实回归及共享组合/health/边界/资源后验收。J1C依赖J1B，仍与真正模型、外部driver错误码保持各自owner。

J2首片只ConnectorHost五种唯一connector_错误→connector.<原因>，连接存储/MCP的invalid等同词另按类范围处理。J2A-01：真实driver缺失/重复、连接撤销、超时和失败仍保持原拒绝、receipt/RawEvent校验与timeout清理，当前消费者比较新owner码；J2A-02：producer及当前consumer无旧码alias，AST逆名正文与公开合同保持、API按实际同步；J2A-03：Feed接收链、ConnectorHost/Runtime真实定向与组合回归/边界/health后验收。类仍保留至I统一工厂，不改OAuth、凭据、协议参数、授权和真实连接，不把source存量/裸driver错误当此五码全字改。

接续Source候选尚未运行：J1A c4205ad21的独立复核抓到Studio模板内consumer漏迁，已用1e0a396a1/45954dfbf修正e.code、既有discard实操编号与局部apply闭包，现行51file；旧词元AST扫描不能证明模板consumer齐全，保留该失败而非称首次通过。J1B abb135aca为14TS102literal/25码、3API及baseline18file，正文逆名同/API只更新plugin/events/wiring错误union、healthshape/owner进一步下降39，未用payload_invalid只合同位置归名，没有虚称producer。J1C 09b2e433a为7TS34literal/9码、API0/health通过，已串行带入Studio两修复成为c739e5531；返回对象code门禁看不全，所以这片不虚称指标下降。J2A fc35ce07e为5码19literal、public driver缺失/重复/坏RawEvent/revoke后0poll真实断言准备，3file/API0/health下降10；全部仍待新整体构建/运行，不提前发表为完成。统筹传达用户优先次序#487→Grok Computer Use→Codex内各PR：#486已在此前合入，Root此后暂缓#478–481/#490/新片的main合入，CI与现有回归继续，不中断其他进程；Grok具体标识待统筹定位。

J2B只ConnectorConnectionError四个bare码改connector.connection.<原因>（invalid/not_found/service_mismatch/disconnected），生产构造、类union及按该类识别的两个HTTP/动作消费同步。J2B-01：实际连接不存在/选错服务/无效或断开凭据仍拒绝，404与400及原message/secret引用/无覆盖保持；J2B-02：只在本类错误语境迁同词，disconnected状态、invalid输入标记及其他owner的not_found不改，API按实际更新，不读旧bare码；J2B-03：真实隔离连接创建/撤销/持久化/HTTP与组合回归、类型/health/边界后验收。与MCP错误分成独立片，防止两处disconnected失去区别；本片不读真实凭据/Keychain，来源存量码的维护八独立演练。

J2C只McpConnectionError四码改connector.mcp.<原因>（configuration/authorization/disconnected/provider），按类构造、union和真正HTTP错误消费迁，不改OAuth code字段/授权状态/模型provider id。J2C-01：服务地址/凭据/授权state拒绝与实际MCP重连仍按原status/message生效，authorization依旧401、provider/配置400，外部ActionError事实与模型授权检查保持；J2C-02：内外各错误语境现行同步，不改disconnected连接业务值、不读旧bare码alias，API按实际更新；J2C-03：隔离本机MCP/OAuth/目录与真实重连用例、构建/类型/health/边界及组合后验收。Http把actions.reauthorize映射为本入口授权码的已有行为保留，仅结果码归当前owner；不借此新增产品授权或远端连接。J2C依赖J2B。

J3A首片只SourcesError三种source_错误→sources.<原因>，Module/contract与按类比较的Feed/Host消费者同片迁，Feed自己的feed.source_*保持，connector_disconnected持久状态码留下一实际归属片。J3A-01：真实来源不存在、计划无效、非法转换仍拒绝，删除历史处理/Source事件/同步撤权与回执不变，Feed现行出口仍是既有feed owner码；J3A-02：Sources真实producer及consumer仅认新码、public union/API同片同步，AST正文/SQL/状态不变且不留alias；J3A-03：Feed/Sources真实定向、shared构建/类型/边界/health与组合全量后验收。不能把source_not_found工厂方法名当错码全字迁，不动真实Home。

J3B只ListenerHostError四类listener_码→listener.<原因>，租约/Connector失败/RawEvent投递失败及隔离consumer同步。J3B-01：真实隔离/租约占用/中断与重试仍拒绝同一错误，游标/已有Signal收据/撤权后0写入/恢复不重复保持；J3B-02：contract union、生产与测试现行同步、AST原正文和SQL保持，不改表名/phase及其他owner外部码；J3B-03：Listener真实生产链和重开回归、API/health/边界及共享组合后验收。persisted动态connector_*与process_interrupted两SQL写点另片按实际producer处理，不用本四码冒充全部存量维护；本片依J3A且不写真库。

J4按登记scheduler owner迁Scheduler自己的五个schedule_*错误为scheduler.<原因>；Schedule插件的schedule.job_*保持，边界仍将Scheduler拒绝转成本插件同一既有动作错码。J4-01：真实handler缺失、job不存在、无效输入、最短间隔/路径拒绝仍无越权/迟到副作用，job状态/租约/取消/重开和原消息保持；J4-02：producer/classunion/currentconsumer与诊断测试同片迁，typed capability和持久业务状态不改，API按实际同步、无旧码alias；J4-03：Scheduler identity/Timer/Reminder/操作与shared组合回归、构建/类型/API/health/边界后验收。源码改名不冒充Schema升级或原库维护。

J5A先Alchemist domain四类（候选牌、机会、记忆规则、批注/改写提案）的UPPER拒绝码为alchemist.<原码小写>，唯一producer及真正server/client/test消费同片更新；状态/事件type/成果ID/Zod custom码不改。J5A-01：真实候选牌重复保留/恢复、机会非法转换、规则/引用和已处理提案仍拒绝，不重复建Idea/版本/事件，用户文案及原中文恢复说明保持；内部super(code)的机器message随码改为现行词元，不能宣称这个字段字节未变；J5A-02：类别码/error.message条件消费者同片现行，原业务AST/SQL/成本与模型派发保持、类型API按实际同步且不留旧码alias；J5A-03：Alchemist真实动作/重开/UI及shared回归、health/边界/资源后验收。研究执行、HTTP body/422分类与类收敛按下一独立片处理；存量map进入维护八演练，原库与历史日志不动。

J5A源码保存`d2031d2ed`：15个封闭domain码，17TS最初47 literal及两裸字典键同片改为alchemist现行owner。原中文提示/409拒绝由真实workspaceProblems消费，裸key漏改已修；既有production action二次apply/resolve断言现行code和准确中文，重复Idea/版本、规则/机会状态约束保持。完整3101 JS/TS/SQL旧15码raw0、public API变化0、health03相对当时main通过。源码逆名仅证明原47 literal逻辑，新增字典键与动作断言另复核；包内Vitest/隔离Host与共享组合尚未运行，不记J5完成。J3B现有真实lease/quarantine回归补验收编号`79e05aef8`，没有新副作用或弱化断言。

远端PR排程按用户经统筹确认：#487优先，之后Grok负责#479–481及Computer Use后续，Codex新PR排后。#478实际由其他执行方于2026-10-14T03:26:21Z先合（merge5dcdc3045），本线未执行这次merge且不撤销其成果。#487新head abe06ff检查仍在，旧head的成功不能沿用；#479已由Grok更新597bf044并转main，本线独立d0b66候选不推送覆盖。已存在唯一I8非浏览器15与浏览器16队列继续等待，不重复启动、不停止他人全量。

J5A只读复核确认family-prefix遗漏：OpportunityTransitionError新message不再匹配旧OPPORTUNITY_，原adapter会丢失原因。`c4024320b`改为按真实domain类透传现行message，尚有producer的repository NOT_FOUND类仍保留；既有production opportunitySave后第二次save断言准确owner/code及原中文，真实pulseReports读取对象不变，再继续原convert幂等验证。源码候选无新增兼容、API变化0；实际build/Host/Vitest运行待，不能据此提前验收。

J3C收口运行及存储producer：ConnectorPollResult现行六种failure产生的运行码改为connector.<failure>，保留failure枚举/receipt结构不变；Listener自己恢复进程中断→listener.process_interrupted，Sources连接状态写点→sources.connector_disconnected。只改真实错误列与现行工作台rate-limit消费，原业务phase/outcome/status、事件type、凭据引用和历史SQL夹具不改。J3C-01：原拉取失败保留checkpoint、重试时间/Inbox去噪及准确owner码，真实连接断开/恢复保持Sources状态与错误列，Listener重开中断恢复仍只发生一次；J3C-02：动态六码、生产SQL两个中断写点与currentconsumer/文档/测试同步，公开API按实际更新，无旧读取alias；J3C-03：真实Feed/Connector/Listener/Sources隔离重开链、构建/类型/API/health/边界/资源和shared回归后验收。已存行维护八仍在克隆列条数/演练，原库与历史调用日志不动；此片依J3A/B且后续合并服从487与Grok优先。

J3C源码`9e376f3bb`保存14文件，六码动态producer、两SQL中断写点和Sources断开列已迁现行owner，工作台只按connector.rate_limited读retry_after_at，原其他业务枚举/row状态/receipt不改；真实Listener失败/持久化/回放/重开与现有connection断开恢复断言已备。public API01匹配61快照2329声明、health01相对当前main通过，仍未build或运行、只读复核待。维护八仅扩大只读克隆统计：41库99scalar错误列，包含新候选映射后已知旧码拟改6行、其他15行暂不动，58JSON/自由字段仍须producer确认；原行/clone行写入0，调用日志未读改。这是候选条数，不是最终真库方案或维护完成。

J3D仅收Feed本身剩余固定码：演示种子写入及首页消费的auth_required→feed.auth_required，fixture结果记录→feed.fixture_not_live，publicError fallback→feed.unknown，删源已过schema的内部合同拒绝→feed.contract_source_history_decision_required。J3D-01：现有demo来源/故障与首页去重的已知提示保持，真实fixture同步保留既有last_outcome completed与非空非live错误标记，不能据它宣称真实Provider完成；无code publicError仍原unknown分类/安全消息，删源内部校验仍拒绝且0删除；J3D-02：只在错误词元语境迁，reauth_required连接状态与所有事件/业务名保持，测试历史旧码禁回流列表不改成现行码；J3D-03：现有Feed/首页/seed/删除真实回归、类型/API/health/边界/资源及shared组合完成后验收。此片沿J3C独立Source树继续，当前不写真Home、不同步正式SDK。

J3D源码`8b040a4be`保存7文件，四码8 literal及当前内部拒绝regex同步；现有Home fault去重AC与publicError未分类失败的准确fallback断言保留原语义，public API不变、health01当前main通过；只读复核与实际构建/运行待。维护JSON06仅克隆中37个明示producer槽的2个text码值，候选映射命中1值、0坏JSON；unknown07只将15标量未匹配行对照现行源码词元，3行reconciliation_required为真实Feed错误列却与外部outcome同词，不能全字改状态。

J3后续源核发现必须区分外部现行码与平台错误：intelligence-client0.2.2现行receipt/StopReason及其错误对象用bare闭集码，Molis source-sync-result 与 connector-sync 的旧safe-code正则却丢弃现行点连接owner码、fallback自写provider_interrupted/provider_failed。公开来源持久码与RSS分类/消息按实际producer边界另片收口；原外部receipt/outcome/预算与SDK词元不能全字替换或当作历史读取兼容。当前只读调用链和包公开types已核，无该片生产编辑，待补完整验收与统一转换取舍后执行；存库现行unknown码不能为满足raw0清掉。

J3E按R4C2已接受外部SDK词元边界继续：保留intelligence-client现行bare receipt/StopReason/错误码，原RSS针对其feed_parse_failed等分类与安全中文仍认当前外部合同；只修Molis旧safe-code正则丢弃已现行点连接owner码以及自己生成的provider_interrupted/provider_failed/reconciliation_required/cancelled错误词元。J3E-01：真实公共来源或账号同步发生现行owner拒绝时，run/source错误码准确保留，权限/取消后的0迟到写与原可恢复语义不变；J3E-02：未知/不安全外部值仍采用原安全fallback且Molis自生成码变feed.<原因>，result.outcome/外部receipt/stopReason保持不变；J3E-03：真实RSS/公开/Connector失败、恢复/幂等与shared组合回归、类型/API/health/边界后验收。唯一共同安全提码由Feed私有helper负责，公开API无新增；外部码原样保留不是历史兼容，维护八只迁确切Molis自写fallback映射，不迁外部现行码。

#487于2026-10-14T03:50:10Z合入703bd996a：精确abe06、Verify/Package boundaries/Secret/Rust-Swift/Shell-Python及Product全部SUCCESS，MERGEABLE、最新main5dcdc祖先、fresh secrets02四新增行干净；检查树只settings-assistant及实际资源预算两文件，无生产冲突。Grok随后负责479–481/CU，本线后续PR继续让序。

J3D只读复核发现内部合同bare new Error迁为点码后撞现有“owner失败必须声明”断言，采用已有feedErrors增加contract_source_history_decision_required/internal：保持原内部500且现行码不再fallback，真实删源坏合同仍0删除；HTTP输入已有schema拒绝不变，精确声明/status/API和现有业务测试同步，不放宽STAYS_BARE或owner未声明断言。

J3D内部合同复核修正`a7cdfa252`及`15a6e0818`使用现有feedErrors/internal、原500及准确生产retireSource0事实变化断言，移除其bare豁免、保留无声明owner gate；API02仅modules/feed现行reason新增1，health02通过。此前8b040状态仅Source候选，新片实际build/合同/运行尚待。J3E源码`ef4bef707`后夹具端口补齐：只共用Feed安全提码、现行owner点码保留、原外部bare码/Receipt/StopReason不改，fallback点码独立；真实公开来源与Connector恢复用例准备，API01/health01已过，未运行，不能称外部网络验证。

J6先沙箱自身固定拒绝码：实际SandboxError构造、Host给worker的固定SDK错误和worker自己的固定安全拒绝→sandbox.<原码小写>，仍由现有SandboxError携带trusted outcome unknown。J6-01：真实Seatbelt/IPC/queue/network/schema/timeout取消拒绝及0越界文件/网络/后续副作用保持，Host trusted unknown仍隔离、worker错误不获unknown身份；J6-02：仅沙箱自有码与现行consumer比较/测试预期迁，第三方插件contract.operations.errors的自有码及errors.example不能全字替换，native系统/private DNS sentinel另属本来边界保留；若同一旧词元也用于插件自定error，按实际raiser/consumer定域。J6-03：现有macOS真隔离、队列/撤权/取消/安全及明确网络回归，API/health/边界/资源和shared组合通过后验收。Studio正用的安全adapter同片消费更新、相关replay按项目必跑，不增加生产错误类/SDK/vendor依赖或放宽门禁；源码准备不当安全实操通过。

J6源核细化owner：仅packages/plugin-sandbox内部固定码归sandbox；Studio adapter同类拒绝按现行登记归plugin_builder，installed-plugin-host固定拒绝归host，GONE消费真实sandbox码。SandboxError是传输类不是事实owner，不能因同一类把Host错误改成sandbox以违反owner表。Agent prologue-mcp及external-mcp-dispatch的CANCELLED是SDK现行外部码保持；测试worker forge payload保留故意伪码，真正声明插件errors保持其自有码，不把消息信任/未知outcome边界改成兼容。

J6源码`cf94badd1`固定15文件：39Sandbox内部码与Host/Studio分别按sandbox/host/plugin_builder造错，13TS173 literal；GONE现行consumer同步，Prologue SDK CANCELLED及DNS PRIVATE_ADDRESS内部sentinel保持。原trusted outcome unknown/不确定后0fallback写入保留；真实worker伪造旧码负例外新增准确现行sandbox.service_timeout负例，二者都无unknown且plugin_error，不借旧码回归漏掉现行forge。API01公开61/2329匹配、health02相对actualmain703通过，shape/owner分别降低120/116，不改任何gate规则或阈值。只读审查在途，macOS真实Seatbelt/IPC/network/撤权/重开与Studio replay未运行，不记安全或J6完成。

J5B沿已接受改名只收Alchemist七个服务封闭错误类的固定码：CancelLensRunError/ResearchPlanError/DecisionServiceError/IdeaActionError/OpportunityActionError/StartLensRunError/StartPulseRunError实际枚举与造错迁alchemist.<原码小写>（原同词共owner保持），当前service/query/domain/client/test消费者同步。J5B-01：真实research计划/预算/模型选择、当前Idea版本/正式决定、候选missing/已保留、取消及机会不存在的拒绝仍保留中文/status/成本与0重复事实；J5B-02：状态gate对象code可跟随错误码但业务reason/outcome/event/SDK字面量不改，by-prefix按本类或现行完整码收口，裸workspaceProblems键及原NOT_FOUND消息分类逐项同步；J5B-03：Alchemist各真实动作/计划/决定/取消/持久化与API/health/资源/组合回归完成后验收。Job执行/SourceHttp/通用OperationError广码及HTTP422收敛下片，先不新建类或fallback兼容、不改已有运行记录行。

J5B生产scope已按实际七类闭集补全：new literal17码之外，DecisionServiceError的动态gate.code还有三个真实union/对象码，总20码75 literal。当前Opportunity repository通过确切三个现行message识别，domain类仍本类识别，不保留已迁旧prefix；Pulse classifyError尚有其他现行PULSE_* producer，只新增本片确切两码保留现行原因。workspaceProblems目前没有PULSE_REPORT_NOT_FOUND键，本片不新增无效status分支，原其它未迁upper NOT_FOUND按现行分类保持，避免扩大语义。

J5C收Alchemist其余自有运行/HTTP输入/Job/SourceHttp/复用及裸内部合同码，固定自有UPPER词元与自有动态RESEARCH_SEARCH_映射为alchemist.<原码小写>；不改外部SDK或搜索供应商原码、模型协议/error_code字段、Job.kind/业务phase/event及用户中文。J5C-01：原真实取消/租约/重开中断、来源网络/解码/大小拒绝、复用权限/版本和HTTP input仍同原因且0追加事实/0重复收费，machine message/code及job_events.payload_json.errorCode现行一致；J5C-02：仅生产造错、状态gate/code字段与本类消费者迁，prefix/regex/字典key/status按完整当前映射同步，原未参与错误的常量/文案不改，不读取旧码兼容；J5C-03：Alchemist native Vitest/真实Host/生命周期/网络边界与API/health/资源/组合回归后验收。HTTP body和422按原已接受共同错误模型下一I片收敛，J5C不顺手改status/API schema；新源码映射为维护八候选，克隆先辨外部producer再演练，真库仍待窗口。

J5C只读producer辨别：OPENAI_*与OPENAI_HTTP_*及REAL_RESEARCH_RUNTIME_DISABLED仅有Alchemist两个classifyError旧读取点；现行Host Prologue调用链、当前正式包636 JS/TS及本地Prologue均无producer，独立复核确认已退休adapter残留。本片删除该旧读取分支，沿当前alchemist.ai_runtime_failed/research_runtime_failed处理未知失败，不增加历史compat。HTTP method HEAD/OPTIONS/PATCH/POST、NOT_FOUND后缀分类及PULSE_/REUSE_消费者前缀不当固定错误字面量改名；需要随本次自有producer迁移的prefix只在具体classify路径处理。

J5B源码`f363fe95e`/`061498455`20码75literal保存18文件，API01不变、health01通过；独立只读核真实domain gate动态码、repo/adapter、原中文与404/409/422保持，无P1。实际actions二次决定仍精确原因与中文且真实decisionList只有原ID一行；未运行，不记验收。J5C源码`b84066395`保存53文件：93固定自有码212literal/key，加实际Host动态search码、prefix/regex/status consumer，Job scalar与camelCase JSON payload同码断言、客户端无模型提示及结构化输出预算原断言保持。退休OpenAI分支删除，已有历史运行报告/归档JSON不篡改；API02与health03通过，资源仅local binding三引用等价抵增长，实际byte/build/Vitest/Host/UI尚待，只读复核在途。J6 `cf94badd1`源码独立复核接受，无P1；真实macOS安全回归仍待，不把Source接受记安全验证。

J7A仅Host尾部两个现行固定码：登记catalog owner的project-database.ts恢复错schema→catalog.project_recovery_unsupported_schema；Host自身ProjectDeletedDeferred代码字段→host.project_deleted_deferred。J7A-01：现有existingOnly恢复拒绝不改user_version/表/原字节，缺库原IO仍拒绝；项目删除owner不可在本进程清理时仍按原pending/elsewhere留收据，不能改成失败或提前删除；J7A-02：现行producer与真实consumer/测试精确码同步，构造message字段若原同code则随当前词元，classes/其他owner字面量不改，无读取alias；J7A-03：真实错版库与删除/常驻服务/CLI-MCP重开回归、API/health/boundary/shared通过后验收。Deferred是原跨进程控制状态类，I片按真实语义裁决去留，不能仅为类数量把它变一般错误。两码不涉及真实Home维护写入或架构迁移。

J7A候选`677faee30`三TS三literal及原错版库AC/快查基线保存，API01不变、health01通过；只读复核与真实回归仍待。当前所有J/R候选尚未在I8统一整建或真实运行，不把单片源码与静态通过混称整线完成。

J5C与J7A独立复核收口：J5C b840/096无P1，51TS中40独立逆码AST同，动态search/prefix/NOT_FOUND/status及退休adapter删除另逐项核，当前client两个完整String.raw逆三绑定/目标regex后字节同、源码共减4；仍不替代served预算或运行。J7A677/7c55错版拒绝只读路径与原Deferred instanceof/elsewhere均核，shapeOf只证明schema形状，不能写成独立字节实测。维护统计08初把auth_required当唯一映射，但它也是当前外部intelligence码；09已剔除这条全列映射，保留6已知候选/15其他，须基于确切seed/source producer再决定，未写任何原/clone行。

W3-02-I1按原I路线先收成果/过程项owner工厂：modules/artifacts的闭合集合从自定义ArtifactsError及可注入errorFactory改为contracts现有defineErrorCodes("artifacts.artifact", …)，直接声明全部现行19个原因，Host两处装配不再选择错误类型。为使结构片不附带未经裁决的响应变化，本片沿实际当前共同出口的invalid→400分类；not_found/conflict/forbidden等分类改进不得以重构名义静默加入。I1-01：公开ArtifactsModule与ProcessItemsModule真实注册、冲突、授权拒绝、状态修改只抛共同ActionError，现行code/原中文/details/400保持；原拒绝后的版本、事件、owner事实不变，幂等重放不追加。I1-02：删除类、factory类型/default及options注入，所有当前调用方与测试同片更新，模块入口无历史alias或Host重建，公开接口的删除在PR说明；不动表schema/业务type/合同版本。I1-03：整体构建后执行artifacts-module、artifacts-actions、plugin-artifact-client、personal-artifact-owner及过程项实际回归，health/boundary/API/动作/资源与共享全量通过才验收。先在未受测独立源码树准备，I8诊断15/16受测树保持冻结；本段计划不是运行通过。

I1候选bd028a283（main703+既有R4b命名片fd7e）保存9文件净删14行：Artifacts闭合19个原因由本包defineErrorCodes，类/工厂及注入接口删除，两Host装配不再选择错误；现行所有kind沿invalid保持400。原真实注册、不同内容拒绝、坏digest及未授权共享用例继续检查共同body精确码，拒绝后原版本/事件逐行不变；API01 61/2329不变，health01 merge-base比较通过且Error subclasses84→83。源码独立复核在途，实际工程、Host/ProcessItems回归未运行；Source统计不抵I1-03。

W3-02-K1按原K路线先收六个server副本：workbench renderer/document-shell/Feed/Inbox/Schedule projection及desktop capsule，全部已有design-system依赖，公共html.escapeHtml先补单引号为&#039;并将输入签名对齐实际unknown/String(value??"")，才移除副本用包出口。K1-01：&、<、>、双引号、单引号按同一函数转义，攻击片段落在文字与单双引号属性值时不产生新标签/属性，原正常文字和属性DOM值保持（单引号实体编码变换沿原计划）。K1-02：六副本删除，真实public render路径与空值/数值/布尔保持，不处理结构化safeJson，不新增helper或依赖；Work server两个&#39;副本及Goals history新回调另片，Pages/Work/搜索浏览器副本仍按W5-04，不将未处理说成全归零。K1-03：整建后primitives、workbench-ui-platform、capsule、visual-foundation、Feed/Inbox/Schedule真实相关回归，实际served资源全预算不增长；API/health/boundary及共享全量后验收。I8受测冻结不改，本片在独立树只准备Source。

I1 bd028独立复核Source接受，无Blocker/P1：三生产文件26 raiser、19原因的code/message/details逐序同，事务/拒绝/SQL不变，原HTTP未分类invalid同当前显式invalid；shape本片不变，owner计数下降含带入R4b，不误归改类。K1 46f31a658六server副本删除、公共单引号先补，11文件净删11行，API01不变/health01通过，只读复核在途，真实构建/DOM及资源测量未做。Work/Goals与browser副本余项保持，不把六副本称全仓归零。

诊断15/16已实际结束（非通过）：非浏览器18条16通过2失败，浏览器11条9通过2失败，均0skip/cancel。gateway fixture返回值修正和browser真实选择tab已通过；余Pages两项是测试访问pmViewDesc.view.state不存在，旧undefined==undefined并非View复用证据，改确切DOM身份及真实箭头按键同步，保留同文档映射锚点/两个精确unchecked任务和更改后拒绝SQL断言。管理MCP新取reply证实已有Board二次初始化应拒绝，本夹具对齐Catalog实际person/title/key作幂等重放成功与0重复事实；S6 provider请求0，旧诊断GET不存在，改现行session GET取run状态，不加超时或放宽审批。18与独立Pages19定向实际在跑，受测树各冻结，未计修复完成。K1 Source独立复核无Blocker/P1，六消费者AST去函数/import后相同；DOM/served/工程仍待。

21真实Pages/PPT/Lingguang8条全部通过，0skip/cancel：同编辑器DOM身份、A→B零写、同文档原锚点映射、精确两unchecked任务一次插入与改变frozen拒绝实际SQL均过。20实际6条5通过1S6失败：管理四条含真实常驻alias/幂等重放/编号/原拒绝及S5完整材料持久化重开通过；S6新增诊断证实provider仍0。进一步读当前安装SDK：anthropic-compatible将body TextEncoder.encode为Uint8Array，node-outbound原样送fetch，问题是夹具仅认string而非Request本身；22以标准Request(input,init).text()统一读取现行BodyInit，精确endpoint/noexternal约束保持。既有19新树缺dist是0业务环境失败，不能抵21。未把S6或整建/共享全量记通过。#479由Grok于04:32UTC已合964841211，后续480/481/CU继续在前。

W3-02-K2接K1，仅Work server UI的ui/render嵌套函数及ui/terminal副本使用既有design-system出口；两处原&#39;改共同&#039;，DOM文本/属性值等价，方法/信任槽/模板控制保持。K2-01：真实Work会话标题/内容和Terminal Goal标题中的五字符不产生标签/属性，原文字保持；K2-02：删除两副本且不加依赖/浏览器打包耦合，原terminal/client浏览器副本仍待W5-04；K2-03：整建后work-session-ui、work-terminal-client、相关实际页面/公共预算/共享回归通过。Goals history新callback目前无design-system依赖，独立按现行声明边界处理，不为删副本夹带新插件互依赖。

24实际S6全链1/1通过，0skip/cancel：正确BodyInit与SDK wire read→write→三轮受控模型、本人口审批后效果settled、盘字节与index、Coding固定变更、Git暂存审批与最终index、两份固定Diff逐字均保持。前23因把Host read-file许可当wire名仍失败，最终当前映射read-file→read已核production，不绕过SDK观察保护。七个test/fixture修正保存f4f94a4de，tmpSDK不提交。K2 a65c533独立Source复核接受，真实工程/预算待组合。

I8组合25已启动，当前2e3c4d9bc同步main964并顺序纳R6/J1–J7/I1/K1/K2；878改动TS parse0。真实冲突保留全部本线新安全和生命周期条件：Plugin wiring manifest读取权限、已抽出升级清理屏障、Scheduler独立fire/close拒绝、Alchemist life取消与actor-actions，Artifact仅删两注入，settings共同request.show保留编号，不恢复旧内联实现。四cross-entry scheduler旧断言同步当前owner码。派生baseline/API/actions/资源按最终Source测量重算，未接受任何数字增长；36现存定向文件随后运行，install已frozenoffline成功，整建/实际资源/运行/共享全量未记通过。受测树再次冻结，SDK正式上游/vendor仍待原问题回答。

W3-02-I2接原I收Governance工厂，依赖R3现行Goals码，范围仅governance-collaboration、一个Host装配与现行两测试。保留已登记Goals owner（不改提案事实），Goals tree提案/事件决定/request的现行原因用defineErrorCodes声明invalid，原共同HTTP400保持；state-machine遗漏的governance.transition_invalid沿现行owner表迁为goals.governance.transition_invalid，状态转移拒绝/详情/消息不变，完整消费者同片更新，不添加gate例外。删除GovernanceError/factory/options及内部helper参数，无alias。Provenance多问题聚合用明确有限原因对应的owner raiser，原排序/消息/完整details.issues/path/recovery原样，不放成任意字符串工厂。I2-01：真实来源输入与可信用户来源拒绝精确code/message/details、输入不变、0无授权决定写入、原幂等拒绝及事务不变；I2-02：全现行consumer更新共同ActionError，Host不再选类型，公开模块删除工厂声明说明影响；I2-03：整建后governance-collaboration-module、governance-provenance、goal-events-state、goal-tree-event-flow及可信身份/approval真实相关回归与共享全量通过。先独立树准备Source，I8冻结保持。

25整体build/API/actions/health及实际29资源预算通过（10013459 bytes，全部较main不增长）；typecheck:all在boundary阶段失败、尚未到workspace:typecheck，单独boundary同样失败。原因除独立tmpSDK路径外，Artifact旧结构规则只读service/registration完整码词元，不认识I1点属性raiser；不得改弱gate或加假注释。I1补充沿闭合owner声明改为完整现行code作raiser键（一个明确有限表，从既有defineErrorCodes返回函数连接），生产调用artifactErrors["artifacts.artifact.<原因>"]，code/message/kind/details完全相同，门禁看到真实调用码。不恢复任意code工厂、不改gate/config或填无效文字。此实际边界问题修后再整建/类型/预算/定向运行。

I2候选2d2db17bb/0f9a39169保存13文件净删2行，十原因四族invalid声明，工厂类/类型/options与Host治理注入删，Provenance四有限原因保留完整聚合详情。实际owner门禁发现旧governance.transition_invalid不能移入新owner文件，已按登记Goals统一为goals.governance.transition_invalid及唯一消费者，未加例外/放松规则；API02不变、health02通过83类。独立只读复核在途，含原默认空details与Host实际合同判定，工程/真实可信决定/幂等与整合运行未记通过。

W3-02-I3按原I收Goals核心错误工厂，依赖H/R1–R3。当前AST221调用含138固定原因、13处动态code流，范围Goals模块及唯一Host Goals装配、三个现行测试；固定原因按真实family声明，三个现行stale_version conflict保留409，其他沿现行invalid400，不按名字猜类别。删GoalsCommandError/GoalsErrorFactory/options与Host注入；owner固定throw直接用闭合raiser，原配置/报告/状态辅助接口的内部错误委托改为同owner静态调用，不从宿主传工厂；公开validateRelationGraph hook的输入错误仍以共同ActionError携原code/message，不未经决定收窄原公开code:string合同。I3-01：真实命令/事件、版本冲突/请求重放/规划/关系拒绝、消息/显式详情/409与400保持，SQL、事件type、事务及可信决定顺序不变；I3-02：无类/factory/alias，当前instanceof消费者只改共同类，标准闭合集合不会放未知码兜底；I3-03：整建与README现行命令/查询/事件/规划、完整用户身份、HTTP/MCP拒绝及共享全量通过。任何不同kind的动态调用先追实际来源，不能让同一码跨出口分类变更；此处方案不是运行完成。

26整合真实完成：build、root tsc、workspace:typecheck、API、actions、29实发资源与health全部0，完整boundary仍仅tmpSDK路径失败；不能称typecheck:all或完整boundary绿。36文件342条340通过1新断言误报1网络skip，0cancel，实际macOS Seatbelt环境/文件/子进程/IPC/预算拒绝已运行。K1 no-onerror正则匹配了quoted title内编码文字，精确安全HTML实际已证；改body完整字符串与无真实img断言，同片K1后补28和真实pinnedHTTPS 13/13通过0skip，registryHTTP200。26错误把含openGoalBrowser的普通Schedule文件当非browser，漏持browser锁；此执行遗漏保留，27按真实锁重跑该文件与Pages/side-panel/AlchemistUI组合；29真正Chrome DOM属性/文字/无事件注入另私有脚本排在同锁。已验证其他定向不机械重复，完整security49文件30实际在跑。I2 0f9候选Source独立接受无P1，显式详情完整、未提供时遵共同optional合同不附details（原Host同样无{}），不增广泛空详情；实际运行仍待。

27按真实browser锁完成22/22、0skip/cancel（122175ms），Schedule关闭交错、Pages/PPT/灵光及Browser crash/AlchemistUI原路径都过；29实际Chrome DOM验证public helper/document title/文本和单双引号属性读回原值、0img/0event属性、未执行攻击通过。安全30完整300条298通过2管理fixture失败、0skip/cancel（182768ms），保留原失败，不能称安全全绿。首正例/末alias仍随机新初始化已有Board，按真实catalog操作重放修；input.actor_id在initialize经ActionService闭合schema拒绝，已留下当前人拒绝诊断，内层gateway返回编号而非transport未进入时0编号。434e7dc7f保留原Origin/token/key/closedtransport全部0事实拒绝矩阵，改合法重放成功及精确actions.input_invalid/原编号/唯一失败行；31实际定向在跑，可信actor和完整零事实另核。不改产品schema拒绝次序、不丢诊断或弱化权限。

32真实安全管理四条再次通过0skip/cancel（5835ms），增强可信actor精确LOCAL_PERSON_ACTOR_ID及幂等重放facts完全不增，原安全矩阵和取消/断连保持；独立Source复核4e13无P1。I2以6cd33032b/4b288纳I8，actual完整模块与独立候选同，Host只删治理注入；测试Goals前缀按I8完整R3既有事实保持，未带回独立候选旧测试词元。33整体build/root tsc/API/actions/health/资源已0，真实治理、HTTP状态/可信身份、树物化rollback与provenance正在回归，未出完整footer不记整批通过。

33 I2组合实际全部通过：整体build/root tsc/API/actions/health/29资源预算及十文件95/95真实回归，0skip/cancel（56240ms），包含HTTP配置/决定/收尾、当前轮次与agreement授权范围、tree提交/物化原子rollback、可信输入聚合、CLI/管理MCP真实Host重开、动作拒绝有编号与0事实、管理取消/断连。现行无详情遵共同optional、显式详情与消息保留实际成立；健康Error subclasses77，shape28/owner49均只降。该组合无boundary重跑，26-source已证唯一临时SDK路径缺口仍在；共享全量与最终I3及原路线完成尚待，不把95通过作为整线结束。

I3当前AST分类补齐：138固定throw码、28确切传给校验helper的原因共166，183候选中的17个completionUnmet/PlanningGraph数据式结果码不声明成错误。34个同owner辅助函数的error参数位置已逐一登记，调用按TypeScript解析声明定位删除，不能仅按requiredText同名替换。公开validateRelationGraph hook仍code:string，两个真实边界改new ActionError(issue.code,issue.message)不强制kind，平台conflict/forbidden按原公共表分类；内部已证三stale冲突409不改，其他固定owner现行400保持。I3已写入独立候选：166个确切原因连到同owner声明，34个helper的工厂参数按解析声明删除，Goals类/工厂/Host注入已移除；当前仅源码候选，不能记整建或真实回归通过。

最新远端现场（05:07UTC已核）：其他执行方将#410合入d53062a23，Grok#480 exact536仍OPEN、#481仍叠分支，未遵全部Grok后再Codex的优先先后；Root未执行此合并、不回滚他人成果，统筹已知。33验证基线964841211仍是明确范围，须在d530组合上核交互差异与资产/相关回归后才能写为最新main证据，不能把33搬为新基线通过。

I3源码候选现已形成：公开validateRelationGraph仍code:string并沿公共平台分类，三个版本冲突显式conflict，其余沿现行invalid；移除GoalEventConcerns仅为错误注入而留下的无用context，事实写入仍由原core负责。当前源码映射141个公开入口，Goals及依赖TypeScript诊断均0；API快照匹配，health基于main964通过，错误类77/owner未归属50，不能把较新d530视为已验证。现有公共命令测试补精确消息/400/无details及平台hook 409/403与0事件/0关系变更，版本配置、closure和agreement现有回归补kind及原详情；整建、实际运行和最终共享全量仍待。删除模块公开GoalsCommandError/GoalsErrorFactory，以及resolvePlanningEventAdoption第三工厂参数，是当前无兼容期的接口移除，现有消费者同步共同类，最终PR须说明调用方影响。

I3固定7beb4e3e0经独立只读复核接受，无Blocker/P1；主执行纳入当前main d530组合40b601a5f，Governance既有删除保留。24b1d7fb2同步新Agent问卷合同时同时保留requireSynchronous、memoryExecutionControl与原select aria要求，派生baseline重新量，API无差异。37批以严格build单名额排队，整体build/双类型/快照/健康/资源/17文件真实回归尚未开始或完成；临时SDK包路径仍独立未提交，完整boundary不足不隐去。

W3-02-I4接续Projects错误工厂，沿原I获批方向，依赖当前catalog owner码及共同模型，范围modules/projects、Host project-catalog/management-action-client及两现行公共模块测试。移除ProjectsErrorFactory及其必填options、ProjectService/WorkspaceService注入参数；真实8个现行catalog原因由实际owner defineErrorCodes，追当前Host catalogFailure：project_not_found为not_found404，其余七个invalid400，不按名字猜HTTP分类，不增新owner/别名/任意未知码fallback。I4-01：项目/目录确认、缺项和无效输入精确code/message/原404或400保持，事务、数据库、事件、删除receipt及权限顺序不变；I4-02：公共调用方同步删工厂，未知码不兜底、无新增兼容；I4-03：README现行Projects模块、目录关联/删除、原HTTP/MCP公开路径与最终整体build/回归通过。先独立Source候选，I8冻结期间不改受测树，最终PR说明公开模块options与构造参数移除；此计划不记实现完成。

I4分类核对更正：Host现行catalogErrors明确project_not_found为not_found404；独立模块过去自注入plain测试错误没有分类，不作为Host合同。候选纠正这一声明并补公共getProject缺项精确404/code/message，不把一开始的invalid假设带入运行；其余实际七个既有invalid400不变。

I4独立候选已写入，Project/Workspace服务16真实抛错点归八个现行原因，两个Host装配与现行测试删除工厂。source-types38b映射142个公开入口，模块及依赖均0诊断，API38当前62快照/2412声明匹配；health38相对d530通过。project_not_found分类更正单独保存，正式只读复核以完整clean头为准，不接受遗漏的早期4ec单头；工程build/运行仍未验证。

W3-02-I5沿同一错误工厂收口，范围Goals插件的结构提案Query/Submission/Input/Normalizer/Decision/Check/FactMaterializer/Followup/DecisionPlan与唯一Host GoalsTree装配，依赖R3及I3。静态owner raiser替换固定和已溯源有限code参数，不改提案内容、排序、SQL、事件type、trusted authority、provenance聚合、事务和物化partial/rollback协议；现行Host沿ActionError默认invalid400，平台code分类与显式details仍原样，isDomainError识别端口改共同ActionError时保持错误聚合策略。I5-01：公开树提交/决定/检查精确错误码消息与details、拒绝0事实和原事务回滚；I5-02：factory及error识别注入无剩余、所有公共consumer同步共同错误、不保留旧类/别名/读取兼容；I5-03：插件README必跑、结构提案真实Host/HTTP/MCP及可信身份完整回归、资源预算和最终共享全量。未溯源动态code不盲改；先Source候选，I8冻结不动，完成PR说明公开构造端口移除。

I4完整d7a51fee0独立Source接受，无Blocker/P1；16个原抛错码/消息与两Service其他AST逐字保持，8分类逐项对当前catalogFailure，Host移除两处Projects注入、其他工厂保留。定向运行待README五文件及公开HTTP/MCP实际组合，Source不记完成态。I5 AST现93个原工厂调用、55固定码、10动态处，内部字符串helper参数及三planning cycle、四provenance与本地affected issue原因逐一溯源；materialization识别仍仅共同ActionError，不把所有带code的外来Error吞成领域冲突。

I5候选5d30e5133已保存14文件338/-281：93工厂调用改83闭合现行owner原因，五family；删除Host全部Tree工厂与三个识别端口，实际catch仍共同ActionError分类，provenance原开放issues数组完整保留。source-types39c当前142映射0插件/依赖诊断，API39匹配62/2412，health39相对d530通过150巨大/76错误类/owner49；现行Host树action聚合拒绝测试已增强，但未运行。独立Source复核在途，不记整建、资源或运行通过。

W3-02-I6收AgentHost/AgentReview/PrologueAdapter/PrologueApproval四个封闭code/message类，沿现行owner码声明common ActionError，不改审核归属、过期、standing-rule、Pending精确版本、记忆/文档控制与模型派出次序，PrologueInference带status/execution及外部SDK错误下片另追。I6-01：现行码与中文消息、无显式kind时实际共同HTTP400分类保持，审批拒绝/过期/断连/撤权0效果及真实重启恢复不变；I6-02：四类/导出与现行instanceof/import均同步共同类，不alias，公开PrologueAdapter新增question problems逐项信息完整保留顶层供现行消费者，另在details中带同一信息供共同出口；I6-03：README必跑及pending/approval/review/模型切换与真实安全相关回归、API/health/assets/build和最终共享全量。question类型与外部questionnaire错误词元不改，SDK正式vendor仍待用户原问题，I8当前冻结不动。

I5完整dc0c402c0独立Source接受，无Blocker/P1。新真实action聚合测试首稿confidence=-1会先被现行schema拒绝，复核后改空白source_refs+reason，达到真正owner两issues路径；不改schema或弱化断言。83声明/93raiser及其余生产AST保持，原partial/whole/rollback与可信授权不变，尚待运行。

最新main d530的问卷依赖与此前防腐临时beforeAccept SDK不相容：40b实际TypeScript31诊断来自SDK缺validateQuestionnaireAnswer与typed Pending/optional indexes。只读解包现行入库08b84296 interim SDK后，问卷诊断全部消失，仅剩既有switchModel第二beforeAccept参数1诊断；证明需要把原9行验权补丁合在现行interim基础上，不能把旧SDK候选的历史运行外推到新main。I6实际168造错迁18现行原因/四类删除，health40相对d530通过72错误类，API40匹配；当前完整类型/整建/运行未通过。联合SDK只在新隔离本地副本准备，原Prologue树/上游/vendor/真Home均不写；正式提交、推送及vendor替换继续等已有用户问题。

W3-02-I7先收Scheduler单一封闭错误类，依赖J4现行scheduler码。范围contracts/services/scheduler、服务本体、Schedule插件现行映射/取消missing处理与两测试；删ScheduleError公开类/导出，五既有scheduler原因在合同同subpath声明共同错误（跨服务/插件共享，不开新subpath）。服务原无kind400保持；Schedule动作原映射仍job_not_found404、其余job_invalid400，以共同ActionError且完整scheduler有限原因识别，不把其他owner错误误映射。I7-01：叫醒缺handler/间隔/路径/缺job精确code/message，关闭/删除/撤权/重启和原持久调度次序不变；I7-02：无类/alias，实际producer与consumer同步，外来owner失败仍原样；I7-03：README三文件与真实reminder/operation恢复、现行错误出口parity、API/health/build/资源及共享全量。不放松计时或新增持久状态，I8冻结不动。

I6生产78a4a42fb独立Source接受，无Blocker/P1；新增真实Node问卷回归6b17c9fb3已保存，验证逐题problems与共同出口details同义、拒绝待答不关闭、有效答案继续，实际运行等待联合SDK。I7候选dcc672861已保存9文件57/-49，五同subpath原因保持服务原invalid400与插件原404/400映射；源码142公开映射0诊断，API42只改scheduler快照，health42相对d530通过75类。两片Source/实际运行证据不能混称全线完成，正式SDK仍未获上游/vendor批准。

W3-02-I8-LEDGER接原错误类收口，仅ContextLedger service/materialization的封闭四原因及公开导出/现行消费者；沿真实无kind400保持，不改权限authorize/ref/scope/版本/固定物化事务，安全拒绝0记录保持。LEDGER-01：真实访问拒绝、scope/精确引用与幂等key冲突code/message/400、原存储0变化与重复无新增保持；LEDGER-02：类/导出删除、同owner defineErrorCodes，无读取别名/兼容或新状态；LEDGER-03：README必跑与固定输入/跨owner物化现行回归及共享build/API/health。独立树准备，不改被冻结I8组合。

I6补测6b17c9fb3经独立Source接受，已对真实SDK typed schema/string界限、choice默认required与number范围、实际Node answerPending控制路径核对；设计可达，但尚无运行结果。I7dcc672861同样Source接受，八造错、五reason、完整有限本域判断/两cancel及外来失败透传核实；实际README/恢复/整建待。SDK41在干净08b基点的新隔离树精确应用原beforeAccept补丁，原树与上游/vendor未改，已排同构建锁，尚未构建。

W3-02-I9-CHAR沿已有R4c仅收Characters模块service/open的五现行原因类，公开导出和三现行instanceof消费者同步共同ActionError。kind沿目前统一动作出口默认invalid400，现行插件HTTP自己的characters.conflict409/not_found404映射在本片保持，后续统一出口另按原W3-02收；不借类收口更改已有状态。CHAR-01：个人owner隔离、wrong schema原库不写、revision CAS/发布/导入固定来源精确code/message和原事实保持；CHAR-02：无类/alias、消息不改、闭合五reason同owner，不动数据库升级兼容或真实Home；CHAR-03：README四文件及真实发布/导入/Agent启动相关回归、build/API/health/assets与共享全量。独立准备，不动冻结I8或任何产品功能。

Ledger完整98ab2fab4独立Source接受，无Blocker/P1，六造错及其余ref/授权/事务路径保持；源码142映射0诊断、API43匹配、health43相对d530通过75类，仅局部候选。SDK联合副本说明已改为当前08基点41排队未运行，旧62/62证据明确归d490历史，不能当当前组合验收。Characters新候选发现现行schema拒绝测试尚有旧character.invalid，沿R4c已accepted改名同步characters.invalid，保留原字节与mode不变全部断言，不改生产库。

W3-02-I10-DIFF/CODING沿既有R4c收UnifiedDiffError与CodingDiagramError，只动各自parser/inspect及公开导出和精确consumer，不互相import插件实现。DIFF-01：三个diff.unified原因/中文/count与hunk解析次序保持，comparison只接受本域三个码给原详细文案，外来错误仍原通用文案；DIFF-02：两个coding.diagram原因，原inspect返回错误数组按共同ActionError[]保留code/message/顺序，不变成throw或另种结果；DIFF-03：相关现行diff/coding-artifacts测试/真实固定changeset呈现、README受影响回归及build/API/health/assets/共享全量通过。两域无旧alias/fallback或新数据，现行invalid400保持；候选Source与最终运行分开。

37验证队列已在未取得锁、未安装/构建/测试状态撤销：确切自有wrapper9062仍queued，install/results均不存在，foreign receipts-full-suite仍持锁；只TERM该自有排队进程，退出143，不中断他人回归或操作他人锁。已证旧SDK与新问卷31类型失配，不重复已知失败整建。改为41联合08 SDK先构建/回归/pack，再把已接受I3–I7/Ledger/CHAR及Diff/Diagram集中一次新整建；当前I8 Source解冻可串行整合，未称37通过。

CHAR完整952d7548b及DIFF/CODING8a6c97ce5独立Source接受，无Blocker/P1，均纳I8到07f96f313。CHAR五原因/16消息及wrong-schema拒绝原字节/mode保持；新跨actor拒绝对照前置持久快照可发现误写。DIFF三码、Diagram两码/错误数组与自域catch保持，原unused错误类型未alias。DIFF源码类型0/all0；Coding自身0、全图2诊断是临时tree缺已有lucide链接（包/lock/icons原样），须完整离线安装整建后再证。此阶段已接受Source累计纳入，不把health46早于CHAR/DIFF的70类刻度当当前67类实测，随后整建统一重算。

W3-02-I11-BIND收Runtime项目关联三文件的错误工厂及Host唯一接线，不删归属事实。11现行原因由模块owner声明：work.context九码现invalid400，catalog.invalid_name400/project_not_found404按当前catalogFailure原分类；删RuntimeProjectBindingErrorFactory/type及validation/setup ports.error/commands ctor注入，保留workspace规范化/transaction/provision原功能端口。BIND-01：现行确认/稳定identity/幂等key/重绑/异步准备确认code/message、原目录/项目/Session关联0越权/0重复事实；BIND-02：公开调用方删工厂，无类/alias/读取兜底，不把catalog事实rename到Work；BIND-03：README现行目录/关联/删除/HTTP/MCP回归与build/API/health/assets及共享全量。普通Source独立准备，真实Home仍0写入。

W3-02-I12-SESSION收contracts/private-work-context现行PrivateWorkContextError与MolisWorkSessionError兼容别名，以及模块/Work插件67个现行造错和相关consumer。16现行work.session原因由同subpath静态声明invalid，原默认400保持，消息/事实/SQL/confirmation/幂等/密文数据不变；HTTP已同时认ActionError的路径删重复类判断，membership原特殊503仅以共同类+完整16本域码识别保留，Handoff持久失败同样仅认本域码、外来仍identity_conflict。SESSION-01：真实Session关联/版本/发送尝试/恢复/隐私拒绝原code/message和0无授权写入/无重复发送；SESSION-02：类/别名与现行导出/import/instanceof全清，无读取旧码路径，业务session/handoff事件type不改；SESSION-03：README与公开HTTP/MCP/handoff重启/多owner事务及schema拒绝回归、API/build/health/assets/共享全量。对外部Runtime原native_error不盲改，纯领域识别不等于所有ActionError。

BIND完整61952ddb3独立Source接受，26抛错/11声明逐项对原factory，Host恰删三注入，原交易/provision/normalize未动；真实重绑拒绝快照可发现写入，types48b/依赖0、API48匹配、health48基于d530实际67类/owner46。已纳I8到7abf5f7dd，后统一测量不复用46旧刻度。Session166341aab+994f060ad候选删类/兼容别名及67造错，confirmation精确中文/原400/0Session增强已保存；types模块0、Work6诊断/全图8仅borrowed xterm/lucide链接未安装，不记整包通过。API49改唯一private-work-context快照、health49实际66类，Source独立复核在途。

当前远端main又由外部#491合为2768dd71b，Root未执行merge；比d530新增六文件，模型切换对prompt_cache=off不强制同格式判断及其真实消费者回归。I8同步该main时模型切换helper有一处冲突，须同时保新prompt_cache=off判断、本线beforeAccept同步拒绝与I6共同错误，实际解后再保存；最终联合SDK/整建/回归须针对此新基线，不把d530的Source/旧运行直接贴为最新main。#480新1ffc全必需/产品绿但BEHIND于491，仍Grok负责同步与优先链，Root未替合。

W3-02-I13-SOURCES/LISTENER沿J3收两服务错误类，仅既有三sources原因、四listener原因与真实producer/识别consumer。同subpath声明invalid，原无kind400保持；类/导出/instanceof移共同模型，本域识别取共同类+完整有限码表，外部connector报告原details/error_code与safeErrorCode不变。SOURCE-01：来源not_found/无效schedule/transition与Listener lease、delivery/quarantine/connector failure精确code/message、恢复/重启/原RawEvent持久化与0重复作用；SOURCE-02：不保旧class/alias、类属性仅code/message不动DB结构/事件/RSS外部码；SOURCE-03：README并集feed-receive-chain/feed-sources/feed/plugin-runtime-integration和Connector公共真实链、API/build/health/资源及共享全量。独立Source准备，先前用户存储码维护决策仍要求clone演练和真实Home窗口另决定。


BIND归属复开：完整已跟踪候选在当前2768基线被health51拒绝，Work新文件重复声明catalog两码；此前health48不证明当前完整候选合规，独立Source接受撤回该归属结论。BIND-02补具体方案：Projects现行八原因的唯一声明移到公开contracts/modules/projects，Projects及Work消费同一projectCatalogErrors，删模块内部声明文件与Work重复声明；当前未有owner的该合同文件补归Catalog，按既有主人表允许的正向归属补全，不改门禁脚本/阈值/平台例外。404/400、每个理由、事务及确认不变，新增公共声明更新API快照；固定完整candidate后重跑Source类型/health，再由共同构建与真实绑定拒绝证明。无新增factory或跨Module实现依赖。

BIND-02同片补Host四个重复根原因：project-catalog-contract复用共享invalid_name/project_not_found/plugin_not_found/project_storage_invalid，Host其他十三原因原表保持。catalogFailure只接受原来的十七个root理由，不能把context子域键扩成root别名或改外来错误；Panel既有端口不在本片删除。完整声明与识别表分别核对，不把Projects+Work收口夸成所有Catalog入口都已迁完。


BIND归属修复7129fd22a完整已跟踪候选通过Source类型0/all0、API52b/c匹配62/2413及health52c；独立复核接受，纳I8为2618d8e4f。此前api52的pnpm自动重装/无TTY失败保留，不能记为API通过。Session208完整Source接受且纳2be6c8d29；Sources/Listener516a46bf2的10文件完整Source接受，API53/health53当前2768通过，纳461003570。三片运行均仍待，临时SDKpkg/lock未提交。SDK41旧自身wrapper32071未取得锁时已撤销143，替代一份同driver队列27691，显式禁pnpm默认自动重装borrowed依赖；不改门禁、foreign全量未中断，41仍无build/test/pack结果。

W3-02-I14-FEED/ATTENTION/SIGNALS接既有R/J的余项：Feed三真实生产原因直接用既有feedErrors，删FeedError、旧四原因转换表及已无作用的callFeed，现行纯表达式调用直接执行；read_not_supported无人产生不声明死原因。Attention四原因改现行attention.*，唯一声明在该域新合同内部文件并由既有attention-resumption subpath导出，文件正向归Attention；现有Inbox声明的事实owner保持。Feed callAttention只认共同类+完整四原因，仍缺项→inbox404、版本冲突→feed409、其他本域→feed400，外域原样抛出。Signals两原因改signals.*，唯一当地声明，数据/RawEvent/adapter/provenance/幂等及SQL不改。FAS-01：真实缺项/版本冲突/无效draft或reference精确原文与产品HTTP/MCP分类，拒绝前后持久化/事件不变；FAS-02：三类/旧导出/旧生产码与死原因兜底清掉，无旧读取兼容、无新厂或跨Module实现；FAS-03：三Module README回归、Feed/Inbox链及schema/API/build/health/assets、共享全量。新增合同仅现行raiser，旧存量码仍维护八按克隆演练处理，真实Home零写入。


FAS完整272eb4d80已接受：5 Feed/8 Attention/2 Signals造错与7表达式展开逐项保持业务/文案，API54两快照62/2410、三Module source-types54全0；health54当前2768全tracked实测61类/13形状/31非owner，无gate放宽。Feed插件仍4/6未安装borrowed依赖诊断，不报完整类型通过。真实错误及持久化测试已写而尚未运行，与源码接受区分；已纳I8，最终新SDK整建回归待办。

W3-02-I15-WORKSPACE收WorkspaceArtifactError、Files再导出FilePathError别名与Work补偿MolisWorkWorkspaceActionError。WSERR-01：公开路径/ref/payload每个现行work.workspace四原因/中文、拒绝条件保持；Files reading-position仅识别原四域共同错误，其余仍抛，不放宽路径安全断言。WSERR-02：Work两补偿原因共用模型，四处repair/unlink拒绝保留原目录事务/恢复顺序与原cause对象及非枚举性质；Host去已无作用的changing转换和纯表达式wrapper，不改Action服务授权/beforeEffect/审计。WSERR-03：类及旧别名/export/consumer清掉，现行kind默认400统一invalid（SC-3 后 Host 目录路由按 kind 定状态，见 W3-02-G4-05 行）；workspace-directory/files/reading-position及Work/合同README并集、真实目录拒绝和恢复/API/build/health/assets/共享全量。共同metadata保留既有cause，不引入额外兼容/factory/schema。


W3-02-I16-PLUGIN-RUNTIME/SDK延续J1与I统一错误模型：Runtime六类、SDK Manifest/Definition两类共89真实构造、26现行plugin原因，码/理由/拒绝/生命周期/数据不变，原默认分类保invalid400，不按词猜403。共享唯一声明放新合同内部plugin-errors并由既有platform/plugin导出，正向归Plugin；SDK仍仅依赖contracts，Runtime/CLI各用公开合同，无private依赖。PRERR-01：包签名/路径、Manifest声明、grants/storage/事件兑现拒绝有精确code/message与0未授权效果，重启/停用/升级/隔离终态和原保存code一致；PRERR-02：去八类及旧公开出口，Runtime启动catch仅认原16完整码（外域保持原安全generic），SDK仅认原Manifest四码；原兑现路径本已接全部ActionError，删重复类判断，不扩大其他catch。两动态处按原有限条件/四码查同一声明，无猜测或兜底；PRERR-03：README并集/真实SDK作者样板与Runtime生命周期、类型/API/health/资源/最终共享全量。合同PluginEventError/PluginWiringError的detail与公共payload另片处理，不在这里机械丢元数据。


I15 Workspace完整c587 Source正式接受，37parser与四补偿构造、cause identity/非枚举及原回滚顺序已复核；实际Files55类型own/all0、Work6/all8借用依赖缺失，API55/health55已证，纳I8为8e0b70701，运行待办。I16核心63165e309的35文件Source复核接受，四包types56全0、API56/health56已证；两处现行公开文档追加1602b22c4说明共同ActionError与公开pluginErrors，文档后完整头复核在途，实际SDK作者/Runtime回归仍未运行。

W3-02-I17-SYSTEM收Kernel注册器、Host运行生命周期、ModelProvider与ProjectRecovery四类。SYSERR-01：Kernel三个原因、Host四原因与真实ModelProvider.invalid拒绝维持原码/理由/default400，不额外声明无人产生的ModelProvider.unknown；typed settlement只认共同类+精确kernel.capability_missing，仍包装actions.dependency_missing、原message/cause/503与调用记录一次不变。SYSERR-02：Recovery唯一catalog.project_recovery_unsupported_schema共享Catalog当前声明，消息仍原code；readonly检查、错版零写与关闭顺序不变；其他三域各有当前闭集声明，无旧class/alias/export或读取兼容。SYSERR-03：Kernel/local-host/model-provider-store/project-database-baseline与URL安全现行回归、README/API/build/health/资源及最终共享全量；真实Home/密钥仍不读取或写入。本片仅错误模型，不改注册/host生命周期/供应商secret引用规则。


SDK41联合候选原始证据闭合：当前08b84296f81df1bd5f3429c2dc2997d18b72473a+beforeAccept副本build/tests/pack均0，Vitest 8files114/114无TypeError；实际tgz SHA256 660540fc6a711af5b03cf0e1beae02467b0ad2cb7913148479aa4b0b9045596d。旧d490的62条只作历史，不混记。Root仅把I8两个未提交pkg/lock临时依赖转向该包，58批同锁offline lock+frozen install/整体build/types/API/actions/health/实测资源准备一次验证；正式上游提交/vendor替换仍等原授权问题，不能因此称已正式交付。foreign receipts全量实测6240中6226通过/5失败/9跳过/0取消113分钟，不作为本线运行证据；其结束后Root41按锁取得名额，无foreign kill/reset。

I16最终1602完整Source接受，37路径逐blob与I8 c4a2f27a0一致；I17 a2f43ad9d完整14文件正式Source接受，26处原文/条件，Host旧安全四声明保持只加Lifecycle四项，typed缺项原503/cause/一次结算与Recovery错版零写保留。Kernel57b全0，Host8文件scope0/all321依赖环境，不称完整Host类型通过；API57匹配、health57实测47类/13形状/31非owner。Root修正未提交时自身覆盖Host已有表的机械错误并保留失败/修正事实；当前Source有自有借用Kernel node_modules链接未提交，不称整个树clean。两片已串行纳入I8，58新组合FROZEN待整建与真实40文件59批，不复用旧运行证明。


58批实际offline lock与frozen install通过，整体build仅GoalTree工厂删除遗留goal-project-application首行ActionError unused（TS6133），后续未执行；原失败保留。05ae79141只删此唯一无用import，60批真实整体build/root types/全workspace types/API/actions/health/29资源实测均0；新SDK和最新2768源码组合已获工程证据。boundary60退出1仅临时SDK路径inventory不匹配，不放宽规则。实测47类/13形状/31非owner、资源29项10013459字节未变；派生baseline仅下降保存2ade1c638，pkg/lock两临时文件未提交。59真实40文件单一browser名额队列已单次启动，I8持续FROZEN，实际结果待收，首40不能代替全部README/最终共享全量。

W3-02-I18-INSTALLER接J6/I统一错误模型，收Home install、Web service、Runtime integration、Uninstall四类；现行owner码/原文/defaultinvalid400保持，不因conflict等词猜状态。INSERR-01：preview后执行/replay、snapshot-stale/confirmation/来源与payload拒绝、卸载逐步失败及receipt/幂等和真实临时Home恢复不变，拒绝0越权写/不吞外部错误。INSERR-02：各真实有限码按现行installer family唯一当地声明，去四类/publicexport及相关消费者；config parser只认原RuntimeIntegration五码，release-file验证只认原Home七码，其余照原抛出，无旧值读取/alias/factory。INSERR-03：install/service/runtime-integration/uninstall/release现行README并集真实回归、API/build/types/health/assets及最终全量；只用临时Home，真实安装/Home/Keychain与仓库vendor不上手。本片不改安装路径、源校验或打包协议，所有影响依赖当前I8共同工程基线。


I18完整2c804f093/8629a17eb Source接受：53构造/21真实码七family，Home七码/Runtime五码有限识别与原有限动态索引保持，plan_invalid无producer不声明；24文件既有真实preview stale/回滚/receipt/用户库保留断言有效，补INSERR编号不新增镜像测试。API61/health61实测43类；Installer31文件scope0/all299依赖环境，未构建运行、尚未纳冻结I8。59 browser仍单份23941等foreign a1-full-suite，62纯Node40单份38826也按现行排时段规则等build名额；均未有runtime日志/结果，不能记已执行。

W3-02-I19-CONNECTOR收ConnectorHost、ConnectionStore及MCP connection三类，OAuth的serviceId和CLI无code异常另片按真实边界保留，不机械归并。CONERR-01：driver缺失/重复、连接错服务/撤权、timeout/真实MCP provider与入站合同拒绝码/原文/default400保持；Caller/URL/secret引用/beforeDispatch/inspection和0副作用拒绝、当前provider code/provenance不变。CONERR-02：共用现行连接服务合同唯一声明，三类/旧导出清掉；所有consumer逐个保原有限三域码（images、alchemist/feed/type-safe、HTTP和动作gateway各自映射），MCP原已接所有ActionError的分支删重复类，不吞外域Common。CONERR-03：Connector/MCP/URL安全与撤权真实用例、README与API/build/health/资源和共享全量；当前真实Home/Keychain仍不读写，外部OAuth原协议不改。


I19复核复开：9c842c712未接受，Common转换后两条既有MCP边界提前匹配造成实际差距。HTTP通用ActionError先命中新connector.mcp.authorization使原401变400；safeError早透传新connector.connection四码而原来应掩为固定MCP provider文案，可能泄露连接细节。按CONERR-01/02保原消费合同：HTTP优先MCP四码，保authorization401/其余400；safeError先掩Connection四码，已合法跨域ActionError如取消/撤权仍原样；HTTP直接收到新Connection/ConnectorHost有限域时也按原通用MCP文案。补已有真实web server隔离Home回归：过期/无效授权POST401、缺连接inspect400/provider固定文案/0新连接，避免仅测试formatter。冻结I8不改，本片在Source树修复并重核完整diff/门禁后再接受。


I19最终36ee3701a完整Source接受，401与原Connection细节掩码差距已关闭源码复核；合法跨域Common取消/撤权保留，新增真实HTTP fixture每POST fresh一次性操作键确保可达，运行仍未做。API64/health64已证40类/13形状/31非owner；当前只tracked clean，自有借用Kernel链接未提交。下一合法解冻纳I18完整8629与I19三提交，不重复原有效检查或把新测试源码当通过。

W3-02-I20-UI-HOST按既有W3-02十一kind/owner码决定（原设计§8列为日常取舍）收两类与五裸拒绝码，owner沿现行登记ui_host不改归属。UIERR-01：真实Contribution重复/缺项、无效surface/slot与停止/未授权PluginUi的拒绝条件、文案、注册/撤销次序和0外域注销保持；当前owner码ui_host.contribution_conflict/not_found/slot_incompatible/surface_invalid/plugin_denied。UIERR-02：去两类/旧出口与当前裸producer/consumer，唯一当地声明；明确分类修正：原裸码在SDK通用出口为不识别500，现按真实原因分别conflict409/not_found404/invalid400/forbidden403，保拒绝而非沿未知故障掩码。这些是统一模型的预期变化，不以全绿改断言；原类身份用具体当前code与kind及HTTP状态断言取代。UIERR-03：ui-host README、workbench-ui/feed/inbox/schedule/global-settings/plugin-host-executor现行真实mount/unregister/revoke测试、Source/API/build/health/资源和最终共享全量。只改UI注册合同错误，不改布局/挂载位置/用户权限、不开新状态或compat。


I20完整df34bf3ea Source接受：9文件两类10构造、五裸码/旧出口清掉，当前ui_host owner原样；types65全0、API无变、health65实测38类/7形状/25非owner。明确分类修正409/404/400/403为统一模型既有决定；实际UiHost duplicate/missing/slot/surface测试查code/kind/派生status与registry不变，PluginUi两个拒绝case只断言code+forbidden及原UI列表，不能写成已实测HTTP403；未运行或纳冻结I8。

W3-02-I21-GIT-WORKTREE收Host GitWorktreeError唯一闭集，不动WorkspaceGit的结果outcome专有边界或Git/过滤器/工作树协议。GITERR-01：真实git执行失败/授权仓库根/原起点和path、owned/writer分支、不接管外来目录/符号链接、dirty拒绝与重试保持当前git.*码、原文和defaultinvalid400，拒绝前后不创建/删除外域目录、原提交与登记不变。GITERR-02：去类及导出，五现行原因当地唯一声明，ENOENT/普通失败按原两分支，唯一not_owned捕获只认Common精确git.worktree_not_owned。GITERR-03：writer目录真实Git/恢复/SDK假设与security目录边界现行回归、README/工程/API/health/资源和全量；真实用户工作树/branch不清理、不跑真实Home。


62真实终态40文件235条：230通过/5失败/0skip/cancel，207173ms，失败全为Coding state参数less读取未捕获current actions.dependency_missing；5历史/demo回归断言有效，未加allowlist。沿实际链 confirmed：无workspacesFor的合法Host不注册browsing-workspace，Coding注释承诺sessions仍可用、workspace null/list[]；typed settlement已统一旧Kernel缺项，Coding unlessMissing残留旧kernel码未同步。READFIX-01：仅该消费者改认现行actions.dependency_missing，其他权限/不可用错误仍抛；直接Kernel与cause测试正确保旧事实kernel.capability_missing，不全局改名/双码兼容。READFIX-02：原5fixture读真实恢复、Coding字段null/[]和非缺项拒绝，以及新main共同构建/实际回归证明。

Root仅撤销未开始的59自有queue23941（原driver/无log-results/foreign holder验证后143），62已终态，I8合法解冻；不把59撤队列算测试。共享origin/main已推进46cb083ee：Grok480实际08:22:49Z合入，Root未merge该PR，CU后续仍遵守其优先链。本线合main63文件时只prologue控制端口一冲突：保main steer.source/key、保本线beforeModelSwitch/beforeAccept；门禁JSON取main后必须实测重生成。Source I18–I21已纳I8当前13beb75a6，无冲突/未运行；SDK仅保存/恢复临时两个文件不提交，main未更换SDK。新组合及READFIX需要一次新整建，不以2768的60/62证据贴作46cb最终通过。

2026-10-14锁文件与当前整合核实：I18 Installer、I19 Connector三次修正、I20 UI Host及I21 Git已串行纳I8，53路径中52逐blob一致，index唯main新增desktopTaskComplete/type导出保留两边；只读Source复核接受，实际新组合回归待办。READFIX-01修正coding.state可选workspace依赖原kernel码消费为现行actions.dependency_missing，保原五条历史读取fixture；READFIX-02新增真实Host拒绝用例核forbidden/connection_unavailable的原code/message及实际读取次数，未运行不记通过。

67批只排队无log/results；复查实际pkg1+/1-、lock9+/888-，大批Biome/esbuild/tauri/rolldown/lightningcss等optional条目已在保存patch前被裁掉，不能归因67执行，也不能称只有SDK替换。精确核本人wrapper73666/只有sleep子进程与foreign a1 holder23912后撤本人未开始队列，exit143，未触foreign。污染证据保留私有临时目录；从042ff HEAD恢复全部非SDK条目，只重放SDK41路径和由实际tgz计算的integrity，实际pkg1+/1-、lock5+/5-。新68删lock-only步骤，仅frozen offline install并核lock原文未改，再整建/根与workspace类型/快照/health-base/assets-base/boundary；单份已排队、尚无结果，I8源码保持冻结。SDK两临时文件不提交，不触vendor/真实Home。

W3-02-I22-ALCHEMIST-STATE收六个有限错误类：OpportunityAction/Transition、StartPulseRun、StartLensRun、CancelLensRun、IdeaCardTransition。ALCERR-01：全部现行alchemist码、原机器文案、Opportunity真实事务/复用、卡片转换与Pulse/Lens取消顺序保持；businessError按原有限六域作原中文/404/409/default409映射（领域Common kind=invalid的通用400与此HTTP适配器原default409分开），已保留IdeaActionError的already_kept.details（ideaId/recovery）不从裸code猜来源。ALCERR-02：六类/旧局部导出与测试class身份去掉，16真实原因在插件当地唯一声明；只消费各原闭集，不把外域Common纳成成功或改写原失败，原Error.message机会三值映射仍有限。ALCERR-03：Alchemist现行README真实动作/HTTP/生命周期/生产Host与包内领域、jobs、db回归，统一构建/types/API/health与最终共享全量。Decision/ResearchPlan/IdeaAction重叠码及Operation.status/details有真实边界，Calibration/Memory校准裸异常、动态Job/SourceHTTP另片处理，本片不新origin标记、不改HTTP协议/模型或研究行为。

I22 Source候选fbb9e5dfa2d246610f86abbaff20fd6c980eb291，11文件六类/16原因，原八机会域与中文映射有限；already_kept.metadata只在保留IdeaActionError域读取，不从code猜出处。API69与源匹配62/2410、health69 merge-base2768通过31类/7形状/25非owner。types69初始missingzod71/73诊断保留，借用自己Alchemist依赖后69b own0/all2；外包环境诊断不是全量类型通过。新增真实无来源409/无run记录、missingCancel404用例未运行，I8冻结未纳本片，只读Source复核待收。

I22新增测试409修正：只读复核发现无启用来源由businessError创建AlchemistOperationError，现行constructor默认status=409，HTTP优先读取它；领域Common invalid通用400不能贴到这条适配路径。修正仅新增断言400→409及spec，不改生产默认或原测试；新的真实拒绝用例仍未运行。

68批实际离线frozen install、整建、root/workspace types、API、actions、health-base与assets-base全部退出0；lock仍精确五行SDK差异，63 API文件2414声明一致，资源29项10013384字节，health实际37类/7形状/25非owner。boundary唯一失败仍临时SDK dependency inventory不匹配，不放宽，正式SDK/vendor待决；派生门禁按实测下降保存，SDK两文件不提交。I22最终8859 Source独立复核接受，未纳冻结I8。第一组当前main40纯Node文件70在build排他名额下单次启动，修后235组与READFIX新增拒绝实际结果待收；不能预记全绿或当含Grok493候选。

W3-02-I23-CODING-STORE只收CodingStore单类/现行两原因；CDSTORE-01：真实SQLite重复创建不覆盖、缺会话拒绝、归档不能二次改且原runtime引用/计划保存/重开保持，现行coding.session_unknown/session_duplicate和原文不变。CDSTORE-02：唯一当地声明、删除旧class公开出口与class消费者；routes原session_unknown404映射不动，领域默认invalid400与路由状态分开。CDSTORE-03：Coding README并集及真实Store/计划/动作HTTP，统一API/health/build及共享全量；不改用户工作区、Runtime或会话接受语义。

I23 Source14affe5a8候选四文件/一类/两现行原因，原routes404规则未改；Source71 scoped Coding own0/all2、API62/2410一致、health实际30类/7形状/25非owner。真实Store重复、归档和重开等用例未运行，只读复核待收；I8仍冻结、未纳。

W3-02-I24-BROWSER-HOST只收BrowserError，不改带method诊断的技术CDP边界。BROWERR-01：五个真实raised浏览器码、原文、启动失败/浏览器目录争用/已接管与停用助理浏览器的拒绝、UI恢复problem(code,message)保持；原Browser HTTP已识别域409、普通外部异常500保持。BROWERR-02：当地唯一声明五真实原因/Common kind=invalid，去class与constructor；startup/HTTP有限识别原BrowserProblemCode七值（不为只作为state的两个crash值添加无producer raiser），未知外域Common仍走原fallback，不改全局HTTP mapper。BROWERR-03：真实Chrome启动/页面与浏览器崩溃/侧栏driver/上传/接管恢复及README并集，Source工程/类型/API/health与当前main组合构建、回归和共享全量；只用临时profile/Home，不操控用户浏览器或后台任务。

70批实际完成：当前7ac8d4991/main46cb+SDK41组合40纯Node文件236/236，fail/skip/cancel均0、161005ms，原62的五条v35历史/demo读取失败已在同一组真正恢复，READFIX原外域拒绝新case实际通过；不代表含Grok493或最终共享全量。I23 14affe Source独立接受，未纳I8。72批当前40文件在build与单个browser严格名额下一次启动，含Installer/service/runtime integration/uninstall/release、Connector/MCP及真实HTTP新case、UI Host/客户端/Feed/Inbox/Schedule和Git/writer真实路径；尚无footer、不预记通过。I8继续冻结，I22–I24后续Source树独立推进，不能混用接受与当前运行。

72批实际终态：40文件404条，401通过/3失败，0skip/cancel，193609ms，exit1。CONERR新增HTTP fixture的controlToken仅26字，当前Host最少32，未触及业务401/400；PRERR新增Runtime fixture grants=[]但probeManifest required network:probe，start在grant检查拒绝，未触及三个预期start异常。第三条旧Shelf无settings目录测试仍期待读取兼容，现行readCurrentCatalog明确拒绝；依既有现行格式/不留兼容决定，改为断言shelf.invalid_file、原文件逐字节不变，并另验干净当前库的原wheel/hotkey默认。INTEGRATION-FIX72-01：只修新fixture为真实合法token/显式原required grant，不改安全入口、Runtime识别/错误预期或生产权限；INTEGRATION-FIX72-02：不恢复Shelf fallback，不删除旧输入测试，保缺字段拒绝/原内容及正常当前默认行为。先三文件真实重跑，其余401条保留当前main组合有效证据。SourceI22–I24仍未纳I8。

74三文件实际28/28、0fail/skip/cancel、5836ms，三个72失败已关闭真实路径（Source复查接受27d34）；原失败日志保留。I24完整0d2f Source独立接受，73初次漏blocked_scheme已修为五真实原因，73b scope0/all223、API无变、health实际29类/7形状/25非owner。I22–I24四提交已串行纳I8 1b6f94232810a1e64b903b8471a374af15865336，需新组合整建和实际Alchemist/Store/Browser回归，不把Source<30或旧68/70/72/74直接贴为本组合通过。

W3-02-I25-ARTIFACT-ACCESS收唯一PluginArtifactAccessError与7不成形producer码。ARTACC-01：Manifest声明/安装实例和actor、类型schema/ID冲突、读取与写/记录的拒绝条件、文案及权限撤销/卸载后的0新增、固定成果与过程项读取隔离不变。ARTACC-02：按已定主人前缀，将两裸码改为artifacts.plugin_denied（forbidden403）、artifacts.plugin_incompatible（invalid400），在既有本插件errors.ts唯一声明；availability同一现行码、不留旧alias/class/export，与所有生产/fixture消费者同片改。平台grant原plugin.grant_denied仍原样，不把它混成artifact拒绝。ARTACC-03：Artifacts README、真实PluginArtifactClient/Runtime/Store与目录availability用例、公共合同/API/health/工程及共享全量。HTTP分类为统一十一kind既有决定，不增permission/state/业务数据；当前读取错误显示与原Owner文案保持，真实Home历史码待维护八按原不写调用日志合同处理。

I25补实际Coding消费者：materials.readMaterial原比较bare plugin_artifact_incompatible，同片改当前artifacts.plugin_incompatible，原中文恢复提示/不触模型保持；已有真实Shelf固定原文→Coding SDK模型路径补same-project schema_version2拒绝400/精确原提示/0新模型请求，不用自造error formatter代替端到端。Artifact README旧码同步，全Source/测试当前bare码/class引用去掉；Source76/76b Artifact与Coding own0/all2、API62/2410无变，health76实际28类/形状0/非owner18，新增Coding检查及Root共同构建运行待收。

I25复核复开808f：两处availability只给当前owner code不带kind，ActionService.assertAvailable只传value.kind，owner声明不会自动查询，故wrong-install仍回invalid400；需由同一artifactsErrors.plugin_denied声明取code/kind/message，两个availability共用，不重复分类。新增schema_version2材料参数不可达：materialSelection及SDK read只消费id/version，实际record.schema决定兼容性，不能篡改引用协议让测试成立。撤该新增case，保原BOM/CRLF/固定/foreign断言，增强已有真实archiveVersion→Coding start400/0starts用例的精确恢复文案。ARTACC原403分类与现行引用/读取协议不变；Source接受撤回待修与实跑。

I25修正5f28a6a77：同一owner factory的code/kind/message经denied helper带到两处availability，不新增平台分类或输入协议；真实Kernel wrong-install/目录断言forbidden与SDK派生403，原noRead直接grant code/kind仍保留。S5 schema2新增不可达case撤掉，原固定/foreign文件逐blob恢复；已有真正archiveVersion→SDK→Coding路径增强400/原中文/0新starts。77 Artifact与Coding各own0/all2，health28/形状0/非owner18通过，API76有效；最终Source复核待收，未纳I8或运行。#494实际main5ba仅Skill/test/spec；Grok493已自行同步新29ca并监控CI38548314953，Root不重复抢分支/任务/全量；其旧绿不能当新组合通过。

I25完整5f28 Source独立接受（八路径），两个P1修正以实际生产读取/Kernel路径复核，不能写成已实测HTTP403；串行纳I8并同步仅Skill/test/spec的main5ba，当前冻结b703e20a1879f8992fd128cc181386c864ea5903。SDK临时pkg1+/1-与lock5+/5-精确范围再核，新78 frozen install/整建/全types/快照/health/assets/boundary单份已开始，当前结果待收；未采用仍在Grok493上的CU-image包，不替正式beforeAccept/vendor待决做授权。

78当前5ba+I3–I25组合实际frozen install、整建、根/workspace类型、API/actions、health-base/assets-base全0，boundary唯一tmpSDKinventory不符未关闭。工程实测28类/形状0/非owner18、29资源10013384字节；派生baseline下降保存566ab4e8a。79首40必跑文件含Alchemist/Coding/Artifacts、真实archive与Kernel forbiddens/客户端已单次排队，当前持build等A2释放browser，未有测试log/results；80也只排队，尚未真实开始；80仅另两Store/真实侧栏浏览器文件及Alchemist包内Vitest，在同名额后单份排队，不并发构建/浏览器。当前源码持续冻结，不含随后#492 main34d生产变化或Grok493新包，不能贴为最新远端组合通过。

W3-02-I26-RUNTIME-DIAGNOSTICS统一Runtime Host自己生产的现行有限读取诊断名，不改变Codex协议、请求生命周期或截断行为。RTDIAG-01：原response_too_large拒绝与operation_failed读取失败改当前主人runtime_host.*，消息、outcome(status unknown)、保最后事实与Work显示同样限制说明保持；不得把超限当空成功或启动真实Codex会话。RTDIAG-02：有限Transport ctor/type/消费者及公开RuntimeSessionAdapterResult failed诊断枚举同片更新，无旧码alias/读取compat，既有class数据结构不动。RTDIAG-03：真实隔离子进程大行/EPIPE/恢复、CodexSession未知事实保留、Work HTTP/README，API/health/build/类型与最终组合。只改两现行诊断值，外部厂商动态错误与其他owner不全局重命名；维护八旧值映射按原数据计划。

79/80状态核实：wrapper74617/76022仍只等待浏览器名额，A2活holder74357/74362未释放；此前“已运行”措辞不能代替真实日志，已纠正。原队列保留，不重起、不动foreign。78已结束工程结果有效，I8源继续冻结。

I26 Source721f082de7fed9fc2ad7efb24e7b19bafdd8e08c七文件只两诊断枚举前缀/完整consumer及transport原真实拒绝测试与公开快照；81 Contracts/RuntimeHost各0/all0，Work own0/all2，API单行新枚举后匹配，health28/形状0/非owner17。Source复核待收、不纳I8，不把Node type/gate退出当实际Codex读取回归通过。

W3-02-I27-HOST-WIRING收四处Host自身Catalog/工作区装配失败的错owner producer，不改模块数据主人。HOSTOWN-01：注入Catalog缺失、选择不在当前真实verified列表、Catalog/Session目录均未找到工作区时，按Host自身服务理由host.catalog_unavailable/workspace_unavailable/workspace_not_found；原条件、原文/defaultinvalid通用400、beforeEffect/同步授权复查/目录与关联事务保持。Work HTTP仅原not-found404比较同步新码，其他状态不动（SC-3，2026-10-23：`host.workspace_not_found` 改为 not_found，目录路由搬到宿主后按 kind 定状态，见 W3-02-G4-05 行）。HOSTOWN-02：既有hostErrors声明只追加三真实原因，个人规划availability从同一原错误对象取code/kind/message，拒绝入口不用另一个owner的码；生产/现行消费及固定预期同片更新，不添兼容alias、统一placeholder或日志重写。HOSTOWN-03：真实个人规划Catalog缺失/恢复、项目setting/工作区绑定repair/unlink/Host与Work HTTP拒绝及README，Source/build/API/health/最终组合。当前存量码若需改写只在维护八拷贝演练，不写真Home；不改正在冻结I8或外方工作树。

I26完整721f082 Source独立接受：反向归一两诊断字面量后完整生产AST语义一致，原超限/未知/重启断言保留；真正公开名称RuntimeSessionAdapterResult failed union，文档对齐。仍未纳I8冻结源，待实际SDK/Work/child回归。

I27 Source候选dc6821d43dfc9862cfa45a038e85c77aaef113c7七文件：既有Host声明保全八字段，仅追加三invalid，四装配/查找拒绝归Host原消息及个人availability metadata保持；Work404当前码同步，原其他status不变。82 scopedapp0/all299、Work own0/all2、API无變、health28/形状0/错owner13，原真实恢复测试仍未运行，Source复核待收、未纳I8。

W3-02-I28-CONNECTOR-ACCOUNT统一实际账号读取失败为connector.account五现行原因（unknown/disconnected/needs_auth/configuration/unavailable），不是动作ID重命名。CONACC-01：原连接解析错误四值有限捕获、账号身份/授权/厂商原消息、OAuth单次刷新与错误fallback、actor/secret不进入结果的条件和defaultinvalid400保持。CONACC-02：当地唯一五码声明、raw plural connectors.*错误去掉，现行消费者/真实ActionClient预期同片更新；connectors.account.read@1、权限/connectors provider来源和输入输出完全保持，不抹外服务data错误或碰真实密钥。CONACC-03：真实隔离Host/连接Store、账号动作/MCP与Catalog来源/URL拒绝/README、Source/build/types/API/health与最终组合；只能用测试credential替身，不发真实账号请求。

79运行状态实质变化：A2活进程已自行结束，03:45:32 browser.lock由本线74637取得，driver86574及79真实日志出现并更新；未取消79/80、未kill任何进程，原队列继续，不能把此前等待时间算测试运行。I28 Source候选04a9e2ec3b6e2f1c09b79dec2b1312a60789af2d两文件、五当前Connector account原因与原动作/权限/provider不变；83 scopeapp0/all223、API一致、health28/形状0/非owner10，当前只Source候选。

79真实终态40文件182=159pass/23fail，0skip/cancel，193885ms。17失败共用两旧fixture仍调用已删LocalHost.registerCapability，未触及预期效果/恢复业务；其余6分别Coding Runtime capability查无definition、client lifecycle hidden click、SDK messagewait B waits timeout、MCP unavailable旧预期、Alchemist pulse提示代码静态regex、Shelf archived输出当前Artifacts owner码与旧Shelf wrapper预期。不能记回归通过，先核每条真实边界，禁止改生产来迎合旧夹具/regex。80两文件Store/真实Browser与Alchemist包内Vitest实际退出0，完整footer数字随后核。FIX79-01：原注册fixture改当前公开LocalHost.register，同形handler/AgentHost/真实SDK/Barriers保持，17原拒绝与持久化断言不动；FIX79其余按原因另补，不全局放宽时限/隐藏/MCP权限或跳过用例。

FIX79-01已改两个fixture当前LocalHost.register并保存126874360，84两文件真实17条仍全失败：setup越过旧API后platform未running、第一请求503 actions.plugin_unavailable。不是效果业务断言失败，先沿supervisor/start实际record诊断，不恢复已删接口/弱化取消断言。80精确footer：两个root文件9/9，Alchemist25文件81/81，无skip/cancel。Coding control新version断言用的route-actions key应coding.control-run，capability_id仍coding.runs.control@2；只修lookup不改合同。W3-09-2既定按MCP名称调用未在tools/list可用的动作应actions.mcp_unavailable，实际action-tools.callTool只拒没view、不拒view.availability=false；按现行目录同一availability补此缺口，输入/output/授权/Agent与workflow直接invoke仍actions.connection_required不变，保现有真实model-unavailable断言。需要源变更后整体构建再定向回归与共享全量，不以改旧预期绕过该协议缺陷。

84夹具setup深一层查明：实际supervisor failed/plugin.grant_denied，消息缺goals:read、goals:write、workspace:read，runtime record仍installed；之前17均503 actions.plugin_unavailable不证明产品恢复缺陷。18e4d15fd只给fixture显式既有Manifest必需权限，加MCP现行availability gate并改control route-key查找，保持owner/版本2/输入/模型barriers/所有原拒绝断言。85新整体build队列/实际阶段等原始结果（源变更必须整建），Root在b5ba组合保持冻结；#493已由原线10:52:01Z合f90bf70，Root没有替合/抢它分支；新CU-image SDK组合尚未纳本线，原beforeAccept正式SDK问题独立待答。

FIX79 MCP判断纠正：上条按10-09旧测试推定协议缺陷不成立。唯一总spec§1 2026-10-10已定“原因与码与页面一致、外部工具记一行”，既有725879ff1/W3-09-2-01要求精确授权暂不可用仍由Host结算，tools/list隐藏而callByName保原owner拒绝+可信编号。Source复核拒绝18e4新availability早退gate，它会回归并抹掉诊断；已仅撤此自加行，更新model-unavailable旧预期及comment为Host connection_required，保真实W3-09-2及零模型副作用断言。86自身尚未开始，核唯一queue及只有sleep/无log-results后仅撤本人wrapper，未触foreign；85旧工程证据包含此错误gate不能记为新修正证据。下一整体build再跑MCP新现行用例/缺模型与修好的17Fixture真实业务，不重启重复driver，不问已决定问题。

17夹具已查明缺必需grant并修6项，诊断one-off cleanup安装未running时stop报state_invalid只为诊断脚本失败，不计产品stop缺陷。86单份队列未启动就验证取消，exit143，状态不能写成回归执行/通过；恢复正确MCP gate后Source再次改变，下一整建必须用新源码。当前RootHEAD2f7662527、tempSDK五行，Src未含接受I26–I28、新main f90；此前85错误MCPgate工程日志保留。

FIX79 Shelf输出旧预期：runtime-actions.refused本已明确Common ActionError原样穿透、普通错误才shelf.invalid。I25当前Artifacts同一拒绝已识别Common，真实400+artifact_archived原文与owner code artifacts.plugin_incompatible正确穿透；按既定统一码/跨入口合同只更新原archived选择输出case当前code，status/旧引用/expected_reference/没有覆盖原输出/后续列表全保。不恢复旧bare-class generic wrapper或扩大读取compat。

FIX79-LIFETIME：current create已auto-select并codingDetail=true，旧测试随后点击隐藏directory row；新fixture通过真正可见directory-back→等待detail=false→点原row，保单次create/request/effect与卸载全部断言，生产不改。NETWORK-PULSE-01：原句/英文/匿名账号与HTML默认hidden静态断言全保，删失效的源码实现regex，将等价更强的实际可见性断言移入既有Chrome Alchemist client完整HTTP/SQLite测试；点击pulse/ideas/decisions/directions现行collection，唯pulse notice可见，不放宽timeout或跳过UI。这些四test文件尚未运行，不把修好源码记通过。


**W3-02 Goals错误余项 I29（准备，未运行）。** 规划动作两个实际拒绝planning_method.not_found改为本插件唯一声明goals.planning.method_not_found；创建意图白名单拒绝mcp.unexpected_field改为goals.intent.unexpected_field，MCP传输自己拒绝未许可字段的mcp.unexpected_field保持。不是全局字符串替换。R-GOALS-OWNER-01：实际planning read/apply缺方法分别保原文案、动作kind invalid/默认400；项目apply HTTP现有特判404保留，规划版本和组合不变；R-GOALS-OWNER-02：真实Host的GoalEventApplication.createIntent在schema之外直接拒绝未许可字段（动作schema的actions.input_invalid仍保留）保details.fields、invalid/400、事件/Goal/关系和幂等状态不变，正常及重试路径保持。生产方各声明一次、不引入旧码alias或读取兼容；既有真实Host动作测试补编号与拒绝数据断言。Source类型/API/merge-base健康与纳I8后真实回归分开验收。


**W3-02 Kernel缺Session错误 I30（准备，未运行）。** 已区分两个同名历史码的真正拒绝：Kernel action-authorship检查authorship:session且trusted runtime_session_missing，文案是缺稳定Session；Host mcp-event-identity检查runtime_id，文案是缺可信Runtime。只将Kernel声明/生产与五个实测其路径的测试期望改为kernel.runtime_identity_missing invalid；Host的mcp.runtime_identity_missing保持，不能全仓替换。R-KERNEL-OWNER-01：直接、nested wrapper、workflow与Feed promotion/offer/Gateway在缺Session时保原文案/400、zero handler与zero记录；补有效Session后原作者与合法执行保持。只有现行码改归属，无身份兜底、读取兼容、权限/schema或状态机变化；Source与整建后实际回归分别记录。


I29 Source df02dd098e12cf12e14b9c98cb81ec53480865be已准备四文件36+/6-；Goals源码类型own/all0、API62文件2410声明无变，merge-base健康通过（本Source parent dc6821，只含I27，28类/0形状/10非owner）。独立复核在途，真实运行未做，尚未纳I8。I30首次Source类型89失败仅六条缺AJV借用依赖；补自己树的kernel node_modules软链再做89b，不能将首次失败记通过。隔离SDK新候选923e5a40（含#493 CU-image）加原beforeAccept最小补丁已只在新临时工作树准备，未build/pack、未推上游/替vendor；唯一87仍未启动，不重复排新构建。


I29首轮Source复核拒绝两个P1：factory第二参本为details却沿用ActionError options导致details多包一层；web-planning旧码比较遗漏会丢原404。已传原始fields并同片同步唯一HTTP消费者，新真实HTTP missing apply断言404/原文案/项目读取不变，原断言不放宽。更正同段原状态描述，不把首轮静态通过当接受或运行通过。I30 Source89b补自己借用AJV链后own/all0，API无变/健康通过；先修正I29再继续，未纳I8。


**W3-02 MCP两个错误归属 I31（准备，未运行）。** MCP适配自己的URL构造失败web.url_invalid改为mcp.url_invalid，自己的Runtime Goal Tree批准入口拒绝goals.goal_tree_proposal.runtime_decide_unsupported改为mcp.runtime_decide_unsupported；它们不属于Web页面或Goals领域。原createError端口与Host共同ActionError适配保留，同一拒绝条件、原文案/details、默认invalid/400、调用顺序保持，管理路径和真正Goals错误不动。R-MCP-OWNER-01：公开MCP URL呈现真实无效base拒绝/合法地址成功；公开dispatch Runtime批准拒绝原文案且零业务invoke，management真实同动作授权/拒绝原有测试保持。Source类型/API/健康与I8整建运行分别记录；无工具名/schema/受众/身份/日志合同改变，无旧码alias。


I29最终e8b0e1efd关闭两个P1后已独立Source接受；90实际Goals/Kernel源码own/all均0、健康通过class28/shape0/owner9。I30实际3bc3ba3a6六文件14+/7-已提交，现有协调会话只读复核在途，真实回归仍待整建。#488已由其负责人合入，协调会话核GitHub主线f6f2ce47d8b35265479c800a7222675335e5b28f、其当前435所有必需CI成功；#489由Pages唯一owner接formatter/资源/最终共享全量。Root I8仍b33/5ba，未静默把新main或Source结果当组合证据。


**W3-02 Installed Plugin四个技术拒绝归属 I32（准备，未运行）。** installed-plugin-host已归Plugin安装域，四个执行安装身份或模型caller缺失/失效拒绝的host.capability_denied改为现行plugin.capability_denied。只改四个码字面量；SandboxError保留：runner.ts只将该技术类的code/message交回沙箱，并据其可信outcome判未知结果，换成普通ActionError会丢失原回执，不能为清类而改这个IPC合同。现行plugin.capability_denied已在公开Plugin唯一错误声明中为invalid，无新alias、声明、factory、读取兼容或宽松异常映射；原条件、文案、SandboxError身份与outcome/默认状态保持。R-INSTALLED-OWNER-01：AST实际生产四点只改owner前缀，shared Sandbox runner已知拒绝/未知结果、installed-plugin-host真实停用/关闭/重启/模型声明与零业务效果相关回归保持，merge-base健康不增且该域wrong-owner清零。改名属机械代码归属修正，不新增仅测试包装的自证用例；Source与I8整建实际回归分记。


I30 3bc3ba3a6已独立Source接受，文档c82a96e61补两处Kernel缺稳定Session码；I31 93bdb31a7四文件29+/5-，Source MCP own/all0、API无变，初次91健康因旧CALL-CHAINS死引用失败、91b更正同片文档后通过（class28/shape0/owner7），独立复核在途。I32 installed-plugin-host单文件四码机械归属修正4+/4-：Source92 scoped1file0/all223（不是全Host0），API62/2410无变、健康通过class28/shape0/owner6。I32 parent04a已含I28但未纳I29–I31，因此该数字不可与另一Source的7直接当Root组合数；纳全片后再实量。Source parent含I26的误写已纠正。唯一87仍排A2，SDK新候选88尚未build/pack。


**维护八隔离演练（准备）。** 41库只读原克隆保持不写；从中仅对已核607映射实际命中的三个项目库另建可写临时演练副本，原Home仍不读写，Keychain/原调用日志不读。当前确定六个scalar旧码和一个source_fault JSON槽需要改名，十五个unknown scalar及另一个unknown JSON槽保持原样。演练只应用现有已核owner映射：检查真实SQLite失败回滚、合法更新、二次运行零修改，逐行对照目标表除既定字段外完全不变，逐表schema/行数及integrity保持。将“原只读克隆零写入”和“新演练副本七字段更新”分别记录；这是准备真实Home操作的证据，不是授权、同步备份或已维护真实Home。完整当前Source额外映射/部署后的窗口仍待另验与原待决。


维护八93实际演练成功：三个新临时可写副本分别1/4/2行，共七处（六scalar+一producer限定JSON），每库注入第一次更新后的失败都真实ROLLBACK恢复目标表；成功提交后逐行与仅错误槽变化的独立expected相等，schema/各非调用日志表行数/SQLite integrity保持；二次运行每库0变化。原Home0写、受保护只读克隆0写、Keychain与历史调用日志正文未读/改。未知十五scalar及一个JSON值由完整目标行对照证明未动。不是跨库同步快照、不是已维护真实Home；额外Source映射及部署后原窗口仍待最终决定/实核。I31/I32已独立Source接受，92 scoped0/all223和91/92不同分支wrong-owner数按各自上下文保留。


**Coding等待状态 I33（根因假设/准备）。** 79的B waits超时与现行startRound顺序存在明确交错：follow在两次await beforeWrite、await startDelegation和setState running/last-start存储之前启动；立即结束且已park的Run可能先写queued，迟到的发送回执随后改回running，同时wake可先读缺失origin_task。87仍待实际诊断trace，先在另一Source准备最小顺序修正，不能预记证实。R-CODING-RECEIPT-01：先完成原调用复查及running/last-start原收口，再启动activation follower；即时terminal/parked回执仍最终queued，wake原任务、重复唤醒/重启/撤回与cancel原断言保持；不延长超时、不给mock加延迟/跳过。R-CODING-RECEIPT-02：原取消/撤权/停用beforeEffect仍先于这些调用方记录，拒绝不写调用方偏好/起始状态；已接受的Run由activation独立跟踪其状态，Run事实仍由Agent owner；必须与17项真实Coding效果控制一起在新整体构建后验证。Root受测I8暂不改，直到87终结。


I33 Source候选已准备3+/1-：仅将同一follow移到原last-start写完后，并在原即时waitRun回归加验收编号注释。Source94 Coding自身0/all2（全程序两条未借用依赖不计全绿）、merge-base健康通过，API未改；不是Root I8当前改动，也不是87实际证实/运行通过。下一步87取状态trace后按原因裁决，再统一纳已接受I26–I32、main f6与新隔离SDK；遵守唯一构建队列，不重复启动。


I33首个fcd345dc3仅移末尾候选被Source复核拒绝P1：start成功后原收尾fence仍可拒绝，若直接末尾注册则后台跟踪丢失。已在同一Source将原post-start收口包try/finally，成功收口后或拒绝收口后才注册同一activation follower；原beforeWrite两栅栏、delegate顺序、调用方保存均保留。原coding-session-follow补cancel首栅栏与revoke第二栅栏两个真实router/SQLite交错，调用方拒绝/未写private起始偏好与running，activation仍须消费running→review→completed并发终态事件；原activation stop晚响应拒绝完整保留。94原类型/健康不能关闭这反例；修正后94c与新运行另计；94b修改脚本因重复变量SyntaxError未执行，无源码变化，其检查不计修正证据，仍不改受测Root I8。


I33最终674a8a321（含fcd的顺序候选修正）已独立Source接受：两post-start fence+原caller收口逐句保持，try/finally使已接受Run的activation跟踪不因caller拒绝而丢失；源类型94c自身0/all2与健康通过，实际message-wait/session-follow/effect矩阵仍未跑。原Src三片I29–32与补文档均Source接受。#495原6dd全部CI通过且固定head密钥扫描干净，但精确head合并被保护拒绝“未同步main”；未合入/未绕过保护，Root已expected_head update-branch，等新CI。下一受测组合须新main/新CU-image隔离SDK，而不是旧85。


**Source错误归属共同集成95。** 自有w3-binding另分支owner-convergence-source将已接受I26–I33串行纳为8c7d367e0，未触受测I8。实际health95对merge-base2768通过：28错误子类、0坏形状、0非owner错误码，当前声明57owner/62API文件2410项；原Source的7/6不是相加，现以共同实量0确认。Coding Source自身0/all2已展开核明：两条均来自未借用的design-system lucide依赖及其关联unknown类型，非新Coding错误，不能当全树类型0。Root新main整体工程仍待；未为等队列重复构建。#495新head9dff18ef9a567786b3a555f9a79b28f64cd9989b已有新CI在跑，原6dd通过不能替新head。


#495实际合入：2026-10-14T12:36:37Z，head9dff18ef9、merge9abcb963646c5964fae1b542a93de4de403734d4。同步main后新head五必需检查+Product实际SUCCESS，固定head本地scanner对f6f2 merge-base八新增行无secret；沿§1已记录原merge-seq门槛合并，Linux probe仍报告运行，不声称通过。没有admin、删除分支、修改原作者本地树或重启其会话。#489仍Pages唯一owner在途。Source95b补自有Source树缺失lucide依赖链接后，Coding/Goals/Kernel/MCP四包源码各own/all0；这是旧main2768分叉的已接受Source集成8c7d，不是Root I8最新main整建/最终全量。


**W4-11后续开工证据（只读准备，未实现）。** 当前storage/home-sqlite.ts仍19名PERSONAL_HOME_SQLITE_STORES，installer/uninstall.ts的purge另外手列projects/backups/logs/sessions/shelf/runtime目录；home-store-baselines测试又单独列18库基线，尚无共同全集。现行contracts/platform/plugin-database.ts已定义可信Host入口PluginDatabaseDeclaration（store_name/version/schema/read_permission/write_permission），plugin-platform与home-plugins从该入口提供database；Manifest和动作参数不能选择Home数据库。W4-11须复用这一信任边界，由storage提供通用登记/枚举、owner提供自身schema与位置，Host提供平台库/组合和真实Home，不能在storage import插件/Module实现或另造可让外部插件指定任意Home路径的Manifest入口。现有单库baseline拒错版、schema fixtures与已接受#20 purge全集决定保留；新登记实际接入baseline/purge/维护后才验收，W5-16一致快照仍需常驻Host协调暂停，不能把93的三个隔离副本演练称该功能。当前只完成必要路径读取，优先兑现已协调SDK88/I8验证窗口。


87真实终结：1条0pass/1fail/0skip，17.57秒；诊断B会话state=running但SDK的w1.state=waiting存在，与I33原顺序覆盖竞态一致，不能当修复后通过。已按精确备份恢复临时diagnostic test。新923+beforeAccept隔离SDK88实际build/tests/pack均0，11文件206/206且无类型错误，SHA256 317d097a1e44f84e501413283bdfa94c4b43ee4ac86a689957b9b83d2853597c，尚未正式上游/换vendor；已在候选具体可审后弹窗询问当前正式上游/换包/删旧vendor授权，未回复不依赖它执行。Root保存仅pkg1/lock5临时patch、恢复自身pkg/lock后merge main9ab，出现27冲突，I8仍merge进行中；96/97未启动，SDK短段已结束并释放名额，已协调Pages可先build/资源、共享全量再排。冲突须保main的AssistantOffers/shared-card新路径与状态展示，并保Root共同错误、原caller lifetime和单请求Helper/异步保存；不能整块ours/theirs或手合派生baseline/assets。


I8合9ab并串行纳已接受I26–I33后固定73d73c658，27冲突逐块裁定已解决。保main AssistantOffers/cardView/shared question/card路径，删除Root旧重复service helper，fail端口复用assistantErrors现行分类；question拒绝用details.errors，经统一requestError.body送字段提示。保Rootcomposer冻结intent/重试身份、完整failure诊断；stale card redo由main Host负责，原send-count按实际3→2而冻结body断言保留。状态环以原Root局部JS标识符映射main新片，保读失败/晚回执护栏；Goals SDK/design deps与lock/registry取并集。served-page-text为main唯一formatter；baseline/assets取main待真实整建派生，不手合。I8新临时SDK88脚本首尝试YAML quoted key锚点未命中，只写pkg；修quoted anchor后实际仅pkg1+/1-、lock5+/5-，无optional节点删除。整合只读再发现新main问题提交/redo的schedule/refresh与Root已定义poll/reload不符，已最小修正；Workflow新helper error状态环改failed，保存失败文案保留，真实拒绝/恢复路径需再验。新的96/97仍未开始，等待Pages15文件短回归释放名额。


**2026-10-14：当前CU-image同步接受检查正式换包与组合96。** 上游Prologue #20已推送，head4007a93c/baseb88，4文件47+/2-，密钥扫描47行无发现，独立源码复查无阻塞；当前上游确未配置GitHub Actions，不称远端CI通过。从该head干净git archive执行sdk-formal-acceptance90：offline安装、整体SDK build、公开API/控制五文件66/66、pack全退出0且无类型错误；产物1,123,719字节、SHA-256 317d097a1e44f84e501413283bdfa94c4b43ee4ac86a689957b9b83d2853597c，与88候选逐字节相同。Root按授权在9ed906929正式替换vendor、删除旧CU-image tgz和两来源文件；旧1,123,638字节/SHA b45753fa/gitBlob 0d38581afa4d457b1d1b540126571017dae6b7af/来源923e5a40已入历史记录。25个历史源码提交对上游main c5d35d7f实际逐项核祖先，只有08b和923两个过渡提交不在main，如实记录。96 actual install0/build1，仅main Offers抽离合并后的五个未使用import；后续未运行。028769de4删除这五import并修正式包引用为../../vendor（相对路径已实测存在）；96b当时install/build/根types/workspace-types/API/actions已退出0，健康/资源/边界仍运行、97/98未开始。新真实问卷纠错测试与Workflow CAS Ring断言已写入，98实际验证及整线§12.4仍待。原Home零写入。


**组合96b终态与96c重新冻结。** 96b九步中八步实际退出0，仅boundary退出1：登记表仍点旧CU-image文件名。不是资源、类型或错误owner失败。健康对main merge-base实测150巨大单元、496内部测试引用、0混源、28错误子类、0错误形状、0非owner码、57owner；29资源合计9,866,161字节，workbench1,100,249/pages48,801/editor707,935，均通过只降门禁。workbench比main只减471字节，不能作为Pages13,712字节的独立donor证明。82d8ff56a仅同步SDK登记文件名、提交这两份实测派生表，并补同一问卷用例最终正文DOM/无assistant-problem/原question-call tool_result精确答案断言。96c已冻结该head重跑，无新SDK版本或门禁阈值改动；96b不记全通过，97/98仍未运行。


**96c工程闭环（实际通过，非最终全量）。** frozen head82d8ff56a、比较main9abcb9636，offline/install、whole build、根types、workspace-types、API、actions、actual-base health、assets、boundary九步全部退出0；原始结果i8-joint-preflight96c-results.json与各96c日志已核，代码树clean。71包/1991源码/8501imports/246依赖边/61合同子路径，正式SDK路径与登记已通过边界，不再留下外部file临时例外。97已在该冻结head启动（25普通+2浏览器），98四文件随后，结果未归回不记通过。远端main随后核得774acaf57（#496 A2 shared question card，13:25:42Z合入，29文件与助理/Coding问卷路径有交集），本轮不取消或改树；须在结束后纳入新main，当前证据仍只支持9ab组合，不称最新main最终证明。


**97夹具死锁的实际处置（不记通过）。** 冻结82d8组合已开始实际Runtime回归，coding-effect-control的report cancel/revoke两项通过后，replace分支在原动作仍注册时重复registerProvider，被Kernel按原合同拒绝；异常绕过人为SDK-read屏障的release，30秒test timeout后的local.close又等待该operationTail，导致file子进程不结束。已只读核test62–65/Kernel重复注册拒绝，并sample确认该精确子进程26194事件等待（非忙循环）；核parent26129及准确文件后仅SIGTERM本人子进程，driver继续其余文件。该文件计失败，原日志和sample/处置记录保留。后续修fixture保存原disposer、先取definition再真实撤销/注册，finally释放屏障；不放宽Kernel、不改生产语义或跳过9种业务组合。当前受测树仍冻结，修复及重跑在97/98结束后进行。runtime97-head原base774a仅为共享tracking ref开始观察值，另记录实际sourceMergeBase9ab，测试未包含A2。


**97/98短段终态与后续修正（真实运行）。** 97普通实际188：183通过、4失败、1取消、0跳过（495393ms）；含被精确终止的effect-control文件失败，其他三Coding Runtime及Goal HTTP细项保原栈。97两文件浏览器2条：1通过1失败、0取消/跳过，Coding正常打开错误地等旧window=1，真实打开窗为6；effect事件仍1，不能全局替换。98生产Node/SDK11条：10通过1失败、0取消/跳过；W2-18-MODEL-SWITCH六种configuration/credential/actual SDK acceptance的取消/撤权全部通过，唯一独立问卷operate角色fixture未接审批入口。98四文件浏览器13条：11通过2失败、0取消/跳过；send-intent五条及Workflows五条（真实CAS failed→saved）全通过，两个失败为page-card旧CSS selector及choice tool_result错误期待type。真实问卷已走到最后形状断言，不能据此记case通过。Root已关闭原两session并明确释放名额，Pages后续短构建交由其原owner协调；没有Root新队列。2916f1bbe只修8个现行fixture/断言：真实注册disposer与finally/cleanup释放barrier、method_owner可信上下文、SDK问卷审批queue、confirmed plan真实revision显式传入并观察失败、Host共享卡run/dismiss、choice结果形状、Coding正常读取6而effect保1，以及Goal404原文案+call_id。原零副作用/持久化/重启/graph/report约束保留；这些修正尚未运行。正把远端774a A2纳入I8，有5处合并冲突，待逐项保留共同错误、共享interaction与新questionAnswer，不称新组合验证通过。


**774a A2合并源码完成，未运行。** Root 6b1dd019c合并远端774acaf57，29个主线文件保留。5冲突逐项裁决：HTTP用现行plugin-SDK questionAnswer但保assistantErrors.invalid与details.errors；island保frozen-send、沿main host.interaction不重复内嵌client；初始化共享interaction并保Root原api属性；健康/资源两派生表用main占位、待实测更新，不手合数字。无新运行或第二构建队列，当前构建窗口归Pages原owner。2916f1bbe的fixture修正及该合并须源核、整建、定向实跑后才验收；不能把96c的旧9ab证明称新774a证明。后台命令三失败继续独立定位，已确认method_owner缺失只解释state400、显式confirmed plan_revision缺失解释graph barrier超时，approval未出现尚未关闭。


**Runtime model请求真实字节的夹具诊断。** Source c761c7750已修两处mock的JSON.parse(String(init.body))：正式SDK的模型请求是TextEncoder生成的Uint8Array，Node-outbound原样交给fetch；String(Uint8Array)为逗号数字而非JSON。activation mock在第一个start-command返回之前即抛错，graph mock也会在补plan_revision后继续失败，因此两者改为真实string/Uint8Array解码，原消息/任务图/用户verdict和固定报告断言保留。这是独立于method_owner的另一项已确认夹具根因，不是生产SDK未发审批；当前尚未重跑。0c49dc10c另把I6 number题的min/max改为15/120数值，实际SDK约束只收finite number；保原逐题拒绝和有效45续跑断言。Source独立复查接受6b1的8fixture/A2生产冲突，无新增阻塞。Root下一99整体/100七普通+六浏览器只已准备、未排队；Pages现有owner正在其获分配的短窗口，结束明确释放后串行接续。Prologue #20已ready for review、仍open，六项正式SDK模型切换消费证明写入PR，不称其周边11项全过或上游CI存在。


**99已获串行窗口并冻结。** Pages原owner短构建/浏览器明确释放后，Root只启动既有99，Source c761c7750加Docs-only携唯一进度至1b782e042；实际包含main774a A2。源码/脚本/包/Skill冻结。新99开始，安装退出0，其余结果仍待；100七普通+六浏览器尚未开始，不重复已验send-intent/Workflow，也不据新Source猜通过。唯一SSOT开头已改已授权SDK/#20/正式换包，I8分支携带版同步，旧“等用户回答”不再作为当前决定。Pages51cbae80d已实际整建/boundary/health/逐项资源及其短回归通过的外线证据由其原owner保留，Root不累加成防腐整批。


**99当前组合工程闭环，100真实回归已开始。** 当前main774a A2与c761夹具修正的联合Source，在1b782e042切点实际offline安装、整体build、根/全workspace类型、API、动作快照、actual-base健康、资源、边界九项全部退出0。健康仍150巨大单元/496内部引用/0混源/28错误子类/0非owner码，资源逐项只降，Root只提交两份实测派生表至b66ad829a、clean。100已在该head冻结实际7普通+6浏览器，file secret backend、原整机构建/浏览器锁；当前未归回，不记通过。100后纳Pages已验候选7b6115153进入同一共享核心组合，只该组合再整建并冻结一次全量，33共同路径不预判33冲突；保真正的caller权限、HTML投影、冻结发送、Pages草稿及现行错误/库版本拒绝，派生数值仍重建后生成。当前没有第二份全量或Pages队列。


**100实际终态与101定向复验。** b66ad829a冻结组合实际7普通53条：51通过2失败0取消/跳过（125993ms）；6文件浏览器10/10通过0取消/跳过（60238ms）。I6真实number问卷错误/合法续跑、Coding九种取消/撤权/实际provider替换、后台命令read故障保原观察及恢复、激活无需页面的持久wait+四次连续owner read故障恢复（75491ms）均通过，Source判根因没有替代运行。两失败为fixture：observe终态不含异步补读的step_board，以及HTML settings路由先经web-goals-read共同403而非web-planning API400。9550194c6改为terminal后真实adapter.read取得图，原nodes/user verdict/immutable report/reopen断言保留；HTML仅改该403并断原code/reason/call_id，三个API400保留。已独立源核，101只选这两条实际失败复验，wrapper沿生产99构建与隔离Home，其他51普通/10浏览器保100有效证明，不相加宣称新整批或全量。101结果仍待。Pages最终7b6115153 clean、113文件，将在两条完成后纳同一联合分支；此时无第二份共享全量。


**共享核心联合合并的冻结合同（102，尚未验收）。** 101两实际失败2/2、0skip/cancel后，Root沿9550194c6合Pages7b611，14真实冲突已记录，不复制两份全量。保Pages评论/thread_source/retainAuthority/Host HTML投影及Root owner错误/冻住发送/caller最终检查。kernel新上下文只复用唯一effectGuard，不复写beforeEffect；保注册token/原撤权与取消的lease检查。Assistant异步检查串联base、线程caller及stillCurrent，最终同步base/assertSendCurrent均保留，不覆盖旧guard；thread角色/冻结材料/不读记忆随Pages保留。新线程复用既定assistant scope/state/stale/needs_check分类及同一owner工厂，缺授权端口authority与空回复empty_reply按原invalid条件登记；不复活AssistantError/AssistantStoreError/MemoryError重写。HTML运行/诊断仍共同request helper；代码/富文本只Host绘制，复制/折叠/审查绑定保留。Pages没有onComment的编辑器fallback复用showPop/原anchorPop与intact核对，新侧栏onComment路径保留；补现有真实浏览器fallback范围映射/换文档拒绝断言。只这些必要合并与验收，阈值/formatter/读历史兼容/真实Home操作不扩入。候选源核、整体新构建/派生表/交集短验与最终共享全量尚未开始，不称联合完成。


共享授权交点新增验收（102、未运行）：

- PAS-10 S-18-102-01：真实ActionService的retained guard在权限验证等待后重查原caller同步权限，拒绝Promise；start handler结束后guard仍可用而beforeEffect保持过期，注册替换/取消原断言保留。
- PAS-10 S-18-102-02：真实Host/Pages回复的最后一次权限等待中撤销原caller或替换writer，回复owner零写入；保fresh caller与retained同步断言，guard返回后继续等待不能绕过。
- PAS-10 S-18-102-03：复用真实thread work，SDK已接受run后reader等待时stop，放行后最终thread仍stopped、无迟到评论，accepted run被明确停止；原attempt/state尾检及CAS不覆盖停止。
- W2-18-PAGES-COMMENT-01：实际Chrome无onComment的编辑器评论弹层保映射锚点，只提交原range；换Doc后老按钮不写新文档。新侧栏onComment路径另沿原Pages真实回归。

同一Source实现：RetainedActionAuthority是临时callable+assertCurrent，不持久化、不增权限、不延长handler.beforeEffect；AssistantCaller新增可信同步assertBeforeStart，仅串联base/caller/stillCurrent最终检查。当前Root仍14冲突已去marker但尚未stage/commit，辅助代码与回归正补，未启动构建或全量。


**联合102源码合并与首轮实际构建。** 1ae8820cd已实际合Pages7b611至I8（14冲突的scoped remerge及新辅助文件/Caller尾检查已独立复查，无新增Source Blocker/P1），tree clean。保caller beforeStart/最终同步hook、retained callable+assertCurrent、线程状态尾检/CAS/stop收停、Host绘制及Root共同请求、frozen send、Pages普通评论映射锚点；84变更TS仅parse0，不称类型或Runtime通过。已有三个测试文件分别新增真实ActionService等权限后撤权/Promise拒绝，真实Host+SDK+Pages的reply末等待撤权/第二accepted run reader时stop，真实Chrome无onComment锚点移动/换Doc旧按钮拒绝。102 actual install0/build2，仅editor anchorPop返回null被新增port误写为undefined；其他检查未运行。98ecf5d04按现行null合同修正，Kernel手册写明retained断言须进入下游最后同步检查，S18与test:security加真实Thread回归；唯一102b冻结重跑，当前安装0、后续未归回，103/共同全量尚未开始。前次尝试生成补丁的exec JS SyntaxError在任何调用前发生，没有文件写入、不是生产失败。

**联合102b工程与103/104真实运行（替代前述“未运行”状态）。** Source98ecf5d04、派生快照提交ad0ca76fb，离线安装、全仓构建、root/工作区类型、API、动作快照、merge-base健康更新、资源更新、boundary九项实际全部exit0。当前150巨大单元、496测试内部引用、0混合进程、28错误子类、0错误码形状/归属缺陷；29资源9,616,239字节，每项只减。API仅retained callable/assertCurrent合同及其消费声明，动作快照未变。103普通11文件99=97通过2失败/42.053秒，浏览器6文件20=19通过1失败/154.513秒，均0取消/跳过；PAS-10 S-18-102-01/02/03实际通过。104同一冻结source Host HTML两文件5=4通过1失败/18.697秒，S-24四项通过。raw结果在Root临时目录i8-joint-preflight102b-results.json、i8-ordinary103.log、i8-browser103.log、i8-host-html104.log；没有重新启动Claude merge-daemon，未启动共同全量。

**四条实际失败的最小test-only修正。** MCP公共共同出口保code/isError/文案，字段由旧message改现行error；source检查从声明的esbuild browser入口计算相对模块图，再减去所有公共server出口及Host binding可达模块，仅不把browser-only裸Error称为HTTP500，其他错误类/mapper/裸owner码检查仍逐文件执行、共享/未引用模块继续受server检查。评论preview按生产collapsed caret设2和10，保原range映射、Prefix不纳入、换Doc老按钮零写入断言。Host review传输失败按唯一molisWorkRequest现行ui_host.outcome_unknown文案检查，保按钮恢复、真实reject零待办/approve一条待办等断言，不改生产出口。105错误出口整文件13/13通过、0取消/跳过、4.998秒；106只重验两个失败浏览器场景，结果待归回。已绿的103其余19浏览器不机械重跑。本次仅测试变更，不扩大门禁例外、阈值、模型主分支或真实Home授权。

**106/107终态与共享全量准备。** 106两条真实Chrome失败场景2/2、0取消/跳过、18.719秒，评论原范围映射/Prefix不纳入/换Doc老按钮零写入，以及Host流式阅读、代码精确复制、折叠、命名对象、review断连恢复与真实reject0/approve1均实际成立。新增最小临时模块图证实browser-only被识别、共享server导出与Host消费同模块不会被免除；107该定向、root tsc与merge-base health全部exit0，不放宽门禁。代码仍沿102b已构建source，随后仅三测试及唯一进度spec变更；不为test-only重新构建。Root将同步spec至I8并冻结head，唯一共享全量108持全机build/browser两个名额，结束前不改源码、脚本、package.json或skills。

**108已实际启动（进行中）。** c2017a9ac395ed34708b330ffc3100704a631e54为clean冻结头，生产仍为102b已构建的同一联合source；同步唯一spec后merge-base健康检查再次exit0，随后node scripts/./run-tests.mjs在同一build/browser锁下跑全量。当前日志已经报告新增失败，不能称全量通过：两条AgentBuilder测试仍用已退役构造入口，管理MCP README装配清单断言与取消在dispatch前的诊断结算链路已找到源码线索，其余浏览器/真实Host组合等待完整栈后裁决。此处只记录正在运行与已发现问题，不替代最终footer、基线比对或修复后验证；受测树源码/脚本/package/skills未修改。独立进度分支已机械同步main774a，diff仍只有此spec，Root全量树保持clean。

**109独立修复准备与进度PR归回（尚未运行）。** 108持续冻结c2017a9ac，独立109从main再ff该头，只由Root写入，未启第二构建/测试队列。e028ce555补调度前一次拒绝结算和取消命令声明-only命名，Root/协调只读源核接受；现有真实Host取消、等待中取消/open失败/close、原对象/编号、未知descriptor不泄另一项目标题与Runtime/Host snapshot/provider policy/handler五项零计数回归已准备，parse0不是类型或运行证明。随后23文件最小修正沿原合同：Builder和卡片owner入口、当前错误码/kind、MCP真实版本、编辑器边界stub及源码绑定名，保所有业务断言；Pages无pending null来源head按已接受W1-18-PIN-CURRENT生成第二版、保旧内容/各producer/person owner，正常三阶段pending恢复未改，删除陈旧说明。源核/22TS parse0与diff检查通过，正式构建/短验仍待108释放名额。#490 exact655866561全部七CI通过后于2026-10-14T16:57:16Z合入main cbbeada4e；该PR只补唯一spec，不能宣告候选代码已合入或整线完成。

**暂停交接（2026-10-14T17:15Z）。** 用户明确暂停本线；新的修改、构建、验证排队与推送/合并均已停止。108原冻结树c201 clean、session6308仍跑完整回归，driver只有health→full两步，无自动后续任务；结果须恢复时先查原state/footer，不重复启动。109 HEAD39bfa481c仅保留pages-publication/ppt-mcp/project-deletion-service三文件未提交22+/10-，已交统筹汇入单份handoff；没有109构建或测试已排队。之后按用户明确恢复再推进§10.10、108失败裁决与原RAC/W4–6，不把暂停当完成。
