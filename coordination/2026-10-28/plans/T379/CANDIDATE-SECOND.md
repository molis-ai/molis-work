# T379 四文件候选独立二审

**结论：源码/测试候选二审通过，未发现必须修改的产品代码或测试问题；目前尚不具备最终合入条件。** 有限搜索组合、两种owner路径、来源/可见性与消费/终端边界符合accepted WO。资源门禁仍明确失败，共享README/S-30仍未采用；独立验证、最终产物实操、准确组合CI/Full等由根继续核收，不以本次二审代签。

负责人：Codex二审线4，Sol。本线只读实际差异、必要依赖及作者原件，未跑测试/Full/build/浏览器、未重审scene7移动/权限/落盘主链、未改源码/GH/coord/refs；仅写本报告。作者执行与本线核读分开记。

## 1. 准确对象与范围

- 唯一需求书：mw-coord `coordination/2026-10-28/tasks/T-379.md`，含审书两项修订与根00:35Z派单/锁边界。
- B=`b6f92222fce89dfba756a580768889292cfe9967`。
- H=`ea67075d13fde5353651645a4599bdf0ee5c4e1e`，tree=`24bf45d51a00cd215321e966946fae3c5965d3c7`，唯一父提交为B。
- `/private/tmp/t379-dev`回读HEAD=H、工作树干净；主检出08c9933保持干净，未切换。
- B→H准确只含navigation.ts、side-panel.ts及两个指定浏览器测试，143增/2删；与 [candidate.patch](/private/tmp/t379-evidence/candidate.patch) 逐字节相同，binding.json四个blob均与Git重取H相同。未进入条件释放的parent/types/initialization、公共test-kit、Todo或资源/共享文档。

## 2. 必须修改问题

**当前源码/测试必修：无。** 未发现需要新增热键框架、第二份来源解析器、私有Todo接线或风格重构的理由。

交接元数据有一个必须保留的解释边界：green/required原result里的HEAD仍是B，`files`两项也仍列B的生产blob，不是最终H的文件映射。它们不能直接证明“当时checkout H”或被静默改写。作者报告已说明B+dirty运行，但最终采用材料还应连同这一旧files字段口径说明；原件不改，核抵依据见第4节。本报告已明确该事实，不以它要求重复构建/测试或新增状态系统。

## 3. 生产行为及测试区分力

| 范围 | 二审核对 |
| --- | --- |
| 有限组合与主区入口 | navigation.ts:9–10仍从可信owner读取原声明工具键，仅在owner有`[data-global-search-dialog]`时追加Mod+K/F。无搜索页不获这两键；未接child自报名单。parent保留原MessagePort/visible scope与同份名单，`shortcuts.includes`严格相等，非字符串/不在名单的消息不会生成键盘事件。原主区relay仍到现有shell handler，未伪造isTrusted、未改K toggle/F open-focus。 |
| child边界 | :44–50仍是window bubble；先拒repeat/composing/defaultPrevented，随后只对K/F按原`[data-tui-pane],.xterm`排除。普通notes/textarea可搜索；没有把全部编辑区排除。终端判断发生在原目标尚在child的时候，避免relay到window后丢掉终端归属。factory与bridge顺序未改。 |
| 嵌套侧栏来源/可见性 | side-panel.ts:202先查origin，:208只允许两条精确搜索字符串；:209复用forwarded.from，即SIDE_FRAME_FROM_SCRIPT，actual event.source须匹配当前DOM中的侧栏frame.contentWindow。:210再核open、body=current、无hidden/inert祖先及checkVisibility(CSS visibility/布局)。卸载后的frame不在查询中；不信payload身份/visible。通过后仅发一次shell keydown，未先keyed再搜索。 |
| Issue与discussion | 非搜索键仍走原keyed分支，未把仅识别data-side-frame的helper套到discussion工具键，未改homeToolKeysScript。原ISSUE-35两测试内容保留，完整绿日志包括主区、其它side view、自身composer收起及discussion召回。没有将Issue声明键改成搜索或点按钮。 |
| RAC-2800先红/恢复 | 新测试真实Host/项目/Todo生产opaque frame，直接点notes再发CDP keyDown/up，无shellFocus/open()成功旁路。document bubble记录位于window bridge前、最终window记录在bridge后；B原生日志两处均false、trusted=true/notes/focused、非组合重复终端，独立oracle失败为open=false/focused=false。H路径相同oracle成功，bridge后prevented=true是正确预期，已修审书消费判据。K再次关闭、F打开/再聚焦、Escape、notes和URL保留有断言。 |
| RAC-2801嵌套正面 | 真Issue composer原生K/F到顶层同一dialog；测试读实际来源identity/origin/connected/current可见body，等候后仍打开，检出双发开又关；原frame和未提交草稿保留、可继续输入。没有以协议探针冒充原生正例。 |
| RAC-2802负面 | 插件已消费负例在document bubble明确先preventDefault并记isTrusted，生产window桥不应再开搜索。终端textarea DOM fixture用原生K/F验证原selector；repeat/composing为明示的局部合成状态探针。来源探针调用实际shell listener，涵盖非法chord、错origin、无关window、hidden/CSS-hidden/inert/non-current/closed/detached frame；不是仅测helper返回值。 |
| RAC-2803旧回归 | 两份原测试文件旧行/断言都保留，未改成skip/点按钮；作者完整文件结果是global UI 4/4、Issue 3/3，其中原键盘选择/touch dismiss和原ISSUE-35均实际出现在日志。 |

测试对期望dialog.open/inputFocused、草稿和来源事实作独立断言，不从快捷键名单反算成功。红例确实打在生产缺口，非驱动未送达。无需为本单再造mutation矩阵。原生日志是Darwin上的Meta输入；Ctrl共用现行`metaKey || ctrlKey`归一化代码，未将本次称作跨平台Ctrl原生实跑。

## 4. 作者原件核抵与实际绑定

已完整读 [red.log](/private/tmp/t379-evidence/execution/red.log)、[green.log](/private/tmp/t379-evidence/execution/green.log)、[required.log](/private/tmp/t379-evidence/execution/required.log)及对应result、构建/门禁原件和run-stage.py：

- 先红完整global-ui文件：3 pass/1预期失败，零skip；B生产未改，before-red.patch仅两测试差异。主区新增测试的blob已与H相同，因此先红不是另造较弱oracle。
- 最终两完整文件：7/7，零fail/skip/cancel/todo，jobs1/retries0/verbose；晚加的non-current-body探针在最终候选内，作者最终运行声明与最终完整日志对应，未将早先initial绿计第二遍。
- README要求18文件及UI基础10文件，独立按H README提取并与required命令逐项比较，28/28准确；原日志逐case汇总188/188、零fail/skip/cancel/todo。条件性的其它包内要求未在未触及时无故扩跑。7与188为两个不重叠文件集，均保留作者来源，不计为本线195执行。
- 运行时准确状态为**B+dirty四文件**，不是H checkout。green/required记录的生产source digest均为`a2941a4c5fe77dfc5bfdc50232e92a25daca9269a30df733f4905e108b9a4b59`；当前干净H的保留构建manifest也为该值。为避开旧files映射误导，本线按H的fingerprint.ts输入/排序/路径/模式/内容规则**纯读取重新计算**保留树生产摘要，得到同一值；同时独立核candidate.patch精确对应H。这是绑定核对，不是重新运行构建或产品测试。该指纹不覆盖tests，不能把它单独当作每项测试字节的运行时快照；测试来源仍为保存的补丁、最终文件、作者声明和完整日志，独立验证由VERIFY3另证。
- 作者baseline/final整体build均有原件；最终manifest生成于`2026-11-01T00:45:23.708Z`，后续tests/gates使用匹配digest。boundary errors=[]、health against B通过。测试使用公共槽、隔离Home/file secrets、专用测试Chrome；没有本线新执行，历史红与作者途中initial运行不被清零或累计成最终测试数。

## 5. 资源必要性与共享文档

资源**尚未通过，不得报告全门禁绿**：[assets.log](/private/tmp/t379-evidence/execution/assets.log)在workspace build/verify后因以下两项增长exit1。独立解析 [before](/private/tmp/t379-evidence/served-before.json)/[after](/private/tmp/t379-evidence/served-after.json)，B实测精确等于B预算，H对应实测仍为48项/同一键集合、discoveryMisses=[]：

| served资产 | B | 候选实测 | 增量 |
| --- | ---: | ---: | ---: |
| /assets/molis-work-plugin-frame.js | 190838 | 191017 | +179B |
| /assets/molis-work-workbench.js | 1150072 | 1150432 | +360B |

其余46项逐字节数不变，总+539B，无新增资源。源码复用已有名单/MessagePort/helper/全局搜索处理器；新增内容分别承担两键声明、终端排除及侧栏实际来源/当前可见性判断，具有本次行为必需性。作者说明省量取舍是源码层判断，没有冒称另行构建过更小版本。本线接受这组小幅必要增长的技术理由；不要求借无关删减、换minifier或挪inline抵销。**本报告不授予资源许可，也不预冻结未来main上的tuple。** 等T208→T362窗口根交接后，在实际采用base上重新测量、审核精确许可/预算并通过served gate。

[shared-docs-candidate.patch](/private/tmp/t379-evidence/shared-docs-candidate.patch)在实现树外：README新增一个对应不变量；S-30只插入两搜索键的真实侧栏来源/可见性说明和Issue测试引用。本线将新增句及引用移除后比原S-30，原行完全相同，无其它安全条款变动。措辞与候选实现一致，未把旧工具键通道描述成所有消息都执行新搜索校验；未改变公共合同。可以作为根串行采用的最小配套文字，不能宣称H已含README/S-30修改；应用到届时目标行还需保留别人的已采用变更。

## 6. 可合条件与保留边界

没有发现需先返DEV4修源码/测试的事项。根后续至少需完成：

1. 独立VERIFY3按冻结候选核核心原生输入、拒绝及最终产物UI路径；真实既有终端路径按WO单列。作者DOM终端fixture只证明目标识别，未当作真实terminal/Agent运行。
2. 串行采用README与S-30配套、资源窗口中的准确许可/预算及served通过；这些尚未进入四文件H。当前增长必须保留为门禁失败，不能用health通过覆盖。
3. 如吸收实际main或配套/资源形成新头，核差集与已有证据可沿用范围，完成准确头Verify、所需SI、full=true的CI Full及根采用条件；本地不Full。当前无这些终态结论。

原scene7移动/权限/落盘主链不在本次重审范围，仍绑定原E；本修复不倒填step041缺失字段、不把shellFocus绕行写成已修复。RAC-11、整条W6、最终App/用户验收均未由本报告签完成。

— Codex，T379独立二审，2026-10-31（Sol）
